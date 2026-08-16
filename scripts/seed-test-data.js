const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');

const readData = (filename) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, filename), 'utf8'));
  } catch (e) {
    return [];
  }
};

const writeData = (filename, data) => {
  fs.writeFileSync(path.join(dataDir, filename), JSON.stringify(data, null, 2));
};

const recipes = readData('recipes.json');
const ingredients = readData('ingredients.json');
const pantryItems = readData('pantry-items.json');
const shoppinglists = readData('shoppinglists.json');
const mealplans = readData('mealplans.json');
const receipts = readData('receipts.json');
const consumption = readData('consumption.json');
const household = readData('household.json');
const settings = readData('settings.json');

// 1. Add 3 more recipes
recipes.push(
  {
    "id": "recipe_spaghetti_bolognese", "entryType": "recipe", "title": "Spaghetti Bolognese", "category": "Meat", "time": "45 mins", "description": "Classic Italian pasta dish.", "imageUrl": "", "status": "published", "macros": {}, 
    "ingredients": [{"item": "Spaghetti", "foodId": "spaghetti", "metric": "200g", "imperial": "2 cups"}], "steps": [], "tags": ["ITALIAN"], "note": "", "variations": ""
  },
  {
    "id": "recipe_chicken_stir_fry", "entryType": "recipe", "title": "Chicken Stir-Fry", "category": "Poultry", "time": "20 mins", "description": "Quick and easy stir-fry.", "imageUrl": "", "status": "published", "macros": {}, 
    "ingredients": [{"item": "Chicken Breast", "foodId": "chicken_breast", "metric": "300g", "imperial": "0.6 lb"}], "steps": [], "tags": ["ASIAN"], "note": "", "variations": ""
  },
  {
    "id": "recipe_greek_salad", "entryType": "recipe", "title": "Greek Salad", "category": "Vegetables", "time": "15 mins", "description": "Fresh and healthy salad.", "imageUrl": "", "status": "published", "macros": {}, 
    "ingredients": [{"item": "Feta Cheese", "foodId": "feta_cheese", "metric": "100g", "imperial": "1/2 cup"}], "steps": [], "tags": ["SALAD"], "note": "", "variations": ""
  }
);

// 2. Expand pantry-items
pantryItems.push(
  { "pantryId": "pantry_spaghetti", "ingredientFoodId": "spaghetti", "productName": "Spaghetti", "brand": "Barilla", "packSize": 500, "packUnit": "g", "price": 50, "currency": "MUR", "quantity": 2, "isTracked": true, "avgDurationDays": 30, "lastOpenedDate": "2026-08-10", "notes": "" },
  { "pantryId": "pantry_chicken", "ingredientFoodId": "chicken_breast", "productName": "Chicken Breast", "brand": "Chantecler", "packSize": 1000, "packUnit": "g", "price": 180, "currency": "MUR", "quantity": 1, "isTracked": true, "avgDurationDays": 7, "lastOpenedDate": "2026-08-15", "notes": "" },
  { "pantryId": "pantry_feta", "ingredientFoodId": "feta_cheese", "productName": "Feta Cheese", "brand": "Dodoni", "packSize": 200, "packUnit": "g", "price": 120, "currency": "MUR", "quantity": 1, "isTracked": true, "avgDurationDays": 14, "lastOpenedDate": "2026-08-14", "notes": "" }
);

// 3. Create today's shopping list
const today = new Date().toISOString().slice(0,10);
shoppinglists.push({
  "id": "sl_today",
  "date": today,
  "items": [
    { "id": "sli_1", "foodId": "tomato", "name": "Tomato", "amount": 1, "unit": "kg", "checked": false, "price": 80, "included": true },
    { "id": "sli_2", "foodId": "onion", "name": "Onion", "amount": 500, "unit": "g", "checked": false, "price": 40, "included": true },
    { "id": "sli_3", "foodId": "garlic", "name": "Garlic", "amount": 100, "unit": "g", "checked": false, "price": 20, "included": true },
    { "id": "sli_4", "foodId": "milk", "name": "Milk", "amount": 1, "unit": "L", "checked": false, "price": 60, "included": true },
    { "id": "sli_5", "foodId": "eggs", "name": "Eggs", "amount": 12, "unit": "pcs", "checked": false, "price": 100, "included": true },
    { "id": "sli_6", "foodId": "bread", "name": "Bread", "amount": 1, "unit": "loaf", "checked": false, "price": 50, "included": true },
    { "id": "sli_7", "foodId": "butter", "name": "Butter", "amount": 250, "unit": "g", "checked": false, "price": 90, "included": true },
    { "id": "sli_8", "foodId": "apples", "name": "Apples", "amount": 1, "unit": "kg", "checked": false, "price": 150, "included": true },
    { "id": "sli_9", "foodId": "bananas", "name": "Bananas", "amount": 1, "unit": "kg", "checked": false, "price": 60, "included": true }
  ]
});

// 4. Create 3 more meal plans
mealplans.push(
  { "id": "mp_1", "date": today, "slot": "dinner", "isEatingOut": false, "items": [{"type": "recipe", "referenceId": "recipe_spaghetti_bolognese"}], "eaters": [0], "servings": 2, "isConsumed": false },
  { "id": "mp_2", "date": today, "slot": "lunch", "isEatingOut": false, "items": [{"type": "recipe", "referenceId": "recipe_chicken_stir_fry"}], "eaters": [0], "servings": 2, "isConsumed": false },
  { "id": "mp_3", "date": today, "slot": "breakfast", "isEatingOut": false, "items": [{"type": "recipe", "referenceId": "recipe_greek_salad"}], "eaters": [0], "servings": 2, "isConsumed": false }
);

// 5. Create 5-6 receipts
receipts.push(
  { "id": "rc_1", "store": "Super U", "date": "2026-07-01", "total": 1000, "currency": "MUR", "items": [{"name": "Milk", "price": 60, "foodId": "milk", "qty": 2, "category": "Dairy"}] },
  { "id": "rc_2", "store": "Jumbo", "date": "2026-07-15", "total": 1500, "currency": "MUR", "items": [{"name": "Chicken", "price": 180, "foodId": "chicken_breast", "qty": 2, "category": "Meat"}] },
  { "id": "rc_3", "store": "Winners", "date": "2026-08-01", "total": 2000, "currency": "MUR", "items": [{"name": "Spaghetti", "price": 50, "foodId": "spaghetti", "qty": 4, "category": "Pasta"}] },
  { "id": "rc_4", "store": "Intermart", "date": "2026-08-10", "total": 500, "currency": "MUR", "items": [{"name": "Feta", "price": 120, "foodId": "feta_cheese", "qty": 1, "category": "Dairy"}] },
  { "id": "rc_5", "store": "Super U", "date": "2026-08-15", "total": 800, "currency": "MUR", "items": [{"name": "Apples", "price": 150, "foodId": "apples", "qty": 1, "category": "Fruit"}] }
);

// 6. Create 3-4 consumption records
consumption.push(
  { "id": "cons_1", "date": "2026-08-05", "recipeId": "recipe_spaghetti_bolognese", "recipeTitle": "Spaghetti Bolognese", "servingsCooked": 2, "source": "recipe", "items": [{"foodId": "spaghetti", "grams": 200}] },
  { "id": "cons_2", "date": "2026-08-10", "recipeId": "recipe_chicken_stir_fry", "recipeTitle": "Chicken Stir-Fry", "servingsCooked": 2, "source": "recipe", "items": [{"foodId": "chicken_breast", "grams": 300}] },
  { "id": "cons_3", "date": "2026-08-14", "recipeId": "recipe_greek_salad", "recipeTitle": "Greek Salad", "servingsCooked": 2, "source": "recipe", "items": [{"foodId": "feta_cheese", "grams": 100}] },
  { "id": "cons_4", "date": "2026-08-15", "recipeId": null, "recipeTitle": null, "servingsCooked": null, "source": "manual", "items": [{"foodId": "apples", "grams": 150}] }
);

// 7. Add price history
ingredients.push(
  { "foodId": "spaghetti", "name": "Spaghetti", "averagePrice": 50, "priceHistory": [{"date": "2026-05-01", "price": 45}, {"date": "2026-06-01", "price": 48}, {"date": "2026-07-01", "price": 50}, {"date": "2026-08-01", "price": 52}] },
  { "foodId": "chicken_breast", "name": "Chicken Breast", "averagePrice": 180, "priceHistory": [{"date": "2026-05-01", "price": 170}, {"date": "2026-06-01", "price": 175}, {"date": "2026-07-01", "price": 180}, {"date": "2026-08-01", "price": 185}] },
  { "foodId": "feta_cheese", "name": "Feta Cheese", "averagePrice": 120, "priceHistory": [{"date": "2026-05-01", "price": 110}, {"date": "2026-06-01", "price": 115}, {"date": "2026-07-01", "price": 120}, {"date": "2026-08-01", "price": 125}] },
  { "foodId": "milk", "name": "Milk", "averagePrice": 60, "priceHistory": [{"date": "2026-05-01", "price": 55}, {"date": "2026-06-01", "price": 58}, {"date": "2026-07-01", "price": 60}, {"date": "2026-08-01", "price": 62}] },
  { "foodId": "apples", "name": "Apples", "averagePrice": 150, "priceHistory": [{"date": "2026-05-01", "price": 140}, {"date": "2026-06-01", "price": 145}, {"date": "2026-07-01", "price": 150}, {"date": "2026-08-01", "price": 155}] },
  { "foodId": "butter", "name": "Butter", "averagePrice": 90, "priceHistory": [{"date": "2026-05-01", "price": 85}, {"date": "2026-06-01", "price": 88}, {"date": "2026-07-01", "price": 90}, {"date": "2026-08-01", "price": 95}] },
  { "foodId": "eggs", "name": "Eggs", "averagePrice": 100, "priceHistory": [{"date": "2026-05-01", "price": 90}, {"date": "2026-06-01", "price": 95}, {"date": "2026-07-01", "price": 100}, {"date": "2026-08-01", "price": 105}] },
  { "foodId": "bread", "name": "Bread", "averagePrice": 50, "priceHistory": [{"date": "2026-05-01", "price": 45}, {"date": "2026-06-01", "price": 48}, {"date": "2026-07-01", "price": 50}, {"date": "2026-08-01", "price": 52}] }
);

// 8. Add 3 more household items
if (!Array.isArray(household)) { household.length = 0; }
household.push(
  { "id": "hh_dish_soap", "name": "Dish Soap", "category": "Cleaning", "unitSize": "500ml", "currentStock": 2, "avgDurationDays": 30, "pricePerUnit": 60, "lastOpenedDate": "2026-08-01", "durationHistory": [] },
  { "id": "hh_laundry_detergent", "name": "Laundry Detergent", "category": "Cleaning", "unitSize": "2L", "currentStock": 1, "avgDurationDays": 60, "pricePerUnit": 200, "lastOpenedDate": "2026-07-15", "durationHistory": [] },
  { "id": "hh_paper_towels", "name": "Paper Towels", "category": "Paper Goods", "unitSize": "6 rolls", "currentStock": 1, "avgDurationDays": 45, "pricePerUnit": 150, "lastOpenedDate": "2026-08-01", "durationHistory": [] }
);

writeData('recipes.json', recipes);
writeData('ingredients.json', ingredients);
writeData('pantry-items.json', pantryItems);
writeData('shoppinglists.json', shoppinglists);
writeData('mealplans.json', mealplans);
writeData('receipts.json', receipts);
writeData('consumption.json', consumption);
writeData('household.json', household);
writeData('settings.json', settings);

console.log('Seed data successfully generated.');
