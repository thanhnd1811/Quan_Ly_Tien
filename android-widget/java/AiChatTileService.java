package com.thanh.quanlytien;

import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
import androidx.annotation.RequiresApi;

/**
 * Quick Settings Tile — Trợ lý AI Quản Lý Tiền
 *
 * Hiển thị trong Quick Settings panel (vuốt xuống từ status bar).
 * Hoạt động cả trên lock screen — system tự xử lý unlock challenge.
 *
 * Tap tile → fire deep link qltien://ai-chat → MainActivity mở chat overlay.
 *
 * Min API 24 (Android 7.0 Nougat) — Capacitor 6 mặc định minSdk 22, nhưng
 * TileService chỉ active từ API 24+; thiết bị cũ hơn sẽ không thấy tile (OK).
 */
@RequiresApi(api = Build.VERSION_CODES.N)
public class AiChatTileService extends TileService {

    /**
     * Gọi khi user mở Quick Settings panel — cập nhật state tile (luôn INACTIVE
     * vì đây là tile "trigger action", không phải toggle on/off).
     */
    @Override
    public void onStartListening() {
        super.onStartListening();
        Tile tile = getQsTile();
        if (tile != null) {
            tile.setState(Tile.STATE_INACTIVE);
            tile.setLabel("Trợ lý AI");
            tile.setContentDescription("Mở chat AI Quản Lý Tiền");
            tile.updateTile();
        }
    }

    /**
     * Gọi khi user tap vào tile.
     * - Nếu đang lock → system tự yêu cầu PIN/vân tay rồi mới fire intent
     * - Nếu đang unlock → mở activity ngay, đóng QS panel
     */
    @Override
    public void onClick() {
        super.onClick();

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setData(Uri.parse("qltien://ai-chat"));
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        // Android 14+ (API 34): startActivityAndCollapse(Intent) bị deprecate,
        // phải dùng PendingIntent. Trước đó: nhận Intent trực tiếp.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pi = PendingIntent.getActivity(this, 0, intent, flags);
            startActivityAndCollapse(pi);
        } else {
            // API 24-33: dùng Intent (deprecated từ 34 nhưng vẫn chạy ở range này)
            startActivityAndCollapse(intent);
        }
    }
}
