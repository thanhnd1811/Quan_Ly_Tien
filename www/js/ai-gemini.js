// AI module — Gemini API wrapper
// Single-provider (Gemini) cho UX đơn giản. Code có adapter pattern ngầm
// để dễ extend OpenAI/Claude sau này không phá public interface.
//
// Usage:
//   await QLT_AI.setApiKey('AIzaSy...');
//   const r = await QLT_AI.chat({ messages: [...], tools: [...] });
//   const r = await QLT_AI.analyzeImage(base64, prompt);
//
// Storage: Capacitor Preferences (Android: EncryptedSharedPreferences,
//          fallback localStorage trên web)

(function () {
  'use strict';

  // ============================================================
  // SECURE STORAGE — Capacitor Preferences với fallback localStorage
  // ============================================================
  const Secure = {
    async set(key, value) {
      const cap = window.Capacitor?.Plugins?.Preferences;
      if (cap) {
        await cap.set({ key: 'qlt_ai_' + key, value: String(value) });
      } else {
        localStorage.setItem('qlt_ai_' + key, value);
      }
    },
    async get(key) {
      const cap = window.Capacitor?.Plugins?.Preferences;
      if (cap) {
        const r = await cap.get({ key: 'qlt_ai_' + key });
        return r.value;
      }
      return localStorage.getItem('qlt_ai_' + key);
    },
    async remove(key) {
      const cap = window.Capacitor?.Plugins?.Preferences;
      if (cap) {
        await cap.remove({ key: 'qlt_ai_' + key });
      } else {
        localStorage.removeItem('qlt_ai_' + key);
      }
    }
  };

  // ============================================================
  // GEMINI ADAPTER
  // ============================================================
  // Models — dùng explicit model với QUOTA FREE TIER CAO (5/2026):
  // - gemini-2.5-flash: 250 RPD free, ĐỦ cho 30+ Q&A/ngày, multi-turn tool use OK
  // - gemini-2.5-flash-lite: 1000 RPD free nhưng nhỏ → đôi khi (không có response)
  //   khi multi-turn tool use với system prompt dài
  //
  // → Chọn flash (250 RPD) thay vì lite (1000 RPD) vì đảm bảo có response.
  //   250 RPD = đủ 30 câu/ngày trong 30 ngày → quá đủ cho user thường.
  //
  // KHÔNG dùng 'gemini-flash-latest' alias (auto-rotate sang gemini-3-flash
  // chỉ 20 RPD).
  //
  // Cả 2 sẽ deprecate 17/6/2026 (40 ngày) — sẽ update sau.
  const MODELS = {
    chat: 'gemini-2.5-flash',        // 250 RPD, multi-turn tool use OK, có response
    vision: 'gemini-2.5-flash',      // 250 RPD, accurate cho OCR
    fallback: 'gemini-2.5-flash-lite' // dùng nếu hit quota flash
  };

  // Multi-model fallback chain — khi 1 model hết quota daily, tự switch sang model
  // có quota cao hơn. Tổng combined quota ~2750 req/day (free tier).
  // Order: smartest first → cheapest last.
  const CHAT_FALLBACK_CHAIN = [
    'gemini-2.5-flash',       // 250 RPD — smart, multi-turn tool use OK
    'gemini-2.5-flash-lite',  // 1000 RPD — nhanh + nhiều quota
    'gemini-2.0-flash-lite'   // 1500 RPD — last resort, ít smart hơn
  ];
  const VISION_FALLBACK_CHAIN = [
    'gemini-2.5-flash',       // 250 RPD — best OCR
    'gemini-2.5-flash-lite',  // 1000 RPD — vẫn vision OK
    'gemini-2.0-flash-lite'   // 1500 RPD — last resort
  ];

  // Quota exhaustion tracker — lưu localStorage để biết model nào đã hết quota
  // hôm nay → skip không gọi nữa, đỡ tốn 1 request lỗi.
  const QUOTA_KEY = 'qlt_ai_quota_exhausted';
  function _todayKey() { return new Date().toISOString().slice(0, 10); }
  function _getExhausted() {
    try {
      const raw = localStorage.getItem(QUOTA_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      // Auto-reset nếu khác ngày
      if (data._date !== _todayKey()) return {};
      return data;
    } catch (_) { return {}; }
  }
  function _markExhausted(model) {
    const data = _getExhausted();
    data._date = _todayKey();
    data[model] = true;
    try { localStorage.setItem(QUOTA_KEY, JSON.stringify(data)); } catch (_) {}
    console.warn('[AI] Model exhausted today:', model);
  }
  function _isExhausted(model) {
    return !!_getExhausted()[model];
  }

  // Heuristic: error message từ Gemini là quota exhaustion (vs rate limit tạm)?
  // - 429 + message chứa "quota" / "RESOURCE_EXHAUSTED" / "daily" → exhausted (mark)
  // - 429 không có dấu hiệu quota → có thể chỉ rate limit phút → retry
  function _isQuotaError(errMsg) {
    if (!errMsg) return false;
    const m = String(errMsg).toLowerCase();
    return m.includes('quota') || m.includes('resource_exhausted') ||
           m.includes('daily limit') || m.includes('exceeded');
  }

  // Wrapper gọi với fallback chain — thử từng model cho đến khi success
  // hoặc hết chain. Throw error cuối nếu tất cả fail.
  async function geminiCallWithFallback(apiKey, chain, body, opts = {}) {
    const errors = [];
    let lastErr;
    for (const model of chain) {
      if (_isExhausted(model)) {
        console.log('[AI] Skip', model, '(đã exhausted hôm nay)');
        continue;
      }
      try {
        const json = await geminiCall(apiKey, model, body);
        // Success — gắn meta info để caller biết model nào dùng
        if (json && typeof json === 'object') json._modelUsed = model;
        return json;
      } catch (e) {
        lastErr = e;
        const msg = e.message || String(e);
        errors.push(`${model}: ${msg.slice(0, 100)}`);
        // Quota exhausted → mark + try next
        if (_isQuotaError(msg)) {
          _markExhausted(model);
          continue;
        }
        // Lỗi không phải quota (auth/network/...) → throw ngay, không thử model khác
        // (vì các model khác cũng cùng key + cùng network)
        throw e;
      }
    }
    // Hết chain mà chưa thành công → throw error tổng hợp
    const err = new Error('Tất cả AI models đã hết quota hôm nay. ' + errors.join(' | '));
    err.allExhausted = true;
    err.lastError = lastErr;
    throw err;
  }

  const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';
  const TIMEOUT_MS = 60000; // 60s — Vision có thể chậm với ảnh lớn

  // Gọi Gemini với timeout + 1 lần retry
  async function geminiCall(apiKey, model, body, retry = 1) {
    const url = `${ENDPOINT}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal
      });
    } catch (e) {
      clearTimeout(tid);
      // Retry 1 lần với network error / abort
      if (retry > 0 && (e.name === 'AbortError' || e.name === 'TypeError' || /network|fetch/i.test(e.message))) {
        await new Promise(r => setTimeout(r, 1500));
        return geminiCall(apiKey, model, body, retry - 1);
      }
      throw new Error(e.name === 'AbortError' ? 'Quá thời gian chờ (60s) — thử lại' : (e.message || 'Lỗi mạng'));
    }
    clearTimeout(tid);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = `Gemini API lỗi ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error?.message) errMsg = errJson.error.message;
      } catch (_) {
        if (errText) errMsg += ': ' + errText.slice(0, 200);
      }
      // Retry 1 lần với 5xx (server error)
      if (retry > 0 && res.status >= 500 && res.status < 600) {
        await new Promise(r => setTimeout(r, 2000));
        return geminiCall(apiKey, model, body, retry - 1);
      }
      // Retry 1 lần với 429 (rate limit)
      if (retry > 0 && res.status === 429) {
        await new Promise(r => setTimeout(r, 4000));
        return geminiCall(apiKey, model, body, retry - 1);
      }
      throw new Error(errMsg);
    }
    return await res.json();
  }

  // Compress image base64 nếu quá lớn (>1.5MB) — tránh API reject + tăng tốc upload
  async function compressIfLarge(dataUrl, maxBytes = 1500000) {
    if (!dataUrl) return dataUrl;
    // Tính kích thước hiện tại (base64 string length / 1.33 ≈ raw bytes)
    const currentBytes = (dataUrl.length - (dataUrl.indexOf(',') + 1)) * 0.75;
    if (currentBytes <= maxBytes) return dataUrl;
    // Resize + re-encode với canvas
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        // Tính scale để đạt ~target bytes (rough: bytes ~ width*height*0.5 cho JPEG q=80)
        let { width: w, height: h } = img;
        const scale = Math.sqrt(maxBytes / currentBytes);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        // Cap dimensions
        const MAX_DIM = 2000;
        if (w > MAX_DIM || h > MAX_DIM) {
          const r = Math.min(MAX_DIM / w, MAX_DIM / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        // Quality 0.85 cho receipt (cần đọc text rõ)
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // Parse response Gemini → { text, toolCalls, finishReason, rawParts }
  // rawParts: nguyên parts từ response — PHẢI giữ lại để gửi LẠI model trong
  // turn sau (Gemini 2.5/3 yêu cầu thoughtSignature ở part level).
  function parseGeminiResponse(json) {
    const cand = json.candidates?.[0];
    if (!cand) return { text: '', toolCalls: [], finishReason: 'no-candidate', rawParts: [] };
    const parts = cand.content?.parts || [];
    let text = '';
    const toolCalls = [];
    for (const p of parts) {
      if (p.text) text += p.text;
      if (p.functionCall) {
        toolCalls.push({ name: p.functionCall.name, args: p.functionCall.args || {} });
      }
    }
    return {
      text,
      toolCalls,
      finishReason: cand.finishReason || 'stop',
      usage: json.usageMetadata,
      rawParts: parts
    };
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  const QLT_AI = {
    MODELS,

    // --- Config ---
    async getApiKey() {
      return await Secure.get('apiKey');
    },
    async setApiKey(key) {
      await Secure.set('apiKey', key);
    },
    async removeApiKey() {
      await Secure.remove('apiKey');
    },
    async hasApiKey() {
      const k = await Secure.get('apiKey');
      return !!k && k.trim().length > 10;
    },

    async getPref(key, defaultValue) {
      const v = await Secure.get(key);
      if (v === null || v === undefined) return defaultValue;
      if (v === 'true') return true;
      if (v === 'false') return false;
      return v;
    },
    async setPref(key, value) {
      await Secure.set(key, value);
    },

    // --- Test connection: gọi 1 ping ngắn để verify key valid ---
    // Nếu API call không throw → connection OK (key valid + model accessible).
    // Không dùng response text để đánh giá (Gemini có thể response empty với prompt ngắn).
    async testConnection(apiKey) {
      const key = apiKey || await this.getApiKey();
      if (!key) throw new Error('Chưa có API key');
      await geminiCall(key, MODELS.chat, {
        contents: [{ role: 'user', parts: [{ text: 'Trả lời "OK" nếu bạn nhận được tin nhắn này.' }] }],
        generationConfig: { maxOutputTokens: 30, temperature: 0 }
      });
      return { ok: true, model: MODELS.chat };
    },

    // --- Chat (text + optional tools) ---
    // messages: [{ role: 'user'|'model', text: '...' }, ...]
    // tools: [{ name, description, parameters }]
    // systemInstruction: string (optional)
    async chat({ messages, tools, systemInstruction, temperature = 0.7, maxOutputTokens = 2048 } = {}) {
      const key = await this.getApiKey();
      if (!key) throw new Error('Chưa cấu hình API key');

      const body = {
        contents: (messages || []).map(m => ({
          role: m.role === 'assistant' ? 'model' : (m.role || 'user'),
          parts: m.parts || [{ text: m.text || '' }]
        })),
        generationConfig: { temperature, maxOutputTokens }
      };
      if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] };
      }
      if (tools && tools.length) {
        body.tools = [{ function_declarations: tools }];
      }

      // Multi-model fallback: 2.5-flash → 2.5-flash-lite → 2.0-flash-lite
      // Tổng quota free ~2750 req/day. Caller có thể inspect json._modelUsed.
      const json = await geminiCallWithFallback(key, CHAT_FALLBACK_CHAIN, body);
      const parsed = parseGeminiResponse(json);
      if (json._modelUsed && json._modelUsed !== CHAT_FALLBACK_CHAIN[0]) {
        // Log fallback model — debug only, không show user
        console.log('[AI chat] Used fallback model:', json._modelUsed);
        parsed._modelUsed = json._modelUsed;
      }
      return parsed;
    },

    // --- Analyze image (cho OCR bill) ---
    // imageBase64: string — chấp nhận có hoặc không có "data:image/...;base64," prefix
    // mimeType: 'image/jpeg' | 'image/png' | ... (auto-detect nếu data URL có prefix)
    async analyzeImage({ imageBase64, mimeType = 'image/jpeg', prompt, systemInstruction, temperature = 0.2, maxOutputTokens = 4096 } = {}) {
      const key = await this.getApiKey();
      if (!key) throw new Error('Chưa cấu hình API key');

      // Compress nếu ảnh > 1.5MB (Gemini limit ~20MB inline nhưng to thì chậm + tốn quota)
      let processedDataUrl = imageBase64;
      if (imageBase64.startsWith('data:')) {
        processedDataUrl = await compressIfLarge(imageBase64);
        // Update mimeType từ data URL (compression có thể đổi thành jpeg)
        const m = processedDataUrl.match(/^data:([^;]+);/);
        if (m) mimeType = m[1];
      }

      // Strip data URL prefix
      const cleanBase64 = processedDataUrl.replace(/^data:[^;]+;base64,/, '');

      const body = {
        contents: [{
          role: 'user',
          parts: [
            { inline_data: { mime_type: mimeType, data: cleanBase64 } },
            { text: prompt || 'Mô tả ảnh này.' }
          ]
        }],
        generationConfig: { temperature, maxOutputTokens }
      };
      if (systemInstruction) {
        body.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      // Vision với fallback chain
      const json = await geminiCallWithFallback(key, VISION_FALLBACK_CHAIN, body);
      return parseGeminiResponse(json);
    },

    // --- Phân tích hoá đơn → trả về structured data tự fill vào tx ---
    // Dùng JSON Schema mode của Gemini API → guaranteed valid JSON output.
    async analyzeReceiptForTx({ imageBase64, mimeType = 'image/jpeg', categoriesList = [] } = {}) {
      const key = await this.getApiKey();
      if (!key) throw new Error('Chưa cấu hình API key');

      const catText = categoriesList.length
        ? categoriesList.map(c => `${c.slug} (${c.parentName ? c.parentName + ' > ' : ''}${c.name})`).join(', ')
        : '(không có danh sách)';

      const prompt = `Phân tích ảnh hoá đơn / biên lai mua hàng (tiếng Việt). Trích xuất các trường:

- merchant: TÊN CỬA HÀNG/QUÁN gọn (vd "ONOFF", "Highlands Coffee", "Bách Hoá Xanh"). KHÔNG kèm địa chỉ.
- date: ngày giao dịch dạng YYYY-MM-DD. Nếu không có dùng hôm nay (${(new Date()).toISOString().slice(0,10)}).
- amount: SỐ TIỀN USER THỰC TRẢ — số nguyên VND, KHÔNG có dấu chấm/phẩy.

QUY TẮC TÍNH AMOUNT (rất quan trọng):
* Ưu tiên dòng "Thanh toán thẻ ngân hàng" / "Tiền khách trả" / "Cash" / "Thanh toán" / "Đã trả".
* Nếu chỉ có "Tổng cộng" và các dòng giảm (Chiết khấu, Voucher, Phiếu quà tặng) → amount = Tổng - tất cả giảm.
* Vd: "Tổng cộng 945000, Chiết khấu 189000, Voucher 200000, Thanh toán 556000" → amount = 556000.
* TUYỆT ĐỐI KHÔNG dùng: số bill, số order, số phone, mã khách, điểm tích lũy, mã barcode làm amount.

- categorySlug: chọn 1 slug từ danh sách: ${catText}. Nếu không match dùng "other".
- note: 1 câu ngắn về giao dịch (vd "6 món quần áo nữ", "1 ly cà phê + bánh"). Tối đa 80 ký tự.
- items: list các món lớn (>50k mỗi món, max 10 món). Nếu hoá đơn chỉ 1 món hoặc khó tách → list rỗng [].`;

      // Build body với JSON Schema mode — guaranteed valid JSON output
      // Compress image first
      let processedDataUrl = imageBase64;
      if (imageBase64.startsWith('data:')) {
        // Receipt cần text rõ → compress nhẹ hơn (target 2.5MB, max 2400px)
        processedDataUrl = await compressIfLarge(imageBase64, 2500000);
        const m = processedDataUrl.match(/^data:([^;]+);/);
        if (m) mimeType = m[1];
      }
      const cleanBase64 = processedDataUrl.replace(/^data:[^;]+;base64,/, '');

      const body = {
        contents: [{
          role: 'user',
          parts: [
            { inline_data: { mime_type: mimeType, data: cleanBase64 } },
            { text: prompt }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              merchant: { type: 'string' },
              date: { type: 'string', description: 'YYYY-MM-DD' },
              amount: { type: 'integer', description: 'Số nguyên VND, số tiền user thực trả cuối cùng' },
              categorySlug: { type: 'string' },
              note: { type: 'string' },
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    amount: { type: 'integer' }
                  },
                  required: ['name', 'amount']
                }
              }
            },
            required: ['merchant', 'amount', 'categorySlug']
          }
        }
      };

      // Receipt OCR — vision fallback chain
      const json = await geminiCallWithFallback(key, VISION_FALLBACK_CHAIN, body);
      const parsed = parseGeminiResponse(json);

      // JSON Schema mode → text guaranteed JSON
      let data = null;
      try {
        data = JSON.parse(parsed.text);
      } catch (e) {
        // Fallback: try extract JSON
        const m = parsed.text.match(/\{[\s\S]*\}/);
        if (m) try { data = JSON.parse(m[0]); } catch (_) {}
      }
      if (!data) {
        return { ok: false, error: 'Gemini không trả JSON: ' + (parsed.text || '').slice(0, 100), raw: parsed.text };
      }
      if (!data.amount || data.amount <= 0) {
        return { ok: false, error: 'AI không lấy được số tiền (amount=0). Có thể ảnh mờ hoặc không phải hoá đơn.', raw: parsed.text, partialData: data };
      }

      return {
        ok: true,
        merchant: typeof data.merchant === 'string' ? data.merchant.trim().slice(0, 60) : '',
        date: typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : null,
        amount: Math.round(+data.amount),
        categorySlug: typeof data.categorySlug === 'string' ? data.categorySlug.trim() : null,
        note: typeof data.note === 'string' ? data.note.trim().slice(0, 100) : '',
        items: Array.isArray(data.items) ? data.items.filter(it => it && it.name && Number.isFinite(+it.amount) && +it.amount > 0).map(it => ({
          name: String(it.name).trim().slice(0, 50),
          amount: Math.round(+it.amount)
        })) : [],
        raw: parsed.text
      };
    },

    // --- Text-to-Speech ---
    // PRIORITY: Capacitor TextToSpeech plugin (Android native engine — reliable).
    // FALLBACK: Web Speech Synthesis API (web browser / older Capacitor builds).
    //
    // Capacitor plugin dùng Android TextToSpeech engine của hệ thống → ổn định
    // hơn Web Speech API. Vẫn cần user cài voice Việt nếu muốn accent đúng.

    _capTTS() {
      return window.Capacitor?.Plugins?.TextToSpeech || null;
    },

    // Preprocess text trước khi đưa vào TTS — replace ký tự viết tắt
    // bằng từ đầy đủ để engine đọc đúng tiếng Việt.
    _ttsPreprocess(text) {
      if (!text) return text;
      let t = String(text);

      // Số + 'k' → 'nghìn' (vd '50k' → '50 nghìn')
      t = t.replace(/(\d)\s*k(?=\s|$|[đ,.!?;:)\n])/gi, '$1 nghìn');

      // Số + 'tr' → 'triệu' (vd '1tr5' → '1 triệu 5', '2tr' → '2 triệu')
      t = t.replace(/(\d)\s*tr(?=\d|\s|$|[đ,.!?;:)\n])/gi, '$1 triệu ');

      // Số + 'tỷ' / 'ty' → 'tỷ'
      t = t.replace(/(\d)\s*ty(?=\s|$|[đ,.!?;:)\n])/gi, '$1 tỷ');

      // Số + 'đ' → 'đồng' (vd '1.250.000 đ' → '1.250.000 đồng')
      // Match 'đ' chỉ khi đứng trước whitespace/end/punct, sau khi đã có số
      t = t.replace(/(\d[\d.,]*)\s*đ(?=\s|$|[,.!?;:)\n])/g, '$1 đồng');

      // 'đ' đứng riêng (cuối câu, đầu sau khoảng trắng) → 'đồng'
      // Chỉ khi đ là chữ riêng, không phải đầu của 'đỏ', 'đông', 'đứng'...
      t = t.replace(/(\s)đ(?=\s|$|[,.!?;:)])/g, '$1đồng');

      // Một số ký hiệu khác có thể đọc nhầm
      t = t.replace(/\$/g, ' đô la ');
      t = t.replace(/%/g, ' phần trăm');
      t = t.replace(/\bGD\b/g, 'giao dịch');
      t = t.replace(/\bTB\b/g, 'trung bình');

      // Nhiều space liên tục → 1 space
      t = t.replace(/\s+/g, ' ').trim();

      return t;
    },

    // Đợi voices load (Web Speech API — fallback)
    async _waitVoices() {
      const synth = window.speechSynthesis;
      if (!synth) return [];
      let voices = synth.getVoices();
      if (voices.length > 0) return voices;
      return new Promise(resolve => {
        const handler = () => {
          synth.removeEventListener('voiceschanged', handler);
          resolve(synth.getVoices());
        };
        synth.addEventListener('voiceschanged', handler);
        setTimeout(() => {
          synth.removeEventListener('voiceschanged', handler);
          resolve(synth.getVoices());
        }, 1000);
      });
    },

    // Trả về { ok, engine, voice?, fallback?, reason? } — không speak
    async checkTTS() {
      // Try Capacitor plugin first
      const cap = this._capTTS();
      if (cap) {
        try {
          const r = await cap.getSupportedLanguages();
          const langs = r.languages || r.supportedLanguages || [];
          const hasVi = langs.some(l => /^vi/i.test(l));
          if (hasVi) {
            return { ok: true, engine: 'capacitor', voice: 'Android TTS', lang: 'vi-VN' };
          }
          return {
            ok: true, engine: 'capacitor', fallback: true,
            voice: 'Android TTS', lang: langs[0] || 'en-US',
            reason: 'no-vi-voice'
          };
        } catch (e) {
          console.warn('[TTS] capacitor plugin failed, fallback web speech:', e);
        }
      }
      // Web Speech API fallback
      if (!('speechSynthesis' in window)) {
        return { ok: false, reason: 'no-api' };
      }
      const voices = await this._waitVoices();
      if (voices.length === 0) {
        return { ok: false, reason: 'no-voices' };
      }
      const viVoice = voices.find(v => v.lang === 'vi-VN' || v.lang.startsWith('vi'));
      if (viVoice) {
        return { ok: true, engine: 'web-speech', voice: viVoice.name, lang: viVoice.lang };
      }
      const en = voices.find(v => v.lang.startsWith('en'));
      return {
        ok: true, engine: 'web-speech', fallback: true,
        voice: (en || voices[0]).name,
        lang: (en || voices[0]).lang,
        reason: 'no-vi-voice'
      };
    },

    async speak(text, opts = {}) {
      // Stop bất cứ TTS đang chạy
      this.stopSpeaking();

      // Preprocess: 'đ' → 'đồng', 'k' → 'nghìn', 'tr' → 'triệu', etc.
      const processedText = this._ttsPreprocess(text);

      const cap = this._capTTS();

      // === Try Capacitor TTS plugin ===
      if (cap) {
        try {
          if (opts.onStart) opts.onStart();
          // Capacitor speak() resolves khi đọc xong (block)
          await cap.speak({
            text: processedText,
            lang: opts.lang || 'vi-VN',
            rate: opts.rate || 1.0,
            pitch: opts.pitch || 1.0,
            volume: opts.volume || 1.0,
            category: 'ambient'
          });
          if (opts.onEnd) opts.onEnd();
          return { engine: 'capacitor' };
        } catch (e) {
          console.warn('[TTS] capacitor speak failed, fallback web speech:', e);
          if (opts.onError) opts.onError(e);
          // Fall through to web speech below
        }
      }

      // === Fallback: Web Speech API ===
      if (!('speechSynthesis' in window)) {
        const err = new Error('TTS không khả dụng trên thiết bị này');
        if (opts.onError) opts.onError(err);
        if (opts.onEnd) opts.onEnd(); // gọi onEnd để UI reset
        return null;
      }

      const utt = new SpeechSynthesisUtterance(processedText);
      utt.lang = opts.lang || 'vi-VN';
      utt.rate = opts.rate || 1.0;
      utt.pitch = opts.pitch || 1.0;
      utt.volume = opts.volume || 1.0;

      const voices = await this._waitVoices();
      const viVoice = voices.find(v => v.lang === 'vi-VN' || v.lang.startsWith('vi'));
      if (viVoice) {
        utt.voice = viVoice;
        console.log('[TTS] web-speech voice:', viVoice.name);
      }

      if (opts.onStart) utt.onstart = opts.onStart;
      if (opts.onEnd) utt.onend = opts.onEnd;
      if (opts.onError) utt.onerror = (e) => {
        opts.onError(e);
        // Cũng gọi onEnd vì error → dừng → UI cần reset
        if (opts.onEnd) opts.onEnd();
      };

      window.speechSynthesis.speak(utt);

      // Safety timeout: nếu sau 30s không có onend / onerror → reset UI
      // (workaround cho bug WebView một số device)
      const safetyTimer = setTimeout(() => {
        if (opts.onEnd) opts.onEnd();
      }, 30000);
      const origEnd = utt.onend;
      utt.onend = (e) => {
        clearTimeout(safetyTimer);
        if (origEnd) origEnd(e);
      };

      return { engine: 'web-speech', utterance: utt };
    },

    stopSpeaking() {
      const cap = this._capTTS();
      if (cap && cap.stop) {
        try { cap.stop(); } catch (_) {}
      }
      if ('speechSynthesis' in window) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
      }
    },

    async isSpeaking() {
      const cap = this._capTTS();
      if (cap && cap.isSpeaking) {
        try {
          const r = await cap.isSpeaking();
          if (r?.value === true || r === true) return true;
        } catch (_) {}
      }
      return 'speechSynthesis' in window && window.speechSynthesis.speaking;
    }
  };

  window.QLT_AI = QLT_AI;
})();
