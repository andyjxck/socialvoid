import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  BackHandler,
  AppState,
  PanResponder,
  Modal,
  ScrollView,
  Pressable,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy, Shield, Zap } from "lucide-react-native";
import * as Haptics from "expo-haptics";
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

/* ================================
   DIMENSIONS / TUNING
================================ */
const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const FIELD_MARGIN_H = 20;
const FIELD_WIDTH = screenWidth - FIELD_MARGIN_H * 2;
const FIELD_HEIGHT = Math.min(560, Math.floor(screenHeight * 0.58));

const SWIPE_PAD_HEIGHT = 64; // smaller & won't block visuals
const SWIPE_PAD_BG = "rgba(0,0,0,0.45)";

const PLAYER_W = 46;
const PLAYER_H = 22;
const PLAYER_Y = FIELD_HEIGHT - SWIPE_PAD_HEIGHT - PLAYER_H - 8; // sits above pad

const PB_W = 4;
const PB_H = 10;
const PB_VY = -240; // px/sec (converted via dt)

const AUTO_FIRE_BASE_MS = 1000;
const AUTO_FIRE_POWER_MS = 100;
const SHOTGUN_COUNT = 5;
const SHOTGUN_SPREAD_VX = 80; // px/sec left/right for spread

// Formation (~20 aliens / wave)
const COLS = 5;
const ROWS = 4; // 5x4 = 20
const ALIEN_W = 24;
const ALIEN_H = 18;
const ALIEN_GAP_X = 22;
const ALIEN_GAP_Y = 18;
const ALIEN_START_X = 18;
const ALIEN_START_Y = 20;

const STEP_X = 1;            // px per march step
const DROP_Y = 18;            // px per drop
const STEP_MS_BASE = 1;
const STEP_MS_MIN = 1;
const STEP_MS_PER_KILL = 12;
const STEP_MS_PER_WAVE = 1;
const SLOW_MULTIPLIER = 1.8;

// Alien bullets
const AB_W = 4;
const AB_H = 10;
const AB_VY = 180; // px/sec
const ALIEN_FIRE_MIN = 900;
const ALIEN_FIRE_MAX = 1600;

// Wave timer
const WAVE_TIME_START_MS = 60000;
const WAVE_TIME_DECR_MS = 5000;
const WAVE_TIME_MIN_MS = 20000;

// Lives & scoring
const LIVES_START = 3;
const SCORE_PER_ALIEN = 50;
const UFO_SCORE_MIN = 150;
const UFO_SCORE_MAX = 300;
const WAVE_CLEAR_BONUS = 300;

// Power-ups
const POWERUP_DROP_CHANCE = 0.12;
const POWERUP_FALL_VY = 120; // px/sec
const POWERUP_DURATION_MS = 10000;
const POWER_TYPES = ["autofire", "shotgun", "bomb", "slow"];

// UFO
const UFO_Y = 8;
const UFO_W = 28;
const UFO_H = 16;
const UFO_VX = 130; // px/sec
const UFO_SPAWN_MIN = 12000;
const UFO_SPAWN_MAX = 20000;

const FALLBACK_GAME_ID = 29;

/* ================================
   UTILS
================================ */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const randInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];
const nowMs = () => Date.now();
const rectsOverlap = (x1,y1,w1,h1,x2,y2,w2,h2) =>
  !(x1 + w1 <= x2 || x1 >= x2 + w2 || y1 + h1 <= y2 || y1 >= y2 + h2);

/* ================================
   MAIN
================================ */
export default function VoidInvaders() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();

  const [fontsLoaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });

  // tracking (decoupled from game loop)
  const sessionOpenRef = useRef(false);
  const retryTimerRef = useRef(null);

  const [showAchievements, setShowAchievements] = useState(false);
  const [resolvedGameId, setResolvedGameId] = useState(null);
  const [currentPlayerId, setCurrentPlayerId] = useState(null);

  // game state
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(LIVES_START);
  const [wave, setWave] = useState(1);
  const [gameOver, setGameOver] = useState(false);

  // wave timer
  const [waveTimeMs, setWaveTimeMs] = useState(WAVE_TIME_START_MS);
  const waveTimerRef = useRef(WAVE_TIME_START_MS);

  // player
  const [playerX, setPlayerX] = useState((FIELD_WIDTH - PLAYER_W) / 2);
  const playerXRef = useRef(playerX);

  // bullets (player)
  const [bullets, setBullets] = useState([]); // [{x,y,vx,vy}]
  const bulletsRef = useRef(bullets);

  // aliens
  const [aliens, setAliens] = useState(() => makeAliens(ROWS, COLS));
  const aliensRef = useRef(aliens);

  // alien bullets
  const [aBullets, setABullets] = useState([]); // [{x,y}]
  const aBulletsRef = useRef(aBullets);
  const nextAlienFireAtRef = useRef(nowMs() + randInt(ALIEN_FIRE_MIN, ALIEN_FIRE_MAX));

  // power-ups
  const [powerups, setPowerups] = useState([]); // [{x,y,type}]
  const powerupsRef = useRef(powerups);

  // UFO
  const [ufo, setUfo] = useState(null); // {x,y,dir}
  const nextUfoAtRef = useRef(nowMs() + randInt(UFO_SPAWN_MIN, UFO_SPAWN_MAX));

  // marching state
  const dirRef = useRef(1); // 1=right, -1=left
  const stepIntervalRef = useRef(STEP_MS_BASE);
  const marchTimerRef = useRef(0); // accumulates dt until >= interval

  // power-up timers
  const autoFireUntilRef = useRef(0);
  const shotgunUntilRef = useRef(0);
  const slowUntilRef = useRef(0);
  const fireTimerRef = useRef(0); // ms accumulator for cadence

  // main loop
  const loopHandleRef = useRef(null);
  const lastTsRef = useRef(nowMs());

  // mirrors
  useEffect(() => { playerXRef.current = playerX; }, [playerX]);
  useEffect(() => { bulletsRef.current = bullets; }, [bullets]);
  useEffect(() => { aliensRef.current = aliens; }, [aliens]);
  useEffect(() => { aBulletsRef.current = aBullets; }, [aBullets]);
  useEffect(() => { powerupsRef.current = powerups; }, [powerups]);

  /* ===== load player id / resolve game id ===== */
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        setCurrentPlayerId(saved ? parseInt(saved) : 1);
      } catch {
        setCurrentPlayerId(1);
      }
    })();
  }, []);
  useEffect(() => {
    (async () => {
      try {
        let gid = await getGameId(GAME_TYPES?.VOID_INVADERS ?? "VOID_INVADERS");
        if (!gid) gid = await getGameId("void_invaders");
        if (!gid) gid = await getGameId("Void Invaders");
        if (!gid) gid = FALLBACK_GAME_ID;
        setResolvedGameId(typeof gid === "number" ? gid : FALLBACK_GAME_ID);
      } catch {
        setResolvedGameId(FALLBACK_GAME_ID);
      }
    })();
  }, []);

  /* ===== tracking (decoupled) ===== */
  const openTrackedSession = useCallback(
    async (attempt = 1) => {
      if (sessionOpenRef.current) return;
      if (!currentPlayerId || !isFocused || !resolvedGameId) return;
      try {
        await gameTracker.startGame(resolvedGameId, currentPlayerId);
        sessionOpenRef.current = true;
      } catch {
        if (attempt < 5 && isFocused) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(
            () => openTrackedSession(attempt + 1), 400 * attempt
          );
        }
      }
    },
    [currentPlayerId, isFocused, resolvedGameId]
  );
  const closeTrackedSession = useCallback(async () => {
    clearTimeout(retryTimerRef.current);
    if (!sessionOpenRef.current) return;
    try {
      await gameTracker.endGame(resolvedGameId ?? FALLBACK_GAME_ID, score || 0);
    } catch {} finally {
      sessionOpenRef.current = false;
    }
  }, [resolvedGameId, score]);

  /* ===== lifecycle & back ===== */
  const fullReset = useCallback(() => {
    setScore(0);
    setLives(LIVES_START);
    setWave(1);
    setGameOver(false);

    setBullets([]);
    setABullets([]);
    setPowerups([]);
    setUfo(null);

    setAliens(makeAliens(ROWS, COLS));
    dirRef.current = 1;

    stepIntervalRef.current = STEP_MS_BASE;
    marchTimerRef.current = 0;

    autoFireUntilRef.current = 0;
    shotgunUntilRef.current = 0;
    slowUntilRef.current = 0;
    fireTimerRef.current = 0;

    const t0 = WAVE_TIME_START_MS;
    setWaveTimeMs(t0);
    waveTimerRef.current = t0;

    nextAlienFireAtRef.current = nowMs() + randInt(ALIEN_FIRE_MIN, ALIEN_FIRE_MAX);
    nextUfoAtRef.current = nowMs() + randInt(UFO_SPAWN_MIN, UFO_SPAWN_MAX);

    setPlayerX((FIELD_WIDTH - PLAYER_W) / 2);
    lastTsRef.current = nowMs();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fullReset();
      startLoop();

      const back = BackHandler.addEventListener("hardwareBackPress", () => {
        stopLoop();
        closeTrackedSession();
        router.back();
        return true;
      });
      return () => {
        back.remove();
        stopLoop();
        closeTrackedSession();
      };
    }, [fullReset, closeTrackedSession])
  );

  useEffect(() => {
    if (isFocused && currentPlayerId && resolvedGameId) openTrackedSession();
    else closeTrackedSession();
  }, [isFocused, currentPlayerId, resolvedGameId, openTrackedSession, closeTrackedSession]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state === "inactive" || state === "background") {
        stopLoop();
        await closeTrackedSession();
      } else if (state === "active" && isFocused) {
        startLoop();
        if (currentPlayerId && resolvedGameId) openTrackedSession();
      }
    });
    return () => sub.remove();
  }, [isFocused, currentPlayerId, resolvedGameId, openTrackedSession, closeTrackedSession]);

  /* ===== single game loop ===== */
  const startLoop = () => {
    if (loopHandleRef.current) return;
    const tick = () => {
      const now = nowMs();
      const dtMs = Math.min(50, now - lastTsRef.current); // clamp huge jumps
      lastTsRef.current = now;
      const dt = dtMs / 1000; // seconds

      if (!gameOver) {
        // 1) Wave countdown
        waveTimerRef.current = Math.max(0, waveTimerRef.current - dtMs);
        setWaveTimeMs(waveTimerRef.current);
        if (waveTimerRef.current === 0) {
          loseLife();
          const reset = Math.max(WAVE_TIME_MIN_MS, WAVE_TIME_START_MS - (wave - 1) * WAVE_TIME_DECR_MS);
          waveTimerRef.current = reset;
          setWaveTimeMs(reset);
        }

        // 2) Player auto-fire cadence (with power-up override)
        const fireCadence = now < autoFireUntilRef.current ? AUTO_FIRE_POWER_MS : AUTO_FIRE_BASE_MS;
        fireTimerRef.current += dtMs;
        while (fireTimerRef.current >= fireCadence) {
          tryFire();
          fireTimerRef.current -= fireCadence;
        }

        // 3) Marching (step/delay + edge -> drop)
        const slow = now < slowUntilRef.current;
        const interval = (slow ? stepIntervalRef.current * SLOW_MULTIPLIER : stepIntervalRef.current);
        marchTimerRef.current += dtMs;
        if (marchTimerRef.current >= interval) {
          doMarchStep();
          marchTimerRef.current -= interval;
        }

        // 4) Move bullets (player, aliens), powerups, UFO
        stepMovers(dt);

        // 5) Collisions
        resolveCollisions();

        // 6) Bottom reach -> life loss
        if (aliensRef.current.some(a => a.alive && a.y + ALIEN_H >= PLAYER_Y)) {
          loseLife();
        }

        // 7) Wave clear
        if (aliensRef.current.every(a => !a.alive)) {
          setScore(s => s + WAVE_CLEAR_BONUS);
          setWave(w => w + 1);
          setAliens(makeAliens(ROWS, COLS));
          setBullets([]); setABullets([]); setPowerups([]); setUfo(null);
          dirRef.current = 1;
          const tReset = Math.max(WAVE_TIME_MIN_MS, WAVE_TIME_START_MS - (wave) * WAVE_TIME_DECR_MS);
          waveTimerRef.current = tReset;
          setWaveTimeMs(tReset);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }

        // 8) Alien firing + UFO spawn
        if (now >= nextAlienFireAtRef.current && aliensRef.current.some(a => a.alive)) {
          const shooter = pickBottomShooter(aliensRef.current);
          if (shooter) {
            setABullets(prev => [...prev, { x: shooter.x + ALIEN_W / 2 - AB_W / 2, y: shooter.y + ALIEN_H }]);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          nextAlienFireAtRef.current = now + randInt(ALIEN_FIRE_MIN, ALIEN_FIRE_MAX);
        }
        if (!ufo && now >= nextUfoAtRef.current) {
          const dir = Math.random() < 0.5 ? 1 : -1;
          const startX = dir === 1 ? -UFO_W : FIELD_WIDTH;
          setUfo({ x: startX, y: UFO_Y, dir });
          nextUfoAtRef.current = now + randInt(UFO_SPAWN_MIN, UFO_SPAWN_MAX);
        }
      }

      loopHandleRef.current = setTimeout(tick, 1000 / 60);
    };
    lastTsRef.current = nowMs();
    loopHandleRef.current = setTimeout(tick, 1000 / 60);
    // fire instantly so it’s obvious bullets are moving
    tryFire();
  };

  const stopLoop = () => {
    if (loopHandleRef.current) clearTimeout(loopHandleRef.current);
    loopHandleRef.current = null;
  };

  /* ===== marching ===== */
  const doMarchStep = () => {
    const alive = aliensRef.current.filter(a => a.alive);
    if (alive.length === 0) return;

    // compute formation bounds
    const minX = Math.min(...alive.map(a => a.x));
    const maxX = Math.max(...alive.map(a => a.x + ALIEN_W));

    // check if NEXT step would hit an edge; if so, drop and flip
    const willHitRight = dirRef.current === 1 && (maxX + STEP_X >= FIELD_WIDTH);
    const willHitLeft  = dirRef.current === -1 && (minX - STEP_X <= 0);

    if (willHitRight || willHitLeft) {
      setAliens(prev => prev.map(a => (a.alive ? { ...a, y: a.y + DROP_Y } : a)));
      dirRef.current *= -1;
    } else {
      setAliens(prev => prev.map(a => (a.alive ? { ...a, x: a.x + dirRef.current * STEP_X } : a)));
    }

    // speed up based on survivors & wave
    const total = ROWS * COLS;
    const aliveCount = alive.length;
    const destroyed = total - aliveCount;
    const waveBias = (wave - 1) * STEP_MS_PER_WAVE;
    stepIntervalRef.current = Math.max(
      STEP_MS_MIN,
      STEP_MS_BASE - destroyed * STEP_MS_PER_KILL - waveBias
    );
  };

  /* ===== movers ===== */
  const stepMovers = (dt) => {
    // player bullets
    if (bulletsRef.current.length) {
      const moved = bulletsRef.current
        .map(b => ({ ...b, x: b.x + (b.vx || 0) * dt, y: b.y + (b.vy != null ? b.vy : PB_VY) * dt }))
        .filter(b => b.y + PB_H >= 0 && b.y <= PLAYER_Y + PLAYER_H && b.x + PB_W >= 0 && b.x <= FIELD_WIDTH);
      if (moved.length !== bulletsRef.current.length) setBullets(moved);
      else if (moved !== bulletsRef.current) setBullets(moved);
    }
    // alien bullets
    if (aBulletsRef.current.length) {
      const moved = aBulletsRef.current
        .map(ab => ({ x: ab.x, y: ab.y + AB_VY * dt }))
        .filter(ab => ab.y <= FIELD_HEIGHT);
      if (moved.length !== aBulletsRef.current.length) setABullets(moved);
      else if (moved !== aBulletsRef.current) setABullets(moved);
    }
    // powerups
    if (powerupsRef.current.length) {
      const moved = powerupsRef.current
        .map(p => ({ ...p, y: p.y + POWERUP_FALL_VY * dt }))
        .filter(p => p.y <= FIELD_HEIGHT);
      if (moved.length !== powerupsRef.current.length) setPowerups(moved);
      else if (moved !== powerupsRef.current) setPowerups(moved);
    }
    // UFO
    if (ufo) {
      setUfo(curr => {
        if (!curr) return null;
        const nx = curr.x + UFO_VX * curr.dir * dt;
        if (nx < -UFO_W - 10 || nx > FIELD_WIDTH + 10) return null;
        return { ...curr, x: nx };
      });
    }
  };

  /* ===== collisions ===== */
  const resolveCollisions = () => {
    // player bullets vs UFO/aliens (each bullet kills ONE target then disappears)
    if (bulletsRef.current.length) {
      let aliensArr = aliensRef.current.slice();
      const kept = [];

      for (const b of bulletsRef.current) {
        let consumed = false;

        // UFO
        if (!consumed && ufo && rectsOverlap(b.x, b.y, PB_W, PB_H, ufo.x, ufo.y, UFO_W, UFO_H)) {
          const bonus = randInt(UFO_SCORE_MIN, UFO_SCORE_MAX);
          setScore(s => s + bonus);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setUfo(null);
          consumed = true;
        }

        // Aliens
        if (!consumed) {
          for (let i = 0; i < aliensArr.length; i++) {
            const a = aliensArr[i];
            if (!a.alive) continue;
            if (rectsOverlap(b.x, b.y, PB_W, PB_H, a.x, a.y, ALIEN_W, ALIEN_H)) {
              aliensArr[i] = { ...a, alive: false };
              setScore(s => s + SCORE_PER_ALIEN);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              // maybe drop
              if (Math.random() < POWERUP_DROP_CHANCE) {
                const ptype = sample(POWER_TYPES);
                setPowerups(prev => [...prev, { x: a.x + ALIEN_W / 2 - 8, y: a.y, type: ptype }]);
              }
              consumed = true;
              break;
            }
          }
        }

        if (!consumed) kept.push(b);
      }

      if (kept.length !== bulletsRef.current.length) setBullets(kept);
      if (aliensArr !== aliensRef.current) setAliens(aliensArr);
    }

    // alien bullets vs player
    if (aBulletsRef.current.length) {
      const px = playerXRef.current, py = PLAYER_Y;
      const px2 = px + PLAYER_W, py2 = py + PLAYER_H;
      let hit = false;
      const kept = [];
      for (const ab of aBulletsRef.current) {
        const nx2 = ab.x + AB_W, ny2 = ab.y + AB_H;
        if (!(ab.x < px2 && nx2 > px && ab.y < py2 && ny2 > py)) {
          kept.push(ab);
        } else {
          hit = true;
        }
      }
      if (hit) loseLife();
      if (kept.length !== aBulletsRef.current.length) setABullets(kept);
    }

    // powerup pickups
    if (powerupsRef.current.length) {
      const kept = [];
      for (const p of powerupsRef.current) {
        const caught = rectsOverlap(playerXRef.current, PLAYER_Y, PLAYER_W, PLAYER_H, p.x, p.y, 16, 16);
        if (caught) applyPowerUp(p.type);
        else kept.push(p);
      }
      if (kept.length !== powerupsRef.current.length) setPowerups(kept);
    }
  };

  /* ===== firing ===== */
  const tryFire = () => {
    const shotgun = nowMs() < shotgunUntilRef.current;
    if (!shotgun) {
      // single-bullet rule
      if (bulletsRef.current.length > 0) return;
      const bx = playerXRef.current + PLAYER_W / 2 - PB_W / 2;
      const by = PLAYER_Y - PB_H - 2;
      setBullets(prev => [...prev, { x: bx, y: by, vx: 0, vy: PB_VY }]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return;
    }
    // shotgun: 5-shot spread (vx spread), ignore single-bullet rule
    const cx = playerXRef.current + PLAYER_W / 2 - PB_W / 2;
    const by = PLAYER_Y - PB_H - 2;
    const shots = [];
    for (let i = 0; i < SHOTGUN_COUNT; i++) {
      const t = i / (SHOTGUN_COUNT - 1); // 0..1
      const vx = (t - 0.5) * 2 * SHOTGUN_SPREAD_VX; // px/sec
      shots.push({ x: cx, y: by, vx, vy: PB_VY });
    }
    setBullets(prev => [...prev, ...shots]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  /* ===== power-ups ===== */
  const applyPowerUp = (type) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const until = nowMs() + POWERUP_DURATION_MS;
    if (type === "autofire") {
      autoFireUntilRef.current = until;
      // reset cadence now so it feels instant
      fireTimerRef.current = Math.max(fireTimerRef.current, AUTO_FIRE_POWER_MS);
    } else if (type === "shotgun") {
      shotgunUntilRef.current = until;
    } else if (type === "bomb") {
      const aliveIdxs = aliensRef.current.map((a, i) => (a.alive ? i : -1)).filter(i => i >= 0);
      if (aliveIdxs.length) {
        const n = Math.min(aliveIdxs.length, randInt(2, 9));
        const chosen = shuffle(aliveIdxs).slice(0, n);
        setAliens(prev => prev.map((a, i) => (chosen.includes(i) ? { ...a, alive: false } : a)));
        setScore(s => s + n * SCORE_PER_ALIEN);
      }
    } else if (type === "slow") {
      slowUntilRef.current = until;
    }
  };

  /* ===== lives / restart ===== */
  const loseLife = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setLives(l => {
      const next = l - 1;
      if (next <= 0) {
        setGameOver(true);
        stopLoop();
        closeTrackedSession();
      } else {
        // soft reset
        setBullets([]); setABullets([]); setPowerups([]); setUfo(null);
        setPlayerX((FIELD_WIDTH - PLAYER_W) / 2);
        // reset timer for current wave
        const tReset = Math.max(WAVE_TIME_MIN_MS, WAVE_TIME_START_MS - (wave - 1) * WAVE_TIME_DECR_MS);
        waveTimerRef.current = tReset; setWaveTimeMs(tReset);
        // nudge aliens up a bit
        setAliens(prev => prev.map(a => (a.alive ? { ...a, y: Math.max(0, a.y - 20) } : a)));
        nextAlienFireAtRef.current = nowMs() + randInt(ALIEN_FIRE_MIN, ALIEN_FIRE_MAX);
        nextUfoAtRef.current = nowMs() + randInt(UFO_SPAWN_MIN, UFO_SPAWN_MAX);
      }
      return Math.max(0, next);
    });
  }, [closeTrackedSession, wave]);

  const restartGame = async () => {
    stopLoop();
    await closeTrackedSession();
    fullReset();
    await openTrackedSession();
    startLoop();
  };

  /* ===== swipe pad ===== */
  const dragRef = useRef({ startX: 0, startPX: 0 });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_evt, g) => {
        dragRef.current.startX = g.x0;
        dragRef.current.startPX = playerXRef.current;
      },
      onPanResponderMove: (_evt, g) => {
        const dx = g.moveX - dragRef.current.startX;
        const nx = clamp(dragRef.current.startPX + dx, 0, FIELD_WIDTH - PLAYER_W);
        setPlayerX(nx);
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  if (!fontsLoaded) return null;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <NightSkyBackground />

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 20, marginBottom: 20 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <TouchableOpacity
            onPress={() => { stopLoop(); closeTrackedSession(); router.back(); }}
            style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" }}
          >
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>

          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" }}>Void Invaders</Text>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={() => setShowAchievements(true)}
              style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <Trophy size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={restartGame}
              style={{ padding: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.08)" }}
            >
              <RotateCcw size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Scoreboard */}
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
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: "#9AE6B4" }}>{score}</Text>
            </View>

            <View style={{ width: 1, height: 40, backgroundColor: "rgba(255,255,255,0.12)" }} />

            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                Wave
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 24, color: "#93C5FD" }}>{wave}</Text>
            </View>

            <View style={{ width: 1, height: 40, backgroundColor: "rgba(255,255,255,0.12)" }} />

            <View style={{ alignItems: "center", flex: 1 }}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.8)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                Time
              </Text>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#FCD34D" }}>
                {(Math.ceil(waveTimeMs / 1000)).toString().padStart(2, "0")}s
              </Text>
            </View>

            <View style={{ width: 1, height: 40, backgroundColor: "rgba(255,255,255,0.12)" }} />

            <View style={{ alignItems: "center", flex: 1, flexDirection: "row", justifyContent: "center", gap: 6 }}>
              <Shield size={18} color="#fff" />
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" }}>{lives}</Text>
            </View>
          </View>
        </BlurView>
      </View>

      {/* Field */}
      <View style={{ flex: 1, paddingHorizontal: FIELD_MARGIN_H, paddingBottom: insets.bottom + 24 }}>
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
          {/* Tap to shoot as well */}
          <Pressable
            onPress={tryFire}
            style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%" }}
          >
            {/* UFO */}
            {ufo && (
              <View
                style={{
                  position: "absolute",
                  left: ufo.x,
                  top: ufo.y,
                  width: UFO_W,
                  height: UFO_H,
                  borderRadius: 3,
                  backgroundColor: "rgba(252, 211, 77, 0.9)",
                }}
              />
            )}

            {/* Aliens */}
            {aliens.map((a) =>
              a.alive ? (
                <View
                  key={a.id}
                  style={{
                    position: "absolute",
                    left: a.x,
                    top: a.y,
                    width: ALIEN_W,
                    height: ALIEN_H,
                    borderRadius: 3,
                    backgroundColor: "rgba(255,255,255,0.9)",
                  }}
                />
              ) : null
            )}

            {/* Powerups */}
            {powerups.map((p, i) => (
              <View
                key={`p-${i}`}
                style={{
                  position: "absolute",
                  left: p.x,
                  top: p.y,
                  width: 16,
                  height: 16,
                  borderRadius: 3,
                  backgroundColor:
                    p.type === "autofire" ? "#34D399" :
                    p.type === "shotgun" ? "#A78BFA" :
                    p.type === "bomb"     ? "#F59E0B" :
                    "#60A5FA",
                }}
              />
            ))}

            {/* Player Bullets */}
            {bullets.map((b, i) => (
              <View
                key={`b-${i}`}
                style={{
                  position: "absolute",
                  left: b.x,
                  top: b.y,
                  width: PB_W,
                  height: PB_H,
                  borderRadius: 2,
                  backgroundColor: "#A78BFA",
                }}
              />
            ))}

            {/* Alien Bullets */}
            {aBullets.map((ab, i) => (
              <View
                key={`ab-${i}`}
                style={{
                  position: "absolute",
                  left: ab.x,
                  top: ab.y,
                  width: AB_W,
                  height: AB_H,
                  borderRadius: 2,
                  backgroundColor: "#F87171",
                }}
              />
            ))}

            {/* Player */}
            <View
              style={{
                position: "absolute",
                left: playerX,
                top: PLAYER_Y,
                width: PLAYER_W,
                height: PLAYER_H,
                borderTopLeftRadius: 2,
                borderTopRightRadius: 2,
                borderBottomLeftRadius: 10,
                borderBottomRightRadius: 10,
                backgroundColor: "#6366F1",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Zap size={14} color="#fff" />
            </View>
          </Pressable>

          {/* Swipe Pad (touch-only, does NOT cover visuals/taps) */}
          <View
            {...panResponder.panHandlers}
            pointerEvents="box-only"
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              width: "100%",
              height: SWIPE_PAD_HEIGHT,
              justifyContent: "center",
              alignItems: "center",
              borderTopWidth: 1,
              borderColor: "rgba(255,255,255,0.14)",
              backgroundColor: SWIPE_PAD_BG,
            }}
          >
            <Text style={{ fontFamily: "Inter_600SemiBold", color: "rgba(255,255,255,0.8)", fontSize: 12 }}>
              Swipe to Move • Auto-fire ON (tap anywhere to shoot)
            </Text>
          </View>
        </View>

        {/* Game Over */}
        {gameOver && (
          <View
            style={{
              position: "absolute",
              left: 0, right: 0, top: 0, bottom: 0,
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
                Game Over
              </Text>
              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 18, color: "#9AE6B4", marginBottom: 20 }}>
                Score: {score}
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
                  onPress={() => { stopLoop(); closeTrackedSession(); router.back(); }}
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

      {/* Achievements */}
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
              <Text style={{ fontWeight: "700", fontSize: 16, color: "#fff" }}>Void Invaders — Achievements</Text>
              <TouchableOpacity onPress={() => setShowAchievements(false)} hitSlop={10}>
                <Text style={{ fontWeight: "600", fontSize: 14, color: "rgba(255,255,255,0.7)" }}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 12 }}>
              {currentPlayerId && resolvedGameId ? (
                <AchievementsSection
                  playerId={currentPlayerId}
                  gameId={resolvedGameId}
                  autoRefreshMs={15000}
                  showSearchBar
                  showFilters
                />
              ) : (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: "rgba(255,255,255,0.7)", textAlign: "center", fontWeight: "500" }}>
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

/* ================================
   HELPERS
================================ */
function makeAliens(rows, cols) {
  const list = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = ALIEN_START_X + c * (ALIEN_W + ALIEN_GAP_X);
      const y = ALIEN_START_Y + r * (ALIEN_H + ALIEN_GAP_Y);
      list.push({ id: `${r}-${c}-${Math.random()}`, x, y, alive: true });
    }
  }
  return list;
}
function pickBottomShooter(aliens) {
  // choose a column that has at least one alive; shooter is the lowest (greatest y)
  const cols = new Map();
  aliens.forEach((a) => {
    if (!a.alive) return;
    const col = Math.round((a.x - ALIEN_START_X) / (ALIEN_W + ALIEN_GAP_X));
    const prev = cols.get(col);
    if (!prev || a.y > prev.y) cols.set(col, a);
  });
  const candidates = Array.from(cols.values());
  if (!candidates.length) return null;
  return candidates[randInt(0, candidates.length - 1)];
}
function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
