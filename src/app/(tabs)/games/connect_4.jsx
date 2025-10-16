// src/app/(tabs)/games/connect_4.jsx  (REPLACE ENTIRE FILE)
import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  Dimensions,
  Animated,
  Easing,
  ScrollView,
  Modal,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { ArrowLeft, RotateCcw, ArrowDown, Trophy } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";
import NightSkyBackground from "../../../components/NightSkyBackground";
import { useIsFocused } from "@react-navigation/native";

import { supabase } from "../../../utils/supabase";
import { useTheme } from "../../../utils/theme";
import gameTracker from "../../../utils/gameTracking";
import { useGameStats } from "../../../hooks/useGameStats";
import AchievementsSection from "../../../components/AchievementsSection";

const { width: screenWidth } = Dimensions.get("window");
const ROWS = 6;
const COLS = 7;
const EMPTY = 0;
const PLAYER = 1;
const AI = 2;

const CELL_SIZE = Math.min(50, (screenWidth - 72) / COLS);
const CONNECT4_GAME_ID = 15; // hard rule

/* ──────────────────────────────────────────────────────────
   ACHIEVEMENTS + RUN LOGGING (game_id = 15)
   - We KEEP your gameTracker calls.
   - We ALSO mirror each finished run into public.game_runs.
   - Achievements read from public.game_runs (robust, id DESC).
   Types supported: total_plays, wins_total, win_streak
   ────────────────────────────────────────────────────────── */
async function selectOne(table, match) {
  let q = supabase.from(table).select("*").limit(1);
  Object.entries(match).forEach(([k, v]) => (q = q.eq(k, v)));
  const { data, error } = await q.maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  return data || null;
}

async function upsertPlayerAchievementProgress({ playerId, achievementId, progress, complete }) {
  const existing = await selectOne("player_achievements", {
    player_id: playerId,
    achievement_id: achievementId,
  });

  if (!existing) {
    const { error } = await supabase.from("player_achievements").insert({
      player_id: playerId,
      achievement_id: achievementId,
      progress: Number(progress || 0),
      is_completed: !!complete,
      ...(complete ? { completed_at: new Date().toISOString() } : {}),
    });
    if (error) throw error;
    return;
  }

  const next = {
    progress: Math.max(Number(existing.progress || 0), Number(progress || 0)),
    is_completed: complete ? true : !!existing.is_completed,
    ...(complete && !existing.completed_at ? { completed_at: new Date().toISOString() } : {}),
  };

  const { error } = await supabase
    .from("player_achievements")
    .update(next)
    .eq("player_id", playerId)
    .eq("achievement_id", achievementId);
  if (error) throw error;
}

async function getRunStats({ playerId }) {
  const { data, error } = await supabase
    .from("game_runs")
    .select("id, score")
    .eq("game_id", CONNECT4_GAME_ID)
    .eq("player_id", playerId)
    .order("id", { ascending: false }) // robust even if created_at differs
    .limit(10000);
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const totalPlays = rows.length;
  const winsTotal = rows.filter((r) => Number(r.score || 0) >= 1).length;

  // consecutive wins from most recent
  let winStreak = 0;
  for (const r of rows) {
    if (Number(r.score || 0) >= 1) winStreak += 1;
    else break;
  }
  return { totalPlays, winsTotal, winStreak };
}

async function updateConnect4Achievements({ playerId }) {
  if (!playerId) return;
  const { totalPlays, winsTotal, winStreak } = await getRunStats({ playerId });

  const { data: list, error } = await supabase
    .from("achievements")
    .select("id, achievement_type, target_value")
    .eq("game_id", CONNECT4_GAME_ID);
  if (error) throw error;
  if (!list || list.length === 0) return;

  for (const a of list) {
    const type = String(a.achievement_type || "").toLowerCase();
    const target = Number(a.target_value || 0);
    let progress = 0;

    if (type === "total_plays") progress = totalPlays;
    else if (type === "wins_total") progress = winsTotal;
    else if (type === "win_streak") progress = winStreak;
    else continue;

    const complete = target > 0 && progress >= target;
    try {
      await upsertPlayerAchievementProgress({
        playerId,
        achievementId: a.id,
        progress,
        complete,
      });
    } catch (e) {
      console.warn("[C4] achievement update failed:", e?.message);
    }
  }
}

// Mirror a finished run into public.game_runs so achievements are reliable.
// NOTE: does not affect your gameTracker; this is additive.
async function mirrorRunToGameRuns({ playerId, score, meta = {} }) {
  try {
    const payload = {
      game_id: CONNECT4_GAME_ID,
      player_id: playerId,
      score: Number(score || 0),
      meta, // requires jsonb column; safe to send even if ignored
      // created_at – DB default now() is fine; we sort by id anyway
    };
    const { error } = await supabase.from("game_runs").insert(payload);
    if (error) throw error;
  } catch (e) {
    console.warn("[C4] mirror game_runs insert failed:", e?.message);
  }
}
/* ────────────────────────────────────────────────────────── */

export default function Connect4Game() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const isFocused = useIsFocused();

  // ---------- Board + flow state ----------
  const [board, setBoard] = useState(() =>
    Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY))
  );
  const [currentPlayer, setCurrentPlayer] = useState(PLAYER);
  const [winner, setWinner] = useState(null); // null | PLAYER | AI
  const [gameOver, setGameOver] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState(3);

  // ---------- IDs ----------
  const [currentPlayerId, setCurrentPlayerId] = useState(null);

  // ---------- Tracking ----------
  const runIdRef = useRef(null);
  const startedRef = useRef(false);
  const submittedRef = useRef(false);
  const startTimeRef = useRef(0);

  // ---------- Scores / stats (UI only) ----------
  const [sessionScore, setSessionScore] = useState({ player: 0, ai: 0 });
  const [totalScore, setTotalScore] = useState({ player: 0, ai: 0 });

  const [showAchievements, setShowAchievements] = useState(false);

  // Anim (gentle pop for last placed piece)
  const [lastDrop, setLastDrop] = useState(null); // { row, col }
  const popAnim = useRef(new Animated.Value(0)).current;

  // Soft pulse for selected column wells
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  // Stats (read-only) — server computed totals; (uses 15 in backend)
  const { stats } = useGameStats(currentPlayerId, CONNECT4_GAME_ID);
  useEffect(() => {
    if (!stats) return;
    const playerWins = stats.high_score || 0;
    const totalGames = stats.total_plays || 0;
    const aiWins = Math.max(0, totalGames - playerWins);
    setTotalScore({ player: playerWins, ai: aiWins });
  }, [stats]);

  // Load player id once
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        const pid = saved ? parseInt(saved, 10) : 1;
        setCurrentPlayerId(Number.isFinite(pid) ? pid : 1);
      } catch {
        setCurrentPlayerId(1);
      }
    })();
  }, []);

  // -------------- Helpers --------------
  const isValidMove = (brd, col) => brd[0][col] === EMPTY;

  const getLowestRow = (brd, col) => {
    for (let row = ROWS - 1; row >= 0; row--) {
      if (brd[row][col] === EMPTY) return row;
    }
    return -1;
  };

  const checkWinner = (brd, row, col, who) => {
    const dirs = [
      [0, 1],
      [1, 0],
      [1, 1],
      [1, -1],
    ];
    for (const [dr, dc] of dirs) {
      let count = 1;
      for (let i = 1; i < 4; i++) {
        const r = row + dr * i, c = col + dc * i;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && brd[r][c] === who) count++; else break;
      }
      for (let i = 1; i < 4; i++) {
        const r = row - dr * i, c = col - dc * i;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && brd[r][c] === who) count++; else break;
      }
      if (count >= 4) return true;
    }
    return false;
  };

  const getAIMove = (brd) => {
    // 1) win now
    for (let col = 0; col < COLS; col++) {
      if (isValidMove(brd, col)) {
        const t = brd.map((r) => [...r]);
        const row = getLowestRow(t, col);
        t[row][col] = AI;
        if (checkWinner(t, row, col, AI)) return col;
      }
    }
    // 2) block player
    for (let col = 0; col < COLS; col++) {
      if (isValidMove(brd, col)) {
        const t = brd.map((r) => [...r]);
        const row = getLowestRow(t, col);
        t[row][col] = PLAYER;
        if (checkWinner(t, row, col, PLAYER)) return col;
      }
    }
    // 3) center bias
    const bag = [];
    for (let col = 0; col < COLS; col++) {
      if (isValidMove(brd, col)) {
        const w = col === 3 ? 4 : col === 2 || col === 4 ? 3 : col === 1 || col === 5 ? 2 : 1;
        for (let i = 0; i < w; i++) bag.push(col);
      }
    }
    return bag[Math.floor(Math.random() * bag.length)];
  };

  const animatePop = () => {
    popAnim.setValue(0);
    Animated.timing(popAnim, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  // -------------- Session lifecycle --------------
  const initializeBoard = () => {
    setBoard(Array.from({ length: ROWS }, () => Array(COLS).fill(EMPTY)));
    setWinner(null);
    setGameOver(false);
    setIsThinking(false);
    setSelectedColumn(3);
    setLastDrop(null);
    const first = Math.random() < 0.5 ? PLAYER : AI;
    setCurrentPlayer(first);
  };

  const startRun = async () => {
    if (startedRef.current || !currentPlayerId) return;
    const gid = CONNECT4_GAME_ID; // 🔒 hard-pinned
    try {
      initializeBoard();
      const rid = await gameTracker.startGame(gid, currentPlayerId);
      runIdRef.current = Number.isFinite(Number(rid)) ? Number(rid) : gid;
      startTimeRef.current = Date.now();
      submittedRef.current = false;
      startedRef.current = true;
    } catch {
      startedRef.current = true;
      runIdRef.current = gid;
      startTimeRef.current = Date.now();
    }
  };

  const endRun = async (reason, extra = {}) => {
    if (!startedRef.current) return;
    const rid = runIdRef.current;
    if (!rid || submittedRef.current) {
      startedRef.current = false;
      return;
    }
    submittedRef.current = true;
    startedRef.current = false;

    const durationMs = Math.max(0, Date.now() - startTimeRef.current);
    const score = extra?.score ?? 0;
    const meta = { durationMs, reason, ...extra };

    // PRIMARY: keep your tracker
    try {
      await gameTracker.endGame(rid, score, meta);
    } catch (e) {
      console.warn("[C4] gameTracker.endGame failed:", e?.message);
    }
    runIdRef.current = null;

    // MIRROR: ensure a row exists for achievements
    try {
      if (currentPlayerId) {
        await mirrorRunToGameRuns({ playerId: currentPlayerId, score, meta });
      }
    } catch (e) {
      console.warn("[C4] mirrorRunToGameRuns failed:", e?.message);
    }

    // RECOMPUTE achievements (first win, etc.)
    try {
      if (currentPlayerId) await updateConnect4Achievements({ playerId: currentPlayerId });
    } catch (e) {
      console.warn("[C4] post-run achievements update failed:", e?.message);
    }
  };

  // Focus watcher: start on focus, end on blur
  useEffect(() => {
    if (isFocused && currentPlayerId) {
      startRun();
    } else if (!isFocused) {
      endRun("blur");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, currentPlayerId]);

  // -------------- Actions --------------
  const dropPiece = async (col) => {
    if (gameOver || currentPlayer !== PLAYER || !isValidMove(board, col)) return;
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}

    const newBoard = board.map((r) => [...r]);
    const row = getLowestRow(newBoard, col);
    newBoard[row][col] = PLAYER;
    setBoard(newBoard);
    setLastDrop({ row, col });
    animatePop();

    if (checkWinner(newBoard, row, col, PLAYER)) {
      setWinner(PLAYER);
      setGameOver(true);
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      try { Alert.alert("🎉 You Win!", "Great job! You beat the AI!"); } catch {}
      return;
    }

    if (newBoard.every((r) => r.every((c) => c !== EMPTY))) {
      setGameOver(true);
      try { Alert.alert("🤝 Draw!", "Good game! Try again?"); } catch {}
      return;
    }

    setCurrentPlayer(AI);
  };

  // AI turn
  useEffect(() => {
    if (currentPlayer !== AI || gameOver) return;
    setIsThinking(true);
    const t = setTimeout(async () => {
      const aiCol = getAIMove(board);
      const newBoard = board.map((r) => [...r]);
      const row = getLowestRow(newBoard, aiCol);
      newBoard[row][aiCol] = AI;

      try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}

      setBoard(newBoard);
      setIsThinking(false);
      setLastDrop({ row, col: aiCol });
      animatePop();

      if (checkWinner(newBoard, row, aiCol, AI)) {
        setWinner(AI);
        setGameOver(true);
        try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
        try { Alert.alert("🤖 AI Wins!", "The AI got you this time. Try again!"); } catch {}
        return;
      }

      if (newBoard.every((r) => r.every((c) => c !== EMPTY))) {
        setGameOver(true);
        try { Alert.alert("🤝 Draw!", "Good game! Try again?"); } catch {}
        return;
      }

      setCurrentPlayer(PLAYER);
    }, 520);

    return () => clearTimeout(t);
  }, [currentPlayer, gameOver, board]);

  // Handle game over -> end run exactly once
  const endHandledRef = useRef(false);
  useEffect(() => {
    if (!gameOver || endHandledRef.current) return;
    endHandledRef.current = true;

    const isWin = winner === PLAYER;
    setSessionScore((prev) => ({
      player: prev.player + (isWin ? 1 : 0),
      ai: prev.ai + (!isWin && winner === AI ? 1 : 0),
    }));

    endRun("game_over", { winner: isWin ? "Player" : winner === AI ? "AI" : "Draw", score: isWin ? 1 : 0 })
      .finally(() => setTimeout(() => { endHandledRef.current = false; }, 300));
  }, [gameOver, winner]);

  // Reset (end old run and start new)
  const resetGame = async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
    await endRun("reset");
    await startRun();
  };

  // Back — end run, then navigate
  const handleBack = async () => {
    await endRun("back");
    router.back();
  };

  // -------------- Rendering helpers --------------
  const getCellColor = (cell) => {
    if (cell === PLAYER) return "#06D6A0";
    if (cell === AI) return "#F72585";
    return "transparent";
  };

  const getStatusText = () => {
    if (gameOver) {
      if (winner === PLAYER) return "🎉 Victory!";
      if (winner === AI) return "🤖 AI Won!";
      return "🤝 Draw!";
    }
    if (isThinking) return "AI thinking...";
    return currentPlayer === PLAYER ? "Your Turn" : "AI's Turn";
  };

  const Disc = ({ color, isNew }) => {
    const scale = isNew
      ? popAnim.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] })
      : 1;
    return (
      <Animated.View
        style={{
          transform: [{ scale }],
          width: CELL_SIZE - 8,
          height: CELL_SIZE - 8,
          borderRadius: (CELL_SIZE - 8) / 2,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: color,
          borderWidth: 1.5,
          borderColor: "rgba(255,255,255,0.25)",
        }}
      >
        <LinearGradient
          colors={["rgba(255,255,255,0.28)", "rgba(255,255,255,0.05)", "transparent"]}
          start={{ x: 0.3, y: 0 }}
          end={{ x: 0.7, y: 0.9 }}
          style={{ position: "absolute", inset: 0, borderRadius: (CELL_SIZE - 8) / 2 }}
        />
        <View
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: (CELL_SIZE - 8) / 2,
            borderWidth: 1,
            borderColor: "rgba(0,0,0,0.15)",
          }}
        />
      </Animated.View>
    );
  };

  const Well = ({ highlight, children }) => {
    const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.14] });
    return (
      <View
        style={{
          width: CELL_SIZE,
          height: CELL_SIZE,
          borderRadius: CELL_SIZE / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(17, 24, 39, 0.55)",
          borderWidth: 1,
          borderColor: "rgba(224, 231, 255, 0.12)",
          overflow: "hidden",
        }}
      >
        <LinearGradient
          colors={["rgba(255,255,255,0.04)", "rgba(0,0,0,0.25)"]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={{ position: "absolute", inset: 0 }}
        />
        {highlight && (
          <Animated.View
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: CELL_SIZE / 2,
              backgroundColor: "rgba(168, 85, 247, 1)",
              opacity: glow,
            }}
          />
        )}
        {children}
      </View>
    );
  };

  const title = useMemo(() => "Four in a Row", []);

  // -------------- UI --------------
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />

      {/* Cosmic background */}
      <LinearGradient
        colors={["#1a0b2e", "#16213e", "#0f3460", "#533a7d"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 18, marginBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <TouchableOpacity
            onPress={handleBack}
            style={{
              padding: 10,
              borderRadius: 14,
              backgroundColor: "rgba(255, 255, 255, 0.07)",
              borderWidth: 1,
              borderColor: "rgba(255, 255, 255, 0.16)",
            }}
          >
            <ArrowLeft size={22} color="#E0E7FF" />
          </TouchableOpacity>

          <View style={{ alignItems: "center" }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: "#E0E7FF",
                textShadowColor: "rgba(139,92,246,0.5)",
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 8,
              }}
            >
              {title}
            </Text>
            <Text style={{ color: "#CBD5E1", marginTop: 2, fontWeight: "600" }}>
              {getStatusText()}
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* Achievements */}
            <TouchableOpacity
              onPress={() => setShowAchievements(true)}
              style={{
                padding: 10,
                borderRadius: 14,
                backgroundColor: "rgba(255, 255, 255, 0.07)",
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.16)",
              }}
              accessibilityLabel="Achievements"
            >
              <Trophy size={22} color="#E0E7FF" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={resetGame}
              style={{
                padding: 10,
                borderRadius: 14,
                backgroundColor: "rgba(255, 255, 255, 0.07)",
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.16)",
              }}
            >
              <RotateCcw size={22} color="#E0E7FF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Game Area */}
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 18 }}>
        {/* Column Arrow */}
        <View style={{ flexDirection: "row", marginBottom: 8, justifyContent: "center" }}>
          {Array(COLS).fill(null).map((_, col) => (
            <View key={col} style={{ width: CELL_SIZE + 6, alignItems: "center", marginHorizontal: 1 }}>
              {selectedColumn === col && currentPlayer === PLAYER && !gameOver && (
                <ArrowDown size={18} color="#06D6A0" />
              )}
            </View>
          ))}
        </View>

        {/* Board */}
        <View style={{ borderRadius: 22, overflow: "hidden", marginBottom: 16 }}>
          <BlurView
            intensity={55}
            tint="dark"
            style={{
              backgroundColor: "rgba(139, 92, 246, 0.12)",
              borderWidth: 1,
              borderColor: "rgba(224, 231, 255, 0.22)",
              borderRadius: 22,
              padding: 12,
            }}
          >
            {board.map((row, rowIndex) => (
              <View
                key={rowIndex}
                style={{
                  flexDirection: "row",
                  marginBottom: rowIndex === ROWS - 1 ? 0 : 6,
                  justifyContent: "center",
                }}
              >
                {row.map((cell, colIndex) => {
                  const isNew =
                    lastDrop &&
                    lastDrop.row === rowIndex &&
                    lastDrop.col === colIndex &&
                    cell !== EMPTY;

                  const highlight = selectedColumn === colIndex && currentPlayer === PLAYER && !gameOver;

                  return (
                    <View
                      key={colIndex}
                      style={{ width: CELL_SIZE, height: CELL_SIZE, marginHorizontal: 3, alignItems: "center", justifyContent: "center" }}
                    >
                      <Well highlight={highlight}>
                        {cell !== EMPTY && <Disc color={getCellColor(cell)} isNew={isNew} />}
                      </Well>
                    </View>
                  );
                })}
              </View>
            ))}
          </BlurView>
        </View>

        {/* Controls */}
        <View style={{ borderRadius: 16, overflow: "hidden" }}>
          <BlurView
            intensity={45}
            tint="dark"
            style={{
              backgroundColor: "rgba(139, 92, 247, 0.16)",
              borderWidth: 1,
              borderColor: "rgba(224, 231, 255, 0.22)",
              borderRadius: 16,
              padding: 12,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
              <GameButton
                label="← LEFT"
                disabled={selectedColumn === 0 || currentPlayer !== PLAYER || gameOver}
                onPress={async () => {
                  if (selectedColumn > 0 && currentPlayer === PLAYER && !gameOver) {
                    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                    setSelectedColumn((c) => c - 1);
                  }
                }}
                activeTint="rgba(6, 214, 160, 0.28)"
                inactiveTint="rgba(100, 116, 139, 0.28)"
                activeBorder="rgba(6, 214, 160, 0.5)"
                inactiveBorder="rgba(148, 163, 184, 0.3)"
                activeText="#06D6A0"
              />

              <GameButton
                label="DROP"
                wide
                disabled={!isValidMove(board, selectedColumn) || currentPlayer !== PLAYER || gameOver}
                onPress={async () => {
                  if (!isValidMove(board, selectedColumn) || currentPlayer !== PLAYER || gameOver) return;
                  await dropPiece(selectedColumn);
                }}
                activeTint="rgba(168, 85, 247, 0.36)"
                inactiveTint="rgba(100, 116, 139, 0.28)"
                activeBorder="rgba(168, 85, 247, 0.6)"
                inactiveBorder="rgba(148, 163, 184, 0.3)"
                activeText="#E0E7FF"
              />

              <GameButton
                label="RIGHT →"
                disabled={selectedColumn === COLS - 1 || currentPlayer !== PLAYER || gameOver}
                onPress={async () => {
                  if (selectedColumn < COLS - 1 && currentPlayer === PLAYER && !gameOver) {
                    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
                    setSelectedColumn((c) => c + 1);
                  }
                }}
                activeTint="rgba(6, 214, 160, 0.28)"
                inactiveTint="rgba(100, 116, 139, 0.28)"
                activeBorder="rgba(6, 214, 160, 0.5)"
                inactiveBorder="rgba(148, 163, 184, 0.3)"
                activeText="#06D6A0"
              />
            </View>
          </BlurView>
        </View>
      </View>

      {/* ACHIEVEMENTS MODAL */}
      <Modal
        visible={showAchievements}
        animationType="fade"
        transparent
        onRequestClose={() => setShowAchievements(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 }}>
          <BlurView
            tint="dark"
            intensity={90}
            style={{
              borderRadius: 18,
              overflow: "hidden",
              backgroundColor: "rgba(255,255,255,0.10)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.16)",
              maxHeight: "85%",
            }}
          >
            {/* Header */}
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(255,255,255,0.16)",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ fontWeight: "800", fontSize: 16, color: "#fff" }}>
                Four in a Row — Achievements
              </Text>
              <TouchableOpacity onPress={() => setShowAchievements(false)}>
                <Text style={{ fontWeight: "700", fontSize: 14, color: "#cbd5e1" }}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
              <AchievementsSection
                playerId={currentPlayerId}
                gameId={CONNECT4_GAME_ID}
                autoRefreshMs={15000}
                showSearchBar={true}
                showFilters={true}
              />
            </ScrollView>
          </BlurView>
        </View>
      </Modal>

      <View style={{ paddingBottom: insets.bottom + 16 }} />
    </View>
  );
}

/** Small reusable button with consistent look */
const GameButton = ({
  label,
  onPress,
  disabled,
  activeTint,
  inactiveTint,
  activeBorder,
  inactiveBorder,
  activeText,
  wide,
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: disabled ? inactiveTint : activeTint,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        flex: wide ? 1.2 : 1,
        borderWidth: 1.5,
        borderColor: disabled ? inactiveBorder : activeBorder,
        alignItems: "center",
        justifyContent: "center",
      }}
      activeOpacity={0.7}
    >
      <Text
        style={{
          fontSize: wide ? 16 : 14,
          fontWeight: "800",
          color: disabled ? "#94A3B8" : activeText,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};
