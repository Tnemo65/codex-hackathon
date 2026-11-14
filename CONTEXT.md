# Context cuộc thi — AI IN YOUR PALM (Codex Community Hackathon – Hanoi)

> Nguồn: trang sự kiện Luma + các thông báo của BTC (Doan Nguyen, Hanoi Codex Ambassador), cập nhật đến 14/11/2026.
> **Khi có mâu thuẫn với `rule.md`, file này đúng hơn** (xem mục cuối).

---

## 1. TIÊU CHÍ CHẤM ĐIỂM (quan trọng nhất)

BGK chọn **một mức điểm cố định** cho mỗi tiêu chí (không có điểm lẻ ở giữa). Tổng tối đa **100**.
**Điểm dựa trên bằng chứng thực tế, không dựa vào slide hay độ tự tin khi trình bày.**

### Tiêu chí 1 — Demo AI trên điện thoại thật — tối đa 40 điểm

| Điểm | Điều kiện |
|---|---|
| **40** | **Đóng hẳn rồi mở lại** ứng dụng trên **điện thoại thật**; luồng AI chính **chạy trực tiếp** (live). |
| 20 | Mở lại được trên điện thoại thật nhưng luồng AI chỉ chạy một phần hoặc chưa ổn định. |
| 0 | Không mở lại được app trên điện thoại thật, AI không chạy trực tiếp, **hoặc chỉ demo bằng trình duyệt, giả lập (emulator), ảnh hay video**. |

### Tiêu chí 2 — Vấn đề thật của người dùng — tối đa 35 điểm

| Điểm | Điều kiện |
|---|---|
| **35** | Nêu rõ **người dùng là ai** và **khó khăn họ gặp**, **có bằng chứng**, đồng thời cho thấy **AI giúp trực tiếp**. |
| 18 | Vấn đề khá rõ nhưng bằng chứng hoặc lợi ích của AI còn hạn chế. |
| 0 | Chưa làm rõ người dùng, vấn đề hoặc giá trị sản phẩm. |

### Tiêu chí 3 — Khả năng mở rộng thị trường — tối đa 25 điểm

| Điểm | Điều kiện |
|---|---|
| **25** | Giải thích rõ **cách tiếp cận người dùng đầu tiên** và **mở rộng ra toàn cầu**; **đã có người dùng thực tế là lợi thế**. |
| 13 | Có hướng mở rộng nhưng cách tiếp cận người dùng hoặc lập luận còn yếu. |
| 0 | Chưa có hướng tiếp cận người dùng cụ thể, hoặc chỉ nói chung chung "ai cũng cần". |

**Hòa điểm:** ưu tiên lần lượt Tiêu chí 1 → Tiêu chí 2 → Tiêu chí 3.

### Hệ quả cho việc build (suy ra từ tiêu chí)

- **40 điểm demo là "được hoặc mất":** phải cài app thật trên điện thoại thật, force-close rồi mở lại trước mặt BGK, luồng AI gọi live. Web app / PWA mở bằng trình duyệt, emulator, video quay sẵn → **0 điểm**.
  - Ưu tiên một bản build **cài hẳn trên máy** (vd. APK/dev build) thay vì phụ thuộc vào dev server trên laptop hay Expo Go — để mở lại app là chạy được ngay.
  - App phải khởi động lại sạch sẽ sau khi bị đóng hẳn (không mất cấu hình, không cần laptop).
  - Mạng tại venue có thể chập chờn: chuẩn bị 4G/hotspot dự phòng; AI vẫn phải là **gọi live**, không fake.
  - Diễn tập thao tác "đóng hẳn → mở lại → chạy luồng AI" nhiều lần trên đúng chiếc điện thoại sẽ dùng để demo.
- **35 điểm vấn đề:** cần **bằng chứng** (phỏng vấn người dùng, ảnh chụp tin nhắn/bài đăng than phiền, số liệu, khảo sát…), và cho thấy AI là **thiết yếu** cho kết quả — không phải chatbot gắn thêm.
- **25 điểm thị trường:** nêu cụ thể **kênh tiếp cận 10–100 người dùng đầu tiên** (nhóm Facebook, trường, cộng đồng…) và lộ trình ra quốc tế. Có người dùng thật (dù vài người dùng thử trong ngày) là điểm cộng.
- **Thứ tự ưu tiên khi thiếu thời gian:** demo trên điện thoại thật chạy ổn > bằng chứng vấn đề > câu chuyện mở rộng thị trường.

---

## 2. Thông tin sự kiện

- **Tên:** AI IN YOUR PALM / AI trong lòng bàn tay — Codex Community Hackathon – Hanoi. Sự kiện cộng đồng Codex do Doan Nguyen (Hanoi Codex Ambassador) tổ chức, Apero hỗ trợ.
- **Ngày:** Thứ Bảy 14/11/2026, 09:00–19:00 (ICT, UTC+7).
- **Địa điểm:** Biblio Book Cafe, 79 P. Ngụy Như Kon Tum, **bên trong Làng sinh viên Hacinco**, Thanh Xuân, Hà Nội.
- **Quy mô:** 150–200 người check-in; ~38–67 đội. **4 giám khảo** (có thể chia 2 nhóm chấm song song hoặc chấm độc lập).

## 3. Đề bài

Xây dựng **ứng dụng di động** trong đó **AI là thiết yếu cho kết quả của người dùng** — không phải chatbot gắn thêm ở cuối.

Chủ đề (chọn một): dịch vụ công & đời sống đô thị · cuộc sống hàng ngày & khả năng tiếp cận (accessibility) · công việc & giáo dục · chủ đề mở.

## 4. Luật chơi

- **Đội 3–4 người là bắt buộc** trước khi bắt đầu build (đăng ký solo được, nhưng phải vào đội; BTC hỗ trợ ghép đội ~15 phút đầu).
- Bắt đầu từ **vấn đề thực tế**, không phải pitch deck.
- Dùng Codex một cách có ý nghĩa (Codex là nhà tài trợ, nhưng **không bắt buộc chỉ dùng Codex** — được dùng công cụ khác).
- Xây **luồng mobile cốt lõi + tính năng AI** trong ngày sự kiện.
- Được dùng thư viện, SDK, API, template công khai.
- **Được chuẩn bị trước** (ý tưởng, nghiên cứu, thậm chí làm trước một phần sản phẩm) — nhưng khi trình bày **phải nói rõ phần nào làm trước, phần nào làm trong ngày**, và cho thấy phần mới đáng kể làm tại hackathon.
- Phải có quyền sử dụng mọi mã nguồn, dữ liệu, nội dung (ảnh, media) trong demo.
- Nộp demo chạy được + thuyết trình **5 phút/đội**.

## 5. Lịch trình (dự kiến)

| Giờ | Nội dung |
|---|---|
| 09:00 | Check-in (Luma) & networking |
| 09:xx | Chào mừng, đề bài, thể lệ |
| 10:00 | Talk Apero: How to build with AI (20') |
| 10:20 | Talk Doan Nguyen: Startup 101 (20') |
| 10:40 | Chia sẻ bài toán, ghép đội |
| **11:00** | **Build sprint** (trưa 12:00, nghỉ chiều 15:00) |
| **16:00** | **Dừng build, nộp bài** |
| 16:15 | Mỗi đội thuyết trình **5 phút** |
| 17:45 | BGK chọn một số đội lên showcase |
| 18:15 | Công bố kết quả, bế mạc |
| 19:00 | Kết thúc |

## 6. Giải thưởng (đang chờ Codex phê duyệt)

- **Nhất:** 1.000 USD API credits/đội + ChatGPT Pro 3 tháng/thành viên.
- **Nhì:** 500 USD API credits/đội + ChatGPT Pro 3 tháng/thành viên.
- **Ba:** 250 USD API credits/đội + ChatGPT Pro 3 tháng/thành viên.

## 7. Quyền lợi & check-in

- Mỗi người đủ điều kiện có thể nhận tối đa **100 USD Codex credits + 50 USD API credits**.
- **Bắt buộc có trạng thái "Checked In" trên Luma** mới được nhận credits — không ngoại lệ. Đưa mã QR vé Luma cho nhân viên quét và chờ xác nhận trước khi rời quầy.
- Có bữa trưa và bữa nhẹ buổi chiều.

## 8. Mang theo

Laptop + sạc; **điện thoại + cáp** để test trên thiết bị thật; tài khoản dev đã thiết lập sẵn; bình nước.

---

## 9. Quan hệ với `rule.md`

`rule.md` (quy tắc làm việc cho agent) đã được cập nhật theo file này ngày 14/11/2026. Nếu hai file mâu thuẫn, file này đúng hơn.
