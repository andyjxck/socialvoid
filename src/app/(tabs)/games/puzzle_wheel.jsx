import React, { useState } from "react";
import { View, Text, ScrollView, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../../../utils/theme";
import NightSkyBackground from "../../../components/NightSkyBackground";
import * as Haptics from "expo-haptics";
import { usePuzzleWheelGame } from "../../../hooks/usePuzzleWheelGame";
import { GameHeader } from "../../../components/puzzle_wheel/GameHeader";
import { CrosswordGrid } from "../../../components/puzzle_wheel/CrosswordGrid";
import { WordWheel } from "../../../components/puzzle_wheel/WordWheel";
import { CurrentWordDisplay } from "../../../components/puzzle_wheel/CurrentWordDisplay";
import { ExtraWordsList } from "../../../components/puzzle_wheel/ExtraWordsList";
import { HelpModal } from "../../../components/puzzle_wheel/HelpModal";
import { ResultModal } from "../../../components/puzzle_wheel/ResultModal";

export default function PuzzleWheelGame() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [showHelp, setShowHelp] = useState(false);
  const [shakeAnimation] = useState(new Animated.Value(0));

  const {
    puzzle,
    currentWord,
    setCurrentWord,
    extraWords,
    solvedTargets,
    score,
    timeLeft,
    gameActive,
    showResult,
    setShowResult,
    bestScore,
    initializeGame,
    processSubmission,
  } = usePuzzleWheelGame();

  const addLetter = (letter) => {
    if (gameActive) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentWord(currentWord + letter);
    }
  };

  const clearWord = () => {
    if (gameActive) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentWord("");
    }
  };

  const triggerShake = (intensity = 10) => {
    Animated.sequence([
      Animated.timing(shakeAnimation, {
        toValue: intensity,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: -intensity,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: intensity,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnimation, {
        toValue: 0,
        duration: 50,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const submitWord = () => {
    const result = processSubmission();
    if (result.valid) {
      if (result.type === "target") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } else {
      if (result.reason === "invalid") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        triggerShake(10);
      } else if (result.reason === "duplicate") {
        triggerShake(5);
      }
    }
  };

  if (!puzzle) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <NightSkyBackground />
        <Text style={{ color: colors.text }}>Generating puzzle...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <NightSkyBackground />
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <GameHeader
          score={score}
          timeLeft={timeLeft}
          onShowHelp={() => setShowHelp(true)}
          onInitializeGame={initializeGame}
        />

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <CrosswordGrid
            grid={puzzle.grid}
            targetWords={puzzle.targetWords}
            solvedTargetsCount={solvedTargets.size}
          />

          <WordWheel wheel={puzzle.wheel} onLetterPress={addLetter} />

          <CurrentWordDisplay
            currentWord={currentWord}
            onClear={clearWord}
            onSubmit={submitWord}
            shakeAnimation={shakeAnimation}
          />

          <ExtraWordsList extraWords={extraWords} />

          {bestScore !== null && (
            <Text
              style={{
                marginTop: 16,
                fontSize: 14,
                color: colors.textSecondary,
                textAlign: "center",
                fontFamily: "Nunito-Medium",
              }}
            >
              Best Score: {bestScore}
            </Text>
          )}
        </ScrollView>

        <HelpModal visible={showHelp} onClose={() => setShowHelp(false)} />

        <ResultModal
          visible={showResult}
          onClose={() => setShowResult(false)}
          onPlayAgain={initializeGame}
          score={score}
          bestScore={bestScore}
          solvedTargetsCount={solvedTargets.size}
          targetWordsCount={puzzle.targetWords.length}
          extraWordsCount={extraWords.length}
        />
      </View>
    </View>
  );
}
