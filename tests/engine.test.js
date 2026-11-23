import test from 'node:test';
import assert from 'node:assert/strict';
import { countsOf } from '../src/engine/tiles.js';
import { shanten, waits, isWinningShape } from '../src/engine/hand.js';
import { scoreHand, LIMIT } from '../src/engine/scoring.js';
import { Game, PHASE } from '../src/engine/game.js';
import { decide } from '../src/ai/bot.js';

// Helpers: "123m 456p 789s EE" style notation. Honors: E S W N R(ed) G(reen) H(white, "haku").
function parse(str) {
  const out = [];
  for (const group of str.trim().split(/\s+/)) {
    const m = group.match(/^(\d+)([mps])$/);
    if (m) {
      const base = { m: 0, p: 9, s: 18 }[m[2]];
      for (const d of m[1]) out.push(base + Number(d) - 1);
    } else {
      for (const ch of group) out.push({ E: 27, S: 28, W: 29, N: 30, R: 31, G: 32, H: 33 }[ch]);
    }
  }
  return out;
}
const ctx = (concealed, extra = {}) => ({
  concealed: parse(concealed), melds: [], flowers: [34], seatWind: 1, roundWind: 0, ...extra,
});
const names = (sc) => sc.items.map((i) => i.name);

test('winning shapes', () => {
  assert.ok(isWinningShape(countsOf(parse('123m 456m 789p 111s EE')), 0));
  assert.ok(isWinningShape(countsOf(parse('11m 22m 33p 44p 55s 66s EE')), 0));
  assert.ok(isWinningShape(countsOf(parse('19m 19p 19s ESWNRGH 1m')), 0));
  assert.ok(!isWinningShape(countsOf(parse('123m 456m 789p 112s EE')), 0));
  assert.ok(isWinningShape(countsOf(parse('123m EE')), 3));
});

test('shanten and waits', () => {
  assert.equal(shanten(countsOf(parse('123m 456m 789p 111s EE')), 0), -1);
  assert.equal(shanten(countsOf(parse('123m 456m 789p 111s E')), 0), 0);
  assert.deepEqual(waits(countsOf(parse('1112345678999m')), 0), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(waits(countsOf(parse('23m 456p 789p 111s EE')), 0), [0, 3]);
  assert.equal(shanten(countsOf(parse('147m 258p 369s ESW N')), 0) > 3, true);
});

test('scoring: common hands', () => {
  const ch = scoreHand(ctx('123m 456m 789p 234s EE'));
  assert.deepEqual(names(ch), ['All Chows', 'Concealed Hand']);
  assert.equal(ch.faan, 2);

  const mixed = scoreHand(ctx('123m 456m 789m RRR EE', { selfDrawn: true }));
  assert.equal(mixed.faan, 1 + 3 + 1 + 1); // dragon, mixed suit, self-drawn, concealed

  const pure = scoreHand(ctx('111m 234m 555m 678m 99m'));
  assert.ok(names(pure).includes('Pure One Suit'));

  const pungs = scoreHand(ctx('111m 222p 333s SSS 99m'));
  assert.ok(names(pungs).includes('All Pungs'));
  assert.ok(names(pungs).includes('Seat Wind'));

  const nf = scoreHand(ctx('123m 456m 789p 234s EE', { flowers: [] }));
  assert.ok(names(nf).includes('No Flowers'));

  const dragons = scoreHand(ctx('RRR GGG HHH 123m 55p'));
  assert.ok(dragons.items.some((i) => i.name === 'Great Three Dragons'));

  const orphans = scoreHand(ctx('19m 19p 19s ESWNRGH 9s'));
  assert.equal(orphans.faan, LIMIT);
});

test('scoring with exposed melds and chicken hand', () => {
  const sc = scoreHand({
    concealed: parse('456p 789s 11m'), melds: [{ type: 'chow', kind: 0 }, { type: 'pung', kind: 13 }],
    flowers: [35], seatWind: 0, roundWind: 0,
  });
  assert.equal(sc.faan, 0);
  assert.deepEqual(names(sc), ['Chicken Hand']);
});

test('full AI games run to completion with conserved scores', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const g = new Game({ seed, rounds: 1 });
    g.startHand();
    let steps = 0;
    while (g.phase !== PHASE.GAME_OVER) {
      if (g.phase === PHASE.HAND_OVER) { g.nextHand(); continue; }
      const s = g.waitingOn()[0];
      g.act(s, decide(g.view(s)));
      assert.ok(++steps < 20000);
      // 144 tiles always accounted for.
      if (g.hands) {
        const n = g.wall.length + [0, 1, 2, 3].reduce((a, i) => a + g.hands[i].length + g.flowers[i].length
          + g.discards[i].length + g.melds[i].reduce((x, m) => x + m.tiles.length, 0), 0)
          + (g.pendingKong ? 1 : 0);
        assert.equal(n, 144);
      }
    }
    assert.equal(g.players.reduce((a, p) => a + p.score, 0), 0);
  }
});

test('views hide opponents\' concealed tiles', () => {
  const g = new Game({ seed: 7 });
  g.startHand();
  const v = g.view(0);
  assert.ok(Array.isArray(v.players[0].hand));
  assert.equal(v.players[1].hand, null);
  assert.equal(v.players[2].hand, null);
});
