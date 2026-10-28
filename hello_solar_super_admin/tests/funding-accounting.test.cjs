// Hello Solar Funding, ₱500 / ₱10,000 down payments, site visit lifecycle + continue link,
// accounting views (payments received, revenue channels, funder and customer schedules), service agreements.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { environment, completeDocuments } = require('../../shared/tests/helpers.cjs');

const CUSTOMER_KEY = 'HELLO_SOLAR_CUSTOMER_INQUIRIES';

function buyNow(payment) {
  return {
    id: 'INQ-LP' + Math.floor(Math.random() * 1e9), inquiryType: 'Customer', requestType: 'Buy Now', source: 'Landing Page — Buy Now',
    name: 'Ana Cruz', firstName: 'Ana', lastName: 'Cruz', email: `ana${Math.random()}@x.test`, phone: '09171234567', location: 'Cebu City, Cebu',
    packageId: 'hs6-lite', package: 'HS 6 LITE', selectedSolarModel: 'HS 6 LITE', paymentPreference: payment, paymentType: payment,
    paymentProof: { purpose: 'Down Payment', amount: payment === 'Installment' ? 10000 : 500, fileName: 'r.jpg', dataUrl: 'data:image/jpeg;base64,AA', status: 'Pending Verification' },
    status: 'Unread', inquiryStatus: 'Proceed', customerResponse: 'Proceed', timestamp: new Date().toISOString()
  };
}

function siteAssessment() {
  return {
    id: 'INQ-SA' + Math.floor(Math.random() * 1e9), inquiryType: 'Customer', requestType: 'Site Assessment', source: 'Landing Page — Site Assessment',
    name: 'Maria Santos', email: 'maria@x.test', phone: '09171234567', location: 'Makati City', preferredVisitDate: '2026-10-30',
    packageId: 'hs6-pro', package: 'HS 6 PRO',
    paymentProof: { purpose: 'Site Visit Fee', amount: 1000, fileName: 'sv.jpg', dataUrl: 'data:image/jpeg;base64,AA', status: 'Pending Verification' },
    status: 'Unread', inquiryStatus: 'Not Sent', customerResponse: 'Awaiting Response', timestamp: new Date().toISOString()
  };
}

test('down payment is ₱500 for Full Payment and ₱10,000 for Installment', () => {
  const full = buyNow('Full Payment');
  const inst = buyNow('Installment');
  const { c } = environment([[CUSTOMER_KEY, JSON.stringify([full, inst])]]);
  const db = c.HELLO_SOLAR_DB;
  db.getInquiries();
  const appFull = db.data.applications.find(a => a.inquiryId === full.id);
  const appInst = db.data.applications.find(a => a.inquiryId === inst.id);
  assert.equal(db.downPaymentAmount(appFull), 500);
  assert.equal(db.downPaymentAmount(appInst), 10000);
  assert.equal(c.HELLO_SOLAR_PACKAGES.downPaymentAmountFor('Full Payment'), 500);
  assert.equal(c.HELLO_SOLAR_PACKAGES.downPaymentAmountFor('Installment'), 10000);
  // Accounting lists both, waiting for verification, in the right revenue channel
  const rows = db.getAllPayments().filter(r => r.kind === 'dp');
  const rFull = rows.find(r => r.appId === appFull.id);
  const rInst = rows.find(r => r.appId === appInst.id);
  assert.equal(rFull.amount, 500);
  assert.equal(rFull.channel, 'Solar Kit Revenue');
  assert.equal(rInst.channel, 'Solar Financing Review');
  assert.equal(rInst.status, 'Pending Verification');
  assert.equal(db.verifyPaymentRow(rInst.key).success, true);
  assert.equal(db.downPaymentState(appInst), 'Verified');
  const channels = db.getRevenueChannels().channels;
  const verifiedInstDp = db.getAllPayments().filter(r => r.kind === 'dp' && r.channel === 'Solar Financing Review' && r.status === 'Verified')
    .reduce((x, r) => x + r.amount, 0);
  assert.ok(verifiedInstDp >= 10000);
  assert.equal(channels.find(x => x.name === 'Solar Financing Review').byType['Down Payment'], verifiedInstDp);
});

test('Super Admin accepts Hello Solar Funding for an installment waiting for financing', () => {
  const { c, S } = environment();
  const db = c.HELLO_SOLAR_DB;
  const app = db.data.applications.find(a => db.isEligibleForHelloSolarFunding(a));
  assert.ok(app, 'an installment application waiting for financing');
  const full = db.data.applications.find(a => db.isFullPaymentApp(a));
  assert.equal(db.isEligibleForHelloSolarFunding(full), false);
  assert.match(db.acceptHelloSolarFunding(app.id).error, /Complete the documents first/, 'documents gate');
  completeDocuments(S, app.id);
  const res = db.acceptHelloSolarFunding(app.id);
  assert.equal(res.success, true, res.error);
  const saved = db.data.applications.find(a => a.id === app.id);
  assert.equal(saved.financer, 'Hello Solar Funding');
  assert.equal(saved.stage, 'Ready for Installation');
  assert.equal(saved.financingStatus, 'APPROVED');
  assert.equal(db.isHelloSolarFunded(saved), true);
  assert.equal(db.acceptHelloSolarFunding(app.id).success, false, 'cannot accept twice');
  // The customer schedule groups it under Hello Solar Funding
  const sched = db.getCustomerPaymentSchedule();
  assert.ok(sched.rows.some(r => r.appId === app.id && r.funderName === 'Hello Solar Funding'));
});

test('site visit lifecycle: payment → pending visit → visit confirmed, then the continue link', () => {
  const inq = siteAssessment();
  const { c } = environment([[CUSTOMER_KEY, JSON.stringify([inq])]]);
  const db = c.HELLO_SOLAR_DB;
  const v = db.getSiteVisits().find(x => x.inquiryId === inq.id);
  assert.equal(db.siteVisitStage(v), 'Site Visit Payment');
  db.verifySiteVisitFee(v.id);
  assert.equal(db.siteVisitStage(v), 'Pending Visit');
  db.assignSiteVisit(v.id, { type: 'installer', refId: 'INS-002', scheduledDate: '2026-10-30' });
  assert.equal(db.siteVisitStage(v), 'Pending Visit');
  db.updateSiteVisitStatus(v.id, 'Completed');
  assert.equal(db.siteVisitStage(v), 'Visit Confirmed');
  assert.match(v.continueLink, /^Hello_Solar\/continue\.html\?visit=SV-\d+&t=\w+/);
  assert.equal(v.continueResponse, 'Awaiting Response');
  assert.equal(db.respondSiteVisitContinue(v.id, 'wrong', 'Yes').success, false);
  const yes = db.respondSiteVisitContinue(v.id, v.continueToken, 'Yes');
  assert.equal(yes.proceed, true);
  const saved = db.getSiteVisits().find(x => x.id === v.id);
  assert.equal(saved.clientDecision, 'Proceeding');
  assert.match(saved.continueResponse, /^Yes/);
  const no = db.respondSiteVisitContinue(v.id, v.continueToken, 'No');
  assert.equal(no.proceed, false);
  assert.equal(db.getSiteVisits().find(x => x.id === v.id).clientDecision, 'Not Proceeding');
});

test('funder payment schedule: interest = fund × IR ÷ 12, principal = fund ÷ term', () => {
  const { c } = environment();
  const db = c.HELLO_SOLAR_DB;
  const { rows, totals } = db.getFunderSchedule();
  const sunfund = rows.find(r => r.funderId === 'FIN-001');
  assert.equal(sunfund.fund, 4850000);
  assert.equal(sunfund.termMonths, 36);
  assert.equal(sunfund.monthlyInterest, 34354.17); // 4,850,000 × 8.5% ÷ 12
  assert.equal(sunfund.monthlyPrincipal, 134722.22); // 4,850,000 ÷ 36
  assert.equal(sunfund.totalMonthly, 169076.39);
  rows.forEach(r => assert.equal(Math.round((r.monthlyInterest + r.monthlyPrincipal) * 100) / 100, r.totalMonthly));
  const sum = Math.round(rows.reduce((s, r) => s + r.totalMonthly, 0) * 100) / 100;
  assert.equal(totals.totalMonthly, sum);
});

test('customer payment schedule totals the monthly fixed per funder', () => {
  const { c } = environment();
  const db = c.HELLO_SOLAR_DB;
  const { rows, funders, totalMonthly } = db.getCustomerPaymentSchedule();
  assert.ok(rows.length > 0);
  rows.forEach(r => assert.ok(!db.isFullPaymentApp(db.data.applications.find(a => a.id === r.appId))));
  funders.forEach(f => {
    const expected = Math.round(rows.filter(r => r.funderName === f.name).reduce((s, r) => s + r.monthlyFixed, 0) * 100) / 100;
    assert.equal(f.totalMonthly, expected, f.name);
  });
  assert.equal(totalMonthly, Math.round(funders.reduce((s, f) => s + f.totalMonthly, 0) * 100) / 100);
});

test('customer uploads the signed agreement; Super Admin views it and accepts it', () => {
  const { S, c } = environment();
  const db = c.HELLO_SOLAR_DB;
  const app = db.data.applications.find(a => a.customerId && !db.isFullPaymentApp(a));
  const ag = S.agreementFor(app.id);
  assert.equal(ag.title, 'Installment Agreement');
  assert.equal(ag.file, 'assets/PDF/Installment Agreement.pdf');
  assert.equal(ag.status, 'NOT_SUBMITTED');
  const pdf = 'data:application/pdf;base64,JVBERi0=';
  const file = { name: 'signed.pdf', type: 'application/pdf', size: 1200 };
  assert.equal(S.uploadSignedAgreement(app.customerId, app.id, { name: 'a.docx', type: 'application/msword', size: 10 }, pdf).ok, false, 'PDF/JPG/PNG only');
  assert.equal(S.uploadSignedAgreement(app.customerId, app.id, { ...file, size: 3 * 1024 * 1024 }, pdf).ok, false, 'max 2 MB');
  assert.equal(S.uploadSignedAgreement('CUS-NOPE', app.id, file, pdf).ok, false, 'only the owner');
  assert.equal(S.reviewAgreement(app.id, 'ACCEPTED').ok, false, 'nothing to review yet');
  const res = S.uploadSignedAgreement(app.customerId, app.id, file, pdf);
  assert.equal(res.ok, true, res.error);
  assert.equal(S.agreementFor(app.id).status, 'SUBMITTED');
  assert.equal(S.agreementFor(app.id).fileName, 'signed.pdf');
  assert.equal(S.agreementFileFor(app.id).fileData, pdf);
  assert.equal(S.reviewAgreement(app.id, 'REUPLOAD_REQUIRED', 'Blurry').ok, true);
  assert.equal(S.agreementFor(app.id).status, 'REUPLOAD_REQUIRED');
  assert.equal(S.uploadSignedAgreement(app.customerId, app.id, file, pdf).ok, true);
  assert.equal(S.reviewAgreement(app.id, 'ACCEPTED').ok, true);
  assert.equal(S.agreementFor(app.id).status, 'ACCEPTED');
  assert.equal(S.uploadSignedAgreement(app.customerId, app.id, file, pdf).ok, false, 'locked once accepted');
  const full = db.data.applications.find(a => db.isFullPaymentApp(a));
  assert.equal(S.agreementFor(full.id).title, 'Full Payment Agreement');
});

test('document counts include the signed agreement and the required documents (Installment 8)', () => {
  const { S, c } = environment();
  const db = c.HELLO_SOLAR_DB;
  const full = db.data.applications.find(a => a.customerId && db.isFullPaymentApp(a));
  const fullCounts = db.getAppDocumentCounts(full.id);
  assert.equal(db.getAppDocuments(full.id)[0].name, 'Signed Full Payment Agreement');
  assert.equal(fullCounts.total, 1 + db._baseAppDocuments(full.id).filter(d => !d.optional).length);
  assert.ok(db._baseAppDocuments(full.id).some(d => d.name.startsWith('Valid ID #1')), 'Full Payment customers send the documents too');
  const inst = db.data.applications.find(a => a.id === 'APP-1105');
  assert.equal(db.getAppDocumentCounts(inst.id).total, 8);
  // Uploading the signed agreement moves it to Submitted, accepting it to Verified
  const before = db.getAppDocumentCounts(inst.id).submitted;
  S.uploadSignedAgreement(inst.customerId, inst.id, { name: 's.pdf', type: 'application/pdf', size: 100 }, 'data:application/pdf;base64,AA');
  db.data = db.load();
  assert.equal(db.getAppDocumentCounts(inst.id).submitted, before + 1);
  S.reviewAgreement(inst.id, 'ACCEPTED');
  db.data = db.load();
  assert.equal(db.getAppDocuments(inst.id)[0].status, 'Verified');
});

test('money out: only active funders are due; mark as paid once per month, undo works', () => {
  const { c } = environment();
  const db = c.HELLO_SOLAR_DB;
  const { activeTotals } = db.getFunderSchedule();
  const due = db.getFunderPaymentsDue('2026-10');
  assert.equal(due.totalDue, activeTotals.totalMonthly);
  assert.equal(due.rows.find(r => r.funderId === 'FIN-002').due, false, 'expired BDO is not due');
  assert.equal(db.markFunderPaid('FIN-002', '2026-10').success, false);
  const sunfund = due.rows.find(r => r.funderId === 'FIN-001');
  const res = db.markFunderPaid('FIN-001', '2026-10');
  assert.equal(res.success, true, res.error);
  assert.equal(res.payment.amount, sunfund.totalMonthly);
  assert.equal(db.markFunderPaid('FIN-001', '2026-10').success, false, 'cannot pay twice');
  const s = db.getMoneySummary('2026-10');
  assert.equal(s.moneyOut.funders, sunfund.totalMonthly);
  assert.equal(s.stillToPay.amount, Math.round((activeTotals.totalMonthly - sunfund.totalMonthly) * 100) / 100);
  db.data = db.load();
  assert.equal(db.getFunderPayments().length, 1, 'saved');
  assert.equal(db.undoFunderPaid('FIN-001', '2026-10').success, true);
  assert.equal(db.getMoneySummary('2026-10').moneyOut.funders, 0);
});

test('money in for a month = verified customer payments that month + funder loans received that month', () => {
  const { c } = environment();
  const db = c.HELLO_SOLAR_DB;
  const verified = db.getAllPayments().filter(r => r.status === 'Verified' && String(r.date).startsWith('2026-09'));
  const s = db.getMoneySummary('2026-09');
  assert.equal(s.moneyIn.customers, Math.round(verified.reduce((x, r) => x + r.amount, 0) * 100) / 100);
  assert.equal(s.moneyIn.customerCount, verified.length);
  const loans = db.getFunderLoansReceived();
  const union = loans.find(l => l.funderId === 'FIN-003');
  assert.equal(db.getMoneySummary(union.date.slice(0, 7)).moneyIn.funders >= union.amount, true);
  // revenue channels never include funder loans
  assert.equal(db.getRevenueChannels().total, Math.round(db.getAllPayments().filter(r => r.status === 'Verified').reduce((x, r) => x + r.amount, 0) * 100) / 100);
  assert.equal(s.toCheck.count, db.getAllPayments().filter(r => r.status === 'Pending Verification').length);
});

test('site photos and map link are not required once the system is installed; the agreement still is', () => {
  const { c, S } = environment();
  const db = c.HELLO_SOLAR_DB;
  const installed = db.data.applications.find(a => a.id === 'APP-1062'); // installation in progress
  const recI = S.documentRecordFor(installed.id);
  ['site_photos', 'site_map_link'].forEach(id => {
    const d = recI.documents.find(x => x.id === id);
    if (d.status === 'NOT_SUBMITTED') { assert.equal(d.notRequired, true); assert.equal(d.optional, true); }
  });
  const docs = db.getAppDocuments(installed.id);
  assert.ok(!db.getAppDocumentCounts(installed.id).missing.some(d => /Site Photos|Google Maps/.test(d.label || d.name)));
  assert.ok(docs[0].isAgreement && db.getAppDocumentCounts(installed.id).missing.some(d => d.isAgreement), 'agreement still required');
  const notInstalled = db.data.applications.find(a => a.id === 'APP-1050');
  assert.ok(S.documentRecordFor(notInstalled.id).documents.filter(d => ['site_photos', 'site_map_link'].includes(d.id)).every(d => !d.notRequired));
  // the gate lists what is missing; completing them opens it
  assert.equal(S.applicationDocsComplete(notInstalled.id).ok, false);
});

test('an installation cannot be scheduled or started until the documents are complete', () => {
  const { c, S } = environment();
  const db = c.HELLO_SOLAR_DB;
  const job = db.data.installations.find(j => j.id === 'JOB-305'); // APP-1058, Ready, Hello Solar Installation
  const blocked = db.scheduleReadyProject(job.id, '2026-11-05', '09:00', 'Engr. Mark Dizon');
  assert.equal(blocked.success, false);
  assert.match(blocked.message, /cannot be scheduled or installed yet/);
  assert.equal(db.updateInstallationStatus(job.id, 'In Progress').success, false);
  assert.equal(db.data.installations.find(j => j.id === 'JOB-305').status, 'Ready', 'unchanged');
  // a maintenance job is never blocked
  assert.notEqual(db.updateInstallationStatus('JOB-306', 'Completed').success, false);
  completeDocuments(S, job.appId);
  assert.equal(db.scheduleReadyProject(job.id, '2026-11-05', '09:00', 'Engr. Mark Dizon').success, true);
});

test('new document list: 2 valid IDs, payslips or bank statement, proof of ownership or lease; older uploads carry over', () => {
  const { S, store } = environment();
  assert.equal(JSON.stringify(S.DOCUMENT_REQUESTS.filter(d => !d.optional).map(d => d.id)),
    JSON.stringify(['valid_id_1', 'valid_id_2', 'income_proof', 'residence_proof', 'proof_of_billing', 'site_photos', 'site_map_link']));
  // an older record: Proof of Income Accepted + Bank Statement Submitted → one "Payslips or Bank Statement", Accepted
  store.set('hello_solar_shared_documents', JSON.stringify({ 'APP-1105': { appId: 'APP-1105', documents: [
    { id: 'gov_id_front', name: 'Valid Government ID — Front / Main Page', status: 'ACCEPTED' },
    { id: 'proof_of_income', name: 'Proof of Income', status: 'ACCEPTED' },
    { id: 'bank_statement', name: 'Bank Statement', status: 'SUBMITTED', fileName: 'bank.pdf' }
  ] } }));
  const docs = S.documentRecordFor('APP-1105').documents;
  assert.equal(docs.find(d => d.id === 'valid_id_1').status, 'ACCEPTED');
  assert.equal(docs.find(d => d.id === 'income_proof').status, 'ACCEPTED');
  const extra = docs.find(d => d.id === 'bank_statement');
  assert.ok(extra && extra.optional, 'the other older upload is kept, not counted');
  assert.equal(docs.find(d => d.id === 'valid_id_2').status, 'NOT_SUBMITTED');
  // an application approved before the new requests doesn't need them (but a new one would)
  const approved = S.documentRecordFor('APP-1024').documents;
  ['valid_id_2', 'residence_proof'].forEach(id => {
    const d = approved.find(x => x.id === id);
    if (d.status === 'NOT_SUBMITTED') assert.equal(d.notRequired, true);
  });
});

test('Super Admin requests a document and marks one not required; both reach the customer record and the gate', () => {
  const { S, store } = environment();
  const appId = 'APP-1105';
  assert.equal(S.requestDocument(appId, { name: 'ab' }).ok, false, 'needs a name');
  const r = S.requestDocument(appId, { name: 'Certificate of Employment', note: 'Signed by HR' }, 'ADMIN (Limuel)');
  assert.equal(r.ok, true, r.error);
  let doc = S.documentRecordFor(appId).documents.find(d => d.id === r.document.id);
  assert.equal(doc.requested, true);
  assert.equal(doc.optional, false, 'a requested document is required');
  assert.ok(S.applicationDocsComplete(appId).missing.includes('Certificate of Employment'));
  assert.equal(S.requestDocument(appId, { name: 'Certificate of Employment' }).ok, false, 'no duplicate request');
  const notes = JSON.parse(store.get('hello_solar_notifications_store') || '[]');
  assert.ok(notes.some(n => n.recordId === appId && n.eventType === 'DOCUMENT_REQUESTED'));
  // Not required, with a reason the customer sees; it stops blocking
  assert.equal(S.setDocumentNotRequired(appId, 'residence_proof', 'x').ok, false, 'needs a reason');
  assert.equal(S.setDocumentNotRequired(appId, 'residence_proof', 'Registered owner on the title', 'ADMIN').ok, true);
  doc = S.documentRecordFor(appId).documents.find(d => d.id === 'residence_proof');
  assert.equal(doc.notRequired, true);
  assert.match(doc.note, /Registered owner on the title/);
  assert.ok(!S.applicationDocsComplete(appId).missing.some(m => /Home Ownership/.test(m)));
  // ...and can be required again
  assert.equal(S.setDocumentNotRequired(appId, 'residence_proof', null, 'ADMIN').ok, true);
  assert.ok(!S.documentRecordFor(appId).documents.find(d => d.id === 'residence_proof').notRequired);
  // the requested document survives a later migration of the record
  assert.ok(S.documentRecordFor(appId).documents.some(d => d.name === 'Certificate of Employment'));
  assert.ok(S.read().activity.some(a => a.record === appId && /requested "Certificate of Employment"/.test(a.action)));
});
