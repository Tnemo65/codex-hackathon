// "Hôm nay" screen (F3): daily outfit suggestion for today or tomorrow, confirm, chat edit.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { api, dateLabel, todayStr } from '../api';
import { ChatSheet } from '../components/ChatSheet';
import { OutfitCanvas } from '../components/OutfitCanvas';
import { OutfitPhoto } from '../components/OutfitPhoto';
import { ThoughtLine, secs } from '../components/ThoughtLine';
import { useReduceMotion } from '../motion';
import { C, R, S, T } from '../theme';
import { COMMUTE_LABEL, OCCASIONS, type Commute, type Item, type Outfit, type Plan, type Profile, type Weather } from '../types';
import { Banner, Button, Card, Chip, ErrorBox, Icon, Loading, Sheet, TOP_INSET } from '../ui';
import { TRYON_READY } from './TryOn';

const key = (o: Outfit | null | undefined) => (o ? [...o.item_ids].sort().join('|') : '');
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Có lỗi xảy ra.');
const AI_BUSY = 'AI đang phối đồ cho bạn…';

// Options to browse. If the selected outfit is not one of them (edited, or saved earlier), it takes the slot `at`.
const doneText = (p: Plan, t0: number) => `Đã phối ${Math.max(1, p.options?.length ?? 0)} bộ trong ${secs(Date.now() - t0)}`;

// AI explanation types itself out; the rest is laid out transparent so the page does not jump.
function TypeText({ text }: { text: string }) {
  const reduce = useReduceMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const iv = setInterval(() => setN((x) => { if (x >= text.length) { clearInterval(iv); return x; } return x + 3; }), 16);
    return () => clearInterval(iv);
  }, [text, reduce]);
  const shown = reduce ? text.length : n;
  return (
    <Text style={[T.body, { lineHeight: 21 }]} accessibilityLabel={text}>
      {text.slice(0, shown)}<Text style={{ color: 'transparent' }}>{text.slice(shown)}</Text>
    </Text>
  );
}

function optionList(p: Plan | null, at = 0): Outfit[] {
  if (!p) return [];
  const opts = p.options ?? [];
  if (!p.outfit) return opts;
  if (!opts.length) return [p.outfit];
  if (opts.some((o) => key(o) === key(p.outfit))) return opts;
  const list = [...opts];
  list[Math.min(at, list.length - 1)] = p.outfit;
  return list;
}

export default function Today({ profile, items, itemsLoading, itemsError, onRetryItems, onOpenTryOn, onGoWardrobe, onItemsChanged }: {
  profile: Profile; items: Item[]; itemsLoading: boolean; itemsError: string | null; onRetryItems: () => void; onOpenTryOn: (itemIds: string[]) => void; onGoWardrobe: () => void; onItemsChanged: () => void;
}) {
  const { width: winW } = useWindowDimensions();
  const boxW = Math.min(winW, 520) - S.page * 2;
  const [offset, setOffset] = useState<0 | 1>(0);
  const date = todayStr(offset);
  const isToday = offset === 0;
  const [plan, setPlan] = useState<Plan | null>(null);
  const [slot, setSlot] = useState(0); // where an off-list selected outfit sits
  const [idx, setIdx] = useState(0);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [inventoryCheckPending, setInventoryCheckPending] = useState(false);
  const [mode, setMode] = useState<'canvas' | 'body'>('body'); // Figma opens on the model photo
  const [occasion, setOccasion] = useState(profile.occasions[0] ?? 'Đi làm');
  const [commute, setCommute] = useState<Commute>(profile.commute);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [picker, setPicker] = useState<'occasion' | 'commute' | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPreparing, setChatPreparing] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatPrepRef = useRef(false);
  const [aiDone, setAiDone] = useState<string | null>(null); // "Đã phối 3 bộ trong 6,2s", only for a suggestion made just now
  const req = useRef(0);
  const retry = useRef<() => void>(() => {});
  const dateRef = useRef(date);
  const weatherReq = useRef(0);
  dateRef.current = date;

  const kinds = new Set(items.map((i) => i.kind));
  const tooSmall = items.length < 3 || !((kinds.has('top') && kinds.has('bottom')) || kinds.has('dress'));

  const list = optionList(plan, slot);
  const viewed = list[idx] ?? null;
  const byId = new Map(items.map((i) => [i.id, i]));
  const outfitItems = viewed ? viewed.item_ids.map((id) => byId.get(id)).filter((i): i is Item => !!i) : [];
  const w = plan?.weather ?? weather;
  const worn = plan?.status === 'worn';
  const confirmedHere = !!plan && !!viewed && key(viewed) === key(plan.outfit) && (isToday ? worn : plan.status !== 'suggested');

  // Show a plan and view its selected outfit (keep the current slot when the outfit is new).
  function applyPlan(p: Plan, at = idx) {
    const opts = p.options ?? [];
    const found = opts.findIndex((o) => key(o) === key(p.outfit));
    const s = found >= 0 ? found : Math.min(at, Math.max(opts.length - 1, 0));
    setPlan(p); setSlot(s); setIdx(s); setSaveErr(null);
  }

  async function guard(text: string, again: () => void, fn: (alive: () => boolean) => Promise<void>) {
    const id = ++req.current;
    const alive = () => id === req.current;
    retry.current = again; setBusy(text); setErr(null); setAiDone(null);
    try { await fn(alive); } catch (e) { if (alive()) setErr(errText(e)); } finally { if (alive()) setBusy(null); }
  }

  function suggest(occ = occasion, com = commute) {
    if (tooSmall) return;
    void guard(AI_BUSY, () => suggest(occ, com), async (alive) => {
      const t0 = Date.now();
      const { plan: p } = await api.outfitSuggest(date, occ, com);
      if (alive()) { applyPlan(p, 0); setEmpty(false); setNote(''); setAiDone(doneText(p, t0)); }
    });
  }

  const loadWeather = (targetDate = date) => {
    const id = ++weatherReq.current;
    setWeatherError(null);
    setWeatherLoading(true);
    api.weatherGet(targetDate)
      .then((r) => { if (id === weatherReq.current && targetDate === dateRef.current) setWeather(r.weather); })
      .catch((e) => { if (id === weatherReq.current && targetDate === dateRef.current) setWeatherError(errText(e)); })
      .finally(() => { if (id === weatherReq.current && targetDate === dateRef.current) setWeatherLoading(false); });
  };

  function load() {
    void guard('Đang mở kế hoạch…', load, async (alive) => {
      weatherReq.current++;
      setPlan(null); setWeather(null); setWeatherLoading(false); setWeatherError(null); setEmpty(false); setInventoryCheckPending(false); setNote(''); setSaveErr(null);
      const { plan: p } = await api.planGet(date);
      if (!alive()) return;
      if (p) {
        if (p.context?.occasion) setOccasion(p.context.occasion);
        if (p.context?.commute) setCommute(p.context.commute);
        applyPlan(p, 0);
        return;
      }
      // Initial [] is unresolved inventory, not an empty closet.
      setInventoryCheckPending(true);
    });
  }

  useEffect(load, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!inventoryCheckPending || itemsLoading || itemsError) return;
    // Resolve the pending no-plan branch only after inventory hydration has settled.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInventoryCheckPending(false);
    if (tooSmall) {
      setEmpty(true);
      loadWeather(date);
    } else {
      suggest();
    }
  }, [inventoryCheckPending, itemsLoading, itemsError, tooSmall]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (empty && !tooSmall) suggest(); }, [tooSmall, empty]); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirm() {
    if (!viewed) return;
    const d = date;
    setSaving(true); setSaveErr(null);
    try {
      const { plan: p } = await api.planSet(d, isToday ? 'worn' : 'planned', viewed);
      if (d !== dateRef.current) return;
      applyPlan({ ...p, outfit: p.outfit ?? viewed });
      if (isToday) onItemsChanged();
    } catch (e) {
      if (d === dateRef.current) setSaveErr(errText(e));
    } finally { setSaving(false); }
  }

  function pick(kind: 'occasion' | 'commute', value: string) {
    if (busy) return;
    setPicker(null);
    const occ = kind === 'occasion' ? value : occasion;
    const com = kind === 'commute' ? (value as Commute) : commute;
    if (occ === occasion && com === commute) return;
    setOccasion(occ); setCommute(com);
    suggest(occ, com);
  }

  // The server edits its selected outfit, so make the option on screen the selected one before chatting.
  async function openChat() {
    if (chatPrepRef.current) return;
    chatPrepRef.current = true;
    setChatPreparing(true); setChatError(null);
    const d = date;
    try {
      if (viewed && plan && plan.status === 'suggested' && key(viewed) !== key(plan.outfit)) {
        const { plan: saved } = await api.planSet(d, 'suggested', viewed);
        if (d !== dateRef.current) return;
        applyPlan(saved);
      }
      if (d === dateRef.current) setChatOpen(true);
    } catch (e) {
      if (d === dateRef.current) setChatError(errText(e));
    } finally {
      chatPrepRef.current = false;
      setChatPreparing(false);
    }
  }

  const go = (n: number) => { setIdx((i) => (i + n + list.length) % list.length); setNote(''); setSaveErr(null); };

  // Swipe the outfit card like a deck: past the threshold it flies out and the next option springs forward.
  const canSwipe = list.length > 1 && !(isToday && worn);
  const reduce = useReduceMotion();
  const live = useRef({ canSwipe, go, boxW, reduce });
  live.current = { canSwipe, go, boxW, reduce };
  const pan = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(1)).current;
  const swipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => live.current.canSwipe && Math.abs(g.dx) > 10 && Math.abs(g.dx) > 1.5 * Math.abs(g.dy),
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => pan.setValue(g.dx),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > 80 || Math.abs(g.vx) > 0.6) {
        const dir = g.dx < 0 ? -1 : 1;
        if (live.current.reduce) { pan.setValue(0); live.current.go(dir < 0 ? 1 : -1); return; }
        Animated.timing(pan, { toValue: dir * (live.current.boxW + 80), duration: 180, useNativeDriver: true })
          .start(() => live.current.go(dir < 0 ? 1 : -1));
      } else if (live.current.reduce) {
        pan.setValue(0);
      } else {
        Animated.spring(pan, { toValue: 0, useNativeDriver: true, bounciness: 8 }).start();
      }
    },
    onPanResponderTerminate: () => (live.current.reduce ? pan.setValue(0) : Animated.spring(pan, { toValue: 0, useNativeDriver: true }).start()),
  })).current;
  useEffect(() => {
    pan.setValue(0);
    if (reduce) { enter.setValue(1); return; }
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 7 }).start();
  }, [idx]); // eslint-disable-line react-hooks/exhaustive-deps

  // Body/canvas toggle: a pink thumb springs between the two buttons.
  const thumb = useRef(new Animated.Value(mode === 'canvas' ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) { thumb.setValue(mode === 'canvas' ? 1 : 0); return; }
    Animated.spring(thumb, { toValue: mode === 'canvas' ? 1 : 0, useNativeDriver: true, speed: 18, bounciness: 10 }).start();
  }, [mode, thumb, reduce]);

  // Confirm button pops when the outfit gets confirmed.
  const pop = useRef(new Animated.Value(1)).current;
  const wasConfirmed = useRef(confirmedHere);
  useEffect(() => {
    if (confirmedHere && !wasConfirmed.current && !reduce) {
      pop.setValue(0.9);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 16 }).start();
    }
    wasConfirmed.current = confirmedHere;
  }, [confirmedHere, pop, reduce]);
  const primaryTitle = isToday ? (confirmedHere ? 'Đã mặc hôm nay' : 'Mặc hôm nay') : (confirmedHere ? 'Đã chốt' : 'Chốt outfit');

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: TOP_INSET, paddingHorizontal: S.page, paddingBottom: 32, gap: S.gap }} keyboardShouldPersistTaps="handled">
        <View style={st.header}>
          <Pressable onPress={() => setOffset(0)} disabled={isToday} accessibilityRole="button" accessibilityLabel="Về hôm nay" style={[st.arrow, { opacity: isToday ? 0.3 : 1 }]}>
            <Icon name="left" size={20} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={T.h2}>{dateLabel(date)}</Text>
            <Text style={[T.small, { marginTop: 2 }]} numberOfLines={1}>{w ? `${w.summary} · ${profile.city}` : weatherLoading ? `Đang tải thời tiết · ${profile.city}` : weatherError ? `Không tải được thời tiết · ${profile.city}` : `${isToday ? 'Hôm nay' : 'Ngày mai'} · ${profile.city}`}</Text>
          </View>
          <Pressable onPress={() => setOffset(1)} disabled={!isToday} accessibilityRole="button" accessibilityLabel="Xem ngày mai" style={[st.arrow, { opacity: isToday ? 1 : 0.3 }]}>
            <Icon name="right" size={20} />
          </Pressable>
        </View>
        {viewed?.warnings?.[0] ? <Banner text={viewed.warnings[0]} /> : null}

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => setPicker('occasion')} disabled={busy !== null || isToday && worn} accessibilityRole="button" accessibilityLabel={`Dịp ${occasion}`} accessibilityHint="Chạm để đổi" style={[st.ctx, busy !== null && { opacity: 0.55 }]}>
            <Text style={T.small}>Dịp</Text><Text style={st.ctxText} numberOfLines={1}>{occasion}</Text>
          </Pressable>
          <Pressable onPress={() => setPicker('commute')} disabled={busy !== null || isToday && worn} accessibilityRole="button" accessibilityLabel={`Di chuyển ${COMMUTE_LABEL[commute]}`} accessibilityHint="Chạm để đổi" style={[st.ctx, busy !== null && { opacity: 0.55 }]}>
            <Text style={T.small}>Di chuyển</Text><Text style={st.ctxText} numberOfLines={1}>{COMMUTE_LABEL[commute]}</Text>
          </Pressable>
        </View>

        {busy === AI_BUSY ? (
          <ThoughtLine key={req.current} title="AI đang phối đồ" steps={[
            `Xem dự báo thời tiết ở ${profile.city}`,
            'Xem các bộ bạn đã mặc 7 ngày qua',
            `Cân nhắc ${items.length} món cho dịp ${occasion} (${COMMUTE_LABEL[commute]})`,
            `Phối 3 bộ hợp dáng cao ${profile.height_cm} cm`,
          ]} />
        ) : busy ? <Loading text={busy} /> : err ? <ErrorBox message={err} onRetry={() => retry.current()} /> : itemsError && items.length === 0 ? (
          <ErrorBox message={itemsError} onRetry={onRetryItems} />
        ) : itemsLoading && items.length === 0 ? <Loading text="Đang tải tủ đồ…" /> : inventoryCheckPending ? <Loading text="Đang kiểm tra tủ đồ…" /> : empty ? (
          <Card style={{ gap: 10 }}>
            <Text style={T.h2}>Tủ đồ chưa đủ để phối</Text>
            <Text style={T.sub}>Cần ít nhất 3 món, có áo và quần hoặc chân váy, hoặc một váy liền.</Text>
            {weatherError ? (
              <View style={{ gap: 8 }}>
                <Text accessibilityRole="alert" style={{ fontSize: 13, color: C.danger }}>Không tải được dự báo thời tiết. {weatherError}</Text>
                <Button title="Thử tải thời tiết lại" kind="outline" onPress={() => loadWeather(date)} loading={weatherLoading} />
              </View>
            ) : null}
            <Button title="Thêm món" icon="plus" onPress={onGoWardrobe} />
          </Card>
        ) : !viewed ? (
          <Card style={{ gap: 10 }}>
            <Text style={T.h2}>Chưa có gợi ý cho ngày này</Text>
            <Button title="Gợi ý ngay" icon="spark" onPress={() => suggest()} />
          </Card>
        ) : (
          <>
            {aiDone ? <ThoughtLine title="" steps={[]} done={aiDone} /> : null}
            <View style={{ paddingBottom: canSwipe ? 14 : 0 }}>
            {canSwipe ? (
              <>
                <View style={[st.peek, { left: 28, right: 28, bottom: 0, backgroundColor: C.line }]} />
                <View style={[st.peek, { left: 14, right: 14, bottom: 7, backgroundColor: C.pink }]} />
              </>
            ) : null}
            <Animated.View {...swipe.panHandlers} style={[st.stage, {
              transform: [
                { translateX: pan },
                { rotate: pan.interpolate({ inputRange: [-300, 0, 300], outputRange: ['-8deg', '0deg', '8deg'] }) },
                { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
              ],
            }]}>
              <View style={st.toggleRow}>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <Animated.View style={[st.toggle, st.thumb, { transform: [{ translateX: thumb.interpolate({ inputRange: [0, 1], outputRange: [0, 48] }) }] }]} />
                  <Pressable onPress={() => setMode('body')} accessibilityRole="button" accessibilityState={{ selected: mode === 'body' }} accessibilityLabel="Xem trên người" style={st.toggle}>
                    <Icon name="person" size={18} color={mode === 'body' ? C.wine : C.sub} />
                  </Pressable>
                  <Pressable onPress={() => setMode('canvas')} accessibilityRole="button" accessibilityState={{ selected: mode === 'canvas' }} accessibilityLabel="Xem dạng canvas" style={st.toggle}>
                    <Icon name="grid" size={18} color={mode === 'canvas' ? C.wine : C.sub} />
                  </Pressable>
                </View>
                {TRYON_READY ? (
                  <Pressable onPress={() => onOpenTryOn(viewed.item_ids)} accessibilityRole="button" accessibilityLabel="Mặc thử AI" style={st.tryon}>
                    <Icon name="spark" size={16} color={C.wine} /><Text style={{ fontSize: 13, fontWeight: '600', color: C.wine }}>Mặc thử AI</Text>
                  </Pressable>
                ) : null}
              </View>
              {outfitItems.length === 0 ? (
                <View style={{ height: 494, alignItems: 'center', justifyContent: 'center' }}><Text style={T.sub}>Không thấy các món này trong tủ đồ.</Text></View>
              ) : mode === 'canvas' ? (
                <OutfitCanvas items={outfitItems} width={boxW} height={494} />
              ) : (
                <OutfitPhoto items={outfitItems} profile={profile} width={boxW} height={494} />
              )}
              {canSwipe ? (
                <>
                  <Pressable onPress={() => go(-1)} accessibilityRole="button" accessibilityLabel="Gợi ý trước" style={[st.side, { left: 4 }]}><Icon name="left" size={20} color={C.sub} /></Pressable>
                  <Pressable onPress={() => go(1)} accessibilityRole="button" accessibilityLabel="Gợi ý sau" style={[st.side, { right: 4 }]}><Icon name="right" size={20} color={C.sub} /></Pressable>
                </>
              ) : null}
              {list.length > 1 ? <Text style={st.counter}>{idx + 1} / {list.length}</Text> : null}
            </Animated.View>
            </View>

            <Text style={T.h2}>{viewed.name}</Text>
            {viewed.why ? <TypeText key={`${idx}|${viewed.why}`} text={viewed.why} /> : null}
            {viewed.fit_note ? (
              <View style={st.fit}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.wine }}>Hợp dáng bạn</Text>
                <Text style={[T.body, { marginTop: 4, lineHeight: 21 }]}>{viewed.fit_note}</Text>
              </View>
            ) : null}
            {(viewed.warnings ?? []).map((t, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <Icon name="warn" size={16} color={C.wine} /><Text style={[T.body, { flex: 1 }]}>{t}</Text>
              </View>
            ))}
            {note ? (
              <Card style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Icon name="chat" size={18} color={C.wine} /><Text style={[T.body, { flex: 1 }]}>{note}</Text>
              </Card>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
              <Animated.View style={{ flex: 1, transform: [{ scale: pop }] }}>
                <Button title={primaryTitle} kind={confirmedHere ? 'outline' : 'primary'} icon={confirmedHere ? 'check' : undefined}
                  disabled={confirmedHere || (isToday && worn)} loading={saving} onPress={confirm} />
              </Animated.View>
              <Button title="Chat" kind="secondary" icon="chat" loading={chatPreparing} onPress={() => void openChat()} style={{ flex: 1 }} />
            </View>
            {chatError ? <ErrorBox message={chatError} onRetry={() => void openChat()} /> : null}
            {saveErr ? <ErrorBox message={saveErr} onRetry={confirm} /> : null}
            {!(isToday && worn) ? (
              <Pressable onPress={() => suggest()} accessibilityRole="button" accessibilityLabel="Gợi ý lại" style={st.textBtn}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: C.wine }}>Gợi ý lại</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>

      <Sheet visible={picker !== null} onClose={() => setPicker(null)} title={picker === 'commute' ? 'Bạn đi bằng gì?' : 'Hôm đó đi đâu?'} subtitle="Đổi xong mình sẽ gợi ý lại.">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {picker === 'commute'
            ? (Object.keys(COMMUTE_LABEL) as Commute[]).map((c) => <Chip key={c} label={COMMUTE_LABEL[c]} selected={c === commute} onPress={() => pick('commute', c)} />)
            : OCCASIONS.map((o) => <Chip key={o} label={o} selected={o === occasion} onPress={() => pick('occasion', o)} />)}
        </View>
      </Sheet>

      <ChatSheet visible={chatOpen} date={date} onClose={() => setChatOpen(false)}
        onEdited={(p, message) => { if (p.date && p.date !== dateRef.current) return; applyPlan(p); setNote(message); }} />
    </View>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ctx: { flex: 1, minHeight: 48, backgroundColor: C.card, borderRadius: R.chip, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 6, justifyContent: 'center' },
  ctxText: { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 1 },
  stage: { backgroundColor: C.pinkSoft, borderRadius: R.card, overflow: 'hidden', paddingBottom: 8 },
  peek: { position: 'absolute', height: 60, borderRadius: R.card },
  thumb: { position: 'absolute', left: 0, top: 0, backgroundColor: C.pink },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
  toggle: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tryon: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 999, backgroundColor: C.card, marginLeft: 4 },
  side: { position: 'absolute', top: 255, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  counter: { alignSelf: 'center', fontSize: 12, fontWeight: '600', color: C.sub, marginTop: 4 },
  fit: { backgroundColor: C.pink, borderRadius: 16, padding: 14 },
  textBtn: { alignSelf: 'center', minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
});
