import React, { useMemo, useRef, useState } from "react";
import { View, Dimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { useTheme } from "../../utils/theme";

const { width: screenWidth } = Dimensions.get("window");

// Board layout constants (keep in sync with styles below)
const BOARD_SIDE = screenWidth - 40; // outer board square side
const BOARD_PADDING = 8; // inner padding inside the rounded board
const CELL_GAP = 4; // gap between cells

export default function FlowConnectBoard({
  gridSize,
  getCellContent,
  handleCellTap,
  currentPath,
}) {
  const { isDark } = useTheme();

  // Compute exact cell size from inner width and gap count
  const { cellSize, innerSide } = useMemo(() => {
    const inner = BOARD_SIDE - BOARD_PADDING * 2; // drawable inner area
    const totalGaps = CELL_GAP * (gridSize - 1);
    const size = Math.floor((inner - totalGaps) / gridSize);
    return { cellSize: size, innerSide: size * gridSize + totalGaps };
  }, [gridSize]);

  const boardRef = useRef(null);
  const dragOriginRef = useRef({ x: 0, y: 0 }); // absolute screen coords (top-left of inner grid)
  const draggingRef = useRef(false);
  const lastCellRef = useRef(null);

  // Convert absolute screen x/y → (row,col) using the captured origin onStart
  const getGridPosFromAbsolute = (absX, absY) => {
    const origin = dragOriginRef.current;
    const rx = absX - origin.x; // relative to inner area (padding already removed)
    const ry = absY - origin.y;

    if (rx < 0 || ry < 0 || rx > innerSide || ry > innerSide) return null;

    // Add half-gap so edges bias toward the next cell cleanly
    const col = Math.floor((rx + CELL_GAP / 2) / (cellSize + CELL_GAP));
    const row = Math.floor((ry + CELL_GAP / 2) / (cellSize + CELL_GAP));

    if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) return null;
    return { row, col };
  };

  const pan = Gesture.Pan()
    .onStart((e) => {
      if (!boardRef.current) return;

      // Capture absolute position of the board's inner grid once
      boardRef.current.measureInWindow((winX, winY, width, height) => {
        // inner top-left = outer top-left + padding
        dragOriginRef.current = {
          x: winX + BOARD_PADDING + (BOARD_SIDE - width) / 2, // compensate if parent centered
          y: winY + BOARD_PADDING + (BOARD_SIDE - height) / 2,
        };

        const pos = getGridPosFromAbsolute(e.absoluteX, e.absoluteY);
        if (!pos) return;

        draggingRef.current = true;
        lastCellRef.current = pos;

        // Treat start as a tap
        handleCellTap(pos.row, pos.col);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      });
    })
    .onUpdate((e) => {
      if (!draggingRef.current) return;
      const pos = getGridPosFromAbsolute(e.absoluteX, e.absoluteY);
      if (!pos) return;

      const last = lastCellRef.current;
      if (!last || last.row !== pos.row || last.col !== pos.col) {
        lastCellRef.current = pos;
        handleCellTap(pos.row, pos.col);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    })
    .onEnd(() => {
      if (draggingRef.current) {
        draggingRef.current = false;
        lastCellRef.current = null;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    })
    .onTouchesDown(() => {
      // Reset state when new touch begins
      draggingRef.current = false;
      lastCellRef.current = null;
    });

  // Render a simple grid with exact sizes; no touchables to steal gestures.
  return (
    <GestureDetector gesture={pan}>
      <View
        ref={boardRef}
        style={{
          width: BOARD_SIDE,
          height: BOARD_SIDE,
          alignSelf: "center",
          borderRadius: 12,
          padding: BOARD_PADDING,
          marginBottom: 20,
          backgroundColor: isDark
            ? "rgba(31, 41, 55, 0.8)"
            : "rgba(255, 255, 255, 0.9)",
        }}
      >
        {/* Center the inner grid square just in case rounding shrunk innerSide */}
        <View
          style={{
            width: innerSide,
            height: innerSide,
            alignSelf: "center",
          }}
        >
          {Array.from({ length: gridSize }).map((_, r) => (
            <View key={`row-${r}`} style={{ flexDirection: "row" }}>
              {Array.from({ length: gridSize }).map((__, c) => {
                const content = getCellContent(r, c);
                const isCurrentTip =
                  !!currentPath &&
                  currentPath.path?.length > 0 &&
                  currentPath.path[currentPath.path.length - 1]?.row === r &&
                  currentPath.path[currentPath.path.length - 1]?.col === c;

                // visual colors
                const bg = content
                  ? content.type === "endpoint"
                    ? content.color
                    : content.color + "90"
                  : isDark
                  ? "rgba(55, 65, 81, 0.3)"
                  : "rgba(243, 244, 246, 0.5)";

                return (
                  <View
                    key={`cell-${r}-${c}`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      marginRight: c < gridSize - 1 ? CELL_GAP : 0,
                      marginBottom: r < gridSize - 1 ? CELL_GAP : 0,
                      backgroundColor: bg,
                      borderRadius:
                        content && content.type === "endpoint"
                          ? cellSize / 2
                          : 6,
                      borderWidth: isCurrentTip ? 3 : 0,
                      borderColor: isCurrentTip
                        ? currentPath?.color || "transparent"
                        : "transparent",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {content && content.type === "endpoint" && (
                      <View
                        style={{
                          width: Math.max(6, Math.floor(cellSize * 0.3)),
                          height: Math.max(6, Math.floor(cellSize * 0.3)),
                          backgroundColor: "#FFFFFF",
                          borderRadius: Math.floor(cellSize * 0.15),
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.25,
                          shadowRadius: 3,
                          elevation: 3,
                        }}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </GestureDetector>
  );
}