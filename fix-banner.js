const fs = require('fs');
const files = ['ingredients.html', 'basics.html', 'reference.html', 'cms.html', 'legal.html'];
const search = `<div id="gdpr-banner" class="gdpr-banner hidden no-print">
        <div class="gdpr-content">
            <p>Larder uses local storage solely to save your display preferences. We do not track or collect personal data.</p>
            <button id="gdpr-accept" class="btn btn-primary">Got it</button>
        </div>
    </div>`;
const replace = `<div id="gdpr-banner" class="hidden no-print">
        <p>Larder uses local storage solely to save your display preferences. We do not track or collect personal data.</p>
        <button id="gdpr-accept" class="btn btn-primary">Got it</button>
    </div>`;

files.forEach(f => {
    let html = fs.readFileSync(f, 'utf8');
    // Normalize newlines and spaces to find it if there's subtle differences
    let regex = /<div id="gdpr-banner" class="gdpr-banner hidden no-print">[\s\S]*?<\/div>\s*<\/div>/;
    html = html.replace(regex, replace);
    fs.writeFileSync(f, html);
    console.log('Fixed banner in', f);
});
