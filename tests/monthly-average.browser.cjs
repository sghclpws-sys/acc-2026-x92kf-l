const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.abort());
  await page.setContent('<div id="monthlyReview"></div>');
  await page.addScriptTag({path:path.join(__dirname,'../monthly-review-core.js')});
  await page.evaluate(()=>{
   window.transactions=[{id:1,date:'2026-06-01',category:'생활비',amount:100000},{id:2,date:'2026-07-01',category:'생활비',amount:300000},{id:3,date:'2026-08-01',category:'생활비',amount:150000}];
   const baseline=MonthlyReviewCore.baseline(transactions,'2026-08');
   window.saved={revision:1,config:{baseline,budget:baseline.budget,reasons:{},goals:[{category:'생활비',type:'amount',limit:100000,store:''}]},comments:{}};
   window.initialSaved=JSON.stringify(saved);window._reviewMembers=['a','b'];
   window._fbAllowed=()=>true;window._fbUser=()=>({uid:'a'});
   window._fbWatchReview=(month,cb)=>{queueMicrotask(()=>cb(month==='2026-08'?structuredClone(saved):null));return()=>{};};
  });
  await page.addScriptTag({path:path.join(__dirname,'../monthly-review.js')});
  await page.evaluate(()=>MonthlyReview.refresh('2026-08'));
  const average=()=>page.locator('.review-compare-table tbody tr').filter({has:page.locator('th',{hasText:'생활비'})}).locator('td').first().locator('.review-wide').textContent();
  assert.equal(await average(),'200,000');
  const budget=await page.locator('[data-budget="생활비"]').inputValue();
  await page.evaluate(()=>{transactions[0].amount=500000;MonthlyReview.dataChanged();});
  assert.equal(await average(),'400,000');
  assert.equal(await page.locator('[data-budget="생활비"]').inputValue(),budget);
  assert.equal(await page.locator('[data-budget="생활비"]').locator('..').locator('small').textContent(),'최대 200,000원');
  await page.locator('[data-field="comment"]').fill('작성 중인 회고');
  await page.evaluate(()=>{transactions[0].settlement=200000;MonthlyReview.dataChanged();});
  assert.equal(await average(),'300,000');
  assert.equal(await page.locator('[data-field="comment"]').inputValue(),'작성 중인 회고');
  await page.evaluate(()=>{transactions[0].category='쇼핑';MonthlyReview.dataChanged();});
  assert.equal(await average(),'150,000');
  await page.evaluate(()=>{transactions=transactions.filter(t=>t.id!==1);MonthlyReview.dataChanged();});
  assert.equal(await average(),'300,000');
  await page.evaluate(()=>{transactions.push({id:4,date:'2026-05-01',category:'생활비',amount:100000});MonthlyReview.dataChanged();});
  assert.equal(await average(),'200,000');
  assert.match(await page.locator('.review-comparison').textContent(),/2026-05 ~ 2026-07/);
  assert.equal(await page.locator('[data-field="comment"]').inputValue(),'작성 중인 회고');
  assert.equal(await page.evaluate(()=>JSON.stringify(saved)===initialSaved),true);
  assert.equal(await page.locator('[data-field="goal-limit-0"]').inputValue(),'100000');
  assert.deepEqual(errors,[]);
  console.log('PASS: live averages after amount, settlement, category, deletion and month changes; saved budget, limits, goals and draft preserved');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
