// "Phối đồ" screen: pick pieces from the wardrobe, see them on the body or as a canvas, try on with AI, use for today, save combos.
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { api, todayStr } from '../api';
import { OutfitCanvas } from '../components/OutfitCanvas';
import { OutfitOnBody } from '../components/OutfitOnBody';
import { C, R, S, T } from '../theme';
import type { Item, Kind, Profile } from '../types';
import { Badge, Button, Card, ErrorBox, Icon, Screen } from '../ui';

const SAVED_KEY = 'tudo.saved_outfits';
const ROWS: { label: string; kinds: Kind[] }[] = [
  { label: 'Áo', kinds: ['top', 'outer'] },
  { label: 'Quần / váy', kinds: ['bottom', 'dress'] },
  { label: 'Giày', kinds: ['shoes'] },
  { label: 'Túi', kinds: ['bag'] },
];
type Saved = { id: string; name: string; item_ids: string[] };
type Mode = 'body' | 'canvas' | 'saved';
const TABS: { key: Mode; label: string }[] = [{ key: 'body', label: 'Trên người' }, { key: 'canvas', label: 'Canvas' }, { key: 'saved', label: 'Đã lưu' }];
const imgOf = (i: Item) => i.cutout_url || i.image_url;

export default function Studio({ items, profile, onOpenTryOn, onPlanChanged, onOpenProfile }: {
  items: Item[]; profile: Profile; onOpenTryOn: (itemIds: string[]) => void; onPlanChanged: () => void; onOpenProfile: () => void;
}) {
  const { width: winW } = useWindowDimensions();
  const boxW = Math.min(winW, 520) - S.page * 2;
  const [mode, setMode] = useState<Mode>('canvas');
  const [ids, setIds] = useState<string[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(SAVED_KEY).then((v) => { if (v) setSaved(JSON.parse(v) as Saved[]); }).catch(() => {});
  }, []);

  const byId = new Map(items.map((i) => [i.id, i]));
  const picked = ids.map((id) => byId.get(id)).filter((i): i is Item => !!i);
  const pickedIds = picked.map((i) => i.id);
  const canGo = picked.length >= 2;

  function persist(next: Saved[]) {
    setSaved(next);
    AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next)).catch(() => {});
  }

  function toggle(item: Item) {
    setNote(null); setErr(null);
    if (pickedIds.includes(item.id)) { setIds(pickedIds.filter((id) => id !== item.id)); return; }
    // One item per kind; a dress replaces top + bottom and the other way round.
    const drop = new Set<Kind>([item.kind]);
    if (item.kind === 'dress') { drop.add('top'); drop.add('bottom'); }
    if (item.kind === 'top' || item.kind === 'bottom') drop.add('dress');
    setIds([...picked.filter((p) => !drop.has(p.kind)).map((p) => p.id), item.id]);
  }

  async function useToday() {
    setBusy(true); setErr(null); setNote(null);
    try {
      await api.planSet(todayStr(), 'planned', { item_ids: pickedIds, name: 'Bộ tự phối', why: '', fit_note: '', warnings: [] });
      onPlanChanged();
      setNote('Đã dùng cho hôm nay');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Có lỗi xảy ra.'); } finally { setBusy(false); }
  }

  function save() {
    persist([{ id: `${Date.now()}`, name: `Bộ tự phối ${saved.length + 1}`, item_ids: pickedIds }, ...saved]);
    setNote('Đã lưu outfit');
  }

  function load(s: Saved) {
    setIds(s.item_ids.filter((id) => byId.has(id)));
    setNote(null); setErr(null); setMode('canvas');
  }

  const avatar = (
    <Pressable onPress={onOpenProfile} accessibilityRole="button" accessibilityLabel="Hồ sơ" style={st.avatar}>
      <Icon name="user" size={22} color={C.wine} />
    </Pressable>
  );

  if (!items.length) {
    return (
      <Screen title="Phối đồ" right={avatar}>
        <Card style={{ gap: 6 }}>
          <Text style={T.h2}>Tủ đồ đang trống</Text>
          <Text style={T.sub}>Thêm vài món ở tab Tủ đồ rồi quay lại đây để tự phối.</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Phối đồ" subtitle={mode === 'saved' ? `${saved.length} outfit đã lưu` : `${picked.length} món đang phối`} right={avatar}>
      <View style={st.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => setMode(t.key)} accessibilityRole="button" accessibilityState={{ selected: mode === t.key }}
            style={[st.tab, mode === t.key && { backgroundColor: C.pink, borderColor: C.pink }]}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: mode === t.key ? C.wine : C.text }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {mode === 'saved' ? (
        saved.length === 0 ? (
          <Card style={{ gap: 6 }}>
            <Text style={T.h2}>Chưa lưu outfit nào</Text>
            <Text style={T.sub}>Chọn vài món rồi bấm Lưu outfit.</Text>
          </Card>
        ) : (
          <View style={st.grid}>
            {saved.map((s) => {
              const its = s.item_ids.map((id) => byId.get(id)).filter((i): i is Item => !!i);
              return (
                <View key={s.id} style={st.savedCard}>
                  <Pressable onPress={() => load(s)} accessibilityRole="button" accessibilityLabel={`Mở ${s.name}`} style={{ gap: 8 }}>
                    <View style={st.thumbs}>
                      {its.slice(0, 4).map((i) => <Image key={i.id} source={{ uri: imgOf(i) }} style={st.thumb} resizeMode="contain" />)}
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }} numberOfLines={1}>{s.name}</Text>
                    <Text style={T.small}>{its.length} món · Từ tủ đồ</Text>
                  </Pressable>
                  <Pressable onPress={() => persist(saved.filter((x) => x.id !== s.id))} accessibilityRole="button" accessibilityLabel={`Xoá ${s.name}`} style={st.del}>
                    <Icon name="trash" size={16} color={C.sub} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )
      ) : (
        <>
          <View style={st.stage}>
            {picked.length === 0 ? (
              <View style={{ height: 360, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <Text style={[T.sub, { textAlign: 'center' }]}>Chạm vào món bên dưới để bắt đầu phối.</Text>
              </View>
            ) : mode === 'canvas' ? (
              <OutfitCanvas items={picked} width={boxW} height={360} onPressItem={toggle} />
            ) : (
              <OutfitOnBody items={picked} profile={profile} width={boxW} height={360} />
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={T.h2}>Chọn món trong tủ</Text>
            <Text style={T.sub}>{picked.length} món đang phối</Text>
          </View>
          {ROWS.map((row) => {
            const list = items.filter((i) => row.kinds.includes(i.kind));
            if (!list.length) return null;
            return (
              <View key={row.label} style={{ gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.sub }}>{row.label}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  {list.map((i) => {
                    const on = pickedIds.includes(i.id);
                    return (
                      <Pressable key={i.id} onPress={() => toggle(i)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={i.name}
                        style={[st.tile, on && { borderColor: C.wine }]}>
                        <Image source={{ uri: imgOf(i) }} style={st.tileImg} resizeMode="contain" />
                        <Text style={{ fontSize: 11, color: C.text }} numberOfLines={1}>{i.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })}

          {note ? <Badge text={note} tone="ok" /> : null}
          {err ? <ErrorBox message={err} onRetry={() => void useToday()} /> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Button title="Lưu outfit" kind="outline" disabled={!canGo} onPress={save} style={{ flex: 1 }} />
            <Button title="Dùng cho hôm nay" kind="secondary" disabled={!canGo} loading={busy} onPress={() => void useToday()} style={{ flex: 1 }} />
          </View>
          <Button title="Mặc thử AI" icon="spark" disabled={!canGo} onPress={() => onOpenTryOn(pickedIds)} />
        </>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, minHeight: 44, borderRadius: R.chip, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  stage: { backgroundColor: C.pinkSoft, borderRadius: R.card, overflow: 'hidden' },
  tile: { width: 84, padding: 6, gap: 4, borderRadius: 16, borderWidth: 2, borderColor: 'transparent', backgroundColor: C.pinkSoft, alignItems: 'center' },
  tileImg: { width: 70, height: 70 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.gap },
  savedCard: { width: (Math.min(Dimensions.get('window').width, 520) - S.page * 2 - S.gap) / 2, backgroundColor: C.card, borderRadius: R.card, padding: 12 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, height: 112, backgroundColor: C.pinkSoft, borderRadius: 12, padding: 4, overflow: 'hidden' },
  thumb: { width: '47%', height: 50 },
  del: { position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
});

