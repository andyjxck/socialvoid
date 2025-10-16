// components/tetris/TetrisBoard.jsx  (REPLACE ENTIRE FILE)
import React from "react";
import { View } from "react-native";
import { useTheme } from "../../utils/theme";

/**
 * Props:
 * - boardData: array[rows][cols] of 0 | string(color) | { filled:boolean, color?:string }
 * - cellSize: number (px) — REQUIRED: exact pixel size of each cell
 * - skipTopRows: number — how many spawn rows to hide visually (default 2)
 */
export default function TetrisBoard({ boardData = [], cellSize, skipTopRows = 2 }) {
  const { colors } = useTheme();

  if (!Array.isArray(boardData) || !boardData.length || !cellSize) {
    return <View />;
  }

  const rows = boardData.length;
  const cols = boardData[0].length || 0;

  // Hide spawn rows visually
  const startRow = Math.min(skipTopRows, Math.max(0, rows - 1));
  const visibleBoard = boardData.slice(startRow);
  const visibleRows = visibleBoard.length;

  const boardWidth = cols * cellSize;
  const boardHeight = visibleRows * cellSize;

  const getCellColor = (cell) => {
    if (cell && typeof cell === "object") {
      return cell.filled ? (cell.color || null) : null;
    }
    return cell ? cell : null;
  };

  return (
    <View
      style={{
        width: boardWidth,
        height: boardHeight,
        backgroundColor: colors.glassSecondary,
        borderRadius: 12,
        padding: 2,
      }}
    >
      {visibleBoard.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", height: cellSize }}>
          {row.map((cell, c) => {
            const color = getCellColor(cell);
            return (
              <View
                key={`${r}-${c}`}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: color || colors.border,
                  borderWidth: 0.5,
                  borderColor: colors.overlay,
                }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}
