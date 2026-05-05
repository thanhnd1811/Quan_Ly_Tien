# Quản Lý Tiền

[![License: Proprietary](https://img.shields.io/badge/license-Proprietary-red.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](package.json)
[![Platform](https://img.shields.io/badge/platform-PWA%20%7C%20Android-green.svg)](#)

App quản lý thu chi cá nhân — chạy được như **PWA** (mở trong trình duyệt) và đóng gói thành **APK Android** qua Capacitor.

> Phát triển bởi **Nguyễn Thanh** · Liên hệ: Zalo [0909683666](https://zalo.me/0909683666)

## Tính năng

- **Đa người dùng**: đăng nhập Google, mỗi tài khoản có dữ liệu riêng (lưu cục bộ trong IndexedDB theo email).
- **Đồng bộ Google Drive**: dữ liệu lưu trong `appDataFolder` của Drive (riêng cho app, không hiện file trong Drive thường) — đổi máy chỉ cần đăng nhập lại là kéo về đầy đủ.
- **Quản lý thu chi**: thêm/sửa/xoá giao dịch, gắn danh mục + tài khoản + ghi chú.
- **Danh mục**: chia thành Chi phí / Thu nhập, có icon + màu, CRUD thoải mái.
- **Tài khoản**: nhiều ví (Tiền mặt, Ngân hàng, Coin...), số dư tự cập nhật theo giao dịch.
- **Biểu đồ**: cột thu/chi theo Ngày / Tuần / Tháng / Năm + donut phân loại chi tiêu.
- **Chụp hoá đơn**: chụp ảnh → OCR (Tesseract.js) → tự điền số tiền, ngày, tên cửa hàng → user xác nhận trước khi lưu.
- **Nhắc nhở**: định kỳ hàng ngày/tuần/tháng/năm, tuỳ chọn tự động thêm giao dịch khi đến hạn (qua LocalNotifications của Capacitor).
- **Xuất / nhập JSON**: sao lưu thủ công nếu không muốn dùng Drive.

## Cấu trúc thư mục

```
Quan_Ly_Tien/
├── package.json              # khai báo deps Capacitor
├── capacitor.config.json     # cấu hình app id, tên
├── www/                      # frontend của app
│   ├── index.html            # UI tất cả màn hình
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # service worker (chạy offline)
│   ├── icons/                # icon app
│   └── js/
│       ├── config.js         # ⚠️ Cần điền GOOGLE_CLIENT_ID
│       ├── icons.js          # bộ SVG inline
│       ├── storage.js        # IndexedDB wrapper
│       ├── auth.js           # đăng nhập Google
│       ├── sync.js           # đồng bộ Google Drive
│       ├── ocr.js            # OCR hoá đơn (Tesseract)
│       ├── charts.js         # vẽ biểu đồ
│       └── app.js            # logic UI chính
├── .github/workflows/
│   └── build-apk.yml         # GitHub Actions tự build APK
└── HUONG_DAN_BUILD_APK.md
```

## Bước 1 — Lấy Google Client ID

1. Vào [Google Cloud Console](https://console.cloud.google.com/) → tạo project mới (hoặc dùng project sẵn).
2. Vào **APIs & Services → Library** → bật **Google Drive API**.
3. Vào **APIs & Services → OAuth consent screen** → chọn **External** → điền:
   - App name: `Quan Ly Tien`
   - User support email: email của bạn
   - Scope: thêm `.../auth/drive.appdata`, `.../auth/userinfo.profile`, `.../auth/userinfo.email`
   - Test users: thêm email của bạn (để test khi app chưa publish)
4. Vào **APIs & Services → Credentials → Create Credentials → OAuth Client ID**:
   - Application type: **Web application**
   - Authorized JavaScript origins (thêm tất cả domain bạn dùng):
     - `http://localhost:8080` — để test PWA local
     - `https://<username>.github.io` — nếu host bằng GitHub Pages
     - `https://localhost` — Capacitor Android dùng scheme này
5. Copy **Client ID**, mở `www/js/config.js`, dán vào `GOOGLE_CLIENT_ID`.

> **Đa người dùng**: tự nó đa người dùng rồi — bất kỳ ai có Gmail đều đăng nhập được, mỗi user có dữ liệu riêng. Không cần backend.

## Bước 2 — Chạy thử PWA

```bash
# Trong thư mục Quan_Ly_Tien
npx http-server www -p 8080
# Hoặc python -m http.server 8080 -d www
```

Mở trình duyệt: http://localhost:8080

## Bước 3 — Build APK

Xem chi tiết trong [HUONG_DAN_BUILD_APK.md](HUONG_DAN_BUILD_APK.md). Tóm tắt 3 cách:

1. **Cloud (dễ nhất)**: push lên GitHub, GitHub Actions tự build, tải APK về.
2. **Local**: cài Node.js + JDK 17 + Android Studio, chạy `npm install && npx cap add android && npx cap sync && cd android && gradlew.bat assembleDebug`.
3. **Online services**: voltbuilder.com hoặc appflow.

## Lưu ý quan trọng

- **OCR hoá đơn** dùng Tesseract.js, lần đầu chạy sẽ tải ngôn ngữ tiếng Việt (~25MB) về cache — sau đó offline được.
- **Google Sign-In trên WebView (APK)**: cần thêm scheme `https://localhost` vào Authorized origins. Nếu vẫn lỗi, dùng plugin native `@codetrix-studio/capacitor-google-auth` (xem hướng dẫn nâng cao).
- **Dữ liệu trên Drive** lưu trong `appDataFolder` — chỉ app này thấy, user xoá app thì có thể vẫn còn. Để xoá hoàn toàn, vào https://myaccount.google.com/permissions thu hồi quyền của app.
- App không cần backend, không tốn chi phí server.

## Bản quyền

**© 2026 Nguyễn Thanh — All Rights Reserved.**

Phần mềm này là tài sản trí tuệ độc quyền của Nguyễn Thanh. Người dùng cuối được cài đặt và sử dụng cho mục đích **phi thương mại cá nhân**. Nghiêm cấm:

- Sao chép, chỉnh sửa, dịch ngược mã nguồn
- Phân phối lại / đăng tải lên kho lưu trữ công cộng
- Sử dụng để xây sản phẩm phái sinh hoặc cạnh tranh
- Loại bỏ thông tin tác giả khỏi giao diện và file xuất

Xem chi tiết trong [LICENSE](LICENSE).

**Liên hệ xin phép sử dụng / báo lỗi / góp ý:**

- 👤 Tác giả: Nguyễn Thanh
- 💬 Zalo: [0909683666](https://zalo.me/0909683666)
