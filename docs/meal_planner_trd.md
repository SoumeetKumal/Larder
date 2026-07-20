# Technical Requirements Document (TRD): Meal Planner

## 1. System Architecture
The Meal Planner acts as a direct extension of the Shared Knowledge Layer (Larder CMS Server). 
Instead of being a standalone mobile application, it is built as a set of new tabs (Plan, Pantry, Lists) directly within the existing local Larder CMS web interface (`cms.html`).

- **Primary Data Source:** Larder CMS Node.js Server (`server.js`)
- **Data Storage:** The Node server manages new local JSON files (`data/mealplans.json`, `data/pantry.json`, `data/shoppinglists.json`) alongside the existing ingredients and recipes.
- **Network Mode:** LAN-First. The CMS is accessed via local network (`http://<LAN_IP>:8000/cms`).

## 2. Technology Stack
*Must match the existing Larder CMS stack entirely:*
- **Frontend / Client:** Vanilla HTML5, CSS3, and JavaScript (`cms.html`, `cms.js`, `styles.css`). No complex frameworks.
- **Backend:** Node.js (Vanilla `http` module, no Express required).
- **Local Storage:** Server-side JSON files persisted to the local file system.
- **State Management:** Simple in-memory arrays in `cms.js` that sync to the server via REST endpoints.

## 3. Data Models (JSON Schema)

### 3.1. MealPlan
Represents a scheduled slot in the calendar.
```typescript
interface MealPlan {
  id: string;              // UUID
  date: string;            // YYYY-MM-DD
  slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  type: 'recipe' | 'component' | 'eating_out';
  referenceId?: string;    // Larder Recipe ID or Component ID (null if eating_out)
  notes?: string;          // User specific notes ("Keep it light")
  isConsumed: boolean;     // Status toggle for Fit Track integration
}
```

### 3.2. PantryItem
Represents the local inventory overrides for ingredients pulled from Larder.
```typescript
interface PantryItem {
  foodId: string;          // Links to Larder Ingredient ID
  quantity: number;        // Current stock level
  unit: string;            // Inherited from Larder, overrides possible
  isTracked: boolean;      // If false, system ignores this for shopping lists
}
```

### 3.3. ShoppingList
Represents a generated execution list.
```typescript
interface ShoppingList {
  id: string;
  generatedAt: number;     // Unix timestamp
  dateRange: { start: string, end: string }; // What this list covers
  items: ShoppingListItem[];
}

interface ShoppingListItem {
  foodId: string;
  requiredAmount: number;
  unit: string;
  isChecked: boolean;
}
```

## 4. API & Sync Requirements

### 4.1. Larder Server Endpoints
The CMS `server.js` must be extended with the following REST endpoints to handle the new JSON files:
- `GET /api/mealplans` & `PUT /api/mealplans`
- `GET /api/pantry` & `PUT /api/pantry`
- `GET /api/shoppinglists` & `PUT /api/shoppinglists`

**Integration Behavior:**
- The `cms.js` script fetches all 5 datasets (recipes, ingredients, mealplans, pantry, shoppinglists) simultaneously upon loading.
- Edits in the browser are sent back to the Node server to persist in the `data/` folder.

### 4.2. Aggregation Engine (The Core Logic)
The app requires an engine function within `cms.js` to generate shopping lists:
`generateList(startDate, endDate) -> ShoppingListItem[]`
**Algorithm steps:**
1. Filter the loaded `mealplans` array for records between `startDate` and `endDate`.
2. Filter out `eating_out` records.
3. For each `recipe` record, find the matching object in the loaded `recipes` array.
4. Iterate through recipe ingredients.
5. Check the `pantry` array by `foodId`.
6. If `isTracked === false` (or not present), skip ingredient entirely.
7. If `isTracked === true`, calculate `Deficit = Required - PantryQuantity`.
8. If `Deficit > 0`, aggregate `Deficit` into the final array based on `foodId` and standardized `unit`.
9. Return array sorted by category (if category data is available).

## 5. Security & Privacy
- All planning, pantry, and shopping data remains 100% on the local hosting machine.
- No external internet calls are made.
- No user authentication required (trusting the local network).
