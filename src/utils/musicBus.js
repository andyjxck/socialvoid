// utils/musicBus.js
// Small, reliable event bus for background music.
// Provides: mute, volume, shuffle, loop, skip, play-by-index, seek, nowPlaying, and a real queue.

export const TRACK_TITLES = [
  "Blooming Nexus",
  "Spring Night 1987",
  "Warm Spiral",
  "Drifting Cascade",
  "Ember Mirage Zero",
  "Hazy Forest",
  "Vault MKII",
  "The Pond",
  "Drifting Stare",
  "Hope 2000",
  "Bounce Up",
  "Hidden One",
  "Samba Feel",
  "The Game Void",
  "Unnamed",
  "Run, Run",
  "Pixel Glitch",
  "Fairy Forest",
];

// ========== STATE ==========
let muted = false;
let volume = 0.18;
let shuffle = true;
let loopOne = false;
let nowPlaying = {
  index: null,
  title: null,
  positionMs: 0,
  durationMs: 0,
  isPlaying: false,
};
let queue = []; // array of track indices

// ========== SUBSCRIBERS ==========
const subs = {
  muted: new Set(),
  volume: new Set(),
  shuffle: new Set(),
  loop: new Set(),
  skip: new Set(),
  playIndex: new Set(),
  seekMs: new Set(),
  nowPlaying: new Set(),
  queueState: new Set(),
};

const safeCallAll = (set, data) => {
  for (const fn of set) {
    try { fn(data); } catch {}
  }
};

const isValidIndex = (i) =>
  Number.isInteger(i) && i >= 0 && i < TRACK_TITLES.length;

const publishQueueState = () => {
  // Always send a shallow copy so listeners don't mutate internal state.
  safeCallAll(subs.queueState, queue.slice());
};

// ========== MUTE ==========
export function publishMuted(isMuted) {
  muted = !!isMuted;
  safeCallAll(subs.muted, muted);
}
export function subscribeMuted(fn) {
  if (typeof fn === "function") {
    subs.muted.add(fn);
    try { fn(muted); } catch {}
    return () => subs.muted.delete(fn);
  }
  return () => {};
}

// ========== VOLUME ==========
export function publishVolume(v) {
  const newVol = Math.max(0, Math.min(1, Number(v) || 0));
  volume = newVol;
  safeCallAll(subs.volume, newVol);
}
export function subscribeVolume(fn) {
  if (typeof fn === "function") {
    subs.volume.add(fn);
    try { fn(volume); } catch {}
    return () => subs.volume.delete(fn);
  }
  return () => {};
}

// ========== SHUFFLE ==========
export function publishShuffleSet(enabled) {
  shuffle = !!enabled;
  safeCallAll(subs.shuffle, shuffle);
}
export function subscribeShuffleSet(fn) {
  if (typeof fn === "function") {
    subs.shuffle.add(fn);
    try { fn(shuffle); } catch {}
    return () => subs.shuffle.delete(fn);
  }
  return () => {};
}

// ========== LOOP ==========
export function publishLoopSet(enabled) {
  loopOne = !!enabled;
  safeCallAll(subs.loop, loopOne);
}
export function subscribeLoopSet(fn) {
  if (typeof fn === "function") {
    subs.loop.add(fn);
    try { fn(loopOne); } catch {}
    return () => subs.loop.delete(fn);
  }
  return () => {};
}

// ========== SKIP / PLAY INDEX ==========
export function publishSkipNext() { safeCallAll(subs.skip); }
export function subscribeSkipNext(fn) {
  if (typeof fn === "function") {
    subs.skip.add(fn);
    return () => subs.skip.delete(fn);
  }
  return () => {};
}

export function publishPlayByIndex(i) {
  const idx = Number(i);
  if (!isValidIndex(idx)) return;
  safeCallAll(subs.playIndex, idx);
}
export function subscribePlayByIndex(fn) {
  if (typeof fn === "function") {
    subs.playIndex.add(fn);
    return () => subs.playIndex.delete(fn);
  }
  return () => {};
}

// ========== SEEK (ms) ==========
export function publishSeekMs(ms) {
  const value = Math.max(0, Number(ms) || 0);
  safeCallAll(subs.seekMs, value);
}
export function subscribeSeekMs(fn) {
  if (typeof fn === "function") {
    subs.seekMs.add(fn);
    return () => subs.seekMs.delete(fn);
  }
  return () => {};
}

// ========== NOW PLAYING ==========
export function publishNowPlaying(state) {
  nowPlaying = {
    index: Number.isFinite(state?.index) ? state.index : null,
    title: state?.title ?? null,
    positionMs: Math.max(0, Number(state?.positionMs) || 0),
    durationMs: Math.max(0, Number(state?.durationMs) || 0),
    isPlaying: !!state?.isPlaying,
  };
  safeCallAll(subs.nowPlaying, nowPlaying);
}
export function subscribeNowPlaying(fn) {
  if (typeof fn === "function") {
    subs.nowPlaying.add(fn);
    try { fn(nowPlaying); } catch {}
    return () => subs.nowPlaying.delete(fn);
  }
  return () => {};
}

// ========== QUEUE ==========
export function publishQueueAdd(trackIndex) {
  const idx = Number(trackIndex);
  if (!isValidIndex(idx)) return;
  queue.push(idx);
  publishQueueState();
}

export function publishQueueRemoveAt(pos) {
  const p = Number(pos);
  if (!Number.isInteger(p) || p < 0 || p >= queue.length) return;
  queue.splice(p, 1);
  publishQueueState();
}

export function publishQueueMove(from, to) {
  const f = Number(from);
  const t = Number(to);
  if (!Number.isInteger(f) || !Number.isInteger(t)) return;
  if (f < 0 || f >= queue.length || t < 0 || t >= queue.length) return;
  if (f === t) return;
  const [item] = queue.splice(f, 1);
  queue.splice(t, 0, item);
  publishQueueState();
}

export function publishQueueClear() {
  if (queue.length === 0) return;
  queue = [];
  publishQueueState();
}

export function subscribeQueueState(fn) {
  if (typeof fn === "function") {
    subs.queueState.add(fn);
    try { fn(queue.slice()); } catch {}
    return () => subs.queueState.delete(fn);
  }
  return () => {};
}

// Called by the player when it needs the next queued track (skip or natural end).
export function dequeueQueue() {
  const next = queue.length ? queue.shift() : null;
  publishQueueState();
  return Number.isInteger(next) ? next : null;
}

// ========== SIMPLE GETTERS ==========
export const getMuted = () => muted;
export const getVolume = () => volume;
export const getShuffle = () => shuffle;
export const getLoop = () => loopOne;
export const getNowPlaying = () => nowPlaying;
export const getQueue = () => queue.slice();

// ========== Default Export ==========
export default {
  TRACK_TITLES,
  publishMuted, subscribeMuted,
  publishVolume, subscribeVolume,
  publishShuffleSet, subscribeShuffleSet,
  publishLoopSet, subscribeLoopSet,
  publishSkipNext, subscribeSkipNext,
  publishPlayByIndex, subscribePlayByIndex,
  publishSeekMs, subscribeSeekMs,
  publishNowPlaying, subscribeNowPlaying,
  publishQueueAdd, publishQueueRemoveAt, publishQueueMove, publishQueueClear,
  subscribeQueueState, dequeueQueue,
  getMuted, getVolume, getShuffle, getLoop, getNowPlaying, getQueue,
};
