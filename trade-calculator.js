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
  const isoDate = (value, fallback = "") => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
  };

  function calculatePricePerShare(amount, shares) {
    const total = Math.max(0, finite(amount));
    const quantity = Math.max(0, finite(shares));
    return quantity > 0 ? total / quantity : 0;
  }

  function normalizeTrade(trade) {
    const source = trade && typeof trade === "object" ? trade : {};
    const rawType = String(source.type || "buy").trim().toLowerCase();
    const type = rawType === "deposit" ? "deposit" : rawType === "sold" || rawType === "sell" ? "sell" : rawType === "bought" || rawType === "buy" ? "buy" : "";
    const shares = Math.max(0, finite(source.shares));
    const enteredAmount = Math.max(0, finite(source.amount));
    const enteredPrice = Math.max(0, finite(source.pricePerShare));
    const pricePerShare = type === "deposit" ? 0 : enteredPrice || calculatePricePerShare(enteredAmount, shares);
    const amount = type === "deposit" ? enteredAmount : shares > 0 && pricePerShare > 0 ? shares * pricePerShare : enteredAmount;
    const tradedAt = source.tradedAt === undefined || source.tradedAt === null || source.tradedAt === "" ? new Date().toISOString() : isoDate(source.tradedAt, "");
    const createdAt = isoDate(source.createdAt, tradedAt || new Date().toISOString());
    const legacyLimit = source.limit === true || source.isLimit === true || source.orderKind === "limit";
    const orderKind = type === "deposit" ? "cash" : legacyLimit ? "limit" : "market";
    const status = type !== "deposit" && orderKind === "limit" && source.status !== "executed" ? "pending" : "executed";
    const symbol = String(source.symbol || "").trim().toUpperCase();
    const sourceType = source.source === "opening" ? "opening" : source.source === "robinhood" ? "robinhood" : "log";
    const externalId = String(source.externalId || "").trim().slice(0, 120);
    const rawRobinhood = source.robinhood && typeof source.robinhood === "object" ? source.robinhood : null;
    const robinhood = rawRobinhood ? {
      activityDate: String(rawRobinhood.activityDate || "").trim().slice(0, 40),
      processDate: String(rawRobinhood.processDate || "").trim().slice(0, 40),
      settleDate: String(rawRobinhood.settleDate || "").trim().slice(0, 40),
      instrument: String(rawRobinhood.instrument || "").trim().toUpperCase().slice(0, 20),
      description: String(rawRobinhood.description || "").trim().slice(0, 500),
      transCode: String(rawRobinhood.transCode || "").trim().slice(0, 20),
      quantity: String(rawRobinhood.quantity || "").trim().slice(0, 80),
      price: String(rawRobinhood.price || "").trim().slice(0, 80),
      amount: String(rawRobinhood.amount || "").trim().slice(0, 80),
    } : undefined;
    return {
      id: String(source.id || `${symbol || "trade"}-${Date.now()}-${Math.random().toString(36).slice(2)}`),
      type,
      symbol,
      shares,
      pricePerShare,
      amount,
      orderKind,
      status,
      source: sourceType,
      note: String(source.note || "").trim().slice(0, 500),
      tradedAt,
      createdAt,
      ...(externalId ? {externalId} : {}),
      ...(robinhood ? {robinhood} : {}),
    };
  }

  function isValidTrade(trade) {
    const item = normalizeTrade(trade);
    const isDeposit = item.type === "deposit";
    return (isDeposit || /^[A-Z0-9.-]{1,15}$/.test(item.symbol)) &&
      ["buy", "sell", "deposit"].includes(item.type) &&
      ["market", "limit", "cash"].includes(item.orderKind) &&
      ["pending", "executed"].includes(item.status) &&
      !(item.orderKind === "market" && item.status !== "executed") &&
      item.amount > 0 && (isDeposit || (item.shares > 0 && item.pricePerShare > 0)) &&
      Number.isFinite(new Date(item.tradedAt).getTime());
  }

  function sortTrades(trades, mode = "time") {
    const items = [...(Array.isArray(trades) ? trades : [])];
    const newestFirst = (left, right) => new Date(right.tradedAt) - new Date(left.tradedAt) || new Date(right.createdAt) - new Date(left.createdAt);
    if (mode === "stock") return items.sort((left, right) => String(left.symbol).localeCompare(String(right.symbol)) || newestFirst(left, right));
    return items.sort(newestFirst);
  }

  function calculateHighLow(values, count = 15) {
    const bars = (Array.isArray(values) ? values : []).slice(0, Math.max(0, count));
    const highs = bars.map(bar => finite(bar && bar.high)).filter(value => value > 0);
    const lows = bars.map(bar => finite(bar && bar.low)).filter(value => value > 0);
    return {
      high: highs.length ? Math.max(...highs) : 0,
      low: lows.length ? Math.min(...lows) : 0,
      count: Math.min(highs.length, lows.length),
    };
  }

  function calculateLedger(trades, taxRate = 0.30) {
    const entries = (Array.isArray(trades) ? trades : []).map((trade, originalIndex) => ({
      ...normalizeTrade(trade),
      originalIndex,
      matchedShares: 0,
      unmatchedShares: 0,
      fifoCost: 0,
      realizedProfitLoss: null,
      matches: [],
      soldShares: 0,
      remainingShares: 0,
    }));
    const ordered = [...entries].sort((left, right) => {
      const tradeDifference = new Date(left.tradedAt) - new Date(right.tradedAt);
      if (tradeDifference) return tradeDifference;
      const createdDifference = new Date(left.createdAt) - new Date(right.createdAt);
      return createdDifference || left.originalIndex - right.originalIndex;
    });
    const entryById = new Map(entries.map(entry => [entry.id, entry]));
    const lotsBySymbol = new Map();
    const pendingBySymbol = {};
    const realizedBySymbol = {};
    let totalBought = 0;
    let totalSold = 0;
    let totalDeposited = 0;
    let committedBuyAmount = 0;
    let pendingSellAmount = 0;
    let realizedProfit = 0;
    let realizedLoss = 0;

    ordered.forEach(entry => {
      if (entry.type === "deposit") {
        totalDeposited += entry.amount;
        return;
      }
      if (entry.status === "pending") {
        const pending = pendingBySymbol[entry.symbol] || [];
        pending.push(entry);
        pendingBySymbol[entry.symbol] = pending;
        if (entry.type === "buy") committedBuyAmount += entry.amount;
        else pendingSellAmount += entry.amount;
        return;
      }
      if (entry.type === "buy") {
        totalBought += entry.amount;
        entry.remainingShares = entry.shares;
        const lots = lotsBySymbol.get(entry.symbol) || [];
        lots.push({ sourceId: entry.id, remainingShares: entry.shares, pricePerShare: entry.pricePerShare, tradedAt: entry.tradedAt });
        lotsBySymbol.set(entry.symbol, lots);
        return;
      }

      totalSold += entry.amount;
      let sharesToMatch = entry.shares;
      const lots = lotsBySymbol.get(entry.symbol) || [];
      while (sharesToMatch > EPSILON && lots.length) {
        const lot = lots[0];
        const matched = Math.min(sharesToMatch, lot.remainingShares);
        const cost = matched * lot.pricePerShare;
        entry.matchedShares += matched;
        entry.fifoCost += cost;
        entry.matches.push({ buyId: lot.sourceId, shares: matched, cost, pricePerShare: lot.pricePerShare });
        sharesToMatch -= matched;
        lot.remainingShares -= matched;
        const buyEntry = entryById.get(lot.sourceId);
        if (buyEntry) {
          buyEntry.soldShares += matched;
          buyEntry.remainingShares = Math.max(0, buyEntry.shares - buyEntry.soldShares);
        }
        if (lot.remainingShares <= EPSILON) lots.shift();
      }
      entry.unmatchedShares = Math.max(0, sharesToMatch);
      const matchedProceeds = entry.matchedShares * entry.pricePerShare;
      entry.realizedProfitLoss = matchedProceeds - entry.fifoCost;
      if (entry.realizedProfitLoss >= 0) realizedProfit += entry.realizedProfitLoss;
      else realizedLoss += Math.abs(entry.realizedProfitLoss);
      realizedBySymbol[entry.symbol] = (realizedBySymbol[entry.symbol] || 0) + entry.realizedProfitLoss;
      lotsBySymbol.set(entry.symbol, lots);
    });

    let openShares = 0;
    let openCost = 0;
    const holdings = {};
    lotsBySymbol.forEach((lots, symbol) => {
      const shares = lots.reduce((sum, lot) => sum + lot.remainingShares, 0);
      const cost = lots.reduce((sum, lot) => sum + lot.remainingShares * lot.pricePerShare, 0);
      if (shares > EPSILON) holdings[symbol] = { shares, cost, averagePrice: cost / shares };
      openShares += shares;
      openCost += cost;
    });
    Object.values(pendingBySymbol).forEach(items => items.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt)));

    const realizedProfitLoss = realizedProfit - realizedLoss;
    const normalizedTaxRate = Math.min(1, Math.max(0, finite(taxRate)));
    const estimatedTax = Math.max(realizedProfitLoss, 0) * normalizedTaxRate;
    const finalHarvest = realizedProfitLoss - estimatedTax;
    return {
      entries: entries.map(({ originalIndex, ...entry }) => entry),
      holdings,
      pendingBySymbol,
      realizedBySymbol,
      summary: {
        totalBought,
        totalSold,
        totalDeposited,
        openShares,
        openCost,
        committedBuyAmount,
        pendingSellAmount,
        realizedProfit,
        realizedLoss,
        realizedProfitLoss,
        taxRate: normalizedTaxRate,
        estimatedTax,
        finalHarvest,
      },
      hasUnmatchedSales: entries.some(entry => entry.status === "executed" && entry.unmatchedShares > EPSILON),
    };
  }

  return { calculatePricePerShare, normalizeTrade, isValidTrade, sortTrades, calculateHighLow, calculateLedger };
});
