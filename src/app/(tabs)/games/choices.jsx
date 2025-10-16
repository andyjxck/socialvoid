// src/app/(tabs)/games/choices.jsx  (REPLACE ENTIRE FILE)
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  Dimensions,
  Pressable,
  BackHandler,
  ScrollView,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  ArrowLeft,
  RotateCcw,
  ShieldCheck,
  Lock,
  CalendarPlus,
  CheckCircle2,
  XCircle,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import NightSkyBackground from "../../../components/NightSkyBackground";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import { supabase } from "../../../utils/supabase";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

// ---------- CONFIG ----------
const ROADMAP_PASSWORD = "08012023";
const FALLBACK_GAME_ID = 23;

// Pastel + glass + subtle glow
const C = {
  head: "#FFFFFF",
  text: "rgba(235,237,240,0.96)",
  sub: "rgba(235,237,240,0.78)",
  glass: "rgba(255,255,255,0.10)",
  glass2: "rgba(255,255,255,0.06)",
  border: "rgba(255,255,255,0.16)",
  borderBright: "rgba(255,255,255,0.28)",
  lilac: "#C9C3FF",
  mint: "#B4F0E2",
  lilacDeep: "#A78BFA",
  mintDeep: "#34D399",
  barA: "rgba(201,195,255,0.85)",
  barB: "rgba(180,240,226,0.85)",
  button: "#7C3AED",
};

const BOARD_H = Math.min(Math.max(screenHeight * 0.82, 540), 600);

const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const sanitize = (s) => (s || "").toString().trim();

async function getDeviceVoterKey() {
  let key = await AsyncStorage.getItem("wyr_device_key");
  if (!key) {
    key = `dev_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
    await AsyncStorage.setItem("wyr_device_key", key);
  }
  return key;
}

export default function ChoicesDaily() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // ---- tracking ----
  const sessionOpenRef = useRef(false);
  const gameIdRef = useRef(null);
  const retryTimerRef = useRef(null);

  // Integer player user_id (for votes, submitted_by, approved_by)
  const [currentPlayerId, setCurrentPlayerId] = useState(null);

  // (Optional) auth UUID (may be used by your RLS, but NOT written to wyr_questions)
  const [authUuid, setAuthUuid] = useState(null);

  // ---- tabs ----
  const [tab, setTab] = useState("play"); // play | submit | moderate

  // ---- play state ----
  const [loadingPlay, setLoadingPlay] = useState(false);
  const [question, setQuestion] = useState(null); // {id, option_a, option_b}
  const [hasVoted, setHasVoted] = useState(false);
  const [results, setResults] = useState(null);   // {A,B,total}

  // animations for play view
  const swap = useRef(new Animated.Value(0)).current; // 0 options -> 1 results
  const fillA = useRef(new Animated.Value(0)).current;
  const fillB = useRef(new Animated.Value(0)).current;
  const pressA = useRef(new Animated.Value(0)).current;
  const pressB = useRef(new Animated.Value(0)).current;
  const sheen = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(sheen, { toValue: 1, duration: 5200, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, [sheen]);

  useEffect(() => {
    if (results?.total > 0) {
      const aPct = Math.round((results.A / results.total) * 100);
      const bPct = 100 - aPct;
      fillA.setValue(0);
      fillB.setValue(0);
      Animated.parallel([
        Animated.timing(fillA, { toValue: aPct, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
        Animated.timing(fillB, { toValue: bPct, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]).start();
    } else {
      fillA.setValue(0);
      fillB.setValue(0);
    }
  }, [results]); // eslint-disable-line

  // ---- submit state (isolated) ----
  const [optA, setOptA] = useState("");
  const [optB, setOptB] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ---- admin ----
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [passwordModal, setPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [loadingModerate, setLoadingModerate] = useState(false);
  const [pending, setPending] = useState([]);

  // ---------- init ----------
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id"); // integer user_id
        const userId = saved ? parseInt(saved, 10) : null;
        if (active) setCurrentPlayerId(Number.isFinite(userId) ? userId : null);
      } catch {
        if (active) setCurrentPlayerId(null);
      }
      try {
        const { data, error } = await supabase.auth.getUser();
        if (!error) setAuthUuid(data?.user?.id ?? null);
      } catch {
        setAuthUuid(null);
      }
    })();
    return () => { active = false; };
  }, []);

  // ---------- tracking open/close ----------
  const openTrackedSession = useCallback(
    async (attempt = 1) => {
      if (sessionOpenRef.current) return;
      if (!currentPlayerId || !isFocused) return;
      try {
        let gid = null;
        if (typeof getGameId === "function") {
          try { gid = await getGameId(GAME_TYPES?.CHOICES ?? "CHOICES"); } catch {}
          if (!gid) { try { gid = await getGameId("choices"); } catch {} }
          if (!gid) { try { gid = await getGameId("Choices"); } catch {} }
        }
        if (!gid) gid = FALLBACK_GAME_ID;
        gameIdRef.current = gid;
        await gameTracker.startGame(gid, currentPlayerId);
        sessionOpenRef.current = true;
      } catch {
        if (attempt < 5 && isFocused) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => openTrackedSession(attempt + 1), 400 * attempt);
        }
      }
    },
    [currentPlayerId, isFocused]
  );

  const closeTrackedSession = useCallback(async () => {
    clearTimeout(retryTimerRef.current);
    if (!sessionOpenRef.current) return;
    const gid = gameIdRef.current;
    gameIdRef.current = null;
    try {
      await gameTracker.endGame(gid, hasVoted ? 1 : 0);
    } catch {
    } finally {
      sessionOpenRef.current = false;
    }
  }, [hasVoted]);

  useEffect(() => {
    if (isFocused && currentPlayerId) openTrackedSession();
    else closeTrackedSession();
  }, [isFocused, currentPlayerId, openTrackedSession, closeTrackedSession]);

  useFocusEffect(
    useCallback(() => {
      const back = BackHandler.addEventListener("hardwareBackPress", () => {
        closeTrackedSession();
        router.back();
        return true;
      });
      return () => back.remove();
    }, [closeTrackedSession])
  );

  // ---------- data: today ----------
  const loadToday = useCallback(async () => {
    setLoadingPlay(true);
    setHasVoted(false);
    setResults(null);
    swap.setValue(0);
    try {
      const { data, error } = await supabase
        .from("wyr_questions")
        .select("id, option_a, option_b, scheduled_for, status")
        .eq("status", "approved")
        .eq("scheduled_for", todayStr())
        .limit(1)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      if (!data) {
        setQuestion(null);
      } else {
        setQuestion({ id: data.id, option_a: data.option_a, option_b: data.option_b });

        const deviceKey = await getDeviceVoterKey();
        const voterId = Number.isFinite(currentPlayerId) ? currentPlayerId : null;

        const { data: already, error: e2 } = await supabase
          .from("wyr_votes")
          .select("id")
          .eq("question_id", data.id)
          .or(
            [
              voterId !== null ? `voter_id.eq.${voterId}` : null,
              `voter_key.eq.${deviceKey}`,
            ]
              .filter(Boolean)
              .join(",")
          )
          .limit(1);

        if (!e2 && already && already.length > 0) {
          setHasVoted(true);
          const { data: res, error: e3 } = await supabase
            .from("wyr_votes").select("choice").eq("question_id", data.id);
          if (!e3 && Array.isArray(res)) {
            const total = res.length;
            const aCount = res.filter(v => v.choice === "A").length;
            setResults({ A: aCount, B: total - aCount, total });
            swap.setValue(1);
          }
        }
      }
    } catch (err) {
      console.warn("[Choices] loadToday error:", err);
      Alert.alert("Error", "Could not load today’s question.");
    } finally {
      setLoadingPlay(false);
    }
  }, [currentPlayerId]);

  // ---------- submit (INTEGER submitted_by) ----------
  const submitQuestion = useCallback(async () => {
    const a = sanitize(optA), b = sanitize(optB);
    if (a.length < 3 || b.length < 3) {
      Alert.alert("Too short", "Write two real options.");
      return;
    }
    if (!Number.isFinite(currentPlayerId)) {
      Alert.alert("Error", "No player linked to this device.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        option_a: a,
        option_b: b,
        status: "pending",
        submitted_by: currentPlayerId, // players.user_id (INT)
      };
      const { error } = await supabase.from("wyr_questions").insert(payload).select("id").single();
      if (error) throw error;

      setOptA(""); setOptB("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Submitted", "Thanks! It’ll be queued after approval.");

      if (tab === "moderate" && adminUnlocked) {
        fetchPending();
      }

      setTab("play");
      loadToday();
    } catch (err) {
      console.warn("[Choices] submit error:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Error", err?.message ?? "Could not submit your question.");
    } finally {
      setSubmitting(false);
    }
  }, [optA, optB, currentPlayerId, tab, adminUnlocked, fetchPending, loadToday]);

  // ---------- vote (INTEGER voter_id) ----------
  const castVote = useCallback(async (choice) => {
    const q = question;
    if (!q) return;

    try {
      const deviceKey = await getDeviceVoterKey();
      const voterId = Number.isFinite(currentPlayerId) ? currentPlayerId : null;

      const payload = {
        question_id: q.id,
        voter_id: voterId,     // INTEGER user_id
        voter_key: deviceKey,  // guest/device fallback
        choice,                // 'A' or 'B'
      };

      const { error } = await supabase.from("wyr_votes").insert(payload);
      if (error && error.code !== "23505") {
        console.warn("[Choices] vote insert error:", error);
        Alert.alert("Could not submit vote", error.message ?? "Unknown database error.");
        return;
      }

      setHasVoted(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const { data: res, error: e2 } = await supabase
        .from("wyr_votes").select("choice").eq("question_id", q.id);
      if (!e2 && Array.isArray(res)) {
        const total = res.length;
        const aCount = res.filter(v => v.choice === "A").length;
        setResults({ A: aCount, B: total - aCount, total });
      }

      Animated.timing(swap, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    } catch (err) {
      console.warn("[Choices] vote error:", err);
      Alert.alert("Could not submit vote", err?.message ?? "Unknown error.");
    }
  }, [question, currentPlayerId]);

  // ---------- admin ----------
  const tryUnlockAdmin = useCallback(() => setPasswordModal(true), []);
  const confirmPassword = useCallback(() => {
    if (passwordInput === ROADMAP_PASSWORD) {
      setAdminUnlocked(true);
      setPasswordModal(false);
      setPasswordInput("");
      setTab("moderate");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Access denied", "Incorrect password.");
    }
  }, [passwordInput]);

  const fetchPending = useCallback(async () => {
    if (!adminUnlocked) return;
    setLoadingModerate(true);
    try {
      const { data, error } = await supabase
        .from("wyr_questions")
        .select("id, option_a, option_b, created_at, submitted_by, status")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setPending(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("[Choices] fetchPending error:", err);
      Alert.alert("Error", "Could not load pending questions.");
    } finally {
      setLoadingModerate(false);
    }
  }, [adminUnlocked]);

  const getNextFreeDate = useCallback(async () => {
    const { data, error } = await supabase
      .from("wyr_questions")
      .select("scheduled_for")
      .not("scheduled_for", "is", null)
      .order("scheduled_for", { ascending: false })
      .limit(1);

    if (error) return todayStr();

    const start = data && data.length ? new Date(data[0].scheduled_for) : new Date();
    const next = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (data.length ? 1 : 0));
    const now = new Date(todayStr());
    if (next < now) return todayStr();

    const y = next.getFullYear();
    const m = String(next.getMonth() + 1).padStart(2, "0");
    const d = String(next.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  const approveToQueue = useCallback(async (qid) => {
    try {
      const nextDate = await getNextFreeDate();

      const approverId = Number.isFinite(currentPlayerId) ? currentPlayerId : null;

      const { error } = await supabase
        .from("wyr_questions")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: approverId,         // INTEGER FK -> players(user_id)
          scheduled_for: nextDate,
        })
        .eq("id", qid)
        .select("id")
        .single();

      if (error) throw error;

      setPending((p) => p.filter((x) => x.id !== qid));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (nextDate === todayStr()) loadToday();
    } catch (err) {
      console.warn("[Choices] approve error:", err);
      Alert.alert("Error", err?.message ?? "Could not approve and schedule.");
    }
  }, [getNextFreeDate, loadToday, currentPlayerId]);

  const rejectQuestion = useCallback(async (qid) => {
    try {
      const approverId = Number.isFinite(currentPlayerId) ? currentPlayerId : null;

      const { error } = await supabase
        .from("wyr_questions")
        .update({
          status: "rejected",
          approved_by: approverId,        // set who moderated (helps many RLS policies)
          approved_at: new Date().toISOString(),
          scheduled_for: null,
        })
        .eq("id", qid)
        .select("id")
        .single();

      if (error) throw error;

      setPending((p) => p.filter((x) => x.id !== qid));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      console.warn("[Choices] reject error:", err);
      Alert.alert("Error", err?.message ?? "Could not reject.");
    }
  }, [currentPlayerId]);

  useEffect(() => {
    if (tab === "play") loadToday();
    if (tab === "moderate" && adminUnlocked) fetchPending();
  }, [tab, adminUnlocked, loadToday, fetchPending]);

  const restartRun = useCallback(async () => {
    await closeTrackedSession();
    await loadToday();
    await openTrackedSession();
  }, [closeTrackedSession, loadToday, openTrackedSession]);

  if (!fontsLoaded) return null;

  // ---------- UI helpers ----------
  const Glass = ({ children, style }) => (
    <BlurView
      intensity={100}
      tint="dark"
      style={[
        {
          backgroundColor: C.glass,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 22,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {children}
    </BlurView>
  );

  // Soft drop for major surfaces
  const softShadow = Platform.select({
    ios: {
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 16 },
    },
    android: { elevation: 12 },
    default: {},
  });

  const Header = () => (
    <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <TouchableOpacity
          onPress={async () => { await closeTrackedSession(); router.back(); }}
          style={{
            padding: 10,
            borderRadius: 14,
            backgroundColor: C.glass2,
            borderWidth: 1,
            borderColor: C.border,
          }}
        >
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>

        <View style={{ alignItems: "center" }}>
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: C.head }}>Choices — Daily</Text>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: C.sub, marginTop: 2 }}>
            {todayStr()}
          </Text>
        </View>

        <TouchableOpacity
          onPress={restartRun}
          style={{
            padding: 10,
            borderRadius: 14,
            backgroundColor: C.glass2,
            borderWidth: 1,
            borderColor: C.border,
          }}
        >
          <RotateCcw size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={{ marginTop: 12, flexDirection: "row", gap: 8 }}>
        {["play", "submit", "moderate"].map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => (t === "moderate" && !adminUnlocked ? setPasswordModal(true) : setTab(t))}
            style={{
              flex: t === "moderate" ? 0 : 1,
              minWidth: t === "moderate" ? 124 : undefined,
              backgroundColor: tab === t ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.08)",
              borderWidth: 1,
              borderColor: C.border,
              paddingVertical: 2,
              borderRadius: 12,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {t === "moderate" ? <ShieldCheck size={18} color="#fff" /> : null}
            <Text style={{ fontFamily: "Inter_700Bold", color: "#fff" }}>
              {t === "play" ? "Today" : t === "submit" ? "Submit" : adminUnlocked ? "Moderate" : "Admin"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  // ---------- TODAY (no center block; all board is options/results) ----------
  const renderToday = () => {
    if (loadingPlay) {
      return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /></View>;
    }

    if (!question) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <CalendarPlus size={28} color={C.lilacDeep} style={{ marginBottom: 8 }} />
          <Text style={{ fontFamily: "Inter_600SemiBold", color: C.text, textAlign: "center" }}>
            No daily question is scheduled for today.
            {"\n"}Come back tomorrow!
          </Text>
        </View>
      );
    }

    const aPct = results ? Math.round((results.A / results.total) * 100) : 0;
    const optionsOpacity = swap.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
    const resultsOpacity = swap.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

    const paneShadow = Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.25,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
      },
      android: {
        elevation: 10,
      },
      default: {},
    });

    const innerGlow = {
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.20)",
      backgroundColor: "rgba(255,255,255,0.07)",
    };

    const OptionPane = ({ label, text, onPress, gradFrom, gradTo, pressVal, align }) => (
      <Animated.View
        style={{
          flex: 1,
          transform: [{ scale: pressVal.interpolate({ inputRange: [0, 1], outputRange: [1, 0.985] }) }],
        }}
      >
        {/* floating shadow */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 8, right: 8, top: 10, bottom: 6,
            borderRadius: 18,
            ...(Platform.OS === "ios"
              ? { shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 20, shadowOffset: { width: 0, height: 16 } }
              : { elevation: 8 }),
          }}
        />
        <Pressable
          onPressIn={() => Animated.timing(pressVal, { toValue: 1, duration: 90, useNativeDriver: true }).start()}
          onPressOut={() => Animated.timing(pressVal, { toValue: 0, duration: 120, useNativeDriver: true }).start()}
          onPress={onPress}
          style={[
            {
              flex: 1,
              borderRadius: 18,
              overflow: "hidden",
              minHeight: BOARD_H - 84,
            },
            paneShadow,
          ]}
        >
          <View style={[{ flex: 1, borderRadius: 18, overflow: "hidden" }, innerGlow]}>
            {/* subtle vignette ring */}
            <LinearGradient
              colors={["rgba(255,255,255,0.06)", "rgba(255,255,255,0.00)"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{ position: "absolute", left: 0, right: 0, top: 0, height: 18 }}
            />
            <LinearGradient
              colors={[gradFrom, gradTo]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1, paddingHorizontal: 20, paddingVertical: 24, justifyContent: "space-between" }}
            >
              {/* moving sheen */}
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 0, bottom: 0,
                  width: screenWidth * 0.7,
                  opacity: 0.12,
                  transform: [{
                    translateX: sheen.interpolate({ inputRange: [0, 1], outputRange: [-screenWidth, screenWidth] })
                  }],
                }}
              >
                <LinearGradient
                  colors={["transparent", "#ffffff", "transparent"]}
                  start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 0.8 }}
                  style={{ flex: 1 }}
                />
              </Animated.View>

              <Text style={{ fontFamily: "Inter_900Black", color: "#0B0B12", fontSize: 18, opacity: 0.95, textAlign: align }}>
                {label}
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_800Bold",
                  color: "#0B0B12",
                  fontSize: 22,
                  lineHeight: 30,
                  textAlign: align,
                }}
                numberOfLines={6}
              >
                {text}
              </Text>
            </LinearGradient>
          </View>
        </Pressable>
      </Animated.View>
    );

    return (
      <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}>
        <Text
          style={{
            fontFamily: "Inter_800Bold",
            color: "#000000",
            marginBottom: 10,
            textAlign: "center",
            letterSpacing: 0.4,
          }}
        >
          Would you rather…
        </Text>

        {/* Board wrapper adds soft outer shadow */}
        <View style={[{ borderRadius: 24 }, softShadow]}>
          <BlurView
            intensity={100}
            tint="dark"
            style={{
              height: BOARD_H,
              borderRadius: 22,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: C.borderBright,
              padding: 10,
              backgroundColor: C.glass,
            }}
          >
            {/* highlight edge */}
            <LinearGradient
              pointerEvents="none"
              colors={["rgba(255,255,255,0.14)", "rgba(255,255,255,0.02)", "transparent"]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={{ position: "absolute", left: 10, right: 10, top: 10, height: 12, borderTopLeftRadius: 18, borderTopRightRadius: 18 }}
            />

            {/* BEFORE VOTE: two huge panes */}
            <Animated.View style={{ opacity: optionsOpacity, flex: 1 }}>
              <View style={{ flexDirection: "row", gap: 10, flex: 1 }}>
                <OptionPane
                  label="A"
                  text={question.option_a}
                  onPress={() => castVote("A")}
                  gradFrom="rgba(201,195,255,0.28)"
                  gradTo="rgba(201,195,255,0.55)"
                  pressVal={pressA}
                  align="left"
                />
                <OptionPane
                  label="B"
                  text={question.option_b}
                  onPress={() => castVote("B")}
                  gradFrom="rgba(180,240,226,0.28)"
                  gradTo="rgba(180,240,226,0.55)"
                  pressVal={pressB}
                  align="right"
                />
              </View>
            </Animated.View>

            {/* AFTER VOTE: entire board becomes percent bar */}
            <Animated.View
              style={{
                opacity: resultsOpacity,
                position: "absolute",
                left: 10, right: 10, top: 10, bottom: 10,
                borderRadius: 18,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: C.borderBright,
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
            >
              {/* Left fill (A) */}
              <Animated.View
                style={{
                  position: "absolute",
                  left: 0, top: 0, bottom: 0,
                  width: fillA.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
                  backgroundColor: C.barA,
                }}
              />
              {/* Right fill (B) */}
              <Animated.View
                style={{
                  position: "absolute",
                  right: 0, top: 0, bottom: 0,
                  width: fillB.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
                  backgroundColor: C.barB,
                }}
              />

              {/* sheen */}
              <Animated.View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 0, bottom: 0,
                  width: screenWidth * 0.6,
                  opacity: 0.08,
                  transform: [{
                    translateX: sheen.interpolate({ inputRange: [0, 1], outputRange: [-screenWidth, screenWidth] })
                  }],
                }}
              >
                <LinearGradient
                  colors={["transparent", "#ffffff", "transparent"]}
                  start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 0.8 }}
                  style={{ flex: 1 }}
                />
              </Animated.View>

              {/* Foreground content */}
              <View style={{ flex: 1, flexDirection: "row" }}>
                {/* LEFT */}
                <View style={{ flex: 1, padding: 18, justifyContent: "space-between" }}>
                  <View>
                    <Text style={{ fontFamily: "Inter_900Black", color: "#0d0d14", fontSize: 18, opacity: 0.9 }}>A</Text>
                    <Text style={{ fontFamily: "Inter_900Black", color: "#0d0d14", fontSize: 44 }}>
                      {results ? aPct : 0}%
                    </Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_800Bold", color: "#0d0d14", fontSize: 18 }} numberOfLines={5}>
                    {question.option_a}
                  </Text>
                </View>

                {/* RIGHT */}
                <View style={{ flex: 1, padding: 18, justifyContent: "space-between", alignItems: "flex-end" }}>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontFamily: "Inter_900Black", color: "#07110e", fontSize: 18, opacity: 0.9 }}>B</Text>
                    <Text style={{ fontFamily: "Inter_900Black", color: "#07110e", fontSize: 44 }}>
                      {results ? 100 - aPct : 0}%
                    </Text>
                  </View>
                  <Text style={{ fontFamily: "Inter_800Bold", color: "#07110e", fontSize: 18, textAlign: "right" }} numberOfLines={5}>
                    {question.option_b}
                  </Text>
                </View>
              </View>
            </Animated.View>
          </BlurView>
        </View>

        {/* Bottom row: votes + refresh (matching pills; only Refresh is clickable) */}
        <View
          style={{
            position: "absolute",
            left: 20,
            right: 20,
            bottom: 35,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View
            style={{
              backgroundColor: "rgba(0,0,0,0.28)",
              borderWidth: 1,
              borderColor: C.border,
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 10,
            }}
          >
            <Text style={{ fontFamily: "Inter_800Bold", color: "#fff" }}>
              Total votes: {results?.total ?? 0}
            </Text>
          </View>

          <TouchableOpacity
            onPress={loadToday}
            style={{
              backgroundColor: "rgba(0,0,0,0.28)",
              borderWidth: 1,
              borderColor: C.border,
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 10,
            }}
          >
            <Text style={{ fontFamily: "Inter_800Bold", color: "#fff" }}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ---------- SUBMIT ----------
  const renderSubmit = () => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}
      keyboardShouldPersistTaps="handled"
    >
      <Glass style={{ padding: 16 }}>
        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 16, color: C.head, marginBottom: 12 }}>
          Submit a Question to the Queue
        </Text>

        <View
          style={{
            backgroundColor: "rgba(0,0,0,0.24)",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: C.border,
            marginBottom: 10,
          }}
        >
          <TextInput
            value={optA}
            onChangeText={setOptA}
            placeholder="Option A"
            placeholderTextColor="rgba(255,255,255,0.55)"
            style={{ fontFamily: "Inter_500Medium", color: "#fff", padding: 14, minHeight: 48 }}
            blurOnSubmit={false}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="next"
          />
        </View>

        <View
          style={{
            backgroundColor: "rgba(0,0,0,0.24)",
            borderRadius: 12,
            borderWidth: 1,
            borderColor: C.border,
            marginBottom: 14,
          }}
        >
          <TextInput
            value={optB}
            onChangeText={setOptB}
            placeholder="Option B"
            placeholderTextColor="rgba(255,255,255,0.55)"
            style={{ fontFamily: "Inter_500Medium", color: "#fff", padding: 14, minHeight: 48 }}
            blurOnSubmit={false}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
          />
        </View>

        <TouchableOpacity
          disabled={submitting}
          onPress={submitQuestion}
          style={{
            backgroundColor: C.button,
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: "center",
            opacity: submitting ? 0.7 : 1,
          }}
        >
          <Text style={{ fontFamily: "Inter_700Bold", color: "#fff" }}>
            {submitting ? "Submitting..." : "Submit for Approval"}
          </Text>
        </TouchableOpacity>

        <Text style={{ fontFamily: "Inter_500Medium", color: C.sub, marginTop: 10, textAlign: "center" }}>
          Submissions are reviewed before being queued (1 per day).
        </Text>
      </Glass>
    </ScrollView>
  );

  // ---------- Reusable glass action button for Admin ----------
  const GlassActionButton = ({ label, icon: Icon, colors, onPress }) => {
    const scale = useRef(new Animated.Value(0)).current;
    const handleIn = () =>
      Animated.timing(scale, { toValue: 1, duration: 90, useNativeDriver: true, easing: Easing.out(Easing.quad) }).start();
    const handleOut = () =>
      Animated.timing(scale, { toValue: 0, duration: 120, useNativeDriver: true, easing: Easing.out(Easing.quad) }).start();

    return (
      <Pressable
        onPressIn={handleIn}
        onPressOut={handleOut}
        onPress={onPress}
        style={{
          flex: 1,
          borderRadius: 12,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: "rgba(0,0,0,0.22)",
        }}
      >
        <Animated.View style={{ transform: [{ scale: scale.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) }] }}>
          <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingVertical: 12, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}
          >
            <Icon size={18} color="#0b0f0e" />
            <Text style={{ fontFamily: "Inter_700Bold", color: "#0b0f0e" }}>{label}</Text>
          </LinearGradient>
        </Animated.View>
      </Pressable>
    );
  };

  // ---------- MODERATE ----------
  const renderModerate = () => (
    <View style={{ flex: 1, paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
        <TouchableOpacity
          onPress={fetchPending}
          style={{
            backgroundColor: C.glass2,
            borderWidth: 1,
            borderColor: C.border,
            paddingVertical: 10,
            paddingHorizontal: 14,
            borderRadius: 12,
          }}
        >
          <Text style={{ fontFamily: "Inter_600SemiBold", color: "#fff" }}>Refresh</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <ShieldCheck size={16} color={C.lilacDeep} />
          <Text style={{ fontFamily: "Inter_600SemiBold", color: C.lilacDeep }}>Admin Unlocked</Text>
        </View>
      </View>

      {loadingModerate ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
        </View>
      ) : (
        pending.map((item) => (
          <Glass key={item.id} style={{ padding: 14, marginBottom: 10 }}>
            {/* Meta row */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={{ fontFamily: "Inter_700Bold", color: C.head }}>Would you rather…</Text>
              <Text style={{ fontFamily: "Inter_500Medium", color: C.sub }}>
                #{item.id}
              </Text>
            </View>

            {/* Body */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontFamily: "Inter_600SemiBold", color: C.text }}>A) {item.option_a}</Text>
              <Text style={{ fontFamily: "Inter_600SemiBold", color: C.text }}>B) {item.option_b}</Text>
            </View>

            {/* Action bar */}
            <View
              style={{
                marginTop: 12,
                borderRadius: 12,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: C.border,
                backgroundColor: "rgba(255,255,255,0.04)",
              }}
            >
              <View style={{ flexDirection: "row", gap: 8, padding: 8 }}>
                <GlassActionButton
                  label="Approve & Queue"
                  icon={CheckCircle2}
                  colors={["rgba(180,240,226,0.9)", "rgba(180,240,226,0.6)"]}
                  onPress={() => approveToQueue(item.id)}
                />
                <GlassActionButton
                  label="Reject"
                  icon={XCircle}
                  colors={["rgba(255,190,190,0.85)", "rgba(255,160,160,0.65)"]}
                  onPress={() => rejectQuestion(item.id)}
                />
              </View>
            </View>
          </Glass>
        ))
      )}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <NightSkyBackground />
      <Header />

      <View style={{ flex: 1 }}>
        {tab === "play" && renderToday()}
        {tab === "submit" && renderSubmit()}
        {tab === "moderate" && adminUnlocked && renderModerate()}
      </View>

      {/* ADMIN PASSWORD MODAL */}
      <Modal visible={passwordModal} transparent animationType="fade" onRequestClose={() => setPasswordModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 }}>
          <BlurView tint="dark" intensity={90} style={{ borderRadius: 18, padding: 16, backgroundColor: C.glass, borderWidth: 1, borderColor: C.border }}>
            <View style={{ alignItems: "center", marginBottom: 12 }}>
              <Lock size={36} color={C.lilacDeep} style={{ marginBottom: 8 }} />
              <Text style={{ fontFamily: "Inter_700Bold", color: "#fff", fontSize: 18 }}>Admin Access</Text>
              <Text style={{ fontFamily: "Inter_500Medium", color: C.sub, marginTop: 4, textAlign: "center" }}>
                Enter the developer password to unlock moderation.
              </Text>
            </View>

            <View style={{ backgroundColor: "rgba(0,0,0,0.24)", borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 12 }}>
              <TextInput
                value={passwordInput}
                onChangeText={setPasswordInput}
                placeholder="Password"
                placeholderTextColor="rgba(255,255,255,0.55)"
                secureTextEntry
                autoFocus
                blurOnSubmit={false}
                autoCorrect={false}
                autoCapitalize="none"
                onSubmitEditing={confirmPassword}
                style={{ color: "#fff", padding: 12, textAlign: "center", fontFamily: "Inter_600SemiBold", minHeight: 48 }}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => setPasswordModal(false)}
                style={{
                  flex: 1,
                  backgroundColor: C.glass2,
                  borderWidth: 1,
                  borderColor: C.border,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontFamily: "Inter_600SemiBold", color: "#fff" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={confirmPassword}
                style={{
                  flex: 1,
                  backgroundColor: C.button,
                  paddingVertical: 12,
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontFamily: "Inter_700Bold", color: "#fff" }}>Unlock</Text>
              </TouchableOpacity>
            </View>
          </BlurView>
        </View>
      </Modal>
    </View>
  );
}
