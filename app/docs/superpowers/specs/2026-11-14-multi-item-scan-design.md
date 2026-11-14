# Multi-item scan from one photo — short design + plan

**Intent.** A full-body photo (shirt + jeans + sneakers) must add every piece, not only the "main" one. Matches Figma "scan · Nhận diện món từ ảnh" (6:3404) and "confirm · Xác nhận món đã nhận diện" (6:3419). Approved by the user on 14/11.

**Approaches.** (1, picked) AI lists every piece; each kept piece gets its own AI cut-out generated from the full photo with a "extract only the <piece>" prompt. (2, rejected) AI bounding boxes + server crop: needs an image library in Deno and LLM boxes are imprecise.

**Design.**
- `items.detect {image_base64}` → `{ detections: Detection[] }`. One vision call; Detection = the item fields (name, kind, category, color_name, color_hex, material, pattern, occasions, length, rise, fit) + `confidence` 0–100. Max 6, worn/visible clothing, shoes and bags only. None → 422 "Mình chưa nhận ra món đồ…".
- `items.add_many {image_base64, detections, remove_bg}` → `{ items: Item[] }`. Uploads the photo once, inserts one row per detection sharing `image_path`, then (remove_bg) runs `cutoutWithAI` per item in the background with the piece's description. remove.bg is skipped here (it would cut out the whole person).
- `item.delete` removes the original photo only when no other item still uses it.
- App (Tủ đồ → Thêm đồ): photo → ThoughtLine "AI đang nhận diện" → if 1 piece: add it and open ReviewItem as before; if several: "Kiểm tra món đồ" list (thumb of the photo, name, "Loại · Độ chính xác N%", checkbox, all checked) → "Thêm N món" → back to the grid.

**Plan.** 1) client types/api contract; 2) backend actions + delete guard, deploy, live test with a full-body photo; 3) Wardrobe scan/confirm UI; 4) tsc, ship. No automated tests (no runner; live call is the check).
