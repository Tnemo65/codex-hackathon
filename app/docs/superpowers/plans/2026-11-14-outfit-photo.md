# Outfit photo ("Trên người") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 2D-only "Trên người" view with the Figma layout: AI photo of the outfit on a profile-based model (left) + garment thumbnails with names (right).

**Architecture:** One new presentational+fetching component `OutfitPhoto` that wraps the existing `OutfitOnBody` as its placeholder/fallback, calling the already deployed `tryon` function with `body_mode: "profile"` and caching job ids per outfit.

**Tech Stack:** Expo SDK 58 / React Native, AsyncStorage, Supabase Edge Function `tryon` (already deployed with profile mode).

**Spec:** `app/docs/superpowers/specs/2026-11-14-outfit-photo-design.md`

## Global Constraints

- No new npm packages; Expo Go compatible.
- No git in this session (user commits on request).
- Figma: photo column ~241×494, thumbs 95×79, label 11px bold, thumbs right column (`Khung xem outfit`, node 10:1161).
- Try-on cap 20 jobs / device / 24 h: never create a second job for an outfit key that already has one.
- Only owned items go to try-on; any shop product in the outfit → 2D figure only.
- No automated tests (app has no test runner; rule.md: tests only for tricky core logic). Verification = `npx tsc --noEmit` + one live generation.

## Review Focus

- Outfit changes (swipe) while a job is polling → the old result must not land on the new outfit.
- Cached job later fails/expired (status `failed` or 404) → drop cache entry, show 2D + "Thử lại", no silent retry loop.
- Profile missing / cap reached (403/429) → 2D figure with the server's message, no crash.
- Image URL loads slowly → keep 2D underneath until `onLoad`, then fade.
- Outfit with 1 item or only accessories → still renders (try-on accepts ≥1 garment).

---

### Task 1: Client API + OutfitPhoto component

**Files:**
- Modify: `app/src/api.ts` (`tryonApi.create`)
- Create: `app/src/components/OutfitPhoto.tsx`

**Interfaces:**
- Produces: `tryonApi.create(item_ids: string[], body_image_base64: string | null, body_mode?: 'profile')`
- Produces: `export function OutfitPhoto({ items, profile, width, height }: { items: Item[]; profile: Profile | null; width: number; height: number })`

- [ ] Step 1: add optional `body_mode` to `tryonApi.create` payload.
- [ ] Step 2: implement `OutfitPhoto`: key = sorted owned ids joined by `|`; AsyncStorage key `tudo.outfit_photo` holding `{ [key]: job_id }`; on key change: cached job → `status`; else (all items owned) `create(ids, null, 'profile')`, store job, poll every 3 s up to 170 s; guard against stale key with a ref. Layout: left photo column (width ≈ 0.69×width) showing `OutfitOnBody` underneath + scan line while pending, `Animated.Image` fading in on load; right column thumbs 95×79-ish scaled, names 11px bold, order outer/top/dress/bottom/shoes/bag; small "Thử lại" on failure (clears cache entry). Mark nothing as mock.
- [ ] Step 3: `npx tsc --noEmit` → no output.

### Task 2: Use it in Hôm nay and Phối đồ

**Files:**
- Modify: `app/src/screens/Today.tsx` (body mode render)
- Modify: `app/src/screens/Studio.tsx` (body mode render)

**Interfaces:**
- Consumes: `OutfitPhoto` (Task 1), same props as `OutfitOnBody`.

- [ ] Step 1: replace `<OutfitOnBody … />` with `<OutfitPhoto … />` in both screens; make Today open in `'body'` mode (Figma default).
- [ ] Step 2: `npx tsc --noEmit` → no output.
- [ ] Step 3: live check: one `tryon.create` with `body_mode: "profile"` for a device with a profile returns `job_id`, then `status` reaches `done` with an `image_url`.
- [ ] Step 4: `npm run ship -- "<message>"`; user checks on the phone.
