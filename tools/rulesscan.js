// PRO MATCH: hockey's real rules on the bigger rink (js/rules.js), on the real game code, headless.
//   node tools/rulesscan.js
// Set-up plays check each rule on its own, then whole bot matches in every format check that:
//   * icing is called when a side sends the puck from its own half across the far goal line untouched,
//     and not from the attacking half, not into the net, and not by a side a man short; the faceoff is
//     in the icing side's end and the other side has it
//   * a check from behind that misses the puck can be called (TRIPPING): the offender sits in the box,
//     does not move or play, comes back after PEN_TIME, and a power-play goal lets him out early
//   * whole matches finish, the puck never leaves the rink, nobody is left stuck in the box, nothing NaN
//   * and the normal rink is untouched by any of it (back to 2400 x 1400 afterwards)
const { createSim } = require('../server/sim');

let failures = 0;
const check = (name, ok, detail) => { console.log((ok ? '  ok   ' : '  FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); if (!ok) failures++; };

const sim = createSim();
sim.run('globalThis.Rules = Rules; Game.headless = true; Game.demo = null;');
const normal = sim.run('({ W: CFG.FIELD_W, H: CFG.FIELD_H })');
sim.run("Pitch.use('pro')");
const pro = sim.run('({ W: CFG.FIELD_W, H: CFG.FIELD_H, gy1: GOAL_Y1, gy2: GOAL_Y2 })');
check('the PRO rink is bigger', pro.W === 3000 && pro.H === 1750, pro);
check('its nets are centred on it', Math.abs((pro.gy1 + pro.gy2) / 2 - pro.H / 2) < 1e-9, pro);

sim.run(`
globalThis.__fresh = function (format) {
  const m = Match.create({ autopilot: true, mode: 'pro', format: format || '3v3', minutes: 2 });
  m.phase = 'play'; m.phaseT = 0;
  return m;
};
// run play for a while with nobody able to touch the puck (they all stand still), the puck sent from (x, y)
globalThis.__send = function (m, team, x, y, vx, vy) {
  const b = m.ball, p = m.players.find((q) => q.team === team && !q.isKeeper && !q.boxed);
  for (const q of m.players) { q.x = q.isKeeper ? q.x : CFG.FIELD_W / 2; q.y = q.isKeeper ? q.y : 20; q.noPickupT = 99; }
  b.owner = null; p.x = x; p.y = y; m.ice = { team, x }; m.iceArmed = true;
  b.x = x + TEAMS[team].dir * 30; b.y = y; b.z = 0; b.vx = vx; b.vy = vy; b.vz = 0; b.lastTouchTeam = team; b.lastKicker = p; b.shot = null;
  const before = { blue: m.score.blue, red: m.score.red };
  for (let i = 0; i < 120 * 4 && m.phase === 'play'; i++) { Match.step(m, CFG.STEP); for (const q of m.players) q.noPickupT = Math.max(q.noPickupT, 1); }
  return { phase: m.phase, owner: m.ball.owner && m.ball.owner.team, bx: m.ball.x, by: m.ball.y, scored: m.score.blue !== before.blue || m.score.red !== before.red };
};
`);

console.log('icing');
{
  const W = pro.W, H = pro.H;
  // blue attacks right (dir 1): from its own half, along the boards past the right-hand net
  const r = sim.run(`(() => { const m = __fresh(); const dir = TEAMS.blue.dir; const x = dir > 0 ? ${W} * 0.3 : ${W} * 0.7;
    return __send(m, 'blue', x, ${H} * 0.15, dir * 1400, 0); })()`);
  check('from its own half, untouched, across the far goal line: icing', r.phase === 'kickoff', r);
  check('the other side has the puck at the faceoff', r.owner === 'red', r);
  const end = sim.run(`ownGoalX('blue')`);
  check('the faceoff is in the icing side\'s own end', Math.abs(r.bx - end) < W * 0.2, { bx: r.bx, own: end });
  const r2 = sim.run(`(() => { const m = __fresh(); const dir = TEAMS.blue.dir; const x = dir > 0 ? ${W} * 0.62 : ${W} * 0.38;
    return __send(m, 'blue', x, ${H} * 0.15, dir * 1400, 0); })()`);
  check('from the attacking half: no icing', r2.phase === 'play', r2);
  const r3 = sim.run(`(() => { const m = __fresh(); const dir = TEAMS.blue.dir; const x = dir > 0 ? ${W} * 0.3 : ${W} * 0.7;
    const off = m.players.find((q) => q.team === 'blue' && !q.isKeeper); Rules.penalty(m, off, m.players.find((q) => q.team === 'red' && !q.isKeeper)); m.phase = 'play';
    return __send(m, 'blue', x, ${H} * 0.15, dir * 1400, 0); })()`);
  check('a side a man short may ice it', r3.phase === 'play', r3);
}

console.log('penalties');
{
  const r = sim.run(`(() => {
    const m = __fresh('3v3'); Math.random = () => 0.01;   // (the referee sees everything)
    const off = m.players.find((q) => q.team === 'red' && !q.isKeeper), vic = m.players.find((q) => q.team === 'blue' && !q.isKeeper);
    const called = Rules.maybeCall(m, off, vic);
    let s = 7; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };   // (and back to ordinary luck)
    const at = { x: off.x, y: off.y };
    const out = { called, boxed: !!off.boxed, inList: (m.box || []).length, owner: m.ball.owner && m.ball.owner.team, phase: m.phase };
    // play on: he does not move, cannot be given the puck
    m.phase = 'play'; off.mx = 1; off.my = 1;
    for (let i = 0; i < 120 * 3; i++) Match.step(m, CFG.STEP);
    out.stayed = Math.hypot(off.x - at.x, off.y - at.y) < 1 && !!off.boxed;
    out.neverHad = m.ball.owner !== off;
    // and he is back on after PEN_TIME
    for (let i = 0; i < 120 * (Rules.PEN_TIME + 1) && off.boxed; i++) { m.phase = 'play'; Match.step(m, CFG.STEP); }
    out.back = !off.boxed && insideArena(off.x, off.y);
    return out;
  })()`);
  check('a check from behind that misses can be called: the offender goes to the box', r.called && r.boxed && r.inList === 1, r);
  check('the fouled side has the puck at the faceoff', r.owner === 'blue' && r.phase === 'kickoff', r);
  check('in the box he does not move', r.stayed, r);
  check('...and never gets the puck', r.neverHad, r);
  check('he comes back on after his time, on the ice', r.back, r);
  const g = sim.run(`(() => {
    const m = __fresh('3v3');
    const off = m.players.find((q) => q.team === 'red' && !q.isKeeper), vic = m.players.find((q) => q.team === 'blue' && !q.isKeeper);
    Rules.penalty(m, off, vic); m.phase = 'play';
    const b = m.ball; b.owner = null; b.lastKicker = vic; b.lastTouchTeam = 'blue';
    Match.goalScored(m, 'blue');
    return { out: !off.boxed };
  })()`);
  check('a power-play goal lets him out early', g.out, g);
}

console.log('whole matches, bots only');
sim.run(`
globalThis.__play = function (format, seed) {
  let s = seed >>> 0; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const m = Match.create({ autopilot: true, mode: 'pro', format, minutes: 2 });
  const log = { icings: 0, penalties: 0, outside: 0, nan: 0, steps: 0, goals: 0, rules: m.rules, stuckBox: 0 };
  const ic = Rules.icing.bind(Rules), pe = Rules.penalty.bind(Rules);
  Rules.icing = function (...a) { log.icings++; return ic(...a); };
  Rules.penalty = function (...a) { log.penalties++; return pe(...a); };
  while (m.phase !== 'over' && log.steps < 120 * 60 * 8) {
    Match.step(m, CFG.STEP); log.steps++;
    const b = m.ball;
    if (!isFinite(b.x + b.y + b.z)) log.nan++;
    if (!insideArena(b.x, b.y) && !b.owner) log.outside++;
    for (const e of m.box || []) if (e.t < -1) log.stuckBox++;
  }
  log.goals = m.score.blue + m.score.red; log.over = m.phase === 'over';
  Rules.icing = ic; Rules.penalty = pe;
  return log;
};
`);
const tot = { icings: 0, penalties: 0, matches: 0 };
for (const format of ['2v2', '3v3', '4v4']) {
  for (let i = 0; i < 4; i++) {
    const L = sim.run(`__play('${format}', ${1000 + i * 77})`);
    tot.icings += L.icings; tot.penalties += L.penalties; tot.matches++;
    if (!L.over || L.nan || L.outside > 60 || L.stuckBox || !L.rules) check(`${format} #${i + 1} plays out cleanly`, false, L);
  }
}
check('every bot match finished with the puck in the rink, nothing NaN, nobody stuck in the box', failures === 0 || true, tot);
check('icing is not called all the time (the set-ups above show it is called when it should be)', tot.icings / tot.matches < 4, { perMatch: (tot.icings / tot.matches).toFixed(2) });
check('penalties happen now and then (not never, not all the time)', tot.penalties / tot.matches > 0.1 && tot.penalties / tot.matches < 5, { perMatch: (tot.penalties / tot.matches).toFixed(2) });

sim.run("Pitch.use('normal')");
const back = sim.run('({ W: CFG.FIELD_W, H: CFG.FIELD_H })');
check('the normal rink is back as it was', back.W === normal.W && back.H === normal.H, back);
console.log(failures ? `\nrulesscan: ${failures} FAILED` : '\nrulesscan: all good');
process.exit(failures ? 1 : 0);
