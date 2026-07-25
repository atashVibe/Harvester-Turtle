const { calculate, normalizeStock } = HarvesterCalculator;
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
const clone=value=>JSON.parse(JSON.stringify(value));
const storageKey="harvesterDataV2";
const rows=document.getElementById("rows");
function loadStocks(){
  try{
    const current=JSON.parse(localStorage.getItem(storageKey));
    if(Array.isArray(current)&&current.length)return current.map(normalizeStock).filter(stock=>stock.symbol);
    const legacy=JSON.parse(localStorage.getItem("harvesterData"));
    if(Array.isArray(legacy)&&legacy.length)return legacy.map(normalizeStock).filter(stock=>stock.symbol);
  }catch{}
  return clone(seed).map(normalizeStock);
}
let stocks=loadStocks();
const save=()=>localStorage.setItem(storageKey,JSON.stringify(stocks));
const money=n=>Number.isFinite(n)?n.toLocaleString(undefined,{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2}):"—";
const number=(n,digits=6)=>Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:digits}):"—";
const percent=n=>Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
const escapeHtml=text=>String(text).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
function pill(text){
  let tone="";
  if(["Harvest","Harvest Ready","Strong Harvest"].includes(text))tone="good";
  else if(["Buy More","Maybe"].includes(text))tone="warn";
  else if(text==="Strong Buy")tone="bad";
  return `<span class="pill ${tone}">${escapeHtml(text||"—")}</span>`;
}
function input(stock,key,value,{step="0.01",className="",min="0",max=""}={}){
  return `<input class="${className}" data-id="${escapeHtml(stock.id)}" data-key="${key}" type="${key==="symbol"?"text":"number"}" step="${step}" min="${min}" ${max?`max="${max}"`:""} value="${escapeHtml(value)}">`;
}
function render(){
  const calculated=stocks.map(calculate);
  rows.innerHTML=calculated.length?"":'<tr><td class="empty" colspan="19">Add a stock to begin.</td></tr>';
  let ti=0,tv=0,tp=0,th=0;
  calculated.forEach(stock=>{
    ti+=stock.invested;tv+=stock.currentValue;tp+=stock.profit;th+=stock.harvestCash;
    rows.insertAdjacentHTML("beforeend",`<tr>
      <td>${input(stock,"symbol",stock.symbol,{className:"symbol",min:""})}</td>
      <td>${input(stock,"current",stock.current)}</td><td>${input(stock,"buyPrice",stock.buyPrice)}</td>
      <td>${input(stock,"invested",stock.invested)}</td><td>${number(stock.shares)}</td>
      <td>${money(stock.currentValue)}</td><td class="${stock.profit>=0?"positive":"negative"}">${money(stock.profit)}</td>
      <td class="${stock.returnRate>=0?"positive":"negative"}">${percent(stock.returnRate)}</td>
      <td>${input(stock,"growthGoal",stock.growthGoal,{step:"0.01",max:"10"})} (${percent(stock.growthGoal)})</td>
      <td>${input(stock,"harvestRate",stock.harvestRate,{step:"0.01",max:"1"})} (${percent(stock.harvestRate)})</td>
      <td>${input(stock,"minimumHarvest",stock.minimumHarvest)}</td><td>${money(stock.harvestPrice)}</td>
      <td>${input(stock,"previousClose",stock.previousClose)}</td><td>${percent(stock.dayChange)}</td>
      <td>${pill(stock.action)}</td><td>${stock.harvestCash?money(stock.harvestCash):"—"}</td>
      <td>${pill(stock.suggestion)}</td><td>${pill(stock.buySignal)}</td>
      <td><button class="remove" data-remove="${escapeHtml(stock.id)}" aria-label="Remove ${escapeHtml(stock.symbol)}">×</button></td>
    </tr>`);
  });
  totalInvested.textContent=money(ti);totalValue.textContent=money(tv);totalProfit.textContent=money(tp);
  totalProfit.className=tp>=0?"positive":"negative";totalHarvest.textContent=money(th);save();
}
rows.addEventListener("input",event=>{
  const element=event.target;if(!element.dataset.key)return;
  const stock=stocks.find(item=>item.id===element.dataset.id);if(!stock)return;
  const key=element.dataset.key;
  stock[key]=key==="symbol"?element.value.toUpperCase():Math.max(0,Number(element.value)||0);save();
});
rows.addEventListener("change",event=>{if(event.target.dataset.key)render()});
rows.addEventListener("click",event=>{if(event.target.dataset.remove){stocks=stocks.filter(stock=>stock.id!==event.target.dataset.remove);render()}});
addStock.onclick=()=>{stocks.push(normalizeStock({symbol:"NEW",current:0,buyPrice:0,invested:0,growthGoal:.03,harvestRate:.20,minimumHarvest:1,previousClose:0}));render()};
exportData.onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(stocks,null,2)],{type:"application/json"}));
  const anchor=document.createElement("a");anchor.href=url;anchor.download="harvester-turtle-data.json";anchor.click();setTimeout(()=>URL.revokeObjectURL(url),0);
};
importData.onchange=async event=>{
  try{
    const file=event.target.files&&event.target.files[0];if(!file)return;
    const data=JSON.parse(await file.text());if(!Array.isArray(data)||!data.length)throw new Error();
    const clean=data.map(normalizeStock).filter(stock=>stock.symbol);if(clean.length!==data.length)throw new Error();
    stocks=clean;render();
  }catch{alert("That file is not valid Harvester Turtle data.")}finally{event.target.value=""}
};
const settingsModal=document.getElementById("settingsModal"),quoteApiUrl=document.getElementById("quoteApiUrl"),priceStatus=document.getElementById("priceStatus");
const menuToggle=document.getElementById("menuToggle"),appMenu=document.getElementById("appMenu");
function setMenu(open){
  appMenu.hidden=!open;
  menuToggle.setAttribute("aria-expanded",String(open));
  menuToggle.setAttribute("aria-label",open?"Close menu":"Open menu");
}
menuToggle.onclick=event=>{event.stopPropagation();setMenu(appMenu.hidden)};
appMenu.addEventListener("click",event=>{event.stopPropagation();if(event.target.closest("button,.file-button"))setMenu(false)});
document.addEventListener("click",()=>setMenu(false));
document.addEventListener("keydown",event=>{if(event.key==="Escape")setMenu(false)});
const DEFAULT_API_URL="https://summer-river-8271.atash1317.workers.dev";
const getApiUrl=()=>localStorage.getItem("harvesterQuoteApi")||DEFAULT_API_URL;
function setStatus(text,state=""){priceStatus.textContent=text;priceStatus.className=`status ${state}`}
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
let priceRefreshRunning=false;
settings.onclick=()=>{quoteApiUrl.value=getApiUrl();settingsModal.classList.add("open")};
closeSettings.onclick=()=>settingsModal.classList.remove("open");
saveSettings.onclick=()=>{
  const url=quoteApiUrl.value.trim().replace(/\/$/,"");if(!/^https:\/\//i.test(url))return alert("Enter a secure HTTPS URL.");
  localStorage.setItem("harvesterQuoteApi",url);settingsModal.classList.remove("open");refreshPrices(true);
};
async function refreshPrices(openSettings=false){
  const base=getApiUrl(),symbols=[...new Set(stocks.map(stock=>stock.symbol.trim().toUpperCase()).filter(symbol=>/^[A-Z0-9.-]{1,15}$/.test(symbol)))];
  if(!base){setStatus("Automatic prices are not configured. You can enter prices manually or open Price Settings.","bad");if(openSettings)settingsModal.classList.add("open");return}
  if(!symbols.length)return setStatus("Add a valid stock symbol first.","bad");
  if(priceRefreshRunning){if(openSettings)setStatus("A price update is already running. Please wait for it to finish.");return}
  priceRefreshRunning=true;
  setStatus("Updating market prices…");
  try{
    const pending=[...symbols],attempts={},completed=new Set(),permanentFailures=new Set();
    let round=0;
    while(pending.length){
      if(round>0){
        setStatus(`Updated ${completed.size} of ${symbols.length}. Waiting 65 seconds for the free price limit to reset…`);
        await wait(65000);
      }
      const batch=pending.splice(0,8);
      setStatus(`Updating ${batch.length} symbol${batch.length===1?"":"s"}… ${completed.size} of ${symbols.length} complete.`);
      const response=await fetch(`${base}${base.includes("?")?"&":"?"}symbols=${encodeURIComponent(batch.join(","))}`,{cache:"no-store"});
      const data=await response.json();
      const quotes=data.quotes||{};
      batch.forEach(symbol=>{
        const quote=quotes[symbol];
        if(quote&&Number(quote.price)>0)completed.add(symbol);
        else{
          attempts[symbol]=(attempts[symbol]||0)+1;
          if(attempts[symbol]<3)pending.push(symbol);else permanentFailures.add(symbol);
        }
      });
      stocks.forEach(stock=>{const quote=quotes[stock.symbol.toUpperCase()];if(quote&&Number(quote.price)>0){stock.current=Number(quote.price);if(Number(quote.previousClose)>0)stock.previousClose=Number(quote.previousClose)}});
      render();
      round++;
    }
    setStatus(`Updated ${completed.size} of ${symbols.length} symbols${permanentFailures.size?`; ${permanentFailures.size} failed after 3 attempts`:""}. Automatic refresh runs every 2 minutes.`,completed.size?"good":"bad");
  }catch(error){
    setStatus(`Price update stopped: ${error.message}. Prices already received were kept.`,"bad");
  }finally{
    priceRefreshRunning=false;
  }
}
render();refreshPrices(false);setInterval(()=>refreshPrices(false),120000);
