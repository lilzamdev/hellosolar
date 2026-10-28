const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const CUSTOMER_KEY = 'HELLO_SOLAR_CUSTOMER_INQUIRIES';

function environment(queue = []) {
  const local = new Map([[CUSTOMER_KEY, JSON.stringify(queue)]]);
  const context = {
    HS_TODAY: '2026-09-25', /* tests run on the sample data date */ console, crypto: require('node:crypto').webcrypto, localStorage: { getItem: k => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)), removeItem: k => local.delete(k) } };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, '../shared/hello-solar-store.js'), 'utf8'), context);
  return context.HELLO_SOLAR_DB;
}

// Same shape the landing page "Buy Now" flow queues after the receipt upload
function buyNowInquiry(payment) {
  return {
    id: 'INQ-LP' + Math.floor(Math.random() * 1e9), inquiryType: 'Customer', requestType: 'Buy Now', source: 'Landing Page — Buy Now',
    name: 'Ana Cruz', firstName: 'Ana', lastName: 'Cruz', email: `ana${Math.random()}@x.test`, phone: '09171234567', location: 'Cebu City, Cebu',
    packageId: 'hs6-lite', package: 'HS 6 LITE', selectedSolarModel: 'HS 6 LITE', paymentPreference: payment, paymentType: payment,
    packagePrice: 270000, monthlyPayment: 7650, termMonths: 60, downPayment: 10000,
    paymentProof: { purpose: 'Down Payment', amount: 10000, fileName: 'receipt.jpg', dataUrl: 'data:image/jpeg;base64,AAAA', status: 'Pending Verification' },
    status: 'Unread', inquiryStatus: 'Proceed', customerResponse: 'Proceed', timestamp: new Date().toISOString()
  };
}

for (const payment of ['Installment', 'Full Payment']) {
  test(`${payment}: Buy Now down payment arrives pending and can be verified once`, () => {
    const inq = buyNowInquiry(payment);
    const db = environment([inq]);
    // The receipt upload creates the account automatically (no manual Create Account step)
    const synced = db.getInquiries().find(i => i.id === inq.id);
    assert.ok(synced.customerId, synced.autoAccountError);
    const customer = db.data.customers.find(c => c.id === synced.customerId);
    assert.equal(customer.email, inq.email);
    assert.equal(customer.activationEmail.status, 'Queued', 'activation link emailed');
    assert.ok(customer.activationEmail.body.includes(customer.activationLink));
    const app = db.data.applications.find(a => a.customerId === customer.id);
    assert.equal(app.paymentType, payment);
    assert.equal(db.downPaymentState(app), 'Pending Verification');
    assert.equal(app.downPaymentProof.fileName, 'receipt.jpg');
    assert.equal(app.inquirySnapshot.paymentProof.dataUrl, undefined, 'receipt image stored once');
    const v = db.verifyDownPayment(app.id, { adminUser: 'ADMIN (Test)' });
    assert.equal(v.success, true);
    assert.equal(db.downPaymentState(app), 'Verified');
    assert.equal(db.getInquiries().find(i => i.id === inq.id).paymentProof.status, 'Verified', 'inquiry receipt follows the application');
    assert.equal(db.verifyDownPayment(app.id).success, false, 'cannot verify twice');
  });
}

test('Buy Now receipt for an email that already has an account creates no second account', () => {
  const first = buyNowInquiry('Installment');
  const second = { ...buyNowInquiry('Installment'), email: first.email };
  const db = environment([second, first]);
  const inquiries = db.getInquiries();
  const customers = db.data.customers.filter(c => c.email === first.email);
  assert.equal(customers.length, 1);
  const dup = inquiries.find(i => i.id === second.id);
  assert.equal(dup.customerId, undefined);
  assert.match(dup.autoAccountError, /already exists/);
});

test('Contact Us inquiries without a down payment receipt keep the manual flow', () => {
  const inq = buyNowInquiry('Installment');
  delete inq.paymentProof;
  inq.requestType = 'Contact Us';
  const db = environment([inq]);
  const synced = db.getInquiries().find(i => i.id === inq.id);
  assert.equal(synced.customerId, undefined);
});

test('Buy Now receipt without an email creates no account', () => {
  const inq = { ...buyNowInquiry('Installment'), email: '' };
  const db = environment([inq]);
  const synced = db.getInquiries().find(i => i.id === inq.id);
  assert.equal(synced.customerId, undefined);
  assert.match(synced.autoAccountError, /No email/);
});

test('existing applications without a down payment record count as verified', () => {
  const db = environment();
  const legacy = db.data.applications.find(a => !a.downPaymentStatus);
  assert.ok(legacy);
  assert.equal(db.downPaymentState(legacy), 'Verified');
});
