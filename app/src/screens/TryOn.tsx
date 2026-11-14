// "Mặc thử AI": body photo + chosen garments -> one AI illustration of the user wearing them.
// Talks only to the separate `tryon` Edge Function (background job + polling).
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { post } from '../api';
import { pickPhoto, takePhoto, type Photo } from '../photo';
import { C, R, T } from '../theme';
import type { Item, Profile } from '../types';
import { Badge, Button, Card, ErrorBox, Icon, Screen } from '../ui';

// Set to true once the flow works end to end; App hides the entry point while false.
export const TRYON_READY = false;

const TRYON_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/tryon`;
const MAX_GARMENTS = 5;
const POLL_MS = 3000;
const MAX_WAIT_MS = 180000;

type Step = 'setup' | 'check' | 'pick' | 'generating' | 'result' | 'failed';
type StatusRes = { status: 'pending' | 'done' | 'failed'; image_url: string | null; error: string | null };

// Session memory: consent given, and whether the server already holds this user's body photo.
let consentGiven = false;
let bodyOnServer = false;

export default function TryOn({ items, initialItemIds, onBack, onUseToday }: { items: Item[]; profile: Profile; initialItemIds: string[]; onBack: () => void; onUseToday: (itemIds: string[]) => void }) {
  const [step, setStep] = useState<Step>(bodyOnServer ? 'pick' : 'setup');
  const [consent, setConsent] = useState(consentGiven);
  const [draft, setDraft] = useState<Photo | null>(null); // photo being checked
  const [body, setBody] = useState<Photo | null>(null); // accepted photo, not yet uploaded
  const [selected, setSelected] = useState<string[]>(() => initialItemIds.filter((id) => items.some((i) => i.id === id)).slice(0, MAX_GARMENTS));
  const [extras, setExtras] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const runRef = useRef(0); // increments to cancel an ongoing poll

  const count = selected.length + extras.length;
  const full = count >= MAX_GARMENTS;

  useEffect(() => () => { runRef.current++; }, []);

  async function getPhoto(source: 'library' | 'camera') {
    setError(null);
    try {
      const p = source === 'camera' ? await takePhoto() : await pickPhoto();
      if (p) {
        setDraft(p);
        setStep('check');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không mở được ảnh.');
    }
  }

  async function addExtra() {
    if (full) return;
    setError(null);
    try {
      const p = await pickPhoto();
      if (p) setExtras((x) => [...x, p].slice(0, MAX_GARMENTS));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không mở được ảnh.');
    }
  }

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length + extras.length >= MAX_GARMENTS ? s : [...s, id]));
  }

  async function generate() {
    const run = ++runRef.current;
    setError(null);
    setImageUrl(null);
    setElapsed(0);
    setBusy(true);
    setStep('generating');
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    try {
      const { job_id } = await post<{ job_id: string }>(TRYON_URL, 'tryon.create', {
        item_ids: selected,
        body_image_base64: body ? body.base64 : null,
        item_images_base64: extras.map((p) => p.base64),
      }, 90000);
      if (body) {
        bodyOnServer = true;
        setBody(null);
      }
      while (runRef.current === run) {
        if (Date.now() - started > MAX_WAIT_MS) throw new Error('Tạo ảnh quá lâu. Thử lại với ít món hơn nhé.');
        await new Promise((r) => setTimeout(r, POLL_MS));
        if (runRef.current !== run) return;
        const res = await post<StatusRes>(TRYON_URL, 'tryon.status', { job_id }, 20000).catch(() => null);
        if (!res || res.status === 'pending') continue;
        if (res.status === 'done' && res.image_url) {
          setImageUrl(res.image_url);
          setStep('result');
          return;
        }
        throw new Error(res.error ?? 'AI tạm thời không tạo được ảnh, thử lại sau nhé.');
      }
    } catch (e) {
      if (runRef.current !== run) return;
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra.');
      setStep('failed');
    } finally {
      clearInterval(tick);
      if (runRef.current === run) setBusy(false);
    }
  }

  function cancel() {
    runRef.current++;
    setBusy(false);
    setStep('pick');
  }

  const chosenItems = selected.map((id) => items.find((i) => i.id === id)).filter((i): i is Item => !!i);

  // ---------- 1. Thiết lập dáng người ----------
  if (step === 'setup') {
    return (
      <Screen title="Thiết lập dáng người" subtitle="Dùng để minh hoạ độ dài và phom đồ khi mặc." onBack={onBack}
        footer={consent ? (
          <>
            <Button title="Tải ảnh toàn thân" icon="image" onPress={() => getPhoto('library')} />
            <Button title="Chụp ảnh toàn thân" icon="camera" kind="outline" onPress={() => getPhoto('camera')} />
          </>
        ) : (
          <Button title="Đồng ý và tiếp tục" onPress={() => { consentGiven = true; setConsent(true); }} />
        )}>
        <View style={st.hero}>
          <Icon name="person" size={72} color={C.wine} />
        </View>
        <Card style={{ gap: 4 }}>
          <Text style={st.cardTitle}>Dùng ảnh toàn thân</Text>
          <Text style={T.sub}>Đứng thẳng, đủ sáng, thấy từ đầu đến chân. Mặc đồ gọn để AI thấy rõ dáng người.</Text>
        </Card>
        {!consent ? (
          <Card style={{ gap: 6, borderWidth: 1, borderColor: C.pink }}>
            <Text style={st.cardTitle}>Trước khi tải ảnh</Text>
            <Text style={T.body}>Ảnh toàn thân được gửi tới dịch vụ AI ở nước ngoài để tạo ảnh phối. Chỉ bạn xem được ảnh này.</Text>
          </Card>
        ) : null}
        {error ? <ErrorBox message={error} /> : null}
      </Screen>
    );
  }

  // ---------- 2. Kiểm tra ảnh ----------
  if (step === 'check' && draft) {
    return (
      <Screen title="Kiểm tra ảnh" subtitle="Thấy rõ từ đầu đến chân là đạt." onBack={() => setStep('setup')}
        footer={(
          <>
            <Button title="Dùng ảnh này" onPress={() => { setBody(draft); bodyOnServer = false; setStep('pick'); }} />
            <Button title="Chọn ảnh khác" kind="outline" onPress={() => getPhoto('library')} />
          </>
        )}>
        <View style={st.photoBox}>
          <Image source={{ uri: draft.uri }} style={st.photo} resizeMode="contain" />
        </View>
        <Text style={T.sub}>Ảnh sẽ được dùng làm tham chiếu dáng người.</Text>
        {error ? <ErrorBox message={error} /> : null}
      </Screen>
    );
  }

  // ---------- 4. Đang tạo ảnh phối ----------
  if (step === 'generating') {
    return (
      <Screen title="Đang tạo ảnh phối" subtitle="AI ghép các món và mô phỏng độ rủ vải." onBack={cancel}
        footer={<Button title="Huỷ" kind="outline" onPress={cancel} />}>
        <View style={[st.hero, { height: 300, gap: 14 }]}>
          <Icon name="spark" size={40} color={C.wine} />
          <Text style={st.cardTitle}>Đang dựng bản phối</Text>
          <ActivityIndicator color={C.wine} />
          <Text style={T.sub}>{elapsed} giây</Text>
        </View>
        <Text style={T.sub}>Thường mất khoảng 1 đến 2 phút. Bạn có thể giữ màn hình này mở.</Text>
      </Screen>
    );
  }

  // ---------- 5. Ảnh phối của bạn ----------
  if (step === 'result' && imageUrl) {
    return (
      <Screen title="Ảnh phối của bạn" subtitle="Minh hoạ AI" onBack={() => setStep('pick')}
        footer={(
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title="Thử bộ khác" kind="outline" style={{ flex: 1 }} onPress={() => setStep('pick')} />
              <Button title="Dùng cho hôm nay" style={{ flex: 1 }} disabled={!selected.length} onPress={() => onUseToday(selected)} />
            </View>
            <Button title="Cập nhật dáng người" kind="outline" onPress={() => setStep('setup')} />
          </>
        )}>
        <View style={st.photoBox}>
          <Image source={{ uri: imageUrl }} style={st.photo} resizeMode="contain" accessibilityLabel="Ảnh phối do AI minh hoạ" />
          <View style={st.badge}><Badge text="Minh hoạ AI" /></View>
        </View>
        <Text style={T.h2}>Các món trong ảnh</Text>
        <View style={st.list}>
          {chosenItems.map((it) => (
            <View key={it.id} style={st.listRow}>
              <Image source={{ uri: it.cutout_url ?? it.image_url }} style={st.thumb} resizeMode="contain" />
              <Text style={[T.body, { flex: 1 }]} numberOfLines={1}>{it.name}</Text>
            </View>
          ))}
          {extras.map((p, i) => (
            <View key={p.uri} style={st.listRow}>
              <Image source={{ uri: p.uri }} style={st.thumb} resizeMode="cover" />
              <Text style={[T.body, { flex: 1 }]}>Món tải lên {i + 1}</Text>
            </View>
          ))}
        </View>
        <Text style={T.small}>Ảnh do AI tạo để minh hoạ, độ vừa vặn thực tế có thể khác.</Text>
      </Screen>
    );
  }

  // ---------- Failure ----------
  if (step === 'failed') {
    return (
      <Screen title="Chưa tạo được ảnh" onBack={() => setStep('pick')}
        footer={<Button title="Chọn lại món" kind="outline" onPress={() => setStep('pick')} />}>
        <ErrorBox message={error ?? 'Có lỗi xảy ra.'} onRetry={generate} />
      </Screen>
    );
  }

  // ---------- 3. Chọn đồ để phối ----------
  return (
    <Screen title="Chọn đồ để phối" subtitle={`Chọn 2 đến ${MAX_GARMENTS} món, hoặc tải thêm ảnh món đồ.`} onBack={onBack}
      footer={(
        <>
          <Text style={T.sub}>{count} món đã chọn</Text>
          <Button title="Tạo ảnh phối" icon="spark" disabled={count < 2} loading={busy} onPress={generate} />
          {!body && !bodyOnServer ? <Button title="Tải ảnh toàn thân" kind="outline" onPress={() => setStep('setup')} /> : null}
        </>
      )}>
      {body ? (
        <Pressable onPress={() => setStep('setup')} accessibilityRole="button" accessibilityLabel="Đổi ảnh toàn thân" style={st.bodyRow}>
          <Image source={{ uri: body.uri }} style={st.bodyThumb} resizeMode="cover" />
          <Text style={[T.sub, { flex: 1 }]}>Ảnh toàn thân đã chọn. Chạm để đổi.</Text>
        </Pressable>
      ) : null}
      <View style={st.grid}>
        {items.map((it) => {
          const on = selected.includes(it.id);
          const locked = !on && full;
          return (
            <Pressable key={it.id} onPress={() => toggle(it.id)} disabled={locked}
              accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: locked }} accessibilityLabel={it.name}
              style={[st.tile, on && st.tileOn, locked && { opacity: 0.45 }]}>
              <Image source={{ uri: it.cutout_url ?? it.image_url }} style={st.tileImg} resizeMode="contain" />
              <Text style={st.tileName} numberOfLines={1}>{it.name}</Text>
              {on ? <View style={st.check}><Icon name="check" size={14} color="#fff" /></View> : null}
            </Pressable>
          );
        })}
        {extras.map((p) => (
          <Pressable key={p.uri} onPress={() => setExtras((x) => x.filter((e) => e.uri !== p.uri))}
            accessibilityRole="button" accessibilityLabel="Bỏ món tải lên" style={[st.tile, st.tileOn]}>
            <Image source={{ uri: p.uri }} style={st.tileImg} resizeMode="cover" />
            <Text style={st.tileName} numberOfLines={1}>Món tải lên</Text>
            <View style={st.check}><Icon name="close" size={14} color="#fff" /></View>
          </Pressable>
        ))}
        <Pressable onPress={addExtra} disabled={full} accessibilityRole="button" accessibilityLabel="Tải ảnh món đồ"
          style={[st.tile, st.addTile, full && { opacity: 0.45 }]}>
          <Icon name="plus" size={26} color={C.wine} />
          <Text style={[st.tileName, { color: C.wine }]}>Tải ảnh món đồ</Text>
        </Pressable>
      </View>
      {error ? <ErrorBox message={error} /> : null}
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { height: 220, borderRadius: R.image, backgroundColor: C.pinkSoft, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  photoBox: { width: '100%', aspectRatio: 2 / 3, borderRadius: R.image, backgroundColor: C.pinkSoft, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  badge: { position: 'absolute', top: 12, left: 12 },
  list: { gap: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 8, minHeight: 56 },
  thumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: C.pinkSoft },
  bodyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 8, minHeight: 56 },
  bodyThumb: { width: 40, height: 56, borderRadius: 8, backgroundColor: C.pinkSoft },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  tile: { width: '48%', minHeight: 150, borderRadius: 16, backgroundColor: C.card, padding: 10, borderWidth: 2, borderColor: C.card, alignItems: 'center', gap: 6 },
  tileOn: { borderColor: C.wine },
  tileImg: { width: '100%', height: 110, borderRadius: 12 },
  tileName: { fontSize: 12, fontWeight: '600', color: C.text, textAlign: 'center' },
  check: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center' },
  addTile: { backgroundColor: C.pink, borderColor: C.pink, justifyContent: 'center' },
});
