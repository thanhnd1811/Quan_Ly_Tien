// Knowledge base về toàn bộ app Quản Lý Tiền — inject vào system prompt
// để AI có thể trả lời mọi câu hỏi về cách dùng / tính năng / FAQ.
// Chỉ-đọc thông tin: AI chỉ TRẢ LỜI hướng dẫn, KHÔNG làm thay
// (ngoại trừ tạo giao dịch qua tool prepare_transaction).

window.QLT_AppKnowledge = `
# QUẢN LÝ TIỀN — KIẾN THỨC ĐẦY ĐỦ VỀ APP

## 1. NAVBAR DƯỚI (5 tab)
- 🏠 **Trang chủ** — số dư tổng, ví, dự báo, mục tiêu, insights
- 📊 **Biểu đồ** — phân tích thu/chi theo ngày/tuần/tháng/năm/custom
- ➕ **Nút giữa** — Thêm giao dịch (chính)
- 🗂️ **Danh mục** — quản lý cat thu/chi
- ⚙️ **Cài đặt** — toàn bộ cấu hình app

## 2. THÊM GIAO DỊCH (3 cách)
### Cách 1: Gõ tay
Tap nút **+** giữa navbar → form mở → chọn type (Chi/Thu/Chuyển) → điền số tiền + ví + danh mục + ghi chú → Lưu.

### Cách 2: Voice 🎙️
Trong form GD, tap icon **🎙️** góc trên phải → nói tự nhiên:
- "ăn sáng 150k MBBank lưu" — kết "lưu" → tự save
- "lương 10tr" — chỉ điền số tiền + cat Lương
- "chuyển 500k từ VCB sang MB" — auto detect transfer

### Cách 3: OCR hoá đơn 📷
Trong form, tap **📷** → chụp ảnh hoá đơn / chọn từ thư viện → AI Gemini đọc tự động số tiền + cửa hàng + cat đề xuất → user xác nhận.

### Cách 4 (mới): AI Chat
Tap icon ✨ Trợ lý AI → nói/gõ "ăn sáng 50k" → preview card → tap Lưu.

## 3. SỬA / XOÁ GIAO DỊCH
- **Sửa**: tab Trang chủ hoặc Lịch sử → tap GD → form mở pre-fill → sửa → Lưu.
- **Xoá**: tap GD → trong form có nút **🗑️ Xoá** đỏ ở dưới → confirm.
- **Bulk select**: trong list GD, long-press 1 GD → chọn nhiều → Xoá hàng loạt / Đổi cat hàng loạt.

## 4. SỔ (book)
Mỗi user có nhiều sổ độc lập: cá nhân, gia đình, công việc. Mỗi sổ có ví + cat + GD riêng.
- **Đổi sổ / tạo sổ**: tap menu **☰** góc trên trái → list sổ + nút "Tạo sổ mới".
- **Quản lý sổ**: menu trái → "Quản lý sổ" → đổi tên / xoá / share thành viên.
- **Sổ chia sẻ**: thành viên cùng truy cập (cần đăng nhập Google).

## 5. VÍ / TÀI KHOẢN
2 loại:
- **Payment** (tiền dùng được): Tiền mặt, ngân hàng (VCB, MB...). Tham gia tổng số dư.
- **Savings** (sổ tiết kiệm): khoá lãi suất + thời hạn. KHÔNG tham gia "tiền dùng được".

### Thao tác:
- **Tạo ví**: tab Tài khoản → nút **+** → điền tên + loại + số dư ban đầu → Lưu.
- **Sửa số dư đã tạo**: tab Tài khoản → tap ví → nút **⚖️ Điều chỉnh số dư** → nhập số dư đúng → app tự tạo GD "Điều chỉnh tăng/giảm" để khớp.
- **Đổi tên / icon / màu ví**: tap ví → sửa các field → Lưu.
- **Xoá ví**: chỉ xoá được nếu không có GD nào dùng → tap ví → nút Xoá ở dưới.
- **Sổ tiết kiệm đáo hạn**: tap sổ → "📅 Đáo hạn" → 3 lựa chọn: rút hết về ví / gia hạn cộng lãi / gia hạn rút lãi.
- **Rút sớm sổ tiết kiệm**: tap sổ → "💸 Rút sớm" → app tính lãi suất phạt.

## 6. DANH MỤC (cat)
Bộ chuẩn V2: 12 nhóm cha + 47 con (chi) + 5 cha + 13 con (thu).
- **Cat cha**: Ăn uống / Đi lại / Nhà ở / Hóa đơn / Mua sắm / Sức khỏe / Giáo dục / Giải trí / Gia đình / Lễ nghĩa / Tài chính / Khác.
- **Tự thêm cat**: tab Danh mục → tap **+** → điền tên + icon + màu + chọn cha (nếu là con) + keywords voice.
- **Sửa cat**: tab Danh mục → tap cat → form mở.
- **Xoá cat**: chỉ xoá được nếu không có GD nào dùng.
- **Cập nhật danh mục chuẩn**: Settings → Dữ liệu → "🏷️ Cập nhật danh mục chuẩn" → preview → Áp dụng. Cat cũ archive (không xoá), GD vẫn giữ.

### Keywords voice
Mỗi cat có thể có "Từ khóa voice" để app match khi user nói. Mở cat → cuộn xuống "🎙️ Từ khoá voice" → thêm chip (vd "highlands" cho cat Cà phê) → Lưu.

## 7. NGÂN SÁCH (Budget)
Đặt mục tiêu chi tiêu hằng tháng cho từng cat.
- **Tạo budget**: menu trái → Tài chính → Ngân sách → **+** → chọn cat + số tiền/tháng.
- **Cảnh báo**: khi chi gần (80%) hoặc vượt budget → app nhắc trong form GD + insights.

## 8. ĐỊNH KỲ (Recurring)
Tự tạo GD khi đến hạn (lương, tiền nhà, internet...).
- **Tạo rule**: menu trái → Tài chính → "🔄 Giao dịch định kỳ" → **+** → điền: tên / type / số tiền / chu kỳ (daily/weekly/monthly/yearly) / ngày bắt đầu.
- App tự sinh GD khi user mở app sau ngày đến hạn.
- **Tắt rule**: trong list, toggle **active**.

## 9. CHO VAY / NỢ
Theo dõi cho người ta vay hoặc mình vay người ta.
- **Tạo**: menu trái → Tài chính → "🤝 Cho vay / Nợ" → **+** → loại (cho vay / vay) + đối tác + số tiền + ngày + ví liên quan.
- **Ghi nhận trả tiền**: trong khoản vay → "+ Ghi nhận trả tiền" → tự sinh GD thu/chi.

## 10. MỤC TIÊU TIẾT KIỆM
Đặt goal "100tr cuối năm 2026", app track tiến độ.
- **Tạo**: menu trái → Tài chính → 🏆 Mục tiêu → **+**.
- **Đóng góp**: hằng tháng → goal tự cập nhật progress %.

## 11. CHI PHÍ XE
Theo dõi xăng, bảo dưỡng, đăng kiểm, bảo hiểm xe.
- **Tab**: menu trái → Tài chính → "🚗 Chi phí xe".
- **Thêm đổ xăng**: trong card xe → "⛽ Đổ xăng" → điền: lít, giá/lít, odometer, cây xăng.
- **Thêm bảo dưỡng**: card xe → "🔧 Bảo dưỡng" → loại (nhớt/rửa/sửa/lốp/khác) + odometer + mô tả.
- **Cảnh báo thay nhớt**: app track odometer, alert khi đến ngưỡng (1500km xe máy / 5000km ô tô).
- **Quick log từ Tx form**: chọn cat "Chi phí xe" → app gợi ý mở tab Đổ xăng để có data đầy đủ.

## 12. THẺ / TAG
Phân loại linh hoạt ngoài cat (vd #dulich #congtac).
- Trong form GD → field "Thẻ" → gõ tên thẻ.
- Filter GD theo thẻ trong tab Lịch sử.

## 13. BIỂU ĐỒ
Tab **📊 Biểu đồ** → chọn period: ngày / tuần / tháng / năm / custom.
- **Tab "Chung"**: tổng thu/chi + bar chart + tỷ lệ tiết kiệm.
- **Tab "Chi tiêu"** / **Tab "Thu nhập"**: donut chart + top 5 cat + so sánh kỳ trước.
- Tap legend / slice → drill-down xem GD chi tiết.

## 14. ĐỒNG BỘ GOOGLE DRIVE
- **Đăng nhập**: Cài đặt → Tài khoản → "Đăng nhập Google".
- **Đồng bộ**: nút "Đồng bộ với Google Drive" — data lưu trong appDataFolder của Drive (chỉ app này thấy).
- **Đổi máy**: cài app mới → đăng nhập Google cùng tài khoản → đồng bộ → data về.
- **Tự động đồng bộ**: sau mỗi thao tác lưu (autoSync).

## 15. BẢO MẬT
- **Khoá PIN 6 số**: Cài đặt → Bảo mật → Bật khoá PIN → đặt PIN.
- **Sinh trắc học** (vân tay/Face): toggle trong section Bảo mật (cần thiết bị hỗ trợ).
- **Khoá lại sau**: 0 (ngay) / 1p / 5p / 15p / 1h.
- **Quên PIN**: trên màn khoá có nút "🔓 Quên PIN — mở qua Google" → đăng nhập Google đã từng dùng.

## 16. ẨN SỐ DƯ
Nút **👁** trên Trang chủ — ẩn tất cả số tiền (dạng •••••) khi đưa cho người khác xem.

## 17. VỊ TRÍ GPS
Ghi vị trí GD: Cài đặt → Bảo mật → "Lưu vị trí giao dịch" toggle.
- Mỗi GD MỚI sẽ ghi GPS + địa chỉ qua OpenStreetMap.
- **Xoá tất cả vị trí đã lưu**: nút "🗑️ Xoá toàn bộ vị trí".

## 18. THÔNG BÁO
- **Tổng kết 20h hằng ngày**: toggle trong Cài đặt → Thông báo.
- **Smart insights tức thì**: sau mỗi GD, app phân tích + cảnh báo (vượt budget, chi bất thường, mua trùng cat).

## 19. WIDGET TRANG CHỦ
Bật/tắt từng widget: Cài đặt → Giao diện → "Hiển thị trên Trang chủ".
- Số dư từng ví / Sổ tiết kiệm / Mục tiêu / Dự báo / Ngân sách / Cho vay / Insights / GD gần.

## 20. GIAO DIỆN / THEME
Cài đặt → Giao diện:
- **Theme variants**: 6+ bảng màu (xanh lá, xanh dương, hồng, cam...).
- **Dark mode** toggle.
- **Auto theo hệ thống** toggle.

## 21. TRỢ LÝ AI (đang dùng)
- **Truy cập**: tap ✨ floating button góc dưới phải Trang chủ.
- **Cấu hình**: Cài đặt → Trợ lý AI → paste API key Gemini (free 1500 req/ngày).
- **Voice + TTS**: nói thay vì gõ + AI đọc to câu trả lời.
- **Tools**: AI có thể query data + tạo giao dịch (preview confirm).

## 22. CẬP NHẬT APP
- **Auto check**: app fetch GitHub Releases mỗi 6h.
- **Banner trên Trang chủ**: "🆕 Có phiên bản mới" → tap "Tải về & cài đặt" → Android prompt Install.
- **Manual check**: Cài đặt → Trợ giúp → "🔄 Kiểm tra cập nhật".
- **Data giữ nguyên** khi cài đè APK.

## 23. BACKUP / RESTORE
Cài đặt → Dữ liệu:
- **Xuất ra file JSON**: tải file backup chứa toàn bộ data.
- **Nhập từ file JSON**: restore từ file backup.

## FAQ THƯỜNG GẶP

**Q: Quên PIN, không vào được app?**
A: Trên màn khoá có nút "🔓 Quên PIN — mở qua Google". Đăng nhập tài khoản Google đã từng dùng → app tắt PIN cũ. Vào Cài đặt đặt PIN mới.

**Q: Số dư ví không khớp với thực tế?**
A: Tab Tài khoản → tap ví → "⚖️ Điều chỉnh số dư" → nhập số đúng. App tạo GD "Điều chỉnh" để khớp (KHÔNG cộng vào Thu/Chi tháng).

**Q: App có dùng offline được không?**
A: Có — toàn bộ data lưu IndexedDB local. Chỉ cần internet khi: đăng nhập Google, đồng bộ Drive, dùng OCR/AI/Voice (Gemini).

**Q: Voice không nhận được?**
A: Cần build APK có plugin Speech Recognition. PWA web không hỗ trợ. APK build từ GitHub Actions có sẵn.

**Q: AI tốn tiền không?**
A: Không — Gemini free tier 1500 request/ngày. Một user thường dùng 30-50 req/ngày, không hit quota.

**Q: AI key bị lộ?**
A: Lưu encrypted trên thiết bị (Android KeyStore). KHÔNG gửi server bên thứ 3, KHÔNG sync qua Drive.

**Q: Khi nào dùng cat "Chi phí xe" thay vì "Xăng xe" cũ?**
A: Bộ V2 đã gộp tất cả vào 1 cat "Chi phí xe" (gồm xăng + bảo dưỡng + đăng kiểm + bảo hiểm xe). Nếu app còn cat cũ → vào Settings chạy "Cập nhật danh mục chuẩn".

**Q: Insights bằng AI khác gì rule-based?**
A: Hiện tại insights là rule-based (vượt budget, chi nhiều cat...). AI insights nâng cao đang phát triển — sẽ phân tích pattern dài hạn + đưa lời khuyên cá nhân hóa.

**Q: Liên hệ báo lỗi?**
A: Cài đặt → Trợ giúp → "Liên hệ / Báo lỗi: Zalo 0909683666".
`;
