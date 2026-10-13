/* GarageIQ — browser-only Google OAuth; no stored secrets or published fuel data. */
"use strict";
const CONFIG=window.GARAGEIQ_CONFIG||{};
const SHEET_ID=CONFIG.spreadsheetId;
const VEHICLES=[
 {key:"bmw",name:"BMW 335d",subtitle:"Badass diesel · 2010",sheet:"MPG_335d",icon:"🏎️"},
 {key:"gls",name:"Mercedes GLS550",subtitle:"Her 550 · 2018",sheet:"MPG_GLS 550",icon:"🚙"},
 {key:"f150",name:"Ford F-150",subtitle:"Platinum · 2013",sheet:"MPG_F150",icon:"🛻"}
];
const FIELDS=["car_name","model","mpg","odometer","miles","gallons","price","city_percentage","fuelup_date","date_added","tags","notes","missed_fuelup","partial_fuelup","latitude","longitude","brand"];
const state={token:"",client:null,selected:"bmw",entries:{bmw:[],gls:[],f150:[]},chart:null,busy:false,editing:null,period:"all",rolling:10,historyLimit:9};
const $=id=>document.getElementById(id);
const num=v=>v===""||v==null?NaN:Number(v);
const money=n=>Number.isFinite(n)?n.toLocaleString("en-US",{style:"currency",currency:"USD"}):"—";
const format=n=>Number.isFinite(n)?n.toLocaleString("en-US",{maximumFractionDigits:0}):"—";
function status(s,error=false){$("message").textContent=s;$("message").style.color=error?"#ffb0a7":"#42dcb2"}
function setSync(s){$("syncStatus").textContent=s}
function displayDate(s){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||""));return m?m[2]+"/"+m[3]+"/"+m[1].slice(-2):String(s||"—")}
function inputISO(s){if(/^\d{4}-\d{2}-\d{2}$/.test(String(s||"")))return validISO(s)?s:"";const m=/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(String(s||"").trim());if(!m)return "";const iso="20"+m[3]+"-"+m[1].padStart(2,"0")+"-"+m[2].padStart(2,"0");const d=new Date(iso+"T12:00:00");return !Number.isNaN(d.valueOf())&&d.getFullYear()===Number("20"+m[3])&&d.getMonth()+1===Number(m[1])&&d.getDate()===Number(m[2])?iso:""}
function validISO(s){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);if(!m)return false;const d=new Date(s+"T12:00:00");return Number.isFinite(+d)&&d.getFullYear()===+m[1]&&d.getMonth()+1===+m[2]&&d.getDate()===+m[3]}
function isoToday(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
function parse(rows){if(!rows?.length)return [];const header=rows[0].map(x=>String(x).trim());const indexes=Object.fromEntries(FIELDS.map(k=>[k,header.indexOf(k)]));return rows.slice(1).map((r,i)=>({r,i})).filter(({r})=>r.length&&r.some(x=>String(x).trim())).map(({r,i})=>({...Object.fromEntries(FIELDS.map(k=>[k,indexes[k]<0?"":(r[indexes[k]]??"")])),__row:i+2})).sort((a,b)=>a.fuelup_date.localeCompare(b.fuelup_date)||num(a.odometer)-num(b.odometer))}
function entries(k){return state.entries[k]||[]}
function eligible(r){return num(r.mpg)>0&&num(r.gallons)>0&&!flag(r.partial_fuelup)&&!flag(r.missed_fuelup)&&num(r.miles)>0}
function flag(v){return ["1","true","yes"].includes(String(v).toLowerCase())}
function weightedMpg(rows){
 const sorted=[...rows].sort((a,b)=>num(a.odometer)-num(b.odometer));let miles=0,gallons=0,partials=[],previousFull=null;
 for(const r of sorted){
  if(flag(r.missed_fuelup)){partials=[];previousFull=null;continue}
  if(flag(r.partial_fuelup)){partials.push(r);continue}
  if(!eligible(r)){partials=[];if(num(r.odometer)>0&&num(r.gallons)>0)previousFull=r;continue}
  if(partials.length){
   const begin=num(previousFull?.odometer),end=num(r.odometer);
   const sum=num(r.gallons)+partials.reduce((a,p)=>a+num(p.gallons),0);
   if(Number.isFinite(begin)&&end>begin&&sum>0&&partials.every(p=>num(p.gallons)>0)){miles+=end-begin;gallons+=sum}
  }else{miles+=num(r.miles);gallons+=num(r.gallons)}
  partials=[];previousFull=r;
 }
 return gallons>0?miles/gallons:NaN
}
function estimatedMpg(rows,odo,gallons,missed,partial){
 if(missed||partial)return NaN;
 const preceding=rows.filter(r=>num(r.odometer)<odo).sort((a,b)=>num(a.odometer)-num(b.odometer));
 if(!preceding.length)return NaN;
 let sum=gallons,begin=NaN;
 for(let i=preceding.length-1;i>=0;i--){
   const r=preceding[i];
   if(flag(r.missed_fuelup))return NaN;
   if(flag(r.partial_fuelup)){if(!(num(r.gallons)>0))return NaN;sum+=num(r.gallons);continue}
   if(!(num(r.odometer)>0&&num(r.gallons)>0))return NaN;
   begin=num(r.odometer);break;
 }
 return Number.isFinite(begin)&&odo>begin&&sum>0?(odo-begin)/sum:NaN;
}
function filtered(rows){const p=state.period;if(p==="all")return rows;const cutoff=new Date();cutoff.setFullYear(cutoff.getFullYear()-Number(p));return rows.filter(r=>new Date(r.fuelup_date+"T12:00:00")>=cutoff)}
function rollingSeries(rows,n){
 // Calculate windows on the full history, then select the visible date range.
 // Keep the original Fuelly MPG for each complete recorded fill.
 const good=rows.filter(eligible),out=[];
 for(let i=0;i<good.length;i++){
  const window=good.slice(Math.max(0,i-n+1),i+1);
  if(window.length<n)continue;
  const gallons=window.reduce((a,r)=>a+num(r.gallons),0);
  const miles=window.reduce((a,r)=>a+num(r.miles),0);
  if(gallons>0)out.push({r:good[i],value:miles/gallons});
 }
 return out;
}
function intervalMiles(rows,odo){const sorted=rows.filter(r=>num(r.odometer)<odo).sort((a,b)=>num(a.odometer)-num(b.odometer));for(let i=sorted.length-1;i>=0;i--){const r=sorted[i];if(flag(r.missed_fuelup))return NaN;if(!flag(r.partial_fuelup))return num(r.odometer)>0?odo-num(r.odometer):NaN}return NaN}
function maxOdo(k){return Math.max(0,...entries(k).map(r=>num(r.odometer)).filter(Number.isFinite))}
async function request(url,opts={}){const response=await fetch(url,{...opts,headers:{Authorization:"Bearer "+state.token,...(opts.headers||{})}});if(response.status===401){state.token="";setSync("Session expired");$("authBtn").textContent="Reconnect Google";throw Error("Google session expired. Connect again.")}const json=await response.json().catch(()=>({}));if(!response.ok)throw Error(json?.error?.message||"Google Sheets request failed");return json}

function rangeUrl(sheet){return "https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(SHEET_ID)+"/values/"+encodeURIComponent("'"+sheet.replace(/'/g,"''")+"'!A:Q")}
async function load(){if(!state.token)throw Error("Connect Google first");setSync("Syncing…");const result=await Promise.all(VEHICLES.map(v=>request(rangeUrl(v.sheet))));VEHICLES.forEach((v,i)=>state.entries[v.key]=parse(result[i].values));setSync("Synced with Google Sheets");render();status("Loaded "+VEHICLES.reduce((n,v)=>n+entries(v.key).length,0)+" fuel-ups directly from your private spreadsheet.")}
function render(){const k=state.selected,rows=filtered(entries(k));$("totalCount").textContent=format(rows.length);const avg=weightedMpg(rows);$("avgMpg").textContent=Number.isFinite(avg)?avg.toFixed(1):"—";const spend=rows.reduce((t,r)=>t+(num(r.gallons)>0&&num(r.price)>=0?num(r.gallons)*num(r.price):0),0);$("fuelSpend").textContent=money(spend);$("latestOdo").textContent=maxOdo(k)?format(maxOdo(k)):"—";const miles=rows.reduce((t,r)=>t+(num(r.miles)>0?num(r.miles):0),0);$("costMile").textContent=miles>0?money(spend/miles):"—";$("totalGallons").textContent=format(rows.reduce((t,r)=>t+(num(r.gallons)>0?num(r.gallons):0),0));$("vehicles").replaceChildren(...VEHICLES.map(v=>{let data=entries(v.key),node=document.createElement("button");node.type="button";node.className="vehicle"+(v.key===k?" active":"");let mp=weightedMpg(data);node.innerHTML='<div class="carTitle"><span>'+v.name+'</span><span class="carIcon">'+v.icon+'</span></div><div class="carType">'+v.subtitle+'</div><div class="carMetrics"><div><strong>'+(Number.isFinite(mp)?mp.toFixed(1):"—")+'</strong><small>Weighted MPG</small></div><div><strong>'+format(data.length)+'</strong><small>Fill-ups</small></div></div>';node.addEventListener("click",()=>{state.selected=v.key;state.historyLimit=9;render()});return node}));const body=$("history");body.replaceChildren();for(const r of [...rows].reverse().slice(0,state.historyLimit)){let tr=document.createElement("tr");const d=[displayDate(r.fuelup_date),format(num(r.odometer)),Number.isFinite(num(r.gallons))?num(r.gallons).toFixed(2):"—",num(r.mpg)>0?num(r.mpg).toFixed(1):"—",money(num(r.gallons)*num(r.price))];for(let val of d){let td=document.createElement("td");td.textContent=val;tr.append(td)}let action=document.createElement("td"),btn=document.createElement("button");btn.type="button";btn.textContent="Edit";btn.className="editBtn";btn.addEventListener("click",()=>openForm(r));action.append(btn);tr.append(action);body.append(tr)}if(!rows.length){let tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=6;td.className="empty";td.textContent=state.token?"No fuel-ups found.":"Connect Google to read your data.";tr.append(td);body.append(tr)}$("showMore").hidden=rows.length<=state.historyLimit;drawChart(rows)}
function drawChart(rows){
 const metric=$("chartMetric").value,rolling=metric==="rolling";
 $("rollingControl").hidden=!rolling;
 $("chartTitle").textContent=({rolling:"Rolling MPG trend",mpg:"MPG per fill-up",price:"Fuel price trend",cost:"Fill-up cost trend"})[metric];
 const series=rolling?rollingSeries(entries(state.selected),state.rolling).filter(x=>rows.includes(x.r)):rows.filter(r=>metric!=="mpg"||eligible(r)).map(r=>({r,value:metric==="mpg"?num(r.mpg):metric==="price"?num(r.price):num(r.gallons)*num(r.price)}));
 const points=series.filter(x=>Number.isFinite(x.value)&&x.value>0&&/^\d{4}-\d{2}-\d{2}$/.test(x.r.fuelup_date));
 if(state.chart){state.chart.destroy();state.chart=null}
 if(!window.Chart)return;
 const labels=points.map(x=>displayDate(x.r.fuelup_date)),data=points.map(x=>x.value);
 state.chart=new Chart($("trendChart"),{
  type:"line",data:{labels,datasets:[{label:({rolling:"Rolling weighted MPG",mpg:"MPG per fill-up",price:"Price per gallon",cost:"Fill-up cost"})[metric],data,borderColor:"#42dcb2",backgroundColor:"#42dcb226",fill:true,tension:rolling?.22:.08,pointRadius:points.length>40?0:2,spanGaps:false}]},
  options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{title:items=>items[0]?.label||""}}},scales:{x:{ticks:{color:"#91a7b6",maxTicksLimit:7,maxRotation:0,minRotation:0},grid:{display:false}},y:{beginAtZero:false,ticks:{color:"#91a7b6"},grid:{color:"#293b4d"}}}}
 });
}

function formValues(){return {k:$("formVehicle").value,odo:num($("formOdo").value),gals:num($("formGallons").value),price:num($("formPrice").value),date:inputISO($("formDate").value),partial:$("formPartial").checked,missed:$("formMissed").checked}}
function previousAndNext(k,odo,excludeRow){const rows=entries(k).filter(r=>r.__row!==excludeRow).sort((a,b)=>num(a.odometer)-num(b.odometer));return {rows,previous:rows.filter(r=>num(r.odometer)<odo).at(-1),next:rows.find(r=>num(r.odometer)>odo)}}
function recalc(){
 const v=formValues(),{rows,previous}=previousAndNext(v.k,v.odo,state.editing?.row),distance=v.odo-num(previous?.odometer),mpg=estimatedMpg(rows,v.odo,v.gals,v.missed,v.partial);
 $("formMiles").textContent=previous&&distance>0?format(distance)+" mi":"—";
 $("formMPG").textContent=Number.isFinite(mpg)?mpg.toFixed(2)+" MPG":"—";
 $("formCost").textContent=v.gals>0&&v.price>=0?money(v.gals*v.price):"—";
 $("formWarn").textContent=Number.isFinite(mpg)&&(mpg<5||mpg>65)?"Unusual MPG: "+mpg.toFixed(1)+". Check mileage and gallons.":(!previous?"No preceding odometer: MPG cannot be calculated.":"");
}
function openForm(r=null){
 if(!state.token){status("Connect Google first to edit or save fuel-ups.",true);return}
 state.editing=r?{row:r.__row,vehicle:state.selected,original:r}:null;
 $("formVehicle").value=state.selected;$("formVehicle").disabled=!!r;
 $("formTitle").textContent=r?"Edit fuel-up":"New fuel-up";$("saveBtn").textContent=r?"Save changes":"Save to Google Sheets";
 $("formDate").value=$("formDate").type==="date"?(r?.fuelup_date||isoToday()):displayDate(r?.fuelup_date||isoToday());$("formOdo").value=r?.odometer||"";
 $("formGallons").value=r?.gallons||"";$("formPrice").value=r?.price||"";
 $("formBrand").value=r?.brand||"";$("formNotes").value=r?.notes||"";
 $("formPartial").checked=r?flag(r.partial_fuelup):false;$("formMissed").checked=r?flag(r.missed_fuelup):false;
 recalc();$("fuelDialog").showModal();
}
function validate(v,rows,excludeRow){
 const existing=rows.filter(r=>r.__row!==excludeRow),byOdo=[...existing].sort((a,b)=>num(a.odometer)-num(b.odometer));
 const prev=byOdo.filter(r=>num(r.odometer)<v.odo).at(-1),next=byOdo.find(r=>num(r.odometer)>v.odo);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||Number.isNaN(new Date(v.date+"T12:00:00").valueOf())||!(Number.isInteger(v.odo)&&v.odo>0&&v.gals>0&&v.gals<200&&v.price>=0&&v.price<100))throw Error("Check date, whole-mile odometer, gallons (0–200), and price.");
 if(existing.some(r=>num(r.odometer)===v.odo))throw Error("Duplicate odometer entry already exists.");
 if(prev&&v.odo<=num(prev.odometer)||next&&v.odo>=num(next.odometer))throw Error("Odometer must fit between adjacent records.");
 const chronological=[...existing].sort((a,b)=>a.fuelup_date.localeCompare(b.fuelup_date)||num(a.odometer)-num(b.odometer));
 const before=chronological.filter(r=>r.fuelup_date<=v.date).at(-1),after=chronological.find(r=>r.fuelup_date>v.date);
 if(before&&v.odo<=num(before.odometer)||after&&v.odo>=num(after.odometer))throw Error("Date and odometer conflict with historical records.");
 const delta=prev?v.odo-num(prev.odometer):0;if(delta>1600)throw Error("Over 1,600 miles since previous entry. Check odometer or missed fuel-ups.");
 const mpg=estimatedMpg(existing,v.odo,v.gals,v.missed,v.partial);return {prev,mpg,delta:Number.isFinite(mpg)?intervalMiles(existing,v.odo):delta};
}
function rowValues(v,original,calculated){
 const vehicle=VEHICLES.find(x=>x.key===v.k),src=original||{};
 return [src.car_name||vehicle.name,src.model||({"bmw":"BMW 335d","gls":"Mercedes-Benz GLS550","f150":"Ford F-150"}[v.k]),
 Number.isFinite(calculated.mpg)?Number(calculated.mpg.toFixed(3)):0,v.odo,calculated.delta,v.gals,v.price,src.city_percentage||50,v.date,src.date_added||new Date().toISOString(),
 src.tags||"",$("formNotes").value,v.missed?1:0,v.partial?1:0,src.latitude||"",src.longitude||"",$("formBrand").value];
}
async function save(event){
 event.preventDefault();if(state.busy)return;
 const v=formValues(),vehicle=VEHICLES.find(x=>x.key===v.k),edit=state.editing;
 if(!vehicle)return status("Choose a vehicle.",true);
 state.busy=true;$("saveBtn").disabled=true;$("saveBtn").textContent="Saving…";
 try{
 const latest=parse((await request(rangeUrl(vehicle.sheet))).values);
 if(edit&&edit.vehicle!==v.k)throw Error("Vehicle cannot be changed when editing.");
 const old=edit&&latest.find(r=>r.__row===edit.row);
 if(edit&&(!old||old.odometer!==edit.original.odometer||old.fuelup_date!==edit.original.fuelup_date))throw Error("This row changed in Sheets. Reload before editing.");
 const calc=validate(v,latest,edit?.row),mpg=calc.mpg;
 if(Number.isFinite(mpg)&&(mpg<5||mpg>65)&&!confirm("Unusual MPG of "+mpg.toFixed(1)+". Save anyway?"))return;
 const original=old||null;
 // Preserve legacy Fuelly MPG when editing metadata alone; calculate only when fuel inputs change.
 if(old&&num(old.odometer)===v.odo&&num(old.gallons)===v.gals&&flag(old.partial_fuelup)===v.partial&&flag(old.missed_fuelup)===v.missed){calc.mpg=num(old.mpg);calc.delta=num(old.miles)}
 const values=rowValues(v,original,calc);
 let url,method;
 if(edit){url="https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(SHEET_ID)+"/values/"+encodeURIComponent("'"+vehicle.sheet+"'!A"+edit.row+":Q"+edit.row)+"?valueInputOption=RAW";method="PUT"}
 else{url=rangeUrl(vehicle.sheet)+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS";method="POST"}
 await request(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify({majorDimension:"ROWS",values:[values]})});
 $("fuelDialog").close();state.editing=null;
 try{await load();status((edit?"Updated":"Saved")+" "+vehicle.name+" record ✔")}catch(e){setSync("Saved; refresh needed");status("Google Sheets confirmed the save, but dashboard refresh failed. Reconnect or refresh to see it.",true)}
 }catch(e){status("Not saved: "+e.message,true)}
 finally{state.busy=false;$("saveBtn").disabled=false;$("saveBtn").textContent="Save to Google Sheets"}
}
function csvEscape(value){const s=String(value??"");return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function exportCSV(){const rows=entries(state.selected);if(!rows.length){status("Connect Google before exporting.",true);return}const csv=[FIELDS.join(","),...rows.map(r=>FIELDS.map(f=>csvEscape(r[f])).join(","))].join("\r\n");const blob=new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="garageiq_"+state.selected+"_"+isoToday().replace(/-/g,"")+".csv";document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function connect(){
 if(!CONFIG.googleClientId){status("Google OAuth Client ID is missing.",true);return}
 if(!window.google?.accounts?.oauth2){status("Google sign-in is loading. Try again.",true);return}
 if(!state.client)state.client=google.accounts.oauth2.initTokenClient({
  client_id:CONFIG.googleClientId,
  scope:"https://www.googleapis.com/auth/spreadsheets",
  callback:async response=>{
   if(response.error||!response.access_token){status("Google authorization was not completed.",true);return}
   state.token=response.access_token;
   $("authBtn").textContent="Reconnect Google";
   try{await load()}catch(e){status(e.message,true);setSync("Sync failed")}
  },
  error_callback:()=>status("Google sign-in was cancelled or blocked. Click Connect Google to retry.",true)
 });
 state.client.requestAccessToken({prompt:""});
}
document.addEventListener("DOMContentLoaded",()=>{const dateInput=$("formDate");const probe=document.createElement("input");probe.type="date";probe.value="2026-10-13";if(probe.type!=="date"||probe.value!=="2026-10-13"){dateInput.type="text";dateInput.inputMode="numeric";dateInput.placeholder="MM/DD/YY";dateInput.maxLength=8;dateInput.pattern="[0-9]{1,2}/[0-9]{1,2}/[0-9]{2}"}$("formVehicle").replaceChildren(...VEHICLES.map(v=>{let o=document.createElement("option");o.value=v.key;o.textContent=v.name;return o}));$("authBtn").addEventListener("click",connect);$("newFillBtn").addEventListener("click",()=>openForm());$("closeDialog").addEventListener("click",()=>{$("fuelDialog").close();state.editing=null});$("cancelBtn").addEventListener("click",()=>{$("fuelDialog").close();state.editing=null});$("fuelForm").addEventListener("submit",save);["formVehicle","formOdo","formGallons","formPrice","formPartial","formMissed"].forEach(x=>$(x).addEventListener("input",recalc));$("showMore").addEventListener("click",()=>{state.historyLimit+=9;render()});$("exportBtn").addEventListener("click",exportCSV);$("chartMetric").addEventListener("change",render);$("period").addEventListener("change",e=>{state.period=e.target.value;render()});$("rolling").addEventListener("change",e=>{state.rolling=Number(e.target.value);render()});render();if(!CONFIG.googleClientId)setSync("OAuth setup required");if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{})});
