document.addEventListener('DOMContentLoaded', () => {
    const addBtn = document.getElementById('add-recipe-btn');
    const statusText = document.getElementById('status-text');
    const listContainer = document.getElementById('cms-recipe-list');
    
    // Recipe Modal
    const modal = document.getElementById('cms-editor-modal');
    const form = document.getElementById('recipe-form');
    const closeBtn = modal.querySelector('.cms-close');
    const editorTitle = document.getElementById('editor-title');
    const ingContainer = document.getElementById('ingredients-container');
    const addIngBtn = document.getElementById('add-ing-btn');
    const macroRefSelect = document.getElementById('macro-reference');
    const macroRefAmountGroup = document.getElementById('macro-ref-amount-group');
    const recipeFieldsGroup = document.getElementById('recipe-fields-group');

    // Ingredient Profile Modal
    const foodModal = document.getElementById('cms-food-modal');
    const profileForm = document.getElementById('ingredient-profile-form');
    const foodCloseBtn = foodModal.querySelector('.food-close');
    const foodEditorTitle = document.getElementById('food-editor-title');

    function slugify(name) {
        return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
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
            confirmDialog.classList.remove('hidden');
            document.body.style.overflow = 'hidden';

            function cleanup() {
                confirmDialog.classList.add('hidden');
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

    async function loadData() {
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
            appSettings = Array.isArray(resSettings) ? { profiles: [] } : resSettings;
            if (!appSettings.profiles) appSettings.profiles = [];
            
            statusText.innerHTML = `<span class="status-dot"></span> Connected · ${recipes.length} recipes · ${ingredients.length} ingredients`;
            addBtn.classList.remove('hidden');
            if (cmsTabs) cmsTabs.classList.remove('hidden');
            renderCMSList();
        } catch(e) {
            statusText.textContent = '⚠ Could not connect. Run: node server.js';
            statusText.style.color = '#D1777D';
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
        datalist.innerHTML = ingredients.map(f => `<option value="${f.name}">`).join('');
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

        if (currentCMSTab === 'settings') {
            addBtn.style.display = 'none';
            if (searchInput) searchInput.style.display = 'none';
            
            listContainer.innerHTML = `
                <div class="settings-container" style="max-width: 800px; margin: 0 auto; padding: 2rem;">
                    <h2>Eater Profiles</h2>
                    <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Configure daily macro targets for meal planning.</p>
                    <div id="profiles-list" style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem;">
                        ${appSettings.profiles.map((p, i) => `
                            <div class="profile-card" style="background: var(--bg-card); padding: 1rem; border-radius: 8px; border: 1px solid var(--border);">
                                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                                    <div class="form-group"><label>Name</label><input type="text" value="${p.name}" class="profile-input" data-index="${i}" data-field="name" style="width: 150px;"></div>
                                    <div class="form-group"><label>Calories</label><input type="number" value="${p.calories}" class="profile-input" data-index="${i}" data-field="calories" style="width: 100px;"></div>
                                    <div class="form-group"><label>Carbs (%)</label><input type="number" value="${p.carbs}" class="profile-input" data-index="${i}" data-field="carbs" style="width: 100px;"></div>
                                    <div class="form-group"><label>Protein (%)</label><input type="number" value="${p.protein}" class="profile-input" data-index="${i}" data-field="protein" style="width: 100px;"></div>
                                    <div class="form-group"><label>Fat (%)</label><input type="number" value="${p.fat}" class="profile-input" data-index="${i}" data-field="fat" style="width: 100px;"></div>
                                    <button class="btn delete-profile-btn" data-index="${i}" style="margin-top: auto; padding: 0.5rem; background: var(--bg-hover); color: var(--text-muted);">🗑</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn secondary" id="add-profile-btn">+ Add Eater</button>
                    <div style="margin-top: 1rem;">
                        <button class="btn primary" id="save-settings-btn">Save Profiles</button>
                    </div>

                    <h2 style="margin-top: 3rem; border-top: 1px solid var(--border); padding-top: 2rem;">Data Management</h2>
                    <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                        <a href="/api/export" class="btn secondary" download="larder_backup.zip">Export Data (ZIP)</a>
                        <label class="btn secondary" style="cursor: pointer;">
                            Import Data (ZIP)
                            <input type="file" id="import-zip-input" accept=".zip" style="display: none;">
                        </label>
                    </div>
                    <p id="import-status" style="margin-top: 0.5rem; font-size: 0.8rem;"></p>
                </div>
            `;
            
            document.getElementById('add-profile-btn').onclick = () => {
                appSettings.profiles.push({ name: "New Eater", calories: 2000, carbs: 40, protein: 30, fat: 30 });
                renderCMSList();
            };
            
            document.querySelectorAll('.delete-profile-btn').forEach(btn => {
                btn.onclick = () => {
                    appSettings.profiles.splice(btn.dataset.index, 1);
                    renderCMSList();
                };
            });
            
            document.querySelectorAll('.profile-input').forEach(input => {
                input.onchange = (e) => {
                    const idx = e.target.dataset.index;
                    const field = e.target.dataset.field;
                    let val = e.target.value;
                    if (field !== 'name') val = parseInt(val) || 0;
                    appSettings.profiles[idx][field] = val;
                };
            });
            
            document.getElementById('save-settings-btn').onclick = async () => {
                try {
                    const res = await fetch('/api/settings', {
                        method: 'PUT',
                        headers: HEADERS,
                        body: JSON.stringify(appSettings)
                    });
                    if (res.ok) alert('Settings saved successfully.');
                    else throw new Error();
                } catch(e) {
                    alert('Failed to save settings.');
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
                        body: file
                    });
                    if (res.ok) {
                        importStatus.textContent = "Import successful! Reloading data...";
                        importStatus.style.color = "var(--success-color, #4ade80)";
                        setTimeout(() => window.location.reload(), 1500);
                    } else {
                        throw new Error("Server rejected import.");
                    }
                } catch(err) {
                    importStatus.textContent = "Import failed. Invalid ZIP?";
                    importStatus.style.color = "var(--danger-color, #f87171)";
                }
            };
            
            return;
        }

        if (currentCMSTab === 'mealplan') {
            const slots = ['breakfast', 'lunch', 'dinner', 'snack'];
            const today = new Date();
            const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // Make Monday=1, Sunday=7
            
            // Get Monday of current week
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - dayOfWeek + 1);
            
            let gridHTML = '<div class="calendar-grid">';
            
            for (let i = 0; i < 7; i++) {
                const currentDate = new Date(startOfWeek);
                currentDate.setDate(startOfWeek.getDate() + i);
                const dateString = currentDate.toISOString().split('T')[0];
                const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'short' });
                const formattedDate = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                
                gridHTML += `
                <div class="calendar-day">
                    <div class="calendar-day-header">
                        ${dayName}
                        <span class="calendar-day-date">${formattedDate}</span>
                    </div>
                `;
                
                slots.forEach(slot => {
                    const plan = mealPlans.find(p => p.date === dateString && p.slot === slot);
                    
                    let slotClass = '';
                    let slotText = '';
                    
                    if (plan) {
                        if (plan.isEatingOut || plan.type === 'eating_out') {
                            slotClass = 'slot-eating-out';
                            slotText = 'Eating Out';
                        } else {
                            slotClass = 'slot-populated';
                            const servingsLabel = plan.servings && plan.servings !== 1 ? `<span style="font-size: 0.55rem; color: var(--text-muted); display: block; margin-top: 2px;">×${plan.servings} servings</span>` : '';
                            
                            // Support old data model
                            if (plan.type === 'recipe') {
                                const r = recipes.find(rec => rec.id === plan.referenceId);
                                slotText = (r ? r.title : 'Unknown Recipe') + servingsLabel;
                            } else if (plan.items && plan.items.length > 0) {
                                // New multi-item model
                                const names = plan.items.map(item => item.name);
                                if (names.length <= 2) {
                                    slotText = names.join('<br>') + servingsLabel;
                                } else {
                                    slotText = names.slice(0, 2).join('<br>') + `<br><span style="font-size: 0.6rem; color: var(--text-muted);">+${names.length - 2} more</span>` + servingsLabel;
                                }
                            }
                        }
                    }
                    
                    gridHTML += `
                    <div class="calendar-slot ${slotClass}" data-date="${dateString}" data-slot="${slot}">
                        <div class="calendar-slot-label">${slot}</div>
                        <div class="calendar-slot-content">${slotText}</div>
                    </div>
                    `;
                });
                
                // Calculate Daily Macros
                let dailyCals = 0, dailyPro = 0, dailyCarbs = 0, dailyFat = 0;
                let targetCals = 0, targetPro = 0, targetCarbs = 0, targetFat = 0;
                
                // Only compute targets for active eaters on this day
                const eatersThisDay = new Set();
                
                slots.forEach(slot => {
                    const plan = mealPlans.find(p => p.date === dateString && p.slot === slot);
                    if (plan && !plan.isEatingOut && plan.items) {
                        if (plan.eaters) plan.eaters.forEach(e => eatersThisDay.add(e));
                        
                        plan.items.forEach(item => {
                            const getVal = (valStr) => {
                                if (!valStr) return 0;
                                if (typeof valStr === 'number') return valStr;
                                const m = String(valStr).match(/^([\d.]+)/);
                                return m ? parseFloat(m[1]) : 0;
                            };
                            
                            const addMacros = (r, mult) => {
                                if (r.macros) {
                                    dailyCals += getVal(r.macros.energy) * mult;
                                    dailyPro += getVal(r.macros.protein) * mult;
                                    dailyCarbs += getVal(r.macros.carbohydrate) * mult;
                                    dailyFat += getVal(r.macros.fat) * mult;
                                } else {
                                    dailyCals += getVal(r.calories) * mult;
                                    dailyPro += getVal(r.proteinG) * mult;
                                    dailyCarbs += getVal(r.carbsG) * mult;
                                    dailyFat += getVal(r.fatG) * mult;
                                }
                            };
                            
                            const multiplier = plan.eaters ? plan.eaters.length : 1;
                            
                            if (item.type === 'recipe') {
                                const r = recipes.find(rec => rec.id === item.referenceId);
                                if (r) addMacros(r, multiplier);
                            } else if (item.type === 'ingredient') {
                                const i = ingredients.find(ing => ing.foodId === item.referenceId);
                                if (i) addMacros(i, (parseFloat(item.amount) || 100) / 100 * multiplier);
                            }
                        });
                    }
                });
                
                eatersThisDay.forEach(eName => {
                    const profile = appSettings.profiles.find(p => p.name === eName);
                    if (profile) {
                        targetCals += profile.calories;
                        targetCarbs += Math.round((profile.calories * (profile.carbs/100)) / 4);
                        targetPro += Math.round((profile.calories * (profile.protein/100)) / 4);
                        targetFat += Math.round((profile.calories * (profile.fat/100)) / 9);
                    }
                });
                
                const pct = targetCals > 0 ? Math.min(100, (dailyCals / targetCals) * 100) : 0;
                const calColor = pct > 105 ? 'var(--danger-color, #f87171)' : (pct > 90 ? 'var(--success-color, #4ade80)' : 'var(--text-muted)');
                
                if (targetCals > 0) {
                    gridHTML += `
                    <div style="margin-top: 0.5rem; padding: 0.5rem; background: var(--bg-hover); border-radius: 4px; border: 1px solid var(--border); font-size: 0.7rem; color: var(--text-secondary);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                            <span style="font-weight: 600;">Cals:</span>
                            <span style="color: ${calColor}">${Math.round(dailyCals)} / ${targetCals}</span>
                        </div>
                        <div style="width: 100%; height: 4px; background: var(--bg-base); border-radius: 2px; margin-bottom: 0.5rem;">
                            <div style="width: ${pct}%; height: 100%; background: ${calColor}; border-radius: 2px;"></div>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.65rem;">
                            <span>P: ${Math.round(dailyPro)}/${targetPro}g</span>
                            <span>C: ${Math.round(dailyCarbs)}/${targetCarbs}g</span>
                            <span>F: ${Math.round(dailyFat)}/${targetFat}g</span>
                        </div>
                    </div>
                    `;
                }
                
                gridHTML += `</div>`; // Close day
            gridHTML += '</div>';
            gridHTML += `
                <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                    <button id="save-mealplan-btn" class="btn primary">Save Plan</button>
                </div>
            `;
            
            listContainer.innerHTML = gridHTML;
            addBtn.style.display = 'none';
            
            // Attach slot click handlers
            const assignModal = document.getElementById('meal-assign-modal');
            const assignTitle = document.getElementById('meal-assign-title');
            const assignSubtitle = document.getElementById('meal-assign-subtitle');
            
            const checkboxEatingOut = document.getElementById('meal-assign-eating-out');
            const builderSection = document.getElementById('meal-assign-builder');
            
            const eatersRow = document.getElementById('meal-assign-eaters-row');
            const eatersList = document.getElementById('meal-assign-eaters-list');
            
            const searchInput = document.getElementById('meal-assign-search');
            const maxCalInput = document.getElementById('meal-assign-max-cal');
            const minProInput = document.getElementById('meal-assign-min-pro');
            const maxCarbInput = document.getElementById('meal-assign-max-carb');
            const maxFatInput = document.getElementById('meal-assign-max-fat');
            

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
                        <span class="template-chip-name" data-idx="${idx}" style="font-weight: 600;">${t.name}</span>
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
                        // Setup eaters from template
                        if (t.eaters) {
                            document.querySelectorAll('.eater-cb').forEach(cb => {
                                cb.checked = t.eaters.includes(cb.value);
                            });
                        }
                        checkboxEatingOut.checked = false;
                        builderSection.style.opacity = '1';
                        builderSection.style.pointerEvents = 'auto';
                        eatersRow.style.opacity = '1';
                        eatersRow.style.pointerEvents = 'auto';
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
                const selectedEaters = Array.from(document.querySelectorAll('.eater-cb:checked')).map(cb => cb.value);
                mealTemplates.push({
                    name: name.trim(),
                    items: JSON.parse(JSON.stringify(modalSelectedItems)),
                    eaters: selectedEaters,
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
                            <span style="font-weight: 600; color: var(--text-primary);">${item.name}</span>
                            <span style="color: var(--text-muted); margin-left: 0.5rem;">
                                ${item.type === 'ingredient' ? `${item.amount} ${item.unit}` : '(Recipe)'}
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
            
            document.querySelectorAll('.calendar-slot').forEach(slotEl => {
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
                    eatersList.innerHTML = appSettings.profiles.map(p => `
                        <label style="display: flex; align-items: center; gap: 0.3rem; font-size: 0.85rem; cursor: pointer;">
                            <input type="checkbox" class="eater-cb" value="${p.name}" style="accent-color: var(--accent); width: 16px; height: 16px;" checked>
                            ${p.name}
                        </label>
                    `).join('');
                    
                    eatersRow.style.opacity = '1';
                    eatersRow.style.pointerEvents = 'auto';
                    
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
                    
                    if (existingPlan) {
                        btnClear.style.display = 'block';
                        if (existingPlan.isEatingOut) {
                            checkboxEatingOut.checked = true;
                            builderSection.style.opacity = '0.5';
                            builderSection.style.pointerEvents = 'none';
                            eatersRow.style.opacity = '0.5';
                            eatersRow.style.pointerEvents = 'none';
                            modalSelectedItems = [];
                        } else {
                            modalSelectedItems = JSON.parse(JSON.stringify(existingPlan.items || []));
                            if (existingPlan.eaters) {
                                document.querySelectorAll('.eater-cb').forEach(cb => {
                                    cb.checked = existingPlan.eaters.includes(cb.value);
                                });
                            }
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
                    assignModal.classList.remove('hidden');
                });
            });

            // Toggle Eating Out
            checkboxEatingOut.onchange = (e) => {
                if (e.target.checked) {
                    builderSection.style.opacity = '0.5';
                    builderSection.style.pointerEvents = 'none';
                    eatersRow.style.opacity = '0.5';
                    eatersRow.style.pointerEvents = 'none';
                } else {
                    builderSection.style.opacity = '1';
                    builderSection.style.pointerEvents = 'auto';
                    eatersRow.style.opacity = '1';
                    eatersRow.style.pointerEvents = 'auto';
                }
            };
            
            const handleSearch = () => {
                const query = searchInput.value.toLowerCase();
                const maxCal = parseFloat(maxCalInput.value) || Infinity;
                const minPro = parseFloat(minProInput.value) || 0;
                const maxCarb = parseFloat(maxCarbInput.value) || Infinity;
                const maxFat = parseFloat(maxFatInput.value) || Infinity;

                if (!query && maxCal === Infinity && minPro === 0 && maxCarb === Infinity && maxFat === Infinity) {
                    suggestionsBox.style.display = 'none';
                    return;
                }
                
                const getEnergy = r => r.macros?.energy || r.calories || 0;
                const getPro = r => {
                    if (r.proteinG !== undefined) return r.proteinG;
                    const p = r.macros?.protein?.match(/[\d.]+/);
                    return p ? parseFloat(p[0]) : 0;
                };
                const getCarb = r => {
                    if (r.carbsG !== undefined) return r.carbsG;
                    const p = r.macros?.carbohydrate?.match(/[\d.]+/);
                    return p ? parseFloat(p[0]) : 0;
                };
                const getFat = r => {
                    if (r.fatG !== undefined) return r.fatG;
                    const p = r.macros?.fat?.match(/[\d.]+/);
                    return p ? parseFloat(p[0]) : 0;
                };

                let matchedRecipes = recipes.filter(r => 
                    r.title.toLowerCase().includes(query) &&
                    getEnergy(r) <= maxCal && getPro(r) >= minPro && getCarb(r) <= maxCarb && getFat(r) <= maxFat
                ).map(r => ({ ...r, _type: 'recipe' }));
                let matchedIngredients = ingredients.filter(r => 
                    (r.name || r.title).toLowerCase().includes(query) &&
                    getEnergy(r) <= maxCal && getPro(r) >= minPro && getCarb(r) <= maxCarb && getFat(r) <= maxFat
                ).map(i => ({ ...i, _type: 'ingredient' }));
                
                const combined = [...matchedRecipes, ...matchedIngredients].slice(0, 15);
                
                if (combined.length === 0) {
                    suggestionsBox.innerHTML = '<div style="padding: 0.8rem; color: var(--text-muted); font-size: 0.85rem;">No results found.</div>';
                } else {
                    suggestionsBox.innerHTML = combined.map((item, idx) => `
                        <div class="autocomplete-item" data-idx="${idx}" style="padding: 0.8rem; border-bottom: 1px solid var(--border); cursor: pointer; font-size: 0.85rem;">
                            <span style="font-weight: 600;">${item._type === 'recipe' ? (item.title || item.name) : item.name}</span>
                            <span style="float: right; color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase;">${item._type}</span>
                        </div>
                    `).join('');
                    
                    document.querySelectorAll('.autocomplete-item').forEach(el => {
                        el.onclick = () => {
                            const selected = combined[parseInt(el.dataset.idx)];
                            searchInput.value = selected._type === 'recipe' ? (selected.title || selected.name) : selected.name;
                            suggestionsBox.style.display = 'none';
                            
                            currentStagedItem = {
                                type: selected._type,
                                referenceId: selected._type === 'recipe' ? selected.id : selected.foodId,
                                name: selected._type === 'recipe' ? (selected.title || selected.name) : selected.name,
                                unit: selected._type === 'ingredient' ? (selected.servingUnit || 'g') : null
                            };
                            
                            if (selected._type === 'ingredient') {
                                unitLabel.textContent = currentStagedItem.unit;
                                amountInput.value = '';
                                amountGroup.style.display = 'flex';
                            } else {
                                amountGroup.style.display = 'none';
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
                assignModal.classList.add('hidden');
            };
            
            btnClear.onclick = () => {
                mealPlans = mealPlans.filter(p => !(p.date === activeDate && p.slot === activeSlotName));
                assignModal.classList.add('hidden');
                renderCMSList();
            };
            
            btnConfirm.onclick = () => {
                const today = new Date();
                const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - dayOfWeek + 1);
                
                const targetDates = [activeDate];
                copyDayCheckboxes.forEach(cb => {
                    if (cb.checked && !cb.disabled) {
                        const d = new Date(startOfWeek);
                        d.setDate(startOfWeek.getDate() + parseInt(cb.value));
                        const ds = d.toISOString().split('T')[0];
                        if (!targetDates.includes(ds)) targetDates.push(ds);
                    }
                });
                
                targetDates.forEach(dateStr => {
                    mealPlans = mealPlans.filter(p => !(p.date === dateStr && p.slot === activeSlotName));
                    
                    mealPlans.push({
                        id: crypto.randomUUID(),
                        date: dateStr,
                        slot: activeSlotName,
                        type: 'multi',
                        items: JSON.parse(JSON.stringify(modalSelectedItems)),
                        eaters: Array.from(document.querySelectorAll('.eater-cb:checked')).map(cb => cb.value),
                        isEatingOut: checkboxEatingOut.checked
                    });
                });
                
                assignModal.classList.add('hidden');
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

            const tableHTML = `
                <div style="margin-bottom: 1rem; color: var(--text-secondary); font-size: 0.9rem;">
                    Check "Tracked" to actively subtract these items from your shopping lists based on stock.
                </div>
                <div style="overflow-x: auto; margin-bottom: 1rem;">
                    <table class="food-table">
                        <thead>
                            <tr>
                                <th style="width: 8%; text-align: center;">Tracked</th>
                                <th style="width: 40%;">Ingredient</th>
                                <th style="width: 15%;">Stock Qty</th>
                                <th style="width: 10%;">Unit</th>
                                <th>Category</th>
                            </tr>
                        </thead>
                        <tbody id="pantry-table-body">
                            ${filteredIngredients.length === 0 ? `<tr><td colspan="5" style="text-align: center; padding: 1rem;">No ingredients match.</td></tr>` : ''}
                            ${filteredIngredients.map((ing, i) => {
                                const pItem = pantry.find(p => p.foodId === ing.foodId) || { isTracked: false, quantity: 0 };
                                return `
                                <tr data-foodid="${ing.foodId}">
                                    <td style="text-align: center;"><input type="checkbox" class="p-track f-select" ${pItem.isTracked ? 'checked' : ''}></td>
                                    <td style="font-weight: 600;">${ing.name}</td>
                                    <td><input type="number" step="any" class="p-qty" value="${pItem.quantity}" ${!pItem.isTracked ? 'disabled opacity="0.5"' : ''}></td>
                                    <td style="color: var(--text-muted);">${ing.servingUnit || 'g'}</td>
                                    <td style="color: var(--text-muted);">${ing.category || ''}</td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                    <button id="save-pantry-btn" class="btn primary">Save Pantry</button>
                </div>
            `;
            listContainer.innerHTML = tableHTML;
            addBtn.style.display = 'none';

            // Toggle quantity input based on track checkbox
            document.querySelectorAll('.p-track').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const row = e.target.closest('tr');
                    const qtyInput = row.querySelector('.p-qty');
                    if (e.target.checked) {
                        qtyInput.removeAttribute('disabled');
                        qtyInput.style.opacity = '1';
                    } else {
                        qtyInput.setAttribute('disabled', 'true');
                        qtyInput.style.opacity = '0.5';
                    }
                });
            });

            document.getElementById('save-pantry-btn').addEventListener('click', async () => {
                const rows = document.querySelectorAll('#pantry-table-body tr[data-foodid]');
                const updatedPantry = [];

                rows.forEach(row => {
                    const foodId = row.dataset.foodid;
                    const isTracked = row.querySelector('.p-track').checked;
                    const quantity = parseFloat(row.querySelector('.p-qty').value) || 0;
                    
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

                const targetPlans = mealPlans.filter(p => validDates.includes(p.date) && !p.isEatingOut);
                
                const requiredMap = new Map(); 
                
                targetPlans.forEach(plan => {
                    let itemsToProcess = plan.items || [];
                    
                    itemsToProcess.forEach(item => {
                        if (item.type === 'recipe') {
                            const recipe = recipes.find(r => r.id === item.referenceId);
                            if (!recipe || !recipe.ingredients) return;
                            
                            recipe.ingredients.forEach(ing => {
                                if (!ing.foodId) return;
                                
                                const scaledAmount = parseFloat(ing.amount) || 0;
                                const existing = requiredMap.get(ing.foodId);
                                if (existing) {
                                    existing.requiredQty += scaledAmount;
                                } else {
                                    const foodRef = ingredients.find(f => f.foodId === ing.foodId);
                                    requiredMap.set(ing.foodId, {
                                        name: foodRef ? foodRef.name : (ing.name || 'Unknown'),
                                        requiredQty: scaledAmount,
                                        unit: ing.unit || 'g'
                                    });
                                }
                            });
                        } else if (item.type === 'ingredient' && item.referenceId) {
                            const scaledAmount = parseFloat(item.amount) || 0;
                            const existing = requiredMap.get(item.referenceId);
                            if (existing) {
                                existing.requiredQty += scaledAmount;
                            } else {
                                const foodRef = ingredients.find(f => f.foodId === item.referenceId);
                                requiredMap.set(item.referenceId, {
                                    name: foodRef ? foodRef.name : item.name,
                                    requiredQty: scaledAmount,
                                    unit: item.unit || 'g'
                                });
                            }
                        }
                    });
                });

                const shoppingList = [];
                requiredMap.forEach((data, foodId) => {
                    const pantryItem = pantry.find(p => p.foodId === foodId);
                    let deficit = data.requiredQty;
                    
                    if (pantryItem && pantryItem.isTracked) {
                        deficit -= (parseFloat(pantryItem.quantity) || 0);
                    }
                    
                    if (deficit > 0) {
                        shoppingList.push({
                            foodId,
                            name: data.name,
                            amount: Math.ceil(deficit),
                            unit: data.unit,
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
                
                let listHTML = `
                <div style="background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: 1rem;">
                    <h3 style="margin-top: 0; color: var(--text-primary); border-bottom: 1px solid var(--border); padding-bottom: 0.5rem;">Shopping List</h3>
                    <ul style="list-style: none; padding: 0; margin: 0;">
                `;
                
                list.forEach((item, index) => {
                    listHTML += `
                        <li style="padding: 0.8rem 0; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 1rem;">
                            <input type="checkbox" class="sl-checkbox f-select" id="sl-item-${index}">
                            <label for="sl-item-${index}" style="cursor: pointer; flex: 1; font-weight: 600;">${item.name}</label>
                            <span style="color: var(--text-secondary);">${item.amount} ${item.unit}</span>
                        </li>
                    `;
                });
                
                listHTML += `</ul></div>`;
                resultsContainer.innerHTML = listHTML;
                
                document.querySelectorAll('.sl-checkbox').forEach(cb => {
                    cb.addEventListener('change', (e) => {
                        const label = e.target.nextElementSibling;
                        const qty = label.nextElementSibling;
                        if (e.target.checked) {
                            label.style.textDecoration = 'line-through';
                            label.style.color = 'var(--text-muted)';
                            qty.style.textDecoration = 'line-through';
                            qty.style.color = 'var(--text-muted)';
                        } else {
                            label.style.textDecoration = 'none';
                            label.style.color = 'inherit';
                            qty.style.textDecoration = 'none';
                            qty.style.color = 'var(--text-secondary)';
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

            const tableHTML = `
                <div id="bulk-action-bar" class="bulk-action-bar" style="display:none;">
                    <span class="selected-count" id="selected-count">0</span> selected
                    <button id="delete-selected-btn" class="btn danger" style="padding: 0.3rem 0.8rem; font-size: 0.8rem;">Delete Selected</button>
                </div>
                <div style="overflow-x: auto; margin-bottom: 1rem;">
                    <table class="food-table">
                        <thead>
                            <tr>
                                <th class="select-col"><input type="checkbox" class="f-select" id="select-all-foods" title="Select all"></th>
                                <th style="width: 15%;">Name</th>
                                <th style="width: 12%;">ID</th>
                                <th style="width: 10%;">Category</th>
                                <th style="width: 6%;">Size</th>
                                <th style="width: 5%;">Unit</th>
                                <th style="width: 6%;">kCal</th>
                                <th style="width: 6%;">Protein</th>
                                <th style="width: 6%;">Fat</th>
                                <th style="width: 6%;">Carbs</th>
                                <th style="width: 6%;">Fiber</th>
                                <th style="width: 6%;">Sugar</th>
                                <th>Notes</th>
                                <th style="width: 6%;"></th>
                            </tr>
                        </thead>
                        <tbody id="food-table-body">
                            ${filteredIngredients.length === 0 ? `<tr><td colspan="14" style="text-align: center; padding: 1rem;">No ingredients match.</td></tr>` : ''}
                            ${filteredIngredients.map((ing, i) => `
                                <tr data-index="${ingredients.indexOf(ing)}">
                                    <td class="select-col"><input type="checkbox" class="f-select f-row-select" data-index="${ingredients.indexOf(ing)}"></td>
                                    <td><input type="text" class="f-name" value="${(ing.name || '').replace(/"/g, '&quot;')}"></td>
                                    <td><input type="text" class="f-id" value="${(ing.foodId || '').replace(/"/g, '&quot;')}" placeholder="auto"></td>
                                    <td><input type="text" class="f-cat" value="${(ing.category || '').replace(/"/g, '&quot;')}"></td>
                                    <td><input type="number" step="any" class="f-size" value="${ing.servingSizeG || 0}"></td>
                                    <td><input type="text" class="f-unit" value="${(ing.servingUnit || 'g').replace(/"/g, '&quot;')}"></td>
                                    <td><input type="number" step="any" class="f-kcal" value="${ing.calories || 0}"></td>
                                    <td><input type="number" step="any" class="f-pro" value="${ing.proteinG || 0}"></td>
                                    <td><input type="number" step="any" class="f-fat" value="${ing.fatG || 0}"></td>
                                    <td><input type="number" step="any" class="f-carbs" value="${ing.carbsG || 0}"></td>
                                    <td><input type="number" step="any" class="f-fiber" value="${ing.fiberG || 0}"></td>
                                    <td><input type="number" step="any" class="f-sugar" value="${ing.sugarG || 0}"></td>
                                    <td><input type="text" class="f-notes" value="${(ing.notes || '').replace(/"/g, '&quot;')}"></td>
                                    <td style="text-align: center; white-space: nowrap;">
                                        <button class="btn secondary edit-profile-btn" data-id="${ing.foodId}" style="padding: 0.2rem 0.4rem; font-size: 0.75rem;" title="Edit culinary profile">📝</button>
                                        <button class="btn danger delete-food-row" data-index="${i}" style="padding: 0.2rem 0.5rem;">&times;</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                    <button id="add-food-row-btn" class="btn secondary">+ Add Row</button>
                    <button id="save-foods-btn" class="btn primary">Save Changes</button>
                </div>
            `;
            listContainer.innerHTML = tableHTML;
            addBtn.style.display = 'none';

            document.getElementById('add-food-row-btn').addEventListener('click', () => {
                ingredients.push({
                    name: '', foodId: '', category: '', servingSizeG: 100, servingUnit: 'g',
                    calories: 0, proteinG: 0, fatG: 0, carbsG: 0, fiberG: 0, sugarG: 0, notes: ''
                });
                renderCMSList();
            });

            document.getElementById('save-foods-btn').addEventListener('click', async () => {
                const rows = document.querySelectorAll('#food-table-body tr[data-index]');
                const updatedIngredients = [];
                let hasError = false;

                rows.forEach(row => {
                    const name = row.querySelector('.f-name').value.trim();
                    let foodId = row.querySelector('.f-id').value.trim();
                    if (!name) return;
                    if (!foodId) foodId = slugify(name);
                    
                    if (updatedIngredients.some(f => f.foodId === foodId)) {
                        alert(`Duplicate ID found: ${foodId}. Please fix.`);
                        hasError = true;
                    }

                    const existing = ingredients.find(f => f.foodId === foodId);

                    updatedIngredients.push({
                        ...(existing || {}),
                        foodId: foodId,
                        name: name,
                        category: row.querySelector('.f-cat').value.trim(),
                        servingSizeG: parseFloat(row.querySelector('.f-size').value) || 0,
                        servingUnit: row.querySelector('.f-unit').value.trim() || 'g',
                        calories: parseFloat(row.querySelector('.f-kcal').value) || 0,
                        proteinG: parseFloat(row.querySelector('.f-pro').value) || 0,
                        fatG: parseFloat(row.querySelector('.f-fat').value) || 0,
                        carbsG: parseFloat(row.querySelector('.f-carbs').value) || 0,
                        fiberG: parseFloat(row.querySelector('.f-fiber').value) || 0,
                        sugarG: parseFloat(row.querySelector('.f-sugar').value) || 0,
                        notes: row.querySelector('.f-notes').value.trim(),
                    });
                });

                if (hasError) return;
                
                ingredients = updatedIngredients;
                await saveIngredients();
                renderCMSList();
            });

            searchInput.oninput = handleSearch;
            maxCalInput.oninput = handleSearch;
            minProInput.oninput = handleSearch;
            maxCarbInput.oninput = handleSearch;
            maxFatInput.oninput = handleSearch;

            const selectAllCheckbox = document.getElementById('select-all-foods');
            const rowCheckboxes = document.querySelectorAll('.f-row-select');
            const bulkActionBar = document.getElementById('bulk-action-bar');
            const selectedCountSpan = document.getElementById('selected-count');
            
            function updateBulkActionBar() {
                const checkedCount = document.querySelectorAll('.f-row-select:checked').length;
                selectedCountSpan.textContent = checkedCount;
                bulkActionBar.style.display = checkedCount > 0 ? 'flex' : 'none';
                selectAllCheckbox.checked = checkedCount > 0 && checkedCount === rowCheckboxes.length;
            }

            selectAllCheckbox.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                rowCheckboxes.forEach(cb => cb.checked = isChecked);
                updateBulkActionBar();
            });

            rowCheckboxes.forEach(cb => {
                cb.addEventListener('change', updateBulkActionBar);
            });

            document.getElementById('delete-selected-btn').addEventListener('click', async () => {
                const checkedBoxes = Array.from(document.querySelectorAll('.f-row-select:checked'));
                if (checkedBoxes.length === 0) return;
                
                const confirmed = await showConfirmDialog(
                    'Delete Selected',
                    `Are you sure you want to delete ${checkedBoxes.length} ingredient(s)? This action cannot be undone.`,
                    `Delete ${checkedBoxes.length} Items`
                );
                
                if (confirmed) {
                    // Collect indices to delete in reverse order to avoid shifting issues
                    const indicesToDelete = checkedBoxes
                        .map(cb => parseInt(cb.dataset.index, 10))
                        .sort((a, b) => b - a);
                        
                    indicesToDelete.forEach(index => {
                        ingredients.splice(index, 1);
                    });
                    
                    renderCMSList();
                    // Auto-save when items are deleted? The original logic didn't, but let's leave it as is 
                    // (the user must click Save Changes, just like single row delete).
                }
            });

            document.querySelectorAll('.delete-food-row').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const row = e.target.closest('tr');
                    const index = parseInt(row.dataset.index, 10);
                    const name = row.querySelector('.f-name').value || 'this ingredient';
                    
                    const confirmed = await showConfirmDialog(
                        'Delete Ingredient',
                        `Are you sure you want to delete "${name}"?`,
                        'Delete'
                    );
                    
                    if (confirmed) {
                        ingredients.splice(index, 1);
                        renderCMSList();
                    }
                });
            });

            document.querySelectorAll('.f-name').forEach(input => {
                input.addEventListener('change', (e) => {
                    const row = e.target.closest('tr');
                    const idInput = row.querySelector('.f-id');
                    if (!idInput.value.trim()) {
                        idInput.value = slugify(e.target.value);
                    }
                });
            });

            document.querySelectorAll('.edit-profile-btn').forEach(btn => {
                btn.addEventListener('click', () => openProfileEditor(btn.dataset.id));
            });
            return;
        }

        addBtn.style.display = 'block';
        addBtn.textContent = '+ Add Recipe';
        let filtered = recipes.filter(r => r.entryType !== 'ingredient');

        if (filtered.length === 0) {
            listContainer.innerHTML = `<div class="empty-state">No recipes yet. Click "+ Add Recipe" to start!</div>`;
            return;
        }

        listContainer.innerHTML = filtered.map(recipe => {
            const theme = `theme-${recipe.category ? recipe.category.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ')[0] : 'default'}`;
            return `
            <div class="cms-recipe-item ${theme}">
                <div>
                    <span style="font-size: 0.7rem; font-weight: 700; color: var(--accent-current, var(--accent-default)); letter-spacing: 2px; text-transform: uppercase; display: block; margin-bottom: 0.3rem;">${recipe.category || 'Recipe'}</span>
                    <strong style="font-size: 1.1rem; font-weight: 600;">${recipe.title}</strong>
                </div>
                <div class="cms-recipe-actions">
                    <button class="btn secondary edit-btn" data-id="${recipe.id}">Edit</button>
                    <button class="btn danger delete-btn" data-id="${recipe.id}">Delete</button>
                </div>
            </div>`;
        }).join('');

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
        const div = document.createElement('div');
        div.className = 'cms-ing-row form-row';
        div.innerHTML = `
            <div class="form-group" style="flex: 2;"><input type="text" list="ingredient-suggestions" placeholder="Item name" value="${item.replace(/"/g, '&quot;')}"></div>
            <div class="form-group" style="flex: 1;"><input type="text" placeholder="foodId" required value="${foodId.replace(/"/g, '&quot;')}"></div>
            <div class="form-group" style="flex: 1;"><input type="text" placeholder="Metric" value="${metric.replace(/"/g, '&quot;')}"></div>
            <div class="form-group" style="flex: 1;"><input type="text" placeholder="Imperial" value="${imperial.replace(/"/g, '&quot;')}"></div>
            <div class="form-group" style="flex: 0 0 auto;"><button type="button" class="btn danger">&times;</button></div>
        `;
        div.querySelector('.btn.danger').addEventListener('click', () => div.remove());
        
        // Auto-fill foodId based on item name
        const nameInput = div.querySelectorAll('input')[0];
        const foodIdInput = div.querySelectorAll('input')[1];
        nameInput.addEventListener('change', () => {
            if (!foodIdInput.value) {
                const guess = slugify(nameInput.value);
                if (ingredients.some(f => f.foodId === guess)) {
                    foodIdInput.value = guess;
                }
            }
        });

        ingContainer.appendChild(div);
    }

    addIngBtn.addEventListener('click', () => createIngredientRow());

    // --- Recipe Editor ---
    function openEditor(id = null) {
        ingContainer.innerHTML = '';

        if (id) {
            const recipe = recipes.find(r => r.id === id);
            editorTitle.textContent = 'Edit Recipe';
            document.getElementById('recipe-id').value = recipe.id;
            document.getElementById('recipe-title').value = recipe.title;
            document.getElementById('recipe-category').value = recipe.category || 'Default';
            document.getElementById('recipe-desc').value = recipe.description || '';
            document.getElementById('recipe-image').value = recipe.imageUrl || '';

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
                document.getElementById('macro-energy').value = recipe.macros.energy || '';
                document.getElementById('macro-carbs').value = recipe.macros.carbohydrate || '';
                document.getElementById('macro-protein').value = recipe.macros.protein || '';
                document.getElementById('macro-fat').value = recipe.macros.fat || '';
            } else {
                document.getElementById('macro-reference').value = 'per_serving';
                macroRefSelect.dispatchEvent(new Event('change'));
            }

            if (recipe.ingredients?.length > 0) {
                recipe.ingredients.forEach(ing => createIngredientRow(ing.item, ing.metric, ing.imperial, ing.foodId || ''));
            } else {
                createIngredientRow();
            }

            document.getElementById('recipe-steps').value = (recipe.steps || []).join('\n');
            document.getElementById('recipe-note').value = recipe.note || '';
            document.getElementById('recipe-variations').value = recipe.variations || '';
        } else {
            editorTitle.textContent = 'Add New Recipe';
            form.reset();
            document.getElementById('recipe-id').value = Date.now().toString();
            createIngredientRow();
        }
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const ingRows = Array.from(ingContainer.querySelectorAll('.cms-ing-row'));
        const recipeIngredients = ingRows.map(row => {
            const inputs = row.querySelectorAll('input');
            return { item: inputs[0].value, foodId: inputs[1].value, metric: inputs[2].value, imperial: inputs[3].value };
        }).filter(ing => ing.item.trim() !== '');

        // Validate foodIds
        for (let ing of recipeIngredients) {
            if (!ing.foodId || ing.foodId.trim() === '') {
                alert(`Missing foodId for ingredient: ${ing.item}`);
                return;
            }
        }

        const newRecipe = {
            id: document.getElementById('recipe-id').value,
            entryType: 'recipe',
            title: document.getElementById('recipe-title').value,
            category: document.getElementById('recipe-category').value,
            description: document.getElementById('recipe-desc').value,
            imageUrl: document.getElementById('recipe-image').value,
            macros: {
                macroReference: {
                    type: document.getElementById('macro-reference').value,
                    referenceAmount: document.getElementById('macro-ref-amount').value
                },
                yield: document.getElementById('macro-yield').value,
                energy: document.getElementById('macro-energy').value,
                carbohydrate: document.getElementById('macro-carbs').value,
                protein: document.getElementById('macro-protein').value,
                fat: document.getElementById('macro-fat').value
            },
            ingredients: recipeIngredients,
            steps: document.getElementById('recipe-steps').value.split('\n').filter(l => l.trim()),
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
        const ing = ingredients.find(f => f.foodId === foodId);
        if (!ing) {
            alert('Save your spreadsheet changes first before editing a profile.');
            return;
        }

        foodEditorTitle.textContent = `Edit Profile: ${ing.name}`;
        document.getElementById('profile-food-id').value = ing.foodId;
        document.getElementById('profile-description').value = ing.description || '';
        document.getElementById('profile-image').value = ing.imageUrl || '';

        const details = ing.ingredientDetails || {};
        document.getElementById('profile-storage').value = details.storage || '';
        document.getElementById('profile-flavour').value = details.flavour || '';
        document.getElementById('profile-pairings').value = details.pairings || '';
        document.getElementById('profile-varieties').value = details.varieties || '';
        document.getElementById('profile-preparations').value = details.preparations || '';

        // Vitamins
        document.getElementById('profile-vitaminAMcg').value = ing.vitaminAMcg || '';
        document.getElementById('profile-vitaminCMg').value = ing.vitaminCMg || '';
        document.getElementById('profile-vitaminDMcg').value = ing.vitaminDMcg || '';
        document.getElementById('profile-vitaminEMg').value = ing.vitaminEMg || '';
        document.getElementById('profile-vitaminKMcg').value = ing.vitaminKMcg || '';
        document.getElementById('profile-thiaminMg').value = ing.thiaminMg || '';
        document.getElementById('profile-riboflavinMg').value = ing.riboflavinMg || '';
        document.getElementById('profile-niacinMg').value = ing.niacinMg || '';
        document.getElementById('profile-vitaminB6Mg').value = ing.vitaminB6Mg || '';
        document.getElementById('profile-folateMcg').value = ing.folateMcg || '';
        document.getElementById('profile-vitaminB12Mcg').value = ing.vitaminB12Mcg || '';

        // Minerals
        document.getElementById('profile-calciumMg').value = ing.calciumMg || '';
        document.getElementById('profile-ironMg').value = ing.ironMg || '';
        document.getElementById('profile-magnesiumMg').value = ing.magnesiumMg || '';
        document.getElementById('profile-phosphorusMg').value = ing.phosphorusMg || '';
        document.getElementById('profile-potassiumMg').value = ing.potassiumMg || '';
        document.getElementById('profile-sodiumMg').value = ing.sodiumMg || '';
        document.getElementById('profile-zincMg').value = ing.zincMg || '';
        document.getElementById('profile-copperMg').value = ing.copperMg || '';
        document.getElementById('profile-seleniumMcg').value = ing.seleniumMcg || '';

        // Pricing
        document.getElementById('profile-averagePrice').value = ing.averagePrice || '';
        document.getElementById('profile-priceCurrency').value = ing.priceCurrency || 'MUR';

        foodModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const foodId = document.getElementById('profile-food-id').value;
        const idx = ingredients.findIndex(f => f.foodId === foodId);
        if (idx < 0) return;

        ingredients[idx].description = document.getElementById('profile-description').value.trim();
        ingredients[idx].imageUrl = document.getElementById('profile-image').value.trim();
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
        statusText.innerHTML = `<span class="status-dot"></span> Saved profile for ${ingredients[idx].name}`;
    });

    function closeModal() {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    function closeFoodModal() {
        foodModal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    foodCloseBtn.addEventListener('click', closeFoodModal);
    foodModal.addEventListener('click', (e) => { if (e.target === foodModal) closeFoodModal(); });
    
    document.addEventListener('keydown', (e) => { 
        if (e.key === 'Escape') {
            closeModal(); 
            closeFoodModal();
        } 
    });
});
