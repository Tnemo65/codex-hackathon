import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/suggest-outfit`;
const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const TIMEOUT_MS = 30000;

// ponytail: hardcoded wardrobe and weather until photo recognition and a weather API are wired in.
const WARDROBE = [
  'Áo sơ mi trắng',
  'Áo thun đen',
  'Áo len be',
  'Áo khoác jean',
  'Quần tây xám',
  'Quần jean xanh',
  'Chân váy midi đen',
  'Giày sneaker trắng',
  'Giày loafer nâu',
];
const WEATHER = 'Sáng 22°C, chiều 27°C có mưa rào, tối 19°C gió mạnh';
const OCCASION = 'Đi làm văn phòng';

type Outfit = { items: string[]; reason: string; tip: string };

export default function App() {
  const [outfit, setOutfit] = useState<Outfit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suggest() {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: PUBLISHABLE_KEY },
        body: JSON.stringify({ wardrobe: WARDROBE, weather: WEATHER, occasion: OCCASION }),
        signal: controller.signal,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Lỗi máy chủ (${res.status})`);
      setOutfit(body);
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      setError(aborted ? 'Mạng chậm quá, thử lại nhé.' : e instanceof Error ? e.message : 'Có lỗi xảy ra.');
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Hôm nay mặc gì?</Text>
      <Text style={styles.meta}>{WEATHER}</Text>
      <Text style={styles.meta}>{OCCASION}</Text>

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={suggest}
        disabled={loading}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>{outfit || error ? 'Gợi ý bộ khác' : 'Chốt outfit cho tôi'}</Text>
      </Pressable>

      {loading && (
        <View style={styles.row}>
          <ActivityIndicator />
          <Text style={styles.meta}>AI đang chọn đồ...</Text>
        </View>
      )}

      {error && !loading && (
        <View style={styles.card}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={suggest} accessibilityRole="button">
            <Text style={styles.link}>Thử lại</Text>
          </Pressable>
        </View>
      )}

      {outfit && !loading && !error && (
        <View style={styles.card}>
          {outfit.items.map((item) => (
            <Text key={item} style={styles.item}>• {item}</Text>
          ))}
          <Text style={styles.reason}>{outfit.reason}</Text>
          <Text style={styles.tip}>Lời dặn: {outfit.tip}</Text>
        </View>
      )}
      <StatusBar style="auto" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 80, gap: 12, backgroundColor: '#fff', flexGrow: 1 },
  title: { fontSize: 28, fontWeight: '700', color: '#111' },
  meta: { fontSize: 15, color: '#444' },
  button: { backgroundColor: '#111', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 16, gap: 8 },
  item: { fontSize: 17, color: '#111' },
  reason: { fontSize: 15, color: '#333', marginTop: 4 },
  tip: { fontSize: 15, color: '#0b5394' },
  error: { fontSize: 15, color: '#b00020' },
  link: { fontSize: 16, color: '#0b5394', fontWeight: '600', paddingVertical: 8 },
});
