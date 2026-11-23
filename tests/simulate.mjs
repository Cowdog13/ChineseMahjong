import { Game, PHASE } from '../src/engine/game.js';
import { decide } from '../src/ai/bot.js';
const t0=Date.now(); const stats={win:0,draw:0,faan:{}};
for (let g=0; g<Number(process.argv[2]||20); g++){
  const game=new Game({seed:g, rounds:1}); game.startHand();
  while(game.phase!==PHASE.GAME_OVER){
    if(game.phase===PHASE.HAND_OVER){ const r=game.result; if(r.type==='win'){stats.win++; stats.faan[r.faan]=(stats.faan[r.faan]||0)+1;} else stats.draw++; game.nextHand(); continue;}
    const s=game.waitingOn()[0]; game.act(s, decide(game.view(s)));
  }
}
console.log(stats, (Date.now()-t0)+'ms');
