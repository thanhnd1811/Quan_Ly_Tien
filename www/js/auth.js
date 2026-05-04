// Đăng nhập Google qua Google Identity Services (token model)
// Hoạt động trong PWA và WebView Capacitor (cần thêm origin trong Google Console)

(function () {
  const Auth = {
    user: null,         // { email, name, picture, sub }
    accessToken: null,  // OAuth token cho Drive API
    tokenExpiry: 0,
    tokenClient: null,
    listeners: [],

    onChange(fn) { this.listeners.push(fn); },
    _emit() { this.listeners.forEach(f => f(this.user)); },

    async init() {
      const cfg = window.QLT_CONFIG;
      if (!cfg || !cfg.GOOGLE_CLIENT_ID) {
        console.warn('Chưa cấu hình GOOGLE_CLIENT_ID — chế độ ngoại tuyến');
        this.loadCached();
        return;
      }
      await this.loadGsi();
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: cfg.GOOGLE_CLIENT_ID,
        scope: cfg.DRIVE_SCOPE,
        callback: () => {}
      });
      this.loadCached();
    },

    loadGsi() {
      return new Promise((resolve, reject) => {
        if (window.google && google.accounts) return resolve();
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true; s.defer = true;
        s.onload = () => resolve();
        s.onerror = reject;
        document.head.appendChild(s);
      });
    },

    loadCached() {
      try {
        const u = JSON.parse(localStorage.getItem('qlt_auth_user') || 'null');
        const t = localStorage.getItem('qlt_auth_token');
        const e = parseInt(localStorage.getItem('qlt_auth_exp') || '0', 10);
        if (u) {
          this.user = u;
          if (t && Date.now() < e) {
            this.accessToken = t;
            this.tokenExpiry = e;
          }
          this._emit();
        }
      } catch (_) {}
    },

    saveCached() {
      if (this.user) localStorage.setItem('qlt_auth_user', JSON.stringify(this.user));
      else localStorage.removeItem('qlt_auth_user');
      if (this.accessToken) {
        localStorage.setItem('qlt_auth_token', this.accessToken);
        localStorage.setItem('qlt_auth_exp', String(this.tokenExpiry));
      } else {
        localStorage.removeItem('qlt_auth_token');
        localStorage.removeItem('qlt_auth_exp');
      }
    },

    isLoggedIn() {
      return !!this.user;
    },

    async signIn() {
      const cfg = window.QLT_CONFIG;
      if (!cfg.GOOGLE_CLIENT_ID) {
        throw new Error('Chưa cấu hình GOOGLE_CLIENT_ID trong www/js/config.js');
      }
      if (!this.tokenClient) await this.init();

      const token = await new Promise((resolve, reject) => {
        this.tokenClient.callback = (resp) => {
          if (resp.error) reject(new Error(resp.error));
          else resolve(resp);
        };
        this.tokenClient.requestAccessToken({ prompt: 'consent' });
      });

      this.accessToken = token.access_token;
      this.tokenExpiry = Date.now() + (token.expires_in - 60) * 1000;

      // Lấy thông tin user
      const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: 'Bearer ' + this.accessToken }
      });
      if (!r.ok) throw new Error('Không lấy được thông tin user');
      const profile = await r.json();
      this.user = {
        sub: profile.sub,
        email: profile.email,
        name: profile.name,
        picture: profile.picture
      };
      this.saveCached();
      this._emit();
      return this.user;
    },

    async ensureToken() {
      if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;
      if (!this.tokenClient) await this.init();
      const token = await new Promise((resolve, reject) => {
        this.tokenClient.callback = (resp) => {
          if (resp.error) reject(new Error(resp.error));
          else resolve(resp);
        };
        this.tokenClient.requestAccessToken({ prompt: '' });
      });
      this.accessToken = token.access_token;
      this.tokenExpiry = Date.now() + (token.expires_in - 60) * 1000;
      this.saveCached();
      return this.accessToken;
    },

    signOut() {
      if (this.accessToken && window.google) {
        try { google.accounts.oauth2.revoke(this.accessToken, () => {}); } catch (_) {}
      }
      this.user = null;
      this.accessToken = null;
      this.tokenExpiry = 0;
      this.saveCached();
      this._emit();
    }
  };

  window.QLT_Auth = Auth;
})();
