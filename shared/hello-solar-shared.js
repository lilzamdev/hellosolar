/**
 * Hello Solar — shared data access layer (window.HSShared)
 *
 * The single way portals read and write shared records. The system of record is the Super Admin store
 * (HELLO_SOLAR_SUPER_ADMIN_DATA_V2, seeded by shared/hello-solar-store.js) and stands in for the backend API.
 * All portals must be served from one origin for these records to be shared (see INTEGRATION_PLAN.md).
 *
 * Load order on every portal page: ../shared/hello-solar-store.js → ../shared/hello-solar-shared.js → portal scripts.
 */
(function (window) {
    "use strict";

    const DATA_KEY = "HELLO_SOLAR_SUPER_ADMIN_DATA_V2";
    const DOCUMENTS_KEY = "hello_solar_shared_documents";
    const NOTIFICATIONS_KEY = "hello_solar_notifications_store";
    const INSTALLATION_PROGRESS_KEY = "hello_solar_installation_progress";
    const NOTIFICATION_CHANNEL = "hello_solar_notifications_bus";

    // Runtime mode (shared/hello-solar-config.js). Without the config file (e.g. Node tests) → local mode.
    const CONFIG = window.HS_CONFIG || { mode: "local", isApi: false, demoData: true };
    const IS_API = !!CONFIG.isApi;
    const API = window.HSApi || null;
    // Shared records go through HSStore: localStorage in local mode, the backend-fed cache in api mode
    const backing = () => window.HSStore || window.localStorage;
    // Sends a write to the backend as a named command (no-op in local mode)
    function sendCommand(cmd, result) {
        if (!IS_API || !API || !cmd) return;
        const c = typeof cmd === "function" ? cmd(result) : cmd;
        if (c && c.name) API.command(c.name, c.payload || {});
    }

    // One session per role. A portal only ever reads/writes its own keys.
    const ROLES = {
        customer: { collection: "customers", flagKey: "hello_solar_logged_in", userKey: "hello_solar_user", label: "Customer", idPrefix: "CUS-" },
        financer: { collection: "financers", flagKey: "hello_solar_financer_logged_in", userKey: "hello_solar_financer_user", label: "Financer", idPrefix: "FIN-" },
        installer: { collection: "installers", flagKey: "hello_solar_installer_logged_in", userKey: "hello_solar_installer_user", label: "Installer", idPrefix: "INS-" },
        merchant: { collection: "merchants", flagKey: "hello_solar_merchant_logged_in", userKey: "hello_solar_merchant_user", label: "Merchant", idPrefix: "MER-" }
    };

    const storage = {
        get(key) { try { return backing().getItem(key); } catch (e) { return null; } },
        set(key, value) { backing().setItem(key, value); },
        remove(key) { try { backing().removeItem(key); } catch (e) { /* storage unavailable */ } },
        json(key, fallback) {
            try {
                const raw = backing().getItem(key);
                return raw ? JSON.parse(raw) : fallback;
            } catch (e) { return fallback; }
        }
    };

    const norm = value => String(value == null ? "" : value).trim().toLowerCase();
    const nowISO = () => new Date().toISOString();

    // ------------------------------------------------------------------
    // Shared store access
    // ------------------------------------------------------------------
    function ensureSeeded() {
        if (storage.get(DATA_KEY)) return true;
        if (IS_API) return false; // api mode: records come from the backend bootstrap, never from seed data
        const db = window.HELLO_SOLAR_DB;
        if (db && typeof db.save === "function") {
            db.save();
            return !!storage.get(DATA_KEY);
        }
        return false;
    }

    function read() {
        ensureSeeded();
        const data = storage.json(DATA_KEY, null);
        return data && Array.isArray(data.applications) ? data : null;
    }

    // Read-modify-write against the latest stored copy so other tabs' changes are never overwritten.
    // cmd: { name, payload } or (result) => ({ name, payload }) — the backend command for this write (api mode).
    function update(mutator, cmd) {
        const data = read();
        if (!data) return { ok: false, error: "Shared records are unavailable. Open the portals from the shared Hello Solar origin." };
        const result = mutator(data);
        if (result && result.ok === false) return result;
        try {
            storage.set(DATA_KEY, JSON.stringify(data));
        } catch (e) {
            return { ok: false, error: "Could not save to browser storage." };
        }
        const out = Object.assign({ ok: true }, result || {});
        if (IS_API && !cmd) console.warn("[HSShared] update() without a backend command — this change stays in the page cache.");
        sendCommand(cmd, out);
        return out;
    }

    // Saves a full copy of the shared records that the caller already changed (legacy portal write path, e.g. the
    // Installer portal), plus the backend command describing the change.
    function persist(data, cmd) {
        if (!data || !Array.isArray(data.applications)) return { ok: false, error: "Nothing to save." };
        try {
            storage.set(DATA_KEY, JSON.stringify(data));
        } catch (e) {
            return { ok: false, error: "Could not save to browser storage." };
        }
        sendCommand(cmd, { ok: true });
        return { ok: true };
    }

    function logActivity(data, entry) {
        if (!Array.isArray(data.activity)) data.activity = [];
        const ts = nowISO();
        data.activity.unshift(Object.assign({
            id: `ACT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            timestamp: ts,
            details: {}
        }, entry));
    }

    // ------------------------------------------------------------------
    // Accounts & identity
    // ------------------------------------------------------------------
    function accountsFor(role, data) {
        const cfg = ROLES[role];
        if (!cfg || !data) return [];
        const list = Array.isArray(data[cfg.collection]) ? data[cfg.collection] : [];
        // The internal installation team is Hello Solar Direct, not a partner installer login
        return role === "installer" ? list.filter(a => a.type !== "Internal") : list;
    }

    function findAccount(role, identifier, data) {
        const id = norm(identifier);
        if (!id) return null;
        return accountsFor(role, data || read()).find(a =>
            norm(a.email) === id || norm(a.username) === id || norm(a.id) === id) || null;
    }

    function getAccount(role, accountId, data) {
        if (!accountId) return null;
        return accountsFor(role, data || read()).find(a => a.id === accountId) || null;
    }

    function authenticate(role, identifier, password) {
        if (IS_API) {
            // Backend verifies the password and the account status, and returns { token, account, bootstrap? }
            const res = API.requestSync("POST", "/auth/login", { role, identifier, password }, { role, auth: false });
            if (!res.ok || !res.data || !res.data.account) {
                return { ok: false, error: (res.data && res.data.error) || (res.status === 0 ? res.error : "Invalid email/username or password. Please try again.") };
            }
            API.tokens.set(role, res.data.token);
            if (res.data.bootstrap && window.HSStore) window.HSStore.cache.load(res.data.bootstrap);
            const account = Object.assign({}, res.data.account);
            delete account.password;
            return { ok: true, account };
        }
        const data = read();
        if (!data) return { ok: false, error: "Shared records are unavailable. Open the portals from the shared Hello Solar origin." };
        const account = findAccount(role, identifier, data);
        if (!account || !account.password || account.password !== String(password || "")) {
            return { ok: false, error: "Invalid email/username or password. Please try again." };
        }
        if (account.status !== "Active") {
            return {
                ok: false,
                error: account.status === "Pending Review"
                    ? "Your account is pending Hello Solar review. You can log in once it has been activated."
                    : "This account is not active. Please contact Hello Solar support."
            };
        }
        // First login of an invited customer completes the invitation (same fields as Super Admin activation)
        if (role === "customer" && account.invitationStatus && account.invitationStatus !== "Active") {
            update(d => {
                const c = (d.customers || []).find(x => x.id === account.id);
                if (c) {
                    c.invitationStatus = "Active";
                    c.activatedAt = nowISO();
                    logActivity(d, {
                        role: "Customer", actorId: c.id, user: c.name, record: c.id, recordType: "Customer Account",
                        action: `Customer ${c.id} (${c.name}) activated portal account on first login`,
                        details: { customerId: c.id, invitationStatus: "Active" }
                    });
                }
            });
        }
        return { ok: true, account };
    }

    function nextId(list, prefix, pad) {
        const max = list.reduce((m, r) => {
            const match = String(r.id || "").match(new RegExp("^" + prefix + "(\\d+)$"));
            return match ? Math.max(m, parseInt(match[1], 10)) : m;
        }, prefix === "CUS-" ? 1000 : 0);
        return prefix + String(max + 1).padStart(pad, "0");
    }

    // Portal self-signup: registers a Pending Review account. Super Admin activates it before it can log in.
    function registerPendingAccount(role, profile) {
        const cfg = ROLES[role];
        if (!cfg) return { ok: false, error: "Unknown account type." };
        const email = String(profile.email || "").trim();
        if (IS_API) {
            // Backend creates the Pending Review account and assigns the ID (password is hashed server-side)
            const res = API.requestSync("POST", "/auth/register", { role, profile }, { role, auth: false });
            return res.ok ? { ok: true, account: (res.data && res.data.account) || null }
                : { ok: false, error: (res.data && res.data.error) || res.error };
        }
        return update(data => {
            if (!Array.isArray(data[cfg.collection])) data[cfg.collection] = [];
            const all = ["customers", "financers", "installers", "merchants"].flatMap(k => data[k] || []);
            if (all.some(a => norm(a.email) === norm(email))) {
                return { ok: false, error: "An account with this email already exists." };
            }
            const id = nextId(data[cfg.collection], cfg.idPrefix, role === "customer" ? 4 : 3);
            const record = Object.assign({}, profile, {
                id, email, status: "Pending Review", joined: nowISO().slice(0, 10), source: `${cfg.label} portal signup`
            });
            if (role === "installer") record.type = "Partner";
            if (role === "customer") record.invitationStatus = "Pending Activation";
            data[cfg.collection].unshift(record);
            logActivity(data, {
                role: cfg.label, actorId: id, user: record.name || email, record: id, recordType: `${cfg.label} Account`,
                action: `${cfg.label} account ${id} registered via portal signup — pending Super Admin review`,
                details: { id, email, status: "Pending Review" }
            });
            return { account: record };
        });
    }

    // ------------------------------------------------------------------
    // Sessions (per role, never shared between portals)
    // ------------------------------------------------------------------
    const session = {
        start(role, account, extra) {
            const cfg = ROLES[role];
            const payload = Object.assign({
                role,
                accountId: account.id,
                email: account.email,
                username: account.username || account.email,
                name: account.name || account.contact || account.email,
                contact: account.contact || "",
                phone: account.phone || ""
            }, extra || {});
            delete payload.password;
            storage.set(cfg.flagKey, "true");
            storage.set(cfg.userKey, JSON.stringify(payload));
            return payload;
        },
        get(role) {
            const cfg = ROLES[role];
            if (!cfg || storage.get(cfg.flagKey) !== "true") return null;
            const user = storage.json(cfg.userKey, null);
            if (!user || typeof user !== "object" || user.role !== role || !user.accountId) return null;
            return user;
        },
        // Updates profile fields on the current session (never identity fields)
        patch(role, fields) {
            const cfg = ROLES[role];
            const current = session.get(role);
            if (!current) return null;
            const next = Object.assign({}, current, fields, { role, accountId: current.accountId });
            delete next.password;
            storage.set(cfg.userKey, JSON.stringify(next));
            return next;
        },
        clear(role) {
            const cfg = ROLES[role];
            if (!cfg) return;
            if (IS_API && API && API.tokens.get(role)) {
                API.request("POST", "/auth/logout", {}, { role });
                API.tokens.clear(role);
            }
            storage.remove(cfg.flagKey);
            storage.remove(cfg.userKey);
        },
        // Valid when the session is for this role and the account still exists and is Active.
        isValid(role) {
            const user = session.get(role);
            if (!user) return false;
            if (IS_API && !(API && API.tokens.get(role))) return false;
            const account = getAccount(role, user.accountId);
            return !!account && account.status === "Active";
        },
        require(role, loginUrl) {
            if (session.isValid(role)) return session.get(role);
            session.clear(role);
            window.location.replace(loginUrl || "login.html");
            return null;
        }
    };

    // ------------------------------------------------------------------
    // Applications
    // ------------------------------------------------------------------
    function getApplication(appId, data) {
        const d = data || read();
        return d ? (d.applications || []).find(a => a.id === appId) || null : null;
    }

    function findApplicationByHsId(hsId, data) {
        const d = data || read();
        const id = norm(hsId);
        return d && id ? (d.applications || []).find(a => norm(a.hsId) === id) || null : null;
    }

    function applicationsForCustomer(customerId, data) {
        const d = data || read();
        return d && customerId ? (d.applications || []).filter(a => a.customerId === customerId) : [];
    }

    function applicationsForFinancer(financerId, data) {
        const d = data || read();
        return d && financerId ? (d.applications || []).filter(a => a.financerId === financerId) : [];
    }

    const isFullPayment = app => /full/i.test(String(app && (app.paymentType || app.paymentPreference) || "")) || (app && app.financer === "Not Required");
    const isDirect = app => !!app && (app.installerType === "Hello Solar Direct" || app.installerType === "Maintenance" || app.assignedInstallerId === "INS-001" || app.installer === "Hello Solar Internal Team");

    // Cleared for installation: financing approved (installment) or payment verified (full payment)
    function isClearedForInstallation(app) {
        if (!app || app.stage === "Declined" || app.dispatchStatus === "Cancelled") return false;
        const stage = String(app.stage || "");
        if (isFullPayment(app)) {
            const paid = ["Verified / Paid", "Verified", "Paid", "Completed"].includes(app.paymentStatus) || app.receiptVerificationStatus === "Verified";
            return paid && ["Ready for Installation", "Approved", "Installation"].includes(stage);
        }
        return ["Approved", "Ready for Installation", "Installation"].includes(stage)
            || String(app.applicationStatus || "").toUpperCase() === "READY_FOR_INSTALLATION";
    }

    // Partner installer job visibility (see API_CONTRACT.md, "Installer job visibility")
    function isVisibleToInstaller(app, installer, includeDeclined) {
        if (!app || !installer || isDirect(app)) return false;
        const declined = (app.declinedInstallerIds || []).includes(installer.id);
        if (declined && !includeDeclined) return false;
        if (app.assignedInstallerId) return app.assignedInstallerId === installer.id;
        // Assigned by name only (legacy record): treat as assigned to that installer
        if (app.installer && app.installer !== "Unassigned") return norm(app.installer) === norm(installer.name);
        // Open (unassigned) jobs reach installers only when the customer's documents are complete
        return (isClearedForInstallation(app) && applicationDocsComplete(app).ok) || declined;
    }

    // ------------------------------------------------------------------
    // Customer operations on shared records
    // ------------------------------------------------------------------
    const digits = v => String(v || "").replace(/\D/g, "").slice(-10);

    // Links an existing system (by HS ID) to the signed-in customer after verifying the owner contact on record.
    function claimApplicationByHsId(customerId, hsId, contact) {
        const id = String(hsId || "").trim().toUpperCase();
        if (!/^HS-\d{5}$/.test(id)) return { ok: false, field: "hsId", error: "Enter a valid HS ID (format HS-12345)." };
        if (IS_API) {
            const res = API.requestSync("POST", "/applications/claim", { customerId, hsId: id, contact }, { role: "customer" });
            if (!res.ok) return { ok: false, field: (res.data && res.data.field) || "hsId", error: (res.data && res.data.error) || res.error };
            if (window.HSStore) window.HSStore.cache.merge(res.data);
            return { ok: true, app: (res.data && res.data.app) || null };
        }
        return update(data => {
            const app = (data.applications || []).find(a => norm(a.hsId) === norm(id));
            if (!app) return { ok: false, field: "hsId", error: `No Hello Solar system was found for ${id}.` };
            if (app.customerId === customerId) return { ok: false, field: "hsId", error: `${id} is already linked to your account.` };
            if (app.customerId) return { ok: false, field: "contact", error: "Cannot link another customer’s system. Ownership verification failed." };
            const c = String(contact || "").trim();
            const emailOk = c && norm(c) === norm(app.contactEmail);
            const phoneOk = digits(c).length >= 7 && digits(c) === digits(app.contactPhone);
            if (!emailOk && !phoneOk) {
                return { ok: false, field: "contact", error: `Verification failed. The contact details do not match the registered owner records for ${id}.` };
            }
            const customer = (data.customers || []).find(x => x.id === customerId);
            app.customerId = customerId;
            if (customer) app.customer = customer.name;
            app.updated = "Just now";
            logActivity(data, {
                role: "Customer", actorId: customerId, user: customer ? customer.name : customerId, record: app.id, recordType: "Application",
                action: `Customer ${customerId} linked existing system ${app.id} (${app.hsId}) after owner contact verification`,
                details: { appId: app.id, hsId: app.hsId, customerId }
            });
            return { app };
        });
    }

    // Customer payment receipt → Super Admin verification. Full payment uses the application's receipt fields
    // (the existing Super Admin Verify / Reject flow); installment receipts are recorded as pending submissions.
    function submitReceipt(customerId, appId, payload) {
        return update(data => {
            const app = (data.applications || []).find(a => a.id === appId && a.customerId === customerId);
            if (!app) return { ok: false, error: "This system is not linked to your account." };
            const customer = (data.customers || []).find(x => x.id === customerId);
            const amount = Number(String(payload.amount || "").replace(/[^0-9.]/g, "")) || null;
            // Billing periods this receipt pays (installment): { billId, period, dueDate (ISO), amount }
            const bills = (Array.isArray(payload.bills) ? payload.bills : []).filter(b => b && (b.billId || b.dueDate)).map(b => ({
                billId: b.billId || null,
                period: b.period || "",
                dueDate: b.dueDate || "",
                amount: Number(String(b.amount == null ? "" : b.amount).replace(/[^0-9.]/g, "")) || null
            }));
            if (!isFullPayment(app) && bills.length && (app.receiptSubmissions || []).some(s =>
                s.status === "Pending Verification" && (s.bills || []).some(x => bills.some(b => b.billId && b.billId === x.billId)))) {
                return { ok: false, error: "A receipt for this billing period is already awaiting verification." };
            }
            const submission = {
                id: `RCPT-${app.id.replace(/\D/g, "")}-${Date.now().toString().slice(-6)}`,
                appId: app.id,
                customerId,
                fileName: payload.fileName || "",
                channel: payload.channel || "",
                amount,
                date: payload.date || nowISO().slice(0, 10),
                reference: payload.reference || "",
                bills,
                billIds: bills.length ? bills.map(b => b.billId).filter(Boolean) : (Array.isArray(payload.billIds) ? payload.billIds : []),
                submittedAt: nowISO(),
                status: "Pending Verification"
            };
            app.receiptSubmissions = [submission].concat(app.receiptSubmissions || []).slice(0, 50);
            app.receiptVerificationStatus = "Pending Verification";
            if (isFullPayment(app)) {
                app.uploadedReceipt = submission.fileName;
                app.receiptUploadedAt = submission.date;
                app.receiptBank = submission.channel;
                app.receiptReference = submission.reference;
                app.receiptAmount = amount;
                app.paymentStatus = "Verification Required";
                const sched = data.paymentSchedules && data.paymentSchedules[app.id];
                if (sched && sched.installments && sched.installments[0]) {
                    sched.installments[0].status = "Verification Required";
                    sched.installments[0].reference = submission.reference;
                }
            } else if (submission.billIds.length) {
                app.receiptForBills = submission.billIds;
            }
            app.updated = "Just now";
            logActivity(data, {
                role: "Customer", actorId: customerId, user: customer ? customer.name : customerId, record: app.id, recordType: "Payment",
                action: `Customer uploaded payment receipt for ${app.id} (${app.customer}) · Status: Verification Required.`,
                details: { appId: app.id, receipt: submission.fileName, ref: submission.reference, submissionId: submission.id }
            });
            return { submission };
        }, r => ({ name: "receipt.submit", payload: { appId, customerId, submission: r.submission } }));
    }

    // ------------------------------------------------------------------
    // Service agreement (Documents page). Full Payment → "Full Payment Agreement",
    // Installment → "Installment Agreement" (PDFs in Hello_Solar_Customer/assets/PDF).
    // The customer downloads the PDF, fills it out and signs it, then uploads the signed copy here.
    // Super Admin (Applications › Details › Documents) views the file and accepts it or asks for a re-upload.
    // Metadata lives on the application (app.agreement); the file itself is kept under its own key
    // (local mode) so the main shared record stays small. Status: NOT_SUBMITTED | SUBMITTED | ACCEPTED | REUPLOAD_REQUIRED
    // ------------------------------------------------------------------
    const AGREEMENT_FILES_KEY = "hello_solar_signed_agreements";
    const AGREEMENT_TEMPLATES = {
        full_payment: { title: "Full Payment Agreement", file: "assets/PDF/Full Payment Agreement.pdf" },
        installment: { title: "Installment Agreement", file: "assets/PDF/Installment Agreement.pdf" }
    };
    const AGREEMENT_MAX_BYTES = 2 * 1024 * 1024;
    const AGREEMENT_TYPES = ["application/pdf", "image/jpeg", "image/png"];
    const LEGACY_AGREEMENT_STATUS = { NOT_SIGNED: "NOT_SUBMITTED", SIGNED: "SUBMITTED", RESIGN_REQUIRED: "REUPLOAD_REQUIRED" };

    function agreementFileFor(appId) {
        const store = storage.json(AGREEMENT_FILES_KEY, {});
        return store && store[appId] ? store[appId] : null;
    }

    function agreementFor(appOrId) {
        const app = typeof appOrId === "string" ? getApplication(appOrId) : appOrId;
        if (!app) return null;
        const type = isFullPayment(app) ? "full_payment" : "installment";
        const saved = app.agreement || {};
        const status = LEGACY_AGREEMENT_STATUS[saved.status] || saved.status || "NOT_SUBMITTED";
        return Object.assign({}, saved, AGREEMENT_TEMPLATES[type], { type, status });
    }

    function uploadSignedAgreement(customerId, appId, file, fileData) {
        if (!file || !file.name) return { ok: false, error: "Choose the signed agreement file to upload." };
        const fileType = file.type || "";
        if (!AGREEMENT_TYPES.includes(fileType)) return { ok: false, error: "Upload a PDF, JPG or PNG file." };
        if (Number(file.size) > AGREEMENT_MAX_BYTES) return { ok: false, error: "The file is too large. The maximum is 2 MB." };
        const now = nowISO();
        const result = update(data => {
            const app = (data.applications || []).find(a => a.id === appId && a.customerId === customerId);
            if (!app) return { ok: false, error: "This system is not linked to your account." };
            const current = agreementFor(app);
            if (current.status === "ACCEPTED") return { ok: false, error: "Your signed agreement was already accepted by Hello Solar." };
            const customer = (data.customers || []).find(x => x.id === customerId);
            app.agreement = {
                type: current.type,
                title: current.title,
                fileName: file.name,
                fileType,
                fileSize: Number(file.size) || 0,
                uploadedAt: now,
                status: "SUBMITTED",
                note: "",
                reviewedAt: null
            };
            app.updated = "Just now";
            logActivity(data, {
                role: "Customer", actorId: customerId, user: customer ? customer.name : customerId, record: app.id, recordType: "Document",
                action: `Customer uploaded the signed ${current.title} for ${app.id} (${file.name}).`,
                details: { appId: app.id, agreement: current.title, fileName: file.name }
            });
            return { agreement: agreementFor(app) };
        }, r => ({ name: "agreement.upload", payload: { appId, customerId, agreement: r.agreement } }));
        if (!result.ok) return result;
        if (!IS_API && fileData) {
            try {
                const store = storage.json(AGREEMENT_FILES_KEY, {}) || {};
                store[appId] = { fileName: file.name, fileType, fileData, uploadedAt: now };
                storage.set(AGREEMENT_FILES_KEY, JSON.stringify(store));
            } catch (e) {
                return { ok: false, error: "The file could not be saved in this browser (storage is full). Try a smaller file." };
            }
        }
        if (IS_API && API) {
            const form = new window.FormData();
            form.append("file", file, file.name);
            form.append("appId", appId);
            API.command("agreement.upload", { appId }, { formData: form });
        }
        return result;
    }

    // Super Admin review: ACCEPTED, or REUPLOAD_REQUIRED with a note
    function reviewAgreement(appId, status, note, actor) {
        let st = String(status || "").toUpperCase();
        st = LEGACY_AGREEMENT_STATUS[st] || st;
        if (!["ACCEPTED", "REUPLOAD_REQUIRED"].includes(st)) return { ok: false, error: "Unknown agreement status." };
        return update(data => {
            const app = (data.applications || []).find(a => a.id === appId);
            if (!app || !app.agreement || !app.agreement.uploadedAt) return { ok: false, error: "The customer has not uploaded the signed agreement yet." };
            app.agreement.status = st;
            app.agreement.note = note || "";
            app.agreement.reviewedAt = nowISO();
            logActivity(data, {
                role: "Super Admin", user: actor || "Super Admin", record: app.id, recordType: "Document",
                action: st === "ACCEPTED" ? `Accepted the signed ${app.agreement.title} for ${app.id}.` : `Asked the customer to upload the ${app.agreement.title} again for ${app.id}.`,
                details: { appId: app.id, status: st, note: note || "" }
            });
            return { agreement: agreementFor(app) };
        }, { name: "agreement.review", payload: { appId, status: st, note: note || "" } });
    }

    // ------------------------------------------------------------------
    // Site visits (landing page Site Assessment requests, assigned by Super Admin)
    // ------------------------------------------------------------------
    function siteVisitsFor(assigneeType, assigneeId, data) {
        const d = data || read();
        if (!d || !assigneeId) return [];
        return (Array.isArray(d.siteVisits) ? d.siteVisits : []).filter(v =>
            v && v.assignee && v.assignee.type === assigneeType && v.assignee.refId === assigneeId && v.status !== "Cancelled");
    }

    // Installer / engineer marks an assigned site visit as completed
    function completeSiteVisit(visitId, actor, notes) {
        return update(data => {
            const v = (Array.isArray(data.siteVisits) ? data.siteVisits : []).find(x => x.id === visitId);
            if (!v) return { ok: false, error: "Site visit not found." };
            if (!v.assignee || v.assignee.refId !== actor.id) return { ok: false, error: "This site visit is not assigned to you." };
            if (v.status === "Completed") return { ok: false, error: "This site visit is already completed." };
            v.status = "Completed";
            v.completedAt = nowISO();
            v.updatedAt = v.completedAt;
            if (notes) v.notes = String(notes).trim();
            logActivity(data, {
                role: actor.role || "Installer", actorId: actor.id, user: actor.name || actor.id, record: v.id, recordType: "Site Visit",
                action: `${actor.name || actor.id} completed site visit ${v.id} (${v.customer})`,
                details: { visitId: v.id, notes: v.notes || "" }
            });
            return { visit: v };
        }, r => ({ name: "siteVisit.complete", payload: { visitId, actorId: actor.id, notes: notes || "" } }));
    }

    // ------------------------------------------------------------------
    // Down payment & reimbursements (Customer portal → Accounting)
    // ------------------------------------------------------------------
    function downPaymentFor(app) {
        if (!app) return null;
        const status = app.downPaymentStatus || (Number(app.downPayment) > 0 ? "Verified" : null);
        if (!status) return null;
        return {
            amount: Number(app.downPaymentAmount) > 0 ? Number(app.downPaymentAmount) : (isFullPayment(app) ? 500 : 10000),
            status,
            refunded: !!(app.refund && app.refund.status === "Refunded"),
            refund: app.refund || null,
            receiptName: app.downPaymentProof ? app.downPaymentProof.fileName : ""
        };
    }

    // Refund state of the down payment — same rule as Super Admin → Accounting: the deposit is refundable when
    // the customer does NOT proceed and is deducted from the system price when they proceed.
    // state: refunded | awaiting_verification | deducted | refundable | pending_decision
    function downPaymentRefundState(app, data) {
        const dp = downPaymentFor(app);
        if (!dp) return null;
        if (dp.refunded) return { state: "refunded", label: "Refunded", canRequest: false };
        if (dp.status !== "Verified") return { state: "awaiting_verification", label: "Waiting for verification", canRequest: false };
        const d = data || read();
        let decision = app.clientDecision || null;
        if (!decision) {
            const job = d && Array.isArray(d.installations) && d.installations.some(j => j.appId === app.id && j.status !== "Cancelled");
            if (["Declined", "Cancelled"].includes(app.stage)) decision = "Not Proceeding";
            else if (job || isApplicationActive(app) || ["Approved", "Ready for Installation", "Installation", "In Progress", "Completed", "Installation Completed"].includes(app.stage)) decision = "Proceeding";
        }
        if (decision === "Proceeding") return { state: "deducted", label: "Deducted from your system price", canRequest: false };
        if (decision === "Not Proceeding") return { state: "refundable", label: "Refundable", canRequest: true };
        return { state: "pending_decision", label: "Refundable if you don't proceed", canRequest: true };
    }

    function reimbursementsFor(customerId, data) {
        const d = data || read();
        return (d && Array.isArray(d.reimbursements) ? d.reimbursements : []).filter(r => r.customerId === customerId);
    }

    function requestReimbursement(customerId, appId, payload) {
        return update(data => {
            const app = (data.applications || []).find(a => a.id === appId && a.customerId === customerId);
            if (!app) return { ok: false, error: "This system is not linked to your account." };
            const amount = Number(String(payload.amount || "").replace(/[^0-9.]/g, ""));
            if (!(amount > 0)) return { ok: false, error: "Enter the amount to be reimbursed." };
            if (payload.type === "Site Visit Fee") return { ok: false, error: "The site visit fee is deducted from your system price when you proceed and is not refundable when you don't." };
            if (payload.type === "Down Payment") {
                const refund = downPaymentRefundState(app, data);
                if (refund && !refund.canRequest) return { ok: false, error: refund.state === "deducted"
                    ? "Your down payment is deducted from your system price because you are proceeding with the installation."
                    : (refund.state === "refunded" ? "Your down payment was already refunded." : "Your down payment is still waiting for verification.") };
            }
            const reason = String(payload.reason || "").trim();
            if (reason.length < 10) return { ok: false, error: "Please describe the reason (at least 10 characters)." };
            if (!Array.isArray(data.reimbursements)) data.reimbursements = [];
            if (data.reimbursements.some(r => r.appId === appId && r.type === payload.type && r.status === "Pending")) {
                return { ok: false, error: "You already have a pending request of this type." };
            }
            let max = 1000;
            data.reimbursements.forEach(r => { const n = parseInt(String(r.id).replace(/\D/g, ""), 10); if (n > max) max = n; });
            const customer = (data.customers || []).find(c => c.id === customerId);
            const request = {
                id: `RMB-${max + 1}`, customerId, customer: customer ? customer.name : app.customer, appId,
                type: ["Down Payment", "Other"].includes(payload.type) ? payload.type : "Other",
                amount, reason,
                attachment: payload.attachment && payload.attachment.fileName ? { fileName: payload.attachment.fileName, fileType: payload.attachment.fileType || "", dataUrl: payload.attachment.dataUrl || null } : null,
                payoutDetails: String(payload.payoutDetails || "").trim(),
                status: "Pending", requestedAt: nowISO(), resolvedAt: null, resolvedBy: null, resolutionNote: ""
            };
            data.reimbursements.unshift(request);
            logActivity(data, {
                role: "Customer", actorId: customerId, user: request.customer, record: appId, recordType: "Accounting",
                action: `Customer requested a ₱${amount.toLocaleString("en-PH")} reimbursement (${request.type}) for ${appId}`,
                details: { reimbursementId: request.id, type: request.type, amount }
            });
            return { request };
        }, r => ({ name: "reimbursement.request", payload: { customerId, appId, request: r.request } }));
    }

    // Installment schedule of an application — the single source for billing periods, due dates, installment
    // status and payment history in every portal. A schedule Super Admin has not generated yet is generated with
    // the Super Admin rules and saved on first read, so its dates never change afterwards.
    function paymentScheduleFor(appId) {
        const data = read();
        if (!data || !getApplication(appId, data)) return null;
        const stored = data.paymentSchedules && data.paymentSchedules[appId];
        if (stored && Array.isArray(stored.installments)) return stored;
        if (IS_API) return null; // api mode: the backend generates and owns payment schedules
        const db = window.HELLO_SOLAR_DB;
        if (!db || typeof db.getPaymentSchedule !== "function") return null;
        let created = null;
        update(d => {
            if (!d.paymentSchedules || typeof d.paymentSchedules !== "object") d.paymentSchedules = {};
            if (!d.paymentSchedules[appId]) {
                const saved = db.data;
                db.data = d;
                try { db.getPaymentSchedule(appId); } finally { db.data = saved; }
            }
            created = d.paymentSchedules[appId] || null;
        });
        return created;
    }

    function nextSupportId(list) {
        const max = (list || []).reduce((m, t) => {
            const n = parseInt(String(t && t.id || "").replace(/^SUP-/i, ""), 10);
            return isNaN(n) ? m : Math.max(m, n);
        }, 0);
        return `SUP-${String(max + 1).padStart(3, "0")}`;
    }

    // Opens a ticket in the shared support queue (Super Admin → Support)
    function createSupportTicket(ticket) {
        return update(data => {
            if (!Array.isArray(data.support)) data.support = [];
            const now = nowISO();
            const id = nextSupportId(data.support);
            const role = ticket.accountType || "Customer";
            const record = {
                id,
                accountType: role,
                accountId: ticket.accountId,
                accountName: ticket.accountName,
                relatedId: ticket.relatedId || "",
                hsId: ticket.hsId || "",
                topic: ticket.category || "Other",
                subject: ticket.subject || "Support Request",
                concern: ticket.subject || ticket.category || "Support Request",
                priority: ticket.priority || "Medium",
                urgency: ticket.urgency || "",
                status: "Open",
                created: "Just now",
                createdAt: now,
                assignedTo: null,
                notes: ticket.description || "",
                resolutionNote: null,
                resolvedBy: null,
                resolvedAt: null,
                messages: [{ id: `MSG-${id}-1`, sender: `${ticket.accountName} (${role})`, role, time: "Just now", createdAt: now, text: ticket.description || "" }],
                history: [{ id: `TH-${id}-1`, time: "Just now", createdAt: now, user: "System", action: `Ticket created via ${role} Portal`, type: "create" }]
            };
            data.support.unshift(record);
            logActivity(data, {
                role, actorId: ticket.accountId, user: ticket.accountName, record: id, recordType: "Support Ticket",
                action: `Submitted support request ${id}${record.relatedId ? " for " + record.relatedId : ""}`,
                details: { ticketId: id, relatedId: record.relatedId, priority: record.priority }
            });
            return { ticket: record };
        }, r => ({ name: "support.create", payload: { ticket: r.ticket } }));
    }

    function supportTicketsFor(accountType, accountId, data) {
        const d = data || read();
        return d ? (d.support || []).filter(t => t.accountType === accountType && t.accountId === accountId) : [];
    }

    // Required documents live in their own shared store keyed by APP ID (files kept out of the main store).
    // One record per installment application, read and written by the Customer portal (uploads), the Financer
    // review and Super Admin (verdicts). Record: { appId, paymentType, updatedAt, documents: [
    //   { id, name, optional, status, submitted, note, fileName, fileType, fileSize, fileData, uploadedAt, reviewedAt } ] }
    // status: NOT_SUBMITTED | SUBMITTED | UNDER_REVIEW | ACCEPTED | REUPLOAD_REQUIRED
    const DOCUMENT_STATUSES = ["NOT_SUBMITTED", "SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REUPLOAD_REQUIRED"];
    const DOCUMENT_SUBMITTED_STATES = ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED"];
    // Documents every customer submits (Full Payment and Installment). optional → "if applicable" (only when asked)
    const DOCUMENT_REQUESTS = [
        { id: "valid_id_1", name: "Valid ID #1 — Front & Back, with Signature" },
        { id: "valid_id_2", name: "Valid ID #2 — Front & Back, with Signature" },
        { id: "income_proof", name: "Payslips (Last 3 Months) or Latest Bank Statement" },
        { id: "residence_proof", name: "Proof of Home Ownership or Contract of Lease (5–10 Years, if Rented)" },
        { id: "proof_of_billing", name: "Proof of Billing / Utility Bill" },
        { id: "site_photos", name: "Site Photos — Roof & Neighborhood" },
        { id: "site_map_link", name: "Google Maps Link of House / Site", kind: "link" },
        { id: "other_requested", name: "Other Requested Document", optional: true }
    ];
    // Earlier document ids carried over to the current list (an older Government ID → Valid ID #1; Proof of Income
    // and Bank Statement → Payslips or Bank Statement, keeping the furthest-along of the two)
    const LEGACY_DOCUMENT_IDS = {
        government_id: "valid_id_1", gov_id_front: "valid_id_1", meralco_bill: "proof_of_billing",
        proof_of_income: "income_proof", bank_statement: "income_proof"
    };
    const DOCUMENT_STATUS_RANK = { ACCEPTED: 4, UNDER_REVIEW: 3, SUBMITTED: 2, REUPLOAD_REQUIRED: 1, NOT_SUBMITTED: 0 };
    // Requests added after the first document list. Applications approved / paid before they existed don't need them.
    const LATER_DOCUMENT_IDS = { installment: ["valid_id_2", "residence_proof"], full_payment: ["valid_id_1", "valid_id_2", "income_proof", "residence_proof", "proof_of_billing"] };

    function normalizeDocumentStatus(s) {
        const key = String(s || "").trim().toUpperCase().replace(/[\s-]+/g, "_").replace(/^RE_UPLOAD/, "REUPLOAD");
        return DOCUMENT_STATUSES.includes(key) ? key : "NOT_SUBMITTED";
    }

    function readDocumentStore() {
        const store = storage.json(DOCUMENTS_KEY, {});
        return store && typeof store === "object" ? store : {};
    }

    function normalizeDocumentRecord(rec) {
        return Object.assign({}, rec, {
            documents: (rec.documents || []).map(d => {
                const status = normalizeDocumentStatus(d.status || (d.submitted ? "SUBMITTED" : "NOT_SUBMITTED"));
                const view = Object.assign({}, d, { status, submitted: DOCUMENT_SUBMITTED_STATES.includes(status) });
                // Marked "Not required" by Hello Solar (with the reason the customer sees)
                if (d.waived && status !== "ACCEPTED") {
                    Object.assign(view, { optional: true, notRequired: true, note: `Not required — ${d.waived.reason}` });
                }
                return view;
            })
        });
    }

    // Brings a stored record up to the current request list, keeping uploaded files and review decisions
    function migrateDocumentRecord(rec) {
        const byId = {};
        const extras = [];
        (rec.documents || []).forEach(d => {
            const id = LEGACY_DOCUMENT_IDS[d.id] || d.id;
            const next = Object.assign({}, d, { id, legacyId: d.id !== id ? d.id : d.legacyId });
            const prev = byId[id];
            if (!prev) { byId[id] = next; return; }
            // Two older documents became one request: keep the furthest along, the other stays as an extra if it has a file
            const rank = x => DOCUMENT_STATUS_RANK[normalizeDocumentStatus(x.status)] || 0;
            const [keep, other] = rank(next) > rank(prev) ? [next, prev] : [prev, next];
            byId[id] = keep;
            if (other.fileName) extras.push(Object.assign({}, other, { id: other.legacyId || `${id}_extra`, optional: true }));
        });
        const docs = DOCUMENT_REQUESTS.map(def => {
            const prev = byId[def.id];
            delete byId[def.id];
            const kind = def.kind ? { kind: def.kind } : {};
            return prev ? Object.assign({}, prev, { name: def.name, optional: !!def.optional }, kind)
                : Object.assign({ id: def.id, name: def.name, optional: !!def.optional, status: "NOT_SUBMITTED", submitted: false, note: "" }, kind);
        });
        // Documents Hello Solar requested for this customer stay as they are (required)
        Object.values(byId).filter(d => d.requested).forEach(d => docs.push(d));
        // Keep any other extra document that already has a file or a review decision (not counted as required)
        Object.values(byId).filter(d => !d.requested).concat(extras).forEach(d => {
            if (d.fileName || normalizeDocumentStatus(d.status) !== "NOT_SUBMITTED") docs.push(Object.assign({}, d, { optional: true }));
        });
        const changed = JSON.stringify(docs.map(d => [d.id, d.name, !!d.optional, d.kind || ""])) !==
            JSON.stringify((rec.documents || []).map(d => [d.id, d.name, !!d.optional, d.kind || ""]));
        rec.documents = docs;
        return changed;
    }

    const isApplicationActive = app => String(app.systemStatus || "").toUpperCase() === "ACTIVE" || String(app.applicationStatus || "").toUpperCase() === "ACTIVE";

    // Read-only: the stored record for an APP ID, or null
    function documentsFor(appId) {
        const rec = readDocumentStore()[appId];
        return rec && Array.isArray(rec.documents) ? normalizeDocumentRecord(rec) : null;
    }

    // The APP's document record, created with the standard request list the first time any portal opens it
    // (commissioned systems start with the required documents Accepted). Full Payment and Installment.
    function documentRecordFor(appId) {
        const app = getApplication(appId);
        if (!app) return documentsFor(appId);
        const store = readDocumentStore();
        let rec = store[appId];
        let changed = false;
        if (!rec || !Array.isArray(rec.documents)) {
            const done = isApplicationActive(app);
            rec = store[appId] = {
                appId,
                paymentType: isFullPayment(app) ? "full_payment" : "installment",
                updatedAt: nowISO(),
                documents: DOCUMENT_REQUESTS.map(d => {
                    const status = done && !d.optional ? "ACCEPTED" : "NOT_SUBMITTED";
                    return Object.assign({ id: d.id, name: d.name, optional: !!d.optional, status, submitted: status === "ACCEPTED", note: "" }, d.kind ? { kind: d.kind } : {});
                })
            };
            changed = true;
        } else {
            changed = migrateDocumentRecord(rec);
        }
        if (changed) {
            // api mode: the backend creates/migrates document records — keep the computed view in the page cache only
            try { storage.set(DOCUMENTS_KEY, JSON.stringify(store)); } catch (e) { /* storage full — record still returned */ }
        }
        return exemptLaterDocs(app, exemptInstalledSiteDocs(app, normalizeDocumentRecord(rec)));
    }

    // Applications approved (Installment) or paid (Full Payment) before a request existed don't need it
    function isPastApproval(app) {
        if (isFullPayment(app)) {
            return ["Ready for Installation", "Installation", "In Progress", "Completed", "Installation Completed"].includes(app.stage) ||
                ["Verified", "Paid", "Completed", "Verified / Paid"].includes(app.paymentStatus);
        }
        return ["Approved", "Ready for Installation", "Installation", "In Progress", "Completed", "Installation Completed"].includes(app.stage);
    }
    // Only applications created before these document rules (Oct 27, 2026) can be exempt — newer ones must send them all
    const DOCUMENT_RULES_SINCE = "2026-10-27T12:00:00.000Z";
    function exemptLaterDocs(app, rec) {
        if (!app || !isPastApproval(app)) return rec;
        if (app.createdAt && String(app.createdAt) >= DOCUMENT_RULES_SINCE) return rec;
        const later = LATER_DOCUMENT_IDS[isFullPayment(app) ? "full_payment" : "installment"];
        rec.documents = rec.documents.map(d => (later.includes(d.id) && d.status === "NOT_SUBMITTED" && !d.notRequired)
            ? Object.assign({}, d, { optional: true, notRequired: true, note: "Not required — approved before this was added." })
            : d);
        return rec;
    }

    // Can the application move on (financing approval, installer assignment)? Every required document must be
    // sent (and not waiting for a re-upload) and the signed agreement must be Accepted by Hello Solar.
    function applicationDocsComplete(appOrId) {
        const app = typeof appOrId === "string" ? getApplication(appOrId) : appOrId;
        if (!app) return { ok: false, missing: ["Application not found"] };
        const missing = [];
        const ag = agreementFor(app);
        if (!ag || ag.status !== "ACCEPTED") {
            missing.push(`Signed ${ag ? ag.title : "agreement"}${ag && ag.status === "SUBMITTED" ? " (waiting for your review)" : ""}`);
        }
        {
            const rec = documentRecordFor(app.id);
            (rec && rec.documents || []).filter(d => !d.optional && ["NOT_SUBMITTED", "REUPLOAD_REQUIRED"].includes(d.status))
                .forEach(d => missing.push(d.name));
        }
        return { ok: missing.length === 0, missing };
    }

    // Site Photos and the Google Maps link are for checking the site before installation. Once the system is
    // being installed (or is installed) they are not required anymore when they were never sent.
    const SITE_DOC_IDS = ["site_photos", "site_map_link"];
    function isInstallationStarted(app) {
        const inst = String(app.installationStatus || "").toUpperCase();
        return ["Installation", "In Progress", "Completed", "Installation Completed"].includes(app.stage) ||
            inst === "INSTALLATION_IN_PROGRESS" || inst === "COMPLETED";
    }
    function exemptInstalledSiteDocs(app, rec) {
        if (!app || !isInstallationStarted(app)) return rec;
        rec.documents = rec.documents.map(d => (SITE_DOC_IDS.includes(d.id) && d.status === "NOT_SUBMITTED")
            ? Object.assign({}, d, { optional: true, notRequired: true, note: "Not required — the system is already installed." })
            : d);
        return rec;
    }

    // Review verdict on one document (Financer / Super Admin). docRef: document id or exact name.
    function setDocumentStatus(appId, docRef, status, note) {
        documentRecordFor(appId);
        const store = readDocumentStore();
        const rec = store[appId];
        const doc = rec && Array.isArray(rec.documents) ? rec.documents.find(d => d.id === docRef || d.name === docRef) : null;
        if (!doc) return null;
        doc.status = normalizeDocumentStatus(status);
        doc.submitted = DOCUMENT_SUBMITTED_STATES.includes(doc.status);
        if (note !== undefined) doc.note = note;
        doc.reviewedAt = nowISO();
        rec.updatedAt = doc.reviewedAt;
        storage.set(DOCUMENTS_KEY, JSON.stringify(store));
        sendCommand({ name: "document.review", payload: { appId, docId: doc.id, status: doc.status, note: doc.note || "" } });
        return Object.assign({}, doc);
    }

    // Hello Solar asks the customer for one more document (Super Admin › Details › Documents › Request Document).
    // It becomes a required line on the customer's checklist and the customer is notified.
    function requestDocument(appId, payload, actor) {
        const name = String(payload && payload.name || "").trim();
        const note = String(payload && payload.note || "").trim();
        if (name.length < 3) return { ok: false, error: "Write the name of the document you need." };
        const app = getApplication(appId);
        if (!app) return { ok: false, error: "Application not found." };
        documentRecordFor(appId);
        const store = readDocumentStore();
        const rec = store[appId];
        if (!rec) return { ok: false, error: "Document record not found." };
        if (rec.documents.some(d => d.requested && d.name.toLowerCase() === name.toLowerCase() && d.status !== "ACCEPTED")) {
            return { ok: false, error: `"${name}" is already requested.` };
        }
        const now = nowISO();
        const doc = { id: `req_${Date.now().toString(36)}`, name, requested: true, requestNote: note, requestedBy: actor || "Hello Solar", requestedAt: now,
            optional: false, status: "NOT_SUBMITTED", submitted: false, note: "" };
        rec.documents.push(doc);
        rec.updatedAt = now;
        storage.set(DOCUMENTS_KEY, JSON.stringify(store));
        update(data => { logActivity(data, { role: "Admin", actorId: "ADMIN-01", user: actor || "ADMIN", record: appId, recordType: "Document",
            action: `${actor || "ADMIN"} requested "${name}" from ${app.customer} for ${appId}${note ? ` (${note})` : ""}`, details: { appId, docId: doc.id, name, note } }); return {}; },
            { name: "document.request", payload: { appId, docId: doc.id, name, note } });
        if (app.customerId) notify({ recipientRole: "customer", recipientId: app.customerId, eventType: "DOCUMENT_REQUESTED", recordId: appId,
            title: "Hello Solar needs a document", message: `Please upload: ${name}${note ? ` — ${note}` : ""}.`, targetUrl: "documents.html", actionLabel: "Upload" });
        return { ok: true, document: Object.assign({}, doc) };
    }

    // Hello Solar marks a document "Not required" (reason shown to the customer), or requires it again
    function setDocumentNotRequired(appId, docId, reason, actor) {
        const app = getApplication(appId);
        documentRecordFor(appId);
        const store = readDocumentStore();
        const rec = store[appId];
        const doc = rec && Array.isArray(rec.documents) ? rec.documents.find(d => d.id === docId) : null;
        if (!app || !doc) return { ok: false, error: "Document not found." };
        const text = reason === null ? null : String(reason || "").trim();
        if (text !== null && text.length < 3) return { ok: false, error: "Write a short reason (the customer will see it)." };
        if (text !== null && normalizeDocumentStatus(doc.status) === "ACCEPTED") return { ok: false, error: "This document is already accepted." };
        const now = nowISO();
        if (text === null) delete doc.waived;
        else doc.waived = { reason: text, by: actor || "Hello Solar", at: now };
        rec.updatedAt = now;
        storage.set(DOCUMENTS_KEY, JSON.stringify(store));
        update(data => { logActivity(data, { role: "Admin", actorId: "ADMIN-01", user: actor || "ADMIN", record: appId, recordType: "Document",
            action: text === null ? `${actor || "ADMIN"} required "${doc.name}" again for ${appId}` : `${actor || "ADMIN"} marked "${doc.name}" as not required for ${appId}: ${text}`,
            details: { appId, docId, reason: text } }); return {}; },
            { name: "document.waive", payload: { appId, docId, reason: text } });
        return { ok: true };
    }

    // Customer upload of one required document. Local mode keeps the file (data URL) in the document store;
    // api mode sends the file to the backend (multipart) and keeps only metadata in the page cache.
    function uploadDocument(appId, docId, file, fileData) {
        documentRecordFor(appId);
        const store = readDocumentStore();
        const rec = store[appId];
        const doc = rec && Array.isArray(rec.documents) ? rec.documents.find(d => d.id === docId) : null;
        if (!doc) return { ok: false, error: "Document request not found." };
        const now = nowISO();
        Object.assign(doc, {
            fileName: file && file.name || doc.fileName || "",
            fileType: file && file.type || "",
            fileSize: file && file.size || 0,
            fileData: IS_API ? null : (fileData || null),
            uploadedAt: now,
            status: "SUBMITTED",
            submitted: true,
            note: ""
        });
        rec.updatedAt = now;
        storage.set(DOCUMENTS_KEY, JSON.stringify(store)); // throws on quota in local mode — callers handle
        if (IS_API && API) {
            const form = new window.FormData();
            if (file) form.append("file", file, file.name);
            form.append("appId", appId);
            form.append("docId", docId);
            API.command("document.upload", { appId, docId }, { formData: form });
        }
        return { ok: true, document: Object.assign({}, doc) };
    }

    // Customer link answer for a "link" document (Google Maps link of the house / site)
    function saveDocumentLink(appId, docId, url) {
        const link = String(url || "").trim();
        if (!/^https?:\/\/\S+$/i.test(link)) return { ok: false, error: "Please paste a valid link (starting with https://)." };
        documentRecordFor(appId);
        const store = readDocumentStore();
        const rec = store[appId];
        const doc = rec && Array.isArray(rec.documents) ? rec.documents.find(d => d.id === docId) : null;
        if (!doc) return { ok: false, error: "Document request not found." };
        const now = nowISO();
        Object.assign(doc, { link, fileName: link, fileType: "link", fileSize: 0, fileData: null, uploadedAt: now, status: "SUBMITTED", submitted: true, note: "" });
        rec.updatedAt = now;
        storage.set(DOCUMENTS_KEY, JSON.stringify(store));
        sendCommand({ name: "document.link", payload: { appId, docId, link } });
        return { ok: true, document: Object.assign({}, doc) };
    }

    function writeDocumentStore(store) {
        storage.set(DOCUMENTS_KEY, JSON.stringify(store || {}));
    }

    // ------------------------------------------------------------------
    // Installation progress (one record per APP ID; Installer portal and Direct Engineer)
    // ------------------------------------------------------------------
    function installationProgressStore() {
        const store = storage.json(INSTALLATION_PROGRESS_KEY, {});
        return store && typeof store === "object" ? store : {};
    }
    function installationProgressFor(appId) {
        return installationProgressStore()[appId] || null;
    }
    function saveInstallationProgress(record, cmd) {
        if (!record || !record.appId) return { ok: false, error: "Missing APP ID." };
        const store = installationProgressStore();
        store[record.appId] = record;
        storage.set(INSTALLATION_PROGRESS_KEY, JSON.stringify(store));
        sendCommand(cmd === undefined ? { name: "installation.progress", payload: { appId: record.appId, progress: record } } : cmd);
        return { ok: true, record };
    }

    // Counts on the shared record: required documents, how many have a file received, and how many are accepted
    function documentSummary(rec) {
        const docs = rec && Array.isArray(rec.documents) ? rec.documents : [];
        const required = docs.filter(d => !d.optional);
        return {
            required: required.length,
            submitted: required.filter(d => DOCUMENT_SUBMITTED_STATES.includes(normalizeDocumentStatus(d.status))).length,
            accepted: required.filter(d => normalizeDocumentStatus(d.status) === "ACCEPTED").length,
            reuploadRequired: docs.filter(d => normalizeDocumentStatus(d.status) === "REUPLOAD_REQUIRED").length
        };
    }

    // ------------------------------------------------------------------
    // Notifications (single shared store; recipients by role and, when known, account ID)
    // ------------------------------------------------------------------
    function notify(notification) {
        const record = Object.assign({
            id: `notif-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            sourceEventId: `evt-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            timestamp: nowISO(),
            readAt: null,
            recipientId: "*"
        }, notification);
        // api mode: the backend creates notifications as a side effect of each command; this only updates the page
        try {
            const list = storage.json(NOTIFICATIONS_KEY, []);
            const next = Array.isArray(list) ? list : [];
            next.unshift(record);
            storage.set(NOTIFICATIONS_KEY, JSON.stringify(next.slice(0, 300)));
            if (typeof window.BroadcastChannel !== "undefined") {
                const channel = new window.BroadcastChannel(NOTIFICATION_CHANNEL);
                channel.postMessage({ type: "NEW_NOTIFICATION", payload: { notification: record } });
                channel.close();
            }
        } catch (e) { /* notifications are best effort */ }
        return record;
    }

    // Notification store access for the portal notification centers
    function readNotifications() {
        const list = storage.json(NOTIFICATIONS_KEY, null);
        return Array.isArray(list) ? list : null;
    }
    // Saves the list; cmd describes the change for the backend (e.g. mark read). Seeding passes no command.
    function writeNotifications(list, cmd) {
        storage.set(NOTIFICATIONS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
        sendCommand(cmd);
    }

    // Due-date reminders to customers (installment accounts): 7 days before, 1 day before and on the due date
    // of the next unpaid installment. Each reminder has a fixed id, so it is sent once even though every portal
    // load checks again (this is how the frontend simulates the daily reminder job).
    function sendDueReminders(asOf) {
        if (IS_API) return 0; // api mode: the backend sends reminders
        const data = read();
        if (!data) return 0;
        const d = asOf ? new Date(asOf) : new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const sentIds = new Set((readNotifications() || []).map(n => n.id));
        const peso = n => "₱" + Math.round(Number(n) || 0).toLocaleString("en-PH");
        const longDate = iso => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
        let sent = 0;
        (data.applications || []).forEach(app => {
            if (!app || !app.customerId || isFullPayment(app)) return;
            const schedule = (data.paymentSchedules && data.paymentSchedules[app.id]) || paymentScheduleFor(app.id);
            const next = ((schedule && schedule.installments) || [])
                .filter(i => i.status !== "Paid" && String(i.dueDate || "") >= today)
                .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0];
            if (!next) return;
            const days = Math.round((new Date(next.dueDate + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
            const kind = days === 0 ? "due" : days === 1 ? "1d" : days <= 7 ? "7d" : null;
            if (!kind) return;
            const id = `due-reminder-${app.id}-${next.dueDate}-${kind}`;
            if (sentIds.has(id)) return;
            const title = kind === "due" ? "Payment Due Today" : kind === "1d" ? "Payment Due Tomorrow" : "Upcoming Payment Due";
            const when = kind === "due" ? "today" : kind === "1d" ? "tomorrow" : `in ${days} days`;
            notify({
                id,
                sourceEventId: id,
                recipientRole: "customer",
                recipientId: app.customerId,
                eventType: "payment_due_reminder",
                recordId: app.id,
                appId: app.id,
                packageId: app.id,
                title,
                message: `Your installment #${next.no} of ${peso(next.amount)} for ${app.id} is due ${when} (${longDate(next.dueDate)}).`,
                targetUrl: "payments.html",
                actionLabel: "View Payment"
            });
            sentIds.add(id);
            sent += 1;
        });
        return sent;
    }

    // ------------------------------------------------------------------
    // Document progress — the same count in every portal: each required document (not "Not required") plus the
    // signed agreement. items: agreement first, then the documents in order (Not required ones included, flagged).
    // ------------------------------------------------------------------
    function documentProgress(appOrId) {
        const app = typeof appOrId === "string" ? getApplication(appOrId) : appOrId;
        if (!app) return { total: 0, submitted: 0, accepted: 0, items: [] };
        const ag = agreementFor(app);
        const rec = documentRecordFor(app.id);
        const items = [{
            id: "agreement", name: `Signed ${ag.title}`, isAgreement: true, required: true, notRequired: false,
            status: ag.status, submitted: ["SUBMITTED", "ACCEPTED"].includes(ag.status), note: ag.note || "",
            fileName: ag.fileName || "", uploadedAt: ag.uploadedAt || null
        }].concat((rec && rec.documents || [])
            .filter(d => !(d.optional && !d.notRequired && d.status === "NOT_SUBMITTED"))
            .map(d => Object.assign({}, d, { required: !d.optional, notRequired: !!d.notRequired })));
        const counted = items.filter(i => i.required);
        return {
            total: counted.length,
            submitted: counted.filter(i => i.submitted).length,
            accepted: counted.filter(i => i.status === "ACCEPTED").length,
            items
        };
    }

    // ------------------------------------------------------------------
    // Sample data (local demo): sample applications already past financing approval / payment have their
    // documents and signed agreement on file (sample files), so the demo follows the same documents rule as real
    // applications. Runs once per browser; applications in review keep their missing documents.
    // ------------------------------------------------------------------
    const SAMPLE_DOCS_FLAG = "sampleDocumentsV1";
    function sampleFileData(title, customer) {
        const esc = v => String(v || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">` +
            `<rect width="640" height="400" fill="#FFFBEB"/><rect x="14" y="14" width="612" height="372" rx="18" fill="none" stroke="#F59E0B" stroke-width="3" stroke-dasharray="12 9"/>` +
            `<text x="320" y="170" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="#1C1917" text-anchor="middle">${esc(title)}</text>` +
            `<text x="320" y="214" font-family="Arial, sans-serif" font-size="18" fill="#57534E" text-anchor="middle">${esc(customer)}</text>` +
            `<text x="320" y="262" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#B45309" text-anchor="middle">SAMPLE DOCUMENT · HELLO SOLAR DEMO</text></svg>`;
        return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    }
    function seedSampleDocuments() {
        if (IS_API || CONFIG.demoData === false || window.HS_SKIP_SAMPLE_DOCS) return false;
        const data = read();
        if (!data || data[SAMPLE_DOCS_FLAG] || !Array.isArray(data.applications)) return false;
        const sampleApps = data.applications.filter(a => !a.createdAt && isPastApproval(a));
        const docStore = readDocumentStore();
        const agreementFiles = storage.json(AGREEMENT_FILES_KEY, {}) || {};
        const when = "2026-09-01T09:00:00.000Z";
        sampleApps.forEach(app => {
            documentRecordFor(app.id); // creates / migrates the stored record
        });
        const store = readDocumentStore();
        sampleApps.forEach(app => {
            const rec = store[app.id];
            if (!rec || !Array.isArray(rec.documents)) return;
            rec.documents.forEach(d => {
                if (d.optional || d.waived || ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED"].includes(normalizeDocumentStatus(d.status))) return;
                const title = String(d.name || "").split(" — ")[0];
                if (d.kind === "link") {
                    Object.assign(d, { link: `https://maps.google.com/?q=${encodeURIComponent(app.location || "Philippines")}` });
                } else {
                    Object.assign(d, { fileName: `sample-${d.id}.svg`, fileType: "image/svg+xml", fileSize: 1200, fileData: sampleFileData(title, app.customer) });
                }
                Object.assign(d, { status: "ACCEPTED", submitted: true, uploadedAt: when, reviewedAt: when, note: "" });
            });
            rec.updatedAt = nowISO();
            if (!agreementFiles[app.id]) {
                const title = isFullPayment(app) ? "Full Payment Agreement" : "Installment Agreement";
                agreementFiles[app.id] = { fileName: "signed-agreement-sample.svg", fileType: "image/svg+xml", fileData: sampleFileData(`Signed ${title}`, app.customer), uploadedAt: when };
            }
        });
        try {
            storage.set(DOCUMENTS_KEY, JSON.stringify(store));
            storage.set(AGREEMENT_FILES_KEY, JSON.stringify(agreementFiles));
        } catch (e) { return false; }
        update(d => {
            (d.applications || []).forEach(app => {
                if (app.createdAt || !isPastApproval(app)) return;
                const ag = agreementFor(app);
                if (ag.status !== "ACCEPTED") {
                    app.agreement = { type: ag.type, title: ag.title, fileName: "signed-agreement-sample.svg", fileType: "image/svg+xml",
                        fileSize: 1200, uploadedAt: when, status: "ACCEPTED", note: "", reviewedAt: when };
                }
            });
            d[SAMPLE_DOCS_FLAG] = true;
            return {};
        });
        // The store on this page loaded its copy before this ran: give it the updated records so its next save
        // does not write the old ones back
        const db = window.HELLO_SOLAR_DB;
        if (db && typeof db.load === "function") { try { db.data = db.load(); } catch (e) { /* keeps its copy */ } }
        return true;
    }

    window.HSShared = {
        CONFIG,
        IS_API,
        DATA_KEY,
        DOCUMENTS_KEY,
        NOTIFICATIONS_KEY,
        INSTALLATION_PROGRESS_KEY,
        NOTIFICATION_CHANNEL,
        ROLES,
        read,
        update,
        persist,
        sendCommand,
        logActivity,
        accountsFor,
        findAccount,
        getAccount,
        authenticate,
        registerPendingAccount,
        session,
        getApplication,
        findApplicationByHsId,
        applicationsForCustomer,
        applicationsForFinancer,
        isFullPayment,
        isDirect,
        isClearedForInstallation,
        isVisibleToInstaller,
        claimApplicationByHsId,
        submitReceipt,
        agreementFor,
        applicationDocsComplete,
        agreementFileFor,
        uploadSignedAgreement,
        reviewAgreement,
        AGREEMENT_TEMPLATES,
        paymentScheduleFor,
        createSupportTicket,
        supportTicketsFor,
        documentsFor,
        documentRecordFor,
        setDocumentStatus,
        requestDocument,
        setDocumentNotRequired,
        uploadDocument,
        saveDocumentLink,
        writeDocumentStore,
        readDocumentStore,
        installationProgressFor,
        saveInstallationProgress,
        readNotifications,
        writeNotifications,
        documentSummary,
        normalizeDocumentStatus,
        migrateDocumentRecord,
        DOCUMENT_REQUESTS,
        DOCUMENT_SUBMITTED_STATES,
        notify,
        siteVisitsFor,
        completeSiteVisit,
        downPaymentFor,
        downPaymentRefundState,
        reimbursementsFor,
        requestReimbursement,
        sendDueReminders,
        documentProgress,
        seedSampleDocuments
    };
    try { seedSampleDocuments(); } catch (e) { /* sample documents are a demo convenience only */ }
})(typeof window !== "undefined" ? window : this);
