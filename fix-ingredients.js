const fs = require('fs');

let html = fs.readFileSync('ingredients.html', 'utf8');

const newToolbar = `
        <!-- Filter Toolbar -->
        <div class="filter-toolbar" id="mainFilterToolbar">
            <span class="toolbar-title" id="results-count">0 Ingredients</span>
            <div style="position: relative; display: flex; align-items: center;">
                <button class="search-trigger" id="searchTrigger" aria-label="Search">
                    <i data-lucide="search" style="width: 20px; height: 20px;"></i>
                </button>
                <div class="search-bar-wrap" id="searchBarWrap">
                    <i data-lucide="search" class="search-bar-icon"></i>
                    <input type="text" class="search-input" id="search-input" placeholder="Search ingredients...">
                    <button class="search-close" id="searchClose"><i data-lucide="x"></i></button>
                </div>
            </div>

            <button class="filter-trigger" id="filterTrigger" aria-label="Filter">
                <i data-lucide="sliders-horizontal" style="width: 20px; height: 20px;"></i>
                <span class="filter-badge" id="filterBadge" style="display:none;">0</span>
            </button>

            <!-- Filter Dropdown Panel -->
            <div class="filter-dropdown" id="filterDropdown">
                <div class="filter-dropdown-header">
                    <h4>Filter Ingredients</h4>
                    <button class="filter-reset" id="filterReset">Reset All</button>
                </div>

                <div class="filter-section">
                    <div class="filter-section-title">Category</div>
                    <div class="filter-chips-scrollable" id="category-filters">
                        <!-- Categories injected here -->
                    </div>
                </div>
            </div>
        </div>
`;

// Replace from <!-- Filter Toolbar --> to the end of the filter dropdown
const startIndex = html.indexOf('<!-- Filter Toolbar -->');
let endIndex = html.indexOf('<div class="ingredients-table-container">');
if (endIndex === -1) {
    endIndex = html.indexOf('<!-- Ingredients Table -->');
}
if (endIndex === -1) {
    endIndex = html.indexOf('<div style="overflow-x: auto;">'); // another possible structure
}

if (startIndex !== -1 && endIndex !== -1) {
    html = html.substring(0, startIndex) + newToolbar.trim() + '\n\n        ' + html.substring(endIndex);
    fs.writeFileSync('ingredients.html', html);
    console.log('Fixed ingredients toolbar');
} else {
    console.log('Could not find toolbar bounds');
}
