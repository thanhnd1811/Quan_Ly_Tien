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

// Gắn auto-format dấu chấm khi user gõ số vào input
function attachAmountFormatting(el) {
  if (!el || el._qltFmt) return;
  el._qltFmt = true;
  el.addEventListener('input', () => {
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
}

// Đọc số nguyên từ input đã format
function readAmount(el) {
  const v = (el.value || '').toString().replace(/\D/g, '');
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
    currentTab: 'home',
    txFilter: { type: 'all', period: 'month', accountId: 'all' },
    chartPeriod: 'month',
    catTab: 'expense',
    editingTx: null,
    editingCat: null,
    editingAcc: null,
    editingReminder: null,
    editingBook: null
  },

  async init() {
    try {
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
      this.render();
      this.bindEvents();
      $$('.qlt-amount').forEach(attachAmountFormatting);
      this.switchTab('home');
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

    // Reminder form
    $('#remSave').onclick = () => this.saveReminder();
    $('#remDelete').onclick = () => this.deleteReminder();

    // Period switchers (chart)
    $$('.period-pill').forEach(el => {
      el.onclick = () => {
        $$('.period-pill').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.chartPeriod = el.dataset.period;
        this.renderCharts();
      };
    });
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
  },

  // ============ HOME ============
  renderHome() {
    const totalBalance = this.state.accounts.reduce((s, a) => s + (a.balance || 0), 0);
    $('#homeBalance').textContent = fmt(totalBalance) + ' đ';

    // Tổng thu/chi tháng hiện tại + thay đổi số dư từng ví trong tháng
    const now = new Date();
    const ym = now.toISOString().slice(0, 7);
    let inc = 0, exp = 0;
    const accChange = {};
    for (const a of this.state.accounts) accChange[a.id] = 0;
    for (const t of this.state.transactions) {
      if (!t.date.startsWith(ym)) continue;
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

    // ----- Số dư từng ví -----
    const walletEl = $('#homeWallets');
    const accs = this.state.accounts;
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
    const total = this.state.accounts.reduce((s, a) => s + (a.balance || 0), 0);
    $('#accTotalBalance').textContent = fmt(total) + ' đ';

    const list = $('#accList');
    if (this.state.accounts.length === 0) {
      list.innerHTML = '<div class="empty-msg">Chưa có tài khoản</div>';
    } else {
      list.innerHTML = this.state.accounts.map(a => `
        <div class="acc-item" data-acc="${a.id}">
          <div class="tx-icon" style="background:#2d6a4f1a;color:#2d6a4f">${svgIcon(a.icon || 'cash')}</div>
          <div class="tx-info">
            <div class="tx-cat">${this.escapeHtml(a.name)}</div>
            <div class="tx-meta">${a.currency || 'VND'}</div>
          </div>
          <div class="tx-amount ${(a.balance || 0) < 0 ? 'amount-neg' : ''}">${fmt(a.balance)} đ</div>
        </div>
      `).join('');
      list.querySelectorAll('[data-acc]').forEach(el => {
        el.onclick = () => this.openAccModal(el.dataset.acc);
      });
    }

    $('#accAddBtn').onclick = () => this.openAccModal(null);
  },

  // ============ CATEGORIES ============
  renderCategories() {
    const cats = this.state.categories.filter(c => c.type === this.state.catTab);
    const grid = $('#catGrid');
    grid.innerHTML = cats.map(c => `
      <div class="cat-item" data-cat="${c.id}">
        <div class="cat-circle" style="background:${c.color}">
          ${svgIcon(c.icon)}
        </div>
        <div class="cat-name">${this.escapeHtml(c.name)}</div>
      </div>
    `).join('') + `
      <div class="cat-item" data-cat="new">
        <div class="cat-circle" style="background:#f4b942">${svgIcon('add')}</div>
        <div class="cat-name">Tạo</div>
      </div>
    `;
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
    txs.sort((a, b) => (b.date + b._updatedAt).localeCompare(a.date + a._updatedAt));

    if (txs.length === 0) {
      list.innerHTML = '<div class="empty-msg">Không có giao dịch phù hợp</div>';
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
      return { label: c.name || 'Không rõ', value, color: c.color || '#888' };
    }).sort((a, b) => b.value - a.value);

    const donutCanvas = $('#chartDonut');
    if (donutCanvas) {
      window.QLT_Charts.donut(donutCanvas, slices, {
        centerLabel: fmt(totalExp),
        centerSub: 'Chi'
      });
    }

    // Legend
    $('#chartLegend').innerHTML = slices.length ? slices.map(s => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${s.color}"></span>
        <span class="legend-name">${this.escapeHtml(s.label)}</span>
        <span class="legend-val">${fmt(s.value)}</span>
      </div>
    `).join('') : '<div class="empty-msg">Chưa có chi tiêu trong kỳ này</div>';
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
    $('#txCategoryList').innerHTML = cats.map(c => `
      <div class="picker-item ${c.id === sel ? 'on' : ''}" data-cat="${c.id}">
        <span class="picker-icon" style="color:${c.color}">${svgIcon(c.icon)}</span>
        <span>${this.escapeHtml(c.name)}</span>
      </div>
    `).join('');
    $$('#txCategoryList .picker-item').forEach(el => {
      el.onclick = () => {
        $$('#txCategoryList .picker-item').forEach(x => x.classList.remove('on'));
        el.classList.add('on');
        this.state.editingTx.categoryId = el.dataset.cat;
      };
    });
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

  // ============ ICON PICKER (search + tabs + emoji input) ============
  // Trả về object { setColor(c) } để caller update màu khi user đổi color picker
  renderIconPicker(opts) {
    // opts: { containerId, currentIcon, color?, allowEmoji?, onPick }
    const container = document.getElementById(opts.containerId);
    if (!container) return { setColor: () => {} };

    const lib = window.QLT_ICON_LIB || [];
    const popular = window.QLT_ICON_POPULAR || [];

    // Tab list: "Phổ biến" + unique groups từ lib
    const allGroups = [];
    const seen = new Set();
    for (const i of lib) {
      if (!seen.has(i.group)) { seen.add(i.group); allGroups.push(i.group); }
    }
    const tabs = ['Phổ biến', ...allGroups];

    // Tab mặc định: nếu icon hiện tại nằm trong group nào → mở tab đó
    let activeTab = 'Phổ biến';
    if (opts.currentIcon && !String(opts.currentIcon).startsWith('emoji:')) {
      const found = lib.find(x => x.name === opts.currentIcon);
      if (found) activeTab = found.group;
    }
    let searchTerm = '';

    const initEmoji = String(opts.currentIcon || '').startsWith('emoji:')
      ? opts.currentIcon.slice(6) : '';

    const showEmoji = opts.allowEmoji !== false;

    // Bộ emoji gợi ý — bấm chọn nhanh, không cần mở bàn phím emoji
    const EMOJI_SUGGEST = [
      '🍜', '☕', '🍔', '🍕', '🍺', '🍷', '🍰', '🍦',
      '🛒', '👕', '💎', '🎁', '⚡', '💧', '📶', '📱',
      '🚗', '🏍️', '✈️', '⛽', '🚕', '🚌', '🅿️', '🗺️',
      '💊', '🏥', '💉', '🛡️', '🏋️', '🎬', '🎵', '🎮',
      '🎤', '🎉', '✈️', '📚', '🎓', '🏠', '🛋️', '🛏️',
      '🔑', '💡', '📺', '👨‍👩‍👧', '👶', '❤️', '🐶', '🐱',
      '✂️', '💄', '💼', '💰', '💵', '💳', '📈', '🏆',
      '💻', '🏪', '🏢', '🪙', '⭐', '🚩', '🎯', '🔖'
    ];

    container.innerHTML = `
      <input class="icon-search" type="text" placeholder="Tìm icon (vd: xe, ăn, điện)...">
      <div class="icon-tabs"></div>
      <div class="icon-grid"></div>
      ${showEmoji ? `
        <div class="icon-emoji-section">
          <div class="icon-emoji-title">🎉 Hoặc dùng emoji</div>
          <div class="icon-emoji-hint">Bấm 1 emoji bên dưới để chọn — hoặc gõ emoji bất kỳ ở ô dưới cùng.</div>
          <div class="icon-emoji-grid">
            ${EMOJI_SUGGEST.map(e => {
              const on = ('emoji:' + e) === opts.currentIcon;
              return `<div class="icon-emoji-pick ${on ? 'on' : ''}" data-emoji="${e}">${e}</div>`;
            }).join('')}
          </div>
          <div class="icon-emoji-input-row">
            <label>Tự gõ:</label>
            <input type="text" placeholder="Vd: 🍜" maxlength="4" value="${this.escapeHtml(initEmoji)}">
          </div>
        </div>
      ` : ''}
    `;

    const searchInput = container.querySelector('.icon-search');
    const tabsEl = container.querySelector('.icon-tabs');
    const gridEl = container.querySelector('.icon-grid');
    const emojiSection = container.querySelector('.icon-emoji-section');
    const emojiGrid = container.querySelector('.icon-emoji-grid');
    const emojiInput = container.querySelector('.icon-emoji-input-row input');

    const setEmojiPicked = (emoji) => {
      // Highlight emoji đã chọn trong grid + clear svg pick + clear input nếu khác
      if (emojiGrid) {
        emojiGrid.querySelectorAll('.icon-emoji-pick').forEach(x => {
          x.classList.toggle('on', x.dataset.emoji === emoji);
        });
      }
      gridEl.querySelectorAll('.icon-pick').forEach(x => x.classList.remove('on'));
    };

    if (emojiGrid) {
      emojiGrid.querySelectorAll('.icon-emoji-pick').forEach(el => {
        el.onclick = () => {
          const e = el.dataset.emoji;
          opts.currentIcon = 'emoji:' + e;
          setEmojiPicked(e);
          if (emojiInput) emojiInput.value = '';
          if (opts.onPick) opts.onPick(opts.currentIcon);
        };
      });
    }

    // Bỏ dấu tiếng Việt cho search (regex unicode escape — không phụ thuộc encoding file)
    const norm = (s) => String(s || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

    const renderTabs = () => {
      tabsEl.innerHTML = tabs.map(g =>
        `<div class="icon-tab ${(!searchTerm && g === activeTab) ? 'on' : ''}" data-group="${this.escapeHtml(g)}">${this.escapeHtml(g)}</div>`
      ).join('');
      tabsEl.querySelectorAll('.icon-tab').forEach(el => {
        el.onclick = () => {
          activeTab = el.dataset.group;
          searchTerm = '';
          if (searchInput) searchInput.value = '';
          renderTabs();
          renderGrid();
        };
      });
    };

    const renderGrid = () => {
      let items;
      if (searchTerm) {
        const term = norm(searchTerm);
        items = lib.filter(i => norm(i.name + ' ' + i.label + ' ' + i.kw).includes(term));
      } else if (activeTab === 'Phổ biến') {
        items = popular.map(name => lib.find(x => x.name === name)).filter(Boolean);
      } else {
        items = lib.filter(i => i.group === activeTab);
      }

      if (!items.length) {
        gridEl.innerHTML = `<div class="icon-grid-empty">Không tìm thấy icon.</div>`;
        return;
      }

      const colorAttr = opts.color ? ` style="color:${opts.color}"` : '';
      gridEl.innerHTML = items.map(i => {
        const on = opts.currentIcon === i.name;
        return `<div class="icon-pick ${on ? 'on' : ''}" data-icon="${i.name}" title="${this.escapeHtml(i.label)}"${colorAttr}>${window.svgIcon(i.name)}</div>`;
      }).join('');

      gridEl.querySelectorAll('.icon-pick').forEach(el => {
        el.onclick = () => {
          opts.currentIcon = el.dataset.icon;
          gridEl.querySelectorAll('.icon-pick').forEach(x => x.classList.remove('on'));
          el.classList.add('on');
          // Bỏ chọn emoji (cả grid lẫn input) khi pick icon SVG
          if (emojiInput) emojiInput.value = '';
          if (emojiGrid) emojiGrid.querySelectorAll('.icon-emoji-pick').forEach(x => x.classList.remove('on'));
          if (opts.onPick) opts.onPick(opts.currentIcon);
        };
      });
    };

    if (searchInput) {
      searchInput.oninput = (e) => {
        searchTerm = e.target.value.trim();
        tabsEl.querySelectorAll('.icon-tab').forEach(x => x.classList.remove('on'));
        renderGrid();
      };
    }

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

    renderTabs();
    renderGrid();

    return {
      setColor(c) {
        opts.color = c;
        container.querySelectorAll('.icon-pick').forEach(el => el.style.color = c);
      }
    };
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
      c = { id: null, type: this.state.catTab, name: '', icon: 'other', color: '#52b788', bookId: this.state.currentBookId };
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

    $('#catModal').classList.add('open');
  },

  async saveCat() {
    const c = this.state.editingCat;
    c.name = $('#catName').value.trim();
    c.color = $('#catColor').value;
    c.type = $('#catType').value;
    c.bookId = c.bookId || this.state.currentBookId;
    if (!c.name) { QLT_UI.toast('Nhập tên danh mục', { type: 'error' }); return; }
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
    if (used > 0) {
      if (!await QLT_UI.confirm(`Có ${used} giao dịch dùng danh mục này. Vẫn xoá?`, { okLabel: 'Xoá', danger: true })) return;
    } else {
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
      a = { id: null, name: '', icon: 'cash', balance: 0, currency: 'VND', bookId: this.state.currentBookId };
    } else {
      a = this.state.accounts.find(x => x.id === id);
      if (!a) return;
    }
    this.state.editingAcc = { ...a };
    $('#accName').value = a.name;
    $('#accBalance').value = fmtAmount(a.balance);
    $('#accTitle').textContent = isNew ? 'Thêm tài khoản' : 'Sửa tài khoản';
    $('#accDelete').style.display = isNew ? 'none' : 'block';

    this.renderIconPicker({
      containerId: 'accIconGrid',
      currentIcon: a.icon || 'cash',
      allowEmoji: true,
      onPick: (icon) => { this.state.editingAcc.icon = icon; }
    });
    $('#accModal').classList.add('open');
  },

  async saveAcc() {
    const a = this.state.editingAcc;
    a.name = $('#accName').value.trim();
    a.balance = readAmount($('#accBalance'));
    a.bookId = a.bookId || this.state.currentBookId;
    if (!a.name) { QLT_UI.toast('Nhập tên tài khoản', { type: 'error' }); return; }
    await window.QLT_Store.put('accounts', a);
    await this.reload();
    $('#accModal').classList.remove('open');
    this.renderAccounts();
    this.autoSync();
  },

  async deleteAcc() {
    const a = this.state.editingAcc;
    if (!a.id) return;
    const used = this.state.transactions.filter(t => t.accountId === a.id).length;
    if (used > 0) {
      await QLT_UI.alert(`Không xoá được, có ${used} giao dịch đang dùng tài khoản này`, { title: 'Không thể xoá' });
      return;
    }
    if (!await QLT_UI.confirm('Xoá tài khoản?', { okLabel: 'Xoá', danger: true })) return;
    await window.QLT_Store.del('accounts', a.id);
    await this.reload();
    $('#accModal').classList.remove('open');
    this.renderAccounts();
    this.autoSync();
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
