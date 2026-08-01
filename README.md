# Harvester Turtle

Harvester Turtle is a static, browser-based portfolio calculator derived only from the first sheet of `Harvester Trutle.xlsx`. It supports optional live prices, secure Cloudflare D1 portfolio sync, local offline saving, and JSON import/export.

## Calculation rules

For each stock:

- `shares = amount invested / buy price`
- `profit = current value - total invested`
- `goal profit = total invested × growth goal`
- `minimum-profit requirement = minimum harvest cash / harvest percentage`
- `required profit = max(goal profit, minimum-profit requirement)`
- `harvest price = (total invested + required profit) / total shares`
- `harvest cash = current profit × harvest percentage`, but only when current profit reaches required profit
This reconciles the workbook's Growth Goal with its original minimum-harvest formula. Both conditions must be met before the app shows a harvest.

## Run

Open `index.html` in a modern browser. No build step is required.

## Live prices

Deploy `cloudflare-worker/worker.js` as a Cloudflare Worker and add an encrypted secret named `TWELVE_DATA_API_KEY`. Then enter the Worker URL under **Price Settings**.

Prices update once when the page opens. Refresh the page to request new prices; there is no repeating timer. A progress bar shows how many symbols have completed, including while large portfolios pause between free-plan batches.

## GitHub Pages

Upload all project files to the repository root, keeping the `cloudflare-worker` folder. GitHub Pages can serve the app directly from the main branch.

Portfolio data is synchronized through a protected Cloudflare Worker into D1 when configured, with browser local storage as an offline fallback. The Twelve Data key and the master sync key remain encrypted secrets in Cloudflare; each device stores only the Worker URL and its entered sync key locally. See `SETUP-INSTRUCTIONS.txt` for setup.

This app is educational and is not financial advice.
