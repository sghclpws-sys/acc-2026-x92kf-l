const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const C=require('../monthly-review-core.js');
const tx=[
  {date:'2026-06-01',category:'외식',amount:3000000,store:'식당'},
  {date:'2026-06-02',category:'여행',amount:9000000},
  {date:'2026-07-01',category:'외식',amount:1000000,settlement:200000},
  {date:'2026-07-02',category:'생활비',amount:1200000},
  {date:'2026-08-02',category:'외식',amount:100000,store:'식당'},
];
function config(month='2026-08') {const b=C.baseline(tx,month);return {baseline:b,budget:b.budget,reasons:{},goals:[]};}
test('budgets drop amounts below ten thousand won without exceeding maxima',()=>{
  assert.equal(C.roundBudget(392091),390000);
  assert.equal(C.roundBudget(9999),0);
  assert.equal(C.roundBudget(400000),400000);
  const b=C.baseline([{date:'2026-07-01',category:'외식',amount:392091}],'2026-08');
  assert.equal(b.budget['외식'],390000);
  assert(Object.values(b.budget).every(v=>v%10000===0));
});
test('budget excludes travel, averages zero categories and ignores current/future months',()=>{
  const b=C.baseline(tx,'2026-08');
  assert.deepEqual(b.months,['2026-06','2026-07']);
  assert.equal(b.average['외식'],1900000);assert.equal(b.average['생활비'],600000);
  assert.equal(b.budget['여행'],undefined);
  assert.equal(Object.values(b.budget).reduce((a,b)=>a+b),2000000);
  for(const cat in b.budget)assert(b.budget[cat]<=b.max[cat]);
  assert.equal(C.baseline(tx,'2026-06').initial,true);
  assert.equal(C.baseline([],'2026-08').months.length,0);
});
test('budget rejects cap, category maxima, negative, noninteger and blank-like amounts',()=>{
  let c=config();c.budget={...c.baseline.max};assert.throws(()=>C.validateConfig(c),/200만/);
  for(const v of [-1,0.5,NaN,'',1900001]){c=config();c.budget['외식']=v;assert.throws(()=>C.validateConfig(c));}
  assert(C.validateConfig(config())<=C.CAP);
});
test('goals measure net expense, positive charge count, and cancelled subscription',()=>{
  const data=[{date:'2026-08-01',category:'외식',store:'식당',amount:30000,settlement:10000},{date:'2026-08-02',category:'외식',store:'식당',amount:-5000},{date:'2026-09-01',category:'외식',store:'식당',amount:99999}];
  assert.equal(C.measure(data,'2026-08',{category:'외식',store:'식당',type:'amount'}),15000);
  assert.equal(C.measure(data,'2026-08',{category:'외식',store:'식당',type:'count'}),1);
  assert.equal(C.measure(data,'2026-08',{category:'통신/렌탈',store:'구독',type:'stop'}),0);
  const c=config();c.goals=[{category:'통신/렌탈',store:'',type:'stop',limit:0}];assert.throws(()=>C.validateConfig(c));
  c.goals=Array(4).fill({category:'외식',store:'',type:'amount',limit:100});assert.throws(()=>C.validateConfig(c));
  assert.equal(C.shift('2026-12',1),'2027-01');assert.equal(C.shift('2026-01',-1),'2025-12');
});
test('both separate comments must acknowledge exactly the current data and config',()=>{
  const fp=C.fingerprint(tx,'2026-08'), doc={revision:1,config:config(),comments:{a:{text:'확인',revision:1,fingerprint:fp}}};
  assert.equal(C.completion(doc,fp,['a','b']),false);
  doc.comments.b={text:'다음 달 외식 줄이기',revision:1,fingerprint:fp};
  assert.equal(C.completion(doc,fp,['a','b']),true);
  assert.equal(C.fingerprint([...tx].reverse(),'2026-08'),fp);
  assert.equal(C.completion(doc,C.fingerprint([...tx,{date:'2026-08-03',amount:10}],'2026-08'),['a','b']),false);
  doc.revision++;assert.equal(C.completion(doc,fp,['a','b']),false);
});

// Exercise the actual Firebase adapter with a transactional in-memory store.
function adapter() {
  const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
  const source=html.slice(html.indexOf('  window._reviewMembers ='),html.indexOf('  window._fbSaveHouseholdSummary ='));
  const docs=new Map([['gaegebu/main',{transactions:JSON.stringify(tx)}]]), auth={currentUser:{uid:'a'}};
  const context={window:{MonthlyReviewCore:C},householdUsers:['a','b'],auth,db:{},Date,
    requireHouseholdUser(){if(!auth.currentUser)throw Error('login');},
    doc:(_, ...parts)=>parts.join('/'),onSnapshot(){},
    async runTransaction(_,fn){await fn({get:async key=>({exists:()=>docs.has(key),data:()=>structuredClone(docs.get(key))}),set:(key,value)=>docs.set(key,structuredClone(value))});}
  };
  vm.createContext(context);vm.runInContext(source,context);
  return {write:context.window._fbWriteReview,docs,auth};
}
test('transaction saves preserve spouse comments, reject stale config and changed ledger',async()=>{
  const a=adapter(),key='advice/monthly-review-2026-08';
  await a.write('2026-08',{kind:'config',revision:0,config:config()});
  const change={kind:'comment',revision:1,text:'한 줄 회고',fingerprint:C.fingerprint(tx,'2026-08')};
  await a.write('2026-08',change);a.auth.currentUser.uid='b';await a.write('2026-08',change);
  assert.deepEqual(Object.keys(a.docs.get(key).comments),['a','b']);
  await assert.rejects(a.write('2026-08',{kind:'config',revision:0,config:config()}),/다른 기기/);
  a.docs.set('gaegebu/main',{transactions:JSON.stringify([...tx,{date:'2026-08-03',amount:1}])});
  await assert.rejects(a.write('2026-08',change),/거래가 변경/);
});
