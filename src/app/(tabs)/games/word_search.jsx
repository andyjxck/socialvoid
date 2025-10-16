// mobile/src/app/games/WordSearchGame.jsx
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  BackHandler,
  Modal,
} from "react-native";
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
import NightSkyBackground from "../../../components/NightSkyBackground";
import AchievementsSection from "../../../components/AchievementsSection";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { supabase } from "../../../utils/supabase";

// ✅ Shared dictionary (filtered to 4..GRID_SIZE, A–Z uppercase)
import { WORD_DICTIONARY } from "../../../utils/puzzle_wheel/dictionary";

export default function WordSearchGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // ── IDs
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);
  const gameIdRef = useRef(null);

  // tracker run guards
  const activeRef = useRef(false);
  const submittedRef = useRef(false);

  // 🏆 Achievements UI
  const [showAchievements, setShowAchievements] = useState(false);

  // Load player id once
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        const pid = saved ? parseInt(saved, 10) : 1;
        if (mounted) setCurrentPlayerId(Number.isFinite(pid) ? pid : 1);
      } catch {
        if (mounted) setCurrentPlayerId(1);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Resolve numeric game id and start tracker run (only after player id is ready)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!currentPlayerId) return; // wait
      try {
        const id = await getGameId(GAME_TYPES.WORD_SEARCH); // must be numeric
        if (!mounted || !Number.isFinite(id)) return;

        setGameId(id);
        gameIdRef.current = id;

        // start tracking once per mount
        try {
          await gameTracker.startGame(id, currentPlayerId);
          activeRef.current = true;
          submittedRef.current = false;
        } catch {}
      } catch {}
    })();

    // On unmount, if still active and not submitted, end with partial score (0)
    return () => {
      mounted = false;
      if (gameIdRef.current && activeRef.current && !submittedRef.current) {
        try { gameTracker.endGame(gameIdRef.current, 0, { cancelled: true, reason: "unmount" }); } catch {}
        submittedRef.current = true;
        activeRef.current = false;
      }
    };
  }, [currentPlayerId]);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // ── GAME STATE
  const [grid, setGrid] = useState([]);
  const [wordsToFind, setWordsToFind] = useState([]);
  const [foundWords, setFoundWords] = useState([]);
  const [selectedCells, setSelectedCells] = useState([]);
  const [startCell, setStartCell] = useState(null);
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);
  const [gameCompleted, setGameCompleted] = useState(false);
  const [placedWords, setPlacedWords] = useState([]);

  const GRID_SIZE = 12;
  const sessionStartRef = useRef(null);

  // ✅ Cleaned dictionary for Word Search
  const WORD_BANK = useMemo(() => {
    const maxLen = GRID_SIZE;
    const cleaned = Array.from(WORD_DICTIONARY || [])
      .map(w => String(w || "").trim())
      .filter(w => /^[A-Za-z]+$/.test(w))
      .map(w => w.toUpperCase())
      .filter(w => w.length >= 4 && w.length <= maxLen);
    return Array.from(new Set(cleaned));
  }, []);

  // ── persistence helpers (Supabase – independent of tracker)
  const insertGameSession = useCallback(
    async ({ startMs, endMs, finalScore, result }) => {
      if (!currentPlayerId || !gameIdRef.current) return;
      const startIso = new Date(startMs || Date.now()).toISOString();
      const endIso = new Date(endMs || Date.now()).toISOString();
      const duration = Math.max(0, Math.floor(((endMs || Date.now()) - (startMs || Date.now())) / 1000));
      try {
        await supabase.from("game_sessions").insert({
          player_id: currentPlayerId,
          game_id: gameIdRef.current,
          start_time: startIso,
          end_time: endIso,
          duration,
          score: Number(finalScore || 0),
          meta: { result },
        });
      } catch {}
    },
    [currentPlayerId]
  );

  const updateBestTimeIfBetter = useCallback(
    async (newTimeSeconds) => {
      if (!currentPlayerId || !gameIdRef.current) return;
      try {
        const { data, error } = await supabase
          .from("player_game_stats")
          .select("best_time")
          .eq("player_id", currentPlayerId)
          .eq("game_id", gameIdRef.current)
          .maybeSingle();
        if (error) throw error;
        const current = data?.best_time ?? null;
        if (current == null || Number(newTimeSeconds) < Number(current)) {
          await supabase.from("player_game_stats").upsert({
            player_id: currentPlayerId,
            game_id: gameIdRef.current,
            best_time: Number(newTimeSeconds),
          });
        }
      } catch {}
    },
    [currentPlayerId]
  );

  // ── grid generation
  const randLetter = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const canPlaceWord = (grid, word, row, col, dir) => {
    const dirs = { horizontal: [0,1], vertical: [1,0], diagonal: [1,1], diagonalUp: [-1,1] };
    const [dr, dc] = dirs[dir];
    for (let i = 0; i < word.length; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
      if (grid[r][c] !== null && grid[r][c] !== word[i]) return false;
    }
    return true;
  };
  const placeWord = (grid, word, row, col, dir) => {
    const dirs = { horizontal: [0,1], vertical: [1,0], diagonal: [1,1], diagonalUp: [-1,1] };
    const [dr, dc] = dirs[dir];
    const data = { word, cells: [] };
    for (let i = 0; i < word.length; i++) {
      const r = row + dr * i, c = col + dc * i;
      grid[r][c] = word[i];
      data.cells.push({ row: r, col: c });
    }
    return data;
  };
  const createWordSearchGrid = (selected) => {
    const grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    const placed = [];
    const dirs = ["horizontal","vertical","diagonal","diagonalUp"];
    const sorted = [...selected].sort((a,b) => b.length - a.length);

    sorted.forEach((word) => {
      let ok = false, tries = 0;
      while (!ok && tries < 500) {
        const d = dirs[Math.floor(Math.random()*dirs.length)];
        const r = Math.floor(Math.random()*GRID_SIZE);
        const c = Math.floor(Math.random()*GRID_SIZE);
        if (canPlaceWord(grid, word, r, c, d)) {
          placed.push(placeWord(grid, word, r, c, d));
          ok = true;
        }
        tries++;
      }
      if (!ok) {
        for (let d of dirs) {
          for (let r = 0; r < GRID_SIZE && !ok; r++) {
            for (let c = 0; c < GRID_SIZE && !ok; c++) {
              if (canPlaceWord(grid, word, r, c, d)) {
                placed.push(placeWord(grid, word, r, c, d));
                ok = true;
              }
            }
          }
        }
      }
    });

    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (grid[r][c] === null) grid[r][c] = randLetter();
      }
    }
    return { grid, placedWordsData: placed, actuallyPlacedWords: placed.map(p => p.word) };
  };

  const initializeGame = useCallback(() => {
    const count = 8 + Math.floor(Math.random() * 5);
    const shuffled = [...WORD_BANK].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);

    const { grid: ng, placedWordsData, actuallyPlacedWords } = createWordSearchGrid(selected);
    setGrid(ng);
    setWordsToFind(actuallyPlacedWords);
    setPlacedWords(placedWordsData);
    setFoundWords([]);
    setSelectedCells([]);
    setStartCell(null);
    setTimer(0);
    setGameStarted(false);
    setGameCompleted(false);
    sessionStartRef.current = null;
  }, [WORD_BANK]);

  // timer (paused while achievements are open)
  useEffect(() => {
    let id;
    if (gameStarted && !gameCompleted && !showAchievements) {
      id = setInterval(() => setTimer(t => t + 1), 1000);
    }
    return () => clearInterval(id);
  }, [gameStarted, gameCompleted, showAchievements]);

  // back → end tracker session with 0
  const handleExitToHub = useCallback(() => {
    const startMs = sessionStartRef.current || Date.now();
    const endMs = Date.now();

    insertGameSession({
      startMs,
      endMs,
      finalScore: foundWords.length * 100 || 0,
      result: "loss",
    });

    if (gameIdRef.current && activeRef.current && !submittedRef.current) {
      try { gameTracker.endGame(gameIdRef.current, 0, { cancelled: true, reason: "back" }); } catch {}
      submittedRef.current = true;
      activeRef.current = false;
    }

    router.back();
    return true;
  }, [foundWords.length, insertGameSession]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", handleExitToHub);
    return () => sub.remove();
  }, [handleExitToHub]);

  // taps
  const handleCellPress = async (row, col) => {
    if (!gameStarted) {
      setGameStarted(true);
      sessionStartRef.current = Date.now();
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    const key = `${row}-${col}`;

    if (!startCell) {
      setStartCell({ row, col });
      setSelectedCells([key]);
      return;
    }

    if (startCell.row === row && startCell.col === col) {
      setStartCell(null);
      setSelectedCells([]);
      return;
    }

    const path = getSelectionPath(startCell.row, startCell.col, row, col);
    if (path.length < 3) {
      setSelectedCells([]);
      setStartCell(null);
      return;
    }

    const letters = path.map(k => {
      const [r, c] = k.split("-").map(Number);
      return grid[r][c];
    }).join("");
    const rev = letters.split("").reverse().join("");

    const found = wordsToFind.find(w => (w === letters || w === rev) && !foundWords.includes(w));

    if (found) {
      const updated = [...foundWords, found];
      setFoundWords(updated);
      setSelectedCells([]);
      setStartCell(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      // all found → WIN
      if (updated.length === wordsToFind.length) {
        setGameCompleted(true);

        const score = Math.max(100, 1000 - timer * 2 + foundWords.length * 50);

        const startMs = sessionStartRef.current || Date.now();
        const endMs = Date.now();
        insertGameSession({ startMs, endMs, finalScore: score, result: "win" });
        updateBestTimeIfBetter(timer);

        if (gameIdRef.current && activeRef.current && !submittedRef.current) {
          try { await gameTracker.endGame(gameIdRef.current, score); } catch {}
          submittedRef.current = true;
          activeRef.current = false;
        }
      }
    } else {
      setSelectedCells(path);
      setTimeout(() => {
        setSelectedCells([]);
        setStartCell(null);
      }, 1000);
    }
  };

  const getSelectionPath = (sr, sc, er, ec) => {
    const path = [];
    const dr = er - sr;
    const dc = ec - sc;

    if (dr === 0) {
      const step = dc > 0 ? 1 : -1;
      for (let c = sc; c !== ec + step; c += step) path.push(`${sr}-${c}`);
    } else if (dc === 0) {
      const step = dr > 0 ? 1 : -1;
      for (let r = sr; r !== er + step; r += step) path.push(`${r}-${sc}`);
    } else if (Math.abs(dr) === Math.abs(dc)) {
      const rs = dr > 0 ? 1 : -1;
      const cs = dc > 0 ? 1 : -1;
      const len = Math.abs(dr);
      for (let i = 0; i <= len; i++) path.push(`${sr + i * rs}-${sc + i * cs}`);
    }
    return path;
  };

  const getCellBackground = (row, col) => {
    const key = `${row}-${col}`;
    if (selectedCells.includes(key)) return colors.gameAccent10 + "60";
    const partOfFound = placedWords.some(
      w => foundWords.includes(w.word) && w.cells.some((c) => c.row === row && c.col === col)
    );
    if (partOfFound) return "#FFB3B3";
    return colors.gameCard10;
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  if (!fontsLoaded) return null;

  // ── UI
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <NightSkyBackground />

      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <TouchableOpacity
            onPress={handleExitToHub}
            style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.text }}>
            Word Search
          </Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            {/* 🏆 Achievements button */}
            <TouchableOpacity
              onPress={() => setShowAchievements(true)}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <Trophy size={22} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={initializeGame}
              style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
            >
              <RotateCcw size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <BlurView
          intensity={isDark ? 60 : 80}
          tint={isDark ? "dark" : "light"}
          style={{
            backgroundColor: isDark ? "rgba(31, 41, 55, 0.7)" : "rgba(255, 255, 255, 0.7)",
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 16,
            padding: 16,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                Found
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.gameAccent10 }}>
                {foundWords.length}/{wordsToFind.length}
              </Text>
            </View>

            <View style={{ alignItems: "center" }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                Time
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>
                {formatTime(timer)}
              </Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 120 }} contentContainerStyle={{ paddingBottom: 8 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, width: "100%", justifyContent: "flex-start" }}>
              {wordsToFind.map((word) => (
                <View
                  key={word}
                  style={{
                    backgroundColor: foundWords.includes(word) ? "#FFB3B3" : "transparent",
                    paddingHorizontal: foundWords.includes(word) ? 8 : 0,
                    paddingVertical: foundWords.includes(word) ? 4 : 0,
                    borderRadius: foundWords.includes(word) ? 8 : 0,
                    marginBottom: 4,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 12,
                      color: foundWords.includes(word) ? "#333333" : colors.text,
                      opacity: foundWords.includes(word) ? 0.8 : 1,
                    }}
                  >
                    {word}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </BlurView>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: "center" }}>
        <View
          style={{
            width: Dimensions.get("window").width - 40,
            height: Dimensions.get("window").width - 40,
            backgroundColor: colors.glassSecondary,
            borderRadius: 12,
            padding: 4,
            alignSelf: "center",
          }}
        >
          {grid.map((row, r) => (
            <View key={r} style={{ flexDirection: "row", flex: 1 }}>
              {row.map((letter, c) => (
                <TouchableOpacity
                  key={`${r}-${c}`}
                  onPress={() => handleCellPress(r, c)}
                  style={{
                    flex: 1,
                    backgroundColor: getCellBackground(r, c),
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 0.5,
                    borderColor: colors.overlay,
                    margin: 0.5,
                  }}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: colors.text }}>
                    {letter}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: "center",
            marginTop: 20,
            paddingHorizontal: 20,
          }}
        >
          Tap the first letter, then tap the last letter of each word to select it!
        </Text>
      </View>

      {gameCompleted && (
        <View
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View style={{ borderRadius: 20, overflow: "hidden", margin: 20 }}>
            <BlurView
              intensity={isDark ? 80 : 100}
              tint={isDark ? "dark" : "light"}
              style={{
                backgroundColor: isDark ? "rgba(31, 41, 55, 0.9)" : "rgba(255, 255, 255, 0.9)",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 20,
                padding: 32,
                alignItems: "center",
              }}
            >
              <Trophy size={48} color={colors.gameAccent10} style={{ marginBottom: 16 }} />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: colors.text, textAlign: "center", marginBottom: 8 }}>
                All Words Found!
              </Text>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 14, color: colors.textSecondary, marginBottom: 20, textAlign: "center" }}>
                Time: {formatTime(timer)} | Words: {foundWords.length}
              </Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  onPress={initializeGame}
                  style={{ backgroundColor: colors.secondaryButton, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.secondaryButtonText }}>
                    Play Again
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleExitToHub}
                  style={{ backgroundColor: colors.primaryButton, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 }}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: colors.primaryButtonText }}>
                    Back to Hub
                  </Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </View>
      )}

      {/* 🏆 Achievements Modal */}
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
              <Text style={{ fontWeight: "700", fontSize: 16, color: "#fff" }}>
                Word Search Achievements
              </Text>
              <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
                <Text style={{ fontWeight: "600", fontSize: 14, color: "rgba(255,255,255,0.75)" }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 12 }}>
              {currentPlayerId != null && gameIdRef.current != null ? (
                <AchievementsSection
                  key={`${gameIdRef.current}-${currentPlayerId}`}
                  playerId={currentPlayerId}
                  gameId={gameIdRef.current}
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
