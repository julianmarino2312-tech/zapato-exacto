// Simulador de bankroll con criterio de Kelly (mesa EZ, 8 mazos).
// Fase A: genera un banco de zapatos reales con el motor exacto y guarda cada apuesta con EV+.
// Fase B: miles de jugadores juegan zapatos sacados de ese banco con distintos bankrolls y fracciones de Kelly.
// Uso: node bankroll-sim.js --pool 20000 --players 2000 --shoes 300 --out bankroll.json
// Todo en "unidades" = apuesta mínima de la mesa.
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
const e = require('./engine.js');

const DECKS = 8;

function rng(seed) {
  let a = seed ^ 0x9e3779b9, b = seed * 0x85ebca6b | 0, c = seed * 0xc2b2ae35 | 0, d = seed ^ 0x27d4eb2f;
  return () => {
    const t = b << 9; let r = Math.imul(b, 5); r = (r << 7 | r >>> 25) * 9;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = d << 11 | d >>> 21;
    return (r >>> 0) / 4294967296;
  };
}

// Probabilidad de ganar (p), de perder (q) y pago (b) de cada apuesta en mesa EZ.
function betSpecs(pr) {
  return {
    banker: { p: pr.banker - pr.dragon7, q: pr.player, b: 1 },
    player: { p: pr.player, q: pr.banker, b: 1 },
    tie: { p: pr.tie, q: 1 - pr.tie, b: 8 },
    playerPair: { p: pr.pair, q: 1 - pr.pair, b: 11 },
    bankerPair: { p: pr.pair, q: 1 - pr.pair, b: 11 },
    dragon7: { p: pr.dragon7, q: 1 - pr.dragon7, b: 40 },
    panda8: { p: pr.panda8, q: 1 - pr.panda8, b: 25 },
  };
}
// Kelly con posibilidad de empate (push): f = (p·b − q) / (b·(p+q))
const kelly = s => (s.p * s.b - s.q) / (s.b * (s.p + s.q));

function outcome(k, o, pc, bc) {
  switch (k) {
    case 'banker': return o.r === 'B' ? (o.dragon7 ? 0 : 1) : o.r === 'P' ? -1 : 0;
    case 'player': return o.r === 'P' ? 1 : o.r === 'B' ? -1 : 0;
    case 'tie': return o.r === 'T' ? 8 : -1;
    case 'playerPair': return pc[0] === pc[1] ? 11 : -1;
    case 'bankerPair': return bc[0] === bc[1] ? 11 : -1;
    case 'dragon7': return o.dragon7 ? 40 : -1;
    case 'panda8': return o.panda8 ? 25 : -1;
  }
}

// Fase A (worker): genera zapatos. Cada zapato = lista de manos; cada mano = lista de [kelly, resultado].
function genShoes({ shoes, cut, seed }) {
  const rnd = rng(seed), pool = [];
  const deck = []; for (let r = 0; r < 13; r++) for (let i = 0; i < 4 * DECKS; i++) deck.push(r);
  for (let s = 0; s < shoes; s++) {
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    const counts = new Array(13).fill(4 * DECKS); let i = 0;
    const take = () => { const r = deck[i++]; counts[r]--; return r; };
    const burn = e.rankValue(deck[0]) || 10; for (let k = 0; k <= burn; k++) take();
    const shoe = [];
    while (deck.length - i > cut) {
      const pr = e.computeProbsFast(counts); if (!pr) break;
      const specs = betSpecs(pr), bets = [];
      for (const k in specs) { const f = kelly(specs[k]); if (f > 0) bets.push([k, f]); }
      const pc = [], bc = [];
      while (true) { const sl = e.nextSlot(pc.map(e.rankValue), bc.map(e.rankValue)); if (!sl) break; (sl === 'P' ? pc : bc).push(take()); }
      if (bets.length) {
        const o = e.handOutcome(pc.map(e.rankValue), bc.map(e.rankValue));
        shoe.push(bets.map(([k, f]) => [f, outcome(k, o, pc, bc)]));
      }
    }
    pool.push(shoe);
  }
  return pool;
}

// Fase B: un jugador. Devuelve bankroll final, si quebró, peor caída y apuestas hechas.
function play(pool, rnd, start, frac, nShoes, maxBet) {
  let bank = start, peak = start, maxDD = 0, bets = 0, ruined = false;
  for (let s = 0; s < nShoes && !ruined; s++) {
    const shoe = pool[Math.floor(rnd() * pool.length)];
    for (const hand of shoe) {
      let stakes = hand.map(([f]) => Math.min(maxBet, Math.round(f * frac * bank)));
      const tot = stakes.reduce((a, b) => a + b, 0);
      if (tot > bank) stakes = stakes.map(x => Math.floor(x * bank / tot));
      let delta = 0;
      hand.forEach(([, w], j) => { if (stakes[j] >= 1) { delta += stakes[j] * w; bets++; } });
      bank += delta;
      if (bank > peak) peak = bank;
      const dd = (peak - bank) / peak; if (dd > maxDD) maxDD = dd;
      if (bank < 1) { ruined = true; bank = 0; break; }
    }
  }
  return { final: bank, ruined, maxDD, bets };
}

const pctile = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(q * arr.length))];

if (isMainThread) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const POOL = +arg('pool', 20000), PLAYERS = +arg('players', 2000), SHOES = +arg('shoes', 300), OUT = arg('out', 'bankroll.json');
  const CUTS = arg('cuts', '14,52').split(',').map(Number);
  const BANKROLLS = [500, 2000, 10000], FRACS = [1, 0.5, 0.25], MAXBET = 1000;
  const W = Math.max(1, os.cpus().length - 1);
  (async () => {
    const out = { decks: DECKS, table: 'EZ', shoesPlayed: SHOES, players: PLAYERS, maxBetUnits: MAXBET, scenarios: [] };
    for (const cut of CUTS) {
      const t0 = Date.now();
      const parts = await Promise.all(Array.from({ length: W }, (_, w) => new Promise((res, rej) => {
        const wk = new Worker(__filename, { workerData: { shoes: Math.ceil(POOL / W), cut, seed: 777 * cut + w + 1 } });
        wk.on('message', res); wk.on('error', rej);
      })));
      const pool = parts.flat();
      console.log(`\n=== Corte ${cut}: banco de ${pool.length.toLocaleString()} zapatos generado en ${((Date.now() - t0) / 1000).toFixed(0)}s · ${SHOES} zapatos por jugador · ${PLAYERS} jugadores`);
      console.log('Bankroll  Kelly   Quiebra   Mediana final   P10      P90      Ganancia/zapato(mediana)  Peor caída(mediana)  Apuestas/zapato');
      for (const start of BANKROLLS) for (const frac of FRACS) {
        const rnd = rng(start * 13 + frac * 1000 + cut);
        const rs = Array.from({ length: PLAYERS }, () => play(pool, rnd, start, frac, SHOES, MAXBET));
        const finals = rs.map(r => r.final).sort((a, b) => a - b), dds = rs.map(r => r.maxDD).sort((a, b) => a - b);
        const sc = { cut, start, frac, ruin: rs.filter(r => r.ruined).length / PLAYERS,
          median: pctile(finals, 0.5), p10: pctile(finals, 0.1), p90: pctile(finals, 0.9),
          medianDD: pctile(dds, 0.5), betsPerShoe: rs.reduce((a, r) => a + r.bets, 0) / PLAYERS / SHOES,
          probLoss: finals.filter(f => f < start).length / PLAYERS };
        out.scenarios.push(sc);
        const fr = { 1: 'completo', 0.5: '1/2', 0.25: '1/4' }[frac];
        console.log(`${String(start).padEnd(9)} ${fr.padEnd(8)}${(sc.ruin * 100).toFixed(1).padStart(6)}%   ${String(Math.round(sc.median)).padStart(10)}   ${String(Math.round(sc.p10)).padStart(7)}  ${String(Math.round(sc.p90)).padStart(7)}  ${((sc.median - start) / SHOES).toFixed(2).padStart(12)}u             ${(sc.medianDD * 100).toFixed(0).padStart(4)}%             ${sc.betsPerShoe.toFixed(1)}   (termina perdiendo: ${(sc.probLoss * 100).toFixed(1)}%)`);
      }
    }
    require('fs').writeFileSync(OUT, JSON.stringify(out, null, 1));
    console.log('\nGuardado en', OUT);
  })();
} else {
  parentPort.postMessage(genShoes(workerData));
}
