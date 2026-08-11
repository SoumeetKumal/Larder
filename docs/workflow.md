# Larder — Realistic Workflow

This document describes *how the app should function* in daily life, written as
user stories straight from how we actually cook and shop. It is the north star:
every feature in the PRD exists to serve one of these moments.

Two audiences share the same data:

- **Public website** (GitHub Pages) — recipes, ingredients, kitchen reference. Read-only for visitors.
- **Personal app** — the Electron CMS on the PC and (later) a phone app. This is where all living data lives: pantry, meal plans, shopping, receipts, prices, stats.

---

## A. Authoring & publishing recipes (public)

### A1. I have a new recipe, I open Larder CMS

1. I open the CMS and start a new recipe.
2. I enter: **title**, **tagline** (short description), **number of servings**, **time**,
   and the steps.
3. There is a **Prep section** at the top of the steps area — for mise en place —
   separated from the **method**.
4. Inside the method I can create **subsections** (e.g. "For the sauce", "For the
   pasta") so long recipes stay readable. The website renders them as headings and
   restarts step numbering under each one.
5. I can add an image **from a local file or from the internet**.
6. I start typing an ingredient name. Larder **suggests** matching ingredients from
   the catalog (by name or category). I can either **add a suggested one** or
   **create a new ingredient** inline.
   - If I create one, I'm pointed to where I can flesh it out later (nutrition,
     price, category) — the Foods tab in the CMS.
7. In the steps I can **link an ingredient** (e.g. "Add the `[tagliatelle]` to boiling
   water") so the step text points at the ingredient profile.
8. I **save** and **publish** to the website.

### A2. I open the recipe on the website

1. The new recipe appears in the list alongside the others.
2. I open it. The **ingredient names are links**: hovering shows a clear "opens in a
   new tab" affordance (underline + external-link icon).
3. I can open an ingredient in a new tab to see its full profile page.
4. In the instructions, linked ingredient mentions behave the same way.

### A3. I maintain ingredients

1. I open the Ingredients page and see every ingredient with its details.
2. Editing is easy and immediate (name, nutrition, category, price).
3. When an ingredient is referenced by recipes, those recipes reflect the link.

---

## B. Daily cooking — the pantry loop (personal)

### B1. Incremental build-up

- At first we **add and build the pantry** item by item. Later we only add new items occasionally.

### B2. After dinner, we update the pantry

We cooked dinner. Two ways to update stock:

1. **Recipe-based (recommended):** I open the recipe we cooked and tap
   **"I cooked this"**. The app shows a **confirmation** listing the ingredients and
   amounts it will subtract. I confirm → pantry decrements automatically.
   I can tweak "we only used half" on the confirmation screen.
2. **Manual:** I open the pantry and either **edit the total amount** directly, or
   use the **"Used" button** on an item — I type how much I used, done.

Both paths write to the same stock; both are fast because the phone/app is always near.

---

## C. The shopping trip (personal + shared)

### C1. Routine weekly shop

1. A few days before the shop, I check the pantry roughly — the numbers are there.
2. Some meals are already planned in the **meal plan**.
3. I hit **"Generate shopping list"**.
   - The app computes **meal-plan ingredients minus what's in the pantry** (per
     linked product).
   - It adds **household items running low** and **tracked pantry items running low**.
4. I review and adjust quantities (we have 500 g of chicken thighs at home, the plan
   wants 2.5 kg, and we have freezer space → bump to 3 kg).
5. I can **include/exclude any item** individually before finalising.

### C2. Spontaneous mid-week shop (no pantry check done)

1. I've updated only 2–3 items this week; I didn't check the pantry.
2. I generate the list from the plan + what I know. The app uses **tracked stock
   levels** and **usage history** to estimate what's low.
3. My wife is already at the supermarket. I **send the list to her phone**.

### C3. Shopping with a shared live checklist

1. The list appears as an **interactive checklist** on both phones.
2. Each item has a checkbox. When she ticks "in basket", **my phone updates live**
   (and vice-versa). Either of us can join mid-trip and we always see the same list.
3. **Every generated list is saved and dated** — we can trace back any past list
   (what we planned vs what we bought) anytime.
4. Each item shows its **expected cost**, and the app keeps a running **expected
   total** based on historical prices for the exact products (Granoro fettuccine
   vs Barilla fettuccine vs a generic average).
5. Same-type comparison is easy: tap an item → see historical price + the price of
   comparable products we've bought before.

### C4. Receipt capture & price recording

1. After shopping we get receipts. We use the Larder phone app to **scan the
   receipt (OCR)**.
2. We get a **confirmation screen**: every line, parsed and matched to ingredients/
   products. We can edit or drop any line, fix the store/date/total.
3. We confirm. The app:
   - **Compares** each item's price against the last price we paid (or the list's
     expected price) and shows the **% change** (increase / discount / same).
   - Shows the **expected total** (from our list) vs the **real total**.
   - Offers **"Update price"** per item → writes into the **price history** for that
     exact product and updates its average.
4. Every previous price stays in history — comparable at any time.

---

## D. Understanding ourselves (stats)

Over time Larder builds a profile from receipts, pantry usage, and plans:

- **Totals**: monthly spend, per store, per category, per week.
- **Patterns**: what we buy regularly, when, at which store, how much.
- **Price history charts**: per exact product and per product type.
- **Our own inflation**: how *the things we actually buy* change price — separate
  from government inflation figures.
- **Savings signals**: products where switching brands saves money, what we
  overstock, where we waste.

---

## E. Meal planning that knows our pantry (personal)

### E1. Planning with real products

1. I plan "Tuna pasta" for Tuesday.
2. The recipe says **tagliatelle** (a generic ingredient). In the plan, the
   ingredient is shown as tagliatelle with a **generic/average price**.
3. I tap it → Larder lists **all linked pantry products** (Granoro Tagliatelle,
   Barilla Tagliatelle, ...). I pick **Granoro**.
4. The price for the plan updates from the generic average to Granoro's price.
5. **Next time** I add the same recipe, Larder **remembers my last choice** and
   pre-selects Granoro. If I change to Barilla, it remembers Barilla next time.

### E2. Household items

1. Toothpaste starts with an **estimated duration** (90 days) and a min/max
   **threshold**.
2. As we actually use items, Larder learns the **real duration** from "opened on"
   dates and manual "used one" updates.
3. We can always manually set **how much is left** or **when a new one was opened**
   — we won't always have time to log it at the moment, and that's fine.
4. Household items have the same **brand/product + price history + shopping-list**
   treatment as food.

---

## F. End-of-month planning (personal)

1. We already have our **energy/macros/micros targets** in settings; I review and
   adjust.
2. I build the monthly plan. Larder keeps **suggesting** ingredients to help me
   land close to the targets (I'm not great at this — the app does the math).
3. I add the actual **pantry products** (brand + pack) into the plan.
4. I generate the end-of-month shop:
   - **Select all** → get all plan ingredients with the option to include/exclude
     **pantry stock individually** (don't overstock salt, but the freezer has room
     for more chicken).
   - Add all **household items running low**.
   - For each, Larder shows **what's already at home** to inform the decision.
5. I finalise → the list is generated and **pushed to both phones** (mine + my
   wife's) ready for shopping.
6. **Next month**: I don't re-add everything from scratch. The plan **saves as a
   template**, I reopen it, adjust, and confirm. When confirmed, the plan records
   **date/month saved** (and time) so we know which version we used.

---

## G. Cross-cutting expectations

- **Everything personal is offline-first** and lives on our PC; the phone talks to
  it when on the same network (and later, optionally, via cloud sync).
- **Nothing is lost**: backup/restore round-trips, and every generated list and
  price change is traceable.
- **Everything is editable later**: prices, plans, templates, ingredients, pantry —
  fixing a mistake is never more than a couple of taps.
