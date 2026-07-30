const fs = require('fs');

let css = fs.readFileSync('styles.css', 'utf8');

// Ensure GDPR banner is a floating toast
const gdprToastCss = `
    /* Modern GDPR Toast */
    #gdpr-banner {
        position: fixed;
        bottom: 2rem;
        left: 2rem;
        max-width: 400px;
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--border-radius);
        padding: 1.5rem;
        box-shadow: var(--shadow-lg);
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    #gdpr-banner.hidden {
        display: none !important;
    }
    #gdpr-banner p {
        margin: 0;
        font-size: 0.9rem;
        color: var(--text-main);
        line-height: 1.4;
    }
    #gdpr-accept {
        align-self: flex-start;
        padding: 0.5rem 1rem;
    }
    
    /* Responsive Fixes */
    @media (max-width: 768px) {
        .top-nav {
            flex-direction: column;
            gap: 1rem;
        }
        #gdpr-banner {
            left: 1rem;
            right: 1rem;
            bottom: 1rem;
            max-width: none;
        }
        .filter-toolbar {
            flex-direction: column;
            align-items: stretch;
            gap: 1rem;
        }
        .toolbar-title {
            margin-right: 0;
            text-align: center;
        }
        .recipe-footer-col {
            padding: 1rem;
        }
    }
`;

// Only add if it doesn't already exist
if (!css.includes('/* Modern GDPR Toast */')) {
    css += '\n' + gdprToastCss;
    fs.writeFileSync('styles.css', css);
    console.log('Added GDPR and responsive CSS to styles.css');
}
