const assert = require("node:assert/strict");
const {HEADERS, parseRobinhoodCsv, mergeRobinhoodEntries, buildRobinhoodCsv} = require("./robinhood-csv.js");

const csv = `${HEADERS.map(value => `"${value}"`).join(",")}\r\n` +
  '"8/13/2026","8/13/2026","8/14/2026","AMZN","Amazon\nCUSIP: 023135106","Buy","0.112683","$265.70","($29.94)"\r\n' +
  '"8/13/2026","8/13/2026","8/14/2026","STI","Solidion Technology","Sell","0.6","$7.80","$4.68"\r\n' +
  '"8/11/2026","8/11/2026","8/12/2026","","ACH Deposit","ACH","","","$25.00"\r\n' +
  '"8/11/2026","8/11/2026","8/12/2026","","ACH Deposit","ACH","","","$25.00"\r\n' +
  '"8/10/2026","8/10/2026","8/10/2026","NVDA","Pending Limit Sell","LS","2","$227.50","$455.00"\r\n' +
  '"8/9/2026","8/9/2026","8/9/2026","AAPL","Pending Limit Buy","LB","0.5","$190.00","($95.00)"\r\n' +
  '"8/12/2026","8/12/2026","8/12/2026","AAPL","Cash Div","CDIV","","","$0.06"\r\n';

const parsed = parseRobinhoodCsv(csv);
assert.equal(parsed.entries.length, 6);
assert.equal(parsed.unsupportedRows, 1);
assert.equal(parsed.unsupportedCodes.CDIV, 1);
assert.equal(parsed.entries[0].type, "buy");
assert.equal(parsed.entries[0].shares, 0.112683);
assert.equal(parsed.entries[0].pricePerShare, 265.70);
assert.equal(parsed.entries[0].amount, 29.94);
assert.match(parsed.entries[0].note, /CUSIP/);
assert.equal(parsed.entries[2].externalId, parsed.entries[3].externalId);
assert.notEqual(parsed.entries[2].id, parsed.entries[3].id);
assert.equal(parsed.entries[4].type, "sell");
assert.equal(parsed.entries[4].status, "pending");
assert.equal(parsed.entries[4].orderKind, "limit");
assert.equal(parsed.entries[5].type, "buy");
assert.equal(parsed.entries[5].status, "pending");

const firstMerge = mergeRobinhoodEntries([], parsed.entries);
assert.equal(firstMerge.additions.length, 6);
assert.equal(firstMerge.duplicateCount, 0);
const repeatedMerge = mergeRobinhoodEntries(firstMerge.additions, parsed.entries);
assert.equal(repeatedMerge.additions.length, 0);
assert.equal(repeatedMerge.duplicateCount, 6);
const oneExistingDeposit = mergeRobinhoodEntries([parsed.entries[2]], [parsed.entries[2], parsed.entries[3]]);
assert.equal(oneExistingDeposit.additions.length, 1);
assert.equal(oneExistingDeposit.duplicateCount, 1);

const exported = buildRobinhoodCsv(parsed.entries);
assert.equal(exported.rowCount, 6);
assert.equal(exported.pendingCount, 2);
assert.equal(exported.csv.split("\r\n")[0], HEADERS.map(value => `"${value}"`).join(","));
const roundTrip = parseRobinhoodCsv(exported.csv);
assert.equal(roundTrip.entries.length, 6);
assert.equal(mergeRobinhoodEntries(parsed.entries, roundTrip.entries).duplicateCount, 6);

const manualEntries = [
  {type: "buy", symbol: "AAPL", shares: 2, pricePerShare: 100, amount: 200, status: "executed", source: "log", tradedAt: "2026-08-01T12:00:00Z", note: "Test"},
  {type: "sell", symbol: "AAPL", shares: 1, pricePerShare: 120, amount: 120, status: "executed", source: "log", tradedAt: "2026-08-02T12:00:00Z"},
  {type: "buy", symbol: "AAPL", shares: 1, pricePerShare: 90, amount: 90, status: "pending", source: "log", tradedAt: "2026-08-03T12:00:00Z"},
];
const manualExport = buildRobinhoodCsv(manualEntries);
assert.equal(manualExport.rowCount, 3);
assert.equal(manualExport.pendingCount, 1);
assert.match(manualExport.csv, /"Buy","2","\$100\.00","\(\$200\.00\)"/);
assert.match(manualExport.csv, /"Sell","1","\$120\.00","\$120\.00"/);
assert.match(manualExport.csv, /"LB","1","\$90\.00","\(\$90\.00\)"/);
const manualRoundTrip = parseRobinhoodCsv(manualExport.csv);
assert.equal(manualRoundTrip.entries.find(entry => entry.status === "pending").pricePerShare, 90);
assert.equal(mergeRobinhoodEntries(manualEntries, manualRoundTrip.entries.filter(entry => entry.status === "pending")).duplicateCount, 1);

const optionCsv = `${HEADERS.map(value => `"${value}"`).join(",")}\r\n` +
  '"7/29/2026","7/29/2026","7/30/2026","F","F 8/7/2026 Put $14.00","BTO","1","$0.06","($6.04)"\r\n' +
  '"7/31/2026","7/31/2026","8/3/2026","F","F 8/7/2026 Put $14.00","STC","1","$0.11","$10.94"\r\n' +
  '"8/7/2026","8/7/2026","8/7/2026","SOFI","Option Expiration for SOFI 8/7/2026 Call $21.00","OEXP","1S","",""\r\n';
const parsedOptions = parseRobinhoodCsv(optionCsv);
assert.equal(parsedOptions.entries.length, 3);
assert.equal(parsedOptions.unsupportedRows, 0);
assert.equal(parsedOptions.entries[0].type, "option_buy");
assert.equal(parsedOptions.entries[0].amount, 6.04);
assert.equal(parsedOptions.entries[1].type, "option_sell");
assert.equal(parsedOptions.entries[2].type, "option_expire");
assert.equal(parsedOptions.entries[2].shares, 1);
assert.equal(parsedOptions.entries[2].optionContract, "SOFI 8/7/2026 Call $21.00");
const exportedOptions = buildRobinhoodCsv(parsedOptions.entries);
assert.equal(exportedOptions.rowCount, 3);
assert.equal(parseRobinhoodCsv(exportedOptions.csv).entries.length, 3);

const manualOptionExport = buildRobinhoodCsv([
  {type: "option_buy", symbol: "MSFT", optionContract: "MSFT 8/7/2026 Put $370.00", shares: 1, pricePerShare: 0.13, amount: 13.04, status: "executed", tradedAt: "2026-07-30T12:00:00Z"},
  {type: "option_expire", symbol: "MSFT", optionContract: "MSFT 8/7/2026 Put $370.00", shares: 1, amount: 0, status: "executed", tradedAt: "2026-08-07T12:00:00Z"},
]);
assert.match(manualOptionExport.csv, /"BTO","1","\$0\.13","\(\$13\.04\)"/);
assert.match(manualOptionExport.csv, /"OEXP","1S","",""/);
assert.equal(parseRobinhoodCsv(manualOptionExport.csv).entries.length, 2);

const exportWithNotes = buildRobinhoodCsv([], [
  {symbol: "AAPL", note: "Wait for earnings before adding shares."},
  {symbol: "MSFT", note: ""},
]);
assert.equal(exportWithNotes.rowCount, 1);
assert.equal(exportWithNotes.noteCount, 1);
assert.match(exportWithNotes.csv, /"AAPL","Wait for earnings before adding shares\.","NOTE"/);
const importedNotes = parseRobinhoodCsv(exportWithNotes.csv);
assert.deepEqual(importedNotes.stockNotes, [{symbol: "AAPL", note: "Wait for earnings before adding shares."}]);
assert.equal(importedNotes.unsupportedRows, 0);

console.log("Robinhood CSV tests: OK");
