import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workerSource = await readFile(new URL("./worker.js", import.meta.url), "utf8");
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`);

function createDatabase(initialData = null) {
  const state = { data: initialData, updatedAt: "2026-01-01T00:00:00.000Z" };
  return {
    state,
    prepare(sql) {
      let values = [];
      return {
        bind(...boundValues) { values = boundValues; return this; },
        async first() {
          if (!sql.startsWith("SELECT") || state.data === null) return null;
          return { data: state.data, updated_at: state.updatedAt };
        },
        async run() {
          if (sql.startsWith("INSERT")) {
            state.data = values[0];
            state.updatedAt = values[1];
          }
          return { success: true };
        },
      };
    },
  };
}

const stock = {
  id: "stock-1", symbol: "AMZN", current: 215, buyPrice: 200, invested: 400,
  previousClose: 210, growthGoal: 0.03, harvestRate: 0.2, minimumHarvest: 1,
};
const trade = {
  id: "trade-1", type: "buy", symbol: "AMZN", amount: 400, shares: 2,
  pricePerShare: 200, orderKind: "market", status: "executed", tradedAt: "2026-01-01T10:00:00.000Z", createdAt: "2026-01-01T10:00:00.000Z",
};
const pendingLimit = {
  id: "limit-1", type: "sell", symbol: "AMZN", amount: 250, shares: 1,
  pricePerShare: 250, orderKind: "limit", status: "pending", tradedAt: "2026-01-02T10:00:00.000Z", createdAt: "2026-01-02T10:00:00.000Z",
};
const deposit = {id: "deposit-1", type: "deposit", amount: 1000, tradedAt: "2026-01-01T09:00:00.000Z", note: "Transfer"};
const optionBuy = {id: "option-1", type: "option_buy", symbol: "F", optionContract: "F 8/7/2026 Put $14.00", shares: 1, pricePerShare: 0.06, amount: 6.04, orderKind: "option", status: "executed", tradedAt: "2026-07-29T12:00:00.000Z"};
const optionExpiration = {id: "option-2", type: "option_expire", symbol: "F", optionContract: "F 8/7/2026 Put $14.00", shares: 1, pricePerShare: 0, amount: 0, orderKind: "option", status: "executed", tradedAt: "2026-08-07T12:00:00.000Z"};
const preferences = {dailyRefreshLimit: 20, taxRate: 0.30};
const database = createDatabase();
const env = { DB: database, PORTFOLIO_SYNC_KEY: "a-private-sync-key" };
const headers = { "Content-Type": "application/json", Authorization: "Bearer a-private-sync-key" };

const putResponse = await worker.fetch(new Request("https://example.test/portfolio", {
  method: "PUT", headers, body: JSON.stringify({ stocks: [{...stock, note: "Watch earnings"}], trades: [trade, pendingLimit, deposit, optionBuy, optionExpiration], preferences }),
}), env);
assert.equal(putResponse.status, 200);

const getResponse = await worker.fetch(new Request("https://example.test/portfolio", { headers }), env);
assert.equal(getResponse.status, 200);
const saved = await getResponse.json();
assert.deepEqual(saved.portfolio.stocks, [{...stock, note: "Watch earnings"}]);
assert.deepEqual(saved.portfolio.trades, [trade, pendingLimit, deposit, optionBuy, optionExpiration]);
assert.deepEqual(saved.portfolio.preferences, preferences);

const emptyPreferences = {dailyRefreshLimit: 12, taxRate: 0.25};
const emptyPutResponse = await worker.fetch(new Request("https://example.test/portfolio", {
  method: "PUT", headers, body: JSON.stringify({ stocks: [], trades: [], preferences: emptyPreferences }),
}), env);
assert.equal(emptyPutResponse.status, 200);
const emptyGetResponse = await worker.fetch(new Request("https://example.test/portfolio", { headers }), env);
const emptySaved = await emptyGetResponse.json();
assert.deepEqual(emptySaved.portfolio.stocks, []);
assert.deepEqual(emptySaved.portfolio.trades, []);
assert.deepEqual(emptySaved.portfolio.preferences, emptyPreferences);

database.state.data = JSON.stringify([stock]);
const legacyResponse = await worker.fetch(new Request("https://example.test/portfolio", { headers }), env);
const legacy = await legacyResponse.json();
assert.deepEqual(legacy.portfolio.stocks, [stock]);
assert.deepEqual(legacy.portfolio.trades, []);

const invalidResponse = await worker.fetch(new Request("https://example.test/portfolio", {
  method: "PUT", headers, body: JSON.stringify({ stocks: [stock], trades: [{ ...trade, shares: 0 }] }),
}), env);
assert.equal(invalidResponse.status, 400);

const rangeCache = new Map();
globalThis.caches = {default: {
  async match(request) { const savedResponse = rangeCache.get(request.url); return savedResponse ? savedResponse.clone() : undefined; },
  async put(request, response) { rangeCache.set(request.url, response.clone()); },
}};
let providerCalls = [];
globalThis.fetch = async url => {
  providerCalls.push(url);
  const headers = {"api-credits-left": "7", "api-credits-used": "1"};
  if (url.includes("/time_series")) {
    const values = Array.from({length: 16}, (_, index) => ({close: String(200 - index), high: String(210 + index), low: String(190 - index)}));
    return new Response(JSON.stringify({status: "ok", values}), {status: 200, headers});
  }
  return new Response(JSON.stringify({close: "205", previous_close: "200"}), {status: 200, headers});
};
const marketEnv = {TWELVE_DATA_API_KEY: "secret"};
const firstMarketResponse = await worker.fetch(new Request("https://example.test/?symbols=AAPL"), marketEnv);
assert.equal(firstMarketResponse.status, 200);
const firstMarket = await firstMarketResponse.json();
assert.equal(firstMarket.quotes.AAPL.price, 200);
assert.equal(firstMarket.quotes.AAPL.previousClose, 199);
assert.equal(firstMarket.quotes.AAPL.high15, 224);
assert.equal(firstMarket.quotes.AAPL.low15, 176);
assert.equal(firstMarket.quota.creditsLeft, 7);
assert.equal(providerCalls.filter(url => url.includes("/time_series")).length, 1);

const secondMarketResponse = await worker.fetch(new Request("https://example.test/?symbols=AAPL"), marketEnv);
const secondMarket = await secondMarketResponse.json();
assert.equal(secondMarket.quotes.AAPL.price, 205);
assert.equal(secondMarket.quotes.AAPL.high15, 224);
assert.equal(providerCalls.filter(url => url.includes("/quote")).length, 1);

console.log("worker storage and market tests: OK");
