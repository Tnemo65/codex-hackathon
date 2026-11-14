// One-time-code style input for the restore code: one hidden TextInput, visible slots that pop in, shake when invalid.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, TextInput, View } from 'react-native';
import { C } from '../theme';
import { useReduceMotion } from '../motion';

const PER_ROW = 6;

function Slot({ char, active, invalid, still }: { char: string; active: boolean; invalid: boolean; still: boolean }) {
  const pop = useRef(new Animated.Value(1)).current;
  const blink = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!char || still) { pop.setValue(1); return; }
    pop.setValue(0.6);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 220, useNativeDriver: true }).start();
  }, [char, still, pop]);

  useEffect(() => {
    if (!active || still) { blink.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(blink, { toValue: 0, duration: 450, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(blink, { toValue: 1, duration: 450, easing: Easing.linear, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active, still, blink]);

  return (
    <View style={{ width: 40, height: 48, borderRadius: 10, borderWidth: active && !invalid ? 2 : 1, borderColor: invalid ? C.danger : active ? C.wine : C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
      {char ? (
        <Animated.Text style={{ fontSize: 22, fontWeight: '700', color: C.text, transform: [{ scale: pop }] }}>{char}</Animated.Text>
      ) : active ? (
        <Animated.View style={{ width: 2, height: 22, borderRadius: 1, backgroundColor: C.wine, opacity: blink }} />
      ) : null}
    </View>
  );
}

export function CodeSlots({ value, onChange, length = 12, invalid = false, onComplete }: { value: string; onChange: (v: string) => void; length?: number; invalid?: boolean; onComplete?: (v: string) => void }) {
  const still = useReduceMotion();
  const [focused, setFocused] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!invalid || still) return;
    const step = (to: number) => Animated.timing(shake, { toValue: to, duration: 50, easing: Easing.linear, useNativeDriver: true });
    Animated.sequence([step(8), step(-8), step(6), step(-6), step(3), step(0)]).start();
  }, [invalid, still, shake]);

  const change = (t: string) => {
    const next = t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, length);
    onChange(next);
    if (next.length === length && value.length < length) onComplete?.(next);
  };

  const rows: number[][] = [];
  for (let i = 0; i < length; i += PER_ROW) rows.push(Array.from({ length: Math.min(PER_ROW, length - i) }, (_, k) => i + k));
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <Animated.View style={{ alignSelf: 'center', transform: [{ translateX: shake }] }}>
      <View style={{ gap: 8 }} pointerEvents="none">
        {rows.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
            {r.map((idx) => <Slot key={idx} char={value[idx] ?? ''} active={focused && idx === activeIndex} invalid={invalid} still={still} />)}
          </View>
        ))}
      </View>
      <TextInput
        value={value}
        onChangeText={change}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={length}
        autoCapitalize="characters"
        autoCorrect={false}
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        caretHidden
        selectionColor="transparent"
        accessibilityLabel="Nhập mã khôi phục"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.02, color: 'transparent' }}
      />
    </Animated.View>
  );
}
