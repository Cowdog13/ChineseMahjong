// Browser front end: renders the table from `game.view(HUMAN)` and drives the
// bots with timers. To add multiplayer later, replace the local `Game` + bot
// timers with a connection that sends actions and receives views.
import { Game, PHASE } from '../engine/game.js';
import { decide, chooseDiscard } from '../ai/bot.js';
import { countsOf, tileName, WIND_ZH, WIND_NAMES, isBonus } from '../engine/tiles.js';
import { shanten, waits } from '../engine/hand.js';
import { LIMIT, faanValue } from '../engine/scoring.js';
import { tileSVG } from './tileArt.js';
import { helpHTML } from './help.js';
import { guideHTML } from './scoringGuide.js';

const HUMAN = 0;
const BOT_NAMES = ['Lan', 'Ming', 'Wei'];
const SPEEDS = { slow: 1100, normal: 650, fast: 300 };
const $ = (id) => document.getElementById(id);

const settings = loadSettings();
let game;
let selectedId = null;
let suggestedId = null;
let timer = null;
let lastSeqSeen = 0;
const bubbles = {}; // seat -> {text, until}

function loadSettings() {
  const defaults = { name: 'You', minFaan: 1, rounds: 1, speed: 'normal', hints: true, oneClick: false, hintButton: true };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem('mahjong.settings') || '{}') };
  } catch {
    return defaults;
  }
}
function saveSettings() {
  try { localStorage.setItem('mahjong.settings', JSON.stringify(settings)); } catch { /* storage unavailable */ }
}

// ------------------------------------------------------------------ helpers

const tile = (t, size = 'sm', cls = '', attrs = '') =>
  `<div class="tile ${size} ${cls}" title="${tileName(t.kind ?? t)}" ${attrs}>${tileSVG(t.kind ?? t, settings.hints)}</div>`;
const back = (size = 'sm', cls = '') => `<div class="tile ${size} back ${cls}"></div>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const signed = (n) => (n > 0 ? `+${n}` : `${n}`);

// A Kong is drawn the traditional way: three tiles with the fourth stacked on
// the middle one, so it takes no more width than a Pung.
function meldHTML(m, size) {
  if (m.type === 'kong') {
    let row;
    let top;
    if (!m.tiles) { // an opponent's concealed kong: fully hidden
      row = [back(size), back(size), back(size)];
      top = back(size, 'stacked');
    } else if (m.concealed) { // your concealed kong: two face down, two face up
      row = [back(size), tile(m.tiles[1], size), back(size)];
      top = tile(m.tiles[2], size, 'stacked');
    } else {
      row = m.tiles.slice(0, 3).map((t) => tile(t, size));
      top = tile(m.tiles[3], size, 'stacked');
    }
    return `<div class="meld kong ${size}">${row.join('')}${top}</div>`;
  }
  return `<div class="meld ${size}">${m.tiles.map((t) => tile(t, size)).join('')}</div>`;
}

function flowersHTML(fl, size) {
  return fl.length ? `<div class="flowers">${fl.map((t) => tile(t, size)).join('')}</div>` : '';
}

function badgeHTML(v, s) {
  const p = v.players[s];
  const active = v.waitingOn?.includes(s) || (v.phase === PHASE.DISCARD && v.turn === s);
  const bubble = bubbles[s] && bubbles[s].until > Date.now() ? `<div class="bubble">${bubbles[s].text}</div>` : '';
  return `<div class="badge ${active ? 'active' : ''}">
    ${bubble}
    <span class="wind ${s === v.dealer ? 'dealer' : ''}" title="${WIND_NAMES[p.seatWind]} seat${s === v.dealer ? ' (dealer)' : ''}">${WIND_ZH[p.seatWind]}</span>
    <span class="name">${esc(p.name)}</span>
    <span class="score">${p.score}</span>
  </div>`;
}

// ------------------------------------------------------------------ render

function render() {
  const v = game.view(HUMAN);
  v.waitingOn = game.waitingOn();
  const reveal = v.phase === PHASE.HAND_OVER || v.phase === PHASE.GAME_OVER;

  $('round-info').textContent = `${WIND_NAMES[v.roundWind]} round · Hand ${v.handNumber} · Min ${v.minFaan} faan`;

  // Opponents
  for (const s of [1, 2, 3]) {
    const p = v.players[s];
    const side = s === 2 ? 'top' : 'side';
    const hand = reveal && p.hand
      ? `<div class="backs">${p.hand.map((t) => tile(t, side === 'top' ? 'sm' : 'xs')).join('')}</div>`
      : `<div class="backs">${Array.from({ length: p.handCount }, () => back('xs', side === 'side' ? 'sideways' : '')).join('')}</div>`;
    const exposed = `<div class="exposed">${p.melds.map((m) => meldHTML(m, 'lg')).join('')}${flowersHTML(p.flowers, 'xs')}</div>`;
    $(`seat-${s}`).innerHTML = badgeHTML(v, s) + hand + exposed;
  }

  // Discard ponds
  for (let s = 0; s < 4; s++) {
    const ds = v.players[s].discards;
    $(`pond-${s}`).innerHTML = ds.map((t, i) => {
      const isLast = v.lastDiscard && v.lastDiscard.tile.id === t.id && i === ds.length - 1;
      const claimable = isLast && v.phase === PHASE.CLAIM && v.actions.length;
      return tile(t, 'pd', `${isLast ? 'last-discard fresh' : ''} ${claimable ? 'claimable' : ''}`);
    }).join('');
  }
  fitPonds(v);

  // Center
  const turnName = v.players[v.turn]?.name;
  let status = '';
  if (v.phase === PHASE.DISCARD) status = v.turn === HUMAN ? 'Your turn' : `${esc(turnName)} is thinking…`;
  else if (v.phase === PHASE.CLAIM || v.phase === PHASE.ROB_KONG) status = v.actions.length ? 'Claim?' : 'Waiting for claims…';
  else if (v.phase === PHASE.HAND_OVER) status = 'Hand over';
  $('center-info').innerHTML = `
    <div class="round" title="Prevailing wind">${WIND_ZH[v.roundWind]}風 <small>${WIND_NAMES[v.roundWind]}</small></div>
    <div class="wall">${v.wallCount} tiles left</div>
    <div class="status">${status}</div>`;

  // Me
  const me = v.players[HUMAN];
  $('me-badge').innerHTML = badgeHTML(v, HUMAN);
  // Your claimed sets use the same tile size as your hand.
  $('me-exposed').innerHTML = me.melds.map((m) => meldHTML(m, 'lg')).join('');
  $('me-flowers').innerHTML = flowersHTML(me.flowers, 'sm');
  renderHand(v, me);
  renderActions(v, me);
}

// Make discarded tiles as large as the table allows. All four ponds share one
// size (sized for at least 12 tiles each) so they shrink gradually and evenly.
function fitPonds(v) {
  const maxW = window.innerWidth <= 720 ? 34 : 54;
  let size = maxW;
  for (let s = 0; s < 4; s++) {
    const el = $(`pond-${s}`);
    const n = Math.max(12, v.players[s].discards.length);
    const W = el.clientWidth;
    const H = el.clientHeight;
    if (!W || !H) continue;
    let w = size;
    for (; w > 12; w--) {
      const cols = Math.floor((W + 2) / (w + 2));
      const rows = Math.ceil(n / Math.max(1, cols));
      if (cols >= 1 && rows * (w * 1.333 + w * 0.08 + 2) <= H) break;
    }
    size = Math.min(size, w);
  }
  $('table').style.setProperty('--pond-w', `${size}px`);
}

function renderHand(v, me) {
  const canDiscard = v.phase === PHASE.DISCARD && v.turn === HUMAN;
  let tiles = me.hand || [];
  let drawn = null;
  if (canDiscard && v.lastDrawn) {
    drawn = tiles.find((t) => t.id === v.lastDrawn.id) || null;
    if (drawn) tiles = tiles.filter((t) => t.id !== drawn.id);
  }
  const claimKind = (v.phase === PHASE.CLAIM && v.actions.length) ? v.claimTile.kind : null;
  const html = tiles.map((t) => handTile(t, '', claimKind)).join('') + (drawn ? handTile(drawn, 'drawn fresh', claimKind) : '');
  const el = $('hand');
  el.innerHTML = html;
  el.classList.toggle('can-discard', canDiscard);
}

function handTile(t, cls, claimKind) {
  const sel = t.id === selectedId ? 'selected' : '';
  const sug = t.id === suggestedId ? 'suggested' : '';
  const dim = claimKind !== null && t.kind !== claimKind ? 'dim' : '';
  return tile(t, 'lg', `${cls} ${sel} ${sug} ${dim}`, `data-id="${t.id}"`);
}

function waitsAfterDiscard(me, tileId) {
  const rest = me.hand.filter((t) => t.id !== tileId).map((t) => t.kind);
  const c = countsOf(rest);
  if (shanten(c, me.melds.length) !== 0) return null;
  return waits(c, me.melds.length);
}

function renderActions(v, me) {
  const acts = v.actions;
  const bar = $('actions');
  const prompt = $('prompt');
  const buttons = [];
  prompt.innerHTML = '';

  if (v.phase === PHASE.DISCARD && v.turn === HUMAN) {
    for (const a of acts) {
      if (a.type === 'tsumo') buttons.push(`<button class="win" data-act='${JSON.stringify({ type: 'tsumo' })}'><span class="zh">自摸</span> Win! (${a.faan} faan)</button>`);
      if (a.type === 'kong') buttons.push(`<button data-act='${JSON.stringify({ type: 'kong', kind: a.kind })}'><span class="zh">槓</span> Kong <span class="mini">${tile(a.kind)}</span></button>`);
    }
    if (selectedId !== null) buttons.push(`<button data-cmd="discard">Discard</button>`);
    if (settings.hintButton) buttons.push(`<button class="secondary" data-cmd="hint">Hint</button>`);

    const sel = me.hand.find((t) => t.id === selectedId);
    if (sel) {
      const w = waitsAfterDiscard(me, sel.id);
      prompt.innerHTML = w && w.length
        ? `Discarding <strong>${tileName(sel.kind)}</strong> leaves you ready, waiting on: ${w.map((k) => `<strong>${tileName(k)}</strong>`).join(', ')}`
        : `Click <strong>${tileName(sel.kind)}</strong> again (or press Discard) to throw it away.`;
    } else {
      prompt.innerHTML = acts.some((a) => a.type === 'tsumo')
        ? '<strong>You have a winning hand!</strong> Declare it, or keep playing by discarding.'
        : 'Your turn: choose a tile to discard.';
    }
  } else if ((v.phase === PHASE.CLAIM || v.phase === PHASE.ROB_KONG) && acts.length) {
    const from = v.players[v.claimFrom].name;
    prompt.innerHTML = `${esc(from)} ${v.phase === PHASE.ROB_KONG ? 'is adding to a Kong with' : 'discarded'} <strong>${tileName(v.claimTile.kind)}</strong>.`;
    for (const a of acts) {
      if (a.type === 'ron') buttons.push(`<button class="win" data-act='{"type":"ron"}'><span class="zh">食糊</span> Win! (${a.faan} faan)</button>`);
      if (a.type === 'kong') buttons.push(`<button data-act='{"type":"kong"}'><span class="zh">槓</span> Kong</button>`);
      if (a.type === 'pung') buttons.push(`<button data-act='{"type":"pung"}'><span class="zh">碰</span> Pung</button>`);
      if (a.type === 'chow') {
        const ks = [a.kind, a.kind + 1, a.kind + 2];
        buttons.push(`<button data-act='${JSON.stringify({ type: 'chow', kind: a.kind })}'><span class="zh">上</span> Chow <span class="mini">${ks.map((k) => tile(k)).join('')}</span></button>`);
      }
    }
    buttons.push(`<button class="secondary" data-act='{"type":"pass"}'>Pass</button>`);
  } else if (v.phase === PHASE.DISCARD || v.phase === PHASE.CLAIM || v.phase === PHASE.ROB_KONG) {
    const me13 = me.hand ? countsOf(me.hand.map((t) => t.kind)) : null;
    if (me13 && me.hand.length % 3 === 1 && shanten(me13, me.melds.length) === 0) {
      const w = waits(me13, me.melds.length);
      prompt.innerHTML = `You are ready <span class="zh">聽牌</span> — waiting on ${w.map((k) => `<strong>${tileName(k)}</strong>`).join(', ')}`;
    }
  }
  bar.innerHTML = buttons.join('');
}

// ------------------------------------------------------------------ flow

function newGame() {
  clearTimeout(timer);
  game = new Game({
    minFaan: Number(settings.minFaan),
    rounds: Number(settings.rounds),
    names: [settings.name || 'You', ...BOT_NAMES],
  });
  game.startHand();
  lastSeqSeen = game.seq;
  selectedId = suggestedId = null;
  hideModal();
  step();
}

function delay() { return SPEEDS[settings.speed] || SPEEDS.normal; }

function processLog() {
  const labels = { pung: '碰 Pung!', kong: '槓 Kong!', chow: '上 Chow!', win: '食糊 Win!', flower: '花 Flower' };
  for (const e of game.log) {
    if (e.seq <= lastSeqSeen) continue;
    if (e.seat !== null && labels[e.type]) bubbles[e.seat] = { text: labels[e.type], until: Date.now() + 1400 };
  }
  lastSeqSeen = game.seq;
}

function step() {
  clearTimeout(timer);
  processLog();
  render();
  if (game.phase === PHASE.HAND_OVER) {
    timer = setTimeout(showResult, 700);
    return;
  }
  if (game.phase === PHASE.GAME_OVER) return;
  const waiting = game.waitingOn();
  const bots = waiting.filter((s) => s !== HUMAN);
  if (!bots.length) {
    // Re-render when bubbles expire.
    timer = setTimeout(() => { render(); }, 1500);
    return;
  }
  const isClaim = game.phase !== PHASE.DISCARD;
  timer = setTimeout(() => {
    for (const s of bots) {
      if (!game.waitingOn().includes(s)) continue;
      const action = decide(game.view(s));
      game.act(s, action);
      if (game.phase === PHASE.DISCARD || game.phase === PHASE.HAND_OVER) break;
    }
    step();
  }, isClaim ? Math.min(400, delay()) : delay());
}

function humanAct(action) {
  try {
    game.act(HUMAN, action);
  } catch (err) {
    console.warn(err);
    return;
  }
  selectedId = suggestedId = null;
  step();
}

// ------------------------------------------------------------------ input

$('hand').addEventListener('click', (e) => {
  const el = e.target.closest('.tile');
  if (!el || game.phase !== PHASE.DISCARD || game.turn !== HUMAN) return;
  const id = Number(el.dataset.id);
  if (settings.oneClick || selectedId === id) humanAct({ type: 'discard', tileId: id });
  else { selectedId = id; render(); }
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.act) humanAct(JSON.parse(btn.dataset.act));
  const cmd = btn.dataset.cmd;
  if (!cmd) return;
  if (cmd === 'discard' && selectedId !== null) humanAct({ type: 'discard', tileId: selectedId });
  if (cmd === 'hint' && settings.hintButton) {
    const v = game.view(HUMAN);
    const best = chooseDiscard(v);
    suggestedId = best?.tileId ?? null;
    selectedId = suggestedId;
    render();
  }
  if (cmd === 'help') showModal(helpHTML(LIMIT) + '<div class="row"><button class="secondary" data-cmd="scoring">Scoring hands with examples</button><button data-cmd="close">Close</button></div>');
  if (cmd === 'scoring') {
    showModal(`${guideHTML(tile, back, LIMIT)}<div class="row"><button data-cmd="close">Close</button></div>`);
    $('modal-card').scrollTop = 0;
  }
  if (cmd === 'settings') showSettings();
  if (cmd === 'save-settings') {
    const f = $('modal-card');
    settings.name = f.querySelector('[name=name]').value.trim().slice(0, 16) || 'You';
    settings.minFaan = Number(f.querySelector('[name=minFaan]').value);
    settings.rounds = Number(f.querySelector('[name=rounds]').value);
    settings.speed = f.querySelector('[name=speed]').value;
    settings.hints = f.querySelector('[name=hints]').checked;
    settings.oneClick = f.querySelector('[name=oneClick]').checked;
    settings.hintButton = f.querySelector('[name=hintButton]').checked;
    if (!settings.hintButton) suggestedId = null;
    saveSettings();
    if (btn.dataset.restart) newGame();
    else { game.players[HUMAN].name = settings.name; hideModal(); render(); }
  }
  if (cmd === 'close') { hideModal(); }
  if (cmd === 'new-game') {
    showModal(`<h2>Start a new game?</h2><p>The current game will be abandoned.</p>
      <div class="row"><button class="secondary" data-cmd="close">Cancel</button><button data-cmd="confirm-new">New game</button></div>`);
  }
  if (cmd === 'confirm-new') newGame();
  if (cmd === 'next-hand') {
    hideModal();
    game.nextHand();
    if (game.phase === PHASE.GAME_OVER) showGameOver();
    else { lastSeqSeen = game.seq; step(); }
  }
});

document.addEventListener('keydown', (e) => {
  if (!$('modal').classList.contains('hidden')) {
    if (e.key === 'Escape' && !$('modal-card').querySelector('[data-cmd=next-hand]')) hideModal();
    return;
  }
  if (game.phase !== PHASE.DISCARD || game.turn !== HUMAN) return;
  const hand = [...$('hand').querySelectorAll('.tile')].map((el) => Number(el.dataset.id));
  if (!hand.length) return;
  const i = hand.indexOf(selectedId);
  if (e.key === 'ArrowRight') { selectedId = hand[(i + 1) % hand.length]; render(); }
  if (e.key === 'ArrowLeft') { selectedId = hand[(i - 1 + hand.length) % hand.length]; render(); }
  if ((e.key === 'Enter' || e.key === ' ') && selectedId !== null) { e.preventDefault(); humanAct({ type: 'discard', tileId: selectedId }); }
});

// ------------------------------------------------------------------ modals

function showModal(html) {
  // Dialogs that must be answered (hand results) get no close button.
  const closable = !/data-cmd="(next-hand|confirm-new)"/.test(html) || html.includes('data-cmd="close"');
  $('modal-card').innerHTML = (closable ? '<button class="modal-x" data-cmd="close" aria-label="Close">×</button>' : '') + html;
  $('modal').classList.remove('hidden');
}
function hideModal() { $('modal').classList.add('hidden'); }

function showSettings() {
  const opt = (val, cur, label) => `<option value="${val}" ${String(val) === String(cur) ? 'selected' : ''}>${label}</option>`;
  showModal(`<h2>Settings</h2>
    <label>Your name <input type="text" name="name" maxlength="16" value="${esc(settings.name)}"></label>
    <label>Minimum faan to win
      <select name="minFaan">${opt(0, settings.minFaan, '0 (chicken hands allowed)')}${opt(1, settings.minFaan, '1 (casual)')}${opt(3, settings.minFaan, '3 (traditional Hong Kong)')}</select></label>
    <label>Game length
      <select name="rounds">${opt(1, settings.rounds, 'East round only (≈4+ hands)')}${opt(2, settings.rounds, 'East & South rounds')}${opt(4, settings.rounds, 'Full game (4 rounds)')}</select></label>
    <label>Opponent speed
      <select name="speed">${opt('slow', settings.speed, 'Slow')}${opt('normal', settings.speed, 'Normal')}${opt('fast', settings.speed, 'Fast')}</select></label>
    <label>Show number/wind hints on tiles <input type="checkbox" name="hints" ${settings.hints ? 'checked' : ''}></label>
    <label>Show the Hint button (suggests a discard) <input type="checkbox" name="hintButton" ${settings.hintButton ? 'checked' : ''}></label>
    <label>Discard with a single click <input type="checkbox" name="oneClick" ${settings.oneClick ? 'checked' : ''}></label>
    <p><small>Minimum faan and game length apply when a new game starts.</small></p>
    <div class="row">
      <button class="secondary" data-cmd="close">Cancel</button>
      <button class="secondary" data-cmd="save-settings">Save</button>
      <button data-cmd="save-settings" data-restart="1">Save &amp; new game</button>
    </div>`);
}

function revealRows(v) {
  return v.players.map((p, s) => {
    const melds = p.melds.map((m) => meldHTML(m, 'sm')).join('');
    const hand = (p.hand || []).map((t) => tile(t, 'sm')).join('');
    return `<div class="reveal-row"><span class="who">${esc(p.name)}</span><div class="meld">${hand}</div>${melds}${flowersHTML(p.flowers, 'sm')}</div>`;
  }).join('');
}

function scoreTable(v) {
  const r = v.result;
  return `<table><tr><th>Player</th><th class="num">Change</th><th class="num">Score</th></tr>
    ${v.players.map((p, s) => `<tr><td>${esc(p.name)}${s === HUMAN && p.name !== 'You' ? ' (you)' : ''}</td>
      <td class="num ${r.payments[s] > 0 ? 'pos' : r.payments[s] < 0 ? 'neg' : ''}">${signed(r.payments[s])}</td>
      <td class="num">${p.score}</td></tr>`).join('')}</table>`;
}

function showResult() {
  const v = game.view(HUMAN);
  const r = v.result;
  let body;
  if (r.type === 'win') {
    const w = v.players[r.winner];
    const how = r.from === null ? 'Self-drawn <span class="zh">自摸</span>' : `On ${esc(v.players[r.from].name)}'s discard`;
    const handTiles = (w.hand || []).filter((t) => !isBonus(t.kind));
    const title = r.winner === HUMAN ? 'You win!' : `${esc(w.name)} wins`;
    body = `<h2 class="result-title"><span class="zh">食糊</span>${title}</h2>
      <p>${how} — <strong>${r.faan} faan</strong>${r.limit ? ' (limit hand)' : ''}, worth ${faanValue(r.faan)} per unit.</p>
      <div class="tiles">${handTiles.map((t) => tile(t, 'sm', r.winTile && t.id === r.winTile.id ? 'win-tile' : '')).join('')}
        ${w.melds.map((m) => meldHTML(m, 'sm')).join('')} ${flowersHTML(w.flowers, 'sm')}</div>
      <table>${r.items.map((i) => `<tr><td>${esc(i.name)} <span class="zh">${i.zh}</span></td><td class="num">${i.limit ? 'Limit' : `${i.faan} faan`}</td></tr>`).join('')}
        <tr><th>Total</th><th class="num">${r.faan} faan</th></tr></table>`;
  } else {
    body = `<h2 class="result-title"><span class="zh">流局</span>Draw game</h2><p>The wall ran out with no winner.</p>`;
  }
  const dealerNote = r.gameOver ? '' : `<p><small>${r.dealerStays ? 'The dealer stays for another hand.' : 'The deal passes to the next player.'}</small></p>`;
  showModal(`${body}<h3>Hands</h3>${revealRows(v)}<h3>Scores</h3>${scoreTable(v)}${dealerNote}
    <div class="row"><button data-cmd="next-hand">${r.gameOver ? 'See final results' : 'Next hand'}</button></div>`);
}

function showGameOver() {
  const v = game.view(HUMAN);
  const ranked = v.players.map((p, s) => ({ ...p, s })).sort((a, b) => b.score - a.score);
  const place = ranked.findIndex((p) => p.s === HUMAN) + 1;
  const msg = place === 1 ? 'Congratulations, you came first!' : `You finished in place ${place} of 4.`;
  showModal(`<h2>Game over</h2><p>${msg}</p>
    <table><tr><th>#</th><th>Player</th><th class="num">Score</th></tr>
    ${ranked.map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.name)}</td><td class="num">${p.score}</td></tr>`).join('')}</table>
    <div class="row"><button data-cmd="confirm-new">Play again</button></div>`);
}

window.addEventListener('resize', () => render());
newGame();
