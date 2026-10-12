/**
 * Installer portal — Site Visits assigned by Super Admin (landing page "Request Assessment" bookings).
 * Reads the shared records through HSShared; the installer can mark an assigned visit as completed.
 */
(function () {
    "use strict";
    const S = window.HSShared;
    const body = document.getElementById("siteVisitsBody");
    if (!S || !body) return;

    const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const fmt = (d, t) => {
        if (!d) return "—";
        const dt = new Date(`${d}T${t || "00:00"}`);
        if (Number.isNaN(dt.getTime())) return d;
        const date = dt.toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });
        return t ? `${date} · ${dt.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}` : date;
    };
    const BADGE = { Scheduled: "badge-progress", Completed: "badge-completed", "Pending Assignment": "badge-pending" };

    function me() {
        const session = S.session.get("installer");
        return session ? { id: session.accountId, name: session.name || session.accountId, role: "Installer" } : null;
    }

    function render() {
        const user = me();
        const visits = user ? S.siteVisitsFor("installer", user.id)
            .slice().sort((a, b) => String(a.scheduledDate || "").localeCompare(String(b.scheduledDate || ""))) : [];
        const open = visits.filter(v => v.status === "Scheduled").length;
        const count = document.getElementById("siteVisitsCount");
        if (count) count.textContent = open;
        if (!visits.length) {
            body.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#78716c;">No site visits assigned to you yet.</td></tr>`;
            return;
        }
        body.innerHTML = visits.map(v => `
            <tr>
                <td><strong>${esc(v.id)}</strong><div style="font-size:12px; color:#78716c;">${esc(v.package || "")}</div></td>
                <td>${esc(v.customer)}<div style="font-size:12px;"><a href="tel:${esc(String(v.phone || "").replace(/\s/g, ""))}">${esc(v.phone)}</a></div></td>
                <td style="max-width:260px;">${esc(v.location)}</td>
                <td>${esc(fmt(v.scheduledDate, v.scheduledTime))}<div><span class="status-badge ${BADGE[v.status] || "badge-pending"}">${esc(v.status)}</span></div></td>
                <td>${v.status === "Scheduled"
                    ? `<button type="button" class="btn btn-primary btn-sm" data-complete-visit="${esc(v.id)}">Mark Completed</button>`
                    : (v.completedAt ? `<span style="font-size:12px; color:#78716c;">Done ${esc(fmt(v.completedAt.slice(0, 10)))}</span>` : "—")}</td>
            </tr>`).join("");
    }

    body.addEventListener("click", e => {
        const btn = e.target.closest("[data-complete-visit]");
        if (!btn) return;
        const user = me();
        if (!user) return;
        const notes = window.prompt("Site visit notes (optional) — e.g. roof condition, electrical panel:", "") || "";
        const res = S.completeSiteVisit(btn.dataset.completeVisit, user, notes);
        if (!res.ok) window.alert(res.error);
        render();
    });

    window.addEventListener("storage", e => { if (e.key === S.DATA_KEY) render(); });
    render();
})();
