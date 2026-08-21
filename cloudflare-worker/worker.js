const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders},
  });
}
async function sameSecret(provided, expected) {
  if (!provided || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index++) difference |= a[index] ^ b[index];
  return difference === 0;
}
async function authorized(request, env) {
  const header = request.headers.get("Authorization") || "";
  return sameSecret(header.startsWith("Bearer ") ? header.slice(7) : "", env.PORTFOLIO_SYNC_KEY);
}
function validStock(stock) {
  return stock && typeof stock === "object" &&
    /^[A-Z0-9.\-]{1,15}$/.test(String(stock.symbol || "").trim().toUpperCase()) &&
    ["current", "buyPrice", "invested", "previousClose", "growthGoal", "harvestRate", "minimumHarvest"].every(key => Number.isFinite(Number(stock[key])) && Number(stock[key]) >= 0) &&
    ["high15", "low15"].every(key => stock[key] === undefined || (Number.isFinite(Number(stock[key])) && Number(stock[key]) >= 0)) &&
    (stock.note === undefined || (typeof stock.note === "string" && stock.note.length <= 1000));
}
function validTrade(trade) {
  const types = ["buy", "sell", "deposit", "option_buy", "option_sell", "option_expire"];
  if (!trade || typeof trade !== "object" || !types.includes(trade.type)) return false;
  const expiration = trade.type === "option_expire";
  if (!(Number.isFinite(Number(trade.amount)) && (expiration ? Number(trade.amount) === 0 : Number(trade.amount) > 0))) return false;
  if (!Number.isFinite(new Date(trade.tradedAt).getTime())) return false;
  if (trade.note !== undefined && (typeof trade.note !== "string" || trade.note.length > 500)) return false;
  if (trade.type === "deposit") return true;
  const option = trade.type.startsWith("option_");
  if (option) return /^[A-Z0-9.\-]{1,15}$/.test(String(trade.symbol || "").trim().toUpperCase()) &&
    Number.isFinite(Number(trade.shares)) && Number(trade.shares) > 0 &&
    (expiration || (Number.isFinite(Number(trade.pricePerShare)) && Number(trade.pricePerShare) > 0)) &&
    typeof trade.optionContract === "string" && trade.optionContract.length > 0 && trade.optionContract.length <= 300 &&
    (trade.orderKind === undefined || trade.orderKind === "option") &&
    (trade.status === undefined || trade.status === "executed");
  return /^[A-Z0-9.\-]{1,15}$/.test(String(trade.symbol || "").trim().toUpperCase()) &&
    ["shares", "pricePerShare"].every(key => Number.isFinite(Number(trade[key])) && Number(trade[key]) > 0) &&
    (trade.orderKind === undefined || ["market", "limit"].includes(trade.orderKind)) &&
    (trade.status === undefined || ["pending", "executed"].includes(trade.status));
}
function validPreferences(preferences) {
  if (preferences === undefined) return true;
  return preferences && typeof preferences === "object" &&
    Number.isFinite(Number(preferences.dailyRefreshLimit)) && Number(preferences.dailyRefreshLimit) >= 1 && Number(preferences.dailyRefreshLimit) <= 100 &&
    Number.isFinite(Number(preferences.taxRate)) && Number(preferences.taxRate) >= 0 && Number(preferences.taxRate) <= 1;
}
async function portfolio(request, env) {
  if (!env.PORTFOLIO_SYNC_KEY) return json({error: "Missing PORTFOLIO_SYNC_KEY secret"}, 500);
  if (!env.DB) return json({error: "Missing D1 database binding named DB"}, 500);
  if (!(await authorized(request, env))) return json({error: "Invalid private sync key"}, 401);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS portfolio (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT data, updated_at FROM portfolio WHERE id = 1").first();
    if (!row) return json({portfolio: null});
    try {
      const saved = JSON.parse(row.data);
      const stocks = Array.isArray(saved) ? saved : saved.stocks;
      const trades = Array.isArray(saved) ? [] : saved.trades;
      const preferences = Array.isArray(saved) ? undefined : saved.preferences;
      if (!Array.isArray(stocks) || !Array.isArray(trades)) throw new Error("Invalid saved data");
      return json({portfolio: {version: 4, stocks, trades, preferences, updatedAt: row.updated_at}});
    } catch {
      return json({error: "Stored portfolio data is invalid"}, 500);
    }
  }
  if (request.method === "PUT") {
    let body;
    try { body = await request.json(); } catch { return json({error: "Request body must be JSON"}, 400); }
    if (!Array.isArray(body.stocks) || body.stocks.length > 250 || !body.stocks.every(validStock)) return json({error: "Portfolio data is invalid"}, 400);
    if (body.trades !== undefined && !Array.isArray(body.trades)) return json({error: "Log data is invalid"}, 400);
    const trades = Array.isArray(body.trades) ? body.trades : [];
    if (trades.length > 5000 || !trades.every(validTrade)) return json({error: "Log data is invalid"}, 400);
    if (!validPreferences(body.preferences)) return json({error: "App settings are invalid"}, 400);
    const data = JSON.stringify({version: 4, stocks: body.stocks, trades, preferences: body.preferences});
    if (data.length > 1000000) return json({error: "Portfolio is too large"}, 413);
    const updatedAt = new Date().toISOString();
    await env.DB.prepare("INSERT INTO portfolio (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
      .bind(data, updatedAt).run();
    return json({saved: true, updatedAt});
  }
  return json({error: "Method not allowed"}, 405);
}

function providerQuota(response, aggregate) {
  const left = Number(response.headers.get("api-credits-left"));
  const used = Number(response.headers.get("api-credits-used") || response.headers.get("api-credits-request"));
  if (Number.isFinite(left)) aggregate.creditsLeft = aggregate.creditsLeft === null ? left : Math.min(aggregate.creditsLeft, left);
  if (Number.isFinite(used)) aggregate.lastRequestCredits = used;
}
function rangeFromValues(values) {
  const bars = (Array.isArray(values) ? values : []).slice(0, 15);
  const highs = bars.map(item => Number(item.high)).filter(value => Number.isFinite(value) && value > 0);
  const lows = bars.map(item => Number(item.low)).filter(value => Number.isFinite(value) && value > 0);
  return {
    high15: highs.length ? Math.max(...highs) : null,
    low15: lows.length ? Math.min(...lows) : null,
    barCount: Math.min(highs.length, lows.length),
  };
}
async function cachedRange(url, symbol) {
  if (!globalThis.caches || !caches.default) return null;
  const key = new Request(`${url.origin}/__harvester-range?symbol=${encodeURIComponent(symbol)}`);
  const response = await caches.default.match(key);
  if (!response) return null;
  try { return await response.json(); } catch { return null; }
}
async function saveRange(url, symbol, range) {
  if (!globalThis.caches || !caches.default || !range || !range.high15 || !range.low15) return;
  const key = new Request(`${url.origin}/__harvester-range?symbol=${encodeURIComponent(symbol)}`);
  const response = new Response(JSON.stringify(range), {headers: {"Content-Type": "application/json", "Cache-Control": "public, max-age=21600"}});
  await caches.default.put(key, response);
}
async function providerJson(endpoint, symbol, env, quota) {
  const api = new URL(`https://api.twelvedata.com/${endpoint}`);
  api.searchParams.set("symbol", symbol);
  api.searchParams.set("apikey", env.TWELVE_DATA_API_KEY);
  if (endpoint === "time_series") {
    api.searchParams.set("interval", "1day");
    api.searchParams.set("outputsize", "16");
  }
  const response = await fetch(api.toString(), {headers: {Accept: "application/json"}, signal: AbortSignal.timeout(10000)});
  providerQuota(response, quota);
  const data = await response.json();
  if (!response.ok || data.status === "error") throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}
async function marketForSymbol(url, symbol, env, quota) {
  const range = await cachedRange(url, symbol);
  if (range) {
    const quote = await providerJson("quote", symbol, env, quota);
    const price = Number(quote.close);
    const previousClose = Number(quote.previous_close);
    if (!(price > 0)) throw new Error("No valid price returned");
    return {price, previousClose: previousClose > 0 ? previousClose : null, ...range};
  }
  const series = await providerJson("time_series", symbol, env, quota);
  const values = Array.isArray(series.values) ? series.values : [];
  const price = Number(values[0] && values[0].close);
  const previousClose = Number(values[1] && values[1].close);
  if (!(price > 0)) throw new Error("No valid daily market data returned");
  const calculatedRange = rangeFromValues(values);
  await saveRange(url, symbol, calculatedRange);
  return {price, previousClose: previousClose > 0 ? previousClose : null, ...calculatedRange};
}
async function quotes(request, env, url) {
  if (request.method !== "GET") return json({error: "Method not allowed"}, 405);
  if (!env.TWELVE_DATA_API_KEY) return json({error: "Missing TWELVE_DATA_API_KEY secret"}, 500);
  const raw = (url.searchParams.get("symbols") || "").trim();
  const symbols = [...new Set(raw.split(",").map(symbol => symbol.trim().toUpperCase()).filter(symbol => /^[A-Z0-9.\-]{1,15}$/.test(symbol)))].slice(0, 30);
  if (!symbols.length) return json({error: "Add at least one valid symbol using ?symbols=AAPL,MSFT"}, 400);
  const marketQuotes = {};
  const errors = {};
  const quota = {creditsLeft: null, lastRequestCredits: null};
  for (const symbol of symbols) {
    try {
      marketQuotes[symbol] = await marketForSymbol(url, symbol, env, quota);
    } catch (error) {
      errors[symbol] = error.message || "Market update failed";
    }
  }
  if (!Object.keys(marketQuotes).length) return json({error: "No stocks could be updated", errors, quota, updatedAt: new Date().toISOString()}, 502);
  return json({quotes: marketQuotes, errors, quota, updatedAt: new Date().toISOString(), source: "Twelve Data"});
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, {headers: corsHeaders});
    const url = new URL(request.url);
    if (url.pathname === "/portfolio") return portfolio(request, env);
    return quotes(request, env, url);
  },
};
