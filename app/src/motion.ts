// Respect the system "Reduce Motion" setting (iOS Accessibility > Motion): animations should cut to the end state.
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

let current = false;
const listeners = new Set<(v: boolean) => void>();
AccessibilityInfo.isReduceMotionEnabled().then((v) => { current = v; listeners.forEach((f) => f(v)); }).catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { current = v; listeners.forEach((f) => f(v)); });

/** Current value without subscribing (for code outside components). */
export const reduceMotion = () => current;

/** True when the user asked the system to reduce motion; re-renders when it changes. */
export function useReduceMotion(): boolean {
  const [v, setV] = useState(current);
  useEffect(() => { listeners.add(setV); setV(current); return () => { listeners.delete(setV); }; }, []);
  return v;
}
