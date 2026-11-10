// Motor exacto de baccarat (Punto Banco).
// ranks: índice 0..12 = A,2,3,4,5,6,7,8,9,10,J,Q,K
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const rankValue = r => (r >= 9 ? 0 : r + 1); // A=1 ... 9=9, 10/J/Q/K=0

function bankerDraws(b, p3) {
  // b: total de la banca con 2 cartas, p3: valor de la 3ª carta del jugador (o null)
  if (p3 === null) return b <= 5;
  if (b <= 2) return true;
  if (b === 3) return p3 !== 8;
  if (b === 4) return p3 >= 2 && p3 <= 7;
  if (b === 5) return p3 >= 4 && p3 <= 7;
  if (b === 6) return p3 === 6 || p3 === 7;
  return false;
}

// Probabilidades exactas dado el conteo de cartas restantes por rango (13).
function computeProbs(rankCounts) {
  const c = new Array(10).fill(0); // conteo por valor 0..9
  let N = 0;
  for (let r = 0; r < 13; r++) { c[rankValue(r)] += rankCounts[r]; N += rankCounts[r]; }
  const out = { banker: 0, player: 0, tie: 0, dragon7: 0, panda8: 0, natural: 0, N };
  if (N < 6) return null;

  // Reparte P1, B1, P2, B2 en ese orden y aplica reglas.
  for (let p1 = 0; p1 < 10; p1++) {
    if (!c[p1]) continue;
    const w1 = c[p1] / N; c[p1]--;
    for (let b1 = 0; b1 < 10; b1++) {
      if (!c[b1]) continue;
      const w2 = w1 * c[b1] / (N - 1); c[b1]--;
      for (let p2 = 0; p2 < 10; p2++) {
        if (!c[p2]) continue;
        const w3 = w2 * c[p2] / (N - 2); c[p2]--;
        for (let b2 = 0; b2 < 10; b2++) {
          if (!c[b2]) continue;
          const w4 = w3 * c[b2] / (N - 3); c[b2]--;
          const P = (p1 + p2) % 10, B = (b1 + b2) % 10;
          if (P >= 8 || B >= 8) {
            out.natural += w4;
            settle(out, P, B, w4, false, false);
          } else if (P <= 5) {
            for (let p3 = 0; p3 < 10; p3++) {
              if (!c[p3]) continue;
              const w5 = w4 * c[p3] / (N - 4); c[p3]--;
              const P3 = (P + p3) % 10;
              if (bankerDraws(B, p3)) {
                for (let b3 = 0; b3 < 10; b3++) {
                  if (!c[b3]) continue;
                  const w6 = w5 * c[b3] / (N - 5);
                  settle(out, P3, (B + b3) % 10, w6, true, true);
                }
              } else settle(out, P3, B, w5, true, false);
              c[p3]++;
            }
          } else { // jugador se planta con 6-7
            if (bankerDraws(B, null)) {
              for (let b3 = 0; b3 < 10; b3++) {
                if (!c[b3]) continue;
                const w5 = w4 * c[b3] / (N - 4);
                settle(out, P, (B + b3) % 10, w5, false, true);
              }
            } else settle(out, P, B, w4, false, false);
          }
          c[b2]++;
        }
        c[p2]++;
      }
      c[b1]++;
    }
    c[p1]++;
  }

  // Pares (primeras dos cartas del mismo rango)
  let pair = 0;
  for (let r = 0; r < 13; r++) pair += rankCounts[r] * (rankCounts[r] - 1);
  out.pair = pair / (N * (N - 1));
  return out;
}

// Versión rápida: el orden de las dos primeras cartas de cada lado no importa
// (el producto de conteos es el mismo), así que se recorre p1<=p2 y b1<=b2 con multiplicador.
function computeProbsFast(rankCounts) {
  const c = new Array(10).fill(0);
  let N = 0;
  for (let r = 0; r < 13; r++) { c[rankValue(r)] += rankCounts[r]; N += rankCounts[r]; }
  if (N < 6) return null;
  const out = { banker: 0, player: 0, tie: 0, dragon7: 0, panda8: 0, N };
  const D4 = N * (N - 1) * (N - 2) * (N - 3), N4 = N - 4, N5 = N - 5;
  for (let p1 = 0; p1 < 10; p1++) {
    if (!c[p1]) continue; const a = c[p1]; c[p1]--;
    for (let p2 = p1; p2 < 10; p2++) {
      if (!c[p2]) continue; const b = c[p2]; c[p2]--;
      const mp = p1 === p2 ? 1 : 2, P = (p1 + p2) % 10;
      for (let b1 = 0; b1 < 10; b1++) {
        if (!c[b1]) continue; const d = c[b1]; c[b1]--;
        for (let b2 = b1; b2 < 10; b2++) {
          if (!c[b2]) continue;
          const w4 = a * b * d * c[b2] * mp * (b1 === b2 ? 1 : 2) / D4; c[b2]--;
          const B = (b1 + b2) % 10;
          if (P >= 8 || B >= 8) settle(out, P, B, w4, false, false);
          else if (P <= 5) {
            for (let p3 = 0; p3 < 10; p3++) {
              if (!c[p3]) continue;
              const w5 = w4 * c[p3] / N4; c[p3]--;
              const P3 = (P + p3) % 10;
              if (bankerDraws(B, p3)) {
                for (let b3 = 0; b3 < 10; b3++) if (c[b3]) settle(out, P3, (B + b3) % 10, w5 * c[b3] / N5, true, true);
              } else settle(out, P3, B, w5, true, false);
              c[p3]++;
            }
          } else if (B <= 5) {
            for (let b3 = 0; b3 < 10; b3++) if (c[b3]) settle(out, P, (B + b3) % 10, w4 * c[b3] / N4, false, true);
          } else settle(out, P, B, w4, false, false);
          c[b2]++;
        }
        c[b1]++;
      }
      c[p2]++;
    }
    c[p1]++;
  }
  let pair = 0;
  for (let r = 0; r < 13; r++) pair += rankCounts[r] * (rankCounts[r] - 1);
  out.pair = pair / (N * (N - 1));
  return out;
}

function settle(o, P, B, w, p3card, b3card) {
  if (P > B) { o.player += w; if (P === 8 && p3card) o.panda8 += w; }
  else if (B > P) { o.banker += w; if (B === 7 && b3card) o.dragon7 += w; }
  else o.tie += w;
}

// Valor esperado por unidad apostada.
function computeEV(pr, cfg) {
  const ev = {};
  ev.player = pr.player - pr.banker;
  if (cfg.noCommission) ev.banker = (pr.banker - pr.dragon7) - pr.player; // EZ: Dragon 7 = empate de banca
  else ev.banker = 0.95 * pr.banker - pr.player;
  ev.tie = cfg.tiePay * pr.tie - (1 - pr.tie);
  ev.playerPair = 11 * pr.pair - (1 - pr.pair);
  ev.bankerPair = ev.playerPair;
  ev.dragon7 = 40 * pr.dragon7 - (1 - pr.dragon7);
  ev.panda8 = 25 * pr.panda8 - (1 - pr.panda8);
  return ev;
}

// Resultado de una mano concreta (valores de cartas).
function handOutcome(pc, bc) {
  const P = pc.reduce((a, v) => a + v, 0) % 10, B = bc.reduce((a, v) => a + v, 0) % 10;
  const r = P > B ? 'P' : B > P ? 'B' : 'T';
  return { P, B, r, dragon7: r === 'B' && B === 7 && bc.length === 3, panda8: r === 'P' && P === 8 && pc.length === 3 };
}

// Qué carta sigue en la mano: devuelve 'P' / 'B' o null si la mano terminó.
function nextSlot(pc, bc) {
  const seq = ['P', 'B', 'P', 'B'];
  const n = pc.length + bc.length;
  if (n < 4) return seq[n];
  const P = (pc[0] + pc[1]) % 10, B = (bc[0] + bc[1]) % 10;
  if (P >= 8 || B >= 8) return null;
  if (P <= 5 && pc.length === 2) return 'P';
  if (bc.length === 2 && bankerDraws(B, pc.length === 3 ? pc[2] : null)) return 'B';
  return null;
}

if (typeof module !== 'undefined') module.exports = { RANKS, rankValue, computeProbs, computeProbsFast, computeEV, handOutcome, nextSlot, bankerDraws };
