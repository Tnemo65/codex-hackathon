# UI/UX, Performance, and End-to-End Plan

## Goal

Improve the real mobile experience by fixing observed interaction and reliability defects first, then measuring startup, list, image, and serving performance on a representative device. Keep the current Expo SDK 58 / React Native 0.88 stack unless measurements justify a change.

## Work completed in this pass

- Parallel audits covered startup/API, rendering/list/image, screen flows, buttons, and accessibility.
- Fixed the search-driven wardrobe grid remount and repeated tile animations; fixed chat/use-today false-success paths, retry behavior, profile style selection, several busy/error states, image fallback, and the truthful TryOn stop-wait label.
- Added main/tablist semantics and corrected Today context-control accessible names after Lighthouse identified the affected nodes.
- Calendar weather failures now reach an accessible retry state; forecast requests outside the provider's supported date window still return an empty range. The Calendar ignores stale forecast responses.
- A successful wardrobe delete is not repeated if the follow-up list refresh fails. Shop link launch failures are shown with retry. Studio saved outfits commit to UI only after local persistence succeeds, and TryOn image retries are single-flight with loading feedback.
- App startup now shows the shell after profile hydration while `items.list` runs in the background. Today starts `plan.get` alongside it, waits for inventory before deciding whether the closet is empty or requesting an outfit, and exposes retry when the initial inventory load fails. Restore clears old items before loading the restored closet.
- Wardrobe and ShopCatalog now use one three-column `FlatList` each. Search, filters, empty/error states, and shop recommendations remain in list headers. A five-viewport render window reduced mounted tiles in the local 390×844 web run from 144 to 39 for 200 wardrobe items, and from all 90 products to 39 mounted tiles; repeated scrolling still reached item 200 / product 90.
- The API signs each shared image/cut-out path once per list response. Numeric-only logs separate readiness, signing duration, and signing counts. A local Node check confirmed five references to three unique paths become three signed URLs; Deno/Supabase integration could not run in this environment.
- `npm run typecheck` passes.
- Release web export completed with `npx expo export --platform web`. A mobile-sized Chrome run at 390×844, Fast 3G, and 2× CPU slowdown used mocked API responses to check startup overlap, Today suggestion, 200-item search/filter/scroll, 90-product filtering/scroll, and inventory failure → retry → success. The delayed inventory scenario started `plan.get` before `items.list` finished and did not show a false empty-closet message. The final isolated run had no external origins and no browser console errors.
- During the first exploratory browser run, the app's automatic outfit preview missed the TryOn mock and its configured endpoint returned HTTP 403 without returning a job ID. The final isolated run mocked TryOn as well; it made no external requests.
- Expo's automatic lint setup reported existing hook-rule findings (125 across the repository, 9 in the four touched files; none in Today). Its generated config/dependencies were removed after the check, so the repository remains without a lint configuration.
- Manual Expo Web E2E smoke flow passed through onboarding/profile save, Today empty-wardrobe state, Calendar month/week and weather, Studio shop selection/canvas/save/delete, and Stylist plan/error state.
- Failure-path smoke checks passed on Expo Web: an injected weather request failure showed the Calendar retry message, restoring fetch and retrying restored the forecast; an injected external-link failure showed the Shop retry message; and a simulated Studio storage write failure did not claim a save, then persisted successfully on retry and the test outfit was deleted. These are browser simulations, not native-device acceptance.
- Mobile Lighthouse on Expo Web: accessibility 91 → 100 after the accessibility fixes; best practices 100. SEO/agentic-browsing scores are not native-app acceptance metrics.
- One browser performance trace under Fast 3G and 2× CPU slowdown recorded LCP 8.036 s and CLS 0.01. The LCP was text with 8.028 s render delay; this is a throttled Expo Web development measurement, not an iPhone/release baseline.
- The browser flow created a throwaway anonymous profile on the configured backend using default demo measurements. It added no wardrobe photos/items and no outfit plan. The API has no profile-delete action, so the profile remains on that backend.

## Field-by-field optimization pass (2026-11-16)

The follow-up pass split the app into three screen fields plus shared app/API integration. Each field was audited independently, implemented by its owner, then reviewed for integration regressions.

### Daily experience: Today, Calendar, Stylist

- Today now surfaces an accessible error and retry when weather cannot be loaded for a small closet; it no longer silently falls through to a misleading empty state.
- Switching Calendar from month to week anchors the week on the selected date.
- Stylist plan and chat failures use alert semantics so assistive technology announces the failure.
- Long chat history remains unvirtualized until native profiling demonstrates a measurable rendering problem.

### Wardrobe and shopping: Wardrobe, ReviewItem, ShopCatalog

- A successful item write and a failed list refresh are handled as separate outcomes. Retry reloads the list without repeating the item write, and the review flow stays mounted through an empty-closet refresh error.
- Cut-out polling now schedules its next list request after the prior request settles, preventing overlapping calls on slow connections.
- An empty successful shop catalog has an explanation and reload action. The category empty state checks the selected category's products, so recommended products shown in the header do not produce a contradictory “no products” message.
- AI picks are cached per profile and wardrobe inputs. Catalog and identical in-flight pick requests are shared; stale pick responses cannot replace the current profile/wardrobe result.
- Inventory refresh errors remain visible in Wardrobe rather than replacing and unmounting the screen at the app root.

### Onboarding, Profile, Studio, and TryOn

- Final onboarding save disables Back and Skip while pending; editing the restore code clears its stale error.
- Profile save feedback is tied to the edit revision, so a response cannot mark newer unsaved edits as saved.
- Studio's failed shop-link action retries opening the link, not the unrelated “use today” action.
- TryOn retains a known pending job after transient status failures and after “Dừng chờ”. Re-entering the screen or retrying the same device/outfit during the current app session shares an in-flight create request and resumes its job ID; changing the outfit or accepted body-photo revision selects a different job key.
- Consent, uploaded-body availability, and pending TryOn job keys are scoped by device ID. A response lost after the server creates a TryOn job still cannot be made idempotent without a client/server request key and server-side contract.

### Shared app and API integration

- Inventory responses are guarded by a request generation. Starting restore invalidates older inventory requests, and only the latest request may update items, loading, or error state.
- Identical in-flight weather requests share one fetch; catalog and picks requests also use single-flight behavior.

### Verification evidence

- `npm run typecheck` passes; `npx expo export --platform web --output-dir .scratch/perf-web-20261116` completes with an 811 KB web JavaScript bundle. Expo Doctor passed 20/20 earlier in this optimization pass.
- Isolated local Expo Web checks ran at 390×844 with Fast 3G and 2× CPU slowdown. The app had no horizontal overflow and no external origins in the isolated mocked run.
- Mocked browser flows verified that changing a saved profile causes one new catalog-pick request; a delayed old-device `items.list` response cannot replace the restored closet; recommending every product does not show the category empty message; and stopping/retrying TryOn does not issue a second create request for the same outfit.
- Emulation was briefly reconfigured on a non-isolated browser page, which reloaded without the fetch mock and made one read-only `profile.get` request to the configured Supabase endpoint (HTTP 200). The isolated mocked run after that made no external requests. No profile save, item mutation, or live AI request was made by that accidental read.

## Prioritized plan

### P0 — Finish end-to-end acceptance on an installed iPhone

The user has no physical test device available, so this hardware acceptance remains pending. Expo Web and browser emulation cover layout and app-state behavior but cannot verify native camera/photo permissions, iOS lifecycle, native scrolling, VoiceOver, or release-mode device timing. When a device is available, run the golden path and record device/iOS/app build, network, timings, errors, and screenshots.

### P1 — Measure cold-start critical path

The shell now waits for profile only; inventory and Today plan requests overlap, and outfit suggestion waits for inventory. Measure installed-release cold TTI and separate `device.new`, `profile.get`, `items.list`, `plan.get`, and suggestion timings on a device before deciding whether a combined boot response is worthwhile. The local mock run confirms request overlap, not production latency. Keep schema initialization out of a new per-request critical path; verify backend changes in staging before production.

### P2 — Profile the virtualized collections on native devices

Wardrobe and ShopCatalog have been converted to `FlatList`; local browser checks covered 200 and 90 entries, search/filter, and end-of-list scrolling. Measure scroll FPS, dropped frames, memory, and mount count at 5 / 20 / 50 / 100 / 200 items on a native device. Studio saved outfits and Stylist history remain candidates only if native profiling shows a bottleneck. Avoid adding FlashList or image packages without a demonstrated win.

### P3 — Measure image delivery and layout stability

The API now avoids duplicate signing of shared paths, while the app keeps its existing 1024px photo downscale and signed-URL reuse. Profile cold/warm image loads, `Image.getSize` calls, signed-URL refresh, errors, and memory on a real device. Change image libraries only if cache misses, decoding, or layout shifts are measurable; verify SDK 58 support before changing dependencies.

### P4 — Compare backend serving and AI latency

Numeric readiness and image-signing timings are now logged. Collect cold/warm Edge Function timing by action for profile, item list, plans, catalog, and TryOn. The backend still runs readiness/schema setup on cold isolates; verify its cost and idempotency before moving it to migrations. Track API latency separately from model generation and image transfer; retain retry/resume behavior for transient failures.

### P5 — Finish screen-level interaction polish

The weather retry, shop-link retry, delete-vs-refresh, Studio persistence, and TryOn image-retry fixes are implemented and browser-smoke-tested. Remaining work is to verify empty-closet search/filter behavior on device, small-screen keyboard reachability, safe areas, VoiceOver/TalkBack modal focus, and tap geometry. Validate device-dependent findings before changing layout or adding dependencies.

## E2E scenario matrix

| Area | Main actions | Failure/edge cases |
|---|---|---|
| Onboarding/Profile | wear/style choices, validation, save, restore, edit | blank/invalid values, request retry, keyboard covers footer |
| Wardrobe | search/filter/reset, camera/library, detect, split, review, save, delete/undo | permission denied, upload failure, retry, cutout timeout, empty inventory |
| Today | date navigation, occasion/commute, suggestion, wear, chat, TryOn entry | rapid context changes, no items, save failure, slow/offline API |
| Calendar | month/week, date navigation, selected-day details, weather | stale responses, weather failure, dates around month/year boundaries |
| Studio | own/shop source, select items, body/canvas, save/load/delete, use today | catalog failure/retry, storage failure, broken external link |
| Stylist | quick prompt, typed message, retry, outfit actions | missing plan, failed request, repeated taps while busy, long history |
| TryOn | consent, body photo, garment selection, generate, poll/resume, result, use today | status network loss, image load failure, timeout, stop waiting, duplicate retry |

## Acceptance gates

1. `npm run typecheck` passes. The repo currently has no lint configuration; adopting lint requires resolving the existing hook-rule findings first.
2. Every primary button has one observable result; failed writes never navigate as if successful; retry repeats the failed operation.
3. No crash, unhandled rejection, stale response overwrite, or inaccessible primary control in the scenario matrix.
4. Performance changes have before/after measurements from the same installed device, release mode, inventory, and network profile. Browser mount counts and mock request order are development evidence only.
5. Final acceptance is the installed app on the demo iPhone, including force-close → reopen and live AI round-trip; Expo Web and emulators are development evidence only.
