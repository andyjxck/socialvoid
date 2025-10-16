// mobile/src/app/games/HangmanGame.jsx  (REPLACE ENTIRE FILE)
import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, RotateCcw, HelpCircle, Trophy, Skull, Swords } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useIsFocused, useFocusEffect } from "@react-navigation/native";

import { useTheme } from "../../../utils/theme";
import NightSkyBackground from "../../../components/NightSkyBackground";
import AchievementsSection from "../../../components/AchievementsSection";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import { WORD_DICTIONARY } from "../../../utils/puzzle_wheel/dictionary";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const MAX_WRONG = 6;

export default function HangmanGame() {
  const { colors, getCategoryColors } = useTheme();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const cat = getCategoryColors("hangman");
  const primary = cat.primary || "#22D3EE";

  // ---- Tracking IDs (numeric only) ----
  const [playerId, setPlayerId] = useState(null);
  const [gameTypeId, setGameTypeId] = useState(null); // numeric or null

  // ---- Run/session refs ----
  const runIdRef = useRef(null);
  const startTimeRef = useRef(0);
  const startedRef = useRef(false);
  const submittedRef = useRef(false);

  // ---- Gameplay state ----
  const [dictionary, setDictionary] = useState([]);
  const [secretWord, setSecretWord] = useState("");
  const [revealed, setRevealed] = useState([]);
  const [guessed, setGuessed] = useState(new Set());
  const [wrongCount, setWrongCount] = useState(0);
  const [score, setScore] = useState(0);

  // UI state
  const [gameActive, setGameActive] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [isWin, setIsWin] = useState(false);
  const [bestScore, setBestScore] = useState(null);
  const [showAchievements, setShowAchievements] = useState(false);

  // anim
  const shakeAnim = useRef(new Animated.Value(0)).current;

  // ---------- STABLE REFS FOR CHANGING VALUES ----------
  const scoreRef = useRef(0);
  const isWinRef = useRef(false);
  const secretWordRef = useRef("");
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { isWinRef.current = isWin; }, [isWin]);
  useEffect(() => { secretWordRef.current = secretWord; }, [secretWord]);

  // Also keep stable refs to functions we need in focus cleanup
  const initializeBoardRef = useRef(null);
  const endRunRef = useRef(null);

  /* ---------- helpers ---------- */
  const loadBest = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem("hangman_best_score");
      if (saved) setBestScore(parseInt(saved, 10));
    } catch {}
  }, []);

  const saveBestIfNeeded = useCallback(
    async (finalScore) => {
      try {
        if (bestScore == null || finalScore > bestScore) {
          setBestScore(finalScore);
          await AsyncStorage.setItem("hangman_best_score", String(finalScore));
        }
      } catch {}
    },
    [bestScore]
  );

  const loadDictionary = useCallback(() => {
    try {
      const base = Array.from(WORD_DICTIONARY || []);
      return base
        .map((w) => String(w || "").trim().toLowerCase())
        .filter((w) => /^[a-z]+$/.test(w) && w.length >= 5 && w.length <= 10);
    } catch {
      return [];
    }
  }, []);

  const pickRandomWord = useCallback((dict) => {
    if (!dict || dict.length === 0) return "react";
    const i = Math.floor(Math.random() * dict.length);
    return dict[i];
  }, []);

  const maskWord = useCallback((word, guessedSet) => {
    return word.split("").map((ch) => (guessedSet.has(ch.toUpperCase()) ? ch : "_"));
  }, []);

  const computeScore = useCallback((prevScore, correctHit, _wrongs, finishedWin) => {
    let s = prevScore + (correctHit ? 5 : 0) - (!correctHit ? 12 : 0);
    if (finishedWin) s += 50;
    if (s < 0) s = 0;
    return s;
  }, []);

  const vibrateShake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -12, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 40, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  /* ---------- IDs (numeric only) ---------- */
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        const pid = saved ? parseInt(saved, 10) : 1;
        setPlayerId(Number.isFinite(pid) ? pid : 1);
      } catch {
        setPlayerId(1);
      }
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!playerId) return;
      try {
        const id = await getGameId(GAME_TYPES.HANGMAN);
        const numericId = Number(id);
        if (alive && Number.isFinite(numericId)) {
          setGameTypeId(numericId);
        } else if (alive) {
          setGameTypeId(null);
        }
      } catch {
        if (alive) setGameTypeId(null);
      }
    })();
    return () => { alive = false; };
  }, [playerId]);

  /* ---------- Board init (fresh round) ---------- */
  const initializeBoard = useCallback((dictIn) => {
    const dict = (dictIn && dictIn.length) ? dictIn : (dictionary.length ? dictionary : loadDictionary());
    const word = pickRandomWord(dict);
    const initialGuessed = new Set();
    setDictionary(dict);
    setSecretWord(word);
    setGuessed(initialGuessed);
    setRevealed(maskWord(word, initialGuessed));
    setWrongCount(0);
    setScore(0);
    setIsWin(false);
    setShowResult(false);
    setGameActive(true);
  }, [dictionary, loadDictionary, maskWord, pickRandomWord]);
  useEffect(() => { initializeBoardRef.current = initializeBoard; }, [initializeBoard]);

  // 🔧 GUARANTEE a word is chosen immediately on first mount
  useEffect(() => {
    if (!secretWordRef.current) {
      initializeBoard();
    }
  }, [initializeBoard]);

  /* ---------- Live signals ---------- */
  const pushSignals = useCallback((extra = {}) => {
    const rid = runIdRef.current;
    if (!rid) return;
    const lettersRevealed = revealed.filter((c) => c !== "_").length;
    const guessesTotal = guessed.size;
    gameTracker.updateGameData(rid, {
      elapsed_seconds: Math.floor((Date.now() - startTimeRef.current) / 1000),
      wrong_count: wrongCount,
      letters_revealed: lettersRevealed,
      word_length: secretWord ? secretWord.length : 0,
      guesses_total: guessesTotal,
      score,
      ...extra,
    });
  }, [revealed, guessed, wrongCount, secretWord, score]);

  /* ---------- Start/End run ---------- */
  const startRun = useCallback(async () => {
    if (startedRef.current || !playerId || !gameTypeId) return;

    // Ensure there is a board, even if IDs came late
    if (!secretWordRef.current) {
      initializeBoardRef.current?.();
    }

    try {
      const rid = await gameTracker.startGame(gameTypeId, playerId);
      const numericRid = Number(rid);
      runIdRef.current = Number.isFinite(numericRid) ? numericRid : gameTypeId;
      startTimeRef.current = Date.now();
      submittedRef.current = false;
      startedRef.current = true;
      pushSignals();
    } catch {
      startedRef.current = false;
      runIdRef.current = null;
    }
  }, [playerId, gameTypeId, pushSignals]);

  // ✅ SAFE endRun: uses provided score if finite, else latest ref
  const endRun = useCallback(async (reason, extra = {}) => {
    if (!startedRef.current) return;
    const rid = runIdRef.current;
    if (!rid || submittedRef.current) {
      startedRef.current = false;
      runIdRef.current = null;
      return;
    }

    const provided = Number.isFinite(extra?.score) ? Number(extra.score) : null;
    const finalScore = provided ?? (Number.isFinite(scoreRef.current) ? scoreRef.current : 0);

    submittedRef.current = true;
    startedRef.current = false;
    const durationMs = Math.max(0, Date.now() - startTimeRef.current);

    const meta = {
      durationMs,
      reason,
      result: extra?.result,
      word_length: secretWordRef.current ? secretWordRef.current.length : 0,
      wrong_count: wrongCount,
      guesses_total: guessed.size,
      letters_revealed: revealed.filter((c) => c !== "_").length,
    };

    try {
      console.log("➡️ Submitting persistent stats", { gameId: rid, playerId, score: finalScore, reason });
      await gameTracker.endGame(rid, finalScore, meta);
      console.log("✅ Session + persistent stats recorded");
    } catch (e) {
      console.warn("endRun failed:", e);
    } finally {
      runIdRef.current = null;
    }
  }, [wrongCount, guessed, revealed, playerId]);
  useEffect(() => { endRunRef.current = endRun; }, [endRun]);

  /* ---------- Focus handling ---------- */
  // Start tracking when focused + ids ready
  useEffect(() => {
    if (isFocused && playerId) {
      startRun();
      loadBest().catch(() => {});
    }
  }, [isFocused, playerId, startRun, loadBest]);

  // Keep cleanup minimal; don’t wipe UI here (avoids timing/stomp issues)
  useFocusEffect(
    useCallback(() => {
      // (board already guaranteed by mount effect)
      return () => {
        endRunRef.current?.("blur", {
          score: scoreRef.current,
          result: isWinRef.current ? "win" : "loss",
        });
      };
    }, [])
  );

  /* ---------- Game actions ---------- */
  const submitResult = useCallback(
    (finalScore, didWin) => {
      const safeScore = Number.isFinite(finalScore)
        ? Number(finalScore)
        : (Number.isFinite(scoreRef.current) ? scoreRef.current : 0);

      endRun(didWin ? "game_over_win" : "game_over_loss", {
        result: didWin ? "win" : "loss",
        score: safeScore,
      });
      saveBestIfNeeded(safeScore);
    },
    [endRun, saveBestIfNeeded]
  );

  const finishRound = useCallback(
    async (didWin, finalScore) => {
      setGameActive(false);
      setIsWin(didWin);
      try {
        Haptics.notificationAsync(
          didWin ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
        );
      } catch {}
      setShowResult(true);
      submitResult(finalScore, didWin);
    },
    [submitResult]
  );

  const onGuess = useCallback(
    (letterRaw) => {
      if (!gameActive || !secretWord) return;
      const letter = letterRaw.toUpperCase();
      if (guessed.has(letter)) return;

      const nextGuessed = new Set(guessed);
      nextGuessed.add(letter);

      const inWord = secretWord.toUpperCase().includes(letter);

      if (inWord) {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
        const newRevealed = maskWord(secretWord, nextGuessed);
        const allRevealed = newRevealed.every((c) => c !== "_");
        const newScore = computeScore(score, true, wrongCount, allRevealed);

        setScore(newScore);
        setGuessed(nextGuessed);
        setRevealed(newRevealed);
        pushSignals();

        if (allRevealed) {
          finishRound(true, newScore);
        }
      } else {
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
        vibrateShake();

        const wc = wrongCount + 1;
        const newScore = computeScore(score, false, wc, false);

        setWrongCount(wc);
        setScore(newScore);
        setGuessed(nextGuessed);
        pushSignals();

        if (wc >= MAX_WRONG) {
          finishRound(false, newScore);
        }
      }
    },
    [gameActive, secretWord, guessed, score, wrongCount, maskWord, computeScore, finishRound, vibrateShake, pushSignals]
  );

  const handleBack = useCallback(async () => {
    await endRun("back", { score: scoreRef.current, result: isWinRef.current ? "win" : "loss" });
    router.back();
  }, [endRun]);

  const resetGame = useCallback(async () => {
    try { await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); } catch {}
    await endRun("reset", { score: scoreRef.current, result: isWinRef.current ? "win" : "loss" });

    // Fresh board immediately
    setGameActive(false);
    setSecretWord("");
    setGuessed(new Set());
    setRevealed([]);
    setWrongCount(0);
    setScore(0);
    setShowResult(false);
    setIsWin(false);

    initializeBoard();

    // Start a new tracked run if IDs ready (Replay → new session)
    if (playerId && gameTypeId) {
      try {
        const rid = await gameTracker.startGame(gameTypeId, playerId);
        const numericRid = Number(rid);
        runIdRef.current = Number.isFinite(numericRid) ? numericRid : gameTypeId;
        startTimeRef.current = Date.now();
        submittedRef.current = false;
        startedRef.current = true;
        pushSignals();
      } catch {
        startedRef.current = false;
        runIdRef.current = null;
      }
    }
  }, [endRun, initializeBoard, playerId, gameTypeId, pushSignals]);

  /* ---------- UI pieces ---------- */
  const Gallows = ({ wrong }) => {
    const bar = { backgroundColor: colors.border };
    const man = { backgroundColor: primary };
    return (
      <View style={{ width: 220, height: 200, alignSelf: "center", marginBottom: 16 }}>
        <View style={[{ position: "absolute", bottom: 0, left: 10, width: 120, height: 8, borderRadius: 4 }, bar]} />
        <View style={[{ position: "absolute", bottom: 8, left: 20, width: 8, height: 150, borderRadius: 4 }, bar]} />
        <View style={[{ position: "absolute", bottom: 158, left: 20, width: 130, height: 8, borderRadius: 4 }, bar]} />
        <View style={[{ position: "absolute", bottom: 158, left: 142, width: 3, height: 22, borderRadius: 2 }, bar]} />
        {wrong >= 1 && (
          <View
            style={{
              position: "absolute",
              bottom: 130,
              left: 131,
              width: 26,
              height: 26,
              borderRadius: 13,
              borderWidth: 3,
              borderColor: primary,
              backgroundColor: colors.glassSecondary,
            }}
          />
        )}
        {wrong >= 2 && <View style={[{ position: "absolute", bottom: 100, left: 143, width: 3, height: 32, borderRadius: 2 }, man]} />}
        {wrong >= 3 && <View style={[{ position: "absolute", bottom: 118, left: 143, width: 30, height: 3, borderRadius: 2 }, man, { transform: [{ rotate: "25deg" }]}]} />}
        {wrong >= 4 && <View style={[{ position: "absolute", bottom: 118, left: 116, width: 30, height: 3, borderRadius: 2 }, man, { transform: [{ rotate: "-25deg" }]}]} />}
        {wrong >= 5 && <View style={[{ position: "absolute", bottom: 84, left: 143, width: 30, height: 3, borderRadius: 2 }, man, { transform: [{ rotate: "55deg" }]}]} />}
        {wrong >= 6 && <View style={[{ position: "absolute", bottom: 84, left: 116, width: 30, height: 3, borderRadius: 2 }, man, { transform: [{ rotate: "-55deg" }]}]} />}
      </View>
    );
  };

  const WordDisplay = () => {
    const wordLetterColor = "#FFD166";
    return (
      <Animated.View
        style={{
          backgroundColor: colors.glassSecondary,
          borderRadius: 12,
          padding: 16,
          borderWidth: 1,
          borderColor: colors.border,
          transform: [{ translateX: shakeAnim }],
        }}
      >
        <Text
          style={{
            fontSize: 18,
            color: colors.textSecondary,
            textAlign: "center",
            marginBottom: 10,
            fontFamily: "Nunito-SemiBold",
          }}
        >
          Guess the word
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "center", flexWrap: "wrap" }}>
          {revealed.map((ch, idx) => (
            <View
              key={idx}
              style={{
                minWidth: 26,
                paddingHorizontal: 6,
                paddingVertical: 8,
                margin: 4,
                borderRadius: 8,
                backgroundColor: ch === "_" ? colors.surfaceSecondary : wordLetterColor + "20",
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "bold",
                  color: ch === "_" ? colors.textSecondary : wordLetterColor,
                  fontFamily: "Nunito-Bold",
                }}
              >
                {ch === "_" ? "_" : ch.toUpperCase()}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>
    );
  };

  const Keyboard = () => (
    <View
      style={{
        backgroundColor: colors.glassSecondary,
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text
        style={{
          fontSize: 16,
          color: colors.textSecondary,
          marginBottom: 8,
          textAlign: "center",
          fontFamily: "Nunito-Medium",
        }}
      >
        Tap letters to guess
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
        {ALPHABET.map((L) => {
          const used = guessed.has(L);
          const inWord = secretWord.toUpperCase().includes(L);
          const bg = used ? (inWord ? primary + "30" : "#FF444420") : colors.surfaceSecondary;
          const textColor = used ? (inWord ? primary : "#FF6666") : colors.text;

          return (
            <TouchableOpacity
              key={L}
              onPress={() => onGuess(L)}
              disabled={used || !gameActive}
              style={{
                width: 38,
                height: 44,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: bg,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: textColor,
                  fontFamily: "Nunito-Bold",
                }}
              >
                {L}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  /* ---------- UI ---------- */
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NightSkyBackground />
      <View style={{ flex: 1, paddingTop: insets.top }}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 16,
            backgroundColor: colors.glassSecondary,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <TouchableOpacity onPress={handleBack}>
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.text, fontFamily: "Nunito-Bold" }}>
              Hangman
            </Text>
            <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
              <Swords size={16} color={colors.textSecondary} />
              <Text style={{ fontSize: 14, color: colors.textSecondary, fontFamily: "Nunito-SemiBold" }}>
                Wrong: {wrongCount}/{MAX_WRONG}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 18, fontWeight: "bold", color: primary, fontFamily: "Nunito-Bold" }}>
              {score}
            </Text>
            <TouchableOpacity onPress={() => setShowAchievements(true)}>
              <Trophy size={24} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowHelp(true)}>
              <HelpCircle size={24} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={resetGame}>
              <RotateCcw size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
          {!secretWord ? (
            <View style={{ padding: 20, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="small" color={primary} />
              <Text style={{ marginTop: 8, color: colors.textSecondary, fontFamily: "Nunito-Medium" }}>
                AI is choosing a word…
              </Text>
            </View>
          ) : (
            <>
              <View
                style={{
                  backgroundColor: "rgba(138, 43, 226, 0.10)",
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Gallows wrong={wrongCount} />
                <WordDisplay />
              </View>

              <Keyboard />

              {bestScore != null && (
                <Text style={{ marginTop: 8, fontSize: 14, color: colors.textSecondary, textAlign: "center", fontFamily: "Nunito-Medium" }}>
                  Best Score: {bestScore}
                </Text>
              )}
            </>
          )}
        </ScrollView>

        {/* Help Modal */}
        <Modal visible={showHelp} transparent animationType="fade" onRequestClose={() => setShowHelp(false)}>
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" }}>
            <View
              style={{
                backgroundColor: colors.background,
                borderRadius: 16,
                padding: 20,
                margin: 20,
                maxWidth: 320,
                width: "85%",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.text, textAlign: "center", marginBottom: 16, fontFamily: "Nunito-Bold" }}>
                How to Play
              </Text>
              <Text style={{ fontSize: 16, color: colors.text, lineHeight: 24, marginBottom: 20, fontFamily: "Nunito-Regular" }}>
                Guess the secret word by tapping letters. Each wrong guess draws a new part of the hangman. You have {MAX_WRONG} wrong guesses before the round ends.
                {"\n\n"}Scoring:
                {"\n"}• +5 per new correct letter
                {"\n"}• −12 per wrong guess
                {"\n"}• +50 bonus for winning
              </Text>
              <TouchableOpacity onPress={() => setShowHelp(false)} style={{ backgroundColor: primary, borderRadius: 8, padding: 12, alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontWeight: "bold", color: "white", fontFamily: "Nunito-Bold" }}>
                  Got it!
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Result Modal */}
        {showResult && (
          <Modal visible={showResult} transparent animationType="fade" onRequestClose={() => setShowResult(false)}>
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center" }}>
              <View
                style={{
                  backgroundColor: colors.background,
                  borderRadius: 20,
                  padding: 24,
                  margin: 20,
                  maxWidth: 340,
                  width: "88%",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                {isWin ? <Trophy size={48} color={primary} /> : <Skull size={48} color="#FF6666" />}

                <Text style={{ fontSize: 24, fontWeight: "bold", color: colors.text, textAlign: "center", marginTop: 16, marginBottom: 8, fontFamily: "Nunito-Bold" }}>
                  {isWin ? "You Win!" : "You Lost!"}
                </Text>

                <Text style={{ fontSize: 18, color: isWin ? primary : "#FF6666", fontWeight: "bold", textAlign: "center", marginBottom: 16, fontFamily: "Nunito-Bold" }}>
                  Score: {score}
                </Text>

                <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center", marginBottom: 24, fontFamily: "Nunito-Medium" }}>
                  {isWin ? "Great job! You revealed the whole word." : `The word was: ${secretWord.toUpperCase()}`}
                  {bestScore != null && score >= bestScore && "\n🎉 New Best Score!"}
                </Text>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity onPress={resetGame} style={{ backgroundColor: primary, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12 }}>
                    <Text style={{ fontSize: 16, fontWeight: "bold", color: "white", fontFamily: "Nunito-Bold" }}>Play Again</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={handleBack} style={{ backgroundColor: colors.surfaceSecondary, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12 }}>
                    <Text style={{ fontSize: 16, fontWeight: "bold", color: colors.text, fontFamily: "Nunito-Bold" }}>Back to Hub</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}

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
                borderColor: colors.border,
                backgroundColor: colors.background,
                maxHeight: "80%",
              }}
            >
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Text style={{ fontWeight: "700", fontSize: 16, color: colors.text }}>
                  Hangman Achievements
                </Text>
                <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
                  <Text style={{ fontWeight: "600", fontSize: 14, color: colors.textSecondary }}>
                    Close
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ padding: 12 }}>
                {playerId && gameTypeId ? (
                  <AchievementsSection
                    playerId={playerId}
                    gameId={gameTypeId}
                    autoRefreshMs={15000}
                    showSearchBar
                    showFilters
                  />
                ) : (
                  <View style={{ padding: 16 }}>
                    <Text style={{ color: colors.textSecondary, textAlign: "center", fontWeight: "500" }}>
                      Loading achievements…
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}
