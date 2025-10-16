import React from "react";
import { View, TouchableOpacity, ScrollView } from "react-native";
import { BlurView } from "expo-blur";
import { useTheme } from "../../utils/theme";
import { Card } from "./Card";
import { CARD_WIDTH, CARD_HEIGHT } from "../../utils/solitaire/constants";

/**
 * Props:
 * - tableau
 * - onCardPress
 * - onEmptySpacePress
 * - onCardDoublePress
 * - isSelected
 * - registerDropZone(type, index, layout)    // optional (drag target registration)
 * - beginDrag(card, source, cardIndex)       // optional (start drag)
 */
export const Tableau = ({
  tableau,
  onCardPress,
  onEmptySpacePress,
  onCardDoublePress,
  isSelected,
  registerDropZone,
  beginDrag,
}) => {
  const { colors, isDark } = useTheme();

  return (
    <View style={{ paddingHorizontal: 20 }}>
      <View style={{ borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
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
          {/* Horizontal scroll to prevent Android right-edge cutoff */}
          <View
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 20 }}
          >
            <View style={{ flexDirection: "row", gap: 12 }}>
              {tableau.map((column, columnIndex) => (
                <TouchableOpacity
                  key={columnIndex}
                  onPress={() => {
                    if (column.length === 0) {
                      onEmptySpacePress(column, "tableau");
                    }
                  }}
                  onLayout={(e) =>
                    registerDropZone?.(
                      "tableau",
                      columnIndex,
                      e.nativeEvent.layout
                    )
                  }
                  style={{
                    alignItems: "center",
                    minHeight: CARD_HEIGHT * 2,
                    width: CARD_WIDTH - 8,
                  }}
                  activeOpacity={0.8}
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
                                    cardIndex
                                  )
                              : undefined
                          }
                          onDoublePress={
                            card.faceUp &&
                            cardIndex === column.length - 1 /* top card */
                              ? () =>
                                  onCardDoublePress(
                                    card,
                                    { type: "tableau", column },
                                    cardIndex
                                  )
                              : undefined
                          }
                          onLongPress={
                            card.faceUp
                              ? () =>
                                  beginDrag?.(
                                    card,
                                    { type: "tableau", column },
                                    cardIndex
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
          </View>
        </BlurView>
      </View>
    </View>
  );
};
