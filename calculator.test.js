const assert = require("node:assert/strict");
const { calculate } = require("./calculator.js");

const mrvl = calculate({
  symbol: "MRVL",
  current: 220,
  buyPrice: 205.57,
  invested: 20,
  growthGoal: 0.03,
  harvestRate: 0.20,
  minimumHarvest: 1,
  previousClose: 210.99,
});
assert.ok(Math.abs(mrvl.shares - (20 / 205.57)) < 1e-12);
assert.ok(Math.abs(mrvl.harvestPrice - 256.9625) < 1e-8);
assert.equal(mrvl.eligible, false);
assert.equal(mrvl.action, "Wait");

const ready = calculate({
  symbol: "TEST",
  current: 300,
  buyPrice: 200,
  invested: 20,
  growthGoal: 0.03,
  harvestRate: 0.20,
  minimumHarvest: 1,
  previousClose: 290,
});
assert.equal(ready.eligible, true);
assert.ok(Math.abs(ready.harvestCash - 2) < 1e-12);
assert.ok(Math.abs(ready.sharesToSell - (2 / 300)) < 1e-12);

const goalControls = calculate({
  symbol: "GOAL",
  current: 105,
  buyPrice: 100,
  invested: 100,
  growthGoal: 0.10,
  harvestRate: 1,
  minimumHarvest: 1,
  previousClose: 100,
});
assert.equal(goalControls.requiredProfit, 10);
assert.equal(goalControls.eligible, false);
assert.equal(goalControls.harvestPrice, 110);

const zeroRate = calculate({
  symbol: "ZERO",
  current: 200,
  buyPrice: 100,
  invested: 100,
  growthGoal: 0.03,
  harvestRate: 0,
  minimumHarvest: 1,
});
assert.equal(zeroRate.eligible, false);
assert.equal(zeroRate.harvestPrice, 0);

console.log("calculator tests: OK");
