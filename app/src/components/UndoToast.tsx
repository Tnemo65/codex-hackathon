// Bottom toast with an undo button and a fuse bar; calls onDone when the fuse ends or the user swipes it down.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, PanResponder, Pressable, Text, View } from 'react-native';
import { useReduceMotion } from '../motion';
import { C } from '../theme';

export function UndoToast({ text, onUndo, onDone, ms = 5000 }: { text: string; onUndo: () => void; onDone: () => void; ms?: number }) {
  const reduce = useReduceMotion();
  const fuse = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(reduce ? 0 : 1)).current;
  const finished = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const finish = () => { if (finished.current) return; finished.current = true; doneRef.current(); };

  useEffect(() => {
    if (!reduce) Animated.timing(slide, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // The fuse bar shrinks over `ms`; under reduced motion it stays full and a plain timer ends it.
    const anim = Animated.timing(fuse, { toValue: 0, duration: ms, easing: Easing.linear, useNativeDriver: false });
    if (!reduce) anim.start(({ finished: ok }) => { if (ok) finish(); });
    const t = reduce ? setTimeout(finish, ms) : null;
    return () => { anim.stop(); if (t) clearTimeout(t); finish(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_, g) => { if (g.dy > 40) finish(); },
  })).current;

  return (
    <Animated.View {...pan.panHandlers} accessibilityLiveRegion="polite"
      style={{ position: 'absolute', left: 20, right: 20, bottom: 96, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: 'hidden',
        shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
        transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 80] }) }] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '600', color: C.text }}>{text}</Text>
        <Pressable onPress={() => { finished.current = true; onUndo(); }} accessibilityRole="button" accessibilityLabel="Hoàn tác"
          style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: C.wine }}>Hoàn tác</Text>
        </Pressable>
      </View>
      <Animated.View style={{ height: 3, backgroundColor: C.wine, width: fuse.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </Animated.View>
  );
}
