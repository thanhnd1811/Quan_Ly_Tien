// Lưu trữ local: IndexedDB cho dữ liệu chính, localStorage cho trạng thái nhỏ
// Mỗi user (Google email hoặc 'guest') có namespace riêng, mỗi user có thể có nhiều SỔ.

(function () {
  const DB_VERSION = 7;
  const STORES = ['accounts', 'categories', 'transactions', 'reminders', 'meta', 'books', 'loans', 'budgets', 'goals', 'fuelLogs', 'maintenanceLogs', 'recurringRules'];

  function dbName(userKey) {
    return 'qltien_' + (userKey || 'guest').replace(/[^a-zA-Z0-9_]/g, '_');
  }

  function open(userKey) {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName(userKey), DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        STORES.forEach(s => {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: 'id' });
          }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(userKey, store, mode, fn) {
    const db = await open(userKey);
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const result = fn(s);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
    });
  }

  const Store = {
    currentUser: 'guest',

    setUser(key) {
      this.currentUser = key || 'guest';
      localStorage.setItem('qlt_user', this.currentUser);
    },

    loadUser() {
      this.currentUser = localStorage.getItem('qlt_user') || 'guest';
      return this.currentUser;
    },

    getCurrentBookId() {
      return localStorage.getItem('qlt_book_' + this.currentUser) || 'b_personal';
    },

    setCurrentBookId(id) {
      localStorage.setItem('qlt_book_' + this.currentUser, id);
    },

    async getAll(store) {
      return tx(this.currentUser, store, 'readonly', s => {
        return new Promise(resolve => {
          const out = [];
          s.openCursor().onsuccess = e => {
            const c = e.target.result;
            if (c) { out.push(c.value); c.continue(); } else resolve(out);
          };
        });
      }).then(p => p);
    },

    async get(store, id) {
      return tx(this.currentUser, store, 'readonly', s => {
        return new Promise(resolve => {
          const r = s.get(id);
          r.onsuccess = () => resolve(r.result);
        });
      }).then(p => p);
    },

    async put(store, obj) {
      if (!obj.id) obj.id = 'i_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      obj._updatedAt = Date.now();
      await tx(this.currentUser, store, 'readwrite', s => s.put(obj));
      return obj;
    },

    async del(store, id) {
      await tx(this.currentUser, store, 'readwrite', s => s.delete(id));
    },

    async clear(store) {
      await tx(this.currentUser, store, 'readwrite', s => s.clear());
    },

    async exportAll() {
      const data = {};
      for (const s of STORES) data[s] = await this.getAll(s);
      data._exportedAt = Date.now();
      data._user = this.currentUser;
      return data;
    },

    async importAll(data, mode = 'replace') {
      for (const s of STORES) {
        if (!data[s]) continue;
        if (mode === 'replace') await this.clear(s);
        for (const obj of data[s]) {
          await tx(this.currentUser, s, 'readwrite', store => store.put(obj));
        }
      }
    },

    async setMeta(key, value) {
      await this.put('meta', { id: key, value });
    },

    async getMeta(key) {
      const r = await this.get('meta', key);
      return r ? r.value : null;
    },

    // Lấy tất cả records thuộc 1 sổ
    async getAllInBook(store, bookId) {
      const all = await this.getAll(store);
      return all.filter(x => x.bookId === bookId);
    },

    // Xoá sổ + toàn bộ dữ liệu trong sổ đó
    async deleteBook(bookId) {
      for (const s of ['accounts', 'categories', 'transactions', 'reminders', 'loans', 'budgets', 'goals', 'fuelLogs', 'maintenanceLogs', 'recurringRules']) {
        const all = await this.getAll(s);
        for (const r of all) {
          if (r.bookId === bookId) await this.del(s, r.id);
        }
      }
      await this.del('books', bookId);
    },

    // Khởi tạo: đảm bảo có ít nhất 1 sổ mặc định, migrate dữ liệu cũ vào sổ này
    async initDefaults() {
      const books = await this.getAll('books');
      if (books.length === 0) {
        // User mới hoặc user cũ trước khi có "sổ" → tạo sổ Cá nhân, gán dữ liệu cũ vào
        const defaultBook = {
          id: 'b_personal',
          name: 'Cá nhân',
          icon: 'wallet',
          color: '#2d6a4f',
          createdAt: Date.now(),
          _updatedAt: Date.now()
        };
        await tx(this.currentUser, 'books', 'readwrite', s => s.put(defaultBook));

        // Migrate dữ liệu cũ
        for (const s of ['accounts', 'categories', 'transactions', 'reminders']) {
          const all = await this.getAll(s);
          for (const r of all) {
            if (!r.bookId) {
              r.bookId = 'b_personal';
              await tx(this.currentUser, s, 'readwrite', store => store.put(r));
            }
          }
        }
        this.setCurrentBookId('b_personal');
      }

      // Đảm bảo currentBookId trỏ đến sổ tồn tại
      const all = await this.getAll('books');
      const cur = this.getCurrentBookId();
      if (!all.find(b => b.id === cur)) {
        if (all.length > 0) this.setCurrentBookId(all[0].id);
      }

      // Nạp default categories nếu sổ hiện tại trống
      await this.populateBookDefaults(this.getCurrentBookId());
    },

    // Nạp danh mục + tài khoản mặc định cho 1 sổ MỚI (nếu chưa có)
    async populateBookDefaults(bookId) {
      const cats = (await this.getAll('categories')).filter(c => c.bookId === bookId);
      if (cats.length > 0) return;

      // Danh mục mặc định cho người Việt — đa dạng, dùng icon mới
      const expenseCats = [
        { type: 'expense', name: 'Ăn uống', icon: 'food', color: '#f97316' },
        { type: 'expense', name: 'Cà phê / Trà sữa', icon: 'coffee', color: '#92400e' },
        { type: 'expense', name: 'Đi siêu thị', icon: 'cart', color: '#73a942' },
        { type: 'expense', name: 'Xăng xe', icon: 'fuel', color: '#dc2626' },
        { type: 'expense', name: 'Đi lại / Grab', icon: 'taxi', color: '#3b82f6' },
        { type: 'expense', name: 'Tiền nhà', icon: 'home', color: '#f4a261' },
        { type: 'expense', name: 'Tiền điện', icon: 'electricity', color: '#f59e0b' },
        { type: 'expense', name: 'Tiền nước', icon: 'water', color: '#06b6d4' },
        { type: 'expense', name: 'Internet / Điện thoại', icon: 'wifi', color: '#6366f1' },
        { type: 'expense', name: 'Mua sắm', icon: 'shopping', color: '#ec4899' },
        { type: 'expense', name: 'Sức khoẻ / Thuốc', icon: 'medical', color: '#e63946' },
        { type: 'expense', name: 'Giải trí', icon: 'film', color: '#a855f7' },
        { type: 'expense', name: 'Du lịch', icon: 'travel', color: '#14b8a6' },
        { type: 'expense', name: 'Học hành', icon: 'graduation', color: '#4f86c6' },
        { type: 'expense', name: 'Gia đình / Biếu tặng', icon: 'gift', color: '#e65a9e' },
        { type: 'expense', name: 'Khác', icon: 'other', color: '#888888' }
      ];

      const incomeCats = [
        { type: 'income', name: 'Lương', icon: 'briefcase', color: '#2d6a4f' },
        { type: 'income', name: 'Thưởng', icon: 'award', color: '#f59e0b' },
        { type: 'income', name: 'Đầu tư', icon: 'trending', color: '#10b981' },
        { type: 'income', name: 'Freelance', icon: 'laptop', color: '#6366f1' },
        { type: 'income', name: 'Bán hàng', icon: 'shop', color: '#ec4899' },
        { type: 'income', name: 'Quà tặng', icon: 'gift', color: '#e65a9e' },
        { type: 'income', name: 'Khác', icon: 'other', color: '#888888' }
      ];

      for (const c of [...expenseCats, ...incomeCats]) {
        await this.put('categories', { ...c, bookId });
      }

      await this.put('accounts', {
        name: 'Tiền mặt',
        icon: 'cash',
        balance: 0,
        currency: 'VND',
        bookId
      });
      await this.put('accounts', {
        name: 'Ngân hàng',
        icon: 'bank',
        balance: 0,
        currency: 'VND',
        bookId
      });
    }
  };

  Store.loadUser();
  window.QLT_Store = Store;
})();
