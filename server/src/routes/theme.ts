/**
 * Shared design tokens — the landing page's palette — so every app page
 * (login, account, admin, dashboard, superadmin) looks like one product.
 * Dark-first, with a light theme via `prefers-color-scheme` and an explicit
 * `data-theme` override.
 */
export const TOKENS = /* css */ `
:root{--bg:#070b14;--panel:#0d1322;--panel2:#111a2e;--line:#1c2740;--ink:#eaf0fb;--muted:#8ea0c0;--dim:#5f7095;--cyan:#3ee0d0;--amber:#f5b53d;--violet:#8b93f8;--good:#54d98c;--bad:#f4707f;--radius:16px}
:root[data-theme="light"]{--bg:#f4f7fc;--panel:#fff;--panel2:#f7f9fd;--line:#e3e9f4;--ink:#111a2e;--muted:#4d5c78;--dim:#8494b0;--cyan:#0d9488;--amber:#b7791f;--violet:#5b63c4;--good:#137a4b;--bad:#c02a3b}
@media(prefers-color-scheme:light){:root:not([data-theme="dark"]){--bg:#f4f7fc;--panel:#fff;--panel2:#f7f9fd;--line:#e3e9f4;--ink:#111a2e;--muted:#4d5c78;--dim:#8494b0;--cyan:#0d9488;--amber:#b7791f;--violet:#5b63c4;--good:#137a4b;--bad:#c02a3b}}`;

/** The brand mark square — the landing page's 4-stop conic gradient. */
export const MARK = /* css */ `.mark{width:28px;height:28px;border-radius:8px;background:conic-gradient(from 210deg,var(--cyan),var(--violet),var(--amber),var(--cyan));display:grid;place-items:center;color:#04060c;font-weight:900}`;
