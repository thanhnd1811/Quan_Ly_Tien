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
  // Models — chọn ổn định lâu dài (5/2026)
  const MODELS = {
    chat: 'gemini-2.5-flash',     // free tier 1500/ngày, vẫn còn ~1 tháng trước deprecate 17/6
    vision: 'gemini-2.5-flash',   // multimodal built-in
    fallback: 'gemini-2.0-flash'  // backup nếu 2.5 fail (sẽ deprecate 1/6/2026)
  };

  const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

  // Gọi Gemini với messages + optional tools
  async function geminiCall(apiKey, model, body) {
    const url = `${ENDPOINT}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errMsg = `Gemini API lỗi ${res.status}`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error?.message) errMsg = errJson.error.message;
      } catch (_) {
        if (errText) errMsg += ': ' + errText.slice(0, 200);
      }
      throw new Error(errMsg);
    }
    return await res.json();
  }

  // Parse response Gemini → { text, toolCalls, finishReason }
  function parseGeminiResponse(json) {
    const cand = json.candidates?.[0];
    if (!cand) return { text: '', toolCalls: [], finishReason: 'no-candidate' };
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
      usage: json.usageMetadata
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
    async testConnection(apiKey) {
      const key = apiKey || await this.getApiKey();
      if (!key) throw new Error('Chưa có API key');
      const json = await geminiCall(key, MODELS.chat, {
        contents: [{ role: 'user', parts: [{ text: 'OK' }] }],
        generationConfig: { maxOutputTokens: 10, temperature: 0 }
      });
      const parsed = parseGeminiResponse(json);
      return {
        ok: !!parsed.text || parsed.finishReason === 'stop' || parsed.finishReason === 'STOP',
        model: MODELS.chat,
        usage: parsed.usage
      };
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

      const json = await geminiCall(key, MODELS.chat, body);
      return parseGeminiResponse(json);
    },

    // --- Analyze image (cho OCR bill) ---
    // imageBase64: string (không cần "data:image/...;base64," prefix)
    // mimeType: 'image/jpeg' | 'image/png' | ...
    async analyzeImage({ imageBase64, mimeType = 'image/jpeg', prompt, systemInstruction, temperature = 0.2, maxOutputTokens = 4096 } = {}) {
      const key = await this.getApiKey();
      if (!key) throw new Error('Chưa cấu hình API key');

      // Strip data URL prefix nếu có
      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');

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

      const json = await geminiCall(key, MODELS.vision, body);
      return parseGeminiResponse(json);
    },

    // --- Text-to-Speech (Web Speech Synthesis API — free, native) ---
    speak(text, opts = {}) {
      if (!('speechSynthesis' in window)) {
        console.warn('TTS not supported');
        return;
      }
      // Stop any ongoing speech
      window.speechSynthesis.cancel();

      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = opts.lang || 'vi-VN';
      utt.rate = opts.rate || 1.0;
      utt.pitch = opts.pitch || 1.0;
      utt.volume = opts.volume || 1.0;

      // Tìm voice tiếng Việt nếu có
      const voices = window.speechSynthesis.getVoices();
      const viVoice = voices.find(v => v.lang === 'vi-VN' || v.lang.startsWith('vi'));
      if (viVoice) utt.voice = viVoice;

      window.speechSynthesis.speak(utt);
      return utt;
    },

    stopSpeaking() {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    },

    isSpeaking() {
      return 'speechSynthesis' in window && window.speechSynthesis.speaking;
    }
  };

  window.QLT_AI = QLT_AI;
})();
