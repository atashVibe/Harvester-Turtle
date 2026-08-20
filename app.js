const { calculate, normalizeStock } = HarvesterCalculator;
const { normalizeTrade, isValidTrade, sortTrades, calculateLedger } = HarvesterTrades;
const { parseRobinhoodCsv, mergeRobinhoodEntries, buildRobinhoodCsv } = HarvesterRobinhoodCsv;
const $ = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
const STATE_KEY = "harvesterStateV4";
const SETTINGS_KEY = "harvesterAppSettingsV1";
const REFRESH_KEY = "harvesterRefreshUsageV1";
const MIGRATION_BACKUP_KEY = "harvesterMigrationBackupV4";
const DEFAULT_API_URL = "https://summer-river-8271.atash1317.workers.dev";
const seed = [
  {symbol:"MRVL",current:220,buyPrice:205.57,invested:20,growthGoal:.03,harvestRate:.20,minimumHarvest:1,previousClose:210.99},
  {symbol:"NVDA",current:208.76,buyPrice:207.33,invested:34.7,growthGoal:.03,harvestRate:.20,minimumHarvest:1,previousClose:212.06},
  {symbol:"MSFT",current:381.58,buyPrice:396.45,invested:1.49,growthGoal:.03,harvestRate:.20,minimumHarvest:1,previousClose:390.34},
  {symbol:"SPY",current:738.3,buyPrice:753.98,invested:12.06,growthGoal:.03,harvestRate:.20,minimumHarvest:1,previousClose:747.41},
  {symbol:"STI",current:6.84,buyPrice:8.48,invested:14.95,growthGoal:.03,harvestRate:.20,minimumHarvest:1,previousClose:6.55},
  {symbol:"VSAT",current:74.27,buyPrice:75.44,invested:5.18,growthGoal:.03,harvestRate:.20,minimumHarvest:1,previousClose:74.37},
  {symbol:"CTOS",current:10.88,buyPrice:10.43,invested:10.43,growthGoal:.03,harvestRate:.20,minimumHarvest:1,previousClose:10.53},
  {symbol:"PYPL",current:56,buyPrice:54.66,invested:2.76,growthGoal:.03,harvestRate:.20,minimumHarvest:1,previousClose:55.51},
  {symbol:"ASTS",current:59.18,buyPrice:59.22,invested:5.45,growthGoal:.03,harvestRate:.20,minimumHarvest:1,previousClose:61.95},
  {symbol:"SPCX",current:118.24,buyPrice:122.41,invested:20,growthGoal:.03,harvestRate:.20,minimumHarvest:1,previousClose:115.26}
];

const money = number => Number.isFinite(number) ? number.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : "—";
const quantity = (number, digits = 6) => Number.isFinite(number) ? number.toLocaleString(undefined, {maximumFractionDigits: digits}) : "—";
const percent = number => Number.isFinite(number) ? `${(number * 100).toFixed(2)}%` : "—";
const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const localDay = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const toLocalDateTimeValue = value => {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const daysAgo = value => Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));

function normalizeStockState(stock) {
  const normalized = normalizeStock(stock);
  return {
    ...normalized,
    shares: undefined,
    high15: Math.max(0, Number(stock && stock.high15) || 0),
    low15: Math.max(0, Number(stock && stock.low15) || 0),
    marketDataAt: String((stock && stock.marketDataAt) || ""),
  };
}

function backupBeforeMigration() {
  if (localStorage.getItem(MIGRATION_BACKUP_KEY)) return;
  try {
    const backup = {
      createdAt: new Date().toISOString(),
      harvesterDataV2: localStorage.getItem("harvesterDataV2"),
      harvesterData: localStorage.getItem("harvesterData"),
      harvesterTradesV1: localStorage.getItem("harvesterTradesV1"),
      harvesterStateV3: localStorage.getItem("harvesterStateV3"),
    };
    localStorage.setItem(MIGRATION_BACKUP_KEY, JSON.stringify(backup));
  } catch {}
}

function loadAppSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    const savedTaxRate = Number(saved && saved.taxRate);
    return {
      dailyRefreshLimit: Math.min(100, Math.max(1, Number(saved && saved.dailyRefreshLimit) || 20)),
      taxRate: Number.isFinite(savedTaxRate) ? Math.min(1, Math.max(0, savedTaxRate)) : 0.30,
    };
  } catch {
    return {dailyRefreshLimit: 20, taxRate: 0.30};
  }
}

function loadState() {
  try {
    const current = JSON.parse(localStorage.getItem(STATE_KEY));
    if (current && Array.isArray(current.stocks) && Array.isArray(current.trades)) {
      return {
        stocks: current.stocks.map(normalizeStockState).filter(stock => stock.symbol),
        trades: current.trades.map(normalizeTrade).filter(isValidTrade),
        savedAt: String(current.savedAt || ""),
        dirty: current.dirty === true,
      };
    }
  } catch {}
  let stocks = [];
  let trades = [];
  try {
    const currentStocks = JSON.parse(localStorage.getItem("harvesterDataV2"));
    const legacyStocks = JSON.parse(localStorage.getItem("harvesterData"));
    const source = Array.isArray(currentStocks) && currentStocks.length ? currentStocks : Array.isArray(legacyStocks) && legacyStocks.length ? legacyStocks : seed;
    stocks = source.map(normalizeStockState).filter(stock => stock.symbol);
  } catch {
    stocks = clone(seed).map(normalizeStockState);
  }
  try {
    const legacyTrades = JSON.parse(localStorage.getItem("harvesterTradesV1"));
    if (Array.isArray(legacyTrades)) trades = legacyTrades.map(normalizeTrade).filter(isValidTrade);
  } catch {}
  return {stocks, trades, savedAt: "", dirty: false};
}

function migrateOpeningPositions(stocks, trades) {
  const result = [...trades];
  const symbolsWithBuys = new Set(result.filter(item => item.type === "buy" && item.status === "executed").map(item => item.symbol));
  stocks.forEach(stock => {
    if (symbolsWithBuys.has(stock.symbol) || stock.invested <= 0 || stock.buyPrice <= 0) return;
    result.push(normalizeTrade({
      id: `opening-${stock.id}`,
      type: "buy",
      symbol: stock.symbol,
      shares: stock.invested / stock.buyPrice,
      pricePerShare: stock.buyPrice,
      amount: stock.invested,
      tradedAt: "2000-01-01T00:00:00.000Z",
      createdAt: new Date().toISOString(),
      source: "opening",
      note: "Opening position migrated from the existing portfolio",
    }));
  });
  return result;
}

backupBeforeMigration();
let appSettings = loadAppSettings();
const loaded = loadState();
let stocks = loaded.stocks;
let trades = migrateOpeningPositions(stocks, loaded.trades);
let stateSavedAt = loaded.savedAt;
let localDirty = loaded.dirty;
let cloudReady = false;
let syncTimer = null;
let cloudSyncPromise = null;
let priceRefreshRunning = false;
let portfolioSortKey = "symbol";
let portfolioSortDirection = "asc";
const tableWrap = $("tableWrap");
const tableScrollControls = $("tableScrollControls");
const tableScrollPosition = $("tableScrollPosition");
const scrollTableLeft = $("scrollTableLeft");
const scrollTableRight = $("scrollTableRight");
const mainTable = tableWrap.querySelector("table");
const tableHead = mainTable.tHead;
const floatingTableHeader = $("floatingTableHeader");
const floatingTableHeaderScroll = $("floatingTableHeaderScroll");
const floatingTableHeaderTable = $("floatingTableHeaderTable");
const floatingTableHead = $("floatingTableHead");
floatingTableHead.innerHTML = tableHead.innerHTML;

function saveSettingsLocal() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
}
function persist({sync = true, preserveTimestamp = false, markDirty = true} = {}) {
  if (!preserveTimestamp) stateSavedAt = new Date().toISOString();
  if (markDirty) localDirty = true;
  localStorage.setItem(STATE_KEY, JSON.stringify({version: 4, savedAt: stateSavedAt, dirty: localDirty, stocks, trades}));
  saveSettingsLocal();
  if (sync && cloudReady) scheduleCloudSave();
}
if (!loaded.savedAt || trades.length !== loaded.trades.length) persist({sync: false, preserveTimestamp: true, markDirty: false});

function pill(text) {
  let tone = "";
  if (["Harvest", "Harvest Ready", "Strong Harvest"].includes(text)) tone = "good";
  else if (["Buy More", "Maybe"].includes(text)) tone = "warn";
  else if (text === "Strong Buy") tone = "bad";
  return `<span class="pill ${tone}">${escapeHtml(text || "—")}</span>`;
}
function signalLights(stock) {
  const red = stock.suggestion === "Strong Buy";
  const yellow = stock.suggestion === "Buy More";
  const green = stock.action === "Harvest";
  const label = [red && "Strong Buy", yellow && "Buy More", green && "Harvest"].filter(Boolean).join(", ") || "Hold";
  return `<span class="signal-lights" role="img" aria-label="${label}" title="${label}"><span class="signal red ${red ? "active" : ""}"></span><span class="signal yellow ${yellow ? "active" : ""}"></span><span class="signal green ${green ? "active" : ""}"></span></span>`;
}
function stockInput(stock, key, value, {step = "0.01", max = "", readonly = false} = {}) {
  if (readonly) return `<span title="Calculated from executed logs">${escapeHtml(value)}</span>`;
  return `<input data-id="${escapeHtml(stock.id)}" data-key="${key}" type="number" inputmode="decimal" enterkeyhint="next" step="${step}" min="0" ${max ? `max="${max}"` : ""} value="${escapeHtml(value)}">`;
}
function pendingLimitControl(items) {
  if (!items || !items.length) return "";
  const options = items.map(item => {
    const code = item.type === "buy" ? "LB" : "LS";
    const label = `${code}-$${Number(item.pricePerShare).toLocaleString(undefined, {maximumFractionDigits: 4})}-${daysAgo(item.createdAt)}d`;
    return `<option>${escapeHtml(label)}</option>`;
  }).join("");
  return `<select class="limit-summary" aria-label="Pending limit orders">${options}</select>`;
}

function currentLedger() {
  return calculateLedger(trades, appSettings.taxRate);
}
function makePortfolioRows(ledger) {
  const executedSymbols = new Set(ledger.entries.filter(entry => entry.type === "buy" && entry.status === "executed").map(entry => entry.symbol));
  return stocks.map(stock => {
    const holding = ledger.holdings[stock.symbol] || {shares: 0, cost: 0, averagePrice: 0};
    const pending = ledger.pendingBySymbol[stock.symbol] || [];
    const pendingBuy = pending.filter(item => item.type === "buy").reduce((sum, item) => sum + item.amount, 0);
    const pendingAmount = pending.reduce((sum, item) => sum + item.amount, 0);
    const loggedBasis = executedSymbols.has(stock.symbol);
    const averagePrice = loggedBasis ? holding.averagePrice : stock.buyPrice;
    const openCost = loggedBasis ? holding.cost : stock.invested;
    const explicitShares = loggedBasis ? holding.shares : undefined;
    const calculated = calculate({...stock, buyPrice: averagePrice, invested: openCost, shares: explicitShares});
    return {stock, pending, pendingAmount, loggedBasis, averagePrice, calculated, displayedInvested: calculated.invested + pendingBuy};
  });
}
function portfolioSortValue(row, key) {
  if (key === "invested") return row.displayedInvested;
  if (key === "pendingAmount") return row.pendingAmount;
  return row.calculated[key] ?? row.stock[key] ?? "";
}
function comparePortfolioRows(left, right) {
  const leftValue = portfolioSortValue(left, portfolioSortKey);
  const rightValue = portfolioSortValue(right, portfolioSortKey);
  let result;
  if (typeof leftValue === "string" || typeof rightValue === "string") result = String(leftValue).localeCompare(String(rightValue), undefined, {numeric: true, sensitivity: "base"});
  else result = (Number(leftValue) || 0) - (Number(rightValue) || 0);
  if (result === 0 && portfolioSortKey !== "symbol") result = left.stock.symbol.localeCompare(right.stock.symbol, undefined, {numeric: true, sensitivity: "base"});
  return portfolioSortDirection === "asc" ? result : -result;
}
function updateSortHeaders() {
  document.querySelectorAll("th[data-sort]").forEach(header => {
    const active = header.dataset.sort === portfolioSortKey;
    header.classList.toggle("sort-asc", active && portfolioSortDirection === "asc");
    header.classList.toggle("sort-desc", active && portfolioSortDirection === "desc");
    header.setAttribute("aria-sort", active ? (portfolioSortDirection === "asc" ? "ascending" : "descending") : "none");
  });
}
function selectPortfolioSort(header) {
  const key = header.dataset.sort;
  if (!key) return;
  if (portfolioSortKey === key) portfolioSortDirection = portfolioSortDirection === "asc" ? "desc" : "asc";
  else { portfolioSortKey = key; portfolioSortDirection = "asc"; }
  updateSortHeaders();
  render();
}
function render() {
  const ledger = currentLedger();
  const portfolioRows = makePortfolioRows(ledger).sort(comparePortfolioRows);
  $("rows").innerHTML = stocks.length ? "" : '<tr><td class="empty" colspan="22">Add a stock to begin.</td></tr>';
  let totalInvestedAmount = 0;
  let totalValueAmount = 0;
  let totalProfitAmount = 0;
  let totalHarvestAmount = 0;
  portfolioRows.forEach(({stock, pending, loggedBasis, averagePrice, calculated, displayedInvested}) => {
    totalInvestedAmount += displayedInvested;
    totalValueAmount += calculated.currentValue;
    totalProfitAmount += calculated.profit;
    totalHarvestAmount += calculated.harvestCash;
    $("rows").insertAdjacentHTML("beforeend", `<tr>
      <td><div class="symbol-cell">${signalLights(calculated)}<span class="stock-symbol">${escapeHtml(stock.symbol)}</span></div></td>
      <td>${stockInput(stock, "current", stock.current.toFixed(2))}</td>
      <td>${stockInput(stock, "buyPrice", averagePrice.toFixed(2), {readonly: loggedBasis})}</td>
      <td>${loggedBasis ? money(displayedInvested) : stockInput(stock, "invested", displayedInvested.toFixed(2))}</td>
      <td>${pendingLimitControl(pending)}</td>
      <td>${calculated.shares.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td><td>${money(calculated.harvestPrice)}</td><td>${calculated.harvestCash ? money(calculated.harvestCash) : "—"}</td>
      <td>${stockInput(stock, "growthGoal", (stock.growthGoal * 100).toFixed(2), {max: "100"})}</td>
      <td>${stock.high15 ? money(stock.high15) : "—"}</td><td>${stock.low15 ? money(stock.low15) : "—"}</td>
      <td>${money(calculated.currentValue)}</td><td class="${calculated.profit >= 0 ? "positive" : "negative"}">${money(calculated.profit)}</td>
      <td class="${calculated.returnRate >= 0 ? "positive" : "negative"}">${percent(calculated.returnRate)}</td>
      <td>${stockInput(stock, "harvestRate", (stock.harvestRate * 100).toFixed(2), {max: "100"})}</td>
      <td>${stockInput(stock, "minimumHarvest", stock.minimumHarvest.toFixed(2))}</td>
      <td>${stockInput(stock, "previousClose", stock.previousClose.toFixed(2))}</td><td>${percent(calculated.dayChange)}</td>
      <td>${pill(calculated.action)}</td><td>${pill(calculated.suggestion)}</td><td>${pill(calculated.buySignal)}</td>
      <td><button class="remove" data-remove="${escapeHtml(stock.id)}" aria-label="Remove ${escapeHtml(stock.symbol)}">×</button></td>
    </tr>`);
  });
  $("totalInvested").textContent = money(totalInvestedAmount);
  $("totalValue").textContent = money(totalValueAmount);
  $("totalProfit").textContent = money(totalProfitAmount);
  $("totalHarvest").textContent = money(totalHarvestAmount);
  $("totalValue").className = totalValueAmount >= totalInvestedAmount ? "positive" : "negative";
  $("totalProfit").className = totalProfitAmount >= 0 ? "positive" : "negative";
  $("totalDeposited").textContent = money(ledger.summary.totalDeposited);
  $("tradeRealizedProfit").textContent = money(ledger.summary.realizedProfitLoss);
  $("tradeRealizedProfit").className = ledger.summary.realizedProfitLoss >= 0 ? "positive" : "negative";
  $("estimatedTax").textContent = money(ledger.summary.estimatedTax);
  $("finalHarvest").textContent = money(ledger.summary.finalHarvest);
  $("finalHarvest").className = ledger.summary.finalHarvest >= 0 ? "positive" : "negative";
  $("taxRateLabel").textContent = (appSettings.taxRate * 100).toLocaleString(undefined, {maximumFractionDigits: 1});
  populateStockChoices();
  updateSortHeaders();
  requestAnimationFrame(() => { updateTableScrollControls(); syncFloatingTableHeader(); });
}

function updateTableScrollControls() {
  const maximum = Math.max(0, tableWrap.scrollWidth - tableWrap.clientWidth);
  tableScrollControls.hidden = maximum < 1;
  tableScrollPosition.max = String(Math.ceil(maximum));
  tableScrollPosition.value = String(Math.min(maximum, tableWrap.scrollLeft));
  scrollTableLeft.disabled = tableWrap.scrollLeft <= 0;
  scrollTableRight.disabled = tableWrap.scrollLeft >= maximum - 1;
}
function updateFloatingHeaderPosition() {
  const wrapBox = tableWrap.getBoundingClientRect();
  const headerBox = tableHead.getBoundingClientRect();
  const controlsBox = tableScrollControls.getBoundingClientRect();
  const controlsVisible = !tableScrollControls.hidden && getComputedStyle(tableScrollControls).display !== "none";
  const topOffset = controlsVisible ? Math.max(0, controlsBox.bottom) : 0;
  const visible = headerBox.top < topOffset && wrapBox.bottom > topOffset + headerBox.height;
  floatingTableHeader.hidden = !visible;
  if (!visible) return;
  floatingTableHeader.style.top = `${topOffset}px`;
  floatingTableHeader.style.left = `${wrapBox.left}px`;
  floatingTableHeader.style.width = `${wrapBox.width}px`;
  floatingTableHeaderScroll.scrollLeft = tableWrap.scrollLeft;
}
function syncFloatingTableHeader() {
  const originalHeaders = [...tableHead.querySelectorAll("th")];
  const floatingHeaders = [...floatingTableHead.querySelectorAll("th")];
  const tableWidth = mainTable.getBoundingClientRect().width;
  floatingTableHeaderTable.style.width = `${tableWidth}px`;
  floatingTableHeaderTable.style.minWidth = `${tableWidth}px`;
  originalHeaders.forEach((header, index) => {
    const floatingHeader = floatingHeaders[index];
    if (!floatingHeader) return;
    const width = header.getBoundingClientRect().width;
    floatingHeader.style.width = `${width}px`;
    floatingHeader.style.minWidth = `${width}px`;
    floatingHeader.style.maxWidth = `${width}px`;
  });
  updateFloatingHeaderPosition();
}
function sortHeaderInteraction(event) {
  const header = event.target.closest("th[data-sort]");
  if (header) selectPortfolioSort(header);
}
function sortHeaderKeyInteraction(event) {
  if (!["Enter", " "].includes(event.key)) return;
  const header = event.target.closest("th[data-sort]");
  if (!header) return;
  event.preventDefault();
  selectPortfolioSort(header);
}
tableScrollPosition.addEventListener("input", () => { tableWrap.scrollLeft = Number(tableScrollPosition.value); });
tableWrap.addEventListener("scroll", () => { updateTableScrollControls(); updateFloatingHeaderPosition(); }, {passive: true});
tableWrap.addEventListener("wheel", event => {
  if (!event.shiftKey || !event.deltaY) return;
  event.preventDefault();
  tableWrap.scrollLeft += event.deltaY;
}, {passive: false});
scrollTableLeft.onclick = () => tableWrap.scrollBy({left: -Math.max(240, tableWrap.clientWidth * .7), behavior: "smooth"});
scrollTableRight.onclick = () => tableWrap.scrollBy({left: Math.max(240, tableWrap.clientWidth * .7), behavior: "smooth"});
tableHead.addEventListener("click", sortHeaderInteraction);
tableHead.addEventListener("keydown", sortHeaderKeyInteraction);
floatingTableHead.addEventListener("click", sortHeaderInteraction);
floatingTableHead.addEventListener("keydown", sortHeaderKeyInteraction);
window.addEventListener("scroll", updateFloatingHeaderPosition, {passive: true});
window.addEventListener("resize", () => { updateTableScrollControls(); syncFloatingTableHeader(); });
if ("ResizeObserver" in window) {
  const tableScrollObserver = new ResizeObserver(() => { updateTableScrollControls(); syncFloatingTableHeader(); });
  tableScrollObserver.observe(tableWrap);
  tableScrollObserver.observe(mainTable);
}

$("rows").addEventListener("input", event => {
  const element = event.target;
  if (!element.dataset.key) return;
  const stock = stocks.find(item => item.id === element.dataset.id);
  if (!stock) return;
  const entered = Math.max(0, Number(element.value) || 0);
  stock[element.dataset.key] = ["growthGoal", "harvestRate"].includes(element.dataset.key) ? Math.min(100, entered) / 100 : entered;
  persist();
});
function adjacentFieldReference(element, direction) {
  const fields = [...$("rows").querySelectorAll("input[data-key]")];
  const next = fields[fields.indexOf(element) + direction];
  return next ? {id: next.dataset.id, key: next.dataset.key} : null;
}
function focusPortfolioField(reference) {
  if (!reference) return;
  const field = [...$("rows").querySelectorAll("input[data-key]")].find(element => element.dataset.id === reference.id && element.dataset.key === reference.key);
  if (!field) return;
  field.focus({preventScroll: true});
  field.select();
  field.scrollIntoView({block: "nearest", inline: "nearest"});
}
$("rows").addEventListener("keydown", event => {
  const element = event.target;
  if (!element.dataset.key) return;
  const isTab = event.key === "Tab";
  const isPhoneNext = event.key === "Enter";
  if (!isTab && !isPhoneNext) return;
  const next = adjacentFieldReference(element, isTab && event.shiftKey ? -1 : 1);
  if (!next) {
    if (isPhoneNext) { event.preventDefault(); element.blur(); }
    return;
  }
  event.preventDefault();
  render();
  requestAnimationFrame(() => focusPortfolioField(next));
});
$("rows").addEventListener("change", event => { if (event.target.dataset.key) render(); });
$("rows").addEventListener("click", event => {
  const id = event.target.dataset.remove;
  if (!id) return;
  const stock = stocks.find(item => item.id === id);
  if (confirm(`Remove ${stock ? stock.symbol : "this stock"} from the portfolio? Its logs will be kept.`)) {
    stocks = stocks.filter(item => item.id !== id);
    persist();
    render();
  }
});

const tradeForm = $("tradeForm");
let fillingLimitId = "";
function populateStockChoices() {
  const current = $("tradeSymbol").value;
  const alphabetical = [...stocks].sort((left, right) => left.symbol.localeCompare(right.symbol, undefined, {numeric: true, sensitivity: "base"}));
  $("tradeSymbol").innerHTML = alphabetical.map(stock => `<option value="${escapeHtml(stock.symbol)}">${escapeHtml(stock.symbol)}</option>`).join("");
  if (stocks.some(stock => stock.symbol === current)) $("tradeSymbol").value = current;
}
function setTradeMessage(message, tone = "") {
  $("tradeFormMessage").textContent = message;
  $("tradeFormMessage").className = `form-message ${tone}`;
}
function updateTradeMode() {
  const deposit = $("tradeType").value === "deposit";
  document.querySelectorAll("[data-trade-only]").forEach(element => { element.hidden = deposit; });
  $("tradeSymbol").required = !deposit;
  $("tradeShares").required = !deposit;
  $("tradePrice").required = !deposit;
  $("tradeAmount").readOnly = !deposit;
  $("tradeAmountHelp").textContent = deposit ? "Enter the amount deposited" : "Calculated automatically as shares × price";
  if (deposit) {
    $("tradeLimit").checked = false;
  } else {
    updateTradeAmount();
  }
}
function updateTradeAmount() {
  if ($("tradeType").value === "deposit") return;
  const amount = (Number($("tradeShares").value) || 0) * (Number($("tradePrice").value) || 0);
  $("tradeAmount").value = amount > 0 ? amount.toFixed(2) : "";
}
function resetTradeForm(message = "") {
  tradeForm.reset();
  $("tradeId").value = "";
  fillingLimitId = "";
  $("tradeType").value = "buy";
  $("tradeShares").value = "";
  $("tradePrice").value = "";
  $("tradeDateTime").value = toLocalDateTimeValue();
  $("tradeAmount").value = "";
  $("logTrade").textContent = "Save Log";
  $("cancelTradeEdit").hidden = true;
  updateTradeMode();
  setTradeMessage(message, message ? "positive" : "");
}
function loadTradeIntoForm(entry, {fill = false} = {}) {
  $("tradeId").value = entry.id;
  fillingLimitId = fill ? entry.id : "";
  $("tradeType").value = entry.type;
  updateTradeMode();
  if (entry.type !== "deposit") {
    $("tradeSymbol").value = entry.symbol;
    $("tradeShares").value = entry.shares;
    $("tradePrice").value = entry.pricePerShare;
    $("tradeLimit").checked = entry.status === "pending" && !fill;
    updateTradeAmount();
  } else {
    $("tradeAmount").value = entry.amount;
  }
  $("tradeDateTime").value = toLocalDateTimeValue(fill ? new Date() : entry.tradedAt);
  $("tradeNote").value = entry.note;
  $("logTrade").textContent = fill ? "Save as Filled" : "Save Changes";
  $("cancelTradeEdit").hidden = false;
  setTradeMessage(fill ? "Review the actual fill price and time, then save." : "Editing this log.");
  tradeForm.scrollIntoView({behavior: "smooth", block: "start"});
}
function ensureOpeningForSymbol(symbol, baseTrades) {
  if (baseTrades.some(item => item.type === "buy" && item.symbol === symbol && item.status === "executed")) return baseTrades;
  const stock = stocks.find(item => item.symbol === symbol);
  if (!stock || stock.invested <= 0 || stock.buyPrice <= 0) return baseTrades;
  return [normalizeTrade({
    id: `opening-${stock.id}`, type: "buy", symbol, shares: stock.invested / stock.buyPrice,
    pricePerShare: stock.buyPrice, amount: stock.invested, tradedAt: "2000-01-01T00:00:00.000Z",
    createdAt: new Date().toISOString(), source: "opening", note: "Opening position migrated from the existing portfolio",
  }), ...baseTrades];
}
function renderTrades() {
  const ledger = currentLedger();
  const byId = new Map(ledger.entries.map(entry => [entry.id, entry]));
  const entries = sortTrades(ledger.entries, $("tradeSort").value);
  $("tradeRows").innerHTML = entries.length ? "" : '<tr><td class="empty" colspan="9">No logs yet.</td></tr>';
  entries.forEach(entry => {
    const pending = entry.status === "pending";
    const typeLabel = entry.type === "deposit" ? "Deposit" : entry.source === "opening" ? "Opening" : entry.type === "buy" ? "Bought" : "Sold";
    let sharesCell = "—";
    if (entry.type === "buy") {
      const parts = [];
      if (entry.soldShares > 0) parts.push(`<span class="sold-portion" title="Sold via FIFO">${quantity(entry.soldShares)}</span>`);
      if (entry.remainingShares > 0) parts.push(`<span class="open-portion" title="Still open">${quantity(entry.remainingShares)}</span>`);
      sharesCell = pending ? quantity(entry.shares) : parts.join(" + ") || quantity(entry.shares);
    } else if (entry.type === "sell") {
      sharesCell = `<span class="${pending ? "" : "sold-portion"}">${quantity(entry.shares)}</span>`;
    }
    let fifoStatus = "Cash deposit";
    if (pending) fifoStatus = `Pending ${entry.type === "buy" ? "buy" : "sell"} • ${daysAgo(entry.createdAt)}d`;
    else if (entry.type === "sell") fifoStatus = `Cost ${money(entry.fifoCost)} • P/L ${money(entry.realizedProfitLoss)}`;
    else if (entry.type === "buy") fifoStatus = `${quantity(entry.remainingShares)} shares open`;
    const actions = [
      pending ? `<button data-fill-trade="${escapeHtml(entry.id)}">Mark Filled</button>` : "",
      `<button data-edit-trade="${escapeHtml(entry.id)}">Edit</button>`,
      `<button class="danger" data-delete-trade="${escapeHtml(entry.id)}">Delete</button>`,
    ].join("");
    $("tradeRows").insertAdjacentHTML("beforeend", `<tr>
      <td>${entry.source === "opening" ? "Opening balance" : escapeHtml(new Date(entry.tradedAt).toLocaleString([], {dateStyle: "medium", timeStyle: "short"}))}</td>
      <td>${entry.symbol ? escapeHtml(entry.symbol) : "—"}</td>
      <td><span class="trade-action ${entry.type} ${pending ? "pending" : ""}">${typeLabel}</span></td>
      <td>${sharesCell}</td><td>${entry.type === "deposit" ? "—" : money(entry.pricePerShare)}</td><td>${money(entry.amount)}</td>
      <td class="${entry.realizedProfitLoss < 0 ? "negative" : entry.realizedProfitLoss > 0 ? "positive" : ""}">${escapeHtml(fifoStatus)}</td>
      <td class="trade-note">${escapeHtml(entry.note || "—")}</td><td><div class="trade-row-actions">${actions}</div></td>
    </tr>`);
  });
  $("logTotalDeposited").textContent = money(ledger.summary.totalDeposited);
  $("tradeOpenCost").textContent = money(ledger.summary.openCost);
  $("pendingBuyAmount").textContent = money(ledger.summary.committedBuyAmount);
  $("logRealizedProfit").textContent = money(ledger.summary.realizedProfitLoss);
  $("logRealizedProfit").className = ledger.summary.realizedProfitLoss >= 0 ? "positive" : "negative";
}

tradeForm.addEventListener("input", event => {
  if (event.target === $("tradeShares") || event.target === $("tradePrice")) updateTradeAmount();
  setTradeMessage("");
});
$("tradeType").addEventListener("change", () => { updateTradeMode(); setTradeMessage(""); });
$("tradeSort").addEventListener("change", renderTrades);
$("cancelTradeEdit").addEventListener("click", () => resetTradeForm());
tradeForm.addEventListener("submit", event => {
  event.preventDefault();
  const existing = trades.find(item => item.id === $("tradeId").value);
  const type = $("tradeType").value;
  const tradedDate = new Date($("tradeDateTime").value);
  const isDeposit = type === "deposit";
  const pending = !isDeposit && $("tradeLimit").checked;
  const wasLimit = existing && existing.orderKind === "limit";
  const candidate = normalizeTrade({
    id: existing ? existing.id : undefined,
    type,
    symbol: isDeposit ? "" : $("tradeSymbol").value,
    shares: isDeposit ? 0 : $("tradeShares").value,
    pricePerShare: isDeposit ? 0 : $("tradePrice").value,
    amount: $("tradeAmount").value,
    orderKind: isDeposit ? "cash" : (pending || wasLimit || fillingLimitId) ? "limit" : "market",
    status: pending ? "pending" : "executed",
    tradedAt: Number.isFinite(tradedDate.getTime()) ? tradedDate.toISOString() : "invalid",
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
    source: existing ? existing.source : "log",
    externalId: existing ? existing.externalId : "",
    note: $("tradeNote").value,
  });
  if (!isValidTrade(candidate)) return setTradeMessage(isDeposit ? "Enter a positive deposit amount and valid date." : "Choose a stock and enter positive shares, price, and a valid date.");
  let nextTrades = existing ? trades.map(item => item.id === existing.id ? candidate : item) : [...trades, candidate];
  if (!isDeposit && candidate.status === "executed") nextTrades = ensureOpeningForSymbol(candidate.symbol, nextTrades);
  const currentLedger = calculateLedger(trades, appSettings.taxRate);
  const nextLedger = calculateLedger(nextTrades, appSettings.taxRate);
  if (nextLedger.summary.unmatchedShares > currentLedger.summary.unmatchedShares + 1e-8) {
    const message = candidate.type === "sell"
      ? "This sale would leave more sold shares than the earlier available purchases. Correct the shares or add the missing earlier purchase."
      : "This purchase change would leave a later sale without enough earlier shares. Correct the shares or date first.";
    return setTradeMessage(message);
  }
  trades = nextTrades.map(normalizeTrade);
  persist();
  render();
  renderTrades();
  resetTradeForm(pending ? "Pending limit saved. It will not affect profit/loss until marked filled." : isDeposit ? "Deposit saved." : "Executed trade saved.");
});

$("tradeRows").addEventListener("click", event => {
  const fillId = event.target.dataset.fillTrade;
  const editId = event.target.dataset.editTrade;
  const deleteId = event.target.dataset.deleteTrade;
  if (fillId || editId) {
    const entry = trades.find(item => item.id === (fillId || editId));
    if (entry) loadTradeIntoForm(entry, {fill: Boolean(fillId)});
    return;
  }
  if (!deleteId) return;
  const entry = trades.find(item => item.id === deleteId);
  if (!entry || !confirm(`Delete this ${entry.type === "deposit" ? "deposit" : entry.type === "buy" ? "purchase" : "sale"} log?`)) return;
  const nextTrades = trades.filter(item => item.id !== deleteId);
  const currentUnmatchedShares = calculateLedger(trades, appSettings.taxRate).summary.unmatchedShares;
  if (calculateLedger(nextTrades, appSettings.taxRate).summary.unmatchedShares > currentUnmatchedShares + 1e-8) return setTradeMessage("This purchase cannot be deleted because a later sale needs those shares.");
  trades = nextTrades;
  if ($("tradeId").value === deleteId) resetTradeForm();
  persist();
  render();
  renderTrades();
});

function setTradeModal(open) {
  $("tradeModal").classList.toggle("open", open);
  if (open) {
    populateStockChoices();
    renderTrades();
    if (!$("tradeDateTime").value) resetTradeForm();
  }
}
$("openTradeLog").onclick = () => {
  if (!$("tradeId").value) resetTradeForm();
  setTradeModal(true);
};
$("closeTradeLog").onclick = () => setTradeModal(false);
$("tradeModal").addEventListener("click", event => { if (event.target === $("tradeModal")) setTradeModal(false); });

$("addStock").onclick = () => {
  const entered = prompt("Enter the stock symbol, for example AAPL:");
  if (entered === null) return;
  const symbol = entered.trim().toUpperCase();
  if (!/^[A-Z0-9.-]{1,15}$/.test(symbol)) return alert("Enter a valid stock symbol.");
  if (stocks.some(stock => stock.symbol === symbol)) return alert(`${symbol} is already in the portfolio.`);
  stocks.push(normalizeStockState({symbol, current: 0, buyPrice: 0, invested: 0, growthGoal: .03, harvestRate: .20, minimumHarvest: 1, previousClose: 0}));
  persist();
  render();
};
$("setGoalForAll").onclick = () => {
  const current = stocks.length ? (stocks[0].growthGoal * 100).toFixed(2) : "3";
  const entered = prompt("Set the growth goal percentage for every stock:", current);
  if (entered === null) return;
  const value = Number(entered);
  if (!Number.isFinite(value) || value < 0 || value > 100) return alert("Enter a percentage from 0 to 100.");
  stocks.forEach(stock => { stock.growthGoal = value / 100; });
  persist();
  render();
};

function downloadFile(contents, filename, type) {
  const url = URL.createObjectURL(new Blob([contents], {type}));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

$("exportRobinhoodCsv").onclick = () => {
  const result = buildRobinhoodCsv(trades);
  if (!result.rowCount) return alert("There are no executed trades or deposits to export. Pending limits and opening balances are not Robinhood activity rows.");
  downloadFile(result.csv, `harvester-turtle-robinhood-${localDay()}.csv`, "text/csv;charset=utf-8");
  const skipped = [];
  if (result.skippedPending) skipped.push(`${result.skippedPending} pending limit${result.skippedPending === 1 ? "" : "s"}`);
  if (result.skippedOpening) skipped.push(`${result.skippedOpening} opening balance${result.skippedOpening === 1 ? "" : "s"}`);
  if (skipped.length) setStatus(`Exported ${result.rowCount} Robinhood-format rows. Excluded ${skipped.join(" and ")}.`, "good");
};

async function importRobinhoodFile(file) {
  const parsed = parseRobinhoodCsv(await file.text());
  const incoming = parsed.entries.map(normalizeTrade).filter(isValidTrade);
  const {additions, duplicateCount} = mergeRobinhoodEntries(trades, incoming);
  const symbolsToAdd = [...new Set(additions.filter(entry => entry.type !== "deposit").map(entry => entry.symbol))]
    .filter(symbol => !stocks.some(stock => stock.symbol === symbol))
    .sort((left, right) => left.localeCompare(right));
  const skippedDetails = [];
  if (duplicateCount) skippedDetails.push(`${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}`);
  if (parsed.unsupportedRows) skippedDetails.push(`${parsed.unsupportedRows} unsupported row${parsed.unsupportedRows === 1 ? "" : "s"}`);
  if (parsed.invalidRows) skippedDetails.push(`${parsed.invalidRows} invalid row${parsed.invalidRows === 1 ? "" : "s"}`);
  if (!additions.length) {
    alert(`No new supported activity was found.${skippedDetails.length ? ` Skipped ${skippedDetails.join(", ")}.` : ""}`);
    return;
  }
  const previewTrades = [...trades, ...additions].map(normalizeTrade);
  const unmatchedWarning = calculateLedger(previewTrades, appSettings.taxRate).hasUnmatchedSales
    ? "\n\nSome sales do not have an earlier purchase in the available history, so their profit/loss will be incomplete until the missing earlier purchases are added."
    : "";
  const skippedText = skippedDetails.length ? `\nSkipped: ${skippedDetails.join(", ")}.` : "";
  if (!confirm(`Add ${additions.length} new Robinhood log${additions.length === 1 ? "" : "s"} and ${symbolsToAdd.length} new stock${symbolsToAdd.length === 1 ? "" : "s"}?${skippedText}${unmatchedWarning}`)) return;
  localStorage.setItem(`harvesterCsvImportBackup-${Date.now()}`, JSON.stringify({version: 4, savedAt: stateSavedAt, stocks, trades, preferences: appSettings}));
  symbolsToAdd.forEach(symbol => stocks.push(normalizeStockState({symbol, current: 0, buyPrice: 0, invested: 0, growthGoal: .03, harvestRate: .20, minimumHarvest: 1, previousClose: 0})));
  trades = previewTrades;
  persist();
  render();
  renderTrades();
  const unsupported = Object.entries(parsed.unsupportedCodes).map(([code, count]) => `${code} ${count}`).join(", ");
  alert(`Imported ${additions.length} new log${additions.length === 1 ? "" : "s"}.${duplicateCount ? ` Skipped ${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"}.` : ""}${unsupported ? ` Unsupported activity left unchanged: ${unsupported}.` : ""}`);
}

$("exportData").onclick = () => {
  const backup = {version: 4, exportedAt: new Date().toISOString(), stocks, trades, preferences: appSettings};
  downloadFile(JSON.stringify(backup, null, 2), `harvester-turtle-backup-${localDay()}.json`, "application/json");
};
async function importBackupFile(file) {
  const data = JSON.parse(await file.text());
  const importedStocks = Array.isArray(data) ? data : data && data.stocks;
  const importedTrades = Array.isArray(data) ? [] : data && data.trades;
  if (!Array.isArray(importedStocks) || !Array.isArray(importedTrades)) throw new Error("That JSON file is not a valid Harvester Turtle backup.");
  const cleanStocks = importedStocks.map(normalizeStockState).filter(stock => stock.symbol);
  const cleanTrades = importedTrades.map(normalizeTrade).filter(isValidTrade);
  if (cleanStocks.length !== importedStocks.length || cleanTrades.length !== importedTrades.length) throw new Error("That JSON file is not a valid Harvester Turtle backup.");
  if (!confirm("Replace the current portfolio and logs with this backup? A recovery copy will be kept on this device.")) return;
  localStorage.setItem(`harvesterImportBackup-${Date.now()}`, JSON.stringify({version: 4, savedAt: stateSavedAt, stocks, trades, preferences: appSettings}));
  stocks = cleanStocks;
  trades = migrateOpeningPositions(cleanStocks, cleanTrades);
  if (data.preferences) {
    appSettings.dailyRefreshLimit = Math.min(100, Math.max(1, Number(data.preferences.dailyRefreshLimit) || appSettings.dailyRefreshLimit));
    const importedTaxRate = Number(data.preferences.taxRate);
    if (Number.isFinite(importedTaxRate)) appSettings.taxRate = Math.min(1, Math.max(0, importedTaxRate));
  }
  persist();
  render();
  renderTrades();
}

$("importData").onchange = async event => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const isCsv = /\.csv$/i.test(file.name) || String(file.type).toLowerCase().includes("csv");
  try {
    if (isCsv) await importRobinhoodFile(file);
    else await importBackupFile(file);
  } catch (error) {
    const fallback = isCsv ? "That file is not a valid Robinhood activity CSV." : "That JSON file is not a valid Harvester Turtle backup.";
    alert(error && error.message ? error.message : fallback);
  } finally {
    event.target.value = "";
  }
};

const getApiUrl = () => localStorage.getItem("harvesterQuoteApi") || DEFAULT_API_URL;
const getSyncKey = () => localStorage.getItem("harvesterSyncKey") || "";
function setStatus(text, state = "") {
  $("priceStatus").textContent = text;
  $("priceStatus").className = `status ${state}`;
}
function setSyncStatus(text, state = "") {
  $("syncStatus").textContent = text;
  $("syncStatus").className = `note ${state}`;
}
function syncHeaders() {
  return {"Content-Type": "application/json", "Authorization": `Bearer ${getSyncKey()}`};
}
async function cloudRequest(method, body) {
  const response = await fetch(`${getApiUrl()}/portfolio`, {method, headers: syncHeaders(), cache: "no-store", body: body ? JSON.stringify(body) : undefined});
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Cloud sync failed (HTTP ${response.status})`);
  return data;
}
async function pushPortfolio() {
  if (!getSyncKey()) return;
  clearTimeout(syncTimer);
  const pushedSavedAt = stateSavedAt;
  setSyncStatus("Saving portfolio and logs to Cloudflare…");
  const result = await cloudRequest("PUT", {version: 4, stocks, trades, preferences: appSettings});
  if (stateSavedAt === pushedSavedAt) {
    if (result.updatedAt) stateSavedAt = result.updatedAt;
    localDirty = false;
    persist({sync: false, preserveTimestamp: true, markDirty: false});
  } else {
    scheduleCloudSave();
  }
  setSyncStatus(`Synced at ${new Date().toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}.`, "positive");
}
function scheduleCloudSave() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => pushPortfolio().catch(error => setSyncStatus(`Sync pending: ${error.message}`, "negative")), 800);
}
function applyRemotePortfolio(remote) {
  const remoteStocks = remote.stocks.map(normalizeStockState).filter(stock => stock.symbol);
  const remoteTrades = Array.isArray(remote.trades) ? remote.trades.map(normalizeTrade).filter(isValidTrade) : [];
  stocks = remoteStocks;
  trades = migrateOpeningPositions(remoteStocks, remoteTrades);
  if (remote.preferences) {
    appSettings.dailyRefreshLimit = Math.min(100, Math.max(1, Number(remote.preferences.dailyRefreshLimit) || appSettings.dailyRefreshLimit));
    const remoteTaxRate = Number(remote.preferences.taxRate);
    if (Number.isFinite(remoteTaxRate)) appSettings.taxRate = Math.min(1, Math.max(0, remoteTaxRate));
  }
  stateSavedAt = remote.updatedAt || stateSavedAt;
  localDirty = false;
  persist({sync: false, preserveTimestamp: true, markDirty: false});
  render();
  renderTrades();
  updateRefreshCount();
}

async function synchronizeCloud({settingsOverride = null} = {}) {
  if (!getSyncKey()) {
    cloudReady = false;
    if (settingsOverride) {
      appSettings = settingsOverride;
      persist({sync: false});
      render();
      renderTrades();
      updateRefreshCount();
    }
    setSyncStatus("Cloud sync is not configured on this device.");
    return;
  }
  try {
    setSyncStatus("Checking the cloud copy…");
    const data = await cloudRequest("GET");
    const remote = data.portfolio;
    if (remote && Array.isArray(remote.stocks)) {
      const remoteTime = new Date(remote.updatedAt || 0).getTime();
      const localTime = new Date(stateSavedAt || 0).getTime();
      if (localDirty && localTime > remoteTime) {
        if (settingsOverride) {
          appSettings = settingsOverride;
          persist({sync: false});
        }
        cloudReady = true;
        await pushPortfolio();
      } else {
        applyRemotePortfolio(remote);
        if (settingsOverride) {
          appSettings = settingsOverride;
          persist({sync: false});
          cloudReady = true;
          await pushPortfolio();
          render();
          renderTrades();
          updateRefreshCount();
        } else {
          setSyncStatus("Loaded the latest cloud copy.", "positive");
        }
      }
    } else {
      if (settingsOverride) {
        appSettings = settingsOverride;
        persist({sync: false});
      }
      cloudReady = true;
      await pushPortfolio();
    }
    cloudReady = true;
  } catch (error) {
    cloudReady = false;
    if (settingsOverride) {
      appSettings = settingsOverride;
      persist({sync: false});
      render();
      renderTrades();
      updateRefreshCount();
    }
    setSyncStatus(`Using this device only: ${error.message}`, "negative");
  }
}

function initializeCloudSync(options = {}) {
  if (cloudSyncPromise) {
    if (options.settingsOverride) return cloudSyncPromise.then(() => initializeCloudSync(options));
    return cloudSyncPromise;
  }
  cloudSyncPromise = synchronizeCloud(options).finally(() => { cloudSyncPromise = null; });
  return cloudSyncPromise;
}

function refreshUsage() {
  try {
    const saved = JSON.parse(localStorage.getItem(REFRESH_KEY));
    if (saved && saved.day === localDay()) return {day: saved.day, used: Math.max(0, Number(saved.used) || 0)};
  } catch {}
  return {day: localDay(), used: 0};
}
function updateRefreshCount() {
  const usage = refreshUsage();
  const remaining = Math.max(0, appSettings.dailyRefreshLimit - usage.used);
  $("refreshRemaining").textContent = `${remaining} of ${appSettings.dailyRefreshLimit} price updates left today`;
  $("refreshPrices").disabled = priceRefreshRunning || remaining <= 0;
  return remaining;
}
function recordRefresh() {
  const usage = refreshUsage();
  usage.used += 1;
  localStorage.setItem(REFRESH_KEY, JSON.stringify(usage));
  updateRefreshCount();
}
async function refreshPrices() {
  if (priceRefreshRunning || updateRefreshCount() <= 0) return;
  const base = getApiUrl();
  const symbols = [...new Set(stocks.map(stock => stock.symbol).filter(symbol => /^[A-Z0-9.-]{1,15}$/.test(symbol)))];
  if (!base) return setStatus("Open Price & App Settings and enter the Worker URL.", "bad");
  if (!symbols.length) return setStatus("Add a stock first.", "bad");
  priceRefreshRunning = true;
  const rotation = symbols.length ? (refreshUsage().used * 8) % symbols.length : 0;
  const requestSymbols = [...symbols.slice(rotation), ...symbols.slice(0, rotation)];
  updateRefreshCount();
  setStatus(`Refreshing ${symbols.length} stocks…`);
  try {
    const response = await fetch(`${base}${base.includes("?") ? "&" : "?"}symbols=${encodeURIComponent(requestSymbols.join(","))}`, {cache: "no-store"});
    const data = await response.json().catch(() => ({}));
    const quotes = data.quotes || {};
    let completed = 0;
    stocks.forEach(stock => {
      const quote = quotes[stock.symbol];
      if (!quote || !(Number(quote.price) > 0)) return;
      completed += 1;
      stock.current = Number(quote.price);
      if (Number(quote.previousClose) > 0) stock.previousClose = Number(quote.previousClose);
      if (Number(quote.high15) > 0) stock.high15 = Number(quote.high15);
      if (Number(quote.low15) > 0) stock.low15 = Number(quote.low15);
      stock.marketDataAt = data.updatedAt || new Date().toISOString();
    });
    if (!completed) throw new Error(data.error || "No prices were returned");
    recordRefresh();
    persist();
    render();
    const quotaText = data.quota && Number.isFinite(Number(data.quota.creditsLeft)) ? ` Provider credits left now: ${data.quota.creditsLeft}.` : "";
    const failureCount = symbols.length - completed;
    const time = new Date().toLocaleString([], {dateStyle: "medium", timeStyle: "short"});
    localStorage.setItem("harvesterLastPriceUpdate", time);
    setStatus(failureCount ? `Updated ${completed} of ${symbols.length} stocks. ${failureCount} reached a provider/data limit.${quotaText}` : `Updated all ${completed} stocks at ${time}.${quotaText}`, failureCount ? "bad" : "good");
  } catch (error) {
    setStatus(`Refresh failed: ${error.message}. Your saved prices were not removed.`, "bad");
  } finally {
    priceRefreshRunning = false;
    updateRefreshCount();
  }
}
$("refreshPrices").onclick = refreshPrices;

function setMenu(open) {
  $("appMenu").hidden = !open;
  $("menuToggle").setAttribute("aria-expanded", String(open));
  $("menuToggle").setAttribute("aria-label", open ? "Close menu" : "Open menu");
}
$("menuToggle").onclick = event => { event.stopPropagation(); setMenu($("appMenu").hidden); };
$("appMenu").addEventListener("click", event => { event.stopPropagation(); if (event.target.closest("button,.file-button,.menu-link")) setMenu(false); });
document.addEventListener("click", () => setMenu(false));
document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;
  setMenu(false);
  setTradeModal(false);
  $("settingsModal").classList.remove("open");
});

$("settings").onclick = () => {
  $("quoteApiUrl").value = getApiUrl();
  $("syncKey").value = getSyncKey();
  $("dailyRefreshLimit").value = appSettings.dailyRefreshLimit;
  $("taxRate").value = appSettings.taxRate * 100;
  $("settingsModal").classList.add("open");
};
$("syncNow").onclick = async () => {
  if (!getSyncKey()) return $("settings").onclick();
  try { await initializeCloudSync(); } catch (error) { setSyncStatus(`Sync failed: ${error.message}`, "negative"); $("settingsModal").classList.add("open"); }
};
$("closeSettings").onclick = () => $("settingsModal").classList.remove("open");
$("settingsModal").addEventListener("click", event => { if (event.target === $("settingsModal")) $("settingsModal").classList.remove("open"); });
$("saveSettings").onclick = async () => {
  const url = $("quoteApiUrl").value.trim().replace(/\/$/, "");
  if (!/^https:\/\//i.test(url)) return alert("Enter a secure HTTPS Worker URL.");
  const key = $("syncKey").value.trim();
  if (key && key.length < 16) return alert("Use a private sync key at least 16 characters long, or leave it blank to use device-only saving.");
  const dailyLimit = Number($("dailyRefreshLimit").value);
  const taxPercent = Number($("taxRate").value);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 100) return alert("Daily price-update limit must be a whole number from 1 to 100.");
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) return alert("Estimated tax rate must be from 0 to 100.");
  localStorage.setItem("harvesterQuoteApi", url);
  if (key) localStorage.setItem("harvesterSyncKey", key); else localStorage.removeItem("harvesterSyncKey");
  const desiredSettings = {dailyRefreshLimit: dailyLimit, taxRate: taxPercent / 100};
  cloudReady = false;
  await initializeCloudSync({settingsOverride: desiredSettings});
  updateRefreshCount();
  render();
  renderTrades();
  $("settingsModal").classList.remove("open");
};

const lastUpdate = localStorage.getItem("harvesterLastPriceUpdate");
if (lastUpdate) setStatus(`Prices last updated: ${lastUpdate}. Reloading the page does not update prices or use the daily limit.`, "good");
render();
renderTrades();
resetTradeForm();
updateRefreshCount();
initializeCloudSync();

async function syncWhenActive() {
  if (!getSyncKey() || localDirty || cloudSyncPromise) return;
  await initializeCloudSync();
}
window.addEventListener("focus", () => syncWhenActive().catch(() => {}));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") syncWhenActive().catch(() => {});
});
