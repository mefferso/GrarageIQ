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
const state={token:"",client:null,selected:"bmw",entries:{bmw:[],gls:[],f150:[]},chart:null,busy:false,firebaseAuth:null};
const $=id=>document.getElementById(id);
const num=v=>v===""||v==null?NaN:Number(v);
const money=n=>Number.isFinite(n)?n.toLocaleString("en-US",{style:"currency",currency:"USD"}):"—";
const format=n=>Number.isFinite(n)?n.toLocaleString("en-US",{maximumFractionDigits:0}):"—";
function status(s,error=false){$("message").textContent=s;$("message").style.color=error?"#ffb0a7":"#42dcb2"}
function setSync(s){$("syncStatus").textContent=s}
function isoToday(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-")}
function parse(rows){if(!rows?.length)return [];const header=rows[0].map(x=>String(x).trim());const indexes=Object.fromEntries(FIELDS.map(k=>[k,header.indexOf(k)]));return rows.slice(1).filter(r=>r.length&&r.some(x=>String(x).trim())).map(r=>Object.fromEntries(FIELDS.map(k=>[k,indexes[k]<0?"":(r[indexes[k]]??"")]))).sort((a,b)=>a.fuelup_date.localeCompare(b.fuelup_date)||num(a.odometer)-num(b.odometer))}
function entries(k){return state.entries[k]||[]}
function eligible(r){return num(r.mpg)>0&&num(r.gallons)>0&&String(r.partial_fuelup)!=="1"&&String(r.missed_fuelup)!=="1"}
function weightedMpg(rows){const good=rows.filter(eligible);const miles=good.reduce((t,r)=>t+(Number.isFinite(num(r.miles))?num(r.miles):0),0);const gals=good.reduce((t,r)=>t+num(r.gallons),0);return gals>0?miles/gals:NaN}
function maxOdo(k){return Math.max(0,...entries(k).map(r=>num(r.odometer)).filter(Number.isFinite))}
async function request(url,opts={}){const response=await fetch(url,{...opts,headers:{Authorization:"Bearer "+state.token,...(opts.headers||{})}});if(response.status===401){state.token="";setSync("Session expired");$("authBtn").textContent="Reconnect Google";throw Error("Google session expired. Connect again.")}const json=await response.json().catch(()=>({}));if(!response.ok)throw Error(json?.error?.message||"Google Sheets request failed");return json}

/* Persistent mode: Firebase Auth automatically restores and refreshes ID tokens.
 * The Cloudflare Worker verifies each Firebase ID token and uses its own service
 * account to read/write ONLY the shared MPG spreadsheet. No Sheets OAuth popup.
 * Until this integration is configured, the original browser OAuth still works.
 */
function persistentReady(){
 const c=CONFIG.firebaseConfig||{};
 return /^https:\/\/[^/]+\.workers\.dev\/?$/.test(CONFIG.workerApiUrl||"")&&Boolean(c.apiKey&&c.authDomain&&c.projectId&&c.appId);
}
function firebaseUser(){return state.firebaseAuth?.currentUser||null}
async function workerRequest(path,options={}){
 const user=firebaseUser();if(!user)throw Error("Sign in with Google.");
 // Firebase SDK transparently rotates its own ID tokens without a Sheets OAuth popup.
 const jwt=await user.getIdToken();
 const result=await fetch(CONFIG.workerApiUrl.replace(/\/$/,"")+path,{
  ...options,headers:{"Authorization":"Bearer "+jwt,...options.headers}
 });
 const body=await result.json().catch(()=>({}));
 if(!result.ok)throw Error(body.error||("API request failed ("+result.status+")"));
 return body;
}
async function firebaseConnect(){
 const auth=state.firebaseAuth;if(!auth){status("Google login is initializing.",true);return}
 if(auth.currentUser){
  await auth.signOut();status("Signed out. Your Google Sheets data is still private.");return;
 }
 try{
  const provider=new firebase.auth.GoogleAuthProvider();
  await auth.signInWithPopup(provider);
 }catch(e){status("Google sign-in failed: "+e.message,true)}
}
async function initFirebase(){
 if(!window.firebase){status("Firebase SDK failed to load.",true);return}
 try{
  if(!firebase.apps.length)firebase.initializeApp(CONFIG.firebaseConfig);
  const auth=firebase.auth();state.firebaseAuth=auth;
  await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
  auth.onAuthStateChanged(async user=>{
   if(!user){
    setSync("Not signed in");$("authBtn").textContent="Connect Google";
    for(const v of VEHICLES)state.entries[v.key]=[];
    render();return;
   }
   $("authBtn").textContent="Sign out";
   try{await load()}catch(e){status(e.message,true);setSync("Sync failed")}
  },e=>{status("Google session error: "+e.message,true)});
 }catch(e){status("Firebase initialization failed: "+e.message,true)}
}

function rangeUrl(sheet){return "https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(SHEET_ID)+"/values/"+encodeURIComponent("'"+sheet.replace(/'/g,"''")+"'!A:Q")}
async function load(){if(!state.token&&!firebaseUser())throw Error("Connect Google first");setSync("Syncing…");if(persistentReady()){const result=await workerRequest("/api/data");VEHICLES.forEach(v=>state.entries[v.key]=parse(result.data?.[v.key]||[]));}else{const result=await Promise.all(VEHICLES.map(v=>request(rangeUrl(v.sheet))));VEHICLES.forEach((v,i)=>state.entries[v.key]=parse(result[i].values));}setSync("Synced with Google Sheets");render();status("Loaded "+VEHICLES.reduce((n,v)=>n+entries(v.key).length,0)+" fuel-ups directly from your private spreadsheet.")}
function render(){const k=state.selected,rows=entries(k);$("totalCount").textContent=format(VEHICLES.reduce((t,v)=>t+entries(v.key).length,0));const avg=weightedMpg(rows);$("avgMpg").textContent=Number.isFinite(avg)?avg.toFixed(1):"—";const spend=rows.reduce((t,r)=>t+(Number.isFinite(num(r.gallons)*num(r.price))?num(r.gallons)*num(r.price):0),0);$("fuelSpend").textContent=money(spend);$("latestOdo").textContent=maxOdo(k)?format(maxOdo(k)):"—";$("vehicles").replaceChildren(...VEHICLES.map(v=>{let data=entries(v.key),node=document.createElement("button");node.type="button";node.className="vehicle"+(v.key===k?" active":"");let mp=weightedMpg(data);node.innerHTML='<div class="carTitle"><span>'+v.name+'</span><span class="carIcon">'+v.icon+'</span></div><div class="carType">'+v.subtitle+'</div><div class="carMetrics"><div><strong>'+(Number.isFinite(mp)?mp.toFixed(1):"—")+'</strong><small>Weighted MPG</small></div><div><strong>'+format(data.length)+'</strong><small>Fill-ups</small></div></div>';node.addEventListener("click",()=>{state.selected=v.key;render()});return node}));const body=$("history");body.replaceChildren();for(const r of [...rows].reverse().slice(0,9)){let tr=document.createElement("tr");const d=[r.fuelup_date,format(num(r.odometer)),Number.isFinite(num(r.gallons))?num(r.gallons).toFixed(2):"—",num(r.mpg)>0?num(r.mpg).toFixed(1):"—",money(num(r.gallons)*num(r.price))];for(let val of d){let td=document.createElement("td");td.textContent=val;tr.append(td)}body.append(tr)}if(!rows.length){let tr=document.createElement("tr"),td=document.createElement("td");td.colSpan=5;td.className="empty";td.textContent=state.token?"No fuel-ups found.":"Connect Google to read your data.";tr.append(td);body.append(tr)}drawChart(rows)}
function drawChart(rows){const metric=$("chartMetric").value;const good=rows.filter(r=>metric!=="mpg"||eligible(r));const last=good.slice(-80);const data=last.map(r=>metric==="mpg"?num(r.mpg):metric==="price"?num(r.price):num(r.gallons)*num(r.price));if(state.chart){state.chart.destroy();state.chart=null}if(!window.Chart)return;state.chart=new Chart($("trendChart"),{type:"line",data:{labels:last.map(r=>r.fuelup_date),datasets:[{label:metric==="mpg"?"MPG":metric==="price"?"$/gallon":"Fill-up cost",data,borderColor:"#42dcb2",backgroundColor:"#42dcb226",fill:true,tension:.18,pointRadius:last.length>35?0:2,spanGaps:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{mode:"index",intersect:false}},scales:{x:{ticks:{color:"#91a7b6",maxTicksLimit:6},grid:{display:false}},y:{ticks:{color:"#91a7b6"},grid:{color:"#293b4d"}}}}})}
function recalc(){const k=$("formVehicle").value,odo=num($("formOdo").value),gals=num($("formGallons").value),price=num($("formPrice").value),prev=maxOdo(k),miles=odo-prev;const partial=$("formPartial").checked||$("formMissed").checked;$("formMiles").textContent=prev&&miles>0?format(miles)+" mi":"—";$("formMPG").textContent=!partial&&miles>0&&gals>0?(miles/gals).toFixed(2)+" MPG":"—";$("formCost").textContent=money(gals*price)}
function openForm(){if(!state.token&&!firebaseUser()){status("Connect Google first to save new fuel-ups.",true);return}$("formVehicle").value=state.selected;$("formDate").value=isoToday();$("formOdo").value="";$("formGallons").value="";$("formPrice").value="";$("formBrand").value="";$("formNotes").value="";$("formPartial").checked=false;$("formMissed").checked=false;recalc();$("fuelDialog").showModal()}
async function save(event){event.preventDefault();if(state.busy)return;let k=$("formVehicle").value,vehicle=VEHICLES.find(x=>x.key===k),odo=num($("formOdo").value),gals=num($("formGallons").value),price=num($("formPrice").value),date=$("formDate").value,previous=maxOdo(k),miles=odo-previous,partial=$("formPartial").checked,missed=$("formMissed").checked;if(!vehicle||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!(odo>0&&gals>0&&price>=0)){status("Please enter a valid date, odometer, gallons and price.",true);return}if(previous&&odo<=previous){status("New odometer must exceed the previous logged mileage ("+format(previous)+").",true);return}if(entries(k).some(r=>r.fuelup_date===date&&num(r.odometer)===odo)){status("This date and odometer are already recorded.",true);return}const mpg=previous&&!partial&&!missed?miles/gals:0;const values=[vehicle.name,vehicle.name,mpg||0,odo,previous?miles:0,gals,price,50,date,new Date().toISOString(),"",$("formNotes").value,missed?1:0,partial?1:0,"","",$("formBrand").value];state.busy=true;$("saveBtn").disabled=true;$("saveBtn").textContent="Saving…";try{
 if(persistentReady()){
  await workerRequest("/api/fuelups",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
   vehicle:k,date,odometer:odo,gallons:gals,price,brand:$("formBrand").value,
   notes:$("formNotes").value,partial,missed
  })});
  $("fuelDialog").close();await load();status("Saved "+vehicle.name+" fuel-up to "+vehicle.sheet+" ✔");
 }else{
 // Read again before append to avoid stale local duplicates
const latest=parse((await request(rangeUrl(vehicle.sheet))).values);const liveMax=Math.max(0,...latest.map(r=>num(r.odometer)).filter(Number.isFinite));if(latest.some(r=>r.fuelup_date===date&&num(r.odometer)===odo))throw Error("That fuel-up already exists in Google Sheets.");if(liveMax!==previous)throw Error("Spreadsheet mileage changed. Refresh before saving to avoid an incorrect MPG.");
const url=rangeUrl(vehicle.sheet)+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS";await request(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({majorDimension:"ROWS",values:[values]})});$("fuelDialog").close();await load();status("Saved "+vehicle.name+" fuel-up directly to "+vehicle.sheet+" ✔");}}catch(e){status("Not saved: "+e.message,true)}finally{state.busy=false;$("saveBtn").disabled=false;$("saveBtn").textContent="Save to Google Sheets"}}
// Only a non-sensitive "previously connected" flag persists across reloads.
// OAuth access tokens remain in memory. Google controls whether silent consent reuse is possible.
const AUTH_HINT="garageiq-google-connected";
function oauthClient(){
 if(!window.google?.accounts?.oauth2) return null;
 if(!state.client)state.client=google.accounts.oauth2.initTokenClient({
  client_id:CONFIG.googleClientId,
  scope:"https://www.googleapis.com/auth/spreadsheets",
  callback:async response=>{
   if(response.error||!response.access_token){
    setSync("Connect Google");
    if(!state.silentAuth)status("Automatic sign-in unavailable. Click Connect Google.",true);
    state.silentAuth=false;
    return;
   }
   state.silentAuth=false;
   state.token=response.access_token;
   try{localStorage.setItem(AUTH_HINT,"1")}catch{}
   $("authBtn").textContent="Reconnect Google";
   try{await load()}catch(e){status(e.message,true);setSync("Sync failed")}
  },
  error_callback:()=>{
   const silent=state.silentAuth;
   state.silentAuth=false;
   setSync("Connect Google");
   if(!silent)status("Google sign-in didn't complete. Click Connect Google to retry.",true);
  }
 });
 return state.client;
}
function connect(){
 if(!CONFIG.googleClientId){status("Set up your Google OAuth Client ID in config.js first.",true);return}
 const client=oauthClient();
 if(!client){status("Google sign-in is still loading. Try again.",true);return}
 state.silentAuth=false;
 // Reuse existing consent without forcing Google's consent screen each time.
 client.requestAccessToken({prompt:""});
}
function autoConnect(attempt=0){
 if(!CONFIG.googleClientId)return;
 try{if(localStorage.getItem(AUTH_HINT)!=="1")return}catch{return}
 const client=oauthClient();
 if(!client){
  if(attempt<15)setTimeout(()=>autoConnect(attempt+1),300);
  return;
 }
 state.silentAuth=true;
 setSync("Restoring Google session…");
 // This may fail where browsers require user interaction; the Connect button remains available.
 try{client.requestAccessToken({prompt:""})}catch{state.silentAuth=false;setSync("Connect Google")}
}
document.addEventListener("DOMContentLoaded",()=>{$("formVehicle").replaceChildren(...VEHICLES.map(v=>{let o=document.createElement("option");o.value=v.key;o.textContent=v.name;return o}));$("authBtn").addEventListener("click",()=>persistentReady()?firebaseConnect():connect());$("newFillBtn").addEventListener("click",openForm);$("closeDialog").addEventListener("click",()=>$("fuelDialog").close());$("cancelBtn").addEventListener("click",()=>$("fuelDialog").close());$("fuelForm").addEventListener("submit",save);["formVehicle","formOdo","formGallons","formPrice","formPartial","formMissed"].forEach(x=>$(x).addEventListener("input",recalc));$("chartMetric").addEventListener("change",render);render();if(persistentReady())initFirebase();else if(!CONFIG.googleClientId)setSync("OAuth setup required");else autoConnect();if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{})});
