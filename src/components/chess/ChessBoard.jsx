import React from "react";
import { View, Text, TouchableOpacity, Dimensions } from "react-native";
import { useTheme } from "../../utils/theme";
import { isWhitePiece, pieces } from "../../utils/chess/logic";

const { width: screenWidth } = Dimensions.get("window");

export function ChessBoard({
  board,
  availableMoves,
  onSquarePress,
  getSquareColor,
}) {
  const { colors } = useTheme();

  if (!board || board.length === 0) {
    return null;
  }

  return (
    <View
      style={{
        width: screenWidth - 40,
        height: screenWidth - 40,
        backgroundColor: colors.glassSecondary,
        borderRadius: 12,
        padding: 4,
        alignSelf: "center",
      }}
    >
      {board.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: "row", flex: 1 }}>
          {row.map((piece, colIndex) => {
            const isAvailableMove = availableMoves.some((move) => {
              if (Array.isArray(move) && move.length >= 2) {
                return move[0] === rowIndex && move[1] === colIndex;
              }
              return false;
            });

            // Check if this is a special move
            const specialMove = availableMoves.find((move) => {
              if (
                Array.isArray(move) &&
                move.length >= 3 &&
                move[0] === rowIndex &&
                move[1] === colIndex
              ) {
                return move[2]; // moveData
              }
              return null;
            });

            return (
              <TouchableOpacity
                key={`${rowIndex}-${colIndex}`}
                onPress={() => onSquarePress(rowIndex, colIndex)}
                style={{
                  flex: 1,
                  backgroundColor: getSquareColor(rowIndex, colIndex),
                  justifyContent: "center",
                  alignItems: "center",
                  borderWidth: 0.5,
                  borderColor: colors.overlay,
                  position: "relative",
                }}
              >
                {piece && (
                  <Text
                    style={{
                      fontSize: 28,
                      color: isWhitePiece(piece) ? "#FFFFFF" : "#000000",
                      textShadowColor: isWhitePiece(piece)
                        ? "#000000"
                        : "#FFFFFF",
                      textShadowOffset: { width: 1, height: 1 },
                      textShadowRadius: 2,
                    }}
                  >
                    {pieces[piece]}
                  </Text>
                )}

                {/* Standard move indicator */}
                {isAvailableMove && !piece && !specialMove && (
                  <View
                    style={{
                      position: "absolute",
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: colors.gameAccent5 + "80",
                    }}
                  />
                )}

                {/* Capture indicator */}
                {isAvailableMove && piece && !specialMove && (
                  <View
                    style={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: "#EF4444",
                    }}
                  />
                )}

                {/* Castling indicator */}
                {specialMove?.castling && (
                  <View
                    style={{
                      position: "absolute",
                      top: 2,
                      left: 2,
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      backgroundColor: "#8B5CF6",
                    }}
                  />
                )}

                {/* Pawn promotion indicator */}
                {specialMove?.promotion && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: 2,
                      right: 2,
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: "#F59E0B",
                    }}
                  />
                )}

                {/* En passant indicator */}
                {specialMove?.enPassant && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: 2,
                      left: 2,
                      width: 6,
                      height: 6,
                      borderRadius: 1,
                      backgroundColor: "#10B981",
                    }}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}
