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
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const themeText = document.getElementById('themeText');

function setTheme(theme) {
    htmlTag.setAttribute('data-theme', theme);
    localStorage.setItem('larder_theme', theme);
    if (themeIcon) {
        themeIcon.innerHTML = theme === 'dark' ? '<i data-lucide="sun" style="width: 18px; height: 18px;"></i>' : '<i data-lucide="moon" style="width: 18px; height: 18px;"></i>';
        if (window.lucide) window.lucide.createIcons();
    }
    if (themeText) {
        themeText.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
}

const savedTheme = localStorage.getItem('larder_theme');
if (savedTheme) {
    setTheme(savedTheme);
} else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
}

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const currentTheme = htmlTag.getAttribute('data-theme');
        setTheme(currentTheme === 'dark' ? 'light' : 'dark');
    });
}

// Ensure Lucide icons are initialized if loaded
if (window.lucide) {
    window.lucide.createIcons();
}
