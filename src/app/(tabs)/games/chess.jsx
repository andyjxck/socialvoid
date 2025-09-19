// src/app/(tabs)/games/chess.jsx
import React, { useEffect, useRef, useCallback, useState } from "react";
import { View, Text, Dimensions, TouchableOpacity } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowLeft, RotateCcw } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import { useFocusEffect } from "@react-navigation/native";

import { useTheme } from "../../../utils/theme";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import { useGameStats } from "../../../hooks/useGameStats";
import NightSkyBackground from "../../../components/NightSkyBackground";
import { ChessBoard } from "../../../components/chess/ChessBoard";
import { useChessGame } from "../../../hooks/useChessGame";

const { width: screenWidth } = Dimensions.get("window");

/** Guarded stats: only mount useGameStats once we truly have numeric ids */
function StatsBridge({ playerId, gameTypeId, onStats }) {
  const { stats, isLoading, error } = useGameStats(playerId, gameTypeId);
  useEffect(() => {
    if (stats) onStats(stats);
  }, [stats, onStats]);
  return null;
}

export default function ChessGame() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // ────────────────────────── IDs / SESSION ──────────────────────────
  const [playerId, setPlayerId] = useState(null);
  const [gameTypeId, setGameTypeId] = useState(null); // numeric game_type_id
  const [sessionId, setSessionId] = useState(null);   // tracking session (from startGame)
  const submittedRef = useRef(false);

  // persistent stats (for header W/L)
  const [winsLosses, setWinsLosses] = useState({ wins: 0, losses: 0, plays: 0 });

  // load player id
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        setPlayerId(saved ? parseInt(saved, 10) : 1);
      } catch {
        setPlayerId(1);
      }
    })();
  }, []);

  // resolve numeric game_type_id once
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const id = await getGameId(GAME_TYPES.CHESS); // MUST return NUMBER
        if (mounted) setGameTypeId(id);
      } catch (e) {
        console.warn("getGameId(CHESS) failed:", e);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // eat player_game_stats safely
  const handleStats = useCallback((stats) => {
    // Your schema: using high_score as "wins" counter, total_plays as total games
    const wins = stats?.high_score || 0;
    const plays = stats?.total_plays || 0;
    const losses = Math.max(0, plays - wins);
    setWinsLosses({ wins, losses, plays });
  }, []);

  // ────────────────────────── CHESS HOOK ──────────────────────────
  const {
    board,
    availableMoves,
    selectedSquare,
    currentPlayer,
    aiThinking,
    inCheck,
    initializeGame,
    handleSquarePress,
    gameOver,      // boolean
    winner,        // "Player" | "AI" | "Draw"
  } = useChessGame(sessionId);

  // ────────────────────────── TIMER ──────────────────────────
  const [timer, setTimer] = useState(0);
  const intervalRef = useRef(null);

  const startTimer = () => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
  };
  const stopTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // ────────────────────────── FOCUS LIFECYCLE ──────────────────────────
  useFocusEffect(
    useCallback(() => {
      let alive = true;

      const boot = async () => {
        if (!playerId || !gameTypeId) return;
        try {
          // Start the run/session with the **numeric** game_type_id
          const started = await gameTracker.startGame(gameTypeId, playerId);
          if (!alive) return;
          // If backend returns a dedicated session id, use it; else use gameTypeId as fallback
          const sid = started || gameTypeId;
          setSessionId(sid);

          submittedRef.current = false;
          setTimer(0);
          initializeGame();  // reset board state
          startTimer();
        } catch (e) {
          console.warn("startGame failed:", e);
        }
      };

      boot();

      // on blur/unfocus cleanup
      return () => {
        alive = false;
        stopTimer();
        // If the session wasn't submitted (game not completed), cancel-end it with 0
        if (sessionId && !submittedRef.current) {
          try {
            submittedRef.current = true;
            gameTracker.endGame(sessionId, 0, { cancelled: true, reason: "blur" });
          } catch (e) {}
        }
      };
    }, [playerId, gameTypeId, initializeGame, sessionId])
  );

  // ────────────────────────── SUBMIT ON GAME END ──────────────────────────
  useEffect(() => {
    if (!sessionId || !gameOver || submittedRef.current) return;

    submittedRef.current = true;
    stopTimer();

    // score semantics for chess:
    // - Use 1 for player win, 0 otherwise (so "high_score" can represent wins)
    // - Also pass time and winner metadata for analytics
    const player_score = winner === "Player" ? 1 : 0;
    const ai_score = winner === "AI" ? 1 : 0;
    const high_score = player_score; // counting wins as "high_score" for this game
    const time_s = timer;

    try {
      gameTracker.endGame(sessionId, high_score, {
        winner: winner || "Draw",
        player_score,
        ai_score,
        high_score,
        time_s,
      });
    } catch (e) {
      console.warn("endGame submit failed:", e);
    }
  }, [gameOver, winner, sessionId, timer]);

  // ────────────────────────── UI HANDLERS ──────────────────────────
  const handleBack = async () => {
    try {
      stopTimer();
      if (sessionId && !submittedRef.current) {
        submittedRef.current = true;
        await gameTracker.endGame(sessionId, 0, { cancelled: true, reason: "back_button" });
      }
    } catch {}
    router.back();
  };

  const manualRestart = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {}
    stopTimer();
    submittedRef.current = false;
    setTimer(0);
    initializeGame();
    startTimer();
  };

  // ────────────────────────── PRESENTATION HELPERS ──────────────────────────
  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const getSquareColor = (row, col) => {
    const isLight = (row + col) % 2 === 0;
    const isSelected = selectedSquare && selectedSquare.row === row && selectedSquare.col === col;
    const isAvail = availableMoves.some(([r, c]) => r === row && c === col);

    if (isSelected) return "rgba(168, 85, 247, 0.6)";
    if (isAvail) return "rgba(6, 214, 160, 0.4)";
    return isLight ? "rgba(224, 231, 255, 0.15)" : "rgba(139, 92, 246, 0.2)";
  };

  const statusText = (() => {
    if (gameOver) {
      if (winner === "Player") return "🎉 Checkmate!";
      if (winner === "AI") return "☠️ Checkmated";
      return "½–½ Draw";
    }
    if (inCheck?.white) return "⚠️ You're in Check!";
    if (inCheck?.black) return "⚠️ AI in Check!";
    if (currentPlayer === "white") return "Your Turn";
    return aiThinking ? "AI Thinking..." : "AI's Turn";
  })();

  const statusColor = (() => {
    if (inCheck?.white) return "#EF4444";
    if (inCheck?.black) return "#10B981";
    return "#E0E7FF";
  })();

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
          <TouchableOpacity
            onPress={handleBack}
            style={{
              padding: 12,
              borderRadius: 16,
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.2)",
            }}
          >
            <ArrowLeft size={24} color="#E0E7FF" />
          </TouchableOpacity>

          <Text
            style={{
              fontSize: 22,
              fontWeight: "bold",
              color: "#E0E7FF",
              textShadowColor: "#8B5CF6",
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 10,
            }}
          >
            Chess
          </Text>

          <TouchableOpacity
            onPress={manualRestart}
            style={{
              padding: 12,
              borderRadius: 16,
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.2)",
            }}
          >
            <RotateCcw size={24} color="#E0E7FF" />
          </TouchableOpacity>
        </View>

        {/* Persistent W/L derived from player_game_stats */}
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
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#06D6A0" }}>
                You {winsLosses.wins}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: statusColor, textAlign: "center" }}>
                {statusText}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#F72585" }}>
                AI {winsLosses.losses}
              </Text>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Stats bridge (only mount when both ids exist) */}
      {playerId && gameTypeId ? (
        <StatsBridge playerId={playerId} gameTypeId={gameTypeId} onStats={handleStats} />
      ) : null}

      {/* Info row */}
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
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}>TIME</Text>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#E0E7FF" }}>{formatTime(timer)}</Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}>TURN</Text>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#A855F7" }}>
                  {currentPlayer === "white" ? "You ♔" : "AI ♚"}
                </Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8" }}>GAMES</Text>
                <Text style={{ fontSize: 12, fontWeight: "600", color: "#06D6A0" }}>
                  {winsLosses.plays}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Board */}
      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: insets.bottom + 20, justifyContent: "center" }}>
        <View style={{ borderRadius: 24, overflow: "hidden", marginBottom: 16 }}>
          <BlurView
            intensity={60}
            tint="dark"
            style={{
              backgroundColor: "rgba(139, 92, 246, 0.15)",
              borderWidth: 2,
              borderColor: "rgba(224, 231, 255, 0.3)",
              borderRadius: 24,
              padding: 16,
              shadowColor: "#8B5CF6",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.3,
              shadowRadius: 16,
              elevation: 10,
            }}
          >
            <ChessBoard
              board={board}
              availableMoves={availableMoves}
              onSquarePress={handleSquarePress}
              getSquareColor={getSquareColor}
            />
          </BlurView>
        </View>

        <Text style={{ fontSize: 14, color: "#94A3B8", textAlign: "center", marginTop: 8 }}>
          {currentPlayer === "white"
            ? "Select a piece to see legal moves"
            : aiThinking
            ? "AI is calculating..."
            : "AI will move shortly..."}
        </Text>
      </View>
    </View>
  );
}
