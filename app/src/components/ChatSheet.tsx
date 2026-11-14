// "Đổi outfit bằng lời" bottom sheet (F4): quick chips or free text, AI edits the selected outfit of that date.
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { api, dateLabel } from '../api';
import { C, R, T } from '../theme';
import type { Plan } from '../types';
import { Button, Chip, Icon, Sheet } from '../ui';

const QUICK = ['Đổi giày tối màu', 'Lịch sự hơn', 'Thêm áo khoác', 'Đổi cả bộ'];

export function ChatSheet({ visible, date, onClose, onEdited }: { visible: boolean; date: string; onClose: () => void; onEdited: (plan: Plan, message: string) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kb, setKb] = useState(0);
  const last = useRef('');

  useEffect(() => { if (visible) { setReply(null); setErr(null); } }, [visible, date]);

  // Sheet has no keyboard handling; on iOS lift the content above the keyboard.
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const a = Keyboard.addListener('keyboardWillShow', (e) => setKb(e.endCoordinates.height));
    const b = Keyboard.addListener('keyboardWillHide', () => setKb(0));
    return () => { a.remove(); b.remove(); };
  }, []);

  async function send(raw: string) {
    const q = raw.trim().slice(0, 300);
    if (!q || busy) return;
    last.current = q;
    setBusy(true); setErr(null); setReply(null);
    try {
      const { plan, message } = await api.outfitEdit(date, q);
      setReply(message); setText('');
      onEdited(plan, message);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Có lỗi xảy ra.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Đổi outfit bằng lời" subtitle={`Áp dụng cho ${dateLabel(date)}`}>
      <View style={{ backgroundColor: C.pink, borderRadius: 16, padding: 14 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: C.wine }}>Bạn muốn đổi gì?</Text>
        <Text style={[T.sub, { marginTop: 2 }]}>Mình sẽ gợi ý từ các món bạn đã có.</Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 }}>
        {QUICK.map((q) => (
          <View key={q} style={{ width: '48.5%' }}>
            <Chip label={q} onPress={() => send(q)} />
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, backgroundColor: C.card, borderRadius: R.button, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12 }}>
          <Icon name="chat" size={18} color={C.sub} />
          <TextInput
            value={text}
            onChangeText={setText}
            maxLength={300}
            placeholder="Nhắn điều bạn muốn đổi"
            placeholderTextColor={C.sub}
            returnKeyType="send"
            onSubmitEditing={() => send(text)}
            editable={!busy}
            accessibilityLabel="Nhắn điều bạn muốn đổi"
            style={{ flex: 1, fontSize: 15, color: C.text, paddingVertical: 10 }}
          />
        </View>
        <Pressable onPress={() => send(text)} disabled={busy || !text.trim()} accessibilityRole="button" accessibilityLabel="Gửi"
          style={{ width: 48, height: 48, borderRadius: R.button, backgroundColor: C.wine, alignItems: 'center', justifyContent: 'center', opacity: busy || !text.trim() ? 0.5 : 1 }}>
          <Icon name="send" size={20} color="#fff" />
        </Pressable>
      </View>

      {busy ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
          <ActivityIndicator color={C.wine} /><Text style={T.sub}>AI đang đổi…</Text>
        </View>
      ) : null}
      {reply ? (
        <View style={{ flexDirection: 'row', gap: 10, backgroundColor: C.card, borderRadius: 16, padding: 14 }}>
          <Icon name="spark" size={18} color={C.wine} /><Text style={[T.body, { flex: 1 }]}>{reply}</Text>
        </View>
      ) : null}
      {err ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, color: C.danger }}>{err}</Text>
          <Button title="Thử lại" kind="outline" onPress={() => send(last.current)} />
        </View>
      ) : null}
      {kb ? <View style={{ height: kb }} /> : null}
    </Sheet>
  );
}
