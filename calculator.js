(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.HarvesterCalculator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const finite = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  function normalizeStock(stock) {
    const symbol = String((stock && stock.symbol) || "").trim().toUpperCase();
    return {
      id: String((stock && stock.id) || `${symbol}-${Date.now()}-${Math.random()}`),
      symbol,
      current: Math.max(0, finite(stock && stock.current)),
      buyPrice: Math.max(0, finite(stock && (stock.buyPrice ?? stock.buy))),
      invested: Math.max(0, finite(stock && stock.invested)),
      previousClose: Math.max(0, finite(stock && (stock.previousClose ?? stock.prev))),
      growthGoal: Math.max(0, finite(stock && (stock.growthGoal ?? stock.goal), 0.03)),
      harvestRate: Math.min(1, Math.max(0, finite(stock && (stock.harvestRate ?? stock.harvest), 0.20))),
      minimumHarvest: Math.max(0, finite(stock && (stock.minimumHarvest ?? stock.min), 1)),
      shares: stock && stock.shares !== undefined && stock.shares !== null ? Math.max(0, finite(stock.shares)) : null,
      high15: Math.max(0, finite(stock && stock.high15)),
      low15: Math.max(0, finite(stock && stock.low15)),
      marketDataAt: String((stock && stock.marketDataAt) || ""),
    };
  }

  function calculate(stock) {
    const item = normalizeStock(stock);
    const invested = item.invested;
    const shares = item.shares === null ? (item.buyPrice > 0 ? invested / item.buyPrice : 0) : item.shares;
    const averageCost = item.buyPrice;
    const currentValue = shares * item.current;
    const profit = currentValue - invested;
    const returnRate = invested > 0 ? profit / invested : 0;
    const goalPriceIncrease = averageCost * item.growthGoal;
    const harvestPrice = averageCost > 0 ? averageCost + goalPriceIncrease : 0;
    const potentialHarvestCash = profit > 0 && item.harvestRate > 0 ? profit * item.harvestRate : 0;
    const dayChange = item.previousClose > 0
      ? (item.current - item.previousClose) / item.previousClose
      : 0;
    const meetsGrowthGoal = shares > 0 && item.current >= harvestPrice;
    const meetsMinimumCash = potentialHarvestCash >= item.minimumHarvest;
    const eligible = meetsGrowthGoal && meetsMinimumCash && item.harvestRate > 0;
    const harvestCash = eligible ? potentialHarvestCash : 0;
    const sharesToSell = item.current > 0 ? harvestCash / item.current : 0;

    let suggestion = "Hold";
    if (dayChange <= -0.04) suggestion = "Strong Buy";
    else if (dayChange <= -0.02) suggestion = "Buy More";
    else if (eligible && dayChange >= 0.04) suggestion = "Strong Harvest";
    else if (eligible && dayChange >= 0.02) suggestion = "Harvest";
    else if (eligible) suggestion = "Harvest Ready";

    let buySignal = "";
    if (item.current > 0 && item.previousClose > 0 && item.current < item.previousClose) buySignal = "Yes";
    else if (item.current > 0 && averageCost > 0 && item.current < averageCost) buySignal = "Maybe";

    return {
      ...item,
      invested,
      shares,
      averageCost,
      currentValue,
      profit,
      returnRate,
      goalPriceIncrease,
      potentialHarvestCash,
      meetsGrowthGoal,
      meetsMinimumCash,
      harvestPrice,
      dayChange,
      eligible,
      action: eligible ? "Harvest" : "Wait",
      harvestCash,
      sharesToSell,
      suggestion,
      buySignal,
    };
  }

  return { calculate, normalizeStock };
});
