/* DADLINE — house map and board helpers (no DOM).
   A layout is { plan, deco, labels? }. DadBoard.load(layout) builds the tile map, rooms,
   doors, etc. and refreshes every field on DadBoard. gen.js makes a new layout each game;
   CLASSIC below is the hand-made house (also the fallback). */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // LAYOUT FORMAT
  // plan: a free-form sketch. Draw each room with its letter, put doors in the
  // one-tile gaps between rooms, leave everything else as spaces. Walls are generated
  // around every room, so rooms can be any shape; empty space becomes courtyards.
  //   Room letters: H hall  G garden  K kitchen  B bathroom  P parents
  //                 L living room  R kids' room  O office
  //   +  open door        =  stuck (locked) door, shortcut only
  // deco: things on room floors, as 'x,y' tile coordinates.
  //   S start   1/2 laundry chute ends   T toys (need MEGA-BOT)   r rug (walkable)
  //   Furniture (blocks): k counter  t table  w tub  o toilet  B bed  s sofa
  //                       v tv  p plant  d desk  x shelf/wardrobe  q tree  z pond
  // labels (optional): { roomId: {x, y} } name-tag centres; computed if missing.
  // ---------------------------------------------------------------------------
  const CLASSIC = {
    name: 'classic',
    plan: [
      '                          ',
      '       KKKKKKK     PPPPP  ',
      '  OOO  KKKKKKKK   PPPPPP  ',
      '  OOO+KKKKKKKKK+H+PPPPPP  ',
      '  OOO KKKKKKK   H  PPPPP  ',
      '  OO   ++       H  PPPP   ',
      '   + LLLLLLL    H   +     ',
      '   LLLLLLLLL    H BBB     ',
      '  LLLLLLLLLL    H+BBB     ',
      '  LLLLLLLLLL+HHHH BBB     ',
      '  LLLLLLL    HH   =       ',
      '  LLLLLL     HH+RRRRRRRR  ',
      '  LLLLLL    HHH RRRRRRRR  ',
      '  LLLLL   HHHHH RRRRRRRRR ',
      '   LLLL   HHHHH RRRRRR    ',
      '           HH +   +       ',
      '              GGGGGGGGGG  ',
      '               GGGGGGGGGG ',
      '                GGGGGG    ',
      '                          '
    ],
    deco: {
      S: ['12,15'],
      1: ['24,13'],
      2: ['2,4'],
      T: ['5,11', '6,11', '19,13', '20,13'],
      r: ['3,12', '4,12', '3,13', '4,13', '19,4', '20,4', '17,13', '18,13', '11,14', '12,14', '13,14'],
      k: ['8,1', '9,1', '10,1', '11,1', '12,1'],
      t: ['9,3', '10,3'],
      w: ['19,9', '20,9'],
      o: ['18,7'],
      B: ['21,2', '22,2', '21,3', '22,3', '23,11', '23,12'],
      s: ['5,9', '6,9'],
      v: ['2,8', '2,9'],
      p: ['14,2', '11,6', '3,14', '18,2', '10,13'],
      d: ['2,2', '3,2'],
      x: ['4,2', '19,1', '20,1', '19,11', '20,11'],
      q: ['23,16', '16,18'],
      z: ['19,17', '20,17']
    },
    labels: {
      hall: { x: 11.5, y: 16.5 }, garden: { x: 18.5, y: 19.5 }, kitchen: { x: 10.5, y: 0.5 },
      bath: { x: 19, y: 6.5 }, parents: { x: 21.5, y: 0.5 }, living: { x: 4.5, y: 15.5 },
      kids: { x: 19.5, y: 10.5 }, office: { x: 3.5, y: 1.5 }
    }
  };

  // Room types. tag: shorter name tag used when the room is narrow.
  const ROOM_DEFS = [
    { id: 'hall',    letter: 'H', name: 'Hall',          floor: 'hall' },
    { id: 'garden',  letter: 'G', name: 'Garden',        floor: 'garden' },
    { id: 'kitchen', letter: 'K', name: 'Kitchen',       floor: 'kitchen' },
    { id: 'bath',    letter: 'B', name: 'Bathroom',      floor: 'bath', tag: 'BATH' },
    { id: 'parents', letter: 'P', name: "Parents' Room", floor: 'parents', tag: 'PARENTS' },
    { id: 'living',  letter: 'L', name: 'Living Room',   floor: 'living', tag: 'LIVING' },
    { id: 'kids',    letter: 'R', name: "Kids' Room",    floor: 'kids', tag: 'KIDS' },
    { id: 'office',  letter: 'O', name: 'Office',        floor: 'office' }
  ];
  const LETTERS = ROOM_DEFS.map(r => r.letter).join('');
  const isRoomCh = c => LETTERS.includes(c);

  const TILE = 16;
  const FLOOR_CHARS = '.SD12r';
  const FURNITURE_CHARS = 'ktwoBsvpdxqz';

  // ---- Current board (replaced by load) ----
  let W = 0, H = 0, PLAN = [], tiles = [], roomGrid = [], ROOMS = [], roomById = {};
  let START = -1, LOCKED = -1, CHUTES = [], DOORS = [], TOYS = [], DAD_TILES = {};
  let DECO_ERRORS = [], safeFromStart = new Map();

  const key = (x, y) => y * W + x;
  const kx = k => k % W;
  const ky = k => (k / W) | 0;
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const tileAt = (x, y) => (inBounds(x, y) ? tiles[y][x] : ' ');
  const tileK = k => tiles[ky(k)][kx(k)];
  const planAt = (x, y) => (inBounds(x, y) ? PLAN[y][x] : ' ');
  const roomAt = k => roomGrid[k];

  // 'floor' | 'toy' | 'locked' | 'block'
  function passKind(ch) {
    if (FLOOR_CHARS.includes(ch)) return 'floor';
    if (ch === 'T') return 'toy';
    if (ch === 'L') return 'locked';
    return 'block';
  }

  function neighbors(k) {
    const x = kx(k), y = ky(k), out = [];
    if (x > 0) out.push(k - 1);
    if (x < W - 1) out.push(k + 1);
    if (y > 0) out.push(k - W);
    if (y < H - 1) out.push(k + W);
    return out;
  }

  // Plain BFS distances. blocked(k) -> true to treat k as a wall.
  function bfs(sources, blocked) {
    const dist = new Map();
    const q = [];
    for (const s of sources) { dist.set(s, 0); q.push(s); }
    for (let i = 0; i < q.length; i++) {
      const k = q[i];
      const d = dist.get(k);
      for (const n of neighbors(k)) {
        if (dist.has(n) || blocked(n)) continue;
        dist.set(n, d + 1);
        q.push(n);
      }
    }
    return dist;
  }

  // "Safe" passability: only plain floor. Toys and the locked door count as walls.
  const safeBlocked = k => passKind(tileK(k)) !== 'floor';

  // Name-tag spots to try, best first: wall row above the room, wall row below, inside the top row.
  function labelSpots(r) {
    const ys = r.tiles.map(ky);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const top = r.tiles.filter(k => ky(k) === minY).map(kx);
    const bot = r.tiles.filter(k => ky(k) === maxY).map(kx);
    const mid = a => (Math.min(...a) + Math.max(...a) + 1) / 2;
    const wallRow = (y, a) => a.every(x => tileAt(x, y) === '#');
    const spots = [];
    if (minY > 0 && wallRow(minY - 1, top)) spots.push({ x: mid(top), y: minY - 0.5 });
    if (maxY < H - 1 && wallRow(maxY + 1, bot)) spots.push({ x: mid(bot), y: maxY + 1.5 });
    spots.push({ x: mid(top), y: minY + 0.5 }, { x: mid(bot), y: maxY + 0.5 });
    return spots;
  }
  // Place every room's label so no two name tags overlap.
  function placeLabels(rooms, given) {
    const boxes = [];
    const box = (r, p) => {
      const w = ((r.useTag ? r.tag : r.name).length * 6 + 6) / TILE;
      return { x0: p.x - w / 2, x1: p.x + w / 2, y0: p.y - 0.4, y1: p.y + 0.4 };
    };
    const hits = b => boxes.some(o => b.x0 < o.x1 && o.x0 < b.x1 && b.y0 < o.y1 && o.y0 < b.y1);
    for (const r of rooms) {
      const spots = given && given[r.id] ? [given[r.id]] : labelSpots(r);
      r.label = spots.find(p => !hits(box(r, p))) || spots[0];
      boxes.push(box(r, r.label));
    }
  }

  function load(layout) {
    PLAN = layout.plan;
    W = PLAN[0].length;
    H = PLAN.length;

    // Tiles: rooms -> floor, + / = -> doors, empty touching a room -> wall, else outside.
    tiles = [];
    for (let y = 0; y < H; y++) {
      const row = [];
      for (let x = 0; x < W; x++) {
        const c = planAt(x, y);
        if (isRoomCh(c)) { row.push('.'); continue; }
        if (c === '+') { row.push('D'); continue; }
        if (c === '=') { row.push('L'); continue; }
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
          const n = planAt(x + dx, y + dy);
          if (isRoomCh(n) || n === '+' || n === '=') { near = true; break; }
        }
        row.push(near ? '#' : ' ');
      }
      tiles.push(row);
    }
    DECO_ERRORS = [];
    for (const [ch, list] of Object.entries(layout.deco || {})) {
      for (const p of list) {
        const [x, y] = p.split(',').map(Number);
        if (!isRoomCh(planAt(x, y))) { DECO_ERRORS.push(`'${ch}' at (${x},${y}) is not on a room floor.`); continue; }
        tiles[y][x] = ch;
      }
    }

    // Rooms
    ROOMS = ROOM_DEFS.map(d => Object.assign({}, d, { tiles: [] }));
    const byLetter = Object.fromEntries(ROOMS.map(r => [r.letter, r]));
    roomGrid = new Array(W * H).fill(null);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const r = byLetter[planAt(x, y)];
      if (!r) continue;
      roomGrid[key(x, y)] = r.id;
      r.tiles.push(key(x, y));
    }
    ROOMS = ROOMS.filter(r => r.tiles.length);
    roomById = Object.fromEntries(ROOMS.map(r => [r.id, r]));
    for (const r of ROOMS) {
      // Centre of the room (tile units), used for the fog "?" marker.
      r.cx = r.tiles.reduce((a, k) => a + kx(k), 0) / r.tiles.length + 0.5;
      r.cy = r.tiles.reduce((a, k) => a + ky(k), 0) / r.tiles.length + 0.5;
      const width = Math.max(...r.tiles.map(kx)) - Math.min(...r.tiles.map(kx)) + 1;
      r.useTag = !!r.tag && width * TILE < r.name.length * 6 + 10;
    }
    placeLabels(ROOMS, layout.labels);

    // Specials
    START = -1; LOCKED = -1; CHUTES = []; DOORS = []; TOYS = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = tiles[y][x];
      if (c === 'S') START = key(x, y);
      if (c === 'L') LOCKED = key(x, y);
      if (c === '1') CHUTES[0] = key(x, y);
      if (c === '2') CHUTES[1] = key(x, y);
      if (c === 'D') DOORS.push(key(x, y));
      if (c === 'T') TOYS.push(key(x, y));
    }

    // Tiles Dad may stand on: plain floor inside a non-hall room, reachable safely.
    safeFromStart = START >= 0 ? bfs([START], safeBlocked) : new Map();
    DAD_TILES = {};
    for (const r of ROOMS) {
      if (r.id === 'hall') continue;
      DAD_TILES[r.id] = r.tiles.filter(k => tileK(k) === '.' && safeFromStart.has(k));
    }

    Object.assign(api, {
      MAP: tiles.map(r => r.join('')), PLAN, W, H, ROOMS, tiles, roomById,
      START, LOCKED, CHUTES, DOORS, TOYS, DAD_TILES, layout
    });
    return api;
  }

  // Map sanity: nothing important may sit behind toys or the locked door.
  function validateBoard() {
    const errors = DECO_ERRORS.slice();
    PLAN.forEach((row, y) => {
      if (row.length !== W) errors.push(`PLAN row ${y} has ${row.length} tiles, expected ${W}.`);
    });
    for (let x = 0; x < W; x++) if (isRoomCh(planAt(x, 0)) || isRoomCh(planAt(x, H - 1))) errors.push(`Room touches the top/bottom edge at x=${x}; leave a blank row for walls.`);
    for (let y = 0; y < H; y++) if (isRoomCh(planAt(0, y)) || isRoomCh(planAt(W - 1, y))) errors.push(`Room touches the left/right edge at y=${y}; leave a blank column for walls.`);
    // Every door must join two different walkable sides.
    for (const d of DOORS.concat(LOCKED >= 0 ? [LOCKED] : [])) {
      const sides = neighbors(d).filter(n => roomAt(n));
      if (new Set(sides.map(roomAt)).size < 2) errors.push(`Door at (${kx(d)},${ky(d)}) does not connect two rooms.`);
    }
    if (START < 0) errors.push('No start tile (S).');
    if (CHUTES.length !== 2 || CHUTES.includes(undefined)) errors.push('Need exactly two chute ends (1 and 2).');
    for (const def of ROOM_DEFS) if (!roomById[def.id]) errors.push(`Missing room: ${def.name}.`);

    for (const r of ROOMS) {
      const floor = r.tiles.filter(k => passKind(tileK(k)) === 'floor');
      const unreached = floor.filter(k => !safeFromStart.has(k));
      if (!floor.length) errors.push(`${r.name} has no floor.`);
      if (unreached.length) {
        errors.push(`${r.name}: ${unreached.length} floor tile(s) only reachable through toys/locked door: ` +
          unreached.map(k => `(${kx(k)},${ky(k)})`).join(' '));
      }
      if (r.id !== 'hall' && !DAD_TILES[r.id].length) errors.push(`${r.name} has no tile Dad can stand on.`);
    }

    // Toys must not stand on doorways or in the hall.
    for (const t of TOYS) {
      const rid = roomAt(t);
      if (!rid) errors.push(`Toy at (${kx(t)},${ky(t)}) is not inside a room (doorway?).`);
      else if (rid === 'hall') errors.push(`Toy at (${kx(t)},${ky(t)}) blocks the hall.`);
    }

    // How many extra steps does each toy tile force? (detour cost vs. walking straight over it)
    const toyReport = TOYS.map(t => {
      const withOpen = bfs([START], k => k !== t && safeBlocked(k));
      let worst = 0;
      for (const [k, d] of withOpen) {
        const d0 = safeFromStart.get(k);
        if (d0 !== undefined) worst = Math.max(worst, d0 - d);
      }
      let localWorst = 0;
      for (const n of neighbors(t)) {
        if (passKind(tileK(n)) !== 'floor') continue;
        const a = bfs([n], safeBlocked);
        const b = bfs([n], k => k !== t && safeBlocked(k));
        for (const [k, d] of b) {
          const d0 = a.get(k);
          if (d0 !== undefined) localWorst = Math.max(localWorst, d0 - d);
        }
      }
      return { x: kx(t), y: ky(t), room: roomAt(t), savesFromStart: worst, maxDetour: localWorst };
    });

    // The locked door must only ever be a shortcut (checked above); how much does it save?
    let lockedSaves = 0;
    if (LOCKED >= 0) {
      const open = bfs([START], k => k !== LOCKED && safeBlocked(k));
      for (const [k, d] of open) {
        const d0 = safeFromStart.get(k);
        if (d0 !== undefined) lockedSaves = Math.max(lockedSaves, d0 - d);
      }
    }

    return { ok: errors.length === 0, errors, toyReport, lockedSaves };
  }

  const api = {
    TILE, CLASSIC, ROOM_DEFS, FURNITURE_CHARS, LETTERS,
    load, validateBoard, key, kx, ky, tileAt, tileK, passKind, roomAt, neighbors, bfs
  };
  root.DadBoard = api;
  load(CLASSIC);
})(typeof window !== 'undefined' ? window : globalThis);
