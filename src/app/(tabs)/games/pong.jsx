// src/app/(tabs)/games/pong.jsx  (REPLACE ENTIRE FILE)
import React, { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, TouchableOpacity, Dimensions, BackHandler, AppState, PanResponder, Modal, ScrollView } from "react-native";
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
import { useFocusEffect, useIsFocused } from "@react-navigation/native";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

// ===== FIELD / UI DIMENSIONS =====
const FIELD_MARGIN_H = 20;
const FIELD_WIDTH = screenWidth - FIELD_MARGIN_H * 2;
const FIELD_HEIGHT = Math.min(520, Math.floor(screenHeight * 0.55));

const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT_PLAYER = 92;
const PADDLE_HEIGHT_AI = 82;

const BALL_SIZE = 12;
const PLAYER_X = 12;
const AI_X = FIELD_WIDTH - PADDLE_WIDTH - 12;

// ===== BALL TUNING =====
const START_BALL_SPEED = 5.0;
const MAX_BALL_SPEED = 9.0;
const BALL_ACCEL_ON_HIT = 1.04;

// ===== AI TUNING =====
const AI_MAX_SPEED = 3.0;
const AI_REACTION_FRAMES = 8;
const AI_PREDICTION_NOISE = 18;
const AI_DEADZONE = 6;
const AI_ONLY_TRACK_ON_INBOUND = true;
const PLAYER_WIN_SCORE = 5;

// ---- IMPORTANT: update if your Pong id differs ----
const FALLBACK_GAME_ID = 16;

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

export default function PongGame() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [fontsLoaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });

  // session / lifecycle
  const isMountedRef = useRef(false);
  const sessionOpenRef = useRef(false);
  const gameIdRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const retryTimerRef = useRef(null);

  // achievements modal + ids
  const [showAchievements, setShowAchievements] = useState(false);
  const [resolvedGameId, setResolvedGameId] = useState(null);

  // player id
  const [currentPlayerId, setCurrentPlayerId] = useState(null);

  // scoreboard / overlay
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const scoreRef = useRef({ player: 0, ai: 0 });

  // positions
  const [playerY, setPlayerY] = useState((FIELD_HEIGHT - PADDLE_HEIGHT_PLAYER) / 2);
  const [aiY, setAiY] = useState((FIELD_HEIGHT - PADDLE_HEIGHT_AI) / 2);
  const [ballX, setBallX] = useState(FIELD_WIDTH / 2 - BALL_SIZE / 2);
  const [ballY, setBallY] = useState(FIELD_HEIGHT / 2 - BALL_SIZE / 2);

  const playerYRef = useRef(playerY);
  const aiYRef = useRef(aiY);
  const ballXRef = useRef(ballX);
  const ballYRef = useRef(ballY);
  const ballVXRef = useRef(START_BALL_SPEED);
  const ballVYRef = useRef(START_BALL_SPEED * 0.25);
  const runningRef = useRef(false);
  const rafTimerRef = useRef(null);

  // AI helpers
  const aiReactCounterRef = useRef(0);
  const aiNoiseRef = useRef(0);

  // keep mirrors in sync
  useEffect(() => { playerYRef.current = playerY; }, [playerY]);
  useEffect(() => { aiYRef.current = aiY; }, [aiY]);
  useEffect(() => { ballXRef.current = ballX; ballYRef.current = ballY; }, [ballX, ballY]);
  useEffect(() => { scoreRef.current = { player: playerScore, ai: aiScore }; }, [playerScore, aiScore]);

  // load player id
  useEffect(() => {
    isMountedRef.current = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        if (!isMountedRef.current) return;
        setCurrentPlayerId(saved ? parseInt(saved) : 1);
      } catch {
        if (!isMountedRef.current) return;
        setCurrentPlayerId(1);
      }
    })();
    return () => { isMountedRef.current = false; };
  }, []);

  // resolve game id once (for AchievementsSection too)
  useEffect(() => {
    (async () => {
      try {
        let gid = await getGameId(GAME_TYPES?.PONG ?? "PONG");
        if (!gid) gid = await getGameId("pong");
        if (!gid) gid = await getGameId("Pong");
        if (!gid) gid = FALLBACK_GAME_ID;
        setResolvedGameId(typeof gid === "number" ? gid : FALLBACK_GAME_ID);
      } catch {
        setResolvedGameId(FALLBACK_GAME_ID);
      }
    })();
  }, []);

  // input
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_evt, gesture) => {
        const top = gesture.moveY - (screenHeight - FIELD_HEIGHT) / 2 - insets.top - 160;
        setPlayerY(clamp(top, 0, FIELD_HEIGHT - PADDLE_HEIGHT_PLAYER));
      },
    })
  ).current;

  // fresh round / reset
  const resetBall = useCallback((towardsPlayer = false) => {
    const dirX = towardsPlayer ? -1 : 1;
    const speed = START_BALL_SPEED;
    const angle = (Math.random() * 0.6 - 0.3);
    ballVXRef.current = dirX * speed;
    ballVYRef.current = speed * angle;
    setBallX(FIELD_WIDTH / 2 - BALL_SIZE / 2);
    setBallY(FIELD_HEIGHT / 2 - BALL_SIZE / 2);
    aiReactCounterRef.current = 0;
    aiNoiseRef.current = (Math.random() * 2 - 1) * AI_PREDICTION_NOISE;
  }, []);

  const fullResetState = useCallback(() => {
    setPlayerScore(0);
    setAiScore(0);
    setGameOver(false);
    setPlayerY((FIELD_HEIGHT - PADDLE_HEIGHT_PLAYER) / 2);
    setAiY((FIELD_HEIGHT - PADDLE_HEIGHT_AI) / 2);
    resetBall(Math.random() < 0.5);
  }, [resetBall]);

  // tracking session open/close
  const openTrackedSession = useCallback(
    async (attempt = 1) => {
      if (sessionOpenRef.current) return;
      if (!currentPlayerId || !isFocused) return;
      try {
        const gid = resolvedGameId ?? FALLBACK_GAME_ID;
        gameIdRef.current = gid;
        await gameTracker.startGame(gid, currentPlayerId);
        sessionOpenRef.current = true;
      } catch {
        if (attempt < 5 && isFocused) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => openTrackedSession(attempt + 1), 400 * attempt);
        }
      }
    },
    [currentPlayerId, isFocused, resolvedGameId]
  );

  const closeTrackedSession = useCallback(async () => {
    clearTimeout(retryTimerRef.current);
    if (!sessionOpenRef.current) return;
    const gid = gameIdRef.current;
    gameIdRef.current = null;
    try {
      await gameTracker.endGame(gid, scoreRef.current.player || 0);
    } catch {} finally {
      sessionOpenRef.current = false;
    }
  }, []);

  // game loop
  const step = useCallback(() => {
    let x = ballXRef.current + ballVXRef.current;
    let y = ballYRef.current + ballVYRef.current;

    // walls
    if (y <= 0) { y = 0; ballVYRef.current *= -1; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }
    else if (y + BALL_SIZE >= FIELD_HEIGHT) { y = FIELD_HEIGHT - BALL_SIZE; ballVYRef.current *= -1; Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }

    // player paddle
    if (x <= PLAYER_X + PADDLE_WIDTH &&
        x >= PLAYER_X - 4 &&
        y + BALL_SIZE >= playerYRef.current &&
        y <= playerYRef.current + PADDLE_HEIGHT_PLAYER) {
      x = PLAYER_X + PADDLE_WIDTH;
      const rel = (y + BALL_SIZE / 2) - (playerYRef.current + PADDLE_HEIGHT_PLAYER / 2);
      const norm = clamp(rel / (PADDLE_HEIGHT_PLAYER / 2), -1, 1);
      const speed = Math.min(Math.hypot(ballVXRef.current, ballVYRef.current) * BALL_ACCEL_ON_HIT, MAX_BALL_SPEED);
      const angle = norm * (Math.PI / 3) * 0.65;
      ballVXRef.current = Math.abs(speed * Math.cos(angle));
      ballVYRef.current = speed * Math.sin(angle);
      aiNoiseRef.current = (Math.random() * 2 - 1) * AI_PREDICTION_NOISE;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // AI paddle
    if (x + BALL_SIZE >= AI_X &&
        x + BALL_SIZE <= AI_X + PADDLE_WIDTH + 6 &&
        y + BALL_SIZE >= aiYRef.current &&
        y <= aiYRef.current + PADDLE_HEIGHT_AI) {
      x = AI_X - BALL_SIZE;
      const rel = (y + BALL_SIZE / 2) - (aiYRef.current + PADDLE_HEIGHT_AI / 2);
      const norm = clamp(rel / (PADDLE_HEIGHT_AI / 2), -1, 1);
      const speed = Math.min(Math.hypot(ballVXRef.current, ballVYRef.current) * BALL_ACCEL_ON_HIT, MAX_BALL_SPEED);
      const angle = norm * (Math.PI / 3) * 0.65;
      ballVXRef.current = -Math.abs(speed * Math.cos(angle));
      ballVYRef.current = speed * Math.sin(angle);
      aiNoiseRef.current = (Math.random() * 2 - 1) * AI_PREDICTION_NOISE;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // scoring
    if (x + BALL_SIZE < 0) {
      const nextAi = scoreRef.current.ai + 1;
      setAiScore(nextAi);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      if (nextAi >= PLAYER_WIN_SCORE) {
        setGameOver(true); stopLoop(); closeTrackedSession();
      } else { resetBall(false); }
      return;
    } else if (x > FIELD_WIDTH) {
      const nextPlayer = scoreRef.current.player + 1;
      setPlayerScore(nextPlayer);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (nextPlayer >= PLAYER_WIN_SCORE) {
        setGameOver(true); stopLoop(); closeTrackedSession();
      } else { resetBall(true); }
      return;
    }

    // AI movement
    const inbound = ballVXRef.current > 0;
    if (!AI_ONLY_TRACK_ON_INBOUND || inbound) {
      if (aiReactCounterRef.current < AI_REACTION_FRAMES) {
        aiReactCounterRef.current += 1;
      } else {
        const target = y + BALL_SIZE / 2 - PADDLE_HEIGHT_AI / 2 + aiNoiseRef.current;
        let newAiY = aiYRef.current;
        const delta = target - newAiY;
        if (Math.abs(delta) > AI_DEADZONE) {
          newAiY += clamp(delta, -AI_MAX_SPEED, AI_MAX_SPEED);
          newAiY = clamp(newAiY, 0, FIELD_HEIGHT - PADDLE_HEIGHT_AI);
          setAiY(newAiY);
        }
      }
    } else {
      const center = (FIELD_HEIGHT - PADDLE_HEIGHT_AI) / 2;
      const delta = center - aiYRef.current;
      if (Math.abs(delta) > AI_DEADZONE) {
        let newAiY = aiYRef.current + clamp(delta, -AI_MAX_SPEED * 0.6, AI_MAX_SPEED * 0.6);
        newAiY = clamp(newAiY, 0, FIELD_HEIGHT - PADDLE_HEIGHT_AI);
        setAiY(newAiY);
      }
      aiReactCounterRef.current = 0;
    }

    // commit ball
    setBallX(x); setBallY(y);
  }, [closeTrackedSession, resetBall]);

  const loop = useCallback(() => {
    if (!runningRef.current) return;
    step();
    rafTimerRef.current = setTimeout(loop, 1000 / 60);
  }, [step]);

  const startLoop = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    rafTimerRef.current = setTimeout(loop, 1000 / 60);
  }, [loop]);

  const stopLoop = useCallback(() => {
    runningRef.current = false;
    if (rafTimerRef.current) clearTimeout(rafTimerRef.current);
  }, []);

  // focus lifecycle & app background handling
  useFocusEffect(
    useCallback(() => {
      fullResetState();

      const back = BackHandler.addEventListener("hardwareBackPress", () => {
        stopLoop();
        closeTrackedSession();
        router.back();
        return true;
      });

      return () => {
        back.remove();
        stopLoop();
        closeTrackedSession();
      };
    }, [fullResetState, stopLoop, closeTrackedSession])
  );

  useEffect(() => {
    if (isFocused && currentPlayerId) {
      openTrackedSession();
      startLoop();
    } else {
      stopLoop();
      closeTrackedSession();
    }
  }, [isFocused, currentPlayerId, openTrackedSession, startLoop, stopLoop, closeTrackedSession]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      const prev = appStateRef.current;
      appStateRef.current = state;
      if ((state === "inactive" || state === "background") && sessionOpenRef.current) {
        stopLoop();
        await closeTrackedSession();
      }
      if (state === "active" && isFocused && currentPlayerId && !sessionOpenRef.current) {
        await openTrackedSession();
        startLoop();
      }
    });
    return () => sub.remove();
  }, [isFocused, currentPlayerId, openTrackedSession, closeTrackedSession, startLoop, stopLoop]);

  // restart
  const restartGame = async () => {
    stopLoop();
    await closeTrackedSession();
    fullResetState();
    await openTrackedSession();
    startLoop();
  };

  if (!fontsLoaded) return null;

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

          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" }}>Paddle Battle</Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={() => setShowAchievements(true)}
              style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <Trophy size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={restartGame}
              style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <RotateCcw size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Score Board */}
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
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                You
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: "#9AE6B4" }}>{playerScore}</Text>
            </View>
            <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.12)" }} />
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                AI
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: "#FCA5A5" }}>{aiScore}</Text>
            </View>
          </View>
        </BlurView>
      </View>

      {/* Game Field */}
      <View style={{ flex: 1, paddingHorizontal: FIELD_MARGIN_H, paddingBottom: insets.bottom + 24 }}>
        <View
          {...panResponder.panHandlers}
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
          {/* Center dashed line */}
          <View
            style={{
              position: "absolute",
              left: FIELD_WIDTH / 2 - 1,
              top: 0,
              width: 2,
              height: FIELD_HEIGHT,
              borderStyle: "dashed",
              borderLeftWidth: 2,
              borderColor: "rgba(255,255,255,0.25)",
            }}
          />

          {/* Player Paddle */}
          <View
            style={{
              position: "absolute",
              left: PLAYER_X,
              top: playerY,
              width: PADDLE_WIDTH,
              height: PADDLE_HEIGHT_PLAYER,
              borderRadius: 8,
              backgroundColor: "#9AE6B4",
              shadowColor: "#9AE6B4",
              shadowOpacity: 0.5,
              shadowRadius: 6,
            }}
          />

          {/* AI Paddle */}
          <View
            style={{
              position: "absolute",
              left: AI_X,
              top: aiY,
              width: PADDLE_WIDTH,
              height: PADDLE_HEIGHT_AI,
              borderRadius: 8,
              backgroundColor: "#FCA5A5",
              shadowColor: "#FCA5A5",
              shadowOpacity: 0.5,
              shadowRadius: 6,
            }}
          />

          {/* Ball */}
          <View
            style={{
              position: "absolute",
              left: ballX,
              top: ballY,
              width: BALL_SIZE,
              height: BALL_SIZE,
              borderRadius: BALL_SIZE / 2,
              backgroundColor: "#ffffff",
              shadowColor: "#ffffff",
              shadowOpacity: 0.8,
              shadowRadius: 6,
            }}
          />
        </View>

        {/* Game Over Overlay */}
        {gameOver && (
          <View
            style={{
              position: "absolute",
              left: 0, right: 0, top: 0, bottom: 0,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: "rgba(0,0,0,0.7)",
              paddingHorizontal: 20,
            }}
          >
            <BlurView
              intensity={100}
              tint="dark"
              style={{
                backgroundColor: "rgba(0,0,0,0.85)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.15)",
                borderRadius: 20,
                padding: 32,
                alignItems: "center",
                width: screenWidth - 40,
              }}
            >
              <Trophy size={48} color="#9AE6B4" style={{ marginBottom: 16 }} />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: "#fff", marginBottom: 8 }}>
                {playerScore > aiScore ? "You Win!" : "Game Over"}
              </Text>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 18, color: "#9AE6B4", marginBottom: 20 }}>
                Score: {playerScore}
              </Text>

              <View style={{ flexDirection: "row" }}>
                <TouchableOpacity
                  onPress={restartGame}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.12)",
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderRadius: 12,
                    marginRight: 12,
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
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderRadius: 12,
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
              <Text style={{ fontWeight: "700", fontSize: 16, color: "#fff" }}>Pong Achievements</Text>
              <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
                <Text style={{ fontWeight: "600", fontSize: 14, color: "rgba(255,255,255,0.7)" }}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 12 }}>
              {currentPlayerId && resolvedGameId ? (
                <AchievementsSection
                  playerId={currentPlayerId}
                  gameId={resolvedGameId}
                  autoRefreshMs={15000}
                  showSearchBar
                  showFilters
                />
              ) : (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: "rgba(255,255,255,0.7)", textAlign: "center", fontWeight: "500" }}>
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
