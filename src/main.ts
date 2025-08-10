import { Actor } from 'apify';
import { CheerioCrawler, Dataset, EnqueueStrategy } from 'crawlee';

interface Input {
    shopUrl: string;
    maxRequestsPerCrawl: number;
}

interface Output {
    author: string,
    reviewAt?: string,
    recommendation: string,
    rating?: string,
    pros?: string[],
    cons?: string[],
    summary?: string
    shopReply?: {
        title: string,
        body: string
    } | null
}

await Actor.init();

const { shopUrl = 'https://obchody.heureka.cz/kaufland-cz/recenze/', maxRequestsPerCrawl = 1 } =
    (await Actor.getInput<Input>()) ?? ({} as Input);

const proxyConfiguration = await Actor.createProxyConfiguration();

const crawler = new CheerioCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl,
    sameDomainDelaySecs: 2,
    requestHandler: async ({ enqueueLinks, request, $, log }) => {
        const currentActivePage = $('li > span.c-pagination__link.is-active').text().trim()
        log.info(`URL: ${request.url}, page: ${currentActivePage}`);

        await enqueueLinks({
            strategy: EnqueueStrategy.SameDomain,
            selector: 'a.c-pagination__link',
            globs: [`${shopUrl}?f=*#filtr`],
        });

        let results: Output[] = [];

        const reviewsContainer = $('ul.c-box-list.o-wrapper__overflowing\\@lteLine.js-pagination__content');
        reviewsContainer.find('li.c-box-list__item.c-post').each((_, element) => {
            const reviewElement = $(element);

            const author = reviewElement.find('.c-post__author').find('svg').remove().end().text().replace(/\u00a0/g, ' ').trim();
            const reviewAt = reviewElement.find('.c-post__time-shop > time.c-post__publish-time').attr('datetime');
            const recommendation = reviewElement.find('.c-post__recommendation').text().trim();
            const rating = reviewElement.find('.c-rating-widget').attr('data-rating');
            const summary = reviewElement.find('p.c-post__summary').text().trim();

            let pros: string[] = []

            const prosContainer = reviewElement.find('ul.c-attributes-list.c-attributes-list--pros.c-attributes-list--circle.o-block-list.o-block-list--snug');
            prosContainer.find('li.c-attributes-list__item').each((_, element) => {
                pros.push($(element).text().trim());
            });

            let cons: string[] = []

            const consContainer = reviewElement.find('ul.c-attributes-list.c-attributes-list--cons.c-attributes-list--circle.o-block-list.o-block-list--snug');
            consContainer.find('li.c-attributes-list__item').each((_, element) => {
                cons.push($(element).text().trim());
            });

            const title = reviewElement.find('.c-post-response > h3.c-post-response__heading.e-heading > span').text().trim();
            const body = reviewElement.find('.c-post-response > p').text().trim();

            const shopReply = (title || body) ? { title, body } : null

            results.push({author, reviewAt, recommendation, rating, pros, cons, summary, shopReply});
        });

        if (results.length > 0) {
            await Dataset.pushData(results);
            log.info(`Successfully saved ${results.length} reviews from page ${currentActivePage}`);
        } else {
            log.info(`No reviews found on page ${currentActivePage}`);
        }
    },
});

await crawler.run([shopUrl]);

await Actor.exit();
