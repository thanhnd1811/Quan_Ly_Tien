// Headless test runner — verify accuracy của matcher trên 100+ test cases
// Run: node test-matcher.js

// Mock window
global.window = {};

// Load files
require('./www/js/categories-default.js');
require('./www/js/category-matcher.js');
require('./www/js/category-test-dataset.js');

const def = global.window.QLT_CategoriesDefault;
const TD = global.window.QLT_CategoryTestDataset;

// Build fake cats giống như app sau khi migrate
const fakeExpense = def.EXPENSE.map(d => ({
  id: d.slug, slug: d.slug, type: 'expense', name: d.name,
  keywords: [...(d.keywords.brand || []), ...(d.keywords.strong || []), ...(d.keywords.weak || [])],
  antiKeywords: d.antiKeywords || {}
}));
const fakeIncome = def.INCOME.map(d => ({
  id: d.slug, slug: d.slug, type: 'income', name: d.name,
  keywords: [...(d.keywords.brand || []), ...(d.keywords.strong || []), ...(d.keywords.weak || [])],
  antiKeywords: d.antiKeywords || {}
}));

const stats = TD.runTests({ expense: fakeExpense, income: fakeIncome });

console.log('═══════════════════════════════════════════');
console.log(`📊 ACCURACY: ${stats.accuracy}%   (${stats.pass}/${stats.total})`);
console.log(`✅ Pass: ${stats.pass}    ❌ Fail: ${stats.fail}`);
console.log(`⏸️  Abstain correct: ${stats.abstainCorrect}    ⚠️ Abstain leaked: ${stats.abstainExpectedButGuessed}`);
console.log('═══════════════════════════════════════════\n');

const fails = stats.results.filter(r => !r.pass);
if (fails.length) {
  console.log(`❌ ${fails.length} CASE FAIL:\n`);
  for (const r of fails) {
    console.log(`  Input:    "${r.input}"${r.note ? ` — ${r.note}` : ''}`);
    console.log(`  Expect:   ${r.expected}`);
    console.log(`  Got:      ${r.got}  (${r.confidence}, ${r.tier || '—'}, kw="${r.kw || ''}")`);
    console.log('');
  }
}

const acc = parseFloat(stats.accuracy);
process.exit(acc >= 85 ? 0 : 1);
