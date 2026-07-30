const fs = require('fs');

let appJs = fs.readFileSync('app.js', 'utf8');

// The original template in app.js for the recipes card
const oldCardHtmlStart = `<div class="card \${themeClass}" data-id="\${itemId}" role="listitem" tabindex="0" aria-label="View: \${title}">`;

// Find where this starts, and extract up to </div>\`;
const startIdx = appJs.indexOf(oldCardHtmlStart);
if (startIdx !== -1) {
    const endIdx = appJs.indexOf('</div>`;', startIdx);
    if (endIdx !== -1) {
        const oldCardTemplate = appJs.substring(startIdx, endIdx + 8);
        
        const newCardTemplate = `<div class="recipe-card \${themeClass}" data-id="\${itemId}" role="listitem" tabindex="0" aria-label="View: \${title}">
                <div class="recipe-image">
                    <div class="recipe-image-inner">
                        <img src="\${recipe.imageUrl || 'images/icon.png'}" alt="\${title}" loading="lazy" style="width: 100%; height: 100%; object-fit: \${recipe.imageUrl ? 'cover' : 'contain'}; \${!recipe.imageUrl ? 'padding: 2rem;' : ''}">
                    </div>
                </div>
                <div class="recipe-content">
                    <span class="recipe-category">\${recipe.category || 'Recipe'}</span>
                    <h3 class="recipe-title">\${title}</h3>
                    <p class="recipe-desc">\${recipe.description || ''}</p>
                    \${(yield_ || energy) ? \`<div class="recipe-meta">
                        \${yield_ ? \`<span class="recipe-meta-item"><i data-lucide="users" style="width: 14px; height: 14px;"></i> \${yield_}</span>\` : ''}
                        \${energy ? \`<span class="recipe-meta-item"><i data-lucide="flame" style="width: 14px; height: 14px;"></i> \${energy} kcal</span>\` : ''}
                    </div>\` : ''}
                </div>
            </div>\`;`;

        appJs = appJs.replace(oldCardTemplate, newCardTemplate);
        console.log('Replaced card HTML template.');
    }
}

appJs = appJs.replace("querySelectorAll('.card, .ingredient-card')", "querySelectorAll('.recipe-card, .ingredient-card')");
fs.writeFileSync('app.js', appJs);
console.log('Patched app.js');

let styles = fs.readFileSync('styles.css', 'utf8');
// Only remove justify-content: flex-end; from .filter-toolbar
styles = styles.replace(/\.filter-toolbar\s*\{[^}]+\}/g, (match) => {
    return match.replace(/justify-content:\s*flex-end;\s*/, '');
});

// Let's also remove any .card { ... } classes that are no longer used but might clash.
// Wait, actually it's fine.

fs.writeFileSync('styles.css', styles);
console.log('Patched styles.css');
