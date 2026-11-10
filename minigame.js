/* DADLINE — "Mom needs you" chore.
   Not a skill test: it just shows WHY the move is lost. Drag the trash bag into the bin
   (or press Space/Enter and the kid carries it over). Resolves when the bag is in. */
(function (root) {
  'use strict';
  const SP = root.DadSprites;

  const NW = 192, NH = 80;
  const BIN_R = 11;            // drop the bag this close to the bin's centre

  function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

  function drawScene(g, st, now) {
    // House siding + window
    rect(g, 0, 0, NW, 30, '#6a5584');
    g.fillStyle = '#5b4777';
    for (let y = 4; y < 30; y += 5) g.fillRect(0, y, NW, 1);
    rect(g, 18, 5, 22, 16, '#2b2140'); rect(g, 20, 7, 18, 12, '#f5c542'); rect(g, 28, 7, 2, 12, '#2b2140');
    // Driveway + grass
    rect(g, 0, 30, NW, 30, '#8a8f99');
    g.fillStyle = '#767b85';
    for (let x = 0; x < NW; x += 24) g.fillRect(x, 30, 1, 30);
    rect(g, 0, 30, NW, 2, '#5c606a');
    rect(g, 0, 60, NW, NH - 60, '#4c8a3c');
    g.fillStyle = '#5c9a40';
    for (let i = 0; i < 40; i++) g.fillRect((i * 37) % NW, 62 + (i * 13) % 16, 1, 2);

    // Bin (lid flips open once the bag is in)
    const bx = st.binX, by = st.binY;
    const glow = !st.done && st.dragging && Math.hypot(st.bagX - bx, st.bagY - by) <= BIN_R;
    rect(g, bx - 7, by - 8, 14, 16, glow ? '#f5c542' : '#2b2140');
    rect(g, bx - 6, by - 7, 12, 14, '#7c8a96');
    g.fillStyle = '#5f6b76';
    for (let i = 0; i < 3; i++) g.fillRect(bx - 4 + i * 4, by - 5, 1, 11);
    if (st.done) { rect(g, bx - 8, by - 16, 3, 8, '#2b2140'); rect(g, bx - 7, by - 15, 1, 6, '#9aa6b2'); }
    else { rect(g, bx - 8, by - 11, 16, 3, '#2b2140'); rect(g, bx - 7, by - 10, 14, 1, '#9aa6b2'); }
    if (!st.done) {
      // bouncing arrow over the bin
      const ay = by - 20 - (Math.floor(now / 250) % 2) * 2;
      rect(g, bx - 1, ay - 4, 2, 4, '#ffffff'); rect(g, bx - 3, ay, 6, 1, '#ffffff'); rect(g, bx - 2, ay + 1, 4, 1, '#ffffff'); rect(g, bx - 1, ay + 2, 2, 1, '#ffffff');
    }

    // Mom watching, arms crossed
    const mx = st.momX, my = 14 + (Math.floor(now / 600) % 2);
    g.drawImage(SP.sprite('mom'), mx, my);
    const bubble = st.done ? '<3' : '...';
    rect(g, mx + 10, my - 9, 15, 9, '#ffffff'); rect(g, mx + 11, my, 2, 2, '#ffffff');
    g.fillStyle = '#2b2140';
    g.font = '6px "Press Start 2P", monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(bubble, mx + 18, my - 4);

    // Kid
    g.drawImage(SP.sprite('child'), 6, 38);

    // Bag (follows the pointer while dragged)
    if (!st.done) {
      const lift = st.dragging ? 2 : 0;
      if (st.dragging) rect(g, Math.round(st.bagX) - 3, Math.round(st.bagY) + 4, 7, 2, 'rgba(0,0,0,0.3)');
      g.drawImage(SP.sprite('bag'), Math.round(st.bagX - 4), Math.round(st.bagY - 4 - lift));
    }
  }

  function play(opts = {}) {
    const overlay = document.getElementById('momGame');
    const canvas = document.getElementById('momCanvas');
    const say = document.getElementById('momSay');
    const hint = document.getElementById('momHint');
    const g = canvas.getContext('2d');
    canvas.width = NW; canvas.height = NH;
    g.imageSmoothingEnabled = false;
    const sfx = opts.sfx || (() => {});

    const binX = 100 + Math.floor(Math.random() * 70);   // the bin is somewhere different each time
    const binY = 40 + Math.floor(Math.random() * 14);
    const momX = binX > 150 ? binX - 26 : binX + 12;
    const st = { bagX: 26, bagY: 50, binX, binY, momX, dragging: false, done: false, grabDX: 0, grabDY: 0 };

    say.textContent = '"Take this out to the bin. NOW, please."';
    hint.textContent = 'Drag the bag into the bin (or press SPACE)';
    overlay.classList.remove('hidden');

    return new Promise(resolve => {
      const toNative = e => {
        const r = canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) / r.width * NW, y: (e.clientY - r.top) / r.height * NH };
      };
      function complete() {
        if (st.done) return;
        st.done = true; st.dragging = false;
        sfx('clank');
        say.textContent = '"Thank you, sweetie." ...but that took your whole move.';
        hint.textContent = '';
        cleanup();
        setTimeout(() => { overlay.classList.add('hidden'); resolve(); }, 1300);
      }
      // Keyboard / no-drag fallback: the kid carries the bag over.
      function autoCarry() {
        if (st.done || st.carrying) return;
        st.carrying = true;
        const fx = st.bagX, fy = st.bagY, t0 = performance.now();
        sfx('whoosh');
        (function step() {
          const t = Math.min(1, (performance.now() - t0) / 500);
          st.bagX = fx + (binX - fx) * t; st.bagY = fy + (binY - fy) * t - Math.sin(t * Math.PI) * 10;
          if (t < 1) requestAnimationFrame(step); else complete();
        })();
      }
      const onDown = e => {
        if (st.done) return;
        const p = toNative(e);
        if (Math.abs(p.x - st.bagX) > 10 || Math.abs(p.y - st.bagY) > 10) return;
        st.dragging = true; st.grabDX = st.bagX - p.x; st.grabDY = st.bagY - p.y;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
        e.preventDefault();
      };
      const onMove = e => {
        const p = toNative(e);
        canvas.style.cursor = st.dragging ? 'grabbing' : (Math.abs(p.x - st.bagX) <= 10 && Math.abs(p.y - st.bagY) <= 10 ? 'grab' : 'default');
        if (!st.dragging) return;
        st.bagX = Math.max(4, Math.min(NW - 4, p.x + st.grabDX));
        st.bagY = Math.max(8, Math.min(NH - 4, p.y + st.grabDY));
      };
      const onUp = () => {
        if (!st.dragging) return;
        st.dragging = false;
        if (Math.hypot(st.bagX - binX, st.bagY - binY) <= BIN_R) complete();
      };
      const onKey = e => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); autoCarry(); }
      };
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      window.addEventListener('keydown', onKey, true);
      function cleanup() {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
        window.removeEventListener('keydown', onKey, true);
        canvas.style.cursor = 'default';
      }

      (function frame(now) {
        drawScene(g, st, now);
        if (!overlay.classList.contains('hidden')) requestAnimationFrame(frame);
      })(performance.now());
    });
  }

  root.DadMinigame = { play };
})(window);
