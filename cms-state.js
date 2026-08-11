// Larder CMS shared state anchor (extracted from cms.js).
// cms.js redefines these properties as live getters/setters backed by its
// closure state, so per-tab modules always read/write the same live data.
(function (root) {
    'use strict';

    const defaults = {
        recipes: [],
        ingredients: [],
        mealPlans: [],
        pantry: [],
        pantryItems: [],
        shoppingLists: [],
        householdItems: [],
        planner: { goals: {}, items: [] },
        receipts: [],
        consumption: [],
        appSettings: { profiles: [] },

        currentCMSTab: 'recipe',
        cmsSearchQuery: '',
        mealWeekOffset: 0,
        cmsCategoryFilter: 'All',
        cmsStatusFilter: 'All',
        cmsSelectedTags: new Set(),
        cmsTagSearch: '',
        cmsMacroFilters: {
            cal: { min: null, max: null },
            carbs: { min: null, max: null },
            protein: { min: null, max: null },
            fat: { min: null, max: null },
            time: { min: null, max: null }
        },
        cmsListView: 'list',
        lastMacroBreakdown: null,
        householdOpenFn: null,
        cmsTableSort: {},
        cmsSlidersInitialized: false,
        pendingShoppingSources: null,
        recipeManualTags: [],

        apiKey: 'larder_local_sync_8f92k',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer larder_local_sync_8f92k'
        }
    };

    root.CMSState = root.CMSState || {};
    Object.keys(defaults).forEach((k) => {
        Object.defineProperty(root.CMSState, k, {
            configurable: true,
            enumerable: true,
            writable: true,
            value: defaults[k]
        });
    });
})(typeof self !== 'undefined' ? self : this);
