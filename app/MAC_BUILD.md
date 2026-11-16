# Build iOS trên Mac (cho partner)

Mục tiêu: app cài hẳn trên iPhone, rút cáp / tắt Mac / đóng hẳn rồi mở lại vẫn chạy AI. Phải là bản **Release** — bản Debug cần Metro trên Mac nên **0 điểm demo**.

## Cần có (một lần)

- Xcode (đã mở một lần, đồng ý license), Node 20+, CocoaPods: `sudo gem install cocoapods` hoặc `brew install cocoapods`.
- iPhone: Cài đặt → Quyền riêng tư & Bảo mật → **Developer Mode** bật (máy khởi động lại).
- Apple ID (miễn phí cũng được; app hết hạn sau 7 ngày) hoặc tài khoản Apple Developer.

## Các bước

```bash
git clone https://github.com/Tnemo65/codex-hackathon.git
cd codex-hackathon/app
npm ci
```

Tạo `app/.env` (không có trên GitHub). Hai giá trị này là khoá công khai, an toàn để chia sẻ:

```
EXPO_PUBLIC_SUPABASE_URL=https://aivyffaeerowlxmkgxxz.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_55grVbKUwrQgFEbPy0NFKA_hE5QlhsP
```

Cắm iPhone bằng cáp, mở khoá máy, bấm "Tin cậy máy tính này", rồi:

```bash
npx expo run:ios --device --configuration Release
```

Lệnh tự sinh thư mục `ios/` và build (lần đầu ~10–15 phút). Chọn đúng iPhone khi được hỏi.

## Nếu lỗi ký app (signing)

1. Mở `app/ios/*.xcworkspace` bằng Xcode → target app → **Signing & Capabilities** → bật *Automatically manage signing* → chọn **Team** (Apple ID của bạn).
2. Báo trùng bundle ID `com.dacthinh.tudoai` → đổi thành tên khác, vd `com.<tên-bạn>.tudoai` (chỉ sửa trong Xcode, không commit).
3. Chạy lại lệnh `npx expo run:ios --device --configuration Release`.
4. Lần đầu mở app trên iPhone báo "Nhà phát triển không đáng tin cậy": Cài đặt → Cài đặt chung → **VPN & Quản lý thiết bị** → chọn Apple ID → **Tin cậy**.

## Kiểm tra trước khi demo

- [ ] Rút cáp, tắt Wi-Fi Mac → mở app → bấm gợi ý outfit → có kết quả.
- [ ] Vuốt tắt hẳn app → mở lại → bấm lại → có kết quả.
- [ ] Thử bằng mạng sẽ dùng lúc demo. Hotspot iPhone lúc 13:35 **chặn `*.supabase.co`**; kiểm tra nhanh: mở `https://aivyffaeerowlxmkgxxz.supabase.co/functions/v1/api` trên Safari, phải hiện lỗi JSON ngay (không xoay mãi).

## Cập nhật code (không cần build lại)

Bản Release đã cài nhận code JS mới qua EAS Update (kênh `preview`, cùng runtime `exposdk:58.0.0`). Chỉ đổi code JS/TS → **không build lại trên Mac**:

1. Máy Windows chạy `npm run ship -- "mô tả"` (khoảng 1 phút).
2. Trên iPhone: mở app (app tải bản mới ngầm) → vuốt tắt hẳn → mở lại → đang chạy bản mới.

Chỉ build lại khi **thêm/xoá thư viện native** hoặc sửa `app.json` phần native (icon, quyền, bundle ID): `git pull` → `npm ci` → `npx expo prebuild -p ios --clean` → lệnh build Release. Lần build lại không `--clean` sẽ build tăng dần (vài phút), nên đừng xoá `ios/` hay DerivedData khi không cần. `--clean` cũng xoá phần chỉnh signing trong Xcode, phải chọn lại Team.
