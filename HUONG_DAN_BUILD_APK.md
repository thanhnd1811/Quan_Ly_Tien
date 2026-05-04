# Hướng dẫn build APK "Quản Lý Tiền"

App này là PWA + Capacitor, đóng gói thành APK Android cài trực tiếp lên điện thoại.

## TRƯỚC TIÊN: Lấy Google Client ID

App cần đăng nhập Google để đồng bộ Drive. Xem [README.md](README.md) phần "Bước 1 — Lấy Google Client ID". Sau khi có Client ID, mở `www/js/config.js` và dán vào.

> Nếu chưa có Client ID, app vẫn build được và hoạt động ở chế độ offline (mỗi máy tự lưu, không đồng bộ).

---

## CÁCH 1 — Build trên cloud (DỄ NHẤT, không cài gì)

### Cần
- 1 tài khoản GitHub miễn phí

### Các bước
1. Vào [github.com/new](https://github.com/new) → tạo repo mới (private cũng được), tên `quan-ly-tien` (hoặc tuỳ ý).
2. Trong repo mới, bấm **Add file → Upload files**, kéo thả TOÀN BỘ nội dung trong thư mục `Quan_Ly_Tien/` (bao gồm cả `.github/workflows/build-apk.yml`).
3. Commit. GitHub Actions sẽ tự chạy build.
4. Vào tab **Actions** trong repo, chờ ~5-7 phút thấy job "Build APK" xong (✅ xanh).
5. Bấm vào job → kéo xuống dưới mục **Artifacts** → tải `QuanLyTien-debug-apk.zip`.
6. Giải nén → có file `app-debug.apk`. Copy vào điện thoại, tap để cài đặt.

> Mỗi lần bạn thay đổi code rồi push lên GitHub → APK mới được build tự động.

---

## CÁCH 2 — Build tại máy bạn

### Cần cài
- **Node.js 18+**: https://nodejs.org
- **JDK 17**: https://adoptium.net (nếu bạn đã có JDK 21/25 cũng OK)
- **Android Studio**: https://developer.android.com/studio (~3 GB)
  - Khi cài, tick **Android SDK + Android SDK Platform-Tools**

### Các bước
Mở Terminal/PowerShell tại thư mục `Quan_Ly_Tien/`:

```bash
# 1. Cài thư viện
npm install

# 2. Tạo platform Android (chỉ lần đầu)
npx cap add android

# 3. Copy code web sang Android
npx cap sync android

# 4. Build APK debug bằng dòng lệnh
cd android
gradlew.bat assembleDebug    # Windows
./gradlew assembleDebug      # Mac/Linux
```

APK ở `android/app/build/outputs/apk/debug/app-debug.apk`.

Hoặc mở Android Studio:
```bash
npx cap open android
```
Trong Android Studio → **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

---

## CÁCH 3 — Build qua dịch vụ online

- **voltbuilder.com**: đăng ký, upload zip thư mục `Quan_Ly_Tien/` (sau khi đã `npm install` & `npx cap sync`). (Có phí sau trial.)
- **appflow.ionic.io**: tương tự.

---

## Cài APK lên điện thoại

1. Copy file `.apk` vào điện thoại (USB, Zalo, Drive đều được).
2. Mở file → Android hỏi "Cài đặt từ nguồn không xác định" → bấm **Cho phép** trong Cài đặt.
3. Bấm **Cài đặt**.
4. Mở app → cấp quyền thông báo và camera.

---

## Build APK ký (release)

APK debug có popup "Bản test". Để bỏ:

```bash
cd android

# Tạo keystore (1 lần duy nhất, nhớ ghi password)
keytool -genkey -v -keystore release.keystore -alias quanlytien -keyalg RSA -keysize 2048 -validity 36500

# Tạo file app/key.properties
cat > app/key.properties <<EOF
storeFile=../../release.keystore
storePassword=MAT_KHAU_CUA_BAN
keyAlias=quanlytien
keyPassword=MAT_KHAU_CUA_BAN
EOF

# Build
./gradlew assembleRelease
# APK ở android/app/build/outputs/apk/release/app-release.apk
```

---

## Khắc phục sự cố

**Đăng nhập Google trong APK báo lỗi `redirect_uri_mismatch`:**
- Vào Google Cloud Console → Credentials → OAuth Client ID → Authorized JavaScript origins
- Thêm: `https://localhost`
- Lưu, đợi 1-2 phút, thử lại.

**Đồng bộ Drive lỗi 403:**
- Đã bật Google Drive API trong Cloud Console chưa?
- App đang ở chế độ Testing → email của bạn phải có trong "Test users" ở OAuth consent screen.

**OCR đọc sai số tiền:**
- Chụp gần, đủ sáng, hoá đơn không nhăn.
- App tự động ưu tiên dòng có chữ "Tổng" / "Thanh toán" / "Total".
- Số đọc được luôn xuất hiện trong form trước khi lưu — bạn có thể sửa tay.

**Mất dữ liệu khi gỡ app:**
- Nếu đã đăng nhập Google: cài lại + đăng nhập lại → dữ liệu tự kéo từ Drive về.
- Nếu chưa đăng nhập: dữ liệu mất luôn. Lần sau nhớ vào Cài đặt → "Xuất ra file JSON" để sao lưu.

**Đổi điện thoại:**
- Có Google: cài app máy mới → đăng nhập → tự đồng bộ.
- Không có Google: máy cũ "Xuất ra file JSON" → gửi sang máy mới → "Nhập từ file JSON".
