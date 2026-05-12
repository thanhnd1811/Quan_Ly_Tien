package com.thanh.quanlytien;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * Home screen widget — hiển thị tổng số dư + 2 nút quick add (+Chi / +Thu).
 *
 * - Đọc balance từ Capacitor Preferences (file "CapacitorStorage").
 *   JS app phải write key "qlt_widget_balance" (chuỗi đã format) khi state change.
 * - Tap nút +Chi  → deeplink qltien://add?type=expense
 * - Tap nút +Thu  → deeplink qltien://add?type=income
 * - Tap khu balance → deeplink qltien://home (mở app trang chủ)
 *
 * Update cycle: 30 phút auto (Android tối thiểu), HOẶC khi JS broadcast manual.
 */
public class BalanceWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_FILE = "CapacitorStorage";
    private static final String KEY_BALANCE = "qlt_widget_balance";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.balance_widget);

        // Đọc balance từ Capacitor Preferences
        SharedPreferences prefs = context.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE);
        String balance = prefs.getString(KEY_BALANCE, "•••••• đ");
        views.setTextViewText(R.id.balance_widget_amt, balance);

        // Click khu balance → mở app home
        Intent homeIntent = new Intent(Intent.ACTION_VIEW);
        homeIntent.setData(Uri.parse("qltien://home"));
        homeIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent homePi = PendingIntent.getActivity(context, appWidgetId * 10, homeIntent, flags);
        views.setOnClickPendingIntent(R.id.balance_widget_amt_wrap, homePi);

        // Click +Chi → deeplink add expense
        Intent expIntent = new Intent(Intent.ACTION_VIEW);
        expIntent.setData(Uri.parse("qltien://add?type=expense"));
        expIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent expPi = PendingIntent.getActivity(context, appWidgetId * 10 + 1, expIntent, flags);
        views.setOnClickPendingIntent(R.id.balance_widget_btn_exp, expPi);

        // Click +Thu → deeplink add income
        Intent incIntent = new Intent(Intent.ACTION_VIEW);
        incIntent.setData(Uri.parse("qltien://add?type=income"));
        incIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent incPi = PendingIntent.getActivity(context, appWidgetId * 10 + 2, incIntent, flags);
        views.setOnClickPendingIntent(R.id.balance_widget_btn_inc, incPi);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
