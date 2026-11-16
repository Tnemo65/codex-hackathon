// 4-step onboarding following the Figma flow (on1..on4).
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { C, R, S, T } from '../theme';
import {
  COMMUTE_LABEL, DEFAULT_PROFILE, FIT_LABEL, JOBS, OCCASIONS, PROPORTION_LABEL, STYLES_F, STYLES_M,
  type Commute, type DressCode, type FitPref, type Profile, type Proportion, type Wear,
} from '../types';
import { BOTTOM_INSET, Button, Card, Chip, Icon, TOP_INSET } from '../ui';
import { CodeSlots } from '../components/CodeSlots';

type Next = 'add_camera' | 'add_library' | 'home';
const WEARS: [Wear, string][] = [['f', 'Đồ nữ'], ['m', 'Đồ nam'], ['u', 'Cả hai']];
const CODES: [DressCode, string][] = [['dong_phuc', 'Có đồng phục'], ['lich_su', 'Lịch sự, kín đáo'], ['thoai_mai', 'Thoải mái']];
const TITLES = ['Kể chút về bạn', 'Thói quen mặc đồ', 'Style bạn thích', 'Thêm đồ bạn hay mặc'];
const SUBS = [
  'Mình dùng câu trả lời để gợi ý outfit hợp với ngày của bạn.',
  'Chọn những dịp bạn hay cần outfit.',
  'Chọn ít nhất 3 style để gợi ý hợp gu hơn.',
  'Chụp vài món bạn hay mặc, AI sẽ tự điền thông tin.',
];
const row = { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 };
const inRange = (s: string, lo: number, hi: number) => /^\d+$/.test(s) && +s >= lo && +s <= hi;

function Figure({ kind, on }: { kind: Proportion; on: boolean }) {
  const waist = kind === 'long_torso' ? 56 : kind === 'balanced' ? 48 : 40;
  const col = on ? C.wine : C.sub;
  return (
    <Svg width={56} height={92} viewBox="0 0 56 92" fill="none">
      <Circle cx={28} cy={10} r={7} stroke={col} strokeWidth={2} />
      <Path d={`M16 24h24l-3 ${waist - 24}H19z`} stroke={col} strokeWidth={2} strokeLinejoin="round" />
      <Path d={`M19 ${waist}l-2 ${86 - waist}M37 ${waist}l2 ${86 - waist}M28 ${waist}v${86 - waist}`} stroke={col} strokeWidth={2} strokeLinecap="round" />
      <Line x1={8} x2={48} y1={waist} y2={waist} stroke={C.wine} strokeWidth={1} strokeDasharray="3 3" />
    </Svg>
  );
}

function Field({ label, value, unit, onChange, bad }: { label: string; value: string; unit: string; onChange: (v: string) => void; bad: boolean }) {
  return (
    <Card style={{ flex: 1, padding: 14, gap: 2, borderWidth: 1, borderColor: bad ? C.danger : C.line }}>
      <Text style={T.small}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <TextInput value={value} onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" accessibilityLabel={label}
          style={{ fontSize: 28, fontWeight: '700', color: C.text, minWidth: 64, minHeight: 44, padding: 0 }} />
        <Text style={T.sub}>{unit}</Text>
      </View>
      {bad ? <Text style={{ fontSize: 12, color: C.danger }}>Không hợp lệ</Text> : null}
    </Card>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={{ gap: 8 }}><Text style={T.h2}>{title}</Text>{children}</View>;
}

export default function Onboarding({ initial, onDone, onRestore }: {
  initial?: Profile;
  onDone: (profile: Profile, next: Next) => Promise<void>;
  onRestore: (code: string) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(initial ?? DEFAULT_PROFILE);
  const [hs, setHs] = useState(String(p.height_cm || ''));
  const [ws, setWs] = useState(String(p.weight_kg || ''));
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState<Next | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [code, setCode] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreErr, setRestoreErr] = useState<string | null>(null);
  const set = (patch: Partial<Profile>) => setP((o) => ({ ...o, ...patch }));

  const hOk = inRange(hs, 120, 210), wOk = inRange(ws, 30, 150);
  const base = p.wear === 'f' ? STYLES_F : p.wear === 'm' ? STYLES_M : [...STYLES_F, ...STYLES_M.filter((s) => !STYLES_F.includes(s))];
  const styleList = [...base, ...p.styles.filter((s) => !base.includes(s))];
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const canNext = [true, hOk && wOk && p.occasions.length > 0, p.styles.length >= 3, true][step];

  function next() {
    if (step === 1) set({ height_cm: +hs, weight_kg: +ws });
    setErr(null);
    setStep(step + 1);
  }
  async function finish(to: Next) {
    setBusy(to);
    setErr(null);
    try {
      await onDone({ ...p, height_cm: hOk ? +hs : p.height_cm, weight_kg: wOk ? +ws : p.weight_kg, city: p.city || 'Hà Nội' }, to);
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : 'Chưa lưu được, thử lại nhé.');
    } finally {
      setBusy(null);
    }
  }
  async function restore() {
    setRestoring(true);
    setRestoreErr(null);
    try {
      await onRestore(code.trim());
    } catch (e) {
      setRestoreErr(e instanceof Error && e.message ? e.message : 'Mã không đúng, thử lại nhé.');
    } finally {
      setRestoring(false);
    }
  }
  function addCustom() {
    const v = custom.trim();
    if (v && !p.styles.includes(v)) set({ styles: [...p.styles, v] });
    setCustom('');
  }

  const inputBox = { backgroundColor: C.card, borderRadius: R.chip, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, minHeight: 44, fontSize: 15, color: C.text };

  return (
    <View style={{ flex: 1, backgroundColor: C.pinkSoft, paddingTop: TOP_INSET }}>
      <View style={{ paddingHorizontal: S.page, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {step > 0 ? (
              <Pressable onPress={() => { setErr(null); setStep(step - 1); }} disabled={!!busy} accessibilityRole="button" accessibilityState={{ disabled: !!busy, busy: !!busy }} accessibilityLabel="Quay lại"
                style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
                <Icon name="left" size={18} />
              </Pressable>
            ) : null}
            <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, color: C.wine }}>TỦ ĐỒ CỦA BẠN</Text>
          </View>
          {step >= 2 ? (
            <Pressable onPress={() => (step === 2 ? next() : finish('home'))} disabled={!!busy} accessibilityRole="button" accessibilityState={{ disabled: !!busy, busy: !!busy }} accessibilityLabel="Để sau"
              style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: C.text }}>Để sau</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[0, 1, 2, 3].map((i) => <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= step ? C.wine : C.pink }} />)}
        </View>
        <Text style={T.sub}>Bước {step + 1} / 4</Text>
        <Text style={T.h1}>{TITLES[step]}</Text>
        <Text style={T.sub}>{SUBS[step]}</Text>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: S.page, gap: 18, paddingBottom: 24 }}>
        {step === 0 ? (
          <>
            <Group title="Bạn thường mặc">
              <View style={row}>{WEARS.map(([w, l]) => <Chip key={w} label={l} selected={p.wear === w} onPress={() => w !== p.wear && set({ wear: w, styles: [] })} />)}</View>
            </Group>
            <Group title="Bạn đang là">
              <View style={row}>{JOBS.map((j) => <Chip key={j} label={j} selected={p.job === j} onPress={() => set({ job: j })} />)}</View>
            </Group>
            <Group title="Ở trường / nơi làm">
              <View style={row}>{CODES.map(([k, l]) => <Chip key={k} label={l} selected={p.dress_code === k} onPress={() => set({ dress_code: k })} />)}</View>
            </Group>
            <Pressable onPress={() => setRestoreOpen(!restoreOpen)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, color: C.wine, fontWeight: '600', textDecorationLine: 'underline' }}>Đã có mã khôi phục?</Text>
            </Pressable>
            {restoreOpen ? (
              <View style={{ gap: 8 }}>
                <CodeSlots value={code} onChange={(value) => { setCode(value); setRestoreErr(null); }} invalid={!!restoreErr} />
                {restoreErr ? <Text accessibilityRole="alert" style={{ fontSize: 13, color: C.danger }}>{restoreErr}</Text> : null}
                <Button title="Khôi phục" kind="secondary" onPress={restore} loading={restoring} disabled={!code.trim()} />
              </View>
            ) : null}
          </>
        ) : null}

        {step === 1 ? (
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field label="Chiều cao" value={hs} unit="cm" onChange={setHs} bad={hs !== '' && !hOk} />
              <Field label="Cân nặng" value={ws} unit="kg" onChange={setWs} bad={ws !== '' && !wOk} />
            </View>
            {(hs !== '' && !hOk) || (ws !== '' && !wOk) ? <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: C.danger }}>Chiều cao 120-210 cm, cân nặng 30-150 kg.</Text> : null}
            <Group title="Tỷ lệ cơ thể">
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {(Object.keys(PROPORTION_LABEL) as Proportion[]).map((k) => {
                  const on = p.proportion === k;
                  return (
                    <Pressable key={k} onPress={() => set({ proportion: k })} accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={{ flex: 1, alignItems: 'center', gap: 6, padding: 10, borderRadius: R.card, borderWidth: 1.5, borderColor: on ? C.wine : C.line, backgroundColor: on ? C.pink : C.card }}>
                      <Figure kind={k} on={on} />
                      <Text style={{ fontSize: 12, fontWeight: on ? '700' : '500', color: on ? C.wine : C.text, textAlign: 'center' }}>{PROPORTION_LABEL[k]}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Group>
            <Group title="Bạn thích mặc">
              <View style={row}>{(Object.keys(FIT_LABEL) as FitPref[]).map((k) => <Chip key={k} label={FIT_LABEL[k]} selected={p.fit_pref === k} onPress={() => set({ fit_pref: k })} />)}</View>
            </Group>
            <Group title="Bạn hay đi lại bằng">
              <View style={row}>{(Object.keys(COMMUTE_LABEL) as Commute[]).map((k) => <Chip key={k} label={COMMUTE_LABEL[k]} selected={p.commute === k} onPress={() => set({ commute: k })} />)}</View>
            </Group>
            <Group title="Bạn hay cần outfit cho">
              <View style={row}>{OCCASIONS.map((o) => <Chip key={o} label={o} selected={p.occasions.includes(o)} onPress={() => set({ occasions: toggle(p.occasions, o) })} />)}</View>
              {p.occasions.length === 0 ? <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: C.danger }}>Chọn ít nhất một dịp.</Text> : null}
            </Group>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {styleList.map((s) => (
                <View key={s} style={{ width: '48.5%' }}>
                  <Chip label={s} selected={p.styles.includes(s)} onPress={() => set({ styles: toggle(p.styles, s) })} />
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput value={custom} onChangeText={setCustom} onSubmitEditing={addCustom} placeholder="Style khác, vd: Old money" placeholderTextColor={C.sub}
                accessibilityLabel="Style khác" returnKeyType="done" style={[inputBox, { flex: 1 }]} />
              <Button title="Thêm" kind="secondary" onPress={addCustom} disabled={!custom.trim()} style={{ minWidth: 80 }} />
            </View>
            <Text style={T.sub}>Đã chọn {p.styles.length} style.</Text>
          </>
        ) : null}

        {step === 3 ? (
          <View style={{ height: 220, borderRadius: R.image, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <Icon name="hanger" size={72} color={C.wine} />
            <Text style={{ fontSize: 13, color: C.wine, fontWeight: '600' }}>Mỗi món một tấm ảnh là đủ.</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={{ padding: S.page, paddingTop: 8, paddingBottom: 12 + BOTTOM_INSET, gap: 8, backgroundColor: C.pinkSoft }}>
        {err ? (
          <View style={{ gap: 4 }}>
            <Text accessibilityRole="alert" style={{ fontSize: 13, color: C.danger }}>{err}</Text>
            <Text style={{ fontSize: 12, color: C.sub }}>Bấm nút lại để thử lại.</Text>
          </View>
        ) : null}
        {step === 1 || step === 2 ? (
          <View style={{ flexDirection: 'row', gap: 14 }}>
            <Button title="Quay lại" kind="outline" onPress={() => { setErr(null); setStep(step - 1); }} style={{ flex: 119 }} />
            <Button title="Tiếp tục" onPress={next} disabled={!canNext} style={{ flex: 217 }} />
          </View>
        ) : step === 0 ? (
          <Button title="Tiếp tục" onPress={next} disabled={!canNext} />
        ) : (
          <>
            <Button title="Chụp ảnh" icon="camera" onPress={() => finish('add_camera')} loading={busy === 'add_camera'} disabled={!!busy} />
            <Button title="Chọn từ thư viện" icon="image" kind="outline" onPress={() => finish('add_library')} loading={busy === 'add_library'} disabled={!!busy} />
            <Button title="Để sau" kind="outline" onPress={() => finish('home')} loading={busy === 'home'} disabled={!!busy} />
          </>
        )}
      </View>
    </View>
  );
}
