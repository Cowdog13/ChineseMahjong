// Tile definitions.
//
// Every physical tile is { id, kind }. `kind` is a number:
//   0-8   Characters (萬) 1-9
//   9-17  Dots (筒) 1-9
//   18-26 Bamboo (索) 1-9
//   27-30 Winds: East, South, West, North
//   31-33 Dragons: Red (中), Green (發), White (白)
//   34-37 Flowers: Plum, Orchid, Chrysanthemum, Bamboo (bonus, numbered 1-4)
//   38-41 Seasons: Spring, Summer, Autumn, Winter (bonus, numbered 1-4)

export const KINDS = 34; // playable (non-bonus) kinds
export const EAST = 27;
export const RED = 31;
export const GREEN = 32;
export const WHITE = 33;
export const FLOWER = 34;
export const SEASON = 38;

export const SUIT_NAMES = ['Characters', 'Dots', 'Bamboo'];
export const SUIT_ZH = ['萬', '筒', '索'];
export const WIND_NAMES = ['East', 'South', 'West', 'North'];
export const WIND_ZH = ['東', '南', '西', '北'];
export const DRAGON_NAMES = ['Red', 'Green', 'White'];
export const DRAGON_ZH = ['中', '發', '白'];
export const FLOWER_NAMES = ['Plum', 'Orchid', 'Chrysanthemum', 'Bamboo'];
export const FLOWER_ZH = ['梅', '蘭', '菊', '竹'];
export const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const SEASON_ZH = ['春', '夏', '秋', '冬'];
export const NUM_ZH = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

export const isSuited = (k) => k < 27;
export const suitOf = (k) => (k < 27 ? Math.floor(k / 9) : -1);
export const rankOf = (k) => (k < 27 ? (k % 9) + 1 : 0);
export const isHonor = (k) => k >= 27 && k < 34;
export const isWind = (k) => k >= 27 && k <= 30;
export const isDragon = (k) => k >= 31 && k <= 33;
export const isTerminal = (k) => k < 27 && (k % 9 === 0 || k % 9 === 8);
export const isTerminalOrHonor = (k) => isTerminal(k) || isHonor(k);
export const isBonus = (k) => k >= 34;
export const isFlower = (k) => k >= 34 && k <= 37;
export const isSeason = (k) => k >= 38 && k <= 41;
/** 1-4 for flowers/seasons; matches seat wind index + 1. */
export const bonusNumber = (k) => ((k - 34) % 4) + 1;

export const ORPHANS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

export function tileName(k) {
  if (k < 27) return `${rankOf(k)} ${SUIT_NAMES[suitOf(k)]}`;
  if (isWind(k)) return `${WIND_NAMES[k - 27]} Wind`;
  if (isDragon(k)) return `${DRAGON_NAMES[k - 31]} Dragon`;
  if (isFlower(k)) return `${FLOWER_NAMES[k - 34]} (Flower ${bonusNumber(k)})`;
  return `${SEASON_NAMES[k - 38]} (Season ${bonusNumber(k)})`;
}

export function tileZh(k) {
  if (k < 27) return NUM_ZH[k % 9] + SUIT_ZH[suitOf(k)];
  if (isWind(k)) return WIND_ZH[k - 27];
  if (isDragon(k)) return DRAGON_ZH[k - 31];
  if (isFlower(k)) return FLOWER_ZH[k - 34];
  return SEASON_ZH[k - 38];
}

/** The full 144-tile set. */
export function buildTileSet() {
  const tiles = [];
  let id = 0;
  for (let k = 0; k < KINDS; k++) {
    for (let c = 0; c < 4; c++) tiles.push({ id: id++, kind: k });
  }
  for (let k = 34; k < 42; k++) tiles.push({ id: id++, kind: k });
  return tiles;
}

export function countsOf(tilesOrKinds) {
  const c = new Array(KINDS).fill(0);
  for (const t of tilesOrKinds) {
    const k = typeof t === 'number' ? t : t.kind;
    if (k < KINDS) c[k]++;
  }
  return c;
}

export const sortTiles = (tiles) => [...tiles].sort((a, b) => a.kind - b.kind || a.id - b.id);

/**
 * Parse compact notation into kinds: "123m 456p 789s EE RRR".
 * m = Characters, p = Dots, s = Bamboo; honors E S W N, R(ed) G(reen) H (white).
 */
export function parseTiles(str) {
  const out = [];
  for (const group of str.trim().split(/\s+/).filter(Boolean)) {
    const m = group.match(/^(\d+)([mps])$/);
    if (m) {
      const base = { m: 0, p: 9, s: 18 }[m[2]];
      for (const d of m[1]) out.push(base + Number(d) - 1);
      continue;
    }
    for (const ch of group) {
      const k = { E: 27, S: 28, W: 29, N: 30, R: 31, G: 32, H: 33 }[ch];
      if (k === undefined) throw new Error(`Bad tile notation: ${group}`);
      out.push(k);
    }
  }
  return out;
}
