# Chinese Mahjong 麻雀

Traditional (Hong Kong style) Chinese Mahjong that runs in a web browser.
You play against three computer opponents.

## Play

Needs [Node.js](https://nodejs.org/) 18 or newer (no other dependencies).

```bash
npm start
```

Then open <http://localhost:8080>. (Any static web server works too; the page uses
JavaScript modules, so it can't be opened straight from the file system.)

## Rules implemented

- 144 tiles: three suits, winds, dragons, and flowers/seasons (bonus tiles, auto-replaced).
- Draw/discard, Chow (from the player on your left only), Pung, Kong (exposed, concealed,
  and adding to a Pung), win on a discard or self-drawn, robbing a Kong.
  Priority: Win > Pung/Kong > Chow; on simultaneous wins the player next in turn order wins.
- Faan (番) scoring with a configurable minimum (0, 1 or 3), limit hands at 10 faan.
  See the in-game **Rules** dialog for the full table.
- Dealer stays on a win or draw; prevailing wind advances after every player has dealt.
  Game length: East round, East + South, or a full four-wind game.

## Project layout

```
index.html, css/        page and styles
src/engine/             rules: tiles, hand analysis, scoring, game state machine (no DOM)
src/ai/bot.js           computer opponents (decide only from what their seat can see)
src/ui/                 rendering, SVG tile art, rules dialog, game loop
tests/                  `npm test` (unit tests + full AI games), `npm run simulate`
server.js               tiny static file server
```

## Toward multiplayer

The engine is built so it can move to a server unchanged:

- Every player, human or bot, acts through `game.legalActions(seat)` and `game.act(seat, action)`.
- `game.view(seat)` returns plain JSON with only what that seat may see (other hands hidden).
- Shuffles use a seeded RNG, so games can be replayed.

A multiplayer version would run `Game` in a Node server (e.g. with WebSockets), send each
client its `view`, accept actions from each client for its own seat, and use `bot.js` for empty seats.
`src/ui/app.js` would then render views received from the server instead of calling the engine directly.
