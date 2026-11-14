// "Gợi ý mua": AI looks at the wardrobe + profile and names pieces that are missing; each card opens shop searches.
import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { api } from '../api';
import type { Item, ShopSuggestion } from '../types';
import { C, R, S, T } from '../theme';
import { Badge, Button, Card, ErrorBox } from '../ui';
import { ThoughtLine } from './ThoughtLine';

const KIND_LABEL: Record<string, string> = { top: 'Áo', bottom: 'Quần, váy', dress: 'Váy liền', outer: 'Áo khoác', shoes: 'Giày', bag: 'Túi' };
const SHOPS = [
  { name: 'Shopee', url: 'https://shopee.vn/search?keyword=' },
  { name: 'TikTok Shop', url: 'https://www.tiktok.com/search?q=' },
  { name: 'Lazada', url: 'https://www.lazada.vn/catalog/?q=' },
];

// Survives tab switches so the AI is not called again until "Gợi ý lại".
let cache: ShopSuggestion[] | null = null;

export function ShopSuggestions({ items }: { items: Item[] }) {
  const [list, setList] = useState<ShopSuggestion[] | null>(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      cache = (await api.shopSuggest()).suggestions;
      setList(cache);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!cache) load(); }, [load]);

  if (loading) {
    return (
      <View style={{ gap: S.gap }}>
        <ThoughtLine title="AI đang xem tủ đồ" steps={[`Xem ${items.length} món bạn đang có`, 'Tìm món còn thiếu để phối thêm bộ', 'Chọn món hợp gu và công việc của bạn']} />
      </View>
    );
  }

  return (
    <View style={{ gap: S.gap }}>
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {(list ?? []).map((s, i) => (
        <Card key={i} style={{ gap: 8 }}>
          <Badge text={KIND_LABEL[s.kind] ?? s.kind} />
          <Text style={{ fontSize: 16, fontWeight: '700', color: C.text }}>{s.name}</Text>
          <Text style={T.sub}>{[s.color_name, s.price_hint].filter(Boolean).join(' · ')}</Text>
          <Text style={T.body}>{s.why}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            {SHOPS.map((shop) => (
              <Pressable
                key={shop.name}
                onPress={() => Linking.openURL(shop.url + encodeURIComponent(s.query)).catch(() => {})}
                accessibilityRole="link"
                accessibilityLabel={`Tìm ${s.name} trên ${shop.name}`}
                style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: R.button, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.wine }}>{shop.name}</Text>
              </Pressable>
            ))}
          </View>
        </Card>
      ))}
      {list && !error ? <Button title="Gợi ý lại" kind="secondary" icon="spark" onPress={load} /> : null}
      {list ? <Text style={[T.small, { textAlign: 'center' }]}>Liên kết mở trang tìm kiếm của shop, app không nhận hoa hồng.</Text> : null}
    </View>
  );
}
