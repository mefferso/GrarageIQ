// Run with: node --test tests/mpg.test.cjs
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const source=fs.readFileSync(require("node:path").join(__dirname,"../app.js"),"utf8");
function load(){
 const context={window:{GARAGEIQ_CONFIG:{}},document:{addEventListener(){}},Date,Number,Math};
 vm.createContext(context);
 vm.runInContext(source+"\nthis.api={weightedMpg,estimatedMpg,intervalMiles,rollingSeries,validate,inputISO,eligible,flag,parse,filtered,state,preserveLegacyMpg,fuelSegments};",context);
 return context.api;
}
const row=(odometer,gallons,mpg,miles,{partial=false,missed=false,date="2026-01-01"}={})=>({
 odometer,gallons,mpg,miles,partial_fuelup:partial?1:0,missed_fuelup:missed?1:0,fuelup_date:date
});
test("simple complete fill gives correct MPG and distance",()=>{
 const a=load(),prior=row(1000,10,0,0);
 assert.equal(a.estimatedMpg([prior],1300,15,false,false),20);
 assert.equal(a.intervalMiles([prior],1300),300);
});
test("multiple partial fills are rolled into next full interval",()=>{
 const a=load(),rs=[row(1000,10,25,250),row(1100,3,0,100,{partial:true}),row(1180,2,0,80,{partial:true})];
 assert.equal(a.estimatedMpg(rs,1300,10,false,false),20);
 assert.equal(a.intervalMiles(rs,1300),300);
 const outcome=a.validate({odo:1300,gals:10,price:3,date:"2026-01-02",partial:false,missed:false},rs,null);
 assert.equal(outcome.delta,300);
 assert.equal(outcome.mpg,20);
});
test("missed fill quarantines fuel economy interval",()=>{
 const a=load(),rs=[row(1000,10,25,250),row(1150,8,0,150,{missed:true})];
 assert.equal(Number.isNaN(a.estimatedMpg(rs,1300,10,false,false)),true);
 assert.equal(Number.isNaN(a.intervalMiles(rs,1300)),true);
});
test("ineligible zero gallon does not replace partial baseline",()=>{
 const a=load(),rs=[row(1000,10,20,200),row(1100,0,0,100),row(1200,5,0,100,{partial:true}),row(1300,10,20,300)];
 assert.equal(a.weightedMpg(rs),500/25);
});
test("raw legacy MPG is preserved on metadata-only edit",()=>{
 const a=load(),original=row(1300,10,31.27,300);
 assert.equal(a.preserveLegacyMpg(original,{odo:1300,gals:10,partial:false,missed:false}),true);
 assert.equal(a.preserveLegacyMpg(original,{odo:1300,gals:11,partial:false,missed:false}),false);
});
test("rolling segments include partial fuel without double-counting distance",()=>{
 const a=load(),rs=[row(1000,10,25,250),row(1100,3,0,100,{partial:true}),row(1180,2,0,80,{partial:true}),row(1300,10,20,300)];
 const segments=a.fuelSegments(rs);
 assert.equal(segments.length,2);
 assert.equal(segments[1].miles,300);
 assert.equal(segments[1].gallons,15);
 assert.equal(a.rollingSeries(rs,2)[0].value,550/25);
});
test("rolling 5 and 10 use full history, then period filters points",()=>{
 const a=load(),rows=Array.from({length:15},(_,i)=>row(1000+i*300,10,30+i,300,{date:i<10?"2024-01-01":"2026-01-01"}));
 const full=a.rollingSeries(rows,5);
 assert.equal(full.length,11);
 a.state.period="1";
 const selected=a.filtered(rows);
 const visible=full.filter(x=>selected.includes(x.r));
 assert.equal(visible.length,5);
 assert.equal(visible[0].value,30);
});
test("date parsing accepts ISO and US short dates",()=>{
 const a=load();
 assert.equal(a.inputISO("2026-10-13"),"2026-10-13");
 assert.equal(a.inputISO("10/13/26"),"2026-10-13");
 assert.equal(a.inputISO("02/31/26"),"");
});
test("duplicate odometer remains rejected",()=>{
 const a=load(),rs=[row(1000,10,20,200)];
 assert.throws(()=>a.validate({odo:1000,gals:10,price:3,date:"2026-01-02",partial:false,missed:false},rs,null),/Duplicate odometer/);
});
