# Hello Solar — Demo Guide (v1.0)

A 15–20 minute walkthrough of the whole system, using one new customer from the website to the first monthly
payment. Every step below was run end to end on Oct 28, 2026 (desktop and phone) with no errors.

## Before the demo (2 minutes)

1. Open the `Hello Solar` folder in VS Code → right-click `index.html` → **Open with Live Server**
   (`http://127.0.0.1:5501`).
2. Log in to Super Admin (`admin` / `admin123`) → **Settings** → **Developer / Demo Tools** → **Reset Demo Data**,
   type `RESET DEMO DATA`, confirm. Every portal now starts from clean sample data.
3. Use **one browser** for the whole demo (the data is saved in that browser). Switch portals by logging out and
   logging in again on `login.html`.

## Logins

| Portal | Email | Password |
|---|---|---|
| Super Admin | `admin` | `admin123` |
| Customer (sample, has 4 systems) | `customer@hellosolar.ph` | `password123` |
| Financer (SolarTech Financer) | `financer@hellosolar.ph` | `password123` |
| Installer (SolarTech Installer) | `installer@hellosolar.ph` | `password123` |
| Direct Engineer | `engineer@hellosolar.ph` | `engineer123` |
| Accounting | `accounting@hellosolar.ph` | `accounting123` |
| A new Buy Now customer | the email used on Buy Now | `Solar2026!Pass` (demo only — real customers set it from the activation email) |

## The story

### 1. Website — Buy Now (customer)
- On the home page, scroll to **Explore other options**. Switch the **Installment term**: 6 months · 3 years · 6 years.
  Every card's monthly price changes; the full payment price stays.
- Pick **3 years**, open **HS 6 PRO** → **Buy Now**. Choose **Installment**: the **Installment Term** dropdown shows the
  three terms with their monthly prices (3 years is already selected). Full Payment hides it.
- Fill in the form (use a new email), tick the Terms, **Pay Now**, upload any image as the ₱10,000 receipt.
- Talking point: the customer account is created automatically when the receipt is uploaded.

### 2. Super Admin — check the down payment
- **Applications** → the new application (Financing Review). **Details** shows the lifecycle, the term
  (*3 years · 36 payments*) and the monthly.
- **Accounting → Money In** (or Payments to Check): verify the ₱10,000 down payment.
- Talking point: nothing moves forward until the documents are complete (Lifecycle step 3 shows "!").

### 3. Customer — activate and upload documents
- Log in on `login.html` with the Buy Now email and the demo password `Solar2026!Pass`
  (real customers set their own password from the activation email once the backend sends emails).
- **Documents**: one checklist — Valid ID #1 and #2, payslips or bank statement, proof of home ownership / lease,
  proof of billing, site photos, Google Maps link, and the signed Installment Agreement (Download form → Upload).
- **My Payments → Down Payment**: *Refundable if you don't proceed*, with **Request a Refund**.

### 4. Super Admin — review documents
- Application **Details → Documents**: accept each document and the signed agreement.
  Show **+ Request Document** and **Not required** (with a reason the customer sees).
- **Assign Financer** → SolarTech Financer.

### 5. Financer — approve financing
- **Applications** → **Review**: same documents and count as Super Admin (8/8), the term (36 Months) and monthly.
- **Approve Financing** → the application becomes *Ready for Installation*.
- Optional: **Hello Solar Funding** instead (Super Admin funds it directly, 0% interest).

### 6. Super Admin — assign the installer
- Application **Details** → **Assign Partner Installer** → SolarTech Installer.
  (Or **Hello Solar Installation** for the internal team / Direct Engineer.)

### 7. Installer — install and activate
- **My Jobs** → the job → **Accept** → **Start Installation** → **Complete** → **Activate**.
- Talking point: installers only see open jobs whose documents are complete.

### 8. Customer — first monthly payment
- **My Payments**: Payment Plan *3 Years*, *0 of 36*, first bill **one month after the approval**.
  The Down Payment card now says *Deducted from your system price* (no refund button).
- **Install Status / Support** show the real installer (SolarTech Installer, Alex Rivera).
- Upload a receipt for the first bill.

### 9. Super Admin / Accounting — verify and report
- Verify the receipt (Payments / Accounting). **Accounting → Overview / Money In** lists the down payment and the
  first installment; Funder Schedule and Customer Schedule follow.
- **Financer → Approved**: the loan shows *On Time*; the cards (total, monthly inflow, next billing, on-time %) are
  computed from the real loans.

### Sample accounts worth showing
- **Link Existing System** (Customer → My System → System dropdown → Link Existing System):
  HS ID `HS-55201` + registered email `juan.delacruz@hellosolar.ph` → links APP-4072 to the account.
  (Reset Demo Data makes it linkable again.)
- `customer@hellosolar.ph` → **My Payments**: APP-4091 (due soon), APP-4085 (one overdue bill).
- Super Admin **Payments**: overdue accounts (APP-1056, APP-1089) — dates move with the calendar, so this is true on
  any demo day.

## Rules the system follows (for questions)

| Topic | Rule |
|---|---|
| Installment terms | 6 months, 3 years, 6 years; ₱10,000 down payment for every term |
| Prices | HS Pricing 2026 totals (6 mos = price × 1.20, 3 yrs = price × 1.42); the rest after the ₱10,000 is split monthly |
| Full Payment | One price, ₱500 reservation deposit |
| Documents | Same list for Installment and Full Payment; financing and installation wait for complete documents |
| Refunds | Deposit: refunded if not proceeding, deducted if proceeding. Site visit fee: deducted if proceeding, not refundable otherwise |
| Overdue | 5 days after the due date (Settings) — same in every portal |

## What is still a prototype (needs the backend)

- Data lives in the browser (each browser has its own copy) — the backend makes it shared and permanent.
- Receipts are checked by hand; there is no payment gateway.
- Emails / SMS (activation links, reminders) are recorded in the app but not sent.
- Logins are demo logins; real security (hashed passwords, sessions, roles) comes with the backend.
- Sample documents are placeholder images marked "SAMPLE DOCUMENT".

## v1.0 lock

- The folder is already a Git project. In VS Code: **Source Control** → message `Hello Solar v1.0 — demo-ready` →
  **Commit**, then (Terminal) `git tag v1.0`. Or simply copy the folder and rename the copy **Hello Solar v1.0**.
- From here, only bug fixes go into this version. New features start from a copy.
