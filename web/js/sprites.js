// 16-bit placeholder avatars: 32x32 office workers with shading, outlines,
// eye glints and a two-frame walk cycle. Drawn in code, so custom avatars
// (pass two) can replace a key with a hand-drawn sheet later.

// h hair, c shirt, t tie, p trousers
export const PLACEHOLDERS = {
  placeholder_1: { h: '#6b3d1f', c: '#4fa3ff', t: '#b33a3a', p: '#2f3e6e' },
  placeholder_2: { h: '#e0c060', c: '#f2a7b8', t: '#2f3e6e', p: '#3a3a3a' },
  placeholder_3: { h: '#2b2b2b', c: '#5ccf6a', t: '#ffcc33', p: '#5a3d24' },
  placeholder_4: { h: '#b5562a', c: '#e8e4da', t: '#4a6fb5', p: '#36486b' },
  placeholder_5: { h: '#a8a8a8', c: '#b06bff', t: '#e8e4da', p: '#2b2b40' },
  placeholder_6: { h: '#3b2414', c: '#ff8a3d', t: '#2f9e44', p: '#6b2f2f' },
};

import { CUSTOM_AVATARS } from './avatars.js';

/** Every avatar the host can pick: the custom ones first, then the placeholder office workers. */
export const AVATAR_KEYS = [...Object.keys(CUSTOM_AVATARS), ...Object.keys(PLACEHOLDERS)];
export const avatarColour = (k) => CUSTOM_AVATARS[k]?.colour ?? PLACEHOLDERS[k]?.c ?? '#a99fcf';
export const avatarLabel = (k) => CUSTOM_AVATARS[k]?.label ?? k.replace('placeholder_', 'Office worker ');

export const SPRITE_SIZE = 32;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb = ([r, g, b]) => `rgb(${r | 0},${g | 0},${b | 0})`;
/** Lighten (f > 0) or darken (f < 0) a #rrggbb colour. */
export const shade = (h, f) => rgb(hex(h).map((c) => (f >= 0 ? c + (255 - c) * f : c * (1 + f))));

const cache = new Map();

/** Returns an offscreen 32x32 canvas for an avatar, frame 0 or 1. */
export function spriteCanvas(avatarKey, frame = 0, opts = {}) {
  const id = `${avatarKey}:${frame}:${opts.devil ? 1 : 0}:${opts.hell ? 1 : 0}`;
  if (cache.has(id)) return cache.get(id);
  const cv = document.createElement('canvas');
  cv.width = SPRITE_SIZE;
  cv.height = SPRITE_SIZE;
  const g = cv.getContext('2d');
  const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const custom = CUSTOM_AVATARS[avatarKey];
  if (custom) {
    custom.draw(px, shade, frame % 2);
    if (opts.devil) {
      const [l, r, y] = custom.horns;
      px(l, y, 2, 3, '#e8282a'); px(l - 1, y, 1, 1, '#e8282a'); px(l, y, 1, 1, '#ff7a6a');
      px(r, y, 2, 3, '#b81c1e'); px(r + 2, y, 1, 1, '#b81c1e');
    }
    return finish(g, px, cv, id, opts);
  }
  const pal = PLACEHOLDERS[avatarKey] ?? PLACEHOLDERS.placeholder_1;
  const skin = '#f1c39b';

  // legs and shoes: frame 1 steps
  const step = frame % 2 ? 1 : 0;
  px(10, 25, 5, 4 + step, pal.p); px(17, 25, 5, 4 - step, pal.p);
  px(13, 25, 2, 4, shade(pal.p, -0.35)); px(20, 25, 2, 4, shade(pal.p, -0.35));
  px(9, 29 + step, 6, 2, '#2b2b33'); px(17, 29 - step, 6, 2, '#2b2b33');
  px(10, 29 + step, 2, 1, '#6a6a7a'); px(18, 29 - step, 2, 1, '#6a6a7a');
  // torso with light from the left
  px(8, 16, 16, 9, pal.c);
  px(20, 16, 4, 9, shade(pal.c, -0.28));
  px(8, 16, 1, 9, shade(pal.c, 0.35));
  px(8, 24, 16, 1, shade(pal.c, -0.4));
  // collar and tie
  px(12, 16, 3, 2, '#ffffff'); px(17, 16, 3, 2, '#ffffff'); px(14, 17, 1, 1, '#d8d8e0'); px(17, 17, 1, 1, '#d8d8e0');
  px(15, 16, 2, 2, pal.t); px(15, 18, 2, 5, pal.t); px(16, 18, 1, 5, shade(pal.t, -0.3)); px(15, 23, 2, 1, shade(pal.t, -0.45));
  // arms swing opposite to legs
  px(6, 17 + step, 2, 7, pal.c); px(24, 17 - step, 2, 7, shade(pal.c, -0.28));
  px(6, 24 + step, 2, 2, skin); px(24, 24 - step, 2, 2, shade(skin, -0.15));
  // neck and head
  px(14, 14, 4, 2, shade(skin, -0.18));
  px(10, 4, 12, 11, skin);
  px(19, 5, 3, 10, shade(skin, -0.14));
  px(11, 13, 9, 2, shade(skin, -0.08));
  px(9, 8, 1, 3, shade(skin, -0.1)); px(22, 8, 1, 3, shade(skin, -0.22));
  // eyes with glints, brows, mouth, cheeks
  for (const ex of [12, 17]) { px(ex, 8, 2, 3, '#1b1730'); px(ex, 8, 1, 1, '#ffffff'); px(ex, 7, 2, 1, shade(pal.h, -0.2)); }
  px(14, 12, 3, 1, '#9b4a4a');
  px(11, 11, 1, 1, '#f29a9a'); px(20, 11, 1, 1, '#e08585');
  // hair with a highlight streak
  px(9, 2, 14, 4, pal.h);
  px(10, 1, 12, 1, pal.h);
  px(9, 6, 2, 4, pal.h); px(21, 6, 2, 4, shade(pal.h, -0.25));
  px(13, 6, 5, 1, pal.h); px(18, 6, 2, 1, shade(pal.h, -0.2));
  px(19, 2, 4, 4, shade(pal.h, -0.25));
  px(11, 2, 5, 1, shade(pal.h, 0.4)); px(12, 3, 2, 1, shade(pal.h, 0.25));
  // Devil's Deal horns
  if (opts.devil) {
    px(8, 0, 2, 3, '#e8282a'); px(7, 0, 1, 1, '#e8282a'); px(8, 0, 1, 1, '#ff7a6a');
    px(22, 0, 2, 3, '#b81c1e'); px(24, 0, 1, 1, '#b81c1e');
  }
  return finish(g, px, cv, id, opts);
}

/** Dark outline around the shape, then the Meeting Hell glow. */
function finish(g, px, cv, id, opts) {
  // dark outline around everything
  const img = g.getImageData(0, 0, SPRITE_SIZE, SPRITE_SIZE);
  const S = SPRITE_SIZE;
  const solid = (x, y) => x >= 0 && y >= 0 && x < S && y < S && img.data[(y * S + x) * 4 + 3] > 0;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) px(x, y, 1, 1, '#14101f');
  }
  // Meeting Hell glow
  if (opts.hell) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(255, 70, 0, 0.32)';
    g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'source-over';
  }
  cache.set(id, cv);
  return cv;
}

/**
 * Draws an avatar into a visible canvas. `scale` keeps its old meaning (multiples of 16px),
 * so scale 2 is 32px (1:1), 4 is 64px and 6 is 96px.
 */
export function paintAvatar(canvas, avatarKey, frame = 0, opts = {}) {
  const size = 16 * (opts.scale ?? 2);
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, size, size);
  g.drawImage(spriteCanvas(avatarKey, frame, opts), 0, 0, size, size);
}
