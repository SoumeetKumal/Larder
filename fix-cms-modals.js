const fs = require('fs');

let js = fs.readFileSync('cms.js', 'utf8');

// confirmDialog
js = js.replace("confirmDialog.classList.remove('hidden');", "confirmDialog.classList.add('active');");
js = js.replace("confirmDialog.classList.add('hidden');", "confirmDialog.classList.remove('active');");

// assignModal
js = js.replace("assignModal.classList.remove('hidden');", "assignModal.classList.add('active');");
// There are 3 adds for assignModal
js = js.replace(/assignModal\.classList\.add\('hidden'\);/g, "assignModal.classList.remove('active');");

// modal
js = js.replace("modal.classList.remove('hidden');", "modal.classList.add('active');");
js = js.replace("modal.classList.add('hidden');", "modal.classList.remove('active');");

// foodModal
js = js.replace("foodModal.classList.remove('hidden');", "foodModal.classList.add('active');");
js = js.replace("foodModal.classList.add('hidden');", "foodModal.classList.remove('active');");

// Also check for Escape key logic in cms.js
js = js.replace(/!modal\.classList\.contains\('hidden'\)/g, "modal.classList.contains('active')");
js = js.replace(/!foodModal\.classList\.contains\('hidden'\)/g, "foodModal.classList.contains('active')");
js = js.replace(/!confirmDialog\.classList\.contains\('hidden'\)/g, "confirmDialog.classList.contains('active')");

fs.writeFileSync('cms.js', js);
console.log('Fixed modals in cms.js');
