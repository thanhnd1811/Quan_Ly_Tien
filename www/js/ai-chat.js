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
        description: 'Tìm danh sách giao dịch theo filter. Dùng khi user hỏi "hôm nay tôi mua gì", "VCB tháng này chi gì", "các GD > 1tr tháng này".',
        parameters: {
          type: 'object',
          properties: {
            fromDate: { type: 'string', description: 'YYYY-MM-DD. Hôm nay = ' + (new Date()).toISOString().slice(0,10) },
            toDate: { type: 'string', description: 'YYYY-MM-DD' },
            categoryKeyword: { type: 'string', description: 'Optional — lọc theo cat (vd "cà phê", "xăng")' },
            accountKeyword: { type: 'string', description: 'Optional — lọc theo ví (vd "vcb", "tiền mặt", "mb")' },
            type: { type: 'string', description: 'Optional: "expense" | "income" | "transfer"' },
            minAmount: { type: 'number', description: 'Optional — chỉ lấy tx >= số này' },
            limit: { type: 'integer', description: 'Số tx tối đa trả về (default 20, max 50)' }
          },
          required: ['fromDate', 'toDate']
        }
      },
      {
        name: 'get_loans',
        description: 'Lấy danh sách khoản CHO VAY (mình cho ai vay) hoặc đang VAY (mình nợ ai). Dùng khi user hỏi "tôi đang nợ ai", "ai nợ tôi", "tổng cho vay".',
        parameters: {
          type: 'object',
          properties: {
            type: { type: 'string', description: 'Optional: "lend" (cho vay) | "borrow" (mình vay) | "all" default' }
          }
        }
      },
      {
        name: 'get_savings_goals',
        description: 'Lấy danh sách mục tiêu tiết kiệm + tiến độ. Dùng khi user hỏi "mục tiêu tiết kiệm thế nào", "còn bao xa đạt 100tr".',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'get_savings_accounts',
        description: 'Lấy danh sách sổ tiết kiệm (savings accounts) + gốc + lãi tích lũy + ngày đáo hạn. Dùng khi user hỏi "sổ TK đáo hạn khi nào", "tổng tiết kiệm", "lãi bao nhiêu".',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'get_recurring_rules',
        description: 'Lấy danh sách giao dịch định kỳ (recurring rules) đang active. Dùng khi user hỏi "lương về ngày mấy", "rule định kỳ nào", "tháng này còn gì chưa fire".',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'get_vehicle_stats',
        description: 'Lấy chi phí xe + thống kê tiêu thụ. Dùng khi user hỏi "tháng này đổ xăng bao nhiêu", "bao giờ thay nhớt", "tiêu thụ xe", "chi phí Honda Wave".',
        parameters: {
          type: 'object',
          properties: {
            vehicleKeyword: { type: 'string', description: 'Optional — tên xe (vd "honda", "wave", "wave alpha"). Bỏ trống = tất cả xe.' }
          }
        }
      },
      {
        name: 'get_budget_status',
        description: 'Lấy trạng thái các budget (ngân sách) tháng hiện tại — đã chi bao nhiêu, còn lại bao nhiêu. Dùng khi user hỏi "còn budget không", "tôi vượt ngân sách chưa".',
        parameters: { type: 'object', properties: {} }
      },
      {
        name: 'get_account_balances',
        description: 'Lấy số dư hiện tại của các ví. Dùng khi user hỏi "tôi còn bao nhiêu tiền", "số dư các ví", hoặc hỏi cụ thể "ví Vietcombank còn bao nhiêu" (truyền accountKeyword để filter).',
        parameters: {
          type: 'object',
          properties: {
            accountKeyword: {
              type: 'string',
              description: 'Optional. Tên ví hoặc keyword để filter. VD "vcb", "vietcombank", "tiền mặt", "mb". Bỏ trống để lấy tất cả ví.'
            }
          }
        }
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

    async find_transactions({ fromDate, toDate, categoryKeyword, accountKeyword, type, minAmount, limit = 20 }) {
      let txs = (this._state().transactions || []).filter(t =>
        t.date >= fromDate && t.date <= toDate
      );
      if (type) txs = txs.filter(t => t.type === type);
      if (minAmount) txs = txs.filter(t => t.amount >= minAmount);
      if (categoryKeyword) {
        const cat = this._findCatByKeyword(categoryKeyword);
        if (cat) txs = txs.filter(t => t.categoryId === cat.id);
      }
      if (accountKeyword) {
        const acc = this._findAccountByKeyword(accountKeyword);
        if (acc) txs = txs.filter(t => t.accountId === acc.id || t.toAccountId === acc.id);
      }
      // Sort by date desc
      txs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const total = txs.reduce((s, t) => s + t.amount, 0);
      txs = txs.slice(0, Math.min(limit || 20, 50));
      const cats = this._state().categories || [];
      const accs = this._state().accounts || [];
      return {
        count: txs.length,
        totalAmount: total,
        fromDate, toDate,
        transactions: txs.map(t => ({
          date: t.date,
          type: t.type,
          amount: t.amount,
          category: cats.find(c => c.id === t.categoryId)?.name || '',
          account: accs.find(a => a.id === t.accountId)?.name || '',
          note: t.note || ''
        }))
      };
    },

    async get_loans({ type } = {}) {
      const loans = this._state().loans || [];
      let filtered = loans;
      if (type === 'lend' || type === 'borrow') {
        filtered = loans.filter(l => l.type === type);
      }
      const list = filtered.map(l => {
        const principal = l.amount || 0;
        const paid = (l.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
        const remaining = principal - paid;
        return {
          partner: l.partnerName || '?',
          type: l.type === 'lend' ? 'cho vay' : 'mình vay',
          principal,
          paid,
          remaining,
          status: remaining <= 0 ? 'đã trả xong' : 'đang còn',
          startDate: l.startDate,
          dueDate: l.dueDate,
          note: l.note
        };
      });
      const totalLend = list.filter(l => l.type === 'cho vay' && l.remaining > 0).reduce((s, l) => s + l.remaining, 0);
      const totalBorrow = list.filter(l => l.type === 'mình vay' && l.remaining > 0).reduce((s, l) => s + l.remaining, 0);
      return {
        count: list.length,
        totalLending: totalLend,
        totalBorrowing: totalBorrow,
        loans: list
      };
    },

    async get_savings_goals() {
      const goals = this._state().goals || [];
      const list = goals.map(g => {
        const target = g.targetAmount || 0;
        const current = g.currentAmount || 0;
        const remaining = target - current;
        const percent = target > 0 ? Math.round(current / target * 100) : 0;
        return {
          name: g.name || '?',
          target,
          current,
          remaining,
          percent,
          deadline: g.deadline,
          status: percent >= 100 ? 'đã đạt' : (percent >= 80 ? 'sắp đạt' : 'đang tiết kiệm')
        };
      });
      return { count: list.length, goals: list };
    },

    async get_savings_accounts() {
      const accs = (this._state().accounts || []).filter(a => a.accountType === 'savings');
      const today = new Date();
      const list = accs.map(a => {
        const principal = a.balance || 0;
        const rate = a.interestRate || 0;
        const term = a.termMonths || 0;
        const startDate = a.startDate ? new Date(a.startDate) : null;
        const maturityDate = a.maturityDate ? new Date(a.maturityDate) : null;

        // Lãi tích lũy đến hôm nay (linear)
        let accruedInterest = 0;
        if (startDate && rate > 0) {
          const daysElapsed = Math.max(0, Math.floor((today - startDate) / (1000 * 60 * 60 * 24)));
          accruedInterest = Math.round(principal * (rate / 100) * (daysElapsed / 365));
        }

        // Số ngày còn đến đáo hạn
        const daysUntilMaturity = maturityDate
          ? Math.ceil((maturityDate - today) / (1000 * 60 * 60 * 24))
          : null;

        const expectedFullInterest = rate > 0 && term > 0
          ? Math.round(principal * (rate / 100) * (term / 12))
          : 0;

        return {
          name: a.name,
          principal,
          interestRate: rate,
          termMonths: term,
          startDate: a.startDate,
          maturityDate: a.maturityDate,
          accruedInterest,
          expectedFullInterest,
          daysUntilMaturity,
          status: a.savingsClosed ? 'đã đóng' : 'đang chạy'
        };
      });
      const totalPrincipal = list.filter(l => l.status === 'đang chạy').reduce((s, l) => s + l.principal, 0);
      const totalAccrued = list.filter(l => l.status === 'đang chạy').reduce((s, l) => s + l.accruedInterest, 0);
      return {
        count: list.length,
        totalPrincipal,
        totalAccruedInterest: totalAccrued,
        accounts: list
      };
    },

    async get_recurring_rules() {
      const rules = (this._state().recurringRules || []).filter(r => r.active);
      const cats = this._state().categories || [];
      const accs = this._state().accounts || [];
      const list = rules.map(r => ({
        name: r.name,
        type: r.type,
        amount: r.amount,
        frequency: r.frequency,
        dayOfMonth: r.dayOfMonth,
        dayOfWeek: r.dayOfWeek,
        startDate: r.startDate,
        endDate: r.endDate,
        category: cats.find(c => c.id === r.categoryId)?.name || '',
        account: accs.find(a => a.id === r.accountId)?.name || '',
        lastRunDate: r.lastRunDate
      }));
      return { count: list.length, rules: list };
    },

    async get_vehicle_stats({ vehicleKeyword } = {}) {
      const fuelLogs = this._state().fuelLogs || [];
      const maintLogs = this._state().maintenanceLogs || [];

      // Group by vehicle
      const vehicleMap = new Map();
      const addLog = (log, kind) => {
        const name = (log.vehicleName || '').trim();
        if (!name) return;
        if (!vehicleMap.has(name)) {
          vehicleMap.set(name, { name, type: log.vehicleType || 'motorbike', fuel: [], maint: [] });
        }
        vehicleMap.get(name)[kind].push(log);
      };
      fuelLogs.forEach(l => addLog(l, 'fuel'));
      maintLogs.forEach(l => addLog(l, 'maint'));

      let vehicles = [...vehicleMap.values()];
      if (vehicleKeyword) {
        const M = window.QLT_CategoryMatcher;
        const norm = M ? M.normalize(vehicleKeyword) : vehicleKeyword.toLowerCase();
        vehicles = vehicles.filter(v => {
          const vn = M ? M.normalize(v.name) : v.name.toLowerCase();
          return vn.includes(norm) || norm.includes(vn);
        });
      }

      const ym = new Date().toISOString().slice(0, 7);
      const stats = vehicles.map(v => {
        // Tháng này
        const monthFuel = v.fuel.filter(f => (f.date || '').startsWith(ym)).reduce((s, f) => s + (f.amount || 0), 0);
        const monthMaint = v.maint.filter(m => (m.date || '').startsWith(ym)).reduce((s, m) => s + (m.amount || 0), 0);

        // Tổng cộng
        const totalFuel = v.fuel.reduce((s, f) => s + (f.amount || 0), 0);
        const totalMaint = v.maint.reduce((s, m) => s + (m.amount || 0), 0);

        // Mức tiêu thụ (cần ≥ 2 fuel logs có odometer + liters)
        const fuelAsc = [...v.fuel].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const consumptions = [];
        let totalDistance = 0;
        for (let i = 1; i < fuelAsc.length; i++) {
          const dKm = (fuelAsc[i].odometer || 0) - (fuelAsc[i - 1].odometer || 0);
          const liters = fuelAsc[i].liters || 0;
          if (dKm > 0 && liters > 0) {
            consumptions.push(liters / dKm * 100);
            totalDistance += dKm;
          }
        }
        const avgConsumption = consumptions.length
          ? +(consumptions.reduce((s, x) => s + x, 0) / consumptions.length).toFixed(1)
          : null;
        const maxOdo = Math.max(0, ...v.fuel.map(f => f.odometer || 0), ...v.maint.map(m => m.odometer || 0));

        // Lần thay nhớt cuối + cảnh báo
        const oilLogs = v.maint.filter(m => m.kind === 'oil' && m.odometer).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const lastOil = oilLogs[0] || null;
        const oilThreshold = v.type === 'car' ? 5000 : 1500;
        const kmSinceLastOil = lastOil && maxOdo ? maxOdo - lastOil.odometer : null;
        const oilAlert = kmSinceLastOil && kmSinceLastOil >= oilThreshold;

        return {
          name: v.name,
          type: v.type,
          monthSpend: monthFuel + monthMaint,
          totalSpend: totalFuel + totalMaint,
          fuelCount: v.fuel.length,
          maintCount: v.maint.length,
          currentOdometer: maxOdo,
          avgFuelConsumption: avgConsumption ? `${avgConsumption} L/100km` : null,
          lastOilChangeDate: lastOil?.date || null,
          kmSinceLastOilChange: kmSinceLastOil,
          oilChangeNeeded: oilAlert
        };
      });

      return { count: stats.length, vehicles: stats };
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

    async get_account_balances({ accountKeyword } = {}) {
      let accs = (this._state().accounts || []).filter(a => (a.accountType || 'payment') === 'payment');

      // Filter theo keyword nếu user hỏi cụ thể 1 ví
      if (accountKeyword && accountKeyword.trim()) {
        const M = window.QLT_CategoryMatcher;
        const norm = M ? M.normalize(accountKeyword) : accountKeyword.toLowerCase();
        const filtered = accs.filter(a => {
          const an = M ? M.normalize(a.name) : a.name.toLowerCase();
          return an.includes(norm) || norm.includes(an);
        });
        // Nếu không match → return all + warning
        if (filtered.length === 0) {
          const list = accs.map(a => ({ name: a.name, balance: a.balance || 0 }));
          return {
            warning: `Không tìm thấy ví match "${accountKeyword}". Đây là tất cả ví:`,
            count: list.length,
            totalBalance: list.reduce((s, a) => s + a.balance, 0),
            accounts: list
          };
        }
        accs = filtered;
      }

      const list = accs.map(a => ({
        name: a.name,
        balance: a.balance || 0,
        currency: a.currency || 'VND'
      }));
      const total = list.reduce((s, a) => s + a.balance, 0);
      return {
        count: list.length,
        totalBalance: total,
        accounts: list,
        ...(accountKeyword ? { filter: accountKeyword } : {})
      };
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
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const ym = today.slice(0, 7);
    const yesterday = (() => { const d = new Date(now); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10); })();
    const lastMonth = (() => { const d = new Date(now); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7); })();
    const sixMonthsAgo = (() => { const d = new Date(now); d.setMonth(d.getMonth()-6); return d.toISOString().slice(0,10); })();
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

13 tools available — chọn đúng tool theo câu hỏi:
- get_month_summary(month=YYYY-MM) — Tổng quan tháng + top 5 cat
- get_category_total(categoryKeyword, fromDate, toDate) — Tổng 1 cat
- find_transactions(fromDate, toDate, categoryKeyword?, accountKeyword?, type?, minAmount?) — Tìm GD
- get_budget_status() — Status các budget
- get_account_balances(accountKeyword?) — Số dư ví (filter nếu hỏi cụ thể)
- get_monthly_trend(months=N) — Trend N tháng
- get_loans(type?) — Cho vay/nợ ('lend'|'borrow'|all)
- get_savings_goals() — Mục tiêu tiết kiệm
- get_savings_accounts() — Sổ tiết kiệm + lãi
- get_recurring_rules() — Định kỳ (lương, tiền nhà...)
- get_vehicle_stats(vehicleKeyword?) — Chi phí xe + tiêu thụ
- prepare_transaction(...) — TẠO GD (LOẠI C)

DATE PARSING (chuyển ngôn ngữ thành YYYY-MM-DD):
- "hôm nay" = ${today}
- "hôm qua" = ${yesterday}
- "tuần này" = Thứ 2 tuần này → ${today}
- "tháng này" = ${ym}-01 → ${today}
- "tháng trước" = ${lastMonth} (full month)
- "năm nay" = ${now.getFullYear()}-01-01 → ${today}
- "6 tháng qua" = ${sixMonthsAgo} → ${today}

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

VÍ DỤ TRẢ LỜI (theo nhóm câu hỏi):

═══ THU/CHI TỔNG QUAN ═══
"Tháng này chi gì nhiều nhất?" → get_month_summary(month="${ym}")
"Hôm nay tôi mua gì?" → find_transactions(fromDate="${today}", toDate="${today}")
"Tuần này chi bao nhiêu?" → find_transactions(fromDate=monday_this_week, toDate="${today}")
"Năm nay tổng chi?" → get_monthly_trend(months=12) → cộng lại
"Cuối tuần qua chi gì?" → find_transactions(fromDate=last_saturday, toDate=last_sunday)

═══ THEO DANH MỤC ═══
"Tôi chi cà phê bao nhiêu?" → get_category_total(categoryKeyword="cà phê", ...)
"6 tháng chi xăng tổng?" → get_category_total(categoryKeyword="xăng", fromDate=6_months_ago, toDate="${today}")
"Cat nào tôi chi nhiều nhất tháng?" → get_month_summary

═══ THEO VÍ ═══
"Số dư VCB?" → get_account_balances(accountKeyword="vietcombank")
"VCB tháng này chi gì?" → find_transactions(accountKeyword="vcb", fromDate="${ym}-01", toDate="${today}", type="expense")
"Ví nào nhiều tiền nhất?" → get_account_balances() → so sánh

═══ CHO VAY / NỢ ═══
"Tôi đang nợ ai?" → get_loans(type="borrow")
"Ai nợ tôi?" → get_loans(type="lend")
"Tổng cho vay chưa thu?" → get_loans(type="lend") → totalLending

═══ SỔ TIẾT KIỆM ═══
"Sổ TK đáo hạn khi nào?" → get_savings_accounts() → daysUntilMaturity
"Tổng tiết kiệm + lãi?" → get_savings_accounts() → totalPrincipal + totalAccruedInterest
"Lãi tích lũy?" → get_savings_accounts() → totalAccruedInterest

═══ MỤC TIÊU TIẾT KIỆM ═══
"Mục tiêu thế nào?" → get_savings_goals() → list + percent
"Có khả thi đạt 100tr cuối năm?" → get_savings_goals() + tính rate cần/tháng

═══ CHI PHÍ XE ═══
"Tháng này đổ xăng bao nhiêu?" → get_vehicle_stats() → monthSpend
"Bao giờ thay nhớt?" → get_vehicle_stats() → oilChangeNeeded + kmSinceLastOilChange
"Tiêu thụ Honda Wave?" → get_vehicle_stats(vehicleKeyword="wave") → avgFuelConsumption

═══ ĐỊNH KỲ ═══
"Lương về ngày mấy?" → get_recurring_rules() → tìm cat Lương → dayOfMonth
"Có rule định kỳ nào?" → get_recurring_rules() → list

═══ BUDGET ═══
"Còn budget không?" → get_budget_status()
"Tôi vượt budget chưa?" → get_budget_status() → check status='over'

═══ TẠO GD ═══
"ăn sáng 50k" → prepare_transaction(type="expense", amount=50000, categoryKeyword="ăn sáng", note="ăn sáng")

[LOẠI B] User: "Làm sao tạo sổ mới?"
→ "Tap menu **☰** góc trên trái → list sổ hiện ra → tap **'Tạo sổ mới'** → đặt tên + chọn icon → Lưu."

[LOẠI B] User: "Sao voice không hoạt động?"
→ "Voice cần build APK có plugin Speech Recognition. Nếu bạn đang dùng web (PWA) thì chưa có. Cài APK từ GitHub Releases mới dùng được."

[LOẠI C] User: "Ăn sáng 50k"
→ Gọi prepare_transaction → "Tôi đã chuẩn bị, bấm 'Lưu' để xác nhận nhé."

[LOẠI C - AUTO-SAVE] User: "Ăn sáng 50k lưu" / "...xong" / "...ok" / "...chốt"
   (user kết thúc câu bằng từ khoá save → app sẽ tự lưu sau khi prepare)
→ Gọi prepare_transaction → "✅ Đã lưu giao dịch chi 50.000đ ăn sáng."
   (KHÔNG nói 'bấm Lưu' vì app tự lưu rồi — chỉ confirm ngắn gọn)

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
