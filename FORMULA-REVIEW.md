# Formula Review

Scope: `Harvester Trutle.xlsx`, first worksheet only.

## Preserved formulas

- Shares = open FIFO shares from executed logs, or invested amount / average price for a manual starting position
- Current value = shares × current price
- Profit = current value − invested amount
- Day change = (current price − previous close) / previous close
- Harvest cash = profit × harvest percentage
- Buy signal = current price below previous close, otherwise current price below buy price

## Updated harvest rules

Harvest Price is a per-share target based only on Average Price and Growth Goal:

`harvest price = average price × (1 + growth goal)`

Invested Amount does not affect this price target. The same Average Price and Growth Goal always produce the same Harvest Price.

Harvest Cash still uses the user's real position:

`shares = open FIFO shares` (or `invested amount / average price` before logs exist)

`profit = (current price − average price) × shares`

`potential harvest cash = profit × harvest percentage`

A harvest is available only when:

1. `current price ≥ harvested price`
2. `potential harvest cash ≥ user-entered minimum cash`

This keeps Minimum Cash connected to the actual Invested Amount while removing Invested Amount from the Harvested Price calculation.

## Safety behavior

- Zero buy price produces zero shares rather than a division error.
- Zero harvest percentage disables harvesting rather than dividing by zero.
- Growth Goal, Harvest %, and Minimum Cash cannot be negative.
- Harvest % is limited to 100%.
- Invalid imported rows are rejected.

The calculator is educational and does not constitute financial advice.
