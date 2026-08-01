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
assert.ok(Math.abs(mrvl.harvestPrice - 211.7371) < 1e-8);
assert.equal(mrvl.eligible, false);
assert.equal(mrvl.action, "Wait");
assert.ok(mrvl.potentialHarvestCash < mrvl.minimumHarvest);

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
assert.equal(ready.harvestPrice, 206);

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
assert.equal(goalControls.goalPriceIncrease, 10);
assert.equal(goalControls.eligible, false);
assert.equal(goalControls.harvestPrice, 110);

const sameTargetLargerInvestment = calculate({
  symbol: "SAME",
  current: 105,
  buyPrice: 100,
  invested: 1000,
  growthGoal: 0.10,
  harvestRate: 0.20,
  minimumHarvest: 1,
});
assert.equal(sameTargetLargerInvestment.harvestPrice, goalControls.harvestPrice);

const belowMinimumCash = calculate({
  symbol: "MIN",
  current: 110,
  buyPrice: 100,
  invested: 100,
  growthGoal: 0.05,
  harvestRate: 0.20,
  minimumHarvest: 3,
});
assert.equal(belowMinimumCash.meetsGrowthGoal, true);
assert.equal(belowMinimumCash.potentialHarvestCash, 2);
assert.equal(belowMinimumCash.meetsMinimumCash, false);
assert.equal(belowMinimumCash.eligible, false);
assert.equal(belowMinimumCash.harvestCash, 0);

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
assert.equal(zeroRate.harvestPrice, 103);

console.log("calculator tests: OK");
