// Gift scan (Mini Pucks) — node tools/giftscan.js
//
// Mini Pucks has no gifts yet (GIFTS in server.js is empty): it was made from Mini Strikers, whose
// gifts (irizarry, havertz, irizarrygame) belong to that game only. On a real server with a throwaway
// data file, accounts with those names made long before today get nothing: no coins, no items, no
// season pass, now or after a restart or two weeks on. When a gift is added here, this scan gets its
// checks back (see Mini Strikers' tools/giftscan.js).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = 8489;
const DATA = path.join(os.tmpdir(), `ms-giftscan-${process.pid}.json`);
const CLOCK = path.join(os.tmpdir(), `ms-giftscan-clock-${process.pid}.js`);
const PW = 'gift-scan-' + Math.random().toString(36).slice(2) + '-Aa1';

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 300) : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the server's clock can be moved on (MS_SKEW ms), to see the next season pass arrive
fs.writeFileSync(CLOCK, "const o = Number(process.env.MS_SKEW) || 0; const n = Date.now; Date.now = () => n() + o;\n");

let child = null;
async function start(skew = 0) {
  child = spawn(process.execPath, ['--require', CLOCK, 'server.js', String(PORT)], { cwd: ROOT, env: { ...process.env, MS_DATA_FILE: DATA, DATABASE_URL: '', MS_SKEW: String(skew) }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.log = [];
  child.stdout.on('data', (d) => child.log.push(String(d)));
  child.stderr.on('data', (d) => child.log.push(String(d)));
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) return true; } catch (e) { /* not yet */ }
    await sleep(100);
  }
  return false;
}
async function stop() {
  if (!child) return;
  await sleep(900); // what the server has not written yet goes to the file (it waits 300 ms to batch)
  const c = child; child = null;
  const gone = new Promise((r) => { c.once('exit', r); setTimeout(r, 4000); });
  try { c.kill(); } catch (e) {}
  await gone;
}
const post = async (route, body) => {
  const r = await fetch(`http://127.0.0.1:${PORT}/api${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try { return await r.json(); } catch (e) { return null; }
};
const readData = () => JSON.parse(fs.readFileSync(DATA, 'utf8'));
const usersOf = (d) => (d && d.users) || d;
function cleanUp() { try { if (child) child.kill(); } catch (e) {} for (const f of [DATA, CLOCK]) { try { fs.unlinkSync(f); } catch (e) {} } }
process.on('exit', cleanUp);

(async () => {
  const sim = require('../server/sim').createSim();
  const all = {
    ball: sim.run('BALLS').map((x) => x.id), trail: sim.TRAILS.map((x) => x.id), celebration: sim.CELEBRATIONS.map((x) => x.id),
    accessory: sim.ACCESSORIES.map((x) => x.id), skill: sim.SKILLS.map((x) => x.id), emote: sim.EMOTES.map((x) => x.id),
  };
  const hasAll = (sv) => !!sv && !!sv.owned && Object.entries(all).every(([k, ids]) => Array.isArray(sv.owned[k]) && ids.every((id) => sv.owned[k].includes(id)));
  const pass = sim.passNow();
  const hasPass = (sv, n) => !!sv && !!sv.owned && [['emote', 'pe' + n], ['accessory', 'pa' + n], ['celebration', 'pc' + n]].every(([k, id]) => (sv.owned[k] || []).includes(id));
  const DAY = 86400000;
  const NAMES = ['irizarry', 'irizarrygame', 'havertz', 'lilotter', 'giftscanother'];

  console.log('no gifts in this game');
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  check('GIFTS in server.js is empty', /\nconst GIFTS = \[\];/.test(src.split('\r\n').join('\n')));
  check('the server starts', await start());
  for (const n of NAMES) {
    const su = await post('/auth/signup', { username: n, password: PW, club: 'spain' });
    check('made ' + n, !!(su && su.token) && !su.gift, su && (su.msg || su.gift));
  }
  await stop();
  // as if the accounts had been there all year
  const d = readData(), users = usersOf(d);
  for (const k of Object.keys(users)) if (users[k]) users[k].created = Date.UTC(2026, 0, 1);
  fs.writeFileSync(DATA, JSON.stringify(d));

  const nothing = async (label) => {
    for (const n of NAMES) {
      const li = await post('/auth/login', { username: n, password: PW });
      const got = li && li.save && li.save.owned ? Object.fromEntries(Object.entries(li.save.owned).map(([k, v]) => [k, v.length])) : {};
      check(label + ': ' + n + ' gets nothing', li && li.token && !li.gift && !hasAll(li.save) && !hasPass(li.save, pass) && !((li.save || {}).coins > 1e6), li && { gift: li.gift, coins: (li.save || {}).coins, got });
    }
  };
  console.log('restarted');
  check('the server starts again', await start());
  check('no gift in its log', !/coins queued for|everything queued/.test(child.log.join('')), child.log.join('').slice(-300));
  await nothing('restarted');
  await stop();

  console.log('two weeks on: the next season pass');
  check('the server starts, 14 days later', await start(14 * DAY));
  await nothing('two weeks on');
  await stop();

  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exitCode = failures ? 1 : 0;
})().catch(async (e) => { console.error(e); if (child) console.log(child.log.join('').slice(-2000)); await stop(); process.exitCode = 1; });
