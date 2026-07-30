const fs = require('fs');

const vd = fs.readFileSync('visual_direction.html', 'utf8');

// ==== Kitchen Basics ====
let kbStartStr = '<!-- SECTION: KITCHEN BASICS SHOWCASE -->';
let kbEndStr = '</div>\n</div>\n\n<!-- Kitchen Basics Modal (Hidden by default) -->';
let kbStart = vd.indexOf(kbStartStr);
let kbEnd = vd.indexOf('<!-- Kitchen Basics Modal', kbStart);

if (kbStart !== -1 && kbEnd !== -1) {
    let kbContent = vd.substring(kbStart + kbStartStr.length, kbEnd);
    kbContent = kbContent.replace(/<div class="vd-section-header">[\s\S]*?<\/div>/, '');

    // Get the modal and script
    let modalScript = vd.substring(kbEnd, vd.indexOf('</body>'));

    let basicsHtml = fs.readFileSync('basics.html', 'utf8');
    let targetStart = basicsHtml.indexOf('<main role="main">');
    let targetEnd = basicsHtml.indexOf('</main>');
    
    if (targetStart !== -1 && targetEnd !== -1) {
        let newMain = `
        <main role="main">
            <h1 style="margin-bottom: 2rem; color: var(--text-main);">Kitchen Basics</h1>
            ${kbContent.trim()}
        </main>
        ${modalScript.trim()}
        `;
        basicsHtml = basicsHtml.substring(0, targetStart) + newMain.trim() + '\n' + basicsHtml.substring(targetEnd + 7);
        // Clean up double body tags or old scripts if any
        fs.writeFileSync('basics.html', basicsHtml);
        console.log('Successfully updated basics.html');
    }
}

// ==== Reference & Pantry ====
let refStartStr = '<!-- SECTION: REFERENCE TABLE SHOWCASE -->';
let refEndStr = '<!-- SECTION: SETTINGS SHOWCASE -->';
let refStart = vd.indexOf(refStartStr);
let refEnd = vd.indexOf(refEndStr);

if (refStart !== -1 && refEnd !== -1) {
    let refContent = vd.substring(refStart, refEnd);
    refContent = refContent.replace(/<div class="vd-section-header">[\s\S]*?<\/div>/g, '');
    
    let refHtml = fs.readFileSync('reference.html', 'utf8');
    let targetStart = refHtml.indexOf('<main role="main">');
    let targetEnd = refHtml.indexOf('</main>');
    
    if (targetStart !== -1 && targetEnd !== -1) {
        let newMain = `
        <main role="main">
            <h1 style="margin-bottom: 2rem; color: var(--text-main);">Reference & Pantry</h1>
            ${refContent.trim()}
        </main>
        `;
        refHtml = refHtml.substring(0, targetStart) + newMain.trim() + '\n' + refHtml.substring(targetEnd + 7);
        fs.writeFileSync('reference.html', refHtml);
        console.log('Successfully updated reference.html');
    }
}
