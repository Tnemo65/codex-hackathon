// Small status circle: idle ring, spinning arc, done check, failed cross. Fades/scales between states.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useReduceMotion } from '../motion';
import { C } from '../theme';
import { Icon } from '../ui';

export type MarkState = 'idle' | 'running' | 'done' | 'failed';

export function StatusMark({ state, size = 20 }: { state: MarkState; size?: number }) {
  const reduce = useReduceMotion();
  const spin = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state !== 'running' || reduce) { spin.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [state, reduce, spin]);

  useEffect(() => {
    if (reduce) { pop.setValue(1); return; }
    pop.setValue(0);
    Animated.timing(pop, { toValue: 1, duration: 200, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
  }, [state, reduce, pop]);

  const r = (size - 3) / 2;
  const c = 2 * Math.PI * r;
  const label = { idle: 'Đang chờ', running: 'Đang tách nền', done: 'Xong', failed: 'Lỗi' }[state];
  const filled = state === 'done' || state === 'failed';

  return (
    <View accessible accessibilityLabel={label} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', opacity: pop,
        transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>
        {filled ? (
          <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: state === 'done' ? C.wine : C.danger, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={state === 'done' ? 'check' : 'close'} size={Math.round(size * 0.7)} color="#FFFFFF" />
          </View>
        ) : (
          <Animated.View style={state === 'running' ? { transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] } : undefined}>
            <Svg width={size} height={size}>
              <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.pink} strokeWidth={2.5} fill="none" />
              {state === 'running' ? (
                <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.wine} strokeWidth={2.5} fill="none" strokeLinecap="round"
                  strokeDasharray={`${c * 0.28} ${c}`} />
              ) : null}
            </Svg>
          </Animated.View>
        )}
      </Animated.View>
    </View>
  );
}
