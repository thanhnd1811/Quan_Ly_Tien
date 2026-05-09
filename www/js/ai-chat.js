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
      return budgets.map(b => {
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
    },

    async get_account_balances() {
      const accs = (this._state().accounts || []).filter(a => (a.accountType || 'payment') === 'payment');
      return accs.map(a => ({
        name: a.name,
        balance: a.balance || 0,
        currency: a.currency || 'VND'
      }));
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
    return `Bạn là trợ lý tài chính cá nhân của user Việt Nam, tên "Quản Lý Tiền AI". Phong cách: thân thiện, ngắn gọn, dùng tiếng Việt tự nhiên.

NGÀY HÔM NAY: ${today} (tháng ${ym})

NGUYÊN TẮC:
- TRẢ LỜI NGẮN GỌN — 2-4 câu là tốt nhất, không lan man.
- Khi cần data → GỌI TOOL trước, không đoán bừa.
- Sau khi nhận data từ tool → tổng hợp thành câu trả lời rõ ràng.
- Số tiền dùng định dạng "1.250.000 đ" (chấm phẩy phong cách Việt Nam, kèm "đ").
- Khi user hỏi mơ hồ ("dạo này tôi tiêu thế nào") → GỌI tool get_month_summary.
- Khi so sánh tháng → GỌI get_monthly_trend.
- Tránh kết luận quá rộng, ưu tiên fact + 1 insight ngắn.
- Nếu user hỏi điều ngoài tài chính (vd thời tiết, công thức nấu ăn) → từ chối lịch sự, gợi ý hỏi về tiền.

CONTEXT USER:
${userContext}

VÍ DỤ:
- "Tháng này tôi chi cà phê bao nhiêu?" → gọi get_category_total(categoryKeyword="cà phê", fromDate=đầu tháng, toDate=hôm nay) → "Bạn đã chi 1.250.000 đ cho cà phê tháng này (15 lần)."
- "Còn budget không?" → gọi get_budget_status → "Còn 3 cat trong budget: Ăn uống còn 1.5tr, Đi lại còn 800k, Mua sắm vượt 200k 🚨"`;
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
      const toolsUsed = [];
      const MAX_STEPS = 5;

      for (let step = 0; step < MAX_STEPS; step++) {
        const r = await ai.chat({
          messages,
          tools,
          systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 1024
        });

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
            } catch (e) {
              toolResults.push({ name: call.name, response: { error: e.message } });
            }
          }
          // Add model's tool call message + tool responses to history
          messages.push({
            role: 'model',
            parts: r.toolCalls.map(c => ({ functionCall: { name: c.name, args: c.args || {} } }))
          });
          messages.push({
            role: 'user',
            parts: toolResults.map(r => ({
              functionResponse: { name: r.name, response: r.response }
            }))
          });
          continue;
        }

        // No tool calls → final response
        finalReply = r.text || '(không có response)';
        break;
      }

      if (!finalReply) finalReply = '⚠️ AI không thể trả lời sau nhiều bước. Thử hỏi khác?';

      return {
        reply: finalReply,
        toolsUsed,
        history: messages
      };
    }
  };
})();
