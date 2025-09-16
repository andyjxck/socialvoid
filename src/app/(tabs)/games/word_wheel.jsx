import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  RotateCcw,
  HelpCircle,
  Trophy,
  Clock,
} from "lucide-react-native";
import { useTheme } from "../../../utils/theme";
import NightSkyBackground from "../../../components/NightSkyBackground";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { usePlaytimeTracking } from "../../../hooks/usePlaytimeTracking";
import { generateWordWheel, isValidWord } from "../../../utils/puzzle_wheel/logic";

export default function WordWheelGame() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
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
      console.error('Error initializing Word Wheel:', error);
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
        await AsyncStorage.setItem("word_wheel_best_score", currentScore.toString());
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
      console.error('Error in initializeGame:', error);
    }
  };

  const endGame = () => {
    try {
      setGameActive(false);
      setShowResult(true);
      stopTracking();
      saveBestScore(score);
    } catch (error) {
      console.error('Error in endGame:', error);
    }
  };

  const addLetter = (letter) => {
    try {
      if (gameActive) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCurrentWord(currentWord + letter);
      }
    } catch (error) {
      console.error('Error in addLetter:', error);
    }
  };

  const clearWord = () => {
    try {
      if (gameActive) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setCurrentWord("");
      }
    } catch (error) {
      console.error('Error in clearWord:', error);
    }
  };

  const submitWord = () => {
    try {
      if (!gameActive || currentWord.length < 3 || !wheel) return;

      const isValid = isValidWord(currentWord, wheel.allLetters, wheel.center);
      const isDuplicate = foundWords.some((word) => word.word === currentWord.toUpperCase());

      if (isValid && !isDuplicate) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        let points = 1;
        if (currentWord.length >= 7) points += 5;
        else if (currentWord.length >= 5) points += 2;

        setFoundWords([...foundWords, { word: currentWord.toUpperCase(), points }]);
        setScore(score + points);
        setCurrentWord("");
      } else {
        // Shake animation for invalid word
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Animated.sequence([
          Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnimation, { toValue: -10, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnimation, { toValue: 10, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnimation, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]).start();
      }
    } catch (error) {
      console.error('Error in submitWord:', error);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!wheel) {
    return (
      <View style={{
        flex: 1,
        backgroundColor: colors.background,
        alignItems: "center",
        justifyContent: "center",
      }}>
        <NightSkyBackground />
        <Text style={{ color: colors.text }}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={{
      flex: 1,
      backgroundColor: colors.background,
    }}>
      <NightSkyBackground />

      <View style={{
        flex: 1,
        paddingTop: insets.top,
      }}>
        {/* Header */}
        <View style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
          backgroundColor: colors.glassSecondary,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>

          <View style={{ alignItems: "center" }}>
            <Text style={{
              fontSize: 20,
              fontWeight: "bold",
              color: colors.text,
              fontFamily: "Nunito-Bold",
            }}>
              Word Wheel
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Clock size={16} color={timeLeft <= 10 ? "#FF4444" : colors.textSecondary} />
              <Text style={{
                fontSize: 16,
                fontWeight: "bold",
                color: timeLeft <= 10 ? "#FF4444" : colors.textSecondary,
                fontFamily: "Nunito-SemiBold",
              }}>
                {formatTime(timeLeft)}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <Text style={{
              fontSize: 18,
              fontWeight: "bold",
              color: colors.primary,
              fontFamily: "Nunito-Bold",
            }}>
              {score}
            </Text>
            <TouchableOpacity onPress={() => setShowHelp(true)}>
              <HelpCircle size={24} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={initializeGame}>
              <RotateCcw size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
          {/* Word Wheel */}
          <View style={{
            alignItems: "center",
            marginBottom: 30,
            backgroundColor: "rgba(138, 43, 226, 0.1)",
            borderRadius: 120,
            padding: 20,
          }}>
            <View style={{
              width: 200,
              height: 200,
              position: "relative",
              alignItems: "center",
              justifyContent: "center",
            }}>
              {/* Center Letter */}
              <TouchableOpacity
                onPress={() => addLetter(wheel.center)}
                style={{
                  width: 70,
                  height: 70,
                  borderRadius: 35,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                  position: "absolute",
                  zIndex: 10,
                  shadowColor: colors.primary,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 8,
                }}
              >
                <Text style={{
                  fontSize: 28,
                  fontWeight: "bold",
                  color: "white",
                  fontFamily: "Nunito-Bold",
                }}>
                  {wheel.center}
                </Text>
              </TouchableOpacity>

              {/* Outer Letters */}
              {wheel.outer && wheel.outer.map && wheel.outer.map((letter, index) => {
                const angle = (index * 360) / wheel.outer.length;
                const radian = (angle * Math.PI) / 180;
                const x = Math.cos(radian) * 70;
                const y = Math.sin(radian) * 70;

                return (
                  <TouchableOpacity
                    key={index}
                    onPress={() => addLetter(letter)}
                    style={{
                      width: 55,
                      height: 55,
                      borderRadius: 27.5,
                      backgroundColor: colors.glassSecondary,
                      borderWidth: 2,
                      borderColor: colors.primary,
                      alignItems: "center",
                      justifyContent: "center",
                      position: "absolute",
                      left: 100 + x - 27.5,
                      top: 100 + y - 27.5,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.1,
                      shadowRadius: 4,
                      elevation: 4,
                    }}
                  >
                    <Text style={{
                      fontSize: 22,
                      fontWeight: "bold",
                      color: colors.text,
                      fontFamily: "Nunito-Bold",
                    }}>
                      {letter}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Current Word */}
          <Animated.View style={{
            backgroundColor: colors.glassSecondary,
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: colors.border,
            transform: [{ translateX: shakeAnimation }],
          }}>
            <Text style={{
              fontSize: 18,
              color: colors.textSecondary,
              textAlign: "center",
              marginBottom: 8,
              fontFamily: "Nunito-Medium",
            }}>
              Current Word
            </Text>
            <Text style={{
              fontSize: 24,
              fontWeight: "bold",
              color: colors.text,
              textAlign: "center",
              minHeight: 30,
              fontFamily: "Nunito-Bold",
            }}>
              {currentWord || "..."}
            </Text>

            <View style={{
              flexDirection: "row",
              justifyContent: "center",
              gap: 12,
              marginTop: 16,
            }}>
              <TouchableOpacity
                onPress={clearWord}
                style={{
                  backgroundColor: colors.surfaceSecondary,
                  borderRadius: 8,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: "bold",
                  color: colors.text,
                  fontFamily: "Nunito-Bold",
                }}>
                  Clear
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={submitWord}
                disabled={currentWord.length < 3}
                style={{
                  backgroundColor: currentWord.length >= 3 ? colors.primary : colors.surfaceSecondary,
                  borderRadius: 8,
                  paddingHorizontal: 20,
                  paddingVertical: 10,
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: "bold",
                  color: currentWord.length >= 3 ? "white" : colors.textSecondary,
                  fontFamily: "Nunito-Bold",
                }}>
                  Submit
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Found Words */}
          <View style={{
            backgroundColor: colors.glassSecondary,
            borderRadius: 12,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.border,
            maxHeight: 200,
          }}>
            <Text style={{
              fontSize: 18,
              fontWeight: "bold",
              color: colors.text,
              marginBottom: 12,
              fontFamily: "Nunito-Bold",
            }}>
              Found Words ({foundWords.length})
            </Text>

            {foundWords.length === 0 ? (
              <Text style={{
                fontSize: 14,
                color: colors.textSecondary,
                textAlign: "center",
                fontStyle: "italic",
                fontFamily: "Nunito-Regular",
              }}>
                No words found yet
              </Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 8,
                }}>
                  {foundWords.map((item, index) => (
                    <View
                      key={index}
                      style={{
                        backgroundColor: colors.primary + "20",
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Text style={{
                        fontSize: 14,
                        color: colors.text,
                        fontWeight: "500",
                        fontFamily: "Nunito-Medium",
                      }}>
                        {item.word}
                      </Text>
                      <Text style={{
                        fontSize: 12,
                        color: colors.primary,
                        fontWeight: "bold",
                        fontFamily: "Nunito-Bold",
                      }}>
                        +{item.points}
                      </Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>

          {bestScore && (
            <Text style={{
              marginTop: 16,
              fontSize: 14,
              color: colors.textSecondary,
              textAlign: "center",
              fontFamily: "Nunito-Medium",
            }}>
              Best Score: {bestScore}
            </Text>
          )}
        </ScrollView>

        {/* Help Modal */}
        <Modal
          visible={showHelp}
          transparent
          animationType="fade"
          onRequestClose={() => setShowHelp(false)}
        >
          <View style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <View style={{
              backgroundColor: colors.glassSecondary,
              borderRadius: 16,
              padding: 20,
              margin: 20,
              maxWidth: 300,
              borderWidth: 1,
              borderColor: colors.border,
            }}>
              <Text style={{
                fontSize: 20,
                fontWeight: "bold",
                color: colors.text,
                textAlign: "center",
                marginBottom: 16,
                fontFamily: "Nunito-Bold",
              }}>
                How to Play
              </Text>

              <Text style={{
                fontSize: 16,
                color: colors.text,
                lineHeight: 24,
                marginBottom: 20,
                fontFamily: "Nunito-Regular",
              }}>
                Form words using the letters in the wheel. Every word must include the center letter. Words must be 3+ letters long. Letters can be reused.
                {"\n\n"}1 point per word
                {"\n"}+2 bonus for 5+ letters
                {"\n"}+5 bonus for 7+ letters
              </Text>

              <TouchableOpacity
                onPress={() => setShowHelp(false)}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 8,
                  padding: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{
                  fontSize: 16,
                  fontWeight: "bold",
                  color: "white",
                  fontFamily: "Nunito-Bold",
                }}>
                  Got it!
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Result Modal */}
        <Modal
          visible={showResult}
          transparent
          animationType="fade"
          onRequestClose={() => setShowResult(false)}
        >
          <View style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <View style={{
              backgroundColor: colors.glassSecondary,
              borderRadius: 16,
              padding: 20,
              margin: 20,
              maxWidth: 300,
              alignItems: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}>
              <Trophy size={48} color={colors.primary} />

              <Text style={{
                fontSize: 24,
                fontWeight: "bold",
                color: colors.text,
                textAlign: "center",
                marginTop: 16,
                marginBottom: 8,
                fontFamily: "Nunito-Bold",
              }}>
                Time's Up!
              </Text>

              <Text style={{
                fontSize: 18,
                color: colors.primary,
                fontWeight: "bold",
                textAlign: "center",
                marginBottom: 16,
                fontFamily: "Nunito-Bold",
              }}>
                Final Score: {score}
              </Text>

              <Text style={{
                fontSize: 14,
                color: colors.textSecondary,
                textAlign: "center",
                marginBottom: 24,
                fontFamily: "Nunito-Medium",
              }}>
                Words found: {foundWords.length}
                {bestScore && score >= bestScore && "\n🎉 New Best Score!"}
              </Text>

              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  onPress={initializeGame}
                  style={{
                    backgroundColor: colors.primary,
                    borderRadius: 8,
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{
                    fontSize: 16,
                    fontWeight: "bold",
                    color: "white",
                    fontFamily: "Nunito-Bold",
                  }}>
                    Play Again
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => router.back()}
                  style={{
                    backgroundColor: colors.surfaceSecondary,
                    borderRadius: 8,
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{
                    fontSize: 16,
                    fontWeight: "bold",
                    color: colors.text,
                    fontFamily: "Nunito-Bold",
                  }}>
                    Back
                  </Text>
                </TouchableOpacity>
                </View>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}