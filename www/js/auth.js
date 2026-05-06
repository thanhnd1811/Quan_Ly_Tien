// Đăng nhập Google
// - Trên APK Android (Capacitor): dùng plugin native @codetrix-studio/capacitor-google-auth
// - Trên web/PWA: dùng Google Identity Services (GSI) load từ accounts.google.com/gsi/client

(function () {
  const isNative = !!(window.Capacitor && (window.Capacitor.isNativePlatform?.() || window.Capacitor.isNative));

  const Auth = {
    user: null,         // { email, name, picture, sub }
    accessToken: null,  // OAuth token cho Drive API
    tokenExpiry: 0,
    tokenClient: null,  // chỉ dùng cho web GSI
    listeners: [],

    onChange(fn) { this.listeners.push(fn); },
    _emit() { this.listeners.forEach(f => f(this.user)); },

    async init() {
      this.loadCached();

      const cfg = window.QLT_CONFIG;
      if (!cfg || !cfg.GOOGLE_CLIENT_ID) {
        console.warn('Chưa cấu hình GOOGLE_CLIENT_ID — chế độ ngoại tuyến');
        return;
      }

      if (isNative) {
        // Native: plugin tự đọc cấu hình từ capacitor.config.json (plugins.GoogleAuth)
        // initialize() là tuỳ chọn — gọi cho chắc, lỗi cũng không chặn app
        try {
          const GoogleAuth = window.Capacitor.Plugins.GoogleAuth;
          if (GoogleAuth && GoogleAuth.initialize) {
            await GoogleAuth.initialize({
              clientId: cfg.GOOGLE_CLIENT_ID,
              scopes: cfg.DRIVE_SCOPE.split(' '),
              grantOfflineAccess: true
            });
          }
        } catch (e) {
          console.warn('Khởi tạo GoogleAuth native lỗi:', e);
        }
        return;
      }

      // Web: tải GSI script trong nền — không await để không chặn init khi offline
      this.loadGsi().then(() => {
        try {
          this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: cfg.GOOGLE_CLIENT_ID,
            scope: cfg.DRIVE_SCOPE,
            callback: () => {}
          });
        } catch (e) {
          console.warn('Khởi tạo Google Sign-In lỗi:', e);
        }
      }).catch(e => {
        console.warn('Không tải được Google Sign-In (offline?) — app vẫn dùng được, chỉ chưa đồng bộ:', e);
      });
    },

    async ensureGsi() {
      const cfg = window.QLT_CONFIG;
      if (!cfg || !cfg.GOOGLE_CLIENT_ID) throw new Error('Chưa cấu hình GOOGLE_CLIENT_ID trong www/js/config.js');
      await this.loadGsi();
      if (!this.tokenClient) {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: cfg.GOOGLE_CLIENT_ID,
          scope: cfg.DRIVE_SCOPE,
          callback: () => {}
        });
      }
    },

    loadGsi() {
      return new Promise((resolve, reject) => {
        if (window.google && google.accounts) return resolve();
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true; s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Không tải được Google Sign-In script'));
        document.head.appendChild(s);
        setTimeout(() => reject(new Error('Hết thời gian tải Google Sign-In')), 10000);
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
      if (isNative) return this._signInNative();
      return this._signInWeb();
    },

    async _signInNative() {
      const GoogleAuth = window.Capacitor.Plugins.GoogleAuth;
      if (!GoogleAuth) throw new Error('Plugin GoogleAuth chưa cài đặt trong APK');

      const result = await GoogleAuth.signIn();
      // result: { id, email, name, imageUrl, authentication: { accessToken, idToken, refreshToken? } }
      this.user = {
        sub: result.id,
        email: result.email,
        name: result.name || result.givenName || result.email,
        picture: result.imageUrl
      };
      this.accessToken = result.authentication?.accessToken || null;
      // Token Google Android thường sống 1 giờ — trừ 60s an toàn
      this.tokenExpiry = Date.now() + (3600 - 60) * 1000;
      this.saveCached();
      this._emit();
      return this.user;
    },

    async _signInWeb() {
      await this.ensureGsi();

      const token = await new Promise((resolve, reject) => {
        this.tokenClient.callback = (resp) => {
          if (resp.error) reject(new Error(resp.error));
          else resolve(resp);
        };
        this.tokenClient.requestAccessToken({ prompt: 'consent' });
      });

      this.accessToken = token.access_token;
      this.tokenExpiry = Date.now() + (token.expires_in - 60) * 1000;

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

    // Xoá token cache để buộc lấy lại lần sau (dùng khi gặp 401 từ Drive)
    invalidateToken() {
      this.accessToken = null;
      this.tokenExpiry = 0;
      this.saveCached();
    },

    async ensureToken() {
      if (this.accessToken && Date.now() < this.tokenExpiry) return this.accessToken;

      if (isNative) {
        const GoogleAuth = window.Capacitor.Plugins.GoogleAuth;
        if (!GoogleAuth) throw new Error('Plugin GoogleAuth chưa cài');
        try {
          const r = await GoogleAuth.refresh();
          this.accessToken = r.accessToken;
          this.tokenExpiry = Date.now() + (3600 - 60) * 1000;
          this.saveCached();
          return this.accessToken;
        } catch (_) {
          // refresh fail → đăng nhập lại
          await this._signInNative();
          return this.accessToken;
        }
      }

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

    async signOut() {
      if (isNative) {
        try {
          const GoogleAuth = window.Capacitor.Plugins.GoogleAuth;
          if (GoogleAuth) await GoogleAuth.signOut();
        } catch (_) {}
      } else if (this.accessToken && window.google) {
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
