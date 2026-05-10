// ============================================================
// SMS Bank Parser — parse tin nhắn giao dịch ngân hàng VN
// ============================================================
// Hỗ trợ: Vietcombank (VCB), Techcombank (TCB), MBBank (MB),
//         ACB, BIDV, VPBank, Agribank, TPBank, Sacombank, VietinBank
//
// Mỗi NH có format SMS khác nhau, cần regex riêng. Format có thể đổi
// theo thời gian — nếu thấy parse fail, kiểm tra lại regex từ SMS thật.
// ============================================================

(function () {
  'use strict';

  // Detect bank từ sender address (VD: "Vietcombank", "TCB", "BIDV", "+84902xxx")
  // Hoặc từ package name của notif (vd "com.VCB" → 'vcb', "com.mbmobile" → 'mb')
  // Trả về bank key hoặc null nếu không phải bank SMS.
  function detectBank(address) {
    if (!address) return null;
    const a = String(address).toUpperCase();
    // Match từ tên/package — broad regex catch nhiều variant
    if (/VCB|VIETCOMBANK|DIGIBANK/.test(a)) return 'vcb';
    if (/TCB|TECHCOMBANK/.test(a)) return 'tcb';
    if (/MBBANK|MB.BANK|MOBILEBANKING|MBMOBILE|^MB(?!SB|FC)/.test(a)) return 'mb';
    if (/\bACB\b|ACBONE|ACB.BANK|ACB.MOBILE/.test(a)) return 'acb';
    if (/BIDV|SMARTBANKING/.test(a)) return 'bidv';
    if (/VPB|VPBANK|VPB.NEO/.test(a)) return 'vpb';
    if (/AGRIBANK|VBA|AGRIBANKPLUS/.test(a)) return 'agri';
    if (/TPB|TPBANK|TPBMB/.test(a)) return 'tpb';
    if (/SACOMBANK|STB/.test(a)) return 'sacom';
    if (/VIETINBANK|VTB|CTG|IPAY|EFAST/.test(a)) return 'vtb';
    if (/\bSHB\b/.test(a)) return 'shb';
    if (/HDBANK|HDB/.test(a)) return 'hdb';
    if (/\bVIB\b/.test(a)) return 'vib';
    if (/\bMSB\b/.test(a)) return 'msb';
    if (/\bOCB\b/.test(a)) return 'ocb';
    if (/EXIMBANK|EIB/.test(a)) return 'eib';
    if (/SEABANK|SSB/.test(a)) return 'seab';
    if (/PVCOMBANK/.test(a)) return 'pvcom';
    if (/NCB|NCBBANK/.test(a)) return 'ncb';
    if (/\bABBANK\b|ABB/.test(a)) return 'abb';
    if (/SCB(?!I)/.test(a)) return 'scb';
    if (/LIENVIETPOSTBANK|LPB/.test(a)) return 'lpb';
    if (/BACABANK|BAB/.test(a)) return 'bab';
    if (/VIETCAPITAL|BVB/.test(a)) return 'bvb';
    // Heuristic cuối: nếu address hoặc body có hint là bank → 'unknown'
    if (/BANK|NGAN HANG|NGÂN HÀNG/.test(a)) return 'unknown';
    return null;
  }

  // Parse số tiền VND từ string. VD: "50,000VND" / "50.000 VND" / "1,234,567đ"
  function parseAmount(str) {
    if (!str) return null;
    // Bỏ tất cả ký tự không phải số → parseInt
    const cleaned = String(str).replace(/[^\d]/g, '');
    const n = parseInt(cleaned, 10);
    return isNaN(n) ? null : n;
  }

  // Detect type: 'expense' (trừ tiền) | 'income' (cộng tiền)
  // Heuristic: dấu - hoặc chữ "trừ", "GD: -" → expense
  //            dấu + hoặc "cộng", "GD: +", "nhận" → income
  function detectType(body, amountStr) {
    const b = body.toLowerCase();
    // Có dấu - rõ ràng trước số tiền
    if (amountStr && /^-/.test(amountStr.trim())) return 'expense';
    if (amountStr && /^\+/.test(amountStr.trim())) return 'income';
    // Keywords
    if (/(trừ|chi|gd:\s*-|rút|chuyển ra|thanh toán|mua hàng|qr-|pay)/.test(b)) return 'expense';
    if (/(cộng|nhận|gd:\s*\+|thu|chuyển vào|hoàn tiền|lãi)/.test(b)) return 'income';
    // Default expense (đa số SMS NH là chi)
    return 'expense';
  }

  // ===== Parsers cho từng bank =====
  // Mỗi function nhận body string, return { amount, type, accountSuffix, balance, note, raw } | null

  // Vietcombank: "TK ...8842 -50,000VND lúc HH:mm DD/MM/YYYY. SDC: 1,234,000 VND. Noi dung: ..."
  // Hoặc: "VCB: GD chuyen khoan ... -1,500,000 VND ... SDCK: 5,000,000 VND. Noi dung: ..."
  function parseVCB(body) {
    // Tìm pattern: -50,000VND hoặc +50,000VND
    const amtMatch = body.match(/([+-]?[\d,.]+)\s*(?:VND|đ)\b/i);
    if (!amtMatch) return null;
    const amount = parseAmount(amtMatch[1]);
    if (!amount) return null;
    const type = detectType(body, amtMatch[1]);
    // Account suffix: "TK ...8842" hoặc "TK 8842"
    const accMatch = body.match(/TK\s*\.{0,3}(\d{3,5})/i);
    const accountSuffix = accMatch ? accMatch[1] : null;
    // Balance: "SDC: 1,234,000 VND" hoặc "SDCK: ..."
    const balMatch = body.match(/SDC[K]?\s*:\s*([\d,.]+)\s*(?:VND|đ)/i);
    const balance = balMatch ? parseAmount(balMatch[1]) : null;
    // Nội dung: sau "Noi dung:" hoặc "ND:" hoặc "Mo ta:"
    const noteMatch = body.match(/(?:Noi dung|ND|Mo ta|Description)[:\s]+([^\n.]+)/i);
    const note = noteMatch ? noteMatch[1].trim() : null;
    return { amount, type, accountSuffix, balance, note, bank: 'vcb' };
  }

  // Techcombank: "TK 1903xxxxxxx Phat sinh GD: -500,000 VND luc HH:mm DD/MM/YYYY..."
  function parseTCB(body) {
    const amtMatch = body.match(/([+-]?[\d,.]+)\s*VND/i);
    if (!amtMatch) return null;
    const amount = parseAmount(amtMatch[1]);
    if (!amount) return null;
    const type = detectType(body, amtMatch[1]);
    const accMatch = body.match(/TK\s*(\d{4,})/i);
    const accountSuffix = accMatch ? accMatch[1].slice(-4) : null;
    const balMatch = body.match(/(?:SD|so du|sodu)\s*[:=]?\s*([\d,.]+)\s*VND/i);
    const balance = balMatch ? parseAmount(balMatch[1]) : null;
    const noteMatch = body.match(/(?:ND|Noi dung|Mo ta)[:\s]+([^\n.]+)/i);
    const note = noteMatch ? noteMatch[1].trim() : null;
    return { amount, type, accountSuffix, balance, note, bank: 'tcb' };
  }

  // MBBank: "TK xxxxxxxx GD: +500,000 VND ... So du: 1,234,567 VND. ND: ..."
  function parseMB(body) {
    const amtMatch = body.match(/(?:GD|TK|PS)[:\s]+([+-]?[\d,.]+)\s*(?:VND|đ)/i)
                  || body.match(/([+-][\d,.]+)\s*(?:VND|đ)/i);
    if (!amtMatch) return null;
    const amount = parseAmount(amtMatch[1]);
    if (!amount) return null;
    const type = detectType(body, amtMatch[1]);
    const accMatch = body.match(/TK\s*[*x]*(\d{3,5})/i);
    const accountSuffix = accMatch ? accMatch[1] : null;
    const balMatch = body.match(/So du\s*[:=]?\s*([\d,.]+)\s*VND/i);
    const balance = balMatch ? parseAmount(balMatch[1]) : null;
    const noteMatch = body.match(/(?:ND|Noi dung)[:\s]+([^\n.]+)/i);
    const note = noteMatch ? noteMatch[1].trim() : null;
    return { amount, type, accountSuffix, balance, note, bank: 'mb' };
  }

  // ACB: "ACB: TK ...1234 GD -200,000 VND. SDCK 1,500,000 VND. ND: ..."
  function parseACB(body) {
    const amtMatch = body.match(/([+-]?[\d,.]+)\s*VND/i);
    if (!amtMatch) return null;
    const amount = parseAmount(amtMatch[1]);
    if (!amount) return null;
    const type = detectType(body, amtMatch[1]);
    const accMatch = body.match(/TK\s*\.{0,3}(\d{3,5})/i);
    const accountSuffix = accMatch ? accMatch[1] : null;
    const balMatch = body.match(/SDC[K]?\s*([\d,.]+)\s*VND/i);
    const balance = balMatch ? parseAmount(balMatch[1]) : null;
    const noteMatch = body.match(/(?:ND|Noi dung|Mo ta)[:\s]+([^\n.]+)/i);
    const note = noteMatch ? noteMatch[1].trim() : null;
    return { amount, type, accountSuffix, balance, note, bank: 'acb' };
  }

  // BIDV: "BIDV: TK 12100001234567 GD: -300,000 VND. SD: 2,000,000 VND. ND: ..."
  function parseBIDV(body) {
    const amtMatch = body.match(/([+-]?[\d,.]+)\s*VND/i);
    if (!amtMatch) return null;
    const amount = parseAmount(amtMatch[1]);
    if (!amount) return null;
    const type = detectType(body, amtMatch[1]);
    const accMatch = body.match(/TK\s*(\d{4,})/i);
    const accountSuffix = accMatch ? accMatch[1].slice(-4) : null;
    const balMatch = body.match(/(?:SD|so du)\s*[:=]?\s*([\d,.]+)\s*VND/i);
    const balance = balMatch ? parseAmount(balMatch[1]) : null;
    const noteMatch = body.match(/(?:ND|Noi dung|Mo ta)[:\s]+([^\n.]+)/i);
    const note = noteMatch ? noteMatch[1].trim() : null;
    return { amount, type, accountSuffix, balance, note, bank: 'bidv' };
  }

  // Generic fallback parser — dùng cho bank chưa có regex riêng (VPB, Agri, TPB...)
  // Best-effort: tìm số tiền VND đầu tiên + heuristic detect type
  function parseGeneric(body, bank) {
    const amtMatch = body.match(/([+-]?[\d,.]+)\s*(?:VND|VNĐ|đ)\b/i);
    if (!amtMatch) return null;
    const amount = parseAmount(amtMatch[1]);
    if (!amount || amount < 1000) return null; // bỏ noise (vd: "1 đ phí")
    const type = detectType(body, amtMatch[1]);
    const accMatch = body.match(/TK\s*[*x]*(\d{3,5})/i);
    const accountSuffix = accMatch ? accMatch[1] : null;
    const balMatch = body.match(/(?:SDC[K]?|SD|so du|sodu)\s*[:=]?\s*([\d,.]+)\s*(?:VND|VNĐ|đ)/i);
    const balance = balMatch ? parseAmount(balMatch[1]) : null;
    const noteMatch = body.match(/(?:ND|Noi dung|Mo ta|Memo)[:\s]+([^\n.]+)/i);
    const note = noteMatch ? noteMatch[1].trim() : null;
    return { amount, type, accountSuffix, balance, note, bank };
  }

  // Main entry: parse 1 SMS message
  // input: { address, body, date }
  // output: { amount, type, accountSuffix, balance, note, bank, address, body, date, smsId } | null
  function parseSms(sms) {
    if (!sms?.body) return null;
    const bank = detectBank(sms.address);
    if (!bank) return null;

    let parsed;
    try {
      switch (bank) {
        case 'vcb':  parsed = parseVCB(sms.body); break;
        case 'tcb':  parsed = parseTCB(sms.body); break;
        case 'mb':   parsed = parseMB(sms.body); break;
        case 'acb':  parsed = parseACB(sms.body); break;
        case 'bidv': parsed = parseBIDV(sms.body); break;
        default:     parsed = parseGeneric(sms.body, bank);
      }
    } catch (e) {
      console.warn('[SmsParser] Parse error', bank, e);
      return null;
    }
    if (!parsed) return null;

    return {
      ...parsed,
      address: sms.address,
      body: sms.body,
      date: sms.date,
      smsId: sms.id,
      // Hash để anti-duplicate (body + date là unique enough)
      hash: _hashStr(`${sms.address}|${sms.date}|${parsed.amount}`)
    };
  }

  // Simple hash (FNV-like) — đủ chống dup, không cần crypto
  function _hashStr(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
  }

  // Tên hiển thị bank
  const BANK_NAMES = {
    vcb: 'Vietcombank', tcb: 'Techcombank', mb: 'MBBank', acb: 'ACB',
    bidv: 'BIDV', vpb: 'VPBank', agri: 'Agribank', tpb: 'TPBank',
    sacom: 'Sacombank', vtb: 'VietinBank', shb: 'SHB', hdb: 'HDBank',
    vib: 'VIB', msb: 'MSB', ocb: 'OCB',
    eib: 'Eximbank', seab: 'SeABank', pvcom: 'PVcomBank',
    ncb: 'NCB', abb: 'ABBank', scb: 'SCB', lpb: 'LienVietPostBank',
    bab: 'BacABank', bvb: 'BanVietBank',
    unknown: 'Ngân hàng (chưa rõ)'
  };

  window.QLT_SmsBankParser = {
    detectBank,
    parseSms,
    BANK_NAMES,
    bankName: (key) => BANK_NAMES[key] || key
  };
})();
