const fs = require('fs');

let cmsHTML = fs.readFileSync('cms.html', 'utf8');

// Replace standard nav with new cms-navbar
cmsHTML = cmsHTML.replace(/<nav class="navbar">([\s\S]*?)<\/nav>/, `
    <nav class="cms-navbar">
        <a href="cms" class="brand-logo" style="text-decoration: none;">
            <img src="images/icon.png" alt="Larder Logo" width="28" height="28" style="border-radius: 6px;">
            Larder CMS
        </a>
        <div class="nav-links">
            <a href="./" class="nav-link">Recipes</a>
            <a href="ingredients" class="nav-link">Ingredients</a>
            <a href="basics" class="nav-link">Basics</a>
            <a href="reference" class="nav-link">Reference</a>
        </div>
        <div>
            <button class="btn secondary" id="themeToggle" style="padding: 0.5rem; display: flex; align-items: center;"><i data-lucide="moon" style="width: 18px; height: 18px;"></i></button>
        </div>
    </nav>`);

// Update container class to cms-dashboard
cmsHTML = cmsHTML.replace('<main class="container">', '<main class="cms-dashboard">');

// Add lucide script and data-theme to HTML
cmsHTML = cmsHTML.replace('<html lang="en">', '<html lang="en" data-theme="light">');
cmsHTML = cmsHTML.replace('</head>', '    <script src="https://unpkg.com/lucide@latest"></script>\n</head>');

// Ensure lucide renders and theme toggle works
cmsHTML = cmsHTML.replace('</body>', `
    <script>
        // Simple Theme Logic for CMS
        const htmlTag = document.documentElement;
        const themeToggle = document.getElementById('themeToggle');
        
        function setTheme(theme) {
            htmlTag.setAttribute('data-theme', theme);
            localStorage.setItem('larder_theme', theme);
            if (themeToggle) {
                themeToggle.innerHTML = theme === 'dark' ? '<i data-lucide="sun" style="width: 18px; height: 18px;"></i>' : '<i data-lucide="moon" style="width: 18px; height: 18px;"></i>';
                if (window.lucide) window.lucide.createIcons();
            }
        }
        const savedTheme = localStorage.getItem('larder_theme');
        if (savedTheme) { setTheme(savedTheme); }
        else { setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
        
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                setTheme(htmlTag.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
            });
        }
        
        if (window.lucide) window.lucide.createIcons();
    </script>
</body>`);

fs.writeFileSync('cms.html', cmsHTML);
console.log('Wrote cms.html');
