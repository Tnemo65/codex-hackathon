// Client for the `api` Edge Function. The app never talks to the database directly.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Commute, Item, Outfit, Plan, PlanStatus, Product, ProductMatch, ProductPick, Profile, ShopSuggestion, Weather } from './types';

const API_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/api`;
const TRYON_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/tryon`;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const DEVICE_KEY = 'tudo.device_id';

let deviceId: string | null = null;
let pendingId: Promise<string> | null = null;

// The device id is this install's only credential, so the server mints it with a cryptographic RNG
// (React Native has no built-in secure random without an extra native module).
async function mintDeviceId(): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000); // first call can hit a cold server start
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: KEY },
      body: JSON.stringify({ action: 'device.new' }),
      signal: controller.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || typeof body.device_id !== 'string') throw new Error('Không kết nối được máy chủ.');
    return body.device_id;
  } catch {
    throw new Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại nhé.');
  } finally {
    clearTimeout(timer);
  }
}

export async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  pendingId ??= (async () => {
    let id = await AsyncStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = await mintDeviceId();
      await AsyncStorage.setItem(DEVICE_KEY, id);
    }
    deviceId = id;
    return id;
  })().finally(() => {
    pendingId = null;
  });
  return pendingId;
}

// Used after "profile.restore": point this install at an existing wardrobe.
export async function setDeviceId(id: string): Promise<void> {
  deviceId = id;
  await AsyncStorage.setItem(DEVICE_KEY, id);
}

export async function post<T>(url: string, action: string, payload: Record<string, unknown> = {}, timeoutMs = 60000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = JSON.stringify({ action, device_id: await getDeviceId(), ...payload });
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY }, body, signal: controller.signal });
    } catch {
      // Android reports a timeout as "Fetch request has been canceled", not AbortError, so check the signal.
      throw new Error(controller.signal.aborted ? 'Mạng chậm quá, thử lại nhé.' : 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại nhé.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Lỗi máy chủ (${res.status})`);
    return data as T;
  } catch (e) {
    throw e instanceof Error ? e : new Error('Có lỗi xảy ra.');
  } finally {
    clearTimeout(timer);
  }
}

const call = <T,>(action: string, payload: Record<string, unknown> = {}, timeoutMs?: number) => post<T>(API_URL, action, payload, timeoutMs);

// Weather comes straight from Open-Meteo on the device (no key needed): the server's shared cloud address
// gets refused by Open-Meteo, while a phone gets an answer in about a second.
const PLACES: Record<string, [number, number]> = { 'Hà Nội': [21.0285, 105.8542], 'TP. Hồ Chí Minh': [10.8231, 106.6297], 'Đà Nẵng': [16.0544, 108.2022] };
const weatherCache = new Map<string, { at: number; data: Weather }>();

export async function fetchWeather(date: string, city = 'Hà Nội'): Promise<Weather> {
  const place = PLACES[city] ? city : 'Hà Nội';
  const key = `${place}|${date}`;
  const hit = weatherCache.get(key);
  if (hit && Date.now() - hit.at < 20 * 60 * 1000) return hit.data;
  const [lat, lon] = PLACES[place];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,precipitation_probability,wind_speed_10m,uv_index&timezone=Asia%2FBangkok&start_date=${date}&end_date=${date}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const h = (await res.json()).hourly as Record<string, number[]>;
    const part = (from: number, to: number) => {
      const idx = Array.from({ length: to - from + 1 }, (_, i) => from + i);
      const t = Math.round(idx.reduce((s, i) => s + (h.temperature_2m[i] ?? 0), 0) / idx.length);
      const rain = Math.max(...idx.map((i) => h.precipitation_probability[i] ?? 0));
      const wind = Math.round(Math.max(...idx.map((i) => h.wind_speed_10m[i] ?? 0)));
      const uv = Math.max(...idx.map((i) => h.uv_index[i] ?? 0));
      const cond = rain >= 60 ? 'Mưa' : rain >= 35 ? 'Có thể mưa' : t <= 17 ? 'Trời lạnh' : uv >= 7 ? 'Nắng gắt' : uv >= 3 ? 'Nắng nhẹ' : t <= 22 ? 'Trời mát' : 'Trời dịu';
      return { t, cond, rain_pct: Math.round(rain), wind_kmh: wind };
    };
    const day = h.temperature_2m.slice(6, 23);
    const morning = part(6, 11), afternoon = part(12, 17), evening = part(18, 22);
    const data: Weather = {
      place, date, morning, afternoon, evening,
      t_min: Math.round(Math.min(...day)), t_max: Math.round(Math.max(...day)),
      uv_max: Math.round(Math.max(...h.uv_index.slice(6, 19))),
      summary: `Sáng ${morning.t}° · ${morning.cond}`,
    };
    weatherCache.set(key, { at: Date.now(), data });
    return data;
  } catch {
    throw new Error('Chưa lấy được thời tiết, thử lại nhé.');
  } finally {
    clearTimeout(timer);
  }
}

export type DayWeather = { t_min: number; t_max: number; rain_pct: number; cond: string };
const rangeCache = new Map<string, { at: number; data: Record<string, DayWeather> }>();

// Daily forecast for a date range, keyed by YYYY-MM-DD. Open-Meteo serves ~92 days back .. 16 days ahead.
// Never throws: on any failure returns {} so the calendar still works.
export async function fetchWeatherRange(from: string, to: string, city = 'Hà Nội'): Promise<Record<string, DayWeather>> {
  const place = PLACES[city] ? city : 'Hà Nội';
  const shift = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`; };
  const lo = from < shift(-90) ? shift(-90) : from;
  const hi = to > shift(15) ? shift(15) : to;
  if (lo > hi) return {};
  const key = `${place}|${lo}|${hi}`;
  const hit = rangeCache.get(key);
  if (hit && Date.now() - hit.at < 20 * 60 * 1000) return hit.data;
  const [lat, lon] = PLACES[place];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&timezone=Asia%2FBangkok&start_date=${lo}&end_date=${hi}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const d = (await res.json()).daily as Record<string, (number | string | null)[]>;
    const out: Record<string, DayWeather> = {};
    (d.time as string[]).forEach((date, i) => {
      const tMax = d.temperature_2m_max[i] as number | null, tMin = d.temperature_2m_min[i] as number | null;
      if (tMax == null || tMin == null) return;
      const rain = (d.precipitation_probability_max?.[i] as number | null) ?? 0;
      const uv = (d.uv_index_max?.[i] as number | null) ?? 0;
      const cond = rain >= 60 ? 'Mưa' : rain >= 35 ? 'Có thể mưa' : tMax <= 18 ? 'Trời lạnh' : uv >= 7 ? 'Nắng gắt' : uv >= 3 ? 'Nắng nhẹ' : tMax <= 23 ? 'Trời mát' : 'Trời dịu';
      out[date] = { t_min: Math.round(tMin), t_max: Math.round(tMax), rain_pct: Math.round(rain), cond };
    });
    rangeCache.set(key, { at: Date.now(), data: out });
    return out;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  weatherRange: fetchWeatherRange,
  profileGet: () => call<{ profile: Profile | null; restore_code: string | null }>('profile.get'),
  profileSave: (profile: Profile) => call<{ profile: Profile; restore_code: string }>('profile.save', { profile }),
  profileRestore: (restore_code: string) => call<{ device_id: string }>('profile.restore', { restore_code }),

  itemsList: () => call<{ items: Item[] }>('items.list'),
  // image_base64: JPEG, no "data:" prefix, already resized (see photo.ts). AI fills the attributes.
  // remove_bg: also ask the server for a background-free cutout (limited quota, off by default).
  itemAdd: (image_base64: string, remove_bg = false) => call<{ item: Item }>('item.add', { image_base64, remove_bg }, 90000),
  itemUpdate: (id: string, patch: Partial<Item>) => call<{ item: Item }>('item.update', { id, patch }),
  itemDelete: (id: string) => call<{ ok: true }>('item.delete', { id }),

  weatherGet: async (date: string) => ({ weather: await fetchWeather(date) }),
  planGet: (date: string) => call<{ plan: Plan | null }>('plan.get', { date }),
  plansRange: (from: string, to: string) => call<{ plans: Plan[] }>('plans.range', { from, to }),
  // AI picks 3 outfits from the wardrobe; the first becomes plan.outfit with status "suggested".
  // The device fetches the forecast and sends it along; without it the AI still suggests, just without weather.
  outfitSuggest: async (date: string, occasion: string, commute: Commute) => {
    const weather = await fetchWeather(date).catch(() => null);
    return call<{ plan: Plan }>('outfit.suggest', { date, occasion, commute, weather }, 90000);
  },
  // AI edits the currently selected outfit of that date by a Vietnamese instruction.
  outfitEdit: (date: string, text: string) => call<{ plan: Plan; message: string }>('outfit.edit', { date, text }, 60000),
  // AI looks at the wardrobe + profile and names 4-6 missing pieces to buy.
  shopSuggest: () => call<{ suggestions: ShopSuggestion[] }>('shop.suggest', {}, 60000),
  // Shop inventory and the AI's picks from it for this wardrobe.
  catalogList: () => call<{ products: Product[] }>('catalog.list'),
  catalogPick: () => call<{ picks: ProductPick[] }>('catalog.pick', {}, 60000),
  catalogMatch: (product_id: string) => call<ProductMatch>('catalog.match', { product_id }, 60000),
  planSet: (date: string, status: PlanStatus, outfit?: Outfit) => call<{ plan: Plan }>('plan.set', { date, status, outfit }),
};

// Separate function so the image-generation flow cannot break the core API.
export const tryonApi = {
  // body_mode 'profile': no body photo, the model is drawn from the profile's height/weight/proportion.
  create: (item_ids: string[], body_image_base64: string | null, body_mode?: 'profile') =>
    post<{ job_id: string }>(TRYON_URL, 'tryon.create', { item_ids, body_image_base64, body_mode }, 60000),
  status: (job_id: string) =>
    post<{ status: 'pending' | 'done' | 'failed'; image_url: string | null; error: string | null }>(TRYON_URL, 'tryon.status', { job_id }, 20000),
};

export function todayStr(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const names = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return `${names[dt.getDay()]}, ${d}/${m}`;
}
