/* DADLINE — random house generator. DadGen.generate(seed) builds a new layout, loads it
   into DadBoard and returns it. Every layout must pass DadBoard.validateBoard() (no soft-locks,
   every room reachable without toys or the stuck door) plus a few extra checks; otherwise
   it tries again, and as a last resort falls back to the classic house.

   How a house is built:
   1. The plot is split into a 3x3 grid of blocks with random split lines.
   2. Hall, Garden and the six rooms are shuffled into the blocks; one block stays empty
      (a courtyard). Each room gets a random shape: ragged outer edges and cut corners.
   3. Rooms facing each other across a one-tile wall can get a door. A random spanning tree
      connects everything to the Hall, then 2-3 extra doors add loops. The extra door with
      the longest way around becomes the stuck door (so it is always a shortcut).
   4. The laundry chute links two rooms that are far apart; the start is in the Hall.
   5. Furniture, toys and rugs are placed per room type, never on a doorway entrance and
      never cutting a room in two. */
(function (root) {
  'use strict';
  const B = root.DadBoard;
  const W = 26, H = 20;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ri = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  function shuffle(r, a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  const LET = { hall: 'H', garden: 'G', kitchen: 'K', bath: 'B', parents: 'P', living: 'L', kids: 'R', office: 'O' };
  const BLOCKING = 'ktwoBsvpdxqzT';
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function tryGenerate(r) {
    const g = Array.from({ length: H }, () => Array(W).fill(' '));
    const at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? g[y][x] : ' ');

    // 1) Blocks
    const xs = [ri(r, 7, 10), ri(r, 15, 18)];
    const ys = [ri(r, 5, 7), ri(r, 11, 13)];
    const colR = [[1, xs[0] - 1], [xs[0] + 1, xs[1] - 1], [xs[1] + 1, W - 2]];
    const rowR = [[1, ys[0] - 1], [ys[0] + 1, ys[1] - 1], [ys[1] + 1, H - 2]];

    // 2) Who goes where
    const cellRoom = Array(9).fill(null);
    const hallIdx = r() < 0.55 ? 4 : pick(r, [1, 3, 5, 7]);
    cellRoom[hallIdx] = 'hall';
    const free = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(i => i !== hallIdx);
    const emptyIdx = pick(r, free);
    const rest = free.filter(i => i !== emptyIdx);
    const gardenIdx = pick(r, rest.filter(i => i !== 4));
    cellRoom[gardenIdx] = 'garden';
    const others = shuffle(r, ['kitchen', 'bath', 'parents', 'living', 'kids', 'office']);
    for (const i of rest) if (i !== gardenIdx) cellRoom[i] = others.pop();

    const cellAt = (cx, cy) => (cx < 0 || cy < 0 || cx > 2 || cy > 2 ? null : cellRoom[cy * 3 + cx]);
    for (let cy = 0; cy < 3; cy++) for (let cx = 0; cx < 3; cx++) {
      const id = cellAt(cx, cy);
      if (!id) continue;
      const L = LET[id];
      let [x0, x1] = colR[cx], [y0, y1] = rowR[cy];
      // Outer sides (map edge or the empty block) get ragged; inner sides stay put so doors can line up.
      const outer = (dx, dy) => !cellAt(cx + dx, cy + dy);
      if (outer(-1, 0)) x0 += ri(r, 0, 2);
      if (outer(1, 0)) x1 -= ri(r, 0, 2);
      if (outer(0, -1)) y0 += ri(r, 0, 1);
      if (outer(0, 1)) y1 -= ri(r, 0, 1);
      if (x1 - x0 < 2 || y1 - y0 < 1) return null;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = L;
      // Cut 0-2 corners for L-shapes and odd outlines.
      const cuts = id === 'hall' ? ri(r, 1, 2) : (r() < 0.7 ? ri(r, 1, 2) : 0);
      for (let c = 0; c < cuts; c++) {
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        const nw = ri(r, 1, Math.max(1, Math.floor(w / 2))), nh = ri(r, 1, Math.max(1, Math.floor(h / 2)));
        const corner = ri(r, 0, 3);
        const sx = corner & 1 ? x1 - nw + 1 : x0, sy = corner & 2 ? y1 - nh + 1 : y0;
        const removed = [];
        for (let y = sy; y < sy + nh; y++) for (let x = sx; x < sx + nw; x++) if (g[y][x] === L) { g[y][x] = ' '; removed.push([x, y]); }
        let count = 0;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (g[y][x] === L) count++;
        if (count < 9) for (const [x, y] of removed) g[y][x] = L; // too small: undo the cut
      }
    }

    // 3) Possible doors between neighbouring rooms (across exactly one wall tile)
    const edges = [];
    for (let cy = 0; cy < 3; cy++) for (let cx = 0; cx < 3; cx++) {
      const a = cellAt(cx, cy);
      if (!a) continue;
      if (cx < 2 && cellAt(cx + 1, cy)) {
        const b = cellAt(cx + 1, cy), s = xs[cx], cands = [];
        for (let y = rowR[cy][0]; y <= rowR[cy][1]; y++) if (at(s - 1, y) === LET[a] && at(s + 1, y) === LET[b]) cands.push([s, y]);
        if (cands.length) edges.push({ a, b, cands, vertical: false });
      }
      if (cy < 2 && cellAt(cx, cy + 1)) {
        const b = cellAt(cx, cy + 1), s = ys[cy], cands = [];
        for (let x = colR[cx][0]; x <= colR[cx][1]; x++) if (at(x, s - 1) === LET[a] && at(x, s + 1) === LET[b]) cands.push([x, s]);
        if (cands.length) edges.push({ a, b, cands, vertical: true });
      }
    }
    // Spanning tree from the Hall, then extra doors for loops.
    const linked = new Set(['hall']);
    const tree = [];
    let pool = shuffle(r, edges.slice());
    for (let grew = true; grew;) {
      grew = false;
      for (const e of pool) {
        if (linked.has(e.a) !== linked.has(e.b)) { tree.push(e); linked.add(e.a); linked.add(e.b); grew = true; }
      }
      pool = pool.filter(e => !tree.includes(e));
    }
    if (linked.size < 8) return null;
    const extras = pool.slice(0, ri(r, 2, 3));

    const placeDoor = (e, allowArch) => {
      const mid = e.cands.length / 2;
      const sorted = e.cands.slice().sort((p, q) => Math.abs(e.cands.indexOf(p) - mid) - Math.abs(e.cands.indexOf(q) - mid));
      const [x, y] = pick(r, sorted.slice(0, Math.min(3, sorted.length)));
      g[y][x] = '+';
      e.door = [x, y];
      if (allowArch && r() < 0.3) {
        const nx = e.vertical ? x + 1 : x, ny = e.vertical ? y : y + 1;
        if (e.cands.some(([cx2, cy2]) => cx2 === nx && cy2 === ny)) g[ny][nx] = '+';
      }
    };
    for (const e of tree) placeDoor(e, true);
    for (const e of extras) placeDoor(e, false);

    // The extra door with the longest way around becomes the stuck door.
    const walk = (x, y) => { const c = at(x, y); return c !== ' ' && c !== '='; };
    const stepsBetween = (ax, ay, bx, by, blockX, blockY) => {
      const seen = new Set([ax + ',' + ay]); let q = [[ax, ay]], d = 0;
      while (q.length) {
        const nq = [];
        for (const [x, y] of q) {
          if (x === bx && y === by) return d;
          for (const [dx, dy] of DIRS) {
            const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
            if (seen.has(k) || !walk(nx, ny) || (nx === blockX && ny === blockY)) continue;
            seen.add(k); nq.push([nx, ny]);
          }
        }
        q = nq; d++;
      }
      return Infinity;
    };
    let best = null, bestDetour = 0;
    for (const e of extras) {
      const [x, y] = e.door;
      const [ax, ay, bx, by] = e.vertical ? [x, y - 1, x, y + 1] : [x - 1, y, x + 1, y];
      const detour = stepsBetween(ax, ay, bx, by, x, y);
      if (detour !== Infinity && detour > bestDetour) { bestDetour = detour; best = e; }
    }
    if (best && bestDetour >= 6) g[best.door[1]][best.door[0]] = '=';

    // 4) + 5) Decorations
    const deco = {};
    const used = new Map(); // "x,y" -> char
    const add = (ch, x, y) => { (deco[ch] = deco[ch] || []).push(x + ',' + y); used.set(x + ',' + y, ch); };
    const remove = (ch, x, y) => { deco[ch] = deco[ch].filter(p => p !== x + ',' + y); used.delete(x + ',' + y); };
    const isDoor = c => c === '+' || c === '=';
    const entry = (x, y) => DIRS.some(([dx, dy]) => isDoor(at(x + dx, y + dy)));
    const freeTile = (x, y, L) => at(x, y) === L && !used.has(x + ',' + y) && !entry(x, y);
    const wallSide = (x, y, L) => DIRS.some(([dx, dy]) => at(x + dx, y + dy) !== L);
    const tilesOf = L => { const t = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (g[y][x] === L) t.push([x, y]); return t; };
    const roomOK = L => {
      // all walkable tiles of the room must stay connected
      const open = tilesOf(L).filter(([x, y]) => !BLOCKING.includes(used.get(x + ',' + y) || '.'));
      if (!open.length) return false;
      const seen = new Set([open[0].join(',')]), q = [open[0]];
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of DIRS) {
          const k = (x + dx) + ',' + (y + dy);
          if (seen.has(k) || at(x + dx, y + dy) !== L || BLOCKING.includes(used.get(k) || '.')) continue;
          seen.add(k); q.push([x + dx, y + dy]);
        }
      }
      return seen.size === open.length;
    };
    // place(L, ch, shape, rule): rule = 'wall' (touch a wall), 'inside' (no tile on a wall), 'top' (all along the top wall), 'any'
    const place = (L, ch, shape, rule, tries = 50) => {
      const spots = shuffle(r, tilesOf(L));
      for (const [ax, ay] of spots.slice(0, tries)) {
        const cells = shape.map(([dx, dy]) => [ax + dx, ay + dy]);
        if (!cells.every(([x, y]) => freeTile(x, y, L))) continue;
        if (rule === 'wall' && !cells.some(([x, y]) => wallSide(x, y, L))) continue;
        if (rule === 'inside' && cells.some(([x, y]) => wallSide(x, y, L))) continue;
        if (rule === 'top' && !cells.every(([x, y]) => at(x, y - 1) !== L)) continue;
        cells.forEach(([x, y]) => add(ch, x, y));
        if (BLOCKING.includes(ch) && !roomOK(L)) { cells.forEach(([x, y]) => remove(ch, x, y)); continue; }
        return true;
      }
      return false;
    };
    const ONE = [[0, 0]], H2 = [[0, 0], [1, 0]], V2 = [[0, 0], [0, 1]], SQ = [[0, 0], [1, 0], [0, 1], [1, 1]];
    const run = n => Array.from({ length: n }, (_, i) => [i, 0]);

    // Start in the Hall, chute between two far-apart indoor rooms.
    if (!place('H', 'S', ONE, 'any')) return null;
    const indoor = ['kitchen', 'bath', 'parents', 'living', 'kids', 'office'];
    const cellOf = id => cellRoom.indexOf(id);
    const far = (a, b) => Math.abs(cellOf(a) % 3 - cellOf(b) % 3) + Math.abs(((cellOf(a) / 3) | 0) - ((cellOf(b) / 3) | 0));
    let pairs = [];
    for (let i = 0; i < indoor.length; i++) for (let j = i + 1; j < indoor.length; j++) pairs.push([indoor[i], indoor[j], far(indoor[i], indoor[j])]);
    const maxFar = Math.max(...pairs.map(p => p[2]));
    pairs = pairs.filter(p => p[2] >= Math.max(2, maxFar - 1));
    const [ca, cb] = pick(r, pairs);
    if (!place(LET[ca], '1', ONE, 'wall') || !place(LET[cb], '2', ONE, 'wall')) return null;

    // Furniture per room type (optional pieces just get skipped if they don't fit).
    place('K', 'k', run(ri(r, 3, 5)), 'top') || place('K', 'k', run(2), 'top');
    place('K', 't', H2, 'inside') || place('K', 't', H2, 'any');
    if (r() < 0.7) place('K', 'p', ONE, 'wall');
    place('B', 'w', r() < 0.5 ? H2 : V2, 'wall');
    place('B', 'o', ONE, 'wall');
    place('P', 'B', SQ, 'wall') || place('P', 'B', V2, 'wall');
    place('P', 'x', H2, 'wall');
    if (r() < 0.6) place('P', 'p', ONE, 'wall');
    place('P', 'r', H2, 'any');
    place('R', 'B', V2, 'wall');
    place('R', 'x', H2, 'wall');
    place('R', 'T', H2, 'inside');
    place('R', 'r', H2, 'any');
    place('L', 'v', V2, 'wall');
    place('L', 's', H2, 'any');
    if (r() < 0.7) place('L', 'p', ONE, 'wall');
    place('L', 'T', r() < 0.5 ? H2 : V2, 'inside');
    place('L', 'r', SQ, 'any');
    place('O', 'd', H2, 'wall');
    place('O', 'x', ONE, 'wall');
    for (let i = ri(r, 1, 3); i > 0; i--) place('G', 'q', ONE, 'any');
    place('G', 'z', r() < 0.5 ? H2 : SQ, 'inside');
    if (r() < 0.5) place('G', 'T', H2, 'inside');
    if (r() < 0.7) place('H', 'p', ONE, 'wall');
    place('H', 'r', r() < 0.5 ? run(3) : H2, 'any');

    return { name: 'generated', plan: g.map(row => row.join('')), deco };
  }

  // Extra checks on top of validateBoard(): toys only cause short detours, every room
  // has a few possible Dad spots, and the chute ends are reachable.
  function goodEnough(v) {
    if (!v.ok) return false;
    if (v.toyReport.some(t => t.maxDetour > 3)) return false;
    for (const id in B.DAD_TILES) if (B.DAD_TILES[id].length < 2) return false;
    return true;
  }

  function generate(seed) {
    seed = seed >>> 0;
    for (let attempt = 0; attempt < 60; attempt++) {
      const layout = tryGenerate(mulberry32((seed + attempt * 7919) >>> 0));
      if (!layout) continue;
      layout.seed = seed;
      B.load(layout);
      if (goodEnough(B.validateBoard())) return layout;
    }
    B.load(B.CLASSIC);
    return B.CLASSIC;
  }

  root.DadGen = { generate };
})(typeof window !== 'undefined' ? window : globalThis);
