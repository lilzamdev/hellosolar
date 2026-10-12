/**
 * Customer portal — Down Payment status and Reimbursement requests (handled by Super Admin → Accounting).
 * Policy: the down payment is refundable when the client proceeds with the installation,
 * and non-refundable when they decide not to proceed.
 */
(function () {
    "use strict";
    const S = window.HSShared;
    const card = document.getElementById("downPaymentCard");
    const modal = document.getElementById("reimbursementModal");
    if (!S || !card || !modal) return;

    const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const peso = n => "₱" + Number(n || 0).toLocaleString("en-PH");
    const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }); };
    const PILL = { Verified: "ok", "Pending Verification": "warn", "Not Submitted": "muted", Pending: "warn", Approved: "ok", Declined: "bad" };
    let current = null; // { customerId, appId }

    function customerId() {
        const c = window.HelloSolar && window.HelloSolar.getCustomer ? window.HelloSolar.getCustomer() : null;
        if (c && c.accountId) return c.accountId;
        const s = S.session.get("customer");
        return s ? s.accountId : null;
    }

    function render(pkg) {
        const cid = customerId();
        const appId = pkg && pkg.appId;
        const data = S.read();
        const app = data && appId ? (data.applications || []).find(a => a.id === appId) : null;
        const dp = S.downPaymentFor(app);
        current = cid && app ? { customerId: cid, appId } : null;
        if (!current || !dp) {
            card.hidden = true;
            return;
        }
        card.hidden = false;
        const requests = S.reimbursementsFor(cid, data).filter(r => r.appId === appId);
        const statusLabel = dp.refunded ? "Refunded" : (dp.status === "Verified" ? "Received" : dp.status);
        const statusCls = dp.refunded ? "muted" : PILL[dp.status] || "muted";
        document.getElementById("dpAmount").textContent = peso(dp.amount);
        document.getElementById("dpStatus").innerHTML = `<span class="dp-pill ${statusCls}">${esc(statusLabel)}</span>`;
        document.getElementById("dpRefundInfo").textContent = dp.refunded
            ? `${peso(dp.refund.amount)} refunded${dp.refund.refundedAt ? ` on ${fmtDate(dp.refund.refundedAt)}` : ""}`
            : "—";
        const list = document.getElementById("dpRequests");
        list.innerHTML = requests.map(r => `
            <li>
                <div><strong>${esc(r.id)}</strong> · ${esc(r.type)}<small>${esc(fmtDate(r.requestedAt))}${r.resolutionNote ? ` · ${esc(r.resolutionNote)}` : ""}</small></div>
                <div style="text-align:right;"><strong>${peso(r.amount)}</strong><div><span class="dp-pill ${PILL[r.status] || "muted"}">${esc(r.status)}</span></div></div>
            </li>`).join("");
        list.hidden = !requests.length;
        const btn = document.getElementById("openReimbursementBtn");
        btn.disabled = dp.refunded || requests.some(r => r.status === "Pending");
        btn.textContent = requests.some(r => r.status === "Pending") ? "Request Under Review" : "Request Reimbursement";
    }

    function readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("read"));
            reader.readAsDataURL(file);
        });
    }

    const err = msg => { const el = document.getElementById("rmError"); el.textContent = msg || ""; el.hidden = !msg; };

    document.getElementById("openReimbursementBtn").addEventListener("click", () => {
        if (!current) return;
        const data = S.read();
        const app = (data.applications || []).find(a => a.id === current.appId);
        const dp = S.downPaymentFor(app);
        document.getElementById("rmForm").reset();
        document.getElementById("rmAmount").value = dp ? dp.amount : "";
        document.getElementById("rmAppId").textContent = current.appId;
        err("");
        modal.showModal();
    });
    document.getElementById("rmClose").addEventListener("click", () => modal.close());
    document.getElementById("rmCancel").addEventListener("click", () => modal.close());
    document.getElementById("rmAmount").addEventListener("input", e => { e.target.value = e.target.value.replace(/[^\d.]/g, ""); });

    document.getElementById("rmForm").addEventListener("submit", async e => {
        e.preventDefault();
        if (!current) return;
        const file = document.getElementById("rmAttachment").files[0];
        let attachment = null;
        if (file) {
            if (file.size > 5 * 1024 * 1024) return err("The attachment must be 5 MB or smaller.");
            try { attachment = { fileName: file.name, fileType: file.type, dataUrl: await readFile(file) }; } catch (x) { return err("Could not read the attachment."); }
        }
        const res = S.requestReimbursement(current.customerId, current.appId, {
            type: document.getElementById("rmType").value,
            amount: document.getElementById("rmAmount").value,
            reason: document.getElementById("rmReason").value,
            payoutDetails: document.getElementById("rmPayout").value,
            attachment
        });
        if (!res.ok) return err(res.error);
        modal.close();
        render(window.HelloSolar && window.HelloSolar.getActivePackage ? window.HelloSolar.getActivePackage() : null);
    });

    const active = () => (window.HelloSolar && window.HelloSolar.getActivePackage ? window.HelloSolar.getActivePackage() : null);
    window.addEventListener("helloSolarPackageChanged", e => render(e.detail && e.detail.package));
    window.addEventListener("helloSolarDataLoaded", () => render(active()));
    window.addEventListener("storage", e => { if (e.key === S.DATA_KEY) render(active()); });
    render(active());
})();
