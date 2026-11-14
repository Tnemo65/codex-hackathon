# Outfit photo ("Trên người") matching Figma — short design

**Intent.** The "Trên người" view on Hôm nay (and Phối đồ) should look like the Figma frame "Khung xem outfit" (node 10:1161): a photo of a model wearing the outfit on the left, a column of garment thumbnails with names on the right. Approved by the user on 14/11.

**Goals.** Real AI photo of the exact outfit; Figma layout (photo ~241×494, thumbs 95×79 with 11px bold labels); never a blank frame.
**Non-goals.** Pixel-perfect fonts (Be Vietnam Pro not installed); try-on of shop products (backend only loads owned items).
**Anti-goals.** Burning the try-on daily cap (20 per device, 60 global) by regenerating the same outfit.

**Approaches.**
1. *AI photo per outfit (picked).* Reuse the deployed `tryon` function with `body_mode: "profile"` (model drawn from height/weight/proportion, no personal photo). ~12 s per outfit. Matches Figma.
2. *Only re-layout the 2D figure.* Instant and free, but never looks like the Figma photo. Rejected.

**Design.**
- New `src/components/OutfitPhoto.tsx` with the same props as `OutfitOnBody` (`items, profile, width, height`). Left column: photo; right column: thumbnails + names in kind order (outer, top, dress, bottom, shoes, bag).
- Photo source: `tryonApi.create(ids, null, 'profile')` → poll `tryonApi.status` every 3 s. Cache `outfit key (sorted ids) → job_id` in AsyncStorage; on view, ask `status(job_id)` for a fresh signed URL instead of regenerating.
- While generating or on failure: show the existing 2D `OutfitOnBody` figure in the left column with a scan line; failure adds a small "Thử lại". The photo fades in on load.
- Only generate when every item is owned (no shop products); otherwise keep the 2D figure.
- `tryonApi.create` gains an optional `body_mode` argument (client only; backend already supports it).

**Left to the builder.** Exact spacing, the scan-line look, the poll timeout (use the 170 s server limit).
