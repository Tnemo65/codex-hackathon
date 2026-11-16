// "Lịch" screen: month / week view of planned and worn outfits, with a detail card for the selected day.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { api, dateLabel, todayStr, type DayWeather } from '../api';
import { C, R, S, T } from '../theme';
import type { Item, Plan, PlanStatus, Profile } from '../types';
import { Badge, Button, Card, ErrorBox, Icon, Loading, Screen } from '../ui';

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Có lỗi xảy ra.');
const fmt = (d: Date) => `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
const WEEK = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const STATUS: Record<PlanStatus, string> = { worn: 'Đã mặc', planned: 'Đã chốt', suggested: 'Gợi ý' };
const RAIN = '#2B5F9E'; // days that may rain (blue + underline in the grid)

// Visible date range: the 6-week-max grid for a month, or Monday..Sunday for a week.
function rangeOf(mode: 'month' | 'week', anchor: Date): { start: Date; days: number } {
  if (mode === 'week') return { start: mondayOf(anchor), days: 7 };
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const start = mondayOf(first);
  return { start, days: Math.ceil((last.getTime() - start.getTime()) / 86400000 / 7 + 0.001) * 7 };
}

function Thumb({ item, size }: { item?: Item; size: number }) {
  const uri = item ? (item.cutout_url ?? item.image_url) : null;
  return (
    <View style={{ width: size, height: size, borderRadius: R.chip, backgroundColor: C.pinkSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {uri ? <Image source={{ uri }} style={{ width: size - 8, height: size - 8 }} resizeMode="contain" /> : <Icon name="hanger" size={size / 2.5} color={C.accent} />}
    </View>
  );
}

export default function Calendar({ items, onOpenTryOn, onOpenProfile, profile }: {
  items: Item[]; profile: Profile; onOpenTryOn: (itemIds: string[]) => void; onPlanChanged: () => void; onOpenProfile: () => void;
}) {
  const today = todayStr();
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(() => parse(today)); // any day inside the visible month / week
  const [selected, setSelected] = useState(today);
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const req = useRef(0);

  const { start, days } = rangeOf(mode, anchor);
  const from = fmt(start);
  const to = fmt(addDays(start, days - 1));

  const load = useCallback(() => {
    const id = ++req.current;
    setLoading(true); setErr(null);
    api.plansRange(from, to)
      .then(({ plans: list }) => { if (id === req.current) setPlans(Object.fromEntries(list.map((p) => [p.date, p]))); })
      .catch((e) => { if (id === req.current) setErr(errText(e)); })
      .finally(() => { if (id === req.current) setLoading(false); });
  }, [from, to]);
  useEffect(load, [load]);

  const [fc, setFc] = useState<Record<string, DayWeather>>({});
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const weatherReq = useRef(0);
  const loadWeather = useCallback(() => {
    const id = ++weatherReq.current;
    setWeatherLoading(true);
    setWeatherError(null);
    api.weatherRange(from, to, profile.city)
      .then((w) => { if (id === weatherReq.current) setFc(w); })
      .catch((e) => { if (id === weatherReq.current) setWeatherError(errText(e)); })
      .finally(() => { if (id === weatherReq.current) setWeatherLoading(false); });
  }, [from, to, profile.city]);
  useEffect(() => {
    loadWeather();
    return () => { weatherReq.current++; };
  }, [loadWeather]);

  const byId = new Map(items.map((i) => [i.id, i]));
  const itemsOf = (p?: Plan) => (p?.outfit ? p.outfit.item_ids.map((id) => byId.get(id)).filter((i): i is Item => !!i) : []);

  const shift = (n: number) => {
    const next = mode === 'month' ? new Date(anchor.getFullYear(), anchor.getMonth() + n, 1) : addDays(anchor, 7 * n);
    setAnchor(next); setSelected(fmt(next));
  };
  const goToday = () => { setAnchor(parse(today)); setSelected(today); };

  const monthTitle = `Tháng ${anchor.getMonth() + 1}, ${anchor.getFullYear()}`;
  const subtitle = mode === 'month' ? monthTitle
    : `${`${start.getDate()}`.padStart(2, '0')}–${`${addDays(start, 6).getDate()}`.padStart(2, '0')}/${`${addDays(start, 6).getMonth() + 1}`.padStart(2, '0')}, ${addDays(start, 6).getFullYear()}`;
  const initial = (profile.name?.trim()?.[0] ?? '').toUpperCase();

  const sel = plans[selected];
  const selItems = itemsOf(sel);
  // Weather row: the weather saved with the plan wins, else the forecast.
  const rec = sel?.weather;
  const f = fc[selected];
  const wx = rec
    ? { place: rec.place, lo: rec.t_min, hi: rec.t_max, cond: rec.morning.cond, rain: Math.max(rec.morning.rain_pct, rec.afternoon.rain_pct, rec.evening.rain_pct) }
    : f ? { place: profile.city, lo: f.t_min, hi: f.t_max, cond: f.cond, rain: f.rain_pct } : null;
  const wxLine = wx ? `${wx.place} · ${wx.lo}–${wx.hi}° · ${wx.cond} · mưa ${wx.rain}%` : '';

  return (
    <Screen title="Lịch outfit" subtitle={subtitle} right={
      <Pressable onPress={onOpenProfile} accessibilityRole="button" accessibilityLabel="Hồ sơ" style={st.avatar}>
        {initial ? <Text style={{ fontSize: 18, fontWeight: '700', color: C.wine }}>{initial}</Text> : <Icon name="user" size={22} color={C.wine} />}
      </Pressable>
    }>
      <View style={st.seg}>
        {(['month', 'week'] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} accessibilityRole="button" accessibilityState={{ selected: mode === m }}
            style={[st.segBtn, mode === m && { backgroundColor: C.pink }]}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: mode === m ? C.wine : C.sub }}>{m === 'month' ? 'Tháng' : 'Tuần'}</Text>
          </Pressable>
        ))}
      </View>

      {mode === 'month' ? (
        <Card style={{ gap: 8 }}>
          <View style={st.navRow}>
            <Pressable onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel="Tháng trước" style={st.arrow}><Icon name="left" size={20} /></Pressable>
            <Text style={[T.h2, { flex: 1, textAlign: 'center' }]}>{monthTitle}</Text>
            <Pressable onPress={goToday} accessibilityRole="button" accessibilityLabel="Về hôm nay" style={st.todayBtn}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: C.wine }}>Hôm nay</Text>
            </Pressable>
            <Pressable onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel="Tháng sau" style={st.arrow}><Icon name="right" size={20} /></Pressable>
          </View>
          <View style={st.gridRow}>
            {WEEK.map((w) => <Text key={w} style={[st.cell, { fontSize: 12, fontWeight: '700', color: C.text }]}>{w}</Text>)}
          </View>
          {Array.from({ length: days / 7 }, (_, r) => (
            <View key={r} style={st.gridRow}>
              {Array.from({ length: 7 }, (_, c) => {
                const d = addDays(start, r * 7 + c);
                const key = fmt(d);
                if (d.getMonth() !== anchor.getMonth()) return <View key={c} style={st.cell} />;
                const isToday = key === today;
                const isSel = key === selected;
                const p = plans[key];
                return (
                  <Pressable key={c} onPress={() => setSelected(key)} accessibilityRole="button" accessibilityState={{ selected: isSel }} accessibilityLabel={`${dateLabel(key)}${isToday ? ', hôm nay' : ''}${p ? `, ${STATUS[p.status]}` : ''}${fc[key] ? `, cao nhất ${fc[key].t_max} độ${fc[key].rain_pct >= 35 ? ', có thể mưa' : ''}` : ''}`}
                    style={[st.cell, st.day, isSel && { backgroundColor: C.pink }, isToday && { backgroundColor: C.wine }]}>
                    <Text style={{ fontSize: 15, fontWeight: isToday || isSel ? '700' : '500', color: isToday ? '#fff' : C.text }}>{d.getDate()}</Text>
                    {fc[key] ? (
                      <Text numberOfLines={1} style={[{ fontSize: 11, color: isToday ? '#fff' : C.sub },
                        fc[key].rain_pct >= 35 && { fontWeight: '700', color: isToday ? '#fff' : RAIN, textDecorationLine: 'underline' }]}>
                        {fc[key].t_max}°
                      </Text>
                    ) : null}
                    <View style={[st.dot,{ backgroundColor: p ? (p.status === 'worn' ? (isToday ? '#fff' : C.wine) : p.status === 'planned' ? C.accent : C.pink) : 'transparent' }]} />
                  </Pressable>
                );
              })}
            </View>
          ))}
          <Text style={{ fontSize: 11, color: C.sub, marginTop: 6 }}>Số dưới ngày: nhiệt độ cao nhất ở {profile.city}. <Text style={{ color: RAIN, fontWeight: '700', textDecorationLine: 'underline' }}>Gạch chân</Text>: có thể mưa.</Text>
        </Card>
      ) : (
        <View style={st.navRow}>
          <Pressable onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel="Tuần trước" style={st.arrow}><Icon name="left" size={20} /></Pressable>
          <View style={{ flex: 1 }} />
          <Pressable onPress={goToday} accessibilityRole="button" accessibilityLabel="Về hôm nay" style={st.todayBtn}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: C.wine }}>Hôm nay</Text>
          </Pressable>
          <Pressable onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel="Tuần sau" style={st.arrow}><Icon name="right" size={20} /></Pressable>
        </View>
      )}

      {weatherError ? (
        <Card style={{ gap: 8 }}>
          <Text accessibilityRole="alert" style={{ fontSize: 13, color: C.danger }}>
            Không tải được dự báo thời tiết mới. {weatherError}
          </Text>
          <Button title="Thử tải dự báo lại" onPress={loadWeather} loading={weatherLoading} />
        </Card>
      ) : null}
      {weatherLoading ? (
        <Text accessibilityLiveRegion="polite" style={T.small}>
          {Object.keys(fc).length ? 'Đang cập nhật dự báo thời tiết…' : 'Đang tải dự báo thời tiết…'}
        </Text>
      ) : null}

      {loading ? <Loading text="Đang mở lịch…" /> : err ? <ErrorBox message={err} onRetry={load} /> : mode === 'month' ? (
        <Card style={{ gap: 12 }}>
          <Text style={[T.small, { color: C.text }]}>{dateLabel(selected)}</Text>
          {wx ? (
            <View style={{ gap: 2 }}>
              <Text style={[T.small, { fontWeight: '600' }]}>{wxLine}</Text>
              {rec && sel?.status === 'worn' ? <Text style={T.small}>Thời tiết lúc mặc</Text> : null}
            </View>
          ) : <Text style={T.small}>{weatherError ? 'Không thể cập nhật dự báo lúc này' : weatherLoading ? 'Đang tải dự báo thời tiết…' : 'Chưa có dự báo cho ngày này'}</Text>}
          {sel?.outfit ? (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, width: 132 }}>
                  {selItems.slice(0, 4).map((i) => <Thumb key={i.id} item={i} size={63} />)}
                  {selItems.length === 0 ? <Thumb size={63} /> : null}
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <Badge text={STATUS[sel.status]} tone={sel.status === 'worn' ? 'ok' : 'pink'} />
                  <Text style={T.h2}>{sel.outfit.name}</Text>
                  {sel.weather ? <Text style={T.small}>{sel.weather.summary}</Text> : null}
                </View>
              </View>
              {sel.outfit.why ? <Text style={[T.body, { lineHeight: 21 }]}>{sel.outfit.why}</Text> : null}
              {selItems.length ? <Button title="Mặc thử AI" kind="outline" onPress={() => onOpenTryOn(sel.outfit!.item_ids)} /> : null}
            </View>
          ) : (
            <Text style={T.body}>Chưa có outfit cho ngày này</Text>
          )}
        </Card>
      ) : (
        <View style={{ gap: S.gap }}>
          {Array.from({ length: 7 }, (_, i) => {
            const d = addDays(start, i);
            const key = fmt(d);
            const p = plans[key];
            const first = itemsOf(p)[0];
            const fw = fc[key];
            const meta = p?.status === 'worn' ? 'Đã mặc · Nhật ký'
              : [p?.weather ? `${Math.round(p.weather.t_max)}°` : fw ? `${Math.round(fw.t_max)}°` : null, p?.weather?.morning.cond ?? fw?.cond ?? (p ? STATUS[p.status] : null)].filter(Boolean).join(' · ');
            return (
              <View key={key} style={[st.weekRow, key === today && { backgroundColor: C.pink }]}>
                <Text style={st.weekDay}>{WEEK[i]} {`${d.getDate()}`.padStart(2, '0')}</Text>
                <Thumb item={first} size={64} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }} numberOfLines={2}>{p?.outfit?.name ?? 'Chưa chốt outfit'}</Text>
                  {meta ? <Text style={T.small}>{meta}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center' },
  seg: { flexDirection: 'row', backgroundColor: C.card, borderRadius: R.chip, borderWidth: 1, borderColor: C.line, padding: 3, gap: 3 },
  segBtn: { flex: 1, minHeight: 44, borderRadius: R.chip - 3, alignItems: 'center', justifyContent: 'center' },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  todayBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: R.chip, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center' },
  gridRow: { flexDirection: 'row' },
  cell: { flex: 1, textAlign: 'center', minHeight: 44 },
  day: { alignItems: 'center', justifyContent: 'center', borderRadius: R.chip },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: R.card, padding: 12 },
  weekDay: { width: 48, fontSize: 14, fontWeight: '700', color: C.text },
});
