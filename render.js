/* DADLINE — canvas renderer. Everything is drawn in native pixels (16px tiles) and scaled up crisp. */
(function (root) {
  'use strict';
  const B = root.DadBoard, SP = root.DadSprites;
  const T = B.TILE;
  const NW = B.W * T, NH = B.H * T;

  const FLOORS = {
    hall:    { base: '#c48a55', line: '#a87345', kind: 'planksH' },
    kitchen: { base: '#efe8d6', line: '#cfc4a9', kind: 'checker' },
    bath:    { base: '#a8d8e8', line: '#86bccf', kind: 'tiles' },
    kids:    { base: '#86c49a', line: '#74b088', kind: 'carpet' },
    living:  { base: '#a8693f', line: '#8f5733', kind: 'planksV' },
    office:  { base: '#8590b8', line: '#76809f', kind: 'carpet' },
    parents: { base: '#c49ab4', line: '#ad869e', kind: 'carpet' },
    garden:  { base: '#6fae4f', line: '#5c9a40', kind: 'grass' }
  };

  function rect(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

  function floorTypeAt(x, y) {
    const rid = B.roomAt(B.key(x, y));
    if (rid) return B.roomById[rid].floor;
    return 'hall';
  }

  function drawFloor(g, type, tx, ty) {
    const f = FLOORS[type];
    const x = tx * T, y = ty * T;
    rect(g, x, y, T, T, f.base);
    g.fillStyle = f.line;
    if (f.kind === 'planksH') {
      for (let i = 0; i < 4; i++) {
        g.fillRect(x, y + i * 4 + 3, T, 1);
        const jx = ((tx * 7 + ty * 3 + i * 5) % 4) * 4;
        g.fillRect(x + jx, y + i * 4, 1, 3);
      }
    } else if (f.kind === 'planksV') {
      for (let i = 0; i < 4; i++) {
        g.fillRect(x + i * 4 + 3, y, 1, T);
        const jy = ((tx * 5 + ty * 7 + i * 3) % 4) * 4;
        g.fillRect(x + i * 4, y + jy, 3, 1);
      }
    } else if (f.kind === 'checker') {
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        if ((i + j + tx + ty) % 2) g.fillRect(x + i * 8, y + j * 8, 8, 8);
      }
    } else if (f.kind === 'grass') {
      for (let i = 0; i < 5; i++) {
        const gx = (tx * 7 + ty * 13 + i * 5) % 14 + 1, gy = (tx * 3 + ty * 11 + i * 7) % 13 + 1;
        g.fillRect(x + gx, y + gy, 1, 2); g.fillRect(x + gx + 1, y + gy + 1, 1, 1);
      }
      if ((tx * 5 + ty * 3) % 7 === 0) { rect(g, x + 9, y + 4, 2, 2, '#f5c542'); rect(g, x + 4, y + 10, 2, 2, '#f29bb0'); }
    } else if (f.kind === 'tiles') {
      for (let i = 0; i < 4; i++) { g.fillRect(x + i * 4, y, 1, T); g.fillRect(x, y + i * 4, T, 1); }
    } else {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        if ((i * 3 + j * 5 + tx + ty) % 4 === 0) g.fillRect(x + i * 4 + 1, y + j * 4 + 2, 1, 1);
      }
    }
  }

  function isWall(x, y) { return B.tileAt(x, y) === '#'; }

  // Outer walls that only touch the garden are drawn as a wooden fence.
  function isFence(tx, ty) {
    let garden = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x < 0 || y < 0 || x >= B.W || y >= B.H) continue;
      const rid = B.roomAt(B.key(x, y));
      if (rid === 'garden') garden = true;
      else if (rid) return false;
    }
    return garden;
  }

  function drawFence(g, tx, ty) {
    const x = tx * T, y = ty * T;
    drawFloor(g, 'garden', tx, ty);
    rect(g, x, y + 5, T, 2, '#8a5a34');
    rect(g, x, y + 11, T, 2, '#8a5a34');
    for (let i = 0; i < 4; i++) {
      rect(g, x + i * 4 + 1, y + 2, 2, 13, '#c9965f');
      rect(g, x + i * 4 + 1, y + 2, 2, 1, '#e6b880');
      rect(g, x + i * 4 + 3, y + 3, 1, 12, '#6e4524');
    }
  }

  // Outside the house: dark night lawn.
  const VOID = '#140c20';
  function drawVoid(g, tx, ty) {
    const x = tx * T, y = ty * T;
    rect(g, x, y, T, T, VOID);
    g.fillStyle = '#1d1430';
    for (let i = 0; i < 3; i++) {
      const gx = (tx * 7 + ty * 13 + i * 5) % 15, gy = (tx * 11 + ty * 3 + i * 7) % 15;
      g.fillRect(x + gx, y + gy, 1, 1);
    }
  }
  const isVoid = (tx, ty) => B.tileAt(tx, ty) === ' ';

  // Wooden trim on wall edges that face the outside, with chamfered (cut) outer corners.
  function drawTrim(g, tx, ty, fence) {
    const x = tx * T, y = ty * T;
    const u = isVoid(tx, ty - 1), d = isVoid(tx, ty + 1), l = isVoid(tx - 1, ty), r = isVoid(tx + 1, ty);
    const trim = fence ? '#6e4524' : '#b8743f', dark = fence ? '#4a2e17' : '#7a4a26';
    if (u) { rect(g, x, y, T, 3, trim); rect(g, x, y + 3, T, 1, dark); }
    if (d) { rect(g, x, y + 13, T, 3, trim); rect(g, x, y + 12, T, 1, dark); }
    if (l) { rect(g, x, y, 3, T, trim); rect(g, x + 3, y, 1, T, dark); }
    if (r) { rect(g, x + 13, y, 3, T, trim); rect(g, x + 12, y, 1, T, dark); }
    // Chamfer a corner where both sides (and the diagonal) are outside.
    const cut = (cond, fx, fy) => {
      if (!cond) return;
      for (let i = 0; i < 7; i++) {
        const len = 7 - i;
        const px = fx ? x + T - len : x, py = fy ? y + T - 1 - i : y + i;
        rect(g, px, py, len, 1, VOID);
        rect(g, fx ? px - 3 : px + len, py, 3, 1, trim);
      }
    };
    cut(u && l && isVoid(tx - 1, ty - 1), false, false);
    cut(u && r && isVoid(tx + 1, ty - 1), true, false);
    cut(d && l && isVoid(tx - 1, ty + 1), false, true);
    cut(d && r && isVoid(tx + 1, ty + 1), true, true);
  }

  function drawWall(g, tx, ty) {
    const x = tx * T, y = ty * T;
    if (isFence(tx, ty)) { drawFence(g, tx, ty); drawTrim(g, tx, ty, true); return; }
    rect(g, x, y, T, T, '#2a2038');
    rect(g, x, y, T, 1, '#3d3052');
    drawTrim(g, tx, ty, false);
    const below = B.tileAt(tx, ty + 1);
    if (ty < B.H - 1 && below !== '#' && below !== ' ') {
      // Wall face (wallpaper) visible from the top-down-ish camera
      rect(g, x, y + 9, T, 7, '#6a5584');
      rect(g, x, y + 9, T, 1, '#8a74a6');
      g.fillStyle = '#5b4777';
      for (let i = 0; i < 4; i++) g.fillRect(x + i * 4 + 1, y + 11, 1, 4);
      rect(g, x, y + 15, T, 1, '#3d3052');
    }
  }

  function doorVertical(tx, ty) { return isWall(tx, ty - 1) && isWall(tx, ty + 1); }

  function drawDoorway(g, tx, ty) {
    const x = tx * T, y = ty * T;
    rect(g, x, y, T, T, '#d9a46b');
    g.fillStyle = '#c18d58';
    for (let i = 0; i < 4; i++) g.fillRect(x, y + i * 4 + 3, T, 1);
    if (doorVertical(tx, ty)) {
      rect(g, x, y, T, 2, '#5a3a22'); rect(g, x, y + 14, T, 2, '#5a3a22');
    } else {
      // Wide archways: no post between two neighbouring door tiles
      if (B.tileAt(tx - 1, ty) !== 'D') rect(g, x, y, 2, T, '#5a3a22');
      if (B.tileAt(tx + 1, ty) !== 'D') rect(g, x + 14, y, 2, T, '#5a3a22');
    }
  }

  function drawLockedDoor(g, tx, ty, open) {
    const x = tx * T, y = ty * T;
    drawDoorway(g, tx, ty);
    if (open) {
      // Door swung open against the frame
      rect(g, x + 2, y + 2, 3, 12, '#8a5530');
      rect(g, x + 2, y + 2, 1, 12, '#5a3a22');
      return;
    }
    rect(g, x + 1, y + 1, 14, 14, '#8a5530');
    rect(g, x + 1, y + 1, 14, 1, '#a86a3d');
    g.fillStyle = '#6d4123';
    g.fillRect(x + 1, y + 5, 14, 1); g.fillRect(x + 1, y + 10, 14, 1);
    rect(g, x + 10, y + 6, 3, 3, '#f2c84b');
    rect(g, x + 11, y + 7, 1, 2, '#2b2140');
  }

  // Inset a furniture piece on sides where the neighbour is a different tile.
  function joined(tx, ty, ch) {
    return {
      l: B.tileAt(tx - 1, ty) === ch, r: B.tileAt(tx + 1, ty) === ch,
      u: B.tileAt(tx, ty - 1) === ch, d: B.tileAt(tx, ty + 1) === ch
    };
  }
  function block(g, tx, ty, ch, inset, fill, edge, frontH) {
    const j = joined(tx, ty, ch);
    const x = tx * T, y = ty * T;
    const x0 = x + (j.l ? 0 : inset), x1 = x + T - (j.r ? 0 : inset);
    const y0 = y + (j.u ? 0 : inset), y1 = y + T - (j.d ? 0 : inset);
    rect(g, x0, y0, x1 - x0, y1 - y0, edge);
    rect(g, x0 + (j.l ? 0 : 1), y0 + (j.u ? 0 : 1), x1 - x0 - (j.l ? 0 : 1) - (j.r ? 0 : 1), y1 - y0 - (j.u ? 0 : 1) - (j.d ? 0 : frontH + 1), fill);
    return { x0, x1, y0, y1, j };
  }

  function drawFurniture(g, ch, tx, ty) {
    const x = tx * T, y = ty * T;
    const room = B.roomAt(B.key(tx, ty));
    switch (ch) {
      case 'k': {
        block(g, tx, ty, 'k', 1, '#e6e0d2', '#9c937f', 3);
        if (tx === 3) { rect(g, x + 3, y + 3, 4, 4, '#2b2140'); rect(g, x + 9, y + 3, 4, 4, '#2b2140'); rect(g, x + 4, y + 4, 2, 2, '#e0533d'); }
        if (tx === 5) { rect(g, x + 3, y + 3, 10, 7, '#9aa6b2'); rect(g, x + 4, y + 4, 8, 5, '#7fc8e8'); rect(g, x + 7, y + 2, 2, 2, '#56606e'); }
        if (tx === 1) { rect(g, x + 2, y + 2, 12, 10, '#f6f6f6'); rect(g, x + 12, y + 4, 1, 4, '#9aa6b2'); }
        break;
      }
      case 't': {
        const b = block(g, tx, ty, 't', 2, '#9a6538', '#5e3a1e', 2);
        if (!b.j.l) { rect(g, x + 5, y + 5, 5, 4, '#ffffff'); rect(g, x + 6, y + 6, 3, 2, '#e0533d'); }
        else { rect(g, x + 4, y + 4, 3, 4, '#f5c542'); }
        break;
      }
      case 'w': {
        const b = block(g, tx, ty, 'w', 1, '#eef3f6', '#8aa0ad', 2);
        const ix0 = b.j.l ? x : x + 3, ix1 = b.j.r ? x + T : x + T - 3;
        const iy0 = b.j.u ? y : y + 3, iy1 = b.j.d ? y + T : y + T - 4;
        rect(g, ix0, iy0, ix1 - ix0, iy1 - iy0, '#7fc8e8');
        if (!b.j.u && !b.j.l) rect(g, x + 4, y + 4, 2, 1, '#ffffff');
        break;
      }
      case 'o': {
        rect(g, x + 4, y + 1, 8, 4, '#d8e0e6'); rect(g, x + 4, y + 1, 8, 1, '#8aa0ad');
        rect(g, x + 3, y + 5, 10, 9, '#8aa0ad'); rect(g, x + 4, y + 6, 8, 7, '#ffffff'); rect(g, x + 6, y + 8, 4, 3, '#a8d8e8');
        break;
      }
      case 'B': {
        const kids = room === 'kids';
        const b = block(g, tx, ty, 'B', 1, kids ? '#4f74d6' : '#c4495a', kids ? '#2f4b9a' : '#7e2a3a', 2);
        if (!b.j.u) {
          rect(g, b.x0 + 2, y + 2, (b.x1 - b.x0) - 4 + (b.j.r ? 2 : 0), 5, '#f6f1e6');
          rect(g, b.x0 + 2, y + 6, (b.x1 - b.x0) - 4 + (b.j.r ? 2 : 0), 1, '#c9bfae');
        } else {
          g.fillStyle = kids ? '#6f8ee6' : '#d9667a';
          for (let i = 0; i < 4; i++) g.fillRect(b.x0 + 1, y + 2 + i * 4, b.x1 - b.x0 - 2, 1);
        }
        break;
      }
      case 's': {
        const b = block(g, tx, ty, 's', 1, '#7a55b0', '#4a2f75', 0);
        rect(g, b.x0, y + 10, b.x1 - b.x0, 5, '#5b3d8a');
        if (!b.j.r) rect(g, x + 12, y + 2, 3, 12, '#5b3d8a');
        if (!b.j.l) rect(g, x + 1, y + 2, 3, 12, '#5b3d8a');
        rect(g, x + (b.j.l ? 0 : 5), y + 4, 1, 5, '#9677c8');
        break;
      }
      case 'v': {
        rect(g, x + 1, y + 3, 14, 9, '#1b1b2a'); rect(g, x + 2, y + 4, 12, 7, '#1d2a3a');
        rect(g, x + 3, y + 5, 6, 1, '#5fb6ff'); rect(g, x + 3, y + 7, 9, 1, '#3a7bb8');
        rect(g, x + 6, y + 12, 4, 2, '#56606e');
        break;
      }
      case 'p': {
        rect(g, x + 5, y + 10, 6, 5, '#b5603a'); rect(g, x + 5, y + 10, 6, 1, '#d47a4f');
        g.fillStyle = '#4c9a4a';
        g.fillRect(x + 3, y + 3, 4, 6); g.fillRect(x + 9, y + 2, 4, 7); g.fillRect(x + 6, y + 1, 4, 9);
        g.fillStyle = '#6cc06a';
        g.fillRect(x + 7, y + 2, 2, 3); g.fillRect(x + 4, y + 4, 1, 2); g.fillRect(x + 10, y + 3, 1, 2);
        break;
      }
      case 'd': {
        const b = block(g, tx, ty, 'd', 1, '#9a6538', '#5e3a1e', 2);
        if (!b.j.l) { rect(g, x + 3, y + 3, 9, 6, '#56606e'); rect(g, x + 4, y + 4, 7, 4, '#9bd46a'); }
        else { rect(g, x + 4, y + 5, 4, 4, '#ffffff'); rect(g, x + 8, y + 6, 1, 2, '#ffffff'); rect(g, x + 5, y + 6, 2, 1, '#6b3e26'); }
        break;
      }
      case 'q': { // tree
        rect(g, x + 7, y + 10, 3, 5, '#6e4524');
        rect(g, x + 3, y + 13, 10, 2, 'rgba(20,40,10,0.35)');
        rect(g, x + 2, y + 3, 12, 8, '#2f7a3a'); rect(g, x + 4, y + 1, 8, 12, '#2f7a3a');
        rect(g, x + 3, y + 3, 10, 7, '#3f9a48'); rect(g, x + 5, y + 2, 6, 9, '#3f9a48');
        rect(g, x + 5, y + 3, 3, 2, '#6cc06a'); rect(g, x + 10, y + 6, 1, 1, '#e0533d'); rect(g, x + 4, y + 8, 1, 1, '#e0533d');
        break;
      }
      case 'z': { // pond
        const b = block(g, tx, ty, 'z', 1, '#4f9fd6', '#8a8f99', 0);
        g.fillStyle = '#9fd4f2';
        g.fillRect(x + 4 + (tx % 2) * 3, y + 5, 4, 1);
        g.fillRect(x + 7 - (ty % 2) * 3, y + 10, 3, 1);
        if (!b.j.r && !b.j.d) { rect(g, x + 8, y + 9, 4, 3, '#4c9a4a'); rect(g, x + 9, y + 10, 1, 1, '#f29bb0'); }
        break;
      }
      case 'x': {
        const b = block(g, tx, ty, 'x', 1, '#6b4325', '#3e2614', 1);
        const cols = ['#e0533d', '#3b5dc9', '#f5c542', '#4f9a5a', '#8f4ab8'];
        for (let row = 0; row < 2; row++) {
          rect(g, b.x0 + 1, y + 7 + row * 6, b.x1 - b.x0 - 2, 1, '#3e2614');
          for (let i = 0; i < 6; i++) {
            const bx = b.x0 + 2 + i * 2;
            if (bx >= b.x1 - 1) break;
            rect(g, bx, y + 3 + row * 6, 1, 4, cols[(i + row + tx) % cols.length]);
          }
        }
        break;
      }
    }
  }

  function drawToys(g, tx, ty) {
    const x = tx * T, y = ty * T;
    const bricks = [
      [2, 3, '#e0533d'], [9, 2, '#3b5dc9'], [5, 8, '#f5c542'], [10, 10, '#4f9a5a'], [1, 11, '#8f4ab8']
    ];
    for (let i = 0; i < bricks.length; i++) {
      const [bx, by, c] = bricks[(i + tx) % bricks.length];
      const ox = (bx + tx * 3) % 11, oy = by;
      rect(g, x + ox, y + oy + 1, 5, 3, '#2b2140');
      rect(g, x + ox, y + oy, 5, 3, c);
      rect(g, x + ox + 1, y + oy - 1, 1, 1, c); rect(g, x + ox + 3, y + oy - 1, 1, 1, c);
    }
    // a ball
    rect(g, x + 11, y + 5, 4, 4, '#f6f1e6'); rect(g, x + 11, y + 6, 4, 2, '#e0533d');
  }

  function drawChute(g, tx, ty) {
    const x = tx * T, y = ty * T;
    rect(g, x + 1, y + 1, 14, 14, '#9aa0aa');
    rect(g, x + 2, y + 2, 12, 12, '#2f3340');
    g.fillStyle = '#f5c542';
    for (let i = 0; i < 14; i += 4) { g.fillRect(x + 1 + i, y + 1, 2, 1); g.fillRect(x + 1 + i, y + 14, 2, 1); }
    // down arrow
    rect(g, x + 7, y + 4, 2, 5, '#f6f1e6');
    rect(g, x + 5, y + 8, 6, 1, '#f6f1e6'); rect(g, x + 6, y + 9, 4, 1, '#f6f1e6'); rect(g, x + 7, y + 10, 2, 1, '#f6f1e6');
  }

  // Rugs are walkable decoration; neighbouring rug tiles join into one rug.
  const RUGS = { living: ['#b5473a', '#e0a24a'], parents: ['#5b7fd6', '#f2e1b0'], kids: ['#e3a83b', '#e0533d'], hall: ['#7e2a3a', '#d9a46b'] };
  function drawRug(g, tx, ty) {
    const [base, edge] = RUGS[B.roomAt(B.key(tx, ty))] || RUGS.living;
    const x = tx * T, y = ty * T;
    const j = joined(tx, ty, 'r');
    const x0 = x + (j.l ? 0 : 2), x1 = x + T - (j.r ? 0 : 2);
    const y0 = y + (j.u ? 0 : 2), y1 = y + T - (j.d ? 0 : 2);
    rect(g, x0, y0, x1 - x0, y1 - y0, edge);
    rect(g, x0 + (j.l ? 0 : 2), y0 + (j.u ? 0 : 2), x1 - x0 - (j.l ? 0 : 2) - (j.r ? 0 : 2), y1 - y0 - (j.u ? 0 : 2) - (j.d ? 0 : 2), base);
    g.fillStyle = edge;
    if ((tx + ty) % 2 === 0) { g.fillRect(x + 6, y + 6, 4, 4); } else { g.fillRect(x + 7, y + 4, 2, 2); g.fillRect(x + 7, y + 10, 2, 2); }
    // fringe on the open ends
    if (!j.l) for (let i = 0; i < 6; i++) g.fillRect(x, y0 + 1 + i * 2, 2, 1);
    if (!j.r) for (let i = 0; i < 6; i++) g.fillRect(x + 14, y0 + 1 + i * 2, 2, 1);
  }

  function drawStartMat(g, tx, ty) {
    const x = tx * T, y = ty * T;
    rect(g, x + 1, y + 3, 14, 10, '#7e2a3a');
    rect(g, x + 2, y + 4, 12, 8, '#a64444');
    g.fillStyle = '#c96a5a';
    for (let i = 0; i < 6; i++) g.fillRect(x + 3 + i * 2, y + 5 + (i % 2) * 4, 1, 2);
  }

  function buildStatic() {
    const c = document.createElement('canvas');
    c.width = NW; c.height = NH;
    const g = c.getContext('2d');
    for (let ty = 0; ty < B.H; ty++) {
      for (let tx = 0; tx < B.W; tx++) {
        const ch = B.tileAt(tx, ty);
        if (ch === ' ') { drawVoid(g, tx, ty); continue; }
        if (ch === '#') { drawWall(g, tx, ty); continue; }
        if (ch === 'D' || ch === 'L') { drawDoorway(g, tx, ty); continue; }
        drawFloor(g, floorTypeAt(tx, ty), tx, ty);
        if (B.FURNITURE_CHARS.includes(ch)) drawFurniture(g, ch, tx, ty);
        else if (ch === 'T') drawToys(g, tx, ty);
        else if (ch === '1' || ch === '2') drawChute(g, tx, ty);
        else if (ch === 'S') drawStartMat(g, tx, ty);
        else if (ch === 'r') drawRug(g, tx, ty);
      }
    }
    // Soft shadow under the top edge of each room (walls cast onto floor)
    for (let ty = 1; ty < B.H; ty++) for (let tx = 0; tx < B.W; tx++) {
      if (B.tileAt(tx, ty) !== '#' && B.tileAt(tx, ty - 1) === '#') rect(g, tx * T, ty * T, T, 2, 'rgba(20,10,30,0.25)');
    }
    return c;
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.g = canvas.getContext('2d');
      this.staticLayer = buildStatic();
      this.scale = 1;
      this.floaters = [];
      this.shakeUntil = 0;
    }

    resize(cssWidth, cssMaxHeight) {
      let s = cssWidth / NW;
      if (cssMaxHeight) s = Math.min(s, cssMaxHeight / NH);
      s = Math.max(0.5, s);
      const dpr = root.devicePixelRatio || 1;
      const scale = Math.max(1, Math.round(s * dpr));
      const cssW = Math.floor(NW * s) + 'px', cssH = Math.floor(NH * s) + 'px';
      if (scale !== this.scale || this.canvas.width !== NW * scale) {
        // Setting width/height clears the canvas, so only do it when the scale really changes.
        this.scale = scale;
        this.canvas.width = NW * scale;
        this.canvas.height = NH * scale;
      }
      if (this.canvas.style.width !== cssW) this.canvas.style.width = cssW;
      if (this.canvas.style.height !== cssH) this.canvas.style.height = cssH;
    }

    // Client coords -> tile key (or -1)
    tileAtClient(cx, cy) {
      const r = this.canvas.getBoundingClientRect();
      const x = Math.floor(((cx - r.left) / r.width) * B.W);
      const y = Math.floor(((cy - r.top) / r.height) * B.H);
      if (x < 0 || y < 0 || x >= B.W || y >= B.H) return -1;
      return B.key(x, y);
    }

    float(text, tileKey, color) {
      this.floaters.push({ text, x: B.kx(tileKey) * T + 8, y: B.ky(tileKey) * T, color: color || '#ffffff', t0: performance.now() });
    }
    shake(ms) { this.shakeUntil = performance.now() + (ms || 350); }
    // Redraw the static house after a new layout was loaded.
    rebuild() { this.staticLayer = buildStatic(); }

    draw(v, now) {
      const g = this.g, s = this.scale, st = v.state;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#1a1029';
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
      let ox = 0, oy = 0;
      if (now < this.shakeUntil) { ox = Math.round(Math.random() * 4 - 2); oy = Math.round(Math.random() * 4 - 2); }
      g.setTransform(s, 0, 0, s, ox * s / 2, oy * s / 2);
      g.drawImage(this.staticLayer, 0, 0);

      if (B.LOCKED >= 0) {
        const open = v.mask && v.mask.unlocked !== undefined ? v.mask.unlocked : st.unlocked;
        drawLockedDoor(g, B.kx(B.LOCKED), B.ky(B.LOCKED), open);
      }

      const blink = (Math.sin(now / 220) + 1) / 2;
      // While a Chaos event is being announced, v.mask holds the pre-roll look, so the map
      // only changes after the explanation card is closed.
      const m = v.mask;
      const clue = m ? m.clue : st.clue, revealedNow = m ? m.revealed : st.revealed;
      const cat = m ? (m.cat !== undefined ? m.cat : null) : st.cat, shield = m ? m.shield : st.shield;
      const dadVis = m ? m.dadVis : root.DadGame.dadVisible(st);

      // Fog of unchecked rooms
      for (const r of B.ROOMS) {
        if (st.checked.has(r.id)) continue;
        const isClue = clue && clue.includes(r.id);
        const revealed = revealedNow && r.id === st.dadRoom;
        // Fog follows the room's own tiles, so any room shape works.
        g.fillStyle = revealed ? 'rgba(26,16,41,0.35)' : isClue ? 'rgba(40,26,20,0.62)' : 'rgba(26,16,41,0.8)';
        for (const k of r.tiles) g.fillRect(B.kx(k) * T, B.ky(k) * T, T, T);
        if (isClue || revealed) {
          g.fillStyle = `rgba(245,197,66,${0.45 + blink * 0.5})`;
          for (const k of r.tiles) {
            const tx = B.kx(k), ty = B.ky(k), x = tx * T, y = ty * T;
            const other = (nx, ny) => B.roomAt(B.key(nx, ny)) !== r.id;
            if (other(tx, ty - 1)) g.fillRect(x, y, T, 1);
            if (other(tx, ty + 1)) g.fillRect(x, y + T - 1, T, 1);
            if (other(tx - 1, ty)) g.fillRect(x, y, 1, T);
            if (other(tx + 1, ty)) g.fillRect(x + T - 1, y, 1, T);
          }
        }
        if (!revealed) {
          const q = SP.sprite('question');
          const qx = Math.round(r.cx * T - 5), qy = Math.round(r.cy * T - 7 + Math.sin(now / 400 + r.cx) * 1.5);
          g.globalAlpha = isClue ? 0.95 : 0.5;
          g.drawImage(q, qx, qy, 10, 14);
          g.globalAlpha = 1;
        }
      }

      // Reachable tiles
      if (v.reach && v.reach.size) {
        // Soft pulsing glow per tile (white; yellow = MEGA-BOT's help is needed; orange = stuck door; green = Dad).
        // A thin dark edge keeps it readable on light floors like the kitchen and bath.
        for (const [k, r] of v.reach) {
          const x = B.kx(k) * T, y = B.ky(k) * T;
          const isDad = k === st.dad && dadVis;
          g.fillStyle = 'rgba(18,11,30,0.45)';
          g.fillRect(x + 1, y + 1, T - 2, 1); g.fillRect(x + 1, y + T - 2, T - 2, 1);
          g.fillRect(x + 1, y + 2, 1, T - 4); g.fillRect(x + T - 2, y + 2, 1, T - 4);
          g.fillStyle = isDad ? `rgba(120,230,120,${0.5 + blink * 0.3})`
            : r.jiggle ? `rgba(255,140,60,${0.5 + blink * 0.3})`
            : r.shieldAt >= 0 ? `rgba(245,197,66,${0.45 + blink * 0.25})` : `rgba(255,255,255,${0.4 + blink * 0.25})`;
          g.fillRect(x + 2, y + 2, T - 4, T - 4);
        }
        const hov = v.hover >= 0 ? v.reach.get(v.hover) : null;
        if (hov) {
          g.fillStyle = '#ffffff';
          for (const k of hov.path) g.fillRect(B.kx(k) * T + 7, B.ky(k) * T + 7, 2, 2);
          const x = B.kx(v.hover) * T, y = B.ky(v.hover) * T;
          g.fillStyle = hov.shieldAt >= 0 ? '#f5c542' : '#ffffff';
          for (const [cx, cy, w, hh] of [[0, 0, 4, 1], [0, 0, 1, 4], [12, 0, 4, 1], [15, 0, 1, 4], [0, 15, 4, 1], [0, 12, 1, 4], [12, 15, 4, 1], [15, 12, 1, 4]]) {
            g.fillRect(x + cx, y + cy, w, hh);
          }
        }
      }

      // Cat
      if (cat !== null) {
        const cx = B.kx(cat) * T + 2, cy = B.ky(cat) * T + 5 + (Math.floor(now / 300) % 2);
        g.drawImage(SP.sprite('cat'), cx, cy);
      }

      // Dad
      if (dadVis || st.phase === 'won' || st.phase === 'lost') {
        const dx = B.kx(st.dad) * T + 2, dy = B.ky(st.dad) * T + 1 - (Math.floor(now / 350) % 2);
        g.drawImage(SP.sprite('dad'), dx, dy);
        if (st.phase === 'won') {
          // Dad gives a thumbs up (gentle bob, no particles)
          const ty = dy - 11 - (Math.floor(now / 300) % 2);
          g.drawImage(SP.sprite('thumb'), dx + 9, ty);
        } else if (st.phase !== 'lost') {
          // "?" thought bubble
          rect(g, dx + 9, dy - 7, 7, 8, '#ffffff');
          rect(g, dx + 8, dy - 6, 9, 6, '#ffffff');
          rect(g, dx + 10, dy + 1, 2, 1, '#ffffff');
          g.drawImage(SP.sprite('questionDark'), dx + 10, dy - 6, 5, 7);
        }
      }

      // Child (player)
      const px = v.childX, py = v.childY;
      const walking = st.phase === 'walking';
      const bob = walking ? (Math.floor(now / 90) % 2) : (Math.floor(now / 500) % 2);
      if (v.childAlpha !== undefined) g.globalAlpha = v.childAlpha;
      rect(g, Math.round(px) + 4, Math.round(py) + 14, 8, 2, 'rgba(0,0,0,0.25)');
      g.drawImage(SP.sprite('child'), Math.round(px) + 2, Math.round(py) + 1 - bob);
      g.globalAlpha = 1;
      // Ring waves from the phone
      if (st.phase !== 'won' && st.phase !== 'lost' && Math.floor(now / 250) % 2 === 0) {
        g.fillStyle = '#f5c542';
        const wx = Math.round(px) + 14, wy = Math.round(py) + 7 - bob;
        g.fillRect(wx, wy, 1, 3); g.fillRect(wx + 2, wy - 1, 1, 5);
      }
      // Shield aura
      // MEGA-BOT, the kid's hero figurine, hovers by their shoulder while his help is ready.
      if (shield) {
        const sx = Math.round(px) - 4, sy = Math.round(py) - 7 - (Math.floor(now / 400) % 2);
        g.fillStyle = `rgba(245,197,66,${0.25 + blink * 0.3})`;
        g.fillRect(sx - 1, sy + 1, 11, 10);
        g.drawImage(SP.sprite('megabot'), sx, sy);
      }

      // Room labels
      g.font = '6px "Press Start 2P", monospace';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const r of B.ROOMS) {
        const lx = r.label.x * T, ly = r.label.y * T;
        const name = r.useTag ? r.tag : r.name.toUpperCase();
        const tw = Math.ceil(g.measureText(name).width);
        g.fillStyle = 'rgba(18,11,30,0.75)';
        g.fillRect(Math.round(lx - tw / 2) - 2, Math.round(ly) - 5, tw + 4, 10);
        g.fillStyle = '#120b1e';
        g.fillText(name, lx + 0.5, ly + 0.5);
        g.fillStyle = st.checked.has(r.id) ? '#f3e9d2' : '#a898c0';
        g.fillText(name, lx, ly);
      }

      // Floating texts
      g.font = '8px "Press Start 2P", monospace';
      this.floaters = this.floaters.filter(f => now - f.t0 < 1200);
      for (const f of this.floaters) {
        const t = (now - f.t0) / 1200;
        g.globalAlpha = 1 - t * t;
        const y = f.y - t * 14;
        g.fillStyle = '#120b1e';
        g.fillText(f.text, f.x + 1, y + 1);
        g.fillStyle = f.color;
        g.fillText(f.text, f.x, y);
      }
      g.globalAlpha = 1;
    }
  }

  root.DadRender = { Renderer, NW, NH, T };
})(window);
