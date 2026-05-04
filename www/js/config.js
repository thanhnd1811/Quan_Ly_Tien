// Cấu hình Google OAuth - thay CLIENT_ID bằng Client ID của bạn
// Lấy tại: https://console.cloud.google.com/apis/credentials
// Tạo OAuth 2.0 Client ID kiểu "Web application"
// Authorized JavaScript origins: thêm domain bạn host PWA (vd https://you.github.io)
//   và http://localhost:8080 để test
window.QLT_CONFIG = {
  GOOGLE_CLIENT_ID: '923307129135-c5b3o8qcjhr2ueetenb2bpa3i2il29h6.apps.googleusercontent.com',
  // Scope: chỉ truy cập file do app tạo trong Drive (an toàn, không đụng file khác)
  DRIVE_SCOPE: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
  // Tên file lưu data trong Drive
  DRIVE_FILENAME: 'quanlytien-data.json',
  CURRENCY: 'VND'
};
