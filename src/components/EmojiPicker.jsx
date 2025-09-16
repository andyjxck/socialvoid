import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../utils/theme';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';

const EMOJI_OPTIONS = [
  '🧩', '😀', '😃', '😄', '😁', '😆', '🥰', '😍', '🤩', '😎',
  '🤓', '🧐', '😊', '😇', '🙂', '🤗', '🤔', '😏', '😌', '😴',
  '🤠', '🥳', '🤯', '🤖', '👻', '🎯', '🎮', '🏆', '🌟', '⭐',
  '💎', '🔥', '⚡', '🌈', '🎨', '🎭', '🎪', '🎡', '🎢', '🎠'
];

export default function EmojiPicker({ visible, onClose, onSelect, currentEmoji }) {
  const { colors, isDark } = useTheme();

  const handleSelect = async (emoji) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect(emoji);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20,
        }}
      >
        <BlurView
          intensity={isDark ? 80 : 90}
          tint={isDark ? 'dark' : 'light'}
          style={{
            width: '100%',
            maxWidth: 350,
            backgroundColor: isDark ? 'rgba(31, 41, 55, 0.9)' : 'rgba(255, 255, 255, 0.9)',
            borderRadius: 24,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 20,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{
                fontFamily: 'Inter_700Bold',
                fontSize: 20,
                color: colors.text,
              }}
            >
              Choose Your Avatar
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: colors.glassSecondary,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <X size={18} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Emoji Grid */}
          <ScrollView
            contentContainerStyle={{
              padding: 20,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              {EMOJI_OPTIONS.map((emoji, index) => (
                <TouchableOpacity
                  key={index}
                  onPress={() => handleSelect(emoji)}
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 25,
                    backgroundColor: emoji === currentEmoji 
                      ? colors.gameAccent1 + '30' 
                      : colors.glassSecondary,
                    borderWidth: emoji === currentEmoji ? 2 : 0,
                    borderColor: colors.gameAccent1,
                    justifyContent: 'center',
                    alignItems: 'center',
                    shadowColor: emoji === currentEmoji ? colors.gameAccent1 : 'transparent',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.3,
                    shadowRadius: 4,
                  }}
                >
                  <Text style={{ fontSize: 24 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Footer */}
          <View
            style={{
              padding: 20,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: 'Inter_500Medium',
                fontSize: 14,
                color: colors.textSecondary,
                textAlign: 'center',
              }}
            >
              Your avatar will appear on the leaderboards and throughout the app
            </Text>
          </View>
        </BlurView>
      </View>
    </Modal>
  );
}