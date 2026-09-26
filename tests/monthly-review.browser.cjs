// Run manually with Playwright on NODE_PATH; uses synthetic data and no network.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.abort());
  let html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
  await page.setContent(html);
  await page.addStyleTag({path:path.join(__dirname,'../household-modern.css')});
  await page.addScriptTag({path:path.join(__dirname,'../monthly-review-core.js')});
  await page.evaluate(()=>{
   document.getElementById('authGate').remove();
   document.querySelectorAll('.page').forEach(e=>e.classList.toggle('active',e.id==='page-summary'));
   document.body.classList.add('mobile-app');
   window.transactions=[];
   for(const month of ['06','07','08']) for(const category of MonthlyReviewCore.CATS) transactions.push({date:`2026-${month}-02`,category,store:category+' 가맹점',amount:category==='여행'?700000:240000});
   window._reviewMembers=['a','b'];window.testUid='a';window._fbUser=()=>({uid:testUid});window._fbAllowed=()=>true;
   window.testDocs={};window.testWatchers=[];window.failSave=false;
   window._fbWatchReview=(month,callback)=>{
    const entry={month,callback,active:true};testWatchers.push(entry);queueMicrotask(()=>entry.active&&callback(testDocs[month]||null));return()=>entry.active=false;
   };
   window._fbWriteReview=async(month,change)=>{
    if(failSave)throw Error('테스트 저장 실패');
    const c=testDocs[month]||{revision:0,comments:{}};
    if(c.revision!==change.revision)throw Error('다른 기기에서 수정했습니다.');
    if(change.kind==='config'){MonthlyReviewCore.validateConfig(change.config);c.config=change.config;c.revision++;}
    else {if(!change.text.trim())throw Error('코멘트를 입력해주세요.');c.comments[testUid]={text:change.text,revision:c.revision,fingerprint:change.fingerprint};}
    testDocs[month]=c;testWatchers.filter(w=>w.active&&w.month===month).forEach(w=>w.callback(structuredClone(c)));
   };
  });
  await page.addScriptTag({path:path.join(__dirname,'../monthly-review.js')});
  await page.evaluate(()=>MonthlyReview.refresh('2026-08'));
  await page.locator('[data-budget]').first().waitFor({state:'attached'});
  assert.equal(await page.locator('[data-field^="reason-"]').count(),0);
  assert.equal(await page.locator('[data-budget-editor]').getAttribute('open'),null);
  assert.equal(await page.locator('.review-compare-table tbody tr').count(),12);
  assert.equal(await page.locator('[data-field^="note-"]').count(),0);
  assert.equal(await page.locator('[data-field="comment"]').count(),1);
  for(const width of [320,390,768,1440,1920]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(w=>document.body.classList.toggle('mobile-app',w<=768),width);
   const sizes=await page.locator('#monthlyReview').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));
   assert(sizes.scroll<=sizes.width+1,`review overflow at ${width}: ${JSON.stringify(sizes)}`);
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.body.classList.add('mobile-app'));
  await page.locator('[data-field="goal-cat-0"]').evaluate(e=>e.closest('details').open=true);
  await page.locator('[data-field="goal-cat-0"]').selectOption('외식');
  await page.locator('[data-field="goal-limit-0"]').fill('200000');
  assert.equal(await page.locator('[data-field="goal-cat-0"]').inputValue(),'외식');
  await page.locator('[data-action="save-config"]').click();
  await page.waitForFunction(()=>!!testDocs['2026-08']?.config);
  await page.locator('[data-field="comment"]').fill('이번 달 외식은 다음 달에 조금 줄여보자.');
  await page.locator('[data-field="confirmed"]').check();
  await page.evaluate(()=>failSave=true);
  await page.locator('[data-action="comment"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-message]').textContent.includes('실패'));
  assert.equal(await page.locator('[data-field="comment"]').inputValue(),'이번 달 외식은 다음 달에 조금 줄여보자.');
  await page.evaluate(()=>failSave=false);
  await page.locator('[data-action="comment"]').click();
  await page.waitForFunction(()=>!!testDocs['2026-08']?.comments.a);
  assert(!(await page.locator('.review-badge').textContent()).includes('결산 완료'));
  await page.evaluate(()=>{MonthlyReview.reset();testUid='b';MonthlyReview.refresh('2026-08');});
  await page.locator('[data-field="comment"]').fill('주말 소비를 계획해보자.');
  await page.locator('[data-field="confirmed"]').check();
  await page.locator('[data-action="comment"]').click();
  await page.waitForFunction(()=>document.querySelector('.review-badge').textContent==='결산 완료');
  const output=process.env.REVIEW_SCREENSHOT;
  if(output)await page.locator('#monthlyReview').screenshot({path:output});
  await page.evaluate(()=>{transactions.push({date:'2026-08-20',category:'쇼핑',amount:1000});MonthlyReview.refresh('2026-08');});
  assert(!(await page.locator('.review-badge').textContent()).includes('결산 완료'));
  await page.locator('[data-action="next"]').click();
  await page.locator('[data-budget]').first().waitFor({state:'attached'});
  assert((await page.locator('.review-result').textContent()).includes('판정 대기'));
  await page.locator('[data-budget-editor] summary').click();
  await page.locator('[data-field="budget-0"]').fill('392091');
  assert.equal(await page.locator('[data-field="budget-0"]').inputValue(),'392,091');
  await page.locator('[data-field="budget-0"]').blur();
  assert.equal(await page.locator('[data-field="budget-0"]').inputValue(),'390,000');
  await page.locator('[data-field="budget-0"]').fill('123456');
  await page.locator('[data-action="next"]').click();
  await page.locator('[data-action="month"]').fill('2026-09');
  await page.locator('[data-action="month"]').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('[data-field="budget-0"]')?.value==='120,000');
  await page.evaluate(()=>MonthlyReview.reset());assert.equal(await page.locator('#monthlyReview').textContent(),'');
  assert.deepEqual(errors,[]);
  console.log('PASS: responsive widths, goals, save failure/retry, separate comments, close/reopen, missing month, draft restore, logout cleanup');
  const app=await browser.newPage({viewport:{width:390,height:844}}), appErrors=[];
  app.on('pageerror',e=>appErrors.push(e.message));
  await app.addInitScript(()=>{
   const cats=['외식','생활비','여행','쇼핑','관리비','주유'];
   const tx=[];for(const m of ['06','07','08'])for(const c of cats)tx.push({id:m+c,date:`2026-${m}-02`,category:c,store:'테스트 '+c,amount:(cats.indexOf(c)+1)*100000,settlement:0,card:'테스트'});
   window._fbReady=true;window._fbAllowed=()=>true;window._fbUser=()=>({uid:'a',email:'test@example.invalid'});
   window._fbOnAuth=cb=>queueMicrotask(()=>cb(_fbUser()));window._reviewMembers=['a','b'];
   window._fbLoadData=async()=>({transactions:tx,rules:[],cashData:{},incomeData:{}});
   window._fbSaveData=async()=>{};
   window._fbListen=()=>()=>{};window._fbLoadHouseholdSummary=async()=>null;window._fbLoadAdvice=async()=>null;
   window._fbWatchReview=(month,cb)=>{queueMicrotask(()=>cb(null));return()=>{};};
  });
  await app.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='household.test')return route.abort();
   const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
   if(!['index.html','household-modern.css','household-summary.js','monthly-review-core.js','monthly-review.js'].includes(file))return route.abort();
   let body=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
   if(file==='index.html')body=body.replace(/<script type="module">[\s\S]*?<\/script>/g,'').replace(/<script[^>]+src="https:[^>]*><\/script>/g,'');
   return route.fulfill({body,contentType:file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'text/html'});
  });
  await app.goto('http://household.test/');
  await app.waitForFunction(()=>document.getElementById('authGate').style.display==='none',null,{timeout:5000}).catch(async e=>{
   console.error({appErrors,state:await app.evaluate(()=>({ready:window._fbReady,error:document.getElementById('authError')?.textContent,review:document.getElementById('monthlyReview')?.textContent}))});throw e;
  });
  await app.evaluate(()=>{
   _adviceLoaded=true;
   _paintAdvice([
    {title:'반복되는 지출부터 확인해보세요',body:'매달 반복되는 결제를 살펴보고 사용 빈도가 낮은 항목부터 정리해보세요. 다음 달 실적과 비교하면 변화가 보입니다.',impact:'월 약 3만 원 · 월 구독료 기준',level:'warn'},
    {title:'계획한 소비는 잘 유지하고 있어요',body:'지난달과 비슷한 수준을 유지했습니다. 계속 유지할 습관을 한 가지 정해보세요.',impact:null,level:'good'},
    {title:'다음 달에는 한 가지 목표에 집중하세요',body:'여러 항목을 동시에 줄이기보다 실천할 목표를 하나 정해보세요.',impact:'월 약 5만 원 · 외식 1회 기준',level:'info'}
   ],'2026-09-26',false);
  });
  for(const width of [320,390,768,1440,1920]){
   await app.setViewportSize({width,height:900});
   for(const name of ['summary','trends','settings']){
    await app.evaluate(name=>showPage(name),name);
    const sizes=await app.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert(sizes.scroll<=sizes.width+1,`app ${name} overflow at ${width}: ${JSON.stringify(sizes)}`);
    if(name==='summary'){
     const aligned=await app.evaluate(()=>{
      const a=document.querySelector('.review-card').getBoundingClientRect(),b=document.getElementById('summaryStats').getBoundingClientRect();
      return Math.abs(a.left-b.left)<1 && Math.abs(a.right-b.right)<1;
     });assert(aligned,`review card alignment at ${width}`);
     assert.equal(await app.locator('#page-summary #householdSummaryCard').count(),0);
     assert.equal(await app.locator('#insightCards').count(),0);
     assert(await app.evaluate(()=>document.getElementById('monthlyReview').previousElementSibling.id==='smartInsightCard'));
     assert.equal(await app.locator('#smartInsightCard').count(),1);
     const heights=await app.locator('.review-compare-table tbody tr').evaluateAll(rows=>rows.slice(0,4).map(e=>e.getBoundingClientRect().height));
     assert(Math.max(...heights)-Math.min(...heights)<1,`superscript changed row height at ${width}: ${heights}`);
    }
    if(name==='trends'){
     await app.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
     const fonts=await app.evaluate(()=>{
      const a=document.querySelector('#trendSvg text'),b=document.querySelector('#heatmapChart text');
      return [a,b].map(e=>parseFloat(getComputedStyle(e).fontSize)*e.getScreenCTM().a);
     });
     assert(fonts.every(s=>Math.abs(s-12)<0.1),`chart effective font sizes at ${width}: ${fonts}`);
     assert.equal(await app.locator('#topCatAnalysis').count(),0);
     assert.equal(await app.locator('[data-heatmap-top]').count(),5);
     assert.equal(await app.locator('[data-heatmap-top="외식"]').count(),0);
     assert.equal(await app.locator('[data-heatmap-average="600000"]').count(),1);
     assert.equal(await app.locator('.advice-item').count(),3);
    }
   }
  }
  assert.equal(await app.locator('.rules-disclosure').getAttribute('open'),null);
  assert.equal(await app.locator('#page-settings #householdSummaryCard').count(),1);
  await app.locator('#householdSummarySelect').fill('2026-07');
  await app.locator('#householdSummarySelect').dispatchEvent('change');
  assert((await app.locator('#householdSummaryTitle').textContent()).includes('2026-07'));
  await app.locator('.rules-disclosure summary').click();assert.notEqual(await app.locator('.rules-disclosure').getAttribute('open'),null);
  assert.deepEqual(appErrors,[]);
  if(output){
   await app.setViewportSize({width:1920,height:1080});
   await app.evaluate(()=>{showPage('summary');window.scrollTo(0,0);});
   await app.screenshot({path:output.replace('.png','-desktop.png')});
   await app.evaluate(()=>showPage('trends'));
   await app.locator('#trendChips').scrollIntoViewIfNeeded();
   await app.screenshot({path:output.replace('.png','-charts.png')});
  }
  console.log('PASS: full application boot, aligned cards and 12px chart fonts at five widths; settings summary selector and rule disclosure');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
