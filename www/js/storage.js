// Lưu trữ local: IndexedDB cho dữ liệu chính, localStorage cho trạng thái nhỏ
// Mỗi user (Google email hoặc 'guest') có namespace riêng, mỗi user có thể có nhiều SỔ.

(function () {
  const DB_VERSION = 7;
  const STORES = ['accounts', 'categories', 'transactions', 'reminders', 'meta', 'books', 'loans', 'budgets', 'goals', 'fuelLogs', 'maintenanceLogs', 'recurringRules'];

  function dbName(userKey) {
    return 'qltien_' + (userKey || 'guest').replace(/[^a-zA-Z0-9_]/g, '_');
  }

  // Gộp keywords {brand, strong, weak} thành flat array để lưu DB
  // Tier info được giữ nguyên qua _tieredKeywords (matcher đọc field này)
  function collectKw(kw) {
    if (!kw) return [];
    return [...(kw.brand || []), ...(kw.strong || []), ...(kw.weak || [])];
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

      // Bộ danh mục chuẩn V2 — load từ categories-default.js
      // Cha trước, con sau — để parentSlug → parentId resolve đúng
      const def = window.QLT_CategoriesDefault;
      if (!def) {
        console.error('[storage] QLT_CategoriesDefault not loaded — fallback empty');
        return;
      }
      const slugToId = {};
      let order = 0;
      // Pass 1: tạo cha (parentSlug = null)
      for (const c of def.ALL.filter(x => !x.parentSlug)) {
        const obj = await this.put('categories', {
          slug: c.slug, type: c.type, name: c.name, icon: c.icon, color: c.color,
          parentId: null, keywords: collectKw(c.keywords),
          antiKeywords: c.antiKeywords || {},
          archived: false, order: order++, bookId
        });
        slugToId[c.slug] = obj.id;
      }
      // Pass 2: tạo con (parentSlug → parentId)
      for (const c of def.ALL.filter(x => x.parentSlug)) {
        await this.put('categories', {
          slug: c.slug, type: c.type, name: c.name, icon: c.icon, color: c.color,
          parentId: slugToId[c.parentSlug] || null,
          keywords: collectKw(c.keywords),
          antiKeywords: c.antiKeywords || {},
          archived: false, order: order++, bookId
        });
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
