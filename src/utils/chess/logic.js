export const pieces = {
  K: "♔",
  Q: "♕",
  R: "♖",
  B: "♗",
  N: "♘",
  P: "♙",
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟︎",
};

export const pieceValues = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 1000,
  P: 1,
  N: 3,
  B: 3,
  R: 5,
  Q: 9,
  K: 1000,
};

export const isWhitePiece = (piece) => piece && piece === piece.toUpperCase();
export const isBlackPiece = (piece) => piece && piece === piece.toLowerCase();
export const isSquareOnBoard = (row, col) =>
  row >= 0 && row < 8 && col >= 0 && col < 8;

export const findKing = (boardState, isWhite) => {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = boardState[row][col];
      if (
        piece &&
        piece.toLowerCase() === "k" &&
        ((isWhite && isWhitePiece(piece)) || (!isWhite && isBlackPiece(piece)))
      ) {
        return [row, col];
      }
    }
  }
  return null;
};

export const getPieceAttacks = (fromRow, fromCol, piece, boardState) => {
  const attacks = [];
  const pieceType = piece.toLowerCase();

  switch (pieceType) {
    case "p":
      const direction = isWhitePiece(piece) ? -1 : 1;
      [-1, 1].forEach((colOffset) => {
        const newRow = fromRow + direction;
        const newCol = fromCol + colOffset;
        if (isSquareOnBoard(newRow, newCol)) {
          attacks.push([newRow, newCol]);
        }
      });
      break;
    case "r":
      [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ].forEach(([rowDir, colDir]) => {
        for (let i = 1; i < 8; i++) {
          const newRow = fromRow + i * rowDir;
          const newCol = fromCol + i * colDir;
          if (!isSquareOnBoard(newRow, newCol)) break;
          attacks.push([newRow, newCol]);
          if (boardState[newRow][newCol]) break;
        }
      });
      break;
    case "n":
      [
        [-2, -1],
        [-2, 1],
        [-1, -2],
        [-1, 2],
        [1, -2],
        [1, 2],
        [2, -1],
        [2, 1],
      ].forEach(([rowOffset, colOffset]) => {
        const newRow = fromRow + rowOffset;
        const newCol = fromCol + colOffset;
        if (isSquareOnBoard(newRow, newCol)) {
          attacks.push([newRow, newCol]);
        }
      });
      break;
    case "b":
      [
        [-1, -1],
        [-1, 1],
        [1, -1],
        [1, 1],
      ].forEach(([rowDir, colDir]) => {
        for (let i = 1; i < 8; i++) {
          const newRow = fromRow + i * rowDir;
          const newCol = fromCol + i * colDir;
          if (!isSquareOnBoard(newRow, newCol)) break;
          attacks.push([newRow, newCol]);
          if (boardState[newRow][newCol]) break;
        }
      });
      break;
    case "q":
      [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1],
      ].forEach(([rowDir, colDir]) => {
        for (let i = 1; i < 8; i++) {
          const newRow = fromRow + i * rowDir;
          const newCol = fromCol + i * colDir;
          if (!isSquareOnBoard(newRow, newCol)) break;
          attacks.push([newRow, newCol]);
          if (boardState[newRow][newCol]) break;
        }
      });
      break;
    case "k":
      [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1],
      ].forEach(([rowOffset, colOffset]) => {
        const newRow = fromRow + rowOffset;
        const newCol = fromCol + colOffset;
        if (isSquareOnBoard(newRow, newCol)) {
          attacks.push([newRow, newCol]);
        }
      });
      break;
  }
  return attacks;
};

export const getAttackSquares = (boardState, isWhite) => {
  const attackSquares = new Set();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = boardState[row][col];
      if (
        piece &&
        ((isWhite && isWhitePiece(piece)) || (!isWhite && isBlackPiece(piece)))
      ) {
        const attacks = getPieceAttacks(row, col, piece, boardState);
        attacks.forEach(([r, c]) => attackSquares.add(`${r},${c}`));
      }
    }
  }
  return attackSquares;
};

export const isKingInCheck = (boardState, isWhiteKing) => {
  const kingPos = findKing(boardState, isWhiteKing);
  if (!kingPos) return false;
  const opponentAttacks = getAttackSquares(boardState, !isWhiteKing);
  return opponentAttacks.has(`${kingPos[0]},${kingPos[1]}`);
};

export const getPieceMoves = (
  fromRow,
  fromCol,
  piece,
  boardState,
  gameState = {},
) => {
  const moves = [];
  const pieceType = piece.toLowerCase();
  const isWhite = isWhitePiece(piece);

  switch (pieceType) {
    case "p":
      const direction = isWhite ? -1 : 1;
      const startRow = isWhite ? 6 : 1;
      const promotionRow = isWhite ? 0 : 7;

      // One square forward
      const oneForward = fromRow + direction;
      if (
        isSquareOnBoard(oneForward, fromCol) &&
        !boardState[oneForward][fromCol]
      ) {
        if (oneForward === promotionRow) {
          // Pawn promotion - create moves for each promotion piece
          ["q", "r", "b", "n"].forEach((promotionPiece) => {
            const promotedPiece = isWhite
              ? promotionPiece.toUpperCase()
              : promotionPiece;
            moves.push([oneForward, fromCol, { promotion: promotedPiece }]);
          });
        } else {
          moves.push([oneForward, fromCol]);
        }

        // Two squares forward from starting position
        if (fromRow === startRow) {
          const twoForward = fromRow + 2 * direction;
          if (
            isSquareOnBoard(twoForward, fromCol) &&
            !boardState[twoForward][fromCol]
          ) {
            moves.push([twoForward, fromCol]);
          }
        }
      }

      // Diagonal captures
      [-1, 1].forEach((colOffset) => {
        const newRow = fromRow + direction;
        const newCol = fromCol + colOffset;
        if (isSquareOnBoard(newRow, newCol)) {
          const targetPiece = boardState[newRow][newCol];
          if (
            targetPiece &&
            ((isWhite && isBlackPiece(targetPiece)) ||
              (!isWhite && isWhitePiece(targetPiece)))
          ) {
            if (newRow === promotionRow) {
              // Pawn promotion on capture
              ["q", "r", "b", "n"].forEach((promotionPiece) => {
                const promotedPiece = isWhite
                  ? promotionPiece.toUpperCase()
                  : promotionPiece;
                moves.push([newRow, newCol, { promotion: promotedPiece }]);
              });
            } else {
              moves.push([newRow, newCol]);
            }
          }

          // En passant
          if (
            gameState.enPassantTarget &&
            newRow === gameState.enPassantTarget[0] &&
            newCol === gameState.enPassantTarget[1]
          ) {
            moves.push([newRow, newCol, { enPassant: true }]);
          }
        }
      });
      break;
    case "r":
    case "b":
    case "q":
      const directions = {
        r: [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ],
        b: [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ],
        q: [
          [-1, -1],
          [-1, 0],
          [-1, 1],
          [0, -1],
          [0, 1],
          [1, -1],
          [1, 0],
          [1, 1],
        ],
      }[pieceType];
      directions.forEach(([rowDir, colDir]) => {
        for (let i = 1; i < 8; i++) {
          const newRow = fromRow + i * rowDir;
          const newCol = fromCol + i * colDir;
          if (!isSquareOnBoard(newRow, newCol)) break;
          const targetPiece = boardState[newRow][newCol];
          if (!targetPiece) {
            moves.push([newRow, newCol]);
          } else {
            if (
              (isWhite && isBlackPiece(targetPiece)) ||
              (!isWhite && isWhitePiece(targetPiece))
            ) {
              moves.push([newRow, newCol]);
            }
            break;
          }
        }
      });
      break;
    case "n":
      [
        [-2, -1],
        [-2, 1],
        [-1, -2],
        [-1, 2],
        [1, -2],
        [1, 2],
        [2, -1],
        [2, 1],
      ].forEach(([rowOffset, colOffset]) => {
        const newRow = fromRow + rowOffset;
        const newCol = fromCol + colOffset;
        if (isSquareOnBoard(newRow, newCol)) {
          const targetPiece = boardState[newRow][newCol];
          if (
            !targetPiece ||
            (isWhite && isBlackPiece(targetPiece)) ||
            (!isWhite && isWhitePiece(targetPiece))
          ) {
            moves.push([newRow, newCol]);
          }
        }
      });
      break;
    case "k":
      // Regular king moves
      [
        [-1, -1],
        [-1, 0],
        [-1, 1],
        [0, -1],
        [0, 1],
        [1, -1],
        [1, 0],
        [1, 1],
      ].forEach(([rowOffset, colOffset]) => {
        const newRow = fromRow + rowOffset;
        const newCol = fromCol + colOffset;
        if (isSquareOnBoard(newRow, newCol)) {
          const targetPiece = boardState[newRow][newCol];
          if (
            !targetPiece ||
            (isWhite && isBlackPiece(targetPiece)) ||
            (!isWhite && isWhitePiece(targetPiece))
          ) {
            moves.push([newRow, newCol]);
          }
        }
      });

      // Castling
      if (gameState.castlingRights) {
        const row = isWhite ? 7 : 0;
        if (fromRow === row && fromCol === 4) {
          const rights = isWhite
            ? gameState.castlingRights.white
            : gameState.castlingRights.black;

          // Kingside castling
          if (
            rights.kingside &&
            !boardState[row][5] &&
            !boardState[row][6] &&
            boardState[row][7] &&
            boardState[row][7].toLowerCase() === "r"
          ) {
            // Check if king or squares in between are under attack
            const opponentAttacks = getAttackSquares(boardState, !isWhite);
            if (
              !opponentAttacks.has(`${row},4`) &&
              !opponentAttacks.has(`${row},5`) &&
              !opponentAttacks.has(`${row},6`)
            ) {
              moves.push([row, 6, { castling: "kingside" }]);
            }
          }

          // Queenside castling
          if (
            rights.queenside &&
            !boardState[row][3] &&
            !boardState[row][2] &&
            !boardState[row][1] &&
            boardState[row][0] &&
            boardState[row][0].toLowerCase() === "r"
          ) {
            const opponentAttacks = getAttackSquares(boardState, !isWhite);
            if (
              !opponentAttacks.has(`${row},4`) &&
              !opponentAttacks.has(`${row},3`) &&
              !opponentAttacks.has(`${row},2`)
            ) {
              moves.push([row, 2, { castling: "queenside" }]);
            }
          }
        }
      }
      break;
  }
  return moves;
};

export const getLegalMoves = (
  fromRow,
  fromCol,
  piece,
  board,
  gameState = {},
) => {
  const possibleMoves = getPieceMoves(
    fromRow,
    fromCol,
    piece,
    board,
    gameState,
  );
  const legalMoves = [];
  const isPlayerWhite = isWhitePiece(piece);

  possibleMoves.forEach((move) => {
    const [toRow, toCol, moveData] = move;
    const tempBoard = board.map((row) => [...row]);

    // Apply the move to temp board
    if (moveData?.castling) {
      tempBoard[fromRow][fromCol] = null;
      tempBoard[toRow][toCol] = piece;
      if (moveData.castling === "kingside") {
        tempBoard[toRow][5] = tempBoard[toRow][7];
        tempBoard[toRow][7] = null;
      } else {
        tempBoard[toRow][3] = tempBoard[toRow][0];
        tempBoard[toRow][0] = null;
      }
    } else if (moveData?.enPassant) {
      tempBoard[toRow][toCol] = piece;
      tempBoard[fromRow][toCol] = null;
      tempBoard[fromRow][fromCol] = null;
    } else {
      tempBoard[toRow][toCol] = moveData?.promotion || piece;
      tempBoard[fromRow][fromCol] = null;
    }

    if (!isKingInCheck(tempBoard, isPlayerWhite)) {
      legalMoves.push(move);
    }
  });

  return legalMoves;
};

export const getAllLegalMoves = (boardState, isWhite, gameState = {}) => {
  const moves = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = boardState[row][col];
      if (
        piece &&
        ((isWhite && isWhitePiece(piece)) || (!isWhite && isBlackPiece(piece)))
      ) {
        const pieceMoves = getLegalMoves(
          row,
          col,
          piece,
          boardState,
          gameState,
        );
        pieceMoves.forEach((move) => {
          const [toRow, toCol, moveData] = move;
          moves.push({
            from: [row, col],
            to: [toRow, toCol],
            piece,
            capturedPiece: boardState[toRow][toCol],
            moveData,
          });
        });
      }
    }
  }
  return moves;
};

export const isCheckmate = (boardState, isWhitePlayer) => {
  if (!isKingInCheck(boardState, isWhitePlayer)) return false;
  const legalMoves = getAllLegalMoves(boardState, isWhitePlayer);
  return legalMoves.length === 0;
};

// NEW: Stalemate detection
export const isStalemate = (boardState, isWhitePlayer) => {
  if (isKingInCheck(boardState, isWhitePlayer)) return false;
  const legalMoves = getAllLegalMoves(boardState, isWhitePlayer);
  return legalMoves.length === 0;
};

// NEW: Check for any draw conditions
export const isDraw = (boardState, isWhitePlayer) => {
  return isStalemate(boardState, isWhitePlayer);
  // Could add other draw conditions like insufficient material, repetition, etc.
};

// Simplified and faster AI
export const evaluatePosition = (boardState) => {
  let score = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = boardState[row][col];
      if (piece) {
        const baseValue = pieceValues[piece.toLowerCase()];
        if (isBlackPiece(piece)) {
          score += baseValue;
        } else {
          score -= baseValue;
        }
      }
    }
  }

  // Bonus/penalty for check
  if (isKingInCheck(boardState, true)) score += 30;
  if (isKingInCheck(boardState, false)) score -= 30;

  return score;
};

// MASSIVELY IMPROVED AI with minimax and alpha-beta pruning
export const minimax = (
  boardState,
  depth,
  alpha,
  beta,
  isMaximizing,
  gameState = {},
) => {
  if (depth === 0) {
    return evaluatePosition(boardState);
  }

  const moves = getAllLegalMoves(boardState, !isMaximizing, gameState);

  if (moves.length === 0) {
    if (isKingInCheck(boardState, !isMaximizing)) {
      return isMaximizing ? -99999 : 99999; // Checkmate
    }
    return 0; // Stalemate
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      const tempBoard = boardState.map((row) => [...row]);

      // Apply move
      if (move.moveData?.castling) {
        tempBoard[move.from[0]][move.from[1]] = null;
        tempBoard[move.to[0]][move.to[1]] = move.piece;
        if (move.moveData.castling === "kingside") {
          tempBoard[move.to[0]][5] = tempBoard[move.to[0]][7];
          tempBoard[move.to[0]][7] = null;
        } else {
          tempBoard[move.to[0]][3] = tempBoard[move.to[0]][0];
          tempBoard[move.to[0]][0] = null;
        }
      } else if (move.moveData?.enPassant) {
        tempBoard[move.to[0]][move.to[1]] = move.piece;
        const captureRow = isWhitePiece(move.piece)
          ? move.to[0] + 1
          : move.to[0] - 1;
        tempBoard[captureRow][move.to[1]] = null;
        tempBoard[move.from[0]][move.from[1]] = null;
      } else {
        tempBoard[move.to[0]][move.to[1]] =
          move.moveData?.promotion || move.piece;
        tempBoard[move.from[0]][move.from[1]] = null;
      }

      const evaluation = minimax(
        tempBoard,
        depth - 1,
        alpha,
        beta,
        false,
        gameState,
      );
      maxEval = Math.max(maxEval, evaluation);
      alpha = Math.max(alpha, evaluation);
      if (beta <= alpha) break; // Alpha-beta pruning
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      const tempBoard = boardState.map((row) => [...row]);

      // Apply move
      if (move.moveData?.castling) {
        tempBoard[move.from[0]][move.from[1]] = null;
        tempBoard[move.to[0]][move.to[1]] = move.piece;
        if (move.moveData.castling === "kingside") {
          tempBoard[move.to[0]][5] = tempBoard[move.to[0]][7];
          tempBoard[move.to[0]][7] = null;
        } else {
          tempBoard[move.to[0]][3] = tempBoard[move.to[0]][0];
          tempBoard[move.to[0]][0] = null;
        }
      } else if (move.moveData?.enPassant) {
        tempBoard[move.to[0]][move.to[1]] = move.piece;
        const captureRow = isWhitePiece(move.piece)
          ? move.to[0] + 1
          : move.to[0] - 1;
        tempBoard[captureRow][move.to[1]] = null;
        tempBoard[move.from[0]][move.from[1]] = null;
      } else {
        tempBoard[move.to[0]][move.to[1]] =
          move.moveData?.promotion || move.piece;
        tempBoard[move.from[0]][move.from[1]] = null;
      }

      const evaluation = minimax(
        tempBoard,
        depth - 1,
        alpha,
        beta,
        true,
        gameState,
      );
      minEval = Math.min(minEval, evaluation);
      beta = Math.min(beta, evaluation);
      if (beta <= alpha) break; // Alpha-beta pruning
    }
    return minEval;
  }
};

export const selectAIMove = (boardState, skillLevel = 0.8, gameState = {}) => {
  const startTime = Date.now();
  const moves = getAllLegalMoves(boardState, false, gameState);

  if (moves.length === 0) return null;

  // Quick evaluation for very fast response
  const scoredMoves = moves.map((move) => {
    const tempBoard = boardState.map((row) => [...row]);

    // Apply move quickly
    if (move.moveData?.castling) {
      tempBoard[move.from[0]][move.from[1]] = null;
      tempBoard[move.to[0]][move.to[1]] = move.piece;
      if (move.moveData.castling === "kingside") {
        tempBoard[move.to[0]][5] = tempBoard[move.to[0]][7];
        tempBoard[move.to[0]][7] = null;
      } else {
        tempBoard[move.to[0]][3] = tempBoard[move.to[0]][0];
        tempBoard[move.to[0]][0] = null;
      }
    } else if (move.moveData?.enPassant) {
      tempBoard[move.to[0]][move.to[1]] = move.piece;
      const captureRow = isWhitePiece(move.piece)
        ? move.to[0] + 1
        : move.to[0] - 1;
      tempBoard[captureRow][move.to[1]] = null;
      tempBoard[move.from[0]][move.from[1]] = null;
    } else {
      tempBoard[move.to[0]][move.to[1]] =
        move.moveData?.promotion || move.piece;
      tempBoard[move.from[0]][move.from[1]] = null;
    }

    // Quick evaluation
    let score = evaluatePosition(tempBoard);

    // Prioritize captures
    if (move.capturedPiece) {
      score += pieceValues[move.capturedPiece.toLowerCase()];
    }

    // Prioritize checks
    if (isKingInCheck(tempBoard, true)) {
      score += 100;
    }

    // Detect checkmate
    if (isCheckmate(tempBoard, true)) {
      score += 10000;
    }

    // Use minimax for better moves (but limit time)
    if (Date.now() - startTime < 2000) {
      // 2 second limit for thinking
      const depth = skillLevel >= 0.8 ? 3 : 2;
      score = minimax(tempBoard, depth, -Infinity, Infinity, true, gameState);
    }

    return { ...move, score };
  });

  // Sort by score (best for black = highest score)
  scoredMoves.sort((a, b) => b.score - a.score);

  // Apply skill level
  let selectedMove;
  if (skillLevel >= 0.9) {
    selectedMove = scoredMoves[0];
  } else if (skillLevel >= 0.7) {
    const topMoves = scoredMoves.slice(0, Math.min(3, scoredMoves.length));
    selectedMove = topMoves[Math.floor(Math.random() * topMoves.length)];
  } else if (skillLevel >= 0.5) {
    const topMoves = scoredMoves.slice(0, Math.min(5, scoredMoves.length));
    selectedMove = topMoves[Math.floor(Math.random() * topMoves.length)];
  } else {
    const topMoves = scoredMoves.slice(0, Math.min(8, scoredMoves.length));
    selectedMove = topMoves[Math.floor(Math.random() * topMoves.length)];
  }

  return selectedMove;
};
