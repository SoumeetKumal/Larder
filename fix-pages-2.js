const fs = require('fs');

const vd = fs.readFileSync('visual_direction.html', 'utf8');

// Extract Basics
let basicsStartStr = '<!-- SECTION: KITCHEN BASICS SHOWCASE -->';
let basicsEndStr = '<!-- SECTION: PANTRY SHOWCASE -->';
let basicsStart = vd.indexOf(basicsStartStr);
let basicsEnd = vd.indexOf(basicsEndStr);

if (basicsStart !== -1 && basicsEnd !== -1) {
    let basicsContent = vd.substring(basicsStart + basicsStartStr.length, basicsEnd);
    // Remove the component showcase header
    basicsContent = basicsContent.replace(/<div class="vd-section-header">[\s\S]*?<\/div>/, '');

    let basicsHtml = fs.readFileSync('basics.html', 'utf8');
    let targetStart = basicsHtml.indexOf('<main role="main">');
    if (targetStart === -1) targetStart = basicsHtml.indexOf('<main role="main" class="section">');
    let targetEnd = basicsHtml.indexOf('</main>');
    
    if (targetStart !== -1 && targetEnd !== -1) {
        let newMain = `
        <main role="main" class="section">
            <h1 style="margin-bottom: 2rem; color: var(--text-main);">Kitchen Basics</h1>
            ${basicsContent}
        </main>
        `;
        basicsHtml = basicsHtml.substring(0, targetStart) + newMain.trim() + basicsHtml.substring(targetEnd + 7);
        fs.writeFileSync('basics.html', basicsHtml);
        console.log('Successfully updated basics.html');
    }
} else {
    console.log('Could not find basics in vd');
}

// Extract Reference
let refStartStr = '<!-- SECTION: PANTRY SHOWCASE -->';
let refEndStr = '<!-- Shopping List Showcase -->'; // We should probably include both Pantry and Shopping list?
let refEndStr2 = '<!-- SECTION: SETTINGS SHOWCASE -->'; // Include both
let refStart = vd.indexOf(refStartStr);
let refEnd = vd.indexOf(refEndStr2);

if (refStart !== -1 && refEnd !== -1) {
    let refContent = vd.substring(refStart, refEnd);
    // Remove headers if needed
    refContent = refContent.replace(/<div class="vd-section-header">[\s\S]*?<\/div>/g, '');
    
    let refHtml = fs.readFileSync('reference.html', 'utf8');
    let targetStart = refHtml.indexOf('<main role="main">');
    if (targetStart === -1) targetStart = refHtml.indexOf('<main role="main" class="section">');
    let targetEnd = refHtml.indexOf('</main>');
    
    if (targetStart !== -1 && targetEnd !== -1) {
        let newMain = `
        <main role="main" class="section">
            <h1 style="margin-bottom: 2rem; color: var(--text-main);">Pantry & Shopping List</h1>
            ${refContent}
        </main>
        `;
        refHtml = refHtml.substring(0, targetStart) + newMain.trim() + refHtml.substring(targetEnd + 7);
        fs.writeFileSync('reference.html', refHtml);
        console.log('Successfully updated reference.html');
    }
} else {
    console.log('Could not find reference in vd');
}
