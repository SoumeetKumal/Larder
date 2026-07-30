const fs = require('fs');

const files = ['basics.html', 'ingredients.html', 'reference.html', 'legal.html', 'cms.html'];

files.forEach(file => {
    let html = fs.readFileSync(file, 'utf8');
    
    // For regular pages
    if (html.includes('<header class="app-header">')) {
        const newNav = `
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
                    <span id="themeIcon"><i data-lucide="moon" style="width: 18px; height: 18px;"></i></span> <span id="themeText">Dark Mode</span>
                </button>
            </div>
        </nav>
        `.trim();
        
        html = html.replace(/<header class="app-header">[\s\S]*?<\/header>/, newNav);
        fs.writeFileSync(file, html);
        console.log('Fixed nav in', file);
    }
    
    // For CMS page
    if (file === 'cms.html' && html.includes('<nav class="cms-navbar">')) {
        const newCmsNav = `
        <nav class="top-nav">
            <a href="cms" class="brand-logo" style="text-decoration:none;">
                <img src="images/icon.png" alt="Larder Logo" style="height: 36px; width: 36px; border-radius: 8px; object-fit: contain;">
                LARDER CMS
            </a>
            
            <div style="display: flex; gap: 1.5rem; align-items: center;">
                <a href="./" class="btn btn-ghost" style="padding: 0.5rem 1rem;">Recipes</a>
                <a href="ingredients" class="btn btn-ghost" style="padding: 0.5rem 1rem;">Ingredients</a>
                <a href="basics" class="btn btn-ghost" style="padding: 0.5rem 1rem;">Basics</a>
                <a href="reference" class="btn btn-ghost" style="padding: 0.5rem 1rem;">Reference</a>
                <button class="theme-toggle" id="themeToggle" aria-label="Toggle Dark Mode">
                    <span id="themeIcon"><i data-lucide="moon" style="width: 18px; height: 18px;"></i></span>
                </button>
            </div>
        </nav>
        `.trim();
        
        html = html.replace(/<nav class="cms-navbar">[\s\S]*?<\/nav>/, newCmsNav);
        fs.writeFileSync(file, html);
        console.log('Fixed nav in cms.html');
    }
});
