# heureka-shop-reviews

This is an Apify actor that scrapes shop reviews from shop details page at Heureka.

Principles:

- actor never leaves Heureka web
- actor never follow so-called "exit links"

## Local Development

0. Prerequisites: `npm` and `apify-cli`

1. Install dependencies

    ```bash
    npm install
    ```

2. Serve test data at `http://localhost:3000`

    ```bash
    npm run fake
    ```

3. Update local config

    ```bash
    mkdir -p storage/key_value_stores/default
    echo '{"shopUrl": "http://localhost:3000","maxRequestsPerCrawl": 2}' > storage/key_value_stores/default/INPUT.json
    ```

4. Run locally

    ```bash
    apify run --purge
    ```

5. Check results at `storage/datasets/default/`

## Spec

### Input

| Name | Type | Example | Description |
|---|---|---|---|
| shopUrl | `string` | http://localhost:3000 | Shop details page at Heureka |
| maxRequestsPerCrawl | `int` | 2 | Maximum number of pages that the crawler will open |

### Output
| Name | Type | Example | Description |
|---|---|---|---|
| author | `string` | Ověřený zákazník John | Reviewer name |
| reviewAt | `string` | 2025-08-08 12:56:28 | Review time |
| recommendation | `string` | Doporučuje obchod | Whether reviewer can recommend shop or not |
| rating | `string` | 6 | Review rating (0-10) |
| pros | `string[]` | ["Delivery", "Prices"] | Positive sides |
| cons | `string[]` | ["There are no dog food"] | Negative sides |
| summary | `string` | Rychlý, bezproblémový nákup | Review summary |
| shopReply | `string` | Dobrý den, děkuji Vám za Vaši recenzi | Shop reaction on review |
