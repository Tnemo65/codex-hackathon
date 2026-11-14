// "Tủ đồ" screen: grid, filter, add-item sheet, and navigation into ReviewItem.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { api } from '../api';
import { ShopCatalog } from '../components/ShopCatalog';
import { ThoughtLine } from '../components/ThoughtLine';
import { pickPhoto, takePhoto, type Photo } from '../photo';
import { C, R, S, T } from '../theme';
import { type Detection, type Item, type Kind } from '../types';
import { Banner, Button, Card, ErrorBox, Icon, Loading, Screen, Sheet } from '../ui';
import ReviewItem from './ReviewItem';

type Filter = 'all' | 'top' | 'bottom' | 'acc';
const FILTERS: { key: Filter; label: string; kinds: Kind[] }[] = [
  { key: 'all', label: 'Tất cả', kinds: [] },
  { key: 'top', label: 'Áo', kinds: ['top', 'outer'] },
  { key: 'bottom', label: 'Quần / váy', kinds: ['bottom', 'dress'] },
  { key: 'acc', label: 'Phụ kiện', kinds: ['shoes', 'bag'] },
];
const GRID_GAP = 10;
const KIND_LABEL: Record<Kind, string> = { top: 'Áo', bottom: 'Quần / váy', dress: 'Váy liền', outer: 'Áo khoác', shoes: 'Giày', bag: 'Túi' };

// Tile fades and slides up once, staggered by `delay`.
function Rise({ delay, children }: { delay: number; children: React.ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [a, delay]);
  return (
    <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

export default function Wardrobe({ items, loading, removeBg, onReload, autoAdd, onAutoAddHandled, onOpenProfile, onOpenStudio }: { items: Item[]; loading: boolean; removeBg: boolean; onReload: () => Promise<void>; autoAdd: 'camera' | 'library' | null; onAutoAddHandled: () => void; onOpenProfile: () => void; onOpenStudio: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [tab, setTab] = useState<'mine' | 'shop'>('mine');
  const [query, setQuery] = useState('');
  const { width } = useWindowDimensions();
  const [gridW, setGridW] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState<{ uri: string; mode: 'detect' | 'split'; note?: string } | null>(null); // photo AI is reading
  const [scan, setScan] = useState<{ photo: Photo; detections: Detection[]; picked: boolean[] } | null>(null); // 2+ pieces waiting for confirm
  const [added, setAdded] = useState<string | null>(null);
  const [multiWait, setMultiWait] = useState<string[]>([]); // ids of items added from one photo still waiting for their cut-out
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ item: Item; isNew: boolean } | null>(null);
  const [cut, setCut] = useState<{ id: string; url: string | null } | null>(null); // new item and its cut-out once ready

  // The server cuts the background out after it has answered (about 10 s), so ask again until the cut-out is there.
  const waitingId = cut && !cut.url ? cut.id : null;
  useEffect(() => {
    if (!waitingId) return;
    let tries = 0;
    let live = true;
    const iv = setInterval(async () => {
      tries += 1;
      const url = await api.itemsList().then((r) => r.items.find((i) => i.id === waitingId)?.cutout_url ?? null).catch(() => null);
      if (!live) return;
      if (url) { setCut({ id: waitingId, url }); onReload().catch(() => {}); }
      else if (tries >= 12) setCut(null);
    }, 4000);
    return () => { live = false; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingId]);

  const multiKey = multiWait.join(',');
  useEffect(() => {
    if (!multiKey) return;
    let tries = 0;
    let live = true;
    const iv = setInterval(async () => {
      tries += 1;
      const list = await api.itemsList().then((r) => r.items).catch(() => null);
      if (!live) return;
      if (list) {
        const left = multiKey.split(',').filter((id) => !list.find((i) => i.id === id)?.cutout_url);
        if (left.length < multiKey.split(',').length) onReload().catch(() => {});
        if (left.length === 0) { setMultiWait([]); return; }
        if (tries < 15) { if (left.join(',') !== multiKey) setMultiWait(left); return; }
      } else if (tries < 15) return;
      setMultiWait([]);
    }, 4000);
    return () => { live = false; clearInterval(iv); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [multiKey]);

  const add = async (picker: () => Promise<Photo | null>) => {
    setSheet(false);
    setError(null);
    try {
      const photo = await picker();
      if (!photo) return;
      setAdded(null);
      setBusy({ uri: photo.uri, mode: 'detect' });
      const { detections } = await api.itemsDetect(photo.base64);
      if (detections.length > 1) {
        setScan({ photo, detections, picked: detections.map(() => true) });
        return;
      }
      const { item } = await api.itemAdd(photo.base64, removeBg);
      await onReload().catch(() => {});
      setReview({ item, isNew: true });
      if (removeBg && !item.cutout_url) setCut({ id: item.id, url: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra.');
    } finally {
      setBusy(null);
    }
  };

  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!autoAdd || handled.current === autoAdd) return;
    handled.current = autoAdd;
    add(autoAdd === 'camera' ? takePhoto : pickPhoto).finally(() => { handled.current = null; onAutoAddHandled(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAdd]);

  const back = () => setReview(null);

  const addPicked = async () => {
    if (!scan) return;
    const { photo, detections, picked } = scan;
    setError(null);
    setBusy({ uri: photo.uri, mode: 'split' });
    try {
      const { items: created } = await api.itemsAddMany(photo.base64, detections.filter((_, i) => picked[i]), removeBg);
      // Wait for the cut-outs here, on the waiting screen (about 10-15 s), so the wardrobe opens complete
      // instead of saying "added" and then making the user wait again.
      let pending = removeBg ? created.filter((i) => !i.cutout_url).map((i) => i.id) : [];
      const total = pending.length;
      for (let tries = 0; pending.length && tries < 15; tries++) {
        setBusy({ uri: photo.uri, mode: 'split', note: `Đã tách nền ${total - pending.length}/${total} món` });
        await new Promise((r) => setTimeout(r, 3000));
        const list = await api.itemsList().then((r) => r.items).catch(() => null);
        if (list) pending = pending.filter((id) => !list.find((i) => i.id === id)?.cutout_url);
      }
      await onReload().catch(() => {});
      setScan(null);
      setAdded(pending.length ? `Đã thêm ${created.length} món · còn ${pending.length} ảnh đang tách nền` : `Đã thêm ${created.length} món`);
      if (pending.length) setMultiWait(pending);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra.');
    } finally {
      setBusy(null);
    }
  };

  if (review) {
    const { item, isNew } = review;
    return (
      <ReviewItem
        item={item}
        isNew={isNew}
        cutout={cut?.id === item.id ? cut.url : null}
        cutting={cut?.id === item.id && !cut.url}
        onBack={back}
        onSave={async (patch) => { await api.itemUpdate(item.id, patch); await onReload(); back(); }}
        onDelete={async () => { await api.itemDelete(item.id); await onReload(); back(); }}
      />
    );
  }

  if (busy) {
    // Show the photo being read instead of a blank blocking spinner.
    const split = busy.mode === 'split';
    return (
      <Screen title="Thêm món đồ" subtitle={split ? 'AI đang tách từng món từ ảnh' : 'AI đang nhận diện món đồ trong ảnh'} scroll={false}>
        <View style={{ flex: 1, backgroundColor: C.pinkSoft, borderRadius: R.card, overflow: 'hidden' }}>
          <Image source={{ uri: busy.uri }} resizeMode="contain" style={{ flex: 1 }} accessibilityLabel="Ảnh món đồ vừa chọn" />
        </View>
        {split ? (
          <>
            <ThoughtLine title="AI đang tách từng món" steps={['Lưu ảnh gốc', 'Tách từng món khỏi ảnh', 'Lưu vào tủ đồ', 'Tách nền từng món']} />
            {busy.note ? <Text style={[T.sub, { textAlign: 'center' }]}>{busy.note}</Text> : null}
          </>
        ) : (
          <ThoughtLine title="AI đang nhận diện" steps={[
            'Tìm từng món trong ảnh',
            'Đọc loại, màu, chất liệu từng món',
            'Gộp món trùng',
          ]} />
        )}
      </Screen>
    );
  }

  if (scan) {
    const { photo, detections, picked } = scan;
    const k = picked.filter(Boolean).length;
    const toggle = (idx: number) => setScan({ ...scan, picked: picked.map((v, i) => (i === idx ? !v : v)) });
    return (
      <Screen title="Kiểm tra món đồ" subtitle={`${detections.length} món từ 1 ảnh`}
        onBack={() => setScan(null)}
        footer={(
          <View style={{ gap: 8 }}>
            <Button title={`Thêm ${k} món`} disabled={k === 0} onPress={addPicked} />
            <Button title="Chụp lại" kind="outline" onPress={() => setScan(null)} />
          </View>
        )}>
        {error ? <ErrorBox message={error} onRetry={addPicked} /> : null}
        <View style={{ height: 120, backgroundColor: C.pinkSoft, borderRadius: R.card, overflow: 'hidden' }}>
          <Image source={{ uri: photo.uri }} resizeMode="contain" style={{ flex: 1 }} accessibilityLabel="Ảnh gốc" />
        </View>
        {detections.map((d, idx) => (
          <Pressable key={idx} onPress={() => toggle(idx)} accessibilityRole="checkbox" accessibilityState={{ checked: picked[idx] }} accessibilityLabel={d.name}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 8, backgroundColor: C.card, borderRadius: R.card, borderWidth: 1, borderColor: C.line }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="hanger" size={22} color={C.wine} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{d.name}</Text>
              <Text numberOfLines={1} style={T.sub}>{`${KIND_LABEL[d.kind] ?? d.kind} · Độ chính xác ${Math.round(d.confidence)}%`}</Text>
            </View>
            <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: picked[idx] ? C.wine : 'transparent', borderWidth: 2, borderColor: picked[idx] ? C.wine : C.line }}>
              {picked[idx] ? <Icon name="check" size={16} color="#FFFFFF" /> : null}
            </View>
          </Pressable>
        ))}
      </Screen>
    );
  }

  const kinds = FILTERS.find((f) => f.key === filter)!.kinds;
  const q = query.trim().toLowerCase();
  const shown = items.filter((i) => (filter === 'all' || kinds.includes(i.kind))
    && (!q || [i.name, i.category, i.color_name].some((v) => v?.toLowerCase().includes(q))));
  // Measured grid width (a web scrollbar or safe-area makes it narrower than the window), so 3 tiles always fit and fill the row.
  const tile = Math.floor(((gridW || Math.min(width, 520) - S.page * 2) - 2 * GRID_GAP) / 3);

  return (
    <>
      <Screen title="Tủ đồ" subtitle={`${items.length} món`}
        right={(
          <Pressable onPress={onOpenProfile} accessibilityRole="button" accessibilityLabel="Hồ sơ"
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="user" size={20} color={C.wine} />
          </Pressable>
        )}
        footer={tab === 'mine' ? <Button title="Thêm đồ" onPress={() => setSheet(true)} /> : undefined}>
        <View style={{ flexDirection: 'row', height: 44, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: R.chip, overflow: 'hidden' }}>
          {([['mine', 'Tủ của tôi'], ['shop', 'Gợi ý mua']] as const).map(([k, label]) => (
            <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="button" accessibilityState={{ selected: tab === k }}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === k ? C.pink : 'transparent' }}>
              <Text style={{ fontSize: 14, fontWeight: tab === k ? '700' : '500', color: tab === k ? C.wine : C.text }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {tab === 'shop' ? <ShopCatalog items={items} onOpenStudio={onOpenStudio} /> : (
          <>
            {error ? <ErrorBox message={error} onRetry={() => setError(null)} /> : null}
            {added ? <Banner text={added} /> : null}
            <TextInput value={query} onChangeText={setQuery} placeholder="Tìm trong tủ đồ" placeholderTextColor={C.sub}
              accessibilityLabel="Tìm trong tủ đồ" autoCorrect={false}
              style={{ height: 46, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: R.chip + 2, paddingHorizontal: 16, fontSize: 15, color: C.text }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {FILTERS.map((f) => (
                <Pressable key={f.key} onPress={() => setFilter(f.key)} accessibilityRole="button" accessibilityState={{ selected: filter === f.key }}
                  style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: R.chip, borderWidth: 1,
                    backgroundColor: filter === f.key ? C.pink : C.card, borderColor: filter === f.key ? C.pink : C.line }}>
                  <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: filter === f.key ? '700' : '500', color: filter === f.key ? C.wine : C.text }}>{f.label}</Text>
                </Pressable>
              ))}
            </View>
            {loading && items.length === 0 ? <Loading text="Đang tải tủ đồ…" /> : null}
            {!loading && shown.length === 0 ? (
              <Card style={{ gap: 6, alignItems: 'center', padding: 24 }}>
                <Text style={T.h2}>{items.length === 0 ? 'Thêm món đồ đầu tiên' : 'Chưa có món nào ở nhóm này'}</Text>
                <Text style={[T.sub, { textAlign: 'center' }]}>Chụp một món đồ, AI sẽ tự điền thông tin cho bạn.</Text>
              </Card>
            ) : null}
            {shown.length ? (
              <View key={filter + q} onLayout={(e) => setGridW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
                {shown.map((it, idx) => (
                  <Rise key={it.id} delay={Math.min(idx, 10) * 60}>
                    <Pressable onPress={() => setReview({ item: it, isNew: false })} accessibilityRole="button" accessibilityLabel={it.name}
                      style={{ width: tile, height: tile, backgroundColor: C.pinkSoft, borderRadius: 16, padding: 8, gap: 4 }}>
                      <Image source={{ uri: it.cutout_url ?? it.image_url }} resizeMode="contain" style={{ flex: 1 }} />
                      <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: C.text, textAlign: 'center' }}>{it.name}</Text>
                    </Pressable>
                  </Rise>
                ))}
              </View>
            ) : null}
          </>
        )}
      </Screen>
      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Thêm món đồ" subtitle="Đặt đồ trên nền trơn, đủ sáng để nhận diện dễ hơn.">
        <Button title="Chụp ảnh" icon="camera" onPress={() => add(takePhoto)} />
        <Button title="Chọn từ thư viện" icon="image" kind="outline" onPress={() => add(pickPhoto)} />
        <Button title="Quay lại tủ đồ" kind="outline" onPress={() => setSheet(false)} />
      </Sheet>
    </>
  );
}
