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
  pricePerShare: 200, tradedAt: "2026-01-01T10:00:00.000Z", createdAt: "2026-01-01T10:00:00.000Z",
};
const database = createDatabase();
const env = { DB: database, PORTFOLIO_SYNC_KEY: "a-private-sync-key" };
const headers = { "Content-Type": "application/json", Authorization: "Bearer a-private-sync-key" };

const putResponse = await worker.fetch(new Request("https://example.test/portfolio", {
  method: "PUT", headers, body: JSON.stringify({ stocks: [stock], trades: [trade] }),
}), env);
assert.equal(putResponse.status, 200);

const getResponse = await worker.fetch(new Request("https://example.test/portfolio", { headers }), env);
assert.equal(getResponse.status, 200);
const saved = await getResponse.json();
assert.deepEqual(saved.portfolio.stocks, [stock]);
assert.deepEqual(saved.portfolio.trades, [trade]);

database.state.data = JSON.stringify([stock]);
const legacyResponse = await worker.fetch(new Request("https://example.test/portfolio", { headers }), env);
const legacy = await legacyResponse.json();
assert.deepEqual(legacy.portfolio.stocks, [stock]);
assert.deepEqual(legacy.portfolio.trades, []);

const invalidResponse = await worker.fetch(new Request("https://example.test/portfolio", {
  method: "PUT", headers, body: JSON.stringify({ stocks: [stock], trades: [{ ...trade, shares: 0 }] }),
}), env);
assert.equal(invalidResponse.status, 400);

console.log("worker storage tests: OK");
