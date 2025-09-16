import { useState, useEffect, useCallback } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as ChessLogic from "../utils/chess/logic";
import gameTracker from "../utils/gameTracking";

export const useChessGame = (gameId) => {
  const [board, setBoard] = useState([]);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [availableMoves, setAvailableMoves] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState("white");
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [moves, setMoves] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [inCheck, setInCheck] = useState({ white: false, black: false });
  const [gameState, setGameState] = useState({
    castlingRights: {
      white: { kingside: true, queenside: true },
      black: { kingside: true, queenside: true },
    },
    enPassantTarget: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,
  });
  const [playerStats, setPlayerStats] = useState({
    wins: 0,
    losses: 0,
    averageMoveTime: 5000,
    lastMoveTime: Date.now(),
    skillLevel: 1, // Challenging but beatable - makes occasional mistakes
    recentMoves: [],
  });
  const [promotionData, setPromotionData] = useState(null); // Add this state

  const updatePlayerStats = useCallback((gameResult, moveTime) => {
    setPlayerStats((prev) => {
      const newStats = { ...prev };
      if (gameResult === "win") {
        newStats.wins += 1;
        newStats.skillLevel = Math.min(1, prev.skillLevel + 0.05);
      } else if (gameResult === "loss") {
        newStats.losses += 1;
        newStats.skillLevel = Math.max(0.2, prev.skillLevel - 0.03);
      }
      if (moveTime) {
        newStats.averageMoveTime = prev.averageMoveTime * 0.8 + moveTime * 0.2;
        if (newStats.averageMoveTime > 10000) {
          newStats.skillLevel = Math.max(0, newStats.skillLevel - 0.02);
        }
      }
      return newStats;
    });
  }, []);

  const initializeGame = useCallback(() => {
    const initialBoard = [
      ["r", "n", "b", "q", "k", "b", "n", "r"],
      ["p", "p", "p", "p", "p", "p", "p", "p"],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null],
      ["P", "P", "P", "P", "P", "P", "P", "P"],
      ["R", "N", "B", "Q", "K", "B", "N", "R"],
    ];
    setBoard(initialBoard);
    setSelectedSquare(null);
    setAvailableMoves([]);
    setCurrentPlayer("white");
    setTimer(0);
    setGameStarted(true);
    setMoves(0);
    setGameOver(false);
    setInCheck({ white: false, black: false });
    setGameState({
      castlingRights: {
        white: { kingside: true, queenside: true },
        black: { kingside: true, queenside: true },
      },
      enPassantTarget: null,
      halfMoveClock: 0,
      fullMoveNumber: 1,
    });
  }, []);

  const showPromotionDialog = () => {
    return new Promise((resolve) => {
      setPromotionData({ resolve });
    });
  };

  const handlePromotionChoice = (piece) => {
    if (promotionData) {
      promotionData.resolve(piece);
      setPromotionData(null);
    }
  };

  const makeMove = useCallback(
    async (fromRow, fromCol, toRow, toCol, moveData) => {
      const newBoard = board.map((r) => [...r]);
      const piece = newBoard[fromRow][fromCol];
      let newGameState = { ...gameState };

      // Handle special moves
      if (moveData?.promotion) {
        newBoard[toRow][toCol] = moveData.promotion;
        newBoard[fromRow][fromCol] = null; // Remove the pawn
      } else if (moveData?.castling) {
        // FIXED CASTLING - Move king first, then rook
        newBoard[fromRow][fromCol] = null; // Remove king from original position
        newBoard[toRow][toCol] = piece; // Place king in new position

        // Move the rook
        if (moveData.castling === "kingside") {
          newBoard[toRow][5] = newBoard[toRow][7]; // Move rook to f-file
          newBoard[toRow][7] = null; // Remove rook from original position
        } else {
          newBoard[toRow][3] = newBoard[toRow][0]; // Move rook to d-file
          newBoard[toRow][0] = null; // Remove rook from original position
        }
      } else if (moveData?.enPassant) {
        newBoard[toRow][toCol] = piece;
        // FIXED EN PASSANT - Remove the correct pawn
        const captureRow = ChessLogic.isWhitePiece(piece)
          ? toRow + 1
          : toRow - 1;
        newBoard[captureRow][toCol] = null;
        newBoard[fromRow][fromCol] = null;
      } else {
        // Regular move
        newBoard[toRow][toCol] = piece;
        newBoard[fromRow][fromCol] = null;
      }

      // Update castling rights
      if (piece?.toLowerCase() === "k") {
        const color = ChessLogic.isWhitePiece(piece) ? "white" : "black";
        newGameState.castlingRights[color] = {
          kingside: false,
          queenside: false,
        };
      } else if (piece?.toLowerCase() === "r") {
        const color = ChessLogic.isWhitePiece(piece) ? "white" : "black";
        if (fromRow === (color === "white" ? 7 : 0)) {
          if (fromCol === 0)
            newGameState.castlingRights[color].queenside = false;
          if (fromCol === 7)
            newGameState.castlingRights[color].kingside = false;
        }
      }

      // Update en passant target
      if (piece?.toLowerCase() === "p" && Math.abs(toRow - fromRow) === 2) {
        newGameState.enPassantTarget = [
          fromRow + (toRow - fromRow) / 2,
          fromCol,
        ];
      } else {
        newGameState.enPassantTarget = null;
      }

      return { newBoard, newGameState };
    },
    [board, gameState],
  );

  const executeAIMove = useCallback(async () => {
    if (currentPlayer !== "black" || gameOver || aiThinking) return;
    setAiThinking(true);

    try {
      // FORCE AI to respond FAST - Maximum 3 seconds
      const aiMove = await Promise.race([
        new Promise((resolve) => {
          const move = ChessLogic.selectAIMove(
            board,
            playerStats.skillLevel,
            gameState,
          );
          resolve(move);
        }),
        new Promise((resolve) => {
          setTimeout(() => {
            // Emergency fallback - random legal move
            const allMoves = ChessLogic.getAllLegalMoves(
              board,
              false,
              gameState,
            );
            const randomMove =
              allMoves[Math.floor(Math.random() * allMoves.length)];
            resolve(randomMove);
          }, 3000); // 3 second absolute maximum
        }),
      ]);

      if (!aiMove) {
        setAiThinking(false);
        return;
      }

      const { newBoard, newGameState } = await makeMove(
        aiMove.from[0],
        aiMove.from[1],
        aiMove.to[0],
        aiMove.to[1],
        aiMove.moveData,
      );

      setBoard(newBoard);
      setGameState(newGameState);
      setCurrentPlayer("white");
      setMoves((prev) => prev + 1);
      setInCheck({
        white: ChessLogic.isKingInCheck(newBoard, true),
        black: ChessLogic.isKingInCheck(newBoard, false),
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Check game end conditions
      if (ChessLogic.isCheckmate(newBoard, true)) {
        setGameOver(true);
        updatePlayerStats("loss");
        gameTracker.endGame(gameId, moves * 5 || 0);
        Alert.alert("Checkmate! 🤖", "AI wins by checkmate! Good game!", [
          { text: "Play Again", onPress: initializeGame },
          { text: "Back to Hub", onPress: () => router.back() },
        ]);
      } else if (ChessLogic.isStalemate(newBoard, true)) {
        setGameOver(true);
        gameTracker.endGame(gameId, moves * 10 || 0);
        Alert.alert(
          "Stalemate! 🤝",
          "It's a draw - no legal moves available!",
          [
            { text: "Play Again", onPress: initializeGame },
            { text: "Back to Hub", onPress: () => router.back() },
          ],
        );
      }
    } catch (error) {
      console.error("AI move error:", error);
    } finally {
      setAiThinking(false);
    }
  }, [
    board,
    currentPlayer,
    gameOver,
    aiThinking,
    playerStats,
    gameState,
    moves,
    gameId,
    initializeGame,
    updatePlayerStats,
    makeMove,
  ]);

  const handleSquarePress = async (row, col) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (gameOver || currentPlayer !== "white" || aiThinking) return;

    if (selectedSquare) {
      const { row: fromRow, col: fromCol } = selectedSquare;
      if (fromRow === row && fromCol === col) {
        setSelectedSquare(null);
        setAvailableMoves([]);
        return;
      }

      const selectedMove = availableMoves.find((move) => {
        if (Array.isArray(move) && move.length >= 2) {
          return move[0] === row && move[1] === col;
        }
        return false;
      });

      if (selectedMove) {
        const moveTime = Date.now() - playerStats.lastMoveTime;
        const piece = board[fromRow][fromCol];
        let moveData = selectedMove[2] || {}; // Get special move data

        // Handle pawn promotion
        if (moveData.promotion) {
          const promotionChoice = await showPromotionDialog();
          moveData = { promotion: promotionChoice };
        }

        const { newBoard, newGameState } = await makeMove(
          fromRow,
          fromCol,
          row,
          col,
          moveData,
        );

        setBoard(newBoard);
        setGameState(newGameState);
        setSelectedSquare(null);
        setAvailableMoves([]);
        setMoves((prev) => prev + 1);
        setCurrentPlayer("black");
        setInCheck({
          white: ChessLogic.isKingInCheck(newBoard, true),
          black: ChessLogic.isKingInCheck(newBoard, false),
        });

        updatePlayerStats(null, moveTime);
        setPlayerStats((prev) => ({
          ...prev,
          lastMoveTime: Date.now(),
          recentMoves: [
            ...prev.recentMoves.slice(-4),
            { from: [fromRow, fromCol], to: [row, col] },
          ],
        }));

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        if (ChessLogic.isCheckmate(newBoard, false)) {
          setGameOver(true);
          updatePlayerStats("win");
          const finalScore = moves * 20 + Math.floor(timer / 5);
          gameTracker.endGame(gameId, finalScore);
          Alert.alert(
            "Checkmate! 🏆",
            "You won by checkmate! Excellent chess playing.",
            [
              { text: "Play Again", onPress: initializeGame },
              { text: "Back to Hub", onPress: () => router.back() },
            ],
          );
        } else if (ChessLogic.isStalemate(newBoard, false)) {
          setGameOver(true);
          gameTracker.endGame(gameId, moves * 15 || 0);
          Alert.alert("Stalemate! 🤝", "It's a draw - AI has no legal moves!", [
            { text: "Play Again", onPress: initializeGame },
            { text: "Back to Hub", onPress: () => router.back() },
          ]);
        }
      } else {
        const piece = board[row][col];
        if (
          piece &&
          currentPlayer === "white" &&
          ChessLogic.isWhitePiece(piece)
        ) {
          setSelectedSquare({ row, col });
          setAvailableMoves(
            ChessLogic.getPieceMoves(row, col, piece, board, gameState).filter(
              (move) => {
                // Validate the move doesn't leave king in check
                const tempBoard = board.map((r) => [...r]);
                const moveToRow = Array.isArray(move) ? move[0] : move.to[0];
                const moveToCol = Array.isArray(move) ? move[1] : move.to[1];
                tempBoard[moveToRow][moveToCol] = tempBoard[row][col];
                tempBoard[row][col] = null;
                return !ChessLogic.isKingInCheck(tempBoard, true);
              },
            ),
          );
        } else {
          setSelectedSquare(null);
          setAvailableMoves([]);
        }
      }
    } else {
      const piece = board[row][col];
      if (
        piece &&
        currentPlayer === "white" &&
        ChessLogic.isWhitePiece(piece)
      ) {
        setSelectedSquare({ row, col });
        setAvailableMoves(
          ChessLogic.getPieceMoves(row, col, piece, board, gameState).filter(
            (move) => {
              // Validate the move doesn't leave king in check
              const tempBoard = board.map((r) => [...r]);
              const moveToRow = Array.isArray(move) ? move[0] : move.to[0];
              const moveToCol = Array.isArray(move) ? move[1] : move.to[1];
              tempBoard[moveToRow][moveToCol] = tempBoard[row][col];
              tempBoard[row][col] = null;
              return !ChessLogic.isKingInCheck(tempBoard, true);
            },
          ),
        );
        setPlayerStats((prev) => ({ ...prev, lastMoveTime: Date.now() }));
      }
    }
  };

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  useEffect(() => {
    let interval;
    if (gameStarted && !gameOver) {
      // Timer NEVER stops - world keeps moving regardless of AI thinking
      interval = setInterval(() => setTimer((prev) => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [gameStarted, gameOver]); // Removed aiThinking - timer never pauses

  useEffect(() => {
    if (currentPlayer === "black" && !gameOver && !aiThinking) {
      // AI responds QUICKLY - Maximum 2 seconds
      const aiTimeout = setTimeout(
        () => {
          executeAIMove();
        },
        Math.random() * 1500 + 500,
      ); // 0.5-2 seconds response time

      return () => clearTimeout(aiTimeout);
    }
  }, [currentPlayer, gameOver, executeAIMove, aiThinking]);

  return {
    board,
    selectedSquare,
    availableMoves,
    currentPlayer,
    timer,
    moves,
    gameOver,
    aiThinking,
    inCheck,
    playerStats,
    promotionData,
    initializeGame,
    handleSquarePress,
    handlePromotionChoice,
  };
};
