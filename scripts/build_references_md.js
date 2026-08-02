const fs = require('fs');
const path = require('path');

const ING_PATH = path.join('data', 'ingredients.json');
const RESULTS_DIR = path.join('scripts', '_batches', 'results');
const DOC_PATH = path.join('docs', 'ingredients_references.md');

const foods = JSON.parse(fs.readFileSync(ING_PATH, 'utf8'));
const byName = new Map(foods.map(f => [f.name, f]));

const files = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json')).sort();

// Rebuild per-batch data from original batch files for the "current" column (pre-change)
const BATCH_DIR = path.join('scripts', '_batches');
function parseBatchFile(n) {
    const p = path.join(BATCH_DIR, 'batch_' + n + '.txt');
    if (!fs.existsSync(p)) return null;
    const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
    return lines.map(l => {
        const m = l.match(/^\d+\.\s+(.+?)\s*\|\s*([\d.]+)\s*(\S+)\s*\|\s*cal\s*([\d.]+)\s*\|\s*p\s*([\d.]+)\s*\|\s*f\s*([\d.]+)\s*\|\s*c\s*([\d.]+)\s*\|\s*fiber\s*([\d.]+)\s*\|\s*sugar\s*([\d.]+)\s*\|\s*(.+)$/);
        if (!m) return null;
        return { name: m[1].trim(), serving: m[2] + ' ' + m[3], cal: +m[4], p: +m[5], f: +m[6], c: +m[7], fiber: +m[8], sugar: +m[9], cat: m[10].trim() };
    }).filter(Boolean);
}

// Collect batch numbers from result files
const resultMap = {};
files.forEach(f => {
    const n = f.replace('results_', '').replace('.json', '');
    resultMap[n] = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf8'));
});

let changes = 0;
const lines = [];
lines.push('# Larder Ingredient Database — Nutrition Verification Log', '');
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push('Verification performed against **USDA FoodData Central** (Foundation / SR Legacy) and USDA-derived nutrition references (NutritionValue.org, GetFoodFacts, MyFoodData, NutritionDataHub). Values are per the ingredient serving size in the database.', '');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push(`- Total ingredients in database: **${foods.length}**`);
lines.push(`- Ingredients verified (batches completed): **${Object.values(resultMap).reduce((s, r) => s + r.length, 0)}**`);
lines.push(`- Records updated by verification: see per-batch tables below.`, '');
lines.push('## Legend');
lines.push('- "Serving" is the DB serving size. Nutrition values in the tables are per that serving.');
lines.push('- A row is marked **UPDATED** when at least one value or category changed against the pre-verification DB state; otherwise **OK** (verified within ~10% or exact).', '');
lines.push('---', '');

for (const n of Object.keys(resultMap).sort((a, b) => +a - +b)) {
    const results = resultMap[n];
    const orig = parseBatchFile(n);
    lines.push(`## Batch ${n}`, '');
    lines.push('| # | Ingredient | Serving | USDA Source (FDC ID) | Calories | Protein g | Fat g | Carbs g | Fiber g | Sugar g | Category | Status |');
    lines.push('|---|-----------|---------|----------------------|----------|-----------|-------|---------|---------|---------|----------|--------|');
    results.forEach((r, idx) => {
        const o = orig && orig[idx];
        const changed = !!r.changed || (o && o.cat !== r.category);
        if (changed) changes++;
        const src = (r.source || '').replace(/\|/g, '/');
        const fdc = r.fdcId && r.fdcId !== 'n/a' ? ` ([FDC ${r.fdcId}](https://fdc.nal.usda.gov/food-details/${r.fdcId}/nutrients))` : '';
        const srcCell = `[${src.split('://')[1] || src}](<${src}>)${fdc}`;
        lines.push(`| ${idx + 1} | ${r.name} | ${r.servingSizeG} ${r.servingUnit} | ${srcCell} | ${r.calories} | ${r.proteinG} | ${r.fatG} | ${r.carbsG} | ${r.fiberG} | ${r.sugarG} | ${r.category} | ${changed ? '**UPDATED**' : 'OK'} |`);
    });
    lines.push('');
    lines.push('---', '');
}

lines.push('## Notes', '');
lines.push('- Category values were normalized to the app standard set: Grains, Vegetables, Meat, Protein, Dairy, Fruit, Nuts/Seeds, Legumes, Herbs, Spices, Condiments, Fats/Oils, Beverages, Desserts, Snacks, Other, Supplements, Noodles, Cereal.');
lines.push('- Data rows marked **UPDATED** reflect corrections applied to `data/ingredients.json`.');
lines.push('- Ingredients in batches not yet verified retain their existing database values.');
lines.push('');

fs.writeFileSync(DOC_PATH, lines.join('\n'), 'utf8');
console.log('Wrote ' + DOC_PATH + ' (' + lines.length + ' lines, ' + changes + ' updated rows)');
