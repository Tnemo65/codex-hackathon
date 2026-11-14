// Core backend: app -> here -> OpenAI / Open-Meteo / Postgres / Storage. Secrets never leave this function.
// The app sends { action, device_id, ... }. Contract: app/src/types.ts and app/src/api.ts.
import OpenAI, { toFile } from "npm:openai";
import postgres from "npm:postgres";
import { createClient } from "npm:@supabase/supabase-js@2";

const VISION_MODEL = Deno.env.get("VISION_MODEL") ?? "gpt-6.1-terra";
const STYLIST_MODEL = Deno.env.get("STYLIST_MODEL") ?? "gpt-6.1-sol";
const EDIT_MODEL = Deno.env.get("EDIT_MODEL") ?? "gpt-6.1-terra";
const BUCKET = "wardrobe";
const SIGN_SECONDS = 60 * 60 * 24 * 7;
const MAX_IMAGE_B64 = 2_000_000; // about 1.5 MB of JPEG
const MAX_ITEMS_FOR_AI = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type, authorization",
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// verify_jwt is off (publishable keys are not JWTs), so check the apikey header ourselves.
function allowedKeys(): string[] {
  const keys: string[] = [];
  const publishable = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (publishable) keys.push(...Object.values(JSON.parse(publishable) as Record<string, string>));
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (anon) keys.push(anon);
  return keys;
}

function secretKey(): string {
  const dict = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (dict) {
    const first = Object.values(JSON.parse(dict) as Record<string, string>)[0];
    if (first) return first;
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 20 });
const storage = () => createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), { auth: { persistSession: false } }).storage;
const openai = () => new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

// Tables are created by the function itself (idempotent), once per cold start. RLS on, no policies:
// only this function (direct connection) can read or write them.
const SCHEMA = `
create table if not exists profiles (
  device_id text primary key, restore_code text unique not null, data jsonb not null, updated_at timestamptz default now());
create table if not exists items (
  id uuid primary key, device_id text not null, name text not null, kind text not null, category text default '',
  color_name text default '', color_hex text default '', material text default '', pattern text default '',
  occasions jsonb default '[]', length text default '', rise text default '', fit text default '',
  image_path text not null, cutout_path text, wear_count int default 0, last_worn date, created_at timestamptz default now());
create index if not exists items_device on items(device_id);
create table if not exists plans (
  device_id text not null, date date not null, status text not null, outfit jsonb, options jsonb default '[]',
  weather jsonb, context jsonb default '{}', updated_at timestamptz default now(), primary key (device_id, date));
create table if not exists restore_attempts (at timestamptz not null default now());
alter table profiles enable row level security;
alter table items enable row level security;
alter table plans enable row level security;
alter table restore_attempts enable row level security;
`;

// Unbiased random string from a cryptographic RNG (rejection sampling removes modulo bias).
function randomString(len: number, alphabet: string): string {
  const limit = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < len) {
    for (const b of crypto.getRandomValues(new Uint8Array(len))) {
      if (b < limit && out.length < len) out += alphabet[b % alphabet.length];
    }
  }
  return out;
}
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
const RESTORE_CODE_LEN = 12; // about 59 bits; guessing is also rate limited below
const RESTORE_MAX_PER_10_MIN = 30; // global cap on restore attempts
let ready: Promise<void> | null = null;
function ensureReady(): Promise<void> {
  ready ??= (async () => {
    await sql.unsafe(SCHEMA);
    const { error } = await storage().createBucket(BUCKET, { public: false });
    if (error && !/exist/i.test(error.message)) console.error("bucket", error.message);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

// ---------- helpers ----------
const ITEM_COLS = sql`id, name, kind, category, color_name, color_hex, material, pattern, occasions, length, rise, fit,
  image_path, cutout_path, wear_count, to_char(last_worn, 'YYYY-MM-DD') as last_worn, created_at`;

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

async function toItems(rows: Row[]) {
  const paths = rows.flatMap((r) => [r.image_path, r.cutout_path].filter(Boolean)) as string[];
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await storage().from(BUCKET).createSignedUrls(paths, SIGN_SECONDS);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }
  return rows.map((r) => ({
    id: r.id, name: r.name, kind: r.kind, category: r.category, color_name: r.color_name, color_hex: r.color_hex,
    material: r.material, pattern: r.pattern, occasions: r.occasions ?? [], length: r.length, rise: r.rise, fit: r.fit,
    image_url: signed.get(r.image_path) ?? "", cutout_url: r.cutout_path ? signed.get(r.cutout_path) ?? null : null,
    wear_count: r.wear_count, last_worn: r.last_worn, created_at: r.created_at,
  }));
}

function toPlan(r: Row) {
  return { date: r.date, status: r.status, outfit: r.outfit ?? null, options: r.options ?? [], weather: r.weather ?? null,
    context: r.context ?? {} };
}
const PLAN_COLS = sql`to_char(date, 'YYYY-MM-DD') as date, status, outfit, options, weather, context`;

function checkDate(d: unknown): string {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new HttpError(400, "Ngày không hợp lệ.");
  return d;
}
const clip = (s: unknown, n: number) => String(s ?? "").slice(0, n);

// ---------- weather (Open-Meteo, no key) ----------
const PLACES: Record<string, [number, number]> = {
  "Hà Nội": [21.0285, 105.8542], "TP. Hồ Chí Minh": [10.8231, 106.6297], "Đà Nẵng": [16.0544, 108.2022],
};
async function getWeather(city: string, date: string) {
  const place = PLACES[city] ? city : "Hà Nội";
  const [lat, lon] = PLACES[place];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,precipitation_probability,wind_speed_10m,uv_index&timezone=Asia%2FBangkok&start_date=${date}&end_date=${date}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`open-meteo ${res.status}`);
  const h = (await res.json()).hourly as Record<string, number[]>;
  const part = (from: number, to: number) => {
    const idx = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const t = Math.round(idx.reduce((s, i) => s + (h.temperature_2m[i] ?? 0), 0) / idx.length);
    const rain = Math.max(...idx.map((i) => h.precipitation_probability[i] ?? 0));
    const wind = Math.round(Math.max(...idx.map((i) => h.wind_speed_10m[i] ?? 0)));
    const uv = Math.max(...idx.map((i) => h.uv_index[i] ?? 0));
    const cond = rain >= 60 ? "Mưa" : rain >= 35 ? "Có thể mưa" : t <= 17 ? "Trời lạnh" : uv >= 7 ? "Nắng gắt" : uv >= 3 ? "Nắng nhẹ" : t <= 22 ? "Trời mát" : "Trời dịu";
    return { t, cond, rain_pct: Math.round(rain), wind_kmh: wind };
  };
  const day = h.temperature_2m.slice(6, 23);
  const morning = part(6, 11), afternoon = part(12, 17), evening = part(18, 22);
  return {
    place, date, morning, afternoon, evening,
    t_min: Math.round(Math.min(...day)), t_max: Math.round(Math.max(...day)),
    uv_max: Math.round(Math.max(...h.uv_index.slice(6, 19))),
    summary: `Sáng ${morning.t}° · ${morning.cond}`,
  };
}
// Forecasts change slowly: keep them for 20 minutes per warm instance, and retry once on a flaky fetch.
const weatherCache = new Map<string, { at: number; data: Awaited<ReturnType<typeof getWeather>> }>();
async function weatherOrNull(city: string, date: string) {
  const key = `${city}|${date}`;
  const hit = weatherCache.get(key);
  if (hit && Date.now() - hit.at < 20 * 60 * 1000) return hit.data;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const data = await getWeather(city, date);
      weatherCache.set(key, { at: Date.now(), data });
      return data;
    } catch (e) {
      console.error("weather", { attempt, error: String(e) });
    }
  }
  return null;
}

// ---------- AI: read one garment photo ----------
const KINDS = ["top", "bottom", "dress", "outer", "shoes", "bag"];
const OCCASIONS = ["Đi làm", "Đi học", "Hẹn hò", "Cà phê, đi chơi", "Tiệc, đám cưới", "Du lịch", "Tập thể thao"];
const ITEM_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["is_clothing", "name", "kind", "category", "color_name", "color_hex", "material", "pattern", "occasions", "length", "rise", "fit"],
  properties: {
    is_clothing: { type: "boolean", description: "false nếu ảnh không có quần áo, giày hoặc túi rõ ràng" },
    name: { type: "string", description: "Tên ngắn tiếng Việt, vd 'Sơ mi xanh nhạt'" },
    kind: { type: "string", enum: KINDS },
    category: { type: "string", description: "vd 'Áo sơ mi', 'Quần jeans', 'Chân váy', 'Sneaker'" },
    color_name: { type: "string" },
    color_hex: { type: "string", description: "Màu chủ đạo dạng #RRGGBB" },
    material: { type: "string", description: "Chất liệu ước đoán, vd 'Cotton', 'Denim', 'Len'" },
    pattern: { type: "string", description: "vd 'Trơn', 'Kẻ sọc', 'Hoa'" },
    occasions: { type: "array", items: { type: "string", enum: OCCASIONS } },
    length: { type: "string", enum: ["", "crop", "ngang_hong", "qua_hong", "dai", "tren_goi", "ngang_goi", "mat_ca", "cham_dat"],
      description: "Áo, áo khoác: crop|ngang_hong|qua_hong|dai. Quần, chân váy, váy liền: tren_goi|ngang_goi|mat_ca|cham_dat. Giày, túi: rỗng" },
    rise: { type: "string", enum: ["", "cap_cao", "cap_vua", "cap_thap"], description: "Chỉ cho quần, chân váy; còn lại rỗng" },
    fit: { type: "string", enum: ["om", "vua", "rong"] },
  },
};

async function readGarment(b64: string) {
  const res = await openai().responses.create({
    model: VISION_MODEL,
    reasoning: { effort: "none" },
    max_output_tokens: 600,
    instructions: "Bạn nhận diện một món đồ thời trang trong ảnh cho app tủ đồ. Nếu ảnh có nhiều món, chọn món chính. " +
      "Trả lời tiếng Việt, ngắn, không emoji. kind: top=áo, bottom=quần hoặc chân váy, dress=váy liền, outer=áo khoác, shoes=giày, bag=túi.",
    input: [{ role: "user", content: [
      { type: "input_text", text: "Điền thông tin cho món đồ trong ảnh." },
      { type: "input_image", image_url: `data:image/jpeg;base64,${b64}`, detail: "high" },
    ] }],
    text: { format: { type: "json_schema", name: "item", strict: true, schema: ITEM_SCHEMA } },
  // deno-lint-ignore no-explicit-any
  } as any);
  return JSON.parse(res.output_text);
}

// remove.bg: limited free quota, so it only runs when the app asks for it AND the key is configured.
async function removeBackground(bytes: Uint8Array): Promise<Uint8Array | null> {
  const key = Deno.env.get("REMOVEBG_API_KEY");
  if (!key) return null;
  const form = new FormData();
  form.append("image_file", new Blob([bytes.buffer as ArrayBuffer], { type: "image/jpeg" }), "item.jpg");
  form.append("size", "auto");
  const res = await fetch("https://api.remove.bg/v1.0/removebg", { method: "POST", headers: { "X-API-Key": key }, body: form, signal: AbortSignal.timeout(25000) });
  if (!res.ok) {
    console.error("removebg", res.status, (await res.text()).slice(0, 200));
    return null;
  }
  return new Uint8Array(await res.arrayBuffer());
}

// Fallback when no remove.bg key is configured: ask the OpenAI image model for a transparent cut-out.
// It takes tens of seconds, so it runs after the response and fills items.cutout_path when done.
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };
const CUTOUT_MODEL = Deno.env.get("CUTOUT_MODEL") ?? "gpt-image-2.6-flare";
async function cutoutWithAI(id: string, device: string, bytes: Uint8Array): Promise<void> {
  const t0 = Date.now();
  try {
    // deno-lint-ignore no-explicit-any
    const params: any = {
      model: CUTOUT_MODEL,
      image: await toFile(bytes, "item.jpg", { type: "image/jpeg" }),
      prompt: "Remove the background completely. Keep the garment exactly as it is: same shape, colour, pattern, texture and details. " +
        "Show only the garment, centred, fully visible, on a fully transparent background. No person, hanger, mannequin, text or shadow.",
      background: "transparent",
      output_format: "png",
      quality: "low",
      size: "1024x1024",
    };
    if (CUTOUT_MODEL.startsWith("gpt-image-2.6")) params.complexity = "low";
    const res = await openai().images.edit(params);
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("no image returned");
    const path = `items/${device}/${id}.png`;
    const up = await storage().from(BUCKET).upload(path, decodeB64(b64), { contentType: "image/png", upsert: true });
    if (up.error) throw new Error(up.error.message);
    await sql`update items set cutout_path = ${path} where id = ${id} and device_id = ${device}`;
    console.log("cutout.ai", { ms: Date.now() - t0, model: CUTOUT_MODEL });
  } catch (e) {
    console.error("cutout.ai failed", { ms: Date.now() - t0, error: String(e).slice(0, 300) });
  }
}

function decodeB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- AI: suggest and edit outfits ----------
const OUTFIT_PROPS = {
  item_ids: { type: "array", items: { type: "string" }, description: "Mã món lấy đúng từ tủ đồ (vd i3)" },
  name: { type: "string", description: "Tên bộ 2-4 từ" },
  why: { type: "string", description: "1-2 câu: vì sao hợp thời tiết, dịp và cách di chuyển" },
  fit_note: { type: "string", description: "1 câu: bộ này làm được gì cho tỷ lệ cơ thể của người dùng, không phán xét" },
  warnings: { type: "array", items: { type: "string" }, description: "1-3 lời dặn ngắn theo thời tiết và di chuyển" },
};
const OUTFIT_REQ = ["item_ids", "name", "why", "fit_note", "warnings"];
const SUGGEST_SCHEMA = {
  type: "object", additionalProperties: false, required: ["outfits"],
  properties: { outfits: { type: "array", items: { type: "object", additionalProperties: false, required: OUTFIT_REQ, properties: OUTFIT_PROPS } } },
};
const EDIT_SCHEMA = {
  type: "object", additionalProperties: false, required: [...OUTFIT_REQ, "message"],
  properties: { ...OUTFIT_PROPS, message: { type: "string", description: "1 câu nói đã đổi gì và vì sao; nếu tủ thiếu món thì nói rõ thiếu gì" } },
};
const STYLIST_RULES =
  "Bạn là stylist cá nhân trong app tủ đồ của người Việt. Chỉ dùng món có trong tủ đồ, gọi bằng đúng mã (i1, i2...). " +
  "Mỗi bộ: một áo (top) và một quần hoặc chân váy (bottom), hoặc một váy liền (dress); thêm áo khoác (outer), giày (shoes), túi (bag) nếu tủ có và hợp trời. " +
  "Mỗi loại tối đa một món. Xét thời tiết sáng, chiều, tối; dịp; cách di chuyển (đi xe máy thì chú ý mưa, nắng, gió, váy ngắn bất tiện); quy định ăn mặc; phom người dùng thích. " +
  "fit_note phải gắn với chiều cao và tỷ lệ cơ thể của người dùng (vd cạp cao với áo ngắn giúp chân trông dài hơn), nói điều bộ đồ làm được, không chê cơ thể. " +
  "Trả lời tiếng Việt, câu ngắn, thân thiện, không emoji.";

const PROPORTION: Record<string, string> = { long_torso: "lưng dài, chân ngắn", balanced: "cân đối", long_legs: "chân dài, lưng ngắn" };
const COMMUTE: Record<string, string> = { xe_may: "xe máy", o_to: "ô tô", xe_buyt: "xe buýt", di_bo: "đi bộ" };

function describeUser(p: Row | null): string {
  if (!p) return "Chưa có hồ sơ.";
  return `Mặc ${p.wear === "m" ? "đồ nam" : p.wear === "u" ? "cả đồ nam và nữ" : "đồ nữ"}; nghề: ${p.job}; quy định ăn mặc: ${p.dress_code}; ` +
    `cao ${p.height_cm} cm, nặng ${p.weight_kg} kg, tỷ lệ ${PROPORTION[p.proportion] ?? "cân đối"}; thích phom ${p.fit_pref}; style: ${(p.styles ?? []).join(", ") || "chưa chọn"}.`;
}
function describeWeather(w: Row | null): string {
  if (!w) return "Không có dữ liệu thời tiết (đừng nhắc tới thời tiết trong lời dặn).";
  const f = (n: string, x: Row) => `${n} ${x.t}°C, ${x.cond}, mưa ${x.rain_pct}%, gió ${x.wind_kmh} km/h`;
  return `${w.place} ngày ${w.date}: ${f("sáng", w.morning)}; ${f("chiều", w.afternoon)}; ${f("tối", w.evening)}; UV cao nhất ${w.uv_max}.`;
}

// Short ids (i1..iN) keep the prompt small and make made-up ids easy to reject.
function shortIds(items: Row[]) {
  const toShort = new Map<string, string>(), toLong = new Map<string, string>();
  items.forEach((it, i) => { toShort.set(it.id, `i${i + 1}`); toLong.set(`i${i + 1}`, it.id); });
  const list = items.map((it) => ({ id: toShort.get(it.id), name: it.name, kind: it.kind, category: it.category, color: it.color_name,
    material: it.material, occasions: it.occasions, length: it.length, rise: it.rise, fit: it.fit, last_worn: it.last_worn }));
  return { toShort, toLong, list };
}

// Keep only real ids, one item per kind, and require a wearable base (top + bottom, or a dress).
function cleanOutfit(o: Row, toLong: Map<string, string>, byId: Map<string, Row>) {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const s of o.item_ids ?? []) {
    const id = toLong.get(String(s));
    const it = id ? byId.get(id) : null;
    if (!id || !it || seen.has(it.kind)) continue;
    seen.add(it.kind);
    ids.push(id);
  }
  if (seen.has("dress")) {
    // a dress replaces top + bottom
    const drop = new Set(ids.filter((id) => ["top", "bottom"].includes(byId.get(id)!.kind)));
    for (const id of drop) ids.splice(ids.indexOf(id), 1);
  } else if (!(seen.has("top") && seen.has("bottom"))) return null;
  return { item_ids: ids, name: clip(o.name, 60), why: clip(o.why, 400), fit_note: clip(o.fit_note, 300),
    warnings: (o.warnings ?? []).slice(0, 3).map((w: unknown) => clip(w, 160)) };
}

async function loadContext(device: string) {
  const [prof] = await sql`select data from profiles where device_id = ${device}`;
  const items = await sql`select ${ITEM_COLS} from items where device_id = ${device} order by created_at desc limit ${MAX_ITEMS_FOR_AI}`;
  return { profile: (prof?.data ?? null) as Row | null, items: items as unknown as Row[] };
}

// ---------- actions ----------
// deno-lint-ignore no-explicit-any
async function route(action: string, device: string, body: any): Promise<unknown> {
  switch (action) {
    case "profile.get": {
      const [r] = await sql`select data, restore_code from profiles where device_id = ${device}`;
      return { profile: r?.data ?? null, restore_code: r?.restore_code ?? null };
    }
    case "profile.save": {
      const p = body.profile;
      if (!p || typeof p !== "object" || !(p.height_cm >= 120 && p.height_cm <= 210) || !(p.weight_kg >= 30 && p.weight_kg <= 150))
        throw new HttpError(400, "Hồ sơ chưa hợp lệ, kiểm tra lại chiều cao và cân nặng.");
      if (JSON.stringify(p).length > 4000) throw new HttpError(400, "Hồ sơ quá dài.");
      const code = randomString(RESTORE_CODE_LEN, CODE_ALPHABET);
      const [r] = await sql`insert into profiles (device_id, restore_code, data) values (${device}, ${code}, ${sql.json(p)})
        on conflict (device_id) do update set data = excluded.data, updated_at = now() returning data, restore_code`;
      return { profile: r.data, restore_code: r.restore_code };
    }
    case "profile.restore": {
      // A restore code works like a password for the wardrobe, so cap guessing globally.
      await sql`insert into restore_attempts default values`;
      const [{ n }] = await sql`select count(*)::int as n from restore_attempts where at > now() - interval '10 minutes'`;
      if (n > RESTORE_MAX_PER_10_MIN) throw new HttpError(429, "Có quá nhiều lần thử, đợi ít phút rồi nhập lại nhé.");
      if (n === 1) await sql`delete from restore_attempts where at < now() - interval '1 day'`;
      const code = clip(body.restore_code, 24).toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code.length !== RESTORE_CODE_LEN) throw new HttpError(404, "Mã khôi phục không đúng.");
      const [r] = await sql`select device_id from profiles where restore_code = ${code}`;
      if (!r) throw new HttpError(404, "Mã khôi phục không đúng.");
      return { device_id: r.device_id };
    }
    case "items.list": {
      const rows = await sql`select ${ITEM_COLS} from items where device_id = ${device} order by created_at desc limit 200`;
      return { items: await toItems(rows as unknown as Row[]) };
    }
    case "item.add": {
      const b64 = body.image_base64;
      if (typeof b64 !== "string" || b64.length < 1000) throw new HttpError(400, "Thiếu ảnh.");
      if (b64.length > MAX_IMAGE_B64) throw new HttpError(413, "Ảnh quá lớn, thử chụp lại nhé.");
      const t0 = Date.now();
      const ai = await readGarment(b64);
      if (!ai.is_clothing) throw new HttpError(422, "Mình chưa nhận ra món đồ trong ảnh, bạn chụp lại nhé.");
      const id = crypto.randomUUID();
      const bytes = decodeB64(b64);
      const imagePath = `items/${device}/${id}.jpg`;
      const up = await storage().from(BUCKET).upload(imagePath, bytes, { contentType: "image/jpeg" });
      if (up.error) throw new Error(`upload: ${up.error.message}`);
      let cutoutPath: string | null = null;
      if (body.remove_bg === true) {
        const png = await removeBackground(bytes).catch((e) => (console.error("removebg", String(e)), null));
        if (png) {
          cutoutPath = `items/${device}/${id}.png`;
          const cu = await storage().from(BUCKET).upload(cutoutPath, png, { contentType: "image/png" });
          if (cu.error) cutoutPath = null;
        }
      }
      const [row] = await sql`insert into items (id, device_id, name, kind, category, color_name, color_hex, material, pattern, occasions, length, rise, fit, image_path, cutout_path)
        values (${id}, ${device}, ${clip(ai.name, 80)}, ${ai.kind}, ${clip(ai.category, 60)}, ${clip(ai.color_name, 40)}, ${clip(ai.color_hex, 9)}, ${clip(ai.material, 40)},
          ${clip(ai.pattern, 40)}, ${sql.json(ai.occasions ?? [])}, ${ai.length ?? ""}, ${ai.rise ?? ""}, ${ai.fit ?? "vua"}, ${imagePath}, ${cutoutPath})
        returning ${ITEM_COLS}`;
      // No remove.bg result: let the AI cut-out run in the background; the app sees it on the next items.list.
      if (body.remove_bg === true && !cutoutPath) EdgeRuntime.waitUntil(cutoutWithAI(id, device, bytes));
      console.log("item.add", { ms: Date.now() - t0, model: VISION_MODEL, cutout: !!cutoutPath });
      return { item: (await toItems([row as Row]))[0] };
    }
    case "item.update": {
      const p = body.patch ?? {};
      const text: Record<string, string> = {};
      for (const k of ["name", "kind", "category", "color_name", "color_hex", "material", "pattern", "length", "rise", "fit"])
        if (typeof p[k] === "string") text[k] = clip(p[k], 80);
      if (text.kind && !KINDS.includes(text.kind)) throw new HttpError(400, "Loại món không hợp lệ.");
      const id = clip(body.id, 40);
      if (Object.keys(text).length) await sql`update items set ${sql(text, ...Object.keys(text))} where id = ${id} and device_id = ${device}`;
      if (Array.isArray(p.occasions)) await sql`update items set occasions = ${sql.json(p.occasions.slice(0, 7).map((o: unknown) => clip(o, 40)))} where id = ${id} and device_id = ${device}`;
      const [row] = await sql`select ${ITEM_COLS} from items where id = ${id} and device_id = ${device}`;
      if (!row) throw new HttpError(404, "Không tìm thấy món đồ.");
      return { item: (await toItems([row as Row]))[0] };
    }
    case "item.delete": {
      const [row] = await sql`delete from items where id = ${clip(body.id, 40)} and device_id = ${device} returning image_path, cutout_path`;
      if (row) await storage().from(BUCKET).remove([row.image_path, row.cutout_path].filter(Boolean));
      return { ok: true };
    }
    case "weather.get": {
      const date = checkDate(body.date);
      const [prof] = await sql`select data from profiles where device_id = ${device}`;
      const weather = await weatherOrNull(prof?.data?.city ?? "Hà Nội", date);
      if (!weather) throw new HttpError(502, "Chưa lấy được thời tiết, thử lại nhé.");
      return { weather };
    }
    case "plan.get": {
      const [r] = await sql`select ${PLAN_COLS} from plans where device_id = ${device} and date = ${checkDate(body.date)}`;
      return { plan: r ? toPlan(r) : null };
    }
    case "plan.set": {
      const date = checkDate(body.date);
      const status = String(body.status);
      if (!["suggested", "planned", "worn"].includes(status)) throw new HttpError(400, "Trạng thái không hợp lệ.");
      const [old] = await sql`select status, outfit from plans where device_id = ${device} and date = ${date}`;
      const outfit = body.outfit ?? old?.outfit ?? null;
      if (!outfit) throw new HttpError(400, "Chưa có outfit để chốt.");
      if (JSON.stringify(outfit).length > 3000) throw new HttpError(400, "Outfit không hợp lệ.");
      const [r] = await sql`insert into plans (device_id, date, status, outfit, options) values (${device}, ${date}, ${status}, ${sql.json(outfit)}, ${sql.json([outfit])})
        on conflict (device_id, date) do update set status = excluded.status, outfit = excluded.outfit, updated_at = now() returning ${PLAN_COLS}`;
      if (status === "worn" && old?.status !== "worn" && Array.isArray(outfit.item_ids) && outfit.item_ids.length)
        await sql`update items set wear_count = wear_count + 1, last_worn = ${date} where device_id = ${device} and id::text in ${sql(outfit.item_ids.map(String))}`;
      return { plan: toPlan(r) };
    }
    case "outfit.suggest": {
      const date = checkDate(body.date);
      const occasion = clip(body.occasion || "Đi làm", 40);
      const commute = COMMUTE[body.commute] ? String(body.commute) : "xe_may";
      const { profile, items } = await loadContext(device);
      const kinds = new Set(items.map((i) => i.kind));
      if (items.length < 3 || !(kinds.has("dress") || (kinds.has("top") && kinds.has("bottom"))))
        throw new HttpError(409, "Tủ đồ chưa đủ để phối. Thêm ít nhất một áo và một quần nhé.");
      // The app sends the forecast it fetched itself (Open-Meteo refuses this server's shared address).
      const w = body.weather;
      const sent = w && typeof w === "object" && w.date === date && typeof w.morning?.t === "number" && typeof w.afternoon?.t === "number" &&
        typeof w.evening?.t === "number" && JSON.stringify(w).length < 1500 ? w : null;
      const [weather, worn] = await Promise.all([
        sent ?? null,
        sql`select outfit from plans where device_id = ${device} and status = 'worn' and date < ${date} and date >= ${date}::date - 7`,
      ]);
      const { toShort, toLong, list } = shortIds(items);
      const byId = new Map(items.map((i) => [i.id as string, i]));
      const recent = (worn as unknown as Row[]).map((w) => (w.outfit?.item_ids ?? []).map((id: string) => toShort.get(id)).filter(Boolean));
      const t0 = Date.now();
      const tier = Deno.env.get("STYLIST_TIER");
      const res = await openai().responses.create({
        model: STYLIST_MODEL,
        reasoning: { effort: "low" },
        max_output_tokens: 2500,
        ...(tier ? { service_tier: tier } : {}),
        instructions: STYLIST_RULES + " Đưa ra đúng 3 bộ khác nhau rõ rệt, bộ đầu là bộ bạn khuyên nhất. Tránh lặp lại các bộ đã mặc gần đây nếu còn lựa chọn khác.",
        input: `Người dùng: ${describeUser(profile)}\nThời tiết: ${describeWeather(weather)}\nDịp: ${occasion}. Di chuyển: ${COMMUTE[commute]}.\n` +
          `Các bộ đã mặc 7 ngày qua: ${JSON.stringify(recent)}\nTủ đồ: ${JSON.stringify(list)}`,
        text: { format: { type: "json_schema", name: "outfits", strict: true, schema: SUGGEST_SCHEMA } },
      // deno-lint-ignore no-explicit-any
      } as any);
      const outfits = (JSON.parse(res.output_text).outfits as Row[]).map((o) => cleanOutfit(o, toLong, byId)).filter(Boolean).slice(0, 3);
      console.log("outfit.suggest", { ms: Date.now() - t0, model: STYLIST_MODEL, items: items.length, outfits: outfits.length });
      if (!outfits.length) throw new HttpError(502, "AI chưa phối được bộ nào, thử lại nhé.");
      const context = { occasion, commute };
      const [r] = await sql`insert into plans (device_id, date, status, outfit, options, weather, context)
        values (${device}, ${date}, 'suggested', ${sql.json(outfits[0])}, ${sql.json(outfits)}, ${sql.json(weather)}, ${sql.json(context)})
        on conflict (device_id, date) do update set status = 'suggested', outfit = excluded.outfit, options = excluded.options,
          weather = excluded.weather, context = excluded.context, updated_at = now() returning ${PLAN_COLS}`;
      return { plan: toPlan(r) };
    }
    case "outfit.edit": {
      const date = checkDate(body.date);
      const text = clip(body.text, 300).trim();
      if (!text) throw new HttpError(400, "Bạn muốn đổi gì?");
      const [plan] = await sql`select ${PLAN_COLS} from plans where device_id = ${device} and date = ${date}`;
      if (!plan?.outfit) throw new HttpError(409, "Chưa có outfit cho ngày này.");
      const { profile, items } = await loadContext(device);
      const { toShort, toLong, list } = shortIds(items);
      const byId = new Map(items.map((i) => [i.id as string, i]));
      const current = (plan.outfit.item_ids ?? []).map((id: string) => toShort.get(id)).filter(Boolean);
      const t0 = Date.now();
      const res = await openai().responses.create({
        model: EDIT_MODEL,
        reasoning: { effort: "none" },
        max_output_tokens: 900,
        instructions: STYLIST_RULES + " Người dùng muốn chỉnh bộ đang chọn. Chỉ đổi món cần đổi, giữ phần còn lại. " +
          "Nếu tủ không có món phù hợp, giữ nguyên bộ cũ và nói rõ thiếu gì trong message.",
        input: `Người dùng: ${describeUser(profile)}\nThời tiết: ${describeWeather(plan.weather)}\nDịp: ${plan.context?.occasion ?? "Đi làm"}. ` +
          `Di chuyển: ${COMMUTE[plan.context?.commute] ?? "xe máy"}.\nBộ đang chọn: ${JSON.stringify(current)} (${plan.outfit.name})\n` +
          `Yêu cầu: "${text}"\nTủ đồ: ${JSON.stringify(list)}`,
        text: { format: { type: "json_schema", name: "edit", strict: true, schema: EDIT_SCHEMA } },
      // deno-lint-ignore no-explicit-any
      } as any);
      const out = JSON.parse(res.output_text);
      const cleaned = cleanOutfit(out, toLong, byId);
      console.log("outfit.edit", { ms: Date.now() - t0, model: EDIT_MODEL, ok: !!cleaned });
      const message = clip(out.message, 300) || "Đã đổi theo ý bạn.";
      if (!cleaned) return { plan: toPlan(plan), message: "Mình chưa đổi được: " + message };
      const [r] = await sql`update plans set outfit = ${sql.json(cleaned)}, updated_at = now() where device_id = ${device} and date = ${date} returning ${PLAN_COLS}`;
      return { plan: toPlan(r), message };
    }
    default:
      throw new HttpError(400, "Yêu cầu không hợp lệ.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  if (!allowedKeys().includes(req.headers.get("apikey") ?? "")) return json({ error: "unauthorized" }, 401);

  const started = Date.now();
  let action = "?";
  try {
    const raw = await req.text();
    if (raw.length > MAX_IMAGE_B64 + 20_000) return json({ error: "Dữ liệu gửi lên quá lớn." }, 413);
    const body = JSON.parse(raw);
    action = String(body.action ?? "");
    // The server mints device ids (128 random bits): the id is the only credential an install has.
    if (action === "device.new") return json({ device_id: "d_" + randomString(32, "0123456789abcdef") });
    const device = String(body.device_id ?? "");
    if (!/^[a-z0-9_]{8,64}$/.test(device)) return json({ error: "Thiếu mã thiết bị." }, 400);
    await ensureReady();
    const out = await route(action, device, body);
    const ms = Date.now() - started;
    console.log("ok", { action, ms });
    // server_ms lets us tell model time from network time when measuring on a slow connection
    return json({ ...(out as Record<string, unknown>), server_ms: ms });
  } catch (err) {
    const known = err instanceof HttpError;
    console.error("failed", { action, ms: Date.now() - started, error: String(err) });
    return json({ error: known ? err.message : "Máy chủ đang bận, thử lại nhé." }, known ? err.status : 502);
  }
});
