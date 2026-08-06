// Unit tests for the shared pure-math module (calc.js).
// Run: node tests/larder-math.test.js
'use strict';
const c = require('../calc.js');
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

console.log('\n-- gramsOf --');
check('2 kg -> 2000', () => assert.ok(close(c.gramsOf(2, 'kg', null), 2000)));
check('500 g -> 500', () => assert.ok(close(c.gramsOf(500, 'g', null), 500)));
check('1.5 l -> 1500', () => assert.ok(close(c.gramsOf(1.5, 'l', null), 1500)));
check('3 each uses ingredient serving (55) -> 165', () => assert.ok(close(c.gramsOf(3, 'each', ING[2]), 165)));
check('2 pc unknown -> 200', () => assert.ok(close(c.gramsOf(2, 'pc', null), 200)));
check('unknown unit falls back to serving (0 -> 0)', () => assert.equal(c.gramsOf(5, 'furlong', null), 500));

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

run();

function run() { console.log('\n' + passed + ' passed, ' + failed + ' failed'); process.exit(failed ? 1 : 0); }