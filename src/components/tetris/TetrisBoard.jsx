import React from "react";
import { View } from "react-native";
import { useTheme } from "../../utils/theme";
import {
  BOARD_WIDTH,
  BOARD_HEIGHT,
  CELL_SIZE,
} from "../../utils/tetris/constants";

export default function TetrisBoard({ boardData }) {
  const { colors } = useTheme();

  // Skip the top 2 rows (indices 0 and 1) and show rows 2-19
  const visibleBoardData = boardData.slice(2);

  return (
    <View
      style={{
        width: BOARD_WIDTH * CELL_SIZE,
        height: (BOARD_HEIGHT - 2) * CELL_SIZE, // Reduced height by 2 rows
        backgroundColor: colors.glassSecondary,
        borderRadius: 12,
        padding: 2,
        alignSelf: "center",
        marginBottom: 20,
      }}
    >
      {visibleBoardData.map((row, rowIndex) => (
        <View
          key={rowIndex + 2} // Adjust key to reflect actual row index
          style={{
            flexDirection: "row",
            height: CELL_SIZE,
          }}
        >
          {row.map((cell, colIndex) => (
            <View
              key={`${rowIndex + 2}-${colIndex}`}
              style={{
                width: CELL_SIZE,
                height: CELL_SIZE,
                backgroundColor: cell.filled ? cell.color : colors.border,
                borderWidth: 0.5,
                borderColor: colors.overlay,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
