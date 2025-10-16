// src/app/(tabs)/games/smashem.jsx  (REPLACE ENTIRE FILE)
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  BackHandler,
  AppState,
  PanResponder,
  Animated,
  Modal,
  ScrollView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy, Zap, Shield, Plus, Timer, RotateCw } from "lucide-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";
import AchievementsSection from "../../../components/AchievementsSection";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";

/* ===== Layout ===== */
const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const FIELD_MARGIN_H = 20;
const FIELD_WIDTH = screenWidth - FIELD_MARGIN_H * 2;
const FIELD_HEIGHT = Math.min(560, Math.floor(screenHeight * 0.60));
const CONTROL_HEIGHT = 80;

/* ===== Game constants ===== */
const PADDLE_BASE_WIDTH = 96;
const PADDLE_HEIGHT = 14;
const PADDLE_Y = FIELD_HEIGHT - 40;

const BALL_SIZE = 10;
const BALL_START_SPEED = 4.2;
const BALL_MAX_SPEED = 8.0;
const BALL_ACCEL = 1.02;

const SUBSTEP_MAX_DELTA = 3.2;
const MIN_UP_VY = 2.2;

const ROWS = 7;
const COLS = 10;
const BRICK_GAP = 6;
const BRICK_HEIGHT = 22;
const BRICK_TOP_BASE = 70;
const BRICK_WIDTH = Math.floor((FIELD_WIDTH - (COLS + 1) * BRICK_GAP) / COLS);

const PLAYER_START_LIVES = 3;
const LEVEL_SAVE_KEY = "smashem_level";

/* ===== Power-ups ===== */
const POWER_TYPES = { WIDE: "WIDE", SLOW: "SLOW", MULTI: "MULTI", SHIELD: "SHIELD", EXTRA: "EXTRA" };
const POWER_DROP_CHANCE = 0.22;
const POWER_SIZE = 18;
const POWER_FALL_SPEED = 2.6;
const EFFECT_MS = { WIDE: 8000, SLOW: 8000, SHIELD: 8000 };
const SLOW_SCALE = 0.55;

/* ===== Tracking fallback ===== */
const FALLBACK_GAME_ID = 19;

/* ===== Utils ===== */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p) => Math.random() < p;

const BRICK_COLORS = {
  1: "#FF8FA3",
  2: "#FFC86B",
  3: "#FFF09A",
  4: "#98F5B3",
  5: "#79EBC8",
  6: "#9DC8FF",
  7: "#E2B8FF",
};
const STEEL_COLOR = "#9CA3AF";

/* ===== Procedural level generation (harder over time) ===== */
function generateLevelLayout(levelIdx) {
  const diff = levelIdx + 1;
  const density = Math.min(0.35 + diff * 0.05, 0.9);
  const steelChance = Math.min(0.08 + diff * 0.02, 0.28);
  const creep = Math.min(diff * 2, 28);
  const patternType = diff % 4;

  const layout = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      let place = chance(density);
      if (patternType === 1 && r % 2 === 0) place = chance(Math.max(density, 0.55));
      if (patternType === 2 && c % 2 === 1) place = chance(Math.max(density, 0.55));
      if (patternType === 3) {
        const midR = Math.floor(ROWS / 2), midC = Math.floor(COLS / 2);
        const d = Math.abs(r - midR) + Math.abs(c - midC);
        const bias = Math.max(0, 1 - d / (midR + 1));
        place = chance(density * (0.6 + 0.8 * bias));
      }
      if (!place) { layout.push(null); continue; }

      const unbreakable = chance(steelChance);
      layout.push({
        color: unbreakable ? STEEL_COLOR : BRICK_COLORS[(r + c) % 7 + 1],
        unbreakable,
      });
    }
  }
  const topOffset = BRICK_TOP_BASE + creep;
  return { layout, topOffset };
}

/* ===== Component ===== */
export default function SmashEm() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [fontsLoaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });

  // session/tracking
  const sessionOpenRef = useRef(false);
  const rafIdRef = useRef(null);
  const runningRef = useRef(false);

  // identities
  const [currentPlayerId, setCurrentPlayerId] = useState(null);
  const [resolvedGameId, setResolvedGameId] = useState(FALLBACK_GAME_ID);
  const gameIdRef = useRef(FALLBACK_GAME_ID);

  // achievements modal
  const [showAchievements, setShowAchievements] = useState(false);

  // game state
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);

  const [lives, setLives] = useState(PLAYER_START_LIVES);
  const livesRef = useRef(PLAYER_START_LIVES);

  const [levelIndex, setLevelIndex] = useState(0);

  const [bricks, setBricks] = useState([]); // {id,x,y,w,h,color,alive,unbreakable}
  const bricksRef = useRef([]);

  const [powerDrops, setPowerDrops] = useState([]);
  const dropsRef = useRef([]);

  const [balls, setBalls] = useState([]); // {x,y,vx,vy}
  const ballsRef = useRef([]);

  const [gameOver, setGameOver] = useState(false);
  const [youWin, setYouWin] = useState(false);

  // attach / respawn
  const [attached, setAttached] = useState(true);
  const attachedRef = useRef(true);

  // timed effects
  const [wideUntil, setWideUntil] = useState(0);
  const [slowUntil, setSlowUntil] = useState(0);
  const [shieldUntil, setShieldUntil] = useState(0);

  // paddle (UI thread)
  const paddleAnim = useRef(new Animated.Value((FIELD_WIDTH - PADDLE_BASE_WIDTH) / 2)).current;
  const paddleXRef = useRef((FIELD_WIDTH - PADDLE_BASE_WIDTH) / 2);
  const dragOffsetRef = useRef(0);

  // power queue (applied post-physics)
  const powerQueueRef = useRef([]);

  // milestone queue (processed off-physics)
  const milestoneQueueRef = useRef([]);
  const flushingMilestonesRef = useRef(false);

  // meta counters (for achievements)
  const bricksBrokenRef = useRef(0);
  const powerupsCollectedRef = useRef(0);
  const shieldSavesRef = useRef(0);
  const recallsRef = useRef(0);
  const maxSimultaneousBallsRef = useRef(1);
  const highestLevelRef = useRef(1);

  // milestone cooldown (avoid spam)
  const milestoneCooldownRef = useRef({}); // key -> lastSentTs

  /* sync refs */
  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => {
    ballsRef.current = balls;
    const effective = Math.max(balls.length, attached ? 1 : 0);
    maxSimultaneousBallsRef.current = Math.max(maxSimultaneousBallsRef.current, effective);
  }, [balls, attached]);
  useEffect(() => { bricksRef.current = bricks; }, [bricks]);
  useEffect(() => { livesRef.current = lives; }, [lives]);
  useEffect(() => { attachedRef.current = attached; }, [attached]);
  useEffect(() => { dropsRef.current = powerDrops; }, [powerDrops]);
  useEffect(() => {
    const id = paddleAnim.addListener(({ value }) => { paddleXRef.current = value; });
    return () => paddleAnim.removeListener(id);
  }, [paddleAnim]);

  /* identities */
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        setCurrentPlayerId(saved ? parseInt(saved, 10) : 1);
      } catch { setCurrentPlayerId(1); }
    })();
  }, []);

  // resolve game id (safe fallback first)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let gid = null;
        try { gid = await getGameId(GAME_TYPES?.SMASHEM ?? "SMASHEM"); } catch {}
        if (!gid) { try { gid = await getGameId("SMASHEM"); } catch {} }
        if (!gid) { try { gid = await getGameId("smashem"); } catch {} }
        if (!gid) { try { gid = await getGameId("Smash Em"); } catch {} }
        if (!gid) { try { gid = await getGameId("Brick Breaker"); } catch {} }
        if (!gid) gid = FALLBACK_GAME_ID;
        if (!cancelled) { setResolvedGameId(gid); gameIdRef.current = gid; }
      } catch {
        if (!cancelled) { setResolvedGameId(FALLBACK_GAME_ID); gameIdRef.current = FALLBACK_GAME_ID; }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* saved level */
  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(LEVEL_SAVE_KEY);
      const start = Math.max(0, parseInt(saved || "0", 10) || 0);
      fullReset(start);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    AsyncStorage.setItem(LEVEL_SAVE_KEY, String(levelIndex)).catch(() => {});
    highestLevelRef.current = Math.max(highestLevelRef.current, levelIndex + 1);
  }, [levelIndex]);

  /* paddle input (control strip only) */
  const getPaddleWidth = useCallback(() => {
    const now = Date.now();
    return Math.floor(PADDLE_BASE_WIDTH * (now < wideUntil ? 1.6 : 1.0));
  }, [wideUntil]);

  const controlPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const w = getPaddleWidth();
        const localX = evt?.nativeEvent?.locationX ?? (FIELD_WIDTH / 2);
        dragOffsetRef.current = localX - (paddleXRef.current + w / 2);
      },
      onPanResponderMove: (evt) => {
        const w = getPaddleWidth();
        const localX = evt?.nativeEvent?.locationX ?? (FIELD_WIDTH / 2);
        const desiredCenter = localX - dragOffsetRef.current;
        const left = clamp(desiredCenter - w / 2, 0, FIELD_WIDTH - w);
        paddleAnim.setValue(left);
        if (attachedRef.current) launchFromPaddle();
      },
    })
  ).current;

  /* helpers */
  const currentBallSpeedScale = useCallback((instantSlow = false) => {
    const now = Date.now();
    return (now < slowUntil || instantSlow) ? SLOW_SCALE : 1.0;
  }, [slowUntil]);

  const spawnBall = useCallback((dir = (Math.random() < 0.5 ? -1 : 1)) => {
    const levelRamp = 1 + Math.min(levelIndex * 0.02, 0.25);
    const speed = BALL_START_SPEED * levelRamp * currentBallSpeedScale();
    const vx = dir * speed;
    const vy = -Math.abs(speed * 0.85);
    const w = getPaddleWidth();
    return {
      x: paddleXRef.current + w / 2 - BALL_SIZE / 2,
      y: PADDLE_Y - BALL_SIZE - 2,
      vx, vy
    };
  }, [currentBallSpeedScale, getPaddleWidth, levelIndex]);

  const loadLevel = useCallback((index) => {
    const { layout, topOffset } = generateLevelLayout(index);
    const items = [];
    let idCounter = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = layout[r * COLS + c];
        if (!cell) continue;
        const x = BRICK_GAP + c * (BRICK_WIDTH + BRICK_GAP);
        const y = topOffset + r * (BRICK_HEIGHT + BRICK_GAP);
        items.push({
          id: `L${index}-B${idCounter++}`,
          x, y, w: BRICK_WIDTH, h: BRICK_HEIGHT,
          color: cell.unbreakable ? STEEL_COLOR : cell.color,
          unbreakable: cell.unbreakable,
          alive: true,
        });
      }
    }
    setBricks(items);
  }, []);

  const fullReset = useCallback((startLevel = 0) => {
    setScore(0);
    setLives(PLAYER_START_LIVES);
    setLevelIndex(startLevel);
    loadLevel(startLevel);
    paddleAnim.setValue((FIELD_WIDTH - PADDLE_BASE_WIDTH) / 2);
    setPowerDrops([]);
    setWideUntil(0);
    setSlowUntil(0);
    setShieldUntil(0);
    setYouWin(false);
    setGameOver(false);
    setBalls([]);
    setAttached(true);

    // counters
    bricksBrokenRef.current = 0;
    powerupsCollectedRef.current = 0;
    shieldSavesRef.current = 0;
    recallsRef.current = 0;
    maxSimultaneousBallsRef.current = 1;
    highestLevelRef.current = Math.max(highestLevelRef.current, startLevel + 1);
  }, [loadLevel, paddleAnim]);

  /* ===== Tracking helpers ===== */
  const startSession = useCallback(async () => {
    if (sessionOpenRef.current) return;
    if (currentPlayerId && gameIdRef.current) {
      try {
        await gameTracker.startGame(gameIdRef.current, currentPlayerId);
        sessionOpenRef.current = true;
      } catch { /* ignore */ }
    }
  }, [currentPlayerId]);

  const endSession = useCallback(async (scoreVal, meta) => {
    if (!sessionOpenRef.current) return;
    try { await gameTracker.endGame(gameIdRef.current, scoreVal || 0, meta || {}); }
    catch { /* ignore */ }
    sessionOpenRef.current = false;
  }, []);

  // Cooldown guard (per key; default 3s)
  const canSendMilestone = (key, cooldownMs = 3000) => {
    const last = milestoneCooldownRef.current[key] || 0;
    const now = Date.now();
    if (now - last < cooldownMs) return false;
    milestoneCooldownRef.current[key] = now;
    return true;
  };

  // Enqueue milestone (processed off-physics)
  const enqueueMilestone = useCallback((reason, extraMeta = {}) => {
    if (!gameIdRef.current || !currentPlayerId) return;
    if (!canSendMilestone(reason)) return;
    milestoneQueueRef.current.push({
      reason,
      meta: {
        result: "play",
        completed: false,
        reason,
        level: levelIndex + 1,
        score: scoreRef.current,
        bricks_broken: bricksBrokenRef.current,
        powerups_collected: powerupsCollectedRef.current,
        shield_saves: shieldSavesRef.current,
        recalls: recallsRef.current,
        max_balls: maxSimultaneousBallsRef.current,
        highest_level: highestLevelRef.current,
        ...extraMeta,
      },
      score: scoreRef.current,
    });
  }, [currentPlayerId, levelIndex]);

  // Flush milestones without blocking physics
  const flushMilestones = useCallback(async () => {
    if (flushingMilestonesRef.current) return;
    if (milestoneQueueRef.current.length === 0) return;
    flushingMilestonesRef.current = true;
    try {
      while (milestoneQueueRef.current.length) {
        const item = milestoneQueueRef.current.shift();
        await endSession(item.score, item.meta);
        await startSession();
      }
    } catch {
      // swallow
    } finally {
      flushingMilestonesRef.current = false;
    }
  }, [endSession, startSession]);

  /* ===== Life handling ===== */
  const stopLoop = useCallback(() => {
    runningRef.current = false;
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
  }, []);

  const closeAndSubmitFinal = useCallback(async (finalReason) => {
    const meta = {
      result: finalReason === "win" ? "win" : "game_over",
      completed: true,
      reason: finalReason,
      level: levelIndex + 1,
      score: scoreRef.current,
      bricks_broken: bricksBrokenRef.current,
      powerups_collected: powerupsCollectedRef.current,
      shield_saves: shieldSavesRef.current,
      recalls: recallsRef.current,
      max_balls: maxSimultaneousBallsRef.current,
      highest_level: highestLevelRef.current,
    };
    await endSession(scoreRef.current, meta);
  }, [endSession, levelIndex]);

  const loseLifeAndRespawn = useCallback(() => {
    const shieldActive = Date.now() < shieldUntil;
    if (shieldActive) {
      shieldSavesRef.current += 1;
      setAttached(true);
      setBalls([]);
      enqueueMilestone("shield_save");
      return;
    }
    if (livesRef.current - 1 <= 0) {
      setLives(0);
      setGameOver(true);
      stopLoop();
      // final is flushed outside loop
      enqueueMilestone("game_over_final", { completed: true, result: "game_over" });
      closeAndSubmitFinal("game_over"); // async, but not awaited here
      return;
    }
    setLives((l) => l - 1);
    setSlowUntil(0);
    setWideUntil(0);
    setAttached(true);
    setBalls([]);
    enqueueMilestone("life_lost");
  }, [shieldUntil, closeAndSubmitFinal, enqueueMilestone, stopLoop]);

  const recallBall = () => {
    if (gameOver || youWin) return;
    recallsRef.current += 1;
    if (livesRef.current - 1 <= 0) {
      setLives(0);
      setGameOver(true);
      stopLoop();
      enqueueMilestone("game_over_final", { completed: true, result: "game_over" });
      closeAndSubmitFinal("game_over");
      return;
    }
    setLives((l) => l - 1);
    setSlowUntil(0);
    setWideUntil(0);
    setAttached(true);
    setBalls([]);
    enqueueMilestone("manual_recall");
  };

  const launchFromPaddle = useCallback(() => {
    if (!attachedRef.current) return;
    const newBall = spawnBall(Math.random() < 0.5 ? -1 : 1);
    setBalls([newBall]);
    setAttached(false);
  }, [spawnBall]);

  /* ===== Apply queued powers (post-physics) ===== */
  const processPowerQueue = useCallback(() => {
    if (powerQueueRef.current.length === 0) return;
    const items = powerQueueRef.current.slice();
    powerQueueRef.current.length = 0;

    const now = Date.now();
    for (const t of items) {
      if (t === POWER_TYPES.WIDE) setWideUntil(now + EFFECT_MS.WIDE);
      else if (t === POWER_TYPES.SLOW) setSlowUntil(now + EFFECT_MS.SLOW);
      else if (t === POWER_TYPES.SHIELD) setShieldUntil(now + EFFECT_MS.SHIELD);
      else if (t === POWER_TYPES.EXTRA) setLives((l) => l + 1);
      else if (t === POWER_TYPES.MULTI) {
        const cap = 5;
        const base = BALL_START_SPEED * currentBallSpeedScale();
        const w = getPaddleWidth();
        const px = paddleXRef.current + w / 2 - BALL_SIZE / 2;
        const py = PADDLE_Y - BALL_SIZE - 2;
        if (attachedRef.current) {
          setAttached(false);
          const b0 = { x: px, y: py, vx: (Math.random() < 0.5 ? -1 : 1) * base, vy: -Math.abs(base * 0.85) };
          const b1 = { x: px, y: py, vx: -base, vy: -base * 0.3 };
          const b2 = { x: px, y: py, vx:  base, vy: -base * 0.3 };
          setBalls([b0, b1, b2]);
        } else {
          setBalls((prev) => {
            if (prev.length >= cap) return prev;
            const add = Math.min(2, cap - prev.length);
            const extra = [
              { x: px, y: py, vx: -base, vy: -base * 0.3 },
              { x: px, y: py, vx:  base, vy: -base * 0.3 },
            ].slice(0, add);
            return [...prev, ...extra];
          });
        }
      }
      powerupsCollectedRef.current += 1;
    }

    const p = powerupsCollectedRef.current;
    if (p === 1) enqueueMilestone("powerup_1");
    if (p === 5) enqueueMilestone("powerup_5");
    if (p === 10) enqueueMilestone("powerup_10");
  }, [currentBallSpeedScale, getPaddleWidth, enqueueMilestone]);

  /* ===== Physics helpers ===== */
  const rectsOverlap = (ax, ay, aw, ah, bx, by, bw, bh) =>
    ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

  const reflectBallFromRect = (ball, rect) => {
    const cx = ball.x + BALL_SIZE / 2, cy = ball.y + BALL_SIZE / 2;
    const rx = rect.x, ry = rect.y, rw = rect.w, rh = rect.h;
    const nearestX = clamp(cx, rx, rx + rw);
    const nearestY = clamp(cy, ry, ry + rh);
    const dx = cx - nearestX, dy = cy - nearestY;

    if (Math.abs(dx) > Math.abs(dy)) {
      ball.vx = -ball.vx;
      ball.x = dx > 0 ? rx + rw + 0.01 : rx - BALL_SIZE - 0.01;
    } else {
      ball.vy = -ball.vy;
      ball.y = dy > 0 ? ry + rh + 0.01 : ry - BALL_SIZE - 0.01;
    }

    const speed = Math.min(Math.hypot(ball.vx, ball.vy) * BALL_ACCEL, BALL_MAX_SPEED);
    const dir = Math.atan2(ball.vy, ball.vx);
    ball.vx = Math.cos(dir) * speed;
    ball.vy = Math.sin(dir) * speed;
  };

  /* ===== Main step (SYNC! no awaits) ===== */
  const step = useCallback(() => {
    const now = Date.now();
    const pending = { shield: false, slow: false, wide: false };

    // Drops
    const movedDrops = dropsRef.current
      .map((d) => ({ ...d, y: d.y + POWER_FALL_SPEED }))
      .filter((d) => d.y <= FIELD_HEIGHT);

    let paddleW = getPaddleWidth();
    const paddleRect = { x: paddleXRef.current, y: PADDLE_Y, w: paddleW, h: PADDLE_HEIGHT };
    const remainingDrops = [];
    for (const d of movedDrops) {
      const hit = rectsOverlap(paddleRect.x, paddleRect.y, paddleRect.w, paddleRect.h, d.x, d.y, POWER_SIZE, POWER_SIZE);
      if (hit) {
        if (d.type === POWER_TYPES.SHIELD) pending.shield = true;
        if (d.type === POWER_TYPES.SLOW)   pending.slow = true;
        if (d.type === POWER_TYPES.WIDE)   pending.wide = true;
        powerQueueRef.current.push(d.type);
      } else {
        remainingDrops.push(d);
      }
    }
    if (pending.wide) paddleW = Math.floor(PADDLE_BASE_WIDTH * 1.6);

    if (attachedRef.current) {
      setPowerDrops(remainingDrops);
      return;
    }

    // Balls with substeps
    const newBalls = [];
    let bricksCopy = bricksRef.current.map((b) => ({ ...b }));
    const freshDrops = [];

    for (const ballOrig of ballsRef.current) {
      let ball = { ...ballOrig };
      const frameScale = currentBallSpeedScale(pending.slow);
      const maxComp = Math.max(Math.abs(ball.vx), Math.abs(ball.vy)) * frameScale;
      const steps = Math.max(1, Math.ceil(maxComp / SUBSTEP_MAX_DELTA));
      const stepVX = (ball.vx * frameScale) / steps;
      const stepVY = (ball.vy * frameScale) / steps;

      let alive = true;

      for (let si = 0; si < steps && alive; si++) {
        ball.x += stepVX;
        ball.y += stepVY;

        if (ball.x <= 0) { ball.x = 0.01; ball.vx = Math.abs(ball.vx); }
        if (ball.x + BALL_SIZE >= FIELD_WIDTH) { ball.x = FIELD_WIDTH - BALL_SIZE - 0.01; ball.vx = -Math.abs(ball.vx); }
        if (ball.y <= 0) { ball.y = 0.01; ball.vy = Math.abs(ball.vy); }

        const shieldActive = (now < shieldUntil) || pending.shield;
        if (ball.y + BALL_SIZE >= FIELD_HEIGHT) {
          if (shieldActive) {
            shieldSavesRef.current += 1;
            ball.y = FIELD_HEIGHT - BALL_SIZE - 1;
            ball.vy = -Math.abs(ball.vy);
          } else {
            alive = false;
            break;
          }
        }

        const pRect = { x: paddleXRef.current, y: PADDLE_Y, w: paddleW, h: PADDLE_HEIGHT };
        if (rectsOverlap(ball.x, ball.y, BALL_SIZE, BALL_SIZE, pRect.x, pRect.y, pRect.w, pRect.h)) {
          ball.y = pRect.y - BALL_SIZE - 0.5;
          const hitPos = (ball.x + BALL_SIZE / 2) - (pRect.x + pRect.w / 2);
          const norm = clamp(hitPos / (pRect.w / 2), -1, 1);
          const speed = Math.min(Math.hypot(ball.vx, ball.vy) * BALL_ACCEL, BALL_MAX_SPEED);
          const angle = (-Math.PI / 4) + norm * (Math.PI / 3);
          ball.vx = Math.cos(angle) * speed;
          ball.vy = -Math.max(MIN_UP_VY, Math.abs(Math.sin(angle) * speed));
          if (ball.x <= 0.5) ball.x = 1;
          if (ball.x + BALL_SIZE >= FIELD_WIDTH - 0.5) ball.x = FIELD_WIDTH - BALL_SIZE - 1;
        }

        // Bricks
        for (let i = 0; i < bricksCopy.length; i++) {
          const br = bricksCopy[i];
          if (!br.alive) continue;
          if (rectsOverlap(ball.x, ball.y, BALL_SIZE, BALL_SIZE, br.x, br.y, br.w, br.h)) {
            if (br.unbreakable) {
              reflectBallFromRect(ball, br);
            } else {
              br.alive = false;
              bricksBrokenRef.current += 1;
              reflectBallFromRect(ball, br);
              setScore((s) => s + 10);

              const b = bricksBrokenRef.current;
              if (b === 1) enqueueMilestone("brick_1");
              if (b === 10) enqueueMilestone("brick_10");
              if (b === 25) enqueueMilestone("brick_25");
              if (b === 50) enqueueMilestone("brick_50");
              if (b === 100) enqueueMilestone("brick_100");

              if (chance(POWER_DROP_CHANCE)) {
                const types = [POWER_TYPES.WIDE, POWER_TYPES.SLOW, POWER_TYPES.MULTI, POWER_TYPES.SHIELD, POWER_TYPES.EXTRA];
                const type = types[randInt(0, types.length - 1)];
                freshDrops.push({
                  id: `${br.id}-p-${Math.random().toString(36).slice(2)}`,
                  x: br.x + br.w / 2 - POWER_SIZE / 2,
                  y: br.y,
                  type,
                });
              }
            }
            break;
          }
        }
      }

      if (alive) newBalls.push(ball);
    }

    // Clear?
    bricksCopy = bricksCopy.filter((b) => b.alive);
    const remainingBreakables = bricksCopy.filter((b) => !b.unbreakable).length;
    if (remainingBreakables === 0) {
      // ATOMIC level transition (one visual change only)
      const next = levelIndex + 1;
      setScore((s) => s + 100);
      enqueueMilestone("level_cleared", { level_cleared: levelIndex + 1 });

      setLevelIndex(next);
      AsyncStorage.setItem(LEVEL_SAVE_KEY, String(next)).catch(() => {});
      // don't set intermediate bricks — just load next
      loadLevel(next);
      setWideUntil(0); setSlowUntil(0); setShieldUntil(0);
      setAttached(true);
      setBalls([]);
      setPowerDrops([]); // clear drops immediately

      // Major milestone levels
      const lv = next;
      if (lv === 2) enqueueMilestone("level_2");
      if (lv === 3) enqueueMilestone("level_3");
      if (lv === 5) enqueueMilestone("level_5");
      if (lv === 10) enqueueMilestone("level_10");
      return;
    }

    // commit frame
    setBricks(bricksCopy);
    setBalls(newBalls);
    setPowerDrops([...remainingDrops, ...freshDrops]);

    if (newBalls.length === 0) {
      loseLifeAndRespawn();
    }
  }, [
    getPaddleWidth,
    currentBallSpeedScale,
    shieldUntil,
    levelIndex,
    loadLevel,
    loseLifeAndRespawn,
    enqueueMilestone,
  ]);

  /* ===== Loop ===== */
  const loop = useCallback(() => {
    if (!runningRef.current) return;
    step();                // physics (sync)
    processPowerQueue();   // apply powers (state only)
    flushMilestones();     // async, but not awaited
    rafIdRef.current = requestAnimationFrame(loop);
  }, [step, processPowerQueue, flushMilestones]);

  const startLoop = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    rafIdRef.current = requestAnimationFrame(loop);
  }, [loop]);

  /* ===== Focus & lifecycle ===== */
  useFocusEffect(
    useCallback(() => {
      fullReset(levelIndex);
      const back = BackHandler.addEventListener("hardwareBackPress", async () => {
        runningRef.current = false;
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
        AsyncStorage.setItem(LEVEL_SAVE_KEY, String(levelIndex)).catch(() => {});
        await closeAndSubmitFinal("back");
        router.back();
        return true;
      });
      return () => {
        back.remove();
        runningRef.current = false;
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
        AsyncStorage.setItem(LEVEL_SAVE_KEY, String(levelIndex)).catch(() => {});
        // snapshot on blur (non-blocking)
        endSession(scoreRef.current, {
          result: "play",
          completed: false,
          reason: "unfocus",
          level: levelIndex + 1,
          score: scoreRef.current,
          bricks_broken: bricksBrokenRef.current,
          powerups_collected: powerupsCollectedRef.current,
          shield_saves: shieldSavesRef.current,
          recalls: recallsRef.current,
          max_balls: maxSimultaneousBallsRef.current,
          highest_level: highestLevelRef.current,
        });
      };
    }, [fullReset, levelIndex, closeAndSubmitFinal, endSession])
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if ((state === "inactive" || state === "background") && sessionOpenRef.current) {
        runningRef.current = false;
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
        AsyncStorage.setItem(LEVEL_SAVE_KEY, String(levelIndex)).catch(() => {});
        await endSession(scoreRef.current, {
          result: "play",
          completed: false,
          reason: "background",
          level: levelIndex + 1,
          score: scoreRef.current,
          bricks_broken: bricksBrokenRef.current,
          powerups_collected: powerupsCollectedRef.current,
          shield_saves: shieldSavesRef.current,
          recalls: recallsRef.current,
          max_balls: maxSimultaneousBallsRef.current,
          highest_level: highestLevelRef.current,
        });
      }
      if (state === "active" && isFocused && !sessionOpenRef.current) {
        await startSession();
        startLoop();
      }
    });
    return () => sub.remove();
  }, [isFocused, startSession, endSession, startLoop, levelIndex]);

  useEffect(() => {
    (async () => {
      if (isFocused) { await startSession(); startLoop(); }
      else {
        runningRef.current = false;
        if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
        AsyncStorage.setItem(LEVEL_SAVE_KEY, String(levelIndex)).catch(() => {});
        await endSession(scoreRef.current, {
          result: "play",
          completed: false,
          reason: "unfocus",
          level: levelIndex + 1,
          score: scoreRef.current,
          bricks_broken: bricksBrokenRef.current,
          powerups_collected: powerupsCollectedRef.current,
          shield_saves: shieldSavesRef.current,
          recalls: recallsRef.current,
          max_balls: maxSimultaneousBallsRef.current,
          highest_level: highestLevelRef.current,
        });
      }
    })();
  }, [isFocused, startSession, endSession, startLoop, levelIndex]);

  const restartGame = async () => {
    runningRef.current = false;
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
    await endSession(scoreRef.current, {
      result: "play",
      completed: false,
      reason: "restart",
      level: levelIndex + 1,
      score: scoreRef.current,
      bricks_broken: bricksBrokenRef.current,
      powerups_collected: powerupsCollectedRef.current,
      shield_saves: shieldSavesRef.current,
      recalls: recallsRef.current,
      max_balls: maxSimultaneousBallsRef.current,
      highest_level: highestLevelRef.current,
    });
    fullReset(levelIndex);
    await startSession();
    startLoop();
  };

  if (!fontsLoaded) return null;

  /* ===== UI helpers ===== */
  const PowerIcon = ({ type, size = 16, color = "#fff" }) => {
    if (type === POWER_TYPES.WIDE) return <Plus size={size} color={color} />;
    if (type === POWER_TYPES.SLOW) return <Timer size={size} color={color} />;
    if (type === POWER_TYPES.MULTI) return <Zap size={size} color={color} />;
    if (type === POWER_TYPES.SHIELD) return <Shield size={size} color={color} />;
    if (type === POWER_TYPES.EXTRA) return <Plus size={size} color={color} />;
    return null;
  };

  const paddleStyle = {
    position: "absolute",
    left: 0,
    top: PADDLE_Y,
    width: getPaddleWidth(),
    height: PADDLE_HEIGHT,
    borderRadius: 10,
    backgroundColor: "#9AE6B4",
    shadowColor: "#9AE6B4",
    shadowOpacity: 0.6,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    transform: [{ translateX: paddleAnim }],
  };

  const secsLeft = (until) => Math.max(0, Math.ceil((until - Date.now()) / 1000));

  /* ===== Render ===== */
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <TouchableOpacity
            onPress={async () => {
              runningRef.current = false;
              if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
              rafIdRef.current = null;
              AsyncStorage.setItem(LEVEL_SAVE_KEY, String(levelIndex)).catch(() => {});
              await closeAndSubmitFinal("back");
              router.back();
            }}
            style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" }}
          >
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>

          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" }}>Smash ’Em</Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={() => setShowAchievements(true)}
              style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <Trophy size={22} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={recallBall}
              style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(147,197,253,0.22)", borderWidth: 1, borderColor: "rgba(147,197,253,0.45)" }}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <RotateCw size={18} color="#BFDBFE" />
                <Text style={{ marginLeft: 6, color: "#BFDBFE", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                  Recall (-1 life)
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={restartGame}
              style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <RotateCcw size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* HUD */}
        <BlurView
          intensity={80}
          tint="dark"
          style={{
            backgroundColor: "rgba(0,0,0,0.35)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            borderRadius: 16,
            padding: 16,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                Score
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#9AE6B4" }}>{score.toLocaleString()}</Text>
            </View>
            <View style={{ width: 1, height: 40, backgroundColor: "rgba(255,255,255,0.12)" }} />
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                Lives
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#FCA5A5" }}>{lives}</Text>
            </View>
            <View style={{ width: 1, height: 40, backgroundColor: "rgba(255,255,255,0.12)" }} />
            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                Level
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 22, color: "#93C5FD" }}>{levelIndex + 1}</Text>
            </View>
          </View>

          {/* Active power-up chips */}
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 12 }}>
            {Date.now() < shieldUntil && (
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(74,222,128,0.18)", borderWidth: 1, borderColor: "rgba(74,222,128,0.35)" }}>
                <Shield size={14} color="#86EFAC" />
                <Text style={{ marginLeft: 6, color: "#86EFAC", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                  Shield {secsLeft(shieldUntil)}s
                </Text>
              </View>
            )}
            {Date.now() < slowUntil && (
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(147,197,253,0.18)", borderWidth: 1, borderColor: "rgba(147,197,253,0.35)" }}>
                <Timer size={14} color="#BFDBFE" />
                <Text style={{ marginLeft: 6, color: "#BFDBFE", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                  Slow {secsLeft(slowUntil)}s
                </Text>
              </View>
            )}
            {Date.now() < wideUntil && (
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(250,204,21,0.18)", borderWidth: 1, borderColor: "rgba(250,204,21,0.35)" }}>
                <Plus size={14} color="#FACC15" />
                <Text style={{ marginLeft: 6, color: "#FACC15", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                  Wide {secsLeft(wideUntil)}s
                </Text>
              </View>
            )}
          </View>
        </BlurView>
      </View>

      {/* Game + Control */}
      <View style={{ flex: 1, paddingHorizontal: FIELD_MARGIN_H, paddingBottom: insets.bottom + 24 }}>
        {/* FIELD */}
        <View
          style={{
            width: FIELD_WIDTH,
            height: FIELD_HEIGHT,
            alignSelf: "center",
            borderRadius: 18,
            backgroundColor: "rgba(255,255,255,0.08)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.14)",
            overflow: "hidden",
          }}
        >
          {/* Shield line */}
          {Date.now() < shieldUntil && (
            <View
              style={{
                position: "absolute",
                left: 10,
                right: 10,
                bottom: 10,
                height: 3,
                backgroundColor: "#9AE6B4",
                opacity: 0.75,
                borderRadius: 2,
              }}
            />
          )}

          {/* Bricks */}
          {bricks.map((b) => (
            <View
              key={b.id}
              style={{
                position: "absolute",
                left: b.x,
                top: b.y,
                width: b.w,
                height: b.h,
                borderRadius: 8,
                backgroundColor: b.unbreakable ? "#5B6470" : b.color,
                borderWidth: 1,
                borderColor: b.unbreakable ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.28)",
              }}
            />
          ))}

          {/* Power Drops */}
          {powerDrops.map((d) => (
            <View
              key={d.id}
              style={{
                position: "absolute",
                left: d.x,
                top: d.y,
                width: POWER_SIZE,
                height: POWER_SIZE,
                borderRadius: 8,
                backgroundColor: "rgba(255,255,255,0.12)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.28)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <PowerIcon type={d.type} />
            </View>
          ))}

          {/* Balls */}
          {balls.map((b, i) => (
            <View
              key={`ball-${i}`}
              style={{
                position: "absolute",
                left: b.x,
                top: b.y,
                width: BALL_SIZE,
                height: BALL_SIZE,
                borderRadius: BALL_SIZE / 2,
                backgroundColor: "#ffffff",
                shadowColor: "#ffffff",
                shadowOpacity: 0.85,
                shadowRadius: 6,
              }}
            />
          ))}

          {/* Glued ball */}
          {attached && (
            <Animated.View
              style={{
                position: "absolute",
                left: 0,
                top: PADDLE_Y - BALL_SIZE - 2,
                width: BALL_SIZE,
                height: BALL_SIZE,
                borderRadius: BALL_SIZE / 2,
                backgroundColor: "#ffffff",
                shadowColor: "#ffffff",
                shadowOpacity: 0.85,
                shadowRadius: 6,
                transform: [
                  {
                    translateX: Animated.add(
                      paddleAnim,
                      new Animated.Value(getPaddleWidth() / 2 - BALL_SIZE / 2)
                    ),
                  },
                ],
              }}
            />
          )}

          {/* Paddle */}
          <Animated.View style={paddleStyle} />
        </View>

        {/* CONTROL STRIP (drag area) */}
        <BlurView
          {...controlPan.panHandlers}
          intensity={80}
          tint="dark"
          style={{
            width: FIELD_WIDTH,
            height: CONTROL_HEIGHT,
            alignSelf: "center",
            marginTop: 12,
            borderRadius: 16,
            backgroundColor: "rgba(0,0,0,0.35)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.14)",
            overflow: "hidden",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              textAlign: "center",
              color: "rgba(255,255,255,0.8)",
              fontFamily: "Inter_600SemiBold",
              fontSize: 12,
            }}
          >
            Swipe here to move the paddle
          </Text>
        </BlurView>

        {(gameOver || youWin) && (
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: "rgba(0,0,0,0.7)",
              paddingHorizontal: 20,
            }}
          >
            <BlurView
              intensity={100}
              tint="dark"
              style={{
                backgroundColor: "rgba(0,0,0,0.85)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.15)",
                borderRadius: 20,
                padding: 32,
                alignItems: "center",
                width: screenWidth - 40,
              }}
            >
              <Trophy size={48} color="#9AE6B4" style={{ marginBottom: 16 }} />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: "#fff", marginBottom: 8 }}>
                {youWin ? "You Win!" : "Game Over"}
              </Text>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 18, color: "#9AE6B4", marginBottom: 20 }}>
                Score: {score.toLocaleString()}
              </Text>

              <View style={{ flexDirection: "row" }}>
                <TouchableOpacity
                  onPress={restartGame}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.12)",
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderRadius: 12,
                    marginRight: 12,
                  }}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" }}>
                    Play Again
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={async () => {
                    runningRef.current = false;
                    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
                    rafIdRef.current = null;
                    AsyncStorage.setItem(LEVEL_SAVE_KEY, String(levelIndex)).catch(() => {});
                    await closeAndSubmitFinal(youWin ? "win" : "game_over");
                    router.back();
                  }}
                  style={{
                    backgroundColor: "#6366F1",
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderRadius: 12,
                  }}
                >
                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" }}>
                    Back to Hub
                  </Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        )}
      </View>

      {/* Achievements Modal */}
      <Modal
        visible={showAchievements}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAchievements(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", paddingHorizontal: 16 }}>
          <View
            style={{
              borderRadius: 16,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.15)",
              backgroundColor: "rgba(0,0,0,0.9)",
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: "rgba(255,255,255,0.12)",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text style={{ fontWeight: "700", fontSize: 16, color: "#fff" }}>
                Smash ’Em Achievements
              </Text>
              <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
                <Text style={{ fontWeight: "600", fontSize: 14, color: "rgba(255,255,255,0.75)" }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 12 }}>
              {currentPlayerId != null && resolvedGameId != null ? (
                <AchievementsSection
                  key={`${resolvedGameId}-${currentPlayerId}`}
                  playerId={currentPlayerId}
                  gameId={resolvedGameId}
                  autoRefreshMs={15000}
                  showSearchBar
                  showFilters
                />
              ) : (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: "rgba(255,255,255,0.75)", textAlign: "center", fontWeight: "500" }}>
                    Loading achievements…
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
