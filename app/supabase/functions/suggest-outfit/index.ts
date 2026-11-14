// Supabase Edge Function: app -> here -> OpenAI. The OpenAI key lives only in function secrets.
import OpenAI from "npm:openai";

const MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-6-luna";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, content-type, authorization",
};

// verify_jwt is off (publishable keys are not JWTs), so check the apikey header ourselves.
function allowedKeys(): string[] {
  const keys: string[] = [];
  const publishable = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (publishable) keys.push(...Object.values(JSON.parse(publishable) as Record<string, string>));
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (anon) keys.push(anon);
  return keys;
}

const OUTFIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "reason", "tip"],
  properties: {
    items: { type: "array", items: { type: "string" }, description: "Món đồ chọn từ tủ đồ" },
    reason: { type: "string", description: "Một câu ngắn: vì sao chọn bộ này" },
    tip: { type: "string", description: "Lời dặn ngắn theo thời tiết trong ngày" },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

  if (!allowedKeys().includes(req.headers.get("apikey") ?? "")) return json({ error: "unauthorized" }, 401);

  const started = Date.now();
  try {
    const { wardrobe, weather, occasion } = await req.json();
    console.log("request", { items: wardrobe?.length, weather, occasion });

    // Created per request so a missing OPENAI_API_KEY becomes a logged 502, not a boot crash.
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
    const response = await openai.responses.create({
      model: MODEL,
      reasoning: { effort: "low" },
      instructions:
        "Bạn là stylist cá nhân. Chỉ chọn món có trong tủ đồ của người dùng. " +
        "Trả lời bằng tiếng Việt, câu ngắn, thân thiện, không emoji.",
      input: `Tủ đồ: ${JSON.stringify(wardrobe)}\nThời tiết hôm nay: ${weather}\nDịp: ${occasion}\nChốt một outfit.`,
      text: { format: { type: "json_schema", name: "outfit", strict: true, schema: OUTFIT_SCHEMA } },
    });

    const outfit = JSON.parse(response.output_text);
    console.log("result", { ms: Date.now() - started, model: MODEL, outfit });
    return json(outfit);
  } catch (err) {
    console.error("failed", { ms: Date.now() - started, error: String(err) });
    return json({ error: "AI tạm thời không phản hồi, thử lại nhé." }, 502);
  }
});
