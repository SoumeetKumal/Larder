// Larder CMS pure helpers (extracted from cms.js).
// No DOM access, no shared mutable state: every function here is deterministic
// given its inputs, so it is safe to load before cms.js and destructure back in.
(function (root) {
    'use strict';

    const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function formatDateDMY(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr.length === 10 ? dateStr + 'T00:00:00' : dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // --- Amount formatting (shared with the shopping list display) ---
    function toFractionString(value) {
        if (value == null || isNaN(value)) return null;
        const wholes = Math.floor(value + 1e-9);
        const fracPart = value - wholes;
        if (fracPart < 0.001) return String(wholes);
        const increments = [
            [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
            [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞']
        ];
        let best = null, bestDiff = Infinity;
        for (const [v, ch] of increments) {
            const diff = Math.abs(fracPart - v);
            if (diff < bestDiff) { bestDiff = diff; best = ch; }
        }
        if (wholes === 0) return best;
        return `${wholes} ${best}`;
    }

    function formatAmountDisplay(value, unit) {
        if (value == null || isNaN(value)) return '';
        const u = String(unit || '').trim();
        if (/^cups?$/i.test(u)) {
            return `${toFractionString(value)} ${value <= 1 ? 'cup' : 'cups'}`;
        }
        const num = Math.round(value * 10) / 10;
        return `${String(num)} ${u}`.trim();
    }

    function slugify(name) {
        return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    }

    function splitAmount(value) {
        if (!value) return { num: '', unit: '' };
        const str = String(value).trim();
        const match = str.match(/^(\d*\.?\d+)\s*(.*)/);
        if (match) return { num: match[1], unit: match[2] };
        return { num: '', unit: str };
    }

    function composeAmount(num, unit) {
        num = (num || '').trim();
        unit = (unit || '').trim();
        if (!num) return '';
        return unit ? `${num} ${unit}` : num;
    }

    // --- Time helpers (compose/parse "1 hr 30 mins", "25 mins") ---
    function parseTimeToHM(timeStr) {
        const s = String(timeStr || '').toLowerCase();
        const h = s.match(/(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours)/);
        const m = s.match(/(\d+)\s*(?:min|mins|minute|minutes)/);
        return {
            hours: h ? Math.round(parseFloat(h[1])) : 0,
            mins: m ? parseInt(m[1], 10) : 0
        };
    }

    function composeTimeString(hours, mins) {
        hours = parseInt(hours, 10) || 0;
        mins = parseInt(mins, 10) || 0;
        if (hours === 0 && mins === 0) return '';
        const parts = [];
        if (hours > 0) parts.push(hours === 1 ? '1 hr' : `${hours} hrs`);
        if (mins > 0) parts.push(mins === 1 ? '1 min' : `${mins} mins`);
        return parts.join(' ');
    }

    // Mirror the website's filter semantics exactly (app.js). Time is parsed to
    // minutes so the CMS recipe/ingredient filters behave identically to the
    // public pages.
    function cmsParseTimeToMinutes(timeStr) {
        if (!timeStr) return null;
        const s = String(timeStr).toLowerCase();
        let total = 0;
        const hrMatch = s.match(/(\d+)\s*(?:hr|hrs|hour|hours)/);
        const minMatch = s.match(/(\d+)\s*(?:min|mins|minute|minutes)/);
        if (hrMatch) total += parseInt(hrMatch[1], 10) * 60;
        if (minMatch) total += parseInt(minMatch[1], 10);
        return total > 0 ? total : null;
    }

    function cmsGetStandardMacros(recipe) {
        if (!recipe) return null;
        if (recipe._cmsStdMacros !== undefined) return recipe._cmsStdMacros;
        if (!recipe.macros && typeof recipe.calories === 'undefined') {
            recipe._cmsStdMacros = null;
            return null;
        }
        const parseStr = (str) => {
            if (typeof str === 'number') return { num: str, unit: 'g' };
            if (!str) return { num: 0, unit: '' };
            const match = String(str).match(/^(\d*\.?\d+)\s*(.*)/);
            return match ? { num: parseFloat(match[1]), unit: match[2] } : { num: 0, unit: '' };
        };
        const e = recipe.macros ? parseStr(recipe.macros.energy) : { num: recipe.calories || 0, unit: 'kcal' };
        const c = recipe.macros ? parseStr(recipe.macros.carbohydrate) : { num: recipe.carbsG || 0, unit: 'g' };
        const p = recipe.macros ? parseStr(recipe.macros.protein) : { num: recipe.proteinG || 0, unit: 'g' };
        const f = recipe.macros ? parseStr(recipe.macros.fat) : { num: recipe.fatG || 0, unit: 'g' };
        const m = recipe.macros || {};
        const refType = m.macroReference?.type || 'per_serving';
        const refAmt = m.macroReference?.referenceAmount || '';
        let yieldNum = 1;
        if (m.yield) {
            const match = m.yield.match(/^(\d*\.?\d+)/);
            if (match) yieldNum = parseFloat(match[1]) || 1;
        }
        let divisor = 1;
        if (refType === 'total') divisor = yieldNum;
        else if (refType === 'per_x_g') { /* per-refAmount base, keep raw */ }
        const result = {
            normalized: {
                energy: e.num / divisor,
                carbs: c.num / divisor,
                protein: p.num / divisor,
                fat: f.num / divisor
            }
        };
        recipe._cmsStdMacros = result;
        return result;
    }

    function cmsGetRecipeTags(recipe) {
        const tags = [];
        const std = cmsGetStandardMacros(recipe);
        if (std) {
            const n = std.normalized;
            if (n.protein >= 20) tags.push('High Protein');
            if (n.carbs >= 20) tags.push('Carbs');
            if (n.fat >= 20) tags.push('High Fat');
            if (n.energy >= 500) tags.push('High Energy');
        }
        const minutes = cmsParseTimeToMinutes(recipe.time);
        if (minutes !== null && minutes <= 30) tags.push('Quick Meal');
        if (minutes !== null && minutes >= 60) tags.push('Long Cook');
        const cat = (recipe.category || '').toLowerCase();
        if (cat === 'seafood') tags.push('Seafood');
        if (cat === 'vegetable') tags.push('Vegetarian');
        if (cat === 'baking') tags.push('Baking');
        if (Array.isArray(recipe.tags)) {
            for (const t of recipe.tags) {
                if (t && !tags.includes(t)) tags.push(t);
            }
        }
        return tags;
    }

    function formatMoney(amount, currency) {
        const symbols = { MUR: 'Rs', LKR: 'Rs', NPR: 'Rs', PKR: 'Rs', USD: '$', CAD: '$', AUD: '$', SGD: '$', EUR: '€', GBP: '£', INR: '₹', BDT: '৳' };
        const sym = symbols[currency] || (currency ? currency + ' ' : '');
        const n = (amount || 0).toFixed(2);
        return sym + n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    // --- Shared household helpers (used by Household tab and Shopping list) ---
    function hhDaysBetween(from, to) {
        const ms = new Date(to) - new Date(from);
        return Math.max(0, Math.round(ms / 86400000));
    }

    function hhAddDays(dateStr, days) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return d.toISOString().split('T')[0];
    }

    function estimateDepletionDate(item) {
        if (!item || item.currentStock == null) return null;
        const avg = parseFloat(item.avgDurationDays) || 0;
        const stock = parseFloat(item.currentStock) || 0;
        if (avg <= 0 || stock <= 0) return null;
        const anchor = item.lastOpenedDate || new Date().toISOString().split('T')[0];
        const firstUnitEnd = hhAddDays(anchor, avg);
        return hhAddDays(firstUnitEnd, Math.max(0, stock - 1) * avg);
    }

    function getCategoryIcon(cat) {
        const c = (cat || '').toLowerCase();
        if (c.includes('seafood') || c.includes('fish') || c.includes('shell')) return { accent: 'var(--accent-sea)', href: '#icon-fish', vb: '0 0 158 73', w: 26, h: 13 };
        if (c.includes('vegetable') || c.includes('veg')) return { accent: 'var(--accent-veg)', href: '#icon-tomato', vb: '0 0 88 96', w: 22, h: 24 };
        if (c.includes('meat') || c.includes('poultry') || c.includes('lamb') || c.includes('beef') || c.includes('pork')) return { accent: 'var(--accent-meat)', href: '#icon-mortar', vb: '0 0 90 99', w: 20, h: 22 };
        if (c.includes('grain') || c.includes('pasta') || c.includes('bread') || c.includes('rice') || c.includes('stock')) return { accent: 'var(--accent-stock)', href: '#icon-nut', vb: '0 0 119 122', w: 24, h: 24 };
        if (c.includes('baking') || c.includes('dessert') || c.includes('sweet') || c.includes('pastry')) return { accent: 'var(--accent-bake)', href: '#icon-muffin', vb: '0 0 137 131', w: 26, h: 24 };
        if (c.includes('fruit') || c.includes('jam') || c.includes('jelly') || c.includes('pickle')) return { accent: 'var(--accent-jam)', href: '#icon-tomato', vb: '0 0 88 96', w: 22, h: 24 };
        return { accent: 'var(--accent-sea)', href: '#icon-fish', vb: '0 0 158 73', w: 26, h: 13 };
    }

    // Map a recipe category to its accent colour (mirrors app.js getCategoryAccent).
    function getCategoryAccent(cat) {
        const c = (cat || '').toLowerCase();
        if (c.includes('seafood') || c.includes('fish') || c.includes('shell')) return 'var(--accent-sea)';
        if (c.includes('vegetable') || c.includes('veg')) return 'var(--accent-veg)';
        if (c.includes('meat') || c.includes('poultry') || c.includes('lamb') || c.includes('beef') || c.includes('pork')) return 'var(--accent-meat)';
        if (c.includes('grain') || c.includes('pasta') || c.includes('bread') || c.includes('rice') || c.includes('stock')) return 'var(--accent-stock)';
        if (c.includes('baking') || c.includes('dessert') || c.includes('sweet') || c.includes('pastry')) return 'var(--accent-bake)';
        if (c.includes('fruit') || c.includes('jam') || c.includes('jelly') || c.includes('pickle')) return 'var(--accent-jam)';
        return 'var(--accent-sea)';
    }

    // --- Metric-to-imperial auto-calc ---
    // Grams per 1 US cup for common ingredients; used to convert volume/count
    // measurements to grams. Unknown foods fall back to water density (240 g/cup).
    function getGramsPerCup(name) {
        const n = String(name || '').toLowerCase();
        if (/(all.purpose|plain|bread|cake|pastry|tapioca|potato).*flour|flour/.test(n)) return 120;
        if (/(icing|powdered|confectioners?).*sugar|powdered/.test(n)) return 120;
        if (/brown sugar/.test(n)) return 220;
        if (/sugar/.test(n)) return 200;
        if (/butter|margarine/.test(n)) return 227;
        if (/oil/.test(n)) return 224;
        if (/(honey|syrup|molasses|golden syrup)/.test(n)) return 340;
        if (/peanut butter/.test(n)) return 258;
        if (/rice/.test(n)) return 185;
        if (/oats?/.test(n)) return 90;
        if (/breadcrumbs?|panko/.test(n)) return 115;
        if (/cocoa|chocolate chips?/.test(n)) return 170;
        if (/(milk|water|stock|cream|yogurt|buttermilk)/.test(n)) return 240;
        if (/cheese/.test(n)) return 100;
        if (/(almond|walnut|cashew|pecan|hazelnut|pistachio|peanut|nut)/.test(n)) return 140;
        if (/salt/.test(n)) return 290;
        return 240;
    }

    // Average weight (grams) of one unit of a common ingredient for the
    // count/size units (small, medium, large, cloves, slice, piece, whole,
    // sprigs, pinch, cans), so those convert to grams too.
    function getGramsPerUnit(name, unit) {
        const n = String(name || '').toLowerCase();
        const u = String(unit || '').toLowerCase();
        if (u === 'small' || u === 'medium' || u === 'large') {
            const sizes = {
                onion: { small: 100, medium: 150, large: 220 },
                lemon: { small: 60, medium: 90, large: 120 },
                tomato: { small: 75, medium: 120, large: 180 },
                apple: { small: 130, medium: 180, large: 230 },
                potato: { small: 120, medium: 175, large: 250 },
                carrot: { small: 40, medium: 60, large: 90 },
                pepper: { small: 90, medium: 130, large: 200 },
                egg: { small: 45, medium: 50, large: 60 },
                avocado: { small: 100, medium: 150, large: 200 },
                banana: { small: 100, medium: 120, large: 150 },
                cucumber: { small: 100, medium: 150, large: 220 },
                zucchini: { small: 100, medium: 150, large: 220 },
                aubergine: { small: 150, medium: 250, large: 400 },
                eggplant: { small: 150, medium: 250, large: 400 },
                mango: { small: 150, medium: 200, large: 300 },
                orange: { small: 120, medium: 150, large: 200 },
                peach: { small: 120, medium: 150, large: 180 },
                pear: { small: 120, medium: 170, large: 220 },
                garlic: { small: 3, medium: 5, large: 8 },
                chicken: { small: 100, medium: 150, large: 200 }
            };
            for (const [kw, perSize] of Object.entries(sizes)) {
                if (n.includes(kw)) return perSize[u];
            }
            return u === 'small' ? 75 : u === 'medium' ? 125 : 175;
        }
        if (u === 'cloves' || u === 'clove') return 4;
        if (u === 'slice') return 25;
        if (u === 'piece') return 100;
        if (u === 'whole') {
            if (n.includes('egg')) return 50;
            if (n.includes('lemon')) return 90;
            if (n.includes('onion')) return 150;
            return 150;
        }
        if (u === 'sprigs' || u === 'sprig') return 2;
        if (u === 'pinch') return 0.5;
        if (u === 'cans' || u === 'can') return 400;
        return null;
    }

    // Grams represented by one imperial unit for the given ingredient name.
    function imperialGramsFactor(name, unit) {
        const u = String(unit || '').toLowerCase();
        const gPerCup = getGramsPerCup(name);
        if (u === 'cups' || u === 'cup') return gPerCup;
        if (u === 'tbsp' || u === 'tablespoon' || u === 'tablespoons') return gPerCup / 16;
        if (u === 'tsp' || u === 'teaspoon' || u === 'teaspoons') return gPerCup / 48;
        return getGramsPerUnit(name, u);
    }

    // Parse an amount that may use decimals, unicode fractions or mixed numbers
    // (e.g. "½", "1 1/2"), since toFractionString writes those into the fields.
    function parseAmountValue(value) {
        if (!value) return NaN;
        let str = String(value).trim();
        const fracMap = { '½': ' 1/2', '⅓': ' 1/3', '⅔': ' 2/3', '¼': ' 1/4', '¾': ' 3/4', '⅛': ' 1/8', '⅜': ' 3/8', '⅝': ' 5/8', '⅞': ' 7/8' };
        for (const [ch, rep] of Object.entries(fracMap)) str = str.split(ch).join(rep);
        const match = str.match(/^(\d+(?:\s+\d+)?(?:\/\d+)?|\d*\.?\d+)/);
        if (!match) return NaN;
        const numPart = match[1];
        let num;
        if (/\s/.test(numPart) && numPart.includes('/')) {
            const [whole, frac] = numPart.split(/\s+/);
            const [n, d] = frac.split('/');
            num = parseFloat(whole) + parseFloat(n) / parseFloat(d);
        } else if (numPart.includes('/')) {
            const [n, d] = numPart.split('/');
            num = parseFloat(n) / parseFloat(d);
        } else {
            num = parseFloat(numPart);
        }
        return isNaN(num) ? NaN : num;
    }

    // Cup amounts render as a fraction rounded up to the nearest common fraction.
    function formatCups(value) {
        if (value == null || isNaN(value) || value <= 0) return '';
        const FRACS = [0, 1 / 8, 1 / 4, 1 / 3, 3 / 8, 1 / 2, 5 / 8, 2 / 3, 3 / 4, 7 / 8, 1];
        const whole = Math.floor(value + 1e-9);
        const frac = value - whole;
        let f = 0;
        for (const fr of FRACS) {
            if (fr >= frac - 1e-9) { f = fr; break; }
        }
        return toFractionString(whole + f);
    }

    // Ingredient amounts use 0 decimal places; sub-unit values keep 1 dp so a
    // pinch or half gram never collapses to "0".
    function formatCount(value) {
        if (!isFinite(value) || value <= 0) return '';
        const r = Math.round(value);
        return r >= 1 ? String(r) : String(Math.round(value * 10) / 10);
    }

    function formatMetricAmount(value) { return formatCount(value); }

    // Parse inline ingredient-link tokens (`[[foodId|Label]]`) inside instruction
    // text into safe segments: text runs and link tokens. A token only renders as
    // a link when its foodId resolves to an ingredient, so a literal `[[ foo ]]`
    // (contains a space, never matches), `[[[escaped]]]` (extra bracket, see the
    // negative lookbehind) or an unknown foodId stays plain text.
    function parseStepLinks(text) {
        const src = String(text || '');
        const re = /(?<!\[)\[\[([^\s\[\]|]+)(?:\|([^\]]+))?\]\]/g;
        const segments = [];
        let last = 0;
        let m;
        while ((m = re.exec(src)) !== null) {
            const foodId = m[1].trim();
            if (!foodId) continue;
            if (m.index > last) segments.push({ type: 'text', text: src.slice(last, m.index) });
            segments.push({ type: 'link', foodId, label: (m[2] || '').trim() || foodId });
            last = m.index + m[0].length;
        }
        if (last < src.length) segments.push({ type: 'text', text: src.slice(last) });
        return segments;
    }

    root.LarderCalcUtils = {
        MONTHS_SHORT,
        formatDateDMY,
        escapeHtml,
        toFractionString,
        formatAmountDisplay,
        slugify,
        splitAmount,
        composeAmount,
        parseTimeToHM,
        composeTimeString,
        cmsParseTimeToMinutes,
        cmsGetStandardMacros,
        cmsGetRecipeTags,
        formatMoney,
        hhDaysBetween,
        hhAddDays,
        estimateDepletionDate,
        getCategoryIcon,
        getCategoryAccent,
        getGramsPerCup,
        getGramsPerUnit,
        imperialGramsFactor,
        parseAmountValue,
        formatCups,
        formatCount,
        formatMetricAmount,
        parseStepLinks
    };
})(typeof self !== 'undefined' ? self : this);
