# Harvester Turtle

Harvester Turtle is a static, browser-based portfolio calculator derived only from the first sheet of `Harvester Trutle.xlsx`. It supports optional live prices, secure Cloudflare D1 portfolio sync, local offline saving, and JSON import/export.

## Calculation rules

For each stock:

- `shares = amount invested / buy price`
- `profit = current value - total invested`
- `harvested price = bought price × (1 + growth goal)`
- `potential harvest cash = current profit × harvest percentage`
- `harvest cash = potential harvest cash` only when current price reaches harvested price and potential harvest cash reaches the user-entered minimum cash

Harvested Price depends on Bought Price and Growth Goal, not Invested Amount. Invested Amount still determines Shares, Profit, and the actual Harvest Cash. Both the price goal and minimum-cash condition must be met before the app shows a harvest.

The compact table uses centered two-line headings, 11-pixel heading and value text, minimal column spacing, and bold stock symbols. It begins with Stock, Current Price, Bought Price, Invested Amount, Shares, Harvested Price, Harvest Cash, and Growth Goal, followed by the remaining calculation and signal columns. Current Price, Bought Price, Invested Amount, Harvested Price, and Growth Goal place the descriptive measurement and its unit together on the second line.

When the table is wider than the browser, desktop users can move across it with the visible left/right buttons and horizontal slider above the table. Holding Shift while using the mouse wheel also scrolls horizontally. Touchscreen sideways scrolling remains available.

When the table is taller than the browser, it uses its own vertical scrolling area and keeps the column-heading row frozen at the top.

Rows start sorted alphabetically by stock symbol. Click any data-column heading to sort ascending, then click it again to sort descending. The active heading shows the direction with an arrow. Sorting changes only the displayed row order and does not change the saved portfolio.

Shares display with exactly two decimal places, while calculations retain the full-precision share value.

The three recommendation lights are positioned immediately to the left of each bold stock symbol.

## Run

Open `index.html` in a modern browser. No build step is required.

## Live prices

Deploy `cloudflare-worker/worker.js` as a Cloudflare Worker and add an encrypted secret named `TWELVE_DATA_API_KEY`. Then enter the Worker URL under **Price Settings**.

Prices update once when the page opens. Refresh the page to request new prices; there is no repeating timer. Up to eight symbols are requested concurrently. The progress bar advances as each individual response arrives and displays a countdown between free-plan groups. With 20 symbols, the eight-credit-per-minute free plan requires three groups and at least about two minutes.

## GitHub Pages

Upload all project files to the repository root, keeping the `cloudflare-worker` folder. GitHub Pages can serve the app directly from the main branch.

Portfolio data is synchronized through a protected Cloudflare Worker into D1 when configured, with browser local storage as an offline fallback. The Twelve Data key and the master sync key remain encrypted secrets in Cloudflare; each device stores only the Worker URL and its entered sync key locally. See `SETUP-INSTRUCTIONS.txt` for setup.

This app is educational and is not financial advice.
