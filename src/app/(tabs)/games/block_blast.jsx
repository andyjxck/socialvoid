// src/app/(tabs)/games/block_blast.jsx  (REPLACE ENTIRE FILE)
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  PanResponder,
  Animated,
  BackHandler,
  Modal,
  ScrollView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";
import AchievementsSection from "../../../components/AchievementsSection";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useFocusEffect } from "@react-navigation/native";

const { width: screenWidth } = Dimensions.get("window");
const BOARD_SIZE = 8;
const BOARD_CELL_SIZE = (screenWidth - 60) / BOARD_SIZE;
const PIECE_CELL_SIZE = 25;

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
  const [currentPlayerId, setCurrentPlayerId] = useState(null);

  // session management
  const gameIdRef = useRef(null);
  const scoreRef = useRef(0);
  const focusedRef = useRef(false);

  // achievements modal
  const [showAchievements, setShowAchievements] = useState(false);

  // fonts
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // game state
  const [board, setBoard] = useState([]);
  const [score, setScore] = useState(0);
  const [availablePieces, setAvailablePieces] = useState([]);
  const [gameOver, setGameOver] = useState(false);
  const [draggedPiece, setDraggedPiece] = useState(null);
  const [dragPosition] = useState(new Animated.ValueXY());
  const [boardRef, setBoardRef] = useState(null);
  const [hoverPosition, setHoverPosition] = useState(null);

  // per-run signals to feed achievements
  const totalLinesClearedRef = useRef(0);
  const maxLinesSingleClearRef = useRef(0);
  const peakScoreRef = useRef(0);

  // keep scoreRef in sync
  useEffect(() => {
    scoreRef.current = score;
    if (score > peakScoreRef.current) {
      peakScoreRef.current = score;
      if (gameIdRef.current) {
        gameTracker.updateGameData(gameIdRef.current, { peak_score: peakScoreRef.current });
      }
    }
  }, [score]);

  // load player id
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        setCurrentPlayerId(saved ? parseInt(saved, 10) : 1);
      } catch {
        setCurrentPlayerId(1);
      }
    })();
  }, []);

  // helpers
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

  // init/reset game state
  const initializeGame = useCallback(() => {
    setBoard(createPreFilledBoard());
    setAvailablePieces(generateNewPieces());
    setScore(0);
    setGameOver(false);
    setDraggedPiece(null);
    setHoverPosition(null);
    dragPosition.setValue({ x: 0, y: 0 });

    // reset per-run signals
    totalLinesClearedRef.current = 0;
    maxLinesSingleClearRef.current = 0;
    peakScoreRef.current = 0;
  }, [dragPosition]);

  // session control
  const startSession = useCallback(async () => {
    if (!currentPlayerId || focusedRef.current) return;
    const id = await getGameId(GAME_TYPES.BLOCK_BLAST);
    gameIdRef.current = id;
    focusedRef.current = true;
    if (id) await gameTracker.startGame(id, currentPlayerId);
  }, [currentPlayerId]);

  const endSession = useCallback(async () => {
    if (!gameIdRef.current) return;
    try {
      // push last-known signals before ending (in case the last placement didn’t write)
      gameTracker.updateGameData(gameIdRef.current, {
        total_lines_cleared: totalLinesClearedRef.current,
        max_lines_single_clear: maxLinesSingleClearRef.current,
        peak_score: peakScoreRef.current,
      });
      await gameTracker.endGame(gameIdRef.current, scoreRef.current || 0);
    } catch {}
    gameIdRef.current = null;
    focusedRef.current = false;
  }, []);

  // focus/blur lifecycle: start fresh on focus, end on blur
  useFocusEffect(
    useCallback(() => {
      initializeGame();
      startSession();
      const backSub = BackHandler.addEventListener("hardwareBackPress", () => {
        endSession();
        router.back();
        return true;
      });
      return () => {
        backSub.remove();
        endSession();
      };
    }, [initializeGame, startSession, endSession])
  );

  // game logic: placing pieces
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

    // ⬇️ Update per-run signals + push to session gameData for achievements
    if (clearedLines > 0) {
      totalLinesClearedRef.current += clearedLines;
      if (clearedLines > maxLinesSingleClearRef.current) {
        maxLinesSingleClearRef.current = clearedLines;
      }
    }
    if (gameIdRef.current) {
      gameTracker.updateGameData(gameIdRef.current, {
        total_lines_cleared: totalLinesClearedRef.current,
        max_lines_single_clear: maxLinesSingleClearRef.current,
        peak_score: Math.max(peakScoreRef.current, newScore),
      });
    }

    if (!canPlaceAnyPiece(cleared, nextPieces)) {
      setGameOver(true);
      endSession(); // submit final score and close session (checkAchievements runs on end)
    }

    if (clearedLines > 0)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    return true;
  };

  // dragging
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

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex:1 }}>
      <StatusBar style="light" />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 20 }}>
        <View style={{ flexDirection:"row", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <TouchableOpacity
            onPress={() => { endSession(); router.back(); }}
            style={{ padding:8, borderRadius:12, backgroundColor: "rgba(255,255,255,0.08)" }}
          >
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>

          <Text style={{ fontFamily:"Inter_700Bold", fontSize:20, color:"#fff" }}>Block Place</Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* Achievements button */}
            <TouchableOpacity
              onPress={() => {
                setShowAchievements(true);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              }}
              style={{ padding:8, borderRadius:12, backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <Trophy size={22} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { endSession(); initializeGame(); startSession(); }}
              style={{ padding:8, borderRadius:12, backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <RotateCcw size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Score */}
        <BlurView intensity={80} tint="dark"
          style={{
            backgroundColor: "rgba(0,0,0,0.35)",
            borderWidth:1, borderColor:"rgba(255,255,255,0.12)", borderRadius:16, padding:16
          }}>
          <View style={{ alignItems:"center" }}>
            <Text style={{ fontFamily:"Inter_500Medium", fontSize:12, color:"rgba(255,255,255,0.8)",
                           textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>
              Score
            </Text>
            <Text style={{ fontFamily:"Inter_700Bold", fontSize:24, color:"#9AE6B4" }}>
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
            backgroundColor: "rgba(255,255,255,0.08)",
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
                    backgroundColor: highlight ? hlColor : cell || "rgba(255,255,255,0.12)",
                    justifyContent:"center", alignItems:"center",
                    borderWidth: highlight ? 2 : 0.5,
                    borderColor: highlight
                      ? (hoverPosition?.canPlace ? draggedPiece?.color : "#FF4444")
                      : "rgba(255,255,255,0.15)",
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
                opacity: draggedPiece?.id === piece.id ? 0.4 : 1,
                padding:12,
                backgroundColor: "rgba(255,255,255,0.08)",
                borderRadius:12,
                borderWidth:2,
                borderColor: "rgba(255,255,255,0.15)"
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

        {/* Game Over */}
        {gameOver && (
          <View style={{
            position:"absolute", top:0, left:0, right:0, bottom:0,
            backgroundColor:"rgba(0,0,0,0.7)",
            justifyContent:"center", alignItems:"center"
          }}>
            <BlurView intensity={100} tint="dark"
              style={{
                backgroundColor: "rgba(0,0,0,0.85)",
                borderWidth:1, borderColor:"rgba(255,255,255,0.15)",
                borderRadius:20, padding:32, alignItems:"center", margin:20
              }}>
              <Trophy size={48} color="#9AE6B4" style={{ marginBottom:16 }} />
              <Text style={{ fontFamily:"Inter_700Bold", fontSize:24, color:"#fff", marginBottom:8 }}>
                Game Over
              </Text>
              <Text style={{ fontFamily:"Inter_600SemiBold", fontSize:18, color:"#9AE6B4", marginBottom:20 }}>
                Score: {score.toLocaleString()}
              </Text>

              <View style={{ flexDirection:"row" }}>
                <TouchableOpacity
                  onPress={() => { endSession(); initializeGame(); startSession(); }}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.12)",
                    paddingHorizontal:20, paddingVertical:12, borderRadius:12, marginRight:12
                  }}>
                  <Text style={{ fontFamily:"Inter_600SemiBold", fontSize:14, color:"#fff" }}>
                    Play Again
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => { endSession(); router.back(); }}
                  style={{
                    backgroundColor: "#6366F1",
                    paddingHorizontal:20, paddingVertical:12, borderRadius:12
                  }}>
                  <Text style={{ fontFamily:"Inter_600SemiBold", fontSize:14, color:"#fff" }}>
                    Back to Hub
                  </Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        )}
      </View>

      {/* Achievements Modal */}
      <Modal
        visible={showAchievements}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAchievements(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }}>
          <View style={{ marginTop: insets.top + 12, marginBottom: insets.bottom + 12, flex: 1, paddingHorizontal: 16 }}>
            <BlurView
              intensity={90}
              tint="dark"
              style={{
                flex: 1,
                borderRadius: 16,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                backgroundColor: "rgba(0,0,0,0.85)",
              }}
            >
              {/* Header row */}
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: "rgba(255,255,255,0.12)",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" }}>
                  Block Place Achievements
                </Text>
                <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "rgba(255,255,255,0.7)" }}>
                    Close
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Content */}
              <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>
                {currentPlayerId && gameIdRef.current ? (
                  <AchievementsSection
                    playerId={currentPlayerId}
                    gameId={gameIdRef.current}
                    autoRefreshMs={15000}
                    showSearchBar={true}
                    showFilters={true}
                  />
                ) : (
                  <View style={{ padding: 16 }}>
                    <Text style={{ color: "rgba(255,255,255,0.8)", fontFamily: "Inter_500Medium", textAlign: "center" }}>
                      Loading achievements…
                    </Text>
                  </View>
                )}
              </ScrollView>
            </BlurView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
