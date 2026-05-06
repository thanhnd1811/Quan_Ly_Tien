// Lock screen — bảo mật app bằng PIN (4-6 chữ số) + sinh trắc nếu có
// State lưu trong storage 'meta':
//   appLockEnabled (bool), appPinHash (hex), appPinSalt (hex),
//   appPinLength (4|6), appLockTimeout (giây), appBiometric (bool)
// Hash: SHA-256 (salt + ':' + pin)

(function () {
  // ============ Hash ============
  async function sha256Hex(text) {
    const data = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function randomHex(len = 16) {
    const a = new Uint8Array(len);
    crypto.getRandomValues(a);
    return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function hashPin(pin, salt) {
    return sha256Hex(salt + ':' + pin);
  }

  // ============ Plugin biometric (@aparajita/capacitor-biometric-auth v8 — Cap 6) ============
  function getBio() {
    return window.Capacitor?.Plugins?.BiometricAuth || null;
  }

  async function bioAvailable() {
    const B = getBio();
    if (!B) return { available: false, type: null };
    try {
      const r = await B.checkBiometry();
      return { available: !!r.isAvailable, type: r.biometryType || 'unknown' };
    } catch (_) {
      return { available: false, type: null };
    }
  }

  async function bioAuthenticate() {
    const B = getBio();
    if (!B) throw new Error('NO_PLUGIN');
    await B.authenticate({
      reason: 'Mở khoá Quản Lý Tiền',
      cancelTitle: 'Huỷ',
      androidTitle: 'Quản Lý Tiền',
      androidSubtitle: 'Xác thực để mở khoá',
      androidConfirmationRequired: false,
      allowDeviceCredential: false
    });
  }

  // ============ Storage helpers ============
  // Quan trọng: PIN/sinh trắc lưu DEVICE-WIDE (localStorage), KHÔNG theo user/sổ.
  // Lý do: khoá là khoá thiết bị — đăng xuất / chuyển user vẫn phải nhập PIN.
  const LS = {
    enabled:      'qlt_lock_enabled',
    pinHash:      'qlt_lock_pin_hash',
    pinSalt:      'qlt_lock_pin_salt',
    pinLength:    'qlt_lock_pin_length',
    biometric:    'qlt_lock_biometric',
    timeout:      'qlt_lock_timeout',
    lastUnlocked: 'qlt_lock_last_unlocked'
  };
  function lsGet(key, def = null) {
    const v = localStorage.getItem(key);
    return (v === null || v === undefined) ? def : v;
  }
  function lsSet(key, value) {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, String(value));
  }
  function lsGetBool(key, def = false) {
    const v = lsGet(key);
    if (v === null) return def;
    return v === 'true' || v === '1';
  }
  function lsGetInt(key, def = 0) {
    const v = lsGet(key);
    if (v === null) return def;
    const n = parseInt(v, 10);
    return isFinite(n) ? n : def;
  }

  // Migration 1 lần: nếu data cũ nằm trong meta IndexedDB (user-scoped) → copy sang localStorage
  async function migrateFromMetaIfNeeded() {
    if (lsGet(LS.enabled) !== null) return; // Đã migrate hoặc dùng localStorage rồi
    try {
      const oldEnabled = await window.QLT_Store.getMeta('appLockEnabled');
      if (!oldEnabled) return;
      const oldHash = await window.QLT_Store.getMeta('appPinHash');
      const oldSalt = await window.QLT_Store.getMeta('appPinSalt');
      const oldLen  = await window.QLT_Store.getMeta('appPinLength');
      const oldBio  = await window.QLT_Store.getMeta('appBiometric');
      const oldTo   = await window.QLT_Store.getMeta('appLockTimeout');
      if (oldHash && oldSalt) {
        lsSet(LS.enabled,   'true');
        lsSet(LS.pinHash,   oldHash);
        lsSet(LS.pinSalt,   oldSalt);
        lsSet(LS.pinLength, oldLen || 4);
        lsSet(LS.biometric, oldBio ? 'true' : 'false');
        lsSet(LS.timeout,   oldTo != null ? oldTo : 300);
        // Xoá data cũ trong meta (user hiện tại) — không cần lưu nữa
        await window.QLT_Store.setMeta('appLockEnabled', false);
        await window.QLT_Store.setMeta('appPinHash', null);
        await window.QLT_Store.setMeta('appPinSalt', null);
      }
    } catch (_) { /* lần đầu hoặc lỗi đọc meta — bỏ qua */ }
  }

  // ============ Lock module ============
  const Lock = {
    // Trạng thái runtime
    _open: false,
    _pinBuf: '',
    _pinLength: 4,
    _onSuccess: null,
    _mode: 'verify', // 'verify' | 'setup-1' | 'setup-2' | 'change-old' | 'change-new1' | 'change-new2'
    _setupTempHash: null, // hash bước 1 lúc setup/đổi PIN
    _setupTempSalt: null,
    _failCount: 0,

    // Một lần duy nhất khi app khởi động: di trú PIN cũ từ meta IndexedDB
    async migrate() {
      await migrateFromMetaIfNeeded();
    },

    isEnabled() {
      return lsGetBool(LS.enabled, false);
    },

    async hasBiometric() {
      if (!lsGetBool(LS.biometric, false)) return false;
      const { available } = await bioAvailable();
      return available;
    },

    getTimeoutSeconds() {
      return lsGetInt(LS.timeout, 300);
    },

    // Có cần khoá khi resume từ background không?
    shouldLockOnResume() {
      if (!this.isEnabled()) return false;
      const timeout = this.getTimeoutSeconds();
      if (timeout === 0) return true; // Khoá ngay khi đóng
      const last = lsGetInt(LS.lastUnlocked, 0);
      const elapsed = (Date.now() - last) / 1000;
      return elapsed >= timeout;
    },

    markUnlocked() {
      lsSet(LS.lastUnlocked, Date.now());
    },

    // ====== UI ======
    _el(id) { return document.getElementById(id); },

    _updateDots() {
      const dots = this._el('lockDots').querySelectorAll('.lock-dot');
      // Hiện đúng số dot theo pinLength
      for (let i = 0; i < dots.length; i++) {
        if (i < this._pinLength) dots[i].style.display = 'block';
        else dots[i].style.display = 'none';
        dots[i].classList.toggle('filled', i < this._pinBuf.length);
      }
    },

    _shake() {
      const dotsEl = this._el('lockDots');
      dotsEl.classList.add('shake');
      setTimeout(() => dotsEl.classList.remove('shake'), 400);
      try { navigator.vibrate?.(200); } catch (_) {}
    },

    _setError(msg) {
      this._el('lockError').textContent = msg || '';
    },

    _setPrompt(msg) {
      this._el('lockPrompt').textContent = msg || '';
    },

    _resetBuf() {
      this._pinBuf = '';
      this._updateDots();
    },

    async _onPinComplete() {
      const pin = this._pinBuf;

      if (this._mode === 'verify') {
        const salt = lsGet(LS.pinSalt);
        const stored = lsGet(LS.pinHash);
        const h = await hashPin(pin, salt);
        if (h === stored) {
          this._failCount = 0;
          this.markUnlocked();
          this.hide();
          if (this._onSuccess) { const cb = this._onSuccess; this._onSuccess = null; cb(); }
        } else {
          this._failCount++;
          this._shake();
          this._setError(`PIN sai (${this._failCount} lần). Thử lại.`);
          this._resetBuf();
        }
        return;
      }

      if (this._mode === 'setup-1') {
        // Lần đầu nhập PIN — lưu tạm hash để đối chiếu
        const salt = randomHex(16);
        this._setupTempSalt = salt;
        this._setupTempHash = await hashPin(pin, salt);
        this._mode = 'setup-2';
        this._setPrompt('Nhập lại PIN để xác nhận');
        this._setError('');
        this._resetBuf();
        return;
      }

      if (this._mode === 'setup-2') {
        const h = await hashPin(pin, this._setupTempSalt);
        if (h === this._setupTempHash) {
          lsSet(LS.pinSalt, this._setupTempSalt);
          lsSet(LS.pinHash, this._setupTempHash);
          lsSet(LS.pinLength, this._pinLength);
          lsSet(LS.enabled, 'true');
          // Lần đầu setup → mặc định timeout 5 phút (300s) để tránh nhập PIN quá thường xuyên
          if (lsGet(LS.timeout) === null) lsSet(LS.timeout, 300);
          this.markUnlocked();
          this._setupTempHash = null;
          this._setupTempSalt = null;
          this.hide();
          window.QLT_UI?.toast?.('Đã bật khoá PIN', { type: 'success' });
          if (this._onSuccess) { const cb = this._onSuccess; this._onSuccess = null; cb(); }
        } else {
          this._shake();
          this._mode = 'setup-1';
          this._setPrompt('Đặt PIN mới (' + this._pinLength + ' chữ số)');
          this._setError('PIN không khớp. Nhập lại từ đầu.');
          this._resetBuf();
        }
        return;
      }

      if (this._mode === 'change-old') {
        const salt = lsGet(LS.pinSalt);
        const stored = lsGet(LS.pinHash);
        const h = await hashPin(pin, salt);
        if (h === stored) {
          this._mode = 'change-new1';
          this._setPrompt('Đặt PIN mới (' + this._pinLength + ' chữ số)');
          this._setError('');
          this._resetBuf();
        } else {
          this._shake();
          this._setError('PIN cũ sai.');
          this._resetBuf();
        }
        return;
      }

      if (this._mode === 'change-new1') {
        const salt = randomHex(16);
        this._setupTempSalt = salt;
        this._setupTempHash = await hashPin(pin, salt);
        this._mode = 'change-new2';
        this._setPrompt('Nhập lại PIN mới');
        this._setError('');
        this._resetBuf();
        return;
      }

      if (this._mode === 'change-new2') {
        const h = await hashPin(pin, this._setupTempSalt);
        if (h === this._setupTempHash) {
          lsSet(LS.pinSalt, this._setupTempSalt);
          lsSet(LS.pinHash, this._setupTempHash);
          lsSet(LS.pinLength, this._pinLength);
          this.markUnlocked();
          this._setupTempHash = null;
          this._setupTempSalt = null;
          this.hide();
          window.QLT_UI?.toast?.('Đã đổi PIN', { type: 'success' });
          if (this._onSuccess) { const cb = this._onSuccess; this._onSuccess = null; cb(); }
        } else {
          this._shake();
          this._mode = 'change-new1';
          this._setPrompt('Đặt PIN mới (' + this._pinLength + ' chữ số)');
          this._setError('PIN không khớp. Nhập lại.');
          this._resetBuf();
        }
        return;
      }
    },

    _bindKeypad() {
      if (this._keypadBound) return;
      this._keypadBound = true;
      this._el('lockScreen').querySelectorAll('.lock-key[data-k]').forEach(el => {
        el.addEventListener('click', () => {
          const k = el.dataset.k;
          if (k === 'back') {
            this._pinBuf = this._pinBuf.slice(0, -1);
            this._updateDots();
            this._setError('');
            return;
          }
          if (this._pinBuf.length >= this._pinLength) return;
          this._pinBuf += k;
          this._updateDots();
          this._setError('');
          if (this._pinBuf.length === this._pinLength) {
            // Tự kiểm tra sau 1 nhịp ngắn cho user thấy dot cuối filled
            setTimeout(() => this._onPinComplete(), 80);
          }
        });
      });
      // Bàn phím vật lý (PWA / browser)
      document.addEventListener('keydown', (e) => {
        if (!this._open) return;
        if (/^[0-9]$/.test(e.key)) {
          if (this._pinBuf.length < this._pinLength) {
            this._pinBuf += e.key;
            this._updateDots();
            this._setError('');
            if (this._pinBuf.length === this._pinLength) {
              setTimeout(() => this._onPinComplete(), 80);
            }
          }
        } else if (e.key === 'Backspace') {
          this._pinBuf = this._pinBuf.slice(0, -1);
          this._updateDots();
        }
      });

      // Nút sinh trắc
      this._el('lockBioBtn').addEventListener('click', () => this._tryBio());

      // Nút "Quên PIN" — mở khoá qua Google Sign-In
      const forgotBtn = this._el('lockForgotBtn');
      if (forgotBtn) forgotBtn.addEventListener('click', () => this._tryForgot());
    },

    // Recovery: yêu cầu user đăng nhập Google (qua QLT_Auth). Nếu thành công →
    // mở khoá đồng thời TẮT PIN và xoá hash → user bắt buộc đặt PIN mới trong
    // Cài đặt nếu muốn dùng tiếp. Đây là tradeoff hợp lý: chỉ chủ tài khoản
    // Google đã từng đăng nhập trên thiết bị này mới recover được.
    async _tryForgot() {
      if (this._mode !== 'verify') return;
      if (!window.QLT_Auth) {
        this._setError('Tính năng đăng nhập chưa sẵn sàng');
        return;
      }
      try {
        this._setError('Đang xác minh Google...');
        const user = await window.QLT_Auth.signIn();
        if (!user) {
          this._setError('Đăng nhập huỷ bỏ');
          return;
        }
        // Thành công → tắt PIN, mở khoá
        lsSet(LS.enabled, null);
        lsSet(LS.pinHash, null);
        lsSet(LS.pinSalt, null);
        lsSet(LS.biometric, null);
        this._failCount = 0;
        this.markUnlocked();
        this.hide();
        window.QLT_UI?.toast?.('Đã mở khoá. PIN cũ bị xoá — vào Cài đặt để đặt PIN mới.', { type: 'success', duration: 4000 });
        if (this._onSuccess) { const cb = this._onSuccess; this._onSuccess = null; cb(); }
      } catch (e) {
        console.warn('Forgot PIN flow lỗi:', e);
        this._setError('Không xác minh được Google: ' + (e?.message || 'thử lại'));
      }
    },

    async _tryBio() {
      if (this._mode !== 'verify') return;
      try {
        await bioAuthenticate();
        this._failCount = 0;
        this.markUnlocked();
        this.hide();
        if (this._onSuccess) { const cb = this._onSuccess; this._onSuccess = null; cb(); }
      } catch (e) {
        // User huỷ hoặc fail — không log error, để PIN
        this._setError('Sinh trắc thất bại — dùng PIN');
      }
    },

    // ============ Public API ============
    // Hiện màn khoá để VERIFY PIN. onSuccess gọi sau khi đúng PIN.
    async showVerify(onSuccess) {
      const pinLen = lsGetInt(LS.pinLength, 4) || 4;
      this._pinLength = pinLen;
      this._mode = 'verify';
      this._pinBuf = '';
      this._failCount = 0;
      this._onSuccess = onSuccess || null;
      this._setPrompt('Nhập PIN để mở khoá');
      this._setError('');
      this._updateDots();
      this._bindKeypad();
      // Nút bio
      const bioBtn = this._el('lockBioBtn');
      const bioOn = await this.hasBiometric();
      bioBtn.style.display = bioOn ? 'flex' : 'none';
      // Nút quên PIN (chỉ verify mode)
      const forgotBtn = this._el('lockForgotBtn');
      if (forgotBtn) forgotBtn.style.display = 'inline-block';
      // Foot tip
      this._el('lockFoot').style.display = 'block';

      this._open = true;
      this._el('lockScreen').classList.add('open');

      // Tự động prompt sinh trắc nếu enabled
      if (bioOn) {
        // Delay nhỏ để màn xuất hiện trước
        setTimeout(() => this._tryBio(), 300);
      }
    },

    // Setup PIN lần đầu
    async showSetup(onSuccess, pinLength = 4) {
      this._pinLength = pinLength;
      this._mode = 'setup-1';
      this._pinBuf = '';
      this._setupTempHash = null;
      this._setupTempSalt = null;
      this._onSuccess = onSuccess || null;
      this._setPrompt('Đặt PIN mới (' + pinLength + ' chữ số)');
      this._setError('');
      this._updateDots();
      this._bindKeypad();
      this._el('lockBioBtn').style.display = 'none';
      this._el('lockFoot').style.display = 'none';
      const _forgotBtn = this._el('lockForgotBtn');
      if (_forgotBtn) _forgotBtn.style.display = 'none';
      this._open = true;
      this._el('lockScreen').classList.add('open');
    },

    // Đổi PIN (cần xác nhận PIN cũ trước)
    async showChange(onSuccess) {
      const pinLen = lsGetInt(LS.pinLength, 4) || 4;
      this._pinLength = pinLen;
      this._mode = 'change-old';
      this._pinBuf = '';
      this._setupTempHash = null;
      this._setupTempSalt = null;
      this._onSuccess = onSuccess || null;
      this._setPrompt('Nhập PIN cũ');
      this._setError('');
      this._updateDots();
      this._bindKeypad();
      this._el('lockBioBtn').style.display = 'none';
      this._el('lockFoot').style.display = 'none';
      const _forgotBtn = this._el('lockForgotBtn');
      if (_forgotBtn) _forgotBtn.style.display = 'none';
      this._open = true;
      this._el('lockScreen').classList.add('open');
    },

    // Tắt khoá: cần verify PIN trước
    async disable(onSuccess) {
      this.showVerify(async () => {
        lsSet(LS.enabled, null);
        lsSet(LS.pinHash, null);
        lsSet(LS.pinSalt, null);
        lsSet(LS.biometric, null);
        window.QLT_UI?.toast?.('Đã tắt khoá', { type: 'success' });
        if (onSuccess) onSuccess();
      });
    },

    hide() {
      this._open = false;
      this._el('lockScreen').classList.remove('open');
      this._pinBuf = '';
    },

    // Helper: bật/tắt sinh trắc
    async setBiometric(enabled) {
      if (enabled) {
        const { available } = await bioAvailable();
        if (!available) throw new Error('NO_BIOMETRIC');
      }
      lsSet(LS.biometric, enabled ? 'true' : 'false');
    },

    setTimeout(seconds) {
      lsSet(LS.timeout, parseInt(seconds, 10) || 0);
    },

    // Đọc raw flag — dùng cho UI hiển thị toggle
    isBiometricFlagOn() {
      return lsGetBool(LS.biometric, false);
    },

    bioAvailable
  };

  window.QLT_Lock = Lock;
})();
