# Tủ đồ AI

Chụp một món đồ, AI tự đọc loại, màu, chất liệu và tách nền. Mỗi sáng AI phối sẵn 3 bộ từ chính tủ đồ của bạn theo dịp, thời tiết, cách di chuyển và tỉ lệ cơ thể (vd. lưng dài, chân ngắn), kèm lý do và lời dặn. Sửa bộ đồ bằng một câu chat, xem thử trên dáng người của mình, hoặc để AI tạo ảnh mặc thử.

Người dùng: nữ nhân viên văn phòng 22–30 tuổi ở Hà Nội, đi làm bằng xe máy.

## Luồng

```
App → Edge Function `api`   → OpenAI Responses API (đọc ảnh món đồ, phối đồ, sửa theo chat)
                            → OpenAI Images (tách nền món đồ)
                            → Postgres (hồ sơ, tủ đồ, kế hoạch mặc) + Storage riêng tư (ảnh)
App → Edge Function `tryon` → OpenAI Images (ảnh mặc thử)
App → Open-Meteo            (thời tiết theo giờ, không cần khóa)
```

Khóa OpenAI chỉ nằm trong secrets của Edge Function. App chỉ có URL Supabase và publishable key (công khai), không gọi thẳng database.

Không cần đăng nhập: mỗi bản cài nhận một mã thiết bị do server cấp. Màn Hồ sơ có mã khôi phục 12 ký tự để mở lại tủ đồ trên máy khác (Expo Go, APK và bản Xcode lưu riêng).

## Cài đặt

Biến môi trường: xem `.env.example`.

Đang chạy: Supabase project `tudo-ai` (ref `aivyffaeerowlxmkgxxz`), function `api` và `tryon` (Verify JWT tắt, function tự kiểm tra `apikey`). Bảng và bucket do function tự tạo ở lần gọi đầu. `suggest-outfit` là bản skeleton đầu ngày, giữ làm dự phòng.

Secret của function: `OPENAI_API_KEY` (bắt buộc). Tùy chọn: `REMOVEBG_API_KEY` (không có thì AI tự tách nền), `VISION_MODEL`, `STYLIST_MODEL`, `STYLIST_TIER`, `EDIT_MODEL`, `CUTOUT_MODEL`, `TRYON_MODEL`, `TRYON_QUALITY`.

Backend (một lần, rồi mỗi khi sửa function):

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase secrets set OPENAI_API_KEY=<key>
npx supabase functions deploy api --no-verify-jwt
npx supabase functions deploy tryon --no-verify-jwt
```

Đưa 2 biến public vào EAS (một lần):

```bash
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<project-ref>.supabase.co --visibility plaintext
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value <sb_publishable_...> --visibility plaintext
```

Phát hành app lên điện thoại (lệnh duy nhất cần nhớ):

```bash
npm run ship -- "mô tả thay đổi"
```

Mở trên iPhone: Expo Go (đăng nhập tài khoản `dacthinh`) → mở `exp://u.expo.dev/b8772d62-9cd4-4e24-be17-6e6bb8ffd63c?channel-name=preview`.

Bản cài đặt Android (cho demo chấm điểm, mở lại không cần laptop):

```bash
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$PWD" npx eas-cli build --platform android --profile preview
```

`EAS_NO_VCS=1` và `EAS_PROJECT_ROOT` (chạy trong thư mục `app/`) là bắt buộc: `.gitignore` ở thư mục gốc repo whitelist `/app/` khiến EAS đóng gói thiếu `package.json`.

**Thêm/xoá thư viện native (vd. `expo-image-picker`) ⇒ phải build lại APK trước khi `npm run ship`**, vì runtime vẫn là `exposdk:58.0.0` nên APK cũ sẽ nhận JS mới và crash. Bản APK nhận cập nhật JS qua `npm run ship` (cùng channel `preview`, runtime `exposdk:58.0.0`); đóng hẳn rồi mở lại app để tải bản mới.

Bản web cho người dùng thử (trình duyệt, không tính cho phần demo trên điện thoại): https://tudo-ai.expo.app

```bash
npx expo export --platform web && npx eas-cli deploy --prod
```

Bản iPhone cài qua Mac + Xcode: xem `MAC_BUILD.md`.

Log backend: Supabase Dashboard → Edge Functions → `api` / `tryon` → Logs (mỗi dòng có tên action, thời gian chạy, model; lỗi ghi `failed`).

## Giả lập (mock)

- Phần lõi không giả lập: đọc ảnh, tách nền, phối đồ, sửa theo chat và ảnh mặc thử đều gọi AI thật; tủ đồ lưu ở Postgres, thời tiết lấy thật từ Open-Meteo.
- Chế độ xem "Trên người" là hình vẽ 2D dựng theo chiều cao và tỉ lệ cơ thể trong hồ sơ, không phải mô hình 3D đo từ ảnh.
- Các bước "AI đang phối đồ" / "AI đang đọc ảnh" (`src/components/ThoughtLine.tsx`) hiện theo hẹn giờ vì server chỉ trả kết quả một lần; nội dung bước là đúng dữ liệu AI nhận, đồng hồ và số bộ là đo thật.
- Các giai đoạn khi chờ ảnh mặc thử (`RefineFrame` trong `src/screens/TryOn.tsx`) chạy theo thời gian đã chờ; ảnh thật chỉ có ở bước cuối.

## Làm trước vs. làm trong ngày

- Trước 14/11: ý tưởng, đặc tả, prototype HTML (`../idea/`).
- 14/11: toàn bộ code trong thư mục này (app, hai Edge Function, schema database).
