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
    };
  }

  function calculate(stock) {
    const item = normalizeStock(stock);
    const invested = item.invested;
    const shares = item.buyPrice > 0 ? invested / item.buyPrice : 0;
    const averageCost = item.buyPrice;
    const currentValue = shares * item.current;
    const profit = currentValue - invested;
    const returnRate = invested > 0 ? profit / invested : 0;
    const goalProfit = invested * item.growthGoal;
    const minimumProfit = item.harvestRate > 0 ? item.minimumHarvest / item.harvestRate : Infinity;
    const requiredProfit = Math.max(goalProfit, minimumProfit);
    const harvestPrice = shares > 0 && Number.isFinite(requiredProfit)
      ? (invested + requiredProfit) / shares
      : 0;
    const dayChange = item.previousClose > 0
      ? (item.current - item.previousClose) / item.previousClose
      : 0;
    const eligible = profit >= requiredProfit && item.harvestRate > 0;
    const harvestCash = eligible ? profit * item.harvestRate : 0;

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
      goalProfit,
      minimumProfit,
      requiredProfit,
      harvestPrice,
      dayChange,
      eligible,
      action: eligible ? "Harvest" : "Wait",
      harvestCash,
      suggestion,
      buySignal,
    };
  }

  return { calculate, normalizeStock };
});
