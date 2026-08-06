# Harvester Turtle

Harvester Turtle is a static, browser-based portfolio calculator derived only from the first sheet of `Harvester Trutle.xlsx`. It also includes a buy/sell trade log with realized profit/loss tracking. The app supports optional live prices, secure Cloudflare D1 sync, local offline saving, and JSON import/export.

## Trade log and realized profit/loss

- Log the transaction type, stock symbol, total dollar amount, shares, and date/time.
- Price per share is calculated as `dollar amount / shares`.
- Realized profit/loss uses FIFO (first in, first out): every sale consumes the oldest available purchase lots for the same symbol first.
- A sale is rejected when there are not enough earlier purchased shares to match it.
- Editing or deleting a purchase is also blocked when that change would leave a later sale unmatched.
- Trade records are included with the portfolio in local saving, cloud sync, export, and import. Older stock-only local/cloud data and export files remain supported.

## Calculation rules

For each stock:

- `shares = amount invested / buy price`
- `profit = current value - total invested`
- `harvested price = bought price × (1 + growth goal)`
- `potential harvest cash = current profit × harvest percentage`
- `harvest cash = potential harvest cash` only when current price reaches harvested price and potential harvest cash reaches the user-entered minimum cash

Harvested Price depends on Bought Price and Growth Goal, not Invested Amount. Invested Amount still determines Shares, Profit, and the actual Harvest Cash. Both the price goal and minimum-cash condition must be met before the app shows a harvest.

The compact table uses centered two-line headings, 11-pixel heading and value text, minimal column spacing, and bold stock symbols with a small gap after the signal lights. It begins with Stock, Current Price, Bought Price, Invested Amount, Shares, Harvest Price, Harvest Cash, and Growth Goal, followed by the remaining calculation and signal columns. Every sortable heading places its arrow on a separate line for consistent alignment. Harvest Price, Harvest Cash, and Previous Close also use consistent two-line labels.

When the table is wider than the browser, desktop users can move across it with the visible left/right buttons and horizontal slider. Those controls remain frozen above the floating headings while the table is on screen. Holding Shift while using the mouse wheel also scrolls horizontally. The desktop controls are hidden on phones and other coarse-pointer touchscreens, where sideways swiping remains available.

The table controls and floating headings use a lower display layer than the application menu and Settings window, preventing them from covering dialogs or menu actions.

The page keeps a single vertical scrollbar. As the table headings leave the top of the screen, a synchronized floating heading row remains visible until the end of the table; it follows the table's horizontal position and preserves the frozen Stock heading.

Editable table fields support left-to-right keyboard navigation. Tab moves forward, Shift+Tab moves backward, and mobile numeric keyboards display a Next action that saves the current value and focuses the next editable field.

Rows start sorted alphabetically by stock symbol. Click any data-column heading to sort ascending, then click it again to sort descending. The active heading shows the direction with an arrow. Sorting changes only the displayed row order and does not change the saved portfolio.

Shares display with exactly two decimal places, while calculations retain the full-precision share value.

The three recommendation lights are positioned immediately to the left of each bold stock symbol.

## Run

Open `index.html` in a modern browser. No build step is required.

## Live prices

Deploy `cloudflare-worker/worker.js` as a Cloudflare Worker and add an encrypted secret named `TWELVE_DATA_API_KEY`. Then enter the Worker URL under **Price Settings**.

Prices update once when the page opens. Refresh the page to request new prices; there is no repeating timer. Up to eight symbols are requested concurrently. The progress bar advances as each individual response arrives and counts down to the price allowance's next clock-minute reset between groups. It detects minute limits separately from the free plan's daily limit, retries the same rejected group once after the reset, then stops with a clear message if the limit remains unavailable. Prices already received are kept.

## GitHub Pages

Upload all project files to the repository root, keeping the `cloudflare-worker` folder. GitHub Pages can serve the app directly from the main branch.

Portfolio data is synchronized through a protected Cloudflare Worker into D1 when configured, with browser local storage as an offline fallback. The Twelve Data key and the master sync key remain encrypted secrets in Cloudflare; each device stores only the Worker URL and its entered sync key locally. See `SETUP-INSTRUCTIONS.txt` for setup.

This app is educational and is not financial advice.
