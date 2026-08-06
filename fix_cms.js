const fs = require('fs');
const file = 'cms.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Add showToast after escapeHtml
if (!content.includes('function showToast')) {
    const toastFunc = 

    // --- UI Toast Notifications ---
    function showToast(msg, type = 'error') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; pointer-events: none;';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.style.cssText = \\\ackground: \\\; color: white; padding: 12px 24px; border-radius: 8px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.15); opacity: 0; transform: translateY(20px); transition: all 0.3s ease;\\\;
        toast.textContent = msg;
        container.appendChild(toast);
        
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };
    content = content.replace(/function escapeHtml\(value\) \{[\s\S]*?\}/, match => match + toastFunc);
}

// 2. Replace save function alerts
content = content.replace(/alert\('Save failed\. Is the server running\?'\);/g, "showToast('Save failed. Reverting...', 'error');\n            loadData();");
content = content.replace(/alert\('Failed to save shopping list\. Is the server running\?'\);/g, "showToast('Save failed. Reverting...', 'error');\n                    loadData();");
content = content.replace(/alert\('Failed to save\. Is the server running\?'\);/g, "showToast('Save failed. Reverting...', 'error');\n                            loadData();");
content = content.replace(/alert\('Failed to save network settings\.'\);/g, "showToast('Save failed. Reverting...', 'error');\n                            loadData();");
content = content.replace(/alert\('Failed to save settings\.'\);/g, "showToast('Save failed. Reverting...', 'error');\n                    loadData();");

fs.writeFileSync(file, content);
console.log('cms.js patched successfully');
