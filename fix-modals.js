const fs = require('fs');

// Patch HTML files
const htmlFiles = ['index.html', 'ingredients.html', 'cms.html'];
htmlFiles.forEach(file => {
    let html = fs.readFileSync(file, 'utf8');
    html = html.replace(/class="modal hidden"/g, 'class="modal-overlay"');
    html = html.replace(/class="close-btn"/g, 'class="modal-close"');
    html = html.replace(/class="cms-close"/g, 'class="modal-close cms-close"');
    html = html.replace(/class="food-close"/g, 'class="modal-close food-close"');
    fs.writeFileSync(file, html);
    console.log('Fixed modals in', file);
});

// Patch JS files
const jsFiles = ['app.js', 'cms.js'];
jsFiles.forEach(file => {
    let js = fs.readFileSync(file, 'utf8');
    js = js.replace(/\.classList\.remove\('hidden'\)/g, '.classList.add(\'active\')');
    js = js.replace(/\.classList\.add\('hidden'\)/g, '.classList.remove(\'active\')');
    // Wait, some other things might use hidden! (e.g. gdpr-banner, addBtn in CMS, etc).
    // Let's be careful and write more specific replaces for the JS files!
});
