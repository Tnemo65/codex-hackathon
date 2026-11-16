// Shared UI primitives matching the Figma look. Screens should use these instead of restyling.
import React from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useReduceMotion } from './motion';
import { C, R, S, T } from './theme';

// Fixed insets (no safe-area module is installed): clear the Dynamic Island / notch and the home indicator on iPhone.
export const TOP_INSET = Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight ?? 0) + 12;
export const BOTTOM_INSET = Platform.OS === 'ios' ? 28 : 8;
// Shared pressed-state feedback: dim without changing layout bounds.
export const pressedStyle = ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: 0.6 } : null);

type IconName = 'home' | 'hanger' | 'layers' | 'user' | 'chat' | 'plus' | 'left' | 'right' | 'warn' | 'spark' | 'check' | 'camera' | 'image' | 'close' | 'grid' | 'person' | 'send' | 'trash' | 'calendar' | 'search';

const PATHS: Record<IconName, string> = {
  home: 'M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z',
  hanger: 'M12 7a2 2 0 1 0-2-2M12 7v2l8 6a1.5 1.5 0 0 1-1 2.7H5A1.5 1.5 0 0 1 4 15l8-6',
  layers: 'M12 4l8 4-8 4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0',
  chat: 'M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  plus: 'M12 5v14M5 12h14',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  warn: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  spark: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  check: 'M5 12l5 5 9-10',
  camera: 'M4 8h3l2-2h6l2 2h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4',
  close: 'M6 6l12 12M18 6L6 18',
  grid: 'M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z',
  person: 'M12 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 21v-6l-1-5h10l-1 5v6',
  send: 'M4 12l16-7-6 16-3-6z',
  trash: 'M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13',
  calendar: 'M5 6h14v14H5zM5 10h14M9 4v4M15 4v4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16 16l4 4',
};

export function Icon({ name, size = 22, color = C.text }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={PATHS[name]} stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      {name === 'camera' ? <Circle cx={12} cy={13.5} r={0.01} /> : null}
    </Svg>
  );
}

export function Button({ title, onPress, kind = 'primary', disabled, loading, icon, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'outline'; disabled?: boolean; loading?: boolean; icon?: IconName; style?: ViewStyle;
}) {
  const bg = kind === 'primary' ? C.wine : kind === 'secondary' ? C.pink : C.card;
  const fg = kind === 'primary' ? '#fff' : C.wine;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      style={({ pressed }) => [st.button, { backgroundColor: bg, borderColor: kind === 'outline' ? C.line : bg, opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg} /> : null}
          <Text style={[st.buttonText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, disabled, onPress }: { label: string; selected?: boolean; disabled?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => [st.chip, { backgroundColor: selected ? C.pink : C.card, borderColor: selected ? C.pink : C.line, opacity: disabled ? 0.45 : pressed ? 0.6 : 1 }]}>
      <Text style={{ fontSize: 14, fontWeight: selected ? '700' : '500', color: selected ? C.wine : C.text }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[st.card, style]}>{children}</View>;
}

export function Banner({ text }: { text: string }) {
  return (
    <View style={st.banner}>
      <Icon name="warn" size={16} color={C.wine} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: C.wine }}>{text}</Text>
    </View>
  );
}

export function Badge({ text, tone = 'pink' }: { text: string; tone?: 'pink' | 'ok' }) {
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: tone === 'ok' ? C.okBg : C.pink }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: tone === 'ok' ? C.ok : C.wine }}>{text}</Text>
    </View>
  );
}

// Page wrapper with title, optional subtitle, back button and right slot.
export function Screen({ title, subtitle, onBack, right, children, scroll = true, footer }: {
  title?: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode; children: React.ReactNode; scroll?: boolean; footer?: React.ReactNode;
}) {
  const body = scroll
    ? <ScrollView contentContainerStyle={{ padding: S.page, paddingTop: 8, gap: S.gap, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    : <View style={{ flex: 1, padding: S.page, paddingTop: 8, gap: S.gap }}>{children}</View>;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: TOP_INSET }}>
      {title ? (
        <View style={st.header}>
          {onBack ? (
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Quay lại" style={st.back}><Icon name="left" size={18} /></Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={T.h1}>{title}</Text>
            {subtitle ? <Text style={T.sub}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {body}
      {footer ? <View style={{ padding: S.page, paddingTop: 8, paddingBottom: 12, gap: 8 }}>{footer}</View> : null}
    </View>
  );
}

// Bottom sheet over a dimmed backdrop.
export function Sheet({ visible, onClose, title, subtitle, children }: { visible: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: C.dim }} onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng" />
      <View style={st.sheet}>
        <View style={st.grabber} />
        <Text style={T.h2}>{title}</Text>
        {subtitle ? <Text style={[T.sub, { marginTop: 2 }]}>{subtitle}</Text> : null}
        <View style={{ gap: 10, marginTop: 14 }}>{children}</View>
      </View>
    </Modal>
  );
}

// Skeleton placeholder: pulsing blocks shaped like the content, so a wait never looks frozen.
export function Loading({ text }: { text: string }) {
  const pulse = React.useRef(new Animated.Value(0.45)).current;
  const reduce = useReduceMotion();
  React.useEffect(() => {
    if (reduce) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse, reduce]);
  const bar = (w: number | `${number}%`, h: number) => <View style={{ width: w, height: h, borderRadius: 10, backgroundColor: C.pink }} />;
  return (
    <View style={{ gap: 12, paddingVertical: 8 }} accessibilityLiveRegion="polite" accessibilityLabel={text}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ActivityIndicator size="small" color={C.wine} />
        <Text style={T.sub}>{text}</Text>
      </View>
      <Animated.View style={{ opacity: pulse, backgroundColor: C.card, borderRadius: R.card, padding: 16, gap: 10 }}>
        {bar('100%', 150)}
        {bar('70%', 14)}
        {bar('45%', 14)}
      </Animated.View>
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card style={{ gap: 10 }}>
      <Text accessibilityRole="alert" style={{ fontSize: 14, color: C.danger }}>{message}</Text>
      {onRetry ? <Button title="Thử lại" kind="outline" onPress={onRetry} /> : null}
    </Card>
  );
}

const st = StyleSheet.create({
  button: { minHeight: 48, borderRadius: R.button, borderWidth: 1, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: R.chip, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: C.card, borderRadius: R.card, padding: 16 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.pink, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: S.page, paddingBottom: 6 },
  back: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: S.page, paddingBottom: 20 + BOTTOM_INSET },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, marginBottom: 14 },
});
