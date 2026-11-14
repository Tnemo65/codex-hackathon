// "Tủ đồ" screen: grid, filter, add-item sheet, and navigation into ReviewItem.
import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { api } from '../api';
import { pickPhoto, takePhoto, type Photo } from '../photo';
import { C, R, S, T } from '../theme';
import { KIND_LABEL, type Item, type Kind } from '../types';
import { BOTTOM_INSET, Button, Card, Chip, ErrorBox, Icon, Loading, Screen, Sheet } from '../ui';
import ReviewItem from './ReviewItem';

export default function Wardrobe({ items, loading, removeBg, onReload, autoAdd, onAutoAddHandled }: { items: Item[]; loading: boolean; removeBg: boolean; onReload: () => Promise<void>; autoAdd: 'camera' | 'library' | null; onAutoAddHandled: () => void }) {
  const [filter, setFilter] = useState<Kind | 'all'>('all');
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ item: Item; isNew: boolean } | null>(null);

  const add = async (picker: () => Promise<Photo | null>) => {
    setSheet(false);
    setError(null);
    try {
      const photo = await picker();
      if (!photo) return;
      setBusy(true);
      const { item } = await api.itemAdd(photo.base64, removeBg);
      await onReload().catch(() => {});
      setReview({ item, isNew: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra.');
    } finally {
      setBusy(false);
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
    return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><Loading text="AI đang đọc ảnh…" /></View>;
  }

  const shown = filter === 'all' ? items : items.filter((i) => i.kind === filter);
  const rows: Item[][] = [];
  for (let i = 0; i < shown.length; i += 2) rows.push(shown.slice(i, i + 2));

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
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: S.gap }}>
            {row.map((it) => (
              <Pressable key={it.id} onPress={() => setReview({ item: it, isNew: false })} accessibilityRole="button" accessibilityLabel={it.name}
                style={{ flex: 1, backgroundColor: C.card, borderRadius: R.card, padding: 10, gap: 6 }}>
                <View style={{ aspectRatio: 1, backgroundColor: C.pinkSoft, borderRadius: R.image, overflow: 'hidden' }}>
                  <Image source={{ uri: it.cutout_url ?? it.image_url }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />
                </View>
                <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '700', color: C.text }}>{it.name}</Text>
                <Text numberOfLines={1} style={T.small}>{[it.category, it.color_name].filter(Boolean).join(' · ')}</Text>
              </Pressable>
            ))}
            {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))}
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
