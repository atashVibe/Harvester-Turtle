const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
async function sameSecret(provided, expected) {
  if (!provided || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(provided)), crypto.subtle.digest("SHA-256", encoder.encode(expected))]);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index++) difference |= a[index] ^ b[index];
  return difference === 0;
}
async function authorized(request, env) {
  const header = request.headers.get("Authorization") || "";
  return sameSecret(header.startsWith("Bearer ") ? header.slice(7) : "", env.PORTFOLIO_SYNC_KEY);
}
function validStock(stock) {
  return stock && typeof stock === "object" && /^[A-Z0-9.\-]{1,15}$/.test(String(stock.symbol || "").trim().toUpperCase()) &&
    ["current", "buyPrice", "invested", "previousClose", "growthGoal", "harvestRate", "minimumHarvest"].every(key => Number.isFinite(Number(stock[key])) && Number(stock[key]) >= 0);
}
async function portfolio(request, env) {
  if (!env.PORTFOLIO_SYNC_KEY) return json({ error: "Missing PORTFOLIO_SYNC_KEY secret" }, 500);
  if (!env.DB) return json({ error: "Missing D1 database binding named DB" }, 500);
  if (!(await authorized(request, env))) return json({ error: "Invalid private sync key" }, 401);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS portfolio (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
  if (request.method === "GET") {
    const row = await env.DB.prepare("SELECT data, updated_at FROM portfolio WHERE id = 1").first();
    if (!row) return json({ portfolio: null });
    try { return json({ portfolio: { stocks: JSON.parse(row.data), updatedAt: row.updated_at } }); }
    catch { return json({ error: "Stored portfolio data is invalid" }, 500); }
  }
  if (request.method === "PUT") {
    let body;
    try { body = await request.json(); } catch { return json({ error: "Request body must be JSON" }, 400); }
    if (!Array.isArray(body.stocks) || body.stocks.length > 250 || !body.stocks.every(validStock)) return json({ error: "Portfolio data is invalid" }, 400);
    const data = JSON.stringify(body.stocks);
    if (data.length > 500000) return json({ error: "Portfolio is too large" }, 413);
    const updatedAt = new Date().toISOString();
    await env.DB.prepare("INSERT INTO portfolio (id, data, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at").bind(data, updatedAt).run();
    return json({ saved: true, updatedAt });
  }
  return json({ error: "Method not allowed" }, 405);
}
async function quotes(request, env, url) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!env.TWELVE_DATA_API_KEY) return json({ error: "Missing TWELVE_DATA_API_KEY secret" }, 500);
  const raw = (url.searchParams.get("symbols") || "").trim();
  const symbols = [...new Set(raw.split(",").map(s => s.trim().toUpperCase()).filter(s => /^[A-Z0-9.\-]{1,15}$/.test(s)))].slice(0, 20);
  if (!symbols.length) return json({ error: "Add at least one valid symbol using ?symbols=AAPL,MSFT" }, 400);
  const result = await Promise.all(symbols.map(async symbol => {
    try {
      const api = new URL("https://api.twelvedata.com/quote");
      api.searchParams.set("symbol", symbol); api.searchParams.set("apikey", env.TWELVE_DATA_API_KEY);
      const response = await fetch(api.toString(), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (!response.ok || data.status === "error") throw new Error(data.message || ("HTTP " + response.status));
      const price = Number(data.close), previousClose = Number(data.previous_close);
      if (!Number.isFinite(price) || price <= 0) throw new Error("No valid price returned");
      return { symbol, quote: { price, previousClose: Number.isFinite(previousClose) ? previousClose : null } };
    } catch (error) { return { symbol, error: error.message || "Quote failed" }; }
  }));
  const quotes = {}, errors = {};
  result.forEach(item => item.quote ? quotes[item.symbol] = item.quote : errors[item.symbol] = item.error);
  if (!Object.keys(quotes).length) return json({ error: "No quotes could be updated", errors, updatedAt: new Date().toISOString() }, 502);
  return json({ quotes, errors, updatedAt: new Date().toISOString(), source: "Twelve Data" });
}
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const url = new URL(request.url);
    if (url.pathname === "/portfolio") return portfolio(request, env);
    return quotes(request, env, url);
  },
};
