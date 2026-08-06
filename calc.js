// Larder pure calculation helpers.
// Works in both the browser (exposed as window.LarderCalc) and Node (CommonJS,
// used by unit tests). All functions are pure: data in, result out, no state.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else if (typeof window !== 'undefined') window.LarderCalc = factory();
    else root.LarderCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var UNIT_TO_GRAMS = {
        g: 1, gram: 1, grams: 1, '': 1,
        kg: 1000, kilogram: 1000, kilograms: 1000, kgs: 1000,
        ml: 1, millilitre: 1, milliliter: 1, millilitres: 1, milliliters: 1,
        l: 1000, litre: 1000, liter: 1000, litres: 1000, liters: 1000,
        tsp: 5, teaspoon: 5, teaspoons: 5,
        tbsp: 15, tablespoon: 15, tablespoons: 15,
        cup: 240, cups: 240,
        oz: 28.35, ounce: 28.35, ounces: 28.35,
        lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6
    };
    var COUNT_UNITS = ['pc', 'pcs', 'piece', 'pieces', 'each', 'whole', 'can', 'cans', 'tin', 'tins', 'bottle', 'bottles', 'bag', 'bags', 'pack', 'packet', 'packets', 'clove', 'cloves', 'sprig', 'sprigs', 'slice', 'slices', 'pinch', 'pinches', 'stalk', 'stalks', 'bunch', 'medium', 'large', 'small', 'head', 'heads'];

    var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : 0; };
    // Weight/volume of one of the given unit. Count units fall back to one
    // serving-size of the ingredient (or 100 g when unknown, e.g. a receipt line).
    function gramsOf(amount, unit, ing) {
        var u = String(unit || '').toLowerCase();
        if (Object.prototype.hasOwnProperty.call(UNIT_TO_GRAMS, u)) return num(amount) * UNIT_TO_GRAMS[u];
        if (COUNT_UNITS.indexOf(u) !== -1) return num(amount) * (num(ing && ing.servingSizeG) || 100);
        return num(amount) * (num(ing && ing.servingSizeG) || 100);
    }

    function perGram(ing) {
        var avg = num(ing && ing.averagePrice);
        if (avg <= 0) return 0;
        return avg / (num(ing.servingSizeG) || 100);
    }

    var ANIMAL_SOURCE = ['meat', 'fish', 'egg', 'dairy'];
    function isAnimalSource(src) { return ANIMAL_SOURCE.indexOf(String(src || '').toLowerCase()) !== -1; }

    function findIngredientById(ingredients, id) {
        var list = ingredients || [];
        for (var i = 0; i < list.length; i++) if (list[i] && list[i].foodId === id) return list[i];
        return null;
    }

    // Aggregate nutrition + cost for planner items. useStock lines cost 0.
    function computeTotals(items, ingredients) {
        var t = { energy: 0, protein: 0, carbs: 0, fat: 0, satFat: 0, sugar: 0, fiber: 0, vitD: 0, animal: 0, meat: 0, cost: 0, units: 0 };
        (items || []).forEach(function (it) {
            var ing = findIngredientById(ingredients, it && it.ingredientId);
            var g = gramsOf(it && it.amount, it && it.unit, ing);
            if (!ing || g <= 0) return;
            var f = g / 100;
            t.energy += num(ing.calories) * f;
            t.protein += num(ing.proteinG) * f;
            t.carbs += num(ing.carbsG) * f;
            t.fat += num(ing.fatG) * f;
            t.satFat += num(ing.saturatedFatG) * f;
            t.sugar += num(ing.sugarG) * f;
            t.fiber += num(ing.fiberG) * f;
            t.vitD += num(ing.vitaminDMcg) * f;
            var prot = num(ing.proteinG) * f;
            t.meat += prot;
            if (isAnimalSource(ing.proteinSource)) t.animal += prot;
            t.cost += perGram(ing) * g * (it.useStock ? 0 : 1);
            t.units += 1;
        });
        return t;
    }

    function normalise(s) {
        return String(s || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Fuzzy-match a name against the catalogue; best score >= threshold wins.
    function matchIngredient(name, ingredients, threshold) {
        var q = normalise(name);
        threshold = threshold == null ? 0.6 : threshold;
        if (!q) return null;
        var best = { ing: null, score: 0 };
        (ingredients || []).forEach(function (ing) {
            var t = normalise(ing.name);
            if (t === q) { best.ing = ing; best.score = 100; return; }
            var qToks = q.split(' ').filter(Boolean);
            var cToks = t.split(/[\s-]+/).filter(Boolean);
            if (!qToks.length || !cToks.length) return;
            var hit = 0;
            qToks.forEach(function (qt) { if (cToks.some(function (ct) { return ct.indexOf(qt) !== -1 || qt.indexOf(ct) !== -1; })) hit++; });
            var headBoost = cToks.some(function (ct) { return ct === qToks[0] || ct.indexOf(qToks[0]) === 0; }) ? 1 : 0.6;
            if ((hit / qToks.length) * headBoost > best.score) { best.ing = ing; best.score = (hit / qToks.length) * headBoost; }
        });
        return best.score >= threshold ? best.ing : null;
    }

    // Parse a single receipt/OCR line into { name, qty, unit, price, grams, lineTotal } or null.
    function parseLine(line) {
        var s = String(line || '').trim();
        if (!s) return null;
        if (/TOTAL|TAX|VAT|CHANGE|BALANCE|BILL|MASTER|VISA|CASH|RECEIPT|COPYRIGHT|CARD|THANK|PHONE|WEBSITE/i.test(s) && /\d/.test(s) === false) return null;
        if (/TOTAL|TAX|VAT|CHANGE|BALANCE|BILL|MASTER|VISA|CASH|RECEIPT|COPYRIGHT|STORE/i.test(s)) return null;
        if (/^\W*$/.test(s)) return null;

        var name, qty = 1, unit = 'g', price = 0, lineTotal = 0;
        var m, unitText;

        // Form A: "Name 2 x 12.50"  (or "Name 2 x 12.50 = 25.00").
        m = s.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*[xX*×]\s*(\d+(?:[.,]\d+)?)\s*(?:[=@]\s*)?(\d+(?:[.,]\d+)?)?$/);
        if (m) {
            name = m[1].trim(); qty = parseNum(m[2]); price = parseNum(m[3]); unit = 'pc';
            lineTotal = m[4] ? parseNum(m[4]) : qty * price;
        } else {
            // Form B: "<name> <qty><unit?> <amount>". The trailing amount is the
            // whole line (package) price for weight units.
            m = s.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*([a-zA-Zµ]*)\s+(\d+(?:[.,]\d+)?)\s*$/);
            if (m) {
                name = m[1].trim(); qty = parseNum(m[2]); unitText = (m[3] || 'g').toLowerCase() || 'g';
                price = parseNum(m[4]);
                lineTotal = price; // trailing number = line total
            } else {
                m = s.match(/^(.*?)\s+(\d+(?:[.,]\d+)?)\s*$/);
                if (!m) return null;
                name = m[1].trim(); price = parseNum(m[2]); lineTotal = price;
            }
        }
        name = name.replace(/\*+$/g, '').trim();
        if (!name || price <= 0) return null;
        var n2u = { kg: 'kg', kgs: 'kg', kilogram: 'kg', gram: 'g', grams: 'g', ml: 'ml', millilitre: 'ml', l: 'l', litre: 'l', liter: 'l', pcs: 'pc', pieces: 'pc', each: 'pc', bottle: 'pc', bag: 'pc', pack: 'pc', packet: 'pc', can: 'pc', tin: 'pc' };
        if (n2u[unit] !== undefined) unit = n2u[unit]; else if (unitText && n2u[unitText]) unit = n2u[unitText];
        return { name: name, qty: qty, unit: unit, price: price, grams: gramsOf(qty, unit, null), lineTotal: lineTotal };
    }

    function parseNum(v) { var n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; }

    // Parse pasted receipt block; fold consecutive identical lines into one.
    function parseReceiptText(text, ingredients) {
        var out = [];
        String(text || '').split(/\r?\n/).forEach(function (ln) {
            var r = parseLine(ln);
            if (!r) return;
            for (var i = 0; i < out.length; i++) {
                if (normalise(out[i].name) === normalise(r.name) && out[i].price === r.price) {
                    out[i].qty += r.qty; out[i].grams += r.grams; out[i].lineTotal += r.lineTotal;
                    return;
                }
            }
            var ing = matchIngredient(r.name, ingredients);
            out.push({ name: r.name, qty: r.qty, unit: r.unit, price: r.price, grams: r.grams, lineTotal: r.lineTotal, foodId: ing ? ing.foodId : null, matchedName: ing ? ing.name : null });
        });
        return out;
    }

    return {
        gramsOf: gramsOf,
        perGram: perGram,
        isAnimalSource: isAnimalSource,
        computeTotals: computeTotals,
        findIngredientById: findIngredientById,
        normalise: normalise,
        matchIngredient: matchIngredient,
        parseLine: parseLine,
        parseReceiptText: parseReceiptText,
        UNIT_TO_GRAMS: UNIT_TO_GRAMS,
        COUNT_UNITS: COUNT_UNITS
    };
});