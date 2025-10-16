// components/DevRoadmap.jsx
import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../utils/theme";
import { BlurView } from "expo-blur";
import { CheckCircle2, Circle, Target, Lock } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

const ROADMAP_DATA_KEY = "dev_roadmap_data";
const ROADMAP_PASSWORD = "08012023";

const DEFAULT_ROADMAP = {
  sections: [
    { id: "core_games",     name: "Core Games",            completed: 17, total: 27, description: "Playable catalog foundations." },
    { id: "ui_components",  name: "UI Components & Layout",completed: 17, total: 18, description: "Reusable UI, polish, theming." },
    { id: "multiplayer",    name: "Multiplayer & Social",  completed: 3,  total: 7, description: "Friends, chat, invites." },
    { id: "backend_api",    name: "Backend & Database",    completed: 23, total: 25, description: "APIs, tracking, Ops." },
    { id: "quality_polish", name: "Quality & Polish",      completed: 14, total: 16, description: "Perf, QA, accessibility." },
    { id: "future_features",name: "Future Features",       completed: 3,  total: 15, description: "Long-term expansions." },
  ],
};

const NEXT_TARGETS = [
  { id: "t1", title: "Finish Achievements", note: "Ensure awards trigger reliably across games.", status: "inprogress" },
  { id: "t2", title: "Per-game Leaderboard", note: "Dedicated boards per title + filters.", status: "planned" },
  { id: "t3", title: "Multiplayer & Pass-n-Play", note: "Realtime + local hot-seat.", status: "planned" },
  { id: "t4", title: "Add More Games", note: "Expand the arcade lineup.", status: "planned" },
];

export default function DevRoadmap() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [isAuthed, setIsAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [data, setData] = useState(DEFAULT_ROADMAP);
  const [expanded, setExpanded] = useState(null); // which section is expanded

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(ROADMAP_DATA_KEY);
        if (saved) setData(JSON.parse(saved));
      } catch {}
    })();
  }, []);

  const handleAuth = () => {
    if (password === ROADMAP_PASSWORD) {
      setIsAuthed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Alert.alert("Access Denied", "Incorrect password.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setPassword("");
  };

  const timelineColor = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)";

  if (!isAuthed) {
    // Centered, compact gate that never gets hidden by the keyboard (sheet is keyboard-aware)
    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 16),
          paddingTop: 8,
          alignItems: "center",
          justifyContent: "center",
          minHeight: 360,
        }}
      >
        <BlurView
          intensity={40}
          tint={isDark ? "dark" : "light"}
          style={{
            width: "100%",
            maxWidth: 360,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: isDark ? "rgba(139,92,246,0.25)" : "rgba(139,92,246,0.2)",
            padding: 18,
            backgroundColor: isDark ? "rgba(30,41,59,0.6)" : "rgba(255,255,255,0.7)",
          }}
        >
          <View style={{ alignItems: "center", marginBottom: 14 }}>
            <Lock size={38} color={colors.gameAccent1} />
            <Text style={{ marginTop: 8, fontSize: 18, fontWeight: "700", color: colors.text }}>
              Developer Access
            </Text>
            <Text style={{ marginTop: 4, fontSize: 13, color: colors.textSecondary, textAlign: "center" }}>
              Enter the password to view the internal roadmap.
            </Text>
          </View>

          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleAuth}
            style={{
              backgroundColor: isDark ? "rgba(2,6,23,0.4)" : "rgba(255,255,255,0.9)",
              borderWidth: 1,
              borderColor: isDark ? "rgba(148,163,184,0.25)" : "rgba(148,163,184,0.35)",
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              color: colors.text,
              fontSize: 16,
            }}
          />

          <TouchableOpacity
            onPress={handleAuth}
            style={{
              marginTop: 12,
              backgroundColor: colors.gameAccent1,
              borderRadius: 12,
              paddingVertical: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Unlock</Text>
          </TouchableOpacity>
        </BlurView>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: Math.max(insets.bottom, 16),
        paddingTop: 8,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Next Targets */}
      <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, marginBottom: 8 }}>
        Next Targets
      </Text>

      <View style={{ borderRadius: 14, overflow: "hidden", marginBottom: 14 }}>
        <BlurView
          intensity={35}
          tint={isDark ? "dark" : "light"}
          style={{
            backgroundColor: isDark ? "rgba(31,41,55,0.6)" : "rgba(255,255,255,0.7)",
            borderWidth: 1,
            borderColor: isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.25)",
            borderRadius: 14,
            padding: 12,
          }}
        >
          {NEXT_TARGETS.map((t, idx) => {
            const active = t.status === "inprogress";
            return (
              <View
                key={t.id}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  paddingVertical: 8,
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: isDark ? "rgba(148,163,184,0.15)" : "rgba(148,163,184,0.22)",
                }}
              >
                {active ? (
                  <Target size={18} color={colors.gameAccent1} style={{ marginTop: 2, marginRight: 10 }} />
                ) : (
                  <Circle size={18} color={colors.textSecondary} style={{ marginTop: 2, marginRight: 10 }} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", color: colors.text }}>{t.title}</Text>
                  {!!t.note && (
                    <Text style={{ marginTop: 2, fontSize: 12, color: colors.textSecondary }}>{t.note}</Text>
                  )}
                </View>
                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    backgroundColor:
                      t.status === "inprogress"
                        ? "rgba(34,197,94,0.16)"
                        : "rgba(99,102,241,0.14)",
                    borderWidth: 1,
                    borderColor:
                      t.status === "inprogress"
                        ? "rgba(34,197,94,0.35)"
                        : "rgba(99,102,241,0.28)",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: t.status === "inprogress" ? "#22c55e" : colors.gameAccent1,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    {t.status === "inprogress" ? "In Progress" : "Planned"}
                  </Text>
                </View>
              </View>
            );
          })}
        </BlurView>
      </View>

      {/* Vertical Roadmap Timeline */}
      <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, marginBottom: 8 }}>
        Roadmap
      </Text>

      <View style={{ paddingLeft: 14 }}>
        {/* Timeline line */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 7,
            top: 6,
            bottom: 6,
            width: 2,
            backgroundColor: timelineColor,
            borderRadius: 1,
          }}
        />
        {data.sections.map((s, i) => {
          const pct = Math.round((s.completed / Math.max(s.total, 1)) * 100);
          const done = pct >= 100;
          const isOpen = expanded === s.id;

          return (
            <View key={s.id} style={{ marginBottom: 12 }}>
              {/* Dot + card header */}
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: done ? colors.gameAccent1 : colors.surfaceSecondary,
                    borderWidth: 2,
                    borderColor: done ? colors.gameAccent1 : timelineColor,
                    marginRight: 10,
                  }}
                />
                <TouchableOpacity
                  onPress={() => setExpanded(isOpen ? null : s.id)}
                  activeOpacity={0.85}
                  style={{ flex: 1 }}
                >
                  <BlurView
                    intensity={30}
                    tint={isDark ? "dark" : "light"}
                    style={{
                      backgroundColor: isDark ? "rgba(31,41,55,0.6)" : "rgba(255,255,255,0.7)",
                      borderWidth: 1,
                      borderColor: isDark ? "rgba(148,163,184,0.18)" : "rgba(148,163,184,0.25)",
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ flex: 1, fontWeight: "800", color: colors.text }}>{s.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                        {s.completed}/{s.total}
                      </Text>
                    </View>

                    <Text style={{ marginTop: 4, fontSize: 12, color: colors.textSecondary }}>
                      {s.description}
                    </Text>

                    {/* progress bar */}
                    <View
                      style={{
                        height: 6,
                        backgroundColor: isDark ? "rgba(148,163,184,0.15)" : "rgba(148,163,184,0.2)",
                        borderRadius: 3,
                        marginTop: 10,
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          height: "100%",
                          width: `${pct}%`,
                          backgroundColor: colors.gameAccent1,
                        }}
                      />
                    </View>

                    <View style={{ marginTop: 6, flexDirection: "row", alignItems: "center" }}>
                      {done ? (
                        <>
                          <CheckCircle2 size={16} color={colors.gameAccent1} />
                          <Text style={{ marginLeft: 6, fontSize: 12, color: colors.gameAccent1, fontWeight: "700" }}>
                            Completed
                          </Text>
                        </>
                      ) : (
                        <>
                          <Target size={16} color={colors.gameAccent1} />
                          <Text style={{ marginLeft: 6, fontSize: 12, color: colors.gameAccent1, fontWeight: "700" }}>
                            {pct}% complete
                          </Text>
                        </>
                      )}
                    </View>

                    {/* expanded hint */}
                    <Text style={{ marginTop: 6, fontSize: 11, color: colors.textSecondary }}>
                      {isOpen ? "Tap to collapse" : "Tap to expand"}
                    </Text>
                  </BlurView>
                </TouchableOpacity>
              </View>

              {/* Expanded example details (lightweight; no editing toggles here to keep it clean) */}
              {isOpen && (
                <View style={{ marginLeft: 24, marginTop: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textSecondary, marginBottom: 6 }}>
                    Highlights
                  </Text>
                  <View style={{ gap: 6 }}>
                    <RowChip label="Scope" value={`${s.total} tasks`} colors={colors} />
                    <RowChip label="Done" value={`${s.completed} complete`} colors={colors} />
                    <RowChip label="Remaining" value={`${Math.max(s.total - s.completed, 0)} left`} colors={colors} />
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function RowChip({ label, value, colors }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: "rgba(148,163,184,0.12)",
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.25)",
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: "800", color: colors.text, marginRight: 8 }}>
        {label}
      </Text>
      <Text style={{ fontSize: 12, color: colors.textSecondary }}>{value}</Text>
    </View>
  );
}
