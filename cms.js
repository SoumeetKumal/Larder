document.addEventListener('DOMContentLoaded', () => {
    // Escape user-controlled text before it reaches innerHTML templates (XSS).
    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

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

    let recipes = [];
    let ingredients = [];
    let mealPlans = [];
    let pantry = [];
    let shoppingLists = [];
    let appSettings = { profiles: [] };
    let currentCMSTab = 'recipe';
    let cmsSearchQuery = '';
    let mealWeekOffset = 0;

    const cmsTabs = document.getElementById('cms-tabs');
    const searchInput = document.getElementById('cms-search');

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            cmsSearchQuery = e.target.value.toLowerCase();
            renderCMSList();
        });
    }
    document.querySelectorAll('.cms-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            document.querySelectorAll('.cms-tab').forEach(t => {
                t.classList.remove('active');
                t.style.borderBottomColor = 'transparent';
                t.style.color = 'var(--text-muted)';
            });
            e.target.classList.add('active');
            e.target.style.borderBottomColor = 'var(--text-primary)';
            e.target.style.color = 'inherit';
            currentCMSTab = e.target.dataset.tab;
            renderCMSList();
        });
    });

    // --- Load Data ---
    const API_KEY = 'larder_local_sync_8f92k';
    const HEADERS = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
    };

    async function loadData(retryCount = 0) {
        try {
            const [resRecipes, resIngredients, resMealPlans, resPantry, resShoppingLists, resSettings] = await Promise.all([
                fetch('/api/recipes', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/ingredients', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/mealplans', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/pantry', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/shoppinglists', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/settings', { headers: HEADERS }).then(r => r.ok ? r.json() : { profiles: [] })
            ]);
            recipes = resRecipes;
            ingredients = resIngredients;
            mealPlans = resMealPlans;
            pantry = resPantry;
            shoppingLists = resShoppingLists;
            appSettings = (resSettings && typeof resSettings === 'object' && !Array.isArray(resSettings) && Array.isArray(resSettings.profiles))
                ? resSettings
                : { profiles: resSettings && Array.isArray(resSettings.profiles) ? resSettings.profiles : [] };
            
            statusText.innerHTML = `<span class="status-dot"></span> Connected · ${recipes.length} recipes · ${ingredients.length} ingredients`;
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
            alert('Save failed. Is the server running?');
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
            alert('Save failed. Is the server running?');
        }
    }

    // --- Render CMS List ---
    function populateIngredientSuggestions() {
        const datalist = document.getElementById('ingredient-suggestions');
        if (!datalist) return;
        datalist.innerHTML = ingredients.map(f => `<option value="${escapeHtml(f.name)}">`).join('');
    }

    function renderCMSList() {
        populateIngredientSuggestions();

        // Manage search bar visibility
        if (searchInput) {
            if (['recipe', 'food', 'pantry'].includes(currentCMSTab)) {
                searchInput.style.display = 'block';
            } else {
                searchInput.style.display = 'none';
            }
        }

        if (currentCMSTab === 'mealplan') {
            const slots = ['breakfast', 'lunch', 'dinner', 'snack'];
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

            // Aggregate macros for the whole week (across all eaters for now)
            const weekTotal = { energy: 0, carbs: 0, protein: 0, fat: 0 };
            const weekDates = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(startOfWeek);
                d.setDate(startOfWeek.getDate() + i);
                weekDates.push(d);
                const dateString = d.toISOString().split('T')[0];
                slots.forEach(slot => {
                    const plan = mealPlans.find(p => p.date === dateString && p.slot === slot);
                    if (!plan || plan.isEatingOut || plan.type === 'eating_out') return;
                    const mult = plan.servings || 1;
                    (plan.items || []).forEach(item => {
                        if (item.type === 'recipe') {
                            const r = recipes.find(rec => rec.id === item.referenceId);
                            const m = recipeMacros(r);
                            weekTotal.energy += m.energy * mult;
                            weekTotal.carbs += m.carbs * mult;
                            weekTotal.protein += m.protein * mult;
                            weekTotal.fat += m.fat * mult;
                        } else if (item.type === 'ingredient') {
                            const ing = ingredients.find(f => f.foodId === item.referenceId);
                            if (!ing) return;
                            const per100 = macroNum(item.amount) / 100;
                            weekTotal.energy += (macroNum(ing.calories) * per100) * mult;
                            weekTotal.carbs += (macroNum(ing.carbsG) * per100) * mult;
                            weekTotal.protein += (macroNum(ing.proteinG) * per100) * mult;
                            weekTotal.fat += (macroNum(ing.fatG) * per100) * mult;
                        }
                    });
                });
            }

            const weekEnd = new Date(startOfWeek);
            weekEnd.setDate(startOfWeek.getDate() + 6);
            const weekLabel = `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

            // Build user stat cards from profiles
            const profiles = (appSettings.profiles && appSettings.profiles.length)
                ? appSettings.profiles
                : [{ name: 'User', calories: 2000, carbs: 40, protein: 30, fat: 30 }];
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

            const statsHTML = profiles.map((profile, idx) => {
                const accent = avatarAccents[idx % avatarAccents.length];
                const initial = (profile.name || 'U').trim().charAt(0).toUpperCase();
                const target = macroTargets(profile);
                const calPct = target.energy > 0 ? Math.min(100, Math.round((weekTotal.energy / target.energy) * 100)) : 0;
                const ringOffset = Math.max(0, 100 - calPct);
                const proteinPct = target.protein > 0 ? Math.min(100, Math.round((weekTotal.protein / target.protein) * 100)) : 0;
                const carbsPct = target.carbs > 0 ? Math.min(100, Math.round((weekTotal.carbs / target.carbs) * 100)) : 0;
                const fatPct = target.fat > 0 ? Math.min(100, Math.round((weekTotal.fat / target.fat) * 100)) : 0;
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
                            <strong>${Math.round(weekTotal.energy).toLocaleString()}</strong>
                            <span>/ ${target.energy.toLocaleString()} kcal</span>
                        </div>
                    </div>
                    <div class="mp-user-details-hover">
                        <h4 style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-main); margin-bottom: 0.75rem; border-bottom: 2px solid ${accent}; padding-bottom: 0.5rem; display: inline-block;">Macro Progress</h4>
                        <div class="mp-macro-row">
                            <span class="mp-macro-label"><i data-lucide="beef" style="width: 14px; height: 14px; color: var(--accent-meat);"></i> Protein</span>
                            <div class="mp-macro-vals">
                                <span class="mp-macro-curr">${Math.round(weekTotal.protein)}g</span>
                                <span class="mp-macro-target">/ ${target.protein}g</span>
                            </div>
                        </div>
                        <div class="mp-macro-row">
                            <span class="mp-macro-label"><i data-lucide="wheat" style="width: 14px; height: 14px; color: var(--accent-stock);"></i> Carbs</span>
                            <div class="mp-macro-vals">
                                <span class="mp-macro-curr">${Math.round(weekTotal.carbs)}g</span>
                                <span class="mp-macro-target">/ ${target.carbs}g</span>
                            </div>
                        </div>
                        <div class="mp-macro-row">
                            <span class="mp-macro-label"><i data-lucide="droplet" style="width: 14px; height: 14px; color: #D4B04A;"></i> Fat</span>
                            <div class="mp-macro-vals">
                                <span class="mp-macro-curr">${Math.round(weekTotal.fat)}g</span>
                                <span class="mp-macro-target">/ ${target.fat}g</span>
                            </div>
                        </div>
                        <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border); font-size: 0.75rem; color: var(--text-muted);">
                            Protein ${proteinPct}% · Carbs ${carbsPct}% · Fat ${fatPct}%
                        </div>
                    </div>
                </div>`;
            }).join('');

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
                        if (plan.isEatingOut || plan.type === 'eating_out') {
                            slotInner = `
                                <div class="mp-meal-card mp-eating-out">
                                    <i data-lucide="coffee" style="color: var(--primary); width: 20px; height: 20px;"></i>
                                    <div class="mp-meal-title">Eating Out</div>
                                </div>`;
                        } else if (plan.items && plan.items.length === 1 && plan.items[0].type === 'recipe') {
                            const r = recipes.find(rec => rec.id === plan.items[0].referenceId);
                            const m = recipeMacros(r);
                            const title = r ? r.title : (plan.items[0].name || 'Recipe');
                            const img = (r && r.imageUrl)
                                ? `<img src="${escapeHtml(r.imageUrl)}" class="mp-meal-img" onerror="this.style.display='none'">`
                                : `<div class="mp-meal-img" style="background: var(--bg-surface-hover); display: flex; align-items: center; justify-content: center;"><i data-lucide="utensils-crossed" style="width: 16px; height: 16px; color: var(--text-muted);"></i></div>`;
                            slotInner = `
                                <div class="mp-meal-card">
                                    ${img}
                                    <div class="mp-meal-info">
                                        <div class="mp-meal-title">${escapeHtml(title)}</div>
                                        <div class="mp-meal-meta">${m.energy ? Math.round(m.energy) + ' kcal' : ''}${plan.servings ? ' · ×' + plan.servings : ''}</div>
                                    </div>
                                </div>`;
                        } else if (plan.items && plan.items.length > 0) {
                            const names = plan.items.map(item => escapeHtml(item.name));
                            const shown = names.length <= 2 ? names.join(' & ') : names.slice(0, 2).join(' & ') + ` +${names.length - 2}`;
                            slotInner = `
                                <div class="mp-meal-card">
                                    <div class="mp-meal-info">
                                        <div class="mp-meal-title">${shown}</div>
                                        <div class="mp-meal-meta">${plan.items.length} item${plan.items.length !== 1 ? 's' : ''}${plan.servings ? ' · ×' + plan.servings : ''}</div>
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

            const checkboxEatingOut = document.getElementById('meal-assign-eating-out');
            const builderSection = document.getElementById('meal-assign-builder');

            const servingsInput = document.getElementById('meal-assign-servings');
            const servingsRow = document.getElementById('meal-assign-servings-row');
            const servingsDecrement = document.getElementById('servings-decrement');
            const servingsIncrement = document.getElementById('servings-increment');

            const searchInput = document.getElementById('meal-assign-search');
            const suggestionsBox = document.getElementById('meal-assign-suggestions');
            const amountGroup = document.getElementById('meal-assign-amount-group');
            const amountInput = document.getElementById('meal-assign-amount');
            const unitLabel = document.getElementById('meal-assign-unit');
            const addBtnModal = document.getElementById('meal-assign-add-btn');

            const selectedList = document.getElementById('meal-assign-selected-list');
            const btnClear = document.getElementById('meal-assign-clear');
            const btnCancel = document.getElementById('meal-assign-cancel');
            const btnConfirm = document.getElementById('meal-assign-confirm');
            const templateSaveBtn = document.getElementById('meal-template-save');
            const templateListEl = document.getElementById('meal-template-list');
            const copyDayCheckboxes = document.querySelectorAll('.copy-day-cb');

            let activeDate = null;
            let activeSlotName = null;
            let modalSelectedItems = [];
            let currentStagedItem = null; // { type, referenceId, name, unit }

            // Load templates from localStorage
            let mealTemplates = JSON.parse(localStorage.getItem('larder_meal_templates') || '[]');

            function saveTemplatesToStorage() {
                localStorage.setItem('larder_meal_templates', JSON.stringify(mealTemplates));
            }

            function renderTemplateChips() {
                if (mealTemplates.length === 0) {
                    templateListEl.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-muted); padding: 0.3rem;">No templates saved yet.</span>';
                    return;
                }
                templateListEl.innerHTML = mealTemplates.map((t, idx) => `
                    <div style="display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.6rem; border: 1px solid var(--border); border-radius: 20px; background: var(--bg-surface); font-size: 0.75rem; cursor: pointer;" class="template-chip" data-idx="${idx}">
                        <span class="template-chip-name" data-idx="${idx}" style="font-weight: 600;">${escapeHtml(t.name)}</span>
                        <span style="color: var(--text-muted);">(${t.items.length} item${t.items.length !== 1 ? 's' : ''}, ×${t.servings})</span>
                        <button class="template-delete" data-idx="${idx}" style="background: none; border: none; color: var(--accent-meat); cursor: pointer; font-size: 1rem; line-height: 1; margin-left: 0.2rem;">&times;</button>
                    </div>
                `).join('');

                // Click chip name to load
                document.querySelectorAll('.template-chip-name').forEach(el => {
                    el.onclick = (e) => {
                        const t = mealTemplates[parseInt(e.target.dataset.idx)];
                        if (!t) return;
                        modalSelectedItems = JSON.parse(JSON.stringify(t.items));
                        servingsInput.value = t.servings || 1;
                        checkboxEatingOut.checked = false;
                        builderSection.style.opacity = '1';
                        builderSection.style.pointerEvents = 'auto';
                        servingsRow.style.opacity = '1';
                        servingsRow.style.pointerEvents = 'auto';
                        renderModalSelectedItems();
                    };
                });

                // Click X to delete
                document.querySelectorAll('.template-delete').forEach(el => {
                    el.onclick = (e) => {
                        e.stopPropagation();
                        mealTemplates.splice(parseInt(e.target.dataset.idx), 1);
                        saveTemplatesToStorage();
                        renderTemplateChips();
                    };
                });
            }

            // Save as template
            templateSaveBtn.onclick = () => {
                if (modalSelectedItems.length === 0 && !checkboxEatingOut.checked) {
                    alert('Add some items first before saving a template.');
                    return;
                }
                const name = prompt('Name this template (e.g. "My Weekday Breakfast"):');
                if (!name || !name.trim()) return;
                mealTemplates.push({
                    name: name.trim(),
                    items: JSON.parse(JSON.stringify(modalSelectedItems)),
                    servings: parseInt(servingsInput.value) || 1,
                    isEatingOut: checkboxEatingOut.checked
                });
                saveTemplatesToStorage();
                renderTemplateChips();
            };

            // Render selected items
            function renderModalSelectedItems() {
                if (modalSelectedItems.length === 0) {
                    selectedList.innerHTML = '<li style="padding: 0.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No items added yet.</li>';
                    return;
                }

                selectedList.innerHTML = modalSelectedItems.map((item, index) => `
                    <li style="padding: 0.5rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem;">
                        <div>
                            <span style="font-weight: 600; color: var(--text-primary);">${escapeHtml(item.name)}</span>
                            <span style="color: var(--text-muted); margin-left: 0.5rem;">
                                ${item.type === 'ingredient' ? `${escapeHtml(item.amount)} ${escapeHtml(item.unit)}` : '(Recipe)'}
                            </span>
                        </div>
                        <button class="remove-item-btn" data-index="${index}" style="background: none; border: none; color: var(--accent-meat); cursor: pointer; font-size: 1.2rem; line-height: 1;">&times;</button>
                    </li>
                `).join('');

                document.querySelectorAll('.remove-item-btn').forEach(btn => {
                    btn.onclick = (e) => {
                        const idx = parseInt(e.target.dataset.index);
                        modalSelectedItems.splice(idx, 1);
                        renderModalSelectedItems();
                    };
                });
            }

            document.querySelectorAll('.mp-slot').forEach(slotEl => {
                slotEl.addEventListener('click', () => {
                    activeDate = slotEl.dataset.date;
                    activeSlotName = slotEl.dataset.slot;

                    assignTitle.textContent = `Plan ${activeSlotName.charAt(0).toUpperCase() + activeSlotName.slice(1)}`;
                    assignSubtitle.textContent = `For ${activeDate}`;

                    const existingPlan = mealPlans.find(p => p.date === activeDate && p.slot === activeSlotName);

                    // Reset modal state
                    searchInput.value = '';
                    suggestionsBox.style.display = 'none';
                    amountGroup.style.display = 'none';
                    currentStagedItem = null;
                    checkboxEatingOut.checked = false;
                    builderSection.style.opacity = '1';
                    builderSection.style.pointerEvents = 'auto';
                    servingsInput.value = 2;
                    servingsRow.style.opacity = '1';
                    servingsRow.style.pointerEvents = 'auto';

                    // Reset copy-to-days checkboxes; auto-check the current day
                    const currentDayIdx = (new Date(activeDate + 'T00:00:00')).getDay();
                    // Convert JS getDay (0=Sun) to our checkbox order (0=Mon...6=Sun)
                    const mappedIdx = currentDayIdx === 0 ? 6 : currentDayIdx - 1;
                    copyDayCheckboxes.forEach(cb => {
                        cb.checked = false;
                        cb.disabled = (parseInt(cb.value) === mappedIdx);
                        if (parseInt(cb.value) === mappedIdx) {
                            cb.closest('label').style.opacity = '0.4';
                        } else {
                            cb.closest('label').style.opacity = '1';
                        }
                    });

                    renderTemplateChips();

                    // Populate eater checkboxes from profiles
                    const eatersList = document.getElementById('meal-assign-eaters-list');
                    if (eatersList) {
                        const eaters = (appSettings.profiles && appSettings.profiles.length) ? appSettings.profiles : [{ name: 'User', calories: 2000, carbs: 40, protein: 30, fat: 30 }];
                        eatersList.innerHTML = eaters.map((p, i) => `
                            <label style="display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; cursor: pointer;">
                                <input type="checkbox" class="meal-eater-cb" value="${i}" ${existingPlan && (existingPlan.eaters || []).includes(i) ? 'checked' : ''} style="accent-color: var(--primary); width: 15px; height: 15px; cursor: pointer;">
                                <span>${escapeHtml(p.name)}</span>
                            </label>
                        `).join('');
                    }

                    if (existingPlan) {
                        btnClear.style.display = 'block';
                        if (existingPlan.isEatingOut) {
                            checkboxEatingOut.checked = true;
                            builderSection.style.opacity = '0.5';
                            builderSection.style.pointerEvents = 'none';
                            servingsRow.style.opacity = '0.5';
                            servingsRow.style.pointerEvents = 'none';
                            modalSelectedItems = [];
                        } else {
                            modalSelectedItems = JSON.parse(JSON.stringify(existingPlan.items || []));
                            servingsInput.value = existingPlan.servings || 1;
                            // Backwards compatibility for old data model
                            if (existingPlan.type === 'recipe') {
                                const r = recipes.find(rec => rec.id === existingPlan.referenceId);
                                if (r && modalSelectedItems.length === 0) {
                                    modalSelectedItems.push({ type: 'recipe', referenceId: r.id, name: r.title });
                                }
                            }
                        }
                    } else {
                        btnClear.style.display = 'none';
                        modalSelectedItems = [];
                    }

                    renderModalSelectedItems();
                    assignModal.classList.add('active');
                });
            });

            // Toggle Eating Out
            checkboxEatingOut.onchange = (e) => {
                if (e.target.checked) {
                    builderSection.style.opacity = '0.5';
                    builderSection.style.pointerEvents = 'none';
                    servingsRow.style.opacity = '0.5';
                    servingsRow.style.pointerEvents = 'none';
                } else {
                    builderSection.style.opacity = '1';
                    builderSection.style.pointerEvents = 'auto';
                    servingsRow.style.opacity = '1';
                    servingsRow.style.pointerEvents = 'auto';
                }
            };
            
            // Servings +/- buttons
            servingsDecrement.onclick = () => {
                const cur = parseInt(servingsInput.value) || 1;
                if (cur > 1) servingsInput.value = cur - 1;
            };
            servingsIncrement.onclick = () => {
                const cur = parseInt(servingsInput.value) || 1;
                if (cur < 20) servingsInput.value = cur + 1;
            };
            
            // Autocomplete Search
            searchInput.oninput = (e) => {
                const query = e.target.value.toLowerCase();
                if (!query) {
                    suggestionsBox.style.display = 'none';
                    return;
                }

                // Read macro filters
                const maxCal = parseFloat(document.getElementById('meal-assign-max-cal')?.value) || 0;
                const minPro = parseFloat(document.getElementById('meal-assign-min-pro')?.value) || 0;
                const maxCarb = parseFloat(document.getElementById('meal-assign-max-carb')?.value) || 0;
                const maxFat = parseFloat(document.getElementById('meal-assign-max-fat')?.value) || 0;

                const matchesMacros = (r) => {
                    const m = recipeMacros(r);
                    if (maxCal && m.energy > maxCal) return false;
                    if (minPro && m.protein < minPro) return false;
                    if (maxCarb && m.carbs > maxCarb) return false;
                    if (maxFat && m.fat > maxFat) return false;
                    return true;
                };

                const matchedRecipes = recipes.filter(r => r.title.toLowerCase().includes(query) && matchesMacros(r)).map(r => ({ ...r, _type: 'recipe' }));
                const matchedIngredients = ingredients.filter(i => i.name.toLowerCase().includes(query)).map(i => ({ ...i, _type: 'ingredient' }));
                
                const combined = [...matchedRecipes, ...matchedIngredients].slice(0, 15); // Top 15
                
                if (combined.length === 0) {
                    suggestionsBox.innerHTML = '<div style="padding: 0.8rem; color: var(--text-muted); font-size: 0.85rem;">No results found.</div>';
                } else {
                    suggestionsBox.innerHTML = combined.map((item, idx) => `
                        <div class="autocomplete-item" data-idx="${idx}" style="padding: 0.8rem; border-bottom: 1px solid var(--border); cursor: pointer; font-size: 0.85rem;">
                            <span style="font-weight: 600;">${escapeHtml(item._type === 'recipe' ? item.title : item.name)}</span>
                            <span style="float: right; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">${item._type}</span>
                        </div>
                    `).join('');
                    
                    document.querySelectorAll('.autocomplete-item').forEach(el => {
                        el.onclick = () => {
                            const selected = combined[parseInt(el.dataset.idx)];
                            searchInput.value = selected._type === 'recipe' ? selected.title : selected.name;
                            suggestionsBox.style.display = 'none';
                            
                            currentStagedItem = {
                                type: selected._type,
                                referenceId: selected._type === 'recipe' ? selected.id : selected.foodId,
                                name: selected._type === 'recipe' ? selected.title : selected.name,
                                unit: selected._type === 'ingredient' ? (selected.servingUnit || 'g') : null
                            };
                            
                            if (selected._type === 'ingredient') {
                                unitLabel.textContent = currentStagedItem.unit;
                                amountInput.value = '';
                                amountGroup.style.display = 'flex';
                            } else {
                                amountGroup.style.display = 'none';
                                // Auto-add recipe
                                addBtnModal.click();
                            }
                        };
                    });
                }
                suggestionsBox.style.display = 'block';
            };
            
            // Hide autocomplete on click outside
            document.addEventListener('click', (e) => {
                if (e.target !== searchInput && e.target !== suggestionsBox) {
                    suggestionsBox.style.display = 'none';
                }
            });
            
            // Add item to slot list
            addBtnModal.onclick = () => {
                if (!currentStagedItem) return;
                
                if (currentStagedItem.type === 'ingredient') {
                    const amt = parseFloat(amountInput.value);
                    if (!amt || amt <= 0) {
                        alert('Please enter a valid amount.');
                        return;
                    }
                    currentStagedItem.amount = amt;
                }
                
                modalSelectedItems.push({ ...currentStagedItem });
                renderModalSelectedItems();
                
                // Reset inputs
                searchInput.value = '';
                amountInput.value = '';
                amountGroup.style.display = 'none';
                currentStagedItem = null;
            };
            
            btnCancel.onclick = () => {
                assignModal.classList.remove('active');
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

                // Collect selected eaters
                const selectedEaters = [];
                document.querySelectorAll('.meal-eater-cb').forEach(cb => {
                    if (cb.checked) selectedEaters.push(parseInt(cb.value));
                });

                // Collect all target dates: the active date + any checked copy-to days
                const targetDates = [activeDate];
                copyDayCheckboxes.forEach(cb => {
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
                    
                    if (checkboxEatingOut.checked) {
                        mealPlans.push({
                            id: 'mp_' + Date.now().toString(36) + Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2),
                            date: dateStr,
                            slot: activeSlotName,
                            isEatingOut: true,
                            items: [],
                            eaters: selectedEaters,
                            servings: 1,
                            isConsumed: false
                        });
                    } else if (modalSelectedItems.length > 0) {
                        mealPlans.push({
                            id: 'mp_' + Date.now().toString(36) + Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2),
                            date: dateStr,
                            slot: activeSlotName,
                            isEatingOut: false,
                            items: JSON.parse(JSON.stringify(modalSelectedItems)),
                            eaters: selectedEaters,
                            servings: parseInt(servingsInput.value) || 1,
                            isConsumed: false
                        });
                    }
                });
                
                assignModal.classList.remove('active');
                renderCMSList();
            };
            
            // Save logic
            document.getElementById('save-mealplan-btn').onclick = async () => {
                try {
                    const res = await fetch('/api/mealplans', {
                        method: 'PUT',
                        headers: HEADERS,
                        body: JSON.stringify(mealPlans)
                    });
                    if (!res.ok) throw new Error('Save failed');
                    statusText.innerHTML = `<span class="status-dot"></span> Saved Meal Plan`;
                } catch(e) {
                    alert('Save failed. Is the server running?');
                }
            };
            
            return;
        }

        if (currentCMSTab === 'pantry') {
            const filteredIngredients = ingredients.filter(ing => 
                ing.name.toLowerCase().includes(cmsSearchQuery) || 
                (ing.category && ing.category.toLowerCase().includes(cmsSearchQuery))
            );

            const cardsHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.75rem;">
                    <div style="color: var(--text-secondary); font-size: 0.9rem;">
                        Click a card's status badge to track its stock. Tracked items are subtracted from shopping lists automatically.
                    </div>
                </div>
                <div class="vd-pantry-grid" id="pantry-grid">
                    ${filteredIngredients.length === 0 ? `<div class="empty-state">No ingredients match. Add ingredients first.</div>` : ''}
                    ${filteredIngredients.map((ing) => {
                        const pItem = pantry.find(p => p.foodId === ing.foodId) || { isTracked: false, quantity: 0 };
                        const qty = pItem.quantity || 0;
                        const unit = ing.servingUnit || 'g';
                        const isTracked = !!pItem.isTracked;
                        let statusClass = 'not-tracked';
                        let statusLabel = 'Not Tracked';
                        if (isTracked) {
                            if (qty <= 0) { statusClass = 'out-of-stock'; statusLabel = 'Out of Stock'; }
                            else if (qty < 10) { statusClass = 'low-stock'; statusLabel = 'Low Stock'; }
                            else { statusClass = 'in-stock'; statusLabel = 'In Stock'; }
                        }
                        const pct = !isTracked ? 0 : Math.min(100, Math.round((qty / 100) * 100));
                        const vis = getCategoryIcon(ing.category);
                        const unitLabel = unit || 'g';
                        return `
                        <div class="vd-pantry-card" data-foodid="${escapeHtml(ing.foodId)}">
                            <div class="vd-pantry-header">
                                <div class="vd-pantry-icon">
                                    <svg viewBox="${vis.vb}" style="width:22px;height:${vis.h}px;fill:${vis.accent};"><use href="${vis.href}"></use></svg>
                                </div>
                                <button type="button" class="vd-pantry-status ${statusClass} p-track" role="checkbox" aria-checked="${isTracked ? 'true' : 'false'}" style="border: none; cursor: pointer;">${statusLabel}</button>
                            </div>
                            <div class="vd-pantry-info">
                                <h4>${escapeHtml(ing.name)}</h4>
                                <p>${escapeHtml(ing.category || 'Uncategorized')}</p>
                            </div>
                            <div class="vd-pantry-tracker">
                                <div class="vd-pantry-progress"><div class="vd-pantry-bar" style="width: ${pct}%;"></div></div>
                                <div style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
                                    <div style="display: flex; align-items: center; gap: 0.35rem;">
                                        <input type="number" step="any" min="0" class="p-qty" value="${qty}" ${!isTracked ? 'disabled' : ''} aria-label="Quantity" style="width: 64px; padding: 0.3rem 0.4rem; background: var(--bg-surface); border: 1px solid var(--border); color: var(--text-primary); border-radius: 6px; font-size: 0.85rem;">
                                        <span class="vd-pantry-qty" style="font-size: 0.75rem;">${escapeHtml(unitLabel)}</span>
                                    </div>
                                    <span class="vd-pantry-qty">${Math.round(qty)}${escapeHtml(unitLabel)} left</span>
                                </div>
                            </div>
                        </div>
                        `;
                    }).join('')}
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                    <button id="save-pantry-btn" class="btn primary"><i data-lucide="save" style="width: 16px; height: 16px;"></i> Save Pantry</button>
                </div>
            `;
            listContainer.innerHTML = cardsHTML;
            addBtn.style.display = 'none';

            // Toggle tracking via status badge; toggle quantity input accordingly
            function refreshTrackState(btn) {
                const card = btn.closest('.vd-pantry-card');
                const isTracked = btn.dataset.tracked === '1';
                const qtyInput = card.querySelector('.p-qty');
                if (isTracked) {
                    qtyInput.removeAttribute('disabled');
                } else {
                    qtyInput.setAttribute('disabled', 'true');
                }
            }
            document.querySelectorAll('.p-track').forEach(btn => {
                const card = btn.closest('.vd-pantry-card');
                const pItem = pantry.find(p => p.foodId === card.dataset.foodid);
                btn.dataset.tracked = (pItem && pItem.isTracked) ? '1' : '0';
                refreshTrackState(btn);
                btn.addEventListener('click', () => {
                    const wasTracked = btn.dataset.tracked === '1';
                    btn.dataset.tracked = wasTracked ? '0' : '1';
                    const isTracked = !wasTracked;
                    const qtyInput = btn.closest('.vd-pantry-card').querySelector('.p-qty');
                    if (isTracked) {
                        btn.textContent = qtyInput.value > 0 ? 'In Stock' : 'Low Stock';
                        btn.className = 'vd-pantry-status ' + (qtyInput.value > 0 ? 'in-stock' : 'low-stock') + ' p-track';
                        qtyInput.removeAttribute('disabled');
                    } else {
                        btn.textContent = 'Not Tracked';
                        btn.className = 'vd-pantry-status not-tracked p-track';
                        qtyInput.setAttribute('disabled', 'true');
                    }
                    btn.setAttribute('aria-checked', isTracked ? 'true' : 'false');
                    refreshTrackState(btn);
                });
            });

            document.getElementById('save-pantry-btn').addEventListener('click', async () => {
                const cards = document.querySelectorAll('#pantry-grid .vd-pantry-card');
                const updatedPantry = [];

                cards.forEach(card => {
                    const foodId = card.dataset.foodid;
                    const btn = card.querySelector('.p-track');
                    const isTracked = btn.dataset.tracked === '1';
                    const quantity = parseFloat(card.querySelector('.p-qty').value) || 0;

                    if (isTracked || quantity > 0) {
                        updatedPantry.push({ foodId, isTracked, quantity });
                    }
                });

                pantry = updatedPantry;
                try {
                    const res = await fetch('/api/pantry', {
                        method: 'PUT',
                        headers: HEADERS,
                        body: JSON.stringify(pantry)
                    });
                    if (!res.ok) throw new Error('Save failed');
                    statusText.innerHTML = `<span class="status-dot"></span> Saved pantry`;
                } catch(e) {
                    alert('Save failed. Is the server running?');
                }
            });
            return;
        }

        if (currentCMSTab === 'shopping') {
            const uiHTML = `
                <div style="display: flex; gap: 1rem; margin-bottom: 2rem; align-items: center;">
                    <button id="generate-list-btn" class="btn primary">Generate List for This Week</button>
                    <span style="color: var(--text-muted); font-size: 0.85rem;">(Aggregates ingredients from planned recipes and subtracts tracked pantry stock)</span>
                </div>
                <div id="shopping-list-results" style="display: grid; gap: 1rem;">
                    <!-- Results render here -->
                    <div class="empty-state">Click "Generate" to calculate your shopping needs.</div>
                </div>
            `;
            listContainer.innerHTML = uiHTML;
            addBtn.style.display = 'none';

            function generateList() {
                // 1. Determine "this week" range based on current calendar logic
                const today = new Date();
                const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - dayOfWeek + 1);
                
                const validDates = [];
                for (let i = 0; i < 7; i++) {
                    const d = new Date(startOfWeek);
                    d.setDate(startOfWeek.getDate() + i);
                    validDates.push(d.toISOString().split('T')[0]);
                }

                // 2. Filter meal plans for this week (and ignore eating_out)
                const targetPlans = mealPlans.filter(p => validDates.includes(p.date) && !p.isEatingOut && p.type !== 'eating_out');
                
                // 3. Aggregate required ingredients
                const requiredMap = new Map(); // foodId -> { name, requiredQty, unit, recipes:Set }
                
                targetPlans.forEach(plan => {
                    const servingsMultiplier = plan.servings || 1;
                    
                    // Parse an amount string like "320g", "125ml", "1 tsp", "2 1/2 cups" into { qty, unit }
                    const parseAmount = (str) => {
                        if (typeof str === 'number') return { qty: str, unit: 'g' };
                        if (!str) return { qty: 0, unit: 'g' };
                        const m = str.trim().match(/^([\d\s./-]+)\s*([a-zA-Zµ]+)?$/);
                        if (!m) return { qty: 0, unit: 'g' };
                        let qty = 0;
                        const parts = m[1].trim().split(/[\s-]+/);
                        for (const part of parts) {
                            if (!part) continue;
                            if (part.includes('/')) {
                                const frac = part.split('/');
                                qty += (parseFloat(frac[0]) || 0) / (parseFloat(frac[1]) || 1);
                            } else {
                                qty += parseFloat(part) || 0;
                            }
                        }
                        return { qty, unit: m[2] || 'g' };
                    };
                    
                    // Backwards compatibility for old format
                    let itemsToProcess = plan.items || [];
                    if (itemsToProcess.length === 0 && plan.type === 'recipe') {
                        itemsToProcess.push({ type: 'recipe', referenceId: plan.referenceId });
                    }
                    
                    itemsToProcess.forEach(item => {
                        if (item.type === 'recipe') {
                            const recipe = recipes.find(r => r.id === item.referenceId);
                            if (!recipe || !recipe.ingredients) return;
                            
                            recipe.ingredients.forEach(ing => {
                                if (!ing.foodId) return;
                                
                                const parsed = parseAmount(ing.metric || ing.amount);
                                const scaledAmount = parsed.qty * servingsMultiplier;
                                const existing = requiredMap.get(ing.foodId);
                                if (existing) {
                                    existing.requiredQty += scaledAmount;
                                    if (recipe.title) existing.recipes.add(recipe.title);
                                } else {
                                    const foodRef = ingredients.find(f => f.foodId === ing.foodId);
                                    requiredMap.set(ing.foodId, {
                                        name: foodRef ? foodRef.name : (ing.item || ing.name || 'Unknown'),
                                        requiredQty: scaledAmount,
                                        unit: parsed.unit,
                                        recipes: recipe.title ? new Set([recipe.title]) : new Set()
                                    });
                                }
                            });
                        } else if (item.type === 'ingredient' && item.referenceId) {
                            const scaledAmount = (parseFloat(item.amount) || 0) * servingsMultiplier;
                            const existing = requiredMap.get(item.referenceId);
                            if (existing) {
                                existing.requiredQty += scaledAmount;
                            } else {
                                const foodRef = ingredients.find(f => f.foodId === item.referenceId);
                                requiredMap.set(item.referenceId, {
                                    name: foodRef ? foodRef.name : item.name,
                                    requiredQty: scaledAmount,
                                    unit: item.unit || 'g',
                                    recipes: new Set()
                                });
                            }
                        }
                    });
                });

                // 4. Subtract Tracked Pantry Stock
                const shoppingList = [];
                requiredMap.forEach((data, foodId) => {
                    const pantryItem = pantry.find(p => p.foodId === foodId);
                    let deficit = data.requiredQty;
                    
                    if (pantryItem && pantryItem.isTracked) {
                        deficit -= (parseFloat(pantryItem.quantity) || 0);
                    }
                    
                    if (deficit > 0) {
                        const foodRef = ingredients.find(f => f.foodId === foodId);
                        shoppingList.push({
                            foodId,
                            name: data.name,
                            amount: Math.ceil(deficit),
                            unit: data.unit,
                            category: (foodRef && foodRef.category) || 'Other',
                            recipes: Array.from(data.recipes || []),
                            checked: false
                        });
                    }
                });

                return shoppingList.sort((a, b) => a.name.localeCompare(b.name));
            }

            document.getElementById('generate-list-btn').onclick = () => {
                const list = generateList();
                const resultsContainer = document.getElementById('shopping-list-results');
                
                if (list.length === 0) {
                    resultsContainer.innerHTML = `<div class="empty-state">Nothing to buy! You either have no meals planned, or your pantry is fully stocked.</div>`;
                    return;
                }

                // Group items by category
                const groups = {};
                list.forEach(item => {
                    const cat = item.category || 'Other';
                    if (!groups[cat]) groups[cat] = [];
                    groups[cat].push(item);
                });

                let listHTML = `<div class="vd-shop-container">`;
                Object.entries(groups).forEach(([cat, items]) => {
                    listHTML += `<div class="vd-shop-group">`;
                    listHTML += `
                        <div class="vd-shop-group-header">
                            <i data-lucide="shopping-basket" style="width: 16px; height: 16px;"></i> ${escapeHtml(cat)}
                        </div>`;
                    items.forEach((item) => {
                        const recipeTags = (item.recipes || []).slice(0, 3).map(r => `
                            <span class="vd-shop-recipe-tag"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> ${escapeHtml(r)}</span>
                        `).join('');
                        listHTML += `
                        <div class="vd-shop-item" data-foodid="${escapeHtml(item.foodId)}">
                            <div class="vd-shop-checkbox" role="checkbox" tabindex="0"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                            <div class="vd-shop-item-details">
                                <div class="vd-shop-item-title">${escapeHtml(item.name)}</div>
                                <div class="vd-shop-item-meta">
                                    <span class="vd-shop-qty">${escapeHtml(item.amount)} ${escapeHtml(item.unit)}</span>
                                    ${recipeTags}
                                </div>
                            </div>
                        </div>`;
                    });
                    listHTML += `</div>`;
                });
                listHTML += `</div>`;
                resultsContainer.innerHTML = listHTML;
                if (window.lucide) window.lucide.createIcons();

                // Toggle check state
                document.querySelectorAll('.vd-shop-item').forEach(row => {
                    const checkbox = row.querySelector('.vd-shop-checkbox');
                    checkbox.addEventListener('click', () => {
                        row.classList.toggle('checked');
                        checkbox.setAttribute('aria-checked', row.classList.contains('checked') ? 'true' : 'false');
                    });
                    checkbox.addEventListener('keydown', (e) => {
                        if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            checkbox.click();
                        }
                    });
                });
            };
            
            return;
        }

        if (currentCMSTab === 'food') {
            const filteredIngredients = ingredients.filter(ing =>
                ing.name.toLowerCase().includes(cmsSearchQuery) ||
                (ing.category && ing.category.toLowerCase().includes(cmsSearchQuery))
            );

            if (filteredIngredients.length === 0) {
                listContainer.innerHTML = `<div class="empty-state">No ingredients found. Click "Add Ingredient" to create one!</div>`;
                addBtn.style.display = 'none';
                return;
            }

            listContainer.innerHTML = `
                <div class="cms-table-wrapper">
                    <table class="cms-table">
                        <thead>
                            <tr>
                                <th>Ingredient</th>
                                <th style="width: 240px;">Category</th>
                                <th style="width: 130px;">Status</th>
                                <th style="width: 110px; text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredIngredients.map(ing => {
                                const vis = getCategoryIcon(ing.category);
                                const serving = `${ing.servingSizeG ? ing.servingSizeG : ''}${ing.servingUnit || 'g'} serving`;
                                return `
                                <tr>
                                    <td>
                                        <div class="cms-td-title">
                                            <div class="cms-td-icon">
                                                <svg viewBox="${vis.vb}" style="width:${vis.w}px;height:${vis.h}px;fill:${vis.accent};"><use href="${vis.href}"></use></svg>
                                            </div>
                                            <div>
                                                <div>${escapeHtml(ing.name || 'Unnamed ingredient')}</div>
                                                <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">${escapeHtml(serving)}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>${escapeHtml(ing.category || '—')}</td>
                                    <td><span class="cms-badge published">Published</span></td>
                                    <td class="cms-actions-cell">
                                        <button class="cms-btn-icon food-edit-btn" data-id="${escapeHtml(ing.foodId)}" title="Edit"><i data-lucide="edit-2"></i></button>
                                        <button class="cms-btn-icon delete food-delete-btn" data-id="${escapeHtml(ing.foodId)}" title="Delete"><i data-lucide="trash-2"></i></button>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                    <button id="add-food-btn" class="btn primary"><i data-lucide="plus" style="width: 16px; height: 16px;"></i> Add Ingredient</button>
                </div>
            `;
            addBtn.style.display = 'none';
            if (window.lucide) window.lucide.createIcons();

            document.getElementById('add-food-btn').addEventListener('click', () => openProfileEditor());

            document.querySelectorAll('.food-edit-btn').forEach(btn => {
                btn.addEventListener('click', () => openProfileEditor(btn.dataset.id));
            });

            document.querySelectorAll('.food-delete-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
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
                        <div class="vd-settings-nav-item" data-settings-view="data"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Data</div>
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
                            <p class="vd-settings-desc">Configure daily calorie and macro targets for meal planning.</p>
                            <div id="profiles-list" style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.25rem;">
                                ${profiles.length === 0 ? '<p style="color: var(--text-muted); font-size: 0.9rem;">No eaters yet. Add one to get started.</p>' : ''}
                                ${profiles.map((p, i) => `
                                    <div class="profile-card" style="background: var(--bg-base); padding: 1.25rem; border-radius: 12px; border: 1px solid var(--border);">
                                        <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end;">
                                            <div class="form-group"><label>Name</label><input type="text" value="${escapeHtml(p.name)}" class="profile-input" data-index="${i}" data-field="name" style="width: 150px;"></div>
                                            <div class="form-group"><label>Calories / day</label><input type="number" value="${p.calories ?? 2000}" class="profile-input" data-index="${i}" data-field="calories" style="width: 110px;"></div>
                                            <div class="form-group"><label>Carbs %</label><input type="number" value="${p.carbs ?? 40}" class="profile-input" data-index="${i}" data-field="carbs" style="width: 90px;"></div>
                                            <div class="form-group"><label>Protein %</label><input type="number" value="${p.protein ?? 30}" class="profile-input" data-index="${i}" data-field="protein" style="width: 90px;"></div>
                                            <div class="form-group"><label>Fat %</label><input type="number" value="${p.fat ?? 30}" class="profile-input" data-index="${i}" data-field="fat" style="width: 90px;"></div>
                                            <button class="btn delete-profile-btn" data-index="${i}" title="Remove eater" aria-label="Remove eater" style="margin-left: auto; padding: 0.5rem; background: var(--bg-hover); color: var(--text-muted);"><i data-lucide="trash-2" style="width: 16px; height: 16px;"></i></button>
                                        </div>
                                    </div>
                                `).join('')}
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
                        input.onchange = (e) => {
                            const idx = e.target.dataset.index;
                            const field = e.target.dataset.field;
                            let val = e.target.value;
                            if (field !== 'name') val = parseFloat(val) || 0;
                            appSettings.profiles[idx][field] = val;
                        };
                    });

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

                if (view === 'data') {
                    settingsPanel.innerHTML = `
                        <div class="vd-settings-section">
                            <h3 class="vd-settings-title">Data Management</h3>
                            <p class="vd-settings-desc">Export a full backup of your recipes, ingredients, meal plans, pantry, shopping lists, and settings — or restore them from a backup file.</p>
                            <div style="display: flex; gap: 1rem; margin-top: 1rem; flex-wrap: wrap;">
                                <button class="btn secondary" id="export-data-btn"><i data-lucide="download" style="width: 16px; height: 16px;"></i> Export Data (ZIP)</button>
                                <label class="btn secondary" style="cursor: pointer; display: inline-flex; align-items: center; gap: 0.5rem;">
                                    <i data-lucide="upload" style="width: 16px; height: 16px;"></i> Import Data (ZIP)
                                    <input type="file" id="import-zip-input" accept=".zip" style="display: none;">
                                </label>
                            </div>
                            <p id="import-status" style="margin-top: 0.75rem; font-size: 0.8rem;"></p>
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
                            a.download = 'larder_backup.zip';
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            URL.revokeObjectURL(url);
                            statusText.innerHTML = `<span class="status-dot"></span> Export downloaded.`;
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
                    alert('Failed to save settings.');
                });
            }

            renderSettingsPanel('eaters');

            document.querySelectorAll('.vd-settings-nav-item').forEach(item => {
                item.addEventListener('click', () => renderSettingsPanel(item.dataset.settingsView));
            });

            return;
        }

        addBtn.style.display = 'block';
        addBtn.innerHTML = '<i data-lucide="plus" style="width: 18px; height: 18px;"></i> Add Recipe';
        let filtered = recipes.filter(r => r.entryType !== 'ingredient');

        if (cmsSearchQuery) {
            filtered = filtered.filter(r =>
                (r.title || '').toLowerCase().includes(cmsSearchQuery) ||
                (r.category || '').toLowerCase().includes(cmsSearchQuery) ||
                (r.description || '').toLowerCase().includes(cmsSearchQuery)
            );
        }

        if (filtered.length === 0) {
            listContainer.innerHTML = `<div class="empty-state">No recipes yet. Click "Add Recipe" to start!</div>`;
            return;
        }

        listContainer.innerHTML = `
            <div class="cms-table-wrapper">
                <table class="cms-table">
                    <thead>
                        <tr>
                            <th>Title & Category</th>
                            <th style="width: 100px;">Servings</th>
                            <th style="width: 120px;">Energy</th>
                            <th style="width: 130px;">Status</th>
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
                            <tr>
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
                                    <button class="cms-btn-icon edit-btn" data-id="${escapeHtml(recipe.id)}" title="Edit"><i data-lucide="edit-2"></i></button>
                                    <button class="cms-btn-icon delete delete-btn" data-id="${escapeHtml(recipe.id)}" title="Delete"><i data-lucide="trash-2"></i></button>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;

        if (window.lucide) window.lucide.createIcons();

        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => openEditor(btn.dataset.id));
        });
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
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
        openEditor();
    });

    // --- Ingredient Rows ---
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
        div.innerHTML = `
            <div class="cms-unit-group">
                <input type="text" data-field="metric-num" value="${escapeHtml(m.num)}" placeholder="Amount">
                <select data-field="metric-unit">${metricUnits.map(u => `<option${m.unit === u ? ' selected' : ''}>${u}</option>`).join('')}</select>
            </div>
            <input type="text" data-field="name" class="seamless-input" list="ingredient-suggestions" value="${escapeHtml(String(item))}" placeholder="Ingredient name" style="font-weight: 500; font-size: 0.95rem;">
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
        div.querySelector('.delete').addEventListener('click', () => div.remove());

        // Auto-fill foodId based on item name
        const nameInput = div.querySelector('[data-field="name"]');
        nameInput.addEventListener('change', () => {
            if (!div.dataset.foodId) {
                const guess = slugify(nameInput.value);
                if (ingredients.some(f => f.foodId === guess)) {
                    div.dataset.foodId = guess;
                }
            }
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

    // --- Recipe Editor ---
    function openEditor(id = null) {
        ingContainer.innerHTML = '';
        stepsContainer.innerHTML = '';

        if (id) {
            const recipe = recipes.find(r => r.id === id);
            document.getElementById('recipe-id').value = recipe.id;
            document.getElementById('recipe-title').value = recipe.title;
            document.getElementById('recipe-category').value = recipe.category || 'Default';
            document.getElementById('recipe-time').value = recipe.time || '';
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
            } else {
                document.getElementById('macro-reference').value = 'per_serving';
                macroRefSelect.dispatchEvent(new Event('change'));
                setMacroField('macro-energy', '', 'kCal');
                setMacroField('macro-carbs', '', 'g');
                setMacroField('macro-protein', '', 'g');
                setMacroField('macro-fat', '', 'g');
                document.getElementById('macro-yield').value = '';
            }

            if (recipe.ingredients?.length > 0) {
                recipe.ingredients.forEach(ing => createIngredientRow(ing.item, ing.metric, ing.imperial, ing.foodId || ''));
            } else {
                createIngredientRow();
            }

            (recipe.steps || []).forEach(step => createStepRow(step));
            document.getElementById('recipe-note').value = recipe.note || '';
            document.getElementById('recipe-variations').value = recipe.variations || '';
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
            if (cmsDeleteBtn) cmsDeleteBtn.style.display = 'none';
        }
        if (window.lucide) window.lucide.createIcons();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

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
            time: document.getElementById('recipe-time').value,
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
                fat: getMacroValue('macro-fat', 'g')
            },
            ingredients: recipeIngredients,
            steps,
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
        document.getElementById('profile-calories').value = (ing && ing.calories) || '';
        document.getElementById('profile-proteinG').value = (ing && ing.proteinG) || '';
        document.getElementById('profile-fatG').value = (ing && ing.fatG) || '';
        document.getElementById('profile-carbsG').value = (ing && ing.carbsG) || '';

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

        // Pricing
        document.getElementById('profile-averagePrice').value = (ing && ing.averagePrice) || '';
        document.getElementById('profile-priceCurrency').value = (ing && ing.priceCurrency) || 'MUR';

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
                sugarG: 0
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
        ingredients[idx].magnesiumMg = parseFloat(document.getElementById('profile-magnesiumMg').value) || 0;
        ingredients[idx].phosphorusMg = parseFloat(document.getElementById('profile-phosphorusMg').value) || 0;
        ingredients[idx].potassiumMg = parseFloat(document.getElementById('profile-potassiumMg').value) || 0;
        ingredients[idx].sodiumMg = parseFloat(document.getElementById('profile-sodiumMg').value) || 0;
        ingredients[idx].zincMg = parseFloat(document.getElementById('profile-zincMg').value) || 0;
        ingredients[idx].copperMg = parseFloat(document.getElementById('profile-copperMg').value) || 0;
        ingredients[idx].seleniumMcg = parseFloat(document.getElementById('profile-seleniumMcg').value) || 0;

        // Pricing
        ingredients[idx].averagePrice = parseFloat(document.getElementById('profile-averagePrice').value) || 0;
        ingredients[idx].priceCurrency = document.getElementById('profile-priceCurrency').value.trim() || 'MUR';

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
        } 
    });
});
