/**
 * Hello Solar Customer Portal - Documents (every system: the signed agreement + the required documents).
 * The page groups them by what the customer has to do: To do · Waiting for Hello Solar · Done · Only if asked.
 *
 * Shared document store keyed by APP ID (localStorage "hello_solar_shared_documents").
 * The Financer portal reads/updates the same records, so it reviews the exact files uploaded here.
 *
 * Record shape:
 *   { appId, paymentType, updatedAt, documents: [
 *       { id, name, status, note, submitted, fileName, fileType, fileSize, fileData, uploadedAt, reviewedAt }
 *   ] }
 * status: NOT_SUBMITTED | SUBMITTED | UNDER_REVIEW | ACCEPTED | REUPLOAD_REQUIRED
 */
(function () {
    const STORE_KEY = "hello_solar_shared_documents";
    const MAX_FILE_BYTES = 2 * 1024 * 1024;
    const ACCEPT_TYPES = ["application/pdf", "image/jpeg", "image/png"];

    const STATUS = {
        NOT_SUBMITTED: { label: "Not Submitted", cls: "not-submitted" },
        SUBMITTED: { label: "Submitted", cls: "submitted" },
        UNDER_REVIEW: { label: "Under Review", cls: "under-review" },
        ACCEPTED: { label: "Accepted", cls: "accepted" },
        REUPLOAD_REQUIRED: { label: "Re-upload Required", cls: "reupload" }
    };
    const UPLOADABLE = ["NOT_SUBMITTED", "REUPLOAD_REQUIRED"];
    // Short display names (by document id). The shared record keeps its full names, which the Financer and
    // Super Admin match on.
    const DISPLAY_NAME = {
        valid_id_1: "Valid ID #1 (front & back)",
        valid_id_2: "Valid ID #2 (front & back)",
        income_proof: "Payslips (last 3 months) or Bank Statement",
        residence_proof: "Proof of Home Ownership or Contract of Lease",
        proof_of_billing: "Proof of Billing",
        other_requested: "Other Document",
        site_photos: "Site Photos (Roof & Neighborhood)",
        site_map_link: "Google Maps Link of Your House",
        gov_id_back: "Government ID Back (older upload)",
        proof_of_income: "Proof of Income (older upload)",
        bank_statement: "Bank Statement (older upload)"
    };
    const displayName = doc => DISPLAY_NAME[doc.id] || doc.name;
    // The document request list, status rules and record creation live in the shared layer
    // (HSShared.documentRecordFor) so the Financer review and Super Admin use the exact same record.

    function readStore() {
        if (window.HSShared && window.HSShared.readDocumentStore) return window.HSShared.readDocumentStore();
        try {
            const raw = localStorage.getItem(STORE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            return parsed && typeof parsed === "object" ? parsed : {};
        } catch (e) {
            console.warn("Error reading shared documents:", e);
            return {};
        }
    }

    function writeStore(store) {
        if (window.HSShared && window.HSShared.writeDocumentStore) return window.HSShared.writeDocumentStore(store);
        localStorage.setItem(STORE_KEY, JSON.stringify(store)); // throws on quota — callers handle
    }

    function isInstallment(pkg) {
        return !!pkg && String(pkg.paymentType || "").toLowerCase() !== "full_payment";
    }

    // Public API over the shared APP document record (same record the Financer portal and Super Admin use)
    const api = {
        STORE_KEY,
        STATUS,
        getRecord(appId) {
            return window.HSShared ? window.HSShared.documentsFor(appId) : null;
        },
        ensureRecord(pkg) {
            if (!pkg || !pkg.appId || !window.HSShared) return null;
            return window.HSShared.documentRecordFor(pkg.appId);
        },
        // Review action (Financer / Super Admin): UNDER_REVIEW / ACCEPTED / REUPLOAD_REQUIRED with an optional note
        setStatus(appId, docId, status, note) {
            const doc = window.HSShared ? window.HSShared.setDocumentStatus(appId, docId, status, note) : null;
            if (doc) notify(appId);
            return doc;
        },
        uploadDocument(appId, docId, file, fileData) {
            // Shared layer: local mode stores the file in the document record; api mode uploads it to the backend
            if (window.HSShared && window.HSShared.uploadDocument) {
                let res;
                try {
                    res = window.HSShared.uploadDocument(appId, docId, file, fileData);
                } catch (e) {
                    throw new Error("Storage is full. Please upload a smaller file.");
                }
                if (!res.ok) throw new Error(res.error || "Document request not found.");
                notify(appId);
                return res.document;
            }
            const store = readStore();
            const doc = store[appId]?.documents?.find(d => d.id === docId);
            if (!doc) throw new Error("Document request not found.");
            const backup = JSON.stringify(doc);
            Object.assign(doc, {
                status: "SUBMITTED",
                submitted: true,
                note: "",
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size,
                fileData: fileData,
                uploadedAt: new Date().toISOString()
            });
            store[appId].updatedAt = doc.uploadedAt;
            try {
                writeStore(store);
            } catch (e) {
                Object.assign(doc, JSON.parse(backup));
                throw new Error("Storage is full. Please upload a smaller file.");
            }
            notify(appId);
            return doc;
        }
    };
    window.HelloSolarSharedDocs = api;

    function notify(appId) {
        try { window.dispatchEvent(new CustomEvent("hellosolar:documents-updated", { detail: { appId } })); } catch (_) {}
    }

    // ---------------------------------------------------------------- UI
    let currentPkg = null;

    function escapeHtml(s) {
        return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function formatSize(bytes) {
        if (!bytes) return "";
        return bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(bytes / 1024)) + " KB";
    }

    function formatDate(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
    }

    // Short names for the checklist rows
    const ROW_NAME = {
        valid_id_1: "Valid ID #1",
        valid_id_2: "Valid ID #2",
        income_proof: "Payslips or Bank Statement",
        residence_proof: "Proof of Home Ownership or Lease",
        proof_of_billing: "Proof of Billing",
        site_photos: "Site Photos",
        site_map_link: "Google Maps Link of Your House",
        other_requested: "Other Document"
    };
    // What to upload (shown as the button's tooltip)
    const DOC_HELP = {
        valid_id_1: "Front and back in one PDF or photo. The ID must show your signature.",
        valid_id_2: "A different valid ID. Front and back in one PDF or photo, with your signature.",
        income_proof: "Payslips for the last 3 months, or your latest bank statement.",
        residence_proof: "Land title / tax declaration, or a 5–10 year Contract of Lease if you rent.",
        proof_of_billing: "Your latest electric bill.",
        site_photos: "Clear photos of your roof and the area around your house.",
        site_map_link: "Open Google Maps, find your house, tap Share and paste the link.",
        other_requested: "Upload only if Hello Solar asks for it."
    };
    const rowName = doc => ROW_NAME[doc.id] || displayName(doc);
    // 0 = to do (re-upload first), 1 = checking, 2 = accepted
    const stateOf = status => status === "REUPLOAD_REQUIRED" ? "redo"
        : (status === "ACCEPTED" ? "done" : (status === "SUBMITTED" || status === "UNDER_REVIEW" ? "wait" : "todo"));
    const ORDER = { redo: 0, todo: 0, wait: 1, done: 2, skip: 3 };
    let editingLink = null;

    function rowHtml(r) {
        const icon = { todo: "", redo: "!", wait: "⏳", done: "✓", skip: "–" }[r.state];
        let right;
        if (r.state === "skip") right = `<span class="docs-row-status">Not needed</span>`;
        else if (r.state === "done") right = `${r.view || ""}<span class="docs-row-status">Accepted</span>`;
        else if (r.state === "wait") right = `${r.view || ""}<span class="docs-row-status is-wait">Checking</span>`;
        else right = r.actions;
        return `
            <li class="docs-row is-${r.state}">
                <span class="docs-row-icon is-${r.state}" aria-hidden="true">${icon}</span>
                <div class="docs-row-name">${escapeHtml(r.name)}${r.sub ? `<small class="${r.state === "redo" ? "is-red" : ""}">${r.sub}</small>` : ""}</div>
                <div class="docs-row-right">${right}</div>
            </li>`;
    }

    function render(pkg) {
        currentPkg = pkg || null;
        const card = document.getElementById("docsCard");
        if (!card) return;
        if (!pkg || !pkg.appId) { card.hidden = true; return; }

        const rec = api.ensureRecord(pkg);
        const allDocs = rec?.documents || [];
        const docs = allDocs.filter(d => !d.notRequired);
        const agreement = window.HSShared && window.HSShared.agreementFor ? window.HSShared.agreementFor(pkg.appId) : null;
        const rows = [];

        if (agreement) {
            const state = stateOf(agreement.status);
            const hasFile = !!(agreement.uploadedAt && window.HSShared.agreementFileFor && (window.HSShared.agreementFileFor(pkg.appId) || {}).fileData);
            const file = encodeURI(agreement.file || "");
            rows.push({
                key: -1, state, name: "Signed Agreement",
                sub: state === "redo" ? `Please upload again${agreement.note ? ` — ${escapeHtml(agreement.note)}` : "."}`
                    : (state === "todo" ? `Download the ${escapeHtml(agreement.title)}, print and sign it, then upload it.` : ""),
                actions: `<a class="docs-textlink" href="${file}" download="${escapeHtml(`${agreement.title} - ${pkg.appId}.pdf`)}">Download form</a>
                    <button type="button" class="docs-btn" data-upload-agreement>Upload</button>`,
                view: hasFile ? `<button type="button" class="docs-textlink is-muted" data-view-agreement>View</button>` : ""
            });
        }
        docs.forEach((doc, i) => {
            const state = stateOf(doc.status);
            if (doc.optional && state === "todo") return; // "Other Document": footer link until it is used
            const isLink = doc.kind === "link";
            let actions;
            if (isLink && editingLink === doc.id) {
                actions = `<input type="url" class="req-doc-link-input" data-link-input="${escapeHtml(doc.id)}" placeholder="Paste Google Maps link"
                        aria-label="Google Maps link of your house">
                    <button type="button" class="docs-btn" data-save-link="${escapeHtml(doc.id)}">Save</button>`;
            } else {
                actions = `<button type="button" class="docs-btn" ${isLink ? `data-edit-link="${escapeHtml(doc.id)}"` : `data-upload-doc="${escapeHtml(doc.id)}"`}
                    title="${escapeHtml(DOC_HELP[doc.id] || "")}">${isLink ? "Add Link" : "Upload"}</button>`;
            }
            const view = doc.kind === "link" && doc.link
                ? `<a class="docs-textlink is-muted" href="${escapeHtml(doc.link)}" target="_blank" rel="noopener">Open</a>`
                : (doc.fileData ? `<button type="button" class="docs-textlink is-muted" data-view-doc="${escapeHtml(doc.id)}">View</button>` : "");
            rows.push({
                key: i, state, name: rowName(doc), actions, view,
                sub: state === "redo" ? `Please upload again${doc.note ? ` — ${escapeHtml(doc.note)}` : "."}`
                    : (doc.requested && state === "todo" ? `Requested by Hello Solar${doc.requestNote ? ` — ${escapeHtml(doc.requestNote)}` : ""}` : "")
            });
        });
        // Documents Hello Solar does not need (with the reason), greyed out at the bottom
        allDocs.forEach((doc, i) => {
            if (!doc.notRequired || doc.id === "other_requested") return;
            rows.push({ key: 100 + i, state: "skip", name: rowName(doc), sub: escapeHtml(String(doc.note || "").replace(/^Not required — /, "").replace(/^./, c => c.toUpperCase())) });
        });
        rows.sort((a, b) => (ORDER[a.state] - ORDER[b.state]) || (a.key - b.key));

        const required = docs.filter(d => !d.optional);
        const total = required.length + (agreement ? 1 : 0);
        const done = required.filter(d => d.status === "ACCEPTED").length + (agreement && agreement.status === "ACCEPTED" ? 1 : 0);
        const countEl = document.getElementById("docsCount");
        if (countEl) countEl.textContent = done === total && total ? "All done 🎉" : `${done} of ${total} done`;
        const bar = document.getElementById("docsBar");
        if (bar) bar.style.width = `${total ? Math.round(done / total * 100) : 0}%`;
        const list = document.getElementById("docsRows");
        if (list) list.innerHTML = rows.map(rowHtml).join("");
        const other = docs.find(d => d.id === "other_requested");
        const otherWrap = document.getElementById("docsOtherWrap");
        if (otherWrap) otherWrap.hidden = !(other && stateOf(other.status) === "todo");
        card.hidden = false;
    }

    function showMessage(text, type) {
        const el = document.getElementById("requiredDocsMessage");
        if (!el) return;
        el.textContent = text;
        el.dataset.type = type || "info";
        el.hidden = !text;
    }

    let pendingDocId = null;

    document.addEventListener("click", (e) => {
        if (e.target.closest("[data-upload-agreement]")) { if (window.openAgreementUpload) window.openAgreementUpload(); return; }
        if (e.target.closest("[data-view-agreement]") && currentPkg) { if (window.openStoredAgreement) window.openStoredAgreement(currentPkg.appId); return; }
        const editLink = e.target.closest("[data-edit-link]");
        if (editLink && currentPkg) {
            editingLink = editLink.dataset.editLink;
            render(currentPkg);
            const input = document.querySelector(`[data-link-input="${editingLink}"]`);
            if (input) input.focus();
            return;
        }
        const saveLinkBtn = e.target.closest("[data-save-link]");
        if (saveLinkBtn && currentPkg && window.HSShared?.saveDocumentLink) {
            const docId = saveLinkBtn.dataset.saveLink;
            const input = document.querySelector(`[data-link-input="${docId}"]`);
            const res = window.HSShared.saveDocumentLink(currentPkg.appId, docId, input ? input.value : "");
            if (!res.ok) { showMessage(res.error, "error"); return; }
            editingLink = null;
            notify(currentPkg.appId);
            showMessage("Google Maps link saved. Hello Solar will check it.", "success");
            render(currentPkg);
            return;
        }
        const uploadBtn = e.target.closest("[data-upload-doc]");
        if (uploadBtn) {
            pendingDocId = uploadBtn.dataset.uploadDoc;
            const input = document.getElementById("requiredDocsFileInput");
            if (input) { input.value = ""; input.click(); }
            return;
        }
        const viewLink = e.target.closest("[data-view-doc]");
        if (viewLink && currentPkg) {
            e.preventDefault();
            const doc = api.getRecord(currentPkg.appId)?.documents.find(d => d.id === viewLink.dataset.viewDoc);
            if (doc?.fileData) {
                const win = window.open();
                if (win) {
                    const isPdf = doc.fileType === "application/pdf";
                    win.document.title = doc.fileName;
                    win.document.body.style.margin = "0";
                    win.document.body.innerHTML = isPdf
                        ? `<iframe src="${doc.fileData}" style="border:0;width:100vw;height:100vh"></iframe>`
                        : `<img src="${doc.fileData}" alt="" style="max-width:100%">`;
                }
            }
        }
    });

    document.addEventListener("change", (e) => {
        if (e.target.id !== "requiredDocsFileInput") return;
        const file = e.target.files && e.target.files[0];
        if (!file || !pendingDocId || !currentPkg) return;
        if (!ACCEPT_TYPES.includes(file.type)) {
            showMessage("Please upload a PDF, JPG, or PNG file.", "error");
            return;
        }
        if (file.size > MAX_FILE_BYTES) {
            showMessage("File is too large. Maximum size is 2 MB.", "error");
            return;
        }
        const docId = pendingDocId;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const doc = api.uploadDocument(currentPkg.appId, docId, file, reader.result);
                showMessage(`${rowName(doc)} uploaded. Hello Solar will check it.`, "success");
            } catch (err) {
                showMessage(err.message || "Upload failed. Please try again.", "error");
            }
            render(currentPkg);
        };
        reader.onerror = () => showMessage("Could not read the file. Please try again.", "error");
        reader.readAsDataURL(file);
    });

    // Re-render when the Financer updates statuses (other tab) or this tab changes data
    window.addEventListener("storage", (e) => {
        if (e.key === STORE_KEY && currentPkg) render(currentPkg);
    });
    window.addEventListener("hellosolar:documents-updated", () => { if (currentPkg) render(currentPkg); });

    window.renderRequiredDocuments = function (pkg) {
        if (!pkg || !currentPkg || pkg.appId !== currentPkg.appId) { showMessage("", "info"); editingLink = null; }
        render(pkg);
    };
    window.showDocumentsMessage = showMessage;
})();
