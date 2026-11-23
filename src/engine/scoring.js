// Hong Kong style faan (番) scoring.
import {
  countsOf, isDragon, isWind, isHonor, isSuited, isTerminal, suitOf, isFlower, isSeason, bonusNumber,
} from './tiles.js';
import { decomposeStandard, isSevenPairs, isThirteenOrphans } from './hand.js';

export const LIMIT = 10; // faan value of a limit hand, and the payment cap

/**
 * Score a completed hand.
 * ctx = {
 *   concealed: number[]        kinds of the concealed tiles, INCLUDING the winning tile
 *   melds: [{type:'chow'|'pung'|'kong', kind, concealed}]
 *   flowers: number[]          bonus kinds
 *   seatWind, roundWind: 0-3
 *   selfDrawn, lastTile, kongReplacement, robbingKong, heavenly, earthly: booleans
 * }
 * Returns { faan, items:[{name, zh, faan}], limit } for the best interpretation,
 * or null if the tiles are not a winning hand.
 */
export function scoreHand(ctx) {
  const counts = countsOf(ctx.concealed);
  const meldCount = ctx.melds.length;
  const candidates = [];

  if (isThirteenOrphans(counts, meldCount)) {
    candidates.push(finish([{ name: 'Thirteen Orphans', zh: '十三么', limit: true }], ctx));
  }
  if (isSevenPairs(counts, meldCount)) {
    candidates.push(scoreSevenPairs(counts, ctx));
  }
  if (counts.reduce((a, b) => a + b, 0) === 3 * (4 - meldCount) + 2) {
    for (const d of decomposeStandard(counts)) {
      const sets = [
        ...ctx.melds.map((m) => ({ type: m.type, kind: m.kind, concealed: !!m.concealed })),
        ...d.sets.map((s) => ({ ...s, concealed: true })),
      ];
      candidates.push(scoreStandard(sets, d.pair, counts, ctx));
    }
  }
  if (!candidates.length) return null;
  return candidates.reduce((best, c) => (c.faan > best.faan ? c : best));
}

function allKinds(ctx) {
  const kinds = [...ctx.concealed];
  for (const m of ctx.melds) {
    if (m.type === 'chow') kinds.push(m.kind, m.kind + 1, m.kind + 2);
    else kinds.push(m.kind, m.kind, m.kind);
  }
  return kinds;
}

function suitItems(ctx) {
  const items = [];
  const kinds = allKinds(ctx);
  const suits = new Set(kinds.filter(isSuited).map(suitOf));
  const honors = kinds.some(isHonor);
  if (suits.size === 0) items.push({ name: 'All Honors', zh: '字一色', limit: true });
  else if (suits.size === 1 && !honors) items.push({ name: 'Pure One Suit', zh: '清一色', faan: 7 });
  else if (suits.size === 1) items.push({ name: 'Mixed One Suit', zh: '混一色', faan: 3 });

  const allTermHon = kinds.every((k) => isTerminal(k) || isHonor(k));
  if (allTermHon && !honors) items.push({ name: 'All Terminals', zh: '清么九', limit: true });
  else if (allTermHon && suits.size > 0) items.push({ name: 'Mixed Terminals', zh: '混么九', faan: 1 });
  return items;
}

function flowerItems(ctx) {
  const items = [];
  const fl = ctx.flowers || [];
  if (fl.length === 0) {
    items.push({ name: 'No Flowers', zh: '無花', faan: 1 });
    return items;
  }
  if (fl.length === 8) {
    items.push({ name: 'All Eight Flowers', zh: '八仙過海', limit: true });
    return items;
  }
  const seat = ctx.seatWind + 1;
  const own = fl.filter((k) => bonusNumber(k) === seat).length;
  if (own) items.push({ name: own > 1 ? 'Seat Flowers' : 'Seat Flower', zh: '正花', faan: own });
  if (fl.filter(isFlower).length === 4) items.push({ name: 'Full Set of Flowers', zh: '一台花', faan: 2 });
  if (fl.filter(isSeason).length === 4) items.push({ name: 'Full Set of Seasons', zh: '一台花', faan: 2 });
  return items;
}

function situationItems(ctx, concealedHand) {
  const items = [];
  if (ctx.heavenly) items.push({ name: 'Heavenly Hand', zh: '天糊', limit: true });
  if (ctx.earthly) items.push({ name: 'Earthly Hand', zh: '地糊', limit: true });
  if (ctx.selfDrawn) items.push({ name: 'Self-Drawn', zh: '自摸', faan: 1 });
  if (concealedHand) items.push({ name: 'Concealed Hand', zh: '門前清', faan: 1 });
  if (ctx.lastTile && ctx.selfDrawn) items.push({ name: 'Last Tile Draw', zh: '海底撈月', faan: 1 });
  if (ctx.lastTile && !ctx.selfDrawn) items.push({ name: 'Last Discard', zh: '河底撈魚', faan: 1 });
  if (ctx.kongReplacement) items.push({ name: 'Win on Kong', zh: '槓上開花', faan: 1 });
  if (ctx.robbingKong) items.push({ name: 'Robbing the Kong', zh: '搶槓', faan: 1 });
  return items;
}

function scoreSevenPairs(counts, ctx) {
  const items = [{ name: 'Seven Pairs', zh: '七對子', faan: 4 }];
  items.push(...suitItems(ctx), ...flowerItems(ctx), ...situationItems(ctx, false));
  return finish(items, ctx);
}

function scoreStandard(sets, pair, counts, ctx) {
  const items = [];
  const pungs = sets.filter((s) => s.type !== 'chow');
  const chows = sets.filter((s) => s.type === 'chow');
  const kongs = sets.filter((s) => s.type === 'kong');
  const concealedHand = ctx.melds.every((m) => m.concealed);
  const roundKind = 27 + ctx.roundWind;
  const seatKind = 27 + ctx.seatWind;

  // Nine Gates: concealed pure suit 1112345678999 + any one tile of that suit.
  if (ctx.melds.length === 0) {
    for (let s = 0; s < 3; s++) {
      const b = s * 9;
      const inSuit = counts.slice(b, b + 9);
      if (inSuit.reduce((a, n) => a + n, 0) === 14 && inSuit[0] >= 3 && inSuit[8] >= 3 && inSuit.slice(1, 8).every((n) => n >= 1)) {
        items.push({ name: 'Nine Gates', zh: '九蓮寶燈', limit: true });
      }
    }
  }
  if (kongs.length === 4) items.push({ name: 'Four Kongs', zh: '十八羅漢', limit: true });
  if (concealedHand && pungs.length === 4 && ctx.selfDrawn) {
    items.push({ name: 'All Concealed Pungs', zh: '坎坎糊', limit: true });
  }

  // Dragons
  const dragonPungs = pungs.filter((s) => isDragon(s.kind)).length;
  if (dragonPungs === 3) items.push({ name: 'Great Three Dragons', zh: '大三元', faan: 8 });
  else {
    if (dragonPungs === 2 && isDragon(pair)) items.push({ name: 'Small Three Dragons', zh: '小三元', faan: 5 });
    else if (dragonPungs) items.push({ name: dragonPungs > 1 ? 'Dragon Pungs' : 'Dragon Pung', zh: '三元牌', faan: dragonPungs });
  }

  // Winds
  const windPungs = pungs.filter((s) => isWind(s.kind)).length;
  if (windPungs === 4) items.push({ name: 'Great Four Winds', zh: '大四喜', limit: true });
  else if (windPungs === 3 && isWind(pair)) items.push({ name: 'Small Four Winds', zh: '小四喜', faan: 6 });
  else {
    if (pungs.some((s) => s.kind === seatKind)) items.push({ name: 'Seat Wind', zh: '門風', faan: 1 });
    if (pungs.some((s) => s.kind === roundKind)) items.push({ name: 'Prevailing Wind', zh: '圈風', faan: 1 });
  }

  if (chows.length === 4) items.push({ name: 'All Chows', zh: '平糊', faan: 1 });
  if (pungs.length === 4) items.push({ name: 'All Pungs', zh: '對對糊', faan: 3 });

  items.push(...suitItems(ctx), ...flowerItems(ctx), ...situationItems(ctx, concealedHand));
  return finish(items, ctx);
}

function finish(items, _ctx) {
  const limitItems = items.filter((i) => i.limit);
  if (limitItems.length) {
    return { faan: LIMIT, limit: true, items: limitItems.map((i) => ({ name: i.name, zh: i.zh, faan: LIMIT, limit: true })) };
  }
  const faan = Math.min(LIMIT, items.reduce((a, i) => a + i.faan, 0));
  if (faan === 0) items = [{ name: 'Chicken Hand', zh: '雞糊', faan: 0 }];
  return { faan, limit: faan >= LIMIT, items };
}

/** Units paid for a hand of `faan` faan. */
export const faanValue = (faan) => 2 ** Math.min(faan, LIMIT);

