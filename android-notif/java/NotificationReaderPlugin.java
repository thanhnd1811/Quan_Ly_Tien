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
}
