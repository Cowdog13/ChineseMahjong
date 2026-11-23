// "Scoring hands" screen: every faan pattern with an example hand.
// Each example is scored live with the real scoring code, so the breakdown
// shown is exactly what the game would award.
import { parseTiles, WIND_NAMES } from '../engine/tiles.js';
import { scoreHand } from '../engine/scoring.js';

// Example context defaults: you are East in the East round, holding the
// Chrysanthemum (flower 3), which is not your seat flower.
const DEFAULT_FLOWERS = [36];

export const GUIDE = [
  {
    section: 'Everyday points (1 faan each)',
    note: 'Most winning hands are built from a few of these.',
    entries: [
      { name: 'Self-Drawn', zh: '自摸', faan: 1, desc: 'You draw the winning tile from the wall yourself.', hand: '234m 555p 345s 678s 99m', selfDrawn: true },
      { name: 'Concealed Hand', zh: '門前清', faan: 1, desc: 'You win without having claimed any discards (concealed kongs are fine).', hand: '234m 555p 345s 678s 99m' },
      { name: 'No Flowers', zh: '無花', faan: 1, desc: 'You have no flower or season tiles at all.', melds: ['234m'], hand: '555p 345s 678s 99m', flowers: [] },
      { name: 'Seat Flower', zh: '正花', faan: 1, desc: 'Each flower or season whose number matches your seat (East 1, South 2, West 3, North 4). Here East holds Plum 1.', melds: ['234m'], hand: '555p 345s 678s 99m', flowers: [34] },
      { name: 'Dragon Pung', zh: '三元牌', faan: 1, desc: 'Each Pung or Kong of Red, Green or White Dragons.', melds: ['RRR'], hand: '234m 567p 345s 99m' },
      { name: 'Seat Wind', zh: '門風', faan: 1, desc: 'A Pung or Kong of your own seat wind. Here you sit South.', seat: 1, melds: ['SSS'], hand: '234m 567p 345s 99m' },
      { name: 'Prevailing Wind', zh: '圈風', faan: 1, desc: 'A Pung or Kong of the round\'s wind (East in the first round).', seat: 1, melds: ['EEE'], hand: '234m 567p 345s 99m' },
      { name: 'All Chows', zh: '平糊', faan: 1, desc: 'All four sets are Chows (runs).', melds: ['234m'], hand: '567p 345s 678s 99m' },
      { name: 'Mixed Terminals', zh: '混么九', faan: 1, desc: 'Every tile is a 1, a 9 or an honor. Usually comes with All Pungs.', melds: ['111m'], hand: '999p NNN 111s 99s' },
    ],
  },
  {
    section: 'Lucky moments (1 faan each)',
    note: 'These depend on how you won rather than on the tiles.',
    entries: [
      { name: 'Win on Kong', zh: '槓上開花', faan: 1, desc: 'You win with the replacement tile drawn after declaring a Kong.' },
      { name: 'Robbing the Kong', zh: '搶槓', faan: 1, desc: 'Another player adds a 4th tile to their exposed Pung, and that tile completes your hand.' },
      { name: 'Last Tile Draw', zh: '海底撈月', faan: 1, desc: 'You self-draw the very last tile of the wall.' },
      { name: 'Last Discard', zh: '河底撈魚', faan: 1, desc: 'You win on the discard made after the last wall tile.' },
      { name: 'Full Set of Flowers or Seasons', zh: '一台花', faan: 2, desc: 'All four Flowers (梅蘭菊竹) or all four Seasons (春夏秋冬). Includes your seat flower too.', melds: ['234m'], hand: '555p 345s 678s 99m', flowers: [34, 35, 36, 37] },
    ],
  },
  {
    section: 'Big hands (3–8 faan)',
    note: 'Worth planning for when your starting tiles lean this way.',
    entries: [
      { name: 'All Pungs', zh: '對對糊', faan: 3, desc: 'All four sets are Pungs or Kongs.', melds: ['222m'], hand: '555p 888s 333s WW' },
      { name: 'Mixed One Suit', zh: '混一色', faan: 3, desc: 'Only one suit, plus any honors (winds and dragons).', melds: ['123p'], hand: '456p 777p NNN 99p' },
      { name: 'Seven Pairs', zh: '七對子', faan: 4, desc: 'Seven different pairs, all concealed.', hand: '11m 33m 55p 77p 22s 99s RR' },
      { name: 'Small Three Dragons', zh: '小三元', faan: 5, desc: 'Pungs of two dragons and a pair of the third.', melds: ['RRR'], hand: 'GGG HH 123m 456m' },
      { name: 'Small Four Winds', zh: '小四喜', faan: 6, desc: 'Pungs of three winds and a pair of the fourth. Here it also makes Mixed One Suit.', melds: ['EEE'], hand: 'SSS WWW NN 123m' },
      { name: 'Pure One Suit', zh: '清一色', faan: 7, desc: 'Every tile from a single suit, no honors.', melds: ['111s'], hand: '234s 456s 789s 55s' },
      { name: 'Great Three Dragons', zh: '大三元', faan: 8, desc: 'Pungs or Kongs of all three dragons.', melds: ['RRR'], hand: 'GGG HHH 234p 55s' },
    ],
  },
  {
    section: 'Limit hands (maximum score)',
    note: 'Rare hands that score the maximum no matter what else they contain.',
    entries: [
      { name: 'Thirteen Orphans', zh: '十三么', limit: true, desc: 'One of each 1 and 9 of every suit, one of each honor, plus one duplicate.', hand: '19m 19p 19s ESWN RGH 1m' },
      { name: 'Great Four Winds', zh: '大四喜', limit: true, desc: 'Pungs or Kongs of all four winds.', melds: ['EEE', 'SSS'], hand: 'WWW NNN 55m' },
      { name: 'All Honors', zh: '字一色', limit: true, desc: 'Only winds and dragons.', melds: ['EEE'], hand: 'SSS RRR GGG HH' },
      { name: 'All Terminals', zh: '清么九', limit: true, desc: 'Only 1s and 9s, no honors.', melds: ['111m'], hand: '999m 111p 999s 11s' },
      { name: 'Nine Gates', zh: '九蓮寶燈', limit: true, desc: '1-1-1-2-3-4-5-6-7-8-9-9-9 of one suit, concealed, plus any tile of that suit.', hand: '1112345678999m 5m' },
      { name: 'Four Kongs', zh: '十八羅漢', limit: true, desc: 'Four Kongs and a pair.', melds: ['2222m', '#5555p', '8888s', 'RRRR'], hand: 'WW' },
      { name: 'All Concealed Pungs', zh: '坎坎糊', limit: true, desc: 'Four concealed Pungs, won by drawing the last tile yourself.', hand: '222m 444p 666s 888m EE', selfDrawn: true },
      { name: 'Heavenly Hand', zh: '天糊', limit: true, desc: 'The dealer\'s starting 14 tiles are already a winning hand.' },
      { name: 'Earthly Hand', zh: '地糊', limit: true, desc: 'You win on the dealer\'s very first discard.' },
      { name: 'All Eight Flowers', zh: '八仙過海', limit: true, desc: 'You collect all four Flowers and all four Seasons.' },
    ],
  },
];

function meldFrom(str) {
  const concealed = str.startsWith('#');
  const kinds = parseTiles(concealed ? str.slice(1) : str);
  const type = kinds.length === 4 ? 'kong' : kinds[0] === kinds[1] ? 'pung' : 'chow';
  return { type, kind: Math.min(...kinds), kinds, concealed };
}

/** Score an example entry with the real scoring rules. */
export function scoreExample(e) {
  const melds = (e.melds || []).map(meldFrom);
  return scoreHand({
    concealed: parseTiles(e.hand),
    melds,
    flowers: e.flowers ?? DEFAULT_FLOWERS,
    seatWind: e.seat ?? 0,
    roundWind: 0,
    selfDrawn: !!e.selfDrawn,
  });
}

/** `tile(kind, size, cls)` and `back(size)` come from the app so the art matches the table. */
export function guideHTML(tile, back, limit) {
  const groupHTML = (str) => str.trim().split(/\s+/)
    .map((g) => `<div class="meld">${parseTiles(g).map((k) => tile(k, 'sm')).join('')}</div>`).join('');
  const meldHTML = (str) => {
    const m = meldFrom(str);
    if (m.concealed) return `<div class="meld">${back('sm')}${tile(m.kinds[1], 'sm')}${tile(m.kinds[2], 'sm')}${back('sm')}</div>`;
    return `<div class="meld exposed-meld">${m.kinds.map((k) => tile(k, 'sm')).join('')}</div>`;
  };

  const sections = GUIDE.map((sec) => `
    <h3>${sec.section}</h3><p class="guide-note">${sec.note}</p>
    ${sec.entries.map((e) => {
      const badge = e.limit ? `<span class="faan-badge limit">Limit</span>` : `<span class="faan-badge">${e.faan} faan</span>`;
      let example = '';
      if (e.hand) {
        const sc = scoreExample(e);
        const flowers = e.flowers ?? DEFAULT_FLOWERS;
        const context = [];
        if (e.seat) context.push(`you sit ${WIND_NAMES[e.seat]}`);
        context.push(e.selfDrawn ? 'self-drawn' : 'won on a discard');
        example = `<div class="example">
          <div class="tiles">${groupHTML(e.hand)}
            ${(e.melds || []).length ? `<span class="ex-label">claimed:</span>${e.melds.map(meldHTML).join('')}` : ''}
            ${flowers.length ? `<span class="ex-label">flowers:</span><div class="meld">${flowers.map((k) => tile(k, 'sm')).join('')}</div>` : ''}
          </div>
          <div class="ex-score">Example (${context.join(', ')}) scores <strong>${sc.limit ? `the limit (${limit} faan)` : `${sc.faan} faan`}</strong>:
            ${sc.items.map((i) => `${i.name}${i.limit ? '' : ` ${i.faan}`}`).join(' + ')}</div>
        </div>`;
      }
      return `<div class="guide-entry">
        <div class="guide-head"><span class="guide-name">${e.name} <span class="zh">${e.zh}</span></span>${badge}</div>
        <p>${e.desc}</p>${example}</div>`;
    }).join('')}`).join('');

  return `<h2>Scoring hands <span class="zh">番種</span></h2>
    <p>Points add up: a hand scores the total faan of every pattern it contains (capped at ${limit}).
    Your hand must reach the game's minimum faan to win. Each faan doubles the payout.
    Examples assume you are East in the East round, unless they say otherwise.</p>
    ${sections}`;
}
