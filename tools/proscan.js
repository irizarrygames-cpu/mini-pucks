// PRO MATCH online (build 116), run against the real server game code with fake sockets.
//   node tools/proscan.js
// PRO MATCH has queues of its own (pro/2v2, pro/3v3, pro/4v4) and a PRO switch in private rooms. Its
// rooms play in a sandbox of their own on the bigger pitch, side by side with ordinary rooms on the
// normal one. Icing stops play (the banner, the whistle, a faceoff in the icing side's end); the
// snapshots say who sits in the penalty box and for how long (pb, flag 64); the boards keep the puck in
// (no restarts); and a game too old to draw the big rink is kept out of all of it.
const { createGame } = require('../server/game');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class FakeWS {
  constructor() { this.open = true; this.handlers = {}; this.got = []; this.backlog = 0; this.lastSeen = Date.now(); }
  on(ev, fn) { this.handlers[ev] = fn; }
  send(s) { this.got.push(typeof s === 'string' ? JSON.parse(s) : s); }
  close() { if (!this.open) return; this.open = false; if (this.handlers.close) this.handlers.close(); }
  msg(obj) { this.lastSeen = Date.now(); this.handlers.message(obj); }
}
const users = {};
for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'old1', 'n1', 'n2', 'q1', 'q2']) users[id] = { club: 'spain', save: {} };
const game = createGame({ getUser: (id) => users[id], userName: (id) => id.toUpperCase(), saveDB: () => {}, onlineRecord: () => {}, isNameTaken: () => false });

let failures = 0;
const check = (name, ok, detail) => { console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); if (!ok) failures++; };
const socks = {};
const connect = (id, pro = true) => { socks[id] = new FakeWS(); game.connect(socks[id], id); socks[id].msg({ t: 'arena', club: null, pro: pro ? 1 : undefined }); return socks[id]; };
async function waitFor(ws, pred, after = 0, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { for (let i = after; i < ws.got.length; i++) if (pred(ws.got[i])) return ws.got[i]; await sleep(25); }
  return null;
}
const PH_RESTART = 8, PH_PLAY = 1;

(async () => {
  for (const id of Object.keys(users)) connect(id, id !== 'old1');

  console.log('who can ask for PRO MATCH, and for what');
  {
    let n = socks.old1.got.length;
    socks.old1.msg({ t: 'queue', format: 'pro/2v2' });
    const e = await waitFor(socks.old1, (x) => x.t === 'error', n, 1000);
    check('a game too old for the big pitch is turned away, and told why', e && /new version of the game for PRO MATCH/.test(e.msg), e);
    n = socks.p1.got.length;
    socks.p1.msg({ t: 'queue', format: 'pro/1v1' });
    const e2 = await waitFor(socks.p1, (x) => x.t === 'error', n, 1000);
    check('there is no PRO MATCH 1v1', e2 && /Pick a format/.test(e2.msg), e2);
    n = socks.p1.got.length;
    socks.p1.msg({ t: 'queue', format: 'pro/3v3', wc: true });
    const e3 = await waitFor(socks.p1, (x) => x.t === 'error', n, 1000);
    check('nor a PRO MATCH World Cup', !!e3, e3);
  }

  console.log('four players in the pro/2v2 queue');
  const before = Object.fromEntries(['p1', 'p2', 'p3', 'p4'].map((id) => [id, socks[id].got.length]));
  for (const id of ['p1', 'p2', 'p3', 'p4']) socks[id].msg({ t: 'queue', format: 'pro/2v2' });
  const q = await waitFor(socks.p1, (x) => x.t === 'queue', before.p1, 2000);
  check('the queue says which one it is', q && q.format === 'pro/2v2', q);
  const starts = await Promise.all(['p1', 'p2', 'p3', 'p4'].map((id) => waitFor(socks[id], (x) => x.t === 'start', before[id], 5000)));
  check('one match for all four, at once (no waiting for fill-ins)', starts.every((s) => s && s.room === starts[0].room), starts.map((s) => s && s.room));
  check('it starts as a PRO MATCH, 2v2', starts.every((s) => s && s.pro === true && s.format === '2v2'), starts[0] && { pro: starts[0].pro, format: starts[0].format });
  const room = game._roomOf('p1');
  check('the room plays by the rules', room && room.pro && room.m.rules === true, room && { pro: room.pro, rules: room.m.rules });

  console.log('an ordinary room at the same time');
  {
    const n1 = socks.n1.got.length;
    socks.n1.msg({ t: 'room.create', format: '2v2' });
    const lob = await waitFor(socks.n1, (x) => x.t === 'room', n1, 1000);
    socks.n2.msg({ t: 'room.join', code: lob.code });
    await sleep(100);
    socks.n1.msg({ t: 'room.start' });
    const st = await waitFor(socks.n1, (x) => x.t === 'start', n1, 2000);
    check('an ordinary room is not PRO', st && !st.pro, st && st.pro);
    const nr = game._roomOf('n1');
    check('and does not play by the rules', nr && !nr.pro && nr.m.rules === false);
  }

  // both kick off: the ball is on the centre spot of each one's own pitch
  const nroom = game._roomOf('n1');
  for (let i = 0; i < 200 && (room.m.phase !== 'play' || nroom.m.phase !== 'play'); i++) await sleep(50);
  check('the PRO room kicks off in the middle of the big pitch (3000 wide)', Math.abs(room.m.ball.x - 1500) < 80, Math.round(room.m.ball.x));
  check('the ordinary room in the middle of the normal one (2400 wide)', Math.abs(nroom.m.ball.x - 1200) < 80, Math.round(nroom.m.ball.x));

  console.log('icing, online');
  {
    const seat = room.seats.find((s) => s.userId === 'p1'), me = seat.player, ws = socks.p1;
    const m = room.m, b = m.ball, W = 3000, H = 1750;   // (the PRO rink)
    for (let i = 0; i < 200 && m.phase !== 'play'; i++) await sleep(20);
    const dir = me.team === 'blue' ? 1 : -1;           // blue attacks the goal at x = W (as on every screen)
    const far = dir > 0 ? W : 0;
    // everyone else well out of the way, p1 with the puck in their own half
    for (const p of m.players) if (p !== me && !p.isKeeper) { p.x = W / 2; p.y = 120; p.vx = 0; p.vy = 0; }
    me.x = W / 2 - dir * 500; me.y = H / 2 + 420; me.vx = 0; me.vy = 0;
    b.owner = me; b.shot = null;
    await sleep(80);
    // let it go, flat out, right across their goal line well wide of the net
    b.owner = null; me.noPickupT = 2; me.x = W / 2 - dir * 500; me.y = 200;
    b.x = far - dir * 60; b.y = H / 2 + 420; b.z = 0; b.vx = dir * 900; b.vy = 0; b.vz = 0; b.lastTouchTeam = me.team;
    const n = ws.got.length, score = m.score.blue + m.score.red;
    const snap = await waitFor(ws, (x) => x.t === 's' && x.ev.some((e) => e.e === 'f' && e.n === 'showBanner' && e.a[0] === 'ICING!'), n, 3000);
    const whistle = ws.got.slice(n).some((x) => x.t === 's' && x.ev.some((e) => e.e === 's' && e.n === 'whistle'));
    check('everyone gets the ICING! banner and the whistle', !!snap && whistle, { banner: !!snap, whistle });
    check('it is not a goal', m.score.blue + m.score.red === score);
    const fo = await waitFor(ws, (x) => x.t === 's' && x.ph === 0, n, 2000);
    const own = dir > 0 ? 0 : W;
    check("the faceoff is in the icing side's own end", !!fo && Math.abs(fo.b[0] - own) < W * 0.25, fo && { puck: fo.b.slice(0, 2), own });
    check('and the other side has the puck', !!fo && fo.b[6] >= 0 && m.players[fo.b[6]] && m.players[fo.b[6]].team !== me.team, fo && fo.b[6]);
  }

  console.log('the penalty box, online');
  {
    const m = room.m, ws = socks.p2;
    const seat = room.seats.find((s) => s.userId === 'p2'), me = seat.player, i = m.players.indexOf(me);
    for (let k = 0; k < 200 && m.phase !== 'play'; k++) await sleep(20);
    // p2 sits two seconds for tripping (what Rules.penalty does, short)
    m.box = m.box || []; m.box.push({ p: me, t: 2 }); me.boxed = true;
    const n = ws.got.length;
    const snap = await waitFor(ws, (x) => x.t === 's' && Array.isArray(x.pb) && x.pb.length, n, 2000);
    check('the snapshots say who is in the box and for how long', !!snap && snap.pb[0][0] === i && snap.pb[0][1] > 5 && snap.pb[0][1] <= 20, snap && snap.pb);
    check("and that player's flags say so", !!snap && (snap.p[i][7] & 64) === 64, snap && snap.p[i][7]);
    check('they are drawn in the box, behind the boards', !!snap && snap.p[i][1] < -40, snap && snap.p[i].slice(0, 2));
    // pushing the stick does nothing in the box
    const y0 = me.y;
    ws.msg({ t: 'i', s: 900, x: 0, y: 1, sp: 1, a: 0 });
    await sleep(400);
    check('the stick does not move them', Math.abs(me.y - y0) < 1 && me.boxed, { y0, y: me.y });
    const back = await waitFor(ws, (x) => x.t === 's' && !x.pb && !(x.p[i][7] & 64), ws.got.length, 3500);
    check('time served: back on the ice, and the box is empty', !!back && !me.boxed && back.p[i][1] > -10, back && back.p[i].slice(0, 2));
  }

  console.log('the boards keep it in: no restarts');
  {
    const m = room.m, b = m.ball, n = socks.p2.got.length;
    for (let k = 0; k < 200 && m.phase !== 'play'; k++) await sleep(20);
    if (b.owner) b.owner = null;
    b.x = 1500; b.y = 40; b.z = 0; b.vx = 0; b.vy = -700; b.vz = 0; b.shot = null;
    await sleep(500);
    check('off the side boards it stays on the ice, and play goes on', b.y > -60 && b.y < 1810 && m.phase === 'play', { y: Math.round(b.y), phase: m.phase });
    const seen = socks.p2.got.slice(n).filter((x) => x.t === 's');
    check('no restart phase, no rs', seen.length > 10 && !seen.some((x) => x.ph === PH_RESTART || x.rs), seen.length);
  }

  console.log('the ordinary room never has one');
  {
    const ws = socks.n1, start = ws.got.findIndex((x) => x.t === 'start');
    const seen = ws.got.slice(start).filter((x) => x.t === 's');
    check('no restart phase, no rs, in all its snapshots', seen.length > 30 && !seen.some((x) => x.ph === PH_RESTART || x.rs), seen.length);
  }

  console.log('a private room with PRO MATCH on');
  {
    let n = socks.p5.got.length;
    socks.p5.msg({ t: 'room.create', format: '3v3' });
    let lob = await waitFor(socks.p5, (x) => x.t === 'room', n, 1000);
    n = socks.p5.got.length;
    socks.p5.msg({ t: 'room.pro', on: true });
    lob = await waitFor(socks.p5, (x) => x.t === 'room', n, 1000);
    check('the host switches it on, and the room says so', lob && lob.pro === true, lob && lob.pro);
    n = socks.old1.got.length;
    socks.old1.msg({ t: 'room.join', code: lob.code });
    const e = await waitFor(socks.old1, (x) => x.t === 'error', n, 1000);
    check('a game too old for it cannot join', e && /PRO MATCH/.test(e.msg), e);
    n = socks.p6.got.length;
    socks.p6.msg({ t: 'room.join', code: lob.code });
    const j = await waitFor(socks.p6, (x) => x.t === 'room', n, 1000);
    check('a new one can', j && j.pro === true && j.players.length === 2, j && j.players.length);
    n = socks.p5.got.length;
    socks.p5.msg({ t: 'room.format', format: '1v1' });
    lob = await waitFor(socks.p5, (x) => x.t === 'room', n, 1000);
    check('1v1 switches it off (PRO MATCH is 2v2 and up)', lob && lob.format === '1v1' && lob.pro === false, lob && { f: lob.format, pro: lob.pro });
    socks.p5.msg({ t: 'room.format', format: '3v3' }); await sleep(50);
    socks.p5.msg({ t: 'room.pro', on: true }); await sleep(50);
    n = socks.p6.got.length;
    socks.p5.msg({ t: 'room.start' });
    const st = await waitFor(socks.p6, (x) => x.t === 'start', n, 2000);
    check('it starts as a PRO MATCH 3v3', st && st.pro === true && st.format === '3v3', st && { pro: st.pro, f: st.format });
    const r = game._roomOf('p5');
    check('on the big pitch, with the rules', r && r.pro && r.m.rules, r && r.pro);
  }

  console.log(failures ? `\n${failures} FAILED` : '\nall good');
  for (const ws of Object.values(socks)) ws.close();
  process.exit(failures ? 1 : 0);
})();
