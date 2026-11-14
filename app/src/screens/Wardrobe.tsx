// "Tủ đồ" screen: grid, filter, add-item sheet, and navigation into ReviewItem.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../api';
import { ThoughtLine } from '../components/ThoughtLine';
import { pickPhoto, takePhoto, type Photo } from '../photo';
import { C, R, S, T } from '../theme';
import { KIND_LABEL, type Item, type Kind } from '../types';
import { BOTTOM_INSET, Button, Card, Chip, ErrorBox, Icon, Loading, Screen, Sheet } from '../ui';
import ReviewItem from './ReviewItem';

// Tile height / width per kind: long pieces stand taller, shoes and bags sit lower.
const TILE_RATIO: Record<Kind, number> = { outer: 1.35, dress: 1.4, bottom: 1.3, top: 1, shoes: 0.75, bag: 0.9 };

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

export default function Wardrobe({ items, loading, removeBg, onReload, autoAdd, onAutoAddHandled }: { items: Item[]; loading: boolean; removeBg: boolean; onReload: () => Promise<void>; autoAdd: 'camera' | 'library' | null; onAutoAddHandled: () => void }) {
  const [filter, setFilter] = useState<Kind | 'all'>('all');
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // uri of the photo AI is reading
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ item: Item; isNew: boolean } | null>(null);

  const add = async (picker: () => Promise<Photo | null>) => {
    setSheet(false);
    setError(null);
    try {
      const photo = await picker();
      if (!photo) return;
      setBusy(photo.uri);
      const { item } = await api.itemAdd(photo.base64, removeBg);
      await onReload().catch(() => {});
      setReview({ item, isNew: true });
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

  if (review) {
    const { item, isNew } = review;
    return (
      <ReviewItem
        item={item}
        isNew={isNew}
        onBack={back}
        onSave={async (patch) => { await api.itemUpdate(item.id, patch); await onReload(); back(); }}
        onDelete={async () => { await api.itemDelete(item.id); await onReload(); back(); }}
      />
    );
  }

  if (busy) {
    // Show the photo being read instead of a blank blocking spinner.
    return (
      <Screen title="Thêm món đồ" subtitle="AI đang đọc ảnh và điền thông tin" scroll={false}>
        <View style={{ flex: 1, backgroundColor: C.pinkSoft, borderRadius: R.card, overflow: 'hidden' }}>
          <Image source={{ uri: busy }} resizeMode="contain" style={{ flex: 1 }} accessibilityLabel="Ảnh món đồ vừa chọn" />
        </View>
        <ThoughtLine title="AI đang đọc ảnh" steps={[
          'Nhận diện món đồ trong ảnh',
          'Đọc loại đồ, màu, chất liệu, họa tiết',
          'Gợi ý dịp mặc và phom dáng',
          removeBg ? 'Lưu ảnh và tách nền' : 'Lưu vào tủ đồ',
        ]} />
      </Screen>
    );
  }

  const shown = filter === 'all' ? items : items.filter((i) => i.kind === filter);
  // Masonry: tile height guessed from the kind (no image size stored), each item goes to the shorter column.
  const cols: Item[][] = [[], []];
  const colH = [0, 0];
  for (const it of shown) {
    const c = colH[0] <= colH[1] ? 0 : 1;
    cols[c].push(it);
    colH[c] += TILE_RATIO[it.kind] + 0.4; // + caption
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Tủ đồ" subtitle={`${items.length} món trong tủ`}>
        {error ? <ErrorBox message={error} onRetry={() => setError(null)} /> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
          <Chip label="Tất cả" selected={filter === 'all'} onPress={() => setFilter('all')} />
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => <Chip key={k} label={KIND_LABEL[k]} selected={filter === k} onPress={() => setFilter(k)} />)}
        </ScrollView>
        {loading && items.length === 0 ? <Loading text="Đang tải tủ đồ…" /> : null}
        {!loading && shown.length === 0 ? (
          <Card style={{ gap: 6, alignItems: 'center', padding: 24 }}>
            <Text style={T.h2}>{items.length === 0 ? 'Thêm món đồ đầu tiên' : 'Chưa có món nào ở nhóm này'}</Text>
            <Text style={[T.sub, { textAlign: 'center' }]}>Chụp một món đồ, AI sẽ tự điền thông tin cho bạn.</Text>
            <Button title="Thêm món" icon="plus" onPress={() => setSheet(true)} style={{ marginTop: 8 }} />
          </Card>
        ) : null}
        {shown.length ? (
          <View key={filter} style={{ flexDirection: 'row', gap: S.gap, alignItems: 'flex-start' }}>
            {cols.map((col, ci) => (
              <View key={ci} style={{ flex: 1, gap: S.gap }}>
                {col.map((it) => (
                  <Rise key={it.id} delay={Math.min(shown.indexOf(it), 10) * 60}>
                    <Pressable onPress={() => setReview({ item: it, isNew: false })} accessibilityRole="button" accessibilityLabel={it.name}
                      style={{ backgroundColor: C.card, borderRadius: R.card, padding: 10, gap: 6 }}>
                      <View style={{ aspectRatio: 1 / TILE_RATIO[it.kind], backgroundColor: C.pinkSoft, borderRadius: R.image, overflow: 'hidden' }}>
                        <Image source={{ uri: it.cutout_url ?? it.image_url }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
                      </View>
                      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{it.name}</Text>
                      <Text numberOfLines={1} style={T.small}>{[it.category, it.color_name].filter(Boolean).join(' · ')}</Text>
                    </Pressable>
                  </Rise>
                ))}
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ height: 70 }} />
      </Screen>
      <Pressable onPress={() => setSheet(true)} accessibilityRole="button" accessibilityLabel="Thêm món"
        style={{ position: 'absolute', right: S.page, bottom: 16 + BOTTOM_INSET, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, borderRadius: 999, backgroundColor: C.wine }}>
        <Icon name="plus" size={18} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Thêm món</Text>
      </Pressable>
      <Sheet visible={sheet} onClose={() => setSheet(false)} title="Thêm món đồ" subtitle="Đặt đồ trên nền trơn, đủ sáng để nhận diện dễ hơn.">
        <Button title="Chụp ảnh" icon="camera" onPress={() => add(takePhoto)} />
        <Button title="Chọn từ thư viện" icon="image" kind="outline" onPress={() => add(pickPhoto)} />
        <Button title="Quay lại tủ đồ" kind="outline" onPress={() => setSheet(false)} />
      </Sheet>
    </View>
  );
}
