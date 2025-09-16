import { PIECES, BOARD_WIDTH, BOARD_HEIGHT } from "./constants";

// Initialize empty board
export const createEmptyBoard = () => {
  return Array(BOARD_HEIGHT)
    .fill(null)
    .map(() => Array(BOARD_WIDTH).fill({ filled: false, color: null }));
};

// Get random piece type
export const getRandomPieceType = () => {
  const types = Object.keys(PIECES);
  return types[Math.floor(Math.random() * types.length)];
};

// Create new piece
export const createPiece = (type) => {
  return {
    type,
    rotation: 0,
    shape: PIECES[type].shape[0],
    color: PIECES[type].color,
  };
};

// Check if position is valid
export const isValidPosition = (board, piece, pos, rotation = 0) => {
  const shape = PIECES[piece.type].shape[rotation];

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if (shape[row][col]) {
        const newRow = pos.y + row;
        const newCol = pos.x + col;

        // Check boundaries
        if (newCol < 0 || newCol >= BOARD_WIDTH || newRow >= BOARD_HEIGHT) {
          return false;
        }

        // Check collision with existing pieces (but allow negative rows for spawning)
        if (newRow >= 0 && board[newRow][newCol].filled) {
          return false;
        }
      }
    }
  }
  return true;
};

// Lock piece to board
export const lockPiece = (board, piece, pos, rotation) => {
  const newBoard = board.map((row) => row.map((cell) => ({ ...cell })));
  const shape = PIECES[piece.type].shape[rotation];

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if (shape[row][col]) {
        const boardRow = pos.y + row;
        const boardCol = pos.x + col;

        if (boardRow >= 0) {
          newBoard[boardRow][boardCol] = {
            filled: true,
            color: piece.color,
          };
        }
      }
    }
  }

  return newBoard;
};

// Clear completed lines
export const clearLines = (board) => {
  const newBoard = [];
  let clearedCount = 0;

  for (let row = 0; row < BOARD_HEIGHT; row++) {
    if (board[row].every((cell) => cell.filled)) {
      clearedCount++;
    } else {
      newBoard.push([...board[row]]);
    }
  }

  // Add empty rows at top
  while (newBoard.length < BOARD_HEIGHT) {
    newBoard.unshift(Array(BOARD_WIDTH).fill({ filled: false, color: null }));
  }

  return { board: newBoard, linesCleared: clearedCount };
};

// Calculate score
export const calculateScore = (linesCleared, currentLevel) => {
  const basePoints = [0, 40, 100, 300, 1200];
  return basePoints[linesCleared] * (currentLevel + 1);
};
