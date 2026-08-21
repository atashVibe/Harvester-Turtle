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
    const type = rawType === "deposit" ? "deposit"
      : rawType === "sold" || rawType === "sell" ? "sell"
      : rawType === "bought" || rawType === "buy" ? "buy"
      : rawType === "bto" || rawType === "option_buy" ? "option_buy"
      : rawType === "stc" || rawType === "option_sell" ? "option_sell"
      : rawType === "oexp" || rawType === "option_expire" ? "option_expire" : "";
    const isOption = type.startsWith("option_");
    const shares = Math.max(0, finite(source.shares));
    const enteredAmount = Math.max(0, finite(source.amount));
    const enteredPrice = Math.max(0, finite(source.pricePerShare));
    const pricePerShare = type === "deposit" || type === "option_expire" ? 0 : enteredPrice || calculatePricePerShare(enteredAmount, shares * (isOption ? 100 : 1));
    const calculatedAmount = shares > 0 && pricePerShare > 0 ? shares * pricePerShare * (isOption ? 100 : 1) : 0;
    const amount = type === "deposit" ? enteredAmount : isOption ? (enteredAmount || calculatedAmount) : (calculatedAmount || enteredAmount);
    const tradedAt = source.tradedAt === undefined || source.tradedAt === null || source.tradedAt === "" ? new Date().toISOString() : isoDate(source.tradedAt, "");
    const createdAt = isoDate(source.createdAt, tradedAt || new Date().toISOString());
    const legacyLimit = source.limit === true || source.isLimit === true || source.orderKind === "limit";
    const orderKind = type === "deposit" ? "cash" : isOption ? "option" : legacyLimit ? "limit" : "market";
    const status = type !== "deposit" && orderKind === "limit" && source.status !== "executed" ? "pending" : "executed";
    const symbol = String(source.symbol || "").trim().toUpperCase();
    const optionContract = String(source.optionContract || "").replace(/^Option Expiration for\s+/i, "").trim().slice(0, 300);
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
      ...(isOption ? {optionContract} : {}),
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
    const isOption = item.type.startsWith("option_");
    const isExpiration = item.type === "option_expire";
    return (isDeposit || /^[A-Z0-9.-]{1,15}$/.test(item.symbol)) &&
      ["buy", "sell", "deposit", "option_buy", "option_sell", "option_expire"].includes(item.type) &&
      ["market", "limit", "cash", "option"].includes(item.orderKind) &&
      ["pending", "executed"].includes(item.status) &&
      !(item.orderKind === "market" && item.status !== "executed") &&
      (isExpiration ? item.amount === 0 : item.amount > 0) &&
      (isDeposit || (item.shares > 0 && (isExpiration || item.pricePerShare > 0))) &&
      (!isOption || item.optionContract.length > 0) &&
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

  function formatPendingLimit(trade, now = Date.now()) {
    const item = normalizeTrade(trade);
    const code = item.type === "buy" ? "LB" : "LS";
    const shares = Number(item.shares.toFixed(6)).toString();
    const price = item.pricePerShare.toFixed(2);
    const orderTime = new Date(item.tradedAt).getTime();
    const currentTime = new Date(now).getTime();
    const ageInDays = Number.isFinite(orderTime) && Number.isFinite(currentTime) ? Math.max(0, Math.floor((currentTime - orderTime) / 86400000)) : 0;
    return `${code}-${shares}x$${price}-${ageInDays}d`;
  }

  function mergePendingRecovery(currentTrades, backupTrades) {
    const current = (Array.isArray(currentTrades) ? currentTrades : []).map(normalizeTrade).filter(isValidTrade);
    const backupPending = (Array.isArray(backupTrades) ? backupTrades : []).map(normalizeTrade).filter(entry => isValidTrade(entry) && entry.status === "pending");
    const fingerprint = entry => [entry.type, entry.symbol, entry.shares.toFixed(8), entry.pricePerShare.toFixed(8), entry.tradedAt.slice(0, 10)].join("|");
    const available = new Map();
    current.filter(entry => entry.status === "pending").forEach(entry => {
      const key = fingerprint(entry);
      available.set(key, (available.get(key) || 0) + 1);
    });
    const recovered = backupPending.filter(entry => {
      const key = fingerprint(entry);
      const remaining = available.get(key) || 0;
      if (remaining > 0) {
        available.set(key, remaining - 1);
        return false;
      }
      return true;
    });
    return {trades: [...current, ...recovered], recoveredCount: recovered.length};
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
      matchedContracts: 0,
      unmatchedContracts: 0,
      soldContracts: 0,
      remainingContracts: 0,
    }));
    const ordered = [...entries].sort((left, right) => {
      const tradeDifference = new Date(left.tradedAt) - new Date(right.tradedAt);
      if (tradeDifference) return tradeDifference;
      const createdDifference = new Date(left.createdAt) - new Date(right.createdAt);
      return createdDifference || left.originalIndex - right.originalIndex;
    });
    const entryById = new Map(entries.map(entry => [entry.id, entry]));
    const lotsBySymbol = new Map();
    const optionLotsByContract = new Map();
    const pendingBySymbol = {};
    const realizedBySymbol = {};
    let totalBought = 0;
    let totalSold = 0;
    let totalDeposited = 0;
    let committedBuyAmount = 0;
    let pendingSellAmount = 0;
    let realizedProfit = 0;
    let realizedLoss = 0;
    let optionBought = 0;
    let optionSold = 0;
    let optionRealizedProfit = 0;
    let optionRealizedLoss = 0;

    const optionKey = entry => `${entry.symbol}|${String(entry.optionContract || "").replace(/^Option Expiration for\s+/i, "").trim().toLowerCase()}`;

    ordered.forEach(entry => {
      if (entry.type === "deposit") {
        totalDeposited += entry.amount;
        return;
      }
      if (entry.type === "option_buy") {
        optionBought += entry.amount;
        entry.remainingContracts = entry.shares;
        const key = optionKey(entry);
        const lots = optionLotsByContract.get(key) || [];
        lots.push({sourceId: entry.id, remainingContracts: entry.shares, costPerContract: entry.amount / entry.shares});
        optionLotsByContract.set(key, lots);
        return;
      }
      if (entry.type === "option_sell" || entry.type === "option_expire") {
        if (entry.type === "option_sell") optionSold += entry.amount;
        let contractsToMatch = entry.shares;
        const lots = optionLotsByContract.get(optionKey(entry)) || [];
        while (contractsToMatch > EPSILON && lots.length) {
          const lot = lots[0];
          const matched = Math.min(contractsToMatch, lot.remainingContracts);
          const cost = matched * lot.costPerContract;
          entry.matchedContracts += matched;
          entry.fifoCost += cost;
          entry.matches.push({buyId: lot.sourceId, contracts: matched, cost});
          contractsToMatch -= matched;
          lot.remainingContracts -= matched;
          const buyEntry = entryById.get(lot.sourceId);
          if (buyEntry) {
            buyEntry.soldContracts += matched;
            buyEntry.remainingContracts = Math.max(0, buyEntry.shares - buyEntry.soldContracts);
          }
          if (lot.remainingContracts <= EPSILON) lots.shift();
        }
        entry.unmatchedContracts = Math.max(0, contractsToMatch);
        const matchedProceeds = entry.shares > EPSILON ? entry.amount * (entry.matchedContracts / entry.shares) : 0;
        entry.realizedProfitLoss = matchedProceeds - entry.fifoCost;
        if (entry.realizedProfitLoss >= 0) optionRealizedProfit += entry.realizedProfitLoss;
        else optionRealizedLoss += Math.abs(entry.realizedProfitLoss);
        optionLotsByContract.set(optionKey(entry), lots);
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
    Object.values(pendingBySymbol).forEach(items => items.sort((left, right) => new Date(right.tradedAt) - new Date(left.tradedAt) || new Date(right.createdAt) - new Date(left.createdAt)));

    const realizedProfitLoss = realizedProfit - realizedLoss;
    const optionRealizedProfitLoss = optionRealizedProfit - optionRealizedLoss;
    const combinedRealizedProfitLoss = realizedProfitLoss + optionRealizedProfitLoss;
    const unmatchedShares = entries.reduce((sum, entry) => sum + entry.unmatchedShares, 0);
    const unmatchedOptionContracts = entries.reduce((sum, entry) => sum + entry.unmatchedContracts, 0);
    const normalizedTaxRate = Math.min(1, Math.max(0, finite(taxRate)));
    const estimatedTax = Math.max(combinedRealizedProfitLoss, 0) * normalizedTaxRate;
    const finalHarvest = combinedRealizedProfitLoss - estimatedTax;
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
        unmatchedShares,
        optionBought,
        optionSold,
        optionRealizedProfit,
        optionRealizedLoss,
        optionRealizedProfitLoss,
        combinedRealizedProfitLoss,
        unmatchedOptionContracts,
        taxRate: normalizedTaxRate,
        estimatedTax,
        finalHarvest,
      },
      hasUnmatchedSales: entries.some(entry => entry.status === "executed" && entry.unmatchedShares > EPSILON),
      hasUnmatchedOptions: entries.some(entry => entry.status === "executed" && entry.unmatchedContracts > EPSILON),
    };
  }

  return { calculatePricePerShare, normalizeTrade, isValidTrade, sortTrades, calculateHighLow, calculateLedger, formatPendingLimit, mergePendingRecovery };
});
