// Bộ danh mục chuẩn V2 — 12 cha + 47 con (chi) + 5 cha + 13 con (thu)
// Mỗi sub-category có keywords 4-tier (brand/strong/weak) + antiKeywords để chống false-positive.
// Dùng `slug` làm stable identifier — cho phép migration cũ → mới và detect "đã migrate" sau này.
//
// Format keyword:
//   - brand: tên thương hiệu cụ thể, không dấu (vd 'highlands', 'netflix') — confidence 0.95
//   - strong: cụm tiếng Việt rõ nghĩa, không dấu (vd 'ca phe', 'do xang') — confidence 0.85
//   - weak: viết tắt / mơ hồ (vd 'cf', 'cafe') — confidence 0.70
//   - antiKeywords: cụm trông giống cat này nhưng thực ra thuộc cat khác → loại trừ
//                   format: { 'cụm': 'slug-cat-đúng' }

(function () {
  'use strict';

  // ============================================================
  // EXPENSE — 12 cha · 47 con
  // ============================================================
  const EXPENSE_CATEGORIES = [
    // ─────────────────────── 1. ĂN UỐNG ───────────────────────
    {
      slug: 'food', type: 'expense', name: 'Ăn uống', icon: 'food', color: '#f97316',
      parentSlug: null,
      keywords: { brand: [], strong: ['an uong', 'tien an'], weak: [] }
    },
    {
      slug: 'food_dining', type: 'expense', name: 'Ăn ngoài / Nhà hàng', icon: 'rice', color: '#f97316',
      parentSlug: 'food',
      keywords: {
        brand: ['kfc', 'lotteria', 'jollibee', 'mcdonald', 'mcdonalds', 'burger king', 'pizza hut', 'domino', 'pho 24', 'pho hung', 'golden gate', 'kichi kichi', 'gogi house', 'sumo bbq', 'manwah', 'haidilao', 'crystal jade', 'al fresco', 'pizza 4ps', 'al-fresco', 'wrap roll', 'soya', 'mon hue', 'cong cafe restaurant'],
        strong: ['an ngoai', 'an nha hang', 'di an', 'an trua', 'an toi', 'an sang', 'di nha hang', 'com trua', 'com toi', 'com phan', 'com tam', 'com ga', 'com suon', 'com binh dan', 'bun bo', 'bun cha', 'pho bo', 'pho ga', 'banh mi', 'mi quang', 'bun rieu', 'bun dau', 'an lau', 'lau thai', 'lau bo', 'lau ca', 'lau de', 'lau hai san', 'lau nam', 'lau ga', 'di nuong', 'buffet', 'an buffet', 'banh xeo', 'mi cay', 'sushi', 'set lunch', 'di an com', 'an com', 'thit nuong', 'bo nuong', 'ga nuong', 'di an pho', 'di an bun'],
        weak: []
      },
      antiKeywords: {
        'mua nguyen lieu': 'food_grocery',
        'di cho': 'food_grocery',
        'sieu thi': 'food_grocery',
        'an tap': 'health_gym',
        'phan an': 'fam_children'
      }
    },
    {
      slug: 'food_coffee', type: 'expense', name: 'Cà phê / Trà sữa', icon: 'coffee', color: '#92400e',
      parentSlug: 'food',
      keywords: {
        brand: ['highlands', 'highland', 'highland coffee', 'phuc long', 'starbucks', 'trung nguyen', 'trung nguyen legend', 'gong cha', 'koi the', 'tocotoco', 'the coffee house', 'tch', 'cong ca phe', 'effoc', 'aha cafe', 'milano', 'chatra', 'mixue', 'royaltea', 'maycha', 'ding tea', 'sharetea', 'tealive', 'bobapop', 'chuk', 'chuk tea', 'wayne', 'passio', 'urban station', 'cheese coffee'],
        strong: ['ca phe', 'cafe', 'café', 'coffee', 'tra sua', 'milk tea', 'bubble tea', 'tra dao', 'tra chanh', 'tra tac', 'matcha', 'latte', 'americano', 'cappuccino', 'espresso', 'macchiato', 'mocha', 'cafe sua', 'cafe den', 'cafe nau', 'nau da', 'sua da', 'tran chau', 'topping', 'tra hoa qua', 'sinh to', 'nuoc ep'],
        weak: ['cf', 'cafe đen', 'caphe']
      },
      antiKeywords: {
        'may pha ca phe': 'shop_electronics',
        'may pha cafe': 'shop_electronics',
        'hat ca phe': 'food_grocery',
        'goi ca phe': 'food_grocery',
        'g7': 'food_grocery',
        'ca phe hoa tan': 'food_grocery',
        'tra sua bot': 'food_grocery'
      }
    },
    {
      slug: 'food_grocery', type: 'expense', name: 'Đi chợ / Siêu thị', icon: 'cart', color: '#73a942',
      parentSlug: 'food',
      keywords: {
        brand: ['bach hoa xanh', 'bhx', 'winmart', 'vinmart', 'lotte mart', 'big c', 'go!', 'go market', 'aeon', 'aeon mall', 'mega market', 'metro', 'co op mart', 'coopmart', 'co.opmart', 'satra', 'maxi mart', 'fivimart', 'tops market', 'kmart', 'circle k', 'family mart', 'gs25', 'ministop', '7-eleven', 'cheers'],
        strong: ['di cho', 'di sieu thi', 'sieu thi', 'mua thuc pham', 'mua rau', 'mua thit', 'mua trung', 'mua banh mi', 'mua trai cay', 'mua hoa qua', 'mua do an', 'mua nguyen lieu', 'mua mi tom', 'mua nuoc mam', 'tap hoa', 'cua hang tien loi', 'cho que', 'cho dem'],
        weak: []
      },
      antiKeywords: {
        'di cho cau lac bo': 'entertainment',
        'cho hoa': 'cer_gift'
      }
    },
    {
      slug: 'food_snack', type: 'expense', name: 'Ăn vặt', icon: 'candy', color: '#f59e0b',
      parentSlug: 'food',
      keywords: {
        brand: [],
        strong: ['an vat', 'banh trang', 'banh trang tron', 'banh trang nuong', 'an che', 'an kem', 'an banh', 'snack', 'bim bim', 'mua keo', 'banh kem', 'banh ngot', 'banh bao', 'banh trung thu', 'xien que', 'oc len', 'oc heo', 'tau hu', 'tau hu nuoc', 'banh trang me', 'pudding', 'cake pop'],
        weak: []
      }
    },
    {
      slug: 'food_delivery', type: 'expense', name: 'Đặt đồ ăn', icon: 'noodle', color: '#dc2626',
      parentSlug: 'food',
      keywords: {
        brand: ['grabfood', 'grab food', 'shopeefood', 'shopee food', 'baemin', 'gojek food', 'gofood', 'go food', 'foody', 'beamin', 'be food', 'loship', 'ahamove food'],
        strong: ['dat do an', 'dat com', 'giao do an', 'ship do an', 'order do an', 'order com', 'app giao do an', 'app dat do an'],
        weak: ['ship', 'order']
      },
      antiKeywords: {
        'ship hang': 'shop_personal',
        'ship phat': 'shop_personal',
        'order hang': 'shop_personal'
      }
    },

    // ─────────────────────── 2. ĐI LẠI ───────────────────────
    {
      slug: 'transport', type: 'expense', name: 'Đi lại', icon: 'car', color: '#3b82f6',
      parentSlug: null,
      keywords: { brand: [], strong: ['di lai', 'phuong tien'], weak: [] }
    },
    {
      // Cat tổng hợp "Chi phí xe" — gộp Xăng xe + Bảo dưỡng/Sửa xe + Đăng kiểm + BH xe.
      // Khi user pick cat này trong Tx form → hiện panel mở rộng với Loại + Xe + fields tương ứng,
      // Save → vừa tạo tx vừa tạo fuel log / maintenance log đầy đủ.
      slug: 'transport_vehicle', type: 'expense', name: 'Chi phí xe', icon: 'fuel', color: '#dc2626',
      parentSlug: 'transport',
      keywords: {
        // Brands xăng dầu + tiệm sửa xe + hãng bảo hiểm xe
        brand: ['petrolimex', 'pvoil', 'pv oil', 'pv-oil', 'shell', 'castrol', 'caltex', 'mipec', 'saigon petro', 'idemitsu', 'comeco', 'mipecorp', 'honda head', 'yamaha town', 'yamaha 3s'],
        strong: [
          // Đổ xăng
          'do xang', 'bom xang', 'xang xe', 'tien xang', 'xang a95', 'xang a92', 'xang e5',
          'ron 95', 'ron 92', 'ron95', 'ron92', 'dau diesel', 'dau do', 'fill xang', 'cay xang',
          'chi phi xe', 'tien xe',
          // Bảo dưỡng / Sửa xe
          'bao duong xe', 'bao duong', 'sua xe', 'sua o to', 'sua xe may', 'thay nhot',
          'thay dau nhot', 'thay lop', 'thay banh', 'rua xe', 'rua o to', 'tiem xe', 'garage',
          'thay binh', 'thay binh ac quy', 'thay phanh', 'thay xich', 'thay lop xe',
          'thay xich xe', 'sua tham xe', 'kiem tra xe',
          // Đăng kiểm
          'dang kiem', 'phi dang kiem', 'tien dang kiem',
          // Bảo hiểm xe
          'bao hiem xe', 'bao hiem o to', 'bao hiem xe may', 'bao hiem xe co gioi',
          'phi bao hiem xe', 'mua bao hiem xe'
        ],
        weak: ['xang', 'gas', 'fuel', 'xang dau']
      },
      antiKeywords: {
        'bep ga': 'bills_gas',
        'binh ga': 'bills_gas',
        'gas dun': 'bills_gas',
        'binh gas': 'bills_gas',
        'ro ri ga': 'housing_repair'
      }
    },
    {
      slug: 'transport_taxi', type: 'expense', name: 'Grab / Taxi', icon: 'taxi', color: '#10b981',
      parentSlug: 'transport',
      keywords: {
        brand: ['grab', 'gojek', 'be', 'be taxi', 'mai linh', 'vinasun', 'taxi mai linh', 'taxi vinasun', 'g7 taxi', 'g7taxi', 'sm taxi', 'xanh sm', 'xanhsm', 'fastgo', 'aha move', 'ahamove', 'lalamove'],
        strong: ['di grab', 'goi grab', 'dat grab', 'di taxi', 'goi taxi', 'dat taxi', 'di xe om', 'goi xe om', 'xe om', 'grab bike', 'grab car', 'grabbike', 'grabcar', 'be bike', 'be car', 'gojek bike', 'cuoc taxi', 'cuoc grab'],
        weak: ['taxi']
      },
      antiKeywords: {
        'grabfood': 'food_delivery',
        'grab food': 'food_delivery',
        'gojek food': 'food_delivery',
        'be food': 'food_delivery',
        'shopee food': 'food_delivery'
      }
    },
    {
      slug: 'transport_ticket', type: 'expense', name: 'Vé xe / Máy bay', icon: 'plane', color: '#0ea5e9',
      parentSlug: 'transport',
      keywords: {
        brand: ['vietnam airlines', 'vietjet', 'vietjet air', 'bamboo airways', 'vietravel airlines', 'pacific airlines', 'phuong trang', 'futa', 'futa bus', 'hoang long', 'mai linh', 'mailinh', 'kumho', 'hoang long bus', 'thanh buoi', 'phuc xuyen'],
        strong: ['ve may bay', 've mb', 've xe khach', 've tau', 've tau hoa', 've tau lua', 'datxe', 'dat ve', 've xe', 've xe lua', 've bay', 'mua ve', 've train', 'cuoc bay', 'phi san bay', 've xe bus', 've xe buyt', 've xe khac', 've metro', 'flight'],
        weak: []
      },
      antiKeywords: {
        've xem phim': 'ent_movies',
        've concert': 'ent_movies',
        've vao cua': 'ent_movies',
        've du lich': 'ent_travel'
      }
    },
    {
      slug: 'transport_parking', type: 'expense', name: 'Gửi xe', icon: 'parking', color: '#6366f1',
      parentSlug: 'transport',
      keywords: {
        brand: [],
        strong: ['gui xe', 'tien gui xe', 'phi gui xe', 'bai xe', 'parking', 'do xe', 'phi do xe', 'tien giu xe', 'gui xe may', 'gui o to'],
        weak: []
      }
    },
    // (transport_repair đã GỘP vào transport_vehicle — không còn cat riêng)

    // ─────────────────────── 3. NHÀ Ở ───────────────────────
    {
      slug: 'housing', type: 'expense', name: 'Nhà ở', icon: 'home', color: '#f4a261',
      parentSlug: null,
      keywords: { brand: [], strong: ['nha o', 'tien nha'], weak: [] }
    },
    {
      slug: 'housing_rent', type: 'expense', name: 'Tiền thuê nhà', icon: 'key', color: '#f4a261',
      parentSlug: 'housing',
      keywords: {
        brand: [],
        strong: ['tien thue nha', 'thue nha', 'tien nha tro', 'nha tro', 'phong tro', 'tien phong tro', 'tien thue phong', 'tien thue can ho', 'thue chung cu', 'tien chung cu', 'phi quan ly chung cu', 'phi dich vu chung cu', 'rent house', 'tien co so', 'tien o tro', 'tien thue cho o'],
        weak: ['rent', 'thue']
      },
      antiKeywords: {
        'thue xe': 'transport_taxi',
        'thue tu lanh': 'shop_electronics',
        'thue hoi': 'cer_wedding'
      }
    },
    {
      slug: 'housing_furniture', type: 'expense', name: 'Nội thất / Gia dụng', icon: 'sofa', color: '#a16207',
      parentSlug: 'housing',
      keywords: {
        brand: ['ikea', 'jysk', 'bao bao home', 'nha xinh', 'phuc loc tho', 'minh long', 'happy home'],
        strong: ['mua giuong', 'mua tu', 'mua ban', 'mua ghe', 'mua sofa', 'noi that', 'gia dung', 'do gia dung', 'mua chao', 'mua noi', 'mua bat', 'mua dia', 'mua ly', 'mua coc', 'mua quat', 'mua dem', 'mua rem cua', 'mua mat', 'mua vat dung', 'mua do dung nha bep', 'mua noi com dien', 'mua noi chien khong dau', 'mua may xay sinh to', 'mua may say toc'],
        weak: []
      }
    },
    {
      slug: 'housing_repair', type: 'expense', name: 'Sửa chữa nhà', icon: 'wrench', color: '#92400e',
      parentSlug: 'housing',
      keywords: {
        brand: [],
        strong: ['sua nha', 'sua chua nha', 'son nha', 'thay khoa', 'thay vach', 'son lai nha', 'tho son', 'tho ho', 'tho moc', 'tho sua nha', 'tho dien', 'tho nuoc', 'sua ong nuoc', 'sua dien', 'thay bong den', 'thay vong sen', 'thay voi nuoc', 'sua mai nha', 'sua tuong', 'sua nen', 'lat gach', 'op lat', 'sua nha ve sinh', 'sua bon cau', 'sua chau rua'],
        weak: []
      }
    },

    // ─────────────────────── 4. HÓA ĐƠN ───────────────────────
    {
      slug: 'bills', type: 'expense', name: 'Hóa đơn', icon: 'flame', color: '#f59e0b',
      parentSlug: null,
      keywords: { brand: [], strong: ['hoa don', 'tien dien nuoc'], weak: [] }
    },
    {
      slug: 'bills_electric', type: 'expense', name: 'Tiền điện', icon: 'electricity', color: '#f59e0b',
      parentSlug: 'bills',
      keywords: {
        brand: ['evn', 'evn hcm', 'evn hanoi', 'pc tphcm', 'pc hanoi'],
        strong: ['tien dien', 'hoa don dien', 'tra tien dien', 'thanh toan dien', 'cuoc dien', 'evn dien'],
        weak: []
      },
      antiKeywords: {
        'dien thoai': 'bills_phone',
        'do dien tu': 'shop_electronics',
        'do dien': 'shop_electronics',
        'thiet bi dien': 'shop_electronics',
        'sua dien': 'housing_repair'
      }
    },
    {
      slug: 'bills_water', type: 'expense', name: 'Tiền nước', icon: 'water', color: '#06b6d4',
      parentSlug: 'bills',
      keywords: {
        brand: ['sawaco', 'hawaco'],
        strong: ['tien nuoc', 'hoa don nuoc', 'tra tien nuoc', 'thanh toan nuoc', 'cuoc nuoc', 'nuoc sach', 'tien nuoc may'],
        weak: []
      },
      antiKeywords: {
        'nuoc ngot': 'food_coffee',
        'nuoc ep': 'food_coffee',
        'nuoc khoang': 'food_grocery',
        'mua nuoc': 'food_grocery',
        'nuoc giai khat': 'food_coffee',
        'nuoc hoa': 'shop_cosmetics'
      }
    },
    {
      slug: 'bills_internet', type: 'expense', name: 'Internet / Truyền hình', icon: 'wifi', color: '#6366f1',
      parentSlug: 'bills',
      keywords: {
        brand: ['fpt telecom', 'fpt internet', 'viettel internet', 'viettel telecom', 'vnpt', 'vnpt internet', 'cmc', 'cmc telecom', 'scnet', 'sct', 'k+', 'k plus', 'fpt play', 'vtv cab', 'shctv', 'truyen hinh cap', 'truyen hinh fpt'],
        strong: ['tien internet', 'tien mang', 'cuoc internet', 'cuoc mang', 'cuoc wifi', 'tien wifi', 'tien truyen hinh', 'tien tv', 'goi internet', 'goi truyen hinh', 'phi internet', 'phi mang', 'goi cap', 'mang internet', 'mang wifi'],
        weak: ['internet', 'wifi']
      }
    },
    {
      slug: 'bills_phone', type: 'expense', name: 'Điện thoại / Data', icon: 'phone', color: '#10b981',
      parentSlug: 'bills',
      keywords: {
        brand: ['viettel', 'mobifone', 'vinaphone', 'vietnamobile', 'itelecom', 'reddi', 'wintel'],
        strong: ['tien dien thoai', 'cuoc dien thoai', 'nap the', 'nap dien thoai', 'nap sim', 'mua the dien thoai', 'the dien thoai', 'goi data', 'tien data', 'goi 4g', 'goi 5g', 'phi sim', 'phi dien thoai', 'tien sim', 'cuoc sim', 'cuoc 4g', 'cuoc 5g'],
        weak: ['phone']
      },
      antiKeywords: {
        'mua dien thoai': 'shop_electronics',
        'iphone': 'shop_electronics',
        'samsung galaxy': 'shop_electronics',
        'mua may': 'shop_electronics'
      }
    },
    {
      slug: 'bills_gas', type: 'expense', name: 'Gas (bếp)', icon: 'flame', color: '#dc2626',
      parentSlug: 'bills',
      keywords: {
        brand: ['petrolimex gas', 'petro gas', 'sai gon gas', 'pv gas'],
        strong: ['binh gas', 'binh ga', 'gas dun', 'mua gas', 'thay gas', 'doi gas', 'gas bep', 'bep gas', 'tien gas', 'gas nau an', 'gas dun bep'],
        weak: []
      },
      antiKeywords: {
        'do xang': 'transport_fuel',
        'xang xe': 'transport_fuel',
        'gas station': 'transport_fuel'
      }
    },

    // ─────────────────────── 5. MUA SẮM ───────────────────────
    {
      slug: 'shopping', type: 'expense', name: 'Mua sắm', icon: 'shopping', color: '#ec4899',
      parentSlug: null,
      keywords: {
        brand: ['shopee', 'lazada', 'tiki', 'sendo', 'tiktok shop', 'shopee mall', 'lazmall'],
        strong: ['mua sam', 'shopping', 'mua online'],
        weak: []
      }
    },
    {
      slug: 'shop_clothes', type: 'expense', name: 'Quần áo / Giày dép', icon: 'shirt', color: '#ec4899',
      parentSlug: 'shopping',
      keywords: {
        brand: ['uniqlo', 'h&m', 'hm', 'zara', 'mango', 'levi', 'levis', 'nike', 'adidas', 'puma', 'fila', 'converse', 'vans', 'reebok', 'new balance', 'vascara', 'juno', 'biti', 'biti hunter', 'canifa', 'ivy moda', 'elise', 'old navy', 'pull&bear', 'bershka', 'stradivarius', 'cotton on'],
        strong: ['mua quan ao', 'mua ao', 'mua ao moi', 'mua quan moi', 'mua giay', 'mua dep', 'mua tat', 'mua giay dep', 'quan ao', 'giay dep', 'tu quan ao', 'mua jeans', 'mua so mi', 'mua ao thun', 'mua ao khoac', 'mua vay', 'mua dam', 'mua suit', 'mua ao len', 'mua ao polo', 'mua ao dai'],
        weak: []
      }
    },
    {
      slug: 'shop_cosmetics', type: 'expense', name: 'Mỹ phẩm', icon: 'sparkles', color: '#f472b6',
      parentSlug: 'shopping',
      keywords: {
        brand: ['guardian', 'watsons', 'medicare', 'beautybox', 'sociolla', 'sephora', 'innisfree', 'the face shop', 'tony moly', 'maybelline', 'lancome', 'chanel', 'dior', 'mac', 'ysl', 'yves saint laurent', 'la mer', 'sk-ii', 'sk2', 'estee lauder', 'shiseido', 'kose', 'olay', 'nivea', 'dove', 'pantene', 'tresemme', 'l\'oreal', 'loreal', 'garnier', 'ohui', 'sulwhasoo', 'bbia', 'merzy', 'romand', 'rom&nd', 'cocoon', 'thefaceshop', '3ce', 'cle de peau', 'fenty beauty', 'mac cosmetics', 'anessa', 'biore', 'la roche posay', 'cerave', 'cetaphil', 'eucerin', 'simple', 'paula\'s choice', 'paulas choice', 'kiehl', 'kiehls', 'clinique', 'origins', 'aveeno', 'pond', 'oriflame'],
        strong: ['my pham', 'mua son', 'mua kem duong', 'kem chong nang', 'kem duong da', 'kem duong am', 'tay trang', 'sua rua mat', 'sua tam', 'dau goi', 'dau xa', 'dau goi dau', 'kem danh rang', 'son moi', 'phan nen', 'mascara', 'eyeliner', 'phan mat', 'che khuyet diem', 'kem nen', 'cushion', 'serum', 'toner', 'mat na', 'son tint', 'son li', 'son duong', 'nuoc hoa', 'lan khu mui', 'cham soc da', 'lan da', 'duong toc'],
        weak: ['serum', 'mascara']
      },
      antiKeywords: {
        'mua kem an': 'food_snack',
        'kem an': 'food_snack'
      }
    },
    {
      slug: 'shop_electronics', type: 'expense', name: 'Đồ điện tử', icon: 'tv', color: '#3b82f6',
      parentSlug: 'shopping',
      keywords: {
        brand: ['apple', 'iphone', 'ipad', 'macbook', 'imac', 'samsung', 'samsung galaxy', 'oppo', 'xiaomi', 'redmi', 'huawei', 'vivo', 'realme', 'nokia', 'sony', 'lg', 'panasonic', 'philips', 'dell', 'hp', 'asus', 'acer', 'lenovo', 'msi', 'logitech', 'jbl', 'bose', 'sennheiser', 'airpods', 'galaxy buds', 'apple watch', 'galaxy watch', 'fpt shop', 'the gioi di dong', 'tgdd', 'cellphones', 'didongviet', 'di dong viet', 'fpt long chau', 'dien may xanh', 'dmx', 'nguyen kim', 'pico', 'mediamart'],
        strong: ['mua dien thoai', 'mua laptop', 'mua may tinh', 'mua tablet', 'mua ipad', 'mua iphone', 'mua macbook', 'mua tai nghe', 'mua loa', 'mua tivi', 'mua tv', 'mua tu lanh', 'mua may giat', 'mua dieu hoa', 'mua may lanh', 'mua may say', 'mua bep', 'mua noi com', 'mua quat dien', 'mua ban la', 'mua may pha ca phe', 'mua may xay', 'mua chuot', 'mua ban phim', 'mua man hinh', 'mua sac', 'mua cap sac', 'mua pin du phong', 'do dien tu', 'thiet bi dien'],
        weak: []
      }
    },
    {
      slug: 'shop_personal', type: 'expense', name: 'Đồ dùng cá nhân', icon: 'gem', color: '#a855f7',
      parentSlug: 'shopping',
      keywords: {
        brand: ['rolex', 'casio', 'citizen', 'seiko', 'pnj', 'doji'],
        strong: ['mua dong ho', 'mua tui', 'mua vi', 'mua kinh', 'mua kinh mat', 'mua trang suc', 'mua nhan', 'mua day chuyen', 'mua bong tai', 'mua vong tay', 'mua vong co', 'mua khan', 'mua mu', 'mua non', 'mua balo', 'mua cap', 'mua va li', 'mua vali', 'mua o', 'mua du'],
        weak: []
      }
    },

    // ─────────────────────── 6. SỨC KHỎE ───────────────────────
    {
      slug: 'health', type: 'expense', name: 'Sức khỏe', icon: 'heart', color: '#e63946',
      parentSlug: null,
      keywords: { brand: [], strong: ['suc khoe'], weak: [] }
    },
    {
      slug: 'health_medical', type: 'expense', name: 'Khám / Thuốc', icon: 'pill', color: '#e63946',
      parentSlug: 'health',
      keywords: {
        brand: ['vinmec', 'fv', 'bv fv', 'tam anh', 'columbia asia', 'hoan my', 'medlatec', 'long chau', 'pharmacity', 'an khang', 'fpt long chau', 'med 247', 'medicare', 'ecopharma'],
        strong: ['kham benh', 'kham bac si', 'di kham', 'mua thuoc', 'tien thuoc', 'don thuoc', 'thuoc tay', 'nha thuoc', 'phong kham', 'benh vien', 'phau thuat', 'mo', 'tiem', 'vac xin', 'tiem vac xin', 'tiem chung', 'xet nghiem', 'xrau', 'nha si', 'tram rang', 'lay cao rang', 'nho rang', 'trong rang', 'kham rang', 'kham mat', 'do kinh', 'cat kinh', 'kham phu khoa', 'sieu am', 'noi soi', 'tien vien phi', 'vien phi'],
        weak: ['thuoc', 'kham', 'mo']
      },
      antiKeywords: {
        'mo cua': 'shopping',
        'tiem an': 'food_dining',
        'tiem ca phe': 'food_coffee',
        'tiem': 'food_dining'
      }
    },
    {
      slug: 'health_gym', type: 'expense', name: 'Gym / Thể thao', icon: 'dumbbell', color: '#16a34a',
      parentSlug: 'health',
      keywords: {
        brand: ['california', 'california fitness', 'cali fitness', 'getfit', 'gym fitness', 'elite fitness', 'curves', 'fit24', 'citigym', 'star fitness', 'world class'],
        strong: ['gym', 'tap gym', 'phong tap', 'tien gym', 'phi gym', 'tap the duc', 'yoga', 'tap yoga', 'tien yoga', 'pilates', 'zumba', 'kickboxing', 'boxing', 'mma', 'muay thai', 'aerobic', 'tap can bang', 'crossfit', 'spinning', 'bo mon the thao', 'mua sieu xe', 'do tap'],
        weak: ['tap']
      }
    },
    {
      slug: 'health_insurance', type: 'expense', name: 'Bảo hiểm sức khỏe', icon: 'shield', color: '#0891b2',
      parentSlug: 'health',
      keywords: {
        // Brand riêng cho BH y tế (không trùng với BH nhân thọ chung)
        brand: ['pvi care', 'bao hiem viet', 'bao viet healthcare'],
        strong: ['bao hiem suc khoe', 'bao hiem y te', 'bhyt', 'phi bao hiem y te', 'tien bao hiem suc khoe', 'phi bao hiem suc khoe', 'mua bhyt', 'gia han bhyt'],
        weak: []
      }
    },

    // ─────────────────────── 7. GIÁO DỤC ───────────────────────
    {
      slug: 'education', type: 'expense', name: 'Giáo dục', icon: 'graduation', color: '#4f86c6',
      parentSlug: null,
      keywords: { brand: [], strong: ['giao duc', 'hoc'], weak: [] }
    },
    {
      slug: 'edu_tuition', type: 'expense', name: 'Học phí', icon: 'graduation', color: '#4f86c6',
      parentSlug: 'education',
      keywords: {
        brand: [],
        strong: ['hoc phi', 'tien hoc', 'tien hoc phi', 'dong hoc phi', 'hoc phi truong', 'hoc phi dai hoc', 'hoc phi cao hoc', 'hoc phi thac si', 'hoc phi tien si', 'tien truong', 'phi hoc', 'tien hoc them', 'dong tien hoc', 'tien giao trinh', 'hoc phi mam non', 'hoc phi tieu hoc', 'hoc phi cap 2', 'hoc phi cap 3'],
        weak: []
      }
    },
    {
      slug: 'edu_books', type: 'expense', name: 'Sách / Khóa học', icon: 'book', color: '#1e40af',
      parentSlug: 'education',
      keywords: {
        brand: ['fahasa', 'tiki sach', 'nha sach', 'phuong nam', 'kim dong', 'tre book', 'nxb tre', 'nxb kim dong', 'udemy', 'coursera', 'edx', 'kyna', 'unica', 'edumall', 'duolingo', 'grammarly'],
        strong: ['mua sach', 'tien sach', 'sach hoc', 'sach bai tap', 'sach giao khoa', 'sgk', 'tai lieu', 'mua tai lieu', 'tai lieu hoc', 'in tai lieu', 'hoc tieng anh', 'khoa hoc online', 'khoa hoc', 'ielts', 'toeic', 'tieng nhat', 'tieng han', 'tieng trung', 'tieng phap', 'khoa hoc lap trinh', 'hoc lap trinh', 'truong tieng anh', 'trung tam ngoai ngu', 'gia su', 'hoc them'],
        weak: ['sach']
      }
    },
    {
      slug: 'edu_supplies', type: 'expense', name: 'Đồ dùng học tập', icon: 'backpack', color: '#7c3aed',
      parentSlug: 'education',
      keywords: {
        brand: [],
        strong: ['mua but', 'mua vo', 'mua tap', 'mua bao bia', 'mua cap sach', 'mua balo hoc', 'mua but bi', 'mua but chi', 'mua but mau', 'mua tay', 'mua thuoc ke', 'mua giay', 'mua tap vo', 'do dung hoc tap', 'do dung hoc'],
        weak: []
      }
    },

    // ─────────────────────── 8. GIẢI TRÍ ───────────────────────
    {
      slug: 'entertainment', type: 'expense', name: 'Giải trí', icon: 'film', color: '#a855f7',
      parentSlug: null,
      keywords: { brand: [], strong: ['giai tri', 'di choi'], weak: [] }
    },
    {
      slug: 'ent_movies', type: 'expense', name: 'Phim / Sự kiện', icon: 'ticket', color: '#a855f7',
      parentSlug: 'entertainment',
      keywords: {
        brand: ['cgv', 'lotte cinema', 'galaxy cinema', 'beta cinemas', 'bhd star', 'bhd', 'cineplex', 'mega gs', 'platinum cineplex', 'starlight cinema'],
        strong: ['xem phim', 'di xem phim', 've xem phim', 'mua ve phim', 'mua ve concert', 'concert', 'show', 'live show', 've concert', 've show', 've bong da', 'xem bong da', 'xem the thao', 'su kien', 'event', 've event', 've vao cua', 've trien lam', 'trien lam', 've nhac hoi', 'nhac hoi', 'rap chieu phim', 'kara', 'karaoke', 'di karaoke', 'tien karaoke', 'phong karaoke'],
        weak: ['phim', 'show']
      }
    },
    {
      slug: 'ent_travel', type: 'expense', name: 'Du lịch', icon: 'travel', color: '#14b8a6',
      parentSlug: 'entertainment',
      keywords: {
        brand: ['agoda', 'booking', 'booking.com', 'airbnb', 'traveloka', 'expedia', 'vntrip', 'mytour', 'ivivu', 'vinpearl', 'fusion', 'flc', 'tui xanh', 'saigon tourist', 'fiditour', 'vietravel'],
        strong: ['du lich', 'di du lich', 'tour du lich', 'dat phong', 'dat khach san', 'dat resort', 'tien khach san', 'phi khach san', 'tien resort', 'tien homestay', 'dat homestay', 'tien tour', 'phi tour', 'tien du lich', 'chi phi du lich', 'di phuot', 'phuot', 'cam trai', 'tien khach san', 'mua tour', 'visa du lich', 'phi visa', 'lam visa'],
        weak: ['tour']
      },
      antiKeywords: {
        've xe': 'transport_ticket',
        've may bay': 'transport_ticket'
      }
    },
    {
      slug: 'ent_subscription', type: 'expense', name: 'Subscription / App', icon: 'tv', color: '#dc2626',
      parentSlug: 'entertainment',
      keywords: {
        brand: ['netflix', 'spotify', 'apple music', 'youtube premium', 'youtube music', 'fpt play', 'galaxy play', 'vieon', 'k+', 'k plus', 'amazon prime', 'disney plus', 'disney+', 'hbo max', 'hbo go', 'tiktok plus', 'icloud', 'google one', 'dropbox', 'onedrive', 'microsoft 365', 'office 365', 'adobe', 'adobe creative cloud', 'canva pro', 'notion plus', 'chatgpt plus', 'claude pro', 'github copilot', 'jetbrains', 'figma', 'dribbble', 'discord nitro', 'twitch'],
        strong: ['gia han netflix', 'gia han spotify', 'gia han subscription', 'subscription', 'goi premium', 'tien netflix', 'tien spotify', 'tien youtube', 'tien icloud', 'phi premium', 'thue bao app', 'mua app', 'in app purchase', 'gia han app', 'goi gia han', 'phi sub', 'sub'],
        weak: ['app', 'sub']
      }
    },
    {
      slug: 'ent_hobby', type: 'expense', name: 'Sở thích', icon: 'hobby', color: '#fb923c',
      parentSlug: 'entertainment',
      keywords: {
        brand: ['steam', 'playstation', 'ps5', 'ps4', 'xbox', 'nintendo', 'switch'],
        strong: ['mua game', 'nap game', 'so thich', 'do choi', 'mua do choi', 'mua sach truyen', 'mua tranh', 'mua bo do choi', 'mua bo lego', 'lego', 'mua xe mo hinh', 'mua mo hinh', 'mua dan', 'mua guitar', 'mua piano', 'tien hoc dan', 'choi game', 'cay co', 'choi co', 'choi co tuong', 'cau ca', 'do cau ca', 'mua may anh', 'lens may anh', 'mua duong cu camping', 'cam trai', 'leo nui'],
        weak: []
      }
    },

    // ─────────────────────── 9. GIA ĐÌNH ───────────────────────
    {
      slug: 'family', type: 'expense', name: 'Gia đình', icon: 'family', color: '#e65a9e',
      parentSlug: null,
      keywords: { brand: [], strong: ['gia dinh'], weak: [] }
    },
    {
      slug: 'fam_parents', type: 'expense', name: 'Biếu cha mẹ', icon: 'heart', color: '#e65a9e',
      parentSlug: 'family',
      keywords: {
        brand: [],
        strong: ['bieu me', 'bieu cha', 'bieu bo', 'bieu ba', 'bieu ong', 'bieu ba ngoai', 'bieu ong ngoai', 'bieu ong noi', 'bieu ba noi', 'cho me', 'cho cha', 'cho bo', 'cho ba', 'cho ong', 'gui me', 'gui cha', 'gui bo', 'gui ba', 'gui tien me', 'gui tien cha', 'gui tien bo', 'tien cho me', 'tien cho cha', 'tien cho bo', 'tien cho ba', 'tien hieu thao', 'tien tieng te'],
        weak: []
      }
    },
    {
      slug: 'fam_children', type: 'expense', name: 'Sữa / Bỉm con', icon: 'baby', color: '#fb7185',
      parentSlug: 'family',
      keywords: {
        brand: ['friso', 'friso gold', 'similac', 'enfa', 'enfagrow', 'pediasure', 'meiji', 'morinaga', 'glico', 'aptamil', 'nan', 'nestle', 'vinamilk', 'th true milk', 'huggies', 'pampers', 'bobby', 'merries', 'goon', 'moony', 'huggies', 'genki'],
        strong: ['sua bot', 'sua cong thuc', 'sua cho be', 'sua tre em', 'mua bim', 'tien bim', 'mua ta', 'tien ta', 'ta bim', 'do dung em be', 'do em be', 'do cho be', 'do cho con', 'mua do cho con', 'mua quan ao con', 'mua giay con', 'do choi con', 'thuoc cho be', 'kham con', 'tiem chung con', 'vac xin con', 'thay ta', 'do so sinh'],
        weak: ['bim', 'ta', 'sua be']
      },
      antiKeywords: {
        'sua tam': 'shop_cosmetics',
        'sua rua mat': 'shop_cosmetics',
        'sua duong': 'shop_cosmetics',
        'sua tuoi uong': 'food_grocery',
        'mua sua tuoi': 'food_grocery'
      }
    },
    {
      slug: 'fam_school', type: 'expense', name: 'Học phí con', icon: 'graduation', color: '#0ea5e9',
      parentSlug: 'family',
      keywords: {
        brand: [],
        strong: ['hoc phi con', 'tien hoc con', 'tien truong con', 'truong cua con', 'dong hoc phi cho con', 'hoc phi cho con', 'tien hoc cho con', 'hoc cho con', 'tien hoc cho be', 'phi mam non', 'truong mam non', 'gui be o truong', 'tien an cho con', 'tien o truong', 'tien hoc them con', 'tien gia su con', 'sua bao tro hoc tap'],
        weak: []
      }
    },
    {
      slug: 'fam_pet', type: 'expense', name: 'Thú cưng', icon: 'dog', color: '#a16207',
      parentSlug: 'family',
      keywords: {
        brand: ['royal canin', 'whiskas', 'pedigree', 'me-o', 'me o', 'cesar', 'sheba', 'iams', 'ganador'],
        strong: ['thuc an cho cho', 'thuc an cho meo', 'thuc an thu cung', 'mua xich cho', 'do dung cho cho', 'do cho meo', 'tam cho thu cung', 'tam cho cho', 'tam cho meo', 'kham thu y', 'thu y', 'phong kham thu y', 'cat tia long', 'spa cho', 'spa meo', 'mua thu cung', 'pet shop'],
        weak: []
      }
    },

    // ─────────────────────── 10. LỄ NGHĨA ───────────────────────
    {
      slug: 'ceremonies', type: 'expense', name: 'Lễ nghĩa', icon: 'gift', color: '#dc2626',
      parentSlug: null,
      keywords: { brand: [], strong: ['le nghia', 'hieu hi'], weak: [] }
    },
    {
      slug: 'cer_wedding', type: 'expense', name: 'Cưới hỏi', icon: 'heart', color: '#e11d48',
      parentSlug: 'ceremonies',
      keywords: {
        brand: [],
        strong: ['di dam cuoi', 'an cuoi', 'di an cuoi', 'mung cuoi', 'phong bi cuoi', 'tien mung cuoi', 'tien an cuoi', 'cuoi hoi', 'le an hoi', 've cuoi', 'di hoi', 'mung hoi', 'mung dam cuoi', 'tien cuoi cua ban', 'cuoi ban', 'mung anh chi', 'an dam cuoi'],
        weak: ['cuoi']
      },
      antiKeywords: {
        'cuoi cung': 'other'
      }
    },
    {
      slug: 'cer_funeral', type: 'expense', name: 'Viếng / Tang', icon: 'flag', color: '#525252',
      parentSlug: 'ceremonies',
      keywords: {
        brand: [],
        strong: ['di vieng', 'vieng dam tang', 'vieng tang', 'tien vieng', 'phong bi vieng', 'mua hoa vieng', 'vong hoa vieng', 'le tang', 'dam tang', 'di dam tang', 'le truy dieu', 'mua vong tang', 'tien phung dieu', 'phung dieu'],
        weak: ['vieng']
      }
    },
    {
      slug: 'cer_birthday', type: 'expense', name: 'Sinh nhật / Thôi nôi', icon: 'cake', color: '#ec4899',
      parentSlug: 'ceremonies',
      keywords: {
        brand: [],
        strong: ['sinh nhat', 'mua qua sinh nhat', 'mung sinh nhat', 'thoi noi', 'le thoi noi', 'day thang', 'le day thang', 'thoi noi con', 'qua sinh nhat', 'banh sinh nhat', 'mua banh kem', 'tiec sinh nhat', 'birthday', 'di sinh nhat', 'an sinh nhat'],
        weak: ['sn']
      }
    },
    {
      slug: 'cer_gift', type: 'expense', name: 'Quà tặng', icon: 'gift', color: '#f97316',
      parentSlug: 'ceremonies',
      keywords: {
        brand: [],
        strong: ['mua qua', 'qua tang', 'tang qua', 'qua sinh nhat', 'qua tet', 'qua trung thu', 'qua noel', 'qua giang sinh', 'qua valentine', 'mua hoa', 'tang hoa', 'bo hoa', 'gio hoa', 'qua le', 'mua qua tang', 'qua cho ban', 'qua cho ngu', 'qua nhan vien'],
        weak: ['qua']
      }
    },
    {
      slug: 'cer_worship', type: 'expense', name: 'Cúng / Lễ', icon: 'sparkles', color: '#b45309',
      parentSlug: 'ceremonies',
      keywords: {
        brand: [],
        strong: ['di chua', 'le chua', 'le phat', 'cung', 'mua do cung', 'do cung', 'cung mung 1', 'cung ram', 'cung gio', 'gio to', 'gio ba', 'gio ong', 'gio cu', 'gio ngoai', 'gio noi', 'mua nhang', 'nhang den', 'vang ma', 'tien vang ma', 'mua hoa cung', 'mua trai cay cung', 'le don nam', 'cung cuoi nam', 'cung ong cong', 'ong tao'],
        weak: ['cung']
      }
    },
    {
      slug: 'cer_charity', type: 'expense', name: 'Quyên góp / Từ thiện', icon: 'hand', color: '#16a34a',
      parentSlug: 'ceremonies',
      keywords: {
        brand: [],
        strong: ['quyen gop', 'tu thien', 'lam tu thien', 'cho tu thien', 'ung ho lu lut', 'ung ho thien tai', 'donate', 'donation', 'ung ho mien trung', 'ung ho dong bao', 'gay quy', 'ung ho gay quy', 'cho nguoi ngheo', 'thien nguyen', 'di thien nguyen'],
        weak: []
      }
    },

    // ─────────────────────── 11. TÀI CHÍNH ───────────────────────
    {
      slug: 'finance', type: 'expense', name: 'Tài chính', icon: 'wallet', color: '#0d9488',
      parentSlug: null,
      keywords: { brand: [], strong: ['tai chinh'], weak: [] }
    },
    {
      slug: 'fin_invest', type: 'expense', name: 'Đầu tư', icon: 'trending', color: '#0d9488',
      parentSlug: 'finance',
      keywords: {
        brand: ['ssi', 'vndirect', 'hsc', 'vcsc', 'mbs', 'tcbs', 'vps', 'vci', 'binance', 'remitano', 'finhay', 'tikop', 'momo gold', 'tnex', 'funan', 'topi', 'fmarket'],
        strong: ['mua co phieu', 'dau tu co phieu', 'dau tu chung khoan', 'chung khoan', 'mua chung khoan', 'mua trai phieu', 'mua quy', 'mua quy mo', 'quy mo', 'etf', 'mua etf', 'gop quy', 'mua vang', 'tich vang', 'mua vang sjc', 'vang nhan', 'btc', 'bitcoin', 'eth', 'ethereum', 'crypto', 'tien ao', 'mua bitcoin', 'nap binance', 'usdt', 'mua usdt', 'dau tu bds', 'dau tu bat dong san', 'gop von'],
        weak: []
      }
    },
    {
      slug: 'fin_savings', type: 'expense', name: 'Tiết kiệm', icon: 'piggy', color: '#16a34a',
      parentSlug: 'finance',
      keywords: {
        brand: [],
        strong: ['gui tiet kiem', 'tiet kiem', 'gui ngan hang', 'gui so tk', 'so tiet kiem', 'gui tk', 'mo tk', 'mo tiet kiem', 'gui ki han', 'ki han', 'gui co ki han', 'tiet kiem online', 'cho heo', 'bo heo', 'de danh', 'gui tien tk'],
        weak: ['tk']
      }
    },
    {
      slug: 'fin_insurance', type: 'expense', name: 'Bảo hiểm (nhà/nhân thọ)', icon: 'shield', color: '#0891b2',
      parentSlug: 'finance',
      keywords: {
        brand: ['manulife', 'prudential', 'aia', 'dai-ichi', 'fwd', 'generali'],
        strong: ['bao hiem nha', 'bao hiem chay no', 'bao hiem nhan tho', 'phi bao hiem nhan tho', 'phi bao hiem nha', 'gia han bao hiem nha', 'gia han bao hiem nhan tho', 'mua bao hiem nha', 'mua bao hiem nhan tho'],
        weak: []
      },
      antiKeywords: {
        // Bảo hiểm xe ô tô / xe máy → vào "Chi phí xe" để theo dõi tổng chi phí xe đó
        'bao hiem xe': 'transport_vehicle',
        'bao hiem o to': 'transport_vehicle',
        'bao hiem xe may': 'transport_vehicle',
        'phi bao hiem xe': 'transport_vehicle',
        'mua bao hiem xe': 'transport_vehicle',
        // Bảo hiểm sức khỏe → cat riêng
        'bao hiem suc khoe': 'health_insurance',
        'bao hiem y te': 'health_insurance'
      }
    },
    {
      slug: 'fin_debt', type: 'expense', name: 'Trả nợ', icon: 'card', color: '#dc2626',
      parentSlug: 'finance',
      keywords: {
        brand: [],
        strong: ['tra no', 'tra goc', 'tra lai', 'goc va lai', 'tra ngan hang', 'tra vay', 'tra tien vay', 'no ngan hang', 'tra credit card', 'tra the tin dung', 'sao ke the tin dung', 'tra tien the', 'thanh toan the tin dung', 'tra du no', 'no du', 'tra no ban', 'tra no anh', 'tra no chi', 'tra cho ban', 'gop hang thang', 'tra gop'],
        weak: []
      }
    },
    {
      slug: 'fin_fees', type: 'expense', name: 'Phí ngân hàng / Thuế', icon: 'bank', color: '#525252',
      parentSlug: 'finance',
      keywords: {
        brand: [],
        strong: ['phi ngan hang', 'phi chuyen khoan', 'phi rut tien', 'phi atm', 'phi sms banking', 'phi sao ke', 'phi duy tri', 'phi quan ly tk', 'thue thu nhap', 'thue tncn', 'thue gia tri gia tang', 'thue vat', 'thue mon bai', 'phi cong chung', 'phi truoc ba', 'phi sang ten', 'phi dang ky xe'],
        weak: []
      },
      antiKeywords: {
        'thue nha': 'housing_rent',
        'thue xe': 'transport_taxi'
      }
    },

    // ─────────────────────── 12. KHÁC ───────────────────────
    {
      slug: 'other', type: 'expense', name: 'Khác', icon: 'other', color: '#888888',
      parentSlug: null,
      keywords: { brand: [], strong: [], weak: [] }
    }
  ];

  // ============================================================
  // INCOME — 5 cha · 13 con
  // ============================================================
  const INCOME_CATEGORIES = [
    // ─────────────────────── 1. THU NHẬP CHÍNH ───────────────────────
    {
      slug: 'income_main', type: 'income', name: 'Thu nhập chính', icon: 'briefcase', color: '#2d6a4f',
      parentSlug: null,
      keywords: { brand: [], strong: ['thu nhap chinh'], weak: [] }
    },
    {
      slug: 'inc_salary', type: 'income', name: 'Lương', icon: 'salary', color: '#2d6a4f',
      parentSlug: 'income_main',
      keywords: {
        brand: [],
        strong: ['luong', 'tien luong', 'luong thang', 'salary', 'luong ve', 'nhan luong', 'luong moi'],
        weak: []
      }
    },
    {
      slug: 'inc_overtime', type: 'income', name: 'OT / Tăng ca', icon: 'trending', color: '#10b981',
      parentSlug: 'income_main',
      keywords: {
        brand: [],
        strong: ['ot', 'overtime', 'tang ca', 'tien ot', 'lam them gio', 'phu cap tang ca', 'tien tang ca'],
        weak: []
      }
    },
    {
      slug: 'inc_allowance', type: 'income', name: 'Phụ cấp / Trợ cấp', icon: 'coin', color: '#84cc16',
      parentSlug: 'income_main',
      keywords: {
        brand: [],
        strong: ['phu cap', 'tro cap', 'phu cap an trua', 'phu cap di lai', 'phu cap dien thoai', 'phu cap xang', 'tro cap that nghiep', 'tro cap thai san', 'tien thai san', 'phu cap thai san', 'phu cap chuc vu'],
        weak: []
      }
    },

    // ─────────────────────── 2. THU NHẬP PHỤ ───────────────────────
    {
      slug: 'income_extra', type: 'income', name: 'Thu nhập phụ', icon: 'award', color: '#f59e0b',
      parentSlug: null,
      keywords: { brand: [], strong: ['thu nhap phu'], weak: [] }
    },
    {
      slug: 'inc_bonus', type: 'income', name: 'Thưởng (KPI / Tết)', icon: 'award', color: '#f59e0b',
      parentSlug: 'income_extra',
      keywords: {
        brand: [],
        strong: ['thuong', 'tien thuong', 'bonus', 'thuong tet', 'thuong cuoi nam', 'thuong nam', 'thuong kpi', 'thuong du an', 'thuong nong', 'thuong quy', 'thuong nam moi', 'thuong thang 13', 'luong thang 13'],
        weak: []
      }
    },
    {
      slug: 'inc_freelance', type: 'income', name: 'Freelance / Dự án', icon: 'laptop', color: '#6366f1',
      parentSlug: 'income_extra',
      keywords: {
        brand: ['upwork', 'fiverr', 'freelancer', 'toptal', 'vlance'],
        strong: ['freelance', 'tien du an', 'tien project', 'project', 'lam them', 'nhan du an', 'lam du an ngoai', 'freelancer', 'tien lam them', 'tien chia se', 'fee freelance'],
        weak: []
      }
    },
    {
      slug: 'inc_sales', type: 'income', name: 'Bán hàng / Đồ cũ', icon: 'shop', color: '#ec4899',
      parentSlug: 'income_extra',
      keywords: {
        brand: ['cho tot', 'chotot', 'shopee seller', 'lazada seller'],
        strong: ['ban hang', 'ban do cu', 'ban thanh ly', 'ban online', 'ban shopee', 'thanh ly', 'thanh ly do cu', 'tien ban hang', 'doanh thu ban hang', 'ban di', 'ban lai', 'ban sach cu', 'ban dien thoai cu', 'ban quan ao cu'],
        weak: []
      }
    },

    // ─────────────────────── 3. TÀI CHÍNH ───────────────────────
    {
      slug: 'income_finance', type: 'income', name: 'Tài chính', icon: 'trending', color: '#10b981',
      parentSlug: null,
      keywords: { brand: [], strong: ['thu tai chinh'], weak: [] }
    },
    {
      slug: 'inc_savings_interest', type: 'income', name: 'Lãi tiết kiệm', icon: 'piggy', color: '#10b981',
      parentSlug: 'income_finance',
      keywords: {
        brand: [],
        strong: ['lai tiet kiem', 'lai tk', 'lai ngan hang', 'tien lai tiet kiem', 'lai gui ngan hang', 'lai dao han', 'tat toan tk', 'tat toan tiet kiem'],
        weak: []
      }
    },
    {
      slug: 'inc_dividend', type: 'income', name: 'Cổ tức', icon: 'coins', color: '#16a34a',
      parentSlug: 'income_finance',
      keywords: {
        brand: [],
        strong: ['co tuc', 'tien co tuc', 'dividend', 'co tuc tien mat', 'co tuc co phieu', 'tra co tuc'],
        weak: []
      }
    },
    {
      slug: 'inc_rent', type: 'income', name: 'Tiền cho thuê', icon: 'key', color: '#0891b2',
      parentSlug: 'income_finance',
      keywords: {
        brand: [],
        strong: ['cho thue', 'tien cho thue', 'thu tien thue', 'tien thue nha thu', 'cho thue nha', 'cho thue phong', 'cho thue can ho', 'cho thue cua hang', 'cho thue xe', 'cho thue mat bang', 'thue thu hang thang', 'tien khach thue'],
        weak: []
      }
    },
    {
      slug: 'inc_invest_gain', type: 'income', name: 'Lãi đầu tư', icon: 'bitcoin', color: '#eab308',
      parentSlug: 'income_finance',
      keywords: {
        brand: [],
        strong: ['lai dau tu', 'lai chung khoan', 'lai co phieu', 'lai crypto', 'lai bitcoin', 'lai trade', 'tien lai chung khoan', 'tien lai dau tu', 'chot lai', 'chot loi', 'rut lai', 'ban co phieu lai', 'lai vang', 'tien lai vang'],
        weak: []
      }
    },

    // ─────────────────────── 4. BIẾU TẶNG / HOÀN TIỀN ───────────────────────
    {
      slug: 'income_gift', type: 'income', name: 'Biếu tặng / Hoàn tiền', icon: 'gift', color: '#e65a9e',
      parentSlug: null,
      keywords: { brand: [], strong: ['bieu tang'], weak: [] }
    },
    {
      slug: 'inc_gift', type: 'income', name: 'Lì xì / Quà tặng', icon: 'gift', color: '#e65a9e',
      parentSlug: 'income_gift',
      keywords: {
        brand: [],
        strong: ['li xi', 'lixi', 'tien li xi', 'mung tuoi', 'nhan li xi', 'qua tet', 'nhan qua', 'nhan qua tang', 'tien mung', 'duoc li xi', 'li xi tet', 'me cho tien', 'bo cho tien', 'me bieu', 'duoc bieu'],
        weak: []
      }
    },
    {
      slug: 'inc_cashback', type: 'income', name: 'Cashback / Hoàn tiền', icon: 'coin', color: '#f59e0b',
      parentSlug: 'income_gift',
      keywords: {
        brand: ['shopback', 'tiki xu', 'shopee xu', 'lazada xu', 'momo xu'],
        strong: ['cashback', 'hoan tien', 'tien hoan', 'tien thuong shopee', 'xu shopee', 'xu lazada', 'xu tiki', 'voucher hoan tien', 'tra lai tien', 'hoan lai tien'],
        weak: []
      }
    },
    {
      slug: 'inc_loan_back', type: 'income', name: 'Thu hồi cho vay', icon: 'hand', color: '#16a34a',
      parentSlug: 'income_gift',
      keywords: {
        brand: [],
        strong: ['thu hoi vay', 'doi tien', 'doi tien vay', 'ban tra no', 'ban tra tien', 'thu lai tien cho vay', 'lay lai tien cho muon', 'doi no', 'thu hoi no', 'tra lai tien cho vay'],
        weak: []
      }
    },

    // ─────────────────────── 5. KHÁC ───────────────────────
    {
      slug: 'income_other', type: 'income', name: 'Khác', icon: 'other', color: '#888888',
      parentSlug: null,
      keywords: { brand: [], strong: [], weak: [] }
    }
  ];

  // ============================================================
  // MIGRATION MAP — tên cat cũ (đã normalize) → slug mới
  // Bao gồm cả bộ default cũ + biến thể user thường tự đặt
  // ============================================================
  const MIGRATION_MAP = {
    // ====== EXPENSE ======
    // Bộ default cũ trong storage.js
    'an uong': 'food',
    'ca phe tra sua': 'food_coffee',
    'ca phe / tra sua': 'food_coffee',
    'cafe': 'food_coffee',
    'di sieu thi': 'food_grocery',
    'sieu thi': 'food_grocery',
    'di cho': 'food_grocery',
    'an vat': 'food_snack',
    'dat do an': 'food_delivery',
    'an ngoai': 'food_dining',
    'an nha hang': 'food_dining',
    'nha hang': 'food_dining',

    'xang xe': 'transport_vehicle',
    'xang': 'transport_vehicle',
    'chi phi xe': 'transport_vehicle',
    'sua xe': 'transport_vehicle',
    'bao duong xe': 'transport_vehicle',
    'bao duong / sua xe': 'transport_vehicle',
    'sua chua xe': 'transport_vehicle',
    // Slug cũ V2 → slug mới (cho user đã migrate trước)
    'transport_fuel': 'transport_vehicle',
    'transport_repair': 'transport_vehicle',
    'xe co': 'transport',
    'di lai grab': 'transport_taxi',
    'di lai / grab': 'transport_taxi',
    'di lai': 'transport',
    'grab': 'transport_taxi',
    'taxi': 'transport_taxi',
    've xe': 'transport_ticket',
    've may bay': 'transport_ticket',
    'gui xe': 'transport_parking',
    'do xe': 'transport_parking',

    'tien nha': 'housing_rent',
    'thue nha': 'housing_rent',
    'nha o': 'housing',
    'do gia dung': 'housing_furniture',
    'noi that': 'housing_furniture',
    'sua nha': 'housing_repair',

    'tien dien': 'bills_electric',
    'dien': 'bills_electric',
    'tien nuoc': 'bills_water',
    'nuoc': 'bills_water',
    'internet / dien thoai': 'bills_internet',
    'internet': 'bills_internet',
    'dien thoai': 'bills_phone',
    'tien dien thoai': 'bills_phone',
    'wifi': 'bills_internet',
    'gas': 'bills_gas',
    'tien gas': 'bills_gas',

    'mua sam': 'shopping',
    'shopping': 'shopping',
    'quan ao': 'shop_clothes',
    'quan ao giay dep': 'shop_clothes',
    'my pham': 'shop_cosmetics',
    'do dien tu': 'shop_electronics',
    'dien tu': 'shop_electronics',

    'suc khoe': 'health',
    'suc khoe / thuoc': 'health_medical',
    'suc khoe thuoc': 'health_medical',
    'thuoc': 'health_medical',
    'kham benh': 'health_medical',
    'gym': 'health_gym',
    'the duc': 'health_gym',
    'bao hiem': 'fin_insurance',
    'bao hiem suc khoe': 'health_insurance',

    'giai tri': 'entertainment',
    'xem phim': 'ent_movies',
    'phim': 'ent_movies',
    'du lich': 'ent_travel',
    'subscription': 'ent_subscription',
    'so thich': 'ent_hobby',

    'hoc hanh': 'education',
    'hoc phi': 'edu_tuition',
    'sach': 'edu_books',
    'khoa hoc': 'edu_books',

    'gia dinh': 'family',
    'gia dinh / bieu tang': 'fam_parents',
    'bieu tang': 'fam_parents',
    'bieu cha me': 'fam_parents',
    'bieu bo me': 'fam_parents',
    'bieu me': 'fam_parents',
    'sua bim con': 'fam_children',
    'sua bim': 'fam_children',
    'tien hoc con': 'fam_school',
    'thu cung': 'fam_pet',
    'pet': 'fam_pet',

    'hieu hi': 'cer_wedding',
    'cuoi hoi': 'cer_wedding',
    'le nghia': 'ceremonies',
    'tang le': 'cer_funeral',
    'vieng tang': 'cer_funeral',
    'sinh nhat': 'cer_birthday',
    'qua tang': 'cer_gift',
    'cung le': 'cer_worship',
    'tam linh': 'cer_worship',
    'tu thien': 'cer_charity',

    'tai chinh': 'finance',
    'dau tu': 'fin_invest',
    'tiet kiem': 'fin_savings',
    'tra no': 'fin_debt',
    'phi ngan hang': 'fin_fees',
    'thue': 'fin_fees',

    'khac': 'other',

    // ====== INCOME ======
    'luong': 'inc_salary',
    'tien luong': 'inc_salary',
    'thuong': 'inc_bonus',
    'bonus': 'inc_bonus',
    'thuong tet': 'inc_bonus',
    'dau tu (thu)': 'inc_invest_gain',
    'lai dau tu': 'inc_invest_gain',
    'co tuc': 'inc_dividend',
    'lai tiet kiem': 'inc_savings_interest',
    'cho thue': 'inc_rent',
    'tien cho thue': 'inc_rent',
    'freelance': 'inc_freelance',
    'ban hang': 'inc_sales',
    'qua tang (thu)': 'inc_gift',
    'li xi': 'inc_gift',
    'cashback': 'inc_cashback',
    'hoan tien': 'inc_cashback'
  };

  // ============================================================
  // Export
  // ============================================================
  window.QLT_CategoriesDefault = {
    EXPENSE: EXPENSE_CATEGORIES,
    INCOME: INCOME_CATEGORIES,
    ALL: [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES],
    MIGRATION_MAP,
    VERSION: 2
  };
})();
