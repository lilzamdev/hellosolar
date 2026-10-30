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
| **Super Admin** (`hello_solar_super_admin/`) | Hello Solar staff (plus the Direct Engineer and Accounting) | Manage inquiries, accounts, applications, installations, maintenance, payments and accounting |

## Run it on your computer

1. Open the `Hello Solar` folder in VS Code.
2. Install the **Live Server** extension if you don't have it.
3. Right-click `index.html` and choose **Open with Live Server**. It opens at `http://127.0.0.1:5501`.

`index.html` takes you to the public website. To log in, go to `login.html`.

All data is saved in your browser, so each browser has its own copy. To start fresh, open Super Admin →
**Settings** → **Developer / Demo Tools** → **Reset Demo Data** (it clears everything saved in this browser and loads
clean sample data). For a step-by-step demo, see `DEMO_GUIDE.md`.

## Change prices, payment channels and contacts

Hello Solar's packages, prices, down payments, payment channels and main contacts live in **one file**: `shared/hello-solar-business.js`.

| What | Where in the file |
|---|---|
| Package names, Full Payment prices, specs (panels, inverter, battery) | `packages` |
| Monthly payment per term (6 months, 3 years, 6 years) | `packages` → `terms` |
| Down payments (₱10,000 Installment, ₱500 Full Payment) and the ₱1,000 site visit fee | `downPayment`, `siteVisitFee` |
| GCash / Maya / bank account customers pay to | `paymentChannels` |
| Website, support email, hotline, Central Dispatch number, office hours | `company` |

Edit the value, save, refresh the page. The public website, every portal and the Terms & Conditions follow it.
Amounts are plain numbers (`285000`, not `"₱285,000"`). Bills that already exist keep their amounts.

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
| Accounting | `accounting@hellosolar.ph` | `accounting123` |

## How a customer buys a system

1. The customer picks a package on the public website and clicks **Buy Now**. They choose **Installment** or **Full Payment**.
   Installment has three terms: **6 months, 3 years or 6 years** (6 years is the default). The monthly price of every
   package and term is in one list, `packages` in `shared/hello-solar-business.js` (HS Pricing 2026).
2. They pay the down payment (**₱10,000 Installment, ₱500 Full Payment**) and upload a photo of the receipt. An email address is required.
3. When the receipt is uploaded, their customer account is **created automatically** and an activation link is queued for their email.
4. The customer opens the link, sets a password, and logs in to the Customer portal.
5. **Accounting** (in Super Admin) checks the down payment. The down payment is taken off the remaining balance.
6. The customer answers and signs their agreement in **Documents** (Full Payment Agreement or Installment Agreement).
7. For Installment, a **Financer** reviews the customer's documents and approves the financing — or Super Admin accepts it
   with **Hello Solar Funding** (Hello Solar funds it directly). For Full Payment, the customer uploads the receipt for the
   remaining balance, and Super Admin verifies it. An installer can only be assigned after this.
8. An **Installer** is assigned, accepts the job, and installs the system.

Super Admin shows where each application is in **Lifecycle Progression** (Applications › Details). Full Payment and
Installment use the same 10 steps:

1. Down Payment
2. Account Created
3. Documents Submission
4. Pending Finance (Full Payment: full payment receipt waiting for verification)
5. Approved Financing (Full Payment: full payment verified)
6. Pending Installer
7. Installer Accepted
8. Pending Installation
9. Ongoing Installation
10. Completed

The **Application Summary** under the steps lists the same 10 steps in order, with the details of each step.

Site visits follow **Site Visit Payment → Pending Visit → Visit Confirmed**. When the visit is confirmed, the client gets a
link (`Hello_Solar/continue.html`). **Yes** opens Buy Now with their details filled in so they pick Full Payment or
Installment; **No** records that they are not continuing.

Every customer (Installment and Full Payment) sends the same documents: Valid ID #1 and #2 (front and back, with
signature), payslips (last 3 months) or the latest bank statement, proof of home ownership or a 5–10 year lease, proof of
billing, site photos (roof and neighborhood), a Google Maps link of the house, and the signed agreement. Super Admin can
**request** another document or mark one **Not required** (with a reason the customer sees). Financing approval and
installation wait until every required document is in and the signed agreement is accepted.

**Refunds:** the reservation deposit is refunded when the customer does **not** proceed and is deducted from the system
price when they proceed. The ₱1,000 site visit fee is deducted when they proceed and is not refundable when they don't.

**Dates:** every portal uses today's real date. A bill is overdue 5 days after its due date (Super Admin → Settings).
The first installment is due one month after the financing is approved. Sample accounts move with the calendar, so
the demo always shows bills that are paid, due soon and overdue.

**Paying a bill:** in My Payments, **Submit Payment** opens one card: the bill, where to send it (GCash, Maya or Bank),
the receipt and the reference no. The amount is always the exact bill. **− 1 month +** pays months ahead in one receipt;
overdue bills are always included. When Super Admin verifies the receipt, every bill it covers becomes Paid.

Customers can also send an inquiry or request a proposal instead of buying right away. Super Admin then follows up
and creates their account.

## Super Admin at a glance

- **Summary**: the main dashboard.
- **Applications**: filters are All, Cash Applications (Full Payment waiting for payment), Missing Documents,
  Pending Financing, Pending Installation and Declined.
- **Installations**: installation jobs only (maintenance jobs are on the Maintenance page). Inspect / Update has Overview,
  Schedule, Progress and Activity.
- **Maintenance**: every maintenance job. **Manage** changes the person, schedule, progress (click a step) and notes,
  and shows the history. If the person is changed, the new person must accept or decline first.
- **Payments**: Total Revenue, Financer Funded, Financing Revenue and Financer Revenue. Customers get payment reminders
  7 days before, 1 day before and on the due date.
- **Accounting** (tabs): **Overview** (Receivables, Payables and To Check for the month you pick), **Receivables**
  (Payments Received — verify here, Monthly Payments, From Funders), **Payables** (Funders, Refunds, Installation Costs)
  and **System Control**. The **Accounting** login only sees this page.
- **Support**: clicking a related ID opens the record beside the ticket list. Leaving Support closes it.
- The **Direct Engineer** login sees Applications, Site Visits, Installations and Maintenance.

## What it can't do yet

- **No backend.** Everything is stored in the browser. Nothing is shared between computers.
- **No payment gateway.** Customers upload a receipt, and staff check it by hand.
- **No real emails.** Activation links and other emails are only recorded in the app. Nothing is actually sent.
- Real payment checks, emails and logins will be done by the backend later.

## For the backend developer

Read these in order:

1. `API_CONTRACT.md`: what the backend owns, the business rules, every endpoint, its fields and the record shapes
2. `shared/`: the only frontend folder you need to read to connect the backend

The app has two modes, set in `shared/hello-solar-config.js`:

| Mode | Where data comes from |
|---|---|
| `local` (default) | The browser, with demo data. Good for demos and testing. |
| `api` | The backend only, no demo data. Set `mode: "api"` and `apiBase`, or set `window.HS_CONFIG` before the config file loads. |

### Folder map

```
Hello Solar/
├── README.md                 ← this file
├── DEMO_GUIDE.md             ← step-by-step demo
├── API_CONTRACT.md           ← backend guide: rules, endpoints and data shapes
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
- Every portal page loads `shared/hello-solar-business.js`, then `hello-solar-config.js`, then `hello-solar-store.js`, then `hello-solar-shared.js`, in that order.
- Very small `.html` files (under about 1 KB) only redirect to the new page, so old links still work.
- `data/` folders hold demo data only. They are ignored in `api` mode.

## Tests

You need Node.js. Run every test from the `Hello Solar` folder with:

```
node --test "shared/tests/*.test.cjs" "hello_solar_super_admin/tests/*.test.cjs"
```

Or one file at a time:

```
node shared/tests/shared.test.cjs
node shared/tests/login.test.cjs
node shared/tests/payments-financing.test.cjs
node shared/tests/api-mode.test.cjs
node hello_solar_super_admin/tests/<name>.test.cjs
node Hello_Solar_Financer/scripts/test-financer-flow.cjs
```
