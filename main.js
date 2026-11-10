/* DADLINE — UI controller: input, turn flow, animations, HUD. */
(function () {
  'use strict';
  const B = window.DadBoard, G = window.DadGame, SP = window.DadSprites, A = window.DadAudio;
  const T = B.TILE;
  const $ = id => document.getElementById(id);

  const DEBUG = /[?&]debug\b/.test(location.search);
  const board = $('board');
  const R = new window.DadRender.Renderer(board);

  let state = null;
  let reach = new Map();
  let hover = -1;
  let busy = false;
  let started = false;
  const view = { state: null, reach, hover: -1, childX: 0, childY: 0, childAlpha: undefined };

  // ---------- Board check (map must never soft-lock the player) ----------
  const check = B.validateBoard();
  if (!check.ok) {
    console.error('DADLINE board check failed:', check.errors);
    $('hint').textContent = 'Board error: ' + check.errors[0];
  }
  if (DEBUG) {
    console.log('validateBoard()', check);
    console.table(check.toyReport);
    $('debug').classList.remove('hidden');
  }

  // ---------- Helpers ----------
  const wait = ms => new Promise(r => setTimeout(r, ms));
  function tween(ms, fn) {
    return new Promise(resolve => {
      const t0 = performance.now();
      (function frame() {
        const t = Math.min(1, (performance.now() - t0) / ms);
        fn(t);
        if (t < 1) requestAnimationFrame(frame); else resolve();
      })();
    });
  }
  function placeChild(k) { view.childX = B.kx(k) * T; view.childY = B.ky(k) * T; }

  function log(text) {
    if (!text) return;
    const li = document.createElement('li');
    li.textContent = text;
    const ul = $('log');
    ul.prepend(li);
    while (ul.children.length > 6) ul.lastChild.remove();
  }

  function drawDieCanvas(canvas, value, kind) {
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, 16, 16);
    SP.drawDie(g, 0, 0, value, kind);
  }

  // ---------- Event card ----------
  let cardResolve = null, cardTimer = null;
  function showCard(icon, title, text, tone, ms) {
    const card = $('eventCard');
    const g = $('eventIcon').getContext('2d');
    g.clearRect(0, 0, 16, 16);
    if (icon) SP.drawDie(g, 0, 0, icon.value, icon.kind);
    $('eventTitle').textContent = title;
    $('eventText').textContent = text;
    card.className = 'event-card ' + (tone || '');
    clearTimeout(cardTimer); // a previous card's timer must not close this one
    return new Promise(resolve => {
      cardResolve = resolve;
      if (ms !== Infinity) cardTimer = setTimeout(hideCard, ms || 2600);
    });
  }
  function hideCard() {
    clearTimeout(cardTimer);
    $('eventCard').classList.add('hidden');
    if (cardResolve) { const r = cardResolve; cardResolve = null; r(); }
  }

  // Chute "quick time event": the chute die tumbles on the card, then lands on the result.
  // Purely an animation; the outcome was already decided by the rules.
  function chuteRollCard(ev) {
    const stuck = ev.type === 'chuteStuck';
    return dieRollCard({
      title: 'SLIDING DOWN THE CHUTE...', legend: '1–2 = STUCK  ·  3–6 = WHEEE!', roll: ev.roll, good: !stuck,
      result: stuck ? `ROLLED ${ev.roll}: STUCK!` : `ROLLED ${ev.roll}: WHEEE!`, text: ev.text, sfx: stuck ? 'stuck' : 'chute'
    });
  }
  function doorRollCard(ev) {
    const open = ev.type === 'doorOpen';
    return dieRollCard({
      title: 'JIGGLING THE HANDLE...', legend: `1–${G.CONFIG.doorOpenOn - 1} = JAMMED (−${G.CONFIG.doorJamRings} ring)  ·  ${G.CONFIG.doorOpenOn}–6 = IT OPENS!`,
      roll: ev.roll, good: open,
      result: open ? `ROLLED ${ev.roll}: IT OPENS!` : `ROLLED ${ev.roll}: JAMMED!`, text: ev.text, sfx: open ? 'unlock' : 'stuck'
    });
  }
  // Shared "quick time event" die: tumbles on the card, then lands on the (already decided) result.
  async function dieRollCard(o) {
    const icon = $('eventIcon'), g = icon.getContext('2d');
    const closed = showCard({ value: 0, kind: 'move' }, o.title, o.legend, 'blocked', Infinity);
    A.sfx('dice');
    icon.classList.add('tumble');
    const t0 = performance.now();
    while (performance.now() - t0 < 1000 && cardResolve) {
      g.clearRect(0, 0, 16, 16);
      SP.drawDie(g, 0, 0, 1 + Math.floor(Math.random() * 6), 'move');
      await wait(70);
    }
    icon.classList.remove('tumble');
    if (!cardResolve) return; // player clicked the card away: skip straight to the result
    g.clearRect(0, 0, 16, 16);
    SP.drawDie(g, 0, 0, o.roll, 'move');
    $('eventCard').className = 'event-card ' + (o.good ? 'good' : 'bad');
    $('eventTitle').textContent = o.result;
    $('eventText').textContent = o.text;
    A.sfx(o.sfx);
    if (!o.good) R.shake(400);
    cardTimer = setTimeout(hideCard, 1800);
    await closed;
  }
  $('eventCard').addEventListener('click', hideCard);

  // ---------- HUD ----------
  function updateHUD() {
    const s = state;
    $('rings').textContent = s.rings;
    const bar = $('ringBar');
    bar.innerHTML = '';
    for (let i = 0; i < s.maxRings; i++) {
      const pip = document.createElement('i');
      if (i >= s.rings) pip.className = 'off';
      bar.appendChild(pip);
    }
    const phone = $('phone');
    const over = s.phase === 'won' || s.phase === 'lost';
    phone.classList.toggle('quiet', over);
    phone.classList.toggle('low', !over && s.rings <= 3);
    phone.style.setProperty('--ring-speed', (0.25 + 0.45 * (s.rings / s.maxRings)).toFixed(2) + 's');
    A.setUrgency(1 - s.rings / s.maxRings);

    // Steps line
    const st = $('steps');
    if (s.phase === 'move') {
      const unit = s.budget === 1 ? ' STEP' : ' STEPS';
      st.innerHTML = s.budget !== s.move
        ? `MOVE <b>${s.move}</b> &rarr; <b>${s.budget}</b>${unit}`
        : `MOVE <b>${s.move}</b>${unit}`;
    } else {
      st.innerHTML = `TURN <b>${s.turn}</b>`;
    }

    const canRoll = s.phase === 'roll' && !busy;
    $('rollBtn').disabled = !canRoll;
    $('stayBtn').disabled = !(s.phase === 'move' && !busy);
    // The chute is offered after ending a move on it, and also at the start of a turn
    // while standing on it (so you can retry after getting stuck).
    const slideAtStart = G.canSlideNow(s);
    $('chutePrompt').classList.toggle('hidden', !(s.phase === 'chute' || slideAtStart) || busy);
    $('chuteNo').classList.toggle('hidden', slideAtStart);
    $('chuteText').textContent = slideAtStart
      ? 'You are on the laundry chute. Slide down instead of rolling (uses your turn)? Risky: 1 in 3 chance you get stuck (−1 ring).'
      : 'Slide down the laundry chute? Risky: 1 in 3 chance you get stuck (−1 ring).';
    board.classList.toggle('can-move', s.phase === 'move' && reach.size > 0 && !busy);

    // Status
    const here = B.roomAt(s.pos);
    const dadVis = G.dadVisible(s);
    const rows = [];
    rows.push(['YOU ARE IN', here ? B.roomById[here].name : 'a doorway']);
    rows.push(['DAD IS', dadVis ? `<span class="gold">${B.roomById[s.dadRoom].name}</span>`
      : s.clue ? `<span class="clue">${s.clue.filter(r => !s.checked.has(r)).map(r => B.roomById[r].name).join(' or ') || '???'}</span>` : '???']);
    rows.push(['ROOMS SEARCHED', `${G.SEARCH_ROOMS.filter(r => s.checked.has(r)).length} / ${G.SEARCH_ROOMS.length}`]);
    rows.push(['MEGA-BOT', s.shield ? '<span class="gold">READY TO HELP</span>' : '&ndash;']);
    if (s.unlocked) rows.push(['LOCKED DOOR', 'open']);
    $('status').innerHTML = rows.map(([k, v]) => `<div class="row"><span class="k">${k}</span><span>${v}</span></div>`).join('');

    // Hint
    const hint = $('hint');
    if (s.phase === 'roll') hint.textContent = slideAtStart ?'Roll the dice (Space), or try the chute again (Y).' : 'Roll the dice (Space).';
    else if (s.phase === 'move') {
      const door = [...reach.values()].some(r => r.jiggle);
      hint.textContent = !reach.size ? (s.budget <= 0 ? 'No steps left this turn. Press STAY.' : 'No way through this turn. Press STAY.')
        : door ? `Click a glowing tile, or the ORANGE door to jiggle the handle (opens on ${G.CONFIG.doorOpenOn}–6, jammed = −${G.CONFIG.doorJamRings} ring).`
        : 'Click a glowing tile to walk there, or STAY.';
    }
    else if (s.phase === 'chute') hint.textContent = 'You are on the laundry chute. Slide down?';
    else if (s.phase === 'walking') hint.textContent = '';
  }

  function buildLegend() {
    const ul = $('legend');
    const texts = {
      1: 'The cat blocks a tile near you. Go around.',
      2: `Lose ${G.CONFIG.legoLoss} steps.`,
      3: 'Take the trash out for Mom. You lose this move.',
      4: `Sock slide across the waxed floor: +${G.CONFIG.shortcutGain} steps.`,
      5: 'A clue (2 rooms), then Dad\'s room.',
      6: 'Find MEGA-BOT, your hero figurine: he saves you from one obstacle.'
    };
    for (let i = 1; i <= 6; i++) {
      const li = document.createElement('li');
      const c = document.createElement('canvas');
      c.width = c.height = 16;
      SP.drawDie(c.getContext('2d'), 0, 0, i, 'chaos');
      li.appendChild(c);
      const d = document.createElement('div');
      d.innerHTML = `<b>${i} ${G.CHAOS[i].title}</b>${texts[i]}`;
      li.appendChild(d);
      ul.appendChild(li);
    }
  }

  // ---------- Game flow ----------
  function newGame() {
    // New house every game. ?classic keeps the hand-made house; ?layout=123 replays a specific one.
    const params = new URLSearchParams(location.search);
    const opts = {};
    if (params.has('classic')) opts.classic = true;
    if (params.get('layout')) opts.layoutSeed = +params.get('layout');
    state = G.newGame(opts);
    R.rebuild();
    if (DEBUG) console.log('House layout:', B.layout.name, 'seed', B.layout.seed);
    view.state = state;
    view.mask = null;
    reach = new Map(); view.reach = reach;
    busy = false;
    placeChild(state.pos);
    view.childAlpha = undefined;
    $('log').innerHTML = '';
    drawDieCanvas($('dieMove'), 0, 'move');
    drawDieCanvas($('dieChaos'), 0, 'chaos');
    log('RING RING! Caller ID: JOHN MECHANIC. Find Dad!');
    updateHUD();
    if (DEBUG) window.dbg = { state, G, B };
  }

  const EVENT_SFX = { cat: 'cat', lego: 'lego', mom: 'mom', shortcut: 'shortcut', sighting: 'sighting', luck: 'luck' };

  async function doRoll() {
    if (busy || !state || state.phase !== 'roll') return;
    busy = true;
    updateHUD();

    const forced = {};
    if (DEBUG) {
      if ($('dbgMove').value) forced.move = +$('dbgMove').value;
      if ($('dbgChaos').value) forced.chaos = +$('dbgChaos').value;
    }
    // Freeze how the map looks right now: the rules resolve instantly, but the board should only
    // change after the Chaos card has explained what happened.
    view.mask = { clue: state.clue, revealed: state.revealed, shield: state.shield, dadVis: G.dadVisible(state) };
    const res = G.roll(state, forced);

    // Tumble the dice
    A.sfx('dice');
    const dm = $('dieMove'), dc = $('dieChaos');
    dm.classList.add('tumble'); dc.classList.add('tumble');
    const t0 = performance.now();
    while (performance.now() - t0 < 650) {
      drawDieCanvas(dm, 1 + Math.floor(Math.random() * 6), 'move');
      drawDieCanvas(dc, 1 + Math.floor(Math.random() * 6), 'chaos');
      await wait(70);
    }
    dm.classList.remove('tumble'); dc.classList.remove('tumble');
    drawDieCanvas(dm, state.move, 'move');
    drawDieCanvas(dc, state.chaos, 'chaos');

    const ev = res.events[0];
    log(`Move ${state.move} · ${ev.blocked ? '(' + ev.title + ' blocked) ' : ev.title + ' '}${ev.text}`);
    if (ev.blocked) A.sfx('blocked'); else A.sfx(EVENT_SFX[ev.id]);
    const tone = ev.blocked ? 'blocked' : ev.bad ? 'bad' : 'good';

    // 1) Explain first...
    await showCard({ value: state.chaos, kind: 'chaos' }, ev.blocked ? 'MEGA-BOT SAVES THE DAY!' : ev.title, ev.text, tone);

    // 2) ...then let it happen on the map: cat appears, clue rooms light up, charm aura, numbers float.
    view.mask = null;
    if (ev.bad && !ev.blocked && ev.id !== 'mom') R.shake(350);
    if (ev.id === 'cat' && !ev.blocked && state.cat !== null) R.float('!', state.cat, '#ff8a73');
    if (ev.id === 'lego' && !ev.blocked) R.float('-' + G.CONFIG.legoLoss, state.pos, '#ff8a73');
    if (ev.id === 'shortcut') R.float('+' + G.CONFIG.shortcutGain, state.pos, '#9bd46a');
    if (ev.id === 'luck') R.float('HERO!', state.pos, '#f5c542');
    if (ev.id === 'sighting') A.sfx('room');
    updateHUD();
    if (!state.momPending) { await wait(250); reach = G.reachable(state); view.reach = reach; }

    // MOM NEEDS YOU!: the move is spent on her chore. Show it (drag the bag to the bin), then end the turn.
    if (state.momPending) {
      await window.DadMinigame.play({ sfx: A.sfx });
      log(G.resolveMom(state).text);
      R.float('-move', state.pos, '#ff8a73');
      busy = false;
      afterTurnEnd();
      return;
    }

    busy = false;
    updateHUD();
  }

  async function walkTo(k) {
    if (busy || state.phase !== 'move' || !reach.has(k)) return;
    busy = true;
    A.sfx('click');
    G.beginMove(state, k, reach);
    reach = new Map(); view.reach = reach; hover = -1; view.hover = -1;
    updateHUD();

    while (state.phase === 'walking') {
      const fromX = view.childX, fromY = view.childY;
      const w = state.walk;
      const next = w.path[w.i];
      const jiggling = B.tileK(next) === 'L' && !state.unlocked && w.shieldAt !== w.i;
      // Keep the door drawn shut (and the cat where it is) until the door die has been shown.
      if (jiggling) view.mask = { clue: state.clue, revealed: state.revealed, shield: state.shield, dadVis: G.dadVisible(state), unlocked: false, cat: state.cat };
      const r = G.step(state);
      const doorEv = r.events.find(e => e.type === 'doorOpen' || e.type === 'doorJammed');
      if (doorEv) {
        // Lean into the door, rattle, roll the door die, then walk through or bounce back.
        const dx = B.kx(next) * T, dy = B.ky(next) * T;
        A.sfx('unlock');
        await tween(140, t => { view.childX = fromX + (dx - fromX) * 0.4 * t; view.childY = fromY + (dy - fromY) * 0.4 * t; });
        await tween(140, t => { view.childX = fromX + (dx - fromX) * 0.4 * (1 - t); view.childY = fromY + (dy - fromY) * 0.4 * (1 - t); });
        await doorRollCard(doorEv);
        view.mask = null;
        log(`Door die: ${doorEv.roll}. ${doorEv.text}`);
        if (doorEv.type === 'doorOpen') {
          await tween(160, t => { view.childX = fromX + (dx - fromX) * t; view.childY = fromY + (dy - fromY) * t; });
        } else {
          R.float('-' + G.CONFIG.doorJamRings, state.pos, '#ff8a73');
        }
        updateHUD();
        break;
      }
      view.mask = null;
      const toX = B.kx(state.pos) * T, toY = B.ky(state.pos) * T;
      A.sfx('step');
      await tween(130, t => { view.childX = fromX + (toX - fromX) * t; view.childY = fromY + (toY - fromY) * t; });
      for (const ev of r.events) {
        if (ev.type === 'won') continue;
        log(ev.text);
        if (ev.type === 'room') { A.sfx(ev.dadHere ? 'found' : 'room'); if (ev.dadHere) R.float('!', state.dad, '#9bd46a'); }
        if (ev.type === 'unlock') A.sfx('unlock');
        if (ev.type === 'shieldUsed') { A.sfx('blocked'); R.float('HERO!', state.pos, '#f5c542'); }
      }
      updateHUD();
    }
    placeChild(state.pos);

    if (state.phase === 'won') { busy = false; return endGame(true); }
    busy = false;
    if (state.phase === 'chute') { updateHUD(); return; }
    afterTurnEnd();
  }

  function doStay() {
    if (busy || state.phase !== 'move') return;
    A.sfx('click');
    const noSteps = state.budget <= 0;
    G.stay(state);
    reach = new Map(); view.reach = reach;
    log(noSteps ? 'You rub your sore foot and wait it out.' : 'You catch your breath.');
    afterTurnEnd();
  }

  async function doChute(take) {
    if (busy) return;
    if (state.phase !== 'chute' && !(take && G.canSlideNow(state))) return;
    busy = true;
    updateHUD();
    const from = state.pos;
    const ev = G.chute(state, take);
    if (take && ev) {
      await chuteRollCard(ev);
      log(`Chute die: ${ev.roll}. ${ev.text}`);
      if (ev.type === 'chuteStuck') {
        R.float('-1', from, '#ff8a73');
      } else {
        await tween(300, t => { view.childAlpha = 1 - t; });
        placeChild(state.pos);
        await tween(300, t => { view.childAlpha = t; });
        view.childAlpha = undefined;
        const rid = B.roomAt(state.pos);
        if (rid === state.dadRoom) A.sfx('found');
      }
    }
    busy = false;
    afterTurnEnd();
  }

  function afterTurnEnd() {
    reach = new Map(); view.reach = reach;
    const phone = $('phone');
    phone.classList.remove('bump'); void phone.offsetWidth; phone.classList.add('bump');
    setTimeout(() => phone.classList.remove('bump'), 450);
    if (state.phase === 'lost') { updateHUD(); return endGame(false); }
    A.sfx('tick');
    R.float('-1 ring', state.pos, '#f5c542');
    updateHUD();
  }

  function endGame(won) {
    A.stopRing();
    A.sfx(won ? 'win' : 'lose');
    updateHUD();
    const art = $('endArt').getContext('2d');
    art.clearRect(0, 0, 48, 24);
    art.imageSmoothingEnabled = false;
    if (won) {
      art.drawImage(SP.sprite('child'), 10, 8);
      art.drawImage(SP.sprite('dad'), 26, 7);
      art.drawImage(SP.sprite('thumb'), 36, 0);
    } else {
      art.drawImage(SP.sprite('child'), 18, 8);
      art.drawImage(SP.sprite('question'), 8, 10);
      art.drawImage(SP.sprite('question'), 35, 10);
    }
    const where = B.roomById[state.dadRoom].name;
    $('endTitle').innerHTML = won ? 'PHONE <span>DELIVERED!</span>' : 'CALL <span>MISSED</span>';
    $('endText').textContent = won
      ? `Dad grabs the phone with ${state.rings} ring${state.rings === 1 ? '' : 's'} to spare. "JOHN! How's she running? ...The whole timing belt? Right. Right. And what's that gonna set me back?" Delivered on turn ${state.turn}.`
      : `The ringing stops. Dad was in the ${where} the whole time. "Was that John Mechanic? ...Who touched the thermostat?"`;
    setTimeout(() => {
      $('endScreen').classList.remove('hidden');
      $('againBtn').focus();
    }, won ? 900 : 1200);
  }

  // ---------- Input ----------
  $('rollBtn').addEventListener('click', doRoll);
  $('stayBtn').addEventListener('click', doStay);
  $('chuteYes').addEventListener('click', () => doChute(true));
  $('chuteNo').addEventListener('click', () => doChute(false));

  board.addEventListener('pointermove', e => {
    const k = R.tileAtClient(e.clientX, e.clientY);
    hover = reach.has(k) ? k : -1;
    view.hover = hover;
  });
  board.addEventListener('pointerleave', () => { hover = -1; view.hover = -1; });
  board.addEventListener('click', e => {
    if (!started) return;
    const k = R.tileAtClient(e.clientX, e.clientY);
    if (reach.has(k)) walkTo(k);
  });

  document.addEventListener('keydown', e => {
    if (!started) return;
    if (e.target.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (!$('endScreen').classList.contains('hidden') || !$('helpScreen').classList.contains('hidden')) return;
    if (k === ' ' || k === 'r') {
      e.preventDefault();
      if (cardResolve) hideCard(); else doRoll();
    } else if (k === 'enter' || k === 's') {
      if (e.target.tagName === 'BUTTON' && k === 'enter') return;
      e.preventDefault();
      if (cardResolve) hideCard(); else doStay();
    } else if (k === 'y') doChute(true);
    else if (k === 'n') doChute(false);
    else if (k === 'm') toggleMute();
    else if (k === 'escape' && cardResolve) hideCard();
  });

  function toggleMute() {
    A.init();
    A.setMuted(!A.isMuted());
    $('muteBtn').classList.toggle('off', A.isMuted());
  }
  $('muteBtn').classList.toggle('off', A.isMuted());
  $('muteBtn').addEventListener('click', toggleMute);

  $('helpBtn').addEventListener('click', () => $('helpScreen').classList.remove('hidden'));
  $('helpClose').addEventListener('click', () => $('helpScreen').classList.add('hidden'));

  $('startBtn').addEventListener('click', () => {
    $('startScreen').classList.add('hidden');
    started = true;
    A.init();
    A.startRing();
    $('rollBtn').focus();
  });
  $('againBtn').addEventListener('click', () => {
    $('endScreen').classList.add('hidden');
    newGame();
    A.startRing();
    $('rollBtn').focus();
  });

  // ---------- Layout & loop ----------
  function fit() {
    const wrap = $('boardWrap');
    const w = wrap.clientWidth - 8;
    const maxH = window.innerWidth > 860 ? window.innerHeight - 150 : null;
    R.resize(w, maxH);
    if (state) R.draw(view, performance.now());
  }
  new ResizeObserver(fit).observe($('boardWrap'));
  window.addEventListener('resize', fit);

  function frame(now) {
    if (state) R.draw(view, now);
    requestAnimationFrame(frame);
  }

  buildLegend();
  newGame();
  fit();
  requestAnimationFrame(frame);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
})();
