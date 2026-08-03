/**
 * Enrich Larder ingredient database with full USDA FoodData Central nutrient
 * profile (macros + micronutrients, incl. saturated/mono/poly-unsaturated fat,
 * cholesterol, fiber, sugars, sodium, vitamins, minerals).
 *
 * Usage: node scripts/enrich_nutrition.js <API_KEY> [--limit N] [--offset N] [--force]
 *
 *   API_KEY : free USDA FDC key (api.data.gov) — 1000+ req/hour
 *   --limit : only process first N ingredients (default: all)
 *   --offset: skip first N ingredients (for resuming batches)
 *   --force : re-fetch ingredients that already have a profile
 *
 * Strategy:
 *   - Reuse known FDC IDs from scripts/_batches/results/*.json when present.
 *   - Otherwise search FDC (Foundation + SR Legacy) and score descriptions.
 *   - Fetch /food/{fdcId} (131 nutrients), map by nutrient number, scale from
 *     per-100g to the ingredient's serving size.
 *   - Add missing fields only; existing curated values are preserved.
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.argv[2];
if (!API_KEY) { console.error('Usage: node scripts/enrich_nutrition.js <API_KEY> [--limit N] [--offset N] [--force]'); process.exit(1); }
if (/^DEMO_KEY$/i.test(API_KEY)) { console.error('DEMO_KEY is too slow for full enrichment — use a real api.data.gov key.'); process.exit(1); }

const FORCE = process.argv.includes('--force');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i > -1 ? parseInt(process.argv[i + 1], 10) : Infinity; })();
const OFFSET = (() => { const i = process.argv.indexOf('--offset'); return i > -1 ? parseInt(process.argv[i + 1], 10) : 0; })();

const ING_PATH = path.join('data', 'ingredients.json');
const RESULTS_DIR = path.join('scripts', '_batches', 'results');
const PROGRESS_PATH = path.join('scripts', '_batches', 'enrich_progress.json');

const API = 'https://api.nal.usda.gov/fdc/v1';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// nutrient number -> { field, unit, scaleFromPer100 }
const NUTRIENT_MAP = {
    208: { field: 'calories', unit: 'kcal', factor: 1 },
    203: { field: 'proteinG', unit: 'g', factor: 1 },
    204: { field: 'fatG', unit: 'g', factor: 1 },
    205: { field: 'carbsG', unit: 'g', factor: 1 },
    291: { field: 'fiberG', unit: 'g', factor: 1 },
    269: { field: 'sugarG', unit: 'g', factor: 1 },
    606: { field: 'saturatedFatG', unit: 'g', factor: 1 },
    645: { field: 'monounsaturatedFatG', unit: 'g', factor: 1 },
    646: { field: 'polyunsaturatedFatG', unit: 'g', factor: 1 },
    605: { field: 'transFatG', unit: 'g', factor: 1 },
    601: { field: 'cholesterolMg', unit: 'mg', factor: 1000 },
    307: { field: 'sodiumMg', unit: 'mg', factor: 1000 },
    306: { field: 'potassiumMg', unit: 'mg', factor: 1000 },
    301: { field: 'calciumMg', unit: 'mg', factor: 1000 },
    303: { field: 'ironMg', unit: 'mg', factor: 1000 },
    304: { field: 'magnesiumMg', unit: 'mg', factor: 1000 },
    305: { field: 'phosphorusMg', unit: 'mg', factor: 1000 },
    309: { field: 'zincMg', unit: 'mg', factor: 1000 },
    312: { field: 'copperMg', unit: 'mg', factor: 1000 },
    317: { field: 'seleniumMcg', unit: 'ug', factor: 1000 },
    320: { field: 'vitaminAMcg', unit: 'ug', factor: 1000 },
    401: { field: 'vitaminCMg', unit: 'mg', factor: 1000 },
    328: { field: 'vitaminDMcg', unit: 'ug', factor: 1000 },
    323: { field: 'vitaminEMg', unit: 'mg', factor: 1000 },
    430: { field: 'vitaminKMcg', unit: 'ug', factor: 1000 },
    404: { field: 'thiaminMg', unit: 'mg', factor: 1000 },
    405: { field: 'riboflavinMg', unit: 'mg', factor: 1000 },
    406: { field: 'niacinMg', unit: 'mg', factor: 1000 },
    410: { field: 'pantothenicMg', unit: 'mg', factor: 1000 },
    415: { field: 'vitaminB6Mg', unit: 'mg', factor: 1000 },
    417: { field: 'folateMcg', unit: 'ug', factor: 1000 },
    418: { field: 'vitaminB12Mcg', unit: 'ug', factor: 1000 },
};

// Read known fdcIds from prior verification batches
function loadKnownFdcIds() {
    const map = new Map();
    if (!fs.existsSync(RESULTS_DIR)) return map;
    for (const f of fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json'))) {
        try {
            const rs = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf8'));
            for (const r of rs) {
                if (r.fdcId && r.fdcId !== 'n/a') map.set(String(r.name).toLowerCase(), String(r.fdcId));
            }
        } catch (e) { /* skip bad file */ }
    }
    return map;
}

// Load partial progress if present (resume support)
function loadProgress() {
    if (!fs.existsSync(PROGRESS_PATH)) return {};
    try { return JSON.parse(fs.readFileSync(PROGRESS_PATH, 'utf8')); } catch (e) { return {}; }
}

function saveProgress(p) {
    fs.writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2), 'utf8');
}

async function fdcFetch(pathname) {
    for (let attempt = 0; attempt < 8; attempt++) {
        try {
            const res = await fetch(`${API}${pathname}${pathname.includes('?') ? '&' : '?'}api_key=${API_KEY}`);
            if (res.status === 429) {
                const delay = 30000 + attempt * 30000;
                console.log(`  rate-limited; sleeping ${Math.round(delay / 1000)}s`);
                await sleep(delay);
                continue;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            if (attempt === 7) throw e;
            await sleep(1500 + attempt * 1500);
        }
    }
    throw new Error('retries exhausted');
}

async function searchFdc(name) {
    const q = encodeURIComponent(String(name).replace(/[\/\\]/g, ' ').replace(/\s+/g, ' ').trim());
    const data = await fdcFetch(`/foods/search?query=${q}&dataType=Foundation,SR%20Legacy&pageSize=25`);
    return data.foods || [];
}

// Lightweight stemmer for plural forms ("Mussels" -> "mussel")
function stem(w) {
    let s = w;
    if (s.length <= 4) return s;
    if (s.endsWith('ies')) return s.slice(0, -3) + 'y';
    if (s.endsWith('es')) return s.slice(0, -2);
    if (s.endsWith('s')) return s.slice(0, -1);
    return s;
}

// Score how well a USDA description matches the ingredient name
function score(name, desc) {
    const a = String(name).toLowerCase().trim();
    const b = String(desc || '').toLowerCase();
    const aWords = a.split(/[^a-z0-9]+/).filter(w => w.length > 2);
    if (!aWords.length) return 0;
    // Penalise compound foods when the ingredient itself is simple.
    // Word boundaries prevent false triggers on substrings ("in" inside "includes").
    const compound = /\b(with|and|in|sauce|mix|blend|reduced|low fat|dressing|mayonnaise|spread|substitute|imitation|prepared|cooked|seasoned)\b/.test(b);
    let s = 0;
    if (b.includes(a)) s = 100 + (b.length === a.length ? 10 : 0);
    else {
        let hits = 0;
        for (const w of aWords) if (b.includes(w) || (w.length > 4 && b.includes(stem(w)))) hits++;
        s = Math.round((hits / aWords.length) * 80);
        for (const w of aWords) {
            if (b.startsWith(w) || (w.length > 4 && b.startsWith(stem(w)))) { s += 15; break; }
        }
    }
    if (compound && aWords.length <= 2) s = Math.max(0, s - 40);
    return s;
}

async function findBestMatch(name) {
    // FDC relevance search degrades on multi-word queries (e.g. "bacon, raw"
    // matches only "raw"), so fall back to a stripped core query and score the
    // combined candidates.
    const candidates = [];
    const collect = async (q) => {
        for (const f of await searchFdc(q)) {
            candidates.push({ f, s: score(name, f.description) });
        }
    };
    await collect(name);
    const core = String(name).replace(/,\s*(raw|fresh|dry|boiled|cooked|frozen|dried|canned)\s*$/i, '').trim();
    if (core && core !== String(name).trim()) await collect(core);
    candidates.sort((a, b) => b.s - a.s);
    const best = candidates[0];
    return best && best.s >= 50 ? { fdcId: String(best.f.fdcId), desc: best.f.description, score: best.s } : null;
}

// Fetch full nutrient profile for an fdcId and return per-100g values by field
async function fetchNutrients(fdcId) {
    const data = await fdcFetch(`/food/${fdcId}`);
    const per100 = {};
    for (const n of (data.foodNutrients || [])) {
        const num = n.nutrient?.number || n.nutrientNumber;
        if (!num) continue;
        const spec = NUTRIENT_MAP[String(num)];
        if (!spec) continue;
        const amt = typeof n.amount === 'number' ? n.amount : parseFloat(n.amount);
        if (isNaN(amt)) continue;
        per100[spec.field] = amt * spec.factor;
    }
    return per100;
}

function scaleToServing(per100, servingG) {
    const factor = (servingG || 100) / 100;
    const out = {};
    for (const [field, v] of Object.entries(per100)) {
        out[field] = Math.round(v * factor * 100) / 100;
    }
    return out;
}

(async () => {
    const foods = JSON.parse(fs.readFileSync(ING_PATH, 'utf8'));
    const known = loadKnownFdcIds();
    const progress = loadProgress();

    const slice = foods.slice(OFFSET, OFFSET + LIMIT);
    let ok = 0, skipped = 0, failed = 0;

    for (let i = 0; i < slice.length; i++) {
        const ing = slice[i];
        const globalIdx = OFFSET + i;
        const label = `[${globalIdx + 1}/${foods.length}] ${ing.name}`;

        if (progress[ing.foodId || ing.name] && !FORCE) {
            console.log(`${label} — cached`);
            continue;
        }

        try {
            // Determine FDC id
            let fdcId = null;
            if (!ing.fdcId) {
                const k = known.get(String(ing.name).toLowerCase());
                if (k) fdcId = k;
            } else if (ing.fdcId !== 'n/a') {
                fdcId = ing.fdcId;
            }

            if (!fdcId) {
                const m = await findBestMatch(ing.name);
                if (m) { fdcId = m.fdcId; ing.fdcId = m.fdcId; ing.fdcDesc = m.desc; }
            }

            if (!fdcId) {
                skipped++;
                progress[ing.foodId || ing.name] = { status: 'no-match' };
                console.log(`${label} — no USDA match`);
                continue;
            }

            // If a known/stored fdcId no longer resolves (404), fall back to search
            let per100;
            try {
                per100 = await fetchNutrients(fdcId);
            } catch (e) {
                if (/404/.test(String(e.message)) || /HTTP 404/.test(String(e.message))) {
                    console.log(`  fdcId ${fdcId} 404 — re-searching`);
                    delete ing.fdcId;
                    const m = await findBestMatch(ing.name);
                    if (m) { fdcId = m.fdcId; ing.fdcId = m.fdcId; ing.fdcDesc = m.desc; per100 = await fetchNutrients(fdcId); }
                    else { throw e; }
                } else {
                    throw e;
                }
            }
            if (!Object.keys(per100).length) {
                skipped++;
                progress[ing.foodId || ing.name] = { status: 'no-data', fdcId };
                console.log(`${label} — no nutrient data`);
                continue;
            }

            const scaled = scaleToServing(per100, ing.servingSizeG);
            ing.fdcId = fdcId;
            ing.fdcDesc = ing.fdcDesc || '';
            // Add missing fields only — preserve curated values
            for (const [field, v] of Object.entries(scaled)) {
                const existing = ing[field];
                const hasExisting = existing !== undefined && existing !== null && existing !== '';
                if (!hasExisting) ing[field] = v;
            }
            progress[ing.foodId || ing.name] = { status: 'ok', fdcId };
            ok++;
            console.log(`${label} — OK (${fdcId})`);
        } catch (e) {
            failed++;
            progress[ing.foodId || ing.name] = { status: 'error', error: String(e.message) };
            console.log(`${label} — ERROR ${e.message}`);
            if (failed > 40) {
                console.error('Too many consecutive failures — aborting.');
                break;
            }
        }

        // Save every 10 ingredients
        if ((i + 1) % 10 === 0) {
            fs.writeFileSync(ING_PATH, JSON.stringify(foods, null, 2), 'utf8');
            saveProgress(progress);
            console.log(`  → saved progress (${i + 1}/${slice.length})`);
        }
        await sleep(120);
    }

    fs.writeFileSync(ING_PATH, JSON.stringify(foods, null, 2), 'utf8');
    saveProgress(progress);
    console.log(`\nDone. ok=${ok} no-match=${skipped} failed=${failed}`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
