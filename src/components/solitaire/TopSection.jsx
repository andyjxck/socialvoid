import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";
import { Shuffle } from "lucide-react-native";
import { useTheme } from "../../utils/theme";
import { Card } from "./Card";
import { CARD_WIDTH, CARD_HEIGHT } from "../../utils/solitaire/constants";

export const TopSection = ({
  game,
  onStockPress,
  onCardPress,
  onEmptySpacePress,
  onCardDoublePress, // New prop for double-tap functionality
  isSelected,
}) => {
  const { colors, isDark } = useTheme();

  return (
    <View
      style={{
        paddingHorizontal: 20,
        marginBottom: 20,
      }}
    >
      <View
        style={{
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <BlurView
          intensity={isDark ? 40 : 60}
          tint={isDark ? "dark" : "light"}
          style={{
            backgroundColor: isDark
              ? "rgba(31, 41, 55, 0.6)"
              : "rgba(255, 255, 255, 0.6)",
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
              alignItems: "flex-start",
            }}
          >
            {/* Stock & Waste - Reduced width */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ alignItems: "center" }}>
                {/* Draw Button */}
                <TouchableOpacity
                  onPress={onStockPress}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    backgroundColor: colors.gameAccent3,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 6,
                    marginBottom: 6,
                  }}
                >
                  <Text
                    style={{
                      color: "#ffffff",
                      fontSize: 10,
                      fontWeight: "bold",
                    }}
                  >
                    DRAW
                  </Text>
                </TouchableOpacity>

                {/* Stock Pile */}
                <TouchableOpacity
                  onPress={onStockPress}
                  activeOpacity={0.8}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={{
                    position: "relative",
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                  }}
                >
                  {game.stock.length > 0 ? (
                    <>
                      <Card
                        card={{ faceUp: false }}
                        isSelected={false}
                        onPress={() => {}}
                      />
                      <View
                        style={{
                          position: "absolute",
                          top: -4,
                          right: -4,
                          backgroundColor: colors.gameAccent3,
                          borderRadius: 8,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          pointerEvents: "none",
                        }}
                      >
                        <Text
                          style={{
                            color: "#ffffff",
                            fontSize: 10,
                            fontWeight: "bold",
                          }}
                        >
                          {game.stock.length}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <View
                      style={{
                        width: CARD_WIDTH,
                        height: CARD_HEIGHT,
                        borderRadius: 8,
                        borderWidth: 2,
                        borderColor: colors.gameAccent3,
                        borderStyle: "dashed",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: colors.glassSecondary,
                      }}
                    >
                      <Shuffle size={20} color={colors.gameAccent3} />
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Waste pile - reduced width and better positioning */}
              <View style={{ width: CARD_WIDTH + 12, position: "relative" }}>
                {game.waste.length > 0 ? (
                  game.waste.slice(-3).map((card, index, arr) => (
                    <Card
                      key={card.id}
                      card={card}
                      isSelected={isSelected(card)}
                      onPress={
                        index === arr.length - 1
                          ? () =>
                              onCardPress(card, {
                                type: "waste",
                                column: game.waste,
                              })
                          : undefined
                      }
                      onDoublePress={
                        index === arr.length - 1 // Only top waste card can be double-tapped
                          ? () =>
                              onCardDoublePress(
                                card,
                                {
                                  type: "waste",
                                  column: game.waste,
                                },
                                game.waste.length - 1,
                              )
                          : undefined
                      }
                      style={{
                        position: index === 0 ? "relative" : "absolute",
                        left: index * 6, // Reduced overlap
                        zIndex: index,
                        opacity: index === arr.length - 1 ? 1 : 0.7,
                      }}
                    />
                  ))
                ) : (
                  <Card card={null} isSelected={false} />
                )}
              </View>
            </View>

            {/* Safe Zone (Foundations) - Better labeled and spaced */}
            <View style={{ alignItems: "center" }}>
              <View
                style={{
                  backgroundColor: colors.gameAccent3,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                  marginBottom: 6,
                }}
              >
                <Text
                  style={{
                    color: "#ffffff",
                    fontSize: 10,
                    fontWeight: "bold",
                  }}
                >
                  SAFE ZONE
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 4 }}>
                {game.foundations.map((foundation, index) => (
                  <TouchableOpacity
                    key={index}
                    activeOpacity={0.8}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={() => {
                      if (foundation.length > 0) {
                        onCardPress(foundation[foundation.length - 1], {
                          type: "foundation",
                          column: foundation,
                        });
                      } else {
                        onEmptySpacePress(foundation, "foundation");
                      }
                    }}
                  >
                    {foundation.length > 0 ? (
                      <Card
                        card={foundation[foundation.length - 1]}
                        isSelected={isSelected(
                          foundation[foundation.length - 1],
                        )}
                      />
                    ) : (
                      <View
                        style={{
                          width: CARD_WIDTH,
                          height: CARD_HEIGHT,
                          borderRadius: 8,
                          backgroundColor: colors.glassSecondary,
                          borderWidth: 1,
                          borderColor: colors.border,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 16,
                            color: colors.textSecondary,
                            opacity: 0.5,
                          }}
                        >
                          {["♠", "♥", "♦", "♣"][index]}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </BlurView>
      </View>
    </View>
  );
};
