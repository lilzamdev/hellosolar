# Hello Solar

Web portals for Hello Solar: a public landing page, a shared login, and five dashboards (Customer, Financer, Installer,
Merchant, Super Admin). Built with plain HTML, CSS and JavaScript. No build step.

**Backend developer?** Read in this order:

1. `BACKEND_INTEGRATION.md`: responsibilities, business rules, what the backend must own
2. `API_CONTRACT.md`: every endpoint, its named fields, the response format and the record shapes
3. `shared/`: the only frontend folder you need to read to connect the backend

## Folder map

```
Hello Solar/
├── README.md                    ← you are here
├── BACKEND_INTEGRATION.md       ← backend guide (rules & responsibilities)
├── API_CONTRACT.md              ← endpoints, payloads, record shapes
│
├── shared/                      ← THE BACKEND CONNECTION LAYER (every page loads these, in this order)
│   ├── hello-solar-config.js    1. mode switch (local / api), HTTP client, command routes, /bootstrap, record cache
│   ├── hello-solar-store.js     2. data model, demo seed, business rules, Super Admin & Direct Engineer commands
│   ├── hello-solar-shared.js    3. sessions + Customer / Financer / Installer / Merchant commands
│   ├── hello-solar-login.js        shared login, forgot / set password (login pages only)
│   ├── hello-solar-auth.css        styles for the login / password pages
│   └── tests/                      node tests for the shared layer (incl. api-mode.test.cjs)
│
├── index.html                   → redirects to the landing page
├── login.html                   shared login for every dashboard
├── forgot-password.html         request a reset link
├── set-password.html            set / reset password from an email link
│
├── Hello_Solar/                 public landing page + contact form (sends inquiries)
├── Hello_Solar_Customer/        Customer portal      (mysystem, payments, documents, install-status, energy, support)
├── Hello_Solar_Financer/        Financer portal      (dashboard, applications, approved, rejected, support)
├── Hello_Solar_Installer/       Installer portal     (myjob, payout, profile, support)
├── Hello_Solar_Merchant/        Merchant portal      (dashboard, installers, payments, support)
└── hello_solar_super_admin/     Super Admin + Direct Engineer console (index, customer_confirmation)
```

Inside each portal:

| Folder | Contains |
|---|---|
| `*.html` | Pages. Very small `.html` files (under ~1 KB) are **redirects** kept so old links keep working. |
| `js/` or `assets/js/` | Page scripts. They read and write data **only** through `shared/` (`HSShared`, `HELLO_SOLAR_DB`). |
| `css/` or `assets/css/` | Styles |
| `data/` or `assets/data/` | **Demo JSON only.** Ignored in api mode. Never the source of real records. |

## Script order on every portal page

```html
<script src="../shared/hello-solar-config.js"></script>   <!-- 1. config + API client (must be first) -->
<script src="../shared/hello-solar-store.js"></script>    <!-- 2. data model -->
<script src="../shared/hello-solar-shared.js"></script>   <!-- 3. sessions + portal commands -->
<!-- then the portal's own scripts -->
```

## Modes

| Mode | Data | How to switch |
|---|---|---|
| `local` (default) | Browser `localStorage` + demo data. Good for demos and testing. | `DEFAULT_CONFIG.mode` in `shared/hello-solar-config.js` |
| `api` | Backend only, no demo data | Set `mode: "api"` and `apiBase`, or inject `window.HS_CONFIG` before the config file loads |

Demo logins (local mode only): `admin@hellosolar.ph` / `admin123`, `engineer@hellosolar.ph` / `engineer123`.
The login page also shows a quick demo account per portal.

## Tests

```
node shared/tests/shared.test.cjs
node shared/tests/login.test.cjs
node shared/tests/payments-financing.test.cjs
node shared/tests/api-mode.test.cjs
node hello_solar_super_admin/tests/<name>.test.cjs
node Hello_Solar_Financer/scripts/test-financer-flow.cjs
```
