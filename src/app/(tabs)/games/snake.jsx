// src/app/(tabs)/games/snake.jsx  (REPLACE ENTIRE FILE)
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions, Modal, BackHandler, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  PanGestureHandler,
  State,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";
import AchievementsSection from "../../../components/AchievementsSection";
import { useTheme } from "../../../utils/theme";
import { useIsFocused } from "@react-navigation/native";

const { width: screenWidth } = Dimensions.get("window");

// constants
const TICK_MS = 120;
const GRID = 20;
const PADDING = 60;

export default function SnakeGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const isFocused = useIsFocused();

  // tracking
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);
  const submittedRef = useRef(false);

  // achievements UI
  const [showAchievements, setShowAchievements] = useState(false);

  // game state
  const [gameStarted, setGameStarted] = useState(false);
  const [snake, setSnake] = useState([]);
  const [food, setFood] = useState(null);
  const [direction, setDirection] = useState("RIGHT");
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showOver, setShowOver] = useState(false);

  // refs
  const loopRef = useRef(null);
  const scoreRef = useRef(0);
  const directionRef = useRef("RIGHT");

  const cellSize = (screenWidth - PADDING) / GRID;

  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { directionRef.current = direction; }, [direction]);

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

  // resolve numeric game id
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!currentPlayerId) return;
      try {
        const id = await getGameId(GAME_TYPES.SNAKE);
        if (alive) setGameId(id);
      } catch {}
    })();
    return () => { alive = false; };
  }, [currentPlayerId]);

  // helpers
  const randomFood = useCallback((body) => {
    let f;
    do {
      f = {
        x: Math.floor(Math.random() * GRID),
        y: Math.floor(Math.random() * GRID),
      };
    } while (body.some((s) => s.x === f.x && s.y === f.y));
    return f;
  }, []);

  const clearLoop = useCallback(() => {
    if (loopRef.current) {
      clearInterval(loopRef.current);
      loopRef.current = null;
    }
  }, []);

  const resetUI = useCallback(() => {
    clearLoop();
    setGameStarted(false);
    setSnake([]);
    setFood(null);
    setDirection("RIGHT");
    setScore(0);
    setGameOver(false);
    setPaused(false);
    setShowOver(false);
  }, [clearLoop]);

  const initialize = useCallback(() => {
    // fresh state
    const start = [{ x: Math.floor(GRID / 2), y: Math.floor(GRID / 2) }];
    setSnake(start);
    setFood(randomFood(start));
    setDirection("RIGHT");
    directionRef.current = "RIGHT";
    setScore(0);
    setGameOver(false);
    setShowOver(false);
    setPaused(false);
    setGameStarted(true);
  }, [randomFood]);

  // central submit-end helper
  const endRunOnce = useCallback((reason) => {
    if (gameId && !submittedRef.current) {
      try { gameTracker.endGame(gameId, scoreRef.current || 0, { result: reason }); } catch {}
      submittedRef.current = true;
    }
  }, [gameId]);

  // restart (submit & fresh run)
  const handleRestart = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    clearLoop();
    endRunOnce("restart");
    submittedRef.current = false; // allow this new run to submit later
    initialize();
  }, [clearLoop, endRunOnce, initialize]);

  // pause when achievements modal opens
  useEffect(() => {
    if (showAchievements) {
      setPaused(true);
      clearLoop();
    }
  }, [showAchievements, clearLoop]);

  // focus/blur lifecycle: start new run on focus, end on blur
  useEffect(() => {
    if (!gameId || !currentPlayerId) return;

    if (isFocused) {
      // entering screen -> brand new run
      submittedRef.current = false;
      resetUI();
      initialize();
      (async () => { try { await gameTracker.startGame(gameId, currentPlayerId); } catch {} })();
    } else {
      // leaving screen -> end run + cleanup
      clearLoop();
      endRunOnce("blur");
      resetUI(); // ensures no stale board when you return
    }
  }, [isFocused, gameId, currentPlayerId, initialize, clearLoop, endRunOnce, resetUI]);

  // clean unmount
  useEffect(() => {
    return () => {
      clearLoop();
      endRunOnce("unmount");
    };
  }, [clearLoop, endRunOnce]);

  // hardware back -> end + go back
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      clearLoop();
      endRunOnce("back");
      resetUI();
      router.back();
      return true;
    });
    return () => sub.remove();
  }, [clearLoop, endRunOnce, resetUI]);

  // movement tick
  const tick = useCallback(() => {
    setSnake((cur) => {
      if (!cur.length) return cur;
      const head = { ...cur[0] };
      const dir = directionRef.current;

      if (dir === "UP") head.y -= 1;
      else if (dir === "DOWN") head.y += 1;
      else if (dir === "LEFT") head.x -= 1;
      else if (dir === "RIGHT") head.x += 1;

      // walls
      if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
        setGameOver(true);
        return cur;
      }
      // self
      if (cur.some((s) => s.x === head.x && s.y === head.y)) {
        setGameOver(true);
        return cur;
      }

      const next = [head, ...cur];

      if (food && head.x === food.x && head.y === food.y) {
        setScore((s) => s + 1);
        setFood(randomFood(next));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      } else {
        next.pop();
      }

      return next;
    });
  }, [food, randomFood]);

  // loop
  useEffect(() => {
    clearLoop();
    if (gameStarted && !gameOver && !paused) {
      loopRef.current = setInterval(tick, TICK_MS);
    }
    return clearLoop;
  }, [gameStarted, gameOver, paused, tick, clearLoop]);

  // on game over
  useEffect(() => {
    if (gameOver) {
      clearLoop();
      setShowOver(true);
      endRunOnce("lose");
    }
  }, [gameOver, clearLoop, endRunOnce]);

  // interactions
  const changeDirection = useCallback((dir) => {
    if (!gameStarted || gameOver) return;
    const opposite = { UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT" };
    if (opposite[directionRef.current] === dir) return;
    directionRef.current = dir;
    setDirection(dir);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [gameStarted, gameOver]);

  const togglePause = useCallback(() => {
    if (!gameStarted || gameOver) return;
    setPaused((p) => !p);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, [gameStarted, gameOver]);

  // header back
  const handleBack = useCallback(() => {
    clearLoop();
    endRunOnce("back");
    resetUI();
    router.back();
  }, [clearLoop, endRunOnce, resetUI]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <NightSkyBackground />

        {/* Header */}
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 20 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <TouchableOpacity
              onPress={handleBack}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <ArrowLeft size={24} color={colors.text} />
            </TouchableOpacity>

            <Text style={{ fontWeight: "700", fontSize: 20, color: colors.text }}>
              Snake
            </Text>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setShowAchievements(true)}
                style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
              >
                <Trophy size={22} color={colors.text} />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleRestart}
                style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
              >
                <RotateCcw size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Stats */}
          <View style={{ borderRadius: 16, overflow: "hidden" }}>
            <BlurView
              intensity={isDark ? 60 : 80}
              tint={isDark ? "dark" : "light"}
              style={{
                backgroundColor: isDark ? "rgba(31,41,55,0.7)" : "rgba(255,255,255,0.7)",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 16,
                padding: 16,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>
                    Score
                  </Text>
                  <Text style={{ fontSize: 20, fontWeight: "700", color: colors.gameAccent5 }}>{score}</Text>
                </View>

                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", marginBottom: 4 }}>
                    Length
                  </Text>
                  <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>{snake.length}</Text>
                </View>

                <TouchableOpacity
                  onPress={togglePause}
                  style={{
                    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12,
                    backgroundColor: colors.gameAccent5 + "20",
                    borderWidth: 1, borderColor: colors.gameAccent5
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.gameAccent5 }}>
                    {paused ? "PLAY" : "PAUSE"}
                  </Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </View>

        {/* Board + Swipe */}
        <PanGestureHandler
          onHandlerStateChange={(event) => {
            if (event.nativeEvent.state === State.END) {
              const { translationX, translationY } = event.nativeEvent;
              const threshold = 50;
              if (Math.abs(translationX) > Math.abs(translationY)) {
                if (translationX > threshold) changeDirection("RIGHT");
                else if (translationX < -threshold) changeDirection("LEFT");
              } else {
                if (translationY > threshold) changeDirection("DOWN");
                else if (translationY < -threshold) changeDirection("UP");
              }
            }
          }}
        >
          <View
            style={{
              width: GRID * cellSize,
              height: GRID * cellSize,
              backgroundColor: colors.glassSecondary,
              borderRadius: 12,
              alignSelf: "center",
              marginBottom: 20,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {/* Snake */}
            {snake.map((segment, index) => (
              <View
                key={`${segment.x}_${segment.y}_${index}`}
                style={{
                  position: "absolute",
                  left: segment.x * cellSize,
                  top: segment.y * cellSize,
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: index === 0 ? colors.gameAccent5 : colors.gameAccent5 + "BF",
                  borderRadius: index === 0 ? cellSize / 3 : cellSize / 6,
                  borderWidth: index === 0 ? 1 : 0,
                  borderColor: colors.background,
                }}
              />
            ))}

            {/* Food */}
            {food && (
              <View
                style={{
                  position: "absolute",
                  left: food.x * cellSize,
                  top: food.y * cellSize,
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: "#FF6B6B",
                  borderRadius: cellSize / 2,
                  borderWidth: 2,
                  borderColor: colors.background,
                }}
              />
            )}
          </View>
        </PanGestureHandler>

        {/* Controls (tap OR swipe) */}
        <View style={{ alignSelf: "center", marginBottom: 20 }}>
          {/* Up */}
          <View style={{ alignItems: "center", marginBottom: 8 }}>
            <TouchableOpacity
              onPress={() => changeDirection("UP")}
              style={{
                width: 60, height: 60, backgroundColor: colors.glassSecondary, borderRadius: 30,
                justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.border
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 24, color: colors.gameAccent5 }}>↑</Text>
            </TouchableOpacity>
          </View>

          {/* Left / Pause / Right */}
          <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <TouchableOpacity
              onPress={() => changeDirection("LEFT")}
              style={{
                width: 60, height: 60, backgroundColor: colors.glassSecondary, borderRadius: 30,
                justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.border
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 24, color: colors.gameAccent5 }}>←</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={togglePause}
              style={{
                width: 80, height: 50, backgroundColor: colors.gameAccent5 + "20", borderRadius: 12,
                justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.gameAccent5
              }}
            >
              <Text style={{ fontWeight: "600", fontSize: 12, color: colors.gameAccent5 }}>
                {paused ? "PLAY" : "PAUSE"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => changeDirection("RIGHT")}
              style={{
                width: 60, height: 60, backgroundColor: colors.glassSecondary, borderRadius: 30,
                justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.border
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 24, color: colors.gameAccent5 }}>→</Text>
            </TouchableOpacity>
          </View>

          {/* Down */}
          <View style={{ alignItems: "center" }}>
            <TouchableOpacity
              onPress={() => changeDirection("DOWN")}
              style={{
                width: 60, height: 60, backgroundColor: colors.glassSecondary, borderRadius: 30,
                justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.border
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 24, color: colors.gameAccent5 }}>↓</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Game Over Modal */}
        <Modal
          visible={showOver}
          transparent
          animationType="fade"
          onRequestClose={() => setShowOver(false)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" }}>
            <View style={{ borderRadius: 20, overflow: "hidden", margin: 20 }}>
              <BlurView
                intensity={isDark ? 80 : 100}
                tint={isDark ? "dark" : "light"}
                style={{
                  backgroundColor: isDark ? "rgba(31,41,55,0.9)" : "rgba(255,255,255,0.9)",
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 20,
                  padding: 28,
                  alignItems: "center",
                  width: 300,
                }}
              >
                <Text style={{ fontWeight: "700", fontSize: 24, color: colors.text, marginBottom: 8 }}>
                  Game Over
                </Text>
                <Text style={{ fontWeight: "600", fontSize: 18, color: colors.gameAccent5, marginBottom: 6 }}>
                  Score: {score}
                </Text>
                <Text style={{ fontWeight: "500", fontSize: 14, color: colors.textSecondary, marginBottom: 18 }}>
                  Length: {snake.length}
                </Text>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => { setShowOver(false); initialize(); }}
                    style={{
                      backgroundColor: colors.secondaryButton,
                      paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12,
                    }}
                  >
                    <Text style={{ fontWeight: "600", fontSize: 14, color: colors.secondaryButtonText }}>
                      Play Again
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleBack}
                    style={{
                      backgroundColor: colors.primaryButton,
                      paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12,
                    }}
                  >
                    <Text style={{ fontWeight: "600", fontSize: 14, color: colors.primaryButtonText }}>
                      Back to Hub
                    </Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </View>
          </View>
        </Modal>
      </View>

      {/* Achievements Modal */}
      <Modal
        visible={showAchievements}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAchievements(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", paddingHorizontal: 16 }}>
          <View
            style={{
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: isDark ? "rgba(0,0,0,0.9)" : colors.background,
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 16, color: colors.text }}>
                Snake Achievements
              </Text>
              <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
                <Text style={{ fontWeight: "600", fontSize: 14, color: colors.textSecondary }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 12 }}>
              {currentPlayerId && gameId ? (
                <AchievementsSection
                  playerId={currentPlayerId}
                  gameId={gameId}
                  autoRefreshMs={15000}
                  showSearchBar
                  showFilters
                />
              ) : (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: colors.textSecondary, textAlign: "center", fontWeight: "500" }}>
                    Loading achievements…
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </GestureHandlerRootView>
  );
}
