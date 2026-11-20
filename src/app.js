(() => {
'use strict';
const qs = new URLSearchParams(location.search);
const R = CONFIG.rounds, PH = ['lobby', ...R.map(r => r.key), 'summary'];
const roundAt = i => R[i - 1] || null;
const C = { paper:'#FBFBFA', cream:'#F5F5F3', ink:'#1A1A1A', dark:'#4A4A4A', mid:'#8A8A8A', light:'#E2E2DF',
            cam:'#945947', camL:'#B1715B', camE:'#D29A84', clay:'#7E4233', green:'#2F6F48', red:'#A23F34', gold:'#E0B152' };
const PAL = [
  { b:'#B1715B', h:'#D29A84', s:'#945947' }, { b:'#6FA383', h:'#9CC4AB', s:'#4E8565' },
  { b:'#E0B152', h:'#F0D08A', s:'#C4923A' }, { b:'#6F94BD', h:'#9DB9D8', s:'#52789F' },
  { b:'#9A7AB5', h:'#BCA3D0', s:'#7C5E98' }, { b:'#DE94A8', h:'#EDBBC8', s:'#C2748A' },
  { b:'#5FADA9', h:'#93CBC8', s:'#458E8A' }, { b:'#A9A9A4', h:'#CBCBC7', s:'#8A8A86' } ];
const MONO = '"Space Mono",ui-monospace,Menlo,monospace', SERIF = '"Libre Baskerville",Georgia,serif';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WMAX = 96;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), lerp = (a, b, t) => a + (b - a) * t;
const whenLabel = v => { v = Math.round(v); return v >= WMAX ? '2035+' : MONTHS[v % 12] + ' ' + (2027 + (v / 12 | 0)); };
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const quant = (a, q) => { const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, l = Math.floor(i), u = Math.ceil(i); return s[l] + (s[u] - s[l]) * (i - l); };
const sdev = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const rid = (n, abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ') => Array.from({ length: n }, () => abc[Math.random() * abc.length | 0]).join('');
const plain = s => s.replace(/\*/g, '');
const jget = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

/* ================= realtime layer ================= */
function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); }); }
async function makeNet(room) {
  if (CONFIG.firebase && CONFIG.firebase.databaseURL) {
    const V = 'https://www.gstatic.com/firebasejs/10.14.1/';
    await loadScript(V + 'firebase-app-compat.js'); await loadScript(V + 'firebase-database-compat.js');
    firebase.initializeApp(CONFIG.firebase);
    const db = firebase.database(), root = db.ref('rooms/' + room);
    return {
      live: true,
      setState: s => root.child('state').set(s),
      onState: cb => root.child('state').on('value', x => cb(x.val())),
      setPlayer: (u, p) => root.child('players/' + u).update(p),
      setVote: (u, k, v) => root.child('players/' + u + '/v/' + k).set(v),
      onPlayers: cb => { const r = root.child('players'); r.on('child_added', x => cb(x.key, x.val())); r.on('child_changed', x => cb(x.key, x.val())); },
      sendEmote: e => root.child('emotes').push(e),
      onEmote: cb => root.child('emotes').on('child_added', x => { cb(x.val()); x.ref.remove(); }),
      onConn: cb => db.ref('.info/connected').on('value', x => cb(!!x.val()))
    };
  }
  // Demo transport: tabs of the same browser only.
  const K = 'pulse-room-' + room, bc = new BroadcastChannel(K), subs = { state: [], player: [], emote: [] };
  const load = () => jget(K) || {}, fire = m => subs[m.t].forEach(f => f(m));
  bc.onmessage = e => fire(e.data);
  const send = m => { bc.postMessage(m); fire(m); };
  const pl = (u, fn) => { const d = load(); d.players = d.players || {}; const p = d.players[u] = d.players[u] || {}; fn(p); jset(K, d); send({ t: 'player', u, p }); };
  return {
    live: false,
    setState: s => { const d = load(); d.state = s; jset(K, d); send({ t: 'state', s }); },
    onState: cb => { subs.state.push(m => cb(m.s)); cb(load().state || null); },
    setPlayer: (u, p) => pl(u, q => Object.assign(q, p)),
    setVote: (u, k, v) => pl(u, q => { q.v = q.v || {}; q.v[k] = v; }),
    onPlayers: cb => { subs.player.push(m => cb(m.u, m.p)); const d = load().players || {}; for (const u in d) cb(u, d[u]); },
    sendEmote: e => send({ t: 'emote', e }),
    onEmote: cb => subs.emote.push(m => cb(m.e)),
    onConn: cb => cb(true)
  };
}

/* ================= pixel critter ================= */
const ORB = [
  '....oooooo....', '..oobbbbbboo..', '.obhhbbbbbbbo.', '.obhbbbbbbbbo.',
  'obbbbbbbbbbbbo', 'obbbbbbbbbbbbo', 'obbbbbbbbbbbbo', 'obbbbbbbbbbbso',
  '.obbbbbbbbbso.', '.obbbbbbbbsso.', '..oobbbbssoo..', '....oooooo....' ];
// cx = centre x, by = y of the ground under its feet, px = size of one pixel
// Body designs. o ink, b colour, h highlight, s shade, w paper, g grey. ant = antenna pixels [col,row,w,h,ink?]
const BODIES = [
  { map: ORB, ant: [[7, -1, 1, 2, 1], [6, -4, 2, 2, 0]] },
  { map: ['....oooooo....', '..oowwwwwwoo..', '.owwwwwwwwwwo.', '.owwwwwwwwwwo.', 'obbbbbbbbbbbbo', 'obbbbbbbbbbbbo', 'obbbbbbbbbbbbo', 'obbbbbbbbbbbso', '.owwwwwwwwwgo.', '.owwwwwwwwggo.', '..oowwwwggoo..', '....oooooo....'], ant: [[7, -2, 1, 2, 1], [6, -4, 3, 2, 0]] },
  { map: ['..oooooooooo..', '.obhhbbbbbbbo.', '.obhbbbbbbbbo.', '.obbbbbbbbbbo.', 'oobwwwwwwwwboo', 'ogbwwwwwwwwbgo', 'ogbwwwwwwwwbgo', 'oobwwwwwwwwboo', '.obwwwwwwwwbo.', '.obbbbbbbbbso.', '.obbbbbbbbsso.', '..oooooooooo..'], ant: [[7, -2, 1, 2, 1], [6, -3, 3, 1, 0]] },
  { map: ['..............', '.oooooooooooo.', 'obbbbbbbbbbbbo', 'obwwwwwwwwwwbo', 'obwwwwwwwwwwbo', 'obwwwwwwwwwwbo', 'obwwwwwwwwwwbo', 'obwwwwwwwwwwbo', 'obwwwwwwwwwwbo', 'obwwwwwwwwwgbo', 'obbbbbbbbbbsso', '.oooooooooooo.'], ant: [[5, 0, 1, 1, 1], [4, -1, 1, 1, 1], [3, -2, 1, 1, 1], [8, 0, 1, 1, 1], [9, -1, 1, 1, 1], [10, -2, 1, 1, 1], [2, -3, 1, 1, 0], [11, -3, 1, 1, 0]] },
  { map: ['.....oooo.....', '...oobbbboo...', '..obhbbbbbbo..', '..obbbbbbbbo..', '..obbbbbbbbo..', '.oobbbbbbbboo.', 'ogobbbbbbbbogo', '.oobbbbbbbboo.', '..owwwwwwwwo..', '..owwwwwwwgo..', '...oowwggoo...', '.....oooo.....'], ant: [[7, -1, 1, 1, 1], [6, -3, 2, 2, 0]] } ];
const BODY = 3; // which design everyone wears: 0 orb, 1 dome, 2 boxy, 3 telly, 4 capsule
const HATS = [null,
  [[3, 0, 8, 1, '#1A1A1A'], [5, -4, 4, 4, '#1A1A1A'], [5, -1, 4, 1, '#A23F34']],
  [[4, 0, 6, 1, '#E0B152'], [5, -1, 4, 1, '#945947'], [6, -2, 2, 1, '#E0B152'], [6, -3, 2, 1, '#945947'], [6, -4, 2, 1, '#A23F34']],
  [[4, -1, 6, 2, '#E0B152'], [4, -2, 1, 1, '#E0B152'], [6, -2, 2, 1, '#E0B152'], [9, -2, 1, 1, '#E0B152'], [6, -1, 2, 1, '#A23F34']],
  [[3, 0, 8, 1, '#945947'], [4, -1, 6, 1, '#2F6F48'], [5, -2, 4, 1, '#2F6F48'], [6, -3, 2, 1, '#E0B152']],
  [[5, 0, 4, 1, '#1A1A1A'], [2, -1, 10, 1, '#1A1A1A'], [11, 0, 1, 2, '#E0B152']],
  [[4, 0, 9, 1, '#52789F'], [4, -1, 6, 1, '#6F94BD'], [5, -2, 4, 1, '#6F94BD']],
  [[4, -1, 2, 1, '#DE94A8'], [8, -1, 2, 1, '#DE94A8'], [4, -2, 1, 1, '#DE94A8'], [9, -2, 1, 1, '#DE94A8'], [4, 0, 1, 1, '#DE94A8'], [9, 0, 1, 1, '#DE94A8'], [6, -1, 2, 1, '#A23F34']] ];
const HAT_NAMES = ['No hat', 'Top hat', 'Party hat', 'Crown', 'Beanie', 'Mortarboard', 'Cap', 'Bow'];
const SPR = new Map();
// Cached: each distinct critter pose is rendered once, then blitted.
function drawOrb(g, cx, by, px, o) {
  o = o || {}; const tq = Math.round((o.tilt || 0) * 2) / 2;
  if (o.alpha != null || Math.abs(tq) > 1) return drawOrbRaw(g, cx, by, px, o);
  const hop = Math.round(o.hop || 0), look = clamp(Math.round(o.look || 0), -1, 1), wk = o.walk != null ? Math.floor(o.walk) % 2 : -1;
  const key = px + '|' + (o.d != null ? o.d : BODY) + '|' + (o.c | 0) + '|' + (o.h | 0) + '|' + (o.face || 'norm') + '|' + look + '|' + tq + '|' + wk + '|' + (o.bulb || '');
  let sp = SPR.get(key);
  if (!sp) { sp = document.createElement('canvas'); sp.width = 24 * px; sp.height = 19 * px; drawOrbRaw(sp.getContext('2d'), 12 * px, 18 * px, px, { c: o.c, d: o.d, h: o.h, face: o.face, look, tilt: tq, walk: wk < 0 ? null : wk, noShadow: true, bulb: o.bulb }); SPR.set(key, sp); }
  if (!o.noShadow) { g.fillStyle = 'rgba(26,26,26,.13)'; const sw = hop ? 8 : 12; g.fillRect(Math.round(cx - sw * px / 2), Math.round(by), sw * px, px); }
  g.drawImage(sp, Math.round(cx) - 12 * px, Math.round(by) - 18 * px - hop * px);
}
function drawOrbRaw(g, cx, by, px, o) {
  o = o || {};
  const pal = PAL[(o.c | 0) % PAL.length], hop = Math.round(o.hop || 0), tilt = o.tilt || 0;
  const look = clamp(Math.round(o.look || 0), -1, 1), face = o.face || 'norm', E = C.ink;
  const x0 = Math.round(cx - 7 * px), yb = Math.round(by) - px - hop * px;
  const P = (c, r, w, h, col) => { g.fillStyle = col; g.fillRect(x0 + (c + Math.round(tilt * (12 - r) / 4)) * px, yb - (12 - r) * px, w * px, h * px); };
  if (o.alpha != null) g.globalAlpha = o.alpha;
  if (!o.noShadow) { g.fillStyle = 'rgba(26,26,26,.13)'; const sw = hop ? 8 : 12; g.fillRect(Math.round(cx - sw * px / 2), Math.round(by), sw * px, px); }
  const BD = BODIES[(o.d != null ? o.d : BODY) % BODIES.length];
  for (let r = 0; r < 12; r++) { const row = BD.map[r]; let c = 0; while (c < 14) { const ch = row[c]; if (ch === '.') { c++; continue; } let e = c; while (e < 14 && row[e] === ch) e++; P(c, r, e - c, 1, ch === 'o' ? E : ch === 'b' ? pal.b : ch === 'h' ? pal.h : ch === 'w' ? C.paper : ch === 'g' ? C.light : pal.s); c = e; } }
  const wk = o.walk != null ? Math.floor(o.walk) % 2 : -1;
  if (wk !== 0) P(3, 12, 2, 1, E); if (wk !== 1) P(9, 12, 2, 1, E);
  if (HATS[o.h | 0]) { for (const q of HATS[o.h | 0]) P(q[0], q[1], q[2], q[3], q[4]); } else for (const q of BD.ant) P(q[0], q[1], q[2], q[3], q[4] ? E : o.bulb || C.gold);
  if (face === 'blink' || face === 'sleepy') { P(3, 6, 3, 1, E); P(8, 6, 3, 1, E); }
  else if (face === 'happy') { for (const b of [3, 8]) { P(b, 6, 1, 1, E); P(b + 1, 5, 1, 1, E); P(b + 2, 6, 1, 1, E); } }
  else if (face === 'dizzy') { for (const b of [3, 8]) { P(b, 5, 1, 1, E); P(b + 2, 5, 1, 1, E); P(b + 1, 6, 1, 1, E); P(b, 7, 1, 1, E); P(b + 2, 7, 1, 1, E); } }
  else if (face === 'wide') { for (const b of [4, 9]) { P(b + look, 4, 2, 3, E); P(b + look, 4, 1, 1, '#fff'); } }
  else { for (const b of [4, 9]) { P(b + look, 5, 2, 2, E); P(b + look, 5, 1, 1, '#fff'); } }
  if (face === 'wide') P(6, 8, 2, 2, E);
  else if (face === 'happy') { P(5, 8, 1, 1, E); P(6, 9, 2, 1, E); P(8, 8, 1, 1, E); }
  else if (face === 'dizzy') { P(5, 9, 1, 1, E); P(6, 8, 1, 1, E); P(7, 9, 1, 1, E); P(8, 8, 1, 1, E); }
  else if (face === 'sleepy') P(6, 8, 1, 1, E);
  else P(6, 8, 2, 1, E);
  if (face !== 'dizzy') { P(1, 7, 2, 1, 'rgba(190,70,70,.38)'); P(11, 7, 2, 1, 'rgba(190,70,70,.38)'); }
  g.globalAlpha = 1;
}
function drawFx(g, cx, by, px, kind, T) {
  const top = by - 13 * px;
  if (kind === 'sweat') { const k = (T * 1.6) % 1; g.fillStyle = '#6F94BD'; g.fillRect(cx + 8 * px, top + px + k * 5 * px, px, 2 * px); g.fillRect(cx - 9 * px, top + 3 * px + ((k + .5) % 1) * 5 * px, px, 2 * px); }
  if (kind === 'zzz') { g.fillStyle = C.dark; g.font = `700 ${px * 3}px ${MONO}`; g.textAlign = 'left'; for (let i = 0; i < 3; i++) { const k = (T * .5 + i / 3) % 1; g.globalAlpha = 1 - k; g.fillText('z', cx + 7 * px + k * 4 * px, top - k * 6 * px); } g.globalAlpha = 1; }
  if (kind === 'spark') { g.fillStyle = C.gold; for (let i = 0; i < 4; i++) { const a = T * 2 + i * 1.57, on = Math.sin(T * 9 + i * 2) > 0; if (!on) continue; const x = cx + Math.cos(a) * 10 * px, y = top + 6 * px + Math.sin(a) * 8 * px; g.fillRect(x - px * 1.5, y - px / 2, px * 3, px); g.fillRect(x - px / 2, y - px * 1.5, px, px * 3); } }
  if (kind === 'q') { g.fillStyle = C.ink; g.font = `700 ${px * 4}px ${MONO}`; g.textAlign = 'center'; g.fillText('?', cx, top - 5 * px + Math.sin(T * 4) * px); }
}

window.__pix = { drawOrb };
/* ================= BIG SCREEN ================= */
async function startHost() {
  document.body.className = 'host';
  let room = localStorage.getItem('pulse-host-room');
  if (!room || qs.has('new')) { room = rid(4); localStorage.setItem('pulse-host-room', room); if (qs.has('new')) history.replaceState(null, '', '?host'); }
  const SK = 'pulse-host-' + room, saved = jget(SK) || {};
  const H = { phase: saved.phase || 0, players: saved.players || {}, hist: saved.hist || {}, marks: saved.marks || {}, el: saved.el || {}, msgs: saved.msgs !== false, bigQR: false };
  const disp = {}, D = u => disp[u] || (disp[u] = { x: {}, l: null, ph: Math.random() * 6.28, moved: -9, dir: 0, wx: Math.random(), wt: Math.random(), wn: 0, born: performance.now() / 1000 });
  const floats = [], sm = {}; let T = 0, dt = .016, trans = -9, bubble = null, mood = null, lastSay = 0, nd = { p: .5, v: 0 }, bots = [];
  const net = await makeNet(room);
  const joinUrl = location.href.split(/[?#]/)[0] + '?r=' + room, showUrl = joinUrl.replace(/^https?:\/\//, '').replace(/^file:.*\//, '');
  const qr = qrcode(0, 'M'); qr.addData(joinUrl); qr.make(); const QN = qr.getModuleCount();

  const cv = document.createElement('canvas'); cv.id = 'stage'; document.body.append(cv); const g = cv.getContext('2d');
  const fit = () => { const d = Math.min(2, devicePixelRatio || 1, 2560 / innerWidth); cv.width = innerWidth * d; cv.height = innerHeight * d; }; fit(); addEventListener('resize', fit);

  const vals = k => Object.values(H.players).map(p => p.v[k]).filter(v => v != null);
  const count = () => Object.keys(H.players).length;
  const save = () => jset(SK, { phase: H.phase, players: H.players, hist: H.hist, marks: H.marks, el: H.el, msgs: H.msgs });
  const say = (t, m, dur = 4.5) => { bubble = { t, until: T + dur }; mood = m ? { m, until: T + dur } : null; lastSay = T; };

  function onPlayer(u, p) {
    if (!p || !p.n) return;
    let q = H.players[u];
    if (!q) { q = H.players[u] = { n: '', c: 0, h: 0, v: {}, mv: {}, em: 0, j: count() }; if (H.phase === 0 && T > 1) say('Welcome, ' + String(p.n).slice(0, 14) + '!', 'happy', 3); }
    q.n = String(p.n).slice(0, 14); q.c = p.c | 0; if (p.h != null) q.h = p.h | 0;
    const nv = p.v || {}, cur = PH[H.phase];
    for (const k in nv) { const v = +nv[k]; if (!isFinite(v)) continue;
      if (q.v[k] !== v) { const d = D(u); d.dir = Math.sign(v - (q.v[k] == null ? v : q.v[k])); d.moved = T; if (q.v[k] != null && k === cur) q.mv[k] = (q.mv[k] || 0) + Math.abs(v - q.v[k]); }
      q.v[k] = v; }
  }
  function onEmote(e) {
    if (!e) return; const p = H.players[e.u]; if (p) p.em = (p.em || 0) + 1;
    if (e.m && !H.msgs) return; if (floats.length >= 45 || (e.m && floats.filter(f => f.msg).length >= 5)) return; // under spam, drop new ones so the ones on screen finish rising
    floats.push({ x: 160 + Math.random() * 1500, born: T, text: e.m ? String(e.m).slice(0, 60) : String(e.e).slice(0, 4), msg: !!e.m, name: p ? p.n : '', wob: Math.random() * 6 });
  }
  net.onPlayers(onPlayer); net.onEmote(onEmote);
  function setPhase(i) { i = clamp(i, 0, PH.length - 1); if (i !== H.phase) { trans = T; nd = { p: .5, v: 0 }; } H.phase = i; net.setState({ i, msgs: H.msgs, ts: Date.now() }); save();
    const r = roundAt(i); bubble = null; if (r) say(vals(r.key).length ? 'Still time to change your mind' : 'Phones out. Slide to vote!'); else if (i) say('GG, everyone', 'happy', 8); }
  function mark(l) { const r = roundAt(H.phase); if (!r) return; const a = H.marks[r.key] = H.marks[r.key] || []; a.push({ t: H.el[r.key] || 0, l: l || '★' + (a.length + 1) }); save(); }

  setInterval(() => {
    const r = roundAt(H.phase); if (!r) return;
    const k = r.key, a = vals(k), t = H.el[k] = (H.el[k] || 0) + 1;
    if (!a.length) return;
    const hs = H.hist[k] = H.hist[k] || [];
    hs.push({ t, m: +(r.type === 'when' ? quant(a, .5) : mean(a)).toFixed(2), lo: +quant(a, .25).toFixed(1), hi: +quant(a, .75).toFixed(1), n: a.length });
    if (T - lastSay < 9 || a.length < 3) return;
    const old = hs[Math.max(0, hs.length - 11)].m, now = hs[hs.length - 1].m, sp = quant(a, .75) - quant(a, .25);
    if (r.type === 'lean') {
      if (Math.abs(now - old) > 7) say('Whoa, big swing!', 'wide');
      else if (sdev(a) > 31) say('This room is SPLIT', 'dizzy');
      else if (sdev(a) < 9) say('Consensus?!', 'happy');
      else if (Math.abs(now - 50) < 3) say('Dead even…');
      else if (Math.random() < .12) say(['Persuade me', 'Slide if that landed', 'Hmm.', 'Bold claim'][Math.random() * 4 | 0]);
    } else {
      if (Math.abs(now - old) > 5) say('The median is on the move', 'wide');
      else if (sp > 44) say('Years apart. Love it', 'dizzy');
      else if (sp < 9) say('Suspiciously aligned…', 'happy');
    }
  }, 1000);
  setInterval(save, 3000);

  /* ----- demo audience ----- */
  const BN = ['Punter','Porter','Bedder','Fresher','Proctor','Tripos','Supo','Bop','Formal','Mathmo','NatSci','CompSci','Rower','Cox','Blade','Gyp','Plodge','Backs','Granta','Mill','Fitz','Girton','Bridge','Bumps','Gown','Don','Fellow','Scholar','Punt','Swan'];
  function addBots(n) { for (let i = 0; i < n; i++) { const u = 'bot' + rid(5), b = { u, bias: (Math.random() + Math.random() + Math.random() - 1.5) / 1.5, v: {} }; bots.push(b); onPlayer(u, { n: BN[(bots.length - 1) % BN.length], c: Math.random() * 8 | 0, h: Math.random() * 8 | 0, v: {} }); } }
  setInterval(() => {
    const r = roundAt(H.phase);
    for (const b of bots) {
      if (Math.random() < .012) onEmote({ u: b.u, e: CONFIG.emotes[Math.random() * CONFIG.emotes.length | 0] });
      if (Math.random() < .0015) onEmote({ u: b.u, m: ['source?', 'cope', 'this is the crux', 'METR graph go brr', 'but compute though'][Math.random() * 5 | 0] });
      if (!r) continue; const k = r.key, w = r.type === 'when', max = w ? WMAX : 100;
      const tgt = w ? 38 + b.bias * 34 + (r.compare ? 9 : 0) : 50 + b.bias * 34 + 26 * Math.sin((H.el[k] || 0) / 17 + R.indexOf(r));
      if (b.v[k] == null) { if (Math.random() < .07) b.v[k] = Math.round(clamp(tgt + (Math.random() - .5) * 20, 0, max)); else continue; }
      else if (Math.random() < .22) b.v[k] = Math.round(clamp(b.v[k] + (tgt - b.v[k]) * .12 + (Math.random() - .5) * 5, 0, max)); else continue;
      onPlayer(b.u, { n: H.players[b.u].n, c: H.players[b.u].c, v: { [k]: b.v[k] } });
    }
  }, 180);

  /* ----- controls ----- */
  const bar = document.createElement('div'); bar.id = 'bar'; document.body.append(bar);
  const btn = (label, key, fn, cls) => { const b = document.createElement('button'); b.innerHTML = label + (key ? `<kbd>${key}</kbd>` : ''); if (cls) b.className = cls; b.onclick = () => { fn(); b.blur(); }; bar.append(b); };
  const act = {
    prev: () => setPhase(H.phase - 1), next: () => setPhase(H.phase + 1), mark: () => mark(), sk: () => mark('Sceptic'), pro: () => mark('Pro'),
    bots: () => addBots(8), qr: () => { H.bigQR = !H.bigQR; }, msgs: () => { H.msgs = !H.msgs; net.setState({ i: H.phase, msgs: H.msgs, ts: Date.now() }); say(H.msgs ? 'Messages on' : 'Messages off'); },
    full: () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(),
    fresh: () => { if (confirm('Start a brand new room? This clears everything on screen.')) location.search = '?host&new'; }
  };
  btn('◀ Back', '←', act.prev); btn('Next ▶', '→', act.next, 'pri'); btn('Mark', 'M', act.mark); btn('Sceptic up', '1', act.sk); btn('Pro up', '2', act.pro);
  btn('Big QR', 'Q', act.qr); btn('Messages', 'X', act.msgs); btn('+8 bots', 'B', act.bots); btn('Fullscreen', 'F', act.full); btn('New room', '', act.fresh);
  let hideT; const wake = () => { bar.classList.remove('hide'); clearTimeout(hideT); hideT = setTimeout(() => bar.classList.add('hide'), 2500); }; addEventListener('mousemove', wake); wake();
  addEventListener('keydown', e => { const k = e.key.toLowerCase();
    if (k === 'arrowright' || k === ' ' || k === 'pagedown') act.next(); else if (k === 'arrowleft' || k === 'pageup') act.prev();
    else if (k === 'm') act.mark(); else if (k === '1') act.sk(); else if (k === '2') act.pro(); else if (k === 'q') act.qr();
    else if (k === 'x') act.msgs(); else if (k === 'b') act.bots(); else if (k === 'f') act.full(); else return; e.preventDefault(); });

  /* ----- drawing helpers ----- */
  function tx(s, x, y, o) { o = o || {}; g.font = `${o.it ? 'italic ' : ''}${o.w || 400} ${o.s || 24}px ${o.f || MONO}`; g.fillStyle = o.c || C.ink; g.textAlign = o.a || 'left'; g.textBaseline = 'alphabetic'; if ('letterSpacing' in g) g.letterSpacing = (o.ls || 0) + 'px'; g.fillText(s, x, y); const w = g.measureText(s).width; if ('letterSpacing' in g) g.letterSpacing = '0px'; return w; }
  function card(x, y, w, h, fill, sh) { sh = sh == null ? 8 : sh; g.fillStyle = C.ink; g.fillRect(x + sh, y + sh, w, h); g.fillStyle = fill || C.cream; g.fillRect(x, y, w, h); g.strokeStyle = C.ink; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3); }
  function rich(str, x, y, maxW, size, align) {
    const toks = []; str.split(/(\*[^*]+\*)/).forEach(seg => { if (!seg) return; const acc = seg[0] === '*'; (acc ? seg.slice(1, -1) : seg).split(/\s+/).filter(Boolean).forEach(t => toks.push({ t, acc })); });
    const F = a => `${a ? 'italic ' : ''}400 ${size}px ${SERIF}`; g.font = F(false); const sp = g.measureText(' ').width, lines = [[]]; let w = 0;
    for (const k of toks) { g.font = F(k.acc); k.w = g.measureText(k.t).width; if (w + k.w > maxW && lines[lines.length - 1].length) { lines.push([]); w = 0; } lines[lines.length - 1].push(k); w += k.w + sp; }
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    lines.forEach((ln, i) => { let cx = x; if (align === 'center') cx = x - (ln.reduce((s, k) => s + k.w + sp, -sp)) / 2; for (const k of ln) { g.font = F(k.acc); g.fillStyle = k.acc ? C.cam : C.ink; g.fillText(k.t, cx, y + i * size * 1.16); cx += k.w + sp; } });
    return lines.length;
  }
  function drawQR(x, y, size) { const m = size / (QN + 2); g.fillStyle = '#fff'; g.fillRect(x, y, size, size); g.fillStyle = C.ink; for (let r = 0; r < QN; r++) for (let c = 0; c < QN; c++) if (qr.isDark(r, c)) g.fillRect(x + (c + 1) * m, y + (r + 1) * m, m + .4, m + .4); }
  function speech(text, x, y, side) { g.font = `700 24px ${MONO}`; const w = g.measureText(text).width + 36, h = 54, bx = clamp(side === 'l' ? x - w : x, 20, 1900 - w), by = y - h;
    g.fillStyle = C.ink; g.fillRect(bx + 6, by + 6, w, h); g.fillStyle = C.paper; g.fillRect(bx, by, w, h); g.strokeStyle = C.ink; g.lineWidth = 3; g.strokeRect(bx + 1.5, by + 1.5, w - 3, h - 3);
    g.fillStyle = C.ink; const tx0 = side === 'l' ? x - 26 : x + 14; g.fillRect(tx0, y, 12, 8); g.fillRect(tx0 + (side === 'l' ? 6 : 0), y + 8, 6, 8);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(text, bx + 18, by + 35); }
  function pip(cx, by, px, o, side) {
    o = o || {}; const m = mood && T < mood.until ? mood.m : null, blink = (T % 3.7) < .13;
    drawOrb(g, cx, by, px, Object.assign({ c: 0, bulb: C.gold, face: m || (blink ? 'blink' : 'norm'), hop: m === 'happy' || m === 'wide' ? Math.abs(Math.sin(T * 9)) * 1.6 : 0 }, o));
    if (m === 'dizzy') drawFx(g, cx, by, px, 'sweat', T); if (m === 'happy') drawFx(g, cx, by, px, 'spark', T);
    if (bubble && T < bubble.until) { const s = side || (cx > 1100 ? 'l' : 'r'); speech(bubble.t, cx + (s === 'l' ? -8 * px : 8 * px), by - 9 * px, s); }
  }
  function crowd(key, x0, x1, gy, px, max, LM) {
    const ids = Object.keys(H.players).filter(u => H.players[u].v[key] != null).sort((a, b) => H.players[a].j - H.players[b].j);
    const cell = 15 * px, placed = [];
    for (const u of ids) { const p = H.players[u], d = D(u), tgt = x0 + (x1 - x0) * p.v[key] / max;
      if (d.x[key] == null) d.x[key] = tgt; d.x[key] += (tgt - d.x[key]) * Math.min(1, dt * 9);
      let L = 0, best = 0, bd = -1; for (; L < LM; L++) { let md = 1e9; for (const q of placed) if (q.L === L) { const dd = Math.abs(q.x - d.x[key]); if (dd < md) md = dd; } if (md >= cell) break; if (md > bd) { bd = md; best = L; } } if (L === LM) L = best; placed.push({ x: d.x[key], L });
      d.l = d.l == null ? L : d.l + (L - d.l) * Math.min(1, dt * 9);
      const mv = T - d.moved < .7, y = gy - d.l * 13 * px;
      drawOrb(g, d.x[key], y, px, { c: p.c, h: p.h, hop: mv ? Math.abs(Math.sin(T * 16 + d.ph)) * 1.6 : 0, look: mv ? d.dir : 0, tilt: mv ? d.dir * .7 : 0, face: mv ? 'wide' : ((T + d.ph * 2) % 4.3) < .13 ? 'blink' : 'norm', noShadow: d.l > .3 });
    }
    return ids.length;
  }
  function graph(x, y, w, h, key, o) {
    const hs = H.hist[key] || [], N = o.upto != null ? Math.max(0, Math.floor(hs.length * o.upto)) : hs.length;
    const tmax = Math.max(o.minT || 60, hs.length ? hs[hs.length - 1].t : 0), X = t => x + w * t / tmax, Y = v => y + h - h * v / o.max;
    g.fillStyle = C.light; for (let i = 0; i <= 4; i++) g.fillRect(x, Math.round(y + h * i / 4) - 1, w, 2);
    if (o.mid) { g.fillStyle = C.mid; for (let i = 0; i < w; i += 16) g.fillRect(x + i, y + h / 2 - 1, 8, 2); }
    g.fillStyle = C.ink; g.fillRect(x - 3, y, 3, h + 3); g.fillRect(x - 3, y + h, w + 3, 3);
    for (const m of (o.marks && H.marks[key]) || []) { if (o.upto != null && hs.length && m.t > (hs[Math.max(0, N - 1)] || { t: 0 }).t) continue; const mx = X(m.t); g.fillStyle = C.cam; for (let i = 0; i < h; i += 14) g.fillRect(mx - 1, y + i, 3, 8);
      if (!o.small) { g.font = `700 15px ${MONO}`; const tw = g.measureText(m.l).width + 12; g.fillRect(mx - 1, y - 2, tw, 22); g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(m.l, mx + 5, y + 14); } }
    if (N > 1) {
      if (o.band) { g.fillStyle = 'rgba(148,89,71,.16)'; g.beginPath(); for (let i = 0; i < N; i++) g.lineTo(X(hs[i].t), Y(hs[i].hi)); for (let i = N - 1; i >= 0; i--) g.lineTo(X(hs[i].t), Y(hs[i].lo)); g.fill(); }
      const th = o.small ? 4 : 6; g.fillStyle = C.ink; let px = X(hs[0].t), py = Y(hs[0].m);
      for (let i = 1; i < N; i++) { const nx = X(hs[i].t), ny = Y(hs[i].m); g.fillRect(px, py - th / 2, nx - px + .5, th); g.fillRect(nx - th / 2, Math.min(py, ny) - th / 2, th, Math.abs(ny - py) + th); px = nx; py = ny; }
      const s = (o.small ? 12 : 18) + Math.sin(T * 6) * 3; g.fillStyle = C.ink; g.fillRect(px - s / 2 - 3, py - s / 2 - 3, s + 6, s + 6); g.fillStyle = C.cam; g.fillRect(px - s / 2, py - s / 2, s, s);
    } else if (!o.small) tx('waiting for the first sliders…', x + w / 2, y + h / 2 - 16, { a: 'center', s: 20, c: C.mid });
  }
  function header(r) { const w = tx(CONFIG.org, 80, 84, { w: 700, s: 20, ls: 3, c: C.cam }); tx('/  ' + r.title.toUpperCase(), 80 + w + 24, 84, { w: 700, s: 20, ls: 3, c: C.dark }); rich(r.q, 80, 176, 1500, 58); }
  function qrPanel() { card(1652, 36, 232, 300, C.paper); drawQR(1668, 52, 200); tx('JOIN · ' + room, 1768, 288, { a: 'center', w: 700, s: 24, ls: 2 }); tx(count() + ' in the room', 1768, 318, { a: 'center', s: 17, c: C.dark }); }

  /* ----- scenes ----- */
  function lobby() {
    tx(CONFIG.org, 120, 150, { w: 700, s: 24, ls: 4, c: C.cam });
    const parts = CONFIG.eventName.split(/(\*[^*]+\*)/).filter(Boolean); let y = 310;
    for (const p of parts) { const acc = p[0] === '*'; tx((acc ? p.slice(1, -1) : p).trim(), 120, y, { f: SERIF, s: 124, it: acc, c: acc ? C.cam : C.ink, ls: -3 }); y += 142; }
    tx('Scan the code. Pick a critter. Slide your opinion.', 120, y - 40, { s: 28, c: C.dark });
    tx('No app, no login  ·  ' + showUrl, 120, y + 8, { s: 22, c: C.mid });
    // sun, after the hero illustration's radiating lines
    g.save(); g.translate(1150, 170); g.fillStyle = C.camE; for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.fillRect(52 + Math.sin(T * 2 + i) * 5, -3, 26, 6); } g.fillStyle = C.gold; g.fillRect(-32, -32, 64, 64); g.fillStyle = C.ink; g.lineWidth = 4; g.strokeStyle = C.ink; g.strokeRect(-32, -32, 64, 64); g.restore();
    card(1340, 110, 460, 560, C.paper, 12); drawQR(1360, 130, 420); tx('ROOM ' + room, 1570, 606, { a: 'center', w: 700, s: 40, ls: 8 }); tx(count() + ' in the room', 1570, 646, { a: 'center', s: 22, c: C.dark });
    // bank, critters, river
    const gy = 880; g.fillStyle = C.ink; g.fillRect(0, gy, 1920, 4); for (let x = 30; x < 1920; x += 97) { g.fillRect(x, gy - 10, 3, 10); g.fillRect(x + 7, gy - 16, 3, 16); g.fillRect(x + 14, gy - 8, 3, 8); }
    const ids = Object.keys(H.players).sort((a, b) => H.players[a].j - H.players[b].j), px = ids.length > 30 ? 4 : 5;
    for (const u of ids) { const p = H.players[u], d = D(u); if (T > d.wn) { d.wt = Math.random(); d.wn = T + 2 + Math.random() * 5; }
      const dx = d.wt - d.wx, walking = Math.abs(dx) > .004; if (walking) d.wx += Math.sign(dx) * dt * .035; const age = T - d.born, x = 80 + d.wx * 1760;
      drawOrb(g, x, gy, px, { c: p.c, h: p.h, walk: walking ? T * 7 + d.ph : null, look: walking ? Math.sign(dx) : 0, hop: age < .8 ? Math.abs(Math.sin(age * 12)) * 4 : 0, face: age < 1.2 ? 'happy' : ((T + d.ph * 2) % 4.3) < .13 ? 'blink' : 'norm' });
      tx(p.n, x, gy - 18 * px - 6 - (p.j % 3) * 19, { a: 'center', w: 700, s: 15 }); }
    if (!ids.length) tx('be the first one in →', 1300, gy - 30, { a: 'right', s: 24, c: C.mid });
    for (let r = 0; r < 4; r++) { g.fillStyle = r % 2 ? C.light : C.camE; const off = (T * (18 + r * 9) * (r % 2 ? -1 : 1)) % 120; for (let x = -120; x < 2040; x += 120) g.fillRect(x + off + r * 37, 925 + r * 40, 44, 5); }
    const bx = ((T * 55) % 2500) - 400, by = 990 + Math.round(Math.sin(T * 2) * 3);
    g.fillStyle = C.ink; for (let i = 0; i < 30; i++) g.fillRect(bx + 250 + i * 2.2, by - 150 + i * 8, 7, 9);
    pip(bx + 130, by, 6, { look: 1, tilt: Math.sin(T * 2) * .5, face: ids.length ? undefined : 'sleepy', noShadow: true }, 'r');
    g.fillStyle = C.ink; g.fillRect(bx - 6, by - 6, 372, 36); g.fillStyle = C.clay; g.fillRect(bx, by, 360, 24); g.fillStyle = C.camL; g.fillRect(bx, by, 360, 7); g.fillStyle = C.ink; g.fillRect(bx - 18, by - 16, 24, 18); g.fillRect(bx + 354, by - 10, 22, 12);
  }
  function sceneWhen(r) {
    header(r); qrPanel();
    const X0 = 150, X1 = 1770, GY = 740, xv = v => X0 + (X1 - X0) * v / WMAX, a = vals(r.key), n = a.length, px = n <= 16 ? 5 : n <= 34 ? 4 : 3;
    for (let y = 0; y < 8; y += 2) { g.fillStyle = 'rgba(148,89,71,.05)'; g.fillRect(xv(y * 12), 380, xv(12) - xv(0), GY - 380); }
    let med = null, q1, q3;
    if (n) { med = quant(a, .5); q1 = quant(a, .25); q3 = quant(a, .75); sm[r.key] = sm[r.key] == null ? med : sm[r.key] + (med - sm[r.key]) * Math.min(1, dt * 5);
      g.fillStyle = C.camE; for (let y = 380; y < GY + 110; y += 22) g.fillRect(xv(sm[r.key]) - 3, y, 6, 12); }
    crowd(r.key, X0, X1, GY, px, WMAX, Math.floor(350 / (13 * px)));
    g.fillStyle = C.ink; g.fillRect(X0 - 50, GY, X1 - X0 + 100, 5);
    for (let y = 0; y <= 8; y++) { const x = xv(y * 12); g.fillStyle = C.ink; g.fillRect(x - 2, GY, 4, 20); tx(y === 8 ? '2035+' : String(2027 + y), x, GY + 52, { a: 'center', w: 700, s: 24 }); if (y < 8) for (let q = 1; q < 4; q++) g.fillRect(xv(y * 12 + q * 3) - 1, GY, 2, 10); }
    if (n) { g.fillStyle = C.cam; g.fillRect(xv(q1), GY - 2, xv(q3) - xv(q1), 9); }
    if (r.compare) { const b = vals(r.compare); if (b.length) { tx('BEFORE', 30, GY + 90, { s: 14, w: 700, c: C.mid, ls: 1 }); g.strokeStyle = C.mid; g.lineWidth = 2; for (const v of b) g.strokeRect(xv(v) - 5, GY + 74, 10, 10); const bm = xv(quant(b, .5)); g.fillStyle = C.ink; g.fillRect(bm - 8, GY + 71, 16, 16); } }
    const wait = count() - n;
    if (n) {
      const sx = xv(sm[r.key]), by = 950; g.fillStyle = C.ink; g.fillRect(sx + 44, by - 150, 5, 150); g.fillStyle = C.cam; for (let i = 0; i < 6; i++) g.fillRect(sx + 49, by - 150 + i * 6, 54 - Math.abs(i - 2.5) * 14 + Math.sin(T * 6 + i) * 4, 6);
      pip(sx, by, 7, { look: Math.sign(med - sm[r.key]) * (Math.abs(med - sm[r.key]) > .3 ? 1 : 0), walk: Math.abs(med - sm[r.key]) > .3 ? T * 8 : null });
      tx('ROOM MEDIAN', 80, 1004, { s: 17, w: 700, ls: 2, c: C.dark }); tx(whenLabel(med), 80, 1058, { f: SERIF, s: 54 });
      tx('MIDDLE HALF OF THE ROOM', 520, 1004, { s: 17, w: 700, ls: 2, c: C.dark }); tx(whenLabel(q1) + ' to ' + whenLabel(q3), 520, 1052, { s: 30, w: 700, c: C.cam });
    } else { pip(960, 950, 7, { face: 'sleepy' }); drawFx(g, 960, 950, 7, 'zzz', T); }
    tx(n + ' answered' + (wait > 0 ? '  ·  ' + wait + ' still thinking' : ''), 1260, 1052, { a: 'right', s: 18, c: C.mid });
    tx('MEDIAN OVER TIME', 1320, 990, { s: 14, w: 700, ls: 2, c: C.dark }); graph(1320, 1000, 520, 56, r.key, { max: WMAX, small: true, minT: 30 });
  }
  function sceneLean(r) {
    header(r); qrPanel();
    const a = vals(r.key), n = a.length, m = n ? mean(a) : 50, cx = 460, cy = 690, rad = 320;
    nd.v += ((m / 100 - nd.p) * 60 - nd.v * 7) * dt; nd.p = clamp(nd.p + nd.v * dt, -.03, 1.03);
    const NB = 41; for (let i = 0; i < NB; i++) { const f = i / (NB - 1), ang = Math.PI * (1 - f), on = (f - .5) * (nd.p - .5) > 0 && Math.abs(f - .5) <= Math.abs(nd.p - .5) + .012;
      g.save(); g.translate(cx + Math.cos(ang) * rad, cy - Math.sin(ang) * rad); g.rotate(-ang); g.fillStyle = i === 20 ? C.ink : f < .5 ? C.green : C.cam; g.globalAlpha = i === 20 || on ? 1 : .2; g.fillRect(-26, -9, on ? 60 : 46, 18); g.restore(); }
    g.globalAlpha = 1; const na = Math.PI * (1 - nd.p), col = nd.p < .5 ? C.green : C.cam;
    for (let d = 40; d < rad - 50; d += 11) { g.fillStyle = C.ink; g.fillRect(cx + Math.cos(na) * d - 6, cy - Math.sin(na) * d - 6, 12, 12); }
    g.fillStyle = C.ink; g.fillRect(cx + Math.cos(na) * (rad - 44) - 13, cy - Math.sin(na) * (rad - 44) - 13, 26, 26); g.fillStyle = col; g.fillRect(cx + Math.cos(na) * (rad - 44) - 8, cy - Math.sin(na) * (rad - 44) - 8, 16, 16);
    pip(cx, cy + 52, 7, { tilt: (nd.p - .5) * 5, look: Math.abs(nd.p - .5) > .04 ? Math.sign(nd.p - .5) : 0, face: n ? undefined : 'sleepy' }, 'r');
    if (!n) drawFx(g, cx, cy + 52, 7, 'zzz', T);
    tx(r.left, 110, 748, { w: 700, s: 26, c: C.green }); tx(r.right, 810, 748, { a: 'right', w: 700, s: 26, c: C.cam });
    const nl = a.filter(v => v < 45).length, nr = a.filter(v => v > 55).length;
    tx('◀ ' + nl, 110, 800, { s: 24, w: 700 }); tx((n - nl - nr) + ' on the fence', cx, 800, { a: 'center', s: 20, c: C.dark }); tx(nr + ' ▶', 810, 800, { a: 'right', s: 24, w: 700 });
    const lean = Math.abs(m - 50) < 3 ? 'DEAD EVEN' : 'LEANING: ' + (m < 50 ? r.left : r.right).toUpperCase();
    tx(n ? lean : 'NO VOTES YET', cx, 332, { a: 'center', w: 700, s: 22, ls: 2, c: !n || Math.abs(m - 50) < 3 ? C.dark : col });
    card(900, 300, 700, 500, C.cream); tx('ROOM AVERAGE, LIVE', 930, 340, { s: 15, w: 700, ls: 2, c: C.dark });
    const el = H.el[r.key] || 0; tx((el / 60 | 0) + ':' + String(el % 60).padStart(2, '0'), 1570, 340, { a: 'right', s: 15, w: 700, c: C.dark });
    tx(r.right, 1570, 376, { a: 'right', s: 16, w: 700, c: C.cam }); tx(r.left, 1570, 776, { a: 'right', s: 16, w: 700, c: C.green });
    graph(940, 384, 630, 372, r.key, { max: 100, band: true, marks: true, mid: true, minT: 90 });
    const X0 = 150, X1 = 1770, GY = 1030; g.fillStyle = C.ink; g.fillRect(X0 - 50, GY, X1 - X0 + 100, 5); g.fillRect((X0 + X1) / 2 - 2, GY, 4, 16);
    g.fillStyle = C.green; g.fillRect(X0 - 50, GY + 5, 60, 8); g.fillStyle = C.cam; g.fillRect(X1 - 10, GY + 5, 60, 8);
    crowd(r.key, X0, X1, GY, 3, 100, 4);
    if (count() - n > 0) tx((count() - n) + ' still thinking', 1840, 1066, { a: 'right', s: 16, c: C.mid });
    // the area right of the graph: who's talking + marks legend
    card(1640, 370, 244, 430, C.paper, 6); tx('HOST KEYS', 1662, 408, { s: 14, w: 700, ls: 2, c: C.dark });
    [['1', 'sceptic speaks'], ['2', 'pro speaks'], ['M', 'drop a marker'], ['→', 'next round']].forEach((k, i) => { g.fillStyle = C.ink; g.fillRect(1662, 428 + i * 44, 30, 30); tx(k[0], 1677, 450 + i * 44, { a: 'center', s: 16, w: 700, c: '#fff' }); tx(k[1], 1704, 450 + i * 44, { s: 15, c: C.dark }); });
    const ms = H.marks[r.key] || []; tx(ms.length + ' marker' + (ms.length === 1 ? '' : 's') + ' so far', 1662, 640, { s: 15, c: C.mid });
    tx('Slide whenever', 1662, 716, { s: 17, w: 700, c: C.cam }); tx('an argument lands.', 1662, 742, { s: 17, w: 700, c: C.cam }); tx('Slide back if not.', 1662, 768, { s: 17, c: C.dark });
  }
  function summary() {
    tx(CONFIG.org, 80, 84, { w: 700, s: 20, ls: 3, c: C.cam }); rich('How the room *moved*', 80, 160, 1400, 64);
    pip(1790, 170, 6, { face: 'happy', hop: Math.abs(Math.sin(T * 7)) * 2 }, 'l'); drawFx(g, 1790, 170, 6, 'spark', T);
    const cyc = (T % 10) / 10, wr = R.filter(r => r.type === 'when'), after = wr.find(r => r.compare) || wr[wr.length - 1], before = after && after.compare ? R.find(r => r.key === after.compare) : null;
    card(80, 200, 900, 590, C.cream);
    if (after) {
      const kb = before ? before.key : after.key, ka = after.key, k = before ? ease(clamp((cyc - .2) / .35, 0, 1)) : 1, X0 = 140, X1 = 920, GY = 600, xv = v => X0 + (X1 - X0) * v / WMAX;
      tx(plain(after.q).replace(/^So,\s*/i, '').replace(/^./, c => c.toUpperCase()), 110, 252, { f: SERIF, s: 30 });
      if (before) { const lab = k < .5 ? 'BEFORE' : 'AFTER'; g.fillStyle = k < .5 ? C.dark : C.cam; g.fillRect(790, 222, 160, 40); tx(lab, 870, 250, { a: 'center', w: 700, s: 20, ls: 3, c: '#fff' }); }
      g.fillStyle = C.ink; g.fillRect(X0 - 30, GY, X1 - X0 + 60, 4); for (let y = 0; y <= 8; y++) { g.fillRect(xv(y * 12) - 1, GY, 3, 12); tx(y === 8 ? "'35+" : "'" + (27 + y), xv(y * 12), GY + 36, { a: 'center', s: 17, w: 700 }); }
      const ps = Object.values(H.players).filter(p => p.v[ka] != null || p.v[kb] != null).sort((a, b) => a.j - b.j), placed = [];
      for (const p of ps) { const b = p.v[kb] != null ? p.v[kb] : p.v[ka], a2 = p.v[ka] != null ? p.v[ka] : p.v[kb], x = xv(lerp(b, a2, k)); let L = 0; while (L < 8 && placed.some(q => q.L === L && Math.abs(q.x - x) < 44)) L++; placed.push({ x, L });
        const mv = k > 0 && k < 1 && b !== a2; drawOrb(g, x, GY - L * 37, 3, { c: p.c, h: p.h, hop: mv ? Math.abs(Math.sin(T * 14 + p.j)) * 2 : 0, look: mv ? Math.sign(a2 - b) : 0, face: mv ? 'wide' : 'norm', noShadow: L > 0 }); }
      const vb = vals(kb), va = vals(ka);
      if (vb.length && va.length) { const mb = quant(vb, .5), ma = quant(va, .5), d = Math.round(ma - mb);
        if (before) { g.fillStyle = C.mid; g.fillRect(xv(mb) - 2, GY + 44, 4, 26); g.fillStyle = C.cam; g.fillRect(xv(lerp(mb, ma, k)) - 4, GY + 44, 8, 26); }
        tx(before ? 'ROOM MEDIAN' : 'ROOM MEDIAN', 110, 706, { s: 15, w: 700, ls: 2, c: C.dark });
        tx(before ? whenLabel(mb) + '  →  ' + whenLabel(ma) : whenLabel(ma), 110, 756, { f: SERIF, s: 42 });
        if (before) tx(d === 0 ? 'did not move' : Math.abs(d) + ' month' + (Math.abs(d) === 1 ? '' : 's') + (d > 0 ? ' later' : ' sooner'), 950, 756, { a: 'right', s: 24, w: 700, c: C.cam });
      } else tx('no forecasts recorded yet', 530, 720, { a: 'center', s: 22, c: C.mid });
    }
    const lr = R.filter(r => r.type === 'lean'), ph = lr.length ? (590 - (lr.length - 1) * 16) / lr.length : 0;
    lr.forEach((r, i) => { const y = 200 + i * (ph + 16), hs = H.hist[r.key] || []; card(1020, y, 820, ph, C.cream);
      tx(r.title.toUpperCase(), 1044, y + 32, { s: 15, w: 700, ls: 2, c: C.cam });
      graph(1050, y + 48, 470, ph - 68, r.key, { max: 100, band: true, marks: true, mid: true, small: true, upto: Math.min(1, cyc * 1.5), minT: 30 });
      if (hs.length > 1) { const s = hs[0].m, e = hs[hs.length - 1].m, F = m => Math.abs(m - 50) < 2 ? 'even' : m < 50 ? '◀ ' + Math.round((50 - m) * 2) : Math.round((m - 50) * 2) + ' ▶';
        tx('START  →  END', 1560, y + 62, { s: 14, w: 700, ls: 2, c: C.dark }); tx(F(s) + '  →  ' + F(e), 1560, y + 106, { s: 28, w: 700 });
        const d = e - s; tx(Math.abs(d) < 3 ? 'Barely budged' : 'Swung to “' + (d < 0 ? r.left : r.right) + '”', 1560, y + 142, { s: 17, w: 700, c: Math.abs(d) < 3 ? C.dark : d < 0 ? C.green : C.cam });
      } else tx('not played', 1560, y + 100, { s: 20, c: C.mid }); });
    const P = Object.values(H.players), lk = lr.map(r => r.key), mvOf = p => lk.reduce((s, k) => s + (p.mv[k] || 0), 0), top = (arr, f) => arr.length ? arr.reduce((a, b) => f(b) > f(a) ? b : a) : null;
    const voted = P.filter(p => lk.some(k => p.v[k] != null)), both = before ? P.filter(p => p.v[before.key] != null && p.v[after.key] != null) : [];
    const flip = top(voted, mvOf), rock = top(voted, p => -mvOf(p)), mind = top(both, p => Math.abs(p.v[after.key] - p.v[before.key])), hype = top(P.filter(p => p.em), p => p.em);
    const aw = [['FLIP-FLOPPER', flip, flip && Math.round(mvOf(flip)) + ' points of sliding', 'wide'], ['THE ROCK', rock && rock !== flip ? rock : null, rock && Math.round(mvOf(rock)) + ' points. Immovable.', 'sleepy'],
      ['BIGGEST RETHINK', mind && mind.v[after.key] !== mind.v[before.key] ? mind : null, mind && Math.abs(mind.v[after.key] - mind.v[before.key]) + ' months ' + (mind.v[after.key] > mind.v[before.key] ? 'later' : 'sooner'), 'dizzy'], ['HYPE MACHINE', hype, hype && hype.em + ' emotes', 'happy']];
    aw.forEach((w, i) => { const x = 80 + i * 445, y = 830; card(x, y, 425, 200, C.paper); tx(w[0], x + 150, y + 52, { s: 16, w: 700, ls: 2, c: C.cam });
      if (w[1]) { drawOrb(g, x + 78, y + 160, 6, { c: w[1].c, h: w[1].h, face: w[3], hop: Math.abs(Math.sin(T * 5 + i)) * 1.5 }); tx(w[1].n, x + 150, y + 108, { f: SERIF, s: 36 }); tx(w[2], x + 150, y + 146, { s: 16, c: C.dark }); }
      else { drawOrb(g, x + 78, y + 160, 6, { c: 7, face: 'sleepy', alpha: .4 }); tx('nobody yet', x + 150, y + 108, { f: SERIF, s: 30, c: C.mid }); } });
  }

  const bgc = document.createElement('canvas'); bgc.width = 1920; bgc.height = 1080; { const b = bgc.getContext('2d'); b.fillStyle = C.paper; b.fillRect(0, 0, 1920, 1080); b.fillStyle = C.light; for (let y = 30; y < 1080; y += 60) for (let x = 30; x < 1920; x += 60) b.fillRect(x, y, 3, 3); }
  const EMO = new Map(), emo = t => { let c = EMO.get(t); if (!c) { c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d'); x.font = '64px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, 48, 52); EMO.set(t, c); } return c; };
  function frame(ts) {
    const nt = ts / 1000; dt = Math.min(.05, nt - T || .016); T = nt;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = C.paper; g.fillRect(0, 0, cv.width, cv.height);
    const s = Math.min(cv.width / 1920, cv.height / 1080); g.setTransform(s, 0, 0, s, (cv.width - 1920 * s) / 2, (cv.height - 1080 * s) / 2);
    g.drawImage(bgc, 0, 0);
    const r = roundAt(H.phase);
    if (H.phase === 0) lobby(); else if (!r) summary(); else if (r.type === 'when') sceneWhen(r); else sceneLean(r);
    for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i], age = T - f.born, life = f.msg ? 7 : 4.5; if (age > life) { floats.splice(i, 1); continue; }
      const k = age / life, y = 1100 - k * 900, x = f.x + Math.sin(age * 2 + f.wob) * 40; g.globalAlpha = k > .8 ? (1 - k) * 5 : 1;
      if (f.msg) { g.font = `700 26px ${MONO}`; const w = Math.max(g.measureText(f.text).width, 80) + 32; g.fillStyle = C.ink; g.fillRect(x + 6, y + 6, w, 76); g.fillStyle = C.paper; g.fillRect(x, y, w, 76); g.strokeStyle = C.ink; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, 73);
        tx(f.name.toUpperCase(), x + 16, y + 26, { s: 14, w: 700, ls: 1, c: C.cam }); tx(f.text, x + 16, y + 58, { s: 26, w: 700 }); }
      else g.drawImage(emo(f.text), x - 48, y - 70);
      g.globalAlpha = 1; }
    if (H.bigQR) { g.fillStyle = 'rgba(251,251,250,.94)'; g.fillRect(0, 0, 1920, 1080); card(560, 90, 800, 900, C.paper, 14); drawQR(600, 120, 720); tx('ROOM ' + room, 960, 900, { a: 'center', w: 700, s: 52, ls: 10 }); tx(showUrl, 960, 950, { a: 'center', s: 22, c: C.dark }); }
    const tp = (T - trans) / .7; if (tp < 1) { g.fillStyle = C.cam; for (let j = 0; j < 18; j++) for (let i = 0; i < 32; i++) { const rnd = ((i * 73 + j * 151) % 97) / 97; if (rnd * .55 + i / 32 * .45 > tp) g.fillRect(i * 60, j * 60, 61, 61); } }
    if (!net.live) { g.fillStyle = C.ink; g.fillRect(680, 0, 560, 28); tx('DEMO MODE · this browser only · B adds a fake audience', 960, 20, { a: 'center', s: 15, w: 700, c: '#fff' }); }
    requestAnimationFrame(frame);
  }
  setPhase(H.phase);
  if (qs.has('bots')) addBots(+qs.get('bots') || 16);
  window.__host = { H, setPhase, addBots, mark, onEmote };
  requestAnimationFrame(frame);
}

/* ================= PHONE ================= */
function el(tag, a, ...kids) { const e = document.createElement(tag); for (const k in a || {}) { if (k === 'class') e.className = a[k]; else if (k.startsWith('on')) e.addEventListener(k.slice(2), a[k]); else e.setAttribute(k, a[k]); } for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c)); return e; }
function richDom(str) { const f = document.createDocumentFragment(); str.split(/(\*[^*]+\*)/).forEach(s => { if (!s) return; if (s[0] === '*') f.append(el('em', {}, s.slice(1, -1))); else f.append(s); }); return f; }

async function startPhone() {
  document.body.className = 'phone';
  const root = el('div', { class: 'ph' }); document.body.append(root);
  const room = (qs.get('r') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (room.length !== 4) {
    const inp = el('input', { class: 'inp', maxlength: 4, placeholder: 'ABCD', autocapitalize: 'characters', style: 'text-align:center;letter-spacing:.4em;text-transform:uppercase' });
    const go = () => { const v = inp.value.toUpperCase().replace(/[^A-Z]/g, ''); if (v.length === 4) location.search = '?r=' + v; };
    root.append(el('div', { class: 'top' }, el('span', {}, CONFIG.org)), el('div', { class: 'card center' }, el('div', { class: 'q' }, richDom(CONFIG.eventName)), el('p', { class: 'note' }, 'Type the four-letter room code from the big screen.'), inp, el('button', { class: 'btn pri', onclick: go }, 'Join'),
      el('p', { class: 'note' }, 'Running the event? ', el('a', { href: '?host' }, 'Open the big screen'))));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); return;
  }
  const MK = 'pulse-me-' + room; let me = jget(MK); const saveMe = () => jset(MK, me);
  const net = await makeNet(room);
  let state, shown = null, stop = null, lastSent = 0, pend = null, lastEm = 0, lastMsg = 0;
  const dot = el('span', { class: 'dot' }); net.onConn(ok => dot.classList.toggle('off', !ok));
  const cardBox = el('div', { style: 'flex:1;display:flex;flex-direction:column' }), emoBox = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });

  function sendVote(k, v) { me.v[k] = v; saveMe(); const n = Date.now(); clearTimeout(pend); if (n - lastSent > 110) { lastSent = n; net.setVote(me.uid, k, v); } else pend = setTimeout(() => { lastSent = Date.now(); net.setVote(me.uid, k, me.v[k]); }, 120); }
  function orbCanvas(get) {
    const can = el('canvas', { class: 'pcan' }), g = can.getContext('2d'), parts = []; let raf, dx = null, mv = -9, dir = 0, last = null;
    const f = ts => { const T = ts / 1000, w = can.clientWidth || 300, hh = can.clientHeight || 150; if (can.width !== w || can.height !== hh) { can.width = w; can.height = hh; }
      g.clearRect(0, 0, w, hh); const s = get(), gy = hh - 16, tgt = 56 + (w - 112) * s.f; if (dx == null) dx = tgt;
      if (last != null && last !== s.f) { dir = Math.sign(s.f - last); mv = T; for (let i = 0; i < 3; i++) parts.push({ x: dx - dir * 30, y: gy - 6, vx: -dir * (40 + Math.random() * 90), vy: -60 - Math.random() * 140, t: 0, c: [C.cam, C.gold, C.green, C.ink][Math.random() * 4 | 0] }); }
      last = s.f; dx += (tgt - dx) * .3;
      g.fillStyle = C.ink; g.fillRect(0, gy, w, 3); for (let x = 12; x < w; x += 61) { g.fillRect(x, gy - 7, 2, 7); g.fillRect(x + 5, gy - 11, 2, 11); }
      for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.t += .016; p.vy += 9; p.x += p.vx * .016; p.y += p.vy * .016; if (p.t > .7) { parts.splice(i, 1); continue; } g.fillStyle = p.c; g.fillRect(Math.round(p.x / 4) * 4, Math.round(p.y / 4) * 4, 6, 6); }
      const moving = T - mv < .35, shake = s.shake ? Math.round(Math.sin(T * 40)) * 2 : 0;
      drawOrb(g, dx + shake, gy, 7, { c: me.c, h: me.h, face: moving && !s.lock ? 'wide' : s.face || ((T % 3.4) < .12 ? 'blink' : 'norm'), look: moving ? dir : 0, tilt: (s.tilt || 0) + (moving ? dir * .8 : 0), hop: moving ? Math.abs(Math.sin(T * 20)) * 2 : s.bounce ? Math.abs(Math.sin(T * 5)) * 2 : 0, walk: moving ? T * 14 : null });
      if (s.fx) drawFx(g, dx + shake, gy, 7, s.fx, T);
      raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f); return { can, stop: () => cancelAnimationFrame(raf) };
  }
  function slider(cls, max, init, unset, onInput, onCommit, was) {
    const knob = el('div', { class: 'knob' }, el('i'), el('i')), s = el('div', { class: 'sl ' + cls + (unset ? ' unset' : '') }, el('div', { class: 'track' }, el('div', { class: 'fill' })));
    if (was != null) { const w = el('div', { class: 'was' }); w.style.left = (was / max * 100) + '%'; s.append(w); } s.append(knob);
    let v = init, down = false; const place = () => { knob.style.left = (v / max * 100) + '%'; }; place();
    const set = nv => { nv = clamp(Math.round(nv), 0, max); s.classList.remove('unset'); const ch = nv !== v; v = nv; place(); onInput(v, ch); };
    const at = e => { const b = s.getBoundingClientRect(); return clamp((e.clientX - b.left) / b.width, 0, 1) * max; };
    s.addEventListener('pointerdown', e => { down = true; try { s.setPointerCapture(e.pointerId); } catch (x) {} set(at(e)); e.preventDefault(); });
    s.addEventListener('pointermove', e => { if (down) set(at(e)); });
    const up = () => { if (down) { down = false; onCommit(v); } }; s.addEventListener('pointerup', up); s.addEventListener('pointercancel', up);
    return { el: s, nudge: d => { set(v + d); onCommit(v); } };
  }
  function roundCard(r) {
    const w = r.type === 'when', max = w ? WMAX : 100, k = r.key; let v = me.v[k], isSet = v != null; if (!isSet) v = w ? 42 : 50;
    const was = r.compare ? me.v[r.compare] : null;
    const big = el('div', { class: 'big' }), flav = el('div', { class: 'flav' }), card = el('div', { class: 'card' });
    const FW = ['Next year?! Bold.', 'Buckle up.', "Before the decade's out.", 'A nice round number.', 'Soon-ish.', 'Time for a PhD first.', 'Pacing yourself.', 'No rush, then.', 'Not holding your breath.'];
    const paint = bump => {
      if (!isSet) { big.textContent = '?'; flav.textContent = 'Drag the slider to answer'; return; }
      const f = v / max;
      if (w) { big.textContent = whenLabel(v); flav.textContent = FW[Math.min(8, v / 12 | 0)]; card.style.background = `color-mix(in srgb, #D29A84 ${Math.round((1 - f) ** 2 * 60)}%, #F5F5F3)`; }
      else { const d = Math.abs(v - 50), side = v < 50 ? r.left : r.right; big.textContent = d < 5 ? 'On the fence' : side; big.style.color = d < 5 ? C.ink : v < 50 ? C.green : C.cam;
        flav.textContent = d < 5 ? 'Could go either way' : d < 20 ? 'Leaning that way' : d < 40 ? 'Fairly sure' : 'ALL IN'; card.style.background = `color-mix(in srgb, ${v < 50 ? '#2F6F48' : '#945947'} ${Math.round(d * .5)}%, #F5F5F3)`; }
      if (bump) { big.classList.remove('bump'); void big.offsetWidth; big.classList.add('bump'); }
    };
    const oc = orbCanvas(() => { const f = v / max; if (!isSet) return { f, face: 'sleepy', fx: 'q', lock: true };
      if (w) return f < .13 ? { f, face: 'wide', shake: true, fx: 'sweat' } : f > .9 ? { f, face: 'sleepy', fx: 'zzz' } : { f };
      const d = Math.abs(f - .5); return d > .4 ? { f, face: 'happy', fx: 'spark', bounce: true, tilt: (f - .5) * 3 } : d < .05 ? { f, fx: 'q' } : { f, tilt: (f - .5) * 3 }; });
    stop = oc.stop;
    const sl = slider(w ? 'when' : 'lean', max, v, !isSet, (nv, ch) => { const prev = v; v = nv; const first = !isSet; isSet = true;
      const bump = first || (w ? (prev / 12 | 0) !== (v / 12 | 0) : (prev < 50) !== (v < 50) || (Math.abs(prev - 50) < 40) !== (Math.abs(v - 50) < 40));
      if (bump && navigator.vibrate) navigator.vibrate(8); paint(bump); if (ch || first) sendVote(k, v); },
      nv => { if (me.first[k] == null) { me.first[k] = nv; saveMe(); } sendVote(k, nv); }, was);
    card.append(el('div', { class: 'eyebrow' }, r.title), el('div', { class: 'q' }, richDom(r.q)), oc.can, big, flav, sl.el,
      w ? el('div', { class: 'ticks' }, ["'27", "'28", "'29", "'30", "'31", "'32", "'33", "'34", "'35+"].map(t => el('span', {}, t))) : el('div', { class: 'ends' }, el('span', {}, '◀ ' + r.left), el('span', {}, r.right + ' ▶')),
      el('div', { class: 'nudge' }, el('button', { class: 'btn', onclick: () => sl.nudge(-1) }, w ? '− month' : '◀ nudge'), el('button', { class: 'btn', onclick: () => sl.nudge(1) }, w ? '+ month' : 'nudge ▶')),
      was != null ? el('div', { class: 'note', style: 'text-align:center' }, 'The faint line is your first answer: ' + whenLabel(was)) : el('div', { class: 'note', style: 'text-align:center' }, 'You can change this any time. The big screen updates live.'));
    paint(false); return card;
  }
  function show() {
    const key = !state ? 'wait' : PH[state.i] || 'wait'; msgRow.style.display = state && state.msgs === false ? 'none' : '';
    if (key === shown) return; shown = key; if (stop) { stop(); stop = null; }
    const r = R.find(x => x.key === key); let card;
    if (r) card = roundCard(r);
    else if (key === 'summary') { const rows = R.map(x => { const a = me.first[x.key], b = me.v[x.key]; if (b == null) return null; const F = v => x.type === 'when' ? whenLabel(v) : Math.abs(v - 50) < 5 ? 'on the fence' : (v < 50 ? x.left : x.right) + ' (' + Math.abs(v - 50) * 2 + '%)'; return el('div', {}, el('b', {}, x.title), a != null && a !== b ? F(a) + '  →  ' + F(b) : F(b) + (x.type === 'lean' ? ', start to finish' : '')); });
      const oc = orbCanvas(() => ({ f: .5, face: 'happy', fx: 'spark', bounce: true })); stop = oc.stop;
      card = el('div', { class: 'card' }, el('div', { class: 'eyebrow' }, 'Your evening'), el('div', { class: 'q' }, richDom('How *you* moved, ' + me.n)), oc.can, el('div', { class: 'recap' }, rows.some(Boolean) ? rows : 'You kept your cards close tonight.'), el('p', { class: 'note' }, 'Look up for the whole room.')); }
    else { const oc = orbCanvas(() => ({ f: .5 + Math.sin(performance.now() / 1400) * .32, lock: false })); stop = oc.stop;
      card = el('div', { class: 'card center' }, el('div', { class: 'eyebrow' }, 'Room ' + room), el('div', { class: 'q' }, richDom("You're in, *" + me.n.replace(/\*/g, '') + '*')), oc.can, el('p', { class: 'note' }, key === 'wait' ? 'Waiting for the host to start the room…' : 'Eyes on the big screen. Warm up your thumbs on the buttons below.')); }
    cardBox.replaceChildren(card);
  }
  const msgIn = el('input', { class: 'inp', maxlength: 50, placeholder: 'Say something to the room' });
  const sendMsg = () => { const t = msgIn.value.trim(), n = Date.now(); if (!t || n - lastMsg < 4000) return; lastMsg = n; net.sendEmote({ u: me.uid, m: t.slice(0, 50) }); msgIn.value = ''; msgIn.blur(); };
  msgIn.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });
  const msgRow = el('div', { class: 'msg' }, msgIn, el('button', { class: 'btn', onclick: sendMsg }, 'Send'));
  function play() {
    net.setPlayer(me.uid, { n: me.n, c: me.c, h: me.h | 0 }); for (const k in me.v) net.setVote(me.uid, k, me.v[k]);
    const emo = el('div', { class: 'emo' }, CONFIG.emotes.map(e => el('button', { onclick: ev => { const n = Date.now(); if (n - lastEm < 350) return; lastEm = n; net.sendEmote({ u: me.uid, e });
      const b = ev.currentTarget.getBoundingClientRect(), f = el('div', { class: 'fly' }, e); f.style.left = b.left + b.width / 2 - 15 + 'px'; f.style.top = b.top - 10 + 'px'; document.body.append(f); setTimeout(() => f.remove(), 900); } }, e)));
    emoBox.append(emo, msgRow);
    root.replaceChildren(el('div', { class: 'top' }, el('span', {}, dot, 'Room ' + room), el('span', {}, me.n)), cardBox, emoBox);
    net.onState(s => { state = s; show(); });
  }
  if (me && me.n) return play();
  let c = Math.random() * 8 | 0; const nameIn = el('input', { class: 'inp', maxlength: 14, placeholder: 'Your nickname', autocomplete: 'off' });
  me = { c, h: Math.random() * 8 | 0 }; const hatB = el('button', { class: 'btn', style: 'flex:1', onclick: () => { me.h = (me.h + 1) % 8; hatB.textContent = 'Hat: ' + HAT_NAMES[me.h]; } }, 'Hat: ' + HAT_NAMES[me.h]); const oc = orbCanvas(() => ({ f: .5, bounce: true, face: 'happy' }));
  const join = () => { const n = nameIn.value.trim().slice(0, 14); if (!n) { nameIn.focus(); return; } oc.stop(); me = { uid: rid(10, 'abcdefghijkmnpqrstuvwxyz23456789'), n, c: me.c, h: me.h, v: {}, first: {} }; saveMe(); play(); };
  nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
  root.append(el('div', { class: 'top' }, el('span', {}, CONFIG.org), el('span', {}, 'Room ' + room)),
    el('div', { class: 'card' }, el('div', { class: 'q', style: 'font-size:30px' }, richDom(CONFIG.eventName)), oc.can,
      el('div', { style: 'display:flex;gap:8px' }, el('button', { class: 'btn', style: 'flex:1', onclick: () => { me.c = (me.c + 1) % 8; } }, 'Colour'), hatB), nameIn, el('button', { class: 'btn pri', onclick: join }, 'Join the room'), el('p', { class: 'note' }, 'Your nickname shows on the big screen.')));
}

(qs.has('host') ? startHost() : startPhone()).catch(e => { document.body.append(el('pre', { style: 'padding:20px;white-space:pre-wrap' }, 'Could not start: ' + e.message)); });
})();
