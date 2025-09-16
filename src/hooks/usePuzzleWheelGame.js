import { useState, useEffect } from "react";
import { Animated } from "react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePlaytimeTracking } from "./usePlaytimeTracking";
import { generateWordWheel, isValidWord } from "../utils/puzzle_wheel/logic";

export const usePuzzleWheelGame = () => {
  const [wheel, setWheel] = useState(null);
  const [currentWord, setCurrentWord] = useState("");
  const [foundWords, setFoundWords] = useState([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [gameActive, setGameActive] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [bestScore, setBestScore] = useState(null);
  const [shakeAnimation] = useState(new Animated.Value(0));

  const { startTracking, stopTracking } = usePlaytimeTracking("word_wheel");

  useEffect(() => {
    try {
      initializeGame();
      loadBestScore();
    } catch (error) {
      console.error("Error initializing Word Wheel:", error);
    }
  }, []);

  useEffect(() => {
    if (gameActive && timeLeft > 0) {
      const timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timeLeft === 0 && gameActive) {
      endGame();
    }
  }, [timeLeft, gameActive]);

  const loadBestScore = async () => {
    try {
      const saved = await AsyncStorage.getItem("word_wheel_best_score");
      if (saved) setBestScore(parseInt(saved));
    } catch (error) {
      console.error("Error loading best score:", error);
    }
  };

  const saveBestScore = async (currentScore) => {
    try {
      if (!bestScore || currentScore > bestScore) {
        setBestScore(currentScore);
        await AsyncStorage.setItem(
          "word_wheel_best_score",
          currentScore.toString(),
        );
      }
    } catch (error) {
      console.error("Error saving best score:", error);
    }
  };

  const initializeGame = () => {
    try {
      const newWheel = generateWordWheel();
      setWheel(newWheel);
      setCurrentWord("");
      setFoundWords([]);
      setScore(0);
      setTimeLeft(60);
      setGameActive(true);
      setShowResult(false);
      startTracking();
    } catch (error) {
      console.error("Error in initializeGame:", error);
    }
  };

  const endGame = () => {
    try {
      setGameActive(false);
      setShowResult(true);
      stopTracking();
      saveBestScore(score);
    } catch (error) {
      console.error("Error in endGame:", error);
    }
  };

  const addLetter = (letter) => {
    try {
      if (gameActive) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCurrentWord(currentWord + letter);
      }
    } catch (error) {
      console.error("Error in addLetter:", error);
    }
  };

  const clearWord = () => {
    try {
      if (gameActive) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCurrentWord("");
      }
    } catch (error) {
      console.error("Error in clearWord:", error);
    }
  };

  const submitWord = () => {
    try {
      if (!gameActive || currentWord.length < 3 || !wheel) return;

      const isValid = isValidWord(currentWord, wheel.allLetters, wheel.center);
      const isDuplicate = foundWords.some(
        (word) => word.word === currentWord.toUpperCase(),
      );

      if (isValid && !isDuplicate) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        let points = 1;
        if (currentWord.length >= 7) points += 5;
        else if (currentWord.length >= 5) points += 2;

        setFoundWords([
          ...foundWords,
          { word: currentWord.toUpperCase(), points },
        ]);
        setScore(score + points);
        setCurrentWord("");
      } else {
        // Shake animation for invalid word
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Animated.sequence([
          Animated.timing(shakeAnimation, {
            toValue: 10,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnimation, {
            toValue: -10,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnimation, {
            toValue: 10,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(shakeAnimation, {
            toValue: 0,
            duration: 50,
            useNativeDriver: true,
          }),
        ]).start();
      }
    } catch (error) {
      console.error("Error in submitWord:", error);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return {
    wheel,
    currentWord,
    foundWords,
    score,
    timeLeft,
    gameActive,
    showHelp,
    setShowHelp,
    showResult,
    setShowResult,
    bestScore,
    shakeAnimation,
    initializeGame,
    addLetter,
    clearWord,
    submitWord,
    formatTime,
  };
};
