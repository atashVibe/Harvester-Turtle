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
const tableWrap=document.getElementById("tableWrap"),tableScrollControls=document.getElementById("tableScrollControls"),tableScrollPosition=document.getElementById("tableScrollPosition"),scrollTableLeft=document.getElementById("scrollTableLeft"),scrollTableRight=document.getElementById("scrollTableRight");
function updateTableScrollControls(){
  const maximum=Math.max(0,tableWrap.scrollWidth-tableWrap.clientWidth);
  tableScrollControls.hidden=maximum<1;
  tableScrollPosition.max=String(Math.ceil(maximum));
  tableScrollPosition.value=String(Math.min(maximum,tableWrap.scrollLeft));
  scrollTableLeft.disabled=tableWrap.scrollLeft<=0;
  scrollTableRight.disabled=tableWrap.scrollLeft>=maximum-1;
}
tableScrollPosition.addEventListener("input",()=>{tableWrap.scrollLeft=Number(tableScrollPosition.value)});
tableWrap.addEventListener("scroll",()=>{updateTableScrollControls();updateFloatingHeaderPosition()},{passive:true});
tableWrap.addEventListener("wheel",event=>{
  if(!event.shiftKey||!event.deltaY)return;
  event.preventDefault();tableWrap.scrollLeft+=event.deltaY;
},{passive:false});
scrollTableLeft.onclick=()=>tableWrap.scrollBy({left:-Math.max(240,tableWrap.clientWidth*.7),behavior:"smooth"});
scrollTableRight.onclick=()=>tableWrap.scrollBy({left:Math.max(240,tableWrap.clientWidth*.7),behavior:"smooth"});
window.addEventListener("resize",()=>{updateTableScrollControls();syncFloatingTableHeader()});
if("ResizeObserver" in window){
  const tableScrollObserver=new ResizeObserver(()=>{updateTableScrollControls();syncFloatingTableHeader()});
  tableScrollObserver.observe(tableWrap);
  tableScrollObserver.observe(tableWrap.querySelector("table"));
}
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
let cloudReady=false;
let syncTimer=null;
let sortKey="symbol";
let sortDirection="asc";
const save=()=>{
  localStorage.setItem(storageKey,JSON.stringify(stocks));
  if(cloudReady)scheduleCloudSave();
};
const money=n=>Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}):"—";
const number=(n,digits=2)=>Number.isFinite(n)?n.toLocaleString(undefined,{minimumFractionDigits:digits,maximumFractionDigits:digits}):"—";
const percent=n=>Number.isFinite(n)?`${(n*100).toFixed(2)}%`:"—";
const escapeHtml=text=>String(text).replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
function pill(text){
  let tone="";
  if(["Harvest","Harvest Ready","Strong Harvest"].includes(text))tone="good";
  else if(["Buy More","Maybe"].includes(text))tone="warn";
  else if(text==="Strong Buy")tone="bad";
  return `<span class="pill ${tone}">${escapeHtml(text||"—")}</span>`;
}
function signalLights(stock){
  const red=stock.suggestion==="Strong Buy";
  const yellow=stock.suggestion==="Buy More";
  const green=stock.action==="Harvest";
  const active=[red&&"Strong Buy",yellow&&"Buy More",green&&"Harvest"].filter(Boolean);
  const label=active.length?active.join(", "):"Hold";
  return `<span class="signal-lights" role="img" aria-label="${label}" title="${label}">
    <span class="signal red ${red?"active":""}"></span>
    <span class="signal yellow ${yellow?"active":""}"></span>
    <span class="signal green ${green?"active":""}"></span>
  </span>`;
}
function input(stock,key,value,{step="0.01",className="",min="0",max=""}={}){
  return `<input class="${className}" data-id="${escapeHtml(stock.id)}" data-key="${key}" type="${key==="symbol"?"text":"number"}" inputmode="decimal" enterkeyhint="next" step="${step}" min="${min}" ${max?`max="${max}"`:""} value="${escapeHtml(value)}">`;
}
function compareStocks(leftStock,rightStock){
  const left=leftStock[sortKey],right=rightStock[sortKey];
  let result;
  if(typeof left==="string"||typeof right==="string"){
    result=String(left??"").localeCompare(String(right??""),undefined,{numeric:true,sensitivity:"base"});
  }else{
    const leftNumber=Number(left),rightNumber=Number(right);
    result=(Number.isFinite(leftNumber)?leftNumber:0)-(Number.isFinite(rightNumber)?rightNumber:0);
  }
  if(result===0&&sortKey!=="symbol")result=leftStock.symbol.localeCompare(rightStock.symbol,undefined,{numeric:true,sensitivity:"base"});
  return sortDirection==="asc"?result:-result;
}
function updateSortHeaders(){
  document.querySelectorAll("th[data-sort]").forEach(header=>{
    const active=header.dataset.sort===sortKey;
    header.classList.toggle("sort-asc",active&&sortDirection==="asc");
    header.classList.toggle("sort-desc",active&&sortDirection==="desc");
    header.setAttribute("aria-sort",active?(sortDirection==="asc"?"ascending":"descending"):"none");
  });
}
function selectSort(header){
  const key=header.dataset.sort;if(!key)return;
  if(sortKey===key)sortDirection=sortDirection==="asc"?"desc":"asc";
  else{sortKey=key;sortDirection="asc"}
  updateSortHeaders();render(false);
}
function render(saveData=true){
  const calculated=stocks.map(calculate).sort(compareStocks);
  rows.innerHTML=calculated.length?"":'<tr><td class="empty" colspan="19">Add a stock to begin.</td></tr>';
  let ti=0,tv=0,tp=0,th=0;
  calculated.forEach(stock=>{
    ti+=stock.invested;tv+=stock.currentValue;tp+=stock.profit;th+=stock.harvestCash;
    rows.insertAdjacentHTML("beforeend",`<tr>
      <td><div class="symbol-cell">${signalLights(stock)}<span class="stock-symbol">${escapeHtml(stock.symbol)}</span></div></td>
      <td>${input(stock,"current",stock.current.toFixed(2))}</td><td>${input(stock,"buyPrice",stock.buyPrice.toFixed(2))}</td>
      <td>${input(stock,"invested",stock.invested.toFixed(2))}</td><td>${number(stock.shares,2)}</td>
      <td>${money(stock.harvestPrice)}</td><td>${stock.harvestCash?money(stock.harvestCash):"—"}</td>
      <td>${input(stock,"growthGoal",(stock.growthGoal*100).toFixed(2),{step:"0.01",max:"100"})}</td>
      <td>${money(stock.currentValue)}</td><td class="${stock.profit>=0?"positive":"negative"}">${money(stock.profit)}</td>
      <td class="${stock.returnRate>=0?"positive":"negative"}">${percent(stock.returnRate)}</td>
      <td>${input(stock,"harvestRate",(stock.harvestRate*100).toFixed(2),{step:"0.01",max:"100"})}</td>
      <td>${input(stock,"minimumHarvest",stock.minimumHarvest.toFixed(2))}</td>
      <td>${input(stock,"previousClose",stock.previousClose.toFixed(2))}</td><td>${percent(stock.dayChange)}</td>
      <td>${pill(stock.action)}</td><td>${pill(stock.suggestion)}</td><td>${pill(stock.buySignal)}</td>
      <td><button class="remove" data-remove="${escapeHtml(stock.id)}" aria-label="Remove ${escapeHtml(stock.symbol)}">×</button></td>
    </tr>`);
  });
  totalInvested.textContent=money(ti);totalValue.textContent=money(tv);totalProfit.textContent=money(tp);
  totalValue.className=tv>ti?"positive":"negative";
  totalProfit.className=tp>=0?"positive":"negative";totalHarvest.textContent=money(th);if(saveData)save();
  requestAnimationFrame(()=>{updateTableScrollControls();syncFloatingTableHeader()});
}
const tableHead=document.querySelector("thead");
const mainTable=tableWrap.querySelector("table"),floatingTableHeader=document.getElementById("floatingTableHeader"),floatingTableHeaderScroll=document.getElementById("floatingTableHeaderScroll"),floatingTableHeaderTable=document.getElementById("floatingTableHeaderTable"),floatingTableHead=document.getElementById("floatingTableHead");
floatingTableHead.innerHTML=tableHead.innerHTML;
function updateFloatingHeaderPosition(){
  const wrapBox=tableWrap.getBoundingClientRect(),headerBox=tableHead.getBoundingClientRect(),controlsBox=tableScrollControls.getBoundingClientRect();
  const controlsVisible=!tableScrollControls.hidden&&getComputedStyle(tableScrollControls).display!=="none";
  const topOffset=controlsVisible?Math.max(0,controlsBox.bottom):0;
  const visible=headerBox.top<topOffset&&wrapBox.bottom>topOffset+headerBox.height;
  floatingTableHeader.hidden=!visible;
  if(!visible)return;
  floatingTableHeader.style.top=`${topOffset}px`;
  floatingTableHeader.style.left=`${wrapBox.left}px`;
  floatingTableHeader.style.width=`${wrapBox.width}px`;
  floatingTableHeaderScroll.scrollLeft=tableWrap.scrollLeft;
}
function syncFloatingTableHeader(){
  const originalHeaders=[...tableHead.querySelectorAll("th")],floatingHeaders=[...floatingTableHead.querySelectorAll("th")];
  const tableWidth=mainTable.getBoundingClientRect().width;
  floatingTableHeaderTable.style.width=`${tableWidth}px`;
  floatingTableHeaderTable.style.minWidth=`${tableWidth}px`;
  originalHeaders.forEach((header,index)=>{
    const floatingHeader=floatingHeaders[index];if(!floatingHeader)return;
    const width=header.getBoundingClientRect().width;
    floatingHeader.style.width=`${width}px`;
    floatingHeader.style.minWidth=`${width}px`;
    floatingHeader.style.maxWidth=`${width}px`;
  });
  updateFloatingHeaderPosition();
}
window.addEventListener("scroll",updateFloatingHeaderPosition,{passive:true});
tableHead.addEventListener("click",event=>{
  const header=event.target.closest("th[data-sort]");if(header)selectSort(header);
});
tableHead.addEventListener("keydown",event=>{
  if(!["Enter"," "].includes(event.key))return;
  const header=event.target.closest("th[data-sort]");if(!header)return;
  event.preventDefault();selectSort(header);
});
floatingTableHead.addEventListener("click",event=>{
  const header=event.target.closest("th[data-sort]");if(header)selectSort(header);
});
floatingTableHead.addEventListener("keydown",event=>{
  if(!["Enter"," "].includes(event.key))return;
  const header=event.target.closest("th[data-sort]");if(!header)return;
  event.preventDefault();selectSort(header);
});
rows.addEventListener("input",event=>{
  const element=event.target;if(!element.dataset.key)return;
  const stock=stocks.find(item=>item.id===element.dataset.id);if(!stock)return;
  const key=element.dataset.key;
  const entered=Math.max(0,Number(element.value)||0);
  stock[key]=["growthGoal","harvestRate"].includes(key)?Math.min(100,entered)/100:entered;save();
});
function adjacentFieldReference(element,direction){
  const fields=[...rows.querySelectorAll("input[data-key]")],index=fields.indexOf(element),next=fields[index+direction];
  return next?{id:next.dataset.id,key:next.dataset.key}:null;
}
function focusField(reference){
  if(!reference)return;
  const field=[...rows.querySelectorAll("input[data-key]")].find(element=>element.dataset.id===reference.id&&element.dataset.key===reference.key);
  if(!field)return;
  field.focus({preventScroll:true});
  field.select();
  field.scrollIntoView({block:"nearest",inline:"nearest"});
}
rows.addEventListener("keydown",event=>{
  const element=event.target;if(!element.dataset.key)return;
  const isTab=event.key==="Tab",isPhoneNext=event.key==="Enter";
  if(!isTab&&!isPhoneNext)return;
  const direction=isTab&&event.shiftKey?-1:1;
  const next=adjacentFieldReference(element,direction);
  if(!next){if(isPhoneNext){event.preventDefault();element.blur()}return}
  event.preventDefault();
  render();
  requestAnimationFrame(()=>focusField(next));
});
rows.addEventListener("change",event=>{if(event.target.dataset.key)render()});
rows.addEventListener("click",event=>{
  const id=event.target.dataset.remove;if(!id)return;
  const stock=stocks.find(item=>item.id===id);
  if(confirm(`Remove ${stock?stock.symbol:"this stock"}?`)){stocks=stocks.filter(item=>item.id!==id);render()}
});
addStock.onclick=()=>{
  const entered=prompt("Enter the stock symbol, for example AAPL:");if(entered===null)return;
  const symbol=entered.trim().toUpperCase();
  if(!/^[A-Z0-9.-]{1,15}$/.test(symbol))return alert("Enter a valid stock symbol.");
  stocks.push(normalizeStock({symbol,current:0,buyPrice:0,invested:0,growthGoal:.03,harvestRate:.20,minimumHarvest:1,previousClose:0}));render();
};
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
const settingsModal=document.getElementById("settingsModal"),quoteApiUrl=document.getElementById("quoteApiUrl"),syncKeyInput=document.getElementById("syncKey"),syncStatus=document.getElementById("syncStatus"),priceStatus=document.getElementById("priceStatus");
const priceProgressWrap=document.getElementById("priceProgressWrap"),priceProgress=document.getElementById("priceProgress"),priceProgressText=document.getElementById("priceProgressText"),priceProgressCount=document.getElementById("priceProgressCount");
const menuToggle=document.getElementById("menuToggle"),appMenu=document.getElementById("appMenu");
function setMenu(open){
  appMenu.hidden=!open;
  menuToggle.setAttribute("aria-expanded",String(open));
  menuToggle.setAttribute("aria-label",open?"Close menu":"Open menu");
}
menuToggle.onclick=event=>{event.stopPropagation();setMenu(appMenu.hidden)};
appMenu.addEventListener("click",event=>{event.stopPropagation();if(event.target.closest("button,.file-button,.menu-link"))setMenu(false)});
document.addEventListener("click",()=>setMenu(false));
document.addEventListener("keydown",event=>{if(event.key==="Escape")setMenu(false)});
const DEFAULT_API_URL="https://summer-river-8271.atash1317.workers.dev";
const getApiUrl=()=>localStorage.getItem("harvesterQuoteApi")||DEFAULT_API_URL;
const getSyncKey=()=>localStorage.getItem("harvesterSyncKey")||"";
function setStatus(text,state=""){priceStatus.textContent=text;priceStatus.className=`status ${state}`}
let progressHideTimer;
function updatePriceProgress(done,total,label="Refreshing prices…",countText=`${done} of ${total}`){
  clearTimeout(progressHideTimer);
  priceProgressWrap.hidden=false;
  priceProgress.max=Math.max(total,1);
  priceProgress.value=Math.min(done,total);
  priceProgressText.textContent=label;
  priceProgressCount.textContent=countText;
}
function finishPriceProgress(total,label,countText){
  updatePriceProgress(total,total,label,countText);
  progressHideTimer=setTimeout(()=>{priceProgressWrap.hidden=true},2200);
}
function setSyncStatus(text,state=""){
  syncStatus.textContent=text;
  syncStatus.className=`note ${state}`;
}
function syncHeaders(){return {"Content-Type":"application/json","Authorization":`Bearer ${getSyncKey()}`}}
async function cloudRequest(method,body){
  const response=await fetch(`${getApiUrl()}/portfolio`,{method,headers:syncHeaders(),cache:"no-store",body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Cloud sync failed (HTTP ${response.status})`);
  return data;
}
async function pushPortfolio(){
  if(!getSyncKey())return;
  setSyncStatus("Saving portfolio to Cloudflare…");
  await cloudRequest("PUT",{stocks});
  setSyncStatus(`Portfolio synced at ${new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}.`,"positive");
}
function scheduleCloudSave(){
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>pushPortfolio().catch(error=>setSyncStatus(`Sync pending: ${error.message}`,"negative")),800);
}
async function initializeCloudSync(){
  if(!getSyncKey()){cloudReady=false;setSyncStatus("Cloud sync is not configured on this device.");return}
  try{
    setSyncStatus("Loading portfolio from Cloudflare…");
    const data=await cloudRequest("GET");
    if(data.portfolio&&Array.isArray(data.portfolio.stocks)){
      stocks=data.portfolio.stocks.map(normalizeStock).filter(stock=>stock.symbol);
      localStorage.setItem(storageKey,JSON.stringify(stocks));
      render();
      setSyncStatus("Portfolio loaded from Cloudflare.","positive");
    }else{
      await pushPortfolio();
    }
    cloudReady=true;
  }catch(error){
    cloudReady=false;
    setSyncStatus(`Using this device only: ${error.message}`,"negative");
  }
}
const savedUpdateTime=localStorage.getItem("harvesterLastPriceUpdate");
if(savedUpdateTime)setStatus(`Updated on: ${savedUpdateTime}`,"good");
else setStatus("Prices update when this page is refreshed.");
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function waitForNextPriceGroup(done,total){
  for(let remaining=65;remaining>0;remaining--){
    updatePriceProgress(done,total,"Waiting for next price group…",`${done} of ${total} • ${remaining}s`);
    await wait(1000);
  }
}
let priceRefreshRunning=false;
settings.onclick=()=>{quoteApiUrl.value=getApiUrl();syncKeyInput.value=getSyncKey();settingsModal.classList.add("open")};
syncNow.onclick=async()=>{
  if(!getSyncKey()){settings.onclick();return}
  try{await pushPortfolio()}catch(error){setSyncStatus(`Sync failed: ${error.message}`,"negative");settingsModal.classList.add("open")}
};
closeSettings.onclick=()=>settingsModal.classList.remove("open");
saveSettings.onclick=async()=>{
  const url=quoteApiUrl.value.trim().replace(/\/$/,"");if(!/^https:\/\//i.test(url))return alert("Enter a secure HTTPS URL.");
  const key=syncKeyInput.value.trim();if(key.length<16)return alert("Use a private sync key at least 16 characters long.");
  localStorage.setItem("harvesterQuoteApi",url);
  localStorage.setItem("harvesterSyncKey",key);
  cloudReady=false;
  await initializeCloudSync();
  if(cloudReady){settingsModal.classList.remove("open");refreshPrices(true)}
};
async function refreshPrices(openSettings=false){
  const base=getApiUrl(),symbols=[...new Set(stocks.map(stock=>stock.symbol.trim().toUpperCase()).filter(symbol=>/^[A-Z0-9.-]{1,15}$/.test(symbol)))];
  if(!base){setStatus("Automatic prices are not configured. You can enter prices manually or open Price Settings.","bad");if(openSettings)settingsModal.classList.add("open");return}
  if(!symbols.length)return setStatus("Add a valid stock symbol first.","bad");
  if(priceRefreshRunning){if(openSettings)setStatus("A price update is already running. Please wait for it to finish.");return}
  priceRefreshRunning=true;
  updatePriceProgress(0,symbols.length);
  try{
    const pending=[...symbols],attempts={},completed=new Set(),permanentFailures=new Set();
    let round=0;
    while(pending.length){
      if(round>0){
        await waitForNextPriceGroup(completed.size+permanentFailures.size,symbols.length);
      }
      const batch=pending.splice(0,8);
      updatePriceProgress(completed.size+permanentFailures.size,symbols.length);
      await Promise.all(batch.map(async symbol=>{
        let quote;
        try{
          const response=await fetch(`${base}${base.includes("?")?"&":"?"}symbols=${encodeURIComponent(symbol)}`,{cache:"no-store"});
          const data=await response.json();
          if(response.ok)quote=(data.quotes||{})[symbol];
        }catch{}
        if(quote&&Number(quote.price)>0){
          completed.add(symbol);
          stocks.forEach(stock=>{if(stock.symbol.toUpperCase()===symbol){stock.current=Number(quote.price);if(Number(quote.previousClose)>0)stock.previousClose=Number(quote.previousClose)}});
          render();
        }else{
          attempts[symbol]=(attempts[symbol]||0)+1;
          if(attempts[symbol]<3)pending.push(symbol);else permanentFailures.add(symbol);
        }
        updatePriceProgress(completed.size+permanentFailures.size,symbols.length);
      }));
      round++;
    }
    if(completed.size){
      const updatedTime=new Date().toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
      localStorage.setItem("harvesterLastPriceUpdate",updatedTime);
      setStatus(`Updated on: ${updatedTime}`,"good");
      finishPriceProgress(symbols.length,"Refresh complete",`${completed.size} updated`);
    }else{
      setStatus("Price update failed. Prices already received were kept.","bad");
      finishPriceProgress(symbols.length,"Refresh finished","0 updated");
    }
  }catch(error){
    setStatus(`Price update stopped: ${error.message}. Prices already received were kept.`,"bad");
    finishPriceProgress(symbols.length,"Refresh stopped","Please try again");
  }finally{
    priceRefreshRunning=false;
  }
}
updateSortHeaders();render();initializeCloudSync().then(()=>refreshPrices(false));
