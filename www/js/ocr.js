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
    // Tìm số tiền lớn nhất trong text - thường là tổng cộng
    const candidates = [];
    // Pattern: 1,234,567 hoặc 1.234.567 hoặc 1234567 (3+ chữ số)
    const re = /(\d{1,3}([.,]\d{3})+|\d{4,})(\s*(VND|VNĐ|đ|d))?/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const raw = m[1].replace(/[.,]/g, '');
      const n = parseInt(raw, 10);
      if (n >= 1000 && n <= 1e10) candidates.push(n);
    }
    if (candidates.length === 0) return null;
    // Ưu tiên số xuất hiện gần keyword "tổng", "thanh toán", "cộng"
    const lines = text.split('\n');
    for (const line of lines) {
      if (/(tổng|thanh toán|cộng|total)/i.test(line)) {
        const re2 = /(\d{1,3}([.,]\d{3})+|\d{4,})/g;
        let mm;
        let best = 0;
        while ((mm = re2.exec(line)) !== null) {
          const n = parseInt(mm[1].replace(/[.,]/g, ''), 10);
          if (n > best) best = n;
        }
        if (best > 0) return best;
      }
    }
    return Math.max(...candidates);
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
