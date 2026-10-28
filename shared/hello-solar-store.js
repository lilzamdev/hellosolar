// Hello Solar — shared data store (window.HelloSolarStore / window.HELLO_SOLAR_DB)
// The data model and business rules every portal uses: accounts, applications, installations, payments,
// support, inquiries, activity and settings. Loaded on every portal page right after shared/hello-solar-config.js.
// local mode: records live in localStorage (demo seed below). api mode: records come from GET /bootstrap and
// every Super Admin / Direct Engineer write is sent as POST /admin/commands/<method> (see API_CONTRACT.md).
// (Moved from hello_solar_super_admin/js/data.js — the Super Admin portal is no longer its owner.)

(function() {
  const STORAGE_KEY = "HELLO_SOLAR_SUPER_ADMIN_DATA_V2";
  // Shared queue written by the landing page Contact Us form (partner inquiries)
  const PARTNER_INQUIRY_KEY = "HELLO_SOLAR_PARTNER_INQUIRIES";
  // Shared queue written by the landing page for customer inquiries
  // (Solar Recommendation / Request Solar Proposal form and Contact Us → Customer)
  const CUSTOMER_INQUIRY_KEY = "HELLO_SOLAR_CUSTOMER_INQUIRIES";
  const PARTNER_TYPES = ["Financer", "Installer", "Merchant"];
  // Hello Solar packages (same prices as the landing page). Installment: 72 months, ₱10,000 down payment.
  // Full Payment: ₱500 down payment.
  const INSTALLMENT_TERM_MONTHS = 72;
  const INSTALLMENT_DOWN_PAYMENT = 10000;
  const FULL_PAYMENT_DOWN_PAYMENT = 500;
  const isFullPaymentType = ref => {
    if (ref && typeof ref === "object") return /full/i.test(String(ref.paymentType || ref.paymentPreference || "")) || ref.financer === "Not Required";
    return /full/i.test(String(ref || ""));
  };
  // Down payment owed for an application (or a payment type): ₱500 Full Payment, ₱10,000 Installment.
  // A stored amount (downPaymentAmount) always wins so older records keep what the customer actually paid.
  function downPaymentAmountFor(ref) {
    if (ref && typeof ref === "object") {
      const stored = Number(ref.downPaymentAmount);
      if (Number.isFinite(stored) && stored > 0) return stored;
    }
    return isFullPaymentType(ref) ? FULL_PAYMENT_DOWN_PAYMENT : INSTALLMENT_DOWN_PAYMENT;
  }
  // Loan math for installment schedules. The monthly payment is fixed; the number of months follows from the
  // loan amount and the yearly interest rate, and the last payment is only what is left (so totals add up).
  const round2 = n => Math.round(n * 100) / 100;
  const monthlyRateOf = annual => { const r = Number(annual); return Number.isFinite(r) && r > 0 ? r / 100 / 12 : 0; };
  function loanTermMonths(principal, annualRate, monthly) {
    const P = Number(principal) || 0, M = Number(monthly) || 0, r = monthlyRateOf(annualRate);
    if (!(P > 0) || !(M > 0)) return 0;
    if (!r) return Math.ceil(P / M - 1e-9);
    const x = P * r / M;
    if (x >= 1) return 0; // the monthly payment never covers the interest
    return Math.ceil(-Math.log(1 - x) / Math.log(1 + r) - 1e-9);
  }
  // Dates (YYYY-MM-DD). The system uses the real date everywhere. Sample (seed) schedules were written for
  // Sep 25, 2026 and are moved forward with the calendar (data.demoClock) so they always look current.
  const DEMO_DATES_AUTHORED_FOR = "2026-09-25";
  const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const isoToUTC = iso => { const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
  const daysBetweenISO = (from, to) => Math.round((isoToUTC(to) - isoToUTC(from)) / 86400000);
  const shiftISO = (iso, days) => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(iso || ""))) return iso;
    const d = new Date(isoToUTC(iso) + days * 86400000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}` + String(iso).slice(10);
  };
  function loanLastPayment(principal, annualRate, monthly, months) {
    const r = monthlyRateOf(annualRate);
    let balance = Number(principal) || 0;
    for (let i = 1; i < months; i++) balance = balance * (1 + r) - monthly;
    return round2(Math.max(0, balance * (1 + r)));
  }
  // Installment terms: 6 months, 3 years or 6 years (the customer picks one on Buy Now). Every term has the same
  // ₱10,000 down payment. terms = monthly payment per term (months → ₱/month).
  // Source: HS Pricing 2026 (6 mos / 3 yrs option). Same total as the price list (6 months = price × 1.20,
  // 3 years = price × 1.42) with the ₱10,000 down payment; the rest is split into equal monthly payments,
  // rounded up to the whole peso like the 6-year price. Update prices here only; every portal reads this list.
  const INSTALLMENT_TERM_OPTIONS = [6, 36, 72];
  const PACKAGE_CATALOG = [
    { id: "hs6-lite", name: "HS 6 LITE", price: 285000, monthly: 7284, battery: "5kWh", terms: { 6: 55334, 36: 10964, 72: 7284 } },
    { id: "hs6-pro", name: "HS 6 PRO", price: 340000, monthly: 8689, battery: "10kWh", terms: { 6: 66334, 36: 13134, 72: 8689 } },
    { id: "hs6-max", name: "HS 6 MAX", price: 390000, monthly: 9967, battery: "16kWh", terms: { 6: 76334, 36: 15106, 72: 9967 } },
    { id: "hs8-pro", name: "HS 8 PRO", price: 516000, monthly: 13187, battery: "16kWh", terms: { 6: 101534, 36: 20076, 72: 13187 } },
    { id: "hs8-max", name: "HS 8 MAX", price: 614000, monthly: 15692, battery: "32kWh", terms: { 6: 121134, 36: 23942, 72: 15692 } },
    { id: "hs12-pro", name: "HS 12 PRO", price: 572000, monthly: 15572, battery: "16kWh", terms: { 6: 112734, 36: 22285, 72: 15572 } },
    { id: "hs12-max", name: "HS 12 MAX", price: 720000, monthly: 19600, battery: "32kWh", terms: { 6: 142334, 36: 28123, 72: 19600 } },
    // HS 16 PRO MAX is listed before HS 16 PRO so findPackage() matches the longer name first
    { id: "hs16-pro-max", name: "HS 16 PRO MAX", price: 975000, monthly: 26542, battery: "32kWh", terms: { 6: 193334, 36: 38181, 72: 26542 } },
    { id: "hs16-pro", name: "HS 16 PRO", price: 780000, monthly: 21234, battery: "16kWh", terms: { 6: 154334, 36: 30489, 72: 21234 } }
  ];
  // Plain-language term: 6 → "6 months", 36 → "3 years", 72 → "6 years", 82 → "82 months"
  function termLabel(months) {
    const m = Number(months);
    if (!(m > 0)) return "";
    if (m >= 12 && m % 12 === 0) return `${m / 12} year${m === 12 ? "" : "s"}`;
    return `${m} month${m === 1 ? "" : "s"}`;
  }
  // Monthly payment of a package for a term (falls back to the 6-year monthly)
  function monthlyForTerm(pkgRef, months) {
    const pkg = typeof pkgRef === "object" && pkgRef ? pkgRef : findPackage(pkgRef);
    if (!pkg) return null;
    const t = Number(months) || INSTALLMENT_TERM_MONTHS;
    return (pkg.terms && pkg.terms[t]) || (t === INSTALLMENT_TERM_MONTHS ? pkg.monthly : null);
  }
  function findPackage(ref) {
    const key = String(ref || "").trim().toLowerCase();
    if (!key) return null;
    return PACKAGE_CATALOG.find(p => p.id === key) ||
      PACKAGE_CATALOG.find(p => key === p.name.toLowerCase() || key.startsWith(p.name.toLowerCase() + " ") || key.startsWith(p.name.toLowerCase() + "\u2014")) || null;
  }
  // Pricing of a new application: the inquiry's selected package, else the catalog package named by the system,
  // else explicit payload values. No hardcoded fallback amount.
  function resolvePricing(payload, inquiry, isFullPayment) {
    const num = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
    const pkg = findPackage(inquiry?.packageId) || findPackage(payload.packageId) || findPackage(payload.system) || findPackage(inquiry?.selectedSolarModel);
    const price = num(inquiry?.packagePrice) || num(payload.amount) || (pkg ? pkg.price : null);
    // Term: Super Admin's pick (create account) → the customer's pick on Buy Now (6, 36 or 72 months) → 6 years
    const validTerm = t => t && (!pkg || INSTALLMENT_TERM_OPTIONS.includes(t)) ? t : null;
    const adminTerm = validTerm(num(payload.termMonths));
    const inquiryTerm = validTerm(num(inquiry?.termMonths));
    const termMonths = adminTerm || inquiryTerm || (pkg ? INSTALLMENT_TERM_MONTHS : null);
    // Monthly: the inquiry's amount when its term is used, else the catalog amount for the term
    const changedTerm = adminTerm && adminTerm !== inquiryTerm;
    const monthly = (!changedTerm && num(inquiry?.monthlyPayment)) || (pkg ? monthlyForTerm(pkg, termMonths) : null) || num(payload.monthly) || num(inquiry?.monthlyPayment);
    const dpRaw = inquiry?.downPayment ?? payload.downPayment;
    const downPayment = Number.isFinite(Number(dpRaw)) && dpRaw !== null && dpRaw !== "" ? Number(dpRaw) : (pkg ? INSTALLMENT_DOWN_PAYMENT : null);
    return {
      packageId: pkg ? pkg.id : (inquiry?.packageId || null),
      amount: price,
      monthly: isFullPayment ? 0 : monthly,
      termMonths: isFullPayment ? null : termMonths,
      downPayment: isFullPayment ? 0 : downPayment
    };
  }
  // Customer document uploads, keyed by APP ID (written by the Customer portal)
  const SHARED_DOCUMENTS_KEY = "hello_solar_shared_documents";
  const INSTALLATION_PROGRESS_KEY = "hello_solar_installation_progress";

  // Runtime mode (shared/hello-solar-config.js). Without the config file (Node tests, old pages) → local + demo data.
  const HS_CONFIG = (typeof window !== "undefined" && window.HS_CONFIG) || { mode: "local", isApi: false, demoData: true };
  const IS_API = !!HS_CONFIG.isApi;
  const DEMO_DATA = !IS_API && HS_CONFIG.demoData !== false;
  // Shared records: localStorage in local mode, the backend-fed page cache in api mode
  const STORE = {
    getItem: key => ((typeof window !== "undefined" && window.HSStore) || localStorage).getItem(key),
    setItem: (key, value) => ((typeof window !== "undefined" && window.HSStore) || localStorage).setItem(key, value)
  };

  const DEFAULT_DATA = {
    schemaVersion: 6,
    customers: [
      { id: "CUS-1001", name: "Maria Elena Cruz", email: "elena.cruz@gmail.com", phone: "+63 917 234 5678", location: "Cebu City", system: "6 kW", status: "Active", appId: "APP-1024", hsId: "HS-21024", invitationStatus: "Active", joined: "2026-03-12" },
      { id: "CUS-1002", name: "Ricardo Gomez", email: "rgomez.cebu@yahoo.com", phone: "+63 920 456 7890", location: "Mandaue City", system: "8 kW", status: "Active", appId: "APP-1048", hsId: "HS-21048", invitationStatus: "Active", joined: "2026-04-05" },
      { id: "CUS-1003", name: "Andrea Lim", email: "andrea.lim@outlook.com", phone: "+63 918 345 6789", location: "Quezon City", system: "5 kW", status: "Pending Review", appId: "APP-1031", hsId: "HS-21031", invitationStatus: "Active", joined: "2026-08-14" },
      { id: "CUS-1004", name: "Joshua Tan", email: "josh.tan@gmail.com", phone: "+63 922 890 1234", location: "Lapu-Lapu City", system: "10 kW", status: "Active", appId: "APP-1050", hsId: "HS-21050", invitationStatus: "Active", joined: "2026-05-20" },
      { id: "CUS-1005", name: "Pacific Horizon Logistics", email: "procurement@pacifichorizon.ph", phone: "+63 32 412 8890", location: "Talisay City", system: "18 kW", status: "Active", appId: "APP-1056", hsId: "HS-21056", invitationStatus: "Active", joined: "2026-02-18" },
      { id: "CUS-1006", name: "Atty. Fernando Mendoza", email: "atty.mendoza@mendozalaw.ph", phone: "+63 917 889 0123", location: "Quezon City", system: "7 kW", status: "Active", appId: "APP-1062", hsId: "HS-21062", invitationStatus: "Active", joined: "2026-06-10" },
      { id: "CUS-1007", name: "Roberto Santos", email: "robert.santos@santosauto.com", phone: "+63 919 678 9012", location: "Cebu City", system: "12 kW", status: "Active", appId: "APP-1070", hsId: "HS-21070", invitationStatus: "Active", joined: "2026-01-22" },
      { id: "CUS-1008", name: "Dr. Corazon Valdez", email: "dr.valdez@medicalcity.ph", phone: "+63 915 223 3445", location: "Pasig City", system: "6.5 kW", status: "Pending Review", appId: "APP-1075", hsId: "HS-21075", invitationStatus: "Active", joined: "2026-09-18" },
      { id: "CUS-1009", name: "Clara Mendoza", email: "clara.mendoza@gmail.com", phone: "+63 917 555 0891", location: "Cebu City", system: "8.5 kW", status: "Active", appId: "APP-1058", hsId: "HS-21058", invitationStatus: "Active", joined: "2026-08-14" },
    // Portal demo identities registered in the shared registry (single identity model)
      { id: "CUS-1010", name: "Juan Dela Cruz", email: "customer@hellosolar.ph", username: "customer", phone: "+63 917 123 4567", location: "Quezon City", system: "5.4 kW", status: "Active", appId: "APP-4091", hsId: "HS-88219", invitationStatus: "Active", hasSetPassword: true, password: "password123", joined: "2025-03-01" },
      { id: "CUS-1011", name: "Maria Santos", email: "maria.santos@gmail.com", username: "maria", phone: "+63 918 765 4321", location: "Quezon City", system: "6.8 kW", status: "Active", appId: "APP-3012", hsId: "HS-72301", invitationStatus: "Active", hasSetPassword: true, password: "password123", joined: "2025-06-01" }
    ],

    // Contract fields are backend-ready: contractTermMonths, annualRate (% p.a.), contractStartDate/EndDate (YYYY-MM-DD),
    // contractStatusOverride (null | "Terminated"). contractStatus + fundingOwner/fundingOwnerId are derived by syncFinancerContracts().
    financers: [
      { id: "FIN-001", name: "SunFund Philippines", contact: "Rafael Villanueva", email: "partners@sunfund.ph", phone: "+63 2 8845 2200", activeLoans: 14, totalFunded: 4850000, status: "Active", contractTermMonths: 36, annualRate: 8.5, contractStartDate: "2025-01-15", contractEndDate: "2028-01-15", contractStatusOverride: null },
      { id: "FIN-002", name: "BDO Green Energy Financing", contact: "Clarissa Bautista", email: "greenloans@bdo.com.ph", phone: "+63 2 8631 8000", activeLoans: 9, totalFunded: 3420000, status: "Active", contractTermMonths: 24, annualRate: 7.25, contractStartDate: "2024-08-01", contractEndDate: "2026-08-01", contractStatusOverride: null },
      { id: "FIN-003", name: "UnionBank Solar Loan Program", contact: "Mark Anthony Reyes", email: "solarcredit@unionbankph.com", phone: "+63 2 8841 8600", activeLoans: 6, totalFunded: 2180000, status: "Active", contractTermMonths: 60, annualRate: 9.0, contractStartDate: "2026-03-01", contractEndDate: "2031-03-01", contractStatusOverride: null },
      { id: "FIN-004", name: "Maya Bank Sustainable Energy", contact: "Janice De Leon", email: "credit-ops@mayabank.ph", phone: "+63 2 8845 7788", activeLoans: 4, totalFunded: 1250000, status: "Active", contractTermMonths: 24, annualRate: 10.5, contractStartDate: "2025-11-10", contractEndDate: "2027-11-10", contractStatusOverride: null },
    // Portal demo identities registered in the shared registry (single identity model)
      { id: "FIN-005", name: "SolarTech Financer", contact: "Finance Officer", email: "financer@hellosolar.ph", phone: "0917 888 2345", activeLoans: 5, totalFunded: 2765000, status: "Active", password: "password123", contractTermMonths: 36, annualRate: 8.75, contractStartDate: "2026-01-01", contractEndDate: "2029-01-01", contractStatusOverride: null },
      { id: "FIN-006", name: "First Solar Capital", contact: "Elena Santos", email: "partner@hellosolar.ph", phone: "0917 888 6100", activeLoans: 0, totalFunded: 0, status: "Active", password: "password123", contractTermMonths: null, annualRate: null, contractStartDate: null, contractEndDate: null, contractStatusOverride: null }
    ],

    // Direct Installation Engineer accounts (internal; separate from partner installers)
    // Demo internal accounts (same sign-in as the demo engineer / accounting logins)
    engineers: [
      { id: "ENG-DEMO", name: "Engr. Mark Dizon", email: "engineer@hellosolar.ph", phone: "0917 888 4100", role: "Direct Installation Engineer",
        team: "Hello Solar Internal Team", status: "Active", joined: "2026-01-05", password: "engineer123", notes: "Lead engineer for Hello Solar installations." }
    ],
    accountants: [
      { id: "ACC-DEMO", name: "Accounting Officer", email: "accounting@hellosolar.ph", phone: "0917 888 4200", role: "Accounting",
        status: "Active", joined: "2026-01-05", password: "accounting123", notes: "" }
    ],
    installers: [
      { id: "INS-001", name: "Hello Solar Internal Team", type: "Internal", contact: "Engr. Mark Dizon", email: "engineering@hellosolar.ph", phone: "+63 32 238 9001", activeJobs: 2, completedJobs: 28, rating: 4.9, status: "Active" },
      { id: "INS-002", name: "SolarTech Visayas Solutions", type: "Partner", contact: "Dante Alcantara", email: "ops@solartechvisayas.com", phone: "+63 32 414 7712", activeJobs: 2, completedJobs: 19, rating: 4.8, status: "Active" },
      { id: "INS-003", name: "SunPower Masters Cebu", type: "Partner", contact: "Ramon Quisumbing", email: "info@sunpowermasters.ph", phone: "+63 32 340 5566", activeJobs: 2, completedJobs: 14, rating: 4.7, status: "Active" },
      { id: "INS-004", name: "GreenVolt Solutions Corp.", type: "Partner", contact: "Gilbert Soriano", email: "g.soriano@greenvolt.ph", phone: "+63 2 8721 9900", activeJobs: 1, completedJobs: 11, rating: 4.3, status: "Active" },
      { id: "INS-005", name: "Apex Solar Engineering", type: "Partner", contact: "Vicente Morales", email: "vicente@apexsolar.com.ph", phone: "+63 32 505 4421", activeJobs: 0, completedJobs: 8, rating: 4.6, status: "Inactive" },
    // Portal demo identities registered in the shared registry (single identity model)
      { id: "INS-006", name: "SolarTech Installer", type: "Partner", contact: "Alex Rivera", email: "installer@hellosolar.ph", phone: "+63 917 555 0199", activeJobs: 1, completedJobs: 48, rating: 4.95, status: "Active", password: "password123", location: "Metro Manila & Southern Luzon", profile: { licenseNo: "PCAB Solar Contractor Lic. #2024-8841", prcNo: "PRC Reg. Electrical Engineer #0078421", coverageArea: "Metro Manila, Cavite, Laguna, Rizal, Batangas", specialization: "Rooftop Grid-Tie Systems, Hybrid Storage, Net-Metering Commissioning", bio: "Over 8 years of premier residential and commercial rooftop solar installations with full PCAB safety accreditation and zero-incident track record.", payoutMethod: "BDO Unibank (On File)", totalCapacityKwp: 288 } }
    ],

    merchants: [
      { id: "MER-019", name: "SolarHub Trading", contact: "Jonathan Co", email: "sales@solarhubtrading.ph", phone: "+63 32 231 6680", projects: 5, transactions: 112, volume: 3840000, status: "Active" },
      { id: "MER-021", name: "Cebu Energy Supply Co.", contact: "Melissa Yap", email: "accounts@cebuenergysupply.com", phone: "+63 32 416 9901", projects: 3, transactions: 67, volume: 2450000, status: "Active" },
      { id: "MER-022", name: "BrightGrid Hardware", contact: "Evelyn Sy", email: "inquiry@brightgrid.ph", phone: "+63 2 8920 1144", projects: 2, transactions: 31, volume: 1120000, status: "Pending Review" },
      { id: "MER-025", name: "SunVenture Renewable Materials", contact: "Paolo Dizon", email: "distribution@sunventure.com", phone: "+63 32 344 8820", projects: 4, transactions: 85, volume: 2900000, status: "Active" },
    // Portal demo identities registered in the shared registry (single identity model)
      { id: "MER-026", name: "SolarTech Manila", contact: "Marco Santos", email: "merchant@hellosolar.ph", phone: "+63 917 888 2026", projects: 6, transactions: 48, volume: 3850000, status: "Active", password: "password123", address: "Unit 802, Solar Tower, Ortigas Center, Pasig City" }
    ],

    applications: [
      {
        id: "APP-1024",
        hsId: "HS-21024",
        customer: "Maria Elena Cruz",
        customerId: "CUS-1001",
        location: "Cebu City",
        system: "6 kW",
        panels: "12x Canadian Solar 500W",
        inverter: "Huawei SUN2000-5KTL",
        stage: "Approved", // Eligible for Hello Solar Direct!
        financer: "SunFund Philippines",
        financerId: "FIN-001",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 315000,
        monthly: 7200,
        docs: "5/5",
        paymentStatus: "On Time",
        nextDue: "2026-10-15",
        updated: "25 mins ago",
        notes: "Credit approved by SunFund. Ready for installer assignment or Hello Solar Direct installation."
      },
      {
        id: "APP-1031",
        hsId: "HS-21031",
        customer: "Andrea Lim",
        customerId: "CUS-1003",
        location: "Quezon City",
        system: "5 kW",
        paymentType: "Full Payment",
        paymentPreference: "Full Payment",
        panels: "10x Trina Solar 500W",
        inverter: "Growatt 5000TL",
        stage: "Payment Required",
        financer: "Not Required",
        financerId: null,
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 245000,
        monthly: 0,
        docs: "1/1",
        paymentStatus: "Verification Required",
        uploadedReceipt: "bdo_transfer_receipt_app1031.png",
        receiptUploadedAt: "2026-09-28",
        receiptBank: "BDO Unibank Direct Transfer",
        receiptReference: "BDO-TXN-88219304",
        receiptAmount: 245000,
        nextDue: "Sep 28, 2026",
        updated: "1 hour ago",
        notes: "Full payment application. Customer uploaded bank transfer receipt, awaiting administrative verification."
      },
      {
        id: "APP-1048",
        hsId: "HS-21048",
        customer: "Ricardo Gomez",
        customerId: "CUS-1002",
        location: "Mandaue City",
        system: "8 kW",
        panels: "16x Jinko Tiger Neo 500W",
        inverter: "Deye 8kW Hybrid",
        stage: "Ready for Installation",
        financer: "UnionBank Solar Loan Program",
        financerId: "FIN-003",
        installer: "SolarTech Visayas Solutions",
        assignedInstallerId: "INS-002",
        installerType: "Partner Installer",
        amount: 420000,
        monthly: 9600,
        docs: "5/5",
        paymentStatus: "Due Soon",
        nextDue: "2026-09-29",
        updated: "2 hours ago",
        notes: "Assigned to SolarTech Visayas. Pre-installation roof structural inspection completed."
      },
      {
        id: "APP-1050",
        hsId: "HS-21050",
        customer: "Joshua Tan",
        customerId: "CUS-1004",
        location: "Lapu-Lapu City",
        system: "10 kW",
        panels: "20x Longi Hi-MO 6 500W",
        inverter: "GoodWe 10kW Hybrid",
        stage: "Approved", // Eligible for Hello Solar Direct!
        financer: "SunFund Philippines",
        financerId: "FIN-001",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 510000,
        monthly: 11800,
        docs: "5/5",
        paymentStatus: "On Time",
        nextDue: "2026-10-20",
        updated: "3 hours ago",
        notes: "Approved financing disbursement. High roof pitch, eligible for Hello Solar Direct Team."
      },
      {
        id: "APP-1056",
        hsId: "HS-21056",
        customer: "Pacific Horizon Logistics",
        customerId: "CUS-1005",
        location: "Talisay City",
        system: "18 kW",
        panels: "36x Canadian Solar 500W",
        inverter: "Huawei SUN2000-15KTL",
        stage: "Ready for Installation",
        financer: "BDO Green Energy Financing",
        financerId: "FIN-002",
        installer: "GreenVolt Solutions Corp.",
        assignedInstallerId: "INS-004",
        installerType: "Partner Installer",
        amount: 920000,
        monthly: 21000,
        docs: "5/5",
        paymentStatus: "Overdue",
        nextDue: "2026-09-12",
        updated: "4 hours ago",
        notes: "Installation delayed due to local utility metering review. Payment overdue by 12 days."
      },
      {
        id: "APP-1062",
        hsId: "HS-21062",
        customer: "Atty. Fernando Mendoza",
        customerId: "CUS-1006",
        location: "Quezon City",
        system: "7 kW",
        panels: "14x Trina Vertex 500W",
        inverter: "Huawei SUN2000-6KTL",
        stage: "Ready for Installation",
        financer: "Maya Bank Sustainable Energy",
        financerId: "FIN-004",
        installer: "Hello Solar Internal Team",
        assignedInstallerId: "INS-001",
        installerType: "Hello Solar Direct",
        amount: 360000,
        monthly: 8300,
        docs: "5/5",
        paymentStatus: "On Time",
        nextDue: "2026-10-05",
        updated: "Yesterday",
        notes: "Accepted for Hello Solar Direct Installation. Internal Engineering Team dispatched for mounting."
      },
      {
        id: "APP-1070",
        hsId: "HS-21070",
        customer: "Roberto Santos",
        customerId: "CUS-1007",
        location: "Cebu City",
        system: "12 kW",
        paymentType: "Full Payment",
        paymentPreference: "Full Payment",
        panels: "24x Jinko Solar 500W",
        inverter: "Solis 12kW 3-Phase",
        stage: "Approved",
        financer: "Not Required",
        financerId: null,
        installer: "Hello Solar Internal Team",
        assignedInstallerId: "INS-001",
        installerType: "Hello Solar Direct",
        amount: 640000,
        monthly: 0,
        docs: "5/5",
        paymentStatus: "Completed",
        uploadedReceipt: "metrobank_wire_app1070.pdf",
        receiptUploadedAt: "2026-09-22",
        receiptBank: "Metrobank Direct Wire",
        receiptReference: "MB-WIRE-990142",
        receiptAmount: 640000,
        nextDue: "Paid in Full",
        updated: "3 days ago",
        notes: "Commissioned by Hello Solar Direct team. Paid in full via direct bank transfer."
      },
      {
        id: "APP-1075",
        hsId: "HS-21075",
        customer: "Dr. Corazon Valdez",
        customerId: "CUS-1008",
        location: "Pasig City",
        system: "6.5 kW",
        paymentType: "Installment",
        paymentPreference: "Installment",
        panels: "13x Canadian Solar 500W",
        inverter: "Growatt 6000TL",
        stage: "Financing Review",
        financer: "UnionBank Solar Loan Program",
        financerId: "FIN-003",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 340000,
        monthly: 7800,
        docs: "4/5",
        paymentStatus: "On Time",
        nextDue: "2026-10-25",
        updated: "5 hours ago",
        notes: "Newly processed installment application under bank financing review."
      },
      {
        id: "APP-1082",
        hsId: "HS-21082",
        customer: "Island Gateway Resort",
        customerId: "CUS-1004",
        location: "Lapu-Lapu City",
        system: "25 kW",
        panels: "50x Trina Solar 500W",
        inverter: "Huawei 25KTL",
        stage: "Pending Finance",
        financer: "BDO Green Energy Financing",
        financerId: "FIN-002",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 1350000,
        monthly: 31000,
        docs: "5/5",
        paymentStatus: "On Time",
        nextDue: "2026-10-30",
        updated: "1 day ago",
        notes: "Commercial application undergoing final underwriter risk analysis at BDO."
      },
      {
        id: "APP-1089",
        hsId: "HS-21089",
        customer: "Manuel Pangilinan",
        customerId: "CUS-1003",
        location: "Taguig City",
        system: "9 kW",
        panels: "18x Longi 500W",
        inverter: "Deye 8kW",
        stage: "Declined",
        financer: "SunFund Philippines",
        financerId: "FIN-001",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 470000,
        monthly: 10800,
        docs: "2/5",
        paymentStatus: "Overdue",
        nextDue: "2026-09-08",
        updated: "2 days ago",
        notes: "Declined due to debt service ratio limit. Financer record flagged missed initial payment due Sep 8, 2026."
      },
      {
        id: "APP-1094",
        hsId: "HS-21094",
        customer: "Teresa Alcantara",
        customerId: "CUS-1002",
        location: "Mandaue City",
        system: "5 kW",
        panels: "10x Canadian Solar 500W",
        inverter: "Growatt 5000TL",
        stage: "Approved", // Eligible for Hello Solar Direct!
        financer: "Maya Bank Sustainable Energy",
        financerId: "FIN-004",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 260000,
        monthly: 6000,
        docs: "5/5",
        paymentStatus: "Due Soon",
        nextDue: "2026-10-01",
        updated: "6 hours ago",
        notes: "Approved and awaiting installer dispatch. Eligible for Hello Solar Direct."
      },
      {
        id: "APP-1102",
        hsId: "HS-21102",
        customer: "Northern Coast Cold Storage",
        customerId: "CUS-1001",
        location: "Cebu City",
        system: "30 kW",
        panels: "60x Jinko 500W",
        inverter: "Huawei 30KTL",
        stage: "Ready for Installation",
        financer: "SunFund Philippines",
        financerId: "FIN-001",
        installer: "Hello Solar Internal Team",
        assignedInstallerId: "INS-001",
        installerType: "Maintenance",
        amount: 1620000,
        monthly: 37200,
        docs: "5/5",
        paymentStatus: "On Time",
        nextDue: "2026-10-18",
        updated: "Just now",
        notes: "Biannual preventive inverter calibration and string thermal imaging inspection."
      },
      {
        id: "APP-1058",
        hsId: "HS-21058",
        customer: "Clara Mendoza",
        customerId: "CUS-1009",
        location: "Cebu City",
        system: "8.5 kW",
        panels: "17x Canadian Solar 500W",
        inverter: "Huawei 8KTL",
        stage: "Ready for Installation",
        financer: "SunFund Philippines",
        financerId: "FIN-001",
        installer: "Hello Solar Internal Team",
        assignedInstallerId: "INS-001",
        installerType: "Hello Solar Direct",
        amount: 430000,
        monthly: 9900,
        docs: "5/5",
        paymentStatus: "On Time",
        nextDue: "2026-10-15",
        updated: "Just now",
        notes: "Approved and ready for internal team schedule assignment."
      },
    // Portal demo identities registered in the shared registry (single identity model)
      {
        id: "APP-4091",
        hsId: "HS-88219",
        customer: "Juan Dela Cruz",
        customerId: "CUS-1010",
        contactEmail: "customer@hellosolar.ph",
        contactPhone: "+63 917 123 4567",
        location: "Quezon City",
        system: "5.4 kW",
        panels: "12x Trina Solar Vertex S+ 450W",
        inverter: "Solis 5kW Hybrid Inverter",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Approved",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "SolarTech Installer",
        assignedInstallerId: "INS-006",
        installerType: "Partner Installer",
        dispatchStatus: "Accepted",
        installationStatus: "COMPLETED",
        systemStatus: "ACTIVE",
        applicationStatus: "ACTIVE",
        progress: 100,
        amount: 554000,
        monthly: 9066.67,
        docs: "4/4",
        paymentStatus: "On Time",
        nextDue: "2026-10-15",
        updated: "2 days ago",
        notes: "Commissioned residential hybrid system. Customer portal: Home Primary."
      },
      {
        id: "APP-4088",
        hsId: "HS-99402",
        customer: "Juan Dela Cruz",
        customerId: "CUS-1010",
        contactEmail: "customer@hellosolar.ph",
        contactPhone: "+63 917 123 4567",
        location: "Tagaytay, Cavite",
        system: "10.8 kW",
        panels: "24x Canadian Solar 450W HiKu6",
        inverter: "Deye 10kW Hybrid Inverter",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Approved",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "SolarTech Installer",
        assignedInstallerId: "INS-006",
        installerType: "Partner Installer",
        dispatchStatus: "Accepted",
        installationStatus: "COMPLETED",
        systemStatus: "ACTIVE",
        applicationStatus: "ACTIVE",
        progress: 100,
        amount: 1490800,
        monthly: 17450,
        docs: "4/4",
        paymentStatus: "On Time",
        nextDue: "2026-10-20",
        updated: "3 days ago",
        notes: "Commissioned villa system. Customer portal: Tagaytay Villa."
      },
      {
        id: "APP-4085",
        hsId: "HS-77310",
        customer: "Juan Dela Cruz",
        customerId: "CUS-1010",
        contactEmail: "customer@hellosolar.ph",
        contactPhone: "+63 917 123 4567",
        location: "Lipa, Batangas",
        system: "3.6 kW",
        panels: "8x Longi Solar Hi-MO 5 450W",
        inverter: "Growatt 3.6kW Hybrid Inverter",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Installation",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "SolarTech Installer",
        assignedInstallerId: "INS-006",
        installerType: "Partner Installer",
        dispatchStatus: "Accepted",
        installationStatus: "INSTALLATION_IN_PROGRESS",
        systemStatus: "Installation in Progress",
        progress: 60,
        amount: 231200,
        monthly: 6200,
        docs: "4/4",
        paymentStatus: "Overdue",
        nextDue: "2026-09-30",
        updated: "Yesterday",
        notes: "Partner installation in progress. Customer portal: Batangas Farmhouse."
      },
      {
        id: "APP-8821",
        hsId: "HS-10492",
        customer: "Juan Dela Cruz",
        customerId: "CUS-1010",
        contactEmail: "customer@hellosolar.ph",
        contactPhone: "+63 917 123 4567",
        location: "Ortigas, Pasig",
        system: "6.0 kW",
        panels: "12x Trina Solar Vertex 500W Commercial",
        inverter: "Huawei SUN2000-6KTL Commercial",
        paymentType: "Full Payment",
        paymentPreference: "Full Payment",
        stage: "Payment Required",
        financer: "Not Required",
        financerId: null,
        installer: "Unassigned",
        installerType: "Partner Installer",
        systemStatus: "Waiting for Installer",
        amount: 320000,
        monthly: 0,
        docs: "1/1",
        paymentStatus: "Payment Required",
        nextDue: "2026-10-15",
        updated: "4 hours ago",
        notes: "Full payment order awaiting payment receipt. Customer portal: Commercial Unit B."
      },
      {
        id: "APP-4072",
        hsId: "HS-55201",
        customer: "Juan Dela Cruz",
        customerId: null,
        contactEmail: "juan.delacruz@hellosolar.ph",
        contactPhone: "+63 917 555 0199",
        location: "Santa Rosa, Laguna",
        system: "8.2 kW",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Approved",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "SolarTech Installer",
        assignedInstallerId: "INS-006",
        installerType: "Partner Installer",
        dispatchStatus: "Accepted",
        installationStatus: "COMPLETED",
        systemStatus: "ACTIVE",
        applicationStatus: "ACTIVE",
        progress: 100,
        amount: 783000,
        monthly: 12800,
        docs: "4/4",
        paymentStatus: "On Time",
        nextDue: "2026-10-25",
        updated: "1 week ago",
        notes: "Existing commissioned system not yet linked to a portal account (link by HS ID + owner contact)."
      },
      {
        id: "APP-3012",
        hsId: "HS-72301",
        customer: "Maria Santos",
        customerId: "CUS-1011",
        contactEmail: "maria.santos@gmail.com",
        contactPhone: "+63 918 765 4321",
        location: "Quezon City",
        system: "6.8 kW",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Approved",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "SolarTech Installer",
        assignedInstallerId: "INS-006",
        installerType: "Partner Installer",
        dispatchStatus: "Accepted",
        installationStatus: "COMPLETED",
        systemStatus: "ACTIVE",
        applicationStatus: "ACTIVE",
        progress: 100,
        amount: 687000,
        monthly: 11250,
        docs: "4/4",
        paymentStatus: "On Time",
        nextDue: "2026-10-05",
        updated: "1 week ago",
        notes: "Commissioned residential system. Customer portal: Quezon Residence."
      },
      {
        id: "APP-1103",
        hsId: "HS-21103",
        customer: "Carlos Villanueva",
        customerId: null,
        location: "Taguig City",
        system: "6.4 kWp",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Financing Review",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 340000,
        monthly: 10750,
        docs: "3/4",
        paymentStatus: "Financing Review",
        nextDue: "N/A",
        updated: "1 week ago",
        notes: "Financer portal application book (SolarTech Financer)."
      },
      {
        id: "APP-1104",
        hsId: "HS-21104",
        customer: "Ricardo Gomez",
        customerId: null,
        location: "Makati City",
        system: "5.4 kWp",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Missing Documents",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 285000,
        monthly: 8997,
        docs: "3/4",
        paymentStatus: "Financing Review",
        nextDue: "N/A",
        updated: "1 week ago",
        notes: "Financer portal application book (SolarTech Financer)."
      },
      {
        id: "APP-1105",
        hsId: "HS-21105",
        customer: "Maria Elena Cruz",
        customerId: "CUS-1001",
        location: "Quezon City",
        system: "8.2 kWp",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Pending Finance",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 420000,
        monthly: 12850,
        docs: "4/4",
        paymentStatus: "Financing Review",
        nextDue: "N/A",
        updated: "1 week ago",
        notes: "Financer portal application book (SolarTech Financer)."
      },
      {
        id: "APP-1106",
        hsId: "HS-21106",
        customer: "Jonathan Dela Cruz",
        customerId: null,
        location: "Pasig City",
        system: "3.6 kWp",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Missing Documents",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 195000,
        monthly: 6120,
        docs: "3/4",
        paymentStatus: "Financing Review",
        nextDue: "N/A",
        updated: "1 week ago",
        notes: "Financer portal application book (SolarTech Financer)."
      },
      {
        id: "APP-1107",
        hsId: "HS-21107",
        customer: "David Tan",
        customerId: null,
        location: "Cebu City",
        system: "12.0 kWp",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Approved",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 780000,
        monthly: 15920,
        docs: "4/4",
        paymentStatus: "On Time",
        nextDue: "N/A",
        updated: "1 week ago",
        notes: "Financer portal application book (SolarTech Financer)."
      },
      {
        id: "APP-1108",
        hsId: "HS-21108",
        customer: "Rosanna Valenzuela",
        customerId: null,
        location: "Taguig City",
        system: "6.8 kWp",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Pending Finance",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 350000,
        monthly: 11020,
        docs: "4/4",
        paymentStatus: "Financing Review",
        nextDue: "N/A",
        updated: "1 week ago",
        notes: "Financer portal application book (SolarTech Financer)."
      },
      {
        id: "APP-1109",
        hsId: "HS-21109",
        customer: "Patricia Santos",
        customerId: null,
        location: "Davao City",
        system: "6.0 kWp",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Approved",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 315000,
        monthly: 9890,
        docs: "4/4",
        paymentStatus: "On Time",
        nextDue: "N/A",
        updated: "1 week ago",
        notes: "Financer portal application book (SolarTech Financer)."
      },
      {
        id: "APP-1110",
        hsId: "HS-21110",
        customer: "Antonio Reyes",
        customerId: null,
        location: "Cavite",
        system: "4.8 kWp",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Declined",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 240000,
        monthly: 7540,
        docs: "3/4",
        paymentStatus: "Declined",
        nextDue: "N/A",
        updated: "1 week ago",
        notes: "Financer portal application book (SolarTech Financer)."
      },
      {
        id: "APP-1111",
        hsId: "HS-21111",
        customer: "Benjamin Alcantara",
        customerId: null,
        location: "Iloilo City",
        system: "4.8 kWp",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Approved",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 260000,
        monthly: 8160,
        docs: "4/4",
        paymentStatus: "On Time",
        nextDue: "N/A",
        updated: "1 week ago",
        notes: "Financer portal application book (SolarTech Financer)."
      },
      {
        id: "APP-1112",
        hsId: "HS-21112",
        customer: "Corazon Aquino-Lim",
        customerId: null,
        location: "Mandaluyong City",
        system: "7.2 kWp",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Approved",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 490000,
        monthly: 11980,
        docs: "4/4",
        paymentStatus: "On Time",
        nextDue: "N/A",
        updated: "1 week ago",
        notes: "Financer portal application book (SolarTech Financer)."
      },
      {
        id: "APP-1113",
        hsId: "HS-21113",
        customer: "Ferdinand Mendoza",
        customerId: null,
        location: "Bulacan",
        system: "5.4 kWp",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Declined",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 380000,
        monthly: 11920,
        docs: "4/4",
        paymentStatus: "Declined",
        nextDue: "N/A",
        updated: "1 week ago",
        notes: "Financer portal application book (SolarTech Financer)."
      },
      {
        id: "APP-1114",
        hsId: "HS-21114",
        customer: "Lourdes Villamor",
        customerId: null,
        location: "Batangas",
        system: "5.0 kWp",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Declined",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 310000,
        monthly: 9750,
        docs: "3/4",
        paymentStatus: "Declined",
        nextDue: "N/A",
        updated: "1 week ago",
        notes: "Financer portal application book (SolarTech Financer)."
      },
      {
        id: "APP-1115",
        hsId: "HS-21115",
        customer: "Manuel Pangilinan Jr.",
        customerId: null,
        location: "Pampanga",
        system: "15.0 kWp",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Approved",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 920000,
        monthly: 18780,
        docs: "4/4",
        paymentStatus: "On Time",
        nextDue: "N/A",
        updated: "1 week ago",
        notes: "Financer portal application book (SolarTech Financer)."
      },
      {
        id: "APP-1116",
        hsId: "HS-21116",
        customer: "Gregorio Santos",
        customerId: null,
        location: "Rizal",
        system: "3.8 kWp",
        panels: "Pending Assessment",
        inverter: "Pending Assessment",
        paymentType: "Installment",
        paymentPreference: "Installment",
        stage: "Declined",
        financer: "SolarTech Financer",
        financerId: "FIN-005",
        installer: "Unassigned",
        installerType: "Partner Installer",
        amount: 215000,
        monthly: 6750,
        docs: "3/4",
        paymentStatus: "Declined",
        nextDue: "N/A",
        updated: "1 week ago",
        notes: "Financer portal application book (SolarTech Financer)."
      }
    ],

    installations: [
      {
        id: "JOB-301",
        appId: "APP-1062",
        customer: "Atty. Fernando Mendoza",
        location: "Quezon City",
        system: "7 kW",
        installer: "Hello Solar Internal Team",
        installerType: "Hello Solar Direct",
        status: "In Progress",
        schedule: "Oct 28, 2026 · 8:30 AM",
        progress: 80,
        leadTech: "Engr. Mark Dizon",
        notes: "Racking & DC trunking 80% completed. Battery bank installation scheduled."
      },
      {
        id: "JOB-302",
        appId: "APP-1048",
        customer: "Ricardo Gomez",
        location: "Mandaue City",
        system: "8 kW",
        installer: "SolarTech Visayas Solutions",
        installerType: "Partner Installer",
        status: "Scheduled",
        schedule: "Oct 2, 2026",
        leadTech: "Dante Alcantara",
        notes: "Materials staged at customer premises. Roof structural clearance confirmed."
      },
      {
        id: "JOB-303",
        appId: "APP-1070",
        customer: "Roberto Santos",
        location: "Cebu City",
        system: "12 kW",
        installer: "Hello Solar Internal Team",
        installerType: "Hello Solar Direct",
        status: "Completed",
        schedule: "Sep 14, 2026",
        completedDate: "Sep 14, 2026",
        leadTech: "Engr. Mark Dizon",
        notes: "Fully commissioned and certified. Utility bi-directional meter energized."
      },
      {
        id: "JOB-304",
        appId: "APP-1056",
        customer: "Pacific Horizon Logistics",
        location: "Talisay City",
        system: "18 kW",
        installer: "GreenVolt Solutions Corp.",
        installerType: "Partner Installer",
        status: "Delayed",
        schedule: "Sep 22, 2026",
        leadTech: "Gilbert Soriano",
        delayReason: "Permit Approval",
        notes: "Delayed due to pending distribution utility shutdown permit."
      },
      {
        id: "JOB-305",
        appId: "APP-1058",
        customer: "Clara Mendoza",
        location: "Cebu City",
        system: "8.5 kW",
        installer: "Hello Solar Internal Team",
        installerType: "Hello Solar Direct",
        status: "Ready",
        schedule: "Pending Schedule",
        leadTech: "Unassigned",
        notes: "Materials staged. Ready for date & time assignment by Super Admin."
      },
      {
        id: "JOB-306",
        appId: "APP-1070",
        customer: "Roberto Santos",
        location: "Cebu City",
        system: "12 kW",
        installer: "Hello Solar Internal Team",
        installerType: "Maintenance",
        status: "In Progress",
        schedule: "Sep 28, 2026",
        leadTech: "Engr. Mark Dizon",
        notes: "Periodic inverter firmware upgrade and DC string balance calibration."
      },
      {
        id: "JOB-307",
        appId: "APP-4085",
        customer: "Juan Dela Cruz",
        location: "Lipa, Batangas",
        system: "3.6 kW",
        installer: "SolarTech Installer",
        installerId: "INS-006",
        installerType: "Partner Installer",
        status: "In Progress",
        schedule: "Oct 20, 2026",
        leadTech: "SolarTech Installer Team",
        notes: "Panels mounted. Inverter and battery wiring in progress."
      }
    ],

    support: [
      {
        id: "SUP-043",
        accountType: "Customer",
        relatedId: "APP-1024",
        accountName: "Maria Elena Cruz",
        concern: "Billing cycle alignment with electric utility statement",
        priority: "Medium",
        status: "Open",
        created: "2 hours ago",
        createdAt: "2026-09-24T18:00:00",
        assignedTo: "ADMIN (Limuel)",
        notes: "Customer requesting payment date adjustment from 15th to 20th of the month.",
        resolutionNote: null,
        resolvedBy: null,
        resolvedAt: null,
        messages: [
          {
            id: "MSG-043-1",
            sender: "Maria Elena Cruz (Customer)",
            role: "Customer",
            time: "2 hours ago",
            text: "Hello, my monthly electric utility meter reading occurs every 18th of the month. Can we align my solar loan amortization due date from the 15th to the 20th to prevent cash flow mismatch?"
          }
        ],
        history: [
          {
            id: "TH-043-1",
            time: "2 hours ago",
            user: "System",
            action: "Ticket created via Customer Portal",
            type: "create"
          },
          {
            id: "TH-043-2",
            time: "1 hour ago",
            user: "ADMIN (Limuel)",
            action: "Assigned ticket to ADMIN (Limuel) and set priority to Medium",
            type: "assignment"
          }
        ]
      },
      {
        id: "SUP-044",
        accountType: "Installer",
        relatedId: "JOB-304",
        accountName: "GreenVolt Solutions Corp.",
        concern: "Delayed installation permit at Talisay distribution utility",
        priority: "High",
        status: "In Progress",
        created: "3 hours ago",
        createdAt: "2026-09-24T17:00:00",
        assignedTo: "ADMIN (Limuel)",
        notes: "Super Admin intervention requested with local utility desk engineer.",
        resolutionNote: null,
        resolvedBy: null,
        resolvedAt: null,
        messages: [
          {
            id: "MSG-044-1",
            sender: "GreenVolt Solutions Corp. (Installer)",
            role: "Installer",
            time: "3 hours ago",
            text: "We are on standby for installation JOB-304 in Talisay. The distribution utility requires an expedited engineering review endorsement from Hello Solar Super Admin. Permit approval is delaying project kickoff."
          },
          {
            id: "MSG-044-2",
            sender: "ADMIN (Limuel)",
            role: "Admin",
            time: "1 hour ago",
            text: "Received. Contacting local utility regional office engineering desk today to submit expedited project documentation and technical endorsement."
          }
        ],
        history: [
          {
            id: "TH-044-1",
            time: "3 hours ago",
            user: "GreenVolt Solutions Corp.",
            action: "Ticket filed via Installer Portal with High Priority",
            type: "create"
          },
          {
            id: "TH-044-2",
            time: "2.5 hours ago",
            user: "ADMIN (Limuel)",
            action: "Status moved to In Progress by ADMIN (Limuel)",
            type: "status"
          },
          {
            id: "TH-044-3",
            time: "1 hour ago",
            user: "ADMIN (Limuel)",
            action: "Admin sent update response to GreenVolt Solutions Corp.",
            type: "message"
          }
        ]
      },
      {
        id: "SUP-045",
        accountType: "Financer",
        relatedId: "APP-1031",
        accountName: "BDO Green Energy Financing",
        concern: "Missing latest 3 months bank statements & COE verification",
        priority: "High",
        status: "Open",
        created: "4 hours ago",
        createdAt: "2026-09-24T16:00:00",
        assignedTo: "ADMIN (Limuel)",
        notes: "Automated reminder sent to customer. Credit team waiting before final sign-off.",
        resolutionNote: null,
        resolvedBy: null,
        resolvedAt: null,
        messages: [
          {
            id: "MSG-045-1",
            sender: "BDO Green Energy Financing (Financer)",
            role: "Financer",
            time: "4 hours ago",
            text: "Credit evaluation for Andrea Lim (APP-1031) is paused. We are missing the latest 3-month electric utility statement and signed COE verification. Please instruct applicant to submit via portal."
          }
        ],
        history: [
          {
            id: "TH-045-1",
            time: "4 hours ago",
            user: "BDO Green Energy Financing",
            action: "Ticket created via Financer Portal with High Priority",
            type: "create"
          },
          {
            id: "TH-045-2",
            time: "3.5 hours ago",
            user: "ADMIN (Limuel)",
            action: "Assigned ticket to ADMIN (Limuel)",
            type: "assignment"
          }
        ]
      },
      {
        id: "SUP-046",
        accountType: "Merchant",
        relatedId: "MER-021",
        accountName: "Cebu Energy Supply Co.",
        concern: "Purchase order reconciliation for 40x Trina 550W panels batch",
        priority: "Medium",
        status: "In Progress",
        created: "Yesterday",
        createdAt: "2026-09-23T14:30:00",
        assignedTo: "ADMIN (Limuel)",
        notes: "Reconciling delivery receipt #DR-8891 against invoice clearance.",
        resolutionNote: null,
        resolvedBy: null,
        resolvedAt: null,
        messages: [
          {
            id: "MSG-046-1",
            sender: "Cebu Energy Supply Co. (Merchant)",
            role: "Merchant",
            time: "Yesterday",
            text: "Discrepancy noted on PO-9921 delivery receipt #DR-8891. Invoice total reflects 40 units while delivery receipt logged 38 units. Two damaged panels were returned for immediate replacement."
          },
          {
            id: "MSG-046-2",
            sender: "ADMIN (Limuel)",
            role: "Admin",
            time: "Yesterday at 05:20 PM",
            text: "Warehouse manager notified. Awaiting replacement dispatch receipt from supplier before invoice clearance."
          }
        ],
        history: [
          {
            id: "TH-046-1",
            time: "Yesterday",
            user: "Cebu Energy Supply Co.",
            action: "Ticket filed via Merchant Portal",
            type: "create"
          },
          {
            id: "TH-046-2",
            time: "Yesterday at 04:00 PM",
            user: "ADMIN (Limuel)",
            action: "Moved ticket to In Progress",
            type: "status"
          }
        ]
      },
      {
        id: "SUP-047",
        accountType: "Customer",
        relatedId: "APP-1062",
        accountName: "Atty. Fernando Mendoza",
        concern: "Inquiry regarding Hello Solar Direct team site arrival schedule",
        priority: "Low",
        status: "Resolved",
        created: "2 days ago",
        createdAt: "2026-09-22T10:00:00",
        assignedTo: "ADMIN (Limuel)",
        notes: "Dispatch manager confirmed arrival window of 8:30 AM tomorrow with customer.",
        resolutionNote: "Dispatch manager confirmed arrival window of 8:30 AM tomorrow with customer.",
        resolvedBy: "ADMIN (Limuel)",
        resolvedAt: "Sep 23, 2026, 04:15 PM",
        messages: [
          {
            id: "MSG-047-1",
            sender: "Atty. Fernando Mendoza (Customer)",
            role: "Customer",
            time: "2 days ago",
            text: "Good day, what time will the Hello Solar Direct installation crew arrive at our Talisay site tomorrow?"
          },
          {
            id: "MSG-047-2",
            sender: "ADMIN (Limuel)",
            role: "Admin",
            time: "Yesterday at 04:15 PM",
            text: "Good day Atty. Mendoza, our team lead Engr. Mark Dizon has confirmed arrival between 8:30 AM and 9:00 AM."
          }
        ],
        history: [
          {
            id: "TH-047-1",
            time: "2 days ago",
            user: "Atty. Fernando Mendoza",
            action: "Ticket created via Customer Portal",
            type: "create"
          },
          {
            id: "TH-047-2",
            time: "Yesterday at 04:15 PM",
            user: "ADMIN (Limuel)",
            action: "Resolution note recorded: Dispatch manager confirmed arrival window of 8:30 AM tomorrow with customer.",
            type: "resolution"
          },
          {
            id: "TH-047-3",
            time: "Yesterday at 04:15 PM",
            user: "ADMIN (Limuel)",
            action: "Ticket marked as Resolved",
            type: "status"
          }
        ]
      },
      {
        id: "SUP-048",
        accountType: "Installer",
        relatedId: "JOB-305",
        accountName: "SunPower Masters Cebu",
        concern: "Net metering bi-directional meter testing appointment notice",
        priority: "Medium",
        status: "Open",
        created: "5 hours ago",
        createdAt: "2026-09-24T15:00:00",
        assignedTo: "ADMIN (Limuel)",
        notes: "Customer presence needed for utility inspector meter seal verification.",
        resolutionNote: null,
        resolvedBy: null,
        resolvedAt: null,
        messages: [
          {
            id: "MSG-048-1",
            sender: "SunPower Masters Cebu (Installer)",
            role: "Installer",
            time: "5 hours ago",
            text: "Distribution utility scheduled bi-directional meter calibration for JOB-305 on Oct 2 at 10:00 AM. Please ensure homeowner or authorized representative is on-site."
          }
        ],
        history: [
          {
            id: "TH-048-1",
            time: "5 hours ago",
            user: "SunPower Masters Cebu",
            action: "Ticket created via Installer Portal",
            type: "create"
          },
          {
            id: "TH-048-2",
            time: "4.5 hours ago",
            user: "ADMIN (Limuel)",
            action: "Assigned ticket to ADMIN (Limuel)",
            type: "assignment"
          }
        ]
      }
    ],

    activity: [
      {
        id: "ACT-801",
        timestamp: "2026-09-25T14:38:00+08:00",
        exactTime: "Sep 25, 2026 · 2:38 PM",
        role: "Financer",
        actorId: "FIN-001",
        user: "FIN-001 (SunFund)",
        action: "Approved financing credit check for APP-1024",
        record: "APP-1024",
        recordType: "Application",
        details: { stage: "Approved", creditScore: "Tier 1 Compliant", financer: "SunFund Solar Financing" }
      },
      {
        id: "ACT-802",
        timestamp: "2026-09-25T14:22:00+08:00",
        exactTime: "Sep 25, 2026 · 2:22 PM",
        role: "Installer",
        actorId: "INS-002",
        user: "INS-002 (SolarTech)",
        action: "Completed roof pre-inspection for APP-1048",
        record: "JOB-302",
        recordType: "Installation",
        details: { inspectionStatus: "Passed", structuralIntegrity: "Approved", job: "JOB-302" }
      },
      {
        id: "ACT-803",
        timestamp: "2026-09-25T14:05:00+08:00",
        exactTime: "Sep 25, 2026 · 2:05 PM",
        role: "Admin",
        actorId: "ADMIN-01",
        user: "ADMIN (Limuel)",
        action: "Accepted APP-1062 for Hello Solar Direct Installation",
        record: "APP-1062",
        recordType: "Application",
        details: { installerType: "Hello Solar Direct", assignedTeam: "Central Operations (Team Alpha)" }
      },
      {
        id: "ACT-804",
        timestamp: "2026-09-25T13:50:00+08:00",
        exactTime: "Sep 25, 2026 · 1:50 PM",
        role: "Customer",
        actorId: "CUS-1003",
        user: "CUS-1003 (Andrea Lim)",
        action: "Uploaded 2 updated salary slips for review",
        record: "APP-1031",
        recordType: "Application",
        details: { documentType: "Proof of Income", filesUploaded: 2 }
      },
      {
        id: "ACT-805",
        timestamp: "2026-09-25T12:50:00+08:00",
        exactTime: "Sep 25, 2026 · 12:50 PM",
        role: "Admin",
        actorId: "ADMIN-01",
        user: "ADMIN (Limuel)",
        action: "Updated payment status to On Time for APP-1050",
        record: "APP-1050",
        recordType: "Payment",
        details: { paymentStatus: "On Time", previousStatus: "Due Soon" }
      },
      {
        id: "ACT-806",
        timestamp: "2026-09-25T11:50:00+08:00",
        exactTime: "Sep 25, 2026 · 11:50 AM",
        role: "Installer",
        actorId: "INS-004",
        user: "INS-004 (GreenVolt)",
        action: "Flagged installation delay on JOB-304 due to utility permit",
        record: "JOB-304",
        recordType: "Installation",
        details: { delayCategory: "Permit Approval", reason: "Utility bi-directional meter calibration backlog" }
      },
      {
        id: "ACT-807",
        timestamp: "2026-09-25T10:50:00+08:00",
        exactTime: "Sep 25, 2026 · 10:50 AM",
        role: "Merchant",
        actorId: "MER-019",
        user: "MER-019 (SolarHub)",
        action: "Submitted bill of materials for APP-1050",
        record: "MER-019",
        recordType: "Merchant Account",
        details: { documentType: "Bill of Materials", lineItems: 14 }
      },
      {
        id: "ACT-808",
        timestamp: "2026-09-24T16:15:00+08:00",
        exactTime: "Sep 24, 2026 · 4:15 PM",
        role: "Financer",
        actorId: "FIN-002",
        user: "FIN-002 (BDO)",
        action: "Declined APP-1089 due to debt ratio requirements",
        record: "APP-1089",
        recordType: "Application",
        details: { decision: "Declined", reason: "Debt-to-income ratio exceeds regulatory threshold" }
      },
      {
        id: "ACT-809",
        timestamp: "2026-09-24T11:30:00+08:00",
        exactTime: "Sep 24, 2026 · 11:30 AM",
        role: "Customer",
        actorId: "CUS-1007",
        user: "CUS-1007 (Roberto Santos)",
        action: "Settled final monthly amortization for APP-1070",
        record: "APP-1070",
        recordType: "Payment",
        details: { amount: 3600, scheduleRef: "PAY-1070-FINAL", paymentStatus: "Completed" }
      },
      {
        id: "ACT-810",
        timestamp: "2026-09-23T09:45:00+08:00",
        exactTime: "Sep 23, 2026 · 9:45 AM",
        role: "Admin",
        actorId: "ADMIN-01",
        user: "ADMIN (Limuel)",
        action: "Deactivated inactive installer account INS-005",
        record: "INS-005",
        recordType: "Installer Account",
        details: { accountType: "Installer", previousStatus: "Active", newStatus: "Inactive" }
      },
      {
        id: "ACT-811",
        timestamp: "2026-09-25T10:15:00+08:00",
        exactTime: "Sep 25, 2026 · 10:15 AM",
        role: "Admin",
        actorId: "ADMIN-01",
        user: "ADMIN (Limuel)",
        action: "Assigned high-priority support ticket SUP-044 to ADMIN (Limuel)",
        record: "SUP-044",
        recordType: "Support Ticket",
        details: { priority: "High", assignedTo: "ADMIN (Limuel)", ticketId: "SUP-044" }
      },
      {
        id: "ACT-812",
        timestamp: "2026-09-24T14:40:00+08:00",
        exactTime: "Sep 24, 2026 · 2:40 PM",
        role: "Merchant",
        actorId: "MER-021",
        user: "MER-021 (SolarTech Supply Corp)",
        action: "Dispatched tier-1 inverter and photovoltaic hardware for JOB-302",
        record: "MER-021",
        recordType: "Merchant Account",
        details: { inventoryDispatched: "Growatt 5kW Hybrid Inverter", linkedJob: "JOB-302" }
      }
    ],

    inquiries: [
      {
        id: "INQ-201",
        name: "Engr. Marco Villanueva",
        email: "marco.villanueva@megawide.ph",
        phone: "+63 917 554 1290",
        location: "Cebu City",
        category: "Commercial Solar",
        package: "Custom Commercial (30 kW Grid-Tied)",
        selectedSolarModel: "Custom Commercial (30 kW Grid-Tied)",
        electricBill: "₱65,000",
        paymentPreference: "Installment",
        customerResponse: "Awaiting Response",
        inquiryStatus: "Awaiting Response",
        confirmationToken: "token_inq201_m4rc0",
        confirmationEmailSentAt: "2026-09-28T17:25:00+08:00",
        subject: "Commercial Rooftop Solar for Warehouse (30 kW)",
        message: "Good day Hello Solar team, we operate a 450 sqm distribution warehouse in Mandaue and our average monthly VECO electric bill is around ₱65,000. Would like to inquire about a 30kW solar PV installation with net metering. Does your financer network support corporate commercial loans?",
        status: "Unread",
        timestamp: "2026-09-28T17:20:00+08:00",
        submitted: "45 mins ago",
        reply: null
      },
      {
        id: "INQ-202",
        name: "Beatrice Morales",
        email: "bea.morales@gmail.com",
        phone: "+63 920 331 4455",
        location: "Lapu-Lapu City",
        category: "Residential Solar",
        package: "HS 6 LITE — 4.96kW | 6kW | 4.8kWh",
        selectedSolarModel: "HS 6 LITE — 4.96kW | 6kW | 4.8kWh",
        electricBill: "₱11,000",
        paymentPreference: "Full Payment",
        customerResponse: "Proceed",
        inquiryStatus: "Proceed",
        confirmationToken: "token_inq202_b34tr1c3",
        confirmationEmailSentAt: "2026-09-28T16:10:00+08:00",
        subject: "HS 6 Lite Residential System Inquiry",
        message: "Hi, I am interested in the HS 6 Lite package for our two-storey residence. Current electric bill is ₱11,000/month. How fast can your team schedule a site inspection in Lapu-Lapu?",
        status: "Unread",
        timestamp: "2026-09-28T16:05:00+08:00",
        submitted: "2 hours ago",
        reply: null
      },
      {
        id: "INQ-203",
        name: "Dr. Lucille Santos",
        email: "lucille.santos@chonghua.com.ph",
        phone: "+63 915 678 1234",
        location: "Mandaue City",
        category: "Battery Storage",
        package: "Battery Retrofit (5kWh LFP Storage)",
        selectedSolarModel: "Battery Retrofit (5kWh LFP Storage)",
        electricBill: "₱14,500",
        paymentPreference: "Installment",
        customerResponse: "Awaiting Response",
        inquiryStatus: "Not Sent",
        confirmationToken: "token_inq203_luc1ll3",
        confirmationEmailSentAt: null,
        subject: "Battery Storage Addition to Existing System",
        message: "We currently experience frequent power fluctuations and brownouts during typhoon season. Can we integrate a 5kWh or 10kWh lithium battery backup into our existing grid-tied solar setup?",
        status: "Unread",
        timestamp: "2026-09-28T14:40:00+08:00",
        submitted: "3.5 hours ago",
        reply: null
      },
      {
        id: "INQ-204",
        name: "Atty. Carlos Gonzaga",
        email: "c.gonzaga@gonzagalaw.com",
        phone: "+63 918 890 2211",
        location: "Quezon City",
        category: "Financing Options",
        package: "HS 10 PRO — 10kW Hybrid",
        selectedSolarModel: "HS 10 PRO — 10kW Hybrid",
        electricBill: "₱18,000",
        paymentPreference: "Installment",
        customerResponse: "Proceed",
        inquiryStatus: "Proceed",
        confirmationToken: "token_inq204_c4rl0s",
        confirmationEmailSentAt: "2026-09-27T10:20:00+08:00",
        subject: "Financing Terms & Zero Cash-Out Eligibility",
        message: "Hello, what are the documentary requirements for BDO or UnionBank financing for the 10kW hybrid system? Can business owners apply using audited ITR and corporate bank statements?",
        status: "Replied",
        timestamp: "2026-09-27T10:15:00+08:00",
        submitted: "Yesterday",
        reply: {
          repliedAt: "Sep 27, 2026 · 11:30 AM",
          repliedBy: "ADMIN (Limuel)",
          replyNote: "Emailed complete checklist for BDO Green Energy and UnionBank Solar programs. CC'd customer relations desk."
        }
      },
      {
        id: "INQ-205",
        name: "Dante Valderrama",
        email: "dante.valderrama@solarpowercebu.com",
        phone: "+63 922 711 0022",
        location: "Talisay City",
        category: "Partnership",
        package: "Installer Partner Network",
        selectedSolarModel: "Installer Partner Network",
        electricBill: "₱9,000",
        paymentPreference: "Full Payment",
        customerResponse: "Not Proceed",
        inquiryStatus: "Not Proceeding",
        confirmationToken: "token_inq205_d4nt3",
        confirmationEmailSentAt: "2026-09-27T08:50:00+08:00",
        subject: "Installer Partner Program Application",
        message: "Good day, our contracting firm has 6 certified electrical engineers and TESDA-accredited solar installers. We would like to apply to be an accredited partner installer for Hello Solar in southern Cebu.",
        status: "Replied",
        timestamp: "2026-09-27T08:45:00+08:00",
        submitted: "Yesterday",
        reply: {
          repliedAt: "Sep 27, 2026 · 4:15 PM",
          repliedBy: "ADMIN (Limuel)",
          replyNote: "Forwarded Installer Partner onboarding packet, credentials verification form, and NDA."
        }
      },
      {
        id: "INQ-206",
        name: "Ramon Teves Jr.",
        email: "rteves@tevesfarms.ph",
        phone: "+63 917 220 9988",
        location: "Carcar City, Cebu",
        category: "Agricultural Solar",
        package: "Off-Grid Agricultural Pumping",
        selectedSolarModel: "Off-Grid Agricultural Pumping",
        electricBill: "₱25,000",
        paymentPreference: "Full Payment",
        customerResponse: "Proceed",
        inquiryStatus: "Proceed",
        confirmationToken: "token_inq206_r4m0n",
        confirmationEmailSentAt: "2026-09-26T11:15:00+08:00",
        subject: "Agricultural Solar Water Pumping System",
        message: "Inquiring if Hello Solar handles off-grid solar deep well water pump installations for agricultural poultry farms. Estimated pump requirement is 5HP submersible with remote telemetry.",
        status: "Replied",
        timestamp: "2026-09-26T11:00:00+08:00",
        submitted: "2 days ago",
        reply: {
          repliedAt: "Sep 26, 2026 · 2:00 PM",
          repliedBy: "ADMIN (Limuel)",
          replyNote: "Called Mr. Teves to gather pump head and flow rate specs. Assigned direct engineering lead for site survey."
        }
      },
      {
        id: "INQ-207",
        name: "Patricia Tan-Chua",
        email: "patricia.tanchua@yahoo.com",
        phone: "+63 919 443 8812",
        location: "Cebu City",
        category: "Residential Solar",
        package: "HS 8 PLUS — 8kW Hybrid",
        selectedSolarModel: "HS 8 PLUS — 8kW Hybrid",
        electricBill: "₱15,000",
        paymentPreference: "Installment",
        customerResponse: "Awaiting Response",
        inquiryStatus: "Not Sent",
        confirmationToken: "token_inq207_p4tr1c14",
        confirmationEmailSentAt: null,
        subject: "Net Metering Approval Timeline with VECO",
        message: "We want to install the 8kW system before year-end. How long does the VECO bi-directional net metering application usually take, and does Hello Solar handle the utility liaison?",
        status: "Unread",
        timestamp: "2026-09-28T11:20:00+08:00",
        submitted: "6 hours ago",
        reply: null
      },
      {
        id: "INQ-208",
        name: "Jose Maria Alcantara",
        email: "jm.alcantara@alcantaraproperties.com",
        phone: "+63 917 889 4433",
        location: "Pasig City",
        category: "Commercial Solar",
        package: "Commercial Solar Carport (50 kW)",
        selectedSolarModel: "Commercial Solar Carport (50 kW)",
        electricBill: "₱85,000",
        paymentPreference: "Installment",
        customerResponse: "Not Proceed",
        inquiryStatus: "Not Proceeding",
        confirmationToken: "token_inq208_j0s3",
        confirmationEmailSentAt: "2026-09-25T16:15:00+08:00",
        subject: "Solar Carport Structure for Commercial Plaza",
        message: "Requesting proposal for a 50kW solar canopy carport over a 24-slot parking area in Pasig. Please connect us with your corporate engineering team.",
        status: "Replied",
        timestamp: "2026-09-25T16:00:00+08:00",
        submitted: "3 days ago",
        reply: {
          repliedAt: "Sep 26, 2026 · 9:30 AM",
          repliedBy: "ADMIN (Limuel)",
          replyNote: "Sent preliminary solar canopy design deck and scheduled introductory Zoom call."
        }
      }
    ],

    settings: {
      companyName: "Hello Solar Philippines",
      timezone: "Philippine Standard Time (GMT+8)",
      currency: "PHP (₱)",
      contactEmail: "admin@hellosolar.ph",
      directInstallTeam: "Hello Solar Internal Team",
      maxDirectProjects: 12,
      directInstallConfirmation: true,
      overdueThresholdDays: 5,
      installationDelayThresholdDays: 1,
      docReviewEscalationHours: 48,
      autoNotifyInstallers: true
    }
  };

  // Shared installment schedules for the portal demo systems (billing the Customer portal shows for these APPs).
  // rows: [dueDate, status, reference] for billed periods; later installments continue monthly to the term.
  function buildSeedSchedule(appId, monthly, termMonths, rows) {
    const addMonths = (iso, n) => {
      const [y, m, d] = iso.split("-").map(Number);
      const t = (m - 1) + n;
      const yy = y + Math.floor(t / 12), mm = (t % 12) + 1;
      const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
      return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
    };
    const installments = [];
    const history = [];
    for (let no = 1; no <= termMonths; no++) {
      const row = rows[no - 1];
      const dueDate = row ? row[0] : addMonths(rows[rows.length - 1][0], no - rows.length);
      const status = row ? row[1] : "Upcoming";
      const paid = status === "Paid";
      installments.push({
        no, dueDate, amount: monthly, status,
        paidDate: paid ? dueDate : null,
        paidAmount: paid ? monthly : 0,
        reference: paid ? row[2] : null,
        notes: paid ? "Monthly installment verified." : (status === "Overdue" ? "Scheduled payment date passed without required payment." : "")
      });
      if (paid) {
        history.unshift({
          id: `PAY-${appId}-${no}`, appId, date: dueDate, amount: monthly, method: "Bank Transfer", ref: row[2],
          status: "Verified", recordedBy: "ADMIN (Limuel)", installmentNo: no, notes: "Installment receipt verified."
        });
      }
    }
    return { appId, termMonths, seeded: true, installments, history };
  }

  // Seeded systems: fixed monthly payment; the months to pay follow from the loan and the funder's yearly rate
  function seedSchedule(appId, monthly, rows) {
    const app = DEFAULT_DATA.applications.find(a => a.id === appId) || {};
    const funder = DEFAULT_DATA.financers.find(f => f.id === app.financerId || f.name === app.financer) || {};
    const rate = app.interestRate ?? funder.annualRate;
    const term = loanTermMonths(app.amount, rate, monthly) || 60;
    const sched = buildSeedSchedule(appId, monthly, term, rows);
    const last = sched.installments[sched.installments.length - 1];
    if (last && last.status !== "Paid") last.amount = loanLastPayment(app.amount, rate, monthly, term) || monthly;
    return sched;
  }

  DEFAULT_DATA.paymentSchedules = {
    "APP-4091": seedSchedule("APP-4091", 9066.67, [
      ["2026-05-01", "Paid", "REC-88219-05"], ["2026-06-01", "Paid", "REC-88219-06"], ["2026-07-01", "Paid", "REC-88219-07"],
      ["2026-08-01", "Paid", "REC-88219-08"], ["2026-09-01", "Paid", "REC-88219-09"], ["2026-10-15", "Upcoming"]]),
    "APP-4088": seedSchedule("APP-4088", 17450, [
      ["2026-06-20", "Paid", "REC-94021-06"], ["2026-07-20", "Paid", "REC-94021-07"], ["2026-08-20", "Paid", "REC-94021-08"],
      ["2026-09-20", "Paid", "REC-94021-09"], ["2026-10-20", "Upcoming"]]),
    "APP-4085": seedSchedule("APP-4085", 6200, [
      ["2026-06-30", "Paid", "REC-77310-06"], ["2026-07-30", "Paid", "REC-77310-07"], ["2026-08-30", "Overdue"], ["2026-09-30", "Upcoming"]]),
    "APP-4072": seedSchedule("APP-4072", 12800, [
      ["2026-09-25", "Paid", "REC-55201-09"], ["2026-10-25", "Upcoming"]])
  };

  function parseActivityDate(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) {
      return isNaN(dateInput.getTime()) ? null : dateInput;
    }
    if (typeof dateInput === "string") {
      // Strip middle dots or bullets if present: "Sep 25, 2026 · 2:38 PM"
      const cleaned = dateInput.replace(/[·•]/g, " ").replace(/\s+/g, " ").trim();
      const dCleaned = new Date(cleaned);
      if (!isNaN(dCleaned.getTime())) return dCleaned;

      const dDirect = new Date(dateInput);
      if (!isNaN(dDirect.getTime())) return dDirect;
    }
    return null;
  }

  function formatExactAuditTimestamp(dateInput) {
    if (!dateInput) return "";
    const d = parseActivityDate(dateInput);
    if (!d) return String(dateInput);

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const m = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;

    return `${m} ${day}, ${year} · ${hours}:${minutes} ${ampm}`;
  }

  function formatRelativeAuditTime(dateInput, fromDate) {
    if (!dateInput) return null;
    const targetDate = parseActivityDate(dateInput);
    if (!targetDate) return null;

    const now = (fromDate instanceof Date && !isNaN(fromDate.getTime())) ? fromDate : new Date();
    const diffMs = now.getTime() - targetDate.getTime();

    // Clock skew / sub-minute grace period (up to 5 seconds drift)
    if (diffMs < 0 && diffMs >= -5000) {
      return "Just now";
    }
    // Future timestamp cannot be reliably represented as a past relative label
    if (diffMs < -5000) {
      return null;
    }

    const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 45) {
      return "Just now";
    }
    if (diffMinutes === 1) {
      return "1 min ago";
    }
    if (diffMinutes < 60) {
      return `${diffMinutes} mins ago`;
    }
    if (diffHours === 1) {
      return "1 hour ago";
    }
    if (diffHours < 24) {
      return `${diffHours} hours ago`;
    }
    if (diffDays === 1) {
      return "Yesterday";
    }
    if (diffDays < 7) {
      return `${diffDays} days ago`;
    }
    if (diffDays < 14) {
      return "1 week ago";
    }
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks} weeks ago`;
    }
    if (diffDays < 60) {
      return "1 month ago";
    }
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months} months ago`;
    }
    return "Over a year ago";
  }

  // Schema v3 (shared identity model): adds seed records missing from stored data by ID and backfills
  // HS IDs / installer links on stored seed records. Never overwrites a stored value.
  // Schema v4 (shared payment schedules): the portal demo systems' billing becomes their shared APP schedule.
  // A stored schedule is replaced only when it was auto-generated and no customer receipt has been applied to it.
  // Schema v5: applications a Financer approved while approval still set stage "Approved" move to
  // "Ready for Installation" (same as a new Financer approval). Only Financer decisions are moved, and only while
  // no installation has been assigned or started.
  const SCHEMA_VERSION = 7;
  // "Under Review" was renamed "Pending Finance" (Lifecycle Progression); older saved records still carry the old name
  function normalizeStageNames(data) {
    if (data && Array.isArray(data.applications)) {
      data.applications.forEach(a => { if (a && a.stage === "Under Review") a.stage = "Pending Finance"; });
    }
    return data;
  }

  function migrateSharedIdentity(parsed) {
    const version = parsed.schemaVersion || 0;
    if (version >= SCHEMA_VERSION) return false;
    if (version < 3) migrateIdentityV3(parsed);
    if (version < 4) {
      if (!parsed.paymentSchedules || typeof parsed.paymentSchedules !== "object") parsed.paymentSchedules = {};
      Object.keys(DEFAULT_DATA.paymentSchedules || {}).forEach(appId => {
        const stored = parsed.paymentSchedules[appId];
        const touched = stored && (stored.seeded || (stored.installments || []).some(i => /Customer receipt/.test(i.notes || "")));
        if (!touched) parsed.paymentSchedules[appId] = JSON.parse(JSON.stringify(DEFAULT_DATA.paymentSchedules[appId]));
      });
    }
    (parsed.applications || []).forEach(app => {
      const financerApproved = app.financingDecision && app.financingDecision.decision === "Approved";
      const active = /^ACTIVE$/i.test(String(app.systemStatus || "")) || /^ACTIVE$/i.test(String(app.applicationStatus || ""));
      const unassigned = !app.assignedInstallerId && (!app.installer || app.installer === "Unassigned");
      if (app.stage === "Approved" && financerApproved && !active && !app.installationStatus && unassigned) {
        app.stage = "Ready for Installation";
        app.financingStatus = "APPROVED";
        app.applicationStatus = "READY_FOR_INSTALLATION";
      }
    });
    if (version < 6) migrateSeedFixesV6(parsed);
    if (version < 7) {
      // v7: APP-4085's sample overdue bill is a full month back (the sample stays overdue on any demo day)
      const stored = parsed.paymentSchedules && parsed.paymentSchedules["APP-4085"];
      const original = stored && stored.installments && stored.installments[0] && stored.installments[0].dueDate === "2026-07-30" && !stored.demoDates;
      const touched = stored && (stored.installments || []).some(i => /Customer receipt/.test(i.notes || "") || (i.status === "Paid" && !/^REC-77310-/.test(i.reference || "")));
      if (original && !touched) parsed.paymentSchedules["APP-4085"] = JSON.parse(JSON.stringify(DEFAULT_DATA.paymentSchedules["APP-4085"]));
    }
    parsed.schemaVersion = SCHEMA_VERSION;
    return true;
  }

  // v6: seed data corrections (only records that still look like the original seed are touched)
  function migrateSeedFixesV6(parsed) {
    const jobs = Array.isArray(parsed.installations) ? parsed.installations : (parsed.installations = []);
    const seedJob = id => DEFAULT_DATA.installations.find(j => j.id === id);
    // Maintenance JOB-306 belonged to a system that was not installed yet → the completed APP-1070 system
    const j306 = jobs.find(j => j.id === "JOB-306");
    if (j306 && j306.appId === "APP-1102" && j306.installerType === "Maintenance") {
      const s = seedJob("JOB-306");
      Object.assign(j306, { appId: s.appId, customer: s.customer, location: s.location, system: s.system });
    }
    const j301 = jobs.find(j => j.id === "JOB-301");
    if (j301 && /^Tomorrow/i.test(String(j301.schedule || ""))) j301.schedule = seedJob("JOB-301").schedule;
    if (j301 && j301.progress === undefined && j301.status === "In Progress") j301.progress = seedJob("JOB-301").progress;
    jobs.forEach(j => { if (j.leadTech === "Engr. Limuel Brasona") j.leadTech = "Engr. Mark Dizon"; });
    (parsed.installers || []).forEach(i => { if (i.id === "INS-001" && i.contact === "Engr. Limuel Brasona") i.contact = "Engr. Mark Dizon"; });
    // The partner installation of APP-4085 (already in progress) gets its job record
    const app4085 = (parsed.applications || []).find(a => a.id === "APP-4085");
    if (app4085 && app4085.stage === "Installation" && !jobs.some(j => j.appId === "APP-4085")) {
      jobs.push(JSON.parse(JSON.stringify(seedJob("JOB-307"))));
    }
    if (parsed.settings && parsed.settings.directInstallTeam === "Hello Solar Central Operations (Team Alpha)") {
      parsed.settings.directInstallTeam = "Hello Solar Internal Team";
    }
    // Demo engineer / accounting accounts appear in Portal Accounts
    ["engineers", "accountants"].forEach(key => {
      if (!Array.isArray(parsed[key])) parsed[key] = [];
      DEFAULT_DATA[key].forEach(seed => {
        const taken = parsed[key].some(r => r.id === seed.id || String(r.email || "").toLowerCase() === seed.email);
        if (!taken) parsed[key].push(JSON.parse(JSON.stringify(seed)));
      });
    });
  }

  function migrateIdentityV3(parsed) {
    ["customers", "financers", "installers", "merchants", "applications"].forEach(key => {
      if (!Array.isArray(parsed[key])) parsed[key] = [];
      const stored = new Map(parsed[key].map(r => [r.id, r]));
      DEFAULT_DATA[key].forEach(seed => {
        const rec = stored.get(seed.id);
        if (!rec) {
          parsed[key].push(JSON.parse(JSON.stringify(seed)));
          return;
        }
        if (seed.hsId && !rec.hsId) rec.hsId = seed.hsId;
        // Only link the seed installer when the stored record still names the same installer
        if (seed.assignedInstallerId && !rec.assignedInstallerId && rec.installer === seed.installer) {
          rec.assignedInstallerId = seed.assignedInstallerId;
        }
      });
    });
  }

  // Seed records for local demo mode; an empty record set (same collections, default settings) otherwise
  const SEED_DATA = DEMO_DATA ? DEFAULT_DATA : Object.keys(DEFAULT_DATA).reduce((acc, key) => {
    const v = DEFAULT_DATA[key];
    acc[key] = key === "settings" || key === "schemaVersion" ? JSON.parse(JSON.stringify(v))
      : (Array.isArray(v) ? [] : (v && typeof v === "object" ? {} : v));
    return acc;
  }, {});

  class HelloSolarStore {
    constructor() {
      this.data = this.load();
      this.syncFinancerContracts({ silent: true });
      // Local mode: pick up Buy Now receipts on any page load so their accounts are created right away
      if (!IS_API && Array.isArray(this.data.inquiries)) {
        try { this.syncCustomerInquiries(); } catch (err) { console.warn("Could not import landing page inquiries:", err); }
      }
      if (!IS_API) {
        // Keep records consistent for every portal: stages follow installation jobs, declined apps are not billed,
        // funder loan counts are real and every installment schedule adds up to the loan plus interest.
        try {
          const snapshot = () => JSON.stringify([this.data.applications, this.data.paymentSchedules, this.data.financers, this.data.demoClock]);
          const before = snapshot();
          this._alignDemoDates();
          this.getApplications();
          Object.keys(this.data.paymentSchedules || {}).forEach(appId => {
            const app = (this.data.applications || []).find(a => a.id === appId);
            if (app) this._fitScheduleToLoan(app, this.data.paymentSchedules[appId]);
          });
          if (snapshot() !== before) this.save();
        } catch (err) { console.warn("Could not reconcile records:", err); }
      }
    }

    load() {
      if (IS_API) {
        // api mode: the page cache filled by GET /bootstrap — no seed data, no client migrations
        let cached = null;
        try { cached = JSON.parse(STORE.getItem(STORAGE_KEY) || "null"); } catch (err) { cached = null; }
        const empty = JSON.parse(JSON.stringify(SEED_DATA));
        return normalizeStageNames(Object.assign(empty, cached && typeof cached === "object" ? cached : {}));
      }
      try {
        const stored = STORE.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          // Simple integrity check
          if (parsed && Array.isArray(parsed.applications) && Array.isArray(parsed.customers)) {
            // Data integrity reconciliation
            const app1089 = parsed.applications.find(a => a.id === "APP-1089");
            if (app1089 && (app1089.nextDue === "N/A" || !app1089.nextDue)) {
              app1089.nextDue = "2026-09-08";
            }
            const app1031 = parsed.applications.find(a => a.id === "APP-1031");
            if (app1031 && app1031.nextDue === "2026-10-02") {
              app1031.nextDue = "2026-09-30";
            }
            if (!parsed.paymentSchedules) {
              parsed.paymentSchedules = {};
            }
            if (!Array.isArray(parsed.engineers)) {
              parsed.engineers = [];
            }
            // Financer contract fields: backfill from seed for stored data that predates contract management
            if (Array.isArray(parsed.financers)) {
              parsed.financers.forEach(f => {
                if (f.contractStartDate !== undefined) return;
                const seed = DEFAULT_DATA.financers.find(s => s.id === f.id) || {};
                f.contractTermMonths = seed.contractTermMonths ?? null;
                f.annualRate = seed.annualRate ?? null;
                f.contractStartDate = seed.contractStartDate ?? null;
                f.contractEndDate = seed.contractEndDate ?? null;
                f.contractStatusOverride = null;
              });
            }

            // Ensure activity log entries have exact timestamps and metadata
            if (Array.isArray(parsed.activity)) {
              // If stored activity is missing our new entries (SUP-044, MER-021), add them
              const hasSup044 = parsed.activity.some(a => a.record === "SUP-044");
              if (!hasSup044) {
                parsed.activity.push(
                  {
                    id: "ACT-811",
                    timestamp: "2026-09-25T10:15:00+08:00",
                    exactTime: "Sep 25, 2026 · 10:15 AM",
                    role: "Admin",
                    actorId: "ADMIN-01",
                    user: "ADMIN (Limuel)",
                    action: "Assigned high-priority support ticket SUP-044 to ADMIN (Limuel)",
                    record: "SUP-044",
                    recordType: "Support Ticket",
                    details: { priority: "High", assignedTo: "ADMIN (Limuel)", ticketId: "SUP-044" }
                  },
                  {
                    id: "ACT-812",
                    timestamp: "2026-09-24T14:40:00+08:00",
                    exactTime: "Sep 24, 2026 · 2:40 PM",
                    role: "Merchant",
                    actorId: "MER-021",
                    user: "MER-021 (SolarTech Supply Corp)",
                    action: "Dispatched tier-1 inverter and photovoltaic hardware for JOB-302",
                    record: "MER-021",
                    recordType: "Merchant Account",
                    details: { inventoryDispatched: "Growatt 5kW Hybrid Inverter", linkedJob: "JOB-302" }
                  }
                );
              }

              parsed.activity.forEach((a, idx) => {
                // Delete any stale hardcoded relative times so timestamp remains single source of truth
                delete a.time;

                if (!a.timestamp) {
                  const seedMatch = DEFAULT_DATA.activity.find(s => s.id === a.id);
                  if (seedMatch && seedMatch.timestamp) {
                    a.timestamp = seedMatch.timestamp;
                    a.exactTime = seedMatch.exactTime;
                    a.details = seedMatch.details;
                  } else {
                    const d = new Date();
                    d.setHours(d.getHours() - idx);
                    a.timestamp = d.toISOString();
                    a.exactTime = formatExactAuditTimestamp(d);
                  }
                }
                if (!a.exactTime) {
                  a.exactTime = formatExactAuditTimestamp(a.timestamp);
                }
                if (!a.recordType && a.record) {
                  if (a.record.startsWith("APP-")) a.recordType = "Application";
                  else if (a.record.startsWith("JOB-")) a.recordType = "Installation";
                  else if (a.record.startsWith("SUP-") || a.record.startsWith("TIC-")) a.recordType = "Support Ticket";
                  else if (a.record.startsWith("PAY-")) a.recordType = "Payment";
                  else if (a.record.startsWith("CUS-")) a.recordType = "Customer Account";
                  else if (a.record.startsWith("FIN-")) a.recordType = "Financer Account";
                  else if (a.record.startsWith("INS-")) a.recordType = "Installer Account";
                  else if (a.record.startsWith("MER-")) a.recordType = "Merchant Account";
                  else if (a.record === "SETTINGS") a.recordType = "System Settings";
                  else a.recordType = "Record";
                }
                if (!a.actorId) {
                  const idMatch = (a.user || "").match(/([A-Z]{3}-\d+|ADMIN(-\d+)?)/i);
                  a.actorId = idMatch ? idMatch[0] : (a.role === "Admin" ? "ADMIN-01" : a.role);
                }
                if (!a.details) {
                  a.details = {};
                }
              });
            } else {
              parsed.activity = JSON.parse(JSON.stringify(SEED_DATA.activity));
            }

            if (!Array.isArray(parsed.inquiries) || !parsed.inquiries.length) {
              parsed.inquiries = JSON.parse(JSON.stringify(SEED_DATA.inquiries || []));
            } else {
              const defaultMap = new Map((DEFAULT_DATA.inquiries || []).map(i => [i.id, i]));
              parsed.inquiries.forEach(inq => {
                const def = defaultMap.get(inq.id) || {};
                if (!inq.selectedSolarModel) inq.selectedSolarModel = def.selectedSolarModel || inq.package || "Custom Solar Package";
                if (!inq.electricBill) {
                  const billMatch = inq.message && inq.message.match(/₱[\d,]+/);
                  inq.electricBill = def.electricBill || (billMatch ? billMatch[0] : (inq.monthlyBill || "₱12,000"));
                }
                if (!inq.paymentPreference) {
                  inq.paymentPreference = def.paymentPreference || (/loan|financ|terms|zero/i.test(inq.message || "") ? "Installment" : "Full Payment");
                }
                if (!inq.customerResponse) {
                  inq.customerResponse = def.customerResponse || (inq.status === "Unread" ? "Awaiting Response" : "Proceed");
                }
                if (!inq.inquiryStatus) {
                  if (inq.customerResponse === "Proceed") inq.inquiryStatus = "Proceed";
                  else if (inq.customerResponse === "Not Proceed" || inq.customerResponse === "Not Proceeding") inq.inquiryStatus = "Not Proceeding";
                  else if (def.inquiryStatus) inq.inquiryStatus = def.inquiryStatus;
                  else if (inq.confirmationEmailSentAt) inq.inquiryStatus = "Awaiting Response";
                  else inq.inquiryStatus = "Not Sent";
                }
                if (inq.confirmationEmailSentAt === undefined) {
                  inq.confirmationEmailSentAt = def.confirmationEmailSentAt || null;
                }
              });
            }

            if (Array.isArray(parsed.customers)) {
              parsed.customers.forEach(c => {
                if (!c.invitationStatus) {
                  c.invitationStatus = c.status === "Active" ? "Active" : "Pending Activation";
                }
              });
            }

            normalizeStageNames(parsed);

            if (DEMO_DATA && migrateSharedIdentity(parsed)) {
              try { STORE.setItem(STORAGE_KEY, JSON.stringify(parsed)); } catch (err) { /* persisted on next save */ }
            }
            return parsed;
          }
        }
      } catch (err) {
        console.warn("Could not load from localStorage, using seed data:", err);
      }
      return JSON.parse(JSON.stringify(SEED_DATA));
    }

    save() {
      try {
        STORE.setItem(STORAGE_KEY, JSON.stringify(this.data));
      } catch (err) {
        console.warn("Could not save to localStorage:", err);
      }
    }

    // Platform settings (Super Admin → Settings)
    updateSettings(settings) {
      this.data.settings = Object.assign({}, settings || {});
      this.save();
      return { success: true, settings: this.data.settings };
    }

    reset() {
      if (IS_API) return; // demo reset is a local-mode tool only
      this.data = JSON.parse(JSON.stringify(SEED_DATA));
      this.save();
    }

    // --- ACTIVITY LOG HELPER ---
    logActivity(role, user, action, record, options = {}) {
      const now = new Date();

      let actorId = options.actorId;
      if (!actorId) {
        const idMatch = (user || "").match(/([A-Z]{3}-\d+|ADMIN(-\d+)?)/i);
        actorId = idMatch ? idMatch[0] : (role === "Admin" ? "ADMIN-01" : role);
      }

      let recordType = options.recordType;
      if (!recordType && record) {
        if (record.startsWith("APP-")) recordType = "Application";
        else if (record.startsWith("JOB-")) recordType = "Installation";
        else if (record.startsWith("SUP-") || record.startsWith("TIC-")) recordType = "Support Ticket";
        else if (record.startsWith("PAY-")) recordType = "Payment";
        else if (record.startsWith("CUS-")) recordType = "Customer Account";
        else if (record.startsWith("FIN-")) recordType = "Financer Account";
        else if (record.startsWith("INS-")) recordType = "Installer Account";
        else if (record.startsWith("ENG-")) recordType = "Engineer Account";
        else if (record.startsWith("MER-")) recordType = "Merchant Account";
        else if (record === "SETTINGS") recordType = "System Settings";
        else recordType = "Record";
      }

      const isoTimestamp = options.timestamp || now.toISOString();
      const exactTime = options.exactTime || formatExactAuditTimestamp(now);

      const nextNum = Math.floor(813 + Math.random() * 900);
      const entry = {
        id: options.id || `ACT-${nextNum}`,
        timestamp: isoTimestamp,
        exactTime: exactTime,
        actorId: actorId,
        role: role,
        user: user,
        action: action,
        record: record,
        recordId: record,
        recordType: recordType || "Record",
        details: options.details || {}
      };
      this.data.activity.unshift(entry);
      if (!options.deferSave) this.save();
      return entry;
    }

    // --- HELLO SOLAR DIRECT INSTALLATION WORKFLOW ---
    // Documents gate: financing approval and installer assignment need every required document and the
    // Accepted signed agreement (checked by the shared data layer; skipped where it is not loaded)
    documentsGate(app) {
      const S = typeof window !== "undefined" ? window.HSShared : null;
      if (!app || !S || typeof S.applicationDocsComplete !== "function") return { ok: true, missing: [], message: "" };
      const res = S.applicationDocsComplete(app.id);
      return { ...res, message: res.ok ? "" : `Complete the documents first. Still needed: ${res.missing.join(", ")}.` };
    }

    // Same gate for an installation job (maintenance jobs are not installations and are never blocked)
    installationDocumentsGate(job) {
      if (!job || job.installerType === "Maintenance") return { ok: true, missing: [], message: "" };
      const app = (this.data.applications || []).find(a => a.id === job.appId);
      if (!app) return { ok: true, missing: [], message: "" };
      const gate = this.documentsGate(app);
      return gate.ok ? gate : { ...gate, message: `${app.id} cannot be scheduled or installed yet. ${gate.message}` };
    }

    acceptDirectInstallation(appId) {
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return { success: false, message: "Application not found" };
      const docGate = this.documentsGate(app);
      if (!docGate.ok) return { success: false, documentsMissing: docGate.missing, message: docGate.message, error: docGate.message };

      // Enforce configured Maximum Concurrent Direct Projects limit
      const limit = Number(this.data.settings?.maxDirectProjects) || 12;
      const designatedTeam = this.data.settings?.directInstallTeam || "Hello Solar Internal Team";

      // Count currently active Direct projects
      const activeDirectCount = this.data.installations.filter(j => 
        (j.installerType === "Hello Solar Direct" || j.installer === designatedTeam || j.installer === "Hello Solar Internal Team") &&
        !["Completed", "Cancelled"].includes(j.status)
      ).length;

      if (activeDirectCount >= limit) {
        return {
          success: false,
          capacityReached: true,
          currentActive: activeDirectCount,
          limit: limit,
          message: `Direct installation capacity reached (${activeDirectCount}/${limit} active projects). Complete existing direct projects before accepting more.`
        };
      }

      // Update Application (internal team — never offered to partner installers)
      app.installerType = "Hello Solar Direct";
      app.installer = designatedTeam;
      app.assignedInstallerId = "INS-001";
      app.stage = "Ready for Installation";
      app.updated = "Just now";
      app.notes = (app.notes ? app.notes + " • " : "") + `Accepted for Hello Solar Direct Installation by Super Admin (${designatedTeam}).`;

      // Ensure corresponding installation exists or update it
      let install = this.data.installations.find(j => j.appId === appId);
      if (install) {
        install.installer = designatedTeam;
        install.installerType = "Hello Solar Direct";
        install.leadTech = "Unassigned";
        install.status = "Ready";
        install.schedule = "Pending Schedule";
        install.notes = `Reassigned to ${designatedTeam} for Direct Installation.`;
      } else {
        const nextJobNum = 308 + this.data.installations.length;
        install = {
          id: `JOB-${nextJobNum}`,
          appId: app.id,
          customer: app.customer,
          location: app.location,
          system: app.system,
          installer: designatedTeam,
          installerType: "Hello Solar Direct",
          status: "Ready",
          schedule: "Pending Schedule",
          leadTech: "Unassigned",
          notes: `Scheduled via Hello Solar Direct acceptance. Designated unit: ${designatedTeam}.`
        };
        this.data.installations.unshift(install);
      }

      // Synchronize all installer activeJobs counts
      this.data.installers.forEach(inst => {
        inst.activeJobs = this.data.installations.filter(j => 
          (j.installer === inst.name || (inst.id === "INS-001" && (j.installerType === "Hello Solar Direct" || j.installer === designatedTeam))) &&
          !["Completed", "Cancelled"].includes(j.status)
        ).length;
      });

      // Log in audit log
      this.logActivity("Admin", "ADMIN (Limuel)", `ADMIN accepted ${appId} for Hello Solar Direct Installation`, appId, {
        actorId: "ADMIN-01",
        recordType: "Application",
        details: { installer: designatedTeam, installerType: "Hello Solar Direct", targetJob: install.id, activeCapacity: `${activeDirectCount + 1}/${limit}` }
      });

      this.save();
      return { success: true, app, install };
    }

    // --- APPLICATION WORKFLOWS ---
    updateApplicationStage(appId, newStage, options = {}) {
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return false;
      const prevStage = app.stage;
      app.stage = newStage;
      app.updated = "Just now";

      let actorRole = options.role || "Admin";
      let actorUser = options.user || "ADMIN (Limuel)";
      let actorId = options.actorId || "ADMIN-01";
      let actionText = `ADMIN updated stage for ${appId} from "${prevStage}" to "${newStage}"`;

      if (newStage === "Approved") {
        actorRole = "Financer";
        actorUser = app.financer || "FIN-001 (SunFund)";
        actorId = app.financerId || (app.financer.includes("SunFund") ? "FIN-001" : "FIN-002");
        actionText = `Financing credit check approved for ${appId} (${app.customer}) · ₱${app.amount?.toLocaleString() || app.amount}`;
      } else if (newStage === "Declined") {
        actorRole = "Financer";
        actorUser = app.financer || "FIN-002 (BDO)";
        actorId = app.financerId || "FIN-002";
        actionText = `Financing declined for ${appId} (${app.customer}) · Stage set to Declined`;
      }

      this.logActivity(actorRole, actorUser, actionText, appId, {
        actorId,
        recordType: "Application",
        details: { prevStage, newStage, customer: app.customer, ...options.details }
      });
      this.save();
      return true;
    }

    // --- PARTNER INSTALLER ASSIGNMENT WORKFLOW ---
    // Only Active partner installer accounts can be assigned. Hello Solar Direct / internal team accounts and
    // Direct Installation Engineers (data.engineers) are never partner installers.
    isAssignablePartnerInstaller(inst) {
      if (!inst || inst.status !== "Active") return false;
      if (String(inst.type || "").toLowerCase() !== "partner") return false;
      const direct = this.data.settings?.directInstallTeam || "Hello Solar Internal Team";
      return inst.id !== "INS-001" && inst.name !== direct && !/hello solar (direct|internal)/i.test(inst.name || "");
    }

    getAssignablePartnerInstallers() {
      return (this.data.installers || []).filter(i => this.isAssignablePartnerInstaller(i));
    }

    // installerRef: installer account ID (INS-###); an exact account name is accepted for older callers
    assignPartnerInstaller(appId, installerRef, schedule = "Within 5 business days") {
      this.data = this.load();
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return { success: false, message: "Application not found", error: "Application not found" };

      // Link by installer account ID so only that partner installer sees the job
      const partner = (this.data.installers || []).find(i => i.id === installerRef)
        || (this.data.installers || []).find(i => i.name === installerRef);
      if (!partner) return { success: false, message: "Installer not found", error: "Installer account not found." };
      const docGate = this.documentsGate(app);
      if (!docGate.ok) return { success: false, documentsMissing: docGate.missing, message: docGate.message, error: docGate.message };
      if (!this.isAssignablePartnerInstaller(partner)) {
        const error = `${partner.name} (${partner.id}) is not an active partner installer and cannot be assigned.`;
        return { success: false, message: error, error };
      }
      const installerName = partner.name;
      app.installer = installerName;
      app.assignedInstallerId = partner.id;
      // An explicit assignment re-offers the job to an installer that declined it earlier
      if (Array.isArray(app.declinedInstallerIds)) app.declinedInstallerIds = app.declinedInstallerIds.filter(id => id !== partner.id);
      app.installerType = "Partner Installer";
      app.dispatchStatus = "Assigned";
      // The assigned partner installer must Accept or Decline in the Installer portal before starting
      if (!["INSTALLATION_IN_PROGRESS", "COMPLETED"].includes(String(app.installationStatus || "").toUpperCase())) {
        app.installerAcceptance = "Pending";
        app.installationStatus = null;
        delete app.acceptedAt;
      }
      app.stage = "Ready for Installation";
      app.updated = "Just now";
      app.notes = (app.notes ? app.notes + " • " : "") + `Assigned to partner installer ${installerName}.`;

      let install = this.data.installations.find(j => j.appId === appId);
      if (install) {
        install.installer = installerName;
        install.installerId = partner.id;
        install.installerType = "Partner Installer";
        install.leadTech = "Partner Lead Technician";
        install.schedule = schedule;
        if (install.status === "Delayed" || install.status === "Scheduled") {
          install.status = "Scheduled";
        }
        install.notes = `Assigned to ${installerName}.`;
      } else {
        const nextJobNum = 308 + this.data.installations.length;
        install = {
          id: `JOB-${nextJobNum}`,
          appId: app.id,
          customer: app.customer,
          location: app.location,
          system: app.system,
          installer: installerName,
          installerId: partner.id,
          installerType: "Partner Installer",
          status: "Scheduled",
          schedule: schedule,
          leadTech: "Partner Lead Technician",
          notes: `Assigned to partner installer ${installerName} by Super Admin.`
        };
        this.data.installations.unshift(install);
      }

      // Synchronize all installer activeJobs counts
      this.data.installers.forEach(inst => {
        inst.activeJobs = this.data.installations.filter(j => 
          (j.installerId === inst.id || j.installer === inst.name || (inst.id === "INS-001" && j.installerType === "Hello Solar Direct")) &&
          !["Completed", "Cancelled"].includes(j.status)
        ).length;
      });

      this.logActivity("Admin", "ADMIN (Limuel)", `ADMIN assigned partner installer "${installerName}" (${partner.id}) to ${appId}`, appId, {
        actorId: "ADMIN-01",
        recordType: "Application",
        details: { installer: installerName, assignedInstallerId: partner.id, installerType: "Partner Installer", schedule }
      });
      this.save();
      if (typeof window !== "undefined" && window.HSShared) {
        window.HSShared.notify({
          recipientRole: "installer", recipientId: partner.id, eventType: "job_assigned", recordId: appId,
          title: "New Installation Job", message: `${appId} (${app.customer}) was assigned to you · ${schedule}.`,
          targetUrl: `myjob.html?job=${appId}`, actionLabel: "View Job"
        });
      }
      return { success: true, app, install, installer: partner };
    }

    // --- APPLICATION DOCUMENT HELPERS ---
    // Customer uploads (Customer portal) live in a shared store keyed by APP ID — files stay out of this store
    readSharedDocuments(appId) {
      try {
        const store = JSON.parse(STORE.getItem(SHARED_DOCUMENTS_KEY) || "{}") || {};
        return store[appId] && Array.isArray(store[appId].documents) ? store[appId] : null;
      } catch (e) { return null; }
    }

    // The documents listed in Super Admin › Details › Documents are exactly the ones on the customer's
    // Documents page, with the same names, order and statuses:
    //  - Full Payment: the signed Full Payment Agreement
    //  - Installment: the signed Installment Agreement, then the Required Documents (shared APP document record,
    //    the same record the Financer reviews). "If applicable" documents are listed but not counted.
    // name = record name (used to review a document), label = the name the customer sees.
    getAppDocuments(appId) {
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return [];
      const S = typeof window !== "undefined" ? window.HSShared : null;
      const ag = S && S.agreementFor ? S.agreementFor(app) : null;
      const base = this._baseAppDocuments(appId);
      if (!ag) return base;
      const LABEL = { NOT_SUBMITTED: "Missing", SUBMITTED: "Submitted", ACCEPTED: "Verified", REUPLOAD_REQUIRED: "Rejected" };
      const CUSTOMER_LABEL = { NOT_SUBMITTED: "Not Submitted", SUBMITTED: "Submitted", ACCEPTED: "Accepted", REUPLOAD_REQUIRED: "Re-upload Required" };
      return [{
        name: `Signed ${ag.title}`,
        label: ag.title,
        status: LABEL[ag.status] || "Missing",
        statusLabel: CUSTOMER_LABEL[ag.status] || "Not Submitted",
        date: ag.uploadedAt ? String(ag.uploadedAt).slice(0, 10) : null,
        file: ag.fileName || null,
        isAgreement: true
      }].concat(base);
    }

    _baseAppDocuments(appId) {
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return [];
      const S = typeof window !== "undefined" ? window.HSShared : null;
      // Full Payment and Installment customers send the same documents (shared record)
      const shared = S ? S.documentRecordFor(appId) : this.readSharedDocuments(appId);
      if (!shared) return S ? [] : (Array.isArray(app.documents) ? app.documents : []);
      // Same short names the customer sees (Hello_Solar_Customer/js/required-documents.js)
      const DISPLAY_NAME = {
        valid_id_1: "Valid ID #1 (front & back)",
        valid_id_2: "Valid ID #2 (front & back)",
        income_proof: "Payslips (3 months) or Bank Statement",
        residence_proof: "Proof of Home Ownership or Lease",
        proof_of_billing: "Proof of Billing",
        other_requested: "Other Document",
        site_photos: "Site Photos (Roof & Neighborhood)",
        site_map_link: "Google Maps Link of House / Site",
        gov_id_back: "Government ID Back (older upload)",
        proof_of_income: "Proof of Income (older upload)",
        bank_statement: "Bank Statement (older upload)"
      };
      const LABEL = { NOT_SUBMITTED: "Missing", SUBMITTED: "Submitted", UNDER_REVIEW: "Submitted", ACCEPTED: "Verified", REUPLOAD_REQUIRED: "Rejected" };
      const CUSTOMER_LABEL = { NOT_SUBMITTED: "Not Submitted", SUBMITTED: "Submitted", UNDER_REVIEW: "Under Review", ACCEPTED: "Accepted", REUPLOAD_REQUIRED: "Re-upload Required" };
      return shared.documents.map(d => {
        const st = String(d.status).toUpperCase();
        return {
          id: d.id,
          name: d.name,
          label: DISPLAY_NAME[d.id] || d.name,
          optional: !!d.optional,
          notRequired: !!d.notRequired,
          waived: d.waived || null,
          requested: !!d.requested,
          requestNote: d.requestNote || "",
          status: LABEL[st] || "Missing",
          statusLabel: d.notRequired ? "Not Required" : (CUSTOMER_LABEL[st] || "Not Submitted"),
          date: d.uploadedAt ? String(d.uploadedAt).slice(0, 10) : null,
          file: d.fileName || null,
          link: d.kind === "link" && /^https?:\/\//i.test(d.link || "") ? d.link : null,
          note: d.note || ""
        };
      });
    }

    // Counts for required documents only ("If applicable" documents are not counted). submitted = Submitted + Verified.
    getAppDocumentCounts(appId) {
      const docs = this.getAppDocuments(appId).filter(d => !d.optional);
      const submitted = docs.filter(d => d.status === "Verified" || d.status === "Submitted").length;
      const verified = docs.filter(d => d.status === "Verified").length;
      const missing = docs.filter(d => d.status === "Missing" || d.status === "Rejected");
      return { total: docs.length, submitted, verified, missing, label: `${submitted}/${docs.length}` };
    }

    updateDocumentStatus(appId, docName, newStatus) {
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return false;
      // The verdict is written only to the shared APP document record (Full Payment and Installment)
      const S = typeof window !== "undefined" ? window.HSShared : null;
      if (S) {
        const STATUS = { Verified: "ACCEPTED", Rejected: "REUPLOAD_REQUIRED", Missing: "NOT_SUBMITTED", Submitted: "SUBMITTED" };
        const before = (S.documentRecordFor(appId)?.documents || []).find(d => d.name === docName);
        if (!before || !STATUS[newStatus]) return false;
        S.setDocumentStatus(appId, before.id, STATUS[newStatus]);
        const sum = S.documentSummary(S.documentsFor(appId));
        app.docs = `${sum.accepted}/${sum.required}`;
        delete app.documents;
        this.logActivity("Admin", "ADMIN (Limuel)", `ADMIN updated document "${docName}" to ${newStatus} for ${appId}`, appId, {
          actorId: "ADMIN-01",
          recordType: "Application",
          details: { docName, prevStatus: before.status, newStatus, verifiedDocs: app.docs }
        });
        this.save();
        return true;
      }
      if (!app.documents) {
        app.documents = this._baseAppDocuments(appId);
      }
      const doc = app.documents.find(d => d.name === docName);
      if (doc) {
        const prevStatus = doc.status;
        doc.status = newStatus;
        if (newStatus === "Verified" || newStatus === "Submitted") {
          doc.date = new Date().toISOString().slice(0, 10);
        }
        this.writeSharedDocumentStatus(appId, docName, newStatus);
        const activeCount = app.documents.filter(d => d.status === "Verified" || d.status === "Submitted").length;
        app.docs = `${activeCount}/${app.documents.length}`;
        this.logActivity("Admin", "ADMIN (Limuel)", `ADMIN updated document "${docName}" to ${newStatus} for ${appId}`, appId, {
          actorId: "ADMIN-01",
          recordType: "Application",
          details: { docName, prevStatus, newStatus, verifiedDocs: app.docs }
        });
        this.save();
        return true;
      }
      return false;
    }

    // Mirrors an admin verdict onto the customer's uploaded document so the Customer portal shows it
    writeSharedDocumentStatus(appId, docName, newStatus) {
      const STATUS = { Verified: "ACCEPTED", Rejected: "REUPLOAD_REQUIRED", Missing: "NOT_SUBMITTED", Submitted: "SUBMITTED" };
      try {
        const store = JSON.parse(STORE.getItem(SHARED_DOCUMENTS_KEY) || "{}") || {};
        const rec = store[appId];
        const doc = rec && Array.isArray(rec.documents) ? rec.documents.find(x => x.name === docName) : null;
        if (!doc || !STATUS[newStatus]) return;
        doc.status = STATUS[newStatus];
        doc.submitted = doc.status !== "NOT_SUBMITTED" && doc.status !== "REUPLOAD_REQUIRED";
        doc.reviewedAt = new Date().toISOString();
        rec.updatedAt = doc.reviewedAt;
        STORE.setItem(SHARED_DOCUMENTS_KEY, JSON.stringify(store));
      } catch (e) { /* shared documents are optional */ }
    }

    // --- APPLICATION SPECIFIC ACTIVITY TIMELINE ---
    getAppActivity(appId) {
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return [];

      const install = this.data.installations.find(j => j.appId === appId);
      const rawActivity = this.data.activity.filter(a => 
        a.record === appId || 
        (install && a.record === install.id) ||
        (a.action && a.action.includes(appId))
      );

      const list = [...rawActivity];
      if (list.length < 2) {
        list.push({
          id: `ACT-HIST-1`,
          time: app.updated || "Recent",
          role: "Financer",
          user: `${app.financer}`,
          action: `Financing status logged as: ${app.stage}`,
          record: appId
        });
        list.push({
          id: `ACT-HIST-2`,
          time: "Initial Intake",
          role: "Customer",
          user: `${app.customer} (${app.customerId})`,
          action: `Application submitted for ${app.system} solar system at ${app.location}`,
          record: appId
        });
      }

      return list;
    }

    // --- INSTALLATION WORKFLOWS ---
    getSchedulableProjects() {
      // Must only show existing projects with Status = Ready and Schedule = Pending Schedule
      return this.data.installations.filter(job => 
        job.status === "Ready" && job.schedule === "Pending Schedule"
      ).map(job => ({
        id: job.id,
        appId: job.appId || job.id,
        customer: job.customer,
        location: job.location,
        system: job.system,
        installerType: job.installerType || "Hello Solar Direct",
        installer: job.installerType === "Hello Solar Direct" ? "Hello Solar Internal Team" : (job.installer || "Partner Installer"),
        leadTech: (!job.leadTech || job.leadTech === "Hello Solar Internal Team" || job.leadTech === "Unassigned") ? "Unassigned" : job.leadTech,
        currentStatus: job.status,
        schedule: job.schedule,
        notes: job.notes
      }));
    }

    scheduleReadyProject(jobId, scheduleDate, scheduleTime, teamLead, notes) {
      // Must not create a new installation record. Strictly update existing project.
      const job = this.data.installations.find(j => j.id === jobId || j.appId === jobId);
      if (!job) return { success: false, message: "Existing installation record not found." };
      const gate = this.installationDocumentsGate(job);
      if (!gate.ok) return { success: false, documentsMissing: gate.missing, message: gate.message, error: gate.message };

      let formattedDate = scheduleDate;
      if (scheduleDate) {
        try {
          const parts = scheduleDate.split("-");
          if (parts.length === 3) {
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const m = months[parseInt(parts[1], 10) - 1] || parts[1];
            formattedDate = `${m} ${parseInt(parts[2], 10)}, ${parts[0]}`;
          }
        } catch (e) {
          formattedDate = scheduleDate;
        }
      }
      const formattedSchedule = `${formattedDate} at ${scheduleTime || "09:00 AM"}`;

      job.status = "Scheduled";
      job.schedule = formattedSchedule;

      // Assign actual team lead (never "Hello Solar Internal Team" as team lead)
      const assignedLead = (teamLead && teamLead.trim() && teamLead !== "Hello Solar Internal Team" && teamLead !== "Unassigned") 
        ? teamLead.trim() 
        : "Unassigned";
      job.leadTech = assignedLead;

      // Ensure installer remains Hello Solar Internal Team for Direct projects
      if (job.installerType === "Hello Solar Direct") {
        job.installer = "Hello Solar Internal Team";
      }

      if (notes) job.notes = (job.notes ? job.notes + " • " : "") + notes;
      else job.notes = `Scheduled for ${formattedSchedule}. Assigned Lead: ${assignedLead}.`;

      // Update linked application if exists
      const targetApp = this.data.applications.find(a => a.id === job.appId);
      if (targetApp) {
        targetApp.stage = "Ready for Installation";
        targetApp.updated = "Just now";
        targetApp.notes = (targetApp.notes ? targetApp.notes + " • " : "") + `Installation scheduled for ${formattedSchedule}. Lead: ${assignedLead}.`;
      }

      // Synchronize installer activeJobs counts
      this.data.installers.forEach(inst => {
        inst.activeJobs = this.data.installations.filter(j => 
          (j.installerId === inst.id || j.installer === inst.name || (inst.id === "INS-001" && j.installerType === "Hello Solar Direct")) &&
          !["Completed", "Cancelled"].includes(j.status)
        ).length;
      });

      this.logActivity(
        "Admin",
        "ADMIN (Limuel)",
        `ADMIN scheduled installation for ${job.id} (${job.customer}) on ${formattedSchedule}. Lead: ${assignedLead}`,
        job.id,
        {
          actorId: "ADMIN-01",
          recordType: "Installation",
          details: { schedule: formattedSchedule, leadTech: assignedLead, status: "Scheduled", jobCustomer: job.customer }
        }
      );
      this.save();
      return { success: true, job, app: targetApp };
    }

    updateInstallationStatus(jobId, newStatus, newSchedule, notes, delayReason, teamLead) {
      const job = this.data.installations.find(j => j.id === jobId);
      if (!job) return false;
      // Scheduling or starting an installation that has not started yet needs complete documents
      if (["Scheduled", "In Progress", "Testing", "Completed"].includes(newStatus) && ["Ready", "Pending", "Pending Schedule", "Scheduled"].includes(job.status) && newStatus !== job.status) {
        const gate = this.installationDocumentsGate(job);
        if (!gate.ok) return { success: false, documentsMissing: gate.missing, error: gate.message, message: gate.message };
      }
      const prevStatus = job.status;
      job.status = newStatus;
      if (newSchedule) job.schedule = newSchedule.replace(/\s*\(Delayed\)/gi, "").trim();
      if (notes) job.notes = notes;
      if (teamLead && teamLead !== "Hello Solar Internal Team") {
        job.leadTech = teamLead;
      }
      if (delayReason) {
        job.delayReason = delayReason;
        job.notes = (notes ? notes + " • " : "") + `Delayed: ${delayReason}`;
      } else if (newStatus !== "Delayed") {
        delete job.delayReason;
      }
      
      // Update linked application and completedDate if completed
      if (newStatus === "Completed") {
        if (!job.completedDate) {
          const now = new Date();
          const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          job.completedDate = `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
        }
        const app = this.data.applications.find(a => a.id === job.appId);
        if (app) {
          // Installation finished → the application is Completed (same as the Direct Engineer completion)
          app.stage = "Completed";
          app.installationStatus = "COMPLETED";
          app.updated = "Just now";
        }
      }

      // Synchronize all installer activeJobs counts
      this.data.installers.forEach(inst => {
        inst.activeJobs = this.data.installations.filter(j => 
          (j.installerId === inst.id || j.installer === inst.name || (inst.id === "INS-001" && j.installerType === "Hello Solar Direct")) &&
          !["Completed", "Cancelled"].includes(j.status)
        ).length;
      });

      this.logActivity(
        "Admin",
        "ADMIN (Limuel)",
        `ADMIN updated installation ${jobId} status from "${prevStatus}" to "${newStatus}"`,
        jobId,
        {
          actorId: "ADMIN-01",
          recordType: "Installation",
          details: { prevStatus, newStatus, schedule: newSchedule, delayReason, leadTech: teamLead }
        }
      );
      this.save();
      return true;
    }

    // --- RESCHEDULE NOTICE (customer + installer) ---
    notifyInstallationRescheduled(job, schedule) {
      const S = typeof window !== "undefined" ? window.HSShared : null;
      if (!S || !job) return;
      const app = this.data.applications.find(a => a.id === job.appId);
      const message = `${job.id}${job.appId ? ` (${job.appId})` : ""} installation was rescheduled to ${schedule}.`;
      if (app && app.customerId) {
        S.notify({ recipientRole: "customer", recipientId: app.customerId, eventType: "INSTALLATION_RESCHEDULED", recordId: job.appId,
          title: "Installation rescheduled", message, targetUrl: "install-status.html", actionLabel: "View Installation" });
      }
      const installerId = job.installerId || (job.installerType === "Hello Solar Direct" ? "INS-001" : null);
      if (installerId) {
        S.notify({ recipientRole: "installer", recipientId: installerId, eventType: "job_rescheduled", recordId: job.appId || job.id,
          title: "Installation rescheduled", message, targetUrl: `myjob.html?job=${job.appId || job.id}`, actionLabel: "View Job" });
      }
    }

    // --- MAINTENANCE (inside each installation's Inspect / Update) ---
    // job.maintenance = { status: Assigned | Scheduled | In Progress | Completed, assignee: person, date, time, notes,
    //   request: person waiting to accept or decline (null when none), history: [{ at, text }] }
    // person = { key, name, company, installerId }
    getMaintenancePeople() {
      const people = [];
      const add = (name, company, installerId) => {
        if (!name || people.some(p => p.name === name)) return;
        people.push({ key: name, name, company, installerId });
      };
      const internal = (this.data.installers || []).find(i => i.id === "INS-001");
      if (internal) add(internal.contact, "Hello Solar", "INS-001");
      add("Engr. Mark Dizon", "Hello Solar", "INS-001");
      (this.data.engineers || []).filter(e => e.status === "Active").forEach(e => add(e.name, "Hello Solar", "INS-001"));
      (this.data.installers || []).filter(i => i.id !== "INS-001" && i.status === "Active")
        .forEach(i => add(i.contact, i.name, i.id));
      return people;
    }

    getMaintenance(job) {
      if (!job) return null;
      if (job.maintenance) return job.maintenance;
      if (job.installerType !== "Maintenance") return null;
      // Maintenance jobs saved before maintenance moved into Inspect / Update
      const person = this.getMaintenancePeople().find(p => p.name === job.leadTech);
      const status = job.status === "Completed" ? "Completed" : (job.status === "In Progress" || job.status === "Testing") ? "In Progress"
        : (job.schedule && job.schedule !== "Pending Schedule") ? "Scheduled" : "Assigned";
      return { status, assignee: person || null, date: job.schedule || "", time: "", notes: job.notes || "", request: null, history: [] };
    }

    _notifyMaintenancePerson(person, job, title, message) {
      const S = typeof window !== "undefined" ? window.HSShared : null;
      if (!S || !person || !person.installerId) return;
      S.notify({ recipientRole: "installer", recipientId: person.installerId, eventType: "maintenance_request", recordId: job.id,
        title, message, targetUrl: `myjob.html?job=${job.appId || job.id}`, actionLabel: "View Job",
        maintenance: { jobId: job.id, personName: person.name } });
    }

    // Saves the Maintenance tab. Choosing a different person while someone is already assigned sends a request:
    // both are notified and the new person must accept or decline before the change takes effect.
    saveMaintenance(jobId, input = {}, options = {}) {
      const job = this.data.installations.find(j => j.id === jobId);
      if (!job) return { success: false, message: "Installation not found." };
      const admin = options.adminUser || "ADMIN (Limuel)";
      const m = { history: [], ...(this.getMaintenance(job) || { status: "Assigned", assignee: null, date: "", time: "", notes: "", request: null }) };
      const now = new Date().toISOString();
      const people = this.getMaintenancePeople();
      const chosen = people.find(p => p.key === input.personKey) || null;
      if (!chosen && !m.assignee) return { success: false, message: "Choose the person who will handle the maintenance." };
      const when = [input.date, input.time].filter(Boolean).join(" at ");
      const changes = [];

      if (input.date && (input.date !== m.date || (input.time || "") !== (m.time || ""))) {
        m.date = input.date; m.time = input.time || "";
        changes.push(`schedule set to ${when}`);
      }
      if (input.notes !== undefined) m.notes = input.notes;
      if (input.status && input.status !== m.status) {
        changes.push(`progress changed from ${m.status} to ${input.status}`);
        m.status = input.status;
      } else if (changes.length && m.status === "Assigned") {
        m.status = "Scheduled";
      }

      let requestSent = false;
      if (chosen && (!m.assignee || chosen.name !== m.assignee.name) && (!m.request || m.request.name !== chosen.name)) {
        if (!m.assignee) {
          m.assignee = chosen;
          changes.push(`assigned to ${chosen.name}`);
          this._notifyMaintenancePerson(chosen, job, "Maintenance assigned", `${job.id} (${job.customer}) maintenance was assigned to you${m.date ? ` · ${m.date}${m.time ? " at " + m.time : ""}` : ""}.`);
        } else {
          m.request = { ...chosen, requestedAt: now, requestedBy: admin };
          requestSent = true;
          changes.push(`reassignment requested from ${m.assignee.name} to ${chosen.name}`);
          this._notifyMaintenancePerson(chosen, job, "Maintenance request: please accept or decline",
            `${job.id} (${job.customer}) maintenance is being moved to you from ${m.assignee.name}. Please accept or decline.`);
          this._notifyMaintenancePerson(m.assignee, job, "Maintenance being reassigned",
            `${job.id} (${job.customer}) maintenance is being moved from you to ${chosen.name}, waiting for their answer.`);
        }
      } else if (changes.length && m.assignee) {
        this._notifyMaintenancePerson(m.assignee, job, "Maintenance updated", `${job.id} (${job.customer}) maintenance: ${changes.join(", ")}.`);
      }

      if (!changes.length) return { success: false, message: "Nothing changed." };
      m.history = [{ at: now, text: `${admin}: ${changes.join(", ")}` }, ...(m.history || [])];
      m.updatedAt = now;
      job.maintenance = m;
      this.logActivity("Admin", admin, `ADMIN updated maintenance for ${jobId}: ${changes.join(", ")}`, jobId, {
        actorId: "ADMIN-01", recordType: "Installation", details: { maintenance: m.status, assignee: m.assignee?.name, request: m.request?.name || null }
      });
      this.save();
      return { success: true, maintenance: m, requestSent };
    }

    // The requested person accepts or declines (Installer portal notification or Engineer view)
    respondMaintenance(jobId, decision, personName) {
      const job = this.data.installations.find(j => j.id === jobId);
      const res = HelloSolarStore.applyMaintenanceResponse(job, decision, personName);
      if (!res.success) return res;
      this.logActivity("Installer", personName, `${personName} ${decision === "accept" ? "accepted" : "declined"} the maintenance request for ${jobId}`, jobId, {
        recordType: "Installation", details: { decision }
      });
      this.save();
      return res;
    }

    // Shared by the Super Admin store and the Installer portal (HSShared record): applies an accept / decline
    static applyMaintenanceResponse(job, decision, personName) {
      const m = job && job.maintenance;
      if (!m || !m.request || m.request.name !== personName) return { success: false, message: "There is no maintenance request waiting for you." };
      const now = new Date().toISOString();
      const S = typeof window !== "undefined" ? window.HSShared : null;
      const previous = m.assignee;
      const req = m.request;
      if (decision === "accept") {
        m.assignee = { key: req.key, name: req.name, company: req.company, installerId: req.installerId };
        m.history = [{ at: now, text: `${req.name} accepted the maintenance (replacing ${previous ? previous.name : "—"})` }, ...(m.history || [])];
      } else {
        m.history = [{ at: now, text: `${req.name} declined the maintenance; it stays with ${previous ? previous.name : "—"}` }, ...(m.history || [])];
      }
      m.request = null;
      m.updatedAt = now;
      if (S && previous && previous.installerId) {
        S.notify({ recipientRole: "installer", recipientId: previous.installerId, eventType: "maintenance_request", recordId: job.id,
          title: `Maintenance ${decision === "accept" ? "reassigned" : "stays with you"}`,
          message: `${req.name} ${decision === "accept" ? "accepted" : "declined"} ${job.id} maintenance.`, targetUrl: `myjob.html?job=${job.appId || job.id}`, actionLabel: "View Job" });
      }
      return { success: true, maintenance: m };
    }

    // --- DIRECT INSTALLATION ENGINEER WORKFLOW ---
    // Uses the same installation progress record as the Installer Portal, stored on
    // app.installationProgress (same APP ID) and in the shared
    // "hello_solar_installation_progress" store so Super Admin can monitor it.
    getDirectInstallJobs() {
      return this.data.installations.filter(j => j.installerType === "Hello Solar Direct");
    }

    getDirectJobState(job) {
      if (!job) return "unknown";
      const app = this.data.applications.find(a => a.id === job.appId);
      const active = String(app?.systemStatus || job.systemStatus || "").toUpperCase() === "ACTIVE";
      if (job.status === "Completed") return active ? "active" : "completed";
      if (["In Progress", "Testing", "Delayed"].includes(job.status)) return "in_progress";
      if (job.engineerAcceptedAt) return "accepted";
      return "pending"; // Ready / Scheduled, awaiting engineer acceptance
    }

    defaultInstallationProgress(job) {
      const app = this.data.applications.find(a => a.id === job.appId) || {};
      return {
        appId: job.appId,
        jobId: job.id,
        referenceNumber: "",
        battery: { brand: "", model: app.battery || "", capacityKwh: "", quantity: "", serialNumbers: "" },
        inverter: { brand: "", model: app.inverter || "", capacityKw: "", serialNumber: "" },
        solarPanels: { brand: "", model: app.panels || "", wattage: "", quantity: "", serialNumbers: "" },
        progress: { percent: 0, stage: "", notes: "" },
        updatedAt: null,
        updatedBy: null,
        history: []
      };
    }

    getInstallationProgress(jobOrAppId) {
      const job = typeof jobOrAppId === "object" ? jobOrAppId
        : this.data.installations.find(j => j.id === jobOrAppId || j.appId === jobOrAppId);
      if (!job) return null;
      const app = this.data.applications.find(a => a.id === job.appId);
      let stored = app?.installationProgress || null;
      if (!stored) {
        try {
          stored = (JSON.parse(STORE.getItem(INSTALLATION_PROGRESS_KEY) || "{}") || {})[job.appId] || null;
        } catch { stored = null; }
      }
      const base = this.defaultInstallationProgress(job);
      const rec = !stored ? base : {
        ...base, ...stored,
        battery: { ...base.battery, ...(stored.battery || {}) },
        inverter: { ...base.inverter, ...(stored.inverter || {}) },
        solarPanels: { ...base.solarPanels, ...(stored.solarPanels || {}) },
        progress: { ...base.progress, ...(stored.progress || {}) },
        history: Array.isArray(stored.history) ? stored.history : []
      };
      const state = this.getDirectJobState(job);
      if (state === "pending" || state === "accepted") rec.progress = { ...rec.progress, percent: 0 };
      if (state === "completed" || state === "active") rec.progress = { ...rec.progress, percent: 100 };
      return rec;
    }

    _syncDirectApp(job, fields) {
      const app = this.data.applications.find(a => a.id === job.appId);
      if (app) Object.assign(app, fields, { updated: "Just now" });
      return app;
    }

    _writeSharedProgress(record) {
      try {
        const store = JSON.parse(STORE.getItem(INSTALLATION_PROGRESS_KEY) || "{}") || {};
        store[record.appId] = record;
        STORE.setItem(INSTALLATION_PROGRESS_KEY, JSON.stringify(store));
      } catch (e) { /* storage unavailable */ }
    }

    engineerAcceptJob(jobId, engineer) {
      const job = this.data.installations.find(j => j.id === jobId);
      if (!job || job.installerType !== "Hello Solar Direct") return { success: false, message: "Direct installation job not found." };
      if (this.getDirectJobState(job) !== "pending") return { success: false, message: "Only pending direct installation jobs can be accepted." };
      const gate = this.installationDocumentsGate(job);
      if (!gate.ok) return { success: false, documentsMissing: gate.missing, message: gate.message, error: gate.message };

      job.engineerAcceptedAt = new Date().toISOString();
      job.leadTech = engineer.name;
      job.status = "Scheduled";
      job.progress = 0;
      this._syncDirectApp(job, { installationStatus: "AWAITING_INSTALLATION", progress: 0, assignedEngineer: engineer.name });
      this.logActivity("Engineer", engineer.name, `${engineer.name} accepted direct installation ${jobId} (${job.appId})`, jobId, {
        actorId: engineer.actorId, recordType: "Installation", details: { appId: job.appId, installationStatus: "AWAITING_INSTALLATION" }
      });
      return { success: true, job };
    }

    saveDirectInstallationProgress(jobId, payload, engineer) {
      const job = this.data.installations.find(j => j.id === jobId);
      if (!job || job.installerType !== "Hello Solar Direct") return { success: false, message: "Direct installation job not found." };
      const state = this.getDirectJobState(job);
      if (!["accepted", "in_progress"].includes(state)) {
        return { success: false, message: "Progress can only be updated after accepting and before completing the installation." };
      }
      const referenceNumber = String(payload.referenceNumber || "").trim();
      if (!referenceNumber) return { success: false, message: "Reference Number is required." };

      const existing = this.getInstallationProgress(job);
      let percent = parseInt(payload.progress?.percent, 10);
      if (isNaN(percent)) percent = existing.progress.percent || 0;
      if (percent < 0 || percent > 99) return { success: false, message: 'Progress must be between 0 and 99%. Use "Complete Installation" to finish.' };

      const clean = (obj, keys) => keys.reduce((acc, k) => { acc[k] = String((obj || {})[k] ?? "").trim(); return acc; }, {});
      const now = new Date().toISOString();
      const stage = String(payload.progress?.stage || "").trim();
      const record = {
        appId: job.appId,
        jobId: job.id,
        referenceNumber,
        battery: clean(payload.battery, ["brand", "model", "capacityKwh", "quantity", "serialNumbers"]),
        inverter: clean(payload.inverter, ["brand", "model", "capacityKw", "serialNumber"]),
        solarPanels: clean(payload.solarPanels, ["brand", "model", "wattage", "quantity", "serialNumbers"]),
        progress: { percent, stage, notes: String(payload.progress?.notes || "").trim() },
        updatedAt: now,
        updatedBy: { installerId: engineer.actorId, name: engineer.name },
        history: [{ at: now, by: engineer.name, percent, stage }, ...existing.history].slice(0, 50)
      };

      // Progress above 0% moves an accepted job into Installation In Progress
      if (percent > 0 && state === "accepted") job.status = "In Progress";
      job.progress = percent;
      const installationStatus = job.status === "In Progress" || state === "in_progress" ? "INSTALLATION_IN_PROGRESS" : "AWAITING_INSTALLATION";
      this._syncDirectApp(job, { installationProgress: record, installationStatus, progress: percent });
      this._writeSharedProgress(record);
      this.logActivity("Engineer", engineer.name, `${engineer.name} updated installation progress for ${job.appId} (${percent}%${stage ? ` · ${stage}` : ""})`, jobId, {
        actorId: engineer.actorId, recordType: "Installation", details: { appId: job.appId, referenceNumber, percent, stage }
      });
      return { success: true, record, job };
    }

    engineerCompleteInstallation(jobId, engineer) {
      const job = this.data.installations.find(j => j.id === jobId);
      if (!job || job.installerType !== "Hello Solar Direct") return { success: false, message: "Direct installation job not found." };
      if (this.getDirectJobState(job) !== "in_progress") return { success: false, message: "Only installations in progress can be completed." };
      const rec = this.getInstallationProgress(job);
      if (!rec.referenceNumber) return { success: false, message: "Save the Reference Number before completing the installation." };

      const now = new Date();
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      job.status = "Completed";
      job.progress = 100;
      if (!job.completedDate) job.completedDate = `${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
      delete job.delayReason;
      const record = { ...rec, progress: { ...rec.progress, percent: 100, stage: "Installation Completed" }, updatedAt: now.toISOString(), updatedBy: { installerId: engineer.actorId, name: engineer.name } };
      // Same linked-application side effect as the existing admin completion flow
      this._syncDirectApp(job, { installationStatus: "COMPLETED", progress: 100, installationProgress: record, stage: "Completed" });
      this._writeSharedProgress(record);
      this.data.installers.forEach(inst => {
        inst.activeJobs = this.data.installations.filter(j =>
          (j.installerId === inst.id || j.installer === inst.name || (inst.id === "INS-001" && j.installerType === "Hello Solar Direct")) &&
          !["Completed", "Cancelled"].includes(j.status)
        ).length;
      });
      this.logActivity("Engineer", engineer.name, `${engineer.name} completed direct installation ${jobId} (${job.appId})`, jobId, {
        actorId: engineer.actorId, recordType: "Installation", details: { appId: job.appId, installationStatus: "COMPLETED" }
      });
      return { success: true, job };
    }

    engineerActivateSystem(jobId, engineer) {
      const job = this.data.installations.find(j => j.id === jobId);
      if (!job || job.installerType !== "Hello Solar Direct") return { success: false, message: "Direct installation job not found." };
      const state = this.getDirectJobState(job);
      if (state === "active") return { success: false, message: "This system is already active." };
      if (state !== "completed") return { success: false, message: "Only completed installations can be activated." };

      const now = new Date().toISOString();
      job.systemStatus = "ACTIVE";
      job.activatedAt = now;
      this._syncDirectApp(job, { systemStatus: "ACTIVE", applicationStatus: "ACTIVE", stage: "Completed", activatedAt: now });
      this.logActivity("Engineer", engineer.name, `${engineer.name} activated system for ${job.appId} (${jobId})`, jobId, {
        actorId: engineer.actorId, recordType: "Installation", details: { appId: job.appId, systemStatus: "ACTIVE" }
      });
      return { success: true, job };
    }

    // --- INSTALLATION SPECIFIC ACTIVITY TIMELINE ---
    getJobActivity(jobId) {
      const job = this.data.installations.find(j => j.id === jobId);
      if (!job) return [];
      const appId = job.appId;

      const rawActivity = this.data.activity.filter(a =>
        a.record === jobId ||
        (appId && a.record === appId && (
          a.action.toLowerCase().includes("install") ||
          a.action.toLowerCase().includes("schedule") ||
          a.action.toLowerCase().includes("direct") ||
          a.action.toLowerCase().includes("tech") ||
          a.action.toLowerCase().includes("lead")
        )) ||
        (a.action && (a.action.includes(jobId) || (appId && a.action.includes(appId))))
      );

      const list = [...rawActivity];
      if (list.length < 2) {
        list.push({
          id: `ACT-JOB-INIT-1`,
          time: job.schedule ? "Schedule Logged" : "Recent",
          role: "Installer",
          user: job.installer,
          action: `Assigned installer: ${job.installer} (${job.installerType}). Current status: ${job.status}`,
          record: jobId
        });
        if (appId) {
          list.push({
            id: `ACT-JOB-INIT-2`,
            time: "Project Intake",
            role: "Admin",
            user: "ADMIN (Limuel)",
            action: `Project originated from verified application ${appId} (${job.system}, ${job.location})`,
            record: jobId
          });
        }
      }

      return list;
    }

    // --- PAYMENT WORKFLOWS ---
    getPaymentSchedule(appId) {
      if (!this.data.paymentSchedules) {
        this.data.paymentSchedules = {};
      }

      if (this.data.paymentSchedules[appId]) {
        const stored = this.data.paymentSchedules[appId];
        const owner = this.data.applications.find(a => a.id === appId);
        if (owner && owner.createdAt && !this.isFullPaymentApp(owner)) this._redateUnpaidSchedule(owner, stored);
        return stored;
      }

      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return null;

      const monthly = app.monthly || 5000;
      const totalAmount = app.amount || 300000;

      // Handle Full Payment obligations (Single invoice workflow)
      const isFullPayment = (app.paymentType || "").toLowerCase().includes("full") || app.financer === "Not Required";
      if (isFullPayment) {
        const isPaid = app.paymentStatus === "Verified" || app.paymentStatus === "Completed" || app.paymentStatus === "Paid" || app.paymentStatus === "Verified / Paid";
        const fullSched = {
          appId,
          installments: [
            {
              no: 1,
              dueDate: app.receiptUploadedAt || app.nextDue || "2026-09-30",
              amount: app.amount,
              status: isPaid ? "Paid" : (app.paymentStatus === "Verification Required" ? "Verification Required" : "Unpaid"),
              paidDate: isPaid ? (app.receiptUploadedAt || "2026-09-28") : null,
              paidAmount: isPaid ? app.amount : 0,
              reference: app.receiptReference || `HS-FULL-${app.id.replace('APP-', '')}`,
              notes: isPaid ? "Full invoice settled in full via direct payment." : "Awaiting payment verification."
            }
          ],
          history: isPaid ? [
            {
              id: `REC-${app.id.replace('APP-', '')}-01`,
              appId,
              date: app.receiptUploadedAt || "2026-09-28",
              amount: app.amount,
              method: app.receiptBank || "Bank Transfer",
              ref: app.receiptReference || `HS-REC-${app.id.replace('APP-', '')}`,
              status: "Verified",
              recordedBy: "ADMIN (Limuel)",
              installmentNo: 1,
              notes: "Full payment settled and verified by Super Admin."
            }
          ] : []
        };
        this.data.paymentSchedules[appId] = fullSched;
        return fullSched;
      }

      // Months to pay: the stored term, else what it takes to pay the loan plus interest at the fixed monthly
      const totalInstallments = Number(app.termMonths) > 0
        ? Number(app.termMonths)
        : (loanTermMonths(totalAmount, this.appAnnualRate(app), monthly) || Math.max(12, Math.ceil(totalAmount / monthly)));
      
      const installments = [];
      const history = [];

      if (app.id === "APP-1070" || app.paymentStatus === "Completed") {
        // Fully paid obligation
        for (let i = 1; i <= totalInstallments; i++) {
          const installmentDate = new Date("2023-09-15T00:00:00");
          installmentDate.setMonth(installmentDate.getMonth() + i - 1);
          const dateStr = isoLocal(installmentDate);
          installments.push({
            no: i,
            dueDate: dateStr,
            amount: monthly,
            status: "Paid",
            paidDate: i === totalInstallments ? "2026-09-23" : dateStr,
            paidAmount: monthly,
            reference: `SF-REC-1070-${String(i).padStart(2, '0')}`,
            notes: i === totalInstallments ? "Final payment settled in full. Obligation completed." : "Regular monthly amortization cleared."
          });
        }
        history.push({
          id: "PAY-1070-FINAL",
          appId: "APP-1070",
          date: "2026-09-23",
          amount: monthly,
          method: "Bank Transfer",
          ref: "SF-REC-1070-FINAL",
          status: "Verified",
          recordedBy: "ADMIN (Limuel)",
          notes: "Final amort. payment settled in full. Account marked Completed."
        });
        history.push({
          id: "PAY-1070-35",
          appId: "APP-1070",
          date: "2026-08-15",
          amount: monthly,
          method: "Auto-Debit",
          ref: "SF-REC-1070-35",
          status: "Verified",
          recordedBy: "System Mesh",
          notes: "Scheduled auto-debit cleared."
        });
        history.push({
          id: "PAY-1070-34",
          appId: "APP-1070",
          date: "2026-07-15",
          amount: monthly,
          method: "Auto-Debit",
          ref: "SF-REC-1070-34",
          status: "Verified",
          recordedBy: "System Mesh",
          notes: "Scheduled auto-debit cleared."
        });
      } else if (app.id === "APP-1056" || (app.paymentStatus === "Overdue" && app.id !== "APP-1089")) {
        // Overdue account APP-1056 where Sep 12, 2026 was missed
        const missedDate = app.nextDue || "2026-09-12";
        const paidDates = ["2026-06-12", "2026-07-12", "2026-08-12"];
        paidDates.forEach((pDate, idx) => {
          installments.push({
            no: idx + 1,
            dueDate: pDate,
            amount: monthly,
            status: "Paid",
            paidDate: pDate,
            paidAmount: monthly,
            reference: `BDO-REC-1056-0${idx + 1}`,
            notes: "Direct debit payment verified."
          });
          history.unshift({
            id: `PAY-1056-0${idx + 1}`,
            appId: "APP-1056",
            date: pDate,
            amount: monthly,
            method: "Auto-Debit",
            ref: `BDO-REC-1056-0${idx + 1}`,
            status: "Verified",
            recordedBy: "System Mesh",
            notes: "Automatic amortization deduction."
          });
        });

        // Missed installment #4
        installments.push({
          no: 4,
          dueDate: missedDate,
          amount: monthly,
          status: "Overdue",
          paidDate: null,
          paidAmount: 0,
          reference: null,
          notes: "Scheduled payment date passed without required payment (12 days overdue)."
        });

        for (let i = 5; i <= totalInstallments; i++) {
          const upDate = new Date("2026-09-12T00:00:00");
          upDate.setMonth(upDate.getMonth() + (i - 4));
          installments.push({
            no: i,
            dueDate: isoLocal(upDate),
            amount: monthly,
            status: "Upcoming",
            paidDate: null,
            paidAmount: 0,
            reference: null,
            notes: ""
          });
        }
      } else if (app.id === "APP-1089") {
        // Overdue account APP-1089 (due Sep 08, 2026)
        const missedDate = "2026-09-08";
        installments.push({
          no: 1,
          dueDate: missedDate,
          amount: monthly,
          status: "Overdue",
          paidDate: null,
          paidAmount: 0,
          reference: null,
          notes: "Financer record flagged missed initial payment (16 days overdue)."
        });
        for (let i = 2; i <= totalInstallments; i++) {
          const upDate = new Date("2026-09-08T00:00:00");
          upDate.setMonth(upDate.getMonth() + (i - 1));
          installments.push({
            no: i,
            dueDate: isoLocal(upDate),
            amount: monthly,
            status: "Upcoming",
            paidDate: null,
            paidAmount: 0,
            reference: null,
            notes: ""
          });
        }
      } else {
        // Standard active account (On Time or Due Soon). Sample accounts use their written dates; real
        // applications pay the first installment one month after financing is approved.
        const realFirstDue = app.createdAt ? this._firstDueFor(app) : null;
        let baseDate = new Date(realFirstDue ? realFirstDue + "T00:00:00"
          : (app.nextDue && app.nextDue !== "N/A" ? (app.nextDue.includes("T") ? app.nextDue : app.nextDue + "T00:00:00") : "2026-10-15T00:00:00"));
        if (isNaN(baseDate.getTime())) {
          baseDate = new Date("2026-10-15T00:00:00");
        }
        const nextDueStr = isoLocal(baseDate);
        const isDueSoon = app.paymentStatus === "Due Soon";

        const hasHistory = ["APP-1024", "APP-1048", "APP-1050", "APP-1062", "APP-1102"].includes(app.id);
        const pastCount = hasHistory ? (app.id === "APP-1024" ? 4 : 2) : 0;

        for (let i = 1; i <= pastCount; i++) {
          const pDate = new Date(baseDate.getTime());
          pDate.setMonth(pDate.getMonth() - (pastCount - i + 1));
          const pDateStr = isoLocal(pDate);
          const ref = `REC-${app.id.replace('APP-', '')}-0${i}`;
          installments.push({
            no: i,
            dueDate: pDateStr,
            amount: monthly,
            status: "Paid",
            paidDate: pDateStr,
            paidAmount: monthly,
            reference: ref,
            notes: "Automatic installment debit cleared."
          });
          history.unshift({
            id: `PAY-${app.id}-${i}`,
            appId: app.id,
            date: pDateStr,
            amount: monthly,
            method: "Auto-Debit",
            ref: ref,
            status: "Verified",
            recordedBy: "System Mesh",
            notes: "Verified bank transfer received on schedule."
          });
        }

        // Current active installment
        installments.push({
          no: pastCount + 1,
          dueDate: nextDueStr,
          amount: monthly,
          status: isDueSoon ? "Due Soon" : "On Time",
          paidDate: null,
          paidAmount: 0,
          reference: null,
          notes: isDueSoon ? "Payment due within the next 7 days." : "Upcoming regular monthly installment."
        });

        // Remaining upcoming installments
        for (let i = pastCount + 2; i <= totalInstallments; i++) {
          const upDate = new Date(baseDate.getTime());
          upDate.setMonth(upDate.getMonth() + (i - pastCount - 1));
          installments.push({
            no: i,
            dueDate: isoLocal(upDate),
            amount: monthly,
            status: "Upcoming",
            paidDate: null,
            paidAmount: 0,
            reference: null,
            notes: ""
          });
        }
      }

      const scheduleData = {
        appId: app.id,
        termMonths: totalInstallments,
        installments,
        history
      };
      if (!app.createdAt) {
        // Sample account: written for Sep 25, 2026 → move to the current demo calendar
        scheduleData.demoDates = true;
        const clock = this.data.demoClock && this.data.demoClock.alignedTo ? this.data.demoClock.alignedTo : HelloSolarStore.todayISO();
        this._shiftSchedule(scheduleData, daysBetweenISO(DEMO_DATES_AUTHORED_FOR, clock));
      } else {
        scheduleData.firstDue = installments[0] ? installments[0].dueDate : null;
      }
      this._fitScheduleToLoan(app, scheduleData);

      this.data.paymentSchedules[appId] = scheduleData;
      return scheduleData;
    }

    // Number of monthly installments of an application without creating its schedule: the saved schedule, else the
    // chosen term, else what the loan needs at its interest rate (same rule the schedule uses).
    scheduleTermFor(app) {
      if (!app || this.isFullPaymentApp(app)) return null;
      const S = typeof window !== "undefined" ? window.HSShared : null;
      const shared = S && S.read ? S.read() : this.data;
      const saved = (shared && shared.paymentSchedules && shared.paymentSchedules[app.id]) || (this.data.paymentSchedules || {})[app.id];
      if (saved && Array.isArray(saved.installments) && saved.installments.length) return saved.installments.length;
      if (Number(app.termMonths) > 0) return Number(app.termMonths);
      const amount = Number(app.amount) || 0, monthly = Number(app.monthly) || 0;
      if (!(amount > 0) || !(monthly > 0)) return null;
      return loanTermMonths(amount, this.appAnnualRate(app), monthly) || Math.max(12, Math.ceil(amount / monthly));
    }

    // First installment of a real application: the date the financer set at approval, else one month after the
    // financing decision (Hello Solar Funding), else one month from today (not approved yet — preview only).
    _firstDueFor(app) {
      if (app.nextDue && /^\d{4}-\d{2}-\d{2}$/.test(app.nextDue)) return app.nextDue;
      const decided = app.financingDecision && app.financingDecision.decidedAt;
      return HelloSolarStore.addMonthsISO(HelloSolarStore.todayISO(decided || undefined), 1);
    }

    // A real schedule with no payments yet follows the current first-due date (e.g. it was first opened before
    // the financing was approved). Returns true when dates changed.
    _redateUnpaidSchedule(app, sched) {
      const list = sched && Array.isArray(sched.installments) ? sched.installments : [];
      if (!list.length || list.some(i => i.status === "Paid" || Number(i.paidAmount) > 0 || i.receipt)) return false;
      const first = this._firstDueFor(app);
      if (!first || list[0].dueDate === first) return false;
      list.forEach((inst, idx) => { inst.dueDate = HelloSolarStore.addMonthsISO(first, idx); });
      sched.firstDue = first;
      return true;
    }

    // Moves a schedule by a number of days, keeping one due day per month (the first due date moves by the
    // days; the next ones follow monthly). Payments made on their due date move with it.
    _shiftSchedule(sched, days) {
      const list = sched && Array.isArray(sched.installments) ? sched.installments : [];
      if (!list.length || !days) return;
      const moved = {};
      const first = shiftISO(list[0].dueDate, days);
      list.forEach((inst, idx) => {
        const old = inst.dueDate;
        inst.dueDate = HelloSolarStore.addMonthsISO(first, idx) || shiftISO(old, days);
        moved[old] = inst.dueDate;
        if (inst.paidDate && inst.paidDate === old) inst.paidDate = inst.dueDate;
      });
      (sched.history || []).forEach(h => { if (h && moved[h.date]) h.date = moved[h.date]; });
    }

    // Sample schedules move with the calendar so due / overdue states look the same whatever day the demo runs.
    // Returns true when anything changed.
    _alignDemoDates() {
      if (!DEMO_DATA || IS_API) return false;
      const schedules = this.data.paymentSchedules;
      if (!schedules || typeof schedules !== "object") return false;
      let changed = false;
      if (!this.data.demoClock || !this.data.demoClock.alignedTo) {
        this.data.demoClock = { authoredFor: DEMO_DATES_AUTHORED_FOR, alignedTo: DEMO_DATES_AUTHORED_FOR };
        changed = true;
      }
      Object.keys(schedules).forEach(appId => {
        const sched = schedules[appId];
        if (!sched || sched.demoDates !== undefined) return;
        const app = (this.data.applications || []).find(a => a.id === appId);
        sched.demoDates = !!(app && !app.createdAt);
        changed = true;
      });
      const today = HelloSolarStore.todayISO();
      const days = daysBetweenISO(this.data.demoClock.alignedTo, today);
      if (days) {
        Object.keys(schedules).forEach(appId => { if (schedules[appId] && schedules[appId].demoDates) this._shiftSchedule(schedules[appId], days); });
        this.data.demoClock.alignedTo = today;
        changed = true;
      }
      return changed;
    }

    // Yearly interest rate of a customer's loan: the application's own rate, else its funder's contract rate.
    // Hello Solar Funding has no interest unless a rate is set on the application.
    appAnnualRate(app) {
      if (!app) return 0;
      const own = app.interestRate ?? app.annualRate;
      if (own !== undefined && own !== null && own !== "") return Number(own) || 0;
      if (this.isHelloSolarFunded && this.isHelloSolarFunded(app)) return 0;
      const funder = (this.data.financers || []).find(f => f.id === app.financerId || f.name === app.financer);
      return funder && funder.annualRate != null ? Number(funder.annualRate) || 0 : 0;
    }

    // Makes an installment schedule add up: enough monthly payments to cover the loan plus interest, and a last
    // payment of only what is left. Paid installments are never changed. Returns true when the schedule changed.
    _fitScheduleToLoan(app, schedule) {
      if (!app || !schedule || !Array.isArray(schedule.installments) || !schedule.installments.length) return false;
      if (this.isFullPaymentApp(app) || Number(app.termMonths) > 0) return false;
      const list = schedule.installments;
      const monthly = Number(app.monthly) || Number(list[0].amount) || 0;
      const principal = Number(app.amount) || 0;
      const rate = this.appAnnualRate(app);
      const months = loanTermMonths(principal, rate, monthly);
      if (!months) return false;
      let changed = false;
      while (list.length < months) {
        const prev = list[list.length - 1];
        list.push({
          no: (Number(prev.no) || list.length) + 1, dueDate: HelloSolarStore.addMonthsISO(prev.dueDate, 1) || prev.dueDate,
          amount: monthly, status: "Upcoming", paidDate: null, paidAmount: 0, reference: null, notes: ""
        });
        changed = true;
      }
      while (list.length > months && list[list.length - 1].status !== "Paid") { list.pop(); changed = true; }
      const last = list[list.length - 1];
      const lastAmount = loanLastPayment(principal, rate, monthly, list.length);
      if (last.status !== "Paid" && lastAmount > 0 && lastAmount <= monthly + 0.005 && Math.abs((Number(last.amount) || 0) - lastAmount) > 0.005) {
        last.amount = lastAmount;
        changed = true;
      }
      if (schedule.termMonths !== list.length) { schedule.termMonths = list.length; changed = true; }
      return changed;
    }

    calculatePaymentStatus(app) {
      const isFull = (app.paymentType || "").toLowerCase().includes("full") || app.financer === "Not Required";
      if (isFull) {
        const isPaid = app.paymentStatus === "Verified" || app.paymentStatus === "Completed" || app.paymentStatus === "Paid" || app.paymentStatus === "Verified / Paid";
        return {
          status: app.paymentStatus || (app.uploadedReceipt ? "Verification Required" : "Payment Required"),
          nextDue: isPaid ? "Paid in Full" : (app.receiptUploadedAt ? `Uploaded: ${this.formatReadableDate(app.receiptUploadedAt)}` : (app.nextDue || "Awaiting Upload")),
          overdueCount: app.paymentStatus === "Overdue" ? 1 : 0,
          remainingBalance: isPaid ? 0 : (app.amount || 0),
          totalPaid: isPaid ? (app.amount || 0) : 0,
          progressCount: isPaid ? 1 : 0,
          totalInstallments: 1
        };
      }

      const schedule = this.getPaymentSchedule(app.id);
      if (!schedule || !schedule.installments || !schedule.installments.length) {
        return {
          status: app.paymentStatus || "On Time",
          nextDue: app.nextDue || "Paid in Full",
          overdueCount: 0,
          remainingBalance: app.amount || 0,
          totalPaid: 0,
          progressCount: 0,
          totalInstallments: 0
        };
      }

      const installments = schedule.installments;
      const paidList = installments.filter(i => i.status === "Paid");
      const totalPaid = paidList.reduce((sum, i) => sum + (i.paidAmount || i.amount || 0), 0);
      const unpaid = installments.filter(i => i.status !== "Paid");
      const remainingBalance = Math.round(unpaid.reduce((sum, i) => sum + (Number(i.amount) || 0), 0) * 100) / 100;
      if (unpaid.length === 0 || remainingBalance <= 0) {
        return {
          status: "Completed",
          nextDue: "Paid in Full",
          overdueCount: 0,
          remainingBalance: 0,
          totalPaid,
          progressCount: installments.length,
          totalInstallments: installments.length
        };
      }

      // Sort unpaid installments chronologically
      unpaid.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

      // Today (real date, same in every portal)
      const refDate = new Date(HelloSolarStore.todayISO() + "T00:00:00");

      // Check for overdue installment: scheduled payment date has passed by configured overdueThresholdDays
      const overdueGraceDays = Number(this.data.settings?.overdueThresholdDays) || 5;
      const overdueInstallment = unpaid.find(i => {
        const d = new Date(i.dueDate + "T00:00:00");
        const daysPastDue = Math.floor((refDate - d) / (1000 * 60 * 60 * 24));
        return daysPastDue >= overdueGraceDays;
      });

      const nextInstallment = unpaid[0];
      const nextDueDate = nextInstallment.dueDate;
      const nextDateObj = new Date(nextDueDate + "T00:00:00");
      const daysDiff = Math.round((nextDateObj - refDate) / (1000 * 60 * 60 * 24));

      let status = "On Time";
      let displayDueDate = nextDueDate;

      if (overdueInstallment) {
        status = "Overdue";
        displayDueDate = overdueInstallment.dueDate; // retain actual missed due date, never N/A!
      } else if (daysDiff >= 0 && daysDiff <= 7) {
        status = "Due Soon";
        displayDueDate = nextDueDate;
      } else {
        status = "On Time";
        displayDueDate = nextDueDate;
      }

      return {
        status,
        nextDue: displayDueDate,
        overdueCount: overdueInstallment ? 1 : 0,
        remainingBalance,
        totalPaid,
        progressCount: paidList.length,
        totalInstallments: installments.length
      };
    }

    recordPayment(appId, options = {}) {
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return false;

      const schedule = this.getPaymentSchedule(appId);
      if (!schedule) return false;

      const paymentDate = options.date || "2026-09-24";
      const reference = options.reference || `HS-REC-${appId.replace('APP-', '')}-${Date.now().toString().slice(-4)}`;
      const method = options.method || "Bank Transfer";
      const adminUser = options.adminUser || "ADMIN (Limuel)";
      const notes = options.notes || "";

      // Find target unpaid installment
      const unpaid = schedule.installments.filter(i => i.status !== "Paid");
      if (!unpaid.length) return false;

      // Oldest unpaid installment
      unpaid.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
      const targetInstallment = unpaid[0];

      const amountPaid = Number(options.amount) || targetInstallment.amount || app.monthly;

      // Update installment in schedule
      targetInstallment.status = "Paid";
      targetInstallment.paidDate = paymentDate;
      targetInstallment.paidAmount = amountPaid;
      targetInstallment.reference = reference;
      if (notes) targetInstallment.notes = notes;

      // Append to payment history (never overwrite existing history!)
      schedule.history.unshift({
        id: `REC-${Date.now().toString().slice(-6)}`,
        appId: appId,
        date: paymentDate,
        amount: amountPaid,
        method: method,
        ref: reference,
        status: "Verified",
        recordedBy: adminUser,
        installmentNo: targetInstallment.no,
        notes: notes || `Recorded by Super Admin for Installment #${targetInstallment.no}`
      });

      // If user indicated payInFull or remaining unpaid is 0
      if (options.payInFull) {
        schedule.installments.forEach(i => {
          if (i.status !== "Paid") {
            i.status = "Paid";
            i.paidDate = paymentDate;
            i.paidAmount = i.amount;
            i.reference = reference + "-FINAL";
          }
        });
      }

      // Dynamically calculate status from updated schedule
      const statusInfo = this.calculatePaymentStatus(app);
      app.paymentStatus = statusInfo.status;
      app.nextDue = statusInfo.nextDue;
      app.updated = "Just now";

      // Synchronize Financer record if applicable
      if (app.financerId) {
        const financer = this.data.financers.find(f => f.id === app.financerId);
        if (financer) {
          const linkedApps = this.data.applications.filter(a => a.financerId === financer.id);
          financer.activeLoans = linkedApps.filter(a => a.stage !== "Declined" && a.paymentStatus !== "Completed").length;
        }
      }

      // Audit Trail Logging
      this.logActivity(
        "Admin",
        adminUser,
        `ADMIN recorded payment of ₱${amountPaid.toLocaleString()} for ${appId} (${app.customer}) · Ref: ${reference}. Repayment status updated to ${app.paymentStatus}`,
        appId,
        {
          actorId: "ADMIN-01",
          recordType: "Payment",
          details: { amount: amountPaid, reference, method, paymentStatus: app.paymentStatus, customer: app.customer }
        }
      );

      this.save();
      return { success: true, app, statusInfo };
    }

    recordPaymentAdjustment(appId, options = {}) {
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return false;

      const schedule = this.getPaymentSchedule(appId);
      const adminUser = options.adminUser || "ADMIN (Limuel)";
      const adjType = options.type || "Payment Note";
      const notes = options.notes || "";

      if (schedule) {
        schedule.history.unshift({
          id: `ADJ-${Date.now().toString().slice(-6)}`,
          appId: appId,
          date: options.date || "2026-09-24",
          amount: 0,
          method: "Administrative Adjustment",
          ref: `ADJ-${appId.replace('APP-', '')}-${Date.now().toString().slice(-3)}`,
          status: "Logged Note",
          recordedBy: adminUser,
          notes: `[${adjType}] ${notes}`
        });
      }

      this.logActivity(
        "Admin",
        adminUser,
        `ADMIN logged payment adjustment note (${adjType}) for ${appId} (${app.customer}): ${notes}`,
        appId,
        {
          actorId: "ADMIN-01",
          recordType: "Payment",
          details: { adjType, notes, date: options.date || "2026-09-24", customer: app.customer }
        }
      );

      this.save();
      return true;
    }

    getPaymentsKpis(options = {}) {
      const apps = this.getApplications ? this.getApplications() : this.data.applications;
      const totalPortfolio = apps.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
      // Funded split stays on the original funded principal / funding source.
      const hsFunded = apps.filter(a => (a.paymentType || "").toLowerCase().includes("full") || a.financer === "Not Required" || (a.financer || "").toLowerCase().includes("hello solar")).reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
      const thirdPartyFunded = Math.max(0, totalPortfolio - hsFunded);
      // Expected Revenue = scheduled payment amounts due in the current period (calendar month), split by owner.
      const { hsRevenue, thirdPartyRevenue, period } = this.getCurrentPeriodRevenue(apps, options.asOf);
      const totalExpectedRevenue = hsRevenue + thirdPartyRevenue;
      const overdueCount = apps.filter(a => a.paymentStatus === "Overdue").length;
      const overdueActionStatus = overdueCount === 1 ? "1 account flagged" : `${overdueCount} accounts flagged`;

      // Payments cards: Financer Funded (active financer contracts) and Financing Revenue (collected to date).
      const financerFunded = apps.filter(a => this.getApplicationFunding(a, options.asOf).ownerType === "Financer")
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
      const financing = this.getFinancingRevenue(apps, options.asOf);
      const today = HelloSolarStore.todayISO(options.asOf);
      // Verified down payments (reservation deposits) belong to Hello Solar
      const deposits = Math.round(this.getAllPayments().filter(r => r.kind === "dp" && r.status === "Verified" && (!r.date || r.date <= today))
        .reduce((sum, r) => sum + r.amount, 0) * 100) / 100;
      const asOfLabel = new Date(today + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });

      return {
        totalPortfolio,
        hsFunded,
        thirdPartyFunded,
        totalExpectedRevenue,
        hsRevenue,
        thirdPartyRevenue,
        revenuePeriod: period,
        overdueCount,
        overdueActionStatus,
        asOfLabel,
        financerFunded,
        portfolioHsFunded: Math.max(0, totalPortfolio - financerFunded),
        financingRevenue: financing.total,
        financingHsRevenue: financing.hsRevenue,
        // Payments Received card = the same verified payments as Accounting (system payments + down payments)
        depositsReceived: deposits,
        paymentsReceived: Math.round((financing.total + deposits) * 100) / 100,
        paymentsHsShare: Math.round((financing.hsRevenue + deposits) * 100) / 100,
        financerRevenue: financing.financerRevenue,
        revenueSince: financing.since,
        revenueTo: today
      };
    }

    // Financing Revenue = every payment customers have made from the first payment until today.
    // Financer Revenue = the financer's share of each payment collected while its contract was active
    // (payment × the financer's contract rate, e.g. 8.5%). Payments after the contract ends are Hello Solar's;
    // what the financer already earned stays with the financer. HS Revenue = the rest.
    getFinancingRevenue(apps, asOf) {
      const today = HelloSolarStore.todayISO(asOf);
      let total = 0;
      let financerRevenue = 0;
      let since = null;
      (apps || []).forEach(app => {
        const funding = this.getApplicationFunding(app, asOf);
        const isHsSource = !funding.isFinanced || (app.financer || "").toLowerCase().includes("hello solar");
        const financer = !isHsSource ? (this.data.financers || []).find(f => f.id === funding.financerId) : null;
        (this.getPaymentSchedule(app.id)?.installments || []).forEach(inst => {
          const paidOn = String(inst.paidDate || "").slice(0, 10);
          if (inst.status !== "Paid" || !paidOn || paidOn > today) return;
          const amount = Number(inst.paidAmount || inst.amount) || 0;
          total += amount;
          if (!since || paidOn < since) since = paidOn;
          if (!financer) return;
          const owner = this.getFinancerOwnerOn(financer, paidOn);
          if (owner.ownerType === "Financer") financerRevenue += Math.round(amount * (Number(owner.annualRate) || 0)) / 100;
        });
      });
      financerRevenue = Math.round(financerRevenue * 100) / 100;
      total = Math.round(total * 100) / 100;
      return { total, financerRevenue, hsRevenue: Math.round((total - financerRevenue) * 100) / 100, since };
    }

    // Current-period revenue from payment schedules (installments, or the single full-payment invoice) whose
    // due date falls in the current calendar month. Ownership comes from the financer contract:
    //  - Unpaid amounts follow the CURRENT owner (Active → financer; Pending Start / Expired / Terminated → Hello Solar).
    //  - Already-collected amounts stay with whoever owned them on the collection date (no retroactive moves).
    //  - Full payments and financed apps without a matched contract keep their original funding source.
    getCurrentPeriodRevenue(apps, asOf) {
      const period = HelloSolarStore.todayISO(asOf).slice(0, 7); // YYYY-MM
      let hsRevenue = 0;
      let thirdPartyRevenue = 0;
      (apps || []).forEach(app => {
        const funding = this.getApplicationFunding(app, asOf);
        const isHsSource = !funding.isFinanced || (app.financer || "").toLowerCase().includes("hello solar");
        const financer = funding.isFinanced ? (this.data.financers || []).find(f => f.id === funding.financerId) : null;
        const schedule = this.getPaymentSchedule(app.id);
        (schedule?.installments || []).forEach(inst => {
          if (String(inst.dueDate || "").slice(0, 7) !== period) return;
          const isCollected = inst.status === "Paid" && !!inst.paidDate;
          const amount = Number(isCollected ? (inst.paidAmount || inst.amount) : inst.amount) || 0;
          let ownerIsHs;
          if (isHsSource) ownerIsHs = true;
          else if (!financer) ownerIsHs = false; // no contract record → original third-party source
          else if (isCollected) ownerIsHs = this.getFinancerOwnerOn(financer, inst.paidDate).ownerType === "Hello Solar";
          else ownerIsHs = funding.ownerType === "Hello Solar";
          if (ownerIsHs) hsRevenue += amount;
          else thirdPartyRevenue += amount;
        });
      });
      return { hsRevenue, thirdPartyRevenue, period };
    }

    // --- ACCOUNTING / ANALYTICS ---
    // Aggregates existing calculations only: getPaymentsKpis (portfolio, expected revenue split),
    // payment schedules (collected / overdue amounts) and getFinancerContract (contract counts).
    // Single entry point for the CURRENT Payments KPIs (used by both Payments and Accounting): refreshes
    // installment payment statuses from the schedules, then runs getPaymentsKpis.
    getCurrentPaymentsKpis(options = {}) {
      const apps = this.getApplications ? this.getApplications() : this.data.applications;
      apps.forEach(app => {
        const isFull = (app.paymentType || "").toLowerCase().includes("full") || app.financer === "Not Required";
        if (!isFull) {
          const statusInfo = this.calculatePaymentStatus(app);
          app.paymentStatus = statusInfo.status;
          app.nextDue = statusInfo.nextDue;
        }
      });
      return this.getPaymentsKpis(options);
    }

    getAccountingSummary(options = {}) {
      const apps = this.getApplications ? this.getApplications() : this.data.applications;
      // Exactly the Payments KPI values (same function Payments renders)
      const kpis = this.getCurrentPaymentsKpis(options);
      const period = kpis.revenuePeriod;
      let collectedRevenue = 0;
      let collectedThisPeriod = 0;
      let overdueAmount = 0;
      apps.forEach(app => {
        (this.getPaymentSchedule(app.id)?.installments || []).forEach(inst => {
          const status = String(inst.status || "");
          if (status === "Paid") {
            const amt = Number(inst.paidAmount || inst.amount) || 0;
            collectedRevenue += amt;
            if (String(inst.paidDate || "").slice(0, 7) === period) collectedThisPeriod += amt;
          } else if (status === "Overdue" && app.paymentStatus === "Overdue") {
            // Only accounts that Payments counts as overdue (same set as the Overdue Accounts KPI)
            overdueAmount += Number(inst.amount) || 0;
          }
        });
      });
      const contracts = (this.data.financers || []).map(f => this.getFinancerContract(f, options.asOf));
      const countStatus = s => contracts.filter(c => c.status === s).length;
      return {
        period,
        totalPortfolio: kpis.totalPortfolio,
        hsFunded: kpis.hsFunded,
        thirdPartyFunded: kpis.thirdPartyFunded,
        expectedRevenue: kpis.totalExpectedRevenue,
        hsRevenue: kpis.hsRevenue,
        thirdPartyRevenue: kpis.thirdPartyRevenue,
        collectedRevenue,
        collectedThisPeriod,
        overdueAmount,
        overdueAccounts: kpis.overdueCount,
        contracts: {
          active: countStatus("Active"),
          expired: countStatus("Expired"),
          terminated: countStatus("Terminated"),
          pendingStart: countStatus("Pending Start"),
          none: countStatus("No Contract"),
          total: contracts.length
        }
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELLO SOLAR FUNDING — Super Admin accepts an installment application's financing directly
    // (Hello Solar funds it instead of a partner financer), the same way Hello Solar Direct Installation works.
    // ─────────────────────────────────────────────────────────────────────────
    static get HELLO_SOLAR_FUNDING() { return { id: "FIN-HS", name: "Hello Solar Funding" }; }

    isHelloSolarFunded(app) {
      return !!app && (app.financerId === HelloSolarStore.HELLO_SOLAR_FUNDING.id || /hello solar funding/i.test(app.financer || ""));
    }

    isEligibleForHelloSolarFunding(app) {
      if (!app || this.isFullPaymentApp(app) || this.isHelloSolarFunded(app)) return false;
      return ["Submitted", "Financing Review", "Pending Finance", "Under Review"].includes(app.stage);
    }

    acceptHelloSolarFunding(appId, options = {}) {
      this.data = this.load();
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return { success: false, error: "Application not found" };
      if (this.isFullPaymentApp(app)) return { success: false, error: "Full payment applications do not need financing." };
      if (this.isHelloSolarFunded(app)) return { success: false, error: `${appId} is already funded by Hello Solar.` };
      if (!this.isEligibleForHelloSolarFunding(app)) return { success: false, error: `${appId} is not waiting for financing (stage: ${app.stage}).` };
      const docGate = this.documentsGate(app);
      if (!docGate.ok) return { success: false, documentsMissing: docGate.missing, error: docGate.message };
      const fund = HelloSolarStore.HELLO_SOLAR_FUNDING;
      const owner = HelloSolarStore.HELLO_SOLAR_OWNER;
      const adminUser = options.adminUser || "ADMIN (Limuel)";
      const previous = app.financerId && app.financer ? `${app.financer} (${app.financerId})` : null;
      const now = new Date().toISOString();
      app.previousFinancer = previous;
      app.financerId = fund.id;
      app.financer = fund.name;
      app.fundingSource = fund.name;
      app.fundingOwner = owner.name;
      app.fundingOwnerId = owner.id;
      app.stage = "Ready for Installation";
      app.financingStatus = "APPROVED";
      app.applicationStatus = "READY_FOR_INSTALLATION";
      app.financingDecision = { decision: "Approved", by: adminUser, financerId: fund.id, decidedAt: now, note: "Accepted for Hello Solar Funding by Super Admin." };
      app.nextDue = HelloSolarStore.addMonthsISO(HelloSolarStore.todayISO(now), 1);
      app.updated = "Just now";
      app.notes = (app.notes ? app.notes + " • " : "") + "Accepted for Hello Solar Funding by Super Admin.";
      this.logActivity("Admin", adminUser,
        `ADMIN accepted ${appId} (${app.customer}) for Hello Solar Funding · ₱${Number(app.amount || 0).toLocaleString("en-PH")}${previous ? ` — previously ${previous}` : ""}`,
        appId, { actorId: "ADMIN-01", recordType: "Application", deferSave: true, details: { appId, financerId: fund.id, financer: fund.name, previous } });
      this.save();
      this._notifyCustomer(app, "Financing Approved", `Your installment plan for ${appId} is approved and funded by Hello Solar.`, "FINANCING_APPROVED");
      return { success: true, app };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SITE VISIT LIFECYCLE: Site Visit Payment → Pending Visit → Visit Confirmed
    // When the visit is confirmed the client gets a link: Yes → landing page Buy Now (they choose Full Payment
    // or Installment), No → not continuing.
    // ─────────────────────────────────────────────────────────────────────────
    static get SITE_VISIT_LIFECYCLE() { return ["Site Visit Payment", "Pending Visit", "Visit Confirmed"]; }

    siteVisitStage(v) {
      if (!v) return "Site Visit Payment";
      if (v.status === "Completed") return "Visit Confirmed";
      if (v.feePaymentStatus === "Verified") return "Pending Visit";
      return "Site Visit Payment";
    }

    _continueLinkFor(v) {
      if (!v.continueToken) v.continueToken = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      return `Hello_Solar/continue.html?visit=${encodeURIComponent(v.id)}&t=${encodeURIComponent(v.continueToken)}`;
    }

    // Sends (records) the "Do you want to continue?" link once the visit is confirmed
    sendSiteVisitContinueLink(visitId, options = {}) {
      const v = this._siteVisits().find(x => x.id === visitId);
      if (!v) return { success: false, error: "Site visit not found." };
      if (v.status !== "Completed") return { success: false, error: "Confirm the visit first." };
      const link = this._continueLinkFor(v);
      v.continueLink = link;
      v.continueLinkSentAt = new Date().toISOString();
      if (!v.continueResponse) v.continueResponse = "Awaiting Response";
      this.logActivity("Admin", options.adminUser || "ADMIN (Limuel)", `Continue link for ${v.id} (${v.customer}) sent to ${v.email || v.phone || "the client"}`, v.id, {
        actorId: "ADMIN-01", recordType: "Site Visit", deferSave: true, details: { visitId: v.id, link, email: v.email || "" }
      });
      this.save();
      return { success: true, visit: v, link };
    }

    // Client answer from the continue link (Yes = Proceeding, No = Not Proceeding)
    respondSiteVisitContinue(visitId, token, decision) {
      this.data = this.load();
      const v = this._siteVisits().find(x => x.id === visitId);
      if (!v || !v.continueToken || v.continueToken !== token) return { success: false, error: "This link is not valid anymore. Please contact Hello Solar." };
      const yes = /^(yes|proceed)/i.test(String(decision || ""));
      v.continueResponse = yes ? "Yes — Continuing" : "No — Not Continuing";
      v.continueRespondedAt = new Date().toISOString();
      v.clientDecision = yes ? "Proceeding" : "Not Proceeding";
      this.logActivity("Customer", v.customer || "Client", `${v.customer || "Client"} answered ${yes ? "YES" : "NO"} to continue after site visit ${v.id}`, v.id, {
        recordType: "Site Visit", deferSave: true, details: { visitId: v.id, decision: v.clientDecision }
      });
      this.save();
      return { success: true, visit: v, proceed: yes };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACCOUNTING VIEWS
    // ─────────────────────────────────────────────────────────────────────────
    // Revenue channel of a payment:
    //  - Solar Financing Review    → Installment customers: ₱10,000 down payment + monthly installments
    //  - Solar Kit Revenue         → Full Payment customers: ₱500 down payment + full payment
    //  - Solar Installation Revenue→ ₱1,000 site visit fees (site assessment before installation)
    static get REVENUE_CHANNELS() { return ["Solar Financing Review", "Solar Kit Revenue", "Solar Installation Revenue"]; }

    // Every payment received (down payments, site visit fees, full payments, installment receipts) in one list
    getAllPayments() {
      const rows = [];
      const apps = this.getApplications ? this.getApplications() : this.data.applications;
      const isFull = app => this.isFullPaymentApp(app);
      apps.forEach(app => {
        const full = isFull(app);
        const channel = full ? "Solar Kit Revenue" : "Solar Financing Review";
        // Down payment (older applications without a down payment record count as received)
        {
          const st = this.downPaymentState(app);
          rows.push({
            key: `dp:${app.id}`, kind: "dp", ref: app.id, appId: app.id, client: app.customer, type: "Down Payment",
            plan: full ? "Full Payment" : "Installment", channel, amount: this.downPaymentAmount(app),
            date: String((app.downPaymentProof && (app.downPaymentProof.uploadedAt || app.downPaymentProof.date)) || app.downPaymentVerifiedAt || app.createdAt || this._firstActivityDate(app.id) || "").slice(0, 10),
            reference: app.downPaymentProof ? app.downPaymentProof.referenceNo || "" : "",
            status: st === "Verified" ? "Verified" : (st === "Pending Verification" ? "Pending Verification" : "Not Submitted"),
            canVerify: st === "Pending Verification", hasReceipt: !!(app.downPaymentProof && app.downPaymentProof.dataUrl)
          });
        }
        const sched = this.getPaymentSchedule(app.id);
        if (full) {
          // Full payment (single invoice): uploaded receipt → verify
          const inst = sched && sched.installments && sched.installments[0];
          const pending = app.receiptVerificationStatus === "Pending Verification" || app.paymentStatus === "Verification Required";
          const paid = inst && inst.status === "Paid";
          if (pending || paid) {
            rows.push({
              key: `full:${app.id}`, kind: "full", ref: app.id, appId: app.id, client: app.customer, type: "Full Payment",
              plan: "Full Payment", channel, amount: Number(app.receiptAmount || (inst && inst.amount) || app.amount) || 0,
              date: String(app.receiptUploadedAt || (inst && inst.paidDate) || "").slice(0, 10), reference: app.receiptReference || (inst && inst.reference) || "",
              status: paid && !pending ? "Verified" : "Pending Verification", canVerify: pending && !paid, hasReceipt: !!app.uploadedReceipt
            });
          }
        } else {
          // Installment receipts waiting for verification
          (app.receiptSubmissions || []).filter(s => s.status === "Pending Verification").forEach(sub => {
            rows.push({
              key: `inst:${app.id}:${sub.id}`, kind: "inst", ref: app.id, appId: app.id, submissionId: sub.id, client: app.customer,
              type: "Monthly Installment", plan: "Installment", channel, amount: Number(sub.amount) || 0, date: String(sub.date || sub.submittedAt || "").slice(0, 10),
              reference: sub.reference || "", status: "Pending Verification", canVerify: true, hasReceipt: false,
              period: (sub.bills || []).map(b => b.period).filter(Boolean).join(", ")
            });
          });
          // Installments already received
          ((sched && sched.installments) || []).filter(i => i.status === "Paid" && i.paidDate).forEach(i => {
            rows.push({
              key: `paid:${app.id}:${i.no}`, kind: "paid", ref: app.id, appId: app.id, client: app.customer, type: "Monthly Installment",
              plan: "Installment", channel, amount: Number(i.paidAmount || i.amount) || 0, date: String(i.paidDate).slice(0, 10),
              reference: i.reference || "", status: "Verified", canVerify: false, hasReceipt: false, period: `#${i.no}`
            });
          });
        }
      });
      this.getSiteVisits().forEach(v => {
        rows.push({
          key: `sv:${v.id}`, kind: "sv", ref: v.id, appId: null, client: v.customer, type: "Site Visit Fee", plan: "—",
          channel: "Solar Installation Revenue", amount: Number(v.fee || 1000), date: String(v.createdAt || "").slice(0, 10),
          reference: v.feeProof ? v.feeProof.referenceNo || "" : "",
          status: v.feePaymentStatus === "Verified" ? "Verified" : (v.feePaymentStatus === "Pending Verification" ? "Pending Verification" : "Not Submitted"),
          canVerify: v.feePaymentStatus === "Pending Verification", hasReceipt: !!(v.feeProof && v.feeProof.dataUrl)
        });
      });
      const order = { "Pending Verification": 0, Verified: 1, "Not Submitted": 2 };
      return rows.sort((a, b) => (order[a.status] - order[b.status]) || String(b.date).localeCompare(String(a.date)));
    }

    // Verify one row of getAllPayments()
    verifyPaymentRow(key, options = {}) {
      const [kind, id, sub] = String(key || "").split(":");
      if (kind === "dp") return this.verifyDownPayment(id, options);
      if (kind === "sv") return this.verifySiteVisitFee(id, options);
      if (kind === "full") return this.verifyPaymentReceipt(id, options);
      if (kind === "inst") return this.verifyInstallmentReceipt(id, sub, options);
      return { success: false, error: "This payment is already verified." };
    }

    // Verified money received, grouped by revenue channel
    getRevenueChannels() {
      const channels = HelloSolarStore.REVENUE_CHANNELS.map(name => ({ name, total: 0, count: 0, pending: 0, pendingCount: 0, byType: {} }));
      const byName = Object.fromEntries(channels.map(c => [c.name, c]));
      this.getAllPayments().forEach(r => {
        const c = byName[r.channel];
        if (!c) return;
        if (r.status === "Verified") {
          c.total += r.amount;
          c.count++;
          c.byType[r.type] = (c.byType[r.type] || 0) + r.amount;
        } else if (r.status === "Pending Verification") {
          c.pending += r.amount;
          c.pendingCount++;
        }
      });
      channels.forEach(c => { c.total = Math.round(c.total * 100) / 100; c.pending = Math.round(c.pending * 100) / 100; });
      const total = channels.reduce((s, c) => s + c.total, 0);
      return { channels, total: Math.round(total * 100) / 100 };
    }

    // PAYMENT SCHEDULE FOR FUNDERS — what Hello Solar pays each funder every month on the fund it received.
    // Fund = the funder's funded amount; Term = contract months; IR = annual rate.
    // Monthly IR Payment = Fund × IR ÷ 12 (flat, on the original fund)
    // Monthly Principal Payment = Fund ÷ Term
    // Total Monthly Payment = Monthly IR Payment + Monthly Principal Payment
    getFunderSchedule(asOf) {
      const r2 = n => Math.round(n * 100) / 100;
      const rows = (this.data.financers || []).filter(f => Number(f.fundAmount ?? f.totalFunded) > 0 || f.contractStartDate).map(f => {
        const c = this.getFinancerContract(f, asOf);
        const fund = Number(f.fundAmount ?? f.totalFunded) || 0;
        const term = Number(f.contractTermMonths) || 0;
        const rate = Number(f.annualRate) || 0;
        const monthlyInterest = term ? r2(fund * rate / 100 / 12) : 0;
        const monthlyPrincipal = term ? r2(fund / term) : 0;
        return {
          funderId: f.id, funderName: f.name, fund, startDate: f.contractStartDate || null, endDate: f.contractEndDate || null,
          termMonths: term || null, annualRate: f.annualRate ?? null, monthlyInterest, monthlyPrincipal,
          totalMonthly: r2(monthlyInterest + monthlyPrincipal), contractStatus: c.status
        };
      });
      const sum = (k, list = rows) => r2(list.reduce((s, r) => s + (Number(r[k]) || 0), 0));
      // Only funders with an Active contract are paid every month (expired / not started are left out)
      const active = rows.filter(r => r.contractStatus === "Active" && r.termMonths);
      return {
        rows,
        totals: { fund: sum("fund"), monthlyInterest: sum("monthlyInterest"), monthlyPrincipal: sum("monthlyPrincipal"), totalMonthly: sum("totalMonthly") },
        activeTotals: { count: active.length, fund: sum("fund", active), monthlyInterest: sum("monthlyInterest", active), monthlyPrincipal: sum("monthlyPrincipal", active), totalMonthly: sum("totalMonthly", active) }
      };
    }

    // CUSTOMERS PAYMENT SCHEDULE — financed (installment) customers and the funder portfolio they belong to.
    // Amount = financed amount, Start / End = first / last installment due date, Term = number of installments,
    // IR = the customer's plan rate (or the funder's contract rate), Monthly Fixed = the scheduled monthly payment.
    getCustomerPaymentSchedule(asOf) {
      const financed = ["Approved", "Ready for Installation", "Installation", "In Progress", "Completed", "Installation Completed"];
      const apps = (this.getApplications ? this.getApplications() : this.data.applications)
        .filter(a => !this.isFullPaymentApp(a) && financed.includes(a.stage) && a.financer && !["Pending", "Unassigned", "Not Required"].includes(a.financer));
      const rows = apps.map(app => {
        const sched = this.getPaymentSchedule(app.id);
        const inst = (sched && sched.installments) || [];
        const funder = (this.data.financers || []).find(f => f.id === app.financerId || f.name === app.financer) || null;
        // When a funder's contract has ended, its customers' loans are owned by Hello Solar (same rule as Payments)
        const contract = funder ? this.getFinancerContract(funder, asOf) : null;
        const ownedByHelloSolar = !!(contract && ["Expired", "Terminated"].includes(contract.status));
        return {
          appId: app.id, client: app.customer, amount: Number(app.amount) || 0,
          startDate: inst.length ? inst[0].dueDate : null, endDate: inst.length ? inst[inst.length - 1].dueDate : null,
          termMonths: inst.length || Number(app.termMonths) || null, annualRate: this.appAnnualRate(app),
          ownedByHelloSolar, contractStatus: contract ? contract.status : null,
          funderId: this.isHelloSolarFunded(app) ? HelloSolarStore.HELLO_SOLAR_FUNDING.id : (funder ? funder.id : app.financerId || null),
          funderName: this.isHelloSolarFunded(app) ? HelloSolarStore.HELLO_SOLAR_FUNDING.name : (funder ? funder.name : app.financer),
          monthlyFixed: Number((inst[0] && inst[0].amount) || app.monthly) || 0
        };
      });
      const funders = [];
      rows.forEach(r => {
        let f = funders.find(x => x.name === r.funderName);
        if (!f) { f = { id: r.funderId, name: r.funderName, clients: 0, totalMonthly: 0, totalAmount: 0 }; funders.push(f); }
        f.clients++;
        f.totalMonthly = Math.round((f.totalMonthly + r.monthlyFixed) * 100) / 100;
        f.totalAmount += r.amount;
      });
      funders.sort((a, b) => a.name.localeCompare(b.name));
      return { rows, funders, totalMonthly: Math.round(rows.reduce((s, r) => s + r.monthlyFixed, 0) * 100) / 100 };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MONEY IN / MONEY OUT (Accounting, per month)
    // Money In  = verified customer payments + loans received from funders
    // Money Out = monthly payments made to funders (marked paid) + refunds + Hello Solar installation costs
    // ─────────────────────────────────────────────────────────────────────────
    static monthOf(value) {
      const s = String(value || "");
      return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : "";
    }

    // Loans Hello Solar received from funders (the fund, received on the contract start date)
    getFunderLoansReceived(asOf) {
      const today = HelloSolarStore.todayISO(asOf);
      return this.getFunderSchedule(asOf).rows
        .filter(r => r.fund > 0 && r.startDate)
        .map(r => ({ funderId: r.funderId, funderName: r.funderName, amount: r.fund, date: r.startDate, received: r.startDate <= today, contractStatus: r.contractStatus }))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }

    // Monthly payments Hello Solar already made to funders
    getFunderPayments() {
      if (!Array.isArray(this.data.funderPayments)) this.data.funderPayments = [];
      return this.data.funderPayments;
    }

    // Funders Hello Solar pays in a month (Active contract that month) and whether that month is paid
    getFunderPaymentsDue(month) {
      const m = HelloSolarStore.monthOf(month) || HelloSolarStore.todayISO().slice(0, 7);
      const paid = this.getFunderPayments().filter(p => p.month === m);
      const rows = this.getFunderSchedule(`${m}-15`).rows.map(r => {
        const payment = paid.find(p => p.funderId === r.funderId) || null;
        return { ...r, month: m, due: r.contractStatus === "Active" && !!r.termMonths, payment };
      });
      const r2 = n => Math.round(n * 100) / 100;
      const due = rows.filter(r => r.due);
      return {
        month: m, rows,
        totalDue: r2(due.reduce((s, r) => s + r.totalMonthly, 0)),
        paidTotal: r2(paid.reduce((s, p) => s + p.amount, 0)),
        unpaidTotal: r2(due.filter(r => !r.payment).reduce((s, r) => s + r.totalMonthly, 0)),
        unpaidCount: due.filter(r => !r.payment).length
      };
    }

    markFunderPaid(funderId, month, options = {}) {
      const m = HelloSolarStore.monthOf(month);
      if (!m) return { success: false, error: "Pick a month." };
      const row = this.getFunderPaymentsDue(m).rows.find(r => r.funderId === funderId);
      if (!row) return { success: false, error: "Funder not found." };
      if (!row.due) return { success: false, error: `${row.funderName} has no payment due for this month (${row.contractStatus}).` };
      if (row.payment) return { success: false, error: `${row.funderName} is already paid for this month.` };
      const adminUser = options.adminUser || "ADMIN (Limuel)";
      const payment = {
        id: `FP-${funderId}-${m}`, funderId, funderName: row.funderName, month: m,
        amount: row.totalMonthly, interest: row.monthlyInterest, principal: row.monthlyPrincipal,
        reference: String(options.reference || "").trim(), paidAt: new Date().toISOString(), paidBy: adminUser
      };
      this.getFunderPayments().push(payment);
      this.logActivity("Admin", adminUser, `ACCOUNTING marked ${row.funderName} as paid for ${m} (₱${payment.amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })})`, funderId, {
        actorId: "ADMIN-01", recordType: "Accounting", deferSave: true, details: payment
      });
      this.save();
      return { success: true, payment };
    }

    undoFunderPaid(funderId, month, options = {}) {
      const m = HelloSolarStore.monthOf(month);
      const list = this.getFunderPayments();
      const i = list.findIndex(p => p.funderId === funderId && p.month === m);
      if (i < 0) return { success: false, error: "This payment is not marked as paid." };
      const [removed] = list.splice(i, 1);
      this.logActivity("Admin", options.adminUser || "ADMIN (Limuel)", `ACCOUNTING undid the ${m} payment to ${removed.funderName}`, funderId, {
        actorId: "ADMIN-01", recordType: "Accounting", deferSave: true, details: { funderId, month: m }
      });
      this.save();
      return { success: true };
    }

    // Refunds paid out (refunded down payments / site visit fees + approved reimbursements not tied to one)
    getRefundsPaid() {
      const rows = [];
      const linked = new Set();
      this.getClientPayments().filter(r => r.refund && r.refund.status === "Refunded").forEach(r => {
        if (r.refund.reimbursementId) linked.add(r.refund.reimbursementId);
        rows.push({ ref: r.ref, client: r.client, type: r.type, amount: Number(r.refund.amount) || r.amount, date: r.refund.refundedAt, reference: r.refund.reference || "" });
      });
      this.getReimbursements().filter(x => x.status === "Approved" && !linked.has(x.id)).forEach(x => {
        rows.push({ ref: x.appId || x.id, client: x.customer, type: x.type || "Reimbursement", amount: Number(x.amount) || 0, date: x.resolvedAt, reference: x.reference || "" });
      });
      return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }

    // Overview numbers for one month ("YYYY-MM", default this month)
    getMoneySummary(month) {
      const m = HelloSolarStore.monthOf(month) || HelloSolarStore.todayISO().slice(0, 7);
      const r2 = n => Math.round(n * 100) / 100;
      const inMonth = d => HelloSolarStore.monthOf(d) === m;
      const payments = this.getAllPayments();
      const customers = payments.filter(r => r.status === "Verified" && inMonth(r.date));
      const loans = this.getFunderLoansReceived().filter(l => l.received && inMonth(l.date));
      const due = this.getFunderPaymentsDue(m);
      const refunds = this.getRefundsPaid().filter(r => inMonth(r.date));
      const costs = (this.getDirectInstallationCosts ? this.getDirectInstallationCosts() : []).filter(c => c.isSet && inMonth(c.updatedAt));
      const sum = list => r2(list.reduce((s, x) => s + (Number(x.amount ?? x.total) || 0), 0));
      const toCheck = payments.filter(r => r.status === "Pending Verification");
      const moneyIn = { customers: sum(customers), customerCount: customers.length, funders: sum(loans), funderCount: loans.length };
      moneyIn.total = r2(moneyIn.customers + moneyIn.funders);
      const moneyOut = { funders: due.paidTotal, funderCount: this.getFunderPayments().filter(p => p.month === m).length, refunds: sum(refunds), refundCount: refunds.length, costs: sum(costs), costCount: costs.length };
      moneyOut.total = r2(moneyOut.funders + moneyOut.refunds + moneyOut.costs);
      return {
        month: m, moneyIn, moneyOut,
        stillToPay: { amount: due.unpaidTotal, count: due.unpaidCount },
        toCheck: { count: toCheck.length, amount: sum(toCheck), rows: toCheck }
      };
    }

    // --- IMMEDIATE SYSTEM DISCONNECT (backend-ready; NO hardware action happens in the frontend) ---
    // Flow: Super Admin request → systemConnectionStatus "Disconnect Requested" + queued in data.disconnectRequests
    // (outbox for the backend / inverter API) → backend calls confirmSystemDisconnect() → "Disconnected".
    // Real stored HS ID only — never derived from the APP ID. Returns null when not assigned.
    getAppHsId(app) {
      const hsId = typeof app?.hsId === "string" ? app.hsId.trim() : "";
      return hsId || null;
    }

    getSystemConnectionStatus(app) {
      return app?.systemConnectionStatus || "Connected";
    }

    // --- INSTALLATION COST (Hello Solar Direct projects only, per APP ID) ---
    isDirectInstallApplication(app) {
      if (!app) return false;
      return app.installerType === "Hello Solar Direct" ||
        String(app.installer || "").trim().toLowerCase() === "hello solar internal team";
    }

    getInstallationCost(app) {
      const c = app?.installationCost || {};
      const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v) * 100) / 100 : 0);
      const materials = num(c.materials), labor = num(c.labor), transportMisc = num(c.transportMisc);
      return {
        materials, labor, transportMisc,
        total: Math.round((materials + labor + transportMisc) * 100) / 100,
        isSet: Boolean(app?.installationCost),
        updatedAt: c.updatedAt || null,
        updatedBy: c.updatedBy || null
      };
    }

    getDirectInstallationCosts() {
      const apps = this.getApplications ? this.getApplications() : (this.data.applications || []);
      return apps.filter(a => this.isDirectInstallApplication(a)).map(app => ({
        appId: app.id,
        hsId: this.getAppHsId ? this.getAppHsId(app) : (app.hsId || null),
        customer: app.customer || "—",
        location: app.location || "",
        system: app.system || "",
        stage: app.stage || "",
        ...this.getInstallationCost(app)
      }));
    }

    setInstallationCost(appId, values = {}, options = {}) {
      if (options.actorRole && options.actorRole !== "super-admin") return { success: false, error: "Only Super Admin can update installation cost." };
      const app = (this.data.applications || []).find(a => a.id === appId);
      if (!app) return { success: false, error: "Application not found." };
      if (!this.isDirectInstallApplication(app)) return { success: false, error: `${appId} is not a Hello Solar Installation project.` };
      const fields = { materials: "Materials", labor: "Labor", transportMisc: "Transport / Misc" };
      const clean = {};
      for (const [key, label] of Object.entries(fields)) {
        const raw = values[key];
        const n = raw === "" || raw === null || raw === undefined ? 0 : Number(raw);
        if (!Number.isFinite(n) || n < 0) return { success: false, error: `${label} must be a valid amount of 0 or more.` };
        if (n > 100000000) return { success: false, error: `${label} is too large.` };
        clean[key] = Math.round(n * 100) / 100;
      }
      const admin = options.adminUser || "ADMIN (Limuel)";
      const prev = app.installationCost ? this.getInstallationCost(app) : null;
      app.installationCost = { ...clean, updatedAt: new Date().toISOString(), updatedBy: admin };
      const cost = this.getInstallationCost(app);
      this.logActivity("Admin", admin, `ADMIN updated Installation Cost for ${appId} — Total ₱${cost.total.toLocaleString("en-PH")}`, appId, {
        recordType: "Installation Cost", deferSave: true,
        details: { appId, previous: prev ? { materials: prev.materials, labor: prev.labor, transportMisc: prev.transportMisc, total: prev.total } : null, materials: cost.materials, labor: cost.labor, transportMisc: cost.transportMisc, total: cost.total }
      });
      this.save();
      return { success: true, cost };
    }

    requestSystemDisconnect(appId, options = {}) {
      if (options.actorRole !== "super-admin") return { success: false, error: "Only Super Admin can request a system disconnect." };
      const app = (this.data.applications || []).find(a => a.id === appId);
      if (!app) return { success: false, error: "Application not found." };
      const reason = String(options.reason || "").trim();
      if (reason.length < 5) return { success: false, error: "A disconnect reason (at least 5 characters) is required." };
      const current = this.getSystemConnectionStatus(app);
      if (current === "Disconnect Requested") return { success: false, error: `A disconnect request for ${appId} is already pending backend confirmation.` };
      if (current === "Disconnected") return { success: false, error: `${appId} is already disconnected.` };

      const hsId = this.getAppHsId(app);
      if (!hsId) return { success: false, error: `${appId} has no HS ID assigned. A valid HS ID is required before a system disconnect can be requested.` };
      const admin = options.adminUser || "ADMIN (Limuel)";
      const now = new Date();
      const request = {
        requestId: `DSC-${String(appId).replace("APP-", "")}-${now.getTime()}`,
        appId,
        hsId,
        customer: app.customer || null,
        reason,
        requestedBy: admin,
        requestedAt: now.toISOString(),
        status: "Pending API Confirmation",
        apiReference: null,
        confirmedAt: null
      };
      app.systemConnectionStatus = "Disconnect Requested";
      app.disconnectRequest = request;
      if (!Array.isArray(this.data.disconnectRequests)) this.data.disconnectRequests = [];
      this.data.disconnectRequests.unshift({ ...request });

      this.logActivity("Admin", admin,
        `Immediate system disconnect REQUESTED for ${appId} (${hsId}) — awaiting backend/inverter API confirmation. Reason: ${reason}`,
        appId, {
          recordType: "System Disconnect", deferSave: true,
          details: { requestId: request.requestId, appId, hsId, admin, reason, requestedAt: request.requestedAt, status: "Disconnect Requested" }
        });
      this.save();
      return { success: true, request };
    }

    // Backend/API callback ONLY (inverter disconnect confirmed). Not wired to any frontend button.
    confirmSystemDisconnect(appId, confirmation = {}) {
      const app = (this.data.applications || []).find(a => a.id === appId);
      if (!app) return { success: false, error: "Application not found." };
      if (this.getSystemConnectionStatus(app) !== "Disconnect Requested" || !app.disconnectRequest) {
        return { success: false, error: "No pending disconnect request to confirm." };
      }
      if (!confirmation.apiReference) return { success: false, error: "Backend confirmation reference (apiReference) is required." };
      const confirmedAt = confirmation.confirmedAt || new Date().toISOString();
      app.systemConnectionStatus = "Disconnected";
      Object.assign(app.disconnectRequest, { status: "Confirmed", apiReference: confirmation.apiReference, confirmedAt });
      const queued = (this.data.disconnectRequests || []).find(r => r.requestId === app.disconnectRequest.requestId);
      if (queued) Object.assign(queued, { status: "Confirmed", apiReference: confirmation.apiReference, confirmedAt });

      this.logActivity("System", "SYSTEM (Inverter API)",
        `System ${appId} (${app.disconnectRequest.hsId}) DISCONNECTED — confirmed by backend (ref ${confirmation.apiReference})`,
        appId, {
          recordType: "System Disconnect", deferSave: true,
          details: { requestId: app.disconnectRequest.requestId, appId, hsId: app.disconnectRequest.hsId, apiReference: confirmation.apiReference, confirmedAt, status: "Disconnected" }
        });
      this.save();
      return { success: true, app };
    }

    // Owner on a specific date (for already-collected payments). Reuses getFinancerContract; an early termination
    // only applies from when it was recorded (contractUpdatedAt), so payments collected before it stay with the financer.
    getFinancerOwnerOn(financer, dateISO) {
      const day = String(dateISO || "").slice(0, 10);
      const terminatedOn = financer.contractStatusOverride === "Terminated" && financer.contractUpdatedAt
        ? HelloSolarStore.todayISO(financer.contractUpdatedAt) : null;
      const view = terminatedOn && day < terminatedOn ? { ...financer, contractStatusOverride: null } : financer;
      return this.getFinancerContract(view, day + "T12:00:00");
    }

    // Down payment (₱10,000 Installment, ₱500 Full Payment). Applications created before this field existed count as verified.
    downPaymentAmount(app) {
      return downPaymentAmountFor(app);
    }

    downPaymentState(app) {
      return (app && app.downPaymentStatus) || "Verified";
    }

    verifyDownPayment(appId, options = {}) {
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return { success: false, error: "Application not found" };
      if (this.downPaymentState(app) === "Verified") return { success: false, error: "The down payment is already verified." };
      const adminUser = options.adminUser || "ADMIN (Limuel)";
      app.downPaymentStatus = "Verified";
      app.downPaymentVerifiedAt = new Date().toISOString();
      app.downPaymentVerifiedBy = adminUser;
      if (app.downPaymentProof) app.downPaymentProof.status = "Verified";
      // Keep the Contact Inquiry's copy of the receipt in step with the application
      const inq = (this.data.inquiries || []).find(i => i.id === app.inquiryId);
      if (inq && inq.paymentProof) inq.paymentProof.status = "Verified";
      app.updated = "Just now";
      this.logActivity("Admin", adminUser,
        `ADMIN verified the ₱${downPaymentAmountFor(app).toLocaleString("en-PH")} down payment for ${appId} (${app.customer})`,
        appId, {
          actorId: "ADMIN-01", recordType: "Application", deferSave: true,
          details: { appId, downPaymentAmount: downPaymentAmountFor(app), receipt: app.downPaymentProof ? app.downPaymentProof.fileName : null, referenceNo: app.downPaymentProof ? app.downPaymentProof.referenceNo || null : null, status: "Verified" }
        });
      this.save();
      return { success: true, app };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SITE VISITS (landing page "Request Assessment" → ₱1,000 site visit fee)
    // ─────────────────────────────────────────────────────────────────────────
    _siteVisits() {
      if (!Array.isArray(this.data.siteVisits)) this.data.siteVisits = [];
      return this.data.siteVisits;
    }

    // Creates one site visit per landing page Site Assessment inquiry (imported once by inquiry id)
    syncSiteVisits() {
      const visits = this._siteVisits();
      const known = new Set(visits.map(v => v.inquiryId));
      let added = 0;
      (this.data.inquiries || []).forEach(inq => {
        if (!inq || inq.requestType !== "Site Assessment" || known.has(inq.id)) return;
        let max = 1000;
        visits.forEach(v => { const n = parseInt(String(v.id).replace(/\D/g, ""), 10); if (n > max) max = n; });
        const proof = inq.paymentProof || null;
        visits.unshift({
          id: `SV-${max + 1}`,
          inquiryId: inq.id,
          customer: inq.name || `${inq.firstName || ""} ${inq.lastName || ""}`.trim(),
          email: inq.email || "", phone: inq.phone || "",
          location: inq.location || "", address: inq.address || null,
          packageId: inq.packageId || null, package: inq.selectedSolarModel || inq.package || "",
          preferredDate: inq.preferredVisitDate || "", scheduledDate: inq.preferredVisitDate || "", scheduledTime: "",
          status: "Pending Assignment", assignee: null,
          fee: Number(proof && proof.amount) || 1000,
          feePaymentStatus: proof ? "Pending Verification" : "Not Submitted",
          feeProof: proof ? { ...proof } : null,
          clientDecision: null, refund: null,
          createdAt: inq.timestamp || new Date().toISOString(), completedAt: null, notes: ""
        });
        known.add(inq.id);
        added++;
      });
      if (added) this.save();
      return added;
    }

    getSiteVisits() {
      this.getInquiries(); // imports new landing page requests
      return this._siteVisits();
    }

    // People who can be sent on a site visit: registered partner installers, Direct Installation Engineers, or someone else
    getSiteVisitAssignees() {
      return {
        installers: (this.data.installers || []).filter(i => i.status !== "Inactive").map(i => ({ id: i.id, name: i.name, contact: i.contact || "", phone: i.phone || "", type: i.type })),
        engineers: (this.data.engineers || []).filter(e => e.status !== "Inactive" && e.status !== "Suspended").map(e => ({ id: e.id, name: e.name, contact: e.email || "", phone: e.phone || "" }))
      };
    }

    assignSiteVisit(visitId, assignment = {}, options = {}) {
      const v = this._siteVisits().find(x => x.id === visitId);
      if (!v) return { success: false, error: "Site visit not found." };
      if (v.status === "Completed" || v.status === "Cancelled") return { success: false, error: `This site visit is already ${v.status.toLowerCase()}.` };
      const adminUser = options.adminUser || "ADMIN (Limuel)";
      let assignee;
      if (assignment.type === "installer") {
        const ins = (this.data.installers || []).find(i => i.id === assignment.refId);
        if (!ins) return { success: false, error: "Choose a registered installer." };
        assignee = { type: "installer", refId: ins.id, name: ins.name, contact: ins.contact || "", phone: ins.phone || "" };
      } else if (assignment.type === "engineer") {
        const eng = (this.data.engineers || []).find(e => e.id === assignment.refId);
        if (!eng) return { success: false, error: "Choose a registered engineer." };
        assignee = { type: "engineer", refId: eng.id, name: eng.name, contact: eng.email || "", phone: eng.phone || "" };
      } else if (assignment.type === "other") {
        const name = String(assignment.name || "").trim();
        if (name.length < 2) return { success: false, error: "Enter the name of the person assigned." };
        if (!assignment.document || !assignment.document.fileName) return { success: false, error: "Upload an ID or authorization document for this person." };
        assignee = { type: "other", refId: null, name, contact: String(assignment.contact || "").trim(), phone: String(assignment.phone || "").trim(),
          document: { fileName: assignment.document.fileName, fileType: assignment.document.fileType || "", dataUrl: assignment.document.dataUrl || null } };
      } else {
        return { success: false, error: "Choose who will do the site visit." };
      }
      if (assignment.scheduledDate) v.scheduledDate = assignment.scheduledDate;
      if (assignment.scheduledTime !== undefined) v.scheduledTime = assignment.scheduledTime;
      v.assignee = assignee;
      v.status = "Scheduled";
      v.assignedAt = new Date().toISOString();
      v.updatedAt = v.assignedAt;
      this.logActivity("Admin", adminUser, `ADMIN assigned site visit ${v.id} (${v.customer}) to ${assignee.name}${v.scheduledDate ? ` on ${v.scheduledDate}` : ""}`, v.id, {
        actorId: "ADMIN-01", recordType: "Site Visit", deferSave: true,
        details: { visitId: v.id, assigneeType: assignee.type, assignee: assignee.name, scheduledDate: v.scheduledDate, scheduledTime: v.scheduledTime }
      });
      this.save();
      return { success: true, visit: v };
    }

    verifySiteVisitFee(visitId, options = {}) {
      const v = this._siteVisits().find(x => x.id === visitId);
      if (!v) return { success: false, error: "Site visit not found." };
      if (v.feePaymentStatus === "Verified") return { success: false, error: "The site visit fee is already verified." };
      v.feePaymentStatus = "Verified";
      v.feeVerifiedAt = new Date().toISOString();
      if (v.feeProof) v.feeProof.status = "Verified";
      this.logActivity("Admin", options.adminUser || "ADMIN (Limuel)", `ADMIN verified the ₱${Number(v.fee).toLocaleString("en-PH")} site visit fee for ${v.id} (${v.customer})`, v.id, {
        actorId: "ADMIN-01", recordType: "Site Visit", deferSave: true, details: { visitId: v.id, amount: v.fee, status: "Verified" }
      });
      this.save();
      return { success: true, visit: v };
    }

    updateSiteVisitStatus(visitId, status, options = {}) {
      const v = this._siteVisits().find(x => x.id === visitId);
      if (!v) return { success: false, error: "Site visit not found." };
      if (!["Completed", "Cancelled", "Scheduled"].includes(status)) return { success: false, error: "Unknown status." };
      if (status === "Completed" && !v.assignee) return { success: false, error: "Assign someone before completing the visit." };
      v.status = status;
      v.updatedAt = new Date().toISOString();
      if (status === "Completed") {
        v.completedAt = v.updatedAt;
        // Visit Confirmed → the client receives the "continue with your installation?" link
        v.continueLink = this._continueLinkFor(v);
        v.continueLinkSentAt = v.updatedAt;
        if (!v.continueResponse) v.continueResponse = "Awaiting Response";
      }
      if (options.notes) v.notes = options.notes;
      this.logActivity(options.role || "Admin", options.user || "ADMIN (Limuel)", `${options.user || "ADMIN"} marked site visit ${v.id} (${v.customer}) as ${status}`, v.id, {
        actorId: options.actorId || "ADMIN-01", recordType: "Site Visit", deferSave: true, details: { visitId: v.id, status, notes: options.notes || "" }
      });
      this.save();
      return { success: true, visit: v };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CLIENT PAYMENTS (Accounting): ₱500 / ₱10,000 reservation deposits and ₱1,000 site visit fees
    // Policy (landing page Terms): the deposit is refundable when the client does NOT proceed and is deducted
    // from the system price when they proceed. The site visit fee is deducted when they proceed and is
    // non-refundable when they do not.
    // ─────────────────────────────────────────────────────────────────────────
    _clientRecord(kind, id) {
      if (kind === "dp") return (this.data.applications || []).find(a => a.id === id) || null;
      if (kind === "sv") return this._siteVisits().find(v => v.id === id) || null;
      return null;
    }

    clientDecisionFor(kind, rec) {
      if (!rec) return "Awaiting";
      if (rec.clientDecision) return rec.clientDecision;
      if (kind === "dp") {
        if (["Declined", "Cancelled"].includes(rec.stage)) return "Not Proceeding";
        const job = (this.data.installations || []).some(j => j.appId === rec.id && j.status !== "Cancelled");
        if (job || ["Approved", "Ready for Installation", "Installation", "In Progress", "Completed", "Installation Completed"].includes(rec.stage)) return "Proceeding";
        return "Awaiting";
      }
      // Site visit: the client proceeded once they have an application
      const email = String(rec.email || "").toLowerCase();
      const phone = String(rec.phone || "").replace(/\D/g, "").slice(-10);
      const hasApp = (this.data.applications || []).some(a => a.stage !== "Declined" &&
        ((email && String(a.email || "").toLowerCase() === email) || (phone && String(a.phone || "").replace(/\D/g, "").slice(-10) === phone)));
      return hasApp ? "Proceeding" : "Awaiting";
    }

    getClientPayments() {
      const rows = [];
      (this.data.applications || []).forEach(app => {
        rows.push(this._clientPaymentRow("dp", app, {
          ref: app.id, client: app.customer, customerId: app.customerId, type: "Down Payment",
          amount: downPaymentAmountFor(app),
          paymentStatus: this.downPaymentState(app), proof: app.downPaymentProof || null
        }));
      });
      this.getSiteVisits().forEach(v => {
        rows.push(this._clientPaymentRow("sv", v, {
          ref: v.id, client: v.customer, customerId: null, type: "Site Visit Fee",
          amount: Number(v.fee || 1000), paymentStatus: v.feePaymentStatus || "Not Submitted", proof: v.feeProof || null
        }));
      });
      return rows;
    }

    _clientPaymentRow(kind, rec, base) {
      const decision = this.clientDecisionFor(kind, rec);
      let refundStatus;
      if (rec.refund && rec.refund.status === "Refunded") refundStatus = "Refunded";
      else if (base.paymentStatus !== "Verified") refundStatus = "Awaiting Verification";
      else if (decision === "Proceeding") refundStatus = "Deducted from Price";
      else if (decision === "Not Proceeding") refundStatus = kind === "dp" ? "Eligible for Refund" : "Non-refundable";
      else refundStatus = "Pending Decision";
      return { kind, id: rec.id, ...base, hasReceipt: !!(base.proof && base.proof.dataUrl), decision, refundStatus, refund: rec.refund || null };
    }

    setClientDecision(kind, id, decision, options = {}) {
      const rec = this._clientRecord(kind, id);
      if (!rec) return { success: false, error: "Record not found." };
      if (!["Proceeding", "Not Proceeding"].includes(decision)) return { success: false, error: "Unknown decision." };
      if (rec.refund && rec.refund.status === "Refunded") return { success: false, error: "This payment was already refunded." };
      rec.clientDecision = decision;
      const label = kind === "dp" ? "down payment" : "site visit fee";
      const effect = decision === "Proceeding" ? "deducted from the system price" : (kind === "dp" ? "refundable" : "non-refundable");
      this.logActivity("Admin", options.adminUser || "ADMIN (Limuel)", `ACCOUNTING marked ${id} as ${decision} with installation (${label} ${effect})`, id, {
        actorId: "ADMIN-01", recordType: "Accounting", deferSave: true, details: { kind, id, decision }
      });
      this.save();
      return { success: true };
    }

    refundClientPayment(kind, id, payload = {}, options = {}) {
      const rec = this._clientRecord(kind, id);
      if (!rec) return { success: false, error: "Record not found." };
      const row = kind === "dp"
        ? this._clientPaymentRow("dp", rec, { paymentStatus: this.downPaymentState(rec), amount: downPaymentAmountFor(rec) })
        : this._clientPaymentRow("sv", rec, { paymentStatus: rec.feePaymentStatus, amount: Number(rec.fee || 1000) });
      if (row.refundStatus === "Refunded") return { success: false, error: "This payment was already refunded." };
      if (row.refundStatus === "Awaiting Verification") return { success: false, error: "Verify the payment before refunding it." };
      if (row.refundStatus === "Non-refundable") return { success: false, error: "The site visit fee is non-refundable when the client does not proceed." };
      if (row.refundStatus === "Deducted from Price") return { success: false, error: "The client proceeded, so this payment is deducted from the system price." };
      if (row.refundStatus !== "Eligible for Refund") return { success: false, error: "A deposit is refunded only when the client does not proceed with the purchase." };
      const amount = Number(payload.amount) > 0 ? Number(payload.amount) : row.amount;
      rec.refund = {
        status: "Refunded", amount, method: payload.method || "Bank Transfer", reference: String(payload.reference || "").trim(),
        notes: String(payload.notes || "").trim(), refundedAt: new Date().toISOString(), refundedBy: options.adminUser || "ADMIN (Limuel)",
        reimbursementId: payload.reimbursementId || null
      };
      this.logActivity("Admin", rec.refund.refundedBy, `ACCOUNTING refunded ₱${amount.toLocaleString("en-PH")} ${kind === "dp" ? "down payment" : "site visit fee"} for ${id}`, id, {
        actorId: "ADMIN-01", recordType: "Accounting", deferSave: true, details: { kind, id, ...rec.refund }
      });
      if (kind === "dp" && rec.customerId && typeof window !== "undefined" && window.HSShared && window.HSShared.notify) {
        window.HSShared.notify({ recipientRole: "customer", recipientId: rec.customerId, eventType: "DOWN_PAYMENT_REFUNDED", recordId: id,
          title: "Down payment refunded", message: `Your ₱${amount.toLocaleString("en-PH")} down payment for ${id} has been refunded.`, targetUrl: "payments.html", actionLabel: "View Payments" });
      }
      this.save();
      return { success: true, refund: rec.refund };
    }

    // Reimbursement requests filed by customers (Customer portal → Payments)
    getReimbursements() {
      if (!Array.isArray(this.data.reimbursements)) this.data.reimbursements = [];
      return this.data.reimbursements;
    }

    resolveReimbursement(id, decision, payload = {}, options = {}) {
      const r = this.getReimbursements().find(x => x.id === id);
      if (!r) return { success: false, error: "Reimbursement request not found." };
      if (r.status !== "Pending") return { success: false, error: `This request is already ${r.status.toLowerCase()}.` };
      if (!["Approved", "Declined"].includes(decision)) return { success: false, error: "Unknown decision." };
      const note = String(payload.note || "").trim();
      if (decision === "Declined" && note.length < 3) return { success: false, error: "Add a short reason for declining." };
      const adminUser = options.adminUser || "ADMIN (Limuel)";
      r.status = decision;
      r.resolvedAt = new Date().toISOString();
      r.resolvedBy = adminUser;
      r.resolutionNote = note;
      r.reference = String(payload.reference || "").trim();
      // An approved down payment reimbursement also records the down payment as refunded
      if (decision === "Approved" && r.type === "Down Payment" && r.appId) {
        const app = (this.data.applications || []).find(a => a.id === r.appId);
        if (app && !(app.refund && app.refund.status === "Refunded")) {
          app.refund = { status: "Refunded", amount: r.amount, method: payload.method || "Bank Transfer", reference: r.reference, notes: `Reimbursement ${r.id}`,
            refundedAt: r.resolvedAt, refundedBy: adminUser, reimbursementId: r.id };
        }
      }
      this.logActivity("Admin", adminUser, `ACCOUNTING ${decision.toLowerCase()} reimbursement ${r.id} (${r.customer}, ₱${Number(r.amount).toLocaleString("en-PH")})`, r.appId || r.id, {
        actorId: "ADMIN-01", recordType: "Accounting", deferSave: true, details: { reimbursementId: r.id, decision, amount: r.amount, note, reference: r.reference }
      });
      if (r.customerId && typeof window !== "undefined" && window.HSShared && window.HSShared.notify) {
        window.HSShared.notify({ recipientRole: "customer", recipientId: r.customerId, eventType: `REIMBURSEMENT_${decision.toUpperCase()}`, recordId: r.id,
          title: `Reimbursement ${decision.toLowerCase()}`, message: decision === "Approved"
            ? `Your reimbursement request ${r.id} for ₱${Number(r.amount).toLocaleString("en-PH")} was approved.`
            : `Your reimbursement request ${r.id} was declined: ${note}`, targetUrl: "payments.html", actionLabel: "View Payments" });
      }
      this.save();
      return { success: true, request: r };
    }

    verifyPaymentReceipt(appId, options = {}) {
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return { success: false, error: "Application not found" };

      const adminUser = options.adminUser || "ADMIN (Limuel)";
      app.paymentStatus = "Verified / Paid";
      app.stage = "Ready for Installation";
      app.receiptVerificationStatus = "Verified";
      app.verifiedAt = new Date().toISOString();
      app.verifiedBy = adminUser;
      app.updated = "Just now";

      const schedule = this.getPaymentSchedule(appId);
      if (schedule) {
        if (schedule.installments && schedule.installments[0]) {
          schedule.installments[0].status = "Paid";
          schedule.installments[0].paidDate = app.receiptUploadedAt || "2026-09-28";
          schedule.installments[0].paidAmount = app.amount;
        }
        if (!schedule.history) schedule.history = [];
        schedule.history.unshift({
          id: `REC-${appId.replace('APP-', '')}-${Date.now().toString().slice(-4)}`,
          appId,
          date: app.receiptUploadedAt || "2026-09-28",
          amount: app.amount,
          method: app.receiptBank || "Bank Transfer",
          ref: app.receiptReference || `HS-FULL-${appId.replace('APP-', '')}`,
          status: "Verified",
          recordedBy: adminUser,
          installmentNo: 1,
          notes: "Full payment receipt verified by Super Admin. Project cleared for installation."
        });
      }

      this.logActivity(
        "Admin",
        adminUser,
        `ADMIN verified full payment receipt for ${appId} (${app.customer}). Application stage updated to Ready for Installation.`,
        appId,
        {
          actorId: "ADMIN-01",
          recordType: "Payment",
          details: { appId, amount: app.amount, status: app.paymentStatus, stage: app.stage }
        }
      );

      this.save();
      return { success: true, app };
    }

    rejectPaymentReceipt(appId, options = {}) {
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return { success: false, error: "Application not found" };

      const adminUser = options.adminUser || "ADMIN (Limuel)";
      const reason = options.reason || "Invalid receipt image or amount mismatch";
      app.paymentStatus = "Rejected / Reupload Required";
      app.stage = "Payment Required";
      app.receiptVerificationStatus = "Rejected";
      app.rejectionReason = reason;
      app.rejectedAt = new Date().toISOString();
      app.rejectedBy = adminUser;
      app.updated = "Just now";

      this.logActivity(
        "Admin",
        adminUser,
        `ADMIN rejected full payment receipt for ${appId} (${app.customer}): ${reason}. Payment status set to Rejected / Reupload Required.`,
        appId,
        {
          actorId: "ADMIN-01",
          recordType: "Payment",
          details: { appId, reason, status: app.paymentStatus, stage: app.stage }
        }
      );

      this.save();
      return { success: true, app };
    }

    uploadCustomerReceipt(appId, options = {}) {
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return { success: false, error: "Application not found" };

      app.uploadedReceipt = options.receipt || `bdo_transfer_receipt_${appId.toLowerCase().replace(/[^a-z0-9]/g, '')}.png`;
      app.receiptUploadedAt = options.date || new Date().toISOString().split("T")[0];
      app.receiptBank = options.bank || "BDO Unibank Direct Transfer";
      app.receiptReference = options.reference || `BDO-TXN-${Date.now().toString().slice(-8)}`;
      app.receiptAmount = options.amount || app.amount;
      app.paymentStatus = "Verification Required";
      app.receiptVerificationStatus = "Pending Verification";
      app.updated = "Just now";

      const schedule = this.getPaymentSchedule(appId);
      if (schedule && schedule.installments && schedule.installments[0]) {
        schedule.installments[0].status = "Verification Required";
        schedule.installments[0].reference = app.receiptReference;
      }

      this.logActivity(
        "Customer",
        app.customer,
        `Customer uploaded payment receipt for ${appId} (${app.customer}) · Status: Verification Required.`,
        appId,
        {
          actorId: app.customerId || "CUS-00",
          recordType: "Payment",
          details: { appId, receipt: app.uploadedReceipt, ref: app.receiptReference }
        }
      );

      this.save();
      return { success: true, app };
    }

    // --- INSTALLMENT RECEIPT VERIFICATION (customer-submitted, per billing period) ---
    // Full-payment receipts keep using verifyPaymentReceipt / rejectPaymentReceipt above.
    getPendingInstallmentReceipt(appId) {
      const app = this.data.applications.find(a => a.id === appId);
      if (!app || this.isFullPaymentApp(app)) return null;
      return (app.receiptSubmissions || []).find(s => s.status === "Pending Verification") || null;
    }

    isFullPaymentApp(app) {
      return (app?.paymentType || "").toLowerCase().includes("full") || app?.financer === "Not Required";
    }

    // Finds the schedule installment for a billing period: exact installment link first, then same due month,
    // then the earliest unpaid installment. Each installment is used once per receipt.
    _matchInstallment(schedule, bill, used) {
      const list = (schedule?.installments || []).filter(i => !used.has(i.no));
      const exact = String(bill.billId || "").match(/-I(\d+)$/);
      if (exact) {
        const hit = list.find(i => i.no === Number(exact[1]));
        if (hit) return hit;
      }
      const month = String(bill.dueDate || "").slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(month)) {
        const hit = list.find(i => String(i.dueDate).slice(0, 7) === month);
        if (hit) return hit;
      }
      return list.filter(i => i.status !== "Paid").sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))[0] || null;
    }

    _notifyCustomer(app, title, message, eventType) {
      if (!app?.customerId || typeof window === "undefined" || !window.HSShared) return;
      window.HSShared.notify({ recipientRole: "customer", recipientId: app.customerId, eventType, recordId: app.id, title, message, targetUrl: "payments.html", actionLabel: "View Payments" });
    }

    verifyInstallmentReceipt(appId, submissionId, options = {}) {
      this.data = this.load();
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return { success: false, error: "Application not found" };
      if (this.isFullPaymentApp(app)) return { success: false, error: "Full payment receipts use the full payment verification flow." };
      const sub = (app.receiptSubmissions || []).find(s => s.id === submissionId && s.status === "Pending Verification");
      if (!sub) return { success: false, error: "No pending receipt to verify." };

      const adminUser = options.adminUser || "ADMIN (Limuel)";
      const now = new Date().toISOString();
      const paidDate = sub.date || now.slice(0, 10);
      const schedule = this.getPaymentSchedule(appId);
      const bills = Array.isArray(sub.bills) && sub.bills.length ? sub.bills : [{ billId: null, period: null, dueDate: null, amount: sub.amount }];
      const used = new Set();
      const settled = [];
      if (!app.billStatus) app.billStatus = {};
      bills.forEach(bill => {
        const inst = this._matchInstallment(schedule, bill, used);
        if (inst) {
          used.add(inst.no);
          inst.status = "Paid";
          inst.paidDate = paidDate;
          inst.paidAmount = Number(bill.amount) || inst.amount;
          inst.reference = sub.reference || inst.reference;
          inst.notes = `Customer receipt ${sub.id} verified by ${adminUser}.`;
          settled.push(inst.no);
        }
        if (bill.billId) {
          app.billStatus[bill.billId] = { status: "Paid", period: bill.period, dueDate: bill.dueDate, amount: bill.amount, submissionId: sub.id, installmentNo: inst ? inst.no : null, at: now };
        }
        if (schedule) {
          if (!schedule.history) schedule.history = [];
          schedule.history.unshift({
            id: `REC-${appId.replace("APP-", "")}-${Date.now().toString().slice(-5)}${settled.length}`,
            appId, date: paidDate, amount: Number(bill.amount) || (inst ? inst.amount : 0),
            method: sub.channel || "Customer Upload", ref: sub.reference || sub.id, status: "Verified",
            recordedBy: adminUser, installmentNo: inst ? inst.no : null,
            notes: `Installment receipt ${sub.id}${bill.period ? " for " + bill.period : ""} verified.`
          });
        }
      });

      sub.status = "Verified";
      sub.verifiedAt = now;
      sub.verifiedBy = adminUser;
      app.receiptVerificationStatus = "Verified";
      delete app.rejectionReason;
      const info = this.calculatePaymentStatus(app);
      app.paymentStatus = info.status;
      app.nextDue = info.nextDue;
      app.updated = "Just now";
      this.logActivity("Admin", adminUser,
        `ADMIN verified installment receipt ${sub.id} for ${appId} (${app.customer}) · installment${settled.length === 1 ? "" : "s"} #${settled.join(", #") || "—"} marked Paid.`,
        appId, { actorId: "ADMIN-01", recordType: "Payment", details: { appId, submissionId: sub.id, installments: settled, status: "Verified" } });
      this.save();
      this._notifyCustomer(app, "Payment Verified", `Your payment receipt for ${appId} was verified. ${bills.map(b => b.period).filter(Boolean).join(", ") || "The billing period"} is now marked Paid.`, "payment_verified");
      return { success: true, app, installments: settled };
    }

    rejectInstallmentReceipt(appId, submissionId, options = {}) {
      this.data = this.load();
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return { success: false, error: "Application not found" };
      if (this.isFullPaymentApp(app)) return { success: false, error: "Full payment receipts use the full payment verification flow." };
      const sub = (app.receiptSubmissions || []).find(s => s.id === submissionId && s.status === "Pending Verification");
      if (!sub) return { success: false, error: "No pending receipt to reject." };
      const reason = String(options.reason || "").trim() || "Receipt could not be matched to the billing amount or reference";

      const adminUser = options.adminUser || "ADMIN (Limuel)";
      const now = new Date().toISOString();
      const schedule = this.getPaymentSchedule(appId);
      const used = new Set();
      const flagged = [];
      if (!app.billStatus) app.billStatus = {};
      (sub.bills || []).forEach(bill => {
        const inst = this._matchInstallment(schedule, bill, used);
        if (inst && inst.status !== "Paid") {
          used.add(inst.no);
          inst.status = "Re-upload Required";
          inst.notes = `Customer receipt ${sub.id} rejected: ${reason}`;
          flagged.push(inst.no);
        }
        if (bill.billId && app.billStatus[bill.billId]?.status !== "Paid") {
          app.billStatus[bill.billId] = { status: "Re-upload Required", period: bill.period, dueDate: bill.dueDate, amount: bill.amount, submissionId: sub.id, installmentNo: inst ? inst.no : null, reason, at: now };
        }
      });

      sub.status = "Re-upload Required";
      sub.rejectedAt = now;
      sub.rejectedBy = adminUser;
      sub.reason = reason;
      app.receiptVerificationStatus = "Rejected";
      app.rejectionReason = reason;
      const info = this.calculatePaymentStatus(app);
      app.paymentStatus = info.status;
      app.nextDue = info.nextDue;
      app.updated = "Just now";
      this.logActivity("Admin", adminUser,
        `ADMIN rejected installment receipt ${sub.id} for ${appId} (${app.customer}): ${reason}. Re-upload required.`,
        appId, { actorId: "ADMIN-01", recordType: "Payment", details: { appId, submissionId: sub.id, installments: flagged, reason, status: "Re-upload Required" } });
      this.save();
      this._notifyCustomer(app, "Receipt Re-upload Required", `Your payment receipt for ${appId} was not accepted: ${reason}. Please upload a new receipt.`, "payment_reupload");
      return { success: true, app, installments: flagged };
    }

    // --- FINANCER ASSIGNMENT (installment applications) ---
    // Only Active financers with an Active contract can receive applications (same rule as funding ownership).
    getAssignableFinancers(asOf) {
      return (this.data.financers || []).filter(f =>
        f.status === "Active" && this.getFinancerContract(f, asOf).status === "Active");
    }

    assignFinancer(appId, financerId, options = {}) {
      this.data = this.load();
      const app = this.data.applications.find(a => a.id === appId);
      if (!app) return { success: false, error: "Application not found" };
      if (this.isFullPaymentApp(app)) return { success: false, error: "Full payment applications do not need a financer." };
      if (app.stage === "Declined") return { success: false, error: "Declined applications cannot be assigned to a financer." };
      const financer = (this.data.financers || []).find(f => f.id === financerId);
      if (!financer) return { success: false, error: "Financer not found" };
      if (financer.status !== "Active") return { success: false, error: `${financer.name} is not an active financer account.` };
      const contract = this.getFinancerContract(financer, options.asOf);
      if (contract.status !== "Active") return { success: false, error: `${financer.name} cannot receive applications: contract is ${String(contract.status).toLowerCase()}.` };

      const adminUser = options.adminUser || "ADMIN (Limuel)";
      const previous = app.financerId ? `${app.financer} (${app.financerId})` : null;
      app.financerId = financer.id;
      app.financer = financer.name;
      app.fundingOwner = contract.ownerName;
      app.fundingOwnerId = contract.ownerId;
      if (!app.stage || app.stage === "Submitted") app.stage = "Financing Review";
      app.updated = "Just now";
      app.notes = (app.notes ? app.notes + " • " : "") + `Assigned to financer ${financer.name} (${financer.id}).`;
      this.logActivity("Admin", adminUser,
        `ADMIN assigned ${appId} (${app.customer}) to financer ${financer.id} (${financer.name})${previous ? ` — previously ${previous}` : ""}`,
        appId, { actorId: "ADMIN-01", recordType: "Application", details: { appId, financerId: financer.id, financer: financer.name, previous } });
      this.save();
      if (typeof window !== "undefined" && window.HSShared) {
        window.HSShared.notify({
          recipientRole: "financer", recipientId: financer.id, eventType: "application_assigned", recordId: appId,
          title: "New Financing Application", message: `${appId} (${app.customer}) was assigned to you for financing review.`,
          targetUrl: "applications.html", actionLabel: "Review Application"
        });
      }
      return { success: true, app, financer };
    }

    getPaymentActivity(appId) {
      return this.data.activity.filter(a => 
        a.record === appId || 
        (a.action && a.action.toLowerCase().includes("payment") && a.action.includes(appId)) ||
        (a.action && a.action.toLowerCase().includes("amortization") && a.action.includes(appId))
      );
    }

    formatReadableDate(dateStr) {
      if (!dateStr || dateStr === "N/A" || dateStr === "—") return "—";
      if (dateStr === "Paid in Full") return "Paid in Full";
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [y, m, d] = dateStr.split("-").map(Number);
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${months[m - 1]} ${d}, ${y}`;
      }
      return dateStr;
    }

    // --- SUPPORT TICKET WORKFLOWS ---
    resolveSupportTicket(ticketId, resolutionNote, adminUser = "ADMIN (Limuel)") {
      const ticket = this.data.support.find(t => t.id === ticketId);
      if (!ticket) return { success: false, error: "Ticket not found" };
      if (!resolutionNote || !resolutionNote.trim()) {
        return { success: false, error: "A resolution note is required when resolving a ticket." };
      }

      ticket.status = "Resolved";
      ticket.resolutionNote = resolutionNote.trim();
      ticket.resolvedBy = adminUser;
      ticket.resolvedAt = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + 
        ", " + new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

      if (!ticket.history) ticket.history = [];
      ticket.history.unshift({
        id: `TH-${Date.now().toString().slice(-4)}`,
        time: "Just now",
        user: adminUser,
        action: `Ticket marked as Resolved. Resolution note: "${resolutionNote.trim()}"`,
        type: "resolution"
      });

      this.logActivity(
        "Admin",
        adminUser,
        `ADMIN resolved support ticket ${ticketId} (${ticket.accountName}) · Resolution: ${resolutionNote.trim()}`,
        ticketId,
        {
          actorId: "ADMIN-01",
          recordType: "Support Ticket",
          details: { status: "Resolved", resolutionNote: resolutionNote.trim(), ticketId, account: ticket.accountName }
        }
      );
      this.save();
      return { success: true, ticket };
    }

    reopenSupportTicket(ticketId, reason = "", adminUser = "ADMIN (Limuel)") {
      const ticket = this.data.support.find(t => t.id === ticketId);
      if (!ticket) return { success: false, error: "Ticket not found" };

      const prevResolution = ticket.resolutionNote;
      ticket.status = "In Progress";

      if (!ticket.history) ticket.history = [];
      ticket.history.unshift({
        id: `TH-${Date.now().toString().slice(-4)}`,
        time: "Just now",
        user: adminUser,
        action: `Ticket reopened${reason ? ' · Reason: ' + reason.trim() : ''} (Previous resolution preserved: "${prevResolution || 'None'}")`,
        type: "reopen"
      });

      this.logActivity(
        "Admin",
        adminUser,
        `ADMIN reopened support ticket ${ticketId} (${ticket.accountName})${reason ? ' · Reason: ' + reason.trim() : ''}`,
        ticketId,
        {
          actorId: "ADMIN-01",
          recordType: "Support Ticket",
          details: { status: "In Progress", reason: reason.trim(), ticketId, account: ticket.accountName }
        }
      );
      this.save();
      return { success: true, ticket };
    }

    addTicketMessage(ticketId, text, sender = "ADMIN (Limuel)", role = "Admin") {
      const ticket = this.data.support.find(t => t.id === ticketId);
      if (!ticket) return { success: false, error: "Ticket not found" };
      if (!text || !text.trim()) return { success: false, error: "Message text cannot be empty." };

      if (!ticket.messages) ticket.messages = [];
      const msg = {
        id: `MSG-${Date.now().toString().slice(-4)}`,
        sender: sender,
        role: role,
        time: "Just now",
        text: text.trim()
      };
      ticket.messages.push(msg);

      if (!ticket.history) ticket.history = [];
      ticket.history.unshift({
        id: `TH-${Date.now().toString().slice(-4)}`,
        time: "Just now",
        user: sender,
        action: `Sent response to requester: "${text.trim().slice(0, 70)}${text.trim().length > 70 ? '...' : ''}"`,
        type: "message"
      });

      // If open, advance to In Progress
      if (ticket.status === "Open" && role === "Admin") {
        ticket.status = "In Progress";
        ticket.history.unshift({
          id: `TH-${Date.now().toString().slice(-4)}-st`,
          time: "Just now",
          user: sender,
          action: "Status automatically updated to In Progress following admin response",
          type: "status"
        });
      }

      this.logActivity(
        role === "Admin" ? "Admin" : (ticket.accountType || role),
        sender,
        `${role === "Admin" ? "ADMIN" : role} replied to support ticket ${ticketId} (${ticket.accountName}): "${text.trim().slice(0, 60)}..."`,
        ticketId,
        {
          actorId: role === "Admin" ? "ADMIN-01" : (ticket.accountId || role),
          recordType: "Support Ticket",
          details: { ticketId, sender, textPreview: text.trim().slice(0, 80) }
        }
      );
      this.save();
      return { success: true, message: msg, ticket };
    }

    updateSupportTicket(ticketId, newStatus, priority, note, assignedTo, adminUser = "ADMIN (Limuel)") {
      const ticket = this.data.support.find(t => t.id === ticketId);
      if (!ticket) return { success: false, error: "Ticket not found" };

      if (!ticket.history) ticket.history = [];

      const statusChanged = newStatus && newStatus !== ticket.status;
      const priorityChanged = priority && priority !== ticket.priority;
      const assignedChanged = assignedTo && assignedTo !== ticket.assignedTo;

      if (newStatus === "Resolved") {
        return this.resolveSupportTicket(ticketId, note, adminUser);
      }

      if (ticket.status === "Resolved" && newStatus && newStatus !== "Resolved") {
        return this.reopenSupportTicket(ticketId, note, adminUser);
      }

      if (statusChanged) {
        const oldSt = ticket.status;
        ticket.status = newStatus;
        ticket.history.unshift({
          id: `TH-${Date.now().toString().slice(-4)}`,
          time: "Just now",
          user: adminUser,
          action: `Status changed from "${oldSt}" to "${newStatus}"`,
          type: "status"
        });
      }

      if (priorityChanged) {
        const oldP = ticket.priority;
        ticket.priority = priority;
        ticket.history.unshift({
          id: `TH-${Date.now().toString().slice(-4)}`,
          time: "Just now",
          user: adminUser,
          action: `Priority adjusted from "${oldP}" to "${priority}"`,
          type: "priority"
        });
      }

      if (assignedChanged) {
        const oldAssigned = ticket.assignedTo;
        ticket.assignedTo = assignedTo;
        ticket.history.unshift({
          id: `TH-${Date.now().toString().slice(-4)}`,
          time: "Just now",
          user: adminUser,
          action: `Assigned admin updated to ${assignedTo} (was ${oldAssigned || 'Unassigned'})`,
          type: "assignment"
        });
      }

      if (note && note.trim()) {
        ticket.notes = note.trim();
        ticket.history.unshift({
          id: `TH-${Date.now().toString().slice(-4)}`,
          time: "Just now",
          user: adminUser,
          action: `Internal note recorded: "${note.trim()}"`,
          type: "note"
        });
      }

      this.logActivity(
        "Admin",
        adminUser,
        `ADMIN updated support ticket ${ticketId} (${ticket.accountName})`,
        ticketId,
        {
          actorId: "ADMIN-01",
          recordType: "Support Ticket",
          details: { ticketId, statusChanged, priorityChanged, assignedChanged, newStatus, priority, assignedTo }
        }
      );
      this.save();
      return { success: true, ticket };
    }

    getTicketActivity(ticketId) {
      const ticket = this.data.support.find(t => t.id === ticketId);
      const ticketHistory = (ticket && ticket.history) ? ticket.history.map(h => ({
        time: h.time,
        role: (h.user && h.user.includes("ADMIN")) ? "Admin" : (ticket.accountType || "User"),
        user: h.user,
        action: h.action,
        record: ticketId
      })) : [];

      const globalLogs = this.data.activity.filter(a => a.record === ticketId || (a.action && a.action.includes(ticketId)));
      
      const combined = [...ticketHistory];
      globalLogs.forEach(g => {
        if (!combined.some(c => c.action === g.action)) {
          combined.push(g);
        }
      });
      return combined;
    }

    // --- ACCOUNT WORKFLOWS ---
    updateAccountStatus(type, id, newStatus, reason = "") {
      let list = [];
      if (type === "customers") list = this.data.customers;
      else if (type === "financers") list = this.data.financers;
      else if (type === "installers") list = this.data.installers;
      else if (type === "merchants") list = this.data.merchants;
      else if (type === "engineers") list = this.data.engineers || [];
      else if (type === "accountants") list = this.data.accountants || [];

      const acc = list.find(a => a.id === id);
      if (!acc) return false;

      const oldStatus = acc.status;
      acc.status = newStatus;

      const roleName = type.slice(0, -1).toUpperCase();
      let actionVerb = "updated status of";
      if (newStatus === "Active") actionVerb = oldStatus === "Suspended" ? "restored" : "activated";
      else if (newStatus === "Inactive") actionVerb = "deactivated";
      else if (newStatus === "Suspended") actionVerb = "suspended";
      else if (newStatus === "Pending Review") actionVerb = "flagged for review";

      const note = reason ? ` — Reason: ${reason}` : "";
      this.logActivity(
        "Admin",
        "ADMIN (Limuel)",
        `ADMIN ${actionVerb} ${roleName} ${acc.id} (${acc.name})${note}`,
        acc.id,
        {
          actorId: "ADMIN-01",
          recordType: `${roleName.charAt(0) + roleName.slice(1).toLowerCase()} Account`,
          details: { accountType: type, prevStatus: oldStatus, newStatus, reason }
        }
      );
      this.save();
      return acc.status;
    }

    toggleAccountStatus(type, id) {
      let list = [];
      if (type === "customers") list = this.data.customers;
      else if (type === "financers") list = this.data.financers;
      else if (type === "installers") list = this.data.installers;
      else if (type === "merchants") list = this.data.merchants;
      else if (type === "engineers") list = this.data.engineers || [];
      else if (type === "accountants") list = this.data.accountants || [];

      const acc = list.find(a => a.id === id);
      if (!acc) return false;
      const target = acc.status === "Active" ? "Inactive" : "Active";
      return this.updateAccountStatus(type, id, target);
    }

    getAccountActivity(id) {
      if (!id) return [];
      return this.data.activity.filter(a => 
        a.record === id || 
        (a.action && a.action.includes(id))
      );
    }

    generateProjectIds() {
      const records = [...this.data.applications, ...this.data.customers];
      const next = (prefix, field) => {
        const values = records.map(r => Number(String(r[field] || '').replace(prefix, ''))).filter(Number.isFinite);
        return `${prefix}${Math.max(1000, ...values) + 1}`;
      };
      const usedHsIds = new Set(records.map(r => r.hsId));
      const start = crypto.getRandomValues(new Uint32Array(1))[0] % 90000;
      for (let offset = 0; offset < 90000; offset++) {
        const hsId = `HS-${10000 + (start + offset) % 90000}`;
        if (!usedHsIds.has(hsId)) return { appId: next('APP-', 'id'), hsId };
      }
      throw new Error('No five-digit HS IDs are available.');
    }

    getNextEngineerId() {
      let maxNum = 0;
      (this.data.engineers || []).forEach(e => {
        const match = e.id && e.id.match(/^ENG-(\d+)$/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
      });
      return `ENG-${String(maxNum + 1).padStart(3, "0")}`;
    }

    createAccount(payload) {
      // Reload before allocating IDs and checking conversion to avoid stale-tab duplicates.
      this.data = this.load();
      const inquiry = payload.inquiryId ? this.getInquiries().find(i => i.id === payload.inquiryId) : null;
      const fail = error => ({ success: false, error });
      if (payload.inquiryId && !inquiry) return fail('The linked inquiry no longer exists.');
      if ((!payload.role || payload.role === 'Customer') && inquiry?.customerId) return fail('This inquiry already has a customer account.');
      if ((!payload.role || payload.role === 'Customer') && this.data.customers
        .some(a => a.email?.toLowerCase() === (payload.email || '').trim().toLowerCase())) {
        return fail('An account with this email already exists.');
      }
      if ((!payload.role || payload.role === 'Customer') && (!payload.system?.trim() || !payload.projectType?.trim())) {
        return fail('Select a purchased Hello Solar model and project type.');
      }
      // Partner inquiry → account: must be approved, unconverted and for the same partner type
      const partnerInquiry = payload.partnerInquiryId ? this.getInquiries().find(i => i.id === payload.partnerInquiryId) : null;
      if (payload.partnerInquiryId) {
        if (!this.isPartnerInquiry(partnerInquiry)) return fail('The linked partner inquiry no longer exists.');
        if (partnerInquiry.inquiryStatus !== 'Approved') return fail('Approve the partner inquiry before creating an account.');
        if (partnerInquiry.accountCreated) return fail(`This partner inquiry already has an account (${partnerInquiry.linkedAccountId || 'created'}).`);
        if (!PARTNER_TYPES.includes(payload.role)) return fail('A partner inquiry can only become a Financer, Installer or Merchant account.');
        // Older inquiries carry a partner type; newer ones leave it to Super Admin (chosen from the message)
        if (partnerInquiry.partnerType && payload.role !== partnerInquiry.partnerType) return fail(`This inquiry is for a ${partnerInquiry.partnerType} account.`);
      }
      const snapshot = JSON.stringify(this.data);
      const role = payload.role || "Customer";
      const firstName = (payload.firstName || "").trim();
      const lastName = (payload.lastName || "").trim();
      const fullName = `${firstName} ${lastName}`.trim() || payload.name || "Unnamed Account";
      const email = (payload.email || "").trim();
      const phone = (payload.phone || "").trim();
      const status = payload.status || "Active";
      const companyName = (payload.companyName || "").trim();
      const location = (payload.location || "").trim() || "Philippines";
      const password = payload.password || "TemporaryPass123!";
      const notes = (payload.notes || "").trim();
      const today = new Date().toISOString().split("T")[0];

      let newRecord = null;
      let id = "";
      let tabKey = "customers";

      if (role === "Customer") {
        tabKey = "customers";
        let maxNum = 1000;
        (this.data.customers || []).forEach(c => {
          const match = c.id && c.id.match(/CUS-(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        });
        id = `CUS-${maxNum + 1}`;
        const activationToken = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
          ? crypto.randomUUID()
          : ("act_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
        const activationLink = `https://portal.hellosolar.ph/activate?token=${activationToken}&id=${id}&email=${encodeURIComponent(email)}`;
        const invitationStatus = payload.invitationStatus || (payload.status === "Active" && !payload.inquiryId ? "Active" : "Sent");
        const inquiryPayment = inquiry?.paymentPreference === "Not specified" ? "" : inquiry?.paymentPreference;
        const rawPayment = (payload.paymentType || inquiryPayment || payload.paymentPreference || "Full Payment").trim();
        const isFullPayment = rawPayment.toLowerCase().includes("full");
        const paymentType = isFullPayment ? "Full Payment" : "Installment";

        newRecord = {
          id,
          name: fullName,
          email,
          phone,
          location: location || "Philippines",
          system: payload.system || "Pending System",
          status,
          ...this.generateProjectIds(),
          inquiryId: inquiry?.id || null,
          purchasedModel: payload.system.trim(),
          projectType: payload.projectType.trim(),
          paymentType,
          paymentPreference: paymentType,
          systemStatus: 'Waiting for Installer',
          assignedInstallerId: null,
          joined: today,
          password,
          invitationStatus,
          activationToken,
          activationLink,
          activationEmailSentAt: new Date().toISOString(),
          hasSetPassword: false,
          notes
        };
        if (!Array.isArray(this.data.customers)) this.data.customers = [];
        if (/^APP-\d+$/.test(payload.appId || '') && !this.data.applications.some(a => a.id === payload.appId)) newRecord.appId = payload.appId;
        if (/^HS-\d{5}$/.test(payload.hsId || '') && ![...this.data.customers, ...this.data.applications].some(a => a.hsId === payload.hsId)) newRecord.hsId = payload.hsId;
        this.data.customers.unshift(newRecord);

        // Rules:
        // If Full Payment -> Current Stage = Payment Required, Financer = Not Required, Installer = Unassigned
        // If Installment -> Current Stage = Financing Review, Financer = Pending/Assigned, Installer = Unassigned
        // Remove generic Submitted for this normal customer flow.
        const stage = isFullPayment ? "Payment Required" : "Financing Review";
        const pricing = resolvePricing(payload, inquiry, isFullPayment);
        const financer = isFullPayment ? "Not Required" : (payload.financer || "Pending");
        const installer = "Unassigned";

        const application = {
          id: newRecord.appId, customerId: id, customer: fullName, email, phone, location,
          hsId: newRecord.hsId, inquiryId: newRecord.inquiryId,
          inquirySnapshot: inquiry ? JSON.parse(JSON.stringify(inquiry)) : null,
          system: newRecord.system, purchasedModel: newRecord.purchasedModel,
          projectType: newRecord.projectType, paymentType, paymentPreference: paymentType,
          systemStatus: 'Waiting for Installer',
          dispatchStatus: 'New Application', assignedInstallerId: null, declinedInstallerIds: [],
          stage, installer, installerType: 'Partner Installer',
          financer, financerId: null,
          ...pricing,
          // Down payment: ₱10,000 Installment / ₱500 Full Payment. Landing page "Buy Now" receipts arrive Pending Verification.
          downPaymentAmount: downPaymentAmountFor(paymentType),
          downPaymentStatus: inquiry && inquiry.paymentProof && inquiry.paymentProof.purpose === 'Down Payment' ? 'Pending Verification' : 'Not Submitted',
          downPaymentProof: inquiry && inquiry.paymentProof && inquiry.paymentProof.purpose === 'Down Payment' ? { ...inquiry.paymentProof } : null,
          docs: isFullPayment ? '1/1' : '0/5',
          paymentStatus: isFullPayment ? 'Payment Required' : 'Financing Review',
          nextDue: 'N/A',
          panels: 'Pending Assessment', inverter: 'Pending Assessment',
          invitationStatus, activationLink,
          updated: 'Just now', createdAt: new Date().toISOString(), notes
        };
        if (application.inquirySnapshot && application.inquirySnapshot.paymentProof) delete application.inquirySnapshot.paymentProof.dataUrl;
        if (!Array.isArray(this.data.applications)) this.data.applications = [];
        this.data.applications.unshift(application);
        if (inquiry) Object.assign(inquiry, {
          customerId: id, appId: newRecord.appId, hsId: newRecord.hsId,
          purchasedModel: newRecord.purchasedModel, customerResponse: 'Proceed', inquiryStatus: 'Proceed',
          invitationStatus, convertedAt: application.createdAt
        });

      } else if (role === "Installer") {
        tabKey = "installers";
        let maxNum = 0;
        (this.data.installers || []).forEach(i => {
          const match = i.id && i.id.match(/INS-(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        });
        id = `INS-${String(maxNum + 1).padStart(3, "0")}`;
        const displayName = companyName || fullName;
        newRecord = {
          id,
          name: displayName,
          type: payload.installerType || "Partner",
          contact: fullName,
          email,
          phone,
          activeJobs: 0,
          completedJobs: 0,
          rating: 5.0,
          status,
          location: location || "Metro Manila & Visayas",
          password,
          notes
        };
        if (!Array.isArray(this.data.installers)) this.data.installers = [];
        this.data.installers.unshift(newRecord);

      } else if (role === "Financer") {
        tabKey = "financers";
        let maxNum = 0;
        (this.data.financers || []).forEach(f => {
          const match = f.id && f.id.match(/FIN-(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        });
        id = `FIN-${String(maxNum + 1).padStart(3, "0")}`;
        const institutionName = companyName || `${fullName} Financing`;
        newRecord = {
          id,
          name: institutionName,
          contact: fullName,
          email,
          phone,
          activeLoans: 0,
          totalFunded: 0,
          status,
          category: payload.category || "Commercial Solar Loan",
          password,
          notes,
          // Contract is configured later from Accounts → Financers; until then Hello Solar owns funding/revenue
          contractTermMonths: null,
          annualRate: null,
          contractStartDate: null,
          contractEndDate: null,
          contractStatusOverride: null
        };
        if (!Array.isArray(this.data.financers)) this.data.financers = [];
        this.data.financers.unshift(newRecord);
        this.syncFinancerContracts({ silent: true });

      } else if (role === "Engineer") {
        // Direct Installation Engineer — internal account, kept separate from partner installers
        tabKey = "engineers";
        if (!Array.isArray(this.data.engineers)) this.data.engineers = [];
        const requestedId = (payload.engineerId || "").trim().toUpperCase();
        if (requestedId && !/^ENG-\d{3,}$/.test(requestedId)) return fail('Engineer ID must follow the format ENG-001.');
        if (requestedId && this.data.engineers.some(e => e.id === requestedId)) return fail(`Engineer ID ${requestedId} is already in use.`);
        if (this.data.engineers.some(e => (e.email || "").toLowerCase() === email.toLowerCase())) {
          return fail('An engineer account with this email already exists.');
        }
        id = requestedId || this.getNextEngineerId();
        newRecord = {
          id,
          name: fullName,
          email,
          phone,
          role: "Direct Installation Engineer",
          team: this.data.settings?.directInstallTeam || "Hello Solar Internal Team",
          status: payload.status || "Pending Activation",
          joined: today,
          password,
          notes
        };
        this.data.engineers.unshift(newRecord);

      } else if (role === "Accounting") {
        // Accounting account — internal; signs in to Super Admin and sees only the Accounting page
        tabKey = "accountants";
        if (!Array.isArray(this.data.accountants)) this.data.accountants = [];
        if (this.data.accountants.some(a => (a.email || "").toLowerCase() === email.toLowerCase())) {
          return fail('An accounting account with this email already exists.');
        }
        let maxNum = 0;
        this.data.accountants.forEach(a => {
          const match = a.id && a.id.match(/^ACC-(\d+)$/);
          if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
        });
        id = `ACC-${String(maxNum + 1).padStart(3, "0")}`;
        newRecord = {
          id,
          name: fullName,
          email,
          phone,
          role: "Accounting",
          status,
          joined: today,
          password,
          notes
        };
        this.data.accountants.unshift(newRecord);

      } else if (role === "Merchant") {
        tabKey = "merchants";
        let maxNum = 0;
        (this.data.merchants || []).forEach(m => {
          const match = m.id && m.id.match(/MER-(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        });
        id = `MER-${String(maxNum + 1).padStart(3, "0")}`;
        const merchantName = companyName || `${fullName} Solar Supplies`;
        newRecord = {
          id,
          name: merchantName,
          contact: fullName,
          email,
          phone,
          projects: 0,
          transactions: 0,
          volume: 0,
          status,
          category: payload.category || "Solar Equipment & PV Modules",
          password,
          notes
        };
        if (!Array.isArray(this.data.merchants)) this.data.merchants = [];
        this.data.merchants.unshift(newRecord);
      }

      // Link partner inquiry ↔ account. Saved together with the account below (rolled back if the save fails),
      // so accountCreated is true only when creation succeeds.
      if (partnerInquiry && newRecord) {
        newRecord.partnerInquiryId = partnerInquiry.id;
        const proposal = partnerInquiry.financerProposal;
        if (proposal && role === "Financer") {
          newRecord.proposedContract = { ...proposal };
          // Agreed terms become the financer's contract (still editable in Portal Accounts → Financers)
          if (proposal.contractTermMonths && proposal.contractStartDate && proposal.annualRate != null) {
            newRecord.contractTermMonths = proposal.contractTermMonths;
            newRecord.annualRate = proposal.annualRate;
            newRecord.contractStartDate = proposal.contractStartDate;
            newRecord.contractEndDate = HelloSolarStore.addMonthsISO(proposal.contractStartDate, proposal.contractTermMonths);
            newRecord.contractStatusOverride = null;
            newRecord.contractUpdatedAt = new Date().toISOString();
          }
        }
        partnerInquiry.partnerType = role;
        partnerInquiry.category = `${role} Partner`;
        partnerInquiry.accountCreated = true;
        partnerInquiry.linkedAccountId = id;
        partnerInquiry.linkedAccountType = tabKey;
        partnerInquiry.accountCreatedAt = new Date().toISOString();
      }

      this.logActivity(
        "Admin",
        "ADMIN (Limuel)",
        `ADMIN created new ${role} account ${id} (${newRecord.name || fullName})`,
        id,
        {
          actorId: "ADMIN-01",
          recordType: `${role} Account`,
          details: { role, id, name: newRecord.name, email, phone, status, tabKey },
          deferSave: true
        }
      );

      try {
        STORE.setItem(STORAGE_KEY, JSON.stringify(this.data));
      } catch (error) {
        this.data = JSON.parse(snapshot);
        return fail('Account could not be saved. Check browser storage and try again.');
      }
      if (partnerInquiry) this.markPartnerQueueRecord(partnerInquiry.id, { accountCreated: true, linkedAccountId: id, inquiryStatus: partnerInquiry.inquiryStatus, partnerType: partnerInquiry.partnerType });
      if (role === "Financer" && newRecord && newRecord.contractStartDate && typeof this.syncFinancerContracts === "function") {
        this.syncFinancerContracts({ silent: true });
        this.save();
      }
      window.HELLO_SOLAR_DATA = this.data;
      return { success: true, account: newRecord, role, id, tabKey, activationLink: newRecord?.activationLink || null };
    }

    // --- APPLICATIONS WORKFLOWS ---
    getApplications() {
      if (!this.data.applications || !Array.isArray(this.data.applications)) {
        this.data.applications = JSON.parse(JSON.stringify(SEED_DATA.applications || []));
      }
      this.data.applications.forEach(app => {
        if (!app.paymentType) {
          const isFull = (app.paymentPreference || "").toLowerCase().includes("full") || app.financer === "Not Required";
          app.paymentType = isFull ? "Full Payment" : "Installment";
        }
        if (app.id === "APP-1031" && !app.uploadedReceipt) {
          app.uploadedReceipt = "bdo_transfer_receipt_app1031.png";
          app.receiptUploadedAt = "2026-09-28";
          app.receiptBank = "BDO Unibank Direct Transfer";
          app.receiptReference = "BDO-TXN-88219304";
          app.receiptAmount = 245000;
          if (app.paymentStatus === "Payment Required") {
            app.paymentStatus = "Verification Required";
          }
        }
        // A declined application is not billed: no overdue / due soon status
        if (app.stage === "Declined" && ["Overdue", "Due Soon", "On Time"].includes(app.paymentStatus)) {
          app.paymentStatus = "Cancelled";
          app.nextDue = "—";
        }
      });
      this._syncStagesWithInstallations();
      this._syncFinancerLoanCounts();
      return this.data.applications;
    }

    // The application stage follows its installation job (maintenance jobs are not installations):
    // a started job → "Installation", a completed job → "Completed".
    _syncStagesWithInstallations() {
      const before = ["Approved", "Ready for Installation", "Installation", "In Progress"];
      (this.data.installations || []).forEach(job => {
        if (!job || job.installerType === "Maintenance" || job.status === "Cancelled") return;
        const app = (this.data.applications || []).find(a => a.id === job.appId);
        if (!app || !before.includes(app.stage)) return;
        if (job.status === "Completed") {
          app.stage = "Completed";
          app.installationStatus = "COMPLETED";
        } else if (["In Progress", "Testing", "Delayed"].includes(job.status) && app.stage !== "Installation" && app.stage !== "In Progress") {
          app.stage = "Installation";
          if (!app.installationStatus || app.installationStatus === "AWAITING_INSTALLATION") app.installationStatus = "INSTALLATION_IN_PROGRESS";
        }
      });
    }

    // Each funder's number of active loans, counted from the applications it funds
    _syncFinancerLoanCounts() {
      const apps = this.data.applications || [];
      (this.data.financers || []).forEach(f => {
        f.activeLoans = apps.filter(a => (a.financerId === f.id || a.financer === f.name) && !this.isHelloSolarFunded(a) &&
          a.stage !== "Declined" && a.paymentStatus !== "Completed").length;
      });
    }

    // Date of the first activity logged for a record (used when an older record has no date of its own)
    _firstActivityDate(recordId) {
      let first = "";
      (this.data.activity || []).forEach(e => {
        if (!e || (e.record !== recordId && e.recordId !== recordId) || !e.timestamp) return;
        const iso = String(e.timestamp).slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && (!first || iso < first)) first = iso;
      });
      return first;
    }

    // --- CONTACT INQUIRIES WORKFLOWS ---
    // --- PARTNER INQUIRIES (Financer / Installer / Merchant from Landing Page → Contact Us) ---
    // Imports new records from the shared queue written by the landing page (HELLO_SOLAR_PARTNER_INQUIRIES).
    // Imported once by id; Super Admin data is authoritative afterwards. Backend-ready: replace the queue read
    // with an API fetch returning the same record shape.
    syncPartnerInquiries() {
      if (IS_API) return 0; // api mode: landing inquiries are created on the backend (POST /public/inquiries)
      let queue = [];
      try {
        queue = JSON.parse(localStorage.getItem(PARTNER_INQUIRY_KEY) || "[]");
      } catch (err) {
        queue = [];
      }
      if (!Array.isArray(queue) || !queue.length) return 0;
      const existing = new Set(this.data.inquiries.map(i => i.id));
      let added = 0;
      queue.forEach(rec => {
        if (!rec || !rec.id || existing.has(rec.id)) return;
        // Accept untyped partner inquiries (inquiryType "Partner") as well as older typed ones
        const typed = PARTNER_TYPES.includes(rec.partnerType);
        if (!typed && rec.inquiryType !== "Partner") return;
        const label = typed ? `${rec.partnerType} Partner` : "Partner";
        this.data.inquiries.unshift({
          ...rec,
          partnerType: typed ? rec.partnerType : "",
          isPartnerInquiry: true,
          name: rec.name || `${rec.firstName || ""} ${rec.lastName || ""}`.trim(),
          category: label,
          subject: rec.subject || `${typed ? rec.partnerType + " " : ""}Partnership Inquiry`,
          status: rec.status || "Unread",
          inquiryStatus: rec.inquiryStatus || "Pending Review",
          accountCreated: rec.accountCreated === true
        });
        existing.add(rec.id);
        added++;
      });
      if (added) this.save();
      return added;
    }

    // Mirror status back to the shared queue record (best effort; Super Admin data stays authoritative)
    markPartnerQueueRecord(inquiryId, fields) {
      if (IS_API) return;
      try {
        const queue = JSON.parse(localStorage.getItem(PARTNER_INQUIRY_KEY) || "[]");
        if (!Array.isArray(queue)) return;
        const rec = queue.find(r => r && r.id === inquiryId);
        if (!rec) return;
        Object.assign(rec, fields);
        localStorage.setItem(PARTNER_INQUIRY_KEY, JSON.stringify(queue));
      } catch (err) { /* queue is optional */ }
    }

    // --- CUSTOMER INQUIRIES (Landing Page → Request Solar Proposal / Contact Us → Customer) ---
    // Imports new records from HELLO_SOLAR_CUSTOMER_INQUIRIES once by id (no duplicates on repeated sync).
    // Records arrive as "Not Sent" so the existing confirmation → Proceed → Create Customer Account flow applies.
    syncCustomerInquiries() {
      if (IS_API) return 0; // api mode: landing inquiries are created on the backend (POST /public/inquiries)
      let queue = [];
      try {
        queue = JSON.parse(localStorage.getItem(CUSTOMER_INQUIRY_KEY) || "[]");
      } catch (err) {
        queue = [];
      }
      if (!Array.isArray(queue) || !queue.length) return 0;
      const existing = new Set(this.data.inquiries.map(i => i.id));
      let added = 0;
      const autoCreate = [];
      // Queue is newest-first; import oldest-first so the newest ends up on top
      queue.slice().reverse().forEach(rec => {
        if (!rec || !rec.id || existing.has(rec.id) || rec.inquiryType !== "Customer") return;
        // Never guess: Contact Us customers stay "Not specified" until they choose a payment type
        const payment = rec.paymentPreference || "Not specified";
        this.data.inquiries.unshift({
          ...rec,
          name: rec.name || `${rec.firstName || ""} ${rec.lastName || ""}`.trim(),
          email: rec.email || "",
          phone: rec.phone || "",
          location: rec.location || "Philippines",
          category: rec.category || "Residential Solar",
          package: rec.package || "Custom Solar Package",
          selectedSolarModel: rec.selectedSolarModel || rec.package || "Custom Solar Package",
          electricBill: rec.electricBill || "Not provided",
          paymentPreference: payment,
          subject: rec.subject || "Solar Inquiry",
          message: rec.message || "",
          status: rec.status || "Unread",
          customerResponse: rec.customerResponse || "Awaiting Response",
          inquiryStatus: rec.inquiryStatus || "Not Sent",
          confirmationEmailSentAt: rec.confirmationEmailSentAt || null,
          reply: null
        });
        existing.add(rec.id);
        added++;
        if (rec.paymentProof && rec.paymentProof.purpose === "Down Payment") autoCreate.push(rec.id);
      });
      if (added) this.save();
      // Buy Now: once the down payment receipt is uploaded, the customer account is created automatically
      // and the activation link is emailed (no Contact Inquiry confirmation or manual Create Account step)
      autoCreate.forEach(id => this.autoCreateBuyNowAccount(id));
      return added;
    }

    autoCreateBuyNowAccount(inquiryId) {
      if (this._autoCreatingAccount) return null;
      const inq = (this.data.inquiries || []).find(i => i.id === inquiryId);
      if (!inq || inq.customerId) return null;
      if (!String(inq.email || "").trim()) {
        // The activation link goes to the customer's email, so an order without one stays with Super Admin
        inq.autoAccountError = "No email address was given, so no account was created.";
        this.save();
        return { success: false, error: inq.autoAccountError };
      }
      const words = String(inq.name || "").trim().split(/\s+/);
      const lastName = inq.lastName || (words.length > 1 ? words.pop() : "");
      this._autoCreatingAccount = true;
      let res;
      try {
        res = this.createAccount({
          role: "Customer",
          firstName: inq.firstName || words.join(" "),
          lastName,
          email: inq.email,
          phone: inq.phone,
          password: "Solar2026!Pass",
          status: "Active",
          invitationStatus: "Sent",
          location: inq.address || inq.location,
          system: inq.selectedSolarModel || inq.package || "",
          paymentType: inq.paymentType || inq.paymentPreference || "",
          projectType: inq.projectType || (/Residential Solar|Commercial Solar|Battery Storage/.test(inq.category) ? inq.category : "Residential Solar"),
          notes: [inq.subject, inq.message].filter(Boolean).join("\n\n"),
          inquiryId: inq.id
        });
      } finally {
        this._autoCreatingAccount = false;
      }
      if (!res || !res.success) {
        // e.g. the email already has an account: the inquiry stays in Contact Inquiries for Super Admin
        const current = (this.data.inquiries || []).find(i => i.id === inquiryId);
        if (current) { current.autoAccountError = res ? res.error : "Account could not be created."; this.save(); }
        return res;
      }
      this.logActivity("System", "SYSTEM (Auto)", `Customer account ${res.id} created automatically after the down payment receipt for ${inquiryId}`, res.id, {
        actorId: "SYSTEM", recordType: "Customer Account", deferSave: true,
        details: { inquiryId, customerId: res.id, appId: res.account ? res.account.appId : null, source: "Buy Now" }
      });
      this.queueActivationEmail(res.id, "SYSTEM (Auto)");
      return res;
    }

    isPartnerInquiry(inq) {
      return !!inq && (inq.isPartnerInquiry === true || inq.inquiryType === "Partner") && (!inq.partnerType || PARTNER_TYPES.includes(inq.partnerType));
    }

    // Super Admin sets the partner type from the partner's message (landing page no longer asks for it)
    setPartnerInquiryType(inquiryId, partnerType, adminUser = "ADMIN (Limuel)") {
      const inq = (this.data.inquiries || []).find(i => i.id === inquiryId);
      if (!this.isPartnerInquiry(inq)) return { success: false, error: "Partner inquiry not found." };
      if (inq.accountCreated) return { success: false, error: "The account is already created for this inquiry." };
      const type = PARTNER_TYPES.includes(partnerType) ? partnerType : "";
      if (type === (inq.partnerType || "")) return { success: true, inquiry: inq };
      inq.partnerType = type;
      inq.category = type ? `${type} Partner` : "Partner";
      inq.subject = `${type ? type + " " : ""}Partnership Inquiry`;
      this.markPartnerQueueRecord(inq.id, { partnerType: type });
      this.logActivity("Admin", adminUser, `ADMIN set partner inquiry ${inq.id} (${inq.name}) as ${type || "unspecified"}`, inq.id, {
        actorId: "ADMIN-01", recordType: "Partner Inquiry", deferSave: true, details: { inquiryId: inq.id, partnerType: type || null }
      });
      this.save();
      return { success: true, inquiry: inq };
    }

    // Financer partner: contract terms agreed with Super Admin (from their message / discussion)
    setPartnerProposal(inquiryId, payload = {}, adminUser = "ADMIN (Limuel)") {
      const inq = (this.data.inquiries || []).find(i => i.id === inquiryId);
      if (!this.isPartnerInquiry(inq)) return { success: false, error: "Partner inquiry not found." };
      if (inq.accountCreated) return { success: false, error: "The account is already created. Edit the contract in Portal Accounts → Financers." };
      const rawTerm = String(payload.contractTermMonths ?? "").trim();
      const rawRate = String(payload.annualRate ?? "").trim();
      const start = String(payload.contractStartDate || "").trim();
      if (!rawTerm && !rawRate && !start) {
        inq.financerProposal = null;
      } else {
        const term = Number(rawTerm);
        const rate = Number(rawRate);
        if (!Number.isInteger(term) || term < 1 || term > 360) return { success: false, error: "Contract term must be a whole number of months (1–360)." };
        if (rawRate === "" || !Number.isFinite(rate) || rate < 0 || rate > 100) return { success: false, error: "Annual rate must be between 0% and 100%." };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { success: false, error: "Choose the contract start date." };
        inq.financerProposal = { contractTermMonths: term, annualRate: Math.round(rate * 100) / 100, contractStartDate: start };
      }
      this.markPartnerQueueRecord(inq.id, { financerProposal: inq.financerProposal });
      const p = inq.financerProposal;
      this.logActivity("Admin", adminUser, p
        ? `ADMIN recorded agreed contract terms for ${inq.id} (${inq.name}): ${p.contractTermMonths} mo @ ${p.annualRate}% p.a., starting ${p.contractStartDate}`
        : `ADMIN cleared the contract terms for ${inq.id} (${inq.name})`, inq.id, {
        actorId: "ADMIN-01", recordType: "Partner Inquiry", deferSave: true, details: { inquiryId: inq.id, financerProposal: p }
      });
      this.save();
      return { success: true, inquiry: inq };
    }

    approvePartnerInquiry(inquiryId, adminUser = "ADMIN (Limuel)") {
      const inq = (this.data.inquiries || []).find(i => i.id === inquiryId);
      if (!this.isPartnerInquiry(inq)) return { success: false, error: "Partner inquiry not found." };
      if (inq.inquiryStatus === "Approved") return { success: false, error: "This partner inquiry is already approved." };
      inq.inquiryStatus = "Approved";
      if (inq.status === "Unread") inq.status = "Read";
      inq.approvedAt = new Date().toISOString();
      inq.approvedBy = adminUser;
      this.markPartnerQueueRecord(inq.id, { inquiryStatus: "Approved" });
      this.logActivity("Admin", adminUser,
        `ADMIN approved ${inq.partnerType ? inq.partnerType + " " : ""}partner inquiry ${inq.id} (${inq.name})`,
        inq.id, {
          recordType: "Partner Inquiry", deferSave: true,
          details: { inquiryId: inq.id, partnerType: inq.partnerType, email: inq.email, financerProposal: inq.financerProposal || null, status: "Approved" }
        });
      this.save();
      return { success: true, inquiry: inq };
    }

    getInquiries() {
      if (!this.data.inquiries || !Array.isArray(this.data.inquiries)) {
        this.data.inquiries = JSON.parse(JSON.stringify(SEED_DATA.inquiries || []));
      }
      this.syncPartnerInquiries();
      this.syncCustomerInquiries();
      this.syncSiteVisits();
      this.data.inquiries.forEach(inq => {
        if (!inq.confirmationToken && !IS_API) { // api mode: the backend issues confirmation tokens
          inq.confirmationToken = "token_" + inq.id.toLowerCase().replace(/[^a-z0-9]/g, '') + "_" + (inq.email ? inq.email.split('@')[0].replace(/[^a-z0-9]/g, '').slice(0, 4) : 'sec') + '9a';
        }
      });
      return this.data.inquiries;
    }

    // Default text for the message Super Admin sends with the Inquiry Confirmation link.
    getDefaultInquiryConfirmationMessage(inq) {
      const first = String(inq?.name || inq?.firstName || "there").trim() || "there";
      const model = inq?.selectedSolarModel || inq?.package || "your selected Hello Solar system";
      return `Hi ${first},\n\nThank you for your inquiry about ${model}. We have reviewed your details and are ready to prepare your Hello Solar project.\n\nPlease use the link below to confirm whether you would like to proceed.\n\nHello Solar Team`;
    }

    // Saves the exact message that is sent with the Inquiry Confirmation link (no status change).
    saveInquiryConfirmationMessage(inquiryId, message, adminUser = "ADMIN (Limuel)") {
      const inq = (this.data.inquiries || []).find(i => i.id === inquiryId);
      if (!inq) return { success: false, error: "Inquiry not found" };
      const text = String(message ?? "").replace(/\r\n/g, "\n").trim();
      if (!text) return { success: false, error: "Message cannot be empty." };
      if (text.length > 2000) return { success: false, error: "Message must be 2,000 characters or fewer." };
      inq.confirmationMessage = text;
      inq.confirmationMessageUpdatedAt = new Date().toISOString();
      inq.confirmationMessageUpdatedBy = adminUser;
      this.logActivity("Admin", adminUser, `ADMIN saved the inquiry confirmation message for ${inquiryId} (${inq.name})`, inquiryId, {
        actorId: "ADMIN-01", recordType: "Contact Inquiry", deferSave: true,
        details: { inquiryId, messageLength: text.length }
      });
      this.save();
      return { success: true, inquiry: inq };
    }

    sendInquiryConfirmationEmail(inquiryId, adminUser = "ADMIN (Limuel)", message, options = {}) {
      const inq = (this.data.inquiries || []).find(i => i.id === inquiryId);
      if (!inq) return { success: false, error: "Inquiry not found" };
      if (message !== undefined && message !== null) {
        const text = String(message).replace(/\r\n/g, "\n").trim();
        if (!text) return { success: false, error: "Message cannot be empty." };
        if (text.length > 2000) return { success: false, error: "Message must be 2,000 characters or fewer." };
        inq.confirmationMessage = text;
        inq.confirmationMessageUpdatedAt = new Date().toISOString();
        inq.confirmationMessageUpdatedBy = adminUser;
      } else if (!inq.confirmationMessage) {
        inq.confirmationMessage = this.getDefaultInquiryConfirmationMessage(inq);
      }
      const now = new Date();
      inq.inquiryStatus = "Awaiting Response";
      inq.customerResponse = "Awaiting Response";
      inq.confirmationEmailSentAt = now.toISOString();
      if (!inq.confirmationToken && !IS_API) { // api mode: the backend issues the token and sends the email
        inq.confirmationToken = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
          ? crypto.randomUUID()
          : ("cnf_" + Math.random().toString(36).slice(2, 10));
      }
      this.logActivity(
        "Admin",
        adminUser,
        `ADMIN sent inquiry confirmation email to ${inq.name} (${inq.email}) for inquiry ${inquiryId}`,
        inquiryId,
        {
          actorId: "ADMIN-01",
          recordType: "Contact Inquiry",
          details: { inquiryId, recipient: inq.email, sender: inq.name, status: "Awaiting Response", message: inq.confirmationMessage, includesConfirmationLink: !!options.confirmationUrl }
        }
      );
      // Customer email payload (ready for a mail backend): the saved message plus the secure confirmation link
      if (options.confirmationUrl) {
        inq.confirmationEmail = {
          to: inq.email,
          subject: "Please confirm your Hello Solar inquiry",
          body: `${inq.confirmationMessage}\n\nOpen your Inquiry Confirmation page to choose Proceed or Not Proceeding:\n${options.confirmationUrl}`,
          confirmationUrl: options.confirmationUrl,
          sentAt: inq.confirmationEmailSentAt,
          sentBy: adminUser
        };
      }
      this.save();
      return { success: true, inquiry: inq };
    }

    updateInquiryStatus(inquiryId, newStatus, note = "", adminUser = "ADMIN (Limuel)") {
      const inq = (this.data.inquiries || []).find(i => i.id === inquiryId);
      if (!inq) return false;
      const prevStatus = inq.status;
      inq.status = newStatus;
      if (newStatus === "Replied") {
        const now = new Date();
        inq.reply = {
          repliedAt: formatExactAuditTimestamp(now),
          repliedBy: adminUser,
          replyNote: note || "Replied via administrative communication channel."
        };
      } else if (newStatus === "Unread") {
        inq.reply = null;
      }
      this.logActivity(
        "Admin",
        adminUser,
        `ADMIN marked contact inquiry ${inquiryId} (${inq.name}) as "${newStatus}"`,
        inquiryId,
        {
          actorId: "ADMIN-01",
          recordType: "Contact Inquiry",
          details: { inquiryId, prevStatus, newStatus, sender: inq.name, note }
        }
      );
      this.save();
      return inq;
    }

    replyInquiry(inquiryId, replyNote, adminUser = "ADMIN (Limuel)") {
      return this.updateInquiryStatus(inquiryId, "Replied", replyNote, adminUser);
    }

    updateInquiryCustomerResponse(inquiryId, customerResponse, adminUser = "ADMIN (Limuel)") {
      const inq = (this.data.inquiries || []).find(i => i.id === inquiryId);
      if (!inq) return false;
      const prevResponse = inq.customerResponse || "Awaiting Response";
      if (customerResponse === "Proceed" || customerResponse === "Proceed with Application") {
        inq.customerResponse = "Proceed";
        inq.inquiryStatus = "Proceed";
      } else if (customerResponse === "Not Proceed" || customerResponse === "Not Proceeding") {
        inq.customerResponse = "Not Proceed";
        inq.inquiryStatus = "Not Proceeding";
      } else if (customerResponse === "Not Sent") {
        inq.customerResponse = "Awaiting Response";
        inq.inquiryStatus = "Not Sent";
      } else {
        inq.customerResponse = "Awaiting Response";
        inq.inquiryStatus = "Awaiting Response";
      }
      inq.customerRespondedAt = new Date().toISOString();
      this.logActivity(
        "Admin",
        adminUser,
        `Customer response for inquiry ${inquiryId} (${inq.name}) updated to "${inq.inquiryStatus}"`,
        inquiryId,
        {
          actorId: "ADMIN-01",
          recordType: "Contact Inquiry",
          details: { inquiryId, prevResponse, newResponse: inq.customerResponse, inquiryStatus: inq.inquiryStatus, customer: inq.name }
        }
      );
      this.save();
      return inq;
    }

    overrideInquiryCustomerResponse(inquiryId, newStatus, reason = "", adminUser = "ADMIN (Limuel)") {
      const inq = (this.data.inquiries || []).find(i => i.id === inquiryId);
      if (!inq) return false;
      const prevResponse = inq.customerResponse || "Awaiting Response";
      const prevStatus = inq.inquiryStatus || "Not Sent";

      if (newStatus === "Proceed" || newStatus === "Proceed with Application") {
        inq.customerResponse = "Proceed";
        inq.inquiryStatus = "Proceed";
      } else if (newStatus === "Not Proceed" || newStatus === "Not Proceeding") {
        inq.customerResponse = "Not Proceed";
        inq.inquiryStatus = "Not Proceeding";
      } else if (newStatus === "Not Sent") {
        inq.customerResponse = "Awaiting Response";
        inq.inquiryStatus = "Not Sent";
      } else {
        inq.customerResponse = "Awaiting Response";
        inq.inquiryStatus = "Awaiting Response";
      }

      inq.manualOverride = {
        overriddenAt: new Date().toISOString(),
        overriddenBy: adminUser,
        reason: reason || "Manual administrator status override"
      };

      this.logActivity(
        "Admin",
        adminUser,
        `ADMIN manually overrode inquiry ${inquiryId} (${inq.name}) status to "${inq.inquiryStatus}". Reason: "${reason || 'No reason specified'}"`,
        inquiryId,
        {
          actorId: "ADMIN-01",
          recordType: "Contact Inquiry",
          details: { inquiryId, prevStatus, prevResponse, newResponse: inq.customerResponse, inquiryStatus: inq.inquiryStatus, reason, overriddenBy: adminUser }
        }
      );
      this.save();
      return inq;
    }

    // Prepares the customer activation email (with the internal activation link) for backend delivery.
    // Does not change invitation/account status — activation still happens via activateCustomerAccount().
    queueActivationEmail(customerId, adminUser = "ADMIN (Limuel)") {
      const cust = (this.data.customers || []).find(c => c.id === customerId);
      if (!cust) return { success: false, error: "Customer not found." };
      if (cust.invitationStatus === "Active") return { success: false, error: "This account is already active." };
      if (!cust.activationLink) return { success: false, error: "No activation link exists for this account." };
      const now = new Date().toISOString();
      cust.activationEmail = {
        to: cust.email,
        subject: "Activate your Hello Solar account",
        body: `Hi ${cust.name},\n\nYour Hello Solar customer account (${cust.id}) is ready. Open the link below to set your password and activate your account:\n${cust.activationLink}\n\nHello Solar Team`,
        activationLink: cust.activationLink,
        status: "Queued",
        queuedAt: now,
        queuedBy: adminUser
      };
      this.logActivity("Admin", adminUser, `ADMIN queued the activation email for ${cust.id} (${cust.name}) — awaiting email service delivery`, cust.id, {
        actorId: "ADMIN-01", recordType: "Customer Account", deferSave: true,
        details: { customerId: cust.id, recipient: cust.email, status: "Queued" }
      });
      this.save();
      return { success: true, customer: cust };
    }

    activateCustomerAccount(customerId, newPassword = null) {
      const cust = (this.data.customers || []).find(c => c.id === customerId);
      if (!cust) return { success: false, error: "Customer not found" };
      cust.invitationStatus = "Active";
      cust.status = "Active";
      cust.hasSetPassword = true;
      cust.activatedAt = new Date().toISOString();
      if (newPassword) cust.password = newPassword;
      this.logActivity(
        "Customer",
        cust.name,
        `Customer ${cust.id} (${cust.name}) activated portal account and set password`,
        cust.id,
        {
          actorId: cust.id,
          recordType: "Customer Account",
          details: { customerId: cust.id, status: "Active", invitationStatus: "Active" }
        }
      );
      this.save();
      return { success: true, customer: cust };
    }

    // --- FINANCER CONTRACT MANAGEMENT ---
    // Ownership rule: while a financer contract is Active, the financer owns funding/revenue of its financed
    // applications. Outside the active window (pending start, expired, terminated, none), ownership is Hello Solar.
    static get HELLO_SOLAR_OWNER() { return { name: "Hello Solar", id: "HELLO-SOLAR" }; }

    // Today's date (YYYY-MM-DD). window.HS_TODAY can pin "today" for automated tests.
    static todayISO(asOf) {
      const pinned = !asOf && typeof window !== "undefined" && window.HS_TODAY;
      if (pinned) return String(pinned).slice(0, 10);
      const d = asOf ? new Date(asOf) : new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }

    static addMonthsISO(startISO, months) {
      const [y, m, d] = String(startISO).split("-").map(Number);
      if (!y || !m || !d || !Number.isFinite(Number(months))) return null;
      const totalMonths = (m - 1) + Number(months);
      const ty = y + Math.floor(totalMonths / 12);
      const tm = ((totalMonths % 12) + 12) % 12;
      const lastDay = new Date(ty, tm + 1, 0).getDate();
      return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
    }

    getFinancerContract(financer, asOf) {
      const hs = HelloSolarStore.HELLO_SOLAR_OWNER;
      const today = HelloSolarStore.todayISO(asOf);
      const start = financer?.contractStartDate || null;
      const end = financer?.contractEndDate || null;
      let status;
      if (!start || !end) status = "No Contract";
      else if (financer.contractStatusOverride === "Terminated") status = "Terminated";
      else if (today < start) status = "Pending Start";
      else if (today >= end) status = "Expired";
      else status = "Active";
      const isFinancerOwned = status === "Active";
      const daysRemaining = isFinancerOwned
        ? Math.ceil((new Date(end + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000)
        : null;
      return {
        financerId: financer?.id || null,
        termMonths: financer?.contractTermMonths ?? null,
        annualRate: financer?.annualRate ?? null,
        startDate: start,
        endDate: end,
        status,
        daysRemaining,
        ownerName: isFinancerOwned ? financer.name : hs.name,
        ownerId: isFinancerOwned ? financer.id : hs.id,
        ownerType: isFinancerOwned ? "Financer" : "Hello Solar"
      };
    }

    // Funding view for a single application (used by Payments). Reuses getFinancerContract — no separate
    // ownership rules. The original financer (app.financer / app.financerId) is never overwritten, so it stays
    // linked for history after ownership transfers to Hello Solar.
    getApplicationFunding(app, asOf) {
      const isFull = (app?.paymentType || "").toLowerCase().includes("full") || app?.financer === "Not Required";
      const name = (app?.financer || "").toLowerCase();
      const financer = isFull ? null : (this.data.financers || []).find(f =>
        (app.financerId && f.id === app.financerId) || (name && f.name.toLowerCase() === name)) || null;
      const contract = financer ? this.getFinancerContract(financer, asOf) : null;
      return {
        isFinanced: !isFull,
        financerName: financer ? financer.name : (isFull ? null : (app?.financer || null)),
        financerId: financer ? financer.id : (app?.financerId || null),
        fundedAmount: Number(app?.amount) || 0,
        contractStatus: contract ? contract.status : null,
        contractEndDate: contract ? contract.endDate : null,
        ownerName: contract ? contract.ownerName : (app?.fundingOwner || null),
        ownerId: contract ? contract.ownerId : (app?.fundingOwnerId || null),
        ownerType: contract ? contract.ownerType : null
      };
    }

    getApplicationsForFinancer(financer) {
      const name = (financer?.name || "").toLowerCase();
      return (this.data.applications || []).filter(a =>
        a.financerId === financer.id || (a.financer || "").toLowerCase() === name);
    }

    // Recomputes derived contract status + funding owner on financers and their linked applications.
    // Logs an audit entry whenever ownership changes hands (e.g. contract expiry -> Hello Solar).
    syncFinancerContracts(options = {}) {
      let changed = false;
      (this.data.financers || []).forEach(f => {
        const c = this.getFinancerContract(f, options.asOf);
        const prevOwnerId = f.fundingOwnerId;
        if (f.contractStatus !== c.status || f.fundingOwnerId !== c.ownerId || f.fundingOwner !== c.ownerName) {
          f.contractStatus = c.status;
          f.fundingOwner = c.ownerName;
          f.fundingOwnerId = c.ownerId;
          changed = true;
          if (prevOwnerId && prevOwnerId !== c.ownerId && !options.silent) {
            this.logActivity("System", "SYSTEM (Contract Engine)",
              `Funding/revenue ownership for ${f.id} (${f.name}) transferred to ${c.ownerName} — contract ${c.status.toLowerCase()}`,
              f.id, { recordType: "Financer Account", deferSave: true, details: { contractStatus: c.status, fundingOwner: c.ownerName, previousOwnerId: prevOwnerId } });
          }
        }
        this.getApplicationsForFinancer(f).forEach(a => {
          if (a.fundingOwnerId !== c.ownerId || a.fundingOwner !== c.ownerName) {
            a.fundingOwner = c.ownerName;
            a.fundingOwnerId = c.ownerId;
            changed = true;
          }
        });
      });
      if (changed) this.save();
      return changed;
    }

    updateFinancerContract(financerId, payload = {}) {
      const fin = (this.data.financers || []).find(f => f.id === financerId);
      if (!fin) return { success: false, error: "Financer not found." };

      const term = Number(payload.contractTermMonths);
      const rate = Number(payload.annualRate);
      const start = String(payload.contractStartDate || "").trim();
      const end = String(payload.contractEndDate || "").trim() || HelloSolarStore.addMonthsISO(start, term);
      const isoRe = /^\d{4}-\d{2}-\d{2}$/;

      if (!Number.isInteger(term) || term < 1 || term > 360) return { success: false, error: "Contract term must be a whole number of months (1–360)." };
      if (payload.annualRate === "" || payload.annualRate == null || !Number.isFinite(rate) || rate < 0 || rate > 100) return { success: false, error: "Annual rate must be between 0% and 100%." };
      if (!isoRe.test(start)) return { success: false, error: "A valid contract start date is required." };
      if (!end || !isoRe.test(end)) return { success: false, error: "A valid contract end date is required." };
      if (end <= start) return { success: false, error: "Contract end date must be after the start date." };

      const before = this.getFinancerContract(fin);
      fin.contractTermMonths = term;
      fin.annualRate = Math.round(rate * 100) / 100;
      fin.contractStartDate = start;
      fin.contractEndDate = end;
      fin.contractStatusOverride = payload.contractStatusOverride === "Terminated" ? "Terminated" : null;
      fin.contractUpdatedAt = new Date().toISOString();

      const after = this.getFinancerContract(fin);
      this.logActivity("Admin", "ADMIN (Limuel)",
        `Updated financer contract for ${fin.id} (${fin.name}): ${term} mo @ ${fin.annualRate}% p.a., ${start} to ${end} · ${after.status} · Owner: ${after.ownerName}`,
        fin.id, {
          recordType: "Financer Account", deferSave: true,
          details: { contractTermMonths: term, annualRate: fin.annualRate, contractStartDate: start, contractEndDate: end, contractStatus: after.status, fundingOwner: after.ownerName, previousStatus: before.status, previousOwner: before.ownerName }
        });
      this.syncFinancerContracts({ silent: true });
      this.save();
      return { success: true, financer: fin, contract: after };
    }

    // --- DYNAMIC ATTENTION ITEMS ---
    getAttentionItems() {
      const items = [];
      const overdueLimit = Number(this.data.settings?.overdueThresholdDays) || 5;
      const delayLimit = Number(this.data.settings?.installationDelayThresholdDays) || 1;
      const docReviewLimit = Number(this.data.settings?.docReviewEscalationHours) || 48;

      // 1. Applications waiting review or missing docs (flagged based on docReviewEscalationHours)
      this.data.applications.forEach(a => {
        if (a.stage === "Missing Documents") {
          items.push({
            id: a.id,
            type: "Application",
            issue: "Missing documents",
            title: `Missing documents for ${a.id}`,
            context: `${a.customer} · ${a.location} · ${this.getAppDocumentCounts(a.id).label} uploaded (Review SLA: ${docReviewLimit}h)`,
            kind: "warn",
            actionLabel: "Review Application",
            actionType: "view_app",
            payload: a.id
          });
        } else if (a.stage === "Submitted") {
          items.push({
            id: a.id,
            type: "Application",
            issue: "Awaiting initial review",
            title: `New application awaiting initial review`,
            context: `${a.customer} · ${a.system} · ${a.financer} (Escalate after ${docReviewLimit}h)`,
            kind: "warn",
            actionLabel: "Review",
            actionType: "view_app",
            payload: a.id
          });
        }
      });

      // 1b. Uploaded documents still waiting for review after docReviewEscalationHours
      this.data.applications.forEach(a => {
        if (["Declined", "Missing Documents"].includes(a.stage)) return;
        let docs = [];
        try { docs = this.getAppDocuments(a.id) || []; } catch (err) { docs = []; }
        const waiting = docs.filter(d => d.status === "Submitted" && d.date && (Date.now() - Date.parse(d.date)) / 36e5 >= docReviewLimit);
        if (!waiting.length) return;
        items.push({
          id: a.id,
          type: "Application",
          issue: "Documents waiting for review",
          title: `Documents waiting for review for ${a.id}`,
          context: `${a.customer} · ${waiting.length} document${waiting.length === 1 ? "" : "s"} waiting more than ${docReviewLimit}h`,
          kind: "warn",
          actionLabel: "Review Documents",
          actionType: "view_app",
          payload: a.id
        });
      });

      // 1c. Approved / installed systems whose customer has not uploaded the signed agreement yet (one grouped item)
      const S = typeof window !== "undefined" ? window.HSShared : null;
      if (S && typeof S.agreementFor === "function") {
        const past = ["Approved", "Ready for Installation", "Installation", "In Progress", "Completed", "Installation Completed"];
        const noAgreement = this.data.applications.filter(a => a.customerId && past.includes(a.stage) &&
          ["NOT_SUBMITTED", "REUPLOAD_REQUIRED"].includes((S.agreementFor(a) || {}).status));
        if (noAgreement.length) {
          const ids = noAgreement.map(a => a.id);
          items.push({
            id: `${ids.length} APP${ids.length === 1 ? "" : "s"}`,
            type: "Application",
            issue: `Signed agreement not uploaded yet (${ids.slice(0, 3).join(", ")}${ids.length > 3 ? ", …" : ""})`,
            title: "Signed agreements missing",
            context: ids.join(", "),
            kind: "warn",
            actionLabel: "Review Application",
            actionType: "view_app",
            payload: ids[0]
          });
        }
      }

      // 2. Delayed installations (driven by installationDelayThresholdDays)
      this.data.installations.forEach(j => {
        if (j.status === "Delayed") {
          items.push({
            id: j.id,
            type: "Installation",
            issue: "Installation delayed",
            title: `Installation delayed: ${j.id}`,
            context: `${j.customer} · ${j.location} · ${j.installer} (Threshold: >${delayLimit}d)`,
            kind: "danger",
            actionLabel: "Manage Job",
            actionType: "view_job",
            payload: j.id
          });
        }
      });

      // 3. Overdue payments (driven by overdueThresholdDays)
      this.data.applications.forEach(a => {
        if (a.paymentStatus === "Overdue" && a.stage !== "Declined") {
          items.push({
            id: a.id,
            type: "Payment",
            issue: "Overdue payment",
            title: `Overdue payment for ${a.id}`,
            context: `${a.customer} · ${a.financer} · ₱${(a.monthly || 0).toLocaleString()}/mo (Missed past ${overdueLimit}d grace: ${this.formatReadableDate(a.nextDue)})`,
            kind: "danger",
            actionLabel: "View Payment",
            actionType: "view_payment",
            payload: a.id
          });
        }
      });

      // 4. Open high-priority support tickets
      this.data.support.forEach(s => {
        if (s.status !== "Resolved" && s.priority === "High") {
          items.push({
            id: s.id,
            type: "Support",
            issue: s.concern || "High priority issue",
            title: `High Priority Issue: ${s.id}`,
            context: `${s.accountType} (${s.accountName}) · ${s.concern}`,
            kind: "danger",
            actionLabel: "Resolve Ticket",
            actionType: "view_ticket",
            payload: s.id
          });
        }
      });

      return items;
    }
  }

  HelloSolarStore.prototype.parseActivityDate = parseActivityDate;
  HelloSolarStore.prototype.formatExactAuditTimestamp = formatExactAuditTimestamp;
  HelloSolarStore.prototype.formatRelativeAuditTime = formatRelativeAuditTime;
  HelloSolarStore.prototype.calculateRelativeTime = formatRelativeAuditTime;

  // ------------------------------------------------------------------
  // Backend commands (api mode). Every Super Admin / Direct Engineer write goes through one of these
  // HelloSolarStore methods; after a successful call the method name and its arguments are sent to
  // POST {apiBase}/admin/commands/<method> (see API_CONTRACT.md, "Super Admin commands"). Local mode is unchanged.
  // ------------------------------------------------------------------
  const ADMIN_COMMANDS = [
    "createAccount", "updateAccountStatus", "activateCustomerAccount", "queueActivationEmail",
    "assignFinancer", "updateFinancerContract", "assignPartnerInstaller", "acceptDirectInstallation",
    "updateApplicationStage", "updateDocumentStatus", "setInstallationCost",
    "verifyPaymentReceipt", "rejectPaymentReceipt", "uploadCustomerReceipt",
    "verifyInstallmentReceipt", "rejectInstallmentReceipt", "recordPayment", "recordPaymentAdjustment",
    "requestSystemDisconnect", "confirmSystemDisconnect",
    "scheduleReadyProject", "updateInstallationStatus",
    "engineerAcceptJob", "saveDirectInstallationProgress", "engineerCompleteInstallation", "engineerActivateSystem",
    "updateSupportTicket", "addTicketMessage", "resolveSupportTicket", "reopenSupportTicket",
    "approvePartnerInquiry", "updateInquiryStatus", "saveInquiryConfirmationMessage", "sendInquiryConfirmationEmail",
    "updateInquiryCustomerResponse", "overrideInquiryCustomerResponse",
    "updateSettings"
  ];
  const commandSucceeded = res => res !== false && res !== null && res !== undefined &&
    !(res && typeof res === "object" && (res.success === false || res.ok === false));
  const plainArgs = args => JSON.parse(JSON.stringify(args, (k, v) => (typeof v === "function" ? undefined : v)));
  // Parameter names of a method, read from its signature: "assignFinancer(appId, financerId, options = {})"
  // → ["appId", "financerId", "options"]. Used to send named fields ({ appId: "APP-1024", ... }) to the backend.
  function paramNames(fn) {
    const src = Function.prototype.toString.call(fn);
    const open = src.indexOf("(");
    let depth = 0, quote = "", cur = "", list = [];
    for (let i = open + 1; i < src.length; i++) {
      const ch = src[i];
      if (quote) { if (ch === quote && src[i - 1] !== "\\") quote = ""; cur += ch; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { quote = ch; cur += ch; continue; }
      if ("([{".includes(ch)) depth++;
      if (")]}".includes(ch)) { if (depth === 0) { list.push(cur); break; } depth--; }
      if (ch === "," && depth === 0) { list.push(cur); cur = ""; continue; }
      cur += ch;
    }
    return list.map(p => p.split("=")[0].trim()).filter(Boolean);
  }
  function namedParams(names, args) {
    const params = {};
    names.forEach((name, i) => { if (i < args.length && args[i] !== undefined) params[name] = args[i]; });
    return params;
  }
  const ADMIN_COMMAND_PARAMS = {};
  ADMIN_COMMANDS.forEach(name => {
    if (typeof HelloSolarStore.prototype[name] === "function") ADMIN_COMMAND_PARAMS[name] = paramNames(HelloSolarStore.prototype[name]);
  });
  HelloSolarStore.ADMIN_COMMAND_PARAMS = ADMIN_COMMAND_PARAMS;
  if (IS_API && typeof window !== "undefined" && window.HSApi) {
    let depth = 0; // only the outermost call is sent (methods call each other internally)
    ADMIN_COMMANDS.forEach(name => {
      const original = HelloSolarStore.prototype[name];
      if (typeof original !== "function") return;
      HelloSolarStore.prototype[name] = function (...args) {
        depth++;
        let res;
        try { res = original.apply(this, args); } finally { depth--; }
        if (depth === 0 && commandSucceeded(res)) {
          // params: named fields (read these on the backend). args: the same values in order (kept for compatibility).
          const plain = plainArgs(args);
          window.HSApi.command(`admin.${name}`, { params: namedParams(ADMIN_COMMAND_PARAMS[name] || [], plain), args: plain }, { role: "admin" });
        }
        return res;
      };
    });
  }
  HelloSolarStore.ADMIN_COMMANDS = ADMIN_COMMANDS;

  window.HelloSolarStore = HelloSolarStore;
  window.HELLO_SOLAR_PACKAGES = { catalog: PACKAGE_CATALOG, findPackage, termMonths: INSTALLMENT_TERM_MONTHS, termOptions: INSTALLMENT_TERM_OPTIONS, termLabel, monthlyForTerm, downPayment: INSTALLMENT_DOWN_PAYMENT, fullPaymentDownPayment: FULL_PAYMENT_DOWN_PAYMENT, downPaymentAmountFor };
  window.HELLO_SOLAR_DB = new HelloSolarStore();
  // Maintain backward compatibility for any script accessing window.HELLO_SOLAR_DATA
  window.HELLO_SOLAR_DATA = window.HELLO_SOLAR_DB.data;
})();
