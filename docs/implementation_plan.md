# Implementation Plan: Meal Planner (Larder CMS Integration)

This roadmap breaks the Meal Planner integration into small, demonstrable steps. Each step builds on the previous one and can be verified independently before moving forward.

## Step 1: Server Data Foundation
**Goal:** Establish the new JSON data stores and REST API endpoints in the Node server.
**Actions:**
- Create `data/mealplans.json`, `data/pantry.json`, and `data/shoppinglists.json` initialized as empty arrays `[]`.
- Update `server.js` to add `GET` and `PUT` endpoints for these three files.
- Update `cms.js` `loadData()` to fetch all 5 datasets on startup.
**Success Check:** Open a browser to `http://<IP>:8000/api/mealplans` and verify it returns `[]`. Open the CMS, check the browser console network tab, and verify all 5 API calls succeed on page load.

## Step 2: Navigation & UI Shell
**Goal:** Expand the CMS interface to accommodate the new modules.
**Actions:**
- Add three new tabs to `cms.html`: **Meal Plan**, **Pantry**, and **Shopping Lists**.
- Update the `cmsTabs` click listener in `cms.js` to handle hiding/showing the respective container `div`s.
**Success Check:** Click the "Pantry" tab and verify the screen changes to an empty placeholder view, and clicking back to "Recipes" shows the recipe list.

## Step 3: Pantry Management (Opt-in Tracking)
**Goal:** Build the pantry interface to merge ingredient definitions with local stock levels.
**Actions:**
- Build a Pantry table in `cms.js` that renders every ingredient from `ingredients.json`.
- Add a "Tracked" checkbox and a "Stock Quantity" input to each row. 
- Map these inputs to the `pantry.json` data.
- Add a "Save Pantry" button.
**Success Check:** Toggle "Tracked" for Salt, set stock to 500, click Save. Hard refresh the page and verify Salt still shows as tracked with a stock of 500.

## Step 4: Meal Plan Calendar Shell
**Goal:** Create the visual week-view for meal scheduling.
**Actions:**
- Build a dynamic 7-day grid in the Meal Plan tab (e.g., displaying the current week).
- Each day column should have 4 slots: Breakfast, Lunch, Dinner, Snack.
**Success Check:** Open the Meal Plan tab and visually confirm a 7-day layout with the correct 4 slots rendered for each day.

## Step 5: Scheduling & Placeholders
**Goal:** Enable assigning recipes or placeholders to calendar slots.
**Actions:**
- Clicking an empty slot opens a small modal with two options: "Select Recipe" (dropdown populated from `recipes.json`) or "Eating Out".
- Clicking a populated slot allows removing it.
- Add a "Save Plan" button that sends the schedule to `PUT /api/mealplans`.
**Success Check:** Assign "Chicken Curry" to Monday Dinner, assign "Eating Out" to Tuesday Lunch, click Save. Hard refresh the page and verify Monday and Tuesday retain those exact assignments.

## Step 6: Core Aggregation Engine (Logic Only)
**Goal:** Write the JavaScript algorithm that calculates what needs to be bought.
**Actions:**
- Write the `generateList(startDate, endDate)` function in `cms.js`.
- It must loop through scheduled meals, look up recipe ingredients, aggregate matching IDs, subtract `Stock Quantity` for items where `isTracked` is true, and return the deficit.
**Success Check:** Assign a recipe requiring 500g Chicken to Monday. In the Pantry, mark Chicken as "Tracked" with 200g stock. Open the browser console, run `generateList()`, and verify it outputs an array containing exactly 1 item: `Chicken, 300g`.

## Step 7: Shopping List UI
**Goal:** Expose the aggregation engine to the user visually.
**Actions:**
- In the Shopping Lists tab, add a "Generate Weekly List" button.
- When clicked, it runs the engine and renders a checklist on screen.
- Clicking an item crosses it out.
**Success Check:** Click "Generate Weekly List". Verify the UI displays "Chicken: 300g" with a checkbox next to it. Clicking the checkbox strikes through the text.

---

> [!IMPORTANT]
> **User Review Required**
> Do these 7 steps provide the exact level of granularity and testability you are looking for? Once approved, we will begin execution with **Step 1**.
