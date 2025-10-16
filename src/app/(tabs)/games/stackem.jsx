    // src/app/(tabs)/games/stackem.jsx  (REPLACE ENTIRE FILE)
    import React, { useCallback, useEffect, useRef, useState } from "react";
    import {
      View,
      Text,
      TouchableOpacity,
      Dimensions,
      BackHandler,
      AppState,
      Animated,
      Easing,
      Modal,
      ScrollView,
    } from "react-native";
    import { StatusBar } from "expo-status-bar";
    import { useFocusEffect, useIsFocused } from "@react-navigation/native";
    import { useSafeAreaInsets } from "react-native-safe-area-context";
    import { BlurView } from "expo-blur";
    import { router } from "expo-router";
    import { ArrowLeft, RotateCcw, Trophy, Zap, Target } from "lucide-react-native";
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

    /* ==================== LAYOUT ==================== */
    const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
    const FIELD_MARGIN_H = 20;
    const FIELD_WIDTH = screenWidth - FIELD_MARGIN_H * 2;
    const FIELD_HEIGHT = Math.min(560, Math.floor(screenHeight * 0.60));

    /* ==================== GAME CONSTANTS ==================== */
    const BASE_BLOCK_HEIGHT = 20;
    const START_WIDTH = Math.min(FIELD_WIDTH * 0.8, 300);
    const SPEED_MIN = 1.8;
    const SPEED_MAX = 6.5;
    const SPEED_GAIN = 0.09;

    const PERFECT_TOLERANCE = 6; // px
    const CUT_HAPTIC_DELAY_MS = 30;

    // Camera / viewport rules
    const TOP_MARGIN = 30;                    // if the next block would be above this, scroll down
    const GROUND_Y = FIELD_HEIGHT - 36;       // visual ground line
    const SCROLL_STEP = BASE_BLOCK_HEIGHT;    // move the camera by exactly one block height per step

    const COLORS = [
      "#93C5FD", "#A7F3D0", "#FDE68A",
      "#FCA5A5", "#D8B4FE", "#6EE7B7", "#9CA3AF",
    ];

    /* ==================== TRACKING FALLBACK ==================== */
    // Achievements are keyed to 21 in your setup.
    const FALLBACK_GAME_ID = 21;

    /* ==================== UTILS ==================== */
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const randColor = (i) => COLORS[i % COLORS.length];

    export default function StackEm() {
      const insets = useSafeAreaInsets();
      const isFocused = useIsFocused();

      const [fontsLoaded] = useFonts({
        Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
      });

      /* ==================== SESSION / TRACKING ==================== */
      const sessionOpenRef = useRef(false);
      const gameIdRef = useRef(null);
      const [resolvedGameId, setResolvedGameId] = useState(null);
      const rafRef = useRef(null);

      const [currentPlayerId, setCurrentPlayerId] = useState(null);
      const scoreRef = useRef(0);

      /* ==================== ACHIEVEMENTS UI ==================== */
      const [showAchievements, setShowAchievements] = useState(false);

      /* ==================== GAME STATE ==================== */
      const [blocks, setBlocks] = useState([]); // placed + active mover
      const blocksRef = useRef([]);
      const [level, setLevel] = useState(1);
      const [speed, setSpeed] = useState(2.2);
      const speedRef = useRef(2.2);
      const [score, setScore] = useState(0);
      const [gameOver, setGameOver] = useState(false);
      const runningRef = useRef(false);

      const [perfectStreak, setPerfectStreak] = useState(0);
      const [totalPerfects, setTotalPerfects] = useState(0);
      // Track best streak for achievements
      const bestPerfectStreakRef = useRef(0);

      // FX
      const [slices, setSlices] = useState([]); // {key,x,y,w,h,color,ay}
      const [perfectFlash, setPerfectFlash] = useState(null); // {key,x,y,w,h,scale,opacity}

      // sync refs
      useEffect(() => { blocksRef.current = blocks; }, [blocks]);
      useEffect(() => { speedRef.current = speed; }, [speed]);
      useEffect(() => { scoreRef.current = score; }, [score]);

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

      /* ==================== INIT / RESET ==================== */
      const newBaseBlock = useCallback(() => {
        const w = START_WIDTH;
        const h = BASE_BLOCK_HEIGHT;
        const x = (FIELD_WIDTH - w) / 2;
        const y = GROUND_Y - h; // sits on the ground line
        return { id: "base-0", x, y, w, h, color: randColor(0), moving: false, dir: 0 };
      }, []);

      const makeMover = useCallback((y, w, h, index) => {
        const startLeft = -w - 50;
        const endRight = FIELD_WIDTH + 50;
        const dir = (index % 2 === 0) ? +1 : -1;
        const x = dir > 0 ? startLeft : endRight - w;
        return {
          id: `moving-${index}-${Date.now()}`,
          x, y, w, h,
          moving: true,
          dir,
          color: randColor(index),
        };
      }, []);

      const initializeGame = useCallback(() => {
        setGameOver(false);
        setScore(0);
        setPerfectStreak(0);
        setTotalPerfects(0);
        bestPerfectStreakRef.current = 0;
        setLevel(1);
        setSpeed(2.2);
        setSlices([]);
        setPerfectFlash(null);

        const base = newBaseBlock();
        const firstY = base.y - BASE_BLOCK_HEIGHT; // first mover above base
        const first = makeMover(Math.max(firstY, TOP_MARGIN), base.w, BASE_BLOCK_HEIGHT, 1);

        setBlocks([base, first]);
      }, [newBaseBlock, makeMover]);

      /* ==================== TRACKING ==================== */
      const openTrackedSession = useCallback(async (attempt = 1) => {
        if (sessionOpenRef.current || !isFocused) return;
        try {
          let gid = null;
          if (typeof getGameId === "function") {
            try { gid = await getGameId(GAME_TYPES?.STACKEM ?? "STACK_EM"); } catch {}
            if (!gid) { try { gid = await getGameId("STACK_EM"); } catch {} }
            if (!gid) { try { gid = await getGameId("Stack Em"); } catch {} }
            if (!gid) { try { gid = await getGameId("Tower Stack"); } catch {} }
          }
          if (!gid) gid = FALLBACK_GAME_ID;
          gameIdRef.current = gid;
          setResolvedGameId(gid);
          if (currentPlayerId) await gameTracker.startGame(gid, currentPlayerId);
          sessionOpenRef.current = true;
        } catch {
          if (attempt < 5 && isFocused) requestAnimationFrame(() => openTrackedSession(attempt + 1));
        }
      }, [currentPlayerId, isFocused]);

      const closeTrackedSession = useCallback(async () => {
        if (!sessionOpenRef.current) return;
        const gid = gameIdRef.current;
        gameIdRef.current = null;
        try {
          // Submit all the meta keys achievements expect:
          await gameTracker.endGame(gid, scoreRef.current || 0, {
            level,
            totalPerfects,                 // legacy compatibility
            perfect_moves: totalPerfects,  // explicit name for achievements
            best_perfect_streak: bestPerfectStreakRef.current,
          });
        } catch {}
        sessionOpenRef.current = false;
      }, [level, totalPerfects]);

      /* ==================== LOOP ==================== */
      const step = useCallback(() => {
        const list = blocksRef.current.slice();
        if (list.length === 0) return;

        const top = list[list.length - 1];
        if (!top || !top.moving) return;

        let x = top.x + top.dir * speedRef.current;
        if (top.dir > 0 && x + top.w >= FIELD_WIDTH + 50) { top.dir = -1; x = FIELD_WIDTH + 50 - top.w; }
        else if (top.dir < 0 && x <= -50) { top.dir = +1; x = -50; }
        top.x = x;
        setBlocks(list);
      }, []);

      const loop = useCallback(() => {
        if (!runningRef.current) return;
        step();
        rafRef.current = requestAnimationFrame(loop);
      }, [step]);

      const startLoop = useCallback(() => {
        if (runningRef.current) return;
        runningRef.current = true;
        rafRef.current = requestAnimationFrame(loop);
      }, [loop]);

      const stopLoop = useCallback(() => {
        runningRef.current = false;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }, []);

      /* ==================== ANIM HELPERS ==================== */
      const animateFallingSlice = useCallback((piece) => {
        const ay = new Animated.Value(piece.y);
        setSlices((prev) => [...prev, { ...piece, ay }]);

        Animated.timing(ay, {
          toValue: FIELD_HEIGHT + 60,
          duration: 550,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }).start(() => {
          setSlices((prev) => prev.filter((p) => p.key !== piece.key));
        });
      }, []);

      const animatePerfectFlash = useCallback((rect) => {
        const scale = new Animated.Value(0.9);
        const opacity = new Animated.Value(0.0);
        const key = `flash-${Date.now()}`;
        setPerfectFlash({ key, ...rect, scale, opacity });

        Animated.parallel([
          Animated.timing(scale, { toValue: 1.1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: false }),
          Animated.timing(opacity, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        ]).start(() => {
          Animated.parallel([
            Animated.timing(scale, { toValue: 1, duration: 120, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
            Animated.timing(opacity, { toValue: 0, duration: 220, delay: 80, easing: Easing.in(Easing.quad), useNativeDriver: false }),
          ]).start(() => setPerfectFlash(null));
        });
      }, []);

      /* ==================== PURE SHIFT (LOCAL LIST) ==================== */
      const shiftBlocksDown = useCallback((list, rows = 1) => {
        const dy = rows * SCROLL_STEP;
        let shifted = list.map((b) => ({ ...b, y: b.y + dy }));
        shifted = shifted.filter((b) => b.y + b.h <= GROUND_Y + BASE_BLOCK_HEIGHT);
        return { shifted, dy };
      }, []);

      const shiftFXDown = useCallback((dy) => {
        if (!dy) return;
        setSlices((prev) => {
          prev.forEach((s) => {
            try {
              s.ay.stopAnimation((val) => s.ay.setValue(val + dy));
            } catch {}
          });
          return [...prev];
        });
        setPerfectFlash((pf) => (pf ? { ...pf, y: pf.y + dy } : pf));
      }, []);

      /* ==================== DROP / CUT (with camera scroll) ==================== */
      const dropBlock = useCallback(async () => {
        if (gameOver) return;
        let list = blocksRef.current.slice();
        if (list.length < 2) return;

        const moving = list[list.length - 1];
        const below  = list[list.length - 2];
        if (!moving.moving) return;

        moving.moving = false;

        const perfect = Math.abs(moving.x - below.x) <= PERFECT_TOLERANCE;

        const left   = Math.max(moving.x, below.x);
        const right  = Math.min(moving.x + moving.w, below.x + below.w);
        const overlapW = right - left;

        if (overlapW <= 0) {
          setBlocks(list);
          setGameOver(true);
          try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error); } catch {}
          stopLoop();
          closeTrackedSession();
          return;
        }

        let trimmed;
        if (perfect) {
          trimmed = { ...moving, x: below.x, w: below.w, moving: false, dir: 0 };
          setPerfectStreak((p) => {
            const newStreak = p + 1;
            // keep best for achievements
            if (newStreak > bestPerfectStreakRef.current) {
              bestPerfectStreakRef.current = newStreak;
            }
            return newStreak;
          });
          setTotalPerfects((t) => t + 1);
          setScore((s) => s + 20);
          try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          animatePerfectFlash({ x: trimmed.x, y: moving.y, w: trimmed.w, h: moving.h });
        } else {
          const leftOverhangW  = Math.max(0, below.x - moving.x);
          const rightOverhangW = Math.max(0, (moving.x + moving.w) - (below.x + below.w));

          if (leftOverhangW > 0) {
            animateFallingSlice({
              key: `sliceL-${Date.now()}`, x: moving.x, y: moving.y,
              w: leftOverhangW, h: moving.h, color: moving.color,
            });
          }
          if (rightOverhangW > 0) {
            animateFallingSlice({
              key: `sliceR-${Date.now()}`,
              x: moving.x + moving.w - rightOverhangW, y: moving.y,
              w: rightOverhangW, h: moving.h, color: moving.color,
            });
          }

          trimmed = { ...moving, x: left, w: overlapW, moving: false, dir: 0 };
          setPerfectStreak(0);
          setScore((s) => s + 10);
          try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
          setTimeout(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }, CUT_HAPTIC_DELAY_MS);
        }

        // Commit trimmed into our local list
        list[list.length - 1] = trimmed;

        // Plan next mover above the trimmed block
        let nextY = trimmed.y - BASE_BLOCK_HEIGHT;
        const nextW = trimmed.w;
        const nextH = BASE_BLOCK_HEIGHT;

        // If the planned Y is above TOP_MARGIN, scroll the SAME local list before we spawn
        if (nextY < TOP_MARGIN) {
          const rowsNeeded = Math.ceil((TOP_MARGIN - nextY) / SCROLL_STEP);
          const { shifted, dy } = shiftBlocksDown(list, rowsNeeded);
          list = shifted;
          nextY += dy; // keep the planned Y in view
          shiftFXDown(dy); // keep FX aligned visually
        }

        // Create next mover and push into same local list
        const next = makeMover(nextY, nextW, nextH, list.length);
        list.push(next);

        // Commit all together
        setSpeed((v) => clamp(v + SPEED_GAIN, SPEED_MIN, SPEED_MAX));
        setLevel((lv) => lv + 1);
        setBlocks(list);
      }, [
        animateFallingSlice,
        animatePerfectFlash,
        gameOver,
        makeMover,
        shiftBlocksDown,
        shiftFXDown,
        stopLoop,
        closeTrackedSession,
      ]);

      const restart = useCallback(async () => {
        stopLoop();
        await closeTrackedSession();
        initializeGame();
        await openTrackedSession();
        startLoop();
      }, [initializeGame, openTrackedSession, closeTrackedSession, startLoop, stopLoop]);

      /* ==================== LIFECYCLE ==================== */
      useEffect(() => { initializeGame(); /* once */ }, [initializeGame]);

      useFocusEffect(
        useCallback(() => {
          const back = BackHandler.addEventListener("hardwareBackPress", () => {
            stopLoop(); closeTrackedSession(); router.back(); return true;
          });
          return () => { back.remove(); stopLoop(); closeTrackedSession(); };
        }, [stopLoop, closeTrackedSession])
      );

      useEffect(() => {
        const sub = AppState.addEventListener("change", async (state) => {
          if ((state === "inactive" || state === "background") && sessionOpenRef.current) {
            stopLoop(); await closeTrackedSession();
          }
          if (state === "active" && isFocused && !sessionOpenRef.current && !showAchievements) {
            await openTrackedSession(); startLoop();
          }
        });
        return () => sub.remove();
      }, [isFocused, openTrackedSession, closeTrackedSession, startLoop, stopLoop, showAchievements]);

      useEffect(() => {
        if (isFocused && !showAchievements) { startLoop(); openTrackedSession(); }
        else { stopLoop(); closeTrackedSession(); }
      }, [isFocused, showAchievements, openTrackedSession, startLoop, stopLoop, closeTrackedSession]);

      if (!fontsLoaded) return null;

      /* ==================== UI ==================== */
      const headerTitle = "Stack Em";

      return (
        <View style={{ flex: 1 }}>
          <StatusBar style="light" />
          <NightSkyBackground />

          {/* Header */}
          <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <TouchableOpacity
                onPress={() => { stopLoop(); closeTrackedSession(); router.back(); }}
                style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" }}
              >
                <ArrowLeft size={24} color="#fff" />
              </TouchableOpacity>

              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" }}>{headerTitle}</Text>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => { setShowAchievements(true); stopLoop(); }}
                  style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" }}
                >
                  <Trophy size={22} color="#fff" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={restart}
                  style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" }}
                >
                  <RotateCcw size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* HUD */}
            <BlurView
              intensity={80}
              tint="dark"
              style={{
                backgroundColor: "rgba(0,0,0,0.35)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.12)",
                borderRadius: 16,
                padding: 16,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                    Score
                  </Text>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#9AE6B4" }}>{score.toLocaleString()}</Text>
                </View>

                <View style={{ width: 1, height: 40, backgroundColor: "rgba(255,255,255,0.12)" }} />

                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                    Level
                  </Text>
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#93C5FD" }}>{level}</Text>
                </View>

                <View style={{ width: 1, height: 40, backgroundColor: "rgba(255,255,255,0.12)" }} />

                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                    Perfects
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Target size={16} color="#FDE68A" />
                    <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: "#FDE68A", marginLeft: 6 }}>
                      {totalPerfects}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Streak line */}
              <View style={{ marginTop: 10, alignItems: "center" }}>
                <Text style={{ color: "rgba(255,255,255,0.75)", fontFamily: "Inter_500Medium", fontSize: 12 }}>
                  Streak: <Text style={{ color: "#FDE68A", fontFamily: "Inter_700Bold" }}>{perfectStreak}</Text>
                </Text>
              </View>
            </BlurView>
          </View>

          {/* Field */}
          <View style={{ flex: 1, paddingHorizontal: FIELD_MARGIN_H, paddingBottom: insets.bottom + 24 }}>
            <View
              style={{
                width: FIELD_WIDTH,
                height: FIELD_HEIGHT,
                alignSelf: "center",
                borderRadius: 18,
                backgroundColor: "rgba(255,255,255,0.08)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.14)",
                overflow: "hidden",
              }}
            >
              {/* Ground guide */}
              <View
                style={{
                  position: "absolute",
                  left: 8,
                  right: 8,
                  bottom: 24,
                  height: 2,
                  backgroundColor: "rgba(255,255,255,0.2)",
                }}
              />

              {/* Blocks */}
              {blocks.map((b) => (
                <View
                  key={b.id}
                  style={{
                    position: "absolute",
                    left: b.x,
                    top: b.y,
                    width: b.w,
                    height: b.h,
                    borderRadius: 10,
                    backgroundColor: b.color,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.25)",
                    shadowColor: b.color,
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                  }}
                />
              ))}

              {/* Falling slices */}
              {slices.map((s) => (
                <Animated.View
                  key={s.key}
                  style={{
                    position: "absolute",
                    left: s.x,
                    top: s.ay,
                    width: s.w,
                    height: s.h,
                    borderRadius: 10,
                    backgroundColor: s.color,
                    opacity: 0.9,
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.18)",
                  }}
                />
              ))}

              {/* Perfect flash overlay */}
              {perfectFlash && (
                <Animated.View
                  style={{
                    position: "absolute",
                    left: perfectFlash.x,
                    top: perfectFlash.y,
                    width: perfectFlash.w,
                    height: perfectFlash.h,
                    borderRadius: 12,
                    backgroundColor: "rgba(253, 230, 138, 0.35)",
                    borderWidth: 1,
                    borderColor: "rgba(253, 230, 138, 0.65)",
                    transform: [{ scale: perfectFlash.scale }],
                    opacity: perfectFlash.opacity,
                  }}
                />
              )}

              {/* Tap overlay */}
              {!gameOver && (
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={dropBlock}
                  style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
                />
              )}
            </View>

            {/* Game Over Overlay */}
            {gameOver && (
              <View
                style={{
                  position: "absolute",
                  left: 0, right: 0, top: 0, bottom: 0,
                  justifyContent: "center", alignItems: "center",
                  backgroundColor: "rgba(0,0,0,0.7)", paddingHorizontal: 20,
                }}
              >
                <BlurView
                  intensity={100}
                  tint="dark"
                  style={{
                    backgroundColor: "rgba(0,0,0,0.85)",
                    borderWidth: 1, borderColor: "rgba(255,255,255,0.15)",
                    borderRadius: 20, padding: 32, alignItems: "center",
                    width: screenWidth - 40,
                  }}
                >
                  <Trophy size={48} color="#9AE6B4" style={{ marginBottom: 16 }} />
                  <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: "#fff", marginBottom: 8 }}>
                    Game Over
                  </Text>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 18, color: "#9AE6B4", marginBottom: 6 }}>
                    Score: {score.toLocaleString()}
                  </Text>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#FDE68A", marginBottom: 20 }}>
                    Perfects: {totalPerfects} • Best Streak: {bestPerfectStreakRef.current}
                  </Text>

                  <View style={{ flexDirection: "row" }}>
                    <TouchableOpacity
                      onPress={restart}
                      style={{
                        backgroundColor: "rgba(255,255,255,0.12)",
                        paddingHorizontal: 20, paddingVertical: 12,
                        borderRadius: 12, marginRight: 12,
                      }}
                    >
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" }}>
                        Play Again
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => { stopLoop(); closeTrackedSession(); router.back(); }}
                      style={{
                        backgroundColor: "#6366F1",
                        paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12,
                      }}
                    >
                      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" }}>
                        Back to Hub
                      </Text>
                    </TouchableOpacity>
                  </View>
                </BlurView>
              </View>
            )}
          </View>

          {/* Footer helper */}
          <View style={{ paddingBottom: insets.bottom + 6 }}>
            {!gameOver ? (
              <View style={{ alignItems: "center" }}>
                <View
                  style={{
                    flexDirection: "row",
                    paddingHorizontal: 14, paddingVertical: 8,
                    borderRadius: 14, backgroundColor: "rgba(0,0,0,0.3)",
                    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
                  }}
                >
                  <Zap size={16} color="#FDE68A" />
                  <Text style={{ marginLeft: 8, color: "#fff", fontFamily: "Inter_500Medium" }}>
                    Tap anywhere to drop the block
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Achievements Modal */}
          <Modal
            visible={showAchievements}
            transparent
            animationType="fade"
            onRequestClose={() => {
              setShowAchievements(false);
              // Resume only if still on this screen
              if (isFocused && !sessionOpenRef.current) {
                openTrackedSession().then(startLoop);
              } else if (isFocused) {
                startLoop();
              }
            }}
          >
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", paddingHorizontal: 16 }}>
              <View
                style={{
                  borderRadius: 16,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.15)",
                  backgroundColor: "rgba(0,0,0,0.9)",
                  maxHeight: "80%",
                }}
              >
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
                  <Text style={{ fontWeight: "700", fontSize: 16, color: "#fff" }}>
                    Stack Em Achievements
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setShowAchievements(false);
                      if (isFocused && !sessionOpenRef.current) {
                        openTrackedSession().then(startLoop);
                      } else if (isFocused) {
                        startLoop();
                      }
                    }}
                    hitSlop={10}
                  >
                    <Text style={{ fontWeight: "600", fontSize: 14, color: "rgba(255,255,255,0.75)" }}>
                      Close
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView contentContainerStyle={{ padding: 12 }}>
                  {currentPlayerId != null && (resolvedGameId ?? gameIdRef.current) != null ? (
                    <AchievementsSection
                      key={`${(resolvedGameId ?? gameIdRef.current)}-${currentPlayerId}`}
                      playerId={currentPlayerId}
                      gameId={resolvedGameId ?? gameIdRef.current}
                      autoRefreshMs={15000}
                      showSearchBar
                      showFilters
                    />
                  ) : (
                    <View style={{ padding: 16 }}>
                      <Text style={{ color: "rgba(255,255,255,0.75)", textAlign: "center", fontWeight: "500" }}>
                        Loading achievements…
                      </Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </View>
      );
    }
