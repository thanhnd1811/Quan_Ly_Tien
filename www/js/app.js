// Logic chính của app
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

// ===== In-app dialog + toast (thay alert/confirm native, hoạt động như nhau trên web & APK) =====
const QLT_UI = (() => {
  const escapeText = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  let activeResolve = null;

  function close(result) {
    const dlg = document.getElementById('qltDialog');
    if (!dlg) return;
    dlg.classList.remove('open');
    document.getElementById('qltDialogActions').innerHTML = '';
    const r = activeResolve;
    activeResolve = null;
    if (r) r(result);
  }

  function open({ title = '', message = '', buttons, html = false }) {
    return new Promise(resolve => {
      // Nếu có dialog cũ đang mở, đóng (resolve undefined) trước
      if (activeResolve) { try { activeResolve(undefined); } catch (_) {} activeResolve = null; }

      const dlg = document.getElementById('qltDialog');
      if (!dlg) { resolve(undefined); return; }

      document.getElementById('qltDialogTitle').innerHTML = title ? escapeText(title) : '';
      document.getElementById('qltDialogTitle').style.display = title ? 'block' : 'none';
      document.getElementById('qltDialogMsg').innerHTML = html ? message : escapeText(message);

      const actions = document.getElementById('qltDialogActions');
      actions.innerHTML = '';
      buttons.forEach(b => {
        const btn = document.createElement('button');
        btn.className = 'qlt-dialog-btn' + (b.variant ? ' ' + b.variant : '');
        btn.type = 'button';
        btn.textContent = b.label;
        btn.onclick = () => close(b.value);
        actions.appendChild(btn);
      });

      activeResolve = resolve;
      dlg.classList.add('open');
    });
  }

  function alert(message, opts = {}) {
    return open({
      title: opts.title || '',
      message,
      html: !!opts.html,
      buttons: [{ label: opts.okLabel || 'OK', variant: 'primary', value: true }]
    });
  }

  function confirm(message, opts = {}) {
    return open({
      title: opts.title || '',
      message,
      buttons: [
        { label: opts.cancelLabel || 'Huỷ', value: false },
        { label: opts.okLabel || 'OK', variant: opts.danger ? 'danger' : 'primary', value: true }
      ]
    });
  }

  function toast(message, opts = {}) {
    const wrap = document.getElementById('qltToastWrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'qlt-toast' + (opts.type ? ' ' + opts.type : '');
    el.textContent = message;
    wrap.appendChild(el);
    const ms = opts.duration || (opts.type === 'error' ? 3500 : 2200);
    setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => el.remove(), 260);
    }, ms);
  }

  // Insight banner: HTML support + slide từ top, tap để dismiss sớm
  function insight(html, opts = {}) {
    let wrap = document.getElementById('qltInsightWrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'qltInsightWrap';
      document.body.appendChild(wrap);
    }
    const el = document.createElement('div');
    el.className = 'qlt-insight' + (opts.variant ? ' ' + opts.variant : '');
    const emoji = opts.emoji || '💡';
    el.innerHTML =
      '<div class="qlt-insight-emoji">' + escapeText(emoji) + '</div>' +
      '<div class="qlt-insight-body">' + html + '</div>';
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return; dismissed = true;
      el.classList.add('fade');
      el.classList.remove('show');
      setTimeout(() => el.remove(), 320);
    };
    el.onclick = dismiss;
    setTimeout(dismiss, opts.duration || 5500);
    try { navigator.vibrate?.([15, 25, 15]); } catch (_) {}
  }

  // Đóng khi bấm nền tối (không tính như xác nhận)
  document.addEventListener('DOMContentLoaded', () => {
    const dlg = document.getElementById('qltDialog');
    if (dlg) dlg.addEventListener('click', e => { if (e.target === dlg) close(false); });
    document.addEventListener('keydown', e => {
      if (!document.getElementById('qltDialog')?.classList.contains('open')) return;
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') {
        const btns = document.querySelectorAll('#qltDialogActions .qlt-dialog-btn');
        const last = btns[btns.length - 1];
        if (last) last.click();
      }
    });
  });

  return { alert, confirm, toast, insight };
})();
window.QLT_UI = QLT_UI;
const fmt = n => (n || 0).toLocaleString('vi-VN');
const today = () => new Date().toISOString().slice(0, 10);

// Haptic feedback — wrapper navigator.vibrate với các pattern chuẩn
// User có thể tắt qua localStorage 'qlt_haptic_off' = '1'
function haptic(type = 'light') {
  if (localStorage.getItem('qlt_haptic_off') === '1') return;
  if (!navigator.vibrate) return;
  const patterns = {
    light:   10,
    medium:  20,
    heavy:   40,
    success: [10, 30, 10],
    warning: [20, 50, 20],
    error:   [40, 60, 40, 60]
  };
  try { navigator.vibrate(patterns[type] || 10); } catch (_) {}
}

// Animated number counter — count-up smooth từ giá trị cũ → mới (~280ms)
// Lưu giá trị cuối cùng trên element để biết "from" cho lần animate tiếp theo
function animateNumber(el, target, opts = {}) {
  if (!el) return;
  const dur = opts.duration || 320;
  const suffix = opts.suffix == null ? ' đ' : opts.suffix;
  const start = parseFloat(el.dataset._lastValue || '0') || 0;
  const end = Number(target) || 0;
  // Skip animation nếu giá trị trùng hoặc đang ẩn
  if (start === end || (typeof isAmountHidden === 'function' && isAmountHidden())) {
    el.textContent = (typeof fmtBal === 'function' && opts.useFmtBal !== false) ? fmtBal(end) : (fmt(end) + suffix);
    el.dataset._lastValue = String(end);
    return;
  }
  el.dataset._lastValue = String(end);
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 3); // ease-out cubic
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const cur = start + (end - start) * ease(p);
    el.textContent = fmt(Math.round(cur)) + suffix;
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = fmt(end) + suffix;
  };
  requestAnimationFrame(step);
}

// Privacy mode: ẩn số dư lớn (giống app ngân hàng)
const isAmountHidden = () => localStorage.getItem('qlt_hide_amounts') === '1';
// fmtBal(amount, opts) → ra '••••• đ' nếu ẩn, ngược lại '1.234.000 đ'
//   opts.signed = true để giữ dấu +/- khi ẩn (vd '-•••• đ' cho chi tiêu)
const fmtBal = (amount, opts = {}) => {
  if (isAmountHidden()) {
    if (opts.signed) {
      const s = (amount || 0) > 0 ? '+' : ((amount || 0) < 0 ? '-' : '');
      return s + '••••• đ';
    }
    return '••••• đ';
  }
  return fmt(amount) + ' đ';
};

// Lazy-load SortableJS (kéo-thả sắp xếp lại) — chỉ tải khi user thật sự reorder
let _sortableLoading = null;
function loadSortable() {
  if (window.Sortable) return Promise.resolve();
  if (_sortableLoading) return _sortableLoading;
  _sortableLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return _sortableLoading;
}
// Sort helper: items có .order số đứng trước, không order theo _createdAt/id (mới ở cuối)
const sortByOrder = (a, b) => {
  const ao = (typeof a.order === 'number') ? a.order : 9e9;
  const bo = (typeof b.order === 'number') ? b.order : 9e9;
  if (ao !== bo) return ao - bo;
  return String(a._createdAt || a.id || '').localeCompare(String(b._createdAt || b.id || ''));
};
const todayTime = () => {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
};

// Format số tiền với dấu chấm phân cách (vi-VN)
const fmtAmount = v => {
  const n = parseInt(String(v).replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString('vi-VN') : '';
};

// Đọc số nguyên từ input đã format (giữ tương thích — bỏ qua dấu chấm phân cách vi-VN)
function readAmount(el) {
  const raw = (el?.value || '').toString();
  const v = raw.replace(/\D/g, '');
  return v ? parseInt(v, 10) : 0;
}

// ============ VOICE INPUT (đọc giọng nói tiếng Việt → giao dịch) ============
// Bỏ dấu để so khớp keyword không phụ thuộc dấu (đ → d)
function normalizeVi(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

// Map từ chữ → số (cho cụm "một triệu", "hai trăm nghìn", v.v.)
const VI_DIGIT_WORDS = {
  'khong': 0, 'mot': 1, 'hai': 2, 'ba': 3, 'bon': 4, 'tu': 4,
  'nam': 5, 'sau': 6, 'bay': 7, 'tam': 8, 'chin': 9, 'muoi': 10,
  'tram': 100, 'nghin': 1000, 'ngan': 1000, 'trieu': 1000000, 'ty': 1000000000
};

// Bỏ dấu chấm phân tách nghìn ("50.000" → "50000", "1.500.000" → "1500000")
// nhưng GIỮ dấu chấm thập phân ("1.5" giữ nguyên — chỉ thay khi có đúng 3 số sau dấu chấm)
function stripThousandSep(s) {
  let t = s;
  let prev;
  do { prev = t; t = t.replace(/(\d+)\.(\d{3})(?=\D|$)/g, '$1$2'); } while (t !== prev);
  return t;
}

// Trích số tiền từ câu nói tiếng Việt
// Hỗ trợ: "50 nghìn", "80k", "1tr2", "1 triệu 200", "200000", "50.000đ", "1.5 triệu", "một triệu hai"
function parseVoiceAmount(text) {
  // Bước 1: bỏ dấu chấm thiên-tách-nghìn TRƯỚC khi normalize/parse
  let t = stripThousandSep(text);
  // Bước 2: chuẩn hoá Vietnamese
  t = normalizeVi(t).replace(/,/g, '.');

  // 1) "X tr Y nghìn" / "X triệu Y trăm nghìn" (vd: "1 triệu 200 nghìn")
  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:tr|trieu)\s*(\d+(?:\.\d+)?)\s*(?:k|nghin|ngan)/);
  if (m) return Math.round(parseFloat(m[1]) * 1e6 + parseFloat(m[2]) * 1000);

  // 2) "X triệu YYYYYY" — Y là số raw nhiều chữ số (sau stripThousandSep)
  // Vd: "1 triệu 450.000" → "1 triệu 450000" → 1.450.000
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:tr|trieu)\s+(\d{4,9})\b/);
  if (m) return Math.round(parseFloat(m[1]) * 1e6 + parseInt(m[2], 10));

  // 3) "Xtr YYY" — Y là 3 chữ số ngầm hiểu là 'nghìn'
  // Vd: "1tr345" hoặc "1 triệu 345" → 1.345.000
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:tr|trieu)\s*(\d{3})(?!\d)/);
  if (m) return Math.round(parseFloat(m[1]) * 1e6 + parseInt(m[2], 10) * 1000);

  // 4) "Xtr YY" — Y là 2 chữ số ngầm hiểu là 'nghìn' (vd "1tr45" = 1.045.000)
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:tr|trieu)\s*(\d{2})(?!\d)/);
  if (m) return Math.round(parseFloat(m[1]) * 1e6 + parseInt(m[2], 10) * 1000);

  // 5) "Xtr Y" — Y là 1 chữ số trăm-nghìn (1tr2 = 1.200.000, 1tr5 = 1.500.000)
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:tr|trieu)\s*(\d)(?!\d)/);
  if (m) return Math.round(parseFloat(m[1]) * 1e6 + parseInt(m[2], 10) * 1e5);

  // 6) Cụm số + đơn vị đơn lẻ
  m = t.match(/(\d+(?:\.\d+)?)\s*(tr|trieu|nghin|ngan|k|ty|dong|d)\b/);
  if (m) {
    const x = parseFloat(m[1]);
    const u = m[2];
    if (u === 'k' || u === 'nghin' || u === 'ngan') return Math.round(x * 1000);
    if (u === 'tr' || u === 'trieu') return Math.round(x * 1e6);
    if (u === 'ty') return Math.round(x * 1e9);
    return Math.round(x);
  }

  // 4) Cụm bằng chữ: "một triệu hai", "hai trăm nghìn"
  // Tách từ, scan tuần tự, tích luỹ
  const words = t.split(/[\s,.]+/).filter(Boolean);
  let total = 0, current = 0, anyDigit = false;
  for (const w of words) {
    if (VI_DIGIT_WORDS[w] != null) {
      const v = VI_DIGIT_WORDS[w];
      anyDigit = true;
      if (v < 10) {
        current = current === 0 ? v : current + v;
      } else if (v === 100) {
        current = (current || 1) * 100;
      } else {
        // 1000, 1e6, 1e9 — đẩy current vào total nhân với multiplier
        total += (current || 1) * v;
        current = 0;
      }
    } else if (/^\d+$/.test(w)) {
      anyDigit = true;
      current += parseInt(w, 10);
    }
  }
  if (anyDigit && (total + current) > 0) return total + current;

  // 5) Số trần
  m = t.match(/\d{4,}/);
  if (m) return parseInt(m[0], 10);

  return 0;
}

// Wrapper plugin native (Capacitor) + Web Speech API fallback
const QLT_Voice = (() => {
  function nativePlugin() {
    return window.Capacitor?.Plugins?.SpeechRecognition || null;
  }

  // Diagnostic: trả thông tin chi tiết tại sao không nhận giọng nói được
  async function diagnose() {
    const SR = nativePlugin();
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform?.());
    const out = { isNative, hasPlugin: !!SR, available: false, perm: 'unknown', error: null };
    if (SR) {
      try {
        const av = await SR.available();
        out.available = !!(av?.available);
      } catch (e) { out.error = 'available() lỗi: ' + (e?.message || e); }
      try {
        const p = await SR.checkPermissions();
        out.perm = p?.speechRecognition || p?.permission || 'unknown';
      } catch (e) { /* skip */ }
    } else if (window.SpeechRecognition || window.webkitSpeechRecognition) {
      out.available = true;
    }
    return out;
  }

  return {
    diagnose,
    available() {
      return !!nativePlugin() ||
             !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    },

    async listen({ lang = 'vi-VN', onPartial, onResult, onError, onEnd } = {}) {
      const SR = nativePlugin();
      try {
        if (SR) {
          // Kiểm tra service có sẵn
          try {
            const av = await SR.available();
            console.log('[QLT_Voice] available:', av);
            if (av && av.available === false) {
              onError?.(new Error('Thiết bị thiếu dịch vụ nhận giọng nói. Cài Google App từ Play Store.'));
              onEnd?.(); return;
            }
          } catch (e) { console.warn('[QLT_Voice] available() throw', e); }

          // Xin quyền RECORD_AUDIO
          try {
            const perm = await SR.checkPermissions();
            console.log('[QLT_Voice] checkPermissions:', perm);
            const granted = perm?.speechRecognition === 'granted' || perm?.permission === 'granted';
            if (!granted) {
              const req = await SR.requestPermissions();
              console.log('[QLT_Voice] requestPermissions:', req);
              const grantedNow = req?.speechRecognition === 'granted' || req?.permission === 'granted';
              if (!grantedNow) {
                onError?.(new Error('Chưa cấp quyền microphone. Vào Cài đặt Android → Apps → Quản Lý Tiền → Permissions → bật Microphone.'));
                onEnd?.(); return;
              }
            }
          } catch (e) { console.warn('[QLT_Voice] permissions throw', e); }

          // Lắng nghe partial results (cho cả 2 mode)
          let final = '';
          let partListener = null;
          try {
            partListener = await SR.addListener('partialResults', (data) => {
              const text = data?.matches?.[0] || '';
              if (text) { final = text; onPartial?.(text); }
            });
          } catch (e) { console.warn('[QLT_Voice] addListener throw', e); }

          // Dùng popup mode (dialog hệ thống) — ổn định hơn inline trên đa số máy
          try {
            const r = await SR.start({
              language: lang,
              maxResults: 1,
              partialResults: true,
              popup: true,
              prompt: 'Nói khoản chi của bạn'
            });
            console.log('[QLT_Voice] start result:', r);
            const text = (r?.matches?.[0]) || final;
            if (text) onResult?.(text);
            else onError?.(new Error('Không nghe được. Thử nói gần mic hơn.'));
          } catch (e) {
            console.error('[QLT_Voice] start failed:', e);
            onError?.(new Error(e?.message || 'Lỗi khi gọi mic: ' + JSON.stringify(e)));
          } finally {
            try { partListener?.remove?.(); } catch (_) {}
            onEnd?.();
          }
          return;
        }

        // Fallback web/PWA — chỉ chạy khi NO native plugin (vd test trên web)
        const W = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!W) { onError?.(new Error('Thiết bị/WebView không hỗ trợ nhận giọng nói. Cài bản APK mới nhất có plugin.')); onEnd?.(); return; }
        const rec = new W();
        rec.lang = lang;
        rec.interimResults = true;
        rec.continuous = false;
        rec.maxAlternatives = 1;
        let finalText = '';
        rec.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalText = r[0].transcript;
            else onPartial?.(r[0].transcript);
          }
        };
        rec.onerror = (e) => onError?.(new Error(e.error || 'Lỗi nhận giọng nói'));
        rec.onend = () => {
          if (finalText) onResult?.(finalText);
          onEnd?.();
        };
        rec.start();
      } catch (e) {
        onError?.(e);
        onEnd?.();
      }
    },

    async stop() {
      const SR = nativePlugin();
      if (SR) { try { await SR.stop(); } catch (_) {} }
    }
  };
})();
window.QLT_Voice = QLT_Voice;

// ============ GEOLOCATION (capture + reverse geocode) ============
const QLT_Geo = (() => {
  function pluginGeo() { return window.Capacitor?.Plugins?.Geolocation || null; }

  return {
    isEnabled() { return localStorage.getItem('qlt_geo_enabled') === '1'; },
    setEnabled(v) {
      if (v) localStorage.setItem('qlt_geo_enabled', '1');
      else localStorage.removeItem('qlt_geo_enabled');
    },

    // Lấy toạ độ hiện tại — timeout 8s, độ chính xác cao
    async getCurrentPosition() {
      const G = pluginGeo();
      if (G) {
        // Plugin Capacitor — auto xin quyền + dùng Fused Location Provider Android
        try {
          const perm = await G.checkPermissions();
          if (perm.location !== 'granted') {
            const r = await G.requestPermissions();
            if (r.location !== 'granted') throw new Error('Cần quyền truy cập vị trí');
          }
          const pos = await G.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
          return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        } catch (e) { throw e; }
      }
      // Web fallback
      if (!navigator.geolocation) throw new Error('Trình duyệt không hỗ trợ vị trí');
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
          (err) => reject(new Error(err.message || 'Không lấy được vị trí')),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
        );
      });
    },

    // Forward geocode (search địa chỉ → toạ độ) qua OSM Nominatim
    // Trả mảng top 5 candidates
    async searchAddress(query) {
      if (!query || query.length < 3) return [];
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&accept-language=vi&countrycodes=vn&limit=5`;
        const r = await fetch(url, { headers: { 'User-Agent': 'QuanLyTien/1.0' } });
        if (!r.ok) return [];
        const data = await r.json();
        return data.map(d => ({
          lat: parseFloat(d.lat),
          lng: parseFloat(d.lon),
          name: d.display_name,
          shortName: (d.display_name || '').split(',').slice(0, 3).join(',')
        }));
      } catch (e) { return []; }
    },

    // Reverse geocode qua OSM Nominatim — miễn phí, tiếng Việt
    // Rate limit 1 req/s — đủ cho dùng cá nhân (1 GD ~ 1 geocode)
    async reverseGeocode(lat, lng) {
      try {
        // zoom=18 để Nominatim trả thông tin chi tiết hơn (số nhà / tên đường)
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=vi&zoom=18&addressdetails=1`,
          { headers: { 'User-Agent': 'QuanLyTien/1.0 (personal-finance-app)' } }
        );
        if (!r.ok) return null;
        const data = await r.json();
        // Format ngắn: "[Số nhà] Phố/Đường, Phường, Quận, TP" — bỏ trùng lặp
        const a = data.address || {};
        const norm = s => (s || '').trim().toLowerCase();
        const seen = new Set();
        const push = (val) => {
          if (!val) return;
          const k = norm(val);
          if (!k || seen.has(k)) return;
          seen.add(k);
          parts.push(val);
        };
        const parts = [];
        // 1) Số nhà + tên phố / đường (cái user thực sự cần)
        const road = a.road || a.pedestrian || a.footway || a.path;
        if (road) push(a.house_number ? `${a.house_number} ${road}` : road);
        // 2) Phường / khu phố
        push(a.suburb || a.quarter || a.neighbourhood);
        // 3) Quận / huyện
        push(a.city_district || a.district || a.county);
        // 4) Tỉnh / Thành phố
        push(a.city || a.town || a.village || a.state);
        const short = parts.length > 0 ? parts.join(', ') : (data.display_name || '').split(',').slice(0, 4).join(',').trim();
        return { address: short, full: data.display_name || '' };
      } catch (e) {
        console.warn('Reverse geocode lỗi:', e);
        return null;
      }
    }
  };
})();
window.QLT_Geo = QLT_Geo;

// ============ POPUP CALCULATOR ============
// Một bàn phím số chuyên dụng (như Money Lover/MISA): tap input số tiền → mở popup
// keypad. Người dùng nhập, có thể +,−,×,÷,%,±,⌫,C. Bấm "=" → kết quả ghi lại input.
const QLT_Calc = (() => {
  let _input = null;
  let display = '0';     // chuỗi raw (chỉ chữ số, có thể có '-' đầu)
  let prevExpr = '';     // ký tự nhỏ phía trên
  let firstOp = null;    // số đầu (Number) đã commit
  let op = null;         // toán tử đã commit ('+'|'−'|'×'|'÷')
  let lastWasOp = false; // sau khi bấm op, digit kế tiếp thay thế display
  let justCalc = false;  // sau khi bấm =, digit kế tiếp thay thế display

  function fmt(s) {
    if (s == null) return '0';
    const str = String(s);
    const sign = str.startsWith('-') ? '-' : '';
    const digits = str.replace(/^-/, '').replace(/\D/g, '');
    if (!digits) return sign || '0';
    return sign + Number(digits).toLocaleString('vi-VN');
  }

  function refresh() {
    const cur = document.getElementById('calcCurrent');
    const prv = document.getElementById('calcPrev');
    if (cur) cur.textContent = fmt(display);
    if (prv) prv.textContent = prevExpr;
  }

  function compute(a, oper, b) {
    const A = Number(a), B = Number(b);
    if (oper === '+') return A + B;
    if (oper === '−' || oper === '-') return A - B;
    if (oper === '×' || oper === '*') return A * B;
    if (oper === '÷' || oper === '/') return B === 0 ? 0 : Math.round(A / B);
    return B;
  }

  function press(key) {
    if (key === 'C') {
      display = '0'; prevExpr = ''; firstOp = null; op = null; lastWasOp = false; justCalc = false;
    } else if (key === '⌫') {
      if (justCalc) { display = '0'; justCalc = false; }
      else if (lastWasOp) { op = null; prevExpr = ''; lastWasOp = false; }
      else {
        const sign = display.startsWith('-') ? '-' : '';
        const rest = display.replace(/^-/, '').slice(0, -1);
        display = (sign + rest) || '0';
        if (display === '-' || display === '') display = '0';
      }
    } else if (key === '±') {
      if (display === '0') return;
      display = display.startsWith('-') ? display.slice(1) : '-' + display;
    } else if (key === '%') {
      if (firstOp !== null && op !== null) {
        // 1.000.000 + 10% → cộng 10% của 1.000.000
        display = String(Math.round(Number(firstOp) * Number(display) / 100));
      } else {
        display = String(Math.round(Number(display) / 100));
      }
      lastWasOp = false; justCalc = true;
    } else if (key === '+' || key === '−' || key === '×' || key === '÷') {
      const cur = Number(display);
      if (firstOp !== null && op !== null && !lastWasOp) {
        const res = compute(firstOp, op, cur);
        firstOp = res;
        display = String(res);
      } else if (lastWasOp) {
        // Đổi op khi vừa bấm op trước đó
      } else {
        firstOp = cur;
      }
      op = key;
      prevExpr = fmt(String(firstOp)) + ' ' + key;
      lastWasOp = true;
      justCalc = false;
    } else if (key === '=') {
      if (firstOp !== null && op !== null) {
        const cur = Number(display);
        const res = compute(firstOp, op, cur);
        prevExpr = fmt(String(firstOp)) + ' ' + op + ' ' + fmt(String(cur)) + ' =';
        display = String(res);
        firstOp = null; op = null;
        justCalc = true; lastWasOp = false;
      }
      // Cam kết kết quả ngay khi bấm =
      const final = Math.max(0, Math.round(Math.abs(Number(display) || 0)));
      if (_input) {
        _input.value = final ? Number(final).toLocaleString('vi-VN') : '';
        try {
          _input.dispatchEvent(new Event('input', { bubbles: true }));
          _input.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
      }
      close();
      return;
    } else if (key === '000') {
      // Phím tắt 3 số 0 — rất tiện cho VND (1tr → 1000000 = 1 + 000 + 000)
      if (justCalc || lastWasOp) {
        display = '0'; justCalc = false; lastWasOp = false;
      }
      if (display !== '0' && display.replace(/^-/, '').length < 10) {
        display = display + '000';
      }
    } else if (/^[0-9]$/.test(key)) {
      if (justCalc || lastWasOp) {
        display = key; justCalc = false; lastWasOp = false;
      } else if (display === '0') {
        display = key;
      } else if (display === '-0') {
        display = '-' + key;
      } else if (display.replace(/^-/, '').length < 12) {
        display = display + key;
      }
    }
    refresh();
  }

  function open(input) {
    _input = input;
    const raw = (input?.value || '').toString().replace(/[^\d]/g, '');
    display = (raw && Number(raw)) ? raw : '0';
    prevExpr = '';
    firstOp = null; op = null; lastWasOp = false; justCalc = true;
    document.getElementById('calcModal').classList.add('open');
    refresh();
  }

  function close() {
    document.getElementById('calcModal').classList.remove('open');
    _input = null;
  }

  function bind() {
    const grid = document.getElementById('calcKeys');
    if (!grid) return;
    grid.querySelectorAll('[data-key]').forEach(el => {
      el.onclick = () => press(el.dataset.key);
    });
    const closeBtn = document.getElementById('calcClose');
    if (closeBtn) closeBtn.onclick = close;
    const modal = document.getElementById('calcModal');
    if (modal) modal.addEventListener('click', e => { if (e.target === modal) close(); });
    // Bàn phím vật lý (web/desktop test)
    document.addEventListener('keydown', e => {
      if (!document.getElementById('calcModal')?.classList.contains('open')) return;
      const k = e.key;
      if (/^[0-9]$/.test(k)) press(k);
      else if (k === '+') press('+');
      else if (k === '-') press('−');
      else if (k === '*') press('×');
      else if (k === '/') press('÷');
      else if (k === '%') press('%');
      else if (k === 'Enter' || k === '=') press('=');
      else if (k === 'Backspace') press('⌫');
      else if (k === 'Escape') close();
      else return;
      e.preventDefault();
    });
  }
  document.addEventListener('DOMContentLoaded', bind);

  return { open, close, press };
})();
window.QLT_Calc = QLT_Calc;

// Gắn handler "tap-to-open-calculator" cho mọi ô .qlt-amount
function attachAmountFormatting(el) {
  if (!el || el._qltFmt) return;
  el._qltFmt = true;
  el.setAttribute('readonly', 'readonly');
  el.setAttribute('inputmode', 'none');
  el.addEventListener('click', (e) => {
    e.preventDefault();
    QLT_Calc.open(el);
  });
}

const App = {
  state: {
    books: [],
    currentBookId: 'b_personal',
    accounts: [],
    categories: [],
    transactions: [],
    reminders: [],
    loans: [],
    budgets: [],
    goals: [],
    fuelLogs: [],
    maintenanceLogs: [],
    recurringRules: [],
    currentTab: 'home',
    txFilter: { type: 'all', period: 'month', accountId: 'all', search: '', categoryId: 'all', amountMin: 0, amountMax: 0, photoOnly: false, dateFrom: '', dateTo: '', tags: [] },
    bulkMode: false,
    bulkSelected: new Set(),
    txViewMode: 'list', // 'list' | 'calendar'
    calMonth: today().slice(0, 7), // 'YYYY-MM' currently displayed
    chartPeriod: 'month',
    chartFrom: '',
    chartTo: '',
    catTab: 'expense',
    loanTab: 'lend',
    loanStatusFilter: 'open',
    editingTx: null,
    editingCat: null,
    editingAcc: null,
    editingReminder: null,
    editingBook: null,
    editingLoan: null,
    editingBudget: null,
    editingGoal: null
  },

  // ====== PHOTO GALLERY ======
  renderPhotoGallery() {
    const wrap = $('#photoGallery');
    const stats = $('#photoStats');
    if (!wrap) return;

    // Gom tất cả ảnh từ tx có photos, sort newest first
    const items = []; // {tx, photo, idx, photos[]}
    for (const t of this.state.transactions) {
      const photos = this.getTxPhotos(t);
      photos.forEach((p, i) => items.push({ tx: t, photo: p, idx: i, photos }));
    }
    items.sort((a, b) => (b.tx.date + (b.tx._updatedAt || ''))
      .localeCompare(a.tx.date + (a.tx._updatedAt || '')));

    if (items.length === 0) {
      wrap.innerHTML = this.emptyState({
        icon: '📷', title: 'Chưa có ảnh nào',
        desc: 'Thêm ảnh hoá đơn / chuyển khoản vào giao dịch — chúng sẽ hiện ở đây.'
      });
      stats.textContent = '';
      return;
    }

    // Group by month
    const byMonth = {};
    items.forEach(x => {
      const ym = x.tx.date.slice(0, 7);
      (byMonth[ym] = byMonth[ym] || []).push(x);
    });

    stats.innerHTML = `📷 <strong style="color:var(--text)">${items.length}</strong> ảnh từ <strong style="color:var(--text)">${new Set(items.map(x => x.tx.id)).size}</strong> giao dịch`;

    let html = '';
    for (const ym of Object.keys(byMonth).sort().reverse()) {
      const [y, mo] = ym.split('-');
      html += `<div class="photo-gal-section">Tháng ${parseInt(mo, 10)}/${y} (${byMonth[ym].length})</div>`;
      html += '<div class="photo-gallery-grid">' + byMonth[ym].map((x, i) => {
        const cat = this.state.categories.find(c => c.id === x.tx.categoryId);
        const sign = x.tx.type === 'income' ? '+' : (x.tx.type === 'expense' ? '-' : '');
        return `
          <div class="photo-gal-item" data-photo-tx="${x.tx.id}" data-photo-idx="${x.idx}">
            <img src="${x.photo}" alt="">
            <div class="photo-gal-item-info">
              <div class="photo-gal-item-amt">${sign}${this._fmtShort(x.tx.amount)}</div>
              <div class="photo-gal-item-date">${this.formatDate(x.tx.date)}${cat ? ' · ' + this.escapeHtml(cat.name).slice(0, 14) : ''}</div>
            </div>
          </div>
        `;
      }).join('') + '</div>';
    }
    wrap.innerHTML = html;

    wrap.querySelectorAll('[data-photo-tx]').forEach(el => {
      el.onclick = () => {
        const txId = el.dataset.photoTx;
        const idx = parseInt(el.dataset.photoIdx, 10);
        const tx = this.state.transactions.find(t => t.id === txId);
        if (!tx) return;
        const photos = this.getTxPhotos(tx);
        // Mở lightbox với điều hướng giữa các ảnh của tx này
        this.openLightbox(photos[idx], photos, idx);
      };
    });
  },

  // ====== BULK SELECT ======
  _bulkToggle(txId, el) {
    if (this.state.bulkSelected.has(txId)) {
      this.state.bulkSelected.delete(txId);
      el.classList.remove('selected');
    } else {
      this.state.bulkSelected.add(txId);
      el.classList.add('selected');
    }
    $('#txBulkCount').textContent = this.state.bulkSelected.size + ' đã chọn';
  },
  _enterBulkMode() {
    this.state.bulkMode = true;
    this.state.bulkSelected = new Set();
    this.renderTransactions();
  },
  _exitBulkMode() {
    this.state.bulkMode = false;
    this.state.bulkSelected = new Set();
    this.renderTransactions();
  },
  async _bulkDelete() {
    const ids = Array.from(this.state.bulkSelected);
    if (ids.length === 0) { QLT_UI.toast('Chưa chọn giao dịch nào', { type: 'error' }); return; }
    if (!await QLT_UI.confirm(`Xoá ${ids.length} giao dịch đã chọn? Hành động này áp dụng applyBalanceDelta cho từng cái.`, { okLabel: 'Xoá', danger: true })) return;
    const snapshots = [];
    for (const id of ids) {
      const t = this.state.transactions.find(x => x.id === id);
      if (!t) continue;
      snapshots.push(JSON.parse(JSON.stringify(t)));
      await this.applyBalanceDelta(t, -1);
      await window.QLT_Store.del('transactions', id);
    }
    this._exitBulkMode();
    await this.reload();
    this.renderTransactions();
    if (this.state.currentTab === 'home') this.renderHome();
    this.showUndoToast(`🗑️ Đã xoá ${snapshots.length} giao dịch`, async () => {
      for (const s of snapshots) {
        await this.applyBalanceDelta(s, +1);
        await window.QLT_Store.put('transactions', s);
      }
      await this.reload();
      this.renderTransactions();
      if (this.state.currentTab === 'home') this.renderHome();
      QLT_UI.toast('Đã khôi phục', { type: 'success' });
      this.autoSync();
    });
    this.autoSync();
  },
  async _bulkChangeCategory() {
    const ids = Array.from(this.state.bulkSelected);
    if (ids.length === 0) { QLT_UI.toast('Chưa chọn giao dịch nào', { type: 'error' }); return; }
    // Tạo chooser đơn giản: prompt với danh sách category
    const txs = ids.map(id => this.state.transactions.find(x => x.id === id)).filter(Boolean);
    // Chỉ áp dụng cho expense/income — skip transfer
    const types = new Set(txs.map(t => t.type));
    if (types.size > 1 || types.has('transfer')) {
      QLT_UI.alert('Chỉ áp dụng được khi tất cả giao dịch chọn cùng loại Chi hoặc Thu (không hỗ trợ Chuyển khoản).', { title: 'Không áp dụng được' });
      return;
    }
    const type = [...types][0];
    const cats = this.state.categories.filter(c => c.type === type);
    if (cats.length === 0) { QLT_UI.toast('Không có danh mục phù hợp', { type: 'error' }); return; }
    const html = `<div style="text-align:left;font-size:13px;line-height:1.6">Chọn danh mục mới cho <strong>${ids.length}</strong> giao dịch ${type === 'expense' ? 'Chi phí' : 'Thu nhập'}:</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;max-height:300px;overflow-y:auto">
        ${cats.map(c => `<span class="pill" data-cat-pick="${c.id}" style="cursor:pointer">${this.escapeHtml(c.name)}</span>`).join('')}
      </div>`;
    // Custom modal — dùng existing dialog
    const dlg = document.getElementById('qltDialog');
    document.getElementById('qltDialogTitle').textContent = '🏷️ Đổi danh mục';
    document.getElementById('qltDialogTitle').style.display = 'block';
    document.getElementById('qltDialogMsg').innerHTML = html;
    document.getElementById('qltDialogActions').innerHTML = '<button class="qlt-dialog-btn" id="bulkCatCancel">Huỷ</button>';
    dlg.classList.add('open');
    document.getElementById('bulkCatCancel').onclick = () => dlg.classList.remove('open');
    dlg.querySelectorAll('[data-cat-pick]').forEach(el => {
      el.onclick = async () => {
        const newCat = el.dataset.catPick;
        dlg.classList.remove('open');
        for (const id of ids) {
          const t = this.state.transactions.find(x => x.id === id);
          if (t) {
            t.categoryId = newCat;
            await window.QLT_Store.put('transactions', t);
          }
        }
        this._exitBulkMode();
        await this.reload();
        this.renderTransactions();
        QLT_UI.toast(`Đã đổi danh mục cho ${ids.length} giao dịch`, { type: 'success' });
        this.autoSync();
      };
    });
  },

  // ====== TAGS cho giao dịch ======
  // Lấy distinct tags từ tất cả transactions (sort theo tần suất giảm dần)
  getAllTags() {
    const counter = {};
    for (const t of this.state.transactions) {
      if (Array.isArray(t.tags)) {
        for (const tag of t.tags) {
          if (tag && typeof tag === 'string') counter[tag] = (counter[tag] || 0) + 1;
        }
      }
    }
    return Object.entries(counter).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  },

  renderTxTags() {
    const wrap = $('#txTagsWrap');
    const sugWrap = $('#txTagSuggestions');
    const input = $('#txTagInput');
    if (!wrap || !input) return;

    const tx = this.state.editingTx;
    const renderChips = () => {
      wrap.innerHTML = (tx.tags || []).map(t =>
        `<span class="tx-tag-chip">${this.escapeHtml(t)} <span class="tx-tag-x" data-tag-rm="${this.escapeHtml(t)}">✕</span></span>`
      ).join('');
      wrap.querySelectorAll('[data-tag-rm]').forEach(el => {
        el.onclick = () => {
          tx.tags = tx.tags.filter(x => x !== el.dataset.tagRm);
          renderChips();
        };
      });
    };
    renderChips();

    // Suggestions: tags đã có trừ tags đang chọn, top 8
    const all = this.getAllTags().filter(x => !tx.tags.includes(x)).slice(0, 8);
    sugWrap.innerHTML = all.map(t =>
      `<span class="tx-tag-suggestion" data-tag-add="${this.escapeHtml(t)}">+ ${this.escapeHtml(t)}</span>`
    ).join('');
    sugWrap.querySelectorAll('[data-tag-add]').forEach(el => {
      el.onclick = () => {
        const v = el.dataset.tagAdd;
        if (!tx.tags.includes(v)) tx.tags.push(v);
        renderChips();
        const newAll = this.getAllTags().filter(x => !tx.tags.includes(x)).slice(0, 8);
        sugWrap.innerHTML = newAll.map(t =>
          `<span class="tx-tag-suggestion" data-tag-add="${this.escapeHtml(t)}">+ ${this.escapeHtml(t)}</span>`
        ).join('');
        sugWrap.querySelectorAll('[data-tag-add]').forEach(e => e.onclick = el.onclick);
      };
    });

    // Thêm tag từ input (Enter, dấu phẩy, blur, hoặc nút "+")
    input.value = '';
    const addCurrent = () => {
      const raw = input.value.trim();
      if (!raw) return;
      // Tách nhiều tag cùng lúc nếu user gõ với dấu phẩy
      const parts = raw.split(/[,;]/).map(s => s.trim().replace(/^#/, '')).filter(Boolean);
      for (let v of parts) {
        if (!v.startsWith('#')) v = '#' + v;
        if (!tx.tags.includes(v)) tx.tags.push(v);
      }
      input.value = '';
      renderChips();
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ',' || e.keyCode === 13) {
        e.preventDefault();
        addCurrent();
      }
    };
    input.onblur = () => addCurrent();
    const addBtn = $('#txTagAddBtn');
    if (addBtn) addBtn.onclick = () => { addCurrent(); input.focus(); };
  },

  // ====== SEARCH HISTORY (auto-suggest note) ======
  saveSearchHistory(term) {
    if (!term || term.length < 2) return;
    let hist = JSON.parse(localStorage.getItem('qlt_search_hist') || '[]');
    hist = hist.filter(x => x !== term);
    hist.unshift(term);
    hist = hist.slice(0, 10);
    localStorage.setItem('qlt_search_hist', JSON.stringify(hist));
  },
  getSearchHistory() {
    try { return JSON.parse(localStorage.getItem('qlt_search_hist') || '[]'); }
    catch (_) { return []; }
  },

  _renderSearchHistorySuggest(hide = false) {
    let el = document.getElementById('txSearchHistory');
    if (hide) { if (el) el.remove(); return; }
    const hist = this.getSearchHistory();
    if (hist.length === 0) return;
    if (!el) {
      el = document.createElement('div');
      el.id = 'txSearchHistory';
      el.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:12px;margin:6px 16px 0;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,.08)';
      $('#screen-transactions .tx-search-row').after(el);
    }
    el.innerHTML = '<div style="font-size:11px;color:var(--text3);margin-bottom:6px;padding:0 4px">📚 Từ khoá đã tìm gần đây</div>' +
      hist.map(h => `<span class="tx-tag-suggestion" data-hist="${this.escapeHtml(h)}" style="display:inline-block;margin:2px">${this.escapeHtml(h)}</span>`).join('');
    el.querySelectorAll('[data-hist]').forEach(b => {
      b.onclick = () => {
        const search = $('#txSearch');
        search.value = b.dataset.hist;
        this.state.txFilter.search = b.dataset.hist;
        this.renderTransactions();
        this._renderSearchHistorySuggest(true);
      };
    });
  },

  // ====== STREAK — số ngày liên tiếp ghi giao dịch ======
  computeStreak() {
    const dates = new Set(this.state.transactions.map(t => t.date));
    let streak = 0;
    const d = new Date();
    // Cho phép ngày HÔM NAY chưa có giao dịch (streak vẫn tính từ hôm qua trở về)
    if (!dates.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
    while (dates.has(d.toISOString().slice(0, 10))) {
      streak++;
      d.setDate(d.getDate() - 1);
      if (streak > 365) break;
    }
    return streak;
  },

  // Auto backup hằng tuần lên Drive — chạy khi mở app nếu cần
  async autoWeeklyBackup() {
    if (!window.QLT_Auth?.user || !window.QLT_Sync?.pushNow) return;
    const lastAuto = parseInt(localStorage.getItem('qlt_last_auto_backup') || '0', 10);
    const SEVEN_DAYS = 7 * 86400 * 1000;
    if (Date.now() - lastAuto < SEVEN_DAYS) return;
    try {
      await window.QLT_Sync.pushNow();
      localStorage.setItem('qlt_last_auto_backup', String(Date.now()));
      QLT_UI.toast('☁️ Tự sao lưu lên Drive', { type: 'success', duration: 2200 });
    } catch (e) { console.warn('Auto backup lỗi:', e); }
  },

  // Schedule notification "Tổng kết hôm nay" 20h hằng ngày
  async scheduleDailySummaryNotif() {
    if (!window.Capacitor?.Plugins?.LocalNotifications) return;
    if (localStorage.getItem('qlt_daily_notif_off') === '1') return;
    const LN = window.Capacitor.Plugins.LocalNotifications;
    try {
      const perm = await LN.requestPermissions();
      console.log('[DailyNotif] permission:', perm);
      if (perm.display !== 'granted') {
        // User chưa cấp quyền → toast cảnh báo (chỉ hiện khi user vừa toggle)
        console.warn('[DailyNotif] Notification permission KHÔNG cấp:', perm.display);
        return;
      }
      const id = 99001;
      await LN.cancel({ notifications: [{ id }] });

      // Tính tổng chi hôm nay (đến lúc gọi notif sẽ là tổng chi cả ngày)
      const todayStr = today();
      const expToday = this.state.transactions
        .filter(t => t.type === 'expense' && t.date === todayStr)
        .reduce((s, t) => s + t.amount, 0);
      const body = expToday > 0
        ? `Hôm nay đã chi ${fmt(expToday)} đ. Bấm để xem chi tiết.`
        : 'Hôm nay chưa ghi giao dịch nào. Đừng quên ghi lại nhé!';

      await LN.schedule({
        notifications: [{
          id,
          title: '💰 Tổng kết hôm nay',
          body,
          schedule: { on: { hour: 20, minute: 0 }, allowWhileIdle: true },
          sound: 'default'
        }]
      });
    } catch (e) { console.warn('Daily summary notif lỗi:', e); }
  },

  // Xử lý deeplink từ App shortcuts (qltien://add?type=expense)
  _handleDeeplink(url) {
    if (!url) return;
    const m = String(url).match(/^qltien:\/\/([^?]+)(?:\?(.*))?/i);
    if (!m) return;
    const action = m[1].toLowerCase();
    const params = new URLSearchParams(m[2] || '');
    if (action === 'add') {
      const type = params.get('type') || 'expense';
      this.openTxModal(null, ['expense','income','transfer'].includes(type) ? type : 'expense');
    } else if (action === 'voice') {
      this.openTxModal(null, 'expense');
      setTimeout(() => this.voiceInput(), 350);
    } else if (action === 'charts') {
      this.switchTab('charts');
    } else if (action === 'home') {
      this.switchTab('home');
    }
  },

  // ============ ONBOARDING TOUR ============
  // Hiện 1 lần duy nhất khi user mở app lần đầu (chưa từng dismiss).
  // Có thể mở lại từ Cài đặt → Trợ giúp.
  isOnboardSeen() { return localStorage.getItem('qlt_onboard_seen') === '1'; },
  markOnboardSeen() { localStorage.setItem('qlt_onboard_seen', '1'); },
  showOnboarding() {
    const modal = document.getElementById('onboardModal');
    if (!modal) return;
    const pages = modal.querySelectorAll('.onboard-page');
    const dots = document.getElementById('onboardDots');
    const total = pages.length;
    let cur = 0;
    dots.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const d = document.createElement('div');
      d.className = 'onboard-dot' + (i === 0 ? ' active' : '');
      dots.appendChild(d);
    }
    const apply = () => {
      pages.forEach((p, i) => p.classList.toggle('active', i === cur));
      dots.querySelectorAll('.onboard-dot').forEach((d, i) => d.classList.toggle('active', i === cur));
      const nextBtn = document.getElementById('onboardNext');
      nextBtn.textContent = cur === total - 1 ? '✓ Bắt đầu' : 'Tiếp →';
    };
    apply();

    document.getElementById('onboardNext').onclick = () => {
      if (cur < total - 1) { cur++; apply(); }
      else { this.closeOnboarding(true); }
    };
    document.getElementById('onboardSkip').onclick = () => this.closeOnboarding(true);
    // Swipe gesture đơn giản
    let touchStart = null;
    modal.addEventListener('touchstart', e => { touchStart = e.touches[0].clientX; }, { passive: true });
    modal.addEventListener('touchend', e => {
      if (touchStart == null) return;
      const dx = e.changedTouches[0].clientX - touchStart;
      if (Math.abs(dx) > 60) {
        if (dx < 0 && cur < total - 1) { cur++; apply(); }
        if (dx > 0 && cur > 0) { cur--; apply(); }
      }
      touchStart = null;
    }, { passive: true });

    modal.classList.add('open');
  },
  closeOnboarding(markSeen) {
    const modal = document.getElementById('onboardModal');
    if (modal) modal.classList.remove('open');
    if (markSeen) this.markOnboardSeen();
  },

  // ============ THEME (Dark/Light mode) ============
  // Lưu pref trong localStorage. Mode: 'light' | 'dark' | 'auto' (theo OS)
  getThemePref() {
    return localStorage.getItem('qlt_theme') || 'auto';
  },
  setThemePref(mode) {
    localStorage.setItem('qlt_theme', mode);
    this.applyTheme();
  },
  applyTheme() {
    const mode = this.getThemePref();
    let isDark;
    if (mode === 'dark') isDark = true;
    else if (mode === 'light') isDark = false;
    else isDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    // Cập nhật status bar theme nếu có
    try {
      const SB = window.Capacitor?.Plugins?.StatusBar;
      if (SB?.setStyle) SB.setStyle({ style: isDark ? 'DARK' : 'LIGHT' });
    } catch (_) {}
    // Apply color theme variant
    this.applyColorTheme();
  },

  // Theme variants: forest (default) / ocean / sunset / royal
  getColorTheme() {
    return localStorage.getItem('qlt_color_theme') || 'forest';
  },
  setColorTheme(name) {
    if (!['forest', 'ocean', 'sunset', 'royal'].includes(name)) name = 'forest';
    localStorage.setItem('qlt_color_theme', name);
    this.applyColorTheme();
    this.renderThemePicker();
  },
  applyColorTheme() {
    const name = this.getColorTheme();
    if (name === 'forest') document.documentElement.removeAttribute('data-color-theme');
    else document.documentElement.setAttribute('data-color-theme', name);
  },
  renderThemePicker() {
    const wrap = $('#themePicker');
    if (!wrap) return;
    const cur = this.getColorTheme();
    const themes = [
      { key: 'forest', name: 'Rừng', swatch: 'linear-gradient(135deg,#2d6a4f,#52b788)' },
      { key: 'ocean', name: 'Biển',  swatch: 'linear-gradient(135deg,#1e6091,#4a90c2)' },
      { key: 'sunset', name: 'Hoàng hôn', swatch: 'linear-gradient(135deg,#c45934,#e88c5f)' },
      { key: 'royal', name: 'Hoàng gia', swatch: 'linear-gradient(135deg,#6b4d8b,#9c7ab9)' }
    ];
    wrap.innerHTML = themes.map(t => `
      <div class="theme-chip ${cur === t.key ? 'on' : ''}" data-theme-key="${t.key}">
        <div class="theme-chip-swatch" style="background:${t.swatch}"></div>
        <div class="theme-chip-name">${t.name}</div>
      </div>
    `).join('');
    wrap.querySelectorAll('[data-theme-key]').forEach(el => {
      el.onclick = () => {
        this.setColorTheme(el.dataset.themeKey);
        QLT_UI.toast('Đã đổi bảng màu', { type: 'success', duration: 1200 });
      };
    });
  },

  async init() {
    try {
      // Áp theme NGAY khi init để tránh flash trắng
      this.applyTheme();
      // Lắng nghe thay đổi system theme khi đang ở mode 'auto'
      try {
        window.matchMedia?.('(prefers-color-scheme: dark)')?.addEventListener('change', () => {
          if (this.getThemePref() === 'auto') this.applyTheme();
        });
      } catch (_) {}

      // Edge-to-edge: WebView vẽ tràn ra sau status bar để màu topbar phủ kín lên trên
      const SB = window.Capacitor?.Plugins?.StatusBar;
      if (SB) {
        try {
          await SB.setOverlaysWebView({ overlay: true });
        } catch (e) { /* web/PWA bỏ qua */ }
      }

      // Service worker — chỉ register khi production (KHÔNG phải localhost dev), tránh kẹt cache cũ
      const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '';
      if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !isDev) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      } else if (isDev && 'serviceWorker' in navigator) {
        // Trên localhost: tự gỡ SW cũ nếu có (đã từng register trước đây)
        navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
      }

      // Auth init không await sâu — luôn return nhanh để app render
      try {
        await window.QLT_Auth.init();
      } catch (e) {
        console.warn('Auth init lỗi (bỏ qua):', e);
      }
      window.QLT_Auth.onChange(u => this.onAuthChange(u));

      if (window.QLT_Auth.user) {
        window.QLT_Store.setUser(window.QLT_Auth.user.email);
      } else {
        window.QLT_Store.setUser('guest');
      }

      await window.QLT_Store.initDefaults();
      await this.reload();
      // Đặt lại notif cho mọi khoản nợ đang mở có hạn trả
      try {
        for (const l of this.state.loans.filter(l => l.status !== 'closed' && l.dueDate)) {
          await this.scheduleLoanNotif(l);
        }
      } catch (_) {}
      // Đặt lại notif cho mọi sổ tiết kiệm có ngày đáo hạn
      try {
        for (const a of this.state.accounts.filter(a => this.isActiveSavings(a) && a.maturityDate)) {
          await this.scheduleMaturityNotif(a);
        }
      } catch (_) {}
      // Đặt lại notif cho mục tiêu tiết kiệm
      try {
        for (const g of this.state.goals.filter(g => g.status === 'active')) {
          await this.scheduleGoalNotif(g);
        }
      } catch (_) {}
      this.render();
      this.bindEvents();
      $$('.qlt-amount').forEach(attachAmountFormatting);

      // Chạy các quy tắc giao dịch định kỳ → tạo tx cho các kỳ đã qua
      try {
        const created = await this.runRecurringRules();
        if (created > 0) {
          await this.reload();
          QLT_UI.toast(`🔄 Tự tạo ${created} giao dịch định kỳ`, { type: 'success', duration: 3500 });
        }
      } catch (e) { console.warn('Recurring rules lỗi:', e); }

      // Render home dưới TRƯỚC để khi unlock app sẵn sàng (lock screen z-index cao hơn)
      this.switchTab('home');

      // Auto backup hằng tuần lên Drive (nếu đã đăng nhập + chưa sync trong 7 ngày)
      try { await this.autoWeeklyBackup(); } catch (_) {}

      // Schedule daily summary notification (8h tối) nếu user cho phép
      try { await this.scheduleDailySummaryNotif(); } catch (_) {}

      // Lắng nghe deeplink qltien:// từ App shortcuts (long-press icon)
      try {
        const AppPlugin = window.Capacitor?.Plugins?.App;
        if (AppPlugin) {
          AppPlugin.addListener?.('appUrlOpen', ({ url }) => this._handleDeeplink(url));
          // Cũng xử lý launch URL nếu app khởi động từ shortcut
          const launch = await AppPlugin.getLaunchUrl?.();
          if (launch?.url) setTimeout(() => this._handleDeeplink(launch.url), 400);
        }
      } catch (e) { console.warn('Deeplink listener lỗi:', e); }

      // Show onboarding nếu user mở app lần đầu (chưa từng skip/finish)
      if (!this.isOnboardSeen()) {
        // Trễ 600ms để layout xong + tránh đè lock screen
        setTimeout(() => {
          if (!document.getElementById('lockScreen')?.classList.contains('open')) {
            this.showOnboarding();
          }
        }, 600);
      }

      // Migrate PIN từ meta cũ (nếu user đã setup trước bản này) sang localStorage device-wide
      try { if (window.QLT_Lock) await window.QLT_Lock.migrate(); } catch (_) {}

      // Khoá app: nếu đã bật PIN → hiện lock screen ngay (đè lên home)
      try {
        if (window.QLT_Lock && window.QLT_Lock.isEnabled()) {
          window.QLT_Lock.showVerify();
        }
      } catch (_) {}

      // Hook Capacitor App resume — khoá lại nếu hết timeout
      try {
        const AppPlugin = window.Capacitor?.Plugins?.App;
        if (AppPlugin) {
          AppPlugin.addListener('appStateChange', ({ isActive }) => {
            if (!isActive) return;
            // App vừa active lại
            if (window.QLT_Lock && window.QLT_Lock.shouldLockOnResume()) {
              window.QLT_Lock.showVerify(() => {});
            }
          });
        }
      } catch (_) {}
    } catch (e) {
      console.error('App init lỗi:', e);
      // Hiện lỗi cho user (không phải màn trắng vô vọng)
      const body = document.body;
      if (body) {
        const err = document.createElement('div');
        err.style.cssText = 'position:fixed;inset:0;background:#fff;color:#1a2a1f;padding:24px;font-family:sans-serif;font-size:14px;line-height:1.6;z-index:99999;overflow:auto';
        err.innerHTML = `<h2 style="color:#e63946;margin-bottom:12px">Ứng dụng gặp lỗi khi khởi động</h2>
          <p>Vui lòng chụp màn hình và gửi cho dev:</p>
          <pre style="background:#f4f4f4;padding:12px;border-radius:8px;white-space:pre-wrap;word-break:break-word;font-size:12px;margin-top:8px">${(e && e.stack) || e}</pre>
          <button onclick="location.reload()" style="margin-top:16px;padding:10px 20px;background:#2d6a4f;color:#fff;border:none;border-radius:8px;font-weight:600">Tải lại</button>`;
        body.appendChild(err);
      }
    } finally {
      // ALWAYS dismiss splash — dù init thành công hay thất bại
      const splash = document.getElementById('qltSplash');
      if (splash && !splash._dismissed) {
        splash._dismissed = true;
        setTimeout(() => {
          splash.classList.add('fade');
          setTimeout(() => { if (splash.parentNode) splash.remove(); }, 400);
        }, 400);
      }
    }
  },

  async reload() {
    // Show skeleton trên list giao dịch + ví ngay (bị ghi đè khi render xong)
    const recentEl = document.getElementById('homeRecent');
    if (recentEl && !recentEl.dataset.shown) {
      recentEl.innerHTML = this.skeletonRows(4);
      recentEl.dataset.shown = '1';
    }
    this.state.books = await window.QLT_Store.getAll('books');
    this.state.currentBookId = window.QLT_Store.getCurrentBookId();
    const bid = this.state.currentBookId;
    const inBook = arr => arr.filter(x => x.bookId === bid);
    this.state.accounts = inBook(await window.QLT_Store.getAll('accounts'));
    this.state.categories = inBook(await window.QLT_Store.getAll('categories'));
    this.state.transactions = inBook(await window.QLT_Store.getAll('transactions'));
    this.state.reminders = inBook(await window.QLT_Store.getAll('reminders'));
    this.state.loans = inBook(await window.QLT_Store.getAll('loans'));
    this.state.budgets = inBook(await window.QLT_Store.getAll('budgets'));
    this.state.goals = inBook(await window.QLT_Store.getAll('goals'));
    this.state.fuelLogs = inBook(await window.QLT_Store.getAll('fuelLogs'));
    this.state.maintenanceLogs = inBook(await window.QLT_Store.getAll('maintenanceLogs'));
    this.state.recurringRules = inBook(await window.QLT_Store.getAll('recurringRules'));
  },

  currentBook() {
    return this.state.books.find(b => b.id === this.state.currentBookId);
  },

  async switchBook(bookId) {
    window.QLT_Store.setCurrentBookId(bookId);
    await this.reload();
    this.renderBookHeader();
    this.switchTab('home');
  },

  async onAuthChange(user) {
    const newKey = user ? user.email : 'guest';
    if (newKey !== window.QLT_Store.currentUser) {
      window.QLT_Store.setUser(newKey);
      await window.QLT_Store.initDefaults();
      // Khi đăng nhập, tự pull data từ Drive (nếu có)
      if (user) {
        try { await window.QLT_Sync.pullNow(); } catch (e) { console.warn('Pull lỗi:', e); }
      }
      await this.reload();
    }
    this.renderAuthUI();
    if (this.state.currentTab) this.switchTab(this.state.currentTab);
  },

  // Toggle ẩn/hiện số dư (giống banking app — eye icon)
  toggleHideAmounts() {
    const cur = isAmountHidden();
    if (cur) localStorage.removeItem('qlt_hide_amounts');
    else localStorage.setItem('qlt_hide_amounts', '1');
    this._refreshEyeIcons();
    // Re-render tab hiện tại để cập nhật số tiền
    if (this.state.currentTab === 'home') this.renderHome();
    else if (this.state.currentTab === 'accounts') this.renderAccounts();
    else if (this.state.currentTab === 'savings') this.renderSavings && this.renderSavings();
    else this.switchTab(this.state.currentTab);
  },

  _refreshEyeIcons() {
    const hidden = isAmountHidden();
    document.querySelectorAll('.balance-eye').forEach(el => {
      el.textContent = hidden ? '🙈' : '👁';
      el.title = hidden ? 'Hiện số tiền' : 'Ẩn số tiền';
    });
  },

  bindEvents() {
    // Bottom nav
    $$('.ni').forEach(el => {
      el.onclick = () => {
        const tab = el.dataset.tab;
        haptic(tab === 'add' ? 'medium' : 'light');
        if (tab === 'add') this.openTxModal(null, 'expense');
        else this.switchTab(tab);
      };
    });

    // Topbar elevation khi scroll xuống — tạo cảm giác layer
    document.querySelectorAll('.scroll-body').forEach(body => {
      const screen = body.closest('.screen');
      const topbar = screen?.querySelector('.topbar');
      if (!topbar) return;
      let ticking = false;
      body.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          if (body.scrollTop > 4) topbar.classList.add('scrolled');
          else topbar.classList.remove('scrolled');
          ticking = false;
        });
      }, { passive: true });
    });

    // Pull-to-refresh — chỉ apply cho home + accounts + transactions
    const ptrTabs = ['home', 'accounts', 'transactions'];
    document.querySelectorAll('.scroll-body').forEach(body => {
      const screen = body.closest('.screen');
      if (!screen) return;
      const tabId = (screen.id || '').replace('screen-', '');
      if (!ptrTabs.includes(tabId)) return;

      // Inject indicator nếu chưa có
      if (!body.querySelector('.ptr-indicator')) {
        const ind = document.createElement('div');
        ind.className = 'ptr-indicator';
        ind.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><polyline points="12 7 12 12 15 14"/></svg>';
        body.insertBefore(ind, body.firstChild);
      }
      const indicator = body.querySelector('.ptr-indicator');

      let startY = 0, currentY = 0, pulling = false, refreshing = false;
      const THRESHOLD = 70;

      body.addEventListener('touchstart', (e) => {
        if (refreshing) return;
        if (body.scrollTop > 0) return;
        // Skip nếu tap vào button/picker — tránh nhầm tap thành PTR (vd: eye toggle)
        if (e.target && e.target.closest && e.target.closest('button, .balance-eye, [role="button"], .ni, .ni-fab, .picker-item')) return;
        startY = e.touches[0].clientY;
        currentY = startY;  // QUAN TRỌNG: reset, tránh trigger refresh nhầm
        pulling = true;
      }, { passive: true });

      body.addEventListener('touchmove', (e) => {
        if (!pulling || refreshing) return;
        currentY = e.touches[0].clientY;
        const delta = currentY - startY;
        if (delta <= 0) {
          indicator.style.transform = 'translate(-50%,-100%)';
          indicator.classList.remove('pulling');
          return;
        }
        // Resistance — kéo càng xa càng nặng
        const dragged = Math.min(120, delta * 0.5);
        indicator.style.transform = `translate(-50%,${dragged - 50}px)`;
        indicator.classList.add('pulling');
        // Rotate svg theo % progress
        const progress = Math.min(1, dragged / THRESHOLD);
        const svg = indicator.querySelector('svg');
        if (svg) svg.style.transform = `rotate(${progress * 270}deg)`;
      }, { passive: true });

      body.addEventListener('touchend', async () => {
        if (!pulling || refreshing) return;
        pulling = false;
        const delta = currentY - startY;
        const dragged = Math.min(120, delta * 0.5);
        if (dragged >= THRESHOLD) {
          // Trigger refresh
          refreshing = true;
          indicator.classList.add('refreshing');
          indicator.style.transform = '';
          haptic('medium');
          try {
            await this.reload();
            this.switchTab(this.state.currentTab);
            // Sync nếu đăng nhập
            if (window.QLT_Auth?.user) {
              try { await window.QLT_Sync.smartSync(); } catch (_) {}
            }
            haptic('success');
          } catch (_) {}
          setTimeout(() => {
            indicator.classList.remove('refreshing', 'pulling');
            indicator.style.transform = 'translate(-50%,-100%)';
            const svg = indicator.querySelector('svg');
            if (svg) svg.style.transform = '';
            refreshing = false;
          }, 600);
        } else {
          // Snap back
          indicator.classList.remove('pulling');
          indicator.style.transform = 'translate(-50%,-100%)';
          const svg = indicator.querySelector('svg');
          if (svg) svg.style.transform = '';
        }
      }, { passive: true });
    });

    // Eye buttons (ẩn/hiện số dư)
    const homeEye = $('#homeEyeBtn');
    if (homeEye) homeEye.onclick = (e) => { e.stopPropagation(); this.toggleHideAmounts(); };
    const accEye = $('#accEyeBtn');
    if (accEye) accEye.onclick = (e) => { e.stopPropagation(); this.toggleHideAmounts(); };
    this._refreshEyeIcons();

    // Drawer
    $('#menuBtn').onclick = () => {
      haptic('light');
      $('#drawer').classList.add('open');
      this._renderDrawerBadges();
      // Update fade indicators sau khi drawer hiển thị (cần đợi layout)
      requestAnimationFrame(() => this._updateDrawerOverflowHints());
    };
    $('#drawerOverlay').onclick = () => $('#drawer').classList.remove('open');
    // Bind scroll event để cập nhật fade gradient
    const drList = $('#drList');
    if (drList) drList.addEventListener('scroll', () => this._updateDrawerOverflowHints());
    window.addEventListener('resize', () => this._updateDrawerOverflowHints());
    $$('#drawer .dr-item, #drawer .dr-mini-item').forEach(el => {
      el.onclick = () => {
        const action = el.dataset.action;
        $('#drawer').classList.remove('open');
        if (action === 'sync') this.doSync();
        else if (action === 'login') this.doLogin();
        else if (action === 'logout') this.doLogout();
        else if (action === 'export') this.doExport();
        else if (action === 'import') this.doImport();
        else if (action === 'books') this.openBookList();
        else if (action === 'bookadd') this.openBookEdit(null);
        else this.switchTab(action);
      };
    });

    $('#bookAddBtn').onclick = () => this.openBookEdit(null);
    $('#bookSave').onclick = () => this.saveBook();
    $('#bookDelete').onclick = () => this.deleteBook();
    const photosOpt = () => !!$('#bookExportPhotos')?.checked;
    $('#bookExportHTML').onclick = () => {
      if (this.state.editingBook?.id) this.exportBookHTML(this.state.editingBook.id, false, photosOpt());
    };
    const exportPDFBtn = $('#bookExportPDF');
    if (exportPDFBtn) exportPDFBtn.onclick = () => {
      if (this.state.editingBook?.id) this.exportBookPDF(this.state.editingBook.id, false, photosOpt());
    };
    $('#bookExportCSV').onclick = () => {
      if (this.state.editingBook?.id) this.exportBookCSV(this.state.editingBook.id, false);
    };
    $('#bookFinalHTML').onclick = () => this.exportFinal('html');
    $('#bookFinalPDF').onclick = () => this.exportFinal('pdf');
    $('#bookFinalCSV').onclick = () => this.exportFinal('csv');
    $('#bookAddMemberBtn').onclick = () => this.addBookMember();
    $('#bookAddManyBtn').onclick = () => this.addManyMembers();
    $('#addManyOK').onclick = () => this.confirmAddMany();

    // Modal close
    $$('.modal, .lightbox').forEach(m => {
      m.querySelectorAll('[data-close]').forEach(b => {
        b.onclick = () => m.classList.remove('open');
      });
      m.onclick = e => {
        if (e.target === m) m.classList.remove('open');
      };
    });

    // Tx form
    $('#txSave').onclick = () => this.saveTx();
    $('#txDelete').onclick = () => this.deleteTx();
    $$('.tx-type-pill').forEach(el => {
      el.onclick = () => {
        $$('.tx-type-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        $('#txForm').dataset.type = el.dataset.type;
        this.applyTxTypeUI(el.dataset.type);
      };
    });
    $('#txCamera').onclick = () => this.scanReceipt();
    const micBtn = $('#txMic');
    if (micBtn) micBtn.onclick = () => this.voiceInput();

    // Fuel & Maintenance
    const fSave = $('#fuelLogSave'); if (fSave) fSave.onclick = () => this.saveFuelLog();
    const fDel = $('#fuelLogDelete'); if (fDel) fDel.onclick = () => this.deleteFuelLog();
    const mSave = $('#maintLogSave'); if (mSave) mSave.onclick = () => this.saveMaintLog();
    const mDel = $('#maintLogDelete'); if (mDel) mDel.onclick = () => this.deleteMaintLog();

    // Withdraw early
    const wConfirm = $('#withdrawConfirm');
    if (wConfirm) wConfirm.onclick = () => this.confirmWithdrawEarly();

    // Recurring
    const rSave = $('#recSave'); if (rSave) rSave.onclick = () => this.saveRecurring();
    const rDel = $('#recDelete'); if (rDel) rDel.onclick = () => this.deleteRecurring();
    const rDom = $('#recDayOfMonth'); if (rDom) rDom.onchange = () => this._recurringApplyFreqUI($('#recFrequency').value);
    const rDow = $('#recDayOfWeek'); if (rDow) rDow.onchange = () => this._recurringApplyFreqUI($('#recFrequency').value);

    // Tx filter modal
    const txfApply = $('#txFilterApply'); if (txfApply) txfApply.onclick = () => this.applyTxFilter();
    const txfReset = $('#txFilterReset'); if (txfReset) txfReset.onclick = () => this.resetTxFilter();

    // Bulk select
    const bEnter = $('#txEnterBulkBtn'); if (bEnter) bEnter.onclick = () => this._enterBulkMode();
    const bCancel = $('#txBulkCancel'); if (bCancel) bCancel.onclick = () => this._exitBulkMode();
    const bDel = $('#txBulkDelete'); if (bDel) bDel.onclick = () => this._bulkDelete();
    const bCat = $('#txBulkChangeCat'); if (bCat) bCat.onclick = () => this._bulkChangeCategory();

    // Category form
    $('#catSave').onclick = () => this.saveCat();
    $('#catDelete').onclick = () => this.deleteCat();
    $$('.cat-tab').forEach(el => {
      el.onclick = () => {
        $$('.cat-tab').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.catTab = el.dataset.type;
        this.renderCategories();
      };
    });

    // Account form
    $('#accSave').onclick = () => this.saveAcc();
    $('#accDelete').onclick = () => this.deleteAcc();
    $('#accMaturity').onclick = () => this.openMaturityModal();
    $('#maturityConfirm').onclick = () => this.confirmMaturity();
    $$('.acc-type-pill').forEach(el => {
      el.onclick = () => {
        if (this.state.editingAcc?.id) return; // Khoá khi đang sửa
        $$('.acc-type-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        if (this.state.editingAcc) {
          this.state.editingAcc.accountType = el.dataset.type;
          this.applyAccountTypeUI();
          this.recalcMaturityHint();
        }
      };
    });
    // Tự cập nhật ngày đáo hạn + hint khi đổi field
    ['accStartDate', 'accInterestRate', 'accBalance'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => this.recalcMaturityHint());
    });
    const termSel = $('#accTermMonths');
    if (termSel) termSel.onchange = () => {
      $('#accTermMonthsCustomWrap').style.display = termSel.value === 'custom' ? 'block' : 'none';
      this.recalcMaturityHint();
    };
    const termCustom = $('#accTermMonthsCustom');
    if (termCustom) termCustom.addEventListener('input', () => this.recalcMaturityHint());
    const accMatDate = $('#accMaturityDate');
    if (accMatDate) accMatDate.addEventListener('change', () => this.recalcMaturityHint());

    // Reminder form
    $('#remSave').onclick = () => this.saveReminder();
    $('#remDelete').onclick = () => this.deleteReminder();

    // ----- Budgets (Ngân sách) -----
    $('#budgetAddFab').onclick = () => this.openBudgetModal(null);
    $('#budgetSave').onclick = () => this.saveBudget();
    $('#budgetDelete').onclick = () => this.deleteBudget();
    const budgetBack = $('#budgetBack');
    if (budgetBack) budgetBack.onclick = () => {
      // Quay lại step 1
      $('#budgetStep1').style.display = 'block';
      $('#budgetStep2').style.display = 'none';
      $('#budgetSave').style.display = 'none';
      $('#budgetBack').style.display = 'none';
      if (this.state.editingBudget) this.state.editingBudget.categoryId = '';
    };

    // ----- Goals (Mục tiêu tiết kiệm) -----
    $('#goalAddFab').onclick = () => this.openGoalModal(null);
    $('#goalSave').onclick = () => this.saveGoal();
    $('#goalDelete').onclick = () => this.deleteGoal();
    $('#contribSave').onclick = () => this.saveContribution();
    // Recalc plan hint khi đổi target/start/deadline
    ['goalTarget', 'goalStart', 'goalDeadline'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => this.recalcGoalPlanHint());
    });

    // ----- Loans (Cho vay / Nợ) -----
    $('#loanAddFab').onclick = () => this.openLoanModal(null);
    $('#loanSave').onclick = () => this.saveLoan();
    $('#loanDelete').onclick = () => this.deleteLoan();
    $('#loanAddPaymentBtn').onclick = () => this.openPaymentModal();
    $('#loanCloseBtn').onclick = () => this.toggleLoanClosed();
    $('#paymentSave').onclick = () => this.savePayment();

    $$('.loan-tab').forEach(el => {
      el.onclick = () => {
        $$('.loan-tab').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.loanTab = el.dataset.type;
        this.renderLoans();
      };
    });
    $$('.loan-status-pill').forEach(el => {
      el.onclick = () => {
        $$('.loan-status-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.loanStatusFilter = el.dataset.status;
        this.renderLoans();
      };
    });
    $$('.loan-type-pill').forEach(el => {
      el.onclick = () => {
        // Chỉ cho đổi loại khi tạo MỚI (chưa có id)
        if (this.state.editingLoan?.id) return;
        $$('.loan-type-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        if (this.state.editingLoan) this.state.editingLoan.type = el.dataset.type;
      };
    });

    // Period switchers (chart)
    $$('.period-pill').forEach(el => {
      el.onclick = () => {
        $$('.period-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.chartPeriod = el.dataset.period;
        const rangeRow = $('#chartRangeRow');
        if (this.state.chartPeriod === 'custom') {
          // Mặc định lần đầu: tháng này → hôm nay
          if (!this.state.chartFrom || !this.state.chartTo) {
            const now = new Date();
            this.state.chartFrom = now.toISOString().slice(0, 7) + '-01';
            this.state.chartTo = today();
          }
          $('#chartFrom').value = this.state.chartFrom;
          $('#chartTo').value = this.state.chartTo;
          rangeRow.style.display = 'flex';
        } else {
          rangeRow.style.display = 'none';
        }
        this.renderCharts();
      };
    });

    // Date range inputs (chart custom)
    const fromIn = $('#chartFrom');
    const toIn = $('#chartTo');
    if (fromIn) fromIn.onchange = () => {
      this.state.chartFrom = fromIn.value;
      if (this.state.chartFrom > this.state.chartTo) this.state.chartTo = this.state.chartFrom;
      toIn.value = this.state.chartTo;
      this.renderCharts();
    };
    if (toIn) toIn.onchange = () => {
      this.state.chartTo = toIn.value;
      if (this.state.chartTo < this.state.chartFrom) this.state.chartFrom = this.state.chartTo;
      fromIn.value = this.state.chartFrom;
      this.renderCharts();
    };

    // Modal: đóng category-tx modal
    const catTxClose = $('#catTxClose');
    if (catTxClose) catTxClose.onclick = () => $('#catTxModal').classList.remove('open');
  },

  // Hash chuỗi email → 6 chữ hex màu (cùng email luôn ra cùng màu)
  _avatarBgColor(seed) {
    const colors = ['2d6a4f', '52b788', '1e6091', '4a90c2', 'c45934', 'e88c5f', '6b4d8b', '9c7ab9'];
    let h = 0;
    const s = String(seed || '');
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return colors[Math.abs(h) % colors.length];
  },

  // Tạo avatar SVG fallback: chữ cái đầu trên màu hash từ email
  _letterAvatarDataUrl(name, email) {
    const letter = (name || email || '?').trim().charAt(0).toUpperCase();
    const bg = this._avatarBgColor(email);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%23${bg}'/><text x='50' y='62' text-anchor='middle' fill='white' font-size='42' font-weight='700' font-family='DM Sans,sans-serif'>${encodeURIComponent(letter)}</text></svg>`;
    return 'data:image/svg+xml,' + svg;
  },

  renderAuthUI() {
    const u = window.QLT_Auth.user;
    const avatarEl = $('#drUserAvatar');
    if (u) {
      $('#drUserName').textContent = u.name || u.email;
      $('#drUserEmail').textContent = u.email;
      if (u.picture) {
        // Google profile URL có thể fail load → thử nhiều variants trước khi fallback letter
        // Variants:
        //  1. URL gốc
        //  2. Đổi size về s200-c (tương thích nhiều)
        //  3. Bỏ size suffix
        const tryUrls = [u.picture];
        const m = u.picture.match(/^(.+)=s\d+-c$/);
        if (m) {
          tryUrls.push(m[1] + '=s200-c');
          tryUrls.push(m[1]);
        }
        let attempt = 0;
        const tryNext = () => {
          if (attempt < tryUrls.length) {
            avatarEl.src = tryUrls[attempt++];
          } else {
            // Hết variants → letter avatar
            avatarEl.onerror = null;
            avatarEl.src = this._letterAvatarDataUrl(u.name, u.email);
          }
        };
        avatarEl.onerror = tryNext;
        tryNext();
      } else {
        // Không có URL → letter avatar luôn
        avatarEl.onerror = null;
        avatarEl.src = this._letterAvatarDataUrl(u.name, u.email);
      }
      $('#loginItem').style.display = 'none';
      $('#logoutItem').style.display = 'flex';
      $('#syncItem').style.display = 'flex';
    } else {
      $('#drUserName').textContent = 'Khách';
      $('#drUserEmail').textContent = 'Chưa đăng nhập';
      avatarEl.onerror = null;
      avatarEl.src = 'icons/icon-192.png';
      $('#loginItem').style.display = 'flex';
      $('#logoutItem').style.display = 'none';
      $('#syncItem').style.display = 'none';
    }
  },

  renderBookHeader() {
    const b = this.currentBook();
    if (!b) return;
    $('#topbarBookLabel').textContent = b.name;
    this.applyBookTheme(b.color);
    this.renderDrawerBooks();
  },

  // Phủ màu sổ hiện tại lên topbar / balance hero / drawer / account summary
  // → Anh nhìn cái biết đang ở sổ nào, đỡ nhầm giữa các sổ
  applyBookTheme(color) {
    const c = color || '#2d6a4f';
    const lighter = this.lightenHex(c, 0.4);
    const root = document.documentElement.style;
    root.setProperty('--book-accent', c);
    root.setProperty('--book-accent-light', lighter);
  },

  lightenHex(hex, amount) {
    const s = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(s)) return hex;
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    const mix = (v) => Math.round(v + (255 - v) * amount);
    return '#' + [mix(r), mix(g), mix(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  },

  // Compute badge counts cho drawer items dựa trên state
  _computeDrawerBadges() {
    const counts = {};
    const todayStr = today();
    const ym = todayStr.slice(0, 7);

    // 💎 Sổ tiết kiệm: đáo hạn ≤7 ngày hoặc quá hạn
    let savBadge = 0;
    for (const a of (this.state.accounts || [])) {
      if (!this.isActiveSavings(a) || !a.maturityDate) continue;
      const days = Math.ceil((new Date(a.maturityDate) - new Date(todayStr)) / 86400000);
      if (days <= 7) savBadge++;
    }
    if (savBadge > 0) counts.savings = savBadge;

    // 🎯 Ngân sách: số budget vượt ≥80%
    let budBadge = 0;
    for (const b of (this.state.budgets || [])) {
      if (!b.amount || b.amount <= 0) continue;
      const spent = (this.state.transactions || [])
        .filter(t => t.type === 'expense' && t.date.startsWith(ym) && t.categoryId === b.categoryId)
        .reduce((s, t) => s + t.amount, 0);
      if (spent / b.amount >= 0.8) budBadge++;
    }
    if (budBadge > 0) counts.budgets = budBadge;

    // 🏆 Mục tiêu: số goal behind/overdue
    let goalBadge = 0;
    for (const g of (this.state.goals || [])) {
      if (g.status === 'cancelled') continue;
      if ((this.goalContributed?.(g) || 0) >= (g.targetAmount || 0)) continue;
      const st = this.goalStatus?.(g);
      if (st === 'behind' || st === 'overdue') goalBadge++;
    }
    if (goalBadge > 0) counts.goals = goalBadge;

    // 🤝 Khoản vay: quá hạn
    let loanBadge = 0;
    for (const l of (this.state.loans || [])) {
      if (l.status === 'closed') continue;
      if (l.dueDate && l.dueDate <= todayStr && (this.loanRemaining?.(l) || 0) > 0) loanBadge++;
    }
    if (loanBadge > 0) counts.loans = loanBadge;

    // 🔔 Nhắc nhở: hôm nay
    let remBadge = 0;
    for (const r of (this.state.reminders || [])) {
      if (r.date === todayStr) remBadge++;
    }
    if (remBadge > 0) counts.reminders = remBadge;

    return counts;
  },

  // Render badge dots vào drawer items
  _renderDrawerBadges() {
    // Xoá badges cũ
    document.querySelectorAll('#drawer .dr-badge').forEach(el => el.remove());
    const counts = this._computeDrawerBadges();
    Object.entries(counts).forEach(([action, count]) => {
      if (count <= 0) return;
      const item = document.querySelector(`#drawer .dr-item[data-action="${action}"]`);
      if (!item) return;
      const badge = document.createElement('span');
      badge.className = 'dr-badge';
      badge.style.marginLeft = 'auto';
      badge.textContent = count > 99 ? '99+' : String(count);
      item.appendChild(badge);
    });
  },

  renderDrawerBooks() {
    const wrap = $('#drBooksList');
    if (!wrap) return;
    const cur = this.state.currentBookId;
    const sortedBooks = this.state.books.slice().sort(sortByOrder);
    wrap.innerHTML = sortedBooks.map(b => `
      <div class="dr-book-row ${b.id === cur ? 'on' : ''}" data-book="${b.id}">
        <span class="dr-book-row-icon" style="background:${b.color || '#52b788'}">${svgIcon(b.icon || 'wallet')}</span>
        <span class="dr-book-row-name">${this.escapeHtml(b.name)}</span>
        ${b.id === cur ? `<span class="dr-book-row-check">${svgIcon('check')}</span>` : ''}
      </div>
    `).join('');
    wrap.querySelectorAll('[data-book]').forEach(el => {
      el.onclick = async () => {
        $('#drawer').classList.remove('open');
        const id = el.dataset.book;
        if (id !== this.state.currentBookId) {
          await this.switchBook(id);
        }
      };
    });
  },

  render() {
    this.renderAuthUI();
    this.renderBookHeader();
  },

  // Undo toast — hiện thông báo "Đã xoá. Hoàn tác?" trong 5s
  // onUndo: function chạy khi user bấm hoàn tác (phải tự khôi phục data)
  showUndoToast(message, onUndo, durationMs = 5000) {
    const wrap = document.getElementById('qltToastWrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'qlt-toast undo-toast';
    el.style.cssText = 'background:var(--text);color:var(--bg);display:flex;align-items:center;gap:14px';
    el.innerHTML = `
      <span style="flex:1">${this.escapeHtml(message)}</span>
      <button style="background:transparent;color:#f4b942;border:none;font-weight:700;font-size:13px;cursor:pointer;padding:4px 10px">HOÀN TÁC</button>
    `;
    wrap.appendChild(el);
    let undone = false;
    const btn = el.querySelector('button');
    btn.onclick = async () => {
      if (undone) return;
      undone = true;
      try { await onUndo(); } catch (e) { console.warn('Undo lỗi:', e); }
      el.remove();
    };
    setTimeout(() => {
      if (!undone) { el.classList.add('fade'); setTimeout(() => el.remove(), 260); }
    }, durationMs);
  },

  // Helper: skeleton placeholder cho list rows (dùng khi đang load)
  skeletonRows(n = 5) {
    let html = '';
    for (let i = 0; i < n; i++) {
      html += `
        <div class="skel-row">
          <div class="skeleton skel-circle"></div>
          <div class="skel-flex">
            <div class="skeleton skel-line short"></div>
            <div class="skeleton skel-line tiny"></div>
          </div>
          <div class="skeleton skel-amt"></div>
        </div>
      `;
    }
    return html;
  },

  // Helper: build markup cho empty state đẹp (icon + title + desc + CTA)
  emptyState({ icon = '📭', title = 'Chưa có gì', desc = '', ctaLabel = '', ctaAction = null }) {
    const ctaHtml = ctaLabel
      ? `<button class="empty-state-cta" data-empty-cta="1">${this.escapeHtml(ctaLabel)}</button>`
      : '';
    return `
      <div class="empty-state">
        <div class="empty-state-illu">
          <div class="empty-state-icon">${icon}</div>
        </div>
        <div class="empty-state-title">${this.escapeHtml(title)}</div>
        ${desc ? `<div class="empty-state-desc">${desc}</div>` : ''}
        ${ctaHtml}
      </div>
    `;
  },
  // Bind CTA action sau khi render empty state
  bindEmptyCTA(parentEl, action) {
    if (!parentEl || !action) return;
    const btn = parentEl.querySelector('[data-empty-cta]');
    if (btn) btn.onclick = action;
  },

  // Cập nhật fade gradient mép trên/dưới của drawer list để báo hiệu nội dung scroll
  _updateDrawerOverflowHints() {
    const list = document.getElementById('drList');
    const wrap = document.getElementById('drListWrap');
    if (!list || !wrap) return;
    const hasTop = list.scrollTop > 4;
    const hasBottom = list.scrollTop + list.clientHeight < list.scrollHeight - 4;
    wrap.classList.toggle('has-top-overflow', hasTop);
    wrap.classList.toggle('has-bottom-overflow', hasBottom);
  },

  switchTab(name) {
    this.state.currentTab = name;
    $$('.screen').forEach(s => s.classList.remove('active'));
    const screen = $('#screen-' + name);
    if (screen) screen.classList.add('active');
    $$('.ni').forEach(el => el.classList.toggle('active', el.dataset.tab === name));

    if (name === 'home') this.renderHome();
    else if (name === 'accounts') this.renderAccounts();
    else if (name === 'charts') this.renderCharts();
    else if (name === 'categories') this.renderCategories();
    else if (name === 'transactions') this.renderTransactions();
    else if (name === 'reminders') this.renderReminders();
    else if (name === 'settings') this.renderSettings();
    else if (name === 'loans') this.renderLoans();
    else if (name === 'budgets') this.renderBudgets();
    else if (name === 'goals') this.renderGoals();
    else if (name === 'fuel') this.renderFuel();
    else if (name === 'savings') this.renderSavings();
    else if (name === 'recurring') this.renderRecurring();
    else if (name === 'photos') this.renderPhotoGallery();
    else if (name === 'fluctuation') this.renderFluctuation();
  },

  // ============ HOME ============
  // Phân biệt 'payment' (tiền dùng được) và 'savings' (sổ tiết kiệm — locked)
  isSavings(acc) { return (acc?.accountType || 'payment') === 'savings'; },
  isPayment(acc) { return (acc?.accountType || 'payment') === 'payment'; },

  // Helper: tx là thu/chi THẬT (không phải Điều chỉnh số dư)
  // Điều chỉnh số dư = giao dịch hệ thống tạo khi user dùng nút "⚖️" để fix sai lệch
  // → KHÔNG nên tính vào "Thu nhập" / "Chi tiêu" tháng (gây hiểu nhầm)
  isRealIncome(t) { return t && t.type === 'income' && !t._adjustment; },
  isRealExpense(t) { return t && t.type === 'expense' && !t._adjustment; },
  // Sổ tiết kiệm "đang hoạt động" (chưa đóng/đáo hạn/rút trước hạn)
  isActiveSavings(acc) { return this.isSavings(acc) && !acc.savingsClosed; },
  isClosedSavings(acc) { return this.isSavings(acc) && !!acc.savingsClosed; },

  // Lãi tích luỹ TỚI HÔM NAY (tuyến tính: gốc × rate% × ngày_đã_trôi / 365)
  // Note: ngân hàng thực tế thường tính theo tháng đầy đủ + lãi suất phạt nếu rút trước hạn,
  // nhưng đây là ước tính nhanh để user hình dung "rút bây giờ tôi có khoảng X".
  savingsAccrued(acc) {
    if (!this.isSavings(acc)) return 0;
    const rate = parseFloat(acc.interestRate) || 0;
    const principal = Number(acc.balance) || 0;
    if (rate <= 0 || principal <= 0 || !acc.startDate) return 0;
    const start = new Date(acc.startDate + 'T00:00:00').getTime();
    const end = acc.savingsClosed && acc.savingsClosedDate
      ? new Date(acc.savingsClosedDate + 'T00:00:00').getTime()
      : Date.now();
    const days = Math.max(0, Math.floor((end - start) / 86400000));
    return Math.round(principal * (rate / 100) * (days / 365));
  },

  // % thời gian đã trôi qua từ startDate tới maturityDate
  savingsTimeProgress(acc) {
    if (!acc?.startDate || !acc?.maturityDate) return 0;
    const start = new Date(acc.startDate + 'T00:00:00').getTime();
    const end = new Date(acc.maturityDate + 'T00:00:00').getTime();
    if (end <= start) return 100;
    const now = Date.now();
    const pct = (now - start) / (end - start) * 100;
    return Math.max(0, Math.min(100, pct));
  },

  // Lãi DỰ KIẾN khi đáo hạn = gốc × rate × termMonths/12 (theo lãi suất công bố)
  savingsExpectedInterest(acc) {
    if (!this.isSavings(acc)) return 0;
    const rate = parseFloat(acc.interestRate) || 0;
    const principal = Number(acc.balance) || 0;
    const months = parseInt(acc.termMonths, 10) || 0;
    return Math.round(principal * (rate / 100) * (months / 12));
  },

  // Cài đặt hiển thị widget trên Trang chủ — lưu trong localStorage (preference UI)
  getHomeWidgetPrefs() {
    try {
      const raw = localStorage.getItem('qlt_home_widgets');
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (_) { return {}; }
  },
  setHomeWidgetPref(key, val) {
    const cur = this.getHomeWidgetPrefs();
    cur[key] = !!val;
    localStorage.setItem('qlt_home_widgets', JSON.stringify(cur));
  },
  // Default ON nếu chưa set
  isHomeWidgetOn(key) {
    const p = this.getHomeWidgetPrefs();
    return p[key] !== false;
  },

  renderHome() {
    // Áp dụng prefs widget — ẩn cả wrapper data-home-widget tương ứng
    document.querySelectorAll('[data-home-widget]').forEach(el => {
      el.style.display = this.isHomeWidgetOn(el.dataset.homeWidget) ? '' : 'none';
    });

    // Update banner — async, không block render
    this.renderHomeUpdateBanner();
    // AI chat FAB — chỉ hiện khi đã setup API key
    this.renderAiChatFab();

    // Tổng số dư = CHỈ tính ví thanh toán (tiền dùng được)
    const paymentAccs = this.state.accounts.filter(a => this.isPayment(a));
    const savingsAccs = this.state.accounts.filter(a => this.isActiveSavings(a));
    const totalBalance = paymentAccs.reduce((s, a) => s + (a.balance || 0), 0);
    const totalSavings = savingsAccs.reduce((s, a) => s + (a.balance || 0), 0);
    if (isAmountHidden()) {
      $('#homeBalance').textContent = fmtBal(totalBalance);
      $('#homeBalance').classList.add('amount-hidden');
      $('#homeBalance').dataset._lastValue = String(totalBalance);
    } else {
      $('#homeBalance').classList.remove('amount-hidden');
      animateNumber($('#homeBalance'), totalBalance);
    }

    // Hint sổ tiết kiệm dưới hero
    const savingsLink = $('#homeSavingsLink');
    if (savingsLink) {
      if (totalSavings > 0) {
        savingsLink.style.display = 'inline-flex';
        savingsLink.innerHTML = `+ ${fmtBal(totalSavings).replace(' đ', '')} đ trong tiết kiệm <span style="font-size:14px">→</span>`;
      } else {
        savingsLink.style.display = 'none';
      }
    }

    // Tổng thu/chi tháng hiện tại + thay đổi số dư từng ví trong tháng
    const now = new Date();
    const ym = now.toISOString().slice(0, 7);
    let inc = 0, exp = 0;
    const accChange = {};
    for (const a of this.state.accounts) accChange[a.id] = 0;
    for (const t of this.state.transactions) {
      if (!t.date.startsWith(ym)) continue;
      // BỎ giao dịch _adjustment (Điều chỉnh số dư) khỏi CẢ tổng Thu/Chi
      // VÀ accChange (thay đổi từng ví trong tháng).
      // Lý do: user dùng nút "⚖️ Điều chỉnh" để fix sai lệch / set initial,
      // không phải cash flow thật. Nếu cộng vào sẽ inflate cả Thu nhập tháng
      // VÀ chỉ báo "↑ N đ" trên ví → gây nhầm lẫn.
      if (t._adjustment) continue;
      if (t.type === 'income') {
        inc += t.amount;
        accChange[t.accountId] = (accChange[t.accountId] || 0) + t.amount;
      } else if (t.type === 'expense') {
        exp += t.amount;
        accChange[t.accountId] = (accChange[t.accountId] || 0) - t.amount;
      } else if (t.type === 'transfer') {
        accChange[t.accountId] = (accChange[t.accountId] || 0) - t.amount;
        accChange[t.toAccountId] = (accChange[t.toAccountId] || 0) + t.amount;
      }
    }
    $('#homeIncome').textContent = fmtBal(inc);
    $('#homeExpense').textContent = fmtBal(exp);
    // Streak badge (nếu ≥3 ngày liên tiếp)
    const streak = this.computeStreak();
    const streakHtml = streak >= 3 ? `<span class="streak-badge">🔥 ${streak} ngày liên tiếp</span>` : '';
    $('#homeMonth').innerHTML = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}${streakHtml}`;

    // ----- Số dư từng ví (CHỈ payment) -----
    const walletEl = $('#homeWallets');
    const accs = paymentAccs;
    if (!accs.length) {
      walletEl.innerHTML = this.emptyState({
        icon: '💼', title: 'Chưa có ví nào',
        desc: 'Tạo ví để bắt đầu theo dõi thu chi.',
        ctaLabel: '+ Thêm ví đầu tiên'
      });
      this.bindEmptyCTA(walletEl, () => this.switchTab('accounts'));
    } else {
      // % của từng ví so với ví số dư lớn nhất → mini bar
      const maxBal = Math.max(1, ...accs.map(a => Math.abs(a.balance || 0)));
      walletEl.innerHTML = accs.map(a => {
        const bal = a.balance || 0;
        const change = accChange[a.id] || 0;
        const pct = Math.min(100, Math.round(Math.abs(bal) / maxBal * 100));
        const accentColor = a.color || '#2d6a4f';
        let changeHtml = '';
        if (change !== 0) {
          const cls = change > 0 ? 'pos' : 'neg';
          const arrow = change > 0 ? '↑' : '↓';
          changeHtml = `<div class="wallet-change ${cls}">${arrow} ${fmtBal(Math.abs(change))}</div>`;
        } else {
          changeHtml = `<div class="wallet-change zero">— Không đổi</div>`;
        }
        return `
          <div class="wallet-row" data-acc="${a.id}">
            <div class="wallet-icon" style="background:${accentColor}1a;color:${accentColor}">
              ${svgIcon(a.icon || 'wallet')}
            </div>
            <div class="wallet-info">
              <div class="wallet-name">${this.escapeHtml(a.name)}</div>
              <div class="wallet-bar"><div class="wallet-bar-fill" style="width:${pct}%;background:${accentColor}"></div></div>
            </div>
            <div class="wallet-amounts">
              <div class="wallet-bal">${fmtBal(bal)}</div>
              ${changeHtml}
            </div>
          </div>
        `;
      }).join('');
      // Bấm vào ví → sang trang Giao dịch lọc theo ví đó
      walletEl.querySelectorAll('[data-acc]').forEach(el => {
        el.onclick = () => {
          this.state.txAccountFilter = el.dataset.acc;
          this.switchTab('transactions');
        };
      });
    }

    // ----- Sổ tiết kiệm / Tài sản dài hạn -----
    this.renderHomeSavings(totalBalance, totalSavings);

    // ----- Mục tiêu tiết kiệm -----
    this.renderHomeGoals();

    // ----- Forecast cuối tháng -----
    this.renderHomeForecast();

    // ----- Smart insights -----
    this.renderHomeInsights();

    // ----- Budget widget -----
    this.renderHomeBudgets();

    // ----- Loan shortcut card -----
    this.renderHomeLoanShortcut();

    // ----- Giao dịch gần nhất -----
    const recent = [...this.state.transactions]
      .sort((a, b) => (b.date + b._updatedAt).localeCompare(a.date + a._updatedAt))
      .slice(0, 8);
    const recentEl = $('#homeRecent');
    if (recent.length === 0) {
      recentEl.innerHTML = this.emptyState({
        icon: '📋', title: 'Chưa có giao dịch nào',
        desc: 'Bấm dấu <strong>+</strong> ở dưới để thêm thu/chi đầu tiên.'
      });
    } else {
      recentEl.innerHTML = recent.map(t => this.renderTxItem(t)).join('');
      recentEl.querySelectorAll('[data-tx]').forEach(el => {
        el.onclick = (e) => {
          const lb = e.target.closest('[data-tx-loc]');
          if (lb) { e.stopPropagation(); this.openTxLocation(lb.dataset.txLoc); return; }
          this.openTxModal(el.dataset.tx);
        };
      });
    }
  },

  renderTxItem(t) {
    const acc = this.state.accounts.find(a => a.id === t.accountId) || {};
    const photoCount = this.getTxPhotos(t).length;
    const photoBadge = photoCount > 0
      ? `<span class="tx-photo-badge" title="${photoCount} ảnh minh chứng">${svgIcon('camera')}${photoCount > 1 ? `<span class="tx-photo-count">${photoCount}</span>` : ''}</span>`
      : '';

    if (t.type === 'transfer') {
      const toAcc = this.state.accounts.find(a => a.id === t.toAccountId) || {};
      return `
        <div class="tx-item" data-tx="${t.id}">
          <div class="tx-icon" style="background:#4f86c61a;color:#4f86c6">
            ${svgIcon('refresh')}
          </div>
          <div class="tx-info">
            <div class="tx-cat">Chuyển tiền ${photoBadge}</div>
            <div class="tx-meta">${this.formatDate(t.date)} · ${this.escapeHtml(acc.name || '')} → ${this.escapeHtml(toAcc.name || '')} ${t.note ? '· ' + this.escapeHtml(t.note) : ''}</div>
          </div>
          <div class="tx-amount" style="color:#4f86c6">${fmt(t.amount)}</div>
        </div>
      `;
    }

    const cat = this.state.categories.find(c => c.id === t.categoryId) || {};
    const sign = t.type === 'income' ? '+' : '-';
    const colorClass = t.type === 'income' ? 'amount-pos' : 'amount-neg';
    const tagsHtml = (Array.isArray(t.tags) && t.tags.length > 0)
      ? ' ' + t.tags.slice(0, 3).map(tg => `<span class="tx-tag-display">${this.escapeHtml(tg)}</span>`).join('')
      : '';
    const locHtml = t.location?.address
      ? ` <span class="tx-loc-badge" data-tx-loc="${t.id}" title="${this.escapeHtml(t.location.fullAddress || t.location.address)}">📍 ${this.escapeHtml(t.location.address)}</span>`
      : '';
    return `
      <div class="tx-item" data-tx="${t.id}">
        <div class="tx-icon" style="background:${cat.color || '#888'}1a;color:${cat.color || '#888'}">
          ${svgIcon(cat.icon || 'other')}
        </div>
        <div class="tx-info">
          <div class="tx-cat">${cat.name || 'Không rõ'} ${photoBadge}${tagsHtml}</div>
          <div class="tx-meta">${this.formatDate(t.date)} · ${acc.name || ''} ${t.note ? '· ' + this.escapeHtml(t.note) : ''}${locHtml}</div>
        </div>
        <div class="tx-amount ${colorClass}">${sign}${fmt(t.amount)}</div>
      </div>
    `;
  },

  // Mở Google Maps native với toạ độ tx
  openTxLocation(txId) {
    const tx = this.state.transactions.find(x => x.id === txId);
    if (!tx?.location) return;
    const { lat, lng } = tx.location;
    const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    window.open(url, '_blank');
  },

  formatDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  },

  escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  // ============ ACCOUNTS ============
  // Helper: Bind SortableJS lên container. opts.collect(container) trả ID array theo thứ tự mới.
  async _initSortable(container, store, opts = {}) {
    if (!container) return;
    try { await loadSortable(); } catch (_) { return; }
    const existing = window.Sortable.get(container);
    if (existing) existing.destroy();
    window.Sortable.create(container, {
      delay: 400,
      delayOnTouchOnly: true,
      animation: 180,
      ghostClass: 'qlt-sort-ghost',
      chosenClass: 'qlt-sort-chosen',
      dragClass: 'qlt-sort-drag',
      filter: opts.filter || '',
      preventOnFilter: true,
      onEnd: async () => {
        const ids = (opts.collect ? opts.collect(container) : []).filter(Boolean);
        if (!ids.length) return;
        let changed = 0;
        for (let i = 0; i < ids.length; i++) {
          const rec = await window.QLT_Store.get(store, ids[i]);
          if (!rec) continue;
          if (rec.order !== i) {
            rec.order = i;
            rec._updatedAt = new Date().toISOString();
            await window.QLT_Store.put(store, rec);
            changed++;
          }
        }
        if (!changed) return;
        await this.reload();
        // Re-render đúng tab hiện tại
        if (opts.afterReorder) opts.afterReorder.call(this);
        this.autoSync();
        QLT_UI.toast('Đã lưu thứ tự mới', { type: 'success', duration: 1400 });
      }
    });
  },

  renderAccounts() {
    const payAccs = this.state.accounts.filter(a => this.isPayment(a)).sort(sortByOrder);
    const savAccs = this.state.accounts.filter(a => this.isActiveSavings(a)).sort(sortByOrder);
    const totalPay = payAccs.reduce((s, a) => s + (a.balance || 0), 0);
    const totalSav = savAccs.reduce((s, a) => s + (a.balance || 0), 0);
    if (isAmountHidden()) {
      $('#accTotalBalance').textContent = fmtBal(totalPay + totalSav);
      $('#accTotalBalance').classList.add('amount-hidden');
      $('#accTotalBalance').dataset._lastValue = String(totalPay + totalSav);
    } else {
      $('#accTotalBalance').classList.remove('amount-hidden');
      animateNumber($('#accTotalBalance'), totalPay + totalSav);
    }

    const list = $('#accList');
    if (this.state.accounts.length === 0) {
      list.innerHTML = this.emptyState({
        icon: '💼', title: 'Chưa có tài khoản',
        desc: 'Thêm ví thanh toán hoặc sổ tiết kiệm để quản lý.',
        ctaLabel: '+ Thêm tài khoản'
      });
      this.bindEmptyCTA(list, () => this.openAccModal(null));
      $('#accAddBtn').onclick = () => this.openAccModal(null);
      return;
    }

    const renderAcc = (a) => {
      const meta = this.isSavings(a)
        ? `${a.interestRate || 0}%/năm · ${a.termMonths || 0} tháng${a.maturityDate ? ' · đáo hạn ' + this.formatDate(a.maturityDate) : ''}`
        : (a.currency || 'VND');
      return `
        <div class="acc-item" data-acc="${a.id}">
          <div class="tx-icon" style="background:#2d6a4f1a;color:#2d6a4f">${svgIcon(a.icon || (this.isSavings(a) ? 'emoji:💎' : 'cash'))}</div>
          <div class="tx-info">
            <div class="tx-cat">${this.escapeHtml(a.name)}</div>
            <div class="tx-meta">${this.escapeHtml(meta)}</div>
          </div>
          <div class="tx-amount ${(a.balance || 0) < 0 ? 'amount-neg' : ''}">${fmtBal(a.balance)}</div>
        </div>
      `;
    };

    let html = '';
    if (payAccs.length) {
      html += `<div class="sec-label" style="padding:14px 16px 6px">💳 Tiền dùng được — ${fmtBal(totalPay)} <span style="color:var(--text3);font-weight:400;font-size:11px">· giữ để kéo</span></div>`;
      html += `<div id="accListPay">${payAccs.map(renderAcc).join('')}</div>`;
    }
    if (savAccs.length) {
      html += `<div class="sec-label" style="padding:14px 16px 6px">💎 Sổ tiết kiệm — ${fmtBal(totalSav)} <span style="color:var(--text3);font-weight:400;font-size:11px">· giữ để kéo</span></div>`;
      html += `<div id="accListSav">${savAccs.map(renderAcc).join('')}</div>`;
    }
    list.innerHTML = html;
    list.querySelectorAll('[data-acc]').forEach(el => {
      el.onclick = () => this.openAccModal(el.dataset.acc);
    });

    $('#accAddBtn').onclick = () => this.openAccModal(null);

    // Wire sortable cho 2 section riêng
    const collectAccIds = c => Array.from(c.children).map(el => el.dataset.acc).filter(Boolean);
    this._initSortable($('#accListPay'), 'accounts', {
      collect: collectAccIds,
      afterReorder: function () { this.renderAccounts(); }
    });
    this._initSortable($('#accListSav'), 'accounts', {
      collect: collectAccIds,
      afterReorder: function () { this.renderAccounts(); }
    });
  },

  // ============ CATEGORIES ============
  renderCategories() {
    // Đồng bộ tab UI với state để tránh lệch (HTML default vs state)
    document.querySelectorAll('.cat-tab').forEach(el => {
      el.classList.toggle('on', el.dataset.type === this.state.catTab);
    });
    const cats = this.state.categories.filter(c => c.type === this.state.catTab);
    const parents = cats.filter(c => !c.parentId).sort(sortByOrder);
    const childrenByParent = {};
    for (const c of cats) {
      if (c.parentId) {
        (childrenByParent[c.parentId] = childrenByParent[c.parentId] || []).push(c);
      }
    }
    // Sort children theo order trong từng parent
    Object.keys(childrenByParent).forEach(pid => {
      childrenByParent[pid].sort(sortByOrder);
    });
    // Mồ côi: có parentId nhưng parent không tồn tại (vd cha bị xoá ở máy khác qua sync) → coi như top-level
    const orphans = cats.filter(c => c.parentId && !cats.find(x => x.id === c.parentId)).sort(sortByOrder);

    if (!this.state.expandedCats) this.state.expandedCats = new Set();
    const expanded = this.state.expandedCats;

    const grid = $('#catGrid');

    const renderLeaf = (c, isChild = false) => `
      <div class="cat-item ${isChild ? 'cat-child' : ''}" data-cat="${c.id}">
        <div class="cat-circle" style="background:${c.color}">${svgIcon(c.icon)}</div>
        <div class="cat-name">${this.escapeHtml(c.name)}</div>
      </div>
    `;

    let html = '';
    [...parents, ...orphans].forEach(p => {
      const children = childrenByParent[p.id] || [];
      if (children.length === 0) {
        // Cha không có con → tap mở edit như danh mục thường
        html += renderLeaf(p);
        return;
      }
      const isExpanded = expanded.has(p.id);
      // Cha có con → tap thẻ để mở/đóng; nút ✏️ riêng để sửa cha
      html += `
        <div class="cat-item cat-parent ${isExpanded ? 'expanded' : ''}" data-cat-toggle="${p.id}">
          <button class="cat-edit-btn" data-cat-edit="${p.id}" title="Sửa danh mục cha">✏️</button>
          <div class="cat-circle" style="background:${p.color}">
            ${svgIcon(p.icon)}
            <span class="cat-children-badge">${children.length}</span>
          </div>
          <div class="cat-name">${this.escapeHtml(p.name)} ${isExpanded ? '▾' : '▸'}</div>
        </div>
      `;
      // Chỉ render con khi cha đang mở
      if (isExpanded) {
        children.forEach(ch => { html += renderLeaf(ch, true); });
      }
    });

    html += `
      <div class="cat-item" data-cat="new">
        <div class="cat-circle" style="background:#f4b942">${svgIcon('add')}</div>
        <div class="cat-name">Tạo</div>
      </div>
    `;

    grid.innerHTML = html;

    // Tap thẻ cha → toggle mở/đóng (không đụng vào nút ✏️)
    grid.querySelectorAll('[data-cat-toggle]').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('[data-cat-edit]')) return;
        const id = el.dataset.catToggle;
        if (expanded.has(id)) expanded.delete(id);
        else expanded.add(id);
        this.renderCategories();
      };
    });
    // Nút ✏️ trên thẻ cha → mở edit
    grid.querySelectorAll('[data-cat-edit]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        this.openCatModal(el.dataset.catEdit);
      };
    });
    // Thẻ con / cha-không-con / 'Tạo' → mở edit hoặc tạo mới
    grid.querySelectorAll('[data-cat]').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.cat;
        if (id === 'new') this.openCatModal(null);
        else this.openCatModal(id);
      };
    });
    // Drag-to-reorder: chỉ top-level (parents + leaves không phải child),
    // không cho kéo thẻ "Tạo" và child. Long-press 400ms để bắt đầu kéo.
    this._initSortable(grid, 'categories', {
      filter: '.cat-child, [data-cat="new"]',
      collect: c => Array.from(c.children)
        .filter(el => !el.classList.contains('cat-child') && el.dataset.cat !== 'new')
        .map(el => el.dataset.cat || el.dataset.catToggle)
        .filter(Boolean),
      afterReorder: function () { this.renderCategories(); }
    });
  },

  // ============ TRANSACTIONS ============
  renderTransactions() {
    // Render search input — đồng bộ value với state
    const searchInput = $('#txSearch');
    if (searchInput) {
      if (searchInput.value !== this.state.txFilter.search) searchInput.value = this.state.txFilter.search || '';
      $('#txSearchClear').style.display = this.state.txFilter.search ? 'flex' : 'none';
      if (!searchInput._qltBound) {
        searchInput._qltBound = true;
        let debounce;
        searchInput.oninput = () => {
          clearTimeout(debounce);
          debounce = setTimeout(() => {
            const v = searchInput.value.trim();
            this.state.txFilter.search = v;
            if (v.length >= 2) this.saveSearchHistory(v);
            this.renderTransactions();
          }, 200);
        };
        // Hiện history khi focus + ô trống
        searchInput.onfocus = () => {
          if (!searchInput.value.trim()) this._renderSearchHistorySuggest();
        };
        searchInput.onblur = () => setTimeout(() => this._renderSearchHistorySuggest(true), 200);
        $('#txSearchClear').onclick = () => {
          searchInput.value = '';
          this.state.txFilter.search = '';
          this.renderTransactions();
        };
      }
    }

    // Render account filter row
    const accFilterRow = $('#txAccountFilterRow');
    if (accFilterRow) {
      accFilterRow.innerHTML = `
        <div class="pill tx-acc-filter ${this.state.txFilter.accountId === 'all' ? 'on' : ''}" data-acc="all">Tất cả ví</div>
      ` + this.state.accounts.map(a => `
        <div class="pill tx-acc-filter ${this.state.txFilter.accountId === a.id ? 'on' : ''}" data-acc="${a.id}">${this.escapeHtml(a.name)}</div>
      `).join('');
      accFilterRow.querySelectorAll('.tx-acc-filter').forEach(el => {
        el.onclick = () => {
          this.state.txFilter.accountId = el.dataset.acc;
          this.renderTransactions();
        };
      });
    }

    const list = $('#txList');
    let txs = [...this.state.transactions];

    const f = this.state.txFilter;
    // Filter type
    if (f.type !== 'all') txs = txs.filter(t => t.type === f.type);
    // Filter account
    if (f.accountId !== 'all') {
      const aid = f.accountId;
      txs = txs.filter(t => t.accountId === aid || t.toAccountId === aid);
    }
    // Filter category
    if (f.categoryId && f.categoryId !== 'all') {
      txs = txs.filter(t => t.categoryId === f.categoryId);
    }
    // Filter amount range
    if (f.amountMin > 0) txs = txs.filter(t => (t.amount || 0) >= f.amountMin);
    if (f.amountMax > 0) txs = txs.filter(t => (t.amount || 0) <= f.amountMax);
    // Filter photo only
    if (f.photoOnly) txs = txs.filter(t => this.getTxPhotos(t).length > 0);
    // Filter tags (OR logic — match nếu có ÍT NHẤT 1 tag)
    if (Array.isArray(f.tags) && f.tags.length > 0) {
      txs = txs.filter(t => Array.isArray(t.tags) && t.tags.some(tg => f.tags.includes(tg)));
    }
    // Filter date range
    const range = this._computeDateRange(f);
    if (range.from) txs = txs.filter(t => t.date >= range.from);
    if (range.to) txs = txs.filter(t => t.date <= range.to);
    // Search: ghi chú / tên danh mục / tên ví / số tiền / ngày
    const searchTerm = (this.state.txFilter.search || '').trim();
    if (searchTerm) {
      const norm = (s) => String(s || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
      const term = norm(searchTerm);
      const termDigits = searchTerm.replace(/\D/g, '');
      txs = txs.filter(t => {
        const cat = this.state.categories.find(c => c.id === t.categoryId);
        const acc = this.state.accounts.find(a => a.id === t.accountId);
        const toAcc = this.state.accounts.find(a => a.id === t.toAccountId);
        const haystack = norm([t.note, cat?.name, acc?.name, toAcc?.name, t.date, this.formatDate(t.date)].filter(Boolean).join(' '));
        if (haystack.includes(term)) return true;
        // Match số tiền: nếu term có chữ số, so sánh với amount
        if (termDigits && String(t.amount).includes(termDigits)) return true;
        return false;
      });
    }
    txs.sort((a, b) => (b.date + b._updatedAt).localeCompare(a.date + a._updatedAt));

    if (txs.length === 0) {
      if (searchTerm) {
        list.innerHTML = `<div class="tx-search-empty">Không có giao dịch nào khớp với <strong>"${this.escapeHtml(searchTerm)}"</strong>.<br>Thử bỏ bớt filter hoặc xoá ô tìm kiếm.</div>`;
      } else {
        list.innerHTML = this.emptyState({
          icon: '🔍', title: 'Không tìm thấy giao dịch',
          desc: 'Thử bỏ bớt bộ lọc hoặc tìm từ khoá khác.'
        });
      }
    } else {
      // Group theo ngày
      const groups = {};
      txs.forEach(t => {
        groups[t.date] = groups[t.date] || [];
        groups[t.date].push(t);
      });

      list.innerHTML = Object.keys(groups).sort().reverse().map(date => {
        const dayTxs = groups[date];
        const dayInc = dayTxs.filter(t => this.isRealIncome(t)).reduce((s, t) => s + t.amount, 0);
        const dayExp = dayTxs.filter(t => this.isRealExpense(t)).reduce((s, t) => s + t.amount, 0);
        return `
          <div class="day-header">
            <div>${this.formatDate(date)}</div>
            <div class="day-totals">
              ${dayInc > 0 ? `<span class="amount-pos">+${fmt(dayInc)}</span>` : ''}
              ${dayExp > 0 ? `<span class="amount-neg">-${fmt(dayExp)}</span>` : ''}
            </div>
          </div>
          ${dayTxs.map(t => this.renderTxItem(t)).join('')}
        `;
      }).join('');

      list.querySelectorAll('[data-tx]').forEach(el => {
        if (this.state.bulkMode) {
          el.classList.add('bulk-mode');
          if (this.state.bulkSelected.has(el.dataset.tx)) el.classList.add('selected');
          el.onclick = () => this._bulkToggle(el.dataset.tx, el);
        } else {
          el.onclick = (e) => {
            // Bấm vào badge vị trí → mở Maps, không mở edit modal
            const locBadge = e.target.closest('[data-tx-loc]');
            if (locBadge) {
              e.stopPropagation();
              this.openTxLocation(locBadge.dataset.txLoc);
              return;
            }
            this.openTxModal(el.dataset.tx);
          };
        }
      });
    }

    // Bulk bar visibility
    const bar = $('#txBulkBar');
    if (bar) {
      bar.classList.toggle('open', this.state.bulkMode);
      $('#txBulkCount').textContent = this.state.bulkSelected.size + ' đã chọn';
    }
    const enterBtn = $('#txEnterBulkBtn');
    if (enterBtn) enterBtn.style.display = this.state.bulkMode ? 'none' : 'inline-block';

    $$('#screen-transactions .tx-filter-pill').forEach(el => {
      el.onclick = () => {
        $$('#screen-transactions .tx-filter-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.txFilter.type = el.dataset.type;
        this.renderTransactions();
      };
    });
    // Bộ lọc nâng cao
    const advBtn = $('#txAdvFilterBtn');
    if (advBtn) advBtn.onclick = () => this.openTxFilterModal();
    this.renderActiveFilterChips();

    // View mode toggle: list | calendar | map
    const setViewMode = (mode) => {
      this.state.txViewMode = mode;
      $('#txList').style.display = mode === 'list' ? '' : 'none';
      $('#txCalendar').style.display = mode === 'calendar' ? 'block' : 'none';
      $('#txMap').style.display = mode === 'map' ? 'block' : 'none';
      $('#txMapEmpty').style.display = 'none';
      const btns = { list: $('#txViewList'), calendar: $('#txViewCalendar'), map: $('#txViewMap') };
      Object.entries(btns).forEach(([k, b]) => {
        if (!b) return;
        const on = k === mode;
        b.classList.toggle('on', on);
        b.style.background = on ? 'var(--accent)' : 'var(--surface)';
        b.style.color = on ? '#fff' : 'var(--text2)';
        b.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
      });
      if (mode === 'calendar') this.renderTxCalendar();
      if (mode === 'map') this.renderTxMap();
    };
    if ($('#txViewList')) $('#txViewList').onclick = () => setViewMode('list');
    if ($('#txViewCalendar')) $('#txViewCalendar').onclick = () => setViewMode('calendar');
    if ($('#txViewMap')) $('#txViewMap').onclick = () => setViewMode('map');
    setViewMode(this.state.txViewMode);
  },

  // Lazy load Leaflet (~40KB) chỉ khi user vào tab Bản đồ
  async _loadLeaflet() {
    if (window.L) return;
    await new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Không tải được Leaflet'));
      document.head.appendChild(s);
    });
  },

  async renderTxMap() {
    const mapEl = $('#txMap');
    const emptyEl = $('#txMapEmpty');
    if (!mapEl) return;

    // Lọc tx có location
    const txs = this.state.transactions.filter(t => t.location?.lat && t.location?.lng);
    if (txs.length === 0) {
      mapEl.style.display = 'none';
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = QLT_Geo.isEnabled()
        ? '🗺️ Chưa có giao dịch nào kèm vị trí.<br>Tạo GD mới sẽ tự ghi vị trí — quay lại đây xem.'
        : '🗺️ Tính năng vị trí đang TẮT.<br><a style="color:var(--accent);font-weight:600" href="#" onclick="QLT_App.switchTab(\'settings\');return false">Vào Cài đặt → Quyền riêng tư để bật</a>';
      return;
    }

    try {
      await this._loadLeaflet();
    } catch (e) {
      mapEl.style.display = 'none';
      emptyEl.style.display = 'block';
      emptyEl.innerHTML = '⚠️ Không tải được bản đồ. Cần có internet.';
      return;
    }

    // Init map (or reuse)
    if (!this._txMapObj) {
      this._txMapObj = window.L.map(mapEl).setView([16.0544, 108.2022], 12); // Đà Nẵng default
      window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
      }).addTo(this._txMapObj);
      this._txMapMarkers = [];
    } else {
      // Clear cũ
      this._txMapMarkers.forEach(m => m.remove());
      this._txMapMarkers = [];
      // Force resize sau khi display
      setTimeout(() => this._txMapObj.invalidateSize(), 100);
    }

    // Add markers
    const bounds = [];
    for (const t of txs) {
      const cat = this.state.categories.find(c => c.id === t.categoryId);
      const acc = this.state.accounts.find(a => a.id === t.accountId);
      const sign = t.type === 'income' ? '+' : '-';
      const color = t.type === 'income' ? '#2d8659' : '#e63946';
      const popup = `
        <div style="font-size:13px;line-height:1.5;min-width:160px">
          <div style="font-weight:700;color:${color}">${sign}${fmt(t.amount)} đ</div>
          <div style="color:#555">${this.escapeHtml(cat?.name || '')} · ${this.escapeHtml(acc?.name || '')}</div>
          <div style="color:#777;font-size:11px">${this.formatDate(t.date)}</div>
          ${t.note ? `<div style="margin-top:4px">${this.escapeHtml(t.note)}</div>` : ''}
          ${t.location.address ? `<div style="font-size:11px;color:#0a558c;margin-top:4px">📍 ${this.escapeHtml(t.location.address)}</div>` : ''}
        </div>
      `;
      const marker = window.L.circleMarker([t.location.lat, t.location.lng], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: color,
        fillOpacity: 0.85
      }).addTo(this._txMapObj).bindPopup(popup);
      this._txMapMarkers.push(marker);
      bounds.push([t.location.lat, t.location.lng]);
    }

    // Auto-fit bounds
    if (bounds.length === 1) {
      this._txMapObj.setView(bounds[0], 15);
    } else if (bounds.length > 1) {
      this._txMapObj.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  },

  renderTxCalendar() {
    const wrap = $('#txCalendar');
    if (!wrap) return;
    const ym = this.state.calMonth || today().slice(0, 7);
    const [year, month] = ym.split('-').map(n => parseInt(n, 10));
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startDow = firstDay.getDay(); // 0=Sun

    // Tổng theo từng ngày
    const dayMap = {}; // 'YYYY-MM-DD' → { exp, inc }
    const txInMonth = this.state.transactions.filter(t => t.date.startsWith(ym));
    for (const t of txInMonth) {
      if (!dayMap[t.date]) dayMap[t.date] = { exp: 0, inc: 0 };
      if (t.type === 'expense') dayMap[t.date].exp += t.amount;
      else if (t.type === 'income') dayMap[t.date].inc += t.amount;
    }

    let totalExp = 0, totalInc = 0;
    for (const k in dayMap) { totalExp += dayMap[k].exp; totalInc += dayMap[k].inc; }

    const monthLabels = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
      'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
    const dowLabels = ['CN','T2','T3','T4','T5','T6','T7'];
    const todayStr = today();

    let cellsHtml = '';
    // Padding ngày trống đầu
    for (let i = 0; i < startDow; i++) cellsHtml += '<div class="cal-day muted"></div>';
    // Từng ngày
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const m = dayMap[dateStr];
      const cls = ['cal-day'];
      if (dateStr === todayStr) cls.push('today');
      if (m) cls.push('has-tx');
      cellsHtml += `<div class="${cls.join(' ')}" data-cal-day="${dateStr}">
        <div class="cal-day-num">${d}</div>
        ${m && m.exp > 0 ? `<div class="cal-day-amt-exp">-${this._fmtShort(m.exp)}</div>` : ''}
        ${m && m.inc > 0 ? `<div class="cal-day-amt-inc">+${this._fmtShort(m.inc)}</div>` : ''}
      </div>`;
    }

    wrap.innerHTML = `
      <div class="cal-head">
        <button class="cal-nav" id="calPrev">‹</button>
        <div>${monthLabels[month - 1]} ${year}</div>
        <button class="cal-nav" id="calNext">›</button>
      </div>
      <div class="cal-grid">
        ${dowLabels.map(d => `<div class="cal-dow">${d}</div>`).join('')}
        ${cellsHtml}
      </div>
      <div class="cal-summary">
        Tháng ${month}: <span style="color:#2d8659;font-weight:700">+${fmt(totalInc)}</span> /
        <span style="color:#e63946;font-weight:700">-${fmt(totalExp)}</span>
      </div>
    `;
    $('#calPrev').onclick = () => {
      const d = new Date(year, month - 2, 1);
      this.state.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      this.renderTxCalendar();
    };
    $('#calNext').onclick = () => {
      const d = new Date(year, month, 1);
      this.state.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      this.renderTxCalendar();
    };
    wrap.querySelectorAll('[data-cal-day]').forEach(el => {
      el.onclick = () => {
        const d = el.dataset.calDay;
        // Switch sang list mode + filter date custom = ngày đó
        this.state.txFilter.period = 'custom';
        this.state.txFilter.dateFrom = d;
        this.state.txFilter.dateTo = d;
        this.state.txViewMode = 'list';
        this.renderTransactions();
      };
    });
  },

  // Format số ngắn cho calendar: 1.5tr / 250k / 80
  _fmtShort(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'tỷ';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'tr';
    if (n >= 1000) return Math.round(n / 1000) + 'k';
    return String(n);
  },

  // ============ CHARTS ============
  renderCharts() {
    if (!this.state.chartTab) this.state.chartTab = 'expense';
    const period = this.state.chartPeriod;

    // Sync tab pills
    document.querySelectorAll('.chart-tab').forEach(el => {
      const on = el.dataset.chartTab === this.state.chartTab;
      el.classList.toggle('on', on);
      el.onclick = () => {
        this.state.chartTab = el.dataset.chartTab;
        this.renderCharts();
      };
    });
    // Show/hide panes
    document.querySelectorAll('[data-chart-pane]').forEach(el => {
      el.style.display = el.dataset.chartPane === this.state.chartTab ? '' : 'none';
    });

    // Tính khoảng kỳ
    const now = new Date();
    let from, to;
    if (period === 'day') { from = today(); to = today(); }
    else if (period === 'week') {
      const d = new Date(); d.setDate(d.getDate() - 6);
      from = d.toISOString().slice(0, 10); to = today();
    } else if (period === 'month') {
      from = now.toISOString().slice(0, 7) + '-01';
      to = today();
    } else if (period === 'custom') {
      from = this.state.chartFrom || today();
      to = this.state.chartTo || today();
    } else {
      from = now.getFullYear() + '-01-01';
      to = today();
    }

    if (this.state.chartTab === 'expense') {
      this._renderChartByType('expense', from, to, period, '#chartTop5', '#chartDonut', '#chartLegend');
    } else if (this.state.chartTab === 'income') {
      this._renderChartByType('income', from, to, period, '#chartTop5Inc', '#chartDonutInc', '#chartLegendInc');
    } else if (this.state.chartTab === 'overview') {
      this._renderChartOverview(from, to, period);
    }
  },

  // Render chart cho 1 type cụ thể (expense / income) — top5 + donut + legend
  _renderChartByType(type, from, to, period, top5Sel, donutSel, legendSel) {
    const byCat = {};
    let total = 0;
    for (const t of this.state.transactions) {
      if (t.type !== type) continue;
      if (t.date < from || t.date > to) continue;
      byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount;
      total += t.amount;
    }
    const slices = Object.entries(byCat).map(([cid, value]) => {
      const c = this.state.categories.find(x => x.id === cid) || {};
      return { id: cid, label: c.name || 'Không rõ', value, color: c.color || '#888' };
    }).sort((a, b) => b.value - a.value);

    // Tính kỳ trước cùng độ dài
    const fromD = new Date(from + 'T00:00:00');
    const toD = new Date(to + 'T00:00:00');
    const days = Math.floor((toD - fromD) / 86400000) + 1;
    const prevToD = new Date(fromD); prevToD.setDate(fromD.getDate() - 1);
    const prevFromD = new Date(prevToD); prevFromD.setDate(prevToD.getDate() - days + 1);
    const prevFrom = prevFromD.toISOString().slice(0, 10);
    const prevTo = prevToD.toISOString().slice(0, 10);
    const prevByCat = {};
    for (const t of this.state.transactions) {
      if (t.type !== type) continue;
      if (t.date < prevFrom || t.date > prevTo) continue;
      prevByCat[t.categoryId] = (prevByCat[t.categoryId] || 0) + t.amount;
    }
    const periodCmpLabel = period === 'day' ? 'hôm qua'
      : period === 'week' ? 'tuần trước'
      : period === 'month' ? `T${prevFromD.getMonth() + 1}`
      : period === 'year' ? `${prevFromD.getFullYear()}`
      : 'kỳ trước';
    const compareHtml = (catId) => {
      const prev = prevByCat[catId] || 0;
      const curr = byCat[catId] || 0;
      if (prev === 0 && curr > 0) return `<span class="cmp-tag new">🆕 mới</span>`;
      if (prev === 0) return '';
      const pct = Math.round((curr - prev) / prev * 100);
      if (pct > 2) return `<span class="cmp-tag up">▲ +${pct}% vs ${periodCmpLabel}</span>`;
      if (pct < -2) return `<span class="cmp-tag down">▼ ${pct}% vs ${periodCmpLabel}</span>`;
      return `<span class="cmp-tag flat">≈ vs ${periodCmpLabel}</span>`;
    };

    const typeLabel = type === 'expense' ? 'chi' : 'thu';
    const totalLabel = type === 'expense' ? 'Chi' : 'Thu';

    // Top 5
    const top5El = $(top5Sel);
    if (top5El) {
      if (!slices.length) {
        top5El.innerHTML = `<div class="top5-empty">Chưa có ${typeLabel} trong kỳ này</div>`;
      } else {
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        const top5 = slices.slice(0, 5);
        const maxVal = top5[0].value;
        top5El.innerHTML = top5.map((s, i) => {
          const pct = total > 0 ? Math.round(s.value / total * 100) : 0;
          const barW = maxVal > 0 ? Math.round(s.value / maxVal * 100) : 0;
          return `
            <div class="top5-row" data-cat="${s.id}" data-cat-type="${type}">
              <div class="top5-rank ${i === 0 ? 'gold' : ''}">${medals[i]}</div>
              <div class="top5-info">
                <div class="top5-name">${this.escapeHtml(s.label)} ${compareHtml(s.id)}</div>
                <div class="top5-bar"><div class="top5-bar-fill" style="width:${barW}%;background:${s.color}"></div></div>
              </div>
              <div class="top5-amt">
                <div class="top5-val">${fmt(s.value)}</div>
                <div class="top5-pct">${pct}% tổng ${typeLabel}</div>
              </div>
            </div>
          `;
        }).join('');
        top5El.querySelectorAll('.top5-row').forEach(el => {
          el.onclick = () => this.openCategoryTxs(el.dataset.cat, from, to, el.dataset.catType);
        });
      }
    }

    // Donut
    const donutCanvas = $(donutSel);
    if (donutCanvas) {
      window.QLT_Charts.donut(donutCanvas, slices, {
        centerLabel: fmt(total),
        centerSub: totalLabel,
        onSliceClick: (sr) => this.openCategoryTxs(sr.id, from, to, type)
      });
    }

    // Legend
    const legend = $(legendSel);
    if (legend) {
      if (slices.length) {
        legend.innerHTML = slices.map(s => {
          const pct = total > 0 ? Math.round(s.value / total * 100) : 0;
          return `
            <div class="legend-item" data-cat="${s.id}" data-cat-type="${type}">
              <span class="legend-dot" style="background:${s.color}"></span>
              <span class="legend-name">${this.escapeHtml(s.label)}<span class="legend-pct">${pct}%</span> ${compareHtml(s.id)}</span>
              <span class="legend-val">${fmt(s.value)}</span>
            </div>
          `;
        }).join('');
        legend.querySelectorAll('.legend-item').forEach(el => {
          el.onclick = () => this.openCategoryTxs(el.dataset.cat, from, to, el.dataset.catType);
        });
      } else {
        legend.innerHTML = `<div class="empty-msg">Chưa có ${typeLabel} trong kỳ này</div>`;
      }
    }
  },

  // Render tab CHUNG: tổng thu/chi + bar chart + tỷ lệ tiết kiệm
  _renderChartOverview(from, to, period) {
    let totalInc = 0, totalExp = 0;
    for (const t of this.state.transactions) {
      if (t.date < from || t.date > to) continue;
      if (this.isRealIncome(t)) totalInc += t.amount;
      else if (this.isRealExpense(t)) totalExp += t.amount;
    }
    const balance = totalInc - totalExp;
    const savePct = totalInc > 0 ? Math.round(balance / totalInc * 100) : 0;

    const summary = $('#chartOverviewSummary');
    if (summary) {
      summary.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;padding:0 4px">
          <div style="background:linear-gradient(135deg,#52b788,#2d6a4f);color:#fff;padding:14px;border-radius:12px">
            <div style="font-size:11px;opacity:.85;text-transform:uppercase">Tổng thu</div>
            <div style="font-size:22px;font-weight:700;margin-top:2px">+${fmt(totalInc)}</div>
            <div style="font-size:11px;opacity:.85;margin-top:2px">đ trong kỳ</div>
          </div>
          <div style="background:linear-gradient(135deg,#e76f51,#c44a32);color:#fff;padding:14px;border-radius:12px">
            <div style="font-size:11px;opacity:.85;text-transform:uppercase">Tổng chi</div>
            <div style="font-size:22px;font-weight:700;margin-top:2px">-${fmt(totalExp)}</div>
            <div style="font-size:11px;opacity:.85;margin-top:2px">đ trong kỳ</div>
          </div>
        </div>
        <div style="background:${balance >= 0 ? 'var(--acl)' : '#ffe5e5'};color:${balance >= 0 ? 'var(--accent)' : '#a02431'};padding:14px;border-radius:12px;margin:0 4px 14px;text-align:center">
          <div style="font-size:11px;opacity:.85;text-transform:uppercase">${balance >= 0 ? '✅ Số dư kỳ này' : '⚠️ Bội chi kỳ này'}</div>
          <div style="font-size:24px;font-weight:700;margin-top:4px">${balance >= 0 ? '+' : ''}${fmt(balance)} đ</div>
          ${totalInc > 0 ? `<div style="font-size:12px;margin-top:4px">Tỷ lệ tiết kiệm: <strong>${savePct}%</strong> thu nhập</div>` : ''}
        </div>
      `;
    }

    // Bar chart Thu/Chi theo kỳ — có tap-tooltip
    const barCanvas = $('#chartBar');
    if (barCanvas) {
      const groups = this.groupByPeriod(period);
      window.QLT_Charts.bar(barCanvas, groups, {
        onBarClick: (d) => this._showBarTooltip(d)
      });
    }
  },

  _showBarTooltip(d) {
    const inc = d.income || 0;
    const exp = d.expense || 0;
    const profit = Math.max(0, inc - exp);
    const loss = Math.max(0, exp - inc);
    const html = `
      <div style="text-align:left;font-size:13px;line-height:1.7">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
          <span><span style="display:inline-block;width:10px;height:10px;background:#52b788;border-radius:2px;margin-right:8px"></span>Thu nhập</span>
          <strong style="color:#52b788">${fmt(inc)} đ</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
          <span><span style="display:inline-block;width:10px;height:10px;background:#e76f51;border-radius:2px;margin-right:8px"></span>Chi phí</span>
          <strong style="color:#e76f51">${fmt(exp)} đ</strong>
        </div>
        ${profit > 0 ? `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border)">
          <span><span style="display:inline-block;width:10px;height:10px;background:#1b4d3e;border-radius:2px;margin-right:8px"></span>Lợi nhuận</span>
          <strong style="color:#1b4d3e">+${fmt(profit)} đ</strong>
        </div>` : ''}
        ${loss > 0 ? `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
          <span><span style="display:inline-block;width:10px;height:10px;background:#a02431;border-radius:2px;margin-right:8px"></span>Lỗ</span>
          <strong style="color:#a02431">-${fmt(loss)} đ</strong>
        </div>` : ''}
      </div>
    `;
    QLT_UI.alert(html, { title: `📊 Chi tiết ${d.label}`, html: true });
  },

  // Mở modal: liệt kê giao dịch của 1 danh mục trong khoảng [from, to]
  // type optional: 'expense' (default) | 'income' — match với chart tab tương ứng
  openCategoryTxs(catId, from, to, type = 'expense') {
    const cat = this.state.categories.find(c => c.id === catId) || {};
    const txs = this.state.transactions
      .filter(t => t.type === type && t.categoryId === catId && t.date >= from && t.date <= to)
      .sort((a, b) => (b.date + (b._updatedAt || '')).localeCompare(a.date + (a._updatedAt || '')));
    const total = txs.reduce((s, t) => s + t.amount, 0);

    $('#catTxTitle').textContent = `${cat.name || 'Danh mục'} · ${fmt(total)}`;

    const body = $('#catTxBody');
    if (!txs.length) {
      body.innerHTML = '<div class="empty-msg">Không có giao dịch trong kỳ này</div>';
    } else {
      const groups = {};
      txs.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
      body.innerHTML = `
        <div style="padding:8px 4px 14px;color:var(--text2);font-size:12px">
          ${txs.length} giao dịch · từ ${this.formatDate(from)} đến ${this.formatDate(to)}
        </div>
      ` + Object.keys(groups).sort().reverse().map(date => {
        const daySum = groups[date].reduce((s, t) => s + t.amount, 0);
        const sign = type === 'income' ? '+' : '-';
        const cls = type === 'income' ? 'amount-pos' : 'amount-neg';
        return `
          <div class="day-header">
            <div>${this.formatDate(date)}</div>
            <div class="day-totals"><span class="${cls}">${sign}${fmt(daySum)}</span></div>
          </div>
          ${groups[date].map(t => this.renderTxItem(t)).join('')}
        `;
      }).join('');

      body.querySelectorAll('[data-tx]').forEach(el => {
        el.onclick = () => {
          $('#catTxModal').classList.remove('open');
          this.openTxModal(el.dataset.tx);
        };
      });
    }

    $('#catTxModal').classList.add('open');
  },

  // ============ BIẾN ĐỘNG THU CHI (MoMo-style) ============
  // State trong this.state.fluc = { period: 'week|month|year', tab: 'income|expense|diff', cmp: bool }

  // Trả về [start, end] cho period THIS và LAST (so với cùng kỳ).
  // 'week'  → tuần này (T2 → CN tuần này) vs tuần trước (T2 → CN tuần trước)
  // 'month' → tháng này (1→hôm nay) vs tháng trước (1→cùng ngày)
  // 'year'  → năm này (1/1→hôm nay) vs năm trước (1/1→cùng ngày năm trước)
  // Tất cả "previous" được CẮT ĐÚNG đến cùng số ngày đã trôi để so sánh CÔNG BẰNG.
  _flucRanges(period, asOf) {
    const now = asOf ? new Date(asOf + 'T00:00:00') : new Date(today() + 'T00:00:00');
    const fmtDt = d => d.toISOString().slice(0, 10);
    const cloneAdd = (d, days) => { const x = new Date(d); x.setDate(x.getDate() + days); return x; };

    let curStart, curEnd, prevStart, prevEnd, label;
    if (period === 'week') {
      // Monday làm đầu tuần (theo VN)
      const dow = (now.getDay() + 6) % 7; // T2=0, T3=1, ..., CN=6
      curStart = cloneAdd(now, -dow);
      curEnd = now;
      // Tuần trước = curStart -7 → curEnd -7
      prevStart = cloneAdd(curStart, -7);
      prevEnd = cloneAdd(curEnd, -7);
      label = 'tuần';
    } else if (period === 'month') {
      curStart = new Date(now.getFullYear(), now.getMonth(), 1);
      curEnd = now;
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      // Cắt prevEnd đến cùng day-of-month, nhưng không vượt số ngày max của tháng trước
      const maxPrevDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), maxPrevDay));
      label = 'tháng';
    } else {
      // year
      curStart = new Date(now.getFullYear(), 0, 1);
      curEnd = now;
      prevStart = new Date(now.getFullYear() - 1, 0, 1);
      // Edge case: 29/2 năm nhuận → 28/2 năm thường
      let prevEndMonth = now.getMonth();
      let prevEndDay = now.getDate();
      if (prevEndMonth === 1 && prevEndDay === 29) {
        const isLeapPrev = (() => {
          const y = now.getFullYear() - 1;
          return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
        })();
        if (!isLeapPrev) prevEndDay = 28;
      }
      prevEnd = new Date(now.getFullYear() - 1, prevEndMonth, prevEndDay);
      label = 'năm';
    }
    return {
      curStart: fmtDt(curStart), curEnd: fmtDt(curEnd),
      prevStart: fmtDt(prevStart), prevEnd: fmtDt(prevEnd),
      label
    };
  },

  // Tổng giao dịch loại 'income'/'expense' trong khoảng [from, to]
  _flucSum(type, fromStr, toStr) {
    return (this.state.transactions || [])
      .filter(t => t.type === type && t.date >= fromStr && t.date <= toStr)
      .reduce((s, t) => s + (t.amount || 0), 0);
  },

  // Sum theo category trong khoảng — trả về Map<catId, total>
  _flucSumByCategory(type, fromStr, toStr) {
    const m = new Map();
    for (const t of (this.state.transactions || [])) {
      if (t.type !== type || !t.categoryId) continue;
      if (t.date < fromStr || t.date > toStr) continue;
      m.set(t.categoryId, (m.get(t.categoryId) || 0) + (t.amount || 0));
    }
    return m;
  },

  // Build timeline: 6 kỳ gần nhất cho week/month, 4 năm cho year
  // Trả về array { label, fromStr, toStr, isCurrent }
  _flucTimeline(period) {
    const out = [];
    const now = new Date(today() + 'T00:00:00');
    if (period === 'week') {
      // 6 tuần gần nhất: tuần này + 5 tuần trước
      const dow = (now.getDay() + 6) % 7;
      const thisMonStart = new Date(now); thisMonStart.setDate(now.getDate() - dow);
      for (let i = 5; i >= 0; i--) {
        const ws = new Date(thisMonStart); ws.setDate(thisMonStart.getDate() - i * 7);
        const we = new Date(ws); we.setDate(ws.getDate() + 6);
        const isCur = i === 0;
        const startStr = ws.toISOString().slice(0, 10);
        const endStr = (isCur ? now : we).toISOString().slice(0, 10);
        const label = isCur ? 'Tuần này' : `${ws.getDate()}/${ws.getMonth() + 1}`;
        out.push({ label, fromStr: startStr, toStr: endStr, isCurrent: isCur, anchor: ws });
      }
    } else if (period === 'month') {
      // 6 tháng gần nhất
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const isCur = i === 0;
        const fromStr = d.toISOString().slice(0, 10);
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const toStr = (isCur ? now : lastDay).toISOString().slice(0, 10);
        const label = isCur ? 'Tháng này' : `T${d.getMonth() + 1}`;
        out.push({ label, fromStr, toStr, isCurrent: isCur, anchor: d });
      }
    } else {
      // 4 năm gần nhất
      for (let i = 3; i >= 0; i--) {
        const y = now.getFullYear() - i;
        const isCur = i === 0;
        const fromStr = `${y}-01-01`;
        const toStr = (isCur ? now : new Date(y, 11, 31)).toISOString().slice(0, 10);
        const label = isCur ? 'Năm nay' : `${y}`;
        out.push({ label, fromStr, toStr, isCurrent: isCur, anchor: new Date(y, 0, 1) });
      }
    }
    return out;
  },

  // Cùng kỳ của 1 timeline entry — vd cùng kỳ tháng này = same days của tháng trước
  _flucSamePeriodOf(entry, period) {
    const a = entry.anchor;
    if (period === 'week') {
      const ws = new Date(a); ws.setDate(a.getDate() - 7);
      const we = new Date(ws); we.setDate(ws.getDate() + 6);
      // Cắt theo số ngày đã trôi của entry
      const elapsedDays = (new Date(entry.toStr) - new Date(entry.fromStr)) / 86400000;
      const cutEnd = new Date(ws); cutEnd.setDate(ws.getDate() + Math.round(elapsedDays));
      return { fromStr: ws.toISOString().slice(0, 10), toStr: cutEnd.toISOString().slice(0, 10) };
    } else if (period === 'month') {
      const prevMonth = new Date(a.getFullYear(), a.getMonth() - 1, 1);
      const elapsedDays = (new Date(entry.toStr) - new Date(entry.fromStr)) / 86400000;
      const maxDay = new Date(a.getFullYear(), a.getMonth(), 0).getDate();
      const cutDay = Math.min(maxDay, Math.round(elapsedDays) + 1);
      const cutEnd = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), cutDay);
      return { fromStr: prevMonth.toISOString().slice(0, 10), toStr: cutEnd.toISOString().slice(0, 10) };
    } else {
      // year
      const prevY = a.getFullYear() - 1;
      const fromD = new Date(prevY, 0, 1);
      const elapsedMs = new Date(entry.toStr) - new Date(entry.fromStr);
      const elapsedDays = elapsedMs / 86400000;
      const cutEnd = new Date(prevY, 0, 1);
      cutEnd.setDate(cutEnd.getDate() + Math.round(elapsedDays));
      return { fromStr: fromD.toISOString().slice(0, 10), toStr: cutEnd.toISOString().slice(0, 10) };
    }
  },

  renderFluctuation() {
    if (!this.state.fluc) this.state.fluc = { period: 'month', tab: 'expense', cmp: true };
    const f = this.state.fluc;

    // Bind period pills
    document.querySelectorAll('#flucPeriodRow .fluc-period-pill').forEach(el => {
      el.classList.toggle('on', el.dataset.period === f.period);
      el.onclick = () => { f.period = el.dataset.period; this.renderFluctuation(); };
    });
    // Bind sub-tabs
    document.querySelectorAll('#flucTabRow .fluc-tab').forEach(el => {
      el.classList.toggle('on', el.dataset.tab === f.tab);
      el.onclick = () => { f.tab = el.dataset.tab; this.renderFluctuation(); };
    });
    // Bind cmp toggle
    const cmpToggle = $('#flucCmpToggle');
    cmpToggle.checked = !!f.cmp;
    cmpToggle.onchange = () => { f.cmp = cmpToggle.checked; this.renderFluctuation(); };

    // Compute current vs previous
    const r = this._flucRanges(f.period);
    const tabName = f.tab === 'income' ? 'Thu nhập' : (f.tab === 'expense' ? 'Chi tiêu' : 'Chênh lệch');
    let curTotal, prevTotal;
    if (f.tab === 'diff') {
      curTotal = this._flucSum('income', r.curStart, r.curEnd) - this._flucSum('expense', r.curStart, r.curEnd);
      prevTotal = this._flucSum('income', r.prevStart, r.prevEnd) - this._flucSum('expense', r.prevStart, r.prevEnd);
    } else {
      curTotal = this._flucSum(f.tab, r.curStart, r.curEnd);
      prevTotal = this._flucSum(f.tab, r.prevStart, r.prevEnd);
    }

    // Header
    const header = $('#flucHeader');
    const periodLabel = f.period === 'week' ? 'tuần này' : (f.period === 'month' ? 'tháng này' : 'năm nay');
    const cumPeriodLabel = f.period === 'week' ? 'tuần trước' : (f.period === 'month' ? 'tháng trước' : 'năm trước');
    const totalCls = f.tab === 'diff' ? (curTotal >= 0 ? 'pos' : 'neg') : '';
    const totalDisplay = f.tab === 'diff'
      ? (curTotal >= 0 ? '+' : '') + fmt(curTotal) + ' đ'
      : fmt(curTotal) + ' đ';
    const delta = curTotal - prevTotal;
    let deltaHtml;
    if (Math.abs(delta) < 1) {
      deltaHtml = `<div class="fluc-header-delta flat">≈ Bằng cùng kỳ ${cumPeriodLabel}</div>`;
    } else {
      const isUp = delta > 0;
      // Cho 'expense': tăng = xấu (đỏ), giảm = tốt (xanh)
      // Cho 'income' / 'diff': tăng = tốt (xanh), giảm = xấu (đỏ)
      let cls;
      if (f.tab === 'expense') cls = isUp ? 'up' : 'down';
      else cls = isUp ? 'down' : 'up'; // up class = green (good for income/diff)
      // Wait — let me redesign: class .up = đỏ (xấu cho chi), .down = xanh (tốt cho chi)
      // Hmm conflict. Let me make it semantic:
      // .up = visual "tăng" → cho expense = đỏ, cho income/diff = xanh
      // Actually simpler: pick color based on whether this is "good news" or "bad news"
      const isBad = f.tab === 'expense' ? isUp : !isUp;
      cls = isBad ? 'down' : 'up';
      const arrow = isUp ? '↑' : '↓';
      const verb = isUp ? 'Tăng' : 'Giảm';
      deltaHtml = `<div class="fluc-header-delta ${cls}">${arrow} ${verb} ${fmt(Math.abs(delta))} đ so với cùng kỳ ${cumPeriodLabel}</div>`;
    }
    header.innerHTML = `
      <div class="fluc-header-label">Tổng ${tabName.toLowerCase()} ${periodLabel}</div>
      <div class="fluc-header-amount ${totalCls}">${totalDisplay}</div>
      ${deltaHtml}
    `;

    // Build timeline + render chart
    const timeline = this._flucTimeline(f.period);
    const tlData = timeline.map(e => {
      const cur = f.tab === 'diff'
        ? this._flucSum('income', e.fromStr, e.toStr) - this._flucSum('expense', e.fromStr, e.toStr)
        : this._flucSum(f.tab, e.fromStr, e.toStr);
      let prev = 0;
      if (f.cmp) {
        const sp = this._flucSamePeriodOf(e, f.period);
        prev = f.tab === 'diff'
          ? this._flucSum('income', sp.fromStr, sp.toStr) - this._flucSum('expense', sp.fromStr, sp.toStr)
          : this._flucSum(f.tab, sp.fromStr, sp.toStr);
      }
      return { label: e.label, cur, prev, isCurrent: e.isCurrent };
    });
    this._drawFlucChart($('#flucChart'), tlData, f);

    // Legend
    const legend = $('#flucLegend');
    if (f.cmp) {
      legend.innerHTML = `
        <span class="fluc-chart-legend-item"><span class="fluc-chart-legend-swatch" style="background:#a9c8e8"></span>Cùng kỳ</span>
        <span class="fluc-chart-legend-item"><span class="fluc-chart-legend-swatch" style="background:#1976d2"></span>${tabName} kỳ này</span>
      `;
    } else {
      legend.innerHTML = `<span class="fluc-chart-legend-item"><span class="fluc-chart-legend-swatch" style="background:#1976d2"></span>${tabName}</span>`;
    }

    // Categories breakdown — chỉ cho thu/chi, không cho diff
    const catsWrap = $('#flucCatsWrap');
    if (f.tab === 'diff') {
      catsWrap.style.display = 'none';
    } else {
      catsWrap.style.display = 'block';
      $('#flucCatsLabel').textContent = 'Theo danh mục';
      const curMap = this._flucSumByCategory(f.tab, r.curStart, r.curEnd);
      const prevMap = this._flucSumByCategory(f.tab, r.prevStart, r.prevEnd);
      // Tổng hợp tất cả catId xuất hiện ở cur hoặc prev
      const allIds = new Set([...curMap.keys(), ...prevMap.keys()]);
      const rows = [];
      for (const cid of allIds) {
        const cat = this.state.categories.find(c => c.id === cid);
        const cur = curMap.get(cid) || 0;
        const prev = prevMap.get(cid) || 0;
        rows.push({ cat, cur, prev, delta: cur - prev });
      }
      rows.sort((a, b) => b.cur - a.cur);
      const list = $('#flucCatsList');
      if (rows.length === 0) {
        list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);font-size:13px">Chưa có giao dịch nào</div>';
      } else {
        list.innerHTML = rows.slice(0, 15).map(row => {
          const cat = row.cat || { name: '?', color: '#888', icon: 'emoji:📁' };
          const emoji = (cat.icon || '').startsWith('emoji:') ? cat.icon.slice(6) : '📁';
          let deltaCls = 'flat', deltaArrow = '', deltaText = 'Bằng cùng kỳ';
          if (Math.abs(row.delta) >= 1) {
            const isUp = row.delta > 0;
            // For expense: up = bad (đỏ), down = good (xanh). For income: up = good, down = bad
            const isBad = f.tab === 'expense' ? isUp : !isUp;
            deltaCls = isBad ? 'up' : 'down';
            deltaArrow = isUp ? '↑' : '↓';
            deltaText = `${deltaArrow} ${fmt(Math.abs(row.delta))} đ`;
          }
          return `
            <div class="fluc-cat-row" data-cat="${cat.id || ''}">
              <div class="fluc-cat-icon" style="background:${cat.color || '#888'}1a">${emoji}</div>
              <div class="fluc-cat-info">
                <div class="fluc-cat-name">${this.escapeHtml(cat.name)}</div>
              </div>
              <div class="fluc-cat-amount-row">
                <div class="fluc-cat-amount">${fmt(row.cur)} đ</div>
                <div class="fluc-cat-delta ${deltaCls}">${deltaText}</div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Timeline list
    $('#flucTimelineLabel').textContent = f.period === 'week' ? 'Các tuần gần đây' : (f.period === 'month' ? 'Các tháng gần đây' : 'Các năm gần đây');
    const tlEl = $('#flucTimeline');
    tlEl.innerHTML = timeline.slice().reverse().map(e => {
      const inc = this._flucSum('income', e.fromStr, e.toStr);
      const exp = this._flucSum('expense', e.fromStr, e.toStr);
      const net = inc - exp;
      const netCls = net >= 0 ? 'pos' : 'neg';
      const netText = (net >= 0 ? '+' : '') + fmt(net) + ' đ';
      return `
        <div class="fluc-tl-row">
          <div class="fluc-tl-label">${this.escapeHtml(e.label)}</div>
          <div class="fluc-tl-info">
            Thu: <strong>${fmt(inc)} đ</strong><br>
            Chi: <strong>${fmt(exp)} đ</strong>
          </div>
          <div class="fluc-tl-net">
            <div class="fluc-tl-net-label">Còn lại</div>
            <div class="fluc-tl-net-amount ${netCls}">${netText}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  // Vẽ chart cho fluctuation: 2-series overlay (current full + comparison previous)
  _drawFlucChart(canvas, data, f) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const cs = getComputedStyle(document.documentElement);
    const text2Color = (cs.getPropertyValue('--text2') || '#666').trim();
    const text3Color = (cs.getPropertyValue('--text3') || '#aaa').trim();
    const borderColor = (cs.getPropertyValue('--border') || '#e4ebe0').trim();

    if (!data.length) return;

    const padTop = 18, padBottom = 36, padLeft = 12, padRight = 12;
    const innerW = W - padLeft - padRight;
    const innerH = H - padTop - padBottom;

    // Diff tab có thể có giá trị âm → tính min/max
    const allVals = [];
    for (const d of data) { allVals.push(d.cur, d.prev); }
    const maxAbs = Math.max(1, ...allVals.map(v => Math.abs(v)));
    const hasNeg = allVals.some(v => v < 0);
    const baselineY = hasNeg ? padTop + innerH / 2 : padTop + innerH;
    const halfH = hasNeg ? innerH / 2 : innerH;

    // Trục đáy (hoặc trung tâm nếu có âm)
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padLeft, baselineY);
    ctx.lineTo(padLeft + innerW, baselineY);
    ctx.stroke();

    const groupW = innerW / data.length;
    const showCmp = !!f.cmp;
    const barW = showCmp ? Math.min(20, groupW * 0.32) : Math.min(28, groupW * 0.55);
    const gap = showCmp ? 3 : 0;

    data.forEach((d, i) => {
      const groupCx = padLeft + i * groupW + groupW / 2;

      // Helper: vẽ 1 bar tại x với value
      const drawBar = (x, val, color) => {
        if (!val) return;
        const h = Math.abs(val) / maxAbs * halfH;
        const y = val >= 0 ? baselineY - h : baselineY;
        ctx.fillStyle = color;
        ctx.beginPath();
        const r = 3;
        // Rounded rect — chỉ bo top (hoặc bottom nếu âm)
        if (val >= 0) {
          ctx.moveTo(x, y + h);
          ctx.lineTo(x, y + r);
          ctx.quadraticCurveTo(x, y, x + r, y);
          ctx.lineTo(x + barW - r, y);
          ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
          ctx.lineTo(x + barW, y + h);
        } else {
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + h - r);
          ctx.quadraticCurveTo(x, y + h, x + r, y + h);
          ctx.lineTo(x + barW - r, y + h);
          ctx.quadraticCurveTo(x + barW, y + h, x + barW, y + h - r);
          ctx.lineTo(x + barW, y);
        }
        ctx.closePath();
        ctx.fill();
      };

      // Color
      const COLOR_CUR = '#1976d2';
      const COLOR_PREV = '#a9c8e8';

      if (showCmp) {
        // Cùng kỳ ở trái, kỳ này ở phải
        const x1 = groupCx - barW - gap / 2;
        const x2 = groupCx + gap / 2;
        drawBar(x1, d.prev, COLOR_PREV);
        drawBar(x2, d.cur, COLOR_CUR);
      } else {
        const x = groupCx - barW / 2;
        drawBar(x, d.cur, COLOR_CUR);
      }

      // Highlight kỳ hiện tại
      if (d.isCurrent) {
        ctx.fillStyle = '#1976d2';
        ctx.font = '700 11px DM Sans, sans-serif';
      } else {
        ctx.fillStyle = text2Color;
        ctx.font = '11px DM Sans, sans-serif';
      }
      ctx.textAlign = 'center';
      ctx.fillText(d.label, groupCx, H - padBottom + 14);
    });
  },

  groupByPeriod(period) {
    // BỎ giao dịch _adjustment (Điều chỉnh số dư) khỏi income/expense
    // → biểu đồ chỉ thể hiện thu/chi thật, không bị nhiễu bởi balance fix.
    const isInc = (t) => this.isRealIncome(t);
    const isExp = (t) => this.isRealExpense(t);
    const out = [];
    const now = new Date();
    if (period === 'day') {
      // 7 ngày gần nhất
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const inc = this.state.transactions.filter(t => isInc(t) && t.date === key).reduce((s, t) => s + t.amount, 0);
        const exp = this.state.transactions.filter(t => isExp(t) && t.date === key).reduce((s, t) => s + t.amount, 0);
        out.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, income: inc, expense: exp });
      }
    } else if (period === 'week') {
      // 8 tuần gần nhất
      for (let i = 7; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i * 7);
        const start = new Date(d); start.setDate(d.getDate() - d.getDay());
        const end = new Date(start); end.setDate(start.getDate() + 6);
        const fromS = start.toISOString().slice(0, 10);
        const toS = end.toISOString().slice(0, 10);
        const inc = this.state.transactions.filter(t => isInc(t) && t.date >= fromS && t.date <= toS).reduce((s, t) => s + t.amount, 0);
        const exp = this.state.transactions.filter(t => isExp(t) && t.date >= fromS && t.date <= toS).reduce((s, t) => s + t.amount, 0);
        out.push({ label: `T${start.getDate()}/${start.getMonth() + 1}`, income: inc, expense: exp });
      }
    } else if (period === 'month') {
      // 12 tháng gần nhất
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = d.toISOString().slice(0, 7);
        const inc = this.state.transactions.filter(t => isInc(t) && t.date.startsWith(ym)).reduce((s, t) => s + t.amount, 0);
        const exp = this.state.transactions.filter(t => isExp(t) && t.date.startsWith(ym)).reduce((s, t) => s + t.amount, 0);
        out.push({ label: `T${d.getMonth() + 1}`, income: inc, expense: exp });
      }
    } else if (period === 'year') {
      // 5 năm gần nhất
      for (let i = 4; i >= 0; i--) {
        const y = now.getFullYear() - i;
        const inc = this.state.transactions.filter(t => isInc(t) && t.date.startsWith(y + '')).reduce((s, t) => s + t.amount, 0);
        const exp = this.state.transactions.filter(t => isExp(t) && t.date.startsWith(y + '')).reduce((s, t) => s + t.amount, 0);
        out.push({ label: y + '', income: inc, expense: exp });
      }
    } else if (period === 'custom') {
      const fromS = this.state.chartFrom || today();
      const toS = this.state.chartTo || today();
      const fromD = new Date(fromS + 'T00:00:00');
      const toD = new Date(toS + 'T00:00:00');
      const days = Math.floor((toD - fromD) / 86400000) + 1;
      // ≤31 ngày: group ngày; ≤180 ngày: group tuần; còn lại: group tháng
      if (days <= 31) {
        for (let i = 0; i < days; i++) {
          const d = new Date(fromD); d.setDate(fromD.getDate() + i);
          const key = d.toISOString().slice(0, 10);
          const inc = this.state.transactions.filter(t => isInc(t) && t.date === key).reduce((s, t) => s + t.amount, 0);
          const exp = this.state.transactions.filter(t => isExp(t) && t.date === key).reduce((s, t) => s + t.amount, 0);
          out.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, income: inc, expense: exp });
        }
      } else if (days <= 180) {
        const start = new Date(fromD); start.setDate(fromD.getDate() - fromD.getDay());
        for (let s = new Date(start); s <= toD; s.setDate(s.getDate() + 7)) {
          const wEnd = new Date(s); wEnd.setDate(s.getDate() + 6);
          const fromW = s.toISOString().slice(0, 10);
          const toW = wEnd.toISOString().slice(0, 10);
          const inc = this.state.transactions.filter(t => isInc(t) && t.date >= fromW && t.date <= toW && t.date >= fromS && t.date <= toS).reduce((sum, t) => sum + t.amount, 0);
          const exp = this.state.transactions.filter(t => isExp(t) && t.date >= fromW && t.date <= toW && t.date >= fromS && t.date <= toS).reduce((sum, t) => sum + t.amount, 0);
          out.push({ label: `T${s.getDate()}/${s.getMonth() + 1}`, income: inc, expense: exp });
        }
      } else {
        const m = new Date(fromD.getFullYear(), fromD.getMonth(), 1);
        while (m <= toD) {
          const ym = m.toISOString().slice(0, 7);
          const inc = this.state.transactions.filter(t => isInc(t) && t.date.startsWith(ym) && t.date >= fromS && t.date <= toS).reduce((sum, t) => sum + t.amount, 0);
          const exp = this.state.transactions.filter(t => isExp(t) && t.date.startsWith(ym) && t.date >= fromS && t.date <= toS).reduce((sum, t) => sum + t.amount, 0);
          out.push({ label: `${m.getMonth() + 1}/${(m.getFullYear() + '').slice(2)}`, income: inc, expense: exp });
          m.setMonth(m.getMonth() + 1);
        }
      }
    }
    return out;
  },

  // ============ REMINDERS ============
  renderReminders() {
    const list = $('#remList');
    if (this.state.reminders.length === 0) {
      list.innerHTML = this.emptyState({
        icon: '🔔', title: 'Chưa có lời nhắc nào',
        desc: 'Tạo nhắc nhở để không quên các khoản chi định kỳ (tiền nhà, internet, điện...).',
        ctaLabel: '+ Tạo lời nhắc'
      });
      this.bindEmptyCTA(list, () => this.openReminderModal(null));
    } else {
      list.innerHTML = this.state.reminders.map(r => {
        const cat = this.state.categories.find(c => c.id === r.categoryId) || {};
        return `
          <div class="rem-item" data-rem="${r.id}">
            <div class="tx-icon" style="background:${cat.color || '#2d6a4f'}1a;color:${cat.color || '#2d6a4f'}">${svgIcon(cat.icon || 'bell')}</div>
            <div class="tx-info">
              <div class="tx-cat">${this.escapeHtml(r.name)}</div>
              <div class="tx-meta">${this.frequencyLabel(r.frequency)} · ${r.time || ''}</div>
            </div>
            <div class="tx-amount ${r.type === 'income' ? 'amount-pos' : 'amount-neg'}">${r.type === 'income' ? '+' : '-'}${fmt(r.amount)}</div>
          </div>
        `;
      }).join('');
      list.querySelectorAll('[data-rem]').forEach(el => {
        el.onclick = () => this.openReminderModal(el.dataset.rem);
      });
    }
    $('#remAddBtn').onclick = () => this.openReminderModal(null);
  },

  frequencyLabel(f) {
    return { daily: 'Hàng ngày', weekly: 'Hàng tuần', monthly: 'Hàng tháng', yearly: 'Hàng năm' }[f] || f;
  },

  // ============ BUDGETS (Ngân sách tháng) ============
  // Đã chi của 1 danh mục trong 1 tháng (ym = 'YYYY-MM')
  budgetSpent(catId, ym) {
    return this.state.transactions
      .filter(t => t.type === 'expense' && t.categoryId === catId && t.date.startsWith(ym))
      .reduce((s, t) => s + t.amount, 0);
  },

  // {pct, status, remain, spent, color, label} cho 1 budget
  budgetStatus(budget, ym) {
    const spent = this.budgetSpent(budget.categoryId, ym);
    const limit = budget.amount || 0;
    const pct = limit > 0 ? Math.round(spent / limit * 100) : 0;
    const remain = limit - spent;
    let status = 'ok', label = 'Còn dư';
    if (pct >= 100) { status = 'over'; label = 'Đã vượt'; }
    else if (pct >= 80) { status = 'warn'; label = 'Sắp vượt'; }
    return { pct, status, remain, spent, limit, label };
  },

  renderBudgets() {
    const ym = new Date().toISOString().slice(0, 7);
    $('#budgetMonth').textContent = `Tháng ${ym.slice(5)}/${ym.slice(0, 4)}`;

    const budgets = this.state.budgets.slice().sort((a, b) => {
      const sa = this.budgetStatus(a, ym).pct;
      const sb = this.budgetStatus(b, ym).pct;
      return sb - sa;
    });

    // Tổng
    const totalLimit = budgets.reduce((s, b) => s + (b.amount || 0), 0);
    const totalSpent = budgets.reduce((s, b) => s + this.budgetSpent(b.categoryId, ym), 0);
    const totalRemain = totalLimit - totalSpent;
    const totalPct = totalLimit > 0 ? Math.min(100, Math.round(totalSpent / totalLimit * 100)) : 0;
    let totalCls = 'ok';
    if (totalSpent > totalLimit) totalCls = 'over';
    else if (totalSpent / Math.max(1, totalLimit) >= 0.8) totalCls = 'warn';
    $('#budgetTotalLimit').textContent = fmt(totalLimit) + ' đ';
    $('#budgetTotalSpent').textContent = fmt(totalSpent) + ' đ';
    $('#budgetTotalRemain').textContent = fmt(totalRemain) + ' đ';
    const fillEl = $('#budgetTotalBarFill');
    fillEl.style.width = totalPct + '%';
    fillEl.className = 'budget-summary-bar-fill ' + (totalCls === 'ok' ? '' : totalCls);

    const list = $('#budgetList');
    if (!budgets.length) {
      list.innerHTML = this.emptyState({
        icon: '🎯', title: 'Chưa có ngân sách',
        desc: 'Đặt giới hạn chi tháng cho từng danh mục — app sẽ cảnh báo khi gần vượt.',
        ctaLabel: '+ Tạo ngân sách đầu tiên'
      });
      this.bindEmptyCTA(list, () => this.openBudgetModal(null));
      return;
    }

    list.innerHTML = budgets.map(b => {
      const cat = this.state.categories.find(c => c.id === b.categoryId) || {};
      const st = this.budgetStatus(b, ym);
      const barW = Math.min(100, st.pct);
      const remainTxt = st.remain >= 0
        ? `Còn ${fmt(st.remain)} đ`
        : `Quá ${fmt(-st.remain)} đ`;
      return `
        <div class="budget-item" data-budget="${b.id}">
          <div class="budget-item-icon" style="background:${(cat.color || '#888') + '1a'};color:${cat.color || '#888'}">
            ${svgIcon(cat.icon || 'other')}
          </div>
          <div class="budget-item-info">
            <div class="budget-item-name">
              <span>${this.escapeHtml(cat.name || 'Không rõ')}</span>
              <span class="budget-item-status ${st.status}">${st.pct}% · ${st.label}</span>
            </div>
            <div class="budget-item-bar"><div class="budget-item-bar-fill ${st.status}" style="width:${barW}%"></div></div>
            <div class="budget-item-meta">
              <span>${fmt(st.spent)} / ${fmt(st.limit)} đ</span>
              <span>${remainTxt}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-budget]').forEach(el => {
      el.onclick = () => this.openBudgetModal(el.dataset.budget);
    });
  },

  // ----- Tài sản dài hạn (sổ tiết kiệm) -----
  renderHomeSavings(totalPayment, totalSavings) {
    const wrap = $('#homeSavings');
    if (!wrap) return;
    const savAccs = this.state.accounts.filter(a => this.isActiveSavings(a));
    if (!savAccs.length) { wrap.style.display = 'none'; return; }
    const todayStr = today();
    savAccs.sort((a, b) => (a.maturityDate || '').localeCompare(b.maturityDate || ''));

    wrap.style.display = 'block';
    wrap.innerHTML = `
      <div class="savings-section-card">
        <div class="savings-section-head">💎 Tài sản dài hạn — sổ tiết kiệm</div>
        <div class="savings-section-total">${fmtBal(totalSavings)}</div>
        <div class="savings-list">
          ${savAccs.map(a => {
            const due = a.maturityDate || '';
            let dueCls = '', dueLabel = 'Chưa đặt hạn';
            if (due) {
              const daysLeft = Math.ceil((new Date(due) - new Date(todayStr)) / 86400000);
              if (daysLeft < 0) { dueCls = 'overdue'; dueLabel = `Quá hạn ${-daysLeft}d`; }
              else if (daysLeft === 0) { dueCls = 'soon'; dueLabel = '⚠️ Đáo hạn HÔM NAY'; }
              else if (daysLeft <= 7) { dueCls = 'soon'; dueLabel = `⚠️ Còn ${daysLeft}d → đáo hạn`; }
              else dueLabel = `Đáo hạn ${this.formatDate(due)}`;
            }
            return `
              <div class="savings-item" data-acc="${a.id}">
                <div class="savings-item-icon">${(a.icon || '').startsWith('emoji:') ? a.icon.slice(6) : '💎'}</div>
                <div class="savings-item-info">
                  <div class="savings-item-name">${this.escapeHtml(a.name)}</div>
                  <div class="savings-item-meta">${a.interestRate || 0}%/năm · ${a.termMonths || 0} tháng</div>
                </div>
                <div class="savings-item-amt">
                  <div class="savings-item-bal">${fmtBal(a.balance || 0)}</div>
                  <div class="savings-item-due ${dueCls}">${dueLabel}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="savings-grand">
          <span>Tổng tài sản (tiền dùng + tiết kiệm)</span>
          <strong>${fmtBal((totalPayment || 0) + totalSavings)}</strong>
        </div>
      </div>
    `;
    wrap.querySelectorAll('[data-acc]').forEach(el => {
      el.onclick = () => this.openAccModal(el.dataset.acc);
    });
  },

  // ----- Smart insights — phân tích tự động cho user thấy giá trị app -----
  renderHomeInsights() {
    const wrap = $('#homeInsights');
    if (!wrap) return;
    const insights = [];

    const now = new Date();
    const ym = now.toISOString().slice(0, 7);
    const dayOfMonth = now.getDate();
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const prev = new Date(now); prev.setMonth(prev.getMonth() - 1);
    const prevYm = prev.toISOString().slice(0, 7);
    const prevSameDay = Math.min(dayOfMonth, new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate());

    const txs = this.state.transactions;
    const expThis = txs.filter(t => this.isRealExpense(t) && t.date.startsWith(ym))
      .reduce((s, t) => s + t.amount, 0);
    const incThis = txs.filter(t => this.isRealIncome(t) && t.date.startsWith(ym))
      .reduce((s, t) => s + t.amount, 0);

    // 1) So sánh chi tiêu với cùng kỳ tháng trước
    const expPrevSameDay = txs.filter(t => this.isRealExpense(t) && t.date.startsWith(prevYm) &&
      parseInt(t.date.slice(8, 10), 10) <= prevSameDay
    ).reduce((s, t) => s + t.amount, 0);
    if (expPrevSameDay > 100000 && expThis > 100000) {
      const diff = expThis - expPrevSameDay;
      const pct = Math.abs(Math.round(diff / expPrevSameDay * 100));
      if (pct >= 15) {
        if (diff > 0) insights.push({
          emoji: '⚠️',
          text: `Chi tiêu <strong>${pct}%</strong> nhiều hơn cùng kỳ tháng trước (chênh <strong>${fmt(diff)}đ</strong>). Xem lại để cân đối.`
        });
        else insights.push({
          emoji: '✅',
          text: `Chi tiêu <strong>${pct}%</strong> ít hơn cùng kỳ tháng trước (tiết kiệm <strong>${fmt(-diff)}đ</strong>). Giỏi!`
        });
      }
    }

    // 2) Top danh mục chi tháng này
    const catSpend = {};
    for (const t of txs) {
      if (t.type === 'expense' && t.date.startsWith(ym)) {
        catSpend[t.categoryId] = (catSpend[t.categoryId] || 0) + t.amount;
      }
    }
    const top = Object.entries(catSpend).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] > 0 && expThis > 0) {
      const cat = this.state.categories.find(c => c.id === top[0]);
      const pct = Math.round(top[1] / expThis * 100);
      if (cat && pct >= 25) {
        insights.push({
          emoji: '📊',
          text: `<strong>${this.escapeHtml(cat.name)}</strong> chiếm <strong>${pct}%</strong> chi tiêu tháng (<strong>${fmt(top[1])}đ</strong>) — danh mục đáng chú ý nhất.`
        });
      }
    }

    // 3) Tỷ lệ tiết kiệm tháng này (nếu có thu nhập)
    if (incThis > 0) {
      const saving = incThis - expThis;
      const savingPct = Math.round(saving / incThis * 100);
      if (saving > 0 && savingPct >= 10) {
        insights.push({
          emoji: '🎉',
          text: `Tháng này tiết kiệm được <strong>${fmt(saving)}đ</strong> (${savingPct}% thu nhập). Đỉnh!`
        });
      } else if (saving < 0) {
        insights.push({
          emoji: '😬',
          text: `Tháng này chi <strong>${fmt(-saving)}đ</strong> nhiều hơn thu. Cần cẩn trọng.`
        });
      }
    }

    // 4) Sổ tiết kiệm sắp đáo hạn
    const upcomingSavings = this.state.accounts.filter(a =>
      this.isActiveSavings(a) && a.maturityDate
    ).map(a => {
      const days = Math.ceil((new Date(a.maturityDate) - now) / 86400000);
      return { acc: a, days };
    }).filter(x => x.days >= 0 && x.days <= 14);
    if (upcomingSavings.length > 0) {
      const s = upcomingSavings[0];
      insights.push({
        emoji: '💎',
        text: `Sổ <strong>${this.escapeHtml(s.acc.name)}</strong> sẽ đáo hạn trong <strong>${s.days} ngày</strong> (lãi dự kiến ${fmt(this.savingsExpectedInterest(s.acc))}đ).`
      });
    }

    // 5) Khoản nợ quá hạn / sắp đến hạn
    const todayStr = today();
    const overdueLoans = this.state.loans.filter(l =>
      l.status !== 'closed' && l.dueDate && l.dueDate <= todayStr
    );
    if (overdueLoans.length > 0) {
      const total = overdueLoans.reduce((s, l) => s + this.loanRemaining(l), 0);
      insights.push({
        emoji: '🔴',
        text: `<strong>${overdueLoans.length}</strong> khoản nợ quá hạn (tổng <strong>${fmt(total)}đ</strong>). Liên hệ đối tác.`
      });
    }

    // 6) Ngân sách sắp vượt
    const overBudgets = (this.state.budgets || []).filter(b => {
      const spent = txs.filter(t => t.type === 'expense' &&
        t.date.startsWith(ym) && t.categoryId === b.categoryId).reduce((s, t) => s + t.amount, 0);
      return b.amount > 0 && spent / b.amount >= 0.8;
    });
    if (overBudgets.length > 0) {
      insights.push({
        emoji: '🎯',
        text: `<strong>${overBudgets.length}</strong> ngân sách đang ở mức ≥80%. Vào tab Ngân sách kiểm tra.`
      });
    }

    if (insights.length === 0) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = `
      <div class="insights-card">
        <div class="insights-head">💡 Phân tích tài chính</div>
        ${insights.slice(0, 4).map(i => `
          <div class="insight-row">
            <div class="insight-emoji">${i.emoji}</div>
            <div class="insight-text">${i.text}</div>
          </div>
        `).join('')}
      </div>
    `;
  },

  scrollToSavings() {
    const el = $('#homeSavings');
    if (el && el.style.display !== 'none') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  renderHomeForecast() {
    const wrap = $('#homeForecast');
    if (!wrap) return;
    const now = new Date();
    const ym = now.toISOString().slice(0, 7);
    const dayOfMonth = now.getDate();
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const remainDays = totalDays - dayOfMonth;
    const monthLabel = `T${now.getMonth() + 1}`;

    // Đã chi tháng này (loại _adjustment — không phải chi thật)
    const spent = this.state.transactions
      .filter(t => this.isRealExpense(t) && t.date.startsWith(ym))
      .reduce((s, t) => s + t.amount, 0);

    // Cần ít nhất 2 ngày data + có chi mới dự báo có ý nghĩa
    if (dayOfMonth < 2 || spent === 0) { wrap.style.display = 'none'; return; }

    const avgPerDay = spent / dayOfMonth;
    const forecast = Math.round(spent + avgPerDay * remainDays);

    // ===== So sánh với TRUNG BÌNH 3 tháng gần nhất (ổn định hơn 1 tháng) =====
    // Chỉ hiển thị nếu có ít nhất 1 tháng có data đủ (≥ 30% forecast hiện tại)
    // — tránh "tháng trước = 1.3M, tháng này = 21M → +1539%" gây hoảng vô lý
    const last3Months = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.toISOString().slice(0, 7);
      const sum = this.state.transactions
        .filter(t => this.isRealExpense(t) && t.date.startsWith(m))
        .reduce((s, t) => s + t.amount, 0);
      if (sum > 0) last3Months.push({ ym: m, label: `T${d.getMonth() + 1}`, sum });
    }
    const validMonths = last3Months.filter(m => m.sum >= forecast * 0.3);
    let trend = 'flat', cmpHtml = '';
    if (validMonths.length > 0) {
      const avgPrev = validMonths.reduce((s, m) => s + m.sum, 0) / validMonths.length;
      const diff = forecast - avgPrev;
      const pct = Math.round(Math.abs(diff) / avgPrev * 100);
      const baselineLabel = validMonths.length >= 2 ? `TB ${validMonths.length} tháng gần` : validMonths[0].label;
      if (diff > avgPrev * 0.05) {
        trend = 'up';
        cmpHtml = `<span class="forecast-compare up">▲ +${pct}% so với ${baselineLabel} (${fmt(Math.round(avgPrev))} đ)</span>`;
      } else if (diff < -avgPrev * 0.05) {
        trend = 'down';
        cmpHtml = `<span class="forecast-compare down">▼ -${pct}% so với ${baselineLabel} (${fmt(Math.round(avgPrev))} đ)</span>`;
      } else {
        cmpHtml = `<span class="forecast-compare flat">≈ tương đương ${baselineLabel} (${fmt(Math.round(avgPrev))} đ)</span>`;
      }
    } else {
      // Không đủ data tháng trước → hint thay vì so sánh sai
      cmpHtml = `<span class="forecast-compare flat" style="opacity:.7">📊 Đang tháng đầu — chưa đủ data để so sánh</span>`;
    }

    // ===== Action hint =====
    // Tính mức chi/ngày cần giữ để KHÔNG vượt forecast hoặc baseline trước
    let hintHtml = '';
    if (remainDays > 0) {
      // Giữ ≤ X đ/ngày để forecast không tăng thêm
      const safeDailyCap = Math.round(avgPerDay); // = giữ nguyên tốc độ hiện tại
      hintHtml = `<div class="forecast-hint">💡 Giữ ≤ <strong>${fmt(safeDailyCap)} đ/ngày</strong> trong ${remainDays} ngày còn lại để không vượt dự báo</div>`;
    }

    // Progress bar: đã chi (xanh) — marker ở vị trí % ngày đã qua
    const dayPct = Math.round(dayOfMonth / totalDays * 100);
    const spentPct = forecast > 0 ? Math.min(100, Math.round(spent / forecast * 100)) : 0;

    wrap.style.display = 'block';
    wrap.innerHTML = `
      <div class="forecast-card ${trend}">
        <div class="forecast-head">📊 Dự báo chi cuối ${monthLabel}</div>
        <div class="forecast-amount ${trend}">~${fmt(forecast)} đ</div>
        ${cmpHtml}
        <div class="forecast-detail">
          Đã chi <strong>${fmt(spent)} đ</strong> · còn <strong>${remainDays} ngày</strong><br>
          TB <strong>${fmt(Math.round(avgPerDay))} đ/ngày</strong>
        </div>
        ${hintHtml}
        <div class="forecast-progress">
          <div class="forecast-progress-spent" style="width:${spentPct}%"></div>
          <div class="forecast-progress-marker" style="left:${dayPct}%" title="Hôm nay"></div>
        </div>
        <div class="forecast-progress-labels">
          <span>Đầu ${monthLabel}</span>
          <span>Hôm nay (${dayPct}%)</span>
          <span>Cuối ${monthLabel}</span>
        </div>
      </div>
    `;
  },

  renderHomeBudgets() {
    const wrap = $('#homeBudgetWidget');
    if (!wrap) return;
    if (!this.state.budgets.length) { wrap.style.display = 'none'; return; }
    const ym = new Date().toISOString().slice(0, 7);
    // Top 3 danh mục có % cao nhất
    const top = this.state.budgets
      .map(b => ({ b, st: this.budgetStatus(b, ym) }))
      .sort((a, b) => b.st.pct - a.st.pct)
      .slice(0, 3);

    wrap.style.display = 'block';
    wrap.innerHTML = `
      <div class="section">
        <div class="sec-label">Ngân sách chi tiêu <span class="sec-action" onclick="QLT_App.switchTab('budgets')">Quản lý →</span></div>
      </div>
      <div class="home-budget-list">
        ${top.map(({ b, st }) => {
          const cat = this.state.categories.find(c => c.id === b.categoryId) || {};
          const barW = Math.min(100, st.pct);
          return `
            <div class="home-budget-row" onclick="QLT_App.switchTab('budgets')">
              <div class="home-budget-row-top">
                <span>${this.escapeHtml(cat.name || 'Không rõ')}</span>
                <span style="font-size:12px;color:${st.status === 'over' ? 'var(--danger)' : (st.status === 'warn' ? '#b45309' : 'var(--text2)')}">${st.pct}%</span>
              </div>
              <div class="home-budget-row-bar"><div class="home-budget-row-bar-fill ${st.status}" style="width:${barW}%"></div></div>
              <div class="home-budget-row-amts">
                <span>${fmt(st.spent)} / ${fmt(st.limit)} đ</span>
                <span>${st.remain >= 0 ? 'Còn ' + fmt(st.remain) : 'Quá ' + fmt(-st.remain)} đ</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  // Tính chi trung bình theo category 5 tháng gần nhất (chỉ tháng có chi)
  _budgetAvgSpending(catId) {
    const out = { months: [], avg: 0, currentMonth: 0 };
    const now = new Date();
    const txs = this.state.transactions || [];
    let total = 0, count = 0;
    // Duyệt 6 tháng (T-5 → tháng này) — current riêng
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = d.toISOString().slice(0, 7);
      const monthSpent = txs.filter(t => t.type === 'expense' && t.categoryId === catId && t.date.startsWith(ym))
        .reduce((s, t) => s + t.amount, 0);
      const label = i === 0 ? `${d.getMonth() + 1}` : (d.getMonth() === 0 ? `1/${d.getFullYear()}` : `${d.getMonth() + 1}`);
      out.months.push({ label, ym, amount: monthSpent, isCurrent: i === 0 });
      if (i === 0) {
        out.currentMonth = monthSpent;
      } else if (monthSpent > 0) {
        // Chỉ tính tháng có chi (như MoMo)
        total += monthSpent;
        count++;
      }
    }
    out.avg = count > 0 ? Math.round(total / count) : 0;
    return out;
  },

  // Top 2-3 danh mục đề xuất budget — dựa trên TB chi 3 tháng gần nhất, chưa có budget
  _budgetSuggested(excludeCatIds) {
    const cats = this.state.categories.filter(c => c.type === 'expense'
      && !excludeCatIds.includes(c.id)
      && !this.state.categories.some(x => x.parentId === c.id)); // bỏ category cha có con
    const scored = cats.map(c => {
      const stats = this._budgetAvgSpending(c.id);
      return { cat: c, suggested: stats.avg };
    }).filter(x => x.suggested >= 50000); // Chỉ đề xuất nếu TB ≥ 50k
    scored.sort((a, b) => b.suggested - a.suggested);
    // Round to nice numbers (lên đến hàng trăm nghìn gần nhất)
    return scored.slice(0, 3).map(x => ({
      cat: x.cat,
      suggested: Math.ceil(x.suggested / 100000) * 100000
    }));
  },

  openBudgetModal(budgetId) {
    const isNew = !budgetId;
    let budget;
    if (isNew) {
      budget = { id: null, categoryId: '', amount: 0 };
    } else {
      budget = JSON.parse(JSON.stringify(this.state.budgets.find(b => b.id === budgetId) || {}));
    }
    this.state.editingBudget = budget;

    $('#budgetDelete').style.display = isNew ? 'none' : '';

    // Danh mục chi — loại trừ những danh mục đã có ngân sách (trừ khi đang sửa)
    const usedCatIds = this.state.budgets
      .filter(b => b.id !== budget.id)
      .map(b => b.categoryId);
    const availableCats = this.state.categories
      .filter(c => c.type === 'expense' && !usedCatIds.includes(c.id)
        && !this.state.categories.some(x => x.parentId === c.id));

    if (isNew && !availableCats.length) {
      QLT_UI.alert('Tất cả danh mục chi đã có ngân sách. Hãy sửa khoản hiện có hoặc thêm danh mục mới.', { title: 'Hết danh mục' });
      return;
    }

    if (isNew) {
      // STEP 1: pick category
      $('#budgetModalTitle').textContent = 'Tạo ngân sách';
      $('#budgetStep1').style.display = 'block';
      $('#budgetStep2').style.display = 'none';
      $('#budgetSave').textContent = 'Tạo ngân sách';
      $('#budgetSave').style.display = 'none'; // Ẩn save ở step 1, chỉ hiện ở step 2
      $('#budgetBack').style.display = 'none';

      // Render suggested
      const suggested = this._budgetSuggested(usedCatIds);
      const suggSection = $('#budgetSuggestSection');
      if (suggested.length > 0) {
        suggSection.style.display = 'block';
        $('#budgetSuggestList').innerHTML = suggested.map(s => {
          const emoji = (s.cat.icon || '').startsWith('emoji:') ? s.cat.icon.slice(6) : '📁';
          return `
            <div class="budget-cat-row" data-cat="${s.cat.id}" data-suggest="${s.suggested}" style="background:linear-gradient(135deg,rgba(168,85,247,0.04),rgba(236,72,153,0.04))">
              <div class="budget-cat-row-icon" style="background:${s.cat.color || '#888'}1a">${emoji}</div>
              <div style="flex:1;min-width:0">
                <div class="budget-cat-row-name">${this.escapeHtml(s.cat.name)}</div>
                <div class="budget-cat-row-suggest">Đề xuất <strong>${fmt(s.suggested)} đ</strong></div>
              </div>
              <div class="budget-cat-row-arrow">›</div>
            </div>
          `;
        }).join('');
      } else {
        suggSection.style.display = 'none';
      }

      // Render all available categories
      $('#budgetCatList').innerHTML = availableCats.map(c => {
        const emoji = (c.icon || '').startsWith('emoji:') ? c.icon.slice(6) : '📁';
        return `
          <div class="budget-cat-row" data-cat="${c.id}">
            <div class="budget-cat-row-icon" style="background:${c.color || '#888'}1a">${emoji}</div>
            <div class="budget-cat-row-name">${this.escapeHtml(c.name)}</div>
            <div class="budget-cat-row-arrow">›</div>
          </div>
        `;
      }).join('');

      // Bind clicks → step 2
      $('#budgetModal').querySelectorAll('.budget-cat-row[data-cat]').forEach(el => {
        el.onclick = () => {
          const catId = el.dataset.cat;
          const sugAmount = parseInt(el.dataset.suggest || '0', 10);
          this._budgetGoStep2(catId, sugAmount);
        };
      });
    } else {
      // Edit mode: skip step 1, go straight to step 2
      this._budgetGoStep2(budget.categoryId, budget.amount);
      $('#budgetModalTitle').textContent = 'Sửa ngân sách';
      $('#budgetSave').textContent = 'Lưu thay đổi';
      $('#budgetBack').style.display = 'none';
    }

    $('#budgetModal').classList.add('open');
  },

  _budgetGoStep2(catId, prefillAmount) {
    const cat = this.state.categories.find(c => c.id === catId);
    if (!cat) return;
    const b = this.state.editingBudget;
    if (!b) return;
    b.categoryId = catId;
    b.amount = prefillAmount || 0;

    $('#budgetStep1').style.display = 'none';
    $('#budgetStep2').style.display = 'block';
    $('#budgetSave').style.display = '';
    // Chỉ show back nếu đang TẠO MỚI (không phải sửa)
    $('#budgetBack').style.display = b.id ? 'none' : '';

    // Pick card
    const emoji = (cat.icon || '').startsWith('emoji:') ? cat.icon.slice(6) : '📁';
    $('#budgetPickIcon').textContent = emoji;
    $('#budgetPickIcon').style.background = (cat.color || '#888') + '20';
    $('#budgetPickName').textContent = cat.name;

    // Amount field
    $('#budgetAmount').value = prefillAmount > 0 ? fmt(prefillAmount) : '';

    // Trend chart + average reference
    const stats = this._budgetAvgSpending(catId);
    this._drawBudgetTrendChart($('#budgetTrendChart'), stats);

    // Description
    const desc = stats.avg > 0
      ? `Xu hướng chi <strong>${this.escapeHtml(cat.name)}</strong> 6 tháng gần đây`
      : `Bạn chưa có giao dịch <strong>${this.escapeHtml(cat.name)}</strong> trong 6 tháng. Hãy đặt mức bạn muốn giữ.`;
    $('#budgetTrendDesc').innerHTML = desc;
  },

  _drawBudgetTrendChart(canvas, stats) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const cs = getComputedStyle(document.documentElement);
    const text2Color = (cs.getPropertyValue('--text2') || '#666').trim();
    const text3Color = (cs.getPropertyValue('--text3') || '#aaa').trim();
    const accent2 = (cs.getPropertyValue('--accent2') || '#e76f51').trim();

    const padTop = 28, padBottom = 28, padLeft = 8, padRight = 8;
    const innerW = W - padLeft - padRight;
    const innerH = H - padTop - padBottom;

    const months = stats.months;
    if (!months.length) return;
    const maxVal = Math.max(stats.avg, ...months.map(m => m.amount), 1);
    const barW = Math.min(34, innerW / months.length * 0.7);
    const groupW = innerW / months.length;

    // Vẽ từng cột
    months.forEach((m, i) => {
      const cx = padLeft + i * groupW + groupW / 2;
      const x = cx - barW / 2;
      const h = m.amount / maxVal * innerH;
      const y = padTop + innerH - h;

      // Bar — current = đậm, past = nhạt
      ctx.fillStyle = m.isCurrent ? '#1976d2' : '#bcdaf2';
      ctx.beginPath();
      const r = 4;
      if (h >= r * 2) {
        ctx.moveTo(x, y + h);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.lineTo(x + barW - r, y);
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
        ctx.lineTo(x + barW, y + h);
        ctx.closePath();
        ctx.fill();
      } else if (h > 0) {
        ctx.fillRect(x, y, barW, h);
      }

      // Label dưới
      ctx.fillStyle = m.isCurrent ? '#1976d2' : text3Color;
      ctx.font = m.isCurrent ? '700 11px DM Sans, sans-serif' : '11px DM Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.label, cx, padTop + innerH + 14);

      // Tooltip cho cột current (số tiền)
      if (m.isCurrent && m.amount > 0) {
        const tipText = fmt(m.amount) + 'đ';
        ctx.font = '700 11px DM Sans, sans-serif';
        const tw = ctx.measureText(tipText).width + 14;
        const tx = cx - tw / 2;
        const ty = y - 24;
        ctx.fillStyle = '#fff';
        ctx.fillRect(tx, ty, tw, 18);
        ctx.strokeStyle = '#1976d2';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(tx, ty, tw, 18);
        ctx.fillStyle = '#1976d2';
        ctx.fillText(tipText, cx, ty + 13);
        // Dotted line từ tip xuống cột
        ctx.strokeStyle = '#1976d2';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, ty + 18);
        ctx.lineTo(cx, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // Đường trung bình (dashed pink)
    if (stats.avg > 0) {
      const avgY = padTop + innerH - (stats.avg / maxVal * innerH);
      ctx.strokeStyle = accent2;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(padLeft, avgY);
      ctx.lineTo(padLeft + innerW, avgY);
      ctx.stroke();
      ctx.setLineDash([]);
      // Tag số TB
      const avgText = fmt(stats.avg) + 'đ';
      ctx.font = '700 10px DM Sans, sans-serif';
      const tw2 = ctx.measureText(avgText).width + 10;
      ctx.fillStyle = accent2;
      ctx.fillRect(padLeft, avgY - 16, tw2, 14);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(avgText, padLeft + 5, avgY - 6);
    }
  },

  async saveBudget() {
    const b = this.state.editingBudget;
    if (!b) return;
    // categoryId đã set ở step 2 (_budgetGoStep2). Chỉ đọc amount lại.
    b.amount = readAmount($('#budgetAmount'));
    b.bookId = b.bookId || this.state.currentBookId;

    if (!b.categoryId) { QLT_UI.toast('Vui lòng chọn danh mục', { type: 'error' }); return; }
    if (b.amount <= 0) { QLT_UI.toast('Vui lòng nhập ngân sách', { type: 'error' }); return; }

    await window.QLT_Store.put('budgets', b);
    await this.reload();
    $('#budgetModal').classList.remove('open');
    this.renderBudgets();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
    QLT_UI.toast('Đã lưu ngân sách', { type: 'success' });
  },

  async deleteBudget() {
    const b = this.state.editingBudget;
    if (!b?.id) return;
    if (!await QLT_UI.confirm('Xoá ngân sách này? Các giao dịch chi không bị ảnh hưởng.', { okLabel: 'Xoá', danger: true })) return;
    await window.QLT_Store.del('budgets', b.id);
    await this.reload();
    $('#budgetModal').classList.remove('open');
    this.renderBudgets();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
  },

  // ============ GOALS (Mục tiêu tiết kiệm) ============
  goalContributed(g) {
    return (g.contributions || []).reduce((s, c) => s + (c.amount || 0), 0);
  },

  goalContributedInMonth(g, ym) {
    return (g.contributions || []).filter(c => c.date && c.date.startsWith(ym))
      .reduce((s, c) => s + (c.amount || 0), 0);
  },

  // Số tháng giữa 2 ngày (start, end) — count of month boundaries crossed, ≥1
  goalMonthsBetween(startDate, endDate) {
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
    return Math.max(1, months);
  },

  // Ban đầu khi tạo: chia đều = target / plannedMonths
  goalOriginalMonthly(g) {
    return Math.round((g.targetAmount || 0) / Math.max(1, g.plannedMonths || 1));
  },

  // Tháng này phải đóng bao nhiêu (theo strategy)
  goalMonthlyTarget(g) {
    const contributed = this.goalContributed(g);
    const remaining = Math.max(0, (g.targetAmount || 0) - contributed);
    if (remaining === 0) return 0;

    if (g.catchUpStrategy === 'extend') {
      // Giữ số ban đầu — deadline tự dời
      return this.goalOriginalMonthly(g);
    }
    // 'spread': chia đều phần còn lại cho số tháng còn lại tới deadline
    const todayStr = today();
    const deadline = g.targetDate || todayStr;
    if (deadline <= todayStr) {
      // Đã hết hạn → cần đóng nốt phần còn lại NGAY
      return remaining;
    }
    const monthsLeft = this.goalMonthsBetween(todayStr.slice(0, 8) + '01', deadline);
    return Math.round(remaining / Math.max(1, monthsLeft));
  },

  // Dự kiến hoàn thành (chỉ dùng khi 'extend')
  goalForecastEnd(g) {
    if (g.catchUpStrategy !== 'extend') return g.targetDate;
    const remaining = Math.max(0, (g.targetAmount || 0) - this.goalContributed(g));
    const monthly = this.goalOriginalMonthly(g);
    if (monthly <= 0 || remaining === 0) return g.targetDate;
    const monthsNeeded = Math.ceil(remaining / monthly);
    const d = new Date();
    d.setMonth(d.getMonth() + monthsNeeded);
    return d.toISOString().slice(0, 10);
  },

  // Trạng thái tổng thể
  goalStatus(g) {
    const contributed = this.goalContributed(g);
    if (contributed >= (g.targetAmount || 0)) return 'achieved';
    const todayStr = today();
    const deadline = g.targetDate || todayStr;
    if (deadline < todayStr) return 'overdue';
    // Tính tỉ lệ thời gian đã trôi vs tỉ lệ tiền đã đóng
    const start = g.startDate || todayStr;
    const totalDays = (new Date(deadline) - new Date(start)) / 86400000;
    const passedDays = (new Date(todayStr) - new Date(start)) / 86400000;
    const expectedPct = totalDays > 0 ? passedDays / totalDays : 0;
    const actualPct = (g.targetAmount || 0) > 0 ? contributed / g.targetAmount : 0;
    return actualPct >= expectedPct - 0.05 ? 'on-track' : 'behind';
  },

  // Trạng thái tháng hiện tại
  goalMonthStatus(g) {
    const ym = new Date().toISOString().slice(0, 7);
    const contributedThisMonth = this.goalContributedInMonth(g, ym);
    const target = this.goalMonthlyTarget(g);
    if (target === 0) return { kind: 'achieved', label: '✅ Đã đạt mục tiêu', remain: 0, contributed: contributedThisMonth, target: 0 };
    if (contributedThisMonth >= target) return { kind: 'done', label: '✅ Đã đóng đủ', remain: 0, contributed: contributedThisMonth, target };
    // Chưa đủ — cảnh báo theo ngày trong tháng
    const now = new Date();
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const dayPct = dayOfMonth / totalDays;
    if (dayPct >= 0.85) return { kind: 'overdue', label: '🚨 Cuối tháng — cần đóng gấp', remain: target - contributedThisMonth, contributed: contributedThisMonth, target };
    if (dayPct >= 0.5 || contributedThisMonth > 0) return { kind: 'behind', label: '⚠️ Còn thiếu tháng này', remain: target - contributedThisMonth, contributed: contributedThisMonth, target };
    return { kind: 'upcoming', label: '🕐 Chưa đóng tháng này', remain: target, contributed: 0, target };
  },

  // Lên kế hoạch hint khi tạo/sửa goal
  recalcGoalPlanHint() {
    const target = readAmount($('#goalTarget'));
    const start = $('#goalStart').value || today();
    const deadline = $('#goalDeadline').value;
    const hint = $('#goalPlanHint');
    if (!target || !deadline) {
      hint.innerHTML = '💡 Nhập số tiền + deadline để xem kế hoạch tháng.';
      return;
    }
    if (deadline <= start) {
      hint.innerHTML = '⚠️ Deadline phải SAU ngày bắt đầu.';
      return;
    }
    const months = this.goalMonthsBetween(start, deadline);
    const monthly = Math.round(target / months);
    hint.innerHTML = `📊 Cần đóng <strong>${fmt(monthly)} đ/tháng</strong> trong <strong>${months} tháng</strong> (đến ${this.formatDate(deadline)}).`;
  },

  renderGoals() {
    const goals = this.state.goals.filter(g => g.status !== 'cancelled');
    goals.sort((a, b) => {
      // 'achieved' xuống cuối
      const aDone = this.goalContributed(a) >= a.targetAmount ? 1 : 0;
      const bDone = this.goalContributed(b) >= b.targetAmount ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return (a.targetDate || '').localeCompare(b.targetDate || '');
    });

    // Tổng cam kết / đã đóng tháng này
    const ym = new Date().toISOString().slice(0, 7);
    const totalCommit = goals.reduce((s, g) => s + this.goalMonthlyTarget(g), 0);
    const totalDone = goals.reduce((s, g) => s + this.goalContributedInMonth(g, ym), 0);
    const pct = totalCommit > 0 ? Math.min(100, Math.round(totalDone / totalCommit * 100)) : 0;
    $('#goalMonthlyTotal').textContent = fmt(totalCommit) + ' đ';
    $('#goalMonthlyDone').textContent = fmt(totalDone) + ' đ';
    $('#goalMonthlyBarFill').style.width = pct + '%';

    const list = $('#goalList');
    if (!goals.length) {
      list.innerHTML = `
        <div class="empty-msg">
          Chưa có mục tiêu nào.<br>
          Bấm <strong>+</strong> để đặt mục tiêu đầu tiên — vd "Mua ô tô", "Du lịch Nhật"...
        </div>`;
      return;
    }

    list.innerHTML = goals.map(g => {
      const contributed = this.goalContributed(g);
      const totalPct = (g.targetAmount || 0) > 0 ? Math.min(100, Math.round(contributed / g.targetAmount * 100)) : 0;
      const status = this.goalStatus(g);
      const monthStatus = this.goalMonthStatus(g);
      const remaining = Math.max(0, (g.targetAmount || 0) - contributed);

      let metaText = '';
      if (status === 'achieved') {
        metaText = `🎉 Hoàn thành! Tổng ${fmt(g.targetAmount)} đ`;
      } else {
        const deadline = g.catchUpStrategy === 'extend' ? this.goalForecastEnd(g) : g.targetDate;
        const monthly = this.goalMonthlyTarget(g);
        const months = this.goalMonthsBetween(today().slice(0, 8) + '01', deadline);
        metaText = `${fmt(monthly)} đ/tháng × ${months} tháng → ${this.formatDate(deadline)}${g.catchUpStrategy === 'extend' && deadline !== g.targetDate ? ' (gia hạn)' : ''}`;
      }

      const iconHtml = (g.icon || '').startsWith('emoji:') ? g.icon.slice(6) : '🏆';
      let monthRowHtml = '';
      if (status !== 'achieved') {
        monthRowHtml = `
          <div class="goal-item-month-row ${monthStatus.kind}">
            <span class="goal-item-month-status ${monthStatus.kind}">${monthStatus.label}</span>
            <span style="flex:1;color:var(--text2)">${fmt(monthStatus.contributed)} / ${fmt(monthStatus.target)} đ</span>
            <span class="goal-item-month-cta" data-contrib="${g.id}">+ Đóng</span>
          </div>
        `;
      }

      return `
        <div class="goal-item" data-goal="${g.id}">
          <div class="goal-item-head">
            <div class="goal-item-icon" style="background:${(g.color || '#f59e0b') + '1a'};color:${g.color || '#f59e0b'}">${iconHtml}</div>
            <div class="goal-item-info">
              <div class="goal-item-name">${this.escapeHtml(g.name)}</div>
              <div class="goal-item-meta">${this.escapeHtml(metaText)}</div>
            </div>
            <div class="goal-item-pct">${totalPct}%</div>
          </div>
          <div class="goal-item-bar"><div class="goal-item-bar-fill ${status}" style="width:${totalPct}%"></div></div>
          <div class="goal-item-amts">
            <span>${fmt(contributed)} đ đã đóng</span>
            <span>còn ${fmt(remaining)} đ</span>
          </div>
          ${monthRowHtml}
        </div>
      `;
    }).join('');

    // Bấm dòng (nhưng tránh nút "Đóng")
    list.querySelectorAll('[data-goal]').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('[data-contrib]')) return;
        this.openGoalModal(el.dataset.goal);
      };
    });
    list.querySelectorAll('[data-contrib]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        this.openContribModal(el.dataset.contrib);
      };
    });
  },

  renderHomeGoals() {
    const wrap = $('#homeGoals');
    if (!wrap) return;
    const goals = this.state.goals.filter(g => g.status !== 'cancelled' && this.goalContributed(g) < g.targetAmount);
    if (!goals.length) { wrap.style.display = 'none'; return; }

    // Sort: behind/overdue trước, on-track sau
    goals.sort((a, b) => {
      const order = { overdue: 0, behind: 1, 'on-track': 2, achieved: 3 };
      return (order[this.goalStatus(a)] || 9) - (order[this.goalStatus(b)] || 9);
    });

    // Top 3 hiện trên Home
    const top3 = goals.slice(0, 3);

    wrap.style.display = 'block';
    wrap.innerHTML = `
      <div class="section">
        <div class="sec-label">🏆 Mục tiêu tiết kiệm <span class="sec-action" onclick="QLT_App.switchTab('goals')">Xem tất cả</span></div>
      </div>
      <div class="home-goal-card" onclick="QLT_App.switchTab('goals')">
        ${top3.map(g => {
          const contributed = this.goalContributed(g);
          const totalPct = (g.targetAmount || 0) > 0 ? Math.min(100, Math.round(contributed / g.targetAmount * 100)) : 0;
          const status = this.goalStatus(g);
          const monthStatus = this.goalMonthStatus(g);
          return `
            <div class="home-goal-row">
              <div class="home-goal-row-top">
                <span class="home-goal-row-name">${this.escapeHtml(g.name)}</span>
                <span class="home-goal-row-pct">${totalPct}%</span>
              </div>
              <div class="home-goal-row-bar"><div class="home-goal-row-bar-fill ${status === 'on-track' ? 'ok' : status}" style="width:${totalPct}%"></div></div>
              <div class="home-goal-row-meta">
                <span>${fmt(contributed)} / ${fmt(g.targetAmount)} đ</span>
                <span>${monthStatus.label}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  openGoalModal(goalId) {
    const isNew = !goalId;
    let g;
    if (isNew) {
      const startStr = today();
      const dl = new Date(); dl.setMonth(dl.getMonth() + 12);
      g = {
        id: null,
        name: '',
        targetAmount: 0,
        startDate: startStr,
        targetDate: dl.toISOString().slice(0, 10),
        plannedMonths: 12,
        reminderDay: 5,
        catchUpStrategy: 'spread',
        linkedAccountId: null,
        contributions: [],
        icon: 'emoji:🏆',
        color: '#f59e0b',
        status: 'active'
      };
    } else {
      g = JSON.parse(JSON.stringify(this.state.goals.find(x => x.id === goalId) || {}));
    }
    this.state.editingGoal = g;

    $('#goalModalTitle').textContent = isNew ? 'Thêm mục tiêu' : 'Sửa mục tiêu';
    $('#goalDelete').style.display = isNew ? 'none' : 'block';

    $('#goalName').value = g.name || '';
    $('#goalTarget').value = fmt(g.targetAmount || 0);
    $('#goalStart').value = g.startDate || today();
    $('#goalDeadline').value = g.targetDate || '';
    $('#goalReminderDay').value = String(g.reminderDay || 5);
    $$('input[name="goalStrategy"]').forEach(r => { r.checked = (r.value === (g.catchUpStrategy || 'spread')); });

    // Link account dropdown — chỉ ví savings hoặc payment đều OK
    const accs = this.state.accounts;
    $('#goalLinkAccount').innerHTML = '<option value="">— Không link (mục tiêu ảo, chỉ track) —</option>' +
      accs.map(a => `<option value="${a.id}" ${a.id === g.linkedAccountId ? 'selected' : ''}>${this.escapeHtml(a.name)} (${this.isSavings(a) ? 'TK' : 'TT'})</option>`).join('');

    this.recalcGoalPlanHint();

    this.renderIconPicker({
      containerId: 'goalIconGrid',
      currentIcon: g.icon || 'emoji:🏆',
      allowEmoji: true,
      onPick: (icon) => { this.state.editingGoal.icon = icon; }
    });

    $('#goalModal').classList.add('open');
  },

  async saveGoal() {
    const g = this.state.editingGoal;
    if (!g) return;
    g.name = $('#goalName').value.trim();
    g.targetAmount = readAmount($('#goalTarget'));
    g.startDate = $('#goalStart').value || today();
    g.targetDate = $('#goalDeadline').value || '';
    g.reminderDay = parseInt($('#goalReminderDay').value, 10) || 5;
    const stratEl = $$('input[name="goalStrategy"]').find(r => r.checked);
    g.catchUpStrategy = stratEl ? stratEl.value : 'spread';
    g.linkedAccountId = $('#goalLinkAccount').value || null;
    g.bookId = g.bookId || this.state.currentBookId;
    g.contributions = g.contributions || [];

    if (!g.name) { QLT_UI.toast('Nhập tên mục tiêu', { type: 'error' }); return; }
    if (g.targetAmount <= 0) { QLT_UI.toast('Nhập số tiền cần', { type: 'error' }); return; }
    if (!g.targetDate) { QLT_UI.toast('Chọn deadline', { type: 'error' }); return; }
    if (g.targetDate <= g.startDate) { QLT_UI.toast('Deadline phải sau ngày bắt đầu', { type: 'error' }); return; }

    // Tính plannedMonths — chỉ set lần đầu (giữ nguyên số tháng dự kiến ban đầu)
    if (!g.plannedMonths) {
      g.plannedMonths = this.goalMonthsBetween(g.startDate, g.targetDate);
    }

    if (!g.id) {
      g.createdAt = Date.now();
      g.status = 'active';
    }

    await window.QLT_Store.put('goals', g);
    await this.scheduleGoalNotif(g);
    await this.reload();
    $('#goalModal').classList.remove('open');
    this.renderGoals();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
    QLT_UI.toast('Đã lưu mục tiêu', { type: 'success' });
  },

  async deleteGoal() {
    const g = this.state.editingGoal;
    if (!g?.id) return;
    if (!await QLT_UI.confirm('Xoá mục tiêu này? Các giao dịch chuyển khoản đã tạo sẽ KHÔNG bị xoá.', { okLabel: 'Xoá', danger: true })) return;
    if (window.Capacitor?.Plugins?.LocalNotifications) {
      try {
        const idNum = Math.abs(this.hashCode('goal_' + g.id)) % 2000000;
        await window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: idNum }] });
      } catch (_) {}
    }
    await window.QLT_Store.del('goals', g.id);
    await this.reload();
    $('#goalModal').classList.remove('open');
    this.renderGoals();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
  },

  // ========= Đóng góp (contribution) =========
  openContribModal(goalId) {
    const g = this.state.goals.find(x => x.id === goalId);
    if (!g) return;
    this.state.editingGoal = g;

    const monthStatus = this.goalMonthStatus(g);
    const ym = new Date().toISOString().slice(0, 7);
    const contributedThisMonth = this.goalContributedInMonth(g, ym);

    $('#contribTitle').textContent = `+ Đóng góp: ${g.name}`;
    $('#contribInfo').innerHTML = `
      <div><strong>${this.escapeHtml(g.name)}</strong></div>
      <div style="color:var(--text2)">Tháng này: ${fmt(contributedThisMonth)} / ${fmt(monthStatus.target)} đ — gợi ý đóng <strong>${fmt(monthStatus.remain)} đ</strong> nữa</div>
    `;
    $('#contribAmount').value = fmt(monthStatus.remain || monthStatus.target);
    $('#contribDate').value = today();
    $('#contribNote').value = '';

    if (g.linkedAccountId) {
      $('#contribLinkOptionWrap').style.display = 'block';
      $('#contribCreateTx').checked = true;
      $('#contribFromAccountWrap').style.display = 'block';
      // Ví nguồn: chỉ payment account, không phải ví link
      const sourceAccs = this.state.accounts.filter(a => this.isPayment(a) && a.id !== g.linkedAccountId);
      $('#contribFromAccount').innerHTML = sourceAccs.map(a =>
        `<option value="${a.id}">${this.escapeHtml(a.name)} (${fmt(a.balance)} đ)</option>`
      ).join('');
      $('#contribCreateTx').onchange = () => {
        $('#contribFromAccountWrap').style.display = $('#contribCreateTx').checked ? 'block' : 'none';
      };
    } else {
      $('#contribLinkOptionWrap').style.display = 'none';
      $('#contribFromAccountWrap').style.display = 'none';
    }

    // Lịch sử đóng góp
    this.renderContribHistory(g);

    $('#contribModal').classList.add('open');
  },

  renderContribHistory(g) {
    const wrap = $('#contribHistory');
    const contribs = (g.contributions || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!contribs.length) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = `
      <div class="sec-label" style="padding:0;margin-bottom:8px">Lịch sử đóng góp (${contribs.length})</div>
      ${contribs.map(c => `
        <div class="contrib-row">
          <div style="flex:1">
            <div class="contrib-row-amt">+ ${fmt(c.amount)} đ</div>
            <div class="contrib-row-date">${this.formatDate(c.date)}${c.note ? ' · ' + this.escapeHtml(c.note) : ''}${c.txId ? ' · 🔗 GD' : ''}</div>
          </div>
          <div class="contrib-row-del" data-contrib-del="${c.id}" title="Xoá">${svgIcon('trash')}</div>
        </div>
      `).join('')}
    `;
    wrap.querySelectorAll('[data-contrib-del]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        this.deleteContribution(el.dataset.contribDel);
      };
    });
  },

  async saveContribution() {
    const g = this.state.editingGoal;
    if (!g?.id) return;
    const amount = readAmount($('#contribAmount'));
    const date = $('#contribDate').value || today();
    const note = $('#contribNote').value || '';

    if (amount <= 0) { QLT_UI.toast('Nhập số tiền', { type: 'error' }); return; }

    const contribution = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      date, amount, note,
      txId: null
    };

    // Nếu link account và user check 'create tx' → tạo transfer + lưu txId
    const createTx = $('#contribCreateTx').checked && g.linkedAccountId && $('#contribFromAccountWrap').style.display !== 'none';
    if (createTx) {
      const fromId = $('#contribFromAccount').value;
      if (!fromId) { QLT_UI.toast('Chọn ví nguồn', { type: 'error' }); return; }
      const tx = {
        type: 'transfer',
        amount,
        date,
        accountId: fromId,
        toAccountId: g.linkedAccountId,
        categoryId: null,
        note: note || `Đóng góp mục tiêu: ${g.name}`,
        bookId: this.state.currentBookId
      };
      await this.applyBalanceDelta(tx, +1);
      await window.QLT_Store.put('transactions', tx);
      contribution.txId = tx.id;
    }

    g.contributions = g.contributions || [];
    g.contributions.push(contribution);

    // Auto-mark achieved
    if (this.goalContributed(g) >= g.targetAmount && g.status !== 'achieved') {
      g.status = 'achieved';
      QLT_UI.toast(`🎉 Chúc mừng! Đã đạt mục tiêu "${g.name}"`, { type: 'success' });
    }

    await window.QLT_Store.put('goals', g);
    await this.reload();
    this.state.editingGoal = this.state.goals.find(x => x.id === g.id);

    $('#contribModal').classList.remove('open');
    this.renderGoals();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
    QLT_UI.toast(`Đã ghi nhận đóng góp ${fmt(amount)} đ`, { type: 'success' });
  },

  async deleteContribution(contribId) {
    const g = this.state.editingGoal;
    if (!g?.id) return;
    const c = (g.contributions || []).find(x => x.id === contribId);
    if (!c) return;
    if (!await QLT_UI.confirm('Xoá đóng góp này?' + (c.txId ? ' Giao dịch chuyển khoản tương ứng cũng sẽ bị xoá.' : ''), { okLabel: 'Xoá', danger: true })) return;

    if (c.txId) {
      const oldTx = this.state.transactions.find(t => t.id === c.txId);
      if (oldTx) {
        await this.applyBalanceDelta(oldTx, -1);
        await window.QLT_Store.del('transactions', c.txId);
      }
    }
    g.contributions = g.contributions.filter(x => x.id !== contribId);
    if (this.goalContributed(g) < g.targetAmount && g.status === 'achieved') g.status = 'active';

    await window.QLT_Store.put('goals', g);
    await this.reload();
    this.state.editingGoal = this.state.goals.find(x => x.id === g.id);
    this.renderContribHistory(this.state.editingGoal);
    this.renderGoals();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
  },

  // Notification: ngày X mỗi tháng (9h) + cảnh báo lần 2 ngày 25 nếu chưa đóng đủ
  async scheduleGoalNotif(g) {
    if (!window.Capacitor?.Plugins?.LocalNotifications) return;
    if (g.status === 'achieved' || g.status === 'cancelled') return;
    const LN = window.Capacitor.Plugins.LocalNotifications;
    try {
      await LN.requestPermissions();
      const idMain = Math.abs(this.hashCode('goal_' + g.id)) % 2000000;
      const idLate = Math.abs(this.hashCode('goal_late_' + g.id)) % 2000000;
      try { await LN.cancel({ notifications: [{ id: idMain }, { id: idLate }] }); } catch (_) {}

      const monthly = this.goalMonthlyTarget(g);
      // Lần 1: ngày reminderDay hằng tháng
      await LN.schedule({
        notifications: [{
          id: idMain,
          title: `🏆 ${g.name}`,
          body: `Đến lúc đóng ${fmt(monthly)} đ cho mục tiêu tháng này`,
          schedule: { on: { day: g.reminderDay || 5, hour: 9, minute: 0 } },
          sound: 'default'
        }]
      });
      // Lần 2: ngày 26 nếu cuối tháng vẫn chưa đóng (nhắc nhẹ)
      await LN.schedule({
        notifications: [{
          id: idLate,
          title: `⚠️ ${g.name} — Còn ít ngày`,
          body: `Cuối tháng rồi, kiểm tra xem đã đóng đủ chưa`,
          schedule: { on: { day: 26, hour: 18, minute: 0 } },
          sound: 'default'
        }]
      });
    } catch (e) { console.warn('Goal notif lỗi:', e); }
  },

  // ============ LOANS (Cho vay / Đi vay) ============
  loanRemaining(l) {
    const paid = (l.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    return Math.max(0, (l.principal || 0) - paid);
  },

  loanPaid(l) {
    return (l.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  },

  renderLoans() {
    // Tổng đang cho vay / đang nợ (chỉ tính khoản 'open')
    const openLoans = this.state.loans.filter(l => l.status !== 'closed');
    const totalLend = openLoans.filter(l => l.type === 'lend').reduce((s, l) => s + this.loanRemaining(l), 0);
    const totalBorrow = openLoans.filter(l => l.type === 'borrow').reduce((s, l) => s + this.loanRemaining(l), 0);
    $('#loanTotalLend').textContent = fmt(totalLend) + ' đ';
    $('#loanTotalBorrow').textContent = fmt(totalBorrow) + ' đ';

    // Filter list
    const tab = this.state.loanTab;
    const status = this.state.loanStatusFilter;
    let loans = this.state.loans.filter(l => l.type === tab);
    if (status === 'open') loans = loans.filter(l => l.status !== 'closed');
    else if (status === 'closed') loans = loans.filter(l => l.status === 'closed');
    loans.sort((a, b) => (b.date + (b._updatedAt || '')).localeCompare(a.date + (a._updatedAt || '')));

    const list = $('#loanList');
    if (!loans.length) {
      list.innerHTML = this.emptyState({
        icon: this.state.loanTab === 'lend' ? '💸' : '💰',
        title: this.state.loanTab === 'lend' ? 'Chưa cho ai vay' : 'Chưa nợ ai',
        desc: 'Theo dõi các khoản tiền cho người khác mượn / mượn người khác có hạn trả + nhắc nhở.',
        ctaLabel: '+ Thêm khoản'
      });
      this.bindEmptyCTA(list, () => this.openLoanModal(null));
      return;
    }

    const todayStr = today();
    list.innerHTML = loans.map(l => {
      const remain = this.loanRemaining(l);
      const paid = this.loanPaid(l);
      const pct = l.principal > 0 ? Math.round(paid / l.principal * 100) : 0;
      const isClosed = l.status === 'closed';
      const icon = l.type === 'lend' ? '💸' : '💰';
      const remainCls = isClosed ? 'closed' : l.type;

      let dueHtml = '';
      if (l.dueDate && !isClosed) {
        const overdue = l.dueDate < todayStr;
        dueHtml = `<div class="loan-due ${overdue ? '' : 'ok'}">${overdue ? '⚠️ Quá hạn ' : 'Hạn '}${this.formatDate(l.dueDate)}</div>`;
      }

      return `
        <div class="loan-item" data-loan="${l.id}">
          <div class="loan-item-icon ${l.type}">${icon}</div>
          <div class="loan-item-info">
            <div class="loan-item-name">${this.escapeHtml(l.counterparty || 'Không tên')}</div>
            <div class="loan-item-meta">${this.formatDate(l.date)} · Gốc ${fmt(l.principal)} đ${l.note ? ' · ' + this.escapeHtml(l.note) : ''}</div>
            <div class="loan-item-bar"><div class="loan-item-bar-fill" style="width:${pct}%"></div></div>
            ${dueHtml}
          </div>
          <div class="loan-item-amt">
            <div class="loan-item-remain ${remainCls}">${isClosed ? '✓ Đã đóng' : fmt(remain) + ' đ'}</div>
            <div class="loan-item-progress">${isClosed ? 'Tổng ' + fmt(l.principal) : 'Đã trả ' + pct + '%'}</div>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-loan]').forEach(el => {
      el.onclick = () => this.openLoanModal(el.dataset.loan);
    });
  },

  renderHomeLoanShortcut() {
    const wrap = $('#homeLoanShortcut');
    if (!wrap) return;
    const openLoans = this.state.loans.filter(l => l.status !== 'closed');
    if (!openLoans.length) { wrap.style.display = 'none'; return; }

    const lend = openLoans.filter(l => l.type === 'lend').reduce((s, l) => s + this.loanRemaining(l), 0);
    const borrow = openLoans.filter(l => l.type === 'borrow').reduce((s, l) => s + this.loanRemaining(l), 0);

    if (lend === 0 && borrow === 0) { wrap.style.display = 'none'; return; }

    wrap.style.display = 'block';
    wrap.innerHTML = `
      <div class="section">
        <div class="sec-label">Cho vay / Nợ <span class="sec-action" onclick="QLT_App.switchTab('loans')">Xem tất cả</span></div>
      </div>
      <div class="home-loan-card" onclick="QLT_App.switchTab('loans')">
        <div class="home-loan-card-item">
          <div class="home-loan-card-icon lend">💸</div>
          <div class="home-loan-card-info">
            <div class="home-loan-card-label">Đang cho vay</div>
            <div class="home-loan-card-val">${fmt(lend)} đ</div>
          </div>
        </div>
        <div class="home-loan-card-item">
          <div class="home-loan-card-icon borrow">💰</div>
          <div class="home-loan-card-info">
            <div class="home-loan-card-label">Đang nợ</div>
            <div class="home-loan-card-val">${fmt(borrow)} đ</div>
          </div>
        </div>
      </div>
    `;
  },

  openLoanModal(loanId) {
    const isNew = !loanId;
    let loan;
    if (isNew) {
      loan = {
        id: null,
        type: this.state.loanTab || 'lend',
        counterparty: '',
        principal: 0,
        accountId: this.state.accounts[0]?.id || null,
        date: today(),
        dueDate: '',
        note: '',
        status: 'open',
        payments: []
      };
    } else {
      loan = JSON.parse(JSON.stringify(this.state.loans.find(l => l.id === loanId) || {}));
    }
    this.state.editingLoan = loan;

    $('#loanModalTitle').textContent = isNew ? 'Thêm khoản nợ' : (loan.type === 'lend' ? 'Cho vay' : 'Đi vay') + ': ' + (loan.counterparty || '');
    $('#loanDelete').style.display = isNew ? 'none' : '';
    $('#loanCounterparty').value = loan.counterparty || '';
    $('#loanPrincipal').value = fmt(loan.principal || 0);
    $('#loanDate').value = loan.date || today();
    $('#loanDueDate').value = loan.dueDate || '';
    $('#loanNote').value = loan.note || '';

    // Type pills (chỉ chỉnh được khi tạo mới)
    $$('.loan-type-pill').forEach(el => {
      el.classList.toggle('on', el.dataset.type === loan.type);
      el.style.opacity = isNew ? '1' : '0.5';
      el.style.pointerEvents = isNew ? 'auto' : 'none';
    });

    // Account dropdown
    const accSel = $('#loanAccount');
    accSel.innerHTML = this.state.accounts.map(a =>
      `<option value="${a.id}" ${a.id === loan.accountId ? 'selected' : ''}>${this.escapeHtml(a.name)}</option>`
    ).join('');

    // Payments section (chỉ hiện khi đã có id)
    const paySection = $('#loanPaymentsSection');
    if (isNew) {
      paySection.style.display = 'none';
    } else {
      paySection.style.display = 'block';
      this.renderLoanPayments();
      $('#loanCloseBtn').textContent = loan.status === 'closed' ? '↺ Mở lại khoản' : '✓ Đóng khoản (đã thanh toán xong)';
    }

    $('#loanModal').classList.add('open');
  },

  renderLoanPayments() {
    const loan = this.state.editingLoan;
    if (!loan) return;
    const list = $('#loanPaymentsList');
    const payments = loan.payments || [];
    if (!payments.length) {
      list.innerHTML = '<div class="empty-msg" style="padding:20px">Chưa có lần trả nào</div>';
      return;
    }
    const sorted = [...payments].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    list.innerHTML = sorted.map(p => {
      const acc = this.state.accounts.find(a => a.id === p.accountId);
      return `
        <div class="payment-row">
          <div class="payment-row-info">
            <div><strong>${fmt(p.amount)} đ</strong>${p.note ? ' · ' + this.escapeHtml(p.note) : ''}</div>
            <div class="payment-row-date">${this.formatDate(p.date)} · ${this.escapeHtml(acc?.name || '')}</div>
          </div>
          <div class="payment-row-del" data-pay="${p.id}" title="Xoá">${svgIcon('trash')}</div>
        </div>
      `;
    }).join('');
    list.querySelectorAll('[data-pay]').forEach(el => {
      el.onclick = (e) => { e.stopPropagation(); this.deletePayment(el.dataset.pay); };
    });
  },

  async saveLoan() {
    const loan = this.state.editingLoan;
    if (!loan) return;
    loan.counterparty = $('#loanCounterparty').value.trim();
    loan.principal = readAmount($('#loanPrincipal'));
    loan.accountId = $('#loanAccount').value;
    loan.date = $('#loanDate').value || today();
    loan.dueDate = $('#loanDueDate').value || '';
    loan.note = $('#loanNote').value || '';
    loan.bookId = loan.bookId || this.state.currentBookId;
    loan.payments = loan.payments || [];

    if (!loan.counterparty) { QLT_UI.toast('Vui lòng nhập tên người', { type: 'error' }); return; }
    if (loan.principal <= 0) { QLT_UI.toast('Vui lòng nhập số tiền', { type: 'error' }); return; }
    if (!loan.accountId) { QLT_UI.toast('Vui lòng chọn ví', { type: 'error' }); return; }

    const isNew = !loan.id;
    if (isNew) {
      loan.status = 'open';
      loan.createdAt = Date.now();
    }

    // Lưu loan trước để có id (nếu mới)
    const saved = await window.QLT_Store.put('loans', loan);

    // Khi tạo mới: sinh giao dịch tương ứng (xuất hiện trong danh sách Giao dịch)
    // - lend  → expense, danh mục "Cho vay"
    // - borrow → income, danh mục "Đi vay"
    if (isNew) {
      const catKey = loan.type === 'lend' ? 'lend' : 'borrow';
      const cat = await this.ensureLoanCategory(loan.bookId, catKey);
      const tx = {
        type: loan.type === 'lend' ? 'expense' : 'income',
        amount: loan.principal,
        date: loan.date,
        accountId: loan.accountId,
        categoryId: cat?.id || null,
        note: loan.type === 'lend'
          ? `Cho ${loan.counterparty} vay`
          : `Vay từ ${loan.counterparty}`,
        bookId: loan.bookId,
        _loanId: saved.id
      };
      await this.applyBalanceDelta(tx, +1);
      const savedTx = await window.QLT_Store.put('transactions', tx);
      saved._principalTxId = savedTx.id;
      await window.QLT_Store.put('loans', saved);
    }

    await this.scheduleLoanNotif(saved);
    await this.reload();
    $('#loanModal').classList.remove('open');
    this.renderLoans();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
    QLT_UI.toast(isNew ? 'Đã thêm khoản nợ' : 'Đã cập nhật', { type: 'success' });
  },

  async deleteLoan() {
    const loan = this.state.editingLoan;
    if (!loan?.id) return;
    if (!await QLT_UI.confirm('Xoá khoản này? Hệ thống sẽ HOÀN TÁC tất cả tác động lên ví (cả khoản gốc lẫn các lần trả).', { okLabel: 'Xoá', danger: true })) return;

    // Hoàn tác khoản gốc:
    // - Loan mới (có _principalTxId): xoá tx liên kết, applyBalanceDelta tự cập nhật ví
    // - Loan cũ (không có): direct mutate balance như trước (legacy fallback)
    if (loan._principalTxId) {
      const tx = (await window.QLT_Store.getAll('transactions')).find(t => t.id === loan._principalTxId);
      if (tx) {
        await this.applyBalanceDelta(tx, -1);
        await window.QLT_Store.del('transactions', tx.id);
      }
    } else {
      const acc = this.state.accounts.find(a => a.id === loan.accountId);
      if (acc) {
        acc.balance += (loan.type === 'lend' ? +1 : -1) * loan.principal;
        await window.QLT_Store.put('accounts', acc);
      }
    }
    // Hoàn tác từng lần trả tương tự
    for (const p of (loan.payments || [])) {
      if (p.txId) {
        const tx = (await window.QLT_Store.getAll('transactions')).find(t => t.id === p.txId);
        if (tx) {
          await this.applyBalanceDelta(tx, -1);
          await window.QLT_Store.del('transactions', tx.id);
        }
      } else {
        const pa = this.state.accounts.find(a => a.id === p.accountId);
        if (pa) {
          pa.balance += (loan.type === 'lend' ? -1 : +1) * p.amount;
          await window.QLT_Store.put('accounts', pa);
        }
      }
    }

    // Cancel notif
    if (window.Capacitor?.Plugins?.LocalNotifications) {
      try {
        const idNum = Math.abs(this.hashCode('loan_' + loan.id)) % 2000000;
        await window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: idNum }] });
      } catch (_) {}
    }

    await window.QLT_Store.del('loans', loan.id);
    await this.reload();
    $('#loanModal').classList.remove('open');
    this.renderLoans();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
  },

  openPaymentModal() {
    const loan = this.state.editingLoan;
    if (!loan?.id) return;
    const remain = this.loanRemaining(loan);
    $('#paymentModalTitle').textContent = (loan.type === 'lend' ? '✅ Nhận trả nợ từ ' : '💳 Trả nợ cho ') + (loan.counterparty || '');
    $('#paymentAmount').value = fmt(remain);
    $('#paymentDate').value = today();
    $('#paymentNote').value = '';
    $('#paymentAccount').innerHTML = this.state.accounts.map(a =>
      `<option value="${a.id}" ${a.id === loan.accountId ? 'selected' : ''}>${this.escapeHtml(a.name)}</option>`
    ).join('');
    $('#paymentModal').classList.add('open');
  },

  async savePayment() {
    const loan = this.state.editingLoan;
    if (!loan?.id) return;
    const amount = readAmount($('#paymentAmount'));
    const date = $('#paymentDate').value || today();
    const accountId = $('#paymentAccount').value;
    const note = $('#paymentNote').value || '';

    if (amount <= 0) { QLT_UI.toast('Vui lòng nhập số tiền', { type: 'error' }); return; }
    if (!accountId) { QLT_UI.toast('Vui lòng chọn ví', { type: 'error' }); return; }

    const remain = this.loanRemaining(loan);
    if (amount > remain) {
      if (!await QLT_UI.confirm(`Số tiền ${fmt(amount)} đ lớn hơn số còn lại (${fmt(remain)} đ). Vẫn ghi nhận?`, { okLabel: 'Ghi nhận' })) return;
    }

    const payment = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      date, amount, accountId, note,
      createdAt: Date.now()
    };
    loan.payments = loan.payments || [];
    loan.payments.push(payment);

    // Tạo giao dịch tương ứng:
    // - lend-payment: đối tác trả mình → income, danh mục 'Nhận trả nợ'
    // - borrow-payment: mình trả đối tác → expense, danh mục 'Trả nợ'
    const catKey = loan.type === 'lend' ? 'lendRepay' : 'borrowRepay';
    const cat = await this.ensureLoanCategory(loan.bookId, catKey);
    const tx = {
      type: loan.type === 'lend' ? 'income' : 'expense',
      amount,
      date,
      accountId,
      categoryId: cat?.id || null,
      note: note || (loan.type === 'lend'
        ? `${loan.counterparty} trả nợ`
        : `Trả ${loan.counterparty}`),
      bookId: loan.bookId,
      _loanId: loan.id,
      _paymentId: payment.id
    };
    await this.applyBalanceDelta(tx, +1);
    const savedTx = await window.QLT_Store.put('transactions', tx);
    payment.txId = savedTx.id;

    // Tự đóng nếu trả đủ
    if (this.loanRemaining(loan) === 0) {
      loan.status = 'closed';
    }

    await window.QLT_Store.put('loans', loan);
    await this.reload();
    // Refresh editingLoan từ state mới
    this.state.editingLoan = this.state.loans.find(l => l.id === loan.id);
    $('#paymentModal').classList.remove('open');
    this.renderLoanPayments();
    $('#loanCloseBtn').textContent = this.state.editingLoan.status === 'closed' ? '↺ Mở lại khoản' : '✓ Đóng khoản (đã thanh toán xong)';
    this.renderLoans();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
    QLT_UI.toast('Đã ghi nhận trả tiền', { type: 'success' });
  },

  async deletePayment(payId) {
    const loan = this.state.editingLoan;
    if (!loan?.id) return;
    const p = (loan.payments || []).find(x => x.id === payId);
    if (!p) return;
    if (!await QLT_UI.confirm('Xoá lần trả này? Số tiền sẽ hoàn lại ví.', { okLabel: 'Xoá', danger: true })) return;

    // Hoàn tác balance:
    // - Payment mới (có txId): xoá tx liên kết → applyBalanceDelta tự cập nhật ví
    // - Payment cũ: direct mutate (legacy fallback)
    if (p.txId) {
      const tx = (await window.QLT_Store.getAll('transactions')).find(t => t.id === p.txId);
      if (tx) {
        await this.applyBalanceDelta(tx, -1);
        await window.QLT_Store.del('transactions', tx.id);
      }
    } else {
      const acc = this.state.accounts.find(a => a.id === p.accountId);
      if (acc) {
        acc.balance += (loan.type === 'lend' ? -1 : +1) * p.amount;
        await window.QLT_Store.put('accounts', acc);
      }
    }

    loan.payments = loan.payments.filter(x => x.id !== payId);
    // Nếu khoản đang đóng mà còn dư → mở lại
    if (loan.status === 'closed' && this.loanRemaining(loan) > 0) {
      loan.status = 'open';
    }
    await window.QLT_Store.put('loans', loan);
    await this.reload();
    this.state.editingLoan = this.state.loans.find(l => l.id === loan.id);
    this.renderLoanPayments();
    $('#loanCloseBtn').textContent = this.state.editingLoan.status === 'closed' ? '↺ Mở lại khoản' : '✓ Đóng khoản (đã thanh toán xong)';
    this.renderLoans();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
  },

  async toggleLoanClosed() {
    const loan = this.state.editingLoan;
    if (!loan?.id) return;
    loan.status = loan.status === 'closed' ? 'open' : 'closed';
    await window.QLT_Store.put('loans', loan);
    await this.reload();
    this.state.editingLoan = this.state.loans.find(l => l.id === loan.id);
    $('#loanCloseBtn').textContent = this.state.editingLoan.status === 'closed' ? '↺ Mở lại khoản' : '✓ Đóng khoản (đã thanh toán xong)';
    this.renderLoans();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
    QLT_UI.toast(loan.status === 'closed' ? 'Đã đóng khoản' : 'Đã mở lại khoản', { type: 'success' });
  },

  async scheduleLoanNotif(loan) {
    if (!loan.dueDate || loan.status === 'closed') return;
    if (!window.Capacitor?.Plugins?.LocalNotifications) return;
    const LN = window.Capacitor.Plugins.LocalNotifications;
    try {
      await LN.requestPermissions();
      const idNum = Math.abs(this.hashCode('loan_' + loan.id)) % 2000000;
      // Hủy notif cũ trước
      try { await LN.cancel({ notifications: [{ id: idNum }] }); } catch (_) {}

      const due = new Date(loan.dueDate + 'T09:00:00');
      if (due.getTime() < Date.now()) return; // đã quá hạn rồi thì khỏi nhắc

      const remain = this.loanRemaining(loan);
      const title = loan.type === 'lend'
        ? `📢 ${loan.counterparty} đến hạn trả`
        : `📢 Đến hạn trả ${loan.counterparty}`;
      const body = `Còn ${fmt(remain)} đ — ${loan.note || 'Đừng quên nhé!'}`;

      await LN.schedule({
        notifications: [{
          id: idNum,
          title,
          body,
          schedule: { at: due },
          sound: 'default'
        }]
      });
    } catch (e) { console.warn('Loan notif lỗi:', e); }
  },

  // ============ SETTINGS ============
  // Accordion: tap heading → toggle expand/collapse, persist trong localStorage
  initSettingsAccordion() {
    const STATE_KEY = 'qlt_settings_accordion';
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');

    $$('.settings-group[data-collapsible]').forEach(group => {
      const id = group.id;
      // Restore saved state (override default expanded class nếu user đã đóng/mở thủ công)
      if (id && Object.prototype.hasOwnProperty.call(saved, id)) {
        group.classList.toggle('expanded', !!saved[id]);
      }
      const head = group.querySelector('.settings-group-head');
      if (!head || head._accBound) return;
      head._accBound = true;
      head.onclick = () => {
        group.classList.toggle('expanded');
        if (id) {
          saved[id] = group.classList.contains('expanded');
          localStorage.setItem(STATE_KEY, JSON.stringify(saved));
        }
      };
    });
  },

  async renderSettings() {
    // Init accordion behavior
    this.initSettingsAccordion();

    $('#setUser').textContent = window.QLT_Auth.user ? window.QLT_Auth.user.email : 'Chưa đăng nhập';
    const last = await window.QLT_Store.getMeta('lastSync');
    $('#setLastSync').textContent = last ? new Date(last).toLocaleString('vi-VN') : 'Chưa đồng bộ';

    $('#setLogin').onclick = () => this.doLogin();
    $('#setLogout').onclick = () => this.doLogout();
    $('#setSync').onclick = () => this.doSync();
    $('#setExport').onclick = () => this.doExport();
    $('#setImport').onclick = () => this.doImport();
    const showOnb = $('#setShowOnboard');
    if (showOnb) showOnb.onclick = () => this.showOnboarding();

    // Theme variant picker
    this.renderThemePicker();

    // Storage info — đếm tx, photos, size data
    this.renderStorageInfo();

    // Geolocation toggle
    const geoEnabled = $('#setGeoEnabled');
    if (geoEnabled) {
      geoEnabled.checked = QLT_Geo.isEnabled();
      geoEnabled.onchange = async (e) => {
        if (e.target.checked) {
          // Lần đầu enable — confirm + xin quyền
          const ok = await QLT_UI.confirm(
            '📍 BẬT lưu vị trí giao dịch?\n\n• Mỗi GD tạo MỚI sẽ ghi toạ độ GPS + địa chỉ\n• Dữ liệu lưu LOCAL trên máy bạn — KHÔNG gửi server\n• Địa chỉ tra qua OpenStreetMap miễn phí\n• Tắt bất cứ lúc nào, dữ liệu cũ vẫn còn',
            { title: '🔒 Quyền riêng tư', okLabel: 'Bật', cancelLabel: 'Huỷ' }
          );
          if (!ok) { e.target.checked = false; return; }
          // Test thử xin quyền GPS
          try {
            await QLT_Geo.getCurrentPosition();
            QLT_Geo.setEnabled(true);
            QLT_UI.toast('Đã bật ghi vị trí', { type: 'success' });
          } catch (err) {
            e.target.checked = false;
            QLT_UI.alert('Không xin được quyền GPS: ' + (err?.message || err) + '\n\nVào Cài đặt Android → Apps → Quản Lý Tiền → Permissions → bật Location.', { title: 'Lỗi quyền' });
          }
        } else {
          QLT_Geo.setEnabled(false);
          QLT_UI.toast('Đã tắt ghi vị trí', { type: 'success' });
        }
      };
    }
    const geoClear = $('#setGeoClear');
    if (geoClear) geoClear.onclick = async () => {
      if (!await QLT_UI.confirm('Xoá vị trí GPS đã lưu trên TẤT CẢ giao dịch? Hành động không thể hoàn tác.', { okLabel: 'Xoá hết', danger: true })) return;
      const all = await window.QLT_Store.getAll('transactions');
      let n = 0;
      for (const t of all) {
        if (t.location) { delete t.location; await window.QLT_Store.put('transactions', t); n++; }
      }
      await this.reload();
      QLT_UI.toast(`Đã xoá vị trí khỏi ${n} giao dịch`, { type: 'success' });
      this.autoSync();
    };

    const dailyNotif = $('#setDailyNotif');
    if (dailyNotif) {
      dailyNotif.checked = localStorage.getItem('qlt_daily_notif_off') !== '1';
      dailyNotif.onchange = async (e) => {
        if (e.target.checked) {
          localStorage.removeItem('qlt_daily_notif_off');
          await this.scheduleDailySummaryNotif();
          QLT_UI.toast('Đã bật tổng kết 20h hằng ngày', { type: 'success' });
        } else {
          localStorage.setItem('qlt_daily_notif_off', '1');
          if (window.Capacitor?.Plugins?.LocalNotifications) {
            try { await window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: 99001 }] }); } catch (_) {}
          }
          QLT_UI.toast('Đã tắt thông báo tổng kết', { type: 'success' });
        }
      };
    }
    // Smart insights real-time toggle (default ON)
    const smartInsights = $('#setSmartInsights');
    if (smartInsights) {
      smartInsights.checked = localStorage.getItem('qlt_smart_insights') !== 'off';
      smartInsights.onchange = (e) => {
        if (e.target.checked) {
          localStorage.removeItem('qlt_smart_insights');
          QLT_UI.toast('Đã bật gợi ý thông minh', { type: 'success' });
        } else {
          localStorage.setItem('qlt_smart_insights', 'off');
          QLT_UI.toast('Đã tắt gợi ý thông minh', { type: 'success' });
        }
      };
    }

    // Test notification — fire ngay để verify permission + plugin hoạt động
    const testNotif = $('#setTestNotif');
    if (testNotif) {
      testNotif.onclick = async () => {
        const LN = window.Capacitor?.Plugins?.LocalNotifications;
        if (!LN) {
          QLT_UI.alert('Plugin LocalNotifications chưa cài. Cần build APK mới (PWA không hỗ trợ).', { title: 'Không khả dụng' });
          return;
        }
        try {
          const perm = await LN.requestPermissions();
          if (perm.display !== 'granted') {
            QLT_UI.alert('Chưa cấp quyền thông báo. Vào Cài đặt Android → Apps → Quản Lý Tiền → Permissions → Notifications → BẬT.', { title: 'Cần cấp quyền' });
            return;
          }
          await LN.schedule({
            notifications: [{
              id: 99999,
              title: '✅ Thông báo hoạt động',
              body: 'App có thể gửi thông báo cho bạn. Tổng kết 20h sẽ tự đến mỗi tối.',
              schedule: { at: new Date(Date.now() + 1500) },
              sound: 'default'
            }]
          });
          QLT_UI.toast('Đã gửi — đợi 1-2 giây sẽ thấy thông báo', { type: 'success', duration: 2500 });
        } catch (e) {
          QLT_UI.alert('Lỗi: ' + (e?.message || e), { title: 'Test thất bại' });
        }
      };
    }

    // Test insight — show 1 banner mẫu để verify hiển thị
    const testInsight = $('#setTestInsight');
    if (testInsight) {
      testInsight.onclick = () => {
        if (localStorage.getItem('qlt_smart_insights') === 'off') {
          QLT_UI.toast('Bật toggle "Gợi ý thông minh" trước đã', { type: 'info' });
          return;
        }
        QLT_UI.insight(
          'Đây là <strong>banner gợi ý mẫu</strong>. Sau mỗi giao dịch, app sẽ hiện gợi ý thật ở đây nếu phát hiện điều bất thường (vượt budget, chi nhiều, lặp danh mục…)',
          { emoji: '💡', variant: 'good', duration: 5000 }
        );
      };
    }
    const showFaq = $('#setShowFAQ');
    if (showFaq) showFaq.onclick = () => $('#faqModal').classList.add('open');
    const showPriv = $('#setShowPrivacy');
    if (showPriv) showPriv.onclick = () => $('#privacyModal').classList.add('open');

    // ===== Danh mục chuẩn — bind 3 nút =====
    this.renderCatStandardStatus();
    const upBtn = $('#setUpgradeCats');
    if (upBtn) upBtn.onclick = () => this.openCatMigrateModal();
    const tmBtn = $('#setTestMatcher');
    if (tmBtn) tmBtn.onclick = () => this.openMatcherTestModal();
    const acBtn = $('#setRunAccuracy');
    if (acBtn) acBtn.onclick = () => this.openMatcherAccuracyModal();

    // ===== AI Settings — bind handlers =====
    await this.renderAISettings();

    // ===== Update info trong section Trợ giúp =====
    this.renderUpdateInfo();
    const checkBtn = $('#setCheckUpdate');
    if (checkBtn) {
      checkBtn.onclick = async () => {
        checkBtn.disabled = true;
        checkBtn.textContent = '⏳ Đang kiểm tra…';
        const r = await this.checkForUpdates({ force: true });
        checkBtn.disabled = false;
        checkBtn.textContent = '🔄 Kiểm tra cập nhật';
        await this.renderUpdateInfo();
        if (r?.hasUpdate) {
          QLT_UI.toast(`🆕 Có phiên bản mới: ${r.latest.tag}`, { type: 'success', duration: 3500 });
          await this.renderHomeUpdateBanner();
        } else if (r?.reason === 'dev-build') {
          QLT_UI.toast('Đang chạy DEV — không có update để check', { type: 'info' });
        } else if (r?.reason === 'fetch-failed') {
          QLT_UI.toast('Không kết nối được GitHub — kiểm tra mạng', { type: 'error' });
        } else {
          QLT_UI.toast('✅ Đang dùng phiên bản mới nhất', { type: 'success' });
        }
      };
    }

    // Gỡ banner cũ nếu còn (từ phiên bản trước hide login trên native)
    const oldNote = $('#setNativeNote');
    if (oldNote) oldNote.remove();

    $('#setLogin').style.display = window.QLT_Auth.user ? 'none' : 'block';
    $('#setLogout').style.display = window.QLT_Auth.user ? 'block' : 'none';
    $('#setSync').style.display = window.QLT_Auth.user ? 'block' : 'none';

    // Bảo mật — Khoá PIN
    await this.renderLockSettings();

    // Hiển thị widget Trang chủ
    this.renderHomeWidgetSettings();

    // Theme toggle (Dark mode + Auto)
    const cur = this.getThemePref();
    const dark = $('#setDarkMode');
    const auto = $('#setAutoTheme');
    if (dark && auto) {
      dark.checked = cur === 'dark';
      auto.checked = cur === 'auto';
      // Khi auto bật: dark hiệu lực = OS preference; UI checkbox dark hiển thị state hiện tại
      const refreshDarkUI = () => {
        const m = this.getThemePref();
        if (m === 'auto') {
          dark.disabled = true;
          dark.checked = window.matchMedia?.('(prefers-color-scheme: dark)').matches || false;
        } else {
          dark.disabled = false;
          dark.checked = m === 'dark';
        }
      };
      refreshDarkUI();
      dark.onchange = (e) => {
        this.setThemePref(e.target.checked ? 'dark' : 'light');
        auto.checked = false;
      };
      auto.onchange = (e) => {
        if (e.target.checked) this.setThemePref('auto');
        else this.setThemePref(window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        refreshDarkUI();
      };
    }
  },

  // ============================================================
  // AI CHAT — modal hỏi đáp + voice + TTS
  // ============================================================
  async renderAiChatFab() {
    const fab = $('#homeAiChatFab');
    if (!fab) return;
    const hasKey = window.QLT_AI && await window.QLT_AI.hasApiKey();
    fab.style.display = hasKey ? 'flex' : 'none';
    if (hasKey && !fab._bound) {
      fab._bound = true;
      fab.onclick = () => this.openAiChatModal();
    }
  },

  openAiChatModal() {
    const modal = $('#aiChatModal');
    if (!modal) return;
    modal.classList.add('open');

    const messagesEl = $('#aiChatMessages');
    const input = $('#aiChatInput');
    const sendBtn = $('#aiChatSend');
    const micBtn = $('#aiChatMic');
    const clearBtn = $('#aiChatClear');
    const sugWrap = $('#aiChatSuggestions');

    // Init history nếu chưa có
    if (!this.state._aiChatHistory) this.state._aiChatHistory = [];

    // Render existing history (khi user mở lại)
    this._renderAiChatMessages();

    // Empty state nếu history trống
    if (this.state._aiChatHistory.length === 0) {
      messagesEl.innerHTML = `
        <div class="ai-chat-empty">
          <span class="emoji">🤖</span>
          <div>Hỏi gì về tài chính của bạn?</div>
          <div style="margin-top:8px;font-size:11px">VD: "Tháng này tôi chi cà phê bao nhiêu?", "Còn budget không?", "So sánh chi 3 tháng"</div>
        </div>
      `;
    }

    // Bind handlers (re-bind để override _bound state cũ)
    if (!modal._bound) {
      modal._bound = true;

      const send = async () => {
        const txt = (input.value || '').trim();
        if (!txt) return;
        input.value = '';
        sendBtn.disabled = true;
        await this._sendAiChatMessage(txt);
        sendBtn.disabled = false;
        input.focus();
      };

      sendBtn.onclick = send;
      input.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      };

      // Suggestion chips
      sugWrap.querySelectorAll('[data-q]').forEach(chip => {
        chip.onclick = () => {
          input.value = chip.dataset.q;
          send();
        };
      });

      // Voice input
      micBtn.onclick = () => this._aiChatVoiceInput(input, send);

      // Clear history
      clearBtn.onclick = async () => {
        const ok = await QLT_UI.confirm('Xoá toàn bộ lịch sử chat?', { okLabel: 'Xoá', cancelLabel: 'Huỷ', danger: true });
        if (!ok) return;
        this.state._aiChatHistory = [];
        // Stop any TTS
        if (window.QLT_AI?.stopSpeaking) window.QLT_AI.stopSpeaking();
        this._renderAiChatMessages();
      };
    }

    // Auto-focus input (web only — mobile would popup keyboard)
    if (!('Capacitor' in window)) setTimeout(() => input.focus(), 200);
  },

  _renderAiChatMessages() {
    const messagesEl = $('#aiChatMessages');
    const history = this.state._aiChatHistory || [];
    if (history.length === 0) return;

    messagesEl.innerHTML = history.map((m, idx) => {
      if (m.role === 'user') {
        return `<div class="ai-msg user">${this.escapeHtml(m.content)}</div>`;
      }
      if (m.role === 'tool') {
        return `<div class="ai-msg tool">🔍 ${this.escapeHtml(m.content)}</div>`;
      }
      if (m.role === 'tx-preview') {
        return this._renderTxPreviewCard(m.pendingTxId, idx, m.savedTxId);
      }
      // assistant
      const html = this.escapeHtml(m.content)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
      const speakingBadge = m.speaking
        ? `<span class="ai-msg-speaking" title="AI đang đọc — tap để dừng" data-stop-tts="1">🔊 đang đọc...</span>`
        : '';
      const ttsBtn = m.speaking
        ? `<button class="ai-msg-action" data-stop-tts="1" title="Dừng đọc">⏹ Dừng</button>`
        : `<button class="ai-msg-action" data-tts-idx="${idx}" title="Đọc to">🔊 Đọc</button>`;
      return `<div class="ai-msg assistant ${m.speaking ? 'speaking' : ''}">${html}${speakingBadge}<div class="ai-msg-actions">${ttsBtn}</div></div>`;
    }).join('');

    const body = $('#aiChatBody');
    if (body) body.scrollTop = body.scrollHeight;

    // Bind TTS buttons (đọc lại 1 message)
    messagesEl.querySelectorAll('[data-tts-idx]').forEach(btn => {
      btn.onclick = async () => {
        const idx = parseInt(btn.dataset.ttsIdx, 10);
        const msg = (this.state._aiChatHistory || [])[idx];
        if (msg && window.QLT_AI?.speak) {
          // Stop current TTS first
          if (window.QLT_AI.isSpeaking()) window.QLT_AI.stopSpeaking();
          // Clear all speaking flags
          (this.state._aiChatHistory || []).forEach(m => { if (m.speaking) m.speaking = false; });
          msg.speaking = true;
          this._renderAiChatMessages();
          await window.QLT_AI.speak(msg.content, {
            onEnd: () => { msg.speaking = false; this._renderAiChatMessages(); },
            onError: () => { msg.speaking = false; this._renderAiChatMessages(); }
          });
        }
      };
    });

    // Stop TTS button — tap chữ "đang đọc" hoặc nút Dừng
    messagesEl.querySelectorAll('[data-stop-tts]').forEach(btn => {
      btn.onclick = () => {
        if (window.QLT_AI?.stopSpeaking) window.QLT_AI.stopSpeaking();
        (this.state._aiChatHistory || []).forEach(m => { if (m.speaking) m.speaking = false; });
        this._renderAiChatMessages();
      };
    });

    // Bind tx-preview action buttons
    messagesEl.querySelectorAll('[data-prep-save]').forEach(btn => {
      btn.onclick = () => this._aiChatSavePendingTx(btn.dataset.prepSave, parseInt(btn.dataset.idx, 10));
    });
    messagesEl.querySelectorAll('[data-prep-cancel]').forEach(btn => {
      btn.onclick = () => this._aiChatCancelPendingTx(btn.dataset.prepCancel, parseInt(btn.dataset.idx, 10));
    });
    messagesEl.querySelectorAll('[data-prep-edit]').forEach(btn => {
      btn.onclick = () => this._aiChatEditPendingTx(btn.dataset.prepEdit);
    });
  },

  _renderTxPreviewCard(prepId, idx, savedTxId) {
    const pending = (this.state._aiPendingTx || {})[prepId];
    if (!pending) {
      return `<div class="ai-tx-preview saved">✅ Đã xử lý</div>`;
    }
    if (savedTxId) {
      return `
        <div class="ai-tx-preview saved">
          ✅ <strong>Đã lưu</strong> · ${pending.type === 'income' ? 'Thu' : (pending.type === 'expense' ? 'Chi' : 'Chuyển')} ${fmt(pending.amount)} đ
          <span style="color:var(--text3);font-size:11px">· ${this.escapeHtml(pending.categoryName || pending.note || '')}</span>
        </div>
      `;
    }
    const typeLabel = pending.type === 'income' ? '🟢 Thu' : (pending.type === 'expense' ? '🔴 Chi' : '🔄 Chuyển');
    const typeColor = pending.type === 'income' ? '#16a34a' : (pending.type === 'expense' ? '#dc2626' : '#3b82f6');
    return `
      <div class="ai-tx-preview pending">
        <div class="ai-tx-preview-head">📝 Sẽ tạo giao dịch:</div>
        <div class="ai-tx-preview-amount" style="color:${typeColor}">
          ${typeLabel} <strong>${fmt(pending.amount)} đ</strong>
        </div>
        <div class="ai-tx-preview-row">
          <span class="ai-tx-preview-icon">${pending.type === 'transfer' ? '🔄' : '🏷️'}</span>
          <span>${this.escapeHtml(pending.type === 'transfer' ? `${pending.accountName || '?'} → ${pending.toAccountName || '?'}` : (pending.categoryName || '⚠️ Chưa có cat'))}</span>
        </div>
        ${pending.type !== 'transfer' ? `
          <div class="ai-tx-preview-row">
            <span class="ai-tx-preview-icon">💵</span>
            <span>${this.escapeHtml(pending.accountName || '?')}</span>
          </div>
        ` : ''}
        <div class="ai-tx-preview-row">
          <span class="ai-tx-preview-icon">📅</span>
          <span>${this.escapeHtml(pending.date)}</span>
        </div>
        ${pending.note ? `
          <div class="ai-tx-preview-row">
            <span class="ai-tx-preview-icon">📝</span>
            <span>${this.escapeHtml(pending.note)}</span>
          </div>
        ` : ''}
        <div class="ai-tx-preview-actions">
          <button class="ai-tx-btn save" data-prep-save="${prepId}" data-idx="${idx}">💾 Lưu</button>
          <button class="ai-tx-btn edit" data-prep-edit="${prepId}">✏️ Sửa</button>
          <button class="ai-tx-btn cancel" data-prep-cancel="${prepId}" data-idx="${idx}">✕ Hủy</button>
        </div>
      </div>
    `;
  },

  async _aiChatSavePendingTx(prepId, msgIdx) {
    const pending = (this.state._aiPendingTx || {})[prepId];
    if (!pending) {
      QLT_UI.toast('Không tìm thấy giao dịch chuẩn bị', { type: 'error' });
      return;
    }
    // Validate
    if (!pending.amount || pending.amount <= 0) {
      QLT_UI.toast('Số tiền không hợp lệ', { type: 'error' });
      return;
    }
    if (!pending.accountId) {
      QLT_UI.toast('Thiếu ví — bấm Sửa để chọn', { type: 'error' });
      return;
    }
    if (pending.type !== 'transfer' && !pending.categoryId) {
      QLT_UI.toast('Thiếu danh mục — bấm Sửa để chọn', { type: 'error' });
      return;
    }
    if (pending.type === 'transfer' && !pending.toAccountId) {
      QLT_UI.toast('Thiếu ví đích — bấm Sửa để chọn', { type: 'error' });
      return;
    }

    // Build tx + save (dùng applyBalanceDelta như các flow khác)
    const tx = {
      type: pending.type,
      amount: pending.amount,
      date: pending.date,
      accountId: pending.accountId,
      toAccountId: pending.toAccountId || null,
      categoryId: pending.categoryId || null,
      note: pending.note || '',
      bookId: pending.bookId
    };
    try {
      await this.applyBalanceDelta(tx, +1);
      const saved = await window.QLT_Store.put('transactions', tx);
      await this.reload();
      // Update history msg
      const history = this.state._aiChatHistory || [];
      if (history[msgIdx]) {
        history[msgIdx].savedTxId = saved.id;
      }
      this._renderAiChatMessages();
      QLT_UI.toast(`✅ Đã lưu: ${pending.type === 'income' ? 'Thu' : 'Chi'} ${fmt(pending.amount)} đ`, { type: 'success', duration: 2500 });
      this.autoSync();
    } catch (e) {
      QLT_UI.toast('Lỗi lưu: ' + (e.message || e), { type: 'error' });
    }
  },

  _aiChatCancelPendingTx(prepId, msgIdx) {
    const history = this.state._aiChatHistory || [];
    if (history[msgIdx]) {
      history[msgIdx].cancelled = true;
      history.splice(msgIdx, 1); // remove preview card từ chat
    }
    delete (this.state._aiPendingTx || {})[prepId];
    this._renderAiChatMessages();
    QLT_UI.toast('Đã hủy', { type: 'info' });
  },

  _aiChatEditPendingTx(prepId) {
    const pending = (this.state._aiPendingTx || {})[prepId];
    if (!pending) return;
    // Đóng chat modal, mở form GD pre-fill từ pending
    $('#aiChatModal').classList.remove('open');
    // Stop TTS nếu đang đọc
    if (window.QLT_AI?.stopSpeaking) window.QLT_AI.stopSpeaking();

    // Open new tx form with pre-filled data
    setTimeout(() => {
      this.openTxModal(null, pending.type);
      setTimeout(() => {
        if (this.state.editingTx) {
          this.state.editingTx.amount = pending.amount;
          this.state.editingTx.accountId = pending.accountId;
          this.state.editingTx.toAccountId = pending.toAccountId;
          this.state.editingTx.categoryId = pending.categoryId;
          this.state.editingTx.note = pending.note;
          this.state.editingTx.date = pending.date;
          $('#txAmount').value = fmtAmount(pending.amount);
          $('#txDate').value = pending.date;
          $('#txNote').value = pending.note || '';
          this.renderTxAccountPicker();
          this.renderTxCategoryPicker(pending.type);
          if (pending.type === 'transfer') this.renderTxToAccountPicker();
        }
      }, 200);
    }, 250);
  },

  async _sendAiChatMessage(text) {
    if (!window.QLT_AIChat) return;
    const history = this.state._aiChatHistory = this.state._aiChatHistory || [];
    history.push({ role: 'user', content: text });
    this._renderAiChatMessages();

    const typing = $('#aiChatTyping');
    if (typing) typing.style.display = 'flex';

    try {
      // Convert app history → API history format
      const apiHistory = [];
      for (const m of history.slice(0, -1)) { // exclude last user msg (will be added by ask())
        if (m.role === 'tool') continue; // skip tool indicator messages
        apiHistory.push({
          role: m.role === 'assistant' ? 'model' : m.role,
          text: m.content
        });
      }
      const r = await window.QLT_AIChat.ask(text, apiHistory);

      if (typing) typing.style.display = 'none';

      // Add tool usage indicator if any
      if (r.toolsUsed && r.toolsUsed.length) {
        history.push({
          role: 'tool',
          content: `Đã xem: ${r.toolsUsed.map(n => n.replace(/_/g, ' ')).join(', ')}`
        });
      }

      const replyMsg = { role: 'assistant', content: r.reply };
      history.push(replyMsg);

      // Nếu AI prepared 1 tx → render preview card sau message
      if (r.pendingTxId) {
        history.push({ role: 'tx-preview', pendingTxId: r.pendingTxId });
      }

      this._renderAiChatMessages();

      // TTS nếu user bật — show indicator trong message
      const tts = await window.QLT_AI.getPref('tts', true);
      if (tts && window.QLT_AI.speak) {
        const msgIdx = history.length - (r.pendingTxId ? 2 : 1);
        replyMsg.speaking = true;
        this._renderAiChatMessages();
        await window.QLT_AI.speak(r.reply, {
          onEnd: () => {
            replyMsg.speaking = false;
            this._renderAiChatMessages();
          },
          onError: () => {
            replyMsg.speaking = false;
            this._renderAiChatMessages();
          }
        });
      }

    } catch (e) {
      if (typing) typing.style.display = 'none';
      history.push({ role: 'assistant', content: '❌ Lỗi: ' + (e.message || 'Không gọi được AI. Thử lại?') });
      this._renderAiChatMessages();
    }
  },

  _aiChatVoiceInput(inputEl, sendFn) {
    if (!window.QLT_Voice || !window.QLT_Voice.available()) {
      QLT_UI.toast('Thiết bị không hỗ trợ giọng nói (cần APK build có plugin)', { type: 'error' });
      return;
    }
    const micBtn = $('#aiChatMic');
    micBtn.classList.add('recording');
    micBtn.textContent = '⏹';
    inputEl.placeholder = '🎙️ Đang nghe...';

    QLT_Voice.listen({
      lang: 'vi-VN',
      onPartial: (p) => { inputEl.value = p; },
      onResult: (text) => {
        micBtn.classList.remove('recording');
        micBtn.textContent = '🎙️';
        inputEl.placeholder = 'Hỏi gì đó...';
        inputEl.value = text;
        // Auto send sau 0.5s nếu user không sửa
        setTimeout(() => {
          if (inputEl.value === text) sendFn();
        }, 500);
      },
      onError: (e) => {
        micBtn.classList.remove('recording');
        micBtn.textContent = '🎙️';
        inputEl.placeholder = 'Hỏi gì đó...';
        QLT_UI.toast('Lỗi mic: ' + (e?.message || ''), { type: 'error' });
      },
      onEnd: () => {
        micBtn.classList.remove('recording');
        micBtn.textContent = '🎙️';
        inputEl.placeholder = 'Hỏi gì đó...';
      }
    });
  },

  // ============================================================
  // IN-APP UPDATE — banner trên Home + Settings info
  // ============================================================
  async checkForUpdates(opts = {}) {
    if (!window.QLT_Update) return null;
    const force = !!opts.force;
    const r = await window.QLT_Update.check(force);
    return r;
  },

  async renderHomeUpdateBanner() {
    const wrap = $('#homeUpdateBanner');
    if (!wrap) return;
    const r = await this.checkForUpdates();
    if (!r || !r.hasUpdate || r.dismissed) {
      wrap.style.display = 'none';
      return;
    }
    const latest = r.latest;
    const apkSize = latest.apk?.size ? ` · ${(latest.apk.size / 1024 / 1024).toFixed(1)} MB` : '';
    const date = latest.publishedAt ? new Date(latest.publishedAt).toLocaleDateString('vi-VN') : '';
    wrap.innerHTML = `
      <div class="update-banner">
        <div class="update-banner-head">🆕 Có phiên bản mới ${this.escapeHtml(latest.tag)}</div>
        <div class="update-banner-body">${this.escapeHtml(latest.name || 'Bản cập nhật mới')}</div>
        <div class="update-banner-meta">${date}${apkSize}</div>
        <div class="update-banner-actions">
          <button class="update-banner-btn primary" data-act="install">📥 Tải về & cài đặt</button>
          <button class="update-banner-btn secondary" data-act="later">Để sau</button>
        </div>
      </div>
    `;
    wrap.style.display = 'block';
    wrap.querySelector('[data-act="install"]').onclick = () => this._openUpdateUrl(r.apkUrl, r.releaseUrl);
    wrap.querySelector('[data-act="later"]').onclick = () => {
      window.QLT_Update.dismiss(latest.tag);
      wrap.style.display = 'none';
    };
  },

  _openUpdateUrl(apkUrl, releaseUrl) {
    // Ưu tiên APK URL (download trực tiếp). Fallback: release page (user tự pick file)
    const url = apkUrl || releaseUrl;
    if (!url) return;
    if (window.Capacitor?.Plugins?.Browser) {
      window.Capacitor.Plugins.Browser.open({ url });
    } else {
      window.open(url, '_blank');
    }
  },

  async renderUpdateInfo() {
    const el = $('#setUpdateInfo');
    if (!el) return;
    const cur = window.QLT_BUILD || {};
    const isDev = !cur.version || cur.version === 'dev';
    if (isDev) {
      el.innerHTML = `
        <div>📦 Phiên bản hiện tại: <span class="ver">DEV (local)</span></div>
        <div style="margin-top:4px;color:var(--text3)">Đang chạy local — không kiểm tra cập nhật.</div>
      `;
      return;
    }
    const r = await this.checkForUpdates();
    let html = `<div>📦 Phiên bản hiện tại: <span class="ver">${this.escapeHtml(cur.tag || cur.version)}</span></div>`;
    if (cur.buildDate) {
      const d = new Date(cur.buildDate);
      html += `<div style="color:var(--text3);font-size:11px;margin-top:2px">Build: ${d.toLocaleString('vi-VN')}</div>`;
    }
    if (cur.commitMsg) {
      html += `<div style="color:var(--text3);font-size:11px;margin-top:2px">"${this.escapeHtml(cur.commitMsg)}"</div>`;
    }
    if (r?.latest) {
      if (r.hasUpdate) {
        const apkSize = r.latest.apk?.size ? ` · ${(r.latest.apk.size / 1024 / 1024).toFixed(1)} MB` : '';
        const date = r.latest.publishedAt ? new Date(r.latest.publishedAt).toLocaleDateString('vi-VN') : '';
        html += `
          <div style="margin-top:10px;padding:10px;background:linear-gradient(135deg,#1e40af,#3b82f6);color:#fff;border-radius:8px">
            <div style="font-weight:700;font-size:13px;margin-bottom:4px">🆕 Có bản mới: ${this.escapeHtml(r.latest.tag)}</div>
            <div style="font-size:11px;opacity:.9;margin-bottom:8px">${this.escapeHtml(r.latest.name || '')} · ${date}${apkSize}</div>
            <button id="setUpdateInstallBtn" style="width:100%;padding:9px;background:#fff;color:#1e40af;border:none;border-radius:6px;font-weight:700;font-size:12px;cursor:pointer">📥 Tải về & cài đặt</button>
          </div>
        `;
      } else {
        html += `<div style="margin-top:6px;color:var(--text3);font-size:11px">✅ Bạn đang dùng phiên bản mới nhất</div>`;
      }
    }
    el.innerHTML = html;

    // Bind nút install
    const installBtn = $('#setUpdateInstallBtn');
    if (installBtn && r?.hasUpdate) {
      installBtn.onclick = () => this._openUpdateUrl(r.apkUrl, r.releaseUrl);
    }
  },

  // ============================================================
  // AI SETTINGS — Gemini config (API key + TTS + raw mode)
  // ============================================================
  async renderAISettings() {
    if (!window.QLT_AI) return;

    const statusEl = $('#setAIStatus');
    const badgeEl = $('#setAIBadge');
    const keyInput = $('#setAIKey');
    const removeBtn = $('#setAIRemove');
    const ttsToggle = $('#setAITTS');
    const rawToggle = $('#setAIRawMode');

    // Render trạng thái
    const hasKey = await window.QLT_AI.hasApiKey();
    if (statusEl) {
      if (hasKey) {
        statusEl.innerHTML = `✅ <strong>Đã kết nối</strong> — model <code>${window.QLT_AI.MODELS.chat}</code> · AI đã sẵn sàng`;
        statusEl.style.background = 'rgba(34,197,94,.08)';
        statusEl.style.color = 'var(--text)';
      } else {
        statusEl.innerHTML = `⚠️ <strong>Chưa cấu hình API key</strong> — tính năng AI bị tắt`;
        statusEl.style.background = 'rgba(245,158,11,.08)';
        statusEl.style.color = 'var(--text)';
      }
    }
    if (badgeEl) badgeEl.style.display = hasKey ? 'none' : 'inline-block';
    if (removeBtn) removeBtn.style.display = hasKey ? 'block' : 'none';

    // Auto-expand section AI nếu chưa setup (để user thấy ngay)
    const aiSec = $('#setSecAI');
    if (aiSec && !hasKey && !aiSec.classList.contains('expanded')) {
      const stateKey = 'qlt_settings_accordion';
      const saved = JSON.parse(localStorage.getItem(stateKey) || '{}');
      // Chỉ auto-expand nếu user CHƯA tự đóng (không có entry trong saved state)
      if (!Object.prototype.hasOwnProperty.call(saved, 'setSecAI')) {
        aiSec.classList.add('expanded');
      }
    }

    // Restore key vào ô input nếu có (mask hết)
    if (keyInput && hasKey) {
      const k = await window.QLT_AI.getApiKey();
      keyInput.value = k || '';
      keyInput.type = 'password';
    } else if (keyInput) {
      keyInput.value = '';
    }

    // Toggle hiện/ẩn key
    const keyToggle = $('#setAIKeyToggle');
    if (keyToggle && !keyToggle._bound) {
      keyToggle._bound = true;
      keyToggle.onclick = () => {
        if (keyInput.type === 'password') {
          keyInput.type = 'text';
          keyToggle.textContent = '🙈';
        } else {
          keyInput.type = 'password';
          keyToggle.textContent = '👁';
        }
      };
    }

    // TTS toggle + status + test
    if (ttsToggle) {
      ttsToggle.checked = await window.QLT_AI.getPref('tts', true);
      ttsToggle.onchange = (e) => window.QLT_AI.setPref('tts', e.target.checked);
    }
    // TTS status: hiện engine + voice info + cảnh báo nếu fallback
    const ttsStatus = $('#setAITTSStatus');
    if (ttsStatus) {
      const check = await window.QLT_AI.checkTTS();
      const engineLabel = check.engine === 'capacitor' ? 'Android TTS (native)' : 'Web Speech';
      if (!check.ok) {
        if (check.reason === 'no-api') {
          ttsStatus.innerHTML = '⚠️ Thiết bị không hỗ trợ TTS — cần cài app "Speech Services by Google" qua CH Play. Tap <strong>"📖 Cách cài voice Việt"</strong> để xem hướng dẫn.';
          ttsStatus.style.color = '#dc2626';
        } else {
          ttsStatus.innerHTML = '⚠️ Chưa load được voice — thử mở lại app';
          ttsStatus.style.color = '#f59e0b';
        }
      } else if (check.fallback) {
        ttsStatus.innerHTML = `⚠️ Engine: <strong>${engineLabel}</strong> — chưa có voice tiếng Việt, đang dùng <strong>${check.lang}</strong>. Tap <strong>"📖 Cách cài voice Việt"</strong> bên dưới.`;
        ttsStatus.style.color = '#f59e0b';
      } else {
        ttsStatus.innerHTML = `✅ Engine: <strong>${engineLabel}</strong> · Voice: <strong>${this.escapeHtml(check.voice)}</strong> · ${check.lang}`;
        ttsStatus.style.color = 'var(--text3)';
      }
    }
    // Guide button — mở hướng dẫn cài voice Việt
    const ttsGuide = $('#setAITTSGuide');
    if (ttsGuide && !ttsGuide._bound) {
      ttsGuide._bound = true;
      ttsGuide.onclick = () => {
        const modal = $('#ttsGuideModal');
        if (modal) modal.classList.add('open');
      };
    }
    // Test button — fix stuck "Đang đọc..." bằng cách reset luôn sau speak()
    // (Capacitor plugin block until done, Web Speech callback)
    const ttsTest = $('#setAITTSTest');
    if (ttsTest && !ttsTest._bound) {
      ttsTest._bound = true;
      ttsTest.onclick = async () => {
        const original = ttsTest.textContent;
        const reset = () => { ttsTest.disabled = false; ttsTest.textContent = original; };
        ttsTest.disabled = true;
        ttsTest.textContent = '🔊 Đang đọc...';

        // Safety timeout — reset sau 15s nếu không có callback nào fire
        const safetyTimer = setTimeout(() => {
          reset();
          QLT_UI.toast('TTS không phản hồi — có thể device không hỗ trợ', { type: 'error' });
        }, 15000);
        const onDone = () => { clearTimeout(safetyTimer); reset(); };

        try {
          const result = await window.QLT_AI.speak(
            'Xin chào, tôi là trợ lý của ứng dụng Quản Lý Tiền. Bạn có thể hỏi tôi mọi thứ về tài chính của bạn.',
            { onEnd: onDone, onError: onDone }
          );
          // Capacitor plugin block — speak() resolve khi đã đọc xong → reset ngay
          if (result?.engine === 'capacitor') {
            clearTimeout(safetyTimer);
            reset();
          }
          // Nếu speak return null (no API) → onError đã fire → onDone reset rồi
          if (result === null) {
            clearTimeout(safetyTimer);
            QLT_UI.toast('Thiết bị không hỗ trợ TTS — xem hướng dẫn cài voice', { type: 'error' });
          }
        } catch (e) {
          clearTimeout(safetyTimer);
          reset();
          QLT_UI.toast('Lỗi TTS: ' + (e.message || ''), { type: 'error' });
        }
      };
    }

    // Raw mode toggle
    if (rawToggle) {
      rawToggle.checked = await window.QLT_AI.getPref('rawMode', false);
      rawToggle.onchange = (e) => window.QLT_AI.setPref('rawMode', e.target.checked);
    }

    // Test connection
    const testBtn = $('#setAITest');
    if (testBtn) {
      testBtn.onclick = async () => {
        const resultEl = $('#setAITestResult');
        const k = (keyInput?.value || '').trim();
        if (!k) {
          resultEl.style.display = 'block';
          resultEl.innerHTML = '<span style="color:var(--danger)">⚠️ Vui lòng nhập API key trước</span>';
          return;
        }
        resultEl.style.display = 'block';
        resultEl.innerHTML = '<span style="color:var(--text2)">⏳ Đang test kết nối…</span>';
        testBtn.disabled = true;
        try {
          const r = await window.QLT_AI.testConnection(k);
          if (r.ok) {
            resultEl.innerHTML = `<span style="color:#16a34a">✅ Kết nối OK — model <code>${r.model}</code> hoạt động</span>`;
          } else {
            resultEl.innerHTML = `<span style="color:#f59e0b">⚠️ Kết nối được nhưng response lạ — kiểm tra lại</span>`;
          }
        } catch (err) {
          resultEl.innerHTML = `<span style="color:var(--danger)">❌ Lỗi: ${this.escapeHtml(err.message || String(err))}</span>`;
        } finally {
          testBtn.disabled = false;
        }
      };
    }

    // Save key
    const saveBtn = $('#setAISave');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const k = (keyInput?.value || '').trim();
        if (!k) {
          QLT_UI.toast('Vui lòng nhập API key', { type: 'error' });
          return;
        }
        if (!k.startsWith('AIza') || k.length < 20) {
          const ok = await QLT_UI.confirm(
            'Key không có dạng quen thuộc (Gemini key thường bắt đầu "AIza..."). Vẫn lưu?',
            { okLabel: 'Vẫn lưu', cancelLabel: 'Huỷ' }
          );
          if (!ok) return;
        }
        await window.QLT_AI.setApiKey(k);
        QLT_UI.toast('✨ Đã lưu API key — AI đã bật', { type: 'success' });
        await this.renderAISettings(); // re-render
      };
    }

    // Remove key
    if (removeBtn) {
      removeBtn.onclick = async () => {
        const ok = await QLT_UI.confirm(
          'Xoá API key? Tính năng AI sẽ bị tắt cho đến khi bạn nhập key mới.',
          { okLabel: 'Xoá', cancelLabel: 'Huỷ', danger: true }
        );
        if (!ok) return;
        await window.QLT_AI.removeApiKey();
        QLT_UI.toast('Đã xoá API key', { type: 'info' });
        await this.renderAISettings();
      };
    }
  },

  // ============================================================
  // DANH MỤC CHUẨN — Migration + Test matcher + Accuracy
  // ============================================================
  renderCatStandardStatus() {
    const el = $('#setCatStatus');
    if (!el) return;
    const def = window.QLT_CategoriesDefault;
    if (!def) { el.innerHTML = '⚠️ Không tải được bộ chuẩn'; return; }
    const all = this.state.categories.filter(c => c.bookId === this.state.currentBookId);
    const haveSlugs = new Set(all.filter(c => c.slug).map(c => c.slug));
    const totalStandard = def.ALL.length;
    const migrated = def.ALL.filter(d => haveSlugs.has(d.slug)).length;
    const customNonStd = all.filter(c => !c.slug && !c.archived).length;
    const archived = all.filter(c => c.archived).length;
    const pct = Math.round(migrated / totalStandard * 100);
    el.innerHTML = `
      <div>📊 Sổ hiện tại: <strong>${all.length} danh mục</strong></div>
      <div>✅ Đã có chuẩn: <strong>${migrated}/${totalStandard}</strong> (${pct}%)</div>
      <div>📝 Tự thêm (chưa migrate): <strong>${customNonStd}</strong></div>
      <div>🗄️ Đã archive: <strong>${archived}</strong></div>
      <div style="margin-top:6px;color:${pct < 100 ? 'var(--accent)' : 'var(--text2)'}">
        ${pct < 100 ? '👉 Bấm "Cập nhật" để migrate sang bộ chuẩn V2' : '✨ Đã đầy đủ bộ chuẩn V2'}
      </div>
    `;
  },

  // Build preview cho migration: cat cũ nào sẽ map sang slug mới, cat nào chưa map
  _buildMigrationPreview() {
    const def = window.QLT_CategoriesDefault;
    if (!def) return null;
    const bookId = this.state.currentBookId;
    const existing = this.state.categories.filter(c => c.bookId === bookId);
    const existingBySlug = {};
    for (const c of existing) if (c.slug) existingBySlug[c.slug] = c;

    // 1. Slug nào trong def còn THIẾU → sẽ tạo mới
    const toCreate = def.ALL.filter(d => !existingBySlug[d.slug]);

    // 2. Cat cũ nào (không có slug) → tìm map
    const oldCats = existing.filter(c => !c.slug && !c.archived);
    const N = window.QLT_CategoryMatcher?.normalize || (s => s.toLowerCase());
    const mapped = []; // { oldCat, newSlug }
    const unmapped = [];
    for (const old of oldCats) {
      const k = N(old.name);
      const newSlug = def.MIGRATION_MAP[k];
      if (newSlug) mapped.push({ oldCat: old, newSlug });
      else unmapped.push(old);
    }

    // 3. Đếm số GD bị ảnh hưởng (cat cũ → cat mới)
    const txCountByOldCat = {};
    for (const t of this.state.transactions) {
      if (t.categoryId) txCountByOldCat[t.categoryId] = (txCountByOldCat[t.categoryId] || 0) + 1;
    }

    return {
      toCreate, // [def cat]
      mapped,   // [{ oldCat, newSlug }]
      unmapped, // [oldCat]
      txCountByOldCat
    };
  },

  openCatMigrateModal() {
    const preview = this._buildMigrationPreview();
    if (!preview) { QLT_UI.alert('Lỗi: chưa tải được bộ chuẩn', { title: 'Lỗi' }); return; }
    const { toCreate, mapped, unmapped, txCountByOldCat } = preview;

    let html = `
      <div style="background:var(--bg2);padding:12px;border-radius:8px;margin-bottom:12px">
        <div><strong>📥 ${toCreate.length}</strong> danh mục chuẩn mới sẽ được tạo</div>
        <div><strong>🔄 ${mapped.length}</strong> danh mục cũ sẽ được map sang chuẩn (giao dịch giữ nguyên, chỉ đổi categoryId)</div>
        <div><strong>📌 ${unmapped.length}</strong> danh mục tự đặt KHÔNG match được — giữ nguyên</div>
      </div>
    `;

    if (mapped.length) {
      html += '<div style="margin-bottom:8px"><strong>🔄 Sẽ map:</strong></div>';
      html += '<div style="font-size:12px;background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:12px">';
      for (const m of mapped.slice(0, 30)) {
        const def = window.QLT_CategoriesDefault.ALL.find(d => d.slug === m.newSlug);
        const txN = txCountByOldCat[m.oldCat.id] || 0;
        html += `<div style="margin:3px 0">• <span style="color:var(--text2)">${this.escapeHtml(m.oldCat.name)}</span> → <strong>${this.escapeHtml(def?.name || m.newSlug)}</strong>${txN ? ` <span style="color:var(--text3)">(${txN} GD)</span>` : ''}</div>`;
      }
      if (mapped.length > 30) html += `<div style="color:var(--text3);margin-top:6px">+ ${mapped.length - 30} cat khác…</div>`;
      html += '</div>';
    }

    if (unmapped.length) {
      html += '<div style="margin-bottom:8px"><strong>📌 Giữ nguyên (chưa match):</strong></div>';
      html += '<div style="font-size:12px;color:var(--text2);background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:12px">';
      html += unmapped.slice(0, 15).map(c => `• ${this.escapeHtml(c.name)}`).join('<br>');
      if (unmapped.length > 15) html += `<br><span style="color:var(--text3)">+ ${unmapped.length - 15} cat khác…</span>`;
      html += '</div>';
    }

    html += `
      <div style="background:#fef3c7;border-left:3px solid #f59e0b;padding:10px;border-radius:4px;font-size:12px;line-height:1.6">
        <strong>⚠️ Lưu ý:</strong>
        <ul style="margin:6px 0 0 18px;padding:0">
          <li>Giao dịch cũ <strong>KHÔNG bị xoá</strong> — chỉ <em>categoryId</em> được trỏ sang cat chuẩn mới</li>
          <li>Cat cũ được <strong>archive</strong> (không xoá), có thể restore sau</li>
          <li>Cat tự đặt không match → giữ nguyên, dùng song song với bộ chuẩn</li>
        </ul>
      </div>
    `;

    $('#catMigratePreview').innerHTML = html;
    $('#catMigrateModal').classList.add('open');
    $('#catMigrateConfirm').onclick = () => this.runCatMigration();
  },

  async runCatMigration() {
    const preview = this._buildMigrationPreview();
    if (!preview) return;
    const { toCreate, mapped } = preview;
    const bookId = this.state.currentBookId;
    const def = window.QLT_CategoriesDefault;

    // 1. Tạo cat chuẩn còn thiếu (cha trước, con sau)
    const slugToId = {};
    for (const c of this.state.categories) if (c.slug) slugToId[c.slug] = c.id;
    let order = Math.max(0, ...this.state.categories.map(c => c.order || 0)) + 1;

    // Pass 1: parent
    for (const d of toCreate.filter(x => !x.parentSlug)) {
      const obj = await window.QLT_Store.put('categories', {
        slug: d.slug, type: d.type, name: d.name, icon: d.icon, color: d.color,
        parentId: null,
        keywords: [...(d.keywords.brand || []), ...(d.keywords.strong || []), ...(d.keywords.weak || [])],
        antiKeywords: d.antiKeywords || {},
        archived: false, order: order++, bookId
      });
      slugToId[d.slug] = obj.id;
    }
    // Pass 2: children
    for (const d of toCreate.filter(x => x.parentSlug)) {
      const obj = await window.QLT_Store.put('categories', {
        slug: d.slug, type: d.type, name: d.name, icon: d.icon, color: d.color,
        parentId: slugToId[d.parentSlug] || null,
        keywords: [...(d.keywords.brand || []), ...(d.keywords.strong || []), ...(d.keywords.weak || [])],
        antiKeywords: d.antiKeywords || {},
        archived: false, order: order++, bookId
      });
      slugToId[d.slug] = obj.id;
    }

    // 2. Map cat cũ → cat mới
    let movedTx = 0;
    let archivedCats = 0;
    for (const m of mapped) {
      const newId = slugToId[m.newSlug];
      if (!newId) continue;
      // Update mọi GD trỏ sang cat cũ
      for (const t of this.state.transactions) {
        if (t.categoryId === m.oldCat.id) {
          t.categoryId = newId;
          await window.QLT_Store.put('transactions', t);
          movedTx++;
        }
      }
      // Update budgets nếu có
      const allBudgets = await window.QLT_Store.getAll('budgets');
      for (const b of allBudgets) {
        if (b.categoryId === m.oldCat.id) {
          b.categoryId = newId;
          await window.QLT_Store.put('budgets', b);
        }
      }
      // Archive cat cũ
      m.oldCat.archived = true;
      m.oldCat._archivedReason = 'migrated_to_' + m.newSlug;
      await window.QLT_Store.put('categories', m.oldCat);
      archivedCats++;
    }

    await this.reload();
    $('#catMigrateModal').classList.remove('open');
    QLT_UI.toast(`✨ Migration xong: tạo ${toCreate.length} cat chuẩn, map ${movedTx} GD, archive ${archivedCats} cat cũ`, { type: 'success', duration: 4000 });
    this.renderSettings();
    this.autoSync();
  },

  openMatcherTestModal() {
    $('#matcherTestModal').classList.add('open');
    $('#matcherTestResult').innerHTML = '<div style="color:var(--text3);text-align:center;padding:14px">↑ Gõ câu rồi bấm Match thử</div>';
    $('#matcherTestInput').value = '';
    $('#matcherTestRun').onclick = () => this._runMatcherTest();
    $('#matcherTestInput').onkeydown = (e) => {
      if (e.key === 'Enter') this._runMatcherTest();
    };
    setTimeout(() => $('#matcherTestInput').focus(), 100);
  },

  _runMatcherTest() {
    const input = $('#matcherTestInput').value.trim();
    if (!input) return;
    const type = $('#matcherTestType').value || 'expense';
    const cands = this.state.categories.filter(c => c.type === type && !c.archived);
    const M = window.QLT_CategoryMatcher;
    const r = M.match(input, cands, { type });
    const resWrap = $('#matcherTestResult');

    let badge, badgeColor;
    if (r.confidence >= M.THRESHOLD.AUTO) { badge = '⚡ AUTO'; badgeColor = '#16a34a'; }
    else if (r.confidence >= M.THRESHOLD.SUGGEST) { badge = '💡 SUGGEST'; badgeColor = '#f59e0b'; }
    else { badge = '⏸️ ABSTAIN'; badgeColor = '#525252'; }

    let html = `
      <div style="background:var(--bg2);padding:10px;border-radius:8px;margin-bottom:10px">
        <div style="font-size:12px;color:var(--text2)">Input: <strong style="color:var(--text)">${this.escapeHtml(input)}</strong></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <span style="background:${badgeColor};color:white;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600">${badge}</span>
        <span style="font-size:12px;color:var(--text2)">Confidence: <strong>${r.confidence.toFixed(2)}</strong></span>
      </div>
    `;

    if (r.candidates && r.candidates.length) {
      html += '<div style="font-size:12px;color:var(--text2);margin-bottom:6px">Top match:</div>';
      html += '<div style="background:var(--bg2);padding:8px;border-radius:6px">';
      for (const c of r.candidates) {
        const isBest = c.id === r.candidates[0].id;
        html += `
          <div style="display:flex;justify-content:space-between;padding:4px 0;${isBest ? 'font-weight:600;color:var(--text)' : 'color:var(--text2)'}">
            <span>${isBest ? '🥇 ' : '   '}${this.escapeHtml(c.name)}</span>
            <span style="font-size:11px">${c.score.toFixed(2)} · ${c.tier} · "${this.escapeHtml(c.kw || '')}"</span>
          </div>
        `;
      }
      html += '</div>';
    } else {
      html += '<div style="color:var(--text3);text-align:center;padding:14px">Không có cat nào match — matcher abstain</div>';
    }

    resWrap.innerHTML = html;
  },

  openMatcherAccuracyModal() {
    const wrap = $('#matcherAccuracyResult');
    wrap.innerHTML = '<div style="text-align:center;padding:20px">⏳ Đang chạy 100+ test cases…</div>';
    $('#matcherAccuracyModal').classList.add('open');

    setTimeout(() => {
      const TD = window.QLT_CategoryTestDataset;
      if (!TD) { wrap.innerHTML = '⚠️ Test dataset chưa load'; return; }
      const def = window.QLT_CategoriesDefault;
      // Build cat list từ default (không cần đợi user migrate — test chạy với bộ default)
      // Mỗi def cat tạo 1 fake cat object có id = slug, slug, type, name, keywords (flat), antiKeywords
      const fakeExpense = def.EXPENSE.map(d => ({
        id: d.slug, slug: d.slug, type: 'expense', name: d.name,
        keywords: [...(d.keywords.brand || []), ...(d.keywords.strong || []), ...(d.keywords.weak || [])],
        antiKeywords: d.antiKeywords || {}
      }));
      const fakeIncome = def.INCOME.map(d => ({
        id: d.slug, slug: d.slug, type: 'income', name: d.name,
        keywords: [...(d.keywords.brand || []), ...(d.keywords.strong || []), ...(d.keywords.weak || [])],
        antiKeywords: d.antiKeywords || {}
      }));

      const stats = TD.runTests({ expense: fakeExpense, income: fakeIncome });

      const acc = parseFloat(stats.accuracy);
      const accColor = acc >= 85 ? '#16a34a' : acc >= 75 ? '#f59e0b' : '#dc2626';
      const accLabel = acc >= 85 ? '✅ ĐẠT (≥85%)' : acc >= 75 ? '⚠️ Chưa tốt' : '❌ Thấp';

      let html = `
        <div style="background:var(--bg2);padding:14px;border-radius:8px;margin-bottom:12px;text-align:center">
          <div style="font-size:32px;font-weight:700;color:${accColor}">${stats.accuracy}%</div>
          <div style="font-size:13px;color:${accColor};margin-top:4px">${accLabel}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:8px">
            Pass: ${stats.pass}/${stats.total} · Fail: ${stats.fail}
          </div>
        </div>
      `;

      // Hiện list FAIL
      const fails = stats.results.filter(r => !r.pass);
      if (fails.length) {
        html += `<div style="font-size:13px;font-weight:600;margin-bottom:6px">❌ ${fails.length} case FAIL:</div>`;
        html += '<div style="background:var(--bg2);padding:8px;border-radius:6px;font-size:11px;line-height:1.5">';
        for (const r of fails.slice(0, 30)) {
          html += `
            <div style="margin:6px 0;padding:6px;background:var(--bg);border-radius:4px">
              <div><strong>${this.escapeHtml(r.input)}</strong>${r.note ? ` <span style="color:var(--text3)">— ${this.escapeHtml(r.note)}</span>` : ''}</div>
              <div style="color:var(--text2)">Expect: <code>${this.escapeHtml(r.expected)}</code> · Got: <code style="color:#dc2626">${this.escapeHtml(r.got)}</code> (${r.confidence}, ${r.tier || '—'})</div>
            </div>
          `;
        }
        if (fails.length > 30) html += `<div style="color:var(--text3);margin-top:6px">+ ${fails.length - 30} case khác…</div>`;
        html += '</div>';
      } else {
        html += '<div style="text-align:center;padding:14px;color:#16a34a">🎉 Tất cả pass!</div>';
      }

      wrap.innerHTML = html;
    }, 50);
  },

  renderHomeWidgetSettings() {
    const wrap = $('#setHomeWidgets');
    if (!wrap) return;
    const items = [
      { key: 'wallets',  label: 'Số dư từng ví' },
      { key: 'savings',  label: '💎 Tài sản tiết kiệm' },
      { key: 'goals',    label: '🏆 Mục tiêu tiết kiệm' },
      { key: 'forecast', label: '📊 Dự báo cuối tháng' },
      { key: 'budgets',  label: '🎯 Ngân sách tháng' },
      { key: 'loans',    label: '🤝 Cho vay / Nợ' },
      { key: 'insights', label: '💡 Phân tích tài chính' },
      { key: 'recent',   label: 'Giao dịch gần đây' }
    ];
    wrap.innerHTML = items.map(it => `
      <div class="setting-row">
        <span class="setting-label">${it.label}</span>
        <label class="qlt-switch">
          <input type="checkbox" data-widget-toggle="${it.key}" ${this.isHomeWidgetOn(it.key) ? 'checked' : ''}>
          <span class="qlt-switch-slider"></span>
        </label>
      </div>
    `).join('');
    wrap.querySelectorAll('[data-widget-toggle]').forEach(el => {
      el.onchange = (e) => {
        this.setHomeWidgetPref(el.dataset.widgetToggle, e.target.checked);
      };
    });
  },

  async renderLockSettings() {
    const Lock = window.QLT_Lock;
    if (!Lock) return;
    const enabled = Lock.isEnabled();
    const bioInfo = await Lock.bioAvailable();
    const bioOn = Lock.isBiometricFlagOn();
    const timeout = Lock.getTimeoutSeconds();

    $('#setLockStatus').textContent = enabled
      ? (bioOn && bioInfo.available ? 'Đã bật PIN + Sinh trắc' : 'Đã bật PIN')
      : 'Chưa bật';
    $('#setLockStatus').style.color = enabled ? 'var(--accent)' : 'var(--text2)';

    $('#setLockEnable').style.display = enabled ? 'none' : 'block';
    $('#setLockChangePin').style.display = enabled ? 'block' : 'none';
    $('#setLockDisable').style.display = enabled ? 'block' : 'none';
    $('#setBioRow').style.display = (enabled && bioInfo.available) ? 'flex' : 'none';
    $('#setTimeoutRow').style.display = enabled ? 'flex' : 'none';
    $('#setBiometricToggle').checked = bioOn;
    $('#setLockTimeout').value = String(timeout);

    // Bind 1 lần
    if (this._lockSettingsBound) return;
    this._lockSettingsBound = true;

    $('#setLockEnable').onclick = async () => {
      // Hỏi 4 hoặc 6 chữ số
      const useSix = await QLT_UI.confirm('Chọn độ dài PIN:\n\n• Bấm "4 chữ số" để dùng PIN ngắn (mặc định)\n• Bấm "6 chữ số" để dùng PIN dài hơn (an toàn hơn)', { okLabel: '6 chữ số', cancelLabel: '4 chữ số' });
      const pinLen = useSix ? 6 : 4;
      Lock.showSetup(() => this.renderLockSettings(), pinLen);
    };

    $('#setLockChangePin').onclick = () => {
      Lock.showChange(() => this.renderLockSettings());
    };

    $('#setLockDisable').onclick = async () => {
      if (!await QLT_UI.confirm('Tắt khoá PIN? App sẽ không yêu cầu PIN nữa.', { okLabel: 'Tắt khoá', danger: true })) return;
      Lock.disable(() => this.renderLockSettings());
    };

    $('#setBiometricToggle').onchange = async (e) => {
      try {
        await Lock.setBiometric(e.target.checked);
        await this.renderLockSettings();
        QLT_UI.toast(e.target.checked ? 'Đã bật sinh trắc' : 'Đã tắt sinh trắc', { type: 'success' });
      } catch (err) {
        e.target.checked = false;
        QLT_UI.alert('Thiết bị không hỗ trợ sinh trắc, hoặc bạn chưa đăng ký vân tay/Face. Vào Cài đặt Android để đăng ký trước.', { title: 'Không khả dụng' });
      }
    };

    $('#setLockTimeout').onchange = (e) => {
      Lock.setTimeout(e.target.value);
      QLT_UI.toast('Đã cập nhật thời gian khoá lại', { type: 'success' });
    };
  },

  // ============ MODAL: TRANSACTION ============
  openTxModal(id, defaultType) {
    // Ẩn suggest banner mỗi khi mở modal mới
    const sg = $('#txCatSuggest');
    if (sg) { sg.style.display = 'none'; sg.innerHTML = ''; }
    // Ẩn banner nhận diện cat + clear context
    const cd = $('#txCatDetected');
    if (cd) { cd.style.display = 'none'; cd.innerHTML = ''; }
    delete this.state._catDetectContext;
    this.state._catDetectFromNote = false;
    const isNew = !id;
    let tx;
    if (isNew) {
      tx = {
        id: null,
        type: defaultType || 'expense',
        amount: 0,
        date: today(),
        accountId: this.state.accounts[0]?.id || null,
        toAccountId: this.state.accounts[1]?.id || null,
        categoryId: null,
        note: '',
        photos: [],
        participantIds: null, // null = tất cả thành viên (mặc định)
        bookId: this.state.currentBookId
      };
    } else {
      tx = this.state.transactions.find(t => t.id === id);
      if (!tx) return;
      // Giao dịch sinh từ Khoản vay/Trả nợ → mở Loan modal để sửa từ nguồn,
      // tránh lệch giữa loan.principal/payment.amount với tx.amount
      if (tx._loanId) {
        const loan = this.state.loans.find(l => l.id === tx._loanId);
        if (loan) { this.openLoanModal(loan.id); return; }
      }
      // Fuel / Maintenance: redirect sang modal tương ứng
      if (tx._fuelLogId) { this.openFuelLogModal(tx._fuelLogId); return; }
      if (tx._maintLogId) { this.openMaintLogModal(tx._maintLogId); return; }
    }
    // Chuẩn hoá photos cho editingTx (giữ tương thích schema cũ tx.photo)
    this.state.editingTx = { ...tx, photos: this.getTxPhotos(tx) };
    delete this.state.editingTx.photo;
    // Init tags array
    if (!Array.isArray(this.state.editingTx.tags)) this.state.editingTx.tags = [];
    this.renderTxTags();
    $('#txForm').dataset.type = tx.type;
    $$('.tx-type-pill').forEach(el => {
      el.classList.toggle('on', el.dataset.type === tx.type);
    });
    $('#txAmount').value = fmtAmount(tx.amount);
    $('#txDate').value = tx.date;
    $('#txNote').value = tx.note || '';
    $('#txDelete').style.display = isNew ? 'none' : 'block';
    $('#txTitle').textContent = isNew ? 'Thêm giao dịch' : 'Sửa giao dịch';

    // Note typing → auto-detect cat (debounced 400ms)
    // Chỉ trigger khi: tx mới (chưa có cat) HOẶC cat hiện tại do auto-detect (user chưa lock manual)
    const noteEl = $('#txNote');
    if (noteEl && !noteEl._catDetectBound) {
      noteEl._catDetectBound = true;
      let dbTimer = null;
      noteEl.addEventListener('input', () => {
        clearTimeout(dbTimer);
        dbTimer = setTimeout(() => this._detectCatFromNote(noteEl.value), 400);
      });
    }

    // Render account picker
    $('#txAccountList').innerHTML = this.state.accounts.slice().sort(sortByOrder).map(a => `
      <div class="picker-item ${a.id === tx.accountId ? 'on' : ''}" data-acc="${a.id}">
        <span class="picker-icon" style="color:#2d6a4f">${svgIcon(a.icon || 'cash')}</span>
        <span>${this.escapeHtml(a.name)}</span>
      </div>
    `).join('');
    $$('#txAccountList .picker-item').forEach(el => {
      el.onclick = () => {
        $$('#txAccountList .picker-item').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.editingTx.accountId = el.dataset.acc;
        if ($('#txForm').dataset.type === 'transfer') {
          // Nếu chọn từ trùng đích → reset đích
          if (this.state.editingTx.toAccountId === el.dataset.acc) {
            this.state.editingTx.toAccountId = null;
          }
          this.renderTxToAccountPicker();
        }
      };
    });

    this.applyTxTypeUI(tx.type);
    this.renderTxPhoto();

    // Pre-load GPS nếu user bật toggle + đây là tx mới + không phải transfer
    this._setupTxLocation(isNew);

    $('#txModal').classList.add('open');
  },

  _setupTxLocation(isNew) {
    const sec = $('#txLocationSection');
    if (!sec) return;
    const enabled = QLT_Geo.isEnabled();
    const t = this.state.editingTx;
    const isTransfer = t.type === 'transfer';

    // Hiện section khi: bật toggle + không transfer + (tạo mới HOẶC tx đã có location)
    const show = enabled && !isTransfer && (isNew || t.location);
    sec.style.display = show ? 'block' : 'none';
    if (!show) return;

    const updateUI = () => {
      const loc = this.state.editingTx?.location;
      const icon = $('#txLocIcon');
      const text = $('#txLocText');
      if (loc?.address) {
        icon.textContent = '📍';
        text.textContent = loc.address;
        text.style.color = 'var(--text)';
      } else if (loc?.lat) {
        icon.textContent = '📍';
        text.textContent = `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} (đang tra địa chỉ...)`;
        text.style.color = 'var(--text2)';
      } else {
        icon.textContent = '⏳';
        text.textContent = 'Đang lấy vị trí GPS...';
        text.style.color = 'var(--text2)';
      }
    };
    updateUI();

    // Auto-capture cho tx MỚI (không edit)
    if (isNew && !this.state.editingTx.location) {
      QLT_Geo.getCurrentPosition().then(async (pos) => {
        if (!this.state.editingTx) return;  // user đã đóng modal
        this.state.editingTx.location = { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy };
        updateUI();
        // Reverse geocode
        const geo = await QLT_Geo.reverseGeocode(pos.lat, pos.lng);
        if (geo && this.state.editingTx?.location) {
          this.state.editingTx.location.address = geo.address;
          this.state.editingTx.location.fullAddress = geo.full;
          updateUI();
        }
      }).catch((e) => {
        $('#txLocIcon').textContent = '⚠️';
        $('#txLocText').textContent = 'Không lấy được vị trí: ' + (e?.message || 'GPS lỗi');
      });
    }

    $('#txLocEdit').onclick = () => this.openLocationPicker();
    $('#txLocClear').onclick = () => {
      delete this.state.editingTx.location;
      updateUI();
      $('#txLocIcon').textContent = '✕';
      $('#txLocText').textContent = 'Đã bỏ vị trí cho GD này';
      $('#txLocText').style.color = 'var(--text3)';
    };
  },

  // Mở map picker để user kéo thả pin / search địa chỉ
  async openLocationPicker() {
    try { await this._loadLeaflet(); }
    catch (e) { QLT_UI.alert('Cần internet để mở bản đồ.'); return; }

    $('#locPickerModal').classList.add('open');
    const cur = this.state.editingTx?.location;
    const startLat = cur?.lat || 16.0544;
    const startLng = cur?.lng || 108.2022;

    setTimeout(() => {
      const mapEl = $('#locPickerMap');
      // Cleanup old map nếu có
      if (this._locPickerMap) { this._locPickerMap.remove(); this._locPickerMap = null; }
      this._locPickerMap = window.L.map(mapEl).setView([startLat, startLng], cur ? 16 : 11);
      window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© OpenStreetMap'
      }).addTo(this._locPickerMap);

      this._locPickerMarker = window.L.marker([startLat, startLng], { draggable: true }).addTo(this._locPickerMap);
      this._locPickerPicked = { lat: startLat, lng: startLng, address: cur?.address || '' };

      const updateAddr = async (lat, lng) => {
        $('#locPickerAddress').innerHTML = '<span style="color:var(--text3)">⏳ Đang tra địa chỉ...</span>';
        const geo = await QLT_Geo.reverseGeocode(lat, lng);
        if (geo) {
          $('#locPickerAddress').innerHTML = `📍 <strong>${this.escapeHtml(geo.address)}</strong><br><span style="font-size:11px;color:var(--text3)">${this.escapeHtml(geo.full)}</span>`;
          this._locPickerPicked = { lat, lng, address: geo.address, fullAddress: geo.full };
        } else {
          $('#locPickerAddress').innerHTML = `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)} <span style="color:var(--text3)">(không tra được địa chỉ)</span>`;
          this._locPickerPicked = { lat, lng };
        }
      };

      // Initial address
      updateAddr(startLat, startLng);

      // Drag marker
      this._locPickerMarker.on('dragend', (e) => {
        const ll = e.target.getLatLng();
        updateAddr(ll.lat, ll.lng);
      });
      // Click map → move marker
      this._locPickerMap.on('click', (e) => {
        this._locPickerMarker.setLatLng(e.latlng);
        updateAddr(e.latlng.lat, e.latlng.lng);
      });

      // Force resize sau khi modal animate xong
      setTimeout(() => this._locPickerMap.invalidateSize(), 350);
    }, 100);

    // Search bar
    const search = $('#locSearchInput');
    const searchBtn = $('#locSearchBtn');
    const results = $('#locSearchResults');
    const doSearch = async () => {
      const q = search.value.trim();
      if (!q) return;
      results.innerHTML = '<div style="padding:10px;color:var(--text3);font-size:12px">⏳ Đang tìm...</div>';
      results.style.display = 'block';
      const list = await QLT_Geo.searchAddress(q);
      if (list.length === 0) {
        results.innerHTML = '<div style="padding:10px;color:var(--text3);font-size:12px">Không tìm thấy địa chỉ phù hợp</div>';
        return;
      }
      results.innerHTML = list.map((r, i) =>
        `<div data-pick="${i}" style="padding:10px;border-bottom:1px solid var(--border);cursor:pointer;font-size:12px;line-height:1.5">${this.escapeHtml(r.shortName)}</div>`
      ).join('');
      results.querySelectorAll('[data-pick]').forEach(el => {
        el.onclick = () => {
          const r = list[parseInt(el.dataset.pick, 10)];
          this._locPickerMarker.setLatLng([r.lat, r.lng]);
          this._locPickerMap.setView([r.lat, r.lng], 16);
          this._locPickerPicked = { lat: r.lat, lng: r.lng, address: r.shortName, fullAddress: r.name };
          $('#locPickerAddress').innerHTML = `📍 <strong>${this.escapeHtml(r.shortName)}</strong><br><span style="font-size:11px;color:var(--text3)">${this.escapeHtml(r.name)}</span>`;
          results.style.display = 'none';
          search.value = '';
        };
      });
    };
    search.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } };
    searchBtn.onclick = doSearch;

    $('#locPickerConfirm').onclick = () => {
      const p = this._locPickerPicked;
      if (!p?.lat) { QLT_UI.toast('Chưa chọn vị trí', { type: 'error' }); return; }
      this.state.editingTx.location = {
        lat: p.lat,
        lng: p.lng,
        address: p.address || '',
        fullAddress: p.fullAddress || ''
      };
      $('#locPickerModal').classList.remove('open');
      // Re-render display section
      this._setupTxLocation(false);
    };
  },

  applyTxTypeUI(type) {
    if (type === 'transfer') {
      $('#txCategorySection').style.display = 'none';
      $('#txAccountLabel').textContent = 'Từ tài khoản';
      $('#txToAccountSection').style.display = 'block';
      this.renderTxToAccountPicker();
      const hint = $('#txBudgetHint'); if (hint) hint.style.display = 'none';
    } else {
      $('#txCategorySection').style.display = 'block';
      $('#txAccountLabel').textContent = 'Tài khoản';
      $('#txToAccountSection').style.display = 'none';
      this.renderTxCategoryPicker(type);
    }
    this.renderTxParticipants();
  },

  renderTxParticipants() {
    const sec = $('#txParticipantsSection');
    if (!sec) return;
    const tx = this.state.editingTx;
    const currentType = $('#txForm').dataset.type || tx?.type;
    const book = this.state.books.find(b => b.id === (tx?.bookId || this.state.currentBookId));
    const members = (book?.members || []).filter(m => m.name && m.name.trim());
    // Chỉ hiện khi là CHI và sổ có thành viên
    if (!tx || currentType !== 'expense' || members.length === 0) {
      sec.style.display = 'none';
      return;
    }
    sec.style.display = 'block';

    // null/undefined = tất cả tham gia
    let selected = tx.participantIds;
    if (!Array.isArray(selected)) selected = members.map(m => m.id);

    const list = $('#txParticipantsList');
    list.innerHTML = members.map((m, i) => {
      const on = selected.includes(m.id);
      return `<div class="picker-item ${on ? 'on' : ''}" data-mem="${m.id}" style="user-select:none">
        <span style="display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center;background:${on ? 'var(--accent)' : 'var(--surface2)'};color:${on ? '#fff' : 'var(--text2)'};border-radius:50%;font-size:10px;font-weight:700">${on ? '✓' : (i + 1)}</span>
        <span>${this.escapeHtml(m.name)}</span>
      </div>`;
    }).join('');

    const updateHint = () => {
      const cur = this.state.editingTx.participantIds;
      const arr = Array.isArray(cur) ? cur : members.map(m => m.id);
      const amt = readAmount($('#txAmount'));
      const per = arr.length > 0 ? Math.round(amt / arr.length) : 0;
      $('#txParticipantsHint').textContent = arr.length === members.length
        ? `Tất cả ${members.length} thành viên — mỗi người ${fmt(per)}đ`
        : arr.length === 0
        ? 'Chưa chọn ai → giao dịch này KHÔNG được tính vào quyết toán'
        : `${arr.length}/${members.length} người tham gia — mỗi người ${fmt(per)}đ`;
    };

    $$('#txParticipantsList .picker-item').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.mem;
        let cur = this.state.editingTx.participantIds;
        if (!Array.isArray(cur)) cur = members.map(m => m.id);
        if (cur.includes(id)) cur = cur.filter(x => x !== id);
        else cur = [...cur, id];
        // Nếu trùng đúng tất cả thành viên → set null cho gọn
        this.state.editingTx.participantIds = (cur.length === members.length && members.every(m => cur.includes(m.id))) ? null : cur;
        this.renderTxParticipants();
      };
    });

    $('#txPartAll').onclick = () => {
      this.state.editingTx.participantIds = null;
      this.renderTxParticipants();
    };
    $('#txPartNone').onclick = () => {
      this.state.editingTx.participantIds = [];
      this.renderTxParticipants();
    };
    // Hint update khi gõ số tiền
    $('#txAmount').oninput = updateHint;
    updateHint();
  },

  renderTxToAccountPicker() {
    const sel = this.state.editingTx?.toAccountId;
    const from = this.state.editingTx?.accountId;
    $('#txToAccountList').innerHTML = this.state.accounts.slice().sort(sortByOrder).map(a => `
      <div class="picker-item ${a.id === sel ? 'on' : ''} ${a.id === from ? 'disabled' : ''}" data-acc="${a.id}">
        <span class="picker-icon" style="color:#2d6a4f">${svgIcon(a.icon || 'cash')}</span>
        <span>${this.escapeHtml(a.name)}</span>
      </div>
    `).join('');
    $$('#txToAccountList .picker-item').forEach(el => {
      el.onclick = () => {
        if (el.classList.contains('disabled')) {
          QLT_UI.toast('Tài khoản nguồn và đích phải khác nhau', { type: 'error' });
          return;
        }
        $$('#txToAccountList .picker-item').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.editingTx.toAccountId = el.dataset.acc;
      };
    });
  },

  renderTxCategoryPicker(type) {
    const cats = this.state.categories.filter(c => c.type === type && !c.archived);
    const sel = this.state.editingTx?.categoryId;

    const parents = cats.filter(c => !c.parentId).sort(sortByOrder);
    const childrenByParent = {};
    for (const c of cats) {
      if (c.parentId) (childrenByParent[c.parentId] = childrenByParent[c.parentId] || []).push(c);
    }
    Object.keys(childrenByParent).forEach(pid => childrenByParent[pid].sort(sortByOrder));
    // Orphan: con của 1 cha không tồn tại / bị archived → render riêng
    const orphans = cats.filter(c => c.parentId && !cats.find(x => x.id === c.parentId)).sort(sortByOrder);

    // Resolve activeParentId: ưu tiên (1) editingTx._activeParent (vừa tap)
    // (2) parent của selected leaf, (3) parent của recent cat, (4) parent đầu tiên có con
    let activeParentId = this.state.editingTx?._activeParent;
    if (!activeParentId && sel) {
      const c = cats.find(x => x.id === sel);
      if (c) activeParentId = c.parentId || c.id;
    }
    if (!activeParentId) {
      const recent = (this.state.transactions || [])
        .filter(t => t.type === type && t.categoryId).slice(-30).reverse();
      for (const r of recent) {
        const c = cats.find(x => x.id === r.categoryId);
        if (c) { activeParentId = c.parentId || c.id; break; }
      }
    }
    if (!activeParentId) {
      activeParentId = parents.find(p => (childrenByParent[p.id] || []).length > 0)?.id || parents[0]?.id;
    }

    // Recent — 6 cat dùng gần nhất (cả parent + sub)
    const recentSet = new Set();
    const recentCats = [];
    for (const t of (this.state.transactions || []).slice(-50).reverse()) {
      if (t.type !== type || !t.categoryId) continue;
      const c = cats.find(x => x.id === t.categoryId);
      if (c && !recentSet.has(c.id)) {
        recentSet.add(c.id);
        recentCats.push(c);
        if (recentCats.length >= 6) break;
      }
    }

    let html = '';

    // 1) Recent row
    if (recentCats.length) {
      html += '<div class="cat-recent-label">⭐ GẦN ĐÂY</div>';
      html += '<div class="cat-recent-row">';
      for (const c of recentCats) {
        const isSel = sel === c.id;
        html += `
          <div class="cat-recent-tile ${isSel ? 'on' : ''}" data-cat="${c.id}">
            <span class="picker-icon" style="color:${c.color || ''}">${svgIcon(c.icon)}</span>
            <span>${this.escapeHtml(c.name)}</span>
          </div>
        `;
      }
      html += '</div>';
    }

    // 2) Parent grid 4 cột
    html += '<div class="cat-grid-parents">';
    for (const p of parents) {
      const children = childrenByParent[p.id] || [];
      const hasChildren = children.length > 0;
      const isActive = p.id === activeParentId;
      const isSelLeaf = sel === p.id; // chọn cha trực tiếp (không qua sub)
      const cls = ['cat-grid-tile'];
      if (isActive && hasChildren) cls.push('parent-active');
      if (isSelLeaf) cls.push('leaf-selected');
      html += `
        <div class="${cls.join(' ')}" data-parent-id="${p.id}" data-has-children="${hasChildren ? '1' : '0'}">
          <span class="cat-grid-tile-icon" style="color:${p.color || ''}">${svgIcon(p.icon)}</span>
          <span class="cat-grid-tile-name">${this.escapeHtml(p.name)}</span>
        </div>
      `;
    }
    html += '</div>';

    // 3) Sub area cho parent đang active
    const activeParent = parents.find(p => p.id === activeParentId);
    const activeChildren = (activeParent && childrenByParent[activeParent.id]) || [];
    if (activeParent && activeChildren.length) {
      const isParentSel = sel === activeParent.id;
      html += '<div class="cat-sub-area">';
      html += `<div class="cat-sub-head">▸ ${this.escapeHtml(activeParent.name)}</div>`;
      html += `
        <div class="cat-sub-pick-parent ${isParentSel ? 'on' : ''}" data-pick-parent="${activeParent.id}">
          ${isParentSel ? '✓ ' : ''}Chọn cả nhóm "${this.escapeHtml(activeParent.name)}"
        </div>
      `;
      html += '<div class="cat-sub-grid">';
      for (const ch of activeChildren) {
        const isSel = sel === ch.id;
        html += `
          <div class="cat-sub-tile ${isSel ? 'on' : ''}" data-cat="${ch.id}">
            <span class="cat-sub-tile-icon" style="color:${ch.color || ''}">${svgIcon(ch.icon)}</span>
            <span class="cat-sub-tile-name">${this.escapeHtml(ch.name)}</span>
          </div>
        `;
      }
      html += '</div>';
      html += '</div>';
    }

    // 4) Orphan (cat con bị mất cha) — render riêng cuối
    if (orphans.length) {
      html += '<div class="cat-orphan-row">';
      html += '<div class="cat-orphan-label">📌 Khác (không có nhóm cha)</div>';
      for (const o of orphans) {
        const isSel = sel === o.id;
        html += `
          <div class="cat-orphan-tile ${isSel ? 'on' : ''}" data-cat="${o.id}">
            <span class="picker-icon" style="color:${o.color || ''}">${svgIcon(o.icon)}</span>
            <span>${this.escapeHtml(o.name)}</span>
          </div>
        `;
      }
      html += '</div>';
    }

    $('#txCategoryList').innerHTML = html;

    // ===== Click handlers =====
    // Helper: lock cat manual → các flag auto-detect bị clear
    const lockManual = (cid) => {
      this.state.editingTx.categoryId = cid;
      delete this.state.editingTx._activeParent;
      delete this.state.editingTx._catFromAutoDetect;
    };

    // Parent tile: leaf → chọn; có children → set active parent (re-render)
    $$('#txCategoryList .cat-grid-tile').forEach(el => {
      el.onclick = () => {
        const pid = el.dataset.parentId;
        const hasChildren = el.dataset.hasChildren === '1';
        if (!hasChildren) {
          lockManual(pid);
          this._maybeOfferKeywordLearning(pid);
        } else {
          this.state.editingTx._activeParent = pid;
        }
        this.renderTxCategoryPicker(type);
        this.renderTxBudgetHint();
      };
    });

    // Sub tile: chọn con
    $$('#txCategoryList .cat-sub-tile').forEach(el => {
      el.onclick = () => {
        const cid = el.dataset.cat;
        lockManual(cid);
        this.renderTxCategoryPicker(type);
        this.renderTxBudgetHint();
        this._maybeOfferKeywordLearning(cid);
      };
    });

    // Pick parent (nút "Chọn cả nhóm")
    $$('#txCategoryList [data-pick-parent]').forEach(el => {
      el.onclick = () => {
        const cid = el.dataset.pickParent;
        lockManual(cid);
        this.renderTxCategoryPicker(type);
        this.renderTxBudgetHint();
        this._maybeOfferKeywordLearning(cid);
      };
    });

    // Recent + Orphan tile: chọn trực tiếp
    $$('#txCategoryList .cat-recent-tile, #txCategoryList .cat-orphan-tile').forEach(el => {
      el.onclick = () => {
        const cid = el.dataset.cat;
        lockManual(cid);
        this.renderTxCategoryPicker(type);
        this.renderTxBudgetHint();
        this._maybeOfferKeywordLearning(cid);
      };
    });

    this.renderTxBudgetHint();
  },

  // Hiện ngân sách còn lại của danh mục đang chọn (chỉ áp dụng cho 'expense')
  renderTxBudgetHint() {
    const hint = $('#txBudgetHint');
    if (!hint) return;
    const tx = this.state.editingTx;
    if (!tx || tx.type !== 'expense' || !tx.categoryId) {
      hint.style.display = 'none';
      return;
    }

    // Nếu user pick cat "Chi phí xe" (transport_vehicle) → gợi ý dùng tab Chi phí xe
    // để có data đầy đủ (xe, odometer, lít, kind...) cho báo cáo chi tiết
    const cat = this.state.categories.find(c => c.id === tx.categoryId);
    if (cat?.slug === 'transport_vehicle') {
      hint.style.display = 'block';
      hint.className = 'tx-budget-hint vehicle-hint';
      hint.innerHTML = `
        🚗 <strong>Chi phí xe</strong> — để app theo dõi <em>tiêu thụ xăng / cảnh báo thay nhớt / báo cáo theo từng xe</em>,
        khuyến khích ghi qua <strong>tab "Chi phí xe"</strong> (có đầy đủ field xe, odometer, lít, loại bảo dưỡng).
        <br>
        <a href="#" id="txGoFuelTab" style="color:var(--accent);font-weight:600;text-decoration:underline">
          → Mở tab Chi phí xe (giữ amount này)
        </a>
      `;
      const goLink = hint.querySelector('#txGoFuelTab');
      if (goLink) {
        goLink.onclick = (e) => {
          e.preventDefault();
          // Đóng tx form + mở fuel tab + pre-fill amount
          const amountInput = $('#txAmount');
          const amount = readAmount(amountInput);
          $('#txModal').classList.remove('open');
          this.switchTab('fuel');
          // Mở modal đổ xăng pre-fill amount (default — user có thể chuyển sang bảo dưỡng)
          setTimeout(() => this.openFuelLogModal(null, { amount }), 200);
        };
      }
      return;
    }

    const budget = this.state.budgets.find(b => b.categoryId === tx.categoryId);
    if (!budget) { hint.style.display = 'none'; return; }

    const ym = (tx.date || today()).slice(0, 7);
    let spent = this.budgetSpent(tx.categoryId, ym);
    // Nếu đang sửa: trừ chính giao dịch này khỏi 'đã chi' để hiện đúng
    if (tx.id) {
      const existing = this.state.transactions.find(x => x.id === tx.id);
      if (existing && existing.date.startsWith(ym)) spent -= existing.amount;
    }
    const remain = budget.amount - spent;
    const pct = budget.amount > 0 ? Math.round(spent / budget.amount * 100) : 0;
    let cls = 'ok', emoji = '✅';
    if (pct >= 100) { cls = 'over'; emoji = '🚫'; }
    else if (pct >= 80) { cls = 'warn'; emoji = '⚠️'; }

    hint.style.display = 'block';
    hint.className = 'tx-budget-hint ' + (cls === 'ok' ? '' : cls);
    if (remain >= 0) {
      hint.innerHTML = `${emoji} <strong>Ngân sách:</strong> còn <strong>${fmt(remain)} đ</strong> trong tháng này (đã chi ${fmt(spent)} / ${fmt(budget.amount)} · ${pct}%)`;
    } else {
      hint.innerHTML = `${emoji} <strong>Đã vượt ngân sách</strong> ${fmt(-remain)} đ (đã chi ${fmt(spent)} / ${fmt(budget.amount)})`;
    }
  },

  async saveTx() {
    const t = this.state.editingTx;
    t.type = $('#txForm').dataset.type;
    t.amount = readAmount($('#txAmount'));
    t.date = $('#txDate').value || today();
    t.note = $('#txNote').value || '';
    t.bookId = t.bookId || this.state.currentBookId;

    if (t.amount <= 0) { QLT_UI.toast('Vui lòng nhập số tiền', { type: 'error' }); return; }
    if (!t.accountId) { QLT_UI.toast('Vui lòng chọn tài khoản', { type: 'error' }); return; }
    if (t.type === 'transfer') {
      if (!t.toAccountId) { QLT_UI.toast('Vui lòng chọn tài khoản đích', { type: 'error' }); return; }
      if (t.toAccountId === t.accountId) { QLT_UI.toast('Tài khoản nguồn và đích phải khác nhau', { type: 'error' }); return; }
      t.categoryId = null;
    } else {
      if (!t.categoryId) { QLT_UI.toast('Vui lòng chọn danh mục', { type: 'error' }); return; }
      t.toAccountId = null;
    }

    // Chỉ giữ participantIds cho giao dịch CHI; chuẩn hoá: trùng đủ tất cả → null
    if (t.type !== 'expense') {
      t.participantIds = null;
    } else if (Array.isArray(t.participantIds)) {
      const book = this.state.books.find(b => b.id === t.bookId);
      const allMems = (book?.members || []).filter(m => m.name && m.name.trim()).map(m => m.id);
      if (allMems.length > 0 && allMems.every(id => t.participantIds.includes(id)) && t.participantIds.length === allMems.length) {
        t.participantIds = null;
      }
    }

    // Hoàn tác giao dịch cũ (nếu sửa)
    const oldTx = t.id ? this.state.transactions.find(x => x.id === t.id) : null;
    // Snapshot giá trị oldTx (vì sau reload object reference mất)
    const oldTxSnap = oldTx ? {
      amount: oldTx.amount,
      categoryId: oldTx.categoryId,
      date: oldTx.date,
      type: oldTx.type
    } : null;
    const isNewTx = !t.id;
    if (oldTx) {
      await this.applyBalanceDelta(oldTx, -1);
    }
    // Áp giao dịch mới
    await this.applyBalanceDelta(t, +1);

    // Location đã được pre-load + có sẵn trong editingTx.location (nếu có)
    // → chỉ cần save kèm transaction
    await window.QLT_Store.put('transactions', t);
    await this.reload();
    $('#txModal').classList.remove('open');
    this.switchTab(this.state.currentTab);

    // Learning loop: nếu trước đó voice gợi ý 1 category nhưng user
    // chọn category KHÁC → hỏi học từ khoá.
    const vc = this.state._voiceContext;
    if (vc && vc.text && t.categoryId && t.categoryId !== vc.suggestedCatId
        && (Date.now() - vc.ts) < 5 * 60 * 1000  // còn fresh (5 phút)
        && t.type === vc.type) {
      this.state._voiceContext = null;
      this._maybeLearnKeyword(vc.text, t.categoryId);
    }

    // Smart insights real-time (chỉ cho tx mới hoặc sửa số tiền/category lớn)
    setTimeout(() => this._showRealtimeInsight(t, oldTxSnap, isNewTx), 350);

    haptic('success');
    this.autoSync();
  },

  // ============ Smart insights real-time ============
  // Phân tích giao dịch vừa lưu (sau reload) và trả về danh sách insight tiềm năng
  // tx     : tx đã lưu (giá trị mới)
  // oldSnap: snapshot giá trị tx CŨ (nếu sửa) — null nếu là tx mới
  // isNew  : true nếu là tx mới hoàn toàn
  _realtimeInsight(tx, oldSnap, isNew) {
    const insights = [];
    if (!tx || tx.type === 'transfer') return insights;

    const now = new Date();
    const ym = (tx.date || today()).slice(0, 7);
    const todayStr = tx.date || today();
    const txs = this.state.transactions || [];

    // ===== INCOME — chỉ celebrate nếu lớn =====
    if (tx.type === 'income') {
      if (isNew && tx.amount >= 1000000) {
        insights.push({
          emoji: '🎉',
          text: `Vừa nhận <strong>${fmt(tx.amount)} đ</strong> — đã cập nhật vào số dư`,
          variant: 'good',
          priority: 50
        });
      }
      return insights;
    }

    // ===== EXPENSE =====
    const cat = this.state.categories.find(c => c.id === tx.categoryId);
    const catName = cat ? this.escapeHtml(cat.name) : '?';

    // 1) Vượt ngưỡng ngân sách (50% / 80% / 100%)
    const budget = (this.state.budgets || []).find(b => b.categoryId === tx.categoryId && (b.amount || 0) > 0);
    if (budget) {
      const spentNow = txs.filter(t => t.type === 'expense' && t.date.startsWith(ym) && t.categoryId === tx.categoryId)
        .reduce((s, t) => s + t.amount, 0);
      // spentBefore = trừ tx mới + cộng oldSnap (nếu sửa và cùng category/tháng)
      let spentBefore = spentNow - tx.amount;
      if (oldSnap && oldSnap.type === 'expense'
          && oldSnap.categoryId === tx.categoryId
          && oldSnap.date && oldSnap.date.startsWith(ym)) {
        spentBefore += oldSnap.amount;
      }
      const oldPct = spentBefore / budget.amount;
      const newPct = spentNow / budget.amount;
      const left = Math.max(0, budget.amount - spentNow);

      if (newPct >= 1 && oldPct < 1) {
        insights.push({
          emoji: '🚨',
          text: `Vượt 100% ngân sách <strong>${catName}</strong>! Đã chi <strong>${fmt(spentNow)} đ</strong> / ${fmt(budget.amount)} đ`,
          variant: 'alert',
          priority: 100
        });
      } else if (newPct >= 0.8 && oldPct < 0.8) {
        insights.push({
          emoji: '⚠️',
          text: `Đã chạm <strong>80%</strong> ngân sách <strong>${catName}</strong> — còn ${fmt(left)} đ`,
          variant: 'warn',
          priority: 90
        });
      } else if (newPct >= 0.5 && oldPct < 0.5) {
        insights.push({
          emoji: '📊',
          text: `Đã đi qua nửa ngân sách <strong>${catName}</strong> (${Math.round(newPct * 100)}%)`,
          priority: 60
        });
      }
    }

    // 2) Khoản này lớn bất thường so với trung bình category 90 ngày
    //    Ngưỡng giảm: 50k (thay 100k) + history 3 (thay 5) + 2× (thay 2.5×)
    if (cat && tx.amount >= 50000) {
      const since = new Date(now); since.setDate(since.getDate() - 90);
      const sinceStr = since.toISOString().slice(0, 10);
      const past = txs.filter(t => t.type === 'expense'
          && t.categoryId === tx.categoryId
          && t.date >= sinceStr
          && t.id !== tx.id);
      if (past.length >= 3) {
        const avg = past.reduce((s, t) => s + t.amount, 0) / past.length;
        if (avg >= 10000 && tx.amount >= avg * 2) {
          const ratio = (tx.amount / avg).toFixed(1);
          insights.push({
            emoji: '💸',
            text: `Khoản <strong>${fmt(tx.amount)} đ</strong> này gấp <strong>${ratio}×</strong> trung bình ${catName} (${fmt(Math.round(avg))} đ)`,
            variant: 'warn',
            priority: 70
          });
        }
      }
    }

    // 3) Tổng chi hôm nay vượt trung bình ngày — ngưỡng giảm: 100k (thay 200k) + 1.5× (thay 2×)
    const todayTotal = txs.filter(t => t.type === 'expense' && t.date === todayStr)
      .reduce((s, t) => s + t.amount, 0);
    if (todayTotal >= 100000) {
      const days30 = new Date(now); days30.setDate(days30.getDate() - 30);
      const days30Str = days30.toISOString().slice(0, 10);
      const past30 = txs.filter(t => t.type === 'expense' && t.date >= days30Str && t.date < todayStr);
      if (past30.length >= 3) {
        const distinctDays = new Set(past30.map(t => t.date));
        const avgDaily = past30.reduce((s, t) => s + t.amount, 0) / Math.max(1, distinctDays.size);
        if (avgDaily >= 30000 && todayTotal >= avgDaily * 1.5) {
          const ratio = (todayTotal / avgDaily).toFixed(1);
          insights.push({
            emoji: '🔥',
            text: `Hôm nay đã chi <strong>${fmt(todayTotal)} đ</strong> — gấp ${ratio}× trung bình ngày (${fmt(Math.round(avgDaily))} đ)`,
            variant: 'warn',
            priority: 75
          });
        }
      }
    }

    // 4) Cùng category xuất hiện ≥3 lần trong 7 ngày (giảm từ 5)
    if (cat) {
      const week = new Date(now); week.setDate(week.getDate() - 6);
      const weekStr = week.toISOString().slice(0, 10);
      const sameCatWeek = txs.filter(t => t.type === 'expense'
          && t.categoryId === tx.categoryId
          && t.date >= weekStr).length;
      if (sameCatWeek >= 3) {
        insights.push({
          emoji: '🔁',
          text: `Đã <strong>${sameCatWeek} lần</strong> chi cho ${catName} trong 7 ngày qua`,
          priority: 50
        });
      }
    }

    // 5) Fallback: so với TB category — fire khi nothing else triggered (lower priority)
    //    Đảm bảo user thấy gì đó có ý nghĩa sau mỗi giao dịch
    if (cat && insights.length === 0) {
      const past = txs.filter(t => t.type === 'expense'
          && t.categoryId === tx.categoryId
          && t.id !== tx.id);
      if (past.length >= 3) {
        const avg = past.reduce((s, t) => s + t.amount, 0) / past.length;
        if (avg >= 10000) {
          if (tx.amount >= avg * 1.3) {
            insights.push({
              emoji: '📈',
              text: `Khoản này (${fmt(tx.amount)} đ) cao hơn trung bình ${catName} (${fmt(Math.round(avg))} đ)`,
              priority: 25
            });
          } else if (tx.amount <= avg * 0.7 && tx.amount > 0) {
            insights.push({
              emoji: '👍',
              text: `Tiết kiệm! Khoản này (${fmt(tx.amount)} đ) thấp hơn trung bình ${catName} (${fmt(Math.round(avg))} đ)`,
              variant: 'good',
              priority: 20
            });
          }
        }
      }
    }

    return insights;
  },

  _showRealtimeInsight(tx, oldSnap, isNew) {
    // User có thể tắt trong Cài đặt
    if (localStorage.getItem('qlt_smart_insights') === 'off') return;
    const insights = this._realtimeInsight(tx, oldSnap, isNew);
    if (!insights.length) return;
    insights.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    const top = insights[0];
    QLT_UI.insight(top.text, {
      emoji: top.emoji,
      variant: top.variant,
      duration: 5500
    });
  },

  // Học từ khoá từ câu nói: trích từ "đặc trưng" (key term không phải số/đơn vị/connector)
  // và đề xuất user thêm vào category.keywords
  async _maybeLearnKeyword(spokenText, categoryId) {
    const cat = this.state.categories.find(c => c.id === categoryId);
    if (!cat) return;
    // Trích key terms: bỏ số, đơn vị, từ stop phổ biến
    const norm = normalizeVi(spokenText);
    const STOP = new Set(['het','la','o','khoang','tam','khoang chung','di','cho','va','voi','cua','nay','hom nay','minh','toi','tien','luc','sau','ngay','thang','rồi','thi','roi']);
    const UNITS = /^(k|nghin|ngan|tr|trieu|ty|dong|d|vnd)$/;
    const tokens = norm.split(/[\s,.\-]+/)
      .filter(t => t && !UNITS.test(t) && !/^\d/.test(t) && t.length >= 3 && !STOP.has(t));
    // Chọn cụm 2-3 từ liên tiếp KHÔNG có trong tên category + chưa có trong keywords
    const catNorm = normalizeVi(cat.name);
    const exNorm = new Set((cat.keywords || []).map(k => normalizeVi(k)));
    if (tokens.length === 0) return;
    // Ưu tiên cụm 2 từ liên tiếp (vd "trà sữa", "đi cà phê") rồi đến đơn từ
    let candidate = null;
    for (let i = 0; i < tokens.length - 1; i++) {
      const c2 = tokens[i] + ' ' + tokens[i + 1];
      if (!catNorm.includes(c2) && !exNorm.has(c2) && c2.length <= 24) { candidate = c2; break; }
    }
    if (!candidate) {
      for (const t of tokens) {
        if (!catNorm.includes(t) && !exNorm.has(t) && t.length <= 16) { candidate = t; break; }
      }
    }
    if (!candidate) return;

    const ok = await QLT_UI.confirm(
      `Lưu "${candidate}" làm từ khoá voice cho danh mục "${cat.name}"?\n\nLần sau nói câu chứa "${candidate}" → tự chọn danh mục này.`,
      { title: '🎙️ Học từ khoá', okLabel: 'Lưu', cancelLabel: 'Bỏ qua' }
    );
    if (!ok) return;
    cat.keywords = Array.isArray(cat.keywords) ? cat.keywords.slice() : [];
    cat.keywords.push(candidate);
    await window.QLT_Store.put('categories', cat);
    await this.reload();
    QLT_UI.toast(`✓ Đã thêm "${candidate}" vào ${cat.name}`, { type: 'success' });
    this.autoSync();
  },

  // delta=+1: cộng giao dịch vào số dư; delta=-1: hoàn tác
  // Đọc TƯƠI từ DB để tránh state cũ — chống mất cập nhật khi cache RAM bị stale
  // (vd: sau sync pull, hoặc 2 ví cùng id trong transfer-to-self).
  async applyBalanceDelta(t, delta) {
    const updates = [];
    if (t.type === 'transfer') {
      if (t.accountId)   updates.push({ id: t.accountId,   change: -t.amount * delta });
      if (t.toAccountId) updates.push({ id: t.toAccountId, change: +t.amount * delta });
    } else if (t.accountId) {
      const sign = (t.type === 'income' ? +1 : -1);
      updates.push({ id: t.accountId, change: sign * t.amount * delta });
    }

    // Gộp updates cùng id (vd: transfer ví → chính nó → net = 0, không ghi đè vô nghĩa)
    const merged = {};
    for (const u of updates) merged[u.id] = (merged[u.id] || 0) + u.change;

    for (const id of Object.keys(merged)) {
      const change = merged[id];
      if (!change) continue;
      const fresh = await window.QLT_Store.get('accounts', id);
      if (!fresh) {
        console.warn('[QLT] applyBalanceDelta: không tìm thấy ví', id, 'tx=', t);
        continue;
      }
      fresh.balance = (Number(fresh.balance) || 0) + change;
      await window.QLT_Store.put('accounts', fresh);
      // Đồng bộ state cache để UI hiện ngay đúng giá trị (không cần đợi reload)
      const cached = this.state.accounts.find(a => a.id === id);
      if (cached) cached.balance = fresh.balance;
    }
  },

  async deleteTx() {
    const t = this.state.editingTx;
    if (!t.id) return;
    if (!await QLT_UI.confirm('Xoá giao dịch này?', { okLabel: 'Xoá', danger: true })) return;

    // Snapshot full tx để có thể restore
    const snapshot = JSON.parse(JSON.stringify(t));
    await this.applyBalanceDelta(t, -1);
    await window.QLT_Store.del('transactions', t.id);
    await this.reload();
    $('#txModal').classList.remove('open');
    this.switchTab(this.state.currentTab);

    // Show undo toast 5s
    this.showUndoToast('🗑️ Đã xoá giao dịch', async () => {
      // Restore: put lại tx + apply delta +1
      await this.applyBalanceDelta(snapshot, +1);
      await window.QLT_Store.put('transactions', snapshot);
      await this.reload();
      this.switchTab(this.state.currentTab);
      QLT_UI.toast('Đã khôi phục giao dịch', { type: 'success' });
      this.autoSync();
    });

    this.autoSync();
  },

  // Trả về mảng ảnh minh chứng từ tx (xử lý cả schema cũ tx.photo lẫn mới tx.photos)
  getTxPhotos(t) {
    if (!t) return [];
    if (Array.isArray(t.photos)) return t.photos.filter(Boolean);
    if (t.photo) return [t.photo];
    return [];
  },

  // Phân tích câu nói tiếng Việt → {type, amount, accountId, toAccountId, categoryId, note}
  // ============ SMART CATEGORY SUGGESTIONS (cho voice không match) ============
  // Trả về top 5 danh mục có khả năng cao nhất dựa trên context: giờ, ví, lịch sử
  _suggestCategories(type, accountId) {
    const cands = this.state.categories.filter(c => c.type === type && !this._catHasChildren(c.id));
    if (!cands.length) return [];
    const txs = (this.state.transactions || []).filter(t => t.type === type);
    const now = new Date();
    const hour = now.getHours();
    const days7 = new Date(now); days7.setDate(days7.getDate() - 7);
    const days90 = new Date(now); days90.setDate(days90.getDate() - 90);

    const scores = {};
    const reasons = {};
    for (const c of cands) { scores[c.id] = 0; reasons[c.id] = []; }

    // 1) Giờ trong ngày — match tên danh mục
    const timeKeywords = [];
    if (hour >= 5 && hour < 10) timeKeywords.push('sang', 'sáng', 'cafe', 'ca phe', 'cà phê');
    else if (hour >= 10 && hour < 14) timeKeywords.push('trua', 'trưa');
    else if (hour >= 17 && hour < 22) timeKeywords.push('toi', 'tối');
    else if (hour >= 14 && hour < 17) timeKeywords.push('xe', 'xế', 'cafe', 'ca phe');
    for (const c of cands) {
      const cn = normalizeVi(c.name);
      for (const kw of timeKeywords) {
        if (cn.includes(normalizeVi(kw))) {
          scores[c.id] += 50;
          reasons[c.id].push('giờ này');
          break;
        }
      }
    }

    // 2) Tương quan với ví — top categories từng dùng với ví này
    if (accountId) {
      const walletTxs = txs.filter(t => t.accountId === accountId && t.date >= days90.toISOString().slice(0, 10));
      const walletCount = {};
      for (const t of walletTxs) {
        if (t.categoryId) walletCount[t.categoryId] = (walletCount[t.categoryId] || 0) + 1;
      }
      const top = Object.entries(walletCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
      for (const [cid, cnt] of top) {
        if (scores[cid] !== undefined && cnt >= 2) {
          scores[cid] += 30;
          reasons[cid].push('hay với ví này');
        }
      }
    }

    // 3) Gần đây (7 ngày)
    const recentCount = {};
    for (const t of txs) {
      if (t.date >= days7.toISOString().slice(0, 10) && t.categoryId) {
        recentCount[t.categoryId] = (recentCount[t.categoryId] || 0) + 1;
      }
    }
    const topRecent = Object.entries(recentCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [cid, cnt] of topRecent) {
      if (scores[cid] !== undefined && cnt >= 1) {
        scores[cid] += 20;
        reasons[cid].push('gần đây');
      }
    }

    // 4) All-time frequency
    const allCount = {};
    for (const t of txs) {
      if (t.categoryId) allCount[t.categoryId] = (allCount[t.categoryId] || 0) + 1;
    }
    const topAll = Object.entries(allCount).sort((a, b) => b[1] - a[1]).slice(0, 3);
    for (const [cid, cnt] of topAll) {
      if (scores[cid] !== undefined && cnt >= 3) {
        scores[cid] += 10;
        reasons[cid].push('phổ biến');
      }
    }

    // Sort + pick top 5
    let sorted = cands.map(c => ({
      cat: c,
      score: scores[c.id] || 0,
      reason: reasons[c.id][0] || ''
    })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);

    // Fallback: nếu chưa có gì → top 3 all-time hoặc 3 cands đầu
    if (!sorted.length) {
      const fb = topAll.slice(0, 3).map(([cid]) => cands.find(c => c.id === cid)).filter(Boolean);
      const list = fb.length ? fb : cands.slice(0, 3);
      sorted = list.map(c => ({ cat: c, score: 1, reason: 'có sẵn' }));
    }
    return sorted;
  },

  _catHasChildren(catId) {
    return this.state.categories.some(c => c.parentId === catId);
  },

  // Render banner gợi ý sau voice không match. autoSaveAfter=true → user tap chip xong tự lưu
  _renderCatSuggestions(parsed, autoSaveAfter) {
    const wrap = $('#txCatSuggest');
    if (!wrap) return;
    const type = parsed.type || $('#txForm').dataset.type;
    if (type === 'transfer') { wrap.style.display = 'none'; return; }

    const accountId = this.state.editingTx?.accountId;
    const suggestions = this._suggestCategories(type, accountId);

    // Note đã smart-trim — ngắn (2-30 ký tự) thì cho phép tạo mới
    const noteText = ($('#txNote')?.value || this.state.editingTx?.note || '').trim();
    const cleanedNote = noteText.length >= 2 && noteText.length <= 30 ? noteText : null;

    if (!suggestions.length && !cleanedNote) {
      wrap.style.display = 'none';
      return;
    }

    let html = '<div class="tx-cat-suggest-head">💡 <strong>Không match được danh mục</strong> — tap để chọn nhanh:</div>';
    html += '<div class="tx-cat-suggest-row">';
    for (const s of suggestions) {
      const c = s.cat;
      const emoji = (c.icon || '').startsWith('emoji:') ? c.icon.slice(6) : '📁';
      html += `<span class="tx-cat-suggest-chip" data-pick-cat="${c.id}">
        <span class="tx-cat-suggest-chip-emoji">${emoji}</span>
        ${this.escapeHtml(c.name)}
        ${s.reason ? `<span class="tx-cat-suggest-chip-reason">· ${s.reason}</span>` : ''}
      </span>`;
    }
    if (cleanedNote) {
      html += `<span class="tx-cat-suggest-chip create" data-create-cat="${this.escapeHtml(cleanedNote)}">
        ➕ Tạo "${this.escapeHtml(cleanedNote)}"
      </span>`;
    }
    html += '</div>';

    wrap.innerHTML = html;
    wrap.style.display = 'block';

    wrap.querySelectorAll('[data-pick-cat]').forEach(el => {
      el.onclick = () => this._pickSuggestedCategory(el.dataset.pickCat, autoSaveAfter);
    });
    wrap.querySelectorAll('[data-create-cat]').forEach(el => {
      el.onclick = () => this._createCategoryFromNote(el.dataset.createCat, type, autoSaveAfter);
    });
  },

  _pickSuggestedCategory(catId, autoSave) {
    if (!this.state.editingTx) return;
    this.state.editingTx.categoryId = catId;
    delete this.state.editingTx._activeParent;
    // Re-render picker mới để cập nhật highlight
    const type = this.state.editingTx.type || 'expense';
    this.renderTxCategoryPicker(type);
    const wrap = $('#txCatSuggest');
    if (wrap) wrap.style.display = 'none';
    const status = $('#txOcrStatus');
    if (status) { status.style.display = 'none'; status.style.color = ''; }
    if (autoSave) setTimeout(() => this.saveTx(), 250);
  },

  // Detect category từ note typing (debounced) — auto-pick + show banner
  _detectCatFromNote(noteText) {
    const tx = this.state.editingTx;
    if (!tx) return;
    const text = (noteText || '').trim();
    // Reset state nếu note bị xoá hết
    if (text.length < 2) {
      const wrap = $('#txCatDetected');
      if (wrap && this.state._catDetectFromNote) {
        wrap.style.display = 'none';
        // Nếu cat đang chọn là do auto-detect từ note → bỏ
        if (tx.categoryId && tx._catFromAutoDetect) {
          tx.categoryId = null;
          delete tx._catFromAutoDetect;
          this.renderTxCategoryPicker(tx.type || 'expense');
        }
      }
      this.state._catDetectFromNote = false;
      return;
    }

    const type = tx.type || $('#txForm').dataset.type || 'expense';
    if (type === 'transfer') return;

    // Nếu user đã chọn cat thủ công (không phải auto-detect) → KHÔNG override
    if (tx.categoryId && !tx._catFromAutoDetect) return;

    const cands = this.state.categories.filter(c => c.type === type && !c.archived);
    const M = window.QLT_CategoryMatcher;
    if (!M) return;

    const now = new Date();
    const recentCatIds = (this.state.transactions || [])
      .filter(t => t.type === type && t.categoryId).slice(-15).map(t => t.categoryId);
    const amount = parseVoiceAmount(text) || (tx.amount || 0);
    const r = M.match(text, cands, { type, amount, hourOfDay: now.getHours(), recentCatIds });

    const wrap = $('#txCatDetected');
    if (r.confidence >= M.THRESHOLD.SUGGEST) {
      // Auto-pick + show banner
      tx.categoryId = r.categoryId;
      tx._catFromAutoDetect = true;
      delete tx._activeParent;
      this.renderTxCategoryPicker(type);
      this._showCatDetectedBanner(r.categoryId, r.confidence, text, type);
      this.state._catDetectFromNote = true;
    } else if (this.state._catDetectFromNote) {
      // Trước đó có detect, giờ note đổi không match nữa → ẩn banner + clear cat auto
      if (wrap) wrap.style.display = 'none';
      if (tx._catFromAutoDetect) {
        tx.categoryId = null;
        delete tx._catFromAutoDetect;
        this.renderTxCategoryPicker(type);
      }
      this.state._catDetectFromNote = false;
    }
  },

  // ============================================================
  // BANNER NHẬN DIỆN DANH MỤC — feedback loop cho voice/note
  // ============================================================
  _showCatDetectedBanner(catId, confidence, originalText, type) {
    const wrap = $('#txCatDetected');
    if (!wrap) return;
    const cat = this.state.categories.find(c => c.id === catId);
    if (!cat) { wrap.style.display = 'none'; return; }

    // Xác định cha của cat (nếu là sub) để hiện rõ context
    const parent = cat.parentId ? this.state.categories.find(c => c.id === cat.parentId) : null;
    const fullName = parent ? `${parent.name} › ${cat.name}` : cat.name;

    const isAuto = confidence >= 0.85;
    const cls = isAuto ? 'auto' : 'suggest';
    const headIcon = isAuto ? '⚡' : '💡';
    const headText = isAuto ? 'ĐÃ NHẬN DIỆN' : 'GỢI Ý DANH MỤC';
    const confLabel = `${Math.round(confidence * 100)}%`;

    wrap.className = 'tx-cat-detected ' + cls;
    wrap.innerHTML = `
      <div class="tx-cat-detected-head">${headIcon} ${headText}</div>
      <div class="tx-cat-detected-cat">
        <span class="tx-cat-detected-icon" style="color:${cat.color || ''}">${svgIcon(cat.icon)}</span>
        <span class="tx-cat-detected-name">${this.escapeHtml(fullName)}</span>
        <span class="tx-cat-detected-conf">${confLabel}</span>
      </div>
      <div class="tx-cat-detected-actions">
        <button type="button" class="tx-cat-detected-btn yes" data-act="yes">✅ Đúng</button>
        <button type="button" class="tx-cat-detected-btn no" data-act="no">✏️ Sửa</button>
      </div>
    `;
    wrap.style.display = 'block';

    // Lưu context để nếu user bấm "Sửa" + chọn cat khác, mình biết câu gốc nào để học
    this.state._catDetectContext = {
      originalText: originalText || '',
      autoDetectedCatId: catId,
      type
    };

    wrap.querySelector('[data-act="yes"]').onclick = () => {
      wrap.style.display = 'none';
      // Giữ context để post-save vẫn có thể learn (nếu cần)
    };
    wrap.querySelector('[data-act="no"]').onclick = () => {
      // User reject → clear cat + scroll picker
      this.state.editingTx.categoryId = null;
      delete this.state.editingTx._activeParent;
      this.renderTxCategoryPicker(type);
      // Update banner thành prompt
      wrap.className = 'tx-cat-detected suggest';
      wrap.innerHTML = `
        <div class="tx-cat-detected-head">✏️ CHỌN DANH MỤC ĐÚNG</div>
        <div style="font-size:12px;color:var(--text2);line-height:1.5">
          Chọn nhóm/danh mục đúng bên dưới — app sẽ <strong>học keyword mới</strong> từ câu của bạn để lần sau bắt chuẩn hơn.
        </div>
      `;
      // Đánh dấu context = đang chờ user pick để học
      this.state._catDetectContext.rejectedAt = Date.now();
      // Scroll picker vào view
      setTimeout(() => {
        const sec = $('#txCategorySection');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    };
  },

  // Gọi khi user pick cat thủ công trong picker (sau khi rejected detection)
  _maybeOfferKeywordLearning(newCatId) {
    const ctx = this.state._catDetectContext;
    if (!ctx || !ctx.rejectedAt) return; // Chỉ trigger khi user đã bấm "Sửa"
    if (newCatId === ctx.autoDetectedCatId) return; // Cùng cat → không học
    if (!ctx.originalText || ctx.originalText.length < 3) return;

    const cat = this.state.categories.find(c => c.id === newCatId);
    if (!cat) return;

    // Trích keyword candidate (đã được score + filter date/generic)
    const candidates = this._extractKeywordCandidates(ctx.originalText, cat);
    // Lọc bỏ "đã có" (chỉ hiện những cái mới — vì user đã có rồi không cần dạy lại)
    const newCandidates = candidates.filter(c => !c.alreadyHas);

    const wrap = $('#txCatDetected');
    if (!wrap) return;

    if (!newCandidates.length) {
      // Không có ứng viên mới → cat đã có đủ keyword phổ thông
      wrap.style.display = 'none';
      delete this.state._catDetectContext;
      return;
    }

    const parent = cat.parentId ? this.state.categories.find(c => c.id === cat.parentId) : null;
    const fullName = parent ? `${parent.name} › ${cat.name}` : cat.name;
    const catIconHtml = `<span style="color:${cat.color || ''};display:inline-flex;vertical-align:middle">${svgIcon(cat.icon)}</span>`;

    wrap.className = 'kw-learn-prompt';
    let html = `
      <div class="kw-learn-head">🧠 DẠY APP NHỚ CHO LẦN SAU</div>
      <div class="kw-learn-target">
        ${catIconHtml}
        <span>Bạn vừa chọn: <strong>${this.escapeHtml(fullName)}</strong></span>
      </div>
      <div class="kw-learn-instruct">
        Chọn từ <strong>ĐẶC BIỆT</strong> trong câu "<em>${this.escapeHtml(ctx.originalText)}</em>" — lần sau gặp từ này, app tự chọn cat trên:
      </div>
      <div class="kw-learn-row">
    `;
    for (const c of newCandidates) {
      const tip = c.type === 'bigram' ? '✨' : '';
      html += `<span class="kw-learn-chip" data-kw="${this.escapeHtml(c.phrase)}">${tip ? tip + ' ' : ''}${this.escapeHtml(c.phrase)}</span>`;
    }
    html += `
      </div>
      <div id="kwLearnPreview" class="kw-learn-preview">
        <span class="placeholder">↑ Tap từ phía trên để xem app sẽ học gì</span>
      </div>
      <div class="kw-learn-actions">
        <button type="button" class="kw-learn-btn save" data-act="save">💾 Lưu</button>
        <button type="button" class="kw-learn-btn skip" data-act="skip">Bỏ qua</button>
      </div>
      <div style="font-size:11px;color:#1e3a8a;margin-top:8px;text-align:center">
        💡 Muốn thêm/xoá từ khác?
        <a href="#" class="kw-learn-edit-link" style="color:#2563eb;font-weight:600;text-decoration:underline">Mở "Từ khoá voice" của ${this.escapeHtml(cat.name)} →</a>
      </div>
    `;
    wrap.innerHTML = html;
    wrap.style.display = 'block';

    const selected = new Set();
    const saveBtn = wrap.querySelector('[data-act="save"]');
    const previewEl = wrap.querySelector('#kwLearnPreview');

    const updateUI = () => {
      saveBtn.textContent = selected.size ? `💾 Lưu ${selected.size} từ` : '💾 Lưu';
      saveBtn.disabled = selected.size === 0;
      saveBtn.style.opacity = selected.size === 0 ? '0.5' : '1';
      // Live preview
      if (selected.size === 0) {
        previewEl.innerHTML = '<span class="placeholder">↑ Tap từ phía trên để xem app sẽ học gì</span>';
      } else {
        const list = [...selected].map(s => `<strong>"${this.escapeHtml(s)}"</strong>`).join(' hoặc ');
        previewEl.innerHTML = `⚡ Lần sau gõ ${list} → tự chọn ${catIconHtml} <strong>${this.escapeHtml(cat.name)}</strong>`;
      }
    };
    updateUI();

    wrap.querySelectorAll('.kw-learn-chip').forEach(chip => {
      chip.onclick = () => {
        const kw = chip.dataset.kw;
        if (selected.has(kw)) { selected.delete(kw); chip.classList.remove('selected'); }
        else { selected.add(kw); chip.classList.add('selected'); }
        updateUI();
      };
    });

    saveBtn.onclick = async () => {
      if (selected.size === 0) return;
      cat.keywords = Array.isArray(cat.keywords) ? cat.keywords : [];
      let added = 0;
      for (const kw of selected) {
        const existing = cat.keywords.some(k => normalizeVi(k) === normalizeVi(kw));
        if (!existing) { cat.keywords.push(kw); added++; }
      }
      if (added > 0) {
        await window.QLT_Store.put('categories', cat);
        await this.reload();
        QLT_UI.toast(`✨ Đã dạy ${added} từ cho "${cat.name}" — sửa lại trong Danh mục → tap cat`, { type: 'success', duration: 4000 });
        this.autoSync();
      }
      wrap.style.display = 'none';
      delete this.state._catDetectContext;
    };
    wrap.querySelector('[data-act="skip"]').onclick = () => {
      wrap.style.display = 'none';
      delete this.state._catDetectContext;
    };
    // Link "Mở từ khoá voice của <cat>"
    const editLink = wrap.querySelector('.kw-learn-edit-link');
    if (editLink) {
      editLink.onclick = (e) => {
        e.preventDefault();
        wrap.style.display = 'none';
        delete this.state._catDetectContext;
        // Mở cat modal cho cat user vừa chọn
        this.openCatModal(cat.id);
        // Scroll đến section Từ khoá sau khi modal load
        setTimeout(() => {
          const kwLabel = $('#catKeywordsWrap');
          if (kwLabel) kwLabel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 250);
      };
    }
  },

  // Trích keyword candidate từ text — lọc thông minh + xếp hạng theo mức "đặc biệt"
  // Trả về: [{ phrase, score, alreadyHas }]
  _extractKeywordCandidates(text, cat) {
    if (!text) return [];
    // Stop words: từ chung chung, KHÔNG nên dạy cho cat
    const stopWords = new Set([
      // Preposition / liên từ
      'cho', 'cua', 'la', 'va', 'voi', 'tu', 've', 'den', 'sang', 'qua', 'toi',
      'bang', 'tai', 'do', 'thi', 'ma', 'cung', 'nhe', 'ah', 'oi', 'a', 'o',
      // Verb chung (đóng/trả/mua/chi/...)
      'het', 'ton', 'mat', 'mua', 'chi', 'thu', 'tra', 'dong', 'gop', 'di', 'lam',
      'nhan', 'cho', 'gui', 'lay', 'ban', 'ngoai', 'trong', 'ngay',
      // Trigger word voice
      'luu', 'luru', 'save', 'xong', 'done',
      // Số đếm tiếng Việt
      'mot', 'hai', 'ba', 'bon', 'nam', 'sau', 'bay', 'tam', 'chin', 'muoi',
      'tram', 'nghin', 'trieu', 'ty',
      // Pronoun
      'toi', 'minh', 'em', 'anh', 'chi', 'co', 'chu', 'bac', 'ong', 'ba', 'me', 'cha', 'bo',
      // Misc
      'cai', 'the', 'da', 'vua', 'thoi'
    ]);
    // Date/time words - không bao giờ dạy
    const dateWords = new Set([
      'hom', 'nay', 'mai', 'qua', 'tuan', 'thang', 'nam', 'ngay',
      'sang nay', 'trua nay', 'toi nay', 'chieu nay', 'dem nay',
      'hom nay', 'hom qua', 'hom kia', 'tuan nay', 'tuan truoc', 'thang nay',
      'thang truoc', 'thang sau', 'nam nay', 'nam ngoai',
      'januari', 'februari', 'march', 'april', 'may', 'june', 'july', 'august',
      'thu hai', 'thu ba', 'thu tu', 'thu nam', 'thu sau', 'thu bay', 'chu nhat'
    ]);
    const isDate = (s) => {
      const n = normalizeVi(s);
      if (dateWords.has(n)) return true;
      // "tháng 5", "ngày 12", "thứ 5"
      if (/^(thang|ngay|thu|tuan)\s+\d+$/i.test(n)) return true;
      // Số đơn lẻ
      if (/^\d+$/.test(n)) return true;
      return false;
    };

    const amountRe = /\b\d[\d.,]*\s*(k|nghin|nghìn|ngan|ngàn|tr|trieu|triệu|ty|tỷ|đồng|dong|đ)?\b/gi;
    let cleaned = text.replace(amountRe, ' ');
    // Bỏ tên ví
    for (const a of (this.state.accounts || [])) {
      if (a.name) {
        const re = new RegExp('\\b' + a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
        cleaned = cleaned.replace(re, ' ');
      }
    }
    // Bỏ "thẻ X" tag
    cleaned = cleaned.replace(/\b(thẻ|the)\s+\S+(\s+\S+)?/gi, ' ');
    cleaned = cleaned.replace(/\b(luu|luru|save|xong|done)\s*[!.?]*\s*$/i, ' ');

    // Tokenize giữ dấu để hiển thị đẹp
    const cleanedRaw = cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    const rawWords = cleanedRaw.split(/\s+/).filter(w => w.length >= 2);

    // Keywords đã có sẵn của cat — để mark "đã có"
    const catKeywords = new Set();
    if (cat.slug && window.QLT_CategoriesDefault) {
      const def = window.QLT_CategoriesDefault.ALL.find(c => c.slug === cat.slug);
      if (def && def.keywords) {
        for (const kw of [...(def.keywords.brand || []), ...(def.keywords.strong || []), ...(def.keywords.weak || [])]) {
          catKeywords.add(normalizeVi(kw));
        }
      }
    }
    if (Array.isArray(cat.keywords)) {
      for (const kw of cat.keywords) catKeywords.add(normalizeVi(kw));
    }
    const catWords = new Set(normalizeVi(cat.name).split(/[\s/]+/).filter(w => w));

    // Score 1 phrase
    const scorePhrase = (rawPhrase, normPhrase) => {
      let score = 0;
      // Đã có trong keyword cat → mark
      const alreadyHas = catKeywords.has(normPhrase);
      if (alreadyHas) return { score: -100, alreadyHas: true };
      // Stop word / date → loại
      if (stopWords.has(normPhrase) || isDate(rawPhrase)) return { score: -100, alreadyHas: false };
      // Trùng tên cat → loại
      if (catWords.has(normPhrase)) return { score: -100, alreadyHas: false };
      // Có chữ cái đầu HOA trong câu gốc → proper noun (brand/tên)
      if (/^[A-ZĐÁÀẢÃẠÂẦẤẨẪẬĂẰẮẲẴẶÉÈẺẼẸÊỀẾỂỄỆÍÌỈĨỊÓÒỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÚÙỦŨỤƯỪỨỬỮỰÝỲỶỸỴ]/.test(rawPhrase)) score += 5;
      // Cụm 2 từ → ưu tiên hơn unigram
      if (/\s/.test(rawPhrase)) score += 2;
      // Dài hơn → đặc biệt hơn
      score += Math.min(3, normPhrase.length / 4);
      // Nếu có chữ số (vd "3ce") → thường là brand
      if (/\d/.test(rawPhrase)) score += 2;
      return { score, alreadyHas: false };
    };

    const seen = new Set();
    const out = [];

    // Bigram (cụm 2 từ)
    for (let i = 0; i < rawWords.length - 1; i++) {
      const w1 = rawWords[i], w2 = rawWords[i + 1];
      const phrase = w1 + ' ' + w2;
      const norm = normalizeVi(phrase);
      if (norm.length < 5 || seen.has(norm)) continue;
      // Bigram chứa stop word hoặc 1 trong 2 từ là date → skip
      const w1n = normalizeVi(w1), w2n = normalizeVi(w2);
      if (stopWords.has(w1n) || stopWords.has(w2n) || isDate(w1) || isDate(w2)) continue;
      const { score, alreadyHas } = scorePhrase(phrase, norm);
      if (score > -100) {
        seen.add(norm);
        out.push({ phrase, score, alreadyHas, type: 'bigram' });
      }
    }

    // Unigram
    for (const w of rawWords) {
      const nw = normalizeVi(w);
      if (seen.has(nw)) continue;
      // Skip nếu nằm trong bigram đã thêm
      const inBigram = out.some(o => normalizeVi(o.phrase).split(' ').includes(nw));
      if (inBigram) continue;
      const { score, alreadyHas } = scorePhrase(w, nw);
      if (score > -100) {
        seen.add(nw);
        out.push({ phrase: w, score, alreadyHas, type: 'unigram' });
      }
    }

    // Sort: score cao trước, top 5
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, 5);
  },

  async _createCategoryFromNote(noteName, type, autoSave) {
    if (!this.state.editingTx) return;
    // Tránh tạo trùng: nếu đã có category cùng type + cùng tên (case-insensitive) → chọn thay vì tạo
    const existing = this.state.categories.find(c =>
      c.type === type && normalizeVi(c.name) === normalizeVi(noteName));
    if (existing) {
      this._pickSuggestedCategory(existing.id, autoSave);
      QLT_UI.toast(`Đã có danh mục "${existing.name}" — chọn cái đó`, { type: 'info', duration: 2500 });
      return;
    }
    const colors = ['#52b788', '#cc7a4f', '#f4b942', '#7b8cde', '#a04fc4', '#4f86c6', '#d97757', '#9c8c5e'];
    const newCat = {
      bookId: this.state.currentBookId,
      type,
      name: noteName,
      color: colors[Math.floor(Math.random() * colors.length)],
      icon: type === 'income' ? 'emoji:💰' : 'emoji:📁',
      keywords: [],
      parentId: null,
      _createdAt: new Date().toISOString()
    };
    await window.QLT_Store.put('categories', newCat);
    await this.reload();
    this.state.editingTx.categoryId = newCat.id;
    delete this.state.editingTx._activeParent;
    this.renderTxCategoryPicker(type);
    const wrap = $('#txCatSuggest');
    if (wrap) wrap.style.display = 'none';
    QLT_UI.toast(`✨ Đã tạo danh mục "${noteName}"`, { type: 'success', duration: 2200 });
    if (autoSave) setTimeout(() => this.saveTx(), 350);
  },

  parseVoiceTransaction(text) {
    // 0) Phát hiện trigger auto-save ở cuối câu ("lưu", "save", "xong", "done")
    let workText = (text || '').trim();
    let autoSave = false;
    const saveTrigger = /[\s,.;]*(lưu|luu|save|xong|done)\s*[!.?]*\s*$/i;
    if (saveTrigger.test(workText)) {
      autoSave = true;
      workText = workText.replace(saveTrigger, '').trim();
    }

    const norm = normalizeVi(workText);

    // 1) Detect type — "chuyển" phải đi kèm directional ("từ/sang/đến/qua/tới")
    //    XUẤT HIỆN SAU "chuyển" mới là transfer. Tránh false positive với "ăn sáng".
    //    "chuyển khoản bằng X" chỉ là cách thanh toán → vẫn là expense
    let type = 'expense';
    const chuyenMatch = norm.match(/\bchuyen\b(.{0,60})/);
    const hasTransferContext = chuyenMatch && /\b(tu|sang|den|qua|toi)\b/.test(chuyenMatch[1]);
    if (hasTransferContext) {
      type = 'transfer';
    } else if (/\b(thu nhap|nhan|luong|tien luong|thuong|bonus|salary)\b/.test(norm)) {
      type = 'income';
    }

    // 2) Số tiền
    const amount = parseVoiceAmount(workText);

    // 3) Tìm các ví xuất hiện trong câu (theo thứ tự)
    const accIdxs = [];
    for (const a of this.state.accounts) {
      const an = normalizeVi(a.name);
      if (!an) continue;
      const idx = norm.indexOf(an);
      if (idx >= 0) accIdxs.push({ id: a.id, idx, name: an });
    }
    accIdxs.sort((a, b) => a.idx - b.idx);

    let accountId = null;
    let toAccountId = null;

    if (type === 'transfer') {
      // Pattern "từ X" / "sang Y" / "đến Y" / "qua Y" / "tới Y"
      const tuM = /\btu\s+([^.,;]{1,40})/.exec(norm);
      const sangM = /\b(sang|den|qua|toi)\s+([^.,;]{1,40})/.exec(norm);
      if (tuM) {
        const found = accIdxs.find(m => tuM[1].includes(m.name));
        if (found) accountId = found.id;
      }
      if (sangM) {
        const found = accIdxs.find(m => sangM[2].includes(m.name));
        if (found) toAccountId = found.id;
      }
      // Fallback: 2 ví xuất hiện theo thứ tự
      if (!accountId && accIdxs[0]) accountId = accIdxs[0].id;
      if (!toAccountId && accIdxs.length >= 2) {
        toAccountId = accIdxs.find(m => m.id !== accountId)?.id || null;
      }
    } else {
      accountId = accIdxs[0]?.id || null;
    }

    // 3.5) Tags từ câu nói: pattern "thẻ X" / "thẻ X thẻ Y"
    // Bắt cụm sau "thẻ" (1-2 từ) cho đến khi gặp "thẻ" tiếp / số tiền / hết câu
    const tags = [];
    const tagRegex = /\bthe\s+([a-z0-9 ]{2,30}?)(?=\s+the\b|\s+\d|\s*$)/g;
    let tm;
    while ((tm = tagRegex.exec(norm)) !== null) {
      const raw = tm[1].trim();
      // Cắt tối đa 2 từ
      const words = raw.split(/\s+/).slice(0, 2).join(' ');
      if (words && !tags.includes('#' + words)) tags.push('#' + words);
    }

    // 4) Danh mục — chỉ với expense/income, dùng QLT_CategoryMatcher (tier scoring + anti-keyword + abstain)
    let categoryId = null;
    let categoryConfidence = 0;
    if (type !== 'transfer') {
      const cands = this.state.categories.filter(c => c.type === type);
      const M = window.QLT_CategoryMatcher;
      if (M) {
        // Tie-breaker context: hour-of-day + recent cat ids
        const now = new Date();
        const hourOfDay = now.getHours();
        const recentCatIds = (this.state.transactions || [])
          .filter(t => t.type === type && t.categoryId)
          .slice(-15)
          .map(t => t.categoryId);
        const r = M.match(workText, cands, { type, amount, hourOfDay, recentCatIds });
        // Chỉ chọn cat khi confidence >= SUGGEST (>= 0.70)
        // Nếu confidence < 0.70 → abstain (categoryId = null), suggestion UI sẽ fire
        if (r.confidence >= M.THRESHOLD.SUGGEST) {
          categoryId = r.categoryId;
          categoryConfidence = r.confidence;
        }
      }
    }

    // 5) Smart note — cắt phần trước số tiền + bỏ từ giao dịch + bỏ tên ví
    let cleanNote = workText;
    // 5a) Lấy phần TRƯỚC số tiền
    const amountMatch = workText.match(/\b(\d[\d.,]*)\s*(k|nghin|nghìn|ngan|ngàn|tr|trieu|triệu|ty|tỷ|đồng|dong|đ)\b/i);
    if (amountMatch && amountMatch.index > 2) {
      cleanNote = workText.slice(0, amountMatch.index).trim();
    }
    // 5b) Bỏ từ giao dịch / cụm thanh toán phổ biến (giữ nội dung gốc)
    cleanNote = cleanNote
      .replace(/\b(chuyển khoản bằng|chuyen khoan bang|thanh toán bằng|thanh toan bang|trả bằng|tra bang|chi bằng|chi bang)\b.*/i, '')
      .replace(/\b(hết|het|tốn|ton|mất|mat|mua|cho|chi|thu)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .replace(/[,;.]+\s*$/, '')
      .trim();
    // 5c) Bỏ tên ví ở cuối (vd "ăn sáng MBBank" → "ăn sáng")
    for (const a of this.state.accounts) {
      if (!a.name) continue;
      const re = new RegExp('\\b' + a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
      cleanNote = cleanNote.replace(re, '').trim();
    }
    cleanNote = cleanNote.replace(/[,;.]+\s*$/, '').trim();
    // 5d) Bỏ tag pattern "thẻ X" khỏi note (đã được parse riêng)
    cleanNote = cleanNote.replace(/\bthẻ\s+\S+(\s+\S+)?/gi, '').replace(/\bthe\s+\S+(\s+\S+)?/gi, '').trim();
    // Fallback: nếu cắt sạch quá → dùng workText
    if (cleanNote.length < 2) cleanNote = workText;

    return { type, amount, accountId, toAccountId, categoryId, categoryConfidence, tags, note: cleanNote, autoSave };
  },

  async voiceInput() {
    if (!QLT_Voice.available()) {
      QLT_UI.alert('Thiết bị này không hỗ trợ nhận giọng nói. Trên Android cần cài bản APK có plugin Speech Recognition (build mới nhất).', { title: 'Không khả dụng' });
      return;
    }
    const status = $('#txOcrStatus');
    status.style.display = 'block';
    status.style.color = '';
    status.textContent = '🎙️ Nói: "ăn sáng 150k MBBank lưu" (kết "lưu" để tự lưu) · "lương 10tr" · "chuyển 500k VCB sang MB"';

    QLT_Voice.listen({
      lang: 'vi-VN',
      onPartial: (p) => { status.textContent = '🎙️ ' + p; },
      onResult: (text) => {
        const parsed = this.parseVoiceTransaction(text);

        // Lưu metadata để learning loop sau khi user save:
        // text gốc, categoryId mà voice gợi ý, có match được không
        this.state._voiceContext = {
          text,
          suggestedCatId: parsed.categoryId,
          type: parsed.type,
          ts: Date.now()
        };

        // Đổi type pill + UI nếu khác type hiện tại
        const curType = $('#txForm').dataset.type;
        if (parsed.type !== curType) {
          $('#txForm').dataset.type = parsed.type;
          $$('.tx-type-pill').forEach(el =>
            el.classList.toggle('on', el.dataset.type === parsed.type));
          if (this.state.editingTx) this.state.editingTx.type = parsed.type;
          this.applyTxTypeUI(parsed.type);
        }

        // Số tiền
        if (parsed.amount > 0) {
          $('#txAmount').value = Number(parsed.amount).toLocaleString('vi-VN');
        }

        // Ví nguồn / đích
        if (parsed.accountId) {
          this.state.editingTx.accountId = parsed.accountId;
          $$('#txAccountList .picker-item').forEach(el =>
            el.classList.toggle('on', el.dataset.acc === parsed.accountId));
        }
        if (parsed.type === 'transfer' && parsed.toAccountId) {
          this.state.editingTx.toAccountId = parsed.toAccountId;
          this.renderTxToAccountPicker();
        }

        // Danh mục
        if (parsed.categoryId) {
          this.state.editingTx.categoryId = parsed.categoryId;
          delete this.state.editingTx._activeParent;
          this.renderTxCategoryPicker(parsed.type || 'expense');
          // Ẩn banner gợi ý nếu trước đó có hiện
          const sg = $('#txCatSuggest');
          if (sg) sg.style.display = 'none';
          // Hiện banner "Đã nhận diện" để user xác nhận
          this._showCatDetectedBanner(parsed.categoryId, parsed.categoryConfidence || 0.85, text, parsed.type || 'expense');
        } else if (parsed.type !== 'transfer') {
          // Không match → hiện banner Smart Suggestions + Tạo từ note
          // Note đã được điền vào txNote ở trên, lấy từ editingTx
          this.state.editingTx.note = parsed.note || '';
          this._renderCatSuggestions(parsed, !!parsed.autoSave);
          setTimeout(() => {
            const sec = document.getElementById('txCategorySection');
            if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 350);
        }

        // Tags từ câu nói (pattern "thẻ X")
        if (Array.isArray(parsed.tags) && parsed.tags.length > 0) {
          this.state.editingTx.tags = this.state.editingTx.tags || [];
          for (const t of parsed.tags) {
            if (!this.state.editingTx.tags.includes(t)) this.state.editingTx.tags.push(t);
          }
          // Re-render chips
          this.renderTxTags();
        }

        // Ghi chú đã smart-trim (bỏ "lưu", bỏ tên ví, bỏ phần sau số tiền)
        if (parsed.note) $('#txNote').value = parsed.note;

        const typeLabel = parsed.type === 'expense' ? 'Chi phí'
          : parsed.type === 'income' ? 'Thu nhập' : 'Chuyển khoản';

        // ===== Auto-save khi user nói "lưu" / "save" cuối câu =====
        if (parsed.autoSave) {
          // Validate đủ field trước khi save (tránh toast lỗi)
          const tx = this.state.editingTx;
          const missing = [];
          if (!parsed.amount || parsed.amount <= 0) missing.push('số tiền');
          if (!tx.accountId) missing.push('ví');
          if (parsed.type !== 'transfer' && !tx.categoryId) missing.push('danh mục');
          if (parsed.type === 'transfer' && !tx.toAccountId) missing.push('ví đích');

          if (missing.length > 0) {
            // Nếu chỉ thiếu danh mục → banner suggest đã hiện, dùng message thân thiện
            const onlyCat = missing.length === 1 && missing[0] === 'danh mục';
            status.style.color = '#cc7a4f';
            status.textContent = onlyCat
              ? '👆 Tap 1 gợi ý phía dưới để tự lưu giao dịch'
              : `⚠️ Còn thiếu: ${missing.join(', ')} — chọn rồi bấm Lưu`;
            setTimeout(() => { status.style.display = 'none'; status.style.color = ''; }, 5000);
          } else {
            status.textContent = `💾 Đang lưu: ${typeLabel} ${fmt(parsed.amount)} đ...`;
            // Delay nhỏ để user thấy xác nhận trước khi modal đóng
            setTimeout(() => {
              status.style.display = 'none';
              this.saveTx();
            }, 700);
          }
          return;
        }

        status.textContent = `✓ ${typeLabel} · "${text}"`;
        setTimeout(() => { status.style.display = 'none'; }, 2500);
      },
      onError: (e) => {
        status.style.color = '#e63946';
        status.textContent = '⚠️ ' + (e?.message || 'Lỗi nghe');
        setTimeout(() => { status.style.display = 'none'; status.style.color = ''; }, 2500);
      },
      onEnd: () => { /* status đã xử lý ở onResult/onError */ }
    });
  },

  async scanReceipt() {
    try {
      const urls = await this.pickPhotos({ camera: false, multi: false, header: 'Chọn ảnh hoá đơn' });
      if (!urls.length) return;
      const imageDataUrl = urls[0];

      const status = $('#txOcrStatus');
      status.style.display = 'block';

      // Quyết định dùng AI hay OCR cũ
      const aiAvailable = window.QLT_AI && await window.QLT_AI.hasApiKey();

      // Tự THÊM ảnh vừa quét vào danh sách minh chứng (làm trước để giữ ảnh nếu OCR/AI fail)
      try {
        const compressed = await this.compressImage(imageDataUrl);
        const t = this.state.editingTx;
        t.photos = [...this.getTxPhotos(t), compressed];
        delete t.photo;
        this.renderTxPhoto();
      } catch (_) { /* compress lỗi không chặn flow */ }

      let result = null;
      let usedAI = false;

      if (aiAvailable) {
        // === AI Vision (Gemini) — ƯU TIÊN, không fallback OCR cũ trừ khi user yêu cầu ===
        usedAI = true;
        status.textContent = '🤖 AI đang phân tích hoá đơn... (~15-30s)';
        const type = $('#txForm').dataset.type || 'expense';
        const catList = this.state.categories
          .filter(c => c.type === type && c.parentId && !c.archived)
          .map(c => {
            const parent = this.state.categories.find(x => x.id === c.parentId);
            return { slug: c.slug || c.id, name: c.name, parentName: parent?.name };
          });
        try {
          const r = await window.QLT_AI.analyzeReceiptForTx({
            imageBase64: imageDataUrl,
            mimeType: imageDataUrl.match(/^data:([^;]+);/)?.[1] || 'image/jpeg',
            categoriesList: catList
          });
          if (r.ok && r.amount > 0) {
            result = {
              amount: r.amount,
              date: r.date,
              merchant: r.merchant,
              categorySlug: r.categorySlug,
              note: r.note,
              items: r.items
            };
          } else {
            // AI parse fail → KHÔNG fallback tự động sang OCR cũ (vì OCR cũ thường sai số tiền)
            // Hỏi user muốn dùng OCR thường hay thử lại AI
            console.warn('[AI receipt] parse failed:', r);
            const choice = await QLT_UI.confirm(
              '🤖 AI đã đọc nhưng không lấy được số tiền chính xác.\n\nLỗi: ' + (r.error || 'response không hợp lệ') + '\n\nBạn muốn:\n• [Thử lại AI] — chụp lại / thử lần nữa\n• [OCR thường] — dùng OCR đơn giản (kết quả có thể sai)',
              { title: 'AI parse thất bại', okLabel: '🔄 Thử lại AI', cancelLabel: '📝 OCR thường' }
            );
            if (choice) {
              status.textContent = '🤖 Thử lại AI...';
              try {
                const r2 = await window.QLT_AI.analyzeReceiptForTx({
                  imageBase64: imageDataUrl,
                  categoriesList: catList
                });
                if (r2.ok && r2.amount > 0) {
                  result = {
                    amount: r2.amount, date: r2.date, merchant: r2.merchant,
                    categorySlug: r2.categorySlug, note: r2.note, items: r2.items
                  };
                } else {
                  status.style.color = '#cc7a4f';
                  status.textContent = '⚠️ AI vẫn không lấy được — vui lòng nhập tay';
                  return;
                }
              } catch (e2) {
                status.style.color = '#cc7a4f';
                status.textContent = '⚠️ AI lỗi: ' + (e2.message || '').slice(0, 60);
                return;
              }
            } else {
              usedAI = false; // user chọn OCR thường
            }
          }
        } catch (e) {
          // Network / timeout / API error
          console.warn('[AI receipt] error:', e);
          const choice = await QLT_UI.confirm(
            '🤖 AI gặp lỗi khi gọi API:\n\n' + (e.message || 'Unknown error') + '\n\nBạn muốn:\n• [Thử lại AI] — gọi lại Gemini\n• [OCR thường] — dùng OCR đơn giản',
            { title: 'AI lỗi kết nối', okLabel: '🔄 Thử lại AI', cancelLabel: '📝 OCR thường' }
          );
          if (choice) {
            status.textContent = '🤖 Thử lại AI...';
            try {
              const r2 = await window.QLT_AI.analyzeReceiptForTx({
                imageBase64: imageDataUrl,
                categoriesList: catList
              });
              if (r2.ok && r2.amount > 0) {
                result = {
                  amount: r2.amount, date: r2.date, merchant: r2.merchant,
                  categorySlug: r2.categorySlug, note: r2.note, items: r2.items
                };
              } else {
                usedAI = false;
              }
            } catch (e2) {
              status.style.color = '#cc7a4f';
              status.textContent = '⚠️ AI vẫn lỗi: ' + (e2.message || '').slice(0, 60);
              return;
            }
          } else {
            usedAI = false; // user chọn OCR thường
          }
        }
      }

      if (!result) {
        // === OCR truyền thống (Tesseract / ML Kit) — chỉ chạy khi AI fail + user đồng ý ===
        status.textContent = 'Đang đọc... (OCR thường — chính xác hạn chế)';
        const ocrR = await window.QLT_Ocr.recognize(imageDataUrl, p => {
          if (p.stage === 'recognizing') status.textContent = 'Đang đọc... ' + Math.round(p.progress * 100) + '%';
        });
        result = {
          amount: ocrR.amount,
          date: ocrR.date,
          merchant: ocrR.merchant
        };
      }

      // === Auto-fill form ===
      if (result.amount) {
        $('#txAmount').value = Number(result.amount).toLocaleString('vi-VN');
      }
      if (result.date) $('#txDate').value = result.date;
      // Note: ưu tiên AI's `note` field, fallback merchant
      const noteText = (result.note || result.merchant || '').trim();
      if (noteText) $('#txNote').value = noteText;

      // AI category suggestion → tìm cat tương ứng
      if (usedAI && result.categorySlug) {
        const cat = this.state.categories.find(c =>
          (c.slug === result.categorySlug || c.id === result.categorySlug)
          && c.type === ($('#txForm').dataset.type || 'expense')
        );
        if (cat && this.state.editingTx) {
          this.state.editingTx.categoryId = cat.id;
          delete this.state.editingTx._activeParent;
          this.renderTxCategoryPicker(cat.type);
        }
      }

      // Status thông báo cuối
      if (usedAI && result.amount) {
        const itemHint = result.items && result.items.length > 1
          ? ` · ${result.items.length} món (xem tab Ghi chú để xem detail)`
          : '';
        status.style.color = '#16a34a';
        status.textContent = `✨ AI nhận diện: ${fmt(result.amount)} đ${itemHint}`;
        // Lưu items vào tx note nếu có
        if (result.items && result.items.length > 1) {
          const existing = $('#txNote').value || '';
          const itemList = result.items.map(it => `· ${it.name}: ${fmt(it.amount)} đ`).join('\n');
          $('#txNote').value = (existing + (existing ? '\n\n' : '') + itemList).slice(0, 500);
        }
      } else if (result.amount) {
        status.textContent = `✓ OCR: ${fmt(result.amount)} đ`;
      } else {
        status.style.color = '#cc7a4f';
        status.textContent = '⚠️ Không đọc được số tiền — vui lòng nhập tay';
      }
      setTimeout(() => { status.style.display = 'none'; status.style.color = ''; }, 3500);

    } catch (e) {
      console.error(e);
      const status = $('#txOcrStatus');
      if (status) {
        status.style.color = '#e63946';
        status.textContent = '❌ Lỗi: ' + (e.message || e);
        setTimeout(() => { status.style.display = 'none'; status.style.color = ''; }, 4000);
      }
      QLT_UI.alert('Không nhận diện được: ' + e.message, { title: 'Lỗi quét hoá đơn' });
    }
  },

  // Picker đa năng: trả về mảng dataUrl. Native single (1 ảnh/lần), web hỗ trợ multi.
  async pickPhotos({ camera = false, multi = false, header } = {}) {
    if (window.Capacitor && window.Capacitor.Plugins.Camera) {
      const Cam = window.Capacitor.Plugins.Camera;
      // Thử pickImages trước (hỗ trợ chọn nhiều ảnh từ thư viện) khi multi & không bắt buộc camera
      if (multi && !camera && typeof Cam.pickImages === 'function') {
        try {
          const r = await Cam.pickImages({ quality: 80, limit: 0 });
          const photos = (r && r.photos) || [];
          if (photos.length) {
            const urls = await Promise.all(photos.map(async p => {
              if (p.dataUrl) return p.dataUrl;
              const path = p.webPath || p.path;
              if (!path) return null;
              try {
                const res = await fetch(path);
                const blob = await res.blob();
                return await new Promise(res2 => {
                  const fr = new FileReader();
                  fr.onload = () => res2(fr.result);
                  fr.onerror = () => res2(null);
                  fr.readAsDataURL(blob);
                });
              } catch (_) { return null; }
            }));
            return urls.filter(Boolean);
          }
        } catch (_) { /* fallback xuống getPhoto */ }
      }
      try {
        const opts = {
          quality: 80,
          resultType: 'dataUrl',
          source: camera ? 'CAMERA' : 'PROMPT',
          allowEditing: false
        };
        if (header) {
          opts.promptLabelHeader = header;
          opts.promptLabelPhoto = 'Chọn từ thư viện';
          opts.promptLabelPicture = 'Chụp ảnh mới';
        }
        const photo = await Cam.getPhoto(opts);
        return photo.dataUrl ? [photo.dataUrl] : [];
      } catch (_) { return []; }
    }
    // Web fallback: file input — multi=true cho phép chọn nhiều ảnh
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (multi && !camera) input.multiple = true;
      if (camera) input.capture = 'environment';
      input.onchange = async e => {
        const files = Array.from(e.target.files || []);
        if (!files.length) { resolve([]); return; }
        const results = await Promise.all(files.map(f => new Promise(r => {
          const reader = new FileReader();
          reader.onload = () => r(reader.result);
          reader.onerror = () => r(null);
          reader.readAsDataURL(f);
        })));
        resolve(results.filter(Boolean));
      };
      input.click();
    });
  },

  // Resize + nén ảnh JPEG để file nhỏ (tránh DB phình to)
  compressImage(dataUrl, maxDim = 1280, quality = 0.78) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Không xử lý được ảnh'));
      img.src = dataUrl;
    });
  },

  async addTxPhoto() {
    try {
      const raws = await this.pickPhotos({ multi: true, header: 'Thêm ảnh minh chứng' });
      if (!raws.length) return;
      const compressed = await Promise.all(raws.map(r => this.compressImage(r).catch(() => null)));
      const newPhotos = compressed.filter(Boolean);
      const t = this.state.editingTx;
      t.photos = [...this.getTxPhotos(t), ...newPhotos];
      delete t.photo;
      this.renderTxPhoto();
    } catch (e) {
      QLT_UI.alert('Lỗi: ' + e.message, { title: 'Lỗi' });
    }
  },

  async removeTxPhoto(idx) {
    if (!await QLT_UI.confirm('Xoá ảnh minh chứng này?', { okLabel: 'Xoá', danger: true })) return;
    const t = this.state.editingTx;
    const cur = this.getTxPhotos(t);
    cur.splice(idx, 1);
    t.photos = cur;
    delete t.photo;
    this.renderTxPhoto();
  },

  renderTxPhoto() {
    const wrap = $('#txPhotoWrap');
    const t = this.state.editingTx;
    const photos = this.getTxPhotos(t);

    if (photos.length === 0) {
      wrap.innerHTML = `
        <button class="photo-add-btn" id="txPhotoAddBtn">
          ${svgIcon('camera')}
          <span>Thêm minh chứng</span>
        </button>
      `;
      $('#txPhotoAddBtn').onclick = () => this.addTxPhoto();
      return;
    }

    let html = '<div class="tx-photo-list">';
    photos.forEach((p, i) => {
      html += `
        <div class="photo-thumb" data-photo-idx="${i}">
          <img src="${p}" alt="minh chứng ${i + 1}">
          <button class="photo-remove" data-photo-remove="${i}" title="Xoá">${svgIcon('close')}</button>
        </div>
      `;
    });
    html += `<button class="photo-add-thumb" id="txPhotoAddBtn" title="Thêm ảnh">+</button>`;
    html += '</div>';
    wrap.innerHTML = html;

    wrap.querySelectorAll('[data-photo-idx]').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('[data-photo-remove]')) return;
        const idx = parseInt(el.dataset.photoIdx, 10);
        this.openLightbox(photos[idx], photos, idx);
      };
    });
    wrap.querySelectorAll('[data-photo-remove]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const idx = parseInt(el.dataset.photoRemove, 10);
        this.removeTxPhoto(idx);
      };
    });
    $('#txPhotoAddBtn').onclick = () => this.addTxPhoto();
  },

  // Lightbox với hỗ trợ điều hướng prev/next nếu được cung cấp danh sách
  openLightbox(src, list, startIdx) {
    const imgEl = $('#lightboxImg');
    const prevBtn = $('#lightboxPrev');
    const nextBtn = $('#lightboxNext');
    const counter = $('#lightboxCounter');
    const photos = Array.isArray(list) && list.length > 0 ? list : [src];
    let idx = (typeof startIdx === 'number' && startIdx >= 0) ? startIdx : Math.max(0, photos.indexOf(src));

    const show = () => {
      imgEl.src = photos[idx];
      const multi = photos.length > 1;
      prevBtn.style.display = multi ? 'flex' : 'none';
      nextBtn.style.display = multi ? 'flex' : 'none';
      counter.style.display = multi ? 'block' : 'none';
      if (multi) counter.textContent = `${idx + 1}/${photos.length}`;
    };
    prevBtn.onclick = (e) => { e.stopPropagation(); idx = (idx - 1 + photos.length) % photos.length; show(); };
    nextBtn.onclick = (e) => { e.stopPropagation(); idx = (idx + 1) % photos.length; show(); };
    show();
    $('#lightboxModal').classList.add('open');
  },

  // ============ ICON PICKER (chỉ emoji — gọn, không dùng SVG icon nữa) ============
  // Trả về object { setColor(c) } để giữ tương thích — emoji không cần đổi màu nên là no-op
  renderIconPicker(opts) {
    // opts: { containerId, currentIcon, color?, allowEmoji?, onPick }
    const container = document.getElementById(opts.containerId);
    if (!container) return { setColor: () => {} };

    const initEmoji = String(opts.currentIcon || '').startsWith('emoji:')
      ? opts.currentIcon.slice(6) : '';

    // Bộ emoji gợi ý — chia theo nhóm để dễ tìm theo nhu cầu hằng ngày
    const EMOJI_GROUPS = [
      { key: 'food', name: 'Ăn uống', icon: '🍜', emojis: [
        '🍜','🍚','🍱','🍲','🍛','🍙','🍘','🥟','🍣','🍤','🌮','🌯','🥗','🥪','🍝','🍞',
        '🥖','🥐','🧀','🥚','🍳','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥨','🥞','🧇',
        '🍰','🎂','🧁','🍩','🍪','🍫','🍬','🍭','🍮','🍯','🍦','🍨','🍧','🍡','🥮','🍢',
        '🍇','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒','🍓','🫐','🥝','🍅',
        '🥑','🍆','🥔','🥕','🌽','🌶️','🥒','🥬','🥦','🧄','🧅','🍄','🥜','🌰'
      ]},
      { key: 'drink', name: 'Đồ uống', icon: '☕', emojis: [
        '☕','🍵','🧉','🧋','🥤','🧃','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🍼','🥛'
      ]},
      { key: 'shop', name: 'Mua sắm', icon: '🛒', emojis: [
        '🛒','🛍️','🎁','👕','👔','👖','👗','👚','👘','🥻','🩱','🩲','🩳','👙','👠','👡','👢','👞','👟','🥾','🥿','🧢','🎩','👑','💍','👜','👛','👝','🎒','🧳','🕶️','👓','⌚','💎'
      ]},
      { key: 'bills', name: 'Hoá đơn', icon: '⚡', emojis: [
        '⚡','💡','💧','🚿','🛁','🚰','🔥','🔌','🪫','🔋','📶','📡','📞','☎️','📱','💻','🖥️','🖨️','📺','📻','📷','📹','🎙️','🔊','🎧'
      ]},
      { key: 'transport', name: 'Di chuyển', icon: '🚗', emojis: [
        '🚗','🚙','🚕','🛺','🚖','🚘','🏍️','🛵','🚲','🛴','🛹','🚌','🚐','🚎','🚒','🚓','🚑','🚚','🚛','🚜','🚆','🚄','🚅','🚇','🚈','🚉','🚂','🚁','✈️','🛫','🛬','🚀','🛸','⛵','🚤','🛥️','⛴️','🚢','⛽','🅿️','🚏','🛣️','🛤️','🗺️','🧭'
      ]},
      { key: 'health', name: 'Sức khoẻ', icon: '💊', emojis: [
        '💊','💉','🩺','🩹','🩻','🦷','👁️','🧠','🫀','🫁','🦴','🩸','🏥','🏨','⚕️','🧴','🧼','🪥','🧻','🚽','🪒','🧯','🦽','🦼','🦯','🦻','🦾','🦿'
      ]},
      { key: 'sport', name: 'Thể thao', icon: '⚽', emojis: [
        '🏋️','🤸','🚴','🏃','🧘','⛹️','🏊','🏄','🤽','🤾','🤼','🤺','🏌️','🤿','⚽','🏀','🏐','🏈','⚾','🥎','🎾','🏓','🏸','🏑','🏒','🥍','🥊','🥋','🥅','⛳','🏹','🎣','🎽','🎿','⛷️','🏂','🛷','🪂','🏆','🥇','🥈','🥉','🎖️','🏅','🎯','🎳','🎮','🎰','🎲','🧩','🪀','🪁','♟️'
      ]},
      { key: 'culture', name: 'Văn hoá', icon: '🎬', emojis: [
        '🎬','🎥','🎞️','📽️','🎭','🎨','🖼️','🎪','🎫','🎟️','🎤','🎧','🎼','🎵','🎶','🎷','🎺','🎸','🪕','🎻','🥁','🪘','🪇'
      ]},
      { key: 'event', name: 'Sự kiện', icon: '🎉', emojis: [
        '🎉','🎊','🎈','🎀','🎁','🎂','🎃','🎄','🎆','🎇','🧨','✨','🎋','🎍','🎎','🎏','🎐','🪔','🧧','💝','💐','🌹','🌷','🌻','🌼','🌸','🪷','💌','💒','💞','💕','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎'
      ]},
      { key: 'work', name: 'Học/Công việc', icon: '📚', emojis: [
        '📚','📖','📕','📗','📘','📙','📓','📔','📒','📑','📋','📝','✏️','✒️','🖊️','🖋️','🖌️','🖍️','📐','📏','📌','📍','📎','🖇️','📂','📁','🗂️','📅','📆','🗓️','📇','📊','📈','📉','📰','🗞️','🔖','🏷️','💼','👔','🎓','🎒','🏫','🏛️','🧮','💾','💿','📀','💽','🗄️','🗃️','🗒️'
      ]},
      { key: 'home', name: 'Nhà cửa', icon: '🏠', emojis: [
        '🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🌇','🌆','🌃','🌉','🏗️','🏚️','⛪','🕌','🛕','⛩️','🕍','🛋️','🛏️','🚪','🪑','🛗','🚿','🚽','🪞','🪟','🪜','🧱','🪨','🪵','🪴','🕯️'
      ]},
      { key: 'family', name: 'Gia đình', icon: '👪', emojis: [
        '👨‍👩‍👧','👨‍👩‍👦','👨‍👩‍👧‍👦','👪','👶','🧒','👦','👧','🧑','👨','👩','👴','👵','🤰','🤱','👨‍🍳','👩‍🍳','👨‍🎓','👩‍🎓','👨‍🏫','👩‍🏫','👨‍⚕️','👩‍⚕️','👨‍💻','👩‍💻','👮','💆','💇','🧑‍🦽','🧑‍🦯'
      ]},
      { key: 'pet', name: 'Thú cưng', icon: '🐶', emojis: [
        '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪲','🐞','🐢','🐍','🦎','🦂','🦀','🦑','🐙','🦐','🐠','🐟','🐡','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🐈','🐓','🦃','🦚','🦜','🦢','🐇','🦝','🦨','🦡','🦦','🦥'
      ]},
      { key: 'money', name: 'Tài chính', icon: '💰', emojis: [
        '💰','💸','💵','💴','💶','💷','🪙','💳','🧾','🏦','🏧','💹','📈','📉','📊','🤑','💎','🏆','🎖️','💼','📦','📨','📩','✉️','📤','📥'
      ]},
      { key: 'tools', name: 'Dụng cụ', icon: '🔧', emojis: [
        '🔧','🔨','🛠️','⚒️','🪛','🪚','⛏️','🧰','🪤','🔩','⚙️','🧲','🪜','🧱','🪣','🧹','🧺','🧽','🧼','🧴','🧻','🪥','🪒','✂️','🪡','🧵','🧶','💄','🪮','💈','🩴','🌂','☂️','🪧','🪪'
      ]},
      { key: 'nature', name: 'Thiên nhiên', icon: '🌿', emojis: [
        '🌾','🌱','🌲','🌳','🌴','🌵','🍀','🍁','🍂','🍃','🌿','☘️','🌍','🌎','🌏','🌞','🌝','🌚','🌛','🌜','⭐','🌟','💫','🌠','☄️','🪐','🌈','☁️','⛅','🌤️','🌥️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌪️','🌊','🔥','💧'
      ]},
      { key: 'symbol', name: 'Ký hiệu', icon: '⭐', emojis: [
        '✅','❌','⭕','❗','❓','💯','🔔','🔕','🔒','🔓','🔑','🗝️','⚠️','🚧','🛑','🚫','🚸','♻️','✨','⚡','🌟','💫','💥','🔆','🔅','📵','🆕','🆓','🆒','🆗','🆖','🆙','🆎','🅰️','🅱️','🆘','📛','🚩','🏁','🏳️','🏴','🏳️‍🌈','🎌'
      ]}
    ];

    // Tab mặc định: nếu icon hiện tại nằm trong nhóm nào → mở nhóm đó
    let activeGroup = EMOJI_GROUPS[0].key;
    if (initEmoji) {
      const found = EMOJI_GROUPS.find(g => g.emojis.includes(initEmoji));
      if (found) activeGroup = found.key;
    }

    container.innerHTML = `
      <div class="icon-emoji-section">
        <div class="emoji-tabs"></div>
        <div class="icon-emoji-grid"></div>
        <div class="icon-emoji-input-row">
          <label>Tự gõ:</label>
          <input type="text" placeholder="Vd: 🍜" maxlength="4" value="${this.escapeHtml(initEmoji)}">
        </div>
      </div>
    `;

    const tabsEl = container.querySelector('.emoji-tabs');
    const emojiGrid = container.querySelector('.icon-emoji-grid');
    const emojiInput = container.querySelector('.icon-emoji-input-row input');

    const setEmojiPicked = (emoji) => {
      emojiGrid.querySelectorAll('.icon-emoji-pick').forEach(x => {
        x.classList.toggle('on', x.dataset.emoji === emoji);
      });
    };

    const renderEmojiGrid = () => {
      const g = EMOJI_GROUPS.find(x => x.key === activeGroup) || EMOJI_GROUPS[0];
      emojiGrid.innerHTML = g.emojis.map(e => {
        const on = ('emoji:' + e) === opts.currentIcon;
        return `<div class="icon-emoji-pick ${on ? 'on' : ''}" data-emoji="${e}">${e}</div>`;
      }).join('');
      emojiGrid.querySelectorAll('.icon-emoji-pick').forEach(el => {
        el.onclick = () => {
          const e = el.dataset.emoji;
          opts.currentIcon = 'emoji:' + e;
          setEmojiPicked(e);
          if (emojiInput) emojiInput.value = '';
          if (opts.onPick) opts.onPick(opts.currentIcon);
        };
      });
    };

    tabsEl.innerHTML = EMOJI_GROUPS.map(g =>
      `<div class="emoji-tab ${g.key === activeGroup ? 'on' : ''}" data-key="${g.key}" title="${this.escapeHtml(g.name)}">${g.icon}</div>`
    ).join('');
    tabsEl.querySelectorAll('.emoji-tab').forEach(el => {
      el.onclick = () => {
        activeGroup = el.dataset.key;
        tabsEl.querySelectorAll('.emoji-tab').forEach(x => x.classList.toggle('on', x.dataset.key === activeGroup));
        renderEmojiGrid();
      };
    });
    renderEmojiGrid();

    if (emojiInput) {
      emojiInput.oninput = (e) => {
        const v = e.target.value.trim();
        if (v) {
          opts.currentIcon = 'emoji:' + v;
          setEmojiPicked(v);
          if (opts.onPick) opts.onPick(opts.currentIcon);
        }
      };
    }

    return { setColor: () => {} };
  },

  // ============ COLOR PICKER (12 swatch + 1 ô tuỳ chỉnh) ============
  renderColorPicker(containerId, hiddenId, initialValue, onChange) {
    const PRESETS = [
      '#2d6a4f', '#52b788', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
      '#a855f7', '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#f59e0b'
    ];
    const container = $('#' + containerId);
    const hidden = $('#' + hiddenId);
    if (!container || !hidden) return;

    container.innerHTML = PRESETS.map(c =>
      `<div class="color-swatch" data-color="${c}" style="background:${c}"></div>`
    ).join('') + `<div class="color-swatch custom" title="Màu tuỳ chỉnh"></div>`;

    const swatches = container.querySelectorAll('.color-swatch[data-color]');
    const customEl = container.querySelector('.color-swatch.custom');

    const setColor = (c) => {
      if (!c) return;
      const lc = c.toLowerCase();
      hidden.value = c;
      let matched = false;
      swatches.forEach(el => {
        const on = el.dataset.color.toLowerCase() === lc;
        el.classList.toggle('on', on);
        if (on) matched = true;
      });
      if (matched) {
        customEl.classList.remove('on');
        customEl.style.background = '';
      } else {
        customEl.classList.add('on');
        customEl.style.background = c;
      }
      if (onChange) onChange(c);
    };

    swatches.forEach(el => {
      el.onclick = () => setColor(el.dataset.color);
    });

    customEl.onclick = () => {
      const input = document.createElement('input');
      input.type = 'color';
      input.value = hidden.value || '#2d6a4f';
      input.style.cssText = 'position:fixed;left:-9999px;opacity:0;pointer-events:none';
      document.body.appendChild(input);
      input.oninput = () => setColor(input.value);
      input.onchange = () => { setColor(input.value); input.remove(); };
      // dọn input nếu user huỷ (không có event nào fire)
      setTimeout(() => { if (input.parentNode) input.remove(); }, 60000);
      input.click();
    };

    setColor(initialValue);
  },

  // ============ MODAL: CATEGORY ============
  openCatModal(id) {
    const isNew = !id;
    let c;
    if (isNew) {
      c = { id: null, type: this.state.catTab, name: '', icon: 'other', color: '#52b788', parentId: null, bookId: this.state.currentBookId };
    } else {
      c = this.state.categories.find(x => x.id === id);
      if (!c) return;
    }
    this.state.editingCat = { ...c, keywords: Array.isArray(c.keywords) ? [...c.keywords] : [] };
    $('#catName').value = c.name;
    this.renderCatKeywords();
    const catIconPicker = this.renderIconPicker({
      containerId: 'catIconGrid',
      currentIcon: c.icon || 'other',
      color: c.color || '#52b788',
      allowEmoji: true,
      onPick: (icon) => { this.state.editingCat.icon = icon; }
    });
    this.state._catIconPicker = catIconPicker;
    this.renderColorPicker('catColorPicker', 'catColor', c.color || '#52b788', (color) => {
      this.state.editingCat.color = color;
      catIconPicker.setColor(color);
    });
    $('#catType').value = c.type;
    $('#catTitle').textContent = isNew ? 'Tạo danh mục' : 'Sửa danh mục';
    $('#catDelete').style.display = isNew ? 'none' : 'block';

    // Populate parent dropdown — chỉ hiện danh mục cha cùng type, KHÔNG bao gồm chính nó & con của nó
    this.renderCatParentOptions();
    // Đổi type → reload parent options
    $('#catType').onchange = () => {
      this.state.editingCat.type = $('#catType').value;
      this.renderCatParentOptions();
    };

    $('#catModal').classList.add('open');
  },

  // ====== Voice Keywords cho danh mục ======
  // Gợi ý keywords dựa trên tên danh mục (match từ aliasMap)
  _suggestCatKeywords(catName, existing = []) {
    if (!catName) return [];
    const n = normalizeVi(catName);
    // Map ngược: với cat name có chứa từ key → đề xuất các synonym/từ khoá phổ biến
    const reverse = {
      'ca phe': ['cafe', 'café', 'coffee', 'tra sua', 'highlands', 'starbucks', 'di ca phe'],
      'tra sua': ['tra sua', 'bubble tea', 'milk tea', 'tocotoco', 'gong cha'],
      'an uong': ['com', 'an trua', 'an sang', 'an toi', 'di an', 'an ngoai', 'pho', 'bun'],
      'an ngoai': ['di an', 'an trua', 'an toi', 'nha hang', 'quan an'],
      'dua vo': ['di cho', 'cho', 'vo', 'ba xa', 'gia dinh'],
      'gia dinh': ['gia dinh', 'cha me', 'bo me', 'ba ngoai', 'ong ba'],
      'dien': ['tien dien', 'hoa don dien', 'evn'],
      'nuoc': ['tien nuoc', 'hoa don nuoc'],
      'dien thoai': ['phone', 'sim', 'cuoc', '5g', '4g', 'mobi', 'viettel', 'vina'],
      'internet': ['wifi', 'mang', 'fpt', 'vnpt'],
      'xang': ['gas', 'fuel', 'do xang', 'petrolimex'],
      'xang xe': ['gas', 'fuel', 'do xang', 'a95', 'a92'],
      'di lai': ['grab', 'taxi', 'be', 'gojek', 'xe om'],
      'shopping': ['mua sam', 'shopee', 'lazada', 'tiki'],
      'mua sam': ['shopee', 'lazada', 'tiki', 'shopping', 'quan ao', 'giay dep'],
      'suc khoe': ['thuoc', 'benh vien', 'phong kham', 'kham', 'nha si', 'rang'],
      'giai tri': ['xem phim', 'rap', 'cgv', 'galaxy', 'karaoke', 'game', 'di choi'],
      'hoc': ['sach', 'truong', 'lop hoc', 'gia su', 'hoc them'],
      'gia su': ['hoc them', 'thay', 'co giao', 'day kem'],
      'hoc chinh': ['truong', 'trung tam', 'lop chinh'],
      'qua': ['biếu', 'sinh nhat', 'cuoi hoi', 'le'],
      'luong': ['salary', 'tien luong', 'luong ve'],
      'thuong': ['bonus', 'tien thuong', 'tet'],
      'mo lop': ['day them', 'day hoc', 'lop hoc']
    };
    const out = new Set();
    for (const [key, vals] of Object.entries(reverse)) {
      if (n.includes(key) || key.includes(n)) {
        vals.forEach(v => out.add(v));
      }
    }
    // Bỏ các keyword đã có
    const exNorm = new Set(existing.map(x => normalizeVi(x)));
    return [...out].filter(x => !exNorm.has(normalizeVi(x))).slice(0, 8);
  },

  renderCatKeywords() {
    const c = this.state.editingCat;
    const wrap = $('#catKeywordsWrap');
    const sugWrap = $('#catKeywordSuggestions');
    const input = $('#catKeywordInput');
    if (!wrap || !c) return;

    const renderChips = () => {
      wrap.innerHTML = (c.keywords || []).length === 0
        ? `<span style="color:var(--text3);font-size:12px;font-style:italic">Chưa có từ khoá — gõ để thêm hoặc bấm gợi ý bên dưới</span>`
        : c.keywords.map(k =>
            `<span class="cat-kw-chip">${this.escapeHtml(k)} <span class="cat-kw-x" data-kw-rm="${this.escapeHtml(k)}">✕</span></span>`
          ).join('');
      wrap.querySelectorAll('[data-kw-rm]').forEach(el => {
        el.onclick = () => {
          c.keywords = c.keywords.filter(x => x !== el.dataset.kwRm);
          renderChips();
          renderSuggestions();
        };
      });
    };

    const renderSuggestions = () => {
      const name = $('#catName').value || c.name || '';
      const sug = this._suggestCatKeywords(name, c.keywords || []);
      if (sug.length === 0) { sugWrap.innerHTML = ''; return; }
      sugWrap.innerHTML = '<div style="font-size:11px;color:var(--text3);width:100%;margin-bottom:2px">💡 Gợi ý cho "' + this.escapeHtml(name) + '":</div>'
        + sug.map(s => `<span class="cat-kw-suggestion" data-kw-add="${this.escapeHtml(s)}">+ ${this.escapeHtml(s)}</span>`).join('');
      sugWrap.querySelectorAll('[data-kw-add]').forEach(el => {
        el.onclick = () => {
          c.keywords = c.keywords || [];
          if (!c.keywords.some(x => normalizeVi(x) === normalizeVi(el.dataset.kwAdd))) {
            c.keywords.push(el.dataset.kwAdd);
          }
          renderChips();
          renderSuggestions();
        };
      });
    };

    renderChips();
    renderSuggestions();

    input.value = '';
    const addCurrent = () => {
      const raw = input.value.trim();
      if (!raw) return false;
      // Tách nhiều keyword cùng lúc nếu user gõ với dấu phẩy
      const parts = raw.split(/[,;]/).map(s => s.trim()).filter(Boolean);
      c.keywords = c.keywords || [];
      let added = false;
      for (const v of parts) {
        if (!c.keywords.some(x => normalizeVi(x) === normalizeVi(v))) {
          c.keywords.push(v);
          added = true;
        }
      }
      input.value = '';
      if (added) {
        renderChips();
        renderSuggestions();
      }
      return added;
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ',' || e.keyCode === 13) {
        e.preventDefault();
        addCurrent();
      }
    };
    // Blur input → auto-add nếu còn text (user gõ xong, tap chỗ khác)
    input.onblur = () => addCurrent();
    // Nút "+ Thêm" rõ ràng cho user
    const addBtn = $('#catKeywordAddBtn');
    if (addBtn) addBtn.onclick = () => { addCurrent(); input.focus(); };

    // Refresh suggestions khi user đổi tên
    $('#catName').oninput = () => renderSuggestions();
  },

  // Lọc các danh mục cha hợp lệ:
  // - cùng type với danh mục đang sửa
  // - không phải chính nó
  // - không phải đã có cha (1 level: parent KHÔNG được là child của ai khác)
  // - không có con (tránh nested 3 level)
  renderCatParentOptions() {
    const c = this.state.editingCat;
    if (!c) return;
    const type = $('#catType').value || c.type;
    const candidates = this.state.categories.filter(x =>
      x.type === type &&
      x.id !== c.id &&
      !x.parentId // chỉ category top-level mới được làm parent
    );
    const sel = $('#catParent');
    sel.innerHTML = `<option value="">— Không có (danh mục cha) —</option>` +
      candidates.map(p => `<option value="${p.id}" ${c.parentId === p.id ? 'selected' : ''}>${this.escapeHtml(p.name)}</option>`).join('');

    // Nếu mục đang sửa CÓ con → KHÔNG cho chọn parent (vì sẽ thành 3 level)
    const hasChildren = c.id && this.state.categories.some(x => x.parentId === c.id);
    if (hasChildren) {
      sel.value = '';
      sel.disabled = true;
      sel.title = 'Danh mục này đã có danh mục con — không thể làm con của ai khác';
    } else {
      sel.disabled = false;
      sel.title = '';
    }
  },

  async saveCat() {
    const c = this.state.editingCat;
    c.name = $('#catName').value.trim();
    c.color = $('#catColor').value;
    c.type = $('#catType').value;
    c.parentId = $('#catParent').value || null;
    c.bookId = c.bookId || this.state.currentBookId;
    // keywords đã được editingCat.keywords nắm sẵn qua renderCatKeywords;
    // dedupe + bỏ keyword rỗng
    if (Array.isArray(c.keywords)) {
      const seen = new Set();
      c.keywords = c.keywords.filter(k => {
        const n = normalizeVi(k || '').trim();
        if (!n || seen.has(n)) return false;
        seen.add(n);
        return true;
      });
    } else c.keywords = [];
    if (!c.name) { QLT_UI.toast('Nhập tên danh mục', { type: 'error' }); return; }

    // Nếu chọn parent, đảm bảo cùng type
    if (c.parentId) {
      const parent = this.state.categories.find(x => x.id === c.parentId);
      if (parent && parent.type !== c.type) {
        QLT_UI.toast('Danh mục cha phải cùng loại (Chi/Thu)', { type: 'error' });
        return;
      }
      // Tránh đổi parent thành con của 1 cha có cha (3 level)
      if (parent && parent.parentId) {
        QLT_UI.toast('Không thể chọn danh mục cha đã là con của mục khác', { type: 'error' });
        return;
      }
      // Tránh tự làm cha của chính mình
      if (c.id === c.parentId) { c.parentId = null; }
    }

    await window.QLT_Store.put('categories', c);
    await this.reload();
    $('#catModal').classList.remove('open');
    this.renderCategories();
    this.autoSync();
  },

  async deleteCat() {
    const c = this.state.editingCat;
    if (!c.id) return;
    const used = this.state.transactions.filter(t => t.categoryId === c.id).length;
    const children = this.state.categories.filter(x => x.parentId === c.id);
    if (children.length > 0) {
      if (!await QLT_UI.confirm(`Danh mục này có ${children.length} danh mục con. Xoá sẽ chuyển các con thành danh mục cha (top-level). Tiếp tục?`, { okLabel: 'Xoá', danger: true })) return;
      // Gỡ parentId của các con
      for (const ch of children) {
        ch.parentId = null;
        await window.QLT_Store.put('categories', ch);
      }
    }
    if (used > 0) {
      if (!await QLT_UI.confirm(`Có ${used} giao dịch dùng danh mục này. Vẫn xoá?`, { okLabel: 'Xoá', danger: true })) return;
    } else if (children.length === 0) {
      if (!await QLT_UI.confirm('Xoá danh mục?', { okLabel: 'Xoá', danger: true })) return;
    }
    await window.QLT_Store.del('categories', c.id);
    await this.reload();
    $('#catModal').classList.remove('open');
    this.renderCategories();
    this.autoSync();
  },

  // ============ MODAL: ACCOUNT ============
  openAccModal(id) {
    const isNew = !id;
    let a;
    if (isNew) {
      a = {
        id: null, name: '', icon: 'cash', balance: 0, currency: 'VND',
        bookId: this.state.currentBookId,
        accountType: 'payment',
        // Savings fields (chỉ dùng nếu accountType='savings')
        interestRate: 0, termMonths: 6, startDate: today(), maturityDate: ''
      };
    } else {
      a = this.state.accounts.find(x => x.id === id);
      if (!a) return;
    }
    this.state.editingAcc = { ...a };
    const editing = this.state.editingAcc;
    if (!editing.accountType) editing.accountType = 'payment';

    $('#accName').value = a.name;
    $('#accBalance').value = fmtAmount(a.balance);
    $('#accTitle').textContent = isNew ? 'Thêm tài khoản' : 'Sửa tài khoản';
    $('#accDelete').style.display = isNew ? 'none' : 'block';
    $('#accMaturity').style.display = (!isNew && editing.accountType === 'savings') ? 'block' : 'none';

    // Khi sửa ví thanh toán: KHOÁ ô số dư (tránh ghi đè số liệu lịch sử),
    // hiện nút "Điều chỉnh số dư" để tạo giao dịch điều chỉnh.
    const balInput = $('#accBalance');
    const adjBtn = $('#accAdjustBalance');
    const balHint = $('#accBalanceHint');
    const balLabel = $('#accBalanceLabel');
    const lockBalance = !isNew && editing.accountType !== 'savings';
    if (lockBalance) {
      balInput.style.pointerEvents = 'none';
      balInput.style.opacity = '0.65';
      balLabel.textContent = 'Số dư hiện tại (chỉ xem)';
      adjBtn.style.display = 'block';
      balHint.style.display = 'block';
      adjBtn.onclick = () => this.openAdjustBalanceModal();
    } else {
      balInput.style.pointerEvents = '';
      balInput.style.opacity = '';
      adjBtn.style.display = 'none';
      balHint.style.display = 'none';
      // applyAccountTypeUI() bên dưới sẽ đặt lại label đúng theo type
    }

    // Type pills
    $$('.acc-type-pill').forEach(el => {
      el.classList.toggle('on', el.dataset.type === editing.accountType);
      // Không cho đổi type khi sửa (vì sẽ làm rối logic balance)
      el.style.opacity = isNew ? '1' : '0.5';
      el.style.pointerEvents = isNew ? 'auto' : 'none';
    });
    // Khi TẠO MỚI từ trang Tài khoản: ẩn pill 'Tiết kiệm' để dồn user
    // sang trang 'Sổ tiết kiệm' chuyên dụng (có lãi tích luỹ, đáo hạn, v.v.)
    // Khi SỬA sổ tiết kiệm cũ: vẫn hiện pill (để user biết loại — disabled).
    // Khi vào từ trang 'Sổ tiết kiệm' page sẽ tự click pill savings → vẫn hiện đúng.
    const savPill = document.querySelector('.acc-type-pill[data-type="savings"]');
    if (savPill) {
      const cameFromSavingsPage = this.state.currentTab === 'savings';
      const editingSavings = !isNew && editing.accountType === 'savings';
      savPill.style.display = (cameFromSavingsPage || editingSavings) ? '' : 'none';
      // Nếu chỉ còn 1 pill thì style flex:1 sẽ làm full-width — không sao
    }

    // Savings fields
    $('#accInterestRate').value = editing.interestRate || '';
    const termVal = editing.termMonths || 6;
    const standardTerms = [1, 3, 6, 9, 12, 18, 24, 36];
    if (standardTerms.includes(termVal)) {
      $('#accTermMonths').value = String(termVal);
      $('#accTermMonthsCustomWrap').style.display = 'none';
      $('#accTermMonthsCustom').value = '';
    } else {
      $('#accTermMonths').value = 'custom';
      $('#accTermMonthsCustomWrap').style.display = 'block';
      $('#accTermMonthsCustom').value = termVal;
    }
    $('#accStartDate').value = editing.startDate || today();
    $('#accMaturityDate').value = editing.maturityDate || '';

    this.applyAccountTypeUI();
    this.recalcMaturityHint();

    this.renderIconPicker({
      containerId: 'accIconGrid',
      currentIcon: a.icon || (editing.accountType === 'savings' ? 'emoji:💎' : 'cash'),
      allowEmoji: true,
      onPick: (icon) => { this.state.editingAcc.icon = icon; }
    });
    $('#accModal').classList.add('open');
  },

  applyAccountTypeUI() {
    const t = this.state.editingAcc?.accountType || 'payment';
    $('#accSavingsFields').style.display = t === 'savings' ? 'block' : 'none';
    $('#accBalanceLabel').textContent = t === 'savings' ? 'Số gốc gửi (VND)' : 'Số dư ban đầu (VND)';
  },

  // Tính ngày đáo hạn = startDate + termMonths
  computeMaturityDate(startDate, termMonths) {
    if (!startDate || !termMonths) return '';
    const d = new Date(startDate + 'T00:00:00');
    d.setMonth(d.getMonth() + parseInt(termMonths, 10));
    return d.toISOString().slice(0, 10);
  },

  // Đọc termMonths hiện tại từ form (xử lý 'custom')
  readTermMonths() {
    const sel = $('#accTermMonths').value;
    if (sel === 'custom') return parseInt($('#accTermMonthsCustom').value, 10) || 0;
    return parseInt(sel, 10) || 0;
  },

  // Cập nhật maturityDate input + hint dự kiến
  recalcMaturityHint() {
    const e = this.state.editingAcc;
    if (!e || e.accountType !== 'savings') return;
    const start = $('#accStartDate').value || today();
    const term = this.readTermMonths();
    const auto = this.computeMaturityDate(start, term);
    // Auto-fill maturityDate nếu chưa có hoặc match với auto cũ
    const cur = $('#accMaturityDate').value;
    if (!cur || cur === e.maturityDate) {
      $('#accMaturityDate').value = auto;
    }
    // Hint: lãi dự kiến + ngày đáo hạn
    const rate = parseFloat($('#accInterestRate').value) || 0;
    const principal = readAmount($('#accBalance'));
    const interest = Math.round(principal * (rate / 100) * (term / 12));
    const due = $('#accMaturityDate').value || auto;
    const hint = $('#accMaturityHint');
    if (principal > 0 && rate > 0 && term > 0) {
      hint.innerHTML = `📊 Lãi dự kiến: <strong>${fmt(interest)} đ</strong> · Tổng nhận khi đáo hạn: <strong>${fmt(principal + interest)} đ</strong> (ngày ${this.formatDate(due)})`;
    } else {
      hint.innerHTML = `📅 Ngày đáo hạn dự kiến: <strong>${this.formatDate(due)}</strong>`;
    }
  },

  async saveAcc() {
    const a = this.state.editingAcc;
    a.name = $('#accName').value.trim();
    a.bookId = a.bookId || this.state.currentBookId;
    if (!a.name) { QLT_UI.toast('Nhập tên tài khoản', { type: 'error' }); return; }

    const isNew = !a.id;
    // Chỉ đọc balance từ input khi: (a) tạo MỚI, hoặc (b) ví tiết kiệm — vì
    // savings không có giao dịch điều chỉnh, gốc gửi cố định lúc tạo. Với ví
    // thanh toán đang sửa, GIỮ NGUYÊN balance hiện tại để tránh ghi đè data.
    if (isNew || a.accountType === 'savings') {
      a.balance = readAmount($('#accBalance'));
    }

    if (a.accountType === 'savings') {
      a.interestRate = parseFloat($('#accInterestRate').value) || 0;
      a.termMonths = this.readTermMonths();
      a.startDate = $('#accStartDate').value || today();
      a.maturityDate = $('#accMaturityDate').value || this.computeMaturityDate(a.startDate, a.termMonths);
      if (a.balance <= 0) { QLT_UI.toast('Vui lòng nhập số gốc gửi', { type: 'error' }); return; }
      if (!a.maturityDate) { QLT_UI.toast('Vui lòng đặt ngày đáo hạn', { type: 'error' }); return; }
    }

    await window.QLT_Store.put('accounts', a);
    await this.reload();

    // Schedule notif đáo hạn (cho savings)
    if (a.accountType === 'savings' && a.maturityDate) {
      try { await this.scheduleMaturityNotif(a); } catch (_) {}
    }

    $('#accModal').classList.remove('open');
    this.renderAccounts();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
  },

  async deleteAcc() {
    const a = this.state.editingAcc;
    if (!a.id) return;
    const used = this.state.transactions.filter(t => t.accountId === a.id || t.toAccountId === a.id).length;
    if (used > 0) {
      await QLT_UI.alert(`Không xoá được, có ${used} giao dịch đang dùng tài khoản này`, { title: 'Không thể xoá' });
      return;
    }
    if (!await QLT_UI.confirm('Xoá tài khoản?', { okLabel: 'Xoá', danger: true })) return;
    // Cancel notif nếu có
    if (a.accountType === 'savings' && window.Capacitor?.Plugins?.LocalNotifications) {
      try {
        const idNum = Math.abs(this.hashCode('savings_' + a.id)) % 2000000;
        await window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: idNum }] });
      } catch (_) {}
    }
    await window.QLT_Store.del('accounts', a.id);
    await this.reload();
    $('#accModal').classList.remove('open');
    this.renderAccounts();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
  },

  // Notification: nhắc 3 ngày trước ngày đáo hạn (9h sáng)
  async scheduleMaturityNotif(acc) {
    if (!window.Capacitor?.Plugins?.LocalNotifications) return;
    const LN = window.Capacitor.Plugins.LocalNotifications;
    try {
      await LN.requestPermissions();
      const idNum = Math.abs(this.hashCode('savings_' + acc.id)) % 2000000;
      try { await LN.cancel({ notifications: [{ id: idNum }] }); } catch (_) {}

      const due = new Date(acc.maturityDate + 'T09:00:00');
      const notifAt = new Date(due); notifAt.setDate(notifAt.getDate() - 3);
      if (notifAt.getTime() < Date.now()) return;

      const interest = Math.round((acc.balance || 0) * ((acc.interestRate || 0) / 100) * ((acc.termMonths || 0) / 12));
      await LN.schedule({
        notifications: [{
          id: idNum,
          title: `📅 Sổ TK "${acc.name}" sắp đáo hạn`,
          body: `Còn 3 ngày — gốc ${fmt(acc.balance)} đ + lãi dự kiến ${fmt(interest)} đ`,
          schedule: { at: notifAt },
          sound: 'default'
        }]
      });
    } catch (e) { console.warn('Maturity notif lỗi:', e); }
  },

  // ============ ĐÁO HẠN SỔ TIẾT KIỆM ============
  async openMaturityModal() {
    const acc = this.state.editingAcc;
    if (!acc?.id || acc.accountType !== 'savings') return;

    const interest = this.savingsExpectedInterest(acc);
    const accrued = this.savingsAccrued(acc);

    $('#maturityInfo').innerHTML = `
      <div><strong>${this.escapeHtml(acc.name)}</strong></div>
      <div style="color:var(--text2)">Gốc: <strong>${fmt(acc.balance)} đ</strong> · Lãi suất: ${acc.interestRate}%/năm · Kỳ hạn: ${acc.termMonths} tháng</div>
      <div style="color:var(--text2)">Ngày gửi: ${this.formatDate(acc.startDate)} → Đáo hạn: ${this.formatDate(acc.maturityDate)}</div>
      <div style="color:var(--accent);margin-top:6px">Lãi đến hạn: <strong>${fmt(interest)} đ</strong> · Lãi tích luỹ tới hôm nay (ước tính): <strong>${fmt(accrued)} đ</strong></div>
    `;

    $('#maturityInterest').value = fmt(interest);

    const payAccs = this.state.accounts.filter(x => this.isPayment(x));
    $('#maturityToAccount').innerHTML = payAccs.map(a =>
      `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`
    ).join('');

    const incCats = this.state.categories.filter(c => c.type === 'income');
    $('#maturityCategory').innerHTML = incCats.map(c =>
      `<option value="${c.id}" ${c.name === 'Đầu tư' ? 'selected' : ''}>${this.escapeHtml(c.name)}</option>`
    ).join('');

    $('#maturityDate').value = today();

    // Default mode: cashout
    document.querySelectorAll('input[name="maturityMode"]').forEach(r => {
      r.checked = r.value === 'cashout';
      r.onchange = () => this._updateMaturityHint(acc);
    });
    this._updateMaturityHint(acc);

    $('#maturityModal').classList.add('open');
  },

  _updateMaturityHint(acc) {
    const mode = document.querySelector('input[name="maturityMode"]:checked')?.value || 'cashout';
    const principal = acc.balance || 0;
    const interest = readAmount($('#maturityInterest'));
    const hint = $('#maturityHint');
    const toWrap = $('#maturityToAccountWrap');

    if (mode === 'cashout') {
      toWrap.style.display = 'block';
      $('#maturityToAccount').previousElementSibling.textContent = 'Ví nhận tiền (gốc + lãi)';
      hint.innerHTML = `✅ Sổ này sẽ ĐÓNG. Tổng <strong>${fmt(principal + interest)} đ</strong> chuyển vào ví đã chọn (1 transfer + 1 income lãi).`;
    } else if (mode === 'renew-compound') {
      toWrap.style.display = 'none';
      hint.innerHTML = `🔁 Sổ HIỆN TẠI sẽ đóng. Tự tạo SỔ MỚI cùng tên/lãi suất/kỳ hạn với gốc = <strong>${fmt(principal + interest)} đ</strong> (gốc + lãi). Lãi cũng được ghi nhận thu nhập trong sổ chi tiêu.`;
    } else if (mode === 'renew-simple') {
      toWrap.style.display = 'block';
      $('#maturityToAccount').previousElementSibling.textContent = 'Ví nhận lãi';
      hint.innerHTML = `🔂 Sổ HIỆN TẠI sẽ đóng. Tạo SỔ MỚI cùng tên với gốc = <strong>${fmt(principal)} đ</strong>. Lãi <strong>${fmt(interest)} đ</strong> chuyển vào ví đã chọn (1 income).`;
    }
  },

  async confirmMaturity() {
    const acc = this.state.editingAcc;
    if (!acc?.id) return;
    const mode = document.querySelector('input[name="maturityMode"]:checked')?.value || 'cashout';
    const interest = readAmount($('#maturityInterest'));
    const toAccId = $('#maturityToAccount').value;
    const catId = $('#maturityCategory').value;
    const date = $('#maturityDate').value || today();

    if (interest < 0) { QLT_UI.toast('Lãi không hợp lệ', { type: 'error' }); return; }
    if (mode !== 'renew-compound' && !toAccId) { QLT_UI.toast('Chọn ví nhận tiền', { type: 'error' }); return; }
    if (!catId) { QLT_UI.toast('Chọn danh mục thu nhập cho lãi', { type: 'error' }); return; }

    const principal = acc.balance || 0;

    // Common: cancel reminder của sổ cũ
    if (window.Capacitor?.Plugins?.LocalNotifications) {
      try {
        const idNum = Math.abs(this.hashCode('savings_' + acc.id)) % 2000000;
        await window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: idNum }] });
      } catch (_) {}
    }

    if (mode === 'cashout') {
      // Transfer gốc → ví đích
      const txTransfer = {
        type: 'transfer', amount: principal, date,
        accountId: acc.id, toAccountId: toAccId, categoryId: null,
        note: `Đáo hạn sổ ${acc.name} — rút gốc`,
        bookId: acc.bookId || this.state.currentBookId
      };
      await this.applyBalanceDelta(txTransfer, +1);
      await window.QLT_Store.put('transactions', txTransfer);
      // Lãi → income
      if (interest > 0) {
        const txIncome = {
          type: 'income', amount: interest, date, accountId: toAccId,
          categoryId: catId, note: `Lãi sổ ${acc.name}`,
          bookId: acc.bookId || this.state.currentBookId
        };
        await this.applyBalanceDelta(txIncome, +1);
        await window.QLT_Store.put('transactions', txIncome);
      }
      // Đóng sổ (giữ lại để xem lịch sử)
      acc.savingsClosed = true;
      acc.savingsClosedDate = date;
      acc.savingsClosedReason = 'matured';
      acc.savingsActualInterest = interest;
      acc.balance = 0;
      await window.QLT_Store.put('accounts', acc);
    }
    else if (mode === 'renew-compound' || mode === 'renew-simple') {
      const newPrincipal = mode === 'renew-compound' ? principal + interest : principal;

      // Lãi: nếu renew-simple → chuyển ra ví; nếu renew-compound → cộng vào sổ mới (vẫn ghi nhận income để track)
      if (interest > 0) {
        if (mode === 'renew-simple') {
          // Transfer lãi từ savings cũ → ví đích (lấy từ balance hiện tại)
          // Đầu tiên giảm balance sổ cũ (rút lãi ra)
          const txInterestTransfer = {
            type: 'transfer', amount: interest, date,
            accountId: acc.id, toAccountId: toAccId, categoryId: null,
            note: `Lãi đáo hạn sổ ${acc.name}`,
            bookId: acc.bookId || this.state.currentBookId
          };
          // Note: trong sổ tiền lãi không "tồn tại" — bank chỉ ghi nhận. Để minh bạch, ta TĂNG balance sổ +interest tạm rồi transfer ra (net = ban đầu)
          // Đơn giản hơn: tạo income tx vào ví đích trực tiếp, KHÔNG transfer
          const txIncome = {
            type: 'income', amount: interest, date, accountId: toAccId,
            categoryId: catId, note: `Lãi sổ ${acc.name}`,
            bookId: acc.bookId || this.state.currentBookId
          };
          await this.applyBalanceDelta(txIncome, +1);
          await window.QLT_Store.put('transactions', txIncome);
        } else {
          // renew-compound: lãi cộng vào sổ mới, vẫn ghi nhận income (để biểu đồ đẹp)
          // Tx "ảo": income đi vào ví ảo, sau đó "transfer" qua sổ mới — nhưng để gọn,
          // chỉ ghi nhận income vào ví thanh toán đầu tiên (proxy)
          const proxyAcc = this.state.accounts.find(a => this.isPayment(a));
          if (proxyAcc && catId) {
            // Tạm bỏ qua việc tạo income tx khi compound — ghi note vào sổ mới
            // (Tránh làm tăng "thu nhập tháng" ảo cho user)
          }
        }
      }

      // Đóng sổ cũ
      acc.savingsClosed = true;
      acc.savingsClosedDate = date;
      acc.savingsClosedReason = 'renewed';
      acc.savingsActualInterest = interest;
      acc.balance = 0;
      await window.QLT_Store.put('accounts', acc);

      // Tạo sổ mới
      const oldStart = new Date(acc.maturityDate + 'T00:00:00');
      const newStart = oldStart.toISOString().slice(0, 10);
      const newMaturity = this.computeMaturityDate(newStart, acc.termMonths || 6);
      const newAcc = {
        name: acc.name,
        icon: acc.icon,
        balance: newPrincipal,
        currency: acc.currency || 'VND',
        bookId: acc.bookId,
        accountType: 'savings',
        interestRate: acc.interestRate,
        termMonths: acc.termMonths,
        startDate: newStart,
        maturityDate: newMaturity,
        savingsRenewedFromId: acc.id,
        savingsRenewCount: (acc.savingsRenewCount || 0) + 1
      };
      const savedNew = await window.QLT_Store.put('accounts', newAcc);
      try { await this.scheduleMaturityNotif(savedNew); } catch (_) {}
    }

    await this.reload();
    $('#maturityModal').classList.remove('open');
    $('#accModal').classList.remove('open');
    this.renderAccounts();
    if (this.state.currentTab === 'home') this.renderHome();
    if (this.state.currentTab === 'savings') this.renderSavings();
    this.autoSync();
    if (mode === 'cashout') {
      QLT_UI.toast(`Đã đóng sổ — nhận ${fmt(principal + interest)} đ`, { type: 'success' });
    } else {
      QLT_UI.toast(`Đã gia hạn — sổ mới mở${interest > 0 && mode === 'renew-simple' ? `, lãi ${fmt(interest)} đ chuyển vào ví` : ''}`, { type: 'success' });
    }
  },

  // ====== RÚT TRƯỚC HẠN ======
  async openWithdrawEarlyModal(accId) {
    const acc = this.state.accounts.find(a => a.id === accId);
    if (!acc || !this.isActiveSavings(acc)) return;
    this.state.editingWithdrawAcc = acc;

    const accrued = this.savingsAccrued(acc);
    const expected = this.savingsExpectedInterest(acc);
    const principal = acc.balance || 0;

    $('#withdrawInfo').innerHTML = `
      <div><strong>${this.escapeHtml(acc.name)}</strong></div>
      <div>Gốc: <strong>${fmt(principal)} đ</strong> · ${acc.interestRate}%/năm · ${acc.termMonths} tháng</div>
      <div>Đáo hạn: ${this.formatDate(acc.maturityDate)}</div>
      <div style="color:var(--accent);margin-top:6px">Lãi tích luỹ ~ <strong>${fmt(accrued)} đ</strong> (nếu rút đúng kỳ sẽ là ${fmt(expected)} đ)</div>
      <div style="color:#a06f10;font-size:12px;margin-top:6px">⚠️ Rút trước hạn ngân hàng thường chỉ trả lãi không kỳ hạn (~0.1-0.5%/năm). Sửa số tiền nhận lại cho đúng số bạn được nhận thực tế.</div>
    `;

    // Mặc định = gốc + lãi tích luỹ
    $('#withdrawAmount').value = fmt(principal + accrued);
    $('#withdrawDate').value = today();

    const payAccs = this.state.accounts.filter(a => this.isPayment(a));
    $('#withdrawToAccount').innerHTML = payAccs.map(a =>
      `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`
    ).join('');

    const incCats = this.state.categories.filter(c => c.type === 'income');
    $('#withdrawCategory').innerHTML = incCats.map(c =>
      `<option value="${c.id}" ${c.name === 'Đầu tư' ? 'selected' : ''}>${this.escapeHtml(c.name)}</option>`
    ).join('');

    $('#withdrawModal').classList.add('open');
  },

  async confirmWithdrawEarly() {
    const acc = this.state.editingWithdrawAcc;
    if (!acc?.id) return;
    const totalReceive = readAmount($('#withdrawAmount'));
    const date = $('#withdrawDate').value || today();
    const toAccId = $('#withdrawToAccount').value;
    const catId = $('#withdrawCategory').value;

    if (totalReceive <= 0) { QLT_UI.toast('Vui lòng nhập số tiền nhận', { type: 'error' }); return; }
    if (!toAccId) { QLT_UI.toast('Chọn ví nhận tiền', { type: 'error' }); return; }

    const principal = acc.balance || 0;
    const interest = Math.max(0, totalReceive - principal);
    const lossVsPrincipal = Math.max(0, principal - totalReceive); // mất phần gốc (rất hiếm)

    // 1) Transfer gốc (hoặc số nhận nếu < gốc) → ví đích
    const transferAmount = Math.min(principal, totalReceive);
    const txTransfer = {
      type: 'transfer', amount: transferAmount, date,
      accountId: acc.id, toAccountId: toAccId, categoryId: null,
      note: `Rút trước hạn sổ ${acc.name}`,
      bookId: acc.bookId || this.state.currentBookId
    };
    await this.applyBalanceDelta(txTransfer, +1);
    await window.QLT_Store.put('transactions', txTransfer);

    // 2) Phần lãi (nếu có) → income vào ví đích
    if (interest > 0 && catId) {
      const txIncome = {
        type: 'income', amount: interest, date, accountId: toAccId,
        categoryId: catId, note: `Lãi sổ ${acc.name} (rút trước hạn)`,
        bookId: acc.bookId || this.state.currentBookId
      };
      await this.applyBalanceDelta(txIncome, +1);
      await window.QLT_Store.put('transactions', txIncome);
    }

    // 3) Nếu nhận < gốc (mất phần gốc do phạt), set balance còn lại
    // Trong thực tế hiếm, nhưng vẫn xử lý: balance sổ = lossVsPrincipal sẽ chuyển 0
    // Nhưng applyBalanceDelta đã trừ transferAmount khỏi balance nên còn dư = principal - transferAmount = lossVsPrincipal
    // Ta cần đặt balance = 0 để đóng sổ. Nếu lossVsPrincipal > 0, tạo expense để cân:
    if (lossVsPrincipal > 0) {
      const txLoss = {
        type: 'expense', amount: lossVsPrincipal, date,
        accountId: acc.id, // trừ thêm từ sổ (nhưng sổ sẽ đóng nên không sao)
        categoryId: null,
        note: `Phạt rút trước hạn sổ ${acc.name}`,
        bookId: acc.bookId || this.state.currentBookId
      };
      await this.applyBalanceDelta(txLoss, +1);
      await window.QLT_Store.put('transactions', txLoss);
    }

    // 4) Đóng sổ
    if (window.Capacitor?.Plugins?.LocalNotifications) {
      try {
        const idNum = Math.abs(this.hashCode('savings_' + acc.id)) % 2000000;
        await window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: idNum }] });
      } catch (_) {}
    }
    acc.savingsClosed = true;
    acc.savingsClosedDate = date;
    acc.savingsClosedReason = 'early-withdraw';
    acc.savingsActualInterest = interest;
    acc.balance = 0;
    await window.QLT_Store.put('accounts', acc);

    await this.reload();
    $('#withdrawModal').classList.remove('open');
    if (this.state.currentTab === 'savings') this.renderSavings();
    if (this.state.currentTab === 'home') this.renderHome();
    if (this.state.currentTab === 'accounts') this.renderAccounts();
    this.autoSync();
    QLT_UI.toast(`Đã rút trước hạn — nhận ${fmt(totalReceive)} đ`, { type: 'success' });
  },

  // ====== TRANG SỔ TIẾT KIỆM ======
  renderSavings() {
    if (!this.state.savingsTab) this.state.savingsTab = 'active';
    document.querySelectorAll('.savings-tab').forEach(el => {
      el.classList.toggle('on', el.dataset.status === this.state.savingsTab);
      el.onclick = () => {
        this.state.savingsTab = el.dataset.status;
        this.renderSavings();
      };
    });

    const all = this.state.accounts.filter(a => this.isSavings(a));
    const active = all.filter(a => !a.savingsClosed)
      .sort((a, b) => (a.maturityDate || '').localeCompare(b.maturityDate || ''));
    const closed = all.filter(a => a.savingsClosed)
      .sort((a, b) => (b.savingsClosedDate || '').localeCompare(a.savingsClosedDate || ''));

    const list = this.state.savingsTab === 'active' ? active : closed;

    // Summary header
    const summaryEl = $('#savingsSummary');
    if (this.state.savingsTab === 'active') {
      const totalPrincipal = active.reduce((s, a) => s + (a.balance || 0), 0);
      const totalAccrued = active.reduce((s, a) => s + this.savingsAccrued(a), 0);
      const totalExpected = active.reduce((s, a) => s + this.savingsExpectedInterest(a), 0);
      summaryEl.innerHTML = `
        <div class="savings-summary-lbl">Tổng đang gửi (${active.length} sổ)</div>
        <div class="savings-summary-val">${fmt(totalPrincipal)} đ</div>
        <div class="savings-summary-row">
          <div class="savings-summary-cell">
            <div class="savings-summary-cell-lbl">Lãi tích luỹ</div>
            <div class="savings-summary-cell-val">${fmt(totalAccrued)} đ</div>
          </div>
          <div class="savings-summary-cell">
            <div class="savings-summary-cell-lbl">Lãi đến hạn</div>
            <div class="savings-summary-cell-val">${fmt(totalExpected)} đ</div>
          </div>
        </div>
      `;
    } else {
      const totalReceived = closed.reduce((s, a) => s + (a.savingsActualInterest || 0), 0);
      summaryEl.innerHTML = `
        <div class="savings-summary-lbl">Đã đóng (${closed.length} sổ)</div>
        <div class="savings-summary-val">+${fmt(totalReceived)} đ</div>
        <div style="font-size:11px;opacity:.85;margin-top:4px">Tổng lãi đã nhận từ các sổ đã đóng</div>
      `;
    }

    // List
    const wrap = $('#savingsList');
    const empty = $('#savingsEmpty');
    if (list.length === 0) {
      wrap.innerHTML = '';
      empty.style.display = 'block';
      empty.innerHTML = this.state.savingsTab === 'active'
        ? '<div style="font-size:42px;margin-bottom:8px">💎</div><div style="font-weight:700">Chưa có sổ nào đang gửi</div><div style="font-size:13px;color:var(--text2);margin-top:6px">Bấm <strong>+</strong> để mở sổ tiết kiệm đầu tiên.</div>'
        : '<div style="font-size:42px;margin-bottom:8px">📂</div><div style="font-weight:700">Chưa có sổ nào đã đóng</div><div style="font-size:13px;color:var(--text2);margin-top:6px">Sổ đã đáo hạn / rút trước hạn sẽ lưu ở đây.</div>';
    } else {
      empty.style.display = 'none';
      wrap.innerHTML = list.map(a =>
        this.state.savingsTab === 'active' ? this.renderActiveSavingsCard(a) : this.renderClosedSavingsCard(a)
      ).join('');

      wrap.querySelectorAll('[data-acc-edit]').forEach(el => {
        el.onclick = (e) => { e.stopPropagation(); this.openAccModal(el.dataset.accEdit); };
      });
      wrap.querySelectorAll('[data-acc-mature]').forEach(el => {
        el.onclick = (e) => {
          e.stopPropagation();
          this.state.editingAcc = this.state.accounts.find(x => x.id === el.dataset.accMature);
          this.openMaturityModal();
        };
      });
      wrap.querySelectorAll('[data-acc-withdraw]').forEach(el => {
        el.onclick = (e) => { e.stopPropagation(); this.openWithdrawEarlyModal(el.dataset.accWithdraw); };
      });
    }

    // FAB
    $('#savingsAddFab').onclick = () => {
      // Mở modal tạo account với accountType = savings
      this.state.editingAcc = {
        id: null, name: '', icon: 'emoji:💎', balance: 0, currency: 'VND',
        bookId: this.state.currentBookId, accountType: 'savings',
        interestRate: 0, termMonths: 6, startDate: today(), maturityDate: ''
      };
      this.openAccModal(null);
      // Sau openAccModal, chuyển sang savings type
      setTimeout(() => {
        const pill = document.querySelector('.acc-type-pill[data-type="savings"]');
        if (pill && !pill.classList.contains('on')) pill.click();
      }, 50);
    };
  },

  renderActiveSavingsCard(a) {
    const today_ = new Date(today() + 'T00:00:00').getTime();
    const mat = a.maturityDate ? new Date(a.maturityDate + 'T00:00:00').getTime() : null;
    const daysLeft = mat ? Math.ceil((mat - today_) / 86400000) : null;
    const accrued = this.savingsAccrued(a);
    const expected = this.savingsExpectedInterest(a);
    const progress = this.savingsTimeProgress(a);

    let badgeHtml = '<span class="savings-card-badge">Đang gửi</span>';
    let cardClass = '';
    if (daysLeft != null) {
      if (daysLeft < 0) { badgeHtml = '<span class="savings-card-badge alert">Quá hạn ' + (-daysLeft) + 'd</span>'; cardClass = 'urgent'; }
      else if (daysLeft === 0) { badgeHtml = '<span class="savings-card-badge alert">Đáo hạn HÔM NAY</span>'; cardClass = 'urgent'; }
      else if (daysLeft <= 7) { badgeHtml = '<span class="savings-card-badge warn">Còn ' + daysLeft + ' ngày</span>'; }
      else if (daysLeft <= 30) { badgeHtml = '<span class="savings-card-badge warn">Còn ' + daysLeft + ' ngày</span>'; }
    }

    const renewBadge = (a.savingsRenewCount || 0) > 0
      ? `<span style="font-size:10px;color:var(--text3);margin-left:6px">🔁 GH lần ${a.savingsRenewCount}</span>` : '';

    const icon = (a.icon || '').startsWith('emoji:') ? a.icon.slice(6) : '💎';

    return `
      <div class="savings-card ${cardClass}">
        <div class="savings-card-head">
          <div class="savings-card-icon">${icon}</div>
          <div class="savings-card-name">${this.escapeHtml(a.name)}${renewBadge}</div>
          ${badgeHtml}
        </div>
        <div class="savings-stats">
          <div class="savings-stat">
            <div class="savings-stat-lbl">Gốc gửi</div>
            <div class="savings-stat-val">${fmt(a.balance)} đ</div>
          </div>
          <div class="savings-stat">
            <div class="savings-stat-lbl">Lãi tích luỹ</div>
            <div class="savings-stat-val pos">+${fmt(accrued)} đ</div>
          </div>
          <div class="savings-stat">
            <div class="savings-stat-lbl">Lãi suất</div>
            <div class="savings-stat-val">${a.interestRate || 0}%/năm</div>
          </div>
          <div class="savings-stat">
            <div class="savings-stat-lbl">Lãi đến hạn</div>
            <div class="savings-stat-val pos">${fmt(expected)} đ</div>
          </div>
        </div>
        <div class="savings-progress">
          <div class="savings-progress-fill ${cardClass === 'urgent' ? 'urgent' : ''}" style="width:${progress.toFixed(1)}%"></div>
        </div>
        <div class="savings-progress-meta">
          <span>${this.formatDate(a.startDate)}</span>
          <span>${progress.toFixed(0)}%</span>
          <span>${this.formatDate(a.maturityDate)}</span>
        </div>
        <div class="savings-card-actions">
          <button class="btn btn-secondary" data-acc-edit="${a.id}">✎ Sửa</button>
          <button class="btn btn-secondary" data-acc-withdraw="${a.id}" style="color:#cc7a4f;border-color:#cc7a4f">💸 Rút sớm</button>
          <button class="btn btn-primary" data-acc-mature="${a.id}">📅 Đáo hạn</button>
        </div>
      </div>
    `;
  },

  renderClosedSavingsCard(a) {
    const reasonLabels = {
      'matured': '✅ Đáo hạn',
      'renewed': '🔁 Đã gia hạn (sổ mới)',
      'early-withdraw': '💸 Rút trước hạn'
    };
    const reasonClass = a.savingsClosedReason === 'early-withdraw' ? 'warn' : '';
    const icon = (a.icon || '').startsWith('emoji:') ? a.icon.slice(6) : '💎';

    return `
      <div class="savings-card closed">
        <div class="savings-card-head">
          <div class="savings-card-icon" style="background:var(--surface2);opacity:.8">${icon}</div>
          <div class="savings-card-name">${this.escapeHtml(a.name)}</div>
          <span class="savings-card-badge closed ${reasonClass}">${reasonLabels[a.savingsClosedReason] || 'Đã đóng'}</span>
        </div>
        <div class="savings-stats">
          <div class="savings-stat">
            <div class="savings-stat-lbl">Đóng ngày</div>
            <div class="savings-stat-val">${this.formatDate(a.savingsClosedDate)}</div>
          </div>
          <div class="savings-stat">
            <div class="savings-stat-lbl">Lãi đã nhận</div>
            <div class="savings-stat-val pos">+${fmt(a.savingsActualInterest || 0)} đ</div>
          </div>
          <div class="savings-stat">
            <div class="savings-stat-lbl">Lãi suất</div>
            <div class="savings-stat-val">${a.interestRate || 0}%/năm</div>
          </div>
          <div class="savings-stat">
            <div class="savings-stat-lbl">Kỳ hạn</div>
            <div class="savings-stat-val">${a.termMonths || 0} tháng</div>
          </div>
        </div>
      </div>
    `;
  },

  // ============ MODAL: REMINDER ============
  openReminderModal(id) {
    const isNew = !id;
    let r;
    if (isNew) {
      r = {
        id: null, name: '', type: 'expense', frequency: 'monthly',
        startDate: today(), time: '09:00', endDate: '',
        accountId: this.state.accounts[0]?.id || null,
        categoryId: null, amount: 0, note: '', autoAdd: false,
        bookId: this.state.currentBookId
      };
    } else {
      r = this.state.reminders.find(x => x.id === id);
      if (!r) return;
    }
    this.state.editingReminder = { ...r };
    $('#remName').value = r.name;
    $('#remType').value = r.type;
    $('#remFreq').value = r.frequency;
    $('#remStart').value = r.startDate;
    $('#remTime').value = r.time;
    $('#remEnd').value = r.endDate || '';
    $('#remAuto').checked = !!r.autoAdd;
    $('#remAmount').value = fmtAmount(r.amount);
    $('#remNote').value = r.note || '';
    $('#remTitle').textContent = isNew ? 'Tạo lời nhắc' : 'Sửa lời nhắc';
    $('#remDelete').style.display = isNew ? 'none' : 'block';

    const renderRemCat = () => {
      const cats = this.state.categories.filter(c => c.type === $('#remType').value);
      $('#remCatList').innerHTML = cats.map(c => `
        <div class="picker-item ${c.id === r.categoryId ? 'on' : ''}" data-cat="${c.id}">
          <span class="picker-icon" style="color:${c.color}">${svgIcon(c.icon)}</span>
          <span>${this.escapeHtml(c.name)}</span>
        </div>
      `).join('');
      $$('#remCatList .picker-item').forEach(el => {
        el.onclick = () => {
          $$('#remCatList .picker-item').forEach(x => x.classList.remove('on'));
          el.classList.add('on');
          this.state.editingReminder.categoryId = el.dataset.cat;
        };
      });
    };
    renderRemCat();
    $('#remType').onchange = () => renderRemCat();

    $('#remAccountList').innerHTML = this.state.accounts.map(a => `
      <div class="picker-item ${a.id === r.accountId ? 'on' : ''}" data-acc="${a.id}">
        <span class="picker-icon" style="color:#2d6a4f">${svgIcon(a.icon || 'cash')}</span>
        <span>${this.escapeHtml(a.name)}</span>
      </div>
    `).join('');
    $$('#remAccountList .picker-item').forEach(el => {
      el.onclick = () => {
        $$('#remAccountList .picker-item').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.editingReminder.accountId = el.dataset.acc;
      };
    });

    $('#remModal').classList.add('open');
  },

  async saveReminder() {
    const r = this.state.editingReminder;
    r.name = $('#remName').value.trim();
    r.type = $('#remType').value;
    r.frequency = $('#remFreq').value;
    r.startDate = $('#remStart').value;
    r.time = $('#remTime').value;
    r.endDate = $('#remEnd').value || '';
    r.autoAdd = $('#remAuto').checked;
    r.amount = readAmount($('#remAmount'));
    r.note = $('#remNote').value;
    r.bookId = r.bookId || this.state.currentBookId;
    if (!r.name) { QLT_UI.toast('Nhập tên lời nhắc', { type: 'error' }); return; }
    if (!r.categoryId) { QLT_UI.toast('Chọn danh mục', { type: 'error' }); return; }
    if (!r.accountId) { QLT_UI.toast('Chọn tài khoản', { type: 'error' }); return; }
    await window.QLT_Store.put('reminders', r);
    await this.reload();
    await this.scheduleReminderNotif(r);
    $('#remModal').classList.remove('open');
    this.renderReminders();
    this.autoSync();
  },

  async deleteReminder() {
    const r = this.state.editingReminder;
    if (!r.id) return;
    if (!await QLT_UI.confirm('Xoá lời nhắc?', { okLabel: 'Xoá', danger: true })) return;
    await window.QLT_Store.del('reminders', r.id);
    if (window.Capacitor?.Plugins?.LocalNotifications) {
      try {
        const idNum = Math.abs(this.hashCode(r.id)) % 2000000;
        await window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: idNum }] });
      } catch (_) {}
    }
    await this.reload();
    $('#remModal').classList.remove('open');
    this.renderReminders();
    this.autoSync();
  },

  hashCode(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return h;
  },

  async scheduleReminderNotif(r) {
    if (!window.Capacitor?.Plugins?.LocalNotifications) return;
    const LN = window.Capacitor.Plugins.LocalNotifications;
    try {
      await LN.requestPermissions();
      const idNum = Math.abs(this.hashCode(r.id)) % 2000000;
      const [hh, mm] = (r.time || '09:00').split(':').map(Number);
      const schedule = { on: { hour: hh, minute: mm } };
      if (r.frequency === 'daily') schedule.every = 'day';
      else if (r.frequency === 'weekly') schedule.every = 'week';
      else if (r.frequency === 'monthly') schedule.every = 'month';
      else if (r.frequency === 'yearly') schedule.every = 'year';

      await LN.schedule({
        notifications: [{
          id: idNum,
          title: 'Quản Lý Tiền — ' + r.name,
          body: `${r.type === 'income' ? 'Thu nhập' : 'Chi phí'} ${fmt(r.amount)} đ${r.note ? ' · ' + r.note : ''}`,
          schedule,
          sound: 'default'
        }]
      });
    } catch (e) { console.warn('Schedule lỗi:', e); }
  },

  // ============ AUTH / SYNC ============
  async doLogin() {
    try {
      await window.QLT_Auth.signIn();
      QLT_UI.toast('Đăng nhập thành công! Đang tải dữ liệu...', { type: 'success' });
    } catch (e) {
      QLT_UI.alert('Đăng nhập lỗi: ' + e.message + '\n\nĐã cấu hình GOOGLE_CLIENT_ID trong www/js/config.js chưa?', { title: 'Lỗi đăng nhập' });
    }
  },

  async doLogout() {
    if (!await QLT_UI.confirm('Đăng xuất? Dữ liệu vẫn được lưu trên Drive.', { okLabel: 'Đăng xuất' })) return;
    window.QLT_Auth.signOut();
  },

  async doSync() {
    if (!window.QLT_Auth.user) { QLT_UI.toast('Đăng nhập trước', { type: 'error' }); return; }
    try {
      await window.QLT_Sync.smartSync();
      await this.reload();
      this.switchTab(this.state.currentTab);
      QLT_UI.toast('Đồng bộ thành công', { type: 'success' });
    } catch (e) {
      QLT_UI.alert('Đồng bộ lỗi: ' + e.message, { title: 'Lỗi đồng bộ' });
    }
  },

  _syncTimer: null,
  autoSync() {
    if (!window.QLT_Auth.user) return;
    clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(async () => {
      try { await window.QLT_Sync.pushNow(); } catch (e) { console.warn('Auto-sync lỗi:', e); }
    }, 3000);
  },

  async renderStorageInfo() {
    const wrap = $('#setStorageInfo');
    if (!wrap) return;
    try {
      const allTxs = await window.QLT_Store.getAll('transactions');
      const allBooks = await window.QLT_Store.getAll('books');
      const allAccs = await window.QLT_Store.getAll('accounts');
      let photoCount = 0, photoBytes = 0;
      for (const t of allTxs) {
        const photos = this.getTxPhotos(t);
        photoCount += photos.length;
        for (const p of photos) photoBytes += (typeof p === 'string' ? p.length : 0);
      }
      const photoMB = (photoBytes / 1024 / 1024).toFixed(1);
      // Estimate IndexedDB size — sum of JSON.stringify length
      let totalBytes = 0;
      for (const s of ['accounts', 'categories', 'transactions', 'reminders', 'books', 'loans', 'budgets', 'goals', 'fuelLogs', 'maintenanceLogs', 'recurringRules']) {
        const arr = await window.QLT_Store.getAll(s);
        totalBytes += JSON.stringify(arr).length;
      }
      const totalMB = (totalBytes / 1024 / 1024).toFixed(2);
      wrap.innerHTML = `
        <div>📊 <strong style="color:var(--text)">${allTxs.length}</strong> giao dịch · <strong style="color:var(--text)">${allAccs.length}</strong> tài khoản · <strong style="color:var(--text)">${allBooks.length}</strong> sổ</div>
        <div>📷 <strong style="color:var(--text)">${photoCount}</strong> ảnh minh chứng (~${photoMB} MB)</div>
        <div>💾 Tổng dữ liệu: ~<strong style="color:var(--text)">${totalMB} MB</strong> trên thiết bị</div>
      `;
    } catch (e) {
      wrap.innerHTML = '<div style="color:var(--text3)">Không đọc được thông tin dữ liệu</div>';
    }
  },

  async doExport() {
    const data = await window.QLT_Store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quanlytien-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  doImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!await QLT_UI.confirm('Ghi đè toàn bộ dữ liệu hiện tại?', { okLabel: 'Ghi đè', danger: true })) return;
        await window.QLT_Store.importAll(data, 'replace');
        await this.reload();
        this.switchTab(this.state.currentTab);
        QLT_UI.toast('Nhập dữ liệu thành công', { type: 'success' });
      } catch (err) {
        QLT_UI.alert('File không hợp lệ: ' + err.message, { title: 'Lỗi' });
      }
    };
    input.click();
  },

  // ====== TX FILTER NÂNG CAO ======
  _computeDateRange(f) {
    const today_ = today();
    const now = new Date();
    if (f.period === 'all') return { from: '', to: '' };
    if (f.period === 'month') {
      const ym = today_.slice(0, 7);
      return { from: ym + '-01', to: today_ };
    }
    if (f.period === 'last-month') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: d.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
    }
    if (f.period === 'quarter') {
      const d = new Date(now); d.setMonth(d.getMonth() - 2); d.setDate(1);
      return { from: d.toISOString().slice(0, 10), to: today_ };
    }
    if (f.period === 'year') {
      return { from: now.getFullYear() + '-01-01', to: today_ };
    }
    if (f.period === 'custom') {
      return { from: f.dateFrom || '', to: f.dateTo || '' };
    }
    return { from: '', to: '' };
  },

  openTxFilterModal() {
    const f = this.state.txFilter;
    // Period pills
    document.querySelectorAll('#txFilterPeriod .pill').forEach(el => {
      el.classList.toggle('on', el.dataset.period === (f.period || 'month'));
      el.onclick = () => {
        document.querySelectorAll('#txFilterPeriod .pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        $('#txFilterCustomRange').style.display = el.dataset.period === 'custom' ? 'block' : 'none';
      };
    });
    $('#txFilterCustomRange').style.display = (f.period === 'custom') ? 'block' : 'none';
    $('#txFilterFrom').value = f.dateFrom || '';
    $('#txFilterTo').value = f.dateTo || '';
    $('#txFilterAmountMin').value = f.amountMin ? Number(f.amountMin).toLocaleString('vi-VN') : '';
    $('#txFilterAmountMax').value = f.amountMax ? Number(f.amountMax).toLocaleString('vi-VN') : '';
    $('#txFilterPhotoOnly').checked = !!f.photoOnly;
    // Category select — list tất cả categories
    const cats = this.state.categories.slice().sort((a, b) => (a.type || '').localeCompare(b.type || '') || (a.name || '').localeCompare(b.name || ''));
    $('#txFilterCategory').innerHTML = '<option value="all">Tất cả danh mục</option>' +
      cats.map(c => `<option value="${c.id}">${c.type === 'expense' ? '📤' : c.type === 'income' ? '📥' : ''} ${this.escapeHtml(c.name)}</option>`).join('');
    if (f.categoryId) $('#txFilterCategory').value = f.categoryId;

    // Tags toggle pills
    const tagsWrap = $('#txFilterTagsWrap');
    const allTags = this.getAllTags();
    if (tagsWrap) {
      if (allTags.length === 0) {
        tagsWrap.innerHTML = '<span style="color:var(--text3);font-size:12px;font-style:italic">Chưa có thẻ nào</span>';
      } else {
        tagsWrap.innerHTML = allTags.map(t => {
          const on = (f.tags || []).includes(t);
          return `<span class="pill ${on ? 'on' : ''}" data-tag-toggle="${this.escapeHtml(t)}">${this.escapeHtml(t)}</span>`;
        }).join('');
        tagsWrap.querySelectorAll('[data-tag-toggle]').forEach(el => {
          el.onclick = () => {
            const t = el.dataset.tagToggle;
            this.state.txFilter.tags = this.state.txFilter.tags || [];
            if (this.state.txFilter.tags.includes(t)) {
              this.state.txFilter.tags = this.state.txFilter.tags.filter(x => x !== t);
              el.classList.remove('on');
            } else {
              this.state.txFilter.tags.push(t);
              el.classList.add('on');
            }
          };
        });
      }
    }

    $('#txFilterModal').classList.add('open');
  },

  applyTxFilter() {
    const period = document.querySelector('#txFilterPeriod .pill.on')?.dataset.period || 'month';
    this.state.txFilter.period = period;
    this.state.txFilter.dateFrom = period === 'custom' ? $('#txFilterFrom').value : '';
    this.state.txFilter.dateTo = period === 'custom' ? $('#txFilterTo').value : '';
    this.state.txFilter.categoryId = $('#txFilterCategory').value || 'all';
    this.state.txFilter.amountMin = readAmount($('#txFilterAmountMin')) || 0;
    this.state.txFilter.amountMax = readAmount($('#txFilterAmountMax')) || 0;
    this.state.txFilter.photoOnly = $('#txFilterPhotoOnly').checked;
    $('#txFilterModal').classList.remove('open');
    this.renderTransactions();
  },

  resetTxFilter() {
    this.state.txFilter = { type: 'all', period: 'month', accountId: 'all', search: '', categoryId: 'all', amountMin: 0, amountMax: 0, photoOnly: false, dateFrom: '', dateTo: '', tags: [] };
    $('#txFilterModal').classList.remove('open');
    this.renderTransactions();
  },

  // Render chip "active filters" để user thấy filter nào đang áp + xoá nhanh
  renderActiveFilterChips() {
    const wrap = $('#txActiveFilters');
    if (!wrap) return;
    const f = this.state.txFilter;
    const chips = [];
    if (f.period && f.period !== 'all') {
      const labels = { month: 'Tháng này', 'last-month': 'Tháng trước', quarter: '3 tháng', year: 'Năm nay', custom: 'Tuỳ chỉnh' };
      chips.push({ key: 'period', label: '📅 ' + (labels[f.period] || f.period) });
    }
    if (f.categoryId && f.categoryId !== 'all') {
      const c = this.state.categories.find(x => x.id === f.categoryId);
      if (c) chips.push({ key: 'categoryId', label: '🏷️ ' + c.name });
    }
    if (f.amountMin > 0 || f.amountMax > 0) {
      const a = f.amountMin > 0 ? fmt(f.amountMin) : '0';
      const b = f.amountMax > 0 ? fmt(f.amountMax) : '∞';
      chips.push({ key: 'amount', label: `💰 ${a} - ${b}` });
    }
    if (f.photoOnly) chips.push({ key: 'photoOnly', label: '📷 Có ảnh' });

    if (chips.length === 0) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = 'flex';
    wrap.style.flexWrap = 'wrap';
    wrap.style.gap = '6px';
    wrap.innerHTML = chips.map(c =>
      `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--acl);color:var(--accent);padding:4px 10px;border-radius:14px;font-size:12px;font-weight:600">${this.escapeHtml(c.label)} <span data-clear-filter="${c.key}" style="cursor:pointer;font-weight:700;padding:0 2px">✕</span></span>`
    ).join('');
    wrap.querySelectorAll('[data-clear-filter]').forEach(el => {
      el.onclick = () => {
        const k = el.dataset.clearFilter;
        if (k === 'period') this.state.txFilter.period = 'all';
        else if (k === 'categoryId') this.state.txFilter.categoryId = 'all';
        else if (k === 'amount') { this.state.txFilter.amountMin = 0; this.state.txFilter.amountMax = 0; }
        else if (k === 'photoOnly') this.state.txFilter.photoOnly = false;
        this.renderTransactions();
      };
    });
  },

  // ============ GIAO DỊCH ĐỊNH KỲ ============
  // Tính ngày NEXT của rule sau ngày 'fromDate' (YYYY-MM-DD), inclusive
  recurringNextDate(rule, fromDate) {
    const from = new Date(fromDate + 'T00:00:00');
    if (rule.frequency === 'daily') return fromDate;
    if (rule.frequency === 'weekly') {
      const dow = parseInt(rule.dayOfWeek, 10);
      const d = new Date(from);
      const diff = (dow - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString().slice(0, 10);
    }
    if (rule.frequency === 'monthly') {
      const dom = rule.dayOfMonth === 'last' ? null : parseInt(rule.dayOfMonth, 10);
      const tryDate = (year, month) => {
        if (dom === null) {
          // last day of month
          return new Date(year, month + 1, 0);
        }
        const lastDay = new Date(year, month + 1, 0).getDate();
        const day = Math.min(dom, lastDay);
        return new Date(year, month, day);
      };
      let cand = tryDate(from.getFullYear(), from.getMonth());
      if (cand < from) cand = tryDate(from.getFullYear(), from.getMonth() + 1);
      return cand.toISOString().slice(0, 10);
    }
    if (rule.frequency === 'yearly') {
      const start = new Date(rule.startDate + 'T00:00:00');
      const cand = new Date(from.getFullYear(), start.getMonth(), start.getDate());
      if (cand < from) cand.setFullYear(from.getFullYear() + 1);
      return cand.toISOString().slice(0, 10);
    }
    return fromDate;
  },

  // Chạy các rule active: tạo giao dịch cho mỗi lần đáo hạn từ lastRunDate → today
  async runRecurringRules() {
    const today_ = today();
    const rules = await window.QLT_Store.getAll('recurringRules');
    let created = 0;
    for (const rule of rules) {
      if (!rule.active) continue;
      const startDate = rule.startDate || today_;
      // Bắt đầu từ ngày sau lastRunDate (nếu có), hoặc startDate
      let cursor = rule.lastRunDate
        ? new Date(rule.lastRunDate + 'T00:00:00')
        : new Date(startDate + 'T00:00:00');
      if (rule.lastRunDate) cursor.setDate(cursor.getDate() + 1);
      // Lặp tối đa 60 lần để tránh infinite loop
      for (let i = 0; i < 60; i++) {
        const cursorStr = cursor.toISOString().slice(0, 10);
        const nextStr = this.recurringNextDate(rule, cursorStr);
        if (nextStr > today_) break;
        if (rule.endDate && nextStr > rule.endDate) break;
        // Tạo tx
        const tx = {
          type: rule.type,
          amount: rule.amount,
          date: nextStr,
          accountId: rule.accountId,
          toAccountId: rule.type === 'transfer' ? rule.toAccountId : null,
          categoryId: rule.type !== 'transfer' ? rule.categoryId : null,
          note: rule.note || rule.name,
          bookId: rule.bookId,
          _recurringRuleId: rule.id
        };
        await this.applyBalanceDelta(tx, +1);
        await window.QLT_Store.put('transactions', tx);
        created++;
        rule.lastRunDate = nextStr;
        // Cursor → ngày sau nextStr
        cursor = new Date(nextStr + 'T00:00:00');
        cursor.setDate(cursor.getDate() + 1);
      }
      await window.QLT_Store.put('recurringRules', rule);
    }
    return created;
  },

  renderRecurring() {
    const wrap = $('#recurringList');
    const rules = this.state.recurringRules.slice().sort((a, b) =>
      (a.active === b.active ? 0 : a.active ? -1 : 1) || (a.name || '').localeCompare(b.name || ''));

    if (rules.length === 0) {
      wrap.innerHTML = this.emptyState({
        icon: '🔄', title: 'Chưa có giao dịch định kỳ',
        desc: 'Tự động tạo giao dịch cho lương, tiền nhà, internet... mỗi tháng/tuần. App sẽ chạy tự động khi bạn mở app sau ngày tới hạn.',
        ctaLabel: '+ Tạo quy tắc đầu tiên'
      });
      this.bindEmptyCTA(wrap, () => this.openRecurringModal(null));
    } else {
      const freqLabels = { daily: 'mỗi ngày', weekly: 'mỗi tuần', monthly: 'mỗi tháng', yearly: 'mỗi năm' };
      const today_ = today();
      wrap.innerHTML = rules.map(r => {
        const nextDate = this.recurringNextDate(r, r.lastRunDate
          ? (() => { const d = new Date(r.lastRunDate); d.setDate(d.getDate() + 1); return d.toISOString().slice(0,10); })()
          : (r.startDate || today_));
        const acc = this.state.accounts.find(a => a.id === r.accountId)?.name || '?';
        const sign = r.type === 'income' ? '+' : (r.type === 'expense' ? '-' : '↻');
        const cls = r.type === 'income' ? 'amount-pos' : (r.type === 'expense' ? 'amount-neg' : '');
        return `
          <div class="card" data-recurring="${r.id}" style="cursor:pointer;${!r.active ? 'opacity:.55' : ''}">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="font-size:24px">${r.type === 'income' ? '💰' : r.type === 'expense' ? '💸' : '↻'}</div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:700">${this.escapeHtml(r.name)}${!r.active ? ' <span style="color:var(--text3);font-size:11px;font-weight:500">⏸ tắt</span>' : ''}</div>
                <div style="font-size:12px;color:var(--text2);margin-top:2px">${freqLabels[r.frequency] || ''} · ${this.escapeHtml(acc)}</div>
                <div style="font-size:11px;color:var(--text3);margin-top:2px">${r.active ? 'Lần kế: ' + this.formatDate(nextDate) : 'Đang tạm dừng'}</div>
              </div>
              <div class="${cls}" style="font-weight:700">${sign}${fmt(r.amount)}</div>
            </div>
          </div>
        `;
      }).join('');
      wrap.querySelectorAll('[data-recurring]').forEach(el => {
        el.onclick = () => this.openRecurringModal(el.dataset.recurring);
      });
    }
    $('#recurringAddFab').onclick = () => this.openRecurringModal(null);
  },

  openRecurringModal(id) {
    const isNew = !id;
    let r;
    if (isNew) {
      r = {
        id: null, name: '', type: 'expense', amount: 0,
        accountId: this.state.accounts.find(a => this.isPayment(a))?.id || null,
        toAccountId: null, categoryId: null,
        frequency: 'monthly', dayOfMonth: 1, dayOfWeek: 1,
        startDate: today(), endDate: '', note: '', active: true,
        lastRunDate: null, bookId: this.state.currentBookId
      };
    } else {
      r = this.state.recurringRules.find(x => x.id === id);
      if (!r) return;
    }
    this.state.editingRecurring = { ...r };

    // Populate dayOfMonth select (1-28 + 'last')
    const domSel = $('#recDayOfMonth');
    if (domSel.children.length === 0) {
      let html = '';
      for (let i = 1; i <= 28; i++) html += `<option value="${i}">Ngày ${i}</option>`;
      html += '<option value="last">Ngày cuối tháng</option>';
      domSel.innerHTML = html;
    }

    $('#recurringTitle').textContent = isNew ? '🔄 Tạo giao dịch định kỳ' : '🔄 Sửa giao dịch định kỳ';
    $('#recDelete').style.display = isNew ? 'none' : 'block';
    $('#recName').value = r.name || '';
    $('#recAmount').value = r.amount ? Number(r.amount).toLocaleString('vi-VN') : '';
    $('#recFrequency').value = r.frequency || 'monthly';
    $('#recDayOfMonth').value = String(r.dayOfMonth || 1);
    $('#recDayOfWeek').value = String(r.dayOfWeek != null ? r.dayOfWeek : 1);
    $('#recStartDate').value = r.startDate || today();
    $('#recEndDate').value = r.endDate || '';
    $('#recNote').value = r.note || '';
    $('#recActive').checked = r.active !== false;

    // Account selectors
    const payAccs = this.state.accounts.filter(a => this.isPayment(a));
    const opts = payAccs.map(a => `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`).join('');
    $('#recAccount').innerHTML = opts;
    $('#recToAccount').innerHTML = opts;
    if (r.accountId) $('#recAccount').value = r.accountId;
    if (r.toAccountId) $('#recToAccount').value = r.toAccountId;

    // Type pills
    $$('.rec-type-pill').forEach(el => {
      el.classList.toggle('on', el.dataset.type === (r.type || 'expense'));
      el.onclick = () => {
        $$('.rec-type-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.editingRecurring.type = el.dataset.type;
        this._recurringApplyTypeUI(el.dataset.type);
      };
    });
    this._recurringApplyTypeUI(r.type || 'expense');

    // Frequency change
    $('#recFrequency').onchange = (e) => this._recurringApplyFreqUI(e.target.value);
    this._recurringApplyFreqUI(r.frequency || 'monthly');

    $('#recurringModal').classList.add('open');
  },

  _recurringApplyTypeUI(type) {
    const isTransfer = type === 'transfer';
    $('#recToAccountWrap').style.display = isTransfer ? 'block' : 'none';
    $('#recCategoryWrap').style.display = isTransfer ? 'none' : 'block';
    if (!isTransfer) {
      const cats = this.state.categories.filter(c => c.type === type);
      $('#recCategory').innerHTML = cats.map(c =>
        `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`).join('');
      const r = this.state.editingRecurring;
      if (r.categoryId) $('#recCategory').value = r.categoryId;
    }
  },

  _recurringApplyFreqUI(freq) {
    $('#recDayOfMonthWrap').style.display = freq === 'monthly' ? 'block' : 'none';
    $('#recDayOfWeekWrap').style.display = freq === 'weekly' ? 'block' : 'none';
    const hint = $('#recHint');
    const dom = $('#recDayOfMonth').value;
    const dow = $('#recDayOfWeek').value;
    if (freq === 'monthly') hint.textContent = `Mỗi tháng vào ngày ${dom === 'last' ? 'cuối tháng' : dom}`;
    else if (freq === 'weekly') hint.textContent = `Mỗi tuần vào ${['Chủ nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'][dow]}`;
    else if (freq === 'daily') hint.textContent = 'Mỗi ngày';
    else if (freq === 'yearly') hint.textContent = 'Mỗi năm vào ngày ' + ($('#recStartDate').value || today());
  },

  async saveRecurring() {
    const r = this.state.editingRecurring;
    if (!r) return;
    r.name = $('#recName').value.trim();
    r.type = $$('.rec-type-pill.on')[0]?.dataset.type || 'expense';
    r.amount = readAmount($('#recAmount'));
    r.accountId = $('#recAccount').value;
    r.toAccountId = r.type === 'transfer' ? $('#recToAccount').value : null;
    r.categoryId = r.type !== 'transfer' ? $('#recCategory').value : null;
    r.frequency = $('#recFrequency').value;
    r.dayOfMonth = $('#recDayOfMonth').value;
    r.dayOfWeek = parseInt($('#recDayOfWeek').value, 10);
    r.startDate = $('#recStartDate').value || today();
    r.endDate = $('#recEndDate').value || '';
    r.note = $('#recNote').value.trim();
    r.active = $('#recActive').checked;
    r.bookId = r.bookId || this.state.currentBookId;

    if (!r.name) { QLT_UI.toast('Nhập tên gọi', { type: 'error' }); return; }
    if (r.amount <= 0) { QLT_UI.toast('Nhập số tiền', { type: 'error' }); return; }
    if (!r.accountId) { QLT_UI.toast('Chọn ví', { type: 'error' }); return; }
    if (r.type === 'transfer' && !r.toAccountId) { QLT_UI.toast('Chọn ví đích', { type: 'error' }); return; }

    await window.QLT_Store.put('recurringRules', r);
    await this.reload();

    // Chạy ngay sau khi tạo/sửa để tạo tx cho các lần đã qua từ startDate đến nay
    const created = await this.runRecurringRules();
    if (created > 0) {
      await this.reload();
      QLT_UI.toast(`Đã tạo ${created} giao dịch từ quy tắc`, { type: 'success' });
    } else {
      QLT_UI.toast('Đã lưu quy tắc', { type: 'success' });
    }

    $('#recurringModal').classList.remove('open');
    this.renderRecurring();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
  },

  async deleteRecurring() {
    const r = this.state.editingRecurring;
    if (!r?.id) return;
    if (!await QLT_UI.confirm('Xoá quy tắc này? Các giao dịch đã tạo trước đây vẫn giữ nguyên.', { okLabel: 'Xoá', danger: true })) return;
    await window.QLT_Store.del('recurringRules', r.id);
    await this.reload();
    $('#recurringModal').classList.remove('open');
    this.renderRecurring();
    this.autoSync();
    QLT_UI.toast('Đã xoá quy tắc', { type: 'success' });
  },

  // ============ CHI PHÍ XE (Xăng + Bảo dưỡng) ============
  // Khoá nhận diện xe = name (lowercase, normalize) + type. Tránh gộp Wave+motorbike với Wave+car.
  fuelVehicleKey(name, type) {
    return normalizeVi(name).trim() + '__' + (type || 'motorbike');
  },

  // Group fuel + maintenance logs theo xe → trả mảng vehicles
  fuelGroupVehicles() {
    const map = new Map();
    const get = (name, type) => {
      const k = this.fuelVehicleKey(name, type);
      if (!map.has(k)) {
        map.set(k, {
          key: k, name: (name || '').trim(), type: type || 'motorbike',
          fuel: [], maint: []
        });
      }
      return map.get(k);
    };
    for (const f of (this.state.fuelLogs || [])) {
      if (!f.vehicleName) continue;
      get(f.vehicleName, f.vehicleType).fuel.push(f);
    }
    for (const m of (this.state.maintenanceLogs || [])) {
      if (!m.vehicleName) continue;
      get(m.vehicleName, m.vehicleType).maint.push(m);
    }
    // Sort logs newest first per vehicle
    for (const v of map.values()) {
      v.fuel.sort((a, b) => (b.date + (b._updatedAt || '')).localeCompare(a.date + (a._updatedAt || '')));
      v.maint.sort((a, b) => (b.date + (b._updatedAt || '')).localeCompare(a.date + (a._updatedAt || '')));
    }
    // Vehicles sort: gần đây có log nhất lên đầu
    const arr = [...map.values()];
    arr.sort((a, b) => {
      const aLast = (a.fuel[0]?.date || '') > (a.maint[0]?.date || '') ? a.fuel[0]?.date : a.maint[0]?.date;
      const bLast = (b.fuel[0]?.date || '') > (b.maint[0]?.date || '') ? b.fuel[0]?.date : b.maint[0]?.date;
      return (bLast || '').localeCompare(aLast || '');
    });
    return arr;
  },

  // Tính stats cho 1 xe (input: object trả từ fuelGroupVehicles)
  fuelComputeStats(v) {
    const fuel = v.fuel; // newest first
    const maint = v.maint;

    // Tổng chi tháng này (xăng + bảo dưỡng)
    const ym = new Date().toISOString().slice(0, 7);
    const prevYm = (() => {
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      return d.toISOString().slice(0, 7);
    })();
    let monthSpend = 0, prevMonthSpend = 0;
    for (const x of [...fuel, ...maint]) {
      if ((x.date || '').startsWith(ym)) monthSpend += x.amount || 0;
      else if ((x.date || '').startsWith(prevYm)) prevMonthSpend += x.amount || 0;
    }

    // Odometer mới nhất = max odometer
    let maxOdo = 0;
    for (const x of [...fuel, ...maint]) if (x.odometer && x.odometer > maxOdo) maxOdo = x.odometer;

    // Tiêu thụ lít/100km — cần ≥2 fuel logs có odometer + liters
    // Sắp tăng dần theo ngày để tính delta
    const fuelAsc = [...fuel].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const consumptions = []; // mỗi phần tử = lít/100km
    for (let i = 1; i < fuelAsc.length; i++) {
      const prev = fuelAsc[i - 1];
      const cur = fuelAsc[i];
      const dKm = (cur.odometer || 0) - (prev.odometer || 0);
      const liters = cur.liters || 0;
      if (dKm > 0 && liters > 0) {
        consumptions.push(liters / dKm * 100);
      }
    }
    // Trung bình 3 lần gần nhất
    const lastN = consumptions.slice(-3);
    const avgLPer100 = lastN.length ? lastN.reduce((s, x) => s + x, 0) / lastN.length : null;

    // đ/km — dùng tổng tiền xăng / tổng km đi
    let totalFuelMoney = 0, totalDistance = 0;
    for (let i = 1; i < fuelAsc.length; i++) {
      const dKm = (fuelAsc[i].odometer || 0) - (fuelAsc[i - 1].odometer || 0);
      if (dKm > 0) {
        totalFuelMoney += (fuelAsc[i].amount || 0);
        totalDistance += dKm;
      }
    }
    const dongPerKm = totalDistance > 0 ? Math.round(totalFuelMoney / totalDistance) : null;

    // Lần thay nhớt cuối + cảnh báo
    const oilLogs = maint.filter(m => m.kind === 'oil' && m.odometer).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const lastOil = oilLogs[0] || null;
    const oilThreshold = v.type === 'car' ? 5000 : 1500;
    let oilStatus = null; // {km, threshold, urgent}
    if (lastOil && maxOdo) {
      const km = maxOdo - lastOil.odometer;
      oilStatus = {
        km,
        threshold: oilThreshold,
        urgent: km >= oilThreshold,
        warn: km >= oilThreshold * 0.8
      };
    }

    return { monthSpend, prevMonthSpend, maxOdo, avgLPer100, dongPerKm, lastOil, oilStatus, oilThreshold };
  },

  renderFuel() {
    const wrap = $('#fuelVehicleList');
    const empty = $('#fuelEmpty');
    const vehicles = this.fuelGroupVehicles();

    if (vehicles.length === 0) {
      wrap.innerHTML = '';
      empty.style.display = 'block';
    } else {
      empty.style.display = 'none';
      wrap.innerHTML = vehicles.map(v => this.renderFuelVehicleCard(v)).join('');
      // Bind click on log rows → open modal sửa
      wrap.querySelectorAll('[data-fuel-log]').forEach(el => {
        el.onclick = () => this.openFuelLogModal(el.dataset.fuelLog);
      });
      wrap.querySelectorAll('[data-maint-log]').forEach(el => {
        el.onclick = () => this.openMaintLogModal(el.dataset.maintLog);
      });
      // Quick add — pre-fill xe + lock field
      wrap.querySelectorAll('[data-quick-fuel]').forEach(el => {
        el.onclick = () => {
          const [name, type] = el.dataset.quickFuel.split('|');
          this.openFuelLogModal(null, { vehicleName: name, vehicleType: type });
        };
      });
      wrap.querySelectorAll('[data-quick-maint]').forEach(el => {
        el.onclick = () => {
          const [name, type] = el.dataset.quickMaint.split('|');
          this.openMaintLogModal(null, { vehicleName: name, vehicleType: type });
        };
      });
    }

    // FAB handlers — chỉ giữ cho case CHƯA CÓ XE NÀO
    if (vehicles.length === 0) {
      $('#fuelAddFab').style.display = 'flex';
      $('#fuelMaintFab').style.display = 'flex';
    } else {
      $('#fuelAddFab').style.display = 'none';
      $('#fuelMaintFab').style.display = 'none';
    }
    $('#fuelAddFab').onclick = () => this.openFuelLogModal(null);
    $('#fuelMaintFab').onclick = () => this.openMaintLogModal(null);
  },

  renderFuelVehicleCard(v) {
    const s = this.fuelComputeStats(v);
    const icon = v.type === 'car' ? '🚗' : '🛵';
    const monthCmp = s.prevMonthSpend > 0
      ? (s.monthSpend > s.prevMonthSpend
          ? `↑ ${fmt(s.monthSpend - s.prevMonthSpend)} so với tháng trước`
          : `↓ ${fmt(s.prevMonthSpend - s.monthSpend)} so với tháng trước`)
      : 'Chưa có dữ liệu tháng trước';

    let oilHtml = '';
    if (s.lastOil) {
      const km = s.oilStatus?.km;
      const cls = s.oilStatus?.urgent ? 'urgent' : (s.oilStatus?.warn ? '' : '');
      const icon2 = s.oilStatus?.urgent ? '🚨' : '🛢️';
      oilHtml = `<div class="fuel-oil-warning ${cls}">
        ${icon2} Đã đi <strong>${fmt(km)} km</strong> kể từ lần thay nhớt cuối
        (${this.formatDate(s.lastOil.date)} · ngưỡng ${fmt(s.oilThreshold)} km)
        ${s.oilStatus?.urgent ? '<br><strong>Đề nghị thay nhớt</strong>' : ''}
      </div>`;
    } else {
      oilHtml = `<div class="fuel-oil-warning">🛢️ Chưa ghi lần thay nhớt nào — bấm <strong>🔧 Bảo dưỡng</strong> để ghi lần đầu.</div>`;
    }

    // Logs gần đây — trộn fuel + maint, lấy 5 newest
    const allLogs = [
      ...v.fuel.map(f => ({ ...f, _kind: 'fuel' })),
      ...v.maint.map(m => ({ ...m, _kind: 'maint' }))
    ].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);

    const logsHtml = allLogs.length === 0
      ? '<div class="fuel-log-empty">Chưa có log nào</div>'
      : allLogs.map(x => this.renderFuelLogRow(x)).join('');

    return `
      <div class="fuel-vehicle-card">
        <div class="fuel-vehicle-head">
          <div class="fuel-vehicle-icon">${icon}</div>
          <div class="fuel-vehicle-name">${this.escapeHtml(v.name)}</div>
          <div class="fuel-vehicle-month">
            <div class="fuel-vehicle-month-val">${fmt(s.monthSpend)} đ</div>
            <div class="fuel-vehicle-month-cmp">${monthCmp}</div>
          </div>
        </div>
        <div class="fuel-stats-grid">
          <div class="fuel-stat">
            <div class="fuel-stat-lbl">Odometer</div>
            <div class="fuel-stat-val">${fmt(s.maxOdo)} km</div>
          </div>
          <div class="fuel-stat">
            <div class="fuel-stat-lbl">Tiêu thụ TB</div>
            <div class="fuel-stat-val">${s.avgLPer100 != null ? s.avgLPer100.toFixed(1) + ' L/100km' : '—'}</div>
          </div>
          <div class="fuel-stat">
            <div class="fuel-stat-lbl">Chi phí xăng</div>
            <div class="fuel-stat-val">${s.dongPerKm != null ? fmt(s.dongPerKm) + ' đ/km' : '—'}</div>
          </div>
          <div class="fuel-stat">
            <div class="fuel-stat-lbl">Số lần đổ / bảo dưỡng</div>
            <div class="fuel-stat-val">${v.fuel.length} / ${v.maint.length}</div>
          </div>
        </div>
        ${oilHtml}
        <div class="fuel-log-list">${logsHtml}</div>
        <div class="fuel-card-actions">
          <button class="btn btn-secondary fuel-add-quick" data-quick-fuel="${this.escapeHtml(v.name)}|${v.type}">⛽ Đổ xăng</button>
          <button class="btn btn-secondary fuel-add-quick" data-quick-maint="${this.escapeHtml(v.name)}|${v.type}" style="color:#cc7a4f;border-color:#cc7a4f">🔧 Bảo dưỡng</button>
        </div>
      </div>
    `;
  },

  renderFuelLogRow(x) {
    if (x._kind === 'fuel') {
      const liters = x.liters ? `${x.liters}L` : '';
      const station = x.station ? '· ' + this.escapeHtml(x.station) : '';
      const odo = x.odometer ? `${fmt(x.odometer)} km` : '';
      return `
        <div class="fuel-log-row" data-fuel-log="${x.id}">
          <div class="fuel-log-row-icon fuel">⛽</div>
          <div class="fuel-log-row-info">
            <div class="fuel-log-row-title">Đổ xăng ${liters} ${station}</div>
            <div class="fuel-log-row-meta">${this.formatDate(x.date)} ${odo ? '· ' + odo : ''}</div>
          </div>
          <div class="fuel-log-row-amt">${fmt(x.amount)}</div>
        </div>
      `;
    }
    const kindLabels = { oil: '🛢️ Thay nhớt', wash: '🚿 Rửa xe', repair: '🔧 Sửa chữa', tire: '🛞 Thay lốp', other: '📦 Khác' };
    const lbl = kindLabels[x.kind] || '🔧 Bảo dưỡng';
    const odo = x.odometer ? `${fmt(x.odometer)} km` : '';
    return `
      <div class="fuel-log-row" data-maint-log="${x.id}">
        <div class="fuel-log-row-icon maint">🔧</div>
        <div class="fuel-log-row-info">
          <div class="fuel-log-row-title">${lbl}${x.label ? ' · ' + this.escapeHtml(x.label) : ''}</div>
          <div class="fuel-log-row-meta">${this.formatDate(x.date)} ${odo ? '· ' + odo : ''}</div>
        </div>
        <div class="fuel-log-row-amt">${fmt(x.amount)}</div>
      </div>
    `;
  },

  // Tạo/lấy danh mục Xăng xe / Bảo dưỡng xe (auto-create)
  async ensureFuelCategory(bookId) {
    const all = await window.QLT_Store.getAll('categories');
    let cat = all.find(c => c.bookId === bookId && c._fuelCategory === 'fuel');
    if (!cat) {
      cat = await window.QLT_Store.put('categories', {
        type: 'expense', name: 'Xăng xe', icon: 'emoji:⛽',
        color: '#dc2626', bookId, _fuelCategory: 'fuel'
      });
    }
    return cat;
  },
  async ensureMaintCategory(bookId) {
    const all = await window.QLT_Store.getAll('categories');
    let cat = all.find(c => c.bookId === bookId && c._fuelCategory === 'maint');
    if (!cat) {
      cat = await window.QLT_Store.put('categories', {
        type: 'expense', name: 'Bảo dưỡng xe', icon: 'emoji:🔧',
        color: '#cc7a4f', bookId, _fuelCategory: 'maint'
      });
    }
    return cat;
  },

  // Cập nhật datalist gợi ý tên xe + select tài khoản
  _populateFuelOptions() {
    // Distinct vehicle names
    const names = new Set();
    for (const f of this.state.fuelLogs) if (f.vehicleName) names.add(f.vehicleName.trim());
    for (const m of this.state.maintenanceLogs) if (m.vehicleName) names.add(m.vehicleName.trim());
    const dl = $('#fuelVehicleNameList');
    if (dl) dl.innerHTML = [...names].map(n => `<option value="${this.escapeHtml(n)}">`).join('');

    // Tài khoản (chỉ payment)
    const payments = this.state.accounts.filter(a => this.isPayment(a));
    const opts = payments.map(a => `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`).join('');
    const accFuel = $('#fuelAccount'); if (accFuel) accFuel.innerHTML = opts;
    const accMaint = $('#maintAccount'); if (accMaint) accMaint.innerHTML = opts;
  },

  // ====== MODAL: ĐỔ XĂNG ======
  // preset (optional): { vehicleName, vehicleType } — khi mở từ card xe, khoá field
  openFuelLogModal(id, preset) {
    this._populateFuelOptions();
    let log;
    if (id) {
      log = this.state.fuelLogs.find(x => x.id === id);
      if (!log) return;
    } else {
      log = {
        id: null, date: today(),
        vehicleName: preset?.vehicleName || '',
        vehicleType: preset?.vehicleType || 'motorbike',
        amount: preset?.amount || 0, liters: 0, pricePerLiter: 0, odometer: 0,
        station: '',
        accountId: this.state.accounts.find(a => this.isPayment(a))?.id || null,
        bookId: this.state.currentBookId
      };
    }
    this.state.editingFuelLog = { ...log };

    $('#fuelLogTitle').textContent = id ? '⛽ Sửa lần đổ xăng' : '⛽ Ghi lần đổ xăng';
    $('#fuelLogDelete').style.display = id ? 'block' : 'none';
    $('#fuelVehicleName').value = log.vehicleName || '';
    $('#fuelDate').value = log.date || today();
    $('#fuelAmount').value = log.amount ? Number(log.amount).toLocaleString('vi-VN') : '';
    $('#fuelLiters').value = log.liters || '';
    $('#fuelPricePerLiter').value = log.pricePerLiter ? Number(log.pricePerLiter).toLocaleString('vi-VN') : '';
    $('#fuelOdometer').value = log.odometer || '';
    $('#fuelStation').value = log.station || '';
    if (log.accountId) $('#fuelAccount').value = log.accountId;

    // Type pills
    $$('.fuel-type-pill').forEach(el =>
      el.classList.toggle('on', el.dataset.vt === (log.vehicleType || 'motorbike')));

    // Khoá tên xe + loại xe nếu là quick-add từ card xe (hoặc đang edit)
    const lockVehicle = !!preset || !!id;
    const nameInput = $('#fuelVehicleName');
    if (lockVehicle) {
      nameInput.setAttribute('readonly', 'readonly');
      nameInput.style.background = 'var(--surface2)';
      nameInput.style.color = 'var(--text2)';
      $$('.fuel-type-pill').forEach(el => { el.style.opacity = '0.5'; el.style.pointerEvents = 'none'; });
    } else {
      nameInput.removeAttribute('readonly');
      nameInput.style.background = '';
      nameInput.style.color = '';
      $$('.fuel-type-pill').forEach(el => { el.style.opacity = ''; el.style.pointerEvents = ''; });
    }

    // Hint odometer cuối cùng (nếu có)
    this._updateFuelOdometerHint(log.vehicleName, log.vehicleType || 'motorbike', id);

    // Compute hint khi đổi tiền/lít/giá
    const refreshCompute = () => this._fuelAutoCompute();
    $('#fuelAmount').oninput = refreshCompute;
    $('#fuelAmount').onchange = refreshCompute;
    $('#fuelLiters').oninput = refreshCompute;
    $('#fuelPricePerLiter').oninput = refreshCompute;
    $('#fuelPricePerLiter').onchange = refreshCompute;

    $$('.fuel-type-pill').forEach(el => {
      el.onclick = () => {
        $$('.fuel-type-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.editingFuelLog.vehicleType = el.dataset.vt;
        this._updateFuelOdometerHint($('#fuelVehicleName').value, el.dataset.vt, id);
      };
    });
    $('#fuelVehicleName').oninput = (e) => {
      const t = $$('.fuel-type-pill.on')[0]?.dataset.vt || 'motorbike';
      this._updateFuelOdometerHint(e.target.value, t, id);
    };

    $('#fuelLogModal').classList.add('open');
    refreshCompute();
  },

  _updateFuelOdometerHint(name, type, currentLogId) {
    const hint = $('#fuelOdometerHint');
    if (!name?.trim()) { hint.textContent = ''; return; }
    const k = this.fuelVehicleKey(name, type);
    const others = this.state.fuelLogs
      .filter(f => this.fuelVehicleKey(f.vehicleName, f.vehicleType) === k && f.id !== currentLogId)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const last = others[0];
    if (last) {
      const litStr = last.liters ? ` · ${last.liters}L` : '';
      const amtStr = last.amount ? ` · ${fmt(last.amount)} đ` : '';
      const daysAgo = Math.floor((new Date(today()) - new Date(last.date)) / 86400000);
      const dayLbl = daysAgo === 0 ? 'hôm nay' : daysAgo === 1 ? 'hôm qua' : `${daysAgo} ngày trước`;
      hint.innerHTML = `📊 <strong>Lần trước</strong> (${this.formatDate(last.date)} · ${dayLbl}): <strong>${fmt(last.odometer)} km</strong>${litStr}${amtStr}`;
    } else {
      hint.textContent = `Lần đầu cho xe này — odometer này sẽ là mốc bắt đầu để tính tiêu thụ.`;
    }
  },

  _fuelAutoCompute() {
    const amt = readAmount($('#fuelAmount'));
    const lit = parseFloat($('#fuelLiters').value) || 0;
    const ppl = readAmount($('#fuelPricePerLiter'));
    const hint = $('#fuelComputeHint');
    let msg = null;

    // Có tiền + lít → suy ra giá/lít
    if (amt > 0 && lit > 0 && (!ppl || Math.abs(ppl - amt / lit) > 1)) {
      const computed = Math.round(amt / lit);
      $('#fuelPricePerLiter').value = Number(computed).toLocaleString('vi-VN');
      msg = `→ Giá: ${fmt(computed)} đ/lít`;
    }
    // Có tiền + giá/lít, thiếu lít → suy ra lít
    else if (amt > 0 && ppl > 0 && !lit) {
      const computed = (amt / ppl).toFixed(2);
      $('#fuelLiters').value = computed;
      msg = `→ Lít: ${computed} L`;
    }
    // Có lít + giá/lít, thiếu tiền → suy ra tiền
    else if (lit > 0 && ppl > 0 && !amt) {
      const computed = Math.round(lit * ppl);
      $('#fuelAmount').value = Number(computed).toLocaleString('vi-VN');
      msg = `→ Tiền: ${fmt(computed)} đ`;
    }

    if (msg) { hint.style.display = 'block'; hint.textContent = msg; }
    else hint.style.display = 'none';
  },

  async saveFuelLog() {
    const log = this.state.editingFuelLog;
    if (!log) return;
    const name = $('#fuelVehicleName').value.trim();
    const type = $$('.fuel-type-pill.on')[0]?.dataset.vt || 'motorbike';
    const date = $('#fuelDate').value || today();
    const amount = readAmount($('#fuelAmount'));
    const liters = parseFloat($('#fuelLiters').value) || 0;
    const pricePerLiter = readAmount($('#fuelPricePerLiter'));
    const odometer = parseInt($('#fuelOdometer').value, 10) || 0;
    const station = $('#fuelStation').value.trim();
    const accountId = $('#fuelAccount').value || null;

    if (!name) { QLT_UI.toast('Vui lòng nhập tên xe', { type: 'error' }); return; }
    if (amount <= 0) { QLT_UI.toast('Vui lòng nhập số tiền', { type: 'error' }); return; }
    if (!odometer) { QLT_UI.toast('Vui lòng nhập số công-tơ-mét', { type: 'error' }); return; }
    if (!accountId) { QLT_UI.toast('Vui lòng chọn ví trừ tiền', { type: 'error' }); return; }

    Object.assign(log, {
      vehicleName: name, vehicleType: type, date, amount, liters, pricePerLiter, odometer, station, accountId,
      bookId: log.bookId || this.state.currentBookId
    });

    const isNew = !log.id;

    // Hoàn tác tx cũ nếu sửa (sẽ tạo lại tx mới đúng giá trị)
    if (!isNew && log.txId) {
      const oldTx = (await window.QLT_Store.getAll('transactions')).find(t => t.id === log.txId);
      if (oldTx) {
        await this.applyBalanceDelta(oldTx, -1);
        await window.QLT_Store.del('transactions', oldTx.id);
      }
      log.txId = null;
    }

    // Tạo expense tx mới
    const cat = await this.ensureFuelCategory(log.bookId);
    const tx = {
      type: 'expense', amount, date, accountId,
      categoryId: cat?.id || null,
      note: `Đổ xăng ${name}${station ? ' · ' + station : ''}`,
      bookId: log.bookId,
      _fuelLogId: null  // sẽ điền sau khi lưu log có id
    };
    await this.applyBalanceDelta(tx, +1);
    const savedTx = await window.QLT_Store.put('transactions', tx);

    log.txId = savedTx.id;
    const savedLog = await window.QLT_Store.put('fuelLogs', log);

    // Update tx với fuelLogId (để khi click tx → open log modal)
    savedTx._fuelLogId = savedLog.id;
    await window.QLT_Store.put('transactions', savedTx);

    await this.reload();
    $('#fuelLogModal').classList.remove('open');
    this.renderFuel();
    this.autoSync();
    QLT_UI.toast(isNew ? 'Đã ghi lần đổ xăng' : 'Đã cập nhật', { type: 'success' });
  },

  async deleteFuelLog() {
    const log = this.state.editingFuelLog;
    if (!log?.id) return;
    if (!await QLT_UI.confirm('Xoá lần đổ xăng này? Giao dịch chi tiêu liên kết cũng sẽ bị xoá.', { okLabel: 'Xoá', danger: true })) return;
    if (log.txId) {
      const tx = (await window.QLT_Store.getAll('transactions')).find(t => t.id === log.txId);
      if (tx) {
        await this.applyBalanceDelta(tx, -1);
        await window.QLT_Store.del('transactions', tx.id);
      }
    }
    await window.QLT_Store.del('fuelLogs', log.id);
    await this.reload();
    $('#fuelLogModal').classList.remove('open');
    this.renderFuel();
    this.autoSync();
  },

  // ====== MODAL: BẢO DƯỠNG ======
  // preset (optional): { vehicleName, vehicleType } — khi mở từ card xe, khoá field
  openMaintLogModal(id, preset) {
    this._populateFuelOptions();
    let log;
    if (id) {
      log = this.state.maintenanceLogs.find(x => x.id === id);
      if (!log) return;
    } else {
      log = {
        id: null, date: today(),
        vehicleName: preset?.vehicleName || '',
        vehicleType: preset?.vehicleType || 'motorbike',
        kind: 'oil', label: '',
        amount: 0, odometer: 0,
        accountId: this.state.accounts.find(a => this.isPayment(a))?.id || null,
        note: '',
        bookId: this.state.currentBookId
      };
    }
    this.state.editingMaintLog = { ...log };

    $('#maintLogTitle').textContent = id ? '🔧 Sửa bảo dưỡng' : '🔧 Ghi bảo dưỡng';
    $('#maintLogDelete').style.display = id ? 'block' : 'none';
    $('#maintVehicleName').value = log.vehicleName || '';
    $('#maintDate').value = log.date || today();
    $('#maintAmount').value = log.amount ? Number(log.amount).toLocaleString('vi-VN') : '';
    $('#maintOdometer').value = log.odometer || '';
    $('#maintLabel').value = log.label || '';
    $('#maintNote').value = log.note || '';
    if (log.accountId) $('#maintAccount').value = log.accountId;

    $$('.maint-type-pill').forEach(el =>
      el.classList.toggle('on', el.dataset.vt === (log.vehicleType || 'motorbike')));

    // Khoá tên xe + loại xe khi là quick-add từ card xe (hoặc đang edit)
    const lockVehicle = !!preset || !!id;
    const nameInput = $('#maintVehicleName');
    if (lockVehicle) {
      nameInput.setAttribute('readonly', 'readonly');
      nameInput.style.background = 'var(--surface2)';
      nameInput.style.color = 'var(--text2)';
      $$('.maint-type-pill').forEach(el => { el.style.opacity = '0.5'; el.style.pointerEvents = 'none'; });
    } else {
      nameInput.removeAttribute('readonly');
      nameInput.style.background = '';
      nameInput.style.color = '';
      $$('.maint-type-pill').forEach(el => { el.style.opacity = ''; el.style.pointerEvents = ''; });
    }
    $$('.maint-kind-pill').forEach(el =>
      el.classList.toggle('on', el.dataset.kind === (log.kind || 'oil')));

    $$('.maint-type-pill').forEach(el => {
      el.onclick = () => {
        $$('.maint-type-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
      };
    });
    $$('.maint-kind-pill').forEach(el => {
      el.onclick = () => {
        $$('.maint-kind-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        // Hiện required dấu * cho odometer chỉ khi 'oil'
        $('#maintOdoRequired').style.display = el.dataset.kind === 'oil' ? '' : 'none';
      };
    });
    $('#maintOdoRequired').style.display = (log.kind || 'oil') === 'oil' ? '' : 'none';

    $('#maintLogModal').classList.add('open');
  },

  async saveMaintLog() {
    const log = this.state.editingMaintLog;
    if (!log) return;
    const name = $('#maintVehicleName').value.trim();
    const type = $$('.maint-type-pill.on')[0]?.dataset.vt || 'motorbike';
    const kind = $$('.maint-kind-pill.on')[0]?.dataset.kind || 'oil';
    const label = $('#maintLabel').value.trim();
    const date = $('#maintDate').value || today();
    const amount = readAmount($('#maintAmount'));
    const odometer = parseInt($('#maintOdometer').value, 10) || 0;
    const note = $('#maintNote').value.trim();
    const accountId = $('#maintAccount').value || null;

    if (!name) { QLT_UI.toast('Vui lòng nhập tên xe', { type: 'error' }); return; }
    if (amount <= 0) { QLT_UI.toast('Vui lòng nhập số tiền', { type: 'error' }); return; }
    if (kind === 'oil' && !odometer) { QLT_UI.toast('Vui lòng nhập odometer (cần để tính chu kỳ thay nhớt)', { type: 'error' }); return; }
    if (!accountId) { QLT_UI.toast('Vui lòng chọn ví trừ tiền', { type: 'error' }); return; }

    Object.assign(log, {
      vehicleName: name, vehicleType: type, kind, label, date, amount, odometer, note, accountId,
      bookId: log.bookId || this.state.currentBookId
    });

    const isNew = !log.id;

    if (!isNew && log.txId) {
      const oldTx = (await window.QLT_Store.getAll('transactions')).find(t => t.id === log.txId);
      if (oldTx) {
        await this.applyBalanceDelta(oldTx, -1);
        await window.QLT_Store.del('transactions', oldTx.id);
      }
      log.txId = null;
    }

    const cat = await this.ensureMaintCategory(log.bookId);
    const kindNames = { oil: 'Thay nhớt', wash: 'Rửa xe', repair: 'Sửa chữa', tire: 'Thay lốp', other: 'Bảo dưỡng' };
    const tx = {
      type: 'expense', amount, date, accountId,
      categoryId: cat?.id || null,
      note: `${kindNames[kind] || 'Bảo dưỡng'} ${name}${label ? ' · ' + label : ''}`,
      bookId: log.bookId,
      _maintLogId: null
    };
    await this.applyBalanceDelta(tx, +1);
    const savedTx = await window.QLT_Store.put('transactions', tx);

    log.txId = savedTx.id;
    const savedLog = await window.QLT_Store.put('maintenanceLogs', log);

    savedTx._maintLogId = savedLog.id;
    await window.QLT_Store.put('transactions', savedTx);

    await this.reload();
    $('#maintLogModal').classList.remove('open');
    this.renderFuel();
    this.autoSync();
    QLT_UI.toast(isNew ? 'Đã ghi bảo dưỡng' : 'Đã cập nhật', { type: 'success' });
  },

  async deleteMaintLog() {
    const log = this.state.editingMaintLog;
    if (!log?.id) return;
    if (!await QLT_UI.confirm('Xoá lần bảo dưỡng này? Giao dịch chi tiêu liên kết cũng sẽ bị xoá.', { okLabel: 'Xoá', danger: true })) return;
    if (log.txId) {
      const tx = (await window.QLT_Store.getAll('transactions')).find(t => t.id === log.txId);
      if (tx) {
        await this.applyBalanceDelta(tx, -1);
        await window.QLT_Store.del('transactions', tx.id);
      }
    }
    await window.QLT_Store.del('maintenanceLogs', log.id);
    await this.reload();
    $('#maintLogModal').classList.remove('open');
    this.renderFuel();
    this.autoSync();
  },

  // ============ BOOKS ============
  openBookList() {
    const list = $('#bookList');
    const sortedBooks = this.state.books.slice().sort(sortByOrder);
    list.innerHTML = sortedBooks.map(b => `
      <div class="book-item ${b.id === this.state.currentBookId ? 'on' : ''}" data-book="${b.id}">
        <div class="tx-icon" style="background:${b.color || '#2d6a4f'};color:#fff">
          ${svgIcon(b.icon || 'wallet')}
        </div>
        <div class="tx-info">
          <div class="tx-cat">${this.escapeHtml(b.name)}</div>
          <div class="tx-meta">${b.id === this.state.currentBookId ? 'Đang dùng' : 'Bấm để chuyển'}</div>
        </div>
        <button class="book-edit-btn" data-edit="${b.id}" title="Sửa">${svgIcon('edit')}</button>
      </div>
    `).join('');
    // Drag-to-reorder
    this._initSortable(list, 'books', {
      collect: c => Array.from(c.children).map(el => el.dataset.book).filter(Boolean),
      afterReorder: function () { this.openBookList(); }
    });
    list.querySelectorAll('[data-book]').forEach(el => {
      el.onclick = async (e) => {
        if (e.target.closest('[data-edit]')) return;
        const id = el.dataset.book;
        if (id !== this.state.currentBookId) {
          await this.switchBook(id);
        }
        $('#bookModal').classList.remove('open');
      };
    });
    list.querySelectorAll('[data-edit]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        this.openBookEdit(el.dataset.edit);
      };
    });
    $('#bookModal').classList.add('open');
  },

  openBookEdit(id) {
    const isNew = !id;
    let b;
    if (isNew) {
      b = { id: null, name: '', icon: 'wallet', color: '#2d6a4f', members: [] };
    } else {
      b = this.state.books.find(x => x.id === id);
      if (!b) return;
    }
    this.state.editingBook = JSON.parse(JSON.stringify(b));
    this.state.editingBook.members = this.state.editingBook.members || [];
    this.state._origMembers = JSON.parse(JSON.stringify(this.state.editingBook.members));
    $('#bookName').value = b.name;
    this.renderColorPicker('bookColorPicker', 'bookColor', b.color || '#2d6a4f', (color) => {
      this.state.editingBook.color = color;
    });
    $('#bookEditTitle').textContent = isNew ? 'Tạo sổ mới' : 'Sửa sổ';
    $('#bookDelete').style.display = (isNew || this.state.books.length <= 1) ? 'none' : 'block';
    $('#bookExportSection').style.display = isNew ? 'none' : 'block';
    // Members section hiện CẢ khi tạo mới — user có thể thêm thành viên ngay khi tạo sổ chung (đi chơi, quỹ chung)
    $('#bookMembersSection').style.display = 'block';

    this.renderIconPicker({
      containerId: 'bookIconGrid',
      currentIcon: b.icon || 'wallet',
      allowEmoji: true,
      onPick: (icon) => { this.state.editingBook.icon = icon; }
    });
    this.renderBookMembers();
    $('#bookEditModal').classList.add('open');
  },

  renderBookMembers() {
    const wrap = $('#bookMembersList');
    if (!wrap) return;
    const members = this.state.editingBook?.members || [];

    const totalEl = $('#bookMembersTotal');
    if (totalEl) {
      const total = members.reduce((s, m) => s + (m.contribution || 0), 0);
      if (members.length > 0) {
        totalEl.style.display = 'flex';
        totalEl.innerHTML = `<span>${members.length} thành viên</span><span>Tổng quỹ: ${fmt(total)}đ</span>`;
      } else {
        totalEl.style.display = 'none';
      }
    }

    if (members.length === 0) {
      wrap.innerHTML = '<div style="text-align:center;padding:14px;color:var(--text3);font-size:12px;border:1.5px dashed var(--border);border-radius:var(--rsm)">Chưa có thành viên — bấm <strong>Thêm 1 người</strong> hoặc <strong>Thêm nhiều</strong></div>';
      return;
    }
    wrap.innerHTML = members.map((m, i) => `
      <div class="member-row" data-idx="${i}">
        <span class="member-num">${i + 1}</span>
        <input class="fi member-name" placeholder="Tên người ${i + 1}" value="${this.escapeHtml(m.name || '')}">
        <input class="fi member-amount qlt-amount" inputmode="numeric" placeholder="Tiền góp" value="${fmtAmount(m.contribution)}">
        <button class="member-del" type="button" title="Xoá">${svgIcon('close')}</button>
      </div>
    `).join('');
    wrap.querySelectorAll('.member-row').forEach(row => {
      const idx = parseInt(row.dataset.idx);
      const nameEl = row.querySelector('.member-name');
      const amtEl = row.querySelector('.member-amount');
      attachAmountFormatting(amtEl);
      nameEl.oninput = () => { members[idx].name = nameEl.value; };
      amtEl.oninput = () => {
        members[idx].contribution = readAmount(amtEl);
        // Cập nhật tổng quỹ ở trên
        const total = members.reduce((s, m) => s + (m.contribution || 0), 0);
        if (totalEl) totalEl.innerHTML = `<span>${members.length} thành viên</span><span>Tổng quỹ: ${fmt(total)}đ</span>`;
      };
      row.querySelector('.member-del').onclick = () => {
        members.splice(idx, 1);
        this.renderBookMembers();
      };
    });
  },

  addManyMembers() {
    $('#addManyCount').value = 8;
    $('#addManyAmount').value = '';
    $('#addManyModal').classList.add('open');
    setTimeout(() => $('#addManyCount').focus(), 100);
  },

  confirmAddMany() {
    const count = parseInt($('#addManyCount').value, 10);
    if (!Number.isFinite(count) || count < 1 || count > 50) {
      QLT_UI.toast('Số người không hợp lệ (1-50)', { type: 'error' });
      return;
    }
    const same = readAmount($('#addManyAmount'));

    this.state.editingBook.members = this.state.editingBook.members || [];
    for (let i = 0; i < count; i++) {
      this.state.editingBook.members.push({
        id: 'm_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 5),
        name: '',
        contribution: same || 0
      });
    }
    this.renderBookMembers();
    $('#addManyModal').classList.remove('open');
  },

  addBookMember() {
    if (!this.state.editingBook) return;
    this.state.editingBook.members = this.state.editingBook.members || [];
    this.state.editingBook.members.push({
      id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      name: '', contribution: 0
    });
    this.renderBookMembers();
  },

  async ensureFundCategory(bookId) {
    const all = await window.QLT_Store.getAll('categories');
    let cat = all.find(c => c.bookId === bookId && c._fundCategory);
    if (!cat) {
      cat = await window.QLT_Store.put('categories', {
        type: 'income',
        name: 'Đóng quỹ',
        icon: 'piggy',
        color: '#f4b942',
        bookId,
        _fundCategory: true
      });
    }
    return cat;
  },

  // Tạo/lấy danh mục "Điều chỉnh số dư" — dùng cho giao dịch khi user sửa số dư ví thủ công
  async ensureAdjustCategory(bookId, type) {
    const all = await window.QLT_Store.getAll('categories');
    let cat = all.find(c => c.bookId === bookId && c._adjustCategory === type);
    if (!cat) {
      cat = await window.QLT_Store.put('categories', {
        type,
        name: type === 'income' ? 'Điều chỉnh tăng' : 'Điều chỉnh giảm',
        icon: 'emoji:⚖️',
        color: '#9ca3af',
        bookId,
        _adjustCategory: type
      });
    }
    return cat;
  },

  // Mở máy tính nhập số dư mới — chênh lệch tạo giao dịch "Điều chỉnh"
  async openAdjustBalanceModal() {
    const a = this.state.editingAcc;
    if (!a?.id) return;
    const fresh = await window.QLT_Store.get('accounts', a.id);
    const current = Number(fresh?.balance) || 0;

    // Dùng input ẩn làm cầu nối với máy tính; nghe 'change' để biết user xác nhận
    const tmp = document.createElement('input');
    tmp.type = 'text';
    tmp.value = fmtAmount(current);
    tmp.style.position = 'fixed';
    tmp.style.left = '-9999px';
    document.body.appendChild(tmp);

    let confirmed = false;
    await new Promise(resolve => {
      tmp.addEventListener('change', () => { confirmed = true; resolve(); }, { once: true });
      // Nếu user đóng calc mà không bấm =, theo dõi tới khi modal đóng → resolve
      const watchClose = setInterval(() => {
        if (!document.getElementById('calcModal').classList.contains('open')) {
          clearInterval(watchClose);
          if (!confirmed) resolve();
        }
      }, 150);
      QLT_Calc.open(tmp);
    });

    const newBal = readAmount(tmp);
    tmp.remove();
    if (!confirmed) return;

    const diff = newBal - current;
    if (diff === 0) { QLT_UI.toast('Số dư không đổi', { type: 'info' }); return; }

    const type = diff > 0 ? 'income' : 'expense';
    const cat = await this.ensureAdjustCategory(a.bookId, type);
    const tx = {
      type,
      amount: Math.abs(diff),
      date: today(),
      accountId: a.id,
      categoryId: cat?.id || null,
      note: 'Điều chỉnh số dư',
      bookId: a.bookId,
      _adjustment: true
    };
    await this.applyBalanceDelta(tx, +1);
    await window.QLT_Store.put('transactions', tx);
    await this.reload();
    // Cập nhật input balance hiển thị (modal vẫn mở)
    const updated = this.state.accounts.find(x => x.id === a.id);
    if (updated) {
      this.state.editingAcc.balance = updated.balance;
      $('#accBalance').value = fmtAmount(updated.balance);
    }
    this.renderAccounts();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
    QLT_UI.toast(`Đã ${diff > 0 ? 'tăng' : 'giảm'} ${fmt(Math.abs(diff))} đ`, { type: 'success' });
  },

  // Tạo/lấy danh mục đặc biệt cho khoản vay. Key:
  //   'lend'        — cho vay đi (expense, ví trừ)
  //   'borrow'      — vay nhận về (income, ví cộng)
  //   'lendRepay'   — đối tác trả mình (income, ví cộng)
  //   'borrowRepay' — mình trả đối tác (expense, ví trừ)
  async ensureLoanCategory(bookId, key) {
    const cfg = {
      lend:        { type: 'expense', name: 'Cho vay',     icon: 'emoji:💸', color: '#e8806b' },
      borrow:      { type: 'income',  name: 'Đi vay',      icon: 'emoji:💰', color: '#52b788' },
      lendRepay:   { type: 'income',  name: 'Nhận trả nợ', icon: 'emoji:🤲', color: '#6dad75' },
      borrowRepay: { type: 'expense', name: 'Trả nợ',      icon: 'emoji:🤝', color: '#cc7a4f' }
    };
    const c = cfg[key];
    if (!c) return null;
    const all = await window.QLT_Store.getAll('categories');
    let cat = all.find(x => x.bookId === bookId && x._loanCategory === key);
    if (!cat) {
      cat = await window.QLT_Store.put('categories', { ...c, bookId, _loanCategory: key });
    }
    return cat;
  },

  async syncMemberTransactions(bookId, currentMembers, origMembers) {
    const allAccs = await window.QLT_Store.getAll('accounts');
    const accId = (allAccs.find(a => a.bookId === bookId))?.id;
    if (!accId) return;
    const cat = await this.ensureFundCategory(bookId);

    // Xử lý members đã bị xoá
    const currentIds = new Set(currentMembers.map(m => m.id));
    const removed = origMembers.filter(m => !currentIds.has(m.id));
    for (const m of removed) {
      if (m.txId) {
        const tx = await window.QLT_Store.get('transactions', m.txId);
        if (tx) {
          const acc = (await window.QLT_Store.getAll('accounts')).find(a => a.id === tx.accountId);
          if (acc) {
            acc.balance -= tx.amount;
            await window.QLT_Store.put('accounts', acc);
          }
          await window.QLT_Store.del('transactions', m.txId);
        }
      }
    }

    // Sync existing/new members
    for (const m of currentMembers) {
      const contrib = m.contribution || 0;
      if (m.txId) {
        const tx = await window.QLT_Store.get('transactions', m.txId);
        if (tx) {
          const delta = contrib - tx.amount;
          const newNote = `${m.name || 'Thành viên'} đóng quỹ`;
          if (delta !== 0 || tx.note !== newNote) {
            tx.amount = contrib;
            tx.note = newNote;
            await window.QLT_Store.put('transactions', tx);
            if (delta !== 0) {
              const acc = (await window.QLT_Store.getAll('accounts')).find(a => a.id === tx.accountId);
              if (acc) {
                acc.balance += delta;
                await window.QLT_Store.put('accounts', acc);
              }
            }
          }
          continue;
        } else {
          m.txId = null;
        }
      }
      if (!m.txId && contrib > 0) {
        const tx = await window.QLT_Store.put('transactions', {
          type: 'income',
          amount: contrib,
          date: today(),
          accountId: accId,
          categoryId: cat.id,
          note: `${m.name || 'Thành viên'} đóng quỹ`,
          bookId,
          memberId: m.id
        });
        m.txId = tx.id;
        const acc = (await window.QLT_Store.getAll('accounts')).find(a => a.id === accId);
        if (acc) {
          acc.balance += contrib;
          await window.QLT_Store.put('accounts', acc);
        }
      }
    }
  },

  async calculateSettlement(bookId) {
    const book = (await window.QLT_Store.getAll('books')).find(b => b.id === bookId);
    if (!book) return null;
    const members = (book.members || []).filter(m => (m.name && m.name.trim()) || (m.contribution || 0) > 0);
    if (members.length === 0) return null;

    const allTxs = await window.QLT_Store.getAll('transactions');
    const expenses = allTxs.filter(t => t.bookId === bookId && t.type === 'expense');
    const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
    const totalContrib = members.reduce((s, m) => s + (m.contribution || 0), 0);
    const n = members.length;
    const allMemberIds = members.map(m => m.id);

    // Phần dùng từng người: cộng dồn theo từng giao dịch chỉ tính cho người tham gia
    const shareByMember = {};
    members.forEach(m => { shareByMember[m.id] = 0; });

    for (const t of expenses) {
      let parts = Array.isArray(t.participantIds) ? t.participantIds.filter(id => allMemberIds.includes(id)) : null;
      if (!parts || parts.length === 0) parts = allMemberIds; // null/empty → cả nhóm chia
      const per = t.amount / parts.length;
      for (const id of parts) shareByMember[id] = (shareByMember[id] || 0) + per;
    }

    const rows = members.map(m => {
      const share = shareByMember[m.id] || 0;
      const balance = (m.contribution || 0) - share;
      return {
        id: m.id,
        name: m.name || 'Chưa đặt tên',
        contribution: m.contribution || 0,
        share,
        balance,
        action: balance > 0.5 ? 'refund' : balance < -0.5 ? 'pay' : 'even'
      };
    });

    // Cảnh báo: số giao dịch có chọn người riêng (≠ cả nhóm)
    const customCount = expenses.filter(t => Array.isArray(t.participantIds) && t.participantIds.length > 0 && t.participantIds.length < n).length;

    // Khi tổng góp lệch tổng chi, tính trung bình cho riêng nhóm cần đóng / cần nhận
    const surplus = totalContrib - totalExpense;
    const payers = rows.filter(r => r.action === 'pay');
    const receivers = rows.filter(r => r.action === 'refund');
    const avgPay = payers.length ? payers.reduce((s, r) => s + Math.abs(r.balance), 0) / payers.length : 0;
    const avgRefund = receivers.length ? receivers.reduce((s, r) => s + r.balance, 0) / receivers.length : 0;
    const perPerson = n > 0 ? totalExpense / n : 0; // chỉ để tham khảo

    return {
      book, totalExpense, totalContrib, perPerson, surplus, n, rows, customCount,
      payerCount: payers.length, receiverCount: receivers.length, avgPay, avgRefund
    };
  },

  async saveBook() {
    const b = this.state.editingBook;
    const isNew = !b.id;
    b.name = $('#bookName').value.trim();
    b.color = $('#bookColor').value;
    if (!b.name) { QLT_UI.toast('Nhập tên sổ', { type: 'error' }); return; }
    // Loại member rỗng hoàn toàn (không tên + không tiền)
    b.members = (b.members || []).filter(m => (m.name && m.name.trim()) || (m.contribution || 0) > 0);

    const saved = await window.QLT_Store.put('books', b);
    if (isNew) {
      await window.QLT_Store.populateBookDefaults(saved.id);
      window.QLT_Store.setCurrentBookId(saved.id);
    }
    // Sync members ↔ giao dịch đóng quỹ
    if (!isNew) {
      await this.syncMemberTransactions(saved.id, saved.members, this.state._origMembers || []);
      await window.QLT_Store.put('books', saved);
    }
    await this.reload();
    $('#bookEditModal').classList.remove('open');
    $('#bookModal').classList.remove('open');
    this.renderBookHeader();
    this.switchTab('home');
    this.autoSync();
  },

  // ============ EXPORT BOOK ============
  // Tạo và tải PDF trực tiếp bằng html2pdf.js (lazy-load CDN ~150KB)
  // → user nhận file .pdf thực sự, không phụ thuộc Print dialog của WebView
  async exportBookPDF(bookId, includeSettlement = false, includePhotos = false) {
    const html = await this._buildBookReportHTML(bookId, includeSettlement, includePhotos);
    if (!html) return;

    // Lazy-load html2pdf.js
    if (!window.html2pdf) {
      QLT_UI.toast('⏳ Đang tải thư viện PDF (~150KB)...', { duration: 2500 });
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          s.onload = resolve;
          s.onerror = () => reject(new Error('Không tải được — kiểm tra mạng'));
          document.head.appendChild(s);
          setTimeout(() => reject(new Error('Hết thời gian — kiểm tra mạng')), 15000);
        });
      } catch (e) {
        QLT_UI.alert('Không tải được thư viện: ' + e.message + '\n\nThay vào đó bấm "HTML" để tải file rồi mở bằng Chrome → menu ⋮ → In/Lưu PDF.', { title: 'Lỗi' });
        return;
      }
    }

    // Extract body + style từ HTML report → render trong main document
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const stylesHtml = Array.from(doc.querySelectorAll('style')).map(s => s.outerHTML).join('');
    const bodyHtml = doc.body.innerHTML;

    const container = document.createElement('div');
    container.innerHTML = stylesHtml + bodyHtml;
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;color:#000;font-family:DM Sans,sans-serif';
    document.body.appendChild(container);

    const book = this.state.books.find(b => b.id === bookId);
    const suffix = includeSettlement ? 'ket-thuc' : 'trong-dot';
    const filename = `qlt-${this._safe(book?.name || 'so')}-${suffix}-${today()}.pdf`;

    QLT_UI.toast('📄 Đang tạo PDF... (vài giây)', { duration: 8000 });

    try {
      await window.html2pdf().set({
        margin: [10, 10, 12, 10],
        filename,
        image: { type: 'jpeg', quality: 0.85 },
        html2canvas: { scale: 1.3, useCORS: true, logging: false, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait', compress: true },
        pagebreak: { mode: ['css', 'legacy'] }
      }).from(container).save();
      QLT_UI.toast('✓ Đã tải PDF: ' + filename, { type: 'success', duration: 4000 });
    } catch (e) {
      console.error('PDF gen lỗi:', e);
      QLT_UI.alert('Lỗi tạo PDF: ' + (e?.message || e) + '\n\nBấm "HTML" để tải file thay thế.', { title: 'Lỗi PDF' });
    } finally {
      container.remove();
    }
  },

  async exportBookHTML(bookId, includeSettlement = false, includePhotos = false) {
    const book = this.state.books.find(b => b.id === bookId);
    if (!book) return null;
    const html = await this._buildBookReportHTML(bookId, includeSettlement, includePhotos);
    if (!html) return null;
    const suffix = includeSettlement ? 'ket-thuc' : 'trong-dot';
    this._download(html, `qlt-${this._safe(book.name)}-${suffix}-${today()}.html`, 'text/html;charset=utf-8');
    return html;
  },

  async _buildBookReportHTML(bookId, includeSettlement = false, includePhotos = false) {
    const book = this.state.books.find(b => b.id === bookId);
    if (!book) return;
    const allTxs = (await window.QLT_Store.getAll('transactions')).filter(t => t.bookId === bookId);
    const allCats = (await window.QLT_Store.getAll('categories')).filter(c => c.bookId === bookId);
    const allAccs = (await window.QLT_Store.getAll('accounts')).filter(a => a.bookId === bookId);
    const cat = id => allCats.find(c => c.id === id) || {};
    const acc = id => allAccs.find(a => a.id === id) || {};

    const totIn = allTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totOut = allTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const totBal = allAccs.reduce((s, a) => s + (a.balance || 0), 0);

    // Lọc giao dịch "đóng quỹ" (do app tự sinh từ thành viên) khỏi danh sách chi tiết — đã có trong khối Quyết toán
    const isFundTx = t => !!t.memberId;
    let detailTxs = allTxs.filter(t => !isFundTx(t));
    if (!includePhotos) detailTxs = detailTxs.map(t => ({ ...t, photo: null, photos: null }));
    const groups = {};
    for (const t of detailTxs) (groups[t.date] = groups[t.date] || []).push(t);
    const dates = Object.keys(groups).sort().reverse();

    const expByCat = {};
    for (const t of allTxs) {
      if (t.type !== 'expense') continue;
      expByCat[t.categoryId] = (expByCat[t.categoryId] || 0) + t.amount;
    }
    const breakdown = Object.entries(expByCat).map(([cid, val]) => ({
      cat: cat(cid),
      value: val,
      pct: totOut > 0 ? (val / totOut * 100).toFixed(1) : '0'
    })).sort((a, b) => b.value - a.value);

    const exportedAt = new Date().toLocaleString('vi-VN');
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const settlement = includeSettlement ? await this.calculateSettlement(bookId) : null;
    const reportType = includeSettlement ? 'KẾT THÚC – có quyết toán' : 'TRONG ĐỢT (chưa chốt)';

    const photoCell = t => {
      if (!includePhotos) return '';
      const photos = this.getTxPhotos(t);
      if (photos.length === 0) return '<td class="tx-photo"></td>';
      const imgs = photos.map((p, i) => `<a href="${p}" target="_blank"><img src="${p}" alt="minh chứng ${i + 1}"></a>`).join('');
      return `<td class="tx-photo">${imgs}</td>`;
    };
    // Số thành viên trong sổ (để hiện badge "5/8 người" cho GD chia riêng)
    const bookMembers = (book.members || []).filter(m => m.name && m.name.trim());
    const memById = Object.fromEntries(bookMembers.map(m => [m.id, m.name]));
    const partBadge = t => {
      if (t.type !== 'expense' || !Array.isArray(t.participantIds) || t.participantIds.length === 0 || t.participantIds.length === bookMembers.length) return '';
      const names = t.participantIds.map(id => memById[id]).filter(Boolean).join(', ');
      return `<div style="display:inline-block;background:#fff8e0;border:1px solid #f4d77c;color:#856404;padding:1px 8px;border-radius:10px;font-size:11px;font-style:normal;margin-left:6px" title="${esc(names)}">${t.participantIds.length}/${bookMembers.length} người</div>`;
    };
    const txRow = t => {
      if (t.type === 'transfer') {
        const fromN = esc((acc(t.accountId)).name || '');
        const toN = esc((acc(t.toAccountId)).name || '');
        return `
          <tr class="tx-row tx-transfer">
            <td class="tx-cat">↻ Chuyển tiền</td>
            <td class="tx-acc">${fromN} → ${toN}</td>
            <td class="tx-note">${esc(t.note || '')}</td>
            <td class="tx-amt transfer">${fmt(t.amount)}đ</td>
            ${photoCell(t)}
          </tr>
        `;
      }
      const c = cat(t.categoryId);
      const a = acc(t.accountId);
      const sign = t.type === 'income' ? '+' : '-';
      const cls = t.type === 'income' ? 'pos' : 'neg';
      return `
        <tr class="tx-row">
          <td class="tx-cat" style="border-left:4px solid ${esc(c.color || '#888')}">${esc(c.name || '')}</td>
          <td class="tx-acc">${esc(a.name || '')}</td>
          <td class="tx-note">${esc(t.note || '')}${partBadge(t)}</td>
          <td class="tx-amt ${cls}">${sign}${fmt(t.amount)}đ</td>
          ${photoCell(t)}
        </tr>
      `;
    };

    const fmtDate = d => {
      if (!d) return '';
      const [y, m, day] = d.split('-');
      return `${day}/${m}/${y}`;
    };

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sổ ${esc(book.name)} — Báo cáo</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI','Roboto','DM Sans',sans-serif;background:#f2f5f0;color:#1a2a1f;line-height:1.5;padding:16px}
.report{max-width:900px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
header{background:linear-gradient(135deg,${esc(book.color || '#2d6a4f')},#52b788);color:#fff;padding:24px}
header h1{font-size:24px;margin-bottom:4px}
.meta{font-size:13px;opacity:.92}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;padding:16px}
.card{background:#f8faf7;border:1px solid #e0e6dc;border-radius:10px;padding:14px}
.card .lbl{font-size:11px;color:#5e6b62;text-transform:uppercase;letter-spacing:.5px;font-weight:700}
.card .val{font-size:20px;font-weight:700;margin-top:4px}
.val.pos{color:#2d8659}.val.neg{color:#e63946}
section{padding:0 16px 18px}
h2{font-size:15px;font-weight:700;color:#2d6a4f;margin:8px 0 10px;padding:8px 0;border-bottom:2px solid #2d6a4f}
table{width:100%;border-collapse:collapse;font-size:13px}
table th{text-align:left;font-weight:600;color:#5e6b62;padding:10px 8px;border-bottom:1px solid #e0e6dc;background:#f8faf7}
table td{padding:10px 8px;border-bottom:1px solid #f0eee8;vertical-align:top}
.day-block{margin-bottom:14px}
.day-head{display:flex;justify-content:space-between;align-items:center;background:#e8f5ee;color:#2d6a4f;padding:8px 12px;border-radius:8px;font-weight:600;margin-bottom:6px;font-size:13px}
.day-totals{display:flex;gap:12px;font-size:12px}
.tx-row .tx-cat{font-weight:600;padding-left:10px}
.tx-row .tx-acc{color:#5e6b62;font-size:12px}
.tx-row .tx-note{color:#5e6b62;font-size:12px;font-style:italic}
.tx-row .tx-amt{text-align:right;font-weight:700;white-space:nowrap}
.tx-amt.pos{color:#2d8659}.tx-amt.neg{color:#e63946}.tx-amt.transfer{color:#4f86c6}
.tx-photo img{width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid #e0e6dc;cursor:zoom-in}
footer{padding:16px;color:#9aa39c;font-size:11px;text-align:center;border-top:1px solid #e0e6dc}
@media print{body{background:#fff;padding:0}.report{box-shadow:none}}
</style>
</head>
<body>
<div class="report">
  <header>
    <h1>${esc(book.name)}</h1>
    <div class="meta">Báo cáo xuất ${exportedAt} · ${allTxs.length} giao dịch</div>
    <div class="meta" style="margin-top:6px;display:inline-block;background:rgba(255,255,255,.18);padding:3px 10px;border-radius:12px;font-weight:600;font-size:11px;letter-spacing:.5px">${reportType}</div>
  </header>
  <section>
    <div class="summary">
      <div class="card"><div class="lbl">Tổng thu</div><div class="val pos">+${fmt(totIn)}đ</div></div>
      <div class="card"><div class="lbl">Tổng chi</div><div class="val neg">-${fmt(totOut)}đ</div></div>
      <div class="card"><div class="lbl">Chênh lệch</div><div class="val ${totIn - totOut >= 0 ? 'pos' : 'neg'}">${totIn - totOut >= 0 ? '+' : ''}${fmt(totIn - totOut)}đ</div></div>
      <div class="card"><div class="lbl">Số dư ví hiện tại</div><div class="val">${fmt(totBal)}đ</div></div>
    </div>
  </section>
  ${allAccs.length ? `
  <section>
    <h2>Số dư các ví</h2>
    <table>
      <tr><th>Ví</th><th style="text-align:right">Số dư</th></tr>
      ${allAccs.map(a => `<tr><td>${esc(a.name)}</td><td style="text-align:right;font-weight:700;${(a.balance || 0) < 0 ? 'color:#e63946' : ''}">${fmt(a.balance || 0)}đ</td></tr>`).join('')}
    </table>
  </section>` : ''}
  ${breakdown.length ? `
  <section>
    <h2>Chi tiêu theo danh mục</h2>
    <table>
      <tr><th>Danh mục</th><th style="text-align:right">Số tiền</th><th style="text-align:right">Tỷ lệ</th></tr>
      ${breakdown.map(b => `<tr><td style="border-left:4px solid ${esc(b.cat.color || '#888')};padding-left:10px">${esc(b.cat.name || 'Không rõ')}</td><td style="text-align:right;font-weight:700">${fmt(b.value)}đ</td><td style="text-align:right;color:#5e6b62">${b.pct}%</td></tr>`).join('')}
    </table>
  </section>` : ''}
  <section>
    <h2>Chi tiết giao dịch</h2>
    ${dates.length === 0 ? '<p style="color:#9aa39c;text-align:center;padding:20px">Chưa có giao dịch</p>' : dates.map(d => {
      const dayTxs = groups[d];
      const dIn = dayTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const dOut = dayTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      return `
        <div class="day-block">
          <div class="day-head">
            <div>${fmtDate(d)}</div>
            <div class="day-totals">
              ${dIn > 0 ? `<span style="color:#2d8659">+${fmt(dIn)}đ</span>` : ''}
              ${dOut > 0 ? `<span style="color:#e63946">-${fmt(dOut)}đ</span>` : ''}
            </div>
          </div>
          <table>
            <thead><tr>
              <th>Danh mục</th>
              <th>Hình thức thanh toán</th>
              <th>Ghi chú</th>
              <th style="text-align:right">Tổng tiền</th>
              ${includePhotos ? '<th>Minh chứng</th>' : ''}
            </tr></thead>
            <tbody>${dayTxs.map(txRow).join('')}</tbody>
          </table>
        </div>
      `;
    }).join('')}
  </section>
  ${settlement ? `
  <section style="background:#fff8e0;border:2px solid #f4d77c;border-radius:10px;margin:18px 16px;padding:16px;page-break-before:always">
    <h2 style="border-bottom-color:#b8860b;color:#856404;margin-top:0">⚖️ Quyết toán chia tiền cuối chuyến</h2>
    <div class="summary">
      <div class="card"><div class="lbl">Tổng quỹ góp</div><div class="val">${fmt(settlement.totalContrib)}đ</div></div>
      <div class="card"><div class="lbl">Tổng đã chi</div><div class="val neg">-${fmt(settlement.totalExpense)}đ</div></div>
      <div class="card"><div class="lbl">${settlement.surplus >= 0 ? 'Quỹ còn dư' : 'Quỹ bị hụt'}</div><div class="val ${settlement.surplus >= 0 ? 'pos' : 'neg'}">${settlement.surplus >= 0 ? '+' : ''}${fmt(settlement.surplus)}đ</div></div>
      <div class="card"><div class="lbl">${settlement.customCount > 0 ? 'GD chia riêng' : 'TB mỗi người'}</div><div class="val">${settlement.customCount > 0 ? settlement.customCount + ' GD' : fmt(Math.round(settlement.perPerson)) + 'đ'}</div></div>
    </div>
    ${settlement.customCount > 0 ? `<div style="background:#fff;border-radius:8px;padding:8px 12px;margin-top:8px;font-size:12px;color:#856404">⚠ Có ${settlement.customCount} giao dịch không chia đều cả nhóm — phần dùng từng người được tính riêng theo người tham gia.</div>` : ''}
    ${(settlement.payerCount > 0 || settlement.receiverCount > 0) ? `
    <div style="background:#fff;border-radius:8px;padding:12px 14px;margin-top:12px;font-size:13px;line-height:1.7">
      ${settlement.receiverCount > 0 ? `<div><strong style="color:#2d8659">Cần trả lại:</strong> ${settlement.receiverCount} người, trung bình mỗi người nhận lại <strong>${fmt(Math.round(settlement.avgRefund))}đ</strong></div>` : ''}
      ${settlement.payerCount > 0 ? `<div><strong style="color:#e63946">Cần đóng thêm:</strong> ${settlement.payerCount} người, trung bình mỗi người góp thêm <strong>${fmt(Math.round(settlement.avgPay))}đ</strong></div>` : ''}
    </div>` : ''}
    <table style="margin-top:12px;background:#fff;border-radius:8px;overflow:hidden">
      <tr><th>Người</th><th style="text-align:right">Đã góp</th><th style="text-align:right">Phần dùng</th><th style="text-align:right">Quyết toán</th></tr>
      ${settlement.rows.map(r => {
        const action = r.action === 'refund'
          ? `<span style="color:#2d8659;font-weight:700">↩ Trả lại ${fmt(Math.round(r.balance))}đ</span>`
          : r.action === 'pay'
          ? `<span style="color:#e63946;font-weight:700">+ Đóng thêm ${fmt(Math.abs(Math.round(r.balance)))}đ</span>`
          : `<span style="color:#5e6b62;font-weight:700">✓ Vừa đủ</span>`;
        return `<tr><td><strong>${esc(r.name)}</strong></td><td style="text-align:right">${fmt(r.contribution)}đ</td><td style="text-align:right">${fmt(Math.round(r.share))}đ</td><td style="text-align:right">${action}</td></tr>`;
      }).join('')}
    </table>
  </section>` : ''}
  <footer>
    <div>Xuất từ app <strong>Quản Lý Tiền</strong> · ${exportedAt}</div>
    <div style="margin-top:4px">© 2026 <strong>Nguyễn Thanh</strong> · Mọi quyền được bảo lưu · Liên hệ: Zalo 0909683666</div>
  </footer>
</div>
</body>
</html>`;

    return html;
  },

  async exportBookCSV(bookId, includeSettlement = false) {
    const book = this.state.books.find(b => b.id === bookId);
    if (!book) return;
    const txs = (await window.QLT_Store.getAll('transactions')).filter(t => t.bookId === bookId);
    const cats = (await window.QLT_Store.getAll('categories')).filter(c => c.bookId === bookId);
    const accs = (await window.QLT_Store.getAll('accounts')).filter(a => a.bookId === bookId);

    const bookMembers = (book.members || []).filter(m => m.name && m.name.trim());
    const memById = Object.fromEntries(bookMembers.map(m => [m.id, m.name]));
    const rows = [['Ngày', 'Loại', 'Số tiền (VND)', 'Tài khoản', 'Đến tài khoản', 'Danh mục', 'Ghi chú', 'Người tham gia']];
    for (const t of [...txs].filter(x => !x.memberId).sort((a, b) => a.date.localeCompare(b.date))) {
      const c = cats.find(x => x.id === t.categoryId);
      const a = accs.find(x => x.id === t.accountId);
      const ta = accs.find(x => x.id === t.toAccountId);
      let parts = '';
      if (t.type === 'expense' && bookMembers.length > 0) {
        parts = (Array.isArray(t.participantIds) && t.participantIds.length < bookMembers.length)
          ? t.participantIds.map(id => memById[id]).filter(Boolean).join('; ')
          : 'Cả nhóm';
      }
      rows.push([
        t.date,
        t.type === 'expense' ? 'Chi phí' : t.type === 'income' ? 'Thu nhập' : 'Chuyển khoản',
        t.amount,
        a?.name || '',
        ta?.name || '',
        c?.name || '',
        t.note || '',
        parts
      ]);
    }

    if (includeSettlement) {
      const s = await this.calculateSettlement(bookId);
      if (s) {
        rows.push([]);
        rows.push(['=== QUYẾT TOÁN CHIA TIỀN CUỐI CHUYẾN ===']);
        rows.push(['Tổng quỹ góp', s.totalContrib]);
        rows.push(['Tổng đã chi', s.totalExpense]);
        rows.push([s.surplus >= 0 ? 'Quỹ còn dư' : 'Quỹ bị hụt', s.surplus]);
        rows.push(['Phần mỗi người', Math.round(s.perPerson)]);
        if (s.receiverCount > 0) rows.push([`Cần trả lại (${s.receiverCount} người)`, `Trung bình ${Math.round(s.avgRefund)}đ/người`]);
        if (s.payerCount > 0) rows.push([`Cần đóng thêm (${s.payerCount} người)`, `Trung bình ${Math.round(s.avgPay)}đ/người`]);
        rows.push([]);
        rows.push(['Người', 'Đã góp', 'Phần dùng', 'Chênh lệch', 'Quyết toán']);
        for (const r of s.rows) {
          const action = r.action === 'refund' ? `Trả lại ${Math.round(r.balance)}đ`
                      : r.action === 'pay' ? `Đóng thêm ${Math.abs(Math.round(r.balance))}đ`
                      : 'Vừa đủ';
          rows.push([r.name, r.contribution, Math.round(r.share), Math.round(r.balance), action]);
        }
      }
    }

    rows.push([]);
    rows.push(['© 2026 Nguyễn Thanh — Mọi quyền được bảo lưu — Liên hệ: Zalo 0909683666']);
    rows.push(['Xuất từ app Quản Lý Tiền']);

    const csv = '﻿' + rows.map(r => r.map(c => {
      const s = String(c == null ? '' : c).replace(/"/g, '""');
      return /[,"\n]/.test(s) ? `"${s}"` : s;
    }).join(',')).join('\n');

    const suffix = includeSettlement ? 'ket-thuc' : 'trong-dot';
    this._download(csv, `qlt-${this._safe(book.name)}-${suffix}-${today()}.csv`, 'text/csv;charset=utf-8');
  },

  async exportFinal(format) {
    if (!this.state.editingBook?.id) return;
    const ok = await QLT_UI.confirm(
      'Bạn chắc chuyến đi đã kết thúc?\n\nBáo cáo này sẽ chứa quyết toán chia tiền cho từng người. Hãy chỉ chia sẻ khi đã chốt mọi giao dịch.',
      { title: 'Xuất báo cáo kết thúc', okLabel: 'Đã chốt — Xuất' }
    );
    if (!ok) return;
    const bookId = this.state.editingBook.id;
    const photos = !!$('#bookExportPhotos')?.checked;
    if (format === 'html') await this.exportBookHTML(bookId, true, photos);
    else if (format === 'pdf') await this.exportBookPDF(bookId, true, photos);
    else if (format === 'csv') await this.exportBookCSV(bookId, true);
  },

  _safe(s) {
    return String(s || 'so').replace(/[^\w\sÀ-ỹ-]/gi, '').replace(/\s+/g, '-').toLowerCase();
  },

  _download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async deleteBook() {
    const b = this.state.editingBook;
    if (!b.id) return;
    if (this.state.books.length <= 1) {
      await QLT_UI.alert('Không thể xoá sổ duy nhất', { title: 'Không thể xoá' });
      return;
    }
    const txCount = (await window.QLT_Store.getAllInBook('transactions', b.id)).length;
    if (!await QLT_UI.confirm(`Xoá sổ "${b.name}"?\n\nSẽ xoá vĩnh viễn ${txCount} giao dịch + toàn bộ tài khoản, danh mục, nhắc nhở trong sổ.\n\nKhông thể hoàn tác.`, { title: 'Xác nhận xoá', okLabel: 'Xoá vĩnh viễn', danger: true })) return;
    await window.QLT_Store.deleteBook(b.id);
    if (this.state.currentBookId === b.id) {
      const remaining = (await window.QLT_Store.getAll('books')).filter(x => x.id !== b.id);
      if (remaining[0]) window.QLT_Store.setCurrentBookId(remaining[0].id);
    }
    await this.reload();
    $('#bookEditModal').classList.remove('open');
    $('#bookModal').classList.remove('open');
    this.renderBookHeader();
    this.switchTab('home');
    this.autoSync();
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
window.QLT_App = App;
