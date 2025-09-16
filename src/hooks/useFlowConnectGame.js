// utils/flow_connect/logic.js
// Flow Connect puzzle generator that ALWAYS produces solvable, full-board puzzles.
// Strategy: build a Hamiltonian "snake" path that visits every cell once,
// cut it into disjoint segments, and use each segment's two ends as endpoints.
// Difficulty scales with level by changing segment counts and lengths.

const PALETTES = [
  ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFD93D", "#A29BFE", "#F78FB3", "#36F1CD"],
  ["#FF8A5B", "#5AD8A6", "#6C8AE4", "#FFC542", "#B086F6", "#FF6FA9", "#2ED1C1"],
];

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a Hamiltonian path ("snake") visiting all cells exactly once.
 * Rows alternate direction: 0→n-1, then n-1→0, etc.
 */
function buildSnakePath(n) {
  const path = [];
  for (let r = 0; r < n; r++) {
    if (r % 2 === 0) {
      for (let c = 0; c < n; c++) path.push({ row: r, col: c });
    } else {
      for (let c = n - 1; c >= 0; c--) path.push({ row: r, col: c });
    }
  }
  return path;
}

/**
 * Split total cells into k segment lengths that sum to total.
 * Each segment length >= minLen. We allow slight variance to avoid uniformity.
 */
function splitIntoSegments(total, k, minLen) {
  const lens = Array(k).fill(minLen);
  let remaining = total - k * minLen;
  // Distribute the remainder randomly
  while (remaining > 0) {
    for (let i = 0; i < k && remaining > 0; i++) {
      const add = Math.min(1 + Math.floor(Math.random() * 3), remaining);
      lens[i] += add;
      remaining -= add;
    }
  }
  // Randomize order a bit so endpoints aren't predictable
  return shuffled(lens);
}

/**
 * Determine number of colors (segments) based on grid size and level.
 * More level => more segments (more crossings to think about), but clamp sensibly.
 */
function chooseNumColors(n, level) {
  const minColors = Math.max(3, Math.floor(n / 2));
  const maxColors = Math.min(8, Math.floor((n * n) / 3)); // keep segments reasonably sized
  const scaled = minColors + Math.floor(Math.min(level, n * 2) / 2);
  return Math.max(minColors, Math.min(maxColors, scaled));
}

/**
 * Generate puzzle:
 * - endpoints: { [color]: [{row,col}, {row,col}] }
 * - solutionPaths: { [color]: [{row,col}, ...] } // full cover, contiguous
 */
export function generatePuzzle(gridSize = 6, level = 1) {
  const n = gridSize;
  if (n < 3) {
    throw new Error("gridSize must be >= 3");
  }

  // 1) Build a full-board Hamiltonian path.
  const snake = buildSnakePath(n); // length n*n

  // 2) Decide how many colors/segments.
  const numColors = chooseNumColors(n, level);

  // 3) Split snake into disjoint contiguous segments that cover all cells.
  const minLen = Math.max(3, Math.floor(n / 2)); // ensure each pair isn't trivial
  const segLens = splitIntoSegments(n * n, numColors, minLen);

  // 4) Pick a palette and assign colors.
  const palette = randChoice(PALETTES);
  const colors = shuffled(palette).slice(0, numColors);

  // 5) Cut and map to endpoints + solution.
  let idx = 0;
  const endpoints = {};
  const solutionPaths = {};

  for (let i = 0; i < numColors; i++) {
    const len = segLens[i];
    const segment = snake.slice(idx, idx + len);
    idx += len;

    // Safety: ensure contiguous (it always is from snake construction).
    // Endpoints are the ends of the contiguous segment.
    const start = segment[0];
    const end = segment[segment.length - 1];
    const color = colors[i];

    endpoints[color] = [start, end];
    solutionPaths[color] = segment;
  }

  // 6) Validate (full cover, contiguous, disjoint)
  if (!validateSolution(n, endpoints, solutionPaths)) {
    // Extremely unlikely given construction, but just in case: retry once
    return generatePuzzle(n, level);
  }

  return { endpoints, solutionPaths };
}

/**
 * Optional: given a user-drawn 'paths' object, check solved.
 * Each color path must be contiguous from its endpoints, and together they must fill the board.
 */
export function isSolved(n, endpoints, paths) {
  if (!endpoints || !paths) return false;

  // All colors present?
  const colors = Object.keys(endpoints);
  if (colors.length === 0) return false;
  for (const color of colors) {
    const eps = endpoints[color];
    const p = paths[color];
    if (!p || p.length === 0) return false;

    // Must include both endpoints
    const hasStart = p.some(
      (c) => c.row === eps[0].row && c.col === eps[0].col
    );
    const hasEnd = p.some((c) => c.row === eps[1].row && c.col === eps[1].col);
    if (!hasStart || !hasEnd) return false;

    // Path must be 4-connected chain (no jumps)
    if (!isContiguousChain(p)) return false;
  }

  // Board must be completely filled by all paths without overlaps
  const seen = new Set();
  for (const color of colors) {
    for (const cell of paths[color]) {
      const key = cellKey(cell.row, cell.col);
      if (seen.has(key)) return false;
      seen.add(key);
    }
  }
  return seen.size === n * n;
}

/* ------------------------------- Validators ------------------------------- */

function cellKey(r, c) {
  return `${r},${c}`;
}

function isAdjacent(a, b) {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

function isContiguousChain(path) {
  for (let i = 1; i < path.length; i++) {
    if (!isAdjacent(path[i - 1], path[i])) return false;
  }
  return true;
}

function validateSolution(n, endpoints, solutionPaths) {
  // Ensure all colors have endpoints and contiguous path between them
  const colors = Object.keys(endpoints);
  const seen = new Set();

  for (const color of colors) {
    const eps = endpoints[color];
    const p = solutionPaths[color];
    if (!eps || eps.length !== 2 || !p || p.length === 0) return false;

    // Must begin and end at the declared endpoints
    const start = p[0];
    const end = p[p.length - 1];
    if (
      !(
        start.row === eps[0].row &&
        start.col === eps[0].col &&
        end.row === eps[1].row &&
        end.col === eps[1].col
      ) &&
      !(
        start.row === eps[1].row &&
        start.col === eps[1].col &&
        end.row === eps[0].row &&
        end.col === eps[0].col
      )
    ) {
      return false;
    }

    if (!isContiguousChain(p)) return false;

    // No overlaps across colors
    for (const cell of p) {
      const key = cellKey(cell.row, cell.col);
      if (seen.has(key)) return false;
      seen.add(key);
    }
  }

  // Full coverage
  return seen.size === n * n;
}