# Hello Solar

Hello Solar is a website for buying solar panel systems in the Philippines. It has a public website and five
portals (dashboards), one for each kind of user. Everyone logs in on the same login page and is sent to their own portal.

It is built with plain HTML, CSS and JavaScript. There is nothing to install and no build step.

## The portals

| Portal | Who uses it | What they do there |
|---|---|---|
| **Public website** (`Hello_Solar/`) | Anyone | See the solar packages, buy one, or send an inquiry |
| **Customer** (`Hello_Solar_Customer/`) | People who bought a system | Track their system, pay, upload documents, follow the installation, see energy use, ask for help |
| **Financer** (`Hello_Solar_Financer/`) | Banks and lending partners | Review installment applications and approve or reject them |
| **Installer** (`Hello_Solar_Installer/`) | Installation teams | Accept jobs, update installation progress, see payouts |
| **Merchant** (`Hello_Solar_Merchant/`) | Equipment suppliers | See their projects, installers and payments |
| **Super Admin** (`hello_solar_super_admin/`) | Hello Solar staff (and the Direct Engineer) | Manage inquiries, accounts, applications, installations, payments and accounting |

## Run it on your computer

1. Open the `Hello Solar` folder in VS Code.
2. Install the **Live Server** extension if you don't have it.
3. Right-click `index.html` and choose **Open with Live Server**. It opens at `http://127.0.0.1:5501`.

`index.html` takes you to the public website. To log in, go to `login.html`.

All data is saved in your browser, so each browser has its own copy. To start fresh, clear the site data for
`127.0.0.1` in your browser.

## Test logins

These only work in demo mode (the default). The login page also shows a quick demo account for each portal.

| Portal | Email | Password |
|---|---|---|
| Customer | `customer@hellosolar.ph` | `password123` |
| Financer | `financer@hellosolar.ph` | `password123` |
| Installer | `installer@hellosolar.ph` | `password123` |
| Merchant | `merchant@hellosolar.ph` | `password123` |
| Super Admin | `admin@hellosolar.ph` | `admin123` |
| Direct Engineer | `engineer@hellosolar.ph` | `engineer123` |

## How a customer buys a system

1. The customer picks a package on the public website and clicks **Buy Now**. They choose **Installment** or **Full Payment**.
2. They pay the **₱10,000 down payment** and upload a photo of the receipt. An email address is required.
3. When the receipt is uploaded, their customer account is **created automatically** and an activation link is queued for their email.
4. The customer opens the link, sets a password, and logs in to the Customer portal.
5. **Accounting** (in Super Admin) checks the down payment. The ₱10,000 is taken off the remaining balance.
6. For Installment, a **Financer** reviews and approves the financing. Full Payment skips this step.
7. An **Installer** is assigned, accepts the job, and installs the system.

The customer can follow every step in **Lifecycle Progression** on their portal:

1. Account Created
2. Down Payment
3. Pending Finance
4. Approved Financing
5. Pending Installer
6. Installer Accepted
7. Pending Installation
8. Ongoing Installation
9. Completed

For Full Payment, the finance steps are ticked automatically.

Customers can also send an inquiry or request a proposal instead of buying right away. Super Admin then follows up
and creates their account.

## What it can't do yet

- **No backend.** Everything is stored in the browser. Nothing is shared between computers.
- **No payment gateway.** Customers upload a receipt, and staff check it by hand.
- **No real emails.** Activation links and other emails are only recorded in the app. Nothing is actually sent.
- Real payment checks, emails and logins will be done by the backend later.

## For the backend developer

Read these in order:

1. `BACKEND_INTEGRATION.md`: what the backend must handle and the business rules
2. `API_CONTRACT.md`: every endpoint, its fields and the record shapes
3. `shared/`: the only frontend folder you need to read to connect the backend

The app has two modes, set in `shared/hello-solar-config.js`:

| Mode | Where data comes from |
|---|---|
| `local` (default) | The browser, with demo data. Good for demos and testing. |
| `api` | The backend only, no demo data. Set `mode: "api"` and `apiBase`, or set `window.HS_CONFIG` before the config file loads. |

### Folder map

```
Hello Solar/
├── README.md                 ← this file
├── BACKEND_INTEGRATION.md    ← backend guide
├── API_CONTRACT.md           ← endpoints and data shapes
├── index.html                → opens the public website
├── login.html                one login page for every portal
├── forgot-password.html      ask for a password reset link
├── set-password.html         set a password from an email link
├── shared/                   code every portal uses (data, logins, connection to the backend)
├── Hello_Solar/              public website
├── Hello_Solar_Customer/     Customer portal
├── Hello_Solar_Financer/     Financer portal
├── Hello_Solar_Installer/    Installer portal
├── Hello_Solar_Merchant/     Merchant portal
└── hello_solar_super_admin/  Super Admin and Direct Engineer
```

Good to know:

- Pages read and save data **only** through `shared/`.
- Every portal page loads `shared/hello-solar-config.js`, then `hello-solar-store.js`, then `hello-solar-shared.js`, in that order.
- Very small `.html` files (under about 1 KB) only redirect to the new page, so old links still work.
- `data/` folders hold demo data only. They are ignored in `api` mode.

## Tests

You need Node.js. Run these from the `Hello Solar` folder:

```
node shared/tests/shared.test.cjs
node shared/tests/login.test.cjs
node shared/tests/payments-financing.test.cjs
node shared/tests/api-mode.test.cjs
node hello_solar_super_admin/tests/<name>.test.cjs
node Hello_Solar_Financer/scripts/test-financer-flow.cjs
```
