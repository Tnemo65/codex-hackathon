# Tủ đồ AI

Mỗi sáng mở app là AI chốt sẵn một bộ đồ từ tủ đồ của bạn, hợp thời tiết và dịp trong ngày, kèm lý do và lời dặn.

Khung hiện tại (skeleton): 1 màn hình → Supabase Edge Function → OpenAI → outfit + lý do + lời dặn.

## Luồng

```
iPhone (Expo Go, bundle từ EAS Update) → Supabase Edge Function `suggest-outfit` → OpenAI Responses API
```

Khóa OpenAI chỉ nằm trong secrets của Edge Function. App chỉ có URL Supabase và publishable key (công khai).

## Cài đặt

Biến môi trường: xem `.env.example`.

Đang chạy: Supabase project `tudo-ai` (ref `aivyffaeerowlxmkgxxz`), function `suggest-outfit` (Verify JWT tắt), secret `OPENAI_API_KEY`. Đã deploy bằng editor trên Supabase Dashboard; dùng CLI thì:

Backend (một lần, rồi mỗi khi sửa function):

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase secrets set OPENAI_API_KEY=<key>
npm run deploy:fn
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

Log backend: Supabase Dashboard → Edge Functions → `suggest-outfit` → Logs (`request` / `result` / `failed`).

## Giả lập (mock)

- Tủ đồ và thời tiết đang hardcode trong `App.tsx` (đánh dấu `ponytail:`). Lời gọi AI là thật.
## Làm trước vs. làm trong ngày

- Trước 14/11: ý tưởng, đặc tả, prototype HTML (`../idea/`).
- 14/11: toàn bộ code trong thư mục này.
