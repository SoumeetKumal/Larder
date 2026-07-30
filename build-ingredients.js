const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Change title
html = html.replace('<title>Larder</title>', '<title>Larder - Ingredients</title>');

// Change active nav state (remove btn-ghost from Ingredients or add style)
html = html.replace('href="ingredients" class="btn btn-ghost" style="padding: 0.5rem 1rem;"', 'href="ingredients" class="btn" style="padding: 0.5rem 1rem; background: var(--bg-surface-hover);"');

// Update recipe counts text to ingredient
html = html.replace('id="results-count">0 Recipes</span>', 'id="results-count">0 Ingredients</span>');
html = html.replace('Showing <strong>0</strong> recipes', 'Showing <strong>0</strong> ingredients');

fs.writeFileSync('ingredients.html', html);
console.log('Wrote ingredients.html');
