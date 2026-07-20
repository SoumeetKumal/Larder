/**
 * Merge Rescued Data Script
 * 
 * Takes the rescued FitTrack SQLite data (foods + recipes) and merges it
 * into Larder's ingredients.json and recipes.json formats.
 * 
 * - Skips soft-deleted entries (isDeleted === true)
 * - Deduplicates by name (case-insensitive)
 * - Preserves all micronutrient data and pricing
 * - Creates backups before writing
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const RESCUED_PATH = path.join(DATA_DIR, 'rescued_data.json');
const INGREDIENTS_PATH = path.join(DATA_DIR, 'ingredients.json');
const RECIPES_PATH = path.join(DATA_DIR, 'recipes.json');

// Generate a slug-style foodId from a name
function toFoodId(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

function main() {
    console.log('📦 Loading rescued data...');
    const rescued = JSON.parse(fs.readFileSync(RESCUED_PATH, 'utf8'));
    const currentIngredients = JSON.parse(fs.readFileSync(INGREDIENTS_PATH, 'utf8'));
    const currentRecipes = JSON.parse(fs.readFileSync(RECIPES_PATH, 'utf8'));

    console.log(`   Rescued foods: ${rescued.foods.length}`);
    console.log(`   Rescued recipes: ${rescued.recipes.length}`);
    console.log(`   Current ingredients: ${currentIngredients.length}`);
    console.log(`   Current recipes: ${currentRecipes.length}`);

    // =========================================================================
    // STEP 1: Backup current files
    // =========================================================================
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const ingredientsBackup = path.join(DATA_DIR, `ingredients_backup_${timestamp}.json`);
    const recipesBackup = path.join(DATA_DIR, `recipes_backup_${timestamp}.json`);

    fs.writeFileSync(ingredientsBackup, JSON.stringify(currentIngredients, null, 2));
    fs.writeFileSync(recipesBackup, JSON.stringify(currentRecipes, null, 2));
    console.log(`\n💾 Backups created:`);
    console.log(`   ${path.basename(ingredientsBackup)}`);
    console.log(`   ${path.basename(recipesBackup)}`);

    // =========================================================================
    // STEP 2: Merge Foods → ingredients.json
    // =========================================================================
    console.log('\n🥕 Merging foods into ingredients...');

    // Build a set of existing ingredient names (case-insensitive)
    const existingNames = new Set(
        currentIngredients.map(i => i.name.toLowerCase())
    );

    // Filter: active only, not already in ingredients
    const activeFoods = rescued.foods.filter(f => !f.isDeleted);
    let addedFoods = 0;
    let skippedFoods = 0;

    const mergedIngredients = [...currentIngredients];

    for (const food of activeFoods) {
        const nameLower = food.name.toLowerCase();
        if (existingNames.has(nameLower)) {
            skippedFoods++;
            continue;
        }

        existingNames.add(nameLower);
        addedFoods++;

        // Convert FitTrack food → Larder ingredient format
        const ingredient = {
            foodId: toFoodId(food.name),
            name: food.name,
            servingSizeG: food.servingSizeG || 100,
            servingUnit: food.servingUnit || 'g',
            calories: food.calories || 0,
            proteinG: food.proteinG || 0,
            fatG: food.fatG || 0,
            carbsG: food.carbsG || 0,
            fiberG: food.fiberG || 0,
            sugarG: food.sugarG || 0,
            category: food.category || 'Other',
        };

        // Add micronutrients (only if they have non-zero values)
        const micronutrients = {
            vitaminAMcg: food.vitaminAMcg,
            vitaminCMg: food.vitaminCMg,
            vitaminDMcg: food.vitaminDMcg,
            vitaminEMg: food.vitaminEMg,
            vitaminKMcg: food.vitaminKMcg,
            thiaminMg: food.thiaminMg,
            riboflavinMg: food.riboflavinMg,
            niacinMg: food.niacinMg,
            vitaminB6Mg: food.vitaminB6Mg,
            folateMcg: food.folateMcg,
            vitaminB12Mcg: food.vitaminB12Mcg,
            calciumMg: food.calciumMg,
            ironMg: food.ironMg,
            magnesiumMg: food.magnesiumMg,
            phosphorusMg: food.phosphorusMg,
            potassiumMg: food.potassiumMg,
            sodiumMg: food.sodiumMg,
            zincMg: food.zincMg,
            copperMg: food.copperMg,
            seleniumMcg: food.seleniumMcg,
        };

        const hasMicro = Object.values(micronutrients).some(v => v && v > 0);
        if (hasMicro) {
            Object.assign(ingredient, micronutrients);
        }

        // Add pricing if present
        if (food.averagePrice && food.averagePrice > 0) {
            ingredient.averagePrice = food.averagePrice;
            ingredient.priceCurrency = food.priceCurrency || 'MUR';
            if (food.pricePerKg) {
                ingredient.pricePerKg = food.pricePerKg;
            }
        }

        // Add notes if present
        if (food.notes) {
            ingredient.notes = food.notes;
        }

        mergedIngredients.push(ingredient);
    }

    console.log(`   ✅ Added: ${addedFoods} new ingredients`);
    console.log(`   ⏭️  Skipped (duplicates): ${skippedFoods}`);

    // =========================================================================
    // STEP 3: Merge Recipes → recipes.json
    // =========================================================================
    console.log('\n🍽️  Merging recipes...');

    const existingRecipeNames = new Set(
        currentRecipes.map(r => (r.title || r.name || '').toLowerCase())
    );

    const activeRecipes = rescued.recipes.filter(r => !r.isDeleted);
    let addedRecipes = 0;
    let skippedRecipes = 0;

    const mergedRecipes = [...currentRecipes];
    let nextRecipeId = currentRecipes.length + 1;

    for (const recipe of activeRecipes) {
        const nameLower = recipe.name.toLowerCase();
        if (existingRecipeNames.has(nameLower)) {
            skippedRecipes++;
            continue;
        }

        existingRecipeNames.add(nameLower);
        addedRecipes++;

        // Convert FitTrack recipe → Larder recipe format
        const larderRecipe = {
            id: String(nextRecipeId++),
            title: recipe.name,
            category: 'Uncategorized',  // FitTrack doesn't have recipe categories
            description: '',
            imageUrl: '',
            macros: {
                yield: `${recipe.servings || 1} Servings`,
                energy: '',
                carbohydrate: '',
                protein: '',
                fat: '',
            },
            ingredients: [],
            steps: [],
            note: '',
            variations: '',
        };

        // Parse instructions into steps if available
        if (recipe.instructions) {
            // Split on periods followed by space and capital letter, or on numbered steps
            const steps = recipe.instructions
                .split(/(?<=\.)\s+(?=[A-Z])/)
                .map(s => s.trim())
                .filter(s => s.length > 0);
            larderRecipe.steps = steps.length > 0 ? steps : [recipe.instructions];
        }

        mergedRecipes.push(larderRecipe);
    }

    console.log(`   ✅ Added: ${addedRecipes} new recipes`);
    console.log(`   ⏭️  Skipped (duplicates): ${skippedRecipes}`);

    // =========================================================================
    // STEP 4: Write merged files
    // =========================================================================
    console.log('\n📝 Writing merged files...');

    fs.writeFileSync(INGREDIENTS_PATH, JSON.stringify(mergedIngredients, null, 2));
    console.log(`   ingredients.json: ${mergedIngredients.length} total entries`);

    fs.writeFileSync(RECIPES_PATH, JSON.stringify(mergedRecipes, null, 2));
    console.log(`   recipes.json: ${mergedRecipes.length} total entries`);

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log('\n' + '='.repeat(60));
    console.log('✅ MERGE COMPLETE');
    console.log('='.repeat(60));
    console.log(`   Ingredients: ${currentIngredients.length} → ${mergedIngredients.length} (+${addedFoods})`);
    console.log(`   Recipes: ${currentRecipes.length} → ${mergedRecipes.length} (+${addedRecipes})`);
    console.log(`   Backups saved in data/`);
    console.log('');
}

main();
