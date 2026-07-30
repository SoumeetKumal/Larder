const fs = require('fs');
const path = require('path');

const dir = __dirname;
const vdPath = path.join(dir, 'visual_direction.html');
const basicsPath = path.join(dir, 'basics.html');

// Read source files
const vdLines = fs.readFileSync(vdPath, 'utf8').split('\n');
const basicsContent = fs.readFileSync(basicsPath, 'utf8');
const basicsLines = basicsContent.split(/\r?\n/);

// --- STEP 1: Extract showcase inner content (lines 2512-2693, the grids inside the section) ---
// We want the inner content: everything between the section-header closing </div> (line 2510) and </section> (line 2694)
// i.e. lines 2511 through 2693 (0-indexed: 2510 through 2692)
const showcaseInnerLines = vdLines.slice(2510, 2693); // lines 2511-2693 (1-indexed)
const showcaseInner = showcaseInnerLines.join('\n');

// --- STEP 2: Extract kbModal HTML + JS (lines 3787-3879) ---
const modalLines = vdLines.slice(3786, 3879); // lines 3787-3879 (1-indexed)
const modalContent = modalLines.join('\n');

// --- STEP 3: Build the new main content ---
const newMainContent = `    <div class="container" style="padding-bottom: 4rem;">
    <section class="section">
        <div class="section-header" style="margin-bottom: 1rem;">
            <h2>Kitchen Basics</h2>
            <p>A comprehensive visual guide to culinary equipment and techniques.</p>
        </div>

${showcaseInner}

    </section>
</div>

${modalContent}`;

// --- STEP 4: Replace in basics.html ---
// Find the start: <div class="basics-layout"> (line 32)
// Find the end: </div> that closes basics-layout (line 256)
// Also remove the old sidebar scroll-spy script (lines 258-288)

// We need to find:
// 1. The line with <div class="basics-layout">
// 2. The closing </div> after </main> (line 256)
// 3. The old scroll-spy <script> block (lines 258-288)

let startIdx = -1;
let endIdx = -1;

for (let i = 0; i < basicsLines.length; i++) {
    if (basicsLines[i].includes('<div class="basics-layout">')) {
        startIdx = i;
        break;
    }
}

// The old layout ends at line 256 (</div> closing basics-layout), 0-indexed = 255
// Then the scroll-spy script goes from line 258-288 (0-indexed 257-287)
// We want to replace lines 32-288 (0-indexed 31-287) with our new content

// Find the scroll-spy script end
let scrollSpyEndIdx = -1;
for (let i = startIdx; i < basicsLines.length; i++) {
    if (basicsLines[i].includes('sections.forEach(section => observer.observe(section))')) {
        // The script closing </script> should be a couple lines after
        for (let j = i; j < i + 5 && j < basicsLines.length; j++) {
            if (basicsLines[j].trim() === '</script>') {
                scrollSpyEndIdx = j;
                break;
            }
        }
        break;
    }
}

if (startIdx === -1) {
    console.error('Could not find <div class="basics-layout">');
    process.exit(1);
}

if (scrollSpyEndIdx === -1) {
    // Fallback: just find the </div> after </main>
    for (let i = startIdx; i < basicsLines.length; i++) {
        if (basicsLines[i].trim() === '</main>') {
            // Next non-empty line should be </div>
            for (let j = i + 1; j < i + 3; j++) {
                if (basicsLines[j].trim() === '</div>') {
                    endIdx = j;
                    break;
                }
            }
            break;
        }
    }
    scrollSpyEndIdx = endIdx;
}

console.log(`Replacing lines ${startIdx + 1} through ${scrollSpyEndIdx + 1} (1-indexed)`);

// Build the new file
const before = basicsLines.slice(0, startIdx);
const after = basicsLines.slice(scrollSpyEndIdx + 1);

const newBasicsContent = before.join('\n') + '\n' + newMainContent + '\n' + after.join('\n');

fs.writeFileSync(basicsPath, newBasicsContent, 'utf8');

console.log('Done! basics.html has been rewritten.');

// Verify
const result = fs.readFileSync(basicsPath, 'utf8');
const hasGrid = result.includes('vd-kb-grid');
const hasModal = result.includes('kbModal');
const hasOldLayout = result.includes('basics-layout');
const hasOldSidebar = result.includes('basics-sidebar');
const hasNav = result.includes('<nav class="top-nav">');
const hasFooter = result.includes('vd-footer');

console.log(`\nVerification:`);
console.log(`  Contains vd-kb-grid: ${hasGrid}`);
console.log(`  Contains kbModal: ${hasModal}`);
console.log(`  Old basics-layout removed: ${!hasOldLayout}`);
console.log(`  Old basics-sidebar removed: ${!hasOldSidebar}`);
console.log(`  Nav bar preserved: ${hasNav}`);
console.log(`  Footer preserved: ${hasFooter}`);

if (hasGrid && hasModal && !hasOldLayout && !hasOldSidebar && hasNav && hasFooter) {
    console.log('\n✅ All checks passed!');
} else {
    console.log('\n❌ Some checks failed!');
}
