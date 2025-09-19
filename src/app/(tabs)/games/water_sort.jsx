import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw } from "lucide-react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useTheme } from "../../../utils/theme";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";

export default function WaterSortGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // ---- Player & game ids ----
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);
  const gameIdRef = useRef(null);

  // ---- Code-Persistent run guards ----
  const activeRef = useRef(false);     // true when a run is active
  const submittedRef = useRef(false);  // true after endGame has been called once

  // ---- Persistent Level (per player) ----
  const [level, setLevel] = useState(1);
  const levelLoadedRef = useRef(false);

  // ---- Game state ----
  const [bottles, setBottles] = useState([]);
  const [selectedBottle, setSelectedBottle] = useState(null);
  const [moves, setMoves] = useState(0);
  const [gameWon, setGameWon] = useState(false);
  const [timer, setTimer] = useState(0);
  const [gameStarted, setGameStarted] = useState(false);

  // ---- Constants ----
  const BOTTLE_CAPACITY = 4;
  const waterColors = [
    "#FF0000","#00FF00","#0000FF","#FFFF00","#FF00FF",
    "#00FFFF","#FFA500","#800080","#FFC0CB","#A52A2A",
  ];

  // ======== PLAYER / GAME SETUP ========

  // Load player id
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        const pid = saved ? parseInt(saved, 10) : 1;
        if (mounted) setCurrentPlayerId(pid);
      } catch (e) {
        if (mounted) setCurrentPlayerId(1);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Resolve game id when we have player
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!currentPlayerId) return;
      const id = await getGameId(GAME_TYPES.WATER_SORT);
      if (mounted) {
        setGameId(id);
        gameIdRef.current = id;
      }
    })();
    return () => { mounted = false; };
  }, [currentPlayerId]);

  // Load persisted level once we know player id
  useEffect(() => {
    (async () => {
      if (!currentPlayerId || levelLoadedRef.current) return;
      try {
        const key = `water_sort_level_${currentPlayerId}`;
        const savedLevel = await AsyncStorage.getItem(key);
        if (savedLevel) setLevel(Math.max(1, parseInt(savedLevel, 10)));
      } catch (e) {}
      levelLoadedRef.current = true;
    })();
  }, [currentPlayerId]);

  // Persist level on change (per player)
  useEffect(() => {
    (async () => {
      if (!currentPlayerId) return;
      try {
        const key = `water_sort_level_${currentPlayerId}`;
        await AsyncStorage.setItem(key, String(level));
      } catch (e) {}
    })();
  }, [level, currentPlayerId]);

  // ======== CODE-PERSISTENT HELPERS ========

  const startRun = useCallback(async () => {
    if (!gameIdRef.current || !currentPlayerId) return;
    // If we somehow had a previous active run not submitted, end as 0 (counts as a play)
    if (activeRef.current && !submittedRef.current) {
      try { await gameTracker.endGame(gameIdRef.current, 0); } catch (e) {}
      submittedRef.current = true;
      activeRef.current = false;
    }
    try { await gameTracker.startGame(gameIdRef.current, currentPlayerId); } catch (e) {}
    submittedRef.current = false;
    activeRef.current = true;
  }, [currentPlayerId]);

  const endRunWith = useCallback(async (score) => {
    if (!gameIdRef.current) return;
    if (!activeRef.current || submittedRef.current) return;
    try { await gameTracker.endGame(gameIdRef.current, score); } catch (e) {}
    submittedRef.current = true;
    activeRef.current = false;
  }, []);

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


  useEffect(() => {
    return () => {
      // Unmount: if mid-run, count as play 0
      if (activeRef.current && !submittedRef.current && gameIdRef.current) {
        try { gameTracker.endGame(gameIdRef.current, 0); } catch (e) {}
        submittedRef.current = true;
        activeRef.current = false;
      }
    };
  }, []);

  // ======== GAME LOGIC ========

  // Timer
  useEffect(() => {
    let id;
    if (gameStarted && !gameWon) {
      id = setInterval(() => setTimer((t) => t + 1), 1000);
    }
    return () => { if (id) clearInterval(id); };
  }, [gameStarted, gameWon]);

  // Generate a puzzle for a given level
  const generatePuzzle = (levelNum) => {
    const numColors = Math.min(3 + Math.floor(levelNum / 2), 8); // 3..8
    const numBottles = numColors + 2; // two empties
    const puzzle = [];
    for (let i = 0; i < numBottles; i++) puzzle.push([]);

    const colorUnits = [];
    for (let c = 0; c < numColors; c++) {
      for (let k = 0; k < BOTTLE_CAPACITY; k++) colorUnits.push(c);
    }
    // shuffle
    for (let i = colorUnits.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = colorUnits[i];
      colorUnits[i] = colorUnits[j];
      colorUnits[j] = tmp;
    }
    // distribute into first (numBottles - 2) bottles
    let idx = 0;
    for (let b = 0; b < numBottles - 2; b++) {
      for (let s = 0; s < BOTTLE_CAPACITY; s++) {
        puzzle[b].push(colorUnits[idx++]);
      }
    }
    // last two are empty
    return puzzle;
  };

  const getTopConsecutiveUnits = (bottle) => {
    if (bottle.length === 0) return [];
    const top = bottle[bottle.length - 1];
    const buf = [];
    for (let i = bottle.length - 1; i >= 0; i--) {
      if (bottle[i] === top) buf.push(bottle[i]);
      else break;
    }
    return buf; // all same color from top
  };

  const canPour = (fromBottle, toBottle) => {
    if (fromBottle.length === 0) return false;
    const units = getTopConsecutiveUnits(fromBottle);
    if (units.length === 0) return false;
    if (toBottle.length === 0) return toBottle.length + units.length <= BOTTLE_CAPACITY;
    const toTop = toBottle[toBottle.length - 1];
    return units[0] === toTop && (toBottle.length + units.length <= BOTTLE_CAPACITY);
  };

  const checkWinCondition = (state) => {
    for (const bottle of state) {
      if (bottle.length === 0) continue;
      if (bottle.length !== BOTTLE_CAPACITY) return false;
      const first = bottle[0];
      for (let i = 1; i < bottle.length; i++) {
        if (bottle[i] !== first) return false;
      }
    }
    return true;
  };

  // Initialize a run
  const initializeGame = useCallback(async () => {
    await startRun(); // start tracking when a new run actually starts
    const newBottles = generatePuzzle(level);
    setBottles(newBottles);
    setSelectedBottle(null);
    setMoves(0);
    setGameWon(false);
    setTimer(0);
    setGameStarted(true);
  }, [level, startRun]);

  // Auto-init when level (persisted) is ready
  useEffect(() => {
    if (levelLoadedRef.current) {
      initializeGame();
    }
  }, [level, initializeGame]);

  const pourWater = (fromIndex, toIndex) => {
    const newBottles = bottles.slice();
    const fromBottle = newBottles[fromIndex].slice();
    const toBottle = newBottles[toIndex].slice();

    if (!canPour(fromBottle, toBottle)) return false;

    const units = getTopConsecutiveUnits(fromBottle);
    const space = BOTTLE_CAPACITY - toBottle.length;
    const toPour = Math.min(units.length, space);

    for (let i = 0; i < toPour; i++) fromBottle.pop();
    for (let i = 0; i < toPour; i++) toBottle.push(units[i]);

    newBottles[fromIndex] = fromBottle;
    newBottles[toIndex] = toBottle;

    setBottles(newBottles);
    setMoves((m) => m + 1);

    if (checkWinCondition(newBottles)) {
      setGameWon(true);
      const score = Math.max(100, 1000 - moves * 10 + level * 100 - timer);
      endRunWith(score); // submit once (win)
      Alert.alert(
        "Level Complete! 🎉",
        "Level " + level + " solved in " + (moves + 1) + " moves!\nScore: " + score,
        [
          {
            text: "Next Level",
            onPress: async () => {
              setLevel((prev) => prev + 1);
              setGameWon(false);
            },
          },
          { text: "Back to Hub", onPress: () => handleBack() },
        ]
      );
    }
    return true;
  };

  const handleBottlePress = async (i) => {
    if (gameWon) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    if (selectedBottle === null) {
      if (bottles[i] && bottles[i].length > 0) setSelectedBottle(i);
    } else {
      if (selectedBottle === i) {
        setSelectedBottle(null);
      } else {
        if (pourWater(selectedBottle, i)) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        }
        setSelectedBottle(null);
      }
    }
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ":" + s.toString().padStart(2, "0");
  };

  if (!levelLoadedRef.current) {
    // Lightweight splash while we load level & ids
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: isDark ? "#000" : "#fff" }}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <Text style={{ color: colors.text, fontSize: 16 }}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? "light" : "dark"} />

      <LinearGradient
        colors={
          isDark
            ? ["rgba(17, 24, 39, 1)", "rgba(31, 41, 55, 0.8)"]
            : ["rgba(6, 182, 212, 0.1)", "rgba(255, 255, 255, 0.9)"]
        }
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <TouchableOpacity
            onPress={handleBack}
            style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
          >
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: colors.text }}>
            Water Sort
          </Text>

          <TouchableOpacity
            onPress={async () => {
              // Reset mid-run counts as play 0, then start new run
              await endRunWith(0);
              initializeGame();
            }}
            style={{ padding: 8, borderRadius: 12, backgroundColor: colors.glassSecondary }}
          >
            <RotateCcw size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Stats */}
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
          <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: colors.textSecondary,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Level
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.gameAccent2 }}>
                {level}
              </Text>
            </View>

            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: colors.textSecondary,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Moves
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>
                {moves}
              </Text>
            </View>

            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  fontFamily: "Inter_500Medium",
                  fontSize: 12,
                  color: colors.textSecondary,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Time
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 18, color: colors.text }}>
                {formatTime(timer)}
              </Text>
            </View>
          </View>
        </BlurView>
      </View>

      {/* Board */}
      <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: "center", alignItems: "center" }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12, maxWidth: 300 }}>
          {bottles.map((bottle, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => handleBottlePress(index)}
              style={{
                width: 50,
                height: 140,
                backgroundColor: selectedBottle === index ? colors.gameAccent2 + "40" : colors.glassSecondary,
                borderRadius: 8,
                borderWidth: 2,
                borderColor: selectedBottle === index ? colors.gameAccent2 : colors.border,
                padding: 4,
                justifyContent: "flex-end",
                margin: 4,
              }}
            >
              {/* Empty slots */}
              {Array.from({ length: BOTTLE_CAPACITY - bottle.length }).map((_, emptyIndex) => (
                <View key={`empty-${emptyIndex}`} style={{ height: 28, backgroundColor: "transparent", marginTop: 1 }} />
              ))}

              {/* Filled slots (bottom-up) */}
              {bottle.map((colorIndex, i) => (
                <View
                  key={`water-${i}`}
                  style={{
                    height: 28,
                    backgroundColor: waterColors[colorIndex],
                    borderRadius: 3,
                    marginTop: 1,
                    borderWidth: 0.5,
                    borderColor: "rgba(0,0,0,0.1)",
                  }}
                />
              ))}
            </TouchableOpacity>
          ))}
        </View>

        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: "center",
            marginTop: 40,
            paddingHorizontal: 20,
          }}
        >
          Tap bottles to select and pour water. Sort all colors into separate bottles!
        </Text>
        <Text
          style={{
            fontFamily: "Inter_400Regular",
            fontSize: 12,
            color: colors.textSecondary,
            textAlign: "center",
            marginTop: 8,
            paddingHorizontal: 20,
          }}
        >
          Consecutive same colors pour together from the TOP.
        </Text>
      </View>
    </View>
  );
}
