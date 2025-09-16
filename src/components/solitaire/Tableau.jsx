import React from "react";
import { View, TouchableOpacity } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "../../utils/theme";
import { Card } from "./Card";
import { CARD_WIDTH, CARD_HEIGHT } from "../../utils/solitaire/constants";

export const Tableau = ({
  tableau,
  onCardPress,
  onEmptySpacePress,
  onCardDoublePress, // New prop for double-tap functionality
  isSelected,
}) => {
  const { colors, isDark } = useTheme();

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View
        style={{
          borderRadius: 16,
          overflow: "hidden",
          marginBottom: 20,
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
            }}
          >
            {tableau.map((column, columnIndex) => (
              <TouchableOpacity
                key={columnIndex}
                onPress={() => {
                  if (column.length === 0) {
                    onEmptySpacePress(column, "tableau");
                  }
                }}
                style={{
                  alignItems: "center",
                  minHeight: CARD_HEIGHT * 2,
                  width: CARD_WIDTH + 2,
                }}
              >
                {column.length === 0 ? (
                  <Card card={null} isSelected={false} />
                ) : (
                  column.map((card, cardIndex) => (
                    <View
                      key={card.id}
                      style={{
                        marginTop: cardIndex === 0 ? 0 : -CARD_HEIGHT * 0.75,
                        zIndex: cardIndex,
                      }}
                    >
                      <Card
                        card={card}
                        isSelected={isSelected(card)}
                        onPress={
                          card.faceUp
                            ? () =>
                                onCardPress(
                                  card,
                                  { type: "tableau", column },
                                  cardIndex,
                                )
                            : undefined
                        }
                        onDoublePress={
                          card.faceUp && cardIndex === column.length - 1 // Only top cards can be double-tapped
                            ? () =>
                                onCardDoublePress(
                                  card,
                                  { type: "tableau", column },
                                  cardIndex,
                                )
                            : undefined
                        }
                      />
                    </View>
                  ))
                )}
              </TouchableOpacity>
            ))}
          </View>
        </BlurView>
      </View>
    </View>
  );
};
