// Hand analysis: winning-shape detection, decomposition and shanten
// (number of tiles away from ready). All functions take a 34-length count
// array of the *concealed* tiles plus the number of exposed/declared melds.
import { KINDS, ORPHANS } from './tiles.js';

const canChowFrom = (i) => i < 27 && i % 9 <= 6;

/** All ways to split `counts` (which must contain 3n+2 tiles) into one pair + n sets. */
export function decomposeStandard(counts) {
  const results = [];
  const c = [...counts];
  const sets = [];
  const extract = () => {
    let i = 0;
    while (i < KINDS && c[i] === 0) i++;
    if (i === KINDS) {
      results.push(sets.map((s) => ({ ...s })));
      return;
    }
    if (c[i] >= 3) {
      c[i] -= 3;
      sets.push({ type: 'pung', kind: i });
      extract();
      sets.pop();
      c[i] += 3;
    }
    if (canChowFrom(i) && c[i + 1] > 0 && c[i + 2] > 0) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      sets.push({ type: 'chow', kind: i });
      extract();
      sets.pop();
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
  };
  const out = [];
  for (let p = 0; p < KINDS; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    results.length = 0;
    extract();
    for (const r of results) out.push({ pair: p, sets: r });
    c[p] += 2;
  }
  return out;
}

const total = (c) => c.reduce((a, b) => a + b, 0);

export function isStandardWin(counts, meldCount) {
  if (total(counts) !== 3 * (4 - meldCount) + 2) return false;
  return decomposeStandard(counts).length > 0;
}

export function isSevenPairs(counts, meldCount) {
  if (meldCount !== 0 || total(counts) !== 14) return false;
  // Four of a kind does not count as two pairs here.
  return counts.filter((n) => n === 2).length === 7;
}

export function isThirteenOrphans(counts, meldCount) {
  if (meldCount !== 0 || total(counts) !== 14) return false;
  let pair = false;
  for (const k of ORPHANS) {
    if (counts[k] === 0) return false;
    if (counts[k] === 2) pair = true;
  }
  return pair && ORPHANS.reduce((s, k) => s + counts[k], 0) === 14;
}

export function isWinningShape(counts, meldCount) {
  return isStandardWin(counts, meldCount) || isSevenPairs(counts, meldCount) || isThirteenOrphans(counts, meldCount);
}

function shantenStandard(counts, meldCount) {
  const c = [...counts];
  let best = 8;
  const rec = (i, sets, partials, pair) => {
    while (i < KINDS && c[i] === 0) i++;
    if (i >= KINDS) {
      const s = sets + meldCount;
      const p = Math.min(partials, 4 - s);
      const v = 8 - 2 * s - p - pair;
      if (v < best) best = v;
      return;
    }
    if (c[i] >= 3) {
      c[i] -= 3; rec(i, sets + 1, partials, pair); c[i] += 3;
    }
    if (canChowFrom(i) && c[i + 1] && c[i + 2]) {
      c[i]--; c[i + 1]--; c[i + 2]--;
      rec(i, sets + 1, partials, pair);
      c[i]++; c[i + 1]++; c[i + 2]++;
    }
    if (!pair && c[i] >= 2) {
      c[i] -= 2; rec(i, sets, partials, 1); c[i] += 2;
    }
    if (sets + meldCount + partials < 4) {
      if (c[i] >= 2) {
        c[i] -= 2; rec(i, sets, partials + 1, pair); c[i] += 2;
      }
      if (i < 27 && i % 9 <= 7 && c[i + 1]) {
        c[i]--; c[i + 1]--; rec(i, sets, partials + 1, pair); c[i]++; c[i + 1]++;
      }
      if (canChowFrom(i) && c[i + 2]) {
        c[i]--; c[i + 2]--; rec(i, sets, partials + 1, pair); c[i]++; c[i + 2]++;
      }
    }
    // Treat one copy as an isolated tile.
    const n = c[i];
    c[i] = 0;
    rec(i + 1, sets, partials, pair);
    c[i] = n;
  };
  rec(0, 0, 0, 0);
  return best;
}

function shantenSevenPairs(counts) {
  let pairs = 0;
  let kinds = 0;
  for (const n of counts) {
    if (n >= 2) pairs++;
    if (n >= 1) kinds++;
  }
  return 6 - pairs + Math.max(0, 7 - kinds);
}

function shantenOrphans(counts) {
  let uniq = 0;
  let pair = 0;
  for (const k of ORPHANS) {
    if (counts[k]) uniq++;
    if (counts[k] >= 2) pair = 1;
  }
  return 13 - uniq - pair;
}

/**
 * Shanten: -1 = complete hand, 0 = ready (one tile from winning), etc.
 * Works with 3n+1 or 3n+2 concealed tiles.
 */
export function shanten(counts, meldCount) {
  let s = shantenStandard(counts, meldCount);
  if (meldCount === 0) {
    s = Math.min(s, shantenSevenPairs(counts), shantenOrphans(counts));
  }
  return s;
}

/** Kinds that would complete a ready hand of 3n+1 concealed tiles. */
export function waits(counts, meldCount) {
  const out = [];
  const c = [...counts];
  for (let k = 0; k < KINDS; k++) {
    if (c[k] >= 4) continue;
    c[k]++;
    if (isWinningShape(c, meldCount)) out.push(k);
    c[k]--;
  }
  return out;
}
