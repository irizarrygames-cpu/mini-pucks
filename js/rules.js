// PRO MATCH: hockey's real rules on a bigger rink (Match.create sets m.rules for mode 'pro').
//
//   ICING: a side sends the puck from its own half of the ice right across the other side's goal
//   line (not into the net) and nobody touches it on the way: the play stops and the faceoff is in
//   that side's own end. A side a man short may ice it (that is how a penalty kill breathes).
//
//   PENALTIES: a check from behind that does not get the puck takes the player down, and the
//   referee calls it (TRIPPING). The one who did it sits in the penalty box for PEN_TIME seconds
//   and the other side has a POWER PLAY; a power-play goal lets him out early. The faceoff is in the
//   offending side's end, and the fouled side has the puck.
//
//   FACEOFFS: every restart is one, on the dot it belongs to (centre ice after a goal).
//
// The puck never goes out: the boards keep it in. (Mini Strikers' throw-ins, corners and goal
// kicks lived here; on the ice there is nothing for them to do, so out() is always false.)
const Rules = {
  PEN_TIME: 15,        // seconds in the box (a match is two minutes)
  PEN_CHANCE: 0.2,     // a check from behind that misses the puck: how often the referee sees it (tools/rulesscan.js: about one a match)
  WALK: 360,           // how fast a player leaves the box and gets back on

  out() { return false; },
  noGoal() { return false; },
  start() {},
  step(m) { m.phase = 'play'; m.restart = null; },
  legalAim(m, ax, ay) { const l = Math.hypot(ax, ay) || 1; return [ax / l, ay / l]; },
  drawAim() {},

  // where the penalty box is for a side: behind the far boards, either side of centre ice; a second
  // one in the same box sits along from the first
  boxSpot(team, seat = 0) { return { x: CFG.FIELD_W / 2 + (team === 'blue' ? -1 : 1) * (150 + seat * 38), y: -CFG.SIDE_M - 58 }; },
  seatOf(m, p) { const i = (m.box || []).filter((e) => e.p.team === p.team).findIndex((e) => e.p === p); return Math.max(0, i); },
  inBox(m, team) { return (m.box || []).filter((e) => e.p.team === team).length; },

  // Every step of play: the penalty clocks, and icing. Returns true when play stopped.
  watch(m, dt) {
    const b = m.ball, W = CFG.FIELD_W;
    // the box: time served, then back on the ice at the bench gate
    if (m.box && m.box.length) {
      for (const e of m.box.slice()) {
        e.t -= dt;
        const s = this.boxSpot(e.p.team, this.seatOf(m, e.p));
        e.p.x = s.x; e.p.y = s.y; e.p.vx = 0; e.p.vy = 0;
        if (e.t <= 0) this.release(m, e);
      }
    }
    // who sent the puck where it is: the last carrier, or whoever last touched it after them
    if (b.owner) m.ice = { team: b.owner.team, x: b.owner.x };
    else if (m.ice && b.lastTouchTeam && b.lastTouchTeam !== m.ice.team) m.ice = { team: b.lastTouchTeam, x: b.x };
    // across a goal line, not in the net
    const R = CFG.BALL_R, inNet = b.y > GOAL_Y1 && b.y < GOAL_Y2;
    const over = b.x < -R ? 0 : b.x > W + R ? W : null;
    if (over === null || inNet) { m.iceArmed = true; return false; }
    if (!m.iceArmed) return false;
    m.iceArmed = false;
    const I = m.ice;
    if (!I) return false;
    const T = I.team, theirEnd = attackGoalX(T) === over, ownHalf = (I.x - W / 2) * TEAMS[T].dir < 0;
    if (!theirEnd || !ownHalf || this.inBox(m, T) > this.inBox(m, otherTeam(T))) return false;
    this.icing(m, T, b.y);
    return true;
  },

  icing(m, team, y) {
    const mk = rinkMarks(), H = CFG.FIELD_H, own = ownGoalX(team);
    const x = own === 0 ? mk.foX : CFG.FIELD_W - mk.foX, fy = y < H / 2 ? H / 2 - mk.foY : H / 2 + mk.foY;
    if (!Game.headless) { Sound.whistle(); FX.showBanner(tl('ICING!'), '#ffffff', 1.3, ((team === 'blue' ? m.home : m.club) || {}).name || ''); }
    this.faceoff(m, otherTeam(team), x, fy);
  },

  // a check from behind that did not get the puck: the referee may call it
  maybeCall(m, offender, victim) {
    if (!m.rules || offender.isKeeper || offender.boxed || Math.random() >= this.PEN_CHANCE) return false;
    this.penalty(m, offender, victim);
    return true;
  },

  penalty(m, p, victim) {
    const b = m.ball;
    if (b.owner) loseBall(m, b.owner, 0);
    m.box = m.box || [];
    m.box.push({ p, t: this.PEN_TIME });
    p.boxed = true; p.slideT = 0; p.slideWindT = 0; p.charging = false; p.passCharging = false; p.skill = null;
    const s = this.boxSpot(p.team, this.seatOf(m, p)); p.x = s.x; p.y = s.y; p.vx = 0; p.vy = 0;
    m.stats[p.team].penalties = (m.stats[p.team].penalties || 0) + 1;
    if (!Game.headless) {
      Sound.whistle();
      const side = ((victim.team === 'blue' ? m.home : m.club) || {}).name || '';
      FX.showBanner(tl('TRIPPING!'), '#ffe14d', 1.5, tl('{0} POWER PLAY', [side]));
    }
    // the faceoff in the offending side's end, on the side the trip was, the fouled side's puck
    const mk = rinkMarks(), H = CFG.FIELD_H, own = ownGoalX(p.team);
    this.faceoff(m, victim.team, own === 0 ? mk.foX : CFG.FIELD_W - mk.foX, victim.y < H / 2 ? H / 2 - mk.foY : H / 2 + mk.foY);
  },

  // out of the box: back on the ice at the bench gate, skating towards the play
  release(m, e) {
    m.box = m.box.filter((x) => x !== e);
    const p = e.p, H = CFG.FIELD_H;
    p.boxed = false;
    p.x = this.boxSpot(p.team).x; p.y = Math.min(60, H * 0.05); p.vx = 0; p.vy = this.WALK;
    p.noPickupT = 0.2;
    if (!Game.headless && (p.isHuman || m.humans.some((h) => h.team === p.team))) FX.text(p.x, p.y, tl('BACK ON!'), '#46d9ff', 16);
  },

  // a power-play goal ends the shortest penalty against the side that let it in
  goal(m, scoringTeam) {
    if (!m.box || !m.box.length) return;
    const theirs = m.box.filter((e) => e.p.team !== scoringTeam).sort((a, c) => a.t - c.t);
    if (theirs.length && this.inBox(m, otherTeam(scoringTeam)) > this.inBox(m, scoringTeam)) this.release(m, theirs[0]);
  },

  // a faceoff on a dot: everyone lines up as they do at centre ice, moved to that dot (inside the
  // boards), and `team` has it as the puck drops
  faceoff(m, team, x, y) {
    const W = CFG.FIELD_W, H = CFG.FIELD_H, dx = x - W / 2, dy = y - H / 2;
    Match.setupKickoff(m, team);
    for (const p of m.players) {
      if (p.isKeeper) continue;
      if (p.boxed) { const s = this.boxSpot(p.team, this.seatOf(m, p)); p.x = s.x; p.y = s.y; continue; }
      p.x = clamp(p.x + dx, 40, W - 40); p.y = clamp(p.y + dy, 40, H - 40);
    }
    const b = m.ball, k = b.owner;
    if (k) { b.x = k.x + k.fx * (k.r + CFG.BALL_R + 1); b.y = k.y; b.safeX = b.x; b.safeY = b.y; }
    m.ice = null; m.iceArmed = true;
    m.phase = 'kickoff'; m.phaseT = 0;
  },

  // the power play on screen: under the scoreboard, whose and how long
  drawBox(ctx, m) {
    if (!m.box || !m.box.length || m.phase === 'goal' || m.phase === 'cele' || m.phase === 'replay') return;
    const W = Render.W, H = Render.H, e = m.box.slice().sort((a, c) => a.t - c.t)[0];
    const pp = otherTeam(e.p.team), name = ((pp === 'blue' ? m.home : m.club) || {}).name || '';
    const secs = Math.max(0, Math.ceil(e.t));
    const size = clamp(H * 0.03, 12, 17);
    Render.chunkyText(ctx, tl('POWER PLAY {0} · 0:{1}', [name, String(secs).padStart(2, '0')]), W / 2, Math.max(70, H * 0.135), size, pp === 'blue' ? '#7fdcff' : '#ff9a9a', size * 0.22);
  },
};
