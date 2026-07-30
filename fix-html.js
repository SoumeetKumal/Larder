const fs = require('fs');

const files = ['index.html', 'ingredients.html', 'basics.html', 'reference.html', 'cms.html', 'legal.html'];

const newFooter = `
<footer class="vd-footer no-print">
    <div class="vd-footer-inner">
        <div class="vd-footer-brand">
            <div class="footer-logo">
                <img src="images/icon.png" alt="Larder Logo" style="width: 24px; height: 24px; margin-right: 0.5rem; vertical-align: middle;">
                <span style="font-weight: 700; font-size: 1.2rem;">Larder</span>
            </div>
            <p style="margin-top: 1rem;">Your personal recipe manager, meal planner, and kitchen companion — built for home cooks who love to organise, experiment, and eat well.</p>
        </div>
        <div class="vd-footer-col">
            <h4>Navigate</h4>
            <a href="./">Recipes</a>
            <a href="ingredients">Ingredients</a>
            <a href="basics">Basics</a>
            <a href="reference">Reference</a>
            <a href="cms">Manage</a>
        </div>
        <div class="vd-footer-col">
            <h4>Resources</h4>
            <a href="reference#conversions">Conversions</a>
            <a href="reference#oils">Oil Reference</a>
            <a href="reference#flour">Flour Guide</a>
            <a href="reference#bakeware">Pan Sizes</a>
        </div>
        <div class="vd-footer-col">
            <h4>Legal</h4>
            <a href="legal#disclaimer">Disclaimer</a>
            <a href="legal#terms">Terms of Use</a>
            <a href="legal#privacy">Privacy Policy</a>
        </div>
    </div>
    <div class="vd-footer-bottom">
        <span>© <span id="current-year">2026</span> Larder. All rights reserved.</span>
        <div class="vd-footer-bottom-links">
            <a href="legal#disclaimer">Disclaimer</a>
            <a href="legal#terms">Terms</a>
            <a href="legal#privacy">Privacy</a>
        </div>
    </div>
</footer>
`;

files.forEach(file => {
    let html = fs.readFileSync(file, 'utf8');
    
    // Remove text from theme button
    html = html.replace(/<span id="themeText">.*?<\/span>/g, '');
    
    // Replace old footer with new footer
    html = html.replace(/<footer class="site-footer no-print">[\s\S]*?<\/footer>/, newFooter.trim());
    
    // Fix current year script for new footer structure if missing
    if (!html.includes("document.getElementById('current-year').textContent = new Date().getFullYear();")) {
        html = html.replace('</body>', `<script>document.getElementById('current-year').textContent = new Date().getFullYear();</script>\n</body>`);
    }

    fs.writeFileSync(file, html);
    console.log('Fixed HTML layout issues in', file);
});

// Also fix the theme button in build scripts just in case
const buildScripts = ['build-basics.js', 'build-cms.js', 'build.js'];
buildScripts.forEach(script => {
    if (fs.existsSync(script)) {
        let content = fs.readFileSync(script, 'utf8');
        content = content.replace(/<span id="themeText">.*?<\/span>/g, '');
        fs.writeFileSync(script, content);
    }
});
