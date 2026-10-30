// Shared test environment: Super Admin seed + shared data layer in an isolated VM with in-memory storage.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');

function environment(preset, options = {}) {
  const store = new Map(preset || []);
  const redirects = [];
  const context = {
    console, crypto,
    location: { protocol: 'http:', replace: url => redirects.push(url) },
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k)
    },
    addEventListener() {},
    // Tests run on the date the sample data was written for (Sep 25, 2026)
    HS_TODAY: options.today || '2026-09-25',
    // Most tests check the documents rule on the plain sample data (no sample files on record)
    HS_SKIP_SAMPLE_DOCS: options.sampleDocs ? false : true
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared/hello-solar-business.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared/hello-solar-store.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared/hello-solar-shared.js'), 'utf8'), context);
  return { c: context, S: context.HSShared, store, redirects };
}
// Marks an application's documents complete (signed agreement Accepted + every required document Accepted),
// which financing approval and installer assignment require.
function completeDocuments(S, appId) {
  const now = new Date().toISOString();
  S.update(data => {
    const app = (data.applications || []).find(a => a.id === appId);
    if (app) app.agreement = { status: 'ACCEPTED', fileName: 'signed.pdf', uploadedAt: now, reviewedAt: now, note: '' };
    return {};
  });
  const rec = S.documentRecordFor(appId);
  ((rec && rec.documents) || []).forEach(d => { if (!d.optional) S.setDocumentStatus(appId, d.id, 'ACCEPTED'); });
}
module.exports = { environment, completeDocuments, ROOT };
