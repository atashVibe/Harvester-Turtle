# Formula Review

Scope: `Harvester Trutle.xlsx`, first worksheet only.

## Preserved formulas

- Shares = invested amount / buy price
- Current value = shares × current price
- Profit = current value − invested amount
- Day change = (current price − previous close) / previous close
- Harvest cash = profit × harvest percentage
- Buy signal = current price below previous close, otherwise current price below buy price

## Corrected harvest threshold

The worksheet displayed a Growth Goal but did not reference it in the Action or Harvest Price formulas.

The app now requires both worksheet inputs:

1. Profit must meet the growth goal: `profit ≥ invested × growth goal`.
2. The harvested share of profit must meet the minimum: `profit × harvest percentage ≥ minimum harvest cash`.

These combine into:

`required profit = max(invested × growth goal, minimum harvest cash / harvest percentage)`

Then:

`harvest price = (invested + required profit) / shares`

This preserves the worksheet's existing harvest-price results whenever its minimum-cash rule is the binding constraint. For example, MRVL remains `$256.9625`.

## Safety behavior

- Zero buy price produces zero shares rather than a division error.
- Zero harvest percentage disables harvesting rather than dividing by zero.
- Growth Goal, Harvest %, and Minimum Cash cannot be negative.
- Harvest % is limited to 100%.
- Invalid imported rows are rejected.

The calculator is educational and does not constitute financial advice.
