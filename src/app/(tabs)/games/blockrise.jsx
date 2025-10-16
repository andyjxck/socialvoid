// screens/games/block_rise.jsx  (REPLACE ENTIRE FILE)
import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, useWindowDimensions, Platform, ScrollView } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react-native";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useIsFocused } from "@react-navigation/native";

import { useTheme } from "../../../utils/theme";
import gameTracker from "../../../utils/gameTracking";
import { getGameId, GAME_TYPES } from "../../../utils/gameUtils";
import NightSkyBackground from "../../../components/NightSkyBackground";
import TetrisBoard from "../../../components/tetris/TetrisBoard";
import ControlInstructions from "../../../components/tetris/ControlInstructions";
import GameControls from "../../../components/tetris/GameControls";
import PauseModal from "../../../components/tetris/PauseModal";
import GameOverModal from "../../../components/tetris/GameOverModal";
import AchievementsSection from "../../../components/AchievementsSection";

/* ───────── Gameplay constants ───────── */
const COLS = 12;
const ROWS = 24;
const SKIP_TOP_ROWS = 2;
const VISIBLE_ROWS = ROWS - SKIP_TOP_ROWS;

const TICK_MS_START = 350, TICK_MS_MIN = 80;
const COLORS = ["#9b5de5","#f15bb5","#fee440","#00bbf9","#00f5d4","#ff6b6b","#4ecdc4","#96ceb4","#ffd166","#a8dadc"];
const RAW_SHAPES = [
  { name: "TriLine", g: [[1,1,1]] },
  { name: "TriL", g: [[1,0],[1,1]] },
  { name: "TriV", g: [[1,1],[1,0]] },
  { name: "Plus", g: [[0,1,0],[1,1,1],[0,1,0]] },
  { name: "PentoL", g: [[1,0],[1,0],[1,1]] },
  { name: "PentoS", g: [[0,1,1],[1,1,0],[1,0,0]] },
  { name: "PentoW", g: [[1,0,0],[1,1,0],[0,1,1]] },
  { name: "PentoU", g: [[1,0,1],[1,1,1]] },
];
const clone = g => g.map(r => r.slice());
const rot = g => { const R=g.length, C=g[0].length; const o=Array.from({length:C},()=>Array(R).fill(0)); for(let r=0;r<R;r++) for(let c=0;c<C;c++) o[c][R-1-r]=g[r][c]; return o; };
const eq = (a,b) => a.length===b.length && a[0].length===b[0].length && a.every((r,i)=>r.every((v,j)=>v===b[i][j]));
const uniqR = g => { const out=[]; let cur=clone(g); for(let i=0;i<4;i++){ if(!out.some(x=>eq(x,cur))) out.push(cur); cur=rot(cur);} return out; };
const SHAPES = RAW_SHAPES.map(s => ({ name:s.name, rotations:uniqR(s.g) }));
const empty = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));

function randomPiece(){
  const def=SHAPES[Math.floor(Math.random()*SHAPES.length)];
  const grid=def.rotations[Math.floor(Math.random()*def.rotations.length)];
  const color=COLORS[Math.floor(Math.random()*COLORS.length)];
  const x=Math.floor((COLS-grid[0].length)/2), y=-2;
  return { name:def.name, grid, x, y, color, rotIndex:def.rotations.findIndex(r=>eq(r,grid)) };
}
function canPlace(board,p,nx,ny,g=p.grid){
  for(let r=0;r<g.length;r++) for(let c=0;c<g[0].length;c++){
    if(!g[r][c]) continue;
    const br=ny+r, bc=nx+c;
    if(bc<0||bc>=COLS||br>=ROWS) return false;
    if(br>=0 && board[br][bc]) return false;
  }
  return true;
}
function merge(board,p){
  const out=board.map(r=>r.slice());
  for(let r=0;r<p.grid.length;r++) for(let c=0;c<p.grid[0].length;c++){
    if(!p.grid[r][c]) continue;
    const br=p.y+r, bc=p.x+c;
    if(br>=0&&br<ROWS&&bc>=0&&bc<COLS) out[br][bc]=p.color;
  }
  return out;
}
function clearRows(board){
  let cleared=0; const out=[];
  for(let r=0;r<ROWS;r++){ if(board[r].every(v=>v)) cleared++; else out.push(board[r]); }
  while(out.length<ROWS) out.unshift(Array(COLS).fill(0));
  return { board: out, cleared };
}
const speed = lines => Math.max(TICK_MS_START - lines*35, TICK_MS_MIN);

/* ───────── Game hook ───────── */
function useBlockRiseGame(){
  const [board,setBoard]=useState(empty());
  const [active,setActive]=useState(randomPiece());
  const [score,setScore]=useState(0);
  const [lines,setLines]=useState(0);
  const [paused,setPaused]=useState(false);
  const [gameOver,setGameOver]=useState(false);
  const loop=useRef(null);

  const initializeGame=useCallback(()=>{
    setBoard(empty()); setActive(randomPiece()); setScore(0); setLines(0);
    setPaused(false); setGameOver(false);
  },[]);

  const schedule=useCallback((delay)=>{
    if(loop.current) clearInterval(loop.current);
    loop.current=setInterval(()=>{
      setActive(prev=>{
        if(!prev) return prev;
        const ny=prev.y+1;
        if(canPlace(board,prev,prev.x,ny)) return {...prev,y:ny};
        const merged=merge(board,prev);
        const { board:nb, cleared }=clearRows(merged);
        setBoard(nb);
        if(cleared>0){ setLines(l=>l+cleared); setScore(s=>s+cleared*150+10); }
        else setScore(s=>s+10);
        const next=randomPiece();
        if(!canPlace(nb,next,next.x,next.y)){ setGameOver(true); return null; }
        return next;
      });
    },delay);
  },[board]);

  useEffect(()=>{
    if(paused || gameOver){ if(loop.current) clearInterval(loop.current); return; }
    schedule(speed(lines));
    return ()=>{ if(loop.current) clearInterval(loop.current); };
  },[lines,paused,gameOver,schedule]);

  const movePiece=useCallback((dir)=>{
    if(paused||gameOver||!active) return;
    if(dir==="left"||dir==="right"){
      const nx=active.x+(dir==="left"?-1:1);
      if(canPlace(board,active,nx,active.y)) setActive({...active,x:nx});
    } else if(dir==="down"){
      const ny=active.y+1;
      if(canPlace(board,active,active.x,ny)) setActive({...active,y:ny});
      else{
        const merged=merge(board,active);
        const { board:nb, cleared }=clearRows(merged);
        setBoard(nb);
        if(cleared>0){ setLines(l=>l+cleared); setScore(s=>s+cleared*150+10); }
        else setScore(s=>s+10);
        const next=randomPiece();
        if(!canPlace(nb,next,next.x,next.y)){ setGameOver(true); setActive(null); return; }
        setActive(next);
      }
    }
  },[active,board,paused,gameOver]);

  const rotatePiece=useCallback(()=>{
    if(paused||gameOver||!active) return;
    const def=SHAPES.find(s=>s.name===active.name); if(!def) return;
    const nextIndex=(active.rotIndex+1)%def.rotations.length;
    const nextGrid=def.rotations[nextIndex];
    const cand=[
      {x:active.x,y:active.y,g:nextGrid},
      {x:active.x-1,y:active.y,g:nextGrid},
      {x:active.x+1,y:active.y,g:nextGrid},
    ];
    for(const c of cand){
      if(canPlace(board,active,c.x,c.y,c.g)){
        setActive({...active,grid:c.g,rotIndex:nextIndex,x:c.x,y:c.y});
        break;
      }
    }
  },[active,board,paused,gameOver]);

  const togglePause=useCallback(()=>setPaused(p=>!p),[]);
  const forcePause  = useCallback(()=>setPaused(true),[]);
  const forceResume = useCallback(()=>setPaused(false),[]);

  // compose active piece
  const composed=React.useMemo(()=>{
    if(!active) return board;
    const t=board.map(r=>r.slice());
    for(let r=0;r<active.grid.length;r++){
      for(let c=0;c<active.grid[0].length;c++){
        if(active.grid[r][c]){
          const br=active.y+r, bc=active.x+c;
          if(br>=0&&br<ROWS&&bc>=0&&bc<COLS) t[br][bc]=active.color;
        }
      }
    }
    return t;
  },[board,active]);

  return { board: composed, score, lines, gameOver, paused, initializeGame, movePiece, rotatePiece, togglePause, forcePause, forceResume };
}

/* ───────── UI + robust session tracking ───────── */
export default function BlockRiseGame(){
  const insets=useSafeAreaInsets();
  const { colors, isDark }=useTheme();
  const { width:winW, height:winH }=useWindowDimensions();
  const isPad=Platform.OS==="ios" && Platform.isPad;
  const isFocused=useIsFocused();

  // ids
  const [playerId,setPlayerId]=useState(null);
  const [gameTypeId,setGameTypeId]=useState(null);

  // achievements modal
  const [showAchievements,setShowAchievements]=useState(false);
  const wePausedRef=useRef(false); // track if WE paused due to modal

  // run/session refs
  const runIdRef=useRef(null);
  const startTimeRef=useRef(0);
  const startedRef=useRef(false);
  const submittedRef=useRef(false);
  const scoreRef=useRef(0);

  const { board, score, lines, gameOver, paused, initializeGame, movePiece, rotatePiece, togglePause, forcePause, forceResume } = useBlockRiseGame();
  useEffect(()=>{ scoreRef.current=score; },[score]);

  // Pause/resume when achievements modal opens/closes
  useEffect(()=>{
    if(showAchievements){
      if(!paused){ forcePause(); wePausedRef.current=true; }
    }else{
      if(wePausedRef.current){ forceResume(); wePausedRef.current=false; }
    }
  },[showAchievements, paused, forcePause, forceResume]);

  // Load player id
  useEffect(()=>{ (async()=>{
    try{
      const saved=await AsyncStorage.getItem("puzzle_hub_player_id");
      setPlayerId(saved ? parseInt(saved,10) : 1);
    }catch{ setPlayerId(1); }
  })(); },[]);

  // Load game type id
  useEffect(()=>{ (async()=>{
    if(!playerId) return;
    try{
      const id=await getGameId(GAME_TYPES?.BLOCK_RISE ?? GAME_TYPES?.BLOCKRISE);
      setGameTypeId(id || null);
    }catch{ setGameTypeId(null); }
  })(); },[playerId]);

  // Focus lifecycle
  useEffect(()=>{
    const canStart=isFocused && !!playerId && !!gameTypeId;
    if(canStart && !startedRef.current){
      (async()=>{
        try{
          initializeGame();
          const rid=await gameTracker.startGame(gameTypeId, playerId);
          runIdRef.current=Number.isFinite(Number(rid)) ? Number(rid) : gameTypeId;
          startTimeRef.current=Date.now();
          submittedRef.current=false;
          startedRef.current=true;
        }catch{}
      })();
    }
    if(!isFocused && startedRef.current){
      const rid=runIdRef.current;
      if(rid && !submittedRef.current){
        submittedRef.current=true;
        const durationMs=Math.max(0, Date.now()-startTimeRef.current);
        const finalScore=scoreRef.current || 0;
        gameTracker.endGame(rid, finalScore, { durationMs, reason:"blur", lines }).catch(()=>{});
      }
      startedRef.current=false;
      runIdRef.current=null;
    }
  },[isFocused, playerId, gameTypeId, initializeGame, lines]);

  // End on game over
  useEffect(()=>{
    if(!gameOver || !startedRef.current) return;
    const rid=runIdRef.current;
    if(!rid || submittedRef.current) return;
    submittedRef.current=true;
    const durationMs=Math.max(0, Date.now()-startTimeRef.current);
    gameTracker.endGame(rid, scoreRef.current || 0, { durationMs, reason:"game_over", lines }).catch(()=>{});
    startedRef.current=false;
    runIdRef.current=null;
  },[gameOver, lines]);

  const handleReset=useCallback(async()=>{
    try{ await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); }catch{}
    if(startedRef.current && runIdRef.current && !submittedRef.current){
      submittedRef.current=true;
      const durationMs=Math.max(0, Date.now()-startTimeRef.current);
      await gameTracker.endGame(runIdRef.current, scoreRef.current || 0, { durationMs, reason:"reset", lines }).catch(()=>{});
      startedRef.current=false;
      runIdRef.current=null;
    }
    if(playerId && gameTypeId){
      initializeGame();
      try{
        const rid=await gameTracker.startGame(gameTypeId, playerId);
        runIdRef.current=Number.isFinite(Number(rid)) ? Number(rid) : gameTypeId;
        startTimeRef.current=Date.now();
        submittedRef.current=false;
        startedRef.current=true;
      }catch{}
    }
  },[playerId, gameTypeId, initializeGame, lines]);

  const handleBack=useCallback(async()=>{
    if(startedRef.current && runIdRef.current && !submittedRef.current){
      submittedRef.current=true;
      const durationMs=Math.max(0, Date.now()-startTimeRef.current);
      try{ await gameTracker.endGame(runIdRef.current, scoreRef.current || 0, { durationMs, reason:"back", lines }); }catch{}
      startedRef.current=false;
      runIdRef.current=null;
    }
    router.back();
  },[lines]);

  // Gestures
  const pan=Gesture.Pan().onEnd(e=>{
    if(gameOver || paused) return;
    const { velocityX, velocityY, translationX, translationY }=e;
    const minV=300, minD=30;
    if(Math.abs(velocityX)>Math.abs(velocityY) && Math.abs(velocityX)>minV && Math.abs(translationX)>minD)
      movePiece(velocityX>0?"right":"left");
    else if(Math.abs(velocityY)>Math.abs(velocityX) && velocityY>minV && Math.abs(translationY)>minD)
      movePiece("down");
  });
  const tap=Gesture.Tap().onStart(()=>{ if(!gameOver && !paused) rotatePiece(); });
  const gestures=Gesture.Exclusive(pan, tap);

  /* ---------- Layout ---------- */
  const headerH=16+insets.top+16+56;
  const controlsH=100+insets.bottom;
  const verticalBudget=Math.max(320, winH - headerH - controlsH - 12);

  const maxCardW=Math.min(winW*0.96, isPad ? winW*0.9 : winW*0.92);
  const maxCardH=verticalBudget;

  const innerW=Math.max(0, maxCardW-24);
  const innerH=Math.max(0, maxCardH-24);

  const cellSize=Math.floor(Math.min(innerW/COLS, innerH/VISIBLE_ROWS));
  const boardW=cellSize*COLS;
  const boardH=cellSize*VISIBLE_ROWS;

  return (
    <View style={{ flex:1 }}>
      <StatusBar style={isDark?"light":"dark"} />
      <NightSkyBackground />

      {/* Header */}
      <View style={{
        flexDirection:"row", alignItems:"center", justifyContent:"space-between",
        backgroundColor:"rgba(31,41,55,0.6)", borderWidth:1, borderColor:colors.border,
        borderRadius:16, marginTop:insets.top+16, marginHorizontal:20,
        paddingVertical:10, paddingHorizontal:14, marginBottom:12
      }}>
        {/* Back */}
        <TouchableOpacity onPress={handleBack} style={{ padding:8, borderRadius:10, backgroundColor:colors.glassSecondary }}>
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>

        {/* Center */}
        <View style={{ flexDirection:"row", alignItems:"center", columnGap:16 }}>
          <View style={{ alignItems:"center" }}>
            <Text style={{ fontSize:11, color:colors.textSecondary, textTransform:"uppercase", marginBottom:2, fontFamily:"Inter_500Medium" }}>Score</Text>
            <Text style={{ fontSize:16, color:colors.text, fontFamily:"Inter_700Bold" }}>{score.toLocaleString()}</Text>
          </View>

          <Text style={{ fontSize:18, fontFamily:"Inter_700Bold", color:colors.text, textAlign:"center", minWidth:90 }}>Block Rise</Text>

          <View style={{ alignItems:"center" }}>
            <Text style={{ fontSize:11, color:colors.textSecondary, textTransform:"uppercase", marginBottom:2, fontFamily:"Inter_500Medium" }}>Lines</Text>
            <Text style={{ fontSize:16, color:colors.text, fontFamily:"Inter_700Bold" }}>{lines}</Text>
          </View>
        </View>

        {/* Right actions: Achievements + Reset */}
        <View style={{ flexDirection:"row", columnGap:8 }}>
          <TouchableOpacity
            onPress={async ()=>{
              try{ await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }catch{}
              setShowAchievements(true);
            }}
            style={{ padding:8, borderRadius:10, backgroundColor:colors.glassSecondary }}
          >
            <Trophy size={20} color={colors.text} />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleReset} style={{ padding:8, borderRadius:10, backgroundColor:colors.glassSecondary }}>
            <RotateCcw size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Game Area */}
      <View style={{ flex:1, paddingHorizontal:20, justifyContent:"space-between" }}>
        <View style={{ alignSelf:"center", width:maxCardW, height:maxCardH }}>
          <BlurView intensity={isDark?60:80} tint={isDark?"dark":"light"} style={{
            backgroundColor:colors.glassSecondary, borderWidth:1, borderColor:colors.border,
            borderRadius:12, padding:12, width:"100%", height:"100%"
          }}>
            <View style={{ flex:1, alignItems:"center", justifyContent:"center" }}>
              <GestureDetector gesture={gestures}>
                <View collapsable={false} style={{ width:boardW, height:boardH }}>
                  <TetrisBoard boardData={board} cellSize={cellSize} skipTopRows={SKIP_TOP_ROWS} />
                </View>
              </GestureDetector>
            </View>
          </BlurView>
        </View>

        <View style={{ alignItems:"center", paddingBottom:insets.bottom+8 }}>
          <Text style={{ fontSize:14, color:colors.textSecondary, textAlign:"center", marginTop:6, marginBottom:6, fontFamily:"Inter_500Medium" }}>
            Tap to rotate • Swipe left/right to move • Swipe down to drop
          </Text>
          <ControlInstructions />
          <GameControls onMove={movePiece} onRotate={rotatePiece} />
        </View>
      </View>

      {/* Achievements Modal */}
      {showAchievements && (
        <View style={{
          position:"absolute", top:0, left:0, right:0, bottom:0,
          backgroundColor:"rgba(0,0,0,0.6)", justifyContent:"center", alignItems:"center"
        }}>
          <View style={{
            width:"92%", maxHeight:"80%", borderRadius:16, overflow:"hidden",
            borderWidth:1, borderColor:colors.border, backgroundColor:"rgba(0,0,0,0.35)"
          }}>
            <View style={{
              paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1, borderBottomColor:colors.border,
              flexDirection:"row", alignItems:"center", justifyContent:"space-between"
            }}>
              <Text style={{ fontFamily:"Inter_700Bold", fontSize:16, color:colors.text }}>Block Rise Achievements</Text>
              <TouchableOpacity onPress={()=>setShowAchievements(false)}>
                <Text style={{ fontFamily:"Inter_600SemiBold", fontSize:14, color:colors.textSecondary }}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom:12 }}>
              <AchievementsSection
                playerId={playerId}
                gameId={gameTypeId}
                autoRefreshMs={15000}
                showSearchBar={true}
                showFilters={true}
              />
            </ScrollView>
          </View>
        </View>
      )}

     {paused && !gameOver && !showAchievements && <PauseModal onResume={togglePause} />}
      {gameOver && <GameOverModal score={score} lines={lines} onPlayAgain={handleReset} />}
    </View>
  );
}
