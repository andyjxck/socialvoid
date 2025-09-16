import React from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import { useTheme } from "../../utils/theme";
import { Trophy } from "lucide-react-native";

const ResultModal = ({
  visible,
  onClose,
  score,
  foundWordsCount,
  bestScore,
  isNewBestScore,
  onPlayAgain,
  onBack,
}) => {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            backgroundColor: colors.glassSecondary,
            borderRadius: 16,
            padding: 20,
            margin: 20,
            maxWidth: 300,
            alignItems: "center",
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Trophy size={48} color={colors.primary} />

          <Text
            style={{
              fontSize: 24,
              fontWeight: "bold",
              color: colors.text,
              textAlign: "center",
              marginTop: 16,
              marginBottom: 8,
              fontFamily: "Nunito-Bold",
            }}
          >
            Time's Up!
          </Text>

          <Text
            style={{
              fontSize: 18,
              color: colors.primary,
              fontWeight: "bold",
              textAlign: "center",
              marginBottom: 16,
              fontFamily: "Nunito-Bold",
            }}
          >
            Final Score: {score}
          </Text>

          <Text
            style={{
              fontSize: 14,
              color: colors.textSecondary,
              textAlign: "center",
              marginBottom: 24,
              fontFamily: "Nunito-Medium",
            }}
          >
            Words found: {foundWordsCount}
            {isNewBestScore && "\n🎉 New Best Score!"}
          </Text>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity
              onPress={onPlayAgain}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 8,
                paddingHorizontal: 20,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "bold",
                  color: "white",
                  fontFamily: "Nunito-Bold",
                }}
              >
                Play Again
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onBack}
              style={{
                backgroundColor: colors.surfaceSecondary,
                borderRadius: 8,
                paddingHorizontal: 20,
                paddingVertical: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "bold",
                  color: colors.text,
                  fontFamily: "Nunito-Bold",
                }}
              >
                Back
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default ResultModal;
