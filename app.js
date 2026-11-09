'use strict';
/* Rounds v1: a job app for NZ gardeners.
   Local-only: everything is stored in this browser's localStorage. No backend. */

const KEY = 'gardener-app.v1';
const TZ = 'Pacific/Auckland';

// ---------------------------------------------------------------- utils
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl2br = s => esc(s).replace(/\n/g, '<br>');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pl = n => (n === 1 ? '' : 's');

const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const nowTime = () => new Intl.DateTimeFormat('en-NZ', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date());
const toD = iso => new Date(iso + 'T00:00:00Z');
const toISO = d => d.toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = toD(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); };
function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const dim = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, dim));
  return toISO(t);
}
const dow = iso => toD(iso).getUTCDay();
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const fmtDay = iso => `${DAYS[dow(iso)]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fmtLong = iso => `${DAYS_LONG[dow(iso)]} ${+iso.slice(8, 10)} ${MONTHS_LONG[+iso.slice(5, 7) - 1]}`;
const daysBetween = (a, b) => Math.round((toD(b) - toD(a)) / 864e5);
const weekStart = iso => addDays(iso, -((dow(iso) + 6) % 7));
function relDay(iso) {
  const n = daysBetween(todayISO(), iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return fmtDay(iso);
}

// money is stored in integer cents
const money = c => (c < 0 ? '-' : '') + '$' + (Math.abs(c) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const parseMoney = s => { const n = parseFloat(String(s).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : Math.round(n * 100); };
const centsInput = c => (c ? (c / 100).toFixed(2).replace(/\.00$/, '') : '');

const telHref = p => 'tel:' + String(p).replace(/[^\d+]/g, '');
const smsHref = (p, body) => `sms:${String(p).replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`;
const mailHref = (to, subject, body) => `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

// ---------------------------------------------------------------- constants
const FREQS = [['w1', 'Weekly'], ['w2', 'Fortnightly'], ['w3', 'Every 3 weeks'], ['w4', 'Every 4 weeks'], ['m1', 'Monthly'], ['m2', 'Every 2 months'], ['m3', 'Every 3 months'], ['once', 'One-off']];
const WINTER = [['', 'Same all year'], ['w2', 'Fortnightly'], ['w3', 'Every 3 weeks'], ['w4', 'Every 4 weeks'], ['w6', 'Every 6 weeks'], ['w8', 'Every 8 weeks'], ['off', 'No visits in winter']];
const TERMS = [['receipt', 'Due on receipt'], ['d7', '7 days'], ['d14', '14 days'], ['d20', '20 days'], ['20th', '20th of the next month']];
const SERVICES = {
  'Lawn mow': 'Mow lawns\nEdge paths and gardens\nBlow paths and driveway',
  'Lawns & gardens': 'Mow lawns\nEdges\nWeed garden beds\nBlow paths',
  'Hedge trim': 'Trim hedges\nClear and remove clippings',
  'Garden tidy': 'Weed garden beds\nDeadhead and tidy\nRemove green waste',
  'Weeding': 'Weed garden beds\nSpray paths',
  'Pruning': 'Prune shrubs and trees\nRemove cuttings',
  'Mulching': 'Spread mulch on beds',
  'Green waste removal': 'Load and dump green waste',
};
const NOTE_CHIPS = ['Gate code: ', 'Dog on site, shut the gate', 'Side gate access', 'Park on the street', 'Take green waste away', 'Clippings in client bin', 'Do not touch: '];
const EXTRAS = ['Green waste dump fee', 'Mulch', 'Plants', 'Fertiliser', 'Travel'];

// ---------------------------------------------------------------- state
function defaults() {
  return {
    version: 1,
    settings: {
      business: '', owner: '', phone: '', email: '', address: '',
      gstRegistered: true, gstNumber: '', pricesInclGst: false,
      bank: '', terms: '20th', invPrefix: 'INV-', nextInv: 1, quotePrefix: 'Q-', nextQuote: 1,
      workDays: [1, 2, 3, 4, 5], winterMonths: [5, 6, 7, 8], lastBackup: null,
      templates: {
        visit: "Hi {first}, just a heads-up that I'll be round on {day} for your {service}. Cheers, {owner}",
        rain: "Hi {first}, rain's stopped play today, so I'll be round on {day} instead. Sorry for the change. Cheers, {owner}",
        invoice: "Hi {first},\n\nHere's invoice {number} for {amount}, due {due}.\n\n{lines}\n\nPlease pay by bank transfer to {bank} with reference {number}.\n\nThanks,\n{owner}\n{business}",
        quote: "Hi {first},\n\nHere's quote {number} for {amount}.\n\n{lines}\n\nValid until {due}. Just reply to go ahead.\n\nThanks,\n{owner}\n{business}",
        overdue: 'Hi {first}, a friendly reminder that invoice {number} for {amount} was due on {due}. Bank account {bank}, reference {number}. Thanks, {owner}',
      },
    },
    clients: [], properties: [], jobs: [], visits: [], docs: [],
  };
}
function migrate(s) {
  const b = defaults();
  s.settings = { ...b.settings, ...s.settings, templates: { ...b.settings.templates, ...(s.settings || {}).templates } };
  for (const k of ['clients', 'properties', 'jobs', 'visits', 'docs']) s[k] = s[k] || [];
  return s;
}
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.version) return migrate(s); } catch (e) { /* fall through */ }
  return defaults();
}
let S = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { alert('Could not save. Storage may be full. Download a backup from Settings.'); }
}

const byId = (arr, id) => arr.find(x => x.id === id);
const C = id => byId(S.clients, id);
const P = id => byId(S.properties, id);
const J = id => byId(S.jobs, id);
const V = id => byId(S.visits, id);
const D = id => byId(S.docs, id);
const props = cid => S.properties.filter(p => p.clientId === cid);
const jobsOf = pid => S.jobs.filter(j => j.propertyId === pid);
function ctx(v) { const job = v && J(v.jobId); const prop = job && P(job.propertyId); const client = prop && C(prop.clientId); return { v, job, prop, client }; }
const propShort = p => (p ? [p.street, p.suburb].filter(Boolean).join(', ') : '');
const propFull = p => (p ? [p.street, p.suburb, [p.city, p.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '');
const mapsHref = p => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(propFull(p) + ', New Zealand')}`;
const greet = c => (c && (c.greet || c.name.split(/[\s&]+/)[0])) || 'there';
const visitPrice = x => x.v.price ?? x.job.price;
const freqLabel = j => {
  const base = (FREQS.find(f => f[0] === j.freq) || [, j.freq])[1];
  const w = WINTER.find(f => f[0] === j.winterFreq && f[0]);
  return w ? `${base} (winter: ${w[1].toLowerCase()})` : base;
};

// ---------------------------------------------------------------- GST
function gstMode() { const s = S.settings; return !s.gstRegistered ? 'none' : s.pricesInclGst ? 'incl' : 'excl'; }
const gstWord = (m = gstMode()) => (m === 'excl' ? 'excl. GST' : m === 'incl' ? 'incl. GST' : 'no GST');
function priceLabel(c) { const m = gstMode(); return money(c) + (m === 'excl' ? ' + GST' : m === 'incl' ? ' incl GST' : ''); }
const lineAmt = l => Math.round((+l.qty || 0) * (l.unit || 0));
function totals(doc) {
  const sum = doc.lines.reduce((a, l) => a + lineAmt(l), 0);
  if (doc.gstMode === 'incl') { const gst = Math.round(sum * 3 / 23); return { sub: sum - gst, gst, total: sum }; }
  if (doc.gstMode === 'excl') { const gst = Math.round(sum * 0.15); return { sub: sum, gst, total: sum + gst }; }
  return { sub: sum, gst: 0, total: sum };
}
const docTitle = d => (d.kind === 'quote' ? 'Quote' : d.gstMode === 'none' ? 'Invoice' : 'Tax invoice');

// ---------------------------------------------------------------- schedule engine
// Jobs hold the rule; visits are generated ahead (about 9 weeks) and can then be moved, done or skipped.
const isWinter = iso => S.settings.winterMonths.includes(+iso.slice(5, 7));
function freqInfo(f) { if (f === 'once') return { once: true }; const n = +f.slice(1); return f[0] === 'm' ? { months: n } : { weeks: n }; }
function occurrences(job, from, to) {
  const out = [];
  const end = job.endDate && job.endDate < to ? job.endDate : to;
  const f = freqInfo(job.freq);
  if (f.once) { if (job.startDate >= from && job.startDate <= end) out.push(job.startDate); return out; }
  if (f.months) {
    for (let k = 0; k < 1000; k++) { const d = addMonths(job.startDate, k * f.months); if (d > end) break; if (d >= from) out.push(d); }
    return out;
  }
  let d = job.startDate;
  for (let guard = 0; d <= end && guard < 5000; guard++) {
    const winter = job.winterFreq && isWinter(d);
    if (d >= from && !(winter && job.winterFreq === 'off')) out.push(d);
    const weeks = winter && job.winterFreq !== 'off' ? freqInfo(job.winterFreq).weeks : f.weeks;
    d = addDays(d, 7 * weeks);
  }
  return out;
}
function ensureVisits(to) {
  const t = todayISO();
  const horizon = addDays(t, 63);
  to = to && to > horizon ? to : horizon;
  let changed = false;
  for (const j of S.jobs) {
    if (!j.active || (j.generatedUntil && j.generatedUntil >= to)) continue;
    let from = j.generatedUntil ? addDays(j.generatedUntil, 1) : (j.startDate > t ? j.startDate : t);
    if (j.freq === 'once') from = j.startDate;
    const existing = new Set(S.visits.filter(v => v.jobId === j.id).map(v => v.origDate));
    for (const d of occurrences(j, from, to)) {
      if (!existing.has(d)) S.visits.push({ id: uid(), jobId: j.id, date: d, origDate: d, status: 'scheduled', order: null, note: '', checks: [] });
    }
    j.generatedUntil = to;
    changed = true;
  }
  if (changed) save();
}
function regenJob(j) {
  const t = todayISO();
  S.visits = S.visits.filter(v => !(v.jobId === j.id && v.status === 'scheduled' && (j.freq === 'once' || v.origDate >= t)));
  j.generatedUntil = null;
  ensureVisits();
}
function nextWorkDay(iso) {
  let d = iso;
  for (let i = 0; i < 7; i++) { d = addDays(d, 1); if (S.settings.workDays.includes(dow(d))) return d; }
  return addDays(iso, 1);
}
const orderKey = v => v.order ?? 500;
function cmpVisit(a, b) {
  const oa = orderKey(a.v), ob = orderKey(b.v);
  if (oa !== ob) return oa - ob;
  const ta = a.job.time || '99:99', tb = b.job.time || '99:99';
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.client.name.localeCompare(b.client.name);
}
function dayVisits(date, statuses) {
  return S.visits.filter(v => v.date === date && (!statuses || statuses.includes(v.status))).map(ctx).filter(x => x.client).sort(cmpVisit);
}
function pushVisits(ids, target) {
  let max = Math.max(500, ...S.visits.filter(v => v.date === target && v.order != null).map(v => v.order));
  for (const id of ids) { const v = V(id); v.date = target; v.order = ++max; }
}
function clientVisits(cid) {
  const jobIds = new Set(S.jobs.filter(j => P(j.propertyId)?.clientId === cid).map(j => j.id));
  return S.visits.filter(v => jobIds.has(v.jobId)).map(ctx).filter(x => x.client);
}
const byVDate = (a, b) => a.v.date.localeCompare(b.v.date);

// ---------------------------------------------------------------- documents (quotes & invoices)
function dueFrom(date) {
  const t = S.settings.terms;
  if (t === 'receipt') return date;
  if (t === '20th') return addMonths(date.slice(0, 8) + '01', 1).slice(0, 8) + '20';
  return addDays(date, +t.slice(1));
}
function newDoc(kind, clientId) {
  const s = S.settings, date = todayISO(), inv = kind === 'invoice';
  const number = inv ? s.invPrefix + String(s.nextInv++).padStart(4, '0') : s.quotePrefix + String(s.nextQuote++).padStart(4, '0');
  const d = { id: uid(), kind, number, clientId: clientId || null, propertyId: null, date, due: inv ? dueFrom(date) : addDays(date, 30), lines: [], notes: '', status: 'draft', gstMode: gstMode() };
  if (clientId && props(clientId).length === 1) d.propertyId = props(clientId)[0].id;
  S.docs.push(d);
  return d;
}
function invoiceVisits(clientId, ids) {
  const d = newDoc('invoice', clientId);
  const propIds = new Set();
  for (const id of ids.map(V).sort((a, b) => a.date.localeCompare(b.date)).map(v => v.id)) {
    const x = ctx(V(id));
    propIds.add(x.prop.id);
    d.lines.push({ desc: `${x.job.title}, ${propShort(x.prop)} (${fmtDate(x.v.date)})`, qty: 1, unit: visitPrice(x) });
    x.v.docId = d.id;
  }
  d.propertyId = propIds.size === 1 ? [...propIds][0] : null;
  save();
  return d;
}
const isOverdue = d => d.kind === 'invoice' && d.status === 'sent' && d.due < todayISO();
function docStatusLine(d) {
  if (d.kind === 'quote') return { draft: 'Draft, not sent', sent: 'Sent ' + fmtDate(d.sentDate || d.date), accepted: 'Accepted', declined: 'Declined' }[d.status];
  if (d.status === 'paid') return 'Paid ' + fmtDate(d.paidDate);
  if (d.status === 'draft') return 'Draft, not sent yet';
  const n = daysBetween(todayISO(), d.due);
  let s = n < 0 ? `${-n} day${pl(-n)} overdue` : n === 0 ? 'Due today' : `Due ${fmtDate(d.due)}`;
  if (d.lastReminder) s += ` · reminded ${fmtDate(d.lastReminder)}`;
  return s;
}
function docText(d) {
  const s = S.settings, c = C(d.clientId), t = totals(d);
  const out = [`${docTitle(d).toUpperCase()} ${d.number} · ${fmtDate(d.date)}`];
  out.push(s.business + (d.gstMode !== 'none' && s.gstNumber ? ` · GST no. ${s.gstNumber}` : ''));
  if (c) out.push(`To: ${c.name}`);
  out.push('');
  for (const l of d.lines) out.push(`- ${l.desc}${+l.qty !== 1 ? ` (${l.qty} × ${money(l.unit)})` : ''}: ${money(lineAmt(l))}`);
  out.push('');
  if (d.gstMode === 'excl') out.push(`Subtotal: ${money(t.sub)}`, `GST 15%: ${money(t.gst)}`, `Total: ${money(t.total)}`);
  else if (d.gstMode === 'incl') out.push(`Total incl. GST: ${money(t.total)}`, `(includes GST of ${money(t.gst)})`);
  else out.push(`Total: ${money(t.total)}`);
  return out.join('\n');
}
function msg(key, { client, job, date, doc } = {}) {
  const s = S.settings, t = doc ? totals(doc) : null;
  const vars = {
    first: greet(client), name: client?.name || '', day: date ? fmtLong(date) : '',
    service: (job?.title || 'visit').toLowerCase(), owner: s.owner || s.business || '', business: s.business || '',
    bank: s.bank || '(bank account)', number: doc?.number || '', amount: t ? money(t.total) : '',
    due: doc ? fmtDate(doc.due) : '', lines: doc ? docText(doc) : '',
  };
  return s.templates[key].replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// ---------------------------------------------------------------- navigation
function go(path, replace) {
  const n = (history.state?.n || 0) + (replace ? 0 : 1);
  history[replace ? 'replaceState' : 'pushState']({ n }, '', '#/' + path);
  render();
}
function back(parent) {
  if ((history.state?.n || 0) > 0) history.back();
  else go(parent || 'today', true);
}
window.addEventListener('popstate', () => { closeSheet(); render(); });

let lastPath = null;
const ROUTES = [
  [/^today$/, () => vToday()],
  [/^visit\/(\w+)$/, id => vVisit(id)],
  [/^reminders(?:\/([\d-]+))?$/, d => vReminders(d)],
  [/^schedule(?:\/([\d-]+))?$/, d => vSchedule(d)],
  [/^clients$/, () => vClients()],
  [/^client\/new$/, () => vClientForm()],
  [/^client\/(\w+)\/edit$/, id => vClientForm(id)],
  [/^client\/(\w+)$/, id => vClient(id)],
  [/^property\/new\/(\w+)$/, cid => vPropertyForm(null, cid)],
  [/^property\/(\w+)\/edit$/, pid => vPropertyForm(pid)],
  [/^job\/new\/(\w+)$/, (pid, q) => vJobForm(null, pid, q)],
  [/^job\/(\w+)\/edit$/, jid => vJobForm(jid)],
  [/^money(?:\/(\w+))?$/, t => vMoney(t)],
  [/^doc\/new\/(invoice|quote)(?:\/(\w+))?$/, (kind, cid) => newDocRoute(kind, cid)],
  [/^doc\/(\w+)$/, id => vDoc(id)],
  [/^settings$/, () => vSettings()],
];
const TAB_OF = { today: 'today', visit: 'today', reminders: 'today', schedule: 'schedule', clients: 'clients', client: 'clients', property: 'clients', job: 'clients', money: 'money', doc: 'money', settings: 'settings' };

function render() {
  const raw = location.hash.replace(/^#\/?/, '') || 'today';
  const [path, qs] = raw.split('?');
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  let out = null;
  for (const [re, fn] of ROUTES) { const m = path.match(re); if (m) { out = fn(...m.slice(1), q); break; } }
  if (!out) out = vToday();
  $('#title').textContent = out.title;
  document.title = out.title + ' · Rounds';
  const b = $('#back'); b.hidden = !out.back; b.onclick = () => back(out.back);
  const a = $('#action'); a.hidden = !out.action;
  if (out.action) { a.textContent = out.action[0]; a.onclick = () => go(out.action[1]); }
  $('#view').innerHTML = out.html;
  const tab = TAB_OF[path.split('/')[0]] || 'today';
  document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('on', x.dataset.tab === tab));
  const curPath = location.hash;
  if (curPath !== lastPath) window.scrollTo(0, 0);
  lastPath = curPath;
}
const notFound = parent => ({ title: 'Not found', back: parent, html: `<div class="empty">This item no longer exists.</div><button class="btn" onclick="go('${parent}',true)">Go back</button>` });

function showSheet(html) { const s = $('#sheet'); s.innerHTML = `<div class="sheet-bg" onclick="closeSheet()"></div><div class="sheet-card">${html}</div>`; s.hidden = false; }
function closeSheet() { const s = $('#sheet'); s.hidden = true; s.innerHTML = ''; }
let toastTimer;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), 2600); }

function field(label, name, value, type = 'text', attrs = '') {
  return `<div><label for="f_${name}">${label}</label><input id="f_${name}" name="${name}" type="${type}" value="${esc(value ?? '')}" ${attrs}></div>`;
}
function contactRow(c, body, subject, onSent = '') {
  const mark = `this.closest('.contact-row').classList.add('sent');${onSent}`;
  return `<div class="contact-row"><div class="grow"><b>${esc(c.name)}</b><div class="sub">${esc(body.slice(0, 80))}…</div></div>
    ${c.phone ? `<a class="btn sm" href="${esc(smsHref(c.phone, body))}" onclick="${mark}">Text</a>` : ''}
    ${c.email ? `<a class="btn sm" href="${esc(mailHref(c.email, subject, body))}" onclick="${mark}">Email</a>` : ''}
    ${!c.phone && !c.email ? '<span class="sub">No contact details</span>' : ''}</div>`;
}

// ---------------------------------------------------------------- TODAY
let reorder = false;
function vToday() {
  ensureVisits();
  const t = todayISO();
  const list = dayVisits(t);
  const sched = list.filter(x => x.v.status === 'scheduled');
  const done = list.filter(x => x.v.status === 'done');
  const missed = S.visits.filter(v => v.status === 'scheduled' && v.date < t).map(ctx).filter(x => x.client).sort(byVDate);
  const tomorrow = addDays(t, 1);
  const tomN = S.visits.filter(v => v.date === tomorrow && v.status === 'scheduled').length;
  let h = '';
  if (!S.clients.length) h += welcomeCard();
  h += `<div class="hero"><div class="sub">${fmtLong(t)}</div>
    <div class="big">${list.length ? `${done.length} of ${list.filter(x => x.v.status !== 'skipped').length} done` : 'No visits today'}</div>
    ${done.length ? `<div class="sub">${money(done.reduce((a, x) => a + visitPrice(x), 0))} of work done today</div>` : ''}</div>`;
  if (sched.length) h += `<button class="btn big rain" onclick="rainSheet()">🌧 Rain day: push ${sched.length} to ${fmtDay(nextWorkDay(t))}</button>`;
  if (missed.length) {
    h += `<div class="card warn"><b>${missed.length} visit${pl(missed.length)} from earlier days not done</b>
      ${missed.slice(0, 6).map(x => `<div class="row mini"><div class="grow" onclick="go('visit/${x.v.id}')">${esc(x.client.name)} <span class="sub">· ${fmtDay(x.v.date)} · ${esc(x.job.title)}</span></div>
        <button class="btn sm" onclick="skipVisit('${x.v.id}')">Skip</button></div>`).join('')}
      ${missed.length > 6 ? `<div class="sub">…and ${missed.length - 6} more</div>` : ''}
      <button class="btn" onclick="moveMissed()">Move ${missed.length > 1 ? 'all' : 'it'} to today</button></div>`;
  }
  if (list.length) {
    h += `<div class="section-head"><h2>Today's run</h2>${sched.length > 1 ? `<button class="link" onclick="reorder=!reorder;render()">${reorder ? 'Done' : 'Change order'}</button>` : ''}</div>
      <ol class="run">${list.map((x, i) => runItem(x, i)).join('')}</ol>`;
  }
  if (tomN) h += `<button class="card tap" onclick="go('reminders')"><b>Tomorrow: ${tomN} visit${pl(tomN)}</b><div class="sub">Send "coming tomorrow" messages ›</div></button>`;
  const lb = S.settings.lastBackup;
  if (S.clients.length && (!lb || daysBetween(lb, t) > 14)) {
    h += `<button class="card tap" onclick="go('settings')"><b>Back up your data</b><div class="sub">${lb ? 'Last backup ' + fmtDate(lb) : 'No backup yet'}. Your data is only on this device. ›</div></button>`;
  }
  return { title: 'Today', html: h };
}
function runItem(x, i) {
  const v = x.v, hasNotes = x.prop.notes || x.job.notes;
  const num = v.status === 'done' ? '✓' : v.status === 'skipped' ? '–' : i + 1;
  const side = reorder && v.status === 'scheduled'
    ? `<div class="updown"><button onclick="event.stopPropagation();moveOrder('${v.id}',-1)" aria-label="Move up">▲</button><button onclick="event.stopPropagation();moveOrder('${v.id}',1)" aria-label="Move down">▼</button></div>`
    : '<span class="chev">›</span>';
  return `<li class="visit ${v.status}" onclick="go('visit/${v.id}')"><div class="num">${num}</div>
    <div class="grow"><div class="name">${esc(x.client.name)}</div><div class="sub">${esc(propShort(x.prop))}</div>
    <div class="sub">${x.job.time ? esc(x.job.time) + ' · ' : ''}${esc(x.job.title)}${v.status === 'skipped' ? ' · skipped' : ''}</div>
    ${hasNotes && v.status === 'scheduled' ? '<span class="flag">⚠ Site notes</span>' : ''}</div>${side}</li>`;
}
function welcomeCard() {
  return `<div class="card welcome"><h3>Kia ora 👋</h3><p>Three steps to get set up:</p>
    <ol><li>Your business details, for invoices</li><li>Add a client and their property</li><li>Set up their regular job. Visits then fill your schedule automatically.</li></ol>
    <button class="btn primary" onclick="go('settings')">1. Business details</button>
    <button class="btn" onclick="go('client/new')">2. Add a client</button>
    <button class="link" onclick="loadSample()">Or try it out with sample data</button>
    <p class="sub sm">Everything is saved on this device only. On iPhone, add the app to your Home Screen <b>before</b> you start. The Home Screen app and Safari keep separate data.</p></div>`;
}
function moveOrder(id, dir) {
  const list = dayVisits(V(id).date);
  const i = list.findIndex(x => x.v.id === id), j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  list.forEach((x, k) => (x.v.order = k));
  save(); render();
}
function moveMissed() {
  const t = todayISO();
  const ids = S.visits.filter(v => v.status === 'scheduled' && v.date < t).sort((a, b) => a.date.localeCompare(b.date)).map(v => v.id);
  pushVisits(ids, t); save(); render(); toast(`${ids.length} visit${pl(ids.length)} moved to today`);
}
function rainSheet() {
  const t = todayISO(), n = dayVisits(t, ['scheduled']).length;
  showSheet(`<h3>Rain day</h3><p>Move today's ${n} unfinished visit${pl(n)} to:</p>
    <input type="date" id="raindate" value="${nextWorkDay(t)}" min="${addDays(t, 1)}">
    <p class="sub">They'll go after the visits already booked that day.</p>
    <button class="btn primary big" onclick="pushToday($('#raindate').value)">Push ${n} visit${pl(n)}</button>
    <button class="btn" onclick="closeSheet()">Cancel</button>`);
}
function pushToday(target) {
  const t = todayISO();
  if (!target || target <= t) return toast('Pick a day after today');
  const ids = dayVisits(t, ['scheduled']).map(x => x.v.id);
  pushVisits(ids, target); save(); closeSheet(); render();
  notifySheet(ids, 'rain', target, `Change of day: ${fmtLong(target)}`);
}
function notifySheet(ids, tpl, date, subject) {
  const seen = new Set(), rows = [];
  for (const id of ids) {
    const x = ctx(V(id));
    if (seen.has(x.client.id)) continue;
    seen.add(x.client.id);
    rows.push(contactRow(x.client, msg(tpl, { client: x.client, job: x.job, date }), subject));
  }
  showSheet(`<h3>Moved to ${fmtLong(date)}</h3><p class="sub">Tap Text or Email to open a ready-written message for each client.</p>${rows.join('')}
    <button class="btn big" onclick="closeSheet()">Done</button>`);
}

// ---------------------------------------------------------------- VISIT
function vVisit(id) {
  const v = V(id);
  if (!v) return notFound('today');
  const { job, prop, client } = ctx(v);
  if (!client) return notFound('today');
  const tasks = (job.tasks || '').split('\n').map(s => s.trim()).filter(Boolean);
  const notes = [prop.notes, job.notes].filter(Boolean).join('\n');
  const price = v.price ?? job.price;
  const status = { scheduled: 'Booked', done: 'Done' + (v.doneTime ? ' ' + v.doneTime : ''), skipped: 'Skipped' }[v.status];
  let h = `<div class="hero"><span class="badge ${v.status}">${status}</span>
    <div class="big">${esc(client.name)}</div><div>${esc(propFull(prop))}</div>
    <div class="sub">${relDay(v.date)}${job.time ? ' · ' + esc(job.time) : ''} · ${esc(job.title)} · ${freqLabel(job)} · ${priceLabel(price)}</div></div>
    <div class="grid3"><a class="btn" href="${esc(mapsHref(prop))}" target="_blank" rel="noopener">Maps</a>
    ${client.phone ? `<a class="btn" href="${esc(telHref(client.phone))}">Call</a><a class="btn" href="${esc(smsHref(client.phone, ''))}">Text</a>` : ''}</div>`;
  if (notes) h += `<div class="notes"><div class="label">Site notes</div>${nl2br(notes)}</div>`;
  if (tasks.length) {
    h += `<div class="label">Tasks</div>${tasks.map((t, i) => `<label class="check"><input type="checkbox" ${v.checks?.includes(i) ? 'checked' : ''} onchange="toggleCheck('${id}',${i},this.checked)"> ${esc(t)}</label>`).join('')}`;
  }
  h += `<label class="label" for="vnote">Note for this visit</label>
    <textarea id="vnote" rows="2" placeholder="e.g. Back lawn too wet, skipped the edges" oninput="setVisitNote('${id}',this.value)">${esc(v.note)}</textarea>`;
  if (v.status === 'scheduled') {
    h += `<button class="btn primary big" onclick="markDone('${id}')">✓ Mark done</button>
      <div class="card"><div class="label" style="margin-top:0">Move to another day</div>
      <div class="row"><input type="date" id="mvdate" value="${v.date}"><button class="btn sm" onclick="moveVisit('${id}',$('#mvdate').value)">Move</button></div></div>
      <button class="btn" onclick="skipVisit('${id}')">Skip this visit</button>`;
  } else if (v.status === 'done') {
    const d = v.docId && D(v.docId);
    h += d ? `<button class="btn primary big" onclick="go('doc/${d.id}')">View invoice ${esc(d.number)}</button>`
      : `<button class="btn primary big" onclick="invoiceNow('${id}')">Create invoice</button>
         <button class="btn" onclick="undoDone('${id}')">Undo: not done yet</button>`;
  } else {
    h += `<button class="btn" onclick="restoreVisit('${id}')">Un-skip this visit</button>`;
  }
  h += `<div class="links"><button class="link" onclick="go('client/${client.id}')">Client details ›</button>
    <button class="link" onclick="go('job/${job.id}/edit')">Edit this job ›</button></div>`;
  return { title: relDay(v.date), html: h, back: 'today' };
}
function toggleCheck(id, i, on) { const v = V(id); v.checks = (v.checks || []).filter(x => x !== i); if (on) v.checks.push(i); save(); }
function setVisitNote(id, val) { V(id).note = val; save(); }
function markDone(id) {
  const v = V(id), x = ctx(v);
  v.status = 'done'; v.doneTime = nowTime(); v.price = x.job.price;
  save(); render();
  const monthly = x.client.billing === 'monthly';
  const later = `<button class="btn big ${monthly ? 'primary' : ''}" onclick="closeSheet();back('today')">${monthly ? 'Back to today' : 'Invoice later'}</button>`;
  const now = `<button class="btn big ${monthly ? '' : 'primary'}" onclick="closeSheet();invoiceNow('${id}')">Create invoice now</button>`;
  showSheet(`<h3>Done ✓</h3><p>${esc(x.client.name)}: ${esc(x.job.title)}, ${priceLabel(v.price)}</p>
    ${monthly ? '<p class="sub">This client is billed monthly, so the visit has been added to "To invoice".</p>' + later + now : now + later}`);
}
function invoiceNow(id) { const x = ctx(V(id)); const d = invoiceVisits(x.client.id, [id]); go('doc/' + d.id); }
function undoDone(id) { const v = V(id); v.status = 'scheduled'; delete v.doneTime; delete v.price; save(); render(); }
function skipVisit(id) { V(id).status = 'skipped'; save(); render(); toast('Visit skipped'); }
function restoreVisit(id) { V(id).status = 'scheduled'; save(); render(); }
function moveVisit(id, date) {
  if (!date) return toast('Pick a date');
  if (date === V(id).date) return toast("That's the same day");
  pushVisits([id], date); save(); render(); toast('Moved to ' + relDay(date));
}

// ---------------------------------------------------------------- REMINDERS
function vReminders(date) {
  const d = date || addDays(todayISO(), 1);
  const list = dayVisits(d, ['scheduled']);
  let h = `<label for="rdate">Visits on</label><input type="date" id="rdate" value="${d}" onchange="go('reminders/'+this.value,true)">`;
  h += list.length ? `<p class="sub">Tap Text or Email to open a ready-written message. A tick shows who's been sent one.</p>` +
    list.map(x => `<div class="${x.v.remindedAt ? 'sent-wrap' : ''}">${contactRow(x.client, msg('visit', { client: x.client, job: x.job, date: d }), `Visit on ${fmtLong(d)}`, `markReminded('${x.v.id}')`)}</div>`).join('')
    : `<div class="empty">No visits booked on ${fmtLong(d)}.</div>`;
  return { title: 'Reminders', html: h, back: 'today' };
}
function markReminded(id) { V(id).remindedAt = todayISO(); save(); }

// ---------------------------------------------------------------- SCHEDULE
function vSchedule(param) {
  const t = todayISO(), ws = weekStart(param || t), we = addDays(ws, 6);
  ensureVisits(we);
  let h = `<div class="weeknav"><button class="btn sq" onclick="go('schedule/${addDays(ws, -7)}',true)" aria-label="Previous week">‹</button>
    <div class="grow center"><b>${fmtDate(ws)} – ${fmtDate(we)}</b>${ws !== weekStart(t) ? `<br><button class="link" onclick="go('schedule',true)">Back to this week</button>` : ''}</div>
    <button class="btn sq" onclick="go('schedule/${addDays(ws, 7)}',true)" aria-label="Next week">›</button></div>`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i);
    const list = dayVisits(d).filter(x => x.v.status !== 'skipped');
    const total = list.reduce((a, x) => a + visitPrice(x), 0);
    h += `<section class="day ${d === t ? 'today' : ''} ${d < t ? 'past' : ''}" ondragover="event.preventDefault();this.classList.add('over')" ondragleave="this.classList.remove('over')" ondrop="dropOn(event,'${d}')">
      <div class="day-head"><b>${fmtDay(d)}${d === t ? ' · today' : ''}</b><span class="sub">${list.length ? `${list.length} · ${money(total)}` : ''}</span></div>
      ${list.length ? list.map(x => `<div class="slot ${x.v.status}" draggable="${x.v.status === 'scheduled'}" ondragstart="event.dataTransfer.setData('text/plain','${x.v.id}')" onclick="go('visit/${x.v.id}')">
        <span class="time">${esc(x.job.time || '')}</span><span class="grow"><b>${esc(x.client.name)}</b> <span class="sub">${esc(x.job.title)}${x.prop.suburb ? ' · ' + esc(x.prop.suburb) : ''}</span></span>${x.v.status === 'done' ? '✓' : '<span class="chev">›</span>'}</div>`).join('')
      : `<div class="pad sub">${S.settings.workDays.includes(dow(d)) ? 'Nothing booked' : 'Day off'}</div>`}</section>`;
  }
  h += `<p class="sub sm">Tap a visit to move it to another day. On a computer you can also drag visits between days.</p>`;
  return { title: 'Schedule', html: h };
}
function dropOn(e, d) {
  e.preventDefault();
  e.currentTarget.classList.remove('over');
  const v = V(e.dataTransfer.getData('text/plain'));
  if (v && v.status === 'scheduled' && v.date !== d) { pushVisits([v.id], d); save(); render(); toast('Moved to ' + fmtDay(d)); }
}

// ---------------------------------------------------------------- CLIENTS
let clientQuery = '';
function vClients() {
  const h = `<input type="search" id="csearch" placeholder="Search name, street or suburb" value="${esc(clientQuery)}" oninput="clientQuery=this.value;$('#clist').innerHTML=clientRows()">
    <div id="clist" class="list">${clientRows()}</div>`;
  return { title: 'Clients', html: h, action: ['+ Add', 'client/new'] };
}
function clientRows() {
  const q = clientQuery.toLowerCase().trim(), t = todayISO();
  const rows = S.clients
    .filter(c => !q || (c.name + ' ' + props(c.id).map(propFull).join(' ')).toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(c => {
      const ps = props(c.id);
      const next = clientVisits(c.id).filter(x => x.v.status === 'scheduled' && x.v.date >= t).sort(byVDate)[0];
      return `<button class="item" onclick="go('client/${c.id}')"><div class="grow"><b>${esc(c.name)}</b>
        <div class="sub">${esc(ps[0] ? propShort(ps[0]) : 'No property yet')}${ps.length > 1 ? ` +${ps.length - 1} more` : ''}</div>
        <div class="sub">${next ? 'Next visit: ' + relDay(next.v.date) : 'No visits booked'}</div></div><span class="chev">›</span></button>`;
    });
  return rows.join('') || `<div class="empty">${S.clients.length ? 'No matches.' : 'No clients yet. Tap “+ Add” to add your first one.'}</div>`;
}
function vClient(id) {
  const c = C(id);
  if (!c) return notFound('clients');
  const t = todayISO(), ps = props(id), vs = clientVisits(id);
  const ready = vs.filter(x => x.v.status === 'done' && !x.v.docId);
  const upcoming = vs.filter(x => x.v.status === 'scheduled' && x.v.date >= t).sort(byVDate).slice(0, 5);
  const hist = vs.filter(x => x.v.status === 'done').sort(byVDate).reverse().slice(0, 8);
  const docs = S.docs.filter(d => d.clientId === id).sort((a, b) => b.date.localeCompare(a.date));
  let h = `<div class="hero"><div class="big">${esc(c.name)}</div>
    <div class="sub">${[c.phone, c.email].filter(Boolean).map(esc).join(' · ') || 'No contact details'}${c.billing === 'monthly' ? ' · Billed monthly' : ''}</div></div>
    <div class="grid3">${c.phone ? `<a class="btn" href="${esc(telHref(c.phone))}">Call</a><a class="btn" href="${esc(smsHref(c.phone, ''))}">Text</a>` : ''}${c.email ? `<a class="btn" href="mailto:${esc(c.email)}">Email</a>` : ''}</div>`;
  if (c.notes) h += `<div class="card">${nl2br(c.notes)}</div>`;
  if (ready.length) {
    h += `<div class="card warn"><b>${ready.length} visit${pl(ready.length)} ready to invoice</b> · ${money(ready.reduce((a, x) => a + visitPrice(x), 0))}
      <button class="btn primary" onclick="invoiceClient('${id}')">Create invoice</button></div>`;
  }
  h += `<h2>Properties</h2>`;
  for (const p of ps) {
    h += `<div class="card"><div class="row"><div class="grow"><b>${esc(propShort(p))}</b><div class="sub">${esc([p.city, p.postcode].filter(Boolean).join(' '))}</div></div>
      <button class="btn sm" onclick="go('property/${p.id}/edit')">Edit</button></div>
      ${p.notes ? `<div class="notes sm">${nl2br(p.notes)}</div>` : ''}
      ${jobsOf(p.id).map(j => {
        const nv = S.visits.filter(v => v.jobId === j.id && v.status === 'scheduled' && v.date >= t).sort((a, b) => a.date.localeCompare(b.date))[0];
        return `<button class="item" onclick="go('job/${j.id}/edit')"><div class="grow"><b>${esc(j.title)}</b><div class="sub">${freqLabel(j)} · ${priceLabel(j.price)}</div>
          <div class="sub">${j.active ? (nv ? 'Next: ' + relDay(nv.date) : 'No upcoming visits') : 'Ended'}</div></div><span class="chev">›</span></button>`;
      }).join('')}
      <button class="btn" onclick="go('job/new/${p.id}')">+ Add a job here</button></div>`;
  }
  if (!ps.length) h += `<div class="empty">No property yet.</div>`;
  h += `<button class="btn" onclick="go('property/new/${id}')">+ Add ${ps.length ? 'another' : 'a'} property</button>`;
  if (upcoming.length) h += `<h2>Coming up</h2><div class="list">${upcoming.map(visitRow).join('')}</div>`;
  if (hist.length) h += `<h2>Recent visits</h2><div class="list">${hist.map(visitRow).join('')}</div>`;
  h += `<h2>Quotes &amp; invoices</h2>${docs.length ? `<div class="list">${docs.map(docRow).join('')}</div>` : '<div class="empty">None yet.</div>'}
    <div class="grid2"><button class="btn" onclick="go('doc/new/quote/${id}')">New quote</button><button class="btn" onclick="go('doc/new/invoice/${id}')">New invoice</button></div>`;
  return { title: c.name, html: h, back: 'clients', action: ['Edit', `client/${id}/edit`] };
}
function visitRow(x) {
  return `<button class="item" onclick="go('visit/${x.v.id}')"><div class="grow"><b>${relDay(x.v.date)}</b> <span class="sub">${fmtDate(x.v.date)}</span>
    <div class="sub">${esc(x.job.title)} · ${esc(propShort(x.prop))}${x.v.status === 'done' ? (x.v.docId ? ' · invoiced' : ' · not invoiced') : ''}</div></div><span class="chev">›</span></button>`;
}
function invoiceClient(cid) {
  const ids = clientVisits(cid).filter(x => x.v.status === 'done' && !x.v.docId).map(x => x.v.id);
  if (!ids.length) return toast('Nothing to invoice');
  const d = invoiceVisits(cid, ids);
  go('doc/' + d.id);
}

function vClientForm(id) {
  const c = id ? C(id) : { name: '', greet: '', phone: '', email: '', billingAddress: '', billing: 'visit', notes: '' };
  if (!c) return notFound('clients');
  const h = `<form onsubmit="saveClient(event,'${id || ''}')">
    ${field('Name *', 'name', c.name, 'text', 'required placeholder="e.g. Aroha Ngata" autocomplete="off"')}
    ${field('Mobile', 'phone', c.phone, 'tel', 'placeholder="021 123 4567"')}
    ${field('Email', 'email', c.email, 'email', 'placeholder="name@example.co.nz"')}
    ${id ? '' : `<fieldset><legend>Property</legend><p class="sub sm">Where you do the work. You can add more later.</p>${propFields({ city: '' })}</fieldset>`}
    <label>How do you bill them?</label>
    <div class="seg"><label><input type="radio" name="billing" value="visit" ${c.billing !== 'monthly' ? 'checked' : ''}>After each visit</label>
      <label><input type="radio" name="billing" value="monthly" ${c.billing === 'monthly' ? 'checked' : ''}>Monthly</label></div>
    ${field('Name to use in messages', 'greet', c.greet, 'text', 'placeholder="Defaults to their first name"')}
    <div><label for="f_billingAddress">Billing address <span class="sub sm">(if different to the property)</span></label>
      <textarea id="f_billingAddress" name="billingAddress" rows="2">${esc(c.billingAddress)}</textarea></div>
    <div><label for="f_notes">Notes about the client</label><textarea id="f_notes" name="notes" rows="2" placeholder="e.g. Prefers texts, away in January">${esc(c.notes)}</textarea></div>
    <button class="btn primary big">${id ? 'Save changes' : 'Save client'}</button></form>
    ${id ? `<button class="btn danger" onclick="deleteClient('${id}')">Delete client and all their data</button>` : ''}`;
  return { title: id ? 'Edit client' : 'New client', html: h, back: id ? 'client/' + id : 'clients' };
}
function saveClient(e, id) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const data = { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), billing: f.billing, greet: f.greet.trim(), billingAddress: f.billingAddress.trim(), notes: f.notes.trim() };
  if (!data.name) return toast('Add a name');
  if (id) { Object.assign(C(id), data); save(); toast('Saved'); return back('client/' + id); }
  const c = { id: uid(), created: todayISO(), ...data };
  S.clients.push(c);
  if (f.p_street.trim()) {
    const p = propFromForm(f, c.id);
    S.properties.push(p); save();
    history.replaceState(history.state, '', '#/client/' + c.id);
    toast('Client saved. Now set up their regular job.');
    return go('job/new/' + p.id);
  }
  save(); toast('Client saved'); go('client/' + c.id, true);
}
function deleteClient(id) {
  const c = C(id);
  if (!confirm(`Delete ${c.name}?\n\nThis removes their properties, jobs, visits, quotes and invoices from this device. It can't be undone.`)) return;
  const pids = new Set(props(id).map(p => p.id));
  const jids = new Set(S.jobs.filter(j => pids.has(j.propertyId)).map(j => j.id));
  S.visits = S.visits.filter(v => !jids.has(v.jobId));
  S.jobs = S.jobs.filter(j => !jids.has(j.id));
  S.properties = S.properties.filter(p => !pids.has(p.id));
  S.docs = S.docs.filter(d => d.clientId !== id);
  S.clients = S.clients.filter(x => x.id !== id);
  save(); toast('Client deleted'); go('clients', true);
}

// ---------------------------------------------------------------- PROPERTIES
function propFields(p, req) {
  return `${field('Street address' + (req ? ' *' : ''), 'p_street', p.street, 'text', `${req ? 'required' : ''} placeholder="14 Rata Street, or 112 Old North Road, RD 2"`)}
    <div class="two">${field('Suburb', 'p_suburb', p.suburb, 'text', 'placeholder="Titirangi"')}${field('City / town', 'p_city', p.city, 'text', 'placeholder="Auckland"')}</div>
    ${field('Postcode', 'p_postcode', p.postcode, 'text', 'inputmode="numeric" maxlength="4" placeholder="0604"')}
    <label>Site notes</label>
    <div class="chips">${NOTE_CHIPS.map(n => `<button type="button" class="chip" onclick="addNote(this,'${n}')">${n.replace(/: $/, '…')}</button>`).join('')}</div>
    <textarea name="p_notes" rows="3" placeholder="Gate codes, dogs, things not to touch…">${esc(p.notes || '')}</textarea>`;
}
function addNote(btn, text) {
  const ta = btn.closest('form').querySelector('[name=p_notes]');
  ta.value += (ta.value && !ta.value.endsWith('\n') ? '\n' : '') + text;
  ta.focus();
}
const propFromForm = (f, clientId) => ({ id: uid(), clientId, street: f.p_street.trim(), suburb: f.p_suburb.trim(), city: f.p_city.trim(), postcode: f.p_postcode.trim(), notes: f.p_notes.trim() });
function vPropertyForm(pid, cid) {
  const p = pid ? P(pid) : {};
  if (pid && !p) return notFound('clients');
  const c = C(pid ? p.clientId : cid);
  if (!c) return notFound('clients');
  const h = `<div class="card"><b>${esc(c.name)}</b></div>
    <form onsubmit="saveProperty(event,'${pid || ''}','${c.id}')">${propFields(p, true)}<button class="btn primary big">Save property</button></form>
    ${pid ? `<button class="btn danger" onclick="deleteProperty('${pid}')">Delete property</button>` : ''}`;
  return { title: pid ? 'Edit property' : 'New property', html: h, back: 'client/' + c.id };
}
function saveProperty(e, pid, cid) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  if (!f.p_street.trim()) return toast('Add the street address');
  if (pid) {
    const { id, clientId, ...rest } = propFromForm(f, cid);
    Object.assign(P(pid), rest); save(); toast('Saved'); return back('client/' + cid);
  }
  const p = propFromForm(f, cid);
  S.properties.push(p); save();
  toast('Property saved. Now add the job.');
  go('job/new/' + p.id, true);
}
function deleteProperty(pid) {
  if (!confirm("Delete this property and its jobs and visits? Invoices are kept. This can't be undone.")) return;
  const p = P(pid);
  const jids = new Set(jobsOf(pid).map(j => j.id));
  S.visits = S.visits.filter(v => !jids.has(v.jobId));
  S.jobs = S.jobs.filter(j => !jids.has(j.id));
  S.docs.forEach(d => { if (d.propertyId === pid) d.propertyId = null; });
  S.properties = S.properties.filter(x => x.id !== pid);
  save(); toast('Property deleted'); back('client/' + p.clientId);
}

// ---------------------------------------------------------------- JOBS
function vJobForm(jid, pid, q = {}) {
  const j = jid ? J(jid) : null;
  if (jid && !j) return notFound('clients');
  const p = P(j ? j.propertyId : pid);
  if (!p) return notFound('clients');
  const c = C(p.clientId);
  const d = j ? { ...j } : { title: '', tasks: '', price: 0, freq: 'w2', winterFreq: '', startDate: nextWorkDay(addDays(todayISO(), -1)), time: '', endDate: '', notes: '' };
  const quote = q.quote && D(q.quote);
  if (!j && quote) {
    Object.assign(d, { title: quote.lines[0]?.desc || 'Quoted job', tasks: quote.lines.map(l => l.desc).join('\n'), price: quote.lines.reduce((a, l) => a + lineAmt(l), 0), freq: 'once', notes: `From quote ${quote.number}` });
  }
  const wm = S.settings.winterMonths.slice().sort((a, b) => a - b).map(m => MONTHS[m - 1]).join(', ');
  let h = `<div class="card"><b>${esc(c.name)}</b><div class="sub">${esc(propFull(p))}</div></div>
    <form id="jobform" onsubmit="saveJob(event,'${jid || ''}','${p.id}')">
    <label for="f_title">What's the job? *</label>
    <div class="chips">${Object.keys(SERVICES).map(s => `<button type="button" class="chip" onclick="pickService('${s}')">${s}</button>`).join('')}</div>
    <input id="f_title" name="title" required value="${esc(d.title)}" placeholder="e.g. Lawn mow">
    <label for="f_tasks">Tasks <span class="sub sm">(one per line, becomes your on-site checklist)</span></label>
    <textarea id="f_tasks" name="tasks" rows="4">${esc(d.tasks)}</textarea>
    <label for="f_price">Price per visit (${gstWord()})</label>
    <input id="f_price" name="price" inputmode="decimal" value="${centsInput(d.price)}" placeholder="0.00">
    <label>How often?</label>
    <div class="chips">${FREQS.map(([v, l]) => `<label class="chip"><input type="radio" name="freq" value="${v}" ${d.freq === v ? 'checked' : ''} onchange="$('#winter').hidden=!this.value.startsWith('w')">${l}</label>`).join('')}</div>
    <div id="winter" ${d.freq.startsWith('w') ? '' : 'hidden'}><label for="f_wf">In winter (${wm || 'no winter months set'})</label>
      <select id="f_wf" name="winterFreq">${WINTER.map(([v, l]) => `<option value="${v}" ${d.winterFreq === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="two">${field(j ? 'Start date' : 'First visit', 'start', d.startDate, 'date', 'required')}${field('Time (optional)', 'time', d.time, 'time')}</div>
    ${field('Last visit (optional)', 'end', d.endDate, 'date')}
    <label for="f_jnotes">Notes for this job</label><textarea id="f_jnotes" name="notes" rows="2" placeholder="e.g. Mow on the high setting">${esc(d.notes)}</textarea>
    <button class="btn primary big">${j ? 'Save changes' : 'Save job'}</button></form>`;
  if (j) {
    h += `<p class="sub sm">Changing how often, the start date or the last visit rebuilds the upcoming visits. Done visits aren't touched.</p>
      ${j.active ? `<button class="btn" onclick="endJob('${jid}')">End this job (stop future visits)</button>` : `<button class="btn" onclick="restartJob('${jid}')">Restart this job</button>`}
      <button class="btn danger" onclick="deleteJob('${jid}')">Delete job</button>`;
  }
  return { title: j ? 'Edit job' : 'New job', html: h, back: 'client/' + c.id };
}
function pickService(s) {
  const f = $('#jobform').elements;
  f.title.value = s;
  if (!f.tasks.value.trim() || Object.values(SERVICES).includes(f.tasks.value)) f.tasks.value = SERVICES[s];
}
function saveJob(e, jid, pid) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const freq = f.freq || 'w2';
  const data = { propertyId: pid, title: f.title.trim(), tasks: f.tasks.trim(), price: parseMoney(f.price), freq, winterFreq: freq.startsWith('w') ? f.winterFreq : '', startDate: f.start, time: f.time || '', endDate: f.end || '', notes: f.notes.trim() };
  if (!data.title) return toast("Add what the job is");
  if (!data.startDate) return toast('Pick a start date');
  if (data.endDate && data.endDate < data.startDate) return toast('The last visit is before the first');
  const cid = P(pid).clientId;
  if (jid) {
    const j = J(jid);
    const resched = ['freq', 'winterFreq', 'startDate', 'endDate'].some(k => (j[k] || '') !== (data[k] || ''));
    Object.assign(j, data);
    if (resched && j.active) regenJob(j);
    save(); toast('Job saved'); return back('client/' + cid);
  }
  const j = { id: uid(), active: true, generatedUntil: null, created: todayISO(), ...data };
  S.jobs.push(j); ensureVisits(); save();
  const nv = S.visits.filter(v => v.jobId === j.id && v.status === 'scheduled').sort((a, b) => a.date.localeCompare(b.date))[0];
  toast(nv ? `Job saved. First visit: ${relDay(nv.date)}` : 'Job saved');
  back('client/' + cid);
}
function endJob(id) {
  if (!confirm('End this job? Upcoming visits are removed. Past visits and invoices stay.')) return;
  const j = J(id), t = todayISO();
  j.active = false;
  if (!j.endDate || j.endDate > t) j.endDate = t;
  S.visits = S.visits.filter(v => !(v.jobId === id && v.status === 'scheduled' && v.date >= t));
  save(); render(); toast('Job ended');
}
function restartJob(id) { const j = J(id); j.active = true; j.endDate = ''; regenJob(j); save(); render(); toast('Job restarted'); }
function deleteJob(id) {
  const j = J(id);
  if (S.visits.some(v => v.jobId === id && v.status === 'done')) return alert('This job has done visits in its history. Use "End this job" instead, so the history stays.');
  if (!confirm('Delete this job and its upcoming visits?')) return;
  S.visits = S.visits.filter(v => v.jobId !== id);
  S.jobs = S.jobs.filter(x => x.id !== id);
  save(); toast('Job deleted'); back('client/' + P(j.propertyId).clientId);
}

// ---------------------------------------------------------------- MONEY (invoices & quotes)
function vMoney(tab = 'unpaid') {
  const t = todayISO();
  const inv = S.docs.filter(d => d.kind === 'invoice');
  const unpaid = inv.filter(d => d.status !== 'paid').sort((a, b) => (isOverdue(b) - isOverdue(a)) || a.due.localeCompare(b.due));
  const overdue = unpaid.filter(isOverdue);
  const owed = unpaid.reduce((a, d) => a + totals(d).total, 0);
  const groups = {};
  for (const v of S.visits) if (v.status === 'done' && !v.docId) { const x = ctx(v); if (x.client) (groups[x.client.id] ||= []).push(x); }
  const ready = Object.entries(groups);
  let h = `<div class="card summary"><div><div class="sub">Owed to you</div><div class="big">${money(owed)}</div></div>
    <div class="right">${overdue.length ? `<div class="bad">${overdue.length} overdue</div>` : '<div class="ok">None overdue</div>'}<div class="sub">${unpaid.length} unpaid</div></div></div>`;
  const tabs = [['unpaid', `Unpaid (${unpaid.length})`], ['ready', `To invoice (${ready.length})`], ['quotes', 'Quotes'], ['paid', 'Paid']];
  h += `<div class="tabs">${tabs.map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" onclick="go('money/${k}',true)">${l}</button>`).join('')}</div>`;
  if (tab === 'unpaid') {
    h += unpaid.length ? `<div class="list">${unpaid.map(d => docRow(d, true)).join('')}</div>` : '<div class="empty">Nothing unpaid. Nice.</div>';
  } else if (tab === 'ready') {
    h += `<p class="sub sm">Done visits that aren't on an invoice yet.</p>`;
    h += ready.length ? ready.map(([cid, xs]) => `<div class="card"><div class="row"><div class="grow"><b>${esc(C(cid).name)}</b>
        <div class="sub">${xs.length} visit${pl(xs.length)} · ${xs.sort(byVDate).map(x => fmtDay(x.v.date)).join(', ')}</div></div><div class="amt">${money(xs.reduce((a, x) => a + visitPrice(x), 0))}</div></div>
        <button class="btn primary" onclick="invoiceClient('${cid}')">Create invoice</button></div>`).join('')
      : '<div class="empty">All done visits are invoiced.</div>';
  } else if (tab === 'quotes') {
    const quotes = S.docs.filter(d => d.kind === 'quote').sort((a, b) => b.date.localeCompare(a.date));
    h += quotes.length ? `<div class="list">${quotes.map(d => docRow(d)).join('')}</div>` : '<div class="empty">No quotes yet.</div>';
  } else {
    const paid = inv.filter(d => d.status === 'paid').sort((a, b) => (b.paidDate || '').localeCompare(a.paidDate || ''));
    const fy = (+t.slice(5, 7) >= 4 ? t.slice(0, 4) : String(+t.slice(0, 4) - 1)) + '-04-01';
    const sum = list => list.reduce((a, d) => a + totals(d).total, 0);
    h += `<div class="grid2"><div class="card"><div class="sub">Paid this month</div><b>${money(sum(paid.filter(d => (d.paidDate || '').slice(0, 7) === t.slice(0, 7))))}</b></div>
      <div class="card"><div class="sub">Since 1 April</div><b>${money(sum(paid.filter(d => (d.paidDate || '') >= fy)))}</b></div></div>`;
    h += paid.length ? `<div class="list">${paid.slice(0, 60).map(d => docRow(d)).join('')}</div>` : '<div class="empty">No paid invoices yet.</div>';
  }
  return { title: 'Invoices', html: h, action: tab === 'quotes' ? ['+ Quote', 'doc/new/quote'] : ['+ Invoice', 'doc/new/invoice'] };
}
function docRow(d, actions) {
  const c = C(d.clientId), od = isOverdue(d);
  let side = `<div class="amt">${money(totals(d).total)}</div>`;
  if (actions && d.status === 'sent') {
    side = `<div class="stack"><div class="amt">${money(totals(d).total)}</div>
      ${od ? `<button class="btn sm" onclick="event.stopPropagation();remindSheet('${d.id}')">Remind</button>` : ''}
      <button class="btn sm" onclick="event.stopPropagation();markPaid('${d.id}')">Paid ✓</button></div>`;
  }
  return `<div class="item" role="button" tabindex="0" onclick="go('doc/${d.id}')"><div class="grow"><b>${esc(c ? c.name : 'No client chosen')}</b>
    <div class="sub">${d.kind === 'quote' ? 'Quote ' : ''}${esc(d.number)} · ${fmtDate(d.date)}</div>
    <div class="sub ${od ? 'bad' : ''}">${docStatusLine(d)}</div></div>${side}</div>`;
}
function markPaid(id) { const d = D(id); d.status = 'paid'; d.paidDate = todayISO(); save(); render(); toast(`${d.number} marked paid`); }
function remindSheet(id) {
  const d = D(id), c = C(d.clientId);
  const body = msg('overdue', { client: c, doc: d });
  showSheet(`<h3>Remind ${esc(c.name)}</h3><p class="sub">${esc(d.number)} · ${money(totals(d).total)} · ${docStatusLine(d)}</p>
    <div class="msg">${nl2br(body)}</div>${contactRow(c, body, `Reminder: invoice ${d.number}`, `markReminder('${id}')`)}
    <button class="btn" onclick="closeSheet();render()">Close</button>`);
}
function markReminder(id) { D(id).lastReminder = todayISO(); save(); }
function newDocRoute(kind, cid) {
  const d = newDoc(kind, cid); save();
  history.replaceState(history.state, '', '#/doc/' + d.id);
  lastPath = location.hash;
  return vDoc(d.id);
}
function vDoc(id) {
  const d = D(id);
  if (!d) return notFound('money');
  const inv = d.kind === 'invoice', c = C(d.clientId), s = S.settings;
  const statuses = inv ? [['draft', 'Draft'], ['sent', 'Sent'], ['paid', 'Paid']] : [['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['declined', 'Declined']];
  let h = '';
  if (!s.business || (d.gstMode !== 'none' && !s.gstNumber) || (inv && !s.bank)) {
    h += `<button class="card warn tap" onclick="go('settings')"><b>Finish your business details</b><div class="sub">Business name${d.gstMode !== 'none' ? ', GST number' : ''}${inv ? ' and bank account' : ''} appear on ${inv ? 'invoices' : 'quotes'}. Open Settings ›</div></button>`;
  }
  h += `<div class="seg">${statuses.map(([k, l]) => `<button class="${d.status === k ? 'on' : ''}" onclick="setDocStatus('${id}','${k}')">${l}</button>`).join('')}</div>
    ${d.status === 'paid' ? `<p class="ok">Paid ${fmtDate(d.paidDate)}</p>` : isOverdue(d) ? `<p class="bad">${docStatusLine(d)}</p>` : ''}
    <label for="dclient">Client</label>
    <select id="dclient" onchange="docSet('${id}','clientId',this.value)"><option value="">Choose a client…</option>
      ${S.clients.slice().sort((a, b) => a.name.localeCompare(b.name)).map(x => `<option value="${x.id}" ${x.id === d.clientId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
  if (c && props(c.id).length > 1) {
    h += `<label for="dprop">Property</label><select id="dprop" onchange="docSet('${id}','propertyId',this.value||null)"><option value="">Not specific</option>
      ${props(c.id).map(p => `<option value="${p.id}" ${p.id === d.propertyId ? 'selected' : ''}>${esc(propShort(p))}</option>`).join('')}</select>`;
  }
  h += `<div class="two"><div><label for="ddate">Date</label><input type="date" id="ddate" value="${d.date}" onchange="docDate('${id}',this.value)"></div>
    <div><label for="ddue">${inv ? 'Due' : 'Valid until'}</label><input type="date" id="ddue" value="${d.due}" onchange="docSet('${id}','due',this.value)"></div></div>
    <div class="label">Items <span class="sm">· prices ${gstWord(d.gstMode)}</span></div>
    <div id="lines">${d.lines.map((l, i) => lineRow(id, l, i)).join('')}</div>
    <div class="chips"><button class="chip" onclick="addLine('${id}','')">+ Add item</button>${EXTRAS.map(x => `<button class="chip" onclick="addLine('${id}','${x}')">+ ${x}</button>`).join('')}</div>
    <label for="dnotes">Notes</label><textarea id="dnotes" rows="2" oninput="docSet('${id}','notes',this.value,true)" placeholder="Shown on the ${d.kind}">${esc(d.notes)}</textarea>
    <div class="totals" id="totals">${totalsHtml(d)}</div>
    <button class="btn primary big" onclick="sendDoc('${id}','email')">Email to client</button>
    <div class="grid2"><button class="btn" onclick="sendDoc('${id}','sms')">Text to client</button><button class="btn" onclick="printDoc('${id}')">Print / save PDF</button></div>`;
  if (!inv) {
    h += `<div class="grid2"><button class="btn" onclick="convertQuote('${id}')">${d.invoiceId ? 'View invoice' : 'Turn into invoice'}</button>
      <button class="btn" onclick="jobFromQuote('${id}')">Set up the job</button></div>`;
  }
  h += `<button class="btn danger" onclick="deleteDoc('${id}')">Delete ${d.kind}</button>`;
  return { title: `${inv ? '' : 'Quote '}${d.number}`, html: h, back: inv ? 'money' : 'money/quotes' };
}
function lineRow(id, l, i) {
  return `<div class="line"><input class="desc" value="${esc(l.desc)}" placeholder="Description" oninput="lineSet('${id}',${i},'desc',this.value)">
    <div class="line-nums"><input class="qty" inputmode="decimal" value="${esc(l.qty)}" aria-label="Quantity" oninput="lineSet('${id}',${i},'qty',this.value)">
    <span>× $</span><input class="unit" inputmode="decimal" value="${centsInput(l.unit)}" placeholder="0.00" aria-label="Price" oninput="lineSet('${id}',${i},'unit',this.value)">
    <span class="lt" id="lt${i}">${money(lineAmt(l))}</span><button class="x" onclick="delLine('${id}',${i})" aria-label="Remove item">✕</button></div></div>`;
}
function totalsHtml(d) {
  const t = totals(d);
  if (d.gstMode === 'excl') return `<div><span>Subtotal</span><span>${money(t.sub)}</span></div><div><span>GST 15%</span><span>${money(t.gst)}</span></div><div class="grand"><span>Total</span><span>${money(t.total)}</span></div>`;
  if (d.gstMode === 'incl') return `<div class="grand"><span>Total incl. GST</span><span>${money(t.total)}</span></div><div><span>Includes GST of</span><span>${money(t.gst)}</span></div>`;
  return `<div class="grand"><span>Total</span><span>${money(t.total)}</span></div>`;
}
function docSet(id, k, v, quiet) {
  const d = D(id); d[k] = v;
  if (k === 'clientId') d.propertyId = v && props(v).length === 1 ? props(v)[0].id : null;
  save(); if (!quiet) render();
}
function docDate(id, v) { const d = D(id); d.date = v; d.due = d.kind === 'invoice' ? dueFrom(v) : addDays(v, 30); save(); render(); }
function lineSet(id, i, k, val) {
  const d = D(id), l = d.lines[i];
  if (k === 'desc') l.desc = val; else if (k === 'qty') l.qty = parseFloat(val) || 0; else l.unit = parseMoney(val);
  save();
  $('#lt' + i).textContent = money(lineAmt(l));
  $('#totals').innerHTML = totalsHtml(d);
}
function addLine(id, desc) {
  D(id).lines.push({ desc, qty: 1, unit: 0 }); save(); render();
  const el = document.querySelector(`#lines .line:last-child ${desc ? '.unit' : '.desc'}`);
  if (el) el.focus();
}
function delLine(id, i) { D(id).lines.splice(i, 1); save(); render(); }
function setDocStatus(id, s) {
  const d = D(id); d.status = s;
  if (s === 'paid' && !d.paidDate) d.paidDate = todayISO();
  if (s !== 'paid') delete d.paidDate;
  if (s === 'sent' && !d.sentDate) d.sentDate = todayISO();
  save(); render();
}
function sendDoc(id, via) {
  const d = D(id), c = C(d.clientId);
  if (!c) return toast('Choose a client first');
  if (!d.lines.length) return toast('Add at least one item');
  const body = msg(d.kind, { client: c, doc: d });
  const subject = `${docTitle(d)} ${d.number}${S.settings.business ? ' from ' + S.settings.business : ''}`;
  if (via === 'email' && !c.email) return toast(`No email saved for ${c.name}`);
  if (via === 'sms' && !c.phone) return toast(`No mobile saved for ${c.name}`);
  location.href = via === 'email' ? mailHref(c.email, subject, body) : smsHref(c.phone, body);
  if (d.status === 'draft') { d.status = 'sent'; d.sentDate = todayISO(); save(); setTimeout(() => { render(); toast('Marked as sent'); }, 400); }
}
function convertQuote(id) {
  const q = D(id);
  if (q.invoiceId && D(q.invoiceId)) return go('doc/' + q.invoiceId);
  if (!q.clientId) return toast('Choose a client first');
  const d = newDoc('invoice', q.clientId);
  Object.assign(d, { propertyId: q.propertyId, lines: q.lines.map(l => ({ ...l })), notes: q.notes, gstMode: q.gstMode });
  q.status = 'accepted'; q.invoiceId = d.id;
  save(); go('doc/' + d.id);
}
function jobFromQuote(id) {
  const q = D(id);
  if (!q.clientId) return toast('Choose a client first');
  const pid = q.propertyId || props(q.clientId)[0]?.id;
  if (!pid) return toast('Add a property for this client first');
  if (q.status !== 'accepted') { q.status = 'accepted'; save(); }
  go(`job/new/${pid}?quote=${id}`);
}
function deleteDoc(id) {
  const d = D(id);
  if (!confirm(`Delete ${d.kind} ${d.number}? This can't be undone.`)) return;
  S.visits.forEach(v => { if (v.docId === id) v.docId = null; });
  S.docs.forEach(x => { if (x.invoiceId === id) delete x.invoiceId; });
  S.docs = S.docs.filter(x => x.id !== id);
  save(); toast('Deleted'); back('money');
}
function printDoc(id) { $('#print').innerHTML = printHtml(D(id)); window.print(); }
function printHtml(d) {
  const s = S.settings, c = C(d.clientId), p = d.propertyId && P(d.propertyId), t = totals(d), inv = d.kind === 'invoice';
  const to = c ? (c.billingAddress || (p ? propFull(p) : props(c.id)[0] ? propFull(props(c.id)[0]) : '')) : '';
  let tot = '';
  if (d.gstMode === 'excl') tot = `<tr><td>Subtotal</td><td class="r">${money(t.sub)}</td></tr><tr><td>GST 15%</td><td class="r">${money(t.gst)}</td></tr><tr class="g"><td>Total NZD</td><td class="r">${money(t.total)}</td></tr>`;
  else if (d.gstMode === 'incl') tot = `<tr class="g"><td>Total NZD incl. GST</td><td class="r">${money(t.total)}</td></tr><tr><td>Includes GST of</td><td class="r">${money(t.gst)}</td></tr>`;
  else tot = `<tr class="g"><td>Total NZD</td><td class="r">${money(t.total)}</td></tr>`;
  return `<div class="inv"><div class="inv-head"><div><h1>${docTitle(d)}</h1><div>${esc(d.number)}</div></div>
    <div class="r"><b>${esc(s.business || 'Your business name')}</b><br>${nl2br(s.address)}${s.phone ? '<br>' + esc(s.phone) : ''}${s.email ? '<br>' + esc(s.email) : ''}${d.gstMode !== 'none' ? `<br>GST no. ${esc(s.gstNumber)}` : ''}</div></div>
    <div class="inv-meta"><div><div class="lbl">${inv ? 'Bill to' : 'Prepared for'}</div><b>${esc(c ? c.name : '')}</b><br>${nl2br(to)}</div>
    <table><tr><td>Date</td><td>${fmtDate(d.date)}</td></tr><tr><td>${inv ? 'Due' : 'Valid until'}</td><td>${fmtDate(d.due)}</td></tr>${p ? `<tr><td>Site</td><td>${esc(propShort(p))}</td></tr>` : ''}</table></div>
    <table class="inv-lines"><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr></thead>
    <tbody>${d.lines.map(l => `<tr><td>${esc(l.desc)}</td><td class="r">${esc(l.qty)}</td><td class="r">${money(l.unit)}</td><td class="r">${money(lineAmt(l))}</td></tr>`).join('')}</tbody></table>
    <table class="inv-totals">${tot}</table>
    ${d.notes ? `<p>${nl2br(d.notes)}</p>` : ''}
    ${inv ? `<div class="pay">Please pay by bank transfer to <b>${esc(s.bank || '—')}</b> using reference <b>${esc(d.number)}</b> by ${fmtDate(d.due)}.</div>` : ''}</div>`;
}

// ---------------------------------------------------------------- SETTINGS
function sfield(label, key, type = 'text', attrs = '') {
  return `<div><label for="s_${key}">${label}</label><input id="s_${key}" type="${type}" value="${esc(S.settings[key])}" data-set="${key}" ${type === 'number' ? 'data-num="1"' : ''} oninput="setSetting(this)" ${attrs}></div>`;
}
function setSetting(el) {
  let val = el.type === 'checkbox' ? el.checked : el.value;
  if (el.dataset.num) val = Math.max(1, parseInt(val, 10) || 1);
  const parts = el.dataset.set.split('.');
  let o = S.settings;
  while (parts.length > 1) o = o[parts.shift()];
  o[parts[0]] = val;
  save();
}
function toggleArr(key, n, on) { const a = S.settings[key].filter(x => x !== n); if (on) a.push(n); S.settings[key] = a; save(); }
function vSettings() {
  const s = S.settings;
  const tpl = (k, label, help) => `<label for="t_${k}">${label}</label><textarea id="t_${k}" rows="${k === 'invoice' || k === 'quote' ? 7 : 3}" data-set="templates.${k}" oninput="setSetting(this)">${esc(s.templates[k])}</textarea><div class="sub sm">${help}</div>`;
  let h = `<h2>Business</h2>
    ${sfield('Business name', 'business', 'text', 'placeholder="e.g. Green Thumb Gardening"')}
    ${sfield('Your name (signs your messages)', 'owner', 'text', 'placeholder="e.g. Sam"')}
    <div class="two">${sfield('Phone', 'phone', 'tel')}${sfield('Email', 'email', 'email')}</div>
    <label for="s_address">Postal address</label><textarea id="s_address" rows="2" data-set="address" oninput="setSetting(this)">${esc(s.address)}</textarea>
    <h2>GST</h2>
    <label class="check"><input type="checkbox" data-set="gstRegistered" ${s.gstRegistered ? 'checked' : ''} onchange="setSetting(this);render()"> I'm registered for GST</label>`;
  if (s.gstRegistered) {
    h += `${sfield('GST number', 'gstNumber', 'text', 'placeholder="123-456-789"')}
      <label>The prices I enter are</label>
      <div class="seg"><label><input type="radio" name="incl" ${!s.pricesInclGst ? 'checked' : ''} onchange="S.settings.pricesInclGst=false;save()">Excl. GST (+15%)</label>
        <label><input type="radio" name="incl" ${s.pricesInclGst ? 'checked' : ''} onchange="S.settings.pricesInclGst=true;save()">Incl. GST</label></div>`;
  }
  h += `<p class="sub sm">GST changes apply to new quotes and invoices. Existing ones keep their numbers.</p>
    <h2>Invoices</h2>
    ${sfield('Bank account (for payment)', 'bank', 'text', 'placeholder="12-3456-0123456-00"')}
    <label for="s_terms">Payment terms</label><select id="s_terms" data-set="terms" onchange="setSetting(this)">${TERMS.map(([v, l]) => `<option value="${v}" ${s.terms === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <div class="two">${sfield('Invoice prefix', 'invPrefix')}${sfield('Next invoice no.', 'nextInv', 'number', 'min="1"')}</div>
    <div class="two">${sfield('Quote prefix', 'quotePrefix')}${sfield('Next quote no.', 'nextQuote', 'number', 'min="1"')}</div>
    <h2>Working days</h2><p class="sub sm">Rain-day pushes go to your next working day.</p>
    <div class="chips">${[1, 2, 3, 4, 5, 6, 0].map(n => `<label class="chip"><input type="checkbox" ${s.workDays.includes(n) ? 'checked' : ''} onchange="toggleArr('workDays',${n},this.checked)">${DAYS[n]}</label>`).join('')}</div>
    <h2>Winter months</h2><p class="sub sm">Jobs can drop to a slower winter frequency in these months (e.g. fortnightly mowing).</p>
    <div class="chips">${MONTHS.map((m, i) => `<label class="chip"><input type="checkbox" ${s.winterMonths.includes(i + 1) ? 'checked' : ''} onchange="toggleArr('winterMonths',${i + 1},this.checked);S.jobs.forEach(j=>j.winterFreq&&j.active&&regenJob(j));save()">${m}</label>`).join('')}</div>
    <h2>Message wording</h2><p class="sub sm">Words in {curly brackets} are filled in for you.</p>
    ${tpl('visit', '"Coming tomorrow" reminder', '{first} {day} {service} {owner}')}
    ${tpl('rain', 'Rain-day message', '{first} {day} {service} {owner}')}
    ${tpl('invoice', 'Invoice email / text', '{first} {number} {amount} {due} {lines} {bank} {owner} {business}')}
    ${tpl('quote', 'Quote email / text', '{first} {number} {amount} {due} {lines} {owner} {business}')}
    ${tpl('overdue', 'Overdue reminder', '{first} {number} {amount} {due} {bank} {owner}')}
    <h2>Your data</h2>
    <div class="card"><p>Everything is stored <b>on this device only</b>: ${S.clients.length} client${pl(S.clients.length)}, ${S.docs.length} quote${pl(S.docs.length)}/invoice${pl(S.docs.length)}.
      Last backup: <b>${s.lastBackup ? fmtDate(s.lastBackup) : 'never'}</b>.</p>
      <p class="sub sm">Back up regularly and keep the file somewhere safe (iCloud Drive, Google Drive, email it to yourself). If you lose or wipe the phone without a backup, the data is gone.</p>
      <button class="btn primary" onclick="exportData()">Download backup</button>
      <label class="btn">Restore from a backup<input type="file" accept="application/json,.json" hidden onchange="importData(this.files[0])"></label>
      <button class="btn" onclick="loadSample()">Load sample data</button>
      <button class="btn danger" onclick="eraseAll()">Erase everything</button></div>
    <p class="sub sm center">Rounds v1 · data stays on your device · NZ</p>`;
  return { title: 'Settings', html: h };
}
async function exportData() {
  const t = todayISO();
  S.settings.lastBackup = t; save();
  const name = `rounds-backup-${t}.json`;
  const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); render(); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  render(); toast('Backup downloaded');
}
function importData(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    let data;
    try { data = JSON.parse(r.result); } catch (e) { return toast("That file isn't a backup"); }
    if (!data || !data.version || !Array.isArray(data.clients)) return toast("That file isn't a Rounds backup");
    if (!confirm(`Replace everything on this device with this backup (${data.clients.length} clients)?`)) return;
    S = migrate(data); save(); toast('Backup restored'); go('today', true);
  };
  r.readAsText(file);
}
function eraseAll() {
  if (!confirm('Erase ALL clients, jobs, visits, quotes, invoices and settings from this device?')) return;
  if (!confirm("Really erase everything? This can't be undone unless you have a backup.")) return;
  S = defaults(); save(); toast('Everything erased'); go('today', true);
}

// ---------------------------------------------------------------- sample data
function loadSample() {
  if (S.clients.length && !confirm('Replace everything on this device with sample data?')) return;
  const t = todayISO();
  S = defaults();
  Object.assign(S.settings, { business: 'Green Thumb Gardening', owner: 'Sam', phone: '021 555 0100', email: 'sam@example.co.nz', address: 'PO Box 123, Titirangi\nAuckland 0642', gstNumber: '123-456-789', bank: '12-3456-0123456-00', terms: 'd14' });
  // [name, phone, email, billing, greet, [[street, suburb, city, postcode, notes, [[title, freq, winter, price, time, startOffset]]]]]
  const rows = [
    ['Aroha Ngata', '021 555 0142', 'aroha@example.co.nz', 'visit', '', [['14 Rata Street', 'Titirangi', 'Auckland', '0604', 'Gate code 4471\nFriendly dog (Bella), keep the gate shut', [['Lawn mow', 'w2', 'w4', 6000, '08:00', -42]]]]],
    ['Priya Sharma', '021 555 0123', 'priya@example.co.nz', 'monthly', '', [['8 Kowhai Avenue', 'Mt Albert', 'Auckland', '1025', 'Side gate only', [['Lawn mow', 'w1', 'w2', 4500, '09:30', -35]]]]],
    ['Bruce Thompson', '027 555 0199', '', 'visit', '', [['112 Old North Road, RD 2', 'Kumeū', 'Auckland', '0892', 'Rural, patchy coverage\nPark on the gravel, not the lawn', [['Garden tidy', 'once', '', 28000, '11:00', 0]]]]],
    ['Jess Le Roux', '022 555 0177', 'jess@example.co.nz', 'visit', '', [['45 Sandringham Road', 'Sandringham', 'Auckland', '1025', '', [['Lawn mow', 'w2', 'w4', 5500, '14:00', 0]]]]],
    ['Tom & Mere Wilson', '027 555 0166', 'tom.wilson@example.co.nz', 'visit', 'Tom', [['3/27 Great North Road', 'Grey Lynn', 'Auckland', '1021', 'Do not touch the roses\nGreen waste bin by the garage', [['Hedge trim', 'm1', '', 12000, '', -30]]]]],
    ['Kauri Lodge Body Corporate', '09 555 0100', 'manager@example.co.nz', 'monthly', 'Karen', [
      ['5 Kauri Road', 'Henderson', 'Auckland', '0612', 'Units 1–12. Report broken sprinklers to Karen (manager)', [['Lawns & gardens', 'w1', '', 18000, '08:00', -34]]],
      ['22 Kauri Road', 'Henderson', 'Auckland', '0612', '', [['Hedge trim', 'm1', '', 9500, '', -20]]]]],
  ];
  const past = [];
  for (const [name, phone, email, billing, gr, ps] of rows) {
    const c = { id: uid(), name, phone, email, billing, greet: gr, billingAddress: '', notes: '', created: t };
    S.clients.push(c);
    for (const [street, suburb, city, postcode, notes, jobs] of ps) {
      const p = { id: uid(), clientId: c.id, street, suburb, city, postcode, notes };
      S.properties.push(p);
      for (const [title, freq, winterFreq, price, time, off] of jobs) {
        const j = { id: uid(), propertyId: p.id, title, tasks: SERVICES[title] || '', price, freq, winterFreq, startDate: addDays(t, off), time, endDate: '', notes: '', active: true, generatedUntil: null, created: t };
        S.jobs.push(j);
        const from = addDays(t, billing === 'monthly' ? -27 : -45);
        for (const d of occurrences(j, from, addDays(t, -1))) {
          const v = { id: uid(), jobId: j.id, date: d, origDate: d, status: 'done', order: null, note: '', checks: [], doneTime: '', price };
          S.visits.push(v);
          if (billing === 'visit') past.push([c.id, v]);
        }
      }
    }
  }
  for (const [cid, v] of past.sort((a, b) => a[1].date.localeCompare(b[1].date))) {
    const d = invoiceVisits(cid, [v.id]);
    d.date = v.date; d.due = addDays(v.date, 14);
    const age = daysBetween(v.date, t);
    if (age > 35) { d.status = 'paid'; d.paidDate = addDays(v.date, 9); } else { d.status = 'sent'; d.sentDate = v.date; }
  }
  const jess = S.clients.find(c => c.name === 'Jess Le Roux');
  const q = newDoc('quote', jess.id);
  Object.assign(q, { date: addDays(t, -3), due: addDays(t, 27), status: 'sent', sentDate: addDays(t, -3),
    lines: [{ desc: 'Plant new hedge along back fence (12 × griselinia, 1.5 m)', qty: 1, unit: 96000 }, { desc: 'Compost and bark mulch', qty: 1, unit: 18000 }] });
  ensureVisits(); save();
  toast('Sample data loaded'); go('today', true);
}

// ---------------------------------------------------------------- start
history.scrollRestoration = 'manual';
if (!history.state) history.replaceState({ n: 0 }, '', location.hash || '#/today');
render();
let lastDay = todayISO();
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && todayISO() !== lastDay) { lastDay = todayISO(); render(); }
});
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) navigator.serviceWorker.register('sw.js');
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
