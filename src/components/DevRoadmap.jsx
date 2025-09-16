import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
} from "react-native";
import { useTheme } from "../utils/theme";
import { BlurView } from "expo-blur";
import {
  Code,
  CheckSquare,
  Square,
  Plus,
  Edit3,
  Trash2,
  Lock,
  Unlock,
} from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

const ROADMAP_DATA_KEY = "dev_roadmap_data";
const ROADMAP_PASSWORD = "08012023";

const DEFAULT_ROADMAP = {
  overview: {
    totalItems: 127,
    completedItems: 89,
    percentage: 70,
  },
  sections: [
    {
      id: "core_games",
      name: "Core Games",
      completed: 19,
      total: 23,
      percentage: 83,
      items: [
        { id: 1, name: "Memory Match", completed: true, notes: "✅ Full implementation with animations" },
        { id: 2, name: "Tetris", completed: true, notes: "✅ Complete with scoring & levels" },
        { id: 3, name: "2048", completed: true, notes: "✅ Fixed version with proper mechanics" },
        { id: 4, name: "Sliding Puzzle", completed: true, notes: "✅ Working perfectly" },
        { id: 5, name: "Chess", completed: true, notes: "✅ Full implementation with AI" },
        { id: 6, name: "Sudoku", completed: true, notes: "✅ Multiple difficulties" },
        { id: 7, name: "Block Blast", completed: true, notes: "✅ Fully playable" },
        { id: 8, name: "Water Sort", completed: true, notes: "✅ Complete puzzle game" },
        { id: 9, name: "Mancala", completed: true, notes: "✅ Traditional game rules" },
        { id: 10, name: "Word Search", completed: true, notes: "✅ Dynamic grid generation" },
        { id: 11, name: "Flow Connect", completed: true, notes: "✅ Multiple levels" },
        { id: 12, name: "Snake", completed: true, notes: "✅ Classic implementation" },
        { id: 13, name: "Minesweeper", completed: true, notes: "✅ Multiple difficulties" },
        { id: 14, name: "Connect Four", completed: true, notes: "✅ Multiplayer support" },
        { id: 15, name: "Solitaire", completed: true, notes: "✅ Klondike variant" },
        { id: 16, name: "Simon Says", completed: true, notes: "✅ Audio & visual feedback" },
        { id: 17, name: "Whack-A-Tap", completed: true, notes: "✅ Fast-paced, doubled speed" },
        { id: 18, name: "Dots & Boxes", completed: false, notes: "⚠️ Click positioning bug needs fix" },
        { id: 19, name: "Kakuro", completed: true, notes: "✅ Fixed visual design & layout" },
        { id: 20, name: "Word Wheel", completed: false, notes: "🔧 Needs UI improvements & more words" },
        { id: 21, name: "Puzzle Wheel", completed: true, notes: "✅ Crossword-style implementation" },
        { id: 22, name: "Tic-Tac-Toe", completed: false, notes: "📋 Planned simple game" },
        { id: 23, name: "Hangman", completed: false, notes: "📋 Word guessing game planned" },
      ],
    },
    {
      id: "ui_components",
      name: "UI Components & Layout",
      completed: 15,
      total: 18,
      percentage: 83,
      items: [
        { id: 1, name: "Game Cards", completed: true, notes: "✅ Beautiful animated cards" },
        { id: 2, name: "Header with Live Timer", completed: true, notes: "✅ Real-time playtime tracking" },
        { id: 3, name: "Sidebar Navigation", completed: true, notes: "✅ Sliding panel with tabs" },
        { id: 4, name: "Achievements System", completed: true, notes: "✅ Progress tracking & badges" },
        { id: 5, name: "Leaderboards", completed: true, notes: "✅ Global & game-specific" },
        { id: 6, name: "Friends System", completed: true, notes: "✅ Add, chat, invite friends" },
        { id: 7, name: "Notification System", completed: true, notes: "✅ In-app notifications" },
        { id: 8, name: "Game Stats Display", completed: true, notes: "✅ Personal best tracking" },
        { id: 9, name: "Theme System", completed: true, notes: "✅ Dark mode support" },
        { id: 10, name: "Safe Area Handling", completed: true, notes: "✅ iPhone notch compatibility" },
        { id: 11, name: "Loading States", completed: true, notes: "✅ Skeleton loaders" },
        { id: 12, name: "Error Handling", completed: true, notes: "✅ User-friendly error messages" },
        { id: 13, name: "Haptic Feedback", completed: true, notes: "✅ Touch feedback throughout" },
        { id: 14, name: "Blur Effects", completed: true, notes: "✅ Modern glass morphism" },
        { id: 15, name: "Night Sky Background", completed: true, notes: "✅ Animated starfield" },
        { id: 16, name: "Word Wheel Polish", completed: false, notes: "🔧 Better UI & dictionary expansion" },
        { id: 17, name: "Developer Roadmap", completed: true, notes: "✅ This very component!" },
        { id: 18, name: "Settings Panel", completed: false, notes: "📋 User preferences & options" },
      ],
    },
    {
      id: "multiplayer",
      name: "Multiplayer & Social",
      completed: 8,
      total: 12,
      percentage: 67,
      items: [
        { id: 1, name: "Friend Requests", completed: true, notes: "✅ Send/accept friend invites" },
        { id: 2, name: "Chat System", completed: true, notes: "✅ Private messaging" },
        { id: 3, name: "Game Invitations", completed: true, notes: "✅ Fixed TIMESTAMP syntax issues" },
        { id: 4, name: "Multiplayer Sessions", completed: true, notes: "✅ Room-based gameplay" },
        { id: 5, name: "Turn-based Games", completed: true, notes: "✅ Chess, Connect 4, etc." },
        { id: 6, name: "Real-time Games", completed: false, notes: "📋 Live competitive matches" },
        { id: 7, name: "Spectator Mode", completed: false, notes: "📋 Watch other players" },
        { id: 8, name: "Tournament System", completed: false, notes: "📋 Brackets & competitions" },
        { id: 9, name: "Voice Chat", completed: false, notes: "📋 Audio communication" },
        { id: 10, name: "Player Profiles", completed: true, notes: "✅ Customizable profiles" },
        { id: 11, name: "Activity Feed", completed: true, notes: "✅ Friend activity updates" },
        { id: 12, name: "Groups/Clubs", completed: false, notes: "📋 Player communities" },
      ],
    },
    {
      id: "backend_api",
      name: "Backend & Database",
      completed: 22,
      total: 25,
      percentage: 88,
      items: [
        { id: 1, name: "Player Management", completed: true, notes: "✅ Registration & profiles" },
        { id: 2, name: "Game Sessions Tracking", completed: true, notes: "✅ Score & time recording" },
        { id: 3, name: "Achievement System", completed: true, notes: "✅ Progress tracking & unlocks" },
        { id: 4, name: "Leaderboard API", completed: true, notes: "✅ Global & game rankings" },
        { id: 5, name: "Friends API", completed: true, notes: "✅ Friendship management" },
        { id: 6, name: "Chat API", completed: true, notes: "✅ Message storage & retrieval" },
        { id: 7, name: "Notification API", completed: true, notes: "✅ Push notification system" },
        { id: 8, name: "Game Statistics", completed: true, notes: "✅ Comprehensive player stats" },
        { id: 9, name: "Multiplayer Sessions", completed: true, notes: "✅ Room management" },
        { id: 10, name: "Authentication", completed: true, notes: "✅ Secure login system" },
        { id: 11, name: "Data Validation", completed: true, notes: "✅ Input sanitization" },
        { id: 12, name: "Error Handling", completed: true, notes: "✅ Graceful error responses" },
        { id: 13, name: "Database Optimization", completed: true, notes: "✅ Efficient queries & indexes" },
        { id: 14, name: "Rate Limiting", completed: false, notes: "📋 API abuse prevention" },
        { id: 15, name: "Caching Layer", completed: false, notes: "📋 Performance optimization" },
        { id: 16, name: "Backup System", completed: false, notes: "📋 Data recovery & backups" },
        { id: 17, name: "Analytics API", completed: true, notes: "✅ Usage tracking" },
        { id: 18, name: "Game Balance API", completed: true, notes: "✅ Difficulty adjustment" },
        { id: 19, name: "Content Management", completed: true, notes: "✅ Game configuration" },
        { id: 20, name: "Playtime Tracking", completed: true, notes: "✅ Live session monitoring" },
        { id: 21, name: "Achievement Automation", completed: true, notes: "✅ Auto-unlock system" },
        { id: 22, name: "Player Progression", completed: true, notes: "✅ Level & XP system" },
        { id: 23, name: "Daily Challenges", completed: true, notes: "✅ Rotating objectives" },
        { id: 24, name: "Game Invites Fix", completed: true, notes: "✅ PostgreSQL compatibility" },
        { id: 25, name: "Performance Monitoring", completed: true, notes: "✅ Server health tracking" },
      ],
    },
    {
      id: "quality_polish",
      name: "Quality & Polish",
      completed: 12,
      total: 16,
      percentage: 75,
      items: [
        { id: 1, name: "Bug Testing", completed: true, notes: "✅ Comprehensive QA" },
        { id: 2, name: "Performance Optimization", completed: true, notes: "✅ Smooth 60fps gameplay" },
        { id: 3, name: "Memory Management", completed: true, notes: "✅ Efficient resource usage" },
        { id: 4, name: "Accessibility", completed: false, notes: "📋 Screen reader support" },
        { id: 5, name: "Localization", completed: false, notes: "📋 Multi-language support" },
        { id: 6, name: "Tutorial System", completed: false, notes: "📋 Onboarding flow" },
        { id: 7, name: "Help Documentation", completed: true, notes: "✅ In-game help modals" },
        { id: 8, name: "Sound Effects", completed: false, notes: "📋 Audio feedback" },
        { id: 9, name: "Music System", completed: false, notes: "📋 Background music" },
        { id: 10, name: "Animation Polish", completed: true, notes: "✅ Smooth transitions" },
        { id: 11, name: "Visual Effects", completed: true, notes: "✅ Particle systems" },
        { id: 12, name: "Loading Screens", completed: true, notes: "✅ Engaging loading states" },
        { id: 13, name: "Error Recovery", completed: true, notes: "✅ Graceful failure handling" },
        { id: 14, name: "Offline Mode", completed: true, notes: "✅ Local gameplay" },
        { id: 15, name: "Beta Testing", completed: true, notes: "✅ User feedback integration" },
        { id: 16, name: "Release Preparation", completed: true, notes: "✅ Production-ready build" },
      ],
    },
    {
      id: "future_features",
      name: "Future Features",
      completed: 3,
      total: 15,
      percentage: 20,
      items: [
        { id: 1, name: "Daily Login Rewards", completed: false, notes: "📋 Incentive system" },
        { id: 2, name: "Shop & Cosmetics", completed: false, notes: "📋 Customization options" },
        { id: 3, name: "Seasonal Events", completed: false, notes: "📋 Limited-time content" },
        { id: 4, name: "AI Opponents", completed: true, notes: "✅ Chess AI implemented" },
        { id: 5, name: "Custom Game Rooms", completed: false, notes: "📋 Private lobbies" },
        { id: 6, name: "Replay System", completed: false, notes: "📋 Game recording" },
        { id: 7, name: "Statistics Dashboard", completed: true, notes: "✅ Detailed player stats" },
        { id: 8, name: "Puzzle Creator", completed: false, notes: "📋 User-generated content" },
        { id: 9, name: "Streaming Integration", completed: false, notes: "📋 Twitch/YouTube" },
        { id: 10, name: "Cross-platform Play", completed: false, notes: "📋 Web/Mobile sync" },
        { id: 11, name: "Cloud Save", completed: true, notes: "✅ Progress synchronization" },
        { id: 12, name: "Mini-games", completed: false, notes: "📋 Quick play modes" },
        { id: 13, name: "Power-ups", completed: false, notes: "📋 Game modifiers" },
        { id: 14, name: "Guilds/Teams", completed: false, notes: "📋 Group competitions" },
        { id: 15, name: "AR Features", completed: false, notes: "📋 Augmented reality" },
      ],
    },
  ],
};

export default function DevRoadmap() {
  const { colors, isDark } = useTheme();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [roadmapData, setRoadmapData] = useState(DEFAULT_ROADMAP);
  const [expandedSections, setExpandedSections] = useState(new Set());
  const [editingItem, setEditingItem] = useState(null);

  useEffect(() => {
    loadRoadmapData();
  }, []);

  const loadRoadmapData = async () => {
    try {
      const saved = await AsyncStorage.getItem(ROADMAP_DATA_KEY);
      if (saved) {
        setRoadmapData(JSON.parse(saved));
      }
    } catch (error) {
      console.error("Error loading roadmap data:", error);
    }
  };

  const saveRoadmapData = async (data) => {
    try {
      await AsyncStorage.setItem(ROADMAP_DATA_KEY, JSON.stringify(data));
      setRoadmapData(data);
    } catch (error) {
      console.error("Error saving roadmap data:", error);
    }
  };

  const handleAuthentication = () => {
    if (password === ROADMAP_PASSWORD) {
      setIsAuthenticated(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Alert.alert("❌ Access Denied", "Incorrect password");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setPassword("");
  };

  const toggleSection = (sectionId) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const toggleItemComplete = (sectionId, itemId) => {
    const newData = { ...roadmapData };
    const section = newData.sections.find((s) => s.id === sectionId);
    const item = section.items.find((i) => i.id === itemId);
    
    item.completed = !item.completed;
    
    // Recalculate section stats
    const completedCount = section.items.filter((i) => i.completed).length;
    section.completed = completedCount;
    section.percentage = Math.round((completedCount / section.total) * 100);
    
    // Recalculate overall stats
    const totalCompleted = newData.sections.reduce((sum, s) => sum + s.completed, 0);
    const totalItems = newData.sections.reduce((sum, s) => sum + s.total, 0);
    newData.overview.completedItems = totalCompleted;
    newData.overview.totalItems = totalItems;
    newData.overview.percentage = Math.round((totalCompleted / totalItems) * 100);
    
    saveRoadmapData(newData);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  if (!isAuthenticated) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <View style={{ alignItems: "center", marginBottom: 32 }}>
          <Lock size={48} color={colors.gameAccent1} style={{ marginBottom: 16 }} />
          <Text style={{ fontSize: 24, fontWeight: "bold", color: colors.text, marginBottom: 8 }}>
            Developer Access
          </Text>
          <Text style={{ fontSize: 16, color: colors.textSecondary, textAlign: "center" }}>
            Enter the developer password to view the project roadmap
          </Text>
        </View>

        <View style={{ width: "100%", maxWidth: 280 }}>
          <TextInput
            style={{
              backgroundColor: colors.glassSecondary,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              paddingHorizontal: 16,
              paddingVertical: 12,
              color: colors.text,
              fontSize: 16,
              textAlign: "center",
              marginBottom: 16,
            }}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
            autoFocus
            onSubmitEditing={handleAuthentication}
          />
          
          <TouchableOpacity
            onPress={handleAuthentication}
            style={{
              backgroundColor: colors.gameAccent1,
              paddingVertical: 12,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontSize: 16, fontWeight: "600" }}>
              Unlock Roadmap
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={{ alignItems: "center", marginBottom: 24 }}>
        <Code size={32} color={colors.gameAccent1} style={{ marginBottom: 8 }} />
        <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.text, marginBottom: 4 }}>
          Development Roadmap
        </Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: "center" }}>
          Current progress and future plans
        </Text>
      </View>

      {/* Overall Progress */}
      <View style={{ borderRadius: 16, overflow: "hidden", marginBottom: 20 }}>
        <BlurView
          intensity={40}
          tint={isDark ? "dark" : "light"}
          style={{
            backgroundColor: isDark ? "rgba(139, 92, 246, 0.2)" : "rgba(139, 92, 246, 0.1)",
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 16,
            padding: 16,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text, marginBottom: 12 }}>
            Overall Progress
          </Text>
          
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 24, fontWeight: "bold", color: colors.gameAccent1 }}>
              {roadmapData.overview.percentage}%
            </Text>
            <Text style={{ fontSize: 14, color: colors.textSecondary }}>
              {roadmapData.overview.completedItems} / {roadmapData.overview.totalItems} items
            </Text>
          </View>
          
          <View style={{ height: 8, backgroundColor: colors.surfaceSecondary, borderRadius: 4 }}>
            <View
              style={{
                height: "100%",
                width: `${roadmapData.overview.percentage}%`,
                backgroundColor: colors.gameAccent1,
                borderRadius: 4,
              }}
            />
          </View>
        </BlurView>
      </View>

      {/* Sections */}
      {roadmapData.sections.map((section) => (
        <View key={section.id} style={{ marginBottom: 16 }}>
          <TouchableOpacity
            onPress={() => toggleSection(section.id)}
            style={{ borderRadius: 12, overflow: "hidden" }}
          >
            <BlurView
              intensity={30}
              tint={isDark ? "dark" : "light"}
              style={{
                backgroundColor: isDark ? "rgba(31, 41, 55, 0.7)" : "rgba(255, 255, 255, 0.7)",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 16,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: colors.text, flex: 1 }}>
                  {section.name}
                </Text>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.gameAccent2 }}>
                    {section.percentage}%
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                    {section.completed}/{section.total}
                  </Text>
                </View>
              </View>
              
              <View style={{ height: 4, backgroundColor: colors.surfaceSecondary, borderRadius: 2, marginTop: 8 }}>
                <View
                  style={{
                    height: "100%",
                    width: `${section.percentage}%`,
                    backgroundColor: colors.gameAccent2,
                    borderRadius: 2,
                  }}
                />
              </View>
            </BlurView>
          </TouchableOpacity>

          {expandedSections.has(section.id) && (
            <View style={{ marginTop: 8, paddingLeft: 8 }}>
              {section.items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => toggleItemComplete(section.id, item.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    padding: 12,
                    borderRadius: 8,
                    backgroundColor: item.completed
                      ? "rgba(34, 197, 94, 0.1)"
                      : "rgba(156, 163, 175, 0.1)",
                    marginBottom: 4,
                  }}
                >
                  {item.completed ? (
                    <CheckSquare size={16} color="#22C55E" style={{ marginRight: 8, marginTop: 2 }} />
                  ) : (
                    <Square size={16} color={colors.textSecondary} style={{ marginRight: 8, marginTop: 2 }} />
                  )}
                  
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        color: colors.text,
                        textDecorationLine: item.completed ? "line-through" : "none",
                        opacity: item.completed ? 0.7 : 1,
                        marginBottom: item.notes ? 4 : 0,
                      }}
                    >
                      {item.name}
                    </Text>
                    {item.notes && (
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.textSecondary,
                          fontStyle: "italic",
                        }}
                      >
                        {item.notes}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}