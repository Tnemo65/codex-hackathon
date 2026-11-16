// "Trên người" as in Figma ("Khung xem outfit"): an AI photo of a model wearing the outfit on the left,
// garment thumbnails with names on the right. The 2D figure (OutfitOnBody) stays underneath as the
// placeholder while the photo is made (~12 s) and as the fallback when it can't be.
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { tryonApi } from '../api';
import { PANEL } from '../body';
import { useReduceMotion } from '../motion';
import { C } from '../theme';
import type { Item, Profile } from '../types';
import { OutfitOnBody } from './OutfitOnBody';

const CACHE_KEY = 'tudo.outfit_photo'; // { [sorted item ids]: tryon job id } so an outfit is generated once
const POLL_MS = 3000;
const MAX_WAIT_MS = 170000; // server marks a job stale after this

type Phase = 'idle' | 'ask' | 'pending' | 'done' | 'failed';

async function readCache(): Promise<Record<string, string>> {
  try { return JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? '{}'); } catch { return {}; }
}
async function writeCache(key: string, job: string | null) {
  const map = await readCache();
  if (job) map[key] = job; else delete map[key];
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(map)).catch(() => {});
}

// auto=false (Phối đồ, where every tap makes a new outfit): only generate when the user asks, to spare the daily cap.
export function OutfitPhoto({ items, profile, width, height, auto = true }: { items: Item[]; profile: Profile | null; width: number; height: number; auto?: boolean }) {
  // Shop products can't go to try-on (the server only loads owned items): those outfits keep the 2D figure.
  const owned = items.filter((i) => !('shop' in i));
  const key = items.length && owned.length === items.length ? owned.map((i) => i.id).sort().join('|') : '';
  const [phase, setPhase] = useState<Phase>('idle');
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const live = useRef(key);
  const fade = useRef(new Animated.Value(0)).current;
  const scan = useRef(new Animated.Value(0)).current;
  const areaW = width * PANEL.areaFrac;
  const reduce = useReduceMotion();

  async function run(k: string, fresh: boolean, asked = false) {
    live.current = k;
    setUrl(null); setErr(null); fade.setValue(0);
    if (!k) { setPhase('idle'); return; }
    const alive = () => live.current === k;
    let job: string | null = null;
    let discardJob = false;
    try {
      job = fresh ? null : (await readCache())[k] ?? null;
      if (!alive()) return;
      if (!job && !auto && !asked) { setPhase('ask'); return; }
      setPhase('pending');
      if (!job) {
        job = (await tryonApi.create(k.split('|'), null, 'profile')).job_id;
        await writeCache(k, job);
      }
      const started = Date.now();
      while (alive()) {
        const s = await tryonApi.status(job);
        if (!alive()) return;
        if (s.status === 'done' && s.image_url) { setUrl(s.image_url); setPhase('done'); return; }
        if (s.status === 'failed') {
          discardJob = true;
          throw new Error(s.error ?? 'AI chưa tạo được ảnh.');
        }
        if (Date.now() - started > MAX_WAIT_MS) {
          discardJob = true;
          throw new Error('Tạo ảnh quá lâu.');
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    } catch (e) {
      if (!alive()) return;
      const jobMissing = e instanceof Error && e.message === 'Không tìm thấy yêu cầu tạo ảnh.';
      if (discardJob || jobMissing) await writeCache(k, null);
      else if (job) await writeCache(k, job); // keep pending work when status polling only failed transiently
      setErr(e instanceof Error ? e.message : 'AI chưa tạo được ảnh.');
      setPhase('failed');
    }
  }

  useEffect(() => { void run(key, false); return () => { live.current = ''; }; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== 'pending' || reduce) return;
    const loop = Animated.loop(Animated.timing(scan, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [phase, scan, reduce]);

  return (
    <View style={{ width, height }}>
      <OutfitOnBody items={items} profile={profile} width={width} height={height} />

      {phase === 'pending' ? (
        <>
          {reduce ? null : <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: areaW, height: 2, backgroundColor: C.wine, opacity: 0.35,
            transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [0, height - 2] }) }] }} />}
          <View style={{ position: 'absolute', left: 10, top: 10, backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: C.wine }}>AI đang mặc thử…</Text>
          </View>
        </>
      ) : null}

      {url ? (
        <Animated.Image source={{ uri: url }} resizeMode="cover" accessibilityLabel="Ảnh người mẫu mặc bộ đồ này"
          onLoad={() => (reduce ? fade.setValue(1) : Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start())}
          style={{ position: 'absolute', left: 0, top: 0, width: areaW, height, borderTopLeftRadius: 20, borderBottomLeftRadius: 20, opacity: fade }} />
      ) : null}

      {phase === 'ask' ? (
        <Pressable onPress={() => void run(key, false, true)} accessibilityRole="button" accessibilityLabel="Xem trên người mẫu AI"
          style={{ position: 'absolute', left: 10, top: 10, backgroundColor: C.wine, borderRadius: 999, paddingHorizontal: 12, minHeight: 36, justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>Xem trên người mẫu AI</Text>
        </Pressable>
      ) : null}

      {phase === 'failed' ? (
        <Pressable onPress={() => void run(key, false)} accessibilityRole="button" accessibilityLabel="Thử kiểm tra ảnh người mẫu lại"
          style={{ position: 'absolute', left: 10, top: 10, maxWidth: areaW - 20, backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text numberOfLines={2} style={{ fontSize: 11, color: C.sub }}>{err}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: C.wine, marginTop: 2 }}>Thử lại</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
