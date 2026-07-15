document.addEventListener('DOMContentLoaded', () => {
    const addBtn = document.getElementById('add-recipe-btn');
    const statusText = document.getElementById('status-text');
    const listContainer = document.getElementById('cms-recipe-list');
    
    const modal = document.getElementById('cms-editor-modal');
    const form = document.getElementById('recipe-form');
    const closeBtn = modal.querySelector('.cms-close');
    const editorTitle = document.getElementById('editor-title');
    const ingContainer = document.getElementById('ingredients-container');
    const addIngBtn = document.getElementById('add-ing-btn');
    const macroRefSelect = document.getElementById('macro-reference');
    const macroRefAmountGroup = document.getElementById('macro-ref-amount-group');
    const recipeFieldsGroup = document.getElementById('recipe-fields-group');
    const ingredientFieldsGroup = document.getElementById('ingredient-fields-group');
    const entryTypeRadios = document.querySelectorAll('input[name="entryType"]');

    entryTypeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'ingredient') {
                recipeFieldsGroup.style.display = 'none';
                ingredientFieldsGroup.style.display = 'block';
            } else {
                recipeFieldsGroup.style.display = 'block';
                ingredientFieldsGroup.style.display = 'none';
            }
        });
    });

    macroRefSelect.addEventListener('change', (e) => {
        if (e.target.value === 'per_x_g') {
            macroRefAmountGroup.style.display = 'block';
        } else {
            macroRefAmountGroup.style.display = 'none';
        }
    });

    let recipes = [];
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

    // --- Load recipes from API ---
    async function loadRecipes() {
        try {
            const res = await fetch('/api/recipes');
            if (!res.ok) throw new Error('API not available');
            recipes = await res.json();
            statusText.innerHTML = `<span class="status-dot"></span> Connected · ${recipes.length} total entries`;
            addBtn.classList.remove('hidden');
            if (cmsTabs) cmsTabs.classList.remove('hidden');
            renderCMSList();
        } catch(e) {
            statusText.textContent = '⚠ Could not connect. Run: node server.js';
            statusText.style.color = '#D1777D';
        }
    }

    loadRecipes();

    async function saveRecipes() {
        try {
            const res = await fetch('/api/recipes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(recipes)
            });
            if (!res.ok) throw new Error('Save failed');
            const result = await res.json();
            statusText.innerHTML = `<span class="status-dot"></span> Saved · ${result.count} recipe(s)`;
        } catch(e) {
            statusText.textContent = '⚠ Save failed. Is the server running?';
            statusText.style.color = '#D1777D';
        }
    }

    // --- Render CMS List & Suggestions ---
    function populateIngredientSuggestions() {
        const datalist = document.getElementById('ingredient-suggestions');
        if (!datalist) return;
        
        const profiles = recipes.filter(r => r.entryType === 'ingredient');
        datalist.innerHTML = profiles.map(p => `<option value="${p.title}">`).join('');
    }

    function renderCMSList() {
        populateIngredientSuggestions();

        let filtered = recipes;
        if (currentCMSTab === 'ingredient') {
            filtered = recipes.filter(r => r.entryType === 'ingredient');
        } else {
            filtered = recipes.filter(r => r.entryType !== 'ingredient');
        }

        if (filtered.length === 0) {
            listContainer.innerHTML = `<div class="empty-state">No ${currentCMSTab === 'ingredient' ? 'ingredients' : 'recipes'} yet. Click "Add New Entry" to start!</div>`;
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

    addBtn.addEventListener('click', () => openEditor());

    // --- Ingredient Rows ---
    function createIngredientRow(item = '', metric = '', imperial = '') {
        const div = document.createElement('div');
        div.className = 'cms-ing-row form-row';
        div.innerHTML = `
            <div class="form-group" style="flex: 2;"><input type="text" list="ingredient-suggestions" placeholder="Item name" value="${item.replace(/"/g, '&quot;')}"></div>
            <div class="form-group" style="flex: 1;"><input type="text" placeholder="Metric" value="${metric.replace(/"/g, '&quot;')}"></div>
            <div class="form-group" style="flex: 1;"><input type="text" placeholder="Imperial" value="${imperial.replace(/"/g, '&quot;')}"></div>
            <div class="form-group" style="flex: 0 0 auto;"><button type="button" class="btn danger">&times;</button></div>
        `;
        div.querySelector('.btn.danger').addEventListener('click', () => div.remove());
        ingContainer.appendChild(div);
    }

    addIngBtn.addEventListener('click', () => createIngredientRow());

    // --- Editor ---
    function openEditor(id = null) {
        ingContainer.innerHTML = '';

        if (id) {
            const recipe = recipes.find(r => r.id === id);
            editorTitle.textContent = recipe.entryType === 'ingredient' ? 'Edit Ingredient Profile' : 'Edit Recipe';
            document.getElementById('recipe-id').value = recipe.id;
            document.getElementById('recipe-title').value = recipe.title;
            document.getElementById('recipe-category').value = recipe.category || 'Default';
            document.getElementById('recipe-desc').value = recipe.description || '';
            document.getElementById('recipe-image').value = recipe.imageUrl || '';

            const eType = recipe.entryType === 'ingredient' ? 'ingredient' : 'recipe';
            document.querySelector(`input[name="entryType"][value="${eType}"]`).checked = true;
            document.querySelector(`input[name="entryType"][value="${eType}"]`).dispatchEvent(new Event('change'));

            if (eType === 'ingredient' && recipe.ingredientDetails) {
                document.getElementById('ing-storage').value = recipe.ingredientDetails.storage || '';
                document.getElementById('ing-flavour').value = recipe.ingredientDetails.flavour || '';
                document.getElementById('ing-pairings').value = recipe.ingredientDetails.pairings || '';
                document.getElementById('ing-varieties').value = recipe.ingredientDetails.varieties || '';
                document.getElementById('ing-preparations').value = recipe.ingredientDetails.preparations || '';
            } else {
                document.getElementById('ing-storage').value = '';
                document.getElementById('ing-flavour').value = '';
                document.getElementById('ing-pairings').value = '';
                document.getElementById('ing-varieties').value = '';
                document.getElementById('ing-preparations').value = '';
            }

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
                recipe.ingredients.forEach(ing => createIngredientRow(ing.item, ing.metric, ing.imperial));
            } else {
                createIngredientRow();
            }

            document.getElementById('recipe-steps').value = (recipe.steps || []).join('\n');
            document.getElementById('recipe-note').value = recipe.note || '';
            document.getElementById('recipe-variations').value = recipe.variations || '';
        } else {
            editorTitle.textContent = 'Add New Recipe';
            form.reset();
            document.querySelector(`input[name="entryType"][value="recipe"]`).dispatchEvent(new Event('change'));
            document.getElementById('recipe-id').value = Date.now().toString();
            createIngredientRow();
        }
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const ingRows = Array.from(ingContainer.querySelectorAll('.cms-ing-row'));
        const ingredients = ingRows.map(row => {
            const inputs = row.querySelectorAll('input');
            return { item: inputs[0].value, metric: inputs[1].value, imperial: inputs[2].value };
        }).filter(ing => ing.item.trim() !== '');

        const eType = document.querySelector('input[name="entryType"]:checked').value;
        const newRecipe = {
            id: document.getElementById('recipe-id').value,
            entryType: eType,
            title: document.getElementById('recipe-title').value,
            category: document.getElementById('recipe-category').value,
            description: document.getElementById('recipe-desc').value,
            imageUrl: document.getElementById('recipe-image').value,
        };

        if (eType === 'ingredient') {
            newRecipe.ingredientDetails = {
                storage: document.getElementById('ing-storage').value,
                flavour: document.getElementById('ing-flavour').value,
                pairings: document.getElementById('ing-pairings').value,
                varieties: document.getElementById('ing-varieties').value,
                preparations: document.getElementById('ing-preparations').value
            };
        } else {
            newRecipe.macros = {
                macroReference: {
                    type: document.getElementById('macro-reference').value,
                    referenceAmount: document.getElementById('macro-ref-amount').value
                },
                yield: document.getElementById('macro-yield').value,
                energy: document.getElementById('macro-energy').value,
                carbohydrate: document.getElementById('macro-carbs').value,
                protein: document.getElementById('macro-protein').value,
                fat: document.getElementById('macro-fat').value
            };
            newRecipe.ingredients = ingredients;
            newRecipe.steps = document.getElementById('recipe-steps').value.split('\n').filter(l => l.trim());
            newRecipe.note = document.getElementById('recipe-note').value;
            newRecipe.variations = document.getElementById('recipe-variations').value;
        }

        const idx = recipes.findIndex(r => r.id === newRecipe.id);
        if (idx >= 0) recipes[idx] = newRecipe;
        else recipes.push(newRecipe);

        closeModal();
        renderCMSList();
        await saveRecipes();
    });

    function closeModal() {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
});
