// Unit tests for the shared pure-math module (calc.js).
// Run: node tests/larder-math.test.js
'use strict';
const c = require('../calc.js');
const u = require('../cms-utils.js').LarderCalcUtils;
const assert = require('assert');

let passed = 0, failed = 0;
function check(label, fn) {
    try { fn(); passed++; console.log('  ok  ' + label); }
    catch (e) { failed++; console.log('FAIL  ' + label + '\n      ' + (e && e.message)); }
}
function close(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }

const ING = [
    { foodId: 'rice', name: 'Rice', calories: 130, proteinG: 2.7, saturatedFatG: 0, vitaminDMcg: 0, averagePrice: 10, servingSizeG: 100 },
    { foodId: 'tuna', name: 'Tuna Flakes', calories: 200, proteinG: 25, saturatedFatG: 1, vitaminDMcg: 4, averagePrice: 250, servingSizeG: 100, proteinSource: 'fish' },
    { foodId: 'egg', name: 'Eggs', servingSizeG: 55, proteinSource: 'egg' }
];
const cals = (n) => ({ ...ING[0], foodId: 'c', calories: n });

console.log('\n-- priceBasisGrams / perGram --');
check('no basis -> servingSizeG (100g) -> perGram', () => {
    assert.ok(close(c.priceBasisGrams(ING[0]), 100));
    assert.ok(close(c.perGram(ING[0]), 0.1), 'Rs10 per 100g -> 0.1/g');
});
check('explicit basis 500 g -> price/500', () => {
    const t = { ...ING[0], averagePrice: 25, priceBasisAmount: 500, priceBasisUnit: 'g' };
    assert.ok(close(c.priceBasisGrams(t), 500));
    assert.ok(close(c.perGram(t), 0.05), 'Rs25 per 500g -> 0.05/g');
});
check('basis kg (2 kg -> 2000 g)', () => {
    const t = { ...ING[0], averagePrice: 80, priceBasisAmount: 2, priceBasisUnit: 'kg' };
    assert.ok(close(c.priceBasisGrams(t), 2000));
    assert.ok(close(c.perGram(t), 0.04));
});
check('count basis uses serving size (2 each -> 2*55g)', () => {
    const t = { ...ING[2], averagePrice: 5, priceBasisAmount: 2, priceBasisUnit: 'cnt' };
    assert.ok(close(c.priceBasisGrams(t), 110), '2 each * 55 g serving');
    assert.ok(close(c.perGram(t), 5 / 110));
});

console.log('\n-- gramsOf --');
check('2 kg -> 2000', () => assert.ok(close(c.gramsOf(2, 'kg', null), 2000)));
check('500 g -> 500', () => assert.ok(close(c.gramsOf(500, 'g', null), 500)));
check('1.5 l -> 1500', () => assert.ok(close(c.gramsOf(1.5, 'l', null), 1500)));
check('3 each uses ingredient serving (55) -> 165', () => assert.ok(close(c.gramsOf(3, 'each', ING[2]), 165)));
check('2 pc unknown -> 200', () => assert.ok(close(c.gramsOf(2, 'pc', null), 200)));
check('unknown unit falls back to serving (0 -> 0)', () => assert.equal(c.gramsOf(5, 'furlong', null), 500));

console.log('\n-- parseAmountToGrams --');
check('315g -> 315', () => assert.equal(c.parseAmountToGrams('315g', null), 315));
check('45ml -> 45', () => assert.equal(c.parseAmountToGrams('45ml', null), 45));
check('170g -> 170', () => assert.equal(c.parseAmountToGrams('170g', null), 170));
check('2 tbsp -> 30', () => assert.equal(c.parseAmountToGrams('2 tbsp', null), 30));
check('1 cup -> 240', () => assert.equal(c.parseAmountToGrams('1 cup', null), 240));
check('2 each (serving 55g) -> 110', () => assert.equal(c.parseAmountToGrams('2 each', ING[2]), 110));
check('1/2 cup -> 120', () => assert.equal(c.parseAmountToGrams('1/2 cup', null), 120));
check('1 1/2 cups -> 360', () => assert.equal(c.parseAmountToGrams('1 1/2 cups', null), 360));
check('½ cup -> 120', () => assert.equal(c.parseAmountToGrams('½ cup', null), 120));
check('invalid -> null', () => assert.equal(c.parseAmountToGrams('xyz', null), null));

console.log('\n-- rollingAvgDuration --');
check('3 events evenly spaced 7 days -> 7', () => {
    const events = [{ date: '2026-08-01' }, { date: '2026-08-08' }, { date: '2026-08-15' }];
    assert.equal(c.rollingAvgDuration(events), 7);
});
check('4 events irregular -> average of diffs', () => {
    const events = [{ date: '2026-08-01' }, { date: '2026-08-05' }, { date: '2026-08-12' }, { date: '2026-08-22' }];
    // diffs: 4, 7, 10 -> avg = 7
    assert.equal(c.rollingAvgDuration(events), 7);
});
check('outlier > 365 days ignored', () => {
    const events = [{ date: '2026-01-01' }, { date: '2026-01-08' }, { date: '2027-02-01' }];
    // diffs: 7, 389 -> 389 ignored -> avg = 7
    assert.equal(c.rollingAvgDuration(events), 7);
});
check('zero/negative diffs ignored', () => {
    const events = [{ date: '2026-08-01' }, { date: '2026-08-01' }, { date: '2026-08-08' }];
    assert.equal(c.rollingAvgDuration(events), 7);
});
check('< 2 events returns null', () => {
    assert.equal(c.rollingAvgDuration([]), null);
    assert.equal(c.rollingAvgDuration([{ date: '2026-08-01' }]), null);
    assert.equal(c.rollingAvgDuration(null), null);
});

console.log('\n-- Shopping List History --');
check('wrapListRecords: flat list -> single dated record', () => {
    const flat = [{ foodId: 'rice', name: 'Rice', amount: 1000, unit: 'g', checked: false }];
    const wrapped = u.wrapListRecords(flat);
    assert.ok(Array.isArray(wrapped));
    assert.equal(wrapped.length, 1);
    assert.ok(wrapped[0].id && wrapped[0].date);
    assert.ok(Array.isArray(wrapped[0].items));
    assert.equal(wrapped[0].items[0].foodId, 'rice');
    assert.equal(wrapped[0].items[0].checked, false);
});
check('wrapListRecords: empty array -> empty', () => {
    assert.deepEqual(u.wrapListRecords([]), []);
});
check('wrapListRecords: already records -> unchanged', () => {
    const records = [{ id: 'sl_1', date: '2026-08-01', items: [{ foodId: 'rice', checked: true }] }];
    const wrapped = u.wrapListRecords(records);
    assert.equal(wrapped.length, 1);
    assert.equal(wrapped[0].id, 'sl_1');
});
check('createListRecord: creates record with id, date, items', () => {
    const items = [{ foodId: 'rice', amount: 1000, unit: 'g', checked: true }];
    const rec = u.createListRecord(items, '2026-08-12');
    assert.ok(rec.id && rec.id.startsWith('sl_'));
    assert.equal(rec.date, '2026-08-12');
    assert.equal(rec.items[0].checked, true);
    assert.ok(rec.createdAt && rec.updatedAt);
});
check('upsertTodayRecord: new date -> prepends record', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    const lists = [{ id: 'sl_1', date: yesterdayStr, items: [] }];
    const items = [{ foodId: 'rice', checked: false }];
    const updated = u.upsertTodayRecord(lists, items);
    const today = new Date().toISOString().split('T')[0];
    assert.equal(updated[0].date, today);
    assert.equal(updated[0].items[0].foodId, 'rice');
    assert.equal(updated.length, 2); // old + new
});
check('upsertTodayRecord: existing today -> replaces items', () => {
    const today = new Date().toISOString().split('T')[0];
    const lists = [{ id: 'sl_1', date: today, items: [{ foodId: 'old', checked: true }] }];
    const items = [{ foodId: 'new', checked: false }];
    const updated = u.upsertTodayRecord(lists, items);
    assert.equal(updated.length, 1);
    assert.equal(updated[0].items[0].foodId, 'new');
    assert.ok(new Date(updated[0].updatedAt) >= new Date(updated[0].createdAt));
});

console.log('\n-- Price History --');
check('applyPriceUpdate: first entry creates history + avg', () => {
    const prod = { priceHistory: [] };
    const r = c.applyPriceUpdate(prod, { price: 100, date: '2026-08-01' });
    assert.equal(r.history.length, 1);
    assert.equal(r.averagePrice, 100);
    assert.equal(r.lastPrice, 100);
    assert.equal(r.lastPriceDate, '2026-08-01');
});
check('applyPriceUpdate: second entry updates avg', () => {
    const prod = { priceHistory: [{ date: '2026-08-01', price: 100 }] };
    const r = c.applyPriceUpdate(prod, { price: 110, date: '2026-08-08' });
    assert.equal(r.history.length, 2);
    assert.equal(r.averagePrice, 105);
    assert.equal(r.lastPrice, 110);
    assert.equal(r.lastPriceDate, '2026-08-08');
});
check('applyPriceUpdate: same-date upsert replaces price', () => {
    const prod = { priceHistory: [{ date: '2026-08-01', price: 100 }] };
    const r = c.applyPriceUpdate(prod, { price: 120, date: '2026-08-01' });
    assert.equal(r.history.length, 1);
    assert.equal(r.history[0].price, 120);
    assert.equal(r.averagePrice, 120);
});
check('applyPriceUpdate: history sorted by date', () => {
    const prod = { priceHistory: [{ date: '2026-08-08', price: 110 }] };
    const r = c.applyPriceUpdate(prod, { price: 100, date: '2026-08-01' });
    assert.equal(r.history[0].date, '2026-08-01');
    assert.equal(r.history[1].date, '2026-08-08');
});
check('normalizeForCompare: aligns dates across products', () => {
    const h = {
        rice: [{ date: '2026-08-01', price: 100 }, { date: '2026-08-08', price: 105 }],
        wheat: [{ date: '2026-08-01', price: 80 }, { date: '2026-08-15', price: 85 }]
    };
    const norm = c.normalizeForCompare(h);
    assert.equal(norm.length, 3); // 01, 08, 15
    assert.equal(norm[0].date, '2026-08-01');
    assert.equal(norm[0].values.rice, 100);
    assert.equal(norm[0].values.wheat, 80);
    assert.equal(norm[1].date, '2026-08-08');
    assert.equal(norm[1].values.rice, 105);
    assert.ok(!('wheat' in norm[1].values)); // wheat missing on 08
    assert.equal(norm[2].date, '2026-08-15');
    assert.ok(!('rice' in norm[2].values));
    assert.equal(norm[2].values.wheat, 85);
});

console.log('\n-- computeTotals --');
check('basic totals 1kg rice', () => {
    const t = c.computeTotals([{ ingredientId: 'rice', amount: 1000, unit: 'g' }], ING);
    assert.ok(close(t.energy, 1300), '130 kcal/100g * 10');
    assert.ok(close(t.protein, 27), '2.7g/100g * 10');
    assert.ok(close(t.satFat, 0), 'satFat');
    assert.ok(close(t.cost, 100), 'Rs10/100g * 1000g');
    assert.equal(t.units, 1);
});
check('useStock -> cost 0, nutrition kept', () => {
    const t = c.computeTotals([{ ingredientId: 'rice', amount: 1000, unit: 'g', useStock: true }], ING);
    assert.equal(t.cost, 0);
    assert.ok(close(t.protein, 27));
});
check('animal source tallied, meat always', () => {
    const t = c.computeTotals([{ ingredientId: 'tuna', amount: 100, unit: 'g' }], ING);
    assert.ok(close(t.animal, 25), 'protein 25g of fish'); assert.ok(close(t.meat, 25));
});
check('unknown ingredients skipped', () => {
    const t = c.computeTotals([{ ingredientId: 'nope', amount: 100, unit: 'g' }], ING);
    assert.equal(t.units, 0); assert.equal(t.protein, 0); assert.equal(t.cost, 0);
});
check('zero averagePrice -> cost 0', () => {
    const t = c.computeTotals([{ ingredientId: 'egg', amount: 2, unit: 'each' }], ING);
    assert.equal(t.cost, 0); assert.ok(close(t.units, 1));
});
check('count unit (each) uses serving size in totals', () => {
    const t = c.computeTotals([{ ingredientId: 'egg', amount: 2, unit: 'each' }], ING);
    // 2 * 55 g = 110 g
    assert.ok(t.protein >= 0);
});
check('empty items -> zeros', () => { const t = c.computeTotals(null, ING); assert.equal(t.energy, 0); assert.equal(t.cost, 0); assert.equal(t.units, 0); });

console.log('\n-- matchIngredient --');
check('exact match', () => assert.equal(c.matchIngredient('Rice', ING).foodId, 'rice'));
check('fuzzy tuna -> Tuna Flakes', () => assert.equal(c.matchIngredient('tuna', ING).foodId, 'tuna'));
check('no match -> null', () => assert.equal(c.matchIngredient('spaceship', ING), null));
check('partial match at low threshold', () => assert.equal(c.matchIngredient('Tuna Fl', ING, 0.5).foodId, 'tuna'));
check('empty name -> null', () => assert.equal(c.matchIngredient('', ING), null));

console.log('\n-- parseLine (receipt heuristic) --');
check('Rice 2kg 145.00 -> price 145, lineTotal 145 (package)', () => { const r = c.parseLine('Rice 2kg 145.00'); assert.ok(r); assert.ok(close(r.price, 145)); assert.ok(close(r.lineTotal, 145)); assert.equal(r.unit, 'kg'); });
check('500g 250.00 -> no 500*250 blow-up', () => { const r = c.parseLine('Tuna 500 250.00'); assert.ok(r); assert.ok(close(r.lineTotal, 250)); });
check('2 x 18.00 per-unit', () => { const r = c.parseLine('White Wine 2 x 18.00'); assert.ok(r); assert.ok(close(r.qty, 2)); assert.ok(close(r.price, 18)); assert.ok(close(r.lineTotal, 36)); });
check('2 x 18.00 = 36 total wins', () => { const r = c.parseLine('Milk 2 x 18.00 = 36.00'); assert.ok(r); assert.ok(close(r.lineTotal, 36)); });
check('TOTAL filtered out', () => assert.equal(c.parseLine('TOTAL 1500.00'), null));
check('comma decimal price', () => { const r = c.parseLine('Butter 200g 12,50'); assert.ok(r); assert.ok(close(r.price, 12.5)); assert.ok(close(r.lineTotal, 12.5)); });
check('empty line -> null', () => assert.equal(c.parseLine('   '), null));

console.log('\n-- parseReceiptText --');
check('matching + fold totals', () => {
    const r = c.parseReceiptText('Rice 2 kg 145\nRice 2 kg 145\nWhite Wine 1 x 18\nTOTAL 1000', ING);
    assert.equal(r.length, 2);
    const rice = r.find(x => x.name === 'Rice');
    assert.ok(close(rice.qty, 4));
    assert.ok(close(rice.lineTotal, 290));
    assert.equal(rice.foodId, 'rice');
});
check('skips header/TAX lines', () => {
    const r = c.parseReceiptText('STORE MEGA MART\nTAX 12.00\nEggs 6 120', ING);
    assert.equal(r.length, 1);
    assert.equal(r[0].name, 'Eggs');
});

console.log('\n-- parseStepLinks (instruction ingredient links) --');
check('plain text only', () => {
    const seg = u.parseStepLinks('Boil a large pot of water.');
    assert.equal(seg.length, 1);
    assert.equal(seg[0].type, 'text');
    assert.equal(seg[0].text, 'Boil a large pot of water.');
});
check('single token with label', () => {
    const seg = u.parseStepLinks('Add the [[tagliatelle|Tagliatelle]] to the water.');
    assert.deepEqual(seg, [
        { type: 'text', text: 'Add the ' },
        { type: 'link', foodId: 'tagliatelle', label: 'Tagliatelle' },
        { type: 'text', text: ' to the water.' }
    ]);
});
check('token without label falls back to foodId', () => {
    const seg = u.parseStepLinks('Season with [[salt]].');
    assert.deepEqual(seg[1], { type: 'link', foodId: 'salt', label: 'salt' });
});
check('multiple tokens in one step', () => {
    const seg = u.parseStepLinks('Toss [[pasta|Pasta]] with [[tuna_flakes|Tuna]].');
    assert.equal(seg.filter(s => s.type === 'link').length, 2);
    assert.equal(seg.filter(s => s.type === 'text').length, 3);
});
check('empty / missing foodId token stays plain text', () => {
    const seg = u.parseStepLinks('Literal [[]] brackets are safe.');
    assert.equal(seg.length, 1);
    assert.equal(seg[0].type, 'text');
});
check('space inside token never matches (escape hatch)', () => {
    const seg = u.parseStepLinks('Write [[not a token]] literally.');
    assert.equal(seg.length, 1);
    assert.equal(seg[0].type, 'text');
});
check('unbalanced token stays text', () => {
    const seg = u.parseStepLinks('An [[open token at end');
    assert.equal(seg.length, 1);
    assert.equal(seg[0].type, 'text');
});
check('extra bracket [[[ escapes a literal token', () => {
    const seg = u.parseStepLinks('Escape [[[salt]] literally.');
    assert.equal(seg.length, 1);
    assert.equal(seg[0].type, 'text');
    assert.equal(seg[0].text, 'Escape [[[salt]] literally.');
});
check('[[foo bar]] keeps space escape', () => {
    const seg = u.parseStepLinks('Write [[ not a token ]] as-is.');
    assert.equal(seg.length, 1);
    assert.equal(seg[0].type, 'text');
});

console.log('\n-- consumptionFor --');
const recipeTuna = {
    macros: { yield: '3' },
    ingredients: [
        { foodId: 'tagliatelle', metric: '315g' },
        { foodId: 'tuna_flakes', metric: '170g' },
        { foodId: 'onion', metric: '150g' },
        { foodId: 'garlic', metric: '20g' },
        { foodId: 'olive_oil', metric: '45ml' }
    ]
};
check('Tuna pasta 3 servings -> per-serving grams', () => {
    const cons = c.consumptionFor(recipeTuna, { servingsCooked: 3 });
    const tuna = cons.find(x => x.foodId === 'tuna_flakes');
    assert.ok(tuna);
    assert.equal(tuna.grams, 170); // 170g / 3 yield * 3 servings = 170
    const pasta = cons.find(x => x.foodId === 'tagliatelle');
    assert.ok(pasta);
    assert.equal(pasta.grams, 315); // 315g / 3 * 3 = 315
});
check('2 servings scaled from yield 3', () => {
    const cons = c.consumptionFor(recipeTuna, { servingsCooked: 2 });
    const tuna = cons.find(x => x.foodId === 'tuna_flakes');
    assert.ok(tuna);
    assert.equal(tuna.grams, 113.3); // 170/3*2 = 113.333 -> 113.3
});
check('overrides replace computed grams', () => {
    const cons = c.consumptionFor(recipeTuna, { servingsCooked: 3, overrides: { tuna_flakes: { grams: 200 } } });
    const tuna = cons.find(x => x.foodId === 'tuna_flakes');
    assert.equal(tuna.grams, 200);
});
check('ingredients without foodId skipped', () => {
    const r = { macros: { yield: '2' }, ingredients: [{ foodId: 'rice', metric: '200g' }, { item: 'Salt', metric: '10g' }] };
    const cons = c.consumptionFor(r, { servingsCooked: 2 });
    assert.equal(cons.length, 1);
    assert.equal(cons[0].foodId, 'rice');
});
check('empty recipe returns empty', () => {
    assert.deepEqual(c.consumptionFor(null, {}), []);
    assert.deepEqual(c.consumptionFor({}, {}), []);
    assert.deepEqual(c.consumptionFor({ ingredients: [] }, {}), []);
});

console.log('\n-- householdInflationIndex --');
check('weighted average of price changes', () => {
    const history = {
        rice: [{ date: '2026-01-01', price: 100 }, { date: '2026-06-01', price: 110 }],
        wheat: [{ date: '2026-01-01', price: 100 }, { date: '2026-06-01', price: 120 }],
        oil: [{ date: '2026-01-01', price: 100 }, { date: '2026-06-01', price: 100 }]
    };
    const weights = { rice: 0.5, wheat: 0.3, oil: 0.2 };
    const result = c.householdInflationIndex(history, weights, { from: '2026-01-01', to: '2026-06-01' });
    // rice: +10% * 0.5 = 5%, wheat: +20% * 0.3 = 6%, oil: 0% * 0.2 = 0% => total 11%
    assert.equal(result.index, 11);
    assert.ok(result.contributions.rice);
    assert.equal(result.contributions.rice.contribution, 5);
    assert.equal(result.contributions.wheat.contribution, 6);
    assert.equal(result.contributions.oil.contribution, 0);
});
check('householdInflationIndex: normalizes weights', () => {
    const history = {
        rice: [{ date: '2026-01-01', price: 100 }, { date: '2026-06-01', price: 110 }],
        wheat: [{ date: '2026-01-01', price: 100 }, { date: '2026-06-01', price: 120 }]
    };
    const weights = { rice: 5, wheat: 3 }; // unnormalized
    const result = c.householdInflationIndex(history, weights);
    // rice 10% * 0.625 = 6.25%, wheat 20% * 0.375 = 7.5% => 13.75%
    assert.equal(result.index, 13.75);
});
check('householdInflationIndex: filters by period', () => {
    const history = {
        rice: [{ date: '2025-12-01', price: 100 }, { date: '2026-01-01', price: 105 }, { date: '2026-06-01', price: 110 }]
    };
    const weights = { rice: 1 };
    const result = c.householdInflationIndex(history, weights, { from: '2026-01-01', to: '2026-06-01' });
    // Only Jan-Jun change: 105->110 = ~4.76%
    assert.ok(Math.abs(result.index - 4.76) < 0.1);
});
check('householdInflationIndex: missing product skipped', () => {
    const history = {
        rice: [{ date: '2026-01-01', price: 100 }, { date: '2026-06-01', price: 110 }]
    };
    const weights = { rice: 0.5, wheat: 0.5 };
    const result = c.householdInflationIndex(history, weights);
    // wheat has no history, should be skipped, rice gets full weight
    assert.equal(result.index, 10);
    assert.ok(!result.contributions.wheat);
});

console.log('\n-- categorySpend --');
check('categorySpend: aggregates by category', () => {
    const receipts = [
        { date: '2026-01-01', total: 100, items: [{ category: 'Grains', price: 50 }, { category: 'Vegetables', price: 50 }] },
        { date: '2026-01-15', total: 200, items: [{ category: 'Grains', price: 100 }, { category: 'Meat', price: 100 }] }
    ];
    const result = c.categorySpend(receipts);
    assert.equal(result.overall.total, 300);
    assert.equal(result.overall.count, 2);
    assert.equal(result.byCategory.Grains.total, 150);
    assert.equal(result.byCategory.Grains.count, 2);
    assert.equal(result.byCategory.Vegetables.total, 50);
    assert.equal(result.byCategory.Meat.total, 100);
    assert.equal(result.byCategory.Grains.avg, 75);
});
check('categorySpend: filters by period', () => {
    const receipts = [
        { date: '2025-12-01', total: 100, items: [{ category: 'Grains', price: 100 }] },
        { date: '2026-01-01', total: 200, items: [{ category: 'Grains', price: 200 }] }
    ];
    const result = c.categorySpend(receipts, { from: '2026-01-01' });
    assert.equal(result.overall.total, 200);
    assert.equal(result.byCategory.Grains.total, 200);
});

console.log('\n-- savingsSignals --');
check('savingsSignals: detects brand savings', () => {
    const history = {
        rice: [
            { price: 100, brand: 'BrandA' },
            { price: 110, brand: 'BrandA' },
            { price: 80, brand: 'BrandB' },
            { price: 90, brand: 'BrandB' }
        ]
    };
    const signals = c.savingsSignals(history);
    assert.equal(signals.length, 1);
    assert.equal(signals[0].foodId, 'rice');
    // BrandA avg = 105, BrandB avg = 85, savings = 20
    assert.equal(signals[0].savingsPerUnit, 20);
    assert.equal(signals[0].cheaperBrand, 'BrandB');
    assert.equal(signals[0].expensiveBrand, 'BrandA');
    assert.equal(signals[0].totalSavings, 40); // 20 * min(2,2) = 40
});
check('savingsSignals: ignores single brand', () => {
    const history = { rice: [{ price: 100, brand: 'A' }, { price: 110, brand: 'A' }] };
    assert.deepEqual(c.savingsSignals(history), []);
});
check('savingsSignals: sorts by totalSavings desc', () => {
    const history = {
        rice: [{ price: 100, brand: 'A' }, { price: 120, brand: 'B' }],
        wheat: [{ price: 50, brand: 'C' }, { price: 90, brand: 'D' }]
    };
    const signals = c.savingsSignals(history);
    assert.equal(signals[0].foodId, 'wheat'); // savings 40 > rice 20
});

run();

function run() { console.log('\n' + passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0); }