document.addEventListener('DOMContentLoaded', () => {
    // Reveal app-only UI (e.g. the "Manage"/CMS nav button) when running inside
    // the packaged Electron app; these elements stay hidden on the public site.
    if (window.larderWindow && window.larderWindow.isElectron) {
        document.querySelectorAll('.app-only').forEach(el => { el.style.display = ''; });
    }

    // --- Nav and Theme Logic ---
    // Extracted to theme.js

    // Escape user-controlled text before it reaches innerHTML templates (XSS).
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Parse recipe.time strings ("25 mins", "1 hr 30 mins", "45 minutes") into minutes.
    function parseTimeToMinutes(timeStr) {
        if (!timeStr) return null;
        const s = String(timeStr).toLowerCase();
        let total = 0;
        const hrMatch = s.match(/(\d+)\s*(?:hr|hrs|hour|hours)/);
        const minMatch = s.match(/(\d+)\s*(?:min|mins|minute|minutes)/);
        if (hrMatch) total += parseInt(hrMatch[1], 10) * 60;
        if (minMatch) total += parseInt(minMatch[1], 10);
        return total > 0 ? total : null;
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
    document.addEventListener('click', (e) => {
        if (searchBarWrap && !searchBarWrap.contains(e.target) && !searchTrigger.contains(e.target)) {
            searchBarWrap.classList.remove('active');
            searchInput.value = '';
        }
    });

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
    let recipeIndex = [];
    let currentCategory = 'All';
    let searchQuery = '';
    let currentRecipe = null;
    let currentScale = 1;
    let lastFocusedElement = null;
    let selectedTags = new Set();
    
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
        const endpoint = (isIngredientsPage ? '/api/ingredients' : '/api/recipes') + '?_=' + Date.now();
        const fallbackFile = isIngredientsPage ? 'data/ingredients.json' : 'data/recipes.json';
        const headers = { 'Authorization': 'Bearer larder_local_sync_8f92k' };
        
        fetch(endpoint, { headers, cache: 'no-store' })
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

        if (isIngredientsPage) {
            fetch('/api/recipes?_=' + Date.now(), { headers, cache: 'no-store' })
                .then(r => { if (!r.ok) throw new Error(); return r.json(); })
                .then(data => { recipeIndex = data; })
                .catch(() => {
                    fetch('data/recipes.json')
                        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
                        .then(data => { recipeIndex = data; })
                        .catch(() => { recipeIndex = []; });
                });
        }
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
        fat: { min: null, max: null },
        time: { min: null, max: null }
    };

    const sliderConfigs = {
        cal: { min: 0, max: 2000, step: 50 },
        carbs: { min: 0, max: 200, step: 5 },
        protein: { min: 0, max: 150, step: 5 },
        fat: { min: 0, max: 150, step: 5 },
        time: { min: 0, max: 180, step: 5 }
    };

    function updateMacroBadge() {
        let count = 0;
        if (currentCategory !== 'All') count++;
        Object.keys(macroFilters).forEach(k => {
            if (macroFilters[k].min !== null || macroFilters[k].max !== null) count++;
        });
        count += selectedTags.size;
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
                    minInput.value = minVal;
                    maxInput.value = maxVal;
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

                const unit = key === 'cal' ? ' kcal' : key === 'time' ? ' min' : 'g';
                
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
            selectedTags.clear();
            const tagSearchInputEl = document.getElementById('tagSearchInput');
            if (tagSearchInputEl) tagSearchInputEl.value = '';
            renderTagChips();
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
        renderTagChips();
        renderGrid();

        // Deep links: ingredients.html?foodId=... (or ?name=...) opens the
        // ingredient profile immediately, so recipe ingredient links can send
        // visitors straight to the detail view in their own tab.
        if (isIngredientsPage) {
            const params = new URLSearchParams(window.location.search);
            const foodId = params.get('foodId');
            const name = params.get('name');
            let target = null;
            if (foodId) {
                target = recipesData.find(r => r.entryType === 'ingredient'
                    && String(r.foodId || r.id).toLowerCase() === String(foodId).toLowerCase());
            }
            if (!target && name) {
                const q = name.toLowerCase();
                target = recipesData.find(r => r.entryType === 'ingredient'
                    && ((r.title || r.name || '').toLowerCase() === q));
            }
            if (target) {
                if (searchInput) searchInput.value = '';
                openModal(target.foodId || target.id);
            }
        }
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
            
            return `<button class="filter-chip ${cat === currentCategory ? 'active' : ''}" data-category="${escapeHtml(cat)}">${iconStr}${escapeHtml(cat)}</button>`;
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

    // Map a recipe category to its accent colour (mirrors cms.js getCategoryAccent).
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

    // Derive a small, data-backed tag set for each item so the Tags section
    // stays functional even when entries carry no explicit tags field.
    function getRecipeTags(recipe) {
        const tags = [];
        const std = getStandardMacros(recipe);
        if (std) {
            const n = std.normalized;
            if (n.protein >= 20) tags.push('High Protein');
            if (n.carbs >= 20) tags.push('Carbs');
            if (n.fat >= 20) tags.push('High Fat');
            if (n.energy >= 500) tags.push('High Energy');
        }
        const minutes = parseTimeToMinutes(recipe.time);
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

    function renderTagChips() {
        const tagChipsEl = document.getElementById('tagChips');
        const tagSearchInputEl = document.getElementById('tagSearchInput');
        if (!tagChipsEl) return;

        const relevantRecipes = isIngredientsPage
            ? recipesData
            : recipesData.filter(r => r.entryType !== 'ingredient');

        const tagCounts = {};
        relevantRecipes.forEach(r => {
            getRecipeTags(r).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
        });

        const query = (tagSearchInputEl ? tagSearchInputEl.value : '').toLowerCase();
        const tags = Object.keys(tagCounts)
            .filter(t => !query || t.toLowerCase().includes(query))
            .sort();

        tagChipsEl.innerHTML = tags.map(tag => {
            const active = selectedTags.has(tag);
            return `<button class="filter-chip${active ? ' active' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}<span class="tag-count">${tagCounts[tag]}</span></button>`;
        }).join('') || `<span class="filter-empty-hint">No matching tags</span>`;

        tagChipsEl.querySelectorAll('.filter-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.dataset.tag;
                if (selectedTags.has(tag)) {
                    selectedTags.delete(tag);
                    btn.classList.remove('active');
                } else {
                    selectedTags.add(tag);
                    btn.classList.add('active');
                }
                updateMacroBadge();
                currentPage = 1;
                renderGrid();
            });
        });

        if (tagSearchInputEl && !tagSearchInputEl.dataset.bound) {
            tagSearchInputEl.dataset.bound = '1';
            tagSearchInputEl.addEventListener('input', renderTagChips);
        }
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
                const titleMatch = (r.title || r.name || '').toLowerCase().includes(searchQuery);
                const descMatch = (r.description || r.notes || '').toLowerCase().includes(searchQuery);
                const ingMatch = (r.ingredients || []).some(ing => (ing.item || '').toLowerCase().includes(searchQuery));
                return titleMatch || descMatch || ingMatch;
            });
        }

        // Apply Tag Filters (AND semantics)
        if (selectedTags.size > 0) {
            filtered = filtered.filter(r => {
                const tags = getRecipeTags(r);
                return [...selectedTags].every(t => tags.includes(t));
            });
        }

        // Apply Time Filter (independent of macros; recipes may have time but no macros)
        if (macroFilters.time.min !== null || macroFilters.time.max !== null) {
            filtered = filtered.filter(r => {
                const minutes = parseTimeToMinutes(r.time);
                if (minutes === null) return false;
                if (macroFilters.time.min !== null && minutes < macroFilters.time.min) return false;
                if (macroFilters.time.max !== null && minutes > macroFilters.time.max) return false;
                return true;
            });
        }

        // Apply Macro Filters
        const hasAnyMacroFilter = ['cal', 'carbs', 'protein', 'fat'].some(k =>
            macroFilters[k].min !== null || macroFilters[k].max !== null);
        if (hasAnyMacroFilter) {
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
            const yieldNum = yield_ ? (parseFloat(String(yield_).replace(',', '.')) || yield_) : '';
            const energyNum = (typeof energy === 'number' && !isNaN(energy)) ? energy : (parseFloat(String(energy)) || '');
            const itemId = recipe.id || recipe.foodId;
            
            if (isIngredientsPage || recipe.entryType === 'ingredient') {
                const safeTitle = escapeHtml(title);
                const safeCategory = escapeHtml(recipe.category || 'Ingredient');
                const hasImg = !!(recipe.imageUrl && String(recipe.imageUrl).trim());
                const safeImage = hasImg ? escapeHtml(recipe.imageUrl) : '';
                const safeId = escapeHtml(itemId);
                const safeEnergy = escapeHtml(energy);
                const safeProtein = escapeHtml(recipe.proteinG);
                const safeFat = escapeHtml(recipe.fatG);
                const ingIcon = getIngredientIcon(recipe.category);
                const cardVisual = hasImg
                    ? `<img src="${safeImage}" alt="${safeTitle}" loading="lazy" onerror="this.onerror=null;this.parentElement.querySelector('i').style.display='inline-flex';this.style.display='none';" style="width:100%;height:100%;object-fit:cover;">
                        <i data-lucide="${ingIcon.icon}" style="width: 38px; height: 38px; stroke-width: 1.6; color: ${ingIcon.accent}; display: none;"></i>`
                    : `<i data-lucide="${ingIcon.icon}" style="width: 38px; height: 38px; stroke-width: 1.6; color: ${ingIcon.accent};"></i>`;
                return `
                <div class="ingredient-card ${themeClass}" data-id="${safeId}" role="listitem" tabindex="0">
                    <div class="ingredient-card-visual" style="background: var(--surface-hover);">
                        ${cardVisual}
                    </div>
                    <div class="ingredient-card-body">
                        <span class="ingredient-card-category">${safeCategory}</span>
                        <h3 class="ingredient-card-name">${safeTitle}</h3>
                        <div class="ingredient-card-macros">
                            <span class="macro-pill macro-cal">${escapeHtml(energy) || '-'} kcal</span>
                            <span class="macro-pill macro-pro">${escapeHtml(recipe.proteinG) || '-'}g P</span>
                            <span class="macro-pill macro-fat">${escapeHtml(recipe.fatG) || '-'}g F</span>
                        </div>
                    </div>
                </div>`;
            }

            const safeTitle = escapeHtml(title);
            const safeCategory = escapeHtml(recipe.category || 'Recipe');
            const safeImage = escapeHtml(recipe.imageUrl || 'images/icon.png');
            const safeId = escapeHtml(itemId);
            const safeDesc = escapeHtml(recipe.description || '');
            const safeYield = escapeHtml(yieldNum);
            const safeEnergy = escapeHtml(energyNum);
            const isFallback = !recipe.imageUrl;

            return `
            <div class="recipe-card ${themeClass}" data-id="${safeId}" role="listitem" tabindex="0" aria-label="View: ${safeTitle}">
                <div class="recipe-image">
                    <div class="recipe-image-inner">
                        <img src="${safeImage}" alt="${safeTitle}" loading="lazy" onerror="this.onerror=null;this.src='images/icon.png';this.style.objectFit='contain';this.style.padding='1.5rem';" style="width: 100%; height: 100%; object-fit: ${isFallback ? 'contain' : 'cover'}; ${isFallback ? 'padding: 1.5rem;' : ''}">
                    </div>
                </div>
                <div class="recipe-content">
                    <span class="recipe-category">${safeCategory}</span>
                    <h3 class="recipe-title">${safeTitle}</h3>
                    <p class="recipe-desc">${safeDesc}</p>
                    ${(yieldNum || energyNum) ? `<div class="recipe-meta">
                        ${yieldNum ? `<span class="recipe-meta-item"><i data-lucide="users" style="width: 14px; height: 14px;"></i> ${safeYield}</span>` : ''}
                        ${energyNum ? `<span class="recipe-meta-item"><i data-lucide="flame" style="width: 14px; height: 14px;"></i> ${safeEnergy} kcal</span>` : ''}
                    </div>` : ''}
                </div>
            </div>`;
        }).join('');

        if (window.lucide) window.lucide.createIcons();

        document.querySelectorAll('.recipe-card, .ingredient-card').forEach(card => {
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
    // Convert a positive decimal to a proper mixed fraction string ("1 ½", "¾").
    // Picks the nearest common measuring increment (⅛, ¼, ⅓, ⅜, ½, ⅝, ⅔, ¾, ⅞).
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

    // Format a scaled amount. Non-cup units keep a single decimal place;
    // cup measurements always render as proper fractions.
    function formatScaledAmount(value, unit) {
        if (value == null || isNaN(value)) return '';
        const isCup = unit && /^cups?$/i.test(unit.trim());
        if (isCup) {
            const frac = toFractionString(value);
            // "¾ cup" for less than one, "1 cup" for exactly one, "2 cups" otherwise.
            const label = (value <= 1) ? 'cup' : 'cups';
            return `${frac} ${label}`;
        }
        let num = Math.round(value * 10) / 10;
        const numStr = String(num);
        return `${numStr} ${unit || ''}`.trim();
    }

    // Parse an amount string that may start with a decimal, a unicode fraction
    // ("½ cup"), or a mixed number ("1 ½ cups", "2 1/2 cups").
    function parseAmount(amountStr) {
        if (!amountStr) return null;
        let str = String(amountStr).trim();
        const fracMap = { '½': ' 1/2', '⅓': ' 1/3', '⅔': ' 2/3', '¼': ' 1/4', '¾': ' 3/4', '⅛': ' 1/8', '⅜': ' 3/8', '⅝': ' 5/8', '⅞': ' 7/8' };
        for (const [char, val] of Object.entries(fracMap)) str = str.replace(char, val);
        const match = str.match(/^(\d+(?:\s+\d+)?(?:\/\d+)?|\d*\.?\d+)?\s*([a-zA-Zµ%]+)?$/);
        if (!match) return null;
        let num = 0;
        const numPart = match[1];
        if (numPart) {
            if (/\s/.test(numPart) && numPart.includes('/')) {
                // Mixed fraction: "1 1/2" → 1.5
                const parts = numPart.trim().split(/\s+/);
                const whole = parseFloat(parts[0]);
                const [fn, fd] = parts[1].split('/');
                num = whole + parseFloat(fn) / parseFloat(fd);
            } else if (numPart.includes('/')) {
                // Simple fraction: "1/2" → 0.5
                const [n, d] = numPart.split('/');
                num = parseFloat(n) / parseFloat(d);
            } else {
                num = parseFloat(numPart);
            }
        }
        return { value: isNaN(num) ? 0 : num, unit: (match[2] || '').trim() };
    }

    function scaleAmount(amountStr, multiplier) {
        if (!amountStr) return '';
        if (multiplier === 1) return amountStr;
        const parsed = parseAmount(amountStr);
        if (!parsed) return amountStr;
        return formatScaledAmount(parsed.value * multiplier, parsed.unit);
    }

    function resolveIngredientProfile(ing) {
        // Exact foodId first (the recipe already stores it), then a name fallback
        // for legacy data authored before links existed.
        if (ing.foodId) {
            const byId = recipesData.find(r => r.entryType === 'ingredient'
                && String(r.foodId || r.id).toLowerCase() === String(ing.foodId).toLowerCase());
            if (byId) return byId;
        }
        return recipesData.find(r => r.entryType === 'ingredient'
            && (ing.item || '').toLowerCase().includes((r.title || r.name || '').toLowerCase()));
    }

    function renderIngredientsHTML(recipe, scale) {
        if (!recipe.ingredients || recipe.ingredients.length === 0) return '';
        
        let html = '<table class="recipe-table"><colgroup><col style="width: 50%"><col style="width: 25%"><col style="width: 25%"></colgroup>';
        
        html += recipe.ingredients.map(ing => {
            const safeItem = escapeHtml(ing.item);
            if (ing.item.startsWith('## ')) {
                return `<tr><td colspan="3" style="border-bottom: none;"><h4 style="margin-top: 1rem; color: var(--text-main); font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); padding-bottom: 0.25rem;">${escapeHtml(ing.item.substring(3))}</h4></td></tr>`;
            }

            const profile = resolveIngredientProfile(ing);
            const itemNameHtml = profile
                ? `<a class="ingredient-link" href="ingredients.html?foodId=${encodeURIComponent(profile.foodId || profile.id)}" target="_blank" rel="noopener" title="View ${escapeHtml(profile.title || profile.name)}">${safeItem}</a>`
                : `<span style="font-weight: 500;">${safeItem}</span>`;

            let metricAmt = ing.metric ? scaleAmount(ing.metric, scale) : '';
            let imperialAmt = ing.imperial ? scaleAmount(ing.imperial, scale) : '';

            if (!metricAmt && !imperialAmt) {
                let parsedAmount = parseFloat(ing.amount);
                if (!isNaN(parsedAmount)) {
                    metricAmt = formatScaledAmount(parsedAmount * scale, ing.unit || '');
                } else if (ing.amount) {
                    metricAmt = ing.amount;
                } else {
                    metricAmt = '-';
                }
            }

            return `<tr><td>${itemNameHtml}</td><td>${escapeHtml(metricAmt)}</td><td>${escapeHtml(imperialAmt)}</td></tr>`;
        }).join('');
        
        html += '</table>';
        return html;
    }

    function getStandardMacros(recipe) {
        if (recipe._stdMacros !== undefined) return recipe._stdMacros;
        if (!recipe.macros && typeof recipe.calories === 'undefined') {
            recipe._stdMacros = null;
            return null;
        }
        
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

        // Micros are stored per-serving (or per-100g/total) numbers from the CMS.
        const MICRO_FIELDS = ['fiberG', 'sugarG', 'saturatedFatG', 'monounsaturatedFatG', 'polyunsaturatedFatG', 'transFatG', 'cholesterolMg', 'sodiumMg', 'potassiumMg', 'calciumMg', 'ironMg', 'magnesiumMg', 'phosphorusMg', 'zincMg', 'copperMg', 'seleniumMcg', 'vitaminAMcg', 'vitaminCMg', 'vitaminDMcg', 'vitaminEMg', 'vitaminKMcg', 'thiaminMg', 'riboflavinMg', 'niacinMg', 'pantothenicMg', 'vitaminB6Mg', 'folateMcg', 'vitaminB12Mcg'];
        const micros = {};
        for (const nf of MICRO_FIELDS) {
            if (typeof m[nf] === 'number' && !isNaN(m[nf]) && m[nf] > 0) micros[nf] = m[nf] / divisor;
        }

        const result = {
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
            micros,
            referenceLabel: suffix.replace(' / ', '') // "serving", "100g", "50g"
        };
        recipe._stdMacros = result;
        return result;
    }

    function getYieldNumber(recipe) {
        const y = recipe && recipe.macros ? recipe.macros.yield : null;
        if (!y) return null;
        const m = String(y).match(/(\d*\.?\d+)/);
        return m ? parseFloat(m[1]) : null;
    }

    function fmtAmount(v) {
        if (v == null || isNaN(v)) return null;
        return Math.round(v * 10) / 10;
    }

    function getRecipeTime(recipe) {
        if (recipe && recipe.time && String(recipe.time).trim()) return String(recipe.time).trim();
        return null;
    }

    function getIngredientIcon(category) {
        const cat = (category || '').toLowerCase();
        if (cat.includes('vegetable') || cat.includes('veg') || cat.includes('herb')) return { accent: 'var(--accent-veg)', icon: 'leafy-green' };
        if (cat.includes('fruit')) return { accent: 'var(--accent-jam)', icon: 'apple' };
        if (cat.includes('meat') || cat.includes('poultry')) return { accent: 'var(--accent-meat)', icon: 'beef' };
        if (cat.includes('fish') || cat.includes('seafood') || cat.includes('shell')) return { accent: 'var(--accent-sea)', icon: 'fish' };
        if (cat.includes('dairy') || cat.includes('milk') || cat.includes('cheese')) return { accent: 'var(--accent-sea)', icon: 'milk' };
        if (cat.includes('grain') || cat.includes('pasta') || cat.includes('bread') || cat.includes('rice') || cat.includes('cereal') || cat.includes('carbs') || cat.includes('noodle')) return { accent: 'var(--accent-stock)', icon: 'wheat' };
        if (cat.includes('baking') || cat.includes('dessert') || cat.includes('sweet')) return { accent: 'var(--accent-bake)', icon: 'cake' };
        if (cat.includes('snack')) return { accent: 'var(--accent-bake)', icon: 'cookie' };
        if (cat.includes('fats') || cat.includes('oil')) return { accent: 'var(--accent-stock)', icon: 'droplet' };
        if (cat.includes('spice')) return { accent: 'var(--accent-meat)', icon: 'flame' };
        if (cat.includes('nut') || cat.includes('seed')) return { accent: 'var(--accent-stock)', icon: 'nut' };
        if (cat.includes('legume') || cat.includes('bean')) return { accent: 'var(--accent-veg)', icon: 'bean' };
        if (cat.includes('beverage') || cat.includes('drink') || cat.includes('wine')) return { accent: 'var(--accent-sea)', icon: 'cup-soda' };
        if (cat.includes('condiment')) return { accent: 'var(--accent-stock)', icon: 'package' };
        if (cat.includes('supplement')) return { accent: 'var(--accent-meat)', icon: 'pill' };
        if (cat.includes('protein')) return { accent: 'var(--accent-meat)', icon: 'egg' };
        return { accent: 'var(--accent-sea)', icon: 'utensils' };
    }

    function buildIngredientModalContent(recipe) {
        const title = (recipe.name || recipe.title || '').trim();
        const category = recipe.category || 'Other';
        const ingIcon = getIngredientIcon(category);
        const accent = ingIcon.accent;

        const fmtG = (v) => (typeof v === 'number' && !isNaN(v)) ? (Math.round(v * 10) / 10) + 'g' : '-';
        const kcalVal = (typeof recipe.calories === 'number' && !isNaN(recipe.calories)) ? recipe.calories : '-';

        const serving = `${recipe.servingSizeG || 100}${recipe.servingUnit || 'g'}`;
        const desc = recipe.notes || recipe.description || '';

        // --- Used In Recipes ---
        const recipeSource = (recipeIndex.length ? recipeIndex : recipesData).filter(r => Array.isArray(r.ingredients) && r.ingredients.length);
        const usedIn = recipeSource
            .filter(r => r.ingredients.some(ing =>
                String(ing.foodId).toLowerCase() === String(recipe.foodId).toLowerCase()
                || (ing.item || '').toLowerCase().includes(title.toLowerCase())
            ))
            .map(r => r.title)
            .slice(0, 8);
        const usedInHtml = usedIn.length ? `
                <div style="margin-top: 1.25rem;">
                    <h4 style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 0.5rem;">Used In Recipes</h4>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        ${usedIn.map(name => `<span class="ing-recipe-chip">${escapeHtml(name)}</span>`).join('')}
                    </div>
                </div>` : '';

        // --- Nutrition rows ---
        const row = (name, val, unit) => `<div class="nutrient-row"><span>${name}</span><span>${typeof val === 'number' && !isNaN(val) && val > 0 ? (Math.round(val * 100) / 100) + ' ' + unit : '-'}</span></div>`;
        const vitaminRows = [
            ['Vitamin A', 'vitaminAMcg', 'mcg'],
            ['Vitamin C', 'vitaminCMg', 'mg'],
            ['Vitamin D', 'vitaminDMcg', 'mcg'],
            ['Vitamin E', 'vitaminEMg', 'mg'],
            ['Vitamin K', 'vitaminKMcg', 'mcg'],
            ['Thiamin (B1)', 'thiaminMg', 'mg'],
            ['Riboflavin (B2)', 'riboflavinMg', 'mg'],
            ['Niacin (B3)', 'niacinMg', 'mg'],
            ['Vitamin B6', 'vitaminB6Mg', 'mg'],
            ['Folate (B9)', 'folateMcg', 'mcg'],
            ['Vitamin B12', 'vitaminB12Mcg', 'mcg']
        ];
        const mineralRows = [
            ['Calcium', 'calciumMg', 'mg'],
            ['Iron', 'ironMg', 'mg'],
            ['Magnesium', 'magnesiumMg', 'mg'],
            ['Phosphorus', 'phosphorusMg', 'mg'],
            ['Potassium', 'potassiumMg', 'mg'],
            ['Sodium', 'sodiumMg', 'mg'],
            ['Zinc', 'zincMg', 'mg'],
            ['Copper', 'copperMg', 'mg'],
            ['Selenium', 'seleniumMcg', 'mcg']
        ];
        const fatRows = [
            ['Saturated Fat', 'saturatedFatG', 'g'],
            ['Trans Fat', 'transFatG', 'g'],
            ['Monounsaturated Fat', 'monounsaturatedFatG', 'g'],
            ['Polyunsaturated Fat', 'polyunsaturatedFatG', 'g'],
            ['Cholesterol', 'cholesterolMg', 'mg']
        ];
        const carbRows = [
            ['Dietary Fiber', 'fiberG', 'g'],
            ['Total Sugars', 'sugarG', 'g']
        ];
        const vitaminsRowsHtml = vitaminRows.filter(r => typeof recipe[r[1]] === 'number' && recipe[r[1]] > 0);
        const mineralsRowsHtml = mineralRows.filter(r => typeof recipe[r[1]] === 'number' && recipe[r[1]] > 0);
        const fatsRowsHtml = fatRows.filter(r => typeof recipe[r[1]] === 'number' && recipe[r[1]] > 0);
        const carbsRowsHtml = carbRows.filter(r => typeof recipe[r[1]] === 'number' && recipe[r[1]] > 0);

        const fold = (icon, label, rowsHtml) => rowsHtml.length ? `
                    <details class="ing-fold">
                        <summary class="ing-fold-header">
                            <span><i data-lucide="${icon}" style="width: 14px; height: 14px;"></i> ${label}</span>
                            <i data-lucide="chevron-down" style="width: 16px; height: 16px;" class="fold-chevron"></i>
                        </summary>
                        <div class="ing-fold-body">
                            ${rowsHtml.map(r => row(r[0], recipe[r[1]], r[2])).join('')}
                        </div>
                    </details>` : '';
        const vitaminsFold = fold('pill', 'Vitamins', vitaminsRowsHtml);
        const mineralsFold = fold('gem', 'Minerals', mineralsRowsHtml);
        const fatsFold = fold('droplet', 'Fats', fatsRowsHtml);
        const carbsFold = fold('leaf', 'Fiber & Sugars', carbsRowsHtml);

        // --- Macro visual bar (per 100g ratio) ---
        const p = Number(recipe.proteinG) || 0, f = Number(recipe.fatG) || 0, c = Number(recipe.carbsG) || 0;
        const total = p + f + c;
        let macroBar = '';
        if (total > 0) {
            const pp = Math.round(p / total * 100), fp = Math.round(f / total * 100), cp = Math.round(c / total * 100);
            macroBar = `
                    <div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 1.25rem; background: var(--border);">
                        <div style="width: ${pp}%; background: var(--accent-sea);" title="Protein ${pp}%"></div>
                        <div style="width: ${fp}%; background: var(--accent-stock);" title="Fat ${fp}%"></div>
                        <div style="width: ${cp}%; background: var(--accent-veg);" title="Carbs ${cp}%"></div>
                    </div>`;
        }

        // --- Tabs & panels ---
        const tabs = [];
        const panels = [];

        tabs.push('<button class="ing-tab active" data-tab="overview">Overview</button>');
        panels.push(`<div class="ing-tab-panel active" data-panel="overview">
                    ${desc ? `<p style="color: var(--text-muted); font-size: 0.92rem; line-height: 1.7; margin-bottom: 1.25rem;">${escapeHtml(desc)}</p>` : ''}
                    <div class="ing-macro-bar">
                        <div class="ing-macro-item"><span class="ing-macro-value" style="color: ${accent};">${kcalVal}</span><span class="ing-macro-label">kcal</span></div>
                        <div class="ing-macro-divider"></div>
                        <div class="ing-macro-item"><span class="ing-macro-value">${fmtG(recipe.proteinG)}</span><span class="ing-macro-label">Protein</span></div>
                        <div class="ing-macro-divider"></div>
                        <div class="ing-macro-item"><span class="ing-macro-value">${fmtG(recipe.fatG)}</span><span class="ing-macro-label">Fat</span></div>
                        <div class="ing-macro-divider"></div>
                        <div class="ing-macro-item"><span class="ing-macro-value">${fmtG(recipe.carbsG)}</span><span class="ing-macro-label">Carbs</span></div>
                    </div>
                    ${usedInHtml}
                </div>`);

        tabs.push('<button class="ing-tab" data-tab="nutrition">Nutrition</button>');
        panels.push(`<div class="ing-tab-panel" data-panel="nutrition">
                    <h4 style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 0.75rem;">Per ${escapeHtml(serving)} Serving</h4>
                    ${macroBar}
                    ${fatsFold}
                    ${carbsFold}
                    ${vitaminsFold}
                    ${mineralsFold}
                    ${(!macroBar && !fatsFold && !carbsFold && !vitaminsFold && !mineralsFold) ? `<p style="color: var(--text-muted); font-size: 0.9rem;">No detailed nutrition breakdown available for this ingredient.</p>` : ''}
                </div>`);

        modalContainer.style.maxWidth = '680px';
        modalBody.innerHTML = `
            <div class="modal-header" style="padding-bottom: 0;">
                <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.25rem;">
                    <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, color-mix(in srgb, ${accent} 15%, transparent), color-mix(in srgb, ${accent} 6%, transparent)); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <i data-lucide="${ingIcon.icon}" style="width: 26px; height: 26px; stroke-width: 1.8; color: ${accent};"></i>
                    </div>
                    <div>
                        <h2 class="recipe-full-title" style="margin-bottom: 0.1rem; color: ${accent};">${escapeHtml(title.toUpperCase())}</h2>
                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">${escapeHtml(category)}</p>
                    </div>
                </div>
                <div class="ing-tabs" id="ingTabs">
                    ${tabs.join('')}
                </div>
            </div>
            <div class="modal-body" style="display: block; padding: 1.5rem 2rem;">
                ${panels.join('')}
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();
        attachModalListeners();
    }

    function buildModalContent() {
        const recipe = currentRecipe;

        if (isIngredientsPage || recipe.entryType === 'ingredient') {
            buildIngredientModalContent(recipe);
            return;
        }

        let stdMacros = getStandardMacros(recipe);
        let ingredientsHtml = renderIngredientsHTML(recipe, currentScale);

        const baseYield = getYieldNumber(recipe);
        const scaledServes = (baseYield != null) ? fmtAmount(baseYield * currentScale) : null;
        const recipeTime = getRecipeTime(recipe);
        const headerColor = getCategoryAccent(recipe.category);
        modalBody.style.setProperty('--recipe-accent', headerColor);

        // Servings stepper: adjust by exactly one serving, never below 1
        let minusScale = null, plusScale = null, minusDisabled = true, plusDisabled = false;
        if (baseYield != null && baseYield > 0) {
            const curServings = baseYield * currentScale;
            minusScale = Math.max(1, curServings - 1) / baseYield;
            plusScale = (curServings + 1) / baseYield;
            minusDisabled = curServings <= 1;
            plusDisabled = curServings >= 100;
        }

        // Render a step's inline ingredient tokens ([[foodId|Label]]) as links.
        // Tokens that don't resolve to a known ingredient stay as plain text.
        function renderStepHtml(step) {
            return escapeHtml(step).replace(/(?<!\[)\[\[([\w\-_.]+)(?:\|([^\]]+))?\]\]/g, (match, foodId, label) => {
                const resolved = recipesData.find(r => r.entryType === 'ingredient'
                    && String(r.foodId || r.id).toLowerCase() === String(foodId).toLowerCase());
                if (!resolved) return label ? escapeHtml(label) : match;
                const linkLabel = escapeHtml((label || resolved.title || resolved.name || foodId).trim());
                return `<a class="ingredient-link" href="ingredients.html?foodId=${encodeURIComponent(foodId)}" target="_blank" rel="noopener" title="View ${linkLabel}">${linkLabel}</a>`;
            });
        }

        let stepsHtml = '';
        if (recipe.steps?.length > 0) {
            let stepNum = 1;
            stepsHtml = recipe.steps.map((step) => {
                if (step.startsWith('## ')) {
                    stepNum = 1;
                    return `<h4 style="margin-top: 1.5rem; color: var(--text-main); font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); padding-bottom: 0.25rem;">${escapeHtml(step.substring(3))}</h4>`;
                }
                const html = `
                <div class="recipe-step">
                    <span class="step-number">${stepNum}</span>
                    <p>${renderStepHtml(step)}</p>
                </div>`;
                stepNum++;
                return html;
            }).join('');
        }

        let prepHtml = '';
        if (recipe.prepSteps && recipe.prepSteps.length) {
            let prepNum = 1;
            prepHtml = `
                <div class="recipe-instructions-subsection">
                    <h4 class="recipe-subsection-title">
                        <i data-lucide="timer" style="width: 15px; height: 15px;"></i> Prep
                        ${recipe.prepTime ? `<span style="font-size: 0.78rem; font-weight: 400; text-transform: none; letter-spacing: 0; color: var(--text-muted);">${escapeHtml(recipe.prepTime)}</span>` : ''}
                    </h4>
                    ${recipe.prepSteps.map((step) => {
                        if (step.startsWith('## ')) {
                            prepNum = 1;
                            return `<h4 style="margin-top: 1rem; color: var(--text-main); font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); padding-bottom: 0.25rem;">${escapeHtml(step.substring(3))}</h4>`;
                        }
                        const html = `
                        <div class="recipe-step">
                            <span class="step-number">${prepNum}</span>
                            <p>${renderStepHtml(step)}</p>
                        </div>`;
                        prepNum++;
                        return html;
                    }).join('')}
                </div>`;
        }

        let footerHtml = '';
        if (recipe.note || recipe.variations) {
            footerHtml = '<div class="recipe-footer-col">';
            if (recipe.note) {
                footerHtml += `<div class="recipe-callout" style="border-left-color: ${headerColor};">
                    <h4 class="callout-title" style="color: ${headerColor};"><i data-lucide="lightbulb" style="width: 18px; height: 18px;"></i>Note</h4>
                    <p style="font-size: 0.9rem; line-height: 1.6;">${escapeHtml(recipe.note)}</p>
                </div>`;
            }
            if (recipe.variations) {
                footerHtml += `<div class="recipe-callout" style="border-left-color: ${headerColor};">
                    <h4 class="callout-title" style="color: ${headerColor};"><i data-lucide="refresh-cw" style="width: 18px; height: 18px;"></i> Variations</h4>
                    <p style="font-size: 0.9rem; line-height: 1.6;">${escapeHtml(recipe.variations)}</p>
                </div>`;
            }
            footerHtml += '</div>';
        }

        const iconTag = recipe.iconTag || 'icon-fish';
        
        const ingVis = getIngredientIcon(recipe.category);
        const ingredientsPillIcon = `<i data-lucide="${ingVis.icon}" style="width: 18px; height: 18px; stroke-width: 2; color: currentColor;"></i>`;
        
        const tags = getRecipeTags(recipe);
        const tagsHtml = tags.length
            ? `<div class="modal-tags">${tags.map(t => `<span class="tag-display-chip">${escapeHtml(t)}</span>`).join('')}</div>`
            : '';
        
        // Remove standard header wrapper and inject the custom modal structure 
        // Note: index.html already has `<div class="modal-content" id="modal-container">` and `<button class="modal-close" id="modal-close" aria-label="Close modal"><i data-lucide="x"></i></button>` inside it, and `<div id="modal-body">`.
        // BUT our `modalBody.innerHTML = ...` targets `#modal-body`. 
        // Wait, in visual_direction.html, the structure is:
        // .modal-content
        //   .modal-header
        //   .modal-body
        
        // So we can put .modal-header AND .modal-body inside `#modal-body`.
        
        modalContainer.style.maxWidth = '';
        modalBody.style.padding = "0"; // reset padding since we use columns
        modalBody.style.display = "flex";
        modalBody.style.flexDirection = "column"; // we will put header, then body flex
        
        modalBody.innerHTML = `
            <div class="modal-header">
                <div class="modal-actions no-print">
                    <button class="icon-btn" aria-label="Print Recipe" title="Print Recipe" onclick="window.print()"><i data-lucide="printer" style="width: 18px; height: 18px;"></i></button>
                    <button class="icon-btn" aria-label="Download PDF" title="Download as PDF" onclick="window.print()"><i data-lucide="file-down" style="width: 18px; height: 18px;"></i></button>
                </div>
                <h2 class="recipe-full-title" style="color: ${headerColor}; text-transform: uppercase;">${escapeHtml(recipe.title)}</h2>
                <p class="recipe-full-desc">${escapeHtml(recipe.description || '')}</p>
                ${tagsHtml}
            </div>
            
            <div class="modal-body" style="padding: 0;">
                <!-- Stats Row -->
                <div class="recipe-ingredients-col" style="padding: 1.5rem 1rem 1rem 2rem; border-bottom: 1px solid var(--border); border-right: none;">
                    <div class="stat-block" style="border-top: 3px solid ${headerColor}; width: 100%; justify-content: flex-start;">
                        <span class="stat-block-title">Info</span>
                        <div class="stat-group">
                            <div class="stat-item"><span class="stat-label">Serves</span>
                                <span class="stat-value" style="display: flex; align-items: center; gap: 0.5rem;">
                                    <button class="multiplier-btn scaler-btn" data-scale="${minusScale}" title="Decrease servings" aria-label="Decrease servings" ${minusDisabled ? 'disabled' : ''} style="width: 24px; height: 24px;"><i data-lucide="minus" style="pointer-events:none; width: 12px; height: 12px;"></i></button>
                                    ${scaledServes != null ? scaledServes : '-'}
                                    <button class="multiplier-btn scaler-btn" data-scale="${plusScale}" title="Increase servings" aria-label="Increase servings" ${plusDisabled ? 'disabled' : ''} style="width: 24px; height: 24px;"><i data-lucide="plus" style="pointer-events:none; width: 12px; height: 12px;"></i></button>
                                </span>
                            </div>
                            ${recipeTime ? `<div class="stat-item"><span class="stat-label">Time</span><span class="stat-value">${escapeHtml(recipeTime)}</span></div>` : ''}
                        </div>
                    </div>
                </div>
                
                <div class="recipe-instructions-col" style="padding: 1.5rem 2rem 1rem 1rem; border-bottom: 1px solid var(--border);">
                    <div class="stat-block" style="border-top: 3px solid ${headerColor}; width: 100%; justify-content: flex-start;">
                        <span class="stat-block-title">Per Serving</span>
                        <div class="stat-group" style="gap: 3rem; align-items: center;">
                            <div class="stat-item"><span class="stat-label">Energy</span><span class="stat-value" style="color: ${headerColor};">${stdMacros ? stdMacros.display.energy : '-'}</span></div>
                            <div class="stat-item"><span class="stat-label">Carb</span><span class="stat-value">${stdMacros ? stdMacros.display.carbs : '-'}</span></div>
                            <div class="stat-item"><span class="stat-label">Protein</span><span class="stat-value">${stdMacros ? stdMacros.display.protein : '-'}</span></div>
                            <div class="stat-item"><span class="stat-label">Fat</span><span class="stat-value">${stdMacros ? stdMacros.display.fat : '-'}</span></div>
                            <div class="stat-item" style="justify-content: center; align-items: center; padding-top: 0.75rem;">
                                <button class="nutrition-info-btn" aria-label="View Full Nutrition" title="More nutrition info" style="background:var(--bg-surface-hover); border:1px solid var(--border); cursor:pointer; color:var(--text-muted); display:flex; padding: 0.4rem; border-radius: 50%; transition: all 0.2s ease;" onmouseover="this.style.borderColor='${headerColor}'; this.style.color='${headerColor}';" onmouseout="this.style.borderColor='var(--border)'; this.style.color='var(--text-muted)';">
                                    <i data-lucide="info" style="width: 16px; height: 16px; pointer-events: none;"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Content Row -->
                <div class="recipe-ingredients-col" style="padding-top: 1rem;" id="ingredients-wrapper">
                    <div style="display: flex; align-items: flex-start; flex-wrap: wrap;">
                        <h3 class="section-pill" style="color: ${headerColor}; border-color: ${headerColor};">${ingredientsPillIcon} Ingredients</h3>
                    </div>
                    ${ingredientsHtml}
                </div>
                
                <div class="recipe-instructions-col" style="padding-top: 1rem;">
                    <h3 class="section-pill" style="color: ${headerColor}; border-color: ${headerColor};">
                        <i data-lucide="utensils" style="width: 18px; height: 18px;"></i> <span style="position: relative; top: 1px;">Instructions</span>
                    </h3>
                    ${prepHtml}
                    ${stepsHtml}
                </div>
                
                ${footerHtml}
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();
        attachModalListeners();
    }
    function attachModalListeners() {
        // `.ingredient-link` anchors are real <a target="_blank"> now — let the
        // browser open them in a new tab. Keep the in-modal fallback for any
        // legacy `.ingredient-recipe-link` buttons.
        const ingredientLinks = modalBody.querySelectorAll('.ingredient-recipe-link');
        ingredientLinks.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                openModal(btn.dataset.id);
            });
        });

        modalBody.querySelectorAll('.scaler-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const scale = parseFloat(e.currentTarget.dataset.scale);
                if (!isNaN(scale) && scale > 0) {
                    currentScale = scale;
                    buildModalContent();
                }
            });
        });

        const nutBtn = modalBody.querySelector('.nutrition-info-btn');
        if (nutBtn) {
            nutBtn.addEventListener('click', () => openNutritionDrawer(currentRecipe));
        }

        const ingTabBar = modalBody.querySelector('.ing-tabs');
        if (ingTabBar) {
            const ingPanels = modalBody.querySelectorAll('.ing-tab-panel');
            ingTabBar.querySelectorAll('.ing-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    ingTabBar.querySelectorAll('.ing-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    ingPanels.forEach(p => {
                        p.classList.remove('active');
                        if (p.dataset.panel === tab.dataset.tab) p.classList.add('active');
                    });
                });
            });
        }
    }

    let nutritionDrawerReady = false;
    function ensureNutritionDrawer() {
        if (nutritionDrawerReady) return;
        nutritionDrawerReady = true;
        const overlay = document.createElement('div');
        overlay.className = 'drawer-overlay';
        overlay.id = 'nutritionDrawerOverlay';
        const drawer = document.createElement('div');
        drawer.className = 'nutrition-drawer';
        drawer.id = 'nutritionDrawer';
        drawer.innerHTML = '<div class="drawer-header"><h3>Nutrition Facts</h3><button class="modal-close" aria-label="Close nutrition facts" title="Close" style="position: static; flex-shrink: 0;"><i data-lucide="x"></i></button></div><div class="drawer-content" id="nutritionDrawerContent"></div>';
        document.body.appendChild(overlay);
        document.body.appendChild(drawer);
        drawer.querySelector('.modal-close').addEventListener('click', closeNutritionDrawer);
        overlay.addEventListener('click', closeNutritionDrawer);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNutritionDrawer(); });
        if (window.lucide) window.lucide.createIcons();
    }

    function openNutritionDrawer(recipe) {
        ensureNutritionDrawer();
        const content = document.getElementById('nutritionDrawerContent');
        const sm = getStandardMacros(recipe);
        const norm = sm ? sm.normalized : null;
        const micros = sm ? sm.micros : null;

        const rows = [];
        const addRow = (cls, label, value, pct) => {
            rows.push('<div class="nut-row ' + cls + '"><span>' + label + (value != null ? ' <span class="nut-value">' + value + '</span>' : '') + '</span>' + (pct != null ? '<span class="nut-pct">' + pct + '%</span>' : '') + '</div>');
        };

        if (norm && (norm.energy || norm.fat || norm.carbs || norm.protein)) {
            if (norm.energy) addRow('main', 'Calories', fmtAmount(norm.energy) + ' kcal', null);
            if (norm.fat) addRow('main', 'Total Fat', fmtAmount(norm.fat) + 'g', Math.round(norm.fat / 78 * 100));
            if (micros && micros.saturatedFatG != null) addRow('sub', 'Saturated Fat', fmtAmount(micros.saturatedFatG) + 'g', Math.round(micros.saturatedFatG / 20 * 100));
            if (micros && micros.transFatG != null) addRow('sub', 'Trans Fat', fmtAmount(micros.transFatG) + 'g', null);
            if (micros && micros.monounsaturatedFatG != null) addRow('sub', 'Monounsaturated Fat', fmtAmount(micros.monounsaturatedFatG) + 'g', null);
            if (micros && micros.polyunsaturatedFatG != null) addRow('sub', 'Polyunsaturated Fat', fmtAmount(micros.polyunsaturatedFatG) + 'g', null);
            if (micros && micros.cholesterolMg != null) addRow('main', 'Cholesterol', fmtAmount(micros.cholesterolMg) + 'mg', Math.round(micros.cholesterolMg / 300 * 100));
            if (micros && micros.sodiumMg != null) addRow('main', 'Sodium', fmtAmount(micros.sodiumMg) + 'mg', Math.round(micros.sodiumMg / 2300 * 100));
            if (norm.carbs) addRow('main', 'Total Carbohydrates', fmtAmount(norm.carbs) + 'g', Math.round(norm.carbs / 275 * 100));
            if (micros && micros.fiberG != null) addRow('sub', 'Dietary Fiber', fmtAmount(micros.fiberG) + 'g', Math.round(micros.fiberG / 28 * 100));
            if (micros && micros.sugarG != null) addRow('sub', 'Total Sugars', fmtAmount(micros.sugarG) + 'g', null);
            if (norm.protein) addRow('main', 'Protein', fmtAmount(norm.protein) + 'g', Math.round(norm.protein / 50 * 100));

            // Vitamins
            const vitDefs = [
                ['Vitamin A', 'vitaminAMcg', 'mcg', 900], ['Vitamin C', 'vitaminCMg', 'mg', 90], ['Vitamin D', 'vitaminDMcg', 'mcg', 20], ['Vitamin E', 'vitaminEMg', 'mg', 15], ['Vitamin K', 'vitaminKMcg', 'mcg', 120], ['Thiamin (B1)', 'thiaminMg', 'mg', 1.2], ['Riboflavin (B2)', 'riboflavinMg', 'mg', 1.3], ['Niacin (B3)', 'niacinMg', 'mg', 16], ['Vitamin B6', 'vitaminB6Mg', 'mg', 1.7], ['Folate (B9)', 'folateMcg', 'mcg', 400], ['Vitamin B12', 'vitaminB12Mcg', 'mcg', 2.4]
            ];
            for (const [label, field, unit, dv] of vitDefs) {
                if (micros && micros[field] != null) addRow('vit', label, fmtAmount(micros[field]) + unit, Math.round(micros[field] / dv * 100));
            }
            // Minerals
            const minDefs = [
                ['Calcium', 'calciumMg', 'mg', 1300], ['Iron', 'ironMg', 'mg', 18], ['Magnesium', 'magnesiumMg', 'mg', 420], ['Phosphorus', 'phosphorusMg', 'mg', 700], ['Potassium', 'potassiumMg', 'mg', 4700], ['Zinc', 'zincMg', 'mg', 11], ['Copper', 'copperMg', 'mg', 0.9], ['Selenium', 'seleniumMcg', 'mcg', 55]
            ];
            for (const [label, field, unit, dv] of minDefs) {
                if (micros && micros[field] != null) addRow('min', label, fmtAmount(micros[field]) + unit, Math.round(micros[field] / dv * 100));
            }
        }

        content.innerHTML = rows.length
            ? '<p style="font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; font-size: 0.8rem; margin-bottom: 0;">Amount Per Serving</p><div class="nutrition-card">' + rows.join('') + '</div><p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 1.5rem; line-height: 1.5;">* The % Daily Value (DV) tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.</p>'
            : '<p style="color: var(--text-muted); line-height: 1.6;">No detailed nutrition breakdown available for this recipe.</p>';

        document.getElementById('nutritionDrawer').classList.add('active');
        document.getElementById('nutritionDrawerOverlay').classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeNutritionDrawer() {
        const d = document.getElementById('nutritionDrawer');
        const o = document.getElementById('nutritionDrawerOverlay');
        if (d) d.classList.remove('active');
        if (o) o.classList.remove('active');
        if (!modal.classList.contains('active')) {
            document.body.style.overflow = '';
        }
    }

    function openModal(id) {
        const recipe = recipesData.find(r => String(r.id || r.foodId) === String(id));
        if (!recipe) return;
        currentRecipe = recipe;
        currentScale = 1;
        lastFocusedElement = document.activeElement;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        buildModalContent();
    }

    function closeModal() {
        modal.classList.remove('active');
        closeNutritionDrawer();
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
