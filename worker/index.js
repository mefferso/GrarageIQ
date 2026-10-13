/**
 * GarageIQ's secure Google Sheets bridge (Cloudflare Workers free tier).
 * Firebase ID token authenticates the human; a locked-down Google service account
 * accesses ONLY the spreadsheet explicitly shared with it.
 *
 * Required Worker variables: FIREBASE_PROJECT_ID, ALLOWED_EMAIL, SPREADSHEET_ID
 * Required encrypted Worker secret: GOOGLE_SERVICE_ACCOUNT_JSON (whole JSON, NEVER committed)
 */
const ORIGIN="https://mefferso.github.io";
const SHEETS={bmw:"MPG_335d",gls:"MPG_GLS 550",f150:"MPG_F150"};
const NAMES={bmw:["Badass diesel","BMW 335d"],gls:["Her 550","Mercedes-Benz GLS550"],f150:["F-150 Platinum","Ford F-150"]};
let jwksCache={until:0,keys:[]},googleToken={until:0,value:""};
const te=new TextEncoder();
function b64(bytes){let str="";for(const b of new Uint8Array(bytes))str+=String.fromCharCode(b);return btoa(str).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function unb64(s){const str=atob(s.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(s.length/4)*4,"="));return Uint8Array.from(str,c=>c.charCodeAt(0))}
function j64(o){return b64(te.encode(JSON.stringify(o)))}
function cors(){return {"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Authorization,Content-Type","Vary":"Origin","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8",...cors()}})}
function error(message,status=400){return json({error:message},status)}
async function authorized(request,env){
 const value=request.headers.get("Authorization")||"";
 if(!value.startsWith("Bearer "))throw Object.assign(new Error("Sign in to GarageIQ."),{status:401});
 const parts=value.slice(7).split(".");if(parts.length!==3)throw Object.assign(new Error("Invalid authentication token."),{status:401});
 let hdr,payload;try{hdr=JSON.parse(new TextDecoder().decode(unb64(parts[0])));payload=JSON.parse(new TextDecoder().decode(unb64(parts[1])))}catch{throw Object.assign(new Error("Invalid authentication token."),{status:401})}
 const now=Math.floor(Date.now()/1000);
 if(hdr.alg!=="RS256"||!hdr.kid||payload.aud!==env.FIREBASE_PROJECT_ID||payload.iss!=="https://securetoken.google.com/"+env.FIREBASE_PROJECT_ID||!payload.sub||!Number.isFinite(payload.exp)||payload.exp<=now||!Number.isFinite(payload.iat)||payload.iat>now+60||!Number.isFinite(payload.auth_time)||payload.auth_time>now+60)throw Object.assign(new Error("Invalid or expired sign-in."),{status:401});
 if(Date.now()>jwksCache.until){
  const response=await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com");
  if(!response.ok)throw Error("Google token verification unavailable.");
  const jwks=await response.json();jwksCache={until:Date.now()+900000,keys:jwks.keys||[]};
 }
 const jwk=jwksCache.keys.find(k=>k.kid===hdr.kid);
 if(!jwk)throw Object.assign(new Error("Google signing key not found."),{status:401});
 const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
 const verified=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,unb64(parts[2]),te.encode(parts[0]+"."+parts[1]));
 if(!verified)throw Object.assign(new Error("Invalid token signature."),{status:401});
 if(payload.firebase?.sign_in_provider!=="google.com"||payload.email_verified!==true||String(payload.email||"").toLowerCase()!==String(env.ALLOWED_EMAIL||"").trim().toLowerCase())throw Object.assign(new Error("This Google account is not allowed to access GarageIQ."),{status:403});
 return payload;
}
async function sheetsToken(env){
 if(googleToken.value&&Date.now()<googleToken.until)return googleToken.value;
 const sa=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON||"null");
 if(!sa?.client_email||!sa?.private_key)throw Error("Worker service account not configured.");
 const now=Math.floor(Date.now()/1000),header=j64({alg:"RS256",typ:"JWT"}),payload=j64({iss:sa.client_email,scope:"https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600});
 const privateBytes=unb64(sa.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"").replace(/\+/g,"-").replace(/\//g,"_"));
 const key=await crypto.subtle.importKey("pkcs8",privateBytes,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
 const unsigned=header+"."+payload;
 const assertion=unsigned+"."+b64(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,te.encode(unsigned)));
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion}).toString()});
 const result=await response.json();
 if(!response.ok||!result.access_token)throw Error("Google service account authorization failed. Check Worker secret and Sheets API.");
 googleToken={value:result.access_token,until:Date.now()+Math.min(3000,result.expires_in-120)*1000};
 return googleToken.value;
}
async function sheetsFetch(env,path,init={}){
 const access=await sheetsToken(env);
 const response=await fetch("https://sheets.googleapis.com/v4/spreadsheets/"+encodeURIComponent(env.SPREADSHEET_ID)+"/values"+(path.startsWith(":")?"":"/")+path,{...init,headers:{Authorization:"Bearer "+access,...(init.headers||{})}});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error(result?.error?.message||"Google Sheets API error."),{status:response.status===403?403:502});
 return result;
}
function sheetRange(name){return encodeURIComponent("'"+name.replace(/'/g,"''")+"'!A:Q")}
async function allData(env){
 const q=new URLSearchParams();for(const sheet of Object.values(SHEETS))q.append("ranges","'"+sheet+"'!A:Q");q.set("valueRenderOption","UNFORMATTED_VALUE");
 const result=await sheetsFetch(env,":batchGet?"+q);
 const data={};for(const [k,sheet] of Object.entries(SHEETS)){const i=Object.values(SHEETS).indexOf(sheet);data[k]=result.valueRanges?.[i]?.values||[]}
 return {data};
}
function numeric(value){if(value===null||value===""||typeof value==="boolean")return NaN;return Number(value)}
function validate(b){
 if(!b||typeof b!=="object"||!SHEETS[b.vehicle])throw Object.assign(new Error("Invalid vehicle."),{status:400});
 if(typeof b.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||Number.isNaN(Date.parse(b.date+"T12:00:00Z")))throw Object.assign(new Error("Invalid date."),{status:400});
 for(const p of ["odometer","gallons","price"])if(!Number.isFinite(numeric(b[p])))throw Object.assign(new Error("Invalid "+p+"."),{status:400});
 if(!Number.isInteger(numeric(b.odometer))||numeric(b.odometer)<1||numeric(b.odometer)>10000000||numeric(b.gallons)<=0||numeric(b.gallons)>250||numeric(b.price)<0||numeric(b.price)>50)throw Object.assign(new Error("Fuel-up values outside expected limits."),{status:400});
 if(typeof b.notes!=="string"||b.notes.length>2000||typeof b.brand!=="string"||b.brand.length>100)throw Object.assign(new Error("Notes or station too long."),{status:400});
}
async function addFuelUp(env,entry){
 validate(entry);
 const vehicle=entry.vehicle,sheet=SHEETS[vehicle],existing=await sheetsFetch(env,sheetRange(sheet));
 const values=existing.values||[],header=(values[0]||[]).map(x=>String(x).trim());
 for(const field of ["odometer","fuelup_date"])if(!header.includes(field))throw Object.assign(new Error("Spreadsheet headers are missing "+field+"."),{status:409});
 const indexOdo=header.indexOf("odometer"),indexDate=header.indexOf("fuelup_date");
 const rows=values.slice(1).filter(row=>row.some(x=>String(x).trim()!==""));
 const max=Math.max(0,...rows.map(row=>numeric(row[indexOdo])).filter(Number.isFinite));
 const odo=numeric(entry.odometer),gallons=numeric(entry.gallons),price=numeric(entry.price);
 if(rows.some(row=>String(row[indexDate]).slice(0,10)===entry.date&&numeric(row[indexOdo])===odo))throw Object.assign(new Error("That fuel-up already exists."),{status:409});
 if(max&&odo<=max)throw Object.assign(new Error("Odometer must exceed last logged mileage ("+max+")."),{status:409});
 const distance=max?odo-max:0;
 const mpg=distance&&!entry.partial&&!entry.missed?distance/gallons:0;
 const row=[NAMES[vehicle][0],NAMES[vehicle][1],mpg,odo,distance,gallons,price,50,entry.date,new Date().toISOString(),"",entry.notes||"",entry.missed?1:0,entry.partial?1:0,"","",entry.brand||""];
 const result=await sheetsFetch(env,sheetRange(sheet)+":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({majorDimension:"ROWS",values:[row]})});
 return {ok:true,updatedRange:result.updates?.updatedRange||"",odometer:odo,mpg};
}
export default {async fetch(request,env){
 const origin=request.headers.get("Origin");if(origin&&origin!==ORIGIN)return error("Origin not allowed.",403);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors()});
 const path=new URL(request.url).pathname;
 if(path==="/api/health"&&request.method==="GET")return json({ok:true,configured:Boolean(env.FIREBASE_PROJECT_ID&&env.SPREADSHEET_ID&&env.ALLOWED_EMAIL&&env.GOOGLE_SERVICE_ACCOUNT_JSON)});
 if(!env.FIREBASE_PROJECT_ID||!env.SPREADSHEET_ID||!env.ALLOWED_EMAIL||!env.GOOGLE_SERVICE_ACCOUNT_JSON)return error("Backend setup incomplete.",503);
 try{
  await authorized(request,env);
  if(path==="/api/data"&&request.method==="GET")return json(await allData(env));
  if(path==="/api/fuelups"&&request.method==="POST"){
   const length=Number(request.headers.get("content-length")||0);if(length>12000)return error("Request too large.",413);
   const body=await request.text();if(body.length>12000)return error("Request too large.",413);
   return json(await addFuelUp(env,JSON.parse(body)));
  }
  return error("Not found.",404);
 }catch(e){return error(e.message||"Unexpected backend error.",e.status||500)}
}};
