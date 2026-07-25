# Harvester Turtle

Harvester Turtle is a static, browser-based portfolio calculator derived only from the first sheet of `Harvester Trutle.xlsx`. It supports optional live prices, local saving, and JSON import/export.

## Calculation rules

For each stock:

- `shares = amount invested / buy price`
- `profit = current value - total invested`
- `goal profit = total invested × growth goal`
- `minimum-profit requirement = minimum harvest cash / harvest percentage`
- `required profit = max(goal profit, minimum-profit requirement)`
- `harvest price = (total invested + required profit) / total shares`
- `harvest cash = current profit × harvest percentage`, but only when current profit reaches required profit
- `shares to sell = harvest cash / current price`

This reconciles the workbook's Growth Goal with its original minimum-harvest formula. Both conditions must be met before the app shows a harvest.

## Run

Open `index.html` in a modern browser. No build step is required.

## Live prices

Deploy `cloudflare-worker/worker.js` as a Cloudflare Worker and add an encrypted secret named `TWELVE_DATA_API_KEY`. Then enter the Worker URL under **Price Settings**.

## GitHub Pages

Upload all project files to the repository root, keeping the `cloudflare-worker` folder. GitHub Pages can serve the app directly from the main branch.

Portfolio data and the Worker URL are stored in browser local storage. The Twelve Data key remains in Cloudflare.

This app is educational and is not financial advice.
