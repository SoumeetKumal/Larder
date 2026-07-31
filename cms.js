document.addEventListener('DOMContentLoaded', () => {
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

    async function loadData(retryCount = 0) {
        try {
            const [resRecipes, resIngredients, resMealPlans, resPantry, resShoppingLists] = await Promise.all([
                fetch('/api/recipes', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/ingredients', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/mealplans', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/pantry', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/shoppinglists', { headers: HEADERS }).then(r => r.ok ? r.json() : [])
            ]);
            recipes = resRecipes;
            ingredients = resIngredients;
            mealPlans = resMealPlans;
            pantry = resPantry;
            shoppingLists = resShoppingLists;
            
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
                
                gridHTML += `</div>`; // Close day
            }
            
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
                
                const matchedRecipes = recipes.filter(r => r.title.toLowerCase().includes(query)).map(r => ({ ...r, _type: 'recipe' }));
                const matchedIngredients = ingredients.filter(i => i.name.toLowerCase().includes(query)).map(i => ({ ...i, _type: 'ingredient' }));
                
                const combined = [...matchedRecipes, ...matchedIngredients].slice(0, 15); // Top 15
                
                if (combined.length === 0) {
                    suggestionsBox.innerHTML = '<div style="padding: 0.8rem; color: var(--text-muted); font-size: 0.85rem;">No results found.</div>';
                } else {
                    suggestionsBox.innerHTML = combined.map((item, idx) => `
                        <div class="autocomplete-item" data-idx="${idx}" style="padding: 0.8rem; border-bottom: 1px solid var(--border); cursor: pointer; font-size: 0.85rem;">
                            <span style="font-weight: 600;">${item._type === 'recipe' ? item.title : item.name}</span>
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
                // Build the list of dates to apply to
                const today = new Date();
                const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
                const startOfWeek = new Date(today);
                startOfWeek.setDate(today.getDate() - dayOfWeek + 1);
                
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
                const requiredMap = new Map(); // foodId -> { name, requiredQty, unit }
                
                targetPlans.forEach(plan => {
                    const servingsMultiplier = plan.servings || 1;
                    
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
                                
                                const scaledAmount = (parseFloat(ing.amount) || 0) * servingsMultiplier;
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
                            const scaledAmount = (parseFloat(item.amount) || 0) * servingsMultiplier;
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

                // 4. Subtract Tracked Pantry Stock
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
                
                // Strike-through logic
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
                                                <div>${ing.name || 'Unnamed ingredient'}</div>
                                                <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">${serving}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>${ing.category || '—'}</td>
                                    <td><span class="cms-badge published">Published</span></td>
                                    <td class="cms-actions-cell">
                                        <button class="cms-btn-icon food-edit-btn" data-id="${ing.foodId}" title="Edit"><i data-lucide="edit-2"></i></button>
                                        <button class="cms-btn-icon delete food-delete-btn" data-id="${ing.foodId}" title="Delete"><i data-lucide="trash-2"></i></button>
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
                                ? `<img class="cms-thumb" src="${recipe.imageUrl}" alt="">`
                                : `<svg viewBox="${vis.vb}" style="width:${vis.w}px;height:${vis.h}px;fill:${vis.accent};"><use href="${vis.href}"></use></svg>`;
                            return `
                            <tr>
                                <td>
                                    <div class="cms-td-title">
                                        <div class="cms-td-icon">${iconTile}</div>
                                        <div>
                                            <div>${recipe.title}</div>
                                            <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">${recipe.category || 'Recipe'}</div>
                                        </div>
                                    </div>
                                </td>
                                <td>${yieldNum || '—'}</td>
                                <td>${energyNum ? energyNum + ' kcal' : '—'}</td>
                                <td><span class="cms-badge published">Published</span></td>
                                <td class="cms-actions-cell">
                                    <button class="cms-btn-icon edit-btn" data-id="${recipe.id}" title="Edit"><i data-lucide="edit-2"></i></button>
                                    <button class="cms-btn-icon delete delete-btn" data-id="${recipe.id}" title="Delete"><i data-lucide="trash-2"></i></button>
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
                <input type="text" data-field="name" class="seamless-input" value="${String(item).replace(/^##\s*/, '').replace(/"/g, '&quot;')}" placeholder="Section header..." style="font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-main);">
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
                <input type="text" data-field="metric-num" value="${m.num.replace(/"/g, '&quot;')}" placeholder="Amount">
                <select data-field="metric-unit">${metricUnits.map(u => `<option${m.unit === u ? ' selected' : ''}>${u}</option>`).join('')}</select>
            </div>
            <input type="text" data-field="name" class="seamless-input" list="ingredient-suggestions" value="${String(item).replace(/"/g, '&quot;')}" placeholder="Ingredient name" style="font-weight: 500; font-size: 0.95rem;">
            <div class="cms-unit-group">
                <input type="text" data-field="imperial-num" value="${imp.num.replace(/"/g, '&quot;')}" placeholder="Amount">
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
                <input type="text" data-field="step" class="seamless-input" value="${String(text).replace(/^##\s*/, '').replace(/"/g, '&quot;')}" placeholder="Section header..." style="flex-grow: 1; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
                <button type="button" class="cms-btn-icon delete" aria-label="Remove section"><i data-lucide="x" style="width: 14px; height: 14px;"></i></button>
            `;
        } else {
            const num = stepsContainer.querySelectorAll('.cms-step-row textarea').length + 1;
            div.innerHTML = `
                <span class="step-number">${num}</span>
                <textarea class="seamless-input seamless-textarea" data-field="step" placeholder="Step..." style="min-height: 50px;">${String(text).replace(/"/g, '&quot;')}</textarea>
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
        statusText.innerHTML = `<span class="status-dot"></span> Saved profile for ${ingredients[idx].name}`;
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
