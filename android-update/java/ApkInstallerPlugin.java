package com.thanh.quanlytien;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * Capacitor plugin: cài APK đã download.
 *
 * JS side gọi:
 *   await Capacitor.Plugins.ApkInstaller.installApk({ path: '/data/.../update.apk' });
 *
 * Plugin sẽ:
 *   1. Resolve path → File
 *   2. Lấy content URI qua FileProvider (Android 7+ yêu cầu)
 *   3. Tạo Intent ACTION_VIEW với MIME application/vnd.android.package-archive
 *   4. startActivity → Android hiện dialog "Cài đặt?" — user tap 1 lần là xong
 *
 * Permission cần (đã inject trong AndroidManifest qua workflow):
 *   - REQUEST_INSTALL_PACKAGES (Android 8+)
 *   - FileProvider authority: ${applicationId}.fileprovider
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @PluginMethod
    public void installApk(PluginCall call) {
        String filePath = call.getString("path");
        if (filePath == null || filePath.isEmpty()) {
            call.reject("Thiếu tham số 'path'");
            return;
        }

        try {
            // Hỗ trợ cả file:// URI và absolute path
            if (filePath.startsWith("file://")) {
                filePath = filePath.substring(7);
            }
            File apkFile = new File(filePath);
            if (!apkFile.exists()) {
                call.reject("Không tìm thấy file: " + filePath);
                return;
            }
            if (apkFile.length() == 0) {
                call.reject("File rỗng: " + filePath);
                return;
            }

            String authority = getContext().getPackageName() + ".fileprovider";
            Uri apkUri = FileProvider.getUriForFile(getContext(), authority, apkFile);

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_GRANT_READ_URI_PERMISSION
            );

            getContext().startActivity(intent);

            JSObject result = new JSObject();
            result.put("started", true);
            result.put("path", filePath);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Lỗi mở installer: " + e.getMessage(), e);
        }
    }

    /**
     * Share file qua system share sheet — user pick app để save/send.
     * Dùng cho: export báo cáo CSV/HTML/PDF/JSON → user save vào Drive,
     * gửi email, share Zalo, etc.
     *
     * JS side:
     *   await Capacitor.Plugins.ApkInstaller.shareFile({
     *     path: '/data/.../report.csv',
     *     mime: 'text/csv',
     *     title: 'Chia sẻ báo cáo'
     *   });
     */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String filePath = call.getString("path");
        String mimeType = call.getString("mime", "*/*");
        String chooserTitle = call.getString("title", "Chia sẻ file");

        if (filePath == null || filePath.isEmpty()) {
            call.reject("Thiếu tham số 'path'");
            return;
        }

        try {
            if (filePath.startsWith("file://")) {
                filePath = filePath.substring(7);
            }
            java.io.File file = new java.io.File(filePath);
            if (!file.exists()) {
                call.reject("Không tìm thấy file: " + filePath);
                return;
            }
            if (file.length() == 0) {
                call.reject("File rỗng (0 bytes): " + filePath);
                return;
            }

            String authority = getContext().getPackageName() + ".fileprovider";
            Uri fileUri = FileProvider.getUriForFile(getContext(), authority, file);

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType(mimeType);
            shareIntent.putExtra(Intent.EXTRA_STREAM, fileUri);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(shareIntent, chooserTitle);
            chooser.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            getContext().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("shared", true);
            result.put("path", filePath);
            result.put("size", file.length());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Lỗi share file: " + e.getMessage(), e);
        }
    }
}
