// utils/flow_connect/logic.js
// HARD generator — routes all pairs first, enforces long & bendy paths,
// retries until solvable & non-trivial. Multiple solutions allowed.

export const COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#FD79A8",
  "#6C5CE7",
  "#A29BFE",
  "#74B9FF",
  "#00B894",
  "#E17055",
  "#FDCB6E",
];

/* ---------------- RNG (seeded + salt so each reset can differ) ---------------- */
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seeded = (seed) => mulberry32(xmur3(seed)());
const randInt = (rng, min, maxIncl) =>
  min + Math.floor(rng() * (maxIncl - min + 1));
const shuffle = (rng, arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ---------------- utilities ---------------- */
const inBounds = (r, c, n) => r >= 0 && r < n && c >= 0 && c < n;
const key = (r, c) => `${r},${c}`;
const manhattan = (a, b) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
const neigh4 = (r, c) => [
  { row: r - 1, col: c, dir: 0 },
  { row: r + 1, col: c, dir: 1 },
  { row: r, col: c - 1, dir: 2 },
  { row: r, col: c + 1, dir: 3 },
];

function countBends(path) {
  if (!path || path.length < 3) return 0;
  let bends = 0;
  for (let i = 2; i < path.length; i++) {
    const a = path[i - 2],
      b = path[i - 1],
      c = path[i];
    const d1 =
      a.row === b.row ? (a.col < b.col ? 3 : 2) : a.row < b.row ? 1 : 0;
    const d2 =
      b.row === c.row ? (b.col < c.col ? 3 : 2) : b.row < c.row ? 1 : 0;
    if (d1 !== d2) bends++;
  }
  return bends;
}

/* ---------------- weighted A* router (prefers turns & walls) ---------------- */
function routeOne(rng, grid, start, end, color) {
  const n = grid.length;
  const endK = key(end.row, end.col);

  const wallBias = Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => {
      const d = Math.min(r, c, n - 1 - r, n - 1 - c);
      return (n / 2 - d) * -0.02; // cheaper near walls
    })
  );
  const noise = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => (rng() - 0.5) * 0.1)
  );

  const open = [
    {
      r: start.row,
      c: start.col,
      g: 0,
      h: manhattan(start, end),
      f: manhattan(start, end),
      prevDir: -1,
    },
  ];
  const cameFrom = new Map();
  const seen = new Map();
  const stateK = (r, c, d) => `${r},${c},${d}`;
  seen.set(stateK(start.row, start.col, -1), 0);

  while (open.length) {
    open.sort((a, b) => a.f - b.f || b.g - a.g);
    const cur = open.shift();
    const curCellK = key(cur.r, cur.c);
    if (curCellK === endK) {
      const path = [{ row: cur.r, col: cur.c }];
      let k = stateK(cur.r, cur.c, cur.prevDir);
      while (cameFrom.has(k)) {
        const p = cameFrom.get(k);
        path.unshift({ row: p.r, col: p.c });
        k = stateK(p.r, p.c, p.prevDir);
      }
      return path;
    }

    const ns = shuffle(rng, neigh4(cur.r, cur.c));
    for (const nb of ns) {
      if (!inBounds(nb.row, nb.col, n)) continue;
      const nbCellK = key(nb.row, nb.col);
      if (nbCellK !== endK && grid[nb.row][nb.col] !== null) continue;

      let step = 1;
      if (cur.prevDir === nb.dir && cur.prevDir !== -1)
        step += 0.3; // penalize straight
      else step -= 0.05; // reward turns a bit

      step += wallBias[nb.row][nb.col];
      step += noise[nb.row][nb.col];

      // avoid crowding around other colors to force weaving
      let crowd = 0;
      for (const a of neigh4(nb.row, nb.col)) {
        if (inBounds(a.row, a.col, n)) {
          const v = grid[a.row][a.col];
          if (v !== null && v !== color) crowd += 0.07;
        }
      }
      step += crowd;

      const ng = cur.g + step;
      const nh = manhattan({ row: nb.row, col: nb.col }, end);
      const nf = ng + nh;

      const sk = stateK(nb.row, nb.col, nb.dir);
      const best = seen.get(sk);
      if (best === undefined || ng < best - 1e-9) {
        seen.set(sk, ng);
        open.push({
          r: nb.row,
          c: nb.col,
          g: ng,
          h: nh,
          f: nf,
          prevDir: nb.dir,
        });
        cameFrom.set(sk, cur);
      }
    }
  }
  return null;
}

/* ---------------- endpoint placement ---------------- */
function randomPos(rng, n) {
  return { row: randInt(rng, 0, n - 1), col: randInt(rng, 0, n - 1) };
}
function randomEdgePos(rng, n) {
  const side = randInt(rng, 0, 3);
  if (side === 0) return { row: 0, col: randInt(rng, 0, n - 1) };
  if (side === 1) return { row: n - 1, col: randInt(rng, 0, n - 1) };
  if (side === 2) return { row: randInt(rng, 0, n - 1), col: 0 };
  return { row: randInt(rng, 0, n - 1), col: n - 1 };
}
function isEndpointClean(pos, used, n) {
  const deltas = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  for (const [dr, dc] of deltas) {
    const r = pos.row + dr,
      c = pos.col + dc;
    if (!inBounds(r, c, n)) continue;
    if (used.has(key(r, c))) return false;
  }
  return true;
}

/* ---------------- public API ---------------- */
export function generateHardPuzzle(gridSize = 6, level = 1) {
  const n = gridSize;

  // SALT ensures different layout each reset; level still affects difficulty.
  const salt = Math.floor(Math.random() * 1e9);
  const rng = seeded(`flow-hard|n=${n}|level=${level}|salt=${salt}`);

  // pairs scale with level but are bounded by area
  const maxPairsByArea = Math.max(2, Math.floor((n * n) / 7));
  const targetPairs = Math.min(
    3 + Math.floor(level / 2),
    Math.min(COLORS.length, maxPairsByArea)
  );

  // difficulty thresholds
  const minLenBase = Math.max(4, Math.floor(n * 0.9));
  const minBendsBase = Math.max(1, Math.floor(n * 0.25));
  const bendsBoost = Math.floor(level / 3);
  const maxAttempts = 250;
  const maxPlaceTries = 220;

  // Try from targetPairs down to 2
  for (let pairs = targetPairs; pairs >= 2; pairs--) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const colors = COLORS.slice(0, pairs);
      const endpoints = {};
      const used = new Set();
      const minSep = Math.max(3, Math.floor(n * 1.2)); // keep endpoints far apart

      // Place endpoints
      let okPlace = true;
      for (let i = 0; i < pairs; i++) {
        let placed = false;
        const edgeBias = level > 2 ? 0.7 : 0.5;
        for (let t = 0; t < maxPlaceTries; t++) {
          const pick = rng() < edgeBias ? randomEdgePos : randomPos;
          const a = pick(rng, n),
            b = pick(rng, n);
          const ka = key(a.row, a.col),
            kb = key(b.row, b.col);
          if (ka === kb) continue;
          if (used.has(ka) || used.has(kb)) continue;
          if (manhattan(a, b) < minSep) continue;
          if (!isEndpointClean(a, used, n) || !isEndpointClean(b, used, n))
            continue;
          endpoints[colors[i]] = [a, b];
          used.add(ka);
          used.add(kb);
          placed = true;
          break;
        }
        if (!placed) {
          okPlace = false;
          break;
        }
      }
      if (!okPlace) continue;

      // Route all pairs (long-first)
      const grid = Array.from({ length: n }, () => Array(n).fill(null));
      const order = colors
        .map((c) => ({ c, d: manhattan(endpoints[c][0], endpoints[c][1]) }))
        .sort((a, b) => b.d - a.d)
        .map((x) => x.c);

      const solutionPaths = {};
      let okRoute = true;
      for (const c of order) {
        const [s, e] = endpoints[c];
        const p = routeOne(rng, grid, s, e, c);
        if (!p) {
          okRoute = false;
          break;
        }
        for (const cell of p) grid[cell.row][cell.col] = c;
        solutionPaths[c] = p;
      }
      if (!okRoute) continue;

      // Enforce hardness: each path long & bendy
      let hardEnough = true;
      let bendsTotal = 0;
      for (const c of colors) {
        const p = solutionPaths[c];
        const bends = countBends(p);
        bendsTotal += bends;

        const minLen = Math.max(
          minLenBase,
          Math.floor(n * 0.75) + Math.floor(level / 2)
        );
        const minBends = Math.max(minBendsBase, 1 + bendsBoost);

        if (p.length < minLen || bends < minBends) {
          hardEnough = false;
          break;
        }
      }
      if (!hardEnough) continue;

      // Optional: ensure at least ~60% board covered on higher levels
      let filled = 0;
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++) if (grid[r][c] !== null) filled++;
      if (level >= 3 && filled / (n * n) < 0.6) continue;

      // SUCCESS
      // loud signature so you can confirm it's used
      // eslint-disable-next-line no-console
      console.log(
        `🧠 FlowHard gen OK | n=${n} level=${level} pairs=${pairs} bends=${bendsTotal} salt=${salt}`
      );
      return { endpoints, solutionPaths };
    }
  }

  // Last resort fallback
  const fallback = {
    [COLORS[0]]: [
      { row: 0, col: 0 },
      { row: n - 1, col: n - 1 },
    ],
    [COLORS[1]]: [
      { row: 0, col: n - 1 },
      { row: n - 1, col: 0 },
    ],
  };
  console.warn("⚠️ FlowHard fallback used");
  return { endpoints: fallback, solutionPaths: {} };
}

// Backwards-compat: keep old name too
export const generatePuzzle = generateHardPuzzle;