// The game state machine. It knows nothing about the UI or about who is a bot:
// every seat acts through `legalActions(seat)` / `act(seat, action)`, and sees
// the table through `view(seat)`, which hides other players' concealed tiles.
// That keeps the door open for running this same engine on a server for
// multiplayer, with each client sending actions for its own seat.
import { buildTileSet, countsOf, isBonus, isSuited, sortTiles, tileName, suitOf } from './tiles.js';
import { mulberry32, shuffle } from './rng.js';
import { isWinningShape } from './hand.js';
import { scoreHand, faanValue } from './scoring.js';

export const PHASE = {
  DISCARD: 'discard', // `turn` must discard (or declare a kong / self-drawn win)
  CLAIM: 'claim', // others may claim the last discard
  ROB_KONG: 'robKong', // others may rob an added kong
  HAND_OVER: 'handOver',
  GAME_OVER: 'gameOver',
};

const DEFAULTS = {
  minFaan: 1,
  rounds: 1, // 1 = East round only, 4 = full game (East, South, West, North)
  names: ['You', 'Bot South', 'Bot West', 'Bot North'],
  seed: undefined,
  startScore: 0,
};

export class Game {
  constructor(options = {}) {
    this.opts = { ...DEFAULTS, ...options };
    const seed = this.opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    this.seed = seed;
    this.rand = mulberry32(seed);
    this.players = this.opts.names.map((name) => ({ name, score: this.opts.startScore }));
    this.roundWind = 0;
    this.dealer = 0;
    this.dealerPasses = 0;
    this.handNumber = 0;
    this.phase = null;
    this.log = []; // [{seq, seat, type, text, kind}]
    this.seq = 0;
  }

  // ---------------------------------------------------------------- setup

  startHand() {
    if (this.phase === PHASE.GAME_OVER) return;
    this.handNumber++;
    this.wall = shuffle(buildTileSet(), this.rand);
    this.hands = [[], [], [], []];
    this.melds = [[], [], [], []];
    this.flowers = [[], [], [], []];
    this.discards = [[], [], [], []];
    this.result = null;
    this.claim = null;
    this.lastDiscard = null;
    this.discardCount = 0;
    this.callsMade = false;
    this.afterKong = false;
    this.justClaimed = false;
    this.lastDrawn = null;
    this.events(null, 'start', `Hand ${this.handNumber}: ${this.players[this.dealer].name} is dealer (East).`);

    for (let r = 0; r < 13; r++) {
      for (let i = 0; i < 4; i++) this.hands[(this.dealer + i) % 4].push(this.wall.shift());
    }
    this.hands[this.dealer].push(this.wall.shift());
    for (let i = 0; i < 4; i++) {
      const s = (this.dealer + i) % 4;
      this.replaceFlowers(s);
    }
    const h = this.hands[this.dealer];
    this.lastDrawn = h[h.length - 1];
    this.turn = this.dealer;
    this.phase = PHASE.DISCARD;
  }

  replaceFlowers(seat) {
    for (;;) {
      const idx = this.hands[seat].findIndex((t) => isBonus(t.kind));
      if (idx < 0) return true;
      const [f] = this.hands[seat].splice(idx, 1);
      this.flowers[seat].push(f);
      this.events(seat, 'flower', `${this.players[seat].name} reveals ${tileName(f.kind)}.`, f.kind);
      if (!this.wall.length) return false;
      this.hands[seat].push(this.wall.pop());
    }
  }

  events(seat, type, text, kind) {
    this.log.push({ seq: ++this.seq, seat, type, text, kind });
    if (this.log.length > 200) this.log.shift();
  }

  seatWind(seat) {
    return (seat - this.dealer + 4) % 4;
  }

  /** Draw for seat; replaces flowers. Returns false if the wall ran out. */
  draw(seat, fromBack = false) {
    for (;;) {
      if (!this.wall.length) return false;
      const t = fromBack ? this.wall.pop() : this.wall.shift();
      if (isBonus(t.kind)) {
        this.flowers[seat].push(t);
        this.events(seat, 'flower', `${this.players[seat].name} draws ${tileName(t.kind)} and takes a replacement.`, t.kind);
        fromBack = true;
        continue;
      }
      this.hands[seat].push(t);
      this.lastDrawn = t;
      return true;
    }
  }

  // ---------------------------------------------------------------- queries

  scoreFor(seat, concealedKinds, extra) {
    return scoreHand({
      concealed: concealedKinds,
      melds: this.melds[seat],
      flowers: this.flowers[seat].map((t) => t.kind),
      seatWind: this.seatWind(seat),
      roundWind: this.roundWind,
      ...extra,
    });
  }

  tsumoScore(seat) {
    if (this.justClaimed) return null;
    const kinds = this.hands[seat].map((t) => t.kind);
    if (!isWinningShape(countsOf(kinds), this.melds[seat].length)) return null;
    return this.scoreFor(seat, kinds, {
      selfDrawn: true,
      lastTile: this.wall.length === 0,
      kongReplacement: this.afterKong,
      heavenly: seat === this.dealer && this.discardCount === 0 && !this.callsMade,
    });
  }

  ronScore(seat, kind, robbing = false) {
    const kinds = [...this.hands[seat].map((t) => t.kind), kind];
    if (!isWinningShape(countsOf(kinds), this.melds[seat].length)) return null;
    return this.scoreFor(seat, kinds, {
      selfDrawn: false,
      lastTile: !robbing && this.wall.length === 0,
      robbingKong: robbing,
      earthly: !robbing && this.discardCount === 1 && !this.callsMade && this.lastDiscard?.seat === this.dealer,
    });
  }

  legalActions(seat) {
    if (this.phase === PHASE.DISCARD && seat === this.turn) {
      const acts = [];
      const sc = this.tsumoScore(seat);
      if (sc && sc.faan >= this.opts.minFaan) acts.push({ type: 'tsumo', faan: sc.faan });
      if (this.wall.length) {
        const c = countsOf(this.hands[seat]);
        c.forEach((n, k) => { if (n === 4) acts.push({ type: 'kong', form: 'concealed', kind: k }); });
        for (const m of this.melds[seat]) {
          if (m.type === 'pung' && c[m.kind] > 0) acts.push({ type: 'kong', form: 'added', kind: m.kind });
        }
      }
      acts.push({ type: 'discard' });
      return acts;
    }
    if ((this.phase === PHASE.CLAIM || this.phase === PHASE.ROB_KONG) && this.claim.options[seat] && !(seat in this.claim.responses)) {
      return this.claim.options[seat];
    }
    return [];
  }

  /** Seats the game is currently waiting on. */
  waitingOn() {
    if (this.phase === PHASE.DISCARD) return [this.turn];
    if (this.phase === PHASE.CLAIM || this.phase === PHASE.ROB_KONG) {
      return Object.keys(this.claim.options).map(Number).filter((s) => !(s in this.claim.responses));
    }
    return [];
  }

  claimOptions(seat, tile, discarder) {
    const opts = [];
    const k = tile.kind;
    const sc = this.ronScore(seat, k);
    if (sc && sc.faan >= this.opts.minFaan) opts.push({ type: 'ron', faan: sc.faan });
    if (this.wall.length) {
      const c = countsOf(this.hands[seat]);
      if (c[k] >= 3) opts.push({ type: 'kong', kind: k });
      if (c[k] >= 2) opts.push({ type: 'pung', kind: k });
      if (seat === (discarder + 1) % 4 && isSuited(k)) {
        const s = suitOf(k);
        for (const start of [k - 2, k - 1, k]) {
          if (start < 0 || suitOf(start) !== s || suitOf(start + 2) !== s || start + 2 >= 27) continue;
          const need = [start, start + 1, start + 2].filter((x) => x !== k);
          if (need.every((x) => c[x] > 0)) opts.push({ type: 'chow', kind: start, uses: need });
        }
      }
    }
    if (opts.length) opts.push({ type: 'pass' });
    return opts;
  }

  // ---------------------------------------------------------------- actions

  act(seat, action) {
    const legal = this.legalActions(seat);
    if (!legal.length) throw new Error(`Seat ${seat} cannot act now`);
    if (this.phase === PHASE.DISCARD) return this.actTurn(seat, action, legal);
    return this.respond(seat, action, legal);
  }

  actTurn(seat, action, legal) {
    const hand = this.hands[seat];
    if (action.type === 'discard') {
      const idx = hand.findIndex((t) => t.id === action.tileId);
      if (idx < 0) throw new Error('Tile not in hand');
      const [tile] = hand.splice(idx, 1);
      this.discards[seat].push(tile);
      this.lastDiscard = { seat, tile };
      this.discardCount++;
      this.afterKong = false;
      this.justClaimed = false;
      this.lastDrawn = null;
      this.events(seat, 'discard', `${this.players[seat].name} discards ${tileName(tile.kind)}.`, tile.kind);
      this.openClaim(seat, tile, PHASE.CLAIM);
      return;
    }
    if (action.type === 'tsumo') {
      if (!legal.some((a) => a.type === 'tsumo')) throw new Error('Cannot self-draw win');
      this.finishWin(seat, null, this.tsumoScore(seat));
      return;
    }
    if (action.type === 'kong') {
      const ok = legal.find((a) => a.type === 'kong' && a.kind === action.kind);
      if (!ok) throw new Error('Illegal kong');
      if (ok.form === 'concealed') {
        const tiles = this.takeKinds(seat, action.kind, 4);
        this.melds[seat].push({ type: 'kong', kind: action.kind, tiles, concealed: true });
        this.events(seat, 'kong', `${this.players[seat].name} declares a concealed Kong.`, action.kind);
        this.kongReplacement(seat);
      } else {
        const [tile] = this.takeKinds(seat, action.kind, 1);
        this.events(seat, 'kong', `${this.players[seat].name} adds to a Pung to make a Kong.`, action.kind);
        this.pendingKong = { seat, tile };
        this.openClaim(seat, tile, PHASE.ROB_KONG);
      }
      return;
    }
    throw new Error(`Unknown action ${action.type}`);
  }

  takeKinds(seat, kind, n) {
    const out = [];
    const hand = this.hands[seat];
    for (let i = hand.length - 1; i >= 0 && out.length < n; i--) {
      if (hand[i].kind === kind) out.push(...hand.splice(i, 1));
    }
    if (out.length !== n) throw new Error('Not enough tiles');
    return out;
  }

  kongReplacement(seat) {
    this.callsMade = true;
    this.justClaimed = false;
    this.turn = seat;
    if (!this.draw(seat, true)) return this.finishDraw();
    this.afterKong = true;
    this.phase = PHASE.DISCARD;
  }

  openClaim(from, tile, phase) {
    const options = {};
    for (let i = 1; i < 4; i++) {
      const s = (from + i) % 4;
      let o;
      if (phase === PHASE.ROB_KONG) {
        const sc = this.ronScore(s, tile.kind, true);
        o = sc && sc.faan >= this.opts.minFaan ? [{ type: 'ron', faan: sc.faan }, { type: 'pass' }] : [];
      } else {
        o = this.claimOptions(s, tile, from);
      }
      if (o.length) options[s] = o;
    }
    this.claim = { from, tile, options, responses: {} };
    this.phase = phase;
    this.maybeResolve();
  }

  respond(seat, action, legal) {
    const match = legal.find((a) => a.type === action.type && (a.type !== 'chow' || a.kind === action.kind));
    if (!match) throw new Error(`Illegal claim ${action.type}`);
    this.claim.responses[seat] = match;
    this.maybeResolve();
  }

  maybeResolve() {
    const c = this.claim;
    if (Object.keys(c.options).some((s) => !(s in c.responses))) return;
    const order = [1, 2, 3].map((i) => (c.from + i) % 4);
    const pick = (types) => order.find((s) => c.responses[s] && types.includes(c.responses[s].type));

    const ron = pick(['ron']);
    if (this.phase === PHASE.ROB_KONG) {
      const pk = this.pendingKong;
      this.pendingKong = null;
      if (ron !== undefined) {
        this.hands[ron].push(pk.tile);
        this.lastDrawn = pk.tile;
        this.finishWin(ron, pk.seat, this.scoreFor(ron, this.hands[ron].map((t) => t.kind), { robbingKong: true }));
        return;
      }
      const meld = this.melds[pk.seat].find((m) => m.type === 'pung' && m.kind === pk.tile.kind);
      meld.type = 'kong';
      meld.tiles.push(pk.tile);
      this.claim = null;
      this.kongReplacement(pk.seat);
      return;
    }

    if (ron !== undefined) {
      this.discards[c.from].pop();
      this.hands[ron].push(c.tile);
      this.lastDrawn = c.tile;
      const kinds = this.hands[ron].map((t) => t.kind);
      this.finishWin(ron, c.from, this.scoreFor(ron, kinds, {
        lastTile: this.wall.length === 0,
        earthly: this.discardCount === 1 && !this.callsMade && c.from === this.dealer,
      }));
      return;
    }
    const pungSeat = pick(['pung', 'kong']);
    const chowSeat = pick(['chow']);
    const seat = pungSeat ?? chowSeat;
    this.claim = null;
    if (seat === undefined) {
      const next = (c.from + 1) % 4;
      this.turn = next;
      this.justClaimed = false;
      if (!this.draw(next)) return this.finishDraw();
      this.phase = PHASE.DISCARD;
      return;
    }
    const r = c.responses[seat];
    this.discards[c.from].pop();
    this.callsMade = true;
    const name = this.players[seat].name;
    if (r.type === 'chow') {
      const tiles = r.uses.map((k) => this.takeKinds(seat, k, 1)[0]);
      tiles.push(c.tile);
      this.melds[seat].push({ type: 'chow', kind: r.kind, tiles: sortTiles(tiles), concealed: false, from: c.from });
      this.events(seat, 'chow', `${name} calls Chow.`, c.tile.kind);
    } else {
      const n = r.type === 'kong' ? 3 : 2;
      const tiles = [...this.takeKinds(seat, c.tile.kind, n), c.tile];
      this.melds[seat].push({ type: r.type, kind: c.tile.kind, tiles, concealed: false, from: c.from });
      this.events(seat, r.type, `${name} calls ${r.type === 'kong' ? 'Kong' : 'Pung'}.`, c.tile.kind);
    }
    this.turn = seat;
    this.lastDrawn = null;
    if (r.type === 'kong') return this.kongReplacement(seat);
    this.justClaimed = true;
    this.phase = PHASE.DISCARD;
  }

  // ---------------------------------------------------------------- endings

  finishWin(winner, from, score) {
    const unit = faanValue(score.faan);
    const pay = [0, 0, 0, 0];
    for (let s = 0; s < 4; s++) {
      if (s === winner) continue;
      // Self-drawn: everyone pays double. On a discard: the discarder pays double, others single.
      const amt = from === null || s === from ? 2 * unit : unit;
      pay[s] -= amt;
      pay[winner] += amt;
    }
    pay.forEach((p, s) => { this.players[s].score += p; });
    this.result = {
      type: 'win', winner, from, faan: score.faan, items: score.items, limit: score.limit, payments: pay,
      winTile: this.lastDrawn,
    };
    const how = from === null ? 'self-drawn' : `on ${this.players[from].name}'s discard`;
    this.events(winner, 'win', `${this.players[winner].name} wins (${how}) with ${score.faan} faan!`);
    this.claim = null;
    this.endHand(winner === this.dealer);
  }

  finishDraw() {
    this.result = { type: 'draw', payments: [0, 0, 0, 0] };
    this.events(null, 'draw', 'The wall is exhausted. Draw game.');
    this.claim = null;
    this.endHand(true);
  }

  endHand(dealerStays) {
    this.phase = PHASE.HAND_OVER;
    this.result.dealerStays = dealerStays;
    if (!dealerStays) {
      this.dealer = (this.dealer + 1) % 4;
      this.dealerPasses++;
      if (this.dealerPasses % 4 === 0) this.roundWind++;
    }
    if (this.roundWind >= this.opts.rounds) {
      this.result.gameOver = true;
    }
  }

  /** Call after a hand is over to deal the next one (or end the game). */
  nextHand() {
    if (this.phase !== PHASE.HAND_OVER) return;
    if (this.result.gameOver) {
      this.phase = PHASE.GAME_OVER;
      return;
    }
    this.startHand();
  }

  // ---------------------------------------------------------------- views

  /** Everything `seat` is allowed to see. Plain data, safe to serialize. */
  view(seat) {
    const reveal = this.phase === PHASE.HAND_OVER || this.phase === PHASE.GAME_OVER;
    return {
      seat,
      phase: this.phase,
      turn: this.turn,
      dealer: this.dealer,
      roundWind: this.roundWind,
      handNumber: this.handNumber,
      wallCount: this.wall ? this.wall.length : 0,
      minFaan: this.opts.minFaan,
      rounds: this.opts.rounds,
      lastDiscard: this.lastDiscard,
      claimTile: this.claim ? this.claim.tile : null,
      claimFrom: this.claim ? this.claim.from : null,
      lastDrawn: this.turn === seat ? this.lastDrawn : null,
      players: this.players.map((p, s) => ({
        name: p.name,
        score: p.score,
        seatWind: this.seatWind(s),
        handCount: this.hands ? this.hands[s].length : 0,
        hand: this.hands && (s === seat || reveal) ? sortTiles(this.hands[s]) : null,
        melds: this.melds ? this.melds[s].map((m) => ({
          type: m.type,
          concealed: m.concealed,
          // Concealed kongs stay hidden from opponents until the hand ends.
          kind: m.concealed && s !== seat && !reveal ? null : m.kind,
          tiles: m.concealed && s !== seat && !reveal ? null : m.tiles,
        })) : [],
        flowers: this.flowers ? this.flowers[s] : [],
        discards: this.discards ? this.discards[s] : [],
      })),
      actions: this.legalActions(seat),
      result: this.result,
      log: this.log.slice(-40),
    };
  }
}
