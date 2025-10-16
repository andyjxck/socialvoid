// src/components/BackgroundMusic.jsx
import React, { useEffect, useRef } from "react";
import { Audio } from "expo-av";
import * as musicBus from "../utils/musicBus";

export default function BackgroundMusic() {
  const soundRef = useRef(null);
  const currentIndexRef = useRef(0);
  const isMountedRef = useRef(false);
  const isMutedRef = useRef(false);
  const volumeRef = useRef(0.18);
  const shuffleRef = useRef(true);
  const loopRef = useRef(false);

  // --- Track list ---
  const tracks = [
    require("../../assets/sounds/Track-1.mp3"),
    require("../../assets/sounds/Track-2.mp3"),
    require("../../assets/sounds/Track-3.mp3"),
    require("../../assets/sounds/Track-4.mp3"),
    require("../../assets/sounds/Track-5.mp3"),
    require("../../assets/sounds/Track-6.mp3"),
    require("../../assets/sounds/Track-7.mp3"),
    require("../../assets/sounds/Track-8.mp3"),
    require("../../assets/sounds/Track-9.mp3"),
    require("../../assets/sounds/Track-10.mp3"),
    require("../../assets/sounds/Track-11.mp3"),
    require("../../assets/sounds/Track-12.mp3"),
    require("../../assets/sounds/Track-13.mp3"),
    require("../../assets/sounds/Track-14.mp3"),
    require("../../assets/sounds/Track-15.mp3"),
    require("../../assets/sounds/Track-16.mp3"),
    require("../../assets/sounds/Track-17.mp3"),
    require("../../assets/sounds/Track-18.mp3"),
  ];

  const getTitle = (index) => musicBus.TRACK_TITLES?.[index] ?? `Track-${index + 1}`;

  const shuffleIndex = () => {
    if (tracks.length <= 1) return 0;
    const next = Math.floor(Math.random() * tracks.length);
    return next === currentIndexRef.current ? shuffleIndex() : next;
  };

  // --- Core helpers ---
  const unload = async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync().catch(() => {});
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    } catch {}
  };

  const publishNP = (index, status) => {
    musicBus.publishNowPlaying({
      index,
      title: getTitle(index),
      positionMs: status?.positionMillis ?? 0,
      durationMs: status?.durationMillis ?? 0,
      isPlaying: !!status?.isPlaying && !isMutedRef.current,
    });
  };

  const playIndex = async (index) => {
    try {
      await unload();

      const { sound } = await Audio.Sound.createAsync(tracks[index], {
        shouldPlay: !isMutedRef.current,
        volume: volumeRef.current,
      });

      soundRef.current = sound;
      currentIndexRef.current = index;
      publishNP(index);

      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (!isMountedRef.current || !status?.isLoaded) return;

        // Live NP metadata
        publishNP(index, status);

        if (status.didJustFinish) {
          if (loopRef.current) {
            try { await sound.replayAsync(); } catch {}
            return;
          }
          // Queue takes priority when a track ends
          const qNext = musicBus.dequeueQueue?.();
          if (Number.isInteger(qNext)) {
            await playIndex(qNext);
            return;
          }
          const nextIndex = shuffleRef.current
            ? shuffleIndex()
            : (index + 1) % tracks.length;
          await playIndex(nextIndex);
        }
      });
    } catch (e) {
      console.error("[BG MUSIC] playIndex error", e);
    }
  };

  const setMuted = async (muted) => {
    isMutedRef.current = !!muted;
    if (soundRef.current) {
      try {
        if (isMutedRef.current) {
          await soundRef.current.pauseAsync();
        } else {
          await soundRef.current.playAsync();
        }
        const status = await soundRef.current.getStatusAsync().catch(() => ({}));
        publishNP(currentIndexRef.current, status);
      } catch {}
    } else {
      publishNP(currentIndexRef.current);
    }
  };

  const setVolume = async (v) => {
    const clamped = Math.max(0, Math.min(1, Number(v) || 0));
    volumeRef.current = clamped;
    if (soundRef.current) {
      try { await soundRef.current.setVolumeAsync(clamped); } catch {}
    }
  };

  const seekToMs = async (ms) => {
    if (!soundRef.current) return;
    try {
      await soundRef.current.setPositionAsync(Math.max(0, Math.floor(ms)));
      const status = await soundRef.current.getStatusAsync().catch(() => ({}));
      publishNP(currentIndexRef.current, status);
    } catch {}
  };

  // --- Mount / unmount ---
  useEffect(() => {
    isMountedRef.current = true;

    (async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
        });

        // Prime from bus so UI mirrors actual state at open.
        isMutedRef.current = !!musicBus.getMuted?.();
        volumeRef.current = Number(musicBus.getVolume?.() ?? 0.18);
        shuffleRef.current = !!musicBus.getShuffle?.();
        loopRef.current = !!musicBus.getLoop?.();

        await playIndex(shuffleRef.current ? shuffleIndex() : 0);
      } catch (e) {
        console.error("[BG MUSIC] init error", e);
      }
    })();

    // Subscriptions
    const unsubMuted   = musicBus.subscribeMuted?.((v) => setMuted(!!v));
    const unsubVol     = musicBus.subscribeVolume?.((v) => setVolume(v));
    const unsubShuffle = musicBus.subscribeShuffleSet?.((v) => { shuffleRef.current = !!v; });
    const unsubLoop    = musicBus.subscribeLoopSet?.((v) => { loopRef.current = !!v; });
    const unsubNext    = musicBus.subscribeSkipNext?.(async () => {
      // On manual skip, queue still takes priority
      const qNext = musicBus.dequeueQueue?.();
      if (Number.isInteger(qNext)) {
        await playIndex(qNext);
        return;
      }
      const next = shuffleRef.current
        ? shuffleIndex()
        : (currentIndexRef.current + 1) % tracks.length;
      await playIndex(next);
    });
    const unsubPlayIdx = musicBus.subscribePlayByIndex?.((i) => {
      if (Number.isFinite(i)) playIndex(i);
    });
    const unsubSeek    = musicBus.subscribeSeekMs?.((ms) => seekToMs(ms));

    return () => {
      isMountedRef.current = false;
      unsubMuted?.();
      unsubVol?.();
      unsubShuffle?.();
      unsubLoop?.();
      unsubNext?.();
      unsubPlayIdx?.();
      unsubSeek?.();
      unload();
    };
  }, []);

  return null;
}
