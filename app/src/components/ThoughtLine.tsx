// AI progress row: a lattice of cells pulsing in a wave, a live clock, and the steps the AI works through.
// When `done` is set it folds into one line ("Đã phối 3 bộ trong 6,2s").
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Text, View } from 'react-native';
import { useReduceMotion } from '../motion';
import { C } from '../theme';
import { Icon } from '../ui';

const CELLS = 12;
// ponytail: the backend answers once at the end, so steps reveal on a timer. The last step stays "in progress"
// until the real response arrives; only the clock and the final count are measured.
const STEP_MS = 1400;

const secs = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')}s`;

export function ThoughtLine({ title, steps, done }: { title: string; steps: string[]; done?: string }) {
  const t0 = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  const wave = useRef(new Animated.Value(0)).current;
  const reduce = useReduceMotion();

  useEffect(() => {
    if (done) return;
    const iv = setInterval(() => setNow(Date.now()), 100);
    if (reduce) { wave.setValue(0); return () => clearInterval(iv); }
    const loop = Animated.loop(Animated.timing(wave, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => { clearInterval(iv); loop.stop(); };
  }, [done, wave, reduce]);

  if (done) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 }}>
        <Dot state="ok" />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: C.text }} numberOfLines={1}>{done}</Text>
      </View>
    );
  }

  const elapsed = now - t0.current;
  const shown = Math.min(steps.length, 1 + Math.floor(elapsed / STEP_MS));
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 20, padding: 16, gap: 10 }} accessibilityLiveRegion="polite" accessibilityLabel={`${title}. ${steps[shown - 1] ?? ''}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 6 * 7 + 5 * 3, gap: 3 }}>
          {Array.from({ length: CELLS }, (_, i) => {
            const p = 0.05 + ((i % 6) / 6) * 0.6 + Math.floor(i / 6) * 0.1;
            const opacity = wave.interpolate({ inputRange: [0, p, p + 0.12, p + 0.24, 1], outputRange: [0.15, 0.15, 1, 0.15, 0.15] });
            return (
              <View key={i} style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: C.pink, overflow: 'hidden' }}>
                <Animated.View style={{ flex: 1, backgroundColor: C.wine, opacity }} />
              </View>
            );
          })}
        </View>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.text }}>{title}</Text>
        <Text style={{ fontSize: 12, color: C.sub, fontVariant: ['tabular-nums'] }}>{secs(elapsed)}</Text>
      </View>
      {steps.slice(0, shown).map((s, i) => <Step key={i} text={s} ok={i < shown - 1} />)}
    </View>
  );
}

function Step({ text, ok }: { text: string; ok: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  const reduce = useReduceMotion();
  useEffect(() => {
    if (reduce) { a.setValue(1); return; }
    Animated.timing(a, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [a, reduce]);
  return (
    <Animated.View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }}>
      <Dot state={ok ? 'ok' : 'run'} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: ok ? C.text : C.sub }}>{text}</Text>
    </Animated.View>
  );
}

function Dot({ state }: { state: 'ok' | 'run' }) {
  return state === 'ok' ? (
    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="check" size={12} color="#fff" />
    </View>
  ) : (
    <ActivityIndicator size="small" color={C.wine} style={{ width: 18, height: 18 }} />
  );
}

export { secs };
