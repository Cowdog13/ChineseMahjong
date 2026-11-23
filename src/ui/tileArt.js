// Tile faces drawn as inline SVG (viewBox 60 x 80), so there are no image assets.
import {
  isWind, isDragon, isFlower, isSeason, suitOf, rankOf, NUM_ZH, WIND_ZH, FLOWER_ZH, SEASON_ZH, bonusNumber,
} from '../engine/tiles.js';

const INK = '#1d2a6b';
const RED = '#c8202f';
const GRN = '#11804a';
const BLU = '#1f4fa8';
const FONT = `font-family="'Noto Serif TC','Noto Serif SC','Songti SC','SimSun',serif"`;

const cache = new Map();

export function tileSVG(kind, hints = true) {
  const key = `${kind}:${hints}`;
  if (!cache.has(key)) cache.set(key, `<svg viewBox="0 0 60 80" aria-hidden="true">${face(kind)}${hints ? hint(kind) : ''}</svg>`);
  return cache.get(key);
}

function face(k) {
  if (k < 9) return characters(k);
  if (k < 18) return dots(rankOf(k));
  if (k < 27) return bamboo(rankOf(k));
  if (isWind(k)) return bigChar(WIND_ZH[k - 27], INK);
  if (isDragon(k)) {
    if (k === 31) return bigChar('中', RED);
    if (k === 32) return bigChar('發', GRN);
    return `<rect x="13" y="14" width="34" height="52" rx="3" fill="none" stroke="${BLU}" stroke-width="3"/>
            <rect x="18" y="19" width="24" height="42" rx="2" fill="none" stroke="${BLU}" stroke-width="1.5"/>`;
  }
  if (isFlower(k)) return bonus(FLOWER_ZH[k - 34], bonusNumber(k), RED, GRN);
  if (isSeason(k)) return bonus(SEASON_ZH[k - 38], bonusNumber(k), BLU, RED);
  return '';
}

function bigChar(ch, color) {
  return `<text x="30" y="52" text-anchor="middle" font-size="40" font-weight="700" fill="${color}" ${FONT}>${ch}</text>`;
}

function characters(k) {
  return `<text x="30" y="34" text-anchor="middle" font-size="27" font-weight="700" fill="${INK}" ${FONT}>${NUM_ZH[k]}</text>
          <text x="30" y="68" text-anchor="middle" font-size="30" font-weight="700" fill="${RED}" ${FONT}>萬</text>`;
}

function bonus(ch, n, c1, c2) {
  return `<text x="30" y="52" text-anchor="middle" font-size="34" font-weight="700" fill="${c1}" ${FONT}>${ch}</text>
          <text x="9" y="17" font-size="13" font-weight="700" fill="${c2}" font-family="sans-serif">${n}</text>`;
}

// --- Dots -----------------------------------------------------------------

function dot(x, y, r, color) {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>
          <circle cx="${x}" cy="${y}" r="${r * 0.68}" fill="#fffdf6"/>
          <circle cx="${x}" cy="${y}" r="${r * 0.42}" fill="${color}"/>`;
}

const DOT_LAYOUT = {
  2: [[30, 23, GRN], [30, 57, BLU]],
  3: [[16, 18, BLU], [30, 40, RED], [44, 62, GRN]],
  4: [[19, 23, BLU], [41, 23, GRN], [19, 57, GRN], [41, 57, BLU]],
  5: [[17, 19, BLU], [43, 19, GRN], [30, 40, RED], [17, 61, GRN], [43, 61, BLU]],
  6: [[19, 17, GRN], [41, 17, GRN], [19, 41, RED], [41, 41, RED], [19, 63, RED], [41, 63, RED]],
  7: [[14, 13, GRN], [30, 21, GRN], [46, 29, GRN], [19, 48, RED], [41, 48, RED], [19, 66, RED], [41, 66, RED]],
  8: [[19, 13, BLU], [41, 13, BLU], [19, 31, BLU], [41, 31, BLU], [19, 49, BLU], [41, 49, BLU], [19, 67, BLU], [41, 67, BLU]],
  9: [[14, 17, BLU], [30, 17, BLU], [46, 17, BLU], [14, 40, RED], [30, 40, RED], [46, 40, RED], [14, 63, GRN], [30, 63, GRN], [46, 63, GRN]],
};
const DOT_R = { 2: 11, 3: 9, 4: 10, 5: 8.5, 6: 9, 7: 7.5, 8: 7.8, 9: 7.6 };

function dots(n) {
  if (n === 1) {
    return `<circle cx="30" cy="40" r="20" fill="${GRN}"/><circle cx="30" cy="40" r="16" fill="#fffdf6"/>
            <circle cx="30" cy="40" r="13" fill="${RED}"/><circle cx="30" cy="40" r="8" fill="#fffdf6"/>
            <circle cx="30" cy="40" r="5" fill="${BLU}"/>`;
  }
  return DOT_LAYOUT[n].map(([x, y, c]) => dot(x, y, DOT_R[n], c)).join('');
}

// --- Bamboo ---------------------------------------------------------------

function stick(x, y, h, color) {
  const w = 7;
  return `<g><rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="3" fill="${color}"/>
          <rect x="${x - 0.8}" y="${y - h / 2 + 2}" width="1.6" height="${h - 4}" fill="#fffdf6" opacity=".55"/>
          <rect x="${x - w / 2 - 0.6}" y="${y - 1.2}" width="${w + 1.2}" height="2.4" rx="1" fill="${color}" stroke="#fffdf6" stroke-width=".6"/></g>`;
}

const BAM_LAYOUT = {
  2: [[30, 23, BLU], [30, 57, GRN]],
  3: [[30, 23, BLU], [19, 57, GRN], [41, 57, GRN]],
  4: [[19, 23, BLU], [41, 23, GRN], [19, 57, GRN], [41, 57, BLU]],
  5: [[16, 23, GRN], [44, 23, BLU], [30, 40, RED], [16, 57, BLU], [44, 57, GRN]],
  6: [[15, 23, GRN], [30, 23, GRN], [45, 23, GRN], [15, 57, BLU], [30, 57, BLU], [45, 57, BLU]],
  7: [[30, 15, RED], [15, 40, GRN], [30, 40, BLU], [45, 40, GRN], [15, 65, GRN], [30, 65, BLU], [45, 65, GRN]],
  8: [[12, 23, GRN], [24, 23, BLU], [36, 23, BLU], [48, 23, GRN], [12, 57, GRN], [24, 57, BLU], [36, 57, BLU], [48, 57, GRN]],
  9: [[15, 15, RED], [30, 15, BLU], [45, 15, GRN], [15, 40, RED], [30, 40, BLU], [45, 40, GRN], [15, 65, RED], [30, 65, BLU], [45, 65, GRN]],
};

function bamboo(n) {
  if (n === 1) return bird();
  const h = n >= 7 ? 21 : 28;
  return BAM_LAYOUT[n].map(([x, y, c]) => stick(x, y, n === 5 && c === RED ? 22 : h, c)).join('');
}

// The one of bamboo is traditionally a bird.
function bird() {
  return `<path d="M14 58 C10 44 18 30 30 30 C36 30 40 26 41 20 C42 15 47 13 50 16 L54 17 L50 20 C50 30 46 40 38 46 L44 62 L40 63 L33 49 C28 51 23 52 19 56 Z" fill="${GRN}"/>
          <path d="M16 56 C20 46 28 42 36 44 C30 50 24 54 16 56 Z" fill="${RED}"/>
          <path d="M14 58 L6 70 L12 69 L10 76 L18 64 Z" fill="${BLU}"/>
          <circle cx="46" cy="18" r="1.6" fill="#fffdf6"/>`;
}

// Small corner hint for players still learning the characters.
function hint(k) {
  let label;
  let color = '#6b6250';
  if (k < 27) {
    label = String(rankOf(k));
    if (suitOf(k) !== 0) return '';
    color = INK;
  } else if (isWind(k)) label = 'ESWN'[k - 27];
  else return '';
  return `<text x="52" y="15" text-anchor="middle" font-size="11" font-weight="700" fill="${color}" font-family="sans-serif">${label}</text>`;
}
