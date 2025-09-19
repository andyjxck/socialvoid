// src/app/(tabs)/games/mancala.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import { useGameStats } from "../../../hooks/useGameStats";
import NightSkyBackground from "../../../components/NightSkyBackground";

const { height: screenHeight } = Dimensions.get("window");

// Mounts useGameStats only after we have a numeric gameTypeId
function StatsBridge({ playerId, gameTypeId, onStats }) {
  const { stats } = useGameStats(playerId, gameTypeId);
  useEffect(() => { if (stats) onStats(stats); }, [stats, onStats]);
  return null;
}

export default function MancalaGame() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [currentPlayerId, setCurrentPlayerId] = useState(1);
  const [gameTypeId, setGameTypeId] = useState(null); // numeric id for stats
  const [gameId, setGameId] = useState(null);         // active session id
  const sessionSubmitted = useRef(false);

  const [persistentScore, setPersistentScore] = useState({ player: 0, ai: 0 });

  // ── Load Player ID ───────────────────────────────────────
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

  // ── Fetch numeric gameTypeId and start session ───────────
  useEffect(() => {
    let mounted = true;
    let localGameId = null;

    (async () => {
      if (!currentPlayerId) return;
      try {
        const id = await getGameId(GAME_TYPES.MANCALA); // always numeric
        if (!mounted) return;
        setGameTypeId(id);
        const started = await gameTracker.startGame(id, currentPlayerId);
        localGameId = started ?? id;
        setGameId(localGameId);
        sessionSubmitted.current = false;
      } catch (e) {
        console.warn("Mancala startGame failed:", e);
      }
    })();

    return () => {
      mounted = false;
      // Guarantee a 0-score session if leaving mid-run
      if (localGameId && !sessionSubmitted.current) {
        try {
          gameTracker.endGame(localGameId, 0, { cancelled: true, reason: "unmount" });
        } catch {}
      }
    };
  }, [currentPlayerId]);

  // persistent W/L update
  const handleStats = useCallback((stats) => {
    const playerWins = stats?.high_score || 0;
    const totalGames = stats?.total_plays || 0;
    setPersistentScore({ player: playerWins, ai: Math.max(0, totalGames - playerWins) });
  }, []);

  // ── Game Logic ───────────────────────────────────────────
  const [board, setBoard] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState("player");
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState(null);
  const [aiThinking, setAiThinking] = useState(false);

  const PLAYER_PITS = [0, 1, 2, 3, 4, 5];
  const PLAYER_STORE = 6;
  const AI_PITS = [7, 8, 9, 10, 11, 12];
  const AI_STORE = 13;

  const initializeGame = useCallback(() => {
    setBoard([4,4,4,4,4,4,0,4,4,4,4,4,4,0]);
    setCurrentPlayer("player");
    setGameOver(false);
    setWinner(null);
    setAiThinking(false);
  }, []);

  const isGameOver = b =>
    PLAYER_PITS.every(p => b[p] === 0) || AI_PITS.every(p => b[p] === 0);

  const collectRemaining = b => {
    const nb = [...b];
    PLAYER_PITS.forEach(p => { nb[PLAYER_STORE] += nb[p]; nb[p] = 0; });
    AI_PITS.forEach(p => { nb[AI_STORE] += nb[p]; nb[p] = 0; });
    return nb;
  };

  const makeMove = (b, pit, isPlayer) => {
    const nb = [...b];
    let stones = nb[pit];
    if (!stones) return null;
    nb[pit] = 0;
    let idx = pit;
    while (stones > 0) {
      idx = (idx + 1) % 14;
      if ((isPlayer && idx === AI_STORE) || (!isPlayer && idx === PLAYER_STORE)) {
        idx = (idx + 1) % 14;
      }
      nb[idx]++;
      stones--;
    }
    const extraTurn =
      (isPlayer && idx === PLAYER_STORE) || (!isPlayer && idx === AI_STORE);

    // capture
    if (!extraTurn && nb[idx] === 1) {
      const ownSide = isPlayer ? PLAYER_PITS : AI_PITS;
      if (ownSide.includes(idx)) {
        const opp = 12 - idx;
        if (nb[opp] > 0) {
          const captured = nb[opp] + nb[idx];
          nb[opp] = nb[idx] = 0;
          if (isPlayer) nb[PLAYER_STORE] += captured;
          else nb[AI_STORE] += captured;
        }
      }
    }
    return { board: nb, extraTurn };
  };

  // ── Submit final to tracker ──────────────────────────────
  const finalizeAndSubmit = useCallback(async (finalBoard) => {
    const pScore = finalBoard[PLAYER_STORE];
    const aScore = finalBoard[AI_STORE];
    const highScore = Math.max(pScore, aScore);
    if (gameId && !sessionSubmitted.current) {
      try {
        await gameTracker.endGame(gameId, highScore, {
          player_score: pScore,
          ai_score: aScore,
          high_score: highScore,
          winner: pScore > aScore ? "player" : aScore > pScore ? "ai" : "tie",
        });
        sessionSubmitted.current = true;
      } catch (e) {
        console.warn("Mancala endGame failed:", e);
      }
    }
  }, [gameId]);

  const handleGameEnd = useCallback((p, a) => {
    setPersistentScore(prev => ({
      player: p > a ? prev.player + 1 : prev.player,
      ai: a > p ? prev.ai + 1 : prev.ai,
    }));
  }, []);

  const aiMove = useCallback(async () => {
    if (currentPlayer !== "ai" || gameOver || aiThinking) return;
    setAiThinking(true);
    await new Promise(r => setTimeout(r, 700));

    const pits = AI_PITS.filter(p => board[p] > 0);
    if (!pits.length) return;
    const pick = pits[Math.floor(Math.random() * pits.length)];
    const res = makeMove(board, pick, false);
    if (!res) return;

    setBoard(res.board);
    if (isGameOver(res.board)) {
      const finalB = collectRemaining(res.board);
      setBoard(finalB);
      setGameOver(true);
      handleGameEnd(finalB[PLAYER_STORE], finalB[AI_STORE]);
      await finalizeAndSubmit(finalB);
      setWinner(
        finalB[PLAYER_STORE] > finalB[AI_STORE]
          ? "player"
          : finalB[AI_STORE] > finalB[PLAYER_STORE]
          ? "ai"
          : "tie"
      );
    } else {
      setCurrentPlayer(res.extraTurn ? "ai" : "player");
    }
    setAiThinking(false);
  }, [board, currentPlayer, gameOver, aiThinking, handleGameEnd, finalizeAndSubmit]);

  const handlePlayerMove = async pit => {
    if (currentPlayer !== "player" || gameOver || aiThinking) return;
    if (!PLAYER_PITS.includes(pit) || board[pit] === 0) return;

    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    const res = makeMove(board, pit, true);
    if (!res) return;

    setBoard(res.board);
    if (isGameOver(res.board)) {
      const finalB = collectRemaining(res.board);
      setBoard(finalB);
      setGameOver(true);
      handleGameEnd(finalB[PLAYER_STORE], finalB[AI_STORE]);
      await finalizeAndSubmit(finalB);
      setWinner(
        finalB[PLAYER_STORE] > finalB[AI_STORE]
          ? "player"
          : finalB[AI_STORE] > finalB[PLAYER_STORE]
          ? "ai"
          : "tie"
      );
    } else {
      setCurrentPlayer(res.extraTurn ? "player" : "ai");
    }
  };

  useEffect(() => {
    if (currentPlayer === "ai" && !gameOver && !aiThinking) {
      const t = setTimeout(aiMove, 500);
      return () => clearTimeout(t);
    }
  }, [currentPlayer, gameOver, aiMove, aiThinking]);

  useEffect(() => { initializeGame(); }, [initializeGame]);

  const pitSize = Math.min(48, (screenHeight - 300) / 8);
  const statusText = gameOver
    ? winner === "player" ? "🎉 Victory!"
      : winner === "ai" ? "🤖 AI Won!"
      : "🤝 Tie!"
    : aiThinking ? "AI Thinking..."
    : currentPlayer === "player" ? "Your Turn" : "AI's Turn";

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
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => {
              if (gameId && !sessionSubmitted.current) {
                try { gameTracker.endGame(gameId, 0, { cancelled: true, reason: "back" }); } catch {}
              }
              router.back();
            }}
            style={{ padding: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" }}
          >
            <ArrowLeft size={24} color="#E0E7FF" />
          </TouchableOpacity>

          <Text style={{ fontSize: 22, fontWeight: "bold", color: "#E0E7FF" }}>Mancala</Text>

          <TouchableOpacity
            onPress={() => { try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}; initializeGame(); }}
            style={{ padding: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" }}
          >
            <RotateCcw size={24} color="#E0E7FF" />
          </TouchableOpacity>
        </View>

        {/* Persistent score */}
        <BlurView intensity={40} tint="dark"
          style={{
            backgroundColor: "rgba(139,92,246,0.2)",
            borderWidth: 1,
            borderColor: "rgba(224,231,255,0.3)",
            borderRadius: 16,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#06D6A0" }}>You {persistentScore.player}</Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#E0E7FF" }}>{statusText}</Text>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#F72585" }}>AI {persistentScore.ai}</Text>
          </View>
        </BlurView>
      </View>

      {gameTypeId && (
        <StatsBridge playerId={currentPlayerId} gameTypeId={gameTypeId} onStats={handleStats} />
      )}

      {/* Game Board */}
      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}>
        {/* AI Store */}
        <BlurView intensity={40} tint="dark" style={{ backgroundColor: "rgba(139,92,246,0.15)", borderWidth: 1, borderColor: "rgba(224,231,255,0.3)", borderRadius: 16, padding: 16, alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8", marginBottom: 8 }}>AI STORE</Text>
          <View style={{ backgroundColor: "#F72585", width: 60, height: 60, borderRadius: 30, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#fff" }}>{board[13] || 0}</Text>
          </View>
        </BlurView>

        {/* Pits */}
        <BlurView intensity={60} tint="dark" style={{ backgroundColor: "rgba(139,92,246,0.15)", borderWidth: 2, borderColor: "rgba(224,231,255,0.3)", borderRadius: 24, padding: 16, marginBottom: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", height: 300 }}>
            {/* Player pits */}
            <View style={{ flex: 1, alignItems: "center", justifyContent: "space-around" }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#06D6A0" }}>YOUR PITS</Text>
              {PLAYER_PITS.map(i => (
                <TouchableOpacity
                  key={i}
                  onPress={() => handlePlayerMove(i)}
                  disabled={currentPlayer !== "player" || board[i] === 0 || gameOver || aiThinking}
                  style={{
                    width: pitSize,
                    height: pitSize,
                    borderRadius: pitSize / 2,
                    backgroundColor:
                      currentPlayer === "player" && board[i] > 0 && !gameOver
                        ? "rgba(6,214,160,0.8)"
                        : "rgba(30,41,59,0.6)",
                    borderWidth: 2,
                    borderColor:
                      currentPlayer === "player" && board[i] > 0 && !gameOver
                        ? "#06D6A0"
                        : "rgba(148,163,184,0.3)",
                    justifyContent: "center",
                    alignItems: "center",
                  }}>
                  <Text style={{ fontSize: 14, fontWeight: "bold", color: "#E0E7FF" }}>
                    {board[i] || 0}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* AI pits */}
            <View style={{ flex: 1, alignItems: "center", justifyContent: "space-around" }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#F72585" }}>AI PITS</Text>
              {[12,11,10,9,8,7].map(i => (
                <View key={i} style={{
                  width: pitSize,
                  height: pitSize,
                  borderRadius: pitSize / 2,
                  backgroundColor:
                    aiThinking && currentPlayer === "ai"
                      ? "rgba(247,37,133,0.3)"
                      : "rgba(30,41,59,0.6)",
                  borderWidth: 2,
                  borderColor:
                    aiThinking && currentPlayer === "ai"
                      ? "#F72585"
                      : "rgba(148,163,184,0.3)",
                  justifyContent: "center",
                  alignItems: "center",
                }}>
                  <Text style={{ fontSize: 14, fontWeight: "bold", color: "#E0E7FF" }}>
                    {board[i] || 0}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </BlurView>

        {/* Player store */}
        <BlurView intensity={40} tint="dark" style={{ backgroundColor: "rgba(139,92,246,0.15)", borderWidth: 1, borderColor: "rgba(224,231,255,0.3)", borderRadius: 16, padding: 16, alignItems: "center" }}>
          <View style={{ backgroundColor: "#06D6A0", width: 60, height: 60, borderRadius: 30, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "#fff" }}>{board[6] || 0}</Text>
          </View>
          <Text style={{ fontSize: 10, fontWeight: "600", color: "#94A3B8", marginTop: 8 }}>YOUR STORE</Text>
        </BlurView>

        <Text style={{ fontSize: 14, color: "#94A3B8", textAlign: "center", marginTop: 16 }}>
          {currentPlayer === "player"
            ? "Tap your pits to move stones!"
            : aiThinking
            ? "AI is thinking..."
            : "AI's turn..."}
        </Text>
      </View>
    </View>
  );
}
