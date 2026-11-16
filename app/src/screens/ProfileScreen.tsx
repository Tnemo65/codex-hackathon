// "Hồ sơ": edit profile, restore code, background-removal switch.
import React, { useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import { C, T } from '../theme';
import { COMMUTE_LABEL, FIT_LABEL, JOBS, OCCASIONS, PROPORTION_LABEL, STYLES_F, STYLES_M, type Commute, type DressCode, type FitPref, type Profile, type Proportion, type Wear } from '../types';
import { Button, Card, Chip, Screen } from '../ui';
import { CodeSlots } from '../components/CodeSlots';

const WEAR: [Wear, string][] = [['f', 'Đồ nữ'], ['m', 'Đồ nam'], ['u', 'Cả hai']];
const DRESS: [DressCode, string][] = [['dong_phuc', 'Có đồng phục'], ['lich_su', 'Lịch sự'], ['thoai_mai', 'Thoải mái']];
const input = { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, fontSize: 15, color: C.text, backgroundColor: C.bg } as const;

const Wrap = ({ children }: { children: React.ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
const Label = ({ text }: { text: string }) => <Text style={{ fontSize: 13, fontWeight: '600', color: C.sub, marginTop: 4 }}>{text}</Text>;
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function ProfileScreen({ profile, restoreCode, removeBg, onToggleRemoveBg, onSave, onRestore, onRedoOnboarding }: { profile: Profile; restoreCode: string | null; removeBg: boolean; onToggleRemoveBg: (v: boolean) => void; onSave: (p: Profile) => Promise<void>; onRestore: (code: string) => Promise<void>; onRedoOnboarding: () => void }) {
  const [p, setP] = useState<Profile>(profile);
  const [h, setH] = useState(String(profile.height_cm));
  const [w, setW] = useState(String(profile.weight_kg));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [code, setCode] = useState('');
  const [rBusy, setRBusy] = useState(false);
  const [rError, setRError] = useState<string | null>(null);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => { setSaved(false); setP((x) => ({ ...x, [k]: v })); };
  const styles = p.wear === 'm'
    ? STYLES_M
    : p.wear === 'u'
      ? [...STYLES_F, ...STYLES_M.filter((style) => !STYLES_F.includes(style))]
      : STYLES_F;
  const hn = Number(h);
  const wn = Number(w);
  const hBad = !(hn >= 120 && hn <= 210);
  const wBad = !(wn >= 30 && wn <= 150);

  const save = async () => {
    if (hBad || wBad) { setError('Kiểm tra lại chiều cao và cân nặng.'); return; }
    setBusy(true); setError(null); setSaved(false);
    try { await onSave({ ...p, height_cm: hn, weight_kg: wn }); setSaved(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'Có lỗi xảy ra.'); }
    finally { setBusy(false); }
  };

  const restore = async () => {
    if (!code.trim()) { setRError('Nhập mã khôi phục.'); return; }
    setRBusy(true); setRError(null);
    try { await onRestore(code.trim()); }
    catch (e) { setRError(e instanceof Error ? e.message : 'Có lỗi xảy ra.'); }
    finally { setRBusy(false); }
  };

  return (
    <Screen title="Hồ sơ" subtitle={profile.name ? `Chào ${profile.name}` : undefined}>
      <Card style={{ gap: 8 }}>
        <Text style={T.h2}>Về bạn</Text>
        <Wrap>{WEAR.map(([v, l]) => <Chip key={v} label={l} selected={p.wear === v} onPress={() => { setSaved(false); setP((x) => (x.wear === v ? x : { ...x, wear: v, styles: [] })); }} />)}</Wrap>
        <Label text="Nghề nghiệp" />
        <Wrap>{JOBS.map((j) => <Chip key={j} label={j} selected={p.job === j} onPress={() => set('job', j)} />)}</Wrap>
        <Label text="Quy định trang phục" />
        <Wrap>{DRESS.map(([v, l]) => <Chip key={v} label={l} selected={p.dress_code === v} onPress={() => set('dress_code', v)} />)}</Wrap>
      </Card>

      <Card style={{ gap: 8 }}>
        <Text style={T.h2}>Dáng người</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Label text="Chiều cao (cm)" />
            <TextInput value={h} onChangeText={(v) => { setSaved(false); setH(v.replace(/[^0-9]/g, '')); }} keyboardType="number-pad" style={[input, hBad && { borderColor: C.danger }]} accessibilityLabel="Chiều cao" />
            {hBad ? <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: C.danger }}>Từ 120 đến 210</Text> : null}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Label text="Cân nặng (kg)" />
            <TextInput value={w} onChangeText={(v) => { setSaved(false); setW(v.replace(/[^0-9]/g, '')); }} keyboardType="number-pad" style={[input, wBad && { borderColor: C.danger }]} accessibilityLabel="Cân nặng" />
            {wBad ? <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, color: C.danger }}>Từ 30 đến 150</Text> : null}
          </View>
        </View>
        <Label text="Tỉ lệ cơ thể" />
        <Wrap>{(Object.keys(PROPORTION_LABEL) as Proportion[]).map((k) => <Chip key={k} label={PROPORTION_LABEL[k]} selected={p.proportion === k} onPress={() => set('proportion', k)} />)}</Wrap>
        <Label text="Phom đồ thích mặc" />
        <Wrap>{(Object.keys(FIT_LABEL) as FitPref[]).map((k) => <Chip key={k} label={FIT_LABEL[k]} selected={p.fit_pref === k} onPress={() => set('fit_pref', k)} />)}</Wrap>
      </Card>

      <Card style={{ gap: 8 }}>
        <Text style={T.h2}>Thói quen</Text>
        <Label text="Di chuyển" />
        <Wrap>{(Object.keys(COMMUTE_LABEL) as Commute[]).map((k) => <Chip key={k} label={COMMUTE_LABEL[k]} selected={p.commute === k} onPress={() => set('commute', k)} />)}</Wrap>
        <Label text="Dịp thường gặp" />
        <Wrap>{OCCASIONS.map((o) => <Chip key={o} label={o} selected={p.occasions.includes(o)} onPress={() => set('occasions', toggle(p.occasions, o))} />)}</Wrap>
        <Label text="Phong cách" />
        <Wrap>{styles.map((s) => <Chip key={s} label={s} selected={p.styles.includes(s)} onPress={() => set('styles', toggle(p.styles, s))} />)}</Wrap>
      </Card>

        {error ? <Text accessibilityRole="alert" style={{ color: C.danger, fontSize: 13 }}>{error}</Text> : null}
      <Button title="Lưu hồ sơ" onPress={save} loading={busy} />
        {saved ? <Text accessibilityLiveRegion="polite" style={{ color: C.ok, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>Đã lưu</Text> : null}

      <Card style={{ gap: 8 }}>
        <Text style={T.h2}>Mã khôi phục</Text>
        <Text selectable style={{ fontSize: 28, fontWeight: '800', letterSpacing: 3, color: C.wine }}>{restoreCode ?? '—'}</Text>
        <Text style={T.sub}>Dùng mã này để mở lại tủ đồ trên máy khác.</Text>
        <CodeSlots value={code} onChange={(v) => { setRError(null); setCode(v); }} invalid={!!rError} />
          {rError ? <Text accessibilityRole="alert" style={{ color: C.danger, fontSize: 13 }}>{rError}</Text> : null}
          <Button title="Khôi phục" kind="secondary" onPress={restore} loading={rBusy} disabled={!code.trim()} />
      </Card>

      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={[T.h2, { flex: 1 }]}>Tách nền ảnh món đồ</Text>
          <Switch value={removeBg} onValueChange={onToggleRemoveBg} trackColor={{ true: C.wine, false: C.line }} accessibilityLabel="Tách nền ảnh món đồ" />
        </View>
        <Text style={T.sub}>Mỗi tháng chỉ có 50 lượt miễn phí, chỉ bật khi cần.</Text>
      </Card>

      <Button title="Xem lại phần giới thiệu" kind="outline" onPress={onRedoOnboarding} />
    </Screen>
  );
}
