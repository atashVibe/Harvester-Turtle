const assert = require("node:assert/strict");
const { calculatePricePerShare, isValidTrade, calculateLedger } = require("./trade-calculator.js");

assert.equal(calculatePricePerShare(400, 2), 200);
assert.equal(calculatePricePerShare(400, 0), 0);
assert.equal(isValidTrade({ type: "buy", symbol: "AMZN", amount: 400, shares: 2, tradedAt: "not-a-date" }), false);
assert.equal(isValidTrade({ type: "transfer", symbol: "AMZN", amount: 400, shares: 2, tradedAt: "2026-01-01T10:00:00Z" }), false);

const fifo = calculateLedger([
  { id: "buy-1", type: "buy", symbol: "AMZN", amount: 400, shares: 2, tradedAt: "2026-01-01T10:00:00Z" },
  { id: "buy-2", type: "buy", symbol: "AMZN", amount: 220, shares: 1, tradedAt: "2026-01-02T10:00:00Z" },
  { id: "sell-1", type: "sell", symbol: "AMZN", amount: 430, shares: 2, tradedAt: "2026-01-03T10:00:00Z" },
  { id: "sell-2", type: "sell", symbol: "AMZN", amount: 230, shares: 1, tradedAt: "2026-01-04T10:00:00Z" },
]);
assert.equal(fifo.entries.find(entry => entry.id === "sell-1").fifoCost, 400);
assert.equal(fifo.entries.find(entry => entry.id === "sell-1").realizedProfitLoss, 30);
assert.equal(fifo.entries.find(entry => entry.id === "sell-2").fifoCost, 220);
assert.equal(fifo.entries.find(entry => entry.id === "sell-2").realizedProfitLoss, 10);
assert.equal(fifo.summary.realizedProfitLoss, 40);
assert.equal(fifo.summary.openShares, 0);
assert.equal(fifo.hasUnmatchedSales, false);

const chronological = calculateLedger([
  { id: "sell", type: "sell", symbol: "MSFT", amount: 120, shares: 1, tradedAt: "2026-02-02T10:00:00Z" },
  { id: "buy", type: "buy", symbol: "MSFT", amount: 100, shares: 1, tradedAt: "2026-02-01T10:00:00Z" },
]);
assert.equal(chronological.entries.find(entry => entry.id === "sell").realizedProfitLoss, 20);
assert.equal(chronological.hasUnmatchedSales, false);

const unmatched = calculateLedger([
  { id: "sell", type: "sell", symbol: "NVDA", amount: 300, shares: 2, tradedAt: "2026-03-01T10:00:00Z" },
]);
assert.equal(unmatched.entries[0].matchedShares, 0);
assert.equal(unmatched.entries[0].unmatchedShares, 2);
assert.equal(unmatched.hasUnmatchedSales, true);

console.log("trade calculator tests: OK");
