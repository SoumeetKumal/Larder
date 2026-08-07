const { contextBridge, ipcRenderer } = require('electron');

// The exposed API is only visible on `window.larderWindow` in the page's MAIN
// world. Code running in the preload's own (isolated) world — like the title
// bar click handlers below — must reference this local object instead, since
// `window.larderWindow` is undefined there.
const larderWindow = {
    isElectron: true,
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: (callback) => {
        ipcRenderer.on('window:maximized', (_event, value) => callback(value));
    }
};

contextBridge.exposeInMainWorld('larderWindow', larderWindow);

// Inject a themed, frameless title bar into every page. It uses the same CSS
// variables as the rest of the app, so it follows light/dark mode automatically.
function injectTitleBar() {
    if (document.getElementById('larder-titlebar')) return;

    const style = document.createElement('style');
    style.textContent = `
        #larder-titlebar {
            position: fixed; top: 0; left: 0; right: 0; height: 38px;
            display: flex; align-items: center;
            background: var(--bg-surface, #fcfbf9);
            border-bottom: 1px solid var(--border, #e5e0d8);
            z-index: 2147483000;
            -webkit-app-region: drag;
            user-select: none;
        }
        #larder-titlebar-brand {
            display: flex; align-items: center; gap: 8px;
            padding-left: 14px; flex: 1; min-width: 0;
            font-family: inherit; font-size: 12px; font-weight: 600;
            letter-spacing: 0.04em; text-transform: uppercase;
            color: var(--text-muted, #6b7c8e);
        }
        #larder-titlebar-brand img { width: 18px; height: 18px; border-radius: 4px; object-fit: contain; }
        [data-theme="dark"] #larder-titlebar-brand img { filter: brightness(0) invert(1); }
        #larder-titlebar-controls { display: flex; height: 100%; -webkit-app-region: no-drag; }
        .larder-titlebar-btn {
            width: 46px; height: 100%; border: none; margin: 0; padding: 0;
            display: flex; align-items: center; justify-content: center;
            background: transparent; color: var(--text-muted, #6b7c8e);
            cursor: default; transition: background 0.15s ease, color 0.15s ease;
        }
        .larder-titlebar-btn:hover { background: var(--bg-surface-hover, #f0ece6); color: var(--text-main, #2a2e33); }
        .larder-titlebar-btn-close:hover { background: #c42b1c; color: #fff; }
        .larder-titlebar-btn svg { width: 12px; height: 12px; }
        body { padding-top: 38px; }
        body.cms-page .cms-navbar { top: 38px; }
        @media (min-width: 769px) {
            body.cms-page { padding-top: 0; }
            body.cms-page .cms-app-layout { height: calc(100vh - 38px); margin-top: 38px; }
            body.cms-page .cms-dashboard { height: 100%; }
        }
    `;
    document.head.appendChild(style);

    const bar = document.createElement('div');
    bar.id = 'larder-titlebar';
    bar.innerHTML = `
        <div id="larder-titlebar-brand">
            <img src="images/icon.png" alt="" onerror="this.style.display='none'">
            <span>Larder CMS</span>
        </div>
        <div id="larder-titlebar-controls">
            <button class="larder-titlebar-btn" id="larder-btn-min" aria-label="Minimize">
                <svg viewBox="0 0 12 12"><path d="M1 6h10" stroke="currentColor" stroke-width="1.2"/></svg>
            </button>
            <button class="larder-titlebar-btn" id="larder-btn-max" aria-label="Maximize">
                <svg viewBox="0 0 12 12" id="larder-max-restore" style="display:none">
                    <rect x="2.5" y="2.5" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.2"/>
                    <path d="M4 2.5V1.8A.8.8 0 0 1 4.8 1h5.4a.8.8 0 0 1 .8.8v5.4a.8.8 0 0 1-.8.8H9.5" fill="none" stroke="currentColor" stroke-width="1.2"/>
                </svg>
                <svg viewBox="0 0 12 12" id="larder-max" style="display:block">
                    <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.2"/>
                </svg>
            </button>
            <button class="larder-titlebar-btn larder-titlebar-btn-close" id="larder-btn-close" aria-label="Close">
                <svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.2"/></svg>
            </button>
        </div>
    `;
    document.body.insertBefore(bar, document.body.firstChild);

    document.getElementById('larder-btn-min').addEventListener('click', () => larderWindow.minimize());
    document.getElementById('larder-btn-max').addEventListener('click', () => larderWindow.toggleMaximize());
    document.getElementById('larder-btn-close').addEventListener('click', () => larderWindow.close());

    bar.addEventListener('dblclick', (e) => {
        if (e.target.closest('#larder-titlebar-controls')) return;
        larderWindow.toggleMaximize();
    });

    const maxIcon = document.getElementById('larder-max');
    const restoreIcon = document.getElementById('larder-max-restore');
    const setState = (isMax) => {
        maxIcon.style.display = isMax ? 'none' : 'block';
        restoreIcon.style.display = isMax ? 'block' : 'none';
    };
    larderWindow.onMaximizedChange(setState);
    larderWindow.isMaximized().then(setState);
}

window.addEventListener('DOMContentLoaded', () => {
    try {
        injectTitleBar();
    } catch (e) {
        console.error('[Larder] Could not inject title bar:', e);
    }
});
