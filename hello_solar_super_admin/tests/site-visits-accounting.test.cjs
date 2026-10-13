const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CUSTOMER_KEY = 'HELLO_SOLAR_CUSTOMER_INQUIRIES';

function environment(queue = []) {
  const local = new Map([[CUSTOMER_KEY, JSON.stringify(queue)]]);
  const context = { console, crypto: require('node:crypto').webcrypto, localStorage: { getItem: k => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)), removeItem: k => local.delete(k) } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, '../shared/hello-solar-store.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, '../shared/hello-solar-shared.js'), 'utf8'), context);
  return { db: context.HELLO_SOLAR_DB, shared: context.HSShared, local };
}

// Same record the landing page "Request Assessment" flow queues after the ₱1,000 receipt upload
function siteAssessment(extra = {}) {
  return {
    id: 'INQ-SA' + Math.floor(Math.random() * 1e9), inquiryType: 'Customer', requestType: 'Site Assessment', source: 'Landing Page — Site Assessment',
    name: 'Maria Santos', firstName: 'Maria', lastName: 'Santos', email: 'maria@x.test', phone: '09171234567',
    location: '12 Rizal St., Brgy. Poblacion, Makati City, Metro Manila', preferredVisitDate: '2026-10-20', packageId: 'hs6-lite', package: 'HS 6 LITE',
    paymentProof: { purpose: 'Site Visit Fee', amount: 1000, fileName: 'sv.jpg', dataUrl: 'data:image/jpeg;base64,AA', status: 'Pending Verification' },
    status: 'Unread', inquiryStatus: 'Not Sent', customerResponse: 'Awaiting Response', timestamp: new Date().toISOString(), ...extra
  };
}

test('site assessment requests become site visits once', () => {
  const inq = siteAssessment();
  const { db } = environment([inq]);
  const visits = db.getSiteVisits();
  const v = visits.find(x => x.inquiryId === inq.id);
  assert.ok(v);
  assert.equal(v.status, 'Pending Assignment');
  assert.equal(v.feePaymentStatus, 'Pending Verification');
  assert.equal(v.preferredDate, '2026-10-20');
  db.getSiteVisits();
  assert.equal(db.getSiteVisits().filter(x => x.inquiryId === inq.id).length, 1);
});

test('assign to installer, engineer or another person (with uploaded document)', () => {
  const { db, shared } = environment([siteAssessment()]);
  const v = db.getSiteVisits()[0];
  assert.equal(db.assignSiteVisit(v.id, { type: 'other', name: 'Juan Tech' }).success, false, 'document required for other');
  const res = db.assignSiteVisit(v.id, { type: 'installer', refId: 'INS-006', scheduledDate: '2026-10-21', scheduledTime: '09:00' });
  assert.equal(res.success, true);
  assert.equal(v.status, 'Scheduled');
  // Installer portal sees it and completes it
  const mine = shared.siteVisitsFor('installer', 'INS-006');
  assert.equal(mine.length, 1);
  assert.equal(shared.completeSiteVisit(v.id, { id: 'INS-002', name: 'Other' }).ok, false, 'only the assignee can complete');
  assert.equal(shared.completeSiteVisit(v.id, { id: 'INS-006', name: 'SolarTech Installer', role: 'Installer' }, 'Roof OK').ok, true);
  db.data = db.load();
  assert.equal(db.getSiteVisits().find(x => x.id === v.id).status, 'Completed');
  const other = db.assignSiteVisit(db.getSiteVisits()[0].id, { type: 'other', name: 'Juan Tech', document: { fileName: 'id.jpg' } });
  assert.equal(other.success, false, 'completed visits cannot be reassigned');
});

test('refund only when the client proceeds; non-refundable when not', () => {
  const { db } = environment([siteAssessment(), siteAssessment({ email: 'b@x.test', phone: '09990000000' })]);
  const [v1, v2] = db.getSiteVisits();
  assert.match(db.refundClientPayment('sv', v1.id).error, /Verify/);
  db.verifySiteVisitFee(v1.id); db.verifySiteVisitFee(v2.id);
  db.setClientDecision('sv', v1.id, 'Not Proceeding');
  assert.match(db.refundClientPayment('sv', v1.id).error, /Non-refundable/);
  db.setClientDecision('sv', v2.id, 'Proceeding');
  const ok = db.refundClientPayment('sv', v2.id, { reference: 'BDO-123' });
  assert.equal(ok.success, true);
  assert.equal(db.getClientPayments().find(r => r.id === v2.id).refundStatus, 'Refunded');
  assert.equal(db.refundClientPayment('sv', v2.id).success, false, 'no double refund');
});

test('customer reimbursement request is handled by accounting', () => {
  const { db, shared } = environment();
  const app = db.data.applications.find(a => a.customerId);
  const bad = shared.requestReimbursement(app.customerId, app.id, { type: 'Down Payment', amount: 10000, reason: 'short' });
  assert.equal(bad.ok, false);
  const r = shared.requestReimbursement(app.customerId, app.id, { type: 'Down Payment', amount: 10000, reason: 'Installation rescheduled; requesting my down payment back.' });
  assert.equal(r.ok, true);
  db.data = db.load();
  const req = db.getReimbursements()[0];
  assert.equal(req.status, 'Pending');
  assert.equal(db.resolveReimbursement(req.id, 'Declined', {}).success, false, 'decline needs a reason');
  assert.equal(db.resolveReimbursement(req.id, 'Approved', { reference: 'TRX-1' }).success, true);
  assert.equal(db.data.applications.find(a => a.id === app.id).refund.status, 'Refunded');
  assert.equal(shared.reimbursementsFor(app.customerId).length, 1);
});
