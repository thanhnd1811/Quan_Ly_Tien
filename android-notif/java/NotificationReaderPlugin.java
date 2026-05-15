package com.thanh.quanlytien;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Set;

/**
 * Capacitor plugin: bridge JS ↔ NotificationReaderService.
 *
 * JS side gọi:
 *   await Capacitor.Plugins.NotificationReader.isEnabled()
 *   await Capacitor.Plugins.NotificationReader.openSettings()
 *   await Capacitor.Plugins.NotificationReader.getCachedNotifications()
 *   await Capacitor.Plugins.NotificationReader.markProcessed({ sbnKeys: [...] })
 *   await Capacitor.Plugins.NotificationReader.clearCache()
 */
@CapacitorPlugin(name = "NotificationReader")
public class NotificationReaderPlugin extends Plugin {

    private static final String PREFS_NAME = "qlt_notif_cache";
    private static final String KEY_NOTIFICATIONS = "notifications_json";

    /**
     * Check user đã grant Notification access cho app chưa.
     */
    @PluginMethod
    public void isEnabled(PluginCall call) {
        try {
            Set<String> enabled = NotificationManagerCompat.getEnabledListenerPackages(getContext());
            boolean granted = enabled.contains(getContext().getPackageName());
            JSObject result = new JSObject();
            result.put("enabled", granted);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Lỗi check permission: " + e.getMessage(), e);
        }
    }

    /**
     * Mở Settings hệ thống → Notification access — user vào bật permission.
     * (Android không có popup runtime cho permission này — phải vào Settings.)
     */
    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("opened", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Không mở được Settings: " + e.getMessage(), e);
        }
    }

    /**
     * Lấy tất cả notification đã cache, optional filter onlyUnprocessed.
     * Trả về: { notifications: [{pkg, title, body, postTime, sbnKey, processed}] }
     */
    @PluginMethod
    public void getCachedNotifications(PluginCall call) {
        boolean onlyUnprocessed = call.getBoolean("onlyUnprocessed", true);
        try {
            SharedPreferences prefs = getContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existing = prefs.getString(KEY_NOTIFICATIONS, "[]");
            JSONArray arr = new JSONArray(existing);
            JSArray result = new JSArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                if (onlyUnprocessed && o.optBoolean("processed", false)) continue;
                JSObject jo = new JSObject();
                jo.put("pkg", o.optString("pkg"));
                jo.put("title", o.optString("title"));
                jo.put("body", o.optString("body"));
                jo.put("postTime", o.optLong("postTime"));
                jo.put("sbnKey", o.optString("sbnKey"));
                jo.put("processed", o.optBoolean("processed", false));
                result.put(jo);
            }
            JSObject ret = new JSObject();
            ret.put("notifications", result);
            ret.put("count", result.length());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Lỗi đọc cache: " + e.getMessage(), e);
        }
    }

    /**
     * Mark các notif đã xử lý (saved hoặc skipped) để khỏi suggest lại.
     * @param sbnKeys: array of strings
     */
    @PluginMethod
    public void markProcessed(PluginCall call) {
        try {
            JSArray sbnKeys = call.getArray("sbnKeys");
            if (sbnKeys == null) {
                call.reject("Thiếu sbnKeys");
                return;
            }
            // Build set keys cần mark
            java.util.HashSet<String> keysToMark = new java.util.HashSet<>();
            for (int i = 0; i < sbnKeys.length(); i++) {
                keysToMark.add(sbnKeys.getString(i));
            }

            SharedPreferences prefs = getContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String existing = prefs.getString(KEY_NOTIFICATIONS, "[]");
            JSONArray arr = new JSONArray(existing);
            int updated = 0;
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                if (keysToMark.contains(o.optString("sbnKey"))) {
                    o.put("processed", true);
                    updated++;
                }
            }
            prefs.edit().putString(KEY_NOTIFICATIONS, arr.toString()).apply();

            JSObject ret = new JSObject();
            ret.put("updated", updated);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Lỗi mark processed: " + e.getMessage(), e);
        }
    }

    /**
     * Xoá hết cache notifications. Dùng khi user "reset" trong Settings.
     */
    @PluginMethod
    public void clearCache(PluginCall call) {
        try {
            SharedPreferences prefs = getContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().remove(KEY_NOTIFICATIONS).apply();
            JSObject ret = new JSObject();
            ret.put("cleared", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Lỗi xoá cache: " + e.getMessage(), e);
        }
    }

    /**
     * Cancel summary notification (clear badge count trên icon launcher).
     * Gọi sau khi JS đã process pending notifs xong.
     */
    @PluginMethod
    public void clearBadge(PluginCall call) {
        try {
            androidx.core.app.NotificationManagerCompat
                .from(getContext())
                .cancel(99100); // NotificationReaderService.SUMMARY_NOTIF_ID
            JSObject ret = new JSObject();
            ret.put("cleared", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Lỗi clear badge: " + e.getMessage(), e);
        }
    }

    /**
     * Update badge count thủ công. Dùng nếu JS muốn override count
     * (vd: count theo logic riêng — pending bao gồm chưa save thành công).
     */
    @PluginMethod
    public void setBadgeCount(PluginCall call) {
        int count = call.getInt("count", 0);
        try {
            if (count <= 0) {
                androidx.core.app.NotificationManagerCompat
                    .from(getContext()).cancel(99100);
            } else {
                // Reuse logic của service — gọi service helper qua context
                Intent i = new Intent(getContext(), NotificationReaderService.class);
                i.setAction("UPDATE_BADGE");
                i.putExtra("count", count);
                // Service không expose method từ ngoài → đơn giản nhất: post
                // notification từ plugin trực tiếp (cùng channel, cùng id)
                postBadgeNotification(count);
            }
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Lỗi setBadgeCount: " + e.getMessage(), e);
        }
    }

    /**
     * Mở settings tắt tối ưu pin (battery optimization) cho app này.
     * Vital cho MIUI/EMUI/ColorOS — họ giết NotificationListenerService aggressively.
     * Khi user tắt tối ưu, service được giữ alive lâu hơn nhiều.
     */
    @PluginMethod
    public void requestBatteryWhitelist(PluginCall call) {
        try {
            android.content.Context ctx = getContext();
            String pkg = ctx.getPackageName();
            android.os.PowerManager pm = (android.os.PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            boolean isIgnoring = pm != null && pm.isIgnoringBatteryOptimizations(pkg);

            Intent intent;
            if (isIgnoring) {
                // Đã trong whitelist → mở list để user tự verify (không thể request lại)
                intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            } else {
                // Request trực tiếp — popup hỏi user
                intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(android.net.Uri.parse("package:" + pkg));
            }
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("opened", true);
            ret.put("alreadyWhitelisted", isIgnoring);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Không mở được battery settings: " + e.getMessage(), e);
        }
    }

    /**
     * Mở settings Autostart (cho phép tự khởi động) — chỉ MIUI/Xiaomi support intent này.
     * Fallback: mở App info để user manually navigate.
     */
    @PluginMethod
    public void openAutostartSettings(PluginCall call) {
        android.content.Context ctx = getContext();
        boolean opened = false;
        String which = null;

        // List intent OEM-specific để thử theo thứ tự
        Intent[] candidates = new Intent[] {
            // MIUI / Xiaomi
            new Intent().setComponent(new android.content.ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity")),
            // Huawei EMUI
            new Intent().setComponent(new android.content.ComponentName(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")),
            new Intent().setComponent(new android.content.ComponentName(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.optimize.process.ProtectActivity")),
            // Oppo ColorOS
            new Intent().setComponent(new android.content.ComponentName(
                "com.coloros.safecenter",
                "com.coloros.safecenter.permission.startup.StartupAppListActivity")),
            new Intent().setComponent(new android.content.ComponentName(
                "com.oppo.safe",
                "com.oppo.safe.permission.startup.StartupAppListActivity")),
            // Vivo FuntouchOS
            new Intent().setComponent(new android.content.ComponentName(
                "com.iqoo.secure",
                "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity")),
            // Letv
            new Intent().setComponent(new android.content.ComponentName(
                "com.letv.android.letvsafe",
                "com.letv.android.letvsafe.AutobootManageActivity")),
            // Asus
            new Intent().setComponent(new android.content.ComponentName(
                "com.asus.mobilemanager",
                "com.asus.mobilemanager.MainActivity")),
        };
        String[] names = {"MIUI", "EMUI(start)", "EMUI(protect)", "ColorOS", "OPPO",
                           "Vivo", "Letv", "Asus"};

        for (int i = 0; i < candidates.length; i++) {
            try {
                Intent intent = candidates[i];
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (ctx.getPackageManager().resolveActivity(intent, 0) != null) {
                    ctx.startActivity(intent);
                    opened = true;
                    which = names[i];
                    break;
                }
            } catch (Exception ignore) { /* try next */ }
        }

        if (!opened) {
            // Fallback: mở App info để user manually toggle autostart trong Battery
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                fallback.setData(android.net.Uri.parse("package:" + ctx.getPackageName()));
                fallback.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(fallback);
                which = "AppInfo (fallback)";
                opened = true;
            } catch (Exception e) {
                call.reject("Không mở được autostart settings: " + e.getMessage(), e);
                return;
            }
        }

        JSObject ret = new JSObject();
        ret.put("opened", opened);
        ret.put("which", which);
        call.resolve(ret);
    }

    /**
     * Force rebind NotificationListenerService — toggle component enabled state.
     * Android sẽ disconnect rồi reconnect listener → khôi phục service nếu bị
     * MIUI/Samsung giết. Test reliability bằng cách verify ngay sau bằng isEnabled().
     */
    @PluginMethod
    public void rebindListener(PluginCall call) {
        try {
            android.content.Context ctx = getContext();
            android.content.pm.PackageManager pm = ctx.getPackageManager();
            android.content.ComponentName cn = new android.content.ComponentName(
                ctx, NotificationReaderService.class);
            pm.setComponentEnabledSetting(cn,
                android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                android.content.pm.PackageManager.DONT_KILL_APP);
            // Đợi 100ms cho Android xử lý disconnect
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                try {
                    pm.setComponentEnabledSetting(cn,
                        android.content.pm.PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                        android.content.pm.PackageManager.DONT_KILL_APP);
                } catch (Exception ignore) {}
            }, 100);

            JSObject ret = new JSObject();
            ret.put("rebound", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Lỗi rebind: " + e.getMessage(), e);
        }
    }

    private void postBadgeNotification(int count) {
        // Mirror logic NotificationReaderService.postSummaryNotification
        // Đơn giản hoá: chỉ post notif với count
        try {
            android.content.Context ctx = getContext();
            android.app.NotificationManager mgr = (android.app.NotificationManager)
                ctx.getSystemService(android.content.Context.NOTIFICATION_SERVICE);
            if (mgr == null) return;
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                android.app.NotificationChannel channel = new android.app.NotificationChannel(
                    "qlt_bank_summary", "💰 GD ngân hàng chờ ghi",
                    android.app.NotificationManager.IMPORTANCE_LOW
                );
                channel.setShowBadge(true);
                mgr.createNotificationChannel(channel);
            }
            Intent openIntent = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            if (openIntent != null) {
                openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                int piFlags = android.app.PendingIntent.FLAG_UPDATE_CURRENT
                    | android.app.PendingIntent.FLAG_IMMUTABLE;
                android.app.PendingIntent pi = android.app.PendingIntent
                    .getActivity(ctx, 0, openIntent, piFlags);

                androidx.core.app.NotificationCompat.Builder builder =
                    new androidx.core.app.NotificationCompat.Builder(ctx, "qlt_bank_summary")
                    .setSmallIcon(android.R.drawable.ic_dialog_info)
                    .setContentTitle("💰 " + count + " giao dịch ngân hàng chờ ghi")
                    .setContentText("Tap để mở app — tự ghi vào sổ")
                    .setNumber(count)
                    .setContentIntent(pi)
                    .setAutoCancel(false)
                    .setPriority(androidx.core.app.NotificationCompat.PRIORITY_LOW);

                try {
                    androidx.core.app.NotificationManagerCompat.from(ctx)
                        .notify(99100, builder.build());
                } catch (SecurityException ignore) { }
            }
        } catch (Exception ignore) { }
    }
}
