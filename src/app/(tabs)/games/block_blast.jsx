// src/app/(tabs)/games/block_blast.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  PanResponder,
  Animated,
  BackHandler,
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
const BOARD_SIZE = 8;
const BOARD_CELL_SIZE = (screenWidth - 60) / BOARD_SIZE;
const PIECE_CELL_SIZE = 25;

// Tetris-like pieces
const PIECE_SHAPES = [
  [[1]], [[1, 1]], [[1],[1]], [[1,1,1]], [[1],[1],[1]],
  [[1,0],[1,1]], [[0,1],[1,1]], [[1,1],[1,0]], [[1,1],[0,1]],
  [[1,1,1],[0,1,0]], [[1,1],[1,1]],
  [[1,1,0],[0,1,1]], [[0,1,1],[1,1,0]],
  [[1,0,0],[1,1,1]], [[0,0,1],[1,1,1]],
  [[1,1,1],[1,0,0]], [[1,1,1],[0,0,1]],
];

export default function BlockBlastGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);

  /* ── Load player ID ─────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        setCurrentPlayerId(saved ? parseInt(saved) : 1);
      } catch {
        setCurrentPlayerId(1);
      }
    })();
  }, []);

  /* ── Start / end persistent tracking ────────────────────── */
  useEffect(() => {
    if (!currentPlayerId) return;
    let active = true;

    const startSession = async () => {
      const id = await getGameId(GAME_TYPES.BLOCK_BLAST);
      if (active && id) {
        setGameId(id);
        await gameTracker.startGame(id, currentPlayerId);
        console.log("🎮 Block Blast session started:", id);
      }
    };
    startSession();

    // handle Android/iOS hardware back
    const backSub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (gameId) gameTracker.endGame(gameId, score);
      router.back();
      return true;
    });

    return () => {
      active = false;
      backSub.remove();
      if (gameId) gameTracker.endGame(gameId, score);
    };
  }, [currentPlayerId, gameId]);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  /* ── Game state ─────────────────────────────────────────── */
  const [board, setBoard] = useState([]);
  const [score, setScore] = useState(0);
  const [availablePieces, setAvailablePieces] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [draggedPiece, setDraggedPiece] = useState(null);
  const [dragPosition] = useState(new Animated.ValueXY());
  const [boardRef, setBoardRef] = useState(null);
  const [hoverPosition, setHoverPosition] = useState(null);

  /* Helpers ------------------------------------------------- */
  const createEmptyBoard = () =>
    Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));

  const createPreFilledBoard = () => {
    const b = createEmptyBoard();
    const total = BOARD_SIZE * BOARD_SIZE;
    const target = Math.floor(total * 0.4);
    const palette = ["#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD"];
    let filled = 0;
    const cells = [];
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++) cells.push({ r, c });
    cells.sort(() => Math.random() - 0.5);

    for (const { r, c } of cells) {
      if (filled >= target) break;
      const fullRow = b[r].filter(x => x).length === BOARD_SIZE - 1;
      const fullCol = b.map(row => row[c]).filter(x => x).length === BOARD_SIZE - 1;
      if (fullRow || fullCol) continue;
      const neighbor =
        (r>0&&b[r-1][c])||(r<BOARD_SIZE-1&&b[r+1][c])||
        (c>0&&b[r][c-1])||(c<BOARD_SIZE-1&&b[r][c+1]);
      const place = neighbor ? Math.random()<0.3 : Math.random()<0.7;
      if (place) { b[r][c] = palette[Math.floor(Math.random()*palette.length)]; filled++; }
    }
    return b;
  };

  const generatePiece = () => {
    const shape = PIECE_SHAPES[Math.floor(Math.random() * PIECE_SHAPES.length)];
    const palette = ["#FF6B6B","#4ECDC4","#45B7D1","#96CEB4","#FFEAA7","#DDA0DD","#98FB98"];
    return { shape, color: palette[Math.floor(Math.random()*palette.length)], id: Math.random().toString(36).slice(2) };
  };
  const generateNewPieces = () => [generatePiece(), generatePiece(), generatePiece()];

  const canPlacePiece = (b,p,sr,sc) => {
    for (let r=0;r<p.shape.length;r++)
      for (let c=0;c<p.shape[r].length;c++)
        if (p.shape[r][c]) {
          const rr=sr+r, cc=sc+c;
          if (rr<0||rr>=BOARD_SIZE||cc<0||cc>=BOARD_SIZE||b[rr][cc]) return false;
        }
    return true;
  };

  const placePiece = (b,p,sr,sc) => {
    const nb = b.map(row => [...row]);
    p.shape.forEach((r,i) =>
      r.forEach((cell,j) => { if(cell) nb[sr+i][sc+j] = p.color; })
    );
    return nb;
  };

  const clearLines = (b) => {
    let nb = b.map(row => [...row]);
    let cleared = 0;
    for (let r=0;r<BOARD_SIZE;r++)
      if (nb[r].every(x=>x)){ nb[r]=Array(BOARD_SIZE).fill(0); cleared++; }
    for (let c=0;c<BOARD_SIZE;c++)
      if (nb.every(row=>row[c])) { for (let r=0;r<BOARD_SIZE;r++) nb[r][c]=0; cleared++; }
    return { board: nb, clearedLines: cleared };
  };

  const canPlaceAnyPiece = (b,pieces) =>
    pieces.some(p =>
      b.some((row,r) => row.some((_,c) => canPlacePiece(b,p,r,c)))
    );

  /* Initialize / restart game ------------------------------ */
  const initializeGame = useCallback(() => {
    setBoard(createPreFilledBoard());
    setAvailablePieces(generateNewPieces());
    setScore(0);
    setGameOver(false);
    setDraggedPiece(null);
    setHoverPosition(null);
  }, []);

  /* Piece placement --------------------------------------- */
  const handlePiecePlacement = (piece, { row, col }) => {
    if (!canPlacePiece(board, piece, row, col)) return false;
    let nb = placePiece(board, piece, row, col);
    const { board: cleared, clearedLines } = clearLines(nb);

    const pieceScore = piece.shape.flat().filter(Boolean).length * 10;
    const lineScore = clearedLines * 100;
    const newScore = score + pieceScore + lineScore;

    const remaining = availablePieces.filter(p => p.id !== piece.id);
    const nextPieces = remaining.length ? remaining : generateNewPieces();

    setBoard(cleared);
    setScore(newScore);
    setAvailablePieces(nextPieces);

    if (!canPlaceAnyPiece(cleared, nextPieces)) {
      setGameOver(true);
      if (gameId) gameTracker.endGame(gameId, newScore);   // ✅ high-score submit
    }

    if (clearedLines > 0)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    return true;
  };

  /* Drag handling ----------------------------------------- */
  const createPanResponder = (piece) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setDraggedPiece(piece);
        setHoverPosition(null);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (e,g) => {
        dragPosition.setValue({ x:g.dx, y:g.dy });
        if (boardRef) {
          boardRef.measure((x,y,w,h,px,py) => {
            const dx = e.nativeEvent.pageX - px;
            const dy = e.nativeEvent.pageY - py;
            if (dx>=0 && dx<=w && dy>=0 && dy<=h) {
              const c = Math.floor(dx/BOARD_CELL_SIZE);
              const r = Math.floor(dy/BOARD_CELL_SIZE);
              if (r>=0 && r<BOARD_SIZE && c>=0 && c<BOARD_SIZE)
                setHoverPosition({ row:r, col:c, canPlace: canPlacePiece(board,piece,r,c) });
              else setHoverPosition(null);
            } else setHoverPosition(null);
          });
        }
      },
      onPanResponderRelease: (e) => {
        if (boardRef) {
          boardRef.measure((x,y,w,h,px,py) => {
            const dx = e.nativeEvent.pageX - px;
            const dy = e.nativeEvent.pageY - py;
            if (dx>=0 && dx<=w && dy>=0 && dy<=h) {
              const c = Math.floor(dx/BOARD_CELL_SIZE);
              const r = Math.floor(dy/BOARD_CELL_SIZE);
              handlePiecePlacement(piece,{row:r,col:c});
            }
          });
        }
        setDraggedPiece(null);
        setHoverPosition(null);
        dragPosition.setValue({ x:0, y:0 });
      },
    });

  /* Initial board & pieces -------------------------------- */
  useEffect(() => { initializeGame(); }, [initializeGame]);
  if (!fontsLoaded) return null;

  /* UI ---------------------------------------------------- */
  return (
    <View style={{ flex:1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 20 }}>
        <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <TouchableOpacity
            onPress={() => { if (gameId) gameTracker.endGame(gameId, score); router.back(); }}
            style={{ padding:8, borderRadius:12, backgroundColor: colors.glassSecondary }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ fontFamily:"Inter_700Bold", fontSize:20, color: colors.text }}>Block Blast</Text>

          <TouchableOpacity
            onPress={initializeGame}
            style={{ padding:8, borderRadius:12, backgroundColor: colors.glassSecondary }}
          >
            <RotateCcw size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Score Display */}
        <BlurView intensity={isDark ? 60 : 80} tint={isDark ? "dark" : "light"}
          style={{
            backgroundColor: isDark ? "rgba(31,41,55,0.7)" : "rgba(255,255,255,0.7)",
            borderWidth:1, borderColor:colors.border, borderRadius:16, padding:16
          }}>
          <View style={{ alignItems:"center" }}>
            <Text style={{ fontFamily:"Inter_500Medium", fontSize:12, color:colors.textSecondary,
                           textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>
              Score
            </Text>
            <Text style={{ fontFamily:"Inter_700Bold", fontSize:24, color: colors.gameAccent1 }}>
              {score.toLocaleString()}
            </Text>
          </View>
        </BlurView>
      </View>

      {/* Board */}
      <View style={{ flex:1, paddingHorizontal:20, justifyContent:"space-between" }}>
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
          {board.map((row,ri) => (
            <View key={ri} style={{ flexDirection:"row", flex:1 }}>
              {row.map((cell,ci) => {
                let highlight=false, hlColor=null;
                if (hoverPosition && draggedPiece) {
                  const {row:hr,col:hc,canPlace} = hoverPosition;
                  for (let r=0;r<draggedPiece.shape.length;r++)
                    for (let c=0;c<draggedPiece.shape[r].length;c++)
                      if (draggedPiece.shape[r][c] &&
                          hr+r===ri && hc+c===ci) {
                        highlight=true;
                        hlColor = canPlace ? draggedPiece.color+"80" : "#FF4444AA";
                      }
                }
                return (
                  <View key={ci} style={{
                    flex:1,
                    backgroundColor: highlight ? hlColor : cell || colors.border,
                    justifyContent:"center", alignItems:"center",
                    borderWidth: highlight ? 2 : 0.5,
                    borderColor: highlight
                      ? (hoverPosition?.canPlace ? draggedPiece?.color : "#FF4444")
                      : colors.overlay,
                    margin:1, borderRadius:2
                  }}/>
                );
              })}
            </View>
          ))}
        </View>

        {/* Available pieces */}
        <View style={{
          flexDirection:"row",
          justifyContent:"space-around",
          alignItems:"center",
          paddingBottom: insets.bottom + 40,
          paddingTop: 20
        }}>
          {availablePieces.map(piece => (
            <Animated.View
              key={piece.id}
              style={{
                transform: draggedPiece?.id === piece.id
                  ? [{ translateX: dragPosition.x },{ translateY: dragPosition.y }]
                  : [],
                opacity: draggedPiece?.id === piece.id ? 0.8 : 1,
                padding:12,
                backgroundColor: colors.glassSecondary,
                borderRadius:12,
                borderWidth:2,
                borderColor: colors.border
              }}
              {...createPanResponder(piece).panHandlers}
            >
              {piece.shape.map((r,ri) => (
                <View key={ri} style={{ flexDirection:"row" }}>
                  {r.map((cell,ci) => (
                    <View key={ci} style={{
                      width: PIECE_CELL_SIZE,
                      height: PIECE_CELL_SIZE,
                      backgroundColor: cell ? piece.color : "transparent",
                      borderRadius: cell ? 4 : 0,
                      margin: 1
                    }}/>
                  ))}
                </View>
              ))}
            </Animated.View>
          ))}
        </View>

        {/* Game Over Overlay */}
        {gameOver && (
          <View style={{
            position:"absolute", top:0, left:0, right:0, bottom:0,
            backgroundColor:"rgba(0,0,0,0.7)",
            justifyContent:"center", alignItems:"center"
          }}>
            <BlurView intensity={isDark ? 80 : 100} tint={isDark ? "dark" : "light"}
              style={{
                backgroundColor: isDark ? "rgba(31,41,55,0.9)" : "rgba(255,255,255,0.9)",
                borderWidth:1, borderColor:colors.border,
                borderRadius:20, padding:32, alignItems:"center", margin:20
              }}>
              <Trophy size={48} color={colors.gameAccent1} style={{ marginBottom:16 }} />
              <Text style={{ fontFamily:"Inter_700Bold", fontSize:24, color: colors.text, marginBottom:8 }}>
                Game Over
              </Text>
              <Text style={{ fontFamily:"Inter_600SemiBold", fontSize:18, color: colors.gameAccent1, marginBottom:20 }}>
                Score: {score.toLocaleString()}
              </Text>

              <View style={{ flexDirection:"row", gap:12 }}>
                <TouchableOpacity
                  onPress={initializeGame}
                  style={{
                    backgroundColor: colors.secondaryButton,
                    paddingHorizontal:20, paddingVertical:12, borderRadius:12
                  }}>
                  <Text style={{ fontFamily:"Inter_600SemiBold", fontSize:14, color: colors.secondaryButtonText }}>
                    Play Again
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => { if (gameId) gameTracker.endGame(gameId, score); router.back(); }}
                  style={{
                    backgroundColor: colors.primaryButton,
                    paddingHorizontal:20, paddingVertical:12, borderRadius:12
                  }}>
                  <Text style={{ fontFamily:"Inter_600SemiBold", fontSize:14, color: colors.primaryButtonText }}>
                    Back to Hub
                  </Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        )}
      </View>
    </View>
  );
}
