// 16-bit canvas board: a winding path through five office floors, Meeting Hell off
// to the side, reception (first day) at the bottom and Long Service Leave at the top.
// Static art (tiles, bands, Hell's room) is drawn once into a cached layer; each frame
// only adds what moves (sea, flames, power-up sparkle, flashes and the players).
import { spriteCanvas, shade } from './sprites.js';
import { pixelText, pixelTextWidth } from './pixelfont.js';

export const TILE = 48;
const COLS = 10;
const PAD = 16;
const BAND = 56; // start and finish bands
const HELL_W = 128;
const INK = '#14101f';

// Office floors, ground to top.
const ZONES = [
  { name: 'Onboarding', base: '#3f9e8f', pattern: 'dots' },
  { name: 'Open Plan', base: '#8a8f9c', pattern: 'weave' },
  { name: 'Meeting Rooms', base: '#4a6fb5', pattern: 'diag' },
  { name: 'Dedicated Desk', base: '#c2aa82', pattern: 'diamond' },
  { name: 'Dedicated Car Space', base: '#585c66', pattern: 'asphalt' },
];

export class Board {
  constructor(canvas, size = 100) {
    this.canvas = canvas;
    this.setSize(size);
    this.squares = [];
    this.tokens = []; // {id, avatarKey, pos, inHell, devil, me, walking, focus}
    this.showHidden = false;
    this.flash = null; // {idx, until, color}
    this.tick = 0;
    this.layer = null;
    this.layerKey = '';
    // redraw the cached layer once the pixel fonts have loaded
    document.fonts?.ready.then(() => { this.layerKey = ''; });
    const loop = () => {
      this.tick++;
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  setSize(size) {
    this.size = size;
    this.rows = Math.ceil(size / COLS);
    this.canvas.width = PAD * 2 + COLS * TILE + HELL_W + PAD;
    this.canvas.height = PAD * 2 + this.rows * TILE + BAND * 2;
    this.layerKey = '';
  }

  zone(idx) {
    return ZONES[Math.min(ZONES.length - 1, Math.floor(((idx - 1) / this.size) * ZONES.length))];
  }

  /** Centre point of a square. 0 = reception, > size = Long Service Leave, -1 = Meeting Hell. */
  xy(pos) {
    if (pos === -1) return { x: PAD * 2 + COLS * TILE + HELL_W / 2, y: PAD + BAND + (this.rows * TILE) / 2 + 20 };
    if (pos <= 0) return { x: PAD + TILE / 2, y: PAD + BAND + this.rows * TILE + BAND / 2 };
    if (pos > this.size) {
      const lastRow = this.rows - 1;
      const endCol = lastRow % 2 === 0 ? COLS - 1 : 0;
      return { x: PAD + endCol * TILE + TILE / 2, y: PAD + BAND / 2 };
    }
    const i = pos - 1;
    const r = Math.floor(i / COLS);
    const c = r % 2 === 0 ? i % COLS : COLS - 1 - (i % COLS);
    return { x: PAD + c * TILE + TILE / 2, y: PAD + BAND + (this.rows - 1 - r) * TILE + TILE / 2 };
  }

  // ---------------- frame ----------------

  draw() {
    const g = this.canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    const key = `${this.size}|${this.showHidden}|${JSON.stringify(this.squares.map((s) => [s.type, s.revealed, s.payload?.drop, s.payload?.gain, s.payload?.effect]))}`;
    if (key !== this.layerKey) {
      this.layer = document.createElement('canvas');
      this.layer.width = this.canvas.width;
      this.layer.height = this.canvas.height;
      this.drawStatic(this.layer.getContext('2d'));
      this.layerKey = key;
    }
    g.drawImage(this.layer, 0, 0);
    this.drawSea(g);
    for (const s of this.squares) if (s.type === 'powerup') this.drawPowerup(g, s.idx);
    this.drawFlames(g);
    if (this.flash && performance.now() < this.flash.until && Math.floor(this.tick / 4) % 2) {
      const { x, y } = this.xy(this.flash.idx);
      g.fillStyle = this.flash.color;
      g.fillRect(x - TILE / 2, y - TILE / 2, TILE, TILE);
    }
    this.drawTokens(g);
  }

  drawStatic(g) {
    g.imageSmoothingEnabled = false;
    px(g, 0, 0, this.layer.width, this.layer.height, '#1b1730');
    // board frame with drop shadow
    const bw = COLS * TILE;
    const bh = this.rows * TILE;
    px(g, PAD + 6, PAD + BAND + 6, bw, bh, 'rgba(0,0,0,0.35)');
    px(g, PAD - 3, PAD + BAND - 3, bw + 6, bh + 6, INK);
    this.drawBeach(g);
    this.drawReception(g);
    for (let i = 1; i <= this.size; i++) this.drawTile(g, i);
    this.drawHellRoom(g);
  }

  // ---------------- bands ----------------

  drawBeach(g) {
    const w = COLS * TILE;
    const x0 = PAD;
    const y0 = PAD;
    // sky, dithered from deep to pale
    for (let y = 0; y < 26; y += 2) for (let x = 0; x < w; x += 2) {
      const t = y / 26;
      const c = ((x + y) / 2) % 2 === 0 ? (t < 0.5 ? '#5aa8e6' : '#8cc8f0') : (t < 0.4 ? '#4a96d8' : '#7cbcea');
      px(g, x0 + x, y0 + y, 2, 2, c);
    }
    // sun with shading
    px(g, x0 + w - 48, y0 + 4, 18, 18, '#ffd34d'); px(g, x0 + w - 50, y0 + 8, 22, 10, '#ffd34d');
    px(g, x0 + w - 46, y0 + 6, 6, 4, '#fff3b0'); px(g, x0 + w - 36, y0 + 14, 6, 8, '#f2b632');
    // sea base (the shimmer is drawn per frame)
    px(g, x0, y0 + 26, w, 8, '#2f7fc4');
    // sand, dithered
    for (let y = 34; y < BAND - 6; y += 2) for (let x = 0; x < w; x += 2) {
      px(g, x0 + x, y0 + y, 2, 2, ((x * 7 + y * 13) % 11 === 0) ? '#d9b866' : ((x + y) / 2) % 2 ? '#f0d58c' : '#ead08a');
    }
    // palm tree
    for (let k = 0; k < 7; k++) { px(g, x0 + 30 + (k > 3 ? 1 : 0), y0 + 14 + k * 4, 5, 4, k % 2 ? '#8b5a2b' : '#a8743f'); px(g, x0 + 34, y0 + 14 + k * 4, 1, 4, '#6b4423'); }
    const frond = (dx, dy, wdt, c) => px(g, x0 + 32 + dx, y0 + 10 + dy, wdt, 3, c);
    frond(-16, 2, 14, '#2f9e44'); frond(-12, 0, 10, '#5fd17a'); frond(2, 2, 16, '#2f9e44'); frond(4, 0, 10, '#5fd17a');
    frond(-6, -4, 12, '#2f9e44'); frond(-20, 5, 6, '#227a33'); frond(16, 5, 6, '#227a33');
    px(g, x0 + 31, y0 + 12, 4, 3, '#6b4423');
    // umbrella and towel
    px(g, x0 + 88, y0 + 24, 2, 20, '#e8e4da');
    px(g, x0 + 74, y0 + 20, 30, 4, '#e84a4a'); px(g, x0 + 78, y0 + 18, 22, 2, '#ff7a6a'); px(g, x0 + 84, y0 + 20, 6, 4, '#f4ecd8'); px(g, x0 + 96, y0 + 20, 6, 4, '#f4ecd8');
    px(g, x0 + 96, y0 + 38, 26, 8, '#4fa3ff'); px(g, x0 + 96, y0 + 38, 26, 2, '#8cc8f0'); px(g, x0 + 104, y0 + 38, 4, 8, '#f4ecd8');
    // sign
    signPlate(g, x0 + w / 2 - 108, y0 + 6, 216, 20, 'LONG SERVICE LEAVE');
  }

  drawSea(g) {
    const w = COLS * TILE;
    for (let x = 0; x < w; x += 8) {
      const phase = (x / 8 + Math.floor(this.tick / 18)) % 4;
      if (phase === 0) px(g, PAD + x, PAD + 27, 6, 2, '#bfe3ff');
      if (phase === 2) px(g, PAD + x + 2, PAD + 31, 4, 1, '#8cc8f0');
    }
  }

  drawReception(g) {
    const w = COLS * TILE;
    const y = PAD + BAND + this.rows * TILE + 8;
    const h = BAND - 16;
    // marble floor
    for (let yy = 0; yy < h; yy += 8) for (let x = 0; x < w; x += 8) {
      px(g, PAD + x, y + yy, 8, 8, ((x + yy) / 8) % 2 ? '#3a3a4c' : '#323244');
      px(g, PAD + x, y + yy, 8, 1, '#44445a');
    }
    // lifts
    for (const lx of [w - 120, w - 64]) {
      px(g, PAD + lx - 2, y + 2, 56, h - 4, INK);
      px(g, PAD + lx, y + 4, 52, h - 8, '#a9aebb');
      px(g, PAD + lx, y + 4, 52, 2, '#d8dce6'); px(g, PAD + lx, y + 4, 2, h - 8, '#c9ccd6');
      px(g, PAD + lx + 25, y + 4, 2, h - 8, '#6b7080');
      px(g, PAD + lx + 22, y + 8, 8, 3, '#ffcc33');
    }
    // reception desk
    px(g, PAD + TILE + 14, y + 10, 162, 24, INK);
    px(g, PAD + TILE + 16, y + 12, 158, 20, '#8c4f35');
    px(g, PAD + TILE + 16, y + 12, 158, 3, '#ad6a4c'); px(g, PAD + TILE + 16, y + 29, 158, 3, '#5e3221');
    signPlate(g, PAD + TILE + 50, y + 15, 90, 14, 'FIRST DAY', 7);
    // pot plant
    px(g, PAD + TILE + 190, y + 20, 14, 14, '#8b5a2b'); px(g, PAD + TILE + 190, y + 20, 14, 2, '#a8743f');
    px(g, PAD + TILE + 186, y + 8, 22, 12, '#2f9e44'); px(g, PAD + TILE + 190, y + 6, 14, 4, '#5fd17a');
  }

  drawHellRoom(g) {
    const x0 = PAD * 2 + COLS * TILE;
    const y0 = PAD + BAND;
    const h = this.rows * TILE;
    px(g, x0 + 6, y0 + 6, HELL_W, h, 'rgba(0,0,0,0.35)');
    px(g, x0, y0, HELL_W, h, INK);
    for (let y = 4; y < h - 4; y += 2) for (let x = 4; x < HELL_W - 4; x += 2) {
      const t = y / h;
      const c = ((x + y) / 2) % 2 ? (t < 0.6 ? '#3b0a0a' : '#5a1010') : (t < 0.5 ? '#300808' : '#4a0d0d');
      px(g, x0 + x, y0 + y, 2, 2, c);
    }
    text(g, 'MEETING', x0 + HELL_W / 2, y0 + 26, '#ff8a3d', 10, 'center', true);
    text(g, 'HELL', x0 + HELL_W / 2, y0 + 46, '#ff8a3d', 13, 'center', true);
    pixelText(g, 'ROLL A 6', x0 + HELL_W / 2, y0 + 58, '#ffb347', { align: 'center', shadow: INK });
    pixelText(g, 'TO ESCAPE', x0 + HELL_W / 2, y0 + 68, '#ffb347', { align: 'center', shadow: INK });
    // wall clock (hands are drawn every frame, spinning)
    const ccx = x0 + HELL_W / 2;
    const ccy = y0 + 98;
    for (let yy = -11; yy <= 11; yy++) for (let xx = -11; xx <= 11; xx++) {
      const d = Math.hypot(xx, yy);
      if (d <= 11.5) px(g, ccx + xx, ccy + yy, 1, 1, d > 9.5 ? INK : d > 8.5 ? '#c9ccd6' : '#f4ecd8');
    }
    for (const [tx, ty] of [[0, -7], [7, 0], [0, 7], [-7, 0]]) px(g, ccx + tx, ccy + ty, 1, 1, INK);
    // whiteboard: no agenda, no end time
    const wx = x0 + 10;
    const wy = y0 + 122;
    px(g, wx - 2, wy - 2, HELL_W - 16, 54, INK);
    px(g, wx, wy, HELL_W - 20, 50, '#e8e4da');
    px(g, wx, wy, HELL_W - 20, 2, '#ffffff');
    px(g, wx, wy + 48, HELL_W - 20, 2, '#b9b4a6');
    pixelText(g, 'AGENDA:', wx + 5, wy + 6, '#2f4a80');
    pixelText(g, 'NONE', wx + 53, wy + 6, '#e84a4a');
    pixelText(g, 'ENDS:', wx + 5, wy + 20, '#2f4a80');
    pixelText(g, 'NEVER', wx + 41, wy + 20, '#e84a4a');
    px(g, wx + 5, wy + 33, 58, 1, '#8a8f9c');
    pixelText(g, 'AOB: YES', wx + 5, wy + 37, '#6b7080');
    // the endless meeting table and chairs
    const ty = y0 + 192;
    for (let k = 0; k < 4; k++) { px(g, x0 + 22 + k * 22, ty - 10, 10, 10, INK); px(g, x0 + 23 + k * 22, ty - 9, 8, 8, '#6b7080'); px(g, x0 + 23 + k * 22, ty - 9, 8, 2, '#a9aebb'); }
    px(g, x0 + 14, ty, HELL_W - 28, 12, INK);
    px(g, x0 + 16, ty + 2, HELL_W - 32, 8, '#5e3221'); px(g, x0 + 16, ty + 2, HELL_W - 32, 2, '#8c4f35');
    px(g, x0 + 30, ty - 3, 8, 4, '#f4ecd8'); px(g, x0 + 70, ty - 2, 6, 3, '#8c4f35'); px(g, x0 + 71, ty - 4, 4, 2, '#f4ecd8');
  }

  drawFlames(g) {
    const x0 = PAD * 2 + COLS * TILE;
    const y0 = PAD + BAND;
    const h = this.rows * TILE;
    const t = this.tick;
    const base = y0 + h - 4;
    const W = HELL_W - 8;
    // tongues of flame in 2px columns: hottest (white, yellow) at the base, dark red at the tips
    for (let c = 0; c < W; c += 2) {
      const tongue = Math.max(0, Math.cos((((c + Math.floor(t / 3)) % 18) - 9) / 9 * Math.PI / 2));
      const n = Math.sin(c * 0.21 + t * 0.13) * 6 + Math.sin(c * 0.07 - t * 0.09) * 8 + Math.sin(c * 0.53 + t * 0.31) * 3;
      const hgt = Math.max(8, Math.round((30 + n + tongue * 26) / 2) * 2);
      const x = x0 + 4 + c;
      const band = (from, to, col) => {
        const top = base - Math.round(hgt * to / 2) * 2;
        const bot = base - Math.round(hgt * from / 2) * 2;
        if (bot > top) px(g, x, top, 2, bot - top, col);
      };
      band(0.82, 1, '#7a0e0e');
      band(0.55, 0.82, '#d0201e');
      band(0.32, 0.55, '#ff5a1f');
      band(0.14, 0.32, '#ffa53a');
      band(0, 0.14, '#ffe27a');
      if (tongue > 0.85) band(0, 0.07, '#fff8d6');
    }
    // rising embers
    for (let k = 0; k < 14; k++) {
      const life = (t * 0.7 + k * 37) % 160;
      const ex = x0 + 6 + ((k * 53 + Math.floor((t + k * 40) / 160) * 29) % (W - 6)) + Math.round(Math.sin((t + k * 11) * 0.08) * 3);
      const ey = base - 30 - life;
      if (ey < y0 + 210) continue;
      if ((t + k) % 9 === 0) continue; // flicker
      px(g, ex, ey, 2, 2, life < 60 ? '#ffd34d' : life < 110 ? '#ff8a3d' : '#c41e1e');
    }
    // the clock's hands never stop spinning
    const ccx = x0 + HELL_W / 2;
    const ccy = y0 + 98;
    const hand = (angle, len, col) => {
      for (let r = 0; r <= len; r++) px(g, Math.round(ccx + Math.sin(angle) * r), Math.round(ccy - Math.cos(angle) * r), 1, 1, col);
    };
    hand(t * 0.012, 5, INK);
    hand(t * 0.15, 8, '#e84a4a');
    px(g, ccx, ccy, 1, 1, INK);
  }

  // ---------------- tiles ----------------

  drawTile(g, idx) {
    const { x, y } = this.xy(idx);
    const x0 = x - TILE / 2;
    const y0 = y - TILE / 2;
    const z = this.zone(idx);
    const b = z.base;
    px(g, x0, y0, TILE, TILE, shade(b, -0.55));
    px(g, x0 + 1, y0 + 1, TILE - 2, TILE - 2, b);
    texture(g, x0, y0, idx, z);
    // bevel: light from the top left
    px(g, x0 + 1, y0 + 1, TILE - 2, 2, shade(b, 0.28)); px(g, x0 + 1, y0 + 1, 2, TILE - 2, shade(b, 0.18));
    px(g, x0 + 1, y0 + TILE - 3, TILE - 2, 2, shade(b, -0.3)); px(g, x0 + TILE - 3, y0 + 1, 2, TILE - 2, shade(b, -0.22));
    // number plate
    // the square number goes on top of any icon, so it is drawn last
    const plate = () => {
      px(g, x0 + 3, y0 + 3, pixelTextWidth(idx) + 6, 13, INK);
      px(g, x0 + 4, y0 + 4, pixelTextWidth(idx) + 4, 11, '#2a2448');
      pixelText(g, idx, x0 + 6, y0 + 6, '#f4ecd8');
    };

    const sq = this.squares[idx - 1] ?? { type: 'normal' };
    const cx = x;
    const cy = y + 2;
    const hidden = sq.revealed === false;
    if ((sq.type === 'trap' || sq.type === 'boost') && hidden) {
      if (!this.showHidden) { plate(); return; }
      g.strokeStyle = sq.type === 'trap' ? '#e84a4a' : '#5ccf6a';
      g.setLineDash([3, 3]); g.lineWidth = 2; g.strokeRect(x0 + 5, y0 + 5, TILE - 10, TILE - 10); g.setLineDash([]);
      const label = sq.type === 'trap' ? (sq.payload?.effect ? 'STOP' : `-${sq.payload?.drop ?? ''}`) : (sq.payload?.effect ? '=4' : `+${sq.payload?.gain ?? ''}`);
      pixelText(g, label, cx, cy - 3, sq.type === 'trap' ? '#ffb3b3' : '#c8f5c8', { align: 'center', shadow: INK });
      plate();
      return;
    }
    if (sq.type === 'trap') {
      px(g, cx - 17, cy - 13, 34, 26, INK);
      for (let yy = 0; yy < 22; yy += 2) for (let xx = 0; xx < 30; xx += 2) {
        const d = yy / 22;
        px(g, cx - 15 + xx, cy - 11 + yy, 2, 2, ((xx + yy) / 2) % 2 === 0 ? (d < 0.5 ? '#3a1d14' : '#22110c') : (d < 0.3 ? '#4d2a1c' : '#160a08'));
      }
      for (let k = 0; k < 8; k++) {
        px(g, cx - 17 + k * 4.25, cy - 16, 4, 4, k % 2 ? '#ffcc33' : '#1b1730');
        if (k % 2) px(g, cx - 17 + k * 4.25, cy - 16, 4, 1, '#fff0a0');
      }
      if (sq.payload?.effect) pixelText(g, 'STOP', cx, cy - 3, '#ff5a5a', { align: 'center', shadow: INK });
      else pixelText(g, `-${sq.payload?.drop ?? ''}`, cx, cy - 7, '#ff5a5a', { scale: 2, align: 'center', shadow: INK });
    } else if (sq.type === 'decision') {
      px(g, cx - 2, cy - 6, 5, 20, INK); px(g, cx - 1, cy - 6, 3, 20, '#8b5a2b'); px(g, cx - 1, cy - 6, 1, 20, '#b07a45');
      px(g, cx - 15, cy - 17, 30, 14, INK);
      px(g, cx - 14, cy - 16, 28, 12, '#d9b27c'); px(g, cx - 14, cy - 16, 28, 2, '#f0d5a5'); px(g, cx - 14, cy - 6, 28, 2, '#a8814f');
      for (let k = 0; k < 3; k++) px(g, cx - 12, cy - 13 + k * 3, 24, 1, 'rgba(120,80,40,0.25)');
      pixelText(g, '?!', cx, cy - 13, '#b33a3a', { align: 'center' });
      px(g, cx - 8, cy + 14, 17, 3, 'rgba(0,0,0,0.3)');
    } else if (sq.type === 'boost') {
      px(g, cx - 14, cy - 15, 28, 28, INK);
      px(g, cx - 13, cy - 14, 26, 26, '#2f9e44');
      px(g, cx - 13, cy - 14, 26, 3, '#5fd17a'); px(g, cx - 13, cy - 14, 3, 26, '#4fc06a');
      px(g, cx + 9, cy - 14, 4, 26, '#227a33'); px(g, cx - 13, cy + 8, 26, 4, '#1d6b2c');
      if (sq.payload?.effect === 'cpi') {
        pixelText(g, '=4', cx - 1, cy - 8, '#ecffe9', { scale: 2, align: 'center', shadow: '#1d6b2c' });
      } else {
        px(g, cx - 2, cy - 9, 4, 9, '#ecffe9'); px(g, cx - 6, cy - 7, 12, 3, '#ecffe9'); px(g, cx - 4, cy - 10, 8, 3, '#ecffe9'); px(g, cx - 1, cy - 12, 2, 2, '#ecffe9');
        px(g, cx + 2, cy - 9, 1, 9, '#a8e6a8');
        pixelText(g, `+${sq.payload?.gain ?? ''}`, cx - 1, cy + 2, '#ecffe9', { align: 'center', shadow: '#1d6b2c' });
      }
    } else if (sq.type === 'survey') {
      px(g, cx - 12, cy - 15, 24, 30, INK);
      px(g, cx - 11, cy - 14, 22, 28, '#8b5a2b'); px(g, cx - 11, cy - 14, 2, 28, '#a8743f');
      px(g, cx - 8, cy - 11, 16, 22, '#f4ecd8'); px(g, cx + 6, cy - 11, 2, 22, '#d6cdb6');
      px(g, cx - 5, cy - 17, 10, 6, INK); px(g, cx - 4, cy - 16, 8, 4, '#c9ccd6'); px(g, cx - 4, cy - 16, 8, 1, '#ffffff');
      ['#2f9e44', '#e84a4a', '#2f9e44'].forEach((c, k) => { px(g, cx - 6, cy - 7 + k * 6, 3, 3, c); px(g, cx - 1, cy - 6 + k * 6, 7, 1, '#8a8f9c'); });
    }
    plate();
  }

  /** Power-up squares bob and sparkle, so they are drawn every frame. */
  drawPowerup(g, idx) {
    const { x, y: yc } = this.xy(idx);
    const cx = x;
    const bob = Math.floor(this.tick / 15) % 2;
    const y = yc + 5 - 12 + bob; // sits clear of the square number
    px(g, cx - 12, y + 24, 24, 3, 'rgba(0,0,0,0.3)');
    px(g, cx - 12, y, 24, 24, INK);
    px(g, cx - 11, y + 1, 22, 22, '#f2b632');
    px(g, cx - 11, y + 1, 22, 3, '#ffe27a'); px(g, cx - 11, y + 1, 3, 22, '#ffd34d');
    px(g, cx + 7, y + 1, 4, 22, '#c98a1a'); px(g, cx - 11, y + 19, 22, 4, '#b07612');
    pixelText(g, '?', cx - 1, y + 5, '#ffffff', { scale: 2, align: 'center', shadow: '#8a4b00' });
    if (Math.floor((this.tick + idx * 7) / 20) % 3 === 0) { px(g, cx + 9, y - 3, 2, 6, '#ffffff'); px(g, cx + 7, y - 1, 6, 2, '#ffffff'); }
  }

  // ---------------- clicks ----------------

  /** What sits under a click, in client coordinates. Tokens win over squares. */
  hitTest(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * this.canvas.width;
    const y = ((clientY - r.top) / r.height) * this.canvas.height;
    for (const h of [...(this.hits ?? [])].reverse()) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return { kind: 'player', id: h.id };
    }
    const gx = x - PAD;
    const gy = y - PAD - BAND;
    const hellX = PAD * 2 + COLS * TILE;
    if (x >= hellX && x <= hellX + HELL_W && gy >= 0 && gy <= this.rows * TILE) return { kind: 'hell' };
    if (gx < 0 || gx > COLS * TILE) return null;
    if (gy < 0) return y >= PAD ? { kind: 'export' } : null;
    if (gy > this.rows * TILE) return y <= PAD + BAND + this.rows * TILE + BAND ? { kind: 'start' } : null;
    const c = Math.floor(gx / TILE);
    const rFromBottom = this.rows - 1 - Math.floor(gy / TILE);
    const idx = rFromBottom * COLS + (rFromBottom % 2 === 0 ? c : COLS - 1 - c) + 1;
    return idx >= 1 && idx <= this.size ? { kind: 'square', idx } : null;
  }

  // ---------------- players ----------------

  drawTokens(g) {
    this.hits = [];
    const groups = new Map();
    for (const t of this.tokens) {
      const key = t.inHell ? 'hell' : String(Math.min(t.pos, this.size + 1));
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    }
    const ordered = [...this.tokens].sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0));
    for (const t of ordered) {
      const key = t.inHell ? 'hell' : String(Math.min(t.pos, this.size + 1));
      const group = groups.get(key);
      const n = group.length;
      const k = group.indexOf(t);
      const base = this.xy(t.inHell ? -1 : Math.min(t.pos, this.size + 1));
      const spread = t.inHell ? 22 : n > 1 ? 11 : 0;
      const ox = n > 1 ? ((k % 3) - (Math.min(n, 3) - 1) / 2) * spread : 0;
      const oy = n > 1 ? (Math.floor(k / 3) - 0.5) * spread * 0.8 : 0;
      const frame = t.walking ? Math.floor(this.tick / 6) % 2 : 0;
      const hop = t.walking && frame === 0 ? -3 : 0;
      const sx = Math.round(base.x + ox + (t.dx ?? 0) - 16);
      const sy = Math.round(base.y + oy + (t.dy ?? 0) - 26 + hop);
      if (t.me) {
        const blink = Math.floor(this.tick / 20) % 2;
        px(g, sx + 12, sy - 10 - blink * 2, 8, 4, INK);
        px(g, sx + 13, sy - 9 - blink * 2, 6, 3, '#ffcc33');
        px(g, sx + 14, sy - 6 - blink * 2, 4, 2, '#ffcc33');
        px(g, sx + 15, sy - 4 - blink * 2, 2, 1, '#ffcc33');
      }
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(sx + 7, sy + 30 - hop, 18, 3);
      g.fillRect(sx + 9, sy + 33 - hop, 14, 1);
      g.drawImage(spriteCanvas(t.avatarKey, frame, { devil: t.devil, hell: t.inHell }), sx, sy, 32, 32);
      this.hits.push({ id: t.id, x: sx + 4, y: sy, w: 24, h: 34 });
      if (t.focus) {
        g.strokeStyle = '#ffffff';
        g.lineWidth = 2;
        g.strokeRect(sx - 2, sy - 2, 36, 38);
      }
    }
  }
}

// ---------------- helpers ----------------

function px(g, x, y, w, h, c) {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

function texture(g, x0, y0, idx, z) {
  const b = z.base;
  for (let y = 0; y < TILE - 6; y += 2) for (let x = 0; x < TILE - 6; x += 2) {
    const X = x0 + 3 + x;
    const Y = y0 + 3 + y;
    switch (z.pattern) {
      case 'dots':
        if (x % 6 === 2 && y % 6 === 2) px(g, X, Y, 2, 2, shade(b, 0.18));
        else if (x % 6 === 5 && y % 6 === 5) px(g, X, Y, 1, 1, shade(b, -0.15));
        break;
      case 'weave':
        if (((x + y) / 2) % 2 === 0) px(g, X, Y, 2, 2, shade(b, -0.07));
        if ((x * 7 + y * 13 + idx * 31) % 97 === 0) px(g, X, Y, 2, 2, shade(b, -0.25));
        break;
      case 'diag':
        if ((x + y) % 8 === 0) px(g, X, Y, 2, 2, shade(b, -0.12));
        if ((x - y + 64) % 16 === 0) px(g, X, Y, 2, 2, shade(b, 0.12));
        break;
      case 'diamond': {
        const d = (Math.abs((x % 14) - 7) + Math.abs((y % 14) - 7));
        if (d === 6) px(g, X, Y, 2, 2, shade(b, -0.12));
        else if (d === 0) px(g, X, Y, 2, 2, shade(b, 0.2));
        break;
      }
      case 'asphalt':
        if ((x * 11 + y * 7 + idx * 13) % 23 === 0) px(g, X, Y, 2, 2, shade(b, 0.16));
        else if ((x * 5 + y * 17 + idx * 7) % 29 === 0) px(g, X, Y, 2, 2, shade(b, -0.2));
        break;
    }
  }
  if (z.pattern === 'asphalt') {
    // bay lines and a wheel stop on each car space
    px(g, x0 + 3, y0 + 3, 2, TILE - 6, '#e8e4da');
    px(g, x0 + 14, y0 + TILE - 9, 20, 3, '#ffcc33'); px(g, x0 + 14, y0 + TILE - 9, 20, 1, '#fff0a0');
    if ((idx * 37) % 5 === 0) { px(g, x0 + 26, y0 + 22, 8, 4, '#2b2e36'); px(g, x0 + 24, y0 + 24, 12, 2, '#2b2e36'); }
  }
}

function signPlate(g, x, y, w, h, label, size = 8) {
  px(g, x - 2, y - 2, w + 4, h + 4, INK);
  px(g, x, y, w, h, '#f4ecd8');
  px(g, x, y, w, 2, '#ffffff');
  px(g, x, y + h - 2, w, 2, '#c9c2b0');
  text(g, label, x + w / 2, y + h / 2 + size / 2, '#1b1730', size, 'center', true);
}

/** heading: chunky arcade font; body: DotGothic16. Board numbers and labels use the bitmap font in pixelfont.js. */
function text(g, s, x, y, color, size, align, heading = false, body = false, bold = false) {
  g.font = heading ? `${size}px PressStart, monospace` : `${bold ? 'bold ' : ''}${size}px BodyPixel, monospace`;
  g.textAlign = align;
  g.fillStyle = color;
  g.fillText(s, x, y);
}
