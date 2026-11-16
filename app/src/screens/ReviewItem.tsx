// "Kiểm tra thông tin": review, edit or delete one item.
import React, { useState } from 'react';
import { Image, Text, TextInput, View } from 'react-native';
import { C, R, T } from '../theme';
import { KIND_LABEL, OCCASIONS, type Item, type Kind } from '../types';
import { Badge, Button, Card, Chip, ErrorBox, Screen } from '../ui';

const LEN_UP: [string, string][] = [['crop', 'Lửng'], ['ngang_hong', 'Ngang hông'], ['qua_hong', 'Qua hông'], ['dai', 'Dài']];
const LEN_DOWN: [string, string][] = [['tren_goi', 'Trên gối'], ['ngang_goi', 'Ngang gối'], ['mat_ca', 'Tới mắt cá'], ['cham_dat', 'Chấm đất']];
const RISE: [string, string][] = [['cap_cao', 'Cạp cao'], ['cap_vua', 'Cạp vừa'], ['cap_thap', 'Cạp thấp']];
const FIT: [string, string][] = [['om', 'Ôm'], ['vua', 'Vừa'], ['rong', 'Rộng']];
const FIELD_LABELS: Record<'name' | 'category' | 'color_name' | 'material', string> = {
  name: 'Tên món',
  category: 'Danh mục',
  color_name: 'Màu',
  material: 'Chất liệu',
};

const input = { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, fontSize: 15, color: C.text, backgroundColor: C.bg } as const;

function Row({ label, ai, children }: { label: string; ai: boolean; children: React.ReactNode }) {
  return (
    <Card style={{ gap: 8, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 13, fontWeight: '500', color: C.sub }}>{label}</Text>
        {ai ? <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: C.pink }}><Text style={{ fontSize: 11, fontWeight: '700', color: C.wine }}>AI</Text></View> : null}
      </View>
      {children}
    </Card>
  );
}

const Wrap = ({ children }: { children: React.ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;

// cutout: cut-out image that arrived after `item` was loaded; cutting: the server is still making it.
export default function ReviewItem({ item, isNew, cutout, cutting, refreshError, onRetryRefresh, onSave, onDelete, onBack }: { item: Item; isNew: boolean; cutout?: string | null; cutting?: boolean; refreshError?: string | null; onRetryRefresh?: () => void; onSave: (patch: Partial<Item>) => Promise<void>; onDelete: () => Promise<void>; onBack: () => void }) {
  const cutUrl = cutout ?? item.cutout_url;
  const [f, setF] = useState<Item>(item);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const set = <K extends keyof Item>(k: K, v: Item[K]) => setF((p) => ({ ...p, [k]: v }));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Có lỗi xảy ra.'); }
    finally { setBusy(false); }
  };

  const save = () => run(async () => {
    const patch: Record<string, unknown> = {};
    (Object.keys(f) as (keyof Item)[]).forEach((k) => {
      if (JSON.stringify(f[k]) !== JSON.stringify(item[k])) patch[k] = f[k];
    });
    if (Object.keys(patch).length === 0) {
      onBack();
      return;
    }
    await onSave(patch as Partial<Item>);
  });

  const lengths = f.kind === 'top' || f.kind === 'outer' ? LEN_UP : f.kind === 'bottom' || f.kind === 'dress' ? LEN_DOWN : [];
  const pick = (opts: [string, string][], key: 'length' | 'rise' | 'fit') => (
    <Wrap>{opts.map(([v, l]) => <Chip key={v} label={l} selected={f[key] === v} onPress={() => set(key, f[key] === v ? '' : v)} />)}</Wrap>
  );
  const text = (key: 'name' | 'category' | 'color_name' | 'material') => {
    return <TextInput value={f[key]} onChangeText={(v) => set(key, v)} style={input} accessibilityLabel={FIELD_LABELS[key]} />;
  };

  return (
    <Screen
      title={isNew ? 'Kiểm tra thông tin' : item.name}
      subtitle={isNew ? 'Chỉnh lại các trường AI đã điền' : undefined}
      onBack={onBack}
      footer={
        <>
          {refreshError ? <ErrorBox message={refreshError} onRetry={onRetryRefresh} /> : null}
          {error ? <Text accessibilityRole="alert" style={{ color: C.danger, fontSize: 13 }}>{error}</Text> : null}
          <Button title="Lưu vào tủ đồ" onPress={save} loading={busy && !confirm} disabled={busy} />
          {confirm ? (
            <Card style={{ gap: 10 }}>
              <Text style={T.h2}>Xoá hẳn món này?</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button title="Xoá" style={{ flex: 1 }} loading={busy} onPress={() => run(onDelete)} />
                <Button title="Giữ lại" kind="outline" style={{ flex: 1 }} disabled={busy} onPress={() => setConfirm(false)} />
              </View>
            </Card>
          ) : <Button title="Xoá món đồ" kind="outline" icon="trash" disabled={busy} onPress={() => setConfirm(true)} />}
        </>
      }
    >
      <View style={{ backgroundColor: C.pinkSoft, borderRadius: R.card, padding: 12, gap: 8 }}>
        {cutUrl ? <Badge text="Đã tách nền" tone="ok" /> : cutting ? <Text style={T.small}>AI đang tách nền, khoảng 15 giây…</Text> : null}
        <Image source={{ uri: cutUrl ?? item.image_url }} resizeMode="contain" style={{ width: '100%', height: 210 }} />
      </View>
      <Row label="Tên món" ai={isNew}>{text('name')}</Row>
      <Row label="Loại" ai={isNew}>
        <Wrap>{(Object.keys(KIND_LABEL) as Kind[]).map((k) => <Chip key={k} label={KIND_LABEL[k]} selected={f.kind === k} onPress={() => setF((p) => ({ ...p, kind: k, length: '', rise: '' }))} />)}</Wrap>
      </Row>
      <Row label="Danh mục" ai={isNew}>{text('category')}</Row>
      <Row label="Màu" ai={isNew}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: f.color_hex || C.line, borderWidth: 1, borderColor: C.line }} />
          <TextInput value={f.color_name} onChangeText={(v) => set('color_name', v)} style={[input, { flex: 1 }]} accessibilityLabel="Màu" />
        </View>
      </Row>
      <Row label="Chất liệu" ai={isNew}>{text('material')}</Row>
      <Row label="Dịp" ai={isNew}>
        <Wrap>{OCCASIONS.map((o) => (
          <Chip key={o} label={o} selected={f.occasions.includes(o)} onPress={() => set('occasions', f.occasions.includes(o) ? f.occasions.filter((x) => x !== o) : [...f.occasions, o])} />
        ))}</Wrap>
      </Row>
      {lengths.length ? <Row label="Độ dài" ai={isNew}>{pick(lengths, 'length')}</Row> : null}
      {f.kind === 'bottom' ? <Row label="Kiểu cạp" ai={isNew}>{pick(RISE, 'rise')}</Row> : null}
      <Row label="Phom" ai={isNew}>{pick(FIT, 'fit')}</Row>
    </Screen>
  );
}
