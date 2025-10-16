// utils/blockRise/constants.js
import { Dimensions } from "react-native";

export const COLS = 12;         // ← new width
export const ROWS = 24;         // ← new height
export const { width: screenWidth } = Dimensions.get("window");

// Cell size is derived from COLS so the grid always shows all columns
export const CELL_SIZE = (screenWidth - 80) / COLS;

export const COLORS = [
  "#9b5de5", "#f15bb5", "#fee440", "#00bbf9", "#00f5d4",
  "#ff6b6b", "#4ecdc4", "#96ceb4", "#ffd166", "#a8dadc",
];

// Only triominoes & pentominoes (no Tetris 7)
export const RAW_SHAPES = [
  // Triominoes
  { name: "TriLine", g: [[1,1,1]] },
  { name: "TriL",    g: [[1,0],[1,1]] },
  { name: "TriV",    g: [[1,1],[1,0]] },

  // Pentominoes
  { name: "Plus",    g: [[0,1,0],[1,1,1],[0,1,0]] },
  { name: "PentoL",  g: [[1,0],[1,0],[1,1]] },
  { name: "PentoS",  g: [[0,1,1],[1,1,0],[1,0,0]] },
  { name: "PentoW",  g: [[1,0,0],[1,1,0],[0,1,1]] },
  { name: "PentoU",  g: [[1,0,1],[1,1,1]] },
];

const rotateGrid = (g) => {
  const rows = g.length, cols = g[0].length;
  const out = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) out[c][rows-1-r] = g[r][c];
  return out;
};
const eq = (a,b) => a.length===b.length && a[0].length===b[0].length &&
  a.every((row,i)=>row.every((v,j)=>v===b[i][j]));

export const SHAPES = RAW_SHAPES.map(s => {
  const rots = [];
  let cur = s.g;
  for (let i=0;i<4;i++){ if(!rots.some(r=>eq(r,cur))) rots.push(cur); cur = rotateGrid(cur); }
  return { name: s.name, rotations: rots };
});
