// In-app update check — fetch GitHub Releases latest, so sánh version,
// hiện banner trên Trang chủ nếu có bản mới.
//
// Workflow:
//   1. App khởi động → window.QLT_BUILD = { version, tag, ... } (từ app-version.js)
//   2. Fetch https://api.github.com/repos/{owner}/{repo}/releases/latest
//   3. So sánh tag — nếu khác và remote mới hơn → set state có update
//   4. UI: banner trên Home + nút trong Settings

(function () {
  'use strict';

  const REPO = 'thanhnd1811/Quan_Ly_Tien';
  const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
  const RELEASES_PAGE = `https://github.com/${REPO}/releases`;
  const CHECK_INTERVAL_MS = 6 * 3600 * 1000; // 6 tiếng — không spam GitHub API
  const CACHE_KEY = 'qlt_update_cache';
  const DISMISS_KEY = 'qlt_update_dismissed';

  // Parse build version "bN.sha7" → integer N để so sánh
  function parseCommitCount(v) {
    if (!v || typeof v !== 'string') return 0;
    const m = v.match(/^b?(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  // Lấy info update từ GitHub releases (có cache 6h)
  async function fetchLatestRelease(force = false) {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      const now = Date.now();
      if (!force && cached && cached.fetchedAt && (now - cached.fetchedAt) < CHECK_INTERVAL_MS) {
        return cached.data;
      }
      const r = await fetch(RELEASES_API, {
        headers: { 'Accept': 'application/vnd.github+json' }
      });
      if (!r.ok) {
        console.warn('[update-check] GitHub API:', r.status);
        return cached?.data || null;
      }
      const data = await r.json();
      // Lọc data cần thiết (giảm size cache)
      const slim = {
        tag: data.tag_name,
        name: data.name,
        body: data.body,
        publishedAt: data.published_at,
        htmlUrl: data.html_url,
        apk: (data.assets || []).find(a => a.name?.endsWith('.apk')),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: now, data: slim }));
      return slim;
    } catch (e) {
      console.warn('[update-check] fetch error:', e);
      return null;
    }
  }

  // Public API
  window.QLT_Update = {
    // Trả về { hasUpdate, current, latest, dismissed } hoặc null nếu lỗi/dev
    async check(force = false) {
      const current = window.QLT_BUILD || {};
      // Skip dev build (local)
      if (!current.version || current.version === 'dev') {
        return { hasUpdate: false, current, latest: null, reason: 'dev-build' };
      }
      const latest = await fetchLatestRelease(force);
      if (!latest) return { hasUpdate: false, current, latest: null, reason: 'fetch-failed' };

      const curCount = parseCommitCount(current.version);
      const latestCount = parseCommitCount(latest.tag?.replace(/^v/, ''));
      const hasUpdate = latestCount > curCount;

      const dismissedTag = localStorage.getItem(DISMISS_KEY);
      const dismissed = dismissedTag === latest.tag;

      return {
        hasUpdate,
        dismissed,
        current,
        latest,
        apkUrl: latest.apk?.browser_download_url || latest.htmlUrl,
        releaseUrl: latest.htmlUrl
      };
    },

    // User bấm "Đóng" trên banner → ẩn cho version đó (không hiện lại đến khi có version mới hơn)
    dismiss(tag) {
      if (tag) localStorage.setItem(DISMISS_KEY, tag);
    },

    // Reset cache + dismiss → check lại từ đầu
    reset() {
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(DISMISS_KEY);
    },

    REPO,
    RELEASES_PAGE,
    RELEASES_API
  };
})();
