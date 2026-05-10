package com.thanh.quanlytien;

import android.Manifest;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Capacitor plugin: đọc SMS inbox để parse giao dịch ngân hàng.
 *
 * JS side gọi:
 *   await Capacitor.Plugins.SmsReader.checkPermission()
 *   await Capacitor.Plugins.SmsReader.requestPermission()
 *   await Capacitor.Plugins.SmsReader.readInbox({ since: 1234567890, limit: 200 })
 *
 * Trả về SMS có sender chứa keyword bank (VCB, MB, TCB, ACB, BIDV...)
 * → JS parse + hiển thị pending tx list cho user confirm.
 *
 * BẢO MẬT:
 * - Permission READ_SMS — Android bảo vệ chặt, user phải explicit grant
 * - SMS chỉ đọc trong app (không gửi đi đâu)
 * - User có thể revoke permission bất kỳ lúc nào trong Settings hệ thống
 */
@CapacitorPlugin(
    name = "SmsReader",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS })
    }
)
public class SmsReaderPlugin extends Plugin {

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject result = new JSObject();
        boolean granted = ContextCompat.checkSelfPermission(
            getContext(), Manifest.permission.READ_SMS
        ) == PackageManager.PERMISSION_GRANTED;
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("sms", call, "smsPermissionCallback");
    }

    @PermissionCallback
    private void smsPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("sms") == PermissionState.GRANTED);
        call.resolve(result);
    }

    /**
     * Đọc SMS inbox.
     * @param since (long, optional): chỉ lấy SMS sau timestamp này (ms epoch)
     * @param limit (int, optional, default 500): số SMS tối đa
     * Trả về: { messages: [{ id, address, body, date }] }
     */
    @PluginMethod
    public void readInbox(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_SMS)
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("READ_SMS permission chưa được cấp");
            return;
        }

        long since = call.getLong("since", 0L);
        int limit = call.getInt("limit", 500);
        if (limit > 2000) limit = 2000; // cap an toàn

        JSArray messages = new JSArray();
        Cursor cursor = null;
        try {
            String selection = since > 0 ? "date > ?" : null;
            String[] selectionArgs = since > 0 ? new String[]{ String.valueOf(since) } : null;
            cursor = getContext().getContentResolver().query(
                Uri.parse("content://sms/inbox"),
                new String[]{ "_id", "address", "body", "date" },
                selection,
                selectionArgs,
                "date DESC LIMIT " + limit
            );
            if (cursor != null) {
                int idIdx = cursor.getColumnIndex("_id");
                int addrIdx = cursor.getColumnIndex("address");
                int bodyIdx = cursor.getColumnIndex("body");
                int dateIdx = cursor.getColumnIndex("date");
                while (cursor.moveToNext()) {
                    JSObject msg = new JSObject();
                    msg.put("id", cursor.getLong(idIdx));
                    msg.put("address", cursor.getString(addrIdx));
                    msg.put("body", cursor.getString(bodyIdx));
                    msg.put("date", cursor.getLong(dateIdx));
                    messages.put(msg);
                }
            }

            JSObject result = new JSObject();
            result.put("messages", messages);
            result.put("count", messages.length());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Lỗi đọc SMS: " + e.getMessage(), e);
        } finally {
            if (cursor != null) cursor.close();
        }
    }
}
