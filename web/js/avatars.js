// Custom 32x32 avatars, drawn in code to match the 16-bit placeholders.
// Each draw(px, shade, frame) paints one frame; `horns` places the Devil's Deal horns: [leftX, rightX, topY].

const OUT = '#14101f';

export const CUSTOM_AVATARS = {
  boot: {
    label: 'Boot', colour: '#d29a62',
    horns: [8, 16, 0],
    draw(px, shade, f) {
      const b = '#8a5a2b', d = '#5a3a1c', l = '#b98250', sole = '#2b2015', lace = '#efe6c8';
      const y = f ? -1 : 0; // a little hop
      px(6, 4 + y, 2, 4, d); // pull tab
      px(7, 3 + y, 12, 2, d); px(7, 5 + y, 12, 1, l); // cuff
      px(8, 6 + y, 10, 16, b); px(15, 6 + y, 3, 16, shade(b, -0.22)); px(8, 6 + y, 1, 16, l);
      px(8, 20 + y, 14, 7, b); px(22, 21 + y, 3, 6, b); px(25, 22 + y, 2, 5, b); px(27, 24 + y, 1, 3, b);
      px(20, 21 + y, 5, 1, l); px(25, 22 + y, 1, 1, l);
      px(8, 26 + y, 20, 1, shade(b, -0.3));
      for (let ly = 8; ly <= 19; ly += 3) { px(15, ly + y, 4, 1, lace); px(18, ly + y, 1, 1, '#c9b27a'); }
      px(7, 27 + y, 22, 2, sole); px(7, 29 + y, 6, 1, sole); px(14, 27 + y, 13, 1, '#4a3a2a');
    },
  },

  bulldozer: {
    label: 'Bulldozer', colour: '#f2c53a',
    horns: [10, 16, 3],
    draw(px, shade, f) {
      const yel = '#f2b705', dk = '#b88700', lt = '#ffd84a', trk = '#2b2b33';
      // exhaust smoke drifts
      px(20 + f, 3 - f, 3, 2, '#c8c8d0'); px(22 + f, 1 - f, 2, 1, '#dcdce4');
      px(21, 7, 2, 6, '#3a3a44');
      // cab
      px(8, 5, 11, 2, dk); px(9, 7, 9, 9, yel); px(9, 7, 1, 9, lt);
      px(11, 9, 6, 5, '#8fd3ff'); px(11, 9, 2, 1, '#e8f7ff'); px(16, 9, 1, 5, '#5aa8d8');
      // engine and body
      px(18, 12, 8, 4, yel); px(18, 12, 8, 1, lt);
      for (const gx of [20, 22, 24]) px(gx, 13, 1, 3, dk);
      px(8, 16, 19, 8, yel); px(8, 16, 19, 1, lt); px(8, 23, 19, 1, dk); px(24, 16, 3, 8, shade(yel, -0.15));
      px(10, 18, 6, 2, '#14101f'); // decal stripe
      px(11, 18, 4, 1, '#f2f2f2');
      // push arm and blade
      px(25, 20, 4, 2, dk);
      px(28, 13, 3, 16, '#8a8a96'); px(29, 12, 2, 1, '#8a8a96'); px(30, 13, 1, 16, '#5a5a66'); px(27, 28, 4, 1, '#5a5a66');
      // tracks with moving tread
      px(6, 24, 21, 6, trk); px(5, 25, 1, 4, trk); px(27, 25, 1, 4, trk);
      for (const wx of [8, 13, 18, 23]) { px(wx - 1, 25, 3, 3, '#55555f'); px(wx, 26, 1, 1, '#a0a0ac'); }
      for (let tx = 6 + f; tx < 27; tx += 2) { px(tx, 24, 1, 1, '#5a5a66'); px(tx, 29, 1, 1, '#5a5a66'); }
    },
  },

  sailboat: {
    label: 'Sail boat', colour: '#8fd0ff',
    horns: [14, 19, 0],
    draw(px, shade, f) {
      const y = f; // bobs on the swell
      // water
      px(0, 28, 32, 4, '#2f74c0');
      for (let wx = f ? 2 : 0; wx < 32; wx += 5) { px(wx, 27, 3, 1, '#8fd0ff'); px(wx + 1, 26, 1, 1, '#cfeeff'); }
      px(0, 30, 32, 1, '#245ea0');
      // mast, flag and boom
      px(16, 3 + y, 2, 19, '#6b4a2b'); px(16, 3 + y, 1, 19, '#8a6a4a');
      px(18, 2 + y, 4, 2, '#ffcc33'); px(22, 3 + y - f, 1, 1, '#ffcc33');
      // mainsail and jib
      for (let sy = 4; sy <= 20; sy++) {
        const w = Math.floor((sy - 3) * 0.65);
        px(18, sy + y, w, 1, '#f4f0e6'); if (w > 1) px(18 + w - 1, sy + y, 1, 1, '#c9c2b0');
      }
      px(19, 12 + y, 6, 1, '#d84a4a');
      for (let sy = 7; sy <= 20; sy++) {
        const w = Math.floor((sy - 6) * 0.55);
        if (w > 0) { px(15 - w, sy + y, w, 1, '#e6e0d0'); px(15 - w, sy + y, 1, 1, '#c9c2b0'); }
      }
      px(14, 21 + y, 13, 1, '#6b4a2b');
      // hull
      px(4, 22 + y, 25, 1, '#f4f0e6');
      px(4, 23 + y, 25, 2, '#c8333a'); px(5, 25 + y, 23, 1, '#c8333a'); px(7, 26 + y, 19, 1, '#8a1f25'); px(9, 27 + y, 15, 1, '#8a1f25');
      px(4, 23 + y, 25, 1, '#e0565c');
      for (const hx of [10, 15, 20]) px(hx, 24 + y, 1, 1, '#8fd0ff');
    },
  },

  racecar: {
    label: 'Race car', colour: '#ff6a5a',
    horns: [14, 19, 10],
    draw(px, shade, f) {
      const r = '#e8282a', dk = '#a01416', lt = '#ff7a6a';
      // wings
      px(1, 12, 6, 2, '#2b2b33'); px(3, 14, 2, 5, '#2b2b33');
      px(25, 25, 6, 2, '#2b2b33');
      // body and nose
      px(5, 18, 22, 6, r); px(27, 20, 3, 4, r); px(30, 21, 1, 3, r);
      px(5, 18, 22, 1, lt); px(5, 23, 25, 1, dk);
      px(8, 15, 8, 3, r); px(8, 15, 8, 1, lt); px(7, 16, 1, 2, r);
      // driver
      px(16, 16, 6, 2, '#14101f');
      px(16, 12, 5, 5, '#ffcc33'); px(16, 12, 5, 1, '#ffe680'); px(18, 13, 3, 2, '#1b1730'); px(19, 13, 1, 1, '#8fd3ff');
      // number roundel and stripe
      px(10, 19, 5, 4, '#f4f4f4'); px(12, 20, 1, 2, '#14101f'); px(11, 20, 1, 1, '#14101f');
      px(17, 20, 9, 1, '#f4f4f4');
      // wheels with turning hubs
      for (const wx of [8, 24]) {
        px(wx - 3, 21, 6, 8, '#1b1b22'); px(wx - 4, 22, 8, 6, '#1b1b22');
        px(wx - 2, 23, 4, 4, '#a8a8b8');
        if (f) px(wx - 2, 24, 4, 2, '#5a5a66'); else px(wx - 1, 23, 2, 4, '#5a5a66');
        px(wx - 3, 22, 2, 1, '#3a3a44');
      }
      // speed lines
      if (f) { px(0, 19, 3, 1, '#c8d4ff'); px(0, 22, 2, 1, '#c8d4ff'); }
    },
  },

  heeler: {
    label: 'Blue cattle dog', colour: '#9fb4d6',
    horns: [21, 28, 0],
    draw(px, shade, f) {
      const c = '#6d7f99', cd = '#4a5870', cl = '#a9b8cc', tan = '#c8803a', blk = '#1b1730';
      // tail wags
      if (f) { px(2, 11, 2, 4, c); px(3, 14, 4, 2, c); px(2, 10, 2, 1, blk); }
      else { px(1, 15, 2, 4, c); px(2, 14, 5, 2, c); px(1, 19, 2, 1, blk); }
      // body with speckles
      px(6, 13, 16, 9, c); px(7, 12, 13, 1, c); px(21, 14, 3, 7, c);
      px(6, 21, 16, 1, cd); px(7, 12, 12, 1, cl);
      for (const [sx, sy] of [[8, 14], [11, 16], [14, 14], [17, 17], [9, 19], [13, 19], [19, 15], [16, 20], [10, 13]]) px(sx, sy, 1, 1, cd);
      for (const [sx, sy] of [[9, 16], [12, 14], [15, 17], [18, 19], [11, 20], [20, 17]]) px(sx, sy, 1, 1, cl);
      px(21, 17, 3, 4, tan); // chest
      // legs: upper coat, lower tan
      const legs = f ? [[7, 1], [10, 0], [18, 0], [21, 1]] : [[7, 0], [10, 1], [18, 1], [21, 0]];
      for (const [lx, o] of legs) { px(lx + o, 22, 2, 3, c); px(lx + o, 25, 2, 3, tan); px(lx + o, 28, 3, 1, shade(tan, -0.3)); }
      // neck and head
      px(21, 9, 5, 6, c); px(22, 5, 8, 8, c); px(22, 5, 8, 1, cl);
      px(28, 9, 3, 3, tan); px(29, 12, 2, 1, tan); px(31, 9, 1, 2, blk);
      px(24, 7, 3, 3, blk); px(25, 8, 1, 1, '#3a2a1a'); px(25, 7, 1, 1, '#ffffff'); // mask and eye
      px(26, 10, 2, 2, tan);
      px(27, 5, 1, 3, '#e8e8f0'); // white blaze
      // pointy ears
      px(22, 2, 2, 3, c); px(23, 1, 1, 1, c); px(23, 3, 1, 2, '#c88a7a');
      px(26, 2, 2, 3, cd); px(26, 1, 1, 1, cd);
    },
  },

  platypus: {
    label: 'Platypus', colour: '#c8925a',
    horns: [20, 25, 9],
    draw(px, shade, f) {
      const b = '#7a4f2b', l = '#a8743f', d = '#4e3018', bill = '#3a3a44';
      // flat tail
      px(0, 19, 7, 4, '#5e3c1e'); px(1, 18, 5, 1, '#5e3c1e'); px(1, 23, 5, 1, '#5e3c1e');
      px(1, 20, 4, 1, d); px(1, 22, 4, 1, d);
      // body
      px(6, 15, 18, 10, b); px(5, 17, 1, 6, b); px(8, 14, 14, 1, b); px(8, 25, 14, 1, b);
      px(8, 14, 12, 1, l); px(7, 16, 2, 6, l); px(9, 23, 13, 2, l);
      for (const [sx, sy] of [[11, 17], [15, 16], [18, 19], [12, 21], [16, 21], [20, 17]]) px(sx, sy, 1, 1, d);
      // head and wide duck bill
      px(20, 13, 6, 8, b); px(21, 12, 4, 1, b); px(21, 12, 3, 1, l);
      px(25, 14, 7, 5, '#4f4f5e'); px(26, 13, 5, 1, '#4f4f5e'); px(26, 19, 5, 1, '#3a3a46');
      px(26, 14, 5, 1, '#7c7c8c'); px(25, 17, 7, 1, '#3a3a46'); px(29, 15, 1, 1, OUT);
      px(23, 15, 1, 1, OUT); px(23, 14, 1, 1, '#ffffff');
      // webbed feet paddle
      const o = f ? 1 : 0;
      px(19 + o, 25, 3, 2, d); px(18 + o, 27, 6, 1, '#3a2a1a');
      px(9 - o, 25, 3, 2, d); px(8 - o, 27, 6, 1, '#3a2a1a');
    },
  },

  angus: {
    label: 'Angus cow', colour: '#b8b0c8',
    horns: [25, 29, 6],
    draw(px, shade, f) {
      const k = '#2c2a35', kl = '#4d495c', kd = '#1d1b24', hoof = '#5a4a3a';
      // tail swishes
      px(3, 12, 1, 7, k); if (f) px(1, 18, 3, 2, OUT); else px(2, 19, 3, 2, OUT);
      // body
      px(4, 11, 20, 11, k); px(6, 10, 16, 1, k); px(6, 22, 16, 1, k);
      px(6, 10, 15, 1, kl); px(4, 12, 1, 7, kl); px(8, 12, 10, 1, kl);
      px(6, 21, 16, 1, kd);
      // legs
      const legs = f ? [[6, 1], [10, 0], [18, 0], [21, 1]] : [[6, 0], [10, 1], [18, 1], [21, 0]];
      for (const [lx, o] of legs) { px(lx + o, 23, 2, 5, k); px(lx + o, 23, 1, 5, kl); px(lx + o, 28, 2, 1, hoof); }
      // udder
      px(13, 22, 4, 2, '#e8a0a8'); px(13, 22, 4, 1, '#f4c0c6');
      // neck, head hanging a little, and pale muzzle
      px(22, 11, 4, 7, k); px(25, 10, 5, 9, k); px(26, 9, 3, 1, k); px(25, 10, 4, 1, kl);
      px(26, 16, 5, 4, '#9a8a90'); px(27, 16, 3, 1, '#b8a8ae'); px(27, 18, 1, 1, '#4a3a3a'); px(29, 18, 1, 1, '#4a3a3a');
      px(26, 12, 2, 1, '#e8e8f0'); px(27, 12, 1, 1, OUT);
      // ear sticking out with a yellow tag
      px(21, 10, 4, 2, k); px(20, 11, 1, 1, k); px(22, 12, 1, 2, '#ffcc33');
    },
  },

  viking: {
    label: 'Viking', colour: '#e8823a',
    horns: [11, 19, 0],
    draw(px, shade, f) {
      const skin = '#f1c39b', beard = '#d9662b', bd = '#a84a1c', tunic = '#3a6ea5', fur = '#8a6a4a', steel = '#a8a8b8', horn = '#e8dcc0';
      const step = f ? 1 : 0;
      // legs and fur boots
      px(10, 25, 5, 4 + step, '#5a3d24'); px(17, 25, 5, 4 - step, '#5a3d24');
      px(9, 28 + step, 6, 3, fur); px(17, 28 - step, 6, 3, fur);
      // tunic, belt and fur shoulders
      px(8, 16, 16, 9, tunic); px(20, 16, 4, 9, shade(tunic, -0.28)); px(8, 16, 1, 9, shade(tunic, 0.3));
      px(8, 22, 16, 1, '#5a3d24'); px(15, 22, 2, 1, '#ffcc33');
      px(7, 15, 18, 2, fur); px(8, 15, 6, 1, shade(fur, 0.3));
      // arm and round shield
      px(24, 17 - step, 2, 7, shade(tunic, -0.28)); px(24, 24 - step, 2, 2, skin);
      px(3, 17, 8, 9, '#b33a3a'); px(4, 16, 6, 1, '#b33a3a'); px(4, 26, 6, 1, '#b33a3a');
      px(3, 17, 8, 1, '#d85a5a'); px(6, 17, 2, 9, '#e8e4da'); px(6, 20, 2, 2, '#c8c8d0');
      // face
      px(14, 14, 4, 2, shade(skin, -0.18));
      px(10, 6, 12, 9, skin); px(19, 7, 3, 7, shade(skin, -0.14));
      for (const ex of [12, 17]) { px(ex, 8, 2, 2, '#1b1730'); px(ex, 8, 1, 1, '#ffffff'); }
      px(15, 9, 2, 2, shade(skin, -0.2));
      // big beard and moustache
      px(10, 11, 12, 5, beard); px(11, 16, 10, 2, beard); px(13, 18, 6, 1, beard);
      px(12, 11, 8, 1, bd); px(14, 13, 4, 1, '#7a2a1a'); px(19, 12, 3, 5, bd);
      // horned helmet
      px(11, 1, 10, 1, steel); px(9, 2, 14, 4, steel); px(9, 6, 14, 1, '#6a6a7a'); px(10, 2, 4, 1, '#e0e0ea');
      px(15, 6, 2, 2, '#6a6a7a');
      px(6, 3, 3, 2, horn); px(5, 0, 2, 4, horn); px(23, 3, 3, 2, shade(horn, -0.15)); px(25, 0, 2, 4, shade(horn, -0.15));
    },
  },
};
