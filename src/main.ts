import { Actor } from 'apify';
import { CheerioCrawler, Dataset, EnqueueStrategy, useState } from 'crawlee';

interface Input {
    shopUrls: string[];
    maxShopReviews: number;
}

interface Review {
    shopName: string;
    author: string;
    reviewAt?: string;
    recommendation: string;
    rating?: string;
    pros?: string[];
    cons?: string[];
    summary?: string;
    shopReply?: string;
}

await Actor.init();

// register event listeners FIRST
// - ideally: immediately after Actor.init()
// - At minimum: before crawler.run()
Actor.on('migrating', async () => {
    await Actor.reboot();
});

const { shopUrls, maxShopReviews } = (await Actor.getInput<Input>()) ?? ({} as Input);

const proxyConfiguration = await Actor.createProxyConfiguration();

type scrapedReviewsPerShop = Record<string, number>;

const crawler = new CheerioCrawler({
    proxyConfiguration,
    sameDomainDelaySecs: 2, // to prevent creating unnecessary load on target web
    requestHandler: async ({ enqueueLinks, request, $, log }) => {
        const shopName = $('h1.c-shop-detail-header__logo.e-heading > a > img').attr('alt') || 'Unknown shop';

        const state = await useState<{ scrapedReviewsPerShop: scrapedReviewsPerShop }>('STATE', {
            scrapedReviewsPerShop: {},
        });

        let pageReviews: Review[] = [];

        const reviewsContainer = $('ul.c-box-list.o-wrapper__overflowing\\@lteLine.js-pagination__content');
        reviewsContainer.find('li.c-box-list__item.c-post').each((_, element) => {
            const reviewElement = $(element);

            const author = reviewElement
                .find('.c-post__author')
                .find('svg')
                .remove()
                .end()
                .text()
                .replace(/\u00a0/g, ' ')
                .trim();

            const reviewAt = reviewElement.find('.c-post__time-shop > time.c-post__publish-time').attr('datetime');
            const recommendation = reviewElement.find('.c-post__recommendation').text().trim();
            const rating = reviewElement.find('.c-rating-widget').attr('data-rating');
            const summary = reviewElement.find('p.c-post__summary').text().trim();

            const pros: string[] = [];

            const prosContainer = reviewElement.find(
                'ul.c-attributes-list.c-attributes-list--pros.c-attributes-list--circle.o-block-list.o-block-list--snug',
            );

            prosContainer.find('li.c-attributes-list__item').each((_idx, el) => {
                pros.push($(el).text().trim());
            });

            const cons: string[] = [];

            const consContainer = reviewElement.find(
                'ul.c-attributes-list.c-attributes-list--cons.c-attributes-list--circle.o-block-list.o-block-list--snug',
            );

            consContainer.find('li.c-attributes-list__item').each((_idx, el) => {
                cons.push($(el).text().trim());
            });

            const shopReply = reviewElement.find('.c-post-response > p').text().trim();

            const pageReview: Review = {
                shopName,
                author,
                reviewAt,
                recommendation,
                rating,
                pros,
                cons,
                summary,
                shopReply,
            };

            pageReviews.push(pageReview);
        });

        const reviewsNeeded = maxShopReviews - (state.scrapedReviewsPerShop[shopName] || 0);
        pageReviews = pageReviews.slice(0, reviewsNeeded);

        if (pageReviews.length > 0) {
            // update state must be before pushData to prevent race condition
            state.scrapedReviewsPerShop[shopName] = (state.scrapedReviewsPerShop[shopName] || 0) + pageReviews.length;

            await Dataset.pushData(pageReviews);

            log.info(
                `Successfully saved ${state.scrapedReviewsPerShop[shopName]}/${maxShopReviews} reviews from page ${request.url}`,
            );
        } else {
            log.info(`No reviews found on page ${request.url}`);
        }

        // stop processing new pages when reviews limit is reached
        if (state.scrapedReviewsPerShop[shopName] < maxShopReviews) {
            await enqueueLinks({
                strategy: EnqueueStrategy.SameDomain,
                selector: 'a.c-pagination__controls[rel="next"]',
                regexps: [/\?f=\d+#filtr/],
            });
        }
    },
});

await crawler.run(shopUrls);

await Actor.exit();
