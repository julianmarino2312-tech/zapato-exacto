// Simulador masivo de baccarat (8 mazos) en paralelo.
// Uso: node simulator.js --hands 2000000 --cuts 14,52,104 --out results.json
// Para cada corte (cartas que quedan cuando se cambia de zapato) mide:
//  - frecuencias reales de Banca/Jugador/Empate (validación contra la teoría)
//  - estrategia "apostar solo con EV positivo" en mesa estándar y mesa EZ
//  - estrategias de patrones (seguir la racha, contra la racha, siempre Banca)
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const path = require('path');
const e = require('./engine.js');

const DECKS = 8;
const TABLES = {
  std: { label: 'Mesa estándar', bets: ['banker', 'player', 'tie', 'playerPair', 'bankerPair'], noComm: false },
  ez: { label: 'Mesa EZ (sin comisión)', bets: ['banker', 'player', 'tie', 'playerPair', 'bankerPair', 'dragon7', 'panda8'], noComm: true },
};
const PATTERNS = ['seguirRacha', 'contraRacha', 'siempreBanca'];
const BUCKET = 52; // agrupa oportunidades por cada mazo restante

function rng(seed) { // xoshiro128**
  let a = seed ^ 0x9e3779b9, b = seed * 0x85ebca6b | 0, c = seed * 0xc2b2ae35 | 0, d = seed ^ 0x27d4eb2f;
  return () => {
    const t = b << 9; let r = Math.imul(b, 5); r = (r << 7 | r >>> 25) * 9;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = d << 11 | d >>> 21;
    return (r >>> 0) / 4294967296;
  };
}

function betResult(k, o, pc, bc, noComm) {
  switch (k) {
    case 'banker': return o.r === 'B' ? (noComm ? (o.dragon7 ? 0 : 1) : 0.95) : o.r === 'P' ? -1 : 0;
    case 'player': return o.r === 'P' ? 1 : o.r === 'B' ? -1 : 0;
    case 'tie': return o.r === 'T' ? 8 : -1;
    case 'playerPair': return pc[0] === pc[1] ? 11 : -1;
    case 'bankerPair': return bc[0] === bc[1] ? 11 : -1;
    case 'dragon7': return o.dragon7 ? 40 : -1;
    case 'panda8': return o.panda8 ? 25 : -1;
  }
}

function emptyStats() {
  const s = { hands: 0, shoes: 0, B: 0, P: 0, T: 0, tables: {}, patterns: {}, buckets: [] };
  for (const t in TABLES) {
    s.tables[t] = { edgeHands: 0, shoeProfit: 0, shoeProfitSq: 0, bets: {} };
    for (const k of TABLES[t].bets) s.tables[t].bets[k] = { n: 0, ev: 0, profit: 0, sq: 0 };
  }
  for (const p of PATTERNS) s.patterns[p] = { n: 0, wins: 0, profit: 0, sq: 0 };
  for (let i = 0; i <= Math.ceil(52 * DECKS / BUCKET); i++) s.buckets.push({ hands: 0, std: 0, ez: 0 });
  return s;
}

function runWorker({ hands, cut, seed }) {
  const rnd = rng(seed);
  const s = emptyStats();
  const deck = []; for (let r = 0; r < 13; r++) for (let i = 0; i < 4 * DECKS; i++) deck.push(r);
  while (s.hands < hands) {
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    const counts = new Array(13).fill(4 * DECKS); let i = 0;
    const take = () => { const r = deck[i++]; counts[r]--; return r; };
    const burn = e.rankValue(deck[0]) || 10; for (let k = 0; k <= burn; k++) take();
    const shoeProfit = {}; for (const t in TABLES) shoeProfit[t] = 0;
    let lastWinner = null;
    s.shoes++;
    while (deck.length - i > cut && s.hands < hands) {
      const left = deck.length - i;
      const pr = e.computeProbsFast(counts); if (!pr) break;
      const evs = {}; for (const t in TABLES) evs[t] = e.computeEV(pr, { tiePay: 8, noCommission: TABLES[t].noComm });
      const pc = [], bc = [];
      while (true) { const sl = e.nextSlot(pc.map(e.rankValue), bc.map(e.rankValue)); if (!sl) break; (sl === 'P' ? pc : bc).push(take()); }
      const o = e.handOutcome(pc.map(e.rankValue), bc.map(e.rankValue));
      s.hands++; s[o.r]++;
      const bk = s.buckets[Math.floor(left / BUCKET)]; bk.hands++;
      for (const t in TABLES) {
        const T = s.tables[t]; let any = false;
        for (const k of TABLES[t].bets) {
          const ev = evs[t][k]; if (!(ev > 0)) continue;
          any = true;
          const w = betResult(k, o, pc, bc, TABLES[t].noComm);
          const b = T.bets[k]; b.n++; b.ev += ev; b.profit += w; b.sq += w * w;
          shoeProfit[t] += w;
        }
        if (any) { T.edgeHands++; bk[t]++; }
      }
      // Estrategias de patrones (mesa estándar)
      const pat = { siempreBanca: 'B' };
      if (lastWinner) { pat.seguirRacha = lastWinner; pat.contraRacha = lastWinner === 'B' ? 'P' : 'B'; }
      for (const p in pat) {
        const side = pat[p];
        const w = side === 'B' ? betResult('banker', o, pc, bc, false) : betResult('player', o, pc, bc, false);
        const st = s.patterns[p]; st.n++; if (w > 0) st.wins++; st.profit += w; st.sq += w * w;
      }
      if (o.r !== 'T') lastWinner = o.r;
    }
    for (const t in TABLES) { s.tables[t].shoeProfit += shoeProfit[t]; s.tables[t].shoeProfitSq += shoeProfit[t] ** 2; }
  }
  return s;
}

function merge(a, b) {
  for (const k of ['hands', 'shoes', 'B', 'P', 'T']) a[k] += b[k];
  for (const t in a.tables) {
    const A = a.tables[t], Bt = b.tables[t];
    A.edgeHands += Bt.edgeHands; A.shoeProfit += Bt.shoeProfit; A.shoeProfitSq += Bt.shoeProfitSq;
    for (const k in A.bets) for (const f of ['n', 'ev', 'profit', 'sq']) A.bets[k][f] += Bt.bets[k][f];
  }
  for (const p in a.patterns) for (const f of ['n', 'wins', 'profit', 'sq']) a.patterns[p][f] += b.patterns[p][f];
  a.buckets.forEach((x, i) => { x.hands += b.buckets[i].hands; x.std += b.buckets[i].std; x.ez += b.buckets[i].ez; });
  return a;
}

function summarize(s, cut) {
  const ci = (sum, sq, n) => { const m = sum / n, v = sq / n - m * m; return { mean: m, ci95: 1.96 * Math.sqrt(Math.max(v, 0) / n) }; };
  const out = { cut, hands: s.hands, shoes: s.shoes, handsPerShoe: s.hands / s.shoes,
    freq: { B: s.B / s.hands, P: s.P / s.hands, T: s.T / s.hands }, tables: {}, patterns: {}, buckets: [] };
  for (const t in s.tables) {
    const T = s.tables[t]; const shoe = ci(T.shoeProfit, T.shoeProfitSq, s.shoes);
    const bets = {}; let nb = 0, pf = 0;
    for (const k in T.bets) { const b = T.bets[k]; nb += b.n; pf += b.profit;
      bets[k] = { n: b.n, perShoe: b.n / s.shoes, avgEV: b.n ? b.ev / b.n : 0, profit: b.profit,
        roi: b.n ? ci(b.profit, b.sq, b.n) : null }; }
    out.tables[t] = { label: TABLES[t].label, edgeHandsPct: T.edgeHands / s.hands, betsPerShoe: nb / s.shoes,
      totalBets: nb, totalProfit: pf, profitPerShoe: shoe, roiPerBet: nb ? pf / nb : 0, bets };
  }
  for (const p in s.patterns) { const P = s.patterns[p];
    out.patterns[p] = { n: P.n, winRate: P.wins / P.n, roi: ci(P.profit, P.sq, P.n) }; }
  s.buckets.forEach((b, i) => { if (b.hands) out.buckets.push({ cardsLeftFrom: i * BUCKET, cardsLeftTo: (i + 1) * BUCKET - 1, hands: b.hands, std: b.std / b.hands, ez: b.ez / b.hands }); });
  return out;
}

if (isMainThread) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const HANDS = +arg('hands', 1000000), CUTS = arg('cuts', '14,52,104').split(',').map(Number), OUT = arg('out', 'results.json');
  const W = Math.max(1, os.cpus().length - 1);
  (async () => {
    const all = [];
    for (const cut of CUTS) {
      const t0 = Date.now();
      const parts = await Promise.all(Array.from({ length: W }, (_, w) => new Promise((res, rej) => {
        const wk = new Worker(__filename, { workerData: { hands: Math.ceil(HANDS / W), cut, seed: 1000 * cut + w + 1 } });
        wk.on('message', res); wk.on('error', rej);
      })));
      const merged = parts.reduce((a, b) => merge(a, b));
      const sum = summarize(merged, cut); all.push(sum);
      const f = x => (x * 100).toFixed(2) + '%';
      console.log(`\n=== Corte: ${cut} cartas · ${sum.hands.toLocaleString()} manos · ${sum.shoes.toLocaleString()} zapatos · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      console.log(`Frecuencias: Banca ${f(sum.freq.B)}  Jugador ${f(sum.freq.P)}  Empate ${f(sum.freq.T)}`);
      for (const t in sum.tables) { const T = sum.tables[t];
        console.log(`${T.label}: manos con ventaja ${f(T.edgeHandsPct)} · apuestas/zapato ${T.betsPerShoe.toFixed(2)} · ganancia/zapato ${T.profitPerShoe.mean.toFixed(3)}u ±${T.profitPerShoe.ci95.toFixed(3)} · ROI/apuesta ${f(T.roiPerBet)}`);
        for (const k in T.bets) { const b = T.bets[k]; if (b.n) console.log(`   ${k.padEnd(11)} n=${String(b.n).padEnd(8)} EV medio ${f(b.avgEV).padEnd(8)} ROI real ${f(b.roi.mean)} ±${f(b.roi.ci95)}`); } }
      for (const p in sum.patterns) { const P = sum.patterns[p]; console.log(`Patrón ${p.padEnd(13)} acierto ${f(P.winRate)} · ROI ${f(P.roi.mean)} ±${f(P.roi.ci95)}`); }
    }
    require('fs').writeFileSync(OUT, JSON.stringify({ decks: DECKS, generated: new Date().toISOString(), results: all }, null, 1));
    console.log('\nGuardado en', OUT);
  })();
} else {
  parentPort.postMessage(runWorker(workerData));
}
