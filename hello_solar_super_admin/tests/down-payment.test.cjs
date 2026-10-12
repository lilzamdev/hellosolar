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
  vm.runInContext(fs.readFileSync(path.join(root, 'js/data.js'), 'utf8'), context);
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
    db.getInquiries();
    const res = db.createAccount({ role: 'Customer', firstName: 'Ana', lastName: 'Cruz', email: inq.email, phone: inq.phone, password: 'secret123', status: 'Active',
      inquiryId: inq.id, system: 'HS 6 LITE', projectType: 'Residential', paymentType: payment, location: 'Cebu City' });
    assert.equal(res.success, true, res.error);
    const app = db.data.applications[0];
    assert.equal(db.downPaymentState(app), 'Pending Verification');
    assert.equal(app.downPaymentProof.fileName, 'receipt.jpg');
    assert.equal(app.inquirySnapshot.paymentProof.dataUrl, undefined, 'receipt image stored once');
    const v = db.verifyDownPayment(app.id, { adminUser: 'ADMIN (Test)' });
    assert.equal(v.success, true);
    assert.equal(db.downPaymentState(app), 'Verified');
    assert.equal(db.verifyDownPayment(app.id).success, false, 'cannot verify twice');
  });
}

test('existing applications without a down payment record count as verified', () => {
  const db = environment();
  const legacy = db.data.applications.find(a => !a.downPaymentStatus);
  assert.ok(legacy);
  assert.equal(db.downPaymentState(legacy), 'Verified');
});
