/**
 * Documents page — shows the selected system's Required Documents (js/required-documents.js renders the shared
 * APP document record) and the service agreement (js/agreement.js) the customer must answer and sign.
 */
(function () {
    "use strict";

    function activePackage() {
        return window.HelloSolar && typeof window.HelloSolar.getActivePackage === "function"
            ? window.HelloSolar.getActivePackage() : null;
    }

    function render(pkg) {
        pkg = pkg || activePackage();
        // The agreement card first, then the groups (they move the card into To do / Waiting)
        if (typeof window.renderAgreement === "function") window.renderAgreement(pkg);
        if (typeof window.renderRequiredDocuments === "function") window.renderRequiredDocuments(pkg);
        // Every linked system has a service agreement; installment systems also have required documents
        const hasDocuments = !!pkg && !!pkg.appId;
        const empty = document.getElementById("documentsEmptyState");
        if (!empty) return;
        empty.hidden = hasDocuments;
        if (hasDocuments) return;
        const title = document.getElementById("documentsEmptyTitle");
        const text = document.getElementById("documentsEmptyText");
        if (title) title.textContent = "No system linked yet";
        if (text) text.textContent = "Link your Hello Solar system to see its documents.";
    }

    window.addEventListener("helloSolarDataLoaded", () => render());
    window.addEventListener("helloSolarPackageChanged", (e) => render(e.detail && e.detail.package));
})();
