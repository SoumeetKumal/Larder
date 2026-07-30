const fs = require('fs');

const vd = fs.readFileSync('visual_direction.html', 'utf8');

// ==== Kitchen Basics ====
// Line 2504 in visual_direction.html is <!-- SECTION: KITCHEN BASICS SHOWCASE -->
// End is the kbModal HTML (around line 3787)
let kbStart = vd.indexOf('<!-- SECTION: KITCHEN BASICS SHOWCASE -->');
let kbEnd = vd.indexOf('<!-- KITCHEN BASICS MODAL HTML -->');
if (kbEnd === -1) kbEnd = vd.indexOf('<div id="kbModal"');

if (kbStart !== -1 && kbEnd !== -1) {
    let kbContent = vd.substring(kbStart, kbEnd);
    
    // Remove the wrapping container and section header if they exist
    // Actually it's easier to just strip the specific vd-section-header
    kbContent = kbContent.replace(/<div class="vd-section-header">[\s\S]*?<\/div>/g, '');
    
    // Also extract the modal script and HTML
    let scriptEnd = vd.indexOf('</body>');
    let kbModalStr = vd.substring(kbEnd, scriptEnd);

    let basicsHtml = fs.readFileSync('basics.html', 'utf8');
    
    let targetStart = basicsHtml.indexOf('<main');
    let targetEnd = basicsHtml.indexOf('</main>');
    
    if (targetStart !== -1 && targetEnd !== -1) {
        // Find closing tag of main
        let mainClose = targetEnd + 7;
        
        let newContent = `
        <div class="container" style="padding-bottom: 4rem;">
            <section class="section">
                <div class="section-header" style="margin-bottom: 1rem;">
                    <h2>Kitchen Basics</h2>
                    <p>A comprehensive visual guide to culinary equipment and techniques.</p>
                </div>
                ${kbContent}
            </section>
        </div>
        ${kbModalStr}
        `;
        
        // Remove old sidebar layout wrapping
        let sidebarLayoutStart = basicsHtml.indexOf('<div class="basics-layout">');
        
        // Ensure we replace from basics-layout (if exists) up to main
        if (sidebarLayoutStart !== -1) {
            basicsHtml = basicsHtml.substring(0, sidebarLayoutStart) + newContent + basicsHtml.substring(mainClose);
        } else {
            basicsHtml = basicsHtml.substring(0, targetStart) + newContent + basicsHtml.substring(mainClose);
        }
        
        fs.writeFileSync('basics.html', basicsHtml);
        console.log('Fixed basics.html');
    }
} else {
    console.log('Failed to find KB bounds:', kbStart, kbEnd);
}

// ==== Reference ====
let refStart = vd.indexOf('<!-- SECTION: ABBREVIATIONS & SYMBOLS -->');
let refEnd = vd.indexOf('<!-- SECTION: SETTINGS SHOWCASE -->');

if (refStart !== -1 && refEnd !== -1) {
    let refContent = vd.substring(refStart, refEnd);
    refContent = refContent.replace(/<div class="vd-section-header">[\s\S]*?<\/div>/g, '');
    
    let refHtml = fs.readFileSync('reference.html', 'utf8');
    
    let targetStart = refHtml.indexOf('<main');
    let targetEnd = refHtml.indexOf('</main>');
    
    if (targetStart !== -1 && targetEnd !== -1) {
        let mainClose = targetEnd + 7;
        
        let newContent = `
        <div class="container" style="padding-bottom: 4rem;">
            <section class="section">
                <div class="section-header" style="margin-bottom: 1rem;">
                    <h2>Reference & Pantry</h2>
                    <p>Conversion tables, ingredient guides, and pantry management.</p>
                </div>
                ${refContent}
            </section>
        </div>
        `;
        
        let sidebarLayoutStart = refHtml.indexOf('<div class="basics-layout">');
        if (sidebarLayoutStart !== -1) {
            refHtml = refHtml.substring(0, sidebarLayoutStart) + newContent + refHtml.substring(mainClose);
        } else {
            refHtml = refHtml.substring(0, targetStart) + newContent + refHtml.substring(mainClose);
        }
        
        fs.writeFileSync('reference.html', refHtml);
        console.log('Fixed reference.html');
    }
} else {
    console.log('Failed to find Ref bounds:', refStart, refEnd);
}
