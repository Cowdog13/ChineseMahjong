// Rules reference shown in the "Rules" dialog.
export function helpHTML(limit) {
  const rows = [
    ['Self-Drawn', '自摸', 1], ['Concealed Hand (no claimed melds)', '門前清', 1], ['No Flowers', '無花', 1],
    ['Seat Flower (each flower/season matching your seat number)', '正花', 1], ['Full set of 4 Flowers or 4 Seasons', '一台花', 2],
    ['Pung of Dragons (each)', '三元牌', 1], ['Pung of your Seat Wind', '門風', 1], ['Pung of the Prevailing Wind', '圈風', 1],
    ['All Chows', '平糊', 1], ['Mixed Terminals (only 1s, 9s and honors)', '混么九', 1],
    ['Win on Kong replacement tile', '槓上開花', 1], ['Robbing a Kong', '搶槓', 1],
    ['Last tile from the wall / last discard', '海底撈月', 1],
    ['All Pungs', '對對糊', 3], ['Mixed One Suit (one suit + honors)', '混一色', 3], ['Seven Pairs', '七對子', 4],
    ['Small Three Dragons (2 dragon pungs + dragon pair)', '小三元', 5], ['Small Four Winds', '小四喜', 6],
    ['Pure One Suit', '清一色', 7], ['Great Three Dragons', '大三元', 8],
    ['Thirteen Orphans, Great Four Winds, All Honors, All Terminals, Nine Gates, Four Kongs, All Concealed Pungs (self-drawn), Heavenly / Earthly Hand, all 8 Flowers', '', 'Limit'],
  ];
  return `<h2>How to play</h2>
  <p>This is Hong Kong style Chinese Mahjong for four players: you against three computer opponents.
  Play goes counter-clockwise (to your right).</p>

  <h3>Goal</h3>
  <p>Be first to complete a hand of <strong>four sets and a pair</strong> (14 tiles). A set is a
  <strong>Chow</strong> (上, three in a row of one suit, e.g. 3-4-5 Dots), a <strong>Pung</strong> (碰, three identical tiles)
  or a <strong>Kong</strong> (槓, four identical tiles; you draw an extra tile to make up for it).</p>

  <h3>Tiles</h3>
  <ul>
    <li><strong>Suits</strong>, numbered 1–9: Characters 萬, Dots 筒 (circles), Bamboo 索 (sticks; the 1 is a bird).</li>
    <li><strong>Winds</strong> 東 East, 南 South, 西 West, 北 North and <strong>Dragons</strong> 中 Red, 發 Green, 白 White (blue frame). Honors can only make Pungs and Kongs.</li>
    <li><strong>Flowers</strong> 梅蘭菊竹 and <strong>Seasons</strong> 春夏秋冬 are bonus tiles: they are set aside automatically and replaced. They can add faan.</li>
  </ul>

  <h3>A turn</h3>
  <ol>
    <li>You draw a tile (automatic), then discard one: click a tile to select it, click again to throw it away. <em>Hint</em> suggests a discard.</li>
    <li>When someone discards, any player may claim it to <strong>win</strong>, or to make a <strong>Pung/Kong</strong>. Only the next player (to the discarder's right) may claim it for a <strong>Chow</strong>. Winning beats Pung/Kong, which beats Chow.</li>
    <li>After a claim the claimer shows the set and discards, and play continues from them.</li>
    <li>If the wall runs out the hand is a draw.</li>
  </ol>

  <h3>Scoring (faan 番)</h3>
  <p>A winning hand must score at least the minimum faan set in Settings. Each faan doubles the value:
  1 unit = 2<sup>faan</sup> points (capped at ${limit} faan). On a self-drawn win everyone pays 2 units;
  on a discard win the discarder pays 2 units and the others 1 unit each.</p>
  <table>${rows.map(([n, zh, f]) => `<tr><td>${n} <span class="zh">${zh}</span></td><td class="num">${f}</td></tr>`).join('')}</table>

  <h3>Dealer and rounds</h3>
  <p>The dealer (red wind badge) is East. If the dealer wins or the hand is a draw, they deal again;
  otherwise the deal passes to the right. After everyone has dealt, the prevailing wind advances (East → South → …).</p>

  <h3>Keyboard</h3>
  <p>← / → select a tile, Enter discards it.</p>`;
}
