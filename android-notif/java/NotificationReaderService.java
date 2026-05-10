package com.thanh.quanlytien;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

/**
 * Background service lắng nghe push notification từ các app ngân hàng VN.
 *
 * Khi user grant "Notification access" → service tự khởi động + capture
 * notification từ bank apps (VCB Digibank, MBBank, Techcombank, ACB ONE,
 * BIDV SmartBanking, VPBank Neo...). Lưu vào SharedPreferences để JS
 * đọc + parse khi app mở.
 *
 * Permission: BIND_NOTIFICATION_LISTENER_SERVICE — Android cấp khi user
 * vào Settings → Special access → Notification access → bật QLT.
 *
 * BẢO MẬT: Service chỉ filter package theo whitelist BANK_PACKAGES.
 * Notification từ app khác bị bỏ qua (không lưu, không log).
 */
public class NotificationReaderService extends NotificationListenerService {

    private static final String PREFS_NAME = "qlt_notif_cache";
    private static final String KEY_NOTIFICATIONS = "notifications_json";
    private static final int MAX_CACHED = 200; // cap để không bùng SharedPrefs

    // Package names các app NH VN. Bank đổi package → cập nhật danh sách.
    // Format: phải lowercase + match exact.
    private static final Set<String> BANK_PACKAGES = new HashSet<>();
    static {
        // Vietcombank
        BANK_PACKAGES.add("com.VCB");
        BANK_PACKAGES.add("com.vcb.digibank");
        BANK_PACKAGES.add("vn.com.vcb.digibank");
        // MBBank
        BANK_PACKAGES.add("com.mbmobile");
        BANK_PACKAGES.add("com.mbbank.app");
        // Techcombank
        BANK_PACKAGES.add("com.techcombank.bb.app");
        BANK_PACKAGES.add("vn.com.techcombank.app");
        // ACB
        BANK_PACKAGES.add("mobile.acb.com.vn");
        BANK_PACKAGES.add("com.acb.bank");
        // BIDV
        BANK_PACKAGES.add("com.vnpay.bidv");
        BANK_PACKAGES.add("com.bidv.smartbanking");
        // VPBank
        BANK_PACKAGES.add("com.vpbank.mobiletest");
        BANK_PACKAGES.add("com.vpb.mobilebanking");
        BANK_PACKAGES.add("com.vpbank.neo");
        // TPBank
        BANK_PACKAGES.add("vn.com.tpbank.tpbmb");
        BANK_PACKAGES.add("com.tpb.app");
        // Sacombank
        BANK_PACKAGES.add("com.sacombank.ewallet");
        BANK_PACKAGES.add("com.sacombank.spbb");
        // VietinBank
        BANK_PACKAGES.add("com.vietinbank.ipay");
        BANK_PACKAGES.add("vn.com.vietinbank.efast");
        // Agribank
        BANK_PACKAGES.add("com.vnpay.agribankplus");
        BANK_PACKAGES.add("vn.agribank.emobilebanking");
        // Khác
        BANK_PACKAGES.add("com.shb.mb");
        BANK_PACKAGES.add("com.hdbank.fintech");
        BANK_PACKAGES.add("com.vib.app");
        BANK_PACKAGES.add("com.msb.smartmb");
        BANK_PACKAGES.add("com.ocbnews.cbs");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            String pkg = sbn.getPackageName();
            if (pkg == null) return;

            // Skip notif của chính app (tránh loop với summary notification)
            if (pkg.equals(getPackageName())) return;

            // Skip system apps thông dụng (Android, Google services, launcher...)
            if (pkg.startsWith("com.android.") || pkg.startsWith("com.miui.")
                || pkg.startsWith("com.google.android.") || pkg.startsWith("com.xiaomi.")
                || pkg.equals("android")) return;

            Notification notif = sbn.getNotification();
            if (notif == null) return;

            Bundle extras = notif.extras;
            if (extras == null) return;

            CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
            CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
            CharSequence bigTextCs = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);

            String title = titleCs != null ? titleCs.toString() : "";
            String text = textCs != null ? textCs.toString() : "";
            String bigText = bigTextCs != null ? bigTextCs.toString() : "";

            // Body: prefer bigText (full), fallback text
            String body = !bigText.isEmpty() ? bigText : text;

            // Skip nếu body quá ngắn — không phải notif GD
            if (body.length() < 20) return;

            // Detect bank notif:
            //   1. Package trong whitelist → known bank (chắc chắn)
            //   2. Hoặc body có pattern "VND" + amount → có khả năng bank notif
            //      (catch các bank chưa có trong whitelist, hoặc package thay đổi)
            boolean isKnownBankPkg = BANK_PACKAGES.contains(pkg);
            boolean hasBankFormat = body.matches("(?s).*\\b\\d{1,3}([,.]\\d{3})+\\s*(VND|VNĐ|đ)\\b.*")
                                 || body.matches("(?s).*\\b\\d+[,.]?\\d{0,3}\\s*VND\\b.*");
            if (!isKnownBankPkg && !hasBankFormat) return; // skip non-bank notif

            saveNotification(pkg, title, body, sbn.getPostTime(), sbn.getKey());
        } catch (Exception e) {
            // Service phải resilient — không throw để khỏi bị Android tắt
        }
    }

    /**
     * Lưu notification vào SharedPreferences (JSON array).
     * Trim list nếu vượt MAX_CACHED.
     */
    private synchronized void saveNotification(String pkg, String title,
                                                String body, long postTime, String key) {
        try {
            SharedPreferences prefs = getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existing = prefs.getString(KEY_NOTIFICATIONS, "[]");
            JSONArray arr = new JSONArray(existing);

            // Anti-dup: nếu key (sbn.getKey()) đã tồn tại → skip
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                if (o.optString("sbnKey", "").equals(key)) return;
            }

            JSONObject newNotif = new JSONObject();
            newNotif.put("pkg", pkg);
            newNotif.put("title", title);
            newNotif.put("body", body);
            newNotif.put("postTime", postTime);
            newNotif.put("sbnKey", key);
            newNotif.put("processed", false);
            arr.put(newNotif);

            // Trim nếu vượt MAX_CACHED — giữ N notif mới nhất
            if (arr.length() > MAX_CACHED) {
                JSONArray trimmed = new JSONArray();
                int start = arr.length() - MAX_CACHED;
                for (int i = start; i < arr.length(); i++) {
                    trimmed.put(arr.get(i));
                }
                arr = trimmed;
            }

            prefs.edit().putString(KEY_NOTIFICATIONS, arr.toString()).apply();

            // Post summary notification cho badge count (số trên icon launcher)
            int unprocessedCount = 0;
            for (int i = 0; i < arr.length(); i++) {
                if (!arr.getJSONObject(i).optBoolean("processed", false)) unprocessedCount++;
            }
            postSummaryNotification(unprocessedCount);
        } catch (Exception e) {
            // Silent fail
        }
    }

    private static final String SUMMARY_CHANNEL_ID = "qlt_bank_summary";
    private static final int SUMMARY_NOTIF_ID = 99100;

    /**
     * Post 1 notification riêng của QLT để launcher show badge count trên icon.
     * MIUI/Samsung/Pixel đều support setNumber → tự động hiện chấm/số.
     * Tap notification → mở app → process pending → app cancel notification này.
     */
    private void postSummaryNotification(int count) {
        if (count <= 0) {
            cancelSummaryNotification();
            return;
        }
        try {
            Context ctx = getApplicationContext();
            NotificationManager mgr = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (mgr == null) return;

            // Create channel (Android 8+)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                    SUMMARY_CHANNEL_ID,
                    "💰 GD ngân hàng chờ ghi",
                    NotificationManager.IMPORTANCE_LOW // ko ring/vibrate, chỉ show badge
                );
                channel.setDescription("Đếm số giao dịch ngân hàng đã bắt được nhưng chưa ghi vào app");
                channel.setShowBadge(true);
                mgr.createNotificationChannel(channel);
            }

            // Tap notification → mở app
            Intent openIntent = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            if (openIntent == null) {
                openIntent = new Intent();
                openIntent.setClassName(ctx, "com.thanh.quanlytien.MainActivity");
            }
            openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(ctx, 0, openIntent, piFlags);

            String title = "💰 " + count + " giao dịch ngân hàng chờ ghi";
            String body = count == 1
                ? "Tap để mở app — tự ghi vào sổ"
                : "Tap để mở app — tự ghi " + count + " GD vào sổ";

            NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, SUMMARY_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info) // fallback icon — chấp nhận được
                .setContentTitle(title)
                .setContentText(body)
                .setNumber(count) // launcher hiện badge count
                .setContentIntent(pi)
                .setAutoCancel(false)
                .setOngoing(false)
                .setPriority(NotificationCompat.PRIORITY_LOW);

            try {
                NotificationManagerCompat.from(ctx).notify(SUMMARY_NOTIF_ID, builder.build());
            } catch (SecurityException ignore) {
                // POST_NOTIFICATIONS chưa cấp (Android 13+) → silent skip
            }
        } catch (Exception e) {
            // Silent — service phải resilient
        }
    }

    private void cancelSummaryNotification() {
        try {
            NotificationManagerCompat.from(getApplicationContext()).cancel(SUMMARY_NOTIF_ID);
        } catch (Exception e) {
            // Silent
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // Không xử lý — ta chỉ care notif posted, không care removed
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        // Service đã connect — sẵn sàng nhận notif
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        // User đã revoke permission hoặc system disconnect
    }
}
