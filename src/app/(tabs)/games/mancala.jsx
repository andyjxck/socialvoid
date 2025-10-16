// src/app/(tabs)/games/mancala.jsx  (REPLACE ENTIRE FILE)
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import { useGameStats } from "../../../hooks/useGameStats";
import AchievementsSection from "../../../components/AchievementsSection";
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
  const [gameTypeId, setGameTypeId] = useState(null); // numeric id for stats/achievements
  const [gameId, setGameId] = useState(null);         // active tracked session id
  const sessionSubmitted = useRef(false);

  const [showAchievements, setShowAchievements] = useState(false);

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
        const id = await getGameId(GAME_TYPES.MANCALA); // numeric
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
          winner: pScore > aScore ? "Player" : aScore > pScore ? "AI" : "Tie",
        });
        sessionSubmitted.current = true;
      } catch (e) {
        console.warn("Mancala endGame failed:", e);
      }
    }
  }, [gameId]);

  const handleGameEnd = useCallback(async (finalBoard) => {
    const p = finalBoard[PLAYER_STORE];
    const a = finalBoard[AI_STORE];
    const w = p > a ? "player" : a > p ? "ai" : "tie";
    setWinner(w);
    setGameOver(true);

    // Haptics + submit
    try {
      if (w === "player") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else if (w === "ai") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      else await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    await finalizeAndSubmit(finalBoard);
  }, [finalizeAndSubmit]);

  const aiMove = useCallback(async () => {
    if (currentPlayer !== "ai" || gameOver || aiThinking) return;
    setAiThinking(true);
    await new Promise(r => setTimeout(r, 700));

    const pits = AI_PITS.filter(p => board[p] > 0);
    if (!pits.length) return;
    const pick = pits[Math.floor(Math.random() * pits.length)];
    const res = makeMove(board, pick, false);
    if (!res) return;

    const after = res.board;
    setBoard(after);

    if (isGameOver(after)) {
      const finalB = collectRemaining(after);
      setBoard(finalB);
      await handleGameEnd(finalB);
    } else {
      setCurrentPlayer(res.extraTurn ? "ai" : "player");
    }
    setAiThinking(false);
  }, [board, currentPlayer, gameOver, aiThinking, handleGameEnd]);

  const handlePlayerMove = async pit => {
    if (currentPlayer !== "player" || gameOver || aiThinking) return;
    if (!PLAYER_PITS.includes(pit) || board[pit] === 0) return;

    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    const res = makeMove(board, pit, true);
    if (!res) return;

    const after = res.board;
    setBoard(after);

    if (isGameOver(after)) {
      const finalB = collectRemaining(after);
      setBoard(finalB);
      await handleGameEnd(finalB);
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
      <NightSkyBackground />

      {/* ─── HEADER ─── */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <TouchableOpacity
            onPress={() => {
              if (gameId && !sessionSubmitted.current) {
                try { gameTracker.endGame(gameId, 0, { cancelled: true, reason: "back" }); } catch {}
              }
              router.back();
            }}
            style={{
              padding: 8,
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.12)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.18)",
            }}
          >
            <ArrowLeft size={22} color="#E0E7FF" />
          </TouchableOpacity>

          <Text style={{ fontSize: 20, fontWeight: "700", color: "#E0E7FF" }}>Mancala</Text>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity
              onPress={() => setShowAchievements(true)}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.12)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.18)",
              }}
            >
              <Trophy size={20} color="#E0E7FF" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {};
                initializeGame();
                // start a fresh tracked session as a new game
                if (gameId && !sessionSubmitted.current) {
                  try { gameTracker.endGame(gameId, 0, { cancelled: true, reason: "restart" }); } catch {}
                }
                (async () => {
                  const id = await getGameId(GAME_TYPES.MANCALA);
                  setGameTypeId(id);
                  const started = await gameTracker.startGame(id, currentPlayerId);
                  setGameId(started ?? id);
                  sessionSubmitted.current = false;
                })();
              }}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: "rgba(255,255,255,0.12)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.18)",
              }}
            >
              <RotateCcw size={22} color="#E0E7FF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── STATS CARD ─── */}
        <BlurView
          intensity={70}
          tint="dark"
          style={{
            backgroundColor: "rgba(31,41,55,0.6)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.15)",
            borderRadius: 16,
            padding: 14,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontSize: 11, color: "#94A3B8", fontWeight: "600" }}>AI</Text>
              <Text style={{ fontSize: 18, color: "#F72585", fontWeight: "700" }}>{board[13] ?? 0}</Text>
            </View>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontSize: 12, color: "#94A3B8", fontWeight: "600" }}>{statusText}</Text>
            </View>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontSize: 11, color: "#94A3B8", fontWeight: "600" }}>You</Text>
              <Text style={{ fontSize: 18, color: "#06D6A0", fontWeight: "700" }}>{board[6] ?? 0}</Text>
            </View>
          </View>
        </BlurView>
      </View>

      {/* ─── MAIN BOARD ─── */}
      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: insets.bottom + 20, justifyContent: "center" }}>
        <BlurView
          intensity={80}
          tint="dark"
          style={{
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            borderRadius: 24,
            backgroundColor: "rgba(255,255,255,0.08)",
            paddingVertical: 24,
            paddingHorizontal: 18,
            alignItems: "center",
            width: "100%",
          }}
        >
          {/* AI STORE */}
          <View style={{ alignItems: "center", marginBottom: 18 }}>
            <View
              style={{
                backgroundColor: "#F72585",
                width: 70,
                height: 70,
                borderRadius: 35,
                justifyContent: "center",
                alignItems: "center",
                shadowColor: "#F72585",
                shadowOpacity: 0.5,
                shadowRadius: 8,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 20 }}>{board[13] || 0}</Text>
            </View>
            <Text style={{ color: "#94A3B8", fontSize: 11, marginTop: 6 }}>AI STORE</Text>
          </View>

          {/* MIDDLE BOARD */}
          <BlurView
            intensity={50}
            tint="dark"
            style={{
              width: "100%",
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              backgroundColor: "rgba(255,255,255,0.04)",
              paddingVertical: 16,
              paddingHorizontal: 12,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-evenly" }}>
              {/* LEFT COLUMN — PLAYER */}
              <View style={{ alignItems: "center" }}>
                {[0, 1, 2, 3, 4, 5].map((i) => {
                  const playable =
                    currentPlayer === "player" && board[i] > 0 && !gameOver && !aiThinking;
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => handlePlayerMove(i)}
                      disabled={!playable}
                      activeOpacity={0.9}
                      style={{
                        width: 54,
                        height: 54,
                        borderRadius: 27,
                        backgroundColor: playable
                          ? "rgba(6,214,160,0.85)"
                          : "rgba(30,41,59,0.7)",
                        borderWidth: 2,
                        borderColor: playable
                          ? "#06D6A0"
                          : "rgba(148,163,184,0.3)",
                        justifyContent: "center",
                        alignItems: "center",
                        marginVertical: 5,
                        shadowColor: playable ? "#06D6A0" : "transparent",
                        shadowOpacity: 0.6,
                        shadowRadius: 5,
                      }}
                    >
                      <Text style={{ color: "#E0E7FF", fontWeight: "700" }}>{board[i] || 0}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* RIGHT COLUMN — AI */}
              <View style={{ alignItems: "center" }}>
                {[12, 11, 10, 9, 8, 7].map((i) => (
                  <View
                    key={i}
                    style={{
                      width: 54,
                      height: 54,
                      borderRadius: 27,
                      backgroundColor:
                        aiThinking && currentPlayer === "ai"
                          ? "rgba(247,37,133,0.4)"
                          : "rgba(30,41,59,0.7)",
                      borderWidth: 2,
                      borderColor:
                        aiThinking && currentPlayer === "ai"
                          ? "#F72585"
                          : "rgba(148,163,184,0.3)",
                      justifyContent: "center",
                      alignItems: "center",
                      marginVertical: 5,
                    }}
                  >
                    <Text style={{ color: "#E0E7FF", fontWeight: "700" }}>{board[i] || 0}</Text>
                  </View>
                ))}
              </View>
            </View>
          </BlurView>

          {/* PLAYER STORE */}
          <View style={{ alignItems: "center", marginTop: 18 }}>
            <View
              style={{
                backgroundColor: "#06D6A0",
                width: 70,
                height: 70,
                borderRadius: 35,
                justifyContent: "center",
                alignItems: "center",
                shadowColor: "#06D6A0",
                shadowOpacity: 0.5,
                shadowRadius: 8,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 20 }}>{board[6] || 0}</Text>
            </View>
            <Text style={{ color: "#94A3B8", fontSize: 11, marginTop: 6 }}>YOUR STORE</Text>
          </View>
        </BlurView>

        {/* FOOTER */}
        <Text style={{ color: "#94A3B8", fontSize: 14, textAlign: "center", marginTop: 16 }}>
          {currentPlayer === "player"
            ? "Tap your pits to move stones"
            : aiThinking
            ? "AI is thinking..."
            : "AI’s turn"}
        </Text>
      </View>

      {/* ─── GAME OVER MODAL (NEW) ─── */}
      {gameOver && (
        <View
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            justifyContent: "center",
            alignItems: "center",
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
              padding: 28,
              alignItems: "center",
              width: "88%",
              maxWidth: 460,
            }}
          >
            <Trophy size={48} color={winner === "player" ? "#06D6A0" : winner === "ai" ? "#F72585" : "#a5b4fc"} style={{ marginBottom: 14 }} />
            <Text style={{ fontWeight: "800", fontSize: 22, color: "#fff", marginBottom: 6 }}>
              {winner === "player" ? "You Win!" : winner === "ai" ? "AI Wins" : "It's a Tie"}
            </Text>
            <Text style={{ fontWeight: "600", fontSize: 14, color: "#cbd5e1", marginBottom: 18 }}>
              Final Score — You: {board[6] || 0} · AI: {board[13] || 0}
            </Text>

            <View style={{ flexDirection: "row" }}>
              <TouchableOpacity
                onPress={() => {
                  // New round: restart + new tracking window
                  initializeGame();
                  if (gameId && !sessionSubmitted.current) {
                    try { gameTracker.endGame(gameId, 0, { cancelled: true, reason: "new_round" }); } catch {}
                  }
                  (async () => {
                    const id = await getGameId(GAME_TYPES.MANCALA);
                    setGameTypeId(id);
                    const started = await gameTracker.startGame(id, currentPlayerId);
                    setGameId(started ?? id);
                    sessionSubmitted.current = false;
                  })();
                }}
                style={{
                  backgroundColor: "rgba(255,255,255,0.12)",
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderRadius: 12,
                  marginRight: 12,
                }}
              >
                <Text style={{ fontWeight: "700", fontSize: 14, color: "#fff" }}>
                  Play Again
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (gameId && !sessionSubmitted.current) {
                    try { gameTracker.endGame(gameId, 0, { cancelled: true, reason: "back_from_modal" }); } catch {}
                  }
                  router.back();
                }}
                style={{
                  backgroundColor: "#6366F1",
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderRadius: 12,
                }}
              >
                <Text style={{ fontWeight: "700", fontSize: 14, color: "#fff" }}>
                  Back to Hub
                </Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      )}

      {/* ─── ACHIEVEMENTS MODAL ─── */}
      {showAchievements && (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "center",
            paddingHorizontal: 16,
          }}
        >
          <View
            style={{
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: colors.border || "rgba(255,255,255,0.12)",
              backgroundColor: colors.background || "rgba(15,23,42,0.98)",
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border || "rgba(255,255,255,0.12)",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 16, color: colors.text || "#fff" }}>
                Mancala Achievements
              </Text>
              <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
                <Text style={{ fontWeight: "600", fontSize: 14, color: colors.textSecondary || "#cbd5e1" }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: 12 }}>
              {currentPlayerId && gameTypeId ? (
                <AchievementsSection
                  playerId={currentPlayerId}
                  gameId={gameTypeId}
                  autoRefreshMs={15000}
                  showSearchBar
                  showFilters
                />
              ) : (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: colors.textSecondary || "#cbd5e1", textAlign: "center", fontWeight: "500" }}>
                    Loading achievements…
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {/* (Optional) Stats bridge if you still want aggregate reads */}
      {currentPlayerId && gameTypeId ? (
        <StatsBridge playerId={currentPlayerId} gameTypeId={gameTypeId} onStats={handleStats} />
      ) : null}
    </View>
  );
}
