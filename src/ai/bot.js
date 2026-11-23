// A heuristic bot. It decides only from `game.view(seat)` (what a real player
// at that seat could see), so the same code could run on a server for empty
// seats in a multiplayer game.
import { countsOf, KINDS, isHonor, isTerminal, isDragon, suitOf, isSuited, isBonus } from '../engine/tiles.js';
import { shanten, waits } from '../engine/hand.js';
import { scoreHand } from '../engine/scoring.js';

/** How many copies of each kind this seat has not seen. */
export function unseenCounts(view) {
  const seen = new Array(KINDS).fill(0);
  const add = (t) => { if (t && !isBonus(t.kind)) seen[t.kind]++; };
  const me = view.players[view.seat];
  (me.hand || []).forEach(add);
  for (const p of view.players) {
    p.discards.forEach(add);
    for (const m of p.melds) (m.tiles || []).forEach(add);
  }
  return seen.map((n) => Math.max(0, 4 - n));
}

function valueHonor(view, k) {
  const me = view.players[view.seat];
  return isDragon(k) || k === 27 + me.seatWind || k === 27 + view.roundWind;
}

/** Can this seat's tenpai hand actually score enough faan on a self-draw of `k`? */
function waitScores(view, hand, melds, k) {
  const me = view.players[view.seat];
  const sc = scoreHand({
    concealed: [...hand, k],
    melds,
    flowers: me.flowers.map((t) => t.kind),
    seatWind: me.seatWind,
    roundWind: view.roundWind,
    selfDrawn: true,
  });
  return sc && sc.faan >= view.minFaan;
}

/** Evaluate a 3n+1 concealed hand: lower is better. */
function evaluate(view, kinds, melds, unseen) {
  const c = countsOf(kinds);
  let sh = shanten(c, melds.length);
  let accept = 0;
  if (sh === 0) {
    const ws = waits(c, melds.length).filter((k) => waitScores(view, kinds, melds, k));
    if (!ws.length) sh = 1; // ready, but cannot score enough to win
    accept = ws.reduce((a, k) => a + unseen[k], 0) * 2;
  }
  if (sh > 0 || accept === 0) {
    for (let k = 0; k < KINDS; k++) {
      if (!unseen[k]) continue;
      c[k]++;
      if (shanten(c, melds.length) < sh) accept += unseen[k];
      c[k]--;
    }
  }
  return { sh, accept };
}

/** Preference for throwing away a tile: higher = discard first. */
function throwPreference(view, k, counts, dominantSuit) {
  let p = 0;
  const n = counts[k];
  if (isHonor(k)) {
    p += n === 1 ? (valueHonor(view, k) ? 3 : 6) : -4;
  } else {
    if (isTerminal(k)) p += 2;
    const r = k % 9;
    if (r === 1 || r === 7) p += 1;
    if (dominantSuit !== -1 && suitOf(k) !== dominantSuit) p += 3;
  }
  return p;
}

function dominantSuit(kinds) {
  const bySuit = [0, 0, 0];
  for (const k of kinds) if (isSuited(k)) bySuit[suitOf(k)]++;
  const max = Math.max(...bySuit);
  return max >= 9 ? bySuit.indexOf(max) : -1;
}

/** Best discard from the current hand: { tileId, kind, sh, accept }. */
export function chooseDiscard(view, handTiles = view.players[view.seat].hand, melds = view.players[view.seat].melds) {
  const unseen = unseenCounts(view);
  const kinds = handTiles.map((t) => t.kind);
  const counts = countsOf(kinds);
  const dom = dominantSuit([...kinds, ...melds.flatMap((m) => (m.tiles || []).map((t) => t.kind))]);
  const danger = dangerLevel(view);
  let best = null;
  const tried = new Set();
  for (const t of handTiles) {
    if (tried.has(t.kind)) continue;
    tried.add(t.kind);
    const rest = [...kinds];
    rest.splice(rest.indexOf(t.kind), 1);
    const ev = evaluate(view, rest, melds, unseen);
    let score = -ev.sh * 1000 + ev.accept * 10 + throwPreference(view, t.kind, counts, dom);
    if (danger && ev.sh >= 2) score += (4 - unseen[t.kind]) * 15; // play safer tiles when far behind
    if (!best || score > best.score) best = { tileId: t.id, kind: t.kind, sh: ev.sh, accept: ev.accept, score };
  }
  return best;
}

function dangerLevel(view) {
  // Someone with three exposed melds, or a nearly empty wall, is a threat.
  return view.wallCount < 20 || view.players.some((p, s) => s !== view.seat && p.melds.filter((m) => !m.concealed).length >= 3);
}

function hasFaanSource(view, melds, extraKind) {
  if (view.minFaan === 0) return true;
  const me = view.players[view.seat];
  if (me.flowers.some((t) => ((t.kind - 34) % 4) === me.seatWind)) return true;
  const exposed = melds.filter((m) => m.type !== 'chow').map((m) => m.kind);
  if (extraKind !== undefined) exposed.push(extraKind);
  if (exposed.some((k) => valueHonor(view, k))) return true;
  const kinds = [...me.hand.map((t) => t.kind), ...melds.flatMap((m) => (m.tiles || []).map((t) => t.kind))];
  const suits = new Set(kinds.filter(isSuited).map(suitOf));
  if (suits.size <= 1) return true;
  // Plenty of value honors in hand still gives a decent chance.
  const c = countsOf(me.hand);
  return c.some((n, k) => n >= 2 && valueHonor(view, k));
}

/** Decide on an action. `view.actions` holds the legal options. */
export function decide(view) {
  const acts = view.actions;
  if (!acts.length) return null;
  const me = view.players[view.seat];
  const find = (type) => acts.find((a) => a.type === type);

  if (find('tsumo')) return { type: 'tsumo' };
  if (find('ron')) return { type: 'ron' };

  if (view.phase === 'discard') {
    const current = chooseDiscard(view);
    for (const k of acts.filter((a) => a.type === 'kong')) {
      let restKinds;
      let melds;
      if (k.form === 'concealed') {
        restKinds = me.hand.map((t) => t.kind).filter((x) => x !== k.kind);
        melds = [...me.melds, { type: 'kong', kind: k.kind, concealed: true }];
      } else {
        restKinds = me.hand.map((t) => t.kind);
        restKinds.splice(restKinds.indexOf(k.kind), 1);
        melds = me.melds;
      }
      const sh = shanten(countsOf(restKinds), melds.length);
      if (sh <= current.sh) return { type: 'kong', kind: k.kind };
    }
    return { type: 'discard', tileId: current.tileId };
  }

  // Claim phase
  const tile = view.claimTile;
  const handKinds = me.hand.map((t) => t.kind);
  const cur = shanten(countsOf(handKinds), me.melds.length);
  const meldOptions = acts.filter((a) => ['pung', 'kong', 'chow'].includes(a.type));
  let bestOpt = null;
  for (const a of meldOptions) {
    const rest = [...handKinds];
    const used = a.type === 'chow' ? a.uses : new Array(a.type === 'kong' ? 3 : 2).fill(tile.kind);
    for (const k of used) rest.splice(rest.indexOf(k), 1);
    const meld = { type: a.type, kind: a.kind ?? tile.kind, concealed: false, tiles: [] };
    const melds = [...me.melds, meld];
    let sh;
    if (a.type === 'kong') {
      sh = shanten(countsOf(rest), melds.length);
    } else {
      // We must discard afterwards; take the best result.
      const restTiles = rest.map((k, i) => ({ id: -1 - i, kind: k }));
      const d = chooseDiscard(view, restTiles, melds);
      sh = d ? d.sh : 99;
    }
    const honorValue = a.type !== 'chow' && valueHonor(view, tile.kind);
    if (!hasFaanSource(view, me.melds, a.type !== 'chow' ? tile.kind : undefined)) continue;
    const opened = me.melds.some((m) => !m.concealed);
    let take = false;
    if (honorValue && sh <= cur) take = true;
    else if (a.type !== 'chow' && sh < cur) take = true;
    else if (a.type === 'chow' && sh < cur && (opened || sh <= 1)) take = true;
    if (take && (!bestOpt || sh < bestOpt.sh)) bestOpt = { action: a, sh };
  }
  if (bestOpt) {
    const a = bestOpt.action;
    return a.type === 'chow' ? { type: 'chow', kind: a.kind } : { type: a.type };
  }
  return { type: 'pass' };
}
