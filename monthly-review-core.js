(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MonthlyReviewCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const CAP = 2000000;
  function roundBudget(value) { return Math.floor(value / 10000) * 10000; }
  const CATS = ['외식','생활비','여행','쇼핑','관계비용','교육/놀이','관리비','통신/렌탈','주유','세금','기타','미분류'];
  const REASONS = ['', '일회성', '계절성', '반복 지출', '줄일 소비'];
  function validMonth(month) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(month); }
  function shift(month, offset) {
    if (!validMonth(month)) throw new Error('월을 확인해주세요.');
    const [y,m] = month.split('-').map(Number), d = new Date(Date.UTC(y,m-1+offset,1));
    return d.toISOString().slice(0,7);
  }
  function rows(tx, month) { return tx.filter(t => typeof t.date === 'string' && t.date.slice(0,7) === month); }
  function net(t) {
    const amount = Number(t.amount), settlement = Number(t.settlement || 0);
    if (!Number.isFinite(amount) || !Number.isFinite(settlement)) throw new Error('거래 금액을 확인해주세요.');
    return amount - settlement;
  }
  function category(t) { return CATS.includes(t.category) ? t.category : '미분류'; }
  function totals(tx, month) {
    const result = Object.fromEntries(CATS.map(c => [c,0]));
    rows(tx,month).forEach(t => { result[category(t)] += net(t); });
    return result;
  }
  function baseline(tx, month) {
    const months = [...new Set(tx.map(t => String(t.date || '').slice(0,7)).filter(m => validMonth(m) && m < month))].sort();
    // First imported month provides an explicitly labelled initial reference.
    const initial = !months.length;
    if (initial && rows(tx,month).length) months.push(month);
    const sums = months.map(m => totals(tx,m));
    const average = Object.fromEntries(CATS.map(c => [c, sums.length ? Math.floor(sums.reduce((s,r)=>s+r[c],0)/sums.length) : 0]));
    const max = Object.fromEntries(CATS.filter(c=>c!=='여행').map(c=>[c,Math.max(0,average[c])]));
    const sum = Object.values(max).reduce((a,b)=>a+b,0), ratio = sum > CAP ? CAP / sum : 1;
    const budget = Object.fromEntries(Object.entries(max).map(([c,v])=>[c,Math.floor(v*ratio)]));
    if (sum > CAP) {
      let remainder = CAP - Object.values(budget).reduce((a,b)=>a+b,0);
      const order = Object.keys(max).sort((a,b)=>(max[b]*ratio-budget[b])-(max[a]*ratio-budget[a]));
      for (const c of order) if (remainder>0 && budget[c]<max[c]) { budget[c]++;remainder--; }
    }
    for (const c of Object.keys(budget)) budget[c] = roundBudget(budget[c]);
    return { months, initial, average, max, budget };
  }
  function stable(value) {
    if (Array.isArray(value)) return '['+value.map(stable).join(',')+']';
    if (value && typeof value === 'object') return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
    return JSON.stringify(value);
  }
  function fingerprint(tx, month) { return rows(tx,month).map(stable).sort().join('\n'); }
  function validateConfig(config) {
    if (!config || !config.baseline || !config.budget) throw new Error('예산 기준을 확인해주세요.');
    let sum = 0;
    for (const c of CATS.filter(c=>c!=='여행')) {
      const v = config.budget[c], max = config.baseline.max[c];
      if (!Number.isSafeInteger(v) || v < 0 || v % 10000 !== 0 || !Number.isSafeInteger(max) || max < 0 || v > max) throw new Error(c+' 예산은 0원 이상 월평균 이하의 만원 단위로 입력해주세요.');
      sum += v;
    }
    if (sum > CAP) throw new Error('여행 제외 예산 합계는 200만 원 이하여야 합니다.');
    if (!Array.isArray(config.goals) || config.goals.length > 3) throw new Error('목표는 최대 3개까지 저장할 수 있습니다.');
    for (const g of config.goals) {
      if (!CATS.includes(g.category) || !['amount','count','stop'].includes(g.type) || !Number.isSafeInteger(g.limit) || g.limit < 0 || typeof g.store !== 'string' || g.store.length > 80 || (g.type === 'stop' && !g.store.trim())) throw new Error('목표 항목·금액·횟수·가맹점을 확인해주세요.');
    }
    for (const [cat,r] of Object.entries(config.reasons || {})) {
      if (!CATS.includes(cat) || !REASONS.includes(r.tag) || typeof r.note !== 'string' || r.note.length > 160) throw new Error('원인 기록을 확인해주세요.');
    }
    return sum;
  }
  function measure(tx, month, goal) {
    const matches = rows(tx,month).filter(t=>category(t)===goal.category && (!goal.store || String(t.store || '').toLocaleLowerCase().includes(goal.store.toLocaleLowerCase())));
    return goal.type === 'amount' ? matches.reduce((s,t)=>s+net(t),0) : matches.filter(t=>net(t)>0).length;
  }
  function median(tx, month, goal) {
    const months = [...new Set(tx.map(t=>String(t.date || '').slice(0,7)).filter(m=>validMonth(m) && m<=month))].sort().slice(-3);
    const values = months.map(m=>measure(tx,m,goal)).sort((a,b)=>a-b), mid=Math.floor(values.length/2);
    return values.length ? {value:values.length%2?values[mid]:Math.round((values[mid-1]+values[mid])/2),count:values.length} : null;
  }
  function completion(doc, fp, members) {
    return !!doc?.config && members.length===2 && members.every(uid => {
      const c=doc.comments?.[uid];
      return c?.text?.trim() && c.revision===doc.revision && c.fingerprint===fp;
    });
  }
  return { CAP, CATS, REASONS, validMonth, shift, rows, totals, baseline, fingerprint, validateConfig, measure, median, completion, stable, roundBudget };
});
