package com.thanh.quanlytien;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
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
            if (!BANK_PACKAGES.contains(pkg)) return; // chỉ bank apps

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
        } catch (Exception e) {
            // Silent fail
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
