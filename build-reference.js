const fs = require('fs');
let html = fs.readFileSync('reference.html', 'utf8');

// Replace Head
html = html.replace(/<head>[\s\S]*?<\/head>/, `
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reference & Substitutions — Larder</title>
    <link rel="icon" type="image/png" href="images/icon.png">
    <link rel="apple-touch-icon" href="images/icon.png">
    <link rel="stylesheet" href="styles.css">
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/lucide@latest"></script>
</head>
`.trim());

// Add data-theme
html = html.replace('<html lang="en">', '<html lang="en" data-theme="light">');

// Replace Nav
html = html.replace(/<nav class="navbar">[\s\S]*?<\/nav>/, `
<header class="app-header">
    <div class="header-main">
        <a href="./" class="brand-logo" aria-label="Larder Home">
            <img src="images/icon.png" alt="Larder Logo" class="logo-img" width="32" height="32">
            <span class="logo-text">Larder</span>
        </a>
        <nav class="nav-links">
            <a href="./" class="nav-link">Recipes</a>
            <a href="ingredients" class="nav-link">Ingredients</a>
            <a href="basics" class="nav-link">Basics</a>
            <a href="reference" class="nav-link active">Reference</a>
        </nav>
        <div class="header-actions">
            <button class="btn secondary" id="themeToggle" aria-label="Toggle dark mode" style="padding: 0.5rem; display: flex; align-items: center; justify-content: center; border-radius: 50%;">
                <span id="themeIcon" style="display:flex;"><i data-lucide="moon" style="width:18px;height:18px;"></i></span>
            </button>
        </div>
    </div>
</header>
`.trim());

// Add theme script to body
html = html.replace('</body>', `
    <script>
        const htmlTag = document.documentElement;
        const themeToggle = document.getElementById('themeToggle');
        const themeIcon = document.getElementById('themeIcon');
        function setTheme(theme) {
            htmlTag.setAttribute('data-theme', theme);
            localStorage.setItem('larder_theme', theme);
            if (themeIcon) {
                themeIcon.innerHTML = theme === 'dark' ? '<i data-lucide="sun" style="width: 18px; height: 18px;"></i>' : '<i data-lucide="moon" style="width: 18px; height: 18px;"></i>';
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
</body>
`);

fs.writeFileSync('reference.html', html);
console.log('Wrote reference.html');
