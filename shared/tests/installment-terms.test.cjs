// Installment terms: 6 months · 3 years · 6 years (Installment only). The term the customer picks on Buy Now is
// saved on the application and drives the monthly payment and the number of installments everywhere.
// Run: node --test shared/tests/
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { environment, completeDocuments } = require('./helpers.cjs');

const CUSTOMER_KEY = 'HELLO_SOLAR_CUSTOMER_INQUIRIES';

function buyNow(payment, termMonths, monthlyPayment) {
  return {
    id: 'INQ-LP' + Math.floor(Math.random() * 1e9), inquiryType: 'Customer', requestType: 'Buy Now', source: 'Landing Page — Buy Now',
    name: 'Ana Cruz', firstName: 'Ana', lastName: 'Cruz', email: `ana${Math.random()}@x.test`, phone: '09171234567', location: 'Cebu City, Cebu',
    packageId: 'hs6-pro', package: 'HS 6 PRO', selectedSolarModel: 'HS 6 PRO', paymentPreference: payment, paymentType: payment,
    packagePrice: 340000, monthlyPayment, termMonths, downPayment: payment === 'Installment' ? 10000 : 500,
    paymentProof: { purpose: 'Down Payment', amount: payment === 'Installment' ? 10000 : 500, fileName: 'r.jpg', dataUrl: 'data:image/jpeg;base64,AA', status: 'Pending Verification' },
    status: 'Unread', inquiryStatus: 'Proceed', customerResponse: 'Proceed', timestamp: new Date().toISOString()
  };
}

test('every package has a monthly price for 6 months, 3 years and 6 years', () => {
  const { c } = environment();
  const P = c.HELLO_SOLAR_PACKAGES;
  assert.deepEqual(JSON.parse(JSON.stringify(P.termOptions)), [6, 36, 72]);
  P.catalog.forEach(pkg => {
    P.termOptions.forEach(t => assert.ok(P.monthlyForTerm(pkg.id, t) > 0, `${pkg.id} ${t} months`));
    assert.equal(P.monthlyForTerm(pkg.id, 72), pkg.monthly, '6-year price unchanged');
    assert.ok(P.monthlyForTerm(pkg.id, 6) > P.monthlyForTerm(pkg.id, 36) && P.monthlyForTerm(pkg.id, 36) > pkg.monthly, 'shorter term → higher monthly');
  });
  assert.equal(P.termLabel(6), '6 months');
  assert.equal(P.termLabel(36), '3 years');
  assert.equal(P.termLabel(72), '6 years');
});

test('Buy Now term is saved on the application (6 months, 3 years); Full Payment has no term', () => {
  const P = environment().c.HELLO_SOLAR_PACKAGES;
  const six = buyNow('Installment', 6, P.monthlyForTerm('hs6-pro', 6));
  const three = buyNow('Installment', 36, P.monthlyForTerm('hs6-pro', 36));
  const full = buyNow('Full Payment', null, null);
  const { c } = environment([[CUSTOMER_KEY, JSON.stringify([six, three, full])]]);
  const db = c.HELLO_SOLAR_DB;
  db.getInquiries();
  const appOf = inq => db.data.applications.find(a => a.inquiryId === inq.id);
  assert.equal(appOf(six).termMonths, 6);
  assert.equal(appOf(six).monthly, P.monthlyForTerm('hs6-pro', 6));
  assert.equal(appOf(three).termMonths, 36);
  assert.equal(appOf(three).monthly, P.monthlyForTerm('hs6-pro', 36));
  assert.equal(appOf(three).downPaymentAmount, 10000, 'same ₱10,000 down payment for every term');
  assert.equal(appOf(full).termMonths, null);
  assert.equal(appOf(full).monthly, 0);
});

test('an unknown term falls back to 6 years with the catalog price', () => {
  const bad = buyNow('Installment', 48, 99999);
  const { c } = environment([[CUSTOMER_KEY, JSON.stringify([bad])]]);
  const db = c.HELLO_SOLAR_DB;
  db.getInquiries();
  const app = db.data.applications.find(a => a.inquiryId === bad.id);
  assert.equal(app.termMonths, 72);
});

test('Super Admin can pick the term when creating an installment customer; the schedule follows it', () => {
  const { c, S } = environment();
  const db = c.HELLO_SOLAR_DB;
  const ids = db.generateProjectIds();
  const res = db.createAccount({
    role: 'Customer', firstName: 'Tess', lastName: 'Term', email: 'tess@x.test', phone: '0917', password: 'Pw123456!',
    status: 'Active', system: 'HS 6 LITE', projectType: 'Residential Solar', paymentType: 'Installment', termMonths: 36, ...ids
  });
  assert.equal(res.success, true, res.error);
  const app = S.getApplication(ids.appId);
  assert.equal(app.termMonths, 36);
  assert.equal(app.monthly, c.HELLO_SOLAR_PACKAGES.monthlyForTerm('hs6-lite', 36));
  completeDocuments(S, ids.appId);
  assert.equal(db.acceptHelloSolarFunding(ids.appId).success, true);
  const sched = db.getPaymentSchedule(ids.appId);
  assert.equal(sched.installments.length, 36, '36 monthly installments');
  assert.ok(sched.installments.every(i => Number(i.amount) === app.monthly));

  // No term given → 6 years (old behaviour)
  const ids2 = db.generateProjectIds();
  db.createAccount({
    role: 'Customer', firstName: 'Old', lastName: 'Way', email: 'old@x.test', phone: '0917', password: 'Pw123456!',
    status: 'Active', system: 'HS 6 LITE', projectType: 'Residential Solar', paymentType: 'Installment', ...ids2
  });
  assert.equal(S.getApplication(ids2.appId).termMonths, 72);
  assert.equal(S.getApplication(ids2.appId).monthly, 7284);
});

// ---- Real date: every portal uses today's date; sample schedules move with the calendar ----
test('sample schedules move with the calendar so a new day keeps the same due / overdue picture', () => {
  const env = environment(null, { today: '2026-10-28' });
  const { c, S } = env, db = c.HELLO_SOLAR_DB;
  assert.equal(db.data.demoClock.alignedTo, '2026-10-28');
  const sched = S.paymentScheduleFor('APP-4091');
  const unpaid = sched.installments.find(i => i.status !== 'Paid');
  assert.ok(unpaid.dueDate > '2026-10-28', 'next bill is still ahead of today');
  assert.notEqual(db.calculatePaymentStatus(S.getApplication('APP-4091')).status, 'Overdue');
  // one due day per month
  const days = sched.installments.slice(0, 8).map(i => i.dueDate.slice(8));
  assert.equal(new Set(days).size, 1);
  // Opening the system a month later moves the sample dates again
  const later = environment([...env.store.entries()], { today: '2026-11-28' });
  const moved = later.S.paymentScheduleFor('APP-4091').installments.find(i => i.status !== 'Paid');
  assert.ok(moved.dueDate > '2026-11-28');
});

test('a new installment pays its first bill one month after financing is approved', () => {
  const { c, S } = environment(null, { today: '2026-10-28' });
  const db = c.HELLO_SOLAR_DB;
  const ids = db.generateProjectIds();
  db.createAccount({ role: 'Customer', firstName: 'Real', lastName: 'Date', email: 'real@x.test', phone: '0917', password: 'Pw123456!',
    status: 'Active', system: 'HS 6 LITE', projectType: 'Residential Solar', paymentType: 'Installment', termMonths: 36, ...ids });
  // Opened before approval (preview), then funded: the schedule follows the approval date
  db.getPaymentSchedule(ids.appId);
  completeDocuments(S, ids.appId);
  assert.equal(db.acceptHelloSolarFunding(ids.appId).success, true);
  const sched = db.getPaymentSchedule(ids.appId);
  assert.equal(sched.installments[0].dueDate.slice(0, 7), '2026-11');
  assert.equal(sched.installments[1].dueDate.slice(0, 7), '2026-12');
  assert.notEqual(db.calculatePaymentStatus(S.getApplication(ids.appId)).status, 'Overdue');
});

// ---- Sample data follows the documents rule ----
test('sample applications past approval have their documents on file; the ones in review do not', () => {
  const { S } = environment(null, { sampleDocs: true });
  ['APP-1024', 'APP-1050', 'APP-1094', 'APP-1048', 'APP-4091'].forEach(id => assert.equal(S.applicationDocsComplete(id).ok, true, id));
  assert.equal(S.applicationDocsComplete('APP-1103').ok, false, 'Financing Review keeps missing documents');
  const p = S.documentProgress('APP-1024');
  assert.equal(p.items[0].isAgreement, true);
  assert.equal(p.accepted, p.total);
  // Runs once: a later change by Super Admin is kept
  S.setDocumentStatus('APP-1024', 'valid_id_1', 'REUPLOAD_REQUIRED', 'Blurry');
  S.seedSampleDocuments();
  assert.equal(S.documentRecordFor('APP-1024').documents.find(d => d.id === 'valid_id_1').status, 'REUPLOAD_REQUIRED');
});
