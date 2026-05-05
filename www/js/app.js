// Logic chính của app
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

// ===== In-app dialog + toast (thay alert/confirm native, hoạt động như nhau trên web & APK) =====
const QLT_UI = (() => {
  const escapeText = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  let activeResolve = null;

  function close(result) {
    const dlg = document.getElementById('qltDialog');
    if (!dlg) return;
    dlg.classList.remove('open');
    document.getElementById('qltDialogActions').innerHTML = '';
    const r = activeResolve;
    activeResolve = null;
    if (r) r(result);
  }

  function open({ title = '', message = '', buttons }) {
    return new Promise(resolve => {
      // Nếu có dialog cũ đang mở, đóng (resolve undefined) trước
      if (activeResolve) { try { activeResolve(undefined); } catch (_) {} activeResolve = null; }

      const dlg = document.getElementById('qltDialog');
      if (!dlg) { resolve(undefined); return; }

      document.getElementById('qltDialogTitle').innerHTML = title ? escapeText(title) : '';
      document.getElementById('qltDialogTitle').style.display = title ? 'block' : 'none';
      document.getElementById('qltDialogMsg').innerHTML = escapeText(message);

      const actions = document.getElementById('qltDialogActions');
      actions.innerHTML = '';
      buttons.forEach(b => {
        const btn = document.createElement('button');
        btn.className = 'qlt-dialog-btn' + (b.variant ? ' ' + b.variant : '');
        btn.type = 'button';
        btn.textContent = b.label;
        btn.onclick = () => close(b.value);
        actions.appendChild(btn);
      });

      activeResolve = resolve;
      dlg.classList.add('open');
    });
  }

  function alert(message, opts = {}) {
    return open({
      title: opts.title || '',
      message,
      buttons: [{ label: opts.okLabel || 'OK', variant: 'primary', value: true }]
    });
  }

  function confirm(message, opts = {}) {
    return open({
      title: opts.title || '',
      message,
      buttons: [
        { label: opts.cancelLabel || 'Huỷ', value: false },
        { label: opts.okLabel || 'OK', variant: opts.danger ? 'danger' : 'primary', value: true }
      ]
    });
  }

  function toast(message, opts = {}) {
    const wrap = document.getElementById('qltToastWrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'qlt-toast' + (opts.type ? ' ' + opts.type : '');
    el.textContent = message;
    wrap.appendChild(el);
    const ms = opts.duration || (opts.type === 'error' ? 3500 : 2200);
    setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => el.remove(), 260);
    }, ms);
  }

  // Đóng khi bấm nền tối (không tính như xác nhận)
  document.addEventListener('DOMContentLoaded', () => {
    const dlg = document.getElementById('qltDialog');
    if (dlg) dlg.addEventListener('click', e => { if (e.target === dlg) close(false); });
    document.addEventListener('keydown', e => {
      if (!document.getElementById('qltDialog')?.classList.contains('open')) return;
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') {
        const btns = document.querySelectorAll('#qltDialogActions .qlt-dialog-btn');
        const last = btns[btns.length - 1];
        if (last) last.click();
      }
    });
  });

  return { alert, confirm, toast };
})();
window.QLT_UI = QLT_UI;
const fmt = n => (n || 0).toLocaleString('vi-VN');
const today = () => new Date().toISOString().slice(0, 10);
const todayTime = () => {
  const d = new Date();
  return d.toTimeString().slice(0, 5);
};

// Format số tiền với dấu chấm phân cách (vi-VN)
const fmtAmount = v => {
  const n = parseInt(String(v).replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString('vi-VN') : '';
};

// Tính nhanh biểu thức số học an toàn (chỉ cho phép 0-9 + - * / . ( ) space)
// Ví dụ: '45000+12000+8500' → 65500
// Trả null nếu biểu thức không hợp lệ
function evalAmountExpr(expr) {
  if (!expr) return null;
  // Bỏ khoảng trắng + dấu chấm phân cách (vi-VN dùng . làm thousand sep)
  // Quy ước: dấu chấm KHÔNG phải toán tử thập phân ở app này (VND không có lẻ)
  const clean = String(expr).replace(/\s+/g, '').replace(/\./g, '');
  if (!clean) return null;
  // Chỉ chấp nhận ký tự an toàn
  if (!/^[0-9+\-*/()]+$/.test(clean)) return null;
  // Không cho phép operator dính nhau (vd: ++, **) ngoài dấu - đứng đầu
  if (/[+*/]{2}|\d-\d-/.test(clean)) {/* allow */}
  try {
    // eslint-disable-next-line no-new-func
    const r = Function('"use strict";return (' + clean + ')')();
    if (typeof r !== 'number' || !isFinite(r)) return null;
    return Math.round(r);
  } catch (_) { return null; }
}

// Gắn auto-format dấu chấm + hỗ trợ biểu thức (45+12+8.5) khi user gõ số vào input
function attachAmountFormatting(el) {
  if (!el || el._qltFmt) return;
  el._qltFmt = true;

  // Có chứa toán tử ngoài chữ số? → đang trong "chế độ biểu thức"
  const hasOp = (s) => /[+\-*/()]/.test(s || '');

  el.addEventListener('input', () => {
    // Nếu user đang gõ biểu thức → KHÔNG format, để nguyên cho user thấy
    if (hasOp(el.value)) return;
    const cursor = el.selectionStart || 0;
    const before = el.value.slice(0, cursor);
    const digitsBefore = before.replace(/\D/g, '').length;
    const allDigits = el.value.replace(/\D/g, '');
    const formatted = allDigits ? Number(allDigits).toLocaleString('vi-VN') : '';
    if (formatted === el.value) return;
    el.value = formatted;
    let newPos = 0, count = 0;
    while (newPos < formatted.length && count < digitsBefore) {
      if (/\d/.test(formatted[newPos])) count++;
      newPos++;
    }
    try { el.setSelectionRange(newPos, newPos); } catch (_) {}
  });

  // Tính & format khi rời khỏi ô hoặc bấm Enter
  const evaluate = () => {
    if (!hasOp(el.value)) return;
    const result = evalAmountExpr(el.value);
    if (result !== null && result >= 0) {
      el.value = Number(result).toLocaleString('vi-VN');
      el.classList.remove('amount-error');
    } else {
      el.classList.add('amount-error');
    }
  };
  el.addEventListener('blur', evaluate);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === '=') {
      e.preventDefault();
      evaluate();
    }
  });
}

// Đọc số nguyên từ input đã format (xử lý cả biểu thức nếu user chưa blur)
function readAmount(el) {
  const raw = (el.value || '').toString();
  if (/[+\-*/()]/.test(raw)) {
    const r = evalAmountExpr(raw);
    return r !== null && r > 0 ? r : 0;
  }
  const v = raw.replace(/\D/g, '');
  return v ? parseInt(v, 10) : 0;
}

const App = {
  state: {
    books: [],
    currentBookId: 'b_personal',
    accounts: [],
    categories: [],
    transactions: [],
    reminders: [],
    loans: [],
    budgets: [],
    goals: [],
    currentTab: 'home',
    txFilter: { type: 'all', period: 'month', accountId: 'all', search: '' },
    chartPeriod: 'month',
    chartFrom: '',
    chartTo: '',
    catTab: 'expense',
    loanTab: 'lend',
    loanStatusFilter: 'open',
    editingTx: null,
    editingCat: null,
    editingAcc: null,
    editingReminder: null,
    editingBook: null,
    editingLoan: null,
    editingBudget: null,
    editingGoal: null
  },

  async init() {
    try {
      // Edge-to-edge: WebView vẽ tràn ra sau status bar để màu topbar phủ kín lên trên
      const SB = window.Capacitor?.Plugins?.StatusBar;
      if (SB) {
        try {
          await SB.setOverlaysWebView({ overlay: true });
          await SB.setStyle({ style: 'LIGHT' });
        } catch (e) { /* web/PWA bỏ qua */ }
      }

      // Service worker — chỉ register khi production (KHÔNG phải localhost dev), tránh kẹt cache cũ
      const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '';
      if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !isDev) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      } else if (isDev && 'serviceWorker' in navigator) {
        // Trên localhost: tự gỡ SW cũ nếu có (đã từng register trước đây)
        navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => {});
      }

      // Auth init không await sâu — luôn return nhanh để app render
      try {
        await window.QLT_Auth.init();
      } catch (e) {
        console.warn('Auth init lỗi (bỏ qua):', e);
      }
      window.QLT_Auth.onChange(u => this.onAuthChange(u));

      if (window.QLT_Auth.user) {
        window.QLT_Store.setUser(window.QLT_Auth.user.email);
      } else {
        window.QLT_Store.setUser('guest');
      }

      await window.QLT_Store.initDefaults();
      await this.reload();
      // Đặt lại notif cho mọi khoản nợ đang mở có hạn trả
      try {
        for (const l of this.state.loans.filter(l => l.status !== 'closed' && l.dueDate)) {
          await this.scheduleLoanNotif(l);
        }
      } catch (_) {}
      // Đặt lại notif cho mọi sổ tiết kiệm có ngày đáo hạn
      try {
        for (const a of this.state.accounts.filter(a => this.isSavings(a) && a.maturityDate)) {
          await this.scheduleMaturityNotif(a);
        }
      } catch (_) {}
      // Đặt lại notif cho mục tiêu tiết kiệm
      try {
        for (const g of this.state.goals.filter(g => g.status === 'active')) {
          await this.scheduleGoalNotif(g);
        }
      } catch (_) {}
      this.render();
      this.bindEvents();
      $$('.qlt-amount').forEach(attachAmountFormatting);

      // Render home dưới TRƯỚC để khi unlock app sẵn sàng (lock screen z-index cao hơn)
      this.switchTab('home');

      // Migrate PIN từ meta cũ (nếu user đã setup trước bản này) sang localStorage device-wide
      try { if (window.QLT_Lock) await window.QLT_Lock.migrate(); } catch (_) {}

      // Khoá app: nếu đã bật PIN → hiện lock screen ngay (đè lên home)
      try {
        if (window.QLT_Lock && window.QLT_Lock.isEnabled()) {
          window.QLT_Lock.showVerify();
        }
      } catch (_) {}

      // Hook Capacitor App resume — khoá lại nếu hết timeout
      try {
        const AppPlugin = window.Capacitor?.Plugins?.App;
        if (AppPlugin) {
          AppPlugin.addListener('appStateChange', ({ isActive }) => {
            if (!isActive) return;
            // App vừa active lại
            if (window.QLT_Lock && window.QLT_Lock.shouldLockOnResume()) {
              window.QLT_Lock.showVerify(() => {});
            }
          });
        }
      } catch (_) {}
    } catch (e) {
      console.error('App init lỗi:', e);
      // Hiện lỗi cho user (không phải màn trắng vô vọng)
      const body = document.body;
      if (body) {
        const err = document.createElement('div');
        err.style.cssText = 'position:fixed;inset:0;background:#fff;color:#1a2a1f;padding:24px;font-family:sans-serif;font-size:14px;line-height:1.6;z-index:99999;overflow:auto';
        err.innerHTML = `<h2 style="color:#e63946;margin-bottom:12px">Ứng dụng gặp lỗi khi khởi động</h2>
          <p>Vui lòng chụp màn hình và gửi cho dev:</p>
          <pre style="background:#f4f4f4;padding:12px;border-radius:8px;white-space:pre-wrap;word-break:break-word;font-size:12px;margin-top:8px">${(e && e.stack) || e}</pre>
          <button onclick="location.reload()" style="margin-top:16px;padding:10px 20px;background:#2d6a4f;color:#fff;border:none;border-radius:8px;font-weight:600">Tải lại</button>`;
        body.appendChild(err);
      }
    }
  },

  async reload() {
    this.state.books = await window.QLT_Store.getAll('books');
    this.state.currentBookId = window.QLT_Store.getCurrentBookId();
    const bid = this.state.currentBookId;
    const inBook = arr => arr.filter(x => x.bookId === bid);
    this.state.accounts = inBook(await window.QLT_Store.getAll('accounts'));
    this.state.categories = inBook(await window.QLT_Store.getAll('categories'));
    this.state.transactions = inBook(await window.QLT_Store.getAll('transactions'));
    this.state.reminders = inBook(await window.QLT_Store.getAll('reminders'));
    this.state.loans = inBook(await window.QLT_Store.getAll('loans'));
    this.state.budgets = inBook(await window.QLT_Store.getAll('budgets'));
    this.state.goals = inBook(await window.QLT_Store.getAll('goals'));
  },

  currentBook() {
    return this.state.books.find(b => b.id === this.state.currentBookId);
  },

  async switchBook(bookId) {
    window.QLT_Store.setCurrentBookId(bookId);
    await this.reload();
    this.renderBookHeader();
    this.switchTab('home');
  },

  async onAuthChange(user) {
    const newKey = user ? user.email : 'guest';
    if (newKey !== window.QLT_Store.currentUser) {
      window.QLT_Store.setUser(newKey);
      await window.QLT_Store.initDefaults();
      // Khi đăng nhập, tự pull data từ Drive (nếu có)
      if (user) {
        try { await window.QLT_Sync.pullNow(); } catch (e) { console.warn('Pull lỗi:', e); }
      }
      await this.reload();
    }
    this.renderAuthUI();
    if (this.state.currentTab) this.switchTab(this.state.currentTab);
  },

  bindEvents() {
    // Bottom nav
    $$('.ni').forEach(el => {
      el.onclick = () => {
        const tab = el.dataset.tab;
        if (tab === 'add') this.openTxModal(null, 'expense');
        else this.switchTab(tab);
      };
    });

    // Drawer
    $('#menuBtn').onclick = () => $('#drawer').classList.add('open');
    $('#drawerOverlay').onclick = () => $('#drawer').classList.remove('open');
    $$('#drawer .dr-item, #drawer .dr-mini-item').forEach(el => {
      el.onclick = () => {
        const action = el.dataset.action;
        $('#drawer').classList.remove('open');
        if (action === 'sync') this.doSync();
        else if (action === 'login') this.doLogin();
        else if (action === 'logout') this.doLogout();
        else if (action === 'export') this.doExport();
        else if (action === 'import') this.doImport();
        else if (action === 'books') this.openBookList();
        else if (action === 'bookadd') this.openBookEdit(null);
        else this.switchTab(action);
      };
    });

    $('#bookAddBtn').onclick = () => this.openBookEdit(null);
    $('#bookSave').onclick = () => this.saveBook();
    $('#bookDelete').onclick = () => this.deleteBook();
    const photosOpt = () => !!$('#bookExportPhotos')?.checked;
    $('#bookExportHTML').onclick = () => {
      if (this.state.editingBook?.id) this.exportBookHTML(this.state.editingBook.id, false, photosOpt());
    };
    $('#bookExportCSV').onclick = () => {
      if (this.state.editingBook?.id) this.exportBookCSV(this.state.editingBook.id, false);
    };
    $('#bookFinalHTML').onclick = () => this.exportFinal('html');
    $('#bookFinalCSV').onclick = () => this.exportFinal('csv');
    $('#bookAddMemberBtn').onclick = () => this.addBookMember();
    $('#bookAddManyBtn').onclick = () => this.addManyMembers();
    $('#addManyOK').onclick = () => this.confirmAddMany();

    // Modal close
    $$('.modal, .lightbox').forEach(m => {
      m.querySelectorAll('[data-close]').forEach(b => {
        b.onclick = () => m.classList.remove('open');
      });
      m.onclick = e => {
        if (e.target === m) m.classList.remove('open');
      };
    });

    // Tx form
    $('#txSave').onclick = () => this.saveTx();
    $('#txDelete').onclick = () => this.deleteTx();
    $$('.tx-type-pill').forEach(el => {
      el.onclick = () => {
        $$('.tx-type-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        $('#txForm').dataset.type = el.dataset.type;
        this.applyTxTypeUI(el.dataset.type);
      };
    });
    $('#txCamera').onclick = () => this.scanReceipt();

    // Category form
    $('#catSave').onclick = () => this.saveCat();
    $('#catDelete').onclick = () => this.deleteCat();
    $$('.cat-tab').forEach(el => {
      el.onclick = () => {
        $$('.cat-tab').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.catTab = el.dataset.type;
        this.renderCategories();
      };
    });

    // Account form
    $('#accSave').onclick = () => this.saveAcc();
    $('#accDelete').onclick = () => this.deleteAcc();
    $('#accMaturity').onclick = () => this.openMaturityModal();
    $('#maturityConfirm').onclick = () => this.confirmMaturity();
    $$('.acc-type-pill').forEach(el => {
      el.onclick = () => {
        if (this.state.editingAcc?.id) return; // Khoá khi đang sửa
        $$('.acc-type-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        if (this.state.editingAcc) {
          this.state.editingAcc.accountType = el.dataset.type;
          this.applyAccountTypeUI();
          this.recalcMaturityHint();
        }
      };
    });
    // Tự cập nhật ngày đáo hạn + hint khi đổi field
    ['accStartDate', 'accInterestRate', 'accBalance'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => this.recalcMaturityHint());
    });
    const termSel = $('#accTermMonths');
    if (termSel) termSel.onchange = () => {
      $('#accTermMonthsCustomWrap').style.display = termSel.value === 'custom' ? 'block' : 'none';
      this.recalcMaturityHint();
    };
    const termCustom = $('#accTermMonthsCustom');
    if (termCustom) termCustom.addEventListener('input', () => this.recalcMaturityHint());
    const accMatDate = $('#accMaturityDate');
    if (accMatDate) accMatDate.addEventListener('change', () => this.recalcMaturityHint());

    // Reminder form
    $('#remSave').onclick = () => this.saveReminder();
    $('#remDelete').onclick = () => this.deleteReminder();

    // ----- Budgets (Ngân sách) -----
    $('#budgetAddFab').onclick = () => this.openBudgetModal(null);
    $('#budgetSave').onclick = () => this.saveBudget();
    $('#budgetDelete').onclick = () => this.deleteBudget();

    // ----- Goals (Mục tiêu tiết kiệm) -----
    $('#goalAddFab').onclick = () => this.openGoalModal(null);
    $('#goalSave').onclick = () => this.saveGoal();
    $('#goalDelete').onclick = () => this.deleteGoal();
    $('#contribSave').onclick = () => this.saveContribution();
    // Recalc plan hint khi đổi target/start/deadline
    ['goalTarget', 'goalStart', 'goalDeadline'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => this.recalcGoalPlanHint());
    });

    // ----- Loans (Cho vay / Nợ) -----
    $('#loanAddFab').onclick = () => this.openLoanModal(null);
    $('#loanSave').onclick = () => this.saveLoan();
    $('#loanDelete').onclick = () => this.deleteLoan();
    $('#loanAddPaymentBtn').onclick = () => this.openPaymentModal();
    $('#loanCloseBtn').onclick = () => this.toggleLoanClosed();
    $('#paymentSave').onclick = () => this.savePayment();

    $$('.loan-tab').forEach(el => {
      el.onclick = () => {
        $$('.loan-tab').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.loanTab = el.dataset.type;
        this.renderLoans();
      };
    });
    $$('.loan-status-pill').forEach(el => {
      el.onclick = () => {
        $$('.loan-status-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.loanStatusFilter = el.dataset.status;
        this.renderLoans();
      };
    });
    $$('.loan-type-pill').forEach(el => {
      el.onclick = () => {
        // Chỉ cho đổi loại khi tạo MỚI (chưa có id)
        if (this.state.editingLoan?.id) return;
        $$('.loan-type-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        if (this.state.editingLoan) this.state.editingLoan.type = el.dataset.type;
      };
    });

    // Period switchers (chart)
    $$('.period-pill').forEach(el => {
      el.onclick = () => {
        $$('.period-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.chartPeriod = el.dataset.period;
        const rangeRow = $('#chartRangeRow');
        if (this.state.chartPeriod === 'custom') {
          // Mặc định lần đầu: tháng này → hôm nay
          if (!this.state.chartFrom || !this.state.chartTo) {
            const now = new Date();
            this.state.chartFrom = now.toISOString().slice(0, 7) + '-01';
            this.state.chartTo = today();
          }
          $('#chartFrom').value = this.state.chartFrom;
          $('#chartTo').value = this.state.chartTo;
          rangeRow.style.display = 'flex';
        } else {
          rangeRow.style.display = 'none';
        }
        this.renderCharts();
      };
    });

    // Date range inputs (chart custom)
    const fromIn = $('#chartFrom');
    const toIn = $('#chartTo');
    if (fromIn) fromIn.onchange = () => {
      this.state.chartFrom = fromIn.value;
      if (this.state.chartFrom > this.state.chartTo) this.state.chartTo = this.state.chartFrom;
      toIn.value = this.state.chartTo;
      this.renderCharts();
    };
    if (toIn) toIn.onchange = () => {
      this.state.chartTo = toIn.value;
      if (this.state.chartTo < this.state.chartFrom) this.state.chartFrom = this.state.chartTo;
      fromIn.value = this.state.chartFrom;
      this.renderCharts();
    };

    // Modal: đóng category-tx modal
    const catTxClose = $('#catTxClose');
    if (catTxClose) catTxClose.onclick = () => $('#catTxModal').classList.remove('open');
  },

  renderAuthUI() {
    const u = window.QLT_Auth.user;
    if (u) {
      $('#drUserName').textContent = u.name || u.email;
      $('#drUserEmail').textContent = u.email;
      if (u.picture) $('#drUserAvatar').src = u.picture;
      $('#loginItem').style.display = 'none';
      $('#logoutItem').style.display = 'flex';
      $('#syncItem').style.display = 'flex';
    } else {
      $('#drUserName').textContent = 'Khách';
      $('#drUserEmail').textContent = 'Chưa đăng nhập';
      $('#drUserAvatar').src = 'icons/icon-192.png';
      $('#loginItem').style.display = 'flex';
      $('#logoutItem').style.display = 'none';
      $('#syncItem').style.display = 'none';
    }
  },

  renderBookHeader() {
    const b = this.currentBook();
    if (!b) return;
    $('#topbarBookLabel').textContent = b.name;
    this.applyBookTheme(b.color);
    this.renderDrawerBooks();
  },

  // Phủ màu sổ hiện tại lên topbar / balance hero / drawer / account summary
  // → Anh nhìn cái biết đang ở sổ nào, đỡ nhầm giữa các sổ
  applyBookTheme(color) {
    const c = color || '#2d6a4f';
    const lighter = this.lightenHex(c, 0.4);
    const root = document.documentElement.style;
    root.setProperty('--book-accent', c);
    root.setProperty('--book-accent-light', lighter);
  },

  lightenHex(hex, amount) {
    const s = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(s)) return hex;
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    const mix = (v) => Math.round(v + (255 - v) * amount);
    return '#' + [mix(r), mix(g), mix(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  },

  renderDrawerBooks() {
    const wrap = $('#drBooksList');
    if (!wrap) return;
    const cur = this.state.currentBookId;
    wrap.innerHTML = this.state.books.map(b => `
      <div class="dr-book-row ${b.id === cur ? 'on' : ''}" data-book="${b.id}">
        <span class="dr-book-row-icon" style="background:${b.color || '#52b788'}">${svgIcon(b.icon || 'wallet')}</span>
        <span class="dr-book-row-name">${this.escapeHtml(b.name)}</span>
        ${b.id === cur ? `<span class="dr-book-row-check">${svgIcon('check')}</span>` : ''}
      </div>
    `).join('');
    wrap.querySelectorAll('[data-book]').forEach(el => {
      el.onclick = async () => {
        $('#drawer').classList.remove('open');
        const id = el.dataset.book;
        if (id !== this.state.currentBookId) {
          await this.switchBook(id);
        }
      };
    });
  },

  render() {
    this.renderAuthUI();
    this.renderBookHeader();
  },

  switchTab(name) {
    this.state.currentTab = name;
    $$('.screen').forEach(s => s.classList.remove('active'));
    const screen = $('#screen-' + name);
    if (screen) screen.classList.add('active');
    $$('.ni').forEach(el => el.classList.toggle('active', el.dataset.tab === name));

    if (name === 'home') this.renderHome();
    else if (name === 'accounts') this.renderAccounts();
    else if (name === 'charts') this.renderCharts();
    else if (name === 'categories') this.renderCategories();
    else if (name === 'transactions') this.renderTransactions();
    else if (name === 'reminders') this.renderReminders();
    else if (name === 'settings') this.renderSettings();
    else if (name === 'loans') this.renderLoans();
    else if (name === 'budgets') this.renderBudgets();
    else if (name === 'goals') this.renderGoals();
  },

  // ============ HOME ============
  // Phân biệt 'payment' (tiền dùng được) và 'savings' (sổ tiết kiệm — locked)
  isSavings(acc) { return (acc?.accountType || 'payment') === 'savings'; },
  isPayment(acc) { return (acc?.accountType || 'payment') === 'payment'; },

  renderHome() {
    // Tổng số dư = CHỈ tính ví thanh toán (tiền dùng được)
    const paymentAccs = this.state.accounts.filter(a => this.isPayment(a));
    const savingsAccs = this.state.accounts.filter(a => this.isSavings(a));
    const totalBalance = paymentAccs.reduce((s, a) => s + (a.balance || 0), 0);
    const totalSavings = savingsAccs.reduce((s, a) => s + (a.balance || 0), 0);
    $('#homeBalance').textContent = fmt(totalBalance) + ' đ';

    // Hint sổ tiết kiệm dưới hero
    const savingsLink = $('#homeSavingsLink');
    if (savingsLink) {
      if (totalSavings > 0) {
        savingsLink.style.display = 'inline-flex';
        savingsLink.innerHTML = `+ ${fmt(totalSavings)} đ trong tiết kiệm <span style="font-size:14px">→</span>`;
      } else {
        savingsLink.style.display = 'none';
      }
    }

    // Tổng thu/chi tháng hiện tại + thay đổi số dư từng ví trong tháng
    const now = new Date();
    const ym = now.toISOString().slice(0, 7);
    let inc = 0, exp = 0;
    const accChange = {};
    for (const a of this.state.accounts) accChange[a.id] = 0;
    for (const t of this.state.transactions) {
      if (!t.date.startsWith(ym)) continue;
      // Bỏ qua transfer giữa savings ↔ payment khỏi Thu/Chi tháng (không phải thu nhập/chi tiêu thật)
      if (t.type === 'income') {
        inc += t.amount;
        accChange[t.accountId] = (accChange[t.accountId] || 0) + t.amount;
      } else if (t.type === 'expense') {
        exp += t.amount;
        accChange[t.accountId] = (accChange[t.accountId] || 0) - t.amount;
      } else if (t.type === 'transfer') {
        accChange[t.accountId] = (accChange[t.accountId] || 0) - t.amount;
        accChange[t.toAccountId] = (accChange[t.toAccountId] || 0) + t.amount;
      }
    }
    $('#homeIncome').textContent = fmt(inc) + ' đ';
    $('#homeExpense').textContent = fmt(exp) + ' đ';
    $('#homeMonth').textContent = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`;

    // ----- Số dư từng ví (CHỈ payment) -----
    const walletEl = $('#homeWallets');
    const accs = paymentAccs;
    if (!accs.length) {
      walletEl.innerHTML = '<div class="empty-msg">Chưa có ví nào. Vào Tài khoản để thêm.</div>';
    } else {
      // % của từng ví so với ví số dư lớn nhất → mini bar
      const maxBal = Math.max(1, ...accs.map(a => Math.abs(a.balance || 0)));
      walletEl.innerHTML = accs.map(a => {
        const bal = a.balance || 0;
        const change = accChange[a.id] || 0;
        const pct = Math.min(100, Math.round(Math.abs(bal) / maxBal * 100));
        const accentColor = a.color || '#2d6a4f';
        let changeHtml = '';
        if (change !== 0) {
          const cls = change > 0 ? 'pos' : 'neg';
          const arrow = change > 0 ? '↑' : '↓';
          changeHtml = `<div class="wallet-change ${cls}">${arrow} ${fmt(Math.abs(change))} đ</div>`;
        } else {
          changeHtml = `<div class="wallet-change zero">— Không đổi</div>`;
        }
        return `
          <div class="wallet-row" data-acc="${a.id}">
            <div class="wallet-icon" style="background:${accentColor}1a;color:${accentColor}">
              ${svgIcon(a.icon || 'wallet')}
            </div>
            <div class="wallet-info">
              <div class="wallet-name">${this.escapeHtml(a.name)}</div>
              <div class="wallet-bar"><div class="wallet-bar-fill" style="width:${pct}%;background:${accentColor}"></div></div>
            </div>
            <div class="wallet-amounts">
              <div class="wallet-bal">${fmt(bal)} đ</div>
              ${changeHtml}
            </div>
          </div>
        `;
      }).join('');
      // Bấm vào ví → sang trang Giao dịch lọc theo ví đó
      walletEl.querySelectorAll('[data-acc]').forEach(el => {
        el.onclick = () => {
          this.state.txAccountFilter = el.dataset.acc;
          this.switchTab('transactions');
        };
      });
    }

    // ----- Sổ tiết kiệm / Tài sản dài hạn -----
    this.renderHomeSavings(totalBalance, totalSavings);

    // ----- Mục tiêu tiết kiệm -----
    this.renderHomeGoals();

    // ----- Forecast cuối tháng -----
    this.renderHomeForecast();

    // ----- Budget widget -----
    this.renderHomeBudgets();

    // ----- Loan shortcut card -----
    this.renderHomeLoanShortcut();

    // ----- Giao dịch gần nhất -----
    const recent = [...this.state.transactions]
      .sort((a, b) => (b.date + b._updatedAt).localeCompare(a.date + a._updatedAt))
      .slice(0, 8);
    const recentEl = $('#homeRecent');
    if (recent.length === 0) {
      recentEl.innerHTML = '<div class="empty-msg">Chưa có giao dịch nào. Bấm + để thêm.</div>';
    } else {
      recentEl.innerHTML = recent.map(t => this.renderTxItem(t)).join('');
      recentEl.querySelectorAll('[data-tx]').forEach(el => {
        el.onclick = () => this.openTxModal(el.dataset.tx);
      });
    }
  },

  renderTxItem(t) {
    const acc = this.state.accounts.find(a => a.id === t.accountId) || {};
    const photoBadge = t.photo ? `<span class="tx-photo-badge" title="Có minh chứng">${svgIcon('camera')}</span>` : '';

    if (t.type === 'transfer') {
      const toAcc = this.state.accounts.find(a => a.id === t.toAccountId) || {};
      return `
        <div class="tx-item" data-tx="${t.id}">
          <div class="tx-icon" style="background:#4f86c61a;color:#4f86c6">
            ${svgIcon('refresh')}
          </div>
          <div class="tx-info">
            <div class="tx-cat">Chuyển tiền ${photoBadge}</div>
            <div class="tx-meta">${this.formatDate(t.date)} · ${this.escapeHtml(acc.name || '')} → ${this.escapeHtml(toAcc.name || '')} ${t.note ? '· ' + this.escapeHtml(t.note) : ''}</div>
          </div>
          <div class="tx-amount" style="color:#4f86c6">${fmt(t.amount)}</div>
        </div>
      `;
    }

    const cat = this.state.categories.find(c => c.id === t.categoryId) || {};
    const sign = t.type === 'income' ? '+' : '-';
    const colorClass = t.type === 'income' ? 'amount-pos' : 'amount-neg';
    return `
      <div class="tx-item" data-tx="${t.id}">
        <div class="tx-icon" style="background:${cat.color || '#888'}1a;color:${cat.color || '#888'}">
          ${svgIcon(cat.icon || 'other')}
        </div>
        <div class="tx-info">
          <div class="tx-cat">${cat.name || 'Không rõ'} ${photoBadge}</div>
          <div class="tx-meta">${this.formatDate(t.date)} · ${acc.name || ''} ${t.note ? '· ' + this.escapeHtml(t.note) : ''}</div>
        </div>
        <div class="tx-amount ${colorClass}">${sign}${fmt(t.amount)}</div>
      </div>
    `;
  },

  formatDate(d) {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  },

  escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  // ============ ACCOUNTS ============
  renderAccounts() {
    const payAccs = this.state.accounts.filter(a => this.isPayment(a));
    const savAccs = this.state.accounts.filter(a => this.isSavings(a));
    const totalPay = payAccs.reduce((s, a) => s + (a.balance || 0), 0);
    const totalSav = savAccs.reduce((s, a) => s + (a.balance || 0), 0);
    $('#accTotalBalance').textContent = fmt(totalPay + totalSav) + ' đ';

    const list = $('#accList');
    if (this.state.accounts.length === 0) {
      list.innerHTML = '<div class="empty-msg">Chưa có tài khoản</div>';
      $('#accAddBtn').onclick = () => this.openAccModal(null);
      return;
    }

    const renderAcc = (a) => {
      const meta = this.isSavings(a)
        ? `${a.interestRate || 0}%/năm · ${a.termMonths || 0} tháng${a.maturityDate ? ' · đáo hạn ' + this.formatDate(a.maturityDate) : ''}`
        : (a.currency || 'VND');
      return `
        <div class="acc-item" data-acc="${a.id}">
          <div class="tx-icon" style="background:#2d6a4f1a;color:#2d6a4f">${svgIcon(a.icon || (this.isSavings(a) ? 'emoji:💎' : 'cash'))}</div>
          <div class="tx-info">
            <div class="tx-cat">${this.escapeHtml(a.name)}</div>
            <div class="tx-meta">${this.escapeHtml(meta)}</div>
          </div>
          <div class="tx-amount ${(a.balance || 0) < 0 ? 'amount-neg' : ''}">${fmt(a.balance)} đ</div>
        </div>
      `;
    };

    let html = '';
    if (payAccs.length) {
      html += `<div class="sec-label" style="padding:14px 16px 6px">💳 Tiền dùng được — ${fmt(totalPay)} đ</div>`;
      html += payAccs.map(renderAcc).join('');
    }
    if (savAccs.length) {
      html += `<div class="sec-label" style="padding:14px 16px 6px">💎 Sổ tiết kiệm — ${fmt(totalSav)} đ</div>`;
      html += savAccs.map(renderAcc).join('');
    }
    list.innerHTML = html;
    list.querySelectorAll('[data-acc]').forEach(el => {
      el.onclick = () => this.openAccModal(el.dataset.acc);
    });

    $('#accAddBtn').onclick = () => this.openAccModal(null);
  },

  // ============ CATEGORIES ============
  renderCategories() {
    const cats = this.state.categories.filter(c => c.type === this.state.catTab);
    const parents = cats.filter(c => !c.parentId);
    const childrenByParent = {};
    for (const c of cats) {
      if (c.parentId) {
        (childrenByParent[c.parentId] = childrenByParent[c.parentId] || []).push(c);
      }
    }
    // Mồ côi: có parentId nhưng parent không tồn tại (vd cha bị xoá ở máy khác qua sync) → coi như top-level
    const orphans = cats.filter(c => c.parentId && !cats.find(x => x.id === c.parentId));

    const grid = $('#catGrid');

    const renderItem = (c, isChild = false) => `
      <div class="cat-item ${isChild ? 'cat-child' : ''}" data-cat="${c.id}">
        <div class="cat-circle" style="background:${c.color}">${svgIcon(c.icon)}</div>
        <div class="cat-name">${this.escapeHtml(c.name)}</div>
      </div>
    `;

    let html = '';
    [...parents, ...orphans].forEach(p => {
      const children = childrenByParent[p.id] || [];
      // Render parent
      html += `
        <div class="cat-item ${children.length ? 'cat-parent' : ''}" data-cat="${p.id}">
          <div class="cat-circle" style="background:${p.color}">
            ${svgIcon(p.icon)}
            ${children.length ? `<span class="cat-children-badge">${children.length}</span>` : ''}
          </div>
          <div class="cat-name">${this.escapeHtml(p.name)}</div>
        </div>
      `;
      // Render children — indent visually
      children.forEach(ch => {
        html += renderItem(ch, true);
      });
    });

    html += `
      <div class="cat-item" data-cat="new">
        <div class="cat-circle" style="background:#f4b942">${svgIcon('add')}</div>
        <div class="cat-name">Tạo</div>
      </div>
    `;

    grid.innerHTML = html;
    grid.querySelectorAll('[data-cat]').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.cat;
        if (id === 'new') this.openCatModal(null);
        else this.openCatModal(id);
      };
    });
  },

  // ============ TRANSACTIONS ============
  renderTransactions() {
    // Render search input — đồng bộ value với state
    const searchInput = $('#txSearch');
    if (searchInput) {
      if (searchInput.value !== this.state.txFilter.search) searchInput.value = this.state.txFilter.search || '';
      $('#txSearchClear').style.display = this.state.txFilter.search ? 'flex' : 'none';
      if (!searchInput._qltBound) {
        searchInput._qltBound = true;
        let debounce;
        searchInput.oninput = () => {
          clearTimeout(debounce);
          debounce = setTimeout(() => {
            this.state.txFilter.search = searchInput.value.trim();
            this.renderTransactions();
          }, 200);
        };
        $('#txSearchClear').onclick = () => {
          searchInput.value = '';
          this.state.txFilter.search = '';
          this.renderTransactions();
        };
      }
    }

    // Render account filter row
    const accFilterRow = $('#txAccountFilterRow');
    if (accFilterRow) {
      accFilterRow.innerHTML = `
        <div class="pill tx-acc-filter ${this.state.txFilter.accountId === 'all' ? 'on' : ''}" data-acc="all">Tất cả ví</div>
      ` + this.state.accounts.map(a => `
        <div class="pill tx-acc-filter ${this.state.txFilter.accountId === a.id ? 'on' : ''}" data-acc="${a.id}">${this.escapeHtml(a.name)}</div>
      `).join('');
      accFilterRow.querySelectorAll('.tx-acc-filter').forEach(el => {
        el.onclick = () => {
          this.state.txFilter.accountId = el.dataset.acc;
          this.renderTransactions();
        };
      });
    }

    const list = $('#txList');
    let txs = [...this.state.transactions];

    // Filter type
    if (this.state.txFilter.type !== 'all') {
      txs = txs.filter(t => t.type === this.state.txFilter.type);
    }
    // Filter account (transfer hiện ở cả ví nguồn lẫn ví đích)
    if (this.state.txFilter.accountId !== 'all') {
      const aid = this.state.txFilter.accountId;
      txs = txs.filter(t => t.accountId === aid || t.toAccountId === aid);
    }
    // Search: ghi chú / tên danh mục / tên ví / số tiền / ngày
    const searchTerm = (this.state.txFilter.search || '').trim();
    if (searchTerm) {
      const norm = (s) => String(s || '').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
      const term = norm(searchTerm);
      const termDigits = searchTerm.replace(/\D/g, '');
      txs = txs.filter(t => {
        const cat = this.state.categories.find(c => c.id === t.categoryId);
        const acc = this.state.accounts.find(a => a.id === t.accountId);
        const toAcc = this.state.accounts.find(a => a.id === t.toAccountId);
        const haystack = norm([t.note, cat?.name, acc?.name, toAcc?.name, t.date, this.formatDate(t.date)].filter(Boolean).join(' '));
        if (haystack.includes(term)) return true;
        // Match số tiền: nếu term có chữ số, so sánh với amount
        if (termDigits && String(t.amount).includes(termDigits)) return true;
        return false;
      });
    }
    txs.sort((a, b) => (b.date + b._updatedAt).localeCompare(a.date + a._updatedAt));

    if (txs.length === 0) {
      if (searchTerm) {
        list.innerHTML = `<div class="tx-search-empty">Không có giao dịch nào khớp với <strong>"${this.escapeHtml(searchTerm)}"</strong>.<br>Thử bỏ bớt filter hoặc xoá ô tìm kiếm.</div>`;
      } else {
        list.innerHTML = '<div class="empty-msg">Không có giao dịch phù hợp</div>';
      }
    } else {
      // Group theo ngày
      const groups = {};
      txs.forEach(t => {
        groups[t.date] = groups[t.date] || [];
        groups[t.date].push(t);
      });

      list.innerHTML = Object.keys(groups).sort().reverse().map(date => {
        const dayTxs = groups[date];
        const dayInc = dayTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const dayExp = dayTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        return `
          <div class="day-header">
            <div>${this.formatDate(date)}</div>
            <div class="day-totals">
              ${dayInc > 0 ? `<span class="amount-pos">+${fmt(dayInc)}</span>` : ''}
              ${dayExp > 0 ? `<span class="amount-neg">-${fmt(dayExp)}</span>` : ''}
            </div>
          </div>
          ${dayTxs.map(t => this.renderTxItem(t)).join('')}
        `;
      }).join('');

      list.querySelectorAll('[data-tx]').forEach(el => {
        el.onclick = () => this.openTxModal(el.dataset.tx);
      });
    }

    $$('#screen-transactions .tx-filter-pill').forEach(el => {
      el.onclick = () => {
        $$('#screen-transactions .tx-filter-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.txFilter.type = el.dataset.type;
        this.renderTransactions();
      };
    });
  },

  // ============ CHARTS ============
  renderCharts() {
    const period = this.state.chartPeriod;
    const groups = this.groupByPeriod(period);

    // Bar chart
    const barCanvas = $('#chartBar');
    if (barCanvas) {
      window.QLT_Charts.bar(barCanvas, groups);
    }

    // Donut: phân loại chi tiêu theo danh mục (kỳ hiện tại)
    const now = new Date();
    let from, to;
    if (period === 'day') { from = today(); to = today(); }
    else if (period === 'week') {
      const d = new Date(); d.setDate(d.getDate() - 6);
      from = d.toISOString().slice(0, 10); to = today();
    } else if (period === 'month') {
      from = now.toISOString().slice(0, 7) + '-01';
      to = today();
    } else if (period === 'custom') {
      from = this.state.chartFrom || today();
      to = this.state.chartTo || today();
    } else {
      from = now.getFullYear() + '-01-01';
      to = today();
    }
    const expByCat = {};
    let totalExp = 0;
    for (const t of this.state.transactions) {
      if (t.type !== 'expense') continue;
      if (t.date < from || t.date > to) continue;
      expByCat[t.categoryId] = (expByCat[t.categoryId] || 0) + t.amount;
      totalExp += t.amount;
    }
    const slices = Object.entries(expByCat).map(([cid, value]) => {
      const c = this.state.categories.find(x => x.id === cid) || {};
      return { id: cid, label: c.name || 'Không rõ', value, color: c.color || '#888' };
    }).sort((a, b) => b.value - a.value);

    // ----- Tính khoảng "kỳ trước" cùng độ dài để so sánh -----
    const fromD = new Date(from + 'T00:00:00');
    const toD = new Date(to + 'T00:00:00');
    const days = Math.floor((toD - fromD) / 86400000) + 1;
    const prevToD = new Date(fromD); prevToD.setDate(fromD.getDate() - 1);
    const prevFromD = new Date(prevToD); prevFromD.setDate(prevToD.getDate() - days + 1);
    const prevFrom = prevFromD.toISOString().slice(0, 10);
    const prevTo = prevToD.toISOString().slice(0, 10);
    const prevByCat = {};
    for (const t of this.state.transactions) {
      if (t.type !== 'expense') continue;
      if (t.date < prevFrom || t.date > prevTo) continue;
      prevByCat[t.categoryId] = (prevByCat[t.categoryId] || 0) + t.amount;
    }
    const periodCmpLabel = period === 'day' ? 'hôm qua'
      : period === 'week' ? 'tuần trước'
      : period === 'month' ? `T${prevFromD.getMonth() + 1}`
      : period === 'year' ? `${prevFromD.getFullYear()}`
      : 'kỳ trước';
    const compareHtml = (catId) => {
      const prev = prevByCat[catId] || 0;
      const curr = expByCat[catId] || 0;
      if (prev === 0 && curr > 0) return `<span class="cmp-tag new">🆕 mới</span>`;
      if (prev === 0) return '';
      const pct = Math.round((curr - prev) / prev * 100);
      if (pct > 2) return `<span class="cmp-tag up">▲ +${pct}% vs ${periodCmpLabel}</span>`;
      if (pct < -2) return `<span class="cmp-tag down">▼ ${pct}% vs ${periodCmpLabel}</span>`;
      return `<span class="cmp-tag flat">≈ vs ${periodCmpLabel}</span>`;
    };

    // Top 5 khoản chi nhiều nhất — list rõ ràng có huy chương + so sánh kỳ trước
    const top5El = $('#chartTop5');
    if (top5El) {
      if (!slices.length) {
        top5El.innerHTML = '<div class="top5-empty">Chưa có chi tiêu trong kỳ này</div>';
      } else {
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        const top5 = slices.slice(0, 5);
        const maxVal = top5[0].value;
        top5El.innerHTML = top5.map((s, i) => {
          const pct = totalExp > 0 ? Math.round(s.value / totalExp * 100) : 0;
          const barW = maxVal > 0 ? Math.round(s.value / maxVal * 100) : 0;
          return `
            <div class="top5-row" data-cat="${s.id}">
              <div class="top5-rank ${i === 0 ? 'gold' : ''}">${medals[i]}</div>
              <div class="top5-info">
                <div class="top5-name">${this.escapeHtml(s.label)} ${compareHtml(s.id)}</div>
                <div class="top5-bar"><div class="top5-bar-fill" style="width:${barW}%;background:${s.color}"></div></div>
              </div>
              <div class="top5-amt">
                <div class="top5-val">${fmt(s.value)}</div>
                <div class="top5-pct">${pct}% tổng chi</div>
              </div>
            </div>
          `;
        }).join('');
        top5El.querySelectorAll('.top5-row').forEach(el => {
          el.onclick = () => this.openCategoryTxs(el.dataset.cat, from, to);
        });
      }
    }

    const donutCanvas = $('#chartDonut');
    if (donutCanvas) {
      window.QLT_Charts.donut(donutCanvas, slices, {
        centerLabel: fmt(totalExp),
        centerSub: 'Chi'
      });
    }

    // Legend — bấm 1 dòng để xem danh sách giao dịch của danh mục đó trong kỳ
    const legend = $('#chartLegend');
    if (slices.length) {
      legend.innerHTML = slices.map(s => {
        const pct = totalExp > 0 ? Math.round(s.value / totalExp * 100) : 0;
        return `
          <div class="legend-item" data-cat="${s.id}">
            <span class="legend-dot" style="background:${s.color}"></span>
            <span class="legend-name">${this.escapeHtml(s.label)}<span class="legend-pct">${pct}%</span> ${compareHtml(s.id)}</span>
            <span class="legend-val">${fmt(s.value)}</span>
          </div>
        `;
      }).join('');
      legend.querySelectorAll('.legend-item').forEach(el => {
        el.onclick = () => this.openCategoryTxs(el.dataset.cat, from, to);
      });
    } else {
      legend.innerHTML = '<div class="empty-msg">Chưa có chi tiêu trong kỳ này</div>';
    }
  },

  // Mở modal: liệt kê giao dịch của 1 danh mục trong khoảng [from, to]
  openCategoryTxs(catId, from, to) {
    const cat = this.state.categories.find(c => c.id === catId) || {};
    const txs = this.state.transactions
      .filter(t => t.type === 'expense' && t.categoryId === catId && t.date >= from && t.date <= to)
      .sort((a, b) => (b.date + (b._updatedAt || '')).localeCompare(a.date + (a._updatedAt || '')));
    const total = txs.reduce((s, t) => s + t.amount, 0);

    $('#catTxTitle').textContent = `${cat.name || 'Danh mục'} · ${fmt(total)}`;

    const body = $('#catTxBody');
    if (!txs.length) {
      body.innerHTML = '<div class="empty-msg">Không có giao dịch trong kỳ này</div>';
    } else {
      const groups = {};
      txs.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });
      body.innerHTML = `
        <div style="padding:8px 4px 14px;color:var(--text2);font-size:12px">
          ${txs.length} giao dịch · từ ${this.formatDate(from)} đến ${this.formatDate(to)}
        </div>
      ` + Object.keys(groups).sort().reverse().map(date => {
        const dayExp = groups[date].reduce((s, t) => s + t.amount, 0);
        return `
          <div class="day-header">
            <div>${this.formatDate(date)}</div>
            <div class="day-totals"><span class="amount-neg">-${fmt(dayExp)}</span></div>
          </div>
          ${groups[date].map(t => this.renderTxItem(t)).join('')}
        `;
      }).join('');

      body.querySelectorAll('[data-tx]').forEach(el => {
        el.onclick = () => {
          $('#catTxModal').classList.remove('open');
          this.openTxModal(el.dataset.tx);
        };
      });
    }

    $('#catTxModal').classList.add('open');
  },

  groupByPeriod(period) {
    const out = [];
    const now = new Date();
    if (period === 'day') {
      // 7 ngày gần nhất
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const inc = this.state.transactions.filter(t => t.type === 'income' && t.date === key).reduce((s, t) => s + t.amount, 0);
        const exp = this.state.transactions.filter(t => t.type === 'expense' && t.date === key).reduce((s, t) => s + t.amount, 0);
        out.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, income: inc, expense: exp });
      }
    } else if (period === 'week') {
      // 8 tuần gần nhất
      for (let i = 7; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i * 7);
        const start = new Date(d); start.setDate(d.getDate() - d.getDay());
        const end = new Date(start); end.setDate(start.getDate() + 6);
        const fromS = start.toISOString().slice(0, 10);
        const toS = end.toISOString().slice(0, 10);
        const inc = this.state.transactions.filter(t => t.type === 'income' && t.date >= fromS && t.date <= toS).reduce((s, t) => s + t.amount, 0);
        const exp = this.state.transactions.filter(t => t.type === 'expense' && t.date >= fromS && t.date <= toS).reduce((s, t) => s + t.amount, 0);
        out.push({ label: `T${start.getDate()}/${start.getMonth() + 1}`, income: inc, expense: exp });
      }
    } else if (period === 'month') {
      // 12 tháng gần nhất
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ym = d.toISOString().slice(0, 7);
        const inc = this.state.transactions.filter(t => t.type === 'income' && t.date.startsWith(ym)).reduce((s, t) => s + t.amount, 0);
        const exp = this.state.transactions.filter(t => t.type === 'expense' && t.date.startsWith(ym)).reduce((s, t) => s + t.amount, 0);
        out.push({ label: `T${d.getMonth() + 1}`, income: inc, expense: exp });
      }
    } else if (period === 'year') {
      // 5 năm gần nhất
      for (let i = 4; i >= 0; i--) {
        const y = now.getFullYear() - i;
        const inc = this.state.transactions.filter(t => t.type === 'income' && t.date.startsWith(y + '')).reduce((s, t) => s + t.amount, 0);
        const exp = this.state.transactions.filter(t => t.type === 'expense' && t.date.startsWith(y + '')).reduce((s, t) => s + t.amount, 0);
        out.push({ label: y + '', income: inc, expense: exp });
      }
    } else if (period === 'custom') {
      const fromS = this.state.chartFrom || today();
      const toS = this.state.chartTo || today();
      const fromD = new Date(fromS + 'T00:00:00');
      const toD = new Date(toS + 'T00:00:00');
      const days = Math.floor((toD - fromD) / 86400000) + 1;
      // ≤31 ngày: group ngày; ≤180 ngày: group tuần; còn lại: group tháng
      if (days <= 31) {
        for (let i = 0; i < days; i++) {
          const d = new Date(fromD); d.setDate(fromD.getDate() + i);
          const key = d.toISOString().slice(0, 10);
          const inc = this.state.transactions.filter(t => t.type === 'income' && t.date === key).reduce((s, t) => s + t.amount, 0);
          const exp = this.state.transactions.filter(t => t.type === 'expense' && t.date === key).reduce((s, t) => s + t.amount, 0);
          out.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, income: inc, expense: exp });
        }
      } else if (days <= 180) {
        const start = new Date(fromD); start.setDate(fromD.getDate() - fromD.getDay());
        for (let s = new Date(start); s <= toD; s.setDate(s.getDate() + 7)) {
          const wEnd = new Date(s); wEnd.setDate(s.getDate() + 6);
          const fromW = s.toISOString().slice(0, 10);
          const toW = wEnd.toISOString().slice(0, 10);
          const inc = this.state.transactions.filter(t => t.type === 'income' && t.date >= fromW && t.date <= toW && t.date >= fromS && t.date <= toS).reduce((sum, t) => sum + t.amount, 0);
          const exp = this.state.transactions.filter(t => t.type === 'expense' && t.date >= fromW && t.date <= toW && t.date >= fromS && t.date <= toS).reduce((sum, t) => sum + t.amount, 0);
          out.push({ label: `T${s.getDate()}/${s.getMonth() + 1}`, income: inc, expense: exp });
        }
      } else {
        const m = new Date(fromD.getFullYear(), fromD.getMonth(), 1);
        while (m <= toD) {
          const ym = m.toISOString().slice(0, 7);
          const inc = this.state.transactions.filter(t => t.type === 'income' && t.date.startsWith(ym) && t.date >= fromS && t.date <= toS).reduce((sum, t) => sum + t.amount, 0);
          const exp = this.state.transactions.filter(t => t.type === 'expense' && t.date.startsWith(ym) && t.date >= fromS && t.date <= toS).reduce((sum, t) => sum + t.amount, 0);
          out.push({ label: `${m.getMonth() + 1}/${(m.getFullYear() + '').slice(2)}`, income: inc, expense: exp });
          m.setMonth(m.getMonth() + 1);
        }
      }
    }
    return out;
  },

  // ============ REMINDERS ============
  renderReminders() {
    const list = $('#remList');
    if (this.state.reminders.length === 0) {
      list.innerHTML = '<div class="empty-msg">Chưa có lời nhắc</div>';
    } else {
      list.innerHTML = this.state.reminders.map(r => {
        const cat = this.state.categories.find(c => c.id === r.categoryId) || {};
        return `
          <div class="rem-item" data-rem="${r.id}">
            <div class="tx-icon" style="background:${cat.color || '#2d6a4f'}1a;color:${cat.color || '#2d6a4f'}">${svgIcon(cat.icon || 'bell')}</div>
            <div class="tx-info">
              <div class="tx-cat">${this.escapeHtml(r.name)}</div>
              <div class="tx-meta">${this.frequencyLabel(r.frequency)} · ${r.time || ''}</div>
            </div>
            <div class="tx-amount ${r.type === 'income' ? 'amount-pos' : 'amount-neg'}">${r.type === 'income' ? '+' : '-'}${fmt(r.amount)}</div>
          </div>
        `;
      }).join('');
      list.querySelectorAll('[data-rem]').forEach(el => {
        el.onclick = () => this.openReminderModal(el.dataset.rem);
      });
    }
    $('#remAddBtn').onclick = () => this.openReminderModal(null);
  },

  frequencyLabel(f) {
    return { daily: 'Hàng ngày', weekly: 'Hàng tuần', monthly: 'Hàng tháng', yearly: 'Hàng năm' }[f] || f;
  },

  // ============ BUDGETS (Ngân sách tháng) ============
  // Đã chi của 1 danh mục trong 1 tháng (ym = 'YYYY-MM')
  budgetSpent(catId, ym) {
    return this.state.transactions
      .filter(t => t.type === 'expense' && t.categoryId === catId && t.date.startsWith(ym))
      .reduce((s, t) => s + t.amount, 0);
  },

  // {pct, status, remain, spent, color, label} cho 1 budget
  budgetStatus(budget, ym) {
    const spent = this.budgetSpent(budget.categoryId, ym);
    const limit = budget.amount || 0;
    const pct = limit > 0 ? Math.round(spent / limit * 100) : 0;
    const remain = limit - spent;
    let status = 'ok', label = 'Còn dư';
    if (pct >= 100) { status = 'over'; label = 'Đã vượt'; }
    else if (pct >= 80) { status = 'warn'; label = 'Sắp vượt'; }
    return { pct, status, remain, spent, limit, label };
  },

  renderBudgets() {
    const ym = new Date().toISOString().slice(0, 7);
    $('#budgetMonth').textContent = `Tháng ${ym.slice(5)}/${ym.slice(0, 4)}`;

    const budgets = this.state.budgets.slice().sort((a, b) => {
      const sa = this.budgetStatus(a, ym).pct;
      const sb = this.budgetStatus(b, ym).pct;
      return sb - sa;
    });

    // Tổng
    const totalLimit = budgets.reduce((s, b) => s + (b.amount || 0), 0);
    const totalSpent = budgets.reduce((s, b) => s + this.budgetSpent(b.categoryId, ym), 0);
    const totalRemain = totalLimit - totalSpent;
    const totalPct = totalLimit > 0 ? Math.min(100, Math.round(totalSpent / totalLimit * 100)) : 0;
    let totalCls = 'ok';
    if (totalSpent > totalLimit) totalCls = 'over';
    else if (totalSpent / Math.max(1, totalLimit) >= 0.8) totalCls = 'warn';
    $('#budgetTotalLimit').textContent = fmt(totalLimit) + ' đ';
    $('#budgetTotalSpent').textContent = fmt(totalSpent) + ' đ';
    $('#budgetTotalRemain').textContent = fmt(totalRemain) + ' đ';
    const fillEl = $('#budgetTotalBarFill');
    fillEl.style.width = totalPct + '%';
    fillEl.className = 'budget-summary-bar-fill ' + (totalCls === 'ok' ? '' : totalCls);

    const list = $('#budgetList');
    if (!budgets.length) {
      list.innerHTML = '<div class="empty-msg">Chưa có ngân sách. Bấm <strong>+</strong> để tạo cho từng danh mục chi.</div>';
      return;
    }

    list.innerHTML = budgets.map(b => {
      const cat = this.state.categories.find(c => c.id === b.categoryId) || {};
      const st = this.budgetStatus(b, ym);
      const barW = Math.min(100, st.pct);
      const remainTxt = st.remain >= 0
        ? `Còn ${fmt(st.remain)} đ`
        : `Quá ${fmt(-st.remain)} đ`;
      return `
        <div class="budget-item" data-budget="${b.id}">
          <div class="budget-item-icon" style="background:${(cat.color || '#888') + '1a'};color:${cat.color || '#888'}">
            ${svgIcon(cat.icon || 'other')}
          </div>
          <div class="budget-item-info">
            <div class="budget-item-name">
              <span>${this.escapeHtml(cat.name || 'Không rõ')}</span>
              <span class="budget-item-status ${st.status}">${st.pct}% · ${st.label}</span>
            </div>
            <div class="budget-item-bar"><div class="budget-item-bar-fill ${st.status}" style="width:${barW}%"></div></div>
            <div class="budget-item-meta">
              <span>${fmt(st.spent)} / ${fmt(st.limit)} đ</span>
              <span>${remainTxt}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-budget]').forEach(el => {
      el.onclick = () => this.openBudgetModal(el.dataset.budget);
    });
  },

  // ----- Tài sản dài hạn (sổ tiết kiệm) -----
  renderHomeSavings(totalPayment, totalSavings) {
    const wrap = $('#homeSavings');
    if (!wrap) return;
    const savAccs = this.state.accounts.filter(a => this.isSavings(a));
    if (!savAccs.length) { wrap.style.display = 'none'; return; }
    const todayStr = today();
    savAccs.sort((a, b) => (a.maturityDate || '').localeCompare(b.maturityDate || ''));

    wrap.style.display = 'block';
    wrap.innerHTML = `
      <div class="savings-section-card">
        <div class="savings-section-head">💎 Tài sản dài hạn — sổ tiết kiệm</div>
        <div class="savings-section-total">${fmt(totalSavings)} đ</div>
        <div class="savings-list">
          ${savAccs.map(a => {
            const due = a.maturityDate || '';
            let dueCls = '', dueLabel = 'Chưa đặt hạn';
            if (due) {
              const daysLeft = Math.ceil((new Date(due) - new Date(todayStr)) / 86400000);
              if (daysLeft < 0) { dueCls = 'overdue'; dueLabel = `Quá hạn ${-daysLeft}d`; }
              else if (daysLeft === 0) { dueCls = 'soon'; dueLabel = '⚠️ Đáo hạn HÔM NAY'; }
              else if (daysLeft <= 7) { dueCls = 'soon'; dueLabel = `⚠️ Còn ${daysLeft}d → đáo hạn`; }
              else dueLabel = `Đáo hạn ${this.formatDate(due)}`;
            }
            return `
              <div class="savings-item" data-acc="${a.id}">
                <div class="savings-item-icon">${(a.icon || '').startsWith('emoji:') ? a.icon.slice(6) : '💎'}</div>
                <div class="savings-item-info">
                  <div class="savings-item-name">${this.escapeHtml(a.name)}</div>
                  <div class="savings-item-meta">${a.interestRate || 0}%/năm · ${a.termMonths || 0} tháng</div>
                </div>
                <div class="savings-item-amt">
                  <div class="savings-item-bal">${fmt(a.balance || 0)} đ</div>
                  <div class="savings-item-due ${dueCls}">${dueLabel}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="savings-grand">
          <span>Tổng tài sản (tiền dùng + tiết kiệm)</span>
          <strong>${fmt((totalPayment || 0) + totalSavings)} đ</strong>
        </div>
      </div>
    `;
    wrap.querySelectorAll('[data-acc]').forEach(el => {
      el.onclick = () => this.openAccModal(el.dataset.acc);
    });
  },

  scrollToSavings() {
    const el = $('#homeSavings');
    if (el && el.style.display !== 'none') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  renderHomeForecast() {
    const wrap = $('#homeForecast');
    if (!wrap) return;
    const now = new Date();
    const ym = now.toISOString().slice(0, 7);
    const dayOfMonth = now.getDate();
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const remainDays = totalDays - dayOfMonth;
    const monthLabel = `T${now.getMonth() + 1}`;

    // Đã chi tháng này
    const spent = this.state.transactions
      .filter(t => t.type === 'expense' && t.date.startsWith(ym))
      .reduce((s, t) => s + t.amount, 0);

    // Cần ít nhất 2 ngày data + có chi mới dự báo có ý nghĩa
    if (dayOfMonth < 2 || spent === 0) { wrap.style.display = 'none'; return; }

    const avgPerDay = spent / dayOfMonth;
    const forecast = Math.round(spent + avgPerDay * remainDays);

    // Tháng trước (cùng cả tháng)
    const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastYm = lastDate.toISOString().slice(0, 7);
    const lastSpent = this.state.transactions
      .filter(t => t.type === 'expense' && t.date.startsWith(lastYm))
      .reduce((s, t) => s + t.amount, 0);

    // Compare
    let trend = 'flat', cmpHtml = '';
    if (lastSpent > 0) {
      const diff = forecast - lastSpent;
      const pct = Math.round(Math.abs(diff) / lastSpent * 100);
      if (diff > lastSpent * 0.02) {
        trend = 'up';
        cmpHtml = `<span class="forecast-compare up">▲ +${pct}% so với T${lastDate.getMonth() + 1} (${fmt(lastSpent)} đ)</span>`;
      } else if (diff < -lastSpent * 0.02) {
        trend = 'down';
        cmpHtml = `<span class="forecast-compare down">▼ -${pct}% so với T${lastDate.getMonth() + 1} (${fmt(lastSpent)} đ)</span>`;
      } else {
        cmpHtml = `<span class="forecast-compare flat">≈ tương đương T${lastDate.getMonth() + 1} (${fmt(lastSpent)} đ)</span>`;
      }
    } else {
      cmpHtml = `<span class="forecast-compare flat">📊 Tháng trước chưa có dữ liệu để so sánh</span>`;
    }

    // Progress bar: đã chi (xanh) — marker ở vị trí % ngày đã qua
    const dayPct = Math.round(dayOfMonth / totalDays * 100);
    const spentPct = forecast > 0 ? Math.min(100, Math.round(spent / forecast * 100)) : 0;

    wrap.style.display = 'block';
    wrap.innerHTML = `
      <div class="forecast-card ${trend}">
        <div class="forecast-head">📊 Dự báo chi cuối ${monthLabel}</div>
        <div class="forecast-amount ${trend}">~${fmt(forecast)} đ</div>
        ${cmpHtml}
        <div class="forecast-detail">
          Đã chi <strong>${fmt(spent)} đ</strong> sau ${dayOfMonth}/${totalDays} ngày · trung bình <strong>${fmt(Math.round(avgPerDay))} đ/ngày</strong>
        </div>
        <div class="forecast-progress">
          <div class="forecast-progress-spent" style="width:${spentPct}%"></div>
          <div class="forecast-progress-marker" style="left:${dayPct}%" title="Hôm nay"></div>
        </div>
        <div class="forecast-progress-labels">
          <span>Đầu ${monthLabel}</span>
          <span>Hôm nay (${dayPct}%)</span>
          <span>Cuối ${monthLabel}</span>
        </div>
      </div>
    `;
  },

  renderHomeBudgets() {
    const wrap = $('#homeBudgetWidget');
    if (!wrap) return;
    if (!this.state.budgets.length) { wrap.style.display = 'none'; return; }
    const ym = new Date().toISOString().slice(0, 7);
    // Top 3 danh mục có % cao nhất
    const top = this.state.budgets
      .map(b => ({ b, st: this.budgetStatus(b, ym) }))
      .sort((a, b) => b.st.pct - a.st.pct)
      .slice(0, 3);

    wrap.style.display = 'block';
    wrap.innerHTML = `
      <div class="section">
        <div class="sec-label">Ngân sách tháng <span class="sec-action" onclick="QLT_App.switchTab('budgets')">Quản lý →</span></div>
      </div>
      <div class="home-budget-list">
        ${top.map(({ b, st }) => {
          const cat = this.state.categories.find(c => c.id === b.categoryId) || {};
          const barW = Math.min(100, st.pct);
          return `
            <div class="home-budget-row" onclick="QLT_App.switchTab('budgets')">
              <div class="home-budget-row-top">
                <span>${this.escapeHtml(cat.name || 'Không rõ')}</span>
                <span style="font-size:12px;color:${st.status === 'over' ? 'var(--danger)' : (st.status === 'warn' ? '#b45309' : 'var(--text2)')}">${st.pct}%</span>
              </div>
              <div class="home-budget-row-bar"><div class="home-budget-row-bar-fill ${st.status}" style="width:${barW}%"></div></div>
              <div class="home-budget-row-amts">
                <span>${fmt(st.spent)} / ${fmt(st.limit)} đ</span>
                <span>${st.remain >= 0 ? 'Còn ' + fmt(st.remain) : 'Quá ' + fmt(-st.remain)} đ</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  openBudgetModal(budgetId) {
    const isNew = !budgetId;
    let budget;
    if (isNew) {
      budget = { id: null, categoryId: '', amount: 0 };
    } else {
      budget = JSON.parse(JSON.stringify(this.state.budgets.find(b => b.id === budgetId) || {}));
    }
    this.state.editingBudget = budget;

    $('#budgetModalTitle').textContent = isNew ? 'Thêm ngân sách' : 'Sửa ngân sách';
    $('#budgetDelete').style.display = isNew ? 'none' : '';

    // Danh mục chi — loại trừ những danh mục đã có ngân sách (trừ khi đang sửa)
    const usedCatIds = this.state.budgets
      .filter(b => b.id !== budget.id)
      .map(b => b.categoryId);
    const expenseCats = this.state.categories
      .filter(c => c.type === 'expense' && !usedCatIds.includes(c.id));

    if (isNew && !expenseCats.length) {
      QLT_UI.alert('Tất cả danh mục chi đã có ngân sách. Hãy sửa khoản hiện có hoặc thêm danh mục mới.', { title: 'Hết danh mục' });
      return;
    }

    $('#budgetCategory').innerHTML = expenseCats.map(c =>
      `<option value="${c.id}" ${c.id === budget.categoryId ? 'selected' : ''}>${this.escapeHtml(c.name)}</option>`
    ).join('');
    $('#budgetCategory').disabled = !isNew;
    $('#budgetAmount').value = fmt(budget.amount || 0);

    $('#budgetModal').classList.add('open');
  },

  async saveBudget() {
    const b = this.state.editingBudget;
    if (!b) return;
    b.categoryId = $('#budgetCategory').value;
    b.amount = readAmount($('#budgetAmount'));
    b.bookId = b.bookId || this.state.currentBookId;

    if (!b.categoryId) { QLT_UI.toast('Vui lòng chọn danh mục', { type: 'error' }); return; }
    if (b.amount <= 0) { QLT_UI.toast('Vui lòng nhập hạn mức', { type: 'error' }); return; }

    await window.QLT_Store.put('budgets', b);
    await this.reload();
    $('#budgetModal').classList.remove('open');
    this.renderBudgets();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
    QLT_UI.toast('Đã lưu ngân sách', { type: 'success' });
  },

  async deleteBudget() {
    const b = this.state.editingBudget;
    if (!b?.id) return;
    if (!await QLT_UI.confirm('Xoá ngân sách này? Các giao dịch chi không bị ảnh hưởng.', { okLabel: 'Xoá', danger: true })) return;
    await window.QLT_Store.del('budgets', b.id);
    await this.reload();
    $('#budgetModal').classList.remove('open');
    this.renderBudgets();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
  },

  // ============ GOALS (Mục tiêu tiết kiệm) ============
  goalContributed(g) {
    return (g.contributions || []).reduce((s, c) => s + (c.amount || 0), 0);
  },

  goalContributedInMonth(g, ym) {
    return (g.contributions || []).filter(c => c.date && c.date.startsWith(ym))
      .reduce((s, c) => s + (c.amount || 0), 0);
  },

  // Số tháng giữa 2 ngày (start, end) — count of month boundaries crossed, ≥1
  goalMonthsBetween(startDate, endDate) {
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
    return Math.max(1, months);
  },

  // Ban đầu khi tạo: chia đều = target / plannedMonths
  goalOriginalMonthly(g) {
    return Math.round((g.targetAmount || 0) / Math.max(1, g.plannedMonths || 1));
  },

  // Tháng này phải đóng bao nhiêu (theo strategy)
  goalMonthlyTarget(g) {
    const contributed = this.goalContributed(g);
    const remaining = Math.max(0, (g.targetAmount || 0) - contributed);
    if (remaining === 0) return 0;

    if (g.catchUpStrategy === 'extend') {
      // Giữ số ban đầu — deadline tự dời
      return this.goalOriginalMonthly(g);
    }
    // 'spread': chia đều phần còn lại cho số tháng còn lại tới deadline
    const todayStr = today();
    const deadline = g.targetDate || todayStr;
    if (deadline <= todayStr) {
      // Đã hết hạn → cần đóng nốt phần còn lại NGAY
      return remaining;
    }
    const monthsLeft = this.goalMonthsBetween(todayStr.slice(0, 8) + '01', deadline);
    return Math.round(remaining / Math.max(1, monthsLeft));
  },

  // Dự kiến hoàn thành (chỉ dùng khi 'extend')
  goalForecastEnd(g) {
    if (g.catchUpStrategy !== 'extend') return g.targetDate;
    const remaining = Math.max(0, (g.targetAmount || 0) - this.goalContributed(g));
    const monthly = this.goalOriginalMonthly(g);
    if (monthly <= 0 || remaining === 0) return g.targetDate;
    const monthsNeeded = Math.ceil(remaining / monthly);
    const d = new Date();
    d.setMonth(d.getMonth() + monthsNeeded);
    return d.toISOString().slice(0, 10);
  },

  // Trạng thái tổng thể
  goalStatus(g) {
    const contributed = this.goalContributed(g);
    if (contributed >= (g.targetAmount || 0)) return 'achieved';
    const todayStr = today();
    const deadline = g.targetDate || todayStr;
    if (deadline < todayStr) return 'overdue';
    // Tính tỉ lệ thời gian đã trôi vs tỉ lệ tiền đã đóng
    const start = g.startDate || todayStr;
    const totalDays = (new Date(deadline) - new Date(start)) / 86400000;
    const passedDays = (new Date(todayStr) - new Date(start)) / 86400000;
    const expectedPct = totalDays > 0 ? passedDays / totalDays : 0;
    const actualPct = (g.targetAmount || 0) > 0 ? contributed / g.targetAmount : 0;
    return actualPct >= expectedPct - 0.05 ? 'on-track' : 'behind';
  },

  // Trạng thái tháng hiện tại
  goalMonthStatus(g) {
    const ym = new Date().toISOString().slice(0, 7);
    const contributedThisMonth = this.goalContributedInMonth(g, ym);
    const target = this.goalMonthlyTarget(g);
    if (target === 0) return { kind: 'achieved', label: '✅ Đã đạt mục tiêu', remain: 0, contributed: contributedThisMonth, target: 0 };
    if (contributedThisMonth >= target) return { kind: 'done', label: '✅ Đã đóng đủ', remain: 0, contributed: contributedThisMonth, target };
    // Chưa đủ — cảnh báo theo ngày trong tháng
    const now = new Date();
    const totalDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const dayPct = dayOfMonth / totalDays;
    if (dayPct >= 0.85) return { kind: 'overdue', label: '🚨 Cuối tháng — cần đóng gấp', remain: target - contributedThisMonth, contributed: contributedThisMonth, target };
    if (dayPct >= 0.5 || contributedThisMonth > 0) return { kind: 'behind', label: '⚠️ Còn thiếu tháng này', remain: target - contributedThisMonth, contributed: contributedThisMonth, target };
    return { kind: 'upcoming', label: '🕐 Chưa đóng tháng này', remain: target, contributed: 0, target };
  },

  // Lên kế hoạch hint khi tạo/sửa goal
  recalcGoalPlanHint() {
    const target = readAmount($('#goalTarget'));
    const start = $('#goalStart').value || today();
    const deadline = $('#goalDeadline').value;
    const hint = $('#goalPlanHint');
    if (!target || !deadline) {
      hint.innerHTML = '💡 Nhập số tiền + deadline để xem kế hoạch tháng.';
      return;
    }
    if (deadline <= start) {
      hint.innerHTML = '⚠️ Deadline phải SAU ngày bắt đầu.';
      return;
    }
    const months = this.goalMonthsBetween(start, deadline);
    const monthly = Math.round(target / months);
    hint.innerHTML = `📊 Cần đóng <strong>${fmt(monthly)} đ/tháng</strong> trong <strong>${months} tháng</strong> (đến ${this.formatDate(deadline)}).`;
  },

  renderGoals() {
    const goals = this.state.goals.filter(g => g.status !== 'cancelled');
    goals.sort((a, b) => {
      // 'achieved' xuống cuối
      const aDone = this.goalContributed(a) >= a.targetAmount ? 1 : 0;
      const bDone = this.goalContributed(b) >= b.targetAmount ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return (a.targetDate || '').localeCompare(b.targetDate || '');
    });

    // Tổng cam kết / đã đóng tháng này
    const ym = new Date().toISOString().slice(0, 7);
    const totalCommit = goals.reduce((s, g) => s + this.goalMonthlyTarget(g), 0);
    const totalDone = goals.reduce((s, g) => s + this.goalContributedInMonth(g, ym), 0);
    const pct = totalCommit > 0 ? Math.min(100, Math.round(totalDone / totalCommit * 100)) : 0;
    $('#goalMonthlyTotal').textContent = fmt(totalCommit) + ' đ';
    $('#goalMonthlyDone').textContent = fmt(totalDone) + ' đ';
    $('#goalMonthlyBarFill').style.width = pct + '%';

    const list = $('#goalList');
    if (!goals.length) {
      list.innerHTML = `
        <div class="empty-msg">
          Chưa có mục tiêu nào.<br>
          Bấm <strong>+</strong> để đặt mục tiêu đầu tiên — vd "Mua ô tô", "Du lịch Nhật"...
        </div>`;
      return;
    }

    list.innerHTML = goals.map(g => {
      const contributed = this.goalContributed(g);
      const totalPct = (g.targetAmount || 0) > 0 ? Math.min(100, Math.round(contributed / g.targetAmount * 100)) : 0;
      const status = this.goalStatus(g);
      const monthStatus = this.goalMonthStatus(g);
      const remaining = Math.max(0, (g.targetAmount || 0) - contributed);

      let metaText = '';
      if (status === 'achieved') {
        metaText = `🎉 Hoàn thành! Tổng ${fmt(g.targetAmount)} đ`;
      } else {
        const deadline = g.catchUpStrategy === 'extend' ? this.goalForecastEnd(g) : g.targetDate;
        const monthly = this.goalMonthlyTarget(g);
        const months = this.goalMonthsBetween(today().slice(0, 8) + '01', deadline);
        metaText = `${fmt(monthly)} đ/tháng × ${months} tháng → ${this.formatDate(deadline)}${g.catchUpStrategy === 'extend' && deadline !== g.targetDate ? ' (gia hạn)' : ''}`;
      }

      const iconHtml = (g.icon || '').startsWith('emoji:') ? g.icon.slice(6) : '🏆';
      let monthRowHtml = '';
      if (status !== 'achieved') {
        monthRowHtml = `
          <div class="goal-item-month-row ${monthStatus.kind}">
            <span class="goal-item-month-status ${monthStatus.kind}">${monthStatus.label}</span>
            <span style="flex:1;color:var(--text2)">${fmt(monthStatus.contributed)} / ${fmt(monthStatus.target)} đ</span>
            <span class="goal-item-month-cta" data-contrib="${g.id}">+ Đóng</span>
          </div>
        `;
      }

      return `
        <div class="goal-item" data-goal="${g.id}">
          <div class="goal-item-head">
            <div class="goal-item-icon" style="background:${(g.color || '#f59e0b') + '1a'};color:${g.color || '#f59e0b'}">${iconHtml}</div>
            <div class="goal-item-info">
              <div class="goal-item-name">${this.escapeHtml(g.name)}</div>
              <div class="goal-item-meta">${this.escapeHtml(metaText)}</div>
            </div>
            <div class="goal-item-pct">${totalPct}%</div>
          </div>
          <div class="goal-item-bar"><div class="goal-item-bar-fill ${status}" style="width:${totalPct}%"></div></div>
          <div class="goal-item-amts">
            <span>${fmt(contributed)} đ đã đóng</span>
            <span>còn ${fmt(remaining)} đ</span>
          </div>
          ${monthRowHtml}
        </div>
      `;
    }).join('');

    // Bấm dòng (nhưng tránh nút "Đóng")
    list.querySelectorAll('[data-goal]').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('[data-contrib]')) return;
        this.openGoalModal(el.dataset.goal);
      };
    });
    list.querySelectorAll('[data-contrib]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        this.openContribModal(el.dataset.contrib);
      };
    });
  },

  renderHomeGoals() {
    const wrap = $('#homeGoals');
    if (!wrap) return;
    const goals = this.state.goals.filter(g => g.status !== 'cancelled' && this.goalContributed(g) < g.targetAmount);
    if (!goals.length) { wrap.style.display = 'none'; return; }

    // Sort: behind/overdue trước, on-track sau
    goals.sort((a, b) => {
      const order = { overdue: 0, behind: 1, 'on-track': 2, achieved: 3 };
      return (order[this.goalStatus(a)] || 9) - (order[this.goalStatus(b)] || 9);
    });

    // Top 3 hiện trên Home
    const top3 = goals.slice(0, 3);

    wrap.style.display = 'block';
    wrap.innerHTML = `
      <div class="section">
        <div class="sec-label">🏆 Mục tiêu tiết kiệm <span class="sec-action" onclick="QLT_App.switchTab('goals')">Xem tất cả</span></div>
      </div>
      <div class="home-goal-card" onclick="QLT_App.switchTab('goals')">
        ${top3.map(g => {
          const contributed = this.goalContributed(g);
          const totalPct = (g.targetAmount || 0) > 0 ? Math.min(100, Math.round(contributed / g.targetAmount * 100)) : 0;
          const status = this.goalStatus(g);
          const monthStatus = this.goalMonthStatus(g);
          return `
            <div class="home-goal-row">
              <div class="home-goal-row-top">
                <span class="home-goal-row-name">${this.escapeHtml(g.name)}</span>
                <span class="home-goal-row-pct">${totalPct}%</span>
              </div>
              <div class="home-goal-row-bar"><div class="home-goal-row-bar-fill ${status === 'on-track' ? 'ok' : status}" style="width:${totalPct}%"></div></div>
              <div class="home-goal-row-meta">
                <span>${fmt(contributed)} / ${fmt(g.targetAmount)} đ</span>
                <span>${monthStatus.label}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  openGoalModal(goalId) {
    const isNew = !goalId;
    let g;
    if (isNew) {
      const startStr = today();
      const dl = new Date(); dl.setMonth(dl.getMonth() + 12);
      g = {
        id: null,
        name: '',
        targetAmount: 0,
        startDate: startStr,
        targetDate: dl.toISOString().slice(0, 10),
        plannedMonths: 12,
        reminderDay: 5,
        catchUpStrategy: 'spread',
        linkedAccountId: null,
        contributions: [],
        icon: 'emoji:🏆',
        color: '#f59e0b',
        status: 'active'
      };
    } else {
      g = JSON.parse(JSON.stringify(this.state.goals.find(x => x.id === goalId) || {}));
    }
    this.state.editingGoal = g;

    $('#goalModalTitle').textContent = isNew ? 'Thêm mục tiêu' : 'Sửa mục tiêu';
    $('#goalDelete').style.display = isNew ? 'none' : 'block';

    $('#goalName').value = g.name || '';
    $('#goalTarget').value = fmt(g.targetAmount || 0);
    $('#goalStart').value = g.startDate || today();
    $('#goalDeadline').value = g.targetDate || '';
    $('#goalReminderDay').value = String(g.reminderDay || 5);
    $$('input[name="goalStrategy"]').forEach(r => { r.checked = (r.value === (g.catchUpStrategy || 'spread')); });

    // Link account dropdown — chỉ ví savings hoặc payment đều OK
    const accs = this.state.accounts;
    $('#goalLinkAccount').innerHTML = '<option value="">— Không link (mục tiêu ảo, chỉ track) —</option>' +
      accs.map(a => `<option value="${a.id}" ${a.id === g.linkedAccountId ? 'selected' : ''}>${this.escapeHtml(a.name)} (${this.isSavings(a) ? 'TK' : 'TT'})</option>`).join('');

    this.recalcGoalPlanHint();

    this.renderIconPicker({
      containerId: 'goalIconGrid',
      currentIcon: g.icon || 'emoji:🏆',
      allowEmoji: true,
      onPick: (icon) => { this.state.editingGoal.icon = icon; }
    });

    $('#goalModal').classList.add('open');
  },

  async saveGoal() {
    const g = this.state.editingGoal;
    if (!g) return;
    g.name = $('#goalName').value.trim();
    g.targetAmount = readAmount($('#goalTarget'));
    g.startDate = $('#goalStart').value || today();
    g.targetDate = $('#goalDeadline').value || '';
    g.reminderDay = parseInt($('#goalReminderDay').value, 10) || 5;
    const stratEl = $$('input[name="goalStrategy"]').find(r => r.checked);
    g.catchUpStrategy = stratEl ? stratEl.value : 'spread';
    g.linkedAccountId = $('#goalLinkAccount').value || null;
    g.bookId = g.bookId || this.state.currentBookId;
    g.contributions = g.contributions || [];

    if (!g.name) { QLT_UI.toast('Nhập tên mục tiêu', { type: 'error' }); return; }
    if (g.targetAmount <= 0) { QLT_UI.toast('Nhập số tiền cần', { type: 'error' }); return; }
    if (!g.targetDate) { QLT_UI.toast('Chọn deadline', { type: 'error' }); return; }
    if (g.targetDate <= g.startDate) { QLT_UI.toast('Deadline phải sau ngày bắt đầu', { type: 'error' }); return; }

    // Tính plannedMonths — chỉ set lần đầu (giữ nguyên số tháng dự kiến ban đầu)
    if (!g.plannedMonths) {
      g.plannedMonths = this.goalMonthsBetween(g.startDate, g.targetDate);
    }

    if (!g.id) {
      g.createdAt = Date.now();
      g.status = 'active';
    }

    await window.QLT_Store.put('goals', g);
    await this.scheduleGoalNotif(g);
    await this.reload();
    $('#goalModal').classList.remove('open');
    this.renderGoals();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
    QLT_UI.toast('Đã lưu mục tiêu', { type: 'success' });
  },

  async deleteGoal() {
    const g = this.state.editingGoal;
    if (!g?.id) return;
    if (!await QLT_UI.confirm('Xoá mục tiêu này? Các giao dịch chuyển khoản đã tạo sẽ KHÔNG bị xoá.', { okLabel: 'Xoá', danger: true })) return;
    if (window.Capacitor?.Plugins?.LocalNotifications) {
      try {
        const idNum = Math.abs(this.hashCode('goal_' + g.id)) % 2000000;
        await window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: idNum }] });
      } catch (_) {}
    }
    await window.QLT_Store.del('goals', g.id);
    await this.reload();
    $('#goalModal').classList.remove('open');
    this.renderGoals();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
  },

  // ========= Đóng góp (contribution) =========
  openContribModal(goalId) {
    const g = this.state.goals.find(x => x.id === goalId);
    if (!g) return;
    this.state.editingGoal = g;

    const monthStatus = this.goalMonthStatus(g);
    const ym = new Date().toISOString().slice(0, 7);
    const contributedThisMonth = this.goalContributedInMonth(g, ym);

    $('#contribTitle').textContent = `+ Đóng góp: ${g.name}`;
    $('#contribInfo').innerHTML = `
      <div><strong>${this.escapeHtml(g.name)}</strong></div>
      <div style="color:var(--text2)">Tháng này: ${fmt(contributedThisMonth)} / ${fmt(monthStatus.target)} đ — gợi ý đóng <strong>${fmt(monthStatus.remain)} đ</strong> nữa</div>
    `;
    $('#contribAmount').value = fmt(monthStatus.remain || monthStatus.target);
    $('#contribDate').value = today();
    $('#contribNote').value = '';

    if (g.linkedAccountId) {
      $('#contribLinkOptionWrap').style.display = 'block';
      $('#contribCreateTx').checked = true;
      $('#contribFromAccountWrap').style.display = 'block';
      // Ví nguồn: chỉ payment account, không phải ví link
      const sourceAccs = this.state.accounts.filter(a => this.isPayment(a) && a.id !== g.linkedAccountId);
      $('#contribFromAccount').innerHTML = sourceAccs.map(a =>
        `<option value="${a.id}">${this.escapeHtml(a.name)} (${fmt(a.balance)} đ)</option>`
      ).join('');
      $('#contribCreateTx').onchange = () => {
        $('#contribFromAccountWrap').style.display = $('#contribCreateTx').checked ? 'block' : 'none';
      };
    } else {
      $('#contribLinkOptionWrap').style.display = 'none';
      $('#contribFromAccountWrap').style.display = 'none';
    }

    // Lịch sử đóng góp
    this.renderContribHistory(g);

    $('#contribModal').classList.add('open');
  },

  renderContribHistory(g) {
    const wrap = $('#contribHistory');
    const contribs = (g.contributions || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!contribs.length) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = `
      <div class="sec-label" style="padding:0;margin-bottom:8px">Lịch sử đóng góp (${contribs.length})</div>
      ${contribs.map(c => `
        <div class="contrib-row">
          <div style="flex:1">
            <div class="contrib-row-amt">+ ${fmt(c.amount)} đ</div>
            <div class="contrib-row-date">${this.formatDate(c.date)}${c.note ? ' · ' + this.escapeHtml(c.note) : ''}${c.txId ? ' · 🔗 GD' : ''}</div>
          </div>
          <div class="contrib-row-del" data-contrib-del="${c.id}" title="Xoá">${svgIcon('trash')}</div>
        </div>
      `).join('')}
    `;
    wrap.querySelectorAll('[data-contrib-del]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        this.deleteContribution(el.dataset.contribDel);
      };
    });
  },

  async saveContribution() {
    const g = this.state.editingGoal;
    if (!g?.id) return;
    const amount = readAmount($('#contribAmount'));
    const date = $('#contribDate').value || today();
    const note = $('#contribNote').value || '';

    if (amount <= 0) { QLT_UI.toast('Nhập số tiền', { type: 'error' }); return; }

    const contribution = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      date, amount, note,
      txId: null
    };

    // Nếu link account và user check 'create tx' → tạo transfer + lưu txId
    const createTx = $('#contribCreateTx').checked && g.linkedAccountId && $('#contribFromAccountWrap').style.display !== 'none';
    if (createTx) {
      const fromId = $('#contribFromAccount').value;
      if (!fromId) { QLT_UI.toast('Chọn ví nguồn', { type: 'error' }); return; }
      const tx = {
        type: 'transfer',
        amount,
        date,
        accountId: fromId,
        toAccountId: g.linkedAccountId,
        categoryId: null,
        note: note || `Đóng góp mục tiêu: ${g.name}`,
        bookId: this.state.currentBookId
      };
      await this.applyBalanceDelta(tx, +1);
      await window.QLT_Store.put('transactions', tx);
      contribution.txId = tx.id;
    }

    g.contributions = g.contributions || [];
    g.contributions.push(contribution);

    // Auto-mark achieved
    if (this.goalContributed(g) >= g.targetAmount && g.status !== 'achieved') {
      g.status = 'achieved';
      QLT_UI.toast(`🎉 Chúc mừng! Đã đạt mục tiêu "${g.name}"`, { type: 'success' });
    }

    await window.QLT_Store.put('goals', g);
    await this.reload();
    this.state.editingGoal = this.state.goals.find(x => x.id === g.id);

    $('#contribModal').classList.remove('open');
    this.renderGoals();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
    QLT_UI.toast(`Đã ghi nhận đóng góp ${fmt(amount)} đ`, { type: 'success' });
  },

  async deleteContribution(contribId) {
    const g = this.state.editingGoal;
    if (!g?.id) return;
    const c = (g.contributions || []).find(x => x.id === contribId);
    if (!c) return;
    if (!await QLT_UI.confirm('Xoá đóng góp này?' + (c.txId ? ' Giao dịch chuyển khoản tương ứng cũng sẽ bị xoá.' : ''), { okLabel: 'Xoá', danger: true })) return;

    if (c.txId) {
      const oldTx = this.state.transactions.find(t => t.id === c.txId);
      if (oldTx) {
        await this.applyBalanceDelta(oldTx, -1);
        await window.QLT_Store.del('transactions', c.txId);
      }
    }
    g.contributions = g.contributions.filter(x => x.id !== contribId);
    if (this.goalContributed(g) < g.targetAmount && g.status === 'achieved') g.status = 'active';

    await window.QLT_Store.put('goals', g);
    await this.reload();
    this.state.editingGoal = this.state.goals.find(x => x.id === g.id);
    this.renderContribHistory(this.state.editingGoal);
    this.renderGoals();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
  },

  // Notification: ngày X mỗi tháng (9h) + cảnh báo lần 2 ngày 25 nếu chưa đóng đủ
  async scheduleGoalNotif(g) {
    if (!window.Capacitor?.Plugins?.LocalNotifications) return;
    if (g.status === 'achieved' || g.status === 'cancelled') return;
    const LN = window.Capacitor.Plugins.LocalNotifications;
    try {
      await LN.requestPermissions();
      const idMain = Math.abs(this.hashCode('goal_' + g.id)) % 2000000;
      const idLate = Math.abs(this.hashCode('goal_late_' + g.id)) % 2000000;
      try { await LN.cancel({ notifications: [{ id: idMain }, { id: idLate }] }); } catch (_) {}

      const monthly = this.goalMonthlyTarget(g);
      // Lần 1: ngày reminderDay hằng tháng
      await LN.schedule({
        notifications: [{
          id: idMain,
          title: `🏆 ${g.name}`,
          body: `Đến lúc đóng ${fmt(monthly)} đ cho mục tiêu tháng này`,
          schedule: { on: { day: g.reminderDay || 5, hour: 9, minute: 0 } },
          sound: 'default'
        }]
      });
      // Lần 2: ngày 26 nếu cuối tháng vẫn chưa đóng (nhắc nhẹ)
      await LN.schedule({
        notifications: [{
          id: idLate,
          title: `⚠️ ${g.name} — Còn ít ngày`,
          body: `Cuối tháng rồi, kiểm tra xem đã đóng đủ chưa`,
          schedule: { on: { day: 26, hour: 18, minute: 0 } },
          sound: 'default'
        }]
      });
    } catch (e) { console.warn('Goal notif lỗi:', e); }
  },

  // ============ LOANS (Cho vay / Đi vay) ============
  loanRemaining(l) {
    const paid = (l.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    return Math.max(0, (l.principal || 0) - paid);
  },

  loanPaid(l) {
    return (l.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
  },

  renderLoans() {
    // Tổng đang cho vay / đang nợ (chỉ tính khoản 'open')
    const openLoans = this.state.loans.filter(l => l.status !== 'closed');
    const totalLend = openLoans.filter(l => l.type === 'lend').reduce((s, l) => s + this.loanRemaining(l), 0);
    const totalBorrow = openLoans.filter(l => l.type === 'borrow').reduce((s, l) => s + this.loanRemaining(l), 0);
    $('#loanTotalLend').textContent = fmt(totalLend) + ' đ';
    $('#loanTotalBorrow').textContent = fmt(totalBorrow) + ' đ';

    // Filter list
    const tab = this.state.loanTab;
    const status = this.state.loanStatusFilter;
    let loans = this.state.loans.filter(l => l.type === tab);
    if (status === 'open') loans = loans.filter(l => l.status !== 'closed');
    else if (status === 'closed') loans = loans.filter(l => l.status === 'closed');
    loans.sort((a, b) => (b.date + (b._updatedAt || '')).localeCompare(a.date + (a._updatedAt || '')));

    const list = $('#loanList');
    if (!loans.length) {
      list.innerHTML = '<div class="empty-msg">Chưa có khoản nào trong nhóm này</div>';
      return;
    }

    const todayStr = today();
    list.innerHTML = loans.map(l => {
      const remain = this.loanRemaining(l);
      const paid = this.loanPaid(l);
      const pct = l.principal > 0 ? Math.round(paid / l.principal * 100) : 0;
      const isClosed = l.status === 'closed';
      const icon = l.type === 'lend' ? '💸' : '💰';
      const remainCls = isClosed ? 'closed' : l.type;

      let dueHtml = '';
      if (l.dueDate && !isClosed) {
        const overdue = l.dueDate < todayStr;
        dueHtml = `<div class="loan-due ${overdue ? '' : 'ok'}">${overdue ? '⚠️ Quá hạn ' : 'Hạn '}${this.formatDate(l.dueDate)}</div>`;
      }

      return `
        <div class="loan-item" data-loan="${l.id}">
          <div class="loan-item-icon ${l.type}">${icon}</div>
          <div class="loan-item-info">
            <div class="loan-item-name">${this.escapeHtml(l.counterparty || 'Không tên')}</div>
            <div class="loan-item-meta">${this.formatDate(l.date)} · Gốc ${fmt(l.principal)} đ${l.note ? ' · ' + this.escapeHtml(l.note) : ''}</div>
            <div class="loan-item-bar"><div class="loan-item-bar-fill" style="width:${pct}%"></div></div>
            ${dueHtml}
          </div>
          <div class="loan-item-amt">
            <div class="loan-item-remain ${remainCls}">${isClosed ? '✓ Đã đóng' : fmt(remain) + ' đ'}</div>
            <div class="loan-item-progress">${isClosed ? 'Tổng ' + fmt(l.principal) : 'Đã trả ' + pct + '%'}</div>
          </div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('[data-loan]').forEach(el => {
      el.onclick = () => this.openLoanModal(el.dataset.loan);
    });
  },

  renderHomeLoanShortcut() {
    const wrap = $('#homeLoanShortcut');
    if (!wrap) return;
    const openLoans = this.state.loans.filter(l => l.status !== 'closed');
    if (!openLoans.length) { wrap.style.display = 'none'; return; }

    const lend = openLoans.filter(l => l.type === 'lend').reduce((s, l) => s + this.loanRemaining(l), 0);
    const borrow = openLoans.filter(l => l.type === 'borrow').reduce((s, l) => s + this.loanRemaining(l), 0);

    if (lend === 0 && borrow === 0) { wrap.style.display = 'none'; return; }

    wrap.style.display = 'block';
    wrap.innerHTML = `
      <div class="section">
        <div class="sec-label">Cho vay / Nợ <span class="sec-action" onclick="QLT_App.switchTab('loans')">Xem tất cả</span></div>
      </div>
      <div class="home-loan-card" onclick="QLT_App.switchTab('loans')">
        <div class="home-loan-card-item">
          <div class="home-loan-card-icon lend">💸</div>
          <div class="home-loan-card-info">
            <div class="home-loan-card-label">Đang cho vay</div>
            <div class="home-loan-card-val">${fmt(lend)} đ</div>
          </div>
        </div>
        <div class="home-loan-card-item">
          <div class="home-loan-card-icon borrow">💰</div>
          <div class="home-loan-card-info">
            <div class="home-loan-card-label">Đang nợ</div>
            <div class="home-loan-card-val">${fmt(borrow)} đ</div>
          </div>
        </div>
      </div>
    `;
  },

  openLoanModal(loanId) {
    const isNew = !loanId;
    let loan;
    if (isNew) {
      loan = {
        id: null,
        type: this.state.loanTab || 'lend',
        counterparty: '',
        principal: 0,
        accountId: this.state.accounts[0]?.id || null,
        date: today(),
        dueDate: '',
        note: '',
        status: 'open',
        payments: []
      };
    } else {
      loan = JSON.parse(JSON.stringify(this.state.loans.find(l => l.id === loanId) || {}));
    }
    this.state.editingLoan = loan;

    $('#loanModalTitle').textContent = isNew ? 'Thêm khoản nợ' : (loan.type === 'lend' ? 'Cho vay' : 'Đi vay') + ': ' + (loan.counterparty || '');
    $('#loanDelete').style.display = isNew ? 'none' : '';
    $('#loanCounterparty').value = loan.counterparty || '';
    $('#loanPrincipal').value = fmt(loan.principal || 0);
    $('#loanDate').value = loan.date || today();
    $('#loanDueDate').value = loan.dueDate || '';
    $('#loanNote').value = loan.note || '';

    // Type pills (chỉ chỉnh được khi tạo mới)
    $$('.loan-type-pill').forEach(el => {
      el.classList.toggle('on', el.dataset.type === loan.type);
      el.style.opacity = isNew ? '1' : '0.5';
      el.style.pointerEvents = isNew ? 'auto' : 'none';
    });

    // Account dropdown
    const accSel = $('#loanAccount');
    accSel.innerHTML = this.state.accounts.map(a =>
      `<option value="${a.id}" ${a.id === loan.accountId ? 'selected' : ''}>${this.escapeHtml(a.name)}</option>`
    ).join('');

    // Payments section (chỉ hiện khi đã có id)
    const paySection = $('#loanPaymentsSection');
    if (isNew) {
      paySection.style.display = 'none';
    } else {
      paySection.style.display = 'block';
      this.renderLoanPayments();
      $('#loanCloseBtn').textContent = loan.status === 'closed' ? '↺ Mở lại khoản' : '✓ Đóng khoản (đã thanh toán xong)';
    }

    $('#loanModal').classList.add('open');
  },

  renderLoanPayments() {
    const loan = this.state.editingLoan;
    if (!loan) return;
    const list = $('#loanPaymentsList');
    const payments = loan.payments || [];
    if (!payments.length) {
      list.innerHTML = '<div class="empty-msg" style="padding:20px">Chưa có lần trả nào</div>';
      return;
    }
    const sorted = [...payments].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    list.innerHTML = sorted.map(p => {
      const acc = this.state.accounts.find(a => a.id === p.accountId);
      return `
        <div class="payment-row">
          <div class="payment-row-info">
            <div><strong>${fmt(p.amount)} đ</strong>${p.note ? ' · ' + this.escapeHtml(p.note) : ''}</div>
            <div class="payment-row-date">${this.formatDate(p.date)} · ${this.escapeHtml(acc?.name || '')}</div>
          </div>
          <div class="payment-row-del" data-pay="${p.id}" title="Xoá">${svgIcon('trash')}</div>
        </div>
      `;
    }).join('');
    list.querySelectorAll('[data-pay]').forEach(el => {
      el.onclick = (e) => { e.stopPropagation(); this.deletePayment(el.dataset.pay); };
    });
  },

  async saveLoan() {
    const loan = this.state.editingLoan;
    if (!loan) return;
    loan.counterparty = $('#loanCounterparty').value.trim();
    loan.principal = readAmount($('#loanPrincipal'));
    loan.accountId = $('#loanAccount').value;
    loan.date = $('#loanDate').value || today();
    loan.dueDate = $('#loanDueDate').value || '';
    loan.note = $('#loanNote').value || '';
    loan.bookId = loan.bookId || this.state.currentBookId;
    loan.payments = loan.payments || [];

    if (!loan.counterparty) { QLT_UI.toast('Vui lòng nhập tên người', { type: 'error' }); return; }
    if (loan.principal <= 0) { QLT_UI.toast('Vui lòng nhập số tiền', { type: 'error' }); return; }
    if (!loan.accountId) { QLT_UI.toast('Vui lòng chọn ví', { type: 'error' }); return; }

    const isNew = !loan.id;
    if (isNew) {
      // Lần đầu tạo: cộng/trừ ví theo loại
      // - lend (cho vay): tiền RA khỏi ví
      // - borrow (đi vay): tiền VÀO ví
      const acc = this.state.accounts.find(a => a.id === loan.accountId);
      if (acc) {
        acc.balance += (loan.type === 'lend' ? -1 : +1) * loan.principal;
        await window.QLT_Store.put('accounts', acc);
      }
      loan.status = 'open';
      loan.createdAt = Date.now();
    }

    await window.QLT_Store.put('loans', loan);
    await this.scheduleLoanNotif(loan);
    await this.reload();
    $('#loanModal').classList.remove('open');
    this.renderLoans();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
    QLT_UI.toast(isNew ? 'Đã thêm khoản nợ' : 'Đã cập nhật', { type: 'success' });
  },

  async deleteLoan() {
    const loan = this.state.editingLoan;
    if (!loan?.id) return;
    if (!await QLT_UI.confirm('Xoá khoản này? Hệ thống sẽ HOÀN TÁC tất cả tác động lên ví (cả khoản gốc lẫn các lần trả).', { okLabel: 'Xoá', danger: true })) return;

    // Hoàn tác balance: hoàn lại khoản gốc + cộng/trừ lại các lần trả
    const acc = this.state.accounts.find(a => a.id === loan.accountId);
    if (acc) {
      // Đảo dấu của lúc tạo: lend đã trừ → giờ cộng lại; borrow đã cộng → giờ trừ lại
      acc.balance += (loan.type === 'lend' ? +1 : -1) * loan.principal;
      await window.QLT_Store.put('accounts', acc);
    }
    for (const p of (loan.payments || [])) {
      const pa = this.state.accounts.find(a => a.id === p.accountId);
      if (pa) {
        // Đảo dấu của lúc trả: lend-payment đã cộng vào ví → giờ trừ; borrow-payment đã trừ → giờ cộng
        pa.balance += (loan.type === 'lend' ? -1 : +1) * p.amount;
        await window.QLT_Store.put('accounts', pa);
      }
    }

    // Cancel notif
    if (window.Capacitor?.Plugins?.LocalNotifications) {
      try {
        const idNum = Math.abs(this.hashCode('loan_' + loan.id)) % 2000000;
        await window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: idNum }] });
      } catch (_) {}
    }

    await window.QLT_Store.del('loans', loan.id);
    await this.reload();
    $('#loanModal').classList.remove('open');
    this.renderLoans();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
  },

  openPaymentModal() {
    const loan = this.state.editingLoan;
    if (!loan?.id) return;
    const remain = this.loanRemaining(loan);
    $('#paymentModalTitle').textContent = (loan.type === 'lend' ? '✅ Nhận trả nợ từ ' : '💳 Trả nợ cho ') + (loan.counterparty || '');
    $('#paymentAmount').value = fmt(remain);
    $('#paymentDate').value = today();
    $('#paymentNote').value = '';
    $('#paymentAccount').innerHTML = this.state.accounts.map(a =>
      `<option value="${a.id}" ${a.id === loan.accountId ? 'selected' : ''}>${this.escapeHtml(a.name)}</option>`
    ).join('');
    $('#paymentModal').classList.add('open');
  },

  async savePayment() {
    const loan = this.state.editingLoan;
    if (!loan?.id) return;
    const amount = readAmount($('#paymentAmount'));
    const date = $('#paymentDate').value || today();
    const accountId = $('#paymentAccount').value;
    const note = $('#paymentNote').value || '';

    if (amount <= 0) { QLT_UI.toast('Vui lòng nhập số tiền', { type: 'error' }); return; }
    if (!accountId) { QLT_UI.toast('Vui lòng chọn ví', { type: 'error' }); return; }

    const remain = this.loanRemaining(loan);
    if (amount > remain) {
      if (!await QLT_UI.confirm(`Số tiền ${fmt(amount)} đ lớn hơn số còn lại (${fmt(remain)} đ). Vẫn ghi nhận?`, { okLabel: 'Ghi nhận' })) return;
    }

    const payment = {
      id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      date, amount, accountId, note,
      createdAt: Date.now()
    };
    loan.payments = loan.payments || [];
    loan.payments.push(payment);

    // Cập nhật ví
    // - lend-payment: đối tác trả mình → tiền VÀO ví
    // - borrow-payment: mình trả đối tác → tiền RA khỏi ví
    const acc = this.state.accounts.find(a => a.id === accountId);
    if (acc) {
      acc.balance += (loan.type === 'lend' ? +1 : -1) * amount;
      await window.QLT_Store.put('accounts', acc);
    }

    // Tự đóng nếu trả đủ
    if (this.loanRemaining(loan) === 0) {
      loan.status = 'closed';
    }

    await window.QLT_Store.put('loans', loan);
    await this.reload();
    // Refresh editingLoan từ state mới
    this.state.editingLoan = this.state.loans.find(l => l.id === loan.id);
    $('#paymentModal').classList.remove('open');
    this.renderLoanPayments();
    $('#loanCloseBtn').textContent = this.state.editingLoan.status === 'closed' ? '↺ Mở lại khoản' : '✓ Đóng khoản (đã thanh toán xong)';
    this.renderLoans();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
    QLT_UI.toast('Đã ghi nhận trả tiền', { type: 'success' });
  },

  async deletePayment(payId) {
    const loan = this.state.editingLoan;
    if (!loan?.id) return;
    const p = (loan.payments || []).find(x => x.id === payId);
    if (!p) return;
    if (!await QLT_UI.confirm('Xoá lần trả này? Số tiền sẽ hoàn lại ví.', { okLabel: 'Xoá', danger: true })) return;

    // Hoàn tác balance
    const acc = this.state.accounts.find(a => a.id === p.accountId);
    if (acc) {
      acc.balance += (loan.type === 'lend' ? -1 : +1) * p.amount;
      await window.QLT_Store.put('accounts', acc);
    }

    loan.payments = loan.payments.filter(x => x.id !== payId);
    // Nếu khoản đang đóng mà còn dư → mở lại
    if (loan.status === 'closed' && this.loanRemaining(loan) > 0) {
      loan.status = 'open';
    }
    await window.QLT_Store.put('loans', loan);
    await this.reload();
    this.state.editingLoan = this.state.loans.find(l => l.id === loan.id);
    this.renderLoanPayments();
    $('#loanCloseBtn').textContent = this.state.editingLoan.status === 'closed' ? '↺ Mở lại khoản' : '✓ Đóng khoản (đã thanh toán xong)';
    this.renderLoans();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
  },

  async toggleLoanClosed() {
    const loan = this.state.editingLoan;
    if (!loan?.id) return;
    loan.status = loan.status === 'closed' ? 'open' : 'closed';
    await window.QLT_Store.put('loans', loan);
    await this.reload();
    this.state.editingLoan = this.state.loans.find(l => l.id === loan.id);
    $('#loanCloseBtn').textContent = this.state.editingLoan.status === 'closed' ? '↺ Mở lại khoản' : '✓ Đóng khoản (đã thanh toán xong)';
    this.renderLoans();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
    QLT_UI.toast(loan.status === 'closed' ? 'Đã đóng khoản' : 'Đã mở lại khoản', { type: 'success' });
  },

  async scheduleLoanNotif(loan) {
    if (!loan.dueDate || loan.status === 'closed') return;
    if (!window.Capacitor?.Plugins?.LocalNotifications) return;
    const LN = window.Capacitor.Plugins.LocalNotifications;
    try {
      await LN.requestPermissions();
      const idNum = Math.abs(this.hashCode('loan_' + loan.id)) % 2000000;
      // Hủy notif cũ trước
      try { await LN.cancel({ notifications: [{ id: idNum }] }); } catch (_) {}

      const due = new Date(loan.dueDate + 'T09:00:00');
      if (due.getTime() < Date.now()) return; // đã quá hạn rồi thì khỏi nhắc

      const remain = this.loanRemaining(loan);
      const title = loan.type === 'lend'
        ? `📢 ${loan.counterparty} đến hạn trả`
        : `📢 Đến hạn trả ${loan.counterparty}`;
      const body = `Còn ${fmt(remain)} đ — ${loan.note || 'Đừng quên nhé!'}`;

      await LN.schedule({
        notifications: [{
          id: idNum,
          title,
          body,
          schedule: { at: due },
          sound: 'default'
        }]
      });
    } catch (e) { console.warn('Loan notif lỗi:', e); }
  },

  // ============ SETTINGS ============
  async renderSettings() {
    $('#setUser').textContent = window.QLT_Auth.user ? window.QLT_Auth.user.email : 'Chưa đăng nhập';
    const last = await window.QLT_Store.getMeta('lastSync');
    $('#setLastSync').textContent = last ? new Date(last).toLocaleString('vi-VN') : 'Chưa đồng bộ';

    $('#setLogin').onclick = () => this.doLogin();
    $('#setLogout').onclick = () => this.doLogout();
    $('#setSync').onclick = () => this.doSync();
    $('#setExport').onclick = () => this.doExport();
    $('#setImport').onclick = () => this.doImport();

    // Gỡ banner cũ nếu còn (từ phiên bản trước hide login trên native)
    const oldNote = $('#setNativeNote');
    if (oldNote) oldNote.remove();

    $('#setLogin').style.display = window.QLT_Auth.user ? 'none' : 'block';
    $('#setLogout').style.display = window.QLT_Auth.user ? 'block' : 'none';
    $('#setSync').style.display = window.QLT_Auth.user ? 'block' : 'none';

    // Bảo mật — Khoá PIN
    await this.renderLockSettings();
  },

  async renderLockSettings() {
    const Lock = window.QLT_Lock;
    if (!Lock) return;
    const enabled = Lock.isEnabled();
    const bioInfo = await Lock.bioAvailable();
    const bioOn = Lock.isBiometricFlagOn();
    const timeout = Lock.getTimeoutSeconds();

    $('#setLockStatus').textContent = enabled
      ? (bioOn && bioInfo.available ? 'Đã bật PIN + Sinh trắc' : 'Đã bật PIN')
      : 'Chưa bật';
    $('#setLockStatus').style.color = enabled ? 'var(--accent)' : 'var(--text2)';

    $('#setLockEnable').style.display = enabled ? 'none' : 'block';
    $('#setLockChangePin').style.display = enabled ? 'block' : 'none';
    $('#setLockDisable').style.display = enabled ? 'block' : 'none';
    $('#setBioRow').style.display = (enabled && bioInfo.available) ? 'flex' : 'none';
    $('#setTimeoutRow').style.display = enabled ? 'flex' : 'none';
    $('#setBiometricToggle').checked = bioOn;
    $('#setLockTimeout').value = String(timeout);

    // Bind 1 lần
    if (this._lockSettingsBound) return;
    this._lockSettingsBound = true;

    $('#setLockEnable').onclick = async () => {
      // Hỏi 4 hoặc 6 chữ số
      const useSix = await QLT_UI.confirm('Chọn độ dài PIN:\n\n• Bấm "4 chữ số" để dùng PIN ngắn (mặc định)\n• Bấm "6 chữ số" để dùng PIN dài hơn (an toàn hơn)', { okLabel: '6 chữ số', cancelLabel: '4 chữ số' });
      const pinLen = useSix ? 6 : 4;
      Lock.showSetup(() => this.renderLockSettings(), pinLen);
    };

    $('#setLockChangePin').onclick = () => {
      Lock.showChange(() => this.renderLockSettings());
    };

    $('#setLockDisable').onclick = async () => {
      if (!await QLT_UI.confirm('Tắt khoá PIN? App sẽ không yêu cầu PIN nữa.', { okLabel: 'Tắt khoá', danger: true })) return;
      Lock.disable(() => this.renderLockSettings());
    };

    $('#setBiometricToggle').onchange = async (e) => {
      try {
        await Lock.setBiometric(e.target.checked);
        await this.renderLockSettings();
        QLT_UI.toast(e.target.checked ? 'Đã bật sinh trắc' : 'Đã tắt sinh trắc', { type: 'success' });
      } catch (err) {
        e.target.checked = false;
        QLT_UI.alert('Thiết bị không hỗ trợ sinh trắc, hoặc bạn chưa đăng ký vân tay/Face. Vào Cài đặt Android để đăng ký trước.', { title: 'Không khả dụng' });
      }
    };

    $('#setLockTimeout').onchange = (e) => {
      Lock.setTimeout(e.target.value);
      QLT_UI.toast('Đã cập nhật thời gian khoá lại', { type: 'success' });
    };
  },

  // ============ MODAL: TRANSACTION ============
  openTxModal(id, defaultType) {
    const isNew = !id;
    let tx;
    if (isNew) {
      tx = {
        id: null,
        type: defaultType || 'expense',
        amount: 0,
        date: today(),
        accountId: this.state.accounts[0]?.id || null,
        toAccountId: this.state.accounts[1]?.id || null,
        categoryId: null,
        note: '',
        photo: null,
        participantIds: null, // null = tất cả thành viên (mặc định)
        bookId: this.state.currentBookId
      };
    } else {
      tx = this.state.transactions.find(t => t.id === id);
      if (!tx) return;
    }
    this.state.editingTx = { ...tx };
    $('#txForm').dataset.type = tx.type;
    $$('.tx-type-pill').forEach(el => {
      el.classList.toggle('on', el.dataset.type === tx.type);
    });
    $('#txAmount').value = fmtAmount(tx.amount);
    $('#txDate').value = tx.date;
    $('#txNote').value = tx.note || '';
    $('#txDelete').style.display = isNew ? 'none' : 'block';
    $('#txTitle').textContent = isNew ? 'Thêm giao dịch' : 'Sửa giao dịch';

    // Render account picker
    $('#txAccountList').innerHTML = this.state.accounts.map(a => `
      <div class="picker-item ${a.id === tx.accountId ? 'on' : ''}" data-acc="${a.id}">
        <span class="picker-icon" style="color:#2d6a4f">${svgIcon(a.icon || 'cash')}</span>
        <span>${this.escapeHtml(a.name)}</span>
      </div>
    `).join('');
    $$('#txAccountList .picker-item').forEach(el => {
      el.onclick = () => {
        $$('#txAccountList .picker-item').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.editingTx.accountId = el.dataset.acc;
        if ($('#txForm').dataset.type === 'transfer') {
          // Nếu chọn từ trùng đích → reset đích
          if (this.state.editingTx.toAccountId === el.dataset.acc) {
            this.state.editingTx.toAccountId = null;
          }
          this.renderTxToAccountPicker();
        }
      };
    });

    this.applyTxTypeUI(tx.type);
    this.renderTxPhoto();

    $('#txModal').classList.add('open');
  },

  applyTxTypeUI(type) {
    if (type === 'transfer') {
      $('#txCategorySection').style.display = 'none';
      $('#txAccountLabel').textContent = 'Từ tài khoản';
      $('#txToAccountSection').style.display = 'block';
      this.renderTxToAccountPicker();
      const hint = $('#txBudgetHint'); if (hint) hint.style.display = 'none';
    } else {
      $('#txCategorySection').style.display = 'block';
      $('#txAccountLabel').textContent = 'Tài khoản';
      $('#txToAccountSection').style.display = 'none';
      this.renderTxCategoryPicker(type);
    }
    this.renderTxParticipants();
  },

  renderTxParticipants() {
    const sec = $('#txParticipantsSection');
    if (!sec) return;
    const tx = this.state.editingTx;
    const currentType = $('#txForm').dataset.type || tx?.type;
    const book = this.state.books.find(b => b.id === (tx?.bookId || this.state.currentBookId));
    const members = (book?.members || []).filter(m => m.name && m.name.trim());
    // Chỉ hiện khi là CHI và sổ có thành viên
    if (!tx || currentType !== 'expense' || members.length === 0) {
      sec.style.display = 'none';
      return;
    }
    sec.style.display = 'block';

    // null/undefined = tất cả tham gia
    let selected = tx.participantIds;
    if (!Array.isArray(selected)) selected = members.map(m => m.id);

    const list = $('#txParticipantsList');
    list.innerHTML = members.map((m, i) => {
      const on = selected.includes(m.id);
      return `<div class="picker-item ${on ? 'on' : ''}" data-mem="${m.id}" style="user-select:none">
        <span style="display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center;background:${on ? 'var(--accent)' : 'var(--surface2)'};color:${on ? '#fff' : 'var(--text2)'};border-radius:50%;font-size:10px;font-weight:700">${on ? '✓' : (i + 1)}</span>
        <span>${this.escapeHtml(m.name)}</span>
      </div>`;
    }).join('');

    const updateHint = () => {
      const cur = this.state.editingTx.participantIds;
      const arr = Array.isArray(cur) ? cur : members.map(m => m.id);
      const amt = readAmount($('#txAmount'));
      const per = arr.length > 0 ? Math.round(amt / arr.length) : 0;
      $('#txParticipantsHint').textContent = arr.length === members.length
        ? `Tất cả ${members.length} thành viên — mỗi người ${fmt(per)}đ`
        : arr.length === 0
        ? 'Chưa chọn ai → giao dịch này KHÔNG được tính vào quyết toán'
        : `${arr.length}/${members.length} người tham gia — mỗi người ${fmt(per)}đ`;
    };

    $$('#txParticipantsList .picker-item').forEach(el => {
      el.onclick = () => {
        const id = el.dataset.mem;
        let cur = this.state.editingTx.participantIds;
        if (!Array.isArray(cur)) cur = members.map(m => m.id);
        if (cur.includes(id)) cur = cur.filter(x => x !== id);
        else cur = [...cur, id];
        // Nếu trùng đúng tất cả thành viên → set null cho gọn
        this.state.editingTx.participantIds = (cur.length === members.length && members.every(m => cur.includes(m.id))) ? null : cur;
        this.renderTxParticipants();
      };
    });

    $('#txPartAll').onclick = () => {
      this.state.editingTx.participantIds = null;
      this.renderTxParticipants();
    };
    $('#txPartNone').onclick = () => {
      this.state.editingTx.participantIds = [];
      this.renderTxParticipants();
    };
    // Hint update khi gõ số tiền
    $('#txAmount').oninput = updateHint;
    updateHint();
  },

  renderTxToAccountPicker() {
    const sel = this.state.editingTx?.toAccountId;
    const from = this.state.editingTx?.accountId;
    $('#txToAccountList').innerHTML = this.state.accounts.map(a => `
      <div class="picker-item ${a.id === sel ? 'on' : ''} ${a.id === from ? 'disabled' : ''}" data-acc="${a.id}">
        <span class="picker-icon" style="color:#2d6a4f">${svgIcon(a.icon || 'cash')}</span>
        <span>${this.escapeHtml(a.name)}</span>
      </div>
    `).join('');
    $$('#txToAccountList .picker-item').forEach(el => {
      el.onclick = () => {
        if (el.classList.contains('disabled')) {
          QLT_UI.toast('Tài khoản nguồn và đích phải khác nhau', { type: 'error' });
          return;
        }
        $$('#txToAccountList .picker-item').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.editingTx.toAccountId = el.dataset.acc;
      };
    });
  },

  renderTxCategoryPicker(type) {
    const cats = this.state.categories.filter(c => c.type === type);
    const sel = this.state.editingTx?.categoryId;

    // Sắp xếp: parents → ngay sau là children của nó
    const parents = cats.filter(c => !c.parentId);
    const childrenByParent = {};
    for (const c of cats) {
      if (c.parentId) (childrenByParent[c.parentId] = childrenByParent[c.parentId] || []).push(c);
    }
    const orphans = cats.filter(c => c.parentId && !cats.find(x => x.id === c.parentId));

    const sortedFlat = [];
    [...parents, ...orphans].forEach(p => {
      sortedFlat.push({ ...p, _depth: 0 });
      (childrenByParent[p.id] || []).forEach(ch => sortedFlat.push({ ...ch, _depth: 1 }));
    });

    $('#txCategoryList').innerHTML = sortedFlat.map(c => `
      <div class="picker-item ${c.id === sel ? 'on' : ''} ${c._depth ? 'picker-child' : ''}" data-cat="${c.id}">
        <span class="picker-icon" style="color:${c.color}">${svgIcon(c.icon)}</span>
        <span>${c._depth ? '↳ ' : ''}${this.escapeHtml(c.name)}</span>
      </div>
    `).join('');
    $$('#txCategoryList .picker-item').forEach(el => {
      el.onclick = () => {
        $$('#txCategoryList .picker-item').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.editingTx.categoryId = el.dataset.cat;
        this.renderTxBudgetHint();
      };
    });
    this.renderTxBudgetHint();
  },

  // Hiện ngân sách còn lại của danh mục đang chọn (chỉ áp dụng cho 'expense')
  renderTxBudgetHint() {
    const hint = $('#txBudgetHint');
    if (!hint) return;
    const tx = this.state.editingTx;
    if (!tx || tx.type !== 'expense' || !tx.categoryId) {
      hint.style.display = 'none';
      return;
    }
    const budget = this.state.budgets.find(b => b.categoryId === tx.categoryId);
    if (!budget) { hint.style.display = 'none'; return; }

    const ym = (tx.date || today()).slice(0, 7);
    let spent = this.budgetSpent(tx.categoryId, ym);
    // Nếu đang sửa: trừ chính giao dịch này khỏi 'đã chi' để hiện đúng
    if (tx.id) {
      const existing = this.state.transactions.find(x => x.id === tx.id);
      if (existing && existing.date.startsWith(ym)) spent -= existing.amount;
    }
    const remain = budget.amount - spent;
    const pct = budget.amount > 0 ? Math.round(spent / budget.amount * 100) : 0;
    let cls = 'ok', emoji = '✅';
    if (pct >= 100) { cls = 'over'; emoji = '🚫'; }
    else if (pct >= 80) { cls = 'warn'; emoji = '⚠️'; }

    hint.style.display = 'block';
    hint.className = 'tx-budget-hint ' + (cls === 'ok' ? '' : cls);
    if (remain >= 0) {
      hint.innerHTML = `${emoji} <strong>Ngân sách:</strong> còn <strong>${fmt(remain)} đ</strong> trong tháng này (đã chi ${fmt(spent)} / ${fmt(budget.amount)} · ${pct}%)`;
    } else {
      hint.innerHTML = `${emoji} <strong>Đã vượt ngân sách</strong> ${fmt(-remain)} đ (đã chi ${fmt(spent)} / ${fmt(budget.amount)})`;
    }
  },

  async saveTx() {
    const t = this.state.editingTx;
    t.type = $('#txForm').dataset.type;
    t.amount = readAmount($('#txAmount'));
    t.date = $('#txDate').value || today();
    t.note = $('#txNote').value || '';
    t.bookId = t.bookId || this.state.currentBookId;

    if (t.amount <= 0) { QLT_UI.toast('Vui lòng nhập số tiền', { type: 'error' }); return; }
    if (!t.accountId) { QLT_UI.toast('Vui lòng chọn tài khoản', { type: 'error' }); return; }
    if (t.type === 'transfer') {
      if (!t.toAccountId) { QLT_UI.toast('Vui lòng chọn tài khoản đích', { type: 'error' }); return; }
      if (t.toAccountId === t.accountId) { QLT_UI.toast('Tài khoản nguồn và đích phải khác nhau', { type: 'error' }); return; }
      t.categoryId = null;
    } else {
      if (!t.categoryId) { QLT_UI.toast('Vui lòng chọn danh mục', { type: 'error' }); return; }
      t.toAccountId = null;
    }

    // Chỉ giữ participantIds cho giao dịch CHI; chuẩn hoá: trùng đủ tất cả → null
    if (t.type !== 'expense') {
      t.participantIds = null;
    } else if (Array.isArray(t.participantIds)) {
      const book = this.state.books.find(b => b.id === t.bookId);
      const allMems = (book?.members || []).filter(m => m.name && m.name.trim()).map(m => m.id);
      if (allMems.length > 0 && allMems.every(id => t.participantIds.includes(id)) && t.participantIds.length === allMems.length) {
        t.participantIds = null;
      }
    }

    // Hoàn tác giao dịch cũ (nếu sửa)
    const oldTx = t.id ? this.state.transactions.find(x => x.id === t.id) : null;
    if (oldTx) {
      await this.applyBalanceDelta(oldTx, -1);
    }
    // Áp giao dịch mới
    await this.applyBalanceDelta(t, +1);

    await window.QLT_Store.put('transactions', t);
    await this.reload();
    $('#txModal').classList.remove('open');
    this.switchTab(this.state.currentTab);
    this.autoSync();
  },

  // delta=+1: cộng giao dịch vào số dư; delta=-1: hoàn tác
  async applyBalanceDelta(t, delta) {
    if (t.type === 'transfer') {
      const from = this.state.accounts.find(a => a.id === t.accountId);
      const to = this.state.accounts.find(a => a.id === t.toAccountId);
      if (from) { from.balance -= t.amount * delta; await window.QLT_Store.put('accounts', from); }
      if (to) { to.balance += t.amount * delta; await window.QLT_Store.put('accounts', to); }
    } else {
      const acc = this.state.accounts.find(a => a.id === t.accountId);
      if (acc) {
        acc.balance += (t.type === 'income' ? +1 : -1) * t.amount * delta;
        await window.QLT_Store.put('accounts', acc);
      }
    }
  },

  async deleteTx() {
    const t = this.state.editingTx;
    if (!t.id) return;
    if (!await QLT_UI.confirm('Xoá giao dịch này?', { okLabel: 'Xoá', danger: true })) return;
    await this.applyBalanceDelta(t, -1);
    await window.QLT_Store.del('transactions', t.id);
    await this.reload();
    $('#txModal').classList.remove('open');
    this.switchTab(this.state.currentTab);
    this.autoSync();
  },

  async scanReceipt() {
    try {
      let imageDataUrl;
      if (window.Capacitor && window.Capacitor.Plugins.Camera) {
        const photo = await window.Capacitor.Plugins.Camera.getPhoto({
          quality: 80,
          resultType: 'dataUrl',
          source: 'PROMPT',  // hỏi Camera hay Gallery — quét được cả ảnh chụp sẵn
          allowEditing: false,
          promptLabelHeader: 'Chọn ảnh hoá đơn',
          promptLabelPhoto: 'Chọn từ thư viện',
          promptLabelPicture: 'Chụp ảnh mới'
        });
        imageDataUrl = photo.dataUrl;
      } else {
        // Web fallback — bỏ capture để cho chọn file
        imageDataUrl = await this.pickImageWeb();
      }
      if (!imageDataUrl) return;

      const status = $('#txOcrStatus');
      status.style.display = 'block';
      status.textContent = 'Đang nhận diện hoá đơn...';

      const result = await window.QLT_Ocr.recognize(imageDataUrl, p => {
        if (p.stage === 'recognizing') status.textContent = 'Đang đọc... ' + Math.round(p.progress * 100) + '%';
      });

      status.textContent = 'Xong!';
      setTimeout(() => { status.style.display = 'none'; }, 1500);

      if (result.amount) $('#txAmount').value = result.amount;
      if (result.date) $('#txDate').value = result.date;
      if (result.merchant) $('#txNote').value = result.merchant;

      // Tự đính kèm ảnh vừa quét làm minh chứng — khỏi phải add lại
      try {
        const compressed = await this.compressImage(imageDataUrl);
        this.state.editingTx.photo = compressed;
        this.renderTxPhoto();
      } catch (_) { /* compress lỗi cũng không chặn flow OCR */ }
    } catch (e) {
      console.error(e);
      QLT_UI.alert('Không nhận diện được: ' + e.message, { title: 'Lỗi OCR' });
    }
  },

  pickImageWeb() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      // KHÔNG đặt capture → trình duyệt cho chọn Camera hoặc thư viện
      input.onchange = e => {
        const file = e.target.files[0];
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  },

  // Picker linh hoạt: trên mobile cho chọn Camera hoặc Thư viện, web thì file picker
  async pickPhoto(forceCamera = false) {
    if (window.Capacitor && window.Capacitor.Plugins.Camera) {
      try {
        const photo = await window.Capacitor.Plugins.Camera.getPhoto({
          quality: 80,
          resultType: 'dataUrl',
          source: forceCamera ? 'CAMERA' : 'PROMPT',
          allowEditing: false
        });
        return photo.dataUrl;
      } catch (_) { return null; }
    }
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (forceCamera) input.capture = 'environment';
      input.onchange = e => {
        const file = e.target.files[0];
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  },

  // Resize + nén ảnh JPEG để file nhỏ (tránh DB phình to)
  compressImage(dataUrl, maxDim = 1280, quality = 0.78) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * maxDim / width); width = maxDim; }
          else { width = Math.round(width * maxDim / height); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Không xử lý được ảnh'));
      img.src = dataUrl;
    });
  },

  async addTxPhoto() {
    try {
      const raw = await this.pickPhoto(false);
      if (!raw) return;
      const compressed = await this.compressImage(raw);
      this.state.editingTx.photo = compressed;
      this.renderTxPhoto();
    } catch (e) {
      QLT_UI.alert('Lỗi: ' + e.message, { title: 'Lỗi' });
    }
  },

  async removeTxPhoto() {
    if (!await QLT_UI.confirm('Xoá ảnh minh chứng?', { okLabel: 'Xoá', danger: true })) return;
    this.state.editingTx.photo = null;
    this.renderTxPhoto();
  },

  renderTxPhoto() {
    const wrap = $('#txPhotoWrap');
    const t = this.state.editingTx;
    if (t && t.photo) {
      wrap.innerHTML = `
        <div class="photo-thumb" id="txPhotoThumb">
          <img src="${t.photo}" alt="minh chứng">
          <button class="photo-remove" id="txPhotoRemove" title="Xoá">${svgIcon('close')}</button>
        </div>
      `;
      $('#txPhotoThumb').onclick = (e) => {
        if (e.target.closest('#txPhotoRemove')) return;
        this.openLightbox(t.photo);
      };
      $('#txPhotoRemove').onclick = () => this.removeTxPhoto();
    } else {
      wrap.innerHTML = `
        <button class="photo-add-btn" id="txPhotoAddBtn">
          ${svgIcon('camera')}
          <span>Thêm minh chứng</span>
        </button>
      `;
      $('#txPhotoAddBtn').onclick = () => this.addTxPhoto();
    }
  },

  openLightbox(src) {
    $('#lightboxImg').src = src;
    $('#lightboxModal').classList.add('open');
  },

  // ============ ICON PICKER (chỉ emoji — gọn, không dùng SVG icon nữa) ============
  // Trả về object { setColor(c) } để giữ tương thích — emoji không cần đổi màu nên là no-op
  renderIconPicker(opts) {
    // opts: { containerId, currentIcon, color?, allowEmoji?, onPick }
    const container = document.getElementById(opts.containerId);
    if (!container) return { setColor: () => {} };

    const initEmoji = String(opts.currentIcon || '').startsWith('emoji:')
      ? opts.currentIcon.slice(6) : '';

    // Bộ emoji gợi ý — chia theo nhóm để dễ tìm theo nhu cầu hằng ngày
    const EMOJI_GROUPS = [
      { key: 'food', name: 'Ăn uống', icon: '🍜', emojis: [
        '🍜','🍚','🍱','🍲','🍛','🍙','🍘','🥟','🍣','🍤','🌮','🌯','🥗','🥪','🍝','🍞',
        '🥖','🥐','🧀','🥚','🍳','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🥨','🥞','🧇',
        '🍰','🎂','🧁','🍩','🍪','🍫','🍬','🍭','🍮','🍯','🍦','🍨','🍧','🍡','🥮','🍢',
        '🍇','🍉','🍊','🍋','🍌','🍍','🥭','🍎','🍏','🍐','🍑','🍒','🍓','🫐','🥝','🍅',
        '🥑','🍆','🥔','🥕','🌽','🌶️','🥒','🥬','🥦','🧄','🧅','🍄','🥜','🌰'
      ]},
      { key: 'drink', name: 'Đồ uống', icon: '☕', emojis: [
        '☕','🍵','🧉','🧋','🥤','🧃','🍶','🍾','🍷','🍸','🍹','🍺','🍻','🥂','🥃','🍼','🥛'
      ]},
      { key: 'shop', name: 'Mua sắm', icon: '🛒', emojis: [
        '🛒','🛍️','🎁','👕','👔','👖','👗','👚','👘','🥻','🩱','🩲','🩳','👙','👠','👡','👢','👞','👟','🥾','🥿','🧢','🎩','👑','💍','👜','👛','👝','🎒','🧳','🕶️','👓','⌚','💎'
      ]},
      { key: 'bills', name: 'Hoá đơn', icon: '⚡', emojis: [
        '⚡','💡','💧','🚿','🛁','🚰','🔥','🔌','🪫','🔋','📶','📡','📞','☎️','📱','💻','🖥️','🖨️','📺','📻','📷','📹','🎙️','🔊','🎧'
      ]},
      { key: 'transport', name: 'Di chuyển', icon: '🚗', emojis: [
        '🚗','🚙','🚕','🛺','🚖','🚘','🏍️','🛵','🚲','🛴','🛹','🚌','🚐','🚎','🚒','🚓','🚑','🚚','🚛','🚜','🚆','🚄','🚅','🚇','🚈','🚉','🚂','🚁','✈️','🛫','🛬','🚀','🛸','⛵','🚤','🛥️','⛴️','🚢','⛽','🅿️','🚏','🛣️','🛤️','🗺️','🧭'
      ]},
      { key: 'health', name: 'Sức khoẻ', icon: '💊', emojis: [
        '💊','💉','🩺','🩹','🩻','🦷','👁️','🧠','🫀','🫁','🦴','🩸','🏥','🏨','⚕️','🧴','🧼','🪥','🧻','🚽','🪒','🧯','🦽','🦼','🦯','🦻','🦾','🦿'
      ]},
      { key: 'sport', name: 'Thể thao', icon: '⚽', emojis: [
        '🏋️','🤸','🚴','🏃','🧘','⛹️','🏊','🏄','🤽','🤾','🤼','🤺','🏌️','🤿','⚽','🏀','🏐','🏈','⚾','🥎','🎾','🏓','🏸','🏑','🏒','🥍','🥊','🥋','🥅','⛳','🏹','🎣','🎽','🎿','⛷️','🏂','🛷','🪂','🏆','🥇','🥈','🥉','🎖️','🏅','🎯','🎳','🎮','🎰','🎲','🧩','🪀','🪁','♟️'
      ]},
      { key: 'culture', name: 'Văn hoá', icon: '🎬', emojis: [
        '🎬','🎥','🎞️','📽️','🎭','🎨','🖼️','🎪','🎫','🎟️','🎤','🎧','🎼','🎵','🎶','🎷','🎺','🎸','🪕','🎻','🥁','🪘','🪇'
      ]},
      { key: 'event', name: 'Sự kiện', icon: '🎉', emojis: [
        '🎉','🎊','🎈','🎀','🎁','🎂','🎃','🎄','🎆','🎇','🧨','✨','🎋','🎍','🎎','🎏','🎐','🪔','🧧','💝','💐','🌹','🌷','🌻','🌼','🌸','🪷','💌','💒','💞','💕','❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎'
      ]},
      { key: 'work', name: 'Học/Công việc', icon: '📚', emojis: [
        '📚','📖','📕','📗','📘','📙','📓','📔','📒','📑','📋','📝','✏️','✒️','🖊️','🖋️','🖌️','🖍️','📐','📏','📌','📍','📎','🖇️','📂','📁','🗂️','📅','📆','🗓️','📇','📊','📈','📉','📰','🗞️','🔖','🏷️','💼','👔','🎓','🎒','🏫','🏛️','🧮','💾','💿','📀','💽','🗄️','🗃️','🗒️'
      ]},
      { key: 'home', name: 'Nhà cửa', icon: '🏠', emojis: [
        '🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','💒','🗼','🌇','🌆','🌃','🌉','🏗️','🏚️','⛪','🕌','🛕','⛩️','🕍','🛋️','🛏️','🚪','🪑','🛗','🚿','🚽','🪞','🪟','🪜','🧱','🪨','🪵','🪴','🕯️'
      ]},
      { key: 'family', name: 'Gia đình', icon: '👪', emojis: [
        '👨‍👩‍👧','👨‍👩‍👦','👨‍👩‍👧‍👦','👪','👶','🧒','👦','👧','🧑','👨','👩','👴','👵','🤰','🤱','👨‍🍳','👩‍🍳','👨‍🎓','👩‍🎓','👨‍🏫','👩‍🏫','👨‍⚕️','👩‍⚕️','👨‍💻','👩‍💻','👮','💆','💇','🧑‍🦽','🧑‍🦯'
      ]},
      { key: 'pet', name: 'Thú cưng', icon: '🐶', emojis: [
        '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪲','🐞','🐢','🐍','🦎','🦂','🦀','🦑','🐙','🦐','🐠','🐟','🐡','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🐈','🐓','🦃','🦚','🦜','🦢','🐇','🦝','🦨','🦡','🦦','🦥'
      ]},
      { key: 'money', name: 'Tài chính', icon: '💰', emojis: [
        '💰','💸','💵','💴','💶','💷','🪙','💳','🧾','🏦','🏧','💹','📈','📉','📊','🤑','💎','🏆','🎖️','💼','📦','📨','📩','✉️','📤','📥'
      ]},
      { key: 'tools', name: 'Dụng cụ', icon: '🔧', emojis: [
        '🔧','🔨','🛠️','⚒️','🪛','🪚','⛏️','🧰','🪤','🔩','⚙️','🧲','🪜','🧱','🪣','🧹','🧺','🧽','🧼','🧴','🧻','🪥','🪒','✂️','🪡','🧵','🧶','💄','🪮','💈','🩴','🌂','☂️','🪧','🪪'
      ]},
      { key: 'nature', name: 'Thiên nhiên', icon: '🌿', emojis: [
        '🌾','🌱','🌲','🌳','🌴','🌵','🍀','🍁','🍂','🍃','🌿','☘️','🌍','🌎','🌏','🌞','🌝','🌚','🌛','🌜','⭐','🌟','💫','🌠','☄️','🪐','🌈','☁️','⛅','🌤️','🌥️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌪️','🌊','🔥','💧'
      ]},
      { key: 'symbol', name: 'Ký hiệu', icon: '⭐', emojis: [
        '✅','❌','⭕','❗','❓','💯','🔔','🔕','🔒','🔓','🔑','🗝️','⚠️','🚧','🛑','🚫','🚸','♻️','✨','⚡','🌟','💫','💥','🔆','🔅','📵','🆕','🆓','🆒','🆗','🆖','🆙','🆎','🅰️','🅱️','🆘','📛','🚩','🏁','🏳️','🏴','🏳️‍🌈','🎌'
      ]}
    ];

    // Tab mặc định: nếu icon hiện tại nằm trong nhóm nào → mở nhóm đó
    let activeGroup = EMOJI_GROUPS[0].key;
    if (initEmoji) {
      const found = EMOJI_GROUPS.find(g => g.emojis.includes(initEmoji));
      if (found) activeGroup = found.key;
    }

    container.innerHTML = `
      <div class="icon-emoji-section">
        <div class="emoji-tabs"></div>
        <div class="icon-emoji-grid"></div>
        <div class="icon-emoji-input-row">
          <label>Tự gõ:</label>
          <input type="text" placeholder="Vd: 🍜" maxlength="4" value="${this.escapeHtml(initEmoji)}">
        </div>
      </div>
    `;

    const tabsEl = container.querySelector('.emoji-tabs');
    const emojiGrid = container.querySelector('.icon-emoji-grid');
    const emojiInput = container.querySelector('.icon-emoji-input-row input');

    const setEmojiPicked = (emoji) => {
      emojiGrid.querySelectorAll('.icon-emoji-pick').forEach(x => {
        x.classList.toggle('on', x.dataset.emoji === emoji);
      });
    };

    const renderEmojiGrid = () => {
      const g = EMOJI_GROUPS.find(x => x.key === activeGroup) || EMOJI_GROUPS[0];
      emojiGrid.innerHTML = g.emojis.map(e => {
        const on = ('emoji:' + e) === opts.currentIcon;
        return `<div class="icon-emoji-pick ${on ? 'on' : ''}" data-emoji="${e}">${e}</div>`;
      }).join('');
      emojiGrid.querySelectorAll('.icon-emoji-pick').forEach(el => {
        el.onclick = () => {
          const e = el.dataset.emoji;
          opts.currentIcon = 'emoji:' + e;
          setEmojiPicked(e);
          if (emojiInput) emojiInput.value = '';
          if (opts.onPick) opts.onPick(opts.currentIcon);
        };
      });
    };

    tabsEl.innerHTML = EMOJI_GROUPS.map(g =>
      `<div class="emoji-tab ${g.key === activeGroup ? 'on' : ''}" data-key="${g.key}" title="${this.escapeHtml(g.name)}">${g.icon}</div>`
    ).join('');
    tabsEl.querySelectorAll('.emoji-tab').forEach(el => {
      el.onclick = () => {
        activeGroup = el.dataset.key;
        tabsEl.querySelectorAll('.emoji-tab').forEach(x => x.classList.toggle('on', x.dataset.key === activeGroup));
        renderEmojiGrid();
      };
    });
    renderEmojiGrid();

    if (emojiInput) {
      emojiInput.oninput = (e) => {
        const v = e.target.value.trim();
        if (v) {
          opts.currentIcon = 'emoji:' + v;
          setEmojiPicked(v);
          if (opts.onPick) opts.onPick(opts.currentIcon);
        }
      };
    }

    return { setColor: () => {} };
  },

  // ============ COLOR PICKER (12 swatch + 1 ô tuỳ chỉnh) ============
  renderColorPicker(containerId, hiddenId, initialValue, onChange) {
    const PRESETS = [
      '#2d6a4f', '#52b788', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1',
      '#a855f7', '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#f59e0b'
    ];
    const container = $('#' + containerId);
    const hidden = $('#' + hiddenId);
    if (!container || !hidden) return;

    container.innerHTML = PRESETS.map(c =>
      `<div class="color-swatch" data-color="${c}" style="background:${c}"></div>`
    ).join('') + `<div class="color-swatch custom" title="Màu tuỳ chỉnh"></div>`;

    const swatches = container.querySelectorAll('.color-swatch[data-color]');
    const customEl = container.querySelector('.color-swatch.custom');

    const setColor = (c) => {
      if (!c) return;
      const lc = c.toLowerCase();
      hidden.value = c;
      let matched = false;
      swatches.forEach(el => {
        const on = el.dataset.color.toLowerCase() === lc;
        el.classList.toggle('on', on);
        if (on) matched = true;
      });
      if (matched) {
        customEl.classList.remove('on');
        customEl.style.background = '';
      } else {
        customEl.classList.add('on');
        customEl.style.background = c;
      }
      if (onChange) onChange(c);
    };

    swatches.forEach(el => {
      el.onclick = () => setColor(el.dataset.color);
    });

    customEl.onclick = () => {
      const input = document.createElement('input');
      input.type = 'color';
      input.value = hidden.value || '#2d6a4f';
      input.style.cssText = 'position:fixed;left:-9999px;opacity:0;pointer-events:none';
      document.body.appendChild(input);
      input.oninput = () => setColor(input.value);
      input.onchange = () => { setColor(input.value); input.remove(); };
      // dọn input nếu user huỷ (không có event nào fire)
      setTimeout(() => { if (input.parentNode) input.remove(); }, 60000);
      input.click();
    };

    setColor(initialValue);
  },

  // ============ MODAL: CATEGORY ============
  openCatModal(id) {
    const isNew = !id;
    let c;
    if (isNew) {
      c = { id: null, type: this.state.catTab, name: '', icon: 'other', color: '#52b788', parentId: null, bookId: this.state.currentBookId };
    } else {
      c = this.state.categories.find(x => x.id === id);
      if (!c) return;
    }
    this.state.editingCat = { ...c };
    $('#catName').value = c.name;
    const catIconPicker = this.renderIconPicker({
      containerId: 'catIconGrid',
      currentIcon: c.icon || 'other',
      color: c.color || '#52b788',
      allowEmoji: true,
      onPick: (icon) => { this.state.editingCat.icon = icon; }
    });
    this.state._catIconPicker = catIconPicker;
    this.renderColorPicker('catColorPicker', 'catColor', c.color || '#52b788', (color) => {
      this.state.editingCat.color = color;
      catIconPicker.setColor(color);
    });
    $('#catType').value = c.type;
    $('#catTitle').textContent = isNew ? 'Tạo danh mục' : 'Sửa danh mục';
    $('#catDelete').style.display = isNew ? 'none' : 'block';

    // Populate parent dropdown — chỉ hiện danh mục cha cùng type, KHÔNG bao gồm chính nó & con của nó
    this.renderCatParentOptions();
    // Đổi type → reload parent options
    $('#catType').onchange = () => {
      this.state.editingCat.type = $('#catType').value;
      this.renderCatParentOptions();
    };

    $('#catModal').classList.add('open');
  },

  // Lọc các danh mục cha hợp lệ:
  // - cùng type với danh mục đang sửa
  // - không phải chính nó
  // - không phải đã có cha (1 level: parent KHÔNG được là child của ai khác)
  // - không có con (tránh nested 3 level)
  renderCatParentOptions() {
    const c = this.state.editingCat;
    if (!c) return;
    const type = $('#catType').value || c.type;
    const candidates = this.state.categories.filter(x =>
      x.type === type &&
      x.id !== c.id &&
      !x.parentId // chỉ category top-level mới được làm parent
    );
    const sel = $('#catParent');
    sel.innerHTML = `<option value="">— Không có (danh mục cha) —</option>` +
      candidates.map(p => `<option value="${p.id}" ${c.parentId === p.id ? 'selected' : ''}>${this.escapeHtml(p.name)}</option>`).join('');

    // Nếu mục đang sửa CÓ con → KHÔNG cho chọn parent (vì sẽ thành 3 level)
    const hasChildren = c.id && this.state.categories.some(x => x.parentId === c.id);
    if (hasChildren) {
      sel.value = '';
      sel.disabled = true;
      sel.title = 'Danh mục này đã có danh mục con — không thể làm con của ai khác';
    } else {
      sel.disabled = false;
      sel.title = '';
    }
  },

  async saveCat() {
    const c = this.state.editingCat;
    c.name = $('#catName').value.trim();
    c.color = $('#catColor').value;
    c.type = $('#catType').value;
    c.parentId = $('#catParent').value || null;
    c.bookId = c.bookId || this.state.currentBookId;
    if (!c.name) { QLT_UI.toast('Nhập tên danh mục', { type: 'error' }); return; }

    // Nếu chọn parent, đảm bảo cùng type
    if (c.parentId) {
      const parent = this.state.categories.find(x => x.id === c.parentId);
      if (parent && parent.type !== c.type) {
        QLT_UI.toast('Danh mục cha phải cùng loại (Chi/Thu)', { type: 'error' });
        return;
      }
      // Tránh đổi parent thành con của 1 cha có cha (3 level)
      if (parent && parent.parentId) {
        QLT_UI.toast('Không thể chọn danh mục cha đã là con của mục khác', { type: 'error' });
        return;
      }
      // Tránh tự làm cha của chính mình
      if (c.id === c.parentId) { c.parentId = null; }
    }

    await window.QLT_Store.put('categories', c);
    await this.reload();
    $('#catModal').classList.remove('open');
    this.renderCategories();
    this.autoSync();
  },

  async deleteCat() {
    const c = this.state.editingCat;
    if (!c.id) return;
    const used = this.state.transactions.filter(t => t.categoryId === c.id).length;
    const children = this.state.categories.filter(x => x.parentId === c.id);
    if (children.length > 0) {
      if (!await QLT_UI.confirm(`Danh mục này có ${children.length} danh mục con. Xoá sẽ chuyển các con thành danh mục cha (top-level). Tiếp tục?`, { okLabel: 'Xoá', danger: true })) return;
      // Gỡ parentId của các con
      for (const ch of children) {
        ch.parentId = null;
        await window.QLT_Store.put('categories', ch);
      }
    }
    if (used > 0) {
      if (!await QLT_UI.confirm(`Có ${used} giao dịch dùng danh mục này. Vẫn xoá?`, { okLabel: 'Xoá', danger: true })) return;
    } else if (children.length === 0) {
      if (!await QLT_UI.confirm('Xoá danh mục?', { okLabel: 'Xoá', danger: true })) return;
    }
    await window.QLT_Store.del('categories', c.id);
    await this.reload();
    $('#catModal').classList.remove('open');
    this.renderCategories();
    this.autoSync();
  },

  // ============ MODAL: ACCOUNT ============
  openAccModal(id) {
    const isNew = !id;
    let a;
    if (isNew) {
      a = {
        id: null, name: '', icon: 'cash', balance: 0, currency: 'VND',
        bookId: this.state.currentBookId,
        accountType: 'payment',
        // Savings fields (chỉ dùng nếu accountType='savings')
        interestRate: 0, termMonths: 6, startDate: today(), maturityDate: ''
      };
    } else {
      a = this.state.accounts.find(x => x.id === id);
      if (!a) return;
    }
    this.state.editingAcc = { ...a };
    const editing = this.state.editingAcc;
    if (!editing.accountType) editing.accountType = 'payment';

    $('#accName').value = a.name;
    $('#accBalance').value = fmtAmount(a.balance);
    $('#accTitle').textContent = isNew ? 'Thêm tài khoản' : 'Sửa tài khoản';
    $('#accDelete').style.display = isNew ? 'none' : 'block';
    $('#accMaturity').style.display = (!isNew && editing.accountType === 'savings') ? 'block' : 'none';

    // Type pills
    $$('.acc-type-pill').forEach(el => {
      el.classList.toggle('on', el.dataset.type === editing.accountType);
      // Không cho đổi type khi sửa (vì sẽ làm rối logic balance)
      el.style.opacity = isNew ? '1' : '0.5';
      el.style.pointerEvents = isNew ? 'auto' : 'none';
    });

    // Savings fields
    $('#accInterestRate').value = editing.interestRate || '';
    const termVal = editing.termMonths || 6;
    const standardTerms = [1, 3, 6, 9, 12, 18, 24, 36];
    if (standardTerms.includes(termVal)) {
      $('#accTermMonths').value = String(termVal);
      $('#accTermMonthsCustomWrap').style.display = 'none';
      $('#accTermMonthsCustom').value = '';
    } else {
      $('#accTermMonths').value = 'custom';
      $('#accTermMonthsCustomWrap').style.display = 'block';
      $('#accTermMonthsCustom').value = termVal;
    }
    $('#accStartDate').value = editing.startDate || today();
    $('#accMaturityDate').value = editing.maturityDate || '';

    this.applyAccountTypeUI();
    this.recalcMaturityHint();

    this.renderIconPicker({
      containerId: 'accIconGrid',
      currentIcon: a.icon || (editing.accountType === 'savings' ? 'emoji:💎' : 'cash'),
      allowEmoji: true,
      onPick: (icon) => { this.state.editingAcc.icon = icon; }
    });
    $('#accModal').classList.add('open');
  },

  applyAccountTypeUI() {
    const t = this.state.editingAcc?.accountType || 'payment';
    $('#accSavingsFields').style.display = t === 'savings' ? 'block' : 'none';
    $('#accBalanceLabel').textContent = t === 'savings' ? 'Số gốc gửi (VND)' : 'Số dư ban đầu (VND)';
  },

  // Tính ngày đáo hạn = startDate + termMonths
  computeMaturityDate(startDate, termMonths) {
    if (!startDate || !termMonths) return '';
    const d = new Date(startDate + 'T00:00:00');
    d.setMonth(d.getMonth() + parseInt(termMonths, 10));
    return d.toISOString().slice(0, 10);
  },

  // Đọc termMonths hiện tại từ form (xử lý 'custom')
  readTermMonths() {
    const sel = $('#accTermMonths').value;
    if (sel === 'custom') return parseInt($('#accTermMonthsCustom').value, 10) || 0;
    return parseInt(sel, 10) || 0;
  },

  // Cập nhật maturityDate input + hint dự kiến
  recalcMaturityHint() {
    const e = this.state.editingAcc;
    if (!e || e.accountType !== 'savings') return;
    const start = $('#accStartDate').value || today();
    const term = this.readTermMonths();
    const auto = this.computeMaturityDate(start, term);
    // Auto-fill maturityDate nếu chưa có hoặc match với auto cũ
    const cur = $('#accMaturityDate').value;
    if (!cur || cur === e.maturityDate) {
      $('#accMaturityDate').value = auto;
    }
    // Hint: lãi dự kiến + ngày đáo hạn
    const rate = parseFloat($('#accInterestRate').value) || 0;
    const principal = readAmount($('#accBalance'));
    const interest = Math.round(principal * (rate / 100) * (term / 12));
    const due = $('#accMaturityDate').value || auto;
    const hint = $('#accMaturityHint');
    if (principal > 0 && rate > 0 && term > 0) {
      hint.innerHTML = `📊 Lãi dự kiến: <strong>${fmt(interest)} đ</strong> · Tổng nhận khi đáo hạn: <strong>${fmt(principal + interest)} đ</strong> (ngày ${this.formatDate(due)})`;
    } else {
      hint.innerHTML = `📅 Ngày đáo hạn dự kiến: <strong>${this.formatDate(due)}</strong>`;
    }
  },

  async saveAcc() {
    const a = this.state.editingAcc;
    a.name = $('#accName').value.trim();
    a.balance = readAmount($('#accBalance'));
    a.bookId = a.bookId || this.state.currentBookId;
    if (!a.name) { QLT_UI.toast('Nhập tên tài khoản', { type: 'error' }); return; }

    if (a.accountType === 'savings') {
      a.interestRate = parseFloat($('#accInterestRate').value) || 0;
      a.termMonths = this.readTermMonths();
      a.startDate = $('#accStartDate').value || today();
      a.maturityDate = $('#accMaturityDate').value || this.computeMaturityDate(a.startDate, a.termMonths);
      if (a.balance <= 0) { QLT_UI.toast('Vui lòng nhập số gốc gửi', { type: 'error' }); return; }
      if (!a.maturityDate) { QLT_UI.toast('Vui lòng đặt ngày đáo hạn', { type: 'error' }); return; }
    }

    await window.QLT_Store.put('accounts', a);
    await this.reload();

    // Schedule notif đáo hạn (cho savings)
    if (a.accountType === 'savings' && a.maturityDate) {
      try { await this.scheduleMaturityNotif(a); } catch (_) {}
    }

    $('#accModal').classList.remove('open');
    this.renderAccounts();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
  },

  async deleteAcc() {
    const a = this.state.editingAcc;
    if (!a.id) return;
    const used = this.state.transactions.filter(t => t.accountId === a.id || t.toAccountId === a.id).length;
    if (used > 0) {
      await QLT_UI.alert(`Không xoá được, có ${used} giao dịch đang dùng tài khoản này`, { title: 'Không thể xoá' });
      return;
    }
    if (!await QLT_UI.confirm('Xoá tài khoản?', { okLabel: 'Xoá', danger: true })) return;
    // Cancel notif nếu có
    if (a.accountType === 'savings' && window.Capacitor?.Plugins?.LocalNotifications) {
      try {
        const idNum = Math.abs(this.hashCode('savings_' + a.id)) % 2000000;
        await window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: idNum }] });
      } catch (_) {}
    }
    await window.QLT_Store.del('accounts', a.id);
    await this.reload();
    $('#accModal').classList.remove('open');
    this.renderAccounts();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
  },

  // Notification: nhắc 3 ngày trước ngày đáo hạn (9h sáng)
  async scheduleMaturityNotif(acc) {
    if (!window.Capacitor?.Plugins?.LocalNotifications) return;
    const LN = window.Capacitor.Plugins.LocalNotifications;
    try {
      await LN.requestPermissions();
      const idNum = Math.abs(this.hashCode('savings_' + acc.id)) % 2000000;
      try { await LN.cancel({ notifications: [{ id: idNum }] }); } catch (_) {}

      const due = new Date(acc.maturityDate + 'T09:00:00');
      const notifAt = new Date(due); notifAt.setDate(notifAt.getDate() - 3);
      if (notifAt.getTime() < Date.now()) return;

      const interest = Math.round((acc.balance || 0) * ((acc.interestRate || 0) / 100) * ((acc.termMonths || 0) / 12));
      await LN.schedule({
        notifications: [{
          id: idNum,
          title: `📅 Sổ TK "${acc.name}" sắp đáo hạn`,
          body: `Còn 3 ngày — gốc ${fmt(acc.balance)} đ + lãi dự kiến ${fmt(interest)} đ`,
          schedule: { at: notifAt },
          sound: 'default'
        }]
      });
    } catch (e) { console.warn('Maturity notif lỗi:', e); }
  },

  // ============ ĐÁO HẠN SỔ TIẾT KIỆM ============
  async openMaturityModal() {
    const acc = this.state.editingAcc;
    if (!acc?.id || acc.accountType !== 'savings') return;

    const interest = Math.round((acc.balance || 0) * ((acc.interestRate || 0) / 100) * ((acc.termMonths || 0) / 12));

    $('#maturityInfo').innerHTML = `
      <div><strong>${this.escapeHtml(acc.name)}</strong></div>
      <div style="color:var(--text2)">Gốc: <strong>${fmt(acc.balance)} đ</strong> · Lãi suất: ${acc.interestRate}%/năm · Kỳ hạn: ${acc.termMonths} tháng</div>
      <div style="color:var(--text2)">Ngày gửi: ${this.formatDate(acc.startDate)} → Đáo hạn: ${this.formatDate(acc.maturityDate)}</div>
    `;

    $('#maturityInterest').value = fmt(interest);

    // Ví đích: chỉ payment accounts
    const payAccs = this.state.accounts.filter(x => (x.accountType || 'payment') === 'payment');
    $('#maturityToAccount').innerHTML = payAccs.map(a =>
      `<option value="${a.id}">${this.escapeHtml(a.name)}</option>`
    ).join('');

    // Danh mục thu nhập (lọc category type=income)
    const incCats = this.state.categories.filter(c => c.type === 'income');
    $('#maturityCategory').innerHTML = incCats.map(c =>
      `<option value="${c.id}" ${c.name === 'Đầu tư' ? 'selected' : ''}>${this.escapeHtml(c.name)}</option>`
    ).join('');

    $('#maturityDate').value = today();

    $('#maturityModal').classList.add('open');
  },

  async confirmMaturity() {
    const acc = this.state.editingAcc;
    if (!acc?.id) return;
    const interest = readAmount($('#maturityInterest'));
    const toAccId = $('#maturityToAccount').value;
    const catId = $('#maturityCategory').value;
    const date = $('#maturityDate').value || today();

    if (!toAccId) { QLT_UI.toast('Chọn ví nhận tiền', { type: 'error' }); return; }
    if (!catId) { QLT_UI.toast('Chọn danh mục thu nhập cho lãi', { type: 'error' }); return; }
    if (interest < 0) { QLT_UI.toast('Lãi không hợp lệ', { type: 'error' }); return; }

    const principal = acc.balance || 0;

    // 1) Tạo giao dịch CHUYỂN KHOẢN gốc: từ savings → payment account
    const txTransfer = {
      type: 'transfer',
      amount: principal,
      date,
      accountId: acc.id,
      toAccountId: toAccId,
      categoryId: null,
      note: `Đáo hạn sổ ${acc.name} — chuyển gốc`,
      bookId: this.state.currentBookId
    };
    // Cập nhật balance: savings -principal, payment +principal
    await this.applyBalanceDelta(txTransfer, +1);
    await window.QLT_Store.put('transactions', txTransfer);

    // 2) Tạo giao dịch THU NHẬP cho lãi (nếu > 0)
    if (interest > 0) {
      const txIncome = {
        type: 'income',
        amount: interest,
        date,
        accountId: toAccId,
        categoryId: catId,
        note: `Lãi sổ ${acc.name}`,
        bookId: this.state.currentBookId
      };
      await this.applyBalanceDelta(txIncome, +1);
      await window.QLT_Store.put('transactions', txIncome);
    }

    // 3) Xoá tài khoản savings (số dư đã = 0 sau transfer)
    if (window.Capacitor?.Plugins?.LocalNotifications) {
      try {
        const idNum = Math.abs(this.hashCode('savings_' + acc.id)) % 2000000;
        await window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: idNum }] });
      } catch (_) {}
    }
    await window.QLT_Store.del('accounts', acc.id);

    await this.reload();
    $('#maturityModal').classList.remove('open');
    $('#accModal').classList.remove('open');
    this.renderAccounts();
    if (this.state.currentTab === 'home') this.renderHome();
    this.autoSync();
    QLT_UI.toast(`Đáo hạn xong: nhận ${fmt(principal + interest)} đ`, { type: 'success' });
  },

  // ============ MODAL: REMINDER ============
  openReminderModal(id) {
    const isNew = !id;
    let r;
    if (isNew) {
      r = {
        id: null, name: '', type: 'expense', frequency: 'monthly',
        startDate: today(), time: '09:00', endDate: '',
        accountId: this.state.accounts[0]?.id || null,
        categoryId: null, amount: 0, note: '', autoAdd: false,
        bookId: this.state.currentBookId
      };
    } else {
      r = this.state.reminders.find(x => x.id === id);
      if (!r) return;
    }
    this.state.editingReminder = { ...r };
    $('#remName').value = r.name;
    $('#remType').value = r.type;
    $('#remFreq').value = r.frequency;
    $('#remStart').value = r.startDate;
    $('#remTime').value = r.time;
    $('#remEnd').value = r.endDate || '';
    $('#remAuto').checked = !!r.autoAdd;
    $('#remAmount').value = fmtAmount(r.amount);
    $('#remNote').value = r.note || '';
    $('#remTitle').textContent = isNew ? 'Tạo lời nhắc' : 'Sửa lời nhắc';
    $('#remDelete').style.display = isNew ? 'none' : 'block';

    const renderRemCat = () => {
      const cats = this.state.categories.filter(c => c.type === $('#remType').value);
      $('#remCatList').innerHTML = cats.map(c => `
        <div class="picker-item ${c.id === r.categoryId ? 'on' : ''}" data-cat="${c.id}">
          <span class="picker-icon" style="color:${c.color}">${svgIcon(c.icon)}</span>
          <span>${this.escapeHtml(c.name)}</span>
        </div>
      `).join('');
      $$('#remCatList .picker-item').forEach(el => {
        el.onclick = () => {
          $$('#remCatList .picker-item').forEach(x => x.classList.remove('on'));
          el.classList.add('on');
          this.state.editingReminder.categoryId = el.dataset.cat;
        };
      });
    };
    renderRemCat();
    $('#remType').onchange = () => renderRemCat();

    $('#remAccountList').innerHTML = this.state.accounts.map(a => `
      <div class="picker-item ${a.id === r.accountId ? 'on' : ''}" data-acc="${a.id}">
        <span class="picker-icon" style="color:#2d6a4f">${svgIcon(a.icon || 'cash')}</span>
        <span>${this.escapeHtml(a.name)}</span>
      </div>
    `).join('');
    $$('#remAccountList .picker-item').forEach(el => {
      el.onclick = () => {
        $$('#remAccountList .picker-item').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.editingReminder.accountId = el.dataset.acc;
      };
    });

    $('#remModal').classList.add('open');
  },

  async saveReminder() {
    const r = this.state.editingReminder;
    r.name = $('#remName').value.trim();
    r.type = $('#remType').value;
    r.frequency = $('#remFreq').value;
    r.startDate = $('#remStart').value;
    r.time = $('#remTime').value;
    r.endDate = $('#remEnd').value || '';
    r.autoAdd = $('#remAuto').checked;
    r.amount = readAmount($('#remAmount'));
    r.note = $('#remNote').value;
    r.bookId = r.bookId || this.state.currentBookId;
    if (!r.name) { QLT_UI.toast('Nhập tên lời nhắc', { type: 'error' }); return; }
    if (!r.categoryId) { QLT_UI.toast('Chọn danh mục', { type: 'error' }); return; }
    if (!r.accountId) { QLT_UI.toast('Chọn tài khoản', { type: 'error' }); return; }
    await window.QLT_Store.put('reminders', r);
    await this.reload();
    await this.scheduleReminderNotif(r);
    $('#remModal').classList.remove('open');
    this.renderReminders();
    this.autoSync();
  },

  async deleteReminder() {
    const r = this.state.editingReminder;
    if (!r.id) return;
    if (!await QLT_UI.confirm('Xoá lời nhắc?', { okLabel: 'Xoá', danger: true })) return;
    await window.QLT_Store.del('reminders', r.id);
    if (window.Capacitor?.Plugins?.LocalNotifications) {
      try {
        const idNum = Math.abs(this.hashCode(r.id)) % 2000000;
        await window.Capacitor.Plugins.LocalNotifications.cancel({ notifications: [{ id: idNum }] });
      } catch (_) {}
    }
    await this.reload();
    $('#remModal').classList.remove('open');
    this.renderReminders();
    this.autoSync();
  },

  hashCode(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return h;
  },

  async scheduleReminderNotif(r) {
    if (!window.Capacitor?.Plugins?.LocalNotifications) return;
    const LN = window.Capacitor.Plugins.LocalNotifications;
    try {
      await LN.requestPermissions();
      const idNum = Math.abs(this.hashCode(r.id)) % 2000000;
      const [hh, mm] = (r.time || '09:00').split(':').map(Number);
      const schedule = { on: { hour: hh, minute: mm } };
      if (r.frequency === 'daily') schedule.every = 'day';
      else if (r.frequency === 'weekly') schedule.every = 'week';
      else if (r.frequency === 'monthly') schedule.every = 'month';
      else if (r.frequency === 'yearly') schedule.every = 'year';

      await LN.schedule({
        notifications: [{
          id: idNum,
          title: 'Quản Lý Tiền — ' + r.name,
          body: `${r.type === 'income' ? 'Thu' : 'Chi'} ${fmt(r.amount)} đ${r.note ? ' · ' + r.note : ''}`,
          schedule,
          sound: 'default'
        }]
      });
    } catch (e) { console.warn('Schedule lỗi:', e); }
  },

  // ============ AUTH / SYNC ============
  async doLogin() {
    try {
      await window.QLT_Auth.signIn();
      QLT_UI.toast('Đăng nhập thành công! Đang tải dữ liệu...', { type: 'success' });
    } catch (e) {
      QLT_UI.alert('Đăng nhập lỗi: ' + e.message + '\n\nĐã cấu hình GOOGLE_CLIENT_ID trong www/js/config.js chưa?', { title: 'Lỗi đăng nhập' });
    }
  },

  async doLogout() {
    if (!await QLT_UI.confirm('Đăng xuất? Dữ liệu vẫn được lưu trên Drive.', { okLabel: 'Đăng xuất' })) return;
    window.QLT_Auth.signOut();
  },

  async doSync() {
    if (!window.QLT_Auth.user) { QLT_UI.toast('Đăng nhập trước', { type: 'error' }); return; }
    try {
      await window.QLT_Sync.smartSync();
      await this.reload();
      this.switchTab(this.state.currentTab);
      QLT_UI.toast('Đồng bộ thành công', { type: 'success' });
    } catch (e) {
      QLT_UI.alert('Đồng bộ lỗi: ' + e.message, { title: 'Lỗi đồng bộ' });
    }
  },

  _syncTimer: null,
  autoSync() {
    if (!window.QLT_Auth.user) return;
    clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(async () => {
      try { await window.QLT_Sync.pushNow(); } catch (e) { console.warn('Auto-sync lỗi:', e); }
    }, 3000);
  },

  async doExport() {
    const data = await window.QLT_Store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quanlytien-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  doImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!await QLT_UI.confirm('Ghi đè toàn bộ dữ liệu hiện tại?', { okLabel: 'Ghi đè', danger: true })) return;
        await window.QLT_Store.importAll(data, 'replace');
        await this.reload();
        this.switchTab(this.state.currentTab);
        QLT_UI.toast('Nhập dữ liệu thành công', { type: 'success' });
      } catch (err) {
        QLT_UI.alert('File không hợp lệ: ' + err.message, { title: 'Lỗi' });
      }
    };
    input.click();
  },

  // ============ BOOKS ============
  openBookList() {
    const list = $('#bookList');
    list.innerHTML = this.state.books.map(b => `
      <div class="book-item ${b.id === this.state.currentBookId ? 'on' : ''}" data-book="${b.id}">
        <div class="tx-icon" style="background:${b.color || '#2d6a4f'};color:#fff">
          ${svgIcon(b.icon || 'wallet')}
        </div>
        <div class="tx-info">
          <div class="tx-cat">${this.escapeHtml(b.name)}</div>
          <div class="tx-meta">${b.id === this.state.currentBookId ? 'Đang dùng' : 'Bấm để chuyển'}</div>
        </div>
        <button class="book-edit-btn" data-edit="${b.id}" title="Sửa">${svgIcon('edit')}</button>
      </div>
    `).join('');
    list.querySelectorAll('[data-book]').forEach(el => {
      el.onclick = async (e) => {
        if (e.target.closest('[data-edit]')) return;
        const id = el.dataset.book;
        if (id !== this.state.currentBookId) {
          await this.switchBook(id);
        }
        $('#bookModal').classList.remove('open');
      };
    });
    list.querySelectorAll('[data-edit]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        this.openBookEdit(el.dataset.edit);
      };
    });
    $('#bookModal').classList.add('open');
  },

  openBookEdit(id) {
    const isNew = !id;
    let b;
    if (isNew) {
      b = { id: null, name: '', icon: 'wallet', color: '#2d6a4f', members: [] };
    } else {
      b = this.state.books.find(x => x.id === id);
      if (!b) return;
    }
    this.state.editingBook = JSON.parse(JSON.stringify(b));
    this.state.editingBook.members = this.state.editingBook.members || [];
    this.state._origMembers = JSON.parse(JSON.stringify(this.state.editingBook.members));
    $('#bookName').value = b.name;
    this.renderColorPicker('bookColorPicker', 'bookColor', b.color || '#2d6a4f', (color) => {
      this.state.editingBook.color = color;
    });
    $('#bookEditTitle').textContent = isNew ? 'Tạo sổ mới' : 'Sửa sổ';
    $('#bookDelete').style.display = (isNew || this.state.books.length <= 1) ? 'none' : 'block';
    $('#bookExportSection').style.display = isNew ? 'none' : 'block';
    $('#bookMembersSection').style.display = isNew ? 'none' : 'block';

    this.renderIconPicker({
      containerId: 'bookIconGrid',
      currentIcon: b.icon || 'wallet',
      allowEmoji: true,
      onPick: (icon) => { this.state.editingBook.icon = icon; }
    });
    this.renderBookMembers();
    $('#bookEditModal').classList.add('open');
  },

  renderBookMembers() {
    const wrap = $('#bookMembersList');
    if (!wrap) return;
    const members = this.state.editingBook?.members || [];

    const totalEl = $('#bookMembersTotal');
    if (totalEl) {
      const total = members.reduce((s, m) => s + (m.contribution || 0), 0);
      if (members.length > 0) {
        totalEl.style.display = 'flex';
        totalEl.innerHTML = `<span>${members.length} thành viên</span><span>Tổng quỹ: ${fmt(total)}đ</span>`;
      } else {
        totalEl.style.display = 'none';
      }
    }

    if (members.length === 0) {
      wrap.innerHTML = '<div style="text-align:center;padding:14px;color:var(--text3);font-size:12px;border:1.5px dashed var(--border);border-radius:var(--rsm)">Chưa có thành viên — bấm <strong>Thêm 1 người</strong> hoặc <strong>Thêm nhiều</strong></div>';
      return;
    }
    wrap.innerHTML = members.map((m, i) => `
      <div class="member-row" data-idx="${i}">
        <span class="member-num">${i + 1}</span>
        <input class="fi member-name" placeholder="Tên người ${i + 1}" value="${this.escapeHtml(m.name || '')}">
        <input class="fi member-amount qlt-amount" inputmode="numeric" placeholder="Tiền góp" value="${fmtAmount(m.contribution)}">
        <button class="member-del" type="button" title="Xoá">${svgIcon('close')}</button>
      </div>
    `).join('');
    wrap.querySelectorAll('.member-row').forEach(row => {
      const idx = parseInt(row.dataset.idx);
      const nameEl = row.querySelector('.member-name');
      const amtEl = row.querySelector('.member-amount');
      attachAmountFormatting(amtEl);
      nameEl.oninput = () => { members[idx].name = nameEl.value; };
      amtEl.oninput = () => {
        members[idx].contribution = readAmount(amtEl);
        // Cập nhật tổng quỹ ở trên
        const total = members.reduce((s, m) => s + (m.contribution || 0), 0);
        if (totalEl) totalEl.innerHTML = `<span>${members.length} thành viên</span><span>Tổng quỹ: ${fmt(total)}đ</span>`;
      };
      row.querySelector('.member-del').onclick = () => {
        members.splice(idx, 1);
        this.renderBookMembers();
      };
    });
  },

  addManyMembers() {
    $('#addManyCount').value = 8;
    $('#addManyAmount').value = '';
    $('#addManyModal').classList.add('open');
    setTimeout(() => $('#addManyCount').focus(), 100);
  },

  confirmAddMany() {
    const count = parseInt($('#addManyCount').value, 10);
    if (!Number.isFinite(count) || count < 1 || count > 50) {
      QLT_UI.toast('Số người không hợp lệ (1-50)', { type: 'error' });
      return;
    }
    const same = readAmount($('#addManyAmount'));

    this.state.editingBook.members = this.state.editingBook.members || [];
    for (let i = 0; i < count; i++) {
      this.state.editingBook.members.push({
        id: 'm_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 5),
        name: '',
        contribution: same || 0
      });
    }
    this.renderBookMembers();
    $('#addManyModal').classList.remove('open');
  },

  addBookMember() {
    if (!this.state.editingBook) return;
    this.state.editingBook.members = this.state.editingBook.members || [];
    this.state.editingBook.members.push({
      id: 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      name: '', contribution: 0
    });
    this.renderBookMembers();
  },

  async ensureFundCategory(bookId) {
    const all = await window.QLT_Store.getAll('categories');
    let cat = all.find(c => c.bookId === bookId && c._fundCategory);
    if (!cat) {
      cat = await window.QLT_Store.put('categories', {
        type: 'income',
        name: 'Đóng quỹ',
        icon: 'piggy',
        color: '#f4b942',
        bookId,
        _fundCategory: true
      });
    }
    return cat;
  },

  async syncMemberTransactions(bookId, currentMembers, origMembers) {
    const allAccs = await window.QLT_Store.getAll('accounts');
    const accId = (allAccs.find(a => a.bookId === bookId))?.id;
    if (!accId) return;
    const cat = await this.ensureFundCategory(bookId);

    // Xử lý members đã bị xoá
    const currentIds = new Set(currentMembers.map(m => m.id));
    const removed = origMembers.filter(m => !currentIds.has(m.id));
    for (const m of removed) {
      if (m.txId) {
        const tx = await window.QLT_Store.get('transactions', m.txId);
        if (tx) {
          const acc = (await window.QLT_Store.getAll('accounts')).find(a => a.id === tx.accountId);
          if (acc) {
            acc.balance -= tx.amount;
            await window.QLT_Store.put('accounts', acc);
          }
          await window.QLT_Store.del('transactions', m.txId);
        }
      }
    }

    // Sync existing/new members
    for (const m of currentMembers) {
      const contrib = m.contribution || 0;
      if (m.txId) {
        const tx = await window.QLT_Store.get('transactions', m.txId);
        if (tx) {
          const delta = contrib - tx.amount;
          const newNote = `${m.name || 'Thành viên'} đóng quỹ`;
          if (delta !== 0 || tx.note !== newNote) {
            tx.amount = contrib;
            tx.note = newNote;
            await window.QLT_Store.put('transactions', tx);
            if (delta !== 0) {
              const acc = (await window.QLT_Store.getAll('accounts')).find(a => a.id === tx.accountId);
              if (acc) {
                acc.balance += delta;
                await window.QLT_Store.put('accounts', acc);
              }
            }
          }
          continue;
        } else {
          m.txId = null;
        }
      }
      if (!m.txId && contrib > 0) {
        const tx = await window.QLT_Store.put('transactions', {
          type: 'income',
          amount: contrib,
          date: today(),
          accountId: accId,
          categoryId: cat.id,
          note: `${m.name || 'Thành viên'} đóng quỹ`,
          bookId,
          memberId: m.id
        });
        m.txId = tx.id;
        const acc = (await window.QLT_Store.getAll('accounts')).find(a => a.id === accId);
        if (acc) {
          acc.balance += contrib;
          await window.QLT_Store.put('accounts', acc);
        }
      }
    }
  },

  async calculateSettlement(bookId) {
    const book = (await window.QLT_Store.getAll('books')).find(b => b.id === bookId);
    if (!book) return null;
    const members = (book.members || []).filter(m => (m.name && m.name.trim()) || (m.contribution || 0) > 0);
    if (members.length === 0) return null;

    const allTxs = await window.QLT_Store.getAll('transactions');
    const expenses = allTxs.filter(t => t.bookId === bookId && t.type === 'expense');
    const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
    const totalContrib = members.reduce((s, m) => s + (m.contribution || 0), 0);
    const n = members.length;
    const allMemberIds = members.map(m => m.id);

    // Phần dùng từng người: cộng dồn theo từng giao dịch chỉ tính cho người tham gia
    const shareByMember = {};
    members.forEach(m => { shareByMember[m.id] = 0; });

    for (const t of expenses) {
      let parts = Array.isArray(t.participantIds) ? t.participantIds.filter(id => allMemberIds.includes(id)) : null;
      if (!parts || parts.length === 0) parts = allMemberIds; // null/empty → cả nhóm chia
      const per = t.amount / parts.length;
      for (const id of parts) shareByMember[id] = (shareByMember[id] || 0) + per;
    }

    const rows = members.map(m => {
      const share = shareByMember[m.id] || 0;
      const balance = (m.contribution || 0) - share;
      return {
        id: m.id,
        name: m.name || 'Chưa đặt tên',
        contribution: m.contribution || 0,
        share,
        balance,
        action: balance > 0.5 ? 'refund' : balance < -0.5 ? 'pay' : 'even'
      };
    });

    // Cảnh báo: số giao dịch có chọn người riêng (≠ cả nhóm)
    const customCount = expenses.filter(t => Array.isArray(t.participantIds) && t.participantIds.length > 0 && t.participantIds.length < n).length;

    // Khi tổng góp lệch tổng chi, tính trung bình cho riêng nhóm cần đóng / cần nhận
    const surplus = totalContrib - totalExpense;
    const payers = rows.filter(r => r.action === 'pay');
    const receivers = rows.filter(r => r.action === 'refund');
    const avgPay = payers.length ? payers.reduce((s, r) => s + Math.abs(r.balance), 0) / payers.length : 0;
    const avgRefund = receivers.length ? receivers.reduce((s, r) => s + r.balance, 0) / receivers.length : 0;
    const perPerson = n > 0 ? totalExpense / n : 0; // chỉ để tham khảo

    return {
      book, totalExpense, totalContrib, perPerson, surplus, n, rows, customCount,
      payerCount: payers.length, receiverCount: receivers.length, avgPay, avgRefund
    };
  },

  async saveBook() {
    const b = this.state.editingBook;
    const isNew = !b.id;
    b.name = $('#bookName').value.trim();
    b.color = $('#bookColor').value;
    if (!b.name) { QLT_UI.toast('Nhập tên sổ', { type: 'error' }); return; }
    // Loại member rỗng hoàn toàn (không tên + không tiền)
    b.members = (b.members || []).filter(m => (m.name && m.name.trim()) || (m.contribution || 0) > 0);

    const saved = await window.QLT_Store.put('books', b);
    if (isNew) {
      await window.QLT_Store.populateBookDefaults(saved.id);
      window.QLT_Store.setCurrentBookId(saved.id);
    }
    // Sync members ↔ giao dịch đóng quỹ
    if (!isNew) {
      await this.syncMemberTransactions(saved.id, saved.members, this.state._origMembers || []);
      await window.QLT_Store.put('books', saved);
    }
    await this.reload();
    $('#bookEditModal').classList.remove('open');
    $('#bookModal').classList.remove('open');
    this.renderBookHeader();
    this.switchTab('home');
    this.autoSync();
  },

  // ============ EXPORT BOOK ============
  async exportBookHTML(bookId, includeSettlement = false, includePhotos = false) {
    const book = this.state.books.find(b => b.id === bookId);
    if (!book) return null;
    const html = await this._buildBookReportHTML(bookId, includeSettlement, includePhotos);
    if (!html) return null;
    const suffix = includeSettlement ? 'ket-thuc' : 'trong-dot';
    this._download(html, `qlt-${this._safe(book.name)}-${suffix}-${today()}.html`, 'text/html;charset=utf-8');
    return html;
  },

  async _buildBookReportHTML(bookId, includeSettlement = false, includePhotos = false) {
    const book = this.state.books.find(b => b.id === bookId);
    if (!book) return;
    const allTxs = (await window.QLT_Store.getAll('transactions')).filter(t => t.bookId === bookId);
    const allCats = (await window.QLT_Store.getAll('categories')).filter(c => c.bookId === bookId);
    const allAccs = (await window.QLT_Store.getAll('accounts')).filter(a => a.bookId === bookId);
    const cat = id => allCats.find(c => c.id === id) || {};
    const acc = id => allAccs.find(a => a.id === id) || {};

    const totIn = allTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totOut = allTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const totBal = allAccs.reduce((s, a) => s + (a.balance || 0), 0);

    // Lọc giao dịch "đóng quỹ" (do app tự sinh từ thành viên) khỏi danh sách chi tiết — đã có trong khối Quyết toán
    const isFundTx = t => !!t.memberId;
    let detailTxs = allTxs.filter(t => !isFundTx(t));
    if (!includePhotos) detailTxs = detailTxs.map(t => ({ ...t, photo: null }));
    const groups = {};
    for (const t of detailTxs) (groups[t.date] = groups[t.date] || []).push(t);
    const dates = Object.keys(groups).sort().reverse();

    const expByCat = {};
    for (const t of allTxs) {
      if (t.type !== 'expense') continue;
      expByCat[t.categoryId] = (expByCat[t.categoryId] || 0) + t.amount;
    }
    const breakdown = Object.entries(expByCat).map(([cid, val]) => ({
      cat: cat(cid),
      value: val,
      pct: totOut > 0 ? (val / totOut * 100).toFixed(1) : '0'
    })).sort((a, b) => b.value - a.value);

    const exportedAt = new Date().toLocaleString('vi-VN');
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const settlement = includeSettlement ? await this.calculateSettlement(bookId) : null;
    const reportType = includeSettlement ? 'KẾT THÚC – có quyết toán' : 'TRONG ĐỢT (chưa chốt)';

    const photoCell = t => includePhotos
      ? `<td class="tx-photo">${t.photo ? `<a href="${t.photo}" target="_blank"><img src="${t.photo}" alt=""></a>` : ''}</td>`
      : '';
    // Số thành viên trong sổ (để hiện badge "5/8 người" cho GD chia riêng)
    const bookMembers = (book.members || []).filter(m => m.name && m.name.trim());
    const memById = Object.fromEntries(bookMembers.map(m => [m.id, m.name]));
    const partBadge = t => {
      if (t.type !== 'expense' || !Array.isArray(t.participantIds) || t.participantIds.length === 0 || t.participantIds.length === bookMembers.length) return '';
      const names = t.participantIds.map(id => memById[id]).filter(Boolean).join(', ');
      return `<div style="display:inline-block;background:#fff8e0;border:1px solid #f4d77c;color:#856404;padding:1px 8px;border-radius:10px;font-size:11px;font-style:normal;margin-left:6px" title="${esc(names)}">${t.participantIds.length}/${bookMembers.length} người</div>`;
    };
    const txRow = t => {
      if (t.type === 'transfer') {
        const fromN = esc((acc(t.accountId)).name || '');
        const toN = esc((acc(t.toAccountId)).name || '');
        return `
          <tr class="tx-row tx-transfer">
            <td class="tx-cat">↻ Chuyển tiền</td>
            <td class="tx-acc">${fromN} → ${toN}</td>
            <td class="tx-note">${esc(t.note || '')}</td>
            <td class="tx-amt transfer">${fmt(t.amount)}đ</td>
            ${photoCell(t)}
          </tr>
        `;
      }
      const c = cat(t.categoryId);
      const a = acc(t.accountId);
      const sign = t.type === 'income' ? '+' : '-';
      const cls = t.type === 'income' ? 'pos' : 'neg';
      return `
        <tr class="tx-row">
          <td class="tx-cat" style="border-left:4px solid ${esc(c.color || '#888')}">${esc(c.name || '')}</td>
          <td class="tx-acc">${esc(a.name || '')}</td>
          <td class="tx-note">${esc(t.note || '')}${partBadge(t)}</td>
          <td class="tx-amt ${cls}">${sign}${fmt(t.amount)}đ</td>
          ${photoCell(t)}
        </tr>
      `;
    };

    const fmtDate = d => {
      if (!d) return '';
      const [y, m, day] = d.split('-');
      return `${day}/${m}/${y}`;
    };

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sổ ${esc(book.name)} — Báo cáo</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI','Roboto','DM Sans',sans-serif;background:#f2f5f0;color:#1a2a1f;line-height:1.5;padding:16px}
.report{max-width:900px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08)}
header{background:linear-gradient(135deg,${esc(book.color || '#2d6a4f')},#52b788);color:#fff;padding:24px}
header h1{font-size:24px;margin-bottom:4px}
.meta{font-size:13px;opacity:.92}
.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;padding:16px}
.card{background:#f8faf7;border:1px solid #e0e6dc;border-radius:10px;padding:14px}
.card .lbl{font-size:11px;color:#5e6b62;text-transform:uppercase;letter-spacing:.5px;font-weight:700}
.card .val{font-size:20px;font-weight:700;margin-top:4px}
.val.pos{color:#2d8659}.val.neg{color:#e63946}
section{padding:0 16px 18px}
h2{font-size:15px;font-weight:700;color:#2d6a4f;margin:8px 0 10px;padding:8px 0;border-bottom:2px solid #2d6a4f}
table{width:100%;border-collapse:collapse;font-size:13px}
table th{text-align:left;font-weight:600;color:#5e6b62;padding:10px 8px;border-bottom:1px solid #e0e6dc;background:#f8faf7}
table td{padding:10px 8px;border-bottom:1px solid #f0eee8;vertical-align:top}
.day-block{margin-bottom:14px}
.day-head{display:flex;justify-content:space-between;align-items:center;background:#e8f5ee;color:#2d6a4f;padding:8px 12px;border-radius:8px;font-weight:600;margin-bottom:6px;font-size:13px}
.day-totals{display:flex;gap:12px;font-size:12px}
.tx-row .tx-cat{font-weight:600;padding-left:10px}
.tx-row .tx-acc{color:#5e6b62;font-size:12px}
.tx-row .tx-note{color:#5e6b62;font-size:12px;font-style:italic}
.tx-row .tx-amt{text-align:right;font-weight:700;white-space:nowrap}
.tx-amt.pos{color:#2d8659}.tx-amt.neg{color:#e63946}.tx-amt.transfer{color:#4f86c6}
.tx-photo img{width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid #e0e6dc;cursor:zoom-in}
footer{padding:16px;color:#9aa39c;font-size:11px;text-align:center;border-top:1px solid #e0e6dc}
@media print{body{background:#fff;padding:0}.report{box-shadow:none}}
</style>
</head>
<body>
<div class="report">
  <header>
    <h1>${esc(book.name)}</h1>
    <div class="meta">Báo cáo xuất ${exportedAt} · ${allTxs.length} giao dịch</div>
    <div class="meta" style="margin-top:6px;display:inline-block;background:rgba(255,255,255,.18);padding:3px 10px;border-radius:12px;font-weight:600;font-size:11px;letter-spacing:.5px">${reportType}</div>
  </header>
  <section>
    <div class="summary">
      <div class="card"><div class="lbl">Tổng thu</div><div class="val pos">+${fmt(totIn)}đ</div></div>
      <div class="card"><div class="lbl">Tổng chi</div><div class="val neg">-${fmt(totOut)}đ</div></div>
      <div class="card"><div class="lbl">Chênh lệch</div><div class="val ${totIn - totOut >= 0 ? 'pos' : 'neg'}">${totIn - totOut >= 0 ? '+' : ''}${fmt(totIn - totOut)}đ</div></div>
      <div class="card"><div class="lbl">Số dư ví hiện tại</div><div class="val">${fmt(totBal)}đ</div></div>
    </div>
  </section>
  ${allAccs.length ? `
  <section>
    <h2>Số dư các ví</h2>
    <table>
      <tr><th>Ví</th><th style="text-align:right">Số dư</th></tr>
      ${allAccs.map(a => `<tr><td>${esc(a.name)}</td><td style="text-align:right;font-weight:700;${(a.balance || 0) < 0 ? 'color:#e63946' : ''}">${fmt(a.balance || 0)}đ</td></tr>`).join('')}
    </table>
  </section>` : ''}
  ${breakdown.length ? `
  <section>
    <h2>Chi tiêu theo danh mục</h2>
    <table>
      <tr><th>Danh mục</th><th style="text-align:right">Số tiền</th><th style="text-align:right">Tỷ lệ</th></tr>
      ${breakdown.map(b => `<tr><td style="border-left:4px solid ${esc(b.cat.color || '#888')};padding-left:10px">${esc(b.cat.name || 'Không rõ')}</td><td style="text-align:right;font-weight:700">${fmt(b.value)}đ</td><td style="text-align:right;color:#5e6b62">${b.pct}%</td></tr>`).join('')}
    </table>
  </section>` : ''}
  <section>
    <h2>Chi tiết giao dịch</h2>
    ${dates.length === 0 ? '<p style="color:#9aa39c;text-align:center;padding:20px">Chưa có giao dịch</p>' : dates.map(d => {
      const dayTxs = groups[d];
      const dIn = dayTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const dOut = dayTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      return `
        <div class="day-block">
          <div class="day-head">
            <div>${fmtDate(d)}</div>
            <div class="day-totals">
              ${dIn > 0 ? `<span style="color:#2d8659">+${fmt(dIn)}đ</span>` : ''}
              ${dOut > 0 ? `<span style="color:#e63946">-${fmt(dOut)}đ</span>` : ''}
            </div>
          </div>
          <table>
            <thead><tr>
              <th>Danh mục</th>
              <th>Hình thức thanh toán</th>
              <th>Ghi chú</th>
              <th style="text-align:right">Tổng tiền</th>
              ${includePhotos ? '<th>Minh chứng</th>' : ''}
            </tr></thead>
            <tbody>${dayTxs.map(txRow).join('')}</tbody>
          </table>
        </div>
      `;
    }).join('')}
  </section>
  ${settlement ? `
  <section style="background:#fff8e0;border:2px solid #f4d77c;border-radius:10px;margin:18px 16px;padding:16px;page-break-before:always">
    <h2 style="border-bottom-color:#b8860b;color:#856404;margin-top:0">⚖️ Quyết toán chia tiền cuối chuyến</h2>
    <div class="summary">
      <div class="card"><div class="lbl">Tổng quỹ góp</div><div class="val">${fmt(settlement.totalContrib)}đ</div></div>
      <div class="card"><div class="lbl">Tổng đã chi</div><div class="val neg">-${fmt(settlement.totalExpense)}đ</div></div>
      <div class="card"><div class="lbl">${settlement.surplus >= 0 ? 'Quỹ còn dư' : 'Quỹ bị hụt'}</div><div class="val ${settlement.surplus >= 0 ? 'pos' : 'neg'}">${settlement.surplus >= 0 ? '+' : ''}${fmt(settlement.surplus)}đ</div></div>
      <div class="card"><div class="lbl">${settlement.customCount > 0 ? 'GD chia riêng' : 'TB mỗi người'}</div><div class="val">${settlement.customCount > 0 ? settlement.customCount + ' GD' : fmt(Math.round(settlement.perPerson)) + 'đ'}</div></div>
    </div>
    ${settlement.customCount > 0 ? `<div style="background:#fff;border-radius:8px;padding:8px 12px;margin-top:8px;font-size:12px;color:#856404">⚠ Có ${settlement.customCount} giao dịch không chia đều cả nhóm — phần dùng từng người được tính riêng theo người tham gia.</div>` : ''}
    ${(settlement.payerCount > 0 || settlement.receiverCount > 0) ? `
    <div style="background:#fff;border-radius:8px;padding:12px 14px;margin-top:12px;font-size:13px;line-height:1.7">
      ${settlement.receiverCount > 0 ? `<div><strong style="color:#2d8659">Cần trả lại:</strong> ${settlement.receiverCount} người, trung bình mỗi người nhận lại <strong>${fmt(Math.round(settlement.avgRefund))}đ</strong></div>` : ''}
      ${settlement.payerCount > 0 ? `<div><strong style="color:#e63946">Cần đóng thêm:</strong> ${settlement.payerCount} người, trung bình mỗi người góp thêm <strong>${fmt(Math.round(settlement.avgPay))}đ</strong></div>` : ''}
    </div>` : ''}
    <table style="margin-top:12px;background:#fff;border-radius:8px;overflow:hidden">
      <tr><th>Người</th><th style="text-align:right">Đã góp</th><th style="text-align:right">Phần dùng</th><th style="text-align:right">Quyết toán</th></tr>
      ${settlement.rows.map(r => {
        const action = r.action === 'refund'
          ? `<span style="color:#2d8659;font-weight:700">↩ Trả lại ${fmt(Math.round(r.balance))}đ</span>`
          : r.action === 'pay'
          ? `<span style="color:#e63946;font-weight:700">+ Đóng thêm ${fmt(Math.abs(Math.round(r.balance)))}đ</span>`
          : `<span style="color:#5e6b62;font-weight:700">✓ Vừa đủ</span>`;
        return `<tr><td><strong>${esc(r.name)}</strong></td><td style="text-align:right">${fmt(r.contribution)}đ</td><td style="text-align:right">${fmt(Math.round(r.share))}đ</td><td style="text-align:right">${action}</td></tr>`;
      }).join('')}
    </table>
  </section>` : ''}
  <footer>
    <div>Xuất từ app <strong>Quản Lý Tiền</strong> · ${exportedAt}</div>
    <div style="margin-top:4px">© 2026 <strong>Nguyễn Thanh</strong> · Mọi quyền được bảo lưu · Liên hệ: Zalo 0909683666</div>
  </footer>
</div>
</body>
</html>`;

    return html;
  },

  async exportBookCSV(bookId, includeSettlement = false) {
    const book = this.state.books.find(b => b.id === bookId);
    if (!book) return;
    const txs = (await window.QLT_Store.getAll('transactions')).filter(t => t.bookId === bookId);
    const cats = (await window.QLT_Store.getAll('categories')).filter(c => c.bookId === bookId);
    const accs = (await window.QLT_Store.getAll('accounts')).filter(a => a.bookId === bookId);

    const bookMembers = (book.members || []).filter(m => m.name && m.name.trim());
    const memById = Object.fromEntries(bookMembers.map(m => [m.id, m.name]));
    const rows = [['Ngày', 'Loại', 'Số tiền (VND)', 'Tài khoản', 'Đến tài khoản', 'Danh mục', 'Ghi chú', 'Người tham gia']];
    for (const t of [...txs].filter(x => !x.memberId).sort((a, b) => a.date.localeCompare(b.date))) {
      const c = cats.find(x => x.id === t.categoryId);
      const a = accs.find(x => x.id === t.accountId);
      const ta = accs.find(x => x.id === t.toAccountId);
      let parts = '';
      if (t.type === 'expense' && bookMembers.length > 0) {
        parts = (Array.isArray(t.participantIds) && t.participantIds.length < bookMembers.length)
          ? t.participantIds.map(id => memById[id]).filter(Boolean).join('; ')
          : 'Cả nhóm';
      }
      rows.push([
        t.date,
        t.type === 'expense' ? 'Chi' : t.type === 'income' ? 'Thu' : 'Chuyển',
        t.amount,
        a?.name || '',
        ta?.name || '',
        c?.name || '',
        t.note || '',
        parts
      ]);
    }

    if (includeSettlement) {
      const s = await this.calculateSettlement(bookId);
      if (s) {
        rows.push([]);
        rows.push(['=== QUYẾT TOÁN CHIA TIỀN CUỐI CHUYẾN ===']);
        rows.push(['Tổng quỹ góp', s.totalContrib]);
        rows.push(['Tổng đã chi', s.totalExpense]);
        rows.push([s.surplus >= 0 ? 'Quỹ còn dư' : 'Quỹ bị hụt', s.surplus]);
        rows.push(['Phần mỗi người', Math.round(s.perPerson)]);
        if (s.receiverCount > 0) rows.push([`Cần trả lại (${s.receiverCount} người)`, `Trung bình ${Math.round(s.avgRefund)}đ/người`]);
        if (s.payerCount > 0) rows.push([`Cần đóng thêm (${s.payerCount} người)`, `Trung bình ${Math.round(s.avgPay)}đ/người`]);
        rows.push([]);
        rows.push(['Người', 'Đã góp', 'Phần dùng', 'Chênh lệch', 'Quyết toán']);
        for (const r of s.rows) {
          const action = r.action === 'refund' ? `Trả lại ${Math.round(r.balance)}đ`
                      : r.action === 'pay' ? `Đóng thêm ${Math.abs(Math.round(r.balance))}đ`
                      : 'Vừa đủ';
          rows.push([r.name, r.contribution, Math.round(r.share), Math.round(r.balance), action]);
        }
      }
    }

    rows.push([]);
    rows.push(['© 2026 Nguyễn Thanh — Mọi quyền được bảo lưu — Liên hệ: Zalo 0909683666']);
    rows.push(['Xuất từ app Quản Lý Tiền']);

    const csv = '﻿' + rows.map(r => r.map(c => {
      const s = String(c == null ? '' : c).replace(/"/g, '""');
      return /[,"\n]/.test(s) ? `"${s}"` : s;
    }).join(',')).join('\n');

    const suffix = includeSettlement ? 'ket-thuc' : 'trong-dot';
    this._download(csv, `qlt-${this._safe(book.name)}-${suffix}-${today()}.csv`, 'text/csv;charset=utf-8');
  },

  async exportFinal(format) {
    if (!this.state.editingBook?.id) return;
    const ok = await QLT_UI.confirm(
      'Bạn chắc chuyến đi đã kết thúc?\n\nBáo cáo này sẽ chứa quyết toán chia tiền cho từng người. Hãy chỉ chia sẻ khi đã chốt mọi giao dịch.',
      { title: 'Xuất báo cáo kết thúc', okLabel: 'Đã chốt — Xuất' }
    );
    if (!ok) return;
    const bookId = this.state.editingBook.id;
    const photos = !!$('#bookExportPhotos')?.checked;
    if (format === 'html') await this.exportBookHTML(bookId, true, photos);
    else if (format === 'csv') await this.exportBookCSV(bookId, true);
  },

  _safe(s) {
    return String(s || 'so').replace(/[^\w\sÀ-ỹ-]/gi, '').replace(/\s+/g, '-').toLowerCase();
  },

  _download(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async deleteBook() {
    const b = this.state.editingBook;
    if (!b.id) return;
    if (this.state.books.length <= 1) {
      await QLT_UI.alert('Không thể xoá sổ duy nhất', { title: 'Không thể xoá' });
      return;
    }
    const txCount = (await window.QLT_Store.getAllInBook('transactions', b.id)).length;
    if (!await QLT_UI.confirm(`Xoá sổ "${b.name}"?\n\nSẽ xoá vĩnh viễn ${txCount} giao dịch + toàn bộ tài khoản, danh mục, nhắc nhở trong sổ.\n\nKhông thể hoàn tác.`, { title: 'Xác nhận xoá', okLabel: 'Xoá vĩnh viễn', danger: true })) return;
    await window.QLT_Store.deleteBook(b.id);
    if (this.state.currentBookId === b.id) {
      const remaining = (await window.QLT_Store.getAll('books')).filter(x => x.id !== b.id);
      if (remaining[0]) window.QLT_Store.setCurrentBookId(remaining[0].id);
    }
    await this.reload();
    $('#bookEditModal').classList.remove('open');
    $('#bookModal').classList.remove('open');
    this.renderBookHeader();
    this.switchTab('home');
    this.autoSync();
  }
};

window.addEventListener('DOMContentLoaded', () => App.init());
window.QLT_App = App;
