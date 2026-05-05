// OCR hoá đơn — đa nguồn
// - Native (APK Android): Google ML Kit Text Recognition (on-device, ~95% accurate
//   trên ảnh chuyển khoản app ngân hàng có gradient/chữ stylized)
// - Web/PWA: Tesseract.js (fallback, chậm hơn, kém hơn nhưng không cần plugin)

(function () {
  let _worker = null;
  let _loading = null;

  // ---------- Tesseract worker ----------
  async function getWorker() {
    if (_worker) return _worker;
    if (_loading) return _loading;
    _loading = (async () => {
      if (!window.Tesseract) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
          s.onload = resolve;
          s.onerror = () => reject(new Error('Không tải được Tesseract.js'));
          document.head.appendChild(s);
        });
      }
      const w = await Tesseract.createWorker(['vie', 'eng'], 1, { logger: () => {} });
      _worker = w;
      return w;
    })();
    return _loading;
  }

  // ---------- Image preprocess (cho Tesseract) ----------
  function preprocessForTesseract(dataUrl) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1600;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
          else { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        try {
          const id = ctx.getImageData(0, 0, w, h);
          const d = id.data;
          const contrast = 1.4;
          for (let i = 0; i < d.length; i += 4) {
            let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            g = Math.max(0, Math.min(255, (g - 128) * contrast + 128));
            d[i] = d[i + 1] = d[i + 2] = g;
          }
          ctx.putImageData(id, 0, 0);
        } catch (_) {}
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // ---------- Helpers ----------
  function stripDatesAndTimes(text) {
    if (!text) return '';
    return text
      .replace(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g, ' ')
      .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, ' ')
      .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ');
  }

  function toN(s) {
    const n = parseInt(String(s).replace(/[.,\s]/g, ''), 10);
    if (!isFinite(n) || n < 1000 || n > 1e10) return null;
    return n;
  }

  function parseDate(text) {
    const re1 = /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/;
    const m1 = text.match(re1);
    if (m1) {
      let [_, d, mo, y] = m1;
      if (y.length === 2) y = '20' + y;
      const dd = String(d).padStart(2, '0');
      const mm = String(mo).padStart(2, '0');
      return `${y}-${mm}-${dd}`;
    }
    return null;
  }

  function parseMerchant(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines.slice(0, 5)) {
      if (line.length >= 3 && line.length <= 50 && /[a-zA-ZÀ-ỹ]/.test(line)) {
        return line;
      }
    }
    return null;
  }

  // ---------- Parser tier-based (dùng cho text-only fallback) ----------
  function parseAmountFromText(text) {
    if (!text) return null;
    text = stripDatesAndTimes(text);

    // Tier 1: số có hậu tố VND/đ
    const RE_WITH_CCY = /(\d{1,3}(?:[.,\s]\d{3})+|\d{4,9})\s*(VND|VNĐ|VNÐ|đ)\b/gi;
    const t1 = []; let m;
    while ((m = RE_WITH_CCY.exec(text)) !== null) {
      const n = toN(m[1]); if (n) t1.push(n);
    }
    if (t1.length) return Math.max(...t1);

    // Tier 2: dòng có keyword tiền (kèm 2 dòng kế tiếp)
    const KW = /(số tiền|tổng|thanh toán|cộng|total|amount|chuyển khoản|chuyển tiền|giao dịch|thành công|paid)/i;
    const lines = text.split('\n');
    const t2 = [];
    for (let i = 0; i < lines.length; i++) {
      if (!KW.test(lines[i])) continue;
      const block = lines.slice(i, i + 3).join(' ');
      const re = /(\d{1,3}(?:[.,\s]\d{3})+|\d{4,9})/g;
      let mm;
      while ((mm = re.exec(block)) !== null) {
        const n = toN(mm[1]); if (n) t2.push(n);
      }
    }
    if (t2.length) return Math.max(...t2);

    // Tier 3: số có dấu phân cách
    const t3 = [];
    const RE_FMT = /\b(\d{1,3}(?:[.,\s]\d{3})+)\b/g;
    let m3;
    while ((m3 = RE_FMT.exec(text)) !== null) {
      const n = toN(m3[1]); if (n) t3.push(n);
    }
    if (t3.length) return Math.max(...t3);

    // Tier 4: số trần 4-9 chữ số
    const t4 = [];
    const RE_RAW = /\b\d{4,9}\b/g;
    let m4;
    while ((m4 = RE_RAW.exec(text)) !== null) {
      const n = toN(m4[0]); if (n) t4.push(n);
    }
    if (t4.length) return Math.max(...t4);

    return null;
  }

  // ---------- Parser cho ML Kit (có spatial info) ----------
  // ML Kit trả về blocks → lines, mỗi line có boundingBox {left,top,right,bottom}
  // Chiến lược: số tiền = số có chiều cao font LỚN NHẤT + có VND + có dấu phân cách
  function parseFromMlKit(result) {
    const blocks = result.blocks || [];
    const lines = [];
    for (const block of blocks) {
      for (const line of (block.lines || [])) {
        const bb = line.boundingBox || {};
        const h = (bb.bottom != null && bb.top != null) ? Math.abs(bb.bottom - bb.top) : 0;
        lines.push({ text: line.text || '', height: h });
      }
    }
    const fullText = result.text || lines.map(l => l.text).join('\n');

    // Quét từng line, chấm điểm theo (chiều cao font × bonus VND × bonus separator)
    const candidates = [];
    const RE = /(\d{1,3}(?:[.,\s]\d{3})+|\d{4,9})(\s*(VND|VNĐ|VNÐ|đ)\b)?/gi;
    for (const line of lines) {
      const cleaned = stripDatesAndTimes(line.text);
      let m;
      while ((m = RE.exec(cleaned)) !== null) {
        const n = toN(m[1]);
        if (!n) continue;
        const hasCcy = !!m[3];
        const hasSep = /[.,\s]/.test(m[1]);
        const score = (line.height || 1) * (hasCcy ? 100 : 1) * (hasSep ? 5 : 1);
        candidates.push({ n, score });
      }
    }

    let amount = null;
    if (candidates.length) {
      candidates.sort((a, b) => b.score - a.score);
      amount = candidates[0].n;
    } else {
      amount = parseAmountFromText(fullText);
    }

    return {
      rawText: fullText,
      amount,
      date: parseDate(fullText),
      merchant: parseMerchant(fullText)
    };
  }

  // ---------- ML Kit caller (native) ----------
  async function recognizeNative(dataUrl) {
    const Plugin = window.Capacitor?.Plugins?.MlKitTextRecognition;
    if (!Plugin) throw new Error('Plugin MlKitTextRecognition chưa cài');
    // Plugin nhận base64 thuần — bỏ prefix "data:image/...;base64,"
    const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    const base64 = m ? m[2] : dataUrl;
    const result = await Plugin.detectText({ base64Image: base64 });
    return parseFromMlKit(result);
  }

  // ---------- API chính ----------
  const Ocr = {
    async recognize(imageDataUrl, onProgress) {
      // Thử ML Kit trước (chỉ trên native + plugin có)
      const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform?.());
      if (isNative && window.Capacitor?.Plugins?.MlKitTextRecognition) {
        try {
          if (onProgress) onProgress({ stage: 'recognizing', progress: 0.3 });
          const r = await recognizeNative(imageDataUrl);
          if (onProgress) onProgress({ stage: 'done', progress: 1 });
          return r;
        } catch (e) {
          console.warn('ML Kit lỗi, fallback Tesseract:', e);
        }
      }

      // Fallback: Tesseract (web hoặc khi ML Kit fail)
      const w = await getWorker();
      if (onProgress) onProgress({ stage: 'preprocessing', progress: 0.05 });
      const prepped = await preprocessForTesseract(imageDataUrl);
      if (onProgress) onProgress({ stage: 'recognizing', progress: 0.1 });
      const { data } = await w.recognize(prepped);
      if (onProgress) onProgress({ stage: 'done', progress: 1 });
      const text = data.text || '';
      return {
        rawText: text,
        amount: parseAmountFromText(text),
        date: parseDate(text),
        merchant: parseMerchant(text)
      };
    },

    async terminate() {
      if (_worker) {
        await _worker.terminate();
        _worker = null;
      }
    }
  };

  window.QLT_Ocr = Ocr;
})();
