document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('recipe-grid');
    const categoryFilters = document.getElementById('category-filters');
    const modal = document.getElementById('recipe-modal');
    const modalBody = document.getElementById('modal-body');
    const closeBtn = modal.querySelector('.close-btn');
    const modalContainer = document.getElementById('modal-container');
    const searchInput = document.getElementById('search-input');

    let recipesData = [];
    let currentCategory = 'All';
    let searchQuery = '';
    let currentRecipe = null;
    let currentScale = 1;

    // Load recipes — try API first, fallback to static
    function loadRecipes() {
        fetch('/api/recipes')
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(data => { recipesData = data; initUI(); })
            .catch(() => {
                fetch('data/recipes.json')
                    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
                    .then(data => { recipesData = data; initUI(); })
                    .catch(() => {
                        try {
                            const xhr = new XMLHttpRequest();
                            xhr.overrideMimeType('application/json');
                            xhr.open('GET', 'data/recipes.json', true);
                            xhr.onreadystatechange = function() {
                                if (xhr.readyState === 4 && (xhr.status === 200 || xhr.status === 0)) {
                                    try { recipesData = JSON.parse(xhr.responseText); initUI(); } catch(e) {}
                                }
                            };
                            xhr.send();
                        } catch(e) {
                            grid.innerHTML = `<div class="empty-state">Run <strong>node server.js</strong> to start.</div>`;
                        }
                    });
            });
    }

    loadRecipes();

    // --- Search functionality ---
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            renderGrid();
        });
    }

    // --- Macro Filters functionality ---
    const toggleMacroFiltersBtn = document.getElementById('toggle-macro-filters');
    const macroFiltersPanel = document.getElementById('macro-filters-panel');
    const resetFiltersBtn = document.getElementById('reset-filters');

    // Filter state: { min, max } for each macro (null = no filter)
    let macroFilters = {
        cal: { min: null, max: null },
        carbs: { min: null, max: null },
        protein: { min: null, max: null },
        fat: { min: null, max: null }
    };

    function getFilterEls(key) {
        return {
            min: document.getElementById(`filter-${key}-min`),
            max: document.getElementById(`filter-${key}-max`),
            display: document.getElementById(`filter-${key}-val`),
            track: document.getElementById(`track-${key}`)
        };
    }

    function updateFilterDisplay(key) {
        const els = getFilterEls(key);
        const f = macroFilters[key];
        const unit = key === 'cal' ? ' kcal' : 'g';
        
        let minV = parseInt(els.min.value);
        let maxV = parseInt(els.max.value);
        
        // Prevent thumbs crossing
        if (minV > maxV) {
            let tmp = minV;
            minV = maxV;
            maxV = tmp;
        }

        const maxAllowed = parseInt(els.max.max);
        const minAllowed = parseInt(els.min.min);

        // Update track visuals
        const percent1 = ((minV - minAllowed) / (maxAllowed - minAllowed)) * 100;
        const percent2 = ((maxV - minAllowed) / (maxAllowed - minAllowed)) * 100;
        els.track.style.left = percent1 + '%';
        els.track.style.width = (percent2 - percent1) + '%';

        f.min = minV > minAllowed ? minV : null;
        f.max = maxV < maxAllowed ? maxV : null;

        if (f.min !== null && f.max !== null) {
            els.display.textContent = `${f.min}${unit} – ${f.max}${unit}`;
        } else if (f.min !== null) {
            els.display.textContent = `≥ ${f.min}${unit}`;
        } else if (f.max !== null) {
            els.display.textContent = `≤ ${f.max}${unit}`;
        } else {
            els.display.textContent = 'Any';
        }
    }

    function setupFilterInput(key) {
        const els = getFilterEls(key);
        els.min.addEventListener('input', () => {
            updateFilterDisplay(key);
            renderGrid();
        });
        els.max.addEventListener('input', () => {
            updateFilterDisplay(key);
            renderGrid();
        });
        // Initial setup
        updateFilterDisplay(key);
    }

    if (toggleMacroFiltersBtn && macroFiltersPanel) {
        toggleMacroFiltersBtn.addEventListener('click', () => {
            macroFiltersPanel.classList.toggle('hidden');
            toggleMacroFiltersBtn.classList.toggle('active');
        });

        ['cal', 'carbs', 'protein', 'fat'].forEach(setupFilterInput);

        resetFiltersBtn.addEventListener('click', () => {
            ['cal', 'carbs', 'protein', 'fat'].forEach(key => {
                const els = getFilterEls(key);
                els.min.value = els.min.min;
                els.max.value = els.max.max;
                updateFilterDisplay(key);
            });
            renderGrid();
        });
    }

    function initUI() {
        if (recipesData.length === 0) {
            grid.innerHTML = `<div class="empty-state">No recipes. Go to Manage to add some.</div>`;
            return;
        }
        renderFilters();
        renderGrid();
    }

    function renderFilters() {
        const categories = ['All', ...new Set(recipesData.map(r => r.category || 'Other'))];
        categoryFilters.innerHTML = categories.map(cat => `
            <button class="filter-btn ${cat === currentCategory ? 'active' : ''}" data-category="${cat}">${cat}</button>
        `).join('');

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                currentCategory = btn.dataset.category;
                renderFilters();
                renderGrid();
            });
        });
    }

    function renderGrid() {
        let filtered = recipesData;
        
        if (currentCategory !== 'All') {
            filtered = filtered.filter(r => (r.category || 'Other') === currentCategory);
        }

        if (searchQuery) {
            filtered = filtered.filter(r => {
                const titleMatch = r.title.toLowerCase().includes(searchQuery);
                const descMatch = (r.description || '').toLowerCase().includes(searchQuery);
                const ingMatch = (r.ingredients || []).some(ing => ing.item.toLowerCase().includes(searchQuery));
                return titleMatch || descMatch || ingMatch;
            });
        }

        // Apply Macro Filters
        const hasAnyFilter = Object.values(macroFilters).some(f => f.min !== null || f.max !== null);
        if (hasAnyFilter) {
            filtered = filtered.filter(r => {
                const std = getStandardMacros(r);
                if (!std) return false;
                
                const check = (val, filter) => {
                    if (filter.min !== null && val < filter.min) return false;
                    if (filter.max !== null && val > filter.max) return false;
                    return true;
                };

                return check(std.normalized.energy, macroFilters.cal)
                    && check(std.normalized.carbs, macroFilters.carbs)
                    && check(std.normalized.protein, macroFilters.protein)
                    && check(std.normalized.fat, macroFilters.fat);
            });
        }

        if (filtered.length === 0) {
            grid.innerHTML = `<div class="empty-state">No recipes found matching your criteria.</div>`;
            return;
        }

        grid.innerHTML = filtered.map(recipe => {
            const theme = `theme-${recipe.category ? recipe.category.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ')[0] : 'default'}`;
            const yield_ = recipe.macros?.yield || '';
            const energy = recipe.macros?.energy || '';
            return `
            <div class="card ${theme}" data-id="${recipe.id}">
                <div class="card-img-wrapper">
                    <img src="${recipe.imageUrl}" alt="${recipe.title}" class="recipe-img" loading="lazy">
                </div>
                <div class="recipe-content">
                    <span class="recipe-category">${recipe.category || 'Recipe'}</span>
                    <h2 class="recipe-title">${recipe.title}</h2>
                    <p class="recipe-desc">${recipe.description}</p>
                    ${(yield_ || energy) ? `<div class="recipe-card-meta"><span>${yield_}</span><span>${energy}</span></div>` : ''}
                </div>
            </div>`;
        }).join('');

        document.querySelectorAll('.card').forEach(card => {
            card.addEventListener('click', () => openModal(card.dataset.id));
        });
    }

    // --- Scaler Helper ---
    function scaleAmount(amountStr, multiplier) {
        if (!amountStr) return '';
        if (multiplier === 1) return amountStr;
        
        let str = amountStr.trim();
        const fracMap = {'½':'0.5', '⅓':'0.333', '⅔':'0.666', '¼':'0.25', '¾':'0.75'};
        for (const [char, val] of Object.entries(fracMap)) {
            str = str.replace(char, val);
        }

        const match = str.match(/^(\d*\.?\d+)\s*(.*)/);
        if (match) {
            let num = parseFloat(match[1]);
            let rest = match[2];
            let scaled = num * multiplier;
            
            // Format nice decimal
            scaled = parseFloat(scaled.toFixed(2));
            return `${scaled} ${rest}`.trim();
        }
        return amountStr;
    }

    function renderIngredientsHTML(recipe, scale) {
        if (!recipe.ingredients || recipe.ingredients.length === 0) return '';
        
        let html = `
        <div class="ingredients-header">
            <h2>Ingredients</h2>
            <div class="scaler-controls">
                <button class="scaler-btn ${scale === 0.5 ? 'active' : ''}" data-scale="0.5">0.5x</button>
                <button class="scaler-btn ${scale === 1 ? 'active' : ''}" data-scale="1">1x</button>
                <button class="scaler-btn ${scale === 2 ? 'active' : ''}" data-scale="2">2x</button>
                <button class="scaler-btn ${scale === 3 ? 'active' : ''}" data-scale="3">3x</button>
            </div>
        </div>
        <div class="ingredients-grid">`;
        
        html += recipe.ingredients.map(ing => `
            <div class="ingredient-row">
                <span class="ingredient-name">${ing.item}</span>
                <span class="ingredient-amounts">
                    <span>${scaleAmount(ing.metric, scale)}</span>
                    <span>${scaleAmount(ing.imperial, scale)}</span>
                </span>
            </div>`).join('');
            
        html += '</div>';
        return html;
    }

    function openModal(id) {
        currentRecipe = recipesData.find(r => r.id === id);
        if (!currentRecipe) return;
        currentScale = 1;

        const recipe = currentRecipe;
        const themeClass = `theme-${recipe.category ? recipe.category.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ')[0] : 'default'}`;
        modalContainer.className = `modal-content ${themeClass}`;

        buildModalContent();

        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function getStandardMacros(recipe) {
        if (!recipe.macros) return null;
        let m = recipe.macros;
        let refType = m.macroReference?.type || 'per_serving';
        let refAmt = m.macroReference?.referenceAmount || '';

        let yieldNum = 1;
        if (m.yield) {
            let match = m.yield.match(/^(\d*\.?\d+)/);
            if (match) yieldNum = parseFloat(match[1]) || 1;
        }

        let parseStr = (str) => {
            if (!str) return { num: 0, unit: '' };
            let match = str.match(/^(\d*\.?\d+)\s*(.*)/);
            if (match) return { num: parseFloat(match[1]), unit: match[2] };
            return { num: 0, unit: '' };
        };

        let e = parseStr(m.energy);
        let c = parseStr(m.carbohydrate);
        let p = parseStr(m.protein);
        let f = parseStr(m.fat);

        let divisor = 1;
        let suffix = '';

        if (refType === 'per_serving') {
            divisor = 1;
            suffix = ' / serving';
        } else if (refType === 'total') {
            divisor = yieldNum;
            suffix = ' / serving';
        } else if (refType === 'per_100g') {
            divisor = 1;
            suffix = ' / 100g';
        } else if (refType === 'per_x_g') {
            divisor = 1;
            suffix = ` / ${refAmt}g`;
        }

        let calc = (val) => {
            if (val.num === 0 && !val.unit) return '-';
            let res = val.num / divisor;
            res = Math.round(res * 10) / 10;
            return `${res}${val.unit}`;
        };

        return {
            normalized: {
                energy: e.num / divisor,
                carbs: c.num / divisor,
                protein: p.num / divisor,
                fat: f.num / divisor
            },
            display: {
                energy: m.energy ? calc(e) : '-',
                carbs: m.carbohydrate ? calc(c) : '-',
                protein: m.protein ? calc(p) : '-',
                fat: m.fat ? calc(f) : '-'
            },
            referenceLabel: suffix.replace(' / ', '') // "serving", "100g", "50g"
        };
    }

    function buildModalContent() {
        const recipe = currentRecipe;

        let macrosHtml = '';
        let stdMacros = getStandardMacros(recipe);
        
        if (stdMacros && recipe.macros && (recipe.macros.yield || recipe.macros.energy)) {
            macrosHtml = `
            <div class="macros-bar">
                <div class="macros-item"><span class="macros-label">Yield</span><span class="macros-value">${recipe.macros.yield || '-'}</span></div>
                <div class="macros-divider"></div>
                <div class="macros-item"><span class="macros-label">Energy</span><span class="macros-value">${stdMacros.display.energy}</span></div>
                <div class="macros-divider"></div>
                <div class="macros-item"><span class="macros-label">Carbs</span><span class="macros-value">${stdMacros.display.carbs}</span></div>
                <div class="macros-divider"></div>
                <div class="macros-item"><span class="macros-label">Protein</span><span class="macros-value">${stdMacros.display.protein}</span></div>
                <div class="macros-divider"></div>
                <div class="macros-item"><span class="macros-label">Fat</span><span class="macros-value">${stdMacros.display.fat}</span></div>
            </div>
            <div class="macros-reference-badge">(Per ${stdMacros.referenceLabel})</div>`;
        }

        let ingredientsHtml = renderIngredientsHTML(recipe, currentScale);

        let stepsHtml = '';
        if (recipe.steps?.length > 0) {
            stepsHtml = '<h2>Instructions</h2><ul class="steps-list">' + recipe.steps.map((step, i) => `
                <li class="step-item">
                    <span class="step-number">${i + 1}</span>
                    <span class="step-text">${step}</span>
                </li>`).join('') + '</ul>';
        }

        let footerHtml = '';
        if (recipe.note || recipe.variations) {
            footerHtml = '<div class="recipe-footer">';
            if (recipe.note) footerHtml += `<div class="footer-block"><span class="footer-label">NOTE</span><span class="footer-text">${recipe.note}</span></div>`;
            if (recipe.variations) footerHtml += `<div class="footer-block"><span class="footer-label">VARIATIONS</span><span class="footer-text">${recipe.variations}</span></div>`;
            footerHtml += '</div>';
        }

        modalBody.innerHTML = `
            <div class="recipe-header">
                <h1>${recipe.title}</h1>
                <p>${recipe.description}</p>
            </div>
            ${macrosHtml}
            <div id="ingredients-wrapper">${ingredientsHtml}</div>
            ${stepsHtml}
            ${footerHtml}
        `;

        attachModalListeners();
    }

    function attachModalListeners() {
        // Scaler Listeners
        const wrapper = document.getElementById('ingredients-wrapper');
        if (wrapper) {
            wrapper.querySelectorAll('.scaler-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    currentScale = parseFloat(e.target.dataset.scale);
                    wrapper.innerHTML = renderIngredientsHTML(currentRecipe, currentScale);
                    attachModalListeners(); // Reattach after overwrite
                });
            });
        }

        // Focus Mode Listeners
        const stepsList = document.querySelector('.steps-list');
        if (stepsList) {
            stepsList.querySelectorAll('.step-item').forEach(item => {
                item.addEventListener('click', () => {
                    const wasFocused = item.classList.contains('focused');
                    
                    // Clear all focuses first
                    stepsList.querySelectorAll('.step-item').forEach(si => si.classList.remove('focused'));
                    
                    if (!wasFocused) {
                        item.classList.add('focused');
                        stepsList.classList.add('has-focus');
                    } else {
                        stepsList.classList.remove('has-focus');
                    }
                });
            });
        }
    }

    function closeModal() {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
});
