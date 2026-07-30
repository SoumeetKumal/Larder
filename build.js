const fs = require('fs');

const svgBlock = fs.readFileSync('index.html', 'utf8').match(/(<svg style="display: none;" xmlns="http:\/\/www.w3.org\/2000\/svg">[\s\S]*?<\/svg>)/)[1];

const indexHTML = `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Larder</title>
    <link rel="shortcut icon" href="images/icon.ico">
    <link rel="icon" type="image/png" href="images/icon.png">
    <link rel="apple-touch-icon" href="images/icon.png">
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/lucide@latest"></script>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <nav class="top-nav">
            <a href="./" class="brand-logo" style="text-decoration:none;">
                <img src="images/icon.png" alt="Larder Logo" style="height: 36px; width: 36px; border-radius: 8px; object-fit: contain;">
                LARDER
            </a>
            
            <div style="display: flex; gap: 1.5rem; align-items: center;">
                <a href="./" class="btn btn-ghost" style="padding: 0.5rem 1rem;">Recipes</a>
                <a href="ingredients" class="btn btn-ghost" style="padding: 0.5rem 1rem;">Ingredients</a>
                <a href="basics" class="btn btn-ghost" style="padding: 0.5rem 1rem;">Basics</a>
                <a href="reference" class="btn btn-ghost" style="padding: 0.5rem 1rem;">Reference</a>
                <a href="cms" class="btn btn-ghost" id="cms-link" style="padding: 0.5rem 1rem;">Manage</a>
                <button class="theme-toggle" id="themeToggle" aria-label="Toggle Dark Mode">
                    <span id="themeIcon"><i data-lucide="moon" style="width: 18px; height: 18px;"></i></span> 
                </button>
            </div>
        </nav>

        <!-- Filter Toolbar -->
        <div class="filter-toolbar" id="mainFilterToolbar">
            <span class="toolbar-title" id="results-count">0 Recipes</span>
            <div style="position: relative; display: flex; align-items: center;">
                <button class="search-trigger" id="searchTrigger" aria-label="Search">
                    <i data-lucide="search" style="width: 20px; height: 20px;"></i>
                </button>
                <div class="search-bar-wrap" id="searchBarWrap">
                    <i data-lucide="search" class="search-bar-icon"></i>
                    <input type="text" class="search-input" id="search-input" placeholder="Search recipes...">
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
                    <h4>Filter Recipes</h4>
                    <button class="filter-reset" id="filterReset">Reset All</button>
                </div>

                <div class="filter-section">
                    <div class="filter-section-title">Category</div>
                    <div class="filter-chips-scrollable" id="category-filters">
                        <!-- Categories injected here -->
                    </div>
                </div>

                <div class="filter-section">
                    <div class="filter-section-title">Nutrition (per serving)</div>
                    <div class="range-slider-group">
                        <div class="range-label">
                            <span class="range-label-text">Calories</span>
                            <span class="range-label-values" id="filter-cal-val">Any</span>
                        </div>
                        <div class="dual-range" id="slider-cal-container">
                            <div class="range-track"></div>
                            <div class="range-fill" id="slider-cal-fill" style="left: 0%; width: 100%;"></div>
                            <input type="range" min="0" max="2000" step="50" value="0" id="slider-cal-min" class="macro-slider-min">
                            <input type="range" min="0" max="2000" step="50" value="2000" id="slider-cal-max" class="macro-slider-max">
                        </div>
                    </div>
                    <div class="range-slider-group">
                        <div class="range-label">
                            <span class="range-label-text">Carbs</span>
                            <span class="range-label-values" id="filter-carbs-val">Any</span>
                        </div>
                        <div class="dual-range" id="slider-carbs-container">
                            <div class="range-track"></div>
                            <div class="range-fill" id="slider-carbs-fill" style="left: 0%; width: 100%;"></div>
                            <input type="range" min="0" max="200" step="5" value="0" id="slider-carbs-min" class="macro-slider-min">
                            <input type="range" min="0" max="200" step="5" value="200" id="slider-carbs-max" class="macro-slider-max">
                        </div>
                    </div>
                    <div class="range-slider-group">
                        <div class="range-label">
                            <span class="range-label-text">Protein</span>
                            <span class="range-label-values" id="filter-protein-val">Any</span>
                        </div>
                        <div class="dual-range" id="slider-protein-container">
                            <div class="range-track"></div>
                            <div class="range-fill" id="slider-protein-fill" style="left: 0%; width: 100%;"></div>
                            <input type="range" min="0" max="150" step="5" value="0" id="slider-protein-min" class="macro-slider-min">
                            <input type="range" min="0" max="150" step="5" value="150" id="slider-protein-max" class="macro-slider-max">
                        </div>
                    </div>
                    <div class="range-slider-group">
                        <div class="range-label">
                            <span class="range-label-text">Fat</span>
                            <span class="range-label-values" id="filter-fat-val">Any</span>
                        </div>
                        <div class="dual-range" id="slider-fat-container">
                            <div class="range-track"></div>
                            <div class="range-fill" id="slider-fat-fill" style="left: 0%; width: 100%;"></div>
                            <input type="range" min="0" max="150" step="5" value="0" id="slider-fat-min" class="macro-slider-min">
                            <input type="range" min="0" max="150" step="5" value="150" id="slider-fat-max" class="macro-slider-max">
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <main role="main">
            <div id="recipe-grid" class="grid-3" role="list" aria-label="Recipe cards">
                <div class="empty-state">Loading...</div>
            </div>
        </main>

        <!-- Pagination Bar -->
        <div class="pagination-bar" id="paginationBar">
            <div class="pagination-left">
                <label for="itemsPerPage">Show</label>
                <select class="per-page-select" id="itemsPerPage">
                    <option value="20" selected>20</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="200">200</option>
                </select>
                <label>per page</label>
            </div>
            <div class="pagination-center" id="pagination-info">
                Showing <strong>0</strong> recipes
            </div>
            <div class="pagination-right">
                <button class="page-btn" id="page-prev" disabled aria-label="Previous page"><i data-lucide="chevron-left"></i></button>
                <div class="flex-row" style="gap: 0.25rem;" id="pagination-numbers">
                    <button class="page-num active">1</button>
                </div>
                <button class="page-btn" id="page-next" disabled aria-label="Next page"><i data-lucide="chevron-right"></i></button>
            </div>
        </div>
    </div>

    <!-- Modal for Recipe Details -->
    <div id="recipe-modal" class="modal hidden" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-content" id="modal-container">
            <button class="close-btn" id="modal-close" aria-label="Close modal"><i data-lucide="x"></i></button>
            <div id="modal-body"></div>
        </div>
    </div>

    <div id="gdpr-banner" class="gdpr-banner hidden no-print">
        <div class="gdpr-content">
            <p>Larder uses local storage solely to save your display preferences. We do not track or collect personal data.</p>
            <button id="gdpr-accept" class="btn btn-primary">Got it</button>
        </div>
    </div>

    <footer class="site-footer no-print" style="text-align: center; margin-top: 4rem; padding-bottom: 2rem; color: var(--text-muted); font-size: 0.9rem;">
        <span>© <span id="current-year">2026</span> Larder. All rights reserved.</span>
        <div class="footer-links" style="display:flex; justify-content:center; gap: 1rem; margin-top:0.5rem;">
            <a href="legal#disclaimer">Disclaimer</a>
            <a href="legal#terms">Terms</a>
            <a href="legal#privacy">Privacy</a>
        </div>
    </footer>

    ${svgBlock}

    <script>
        document.getElementById('current-year').textContent = new Date().getFullYear();
        if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            const cmsLink = document.getElementById('cms-link');
            if (cmsLink) cmsLink.style.display = 'none';
        }
    </script>
    <script src="app.js"></script>
</body>
</html>`;

fs.writeFileSync('index.html', indexHTML);
console.log('Wrote index.html');
