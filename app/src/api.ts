// Client for the `api` Edge Function. The app never talks to the database directly.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Commute, Item, Outfit, Plan, PlanStatus, Profile, Weather } from './types';

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

export const api = {
  profileGet: () => call<{ profile: Profile | null; restore_code: string | null }>('profile.get'),
  profileSave: (profile: Profile) => call<{ profile: Profile; restore_code: string }>('profile.save', { profile }),
  profileRestore: (restore_code: string) => call<{ device_id: string }>('profile.restore', { restore_code }),

  itemsList: () => call<{ items: Item[] }>('items.list'),
  // image_base64: JPEG, no "data:" prefix, already resized (see photo.ts). AI fills the attributes.
  // remove_bg: also ask the server for a background-free cutout (limited quota, off by default).
  itemAdd: (image_base64: string, remove_bg = false) => call<{ item: Item }>('item.add', { image_base64, remove_bg }, 90000),
  itemUpdate: (id: string, patch: Partial<Item>) => call<{ item: Item }>('item.update', { id, patch }),
  itemDelete: (id: string) => call<{ ok: true }>('item.delete', { id }),

  weatherGet: (date: string) => call<{ weather: Weather }>('weather.get', { date }),
  planGet: (date: string) => call<{ plan: Plan | null }>('plan.get', { date }),
  // AI picks 3 outfits from the wardrobe; the first becomes plan.outfit with status "suggested".
  outfitSuggest: (date: string, occasion: string, commute: Commute) =>
    call<{ plan: Plan }>('outfit.suggest', { date, occasion, commute }, 90000),
  // AI edits the currently selected outfit of that date by a Vietnamese instruction.
  outfitEdit: (date: string, text: string) => call<{ plan: Plan; message: string }>('outfit.edit', { date, text }, 60000),
  planSet: (date: string, status: PlanStatus, outfit?: Outfit) => call<{ plan: Plan }>('plan.set', { date, status, outfit }),
};

// Separate function so the image-generation flow cannot break the core API.
export const tryonApi = {
  create: (item_ids: string[], body_image_base64: string | null) =>
    post<{ job_id: string }>(TRYON_URL, 'tryon.create', { item_ids, body_image_base64 }, 60000),
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
