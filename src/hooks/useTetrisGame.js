import { useState, useEffect, useCallback, useRef } from "react";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../utils/gameUtils";
import { PIECES, BOARD_WIDTH, BOARD_HEIGHT } from "../utils/tetris/constants";
import {
  createEmptyBoard,
  getRandomPieceType,
  createPiece,
  isValidPosition,
  lockPiece,
  clearLines,
  calculateScore,
} from "../utils/tetris/logic";

export const useTetrisGame = () => {
  const [board, setBoard] = useState(createEmptyBoard());
  const [currentPiece, setCurrentPiece] = useState(null);
  const [currentPosition, setCurrentPosition] = useState({ x: 0, y: 0 });
  const [currentRotation, setCurrentRotation] = useState(0);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [nextPiece, setNextPiece] = useState(null);

  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);
  const gameLoopRef = useRef();
  const dropTimeRef = useRef(300);

  useEffect(() => {
    const loadPlayerId = async () => {
      const savedPlayerId = await AsyncStorage.getItem("puzzle_hub_player_id");
      setCurrentPlayerId(savedPlayerId ? parseInt(savedPlayerId) : 1);
    };
    loadPlayerId();
  }, []);

  useEffect(() => {
    let mounted = true;
    const setupGameTracking = async () => {
      if (!currentPlayerId) return;
      const id = await getGameId(GAME_TYPES.TETRIS);
      if (id && mounted) {
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
      }
    };
    setupGameTracking();
    return () => {
      mounted = false;
    };
  }, [currentPlayerId]);

  const initializeGame = useCallback(() => {
    const emptyBoard = createEmptyBoard();
    const firstPieceType = getRandomPieceType();
    const firstPiece = createPiece(firstPieceType);
    const firstNextPiece = getRandomPieceType();

    setBoard(emptyBoard);
    setCurrentPiece(firstPiece);
    setCurrentPosition({ x: Math.floor(BOARD_WIDTH / 2) - 2, y: 0 });
    setCurrentRotation(0);
    setNextPiece(firstNextPiece);
    setScore(0);
    setLines(0);
    setGameOver(false);
    setPaused(false);
  }, []);

  const movePiece = useCallback(
    (direction) => {
      if (gameOver || paused || !currentPiece) return;

      let newPosition = { ...currentPosition };
      if (direction === "left") newPosition.x -= 1;
      if (direction === "right") newPosition.x += 1;
      if (direction === "down") newPosition.y += 1;

      if (isValidPosition(board, currentPiece, newPosition, currentRotation)) {
        setCurrentPosition(newPosition);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [board, currentPiece, currentPosition, currentRotation, gameOver, paused]
  );

  const rotatePiece = useCallback(() => {
    if (gameOver || paused || !currentPiece) return;
    const newRotation = (currentRotation + 1) % 4;
    if (isValidPosition(board, currentPiece, currentPosition, newRotation)) {
      setCurrentRotation(newRotation);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [board, currentPiece, currentPosition, currentRotation, gameOver, paused]);

  const dropPiece = useCallback(() => {
    if (gameOver || paused || !currentPiece) return;

    const newPosition = { ...currentPosition, y: currentPosition.y + 1 };

    if (isValidPosition(board, currentPiece, newPosition, currentRotation)) {
      setCurrentPosition(newPosition);
    } else {
      const newBoard = lockPiece(
        board,
        currentPiece,
        currentPosition,
        currentRotation
      );
      const { board: clearedBoard, linesCleared } = clearLines(newBoard);
      setBoard(clearedBoard);

      if (linesCleared > 0) {
        const points = calculateScore(linesCleared, Math.floor(lines / 10) + 1);
        setScore((prev) => prev + points);
        setLines((prev) => prev + linesCleared);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      const newPieceType = nextPiece;
      const newPiece = createPiece(newPieceType);
      const spawnPosition = { x: Math.floor(BOARD_WIDTH / 2) - 2, y: 0 };

      if (isValidPosition(clearedBoard, newPiece, spawnPosition, 0)) {
        setCurrentPiece(newPiece);
        setCurrentPosition(spawnPosition);
        setCurrentRotation(0);
        setNextPiece(getRandomPieceType());
      } else {
        setGameOver(true);
        const finalScore =
          score +
          (linesCleared > 0
            ? calculateScore(linesCleared, Math.floor(lines / 10) + 1)
            : 0);
        if (gameId) {
          gameTracker.endGame(gameId, finalScore);
        }
      }
    }
  }, [
    board,
    currentPiece,
    currentPosition,
    currentRotation,
    gameOver,
    paused,
    score,
    lines,
    nextPiece,
    gameId,
  ]);

  useEffect(() => {
    if (!gameOver && !paused && currentPiece) {
      dropTimeRef.current = Math.max(50, 300 - Math.floor(lines / 5) * 20);
      gameLoopRef.current = setInterval(() => {
        dropPiece();
      }, dropTimeRef.current);
      return () => clearInterval(gameLoopRef.current);
    }
  }, [dropPiece, gameOver, paused, lines, currentPiece]);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  const togglePause = () => {
    if (!gameOver) {
      setPaused(!paused);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const getDisplayBoard = () => {
    const displayBoard = board.map((row) => row.map((cell) => ({ ...cell })));
    if (currentPiece && !gameOver) {
      const shape = PIECES[currentPiece.type].shape[currentRotation];
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          if (shape[row][col]) {
            const boardRow = currentPosition.y + row;
            const boardCol = currentPosition.x + col;
            if (
              boardRow >= 0 &&
              boardRow < BOARD_HEIGHT &&
              boardCol >= 0 &&
              boardCol < BOARD_WIDTH
            ) {
              displayBoard[boardRow][boardCol] = {
                filled: true,
                color: currentPiece.color,
              };
            }
          }
        }
      }
    }
    return displayBoard;
  };

  return {
    board: getDisplayBoard(),
    score,
    lines,
    gameOver,
    paused,
    initializeGame,
    movePiece,
    rotatePiece,
    togglePause,
  };
};