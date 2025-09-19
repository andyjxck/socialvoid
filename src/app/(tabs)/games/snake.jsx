// src/app/(tabs)/games/snake.jsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../../../utils/theme";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, Trophy, Settings } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import {
  PanGestureHandler,
  State,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

const { width: screenWidth } = Dimensions.get("window");

const DIFFICULTIES = {
  easy: { gridSize: 15, speed: 200, name: "Easy" },
  medium: { gridSize: 20, speed: 150, name: "Medium" },
  hard: { gridSize: 25, speed: 100, name: "Hard" },
};

export default function SnakeGame() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // Player & Game IDs
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [gameId, setGameId] = useState(null);
  const submittedRef = useRef(false); // prevents double-submit

  // Load player id once
  useEffect(() => {
    const loadPlayerId = async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        setCurrentPlayerId(saved ? parseInt(saved, 10) : 1);
      } catch {
        setCurrentPlayerId(1);
      }
    };
    loadPlayerId();
  }, []);

  // Start tracking on mount; submit on unmount if needed
  useEffect(() => {
    let mounted = true;
    let currentGameId = null;

    const setupGame = async () => {
      if (!currentPlayerId) return;
      try {
        const id = await getGameId(GAME_TYPES.SNAKE);
        if (!mounted) return;
        if (id) {
          currentGameId = id;
          setGameId(id);
          await gameTracker.startGame(id, currentPlayerId);
          // console.log("🎮 Snake tracking started:", id);
        } else {
          console.error("❌ Could not get Snake game ID");
        }
      } catch (e) {
        console.warn("startGame failed:", e?.message || e);
      }
    };

    setupGame();

    return () => {
      mounted = false;
      // If we leave without having submitted yet, count as a play with the last score
      if (currentGameId && !submittedRef.current) {
        try {
          // We'll read the latest score via ref below
          const finalScore = scoreRef.current || 0;
          const meta = {
            result: "back",
            completed: false,
            reason: "unmount",
            difficulty,
          };
          // only attach high_score if it beats local best
          if (finalScore > bestScoreRef.current) meta.high_score = finalScore;
          gameTracker.endGame(currentGameId, finalScore, meta);
          submittedRef.current = true;
        } catch (e) {
          console.warn("endGame on unmount failed:", e?.message || e);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPlayerId]); // (difficulty is read from ref in unmount submit)

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Game state
  const [gameStarted, setGameStarted] = useState(false);
  const [difficulty, setDifficulty] = useState("medium");
  const [snake, setSnake] = useState([]);
  const [food, setFood] = useState(null);
  const [direction, setDirection] = useState("RIGHT");
  const [score, setScore] = useState(0);
  const [bestLocalScore, setBestLocalScore] = useState(0); // local best to gate high_score submits
  const [gameOver, setGameOver] = useState(false);
  const [paused, setPaused] = useState(false);

  // Refs for latest values (so stable callbacks can use fresh state)
  const scoreRef = useRef(0);
  const bestScoreRef = useRef(0);
  const difficultyRef = useRef("medium");
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { bestScoreRef.current = bestLocalScore; }, [bestLocalScore]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);

  // Load local best for snake
  useEffect(() => {
    const loadBest = async () => {
      try {
        const saved = await AsyncStorage.getItem("snake_scores");
        if (saved) {
          const { best = 0 } = JSON.parse(saved);
          setBestLocalScore(best);
        }
      } catch {}
    };
    loadBest();
  }, []);

  const saveLocalScores = useCallback(async (best) => {
    try {
      await AsyncStorage.setItem("snake_scores", JSON.stringify({ best }));
    } catch {}
  }, []);

  const gridSize = DIFFICULTIES[difficulty].gridSize;
  const cellSize = (screenWidth - 60) / gridSize;
  const gameLoopRef = useRef();

  // Food generator
  const generateFood = useCallback(
    (snakeBody) => {
      let newFood;
      do {
        newFood = {
          x: Math.floor(Math.random() * gridSize),
          y: Math.floor(Math.random() * gridSize),
        };
      } while (snakeBody.some((s) => s.x === newFood.x && s.y === newFood.y));
      return newFood;
    },
    [gridSize]
  );

  // Initialize a run
  const initializeGame = useCallback(() => {
    submittedRef.current = false; // new run not yet submitted
    const initialSnake = [
      { x: Math.floor(gridSize / 2), y: Math.floor(gridSize / 2) },
    ];
    setSnake(initialSnake);
    setFood(generateFood(initialSnake));
    setDirection("RIGHT");
    setScore(0);
    setGameOver(false);
    setPaused(false);
    setGameStarted(true);
  }, [gridSize, generateFood]);

  // Persistent submitter (lose/back). Only attaches meta.high_score if beating local best.
  const submitPersistent = useCallback(
    (finalScore, reason) => {
      if (!gameId || submittedRef.current) return;
      try {
        const meta = {
          result: reason === "lose" ? "lose" : "back",
          completed: false,
          reason,
          difficulty: difficultyRef.current,
        };
        if (finalScore > bestScoreRef.current) {
          meta.high_score = finalScore; // backend should only update if greater anyway
        }
        gameTracker.endGame(gameId, finalScore, meta);
        submittedRef.current = true;

        // update local best if beaten
        if (finalScore > bestScoreRef.current) {
          setBestLocalScore(finalScore);
          saveLocalScores(finalScore);
        }
      } catch (e) {
        console.warn("submitPersistent failed:", e?.message || e);
      }
    },
    [gameId, saveLocalScores]
  );

  // Move snake loop
  const moveSnake = useCallback(() => {
    if (gameOver || paused || !gameStarted) return;

    setSnake((currentSnake) => {
      const newSnake = [...currentSnake];
      const head = { ...newSnake[0] };

      switch (direction) {
        case "UP": head.y -= 1; break;
        case "DOWN": head.y += 1; break;
        case "LEFT": head.x -= 1; break;
        case "RIGHT": head.x += 1; break;
      }

      // Walls
      if (head.x < 0 || head.x >= gridSize || head.y < 0 || head.y >= gridSize) {
        setGameOver(true);
        // submit score as a loss
        submitPersistent(scoreRef.current, "lose");
        return currentSnake;
      }

      // Self
      if (newSnake.some((seg) => seg.x === head.x && seg.y === head.y)) {
        setGameOver(true);
        submitPersistent(scoreRef.current, "lose");
        return currentSnake;
      }

      newSnake.unshift(head);

      // Food
      if (food && head.x === food.x && head.y === food.y) {
        setScore((prev) => {
          const next = prev + 1;
          // maintain local best while playing (optional UX)
          if (next > bestScoreRef.current) {
            setBestLocalScore(next);
            saveLocalScores(next);
          }
          return next;
        });
        setFood(generateFood(newSnake));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } else {
        newSnake.pop();
      }

      return newSnake;
    });
  }, [
    direction,
    gameOver,
    paused,
    gameStarted,
    gridSize,
    food,
    generateFood,
    submitPersistent,
    saveLocalScores,
  ]);

  // Game loop timer
  useEffect(() => {
    if (gameStarted && !gameOver && !paused) {
      gameLoopRef.current = setInterval(
        moveSnake,
        DIFFICULTIES[difficulty].speed
      );
      return () => clearInterval(gameLoopRef.current);
    }
  }, [moveSnake, gameStarted, gameOver, paused, difficulty]);

  // Direction change
  const changeDirection = (newDirection) => {
    if (gameOver || !gameStarted) return;
    const opposites = { UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT" };
    if (opposites[direction] !== newDirection) {
      setDirection(newDirection);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  // Pause
  const togglePause = () => {
    if (!gameOver && gameStarted) {
      setPaused((p) => !p);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  // Start with selected difficulty
  const startGame = (selectedDifficulty) => {
    setDifficulty(selectedDifficulty);
    initializeGame();
  };

  // Back from in-game → count as a play, possibly update high_score
  const handleBackFromGame = useCallback(() => {
    submitPersistent(scoreRef.current, "back");
    setGameStarted(false); // go to difficulty view
  }, [submitPersistent]);

  if (!fontsLoaded) return null;

  // Difficulty selection screen
  if (!gameStarted) {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <NightSkyBackground />
        <LinearGradient
          colors={
            isDark
              ? ["rgba(17, 24, 39, 1)", "rgba(31, 41, 55, 0.8)"]
              : ["rgba(34, 197, 94, 0.1)", "rgba(255, 255, 255, 0.9)"]
          }
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />

        <View
          style={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 20,
            marginBottom: 40,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <TouchableOpacity
              onPress={() => {
                // leaving the screen from difficulty view — no current run to submit
                router.back();
              }}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: colors.glassSecondary,
              }}
            >
              <ArrowLeft size={24} color={colors.text} />
            </TouchableOpacity>

            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 20,
                color: colors.text,
              }}
            >
              Snake
            </Text>

            <View style={{ width: 40 }} />
          </View>
        </View>

        <View style={{ flex: 1, paddingHorizontal: 20, justifyContent: "center" }}>
          <Text
            style={{
              fontFamily: "Inter_700Bold",
              fontSize: 28,
              color: colors.text,
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            Choose Difficulty
          </Text>

          <Text
            style={{
              fontFamily: "Inter_500Medium",
              fontSize: 16,
              color: colors.textSecondary,
              textAlign: "center",
              marginBottom: 40,
            }}
          >
            Select board size and speed
          </Text>

          <View style={{ gap: 16 }}>
            {Object.entries(DIFFICULTIES).map(([key, config]) => (
              <TouchableOpacity
                key={key}
                onPress={() => startGame(key)}
                style={{
                  backgroundColor: colors.glassSecondary,
                  borderRadius: 16,
                  padding: 20,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 18,
                    color: colors.text,
                    marginBottom: 4,
                  }}
                >
                  {config.name}
                </Text>
                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 14,
                    color: colors.textSecondary,
                  }}
                >
                  {config.gridSize}×{config.gridSize} grid • {config.speed}ms speed
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    );
  }

  // In-game screen
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <StatusBar style={isDark ? "light" : "dark"} />
        <NightSkyBackground />

        {/* Header */}
        <View
          style={{
            paddingTop: insets.top + 16,
            paddingHorizontal: 20,
            marginBottom: 20,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <TouchableOpacity
              onPress={handleBackFromGame}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: colors.glassSecondary,
              }}
            >
              <ArrowLeft size={24} color={colors.text} />
            </TouchableOpacity>

            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 20,
                color: colors.text,
              }}
            >
              Snake - {DIFFICULTIES[difficulty].name}
            </Text>

            <TouchableOpacity
              onPress={handleBackFromGame}
              style={{
                padding: 8,
                borderRadius: 12,
                backgroundColor: colors.glassSecondary,
              }}
            >
              <Settings size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={{ borderRadius: 16, overflow: "hidden" }}>
            <BlurView
              intensity={isDark ? 60 : 80}
              tint={isDark ? "dark" : "light"}
              style={{
                backgroundColor: isDark
                  ? "rgba(31, 41, 55, 0.7)"
                  : "rgba(255, 255, 255, 0.7)",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 16,
                padding: 16,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View style={{ alignItems: "center", flex: 1 }}>
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
                    Score
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Inter_700Bold",
                      fontSize: 20,
                      color: colors.gameAccent5,
                    }}
                  >
                    {score}
                  </Text>
                </View>

                <View style={{ alignItems: "center", flex: 1 }}>
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
                    Length
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Inter_700Bold",
                      fontSize: 20,
                      color: colors.text,
                    }}
                  >
                    {snake.length}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={togglePause}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 12,
                    backgroundColor: colors.gameAccent5 + "20",
                    borderWidth: 1,
                    borderColor: colors.gameAccent5,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 12,
                      color: colors.gameAccent5,
                    }}
                  >
                    {paused ? "PLAY" : "PAUSE"}
                  </Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </View>

        {/* Board & swipe */}
        <PanGestureHandler
          onHandlerStateChange={(event) => {
            if (event.nativeEvent.state === State.END) {
              const { translationX, translationY } = event.nativeEvent;
              const threshold = 50;
              if (Math.abs(translationX) > Math.abs(translationY)) {
                if (translationX > threshold) changeDirection("RIGHT");
                else if (translationX < -threshold) changeDirection("LEFT");
              } else {
                if (translationY > threshold) changeDirection("DOWN");
                else if (translationY < -threshold) changeDirection("UP");
              }
            }
          }}
        >
          <View
            style={{
              width: gridSize * cellSize,
              height: gridSize * cellSize,
              backgroundColor: colors.glassSecondary,
              borderRadius: 12,
              alignSelf: "center",
              marginBottom: 20,
            }}
          >
            {snake.map((segment, index) => (
              <View
                key={index}
                style={{
                  position: "absolute",
                  left: segment.x * cellSize,
                  top: segment.y * cellSize,
                  width: cellSize,
                  height: cellSize,
                  backgroundColor:
                    index === 0 ? colors.gameAccent5 : colors.gameAccent5 + "80",
                  borderRadius: index === 0 ? cellSize / 3 : cellSize / 6,
                  borderWidth: index === 0 ? 1 : 0,
                  borderColor: colors.background,
                }}
              />
            ))}

            {food && (
              <View
                style={{
                  position: "absolute",
                  left: food.x * cellSize,
                  top: food.y * cellSize,
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: "#FF6B6B",
                  borderRadius: cellSize / 2,
                  borderWidth: 2,
                  borderColor: colors.background,
                }}
              />
            )}
          </View>
        </PanGestureHandler>

        {/* Controls */}
        <View style={{ alignSelf: "center", marginBottom: 20 }}>
          {/* Up */}
          <View style={{ alignItems: "center", marginBottom: 8 }}>
            <TouchableOpacity
              onPress={() => changeDirection("UP")}
              style={{
                width: 60,
                height: 60,
                backgroundColor: colors.glassSecondary,
                borderRadius: 30,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 24,
                  color: colors.gameAccent5,
                }}
              >
                ↑
              </Text>
            </TouchableOpacity>
          </View>

          {/* Left / Pause / Right */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 12,
              marginBottom: 8,
            }}
          >
            <TouchableOpacity
              onPress={() => changeDirection("LEFT")}
              style={{
                width: 60,
                height: 60,
                backgroundColor: colors.glassSecondary,
                borderRadius: 30,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 24,
                  color: colors.gameAccent5,
                }}
              >
                ←
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={togglePause}
              style={{
                width: 70,
                height: 50,
                backgroundColor: colors.gameAccent5 + "20",
                borderRadius: 12,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
                borderColor: colors.gameAccent5,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 12,
                  color: colors.gameAccent5,
                }}
              >
                {paused ? "PLAY" : "PAUSE"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => changeDirection("RIGHT")}
              style={{
                width: 60,
                height: 60,
                backgroundColor: colors.glassSecondary,
                borderRadius: 30,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 24,
                  color: colors.gameAccent5,
                }}
              >
                →
              </Text>
            </TouchableOpacity>
          </View>

          {/* Down */}
          <View style={{ alignItems: "center" }}>
            <TouchableOpacity
              onPress={() => changeDirection("DOWN")}
              style={{
                width: 60,
                height: 60,
                backgroundColor: colors.glassSecondary,
                borderRadius: 30,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_700Bold",
                  fontSize: 24,
                  color: colors.gameAccent5,
                }}
              >
                ↓
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Instructions */}
        <Text
          style={{
            fontFamily: "Inter_500Medium",
            fontSize: 14,
            color: colors.textSecondary,
            textAlign: "center",
            paddingBottom: insets.bottom + 20,
          }}
        >
          Use controls or swipe on the board to move the snake!
        </Text>

        {/* Pause overlay */}
        {paused && !gameOver && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
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
                  backgroundColor: isDark
                    ? "rgba(31, 41, 55, 0.9)"
                    : "rgba(255, 255, 255, 0.9)",
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 20,
                  padding: 32,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 24,
                    color: colors.text,
                    textAlign: "center",
                    marginBottom: 20,
                  }}
                >
                  Game Paused
                </Text>

                <TouchableOpacity
                  onPress={togglePause}
                  style={{
                    backgroundColor: colors.primaryButton,
                    paddingHorizontal: 24,
                    paddingVertical: 12,
                    borderRadius: 12,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 16,
                      color: colors.primaryButtonText,
                    }}
                  >
                    Resume
                  </Text>
                </TouchableOpacity>
              </BlurView>
            </View>
          </View>
        )}

        {/* Game over overlay */}
        {gameOver && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
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
                  backgroundColor: isDark
                    ? "rgba(31, 41, 55, 0.9)"
                    : "rgba(255, 255, 255, 0.9)",
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 20,
                  padding: 32,
                  alignItems: "center",
                }}
              >
                <Trophy size={48} color={colors.gameAccent5} style={{ marginBottom: 16 }} />

                <Text
                  style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: 24,
                    color: colors.text,
                    textAlign: "center",
                    marginBottom: 8,
                  }}
                >
                  Game Over
                </Text>

                <Text
                  style={{
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 18,
                    color: colors.gameAccent5,
                    marginBottom: 8,
                  }}
                >
                  Score: {score}
                </Text>

                <Text
                  style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: 14,
                    color: colors.textSecondary,
                    marginBottom: 20,
                  }}
                >
                  Length: {snake.length} • {DIFFICULTIES[difficulty].name}
                </Text>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    onPress={initializeGame}
                    style={{
                      backgroundColor: colors.secondaryButton,
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderRadius: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 14,
                        color: colors.secondaryButtonText,
                      }}
                    >
                      Play Again
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleBackFromGame}
                    style={{
                      backgroundColor: colors.primaryButton,
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderRadius: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 14,
                        color: colors.primaryButtonText,
                      }}
                    >
                      Change Difficulty
                    </Text>
                  </TouchableOpacity>
                </View>
              </BlurView>
            </View>
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}
