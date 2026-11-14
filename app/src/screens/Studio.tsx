// "Phối đồ" screen: pick pieces from the wardrobe and the shop, see them on the body or as a canvas, try on with AI, use for today, save combos.
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Dimensions, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { api, todayStr } from '../api';
import { cachedCatalog, loadCatalog, takeStudioPicks } from '../catalog';
import { OutfitCanvas } from '../components/OutfitCanvas';
import { OutfitPhoto } from '../components/OutfitPhoto';
import { C, R, S, T } from '../theme';
import type { Item, Kind, Product, Profile } from '../types';
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
const SOURCES = [['own', 'Tủ của tôi'], ['shop', 'Từ shop']] as const;
const imgOf = (i: Item) => i.cutout_url || i.image_url;
const isProduct = (i: Item): i is Product => 'shop_url' in i;
const money = (n: number) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;

// One item per kind; a dress replaces top + bottom and the other way round.
function withItem(current: Item[], item: Item): Item[] {
  const drop = new Set<Kind>([item.kind]);
  if (item.kind === 'dress') { drop.add('top'); drop.add('bottom'); }
  if (item.kind === 'top' || item.kind === 'bottom') drop.add('dress');
  // Two tops may layer (a tee under a cardigan or shirt): keep the newest earlier top, replace only the oldest.
  if (item.kind === 'top') {
    const tops = current.filter((p) => p.kind === 'top');
    const keep = tops.length ? tops[tops.length - 1].id : null;
    return [...current.filter((p) => !drop.has(p.kind) || p.id === keep), item];
  }
  return [...current.filter((p) => !drop.has(p.kind)), item];
}

export default function Studio({ items, profile, onOpenTryOn, onPlanChanged, onOpenProfile }: {
  items: Item[]; profile: Profile; onOpenTryOn: (itemIds: string[]) => void; onPlanChanged: () => void; onOpenProfile: () => void;
}) {
  const { width: winW } = useWindowDimensions();
  const boxW = Math.min(winW, 520) - S.page * 2;
  const [mode, setMode] = useState<Mode>('body');
  const [ids, setIds] = useState<string[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Product[]>(cachedCatalog());
  const [catState, setCatState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [source, setSource] = useState<Record<string, 'own' | 'shop'>>({});

  function fetchCatalog(force = false) {
    setCatState('loading');
    return loadCatalog(force).then((p) => { setCatalog(p); setCatState('idle'); return p; })
      .catch(() => { setCatState('error'); return null; });
  }

  useEffect(() => {
    AsyncStorage.getItem(SAVED_KEY).then((v) => { if (v) setSaved(JSON.parse(v) as Saved[]); }).catch(() => {});
    // App remounts Studio on every tab switch, so picks queued by "Phối thử" are taken here.
    const queued = takeStudioPicks();
    if (!queued.length && cachedCatalog().length) return;
    void fetchCatalog().then((p) => {
      if (!p || !queued.length) return;
      const all = new Map<string, Item>([...p, ...items].map((i) => [i.id, i]));
      setIds((cur) => {
        let list = cur.map((id) => all.get(id)).filter((i): i is Item => !!i);
        for (const id of queued) {
          const prod = all.get(id);
          if (prod) list = withItem(list, prod);
        }
        return list.map((i) => i.id);
      });
    });
  }, []);

  const byId = new Map<string, Item>([...catalog, ...items].map((i) => [i.id, i]));
  const picked = ids.map((id) => byId.get(id)).filter((i): i is Item => !!i);
  const pickedIds = picked.map((i) => i.id);
  const canGo = picked.length >= 2;
  const products = picked.filter(isProduct);
  const ownIds = picked.filter((i) => !isProduct(i)).map((i) => i.id);
  const canTry = ownIds.length >= 2;
  const total = products.reduce((sum, p) => sum + p.price, 0);

  function persist(next: Saved[]) {
    setSaved(next);
    AsyncStorage.setItem(SAVED_KEY, JSON.stringify(next)).catch(() => {});
  }

  function toggle(item: Item) {
    setNote(null); setErr(null);
    if (pickedIds.includes(item.id)) { setIds(pickedIds.filter((id) => id !== item.id)); return; }
    setIds(withItem(picked, item).map((i) => i.id));
  }

  function pickSource(label: string, k: 'own' | 'shop') {
    setSource({ ...source, [label]: k });
    if (k === 'shop' && !catalog.length && catState !== 'loading') void fetchCatalog();
  }

  async function useToday() {
    setBusy(true); setErr(null); setNote(null);
    try {
      await api.planSet(todayStr(), 'planned', { item_ids: ownIds, name: 'Bộ tự phối', why: '', fit_note: '', warnings: [] });
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

  // An empty wardrobe can still mix shop pieces; only block when the shop has nothing either.
  if (!items.length && !catalog.length && catState === 'error') {
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
                    <Text style={T.small}>{its.length} món · {its.some(isProduct) ? 'Có món từ shop' : 'Từ tủ đồ'}</Text>
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
              <OutfitPhoto items={picked} profile={profile} width={boxW} height={440} auto={false} />
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={T.h2}>Chọn món trong tủ</Text>
            <Text style={T.sub}>{picked.length} món đang phối</Text>
          </View>
          {ROWS.map((row) => {
            const src = source[row.label] ?? (items.length ? 'own' : 'shop');
            const list = (src === 'shop' ? catalog : items).filter((i) => row.kinds.includes(i.kind));
            return (
              <View key={row.label} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.sub }}>{row.label}</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {SOURCES.map(([k, label]) => (
                      <Pressable key={k} onPress={() => pickSource(row.label, k)} accessibilityRole="button" accessibilityState={{ selected: src === k }}
                        style={[st.chip, src === k && { backgroundColor: C.pink, borderColor: C.pink }]}>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: src === k ? C.wine : C.text }}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {!list.length ? (
                  src === 'shop' && catState === 'error' ? (
                    <Pressable onPress={() => void fetchCatalog(true)} accessibilityRole="button">
                      <Text style={T.small}>Không tải được shop. Chạm để thử lại</Text>
                    </Pressable>
                  ) : (
                    <Text style={T.small}>{src === 'shop' ? (catState === 'loading' ? 'Đang tải shop…' : 'Chưa có sản phẩm') : 'Chưa có món trong tủ'}</Text>
                  )
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {list.map((i) => {
                      const on = pickedIds.includes(i.id);
                      return (
                        <Pressable key={i.id} onPress={() => toggle(i)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={i.name}
                          style={[st.tile, on && { borderColor: C.wine }]}>
                          <Image source={{ uri: imgOf(i) }} style={st.tileImg} resizeMode="contain" />
                          <Text style={{ fontSize: 11, color: C.text }} numberOfLines={1}>{i.name}</Text>
                          {isProduct(i) ? (
                            <>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: C.wine }}>{money(i.price)}</Text>
                              <Text style={st.shopTag}>{i.shop}</Text>
                            </>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
            );
          })}

          {products.length ? (
            <Card style={{ gap: 10 }}>
              <Text style={T.h2}>Món cần mua</Text>
              {products.map((p) => (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Image source={{ uri: imgOf(p) }} style={st.buyImg} resizeMode="contain" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }} numberOfLines={1}>{p.name}</Text>
                    <Text style={T.small}>{money(p.price)} · {p.shop}</Text>
                  </View>
                  <Button title={`Tìm tương tự trên ${p.shop}`} kind="outline" onPress={() => void Linking.openURL(p.shop_url).catch(() => setErr('Không mở được liên kết.'))} />
                </View>
              ))}
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Tổng: {money(total)}</Text>
            </Card>
          ) : null}

          {note ? <Badge text={note} tone="ok" /> : null}
          {err ? <ErrorBox message={err} onRetry={() => void useToday()} /> : null}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Button title="Lưu outfit" kind="outline" disabled={!canGo} onPress={save} style={{ flex: 1 }} />
            <Button title="Dùng cho hôm nay" kind="secondary" disabled={!canTry} loading={busy} onPress={() => void useToday()} style={{ flex: 1 }} />
          </View>
          <Button title="Mặc thử AI" icon="spark" disabled={!canTry} onPress={() => onOpenTryOn(ownIds)} />
          {products.length && !canTry ? <Text style={T.small}>Mặc thử cần ít nhất 2 món trong tủ của bạn</Text> : null}
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
  chip: { paddingHorizontal: 10, minHeight: 28, borderRadius: R.chip, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
  tile: { width: 84, padding: 6, gap: 4, borderRadius: 16, borderWidth: 2, borderColor: 'transparent', backgroundColor: C.pinkSoft, alignItems: 'center' },
  tileImg: { width: 70, height: 70 },
  shopTag: { fontSize: 9, fontWeight: '700', color: C.sub, backgroundColor: C.card, borderRadius: 6, paddingHorizontal: 4, overflow: 'hidden' },
  buyImg: { width: 48, height: 48, backgroundColor: C.pinkSoft, borderRadius: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.gap },
  savedCard: { width: (Math.min(Dimensions.get('window').width, 520) - S.page * 2 - S.gap) / 2, backgroundColor: C.card, borderRadius: R.card, padding: 12 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, height: 150, backgroundColor: C.pinkSoft, borderRadius: 12, padding: 4, overflow: 'hidden' },
  thumb: { width: '47%', height: 68 },
  del: { position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' },
});
