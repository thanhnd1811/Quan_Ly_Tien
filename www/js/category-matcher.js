// Category matcher — match note text → category id
// Multi-tier scoring với anti-keyword check + abstain.
//
// Cách dùng:
//   const result = QLT_CategoryMatcher.match(noteText, categories, { type: 'expense', amount: 65000, hourOfDay: 8 });
//   result = { categoryId, confidence, reason, candidates: [...] }
//   - confidence >= 0.85 → AUTO chọn
//   - confidence >= 0.70 → SUGGEST (highlight, user xác nhận)
//   - confidence < 0.70 → ABSTAIN (không đoán)

(function () {
  'use strict';

  // Confidence weights theo tier
  const CONFIDENCE = {
    brand: 0.95,
    strong: 0.85,
    weak: 0.70,
    nameExact: 0.85,
    nameSubstring: 0.70,
    nameWord: 0.55
  };

  const THRESHOLD = {
    AUTO: 0.85,    // >= → auto-select
    SUGGEST: 0.70  // >= → suggest only
  };

  // Bỏ dấu tiếng Việt + lowercase
  function normalize(s) {
    if (!s) return '';
    return String(s)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Tokenize thành mảng từ
  function tokenize(s) {
    return normalize(s).split(/\s+/).filter(w => w.length > 0);
  }

  // Phrase-level match: kiểm tra cụm từ có xuất hiện trong text như word boundary
  // VD: "xe" KHÔNG match "xeoi" — phải là từ nguyên
  function phraseMatch(text, phrase) {
    const t = normalize(text);
    const p = normalize(phrase);
    if (!p) return false;
    // Word boundary check — match nguyên cụm từ
    const re = new RegExp('(^|\\s)' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)');
    return re.test(t);
  }

  // Lấy tiered keywords cho 1 category (default seeded slug + user keywords)
  function getTieredKeywords(cat) {
    const tiered = { brand: [], strong: [], weak: [], antiKeywords: {} };

    // 1. Lấy default tiered từ QLT_CategoriesDefault theo slug
    if (cat.slug && window.QLT_CategoriesDefault) {
      const def = window.QLT_CategoriesDefault.ALL.find(c => c.slug === cat.slug);
      if (def && def.keywords) {
        tiered.brand = (def.keywords.brand || []).slice();
        tiered.strong = (def.keywords.strong || []).slice();
        tiered.weak = (def.keywords.weak || []).slice();
      }
      if (def && def.antiKeywords) {
        tiered.antiKeywords = { ...def.antiKeywords };
      }
    }

    // 2. Lấy user-added keywords (từ flat array `keywords` trong DB) — coi như STRONG
    if (Array.isArray(cat.keywords)) {
      for (const kw of cat.keywords) {
        const n = normalize(kw);
        if (!n) continue;
        // Skip nếu đã có trong default (tránh duplicate)
        if (tiered.brand.includes(n) || tiered.strong.includes(n) || tiered.weak.includes(n)) continue;
        tiered.strong.push(kw);
      }
    }

    return tiered;
  }

  // Match 1 category, trả về best score
  function scoreCategory(text, cat) {
    const tiered = getTieredKeywords(cat);
    const normText = normalize(text);
    let bestScore = 0;
    let bestKw = null;
    let bestTier = null;

    // === ANTI-KEYWORD CHECK trước tiên ===
    // Nếu text chứa anti-keyword → SKIP cat này
    for (const antiKw of Object.keys(tiered.antiKeywords)) {
      if (phraseMatch(text, antiKw)) {
        return { score: 0, kw: null, tier: 'anti', skip: true, redirectSlug: tiered.antiKeywords[antiKw] };
      }
    }

    // === MATCH theo tier ===
    // Brand → confidence 0.95, ưu tiên cao + match dài hơn = mạnh hơn
    for (const kw of tiered.brand) {
      if (phraseMatch(text, kw)) {
        const score = CONFIDENCE.brand + (normalize(kw).length / 1000); // tie-break: kw dài hơn → score cao hơn chút
        if (score > bestScore) { bestScore = score; bestKw = kw; bestTier = 'brand'; }
      }
    }
    // Strong → 0.85
    for (const kw of tiered.strong) {
      if (phraseMatch(text, kw)) {
        const score = CONFIDENCE.strong + (normalize(kw).length / 1000);
        if (score > bestScore) { bestScore = score; bestKw = kw; bestTier = 'strong'; }
      }
    }
    // Weak → 0.70
    for (const kw of tiered.weak) {
      if (phraseMatch(text, kw)) {
        const score = CONFIDENCE.weak + (normalize(kw).length / 1000);
        if (score > bestScore) { bestScore = score; bestKw = kw; bestTier = 'weak'; }
      }
    }
    // Tên category — exact match
    const cn = normalize(cat.name);
    if (cn && phraseMatch(text, cn)) {
      const score = CONFIDENCE.nameExact + (cn.length / 1000);
      if (score > bestScore) { bestScore = score; bestKw = cat.name; bestTier = 'nameExact'; }
    }

    return { score: bestScore, kw: bestKw, tier: bestTier, skip: false };
  }

  // Hàm chính — match text → categoryId
  function match(text, categories, opts) {
    opts = opts || {};
    const type = opts.type; // 'expense' | 'income' — filter cat type
    const amount = opts.amount; // tie-breaker theo số tiền
    const hourOfDay = opts.hourOfDay; // tie-breaker theo giờ
    const recentCatIds = opts.recentCatIds || []; // tie-breaker theo cat dùng gần đây

    if (!text || !text.trim()) {
      return { categoryId: null, confidence: 0, reason: 'empty-text', candidates: [] };
    }

    // Filter cat theo type, loại archived
    let cands = categories.filter(c => !c.archived);
    if (type) cands = cands.filter(c => c.type === type);

    const scored = [];
    const redirects = {}; // slug → cat to redirect to (từ anti-keywords)

    for (const cat of cands) {
      const r = scoreCategory(text, cat);
      if (r.skip && r.redirectSlug) {
        redirects[r.redirectSlug] = true;
        continue;
      }
      if (r.score > 0) {
        scored.push({ cat, score: r.score, kw: r.kw, tier: r.tier });
      }
    }

    // Áp redirects: nếu có anti-keyword chỉ định cat đúng → boost cat đó
    for (const slug of Object.keys(redirects)) {
      const targetCat = cands.find(c => c.slug === slug);
      if (targetCat) {
        const existing = scored.find(s => s.cat.id === targetCat.id);
        if (existing) {
          existing.score = Math.max(existing.score, 0.90); // anti-redirect = high confidence
          existing.tier = 'anti-redirect';
        } else {
          scored.push({ cat: targetCat, score: 0.90, kw: '(anti-redirect)', tier: 'anti-redirect' });
        }
      }
    }

    if (scored.length === 0) {
      return { categoryId: null, confidence: 0, reason: 'no-match', candidates: [] };
    }

    // Sort by score desc
    scored.sort((a, b) => b.score - a.score);

    // === TIE-BREAKERS khi top 2 score gần nhau (chênh < 0.05) ===
    if (scored.length >= 2 && (scored[0].score - scored[1].score) < 0.05) {
      // Tie-breaker 1: recent history
      if (recentCatIds.length > 0) {
        for (const s of scored.slice(0, 5)) {
          if (recentCatIds.includes(s.cat.id)) {
            s.score += 0.03; s.tier += '+recent';
          }
        }
        scored.sort((a, b) => b.score - a.score);
      }
      // Tie-breaker 2: amount sanity check
      if (amount && amount > 0) {
        // Cà phê >2tr → suspicious → giảm
        // Hóa đơn dưới 10k → suspicious → giảm
        for (const s of scored.slice(0, 5)) {
          if (s.cat.slug === 'food_coffee' && amount > 1000000) s.score -= 0.10;
          if (s.cat.slug === 'food_snack' && amount > 500000) s.score -= 0.10;
          if (s.cat.slug === 'transport_parking' && amount > 200000) s.score -= 0.10;
          if (s.cat.slug === 'bills_electric' && amount < 20000) s.score -= 0.10;
          if (s.cat.slug === 'bills_water' && amount < 10000) s.score -= 0.10;
          if (s.cat.slug === 'fin_invest' && amount < 100000) s.score -= 0.05;
          if (s.cat.slug === 'housing_rent' && amount < 500000) s.score -= 0.10;
        }
        scored.sort((a, b) => b.score - a.score);
      }
      // Tie-breaker 3: time-of-day
      if (typeof hourOfDay === 'number') {
        for (const s of scored.slice(0, 5)) {
          if (s.cat.slug === 'food_coffee' && hourOfDay >= 6 && hourOfDay <= 10) s.score += 0.02;
          if (s.cat.slug === 'food_dining' && (hourOfDay >= 11 && hourOfDay <= 14 || hourOfDay >= 17 && hourOfDay <= 21)) s.score += 0.02;
          if (s.cat.slug === 'food_grocery' && hourOfDay >= 16 && hourOfDay <= 20) s.score += 0.02;
        }
        scored.sort((a, b) => b.score - a.score);
      }
    }

    const best = scored[0];
    const confidence = Math.min(1.0, best.score);

    let reason;
    if (confidence >= THRESHOLD.AUTO) reason = 'auto';
    else if (confidence >= THRESHOLD.SUGGEST) reason = 'suggest';
    else reason = 'abstain';

    return {
      categoryId: confidence >= THRESHOLD.SUGGEST ? best.cat.id : null,
      confidence,
      reason,
      matchedKeyword: best.kw,
      tier: best.tier,
      candidates: scored.slice(0, 5).map(s => ({
        id: s.cat.id, name: s.cat.name, slug: s.cat.slug,
        score: s.score, kw: s.kw, tier: s.tier
      }))
    };
  }

  // Helper: chỉ lấy categoryId nếu confidence >= AUTO threshold
  function autoMatch(text, categories, opts) {
    const r = match(text, categories, opts);
    return r.confidence >= THRESHOLD.AUTO ? r.categoryId : null;
  }

  // Helper: lấy categoryId nếu confidence >= SUGGEST threshold
  function suggestMatch(text, categories, opts) {
    const r = match(text, categories, opts);
    return r.confidence >= THRESHOLD.SUGGEST ? r.categoryId : null;
  }

  window.QLT_CategoryMatcher = {
    match,
    autoMatch,
    suggestMatch,
    normalize,
    tokenize,
    phraseMatch,
    THRESHOLD,
    CONFIDENCE
  };
})();
