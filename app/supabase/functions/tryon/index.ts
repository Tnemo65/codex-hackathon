// "Mặc thử AI": body photo + up to 5 garment images -> one image of that person wearing the outfit.
// Isolated from the core `api` function so image generation cannot break it. Runs as a background job.
// Contract: app/src/screens/TryOn.tsx and tryonApi in app/src/api.ts.
import OpenAI, { toFile } from "npm:openai";
import postgres from "npm:postgres";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = Deno.env.get("TRYON_MODEL") ?? "gpt-image-2.6-sunburst";
const FALLBACK_MODEL = "gpt-image-2.6-flare";
const QUALITY = Deno.env.get("TRYON_QUALITY") ?? "low";
const BUCKET = "wardrobe";
const SIGN_SECONDS = 60 * 60 * 24 * 7;
const MAX_IMAGE_B64 = 1_500_000; // 1.5 MB of base64 (about 1.1 MB of JPEG)
const MAX_GARMENTS = 5;
// Free plan wall clock is 150 s (paid 400 s); keep the OpenAI call under it so the job can record a failure.
const OPENAI_TIMEOUT_MS = 135_000;
const STALE_MS = 170_000;
const MAX_JOBS_PER_DEVICE = 6; // per 24 hours
const MAX_JOBS_GLOBAL = 60; // per 24 hours
const MAX_BODY_CHARS = (MAX_GARMENTS + 1) * MAX_IMAGE_B64 + 20_000;
const DEVICE_RE = /^[a-z0-9_]{8,64}$/; // same rule as the `api` function

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
    const parsed = JSON.parse(dict) as Record<string, string>;
    const key = parsed["default"] ?? Object.values(parsed)[0];
    if (key) return key;
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
}

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 20 });
const storage = () => createClient(Deno.env.get("SUPABASE_URL")!, secretKey(), { auth: { persistSession: false } }).storage;

const SCHEMA = `
create table if not exists tryon_jobs (
  id uuid primary key default gen_random_uuid(), device_id text not null, status text not null default 'pending',
  image_path text, error text, item_ids text[], ms int, created_at timestamptz default now());
create index if not exists tryon_jobs_device on tryon_jobs(device_id);
alter table tryon_jobs enable row level security;
`;
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanB64(s: unknown): string {
  if (typeof s !== "string" || !s) throw new HttpError(400, "Ảnh không hợp lệ.");
  // Check the raw length first so a huge string is never processed further.
  if (s.length > MAX_IMAGE_B64 + 100) throw new HttpError(413, "Ảnh quá lớn, chọn ảnh nhỏ hơn nhé.");
  const b64 = s.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
  if (b64.length > MAX_IMAGE_B64) throw new HttpError(413, "Ảnh quá lớn, chọn ảnh nhỏ hơn nhé.");
  return b64;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const PROMPT = [
  "Virtual try-on. The FIRST image is a photo of a real person. The other images are individual garments and accessories.",
  "Create one photorealistic full-body photo of the SAME person wearing exactly these garments.",
  "Keep the same person: identical face, facial features, hair, skin tone, body shape, body proportions, height and pose. Do not slim, reshape or lengthen the body or legs. Do not beautify the face.",
  "Dress them in exactly the provided garments and nothing else visible from their original clothes, keeping each garment's colour, pattern, fabric, length and cut.",
  "Correct layering: outerwear over the top, top tucked or untucked naturally, shoes on the feet, bag carried on the shoulder or in the hand.",
  "If no shoes are provided, use simple neutral shoes. Plain light neutral studio background, soft even lighting.",
  "Full body visible from head to feet, centred, portrait framing. No text, no logos, no watermark.",
].join(" ");

// Short Vietnamese message for the app, distinguishing the cases the user can act on.
function describeError(err: unknown): { message: string; modelUnavailable: boolean } {
  const e = err as { status?: number; code?: string; type?: string; message?: string; name?: string };
  const msg = String(e?.message ?? err);
  const code = String(e?.code ?? "");
  if (code === "moderation_blocked" || /moderation|safety system|content policy/i.test(msg)) {
    return { message: "Ảnh bị bộ lọc nội dung chặn. Thử ảnh toàn thân khác, mặc đồ gọn gàng hơn nhé.", modelUnavailable: false };
  }
  if (/verif/i.test(msg) || code === "model_not_found" || e?.status === 404 || (e?.status === 403)) {
    return { message: "Dịch vụ tạo ảnh chưa sẵn sàng cho tài khoản này (cần xác minh tổ chức hoặc chưa có quyền dùng model).", modelUnavailable: true };
  }
  if (e?.name === "APIConnectionTimeoutError" || /timed? ?out|timeout/i.test(msg)) {
    return { message: "Tạo ảnh quá lâu nên đã dừng. Thử lại với ít món hơn nhé.", modelUnavailable: false };
  }
  return { message: "AI tạm thời không tạo được ảnh, thử lại sau nhé.", modelUnavailable: false };
}

async function generate(model: string, images: File[]): Promise<string> {
  const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY"), timeout: OPENAI_TIMEOUT_MS, maxRetries: 0 });
  // deno-lint-ignore no-explicit-any
  const params: any = {
    model,
    image: images,
    prompt: PROMPT,
    size: "1024x1536",
    quality: QUALITY,
    output_format: "jpeg",
  };
  if (model.startsWith("gpt-image-2.6")) params.complexity = "low";
  const res = await openai.images.edit(params);
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("no image in response");
  return b64;
}

async function runJob(jobId: string, images: File[]) {
  const started = Date.now();
  let model = MODEL;
  try {
    let b64: string;
    try {
      b64 = await generate(model, images);
    } catch (err) {
      const d = describeError(err);
      if (!d.modelUnavailable || model === FALLBACK_MODEL) throw err;
      console.error("primary model unavailable, trying fallback", { model, error: String((err as Error)?.message ?? err) });
      model = FALLBACK_MODEL;
      b64 = await generate(model, images);
    }
    const path = `tryon/${jobId}.jpg`;
    const { error } = await storage().from(BUCKET).upload(path, b64ToBytes(b64), { contentType: "image/jpeg", upsert: true });
    if (error) throw new Error(`storage: ${error.message}`);
    const ms = Date.now() - started;
    await sql`update tryon_jobs set status = 'done', image_path = ${path}, ms = ${ms} where id = ${jobId}`;
    console.log("tryon done", { ms, model, images: images.length });
  } catch (err) {
    const ms = Date.now() - started;
    const e = err as { status?: number; code?: string; message?: string };
    console.error("tryon failed", { ms, model, status: e?.status, code: e?.code, error: String(e?.message ?? err) });
    const { message } = describeError(err);
    await sql`update tryon_jobs set status = 'failed', error = ${message}, ms = ${ms} where id = ${jobId}`.catch(() => {});
  }
}

async function loadGarments(device: string, ids: string[]): Promise<File[]> {
  const valid = ids.filter((id) => UUID_RE.test(id));
  if (!valid.length) return [];
  let rows: { id: string; image_path: string; cutout_path: string | null }[] = [];
  try {
    rows = await sql`select id, image_path, cutout_path from items where device_id = ${device} and id = any(${valid}::uuid[])`;
  } catch (e) {
    console.error("items read", String(e));
    return [];
  }
  const files: File[] = [];
  for (const id of valid) {
    const row = rows.find((r) => String(r.id) === id);
    if (!row) continue;
    const { data, error } = await storage().from(BUCKET).download(row.cutout_path ?? row.image_path);
    if (error || !data) {
      console.error("garment download", id, error?.message);
      continue;
    }
    const isPng = /\.png$/i.test(row.cutout_path ?? row.image_path);
    files.push(await toFile(data, `garment-${files.length + 1}.${isPng ? "png" : "jpg"}`, { type: isPng ? "image/png" : "image/jpeg" }));
  }
  return files;
}

// Image generation costs money: only devices with a saved profile, and per-device / global daily caps.
async function checkAllowed(device: string) {
  if (!DEVICE_RE.test(device)) throw new HttpError(400, "Mã thiết bị không hợp lệ.");
  if (device !== Deno.env.get("TRYON_TEST_DEVICE")) {
    let hasProfile = false;
    try {
      const rows = await sql`select 1 from profiles where device_id = ${device} limit 1`;
      hasProfile = rows.length > 0;
    } catch (e) {
      console.error("profiles read", String(e)); // table not created yet -> no profile
    }
    if (!hasProfile) throw new HttpError(403, "Hãy hoàn tất hồ sơ trước khi dùng Mặc thử AI.");
  }
  const [q] = await sql`select
      count(*) filter (where device_id = ${device})::int as mine,
      count(*)::int as total
    from tryon_jobs where created_at > now() - interval '24 hours'`;
  if (q.mine >= MAX_JOBS_PER_DEVICE) throw new HttpError(429, "Hôm nay bạn đã tạo đủ 6 ảnh phối. Mai thử tiếp nhé.");
  if (q.total >= MAX_JOBS_GLOBAL) throw new HttpError(429, "Mặc thử AI đang quá tải hôm nay. Thử lại sau nhé.");
}

async function create(device: string, body: Record<string, unknown>) {
  await checkAllowed(device);
  const itemIds = Array.isArray(body.item_ids) ? (body.item_ids as unknown[]).map(String).slice(0, 10) : [];
  const extras = Array.isArray(body.item_images_base64) ? (body.item_images_base64 as unknown[]) : [];
  if (itemIds.length + extras.length > MAX_GARMENTS) throw new HttpError(400, "Chọn tối đa 5 món để phối.");
  const extraB64 = extras.map(cleanB64);

  // Body photo: store the new one, or reuse the stored one.
  const bodyPath = `body/${device}.jpg`;
  let bodyFile: File;
  if (body.body_image_base64) {
    const bytes = b64ToBytes(cleanB64(body.body_image_base64));
    const { error } = await storage().from(BUCKET).upload(bodyPath, bytes, { contentType: "image/jpeg", upsert: true });
    if (error) console.error("body upload", error.message);
    bodyFile = await toFile(bytes, "person.jpg", { type: "image/jpeg" });
  } else {
    const { data } = await storage().from(BUCKET).download(bodyPath);
    if (!data) throw new HttpError(400, "Cần một ảnh toàn thân để tạo ảnh phối.");
    bodyFile = await toFile(data, "person.jpg", { type: "image/jpeg" });
  }

  const garments = await loadGarments(device, itemIds);
  for (const b64 of extraB64) garments.push(await toFile(b64ToBytes(b64), `garment-${garments.length + 1}.jpg`, { type: "image/jpeg" }));
  if (!garments.length) throw new HttpError(400, "Chưa có ảnh món đồ nào để phối.");

  const [job] = await sql`insert into tryon_jobs (device_id, item_ids) values (${device}, ${itemIds}) returning id`;
  const jobId = String(job.id);
  console.log("tryon start", { job: jobId, model: MODEL, garments: garments.length });
  // Respond now; the generation keeps running until the promise settles (or the wall clock limit).
  const task = runJob(jobId, [bodyFile, ...garments]);
  (globalThis as unknown as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(task);
  return { job_id: jobId };
}

async function status(device: string, body: Record<string, unknown>) {
  const jobId = String(body.job_id ?? "");
  if (!UUID_RE.test(jobId)) throw new HttpError(400, "Thiếu mã yêu cầu.");
  const [row] = await sql`select status, image_path, error, created_at from tryon_jobs where id = ${jobId} and device_id = ${device}`;
  if (!row) throw new HttpError(404, "Không tìm thấy yêu cầu tạo ảnh.");
  if (row.status === "pending" && Date.now() - new Date(row.created_at).getTime() > STALE_MS) {
    const error = "Tạo ảnh quá lâu nên đã dừng. Thử lại với ít món hơn nhé.";
    await sql`update tryon_jobs set status = 'failed', error = ${error} where id = ${jobId} and status = 'pending'`;
    return { status: "failed", image_url: null, error };
  }
  let imageUrl: string | null = null;
  if (row.status === "done" && row.image_path) {
    const { data } = await storage().from(BUCKET).createSignedUrl(row.image_path, SIGN_SECONDS);
    imageUrl = data?.signedUrl ?? null;
  }
  return { status: row.status, image_url: imageUrl, error: row.error ?? null };
}

addEventListener("beforeunload", (ev) => {
  console.log("tryon shutdown", (ev as unknown as { detail?: { reason?: string } }).detail?.reason);
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  if (!allowedKeys().includes(req.headers.get("apikey") ?? "")) return json({ error: "unauthorized" }, 401);

  try {
    // Cap the size before parsing so an oversized request is rejected cheaply.
    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) throw new HttpError(413, "Ảnh quá lớn, chọn ảnh nhỏ hơn nhé.");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new HttpError(400, "Yêu cầu không hợp lệ.");
    }
    if (!body || typeof body !== "object") throw new HttpError(400, "Yêu cầu không hợp lệ.");
    const device = typeof body.device_id === "string" ? body.device_id : "";
    if (!DEVICE_RE.test(device)) throw new HttpError(400, "Thiếu mã thiết bị.");
    await ensureReady();
    if (body.action === "tryon.create") return json(await create(device, body));
    if (body.action === "tryon.status") return json(await status(device, body));
    throw new HttpError(400, "Yêu cầu không hợp lệ.");
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    console.error("tryon request failed", String(err));
    return json({ error: "Máy chủ tạm thời lỗi, thử lại nhé." }, 500);
  }
});
