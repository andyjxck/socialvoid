import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  PanResponder,
  Animated,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

const { width: screenWidth } = Dimensions.get("window");

// Tetris-like pieces
const PIECE_SHAPES = [
  [[1]],
  [[1, 1]],
  [[1], [1]],
  [[1, 1, 1]],
  [[1], [1], [1]],
  [
    [1, 0],
    [1, 1],
  ],
  [
    [0, 1],
    [1, 1],
  ],
  [
    [1, 1],
    [1, 0],
  ],
  [
    [1, 1],
    [0, 1],
  ],
  [
    [1, 1, 1],
    [0, 1, 0],
  ],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
  [
    [1, 1, 1],
    [1, 0, 0],
  ],
  [
    [1, 1, 1],
    [0, 0, 1],
  ],
];

const BOARD_SIZE = 8;
const BOARD_CELL_SIZE = (screenWidth - 60) / BOARD_SIZE;
const PIECE_CELL_SIZE = 25;

export default function BlockBlastGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  // Get player ID from AsyncStorage
  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const savedPlayerId = await AsyncStorage.getItem(
          "puzzle_hub_player_id"
        );
        if (savedPlayerId) {
          setCurrentPlayerId(parseInt(savedPlayerId));
        } else {
          setCurrentPlayerId(1);
        }
      } catch (error) {
        console.error("Failed to load player ID:", error);
        setCurrentPlayerId(1);
      }
    };
    loadPlayerId();
  }, []);

  useEffect(() => {
  let active = true;

  const setupGame = async () => {
    if (!currentPlayerId) return;
    const id = await getGameId(GAME_TYPES.BLOCK_BLAST);
    if (active && id && currentPlayerId) {
      setGameId(id);
      await gameTracker.startGame(id, currentPlayerId);
      console.log("🎮 Block Blast tracking started:", id);
    }
  };

  setupGame();

  // ✅ use gameId from state, not a local var
  return () => {
    active = false;
    if (gameId) {
      gameTracker.endGame(gameId, 0);
    }
  };
}, [currentPlayerId, gameId]);


  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Game state
  const [board, setBoard] = useState([]);
  const [score, setScore] = useState(0);
  const [availablePieces, setAvailablePieces] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [draggedPiece, setDraggedPiece] = useState(null);
  const [dragPosition] = useState(new Animated.ValueXY());
  const [boardRef, setBoardRef] = useState(null);
  const [hoverPosition, setHoverPosition] = useState(null);

  // Helpers
  const createEmptyBoard = () =>
    Array(BOARD_SIZE)
      .fill(null)
      .map(() => Array(BOARD_SIZE).fill(0));

  const createPreFilledBoard = () => {
    const b = createEmptyBoard();
    const totalCells = BOARD_SIZE * BOARD_SIZE;
    const targetFilled = Math.floor(totalCells * 0.4);
    const palette = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#96CEB4",
      "#FFEAA7",
      "#DDA0DD",
    ];
    let filled = 0;

    const positions = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) positions.push({ row, col });
    }
    positions.sort(() => Math.random() - 0.5);

    for (const { row, col } of positions) {
      if (filled >= targetFilled) break;
      const wouldCompleteRow =
        b[row].filter((c) => c !== 0).length === BOARD_SIZE - 1;
      const wouldCompleteCol =
        b.map((r) => r[col]).filter((c) => c !== 0).length === BOARD_SIZE - 1;
      if (wouldCompleteRow || wouldCompleteCol) continue;

      const hasNeighbor =
        (row > 0 && b[row - 1][col] !== 0) ||
        (row < BOARD_SIZE - 1 && b[row + 1][col] !== 0) ||
        (col > 0 && b[row][col - 1] !== 0) ||
        (col < BOARD_SIZE - 1 && b[row][col + 1] !== 0);

      const shouldPlace = hasNeighbor
        ? Math.random() < 0.3
        : Math.random() < 0.7;
      if (shouldPlace) {
        b[row][col] = palette[Math.floor(Math.random() * palette.length)];
        filled++;
      }
    }
    return b;
  };

  const generateRandomPiece = () => {
    const shape = PIECE_SHAPES[Math.floor(Math.random() * PIECE_SHAPES.length)];
    const palette = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#96CEB4",
      "#FFEAA7",
      "#DDA0DD",
      "#98FB98",
    ];
    return {
      shape,
      color: palette[Math.floor(Math.random() * palette.length)],
      id: Math.random().toString(36).slice(2, 11),
    };
  };

  const generateNewPieces = () => [
    generateRandomPiece(),
    generateRandomPiece(),
    generateRandomPiece(),
  ];

  const canPlacePiece = (b, piece, startRow, startCol) => {
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (!piece.shape[r][c]) continue;
        const rr = startRow + r;
        const cc = startCol + c;
        if (
          rr < 0 ||
          rr >= BOARD_SIZE ||
          cc < 0 ||
          cc >= BOARD_SIZE ||
          b[rr][cc]
        )
          return false;
      }
    }
    return true;
  };

  const placePiece = (b, piece, startRow, startCol) => {
    const nb = b.map((row) => [...row]);
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (piece.shape[r][c]) nb[startRow + r][startCol + c] = piece.color;
      }
    }
    return nb;
  };

  const clearLines = (b) => {
    let nb = b.map((row) => [...row]);
    let cleared = 0;

    // rows
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (nb[r].every((cell) => cell !== 0)) {
        nb[r] = Array(BOARD_SIZE).fill(0);
        cleared++;
      }
    }
    // cols
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (nb.every((row) => row[c] !== 0)) {
        for (let r = 0; r < BOARD_SIZE; r++) nb[r][c] = 0;
        cleared++;
      }
    }
    return { board: nb, clearedLines: cleared };
  };

  const canPlaceAnyPiece = (b, pieces) => {
    for (const p of pieces) {
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (canPlacePiece(b, p, r, c)) return true;
        }
      }
    }
    return false;
  };

  // Initialize game (also restarts session so "Play Again" counts)
  const initializeGame = useCallback(() => {
    const nb = createPreFilledBoard();
    const np = generateNewPieces();

    setBoard(nb);
    setAvailablePieces(np);
    setScore(0);
    setGameOver(false);
    setDraggedPiece(null);
    setHoverPosition(null);
  }, []);

  const handlePiecePlacement = (piece, boardPosition) => {
    const { row, col } = boardPosition;
    if (!canPlacePiece(board, piece, row, col)) return false;

    let nb = placePiece(board, piece, row, col);
    const { board: clearedBoard, clearedLines } = clearLines(nb);

    const pieceScore = piece.shape.flat().filter((x) => x).length * 10;
    const lineScore = clearedLines * 100;
    const newScore = score + pieceScore + lineScore;

    const remaining = availablePieces.filter((p) => p.id !== piece.id);
    const finalPieces =
      remaining.length === 0 ? generateNewPieces() : remaining;

    setBoard(clearedBoard);
    setScore(newScore);
    setAvailablePieces(finalPieces);

    // Game over?
    if (!canPlaceAnyPiece(clearedBoard, finalPieces)) {
      setGameOver(true);

      // End game tracking with final score
      if (gameId) {
        gameTracker.endGame(gameId, newScore);
      }
    }

    if (clearedLines > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    return true;
  };

  const createPanResponder = (piece) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setDraggedPiece(piece);
        setHoverPosition(null);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (evt, gestureState) => {
        dragPosition.setValue({ x: gestureState.dx, y: gestureState.dy });
        if (boardRef) {
          boardRef.measure((x, y, w, h, pageX, pageY) => {
            const dropX = evt.nativeEvent.pageX - pageX;
            const dropY = evt.nativeEvent.pageY - pageY;
            if (dropX >= 0 && dropX <= w && dropY >= 0 && dropY <= h) {
              const col = Math.floor(dropX / BOARD_CELL_SIZE);
              const row = Math.floor(dropY / BOARD_CELL_SIZE);
              if (
                row >= 0 &&
                row < BOARD_SIZE &&
                col >= 0 &&
                col < BOARD_SIZE
              ) {
                const canPlace = canPlacePiece(board, piece, row, col);
                setHoverPosition({ row, col, canPlace });
              } else {
                setHoverPosition(null);
              }
            } else {
              setHoverPosition(null);
            }
          });
        }
      },
      onPanResponderRelease: (evt) => {
        if (boardRef) {
          boardRef.measure((x, y, w, h, pageX, pageY) => {
            const dropX = evt.nativeEvent.pageX - pageX;
            const dropY = evt.nativeEvent.pageY - pageY;
            if (dropX >= 0 && dropX <= w && dropY >= 0 && dropY <= h) {
              const col = Math.floor(dropX / BOARD_CELL_SIZE);
              const row = Math.floor(dropY / BOARD_CELL_SIZE);
              handlePiecePlacement(piece, { row, col });
            }
          });
        }
        setDraggedPiece(null);
        setHoverPosition(null);
        dragPosition.setValue({ x: 0, y: 0 });
      },
    });

  const renderPiece = (piece, isPreview = false) => {
    const cellSize = isPreview ? PIECE_CELL_SIZE : PIECE_CELL_SIZE;
    return (
      <View>
        {piece.shape.map((r, ri) => (
          <View key={ri} style={{ flexDirection: "row" }}>
            {r.map((cell, ci) => (
              <View
                key={`${ri}-${ci}`}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: cell ? piece.color : "transparent",
                  borderRadius: cell ? 4 : 0,
                  margin: 1,
                }}
              />
            ))}
          </View>
        ))}
      </View>
    );
  };

  // First board & pieces
  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />

      {/* Night sky background */}
      <NightSkyBackground />

      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 20,
          marginBottom: 20,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              padding: 8,
              borderRadius: 12,
              backgroundColor: colors.glassSecondary,
            }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text
            style={{
              fontFamily: "Inter_700Bold",
              fontSize: 20,
              color: colors.text,
            }}
          >
            Block Blast
          </Text>

          <TouchableOpacity
            onPress={initializeGame}
            style={{
              padding: 8,
              borderRadius: 12,
              backgroundColor: colors.glassSecondary,
            }}
          >
            <RotateCcw size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Score */}
        <View style={{ borderRadius: 16, overflow: "hidden" }}>
          <BlurView
            intensity={isDark ? 60 : 80}
            tint={isDark ? "dark" : "light"}
            style={{
              backgroundColor: isDark
                ? "rgba(31, 41, 55, 0.7)"
                : "rgba(255, 255, 255, 0.7)",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              padding: 16,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <View style={{ alignItems: "center" }}>
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 12,
                    color: colors.textSecondary,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 4,
                  }}
                >
                  Score
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 24,
                    color: colors.gameAccent1,
                  }}
                >
                  {score.toLocaleString()}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Game board */}
      <View
        style={{
          flex: 1,
          paddingHorizontal: 20,
          justifyContent: "space-between",
        }}
      >
        <View
          ref={setBoardRef}
          style={{
            width: BOARD_SIZE * BOARD_CELL_SIZE,
            height: BOARD_SIZE * BOARD_CELL_SIZE,
            backgroundColor: colors.glassSecondary,
            borderRadius: 12,
            padding: 4,
            alignSelf: "center",
          }}
        >
          {board.map((row, rowIndex) => (
            <View key={rowIndex} style={{ flexDirection: "row", flex: 1 }}>
              {row.map((cell, colIndex) => {
                let isHighlighted = false;
                let highlightColor = null;

                if (hoverPosition && draggedPiece) {
                  const {
                    row: hoverRow,
                    col: hoverCol,
                    canPlace,
                  } = hoverPosition;
                  for (let r = 0; r < draggedPiece.shape.length; r++) {
                    for (let c = 0; c < draggedPiece.shape[r].length; c++) {
                      if (!draggedPiece.shape[r][c]) continue;
                      const pr = hoverRow + r;
                      const pc = hoverCol + c;
                      if (pr === rowIndex && pc === colIndex) {
                        isHighlighted = true;
                        highlightColor = canPlace
                          ? draggedPiece.color + "80"
                          : "#FF4444AA";
                        break;
                      }
                    }
                    if (isHighlighted) break;
                  }
                }

                return (
                  <View
                    key={`${rowIndex}-${colIndex}`}
                    style={{
                      flex: 1,
                      backgroundColor: isHighlighted
                        ? highlightColor
                        : cell || colors.border,
                      justifyContent: "center",
                      alignItems: "center",
                      borderWidth: isHighlighted ? 2 : 0.5,
                      borderColor: isHighlighted
                        ? hoverPosition?.canPlace
                          ? draggedPiece?.color
                          : "#FF4444"
                        : colors.overlay,
                      margin: 1,
                      borderRadius: 2,
                    }}
                  />
                );
              })}
            </View>
          ))}
        </View>

        {/* Available pieces */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-around",
            alignItems: "center",
            paddingBottom: insets.bottom + 40,
            paddingTop: 20,
          }}
        >
          {availablePieces.map((piece) => (
            <Animated.View
              key={piece.id}
              style={[
                {
                  transform:
                    draggedPiece?.id === piece.id
                      ? [
                          { translateX: dragPosition.x },
                          { translateY: dragPosition.y },
                        ]
                      : [],
                  opacity: draggedPiece?.id === piece.id ? 0.8 : 1,
                  padding: 12,
                  backgroundColor: colors.glassSecondary,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: colors.border,
                },
              ]}
              {...createPanResponder(piece).panHandlers}
            >
              {renderPiece(piece, true)}
            </Animated.View>
          ))}
        </View>

        {/* Game over overlay */}
        {gameOver && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.7)",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <View style={{ borderRadius: 20, overflow: "hidden", margin: 20 }}>
              <BlurView
                intensity={isDark ? 80 : 100}
                tint={isDark ? "dark" : "light"}
                style={{
                  backgroundColor: isDark
                    ? "rgba(31, 41, 55, 0.9)"
                    : "rgba(255, 255, 255, 0.9)",
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 20,
                  padding: 32,
                  alignItems: "center",
                }}
              >
                <Trophy
                  size={48}
                  color={colors.gameAccent1}
                  style={{ marginBottom: 16 }}
                />
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 24,
                    color: colors.text,
                    textAlign: "center",
                    marginBottom: 8,
                  }}
                >
                  Game Over
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 18,
                    color: colors.gameAccent1,
                    marginBottom: 20,
                  }}
                >
                  Score: {score.toLocaleString()}
                </Text>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    onPress={initializeGame}
                    style={{
                      backgroundColor: colors.secondaryButton,
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderRadius: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 14,
                        color: colors.secondaryButtonText,
                      }}
                    >
                      Play Again
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => router.back()}
                    style={{
                      backgroundColor: colors.primaryButton,
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderRadius: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 14,
                        color: colors.primaryButtonText,
                      }}
                    >
                      Back to Hub
                    </Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
