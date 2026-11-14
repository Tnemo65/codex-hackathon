// "Gợi ý mua": shop inventory with AI picks for this wardrobe, filter, and product detail sheet.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { api } from '../api';
import { cachedCatalog, cachedPicks, loadCatalog, loadPicks, queueStudioPick } from '../catalog';
import { C, R, S, T } from '../theme';
import type { Item, Kind, Product, ProductMatch } from '../types';
import { Button, Chip, ErrorBox, Loading, Sheet } from '../ui';
import { ThoughtLine } from './ThoughtLine';

type Filter = 'all' | 'top' | 'bottom' | 'acc';
const FILTERS: { key: Filter; label: string; kinds: Kind[] }[] = [
  { key: 'all', label: 'Tất cả', kinds: [] },
  { key: 'top', label: 'Áo', kinds: ['top', 'outer'] },
  { key: 'bottom', label: 'Quần / váy', kinds: ['bottom', 'dress'] },
  { key: 'acc', label: 'Phụ kiện', kinds: ['shoes', 'bag'] },
];
const GRID_GAP = 10;

const matchCache = new Map<string, ProductMatch>();

const money =(n: number) => `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;

export function ShopCatalog({ items, onOpenStudio }: { items: Item[]; onOpenStudio: () => void }) {
  const [products, setProducts] = useState<Product[]>(cachedCatalog());
  const [picks, setPicks] = useState(cachedPicks());
  const [loadingCatalog, setLoadingCatalog] = useState(cachedCatalog().length === 0);
  const [loadingPicks, setLoadingPicks] = useState(cachedPicks().length === 0);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Product | null>(null);
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(width, 520) - S.page * 2 - 2 * GRID_GAP) / 3);

  const load = useCallback((force: boolean) => {
    setError(null);
    setLoadingCatalog(cachedCatalog().length === 0 || force);
    setLoadingPicks(true);
    Promise.all([loadCatalog(force), loadPicks(force)])
      .then(([p, k]) => { setProducts(p); setPicks(k); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Không tải được gợi ý.'))
      .finally(() => { setLoadingCatalog(false); setLoadingPicks(false); });
  }, []);

  useEffect(() => { load(false); }, [load]);

  const [match, setMatch] = useState<ProductMatch | null>(null);
  const [matchError, setMatchError] = useState(false);
  const openId = open?.id;
  const current = useRef<string | undefined>(undefined);
  const loadMatch = useCallback((id: string) => {
    current.current = id;
    setMatchError(false);
    const hit = matchCache.get(id);
    if (hit) { setMatch(hit); return; }
    setMatch(null);
    api.catalogMatch(id)
      .then((m) => { matchCache.set(id, m); if (current.current === id) setMatch(m); })
      .catch(() => { if (current.current === id) setMatchError(true); });
  }, []);
  useEffect(() => { if (openId) loadMatch(openId); }, [openId, loadMatch]);

  const why = new Map(picks.map((p) => [p.id, p.why]));
  const picked = picks.map((p) => products.find((x) => x.id === p.id)).filter((x): x is Product => !!x);
  const kinds = FILTERS.find((f) => f.key === filter)!.kinds;
  const rest = products.filter((p) => !why.has(p.id) && (filter === 'all' || kinds.includes(p.kind)));

  const grid = (list: Product[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
      {list.map((p) => (
        <Pressable key={p.id} onPress={() => setOpen(p)} accessibilityRole="button" accessibilityLabel={`${p.name}, ${money(p.price)}`}
          style={{ width: tile, backgroundColor: C.pinkSoft, borderRadius: 16, padding: 8, gap: 4 }}>
          <View style={{ height: tile - 40 }}>
            <Image source={{ uri: p.cutout_url ?? p.image_url }} resizeMode="contain" style={{ flex: 1 }} />
            <View style={{ position: 'absolute', top: 0, left: 0, backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: C.wine }}>{p.shop}</Text>
            </View>
          </View>
          <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: C.text, textAlign: 'center' }}>{p.name}</Text>
          <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', color: C.wine, textAlign: 'center' }}>{money(p.price)}</Text>
        </Pressable>
      ))}
    </View>
  );

  const pickedIds = open ? why.get(open.id) : undefined;

  return (
    <>
      {error ? <ErrorBox message={error} onRetry={() => load(true)} /> : null}
      {loadingPicks && !error ? (
        <ThoughtLine title="AI đang chọn đồ từ shop" steps={[
          `Xem ${items.length} món trong tủ của bạn`,
          'Lọc hàng từ Shopee, Lazada, TikTok Shop',
          'Chọn món phối được với đồ bạn có',
        ]} />
      ) : null}
      {loadingCatalog && !error ? <Loading text="Đang tải sản phẩm…" /> : null}

      {picked.length ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={T.h2}>AI chọn cho bạn</Text>
            <Pressable onPress={() => load(true)} disabled={loadingPicks} accessibilityRole="button" accessibilityLabel="Làm mới gợi ý"
              style={{ minHeight: 44, justifyContent: 'center', opacity: loadingPicks ? 0.5 : 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.wine }}>Làm mới gợi ý</Text>
            </Pressable>
          </View>
          {grid(picked)}
        </>
      ) : !loadingPicks && !error && products.length ? (
        <Pressable onPress={() => load(true)} accessibilityRole="button" accessibilityLabel="Làm mới gợi ý" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: C.wine }}>Làm mới gợi ý</Text>
        </Pressable>
      ) : null}

      {products.length ? (
        <>
          <Text style={T.h2}>Tất cả sản phẩm</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {FILTERS.map((f) => <Chip key={f.key} label={f.label} selected={filter === f.key} onPress={() => setFilter(f.key)} />)}
          </View>
          {rest.length ? grid(rest) : <Text style={[T.sub, { textAlign: 'center', padding: 16 }]}>Chưa có sản phẩm ở nhóm này.</Text>}
        </>
      ) : null}

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} subtitle={open ? `${money(open.price)} · ${open.shop}` : undefined}>
        {open ? (
          <>
            <View style={{ height: 220, backgroundColor: C.pinkSoft, borderRadius: R.card, padding: 12 }}>
              <Image source={{ uri: open.cutout_url ?? open.image_url }} resizeMode="contain" style={{ flex: 1 }} accessibilityLabel={open.name} />
            </View>
            <Text style={T.sub}>{[open.color_name, open.material].filter(Boolean).join(' · ')}</Text>
            {pickedIds ? <Text style={{ fontSize: 14, color: C.text }}>{pickedIds}</Text> : null}
            {matchError ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 13, color: C.danger }}>Không tìm được món phối cùng.</Text>
                <Pressable onPress={() => loadMatch(open.id)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: C.wine }}>Thử lại</Text>
                </Pressable>
              </View>
            ) : !match ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator color={C.wine} size="small" />
                <Text style={T.sub}>AI đang tìm món phối cùng…</Text>
              </View>
            ) : (
              <>
                <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Phối với đồ trong tủ của bạn</Text>
                {match.own.map((m) => ({ m, it: items.find((i) => i.id === m.id) })).filter((x) => x.it).length ? (
                  match.own.map((m) => ({ m, it: items.find((i) => i.id === m.id) })).filter((x) => x.it).map(({ m, it }) => (
                    <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 52, height: 52, backgroundColor: C.pinkSoft, borderRadius: 12, padding: 4 }}>
                        <Image source={{ uri: it!.cutout_url ?? it!.image_url }} resizeMode="contain" style={{ flex: 1 }} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 13, color: C.text }}>{m.why}</Text>
                    </View>
                  ))
                ) : <Text style={T.sub}>Hiện chưa có món nào trong tủ phối được với món này</Text>}
                {match.shop.map((m) => products.find((p) => p.id === m.id)).filter((p): p is Product => !!p).length ? (
                  <>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: C.text }}>Phối với món khác trên shop</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      {match.shop.map((m) => products.find((p) => p.id === m.id)).filter((p): p is Product => !!p).map((p) => (
                        <Pressable key={p.id} onPress={() => setOpen(p)} accessibilityRole="button" accessibilityLabel={`${p.name}, ${money(p.price)}`}
                          style={{ width: 84, backgroundColor: C.pinkSoft, borderRadius: 12, padding: 6, gap: 2 }}>
                          <Image source={{ uri: p.cutout_url ?? p.image_url }} resizeMode="contain" style={{ width: 72, height: 64 }} />
                          <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: '700', color: C.wine, textAlign: 'center' }}>{money(p.price)}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </>
                ) : null}
              </>
            )}
            <Button title={`Mua trên ${open.shop}`} onPress={() => { Linking.openURL(open.shop_url).catch(() => {}); }} />
            <Button title="Phối thử với tủ đồ" kind="secondary" onPress={() => { queueStudioPick(open.id); setOpen(null); onOpenStudio(); }} />
          </>
        ) : null}
      </Sheet>
    </>
  );
}
