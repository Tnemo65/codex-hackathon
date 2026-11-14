// "Stylist" tab: full-screen chat with the AI stylist about today's outfit (real outfit.edit backend).
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, todayStr } from '../api';
import { C, R, S, T } from '../theme';
import type { Item, Plan, Profile } from '../types';
import { Button, Chip, Icon, Screen } from '../ui';

type Msg =
  | { id: number; kind: 'stylist' | 'user'; text: string }
  | { id: number; kind: 'outfit'; name: string; ids: string[] }
  | { id: number; kind: 'error'; text: string; retryText: string };

const QUICK = ['Đổi giày', 'Ấm hơn', 'Thanh lịch hơn', 'Đổi cả bộ'];
const GREETING: Msg = { id: 1, kind: 'stylist', text: 'Chào bạn! Mình là Stylist. Bạn muốn chỉnh gì ở outfit hôm nay?' };

// Chat history survives tab switches.
let history: Msg[] = [GREETING];
let nextId = 2;

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Có lỗi xảy ra.');

function Thumbs({ ids, byId, size }: { ids: string[]; byId: Map<string, Item>; size: number }) {
  const list = ids.map((id) => byId.get(id)).filter((i): i is Item => !!i);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {list.map((i) => (
        <Image key={i.id} source={{ uri: i.cutout_url ?? i.image_url }} resizeMode="contain" accessibilityLabel={i.name}
          style={{ width: size, height: size, borderRadius: 12, backgroundColor: C.pinkSoft }} />
      ))}
    </View>
  );
}

export default function Stylist({ items, profile, onOpenTryOn, onPlanChanged, onOpenProfile }: {
  items: Item[]; profile: Profile; onOpenTryOn: (itemIds: string[]) => void; onPlanChanged: () => void; onOpenProfile: () => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>(history);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const byId = new Map(items.map((i) => [i.id, i]));
  const outfit = plan?.outfit ?? null;

  function push(m: Msg) { history = [...history, m]; setMsgs(history); }
  function drop(id: number) { history = history.filter((m) => m.id !== id); setMsgs(history); }

  useEffect(() => {
    let alive = true;
    api.planGet(todayStr()).then((r) => { if (alive) setPlan(r.plan); }).catch(() => {}).finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  async function send(raw: string, addUser = true) {
    const q = raw.trim().slice(0, 300);
    if (!q || busy) return;
    if (addUser) push({ id: nextId++, kind: 'user', text: q });
    setText(''); setBusy(true);
    try {
      const { plan: p, message } = await api.outfitEdit(todayStr(), q);
      setPlan(p);
      push({ id: nextId++, kind: 'stylist', text: message });
      if (p.outfit) push({ id: nextId++, kind: 'outfit', name: p.outfit.name, ids: p.outfit.item_ids });
    } catch (e) {
      push({ id: nextId++, kind: 'error', text: errText(e), retryText: q });
    } finally { setBusy(false); }
  }

  const avatar = (
    <Pressable onPress={onOpenProfile} accessibilityRole="button" accessibilityLabel={`Hồ sơ của ${profile.name ?? 'bạn'}`} style={st.avatar}>
      <Icon name="user" size={22} color={C.wine} />
    </Pressable>
  );

  const canSend = !busy && !!text.trim();

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen title="Stylist" subtitle="Outfit hôm nay" right={avatar} scroll={false}>
        <View style={st.outfitCard}>
          {!loaded ? <ActivityIndicator color={C.wine} /> : outfit ? (
            <>
              <Text style={[T.h2, { fontSize: 16 }]} numberOfLines={1}>{outfit.name}</Text>
              <Thumbs ids={outfit.item_ids} byId={byId} size={48} />
            </>
          ) : (
            <Text style={T.sub}>Chưa có outfit hôm nay — mở tab Hôm nay để AI gợi ý</Text>
          )}
        </View>

        <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ gap: S.gap, paddingBottom: 8 }} keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}>
          {msgs.map((m) => {
            if (m.kind === 'user') return <View key={m.id} style={[st.bubble, st.user]}><Text style={[T.body, { fontWeight: '600' }]}>{m.text}</Text></View>;
            if (m.kind === 'stylist') return <View key={m.id} style={[st.bubble, st.bot]}><Text style={[T.body, { lineHeight: 21 }]}>{m.text}</Text></View>;
            if (m.kind === 'error') {
              return (
                <View key={m.id} style={[st.bubble, st.bot, { gap: 10 }]}>
                  <Text style={{ fontSize: 14, color: C.danger }}>{m.text}</Text>
                  <Button title="Thử lại" kind="outline" disabled={busy} onPress={() => { drop(m.id); void send(m.retryText, false); }} />
                </View>
              );
            }
            if (m.kind !== 'outfit') return null;
            return (
              <View key={m.id} style={[st.bubble, st.bot, { gap: 10, width: '100%' }]}>
                <Text style={T.h2}>{m.name}</Text>
                <Thumbs ids={m.ids} byId={byId} size={64} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Mặc thử AI" kind="secondary" icon="spark" onPress={() => onOpenTryOn(m.ids)} style={{ flex: 1, paddingHorizontal: 8 }} />
                  <Button title="Xem ở Hôm nay" kind="outline" onPress={onPlanChanged} style={{ flex: 1, paddingHorizontal: 8 }} />
                </View>
              </View>
            );
          })}
          {busy ? (
            <View style={[st.bubble, st.bot, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
              <ActivityIndicator color={C.wine} /><Text style={T.sub}>Stylist đang nghĩ…</Text>
            </View>
          ) : null}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
          {QUICK.map((q) => <Chip key={q} label={q} onPress={() => void send(q)} />)}
        </ScrollView>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 12 }}>
          <View style={st.input}>
            <Icon name="chat" size={18} color={C.sub} />
            <TextInput
              value={text} onChangeText={setText} maxLength={300} placeholder="Nhắn Stylist…" placeholderTextColor={C.sub}
              returnKeyType="send" onSubmitEditing={() => void send(text)} editable={!busy} accessibilityLabel="Nhắn Stylist"
              style={{ flex: 1, fontSize: 15, color: C.text, paddingVertical: 10 }}
            />
          </View>
          <Pressable onPress={() => void send(text)} disabled={!canSend} accessibilityRole="button" accessibilityLabel="Gửi"
            style={[st.send, { opacity: canSend ? 1 : 0.5 }]}>
            <Icon name="send" size={20} color="#fff" />
          </Pressable>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center' },
  outfitCard: { backgroundColor: C.card, borderRadius: R.card, padding: 12, gap: 8, minHeight: 48, justifyContent: 'center' },
  bubble: { maxWidth: '85%', borderRadius: R.card, paddingHorizontal: 16, paddingVertical: 12 },
  bot: { alignSelf: 'flex-start', backgroundColor: C.card },
  user: { alignSelf: 'flex-end', backgroundColor: C.pink },
  input: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, backgroundColor: C.card, borderRadius: R.button, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12 },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center' },
});
