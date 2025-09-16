import React from "react";
import { View, Text } from "react-native";
import { useTheme } from "../../utils/theme";

export function CrosswordGrid({ grid, targetWords, solvedTargetsCount }) {
  const { colors } = useTheme();

  if (!grid) return null;

  return (
    <View
      style={{
        backgroundColor: colors.glassSecondary,
        borderRadius: 12,
        padding: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text
        style={{
          fontSize: 16,
          fontWeight: "bold",
          color: colors.text,
          marginBottom: 12,
          textAlign: "center",
          fontFamily: "Nunito-Bold",
        }}
      >
        Crossword ({solvedTargetsCount}/{targetWords.length})
      </Text>

      {grid.map((row, rowIndex) => (
        <View
          key={rowIndex}
          style={{ flexDirection: "row", justifyContent: "center" }}
        >
          {row.map((cell, colIndex) => {
            if (!cell) {
              return (
                <View
                  key={colIndex}
                  style={{ width: 30, height: 30, margin: 1 }}
                />
              );
            }

            const isPreFilled = cell.preFilled;
            const isSolved = cell.solved;
            const hasLetter = cell.letter !== "";

            return (
              <View
                key={colIndex}
                style={{
                  width: 30,
                  height: 30,
                  backgroundColor: isSolved
                    ? colors.primary + "40"
                    : isPreFilled
                      ? colors.primary + "20"
                      : colors.surface,
                  borderWidth: 1,
                  borderColor: hasLetter ? colors.primary : colors.border,
                  margin: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  shadowColor: hasLetter ? colors.primary : "transparent",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: hasLetter ? 0.3 : 0,
                  shadowRadius: 4,
                  elevation: hasLetter ? 4 : 0,
                }}
              >
                {cell.letterIndex === 0 && (
                  <Text
                    style={{
                      position: "absolute",
                      top: 1,
                      left: 2,
                      fontSize: 8,
                      color: colors.textSecondary,
                      fontWeight: "bold",
                      fontFamily: "Nunito-Bold",
                    }}
                  >
                    {cell.wordNumber}
                  </Text>
                )}
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "bold",
                    color: colors.text,
                    fontFamily: "Nunito-Bold",
                  }}
                >
                  {cell.letter}
                </Text>
              </View>
            );
          })}
        </View>
      ))}

      {/* Target words legend */}
      <View style={{ marginTop: 12 }}>
        <Text
          style={{
            fontSize: 12,
            color: colors.textSecondary,
            textAlign: "center",
            fontFamily: "Nunito-Medium",
          }}
        >
          Target Words:{" "}
          {targetWords
            .map((t) => `${t.number}. ${t.word} (${t.word.length})`)
            .join(" • ")}
        </Text>
      </View>
    </View>
  );
}
