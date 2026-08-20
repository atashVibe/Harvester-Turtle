const assert = require("node:assert/strict");
const {HEADERS, parseRobinhoodCsv, mergeRobinhoodEntries, buildRobinhoodCsv} = require("./robinhood-csv.js");

const csv = `${HEADERS.map(value => `"${value}"`).join(",")}\r\n` +
  '"8/13/2026","8/13/2026","8/14/2026","AMZN","Amazon\nCUSIP: 023135106","Buy","0.112683","$265.70","($29.94)"\r\n' +
  '"8/13/2026","8/13/2026","8/14/2026","STI","Solidion Technology","Sell","0.6","$7.80","$4.68"\r\n' +
  '"8/11/2026","8/11/2026","8/12/2026","","ACH Deposit","ACH","","","$25.00"\r\n' +
  '"8/11/2026","8/11/2026","8/12/2026","","ACH Deposit","ACH","","","$25.00"\r\n' +
  '"8/12/2026","8/12/2026","8/12/2026","AAPL","Cash Div","CDIV","","","$0.06"\r\n';

const parsed = parseRobinhoodCsv(csv);
assert.equal(parsed.entries.length, 4);
assert.equal(parsed.unsupportedRows, 1);
assert.equal(parsed.unsupportedCodes.CDIV, 1);
assert.equal(parsed.entries[0].type, "buy");
assert.equal(parsed.entries[0].shares, 0.112683);
assert.equal(parsed.entries[0].pricePerShare, 265.70);
assert.equal(parsed.entries[0].amount, 29.94);
assert.match(parsed.entries[0].note, /CUSIP/);
assert.equal(parsed.entries[2].externalId, parsed.entries[3].externalId);
assert.notEqual(parsed.entries[2].id, parsed.entries[3].id);

const firstMerge = mergeRobinhoodEntries([], parsed.entries);
assert.equal(firstMerge.additions.length, 4);
assert.equal(firstMerge.duplicateCount, 0);
const repeatedMerge = mergeRobinhoodEntries(firstMerge.additions, parsed.entries);
assert.equal(repeatedMerge.additions.length, 0);
assert.equal(repeatedMerge.duplicateCount, 4);
const oneExistingDeposit = mergeRobinhoodEntries([parsed.entries[2]], [parsed.entries[2], parsed.entries[3]]);
assert.equal(oneExistingDeposit.additions.length, 1);
assert.equal(oneExistingDeposit.duplicateCount, 1);

const exported = buildRobinhoodCsv(parsed.entries);
assert.equal(exported.rowCount, 4);
assert.equal(exported.csv.split("\r\n")[0], HEADERS.map(value => `"${value}"`).join(","));
const roundTrip = parseRobinhoodCsv(exported.csv);
assert.equal(roundTrip.entries.length, 4);
assert.equal(mergeRobinhoodEntries(parsed.entries, roundTrip.entries).duplicateCount, 4);

const manualExport = buildRobinhoodCsv([
  {type: "buy", symbol: "AAPL", shares: 2, pricePerShare: 100, amount: 200, status: "executed", source: "log", tradedAt: "2026-08-01T12:00:00Z", note: "Test"},
  {type: "sell", symbol: "AAPL", shares: 1, pricePerShare: 120, amount: 120, status: "executed", source: "log", tradedAt: "2026-08-02T12:00:00Z"},
  {type: "buy", symbol: "AAPL", shares: 1, pricePerShare: 90, amount: 90, status: "pending", source: "log", tradedAt: "2026-08-03T12:00:00Z"},
]);
assert.equal(manualExport.rowCount, 2);
assert.equal(manualExport.skippedPending, 1);
assert.match(manualExport.csv, /"Buy","2","\$100\.00","\(\$200\.00\)"/);
assert.match(manualExport.csv, /"Sell","1","\$120\.00","\$120\.00"/);

console.log("Robinhood CSV tests: OK");
