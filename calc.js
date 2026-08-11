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
    // Parse an amount string like "315g", "45ml", "2 tbsp", "1 cup" into grams.
    // Falls back to ingredient's servingSizeG for count units.
    function parseAmountToGrams(amountStr, ing) {
        if (typeof amountStr === 'number') return amountStr;
        if (!amountStr) return 0;
        var s = String(amountStr).trim();
        var FRACTION_CHARS = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };
        for (var ch in FRACTION_CHARS) {
            if (s.includes(ch)) s = s.split(ch).join(FRACTION_CHARS[ch]);
        }
        var m = s.match(/^([\d\s./-]+)\s*([a-zA-Zµ]+)?$/);
        if (!m) return null;
        var qty = 0;
        for (var part of m[1].trim().split(/[\s-]+/)) {
            if (!part) continue;
            if (part.includes('/')) { var f = part.split('/'); qty += (parseFloat(f[0]) || 0) / (parseFloat(f[1]) || 1); }
            else qty += parseFloat(part) || 0;
        }
        var u = (m[2] || '').toLowerCase();
        if (u in UNIT_TO_GRAMS) return qty * UNIT_TO_GRAMS[u];
        if (COUNT_UNITS.includes(u)) return qty * (num(ing && ing.servingSizeG) || 100);
        return null;
    }
    // Weight/volume of one of the given unit. Count units fall back to one
    // serving-size of the ingredient (or 100 g when unknown, e.g. a receipt line).
    function gramsOf(amount, unit, ing) {
        var u = String(unit || '').toLowerCase();
        if (Object.prototype.hasOwnProperty.call(UNIT_TO_GRAMS, u)) return num(amount) * UNIT_TO_GRAMS[u];
        if (COUNT_UNITS.indexOf(u) !== -1) return num(amount) * (num(ing && ing.servingSizeG) || 100);
        return num(amount) * (num(ing && ing.servingSizeG) || 100);
    }

    // Grams that `averagePrice` buys. The basis is explicit when set
    // (priceBasisAmount + priceBasisUnit, e.g. "2 kg", "100 g", "1 pc");
    // otherwise it falls back to the ingredient's serving size (default 100 g).
    function priceBasisGrams(ing) {
        var a = num(ing && ing.priceBasisAmount);
        if (a > 0) {
            var u = String(ing && ing.priceBasisUnit || 'g').toLowerCase();
            if (u === 'cnt' || u === 'pc' || u === 'each' || u === 'piece') {
                return a * (num(ing && ing.servingSizeG) || 100);
            }
            return a * gramsOf(1, u, ing);
        }
        var s = num(ing && ing.servingSizeG);
        return s > 0 ? s : 100;
    }

    function perGram(ing) {
        var avg = num(ing && ing.averagePrice);
        if (avg <= 0) return 0;
        var b = priceBasisGrams(ing);
        return b > 0 ? avg / b : 0;
    }

    var ANIMAL_SOURCE = ['meat', 'fish', 'egg', 'dairy'];
    function isAnimalSource(src) { return ANIMAL_SOURCE.indexOf(String(src || '').toLowerCase()) !== -1; }

    function findIngredientById(ingredients, id) {
        var list = ingredients || [];
        for (var i = 0; i < list.length; i++) if (list[i] && list[i].foodId === id) return list[i];
        return null;
    }

    // Every nutrient we track, keyed by the ingredient's field name. computeTotals
    // accumulates each from per-100g (times the grams factor). Used for planner
    // projections and the monthly micro goals.
    var MICRO_FIELDS = ['saturatedFatG', 'transFatG', 'monounsaturatedFatG', 'polyunsaturatedFatG', 'cholesterolMg', 'sugarG', 'fiberG', 'sodiumMg', 'potassiumMg', 'calciumMg', 'ironMg', 'magnesiumMg', 'phosphorusMg', 'zincMg', 'copperMg', 'seleniumMcg', 'vitaminAMcg', 'vitaminCMg', 'vitaminDMcg', 'vitaminEMg', 'vitaminKMcg', 'thiaminMg', 'riboflavinMg', 'niacinMg', 'pantothenicMg', 'vitaminB6Mg', 'folateMcg', 'vitaminB12Mcg'];

    // Aggregate nutrition + cost for planner items. useStock lines cost 0.
    function computeTotals(items, ingredients) {
        var t = { energy: 0, protein: 0, carbs: 0, fat: 0, satFat: 0, sugar: 0, fiber: 0, vitD: 0, animal: 0, meat: 0, cost: 0, units: 0 };
        MICRO_FIELDS.forEach(function (k) { t[k] = 0; });
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
            MICRO_FIELDS.forEach(function (k) { t[k] += num(ing[k]) * f; });
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

    // Compute per-ingredient consumption (grams) for a cooked recipe.
    // recipe: recipe object with ingredients[] having foodId, metric, imperial, amount, unit
    // options: { servingsCooked: number, overrides?: { foodId: { grams: number } } }
    // Returns array of { foodId: string, grams: number }
    function consumptionFor(recipe, options) {
        var servingsCooked = (options && options.servingsCooked) || 1;
        var overrides = (options && options.overrides) || {};
        if (!recipe || !recipe.ingredients || !recipe.ingredients.length) return [];
        var yieldNum = 1;
        if (recipe.macros) {
            var y = parseFloat(String(recipe.macros.yield || '').replace(',', '.'));
            if (y > 0) yieldNum = y;
        }
        var result = [];
        recipe.ingredients.forEach(function (ing) {
            if (!ing.foodId) return;
            var batchGrams = null;
            if (ing.metric) batchGrams = parseAmountToGrams(ing.metric, null);
            else if (ing.imperial) batchGrams = parseAmountToGrams(ing.imperial, null);
            else if (typeof ing.amount === 'number') batchGrams = ing.amount;
            else if (typeof ing.amount === 'string' && ing.amount) batchGrams = parseAmountToGrams(ing.amount, null);
            if (batchGrams === null || batchGrams <= 0) return;
            var perServingGrams = batchGrams / yieldNum;
            var grams = perServingGrams * servingsCooked;
            var ov = overrides[ing.foodId];
            if (ov && typeof ov.grams === 'number' && ov.grams >= 0) {
                grams = ov.grams;
            }
            if (grams > 0) {
                result.push({ foodId: ing.foodId, grams: Math.round(grams * 10) / 10 });
            }
        });
        return result;
    }

    return {
        gramsOf: gramsOf,
        priceBasisGrams: priceBasisGrams,
        perGram: perGram,
        isAnimalSource: isAnimalSource,
        computeTotals: computeTotals,
        findIngredientById: findIngredientById,
        normalise: normalise,
        matchIngredient: matchIngredient,
        parseLine: parseLine,
        parseReceiptText: parseReceiptText,
        consumptionFor: consumptionFor,
        parseAmountToGrams: parseAmountToGrams,
        UNIT_TO_GRAMS: UNIT_TO_GRAMS,
        COUNT_UNITS: COUNT_UNITS,
        MICRO_FIELDS: MICRO_FIELDS
    };
});