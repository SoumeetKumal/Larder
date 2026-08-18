'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPO_DATA = path.join(ROOT, 'data');
const APP_DATA = process.env.LARDER_APP_DATA || path.join(process.env.APPDATA || '', 'Larder', 'data');

const TARGETS = [REPO_DATA, APP_DATA];

const today = new Date();
const iso = (d) => d.toISOString().split('T')[0];
const dayOffset = (n) => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));

// ---- Ingredients (workflow A: add food) ----
const SEED_INGREDIENTS = [
  {
    foodId: 'paneer', name: 'Paneer', servingSizeG: 100, servingUnit: 'g',
    calories: 265, proteinG: 18, fatG: 21, carbsG: 1.2, fiberG: 0, sugarG: 0,
    category: 'Dairy', fdcId: '', fdcDesc: '', averagePrice: 150, priceCurrency: 'MUR',
    priceHistory: [{ date: dayOffset(-2), price: 150 }]
  },
  {
    foodId: 'chicken_wings', name: 'Chicken Wings', servingSizeG: 100, servingUnit: 'g',
    calories: 203, proteinG: 30, fatG: 8, carbsG: 0, fiberG: 0, sugarG: 0,
    category: 'Meat', fdcId: '', fdcDesc: '', averagePrice: 160, priceCurrency: 'MUR',
    priceHistory: [{ date: dayOffset(-2), price: 160 }]
  },
  {
    foodId: 'coconut_water', name: 'Coconut Water', servingSizeG: 240, servingUnit: 'ml',
    calories: 46, proteinG: 1.7, fatG: 0.5, carbsG: 9, fiberG: 1.2, sugarG: 6,
    category: 'Beverages', fdcId: '', fdcDesc: '', averagePrice: 25, priceCurrency: 'MUR',
    priceHistory: [{ date: dayOffset(-2), price: 25 }]
  }
];

// ---- Recipes (workflow A: author/publish) ----
const SEED_RECIPES = [
  {
    id: 'recipe_creamy_chicken_tagliatelle',
    entryType: 'recipe',
    title: 'Creamy Chicken Tagliatelle',
    category: 'Poultry',
    time: '30 mins',
    iconTag: '',
    description: 'Creamy garlic chicken tagliatelle, finished with parmigiano.',
    imageUrl: 'https://images.unsplash.com/photo-1608897013039-887f21d8c804?auto=format&fit=crop&w=800&q=80',
    status: 'published',
    macros: {
      macroReference: { type: 'per_serving', referenceAmount: '' },
      yield: '4', energy: '650 kCal', carbohydrate: '55 g', protein: '40 g', fat: '28 g'
    },
    ingredients: [
      { item: 'Tagliatelle', foodId: 'tagliatelle', metric: '250g', imperial: '2.5 cups' },
      { item: 'Chicken breast, skinless', foodId: 'chicken_breast_skinless', metric: '300g', imperial: '1.25 cups' },
      { item: 'Garlic', foodId: 'garlic', metric: '12g', imperial: '3 cloves' },
      { item: 'Onion', foodId: 'onion', metric: '80g', imperial: '0.5 medium' },
      { item: 'Heavy cream', foodId: 'heavy_cream', metric: '150g', imperial: '0.6 cup' },
      { item: 'Parmigiano Reggiano', foodId: 'parmigiano_reggiano', metric: '40g', imperial: '0.4 cup' },
      { item: 'Olive Oil', foodId: 'olive_oil', metric: '15g', imperial: '1 tbsp' },
      { item: 'Salt', foodId: 'salt', metric: '6g', imperial: '1 tsp' },
      { item: 'Pepper', foodId: 'pepper', metric: '3g', imperial: '0.5 tsp' }
    ],
    steps: [
      '## Prep',
      'Slice the chicken into bite-size strips and season with half the salt and pepper.',
      'Mince the garlic and dice the onion.',
      '## Cook the chicken',
      'Heat the olive oil in a large pan over medium-high heat and cook the [[chicken_breast_skinless|chicken]] until golden, about 5 minutes. Remove and set aside.',
      'In the same pan, soften the onion and garlic for 2 minutes.',
      '## Make the sauce',
      'Add the heavy cream and parmigiano reggiano, then stir until the cheese melts into a smooth sauce.',
      'Return the [[chicken_breast_skinless|chicken]] to the pan and simmer for 3 minutes.',
      'Meanwhile, cook the [[tagliatelle|Tagliatelle]] in salted boiling water until al dente, then toss with the sauce.',
      'Season to taste with the remaining salt and pepper and serve immediately.'
    ],
    prepSteps: ['Slice chicken into strips', 'Mince garlic', 'Dice onion'],
    prepTime: '10 mins',
    tags: ['ITALIAN', 'POULTRY'],
    note: 'The sauce can be made ahead and reheated gently.',
    variations: 'Swap chicken for shrimp or add mushrooms.'
  },
  {
    id: 'recipe_chicken_basil_rice',
    entryType: 'recipe',
    title: 'Basil Chicken Rice',
    category: 'Poultry',
    time: '25 mins',
    iconTag: '',
    description: 'One-pan chicken thighs with fragrant basil rice.',
    imageUrl: 'https://images.unsplash.com/photo-1598866594230-a7c12756260f?auto=format&fit=crop&w=800&q=80',
    status: 'published',
    macros: {
      macroReference: { type: 'per_serving', referenceAmount: '' },
      yield: '4', energy: '520 kCal', carbohydrate: '52 g', protein: '35 g', fat: '18 g'
    },
    ingredients: [
      { item: 'Chicken thighs', foodId: 'chicken_thigh_raw', metric: '400g', imperial: '1.7 cups' },
      { item: 'Rice', foodId: 'rice_white_medium_grain', metric: '250g', imperial: '1.25 cups' },
      { item: 'Fresh basil', foodId: 'basil_fresh', metric: '15g', imperial: '0.3 cup' },
      { item: 'Garlic', foodId: 'garlic', metric: '8g', imperial: '2 cloves' },
      { item: 'Olive Oil', foodId: 'olive_oil', metric: '20g', imperial: '1.5 tbsp' },
      { item: 'Salt', foodId: 'salt', metric: '5g', imperial: '0.8 tsp' },
      { item: 'Pepper', foodId: 'pepper', metric: '2g', imperial: '0.4 tsp' }
    ],
    steps: [
      '## Prep',
      'Season the [[chicken_thigh_raw|chicken thighs]] with salt and pepper. Chiffonade the basil.',
      '## Cook the chicken',
      'Heat olive oil in a deep pan and brown the chicken thighs on both sides, about 6 minutes.',
      'Add the garlic and stir for 30 seconds.',
      '## Rice',
      'Add the [[rice_white_medium_grain|rice]] and 500ml of water, cover and simmer for 15 minutes until the rice is tender.',
      'Fold in the fresh basil, rest for 5 minutes and serve.'
    ],
    prepSteps: ['Season chicken thighs', 'Chiffonade basil'],
    prepTime: '8 mins',
    tags: ['ASIAN'],
    note: '',
    variations: 'Add a squeeze of lime before serving.'
  }
];

// ---- Pantry items (workflow B / E: products + brand memory) ----
const SEED_PANTRY_ITEMS = [
  {
    pantryId: 'p_granoro',
    ingredientFoodId: 'tagliatelle',
    productName: 'Tagliatelle',
    brand: 'Granoro',
    packSize: 500,
    packUnit: 'g',
    price: 55,
    currency: 'MUR',
    quantity: 2,
    isTracked: true,
    avgDurationDays: 14,
    lastOpenedDate: dayOffset(-3),
    notes: 'Family favourite, cooks in 8 min',
    priceHistory: [{ date: dayOffset(-1), price: 55 }],
    lastPrice: 55,
    lastPriceDate: dayOffset(-1)
  },
  {
    pantryId: 'pantry_10_basmati_rice',
    ingredientFoodId: 'rice_white_medium_grain',
    productName: 'Basmati Rice',
    brand: 'Local Market',
    packSize: 1000,
    packUnit: 'g',
    price: 65,
    currency: 'MUR',
    quantity: 1,
    isTracked: true,
    avgDurationDays: 60,
    lastOpenedDate: dayOffset(-10),
    notes: '1kg bag, fluffy grains',
    priceHistory: [{ date: dayOffset(-1), price: 65 }],
    lastPrice: 65,
    lastPriceDate: dayOffset(-1)
  },
  {
    pantryId: 'pantry_11_chicken_thighs',
    ingredientFoodId: 'chicken_thigh_raw',
    productName: 'Chicken Thighs',
    brand: 'Farm Fresh',
    packSize: 500,
    packUnit: 'g',
    price: 170,
    currency: 'MUR',
    quantity: 1,
    isTracked: true,
    avgDurationDays: 4,
    lastOpenedDate: dayOffset(-2),
    notes: 'Bone-in, skin-on',
    priceHistory: [{ date: dayOffset(-1), price: 170 }],
    lastPrice: 170,
    lastPriceDate: dayOffset(-1)
  }
];

// ---- Household (workflow E2: household running low) ----
const SEED_HOUSEHOLD = [
  {
    id: 'hh_seed_hand_soap', name: 'Hand Soap', category: 'Toiletries',
    unitSize: 'bottle', currentStock: 1, minStock: 2, avgDurationDays: 40,
    pricePerUnit: 120, lastOpenedDate: dayOffset(-5), durationHistory: []
  },
  {
    id: 'hh_seed_toilet_paper', name: 'Toilet Paper', category: 'Paper Goods',
    unitSize: 'roll', currentStock: 3, minStock: 5, avgDurationDays: 21,
    pricePerUnit: 30, lastOpenedDate: dayOffset(-6), durationHistory: []
  }
];

// ---- Meal plans (workflow E: this week) ----
const SEED_MEAL_PLANS = [
  {
    id: 'mp_seed_20260817_dinner', date: dayOffset(0), slot: 'dinner', isEatingOut: false,
    items: [{ type: 'recipe', referenceId: 'recipe_creamy_chicken_tagliatelle' }],
    eaters: [
      { idx: 0, eatingOut: false, items: [{ type: 'recipe', referenceId: 'recipe_creamy_chicken_tagliatelle', name: 'Creamy Chicken Tagliatelle', servingSizeG: 250, grams: 250 }] },
      { idx: 1, eatingOut: false, items: [{ type: 'recipe', referenceId: 'recipe_creamy_chicken_tagliatelle', name: 'Creamy Chicken Tagliatelle', servingSizeG: 250, grams: 250 }] }
    ],
    servings: 2, isConsumed: false
  },
  {
    id: 'mp_seed_20260818_dinner', date: dayOffset(1), slot: 'dinner', isEatingOut: false,
    items: [{ type: 'recipe', referenceId: 'recipe_chicken_basil_rice' }],
    eaters: [
      { idx: 0, eatingOut: false, items: [{ type: 'recipe', referenceId: 'recipe_chicken_basil_rice', name: 'Basil Chicken Rice', servingSizeG: 250, grams: 250 }] },
      { idx: 1, eatingOut: true, items: [] }
    ],
    servings: 2, isConsumed: false
  },
  {
    id: 'mp_seed_20260819_lunch', date: dayOffset(2), slot: 'lunch', isEatingOut: false,
    items: [{ type: 'recipe', referenceId: '1' }],
    eaters: [
      { idx: 0, eatingOut: false, items: [{ type: 'recipe', referenceId: '1', name: 'TUNA PASTA', servingSizeG: 250, grams: 250 }] },
      { idx: 1, eatingOut: true, items: [] }
    ],
    servings: 2, isConsumed: false
  }
];

// ---- Shopping list (workflow C: today's list) ----
const SEED_SHOPPING_LISTS = [
  {
    id: 'sl_seed_' + dayOffset(0).replace(/-/g, ''),
    date: dayOffset(0),
    items: [
      { id: 'slx1', foodId: 'tagliatelle', name: 'Granoro Tagliatelle', amount: 500, unit: 'g', category: 'Grains', recipes: ['Creamy Chicken Tagliatelle'], checked: false, grams: 500, cost: 55, currency: 'MUR', sources: ['meals'], pantryIds: ['p_granoro'] },
      { id: 'slx2', foodId: 'chicken_breast_skinless', name: 'Chicken Breast', amount: 300, unit: 'g', category: 'Meat', recipes: ['Creamy Chicken Tagliatelle'], checked: false, grams: 300, cost: 108, currency: 'MUR', sources: ['meals'], pantryIds: [] },
      { id: 'slx3', foodId: 'basil_fresh', name: 'Fresh Basil', amount: 15, unit: 'g', category: 'Herbs', recipes: ['Basil Chicken Rice'], checked: false, grams: 15, cost: 10, currency: 'MUR', sources: ['meals'], pantryIds: [] }
    ],
    grams: 815,
    cost: 173,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
];

// ---- Receipts (workflow C4: receipt capture + price history) ----
const SEED_RECEIPTS = [
  {
    id: 'rc_seed_' + dayOffset(-1).replace(/-/g, ''),
    store: 'Winners',
    date: dayOffset(-1),
    total: 610,
    currency: 'MUR',
    items: [
      { name: 'Tagliatelle', price: 55 },
      { name: 'Chicken Breast', price: 220 },
      { name: 'Tomato Purée', price: 85 },
      { name: 'Garlic', price: 25 }
    ]
  },
  {
    id: 'rc_seed_' + dayOffset(-8).replace(/-/g, ''),
    store: 'Dream Price',
    date: dayOffset(-8),
    total: 240,
    currency: 'MUR',
    items: [
      { name: 'Rice', price: 65 },
      { name: 'Olive Oil', price: 175 }
    ]
  },
  {
    id: 'rc_seed_prevmonth',
    store: 'Winners',
    date: new Date(today.getFullYear(), today.getMonth() - 1, 15).toISOString().split('T')[0],
    total: 780,
    currency: 'MUR',
    items: [
      { name: 'Chicken Breast', price: 240 },
      { name: 'Tagliatelle', price: 52 }
    ]
  }
];

// ---- Consumption (workflow B: cooked + manual) ----
const SEED_CONSUMPTION = [
  {
    id: 'cons_seed_cooked',
    date: dayOffset(-1),
    recipeId: '1',
    recipeTitle: 'TUNA PASTA',
    servingsCooked: 3,
    items: [
      { foodId: 'tagliatelle', grams: 315 },
      { foodId: 'tomato_puree', grams: 125 },
      { foodId: 'garlic', grams: 20 }
    ]
  },
  {
    id: 'cons_seed_manual',
    date: dayOffset(0),
    recipeId: null,
    recipeTitle: 'Manual use: Olive Oil',
    servingsCooked: null,
    source: 'manual',
    items: [
      { foodId: 'olive_oil', grams: 15 }
    ]
  }
];

// ---- Planner (workflow F: monthly goals + items, pinned product) ----
const SEED_PLANNER = {
  goals: { proteinMin: 300, budget: 6000, currency: 'MUR' },
  items: [
    { ingredientId: 'tagliatelle', name: 'Tagliatelle', amount: 1, unit: 'kg', scope: 'month', useStock: true, pantryId: 'p_granoro' },
    { ingredientId: 'chicken_thigh_raw', name: 'Chicken thighs', amount: 1, unit: 'kg', scope: 'fresh', useStock: false, pantryId: '' },
    { ingredientId: 'rice_white_medium_grain', name: 'Rice', amount: 2, unit: 'kg', scope: 'month', useStock: true, pantryId: 'pantry_10_basmati_rice' }
  ]
};

// ---- Templates (workflow F) ----
const SEED_PLAN_TEMPLATES = [
  {
    id: 'tpl_seed_week',
    name: 'Seed week template',
    savedOn: new Date().toISOString(),
    eaters: [
      { idx: 0, eatingOut: false, items: [{ type: 'recipe', referenceId: 'recipe_creamy_chicken_tagliatelle', name: 'Creamy Chicken Tagliatelle', grams: 250 }] },
      { idx: 1, eatingOut: false, items: [{ type: 'recipe', referenceId: 'recipe_chicken_basil_rice', name: 'Basil Chicken Rice', grams: 250 }] }
    ]
  }
];

const SEED_PLANNER_MONTH_TEMPLATES = [
  {
    id: 'mt_seed_month',
    name: 'Seed month template',
    goals: { budget: 6000, currency: 'MUR' },
    items: [
      { ingredientId: 'tagliatelle', name: 'Tagliatelle', amount: 1, unit: 'kg', scope: 'month', useStock: true, pantryId: 'p_granoro' },
      { ingredientId: 'chicken_breast_skinless', name: 'Chicken breast', amount: 2, unit: 'kg', scope: 'fresh', useStock: false, pantryId: '' }
    ],
    savedOn: new Date().toISOString()
  }
];

const SEED_SHOPPING_TEMPLATES = [
  {
    id: 'st_seed_weekly',
    name: 'Seed weekly shop',
    sources: ['meals', 'restock', 'household'],
    items: [
      { id: 'stx1', foodId: 'tagliatelle', name: 'Granoro Tagliatelle', amount: 500, unit: 'g', category: 'Grains', recipes: [], checked: false, grams: 500, cost: 55, currency: 'MUR', sources: ['meals'], pantryIds: ['p_granoro'] },
      { id: 'stx2', foodId: null, name: 'Hand Soap', amount: 1, unit: 'bottle', category: 'Household', recipes: [], checked: false, grams: null, cost: 120, sources: ['household'] }
    ],
    savedOn: new Date().toISOString()
  }
];

// ---- Plan versions (workflow F) ----
const SEED_PLAN_VERSIONS = [
  {
    id: 'pv_seed_20260817',
    confirmedAt: new Date().toISOString(),
    itemCount: 4,
    plannedMealCount: 2,
    slotCount: 3,
    plans: SEED_MEAL_PLANS
  }
];

// ---- Product prefs (workflow E1: brand memory) ----
const SEED_PRODUCT_PREFS = [
  { foodId: 'tagliatelle', pantryId: 'p_granoro', updatedAt: new Date().toISOString() }
];

// ---- Settings (workflow D: national CPI overlay) ----
function seedSettings(existing) {
  return Object.assign({}, existing, { stats: Object.assign({}, existing.stats || {}, { cpi: 5 }) });
}

// ---- Merge helpers ----
const mergeByKey = (existing, additions, key) => {
  const out = Array.isArray(existing) ? existing.slice() : [];
  additions.forEach(a => {
    if (!out.some(e => e && e[key] === a[key])) out.push(a);
  });
  return out;
};

function writeFile(dir, file, data) {
  const target = path.join(dir, file);
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`  wrote ${target}`);
}

function readFile(dir, file) {
  const target = path.join(dir, file);
  if (!fs.existsSync(target)) return null;
  return JSON.parse(fs.readFileSync(target, 'utf8'));
}

function main() {
  for (const dir of TARGETS) {
    console.log(`\nSeeding ${dir}`);
    if (!fs.existsSync(dir)) { console.log('  (missing, skipping)'); continue; }

    const recipes = mergeByKey(readFile(dir, 'recipes.json') || [], SEED_RECIPES, 'id');
    writeFile(dir, 'recipes.json', recipes);

    const ingredients = mergeByKey(readFile(dir, 'ingredients.json') || [], SEED_INGREDIENTS, 'foodId');
    writeFile(dir, 'ingredients.json', ingredients);

    const pantryItems = mergeByKey(readFile(dir, 'pantry-items.json') || [], SEED_PANTRY_ITEMS, 'pantryId');
    writeFile(dir, 'pantry-items.json', pantryItems);

    const household = mergeByKey(readFile(dir, 'household.json') || [], SEED_HOUSEHOLD, 'id');
    writeFile(dir, 'household.json', household);

    const mealPlans = mergeByKey(readFile(dir, 'mealplans.json') || [], SEED_MEAL_PLANS, 'id');
    writeFile(dir, 'mealplans.json', mealPlans);

    const shoppingLists = mergeByKey(readFile(dir, 'shoppinglists.json') || [], SEED_SHOPPING_LISTS, 'id');
    writeFile(dir, 'shoppinglists.json', shoppingLists);

    const receipts = mergeByKey(readFile(dir, 'receipts.json') || [], SEED_RECEIPTS, 'id');
    writeFile(dir, 'receipts.json', receipts);

    const consumption = mergeByKey(readFile(dir, 'consumption.json') || [], SEED_CONSUMPTION, 'id');
    writeFile(dir, 'consumption.json', consumption);

    const planner = readFile(dir, 'planner.json') || { goals: {}, items: [] };
    const plannerOut = {
      goals: Object.assign({}, planner.goals || {}, SEED_PLANNER.goals),
      items: mergeByKey(planner.items || [], SEED_PLANNER.items, 'ingredientId')
    };
    writeFile(dir, 'planner.json', plannerOut);

    const settings = readFile(dir, 'settings.json') || {};
    writeFile(dir, 'settings.json', seedSettings(settings));

    const planTemplates = mergeByKey(readFile(dir, 'planner-templates.json') || [], SEED_PLAN_TEMPLATES, 'id');
    writeFile(dir, 'planner-templates.json', planTemplates);

    const monthTemplates = mergeByKey(readFile(dir, 'planner-month-templates.json') || [], SEED_PLANNER_MONTH_TEMPLATES, 'id');
    writeFile(dir, 'planner-month-templates.json', monthTemplates);

    const shoppingTemplates = mergeByKey(readFile(dir, 'shopping-templates.json') || [], SEED_SHOPPING_TEMPLATES, 'id');
    writeFile(dir, 'shopping-templates.json', shoppingTemplates);

    const planVersions = mergeByKey(readFile(dir, 'plan-versions.json') || [], SEED_PLAN_VERSIONS, 'id');
    writeFile(dir, 'plan-versions.json', planVersions);

    const productPrefs = mergeByKey(readFile(dir, 'product-prefs.json') || [], SEED_PRODUCT_PREFS, 'foodId');
    writeFile(dir, 'product-prefs.json', productPrefs);
  }
  console.log('\nDone.');
}

main();