package com.thanh.quanlytien;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * Home screen widget — tap để mở app + deep link tới chat AI
 * Deep link: qltien://ai-chat
 *
 * Note: package phải đúng với package của app (com.thanh.quanlytien).
 * MainActivity sẽ nhận intent qua deeplink + mở chat overlay.
 */
public class AiChatWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId);
        }
    }

    static void updateAppWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.ai_chat_widget);

        // Deep link: qltien://ai-chat — Capacitor app sẽ nhận qua appUrlOpen listener
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setData(Uri.parse("qltien://ai-chat"));
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pendingIntent = PendingIntent.getActivity(context, appWidgetId, intent, flags);

        views.setOnClickPendingIntent(R.id.ai_widget_root, pendingIntent);
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }
}
