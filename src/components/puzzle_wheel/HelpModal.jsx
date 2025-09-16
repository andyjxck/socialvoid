import React from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import { useTheme } from "../../utils/theme";

const HelpModal = ({ visible, onClose }) => {
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
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: "bold",
              color: colors.text,
              textAlign: "center",
              marginBottom: 16,
              fontFamily: "Nunito-Bold",
            }}
          >
            How to Play
          </Text>

          <Text
            style={{
              fontSize: 16,
              color: colors.text,
              lineHeight: 24,
              marginBottom: 20,
              fontFamily: "Nunito-Regular",
            }}
          >
            Form words using the letters in the wheel. Every word must include
            the center letter. Words must be 3+ letters long. Letters can be
            reused.
            {"\n\n"}1 point per word
            {"\n"}+2 bonus for 5+ letters
            {"\n"}+5 bonus for 7+ letters
          </Text>

          <TouchableOpacity
            onPress={onClose}
            style={{
              backgroundColor: colors.primary,
              borderRadius: 8,
              padding: 12,
              alignItems: "center",
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
              Got it!
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default HelpModal;
