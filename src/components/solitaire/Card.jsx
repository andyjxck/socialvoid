import React, { useRef } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useTheme } from "../../utils/theme";
import { CARD_WIDTH, CARD_HEIGHT } from "../../utils/solitaire/constants";

export const Card = ({
  card,
  onPress,
  onDoublePress, // New prop for double-tap
  style = {},
  isSelected,
  disabled = false,
}) => {
  const { colors, isDark } = useTheme();
  const doublePressRef = useRef(null);
  const lastTapTime = useRef(0);

  const handlePress = () => {
    const now = Date.now();
    const timeDiff = now - lastTapTime.current;

    // If tapped within 300ms, treat as double tap
    if (timeDiff < 300 && onDoublePress) {
      if (doublePressRef.current) {
        clearTimeout(doublePressRef.current);
        doublePressRef.current = null;
      }
      onDoublePress();
      lastTapTime.current = 0; // Reset to prevent triple tap issues
    } else {
      // Single tap - execute immediately with shorter delay for double tap check
      lastTapTime.current = now;

      if (doublePressRef.current) {
        clearTimeout(doublePressRef.current);
      }

      doublePressRef.current = setTimeout(() => {
        if (onPress && Date.now() - lastTapTime.current >= 100) {
          onPress();
        }
        doublePressRef.current = null;
      }, 100); // Reduced from 150ms to 100ms for faster response
    }
  };

  if (!card) {
    return (
      <View
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          borderRadius: 16,
          overflow: "hidden",
          ...style,
        }}
      >
        <BlurView
          intensity={20}
          tint={isDark ? "dark" : "light"}
          style={{
            flex: 1,
            borderRadius: 16,
            borderWidth: 2,
            borderColor: colors.border,
            borderStyle: "dashed",
            backgroundColor: colors.glassSecondary,
            opacity: 0.4,
          }}
        />
      </View>
    );
  }

  const cardContent = (
    <>
      {card.faceUp ? (
        <View style={{ flex: 1, position: "relative" }}>
          {/* Glassmorphic background */}
          <BlurView
            intensity={isDark ? 80 : 95}
            tint={isDark ? "light" : "light"}
            style={{
              flex: 1,
              borderRadius: 16,
            }}
          >
            {/* Glass overlay gradient */}
            <LinearGradient
              colors={
                isDark
                  ? [
                      "rgba(255, 235, 250, 0.95)",
                      "rgba(248, 225, 255, 0.9)",
                      "rgba(241, 220, 255, 0.95)",
                    ]
                  : [
                      "rgba(255, 235, 250, 0.98)",
                      "rgba(252, 230, 255, 0.95)",
                      "rgba(248, 225, 255, 0.92)",
                    ]
              }
              style={{
                flex: 1,
                borderRadius: 16,
                padding: 1,
              }}
            >
              {/* Inner glass effect */}
              <View
                style={{
                  flex: 1,
                  borderRadius: 15,
                  backgroundColor: "rgba(255, 235, 250, 0.1)",
                  borderWidth: 0.5,
                  borderColor: "rgba(255, 200, 255, 0.3)",
                  position: "relative",
                }}
              >
                {/* Subtle shine effect */}
                <LinearGradient
                  colors={[
                    "rgba(255, 255, 255, 0.4)",
                    "transparent",
                    "transparent",
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "50%",
                    borderTopLeftRadius: 15,
                    borderTopRightRadius: 15,
                  }}
                />

                {/* Card content */}
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 8,
                  }}
                >
                  {/* Center value and suit */}
                  <View style={{ alignItems: "center" }}>
                    <Text
                      style={{
                        fontSize: Math.min(16, CARD_WIDTH / 3.2),
                        fontWeight: "800",
                        color: card.color === "red" ? "#dc2626" : "#1f2937",
                        textShadowColor: "rgba(0, 0, 0, 0.1)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 2,
                        marginBottom: 2,
                      }}
                    >
                      {card.value}
                    </Text>
                    <Text
                      style={{
                        fontSize: Math.min(18, CARD_WIDTH / 2.8),
                        color: card.color === "red" ? "#dc2626" : "#1f2937",
                        textShadowColor: "rgba(0, 0, 0, 0.1)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 2,
                      }}
                    >
                      {card.suit}
                    </Text>
                  </View>

                  {/* Top left corner */}
                  <View
                    style={{
                      position: "absolute",
                      top: 4,
                      left: 4,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 8,
                        fontWeight: "700",
                        color: card.color === "red" ? "#dc2626" : "#1f2937",
                        lineHeight: 10,
                      }}
                    >
                      {card.value}
                    </Text>
                    <Text
                      style={{
                        fontSize: 10,
                        color: card.color === "red" ? "#dc2626" : "#1f2937",
                        lineHeight: 12,
                      }}
                    >
                      {card.suit}
                    </Text>
                  </View>

                  {/* Bottom right corner (rotated) */}
                  <View
                    style={{
                      position: "absolute",
                      bottom: 4,
                      right: 4,
                      alignItems: "center",
                      transform: [{ rotate: "180deg" }],
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 8,
                        fontWeight: "700",
                        color: card.color === "red" ? "#dc2626" : "#1f2937",
                        lineHeight: 10,
                      }}
                    >
                      {card.value}
                    </Text>
                    <Text
                      style={{
                        fontSize: 10,
                        color: card.color === "red" ? "#dc2626" : "#1f2937",
                        lineHeight: 12,
                      }}
                    >
                      {card.suit}
                    </Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </BlurView>

          {/* Selection border */}
          {isSelected && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 16,
                borderWidth: 3,
                borderColor: colors.gameAccent3,
                shadowColor: colors.gameAccent3,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 8,
              }}
            />
          )}
        </View>
      ) : (
        <View style={{ flex: 1, position: "relative" }}>
          {/* Card back glassmorphic design */}
          <BlurView
            intensity={60}
            tint="dark"
            style={{
              flex: 1,
              borderRadius: 16,
            }}
          >
            <LinearGradient
              colors={[
                "rgba(30, 30, 30, 0.98)",
                "rgba(45, 25, 55, 0.95)",
                "rgba(35, 20, 45, 0.92)",
              ]}
              style={{
                flex: 1,
                borderRadius: 16,
                padding: 1,
              }}
            >
              <View
                style={{
                  flex: 1,
                  borderRadius: 15,
                  backgroundColor: "rgba(168, 85, 247, 0.05)",
                  borderWidth: 0.5,
                  borderColor: "rgba(168, 85, 247, 0.3)",
                  position: "relative",
                }}
              >
                {/* Geometric pattern */}
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderRadius: 15,
                  }}
                >
                  {Array.from({ length: 8 }, (_, row) =>
                    Array.from({ length: 6 }, (_, col) => (
                      <View
                        key={`${row}-${col}`}
                        style={{
                          position: "absolute",
                          top: (row + 0.5) * (CARD_HEIGHT / 9),
                          left: (col + 0.5) * (CARD_WIDTH / 7),
                          width: 1.5,
                          height: 1.5,
                          backgroundColor: "rgba(168, 85, 247, 0.4)",
                          borderRadius: 1,
                          opacity: 0.6,
                        }}
                      />
                    )),
                  )}
                </View>

                {/* Center logo */}
                <View
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View
                    style={{
                      backgroundColor: "rgba(168, 85, 247, 0.15)",
                      borderRadius: 12,
                      paddingHorizontal: 8,
                      paddingVertical: 6,
                      borderWidth: 0.5,
                      borderColor: "rgba(168, 85, 247, 0.4)",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: Math.min(9, CARD_WIDTH / 6),
                        fontWeight: "800",
                        color: "rgba(168, 85, 247, 0.9)",
                        textAlign: "center",
                        letterSpacing: 1,
                        textShadowColor: "rgba(0, 0, 0, 0.8)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 2,
                      }}
                    >
                      GAME
                    </Text>
                    <Text
                      style={{
                        fontSize: Math.min(9, CARD_WIDTH / 6),
                        fontWeight: "800",
                        color: "rgba(168, 85, 247, 0.9)",
                        textAlign: "center",
                        letterSpacing: 1,
                        marginTop: 1,
                        textShadowColor: "rgba(0, 0, 0, 0.8)",
                        textShadowOffset: { width: 0, height: 1 },
                        textShadowRadius: 2,
                      }}
                    >
                      VOID
                    </Text>
                  </View>
                </View>

                {/* Subtle border glow */}
                <View
                  style={{
                    position: "absolute",
                    top: 1,
                    left: 1,
                    right: 1,
                    bottom: 1,
                    borderRadius: 14,
                    borderWidth: 0.5,
                    borderColor: "rgba(168, 85, 247, 0.2)",
                  }}
                />
              </View>
            </LinearGradient>
          </BlurView>

          {/* Selection border for back cards */}
          {isSelected && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                borderRadius: 16,
                borderWidth: 3,
                borderColor: colors.gameAccent3,
                shadowColor: colors.gameAccent3,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.8,
                shadowRadius: 8,
              }}
            />
          )}
        </View>
      )}
    </>
  );

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 16,
        overflow: "hidden",
        transform: [{ scale: isSelected ? 1.05 : 1 }],
        shadowColor: isSelected ? colors.gameAccent3 : "#000",
        shadowOffset: { width: 0, height: isSelected ? 8 : 4 },
        shadowOpacity: isSelected ? 0.6 : 0.25,
        shadowRadius: isSelected ? 16 : 8,
        elevation: isSelected ? 12 : 6,
        ...style,
      }}
    >
      {cardContent}
    </TouchableOpacity>
  );
};
