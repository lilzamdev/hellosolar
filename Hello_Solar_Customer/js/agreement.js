/**
 * Documents page — Signed Agreement upload.
 * Full Payment systems use the "Full Payment Agreement", Installment systems the "Installment Agreement"
 * (PDFs in assets/PDF). The customer downloads the PDF, signs it and uploads the signed copy from the
 * "Signed Agreement" row of the documents checklist (js/required-documents.js draws the row).
 * The upload is saved on the shared application record (HSShared.uploadSignedAgreement) and shows up in
 * Super Admin › Applications › Details › Documents, where it is accepted or sent back for a re-upload.
 */
(function () {
    "use strict";

    const $ = id => document.getElementById(id);
    const MAX_BYTES = 2 * 1024 * 1024;
    const TYPES = ["application/pdf", "image/jpeg", "image/png"];
    let currentPkg = null;

    function customer() {
        return window.HelloSolar && window.HelloSolar.getCustomer ? window.HelloSolar.getCustomer() : {};
    }

    function message(text, type) {
        if (typeof window.showDocumentsMessage === "function") window.showDocumentsMessage(text, type);
    }

    function refresh() {
        if (typeof window.renderRequiredDocuments === "function") window.renderRequiredDocuments(currentPkg);
    }

    function handleFile(file) {
        if (!file || !currentPkg) return;
        if (!TYPES.includes(file.type)) return message("Upload a PDF, JPG or PNG file.", "error");
        if (file.size > MAX_BYTES) return message("The file is too large. The maximum is 2 MB.", "error");
        const reader = new FileReader();
        reader.onload = () => {
            const res = window.HSShared.uploadSignedAgreement(customer().accountId, currentPkg.appId, file, reader.result);
            if (!res || res.ok === false) return message((res && res.error) || "Could not upload the file. Please try again.", "error");
            if (window.HelloSolar && window.HelloSolar.toast) {
                window.HelloSolar.toast("Signed Agreement Uploaded", `${file.name} was sent to Hello Solar for review.`);
            }
            refresh();
            message("Signed agreement uploaded. Hello Solar will check it.", "success");
        };
        reader.onerror = () => message("Could not read the file. Try another file.", "error");
        reader.readAsDataURL(file);
    }

    document.addEventListener("DOMContentLoaded", () => {
        const input = $("agreementFileInput");
        if (input) input.addEventListener("change", () => handleFile(input.files && input.files[0]));
    });

    // Opens the file picker for the signed agreement (the row's Upload button)
    window.openAgreementUpload = function () {
        const input = $("agreementFileInput");
        if (input) { input.value = ""; input.click(); }
    };

    // Opens the uploaded signed agreement (data: URLs can't be opened directly, so it goes through a blob URL)
    window.openStoredAgreement = function (appId) {
        const stored = window.HSShared && window.HSShared.agreementFileFor ? window.HSShared.agreementFileFor(appId) : null;
        if (stored && stored.fileData) fetch(stored.fileData).then(r => r.blob()).then(blob => window.open(URL.createObjectURL(blob), "_blank"));
    };

    window.renderAgreement = function (pkg) { currentPkg = pkg || null; };
})();
