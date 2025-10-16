// mobile/src/app/games/ScrabbleGame.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  View, Text, TouchableOpacity, ScrollView, Alert, Modal,
  Dimensions, FlatList, BackHandler,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, RotateCcw, HelpCircle, Shuffle, CheckCircle2, XCircle, Trophy } from "lucide-react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";

import NightSkyBackground from "../../../components/NightSkyBackground";
import { useTheme, createGlassStyle } from "../../../utils/theme";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import { WORD_DICTIONARY } from "../../../utils/puzzle_wheel/dictionary";
import AchievementsSection from "../../../components/AchievementsSection";

/* ──────────────────────────────────────────────────────────────
   SETTINGS / CONSTANTS
────────────────────────────────────────────────────────────── */
const N = 11;
const CENTER = { r: 5, c: 5 };
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const MIN_LEN = 3;

const LETTER_SCORES = {
  A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10
};

const BAG_DISTRIBUTION = {
  A:9,B:2,C:2,D:4,E:12,F:2,G:3,H:2,I:9,J:1,K:1,L:4,M:2,N:6,O:8,P:2,Q:1,
  R:6,S:4,T:6,U:4,V:2,W:2,X:1,Y:2,Z:1,"?":2
};

const PREMIUM_LAYOUT = (() => {
  const grid = Array.from({ length: N }, () => Array.from({ length: N }, () => null));
  const put = (type, coords) => coords.forEach(([r,c]) => (grid[r][c] = type));
  put("x3W", [[0,0],[0,10],[10,0],[10,10]]);
  put("x2W", [[5,5]]);
  put("x3L", [[2,2],[2,8],[8,2],[8,8]]);
  put("x2L", [[5,2],[5,8],[2,5],[8,5]]);
  return grid;
})();

const inBounds = (r,c)=>r>=0 && r<N && c>=0 && c<N;
const alphaOnly = (w)=>/^[a-z]+$/.test(w);

/* ──────────────────────────────────────────────────────────────
   DICTIONARY (3+ letters only)
────────────────────────────────────────────────────────────── */
function prepDictionary() {
  const cleaned = Array.from(WORD_DICTIONARY || [])
    .map(w => String(w||"").trim().toLowerCase())
    .filter(w => alphaOnly(w) && w.length >= MIN_LEN && w.length <= 11);
  return { list: cleaned, set: new Set(cleaned) };
}

/* ──────────────────────────────────────────────────────────────
   BAG / RACK
────────────────────────────────────────────────────────────── */
function freshBag() {
  const b = [];
  for (const [ch, n] of Object.entries(BAG_DISTRIBUTION)) {
    for (let i = 0; i < n; i++) b.push(ch);
  }
  for (let i = b.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
function drawTiles(fromBag, n) {
  const bag = fromBag.slice();
  const out = [];
  for (let i = 0; i < n && bag.length; i++) out.push(bag.pop());
  return { drawn: out, bag };
}
function putBackAndShuffle(fromBag, tiles) {
  const bag = fromBag.slice();
  for (const t of tiles) bag.push(t);
  for (let i = bag.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/* ──────────────────────────────────────────────────────────────
   SCORING / WORD COLLECTION
────────────────────────────────────────────────────────────── */
function letterScore(ch) { return LETTER_SCORES[ch.toUpperCase()] || 0; }
function getCell(board, r, c, placements) {
  if (placements) {
    const p = placements.find(x => x.r===r && x.c===c);
    if (p) return { letter: p.letter, isWild: !!p.isWild };
  }
  const cell = board[r]?.[c];
  if (cell && cell.letter) return cell;
  return null;
}
function collectWord(board, placements, dir) {
  const anchor = placements[0];
  const step = dir === "across" ? [0,1] : [1,0];
  const back = [-step[0], -step[1]];

  let r = anchor.r, c = anchor.c;
  while (inBounds(r+back[0], c+back[1]) && getCell(board, r+back[0], c+back[1])) {
    r += back[0]; c += back[1];
  }
  const positions = [];
  let rr = r, cc = c;
  let word = "";
  while (inBounds(rr,cc) && getCell(board, rr, cc, placements)) {
    const cell = getCell(board, rr, cc, placements);
    word += cell.letter.toLowerCase();
    positions.push({ r: rr, c: cc, letter: cell.letter, isWild: !!cell.isWild });
    rr += step[0]; cc += step[1];
  }
  return { word, positions, start: { r, c }, dir };
}
function wordAndCrossesFromPlacement(board, placements, dir) {
  const main = collectWord(board, placements, dir);
  if (!main) return null;
  const crosses = [];
  for (const p of placements) {
    const alt = dir === "across" ? "down" : "across";
    const w = collectWord(board, [p], alt);
    if (w && w.word.length >= MIN_LEN) crosses.push(w);
  }
  return { main, crosses };
}
function computeWordScore(board, wordObj) {
  let wordMult = 1;
  let sum = 0;
  for (const pos of wordObj.positions) {
    const prem = PREMIUM_LAYOUT[pos.r][pos.c];
    const isNew = !board[pos.r][pos.c];
    let ls = pos.isWild ? 0 : letterScore(pos.letter);
    if (isNew && prem) {
      if (prem === "x2L") ls *= 2;
      else if (prem === "x3L") ls *= 3;
      else if (prem === "x2W") wordMult *= 2;
      else if (prem === "x3W") wordMult *= 3;
    }
    sum += ls;
  }
  return sum * wordMult;
}
function isBoardEmpty(board) {
  for (let r=0;r<N;r++) for (let c=0;c<N;c++) if (board[r][c]) return false;
  return true;
}
function touchesCenter(board, placements) {
  if (board[CENTER.r][CENTER.c]) return true;
  return placements.some(p => p.r===CENTER.r && p.c===CENTER.c);
}
function isConnected(board, placements) {
  if (isBoardEmpty(board)) return touchesCenter(board, placements);
  return placements.some(p =>
    [[1,0],[-1,0],[0,1],[0,-1]].some(([dr,dc]) => inBounds(p.r+dr,p.c+dc) && board[p.r+dr][p.c+dc])
  );
}

/* ──────────────────────────────────────────────────────────────
   AI (valid-only)
────────────────────────────────────────────────────────────── */
function rackMultiset(rack) { const m={}; for (const ch of rack) m[ch]=(m[ch]||0)+1; return m; }
function canBuildWithRack(target, rackCounts) {
  const need = {}; for (const ch of target.toUpperCase()) need[ch]=(need[ch]||0)+1;
  let blanks = rackCounts["?"] || 0;
  for (const [ch, n] of Object.entries(need)) {
    const have = rackCounts[ch] || 0;
    if (have >= n) continue;
    const lacking = n - have;
    if (blanks >= lacking) blanks -= lacking;
    else return false;
  }
  return true;
}
function chooseBlanksForWord(target, fixedMap, rackCounts) {
  let blanks = rackCounts["?"] || 0;
  if (!blanks) return {};
  const blankUse = {};
  const copy = { ...rackCounts };
  for (let i = 0; i < target.length; i++) {
    const ch = target[i];
    if (fixedMap[i]) continue;
    const have = copy[ch] || 0;
    if (have > 0) { copy[ch] = have - 1; continue; }
    if (blanks > 0) { blankUse[i] = ch; blanks--; continue; }
    return null;
  }
  return blankUse;
}
function computeAnchors(board) {
  const anchors = [];
  if (isBoardEmpty(board)) return [CENTER];
  for (let r=0;r<N;r++){
    for (let c=0;c<N;c++){
      if (board[r][c]) continue;
      const adj = [[1,0],[-1,0],[0,1],[0,-1]].some(([dr,dc]) => inBounds(r+dr,c+dc) && board[r+dr][c+dc]);
      if (adj) anchors.push({ r, c });
    }
  }
  return anchors;
}
function readLine(board, anchor, dir) {
  const out = [];
  if (dir === "across") {
    for (let c = 0; c < N; c++) out.push({ r: anchor.r, c, cell: board[anchor.r][c] || null });
  } else {
    for (let r = 0; r < N; r++) out.push({ r, c: anchor.c, cell: board[r][anchor.c] || null });
  }
  return out;
}
function tryPlaceWordOnLine(board, rackCounts, word, line, offset, dir) {
  const placements = [];
  const fixedMap = {};
  for (let i = 0; i < word.length; i++) {
    const j = i + offset;
    if (j < 0 || j >= line.length) return { ok:false, placements:[] };
    const at = line[j];
    if (at.cell && at.cell.letter.toLowerCase() !== word[i]) return { ok:false, placements:[] };
    if (at.cell) fixedMap[i] = at.cell.letter.toUpperCase();
  }
  if (!canBuildWithRack(word.toUpperCase(), rackCounts)) return { ok:false, placements:[] };
  const blanks = chooseBlanksForWord(word.toUpperCase(), fixedMap, rackCounts);
  if (blanks === null) return { ok:false, placements:[] };
  for (let i = 0; i < word.length; i++) {
    const j = i + offset;
    const at = line[j];
    if (!at.cell) {
      const isWild = !!blanks[i];
      const letter = (blanks[i] || word[i]).toUpperCase();
      placements.push({ r: at.r, c: at.c, letter, isWild });
    }
  }
  return { ok:true, placements };
}
function findAIMove({ board, rack, dict }) {
  const anchors = computeAnchors(board);
  const rackCounts = rackMultiset(rack);
  const dirs = ["across", "down"];
  const words = dict.list;
  for (const dir of dirs) {
    for (const anchor of anchors) {
      const line = readLine(board, anchor, dir);
      for (const word of words) {
        for (let offset = -word.length + 1; offset <= line.length - 1; offset++) {
          const { placements, ok } = tryPlaceWordOnLine(board, rackCounts, word, line, offset, dir);
          if (!ok || placements.length === 0) continue;
          if (!isConnected(board, placements)) continue;
          if (isBoardEmpty(board) && !touchesCenter(board, placements)) continue;
          const pack = wordAndCrossesFromPlacement(board, placements, dir);
          if (!pack) continue;
          if (pack.main.word.length < MIN_LEN || !dict.set.has(pack.main.word)) continue;
          let crossOK = true;
          for (const cw of pack.crosses) {
            if (cw.word.length >= MIN_LEN && !dict.set.has(cw.word)) { crossOK = false; break; }
          }
          if (!crossOK) continue;
          const mainScore = computeWordScore(board, pack.main);
          const crossScore = pack.crosses.reduce((s,w)=>s+computeWordScore(board,w),0);
          const score = mainScore + crossScore;
          return { placements, dir, score };
        }
      }
    }
  }
  return null;
}

/* ──────────────────────────────────────────────────────────────
   COMPONENT
────────────────────────────────────────────────────────────── */
export default function ScrabbleGame() {
  const insets = useSafeAreaInsets();
  const { colors, getCategoryColors } = useTheme();
  const cat = getCategoryColors?.("word") || {};

  // sizes
  const SCREEN_W = Dimensions.get("window").width;
  const OUTER_PAD = 16;
  const CARD_PAD  = 10;
  const CELL_GAP  = 2;
  const usable = SCREEN_W - OUTER_PAD * 2 - CARD_PAD * 2;
  const cellSize = Math.floor((usable - (CELL_GAP * N)) / N);
  const boardPixel = cellSize * N + CELL_GAP * N;

  // dictionary
  const dict = useMemo(prepDictionary, []);

  /* ───────────── Tracking state (matches other games) ───────────── */
  const [playerId, setPlayerId] = useState(null);
  const gameIdRef = useRef(null);

  // one-shot gates
  const activeRef = useRef(false);            // run active
  const submittedRef = useRef(false);         // already ended

  // focus flag
  const focusedRef = useRef(false);

  // race guards
  const startInflightRef = useRef(null);
  const endInflightRef = useRef(null);

  // elapsed timer
  const startAtRef = useRef(0);
  const uiTimerRef = useRef(null);
  const [timer, setTimer] = useState(0);

  // 🏆 Achievements modal
  const [showAchievements, setShowAchievements] = useState(false);

  const stopUITimer = useCallback(() => {
    if (uiTimerRef.current) {
      clearInterval(uiTimerRef.current);
      uiTimerRef.current = null;
    }
  }, []);
  const startUITimer = useCallback(() => {
    stopUITimer();
    setTimer(0);
    uiTimerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
  }, [stopUITimer]);
  const resumeUITimer = useCallback(() => {
    if (uiTimerRef.current) return;
    uiTimerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
  }, []);

  // game state
  const [board, setBoard] = useState(() => Array.from({ length: N }, () => Array.from({ length: N }, () => null)));
  const [pending, setPending] = useState([]);
  const [bag, setBag] = useState([]);
  const [rackP, setRackP] = useState([]);
  const [rackA, setRackA] = useState([]);
  const [direction, setDirection] = useState("across");
  const [cursor, setCursor] = useState(CENTER);
  const [showRules, setShowRules] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
  const [swapSel, setSwapSel] = useState([]);
  const [wildModal, setWildModal] = useState({ visible: false, placeAt: null, rackIndex: null });

  const [scoreP, setScoreP] = useState(0);
  const [scoreA, setScoreA] = useState(0);
  const [turn, setTurn] = useState("player");
  const [passes, setPasses] = useState(0);

  /* ── Load Player & Game IDs (once) ── */
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("puzzle_hub_player_id");
        setPlayerId(saved ? parseInt(saved,10) : 1);
      } catch { setPlayerId(1); }
      try {
        const gid = await getGameId(GAME_TYPES.WORDTILES);
        gameIdRef.current = gid || null;
      } catch { gameIdRef.current = null; }
    })();
  }, []);

  /* ── Bootstrap a fresh game board ── */
  const bootstrapFreshGame = useCallback(() => {
    const b = freshBag();
    const { drawn: p7, bag: b2 } = drawTiles(b, 7);
    const { drawn: a7, bag: b3 } = drawTiles(b2, 7);
    setBag(b3);
    setRackP(p7);
    setRackA(a7);
    setBoard(Array.from({ length: N }, () => Array.from({ length: N }, () => null)));
    setPending([]);
    setScoreP(0);
    setScoreA(0);
    setTurn("player");
    setPasses(0);
    setCursor(CENTER);
  }, []);

  /* ───────────── Tracking helpers (start/end) ───────────── */
  const startRunOnce = useCallback(async () => {
    if (!focusedRef.current) return;
    if (!playerId || !gameIdRef.current) return;
    if (activeRef.current) return;                // already active
    if (startInflightRef.current) { try { await startInflightRef.current; } catch {} return; }

    startInflightRef.current = (async () => {
      try {
        await gameTracker.startGame(gameIdRef.current, playerId);
        activeRef.current = true;
        submittedRef.current = false;
        startAtRef.current = Date.now();
        startUITimer();

        if (bag.length === 0 && rackP.length === 0 && rackA.length === 0) {
          bootstrapFreshGame();
        }
      } catch (e) {
        console.warn("WordTiles startGame failed:", e?.message || String(e));
      } finally {
        startInflightRef.current = null;
      }
    })();

    try { await startInflightRef.current; } catch {}
  }, [playerId, bag.length, rackP.length, rackA.length, bootstrapFreshGame, startUITimer]);

  const endRunOnce = useCallback(async (reason) => {
    // 🔒 Make this function truly idempotent
    if (!activeRef.current || submittedRef.current) return;
    submittedRef.current = true;      // flip immediately to block any re-entrants
    const thisEnd = (async () => {
      try {
        if (startInflightRef.current) { try { await startInflightRef.current; } catch {} }
        const elapsed = Math.max(0, Math.floor((Date.now() - startAtRef.current) / 1000));
        const finalP = scoreP;
        const finalA = scoreA;

        stopUITimer();

        if (gameIdRef.current) {
          await gameTracker.endGame(
            gameIdRef.current,
            Math.max(finalP, finalA),
            {
              result: finalP > finalA ? "win" : finalA > finalP ? "lose" : "tie",
              reason,
              time_s: elapsed,
              player_score: finalP,
              ai_score: finalA,
            }
          );
        }
      } catch (e) {
        console.warn("WordTiles endGame failed:", e?.message || String(e));
      } finally {
        activeRef.current = false;
      }
    })();

    endInflightRef.current = thisEnd;
    try { await thisEnd; } catch {} finally { endInflightRef.current = null; }
  }, [scoreP, scoreA, stopUITimer]);

  /* ── Focus lifecycle: start once on focus; DO **NOT** end on blur ── */
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      startRunOnce();

      return () => {
        focusedRef.current = false;
        // ⛔️ Do NOT call endRunOnce here – it races with back/restart flows
        stopUITimer(); // just pause UI timer; end happens on explicit paths
      };
    }, [startRunOnce, stopUITimer])
  );

  // If IDs arrive after focus, attempt starting then
  useEffect(() => {
    if (focusedRef.current) startRunOnce();
  }, [playerId, startRunOnce]);

  // Unmount safety (explicit end)
  useEffect(() => {
    return () => { endRunOnce("unmount"); };
  }, [endRunOnce]);

  // Android HW back: end then leave (single path)
  const handleBack = useCallback(async () => {
    await endRunOnce("back");
    router.back();
  }, [endRunOnce]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack]);

  /* Pause timer while Achievements is open; resume on close */
  useEffect(() => {
    if (showAchievements) {
      stopUITimer();
    } else if (focusedRef.current && activeRef.current && !submittedRef.current) {
      resumeUITimer();
    }
  }, [showAchievements, resumeUITimer, stopUITimer]);

  /* ── Helpers/UI bits ── */
  const card = { ...createGlassStyle(colors, "word"), borderRadius: 16, borderWidth: 1, borderColor: colors.border };
  const Tile = ({ text, tone="default"}) => {
    let bg = "rgba(255,255,255,0.10)";
    let border = "rgba(255,255,255,0.22)";
    let txt = colors.text;
    if (tone === "solid") { bg = colors.surface || "rgba(255,255,255,0.12)"; border = colors.border; }
    return (
      <View style={{
        width: cellSize * 0.95, height: cellSize * 0.95,
        borderRadius: 10, borderWidth: 1.5, borderColor: border,
        alignItems:"center", justifyContent:"center", backgroundColor: bg,
      }}>
        <Text style={{ color: txt, fontSize: 18, fontFamily:"Nunito-Bold" }}>{text}</Text>
      </View>
    );
  };

  /* ── Placement (player) ── */
  const stepVec = direction === "across" ? [0,1] : [1,0];
  const isOccupied = useCallback((r,c) => !!board[r][c] || pending.some(p => p.r===r && p.c===c), [board, pending]);

  const advanceFrom = useCallback((r,c) => {
    let rr=r, cc=c;
    while (inBounds(rr,cc) && isOccupied(rr,cc)) { rr+=stepVec[0]; cc+=stepVec[1]; }
    return inBounds(rr,cc) ? { r: rr, c: cc } : null;
  }, [isOccupied, stepVec]);

  const nextAutoSlot = useCallback(() => {
    const start = isOccupied(cursor.r, cursor.c) ? advanceFrom(cursor.r, cursor.c) : cursor;
    if (!start || isOccupied(start.r, start.c)) return null;
    return start;
  }, [cursor, isOccupied, advanceFrom]);

  const removeFromRackIndex = useCallback((idx) => {
    setRackP(prev => {
      if (idx == null || idx < 0 || idx >= prev.length) return prev;
      const n = prev.slice(); n.splice(idx,1); return n;
    });
  }, []);

  const addBackToRack = useCallback((letters) => { setRackP(prev => prev.concat(letters)); }, []);

  const placeAt = useCallback((letter, r, c, isWild=false) => {
    setPending(prev => prev.concat({ r, c, letter: letter.toUpperCase(), isWild }));
    const after = direction === "across" ? { r, c: c+1 } : { r: r+1, c };
    const next = advanceFrom(after.r, after.c);
    if (next) setCursor(next);
  }, [direction, advanceFrom]);

  const handleRackTap = useCallback((tile, idx) => {
    if (turn !== "player") return;
    const slot = nextAutoSlot();
    if (!slot) { Alert.alert("No space", "No free slot in that direction."); return; }
    if (tile === "?") {
      setWildModal({ visible: true, placeAt: slot, rackIndex: idx });
    } else {
      placeAt(tile, slot.r, slot.c, false);
      removeFromRackIndex(idx);
      Haptics.selectionAsync().catch(()=>{});
    }
  }, [turn, nextAutoSlot, placeAt, removeFromRackIndex]);

  const confirmWildChoice = useCallback((ch) => {
    const { placeAt: at, rackIndex } = wildModal;
    if (!at) { setWildModal({ visible:false, placeAt:null, rackIndex:null }); return; }
    placeAt(ch, at.r, at.c, true);
    removeFromRackIndex(rackIndex);
    setWildModal({ visible:false, placeAt:null, rackIndex:null });
    Haptics.selectionAsync().catch(()=>{});
  }, [wildModal, placeAt, removeFromRackIndex]);

  const handleRecall = useCallback(() => {
    if (!pending.length) return;
    const letters = pending.map(p => (p.isWild ? "?" : p.letter));
    addBackToRack(letters);
    setPending([]);
    setCursor(CENTER);
    Haptics.selectionAsync().catch(()=>{});
  }, [pending, addBackToRack]);

  /* ── Validate + commit ── */
  const validateAndCommit = useCallback(() => {
    if (turn !== "player") return;
    if (pending.length === 0) { Alert.alert("Nothing to submit", "Place tiles first."); return; }
    const sameRow = pending.every(p => p.r === pending[0].r);
    const sameCol = pending.every(p => p.c === pending[0].c);
    if (!(sameRow || sameCol)) { Alert.alert("Invalid move", "Tiles must be in one line."); return; }

    const dir = sameRow ? "across" : "down";
    if (!isConnected(board, pending)) { Alert.alert("Invalid move", "Move must connect to the board (first move must cover center)."); return; }
    if (isBoardEmpty(board) && !touchesCenter(board, pending)) { Alert.alert("Invalid first move", "Must cover center (★)."); return; }

    const pack = wordAndCrossesFromPlacement(board, pending, dir);
    if (!pack) { Alert.alert("Invalid", "No word formed."); return; }

    if (pack.main.word.length < MIN_LEN || !dict.set.has(pack.main.word)) {
      Alert.alert("Invalid word", `Main word must be valid and at least ${MIN_LEN} letters.`);
      return;
    }
    for (const cw of pack.crosses) {
      if (cw.word.length >= MIN_LEN && !dict.set.has(cw.word)) {
        Alert.alert("Invalid cross", `Cross word ${cw.word.toUpperCase()} is not allowed.`);
        return;
      }
    }

    const mainScore = computeWordScore(board, pack.main);
    const crossScore = pack.crosses.reduce((s,w)=>s+computeWordScore(board,w),0);
    const gained = mainScore + crossScore;

    setBoard(prev => {
      const next = prev.map(row => row.slice());
      for (const p of pending) next[p.r][p.c] = { letter: p.letter, isWild: !!p.isWild };
      return next;
    });
    setPending([]);
    setCursor(CENTER);
    setScoreP(s => s + gained);

    setBag(prevBag => {
      const need = 7 - rackP.length;
      const { drawn, bag: b2 } = drawTiles(prevBag, need);
      setRackP(prevRack => prevRack.concat(drawn));
      return b2;
    });

    setPasses(0);
    setTurn("ai");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(()=>{});
  }, [turn, pending, board, dict, rackP.length]);

  /* ── Swap ── */
  const openSwap = useCallback(() => {
    if (turn !== "player") return;
    if (!bag.length) { Alert.alert("Bag empty", "No tiles left to swap."); return; }
    if (!rackP.length) { Alert.alert("Nothing to swap", "Your rack is empty."); return; }
    setSwapSel([]);
    setShowSwap(true);
  }, [turn, bag.length, rackP.length]);

  const toggleSwapIndex = useCallback((i) => {
    setSwapSel(prev => prev.includes(i) ? prev.filter(x=>x!==i) : prev.concat(i));
  }, []);

  const confirmSwap = useCallback(() => {
    if (!swapSel.length) { setShowSwap(false); return; }
    const selectedTiles = swapSel.map(i => rackP[i]);
    const b2 = putBackAndShuffle(bag, selectedTiles);
    const rackNew = rackP.filter((_,i)=>!swapSel.includes(i));
    const { drawn, bag: b3 } = drawTiles(b2, selectedTiles.length);
    setBag(b3);
    setRackP(rackNew.concat(drawn));
    setShowSwap(false);
    setPasses(p => p+1);
    setTurn("ai");
    Haptics.selectionAsync().catch(()=>{});
  }, [swapSel, bag, rackP]);

  /* ── Restart (ends current, starts fresh) ── */
  const restartSession = useCallback(async () => {
    await endRunOnce("restart");
    bootstrapFreshGame();
    await startRunOnce();
  }, [endRunOnce, startRunOnce, bootstrapFreshGame]);

  /* ── End-of-Game detection (exhausted) ── */
  const maybeEndByExhaustion = useCallback(async () => {
    if (submittedRef.current) return; // already ended
    const noBag = bag.length === 0;
    const noPlayerTiles = rackP.length === 0 && pending.length === 0;
    const noAiTiles = rackA.length === 0;
    if (noBag && noPlayerTiles && noAiTiles) {
      await endRunOnce("exhausted");
      const p = scoreP, a = scoreA;
      Alert.alert(
        p > a ? "You win! 🎉" : a > p ? "AI wins 🤖" : "Tie 🤝",
        `You ${p} — ${a} AI`
      );
    }
  }, [bag.length, rackP.length, rackA.length, pending.length, scoreP, scoreA, endRunOnce]);

  /* ── AI turn ── */
  useEffect(() => {
    if (turn !== "ai") return;
    const t = setTimeout(async () => {
      const move = findAIMove({ board, rack: rackA, dict });
      if (!move) {
        if (bag.length && rackA.length) {
          const idx = Math.floor(Math.random()*rackA.length);
          const b2 = putBackAndShuffle(bag, [rackA[idx]]);
          const rackRemain = rackA.slice(0,idx).concat(rackA.slice(idx+1));
          const { drawn, bag: b3 } = drawTiles(b2, 1);
          setBag(b3);
          setRackA(rackRemain.concat(drawn));
        }
        setPasses(p => {
          const np = p+1;
          if (np >= 2) {
            // Only end once
            if (!submittedRef.current) {
              endRunOnce("pass").then(() => {
                const pScore = scoreP, aScore = scoreA;
                Alert.alert(
                  pScore > aScore ? "You win! 🎉" : aScore > pScore ? "AI wins 🤖" : "Tie 🤝",
                  `You ${pScore} — ${aScore} AI`
                );
              });
            }
          } else {
            setTurn("player");
          }
          return np;
        });
        return;
      }

      // commit AI placements
      setBoard(prev => {
        const next = prev.map(row => row.slice());
        for (const p of move.placements) next[p.r][p.c] = { letter: p.letter, isWild: !!p.isWild };
        return next;
      });

      // remove used letters from AI rack
      const used = move.placements.map(p => (p.isWild ? "?" : p.letter));
      setRackA(prev => {
        const copy = prev.slice();
        for (const u of used) {
          const i = copy.indexOf(u);
          if (i >= 0) copy.splice(i,1);
          else {
            const j = copy.findIndex(x => x === "?" || x === u);
            if (j >= 0) copy.splice(j,1);
          }
        }
        return copy;
      });

      // score + refill
      setScoreA(s => s + move.score);
      setBag(prevBag => {
        const need = 7 - (rackA.length - used.length);
        const { drawn, bag: b2 } = drawTiles(prevBag, need);
        setRackA(prevRack => prevRack.concat(drawn));
        return b2;
      });

      setPasses(0);
      setTurn("player");
      maybeEndByExhaustion();
    }, 650);
    return () => clearTimeout(t);
  }, [turn, board, rackA, dict, bag.length, scoreP, scoreA, endRunOnce, maybeEndByExhaustion]);

  /* ── RENDER (unchanged) ── */
  // ... UI code identical to your version ...
  // (Keep the rest of your render markup exactly as before)
}
