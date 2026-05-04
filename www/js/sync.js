// Đồng bộ dữ liệu lên Google Drive (appDataFolder - chỉ app này thấy được)
// File JSON duy nhất tên QLT_CONFIG.DRIVE_FILENAME

(function () {
  const Sync = {
    fileId: null,

    async findFile() {
      const token = await window.QLT_Auth.ensureToken();
      const cfg = window.QLT_CONFIG;
      const q = encodeURIComponent(`name='${cfg.DRIVE_FILENAME}' and trashed=false`);
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`,
        { headers: { Authorization: 'Bearer ' + token } }
      );
      if (!r.ok) throw new Error('Drive list lỗi: ' + r.status);
      const data = await r.json();
      if (data.files && data.files.length > 0) {
        this.fileId = data.files[0].id;
        return { id: this.fileId, modifiedTime: data.files[0].modifiedTime };
      }
      return null;
    },

    async download() {
      if (!this.fileId) {
        const f = await this.findFile();
        if (!f) return null;
      }
      const token = await window.QLT_Auth.ensureToken();
      const r = await fetch(
        `https://www.googleapis.com/drive/v3/files/${this.fileId}?alt=media`,
        { headers: { Authorization: 'Bearer ' + token } }
      );
      if (!r.ok) throw new Error('Drive download lỗi: ' + r.status);
      return await r.json();
    },

    async upload(data) {
      const token = await window.QLT_Auth.ensureToken();
      const cfg = window.QLT_CONFIG;
      const meta = {
        name: cfg.DRIVE_FILENAME,
        mimeType: 'application/json',
        parents: this.fileId ? undefined : ['appDataFolder']
      };
      const boundary = 'qlt_' + Date.now();
      const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(meta) + '\r\n' +
        `--${boundary}\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        JSON.stringify(data) + '\r\n' +
        `--${boundary}--`;

      const url = this.fileId
        ? `https://www.googleapis.com/upload/drive/v3/files/${this.fileId}?uploadType=multipart`
        : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
      const method = this.fileId ? 'PATCH' : 'POST';

      const r = await fetch(url, {
        method,
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body
      });
      if (!r.ok) throw new Error('Drive upload lỗi: ' + r.status);
      const res = await r.json();
      this.fileId = res.id;
      return res;
    },

    async pushNow() {
      const data = await window.QLT_Store.exportAll();
      await this.findFile();
      await this.upload(data);
      await window.QLT_Store.setMeta('lastSync', Date.now());
      return Date.now();
    },

    async pullNow() {
      const f = await this.findFile();
      if (!f) return null;
      const data = await this.download();
      if (data) {
        await window.QLT_Store.importAll(data, 'replace');
        await window.QLT_Store.setMeta('lastSync', Date.now());
      }
      return Date.now();
    },

    // Đồng bộ thông minh: chọn bản mới hơn
    async smartSync() {
      const f = await this.findFile();
      const localTime = await window.QLT_Store.getMeta('lastSync') || 0;
      if (!f) {
        // Lần đầu: push lên
        return await this.pushNow();
      }
      const remoteTime = new Date(f.modifiedTime).getTime();
      if (remoteTime > localTime + 5000) {
        // Remote mới hơn → pull
        return await this.pullNow();
      } else {
        // Local mới hơn hoặc bằng → push
        return await this.pushNow();
      }
    }
  };

  window.QLT_Sync = Sync;
})();
