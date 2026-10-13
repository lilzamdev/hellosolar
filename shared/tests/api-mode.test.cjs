// api mode: admin writes are sent with named fields, and a rejected save raises "hs:api-error".
// Runs shared/hello-solar-config.js + shared/hello-solar-store.js against a fake backend (no network).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');

function apiEnvironment(respond) {
  const storage = new Map([['hello_solar_api_token_admin', 'test-token']]);
  const sent = [];
  const events = [];
  const listeners = {};
  const context = {
    console,
    HS_CONFIG: { mode: 'api', apiBase: 'https://api.test' },
    location: { pathname: '/hello_solar_super_admin/index.html', protocol: 'https:', replace() {} },
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: k => storage.delete(k)
    },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    // GET /bootstrap (sync XHR) → an empty, signed-in admin workspace
    XMLHttpRequest: class {
      open(method, url) { this.method = method; this.url = url; }
      setRequestHeader() {}
      send() { this.status = 200; this.responseText = JSON.stringify({ account: { id: 'ADM-1', role: 'super-admin' }, data: {} }); }
    },
    fetch: (url, init) => {
      const body = init && init.body ? JSON.parse(init.body) : null;
      sent.push({ url, method: init.method, body });
      const res = respond(url, body);
      return Promise.resolve({ status: res.status, text: () => Promise.resolve(JSON.stringify(res.data || {})) });
    },
    AbortController,
    setTimeout, clearTimeout,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; this.defaultPrevented = false; } preventDefault() { this.defaultPrevented = true; } },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    dispatchEvent(ev) { events.push(ev); (listeners[ev.type] || []).forEach(fn => fn(ev)); return true; },
    document: null // no DOM: the save-error message is skipped, the event still fires
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared/hello-solar-config.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'shared/hello-solar-store.js'), 'utf8'), context);
  return { c: context, sent, events };
}

const flush = () => new Promise(r => setImmediate(r));

test('every admin command has readable parameter names', () => {
  const { c } = apiEnvironment(() => ({ status: 200 }));
  const params = c.HelloSolarStore.ADMIN_COMMAND_PARAMS;
  c.HelloSolarStore.ADMIN_COMMANDS.forEach(name => {
    assert.ok(Array.isArray(params[name]), `${name}: no parameter list`);
    params[name].forEach(p => assert.match(p, /^[A-Za-z_$][\w$]*$/, `${name}: odd parameter "${p}"`));
  });
  assert.deepEqual([...params.assignFinancer], ['appId', 'financerId', 'options']);
  assert.deepEqual([...params.scheduleReadyProject], ['jobId', 'scheduleDate', 'scheduleTime', 'teamLead', 'notes']);
  assert.deepEqual([...params.updateSupportTicket], ['ticketId', 'newStatus', 'priority', 'note', 'assignedTo', 'adminUser']);
});

test('admin command is sent to /admin/commands/<name> with named params', async () => {
  const { c, sent } = apiEnvironment(() => ({ status: 200, data: {} }));
  const res = c.HELLO_SOLAR_DB.updateSettings({ overdueDays: 7 });
  assert.equal(res.success, true);
  await flush();
  const call = sent.find(s => s.url.endsWith('/admin/commands/updateSettings'));
  assert.ok(call, 'command not sent');
  assert.equal(call.method, 'POST');
  assert.equal(call.body.command, 'admin.updateSettings');
  assert.deepEqual(call.body.params, { settings: { overdueDays: 7 } });
  assert.deepEqual(call.body.args, [{ overdueDays: 7 }]);
});

test('a rejected save raises hs:api-error with the server message', async () => {
  const { c, events } = apiEnvironment(() => ({ status: 422, data: { error: 'Settings are locked.' } }));
  c.HELLO_SOLAR_DB.updateSettings({ overdueDays: 9 });
  await flush(); await flush();
  const ev = events.find(e => e.type === 'hs:api-error');
  assert.ok(ev, 'no hs:api-error event');
  assert.equal(ev.detail.command, 'admin.updateSettings');
  assert.equal(ev.detail.status, 422);
  assert.equal(ev.detail.error, 'Settings are locked.');
});
