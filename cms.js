document.addEventListener('DOMContentLoaded', () => {
    const { escapeHtml, toFractionString, formatAmountDisplay, slugify, splitAmount, composeAmount, parseTimeToHM, composeTimeString, cmsParseTimeToMinutes, cmsGetStandardMacros, cmsGetRecipeTags, formatMoney, hhDaysBetween, hhAddDays, estimateDepletionDate, getCategoryIcon, getCategoryAccent, getGramsPerCup, getGramsPerUnit, imperialGramsFactor, parseAmountValue, formatCups, formatCount, formatMetricAmount, formatDateDMY } = window.LarderCalcUtils || {};

    // Shared pure-math module (calc.js) loaded before cms.js. Fall back to a
    // minimal local version only if it is missing, so the app never breaks.
    const LC = typeof LarderCalc !== 'undefined' ? LarderCalc : {
        gramsOf: (a, u, ing) => (parseFloat(a) || 0) * ((u === 'kg' || u === 'l') ? 1000 : 1) * (parseFloat(ing && ing.servingSizeG) || 1),
        priceBasisGrams: (ing) => {
            const a = parseFloat(ing && ing.priceBasisAmount);
            if (a > 0) {
                const u = String(ing && ing.priceBasisUnit || 'g').toLowerCase();
                if (u === 'cnt' || u === 'pc' || u === 'each' || u === 'piece') {
                    return a * (parseFloat(ing && ing.servingSizeG) || 100);
                }
                return a * ((u === 'kg' || u === 'l') ? 1000 : 1);
            }
            const s = parseFloat(ing && ing.servingSizeG);
            return s > 0 ? s : 100;
        },
        perGram: (ing) => {
            const avg = parseFloat(ing && ing.averagePrice);
            if (!(avg > 0)) return 0;
            const b = LC.priceBasisGrams(ing);
            return b > 0 ? avg / b : 0;
        },
        computeTotals: (items, ingredients) => {
            const MF = ['saturatedFatG', 'transFatG', 'monounsaturatedFatG', 'polyunsaturatedFatG', 'cholesterolMg', 'sugarG', 'fiberG', 'sodiumMg', 'potassiumMg', 'calciumMg', 'ironMg', 'magnesiumMg', 'phosphorusMg', 'zincMg', 'copperMg', 'seleniumMcg', 'vitaminAMcg', 'vitaminCMg', 'vitaminDMcg', 'vitaminEMg', 'vitaminKMcg', 'thiaminMg', 'riboflavinMg', 'niacinMg', 'pantothenicMg', 'vitaminB6Mg', 'folateMcg', 'vitaminB12Mcg'];
            const t = { energy: 0, protein: 0, carbs: 0, fat: 0, satFat: 0, sugar: 0, fiber: 0, vitD: 0, animal: 0, meat: 0, cost: 0, units: 0 };
            MF.forEach(k => t[k] = 0);
            (items || []).forEach(it => {
                const ing = (ingredients || []).find(f => f.foodId === it.ingredientId);
                const g = LC.gramsOf(it.amount, it.unit, ing);
                if (!ing || !(g > 0)) return;
                const f = g / 100;
                t.energy += (parseFloat(ing.calories) || 0) * f;
                t.protein += (parseFloat(ing.proteinG) || 0) * f;
                t.carbs += (parseFloat(ing.carbsG) || 0) * f;
                t.fat += (parseFloat(ing.fatG) || 0) * f;
                t.satFat += (parseFloat(ing.saturatedFatG) || 0) * f;
                t.sugar += (parseFloat(ing.sugarG) || 0) * f;
                t.fiber += (parseFloat(ing.fiberG) || 0) * f;
                t.vitD += (parseFloat(ing.vitaminDMcg) || 0) * f;
                MF.forEach(k => t[k] += (parseFloat(ing[k]) || 0) * f);
                const pg = (parseFloat(ing.proteinG) || 0) * f;
                if (['meat', 'fish', 'egg', 'dairy'].includes((ing.proteinSource || '').toLowerCase())) t.animal += pg;
                t.meat += pg;
                t.cost += LC.perGram(ing) * g * (it.useStock ? 0 : 1);
                t.units += 1;
            });
            return t;
        },
        normalise: s => String(s || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim(),
        matchIngredient: (name, ingredients) => { const q = (name || '').toLowerCase(); return (ingredients || []).find(i => (i.name || '').toLowerCase() === q) || null; },
        parseLine: () => null,
        parseReceiptText: () => []
    };

    const addBtn = document.getElementById('add-recipe-btn');
    const statusText = document.getElementById('status-text');
    const listContainer = document.getElementById('cms-recipe-list');
    
    // Recipe Modal
    const modal = document.getElementById('cms-editor-modal');
    const form = document.getElementById('recipe-form');
    const closeBtn = modal.querySelector('.cms-close');
    const ingContainer = document.getElementById('ingredients-container');
    const addIngBtn = document.getElementById('add-ing-btn');
    const stepsContainer = document.getElementById('steps-container');
    const addStepBtn = document.getElementById('add-step-btn');
    const macroRefSelect = document.getElementById('macro-reference');
    const macroRefAmountGroup = document.getElementById('macro-ref-amount-group');
    const cmsDeleteBtn = document.getElementById('cms-delete-btn');
    const cancelRecipeBtn = document.getElementById('cancel-recipe-btn');
    const recipeStatusSelect = document.getElementById('recipe-status');

    // Ingredient Profile Modal
    const foodModal = document.getElementById('cms-food-modal');
    const profileForm = document.getElementById('ingredient-profile-form');
    const foodCloseBtn = foodModal.querySelector('.food-close');
    const foodDeleteBtn = document.getElementById('cms-food-delete-btn');
    const cancelFoodBtn = document.getElementById('cancel-food-btn');

    function setMacroField(id, value, defaultUnit) {
        const input = document.getElementById(id);
        const unitSpan = document.querySelector(`.cms-macro-unit[data-for="${id}"]`);
        if (!input) return;
        const parts = splitAmount(value);
        input.value = parts.num || '';
        if (unitSpan) unitSpan.textContent = parts.unit || defaultUnit || '';
    }

    function getMacroValue(id, defaultUnit) {
        const input = document.getElementById(id);
        const unitSpan = document.querySelector(`.cms-macro-unit[data-for="${id}"]`);
        if (!input || !input.value.trim()) return '';
        const unit = unitSpan ? unitSpan.textContent.trim() : (defaultUnit || '');
        return composeAmount(input.value.trim(), unit);
    }

    function cmsItemPassesFilters(item, opts = {}) {
        const isRecipe = opts.isRecipe !== false;
        if (cmsSelectedTags.size > 0) {
            const tags = isRecipe ? cmsGetRecipeTags(item) : [];
            if (![...cmsSelectedTags].every(t => tags.includes(t))) return false;
        }
        if (cmsMacroFilters.time.min !== null || cmsMacroFilters.time.max !== null) {
            if (!isRecipe) return true;
            const minutes = cmsParseTimeToMinutes(item.time);
            if (minutes === null) return false;
            if (cmsMacroFilters.time.min !== null && minutes < cmsMacroFilters.time.min) return false;
            if (cmsMacroFilters.time.max !== null && minutes > cmsMacroFilters.time.max) return false;
        }
        const hasMacro = ['cal', 'carbs', 'protein', 'fat'].some(k => cmsMacroFilters[k].min !== null || cmsMacroFilters[k].max !== null);
        if (hasMacro) {
            const std = cmsGetStandardMacros(item);
            if (!std) return false;
            const n = std.normalized;
            const check = (val, f) => {
                if (f.min !== null && val < f.min) return false;
                if (f.max !== null && val > f.max) return false;
                return true;
            };
            return check(n.energy, cmsMacroFilters.cal)
                && check(n.carbs, cmsMacroFilters.carbs)
                && check(n.protein, cmsMacroFilters.protein)
                && check(n.fat, cmsMacroFilters.fat);
        }
        return true;
    }

    const CMS_SLIDER_CONFIGS = {
        cal: { min: 0, max: 2000, step: 50 },
        carbs: { min: 0, max: 200, step: 5 },
        protein: { min: 0, max: 150, step: 5 },
        fat: { min: 0, max: 150, step: 5 },
        time: { min: 0, max: 180, step: 5 }
    };

    let cmsSlidersInitialized = false;
    function initCMSDualSliders() {
        if (cmsSlidersInitialized) return;
        cmsSlidersInitialized = true;
        Object.keys(CMS_SLIDER_CONFIGS).forEach(key => {
            const config = CMS_SLIDER_CONFIGS[key];
            const minInput = document.getElementById(`cms-slider-${key}-min`);
            const maxInput = document.getElementById(`cms-slider-${key}-max`);
            if (!minInput || !maxInput) return;
            const fill = document.getElementById(`cms-slider-${key}-fill`);
            const valDisplay = document.getElementById(`cms-filter-${key}-val`);
            function updateSlider() {
                let minVal = parseFloat(minInput.value);
                let maxVal = parseFloat(maxInput.value);
                if (minVal > maxVal) {
                    const tmp = minVal; minVal = maxVal; maxVal = tmp;
                    minInput.value = minVal; maxInput.value = maxVal;
                }
                if (fill) {
                    fill.style.left = `${(minVal / config.max) * 100}%`;
                    fill.style.width = `${((maxVal - minVal) / config.max) * 100}%`;
                }
                const isMinModified = minVal > config.min;
                const isMaxModified = maxVal < config.max;
                cmsMacroFilters[key].min = isMinModified ? minVal : null;
                cmsMacroFilters[key].max = isMaxModified ? maxVal : null;
                const unit = key === 'cal' ? ' kcal' : key === 'time' ? ' min' : 'g';
                if (valDisplay) {
                    if (isMinModified && isMaxModified) valDisplay.textContent = `${minVal}${unit} – ${maxVal}${unit}`;
                    else if (isMinModified) valDisplay.textContent = `≥ ${minVal}${unit}`;
                    else if (isMaxModified) valDisplay.textContent = `≤ ${maxVal}${unit}`;
                    else valDisplay.textContent = 'Any';
                }
                renderCMSList();
            }
            minInput.addEventListener('input', updateSlider);
            maxInput.addEventListener('input', updateSlider);
        });
        const tagSearchInputEl = document.getElementById('cms-tag-search-input');
        if (tagSearchInputEl) {
            tagSearchInputEl.addEventListener('input', (e) => {
                cmsTagSearch = e.target.value.toLowerCase();
                renderCMSTagChips();
            });
        }
    }

    function renderCMSTagChips() {
        const tagChipsEl = document.getElementById('cms-tag-chips');
        if (!tagChipsEl) return;
        const relevantRecipes = recipes.filter(r => r.entryType !== 'ingredient');
        const tagCounts = {};
        relevantRecipes.forEach(r => {
            cmsGetRecipeTags(r).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
        });
        const query = cmsTagSearch;
        const tags = Object.keys(tagCounts)
            .filter(t => !query || t.toLowerCase().includes(query))
            .sort();
        tagChipsEl.innerHTML = tags.map(tag => {
            const active = cmsSelectedTags.has(tag);
            return `<button type="button" class="filter-chip${active ? ' active' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}<span class="tag-count">${tagCounts[tag]}</span></button>`;
        }).join('') || `<span class="filter-empty-hint">No matching tags</span>`;
        tagChipsEl.querySelectorAll('.filter-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const tag = btn.dataset.tag;
                if (cmsSelectedTags.has(tag)) { cmsSelectedTags.delete(tag); btn.classList.remove('active'); }
                else { cmsSelectedTags.add(tag); btn.classList.add('active'); }
                renderCMSList();
            });
        });
    }

    function updateCMSFilterBadge() {
        if (!filterBadge) return;
        let count = 0;
        if (cmsCategoryFilter !== 'All') count++;
        if (cmsStatusFilter !== 'All') count++;
        count += cmsSelectedTags.size;
        ['cal', 'carbs', 'protein', 'fat', 'time'].forEach(k => {
            if (cmsMacroFilters[k].min !== null || cmsMacroFilters[k].max !== null) count++;
        });
        filterBadge.textContent = String(count);
        if (filterTrigger) filterTrigger.classList.toggle('has-filters', count > 0);
    }

    // --- Auto-calc recipe macros by summing DB ingredient macros ---
    const NUTRIENT_FIELDS = ['fiberG', 'sugarG', 'saturatedFatG', 'monounsaturatedFatG', 'polyunsaturatedFatG', 'transFatG', 'cholesterolMg', 'sodiumMg', 'potassiumMg', 'calciumMg', 'ironMg', 'magnesiumMg', 'phosphorusMg', 'zincMg', 'copperMg', 'seleniumMcg', 'vitaminAMcg', 'vitaminCMg', 'vitaminDMcg', 'vitaminEMg', 'vitaminKMcg', 'thiaminMg', 'riboflavinMg', 'niacinMg', 'pantothenicMg', 'vitaminB6Mg', 'folateMcg', 'vitaminB12Mcg'];
    function recalcMacrosFromIngredients() {
        if (!ingContainer) return;
        const rows = ingContainer.querySelectorAll('.cms-ingredient-row');
        const totals = { energy: 0, carbs: 0, protein: 0, fat: 0, fiberG: 0, sugarG: 0, saturatedFatG: 0, monounsaturatedFatG: 0, polyunsaturatedFatG: 0, transFatG: 0, cholesterolMg: 0, sodiumMg: 0, potassiumMg: 0, calciumMg: 0, ironMg: 0, magnesiumMg: 0, phosphorusMg: 0, zincMg: 0, copperMg: 0, seleniumMcg: 0, vitaminAMcg: 0, vitaminCMg: 0, vitaminDMcg: 0, vitaminEMg: 0, vitaminKMcg: 0, thiaminMg: 0, riboflavinMg: 0, niacinMg: 0, pantothenicMg: 0, vitaminB6Mg: 0, folateMcg: 0, vitaminB12Mcg: 0 };
        const unitToG = { g: 1, kg: 1000, ml: 1, L: 1000 };
        const imperialG = { tbsp: 15, tsp: 5, cups: 240, cup: 240, whole: 100, can: 200, cans: 200, cloves: 5, sprig: 1, sprigs: 1, pinch: 0.3, medium: 100, small: 50, large: 120, slice: 30, piece: 50 };
        rows.forEach(row => {
            const foodId = row.dataset.foodId;
            if (!foodId) return;
            const f = ingredients.find(x => x.foodId === foodId);
            if (!f) return;
            let grams = 0;
            const mNum = parseFloat((row.querySelector('[data-field="metric-num"]') || {}).value);
            const mUnit = row.querySelector('[data-field="metric-unit"]') ? row.querySelector('[data-field="metric-unit"]').value : '';
            if (mNum > 0 && unitToG[mUnit] != null) grams = mNum * unitToG[mUnit];
            if (!grams) {
                const iNum = parseFloat((row.querySelector('[data-field="imperial-num"]') || {}).value);
                const iUnit = row.querySelector('[data-field="imperial-unit"]') ? row.querySelector('[data-field="imperial-unit"]').value : '';
                if (iNum > 0 && imperialG[iUnit] != null) grams = iNum * imperialG[iUnit];
            }
            if (grams <= 0) return;
            const divisor = (f.servingUnit === 'g' || f.servingUnit === 'ml') ? (parseFloat(f.servingSizeG) || 100) : 100;
            totals.energy += (parseFloat(f.calories) || 0) / divisor * grams;
            totals.carbs += (parseFloat(f.carbsG) || 0) / divisor * grams;
            totals.protein += (parseFloat(f.proteinG) || 0) / divisor * grams;
            totals.fat += (parseFloat(f.fatG) || 0) / divisor * grams;
            for (const nf of NUTRIENT_FIELDS) {
                totals[nf] += (parseFloat(f[nf]) || 0) / divisor * grams;
            }
        });

        const refSelect = document.getElementById('macro-reference');
        const refType = refSelect ? refSelect.value : 'per_serving';
        const yieldVal = document.getElementById('macro-yield').value;
        let divisor = 1;
        if (refType === 'per_serving') {
            const m = String(yieldVal).match(/(\d+(?:\.\d+)?)/);
            if (m && parseFloat(m[1]) > 0) divisor = parseFloat(m[1]);
        }
        const round1 = v => Math.round(v / divisor * 10) / 10;
        // Energy is displayed whole; macros and micros keep one decimal place.
        setMacroField('macro-energy', String(Math.round(totals.energy / divisor)), 'kCal');
        setMacroField('macro-carbs', String(round1(totals.carbs)), 'g');
        setMacroField('macro-protein', String(round1(totals.protein)), 'g');
        setMacroField('macro-fat', String(round1(totals.fat)), 'g');
        // Persist full nutrient breakdown so the recipe drawer can show it.
        const breakdown = {};
        for (const nf of NUTRIENT_FIELDS) {
            const v = round1(totals[nf]);
            if (v > 0) breakdown[nf] = v;
        }
        lastMacroBreakdown = breakdown;
    }

    function applyCMSAccent() {
        const catSelect = document.getElementById('recipe-category');
        const accent = getCategoryAccent(catSelect ? catSelect.value : '');
        modal.style.setProperty('--cms-accent', accent);
        if (window.lucide) window.lucide.createIcons();
    }

    // --- Custom Confirmation Dialog ---
    const confirmDialog = document.getElementById('confirm-dialog');
    const confirmTitle = document.getElementById('confirm-dialog-title');
    const confirmMessage = document.getElementById('confirm-dialog-message');
    const confirmOkBtn = document.getElementById('confirm-dialog-ok');
    const confirmCancelBtn = document.getElementById('confirm-dialog-cancel');

    function showConfirmDialog(title, message, okLabel = 'Delete') {
        return new Promise((resolve) => {
            confirmTitle.textContent = title;
            confirmMessage.textContent = message;
            confirmOkBtn.textContent = okLabel;
            confirmDialog.classList.add('active');
            document.body.style.overflow = 'hidden';

            function cleanup() {
                confirmDialog.classList.remove('active');
                document.body.style.overflow = '';
                confirmOkBtn.removeEventListener('click', onOk);
                confirmCancelBtn.removeEventListener('click', onCancel);
                confirmDialog.removeEventListener('click', onBackdrop);
            }
            function onOk() { cleanup(); resolve(true); }
            function onCancel() { cleanup(); resolve(false); }
            function onBackdrop(e) { if (e.target === confirmDialog) { cleanup(); resolve(false); } }

            confirmOkBtn.addEventListener('click', onOk);
            confirmCancelBtn.addEventListener('click', onCancel);
            confirmDialog.addEventListener('click', onBackdrop);
        });
    }

    macroRefSelect.addEventListener('change', (e) => {
        if (e.target.value === 'per_x_g') {
            macroRefAmountGroup.style.display = 'block';
        } else {
            macroRefAmountGroup.style.display = 'none';
        }
    });

    // Re-tint the editor's accent as the recipe category changes.
    document.getElementById('recipe-category').addEventListener('change', () => applyCMSAccent());

    let recipes = [];
    let ingredients = [];
    let mealPlans = [];
    let pantry = []; // legacy - tracking only, will be migrated
    let pantryItems = []; // new structure: { pantryId, ingredientFoodId, brand, productName, packSize, packUnit, price, currency, quantity, isTracked, avgDurationDays, lastOpenedDate, notes }
    let shoppingLists = [];
    let householdItems = [];
    let planner = { goals: {}, items: [] };
    let receipts = [];
    let appSettings = { profiles: [] };
    let currentCMSTab = 'recipe';
    let cmsSearchQuery = '';
    let mealWeekOffset = 0;
    let cmsCategoryFilter = 'All';
    let cmsStatusFilter = 'All';
    let cmsSelectedTags = new Set();
    let cmsTagSearch = '';
    let cmsMacroFilters = {
        cal: { min: null, max: null },
        carbs: { min: null, max: null },
        protein: { min: null, max: null },
        fat: { min: null, max: null },
        time: { min: null, max: null }
    };
    let cmsListView = localStorage.getItem('larder_cms_view') || 'list';
    let lastMacroBreakdown = null;
    let householdOpenFn = null;
    let cmsTableSort = {};

    // Filters are tracked per tab (Recipes vs Ingredients vs Pantry vs Household)
    // so choosing a filter on one screen never leaks onto another. The live
    // state above mirrors the active tab's filters; switching tabs snapshots
    // them here and restores the incoming tab's snapshot.
    const cmsTabFilterSnapshots = {};
    function freshCMSFilters() {
        return {
            category: 'All',
            status: 'All',
            tags: new Set(),
            tagSearch: '',
            search: '',
            macros: {
                cal: { min: null, max: null },
                carbs: { min: null, max: null },
                protein: { min: null, max: null },
                fat: { min: null, max: null },
                time: { min: null, max: null }
            }
        };
    }
    function snapshotTabFilters() {
        cmsTabFilterSnapshots[currentCMSTab] = {
            category: cmsCategoryFilter,
            status: cmsStatusFilter,
            tags: cmsSelectedTags,
            tagSearch: cmsTagSearch,
            search: cmsSearchQuery,
            macros: cmsMacroFilters
        };
    }
    function restoreTabFilters() {
        const snap = cmsTabFilterSnapshots[currentCMSTab] || freshCMSFilters();
        cmsCategoryFilter = snap.category;
        cmsStatusFilter = snap.status;
        cmsSelectedTags = snap.tags;
        cmsTagSearch = snap.tagSearch;
        cmsSearchQuery = snap.search;
        cmsMacroFilters = snap.macros;
    }
    function applyCMSFilterUI() {
        Object.keys(CMS_SLIDER_CONFIGS).forEach(key => {
            const cfg = CMS_SLIDER_CONFIGS[key];
            const m = cmsMacroFilters[key] || {};
            const minInput = document.getElementById(`cms-slider-${key}-min`);
            const maxInput = document.getElementById(`cms-slider-${key}-max`);
            const lo = (m.min !== null && m.min !== undefined) ? m.min : cfg.min;
            const hi = (m.max !== null && m.max !== undefined) ? m.max : cfg.max;
            if (minInput) minInput.value = lo;
            if (maxInput) maxInput.value = hi;
            const fill = document.getElementById(`cms-slider-${key}-fill`);
            if (fill) {
                fill.style.left = `${(lo / cfg.max) * 100}%`;
                fill.style.width = `${((hi - lo) / cfg.max) * 100}%`;
            }
            const valDisplay = document.getElementById(`cms-filter-${key}-val`);
            const unit = key === 'cal' ? ' kcal' : key === 'time' ? ' min' : 'g';
            const isMin = m.min !== null && m.min !== undefined;
            const isMax = m.max !== null && m.max !== undefined;
            if (valDisplay) {
                if (isMin && isMax) valDisplay.textContent = `${lo}${unit} – ${hi}${unit}`;
                else if (isMin) valDisplay.textContent = `≥ ${lo}${unit}`;
                else if (isMax) valDisplay.textContent = `≤ ${hi}${unit}`;
                else valDisplay.textContent = 'Any';
            }
        });
        const tagSearchBx = document.getElementById('cms-tag-search-input');
        if (tagSearchBx) tagSearchBx.value = cmsTagSearch;
        if (searchInput) searchInput.value = cmsSearchQuery;
    }
    // When the Monthly Planner asks to generate a shopping list, these sources
    // are pre-ticked and auto-generated when the Shopping tab renders.
    let pendingShoppingSources = null;

    const cmsTabs = document.getElementById('cms-tabs');
    const searchInput = document.getElementById('cms-search');
    const searchTrigger = document.getElementById('cms-search-trigger');
    const searchBarWrap = document.getElementById('cms-search-wrap');
    const searchClose = document.getElementById('cms-search-close');
    const viewToggle = document.getElementById('cms-view-toggle');
    const filterTrigger = document.getElementById('cms-filter-trigger');
    const filterDropdown = document.getElementById('cms-filter-dropdown');
    const filterBadge = document.getElementById('cms-filter-badge');
    const filterChips = document.getElementById('cms-filter-category-chips');
    const filterStatusChips = document.getElementById('cms-filter-status-chips');
    const filterReset = document.getElementById('cms-filter-reset');

    // Keeps the span inside #add-recipe-btn (avoids wiping it via innerHTML).
    function setAddBtnLabel(text) {
        const span = document.getElementById('add-btn-label');
        if (span) span.textContent = text;
        else addBtn.lastChild && addBtn.removeChild(addBtn.lastChild);
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            cmsSearchQuery = e.target.value.toLowerCase();
            renderCMSList();
        });
    }

    // Icon-expanding search bar (mirrors index.html behaviour).
    if (searchTrigger && searchBarWrap) {
        searchTrigger.addEventListener('click', () => {
            searchBarWrap.classList.add('active');
            searchTrigger.style.opacity = '0';
            searchInput.focus();
        });
    }
    if (searchClose && searchInput) {
        searchClose.addEventListener('click', () => {
            searchBarWrap.classList.remove('active');
            searchTrigger.style.opacity = '';
            searchInput.value = '';
            cmsSearchQuery = '';
            renderCMSList();
        });
    }
    document.addEventListener('click', (e) => {
        if (searchBarWrap && searchTrigger && !searchBarWrap.contains(e.target) && !searchTrigger.contains(e.target)) {
            searchBarWrap.classList.remove('active');
            searchTrigger.style.opacity = '';
        }
    });

    // Grid/List (or Cards/Table for pantry & household) view toggle.
    if (viewToggle) {
        viewToggle.addEventListener('click', () => {
            if (currentCMSTab === 'pantry' || currentCMSTab === 'household') {
                const key = currentCMSTab === 'pantry' ? 'larder_pantry_view' : 'larder_household_view';
                const cur = localStorage.getItem(key) || 'cards';
                localStorage.setItem(key, cur === 'cards' ? 'table' : 'cards');
            } else {
                cmsListView = cmsListView === 'grid' ? 'list' : 'grid';
                localStorage.setItem('larder_cms_view', cmsListView);
            }
            renderCMSList();
        });
    }
    // Filter trigger toggles the dropdown panel.
    if (filterTrigger) {
        filterTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (filterDropdown) filterDropdown.classList.toggle('active');
        });
    }
    document.addEventListener('click', (e) => {
        if (filterDropdown && filterDropdown.classList.contains('active') && !filterDropdown.contains(e.target) && e.target !== filterTrigger && !(filterTrigger && filterTrigger.contains(e.target))) {
            filterDropdown.classList.remove('active');
        }
    });
    if (filterReset) {
        filterReset.addEventListener('click', () => {
            cmsCategoryFilter = 'All';
            cmsStatusFilter = 'All';
            cmsSelectedTags.clear();
            cmsTagSearch = '';
            ['cal', 'carbs', 'protein', 'fat', 'time'].forEach(key => {
                cmsMacroFilters[key].min = null;
                cmsMacroFilters[key].max = null;
            });
            ['cal', 'carbs', 'protein', 'fat', 'time'].forEach(key => {
                const cfg = CMS_SLIDER_CONFIGS[key];
                const minInput = document.getElementById(`cms-slider-${key}-min`);
                const maxInput = document.getElementById(`cms-slider-${key}-max`);
                if (minInput) minInput.value = cfg.min;
                if (maxInput) maxInput.value = cfg.max;
                const fill = document.getElementById(`cms-slider-${key}-fill`);
                if (fill) { fill.style.left = '0%'; fill.style.width = '100%'; }
                const valDisplay = document.getElementById(`cms-filter-${key}-val`);
                if (valDisplay) valDisplay.textContent = 'Any';
            });
            const tagSearchInputEl = document.getElementById('cms-tag-search-input');
            if (tagSearchInputEl) tagSearchInputEl.value = '';
            renderCMSList();
        });
    }
    const activateTab = (tab) => {
        snapshotTabFilters();
        document.querySelectorAll('.cms-tab').forEach(t => {
            t.classList.remove('active');
        });
        if (tab) tab.classList.add('active');
        document.querySelectorAll('.cms-sidebar .cms-tab').forEach(t => {
            t.tabIndex = (tab && t === tab) ? 0 : -1;
        });
        currentCMSTab = tab ? tab.dataset.tab : 'settings';
        restoreTabFilters();
        applyCMSFilterUI();
        if (filterDropdown) filterDropdown.classList.remove('active');
        renderCMSList();
    };
    document.querySelectorAll('.cms-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            if (!tab.dataset.tab) return; // external link (e.g. Workouts page)
            activateTab(tab);
        });
    });
    // Support deep links like cms.html#food (used by the Workouts page sidebar).
    const hashTab = location.hash && location.hash.replace('#', '');
    if (hashTab) {
        const target = document.querySelector(`.cms-sidebar .cms-tab[data-tab="${hashTab}"]`);
        if (target) activateTab(target);
    }
    // Keyboard column navigation: Arrow Up/Down moves across sidebar tabs.
    //
    // Roving tabindex: only the active tab is in the Tab order; arrows move focus
    // between tabs. Enter/Space activate. This makes the whole left column
    // navigable by keyboard without tabbing out of the sidebar.
    (function setupSidebarNav() {
        const navTabs = Array.from(document.querySelectorAll('.cms-sidebar .cms-tab'));
        if (!navTabs.length) return;
        navTabs.forEach((tab, i) => {
            tab.tabIndex = -1;
            tab.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    let next = (e.key === 'ArrowDown') ? i + 1 : i - 1;
                    if (next < 0) next = navTabs.length - 1;
                    if (next > navTabs.length - 1) next = 0;
                    navTabs[next].focus();
                }
            });
        });
        // Put the active tab into the Tab order.
        const active = navTabs.find(t => t.classList.contains('active')) || navTabs[0];
        if (active) active.tabIndex = 0;
    })();
    // Settings lives in the sidebar footer, not the tab groups.
    const cmsSettingsBtn = document.getElementById('cms-settings-btn');
    if (cmsSettingsBtn) {
        cmsSettingsBtn.addEventListener('click', () => activateTab(null));
    }

    // --- Load Data ---
    const API_KEY = 'larder_local_sync_8f92k';
    const HEADERS = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
    };

    // Migrate legacy-format meal plans (shared items + portion map) to the
    // per-eater format used by the redesigned assignment modal.
    function normalizePlan(plan) {
        if (!plan || typeof plan !== 'object') return plan;
        // Already in per-eater format (eaters is an array of {idx, eatingOut, items}).
        if (Array.isArray(plan.eaters) && plan.eaters.length && typeof plan.eaters[0] === 'object') return plan;
        if (!Array.isArray(plan.items) && !plan.isEatingOut) return plan;

        const profiles = (appSettings.profiles && appSettings.profiles.length)
            ? appSettings.profiles
            : [{ name: 'User' }];
        const selectedEaters = Array.isArray(plan.eaters) ? plan.eaters.map(Number) : [];
        const servingSizeG = parseFloat(plan.servingSizeG) || 250;

        const eaters = profiles.map((p, idx) => {
            const included = !plan.isEatingOut && selectedEaters.includes(idx);
            const items = [];
            if (included) {
                (plan.items || []).forEach(item => {
                    let grams = plan.portions && plan.portions[idx] != null
                        ? parseFloat(plan.portions[idx])
                        : null;
                    if (!(grams > 0) && item.type === 'recipe') grams = parseFloat(item.servingSizeG) || servingSizeG;
                    if (!(grams > 0) && item.type === 'ingredient') {
                        const foodRef = (ingredients || []).find(f => f.foodId === item.referenceId);
                        grams = LC.gramsOf(item.amount, item.unit, foodRef);
                    }
                    if (!(grams > 0)) return;
                    items.push({
                        type: item.type,
                        referenceId: item.referenceId,
                        name: item.name,
                        servingSizeG: item.type === 'recipe' ? (parseFloat(item.servingSizeG) || servingSizeG) : undefined,
                        grams
                    });
                });
            }
            return { idx, eatingOut: !included, items };
        });

        return { ...plan, isEatingOut: !!plan.isEatingOut, eaters };
    }

    async function loadData(retryCount = 0) {
        try {
            const [resRecipes, resIngredients, resMealPlans, resPantry, resShoppingLists, resHousehold, resSettings, resPlanner, resReceipts, resPantryItems] = await Promise.all([
                fetch('/api/recipes', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/ingredients', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/mealplans', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/pantry', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/shoppinglists', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/household', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/settings', { headers: HEADERS }).then(r => r.ok ? r.json() : { profiles: [] }),
                fetch('/api/planner', { headers: HEADERS }).then(r => r.ok ? r.json() : null),
                fetch('/api/receipts', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/pantry-items', { headers: HEADERS }).then(r => r.ok ? r.json() : [])
            ]);
            recipes = resRecipes;
            ingredients = resIngredients;
            mealPlans = resMealPlans;
            pantry = resPantry; // legacy tracking data
            pantryItems = Array.isArray(resPantryItems) ? resPantryItems : [];
            shoppingLists = resShoppingLists;
            householdItems = Array.isArray(resHousehold) ? resHousehold : [];
            appSettings = (resSettings && typeof resSettings === 'object' && !Array.isArray(resSettings) && Array.isArray(resSettings.profiles))
                ? resSettings
                : { profiles: resSettings && Array.isArray(resSettings.profiles) ? resSettings.profiles : [] };
            planner = (resPlanner && typeof resPlanner === 'object' && !Array.isArray(resPlanner))
                ? { goals: resPlanner.goals || {}, items: Array.isArray(resPlanner.items) ? resPlanner.items : [] }
                : { goals: {}, items: [] };
            receipts = Array.isArray(resReceipts) ? resReceipts : [];
            
            // Migrate legacy pantry tracking data to new pantry items if needed
            if (pantryItems.length === 0 && pantry.length > 0) {
                migrateLegacyPantry();
            }
            
            mealPlans = (mealPlans || []).map(normalizePlan);
            
            statusText.innerHTML = `<span class="status-dot"></span> Connected · ${recipes.length} recipes · ${ingredients.length} ingredients · ${pantryItems.length} pantry items`;
            addBtn.classList.remove('hidden');
            if (cmsTabs) cmsTabs.classList.remove('hidden');
            renderCMSList();
        } catch(e) {
            if (retryCount < 5) {
                setTimeout(() => loadData(retryCount + 1), 1000);
                return;
            }
            statusText.textContent = '⚠ Could not connect. Run: node server.js';
            statusText.style.color = '#D1777D';
            if (listContainer) {
                listContainer.innerHTML = '<div class="empty-state" style="color: #D1777D;">⚠ Could not connect to the local server. Make sure it is running.</div>';
            }
        }
    }

    loadData();

    async function saveRecipes() {
        try {
            const res = await fetch('/api/recipes', {
                method: 'PUT',
                headers: HEADERS,
                body: JSON.stringify(recipes)
            });
            if (!res.ok) throw new Error('Save failed');
            const result = await res.json();
            statusText.innerHTML = `<span class="status-dot"></span> Saved recipes`;
        } catch(e) {
            alert('Save failed. Reverting to previous state.');
            loadData();
        }
    }

    async function saveIngredients() {
        try {
            const res = await fetch('/api/ingredients', {
                method: 'PUT',
                headers: HEADERS,
                body: JSON.stringify(ingredients)
            });
            if (!res.ok) throw new Error('Save failed');
            const result = await res.json();
            statusText.innerHTML = `<span class="status-dot"></span> Saved ingredients`;
        } catch(e) {
            alert('Save failed. Reverting to previous state.');
            loadData();
        }
    }

    async function savePantry() {
        try {
            const res = await fetch('/api/pantry', {
                method: 'PUT',
                headers: HEADERS,
                body: JSON.stringify(pantry)
            });
            if (!res.ok) throw new Error('Save failed');
            statusText.innerHTML = `<span class="status-dot"></span> Saved pantry`;
        } catch(e) {
            alert('Save failed. Reverting to previous state.');
            loadData();
        }
    }

    async function savePantryItems() {
        try {
            const res = await fetch('/api/pantry-items', {
                method: 'PUT',
                headers: HEADERS,
                body: JSON.stringify(pantryItems)
            });
            if (!res.ok) throw new Error('Save failed');
            statusText.innerHTML = `<span class="status-dot"></span> Saved pantry items`;
        } catch(e) {
            alert('Save failed. Reverting to previous state.');
            loadData();
        }
    }

    function migrateLegacyPantry() {
        // Convert legacy pantry tracking entries to new pantry items
        const newItems = pantry.map(p => ({
            pantryId: `legacy-${p.foodId}`,
            ingredientFoodId: p.foodId,
            brand: '',
            productName: (ingredients.find(i => i.foodId === p.foodId) || {}).name || 'Unknown',
            packSize: parseFloat((ingredients.find(i => i.foodId === p.foodId) || {}).servingSizeG) || 100,
            packUnit: (ingredients.find(i => i.foodId === p.foodId) || {}).servingUnit || 'g',
            price: 0,
            currency: 'MUR',
            quantity: p.quantity || 0,
            isTracked: p.isTracked || false,
            avgDurationDays: parseFloat(p.avgDurationDays) || 0,
            lastOpenedDate: p.lastOpenedDate || null,
            notes: ''
        }));
        pantryItems = newItems;
        savePantryItems();
    }

    async function savePlanner() {
        try {
            const res = await fetch('/api/planner', {
                method: 'PUT',
                headers: HEADERS,
                body: JSON.stringify(planner)
            });
            if (!res.ok) throw new Error('Save failed');
            statusText.innerHTML = `<span class="status-dot"></span> Saved planner`;
        } catch(e) {
            alert('Save failed. Reverting to previous state.');
            loadData();
        }
    }

    async function saveReceipts() {
        try {
            const res = await fetch('/api/receipts', {
                method: 'PUT',
                headers: HEADERS,
                body: JSON.stringify(receipts)
            });
            if (!res.ok) throw new Error('Save failed');
            statusText.innerHTML = `<span class="status-dot"></span> Saved receipts`;
        } catch(e) {
            alert('Save failed. Reverting to previous state.');
            loadData();
        }
    }

    async function saveHousehold() {
        try {
            const res = await fetch('/api/household', {
                method: 'PUT',
                headers: HEADERS,
                body: JSON.stringify(householdItems)
            });
            if (!res.ok) throw new Error('Save failed');
            statusText.innerHTML = `<span class="status-dot"></span> Saved household supplies`;
        } catch(e) {
            alert('Save failed. Reverting to previous state.');
            loadData();
        }
    }

    // --- Render CMS List ---
    function populateIngredientSuggestions() {
        const datalist = document.getElementById('ingredient-suggestions');
        if (!datalist) return;
        datalist.innerHTML = ingredients.map(f => `<option value="${escapeHtml(f.name)}">`).join('');
    }

function renderPlanner() {
        const container = document.getElementById('cms-recipe-list');
        if (!container) return;

const goals = Object.assign({
            energyMin: 0, energyMax: 0, carbsMin: 0, carbsMax: 0,
            proteinMin: 0, proteinMax: 0, fatMin: 0, fatMax: 0,
            satFatMax: 0, transFatMax: 0, fiberMin: 0,
            sodiumMax: 0, potassiumMin: 0, potassiumMax: 0, calciumMin: 0,
            magnesiumMin: 0, magnesiumMax: 0, phosphorusMin: 0, phosphorusMax: 0,
            ironMin: 0, ironMax: 0, zincMin: 0, zincMax: 0,
            copperMin: 0, copperMax: 0, seleniumMin: 0, seleniumMax: 0,
            vitAMin: 0, vitAMax: 0, vitCMin: 0, vitCMax: 0, vitDMin: 0, vitDMax: 0,
            vitEMin: 0, vitEMax: 0, vitKMin: 0, vitKMax: 0,
            thiaminMin: 0, thiaminMax: 0, riboflavinMin: 0, riboflavinMax: 0,
            niacinMin: 0, niacinMax: 0, vitB6Min: 0, vitB6Max: 0,
            folateMin: 0, folateMax: 0, b12Min: 0, b12Max: 0,
            meatProteinPct: 50, budget: 0, currency: ''
        }, planner.goals || {});
        const currency = goals.currency
            || (appSettings.shopping && appSettings.shopping.currency)
            || (ingredients.find(i => parseFloat(i.averagePrice) > 0) || {}).priceCurrency
            || 'MUR';
        const SYM = { MUR: 'Rs', LKR: 'Rs', NPR: 'Rs', PKR: 'Rs', USD: '$', CAD: '$', AUD: '$', SGD: '$', EUR: '€', GBP: '£', INR: '₹', BDT: '৳' };
        const fmt = n => (SYM[currency] || '') + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        function findIng(id) { return ingredients.find(f => f.foodId === id); }
        function gramsOf(item) { return LC.gramsOf(item && item.amount, item && item.unit, findIng(item.ingredientId)); }
        function perGramOf(ing) { return LC.perGram(ing); }

        // Energy & Macros goals come from the eater profiles by default: sum every
        // eater's daily targets and scale to a 30-day month. Prefills the goal
        // inputs but stays editable as a manual override.
        function profileMonthTargets() {
            const profiles = (appSettings.profiles && appSettings.profiles.length)
                ? appSettings.profiles
                : [{ name: 'User', calories: 2000, carbs: 40, protein: 30, fat: 30 }];
            const num = v => (parseFloat(v) || 0);
            const daily = { energy: 0, protein: 0, carbs: 0, fat: 0 };
            profiles.forEach(p => {
                const cal = num(p.calories);
                daily.energy += cal;
                daily.protein += Math.round(cal * (num(p.protein) / 100) / 4);
                daily.carbs += Math.round(cal * (num(p.carbs) / 100) / 4);
                daily.fat += Math.round(cal * (num(p.fat) / 100) / 9);
            });
            return {
                energy: Math.round(daily.energy * 30),
                protein: Math.round(daily.protein * 30),
                carbs: Math.round(daily.carbs * 30),
                fat: Math.round(daily.fat * 30)
            };
        }
        const macroDefaults = profileMonthTargets();
        const macroKeys = { energy: 'energy', protein: 'protein', carbs: 'carbs', fat: 'fat' };
        // Effective goal for a key: the saved value if set, else the profile-derived
        // month target. Used by the goal inputs, the flag() checks and total bars.
        function effGoal(key) {
            const v = parseFloat(goals[key]) || 0;
            if (v > 0) return v;
            const base = key.replace(/Min$|Max$/, '');
            return macroKeys[base] ? macroDefaults[macroKeys[base]] : 0;
        }

        const t = LC.computeTotals(planner.items, ingredients);

        // Unified unit list shared by the planner builder (add + per-item rows).
        // Standardised across the app for consistent buys/weights.
        const UNIT_OPTIONS = ['g', 'kg', 'ml', 'L', 'cups', 'tbsp', 'tsp',
            'piece', 'pieces', 'each', 'whole', 'clove', 'cloves', 'slice', 'slices',
            'can', 'cans', 'pinch', 'sprig', 'sprigs', 'bunch', 'medium', 'large', 'small', 'head'];
        function unitSelect(cur, attrs) {
            const safe = (cur || 'g') === '' ? 'g' : (cur || 'g');
            const opts = UNIT_OPTIONS.concat(safe).filter((v, i, a) => a.indexOf(v) === i);
            return `<select class="${attrs.cls || 'pl-unit sel-unit'}" ${attrs.id ? `id="${attrs.id}"` : ''} ${attrs.data || ''}>
                ${opts.map(u => `<option value="${escapeHtml(u)}" ${u === safe ? 'selected' : ''}>${escapeHtml(u)}</option>`).join('')}
            </select>`;
        }

function flag(minKey, maxKey, value) {
            const mn = parseFloat(effGoal(minKey)) || 0;
            const mx = parseFloat(effGoal(maxKey)) || 0;
            if (mx > 0 && value > mx) return 'over';
            if (mn > 0 && value < mn) return 'under';
            if (mx > 0 || mn > 0) return 'ok';
            return '';
        }
function totalRow(label, value, unit, minKey, maxKey) {
            const fg = flag(minKey, maxKey, value);
            const mx = parseFloat(effGoal(maxKey)) || 0;
            const mn = parseFloat(effGoal(minKey)) || 0;
            const barPct = mx > 0 ? Math.min(100, value / mx * 100) : (mn > 0 ? Math.min(100, value / mn * 100) : 0);
            const isOver = fg === 'over';
            const isUnder = fg === 'under';
            const cls = (isOver || isUnder) ? 'red' : 'blue';
            // Arrow indicator saves horizontal space vs a text flag.
            const arrow = isOver ? '&#9650;' : (isUnder ? '&#9660;' : '&nbsp;');
            const title = isOver ? 'Over target' : (isUnder ? 'Under target' : '');
            const target = mx > 0 ? mx : (mn > 0 ? mn : 0);
            const valueTxt = value.toFixed(0).toLocaleString();
            const targetTxt = target > 0 ? target.toLocaleString() : '';
            return `<div class="pl-total-row">
                <div class="pl-total-label" title="${escapeHtml(label)}">${escapeHtml(label)}</div>
                <div class="pl-total-bar"><div class="pl-total-fill ${cls}" style="width:${barPct}%"></div></div>
                <div class="pl-total-val ${cls}"><span class="pl-total-now">${valueTxt}<span class="pl-total-unit">${unit}</span></span>${target > 0 ? `<span class="pl-total-target">/ ${targetTxt}${unit}</span>` : ''}</div>
                <div class="pl-total-flag ${cls}" title="${title}">${arrow}</div>
            </div>`;
        }

// --- Goals card ---
        // A group keeps the grid tidy: headings first, then each nutrient that
        // maps to a min/max input. Micro fields use their computed-total keys.
        const GOAL_GROUPS = [
            {
                title: 'Energy & Macros', values: 'kcal / g',
                cells: [
                    ['energy', 'Energy', 'kcal', 'both'],
                    ['protein', 'Protein', 'g', 'both'],
                    ['carbs', 'Carbs', 'g', 'both'],
                    ['fat', 'Fat', 'g', 'both']
                ]
            },
            {
                title: 'Fats & Fibre', values: 'g',
                cells: [
                    ['satFat', 'Saturated fat', 'g', 'max'],
                    ['transFat', 'Trans fat', 'g', 'max'],
                    ['fiber', 'Fiber', 'g', 'min']
                ]
            },
            {
                title: 'Minerals', values: 'mg (Se μg)',
                cells: [
                    ['sodium', 'Sodium', 'mg', 'max'],
                    ['potassium', 'Potassium', 'mg', 'both'],
                    ['calcium', 'Calcium', 'mg', 'min'],
                    ['magnesium', 'Magnesium', 'mg', 'both'],
                    ['phosphorus', 'Phosphorus', 'mg', 'both'],
                    ['iron', 'Iron', 'mg', 'both'],
                    ['zinc', 'Zinc', 'mg', 'both'],
                    ['copper', 'Copper', 'mg', 'both'],
                    ['selenium', 'Selenium', 'μg', 'both']
                ]
            },
            {
                title: 'Vitamins', values: 'μg / mg',
                cells: [
                    ['vitA', 'Vitamin A', 'μg RAE', 'both'],
                    ['vitC', 'Vitamin C', 'mg', 'both'],
                    ['vitD', 'Vitamin D', 'μg', 'both'],
                    ['vitE', 'Vitamin E', 'mg', 'both'],
                    ['vitK', 'Vitamin K', 'μg', 'both'],
                    ['thiamin', 'Vitamin B1 (thiamin)', 'mg', 'both'],
                    ['riboflavin', 'Vitamin B2', 'mg', 'both'],
                    ['niacin', 'Vitamin B3 (niacin)', 'mg', 'both'],
                    ['vitB6', 'Vitamin B6', 'mg', 'both'],
                    ['folate', 'Folate (B9)', 'μg', 'both'],
                    ['b12', 'Vitamin B12', 'μg', 'both']
                ]
            }
        ];
        // Map each goal key to the computed-totals field it tracks.
        const GOAL_TOTALS = {
            energy: 'energy', protein: 'protein', carbs: 'carbs', fat: 'fat',
            satFat: 'satFat', transFat: 'transFatG', fiber: 'fiber',
            sodium: 'sodiumMg', potassium: 'potassiumMg', calcium: 'calciumMg',
            magnesium: 'magnesiumMg', phosphorus: 'phosphorusMg', iron: 'ironMg',
            zinc: 'zincMg', copper: 'copperMg', selenium: 'seleniumMcg',
            vitA: 'vitaminAMcg', vitC: 'vitaminCMg', vitD: 'vitD',
            vitE: 'vitaminEMg', vitK: 'vitaminKMcg', thiamin: 'thiaminMg',
            riboflavin: 'riboflavinMg', niacin: 'niacinMg', vitB6: 'vitaminB6Mg',
            folate: 'folateMcg', b12: 'vitaminB12Mcg'
        };
        const goalCells = GOAL_GROUPS.map((group, gi) => `
            <details class="pln-goal-group">
                <summary class="pln-goal-group-title">
                    <i data-lucide="chevron-right" class="pln-chev"></i>
                    ${group.title} <span class="pln-goal-group-unit">(${group.values})</span>
                </summary>
                <div class="pln-goal-group-grid">
                ${group.cells.map(([key, label, unit, mode]) => {
                    const showMin = mode === 'both' || mode === 'min';
                    const showMax = mode === 'both' || mode === 'max';
                    const isMacro = !!macroKeys[key];
                    const minVal = goals[key + 'Min'] || '';
                    const maxVal = goals[key + 'Max'] || '';
                    const minPh = isMacro ? effGoal(key + 'Min') : '–';
                    const maxPh = isMacro ? effGoal(key + 'Max') : '–';
                    return `
                    <div class="pln-goal-cell">
                        <div class="pln-goal-label">${label}<span class="pln-goal-unit">${unit}</span></div>
                        <div class="pln-goal-inputs">
                            ${showMin ? `<div class="pln-goal-min"><span class="pln-input-tag">min</span><input type="number" class="pln-goal-input" data-goal="${key}Min" value="${minVal}" placeholder="${minPh}"></div>` : ''}
                            ${showMax ? `<div class="pln-goal-max"><span class="pln-input-tag">max</span><input type="number" class="pln-goal-input" data-goal="${key}Max" value="${maxVal}" placeholder="${maxPh}"></div>` : ''}
                        </div>
                    </div>`;
                }).join('')}
                </div>
            </details>
        `).join('');

let html = '';
        // Toolbar: inline-editable monthly budget (auto-saves on blur) + a button
        // that opens the Monthly Nutrition Goals editor in a modal.
        html += `
        <div class="planner-wrap">
        <div class="planner-toolbar">
            <label class="pl-budget-editor" title="Monthly budget — edit in place, saved on leave">
                <i data-lucide="wallet" style="width:15px;height:15px;color:var(--accent-sea);"></i>
                <span class="pl-budget-label">Budget</span>
                <input type="number" class="pl-budget-input" value="${goals.budget || 0}" min="0" step="any">
                <span class="pl-budget-c">${currency}</span>
            </label>
            <div class="pl-toolbar-spacer"></div>
            <button class="btn secondary" id="planner-open-goals" style="font-size:14px;"><i data-lucide="target" style="width:15px;height:15px;"></i> Monthly Nutrition Goals</button>
        </div>
        <div class="planner-grid">
        <div class="planner-main">`;

// --- Live totals vs goals (all tracked nutrients, grouped like the goals) ---
        const animalPct = t.meat > 0 ? Math.round(t.animal / t.meat * 100) : 0;
        const aGoal = parseFloat(goals.meatProteinPct) || 0;
        const aCls = (aGoal > 0 && Math.abs(animalPct - aGoal) > 10) ? 'red' : (aGoal > 0 ? 'blue' : '');
        const totGroupRows = GOAL_GROUPS.map(g => `
            <div class="pl-total-group">
                <div class="pl-total-group-title">${g.title} <span class="pln-goal-group-unit">(${g.values})</span></div>
${g.cells.map(([key, label, unit]) => {
                    const totKey = GOAL_TOTALS[key];
                    const value = typeof t[totKey] === 'number' ? t[totKey] : 0;
                    return totalRow(label, value, (key === 'sodium' ? 'mg' : unit), key + 'Min', key + 'Max');
                }).join('')}
            </div>`).join('');
const overBudget = parseFloat(goals.budget) > 0 && t.cost > parseFloat(goals.budget);
        const projectedCard = `
        <aside class="planner-side">
        <div class="planner-card">
            <div class="planner-card-head"><i data-lucide="gauge" style="width:18px;height:18px;"></i> Projected month totals <span class="planner-hint">live vs your goals</span></div>
            <div class="pl-totals">${totGroupRows}\n                <div class="pl-total-row"><div class="pl-total-label">Animal protein %</div><div class="pl-total-bar"><div class="pl-total-fill ${aCls}" style="width:${Math.min(100, animalPct)}%"></div></div><div class="pl-total-val ${aCls}">${animalPct}% / ${aGoal}%</div><div class="pl-total-flag ${aCls}">&nbsp;</div></div>
            </div>
            <div class="pl-cost-line">Estimated monthly cost: <strong class="${overBudget ? 'red' : ''}">${fmt(t.cost)}</strong> <span class="pln-note">/ ${fmt(goals.budget || 0)} ${overBudget ? '&mdash; over!' : ''}</span></div>
        </div>
        </aside>`;

// --- Builder ---
        const suggestionChips = ingredients.slice().sort((a, b) => (parseFloat(b.averagePrice) || 0) - (parseFloat(a.averagePrice) || 0)).slice(0, 8)
            .map(s => `<button type="button" class="pl-sugg-chip" data-name="${escapeHtml(s.name)}" data-foodid="${escapeHtml(s.foodId)}">${escapeHtml(s.name)}</button>`).join('');
        const rows = (planner.items || []).map((it, i) => {
            const ing = findIng(it.ingredientId);
            const c = perGramOf(ing) * gramsOf(it);
            const scopeOn = it.scope === 'month';
return `<div class="pl-item" data-idx="${i}">
                <div class="pl-item-name" title="${escapeHtml(ing ? ing.name : (it.name || '?'))}">${escapeHtml(ing ? ing.name : (it.name || '?'))}</div>
                <div class="pl-item-amount"><label class="pl-amount-label"><input type="number" class="pl-amount seamless-input" data-idx="${i}" value="${it.amount || ''}" step="any" min="0" style="width:64px;"></label>${unitSelect(it.unit, { cls: 'pl-unit sel-unit seamless-select', data: `data-idx="${i}"` })}</div>
                <div class="pl-item-cost">${fmt(c)}</div>
                <label class="pln-check" title="Apply existing pantry/household stock so this stays off the shopping list"><input type="checkbox" class="pl-usesock" data-idx="${i}" ${it.useStock ? 'checked' : ''}><span>use stock</span></label>
                <label class="pln-check" title="Long-life staple bought once for the month; otherwise refreshed weekly"><input type="checkbox" class="pl-scope" data-idx="${i}" ${scopeOn ? 'checked' : ''}><span>month</span></label>
                <button class="pl-item-remove" data-idx="${i}" title="Remove">&times;</button>
            </div>`;
        }).join('');
        html += `
        <div class="planner-card">
            <div class="planner-card-head"><i data-lucide="plus-square" style="width:18px;height:18px;"></i> Build the ingredient list <span class="planner-hint"><span class="red-note">red</span> over target &middot; <span class="blue-note">blue</span> near target</span></div>
<div class="pl-add-row">
<div class="pl-picker">
                    <input class="seamless-input pl-ing-picker" id="pl-ing-name" placeholder="Search ingredient&hellip;" autocomplete="off">
                    <div class="pl-picker-results" id="pl-ing-results"></div>
                </div>
                <label class="pl-amount-label pl-new-amount-label"><input type="number" class="seamless-input pl-new-amount" id="pl-new-amount" placeholder="Qty" step="any" min="0" style="width:64px;"></label>
                ${unitSelect('g', { cls: 'pl-new-unit sel-unit seamless-select', id: 'pl-new-unit' })}
                <button class="btn primary" id="pl-add-btn">Add</button>
            </div>
            ${suggestionChips ? `<div class="pl-sugg">Suggestions: ${suggestionChips}</div>` : ''}
            <div class="pl-list">${rows || '<div class="empty-state">No planned items yet &mdash; add your month&apos;s groceries above.</div>'}</div>
            <div class="plorer-list-actions"><button class="btn primary" id="pl-generate-btn"><i data-lucide="shopping-basket"></i> Generate shopping list</button></div>
        </div>
        <div id="pl-generated" class="planner-card"></div>
        </div>
        ${projectedCard}
        </div>
        <div class="pl-modal-backdrop" id="pl-goals-modal">
            <div class="pl-modal">
                <div class="pl-modal-head">
                    <div class="pl-modal-title"><i data-lucide="target" style="width:18px;height:18px;"></i> Monthly Nutrition Goals</div>
                    <button type="button" class="pl-modal-close" id="pl-goals-close" aria-label="Close">&times;</button>
                </div>
                <p class="pl-modal-desc">Energy &amp; macros default from your eater profiles (automatically summed over 30 days). Adjust min&ndash;max boundaries for the month if you need to override them.</p>
                <div class="pl-modal-body">${goalCells}
                    <div class="planner-goals-sub">
                        <div class="pln-sub-item"><label>Protein from animal sources</label><input type="number" class="pln-goal-sub" data-goal="meatProteinPct" value="${goals.meatProteinPct || 0}" min="0" max="100" style="width:70px;text-align:right;"> %</div>
                    </div>
                </div>
                <div class="pl-modal-foot">
                    <button type="button" class="btn secondary" id="pl-goals-cancel" style="font-size:14px;">Cancel</button>
                    <button type="button" class="btn primary" id="planner-save-goals" style="font-size:14px;"><i data-lucide="save" style="width:15px;height:15px;"></i> Save goals</button>
                </div>
            </div>
        </div>
        </div>`;

        container.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();

const saveGoalsFromDOM = () => {
            container.querySelectorAll('[data-goal]').forEach(el => {
                const key = el.dataset.goal;
                if (key === 'currency') planner.goals[key] = el.value || 'MUR';
                else planner.goals[key] = parseFloat(el.value) || 0;
            });
        };

        // Modal open / close
        const openGoalModal = () => {
            const m = container.querySelector('#pl-goals-modal');
            if (m) m.classList.add('open');
        };
        const closeGoalModal = () => {
            const m = container.querySelector('#pl-goals-modal');
            if (m) m.classList.remove('open');
        };
        const openBtn = container.querySelector('#planner-open-goals');
        if (openBtn) openBtn.addEventListener('click', openGoalModal);
        const closeBtn = container.querySelector('#pl-goals-close');
        if (closeBtn) closeBtn.addEventListener('click', closeGoalModal);
        const cancelBtn = container.querySelector('#pl-goals-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', closeGoalModal);

        // Save goals from the modal (re-renders so projected totals update).
        const saveGoalsBtn = container.querySelector('#planner-save-goals');
        if (saveGoalsBtn) saveGoalsBtn.addEventListener('click', async () => {
            saveGoalsFromDOM();
            await savePlanner();
            closeGoalModal();
            renderPlanner();
        });

        // Budget: saved automatically when the input loses focus / on Enter.
        const budgetInput = container.querySelector('.pl-budget-input');
        if (budgetInput) {
            const persistBudget = async () => {
                const val = parseFloat(budgetInput.value);
                planner.goals.budget = (val && val > 0) ? val : 0;
                await savePlanner();
                renderPlanner();
            };
            budgetInput.addEventListener('change', persistBudget);
            budgetInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); budgetInput.blur(); }
            });
        }

        const addBtn = container.querySelector('#pl-add-btn');
        if (addBtn) addBtn.addEventListener('click', () => {
            const nameEl = container.querySelector('#pl-ing-name');
            const amtEl = container.querySelector('#pl-new-amount');
            const unitEl = container.querySelector('#pl-new-unit');
            const name = (nameEl ? nameEl.value : '').trim();
            const pickedId = nameEl ? nameEl.dataset.foodId : '';
            const ing = (pickedId && ingredients.find(f => f.foodId === pickedId))
                || ingredients.find(f => f.name.toLowerCase() === name.toLowerCase());
            if (!ing) { alert('Choose an ingredient from the list.'); return; }
            planner.items.push({
                ingredientId: ing.foodId, name: ing.name,
                amount: parseFloat(amtEl && amtEl.value) || 0,
                unit: (unitEl && unitEl.value.trim()) || 'g',
                scope: /can|tinned|jar|frozen|oil|condiment|spice|grain|legume|pasta|rice|flour|sugar|honey|bean/i.test(ing.category || '') ? 'month' : 'fresh',
useStock: false
            });
            renderPlanner();
            savePlanner();
        });

        container.querySelectorAll('.pl-sugg-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const nameEl = container.querySelector('#pl-ing-name');
                const resultsEl = container.querySelector('#pl-ing-results');
                if (nameEl) { nameEl.value = chip.dataset.name; nameEl.dataset.foodId = chip.dataset.foodId || ''; }
                if (resultsEl) resultsEl.innerHTML = '';
            });
        });

        // --- Ingredient picker: live search over the catalogue ---
        const nameEl = container.querySelector('#pl-ing-name');
        const resultsEl = container.querySelector('#pl-ing-results');
        const plSearch = (query) => {
            const q = (query || '').trim().toLowerCase();
            const hay = ingredients.filter(f => f && f.name);
            let matches = q
                ? hay.filter(f => f.name.toLowerCase().includes(q) || (f.category || '').toLowerCase().includes(q))
                : hay;
            matches = matches.slice(0, 12);
            if (!resultsEl) return;
            if (!matches.length) { resultsEl.innerHTML = ''; return; }
            resultsEl.innerHTML = matches.map(f => `
                <button type="button" class="pl-picker-item" data-foodid="${escapeHtml(f.foodId)}" data-name="${escapeHtml(f.name)}">
                    <span class="pl-picker-item-name">${escapeHtml(f.name)}</span>
                    ${f.category ? `<span class="pl-picker-item-cat">${escapeHtml(f.category)}</span>` : ''}
                </button>`).join('');
            resultsEl.querySelectorAll('.pl-picker-item').forEach(btn => btn.addEventListener('click', () => {
                if (nameEl) { nameEl.value = btn.dataset.name; nameEl.dataset.foodId = btn.dataset.foodId; }
                if (resultsEl) resultsEl.innerHTML = '';
            }));
        };
        if (nameEl) {
            nameEl.addEventListener('input', () => { nameEl.dataset.foodId = ''; plSearch(nameEl.value); });
            nameEl.addEventListener('focus', () => plSearch(nameEl.value));
            nameEl.addEventListener('blur', () => setTimeout(() => { if (resultsEl) resultsEl.innerHTML = ''; }, 150));
            nameEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); container.querySelector('#pl-add-btn') && container.querySelector('#pl-add-btn').click(); }
                if (e.key === 'Escape' && resultsEl) resultsEl.innerHTML = '';
            });
        }

container.querySelectorAll('.pl-amount, .pl-unit').forEach(el => {
            el.addEventListener('change', () => {
                const i = parseInt(el.dataset.idx);
                if (planner.items[i]) {
                    if (el.classList.contains('pl-amount')) planner.items[i].amount = parseFloat(el.value) || 0;
                    else planner.items[i].unit = el.value.trim() || 'g';
                    renderPlanner();
                    savePlanner();
                }
            });
        });
        container.querySelectorAll('.pl-scope').forEach(el => el.addEventListener('change', () => {
            const i = parseInt(el.dataset.idx);
            if (planner.items[i]) { planner.items[i].scope = el.checked ? 'month' : 'fresh'; renderPlanner(); savePlanner(); }
        }));
        container.querySelectorAll('.pl-usesock').forEach(el => el.addEventListener('change', () => {
            const i = parseInt(el.dataset.idx);
            if (planner.items[i]) { planner.items[i].useStock = el.checked; renderPlanner(); savePlanner(); }
        }));
        container.querySelectorAll('.pl-item-remove').forEach(btn => btn.addEventListener('click', () => {
            const i = parseInt(btn.dataset.idx);
            if (planner.items[i]) { planner.items.splice(i, 1); renderPlanner(); savePlanner(); }
        }));

        const genBtn = container.querySelector('#pl-generate-btn');
        if (genBtn) genBtn.addEventListener('click', () => {
            saveGoalsFromDOM();
            // Generate the shopping list in the Shopping tab, with the monthly
            // planner already ticked as a source.
            pendingShoppingSources = ['planner', 'meals'];
const shoppingTab = document.querySelector('.cms-tab[data-tab="shopping"]');
            if (shoppingTab) activateTab(shoppingTab);
            else renderCMSList();
        });
    }

    function renderPantryTab() {
        const container = document.getElementById('cms-recipe-list');
        if (!container) {
            console.error('[Pantry] Container not found');
            return;
        }

        try {
            // Filter pantry items by search
            let filteredItems = pantryItems.filter(item => {
                const ingredient = ingredients.find(i => i.foodId === item.ingredientFoodId);
                const ingredientName = ingredient ? ingredient.name : '';
                const searchLower = cmsSearchQuery.toLowerCase();
                return item.productName.toLowerCase().includes(searchLower) ||
                       item.brand.toLowerCase().includes(searchLower) ||
                       ingredientName.toLowerCase().includes(searchLower) ||
                       (item.notes || '').toLowerCase().includes(searchLower);
            });

            // Category filter
            if (cmsCategoryFilter !== 'All') {
                filteredItems = filteredItems.filter(item => {
                    const ingredient = ingredients.find(i => i.foodId === item.ingredientFoodId);
                    return (ingredient && ingredient.category) === cmsCategoryFilter;
                });
            }

            // Sort: tracked first, then by name
            filteredItems.sort((a, b) => {
                const ta = a.isTracked ? 1 : 0;
                const tb = b.isTracked ? 1 : 0;
                return tb - ta || a.productName.localeCompare(b.productName);
            });

        const pantryView = localStorage.getItem('larder_pantry_view') || 'cards';
        addBtn.style.display = 'flex';
        setAddBtnLabel('Add Pantry Item');

        // Restock alert
        const restockItems = pantryItems
            .filter(item => item.isTracked && (item.quantity || 0) <= 0)
            .sort((a, b) => (a.quantity || 0) - (b.quantity || 0));
        const restockRows = restockItems.slice(0, 12).map(item => {
            const ingredient = ingredients.find(i => i.foodId === item.ingredientFoodId);
            const unit = item.packUnit || 'pack';
            const reorder = Math.max(1, 10 - (item.quantity || 0));
            return `<div class="rst-row">
                <span class="rst-name">${escapeHtml(item.brand ? item.brand + ' ' + item.productName : item.productName)}</span>
                <span class="vd-pantry-status ${(item.quantity || 0) <= 0 ? 'out-of-stock' : 'low-stock'}">${(item.quantity || 0) <= 0 ? 'Out' : 'Low'}</span>
                <span class="rst-qty">${(item.quantity || 0).toFixed(0)} ${escapeHtml(unit)} left</span>
                <button type="button" class="btn secondary rst-add-btn" data-pantry-id="${escapeHtml(item.pantryId)}" data-name="${escapeHtml(item.productName)}" data-reorder="${reorder.toFixed(2)}" style="font-size:12px;padding:.25rem .55rem;">Add ${reorder.toFixed(0)} to planner</button>
            </div>`;
        }).join('');
        const restockHTML = restockItems.length
            ? `<div class="planner-card rst-card">
                <div class="planner-card-head"><i data-lucide="alert-triangle" style="width:18px;height:18px;color:var(--accent-danger,#c0392b);"></i> Restock needed <span class="planner-hint">${restockItems.length} tracked item(s) low or out of stock</span></div>
                <div class="rst-list">${restockRows}</div>
            </div>`
            : '';

        const cardsHTML = `
            ${restockHTML}
            <div style="color: var(--text-secondary); font-size: 0.9rem; margin: 0 0 1.5rem;">
                Pantry items are your specific products (brand, pack size, price). Link them to ingredients for nutrition data.
            </div>
            <div id="pantry-content">
                ${pantryView === 'table' ? renderPantryTable(filteredItems) : renderPantryCards(filteredItems)}
            </div>
        `;
        container.innerHTML = cardsHTML;
        if (window.lucide) window.lucide.createIcons();

        // "Add to planner" from restock alert
        container.querySelectorAll('.rst-add-btn').forEach(btn => btn.addEventListener('click', async () => {
            const item = pantryItems.find(i => i.pantryId === btn.dataset.pantryId);
            if (!item) return;
            const ingredient = ingredients.find(i => i.foodId === item.ingredientFoodId);
            planner.items = planner.items || [];
            planner.items.push({
                ingredientId: item.ingredientFoodId,
                name: btn.dataset.name,
                amount: parseFloat(btn.dataset.reorder),
                unit: ingredient ? ingredient.servingUnit || 'g' : 'g',
                scope: 'fresh',
                useStock: false
            });
            await savePlanner();
            statusText.innerHTML = `<span class="status-dot"></span> Added ${escapeHtml(btn.dataset.name)} to the monthly planner`;
        }));

        // Card click -> open pantry item editor
        container.querySelectorAll('.vd-pantry-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
                openPantryItemEditor(card.dataset.pantryId);
            });
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openPantryItemEditor(card.dataset.pantryId);
                }
            });
        });

        // Table row click
        container.querySelectorAll('.vd-pantry-table tbody tr').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;
                openPantryItemEditor(row.dataset.pantryId);
            });
            row.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openPantryItemEditor(row.dataset.pantryId);
                }
            });
        });

        // Save tracking changes (auto-save on input change)
        container.querySelectorAll('.p-qty, .p-days, .p-track-check').forEach(input => {
            input.addEventListener('change', () => savePantryTrackingFromUI());
        });
        container.querySelectorAll('.p-track').forEach(btn => {
            btn.addEventListener('click', () => {
                setTimeout(() => savePantryTrackingFromUI(), 50);
            });
        });
    } catch (err) {
        console.error('[Pantry] renderPantryTab error:', err);
        container.innerHTML = `<div class="empty-state" style="color: var(--accent-danger);">Error loading pantry: ${err.message}</div>`;
    }
    }

    function renderPantryCards(items) {
        if (items.length === 0) {
            return `<div class="empty-state">
                <div style="margin-bottom: 1rem;"><i data-lucide="archive" style="width: 48px; height: 48px; color: var(--text-muted);"></i></div>
                <p>No pantry items yet.</p>
                <button class="btn primary" id="add-first-pantry-btn" style="margin-top: 1rem;"><i data-lucide="plus" style="width: 16px; height: 16px;"></i> Add Your First Item</button>
            </div>`;
        }
        return `<div class="vd-pantry-grid" id="pantry-grid">
            ${items.map(item => {
                const ingredient = ingredients.find(i => i.foodId === item.ingredientFoodId);
                const ingredientName = ingredient ? ingredient.name : 'Unknown ingredient';
                const ingredientCategory = ingredient ? ingredient.category : 'Uncategorized';
                const vis = getCategoryIcon(ingredientCategory);
                const unitLabel = item.packUnit || 'pack';
                const qty = item.quantity || 0;
                const days = parseFloat(item.avgDurationDays) || 0;
                const depletion = item.isTracked && days > 0 && qty > 0 ? estimateDepletionDate({ currentStock: qty, avgDurationDays: days, lastOpenedDate: item.lastOpenedDate || new Date().toISOString().split('T')[0] }) : null;
                const daysLeft = depletion ? Math.max(0, Math.round((new Date(depletion) - new Date()) / 86400000)) : null;
                const pricePerPack = item.price || 0;
                const totalValue = pricePerPack * qty;

                let statusCls = 'not-tracked', statusLabel = 'Not Tracked';
                if (item.isTracked) {
                    if (qty <= 0) { statusCls = 'out-of-stock'; statusLabel = 'Out of Stock'; }
                    else if (qty < 2) { statusCls = 'low-stock'; statusLabel = 'Low Stock'; }
                    else { statusCls = 'in-stock'; statusLabel = 'In Stock'; }
                }

                return `
                <div class="vd-pantry-card" data-pantry-id="${escapeHtml(item.pantryId)}" role="button" tabindex="0" title="Edit pantry item">
                    <div class="vd-pantry-header">
                        <div class="vd-pantry-icon">
                            <svg viewBox="${vis.vb}" style="width:22px;height:${vis.h}px;fill:${vis.accent};"><use href="${vis.href}"></use></svg>
                        </div>
                        <button type="button" class="vd-pantry-status ${statusCls} p-track" data-pantry-id="${escapeHtml(item.pantryId)}" role="checkbox" aria-checked="${item.isTracked ? 'true' : 'false'}" style="border: none; cursor: pointer;">${statusLabel}</button>
                    </div>
                    <div class="vd-pantry-info">
                        <div class="vd-pantry-title-row">
                            <h4>${escapeHtml(item.brand ? item.brand + ' ' + item.productName : item.productName)}</h4>
                            <button type="button" class="cms-btn-icon delete pantry-item-delete-btn" data-pantry-id="${escapeHtml(item.pantryId)}" title="Delete" aria-label="Delete"><i data-lucide="trash-2" style="width: 15px; height: 15px;"></i></button>
                        </div>
                        <p style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(ingredientName)} · ${escapeHtml(ingredientCategory)}</p>
                        ${item.brand ? `<p style="font-size: 0.75rem; color: var(--accent-stock);">${escapeHtml(item.brand)}</p>` : ''}
                    </div>
                    <div class="vd-pantry-tracker">
                        <div class="vd-pantry-row">
                            <div style="display: flex; align-items: center; gap: 0.35rem;">
                                <input type="number" step="any" min="0" class="p-qty" data-pantry-id="${escapeHtml(item.pantryId)}" value="${qty}" ${!item.isTracked ? 'disabled' : ''} aria-label="Quantity (packs)" style="width: 64px; padding: 0.3rem 0.4rem; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); border-radius: 6px; font-size: 0.85rem;">
                                <span class="vd-pantry-qty" style="font-size: 0.75rem;">${escapeHtml(unitLabel)}</span>
                            </div>
                            <span class="vd-pantry-qty">${qty}${qty !== 1 ? ' packs' : ' pack'} left${totalValue > 0 ? ` · ≈ ${formatMoney(totalValue, item.currency || 'MUR')}` : ''}</span>
                        </div>
                        <div class="vd-pantry-row" style="margin-top: 0.45rem;">
                            <label class="vd-pantry-days" title="Average days each pack lasts">
                                <span>≈ days/pack</span>
                                <input type="number" step="any" min="0" class="p-days" data-pantry-id="${escapeHtml(item.pantryId)}" value="${days || ''}" ${!item.isTracked ? 'disabled' : ''} placeholder="—" aria-label="Days per pack" style="width: 56px; padding: 0.25rem 0.35rem; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); border-radius: 6px; font-size: 0.78rem;">
                            </label>
                            ${depletion
                                ? `<span class="hh-days-left ${daysLeft <= 7 ? 'hh-days-urgent' : ''}" style="font-size:0.72rem;">Runs out ${escapeHtml(formatDateDMY(depletion))}${daysLeft != null ? ' · ' + daysLeft + 'd' : ''}</span>`
                                : '<span class="vd-pantry-qty" style="font-size: 0.72rem; color: var(--text-muted);">set days to estimate</span>'}
                        </div>
                        <div class="vd-pantry-row" style="margin-top: 0.35rem; font-size: 0.7rem; color: var(--text-muted);">
                            Pack: ${item.packSize} ${item.packUnit} · ${pricePerPack > 0 ? formatMoney(pricePerPack, item.currency || 'MUR') + '/pack' : 'No price set'}
                        </div>
                    </div>
                </div>
                `;
            }).join('')}
        </div>`;
    }

    function renderPantryTable(items) {
        if (items.length === 0) {
            return `<div class="empty-state">
                <div style="margin-bottom: 1rem;"><i data-lucide="archive" style="width: 48px; height: 48px; color: var(--text-muted);"></i></div>
                <p>No pantry items yet.</p>
                <button class="btn primary" id="add-first-pantry-btn" style="margin-top: 1rem;"><i data-lucide="plus" style="width: 16px; height: 16px;"></i> Add Your First Item</button>
            </div>`;
        }
        return `<div class="vd-pantry-table-wrap">
            <table class="vd-pantry-table">
                <thead>
                    <tr>
                        ${sortTh('name', 'Product')}
                        ${sortTh('brand', 'Brand')}
                        ${sortTh('ingredient', 'Ingredient')}
                        ${sortTh('category', 'Category')}
                        ${sortTh('status', 'Status')}
                        ${sortTh('quantity', 'Qty (packs)')}
                        ${sortTh('pack', 'Pack Size')}
                        ${sortTh('price', 'Price/Pack')}
                        ${sortTh('days', 'Days/Pack')}
                        ${sortTh('depletion', 'Est. Depletion')}
                        ${sortTh('track', 'Track')}
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.map(item => {
                        const ingredient = ingredients.find(i => i.foodId === item.ingredientFoodId);
                        const ingredientName = ingredient ? ingredient.name : 'Unknown';
                        const ingredientCategory = ingredient ? ingredient.category : 'Uncategorized';
                        const vis = getCategoryIcon(ingredientCategory);
                        const unitLabel = item.packUnit || 'pack';
                        const qty = item.quantity || 0;
                        const days = parseFloat(item.avgDurationDays) || 0;
                        const depletion = item.isTracked && days > 0 && qty > 0 ? estimateDepletionDate({ currentStock: qty, avgDurationDays: days, lastOpenedDate: item.lastOpenedDate || new Date().toISOString().split('T')[0] }) : null;
                        const daysLeft = depletion ? Math.max(0, Math.round((new Date(depletion) - new Date()) / 86400000)) : null;
                        const pricePerPack = item.price || 0;

                        let statusCls = 'not-tracked', statusLabel = 'Not Tracked';
                        if (item.isTracked) {
                            if (qty <= 0) { statusCls = 'out-of-stock'; statusLabel = 'Out of Stock'; }
                            else if (qty < 2) { statusCls = 'low-stock'; statusLabel = 'Low Stock'; }
                            else { statusCls = 'in-stock'; statusLabel = 'In Stock'; }
                        }

                        return `
                        <tr data-pantry-id="${escapeHtml(item.pantryId)}">
                            <td>
                                <div style="display: flex; align-items: center; gap: 0.6rem;">
                                    <svg viewBox="${vis.vb}" style="width:18px;height:${vis.h}px;fill:${vis.accent};flex-shrink:0;"><use href="${vis.href}"></use></svg>
                                    <span style="font-weight: 600;">${escapeHtml(item.productName)}</span>
                                </div>
                            </td>
                            <td style="color: var(--text-muted);">${escapeHtml(item.brand || '—')}</td>
                            <td style="color: var(--text-secondary);">${escapeHtml(ingredientName)}</td>
                            <td style="color: var(--text-muted);">${escapeHtml(ingredientCategory)}</td>
                            <td><span class="vd-pantry-status ${statusCls}">${statusLabel}</span></td>
                            <td><input type="number" step="any" min="0" class="p-qty" data-pantry-id="${escapeHtml(item.pantryId)}" value="${qty}" ${!item.isTracked ? 'disabled' : ''} aria-label="Quantity" style="width: 70px;"></td>
                            <td style="color: var(--text-muted);">${item.packSize} ${escapeHtml(unitLabel)}</td>
                            <td style="color: var(--text-main); font-weight: 500;">${pricePerPack > 0 ? formatMoney(pricePerPack, item.currency || 'MUR') : '<span style="color:var(--text-muted)">—</span>'}</td>
                            <td><input type="number" step="any" min="0" class="p-days" data-pantry-id="${escapeHtml(item.pantryId)}" value="${days || ''}" ${!item.isTracked ? 'disabled' : ''} placeholder="—" aria-label="Days per pack" style="width: 70px;"></td>
                            <td>
                                ${depletion
                                    ? `${escapeHtml(formatDateDMY(depletion))} <span class="hh-days-left ${daysLeft <= 7 ? 'hh-days-urgent' : ''}">(${daysLeft != null ? daysLeft + 'd' : ''})</span>`
                                    : '<span style="color: var(--text-muted);">—</span>'}
                            </td>
                            <td><input type="checkbox" class="p-track-check" data-pantry-id="${escapeHtml(item.pantryId)}" ${item.isTracked ? 'checked' : ''} aria-label="Track stock"></td>
                            <td>
                                <button type="button" class="cms-btn-icon delete pantry-item-delete-btn" data-pantry-id="${escapeHtml(item.pantryId)}" title="Delete" aria-label="Delete"><i data-lucide="trash-2" style="width: 15px; height: 15px;"></i></button>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    }

    async function savePantryTrackingFromUI() {
        const container = document.getElementById('cms-recipe-list');
        if (!container) return;

        let changed = false;
        container.querySelectorAll('[data-pantry-id]').forEach(el => {
            const pantryId = el.dataset.pantryId;
            const item = pantryItems.find(i => i.pantryId === pantryId);
            if (!item) return;

            if (el.classList.contains('p-qty')) {
                const val = parseFloat(el.value) || 0;
                if (item.quantity !== val) { item.quantity = val; changed = true; }
            }
            if (el.classList.contains('p-days')) {
                const val = parseFloat(el.value) || 0;
                if (item.avgDurationDays !== val) { item.avgDurationDays = val; changed = true; }
            }
            if (el.classList.contains('p-track-check')) {
                if (item.isTracked !== el.checked) { item.isTracked = el.checked; changed = true; }
            }
            if (el.classList.contains('p-track')) {
                const tracked = el.dataset.tracked === '1';
                if (item.isTracked !== tracked) { item.isTracked = tracked; changed = true; }
            }
        });

        if (changed) {
            await savePantryItems();
            // Re-render to update status badges
            renderPantryTab();
        }
    }

    function openPantryItemEditor(pantryId) {
        const modal = document.getElementById('cms-pantry-modal');
        const form = document.getElementById('pantry-item-form');
        const item = pantryId ? pantryItems.find(i => i.pantryId === pantryId) : null;

        form.reset();
        document.getElementById('pantry-item-id').value = '';
        document.getElementById('pantry-ingredient-foodid').value = '';
        document.getElementById('pantry-ingredient-link').value = '';
        document.getElementById('pantry-ingredient-link').dataset.ingredientId = '';

        if (item) {
            document.getElementById('pantry-item-id').value = item.pantryId;
            document.getElementById('pantry-product-name').value = item.productName || '';
            document.getElementById('pantry-brand').value = item.brand || '';
            document.getElementById('pantry-pack-size').value = item.packSize || '';
            document.getElementById('pantry-pack-unit').value = item.packUnit || 'g';
            document.getElementById('pantry-stock').value = item.quantity || '';
            document.getElementById('pantry-duration').value = item.avgDurationDays || '';
            document.getElementById('pantry-price').value = item.price || '';
            document.getElementById('pantry-currency').value = item.currency || 'MUR';
            document.getElementById('pantry-last-opened').value = item.lastOpenedDate || '';
            document.getElementById('pantry-notes').value = item.notes || '';
            document.getElementById('pantry-ingredient-foodid').value = item.ingredientFoodId || '';

            const ingredient = ingredients.find(i => i.foodId === item.ingredientFoodId);
            if (ingredient) {
                document.getElementById('pantry-ingredient-link').value = ingredient.name;
                document.getElementById('pantry-ingredient-link').dataset.ingredientId = ingredient.foodId;
            }
        }

        // Ingredient search/link
        const linkInput = document.getElementById('pantry-ingredient-link');
        const suggestionsBox = document.getElementById('pantry-ingredient-suggestions');
        linkInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (!query) { suggestionsBox.style.display = 'none'; suggestionsBox.innerHTML = ''; return; }
            const matches = ingredients.filter(i => i.name.toLowerCase().includes(query)).slice(0, 10);
            if (matches.length === 0) { suggestionsBox.style.display = 'none'; suggestionsBox.innerHTML = ''; return; }
            suggestionsBox.innerHTML = matches.map(ing => `<button type="button" class="ing-suggestion-item" data-foodid="${escapeHtml(ing.foodId)}">${escapeHtml(ing.name)} <span style="color:var(--text-muted);font-size:0.75rem;">(${ing.category || 'Uncategorized'})</span></button>`).join('');
            suggestionsBox.style.display = 'block';
            suggestionsBox.querySelectorAll('.ing-suggestion-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    linkInput.value = btn.textContent.split(' (')[0];
                    linkInput.dataset.ingredientId = btn.dataset.foodid;
                    document.getElementById('pantry-ingredient-foodid').value = btn.dataset.foodid;
                    suggestionsBox.style.display = 'none';
                    suggestionsBox.innerHTML = '';
                });
            });
        });
        linkInput.addEventListener('focus', () => {
            if (linkInput.value) linkInput.dispatchEvent(new Event('input'));
        });
        document.addEventListener('click', (e) => {
            if (!suggestionsBox.contains(e.target) && e.target !== linkInput) {
                suggestionsBox.style.display = 'none';
            }
        }, true);

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        if (window.lucide) window.lucide.createIcons();
    }

    function closePantryModal() {
        const modal = document.getElementById('cms-pantry-modal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Pantry modal event handlers
    document.getElementById('pantry-item-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const pantryId = document.getElementById('pantry-item-id').value;
        const ingredientFoodId = document.getElementById('pantry-ingredient-foodid').value;
        if (!ingredientFoodId) { alert('Please select a linked ingredient.'); return; }

        const itemData = {
            pantryId: pantryId || 'pantry_' + Date.now().toString(36) + Math.random().toString(36).substr(2),
            ingredientFoodId,
            productName: document.getElementById('pantry-product-name').value.trim(),
            brand: document.getElementById('pantry-brand').value.trim(),
            packSize: parseFloat(document.getElementById('pantry-pack-size').value) || 0,
            packUnit: document.getElementById('pantry-pack-unit').value,
            quantity: parseFloat(document.getElementById('pantry-stock').value) || 0,
            avgDurationDays: parseFloat(document.getElementById('pantry-duration').value) || 0,
            price: parseFloat(document.getElementById('pantry-price').value) || 0,
            currency: document.getElementById('pantry-currency').value.trim() || 'MUR',
            lastOpenedDate: document.getElementById('pantry-last-opened').value || null,
            notes: document.getElementById('pantry-notes').value.trim(),
            isTracked: pantryId ? pantryItems.find(i => i.pantryId === pantryId)?.isTracked : false
        };

        if (!itemData.productName) { alert('Please enter a product name.'); return; }

        if (pantryId) {
            const idx = pantryItems.findIndex(i => i.pantryId === pantryId);
            if (idx >= 0) pantryItems[idx] = itemData;
        } else {
            pantryItems.push(itemData);
        }

        await savePantryItems();
        closePantryModal();
        renderPantryTab();
    });

    document.getElementById('cancel-pantry-btn').addEventListener('click', closePantryModal);
    document.querySelector('.pantry-close').addEventListener('click', closePantryModal);
    document.getElementById('pantry-delete-btn').addEventListener('click', async () => {
        const pantryId = document.getElementById('pantry-item-id').value;
        if (!pantryId) return;
        const item = pantryItems.find(i => i.pantryId === pantryId);
        const confirmed = await showConfirmDialog(
            'Delete Pantry Item',
            `Delete "${item?.productName || 'this item'}"?`,
            'Delete'
        );
        if (confirmed) {
            pantryItems = pantryItems.filter(i => i.pantryId !== pantryId);
            await savePantryItems();
            closePantryModal();
            renderPantryTab();
        }
    });

    // "Add first pantry item" buttons
    document.addEventListener('click', (e) => {
        if (e.target.id === 'add-first-pantry-btn' || e.target.closest('#add-first-pantry-btn')) {
            openPantryItemEditor(null);
        }
    });

    // Delete pantry item from list
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('.pantry-item-delete-btn');
        if (!btn) return;
        e.stopPropagation();
        const pantryId = btn.dataset.pantryId;
        const item = pantryItems.find(i => i.pantryId === pantryId);
        const confirmed = await showConfirmDialog(
            'Delete Pantry Item',
            `Delete "${item?.productName || 'this item'}"?`,
            'Delete'
        );
        if (confirmed) {
            pantryItems = pantryItems.filter(i => i.pantryId !== pantryId);
            await savePantryItems();
            renderPantryTab();
        }
    });

function renderReceipts() {
        const container = document.getElementById('cms-recipe-list');
        if (!container) return;

        const currency = (appSettings.shopping && appSettings.shopping.currency)
            || (ingredients.find(i => parseFloat(i.averagePrice) > 0) || {}).priceCurrency
            || 'MUR';
        const SYM = { MUR: 'Rs', LKR: 'Rs', NPR: 'Rs', PKR: 'Rs', USD: '$', CAD: '$', AUD: '$', SGD: '$', EUR: '€', GBP: '£', INR: '₹', BDT: '৳' };
        const fmt = n => (SYM[currency] || '') + (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const budget = parseFloat(appSettings.shopping && appSettings.shopping.amount) || 0;

const norm = s => String(s || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        function matchIngredient(name) { return LC.matchIngredient(name, ingredients); }
        function matchNote(name) {
            const ing = matchIngredient(name);
            if (!ing) return { text: 'no match', cls: 'red-note' };
            return { text: '→ ' + ing.name, cls: 'blue-note' };
        }

// Heuristic parse of a pasted receipt/OCR line (shared module).
        function parseLine(line) { return LC.parseLine(line); }
        function parseReceiptText(text) { return LC.parseReceiptText(text, ingredients); }

        // ---- Shopping analytics (derived from receipts) ----
        const sorted = receipts.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const totalSpend = receipts.reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
        const thisMonthKey = new Date().toISOString().slice(0, 7);
        const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1);
        const lastMonthKey = lastMonth.toISOString().slice(0, 7);
        const thisMonthSpend = receipts.filter(r => (r.date || '').startsWith(thisMonthKey)).reduce((s, r) => s + (parseFloat(r.total) || 0), 0);
        const lastMonthSpend = receipts.filter(r => (r.date || '').startsWith(lastMonthKey)).reduce((s, r) => s + (parseFloat(r.total) || 0), 0);

        const storeTotals = {};
        receipts.forEach(r => {
            const st = r.store || 'Other';
            storeTotals[st] = (storeTotals[st] || 0) + (parseFloat(r.total) || 0);
        });
        const storeRows = Object.entries(storeTotals).sort((a, b) => b[1] - a[1]).slice(0, 6)
            .map(([st, amt]) => `<div class="rc-store-row"><span class="rc-store-name">${escapeHtml(st)}</span><div class="pl-total-bar" style="flex:1"><div class="pl-total-fill blue" style="width:${totalSpend ? Math.min(100, amt / totalSpend * 100) : 0}%"></div></div><span class="rc-store-amt">${fmt(amt)}</span></div>`).join('');

        // Last 8 weeks spend trend
        function weekKey(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); return x.toISOString().slice(0, 10); }
        const wkSpend = {};
        receipts.forEach(r => { const k = weekKey(r.date); wkSpend[k] = (wkSpend[k] || 0) + (parseFloat(r.total) || 0); });
        const wkToday = weekKey(new Date().toISOString().slice(0, 10));
        const wkStart = new Date(wkToday); wkStart.setDate(wkStart.getDate() - 7 * 7);
        const wkLabels = [], wkVals = []; let wkMax = 0;
        for (let i = 0; i <= 7; i++) {
            const d = new Date(wkStart); d.setDate(d.getDate() + 7 * i);
            const k = weekKey(d.toISOString().slice(0, 10));
            const v = wkSpend[k] || 0;
            wkLabels.push(d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
            wkVals.push(v);
            if (v > wkMax) wkMax = v;
        }
        const trendBars = wkVals.map((v, i) => `<div class="rc-trend-col"><div class="rc-trend-bar-wrap"><div class="rc-trend-bar ${wkLabels[i] === wkToday ? 'thiswk' : ''}" style="height:${wkMax ? Math.max(3, v / wkMax * 60) : 3}px"></div></div><div class="rc-trend-lbl">${wkLabels[i]}</div><div class="rc-trend-val">${fmt(v)}</div></div>`).join('');

        const budgetCls = budget > 0 && thisMonthSpend > budget ? 'red' : 'blue';
        const budgetNote = budget > 0 ? (thisMonthSpend > budget ? 'over budget' : `remaining ${fmt(budget - thisMonthSpend)}`) : 'no budget set';

        const anHTML = `
        <div class="planner-card rc-analytics">
            <div class="planner-card-head"><i data-lucide="chart-pie" style="width:18px;height:18px;"></i> Shopping analytics <span class="planner-hint">from captured receipts</span></div>
            <div class="rc-kpis">
                <div class="rc-kpi"><div class="rc-kpi-label">This month</div><div class="rc-kpi-val ${budgetCls}">${fmt(thisMonthSpend)}</div><div class="rc-kpi-sub">${budgetNote}</div></div>
                <div class="rc-kpi"><div class="rc-kpi-label">Last month</div><div class="rc-kpi-val">${fmt(lastMonthSpend)}</div><div class="rc-kpi-sub">${lastMonthSpend ? (thisMonthSpend - lastMonthSpend) >= 0 ? '+' + fmt(thisMonthSpend - lastMonthSpend) : fmt(thisMonthSpend - lastMonthSpend) : ''}</div></div>
                <div class="rc-kpi"><div class="rc-kpi-label">All time</div><div class="rc-kpi-val">${fmt(totalSpend)}</div><div class="rc-kpi-sub">${receipts.length} receipt${receipts.length === 1 ? '' : 's'}</div></div>
                <div class="rc-kpi"><div class="rc-kpi-label">Avg / receipt</div><div class="rc-kpi-val">${fmt(receipts.length ? totalSpend / receipts.length : 0)}</div><div class="rc-kpi-sub">${budget ? 'budget ' + fmt(budget) : ''}</div></div>
            </div>
            <div class="rc-split">
                <div class="rc-spend-trend"><div class="rc-subhead">Spend · last 8 weeks</div><div class="rc-trend-wrap">${trendBars}</div></div>
                <div class="rc-stores"><div class="rc-subhead">By store</div>${storeRows || '<div class="empty-state" style="padding:.4rem">No receipts yet.</div>'}</div>
            </div>
        </div>`;

        // ---- Add-receipt form ----
        const storesList = [...new Set(receipts.map(r => r.store).filter(Boolean))];
        const storeOpts = storesList.map(s => `<option value="${escapeHtml(s)}">`).join('');
        const addForm = `
        <div class="planner-card">
            <div class="planner-card-head"><i data-lucide="receipt" style="width:18px;height:18px;"></i> Add a receipt <span class="planner-hint">paste receipt text, or fill items manually &mdash; names auto-match to ingredients</span></div>
            <div class="rc-form-grid">
                <div class="rc-f"><label>Store</label><input class="seamless-input" id="rc-store" list="rc-store-list" placeholder="e.g. Winner's"><datalist id="rc-store-list">${storeOpts}</datalist></div>
                <div class="rc-f"><label>Date</label><input type="date" class="seamless-input" id="rc-date" value="${new Date().toISOString().slice(0, 10)}"></div>
                <div class="rc-f"><label>Total</label><input type="number" class="seamless-input" id="rc-total" placeholder="0.00" step="any" style="width:110px"></div>
            </div>
            <div class="rc-f"><label>Pasted receipt text (<span class="planner-hint">one item per line, e.g. "Rice 2kg 145.00"</span>)</label><textarea class="seamless-input seamless-textarea" id="rc-paste" rows="2"></textarea><button class="btn secondary" id="rc-parse-btn" style="margin-top:.5rem;font-size:14px">Parse lines</button></div>
            <div class="rc-items-head">Items</div>
            <div id="rc-items-rows"></div>
            <div class="rc-selected-line">Matched price <strong id="rc-calc-total">${fmt(0)}</strong></div>
            <div class="planner-card-actions"><button class="btn primary" id="rc-save-btn">Save receipt</button><span class="pln-note" id="rc-save-note"></span></div>
        </div>`;

        // ---- Receipt list ----
        const rcCards = receipts.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map((r, i) => {
            const rowsH = (r.items || []).map(it => {
                const ms = matchIngredient(it.name);
                const badge = ms ? `<span class="pln-tag">→ ${escapeHtml(ms.name)}</span>` : '<span class="pln-tag-grey">no match</span>';
                return `<li class="rc-item"><div class="rc-item-name">${escapeHtml(it.name)}</div><div class="rc-item-mid">${it.qty || 1} ${escapeHtml(it.unit || '')}</div><div class="rc-item-price">${fmt(it.price)}</div>${badge}</li>`;
            }).join('');
            const matched = (r.items || []).filter(it => it.foodId || matchIngredient(it.name)).length;
            return `
            <div class="planner-card" data-rcid="${r.id}">
                <div class="rc-list-head">
                    <div class="rc-store-title">${escapeHtml(r.store || 'Receipt')}</div>
                    <div class="rc-date">${escapeHtml(formatDateDMY(r.date))}</div>
                    <div class="rc-total">${fmt(r.total)}</div>
                </div>
                <div class="rc-item-count">${(r.items || []).length} line(s) &middot; ${matched} matched</div>
                <ul class="rc-item-list">${rowsH}</ul>
                <div class="rc-list-actions">
                    <button class="btn secondary rc-to-pantry" data-id="${r.id}" style="font-size:13px">Add items to pantry</button>
                    <button class="btn secondary danger rc-del" data-id="${r.id}" style="font-size:13px">Delete</button>
                </div>
            </div>`;
        }).join('');

const listHTML = `
        <div class="planner-card rc-list-card">
            <div class="planner-card-head"><i data-lucide="receipt-text" style="width:18px;height:18px;"></i> Receipts <span class="planner-hint">${receipts.length} recorded</span></div>
            <div class="rc-list-scroll">${rcCards || '<div class="empty-state">No receipts yet &mdash; add your first one above.</div>'}</div>
        </div>`;

        function unitToGrams(unit, ing) {
            const u = (unit || 'g').toLowerCase();
            const UN = { g: 1, gram: 1, kg: 1000, kgs: 1000, ml: 1, l: 1000, litre: 1000, pc: 1, each: 1, bottle: 1, bag: 1, pack: 1, packet: 1, can: 1, tin: 1 };
            if (u in UN) return UN[u];
            return parseFloat(ing && ing.servingSizeG) || 100;
        }
        container.innerHTML = `<div class="planner-wrap rc-page"><div class="rc-top">${anHTML}${addForm}</div>${listHTML}</div>`;
        if (window.lucide) window.lucide.createIcons();

        // Build item rows (for manual entry)
        let itemRows = [];
        function renderItemRows() {
            const wrap = container.querySelector('#rc-items-rows');
            if (!wrap) return;
            wrap.innerHTML = itemRows.map((it, i) => `
                <div class="rc-man-item" data-idx="${i}">
                    <input type="text" class="seamless-input rc-man-name" data-idx="${i}" value="${escapeHtml(it.name)}" placeholder="Item name">
                    <input type="number" class="seamless-input rc-man-qty" data-idx="${i}" value="${it.qty}" step="any" style="width:60px">
                    <input type="text" class="seamless-input rc-man-unit" data-idx="${i}" value="${it.unit || 'g'}" style="width:46px">
                    <input type="number" class="seamless-input rc-man-price" data-idx="${i}" value="${it.price || ''}" step="any" style="width:90px">
                    <span class="rc-man-match" data-idx="${i}"></span>
                    <button class="rc-rm" data-idx="${i}" title="Remove">&times;</button>
                </div>`).join('');
            wrap.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
                const i2 = parseInt(inp.dataset.idx);
                if (!itemRows[i2]) return;
                if (inp.classList.contains('rc-man-name')) itemRows[i2].name = inp.value;
                else if (inp.classList.contains('rc-man-qty')) itemRows[i2].qty = parseFloat(inp.value) || 0;
                else if (inp.classList.contains('rc-man-unit')) itemRows[i2].unit = inp.value;
                else if (inp.classList.contains('rc-man-price')) itemRows[i2].price = parseFloat(inp.value) || 0;
                updateCalc();
                renderMatches();
            }));
            wrap.querySelectorAll('.rc-rm').forEach(btn => btn.addEventListener('click', () => {
                itemRows.splice(parseInt(btn.dataset.idx), 1);
                renderItemRows(); updateCalc();
            }));
        }
        function renderMatches() {
            container.querySelectorAll('.rc-man-item').forEach(eli2 => {
                const i2 = parseInt(eli2.dataset.idx);
                if (!itemRows[i2]) return;
                const ing = matchIngredient(itemRows[i2].name);
                const el = eli2.querySelector('.rc-man-match');
                if (el) el.textContent = ing ? '→ ' + ing.name : '';
                el.classList.toggle('blue-note', !!ing);
                el.classList.toggle('red-note', !ing);
            });
        }
        function updateCalc() {
            const tot = itemRows.reduce((s, it) => s + ((it.price || 0) * ((it.qty || 0) || 1)), 0);
            const el = container.querySelector('#rc-calc-total');
            if (el) el.textContent = fmt(tot);
        }
        renderItemRows();
        renderMatches();

        // parse button
        const parseBtn = container.querySelector('#rc-parse-btn');
        if (parseBtn) parseBtn.addEventListener('click', () => {
            const text = (container.querySelector('#rc-paste') || {}).value || '';
            const parsed = parseReceiptText(text);
            if (!parsed.length) { alert('Could not parse any lines.'); return; }
            // match existing rows by name, else append
            parsed.forEach(l => {
                const existing = itemRows.find(x => norm(x.name) === norm(l.name));
                if (existing) { existing.qty += l.qty; existing.price = existing.price || l.price; }
                else itemRows.push({ name: l.name, qty: l.qty, unit: l.unit, price: l.price, foodId: l.foodId, grams: l.grams });
            });
            const totEl = container.querySelector('#rc-total');
            const sum = itemRows.reduce((s, it) => s + (it.price || 0) * (it.qty || 1), 0);
            if (totEl && !(parseFloat(totEl.value) > 0)) totEl.value = Math.round(sum * 100) / 100;
renderItemRows();
            renderMatches();
            updateCalc();
        });

        // save
        const saveBtn = container.querySelector('#rc-save-btn');
        if (saveBtn) saveBtn.addEventListener('click', async () => {
            const store = (container.querySelector('#rc-store') || {}).value.trim() || 'Other';
            const date = (container.querySelector('#rc-date') || {}).value || new Date().toISOString().slice(0, 10);
            const total = parseFloat(container.querySelector('#rc-total').value) || 0;
            const items = itemRows.map(it => {
                const ing = matchIngredient(it.name);
                return { name: it.name, qty: it.qty, unit: it.unit || 'g', price: it.price || 0, foodId: ing ? ing.foodId : null, matchedName: ing ? ing.name : null };
            });
            const computed = items.reduce((s, it) => s + (it.price || 0) * (it.qty || 1), 0);
            receipts.push({
                id: 'rc_' + Date.now(),
                store, date, total: total || Math.round(computed * 100) / 100,
                currency: currency,
                items,
                enteredTotal: total
            });
            await saveReceipts();
            renderReceipts();
            return;
        });

        // list actions
        container.querySelectorAll('.rc-to-pantry').forEach(btn => btn.addEventListener('click', async () => {
            const r = receipts.find(x => String(x.id) === String(btn.dataset.id));
            if (!r) return;
            let added = 0;
            (r.items || []).forEach(it => {
                const ing = matchIngredient(it.name);
                if (!ing) return;
                const cur = pantry.find(p => p.foodId === ing.foodId);
                const grams = it.grams || ((parseFloat(it.qty) || 1) * (unitToGrams(it.unit, ing) || 1));
                if (cur) cur.quantity = (parseFloat(cur.quantity) || 0) + grams;
                else pantry.push({ foodId: ing.foodId, isTracked: true, quantity: grams });
                added++;
            });
            if (added) { await savePantry(); }
            const note = container.querySelector('#rc-save-note');
            if (note) { note.textContent = `Added ${added} item(s) to pantry.`; setTimeout(() => { note.textContent = ''; }, 2000); }
        }));
        container.querySelectorAll('.rc-del').forEach(btn => btn.addEventListener('click', async () => {
            receipts = receipts.filter(x => String(x.id) !== String(btn.dataset.id));
            await saveReceipts();
            renderReceipts();
        }));
    }
    function sortTh(key, label, style) {
        const st = cmsTableSort[currentCMSTab];
        const active = st && st.key === key;
        const arrow = active ? (st.dir === 1 ? '↑' : '↓') : '';
        return `<th data-sort="${key}" class="sortable${active ? ' sort-active' : ''}"${style ? ` style="${style}"` : ''} title="Sort by ${label}">${label}<span class="sort-ind" aria-hidden="true">${arrow}</span></th>`;
    }

    function renderCMSList() {
        populateIngredientSuggestions();

        // --- Sortable table columns (Recipes / Ingredients / Pantry / Household) ---
        function cmpValue(a, b, dir) {
            if (a == null && b == null) return 0;
            if (a == null) return 1;
            if (b == null) return -1;
            if (typeof a === 'number' && typeof b === 'number' && isFinite(a) && isFinite(b)) return (a - b) * dir;
            return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * dir;
        }
        function sortRows(arr, key, dir, get) {
            if (!key) return arr;
            return arr.slice().sort((x, y) => cmpValue(get(x, key), get(y, key), dir));
        }
        function bindSortHandlers(root) {
            root.querySelectorAll('th.sortable').forEach(th => {
                th.addEventListener('click', () => {
                    const key = th.dataset.sort;
                    const st = cmsTableSort[currentCMSTab];
                    const dir = st && st.key === key ? (st.dir === 1 ? -1 : 1) : 1;
                    cmsTableSort[currentCMSTab] = { key, dir };
                    renderCMSList();
                });
            });
        }

        // --- Shared costing helpers (used by Meal Plan and Shopping tabs) ---
        const UNIT_TO_GRAMS = {
            g: 1, gram: 1, grams: 1, '': 1,
            kg: 1000, kilogram: 1000, kilograms: 1000,
            ml: 1, millilitre: 1, milliliter: 1, millilitres: 1, milliliters: 1,
            l: 1000, litre: 1000, liter: 1000, litres: 1000, liters: 1000,
            tsp: 5, teaspoon: 5, teaspoons: 5,
            tbsp: 15, tablespoon: 15, tablespoons: 15,
            cup: 240, cups: 240,
            oz: 28.35, ounce: 28.35, ounces: 28.35,
            lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6
        };
        const COUNT_UNITS = ['piece', 'pieces', 'pc', 'pcs', 'each', 'whole', 'clove', 'cloves', 'sprig', 'sprigs', 'slice', 'slices', 'can', 'cans', 'pinch', 'pinches', 'stalk', 'stalks', 'bunch', 'medium', 'large', 'small', 'head', 'heads'];
        const FRACTION_CHARS = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅓': '1/3', '⅔': '2/3', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5', '⅙': '1/6', '⅚': '5/6', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };

        function parseAmountToGrams(amountStr, ing) {
            if (typeof amountStr === 'number') return amountStr;
            if (!amountStr) return 0;
            let s = String(amountStr).trim();
            for (const ch in FRACTION_CHARS) {
                if (s.includes(ch)) s = s.split(ch).join(FRACTION_CHARS[ch]);
            }
            const m = s.match(/^([\d\s./-]+)\s*([a-zA-Zµ]+)?$/);
            if (!m) return null;
            let qty = 0;
            for (const part of m[1].trim().split(/[\s-]+/)) {
                if (!part) continue;
                if (part.includes('/')) { const f = part.split('/'); qty += (parseFloat(f[0]) || 0) / (parseFloat(f[1]) || 1); }
                else qty += parseFloat(part) || 0;
            }
            const u = (m[2] || '').toLowerCase();
            if (u in UNIT_TO_GRAMS) return qty * UNIT_TO_GRAMS[u];
            if (COUNT_UNITS.includes(u)) return qty * (parseFloat((ing && ing.servingSizeG)) || 100);
            return null;
        }

        function perGramPrice(ing) {
            if (!ing) return 0;
            const avg = parseFloat(ing.averagePrice);
            if (!(avg > 0)) return 0;
            const b = LC.priceBasisGrams && typeof LC.priceBasisGrams === 'function'
                ? LC.priceBasisGrams(ing)
                : (parseFloat(ing.servingSizeG) || 100);
            return b > 0 ? avg / b : 0;
        }

        function householdRunningLow() {
            const today = new Date().toISOString().split('T')[0];
            return (householdItems || []).filter(item => {
                const stock = parseFloat(item.currentStock) || 0;
                const avg = parseFloat(item.avgDurationDays) || 0;
                if (stock <= 0) return true;
                if (avg <= 0) return false;
                const dep = estimateDepletionDate(item);
                return !!dep && hhDaysBetween(today, dep) <= 7;
            });
        }

        function currentWeekPlans() {
            const today = new Date();
            const dow = today.getDay() === 0 ? 7 : today.getDay();
            const start = new Date(today);
            start.setDate(today.getDate() - dow + 1);
            const dates = [];
            for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); dates.push(d.toISOString().split('T')[0]); }
            return mealPlans.filter(p => dates.includes(p.date) && !p.isEatingOut && p.type !== 'eating_out');
        }

        function mealPlanCurrency() {
            const firstPriced = ingredients.find(i => parseFloat(i.averagePrice) > 0);
            return (appSettings.shopping && appSettings.shopping.currency)
                || (firstPriced && firstPriced.priceCurrency)
                || 'MUR';
        }

        function recipeYield(recipe) {
            if (!recipe || !recipe.macros) return 1;
            const y = parseFloat(String(recipe.macros.yield || '').replace(',', '.'));
            return y > 0 ? y : 1;
        }

        // Per-eater servings for a recipe: grams eaten / serving size, rounded to
        // nearest half (min 1) so the kitchen cooks whole half-servings.
        function recipeServingsToCook(plan, recipeId) {
            let grams = 0, servingG = 250;
            (plan && plan.eaters || []).forEach(eater => {
                if (eater.eatingOut) return;
                (eater.items || []).forEach(item => {
                    if (item.type !== 'recipe' || item.referenceId !== recipeId) return;
                    grams += parseFloat(item.grams) || 0;
                    servingG = parseFloat(item.servingSizeG) || servingG;
                });
            });
            if (!(grams > 0)) return 1;
            return Math.max(1, Math.ceil((grams / servingG) * 2) / 2);
        }

        function estimateMealCost(plan) {
            if (!plan) return { cost: 0, costed: 0, uncosted: 0 };
            if (plan.isEatingOut || plan.type === 'eating_out') return { cost: 0, costed: 0, uncosted: 0 };
            let total = 0, uncosted = 0, costed = 0;
            const recipeCosts = {};
            (plan.eaters || []).forEach(eater => {
                if (eater.eatingOut) return;
                (eater.items || []).forEach(item => {
                    if (item.type === 'recipe') {
                        const recipe = recipes.find(r => r.id === item.referenceId);
                        if (!recipe || !recipe.ingredients) return;
                        const yieldNum = recipeYield(recipe);
                        if (!recipeCosts[item.referenceId]) {
                            let batch = 0;
                            recipe.ingredients.forEach(ing => {
                                if (!ing.foodId) return;
                                const foodRef = ingredients.find(f => f.foodId === ing.foodId);
                                const grams = parseAmountToGrams(ing.metric || ing.imperial || ing.amount, foodRef);
                                const price = perGramPrice(foodRef);
                                if (grams === null || !(price > 0)) { uncosted++; return; }
                                if (grams > 0) { batch += grams * price; costed++; }
                            });
                            recipeCosts[item.referenceId] = batch / yieldNum;
                        }
                    } else if (item.type === 'ingredient' && item.referenceId) {
                        const foodRef = ingredients.find(f => f.foodId === item.referenceId);
                        const grams = parseFloat(item.grams) || 0;
                        const price = perGramPrice(foodRef);
                        if (!(grams > 0) || !(price > 0)) { uncosted++; return; }
                        total += grams * price; costed++;
                    }
                });
            });
            Object.keys(recipeCosts).forEach(rid => {
                total += recipeCosts[rid] * recipeServingsToCook(plan, rid);
            });
            return { cost: Math.round(total * 10) / 10, costed, uncosted };
        }

        // Manage search bar visibility
        const searchAnchor = document.querySelector('.cms-search-anchor');
        if (searchAnchor) {
            if (['recipe', 'food', 'pantry', 'household'].includes(currentCMSTab)) {
                searchAnchor.style.display = 'flex';
            } else {
                searchAnchor.style.display = 'none';
            }
        }
        if (searchInput) {
            if (['recipe', 'food', 'pantry', 'household'].includes(currentCMSTab)) {
                searchInput.style.display = 'block';
            } else {
                searchInput.style.display = 'none';
            }
        }

        // Per-tab page title.
        const headerTitle = document.getElementById('cms-header-title');
        if (headerTitle) {
            const titles = { recipe: 'Recipes', food: 'Ingredients', mealplan: 'Meal Plan', planner: 'Monthly Planner', pantry: 'Pantry', household: 'Household', shopping: 'Shopping Lists', receipts: 'Receipts', settings: 'Settings' };
            headerTitle.textContent = titles[currentCMSTab] || 'Recipes';
        }

        // Toolbar: view toggle + filter trigger shown for tabs that list records.
        const showToolbar = ['recipe', 'food', 'pantry', 'household'].includes(currentCMSTab);
        if (viewToggle) viewToggle.style.display = showToolbar ? 'flex' : 'none';
        if (filterTrigger) filterTrigger.style.display = showToolbar ? 'flex' : 'none';
        if (!showToolbar && filterDropdown) filterDropdown.classList.remove('active');

        // View toggle icon reflects the active tab's current view state. Rebuild
        // the <i data-lucide> each time because lucide replaces it with an <svg>,
        // orphaning any cached reference to the old element.
        if (viewToggle) {
            let iconName;
            if (currentCMSTab === 'pantry') iconName = (localStorage.getItem('larder_pantry_view') || 'cards') === 'cards' ? 'layout-grid' : 'table';
            else if (currentCMSTab === 'household') iconName = (localStorage.getItem('larder_household_view') || 'cards') === 'cards' ? 'layout-grid' : 'table';
            else iconName = cmsListView === 'grid' ? 'layout-grid' : 'list';
            viewToggle.innerHTML = `<i data-lucide="${iconName}" style="width: 18px; height: 18px;"></i>`;
        }

        // Build category filter chips from the active tab's data.
        if (showToolbar && filterChips) {
            let source;
            if (currentCMSTab === 'food' || currentCMSTab === 'pantry') source = ingredients;
            else if (currentCMSTab === 'household') source = householdItems;
            else source = recipes.filter(r => r.entryType !== 'ingredient');
            const cats = [...new Set(source.map(x => (x.category || 'Uncategorized')).filter(Boolean))].sort();
            if (cmsCategoryFilter !== 'All' && !cats.includes(cmsCategoryFilter)) cmsCategoryFilter = 'All';
            const chips = ['All', ...cats];
            filterChips.innerHTML = chips.map(c =>
                `<button type="button" class="filter-chip${c === cmsCategoryFilter ? ' active' : ''}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`
            ).join('');
            filterChips.querySelectorAll('.filter-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    cmsCategoryFilter = chip.dataset.cat;
                    renderCMSList();
                });
            });
            if (filterBadge) {
                updateCMSFilterBadge();
            }
        }

        // Section visibility: Tags + Time are recipe-only; Nutrition shows for
        // recipes AND ingredients, matching the website (index.html / ingredients.html).
        const tagsSection = document.getElementById('cms-filter-tags-section');
        if (tagsSection) tagsSection.style.display = (currentCMSTab === 'recipe') ? '' : 'none';
        const timeSection = document.getElementById('cms-filter-time-section');
        if (timeSection) timeSection.style.display = (currentCMSTab === 'recipe') ? '' : 'none';
        const nutritionSection = document.getElementById('cms-filter-nutrition-section');
        if (nutritionSection) nutritionSection.style.display = (currentCMSTab === 'recipe' || currentCMSTab === 'food') ? '' : 'none';

        // Status filter chips (recipe tab only).
        const statusFilterSection = document.getElementById('cms-filter-status-section');
        if (statusFilterSection) statusFilterSection.style.display = (currentCMSTab === 'recipe') ? '' : 'none';
        if (currentCMSTab === 'recipe' && filterStatusChips) {
            const statuses = ['published', 'draft'];
            if (cmsStatusFilter !== 'All' && !statuses.includes(cmsStatusFilter)) cmsStatusFilter = 'All';
            const chips = ['All', ...statuses];
            filterStatusChips.innerHTML = chips.map(s =>
                `<button type="button" class="filter-chip${s === cmsStatusFilter ? ' active' : ''}" data-status="${escapeHtml(s)}">${escapeHtml(s.charAt(0).toUpperCase() + s.slice(1))}</button>`
            ).join('');
            filterStatusChips.querySelectorAll('.filter-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    cmsStatusFilter = chip.dataset.status;
                    renderCMSList();
                });
            });
        }

        // Rebuild tag chips + refresh slider labels only on tabs where they appear.
        if (currentCMSTab === 'recipe') {
            initCMSDualSliders();
            renderCMSTagChips();
        }

        if (currentCMSTab === 'planner') {
            renderPlanner();
            return;
        }

        if (currentCMSTab === 'receipts') {
            renderReceipts();
            return;
        }

        if (currentCMSTab === 'mealplan') {
            const slots = ['breakfast', 'lunch', 'dinner', 'snack'];
            const mpCurrency = mealPlanCurrency();
            const today = new Date();
            const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // Make Monday=1, Sunday=7

            // Get Monday of current week (offset in weeks, e.g. -1 = last week)
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - dayOfWeek + 1 + mealWeekOffset * 7);

            function macroNum(value) {
                if (value == null) return 0;
                const n = parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
                return isNaN(n) ? 0 : n;
            }

            function recipeMacros(recipe) {
                const m = (recipe && recipe.macros) || {};
                return {
                    energy: macroNum(m.energy),
                    carbs: macroNum(m.carbohydrate),
                    protein: macroNum(m.protein),
                    fat: macroNum(m.fat)
                };
            }

            // Aggregate macros for the whole week, per profile (each eater's own totals)
            const profiles = (appSettings.profiles && appSettings.profiles.length)
                ? appSettings.profiles
                : [{ name: 'User', calories: 2000, carbs: 40, protein: 30, fat: 30 }];
            const weekTotal = { energy: 0, carbs: 0, protein: 0, fat: 0 };
            const weekTotals = profiles.map(() => ({ energy: 0, carbs: 0, protein: 0, fat: 0 }));
            const weekDates = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(startOfWeek);
                d.setDate(startOfWeek.getDate() + i);
                weekDates.push(d);
                const dateString = d.toISOString().split('T')[0];
                slots.forEach(slot => {
                    const plan = mealPlans.find(p => p.date === dateString && p.slot === slot);
                    if (!plan || plan.type === 'eating_out') return;
                    if (plan.isEatingOut) return;
                    (plan.eaters || []).forEach(eater => {
                        if (!eater || eater.eatingOut || !Array.isArray(eater.items)) return;
                        const wt = weekTotals[eater.idx];
                        if (!wt) return;
                        (eater.items || []).forEach(item => {
                            const grams = parseFloat(item.grams) || 0;
                            if (!(grams > 0)) return;
                            if (item.type === 'recipe') {
                                const r = recipes.find(rec => rec.id === item.referenceId);
                                const m = recipeMacros(r);
                                const servingG = parseFloat(item.servingSizeG) || 250;
                                const f = servingG > 0 ? grams / servingG : 0;
                                wt.energy += m.energy * f;
                                wt.carbs += m.carbs * f;
                                wt.protein += m.protein * f;
                                wt.fat += m.fat * f;
                            } else if (item.type === 'ingredient') {
                                const ing = ingredients.find(f => f.foodId === item.referenceId);
                                if (!ing) return;
                                const per100 = grams / 100;
                                wt.energy += macroNum(ing.calories) * per100;
                                wt.carbs += macroNum(ing.carbsG) * per100;
                                wt.protein += macroNum(ing.proteinG) * per100;
                                wt.fat += macroNum(ing.fatG) * per100;
                            }
                        });
                    });
                });
            }

            const weekEnd = new Date(startOfWeek);
            weekEnd.setDate(startOfWeek.getDate() + 6);
            const weekLabel = `${formatDateDMY(startOfWeek.toISOString().split('T')[0])} - ${formatDateDMY(weekEnd.toISOString().split('T')[0])}`;

            // Cost of every planned meal in the displayed week (for cost chips + summary)
            const mealCosts = new Map();
            let weekMealCost = 0, weekUncosted = 0, weekMealCount = 0;
            weekDates.forEach(d => {
                const dateString = d.toISOString().split('T')[0];
                slots.forEach(slot => {
                    const plan = mealPlans.find(p => p.date === dateString && p.slot === slot);
                    if (!plan || plan.isEatingOut || plan.type === 'eating_out') return;
                    const est = estimateMealCost(plan);
                    mealCosts.set(dateString + '|' + slot, est);
                    weekMealCost += est.cost;
                    weekUncosted += est.uncosted;
                    weekMealCount++;
                });
            });
            weekMealCost = Math.round(weekMealCost * 10) / 10;

            // Build user stat cards from profiles
            const avatarAccents = ['var(--accent-sea)', 'var(--accent-jam)', 'var(--accent-veg)', 'var(--accent-meat)', 'var(--accent-stock)', 'var(--accent-bake)'];

            function macroTargets(profile) {
                const cal = macroNum(profile.calories);
                return {
                    energy: cal,
                    protein: Math.round(cal * (macroNum(profile.protein) / 100) / 4),
                    carbs: Math.round(cal * (macroNum(profile.carbs) / 100) / 4),
                    fat: Math.round(cal * (macroNum(profile.fat) / 100) / 9)
                };
            }

            let statsHTML = profiles.map((profile, idx) => {
                const accent = avatarAccents[idx % avatarAccents.length];
                const initial = (profile.name || 'U').trim().charAt(0).toUpperCase();
                const target = macroTargets(profile);
                // Targets in the profile are per-day; multiply by 7 so the ring and
                // macro progress compare the whole week against a weekly goal.
                const weekTarget = {
                    energy: target.energy * 7,
                    protein: target.protein * 7,
                    carbs: target.carbs * 7,
                    fat: target.fat * 7
                };
                const wt = weekTotals[idx] || { energy: 0, carbs: 0, protein: 0, fat: 0 };
                const calPct = weekTarget.energy > 0 ? Math.min(100, Math.round((wt.energy / weekTarget.energy) * 100)) : 0;
                const ringOffset = Math.max(0, 100 - calPct);
                const proteinPct = weekTarget.protein > 0 ? Math.min(100, Math.round((wt.protein / weekTarget.protein) * 100)) : 0;
                const carbsPct = weekTarget.carbs > 0 ? Math.min(100, Math.round((wt.carbs / weekTarget.carbs) * 100)) : 0;
                const fatPct = weekTarget.fat > 0 ? Math.min(100, Math.round((wt.fat / weekTarget.fat) * 100)) : 0;
                return `
                <div class="mp-user-stat-card">
                    <div class="mp-user-header">
                        <div class="mp-user-avatar" style="color: ${accent}; border-color: ${accent}; background: rgba(84,144,198,0.1);">${escapeHtml(initial)}</div>
                        <span class="mp-user-name">${escapeHtml(profile.name)}</span>
                    </div>
                    <div class="mp-user-summary">
                        <div class="progress-ring">
                            <svg>
                                <circle class="bg" cx="16" cy="16" r="14"></circle>
                                <circle class="progress" cx="16" cy="16" r="14" style="stroke: ${accent}; stroke-dashoffset: ${ringOffset};"></circle>
                            </svg>
                        </div>
                        <div class="mp-user-cal">
                            <strong>${Math.round(wt.energy).toLocaleString()}</strong>
                            <span>/ ${weekTarget.energy.toLocaleString()} kcal</span>
                        </div>
                    </div>
                    <div class="mp-user-details-hover">
                        <h4 style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-main); margin-bottom: 0.75rem; border-bottom: 2px solid ${accent}; padding-bottom: 0.5rem; display: inline-block;">Macro Progress</h4>
                        <div class="mp-macro-row">
                            <span class="mp-macro-label"><i data-lucide="beef" style="width: 14px; height: 14px; color: var(--accent-meat);"></i> Protein</span>
                            <div class="mp-macro-vals">
                                <span class="mp-macro-curr">${Math.round(wt.protein)}g</span>
                                <span class="mp-macro-target">/ ${weekTarget.protein}g</span>
                            </div>
                        </div>
                        <div class="mp-macro-row">
                            <span class="mp-macro-label"><i data-lucide="wheat" style="width: 14px; height: 14px; color: var(--accent-stock);"></i> Carbs</span>
                            <div class="mp-macro-vals">
                                <span class="mp-macro-curr">${Math.round(wt.carbs)}g</span>
                                <span class="mp-macro-target">/ ${weekTarget.carbs}g</span>
                            </div>
                        </div>
                        <div class="mp-macro-row">
                            <span class="mp-macro-label"><i data-lucide="droplet" style="width: 14px; height: 14px; color: #D4B04A;"></i> Fat</span>
                            <div class="mp-macro-vals">
                                <span class="mp-macro-curr">${Math.round(wt.fat)}g</span>
                                <span class="mp-macro-target">/ ${weekTarget.fat}g</span>
                            </div>
                        </div>
                        <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); font-size: 0.75rem; color: var(--text-muted);">
                            Protein ${proteinPct}% · Carbs ${carbsPct}% · Fat ${fatPct}%
                        </div>
                    </div>
                </div>`;
            }).join('');

            // Weekly cost summary card (vs budget) appended to the stat cards row
            {
                const weeklyBudget = parseFloat(appSettings.shopping && appSettings.shopping.amount) || 0;
                const over = weeklyBudget > 0 && weekMealCost > weeklyBudget;
                const statusCls = weeklyBudget > 0 ? (over ? 'sb-over' : 'sb-under') : 'sb-unset';
                const statusLabel = weeklyBudget > 0
                    ? (over
                        ? `Over by ${formatMoney(weekMealCost - weeklyBudget, mpCurrency)}`
                        : `Within · ${formatMoney(weeklyBudget - weekMealCost, mpCurrency)} to spare`)
                    : 'No budget set';
                const costAccent = over ? 'var(--accent-meat)' : 'var(--accent-veg)';
                statsHTML += `
                    <div class="mp-user-stat-card mp-cost-card">
                        <div class="mp-user-header">
                            <div class="mp-user-avatar" style="color: ${costAccent}; border-color: ${costAccent}; background: rgba(84,144,198,0.1);"><i data-lucide="wallet" style="width: 18px; height: 18px;"></i></div>
                            <span class="mp-user-name">Week Meal Cost</span>
                        </div>
                        <div class="mp-user-summary">
                            <div class="mp-cost-detail">
                                <strong>${formatMoney(weekMealCost, mpCurrency)}</strong>
                                <span class="mp-budget-target">/ ${weeklyBudget > 0 ? formatMoney(weeklyBudget, mpCurrency) : '—'}</span>
                            </div>
                        </div>
                        <span class="sb-status ${statusCls}" style="margin-top: 0.5rem;">${escapeHtml(statusLabel)}</span>
                        ${weekUncosted ? `<div class="mp-cost-note">${weekUncosted} ingredient${weekUncosted > 1 ? 's' : ''} not priced</div>` : ''}
                        ${weekMealCount === 0 ? `<div class="mp-cost-note">No meals planned for this week.</div>` : ''}
                    </div>`;
            }

            // Build the mp-grid: header row + one row per slot
            let gridHTML = '<div class="mp-dashboard">';
            gridHTML += `
                <div class="mp-header">
                    <div class="mp-nav">
                        <button class="mp-nav-btn" id="mp-prev-week" aria-label="Previous week"><i data-lucide="chevron-left" style="width: 20px; height: 20px;"></i></button>
                        <h2>${escapeHtml(weekLabel)}</h2>
                        <button class="mp-nav-btn" id="mp-next-week" aria-label="Next week"><i data-lucide="chevron-right" style="width: 20px; height: 20px;"></i></button>
                    </div>
                    <div class="mp-stats">${statsHTML}</div>
                </div>
                <div class="mp-grid">`;

            gridHTML += '<div></div>'; // Empty top-left corner
            weekDates.forEach(d => {
                const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                const dayNum = d.toLocaleDateString('en-US', { day: 'numeric' });
                gridHTML += `
                    <div class="mp-column-header">
                        <div class="mp-day-name">${dayName}</div>
                        <div class="mp-day-date">${dayNum}</div>
                    </div>`;
            });

            slots.forEach(slot => {
                gridHTML += `<div class="mp-row-label">${slot.charAt(0).toUpperCase() + slot.slice(1)}</div>`;
                weekDates.forEach(d => {
                    const dateString = d.toISOString().split('T')[0];
                    const plan = mealPlans.find(p => p.date === dateString && p.slot === slot);
                    let slotInner = '';
                    if (plan) {
                        const eaters = plan.eaters || [];
                        const eatingOutAll = eaters.length > 0 && eaters.every(e => e.eatingOut);
                        const activeEaters = eaters.filter(e => !e.eatingOut);
                        if (eatingOutAll) {
                            slotInner = `
                                <div class="mp-meal-card mp-eating-out">
                                    <i data-lucide="coffee" style="color: var(--primary); width: 20px; height: 20px;"></i>
                                    <div class="mp-meal-title">Eating Out</div>
                                </div>`;
                        } else {
                            const allItems = [];
                            activeEaters.forEach(e => (e.items || []).forEach(it => allItems.push(it)));
                            const recipeItems = allItems.filter(it => it.type === 'recipe');
                            const ingItems = allItems.filter(it => it.type === 'ingredient');
                            const firstRecipe = recipes.find(rec => rec.id === (recipeItems[0] && recipeItems[0].referenceId));
                            const img = (firstRecipe && firstRecipe.imageUrl)
                                ? `<img src="${escapeHtml(firstRecipe.imageUrl)}" class="mp-meal-img" onerror="this.style.display='none'">`
                                : `<div class="mp-meal-img" style="background: var(--bg-surface-hover); display: flex; align-items: center; justify-content: center;"><i data-lucide="utensils-crossed" style="width: 16px; height: 16px; color: var(--text-muted);"></i></div>`;
                            const uniqueNames = [...new Set(allItems.map(it => it.name || (it.type === 'ingredient' ? (ingredients.find(x => x.foodId === it.referenceId) || {}).name : (recipes.find(r => r.id === it.referenceId) || {}).title) || 'Item'))];
                            const shown = uniqueNames.length <= 2 ? uniqueNames.join(' & ') : uniqueNames.slice(0, 2).join(' & ') + ` +${uniqueNames.length - 2}`;
                            let kcal = 0;
                            activeEaters.forEach(e => {
                                (e.items || []).forEach(item => {
                                    const grams = parseFloat(item.grams) || 0;
                                    if (!(grams > 0)) return;
                                    if (item.type === 'recipe') {
                                        const r = recipes.find(rec => rec.id === item.referenceId);
                                        const m = recipeMacros(r);
                                        const servingG = parseFloat(item.servingSizeG) || 250;
                                        kcal += servingG > 0 ? m.energy * (grams / servingG) : 0;
                                    } else if (item.type === 'ingredient') {
                                        const ing = ingredients.find(f => f.foodId === item.referenceId);
                                        if (ing) kcal += macroNum(ing.calories) * (grams / 100);
                                    }
                                });
                            });
                            const servingsParts = [];
                            recipeItems.forEach(it => {
                                const rid = it.referenceId;
                                if (!servingsParts.some(p => p.rid === rid)) {
                                    const sv = recipeServingsToCook(plan, rid);
                                    servingsParts.push({ rid, sv });
                                }
                            });
                            const servingsTxt = servingsParts.length
                                ? ' · ×' + servingsParts.map(p => p.sv).join(' / ') : '';
                            const mealEst = (mealCosts.get(dateString + '|' + slot) || { cost: 0 });
                            const mealCostChip = mealEst.cost > 0 ? `<span class="mp-cost-chip">${formatMoney(mealEst.cost, mpCurrency)}</span>` : '';
                            const eaterTags = eaters.map(e => {
                                const p = profiles[e.idx];
                                const nm = p ? p.name : 'Eater';
                                return e.eatingOut
                                    ? `<span class="mp-eater-tag mp-eater-tag-out">${escapeHtml(nm)} · out</span>`
                                    : `<span class="mp-eater-tag">${escapeHtml(nm)}</span>`;
                            }).join('');

                            const tooltipContent = eaters.map(e => {
                                const p = profiles[e.idx];
                                const nm = p ? p.name : 'Eater';
                                if (e.eatingOut) {
                                    return `<div class="mp-tooltip-eater"><span class="mp-tooltip-eater-name">${escapeHtml(nm)}</span><span class="mp-tooltip-eater-out">Eating out</span></div>`;
                                }
                                const items = (e.items || []).map(it => {
                                    const grams = parseFloat(it.grams) || 0;
                                    const kcalItem = (() => {
                                        if (!(grams > 0)) return 0;
                                        if (it.type === 'recipe') {
                                            const r = recipes.find(rec => rec.id === it.referenceId);
                                            const m = recipeMacros(r);
                                            const servingG = parseFloat(it.servingSizeG) || 250;
                                            return servingG > 0 ? Math.round(m.energy * (grams / servingG)) : 0;
                                        } else if (it.type === 'ingredient') {
                                            const ing = ingredients.find(f => f.foodId === it.referenceId);
                                            return ing ? Math.round(macroNum(ing.calories) * (grams / 100)) : 0;
                                        }
                                        return 0;
                                    })();
                                    return `<div class="mp-tooltip-item">${escapeHtml(it.name)} (${grams}g${kcalItem ? `, ${kcalItem} kcal` : ''})</div>`;
                                }).join('');
                                return `<div class="mp-tooltip-eater"><span class="mp-tooltip-eater-name">${escapeHtml(nm)}</span>${items}</div>`;
                            }).join('');

                            slotInner = `
                                <div class="mp-meal-card" data-tooltip-html="${escapeHtml(tooltipContent)}">
                                    ${img}
                                    <div class="mp-meal-info">
                                        <div class="mp-meal-title">${escapeHtml(shown)}</div>
                                        <div class="mp-meal-meta">${kcal ? Math.round(kcal) + ' kcal' : ''}${servingsTxt}${mealCostChip}</div>
                                        <div class="mp-eater-tags">${eaterTags}</div>
                                    </div>
                                </div>`;
                        }
                    }
                    gridHTML += `<div class="mp-slot" data-date="${dateString}" data-slot="${slot}">${slotInner}</div>`;
                });
            });

            gridHTML += '</div>'; // close mp-grid
            gridHTML += `
                <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                    <button id="save-mealplan-btn" class="btn primary"><i data-lucide="save" style="width: 16px; height: 16px;"></i> Save Plan</button>
                </div>
            </div>`; // close mp-dashboard

            listContainer.innerHTML = gridHTML;
            addBtn.style.display = 'none';
            if (window.lucide) window.lucide.createIcons();

            // Tooltip for meal cards
            const tooltip = document.createElement('div');
            tooltip.className = 'mp-tooltip';
            document.body.appendChild(tooltip);

            let tooltipHideTimer = null;
            function showTooltip(card, e) {
                const html = card.dataset.tooltipHtml;
                if (!html) return;
                tooltip.innerHTML = html;
                tooltip.classList.add('visible');
                const rect = card.getBoundingClientRect();
                tooltip.style.left = (rect.left + rect.width / 2) + 'px';
                tooltip.style.top = (rect.top - 8) + 'px';
            }
            function hideTooltip() {
                tooltip.classList.remove('visible');
            }

            document.querySelectorAll('.mp-meal-card[data-tooltip-html]').forEach(card => {
                card.addEventListener('mouseenter', (e) => {
                    if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
                    showTooltip(card, e);
                });
                card.addEventListener('mouseleave', () => {
                    tooltipHideTimer = setTimeout(hideTooltip, 80);
                });
            });
            tooltip.addEventListener('mouseenter', () => {
                if (tooltipHideTimer) { clearTimeout(tooltipHideTimer); tooltipHideTimer = null; }
            });
            tooltip.addEventListener('mouseleave', hideTooltip);

            document.getElementById('mp-prev-week').addEventListener('click', () => {
                mealWeekOffset -= 1;
                renderCMSList();
            });
            document.getElementById('mp-next-week').addEventListener('click', () => {
                mealWeekOffset += 1;
                renderCMSList();
            });

            // Attach slot click handlers
            const assignModal = document.getElementById('meal-assign-modal');
            const assignTitle = document.getElementById('meal-assign-title');
            const assignSubtitle = document.getElementById('meal-assign-subtitle');

            const mealSummaryEl = document.getElementById('meal-assign-summary');
            const searchInput = document.getElementById('meal-assign-search');
            const suggestionsBox = document.getElementById('meal-assign-suggestions');
            const pickerEl = document.getElementById('meal-assign-picker');

            const btnClear = document.getElementById('meal-assign-clear');
            const btnCancel = document.getElementById('meal-assign-cancel');
            const btnConfirm = document.getElementById('meal-assign-confirm');
            const templateSaveBtn = document.getElementById('meal-template-save');
            const templateListEl = document.getElementById('meal-template-list');
            const copyDaysEl = document.getElementById('meal-copy-days');
            const eatersEl = document.getElementById('meal-assign-eaters-list');

            let activeDate = null;
            let activeSlotName = null;
            // modalEaters: array of { idx, eatingOut, items: [{type, referenceId, name, unit?, servingSizeG?, grams}] }
            let modalEaters = [];
            let pickerItem = null; // { type, referenceId, name, unit?, servingSizeG?, defaultGrams }

            // Load templates from localStorage
            let mealTemplates = JSON.parse(localStorage.getItem('larder_meal_templates') || '[]');

            // Migrate legacy templates (shared items + servings) to per-eater.
            mealTemplates.forEach(t => {
                if (!t.eaters && t.items) {
                    t.eaters = getProfiles().map((p, idx) => ({
                        idx,
                        eatingOut: !!t.isEatingOut,
                        items: t.isEatingOut ? [] : JSON.parse(JSON.stringify(t.items || []))
                    }));
                }
            });

            function saveTemplatesToStorage() {
                localStorage.setItem('larder_meal_templates', JSON.stringify(mealTemplates));
            }

            function getProfiles() {
                return (appSettings.profiles && appSettings.profiles.length)
                    ? appSettings.profiles
                    : [{ name: 'User', calories: 2000, carbs: 40, protein: 30, fat: 30 }];
            }

            function recipeServingGrams(recipe) {
                if (!recipe || !recipe.ingredients || !recipe.ingredients.length) return null;
                let total = 0;
                recipe.ingredients.forEach(ing => {
                    if (!ing.foodId) return;
                    const foodRef = ingredients.find(f => f.foodId === ing.foodId);
                    const g = parseAmountToGrams(ing.metric || ing.imperial || '', foodRef);
                    if (g != null && g > 0) total += g;
                });
                const yieldNum = parseFloat(String((recipe.macros && recipe.macros.yield) || '').replace(',', '.'));
                if (!(total > 0) || !(yieldNum > 0)) return null;
                return Math.round(total / yieldNum);
            }

            function eaterMacros(eater) {
                const t = { energy: 0, carbs: 0, protein: 0, fat: 0 };
                (eater.items || []).forEach(item => {
                    const grams = parseFloat(item.grams) || 0;
                    if (!(grams > 0)) return;
                    if (item.type === 'recipe') {
                        const r = recipes.find(rec => rec.id === item.referenceId);
                        const m = recipeMacros(r);
                        const servingG = parseFloat(item.servingSizeG) || 250;
                        const f = servingG > 0 ? grams / servingG : 0;
                        t.energy += m.energy * f;
                        t.carbs += m.carbs * f;
                        t.protein += m.protein * f;
                        t.fat += m.fat * f;
                    } else if (item.type === 'ingredient') {
                        const ing = ingredients.find(f => f.foodId === item.referenceId);
                        if (!ing) return;
                        const per100 = grams / 100;
                        t.energy += macroNum(ing.calories) * per100;
                        t.carbs += macroNum(ing.carbsG) * per100;
                        t.protein += macroNum(ing.proteinG) * per100;
                        t.fat += macroNum(ing.fatG) * per100;
                    } else if (item.type === 'pantry') {
                        // Use linked ingredient's nutrition data
                        const ing = ingredients.find(f => f.foodId === item.ingredientFoodId);
                        if (!ing) return;
                        const per100 = grams / 100;
                        t.energy += macroNum(ing.calories) * per100;
                        t.carbs += macroNum(ing.carbsG) * per100;
                        t.protein += macroNum(ing.proteinG) * per100;
                        t.fat += macroNum(ing.fatG) * per100;
                    }
                });
                return t;
            }

            function eaterTotalGrams(eater) {
                return (eater.items || []).reduce((a, it) => {
                    const g = parseFloat(it.grams) || 0;
                    return a + (g > 0 ? g : 0);
                }, 0);
            }

            function servingsByRecipe(eaters) {
                const map = {};
                eaters.forEach(e => {
                    if (e.eatingOut) return;
                    (e.items || []).forEach(item => {
                        if (item.type !== 'recipe') return;
                        const servingG = parseFloat(item.servingSizeG) || 250;
                        const grams = parseFloat(item.grams) || 0;
                        if (!map[item.referenceId]) map[item.referenceId] = { grams: 0, servingG };
                        map[item.referenceId].grams += grams;
                    });
                });
                const out = {};
                Object.keys(map).forEach(rid => {
                    const m = map[rid];
                    out[rid] = m.grams > 0 ? Math.max(1, Math.ceil((m.grams / (m.servingG || 250)) * 2) / 2) : 1;
                });
                return out;
            }

            function renderEaters() {
                const profiles = getProfiles();
                eatersEl.innerHTML = profiles.map((p, i) => {
                    if (!modalEaters[i]) modalEaters[i] = { idx: i, eatingOut: false, items: [] };
                    const eater = modalEaters[i];
                    const mac = eaterMacros(eater);
                    const grams = eaterTotalGrams(eater);
                    const itemsHTML = (eater.items || []).map((item, j) => `
                        <div class="mp-eater-item" data-eater="${i}" data-item="${j}">
                            <div class="mp-eater-item-main">
                                <span class="mp-eater-item-name">${escapeHtml(item.name)}</span>
                                ${item.type === 'recipe'
                                    ? `<span class="mp-eater-item-serving">1 serving = <input type="number" class="cms-input mp-eater-serving" data-eater="${i}" data-item="${j}" value="${escapeHtml(item.servingSizeG != null ? item.servingSizeG : '')}" min="1" step="5"> g</span>`
                                    : ''}
                            </div>
                            <div class="mp-eater-item-grams">
                                <input type="number" class="cms-input mp-eater-grams" data-eater="${i}" data-item="${j}" min="1" step="5" value="${escapeHtml(item.grams != null ? item.grams : '')}">
                                <span class="mp-eater-grams-unit">g</span>
                                <button class="mp-eater-item-remove" data-eater="${i}" data-item="${j}" aria-label="Remove">&times;</button>
                            </div>
                        </div>`).join('');
                    return `
                        <div class="mp-eater-card${eater.eatingOut ? ' mp-eater-card-out' : ''}">
                            <div class="mp-eater-card-header">
                                <label class="mp-eater-cb-label" title="Uncheck if eating out">
                                    <input type="checkbox" class="meal-eater-cb" data-eater="${i}" ${!eater.eatingOut ? 'checked' : ''}>
                                    <span class="mp-eater-name">${escapeHtml(p.name)}</span>
                                </label>
                                <span class="mp-eater-subtotal">${eater.eatingOut ? 'Eating out' : `${Math.round(grams)}g · ${Math.round(mac.energy)} kcal`}</span>
                            </div>
                            ${eater.eatingOut
                                ? ''
                                : `<div class="mp-eater-items">${itemsHTML || '<div class="mp-eater-item-empty">No items yet — search above to add.</div>'}</div>`}
                        </div>`;
                }).join('');

                eatersEl.querySelectorAll('.meal-eater-cb').forEach(cb => {
                    cb.onchange = () => {
                        const i = parseInt(cb.dataset.eater);
                        modalEaters[i].eatingOut = !cb.checked;
                        renderEaters();
                    };
                });
                eatersEl.querySelectorAll('.mp-eater-grams').forEach(inp => {
                    inp.onchange = () => {
                        const i = parseInt(inp.dataset.eater);
                        const j = parseInt(inp.dataset.item);
                        modalEaters[i].items[j].grams = parseFloat(inp.value) || 0;
                        renderEaters();
                    };
                });
                eatersEl.querySelectorAll('.mp-eater-serving').forEach(inp => {
                    inp.onchange = () => {
                        const i = parseInt(inp.dataset.eater);
                        const j = parseInt(inp.dataset.item);
                        const sv = parseFloat(inp.value) || 250;
                        modalEaters[i].items[j].servingSizeG = sv;
                        // Keep the serving size consistent across eaters for the same recipe
                        const rid = modalEaters[i].items[j].referenceId;
                        modalEaters.forEach(e => (e.items || []).forEach(it => {
                            if (it.type === 'recipe' && it.referenceId === rid) it.servingSizeG = sv;
                        }));
                        renderEaters();
                    };
                });
                eatersEl.querySelectorAll('.mp-eater-item-remove').forEach(btn => {
                    btn.onclick = () => {
                        const i = parseInt(btn.dataset.eater);
                        const j = parseInt(btn.dataset.item);
                        modalEaters[i].items.splice(j, 1);
                        renderEaters();
                    };
                });
                updateMealSummary();
            }

            function updateMealSummary() {
                const active = modalEaters.filter(e => !e.eatingOut && (e.items || []).some(it => (parseFloat(it.grams) || 0) > 0));
                if (modalEaters.length === 0 || active.length === 0) {
                    const allOut = modalEaters.length > 0 && modalEaters.every(e => e.eatingOut);
                    mealSummaryEl.innerHTML = allOut ? 'Everyone is eating out.' : 'Add items to each eater to see totals.';
                    return;
                }
                let kcal = 0, grams = 0;
                active.forEach(e => {
                    kcal += eaterMacros(e).energy;
                    grams += eaterTotalGrams(e);
                });
                const srv = servingsByRecipe(modalEaters);
                const srvTxt = Object.keys(srv).map(rid => {
                    const r = recipes.find(rec => rec.id === rid);
                    return `${r ? r.title : 'Recipe'} ×${srv[rid]}`;
                }).join(', ');
                mealSummaryEl.innerHTML = `<strong>${active.length}</strong> eater${active.length > 1 ? 's' : ''} · ${Math.round(grams)}g · ${Math.round(kcal)} kcal${srvTxt ? ' · cooks ' + srvTxt : ''}`;
            }

            function renderTemplateChips() {
                if (mealTemplates.length === 0) {
                    templateListEl.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-muted); padding: 0.3rem;">No templates saved yet.</span>';
                    return;
                }
                templateListEl.innerHTML = mealTemplates.map((t, idx) => {
                    const itemCount = (t.eaters || []).reduce((a, e) => a + (e.items || []).length, 0);
                    const outCount = (t.eaters || []).filter(e => e.eatingOut).length;
                    return `
                        <div class="mp-template" data-idx="${idx}">
                            <span class="mp-template-name">${escapeHtml(t.name)}</span>
                            <span class="mp-template-meta">(${itemCount} item${itemCount !== 1 ? 's' : ''}${outCount ? `, ${outCount} out` : ''})</span>
                            <button class="mp-template-delete" data-idx="${idx}" aria-label="Delete template">&times;</button>
                        </div>`;
                }).join('');

                document.querySelectorAll('.mp-template-name').forEach(el => {
                    el.onclick = (e) => {
                        const t = mealTemplates[parseInt(e.target.closest('.mp-template').dataset.idx)];
                        if (!t) return;
                        const profiles = getProfiles();
                        modalEaters = profiles.map((p, i) => {
                            const ex = (t.eaters || []).find(x => x.idx === i);
                            return ex ? { idx: i, eatingOut: !!ex.eatingOut, items: JSON.parse(JSON.stringify(ex.items || [])) } : { idx: i, eatingOut: false, items: [] };
                        });
                        renderEaters();
                    };
                });

                document.querySelectorAll('.mp-template-delete').forEach(el => {
                    el.onclick = (e) => {
                        e.stopPropagation();
                        mealTemplates.splice(parseInt(e.target.dataset.idx), 1);
                        saveTemplatesToStorage();
                        renderTemplateChips();
                    };
                });
            }

            // Save as template
            const templateNameRow = document.getElementById('meal-template-name');
            const templateNameInput = document.getElementById('meal-template-name-input');
            const templateNameOk = document.getElementById('meal-template-name-ok');
            const templateNameCancel = document.getElementById('meal-template-name-cancel');
            templateSaveBtn.onclick = () => {
                const hasItems = modalEaters.some(e => !e.eatingOut && (e.items || []).length);
                const hasOut = modalEaters.some(e => e.eatingOut);
                if (!hasItems && !hasOut) {
                    alert('Add some items (or mark someone as eating out) before saving a template.');
                    return;
                }
                templateNameInput.value = '';
                templateNameRow.style.display = 'flex';
                templateNameInput.focus();
            };
            const commitTemplate = () => {
                const name = templateNameInput.value.trim();
                if (!name) return;
                mealTemplates.push({
                    name,
                    eaters: JSON.parse(JSON.stringify(modalEaters))
                });
                saveTemplatesToStorage();
                templateNameRow.style.display = 'none';
                renderTemplateChips();
            };
            templateNameOk.onclick = commitTemplate;
            templateNameCancel.onclick = () => { templateNameRow.style.display = 'none'; };
            templateNameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitTemplate(); }
                if (e.key === 'Escape') { e.stopPropagation(); templateNameRow.style.display = 'none'; }
            });

            function renderPicker() {
                if (!pickerItem) {
                    pickerEl.style.display = 'none';
                    pickerEl.innerHTML = '';
                    return;
                }
                const profiles = getProfiles();
                const eaterCheckboxes = profiles.map((p, i) => `
                    <label class="mp-picker-eater-cb">
                        <input type="checkbox" class="mp-picker-cb" value="${i}" checked>
                        <span>${escapeHtml(p.name)}</span>
                    </label>
                `).join('');

                const defaultGrams = pickerItem.defaultGrams || (pickerItem.type === 'recipe' ? (pickerItem.servingSizeG || 250) : 100);
                
                // Show pantry item details if applicable
                let pantryDetailsHtml = '';
                if (pickerItem.type === 'pantry' && pickerItem.pantryItem) {
                    const p = pickerItem.pantryItem;
                    pantryDetailsHtml = `
                        <div class="mp-picker-pantry-details" style="margin-bottom: 0.5rem; padding: 0.5rem; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem;">
                            <div><strong>Brand:</strong> ${escapeHtml(p.brand || '—')}</div>
                            <div><strong>Pack:</strong> ${p.packSize} ${p.packUnit}</div>
                            <div><strong>Price:</strong> ${p.price > 0 ? formatMoney(p.price, p.currency || 'MUR') + '/pack' : 'Not set'}</div>
                            <div><strong>Stock:</strong> ${p.quantity || 0} packs${p.isTracked ? ' (tracked)' : ''}</div>
                        </div>
                    `;
                }

                pickerEl.innerHTML = `
                    <div class="mp-picker-card">
                        <div class="mp-picker-head">
                            <span class="mp-picker-name">${escapeHtml(pickerItem.name)}</span>
                            <span class="mp-picker-type">${pickerItem.type === 'recipe' ? 'Recipe' : pickerItem.type === 'pantry' ? 'Pantry Item' : 'Ingredient'}</span>
                        </div>
                        ${pantryDetailsHtml}
                        <div class="mp-picker-eaters">
                            <label class="mp-picker-eater-cb mp-picker-select-all" style="font-weight: 700;">
                                <input type="checkbox" id="mp-picker-all-cb" checked>
                                <span>All / None</span>
                            </label>
                            <div class="mp-picker-eaters-list">${eaterCheckboxes}</div>
                        </div>
                        <div class="mp-picker-row" style="margin-top: 0.5rem;">
                            <input type="number" class="cms-input mp-picker-grams" value="${defaultGrams}" min="1" step="5">
                            <span class="mp-picker-unit">g</span>
                            <div style="flex:1;"></div>
                            <button class="cms-btn-icon mp-picker-add" style="color: var(--primary);" title="Add" aria-label="Add"><i data-lucide="plus-circle" style="width: 20px; height: 20px;"></i></button>
                            <button class="cms-btn-icon mp-picker-cancel" title="Cancel" aria-label="Cancel"><i data-lucide="x" style="width: 20px; height: 20px;"></i></button>
                        </div>
                    </div>`;
                pickerEl.style.display = 'block';
                if (window.lucide) window.lucide.createIcons();

                const selectAllCb = pickerEl.querySelector('#mp-picker-all-cb');
                const eaterCbs = pickerEl.querySelectorAll('.mp-picker-cb');
                
                selectAllCb.addEventListener('change', () => {
                    eaterCbs.forEach(cb => cb.checked = selectAllCb.checked);
                });
                eaterCbs.forEach(cb => {
                    cb.addEventListener('change', () => {
                        selectAllCb.checked = Array.from(eaterCbs).every(c => c.checked);
                    });
                });

                pickerEl.querySelector('.mp-picker-add').onclick = () => {
                    const grams = parseFloat(pickerEl.querySelector('.mp-picker-grams').value);
                    if (!(grams > 0)) {
                        alert('Enter a valid amount in grams.');
                        return;
                    }
                    
                    let addedAny = false;
                    eaterCbs.forEach(cb => {
                        if (cb.checked) {
                            addedAny = true;
                            const eIdx = parseInt(cb.value);
                            if (!modalEaters[eIdx]) modalEaters[eIdx] = { idx: eIdx, eatingOut: false, items: [] };
                            modalEaters[eIdx].eatingOut = false;
                            const itemData = {
                                type: pickerItem.type,
                                referenceId: pickerItem.referenceId,
                                name: pickerItem.name,
                                servingSizeG: pickerItem.type === 'recipe' ? (pickerItem.servingSizeG || 250) : undefined,
                                grams
                            };
                            if (pickerItem.type === 'pantry') {
                                itemData.pantryId = pickerItem.referenceId;
                                itemData.ingredientFoodId = pickerItem.ingredientFoodId;
                            }
                            modalEaters[eIdx].items.push(itemData);
                        }
                    });

                    if (!addedAny) {
                        alert('Select at least one eater.');
                        return;
                    }

                    pickerItem = null;
                    searchInput.value = '';
                    renderPicker();
                    renderEaters();
                };
                pickerEl.querySelector('.mp-picker-cancel').onclick = () => {
                    pickerItem = null;
                    searchInput.value = '';
                    renderPicker();
                };
            }

            document.querySelectorAll('.mp-slot').forEach(slotEl => {
                slotEl.addEventListener('click', () => {
                    activeDate = slotEl.dataset.date;
                    activeSlotName = slotEl.dataset.slot;

                    const dateObj = new Date(activeDate + 'T00:00:00');
                    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                    assignTitle.textContent = `${dayName} · ${activeSlotName.charAt(0).toUpperCase() + activeSlotName.slice(1)}`;
                    assignSubtitle.textContent = `${formatDateDMY(activeDate)}`;

                    const existingPlan = mealPlans.find(p => p.date === activeDate && p.slot === activeSlotName);

                    // Reset modal state
                    searchInput.value = '';
                    suggestionsBox.style.display = 'none';
                    pickerItem = null;
                    renderPicker();

                    // Build per-eater state from the existing plan (if any)
                    const profiles = getProfiles();
                    modalEaters = profiles.map((p, i) => {
                        let eater = { idx: i, eatingOut: false, items: [] };
                        if (existingPlan) {
                            const ex = (existingPlan.eaters || []).find(x => x.idx === i);
                            if (ex) eater = { idx: i, eatingOut: !!ex.eatingOut, items: JSON.parse(JSON.stringify(ex.items || [])) };
                            else if (existingPlan.isEatingOut) eater.eatingOut = true;
                        }
                        return eater;
                    });
                    if (existingPlan && existingPlan.isEatingOut) {
                        modalEaters.forEach(e => { e.eatingOut = true; e.items = []; });
                    }

                    // Reset copy-to-days checkboxes; auto-check the current day
                    const currentDayIdx = (new Date(activeDate + 'T00:00:00')).getDay();
                    // Convert JS getDay (0=Sun) to our checkbox order (0=Mon...6=Sun)
                    const mappedIdx = currentDayIdx === 0 ? 6 : currentDayIdx - 1;

                    renderEaters();
                    renderCopyDays(mappedIdx);
                    renderTemplateChips();

                    assignModal.classList.add('active');
                    document.body.style.overflow = 'hidden';
                });
            });

            function renderCopyDays(mappedIdx) {
                const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                copyDaysEl.innerHTML = days.map((d, i) => `
                    <label>
                        <input type="checkbox" class="copy-day-cb" value="${i}" ${i === mappedIdx ? 'checked' : ''} ${i === mappedIdx ? 'disabled' : ''}>
                        <span>${d}</span>
                    </label>
                `).join('');
                if (mappedIdx >= 0) {
                    const disabledLabel = copyDaysEl.querySelector('input[disabled]');
                    if (disabledLabel) disabledLabel.closest('label').style.opacity = '0.4';
                }
            }

            // Autocomplete Search
            let searchHighlightIdx = -1;

            searchInput.addEventListener('keydown', (e) => {
                if (suggestionsBox.style.display === 'none') return;
                const items = suggestionsBox.querySelectorAll('.autocomplete-item');
                if (!items.length) return;

                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    searchHighlightIdx = Math.min(searchHighlightIdx + 1, items.length - 1);
                    updateSearchHighlight(items);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    searchHighlightIdx = Math.max(searchHighlightIdx - 1, -1);
                    updateSearchHighlight(items);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    if (searchHighlightIdx >= 0 && items[searchHighlightIdx]) {
                        items[searchHighlightIdx].click();
                    }
                }
            });

            function updateSearchHighlight(items) {
                items.forEach((item, idx) => {
                    if (idx === searchHighlightIdx) {
                        item.classList.add('active');
                        item.scrollIntoView({ block: 'nearest' });
                    } else {
                        item.classList.remove('active');
                    }
                });
            }

            searchInput.oninput = (e) => {
                const query = e.target.value.toLowerCase();
                searchHighlightIdx = -1;
                if (!query) {
                    suggestionsBox.style.display = 'none';
                    return;
                }

                const matchedRecipes = recipes.filter(r => r.title.toLowerCase().includes(query)).map(r => ({ ...r, _type: 'recipe' }));
                const matchedIngredients = ingredients.filter(i => i.name.toLowerCase().includes(query)).map(i => ({ ...i, _type: 'ingredient' }));

                const combined = [...matchedRecipes, ...matchedIngredients].slice(0, 15); // Top 15

                if (combined.length === 0) {
                    suggestionsBox.innerHTML = '<div style="padding: 0.8rem; color: var(--text-muted); font-size: 0.85rem;">No results found.</div>';
                } else {
                    suggestionsBox.innerHTML = combined.map((item, idx) => {
                        let pantryItemsHtml = '';
                        if (item._type === 'ingredient') {
                            const pantryItemsForIng = pantryItems.filter(p => p.ingredientFoodId === item.foodId);
                            if (pantryItemsForIng.length > 0) {
                                pantryItemsHtml = `<div class="pantry-items-sub" style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border);">
                                    <div style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600; margin-bottom: 0.35rem;">Your pantry items:</div>
                                    ${pantryItemsForIng.map(p => `
                                        <button type="button" class="pantry-item-pick" data-pantry-id="${escapeHtml(p.pantryId)}" style="display: block; width: 100%; text-align: left; padding: 0.4rem 0.6rem; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 0.25rem; cursor: pointer; font-size: 0.8rem; transition: all 0.15s;">
                                            ${escapeHtml(p.brand ? p.brand + ' ' + p.productName : p.productName)}
                                            <span style="float: right; color: var(--text-muted); font-size: 0.7rem;">${p.packSize} ${p.packUnit} · ${p.price > 0 ? formatMoney(p.price, p.currency || 'MUR') : 'no price'}</span>
                                        </button>
                                    `).join('')}
                                </div>`;
                            }
                        }
                        return `
                            <div class="autocomplete-item" data-idx="${idx}" style="padding: 0.8rem; border-bottom: 1px solid var(--border); cursor: pointer; font-size: 0.85rem;">
                                <span style="font-weight: 600;">${escapeHtml(item._type === 'recipe' ? item.title : item.name)}</span>
                                <span style="float: right; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">${item._type}</span>
                                ${pantryItemsHtml}
                            </div>
                        `;
                    }).join('');

                    document.querySelectorAll('.autocomplete-item').forEach(el => {
                        el.onclick = () => {
                            const selected = combined[parseInt(el.dataset.idx)];
                            searchInput.value = selected._type === 'recipe' ? selected.title : selected.name;
                            suggestionsBox.style.display = 'none';

                            if (selected._type === 'recipe') {
                                const sv = recipeServingGrams(selected) || 250;
                                pickerItem = { type: 'recipe', referenceId: selected.id, name: selected.title, servingSizeG: sv, defaultGrams: sv };
                            } else {
                                // Check if a pantry item was clicked
                                const pantryItemBtn = el.querySelector('.pantry-item-pick');
                                if (pantryItemBtn) {
                                    // This is handled by the pantry-item-pick click handler below
                                    return;
                                }
                                const sv = parseFloat(selected.servingSizeG) || 100;
                                pickerItem = { type: 'ingredient', referenceId: selected.foodId, name: selected.name, defaultGrams: sv };
                            }
                            renderPicker();
                        };
                    });

                    // Pantry item pick handlers
                    document.querySelectorAll('.pantry-item-pick').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const pantryId = btn.dataset.pantryId;
                            const pantryItem = pantryItems.find(p => p.pantryId === pantryId);
                            if (!pantryItem) return;
                            searchInput.value = pantryItem.brand ? pantryItem.brand + ' ' + pantryItem.productName : pantryItem.productName;
                            suggestionsBox.style.display = 'none';
                            const sv = pantryItem.packSize || 100;
                            pickerItem = { 
                                type: 'pantry', 
                                referenceId: pantryItem.pantryId, 
                                ingredientFoodId: pantryItem.ingredientFoodId,
                                name: pantryItem.brand ? pantryItem.brand + ' ' + pantryItem.productName : pantryItem.productName, 
                                defaultGrams: sv,
                                pantryItem: pantryItem
                            };
                            renderPicker();
                        });
                    });
                }
                suggestionsBox.style.display = 'block';
            };
            
            // Hide autocomplete on click outside
            document.addEventListener('click', (e) => {
                if (e.target !== searchInput && e.target !== suggestionsBox && !pickerEl.contains(e.target)) {
                    suggestionsBox.style.display = 'none';
                }
            });
            
            btnCancel.onclick = () => {
                assignModal.classList.remove('active');
            };
            // Close when clicking outside the panel (on the dimmed overlay).
            assignModal.onclick = (e) => {
                if (e.target === assignModal) assignModal.classList.remove('active');
            };
            
            btnClear.onclick = () => {
                mealPlans = mealPlans.filter(p => !(p.date === activeDate && p.slot === activeSlotName));
                assignModal.classList.remove('active');
                renderCMSList();
            };
            
            btnConfirm.onclick = () => {
                // Build the list of dates to apply to (within the currently viewed week)
                const today = new Date();
                const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - dayOfWeek + 1 + mealWeekOffset * 7);

                // Per-eater state: only keep eaters that matter (eating out or with items)
                const eatersToSave = modalEaters.map(e => ({
                    idx: e.idx,
                    eatingOut: !!e.eatingOut,
                    items: e.eatingOut ? [] : JSON.parse(JSON.stringify(e.items || []))
                }));
                const allOut = eatersToSave.length > 0 && eatersToSave.every(e => e.eatingOut);

                // Collect all target dates: the active date + any checked copy-to days
const targetDates = [activeDate];
                document.querySelectorAll('.copy-day-cb').forEach(cb => {
                    if (cb.checked && !cb.disabled) {
                        const d = new Date(startOfWeek);
                        d.setDate(startOfWeek.getDate() + parseInt(cb.value));
                        const ds = d.toISOString().split('T')[0];
                        if (!targetDates.includes(ds)) targetDates.push(ds);
                    }
                });
                
                // Apply to all target dates
                targetDates.forEach(dateStr => {
                    // Remove existing for this date+slot
                    mealPlans = mealPlans.filter(p => !(p.date === dateStr && p.slot === activeSlotName));
                    
                    mealPlans.push({
                        id: 'mp_' + Date.now().toString(36) + Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2),
                        date: dateStr,
                        slot: activeSlotName,
                        isEatingOut: allOut,
                        eaters: JSON.parse(JSON.stringify(eatersToSave)),
                        isConsumed: false
                    });
                });
                
                assignModal.classList.remove('active');
                renderCMSList();
            };
            
            // Save logic - saves ALL meal plans across ALL weeks
            document.getElementById('save-mealplan-btn').onclick = async () => {
                try {
                    const res = await fetch('/api/mealplans', {
                        method: 'PUT',
                        headers: HEADERS,
                        body: JSON.stringify(mealPlans)
                    });
                    if (!res.ok) throw new Error('Save failed');
                    statusText.innerHTML = `<span class="status-dot"></span> Saved Meal Plan (all weeks)`;
                } catch(e) {
                    alert('Save failed. Reverting to previous state.');
                    loadData();
                }
            };
            
            return;
        }
        
if (currentCMSTab === 'pantry') {
            renderPantryTab();
            return;
        }
        
        if (currentCMSTab === 'household') {
            let hhItems = householdItems
                .filter(item => !cmsSearchQuery || (item.name || '').toLowerCase().includes(cmsSearchQuery) || (item.category || '').toLowerCase().includes(cmsSearchQuery));
            if (cmsCategoryFilter !== 'All') {
                hhItems = hhItems.filter(item => (item.category || 'Uncategorized') === cmsCategoryFilter);
            }
            hhItems = hhItems
                .slice()
                .sort((a, b) => (estimateDepletionDate(a) || '9999-12-31').localeCompare(estimateDepletionDate(b) || '9999-12-31'));

            // Household sort accessor
            const hhSortVal = (item, key) => {
                switch (key) {
                    case 'item': return (item.name || '').toLowerCase();
                    case 'category': return (item.category || '').toLowerCase();
                    case 'stock': return parseFloat(item.currentStock) || 0;
                    case 'unit': return (item.unitSize || 'units').toLowerCase();
                    case 'duration': return parseFloat(item.avgDurationDays) > 0 ? parseFloat(item.avgDurationDays) : null;
                    case 'depletion': return estimateDepletionDate(item) || null;
                    case 'price': return parseFloat(item.pricePerUnit) > 0 ? parseFloat(item.pricePerUnit) : null;
                }
                return null;
            };
            const hhSort = cmsTableSort.household;
            if (hhSort && hhSort.key) hhItems = sortRows(hhItems, hhSort.key, hhSort.dir, hhSortVal);

            function daysBetween(from, to) {
                const ms = new Date(to) - new Date(from);
                return Math.max(0, Math.round(ms / 86400000));
            }
            function addDays(dateStr, days) {
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
                const firstUnitEnd = addDays(anchor, avg);
                return addDays(firstUnitEnd, Math.max(0, stock - 1) * avg);
            }
            function hhStatusInfo(item) {
                const stock = parseFloat(item.currentStock) || 0;
                const avg = parseFloat(item.avgDurationDays) || 0;
                const depletion = estimateDepletionDate(item);
                const today = new Date().toISOString().split('T')[0];
                let cls, label;
                if (stock <= 0) { cls = 'out-of-stock'; label = 'Out of Stock'; }
                else if (depletion && daysBetween(today, depletion) <= 7) { cls = 'low-stock'; label = 'Running Low'; }
                else if (avg > 0) { cls = 'in-stock'; label = 'Stocked'; }
                else { cls = 'not-tracked'; label = 'No Estimate'; }
                return { cls, label, stock, depletion, daysLeft: depletion ? daysBetween(today, depletion) : null };
            }

            const hhView = (localStorage.getItem('larder_household_view') || 'cards');

            function renderHouseholdCards(items) {
                if (items.length === 0) return '<div class="empty-state">No household items yet. Add soap, toothpaste, cleaning supplies, and more.</div>';
                return `<div class="vd-pantry-grid" id="household-grid">
                    ${items.map((item) => {
                        const s = hhStatusInfo(item);
                        const avg = parseFloat(item.avgDurationDays) || 0;
                        const price = parseFloat(item.pricePerUnit) || 0;
                        const stockLabel = (item.unitSize || 'units');
                        return `
                        <div class="vd-pantry-card" data-hhid="${escapeHtml(item.id)}" role="button" tabindex="0" title="Edit item">
                            <div class="vd-pantry-header">
                                <div class="vd-pantry-icon">
                                    <i data-lucide="${hhIcon(item.category)}" style="width: 20px; height: 20px; color: var(--primary);"></i>
                                </div>
                                <span class="vd-pantry-status ${s.cls}">${s.label}</span>
                            </div>
                            <div class="vd-pantry-info">
                                <div class="vd-pantry-title-row">
                                    <h4>${escapeHtml(item.name || 'Unnamed item')}</h4>
                                    <button type="button" class="cms-btn-icon delete household-delete-btn" data-id="${escapeHtml(item.id)}" title="Delete item" aria-label="Delete"><i data-lucide="trash-2" style="width: 15px; height: 15px;"></i></button>
                                </div>
                                <p>${escapeHtml(item.category || 'Uncategorized')}</p>
                            </div>
                            <div class="vd-pantry-tracker">
                                <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; font-size: 0.85rem; margin-bottom: 0.5rem;">
                                    <span style="color: var(--text-main); font-weight: 600;">${s.stock} ${escapeHtml(stockLabel)}</span>
                                    ${avg > 0 ? `<span style="color: var(--text-muted); font-size: 0.75rem;">~${avg}d each</span>` : ''}
                                </div>
                                ${s.depletion
                                    ? `<div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
                                        <span style="color: var(--text-muted);">Runs out</span>
                                        <span style="color: var(--text-main); font-weight: 600;">${escapeHtml(formatDateDMY(s.depletion))}</span>
                                        <span class="hh-days-left ${s.daysLeft !== null && s.daysLeft <= 7 ? 'hh-days-urgent' : ''}">${s.daysLeft !== null ? 'in ' + s.daysLeft + 'd' : ''}</span>
                                    </div>`
                                    : '<div style="color: var(--text-muted); font-size: 0.8rem;">Set avg. duration to estimate depletion</div>'}
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem;">
                                ${price > 0 ? `<span style="color: var(--text-muted);">Rs ${price.toFixed(0)}/unit</span>` : '<span></span>'}
                                <button type="button" class="btn secondary hh-open-btn" data-id="${escapeHtml(item.id)}" title="Log that you opened a new unit" style="padding: 0.3rem 0.6rem; font-size: 0.72rem;"><i data-lucide="package-open" style="width: 13px; height: 13px;"></i> Opened New Unit</button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>`;
            }

            function renderHouseholdTable(items) {
                if (items.length === 0) return '<div class="empty-state">No household items yet. Add soap, toothpaste, cleaning supplies, and more.</div>';
                return `<div class="vd-pantry-table-wrap">
                    <table class="vd-pantry-table">
                        <thead>
                            <tr>
                                ${sortTh('item', 'Item')}
                                ${sortTh('category', 'Category')}
                                ${sortTh('stock', 'Stock')}
                                ${sortTh('unit', 'Unit')}
                                ${sortTh('duration', 'Avg. Duration')}
                                ${sortTh('depletion', 'Estimated Depletion')}
                                ${sortTh('price', 'Price/Unit')}
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map((item) => {
                                const s = hhStatusInfo(item);
                                const avg = parseFloat(item.avgDurationDays) || 0;
                                const price = parseFloat(item.pricePerUnit) || 0;
                                const stockLabel = (item.unitSize || 'units');
                                return `
                                <tr data-hhid="${escapeHtml(item.id)}" style="cursor: pointer;">
                                    <td><span style="font-weight: 600;">${escapeHtml(item.name || 'Unnamed item')}</span></td>
                                    <td style="color: var(--text-muted);">${escapeHtml(item.category || 'Uncategorized')}</td>
                                    <td>${s.stock}</td>
                                    <td style="color: var(--text-muted);">${escapeHtml(stockLabel)}</td>
                                    <td>${avg > 0 ? avg + ' days' : '—'}</td>
                                    <td>
                                        ${s.depletion
                                            ? `${escapeHtml(formatDateDMY(s.depletion))} <span class="hh-days-left ${s.daysLeft !== null && s.daysLeft <= 7 ? 'hh-days-urgent' : ''}">(${s.daysLeft !== null ? 'in ' + s.daysLeft + 'd' : ''})</span>`
                                            : '<span style="color: var(--text-muted);">—</span>'}
                                    </td>
                                    <td>${price > 0 ? 'Rs ' + price.toFixed(0) : '—'}</td>
                                    <td>
                                        <button type="button" class="btn secondary hh-open-btn" data-id="${escapeHtml(item.id)}" title="Log that you opened a new unit" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;"><i data-lucide="package-open" style="width: 13px; height: 13px;"></i> Opened</button>
                                        <button type="button" class="cms-btn-icon delete household-delete-btn" data-id="${escapeHtml(item.id)}" title="Delete item" aria-label="Delete"><i data-lucide="trash-2" style="width: 15px; height: 15px;"></i></button>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;
            }

            addBtn.style.display = 'flex';
            setAddBtnLabel('Add Item');
            householdOpenFn = openHouseholdEditor;

            const runningLow = householdItems.filter(it => { const s = (parseFloat(it.currentStock) || 0); return s <= 0 || (parseFloat(it.avgDurationDays) || 0) > 0 && ((hhStatusInfo(it).daysLeft ?? 99) <= 7); }).length;
            const cardsHTML = `
                <div style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
                    Non-food consumables (toiletries, cleaning, paper goods). Depletion dates are estimated from stock × average duration. Log "Opened new unit" occasionally to recalibrate.
                    ${runningLow ? ` &mdash; <span style="color: var(--accent-danger, #c0392b); font-weight: 700;">${runningLow} item(s) running low</span>` : ''}
                </div>
                <div id="household-content">
                    ${hhView === 'table' ? renderHouseholdTable(hhItems) : renderHouseholdCards(hhItems)}
                </div>
            `;
            listContainer.innerHTML = cardsHTML;
            if (window.lucide) window.lucide.createIcons();

            function hhIcon(cat) {
                const c = (cat || '').toLowerCase();
                if (c.includes('toilet')) return 'shower-head';
                if (c.includes('clean')) return 'spray-can';
                if (c.includes('paper')) return 'layers';
                if (c.includes('kitchen')) return 'utensils';
                if (c.includes('batter')) return 'battery-charging';
                if (c.includes('pet')) return 'paw-print';
                return 'package';
            }

            function openHouseholdEditor(id = null) {
                const item = id ? householdItems.find(x => x.id === id) : null;
                document.getElementById('household-id').value = item ? item.id : '';
                document.getElementById('household-name').value = (item && item.name) || '';
                document.getElementById('household-category').value = (item && item.category) || '';
                const unitSelect = document.getElementById('household-unit-size');
                if (unitSelect) {
                    const existing = (item && item.unitSize) || '';
                    if (existing && ![...unitSelect.options].some(o => o.value === existing)) {
                        const opt = document.createElement('option');
                        opt.value = existing; opt.textContent = existing;
                        unitSelect.appendChild(opt);
                    }
                    unitSelect.value = existing;
                }
                document.getElementById('household-stock').value = (item && item.currentStock) || '';
                document.getElementById('household-duration').value = (item && item.avgDurationDays) || '';
                document.getElementById('household-price').value = (item && item.pricePerUnit) || '';
                document.getElementById('household-last-opened').value = (item && item.lastOpenedDate) || '';
                const delBtn = document.getElementById('household-delete-btn');
                delBtn.style.display = item ? '' : 'none';
                document.getElementById('cms-household-modal').classList.add('active');
                document.body.style.overflow = 'hidden';
            }

            document.querySelectorAll('.vd-pantry-card[data-hhid], tr[data-hhid]').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.closest('button')) return;
                    openHouseholdEditor(card.dataset.hhid);
                });
                card.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openHouseholdEditor(card.dataset.hhid);
                    }
                });
            });
            document.querySelectorAll('.hh-open-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const item = householdItems.find(x => x.id === btn.dataset.id);
                    if (!item) return;
                    const today = new Date().toISOString().split('T')[0];
                    const prevOpen = item.lastOpenedDate;
                    let elapsed = null;
                    if (prevOpen) elapsed = daysBetween(prevOpen, today);
                    if (elapsed !== null && elapsed > 0) {
                        const history = Array.isArray(item.durationHistory) ? item.durationHistory.slice() : [];
                        history.push(elapsed);
                        const avg = history.reduce((a, b) => a + b, 0) / history.length;
                        item.durationHistory = history;
                        item.avgDurationDays = Math.round(avg);
                    }
                    item.lastOpenedDate = today;
                    item.currentStock = Math.max(0, (parseFloat(item.currentStock) || 0) - 1);
                    await saveHousehold();
                    renderCMSList();
                });
            });
            document.querySelectorAll('.household-delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    const item = householdItems.find(x => x.id === id);
                    const confirmed = await showConfirmDialog(
                        'Remove Household Item',
                        `Remove "${item ? item.name : 'this item'}" from household supplies?`,
                        'Remove'
                    );
                    if (!confirmed) return;
                    householdItems = householdItems.filter(x => x.id !== id);
                    renderCMSList();
                    await saveHousehold();
                });
            });

            bindSortHandlers(listContainer);
            return;
        }

        if (currentCMSTab === 'shopping') {
            const uiHTML = `
                <div class="shop-gen-panel">
                    <div class="shop-gen-head"><i data-lucide="sliders-horizontal" style="width: 15px; height: 15px;"></i> What to include in this list?</div>
                    <div class="shop-gen-sources">
                        <label class="shop-src"><input type="checkbox" data-source="meals" checked><span>Planned meals <small>(this week)</small></span></label>
                        <label class="shop-src"><input type="checkbox" data-source="planner"><span>Monthly planner</span></label>
                        <label class="shop-src"><input type="checkbox" data-source="restock"><span>Pantry low / out of stock</span></label>
                        <label class="shop-src"><input type="checkbox" data-source="household"><span>Household supplies (running low)</span></label>
                    </div>
                    <div class="shop-gen-actions">
                        <button id="generate-list-btn" class="btn primary"><i data-lucide="refresh-cw" style="width: 16px; height: 16px;"></i><span>Generate Shopping List</span></button>
                        <button id="save-list-btn" class="btn secondary" style="display: none;"><i data-lucide="save" style="width: 16px; height: 16px;"></i><span>Save List</span></button>
                        <button id="print-list-btn" class="btn secondary"><i data-lucide="printer" style="width: 16px; height: 16px;"></i> Print / Save PDF</button>
                        <span class="shop-gen-hint">Tracked pantry stock is subtracted from every included source automatically.</span>
                    </div>
                </div>
                <div id="shopping-budget-card" style="margin-bottom: 1.5rem;"></div>
                <div id="shopping-list-results" style="display: grid; gap: 1rem;">
                    <!-- Results render here -->
                    <div class="empty-state">Tick what to include and click "Generate" to calculate your shopping needs.</div>
                </div>
            `;
            listContainer.innerHTML = uiHTML;
            addBtn.style.display = 'none';

            const resultsContainer = document.getElementById('shopping-list-results');
            const saveListBtn = document.getElementById('save-list-btn');

            async function persistShoppingList() {
                try {
                    const res = await fetch('/api/shoppinglists', {
                        method: 'PUT',
                        headers: HEADERS,
                        body: JSON.stringify(shoppingLists)
                    });
                    if (!res.ok) throw new Error('Save failed');
                    const label = saveListBtn.querySelector('span');
                    if (label) label.textContent = ' Saved';
                    setTimeout(() => { if (label) label.textContent = ' Save List'; }, 1500);
                } catch (e) {
                    alert('Failed to save shopping list. Reverting to previous state.');
                    loadData();
                }
            }

            // --- Budget vs meal plan cost ---
            function computeWeekCost() {
                const plans = currentWeekPlans();
                const agg = new Map(); // foodId -> { name, grams, recipes:Set, category }
                const unpriced = [];
                const addUnpriced = (name, reason) => {
                    if (name && !unpriced.find(u => u.name === name)) unpriced.push({ name, reason });
                };

                plans.forEach(plan => {
                    const recipeMult = {}; // recipeId -> servings to cook
                    const ingGrams = {}; // foodId -> total grams
                    (plan.eaters || []).forEach(eater => {
                        if (eater.eatingOut) return;
                        (eater.items || []).forEach(item => {
                            const grams = parseFloat(item.grams) || 0;
                            if (!(grams > 0)) return;
                            if (item.type === 'recipe') {
                                recipeMult[item.referenceId] = recipeServingsToCook(plan, item.referenceId);
                            } else if (item.type === 'ingredient' && item.referenceId) {
                                ingGrams[item.referenceId] = (ingGrams[item.referenceId] || 0) + grams;
                            }
                        });
                    });
                    Object.keys(recipeMult).forEach(rid => {
                        const recipe = recipes.find(r => r.id === rid);
                        if (!recipe || !recipe.ingredients) return;
                        const mult = recipeMult[rid];
                        recipe.ingredients.forEach(ing => {
                            if (!ing.foodId) return;
                            const foodRef = ingredients.find(f => f.foodId === ing.foodId);
                            const name = foodRef ? foodRef.name : (ing.item || ing.name || 'Unknown');
                            const grams = parseAmountToGrams(ing.metric || ing.imperial || ing.amount, foodRef);
                            const price = perGramPrice(foodRef);
                            if (grams === null) { addUnpriced(name, 'unknown unit'); return; }
                            if (!(price > 0)) { addUnpriced(name, 'no price set'); return; }
                            const scaled = grams * mult;
                            const ex = agg.get(ing.foodId);
                            if (ex) { ex.grams += scaled; if (recipe.title) ex.recipes.add(recipe.title); }
                            else agg.set(ing.foodId, { name, grams: scaled, recipes: recipe.title ? new Set([recipe.title]) : new Set(), category: (foodRef && foodRef.category) || 'Other' });
                        });
                    });
                    Object.keys(ingGrams).forEach(foodId => {
                        const foodRef = ingredients.find(f => f.foodId === foodId);
                        const name = foodRef ? foodRef.name : 'Ingredient';
                        const price = perGramPrice(foodRef);
                        if (!(price > 0)) { addUnpriced(name, 'no price set'); return; }
                        const scaled = ingGrams[foodId];
                        const ex = agg.get(foodId);
                        if (ex) ex.grams += scaled;
                        else agg.set(foodId, { name, grams: scaled, recipes: new Set(), category: (foodRef && foodRef.category) || 'Other' });
                    });
                });

                const categories = new Map();
                let total = 0;
                agg.forEach((data, foodId) => {
                    const cost = data.grams * perGramPrice(ingredients.find(f => f.foodId === foodId));
                    total += cost;
                    if (!categories.has(data.category)) categories.set(data.category, []);
                    categories.get(data.category).push({ name: data.name, grams: Math.round(data.grams), cost: Math.round(cost * 10) / 10, recipes: Array.from(data.recipes) });
                });

                const currency = mealPlanCurrency();

                return {
                    total: Math.round(total * 10) / 10,
                    currency,
                    planCount: plans.length,
                    categories: [...categories.entries()].map(([c, items]) => ({ category: c, items, subtotal: Math.round(items.reduce((s, x) => s + x.cost, 0) * 10) / 10 })),
                    unpriced
                };
            }

            function backfillListCosts(list) {
                list.forEach(item => {
                    if (item.cost == null) {
                        const foodRef = ingredients.find(f => f.foodId === item.foodId);
                        const grams = parseAmountToGrams((item.amount != null ? item.amount : 0) + ' ' + (item.unit || 'g'), foodRef);
                        const unitPrice = perGramPrice(foodRef);
                        item.grams = (grams === null ? null : Math.round(grams * 10) / 10);
                        item.cost = (grams !== null && unitPrice > 0) ? Math.round(grams * unitPrice * 100) / 100 : null;
                    }
                });
                return list;
            }

            function renderBudget() {
                const card = document.getElementById('shopping-budget-card');
                if (!card) return;
                if (Array.isArray(shoppingLists)) backfillListCosts(shoppingLists);
                const cost = computeWeekCost();
                const budgetAmt = parseFloat(appSettings.shopping && appSettings.shopping.amount) || 0;

                if (cost.planCount === 0) {
                    card.innerHTML = `
                        <div class="shopping-budget-card">
                            <div class="sb-head">
                                <div class="sb-title"><i data-lucide="wallet" style="width: 18px; height: 18px;"></i> Weekly Budget</div>
                            </div>
                            <div class="sb-empty">No meals are planned for this week, so there's nothing to cost yet. Plan a few recipes and the estimated cost will show here.</div>
                        </div>`;
                    if (window.lucide) window.lucide.createIcons();
                    return;
                }

                const pct = budgetAmt > 0 ? Math.min(100, Math.round((cost.total / budgetAmt) * 100)) : (cost.total > 0 ? 100 : 0);
                const over = budgetAmt > 0 && cost.total > budgetAmt;
                const statusCls = over ? 'sb-over' : (budgetAmt > 0 ? 'sb-under' : 'sb-unset');
                const statusTextLabel = over
                    ? `Over budget by ${formatMoney(cost.total - budgetAmt, cost.currency)}`
                    : (budgetAmt > 0 ? `Within budget · ${formatMoney(budgetAmt - cost.total, cost.currency)} to spare` : 'No budget set — set one in Settings → Shopping');

                const categoryRows = cost.categories.map(c => `
                    <div class="sb-cat-row">
                        <span class="sb-cat-name">${escapeHtml(c.category)}</span>
                        <div class="sb-cat-bar"><div class="sb-cat-fill" style="width: ${budgetAmt > 0 ? Math.min(100, Math.round((c.subtotal / budgetAmt) * 100)) : 0}%;"></div></div>
                        <span class="sb-cat-amt">${formatMoney(c.subtotal, cost.currency)}</span>
                    </div>`).join('');

const unpricedRow = cost.unpriced.length
                    ? `<div class="sb-unpriced">
                        <div class="sb-unpriced-title"><i data-lucide="info" style="width: 14px; height: 14px;"></i> ${cost.unpriced.length} ingredient${cost.unpriced.length > 1 ? 's' : ''} not costed</div>
                        <div class="sb-unpriced-list">${cost.unpriced.slice(0, 6).map(u => `${escapeHtml(u.name)} (${escapeHtml(u.reason)})`).join(', ')}${cost.unpriced.length > 6 ? ` +${cost.unpriced.length - 6} more` : ''}</div>
                    </div>`
                    : '';

                const listItems = Array.isArray(shoppingLists) ? shoppingLists : [];
                const hasListCost = listItems.some(i => i.cost != null && i.cost > 0);
                const listTotal = listItems.reduce((s, i) => s + (parseFloat(i.cost) || 0), 0);
                const listCostRow = hasListCost
                    ? `<div class="sb-stat" style="border-top:1px solid var(--border);padding-top:10px;color:var(--muted);"><span class="sb-stat-label">Shopping list cost<br><small style="opacity:.75">after pantry stock</small></span><span class="sb-stat-value">${formatMoney(Math.round(listTotal * 10) / 10, cost.currency)}</span></div>`
                    : '';

                card.innerHTML = `
                    <div class="shopping-budget-card">
                        <div class="sb-head">
                            <div class="sb-title"><i data-lucide="wallet" style="width: 18px; height: 18px;"></i> Weekly Budget vs Meal Plan Cost</div>
                            <span class="sb-status ${statusCls}">${escapeHtml(statusTextLabel)}</span>
                        </div>
                        <div class="sb-bar"><div class="sb-fill ${over ? 'sb-fill-over' : ''}" style="width: ${pct}%;"></div></div>
                        <div class="sb-meta">
                            <div class="sb-stat"><span class="sb-stat-label">Estimated cost</span><span class="sb-stat-value">${formatMoney(cost.total, cost.currency)}</span></div>
                            <div class="sb-stat"><span class="sb-stat-label">Weekly budget</span><span class="sb-stat-value">${formatMoney(budgetAmt, cost.currency)}</span></div>
                            <div class="sb-stat"><span class="sb-stat-label">Meals planned</span><span class="sb-stat-value">${cost.planCount}</span></div>
                            ${listCostRow}
                        </div>
                        ${categoryRows ? `<div class="sb-cats">${categoryRows}</div>` : ''}
                        ${unpricedRow}
                    </div>`;
                if (window.lucide) window.lucide.createIcons();
            }

            function renderShoppingList(list) {
                if (!list || list.length === 0) {
                    resultsContainer.innerHTML = `<div class="empty-state">Nothing to buy! You either have no meals planned, or your pantry is fully stocked.</div>`;
                    return;
                }

                const currency = mealPlanCurrency();
                const listTotal = list.reduce((s, i) => s + (parseFloat(i.cost) || 0), 0);
                const costableCount = list.filter(i => i.cost != null && i.cost > 0).length;
                const uncostedCount = list.length - costableCount;
                const listBudgetAmt = parseFloat(appSettings.shopping && appSettings.shopping.amount) || 0;
                const listOver = listBudgetAmt > 0 && listTotal > listBudgetAmt;

                const suggestionMap = {};
                if (listOver) {
                    list.forEach(item => {
                        const fr = ingredients.find(f => f.foodId === item.foodId);
                        if (!fr) return;
                        const ppg = perGramPrice(fr);
                        if (!(ppg > 0) || !(item.grams > 0)) return;
                        let best = null, bestSave = Infinity;
                        ingredients.forEach(alt => {
                            if (alt.foodId === item.foodId) return;
                            if ((alt.category || 'Other') !== (fr.category || 'Other')) return;
                            const altPpg = perGramPrice(alt);
                            if (!(altPpg > 0) || altPpg >= ppg) return;
                            const save = (ppg - altPpg) * item.grams;
                            if (save < bestSave) { bestSave = save; best = alt; }
                        });
                        if (best) suggestionMap[item.foodId] = { name: best.name, save: Math.round(bestSave * 100) / 100, toId: best.foodId };
                    });
                }

                const groups = {};
                list.forEach(item => {
                    const cat = item.category || 'Other';
                    if (!groups[cat]) groups[cat] = [];
                    groups[cat].push(item);
                });

                let listHTML = `<div class="vd-shop-container" id="shopping-print-area">`;
                Object.entries(groups).forEach(([cat, items]) => {
                    listHTML += `<div class="vd-shop-group">`;
                    listHTML += `
                        <div class="vd-shop-group-header">
                            <i data-lucide="shopping-basket" style="width: 16px; height: 16px;"></i> ${escapeHtml(cat)}
                            <span class="vd-shop-group-count">${items.length}</span>
                        </div>`;
                    items.forEach((item, itemIdx) => {
                        const recipeTags = (item.recipes || []).slice(0, 3).map(r => `
                            <span class="vd-shop-recipe-tag"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> ${escapeHtml(r)}</span>
                        `).join('');
                        const isChecked = item.checked ? ' checked' : '';
                        const costLabel = (item.cost != null && item.cost > 0)
                            ? `<span class="vd-shop-cost">≈ ${formatMoney(item.cost, currency)}</span>`
                            : `<span class="vd-shop-no-cost" title="No price set for this item — not included in the list total"><i data-lucide="triangle-alert" style="width: 13px; height: 13px;"></i> No price</span>`;
                        const sugg = suggestionMap[item.foodId];
                        const suggLabel = sugg
                            ? `<div class="vd-shop-suggestion"><i data-lucide="sparkles" style="width: 12px; height: 12px;"></i> Cheaper swap: ${escapeHtml(sugg.name)} — save ≈ ${formatMoney(sugg.save, currency)}</div>`
                            : '';
                        listHTML += `
                        <div class="vd-shop-item${isChecked}" data-cat="${escapeHtml(cat)}" data-idx="${itemIdx}">
                            <div class="vd-shop-checkbox" role="checkbox" tabindex="0" aria-checked="${item.checked ? 'true' : 'false'}"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                            <div class="vd-shop-item-details">
                                <div class="vd-shop-item-title">${escapeHtml(item.name)}</div>
                                <div class="vd-shop-item-meta">
                                    <span class="vd-shop-qty">${escapeHtml(formatAmountDisplay(item.amount, item.unit))}</span>
                                    ${costLabel}
                                    ${recipeTags}
                                </div>
                            </div>
                            ${suggLabel}
                        </div>`;
                    });
                    listHTML += `</div>`;
                });

                if (costableCount > 0 || uncostedCount > 0) {
                    const statusCls = costableCount > 0 ? (listOver ? 'sb-over' : 'sb-under') : 'sb-unset';
                    const statusText = costableCount > 0
                        ? (listOver ? `Over budget by ${formatMoney(listTotal - listBudgetAmt, currency)}` : (listBudgetAmt > 0 ? 'Within budget' : 'No budget set'))
                        : 'No priced items';
                    const saleText = listOver
                        ? `This list exceeds ${formatMoney(listBudgetAmt, currency)} by ${formatMoney(listTotal - listBudgetAmt, currency)}. Cheaper same-category swaps suggested below.`
                        : '';
                    const usCostWarning = uncostedCount > 0
                        ? `<span class="vd-shop-sale-text" style="color: var(--accent-danger, #c0392b); font-weight: 600;"><i data-lucide="triangle-alert" style="width: 12px; height: 12px; vertical-align: -2px;"></i> ${uncostedCount} item${uncostedCount > 1 ? 's' : ''} have no price and ${uncostedCount > 1 ? 'are' : 'is'} not included in this total.</span>`
                        : '';
                    listHTML += `
                        <div class="vd-shop-summary">
                            <span class="vd-shop-summary-label">Estimated list total</span>
                            <span class="vd-shop-summary-total">${formatMoney(listTotal, currency)}</span>
                            <span class="sb-status ${statusCls}">${escapeHtml(statusText)}</span>
                            ${saleText ? `<span class="vd-shop-sale-text">${escapeHtml(saleText)}</span>` : ''}
                            ${usCostWarning}
                        </div>`;
                }
                listHTML += `</div>`;
                resultsContainer.innerHTML = listHTML;
                if (window.lucide) window.lucide.createIcons();
                saveListBtn.style.display = 'inline-flex';

                document.querySelectorAll('.vd-shop-item').forEach(row => {
                    const checkbox = row.querySelector('.vd-shop-checkbox');
                    const updateChecked = () => {
                        row.classList.toggle('checked');
                        const isChecked = row.classList.contains('checked');
                        checkbox.setAttribute('aria-checked', isChecked ? 'true' : 'false');
                        const cat = row.dataset.cat;
                        const idx = row.dataset.idx;
                        const group = groups[cat];
                        if (group && group[idx]) group[idx].checked = isChecked;
                    };
                    checkbox.addEventListener('click', updateChecked);
                    checkbox.addEventListener('keydown', (e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            updateChecked();
                        }
                    });
                });
            }

            // Load a previously saved list if one exists
            if (Array.isArray(shoppingLists) && shoppingLists.length > 0) {
                renderShoppingList(backfillListCosts(shoppingLists));
            }
            renderBudget();

            document.getElementById('print-list-btn').onclick = () => {
                const area = document.getElementById('shopping-print-area');
                if (!area) {
                    alert('Generate a shopping list first, then print.');
                    return;
                }
                document.body.classList.add('printing-shopping');
                window.print();
                document.body.classList.remove('printing-shopping');
            };

            document.getElementById('save-list-btn').onclick = () => persistShoppingList();

            function generateList() {
                // 1. Determine which sources the user ticked
                const selected = new Set();
                document.querySelectorAll('.shop-src input[data-source]').forEach(box => {
                    if (box.checked) selected.add(box.dataset.source);
                });
                const useMeals = selected.has('meals');
                const usePlanner = selected.has('planner');
                const useRestock = selected.has('restock');
                const useHousehold = selected.has('household');

                const need = new Map(); // foodId -> { name, grams, unit, recipes:Set, category, sources:Set, pantryIds:Set }
                const addNeed = (foodId, name, grams, recipeTitle, category, source, pantryId = null) => {
                    if (!foodId || !(grams > 0)) return;
                    const ex = need.get(foodId);
                    if (ex) {
                        ex.grams += grams;
                        if (recipeTitle) ex.recipes.add(recipeTitle);
                        if (source) ex.sources.add(source);
                        if (pantryId) ex.pantryIds.add(pantryId);
                    } else {
                        need.set(foodId, {
                            name, grams,
                            unit: 'g',
                            recipes: recipeTitle ? new Set([recipeTitle]) : new Set(),
                            category: category || 'Other',
                            sources: source ? new Set([source]) : new Set(),
                            pantryIds: pantryId ? new Set([pantryId]) : new Set()
                        });
                    }
                };
                
                // Get pantry stock for new pantry items (in grams)
                const pantryItemStockGrams = (pantryId) => {
                    const pItem = pantryItems.find(p => p.pantryId === pantryId);
                    if (!pItem || !pItem.isTracked) return 0;
                    const qty = parseFloat(pItem.quantity) || 0;
                    const packSize = parseFloat(pItem.packSize) || 0;
                    return qty * packSize;
                };
                
                // Get pantry stock for legacy pantry (for backwards compatibility)
                const pantryStockGrams = (p) => {
                    if (!p || !p.isTracked) return 0;
                    const q = parseFloat(p.quantity) || 0;
                    const ing = ingredients.find(f => f.foodId === p.foodId);
                    const u = String(ing && ing.servingUnit || 'g').toLowerCase();
                    if (u === 'g' || u === 'ml') return q;
                    if (u === 'kg' || u === 'l') return q * 1000;
                    return q * (parseFloat(ing && ing.servingSizeG) || 100);
                };

                // 2. Planned meals (this week)
                if (useMeals) {
                    const plans = currentWeekPlans();
                    plans.forEach(plan => {
                        const recipeMult = {}; // recipeId -> servings to cook
                        const ingGrams = {}; // foodId -> total grams
                        (plan.eaters || []).forEach(eater => {
                            if (eater.eatingOut) return;
                            (eater.items || []).forEach(item => {
                                const grams = parseFloat(item.grams) || 0;
                                if (!(grams > 0)) return;
                                if (item.type === 'recipe') {
                                    recipeMult[item.referenceId] = recipeServingsToCook(plan, item.referenceId);
                                } else if ((item.type === 'ingredient' || item.type === 'pantry') && item.referenceId) {
                                    // For pantry items, referenceId is pantryId
                                    if (item.type === 'pantry') {
                                        ingGrams[item.ingredientFoodId] = (ingGrams[item.ingredientFoodId] || 0) + grams;
                                    } else {
                                        ingGrams[item.referenceId] = (ingGrams[item.referenceId] || 0) + grams;
                                    }
                                }
                            });
                        });
                        Object.keys(recipeMult).forEach(rid => {
                            const recipe = recipes.find(r => r.id === rid);
                            if (!recipe || !recipe.ingredients) return;
                            const mult = recipeMult[rid];
                            const yieldNum = recipeYield(recipe);
                            recipe.ingredients.forEach(ing => {
                                if (!ing.foodId) return;
                                const foodRef = ingredients.find(f => f.foodId === ing.foodId);
                                const name = foodRef ? foodRef.name : (ing.item || ing.name || 'Unknown');
                                const batchGrams = parseAmountToGrams(ing.metric || ing.imperial || ing.amount, foodRef);
                                if (batchGrams === null || batchGrams <= 0) return;
                                const perServingGrams = batchGrams / yieldNum;
                                addNeed(ing.foodId, name, perServingGrams * mult, recipe.title, (foodRef && foodRef.category) || 'Other', 'meals');
                            });
                        });
                        Object.keys(ingGrams).forEach(foodId => {
                            const foodRef = ingredients.find(f => f.foodId === foodId);
                            if (!(ingGrams[foodId] > 0)) return;
                            addNeed(foodId, foodRef ? foodRef.name : 'Ingredient', ingGrams[foodId], '', (foodRef && foodRef.category) || 'Other', 'meals');
                        });
                    });
                }

                // 3. Monthly planner (stock-aware rows only buy the shortfall)
                if (usePlanner && Array.isArray(planner.items)) {
                    planner.items.forEach(it => {
                        const foodRef = ingredients.find(f => f.foodId === it.ingredientId);
                        if (!foodRef) return;
                        const grams = LC.gramsOf(it.amount, it.unit, foodRef);
                        if (!(grams > 0)) return;
                        const stockG = it.useStock ? pantryStockGrams(pantry.find(p => p.foodId === it.ingredientId)) : 0;
                        const buy = Math.max(0, grams - stockG);
                        addNeed(it.ingredientId, foodRef.name, buy, '', foodRef.category || 'Other', 'planner');
                    });
                }

                // 4. Pantry restock: tracked items low or out of stock (target 10 packs)
                if (useRestock) {
                    pantryItems.forEach(pItem => {
                        if (!pItem.isTracked) return;
                        const q = parseFloat(pItem.quantity) || 0;
                        if (q > 0 && q >= 10) return;
                        const reorderPacks = Math.max(1, 10 - q);
                        const reorderGrams = reorderPacks * (parseFloat(pItem.packSize) || 100);
                        addNeed(pItem.ingredientFoodId, pItem.productName, reorderGrams, '', 
                            (ingredients.find(i => i.foodId === pItem.ingredientFoodId) || {}).category || 'Other', 'restock', pItem.pantryId);
                    });
                }

                // 5. Subtract tracked pantry stock once for all aggregated food needs
                const shoppingList = [];
                need.forEach((data, foodId) => {
                    // Calculate total pantry stock for this ingredient (legacy + new pantry items)
                    let totalPantryStockGrams = 0;
                    
                    // Legacy pantry stock
                    const legacyPantryItem = pantry.find(p => p.foodId === foodId);
                    totalPantryStockGrams += pantryStockGrams(legacyPantryItem);
                    
                    // New pantry items stock
                    data.pantryIds.forEach(pantryId => {
                        totalPantryStockGrams += pantryItemStockGrams(pantryId);
                    });
                    
                    let deficit = data.grams - totalPantryStockGrams;
                    if (deficit <= 0) return;
                    
                    const foodRef = ingredients.find(f => f.foodId === foodId);
                    
                    // Find best pricing from pantry items
                    let unitPrice = 0;
                    let priceCurrency = 'MUR';
                    let bestPantryItem = null;
                    
                    data.pantryIds.forEach(pantryId => {
                        const pItem = pantryItems.find(p => p.pantryId === pantryId);
                        if (pItem && pItem.price > 0 && pItem.packSize > 0) {
                            const pricePerGram = pItem.price / pItem.packSize;
                            if (!unitPrice || pricePerGram < unitPrice) {
                                unitPrice = pricePerGram;
                                priceCurrency = pItem.currency || 'MUR';
                                bestPantryItem = pItem;
                            }
                        }
                    });
                    
                    // Fallback to ingredient pricing
                    if (!unitPrice) {
                        unitPrice = perGramPrice(foodRef);
                        if (foodRef && foodRef.priceCurrency) priceCurrency = foodRef.priceCurrency;
                    }
                    
                    const pantryItemNames = bestPantryItem ? (bestPantryItem.brand ? bestPantryItem.brand + ' ' + bestPantryItem.productName : bestPantryItem.productName) : data.name;
                    
                    shoppingList.push({
                        foodId,
                        name: pantryItemNames,
                        amount: Math.round(deficit * 10) / 10,
                        unit: 'g',
                        category: data.category,
                        recipes: Array.from(data.recipes || []),
                        checked: false,
                        grams: Math.round(deficit * 10) / 10,
                        cost: (unitPrice > 0) ? Math.round(deficit * unitPrice * 100) / 100 : null,
                        currency: priceCurrency,
                        sources: Array.from(data.sources || []),
                        pantryIds: Array.from(data.pantryIds || [])
                    });
                });

                // 6. Household supplies running low (one unit each to re-buy)
                if (useHousehold) {
                    householdRunningLow().forEach(item => {
                        const price = parseFloat(item.pricePerUnit) || 0;
                        shoppingList.push({
                            foodId: null,
                            name: item.name,
                            amount: 1,
                            unit: item.unitSize || 'unit',
                            category: 'Household',
                            recipes: [],
                            checked: false,
                            grams: null,
                            cost: price > 0 ? price : null,
                            sources: ['household']
                        });
                    });
                }

                return shoppingList.sort((a, b) => a.name.localeCompare(b.name));
            }

            document.getElementById('generate-list-btn').onclick = () => {
                const list = generateList();
                shoppingLists = list;
                renderShoppingList(list);
                renderBudget();
                persistShoppingList();
            };

            // If the Monthly Planner asked to generate a list, pre-tick its
            // source box(es) and generate immediately.
            if (pendingShoppingSources && Array.isArray(pendingShoppingSources)) {
                pendingShoppingSources.forEach(src => {
                    const box = document.querySelector(`.shop-src input[data-source="${src}"]`);
                    if (box) box.checked = true;
                });
            }
            if (pendingShoppingSources && document.querySelector('.shop-src input:checked')) {
                pendingShoppingSources = null;
                document.getElementById('generate-list-btn').click();
            }
            pendingShoppingSources = null;
            
            return;
        }

        if (currentCMSTab === 'food') {
            addBtn.style.display = 'flex';
            setAddBtnLabel('Add Ingredient');

            let filteredIngredients = ingredients.filter(ing =>
                ing.name.toLowerCase().includes(cmsSearchQuery) ||
                (ing.category && ing.category.toLowerCase().includes(cmsSearchQuery))
            );
            if (cmsCategoryFilter !== 'All') {
                filteredIngredients = filteredIngredients.filter(ing => (ing.category || 'Uncategorized') === cmsCategoryFilter);
            }

            if (['cal', 'carbs', 'protein', 'fat'].some(k => cmsMacroFilters[k].min !== null || cmsMacroFilters[k].max !== null)) {
                filteredIngredients = filteredIngredients.filter(ing => cmsItemPassesFilters(ing, { isRecipe: false }));
            }

            if (filteredIngredients.length === 0) {
                listContainer.innerHTML = `<div class="empty-state">No ingredients found. Click "Add Ingredient" to create one!</div>`;
                return;
            }

            // Food sort accessor
            const foodSortVal = (ing, key) => {
                switch (key) {
                    case 'name': return (ing.name || '').toLowerCase();
                    case 'category': return (ing.category || '').toLowerCase();
                    case 'serving': return `${ing.servingSizeG || ''}${ing.servingUnit || 'g'}`.toLowerCase();
                    case 'status': return 'published';
                }
                return null;
            };
            const foodSort = cmsTableSort.food;
            if (foodSort && foodSort.key) filteredIngredients = sortRows(filteredIngredients, foodSort.key, foodSort.dir, foodSortVal);

            // Price-aware matching: per-100g unit price + cheapest-in-category badge
            const priceCur = mealPlanCurrency();
            const cheapestByCat = {};
            ingredients.forEach(ing => {
                const ppg = perGramPrice(ing);
                if (!(ppg > 0)) return;
                const cat = ing.category || 'Other';
                if (!cheapestByCat[cat] || ppg < cheapestByCat[cat].ppg) cheapestByCat[cat] = { ppg, foodId: ing.foodId };
            });
            const isCheapest = (ing) => {
                const c = cheapestByCat[ing.category || 'Other'];
                return !!(c && c.foodId === ing.foodId);
            };

            if (cmsListView === 'grid') {
                listContainer.innerHTML = `
                    <div class="cms-grid-wrapper">
                        ${filteredIngredients.map(ing => {
                            const vis = getCategoryIcon(ing.category);
                            const serving = `${ing.servingSizeG ? ing.servingSizeG : ''}${ing.servingUnit || 'g'} serving`;
                            const cheapest = isCheapest(ing);
                            return `
                            <div class="cms-card" data-id="${escapeHtml(ing.foodId)}" role="button" tabindex="0" title="Edit ingredient">
                                <div class="cms-card-img-wrap">
                                    <svg viewBox="${vis.vb}" style="width:${vis.w * 2}px;height:${vis.h * 2}px;fill:${vis.accent};"><use href="${vis.href}"></use></svg>
                                </div>
                                <div class="cms-card-body">
                                    <div class="cms-card-title-row">
                                        <div class="cms-card-title">${escapeHtml(ing.name || 'Unnamed ingredient')}</div>
                                        <button class="cms-btn-icon delete food-delete-btn" data-id="${escapeHtml(ing.foodId)}" title="Delete" aria-label="Delete"><i data-lucide="trash-2" style="width: 16px; height: 16px;"></i></button>
                                    </div>
                                    <div class="cms-card-sub">${escapeHtml(ing.category || 'Uncategorized')}${cheapest ? `<span class="cms-cheapest"><i data-lucide="star" style="width: 12px; height: 12px;"></i> Cheapest</span>` : ''}</div>
                                    <div class="cms-card-meta"><span>${escapeHtml(serving)}</span></div>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                `;
            } else {
                listContainer.innerHTML = `
                    <div class="cms-table-wrapper">
                        <table class="cms-table">
                            <thead>
                                <tr>
                                    ${sortTh('name', 'Ingredient')}
                                    ${sortTh('category', 'Category', 'width: 240px;')}
                                    ${sortTh('status', 'Status', 'width: 130px;')}
                                    <th style="width: 110px; text-align: right;">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${filteredIngredients.map(ing => {
                                    const vis = getCategoryIcon(ing.category);
                                    const serving = `${ing.servingSizeG ? ing.servingSizeG : ''}${ing.servingUnit || 'g'} serving`;
                                    return `
                                    <tr data-id="${escapeHtml(ing.foodId)}" style="cursor: pointer;">
                                        <td>
                                            <div class="cms-td-title">
                                                <div class="cms-td-icon">
                                                    <svg viewBox="${vis.vb}" style="width:${vis.w}px;height:${vis.h}px;fill:${vis.accent};"><use href="${vis.href}"></use></svg>
                                                </div>
                                                <div>
                                                    <div>${escapeHtml(ing.name || 'Unnamed ingredient')}${isCheapest(ing) ? ` <span class="cms-cheapest"><i data-lucide="star" style="width: 12px; height: 12px;"></i></span>` : ''}</div>
                                                    <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">${escapeHtml(serving)}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>${escapeHtml(ing.category || '—')}</td>
                                        <td><span class="cms-badge published">Published</span></td>
                                        <td class="cms-actions-cell">
                                            <button class="cms-btn-icon delete food-delete-btn" data-id="${escapeHtml(ing.foodId)}" title="Delete" aria-label="Delete"><i data-lucide="trash-2" style="width: 16px; height: 16px;"></i></button>
                                        </td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
            if (window.lucide) window.lucide.createIcons();

            bindSortHandlers(listContainer);

            document.querySelectorAll('.cms-card[data-id], tr[data-id]').forEach(card => {
                card.addEventListener('click', (e) => {
                    if (e.target.closest('button')) return;
                    openProfileEditor(card.dataset.id);
                });
                card.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openProfileEditor(card.dataset.id);
                    }
                });
            });

            document.querySelectorAll('.food-delete-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const foodId = btn.dataset.id;
                    const ing = ingredients.find(f => f.foodId === foodId);
                    const name = ing ? ing.name : 'this ingredient';
                    const confirmed = await showConfirmDialog(
                        'Delete Ingredient',
                        `Are you sure you want to delete "${name}"? This action cannot be undone.`,
                        'Delete'
                    );
                    if (confirmed) {
                        ingredients = ingredients.filter(f => f.foodId !== foodId);
                        renderCMSList();
                        await saveIngredients();
                        statusText.innerHTML = `<span class="status-dot"></span> Ingredient deleted`;
                    }
                });
            });
            return;
        }

        if (currentCMSTab === 'settings') {
            addBtn.style.display = 'none';
            if (searchInput) searchInput.style.display = 'none';

            const profiles = (appSettings.profiles && Array.isArray(appSettings.profiles)) ? appSettings.profiles : [];
            const prefs = appSettings.preferences || {};
            const automation = appSettings.automation || {};
            const dietaryChips = [
                { id: 'vegetarian', label: 'Vegetarian' },
                { id: 'vegan', label: 'Vegan' },
                { id: 'pescatarian', label: 'Pescatarian' },
                { id: 'glutenFree', label: 'Gluten-Free' },
                { id: 'keto', label: 'Keto' },
                { id: 'paleo', label: 'Paleo' }
            ];

            listContainer.innerHTML = `
                <div class="vd-settings-layout">
                    <div class="vd-settings-nav">
                        <div class="vd-settings-nav-item active" data-settings-view="eaters"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Eaters</div>
                        <div class="vd-settings-nav-item" data-settings-view="preferences"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Preferences</div>
                        <div class="vd-settings-nav-item" data-settings-view="shopping"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg> Shopping</div>
                        <div class="vd-settings-nav-item" data-settings-view="data"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Data</div>
                        <div class="vd-settings-nav-item" data-settings-view="network"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg> Network</div>
                    </div>
                    <div class="vd-settings-panel" id="settings-panel"></div>
                </div>
            `;

            const settingsPanel = document.getElementById('settings-panel');

            function renderSettingsPanel(view) {
                document.querySelectorAll('.vd-settings-nav-item').forEach(n => n.classList.toggle('active', n.dataset.settingsView === view));

                if (view === 'eaters') {
                    settingsPanel.innerHTML = `
                        <div class="vd-settings-section">
                            <h3 class="vd-settings-title">Eater Profiles</h3>
                            <p class="vd-settings-desc">Configure daily calorie and macro targets for meal planning. Percentages auto-calculate grams.</p>
                            <div id="profiles-list" style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.25rem;">
                                ${profiles.length === 0 ? '<p style="color: var(--text-muted); font-size: 0.9rem;">No eaters yet. Add one to get started.</p>' : ''}
                                ${profiles.map((p, i) => {
                                    const calories = p.calories ?? 2000;
                                    const carbsPct = p.carbs ?? 40;
                                    const proteinPct = p.protein ?? 30;
                                    const fatPct = p.fat ?? 30;
                                    const carbG = Math.round(calories * (carbsPct / 100) / 4);
                                    const proteinG = Math.round(calories * (proteinPct / 100) / 4);
                                    const fatG = Math.round(calories * (fatPct / 100) / 9);
                                    const totalPct = carbsPct + proteinPct + fatPct;
                                    const totalPctBadge = totalPct === 100
                                        ? '<span style="color: var(--accent-veg); font-weight: 700; font-size: 0.8rem;">✓ 100%</span>'
                                        : `<span style="color: var(--accent-meat); font-weight: 700; font-size: 0.8rem;">Total ${totalPct}% — adjust to 100%</span>`;
                                    return `
                                    <div class="profile-card" style="background: var(--bg-base); padding: 1.25rem; border-radius: 12px; border: 1px solid var(--border);">
                                        <div class="profile-card-header" style="display: flex; gap: 1rem; align-items: center; margin-bottom: 1rem;">
                                            <div class="profile-avatar" style="width: 44px; height: 44px; border-radius: 50%; background: var(--primary-light); color: var(--primary); border: 1px solid var(--primary); display: flex; align-items: center; justify-content: center; font-size: 1.1rem; font-weight: 700; flex-shrink: 0;">${escapeHtml((p.name || 'U').trim().charAt(0).toUpperCase())}</div>
                                            <div class="form-group" style="flex-grow: 1;"><label>Name</label><input type="text" value="${escapeHtml(p.name)}" class="profile-input profile-name-input" data-index="${i}" data-field="name"></div>
                                            <div class="form-group"><label>Calories / day</label><input type="number" min="0" step="50" value="${calories}" class="profile-input profile-calories" data-index="${i}" data-field="calories" style="width: 110px;"></div>
                                            <button class="btn delete-profile-btn" data-index="${i}" title="Remove eater" aria-label="Remove eater" style="margin-left: auto; padding: 0.5rem; background: var(--bg-hover); color: var(--text-muted);"><i data-lucide="trash-2" style="width: 16px; height: 16px;"></i></button>
                                        </div>
                                        <div class="profile-macro-list">
                                            ${[['carbs', 'Carbs', carbsPct, carbG, 'var(--accent-stock)'], ['protein', 'Protein', proteinPct, proteinG, 'var(--accent-meat)'], ['fat', 'Fat', fatPct, fatG, '#D4B04A']].map(([field, label, pct, grams, color]) => `
                                                <div class="profile-macro-row" style="display: grid; grid-template-columns: 90px 1fr 90px 70px; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem;">
                                                    <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 0.35rem;"><span style="width: 8px; height: 8px; border-radius: 50%; background: ${color}; display: inline-block;"></span> ${label}</span>
                                                    <input type="range" min="0" max="100" step="1" value="${pct}" class="profile-slider profile-input" data-index="${i}" data-field="${field}" aria-label="${label} %" style="width: 100%; accent-color: ${color}; cursor: pointer;">
                                                    <input type="number" min="0" max="100" step="1" value="${pct}" class="profile-input profile-pct" data-index="${i}" data-field="${field}" style="width: 70px; text-align: center;">
                                                    <span class="profile-grams" style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600; text-align: right;">${grams} g</span>
                                                </div>`).join('')}
                                        </div>
                                        <div style="display: flex; justify-content: flex-end; padding-top: 0.5rem; border-top: 1px solid var(--border);">${totalPctBadge}</div>
                                    </div>`;
                                }).join('')}
                            </div>
                            <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                                <button class="btn secondary" id="add-profile-btn"><i data-lucide="plus" style="width: 16px; height: 16px;"></i> Add Eater</button>
                                <button class="btn primary" id="save-settings-btn"><i data-lucide="save" style="width: 16px; height: 16px;"></i> Save Eaters</button>
                            </div>
                        </div>
                    `;
                    if (window.lucide) window.lucide.createIcons();

                    document.getElementById('add-profile-btn').onclick = () => {
                        appSettings.profiles.push({ name: "New Eater", calories: 2000, carbs: 40, protein: 30, fat: 30 });
                        renderSettingsPanel('eaters');
                    };

                    document.querySelectorAll('.delete-profile-btn').forEach(btn => {
                        btn.onclick = () => {
                            appSettings.profiles.splice(btn.dataset.index, 1);
                            renderSettingsPanel('eaters');
                        };
                    });

                    document.querySelectorAll('.profile-input').forEach(input => {
                        const update = (e) => {
                            const idx = e.target.dataset.index;
                            const field = e.target.dataset.field;
                            let val = e.target.value;
                            if (field !== 'name') val = parseFloat(val) || 0;
                            if (field === 'carbs' || field === 'protein' || field === 'fat') val = Math.max(0, Math.min(100, val));
                            appSettings.profiles[idx][field] = val;
                            const card = input.closest('.profile-card');
                            if (card) {
                                // Auto-balance the macro percentages so the three always total 100%.
                                if (field === 'carbs' || field === 'protein' || field === 'fat') {
                                    autoBalanceMacros(idx, field);
                                    ['carbs', 'protein', 'fat'].forEach(f => {
                                        card.querySelectorAll(`.profile-input[data-field="${f}"]`).forEach(other => {
                                            other.value = appSettings.profiles[idx][f];
                                        });
                                    });
                                }
                                // Update the avatar initial when the name changes.
                                if (field === 'name') {
                                    const avatar = card.querySelector('.profile-avatar');
                                    if (avatar) avatar.textContent = (val || 'U').trim().charAt(0).toUpperCase();
                                }
                                // Grams depend on calories + macro %; recalc on either changing.
                                refreshProfileGrams(card, idx);
                            }
                        };
                        input.oninput = update;
                        input.onchange = update;
                    });

                    // When one macro slider moves, rebalance the other two proportionally
                    // so carbs + protein + fat always add up to 100%.
                    function autoBalanceMacros(idx, changedField) {
                        const p = appSettings.profiles[idx];
                        if (!p) return;
                        const fields = ['carbs', 'protein', 'fat'];
                        const changedVal = Math.max(0, Math.min(100, parseFloat(p[changedField]) || 0));
                        const others = fields.filter(f => f !== changedField);
                        const otherTotal = others.reduce((s, f) => s + (parseFloat(p[f]) || 0), 0);
                        const remaining = 100 - changedVal;
                        if (remaining < 0) {
                            p[changedField] = 100;
                            others.forEach(f => p[f] = 0);
                            return;
                        }
                        // Distribute the remaining % across the other two, keeping their ratio.
                        let assigned = 0;
                        others.forEach((f, k) => {
                            if (k === others.length - 1) {
                                p[f] = Math.max(0, Math.round(remaining - assigned));
                            } else {
                                const share = otherTotal > 0
                                    ? Math.round((parseFloat(p[f]) || 0) / otherTotal * remaining)
                                    : Math.round(remaining / others.length);
                                p[f] = Math.max(0, share);
                                assigned += p[f];
                            }
                        });
                    }

                    function refreshProfileGrams(card, idx) {
                        const p = appSettings.profiles[idx];
                        if (!p) return;
                        const calories = parseFloat(p.calories) || 0;
                        const macroFields = ['carbs', 'protein', 'fat'];
                        const rows = card.querySelectorAll('.profile-macro-row');
                        rows.forEach(row => {
                            const field = row.querySelector('.profile-input.profile-slider').dataset.field;
                            if (!macroFields.includes(field)) return;
                            const pct = parseFloat(p[field]) || 0;
                            const grams = Math.round(calories * (pct / 100) / (field === 'fat' ? 9 : 4));
                            const gramsEl = row.querySelector('.profile-grams');
                            if (gramsEl) gramsEl.textContent = grams + ' g';
                        });
                        const totalPct = (parseFloat(p.carbs) || 0) + (parseFloat(p.protein) || 0) + (parseFloat(p.fat) || 0);
                        const badge = card.querySelector('.profile-card > div:last-child');
                        if (badge) {
                            badge.innerHTML = totalPct === 100
                                ? '<span style="color: var(--accent-veg); font-weight: 700; font-size: 0.8rem;">✓ 100%</span>'
                                : `<span style="color: var(--accent-meat); font-weight: 700; font-size: 0.8rem;">Total ${totalPct}% — adjust to 100%</span>`;
                        }
                    }

                    document.getElementById('save-settings-btn').onclick = saveSettings;
                    return;
                }

                if (view === 'preferences') {
                    settingsPanel.innerHTML = `
                        <div class="vd-settings-section">
                            <h3 class="vd-settings-title">Dietary Preferences</h3>
                            <p class="vd-settings-desc">Select your dietary requirements to personalize recipe recommendations.</p>
                            <div class="vd-settings-chips">
                                ${dietaryChips.map(c => `
                                    <div class="vd-settings-chip ${(prefs.dietary || []).includes(c.id) ? 'selected' : ''}" data-pref="${c.id}">
                                        ${(prefs.dietary || []).includes(c.id) ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                                        ${c.label}
                                    </div>`).join('')}
                            </div>
                        </div>
                        <div class="vd-settings-section">
                            <h3 class="vd-settings-title">Automation</h3>
                            <p class="vd-settings-desc">Manage how the app assists you with planning and shopping.</p>
                            <div class="vd-settings-toggle-row">
                                <div class="vd-settings-toggle-info">
                                    <h5>Auto-generate Shopping List</h5>
                                    <p>Automatically add missing ingredients to your list when planning a recipe.</p>
                                </div>
                                <div class="vd-settings-switch ${automation.autoShoppingList ? 'active' : ''}" data-toggle="autoShoppingList"></div>
                            </div>
                            <div class="vd-settings-toggle-row">
                                <div class="vd-settings-toggle-info">
                                    <h5>Meal Plan Reminders</h5>
                                    <p>Show a reminder when meals are due for the day.</p>
                                </div>
                                <div class="vd-settings-switch ${automation.reminders ? 'active' : ''}" data-toggle="reminders"></div>
                            </div>
                        </div>
                        <div style="margin-top: 1.5rem; border-top: 1px solid var(--border); padding-top: 1.5rem;">
                            <button class="btn primary" id="save-prefs-btn"><i data-lucide="save" style="width: 16px; height: 16px;"></i> Save Preferences</button>
                        </div>
                    `;
                    if (window.lucide) window.lucide.createIcons();

                    document.querySelectorAll('.vd-settings-chip').forEach(chip => {
                        chip.onclick = () => {
                            const prefId = chip.dataset.pref;
                            const arr = prefs.dietary || (prefs.dietary = []);
                            const idx = arr.indexOf(prefId);
                            if (idx >= 0) arr.splice(idx, 1);
                            else arr.push(prefId);
                            renderSettingsPanel('preferences');
                        };
                    });

                    document.querySelectorAll('.vd-settings-switch').forEach(sw => {
                        sw.onclick = () => {
                            sw.classList.toggle('active');
                        };
                    });

                    document.getElementById('save-prefs-btn').onclick = saveSettings;
                    return;
                }

                if (view === 'shopping') {
                    const budget = appSettings.shopping || {};
                    settingsPanel.innerHTML = `
                        <div class="vd-settings-section">
                            <h3 class="vd-settings-title">Shopping Budget</h3>
                            <p class="vd-settings-desc">Set a weekly budget to compare against your meal plan's estimated ingredient cost. Costs are estimated from each ingredient's Average Price ÷ serving size.</p>
                            <div style="display: flex; gap: 1rem; margin-top: 1rem; flex-wrap: wrap; max-width: 460px;">
                                <div class="form-group" style="flex: 1 1 180px;">
                                    <label>Weekly Budget</label>
                                    <input type="number" id="shopping-budget-amount" min="0" step="any" class="seamless-input" placeholder="0" value="${budget.amount != null ? budget.amount : ''}">
                                </div>
                                <div class="form-group" style="flex: 0 1 140px;">
                                    <label>Currency Code</label>
                                    <input type="text" id="shopping-budget-currency" class="seamless-input" placeholder="MUR" value="${escapeHtml(budget.currency || 'MUR')}">
                                </div>
                            </div>
                            <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.75rem;">Add an Average Price and serving size to each ingredient profile for accurate meal-plan costing.</p>
                        </div>
                        <div style="margin-top: 1.5rem; border-top: 1px solid var(--border); padding-top: 1.5rem;">
                            <button class="btn primary" id="save-shopping-btn"><i data-lucide="save" style="width: 16px; height: 16px;"></i> Save Shopping Budget</button>
                        </div>
                    `;
                    if (window.lucide) window.lucide.createIcons();

                    document.getElementById('save-shopping-btn').onclick = async () => {
                        const amount = parseFloat(document.getElementById('shopping-budget-amount').value) || 0;
                        const currency = (document.getElementById('shopping-budget-currency').value || 'MUR').trim().toUpperCase();
                        appSettings.shopping = { amount, currency };
                        try {
                            const res = await fetch('/api/settings', { method: 'PUT', headers: HEADERS, body: JSON.stringify(appSettings) });
                            if (!res.ok) throw new Error('Save failed');
                            statusText.innerHTML = `<span class="status-dot"></span> Shopping budget saved.`;
                        } catch (e) {
                            alert('Failed to save. Is the server running?');
                        }
                    };
                    return;
                }

                if (view === 'data') {
                    const repoPath = (appSettings.website && appSettings.website.repoPath) || '';
                    const repoUrl = (appSettings.website && appSettings.website.repoUrl) || 'https://github.com/SoumeetKumal/Larder.git';
                    const token = (appSettings.website && appSettings.website.token) || '';
                    settingsPanel.innerHTML = `
                        <div class="vd-settings-section">
                            <h3 class="vd-settings-title">Data Management</h3>
                            <p class="vd-settings-desc">Export your recipes, ingredients, meal plans, pantry, household, shopping lists, receipts, planner, and settings into one file. On another PC, install Larder and use <strong>Import</strong> to restore everything.</p>
                            <div style="display: flex; gap: 1rem; margin-top: 1rem; flex-wrap: wrap;">
                                <button class="btn secondary" id="export-data-btn"><i data-lucide="download" style="width: 16px; height: 16px;"></i> Export (ZIP)</button>
                                <label class="btn secondary" style="cursor: pointer; display: inline-flex; align-items: center; gap: 0.5rem;">
                                    <i data-lucide="upload" style="width: 16px; height: 16px;"></i> Import (ZIP)
                                    <input type="file" id="import-zip-input" accept=".zip" style="display: none;">
                                </label>
                            </div>
                            <p id="import-status" style="margin-top: 0.75rem; font-size: 0.8rem;"></p>
                        </div>
                        <div class="vd-settings-section" style="margin-top: 1.5rem; border-top: 1px solid var(--border); padding-top: 1.5rem;">
                            <h3 class="vd-settings-title">Publish to Website</h3>
                            <p class="vd-settings-desc">The live site is GitHub Pages, which only shows data committed to your website repo's <code>data/</code> folder. The app keeps its own clone of the website repo in the app's data folder — leave the path blank for the automatic location. Publish copies your current data in, commits, and pushes. GitHub Pages rebuilds within a minute.</p>
                            <div style="display: flex; flex-direction: column; gap: 0.6rem; margin-top: 1rem;">
                                <label style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">Website repo URL</label>
                                <input type="text" id="website-repo-url" value="${escapeHtml(repoUrl)}" placeholder="https://github.com/you/Larder.git" style="padding: 0.55rem 0.75rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-surface-hover); color: var(--text); font-size: 0.9rem;">
                                <label style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">Local clone path <span style="font-weight: 400;">(optional — defaults inside the app's data folder)</span></label>
                                <input type="text" id="website-repo-path" value="${escapeHtml(repoPath)}" placeholder="<app data folder>\\website-repo" style="padding: 0.55rem 0.75rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-surface-hover); color: var(--text); font-size: 0.9rem;">
                                <label style="font-size: 0.8rem; font-weight: 600; color: var(--text-muted);">Personal access token</label>
                                <input type="password" id="website-token" value="${escapeHtml(token)}" autocomplete="off" placeholder="ghp_...  (optional — only for private repos)" style="padding: 0.55rem 0.75rem; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-surface-hover); color: var(--text); font-size: 0.9rem;">
                            </div>
                            <div style="display: flex; gap: 0.75rem; margin-top: 1rem; flex-wrap: wrap; align-items: center;">
                                <button class="btn secondary" id="publish-data-btn"><i data-lucide="upload-cloud" style="width: 16px; height: 16px;"></i> Publish</button>
                                <span style="font-size: 0.75rem; color: var(--text-muted);">First publish on a new PC clones the repo automatically.</span>
                            </div>
                            <p id="publish-status" style="margin-top: 0.75rem; font-size: 0.8rem;"></p>
                        </div>
                    `;
                    if (window.lucide) window.lucide.createIcons();

                    document.getElementById('export-data-btn').onclick = async () => {
                        try {
                            const res = await fetch('/api/export', { headers: { 'Authorization': `Bearer ${API_KEY}` } });
                            if (!res.ok) throw new Error();
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `larder-data-${new Date().toISOString().slice(0, 10)}.zip`;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            URL.revokeObjectURL(url);
                            statusText.innerHTML = `<span class="status-dot"></span> Backup downloaded. Import it on another PC to restore everything.`;
                        } catch (e) {
                            alert('Export failed.');
                        }
                    };

                    const importInput = document.getElementById('import-zip-input');
                    const importStatus = document.getElementById('import-status');
                    importInput.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        importStatus.textContent = "Importing... please wait.";
                        try {
                            const res = await fetch('/api/import', {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${API_KEY}` },
                                body: file
                            });
                            if (res.ok) {
                                importStatus.textContent = "Import successful! Reloading data...";
                                importStatus.style.color = "var(--success-color, #4ade80)";
                                setTimeout(() => window.location.reload(), 1500);
                            } else {
                                throw new Error("Server rejected import.");
                            }
                        } catch (err) {
                            importStatus.textContent = "Import failed. Please check the file.";
                            importStatus.style.color = "var(--danger-color, #f87171)";
                        }
                    };

                    const repoPathInput = document.getElementById('website-repo-path');
                    const repoUrlInput = document.getElementById('website-repo-url');
                    const tokenInput = document.getElementById('website-token');
                    const publishStatus = document.getElementById('publish-status');
                    const publishBtn = document.getElementById('publish-data-btn');
                    const saveWebsiteSettings = async () => {
                        appSettings.website = {
                            repoPath: repoPathInput.value.trim(),
                            repoUrl: repoUrlInput.value.trim() || 'https://github.com/SoumeetKumal/Larder.git',
                            token: tokenInput.value.trim()
                        };
                        const res = await fetch('/api/settings', { method: 'PUT', headers: HEADERS, body: JSON.stringify(appSettings) });
                        return res.ok;
                    };
                    publishBtn.onclick = async () => {
                        publishBtn.disabled = true;
                        publishStatus.style.color = "var(--text-muted)";
                        publishStatus.textContent = "Saving settings and publishing... please wait.";
                        try {
                            await saveWebsiteSettings();
                            const res = await fetch('/api/publish', {
                                method: 'POST',
                                headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ repoPath: repoPathInput.value.trim() })
                            });
                            const data = await res.json();
                            if (res.ok && data.success) {
                                publishStatus.style.color = "var(--success-color, #4ade80)";
                                publishStatus.textContent = data.message || "Published successfully!";
                            } else {
                                throw new Error(data.error || "Publish failed.");
                            }
                        } catch (err) {
                            publishStatus.style.color = "var(--danger-color, #f87171)";
                            publishStatus.textContent = err.message;
                        } finally {
                            publishBtn.disabled = false;
                        }
                    };
                    return;
                }

                if (view === 'network') {
                    const allowLan = !!(appSettings.network && appSettings.network.allowLan);
                    settingsPanel.innerHTML = `
                        <div class="vd-settings-section">
                            <h3 class="vd-settings-title">Network & Sync</h3>
                            <p class="vd-settings-desc">Allow companion apps on this Wi-Fi network (like FitTrack) to sync with Larder. When enabled, Larder listens on all network interfaces and you can point other devices at this computer's LAN address.</p>
                            <div class="vd-settings-toggle-row">
                                <div class="vd-settings-toggle-info">
                                    <h5>Allow LAN access</h5>
                                    <p>Expose the local server to other devices on this network (requires app restart).</p>
                                </div>
                                <div class="vd-settings-switch ${allowLan ? 'active' : ''}" data-network-toggle="allowLan"></div>
                            </div>
                            <p id="network-sync-url" style="margin-top: 1rem; font-size: 0.85rem; color: var(--text-muted);"></p>
                        </div>
                        <div style="margin-top: 1.5rem; border-top: 1px solid var(--border); padding-top: 1.5rem;">
                            <button class="btn primary" id="save-network-btn"><i data-lucide="save" style="width: 16px; height: 16px;"></i> Save Network Settings</button>
                        </div>
                    `;
                    if (window.lucide) window.lucide.createIcons();

                    fetch('/api/network-info', { headers: { 'Authorization': `Bearer ${API_KEY}` } })
                        .then(r => r.ok ? r.json() : {})
                        .then(info => {
                            const el = document.getElementById('network-sync-url');
                            if (el && info && info.lanAddresses && info.lanAddresses.length) {
                                el.innerHTML = `<strong>Sync URL:</strong> <code style="background: var(--bg-surface-hover); padding: 0.2rem 0.5rem; border-radius: 4px;">http://${escapeHtml(info.lanAddresses[0])}:${info.port || 8000}/api</code>`;
                            }
                        })
                        .catch(() => {});

                    document.querySelectorAll('.vd-settings-switch[data-network-toggle]').forEach(sw => {
                        sw.onclick = () => sw.classList.toggle('active');
                    });

                    document.getElementById('save-network-btn').onclick = async () => {
                        const allowLan = !!document.querySelector('.vd-settings-switch[data-network-toggle="allowLan"].active');
                        appSettings.network = { ...(appSettings.network || {}), allowLan };
                        const res = await fetch('/api/settings', {
                            method: 'PUT',
                            headers: HEADERS,
                            body: JSON.stringify(appSettings)
                        });
                        if (res.ok) {
                            statusText.innerHTML = `<span class="status-dot"></span> Network settings saved. Restart Larder to apply.`;
                        } else {
                            alert('Failed to save network settings.');
                        }
                    };
                    return;
                }
            }

            function saveSettings() {
                appSettings.preferences = prefs;
                appSettings.automation = automation;
                // Gather toggle states
                document.querySelectorAll('.vd-settings-switch').forEach(sw => {
                    automation[sw.dataset.toggle] = sw.classList.contains('active');
                });
                fetch('/api/settings', {
                    method: 'PUT',
                    headers: HEADERS,
                    body: JSON.stringify(appSettings)
                }).then(res => {
                    if (res.ok) {
                        statusText.innerHTML = `<span class="status-dot"></span> Settings saved successfully.`;
                    } else {
                        throw new Error();
                    }
                }).catch(() => {
                    alert('Failed to save settings. Reverting to previous state.');
                    loadData();
                });
            }

            renderSettingsPanel('eaters');

            document.querySelectorAll('.vd-settings-nav-item').forEach(item => {
                item.addEventListener('click', () => renderSettingsPanel(item.dataset.settingsView));
            });

            return;
        }

        addBtn.style.display = 'flex';
        setAddBtnLabel('Add Recipe');
        let filtered = recipes.filter(r => r.entryType !== 'ingredient');

        if (cmsCategoryFilter !== 'All') {
            filtered = filtered.filter(r => (r.category || 'Uncategorized') === cmsCategoryFilter);
        }

        if (cmsStatusFilter !== 'All') {
            filtered = filtered.filter(r => (r.status || 'published') === cmsStatusFilter);
        }

        if (cmsSelectedTags.size > 0 || ['cal', 'carbs', 'protein', 'fat', 'time'].some(k => cmsMacroFilters[k].min !== null || cmsMacroFilters[k].max !== null)) {
            filtered = filtered.filter(r => cmsItemPassesFilters(r, { isRecipe: true }));
        }

        if (cmsSearchQuery) {
            filtered = filtered.filter(r =>
                (r.title || '').toLowerCase().includes(cmsSearchQuery) ||
                (r.category || '').toLowerCase().includes(cmsSearchQuery) ||
                (r.description || '').toLowerCase().includes(cmsSearchQuery) ||
                (r.ingredients || []).some(ing => (ing.item || '').toLowerCase().includes(cmsSearchQuery))
            );
        }

        if (filtered.length === 0) {
            listContainer.innerHTML = `<div class="empty-state">No recipes match. Try adjusting the search or filters.</div>`;
            return;
        }

        // Recipe sort accessor
        const recipeSortVal = (r, key) => {
            switch (key) {
                case 'title': return (r.title || '').toLowerCase();
                case 'servings': { const y = parseFloat(String((r.macros && r.macros.yield) || '').replace(',', '.')); return isNaN(y) ? null : y; }
                case 'energy': { const e = parseFloat(String((r.macros && r.macros.energy) || r.calories || '')); return isNaN(e) ? null : e; }
                case 'status': return (r.status || 'published').toLowerCase();
            }
            return null;
        };
        const recipeSort = cmsTableSort.recipe;
        if (recipeSort && recipeSort.key) filtered = sortRows(filtered, recipeSort.key, recipeSort.dir, recipeSortVal);

        if (cmsListView === 'grid') {
            listContainer.innerHTML = `
                <div class="cms-grid-wrapper">
                    ${filtered.map(recipe => {
                        const vis = getCategoryIcon(recipe.category);
                        const yieldStr = recipe.macros?.yield || '';
                        const energyStr = recipe.macros?.energy || recipe.calories || '';
                        const iconTile = recipe.imageUrl
                            ? `<img class="cms-card-img" src="${escapeHtml(recipe.imageUrl)}" alt="">`
                            : `<svg viewBox="${vis.vb}" style="width:${vis.w * 2}px;height:${vis.h * 2}px;fill:${vis.accent};"><use href="${vis.href}"></use></svg>`;
                        return `
                        <div class="cms-card" data-id="${escapeHtml(recipe.id)}" role="button" tabindex="0" title="Edit recipe">
                            <div class="cms-card-img-wrap">${iconTile}</div>
                            <div class="cms-card-body">
                                <div class="cms-card-title-row">
                                    <div class="cms-card-title">${escapeHtml(recipe.title)}</div>
                                    <button type="button" class="cms-btn-icon delete delete-btn" data-id="${escapeHtml(recipe.id)}" title="Delete" aria-label="Delete recipe"><i data-lucide="trash-2" style="width: 16px; height: 16px;"></i></button>
                                </div>
                                <div class="cms-card-sub">${escapeHtml(recipe.category || 'Recipe')}</div>
                                <div class="cms-card-meta">
                                    <span>${yieldStr ? escapeHtml(yieldStr) + ' servings' : '—'}</span>
                                    <span>${energyStr ? escapeHtml(energyStr) : '—'}</span>
                                </div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>`;
        } else {
            listContainer.innerHTML = `
                <div class="cms-table-wrapper">
                    <table class="cms-table">
                        <thead>
                            <tr>
                                ${sortTh('title', 'Title & Category')}
                                ${sortTh('servings', 'Servings', 'width: 100px;')}
                                ${sortTh('energy', 'Energy', 'width: 120px;')}
                                ${sortTh('status', 'Status', 'width: 130px;')}
                                <th style="width: 110px; text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filtered.map(recipe => {
                                const vis = getCategoryIcon(recipe.category);
                                const yieldStr = recipe.macros?.yield || '';
                                const yieldNum = yieldStr ? (parseFloat(String(yieldStr).replace(',', '.')) || yieldStr) : '';
                                const energyStr = recipe.macros?.energy || recipe.calories || '';
                                const energyNum = (typeof energyStr === 'number' && !isNaN(energyStr)) ? energyStr : (parseFloat(String(energyStr)) || '');
                                const iconTile = recipe.imageUrl
                                    ? `<img class="cms-thumb" src="${escapeHtml(recipe.imageUrl)}" alt="">`
                                    : `<svg viewBox="${vis.vb}" style="width:${vis.w}px;height:${vis.h}px;fill:${vis.accent};"><use href="${vis.href}"></use></svg>`;
                                return `
                                <tr data-id="${escapeHtml(recipe.id)}" style="cursor: pointer;">
                                    <td>
                                        <div class="cms-td-title">
                                            <div class="cms-td-icon">${iconTile}</div>
                                            <div>
                                                <div>${escapeHtml(recipe.title)}</div>
                                                <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">${escapeHtml(recipe.category || 'Recipe')}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>${escapeHtml(yieldNum) || '—'}</td>
                                    <td>${energyNum ? escapeHtml(energyNum) + ' kcal' : '—'}</td>
                                    <td><span class="cms-badge published">Published</span></td>
                                    <td class="cms-actions-cell">
                                        <button type="button" class="cms-btn-icon delete delete-btn" data-id="${escapeHtml(recipe.id)}" title="Delete" aria-label="Delete"><i data-lucide="trash-2" style="width: 16px; height: 16px;"></i></button>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;
        }

        if (window.lucide) window.lucide.createIcons();

        bindSortHandlers(listContainer);

        document.querySelectorAll('.cms-card[data-id], tr[data-id]').forEach(card => {
            if (currentCMSTab !== 'recipe') return;
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                openEditor(card.dataset.id);
            });
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openEditor(card.dataset.id);
                }
            });
        });
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const recipeId = btn.dataset.id;
                const recipe = recipes.find(r => r.id === recipeId);
                const title = recipe ? recipe.title : 'this recipe';
                
                const confirmed = await showConfirmDialog(
                    'Delete Recipe',
                    `Are you sure you want to delete "${title}"?`,
                    'Delete'
                );
                
                if (confirmed) {
                    recipes = recipes.filter(r => r.id !== recipeId);
                    renderCMSList();
                    await saveRecipes();
                }
            });
        });
    }

    addBtn.addEventListener('click', () => {
        if (currentCMSTab === 'food') {
            openProfileEditor();
        } else if (currentCMSTab === 'pantry') {
            openPantryItemEditor(null);
        } else if (currentCMSTab === 'household') {
            if (householdOpenFn) householdOpenFn();
        } else {
            openEditor();
        }
    });

    // --- Ingredient Rows ---
    function resolveIngredientName(item, foodId) {
        // Prefer the canonical DB name when a matching foodId exists.
        if (foodId) {
            const db = ingredients.find(f => f.foodId === foodId);
            if (db && db.name) return db.name;
        }
        return String(item || '');
    }

    function attachIngredientAutocomplete(div, nameInput) {
        // Dropdown restricted to DB ingredients; sets the foodId on selection.
        const wrap = document.createElement('div');
        wrap.className = 'cms-ing-name-wrap';
        nameInput.parentNode.insertBefore(wrap, nameInput);
        wrap.appendChild(nameInput);
        const list = document.createElement('div');
        list.className = 'cms-ing-suggestions';
        wrap.appendChild(list);

        let activeIdx = -1;
        function hide() {
            list.classList.remove('open');
            activeIdx = -1;
        }
        // Matches from the DB, plus a "+ Create" row whenever the typed name
        // isn't an exact existing ingredient.
        function getItems(query) {
            const q = String(query || '').trim();
            if (!q) return [];
            const matches = filter(q);
            const exact = q && !ingredients.some(f => f.name.toLowerCase() === q.toLowerCase());
            if (exact) matches.push({ _create: true, name: q });
            return matches;
        }
        function render(items) {
            if (items.length === 0) {
                list.classList.remove('open');
                return;
            }
            list.innerHTML = items.map((f, i) => f._create
                ? `<div class="cms-ing-suggestion cms-ing-create${i === activeIdx ? ' active' : ''}" data-idx="${i}" title="Create ingredient &quot;${escapeHtml(f.name)}&quot;">
                    <span class="cms-ing-suggestion-name">+ Create “${escapeHtml(f.name)}”</span>
                    <span class="cms-ing-suggestion-cat">new ingredient</span>
                </div>`
                : `<div class="cms-ing-suggestion${i === activeIdx ? ' active' : ''}" data-idx="${i}" title="${escapeHtml(f.name)}">
                    <span class="cms-ing-suggestion-name">${escapeHtml(f.name)}</span>
                    <span class="cms-ing-suggestion-cat">${escapeHtml(f.category || '')}</span>
                </div>`).join('');
            list.classList.add('open');
        }
        function filter(query) {
            if (!query) return [];
            const q = query.toLowerCase();
            return ingredients.filter(f =>
                f.name.toLowerCase().includes(q) ||
                (f.category && f.category.toLowerCase().includes(q))
            ).slice(0, 8);
        }
        async function createAndLink(f) {
            let newFoodId = slugify(f.name);
            let suffix = 1;
            while (ingredients.some(x => x.foodId === newFoodId)) {
                newFoodId = slugify(f.name) + '-' + (++suffix);
            }
            ingredients.push({
                foodId: newFoodId,
                name: f.name,
                servingSizeG: 100,
                servingUnit: 'g',
                category: '',
                calories: 0,
                proteinG: 0,
                fatG: 0,
                carbsG: 0,
                fiberG: 0,
                sugarG: 0,
                saturatedFatG: 0,
                proteinSource: ''
            });
            nameInput.value = f.name;
            div.dataset.foodId = newFoodId;
            hide();
            recalcMacrosFromIngredients();
            statusText.innerHTML = `<span class="status-dot"></span> Created ingredient “${escapeHtml(f.name)}”`;
            await saveIngredients();
        }
        function apply(idx) {
            const items = getItems(nameInput.value);
            const f = items[idx];
            if (!f) return;
            if (f._create) {
                createAndLink(f);
                return;
            }
            nameInput.value = f.name;
            div.dataset.foodId = f.foodId;
            hide();
            recalcMacrosFromIngredients();
        }

        nameInput.addEventListener('input', () => {
            if (div.dataset.foodId) {
                // Only keep the DB link when the typed name still matches the linked ingredient.
                const linked = ingredients.find(f => f.foodId === div.dataset.foodId);
                if (linked && linked.name !== nameInput.value) div.dataset.foodId = '';
            }
            const items = getItems(nameInput.value);
            activeIdx = items.length ? 0 : -1;
            render(items);
        });
        nameInput.addEventListener('focus', () => {
            const items = getItems(nameInput.value);
            activeIdx = items.length ? 0 : -1;
            render(items);
        });
        nameInput.addEventListener('keydown', (e) => {
            const items = getItems(nameInput.value);
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeIdx = (activeIdx + 1) % Math.max(1, items.length);
                render(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeIdx = (activeIdx - 1 + Math.max(1, items.length)) % Math.max(1, items.length);
                render(items);
            } else if (e.key === 'Enter') {
                if (list.classList.contains('open') && activeIdx >= 0) {
                    e.preventDefault();
                    apply(activeIdx);
                }
            } else if (e.key === 'Escape') {
                hide();
            }
        });
        list.addEventListener('mousedown', (e) => {
            const item = e.target.closest('.cms-ing-suggestion');
            if (!item) return;
            e.preventDefault();
            apply(parseInt(item.dataset.idx, 10));
        });
        document.addEventListener('click', (e) => {
            if (!wrap.contains(e.target)) hide();
        });
    }

    function ensureUnit(sel, value) {
        if (![...sel.options].some(o => o.value === value)) {
            const opt = document.createElement('option');
            opt.value = value; opt.textContent = value;
            sel.appendChild(opt);
        }
        sel.value = value;
    }

    // Live metric -> imperial conversion while the user edits the metric amount.
    function autoCalcImperial(row) {
        const metricNum = row.querySelector('[data-field="metric-num"]');
        const metricUnit = row.querySelector('[data-field="metric-unit"]');
        const impNum = row.querySelector('[data-field="imperial-num"]');
        const impUnit = row.querySelector('[data-field="imperial-unit"]');
        if (!metricNum || !metricUnit || !impNum || !impUnit) return;
        const raw = parseAmountValue(metricNum.value);
        if (isNaN(raw) || raw <= 0) { impNum.value = ''; return; }
        const unit = (metricUnit.value || '').toLowerCase();
        let grams;
        if (unit === 'kg' || unit === 'l') grams = raw * 1000;
        else if (unit === 'ml') grams = raw;
        else if (unit === 'g') grams = raw;
        else return;
        const nameInput = row.querySelector('[data-field="name"]');
        const name = nameInput ? nameInput.value : '';
        const targetUnit = (impUnit.value || '').toLowerCase();
        const factor = imperialGramsFactor(name, targetUnit);
        if (factor == null) {
            // No known imperial unit yet — default to cups.
            const cups = grams / getGramsPerCup(name);
            impNum.value = formatCups(cups);
            ensureUnit(impUnit, 'cups');
        } else if (targetUnit === 'cups' || targetUnit === 'cup') {
            impNum.value = formatCups(grams / factor);
            ensureUnit(impUnit, 'cups');
        } else {
            impNum.value = formatCount(grams / factor);
            ensureUnit(impUnit, targetUnit);
        }
        impNum.dataset.auto = '1';
    }

    // Live imperial -> metric conversion while the user edits the imperial amount.
    function autoCalcMetric(row) {
        const metricNum = row.querySelector('[data-field="metric-num"]');
        const metricUnit = row.querySelector('[data-field="metric-unit"]');
        const impNum = row.querySelector('[data-field="imperial-num"]');
        const impUnit = row.querySelector('[data-field="imperial-unit"]');
        if (!metricNum || !metricUnit || !impNum || !impUnit) return;
        const raw = parseAmountValue(impNum.value);
        if (isNaN(raw) || raw <= 0) { metricNum.value = ''; return; }
        const nameInput = row.querySelector('[data-field="name"]');
        const name = nameInput ? nameInput.value : '';
        const factor = imperialGramsFactor(name, impUnit.value);
        if (factor == null) return;
        const grams = raw * factor;
        if (!isFinite(grams) || grams <= 0) return;
        metricNum.value = formatMetricAmount(grams);
        ensureUnit(metricUnit, 'g');
        metricNum.dataset.auto = '1';
    }

    // Keep the physical amount unchanged when the user switches a metric unit
    // (e.g. 100 g -> 0.1 kg), so the imperial side and macros stay consistent.
    function convertMetricNumber(numStr, fromUnit, toUnit) {
        const raw = parseAmountValue(numStr);
        if (isNaN(raw) || raw <= 0) return numStr;
        const toGrams = u => (u === 'kg' || u === 'l') ? 1000 : u === 'g' ? 1 : u === 'ml' ? 1 : null;
        const g = toGrams((fromUnit || '').toLowerCase());
        const tg = toGrams((toUnit || '').toLowerCase());
        if (g == null || tg == null) return numStr;
        return formatMetricAmount(raw * g / tg);
    }

    // Keep the physical amount unchanged when the user switches an imperial unit
    // (e.g. 2 cups -> 32 tbsp for a butter-like density).
    function convertImperialNumber(row, numStr, fromUnit, toUnit) {
        const raw = parseAmountValue(numStr);
        if (isNaN(raw) || raw <= 0) return numStr;
        const nameInput = row.querySelector('[data-field="name"]');
        const name = nameInput ? nameInput.value : '';
        const fromFactor = imperialGramsFactor(name, fromUnit);
        const toFactor = imperialGramsFactor(name, toUnit);
        if (fromFactor == null || toFactor == null) return numStr;
        const u = String(toUnit || '').toLowerCase();
        return (u === 'cups' || u === 'cup') ? formatCups(raw * fromFactor / toFactor) : formatCount(raw * fromFactor / toFactor);
    }

    function createIngredientRow(item = '', metric = '', imperial = '', foodId = '') {
        const isHeader = String(item).startsWith('## ');
        const div = document.createElement('div');
        div.dataset.foodId = foodId || '';
        div.dataset.origMetric = metric || '';
        div.dataset.origImperial = imperial || '';

        if (isHeader) {
            div.className = 'cms-ingredient-header-row';
            div.style.display = 'grid';
            div.style.gridTemplateColumns = '1fr auto';
            div.style.gap = '0.75rem';
            div.style.alignItems = 'center';
            div.style.padding = '0.5rem 0';
            div.style.borderBottom = '1px solid var(--border)';
            div.innerHTML = `
                <input type="text" data-field="name" class="seamless-input" value="${escapeHtml(String(item).replace(/^##\s*/, ''))}" placeholder="Section header..." style="font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-main);">
                <button type="button" class="cms-btn-icon delete" aria-label="Remove" title="Remove section"><i data-lucide="x" style="width: 14px; height: 14px;"></i></button>
            `;
            div.querySelector('.delete').addEventListener('click', () => div.remove());
            ingContainer.appendChild(div);
            return;
        }

        const m = splitAmount(metric);
        const imp = splitAmount(imperial);
        const metricUnits = ['g', 'kg', 'ml', 'L'];
        const imperialUnits = ['cups', 'tbsp', 'tsp', 'whole', 'cans', 'cloves', 'sprigs', 'pinch', 'medium', 'small', 'large', 'slice', 'piece'];
        div.className = 'cms-ingredient-row';
        const displayName = resolveIngredientName(item, foodId);
        div.innerHTML = `
            <button type="button" class="cms-btn-icon drag-handle" aria-label="Drag to reorder" title="Drag to reorder"><i data-lucide="grip-vertical" style="width: 14px; height: 14px; color: var(--text-muted);"></i></button>
            <input type="text" data-field="name" class="seamless-input" value="${escapeHtml(displayName)}" placeholder="Search ingredient..." autocomplete="off" title="${escapeHtml(displayName)}" style="font-weight: 500; font-size: 0.95rem;">
            <div class="cms-unit-group">
                <input type="text" data-field="metric-num" value="${escapeHtml(m.num)}" placeholder="Amount">
                <select data-field="metric-unit">${metricUnits.map(u => `<option${m.unit === u ? ' selected' : ''}>${u}</option>`).join('')}</select>
            </div>
            <div class="cms-unit-group">
                <input type="text" data-field="imperial-num" value="${escapeHtml(imp.num)}" placeholder="Amount">
                <select data-field="imperial-unit">${imperialUnits.map(u => `<option${imp.unit === u ? ' selected' : ''}>${u}</option>`).join('')}</select>
            </div>
            <button type="button" class="cms-btn-icon delete" aria-label="Remove" title="Remove ingredient"><i data-lucide="x" style="width: 14px; height: 14px;"></i></button>
        `;
        const addMissingUnit = (sel, unit) => {
            if (unit && ![...sel.options].some(o => o.value === unit)) {
                const opt = document.createElement('option');
                opt.value = unit; opt.textContent = unit; opt.selected = true;
                sel.appendChild(opt);
            }
        };
        addMissingUnit(div.querySelector('[data-field="metric-unit"]'), m.unit);
        addMissingUnit(div.querySelector('[data-field="imperial-unit"]'), imp.unit);
        div.querySelector('.delete').addEventListener('click', () => { div.remove(); recalcMacrosFromIngredients(); });

        const nameInput = div.querySelector('[data-field="name"]');
        attachIngredientAutocomplete(div, nameInput);
        // Live-sync the metric and imperial amounts in both directions as the
        // user types; the field being edited is never overwritten.
        const metricNumInput = div.querySelector('[data-field="metric-num"]');
        const metricUnitSel = div.querySelector('[data-field="metric-unit"]');
        const impNumInput = div.querySelector('[data-field="imperial-num"]');
        const impUnitSel = div.querySelector('[data-field="imperial-unit"]');
        metricUnitSel.dataset.prev = metricUnitSel.value;
        impUnitSel.dataset.prev = impUnitSel.value;

        const onMetricEdit = () => {
            delete metricNumInput.dataset.auto;
            autoCalcImperial(div);
            recalcMacrosFromIngredients();
        };
        const onImperialEdit = () => {
            delete impNumInput.dataset.auto;
            autoCalcMetric(div);
            recalcMacrosFromIngredients();
        };
        const onMetricUnitChange = () => {
            metricNumInput.value = convertMetricNumber(metricNumInput.value, metricUnitSel.dataset.prev, metricUnitSel.value);
            metricUnitSel.dataset.prev = metricUnitSel.value;
            delete metricNumInput.dataset.auto;
            autoCalcImperial(div);
            recalcMacrosFromIngredients();
        };
        const onImperialUnitChange = () => {
            const raw = parseAmountValue(metricNumInput.value);
            const mu = (metricUnitSel.value || '').toLowerCase();
            const metricHasWeight = ['g', 'kg', 'ml', 'l'].includes(mu) && !isNaN(raw) && raw > 0;
            if (metricHasWeight) {
                // Metric is authoritative — express it in the newly picked imperial unit.
                autoCalcImperial(div);
            } else {
                // Imperial is authoritative — keep the physical amount in the new unit.
                impNumInput.value = convertImperialNumber(div, impNumInput.value, impUnitSel.dataset.prev, impUnitSel.value);
            }
            impUnitSel.dataset.prev = impUnitSel.value;
            delete impNumInput.dataset.auto;
            recalcMacrosFromIngredients();
        };
        metricNumInput.addEventListener('input', onMetricEdit);
        metricUnitSel.addEventListener('change', onMetricUnitChange);
        impNumInput.addEventListener('input', onImperialEdit);
        impUnitSel.addEventListener('change', onImperialUnitChange);
        // Recompute the auto-derived side once the ingredient name pins the density.
        nameInput.addEventListener('input', () => {
            if (metricNumInput.dataset.auto === '1') autoCalcMetric(div);
            if (impNumInput.dataset.auto === '1') autoCalcImperial(div);
        });

        // Drag-and-drop reorder
        const dragHandle = div.querySelector('.drag-handle');
        dragHandle.draggable = true;
        dragHandle.addEventListener('dragstart', (e) => {
            div.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
        });
        dragHandle.addEventListener('dragend', () => {
            div.classList.remove('dragging');
            document.querySelectorAll('.cms-ingredient-row.drag-over').forEach(r => r.classList.remove('drag-over'));
        });
        div.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const dragging = ingContainer.querySelector('.cms-ingredient-row.dragging');
            if (dragging && dragging !== div) {
                const rect = div.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    ingContainer.insertBefore(dragging, div);
                } else {
                    ingContainer.insertBefore(dragging, div.nextSibling);
                }
            }
            div.classList.add('drag-over');
        });
        div.addEventListener('dragleave', () => {
            div.classList.remove('drag-over');
        });
        div.addEventListener('drop', (e) => {
            e.preventDefault();
            div.classList.remove('drag-over');
        });

        ingContainer.appendChild(div);
    }

    // --- Step Rows ---
    function renumberSteps() {
        let n = 1;
        stepsContainer.querySelectorAll('.cms-step-row').forEach(row => {
            if (row.querySelector('textarea')) {
                row.querySelector('.step-number').textContent = n++;
            }
        });
    }

    function createStepRow(text = '') {
        const div = document.createElement('div');
        div.className = 'cms-step-row';
        const isHeader = String(text).startsWith('## ');
        if (isHeader) {
            div.innerHTML = `
                <input type="text" data-field="step" class="seamless-input" value="${escapeHtml(String(text).replace(/^##\s*/, ''))}" placeholder="Section header..." style="flex-grow: 1; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
                <button type="button" class="cms-btn-icon delete" aria-label="Remove section"><i data-lucide="x" style="width: 14px; height: 14px;"></i></button>
            `;
        } else {
            const num = stepsContainer.querySelectorAll('.cms-step-row textarea').length + 1;
            div.innerHTML = `
                <span class="step-number">${num}</span>
                <textarea class="seamless-input seamless-textarea" data-field="step" placeholder="Step..." style="min-height: 50px;">${escapeHtml(String(text))}</textarea>
                <button type="button" class="cms-btn-icon delete" aria-label="Remove step" title="Remove step"><i data-lucide="x" style="width: 14px; height: 14px;"></i></button>
            `;
        }
        div.querySelector('.delete').addEventListener('click', () => { div.remove(); renumberSteps(); });
        stepsContainer.appendChild(div);
    }

    addIngBtn.addEventListener('click', () => createIngredientRow());
    addStepBtn.addEventListener('click', () => createStepRow());

    const macroAutoCalcBtn = document.getElementById('macro-auto-calc-btn');
    if (macroAutoCalcBtn) macroAutoCalcBtn.addEventListener('click', () => {
        recalcMacrosFromIngredients();
        statusText.innerHTML = `<span class="status-dot"></span> Macros recalculated from ingredient database`;
    });

    // --- Recipe Editor ---
    function openEditor(id = null) {
        ingContainer.innerHTML = '';
        stepsContainer.innerHTML = '';

        if (id) {
            const recipe = recipes.find(r => r.id === id);
            document.getElementById('recipe-id').value = recipe.id;
            document.getElementById('recipe-title').value = recipe.title;
            document.getElementById('recipe-category').value = recipe.category || 'Default';
            const t = parseTimeToHM(recipe.time);
            document.getElementById('recipe-time-hours').value = t.hours || '';
            document.getElementById('recipe-time-mins').value = t.mins || '';
            document.getElementById('recipe-icon').value = recipe.iconTag || '';
            document.getElementById('recipe-desc').value = recipe.description || '';
            document.getElementById('recipe-image').value = recipe.imageUrl || '';
            if (recipeStatusSelect) recipeStatusSelect.value = recipe.status === 'draft' ? 'draft' : 'published';

            if (recipe.macros) {
                if (recipe.macros.macroReference) {
                    document.getElementById('macro-reference').value = recipe.macros.macroReference.type || 'per_serving';
                    document.getElementById('macro-ref-amount').value = recipe.macros.macroReference.referenceAmount || '';
                } else {
                    document.getElementById('macro-reference').value = 'per_serving';
                    document.getElementById('macro-ref-amount').value = '';
                }
                macroRefSelect.dispatchEvent(new Event('change'));
                document.getElementById('macro-yield').value = recipe.macros.yield || '';
                setMacroField('macro-energy', recipe.macros.energy, 'kCal');
                setMacroField('macro-carbs', recipe.macros.carbohydrate, 'g');
                setMacroField('macro-protein', recipe.macros.protein, 'g');
                setMacroField('macro-fat', recipe.macros.fat, 'g');
                // Restore persisted micro breakdown so re-saving without auto-calc keeps it.
                lastMacroBreakdown = {};
                for (const nf of NUTRIENT_FIELDS) {
                    if (typeof recipe.macros[nf] === 'number' && !isNaN(recipe.macros[nf])) lastMacroBreakdown[nf] = recipe.macros[nf];
                }
            } else {
                document.getElementById('macro-reference').value = 'per_serving';
                macroRefSelect.dispatchEvent(new Event('change'));
                setMacroField('macro-energy', '', 'kCal');
                setMacroField('macro-carbs', '', 'g');
                setMacroField('macro-protein', '', 'g');
                setMacroField('macro-fat', '', 'g');
                document.getElementById('macro-yield').value = '';
                lastMacroBreakdown = null;
            }

            if (recipe.ingredients?.length > 0) {
                recipe.ingredients.forEach(ing => createIngredientRow(ing.item, ing.metric, ing.imperial, ing.foodId || ''));
            } else {
                createIngredientRow();
            }

            (recipe.steps || []).forEach(step => createStepRow(step));
            document.getElementById('recipe-note').value = recipe.note || '';
            document.getElementById('recipe-variations').value = recipe.variations || '';
            const cmsTagsEl = document.getElementById('cms-recipe-tags');
            if (cmsTagsEl) cmsTagsEl.innerHTML = cmsGetRecipeTags(recipe).map(t => `<span class="tag-display-chip">${escapeHtml(t)}</span>`).join('');
            recipeManualTags = Array.isArray(recipe.tags) ? [...recipe.tags] : [];
            if (cmsDeleteBtn) cmsDeleteBtn.style.display = '';
        } else {
            form.reset();
            document.getElementById('recipe-id').value = Date.now().toString();
            setMacroField('macro-energy', '', 'kCal');
            setMacroField('macro-carbs', '', 'g');
            setMacroField('macro-protein', '', 'g');
            setMacroField('macro-fat', '', 'g');
            if (recipeStatusSelect) recipeStatusSelect.value = 'published';
            createIngredientRow();
            const cmsTagsEl = document.getElementById('cms-recipe-tags');
            if (cmsTagsEl) cmsTagsEl.innerHTML = '';
            recipeManualTags = [];
            if (cmsDeleteBtn) cmsDeleteBtn.style.display = 'none';
        }
        renderRecipeTagsEditor();
        refreshRecipeAutoTags();
        refreshImagePreview('recipe-image', 'recipe-image-preview');
        if (window.lucide) window.lucide.createIcons();
        applyCMSAccent();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // --- Recipe tag editor ---
    let recipeManualTags = [];

    function renderRecipeTagsEditor() {
        const chipsEl = document.getElementById('recipe-tags-chips');
        if (!chipsEl) return;
        chipsEl.innerHTML = recipeManualTags.map((tag, i) => `
            <span class="tag-edit-chip" data-index="${i}">
                <span class="tag-edit-label" title="Click to edit">${escapeHtml(tag)}</span>
                <button type="button" class="tag-edit-remove" data-index="${i}" title="Remove tag" aria-label="Remove tag">&times;</button>
            </span>`).join('') || `<span class="tag-empty-hint">No custom tags yet — type one below.</span>`;

        chipsEl.querySelectorAll('.tag-edit-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                recipeManualTags.splice(parseInt(btn.dataset.index, 10), 1);
                renderRecipeTagsEditor();
            });
        });
        chipsEl.querySelectorAll('.tag-edit-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                if (e.target.closest('.tag-edit-remove')) return;
                startTagEdit(chip);
            });
        });
    }

    function startTagEdit(chip) {
        const idx = parseInt(chip.dataset.index, 10);
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'seamless-input tag-edit-input';
        input.value = recipeManualTags[idx];
        input.maxLength = 50;
        chip.replaceChildren(input);
        input.focus();
        input.select();
        const commit = () => {
            const val = input.value.trim();
            if (val && !recipeManualTags.includes(val)) recipeManualTags[idx] = val;
            else if (!val) recipeManualTags.splice(idx, 1);
            renderRecipeTagsEditor();
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            else if (e.key === 'Escape') { renderRecipeTagsEditor(); }
        });
        input.addEventListener('blur', commit);
    }

    function addRecipeTag(val) {
        val = (val || '').trim();
        if (!val) return;
        if (!recipeManualTags.includes(val)) recipeManualTags.push(val);
    }

    function refreshRecipeAutoTags() {
        const autoEl = document.getElementById('recipe-tags-auto');
        if (!autoEl) return;
        const pseudo = {
            time: composeTimeString(
                document.getElementById('recipe-time-hours').value,
                document.getElementById('recipe-time-mins').value
            ),
            category: document.getElementById('recipe-category').value,
            macros: {
                yield: document.getElementById('macro-yield').value,
                energy: getMacroValue('macro-energy', 'kCal'),
                carbohydrate: getMacroValue('macro-carbs', 'g'),
                protein: getMacroValue('macro-protein', 'g'),
                fat: getMacroValue('macro-fat', 'g')
            }
        };
        const autoTags = cmsGetRecipeTags(pseudo);
        autoEl.innerHTML = autoTags.length
            ? `<span class="auto-tag-hint">Auto:</span> ${autoTags.map(t => `<span class="tag-display-chip">${escapeHtml(t)}</span>`).join('')}`
            : '';
    }

    const recipeTagsInput = document.getElementById('recipe-tags-input');
    const recipeTagsAddBtn = document.getElementById('recipe-tags-add');
    if (recipeTagsInput) {
        recipeTagsInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addRecipeTag(recipeTagsInput.value);
                recipeTagsInput.value = '';
                renderRecipeTagsEditor();
            }
        });
    }
    if (recipeTagsAddBtn) {
        recipeTagsAddBtn.addEventListener('click', () => {
            addRecipeTag(recipeTagsInput ? recipeTagsInput.value : '');
            if (recipeTagsInput) recipeTagsInput.value = '';
            renderRecipeTagsEditor();
            if (recipeTagsInput) recipeTagsInput.focus();
        });
    }
    ['recipe-time-hours', 'recipe-time-mins', 'recipe-category', 'macro-energy', 'macro-carbs', 'macro-protein', 'macro-fat', 'macro-yield'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', refreshRecipeAutoTags);
    });

    // --- Image upload (stored as a downscaled data URL so it travels with the
    // JSON data: export/import backups, the website repo, GitHub Pages) ---
    function resizeImageToDataUrl(file, maxDim = 1000, quality = 0.85) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    let { width, height } = img;
                    const scale = Math.min(1, maxDim / Math.max(width, height));
                    width = Math.round(width * scale);
                    height = Math.round(height * scale);
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
                    resolve(canvas.toDataURL(mime, quality));
                };
                img.onerror = () => reject(new Error('Could not read the selected image.'));
                img.src = reader.result;
            };
            reader.onerror = () => reject(new Error('Could not read the selected file.'));
            reader.readAsDataURL(file);
        });
    }

    function refreshImagePreview(inputId, previewId) {
        const input = document.getElementById(inputId);
        const preview = document.getElementById(previewId);
        if (!preview) return;
        const val = input ? input.value.trim() : '';
        if (val) {
            preview.innerHTML = `<img src="${escapeHtml(val)}" alt="Preview" onerror="this.parentElement.style.display='none'">`;
            preview.style.display = '';
        } else {
            preview.innerHTML = '';
            preview.style.display = 'none';
        }
    }

    function bindImageUpload(inputId, fileId, previewId) {
        const fileInput = document.getElementById(fileId);
        const uploadBtn = document.getElementById(inputId + '-upload');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                if (fileInput) fileInput.click();
            });
        }
        if (fileInput) {
            fileInput.addEventListener('change', async () => {
                const file = fileInput.files && fileInput.files[0];
                fileInput.value = '';
                if (!file) return;
                if (!file.type.startsWith('image/')) { alert('Please choose an image file.'); return; }
                if (file.size > 8 * 1024 * 1024) { alert('That image is larger than 8 MB. Please choose a smaller one.'); return; }
                try {
                    const dataUrl = await resizeImageToDataUrl(file);
                    const input = document.getElementById(inputId);
                    if (input) input.value = dataUrl;
                    refreshImagePreview(inputId, previewId);
                } catch (err) {
                    alert(err.message || 'Could not upload the image.');
                }
            });
        }
        const input = document.getElementById(inputId);
        if (input) input.addEventListener('input', () => refreshImagePreview(inputId, previewId));
    }

    bindImageUpload('recipe-image', 'recipe-image-file', 'recipe-image-preview');
    bindImageUpload('profile-image', 'profile-image-file', 'profile-image-preview');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const ingRows = Array.from(ingContainer.querySelectorAll('.cms-ingredient-row, .cms-ingredient-header-row'));
        const recipeIngredients = ingRows.map(row => {
            if (row.classList.contains('cms-ingredient-header-row')) {
                const name = row.querySelector('[data-field="name"]').value.trim();
                if (!name) return null;
                return { item: '## ' + name, foodId: '', metric: '', imperial: '' };
            }
            const mNum = row.querySelector('[data-field="metric-num"]').value.trim();
            const mUnit = row.querySelector('[data-field="metric-unit"]').value.trim();
            const iNum = row.querySelector('[data-field="imperial-num"]').value.trim();
            const iUnit = row.querySelector('[data-field="imperial-unit"]').value.trim();
            const origM = row.dataset.origMetric || '';
            const origI = row.dataset.origImperial || '';
            const metric = mNum ? (mUnit ? `${mNum}${mUnit}` : mNum) : origM;
            const imperial = iNum ? (iUnit ? `${iNum} ${iUnit}` : iNum) : origI;
            const item = row.querySelector('[data-field="name"]').value.trim();
            if (!item) return null;
            return { item, foodId: row.dataset.foodId || '', metric, imperial };
        }).filter(Boolean);

        // Validate foodIds (skip for components marked with ##)
        for (let ing of recipeIngredients) {
            if (!ing.item.startsWith('## ') && (!ing.foodId || ing.foodId.trim() === '')) {
                alert(`Missing foodId for ingredient: ${ing.item}`);
                return;
            }
        }

        const stepRows = Array.from(stepsContainer.querySelectorAll('.cms-step-row'));
        const steps = stepRows.map(row => {
            const field = row.querySelector('[data-field="step"]');
            const text = field.value.trim();
            if (!text) return null;
            return row.querySelector('textarea') ? text : '## ' + text;
        }).filter(Boolean);

        const newRecipe = {
            id: document.getElementById('recipe-id').value,
            entryType: 'recipe',
            title: document.getElementById('recipe-title').value,
            category: document.getElementById('recipe-category').value,
            time: composeTimeString(
                document.getElementById('recipe-time-hours').value,
                document.getElementById('recipe-time-mins').value
            ),
            iconTag: document.getElementById('recipe-icon').value,
            description: document.getElementById('recipe-desc').value,
            imageUrl: document.getElementById('recipe-image').value,
            status: recipeStatusSelect ? recipeStatusSelect.value : 'published',
            macros: {
                macroReference: {
                    type: document.getElementById('macro-reference').value,
                    referenceAmount: document.getElementById('macro-ref-amount').value
                },
                yield: document.getElementById('macro-yield').value,
                energy: getMacroValue('macro-energy', 'kCal'),
                carbohydrate: getMacroValue('macro-carbs', 'g'),
                protein: getMacroValue('macro-protein', 'g'),
                fat: getMacroValue('macro-fat', 'g'),
                ...(lastMacroBreakdown || {})
            },
            ingredients: recipeIngredients,
            steps,
            tags: recipeManualTags,
            note: document.getElementById('recipe-note').value,
            variations: document.getElementById('recipe-variations').value
        };

        const idx = recipes.findIndex(r => r.id === newRecipe.id);
        if (idx >= 0) recipes[idx] = newRecipe;
        else recipes.push(newRecipe);

        closeModal();
        renderCMSList();
        await saveRecipes();
    });

    // --- Ingredient Profile Editor ---
    function openProfileEditor(foodId) {
        const ing = foodId ? ingredients.find(f => f.foodId === foodId) : null;
        if (foodId && !ing) {
            alert('Ingredient not found. It may have been deleted.');
            return;
        }
        const details = (ing && ing.ingredientDetails) || {};

        document.getElementById('profile-food-id').value = ing ? ing.foodId : '';
        document.getElementById('profile-name').value = (ing && ing.name) || '';
        document.getElementById('profile-scientificName').value = (ing && ing.scientificName) || '';
        document.getElementById('profile-category').value = (ing && ing.category) || '';
        document.getElementById('profile-description').value = (ing && ing.description) || '';
        document.getElementById('profile-image').value = (ing && ing.imageUrl) || '';
        refreshImagePreview('profile-image', 'profile-image-preview');
        document.getElementById('profile-calories').value = (ing && ing.calories) || '';
        document.getElementById('profile-proteinG').value = (ing && ing.proteinG) || '';
        document.getElementById('profile-fatG').value = (ing && ing.fatG) || '';
        document.getElementById('profile-carbsG').value = (ing && ing.carbsG) || '';
        document.getElementById('profile-saturatedFatG').value = (ing && ing.saturatedFatG) || '';
        document.getElementById('profile-sugarG').value = (ing && ing.sugarG) || '';
        document.getElementById('profile-fiberG').value = (ing && ing.fiberG) || '';

        // Reset tabs to Overview
        const ingTabs = document.getElementById('cmsIngTabs');
        if (ingTabs) {
            ingTabs.querySelectorAll('.ing-tab').forEach(t => t.classList.remove('active'));
            ingTabs.querySelector('.ing-tab[data-tab="overview"]').classList.add('active');
        }
        const ingPanels = document.querySelectorAll('#cms-food-modal .ing-tab-panel');
        ingPanels.forEach(p => {
            p.classList.remove('active');
            if (p.dataset.panel === 'overview') p.classList.add('active');
        });

        document.getElementById('profile-storage').value = details.storage || '';
        document.getElementById('profile-flavour').value = details.flavour || '';
        document.getElementById('profile-pairings').value = details.pairings || '';
        document.getElementById('profile-varieties').value = details.varieties || '';
        document.getElementById('profile-preparations').value = details.preparations || '';
        document.getElementById('profile-proteinSource').value = (ing && ing.proteinSource) || '';

        // Vitamins
        document.getElementById('profile-vitaminAMcg').value = (ing && ing.vitaminAMcg) || '';
        document.getElementById('profile-vitaminCMg').value = (ing && ing.vitaminCMg) || '';
        document.getElementById('profile-vitaminDMcg').value = (ing && ing.vitaminDMcg) || '';
        document.getElementById('profile-vitaminEMg').value = (ing && ing.vitaminEMg) || '';
        document.getElementById('profile-vitaminKMcg').value = (ing && ing.vitaminKMcg) || '';
        document.getElementById('profile-thiaminMg').value = (ing && ing.thiaminMg) || '';
        document.getElementById('profile-riboflavinMg').value = (ing && ing.riboflavinMg) || '';
        document.getElementById('profile-niacinMg').value = (ing && ing.niacinMg) || '';
        document.getElementById('profile-vitaminB6Mg').value = (ing && ing.vitaminB6Mg) || '';
        document.getElementById('profile-folateMcg').value = (ing && ing.folateMcg) || '';
        document.getElementById('profile-vitaminB12Mcg').value = (ing && ing.vitaminB12Mcg) || '';

        // Minerals
        document.getElementById('profile-calciumMg').value = (ing && ing.calciumMg) || '';
        document.getElementById('profile-ironMg').value = (ing && ing.ironMg) || '';
        document.getElementById('profile-magnesiumMg').value = (ing && ing.magnesiumMg) || '';
        document.getElementById('profile-phosphorusMg').value = (ing && ing.phosphorusMg) || '';
        document.getElementById('profile-potassiumMg').value = (ing && ing.potassiumMg) || '';
        document.getElementById('profile-sodiumMg').value = (ing && ing.sodiumMg) || '';
        document.getElementById('profile-zincMg').value = (ing && ing.zincMg) || '';
        document.getElementById('profile-copperMg').value = (ing && ing.copperMg) || '';
        document.getElementById('profile-seleniumMcg').value = (ing && ing.seleniumMcg) || '';

        foodModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const foodId = document.getElementById('profile-food-id').value;
        let idx = ingredients.findIndex(f => f.foodId === foodId);
        if (idx < 0) {
            const name = document.getElementById('profile-name').value.trim();
            if (!name) {
                alert('Please enter an ingredient name.');
                return;
            }
            let newFoodId = slugify(name);
            let suffix = 1;
            while (ingredients.some(f => f.foodId === newFoodId)) {
                newFoodId = slugify(name) + '-' + (++suffix);
            }
            ingredients.push({
                foodId: newFoodId,
                name: name,
                servingSizeG: 100,
                servingUnit: 'g',
                category: '',
                calories: 0,
                proteinG: 0,
                fatG: 0,
                carbsG: 0,
                fiberG: 0,
                sugarG: 0,
                saturatedFatG: 0,
                proteinSource: ''
            });
            idx = ingredients.length - 1;
            document.getElementById('profile-food-id').value = newFoodId;
        }

        ingredients[idx].name = document.getElementById('profile-name').value.trim() || ingredients[idx].name;
        ingredients[idx].scientificName = document.getElementById('profile-scientificName').value.trim() || '';
        ingredients[idx].category = document.getElementById('profile-category').value.trim() || '';
        ingredients[idx].description = document.getElementById('profile-description').value.trim();
        ingredients[idx].imageUrl = document.getElementById('profile-image').value.trim();
        ingredients[idx].calories = parseFloat(document.getElementById('profile-calories').value) || 0;
        ingredients[idx].proteinG = parseFloat(document.getElementById('profile-proteinG').value) || 0;
        ingredients[idx].fatG = parseFloat(document.getElementById('profile-fatG').value) || 0;
        ingredients[idx].carbsG = parseFloat(document.getElementById('profile-carbsG').value) || 0;
        ingredients[idx].saturatedFatG = parseFloat(document.getElementById('profile-saturatedFatG').value) || 0;
        ingredients[idx].sugarG = parseFloat(document.getElementById('profile-sugarG').value) || 0;
        ingredients[idx].fiberG = parseFloat(document.getElementById('profile-fiberG').value) || 0;
        ingredients[idx].proteinSource = document.getElementById('profile-proteinSource').value || '';
        ingredients[idx].ingredientDetails = {
            storage: document.getElementById('profile-storage').value.trim(),
            flavour: document.getElementById('profile-flavour').value.trim(),
            pairings: document.getElementById('profile-pairings').value.trim(),
            varieties: document.getElementById('profile-varieties').value.trim(),
            preparations: document.getElementById('profile-preparations').value.trim()
        };

        // Vitamins
        ingredients[idx].vitaminAMcg = parseFloat(document.getElementById('profile-vitaminAMcg').value) || 0;
        ingredients[idx].vitaminCMg = parseFloat(document.getElementById('profile-vitaminCMg').value) || 0;
        ingredients[idx].vitaminDMcg = parseFloat(document.getElementById('profile-vitaminDMcg').value) || 0;
        ingredients[idx].vitaminEMg = parseFloat(document.getElementById('profile-vitaminEMg').value) || 0;
        ingredients[idx].vitaminKMcg = parseFloat(document.getElementById('profile-vitaminKMcg').value) || 0;
        ingredients[idx].thiaminMg = parseFloat(document.getElementById('profile-thiaminMg').value) || 0;
        ingredients[idx].riboflavinMg = parseFloat(document.getElementById('profile-riboflavinMg').value) || 0;
        ingredients[idx].niacinMg = parseFloat(document.getElementById('profile-niacinMg').value) || 0;
        ingredients[idx].vitaminB6Mg = parseFloat(document.getElementById('profile-vitaminB6Mg').value) || 0;
        ingredients[idx].folateMcg = parseFloat(document.getElementById('profile-folateMcg').value) || 0;
        ingredients[idx].vitaminB12Mcg = parseFloat(document.getElementById('profile-vitaminB12Mcg').value) || 0;

        // Minerals
        ingredients[idx].calciumMg = parseFloat(document.getElementById('profile-calciumMg').value) || 0;
        ingredients[idx].ironMg = parseFloat(document.getElementById('profile-ironMg').value) || 0;
        ingredients[idx].seleniumMcg = parseFloat(document.getElementById('profile-seleniumMcg').value) || 0;

        closeFoodModal();
        await saveIngredients();
        renderCMSList();
        statusText.innerHTML = `<span class="status-dot"></span> Saved profile for ${escapeHtml(ingredients[idx].name)}`;
    });

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    function closeFoodModal() {
        foodModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    foodCloseBtn.addEventListener('click', closeFoodModal);
    foodModal.addEventListener('click', (e) => { if (e.target === foodModal) closeFoodModal(); });
    if (cancelRecipeBtn) cancelRecipeBtn.addEventListener('click', closeModal);
    if (cancelFoodBtn) cancelFoodBtn.addEventListener('click', closeFoodModal);

    // --- Household Item Editor Modal ---
    const householdModal = document.getElementById('cms-household-modal');
    const householdForm = document.getElementById('household-item-form');
    const householdCloseBtn = householdModal ? householdModal.querySelector('.household-close') : null;
    const householdDeleteBtn = document.getElementById('household-delete-btn');
    const cancelHouseholdBtn = document.getElementById('cancel-household-btn');

    function closeHouseholdModal() {
        if (householdModal) householdModal.classList.remove('active');
        document.body.style.overflow = '';
    }
    if (householdCloseBtn) householdCloseBtn.addEventListener('click', closeHouseholdModal);
    if (householdModal) householdModal.addEventListener('click', (e) => { if (e.target === householdModal) closeHouseholdModal(); });
    if (cancelHouseholdBtn) cancelHouseholdBtn.addEventListener('click', closeHouseholdModal);

    if (householdForm) householdForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('household-id').value || ('hh_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6));
        const name = document.getElementById('household-name').value.trim();
        if (!name) { alert('Please enter an item name.'); return; }
        const record = {
            id,
            name,
            category: document.getElementById('household-category').value,
            unitSize: document.getElementById('household-unit-size').value.trim(),
            currentStock: parseFloat(document.getElementById('household-stock').value) || 0,
            avgDurationDays: parseFloat(document.getElementById('household-duration').value) || 0,
            pricePerUnit: parseFloat(document.getElementById('household-price').value) || 0,
            lastOpenedDate: document.getElementById('household-last-opened').value || ''
        };
        const idx = householdItems.findIndex(x => x.id === id);
        const existing = householdItems[idx] || {};
        record.durationHistory = existing.durationHistory || [];
        if (idx >= 0) householdItems[idx] = record;
        else householdItems.push(record);
        closeHouseholdModal();
        renderCMSList();
        await saveHousehold();
    });

    if (householdDeleteBtn) householdDeleteBtn.addEventListener('click', async () => {
        const id = document.getElementById('household-id').value;
        if (!id) return;
        const confirmed = await showConfirmDialog('Delete this item?', 'This will permanently remove the item from household supplies.');
        if (!confirmed) return;
        householdItems = householdItems.filter(x => x.id !== id);
        closeHouseholdModal();
        renderCMSList();
        await saveHousehold();
    });

    if (cmsDeleteBtn) cmsDeleteBtn.addEventListener('click', async () => {
        const recipeId = document.getElementById('recipe-id').value;
        if (!recipeId) return;
        const confirmed = await showConfirmDialog('Delete this recipe?', 'This will permanently remove the recipe from your database.');
        if (!confirmed) return;
        const idx = recipes.findIndex(r => r.id === recipeId);
        if (idx >= 0) {
            recipes.splice(idx, 1);
            await saveRecipes();
            closeModal();
            renderCMSList();
            statusText.innerHTML = `<span class="status-dot"></span> Recipe deleted`;
        }
    });

    if (foodDeleteBtn) foodDeleteBtn.addEventListener('click', async () => {
        const foodId = document.getElementById('profile-food-id').value;
        if (!foodId) return;
        const confirmed = await showConfirmDialog('Delete this ingredient profile?', 'This will permanently remove the profile from your database.');
        if (!confirmed) return;
        const idx = ingredients.findIndex(f => f.foodId === foodId);
        if (idx >= 0) {
            ingredients.splice(idx, 1);
            await saveIngredients();
            closeFoodModal();
            renderCMSList();
            statusText.innerHTML = `<span class="status-dot"></span> Profile deleted`;
        }
    });

    const ingTabs = document.getElementById('cmsIngTabs');
    if (ingTabs) {
        ingTabs.addEventListener('click', (e) => {
            const tab = e.target.closest('.ing-tab');
            if (!tab) return;
            ingTabs.querySelectorAll('.ing-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            foodModal.querySelectorAll('.ing-tab-panel').forEach(p => {
                p.classList.toggle('active', p.dataset.panel === target);
            });
        });
    }

    document.addEventListener('keydown', (e) => { 
        if (e.key === 'Escape') {
            closeModal(); 
            closeFoodModal();
            closeHouseholdModal();
        } 
    });
});
