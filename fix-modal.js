const fs = require('fs');

let appJs = fs.readFileSync('app.js', 'utf8');

// Replace renderIngredientsHTML
const oldRenderIng = appJs.substring(appJs.indexOf('function renderIngredientsHTML(recipe, scale) {'), appJs.indexOf('function buildModalContent() {'));
const newRenderIng = `function renderIngredientsHTML(recipe, scale) {
        if (!recipe.ingredients || recipe.ingredients.length === 0) return '';
        
        let html = '<table class="recipe-table"><colgroup><col style="width: 50%"><col style="width: 25%"><col style="width: 25%"></colgroup>';
        
        html += recipe.ingredients.map(ing => {
            if (ing.item.startsWith('## ')) {
                return \`<tr><td colspan="3" style="border-bottom: none;"><h4 style="margin-top: 1rem; color: var(--text-main); font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); padding-bottom: 0.25rem;">\${ing.item.substring(3)}</h4></td></tr>\`;
            }

            const profile = recipesData.find(r => r.entryType === 'ingredient' && ing.item.toLowerCase().includes(r.title.toLowerCase()));
            const itemNameHtml = profile 
                ? \`<button class="ingredient-link" data-id="\${profile.id}" style="background:none;border:none;padding:0;color:var(--text-main);font-weight:500;font-family:inherit;font-size:inherit;cursor:pointer;transition:all 0.2s; text-align: left;" onmouseover="this.style.color='var(--accent-sea)'" onmouseout="this.style.color='var(--text-main)'">\${ing.item}</button>\`
                : \`<span style="font-weight: 500;">\${ing.item}</span>\`;

            let displayAmt = '-';
            let parsedAmount = parseFloat(ing.amount);
            if (!isNaN(parsedAmount)) {
                let scaled = parsedAmount * scale;
                // keep up to 2 decimal places if needed
                displayAmt = (Math.round(scaled * 100) / 100) + (ing.unit ? ' ' + ing.unit : '');
            } else if (ing.amount) {
                displayAmt = ing.amount; 
            }

            return \`<tr><td>\${itemNameHtml}</td><td>\${displayAmt}</td><td></td></tr>\`;
        }).join('');
        
        html += '</table>';
        return html;
    }

    `;

appJs = appJs.replace(oldRenderIng, newRenderIng);

// Replace buildModalContent
const oldBuild = appJs.substring(appJs.indexOf('function buildModalContent() {'), appJs.indexOf('function attachModalListeners() {'));

const newBuild = `function buildModalContent() {
        const recipe = currentRecipe;

        if (isIngredientsPage || recipe.entryType === 'ingredient') {
            const title = recipe.name || recipe.title;
            const details = recipe.ingredientDetails || {};
            
            modalBody.innerHTML = \`
                <div class="recipe-header" style="padding: 2rem;">
                    <h1 id="modal-title">\${title}</h1>
                    <p style="color: var(--text-muted); margin-top:0.5rem;">\${recipe.description || ''}</p>
                </div>
                
                <div class="macros-bar" style="margin: 0 2rem; border-top: 1px solid var(--border-color); padding-top: 1rem;">
                    <div class="macros-item"><span class="macros-label">Serving</span><span class="macros-value">\${recipe.servingSizeG || 100}\${recipe.servingUnit || 'g'}</span></div>
                    <div class="macros-divider"></div>
                    <div class="macros-item"><span class="macros-label">Energy</span><span class="macros-value">\${recipe.calories || '-'} kcal</span></div>
                    <div class="macros-divider"></div>
                    <div class="macros-item"><span class="macros-label">Carbs</span><span class="macros-value">\${recipe.carbsG || '-'}g</span></div>
                    <div class="macros-divider"></div>
                    <div class="macros-item"><span class="macros-label">Protein</span><span class="macros-value">\${recipe.proteinG || '-'}g</span></div>
                    <div class="macros-divider"></div>
                    <div class="macros-item"><span class="macros-label">Fat</span><span class="macros-value">\${recipe.fatG || '-'}g</span></div>
                </div>

                <div class="ingredient-details-grid" style="display: grid; gap: 1.5rem; margin: 2.5rem 2rem; border-top: 1px solid var(--border-color); padding-top: 2rem;">
                    \${details.storage ? \`<div><h2 style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.2rem; text-transform:uppercase; letter-spacing:0.05em;">Storage</h2><p style="font-size: 0.95rem; margin: 0;">\${details.storage}</p></div>\` : ''}
                    \${details.flavour ? \`<div><h2 style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.2rem; text-transform:uppercase; letter-spacing:0.05em;">Flavour Profile</h2><p style="font-size: 0.95rem; margin: 0;">\${details.flavour}</p></div>\` : ''}
                    \${details.pairings ? \`<div><h2 style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.2rem; text-transform:uppercase; letter-spacing:0.05em;">Pairings</h2><p style="font-size: 0.95rem; margin: 0;">\${details.pairings}</p></div>\` : ''}
                    \${details.varieties ? \`<div><h2 style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.2rem; text-transform:uppercase; letter-spacing:0.05em;">Varieties / Types</h2><p style="font-size: 0.95rem; margin: 0;">\${details.varieties}</p></div>\` : ''}
                    \${details.preparations ? \`<div><h2 style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.2rem; text-transform:uppercase; letter-spacing:0.05em;">Preparations</h2><p style="font-size: 0.95rem; margin: 0;">\${details.preparations}</p></div>\` : ''}
                </div>
            \`;

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
                    return \`<h4 style="margin-top: 1.5rem; color: var(--text-main); font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border); padding-bottom: 0.25rem;">\${step.substring(3)}</h4>\`;
                }
                const html = \`
                <div class="recipe-step">
                    <span class="step-number">\${stepNum}</span>
                    <p>\${step}</p>
                </div>\`;
                stepNum++;
                return html;
            }).join('');
        }

        let footerHtml = '';
        if (recipe.note || recipe.variations) {
            footerHtml = '<div class="recipe-footer-col">';
            if (recipe.note) {
                footerHtml += \`<div class="recipe-callout" style="border-left-color: var(--accent-sea);">
                    <h4 class="callout-title" style="color: var(--accent-sea);"><i data-lucide="lightbulb" style="width: 18px; height: 18px;"></i>Note</h4>
                    <p style="font-size: 0.9rem; line-height: 1.6;">\${recipe.note}</p>
                </div>\`;
            }
            if (recipe.variations) {
                footerHtml += \`<div class="recipe-callout" style="border-left-color: var(--accent-sea);">
                    <h4 class="callout-title" style="color: var(--accent-sea);"><i data-lucide="refresh-cw" style="width: 18px; height: 18px;"></i> Variations</h4>
                    <p style="font-size: 0.9rem; line-height: 1.6;">\${recipe.variations}</p>
                </div>\`;
            }
            footerHtml += '</div>';
        }

        const iconTag = recipe.iconTag || 'icon-fish';
        
        let headerColor = 'var(--accent-sea)';
        if (recipe.category === 'Dessert') headerColor = 'var(--accent-bake)';
        else if (recipe.category === 'Breakfast') headerColor = 'var(--accent-stock)';
        
        // Remove standard header wrapper and inject the custom modal structure 
        // Note: index.html already has \`<div class="modal-content" id="modal-container">\` and \`<button class="modal-close" id="modal-close" aria-label="Close modal"><i data-lucide="x"></i></button>\` inside it, and \`<div id="modal-body">\`.
        // BUT our \`modalBody.innerHTML = ...\` targets \`#modal-body\`. 
        // Wait, in visual_direction.html, the structure is:
        // .modal-content
        //   .modal-header
        //   .modal-body
        
        // So we can put .modal-header AND .modal-body inside \`#modal-body\`.
        
        modalBody.style.padding = "0"; // reset padding since we use columns
        modalBody.style.display = "flex";
        modalBody.style.flexDirection = "column"; // we will put header, then body flex
        
        modalBody.innerHTML = \`
            <div class="modal-header">
                <div class="modal-actions no-print">
                    <button class="icon-btn" aria-label="Print Recipe" onclick="window.print()"><i data-lucide="printer" style="width: 18px; height: 18px;"></i></button>
                </div>
                <h2 class="recipe-full-title" style="color: \${headerColor}; text-transform: uppercase;">\${recipe.title}</h2>
                <p class="recipe-full-desc">\${recipe.description || ''}</p>
            </div>
            
            <div class="modal-body" style="padding: 0; display: grid; grid-template-columns: 1fr 2fr;">
                <!-- Stats Row -->
                <div class="recipe-ingredients-col" style="padding: 1.5rem 1rem 1rem 2rem; border-bottom: 1px solid var(--border); border-right: none;">
                    <div class="stat-block" style="border-top: 3px solid \${headerColor}; width: 100%; justify-content: flex-start;">
                        <span class="stat-block-title">Info</span>
                        <div class="stat-group">
                            <div class="stat-item"><span class="stat-label">Serves</span>
                                <span class="stat-value" style="display: flex; align-items: center; gap: 0.5rem;" id="ingredients-wrapper-controls">
                                    <button class="multiplier-btn scaler-btn" data-scale="\${currentScale <= 1 ? 0.5 : 1}" style="width: 24px; height: 24px;"><i data-lucide="minus" style="pointer-events:none; width: 12px; height: 12px;"></i></button>
                                    \${recipe.macros?.yield || '-'}
                                    <button class="multiplier-btn scaler-btn" data-scale="\${currentScale >= 1 ? 2 : 1}" style="width: 24px; height: 24px;"><i data-lucide="plus" style="pointer-events:none; width: 12px; height: 12px;"></i></button>
                                </span>
                            </div>
                            <div class="stat-item"><span class="stat-label">Time</span><span class="stat-value">\${recipe.time || '-'}</span></div>
                        </div>
                    </div>
                </div>
                
                <div class="recipe-instructions-col" style="padding: 1.5rem 2rem 1rem 1rem; border-bottom: 1px solid var(--border);">
                    <div class="stat-block" style="border-top: 3px solid \${headerColor}; width: 100%; justify-content: flex-start;">
                        <span class="stat-block-title">Per Serving</span>
                        <div class="stat-group" style="gap: 3rem; align-items: center;">
                            <div class="stat-item"><span class="stat-label">Energy</span><span class="stat-value" style="color: \${headerColor};">\${stdMacros ? stdMacros.display.energy : '-'}</span></div>
                            <div class="stat-item"><span class="stat-label">Carb</span><span class="stat-value">\${stdMacros ? stdMacros.display.carb : '-'}</span></div>
                            <div class="stat-item"><span class="stat-label">Protein</span><span class="stat-value">\${stdMacros ? stdMacros.display.protein : '-'}</span></div>
                            <div class="stat-item"><span class="stat-label">Fat</span><span class="stat-value">\${stdMacros ? stdMacros.display.fat : '-'}</span></div>
                        </div>
                    </div>
                </div>

                <!-- Content Row -->
                <div class="recipe-ingredients-col" style="padding-top: 1rem;" id="ingredients-wrapper">
                    \${ingredientsHtml}
                </div>
                
                <div class="recipe-instructions-col" style="padding-top: 1rem;">
                    <h3 class="section-pill" style="color: \${headerColor}; border-color: \${headerColor};">
                        <i data-lucide="utensils" style="width: 18px; height: 18px;"></i> <span style="position: relative; top: 1px;">Instructions</span>
                    </h3>
                    \${stepsHtml}
                </div>
                
                \${footerHtml}
            </div>
        \`;

        attachModalListeners();
    }
    `;

appJs = appJs.replace(oldBuild, newBuild);

fs.writeFileSync('app.js', appJs);
console.log('Fixed modal logic in app.js');
