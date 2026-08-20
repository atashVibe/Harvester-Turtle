# Harvester Turtle

Harvester Turtle is a build-free, phone-friendly portfolio and trade tracker. It saves locally in the browser, can optionally sync through Cloudflare D1, and uses Twelve Data for manual market refreshes.

## What it tracks

- Stocks added through the app menu.
- Executed buys and sells with shares, execution price, date/time, and notes.
- Deposits and total deposited cash.
- Pending limit buys and sells, kept separate from executed trades.
- FIFO cost basis, including partial-lot sales.
- Average open cost, realized profit, realized loss, estimated tax, and Final Harvest.
- The latest current price, previous close, and High/Low across 15 daily market bars.

## Important rules

- Pending limits do not change shares or realized profit/loss until **Mark Filled** is used.
- Pending limit buys are included as committed money in Invested Amount.
- Executed sales consume the oldest available purchase shares first.
- Estimated tax defaults to `max(net realized gain, 0) × 30%`. The percentage is configurable and is only a planning estimate, not tax advice.
- `Final Harvest = realized profit - realized loss - estimated tax`.
- `Harvest Price = Average Price × (1 + Growth Goal)`. It does not change when Invested Amount changes.
- Harvest Cash appears only when the current price reaches Harvest Price and the calculated harvest meets Min. Cash.
- Robinhood CSV import accepts the standard nine activity-report columns, merges Buy, Sell, and positive ACH deposit rows, and skips activity already imported. Unsupported activity is reported without changing it.
- Robinhood CSV export uses the same nine-column layout. Pending limits and migrated opening balances stay in the complete JSON backup instead of being represented as completed Robinhood activity.

Existing browser data is migrated automatically. Before migration, the previous local-storage values are retained in a recovery record. Existing manual holdings become Opening position lots so their cost basis is preserved for future FIFO sales.

## Price refresh and limits

Prices never refresh automatically. The top **Refresh** button uses a configurable local daily allowance and displays the remaining refresh actions.

The Worker prefers one Twelve Data credit per symbol:

- On the first request, a 16-bar daily time series supplies current/previous prices and the 15-bar range.
- The historical range is cached for six hours.
- While that cache is valid, a quote request updates the current price without buying the history again.
- Provider credit headers are returned when Twelve Data supplies them, so the app can display the provider's remaining short-term credits.

The compact portfolio table keeps the existing sortable headings, left-to-right keyboard/phone field navigation, frozen Stock column, floating headings, desktop left/right controls, and phone swipe navigation.

## Run and test

Open `index.html` in a modern browser. There is no build step.

Run the tests with:

```text
node --test calculator.test.js trade-calculator.test.js robinhood-csv.test.js cloudflare-worker/worker.test.mjs
```

## Cloudflare and GitHub Pages

Deploy `cloudflare-worker/worker.js`, bind the D1 database as `DB`, and configure encrypted `TWELVE_DATA_API_KEY` and `PORTFOLIO_SYNC_KEY` secrets. Then enter the Worker URL and optional sync key under **Price & App Settings**.

GitHub Pages can serve the repository root directly. See `SETUP-INSTRUCTIONS.txt` for the complete setup.

Harvester Turtle is educational software and is not financial or tax advice.
