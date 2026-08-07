// Mobile Nav Toggle
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
        const open = navLinks.classList.toggle('open');
        navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', (e) => {
        if (navLinks.classList.contains('open') && !navLinks.contains(e.target) && !navToggle.contains(e.target)) {
            navLinks.classList.remove('open');
            navToggle.setAttribute('aria-expanded', 'false');
        }
    });
}

// Theme Logic
const htmlTag = document.documentElement;

function setTheme(theme) {
    htmlTag.setAttribute('data-theme', theme);
    localStorage.setItem('larder_theme', theme);
    
    // Update all theme toggles currently in the DOM
    document.querySelectorAll('#themeToggle, .theme-toggle').forEach(toggle => {
        const themeIcon = toggle.querySelector('#themeIcon') || toggle.querySelector('.theme-icon') || (toggle.querySelector('i') ? toggle.querySelector('i').parentElement : toggle);
        if (themeIcon) {
            const isSidebar = toggle.classList.contains('cms-sidebar-link');
            const size = isSidebar ? '16px' : '18px';
            themeIcon.innerHTML = theme === 'dark' ? `<i data-lucide="sun" style="width: ${size}; height: ${size};"></i>` : `<i data-lucide="moon" style="width: ${size}; height: ${size};"></i>`;
        }
        const themeText = toggle.querySelector('#themeText');
        if (themeText) {
            themeText.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
        }
    });
    if (window.lucide) window.lucide.createIcons();
}

const savedTheme = localStorage.getItem('larder_theme');
if (savedTheme) {
    setTheme(savedTheme);
} else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
}

// Event Delegation for Theme Toggles (handles dynamic elements and multiple instances)
document.addEventListener('click', (e) => {
    const toggle = e.target.closest('#themeToggle, .theme-toggle');
    if (toggle) {
        const currentTheme = htmlTag.getAttribute('data-theme');
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    }
});

// Ensure Lucide icons are initialized if loaded
if (window.lucide) {
    window.lucide.createIcons();
}
