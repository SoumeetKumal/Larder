const fs = require('fs');
const path = require('path');

const baseDir = __dirname;
const vdPath = path.join(baseDir, 'visual_direction.html');
const refPath = path.join(baseDir, 'reference.html');

// Read both files
const vdContent = fs.readFileSync(vdPath, 'utf-8');
const refContent = fs.readFileSync(refPath, 'utf-8');

// 1. Extract content from visual_direction.html between ABBREVIATIONS and SETTINGS sections
const startMarker = '<!-- SECTION: ABBREVIATIONS & SYMBOLS -->';
const endMarker = '<!-- SECTION: SETTINGS SHOWCASE -->';

const startIdx = vdContent.indexOf(startMarker);
const endIdx = vdContent.indexOf(endMarker);

if (startIdx === -1) {
    console.error('ERROR: Could not find start marker:', startMarker);
    process.exit(1);
}
if (endIdx === -1) {
    console.error('ERROR: Could not find end marker:', endMarker);
    process.exit(1);
}

// Extract the raw content (from ABBREVIATIONS through end of SHOPPING LIST)
const extractedRaw = vdContent.substring(startIdx, endIdx).trim();

console.log('Extracted content length:', extractedRaw.length);
console.log('First 200 chars:', extractedRaw.substring(0, 200));

// 2. Wrap the extracted content in the required container structure
const wrappedContent = `<div class="container" style="padding-bottom: 4rem;">
    <section class="section">
        <div class="section-header" style="margin-bottom: 1rem;">
            <h2>Reference & Pantry</h2>
            <p>Conversion tables, ingredient guides, and pantry management.</p>
        </div>
        ${extractedRaw}
    </section>
</div>`;

// 3. In reference.html, find the main content area to replace
// Replace everything from <div class="basics-layout"> through </main> + closing </div>
const refLines = refContent.split(/\r?\n/);

// Find the line with <div class="basics-layout"> 
let mainStartLine = -1;
let mainEndLine = -1;

for (let i = 0; i < refLines.length; i++) {
    if (refLines[i].includes('<div class="basics-layout">')) {
        mainStartLine = i;
    }
    // The closing </div> for basics-layout is on the line after </main>
    if (mainStartLine !== -1 && refLines[i].trim() === '</main>') {
        // The next line should be the closing </div> of basics-layout
        // Check line i+1
        if (i + 1 < refLines.length && refLines[i + 1].trim() === '</div>') {
            mainEndLine = i + 1;
        } else {
            mainEndLine = i;
        }
        break;
    }
}

if (mainStartLine === -1) {
    console.error('ERROR: Could not find <div class="basics-layout"> in reference.html');
    process.exit(1);
}
if (mainEndLine === -1) {
    console.error('ERROR: Could not find closing </main> in reference.html');
    process.exit(1);
}

console.log(`Replacing lines ${mainStartLine + 1} to ${mainEndLine + 1} in reference.html`);

// Also remove the scroll-spy script that's specific to the old sidebar layout
let scriptStartLine = -1;
let scriptEndLine = -1;
for (let i = mainEndLine + 1; i < refLines.length; i++) {
    if (refLines[i].includes('// Scroll-spy for sidebar navigation')) {
        // Go back to find the <script> tag
        for (let j = i; j >= mainEndLine; j--) {
            if (refLines[j].includes('<script>')) {
                scriptStartLine = j;
                break;
            }
        }
    }
    if (scriptStartLine !== -1 && refLines[i].includes('</script>') && i > scriptStartLine) {
        scriptEndLine = i;
        break;
    }
}

// Build the new file
const beforeMain = refLines.slice(0, mainStartLine);
const afterMain = scriptEndLine !== -1
    ? refLines.slice(scriptEndLine + 1)
    : refLines.slice(mainEndLine + 1);

const newContent = [
    ...beforeMain,
    '',
    wrappedContent,
    '',
    ...afterMain,
].join('\n');

fs.writeFileSync(refPath, newContent, 'utf-8');

// 4. Verify
const verifyContent = fs.readFileSync(refPath, 'utf-8');
const checks = [
    ['vd-pantry-grid', verifyContent.includes('vd-pantry-grid')],
    ['Smoke Point', verifyContent.includes('Smoke Point')],
    ['vd-shop-container', verifyContent.includes('vd-shop-container')],
    ['Reference & Pantry', verifyContent.includes('Reference & Pantry')],
    ['abbrev-symbol', verifyContent.includes('abbrev-symbol')],
    ['nav still present', verifyContent.includes('<nav class="top-nav">')],
    ['footer still present', verifyContent.includes('vd-footer')],
    ['old basics-layout removed', !verifyContent.includes('basics-layout')],
    ['old basics-sidebar removed', !verifyContent.includes('basics-sidebar')],
    ['old scroll-spy removed', !verifyContent.includes('Scroll-spy for sidebar')],
];

console.log('\n--- Verification ---');
let allPassed = true;
for (const [label, result] of checks) {
    const status = result ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status}: ${label}`);
    if (!result) allPassed = false;
}

if (allPassed) {
    console.log('\nAll checks passed! reference.html has been updated successfully.');
} else {
    console.log('\nSome checks FAILED. Please review the output.');
}
