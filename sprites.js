/* DADLINE — pixel sprites as string maps, pre-rendered to small canvases. */
(function (root) {
  'use strict';

  const PAL = {
    k: '#2b2140', // outline
    s: '#f2c09a', // skin
    h: '#6b3e26', // hair
    r: '#e0533d', // red shirt
    b: '#3b5dc9', // blue
    g: '#4f9a5a', // green sweater
    d: '#6b4a2e', // brown trousers
    w: '#ffffff',
    y: '#f5c542', // yellow
    Y: '#c99a1f', // dark yellow
    o: '#f08a2c', // orange (cat)
    O: '#c4621a', // dark orange
    p: '#f29bb0', // pink
    n: '#1b1b2a', // near black
    G: '#9bd46a', // lcd green
    e: '#56606e', // phone grey
    m: '#8f4ab8', // purple
    R: '#b8303a'  // dark red
  };

  const MAPS = {
    child: [
      '....kkkk....',
      '...khhhhk...',
      '..khhhhhhk..',
      '..khsssshk..',
      '..kskssksk..',
      '..kssssssk..',
      '...kssssk...',
      '..krrrrrrk..',
      '.ksrrrrrrek.',
      '.ksrrrrrrGk.',
      '..kbbbbbbk..',
      '..kbbkkbbk..',
      '..kkk..kkk..'
    ],
    dad: [
      '....kkkk....',
      '...khhhhk...',
      '..khsssshk..',
      '..kwwsswwk..',
      '..kssssssk..',
      '..kshhhhsk..',
      '...kssssk...',
      '.kggggggggk.',
      'kggggggggggk',
      'ksggggggggsk',
      'ksggggggggsk',
      '.kddddddddk.',
      '.kddkkkkddk.',
      '.kkk....kkk.'
    ],
    cat: [
      '..k.....k...',
      '.kok...kok..',
      '.kookkkook..',
      '.koyoooyok..',
      '.kooopoook..',
      '..koooook..k',
      '.koooooookok',
      '.kooOooOook.',
      '..kk.kk.kk..'
    ],
    mom: [
      '....kkkk....',
      '...khhhhk...',
      '..khhhhhhk..',
      '..khsssshk..',
      '..kskssksk..',
      '..kssRRssk..',
      '...kssssk...',
      '..kmmmmmmk..',
      '.kmsssssmmk.',
      '.kmmsssssmk.',
      '..kmmmmmmk..',
      '..kmmmmmmk..',
      '.kmmmmmmmmk.',
      '..kss..ssk..',
      '..kkk..kkk..'
    ],
    bag: [
      '...kk...',
      '..kyyk..',
      '...kk...',
      '.knnnnk.',
      'knnennnk',
      'knennnnk',
      'knnnnnnk',
      '.kkkkkk.'
    ],
    question: [
      '.www.',
      'w...w',
      '....w',
      '...w.',
      '..w..',
      '.....',
      '..w..'
    ],
    questionDark: [
      '.kkk.',
      'k...k',
      '....k',
      '...k.',
      '..k..',
      '.....',
      '..k..'
    ],
    thumb: [ // thumbs up, blue sleeve on the left
      '....kk..',
      '...ksk..',
      '...ksk..',
      'kkkssskk',
      'kbkssssk',
      'kbksskkk',
      'kbkssssk',
      'kbksskkk',
      'kbkssssk',
      'kkkkkkk.'
    ],
    heart: [
      '.RR.RR.',
      'RppRrrR',
      'RprrrrR',
      '.RrrrR.',
      '..RrR..',
      '...R...'
    ],
    // 7x7 chaos-die icons
    icon1: [ // cat
      'w.....w',
      'ww...ww',
      'wwwwwww',
      'w.www.w',
      'wwwpwww',
      'wwwwwww',
      '.wwwww.'
    ],
    icon2: [ // lego brick
      '.y...y.',
      'yyy.yyy',
      'yyyyyyy',
      'yyyyyyy',
      'yYYYYYy',
      'YYYYYYY',
      '.......'
    ],
    icon3: [ // mom "!"
      '..www..',
      '..www..',
      '..www..',
      '..www..',
      '...w...',
      '.......',
      '..www..'
    ],
    icon4: [ // shortcut arrow
      '...w...',
      '...ww..',
      'wwwwww.',
      'wwwwwww',
      'wwwwww.',
      '...ww..',
      '...w...'
    ],
    icon5: [ // eye
      '.......',
      '..www..',
      '.wwnww.',
      'wwnnnww',
      '.wwnww.',
      '..www..',
      '.......'
    ],
    icon6: [ // MEGA-BOT head (the kid's hero figurine)
      'y.....y',
      'w.....w',
      'wwwwwww',
      'wbwwwbw',
      'wwwwwww',
      'wyyyyyw',
      '.wwwww.'
    ],
    // MEGA-BOT action figure: an original toy robot hero (red/blue/yellow)
    megabot: [
      '...kkk...',
      '..kyyyk..',
      '.kbbbbbk.',
      '.kbwwwbk.',
      '.kbbbbbk.',
      'kkrrrrrkk',
      'krkryrkrk',
      'krkrrrkrk',
      'kkkbbbkkk',
      '..kbkbk..',
      '..kkkkk..'
    ]
  };

  const cache = {};
  function sprite(name) {
    if (cache[name]) return cache[name];
    const map = MAPS[name];
    const c = document.createElement('canvas');
    c.width = Math.max(...map.map(r => r.length));
    c.height = map.length;
    const g = c.getContext('2d');
    map.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = PAL[row[x]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    });
    cache[name] = c;
    return c;
  }

  // Draw a 16x16 die face into ctx at (x, y). kind: 'move' | 'chaos'. value 0 = blank "?".
  const PIPS = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]]
  };
  function drawDie(g, x, y, value, kind) {
    const body = kind === 'chaos' ? '#d8433b' : '#f6f1e6';
    const shade = kind === 'chaos' ? '#9e2a2f' : '#c9bfae';
    g.fillStyle = PAL.k;
    g.fillRect(x + 1, y, 14, 16); g.fillRect(x, y + 1, 16, 14);
    g.fillStyle = shade;
    g.fillRect(x + 1, y + 1, 14, 14);
    g.fillStyle = body;
    g.fillRect(x + 1, y + 1, 14, 12);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(x + 2, y + 2, 4, 1);
    if (!value) {
      // Dark "?" on the white Move die, white "?" on the red Chaos die
      g.drawImage(sprite(kind === 'chaos' ? 'question' : 'questionDark'), x + 5, y + 3);
      return;
    }
    if (kind === 'chaos') {
      g.drawImage(sprite('icon' + value), x + 4, y + 3);
    } else {
      g.fillStyle = value === 1 ? '#d8433b' : PAL.k;
      for (const [r, c] of PIPS[value]) g.fillRect(x + 3 + c * 4, y + 2 + r * 4, 2, 2);
    }
  }

  root.DadSprites = { PAL, MAPS, sprite, drawDie };
})(window);
