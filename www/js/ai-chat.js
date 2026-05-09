// AI Chat — hỏi đáp về tài chính cá nhân
// Workflow:
//   1. User gõ/voice câu hỏi
//   2. Gemini phân tích → có thể gọi tool functions để query data
//   3. App execute tool, return result → Gemini tổng hợp → trả lời
//   4. Optional: TTS đọc to câu trả lời
//
// Tool functions được định nghĩa với Gemini function calling format.

(function () {
  'use strict';

  // ============================================================
  // TOOL DEFINITIONS — AI có thể gọi để query data của user
  // ============================================================
  function buildToolDeclarations() {
    return [
      {
        name: 'get_month_summary',
        description: 'Lấy tổng thu nhập, chi tiêu và top 5 danh mục chi nhiều nhất trong 1 tháng. Dùng khi user hỏi về tổng quan thu/chi tháng.',
        parameters: {
          type: 'object',
          properties: {
            month: {
              type: 'string',
              description: 'Tháng dạng YYYY-MM (vd 2026-05). Nếu user không nói tháng cụ thể, dùng tháng hiện tại.'
            }
          },
          required: ['month']
        }
      },
      {
        name: 'get_category_total',
        description: 'Lấy tổng chi/thu của 1 danh mục cụ thể trong khoảng thời gian. Dùng khi user hỏi "tôi chi cà phê bao nhiêu", "tôi tốn bao nhiêu cho ăn uống".',
        parameters: {
          type: 'object',
          properties: {
            categoryKeyword: {
              type: 'string',
              description: 'Từ khóa tên danh mục (vd "cà phê", "ăn uống", "xăng xe", "lương"). Sẽ match fuzzy.'
            },
            fromDate: { type: 'string', description: 'YYYY-MM-DD' },
            toDate: { type: 'string', description: 'YYYY-MM-DD' }
          },
          required: ['categoryKeyword', 'fromDate', 'toDate']
        }
      },
      {
        name: 'find_transactions',
        description: 'Tìm danh sách giao dịch theo filter. Dùng khi user hỏi "cho tôi xem các giao dịch gần đây", "tôi đã mua gì hôm thứ 7".',
        parameters: {
          type: 'object',
          properties: {
            fromDate: { type: 'string', description: 'YYYY-MM-DD' },
            toDate: { type: 'string', description: 'YYYY-MM-DD' },
            categoryKeyword: { type: 'string', description: 'Optional — lọc theo cat' },
            type: { type: 'string', description: 'Optional: "expense" | "income" | "transfer"' },
            minAmount: { type: 'number', description: 'Optional — chỉ lấy tx >= số này' },
            limit: { type: 'integer', description: 'Số tx tối đa trả về (default 20)' }
          },
          required: ['fromDate', 'toDate']
        }
      },
      {
        name: 'get_budget_status',
        description: 'Lấy trạng thái các budget (ngân sách) tháng hiện tại — đã chi bao nhiêu, còn lại bao nhiêu. Dùng khi user hỏi "còn budget không", "tôi vượt ngân sách chưa".',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'get_account_balances',
        description: 'Lấy số dư hiện tại của các ví. Dùng khi user hỏi "tôi còn bao nhiêu tiền", "ví tiền mặt còn bao nhiêu".',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'get_monthly_trend',
        description: 'Lấy thu/chi của N tháng gần nhất để phân tích trend. Dùng khi user hỏi "tháng nào tôi chi nhiều nhất", "trend chi tiêu 6 tháng".',
        parameters: {
          type: 'object',
          properties: {
            months: { type: 'integer', description: 'Số tháng gần nhất (1-12)' }
          },
          required: ['months']
        }
      },
      {
        name: 'prepare_transaction',
        description: 'Chuẩn bị 1 giao dịch để LƯU (chưa lưu thật, đợi user confirm). DÙNG khi user nói câu kiểu "ăn sáng 50k", "đổ xăng 100k", "lương về 15tr", "chuyển 500k sang VCB", "mua iphone 25tr". Tool resolve category + account từ keyword.',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: '"expense" (chi) | "income" (thu) | "transfer" (chuyển ví). Mặc định "expense" nếu không rõ.'
            },
            amount: {
              type: 'integer',
              description: 'Số tiền VND, số nguyên. VD "50k" = 50000, "1tr5" = 1500000, "2 triệu" = 2000000.'
            },
            categoryKeyword: {
              type: 'string',
              description: 'Tên danh mục/từ khóa để match. VD "ăn sáng" → "Ăn uống > Ăn ngoài", "xăng" → "Đi lại > Xăng xe", "lương" → "Thu nhập chính > Lương".'
            },
            accountKeyword: {
              type: 'string',
              description: 'Optional. Tên ví user nói. VD "tiền mặt", "vcb", "vietcombank", "mb". Bỏ trống nếu user không nói (sẽ dùng ví gần đây).'
            },
            toAccountKeyword: {
              type: 'string',
              description: 'Optional. Chỉ dùng cho transfer — ví đích.'
            },
            note: {
              type: 'string',
              description: 'Ghi chú cho giao dịch (có thể là phần text user nói, vd "ăn sáng", "mua iphone")'
            },
            date: {
              type: 'string',
              description: 'YYYY-MM-DD. Mặc định hôm nay nếu user không chỉ định.'
            }
          },
          required: ['type', 'amount']
        }
      }
    ];
  }

  // ============================================================
  // TOOL EXECUTORS — chạy tool, trả về data cho AI
  // ============================================================
  const ToolExec = {
    _state() { return window.QLT_App?.state || {}; },

    fmtVN(n) { return Number(n || 0).toLocaleString('vi-VN'); },

    _findCatByKeyword(keyword) {
      const cats = this._state().categories || [];
      const M = window.QLT_CategoryMatcher;
      const norm = M ? M.normalize(keyword) : keyword.toLowerCase();
      // Match exact name first
      let exact = cats.find(c => M ? M.normalize(c.name) === norm : c.name.toLowerCase() === norm);
      if (exact) return exact;
      // Substring match
      return cats.find(c => {
        const cn = M ? M.normalize(c.name) : c.name.toLowerCase();
        return cn.includes(norm) || norm.includes(cn);
      });
    },

    _isReal(t) {
      return t && t.type !== 'transfer' && !t._adjustment;
    },

    async get_month_summary({ month }) {
      const txs = (this._state().transactions || []).filter(t => t.date && t.date.startsWith(month));
      let income = 0, expense = 0;
      const catTotals = {};
      for (const t of txs) {
        if (!this._isReal(t)) continue;
        if (t.type === 'income') income += t.amount;
        if (t.type === 'expense') {
          expense += t.amount;
          if (t.categoryId) catTotals[t.categoryId] = (catTotals[t.categoryId] || 0) + t.amount;
        }
      }
      const cats = this._state().categories || [];
      const topCats = Object.entries(catTotals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, total]) => {
          const c = cats.find(x => x.id === id);
          return { name: c?.name || '?', total, percent: expense > 0 ? Math.round(total / expense * 100) : 0 };
        });
      return {
        month,
        totalIncome: income,
        totalExpense: expense,
        balance: income - expense,
        transactionCount: txs.length,
        topCategories: topCats
      };
    },

    async get_category_total({ categoryKeyword, fromDate, toDate }) {
      const cat = this._findCatByKeyword(categoryKeyword);
      if (!cat) return { error: `Không tìm thấy danh mục match "${categoryKeyword}"` };
      const txs = (this._state().transactions || []).filter(t =>
        this._isReal(t) && t.categoryId === cat.id &&
        t.date >= fromDate && t.date <= toDate
      );
      const total = txs.reduce((s, t) => s + t.amount, 0);
      const recent = txs.slice(-5).reverse().map(t => ({
        date: t.date, amount: t.amount, note: t.note || ''
      }));
      return {
        category: cat.name,
        type: cat.type,
        fromDate, toDate,
        total,
        count: txs.length,
        recentTransactions: recent
      };
    },

    async find_transactions({ fromDate, toDate, categoryKeyword, type, minAmount, limit = 20 }) {
      let txs = (this._state().transactions || []).filter(t =>
        t.date >= fromDate && t.date <= toDate
      );
      if (type) txs = txs.filter(t => t.type === type);
      if (minAmount) txs = txs.filter(t => t.amount >= minAmount);
      if (categoryKeyword) {
        const cat = this._findCatByKeyword(categoryKeyword);
        if (cat) txs = txs.filter(t => t.categoryId === cat.id);
      }
      // Sort by date desc
      txs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      txs = txs.slice(0, Math.min(limit || 20, 50));
      const cats = this._state().categories || [];
      return {
        count: txs.length,
        transactions: txs.map(t => ({
          date: t.date,
          type: t.type,
          amount: t.amount,
          category: cats.find(c => c.id === t.categoryId)?.name || '',
          note: t.note || ''
        }))
      };
    },

    async get_budget_status() {
      const budgets = this._state().budgets || [];
      const cats = this._state().categories || [];
      const txs = this._state().transactions || [];
      const ym = new Date().toISOString().slice(0, 7);
      const list = budgets.map(b => {
        const cat = cats.find(c => c.id === b.categoryId);
        const spent = txs.filter(t =>
          this._isReal(t) && t.type === 'expense' &&
          t.categoryId === b.categoryId &&
          t.date && t.date.startsWith(ym)
        ).reduce((s, t) => s + t.amount, 0);
        return {
          category: cat?.name || '?',
          budget: b.amount,
          spent,
          remaining: b.amount - spent,
          percent: b.amount > 0 ? Math.round(spent / b.amount * 100) : 0,
          status: spent > b.amount ? 'over' : (spent > b.amount * 0.8 ? 'warning' : 'ok')
        };
      });
      return { month: ym, count: list.length, budgets: list };
    },

    async get_account_balances() {
      const accs = (this._state().accounts || []).filter(a => (a.accountType || 'payment') === 'payment');
      const list = accs.map(a => ({
        name: a.name,
        balance: a.balance || 0,
        currency: a.currency || 'VND'
      }));
      const total = list.reduce((s, a) => s + a.balance, 0);
      return { count: list.length, totalBalance: total, accounts: list };
    },

    _findAccountByKeyword(keyword) {
      if (!keyword) return null;
      const accs = (this._state().accounts || []).filter(a => (a.accountType || 'payment') === 'payment');
      const M = window.QLT_CategoryMatcher;
      const norm = M ? M.normalize(keyword) : keyword.toLowerCase();
      // Exact match name (case-insensitive, no diacritics)
      let exact = accs.find(a => M ? M.normalize(a.name) === norm : a.name.toLowerCase() === norm);
      if (exact) return exact;
      // Substring match
      return accs.find(a => {
        const an = M ? M.normalize(a.name) : a.name.toLowerCase();
        return an.includes(norm) || norm.includes(an);
      });
    },

    async prepare_transaction({ type = 'expense', amount, categoryKeyword, accountKeyword, toAccountKeyword, note, date }) {
      const errors = [];
      // Validate amount
      if (!Number.isFinite(+amount) || +amount <= 0) {
        return { error: 'Số tiền không hợp lệ', input: { type, amount, categoryKeyword, note } };
      }
      const finalAmount = Math.round(+amount);

      // Resolve category (ưu tiên match theo type)
      let cat = null;
      if (categoryKeyword) {
        const cats = (this._state().categories || []).filter(c => c.type === type && !c.archived);
        const M = window.QLT_CategoryMatcher;
        if (M) {
          // Dùng matcher engine — cùng logic với voice parser
          const r = M.match(categoryKeyword, cats, { type });
          if (r.categoryId) cat = cats.find(c => c.id === r.categoryId);
        }
        if (!cat) cat = this._findCatByKeyword(categoryKeyword);
      }
      if (!cat && type !== 'transfer') errors.push('Không tìm thấy danh mục match "' + categoryKeyword + '"');

      // Resolve account (default: ví dùng gần đây nhất)
      let acc = accountKeyword ? this._findAccountByKeyword(accountKeyword) : null;
      if (!acc) {
        // Default: ví gần đây của tx cùng type, fallback ví đầu tiên
        const recent = (this._state().transactions || [])
          .filter(t => t.type === type && t.accountId).slice(-10).reverse();
        if (recent.length) {
          acc = (this._state().accounts || []).find(a => a.id === recent[0].accountId);
        }
        if (!acc) {
          acc = (this._state().accounts || []).find(a => (a.accountType || 'payment') === 'payment');
        }
      }
      if (!acc) errors.push('Không tìm thấy ví');

      // To-account cho transfer
      let toAcc = null;
      if (type === 'transfer') {
        toAcc = toAccountKeyword ? this._findAccountByKeyword(toAccountKeyword) : null;
        if (!toAcc) errors.push('Transfer cần chỉ định ví đích (toAccountKeyword)');
      }

      const today = new Date().toISOString().slice(0, 10);
      const finalDate = (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : today;

      // Stash trong state để UI render preview card + Save button gọi sau
      const preview = {
        id: 'prep_' + Date.now(),
        type,
        amount: finalAmount,
        categoryId: cat?.id || null,
        categoryName: cat?.name || null,
        accountId: acc?.id || null,
        accountName: acc?.name || null,
        toAccountId: toAcc?.id || null,
        toAccountName: toAcc?.name || null,
        date: finalDate,
        note: (note || '').slice(0, 200),
        bookId: this._state().currentBookId
      };

      // Lưu vào state để UI access khi user tap Lưu
      const app = window.QLT_App;
      if (app) {
        app.state._aiPendingTx = app.state._aiPendingTx || {};
        app.state._aiPendingTx[preview.id] = preview;
      }

      return {
        ok: errors.length === 0,
        prepared: preview,
        warnings: errors,
        message: errors.length === 0
          ? `Đã chuẩn bị giao dịch — đợi user confirm để lưu (gọi UI render card với prepareId="${preview.id}")`
          : 'Vẫn chuẩn bị nhưng có cảnh báo: ' + errors.join('; ')
      };
    },

    async get_monthly_trend({ months }) {
      const txs = this._state().transactions || [];
      const now = new Date();
      const result = [];
      const n = Math.max(1, Math.min(12, months || 3));
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = d.toISOString().slice(0, 7);
        let inc = 0, exp = 0;
        for (const t of txs) {
          if (!t.date || !t.date.startsWith(ym)) continue;
          if (!this._isReal(t)) continue;
          if (t.type === 'income') inc += t.amount;
          if (t.type === 'expense') exp += t.amount;
        }
        result.push({ month: ym, income: inc, expense: exp });
      }
      return { months: result };
    }
  };

  // ============================================================
  // SYSTEM PROMPT
  // ============================================================
  function buildSystemPrompt(userContext) {
    const today = new Date().toISOString().slice(0, 10);
    const ym = today.slice(0, 7);
    const appKnowledge = window.QLT_AppKnowledge || '';
    return `Bạn là TRỢ LÝ AI của app "Quản Lý Tiền" — chuyên hỗ trợ người dùng Việt Nam quản lý chi tiêu cá nhân.

NGÀY HÔM NAY: ${today} (tháng ${ym})

==========================================================
PHONG CÁCH
- Thân thiện, ngắn gọn, dùng tiếng Việt tự nhiên.
- TRẢ LỜI NGẮN — 2-5 câu, ưu tiên rõ ràng > dài dòng.
- Số tiền dùng định dạng "1.250.000 đ" (chấm phẩy VN, kèm "đ").

==========================================================
PHẠM VI HỖ TRỢ — 3 LOẠI CÂU HỎI

### LOẠI A — HỎI VỀ DATA TÀI CHÍNH (GỌI TOOL)
User hỏi về số liệu của họ → GỌI tool phù hợp → tổng hợp.
Tools: get_month_summary, get_category_total, find_transactions,
       get_budget_status, get_account_balances, get_monthly_trend.
VD: "Tháng này chi cà phê bao nhiêu?", "Còn budget?", "Số dư các ví?".

### LOẠI B — HỎI VỀ CÁCH DÙNG APP / TÍNH NĂNG (TRẢ LỜI TỪ KIẾN THỨC)
Trả lời dựa trên KIẾN THỨC ĐẦY ĐỦ VỀ APP bên dưới.
HƯỚNG DẪN TỪNG BƯỚC nhưng KHÔNG LÀM THAY (trừ tạo giao dịch).
VD: "Làm sao tạo sổ mới?", "Cài đặt PIN ở đâu?", "Sao app không nhận voice?",
    "Đổi theme tối thế nào?", "Backup data ra sao?", "Quên PIN làm sao?".

QUAN TRỌNG về LOẠI B:
- Trả lời cụ thể PATH thao tác: "Vào Cài đặt → ... → tap ..."
- KHÔNG tự đi làm thay — chỉ chỉ đường.
- Nếu không có trong knowledge → nói thẳng "Mình chưa có thông tin về..., bạn liên hệ Zalo 0909683666 nhé."

### LOẠI C — TẠO GIAO DỊCH (DUY NHẤT ĐƯỢC HÀNH ĐỘNG)
Khi user nói "ăn sáng 50k", "đổ xăng 100k vcb", "lương về 15tr" → GỌI tool prepare_transaction.
- type: "expense" mặc định | "income" cho lương/thưởng/cashback | "transfer" khi "chuyển/sang/đến".
- amount: "50k"=50000, "1tr5"=1500000, "2 triệu"=2000000.
- categoryKeyword: trích từ câu ("ăn sáng" → "ăn ngoài", "xăng" → "xăng xe").
- accountKeyword: nếu user nói ("vcb", "tiền mặt"). Bỏ trống nếu không.
- note: phần mô tả ngắn.
- TRẢ LỜI: "Tôi đã chuẩn bị giao dịch — bấm 'Lưu' để xác nhận."
- THIẾU thông tin (vd "ăn sáng" không amount) → KHÔNG gọi tool, hỏi user.

==========================================================
NGUYÊN TẮC TỪ CHỐI

### Hành động khác (trừ tạo GD) → KHÔNG LÀM THAY, chỉ HƯỚNG DẪN.
- "Xoá GD vừa tạo" → "Bạn vào tab Trang chủ → tap vào GD đó → tap nút 🗑️ Xoá ở dưới form."
- "Đổi cat của GD này" → "Bạn tap GD → form mở → đổi cat → Lưu."
- "Đặt budget 5tr cho ăn uống" → "Vào menu trái → Tài chính → Ngân sách → tap +"
- "Tạo recurring rule lương" → "Vào menu trái → Tài chính → 🔄 Giao dịch định kỳ → tap +"

### Câu ngoài app (thời tiết, công thức, news, recipe...)
"Mình là trợ lý của app Quản Lý Tiền — chỉ hỗ trợ về thu chi và tính năng app. Bạn muốn hỏi gì khác về app không?"

### Câu cảm xúc / tán gẫu
Trả lời ngắn + redirect: "Cảm ơn bạn 😊. Có gì cần hỗ trợ về tài chính/app không?"

==========================================================
CONTEXT USER HIỆN TẠI:
${userContext}

==========================================================
KIẾN THỨC ĐẦY ĐỦ VỀ APP (dùng để trả lời LOẠI B):

${appKnowledge}
==========================================================

VÍ DỤ TRẢ LỜI:

[LOẠI A] User: "Tháng này tôi chi cà phê bao nhiêu?"
→ Gọi get_category_total(categoryKeyword="cà phê", fromDate="${ym}-01", toDate="${today}")
→ "Tháng này bạn đã chi 1.250.000 đ cho cà phê (15 lần). Cao nhất ngày 5/5: 65k tại Highlands."

[LOẠI B] User: "Làm sao tạo sổ mới?"
→ "Tap menu **☰** góc trên trái → list sổ hiện ra → tap **'Tạo sổ mới'** → đặt tên + chọn icon → Lưu."

[LOẠI B] User: "Sao voice không hoạt động?"
→ "Voice cần build APK có plugin Speech Recognition. Nếu bạn đang dùng web (PWA) thì chưa có. Cài APK từ GitHub Releases mới dùng được."

[LOẠI C] User: "Ăn sáng 50k"
→ Gọi prepare_transaction → "Tôi đã chuẩn bị, bấm 'Lưu' để xác nhận nhé."

[TỪ CHỐI] User: "Xoá GD ăn sáng vừa nãy đi"
→ "Mình chỉ tạo được GD, không xoá thay được. Bạn vào Trang chủ → tap vào GD đó → trong form GD có nút **🗑️ Xoá** đỏ ở dưới → confirm là xong."

[TỪ CHỐI] User: "Hôm nay trời mưa không?"
→ "Mình là trợ lý của app Quản Lý Tiền — chỉ hỗ trợ về thu chi và tính năng. Bạn muốn hỏi gì khác về app không?"`;
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  window.QLT_AIChat = {
    buildSystemPrompt,
    buildToolDeclarations,
    ToolExec,

    // Build user context: tóm tắt data để gắn vào system prompt
    // (KHÔNG gửi raw tx — chỉ summary để tiết kiệm token)
    buildUserContext(rawMode = false) {
      const app = window.QLT_App;
      if (!app?.state) return '(chưa có dữ liệu)';
      const accs = (app.state.accounts || []).filter(a => (a.accountType || 'payment') === 'payment');
      const totalBal = accs.reduce((s, a) => s + (a.balance || 0), 0);
      const cats = app.state.categories || [];
      const txs = app.state.transactions || [];
      const ym = new Date().toISOString().slice(0, 7);
      const monthTxs = txs.filter(t => t.date && t.date.startsWith(ym));
      const monthInc = monthTxs.filter(t => t.type === 'income' && !t._adjustment).reduce((s, t) => s + t.amount, 0);
      const monthExp = monthTxs.filter(t => t.type === 'expense' && !t._adjustment).reduce((s, t) => s + t.amount, 0);

      let ctx = `- Tổng số dư các ví: ${totalBal.toLocaleString('vi-VN')} đ (${accs.length} ví)\n`;
      ctx += `- Tháng ${ym}: thu ${monthInc.toLocaleString('vi-VN')} đ · chi ${monthExp.toLocaleString('vi-VN')} đ · ${monthTxs.length} giao dịch\n`;
      ctx += `- Tổng cộng có ${cats.length} danh mục, ${txs.length} giao dịch lịch sử\n`;
      if (rawMode) {
        // TODO: include more detailed data if user enables raw mode
        ctx += '- (raw mode: full data sẽ được query qua tool khi cần)\n';
      }
      return ctx;
    },

    // Gửi câu hỏi user → AI → trả về { reply, toolsUsed, raw }
    // history: [{ role, parts/text }, ...]
    async ask(userMessage, history = []) {
      const ai = window.QLT_AI;
      if (!ai) throw new Error('AI module chưa load');
      if (!await ai.hasApiKey()) throw new Error('Chưa cấu hình API key');

      const rawMode = await ai.getPref('rawMode', false);
      const systemInstruction = buildSystemPrompt(this.buildUserContext(rawMode));
      const tools = buildToolDeclarations();

      // Build messages: history + new user message
      const messages = [
        ...history,
        { role: 'user', text: userMessage }
      ];

      // Loop để handle multi-step tool calls
      let finalReply = '';
      let lastFinishReason = '';
      const toolsUsed = [];
      let pendingTxId = null;
      const MAX_STEPS = 5;

      for (let step = 0; step < MAX_STEPS; step++) {
        const r = await ai.chat({
          messages,
          tools,
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 2048
        });
        lastFinishReason = r.finishReason || '';

        // Nếu có tool calls → execute + add to history
        if (r.toolCalls && r.toolCalls.length > 0) {
          const toolResults = [];
          for (const call of r.toolCalls) {
            toolsUsed.push(call.name);
            try {
              const fn = ToolExec[call.name];
              if (!fn) {
                toolResults.push({ name: call.name, response: { error: 'Unknown function' } });
                continue;
              }
              const result = await fn.call(ToolExec, call.args || {});
              toolResults.push({ name: call.name, response: result });
              // Track pending tx
              if (call.name === 'prepare_transaction' && result.prepared?.id) {
                pendingTxId = result.prepared.id;
              }
            } catch (e) {
              toolResults.push({ name: call.name, response: { error: e.message } });
            }
          }
          // Push lại RAW parts từ model response — KHÔNG rebuild lại,
          // để giữ nguyên `thoughtSignature` mà Gemini 2.5/3 yêu cầu.
          // Push lại RAW parts từ model response — KHÔNG rebuild lại,
          // để giữ nguyên `thoughtSignature` mà Gemini 2.5/3 yêu cầu.
          messages.push({
            role: 'model',
            parts: r.rawParts || r.toolCalls.map(c => ({ functionCall: { name: c.name, args: c.args || {} } }))
          });
          // Gemini API yêu cầu functionResponse.response là OBJECT (không phải array/null/string).
          // Wrap nếu tool trả về array hoặc primitive để tránh lỗi
          // 'Proto field is not repeating, cannot start list'.
          messages.push({
            role: 'user',
            parts: toolResults.map(tr => {
              let payload = tr.response;
              if (payload === null || payload === undefined) {
                payload = { result: null };
              } else if (Array.isArray(payload)) {
                payload = { items: payload };
              } else if (typeof payload !== 'object') {
                payload = { result: payload };
              }
              return { functionResponse: { name: tr.name, response: payload } };
            })
          });
          continue;
        }

        finalReply = r.text || '';
        break;
      }

      // Nếu vẫn không có reply (text empty từ model) → giải thích lý do
      if (!finalReply || !finalReply.trim()) {
        if (lastFinishReason === 'MAX_TOKENS') {
          finalReply = '⚠️ Câu trả lời quá dài bị cắt — thử hỏi gọn hơn (vd "tháng này chi gì nhiều nhất top 3").';
        } else if (lastFinishReason === 'SAFETY' || lastFinishReason === 'RECITATION') {
          finalReply = '⚠️ AI từ chối trả lời câu này vì chính sách bảo mật. Thử hỏi cách khác.';
        } else if (lastFinishReason === 'STOP') {
          // STOP với text rỗng = model không generate ra gì
          finalReply = '⚠️ AI không sinh được response (' + lastFinishReason + '). Thử hỏi lại bằng câu khác hoặc hỏi đơn giản hơn.';
        } else {
          finalReply = '⚠️ AI không thể trả lời (' + (lastFinishReason || 'unknown') + ') sau ' + MAX_STEPS + ' bước. Thử hỏi câu khác hoặc bấm "Kiểm tra cập nhật" trong Settings.';
        }
      }

      return {
        reply: finalReply,
        toolsUsed,
        pendingTxId,
        history: messages
      };
    }
  };
})();
