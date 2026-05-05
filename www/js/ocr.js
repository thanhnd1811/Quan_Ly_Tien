// OCR hoá đơn dùng Tesseract.js (lazy load khi user dùng)
// Hoạt động offline sau khi tải thư viện + ngôn ngữ về cache

(function () {
  let _worker = null;
  let _loading = null;

  async function getWorker() {
    if (_worker) return _worker;
    if (_loading) return _loading;
    _loading = (async () => {
      // Load Tesseract từ CDN khi cần
      if (!window.Tesseract) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
          s.onload = resolve;
          s.onerror = () => reject(new Error('Không tải được Tesseract.js'));
          document.head.appendChild(s);
        });
      }
      const w = await Tesseract.createWorker(['vie', 'eng'], 1, {
        logger: () => {}
      });
      _worker = w;
      return w;
    })();
    return _loading;
  }

  // Tiền xử lý ảnh: resize + grayscale + tăng contrast → giúp Tesseract đọc
  // tốt hơn ảnh stylized (chữ vàng nền đỏ kiểu thông báo chuyển khoản MB Bank)
  function preprocessForOcr(dataUrl) {
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
            // Luminance grayscale
            let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
            // Boost contrast
            g = Math.max(0, Math.min(255, (g - 128) * contrast + 128));
            d[i] = d[i + 1] = d[i + 2] = g;
          }
          ctx.putImageData(id, 0, 0);
        } catch (_) { /* CORS / canvas tainted — skip preprocess */ }
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // Bỏ date / time khỏi text để các số như "2026" hoặc "1149" trong giờ
  // không bị nhặt nhầm thành số tiền
  function stripDatesAndTimes(text) {
    if (!text) return '';
    return text
      // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy
      .replace(/\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g, ' ')
      // yyyy-mm-dd
      .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, ' ')
      // hh:mm[:ss]
      .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ');
  }

  function parseAmount(text) {
    if (!text) return null;
    text = stripDatesAndTimes(text);
    // Chuyển 1 chuỗi số → int VND, hoặc null nếu ngoài ngưỡng tiền hợp lý
    const toN = (s) => {
      const n = parseInt(String(s).replace(/[.,\s]/g, ''), 10);
      if (!isFinite(n) || n < 1000 || n > 1e10) return null;
      return n;
    };

    // Tier 1: số có hậu tố VND/VNĐ/đ ngay sau — gần như chắc chắn là tiền
    // Cho phép cả khoảng trắng làm dấu phân cách (1 440 000 VND)
    const RE_WITH_CCY = /(\d{1,3}(?:[.,\s]\d{3})+|\d{4,9})\s*(VND|VNĐ|VNÐ|đ)\b/gi;
    const tier1 = [];
    let m;
    while ((m = RE_WITH_CCY.exec(text)) !== null) {
      const n = toN(m[1]);
      if (n) tier1.push(n);
    }
    if (tier1.length) return Math.max(...tier1);

    // Tier 2: số trên dòng có keyword tiền — HOẶC trên 1-2 dòng kế tiếp
    // (vì app ngân hàng hay đặt số tiền ở dòng dưới tiêu đề)
    const KEYWORDS = /(số tiền|tổng|thanh toán|cộng|total|amount|chuyển khoản|chuyển tiền|giao dịch|thành công|paid)/i;
    const lines = text.split('\n');
    const tier2 = [];
    for (let i = 0; i < lines.length; i++) {
      if (!KEYWORDS.test(lines[i])) continue;
      const block = lines.slice(i, i + 3).join(' ');
      const re = /(\d{1,3}(?:[.,\s]\d{3})+|\d{4,9})/g;
      let mm;
      while ((mm = re.exec(block)) !== null) {
        const n = toN(mm[1]);
        if (n) tier2.push(n);
      }
    }
    if (tier2.length) return Math.max(...tier2);

    // Tier 3: bất kỳ số có dấu phân cách (dấu chấm/phẩy/khoảng trắng)
    const tier3 = [];
    const RE_FORMATTED = /\b(\d{1,3}(?:[.,\s]\d{3})+)\b/g;
    let m3;
    while ((m3 = RE_FORMATTED.exec(text)) !== null) {
      const n = toN(m3[1]);
      if (n) tier3.push(n);
    }
    if (tier3.length) return Math.max(...tier3);

    // Tier 4: số trần 4-9 chữ số (cap 9 để loại STK / mã GD dài)
    const tier4 = [];
    const RE_RAW = /\b\d{4,9}\b/g;
    let m4;
    while ((m4 = RE_RAW.exec(text)) !== null) {
      const n = toN(m4[0]);
      if (n) tier4.push(n);
    }
    if (tier4.length) return Math.max(...tier4);

    return null;
  }

  function parseDate(text) {
    // dd/mm/yyyy hoặc dd-mm-yyyy hoặc yyyy-mm-dd
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
    // Lấy dòng đầu tiên có chữ thường (tên cửa hàng thường là dòng đầu)
    for (const line of lines.slice(0, 5)) {
      if (line.length >= 3 && line.length <= 50 && /[a-zA-ZÀ-ỹ]/.test(line)) {
        return line;
      }
    }
    return null;
  }

  const Ocr = {
    async recognize(imageDataUrl, onProgress) {
      const w = await getWorker();
      if (onProgress) onProgress({ stage: 'preprocessing', progress: 0.05 });
      const prepped = await preprocessForOcr(imageDataUrl);
      if (onProgress) onProgress({ stage: 'recognizing', progress: 0.1 });
      const { data } = await w.recognize(prepped);
      if (onProgress) onProgress({ stage: 'done', progress: 1 });
      const text = data.text || '';
      return {
        rawText: text,
        amount: parseAmount(text),
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
