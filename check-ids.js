const fs = require('fs');
const html = fs.readFileSync('visual_direction_cms.html', 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
console.log(ids);
