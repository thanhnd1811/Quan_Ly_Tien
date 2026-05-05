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

  function parseAmount(text) {
    if (!text) return null;
    // Chuyển 1 số chuỗi → int VND, hoặc null nếu ngoài ngưỡng hợp lý
    // (1,000 → 10 tỷ — vượt là gần như chắc chắn không phải tiền)
    const toN = (s) => {
      const n = parseInt(String(s).replace(/[.,\s]/g, ''), 10);
      if (!isFinite(n) || n < 1000 || n > 1e10) return null;
      return n;
    };

    // Tier 1: số có hậu tố VND/VNĐ/đ ngay sau — gần như chắc chắn là tiền
    // VD: "1,440,000 VND" / "1.440.000đ" / "500000 VNĐ"
    const RE_WITH_CCY = /(\d{1,3}(?:[.,]\d{3})+|\d{4,9})\s*(VND|VNĐ|VNÐ|đ)\b/gi;
    const tier1 = [];
    let m;
    while ((m = RE_WITH_CCY.exec(text)) !== null) {
      const n = toN(m[1]);
      if (n) tier1.push(n);
    }
    if (tier1.length) return Math.max(...tier1);

    // Tier 2: số nằm trên dòng có keyword tiền (gồm cả các app chuyển khoản VN)
    const KEYWORDS = /(số tiền|tổng|thanh toán|cộng|total|amount|chuyển khoản|giao dịch thành công|paid)/i;
    const tier2 = [];
    for (const line of text.split('\n')) {
      if (!KEYWORDS.test(line)) continue;
      let mm;
      const re = /(\d{1,3}(?:[.,]\d{3})+|\d{4,9})/g;
      while ((mm = re.exec(line)) !== null) {
        const n = toN(mm[1]);
        if (n) tier2.push(n);
      }
    }
    if (tier2.length) return Math.max(...tier2);

    // Tier 3: bất kỳ số có dấu phân cách (1,440,000 / 1.440.000)
    // Loại trừ dãy số dài liền không format (STK, mã GD) ở tier này
    const tier3 = [];
    const RE_FORMATTED = /\b(\d{1,3}(?:[.,]\d{3})+)\b/g;
    let m3;
    while ((m3 = RE_FORMATTED.exec(text)) !== null) {
      const n = toN(m3[1]);
      if (n) tier3.push(n);
    }
    if (tier3.length) return Math.max(...tier3);

    // Tier 4: số trần 4-9 chữ số (cap 9 để loại STK ngân hàng 10+ chữ số / mã GD)
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
      if (onProgress) onProgress({ stage: 'recognizing', progress: 0.1 });
      const { data } = await w.recognize(imageDataUrl);
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
