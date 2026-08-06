(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.HarvesterTrades = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const EPSILON = 1e-8;
  const finite = value => {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  };

  function calculatePricePerShare(amount, shares) {
    const total = Math.max(0, finite(amount));
    const quantity = Math.max(0, finite(shares));
    return quantity > 0 ? total / quantity : 0;
  }

  function normalizeTrade(trade) {
    const rawType = String((trade && trade.type) || "buy").trim().toLowerCase();
    const type = rawType === "sold" || rawType === "sell" ? "sell" : rawType === "bought" || rawType === "buy" ? "buy" : "";
    const amount = Math.max(0, finite(trade && trade.amount));
    const shares = Math.max(0, finite(trade && trade.shares));
    const enteredPrice = Math.max(0, finite(trade && trade.pricePerShare));
    const pricePerShare = calculatePricePerShare(amount, shares) || enteredPrice;
    const tradedAtValue = new Date(trade && trade.tradedAt);
    const createdAtValue = new Date(trade && trade.createdAt);
    const tradedAt = Number.isFinite(tradedAtValue.getTime()) ? tradedAtValue.toISOString() : "";
    const createdAt = Number.isFinite(createdAtValue.getTime()) ? createdAtValue.toISOString() : tradedAt;
    const symbol = String((trade && trade.symbol) || "").trim().toUpperCase();
    return {
      id: String((trade && trade.id) || `${symbol || "trade"}-${Date.now()}-${Math.random()}`),
      type,
      symbol,
      amount,
      shares,
      pricePerShare,
      tradedAt,
      createdAt,
    };
  }

  function isValidTrade(trade) {
    const item = normalizeTrade(trade);
    return /^[A-Z0-9.-]{1,15}$/.test(item.symbol) &&
      ["buy", "sell"].includes(item.type) &&
      item.amount > 0 && item.shares > 0 && item.pricePerShare > 0 &&
      Number.isFinite(new Date(item.tradedAt).getTime());
  }

  function calculateLedger(trades) {
    const entries = (Array.isArray(trades) ? trades : []).map((trade, originalIndex) => ({
      ...normalizeTrade(trade),
      originalIndex,
      matchedShares: 0,
      unmatchedShares: 0,
      fifoCost: 0,
      realizedProfitLoss: null,
    }));
    const ordered = [...entries].sort((left, right) => {
      const tradeDifference = new Date(left.tradedAt) - new Date(right.tradedAt);
      if (tradeDifference) return tradeDifference;
      const createdDifference = new Date(left.createdAt) - new Date(right.createdAt);
      return createdDifference || left.originalIndex - right.originalIndex;
    });
    const lotsBySymbol = new Map();
    let totalBought = 0;
    let totalSold = 0;
    let realizedProfitLoss = 0;

    ordered.forEach(entry => {
      if (entry.type === "buy") {
        totalBought += entry.amount;
        const lots = lotsBySymbol.get(entry.symbol) || [];
        lots.push({ remainingShares: entry.shares, pricePerShare: entry.pricePerShare });
        lotsBySymbol.set(entry.symbol, lots);
        return;
      }

      totalSold += entry.amount;
      let sharesToMatch = entry.shares;
      const lots = lotsBySymbol.get(entry.symbol) || [];
      while (sharesToMatch > EPSILON && lots.length) {
        const lot = lots[0];
        const matched = Math.min(sharesToMatch, lot.remainingShares);
        entry.matchedShares += matched;
        entry.fifoCost += matched * lot.pricePerShare;
        sharesToMatch -= matched;
        lot.remainingShares -= matched;
        if (lot.remainingShares <= EPSILON) lots.shift();
      }
      entry.unmatchedShares = Math.max(0, sharesToMatch);
      const matchedProceeds = entry.matchedShares * entry.pricePerShare;
      entry.realizedProfitLoss = matchedProceeds - entry.fifoCost;
      realizedProfitLoss += entry.realizedProfitLoss;
      lotsBySymbol.set(entry.symbol, lots);
    });

    let openShares = 0;
    let openCost = 0;
    const holdings = {};
    lotsBySymbol.forEach((lots, symbol) => {
      const shares = lots.reduce((sum, lot) => sum + lot.remainingShares, 0);
      const cost = lots.reduce((sum, lot) => sum + (lot.remainingShares * lot.pricePerShare), 0);
      if (shares > EPSILON) holdings[symbol] = { shares, cost };
      openShares += shares;
      openCost += cost;
    });

    return {
      entries: entries.map(({ originalIndex, ...entry }) => entry),
      holdings,
      summary: { totalBought, totalSold, realizedProfitLoss, openShares, openCost },
      hasUnmatchedSales: entries.some(entry => entry.unmatchedShares > EPSILON),
    };
  }

  return { calculatePricePerShare, normalizeTrade, isValidTrade, calculateLedger };
});
