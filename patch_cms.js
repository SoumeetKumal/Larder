const fs = require('fs');
let code = fs.readFileSync('cms.js', 'utf8');

// 1. Add appSettings
code = code.replace('let shoppingLists = [];', 'let shoppingLists = [];\n    let appSettings = { profiles: [] };');

// 2. loadData Promise.all
code = code.replace(
    'const [resRecipes, resIngredients, resMealPlans, resPantry, resShoppingLists] = await Promise.all([', 
    'const [resRecipes, resIngredients, resMealPlans, resPantry, resShoppingLists, resSettings] = await Promise.all(['
);

code = code.replace(
    'fetch(\'/api/shoppinglists\', { headers: HEADERS }).then(r => r.ok ? r.json() : [])\n            ]);', 
    'fetch(\'/api/shoppinglists\', { headers: HEADERS }).then(r => r.ok ? r.json() : []),\n                fetch(\'/api/settings\', { headers: HEADERS }).then(r => r.ok ? r.json() : { profiles: [] })\n            ]);'
);

code = code.replace(
    'shoppingLists = resShoppingLists;', 
    'shoppingLists = resShoppingLists;\n            appSettings = Array.isArray(resSettings) ? { profiles: [] } : resSettings;\n            if (!appSettings.profiles) appSettings.profiles = [];'
);

// 3. Settings tab
const settingsCode = `
        if (currentCMSTab === 'settings') {
            addBtn.style.display = 'none';
            if (searchInput) searchInput.style.display = 'none';
            
            listContainer.innerHTML = \`
                <div class="settings-container" style="max-width: 800px; margin: 0 auto; padding: 2rem;">
                    <h2>Eater Profiles</h2>
                    <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Configure daily macro targets for meal planning.</p>
                    <div id="profiles-list" style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem;">
                        \${appSettings.profiles.map((p, i) => \`
                            <div class="profile-card" style="background: var(--bg-card); padding: 1rem; border-radius: 8px; border: 1px solid var(--border);">
                                <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
                                    <div class="form-group"><label>Name</label><input type="text" value="\${p.name}" class="profile-input" data-index="\${i}" data-field="name" style="width: 150px;"></div>
                                    <div class="form-group"><label>Calories</label><input type="number" value="\${p.calories}" class="profile-input" data-index="\${i}" data-field="calories" style="width: 100px;"></div>
                                    <div class="form-group"><label>Carbs (%)</label><input type="number" value="\${p.carbs}" class="profile-input" data-index="\${i}" data-field="carbs" style="width: 100px;"></div>
                                    <div class="form-group"><label>Protein (%)</label><input type="number" value="\${p.protein}" class="profile-input" data-index="\${i}" data-field="protein" style="width: 100px;"></div>
                                    <div class="form-group"><label>Fat (%)</label><input type="number" value="\${p.fat}" class="profile-input" data-index="\${i}" data-field="fat" style="width: 100px;"></div>
                                    <button class="btn delete-profile-btn" data-index="\${i}" style="margin-top: auto; padding: 0.5rem; background: var(--bg-hover); color: var(--text-muted);">🗑</button>
                                </div>
                            </div>
                        \`).join('')}
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
            \`;
            
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
            if (importInput) {
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
            }
            return;
        }

        if (currentCMSTab === 'mealplan') {`;
code = code.replace('if (currentCMSTab === \'mealplan\') {', settingsCode);


// 4. Mealplan - HTML updates
const oldHtml1 = \`<div style="display: flex; gap: 1rem; margin-top: 1rem;">
                    <button class="btn secondary" id="btn-cancel" style="flex: 1;">Cancel</button>
                    <button class="btn danger" id="btn-clear" style="flex: 1; display: none;">Clear Slot</button>
                    <button class="btn primary" id="btn-confirm" style="flex: 2;">Assign to Slot</button>
                </div>\`;
const newHtml1 = \`<div class="form-group" style="margin-top: 1rem;" id="eaters-row">
                    <label style="color: var(--text-primary); font-weight: 600;">Who is eating?</label>
                    <div id="eaters-list" style="display: flex; gap: 1rem; flex-wrap: wrap; margin-top: 0.5rem;">
                        <!-- Checkboxes will render here -->
                    </div>
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 1rem;">
                    <button class="btn secondary" id="btn-cancel" style="flex: 1;">Cancel</button>
                    <button class="btn danger" id="btn-clear" style="flex: 1; display: none;">Clear Slot</button>
                    <button class="btn primary" id="btn-confirm" style="flex: 2;">Assign to Slot</button>
                </div>\`;
code = code.replace(oldHtml1, newHtml1);

const oldHtml2 = \`<div class="form-group" id="servings-row">
                    <label>Servings (Multiplier)</label>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <button class="btn secondary" id="servings-decrement" style="padding: 0 0.5rem; border-radius: 4px;">-</button>
                        <input type="number" id="assign-servings" value="1" min="1" max="20" style="width: 60px; text-align: center;">
                        <button class="btn secondary" id="servings-increment" style="padding: 0 0.5rem; border-radius: 4px;">+</button>
                    </div>
                </div>\`;
code = code.replace(oldHtml2, '');

const oldHtml3 = \`<label>Add Item / Recipe</label>
                    <input type="text" id="assign-search" placeholder="Search..." autocomplete="off">\`;
const newHtml3 = \`<label>Add Item / Recipe</label>
                    <input type="text" id="assign-search" placeholder="Search name..." autocomplete="off">
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                        <input type="number" id="filter-max-cal" placeholder="Max kCal" style="width: 80px; font-size: 0.8rem;">
                        <input type="number" id="filter-min-pro" placeholder="Min Pro (g)" style="width: 80px; font-size: 0.8rem;">
                        <input type="number" id="filter-max-carb" placeholder="Max Carb (g)" style="width: 80px; font-size: 0.8rem;">
                        <input type="number" id="filter-max-fat" placeholder="Max Fat (g)" style="width: 80px; font-size: 0.8rem;">
                    </div>\`;
code = code.replace(oldHtml3, newHtml3);

// 5. Mealplan DOM variables
code = code.replace('const servingsInput = document.getElementById(\'assign-servings\');', 'const eatersList = document.getElementById(\'eaters-list\');');
code = code.replace('const servingsRow = document.getElementById(\'servings-row\');', 'const eatersRow = document.getElementById(\'eaters-row\');');
code = code.replace('const servingsDecrement = document.getElementById(\'servings-decrement\');', '');
code = code.replace('const servingsIncrement = document.getElementById(\'servings-increment\');', '');
code = code.replace('const searchInput = document.getElementById(\'assign-search\');', 'const searchInput = document.getElementById(\'assign-search\');\n            const maxCalInput = document.getElementById(\'filter-max-cal\');\n            const minProInput = document.getElementById(\'filter-min-pro\');\n            const maxCarbInput = document.getElementById(\'filter-max-carb\');\n            const maxFatInput = document.getElementById(\'filter-max-fat\');');

// 6. Template rendering
code = code.replace('servingsInput.value = t.servings || 1;', 'if (t.eaters) {\n                            document.querySelectorAll(\'.eater-cb\').forEach(cb => {\n                                cb.checked = t.eaters.includes(cb.value);\n                            });\n                        }');
code = code.replace('servingsRow.style.opacity = \'1\';\n                        servingsRow.style.pointerEvents = \'auto\';', 'eatersRow.style.opacity = \'1\';\n                        eatersRow.style.pointerEvents = \'auto\';');

// 7. Resetting modal state
code = code.replace('servingsInput.value = \'1\';\n                    checkboxEatingOut.checked = false;\n                    builderSection.style.opacity = \'1\';\n                    builderSection.style.pointerEvents = \'auto\';\n                    servingsRow.style.opacity = \'1\';\n                    servingsRow.style.pointerEvents = \'auto\';', 'checkboxEatingOut.checked = false;\n                    builderSection.style.opacity = \'1\';\n                    builderSection.style.pointerEvents = \'auto\';\n                    eatersList.innerHTML = appSettings.profiles.map(p => `\n                        <label style="display: flex; align-items: center; gap: 0.3rem; font-size: 0.85rem; cursor: pointer;">\n                            <input type="checkbox" class="eater-cb" value="\${p.name}" style="accent-color: var(--accent); width: 16px; height: 16px;" checked>\n                            \${p.name}\n                        </label>\n                    `).join(\'\');\n                    eatersRow.style.opacity = \'1\';\n                    eatersRow.style.pointerEvents = \'auto\';');

code = code.replace('servingsRow.style.opacity = \'0.5\';\n                            servingsRow.style.pointerEvents = \'none\';', 'eatersRow.style.opacity = \'0.5\';\n                            eatersRow.style.pointerEvents = \'none\';');
code = code.replace('servingsRow.style.opacity = \'1\';\n                    servingsRow.style.pointerEvents = \'auto\';', 'eatersRow.style.opacity = \'1\';\n                    eatersRow.style.pointerEvents = \'auto\';');

code = code.replace('servingsRow.style.opacity = \'0.5\';\n                    servingsRow.style.pointerEvents = \'none\';', 'eatersRow.style.opacity = \'0.5\';\n                    eatersRow.style.pointerEvents = \'none\';');

code = code.replace('if (existingPlan.type === \'recipe\') {', 'if (existingPlan.eaters) {\n                                document.querySelectorAll(\'.eater-cb\').forEach(cb => {\n                                    cb.checked = existingPlan.eaters.includes(cb.value);\n                                });\n                            }\n                            if (existingPlan.type === \'recipe\') {');

// 8. Handle Search
const oldSearch = \`            // Servings +/- buttons
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
                
                const combined = [...matchedRecipes, ...matchedIngredients].slice(0, 15); // Top 15\`;

const newSearch = \`            const handleSearch = () => {
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
                    const p = r.macros?.protein?.match(/[d.]+/);
                    return p ? parseFloat(p[0]) : 0;
                };
                const getCarb = r => {
                    if (r.carbsG !== undefined) return r.carbsG;
                    const p = r.macros?.carbohydrate?.match(/[d.]+/);
                    return p ? parseFloat(p[0]) : 0;
                };
                const getFat = r => {
                    if (r.fatG !== undefined) return r.fatG;
                    const p = r.macros?.fat?.match(/[d.]+/);
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
                
                const combined = [...matchedRecipes, ...matchedIngredients].slice(0, 15);\`;

code = code.replace(oldSearch, newSearch);

// Bind handleSearch
const oldBind = \`            btnCancel.onclick = () => {
                assignModal.classList.add('hidden');
            };\`;
const newBind = \`            btnCancel.onclick = () => {
                assignModal.classList.add('hidden');
            };
            searchInput.oninput = handleSearch;
            maxCalInput.oninput = handleSearch;
            minProInput.oninput = handleSearch;
            maxCarbInput.oninput = handleSearch;
            maxFatInput.oninput = handleSearch;\`;
code = code.replace(oldBind, newBind);

// 9. btnConfirm.onclick Meal Plan Push
const oldConfirm = \`                    if (checkboxEatingOut.checked) {
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
                    }\`;
const newConfirm = \`                    mealPlans.push({
                        id: crypto.randomUUID(),
                        date: dateStr,
                        slot: activeSlotName,
                        type: 'multi',
                        items: JSON.parse(JSON.stringify(modalSelectedItems)),
                        eaters: Array.from(document.querySelectorAll('.eater-cb:checked')).map(cb => cb.value),
                        isEatingOut: checkboxEatingOut.checked
                    });\`;
code = code.replace(oldConfirm, newConfirm);

// 10. Generate Shopping List logic (servings multiplier removal)
const oldShop1 = \`                    const servingsMultiplier = plan.servings || 1;
                    
                    // Backwards compatibility for old format
                    let itemsToProcess = plan.items || [];
                    if (itemsToProcess.length === 0 && plan.type === 'recipe') {
                        itemsToProcess.push({ type: 'recipe', referenceId: plan.referenceId });
                    }\`;
const newShop1 = \`                    let itemsToProcess = plan.items || [];\`;
code = code.replace(oldShop1, newShop1);

code = code.replace('const scaledAmount = (parseFloat(ing.amount) || 0) * servingsMultiplier;', 'const scaledAmount = parseFloat(ing.amount) || 0;');
code = code.replace('const scaledAmount = (parseFloat(item.amount) || 0) * servingsMultiplier;', 'const scaledAmount = parseFloat(item.amount) || 0;');
code = code.replace('const targetPlans = mealPlans.filter(p => validDates.includes(p.date) && !p.isEatingOut && p.type !== \'eating_out\');', 'const targetPlans = mealPlans.filter(p => validDates.includes(p.date) && !p.isEatingOut);');

fs.writeFileSync('cms.js', code, 'utf8');
console.log('Successfully patched cms.js');
