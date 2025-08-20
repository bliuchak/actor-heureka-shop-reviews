import { Actor } from 'apify';
import { EnqueueStrategy, PlaywrightCrawler, useState } from 'crawlee';

interface Input {
    shopUrls: string[];
    maxShopReviews: number;
    proxyGroups?: string[];
    proxyCountry?: string;
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

const { shopUrls, maxShopReviews, proxyGroups, proxyCountry } = (await Actor.getInput<Input>()) ?? ({} as Input);

const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: proxyGroups,
    countryCode: proxyCountry,
});

type scrapedReviewsPerShop = Record<string, number>;

// maxConcurrency is a debug config for internal usage (default set to 1)
const maxConcurrency = parseInt(process.env.ACTOR_MAX_CONCURRENCY || '1', 10);

const crawler = new PlaywrightCrawler({
    maxConcurrency,
    proxyConfiguration,
    launchContext: {
        launchOptions: {
            headless: true,
        },
    },
    async requestHandler({ request, log, page, enqueueLinks }) {
        const shopName = await page.$eval(
            'h1.c-shop-detail-header__logo.e-heading > a > img',
            (img) => img.getAttribute('alt') || 'Unknown shop',
        );

        const state = await useState<{ scrapedReviewsPerShop: scrapedReviewsPerShop }>('STATE', {
            scrapedReviewsPerShop: {},
        });

        let pageReviews: Review[] = await page.$$eval(
            'ul.c-box-list.o-wrapper__overflowing\\@lteLine.js-pagination__content li.c-box-list__item.c-post',
            (reviewElements, currentShopName) => {
                return reviewElements.map((reviewElement) => {
                    // Get author text, removing SVG content
                    const authorElement = reviewElement.querySelector('.c-post__author');
                    const svgElement = authorElement?.querySelector('svg');
                    if (svgElement) svgElement.remove();
                    const author = authorElement?.textContent?.replace(/\u00a0/g, ' ').trim() || '';

                    // Get review date
                    const reviewAt =
                        reviewElement
                            .querySelector('.c-post__time-shop > time.c-post__publish-time')
                            ?.getAttribute('datetime') || undefined;

                    // Get recommendation text
                    const recommendation =
                        reviewElement.querySelector('.c-post__recommendation')?.textContent?.trim() || '';

                    // Get rating
                    const rating =
                        reviewElement.querySelector('.c-rating-widget')?.getAttribute('data-rating') || undefined;

                    // Get summary
                    const summary = reviewElement.querySelector('p.c-post__summary')?.textContent?.trim() || undefined;

                    // Get pros
                    const prosElements = reviewElement.querySelectorAll(
                        'ul.c-attributes-list.c-attributes-list--pros.c-attributes-list--circle.o-block-list.o-block-list--snug li.c-attributes-list__item',
                    );
                    const pros: string[] = Array.from(prosElements)
                        .map((el) => el.textContent?.trim() || '')
                        .filter((text) => text);

                    // Get cons
                    const consElements = reviewElement.querySelectorAll(
                        'ul.c-attributes-list.c-attributes-list--cons.c-attributes-list--circle.o-block-list.o-block-list--snug li.c-attributes-list__item',
                    );
                    const cons: string[] = Array.from(consElements)
                        .map((el) => el.textContent?.trim() || '')
                        .filter((text) => text);

                    // Get shop reply
                    const shopReply =
                        reviewElement.querySelector('.c-post-response > p')?.textContent?.trim() || undefined;

                    return {
                        shopName: currentShopName,
                        author,
                        reviewAt,
                        recommendation,
                        rating,
                        pros: pros.length > 0 ? pros : undefined,
                        cons: cons.length > 0 ? cons : undefined,
                        summary,
                        shopReply,
                    };
                });
            },
            shopName,
        );

        const reviewsNeeded = maxShopReviews - (state.scrapedReviewsPerShop[shopName] || 0);
        pageReviews = pageReviews.slice(0, reviewsNeeded);

        if (pageReviews.length > 0) {
            // update state must be before pushData to prevent race condition
            state.scrapedReviewsPerShop[shopName] = (state.scrapedReviewsPerShop[shopName] || 0) + pageReviews.length;

            await Actor.pushData(pageReviews);

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

crawler.log.debug('Config', { shopUrls, proxy: { proxyGroups, proxyCountry }, concurrency: { maxConcurrency } });

await crawler.run(shopUrls);

await Actor.exit();
