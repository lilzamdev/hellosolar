/*
 * Hello Solar — business information
 * ----------------------------------------------------------------------------------------------------
 * The ONE place to change Hello Solar's prices, packages, down payments, payment channels and contacts.
 * Every page reads from here (public website, Customer, Financer, Installer, Merchant and Super Admin),
 * so a change here shows everywhere after a page refresh.
 *
 * How to edit:
 *   - Amounts are plain numbers in pesos, without ₱ or commas (285000, not "₱285,000").
 *   - Keep the quotes around text and the comma after every line, like the lines already here.
 *   - terms = monthly payment for each installment term, in months: 6 (6 months), 36 (3 years), 72 (6 years).
 *   - After editing, refresh the page. Changing a price does not change bills that already exist.
 *
 * Load order on every page: hello-solar-business.js → hello-solar-config.js → hello-solar-store.js → …
 * In api mode the backend owns pricing (see API_CONTRACT.md); this file is what the pages show until then.
 */
(function () {
    "use strict";

    const BUSINESS = {
        company: {
            name: "Hello Solar Inc.",
            website: "hellosolarph.com",
            // Customer portal footer and Support page
            supportEmail: "support@hellosolarph.com",
            // Public website › Contact Us
            inquiryEmail: "hello@hellosolar.ph",
            partnerEmail: "partners@hellosolar.ph",
            hotline: "(02) 8888-SOLAR / +63 917 123 4567",
            hotlineTel: "+63288887652",
            hotlineHours: "Monday to Saturday: 8:00 AM – 6:00 PM",
            partnerHours: "Monday to Friday: 9:00 AM – 5:00 PM",
            // Customer support line when no installer is assigned yet (Central Dispatch)
            dispatchPhone: "+63 2 8888 0100"
        },

        // Where customers send their payments (Customer portal › My Payments)
        paymentChannels: [
            { id: "gcash", label: "GCash", channel: "GCash", accountName: "Hello Solar Official", number: "0917 000 1111" },
            { id: "maya", label: "Maya", channel: "Maya", accountName: "Hello Solar Official", number: "0917 000 1111" },
            { id: "bank", label: "Bank", channel: "BDO Bank Transfer", bank: "BDO", accountName: "Hello Solar Inc.", number: "0082-1234-5678" }
        ],

        // Down payments (₱) and the site visit fee (₱)
        downPayment: { installment: 10000, fullPayment: 500 },
        siteVisitFee: 1000,

        // Installment terms in months (6 months, 3 years, 6 years) and the default term
        installmentTerms: [6, 36, 72],
        defaultTerm: 72,

        // Packages. price = Full Payment price. terms = monthly payment per term (HS Pricing 2026).
        // HS 16 PRO MAX stays before HS 16 PRO so a search by name matches the longer name first.
        packages: [
            { id: "hs6-lite", name: "HS 6 LITE", price: 285000, panels: "5kW", inverter: "6kW", battery: "5kWh", terms: { 6: 55334, 36: 10964, 72: 7284 } },
            { id: "hs6-pro", name: "HS 6 PRO", price: 340000, panels: "6kW", inverter: "6kW", battery: "10kWh", terms: { 6: 66334, 36: 13134, 72: 8689 } },
            { id: "hs6-max", name: "HS 6 MAX", price: 390000, panels: "6kW", inverter: "6kW", battery: "16kWh", terms: { 6: 76334, 36: 15106, 72: 9967 } },
            { id: "hs8-pro", name: "HS 8 PRO", price: 516000, panels: "9kW", inverter: "8kW", battery: "16kWh", terms: { 6: 101534, 36: 20076, 72: 13187 } },
            { id: "hs8-max", name: "HS 8 MAX", price: 614000, panels: "9kW", inverter: "8kW", battery: "32kWh", terms: { 6: 121134, 36: 23942, 72: 15692 } },
            { id: "hs12-pro", name: "HS 12 PRO", price: 572000, panels: "12kW", inverter: "12kW", battery: "16kWh", terms: { 6: 112734, 36: 22285, 72: 15572 } },
            { id: "hs12-max", name: "HS 12 MAX", price: 720000, panels: "12kW", inverter: "12kW", battery: "32kWh", terms: { 6: 142334, 36: 28123, 72: 19600 } },
            { id: "hs16-pro-max", name: "HS 16 PRO MAX", price: 975000, panels: "19kW", inverter: "24kW", battery: "32kWh", terms: { 6: 193334, 36: 38181, 72: 26542 } },
            { id: "hs16-pro", name: "HS 16 PRO", price: 780000, panels: "15kW", inverter: "16kW", battery: "16kWh", terms: { 6: 154334, 36: 30489, 72: 21234 } }
        ]
    };

    // ------------------------------------------------------------------------------------------------
    // Helpers (no need to edit below this line)
    // ------------------------------------------------------------------------------------------------
    const peso = n => "₱" + Number(n || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 });
    // ₱10,000 → "₱10k"
    const pesoShort = n => {
        const v = Number(n || 0);
        return v >= 1000 && v % 1000 === 0 ? `₱${v / 1000}k` : peso(v);
    };
    const pkg = id => BUSINESS.packages.find(p => p.id === id) || null;
    const get = path => String(path || "").split(".").reduce((o, k) => (o == null ? undefined : o[k]), BUSINESS);
    const channel = id => BUSINESS.paymentChannels.find(c => c.id === id || c.channel === id) || null;
    const specs = p => (p ? `${p.panels} | ${p.inverter} | ${p.battery}` : "");
    const telHref = phone => "tel:" + String(phone || "").replace(/[^\d+]/g, "");

    // peso: ₱10,000 · pesoShort: ₱10k · k: 10k · text: as written
    const FORMATS = { peso, pesoShort, k: v => pesoShort(v).replace("₱", ""), text: v => (v == null ? "" : String(v)) };

    // Fills page text from this file:
    //   data-biz="company.supportEmail"            → text
    //   data-biz="downPayment.installment|peso"    → text with a format (peso, pesoShort, k)
    //   data-biz-href="mailto:{company.supportEmail}" → link
    //   data-biz-tel="company.hotlineTel"          → tel: link
    //   data-biz-price="hs6-lite"                  → Full Payment price
    //   data-biz-monthly="hs6-lite"                → monthly payment for the default term
    //   data-biz-specs="hs6-lite"                  → "5kW | 6kW | 5kWh"
    function fillValue(expr) {
        const [path, fmt] = String(expr).split("|");
        const v = get(path.trim());
        return (FORMATS[(fmt || "text").trim()] || FORMATS.text)(v);
    }
    function apply(root) {
        const scope = root || document;
        if (!scope || !scope.querySelectorAll) return;
        scope.querySelectorAll("[data-biz]").forEach(el => { el.textContent = fillValue(el.getAttribute("data-biz")); });
        scope.querySelectorAll("[data-biz-href]").forEach(el => {
            el.setAttribute("href", el.getAttribute("data-biz-href").replace(/\{([^}]+)\}/g, (_, expr) => fillValue(expr)));
        });
        scope.querySelectorAll("[data-biz-tel]").forEach(el => {
            el.setAttribute("href", telHref(fillValue(el.getAttribute("data-biz-tel"))));
        });
        scope.querySelectorAll("[data-biz-price]").forEach(el => {
            const p = pkg(el.getAttribute("data-biz-price"));
            if (p) el.textContent = peso(p.price);
        });
        scope.querySelectorAll("[data-biz-monthly]").forEach(el => {
            const p = pkg(el.getAttribute("data-biz-monthly"));
            if (p) el.textContent = peso(p.terms[BUSINESS.defaultTerm]);
        });
        scope.querySelectorAll("[data-biz-specs]").forEach(el => {
            const p = pkg(el.getAttribute("data-biz-specs"));
            if (p) el.textContent = specs(p);
        });
    }

    const api = { data: BUSINESS, get, pkg, channel, specs, peso, pesoShort, telHref, apply };
    if (typeof window !== "undefined") {
        window.HELLO_SOLAR_BUSINESS = BUSINESS;
        window.HSBusiness = api;
        if (typeof document !== "undefined" && document && document.addEventListener) {
            if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => apply());
            else apply();
        }
    }
    if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
