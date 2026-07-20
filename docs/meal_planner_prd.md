# Product Requirements Document (PRD): Meal Planner

## 1. Product Overview
**Name:** Meal Planner
**Purpose:** The execution engine for the Food & Health Ecosystem. Built directly into the Larder CMS web interface as a set of new tabs, it bridges the Shared Knowledge Layer with household reality by enabling flexible meal scheduling, intelligent shopping list generation, and low-friction pantry management.
**Target Audience:** The household (supporting both structured meal prep and spontaneous from-scratch cooking), accessed locally via the browser.
**Philosophy:** Adaptability over rigidity. Tools should serve the stewardship of health, not become a burden.

---

## 2. Core Features & Acceptance Criteria

### Feature 1: Flexible Meal Scheduling
Users can assign recipes, meal components, or placeholders to specific days and meal slots (Breakfast, Lunch, Dinner, Snack).

**Acceptance Criteria:**
- **Add Recipe:** Given a user opens a meal slot, when they select "Add Recipe", they can search and select from the Larder CMS recipe list; on selection, the recipe title and primary image populate the slot.
- **Add Component:** A user can assign an individual component (e.g., "Batch Rice") to a slot without selecting a full recipe.
- **Eating Out Placeholder:** When a user selects "Eating Out" for a slot, the UI immediately blocks that slot with a visual placeholder, and the system registers 0 ingredients required for that meal.
- **Drag and Drop:** A user can tap and hold a planned meal and drag it to an empty slot on a different day; the plan updates immediately and saves to local storage within 500ms.
- **Spontaneous Slots:** A user can leave any slot completely blank. The system treats blank slots as "0 requirements" without issuing warnings or errors.

### Feature 2: Smart Shopping List Generation
Users can dynamically generate aggregated shopping lists based on a selected timeframe.

**Acceptance Criteria:**
- **Timeframe Selection:** Given a populated meal plan, when the user clicks "Generate List", they can select the scope: "Single Meal", "Today", "Next 7 Days", or "Custom Range (Start Date to End Date)".
- **Accurate Aggregation:** Given 3 planned recipes that require "0.5 cups White Rice", "1 cup White Rice", and "0.25 cups White Rice", when a list is generated, the list displays exactly "1.75 cups White Rice" as a single entry.
- **Cross-Unit Conversion (Optional but preferred):** If recipe A requires "500g Chicken" and recipe B requires "1kg Chicken", the shopping list aggregates them to "1500g Chicken" or "1.5kg Chicken" if unit logic permits; otherwise it lists them separately if units are incompatible.
- **List Interaction:** When a user checks off an item on the generated shopping list, the item visually strikes through; checked state persists locally even if the app is closed and reopened.

### Feature 3: Opt-In Pantry Management
Users can track inventory for specific ingredients to offset shopping list generation, while ignoring low-value staples.

**Acceptance Criteria:**
- **Tracked Toggle:** When viewing an ingredient in the Pantry view, a user can toggle "Track Inventory". By default, all new ingredients import as "Untracked".
- **Untracked Exclusion:** Given "Salt" is marked as "Untracked", when a weekly shopping list is generated that includes recipes requiring "Salt", the item "Salt" is completely omitted from the final shopping list.
- **Inventory Subtraction:** Given the pantry has "500g Chicken" marked as "Tracked", and the weekly plan requires "1500g Chicken", when the shopping list is generated, it recommends purchasing exactly "1000g Chicken".
- **Manual Override:** A user can manually adjust the pantry stock of a tracked item using `+` and `-` buttons; changes must update the database immediately and reflect in any active shopping list upon regeneration.

### Feature 4. Integration with Food Ecosystem
Because the Meal Planner lives directly inside the Larder CMS, it inherently shares the exact same data source as the rest of the ecosystem.

**Acceptance Criteria:**
- **Direct Data Access:** The planner natively reads the server's `recipes.json` and `ingredients.json` without needing network sync logic.
- **Fit Track Export (Future Prep):** When a user marks a planned meal as "Eaten", the CMS flags the meal plan record with `status: consumed` and a `consumedAt` timestamp, exposing this state via a new API endpoint for Fit Track to potentially ingest later.

---

## 3. Out of Scope (For Now)
- Automated grocery ordering/delivery integrations.
- Strict caloric constraints blocking meal placement (the app will *show* macros if available, but will not prevent you from planning a heavy meal).
- Multi-user real-time collaboration (local network sync is sufficient).
