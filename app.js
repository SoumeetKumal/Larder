document.addEventListener('DOMContentLoaded', () => {
    // --- Theme Logic ---
    const htmlTag = document.documentElement;
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');
    const themeText = document.getElementById('themeText');

    function setTheme(theme) {
        htmlTag.setAttribute('data-theme', theme);
        localStorage.setItem('larder_theme', theme);
        if (themeIcon) {
            themeIcon.innerHTML = theme === 'dark' ? '<i data-lucide="sun" style="width: 18px; height: 18px;"></i>' : '<i data-lucide="moon" style="width: 18px; height: 18px;"></i>';
            if (window.lucide) window.lucide.createIcons();
        }
        if (themeText) {
            themeText.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
        }
    }

    const savedTheme = localStorage.getItem('larder_theme');
    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(prefersDark ? 'dark' : 'light');
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = htmlTag.getAttribute('data-theme');
            setTheme(currentTheme === 'dark' ? 'light' : 'dark');
        });
    }

    // --- Search & Filter UI Toggles ---
    const searchTrigger = document.getElementById('searchTrigger');
    const searchBarWrap = document.getElementById('searchBarWrap');
    const searchClose = document.getElementById('searchClose');
    const searchInput = document.getElementById('search-input');
    
    if (searchTrigger) {
        searchTrigger.addEventListener('click', () => {
            searchBarWrap.classList.add('active');
            searchInput.focus();
        });
    }
    if (searchClose) {
        searchClose.addEventListener('click', () => {
            searchBarWrap.classList.remove('active');
            searchInput.value = '';
            searchQuery = '';
            renderGrid();
        });
    }

    const filterTrigger = document.getElementById('filterTrigger');
    const filterDropdown = document.getElementById('filterDropdown');
    const filterReset = document.getElementById('filterReset');
    const filterBadge = document.getElementById('filterBadge');
    
    if (filterTrigger && filterDropdown) {
        filterTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            filterDropdown.classList.toggle('active');
            filterTrigger.classList.toggle('active');
        });
        document.addEventListener('click', (e) => {
            if (!filterDropdown.contains(e.target) && !filterTrigger.contains(e.target)) {
                filterDropdown.classList.remove('active');
                filterTrigger.classList.remove('active');
            }
        });
        filterDropdown.addEventListener('click', (e) => e.stopPropagation());
    }

    const grid = document.getElementById('recipe-grid');
    const categoryFilters = document.getElementById('category-filters');
    const modal = document.getElementById('recipe-modal');
    const modalBody = document.getElementById('modal-body');
    const closeBtn = document.getElementById('modal-close');
    const modalContainer = document.getElementById('modal-container');
    const resultsCount = document.getElementById('results-count');

    let recipesData = [];
    let currentCategory = 'All';
    let searchQuery = '';
    let currentRecipe = null;
    let currentScale = 1;
    
    const isIngredientsPage = window.location.pathname.includes('ingredients');

    // --- Pagination ---
    let currentPage = 1;
    let itemsPerPage = 20;
    const itemsPerPageSelect = document.getElementById('itemsPerPage');
    const pagePrev = document.getElementById('page-prev');
    const pageNext = document.getElementById('page-next');
    const paginationNumbers = document.getElementById('pagination-numbers');
    const paginationInfo = document.getElementById('pagination-info');

    if (itemsPerPageSelect) {
        itemsPerPageSelect.addEventListener('change', (e) => {
            itemsPerPage = parseInt(e.target.value);
            currentPage = 1;
            renderGrid();
        });
    }

    if (pagePrev) {
        pagePrev.addEventListener('click', () => {
            if (currentPage > 1) { currentPage--; renderGrid(); }
        });
    }

    if (pageNext) {
        pageNext.addEventListener('click', () => {
            currentPage++; renderGrid();
        });
    }

    // Load data
    function loadRecipes() {
        const endpoint = isIngredientsPage ? '/api/ingredients' : '/api/recipes';
        const fallbackFile = isIngredientsPage ? 'data/ingredients.json' : 'data/recipes.json';
        const headers = { 'Authorization': 'Bearer larder_local_sync_8f92k' };
        
        fetch(endpoint, { headers })
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(data => { recipesData = data; initUI(); })
            .catch(() => {
                fetch(fallbackFile)
                    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
                    .then(data => { recipesData = data; initUI(); })
                    .catch(() => {
                        try {
                            const xhr = new XMLHttpRequest();
                            xhr.overrideMimeType('application/json');
                            xhr.open('GET', fallbackFile, true);
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

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase();
            currentPage = 1;
            renderGrid();
        });
    }

    // --- Macro Filters functionality ---
    let macroFilters = {
        cal: { min: null, max: null },
        carbs: { min: null, max: null },
        protein: { min: null, max: null },
        fat: { min: null, max: null }
    };

    const sliderConfigs = {
        cal: { min: 0, max: 2000, step: 50 },
        carbs: { min: 0, max: 200, step: 5 },
        protein: { min: 0, max: 150, step: 5 },
        fat: { min: 0, max: 150, step: 5 }
    };

    function updateMacroBadge() {
        let count = 0;
        if (currentCategory !== 'All') count++;
        Object.keys(macroFilters).forEach(k => {
            if (macroFilters[k].min !== null || macroFilters[k].max !== null) count++;
        });
        if (filterBadge) {
            filterBadge.textContent = count;
            filterBadge.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    function initDualSliders() {
        Object.keys(sliderConfigs).forEach(key => {
            const config = sliderConfigs[key];
            const minInput = document.getElementById(`slider-${key}-min`);
            const maxInput = document.getElementById(`slider-${key}-max`);
            const fill = document.getElementById(`slider-${key}-fill`);
            const valDisplay = document.getElementById(`filter-${key}-val`);

            if (!minInput || !maxInput) return;

            function updateSlider() {
                let minVal = parseFloat(minInput.value);
                let maxVal = parseFloat(maxInput.value);

                if (minVal > maxVal) {
                    // prevent cross
                    const tmp = minVal;
                    minVal = maxVal;
                    maxVal = tmp;
                }

                const minPercent = (minVal / config.max) * 100;
                const maxPercent = (maxVal / config.max) * 100;

                fill.style.left = `${minPercent}%`;
                fill.style.width = `${maxPercent - minPercent}%`;

                // update display and filter state
                const isMinModified = minVal > config.min;
                const isMaxModified = maxVal < config.max;

                macroFilters[key].min = isMinModified ? minVal : null;
                macroFilters[key].max = isMaxModified ? maxVal : null;

                const unit = key === 'cal' ? ' kcal' : 'g';
                
                if (isMinModified && isMaxModified) {
                    valDisplay.textContent = `${minVal}${unit} – ${maxVal}${unit}`;
                } else if (isMinModified) {
                    valDisplay.textContent = `≥ ${minVal}${unit}`;
                } else if (isMaxModified) {
                    valDisplay.textContent = `≤ ${maxVal}${unit}`;
                } else {
                    valDisplay.textContent = 'Any';
                }

                updateMacroBadge();
                currentPage = 1;
                renderGrid();
            }

            minInput.addEventListener('input', updateSlider);
            maxInput.addEventListener('input', updateSlider);
        });
    }

    initDualSliders();

    if (filterReset) {
        filterReset.addEventListener('click', () => {
            Object.keys(sliderConfigs).forEach(key => {
                const config = sliderConfigs[key];
                const minInput = document.getElementById(`slider-${key}-min`);
                const maxInput = document.getElementById(`slider-${key}-max`);
                if (minInput) minInput.value = config.min;
                if (maxInput) maxInput.value = config.max;
                
                const fill = document.getElementById(`slider-${key}-fill`);
                if (fill) {
                    fill.style.left = '0%';
                    fill.style.width = '100%';
                }
                const valDisplay = document.getElementById(`filter-${key}-val`);
                if (valDisplay) valDisplay.textContent = 'Any';
                
                macroFilters[key].min = null;
                macroFilters[key].max = null;
            });
            currentCategory = 'All';
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            const firstChip = document.querySelector('.filter-chip[data-category="All"]');
            if (firstChip) firstChip.classList.add('active');
            updateMacroBadge();
            currentPage = 1;
            renderGrid();
        });
    }

    function initUI() {
        if (!grid) return;
        if (recipesData.length === 0) {
            grid.innerHTML = `<div class="empty-state">No recipes. Go to Manage to add some.</div>`;
            return;
        }
        renderFilters();
        renderGrid();
    }

    function renderFilters() {
        if (!categoryFilters) return;
        const relevantRecipes = isIngredientsPage 
            ? recipesData 
            : recipesData.filter(r => r.entryType !== 'ingredient');
            
        const categories = ['All', ...new Set(relevantRecipes.map(r => r.category || 'Other'))];
        categoryFilters.innerHTML = categories.map(cat => {
            let iconStr = '';
            if (cat.toLowerCase() === 'seafood') iconStr = '<svg class="vector-icon" viewBox="0 0 158 73" style="width: 14px; height: 7px; fill: currentColor;"><use href="#icon-fish"></use></svg> ';
            else if (cat.toLowerCase() === 'vegetable') iconStr = '<svg class="vector-icon" viewBox="0 0 88 96" style="width: 11px; height: 12px; fill: currentColor;"><use href="#icon-tomato"></use></svg> ';
            else if (cat.toLowerCase() === 'baking') iconStr = '<svg class="vector-icon" viewBox="0 0 137 131" style="width: 13px; height: 12px; fill: currentColor;"><use href="#icon-muffin"></use></svg> ';
            
            return `<button class="filter-chip ${cat === currentCategory ? 'active' : ''}" data-category="${cat}">${iconStr}${cat}</button>`;
        }).join('');

        document.querySelectorAll('.filter-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                currentCategory = btn.dataset.category;
                updateMacroBadge();
                currentPage = 1;
                renderGrid();
            });
        });
    }

    function renderGrid() {
        let filtered = recipesData;
        
        if (!isIngredientsPage) {
            if (!searchQuery) {
                filtered = filtered.filter(r => r.entryType !== 'ingredient');
            }
        }
        
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

        if (resultsCount) {
            resultsCount.textContent = `${filtered.length} ${isIngredientsPage ? 'Ingredients' : 'Recipes'}`;
        }

        // Pagination
        const totalItems = filtered.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
        
        if (paginationInfo) {
            if (totalItems === 0) {
                paginationInfo.innerHTML = `Showing <strong>0</strong> ${isIngredientsPage ? 'ingredients' : 'recipes'}`;
            } else {
                paginationInfo.innerHTML = `Showing <strong>${startIndex + 1} – ${endIndex}</strong> of <strong>${totalItems}</strong> ${isIngredientsPage ? 'ingredients' : 'recipes'}`;
            }
        }

        if (pagePrev) pagePrev.disabled = currentPage === 1;
        if (pageNext) pageNext.disabled = currentPage === totalPages;

        if (paginationNumbers) {
            let pagesHtml = '';
            for (let i = 1; i <= totalPages; i++) {
                // simple pagination: show max 5 buttons (e.g. 1 2 3 4 5)
                if (totalPages > 5) {
                    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
                        pagesHtml += `<button class="page-num ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
                    } else if (i === currentPage - 2 || i === currentPage + 2) {
                        pagesHtml += `<span style="padding: 0 0.5rem;">...</span>`;
                    }
                } else {
                    pagesHtml += `<button class="page-num ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
                }
            }
            paginationNumbers.innerHTML = pagesHtml;
            paginationNumbers.querySelectorAll('.page-num').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    currentPage = parseInt(e.target.dataset.page);
                    renderGrid();
                });
            });
        }

        const paginatedData = filtered.slice(startIndex, endIndex);

        if (paginatedData.length === 0) {
            grid.innerHTML = `<div class="empty-state">No matching items found.</div>`;
            return;
        }

        grid.innerHTML = paginatedData.map(recipe => {
            const title = recipe.title || recipe.name || 'Unknown';
            const themeClass = `theme-${recipe.category ? recipe.category.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ')[0] : 'default'}`;
            const yield_ = recipe.macros?.yield || '';
            const energy = recipe.macros?.energy || recipe.calories || '';
            const itemId = recipe.id || recipe.foodId;
            
            if (isIngredientsPage || recipe.entryType === 'ingredient') {
                return `
                <div class="ingredient-card" data-id="${itemId}" role="listitem" tabindex="0">
                    <div class="ingredient-card-visual" style="background: var(--surface-hover);">
                        <img src="${recipe.imageUrl || 'images/icon.png'}" style="width:100%;height:100%;object-fit:cover;">
                    </div>
                    <div class="ingredient-card-body">
                        <span class="ingredient-card-category" style="color: var(--accent);">${recipe.category || 'Ingredient'}</span>
                        <h3 class="ingredient-card-name">${title}</h3>
                        <div class="ingredient-card-macros">
                            <span class="macro-pill macro-cal">${energy || '-'} kcal</span>
                            <span class="macro-pill macro-pro">${recipe.proteinG || '-'}g P</span>
                            <span class="macro-pill macro-fat">${recipe.fatG || '-'}g F</span>
                        </div>
                    </div>
                </div>`;
            }

            return `
            <div class="card ${themeClass}" data-id="${itemId}" role="listitem" tabindex="0" aria-label="View: ${title}">
                <div class="card-img-wrapper">
                    <img src="${recipe.imageUrl || 'images/icon.png'}" alt="${title}" class="recipe-img${!recipe.imageUrl ? ' logo-placeholder' : ''}" loading="lazy" style="${!recipe.imageUrl ? 'object-fit: contain; padding: 2rem;' : ''}">
                </div>
                <div class="recipe-content">
                    <span class="recipe-category">${recipe.category || 'Recipe'}</span>
                    <h2 class="recipe-title">${title}</h2>
                    <p class="recipe-desc">${recipe.description || ''}</p>
                    ${(yield_ || energy) ? `<div class="recipe-card-meta"><span><i data-lucide="users" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:4px;"></i>${yield_}</span><span><i data-lucide="flame" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;margin-right:4px;"></i>${energy} kcal</span></div>` : ''}
                </div>
            </div>`;
        }).join('');

        if (window.lucide) window.lucide.createIcons();

        document.querySelectorAll('.card, .ingredient-card').forEach(card => {
            card.addEventListener('click', () => openModal(card.dataset.id));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openModal(card.dataset.id);
                }
            });
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
            
            scaled = parseFloat(scaled.toFixed(2));
            return `${scaled} ${rest}`.trim();
        }
        return amountStr;
    }

    function renderIngredientsHTML(recipe, scale) {
        if (!recipe.ingredients || recipe.ingredients.length === 0) return '';
        
        let html = '<table class="nm-recipe-table"><colgroup><col style="width: 50%"><col style="width: 50%"></colgroup>';
        
        html += recipe.ingredients.map(ing => {
            if (ing.item.startsWith('## ')) {
                return `<tr><td colspan="2" style="border-bottom: none;"><h4 class="nm-component-header">${ing.item.substring(3)}</h4></td></tr>`;
            }

            const profile = recipesData.find(r => r.entryType === 'ingredient' && ing.item.toLowerCase().includes(r.title.toLowerCase()));
            const itemNameHtml = profile 
                ? `<button class="ingredient-link" data-id="${profile.id}" style="background:none;border:none;padding:0;color:var(--text-primary);font-weight:500;font-family:inherit;font-size:inherit;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text-primary)'">${ing.item}</button>`
                : `<span style="padding-right: 5px;">${ing.item}</span>`;

            let amountStr = '';
            let met = scaleAmount(ing.metric, scale);
            let imp = scaleAmount(ing.imperial, scale);
            if (met && imp) amountStr = `${met} (${imp})`;
            else if (met) amountStr = met;
            else if (imp) amountStr = imp;

            return `
            <tr>
                <td>${itemNameHtml}</td>
                <td>${amountStr}</td>
            </tr>`;
        }).join('');
            
        html += '</table>';
        return html;
    }

    let lastFocusedElement = null;

    function openModal(id) {
        lastFocusedElement = document.activeElement;
        currentRecipe = recipesData.find(r => (r.id === id || r.foodId === id));
        if (!currentRecipe) return;
        currentScale = 1;

        const recipe = currentRecipe;
        const themeClass = `theme-${recipe.category ? recipe.category.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ')[0] : 'default'}`;
        modalContainer.className = `modal-content new-modal ${themeClass}`;

        buildModalContent();

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (closeBtn) closeBtn.focus();
        
        if (window.lucide) window.lucide.createIcons();
    }

    function getStandardMacros(recipe) {
        if (!recipe.macros && typeof recipe.calories === 'undefined') return null;
        
        let parseStr = (str) => {
            if (typeof str === 'number') return { num: str, unit: 'g' };
            if (!str) return { num: 0, unit: '' };
            let match = String(str).match(/^(\d*\.?\d+)\s*(.*)/);
            if (match) return { num: parseFloat(match[1]), unit: match[2] };
            return { num: 0, unit: '' };
        };

        let e = recipe.macros ? parseStr(recipe.macros.energy) : { num: recipe.calories || 0, unit: 'kcal' };
        let c = recipe.macros ? parseStr(recipe.macros.carbohydrate) : { num: recipe.carbsG || 0, unit: 'g' };
        let p = recipe.macros ? parseStr(recipe.macros.protein) : { num: recipe.proteinG || 0, unit: 'g' };
        let f = recipe.macros ? parseStr(recipe.macros.fat) : { num: recipe.fatG || 0, unit: 'g' };

        let m = recipe.macros || {};
        let refType = m.macroReference?.type || 'per_serving';
        let refAmt = m.macroReference?.referenceAmount || '';

        let yieldNum = 1;
        if (m.yield) {
            let match = m.yield.match(/^(\d*\.?\d+)/);
            if (match) yieldNum = parseFloat(match[1]) || 1;
        }

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
            referenceLabel: suffix.replace(' / ', '')
        };
    }

    function buildModalContent() {
        const recipe = currentRecipe;

        if (isIngredientsPage || recipe.entryType === 'ingredient') {
            const title = recipe.name || recipe.title;
            const details = recipe.ingredientDetails || {};
            
            modalBody.innerHTML = `
                <div class="recipe-header" style="padding: 2rem;">
                    <h1 id="modal-title">${title}</h1>
                    <p style="color: var(--text-muted); margin-top:0.5rem;">${recipe.description || ''}</p>
                </div>
                
                <div class="macros-bar" style="margin: 0 2rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                    <div class="macros-item"><span class="macros-label">Serving</span><span class="macros-value">${recipe.servingSizeG || 100}${recipe.servingUnit || 'g'}</span></div>
                    <div class="macros-divider"></div>
                    <div class="macros-item"><span class="macros-label">Energy</span><span class="macros-value">${recipe.calories || '-'} kcal</span></div>
                    <div class="macros-divider"></div>
                    <div class="macros-item"><span class="macros-label">Carbs</span><span class="macros-value">${recipe.carbsG || '-'}g</span></div>
                    <div class="macros-divider"></div>
                    <div class="macros-item"><span class="macros-label">Protein</span><span class="macros-value">${recipe.proteinG || '-'}g</span></div>
                    <div class="macros-divider"></div>
                    <div class="macros-item"><span class="macros-label">Fat</span><span class="macros-value">${recipe.fatG || '-'}g</span></div>
                </div>

                <div class="ingredient-details-grid" style="display: grid; gap: 1.5rem; margin: 2.5rem 2rem; border-top: 1px solid var(--border-color); padding-top: 2rem;">
                    ${details.storage ? `<div><h2 style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.2rem; text-transform:uppercase; letter-spacing:0.05em;">Storage</h2><p style="font-size: 0.95rem; margin: 0;">${details.storage}</p></div>` : ''}
                    ${details.flavour ? `<div><h2 style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.2rem; text-transform:uppercase; letter-spacing:0.05em;">Flavour Profile</h2><p style="font-size: 0.95rem; margin: 0;">${details.flavour}</p></div>` : ''}
                    ${details.pairings ? `<div><h2 style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.2rem; text-transform:uppercase; letter-spacing:0.05em;">Pairings</h2><p style="font-size: 0.95rem; margin: 0;">${details.pairings}</p></div>` : ''}
                    ${details.varieties ? `<div><h2 style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.2rem; text-transform:uppercase; letter-spacing:0.05em;">Varieties / Types</h2><p style="font-size: 0.95rem; margin: 0;">${details.varieties}</p></div>` : ''}
                    ${details.preparations ? `<div><h2 style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.2rem; text-transform:uppercase; letter-spacing:0.05em;">Preparations</h2><p style="font-size: 0.95rem; margin: 0;">${details.preparations}</p></div>` : ''}
                </div>
            `;

            attachModalListeners();
            return;
        }

        let stdMacros = getStandardMacros(recipe);
        let ingredientsHtml = renderIngredientsHTML(recipe, currentScale);

        let stepsHtml = '';
        if (recipe.steps?.length > 0) {
            let stepNum = 1;
            stepsHtml = recipe.steps.map((step) => {
                if (step.startsWith('## ')) {
                    stepNum = 1;
                    return `<h4 class="nm-component-header">${step.substring(3)}</h4>`;
                }
                const html = `
                <div class="nm-step">
                    <div class="nm-step-number">${stepNum}</div>
                    <p>${step}</p>
                </div>`;
                stepNum++;
                return html;
            }).join('');
        }

        let footerHtml = '';
        if (recipe.note || recipe.variations) {
            footerHtml = '<div class="nm-footer">';
            if (recipe.note) footerHtml += `<div style="flex:1"><div class="nm-footer-label">NOTE</div><div class="nm-footer-text">${recipe.note}</div></div>`;
            if (recipe.variations) footerHtml += `<div style="flex:1"><div class="nm-footer-label">VARIATIONS</div><div class="nm-footer-text">${recipe.variations}</div></div>`;
            footerHtml += '</div>';
        }

        const iconTag = recipe.iconTag || 'icon-fish';

        modalBody.innerHTML = `
            <div class="nm-header">
                <div class="nm-actions no-print" style="margin-bottom:1rem; display:flex; justify-content:flex-end; gap:0.5rem;">
                    <button class="btn btn-ghost" onclick="window.print()" aria-label="Print Recipe" style="padding:0.5rem; display:flex; align-items:center; gap:0.25rem;">
                        <i data-lucide="printer" style="width:16px;height:16px;"></i> Print
                    </button>
                </div>
                <h1 class="nm-title">${recipe.title}</h1>
                <p class="nm-desc">${recipe.description || ''}</p>
            </div>

            <div class="nm-body">
                <div class="nm-left">
                    <div class="nm-section-pill">
                        <i data-lucide="list" style="width:16px;height:16px;"></i>
                        Ingredients
                    </div>
                    <div id="ingredients-wrapper">${ingredientsHtml}</div>
                </div>
                
                <div class="nm-right">
                    <div class="nm-stat-block">
                        <div class="nm-stat-title">Stats</div>
                        <div class="nm-stat-group" style="flex:1; justify-content: space-around;">
                            <div class="nm-stat-item">
                                <span class="nm-stat-label">Info</span>
                                <span class="nm-stat-value">${stdMacros ? stdMacros.display.energy : '-'}</span>
                            </div>
                            <div class="nm-stat-item">
                                <span class="nm-stat-label">Serves</span>
                                <span class="nm-stat-value" style="display: flex; align-items: center; gap: 0.5rem;">
                                    <button class="nm-multiplier-btn scaler-btn" data-scale="${currentScale <= 1 ? 0.5 : 1}"><i data-lucide="minus" style="pointer-events:none;width:14px;height:14px;"></i></button>
                                    ${recipe.macros?.yield || '-'}
                                    <button class="nm-multiplier-btn scaler-btn" data-scale="${currentScale >= 1 ? 2 : 1}"><i data-lucide="plus" style="pointer-events:none;width:14px;height:14px;"></i></button>
                                </span>
                            </div>
                            <div class="nm-stat-item">
                                <span class="nm-stat-label">Time</span>
                                <span class="nm-stat-value">${recipe.time || '-'}</span>
                            </div>
                        </div>
                    </div>

                    <div class="nm-section-pill">
                        <i data-lucide="utensils" style="width:16px;height:16px;"></i>
                        <span style="position:relative; top:1px;">Instructions</span>
                    </div>
                    ${stepsHtml}
                </div>
            </div>
            ${footerHtml}
        `;

        attachModalListeners();
    }

    function attachModalListeners() {
        const ingredientLinks = modalBody.querySelectorAll('.ingredient-link, .ingredient-recipe-link');
        ingredientLinks.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                openModal(btn.dataset.id);
            });
        });

        const wrapper = document.getElementById('ingredients-wrapper');
        if (wrapper) {
            wrapper.querySelectorAll('.scaler-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    currentScale = parseFloat(e.target.dataset.scale);
                    wrapper.innerHTML = renderIngredientsHTML(currentRecipe, currentScale);
                    attachModalListeners();
                });
            });
        }
    }

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        if (lastFocusedElement) {
            lastFocusedElement.focus();
            lastFocusedElement = null;
        }
    }

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => { 
        if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
            closeModal(); 
        }
    });

    // --- GDPR Banner Logic ---
    const gdprBanner = document.getElementById('gdpr-banner');
    const gdprAccept = document.getElementById('gdpr-accept');
    if (gdprBanner && gdprAccept) {
        if (localStorage.getItem('larder_gdpr_accepted') !== 'true') {
            setTimeout(() => gdprBanner.classList.remove('hidden'), 1000);
        }
        gdprAccept.addEventListener('click', () => {
            localStorage.setItem('larder_gdpr_accepted', 'true');
            gdprBanner.classList.add('hidden');
        });
    }
});
