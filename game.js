/* DADLINE — rules and game state (no DOM). Also the balance simulator. */
(function (root) {
  'use strict';
  const B = root.DadBoard;

  // Tweak balance here, then re-run simulate() in the console.
  const CONFIG = {
    startRings: 10,
    legoLoss: 2,       // LEGO! steps lost
    shortcutGain: 2,   // SPEED BOOST! (sock slide) steps gained
    doorOpenOn: 4,     // locked door: walk into it to jiggle the handle; door die >= this opens it for good
    doorJamRings: 1,   // ...otherwise it's jammed: you bounce back and lose this many rings
    chuteStuckOn: 2,   // chute d6 <= this: you get stuck (-1 ring)
    catRange: 3        // cat lands within this many steps of you
  };

  const CHAOS = {
    1: { id: 'cat',      title: 'CAT ATTACK!',     bad: true },
    2: { id: 'lego',     title: 'LEGO!',           bad: true },
    3: { id: 'mom',      title: 'MOM NEEDS YOU!',  bad: true },
    4: { id: 'shortcut', title: 'SPEED BOOST!',    bad: false },
    5: { id: 'sighting', title: 'DAD SIGHTING!',   bad: false },
    6: { id: 'luck',     title: 'PURE LUCK!',      bad: false }
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const d6 = rng => 1 + Math.floor(rng() * 6);

  // What you find instead of Dad (90s dad energy).
  const EMPTY_ROOM = {
    kitchen: 'no Dad. Just a sticky note: "DO NOT TOUCH THE THERMOSTAT."',
    bath:    'no Dad. Only a Reader\'s Digest left open on page 42.',
    parents: 'no Dad. His socks-and-sandals are by the bed, so he can\'t be far.',
    living:  'no Dad. The remote is gone. Classic Dad.',
    kids:    'no Dad. He was here though. Someone turned off the lights "we\'re not paying for".',
    office:  'no Dad. A Rolodex is open at "STEVE CURTAINS" and "DAVE PLUMBER".',
    garden:  'no Dad. The lawn has perfect stripes. He was out here earlier.'
  };

  const SEARCH_ROOMS =B.ROOMS.filter(r => r.id !== 'hall').map(r => r.id);

  function newGame(opts = {}) {
    const seed = opts.seed !== undefined ? opts.seed : (Math.random() * 4294967296) >>> 0;
    // A new house every game (gen.js), unless asked for the classic one or to keep the current one.
    if (opts.classic) B.load(B.CLASSIC);
    else if (root.DadGen && !opts.keepLayout) root.DadGen.generate(opts.layoutSeed !== undefined ? opts.layoutSeed : (seed ^ 0x5bd1e995) >>> 0);
    const rng = mulberry32(seed);
    const dadRoom = opts.dadRoom || pick(rng, SEARCH_ROOMS);
    const dad = pick(rng, B.DAD_TILES[dadRoom]);
    const rings = opts.startRings || CONFIG.startRings;
    return {
      seed, rng, layout: B.layout,
      rings, maxRings: rings, turn: 1,
      pos: B.START, dad, dadRoom,
      checked: new Set(['hall']),
      clue: null,          // [roomId, roomId] after the first sighting
      revealed: false,     // Dad's room revealed by a second sighting
      shield: false,
      momPending: false,   // MOM NEEDS YOU! rolled; waiting for the trash minigame
      unlocked: false,
      cat: null,
      phase: 'roll',       // roll | move | walking | chute | won | lost
      move: null, chaos: null, budget: 0,
      walk: null,          // { path, shieldAt, i }
      stats: { shieldsUsed: 0, chutes: 0, stuckInChute: 0, catBlocks: 0, momChores: 0 }
    };
  }

  const dadVisible = s => s.revealed || s.checked.has(s.dadRoom);

  const lockedOpenFor = s => s.unlocked;

  // Plain flood fill used for the cat's fairness check.
  function safeReach(s, extraBlock) {
    return B.bfs([s.pos], k => {
      if (k === extraBlock) return true;
      const kind = B.passKind(B.tileK(k));
      if (kind === 'floor') return false;
      if (kind === 'locked') return !s.unlocked;
      return true;
    });
  }

  function catIsFair(s, k) {
    const reach = safeReach(s, k);
    if (!reach.has(s.dad)) return false;
    for (const rid of SEARCH_ROOMS) {
      if (s.checked.has(rid)) continue;
      if (!B.roomById[rid].tiles.some(t => reach.has(t))) return false;
    }
    return true;
  }

  function placeCat(s) {
    // The cat only lands on a tile you could actually walk to this turn, so it really blocks something.
    // Use the player's own reachability (same rules: movement left, stopping at Dad, doors) so they always agree.
    const phase = s.phase;
    s.phase = 'move';
    const reach = reachable(s);
    s.phase = phase;
    const options = [];
    for (const [k, r] of reach) {
      if (r.dist > CONFIG.catRange || r.shieldAt >= 0 || k === s.dad || B.tileK(k) === 'L') continue;
      if (!catIsFair(s, k)) continue;
      // Doorways are the cat's favourite spot.
      const weight = B.tileK(k) === 'D' ? 4 : 1;
      for (let i = 0; i < weight; i++) options.push(k);
    }
    return options.length ? pick(s.rng, options) : null;
  }

  function sighting(s, ev) {
    if (dadVisible(s)) {
      s.budget += 1;
      ev.text = 'Dad yells "IS THAT JOHN MECHANIC?! DON\'T LET HIM HANG UP!" You hurry: +1 step.';
      ev.kind = 'shout';
      return;
    }
    if (!s.clue) {
      const others = SEARCH_ROOMS.filter(r => r !== s.dadRoom && !s.checked.has(r));
      if (others.length) {
        const other = pick(s.rng, others);
        s.clue = s.rng() < 0.5 ? [s.dadRoom, other] : [other, s.dadRoom];
        const names = s.clue.map(r => B.roomById[r].name);
        ev.text = `You hear Dad muttering "who left all these lights on"... from the ${names[0]} or the ${names[1]}!`;
        ev.kind = 'clue';
        return;
      }
    }
    s.revealed = true;
    ev.text = `"Back in a minute, just checking something!" Dad is in the ${B.roomById[s.dadRoom].name}.`;
    ev.kind = 'reveal';
  }

  // Start of a turn: roll both dice and resolve the Chaos die.
  function roll(s, forced = {}) {
    if (s.phase !== 'roll') return null;
    s.move = forced.move || d6(s.rng);
    s.chaos = forced.chaos || d6(s.rng);
    s.budget = s.move;
    const info = CHAOS[s.chaos];
    const ev = { type: 'chaos', chaos: s.chaos, id: info.id, title: info.title, bad: info.bad, text: '' };

    if (info.bad && s.shield) {
      s.shield = false;
      s.stats.shieldsUsed++;
      ev.blocked = true;
      ev.text = 'MEGA-BOT to the rescue! Your hero figurine saves the day. Nothing happens!';
    } else {
      switch (s.chaos) {
        case 1:
          s.cat = placeCat(s);
          if (s.cat !== null) { s.stats.catBlocks++; ev.text = 'The cat flops down in your way. Go around!'; }
          else ev.text = 'The cat yawns and wanders off.';
          break;
        case 2:
          s.budget = Math.max(0, s.move - CONFIG.legoLoss);
          ev.text = `OUCH! You step on a LEGO. -${CONFIG.legoLoss} steps.`;
          break;
        case 3:
          // Costs THIS move. The UI shows the chore (drag the bag to the bin), then resolveMom ends the turn.
          s.momPending = true;
          s.budget = 0;
          ev.text = 'Mom: "Trash. Out. NOW." You have to take the bag out. This move is gone.';
          break;
        case 4:
          s.budget += CONFIG.shortcutGain;
          ev.text = `Sock slide! You take a run-up and glide across the freshly waxed floor like a pro. +${CONFIG.shortcutGain} steps!`;
          break;
        case 5:
          sighting(s, ev);
          break;
        case 6:
          if (s.shield) { s.budget += 1; ev.text = 'MEGA-BOT is already in your pocket, cheering you on: +1 step.'; }
          else { s.shield = true; ev.text = 'You find MEGA-BOT, your hero figurine, under the sofa! He saves you from the next obstacle: a bad event, toys, or the stuck door.'; }
          break;
      }
    }
    s.phase = 'move';
    return { skipped: false, events: [ev] };
  }

  // Where can the player go this turn? Map key -> { dist, path, shieldAt, jiggle }
  // A shield lets you cross one toy tile, or the locked door, once.
  // Without a shield, the closed locked door is a possible destination (walk into it to
  // jiggle the handle) but you can't walk through it: jiggle = true on that entry.
  function reachable(s) {
    const out = new Map();
    if (s.phase !== 'move' || s.budget <= 0) return out;
    const lockedOpen = lockedOpenFor(s);
    const dist = new Map(), prev = new Map();
    const startState = s.pos * 2;
    dist.set(startState, 0);
    const q = [startState];
    for (let i = 0; i < q.length; i++) {
      const st = q[i];
      const k = st >> 1, used = st & 1;
      const d = dist.get(st);
      if (d >= s.budget) continue;
      // You stop when you reach Dad. While he's hidden, routes may cross his tile (and find him).
      if (k === s.dad && k !== s.pos && dadVisible(s)) continue;
      for (const n of B.neighbors(k)) {
        if (n === s.cat) continue;
        const kind = B.passKind(B.tileK(n));
        let nu = used, endHere = false;
        if (kind === 'block') continue;
        if (kind === 'toy' || (kind === 'locked' && !lockedOpen)) {
          if (s.shield && !used) nu = 1;
          else if (kind === 'locked') endHere = true; // jiggle the handle: the route stops at the door
          else continue;
        }
        const ns = n * 2 + nu;
        if (dist.has(ns)) continue;
        dist.set(ns, d + 1);
        prev.set(ns, st);
        if (!endHere) q.push(ns);
      }
    }
    const build = (st) => {
      const states = [];
      for (let cur = st; cur !== startState; cur = prev.get(cur)) states.push(cur);
      states.reverse();
      // The first state carrying the "shield used" bit is the tile where MEGA-BOT helps.
      return { path: states.map(x => x >> 1), shieldAt: states.findIndex(x => x & 1) };
    };
    const seen = new Set();
    for (const st of dist.keys()) {
      const k = st >> 1;
      if (k === s.pos || seen.has(k)) continue;
      seen.add(k);
      // Prefer the route that keeps the shield, except at the closed locked door,
      // where MEGA-BOT opens it for sure instead of gambling on the handle.
      const st0 = k * 2, st1 = k * 2 + 1;
      const atDoor = B.tileK(k) === 'L' && !s.unlocked;
      const use = atDoor ? (dist.has(st1) ? st1 : st0) : (dist.has(st0) ? st0 : st1);
      const { path, shieldAt } = build(use);
      const jiggle = atDoor && shieldAt !== path.length - 1;
      out.set(k, { dist: dist.get(use), path, shieldAt, jiggle });
    }
    return out;
  }

  function beginMove(s, target, reach) {
    reach = reach || reachable(s);
    const r = reach.get(target);
    if (!r) return false;
    s.walk = { path: r.path, shieldAt: r.shieldAt, i: 0 };
    s.phase = 'walking';
    return true;
  }

  // Advance one tile. Returns events for that step.
  function step(s) {
    const w = s.walk;
    if (!w || w.i >= w.path.length) return null;
    const k = w.path[w.i];
    const events = [];
    if (w.i === w.shieldAt) {
      s.shield = false;
      s.stats.shieldsUsed++;
      events.push({ type: 'shieldUsed', text: B.tileK(k) === 'T' ? 'MEGA-BOT clears a path through the toys!' : 'MEGA-BOT forces the stuck door!' });
    }
    if (B.tileK(k) === 'L' && !s.unlocked) {
      if (w.i === w.shieldAt) {
        s.unlocked = true;
        events.push({ type: 'unlock', text: 'MEGA-BOT pops the lock. The door stays open for good!' });
      } else {
        // Jiggle the handle: the door die decides. This is always the last tile of the route.
        s.stats.jiggles = (s.stats.jiggles || 0) + 1;
        const roll = d6(s.rng);
        s.walk = null;
        if (roll >= CONFIG.doorOpenOn) {
          s.unlocked = true;
          s.pos = k;
          events.push({ type: 'doorOpen', roll, text: 'Click! The stuck door finally gives way. It stays open for good!' });
          endTurn(s);
        } else {
          s.stats.doorJams = (s.stats.doorJams || 0) + 1;
          s.rings -= CONFIG.doorJamRings;
          events.push({ type: 'doorJammed', roll, from: k,
            text: `Jammed! Dad bellows from somewhere: "WHO'S RATTLING THAT DOOR?! It sticks, I'll fix it Saturday!" -${CONFIG.doorJamRings} ring.` });
          if (s.rings <= 0) { s.rings = 0; s.phase = 'lost'; } else endTurn(s);
        }
        return { events, done: true };
      }
    }
    s.pos = k;
    w.i++;
    const rid = B.roomAt(k);
    if (rid && !s.checked.has(rid)) {
      s.checked.add(rid);
      const here = rid === s.dadRoom;
      events.push({ type: 'room', room: rid, dadHere: here,
        text: here ? `Found him! Dad is in the ${B.roomById[rid].name}.` : `${B.roomById[rid].name}: ${EMPTY_ROOM[rid] || 'no Dad here.'}` });
    }
    if (k === s.dad) {
      s.phase = 'won';
      s.walk = null;
      events.push({ type: 'won' });
      return { events, done: true };
    }
    const done = w.i >= w.path.length;
    if (done) {
      s.walk = null;
      if (k === B.CHUTES[0] || k === B.CHUTES[1]) s.phase = 'chute';
      else endTurn(s);
    }
    return { events, done };
  }

  // Staying put never triggers the chute: if you started the turn on it, the slide was
  // offered before you rolled (canSlideNow). The post-move prompt is only for walking onto it.
  function stay(s) {
    if (s.phase !== 'move' || s.momPending) return;
    endTurn(s);
  }

  const onChute = s => s.pos === B.CHUTES[0] || s.pos === B.CHUTES[1];
  // At the start of a turn you may slide instead of rolling (e.g. to retry after getting stuck).
  const canSlideNow = s => s.phase === 'roll' && onChute(s);

  // Mom's chore is done: the move was spent on it, so the turn ends.
  function resolveMom(s) {
    if (!s.momPending) return null;
    s.momPending = false;
    s.stats.momChores++;
    s.budget = 0;
    endTurn(s);
    return { type: 'momDone', text: 'Trash taken out. Mom: "Thank you, sweetie." ...but this move is gone.' };
  }

  // Risky shortcut. After a move: take=false just ends the turn.
  // At the start of a turn: take=true uses the whole turn, take=false does nothing (roll instead).
  function chute(s, take) {
    if (s.phase === 'roll') {
      if (!take || !canSlideNow(s)) return null;
      s.phase = 'chute';
    }
    if (s.phase !== 'chute') return null;
    let ev = null;
    if (take) {
      s.stats.chutes++;
      const r = d6(s.rng);
      if (r <= CONFIG.chuteStuckOn) {
        s.stats.stuckInChute++;
        s.rings -= 1;
        ev = { type: 'chuteStuck', roll: r, text: 'Bad luck! You get wedged between Dad\'s work shirts halfway down the chute. -1 ring.' };
        if (s.rings <= 0) { s.rings = 0; s.phase = 'lost'; return ev; }
      } else {
        s.pos = s.pos === B.CHUTES[0] ? B.CHUTES[1] : B.CHUTES[0];
        const rid = B.roomAt(s.pos);
        ev = { type: 'chute', roll: r, text: `WHEEE! You shoot out in the ${B.roomById[rid].name}.` };
        if (rid && !s.checked.has(rid)) {
          s.checked.add(rid);
          if (rid === s.dadRoom) ev.text += ' Dad is here!';
        }
      }
    }
    endTurn(s);
    return ev;
  }

  function endTurn(s) {
    s.cat = null;
    s.move = null; s.chaos = null; s.budget = 0;
    s.rings -= 1;
    if (s.rings <= 0) { s.rings = 0; s.phase = 'lost'; return; }
    s.turn++;
    s.phase = 'roll';
  }

  // ---------- Bot + simulator ----------
  function botTargets(s) {
    if (dadVisible(s)) return [s.dad];
    let rooms = SEARCH_ROOMS.filter(r => !s.checked.has(r));
    if (s.clue) rooms = s.clue.filter(r => !s.checked.has(r));
    const t = [];
    for (const r of rooms) for (const k of B.roomById[r].tiles) if (B.passKind(B.tileK(k)) === 'floor') t.push(k);
    return t;
  }

  function botField(s, doorOpen) {
    return B.bfs(botTargets(s), k => {
      const kind = B.passKind(B.tileK(k));
      if (kind === 'floor') return false;
      if (kind === 'locked') return !(s.unlocked || doorOpen);
      return true;
    });
  }

  function botMove(s) {
    const field = botField(s);
    const reach = reachable(s);
    const here = field.has(s.pos) ? field.get(s.pos) : Infinity;
    // Gamble on the locked door when opening it would save a lot of walking.
    if (!s.unlocked) {
      const open = botField(s, true);
      const viaDoor = open.has(s.pos) ? open.get(s.pos) : Infinity;
      for (const [k, r] of reach) {
        if (r.jiggle && viaDoor + 4 < here && !(dadVisible(s) && reach.has(s.dad))) return { best: k, reachSize: reach.size, reach };
      }
    }
    let best = null, bestScore = here;
    for (const [k, r] of reach) {
      if (r.jiggle) continue;
      if (k === s.dad && dadVisible(s)) { best = k; break; }
      const f = field.has(k) ? field.get(k) : Infinity;
      const score = f + (r.shieldAt >= 0 ? 0.5 : 0) + r.dist * 0.001;
      if (score < bestScore) { bestScore = score; best = k; }
    }
    return { best, reachSize: reach.size, reach };
  }

  function botChute(s) {
    const field = botField(s);
    const other = s.pos === B.CHUTES[0] ? B.CHUTES[1] : B.CHUTES[0];
    const a = field.get(s.pos), b = field.get(other);
    return a !== undefined && b !== undefined && b + 4 < a;
  }

  function playBotGame(opts) {
    const s = newGame(opts);
    let stuckTurns = 0, guard = 0;
    while (s.phase !== 'won' && s.phase !== 'lost' && guard++ < 500) {
      if (s.phase === 'roll') {
        if (canSlideNow(s) && botChute(s)) { chute(s, true); continue; }
        roll(s);
        if (s.momPending) resolveMom(s);
        continue;
      }
      if (s.phase === 'move') {
        const { best, reachSize, reach } = botMove(s);
        if (s.budget > 0 && reachSize === 0) stuckTurns++;
        if (best === null) { stay(s); continue; }
        beginMove(s, best, reach);
        while (s.phase === 'walking') step(s);
        continue;
      }
      if (s.phase === 'chute') { chute(s, botChute(s)); continue; }
    }
    return { s, stuckTurns };
  }

  function simulate(n = 1000, opts = {}) {
    const base = opts.seed !== undefined ? opts.seed : 12345;
    let wins = 0, turnsOnWin = 0, stuck = 0, shieldGames = 0, shieldWins = 0, noShieldGames = 0, noShieldWins = 0;
    const byRoom = {};
    for (let i = 0; i < n; i++) {
      const { s, stuckTurns } = playBotGame(Object.assign({}, opts, { seed: base + i }));
      const won = s.phase === 'won';
      stuck += stuckTurns;
      if (won) { wins++; turnsOnWin += s.turn; }
      if (s.stats.shieldsUsed > 0) { shieldGames++; if (won) shieldWins++; }
      else { noShieldGames++; if (won) noShieldWins++; }
      const r = byRoom[s.dadRoom] || (byRoom[s.dadRoom] = { games: 0, wins: 0 });
      r.games++; if (won) r.wins++;
    }
    const pct = (a, b) => b ? Math.round((a / b) * 1000) / 10 : 0;
    const res = {
      games: n,
      startRings: opts.startRings || CONFIG.startRings,
      winRate: pct(wins, n),
      avgTurnsWhenWon: wins ? Math.round((turnsOnWin / wins) * 10) / 10 : 0,
      stuckTurns: stuck,
      winRateUsedShield: pct(shieldWins, shieldGames),
      winRateNoShield: pct(noShieldWins, noShieldGames),
      byRoom: Object.fromEntries(Object.entries(byRoom).map(([k, v]) => [k, pct(v.wins, v.games)]))
    };
    return res;
  }

  root.DadGame = {
    CONFIG, CHAOS, newGame, roll, reachable, beginMove, step, stay, chute, endTurn,
    dadVisible, canSlideNow, resolveMom, simulate, playBotGame, SEARCH_ROOMS
  };
  root.simulate = simulate;
})(typeof window !== 'undefined' ? window : globalThis);
