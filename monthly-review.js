/* Monthly review UI. All personal content is loaded after authentication. */
(function() {
  'use strict';
  const C = window.MonthlyReviewCore;
  let month = '', current = null, previous = null, ready = false, priorReady = false;
  let unsubscribe = [], dirty = false, busy = false, token = 0, revision = 0;
  const drafts = new Map();
  const root = () => document.getElementById('monthlyReview');
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const won = v => Math.round(v).toLocaleString('ko-KR') + '원';
  const data = () => transactions;
  const user = () => window._fbUser?.()?.uid;
  const localMonth = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); };
  function message(text, error=false) {
    const el=root()?.querySelector('[data-message]');
    if (el) { el.textContent=text; el.className=error?'review-error':'review-note'; }
  }
  function capture() {
    if (!dirty || !root()?.querySelector('[data-budget]')) return;
    drafts.set(month,{revision,values:[...root().querySelectorAll('input,select')].filter(e=>e.dataset.field).map(e=>[e.dataset.field,e.type==='checkbox'?e.checked:e.value])});
  }
  function refresh(selected) {
    if (!root() || !window._fbAllowed?.()) return;
    if (!C.validMonth(selected)) return;
    if (selected===month && ready) {
      if (!dirty && !busy) render();
      else {
        const badge=root().querySelector('.review-badge');
        if(badge && !C.completion(current,C.fingerprint(data(),month),window._reviewMembers || [])) {
          badge.textContent='두 분의 확인 필요';badge.classList.remove('is-done');
        }
        message('입력 중인 내용은 유지됩니다. 거래 변경이 있다면 저장 후 최신 실적을 다시 확인해주세요.');
      }
      return;
    }
    if (selected===month && unsubscribe.length) return;
    capture(); unsubscribe.forEach(fn=>fn()); unsubscribe=[];
    month=selected; current=null; previous=null; ready=false; priorReady=false; dirty=false;
    const id=++token;
    root().innerHTML='<div class="card review-note">월말 결산을 불러오는 중…</div>';
    const fail = () => {
      if(id!==token) return;
      ready=false;
      if(root().querySelector('[data-budget]')) {
        message('결산 연결이 끊겼습니다. 입력은 유지됩니다. 최신 내용 불러오기로 다시 연결해주세요.',true);
        return;
      }
      root().innerHTML='<div class="card review-error">결산을 불러오지 못했습니다. 연결을 확인해주세요. <button type="button" class="btn btn-ghost" data-action="retry">다시 시도</button></div>';
    };
    unsubscribe.push(window._fbWatchReview(month, doc=>{
      if(id!==token || !window._fbAllowed?.()) return;
      current=doc; ready=true;
      if (dirty || busy) { message('저장 내용이 갱신되었습니다. 입력 중인 내용은 유지됩니다.'); return; }
      render();
    },fail));
    unsubscribe.push(window._fbWatchReview(C.shift(month,-1),doc=>{
      if(id!==token || !window._fbAllowed?.()) return;
      previous=doc; priorReady=true;
      if(!dirty && !busy && ready) render();
    },()=>{ if(id===token) { priorReady=false; message('지난달 목표를 불러오지 못했습니다. 다시 불러와주세요.',true); } }));
  }
  function defaultConfig() { const b=C.baseline(data(),month); return {baseline:b,budget:b.budget,reasons:{},goals:[]}; }
  function tableMoney(value, signed=false) {
    const sign=signed && value>0?'+':'';
    const compact=Math.abs(value)<0.0001?'0':(Math.abs(value)/10000).toFixed(1);
    const short=(value<0?'−':sign)+compact;
    return `<span title="${esc(sign+won(value))}" aria-label="${esc(sign+won(value))}"><span class="review-wide">${sign+Math.round(value).toLocaleString('ko-KR')}</span><span class="review-narrow">${short}</span></span>`;
  }
  function goalForm(g={}, i) {
    return `<div class="review-goal" data-goal="${i}">
      <label>항목<select data-field="goal-cat-${i}"><option value="">목표 없음</option>${C.CATS.map(c=>`<option ${c===g.category?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
      <label>기준<select data-field="goal-type-${i}">${[['amount','지출 금액 (원)'],['count','결제 횟수 (회)'],['stop','구독 해지 (0회)']].map(([v,t])=>`<option value="${v}" ${g.type===v?'selected':''}>${t}</option>`).join('')}</select></label>
      <label>가맹점 키워드<input data-field="goal-store-${i}" maxlength="80" value="${esc(g.store)}" placeholder="전체 가맹점이면 비워두기"></label>
      <label>목표 상한<input type="number" min="0" step="1" inputmode="numeric" data-field="goal-limit-${i}" value="${g.limit ?? ''}" placeholder="금액 또는 횟수"></label>
      <p class="review-note" data-hint="${i}"></p>
    </div>`;
  }
  function render() {
    if(!ready || !root()) return;
    const tx=data(), config=current?.config || defaultConfig(), b=config.baseline, actual=C.totals(tx,month);
    revision=current?.revision || 0;
    const total=C.CATS.filter(c=>c!=='여행').reduce((s,c)=>s+actual[c],0);
    const sum=Object.values(config.budget).reduce((s,v)=>s+v,0);
    const fp=C.fingerprint(tx,month), complete=C.completion(current,fp,window._reviewMembers || []);
    const hasData=C.rows(tx,month).length>0, closedMonth=month<localMonth();
    const status=!hasData?'예산 계획 중':complete?'결산 완료':current?.comments && Object.keys(current.comments).length?'두 분의 확인 필요':'결산 대기';
    const avgTotal=C.CATS.filter(c=>c!=='여행').reduce((s,c)=>s+(b.average[c]||0),0);
    const comparison = !hasData ? '업로드 전 · 판정 대기' : !current?.config ? '예산 저장 후 비교' : total>sum ? won(total-sum)+' 초과' : won(sum-total)+' 여유';
    root().innerHTML=`<section class="card review-card" aria-label="소비 관리 인사이트와 월말 결산">
      <div class="review-heading"><div><div class="review-eyebrow">MONTHLY REVIEW</div><h3>우리의 월말 결산</h3></div><span class="review-badge ${complete?'is-done':''}">${status}</span></div>
      <div class="review-toolbar"><label>결산·예산 월<input type="month" data-action="month" value="${month}" aria-label="결산·예산 월"></label><button type="button" class="btn btn-ghost" data-action="next">다음 달 예산 →</button></div>
      <p class="review-note">카드 결제액에서 정산금을 뺀 실지출 기준입니다. 여행은 별도 표시하며, 이자는 이 예산에 포함하지 않습니다.</p>
      <div class="review-stats"><div><span>여행 제외 실적</span><strong>${hasData?won(total):'업로드 전'}</strong><small>${hasData?'기준 월평균 대비 '+(total>=avgTotal?'+':'')+won(total-avgTotal):'거래가 없으면 달성으로 판정하지 않아요'}</small></div><div><span>${current?.config?'저장한 월 예산':'월 예산 초안'}</span><strong>${won(sum)}</strong><small class="${hasData&&current?.config&&total>sum?'review-error':''}">${comparison}</small></div></div>
      <p class="review-note">여행 ${hasData?won(actual['여행']):'업로드 전'} · 여행 포함 카드 실적 ${hasData?won(total+actual['여행']):'업로드 전'}</p>
      <section class="review-comparison" aria-label="카테고리별 월평균 비교">
        <div class="review-table-heading"><h4>월평균과 이번 달 비교</h4><span class="review-note"><span class="review-wide">단위: 원</span><span class="review-narrow">단위: 만원 · 소수 첫째 자리 반올림</span></span></div>
        <p class="review-note">${b.initial?'이전 달 데이터가 없어 첫 등록 월을 초기 기준으로 사용합니다.':'선택 월 이전 등록 '+b.months.length+'개월 기준입니다. 미등록 월은 제외합니다.'} ${b.months.length?esc(b.months[0])+' ~ '+esc(b.months[b.months.length-1]):'기준 데이터 없음'}</p>
        <table class="review-compare-table"><thead><tr><th scope="col">항목</th><th scope="col">월평균</th><th scope="col">이번 달</th><th scope="col">평균 대비</th></tr></thead><tbody>
        ${C.CATS.map(c=>{const avg=b.average[c]||0, diff=actual[c]-avg;return `<tr><th scope="row">${esc(c)}${c==='여행'?'<sup class="review-excluded">예산 제외</sup>':''}</th><td>${tableMoney(avg)}</td><td>${hasData?tableMoney(actual[c]):'—'}</td><td class="${!hasData||diff===0?'':diff>0?'review-increase':'review-decrease'}">${hasData?tableMoney(diff,true):'—'}</td></tr>`;}).join('')}
        </tbody><tfoot><tr><th scope="row">여행 제외</th><td>${tableMoney(avgTotal)}</td><td>${hasData?tableMoney(total):'—'}</td><td class="${!hasData||total===avgTotal?'':total>avgTotal?'review-increase':'review-decrease'}">${hasData?tableMoney(total-avgTotal,true):'—'}</td></tr></tfoot></table>
        <p class="review-note">+는 평균보다 더 사용, −는 덜 사용한 금액입니다.${hasData?'':' 아직 거래가 없어 비교를 표시하지 않습니다.'}</p>
      </section>
      <details class="review-details" data-budget-editor><summary>월 예산 조정 <span>${current?.config?'저장한 예산 수정':'자동 배정한 초안 확인·수정'}</span></summary>
        <p class="review-note">각 항목은 위 월평균 이하, 여행 제외 총합은 200만 원 이하로 설정합니다. 만원 미만은 버립니다 (392,091 → 390,000원). 저장한 평균 기준은 고정됩니다.</p>
        <div class="review-budget-grid">${C.CATS.map((c,i)=>c==='여행'?'':`<label>${esc(c)}<input type="text" inputmode="numeric" data-field="budget-${i}" data-budget="${esc(c)}" value="${C.roundBudget(config.budget[c]).toLocaleString('ko-KR')}" aria-label="${esc(c)} 월 예산"><small>최대 ${won(C.roundBudget(b.max[c]))}</small></label>`).join('')}</div>
        <div class="review-total" data-total></div>
      </details>
      <details class="review-details" open><summary>지난 계획의 결과 <span>${month} 실적</span></summary>
        ${!priorReady?'<p class="review-note">지난달 목표를 확인하는 중…</p>':!previous?.config?.goals?.length?'<p class="review-note">전월에 저장한 목표가 없습니다. 아래에서 다음 달 목표를 정해보세요.</p>':previous.config.goals.map(g=>{const value=C.measure(tx,month,g),limit=g.type==='stop'?0:g.limit;const unit=g.type==='amount'?'원':'회';return `<div class="review-result"><strong>${esc(g.category)}${g.store?' · '+esc(g.store):''}</strong><span>목표 ${limit.toLocaleString()}${unit} / 실제 ${hasData?value.toLocaleString()+unit:'업로드 전'}</span><b>${!hasData?'판정 대기':value<=limit?'목표 이내 · '+(limit-value).toLocaleString()+unit+' 여유':'목표 초과 · '+(value-limit).toLocaleString()+unit+' 초과'}</b></div>`;}).join('')}
      </details>
      <details class="review-details"><summary>다음 달 목표 <span>${C.shift(month,1)} · 최대 3개</span></summary><p class="review-note">1~3개의 작은 목표를 정해보세요. 목표 없이도 결산할 수 있습니다. 해지는 가맹점 키워드가 필요하며, 다음 달 해당 결제 0건을 확인합니다.</p>${[0,1,2].map(i=>goalForm(config.goals[i],i)).join('')}</details>
      <div class="review-actions"><button type="button" class="btn btn-action" data-action="save-config">예산·목표 저장</button><button type="button" class="btn btn-ghost" data-action="reload">최신 내용 불러오기</button></div>
      <p class="review-note">예산·목표를 수정하면 두 분의 코멘트 확인이 다시 필요합니다. 저장 전 입력은 이 화면을 이동해도 유지되지만 새로고침하면 사라집니다.</p>
      <div class="review-comments"><h4>한 달 전체에 대한 두 사람의 회고</h4><p class="review-note">이번 달 전체 소비를 함께 돌아보고, 각자 계정으로 한 줄씩만 저장하면 결산이 완료됩니다. 항목별 피드백은 작성하지 않습니다. 거래 수정 후에는 다시 확인해주세요.</p>
      ${(window._reviewMembers || []).map(uid=>{const mine=uid===user(), c=current?.comments?.[uid], valid=c?.revision===revision&&c?.fingerprint===fp; return `<div class="review-comment"><strong>${mine?'나의 코멘트':'배우자의 코멘트'}</strong><span class="review-note">${c?(valid?'확인 완료':'변경 후 재확인 필요'):'작성 대기'}</span>${mine?`<input data-field="comment" maxlength="200" value="${esc(c?.text)}" placeholder="이번 달 느낀 점과 다음 달 바꿀 점" aria-label="나의 한 줄 회고"><label class="review-check"><input type="checkbox" data-field="confirmed"> 이 달의 업로드가 끝났고 예산·실적을 확인했어요</label><button type="button" class="btn btn-action" data-action="comment" ${!current?.config||!hasData||!closedMonth?'disabled':''}>내 코멘트 저장·결산 확인</button>`:`<p>${esc(c?.text || '배우자가 본인 계정으로 작성하면 여기에 표시됩니다.')}</p>`}</div>`;}).join('')}
      ${!closedMonth?'<p class="review-note">진행 중인 달은 계획을 저장할 수 있고, 결산은 월이 끝난 뒤 가능합니다.</p>':''}</div>
      <p data-message role="status" aria-live="polite"></p>
    </section>`;
    dirty=false;
    const draft=drafts.get(month);
    if(draft){ for(const [key,value] of draft.values){const el=[...root().querySelectorAll('[data-field]')].find(e=>e.dataset.field===key);if(el){if(el.type==='checkbox')el.checked=value;else el.value=value;}} revision=draft.revision;dirty=true;message('저장하지 않은 입력을 복원했습니다.'); }
    updateTotals(); updateHints();
  }
  function field(key) { return [...root().querySelectorAll('[data-field]')].find(e=>e.dataset.field===key); }
  function number(el) { if (!el || el.value.trim()==='') throw new Error('예산과 목표 상한을 입력해주세요.'); return Number(el.value); }
  function budgetNumber(el) {
    if(!el || !/^\d[\d,]*$/.test(el.value.trim())) throw new Error('월 예산은 0 이상의 숫자로 입력해주세요.');
    const value=Number(el.value.replace(/,/g,''));
    if(!Number.isSafeInteger(value)) throw new Error('월 예산 금액을 확인해주세요.');
    return C.roundBudget(value);
  }
  function readConfig() {
    const config=JSON.parse(JSON.stringify(current?.config || defaultConfig()));
    config.budget={}; config.goals=[];
    C.CATS.forEach((c,i)=>{
      if(c!=='여행') config.budget[c]=budgetNumber(field('budget-'+i));
    });
    for(let i=0;i<3;i++){
      const category=field('goal-cat-'+i).value;if(!category)continue;
      const type=field('goal-type-'+i).value;
      config.goals.push({category,type,store:field('goal-store-'+i).value.trim(),limit:type==='stop'?0:number(field('goal-limit-'+i))});
    }
    C.validateConfig(config); return config;
  }
  function updateTotals() {
    const el=root()?.querySelector('[data-total]');if(!el)return;
    const sum=[...root().querySelectorAll('[data-budget]')].reduce((s,e)=>s+C.roundBudget(Number(e.value.replace(/,/g,'')||0)),0);
    el.textContent='배정 합계 '+won(sum)+' / 최대 2,000,000원';
    el.classList.toggle('review-error',sum>C.CAP);
  }
  function updateHints() {
    for(let i=0;i<3;i++){
      const hint=root()?.querySelector(`[data-hint="${i}"]`);if(!hint)continue;
      const category=field('goal-cat-'+i).value,type=field('goal-type-'+i).value,store=field('goal-store-'+i).value.trim();
      const median=category?C.median(data(),month,{category,type,store}):null;
      hint.textContent=median?`최근 등록 ${median.count}개월 중앙값 ${median.value.toLocaleString()}${type==='amount'?'원':'회'} · 목표 설정 참고값`:'';
      field('goal-limit-'+i).disabled=type==='stop';
    }
  }
  async function save(kind) {
    if(busy || !ready)return;
    const selected=month,id=token;
    try {
      const change={kind,revision};
      if(kind==='config') change.config=readConfig();
      else {
        if(!field('confirmed').checked) throw new Error('업로드 완료와 예산·실적 확인에 체크해주세요.');
        // Do not close against form edits that have not reached the server.
        if(C.stable(readConfig())!==C.stable(current?.config)) throw new Error('변경한 예산·목표를 먼저 저장해주세요.');
        change.text=field('comment').value;change.fingerprint=C.fingerprint(data(),month);
      }
      const pendingComment=kind==='config'?field('comment')?.value:'';
      busy=true; message('클라우드에 저장 중…');
      root().querySelectorAll('button,input,select').forEach(e=>e.disabled=true);
      await window._fbWriteReview(selected,change);
      drafts.delete(selected);
      if(pendingComment) drafts.set(selected,{revision:change.revision+1,values:[['comment',pendingComment],['confirmed',false]]});
      if(id!==token)return;
      dirty=false; busy=false;
      // Restart listeners to confirm the committed server state before displaying completion.
      unsubscribe.forEach(fn=>fn());unsubscribe=[];month='';refresh(selected);
    } catch(e) {
      if(id===token){message(e.message || '저장 실패 · 입력은 유지됩니다. 다시 시도해주세요.',true);root().querySelectorAll('button,input,select').forEach(e=>e.disabled=false);updateHints();}
    } finally {
      busy=false;
      if(id!==token && ready && root() && !dirty) render();
    }
  }
  function reset() { ++token;unsubscribe.forEach(fn=>fn());unsubscribe=[];drafts.clear();month='';current=null;previous=null;ready=false;dirty=false;busy=false;if(root())root().innerHTML=''; }
  document.addEventListener('input',e=>{
    if(!e.target.closest('#monthlyReview') || !e.target.dataset.field)return;
    if(e.target.hasAttribute('data-budget') && /^\d[\d,]*$/.test(e.target.value)) {
      const el=e.target, count=el.value.slice(0,el.selectionStart).replace(/,/g,'').length;
      const raw=el.value.replace(/,/g,'');
      if(Number.isSafeInteger(Number(raw))) {
        el.value=Number(raw).toLocaleString('ko-KR');
        let cursor=0,digits=0;while(cursor<el.value.length && digits<count){if(el.value[cursor]!==',')digits++;cursor++;}
        el.setSelectionRange(cursor,cursor);
      }
    }
    dirty=true;updateTotals();updateHints();message('저장하지 않은 변경사항이 있습니다.');
  });
  document.addEventListener('focusout',e=>{
    if(!e.target.closest('#monthlyReview') || !e.target.hasAttribute('data-budget'))return;
    try{e.target.value=budgetNumber(e.target).toLocaleString('ko-KR');updateTotals();}catch(error){message(error.message,true);}
  });
  document.addEventListener('change',e=>{
    if(e.target.closest('#monthlyReview') && e.target.dataset.action==='month')refresh(e.target.value);
  });
  document.addEventListener('click',e=>{
    const button=e.target.closest('#monthlyReview [data-action]');if(!button || busy)return;
    const action=button.dataset.action;
    if(action==='save-config')save('config');
    if(action==='comment')save('comment');
    if(action==='next')refresh(C.shift(month,1));
    if(action==='reload'||action==='retry'){
      if(dirty && !window.confirm('저장하지 않은 입력을 버리고 최신 내용을 불러올까요?'))return;
      const selected=month;drafts.delete(month);dirty=false;unsubscribe.forEach(fn=>fn());unsubscribe=[];month='';refresh(selected);
    }

  });
  window.addEventListener('beforeunload',e=>{if(dirty || drafts.size){e.preventDefault();e.returnValue='';}});
  window.MonthlyReview={refresh,reset};
})();
