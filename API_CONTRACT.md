# Hello Solar — API Contract

What the frontend sends and expects back in **api mode**. Read this together with
`BACKEND_INTEGRATION.md` (responsibilities and business rules).

Every endpoint below is already called by the frontend. You only build the server side; the portal UI does not change.

- **Routes in code:** `shared/hello-solar-config.js` → `COMMAND_ROUTES`
- **Super Admin command list in code:** `shared/hello-solar-store.js` → `ADMIN_COMMANDS`
- **Tests that check this contract:** `node shared/tests/api-mode.test.cjs`

---

## 1. Turning on api mode

Edit `DEFAULT_CONFIG` in `shared/hello-solar-config.js`, or have the server inject this before that file loads:

```html
<script>window.HS_CONFIG = { mode: "api", apiBase: "https://your-server/api" };</script>
```

In api mode, demo data is switched off everywhere and every record comes from the backend.

## 2. Conventions

| Topic | Rule |
|---|---|
| Format | JSON in and out (`Content-Type: application/json`). Document uploads are `multipart/form-data`. |
| Auth | `Authorization: Bearer <token>`. One token per role, saved by the frontend after login. Requests also send cookies (`credentials: "include"`). |
| Roles | `customer`, `financer`, `installer`, `merchant`, `super-admin`, `direct-engineer`. The token header for both admin roles uses the `admin` slot. |
| Errors | Any non-2xx status with `{ "error": "Message shown to the user" }`. 401/403 on `/bootstrap` signs the user out. |
| Timeout | 20 s (`requestTimeoutMs`). |
| Write responses | Return the records the write changed (see §5). The frontend merges them into its cache by `id`. |
| Failed writes | The screen already shows the change. On a non-2xx answer the frontend fires `hs:api-error` and shows "Your change was not saved", with a Reload button. |
| IDs | The backend generates and validates every ID (see §8). |
| Passwords | Never return `password` fields. The demo seed contains plain passwords for local testing only. |
| Dates | Send ISO 8601 (`2026-10-13T08:30:00+08:00`). Some demo records use display text like `"25 mins ago"` in `updated` / `created`; the backend should send real timestamps. |

## 3. Authentication

| Method | Path | Body | Success response |
|---|---|---|---|
| POST | `/auth/login` | `{ identifier, password, role? }` | `{ token, account: { id, name, role, ... } }` |
| POST | `/auth/logout` | `{}` | `200` |
| POST | `/auth/register` | `{ role, profile }` | `{ token?, account }` |
| POST | `/auth/password/forgot` | `{ identifier }` | Always `200` (never reveal whether the account exists) |
| GET | `/auth/password/token?token=…` | | `{ purpose: "activate" \| "reset", email }`; invalid → `400`/`410` |
| POST | `/auth/password/set` | `{ token, password }` | `200`; invalid token → `400`/`410`; weak password → `422` |

- On the shared login page, `role` is left out unless the user came from a specific portal (`customer`, `financer`, `installer`, `merchant`, `admin`). Without `role`, find the account by email, username or account ID across all account types.
- The response's `account.role` decides which dashboard opens.
- Password rule (check again on the server): at least 8 characters, with at least one letter and one number.

## 4. Page load: `GET /bootstrap?role=<role>`

Called once on every portal page load, before the portal scripts run. Return **only** what this account may see.

```json
{
  "account": { "id": "CUS-1001", "name": "Maria Elena Cruz", "role": "customer" },
  "data": {
    "customers": [], "financers": [], "installers": [], "merchants": [], "engineers": [],
    "applications": [], "installations": [], "payments": [], "paymentSchedules": {},
    "support": [], "inquiries": [], "activity": [], "settings": {},
    "siteVisits": [], "reimbursements": [], "disconnectRequests": []
  },
  "documents": { "APP-1024": { "documents": [ /* see §7 Documents */ ] } },
  "notifications": [ /* see §7 Notifications */ ],
  "installationProgress": { "APP-1024": { /* see §7 Installation progress */ } }
}
```

Missing collections default to empty. Field lists for each record type are in §7.

**What each role receives**

| Role | Records |
|---|---|
| customer | Their own customer record, their applications (by `customerId`), and those applications' schedules, documents, support tickets, reimbursements and notifications |
| financer | Their own record, applications where `financerId` = their ID, related schedules and documents |
| installer | Their own record and the applications they can see (see §9) |
| merchant | Their own record and their merchant data |
| super-admin | Everything |
| direct-engineer | Hello Solar Direct applications and installations only |

## 5. Write response format (all commands)

```json
{
  "records": { "applications": [ { "id": "APP-1024", "...": "full updated record" } ] },
  "removed": { "support": ["SUP-012"] },
  "documents": { "APP-1024": { "documents": [] } },
  "notifications": [ { "id": "notif-…" } ],
  "installationProgress": { "APP-1024": {} }
}
```

Every key is optional. Array collections are upserted by `id`; `paymentSchedules` and `settings` are merged by key.
Return everything the command changed, because the backend creates notifications and activity log entries as side effects.

## 6. Portal commands

Each command body is `{ "command": "<name>", ...fields }`. Path values (`:appId`) come from the same fields.

| Command | Method & path | Sent by | Body fields |
|---|---|---|---|
| `profile.update` | PATCH `/me/profile` | All portals | `role`, `accountId`, `fields` `{ name, contact, phone, email, … }` |
| `application.claim` | POST `/applications/claim` | Customer | `customerId`, `hsId`, `contact` (sent directly, waits for the answer) |
| `receipt.submit` | POST `/applications/:appId/receipts` | Customer | `appId`, `customerId`, `submission` |
| `reimbursement.request` | POST `/applications/:appId/reimbursements` | Customer | `customerId`, `appId`, `request` `{ id, type, amount, … }` |
| `document.upload` | POST `/applications/:appId/documents/:docId` | Customer | multipart: `file`, `appId`, `docId` |
| `document.review` | PATCH `/applications/:appId/documents/:docId` | Financer | `appId`, `docId`, `status`, `note` |
| `support.create` | POST `/support/tickets` | Customer, Financer, Installer, Merchant | `ticket` (see Support ticket, §7) |
| `notification.markRead` | POST `/notifications/read` | All portals | `{ ids: [...] }` or `{ all: true, role }` |
| `financing.decision` | POST `/applications/:appId/financing-decision` | Financer | `appId`, `decision`, `stage`, `financingStatus`, `applicationStatus`, `financing` |
| `installer.accept` | POST `/installations/:appId/accept` | Installer | `appId`, `installerId` |
| `installer.decline` | POST `/installations/:appId/decline` | Installer | `appId`, `installerId` |
| `installer.start` | POST `/installations/:appId/start` | Installer | `appId`, `installerId` |
| `installation.progress` | PUT `/installations/:appId/progress` | Installer | `appId`, `progress` (see §7) |
| `installer.complete` | POST `/installations/:appId/complete` | Installer | `appId`, `installerId` |
| `installer.activate` | POST `/installations/:appId/activate` | Installer | `appId`, `installerId` |
| `siteVisit.complete` | POST `/site-visits/:visitId/complete` | Installer | `visitId`, `actorId`, `notes` |
| `inquiry.submit` | POST `/public/inquiries` | Landing page (no token) | `inquiry` (customer or partner inquiry) |
| (direct request) | GET `/public/inquiries/:inquiryId?token=…` | Confirmation page (no token) | Returns `{ inquiry }` for the confirmation link |
| (direct request) | POST `/public/inquiries/:inquiryId/response` | Confirmation page (no token) | `token`, `decision` → `{ inquiry }` |

The Financer and Installer must only be allowed to change applications assigned to them.
Every installer action must update both the Application and its Installation Job.

## 7. Record shapes

Field names exactly as the frontend reads them. Examples come from the demo seed in `shared/hello-solar-store.js`.

**Customer** (`customers`): `id` (CUS-####), `name`, `email`, `phone`, `location`, `system`, `status`, `appId`, `hsId`, `invitationStatus`, `joined`, `username`, `hasSetPassword`

**Financer** (`financers`): `id` (FIN-###), `name`, `contact`, `email`, `phone`, `activeLoans`, `totalFunded`, `status`, `contractTermMonths`, `annualRate`, `contractStartDate`, `contractEndDate`, `contractStatusOverride`, `contractStatus`, `fundingOwner`, `fundingOwnerId`

**Installer** (`installers`): `id` (INS-###), `name`, `type` (`Internal` / partner), `contact`, `email`, `phone`, `activeJobs`, `completedJobs`, `rating`, `status`, `location`, `profile` (object)

**Merchant** (`merchants`): `id` (MER-###), `name`, `contact`, `email`, `phone`, `projects`, `transactions`, `volume`, `status`, `address`

**Engineer** (`engineers`): `id` (ENG-###), `name`, `email`, `mobile`, `status`

**Application** (`applications`), the main record that links every portal:
`id` (APP-####), `hsId` (HS-#####), `customer`, `customerId`, `location`, `system`, `panels`, `inverter`,
`stage`, `applicationStatus`, `paymentType` / `paymentPreference` (`Full Payment` / `Installment`), `paymentStatus`, `amount`, `monthly`, `nextDue`,
`financer`, `financerId`, `fundingOwner`, `fundingOwnerId`, `financingStatus`, `financingDecision`,
`installer`, `installerType` (`Partner Installer` / `Hello Solar Direct`), `assignedInstallerId`, `declinedInstallerIds`, `dispatchStatus`, `installationStatus`, `systemStatus`, `progress`,
`uploadedReceipt`, `receiptUploadedAt`, `receiptBank`, `receiptReference`, `receiptAmount`, `receiptVerificationStatus`,
`docs` (e.g. `"5/5"`), `contactEmail`, `contactPhone`, `notes`, `updated`, `installationProgress`

Stages: `Submitted` → `Payment Required` / `Financing Review` → `Missing Documents` → `Under Review` → `Approved` → `Ready for Installation` → `Installation` → `Completed` (or `Declined`).

**Installation job** (`installations`): `id` (JOB-###), `appId`, `customer`, `location`, `system`, `installer`, `installerType`, `status`, `schedule`, `leadTech`, `notes`, `completedDate`, `delayReason`

**Payment schedule** (`paymentSchedules`, keyed by APP ID): `{ appId, termMonths: 60, installments: [ { no, dueDate, amount, status, paidDate, paidAmount, reference, notes } ], history: [] }`.
The backend owns schedules: 60 months, ₱10,000 down payment, due dates, overdue status. The browser never generates them in api mode.

**Support ticket** (`support`): `id` (SUP-###), `accountType`, `accountId`, `accountName`, `relatedId`, `hsId`, `topic`, `subject`, `concern`, `priority`, `status` (`Open` / `In Progress` / `Resolved`), `createdAt`, `assignedTo`, `notes`, `resolutionNote`, `resolvedBy`, `resolvedAt`, `messages[]`, `history[]`

**Inquiry** (`inquiries`): `id` (INQ-… / PINQ-…), `name`, `email`, `phone`, `location`, `category`, `package`, `selectedSolarModel`, `electricBill`, `paymentPreference`, `subject`, `message`, `status`, `inquiryStatus`, `customerResponse`, `confirmationToken`, `confirmationEmailSentAt`, `timestamp`, `reply`

**Activity** (`activity`): `id`, `timestamp`, `role`, `actorId`, `user`, `action`, `record`, `recordType`, `details`

**Settings** (`settings`): `companyName`, `timezone`, `currency`, `contactEmail`, `directInstallTeam`, `maxDirectProjects`, `directInstallConfirmation`, `overdueThresholdDays`, `installationDelayThresholdDays`, `docReviewEscalationHours`, `autoNotifyInstallers`

**Documents** (`documents[APP ID].documents[]`): `{ id, name, optional, status, submitted, note, fileUrl }`
- Document ids: `gov_id_front`, `gov_id_back` (optional), `proof_of_income`, `proof_of_billing`, `bank_statement`, `other_requested` (optional)
- Statuses: `NOT_SUBMITTED`, `SUBMITTED`, `ACCEPTED`, `REUPLOAD_REQUIRED`
- Files go to object storage; return a secure `fileUrl`. Never base64.

**Notification**: `{ id, sourceEventId, timestamp, readAt, recipientRole, recipientId, type, title, message, … }`. Always target `recipientRole` and `recipientId`, never broadcast private notifications.

**Installation progress** (`installationProgress[APP ID]`): `{ appId, percent, notes, solarPanels, inverter, battery, referenceNumber, … }`. This is the same structure for Partner Installer and Hello Solar Direct.

## 8. ID formats

| Record | Format |
|---|---|
| Customer | `CUS-####` |
| Financer | `FIN-###` |
| Installer | `INS-###` |
| Merchant | `MER-###` |
| Engineer | `ENG-###` |
| Application | `APP-####` |
| Solar system | `HS-#####` |
| Installation job | `JOB-###` |
| Support ticket | `SUP-###` |
| Receipt | `RCPT-…` |
| Inquiry / partner inquiry | `INQ-…` / `PINQ-…` |

## 9. Installer job visibility

Mirrors `isVisibleToInstaller()` in `shared/hello-solar-shared.js`. Enforce it on the server.

1. Never show Hello Solar Direct jobs to partner installers.
2. If the installer declined the job (`declinedInstallerIds`), hide it, except in their declined history.
3. If `assignedInstallerId` is set, only that installer sees it.
4. Otherwise the job is open to eligible installers once it is cleared for installation:
   - Full payment: paid / verified **and** stage is `Approved`, `Ready for Installation` or `Installation`
   - Installment: stage is `Approved`, `Ready for Installation` or `Installation`

## 10. Super Admin & Direct Engineer commands

Every Super Admin and Direct Engineer write is sent as:

```
POST /admin/commands/<command>
{ "command": "admin.<command>", "params": { ...named fields... }, "args": [ ...same values in order... ] }
```

- Read `params` on the backend. `args` is kept only so older code keeps working.
- Default values from the frontend (for example `adminUser = "ADMIN (Limuel)"`) are display names only. Take the real actor from the token, not from the body.
- The reference logic for every command is the method with the same name in `shared/hello-solar-store.js` (class `HelloSolarStore`).
- Respond with the §5 write response.

#### Accounts

| Command | What it does | `params` fields |
|---|---|---|
| `createAccount` | Create a Customer, Financer, Installer, Merchant or Direct Engineer account | `payload` → `role` plus the account fields (`firstName`, `lastName`, `companyName`, `email`, `phone`, `location`, `status`, …; customers also `system`, `paymentType`, `hsId`, `appId`; engineers `engineerId`) |
| `updateAccountStatus` | Activate / deactivate / suspend an account (`type`: customers, financers, installers, merchants, engineers) | `type`<br>`id`<br>`newStatus`<br>`reason` (optional) |
| `activateCustomerAccount` | Activate a customer account (optionally setting a password) | `customerId`<br>`newPassword` (optional) |
| `queueActivationEmail` | Send the customer activation email (backend creates the token and link) | `customerId`<br>`adminUser` (optional) |

#### Financing & applications

| Command | What it does | `params` fields |
|---|---|---|
| `assignFinancer` | Send an installment application to a financer with an Active contract | `appId`<br>`financerId`<br>`options` (optional) → `adminUser`, `asOf` |
| `updateFinancerContract` | Change a financer's contract terms or status | `financerId`<br>`payload` (optional) → `annualRate`, `contractEndDate`, `contractStartDate`, `contractStatusOverride`, `contractTermMonths` |
| `updateApplicationStage` | Move an application to another lifecycle stage | `appId`<br>`newStage`<br>`options` (optional) → `actorId`, `details`, `role`, `user` |
| `updateDocumentStatus` | Accept / reject a required document | `appId`<br>`docName`<br>`newStatus` |
| `setInstallationCost` | Save the installation cost breakdown for an application | `appId`<br>`values` (optional)<br>`options` (optional) → `actorRole`, `adminUser` |

#### Payments

| Command | What it does | `params` fields |
|---|---|---|
| `verifyPaymentReceipt` | Verify a full-payment receipt (application becomes Ready for Installation) | `appId`<br>`options` (optional) → `adminUser` |
| `rejectPaymentReceipt` | Reject a full-payment receipt | `appId`<br>`options` (optional) → `adminUser`, `reason` |
| `uploadCustomerReceipt` | Upload a receipt on the customer's behalf | `appId`<br>`options` (optional) → `amount`, `bank`, `date`, `receipt`, `reference` |
| `verifyInstallmentReceipt` | Verify one installment receipt submission | `appId`<br>`submissionId`<br>`options` (optional) → `adminUser` |
| `rejectInstallmentReceipt` | Reject one installment receipt submission | `appId`<br>`submissionId`<br>`options` (optional) → `adminUser`, `reason` |
| `recordPayment` | Record an installment payment | `appId`<br>`options` (optional) → `adminUser`, `amount`, `date`, `method`, `notes`, `payInFull`, `reference` |
| `recordPaymentAdjustment` | Record a financial note or adjustment | `appId`<br>`options` (optional) → `adminUser`, `date`, `notes`, `type` |
| `requestSystemDisconnect` | Request a remote system disconnect (overdue account) | `appId`<br>`options` (optional) → `actorRole`, `adminUser`, `reason` |
| `confirmSystemDisconnect` | Backend callback only: the inverter disconnect is confirmed | `appId`<br>`confirmation` (optional) → `apiReference`, `confirmedAt` |

#### Installations

| Command | What it does | `params` fields |
|---|---|---|
| `assignPartnerInstaller` | Assign a partner installer (`installerRef` = INS-###) to an application | `appId`<br>`installerRef`<br>`schedule` (optional) |
| `acceptDirectInstallation` | Hand an approved application to the Hello Solar Direct engineering team | `appId` |
| `scheduleReadyProject` | Schedule a Ready for Installation project | `jobId`<br>`scheduleDate`<br>`scheduleTime`<br>`teamLead`<br>`notes` |
| `updateInstallationStatus` | Change an installation job's status, schedule or delay reason | `jobId`<br>`newStatus`<br>`newSchedule`<br>`notes`<br>`delayReason`<br>`teamLead` |

#### Direct Engineer

| Command | What it does | `params` fields |
|---|---|---|
| `engineerAcceptJob` | Direct Engineer accepts a Hello Solar Direct job | `jobId`<br>`engineer` → `actorId`, `name` |
| `saveDirectInstallationProgress` | Direct Engineer saves equipment and progress | `jobId`<br>`payload` → `battery`, `inverter`, `progress`, `referenceNumber`, `solarPanels`<br>`engineer` → `actorId`, `name` |
| `engineerCompleteInstallation` | Direct Engineer marks the installation complete | `jobId`<br>`engineer` → `actorId`, `name` |
| `engineerActivateSystem` | Direct Engineer activates the system (status ACTIVE) | `jobId`<br>`engineer` → `actorId`, `name` |

#### Support

| Command | What it does | `params` fields |
|---|---|---|
| `updateSupportTicket` | Change a ticket's status, priority, note or assignee | `ticketId`<br>`newStatus`<br>`priority`<br>`note`<br>`assignedTo`<br>`adminUser` (optional) |
| `addTicketMessage` | Reply in a support ticket conversation | `ticketId`<br>`text`<br>`sender` (optional)<br>`role` (optional) |
| `resolveSupportTicket` | Resolve a ticket (resolution note required) | `ticketId`<br>`resolutionNote`<br>`adminUser` (optional) |
| `reopenSupportTicket` | Reopen a resolved ticket | `ticketId`<br>`reason` (optional)<br>`adminUser` (optional) |

#### Inquiries

| Command | What it does | `params` fields |
|---|---|---|
| `approvePartnerInquiry` | Approve a partner (Financer/Installer/Merchant) inquiry | `inquiryId`<br>`adminUser` (optional) |
| `updateInquiryStatus` | Change an inquiry's status | `inquiryId`<br>`newStatus`<br>`note` (optional)<br>`adminUser` (optional) |
| `saveInquiryConfirmationMessage` | Save the message sent with the inquiry confirmation link | `inquiryId`<br>`message`<br>`adminUser` (optional) |
| `sendInquiryConfirmationEmail` | Send the inquiry confirmation email (backend creates the token) | `inquiryId`<br>`adminUser` (optional)<br>`message`<br>`options` (optional) → `confirmationUrl` |
| `updateInquiryCustomerResponse` | Record the customer's response to an inquiry | `inquiryId`<br>`customerResponse`<br>`adminUser` (optional) |
| `overrideInquiryCustomerResponse` | Admin override of the customer's inquiry response | `inquiryId`<br>`newStatus`<br>`reason` (optional)<br>`adminUser` (optional) |

#### Settings

| Command | What it does | `params` fields |
|---|---|---|
| `updateSettings` | Save platform settings | `settings` |

## 11. Data that is still browser-only

These features work in local mode, but they don't send anything to the backend yet. In api mode they stay in the browser until each one gets an endpoint.

| Portal | Data | Where in code |
|---|---|---|
| Installer | Job checklist and site notes | `Hello_Solar_Installer/assets/js/workspace.js` (`hello_solar_installer_checklist_<job>`, `hello_solar_installer_notes_<job>`) |
| Installer | Local job state cache | `Hello_Solar_Installer/assets/js/installer_data.js` (`hello_solar_installer_jobs_state_v2`) |
| Installer | Payout history | `Hello_Solar_Installer/payout.html` (demo data) |
| Merchant | Projects, payouts, installers list | `Hello_Solar_Merchant/assets/data/*.json`, loaded by `assets/js/merchant_data.js` (hidden in api mode) |
| Financer | Display-only figures (dashboard stats, sample activity), off in api mode | `Hello_Solar_Financer/js/portal_data.js` (`hello_solar_portal_data`) |
| All portals | Profile photos | `localStorage` avatar keys; needs file storage plus a `fileUrl` on the account |
| Customer | Telemetry, savings, equipment, warranties | `Hello_Solar_Customer/data/*.json` (hidden in api mode); future `GET /systems/:hsId/telemetry`, `/savings`, `/equipment`, `/warranties` |
| Landing page | "Leads" list | `Hello_Solar/js/index.js` (`hello_solar_leads`) |

## 12. Known limitations

- **Synchronous requests:** `/bootstrap`, `/auth/login`, `/auth/register` and `/applications/claim` use synchronous requests, so the page waits for them. Keep these endpoints fast. Moving to async is a later frontend change.
- **Optimistic updates:** the frontend applies a change before the server answers. If you reject it, return an `error` message the user can understand; the page offers a Reload.
- **Email:** in local mode, emails (activation, inquiry confirmation, password reset) are only simulated. The backend sends them.
