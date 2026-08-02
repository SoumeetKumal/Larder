const fs = require('fs');
const path = require('path');

const ING_PATH = path.join('data', 'ingredients.json');
const RESULTS_DIR = path.join('scripts', '_batches', 'results');
const DOC_PATH = path.join('docs', 'ingredients_references.md');

// Usage: node scripts/apply_ingredient_results.js [--dry]
const DRY = process.argv.includes('--dry');

const foods = JSON.parse(fs.readFileSync(ING_PATH, 'utf8'));
const idxById = new Map();
const idxByName = new Map();
foods.forEach((f, i) => {
    idxById.set(f.foodId || f.name, i);
    idxByName.set(f.name, i);
});

if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
const resultFiles = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json')).sort();

let changed = 0;
const appliedRows = [];

for (const file of resultFiles) {
    const results = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf8'));
    for (const r of results) {
        const key = r.foodId || r.name;
        let i = idxById.get(key);
        if (i === undefined) i = idxByName.get(r.name);
        if (i === undefined) {
            console.log(`WARN: no match for ${key} (${file})`);
            continue;
        }
        const cur = foods[i];
        const diffs = [];
        for (const k of ['name', 'servingSizeG', 'servingUnit', 'calories', 'proteinG', 'fatG', 'carbsG', 'fiberG', 'sugarG', 'category']) {
            if (r[k] !== undefined && cur[k] !== undefined && cur[k] !== r[k]) diffs.push(`${k}: ${cur[k]}→${r[k]}`);
        }
        if (r.foodId !== undefined && r.foodId !== cur.foodId) {
            // keep original foodId to preserve references
            r.foodId = cur.foodId;
        }
        let recChanged = false;
        for (const k of ['name', 'servingSizeG', 'servingUnit', 'calories', 'proteinG', 'fatG', 'carbsG', 'fiberG', 'sugarG', 'category']) {
            if (r[k] !== undefined && cur[k] !== r[k]) { cur[k] = r[k]; recChanged = true; }
        }
        if (recChanged) { changed++; appliedRows.push({ name: cur.name, diffs, source: r.source || '' }); }
    }
}

if (!DRY) {
    fs.writeFileSync(ING_PATH, JSON.stringify(foods, null, 2), 'utf8');
}
console.log(`Processed ${resultFiles.length} result files. Records changed: ${changed}`);
appliedRows.forEach(a => console.log(`  ${a.name}: ${a.diffs.join('; ')} | src: ${a.source}`));

// Append a verification log entry to the docs file
if (!DRY) {
    const log = [
        '',
        '## Verification update',
        `Date: ${new Date().toISOString()}`,
        `Records changed: ${changed}`,
        '',
    ];
    appliedRows.forEach(a => log.push(`- ${a.name}: ${a.diffs.join('; ')}${a.source ? ' (src: ' + a.source + ')' : ''}`));
    fs.appendFileSync(DOC_PATH, log.join('\n'), 'utf8');
    console.log('Appended log to ' + DOC_PATH);
}
