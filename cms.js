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

    macroRefSelect.addEventListener('change', (e) => {
        if (e.target.value === 'per_x_g') {
            macroRefAmountGroup.style.display = 'block';
        } else {
            macroRefAmountGroup.style.display = 'none';
        }
    });

    let recipes = [];
    let ingredients = [];
    let currentCMSTab = 'recipe';

    const cmsTabs = document.getElementById('cms-tabs');
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
            const [resRecipes, resIngredients] = await Promise.all([
                fetch('/api/recipes', { headers: HEADERS }).then(r => r.ok ? r.json() : []),
                fetch('/api/ingredients', { headers: HEADERS }).then(r => r.ok ? r.json() : [])
            ]);
            recipes = resRecipes;
            ingredients = resIngredients;
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

        if (currentCMSTab === 'food') {
            const tableHTML = `
                <div style="overflow-x: auto; margin-bottom: 1rem;">
                    <table class="food-table">
                        <thead>
                            <tr>
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
                            ${ingredients.length === 0 ? `<tr><td colspan="13" style="text-align: center; padding: 1rem;">No ingredients yet. Click "+ Add Row".</td></tr>` : ''}
                            ${ingredients.map((ing, i) => `
                                <tr data-index="${i}">
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
                                        <button class="btn danger delete-food-row" style="padding: 0.2rem 0.5rem;">&times;</button>
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

                    // Preserve existing profile data if present
                    const existing = ingredients.find(f => f.foodId === foodId);

                    updatedIngredients.push({
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
                        // Preserve culinary profile fields
                        ...(existing?.description && { description: existing.description }),
                        ...(existing?.imageUrl && { imageUrl: existing.imageUrl }),
                        ...(existing?.ingredientDetails && { ingredientDetails: existing.ingredientDetails }),
                    });
                });

                if (hasError) return;
                
                ingredients = updatedIngredients;
                await saveIngredients();
                renderCMSList();
            });

            document.querySelectorAll('.delete-food-row').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const row = e.target.closest('tr');
                    const index = parseInt(row.dataset.index, 10);
                    ingredients.splice(index, 1);
                    renderCMSList();
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
                if (confirm('Delete this recipe?')) {
                    recipes = recipes.filter(r => r.id !== btn.dataset.id);
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
