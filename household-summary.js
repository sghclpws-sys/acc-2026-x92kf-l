(function(root) {
  'use strict';
  function amount(value) {
    if (value === undefined || value === null || value === '') return 0;
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error('유효하지 않은 금액이 있습니다.');
    return n;
  }
  function build(input) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month || '')) throw new Error('요약할 월을 선택해주세요.');
    const categories = {};
    let gross = 0, settlements = 0, count = 0, unclassified = 0;
    for (const t of input.transactions || []) {
      if (String(t.date || '').slice(0, 7) !== input.month) continue;
      const net = amount(t.amount) - amount(t.settlement);
      gross += amount(t.amount); settlements += amount(t.settlement); count++;
      const cat = String(t.category || '미분류');
      Object.defineProperty(categories, cat, { value: (Object.hasOwn(categories, cat) ? categories[cat] : 0) + net, enumerable: true, configurable: true });
      if (cat === '미분류') unclassified++;
    }
    const inc = input.income;
    const incomeKnown = !!inc && ['yejin', 'gihyuk', 'etc'].every(k => Object.hasOwn(inc, k) && inc[k] !== null && inc[k] !== '');
    const interestKnown = !!inc && Object.hasOwn(inc, 'interestExpense') && inc.interestExpense !== null && inc.interestExpense !== '';
    const income = incomeKnown ? amount(inc.yejin) + amount(inc.gihyuk) + amount(inc.etc) : null;
    const interest = interestKnown ? amount(inc.interestExpense) : null;
    const net = gross - settlements;
    const total = interest === null ? null : net + interest;
    const balance = income === null || total === null ? null : income - total;
    return {
      schemaVersion: 1, month: input.month, currency: 'KRW',
      generatedAt: input.generatedAt || new Date().toISOString(), source: 'gaegebu/main',
      status: 'provisional', calculationVersion: 'net-card-plus-interest-v1',
      grossCardAmount: gross, settlementAmount: settlements, netCardExpense: net,
      interestExpense: interest, income: income, totalExpense: total, balance: balance,
      surplusRate: income > 0 && balance !== null ? Math.round(balance / income * 10000) / 100 : null,
      transactionCount: count, categories: categories,
      quality: { incomeMissing: !incomeKnown, interestMissing: !interestKnown,
        unclassifiedCount: unclassified, completenessVerified: false,
        scope: 'card_transactions_and_loan_interest_only' }
    };
  }
  root.HouseholdSummary = { build: build };
  if (typeof module !== 'undefined') module.exports = root.HouseholdSummary;
})(typeof globalThis !== 'undefined' ? globalThis : window);
