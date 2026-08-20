const assert = require("node:assert/strict");
const {
  calculatePricePerShare,
  isValidTrade,
  normalizeTrade,
  sortTrades,
  calculateHighLow,
  calculateLedger,
} = require("./trade-calculator.js");

assert.equal(calculatePricePerShare(400, 2), 200);
assert.equal(calculatePricePerShare(400, 0), 0);
assert.equal(isValidTrade({type: "buy", symbol: "AMZN", amount: 400, shares: 2, tradedAt: "not-a-date"}), false);
assert.equal(isValidTrade({type: "transfer", symbol: "AMZN", amount: 400, shares: 2, tradedAt: "2026-01-01T10:00:00Z"}), false);
assert.equal(isValidTrade({type: "deposit", amount: 500, tradedAt: "2026-01-01T10:00:00Z"}), true);

const partial = calculateLedger([
  {id: "buy-1", type: "buy", symbol: "AMZN", pricePerShare: 200, shares: 2, tradedAt: "2026-01-01T10:00:00Z"},
  {id: "buy-2", type: "buy", symbol: "AMZN", pricePerShare: 220, shares: 1, tradedAt: "2026-01-02T10:00:00Z"},
  {id: "sell-1", type: "sell", symbol: "AMZN", pricePerShare: 215, shares: 1, tradedAt: "2026-01-03T10:00:00Z"},
]);
const firstLot = partial.entries.find(entry => entry.id === "buy-1");
assert.equal(firstLot.soldShares, 1);
assert.equal(firstLot.remainingShares, 1);
assert.equal(partial.holdings.AMZN.shares, 2);
assert.equal(partial.holdings.AMZN.cost, 420);
assert.equal(partial.holdings.AMZN.averagePrice, 210);
assert.equal(partial.entries.find(entry => entry.id === "sell-1").realizedProfitLoss, 15);
assert.equal(partial.hasUnmatchedSales, false);

const fifoAcrossLots = calculateLedger([
  {id: "buy-a", type: "buy", symbol: "MSFT", pricePerShare: 100, shares: 1, tradedAt: "2026-01-01T10:00:00Z"},
  {id: "buy-b", type: "buy", symbol: "MSFT", pricePerShare: 120, shares: 2, tradedAt: "2026-01-02T10:00:00Z"},
  {id: "sell", type: "sell", symbol: "MSFT", pricePerShare: 130, shares: 2, tradedAt: "2026-01-03T10:00:00Z"},
]);
const sale = fifoAcrossLots.entries.find(entry => entry.id === "sell");
assert.equal(sale.fifoCost, 220);
assert.deepEqual(sale.matches.map(match => [match.buyId, match.shares]), [["buy-a", 1], ["buy-b", 1]]);
assert.equal(fifoAcrossLots.holdings.MSFT.shares, 1);
assert.equal(fifoAcrossLots.holdings.MSFT.averagePrice, 120);

const pendingExcluded = calculateLedger([
  {id: "buy", type: "buy", symbol: "NVDA", pricePerShare: 100, shares: 2, tradedAt: "2026-02-01T10:00:00Z"},
  {id: "limit-sell", type: "sell", symbol: "NVDA", pricePerShare: 150, shares: 1, orderKind: "limit", status: "pending", tradedAt: "2026-02-02T10:00:00Z"},
  {id: "limit-buy", type: "buy", symbol: "NVDA", pricePerShare: 90, shares: 1, orderKind: "limit", status: "pending", tradedAt: "2026-02-02T11:00:00Z"},
]);
assert.equal(pendingExcluded.summary.totalSold, 0);
assert.equal(pendingExcluded.summary.realizedProfitLoss, 0);
assert.equal(pendingExcluded.summary.committedBuyAmount, 90);
assert.equal(pendingExcluded.holdings.NVDA.shares, 2);
assert.equal(pendingExcluded.pendingBySymbol.NVDA.length, 2);

const taxAndDeposits = calculateLedger([
  {id: "deposit", type: "deposit", amount: 1000, note: "First transfer", tradedAt: "2026-03-01T09:00:00Z"},
  {id: "buy-profit", type: "buy", symbol: "AAPL", pricePerShare: 100, shares: 1, tradedAt: "2026-03-01T10:00:00Z"},
  {id: "sell-profit", type: "sell", symbol: "AAPL", pricePerShare: 130, shares: 1, tradedAt: "2026-03-02T10:00:00Z"},
  {id: "buy-loss", type: "buy", symbol: "TSLA", pricePerShare: 100, shares: 1, tradedAt: "2026-03-01T10:00:00Z"},
  {id: "sell-loss", type: "sell", symbol: "TSLA", pricePerShare: 90, shares: 1, tradedAt: "2026-03-02T10:00:00Z"},
], 0.30);
assert.equal(taxAndDeposits.summary.totalDeposited, 1000);
assert.equal(taxAndDeposits.summary.realizedProfit, 30);
assert.equal(taxAndDeposits.summary.realizedLoss, 10);
assert.equal(taxAndDeposits.summary.realizedProfitLoss, 20);
assert.equal(taxAndDeposits.summary.estimatedTax, 6);
assert.equal(taxAndDeposits.summary.finalHarvest, 14);

const lossOnly = calculateLedger([
  {type: "buy", symbol: "LOSS", pricePerShare: 100, shares: 1, tradedAt: "2026-03-01T10:00:00Z"},
  {type: "sell", symbol: "LOSS", pricePerShare: 80, shares: 1, tradedAt: "2026-03-02T10:00:00Z"},
]);
assert.equal(lossOnly.summary.estimatedTax, 0);
assert.equal(lossOnly.summary.finalHarvest, -20);

const sorted = [
  normalizeTrade({id: "z-new", type: "buy", symbol: "Z", pricePerShare: 1, shares: 1, tradedAt: "2026-04-03T10:00:00Z"}),
  normalizeTrade({id: "a-old", type: "buy", symbol: "A", pricePerShare: 1, shares: 1, tradedAt: "2026-04-01T10:00:00Z"}),
  normalizeTrade({id: "a-new", type: "buy", symbol: "A", pricePerShare: 1, shares: 1, tradedAt: "2026-04-02T10:00:00Z"}),
];
assert.deepEqual(sortTrades(sorted, "time").map(item => item.id), ["z-new", "a-new", "a-old"]);
assert.deepEqual(sortTrades(sorted, "stock").map(item => item.id), ["a-new", "a-old", "z-new"]);

const bars = Array.from({length: 16}, (_, index) => ({high: 100 + index, low: 50 - index}));
assert.deepEqual(calculateHighLow(bars, 15), {high: 114, low: 36, count: 15});

const unmatched = calculateLedger([
  {id: "sell", type: "sell", symbol: "NVDA", pricePerShare: 150, shares: 2, tradedAt: "2026-05-01T10:00:00Z"},
]);
assert.equal(unmatched.entries[0].matchedShares, 0);
assert.equal(unmatched.entries[0].unmatchedShares, 2);
assert.equal(unmatched.summary.unmatchedShares, 2);
assert.equal(unmatched.hasUnmatchedSales, true);

const repairedHistory = calculateLedger([
  {id: "sell", type: "sell", symbol: "NVDA", pricePerShare: 150, shares: 2, tradedAt: "2026-05-01T10:00:00Z"},
  {id: "earlier-buy", type: "buy", symbol: "NVDA", pricePerShare: 100, shares: 2, tradedAt: "2026-04-01T10:00:00Z"},
]);
assert.equal(repairedHistory.summary.unmatchedShares, 0);
assert.equal(repairedHistory.hasUnmatchedSales, false);

console.log("trade calculator tests: OK");
