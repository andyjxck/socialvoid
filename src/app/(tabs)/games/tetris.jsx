import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw } from "lucide-react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

import { useTheme } from "../../../utils/theme";
import { useGameStats, GAME_STATS_TYPES } from "../../../hooks/useGameStats";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";
import { useTetrisGame } from "../../../hooks/useTetrisGame";

import TetrisBoard from "../../../components/tetris/TetrisBoard";
import ControlInstructions from "../../../components/tetris/ControlInstructions";
import GameControls from "../../../components/tetris/GameControls";
import PauseModal from "../../../components/tetris/PauseModal";
import GameOverModal from "../../../components/tetris/GameOverModal";

export default function TetrisGame() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();

  // ─── Player & Game IDs ──────────────────────────────────────────
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);      // numeric DB id
  const gameIdRef = useRef(null);

  // Server stats for this player/game
  const { stats, isLoading: isLoadingStats } = useGameStats(
    currentPlayerId,
    GAME_STATS_TYPES.TETRIS
  );

  const [localHighScore, setLocalHighScore] = useState(0);
  useEffect(() => {
    if (!isLoadingStats && stats && typeof stats.high_score === "number") {
      setLocalHighScore((hs) => Math.max(hs, stats.high_score));
    }
  }, [isLoadingStats, stats]);

  // Game logic hook
  const {
    board,
    score,
    lines,
    gameOver,
    paused,
    initializeGame,
    movePiece,
    rotatePiece,
    togglePause,
  } = useTetrisGame();

  // Run guards
  const activeRef = useRef(false);
  const submittedRef = useRef(false);

  // ─── Load player id ─────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        const pid = saved ? parseInt(saved, 10) : 1;
        if (mounted) setCurrentPlayerId(pid);
      } catch {
        if (mounted) setCurrentPlayerId(1);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // ─── Fetch numeric game id & start a session ────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!currentPlayerId) return;
      try {
        // ✅ always resolves to a numeric id from DB
        const numericId = await getGameId(GAME_TYPES.TETRIS);
        if (!mounted || !numericId) return;

        setGameId(numericId);
        gameIdRef.current = numericId;

        // start tracking
        await gameTracker.startGame(numericId, currentPlayerId);
        activeRef.current = true;
        submittedRef.current = false;
      } catch (err) {
        console.warn("Failed to start Tetris session:", err);
      }
    })();
    return () => { mounted = false; };
  }, [currentPlayerId]);

  // ─── End run helper ─────────────────────────────────────────────
  const endRunWith = useCallback(async (finalScore) => {
    if (!gameIdRef.current) return;
    if (!activeRef.current || submittedRef.current) return;
    try {
      await gameTracker.endGame(gameIdRef.current, finalScore);
    } catch {}
    submittedRef.current = true;
    activeRef.current = false;

    if (finalScore > 0) {
      setLocalHighScore((hs) => Math.max(hs, finalScore));
    }
  }, []);

  // Submit when game over
  useEffect(() => {
    if (gameOver) {
      endRunWith(score > 0 ? score : 0);
    }
  }, [gameOver, score, endRunWith]);

  // Unmount → record a play with 0
  useEffect(() => {
    return () => {
      if (activeRef.current && !submittedRef.current) {
        try { gameTracker.endGame(gameIdRef.current, 0); } catch {}
        submittedRef.current = true;
        activeRef.current = false;
      }
    };
  }, []);

  // ─── UI handlers ────────────────────────────────────────────────
  const handleReset = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    await endRunWith(0);
    if (gameIdRef.current && currentPlayerId) {
      try {
        await gameTracker.startGame(gameIdRef.current, currentPlayerId);
        activeRef.current = true;
        submittedRef.current = false;
      } catch {}
    }
    initializeGame();
  }, [currentPlayerId, endRunWith, initializeGame]);

const handleBack = useCallback(async () => {
  // force a 0-score session even if the run is no longer marked active
  if (gameIdRef.current && !submittedRef.current) {
    try {
      await gameTracker.endGame(gameIdRef.current, 0);
    } catch {}
    submittedRef.current = true;
  }
  activeRef.current = false;
  router.back();
}, []);


  // ─── Gestures ───────────────────────────────────────────────────
  const panGesture = Gesture.Pan().onEnd((event) => {
    if (gameOver || paused) return;
    const { velocityX, velocityY, translationX, translationY } = event;
    const minVelocity = 300;
    const minDistance = 30;
    if (Math.abs(velocityX) > Math.abs(velocityY) &&
        Math.abs(velocityX) > minVelocity &&
        Math.abs(translationX) > minDistance) {
      movePiece(velocityX > 0 ? "right" : "left");
    } else if (
      Math.abs(velocityY) > Math.abs(velocityX) &&
      velocityY > minVelocity &&
      Math.abs(translationY) > minDistance
    ) {
      movePiece("down");
    }
  });

  const tapGesture = Gesture.Tap().onStart(() => {
    if (!gameOver && !paused) rotatePiece();
  });

  const gestures = Gesture.Exclusive(panGesture, tapGesture);

  // ─── UI ─────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <LinearGradient
        colors={["#1a0b2e", "#16213e", "#0f3460", "#533a7d"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <TouchableOpacity onPress={handleBack} style={{ padding: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" }}>
            <ArrowLeft size={24} color="#E0E7FF" />
          </TouchableOpacity>

          <Text style={{ fontSize: 22, fontWeight: "bold", color: "#E0E7FF" }}>Tetris</Text>

          <TouchableOpacity onPress={handleReset} style={{ padding: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" }}>
            <RotateCcw size={24} color="#E0E7FF" />
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={{ borderRadius: 16, overflow: "hidden" }}>
          <BlurView
            intensity={40}
            tint="dark"
            style={{
              backgroundColor: "rgba(139, 92, 246, 0.2)",
              borderWidth: 1,
              borderColor: "rgba(224, 231, 255, 0.3)",
              borderRadius: 16,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}>HIGH SCORE</Text>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#06D6A0" }}>
                  {isLoadingStats ? "..." : (localHighScore || 0).toLocaleString()}
                </Text>
              </View>

              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}>CURRENT</Text>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#E0E7FF" }}>
                  {score.toLocaleString()}
                </Text>
              </View>

              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}>LINES</Text>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#F72585" }}>
                  {lines}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Game Info */}
      <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
        <View style={{ borderRadius: 12, overflow: "hidden" }}>
          <BlurView
            intensity={30}
            tint="dark"
            style={{
              backgroundColor: "rgba(30, 41, 59, 0.4)",
              borderWidth: 1,
              borderColor: "rgba(148, 163, 184, 0.3)",
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}>GAMES</Text>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#E0E7FF" }}>
                  {isLoadingStats ? "..." : (stats?.total_plays || 0)}
                </Text>
              </View>

              <TouchableOpacity
                onPress={togglePause}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: paused ? "rgba(6, 214, 160, 0.3)" : "rgba(168, 85, 247, 0.3)",
                  borderWidth: 1,
                  borderColor: paused ? "#06D6A0" : "#A855F7",
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: "600", color: paused ? "#06D6A0" : "#A855F7" }}>
                  {paused ? "RESUME" : "PAUSE"}
                </Text>
              </TouchableOpacity>

              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}>LEVEL</Text>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#A855F7" }}>
                  {Math.floor(lines / 10) + 1}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Game board */}
      <View style={{ flex: 1, justifyContent: "flex-start", alignItems: "center", paddingHorizontal: 20, paddingBottom: 160 }}>
        <View style={{ borderRadius: 24, overflow: "hidden" }}>
          <BlurView
            intensity={60}
            tint="dark"
            style={{
              backgroundColor: "rgba(139, 92, 246, 0.15)",
              borderWidth: 2,
              borderColor: "rgba(224, 231, 255, 0.3)",
              borderRadius: 24,
              padding: 16,
            }}
          >
            <GestureDetector gesture={gestures}>
              <TetrisBoard boardData={board} />
            </GestureDetector>
          </BlurView>
        </View>
      </View>

      {/* Bottom controls */}
      <View style={{ paddingHorizontal: 20, paddingBottom: Math.max(insets.bottom + 16, 32), paddingTop: 8 }}>
        <ControlInstructions />
        <GameControls onMove={movePiece} onRotate={rotatePiece} />
      </View>

      {paused && !gameOver && <PauseModal onResume={togglePause} />}
      {gameOver && (
        <GameOverModal
          score={score}
          lines={lines}
          onPlayAgain={handleReset}
        />
      )}
    </View>
  );
}
