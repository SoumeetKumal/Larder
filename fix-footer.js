const fs = require('fs');

const vd = fs.readFileSync('visual_direction.html', 'utf8');

const rawFooter = vd.substring(vd.indexOf('<footer class="vd-footer">'), vd.indexOf('</footer>') + 9);
// I will replace `vdFooterYear` with `current-year` so it matches app.js if needed.
const newFooter = rawFooter.replace('id="vdFooterYear"', 'id="current-year"');

const newBanner = `    <div id="gdpr-banner" class="hidden no-print">
        <p>Larder uses local storage solely to save your display preferences. We do not track or collect personal data.</p>
        <button id="gdpr-accept" class="btn btn-primary" style="align-self: flex-start; padding: 0.5rem 1rem;">Got it</button>
    </div>`;

const files = ['index.html', 'ingredients.html', 'basics.html', 'reference.html', 'cms.html', 'legal.html'];

files.forEach(f => {
    let html = fs.readFileSync(f, 'utf8');
    
    // Replace GDPR Banner
    const bannerStart = html.indexOf('<div id="gdpr-banner"');
    if (bannerStart !== -1) {
        const bannerEnd = html.indexOf('</div>', bannerStart) + 6;
        // Wait, the banner might have an inner div if it was the old one, but I already replaced it with a simple one.
        // I will use regex to be safe.
        html = html.replace(/<div id="gdpr-banner"[\s\S]*?<\/div>(\s*<\/div>)?/, newBanner);
    }
    
    // Replace Footer
    const footerStart = html.indexOf('<footer');
    if (footerStart !== -1) {
        const footerEnd = html.indexOf('</footer>') + 9;
        html = html.substring(0, footerStart) + newFooter + html.substring(footerEnd);
    }
    
    fs.writeFileSync(f, html);
    console.log('Fixed ' + f);
});
