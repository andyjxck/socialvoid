// src/app/(tabs)/games/dots_and_boxes.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions, Alert, Modal, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { ArrowLeft, RotateCcw, Play, User, Bot, Trophy } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { supabase } from "../../../utils/supabase";
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

const { width: screenWidth } = Dimensions.get("window");

/** Dots per side — 7 ⇒ 6×6 boxes. */
const DOTS = 7;

/** Index helpers */
const hIndex = (row, col, N) => row * (N - 1) + col; // row: 0..N-1, col: 0..N-2
const vIndex = (row, col, N) => row * N + col;       // row: 0..N-2, col: 0..N-1
const boxIndex = (row, col, N) => row * (N - 1) + col;

export default function DotsAndBoxesGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // Palette
  const PLAYER = "#60A5FA"; // blue-400
  const PLAYER_GLOW = "rgba(96,165,250,0.75)";
  const AI = "#F87171"; // red-400
  const AI_GLOW = "rgba(248,113,113,0.75)";
  const TRACK = isDark ? "rgba(148,163,184,0.22)" : "rgba(71,85,105,0.20)";
  const DOT = isDark ? "#E5E7EB" : "#111827";
  const DOT_GLOW = isDark ? "rgba(236,253,245,0.22)" : "rgba(17,24,39,0.15)";
  const BOX_BG_YOU = "rgba(96,165,250,0.18)";
  const BOX_BG_AI = "rgba(248,113,113,0.18)";
  const BOX_BORDER_YOU = "rgba(96,165,250,0.9)";
  const BOX_BORDER_AI = "rgba(248,113,113,0.9)";

  // IDs & session
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);
  const gameIdRef = useRef(null);

  // achievements modal
  const [showAchievements, setShowAchievements] = useState(false);

  // Fonts
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // ---------- GAME STATE ----------
  const [gameState, setGameState] = useState("waiting"); // waiting | playing | gameover
  const [currentPlayer, setCurrentPlayer] = useState(1); // 1 = YOU, 2 = AI
  const [playerScore, setPlayerScore] = useState(0);
  const [aiScore, setAiScore] = useState(0);

  /** Lines store OWNER: 0 none, 1 player, 2 AI */
  const [horizontal, setHorizontal] = useState(Array(DOTS * (DOTS - 1)).fill(0));
  const [vertical, setVertical] = useState(Array((DOTS - 1) * DOTS).fill(0));

  /** Boxes store OWNER: 0 none, 1 player, 2 AI */
  const [boxes, setBoxes] = useState(Array((DOTS - 1) * (DOTS - 1)).fill(0));

  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [winStats, setWinStats] = useState({ wins: 0, losses: 0, draws: 0 });
  const [lastMove, setLastMove] = useState(null); // {type, index, player}
  const aiRunId = useRef(0);

  // Live preview segment (under finger)
  const [hoverSeg, setHoverSeg] = useState(null); // {type, index} | null

  // submit guard
  const submittedRef = useRef(false);

  // ---------- RUN SIGNALS (for achievements) ----------
  const linesDrawnRef = useRef(0);
  const turnsRef = useRef(0);
  const playerCurrentChainRef = useRef(0);
  const playerBestChainRef = useRef(0);
  const aiBestChainRef = useRef(0);
  const startedAtRef = useRef(Date.now());

  // keep ids and scores in refs so pushSignals can be stable
  const playerScoreRef = useRef(0);
  const aiScoreRef = useRef(0);
  useEffect(() => { playerScoreRef.current = playerScore; }, [playerScore]);
  useEffect(() => { aiScoreRef.current = aiScore; }, [aiScore]);
  useEffect(() => { gameIdRef.current = gameId; }, [gameId]);

  // STABLE: push live signals without changing identity (prevents focus reset)
  const pushSignals = useCallback(() => {
    if (!gameIdRef.current) return;
    gameTracker.updateGameData(gameIdRef.current, {
      player_boxes: playerScoreRef.current,
      ai_boxes: aiScoreRef.current,
      lines_drawn: linesDrawnRef.current,
      turns: turnsRef.current,
      longest_chain_player: playerBestChainRef.current,
      longest_chain_ai: aiBestChainRef.current,
      elapsed_seconds: Math.floor((Date.now() - startedAtRef.current) / 1000),
    });
  }, []);

  // Load player id
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

  // Load saved W/L/D
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("dots_and_boxes_stats");
        if (saved) setWinStats(JSON.parse(saved));
      } catch {}
    })();
  }, []);

  const saveStats = useCallback(async (stats) => {
    try { await AsyncStorage.setItem("dots_and_boxes_stats", JSON.stringify(stats)); } catch {}
  }, []);

  // Timer tick
  useEffect(() => {
    let interval;
    if (gameStarted && gameState === "playing") {
      interval = setInterval(() => setTimer((t) => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [gameStarted, gameState]);

  // ---------- LAYOUT ----------
  const boardOuter = Math.min(Math.max(screenWidth - 12, 380), 520);
  const pad = 18;
  const boardInner = boardOuter - pad * 2;
  const cell = boardInner / (DOTS - 1);
  const dot = 10;
  const line = 12;
  const track = 10;

  // Tolerances – a bit friendlier
  const AXIS_TOL = Math.min(30, Math.max(18, cell * 0.28));
  const DECISION_GAP = 8;

  // ---------- RULE HELPERS ----------
  const isBoxCompleted = useCallback((row, col, H, V) => {
    const top = H[hIndex(row, col, DOTS)] !== 0;
    const bottom = H[hIndex(row + 1, col, DOTS)] !== 0;
    const left = V[vIndex(row, col, DOTS)] !== 0;
    const right = V[vIndex(row, col + 1, DOTS)] !== 0;
    return top && bottom && left && right;
  }, []);

  const countNewlyCompletedByMove = useCallback((moveType, moveIndex, H, V) => {
    const newly = [];
    if (moveType === "horizontal") {
      const row = Math.floor(moveIndex / (DOTS - 1));
      const col = moveIndex % (DOTS - 1);
      if (row < DOTS - 1 && isBoxCompleted(row, col, H, V))
        newly.push({ index: boxIndex(row, col, DOTS) });
      if (row > 0 && isBoxCompleted(row - 1, col, H, V))
        newly.push({ index: boxIndex(row - 1, col, DOTS) });
    } else {
      const row = Math.floor(moveIndex / DOTS);
      const col = Math.floor(moveIndex % DOTS);
      if (col < DOTS - 1 && isBoxCompleted(row, col, H, V))
        newly.push({ index: boxIndex(row, col, DOTS) });
      if (col > 0 && isBoxCompleted(row, col - 1, H, V))
        newly.push({ index: boxIndex(row, col - 1, DOTS) });
    }
    return newly;
  }, [isBoxCompleted]);

  const createsThirdSideForAnyBox = useCallback((moveType, moveIndex, H, V) => {
    const H2 = [...H], V2 = [...V];
    if (moveType === "horizontal") H2[moveIndex] = 2; else V2[moveIndex] = 2;

    const sidesCount = (r, c) =>
      (H2[hIndex(r, c, DOTS)] ? 1 : 0) +
      (H2[hIndex(r + 1, c, DOTS)] ? 1 : 0) +
      (V2[vIndex(r, c, DOTS)] ? 1 : 0) +
      (V2[vIndex(r, c + 1, DOTS)] ? 1 : 0);

    if (moveType === "horizontal") {
      const row = Math.floor(moveIndex / (DOTS - 1));
      const col = Math.floor(moveIndex % (DOTS - 1));
      if (row < DOTS - 1 && boxes[boxIndex(row, col, DOTS)] === 0 && sidesCount(row, col) === 3) return true;
      if (row > 0 && boxes[boxIndex(row - 1, col, DOTS)] === 0 && sidesCount(row - 1, col) === 3) return true;
    } else {
      const row = Math.floor(moveIndex / DOTS);
      const col = Math.floor(moveIndex % DOTS);
      if (col < DOTS - 1 && boxes[boxIndex(row, col, DOTS)] === 0 && sidesCount(row, col) === 3) return true;
      if (col > 0 && boxes[boxIndex(row, col - 1, DOTS)] === 0 && sidesCount(row, col - 1) === 3) return true;
    }
    return false;
  }, [boxes]);

  // ---------- GAME CONTROL ----------
  const initializeGame = useCallback(() => {
    aiRunId.current++;
    submittedRef.current = false;
    setHorizontal(Array(DOTS * (DOTS - 1)).fill(0));
    setVertical(Array((DOTS - 1) * DOTS).fill(0));
    setBoxes(Array((DOTS - 1) * (DOTS - 1)).fill(0));
    setCurrentPlayer(1);
    setPlayerScore(0);
    setAiScore(0);
    setGameState("playing");
    setTimer(0);
    setGameStarted(true);
    setLastMove(null);
    setHoverSeg(null);

    // reset run signals
    linesDrawnRef.current = 0;
    turnsRef.current = 0;
    playerCurrentChainRef.current = 0;
    playerBestChainRef.current = 0;
    aiBestChainRef.current = 0;
    startedAtRef.current = Date.now();

    // write a clean slate to the session
    if (gameIdRef.current) {
      gameTracker.updateGameData(gameIdRef.current, {
        player_boxes: 0,
        ai_boxes: 0,
        lines_drawn: 0,
        turns: 0,
        longest_chain_player: 0,
        longest_chain_ai: 0,
        elapsed_seconds: 0,
      });
    }
  }, []);

  // Update match result in game_player_stats
  const updateMatchResult = useCallback(async (winner) => {
    if (!currentPlayerId || !gameId) return;
    const { data: row, error: selErr } = await supabase
      .from("game_player_stats")
      .select("id, player_wins, ai_wins, total_games")
      .eq("player_id", currentPlayerId)
      .eq("game_id", gameId)
      .maybeSingle();
    if (selErr) throw selErr;

    const incPlayer = winner === "Player" ? 1 : 0;
    const incAI = winner === "AI" ? 1 : 0;

    if (!row) {
      await supabase.from("game_player_stats").insert({
        player_id: currentPlayerId,
        game_id: gameId,
        player_wins: incPlayer,
        ai_wins: incAI,
        total_games: 1,
      });
    } else {
      await supabase
        .from("game_player_stats")
        .update({
          player_wins: (row.player_wins || 0) + incPlayer,
          ai_wins: (row.ai_wins || 0) + incAI,
          total_games: (row.total_games || 0) + 1,
        })
        .eq("id", row.id);
    }
  }, [currentPlayerId, gameId]);

  // End game (submit once)
  const endGame = useCallback(async (pScore, aScore) => {
    if (submittedRef.current) return;
    submittedRef.current = true;

    aiRunId.current++;
    setGameState("gameover");
    const next = { ...winStats };
    let title = "";
    let winner = "Draw";
    let playerWon = false;

    if (pScore > aScore) {
      next.wins++;
      title = "You won! 🏆";
      winner = "Player";
      playerWon = true;
    } else if (aScore > pScore) {
      next.losses++;
      title = "AI won! 🤖";
      winner = "AI";
    } else {
      next.draws++;
      title = "It's a draw! 🤝";
    }
    setWinStats(next);
    saveStats(next);

    const duration = Math.floor((Date.now() - startedAtRef.current) / 1000);
    const finalScore = pScore * 10 + (playerWon ? 20 : 0);

    try { await updateMatchResult(winner); } catch (e) { console.warn("Failed to update game_player_stats:", e); }

    // final push of run signals + summary
    if (gameIdRef.current) {
      try {
        gameTracker.updateGameData(gameIdRef.current, {
          player_boxes: pScore,
          ai_boxes: aScore,
          lines_drawn: linesDrawnRef.current,
          turns: turnsRef.current,
          longest_chain_player: playerBestChainRef.current,
          longest_chain_ai: aiBestChainRef.current,
          elapsed_seconds: duration,
          winner,
          player_won: playerWon,
          boxes_diff: pScore - aScore,
        });
        await gameTracker.endGame(gameIdRef.current, finalScore, { winner });
      } catch {}
    }

    Alert.alert(
      "Game Over!",
      `${title}\nYou: ${pScore} boxes\nAI: ${aScore} boxes`,
      [
        { text: "Play Again", onPress: () => { initializeGame(); } },
        { text: "Back to Hub", onPress: () => router.back() },
      ]
    );
  }, [winStats, saveStats, initializeGame, updateMatchResult]);

  const checkGameOverAndEnd = useCallback((B) => {
    const total = (DOTS - 1) * (DOTS - 1);
    const done = B.filter((b) => b !== 0).length;
    if (done === total) {
      const p = B.filter((b) => b === 1).length;
      const a = B.filter((b) => b === 2).length;
      endGame(p, a);
      return true;
    }
    return false;
  }, [endGame]);

  // ---------- SEGMENT PICKING ----------
  const pickSegment = useCallback((x, y) => {
    // x/y are already local to the inner board plane
    x = Math.max(0, Math.min(boardInner, x));
    y = Math.max(0, Math.min(boardInner, y));

    const r = Math.round(y / cell); // 0..DOTS-1
    const c = Math.round(x / cell); // 0..DOTS-1
    const yLine = r * cell;
    const xLine = c * cell;
    const hAxisDist = Math.abs(y - yLine);
    const vAxisDist = Math.abs(x - xLine);

    const canH = r >= 0 && r <= DOTS - 1 && hAxisDist <= AXIS_TOL;
    const canV = c >= 0 && c <= DOTS - 1 && vAxisDist <= AXIS_TOL;

    let chosen = null;
    if (canH && !canV) chosen = "H";
    else if (!canH && canV) chosen = "V";
    else if (canH && canV) {
      const gap = Math.abs(hAxisDist - vAxisDist);
      if (gap < DECISION_GAP) return null;
      chosen = hAxisDist < vAxisDist ? "H" : "V";
    } else return null;

    const EPS = 1e-6;

    if (chosen === "H") {
      const minX = dot / 2;
      const maxX = boardInner - dot / 2;
      if (x < minX || x > maxX) return null;
      const col = Math.min(Math.max(0, Math.floor((x - minX) / cell + EPS)), DOTS - 2);
      const idx = hIndex(r, col, DOTS);
      return { type: "horizontal", index: idx };
    } else {
      const minY = dot / 2;
      const maxY = boardInner - dot / 2;
      if (y < minY || y > maxY) return null;
      const row = Math.min(Math.max(0, Math.floor((y - minY) / cell + EPS)), DOTS - 2);
      const idx = vIndex(row, c, DOTS);
      return { type: "vertical", index: idx };
    }
  }, [cell, boardInner]);

  // ---------- AI MOVE ----------
  const makeAIMove = useCallback(() => {
    if (gameState !== "playing" || currentPlayer !== 2) return;

    const myRun = ++aiRunId.current;
    const think = async () => {
      await new Promise((r) => setTimeout(r, 500));
      if (aiRunId.current !== myRun) return;

      const H = [...horizontal];
      const V = [...vertical];

      const moves = [];
      H.forEach((d, i) => d === 0 && moves.push({ type: "horizontal", index: i }));
      V.forEach((d, i) => d === 0 && moves.push({ type: "vertical", index: i }));
      if (!moves.length) {
        const p = boxes.filter((b) => b === 1).length;
        const a = boxes.filter((b) => b === 2).length;
        endGame(p, a);
        return;
      }

      // Prefer finishing, else avoid 3rd side, else random
      let finishing = [], max = 0;
      for (const m of moves) {
        const H2 = [...H], V2 = [...V];
        if (m.type === "horizontal") H2[m.index] = 2; else V2[m.index] = 2;
        const done = countNewlyCompletedByMove(m.type, m.index, H2, V2).length;
        if (done > 0) {
          if (done > max) { max = done; finishing = [m]; }
          else if (done === max) finishing.push(m);
        }
      }
      let chosen;
      if (finishing.length) chosen = finishing[Math.floor(Math.random() * finishing.length)];
      else {
        const safe = moves.filter((m) => !createsThirdSideForAnyBox(m.type, m.index, H, V));
        const pool = safe.length ? safe : moves;
        chosen = pool[Math.floor(Math.random() * pool.length)];
      }

      const Hn = [...H];
      const Vn = [...V];
      if (chosen.type === "horizontal") Hn[chosen.index] = 2; else Vn[chosen.index] = 2;

      setLastMove({ type: chosen.type, index: chosen.index, player: 2 });
      setHorizontal(Hn);
      setVertical(Vn);

      // update lines drawn (AI also contributes)
      linesDrawnRef.current += 1;

      const gained = countNewlyCompletedByMove(chosen.type, chosen.index, Hn, Vn);
      if (gained.length) {
        const B = [...boxes];
        gained.forEach(({ index: bi }) => (B[bi] = 2));
        setBoxes(B);
        setAiScore((s) => s + gained.length);
        aiBestChainRef.current = Math.max(aiBestChainRef.current, gained.length);
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
        if (checkGameOverAndEnd(B)) return;
        await new Promise((r) => setTimeout(r, 350));
        if (aiRunId.current !== myRun) return;
        makeAIMove(); // keep AI turn
      } else {
        // AI turn ends -> increment turns & push signals
        turnsRef.current += 1;
        pushSignals();
        setCurrentPlayer(1);
      }
    };
    think();
  }, [gameState, currentPlayer, horizontal, vertical, boxes, countNewlyCompletedByMove, createsThirdSideForAnyBox, checkGameOverAndEnd, endGame, pushSignals]);

  useEffect(() => {
    if (currentPlayer === 2 && gameState === "playing") makeAIMove();
  }, [currentPlayer, gameState, makeAIMove]);

  // --------- FOCUS LIFECYCLE ----------
  useFocusEffect(
    useCallback(() => {
      let active = true;

      const start = async () => {
        if (!currentPlayerId) return;
        try {
          const id = await getGameId(GAME_TYPES.DOTS_AND_BOXES);
          if (!active) return;

          setGameId(id);
          await gameTracker.startGame(id, currentPlayerId);

          initializeGame();
        } catch (e) {
          console.warn("startGame failed:", e);
        }
      };

      start();

      // On blur/unmount: cancel if not submitted
      return () => {
        active = false;
        const gid = gameIdRef.current;
        if (gid && !submittedRef.current) {
          try {
            // mark as cancelled, push partial signals
            pushSignals();
            gameTracker.endGame(gid, 0, { cancelled: true, reason: "blur" });
          } catch {}
        }
      };
    }, [currentPlayerId]) // stable — won't re-run on score/signal pushes
  );

  // ---------- TOUCH: measure plane & convert to local ----------
  const planeRef = useRef(null);
  const getLocalXY = (evt, cb) => {
    const { pageX, pageY } = evt.nativeEvent;
    planeRef.current?.measure((x, y, w, h, px, py) => {
      const lx = Math.max(0, Math.min(w, pageX - px));
      const ly = Math.max(0, Math.min(h, pageY - py));
      cb(lx, ly);
    });
  };

  // ---------- RENDER ----------
  const formatTime = useCallback((s) => {
    const m = Math.floor(s / 60);
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }, []);

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, marginBottom: 16 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <TouchableOpacity
            onPress={() => {
              const gid = gameIdRef.current;
              if (gid && !submittedRef.current) {
                try {
                  pushSignals();
                  gameTracker.endGame(gid, 0, { cancelled: true, reason: "back" });
                } catch {}
              }
              router.back();
            }}
            style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.text }}>
            Dots & Boxes
          </Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* Achievements */}
            <TouchableOpacity
              onPress={() => { setShowAchievements(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <Trophy size={22} color={colors.text} />
            </TouchableOpacity>

            {/* Restart: end current session run cleanly, start fresh */}
            <TouchableOpacity
              onPress={async () => {
                const gid = gameIdRef.current;
                if (gid && !submittedRef.current) {
                  try { pushSignals(); await gameTracker.endGame(gid, 0, { reason: "restart" }); } catch {}
                }
                if (gameIdRef.current && currentPlayerId) {
                  await gameTracker.startGame(gameIdRef.current, currentPlayerId);
                }
                initializeGame();
              }}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <RotateCcw size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ borderRadius: 16, overflow: "hidden" }}>
          <BlurView
            intensity={isDark ? 60 : 80}
            tint={isDark ? "dark" : "light"}
            style={{
              backgroundColor: isDark ? "rgba(31,41,55,0.7)" : "rgba(255,255,255,0.7)",
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              padding: 14,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
                  You
                </Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: currentPlayer === 1 ? PLAYER : colors.text }}>
                  {playerScore}
                </Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
                  AI
                </Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: currentPlayer === 2 ? AI : colors.text }}>
                  {aiScore}
                </Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
                  Time
                </Text>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.gameAccent3 }}>
                  {formatTime(timer)}
                </Text>
              </View>
            </View>
          </BlurView>
        </View>
      </View>

      {/* Status */}
      <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {gameState === "playing" && currentPlayer === 1 && <User size={18} color={PLAYER} />}
          {gameState === "playing" && currentPlayer === 2 && <Bot size={18} color={AI} />}
          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 16, color: colors.text, textAlign: "center" }}>
            {gameState === "waiting" && "Tap 'New Game' to start!"}
            {gameState === "playing" && currentPlayer === 1 && "Your turn — tap near an edge"}
            {gameState === "playing" && currentPlayer === 2 && "AI is thinking..."}
            {gameState === "gameover" && "Game Over!"}
          </Text>
        </View>
      </View>

      {/* Board */}
      <View style={{ flex: 1, paddingHorizontal: 8, justifyContent: "center", alignItems: "center" }}>
        <BlurView
          intensity={isDark ? 50 : 80}
          tint={isDark ? "dark" : "light"}
          style={{
            width: boardOuter,
            height: boardOuter,
            borderRadius: 20,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
          }}
        >
          {/* Frame */}
          <View style={{ width: boardOuter, height: boardOuter }}>
            {/* INNER BOARD plane (no padding) */}
            <View
              ref={planeRef}
              style={{ position: "absolute", left: pad, top: pad, width: boardInner, height: boardInner }}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(e) => {
                if (gameState !== "playing" || currentPlayer !== 1) { setHoverSeg(null); return; }
                getLocalXY(e, (lx, ly) => {
                  const seg = pickSegment(lx, ly);
                  if (!seg) return setHoverSeg(null);
                  const drawn = seg.type === "horizontal" ? horizontal[seg.index] !== 0 : vertical[seg.index] !== 0;
                  setHoverSeg(drawn ? null : seg);
                });
              }}
              onResponderMove={(e) => {
                if (gameState !== "playing" || currentPlayer !== 1) { setHoverSeg(null); return; }
                getLocalXY(e, (lx, ly) => {
                  const seg = pickSegment(lx, ly);
                  if (!seg) return setHoverSeg(null);
                  const drawn = seg.type === "horizontal" ? horizontal[seg.index] !== 0 : vertical[seg.index] !== 0;
                  setHoverSeg(drawn ? null : seg);
                });
              }}
              onResponderRelease={(e) => {
                if (gameState !== "playing" || currentPlayer !== 1) { setHoverSeg(null); return; }

                // Recompute from release point; fallback to hoverSeg if finger lifted fast
                getLocalXY(e, (lx, ly) => {
                  const seg = pickSegment(lx, ly) || hoverSeg;
                  setHoverSeg(null);
                  if (!seg) return;

                  // already drawn?
                  if (
                    (seg.type === "horizontal" && horizontal[seg.index] !== 0) ||
                    (seg.type === "vertical" && vertical[seg.index] !== 0)
                  ) return;

                  const type = seg.type;
                  const index = seg.index;

                  const H = [...horizontal];
                  const V = [...vertical];
                  if (type === "horizontal") H[index] = 1; else V[index] = 1;

                  setLastMove({ type, index, player: 1 });
                  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}

                  // run signals
                  linesDrawnRef.current += 1;

                  const completed = countNewlyCompletedByMove(type, index, H, V);
                  setHorizontal(H);
                  setVertical(V);

                  if (completed.length > 0) {
                    const B = [...boxes];
                    completed.forEach(({ index: bi }) => (B[bi] = 1));
                    setBoxes(B);
                    setPlayerScore((s) => s + completed.length);

                    // chain tracking for player
                    playerCurrentChainRef.current += completed.length;
                    playerBestChainRef.current = Math.max(playerBestChainRef.current, playerCurrentChainRef.current);

                    try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
                    pushSignals();
                    if (checkGameOverAndEnd(B)) return; // keep turn if not over
                  } else {
                    // turn passes to AI
                    turnsRef.current += 1;
                    playerCurrentChainRef.current = 0; // reset chain when turn ends
                    pushSignals();
                    setCurrentPlayer(2);
                  }
                });
              }}
            >
              {/* DOTS */}
              {Array.from({ length: DOTS }).map((_, r) =>
                Array.from({ length: DOTS }).map((__, c) => (
                  <View
                    key={`dot-${r}-${c}`}
                    style={{
                      position: "absolute",
                      left: c * cell - dot / 2,
                      top: r * cell - dot / 2,
                      width: dot,
                      height: dot,
                      borderRadius: dot / 2,
                      backgroundColor: DOT,
                      shadowColor: DOT_GLOW,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 1,
                      shadowRadius: 5,
                      elevation: 2,
                    }}
                  />
                ))
              )}

              {/* HORIZONTAL tracks + lines */}
              {Array.from({ length: DOTS }).map((_, r) =>
                Array.from({ length: DOTS - 1 }).map((__, c) => {
                  const idx = hIndex(r, c, DOTS);
                  const owner = horizontal[idx];
                  const isLast = lastMove?.type === "horizontal" && lastMove?.index === idx;
                  const isHover = hoverSeg?.type === "horizontal" && hoverSeg?.index === idx;

                  return (
                    <View key={`h-${r}-${c}`} style={{ position: "absolute", left: c * cell + dot / 2, top: r * cell - line / 2 }}>
                      <View style={{ width: cell - dot, height: track, borderRadius: track / 2, backgroundColor: TRACK }} />
                      <View
                        style={{
                          position: "absolute",
                          top: (track - line) / 2,
                          width: cell - dot,
                          height: line,
                          borderRadius: line / 2,
                          backgroundColor: owner ? (owner === 1 ? PLAYER : AI) : isHover ? "rgba(96,165,250,0.22)" : "transparent",
                          shadowColor: isLast ? (owner === 1 ? PLAYER_GLOW : AI_GLOW) : "transparent",
                          shadowOpacity: isLast ? 0.9 : 0,
                          shadowRadius: isLast ? 6 : 0,
                        }}
                      />
                    </View>
                  );
                })
              )}

              {/* VERTICAL tracks + lines */}
              {Array.from({ length: DOTS - 1 }).map((_, r) =>
                Array.from({ length: DOTS }).map((__, c) => {
                  const idx = vIndex(r, c, DOTS);
                  const owner = vertical[idx];
                  const isLast = lastMove?.type === "vertical" && lastMove?.index === idx;
                  const isHover = hoverSeg?.type === "vertical" && hoverSeg?.index === idx;

                  return (
                    <View key={`v-${r}-${c}`} style={{ position: "absolute", left: c * cell - line / 2, top: r * cell + dot / 2 }}>
                      <View style={{ width: track, height: cell - dot, borderRadius: track / 2, backgroundColor: TRACK }} />
                      <View
                        style={{
                          position: "absolute",
                          left: (track - line) / 2,
                          width: line,
                          height: cell - dot,
                          borderRadius: line / 2,
                          backgroundColor: owner ? (owner === 1 ? PLAYER : AI) : isHover ? "rgba(96,165,250,0.22)" : "transparent",
                          shadowColor: isLast ? (owner === 1 ? PLAYER_GLOW : AI_GLOW) : "transparent",
                          shadowOpacity: isLast ? 0.9 : 0,
                          shadowRadius: isLast ? 6 : 0,
                        }}
                      />
                    </View>
                  );
                })
              )}

              {/* BOXES */}
              {Array.from({ length: DOTS - 1 }).map((_, r) =>
                Array.from({ length: DOTS - 1 }).map((__, c) => {
                  const bi = boxIndex(r, c, DOTS);
                  const owner = boxes[bi];
                  return (
                    <View
                      key={`box-${r}-${c}`}
                      style={{
                        position: "absolute",
                        left: c * cell + dot / 2 + line * 0.75,
                        top: r * cell + dot / 2 + line * 0.75,
                        width: cell - dot - line * 1.5,
                        height: cell - dot - line * 1.5,
                        borderRadius: 8,
                        justifyContent: "center",
                        alignItems: "center",
                        backgroundColor: owner === 1 ? BOX_BG_YOU : owner === 2 ? BOX_BG_AI : "transparent",
                        borderWidth: owner ? 1.5 : 0,
                        borderColor: owner === 1 ? BOX_BORDER_YOU : owner === 2 ? BOX_BORDER_AI : "transparent",
                      }}
                    >
                      {owner !== 0 && (
                        <LinearGradient
                          colors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0.04)", "transparent"]}
                          style={{
                            position: "absolute",
                            top: 0, left: 0, right: 0,
                            height: 14,
                            borderTopLeftRadius: 8,
                            borderTopRightRadius: 8,
                          }}
                        />
                      )}
                      {owner !== 0 && (
                        <View style={{ backgroundColor: owner === 1 ? PLAYER : AI, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 3, opacity: 0.95 }}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 11, color: "white" }}>
                            {owner === 1 ? "P" : "C"}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })
              )}

              {/* HOVER PREVIEW */}
              {hoverSeg && (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left:
                      hoverSeg.type === "horizontal"
                        ? (hoverSeg.index % (DOTS - 1)) * cell + dot / 2
                        : Math.floor(hoverSeg.index % DOTS) * cell - line / 2,
                    top:
                      hoverSeg.type === "horizontal"
                        ? Math.floor(hoverSeg.index / (DOTS - 1)) * cell - line / 2
                        : Math.floor(hoverSeg.index / DOTS) * cell + dot / 2,
                    width: hoverSeg.type === "horizontal" ? cell - dot : line,
                    height: hoverSeg.type === "horizontal" ? line : cell - dot,
                    borderRadius: line / 2,
                    backgroundColor: "rgba(96,165,250,0.22)",
                  }}
                />
              )}
            </View>
          </View>
        </BlurView>

        {/* Start + Record (kept) */}
        {gameState === "waiting" && (
          <>
            <TouchableOpacity
              onPress={initializeGame}
              style={{
                marginTop: 22,
                paddingHorizontal: 32,
                paddingVertical: 16,
                borderRadius: 16,
                backgroundColor: colors.gameAccent3,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <Play size={20} color="white" />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: "white" }}>
                New Game
              </Text>
            </TouchableOpacity>
            <View style={{ marginTop: 8 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.textSecondary }}>
                Record: {winStats.wins}W-{winStats.losses}L-{winStats.draws}D
              </Text>
            </View>
          </>
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
              intensity={isDark ? 70 : 90}
              tint={isDark ? "dark" : "light"}
              style={{
                flex: 1,
                borderRadius: 16,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: isDark ? "rgba(31,41,55,0.8)" : "rgba(255,255,255,0.85)",
              }}
            >
              {/* Header row */}
              <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: colors.text }}>
                  Dots & Boxes Achievements
                </Text>
                <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.textSecondary }}>
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
                    <Text style={{ color: colors.textSecondary, fontFamily: "Inter_500Medium", textAlign: "center" }}>
                      Loading achievements…
                    </Text>
                  </View>
                )}
              </ScrollView>
            </BlurView>
          </View>
        </View>
      </Modal>

      <View style={{ height: insets.bottom + 16 }} />
    </View>
  );
}
