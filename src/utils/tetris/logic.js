// utils/blockRise/logic.js
import { COLS, ROWS, SHAPES, COLORS } from "./constants";

export const createEmptyBoard = () =>
  Array.from({ length: ROWS }, () => Array(COLS).fill(0));

export const randomPiece = () => {
  const def = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  const rotIndex = Math.floor(Math.random() * def.rotations.length);
  const grid = def.rotations[rotIndex];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const x = Math.floor((COLS - grid[0].length) / 2);
  const y = -2;
  return { name: def.name, grid, rotIndex, x, y, color };
};

export const canPlace = (board, piece, nx, ny, grid = piece.grid) => {
  for (let r=0;r<grid.length;r++){
    for (let c=0;c<grid[0].length;c++){
      if (!grid[r][c]) continue;
      const br = ny + r, bc = nx + c;
      if (bc < 0 || bc >= COLS || br >= ROWS) return false;
      if (br >= 0 && board[br][bc]) return false;
    }
  }
  return true;
};

export const mergePiece = (board, piece) => {
  const out = board.map(row => row.slice());
  for (let r=0;r<piece.grid.length;r++)
    for (let c=0;c<piece.grid[0].length;c++)
      if (piece.grid[r][c]) {
        const br = piece.y + r, bc = piece.x + c;
        if (br >= 0 && br < ROWS && bc >= 0 && bc < COLS) out[br][bc] = piece.color;
      }
  return out;
};

export const clearFullRows = (board) => {
  let cleared = 0;
  const keep = [];
  for (let r=0;r<ROWS;r++){
    if (board[r].every(v => v)) cleared++; else keep.push(board[r]);
  }
  while (keep.length < ROWS) keep.unshift(Array(COLS).fill(0));
  return { board: keep, cleared };
};
