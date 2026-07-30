const fs = require('fs');

const vd = fs.readFileSync('visual_direction.html', 'utf8');

// Extract Kitchen Basics block
let basicsStart = vd.indexOf('<!-- Kitchen Basics Showcase -->');
let basicsEnd = vd.indexOf('<!-- Pantry Showcase -->');
if (basicsStart !== -1 && basicsEnd !== -1) {
    let basicsContent = vd.substring(basicsStart, basicsEnd);
    
    // Replace the main block in basics.html
    let basicsHtml = fs.readFileSync('basics.html', 'utf8');
    let targetStart = basicsHtml.indexOf('<div class="basics-layout">');
    let targetEnd = basicsHtml.indexOf('<footer');
    if (targetStart !== -1 && targetEnd !== -1) {
        // Strip out the title "Component Showcase" and wrap in a proper main layout
        basicsContent = basicsContent.replace('<div class="vd-section-header">\\n            <h2>Component Showcase: Kitchen Basics</h2>\\n            <p>Static reference content from the books.</p>\\n        </div>', '');
        
        const newMain = `
        <main role="main" class="section">
            <h1 style="margin-bottom: 2rem; color: var(--text-main);">Kitchen Basics</h1>
            ${basicsContent}
        </main>
        `;
        
        basicsHtml = basicsHtml.substring(0, targetStart) + newMain + basicsHtml.substring(targetEnd);
        fs.writeFileSync('basics.html', basicsHtml);
        console.log('Fixed basics.html');
    }
}

// Extract Reference (Pantry/Shopping List) block
let refStart = vd.indexOf('<!-- Pantry Showcase -->');
let refEnd = vd.indexOf('<!-- Settings Showcase -->');
if (refStart !== -1 && refEnd !== -1) {
    let refContent = vd.substring(refStart, refEnd);
    
    let refHtml = fs.readFileSync('reference.html', 'utf8');
    let targetStart = refHtml.indexOf('<div class="basics-layout">');
    let targetEnd = refHtml.indexOf('<footer');
    if (targetStart !== -1 && targetEnd !== -1) {
        
        const newMain = `
        <main role="main" class="section">
            <h1 style="margin-bottom: 2rem; color: var(--text-main);">Reference & Pantry</h1>
            ${refContent}
        </main>
        `;
        
        refHtml = refHtml.substring(0, targetStart) + newMain + refHtml.substring(targetEnd);
        fs.writeFileSync('reference.html', refHtml);
        console.log('Fixed reference.html');
    }
}
