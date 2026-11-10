// Simula zapatos de 8 mazos y apuesta SOLO cuando el motor exacto dice EV > 0.
// Uso: node simulate.js <zapatos> [cartas_tras_corte]
const e = require('./engine.js');
const SHOES = +process.argv[2] || 200, CUT = +process.argv[3] || 14;
const cfg = { tiePay: 8, noCommission: false };
const pay = { banker: null, player: 1, tie: 8, playerPair: 11, bankerPair: 11, dragon7: 40, panda8: 25 };
const stats = {}; for (const k in pay) stats[k] = { bets: 0, profit: 0, evSum: 0 };
let hands = 0, handsWithEdge = 0;
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

for (let s = 0; s < SHOES; s++) {
  const deck = []; for (let r = 0; r < 13; r++) for (let i = 0; i < 32; i++) deck.push(r);
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const counts = new Array(13).fill(32); let i = 0;
  const take = () => { const r = deck[i++]; counts[r]--; return r; };
  const burn = e.rankValue(deck[0]) || 10; for (let k = 0; k <= burn; k++) take();
  while (deck.length - i > CUT) {
    const pr = e.computeProbs(counts); if (!pr) break;
    const ev = e.computeEV(pr, cfg);
    const bets = Object.keys(pay).filter(k => ev[k] > 0);
    // reparte la mano
    const pc = [], bc = [];
    while (true) { const sl = e.nextSlot(pc.map(e.rankValue), bc.map(e.rankValue)); if (!sl) break; (sl === 'P' ? pc : bc).push(take()); }
    const o = e.handOutcome(pc.map(e.rankValue), bc.map(e.rankValue));
    hands++; if (bets.length) handsWithEdge++;
    for (const k of bets) {
      const st = stats[k]; st.bets++; st.evSum += ev[k];
      let w;
      if (k === 'banker') w = o.r === 'B' ? 0.95 : o.r === 'P' ? -1 : 0;
      else if (k === 'player') w = o.r === 'P' ? 1 : o.r === 'B' ? -1 : 0;
      else if (k === 'tie') w = o.r === 'T' ? 8 : -1;
      else if (k === 'playerPair') w = pc[0] === pc[1] ? 11 : -1;
      else if (k === 'bankerPair') w = bc[0] === bc[1] ? 11 : -1;
      else if (k === 'dragon7') w = o.dragon7 ? 40 : -1;
      else w = o.panda8 ? 25 : -1;
      st.profit += w;
    }
  }
}
console.log(`zapatos=${SHOES} manos=${hands} manos_con_ventaja=${handsWithEdge} (${(100*handsWithEdge/hands).toFixed(2)}%)`);
let tb = 0, tp = 0;
for (const k in stats) { const st = stats[k]; if (!st.bets) { console.log(k.padEnd(11), 'sin apuestas'); continue; }
  tb += st.bets; tp += st.profit;
  console.log(k.padEnd(11), `apuestas=${st.bets}`.padEnd(15), `EV_medio=${(100*st.evSum/st.bets).toFixed(2)}%`.padEnd(17), `ganancia_real=${st.profit.toFixed(1)}u`); }
console.log(`TOTAL apuestas=${tb} ganancia=${tp.toFixed(1)} unidades | por zapato=${(tp/SHOES).toFixed(2)}u | apuestas por zapato=${(tb/SHOES).toFixed(2)}`);
