// Test dataset cho category matcher — 100+ test cases
// Format: { input: "câu user gõ/nói", expectedSlug: "slug-cat-đúng", note?: "ghi chú lý do" }
// expectedSlug = '__abstain__' nghĩa là nên ABSTAIN (không đoán) — không được auto-pick.

(function () {
  'use strict';

  const TEST_CASES = [
    // ─────────────────── ĂN UỐNG (15) ───────────────────
    { input: 'cà phê 35k', expectedSlug: 'food_coffee' },
    { input: 'highlands 65k', expectedSlug: 'food_coffee', note: 'brand match' },
    { input: 'phúc long', expectedSlug: 'food_coffee' },
    { input: 'trà sữa gongcha 50k', expectedSlug: 'food_coffee' },
    { input: 'tocotoco', expectedSlug: 'food_coffee' },
    { input: 'ăn trưa cơm tấm 45k', expectedSlug: 'food_dining' },
    { input: 'kfc gà rán 120k', expectedSlug: 'food_dining' },
    { input: 'phở bò 60k', expectedSlug: 'food_dining' },
    { input: 'lẩu thái 350k', expectedSlug: 'food_dining' },
    { input: 'haidilao 600k', expectedSlug: 'food_dining' },
    { input: 'đi chợ 150k', expectedSlug: 'food_grocery' },
    { input: 'bách hóa xanh 200k', expectedSlug: 'food_grocery' },
    { input: 'mua rau thịt cá 180k', expectedSlug: 'food_grocery' },
    { input: 'bánh tráng trộn 25k', expectedSlug: 'food_snack' },
    { input: 'grabfood 80k', expectedSlug: 'food_delivery' },
    { input: 'shopeefood', expectedSlug: 'food_delivery' },

    // ─────────────────── ĐI LẠI (12) ───────────────────
    { input: 'đổ xăng 100k', expectedSlug: 'transport_fuel' },
    { input: 'petrolimex 200k', expectedSlug: 'transport_fuel' },
    { input: 'xăng a95 150k', expectedSlug: 'transport_fuel' },
    { input: 'grab 45k', expectedSlug: 'transport_taxi' },
    { input: 'taxi mai linh 80k', expectedSlug: 'transport_taxi' },
    { input: 'gojek về nhà', expectedSlug: 'transport_taxi' },
    { input: 'be car sân bay', expectedSlug: 'transport_taxi' },
    { input: 'vé máy bay vietjet 1tr5', expectedSlug: 'transport_ticket' },
    { input: 'vé xe phương trang đà lạt 250k', expectedSlug: 'transport_ticket' },
    { input: 'gửi xe 5k', expectedSlug: 'transport_parking' },
    { input: 'thay nhớt xe 150k', expectedSlug: 'transport_repair' },
    { input: 'rửa xe 30k', expectedSlug: 'transport_repair' },

    // ─────────────────── HÓA ĐƠN (10) ───────────────────
    { input: 'tiền điện tháng 5 800k', expectedSlug: 'bills_electric' },
    { input: 'evn 1tr', expectedSlug: 'bills_electric' },
    { input: 'tiền nước 80k', expectedSlug: 'bills_water' },
    { input: 'sawaco 120k', expectedSlug: 'bills_water' },
    { input: 'fpt internet 250k', expectedSlug: 'bills_internet' },
    { input: 'cước wifi 200k', expectedSlug: 'bills_internet' },
    { input: 'nạp thẻ viettel 50k', expectedSlug: 'bills_phone' },
    { input: 'cước điện thoại 100k', expectedSlug: 'bills_phone' },
    { input: 'bình gas 450k', expectedSlug: 'bills_gas' },
    { input: 'đổi gas 380k', expectedSlug: 'bills_gas' },

    // ─────────────────── MUA SẮM (10) ───────────────────
    { input: 'mua áo uniqlo 350k', expectedSlug: 'shop_clothes' },
    { input: 'giày nike 1tr2', expectedSlug: 'shop_clothes' },
    { input: 'son 3ce 280k', expectedSlug: 'shop_cosmetics' },
    { input: 'kem chống nắng anessa 450k', expectedSlug: 'shop_cosmetics' },
    { input: 'iphone 15 25tr', expectedSlug: 'shop_electronics' },
    { input: 'macbook air 28tr', expectedSlug: 'shop_electronics' },
    { input: 'mua tai nghe airpods', expectedSlug: 'shop_electronics' },
    { input: 'mua đồng hồ casio 800k', expectedSlug: 'shop_personal' },
    { input: 'mua balo 350k', expectedSlug: 'shop_personal' },
    { input: 'mua kính mát 500k', expectedSlug: 'shop_personal' },

    // ─────────────────── SỨC KHỎE (8) ───────────────────
    { input: 'mua thuốc cảm 50k', expectedSlug: 'health_medical' },
    { input: 'pharmacity 120k', expectedSlug: 'health_medical' },
    { input: 'khám bác sĩ 200k', expectedSlug: 'health_medical' },
    { input: 'long châu', expectedSlug: 'health_medical' },
    { input: 'tập gym tháng 5', expectedSlug: 'health_gym' },
    { input: 'california fitness 800k', expectedSlug: 'health_gym' },
    { input: 'tập yoga 500k', expectedSlug: 'health_gym' },
    { input: 'phí bảo hiểm sức khỏe', expectedSlug: 'health_insurance' },

    // ─────────────────── GIẢI TRÍ (10) ───────────────────
    { input: 'cgv vé phim 90k', expectedSlug: 'ent_movies' },
    { input: 'xem phim lotte 100k', expectedSlug: 'ent_movies' },
    { input: 'karaoke với bạn 500k', expectedSlug: 'ent_movies' },
    { input: 'du lịch đà lạt', expectedSlug: 'ent_travel' },
    { input: 'đặt khách sạn agoda 1tr5', expectedSlug: 'ent_travel' },
    { input: 'booking.com phòng', expectedSlug: 'ent_travel' },
    { input: 'netflix gia hạn', expectedSlug: 'ent_subscription' },
    { input: 'spotify premium 59k', expectedSlug: 'ent_subscription' },
    { input: 'youtube premium', expectedSlug: 'ent_subscription' },
    { input: 'mua game steam 250k', expectedSlug: 'ent_hobby' },

    // ─────────────────── GIA ĐÌNH + LỄ (10) ───────────────────
    { input: 'biếu mẹ 2tr', expectedSlug: 'fam_parents' },
    { input: 'gửi tiền cho ba 3tr', expectedSlug: 'fam_parents' },
    { input: 'mua sữa friso cho con', expectedSlug: 'fam_children' },
    { input: 'bỉm huggies 250k', expectedSlug: 'fam_children' },
    { input: 'thức ăn cho mèo me-o 80k', expectedSlug: 'fam_pet' },
    { input: 'royal canin chó 350k', expectedSlug: 'fam_pet' },
    { input: 'đám cưới em A 500k', expectedSlug: 'cer_wedding' },
    { input: 'mừng cưới bạn 1tr', expectedSlug: 'cer_wedding' },
    { input: 'viếng đám tang sếp 500k', expectedSlug: 'cer_funeral' },
    { input: 'cúng rằm 200k', expectedSlug: 'cer_worship' },

    // ─────────────────── TÀI CHÍNH (8) ───────────────────
    { input: 'mua cổ phiếu vnm 5tr', expectedSlug: 'fin_invest' },
    { input: 'nạp binance 10tr', expectedSlug: 'fin_invest' },
    { input: 'mua vàng sjc 6tr', expectedSlug: 'fin_invest' },
    { input: 'gửi tiết kiệm 50tr', expectedSlug: 'fin_savings' },
    { input: 'bảo hiểm xe ô tô', expectedSlug: 'fin_insurance' },
    { input: 'trả nợ ngân hàng 5tr', expectedSlug: 'fin_debt' },
    { input: 'thanh toán thẻ tín dụng vcb', expectedSlug: 'fin_debt' },
    { input: 'phí chuyển khoản 11k', expectedSlug: 'fin_fees' },

    // ─────────────────── INCOME (10) ───────────────────
    { input: 'lương về 15tr', expectedSlug: 'inc_salary', note: 'income' },
    { input: 'nhận lương tháng 5', expectedSlug: 'inc_salary' },
    { input: 'thưởng kpi 3tr', expectedSlug: 'inc_bonus' },
    { input: 'thưởng tết 20tr', expectedSlug: 'inc_bonus' },
    { input: 'tiền OT tháng 5', expectedSlug: 'inc_overtime' },
    { input: 'freelance dự án 5tr', expectedSlug: 'inc_freelance' },
    { input: 'bán đồ cũ 500k', expectedSlug: 'inc_sales' },
    { input: 'lì xì tết 1tr', expectedSlug: 'inc_gift' },
    { input: 'cashback shopee 50k', expectedSlug: 'inc_cashback' },
    { input: 'lãi tiết kiệm 2tr', expectedSlug: 'inc_savings_interest' },

    // ─────────────────── BẪY ANTI-KEYWORD (15) ───────────────────
    // Những câu trông giống cat A nhưng phải match cat B
    { input: 'mua máy pha cà phê 5tr', expectedSlug: 'shop_electronics', note: 'BẪY: không phải cà phê' },
    { input: 'hạt cà phê g7 100k', expectedSlug: 'food_grocery', note: 'BẪY' },
    { input: 'gói cà phê hòa tan', expectedSlug: 'food_grocery', note: 'BẪY' },
    { input: 'sữa tắm dove 80k', expectedSlug: 'shop_cosmetics', note: 'BẪY: không phải sữa con' },
    { input: 'sữa rửa mặt cetaphil', expectedSlug: 'shop_cosmetics', note: 'BẪY' },
    { input: 'mua sữa tươi vinamilk 35k', expectedSlug: 'food_grocery', note: 'BẪY: sữa người lớn' },
    { input: 'vé xem phim cgv', expectedSlug: 'ent_movies', note: 'BẪY: không phải vé xe' },
    { input: 'bình gas đun bếp', expectedSlug: 'bills_gas', note: 'BẪY: không phải xăng' },
    { input: 'bếp gas dura 1tr8', expectedSlug: 'bills_gas', note: 'BẪY' },
    { input: 'thuê xe ô tô tự lái', expectedSlug: 'transport_taxi', note: 'BẪY: không phải thuê nhà' },
    { input: 'đồ điện tử mua ở dmx', expectedSlug: 'shop_electronics', note: 'BẪY: không phải tiền điện' },
    { input: 'mua điện thoại iphone', expectedSlug: 'shop_electronics', note: 'BẪY: không phải cước điện thoại' },
    { input: 'sửa điện trong nhà 200k', expectedSlug: 'housing_repair', note: 'BẪY' },
    { input: 'grab food 65k', expectedSlug: 'food_delivery', note: 'BẪY: không phải grab xe' },
    { input: 'gojek food', expectedSlug: 'food_delivery', note: 'BẪY' },

    // ─────────────────── VOICE-STYLE TIẾNG VIỆT KHÔNG DẤU (10) ───────────────────
    { input: 'an com 50k', expectedSlug: 'food_dining' },
    { input: 'ca phe sang 30k', expectedSlug: 'food_coffee' },
    { input: 'do xang xe 100k', expectedSlug: 'transport_fuel' },
    { input: 'di cho 200k', expectedSlug: 'food_grocery' },
    { input: 'thuoc cam 50k', expectedSlug: 'health_medical' },
    { input: 'tien dien thang 5', expectedSlug: 'bills_electric' },
    { input: 'gui tien me 2tr', expectedSlug: 'fam_parents' },
    { input: 'vieng dam tang', expectedSlug: 'cer_funeral' },
    { input: 'luong thang nay 12tr', expectedSlug: 'inc_salary' },
    { input: 'thuong tet 15tr', expectedSlug: 'inc_bonus' },

    // ─────────────────── REGRESSION CASES (real bugs từ user) ───────────────────
    { input: 'đóng học phí cho tôm tháng 5', expectedSlug: 'edu_tuition', note: 'BẪY: "cho" preposition không match Đi chợ' },
    { input: 'học phí cho con tháng 5', expectedSlug: 'fam_school' },
    { input: 'tiền học cho con 2tr', expectedSlug: 'fam_school' },
    { input: 'mua áo cho mẹ 500k', expectedSlug: 'shop_clothes', note: 'BẪY: "cho" không match Đi chợ' },
    { input: 'đi mua quần áo', expectedSlug: 'shop_clothes' },
    { input: 'gửi tiền cho ba 5tr', expectedSlug: 'fam_parents', note: 'BẪY: "cho" preposition' },
    { input: 'cô lâu rồi không gặp', expectedSlug: '__abstain__', note: 'BẪY: "lâu" không phải lẩu' },
    { input: 'sơn nhà 5tr', expectedSlug: 'housing_repair', note: 'BẪY: "sơn" không phải son môi' },
    { input: 'anh sơn cho mượn 1tr', expectedSlug: '__abstain__', note: 'BẪY: tên người, không cat nào' },
    { input: 'lẩu thái nhà hàng', expectedSlug: 'food_dining' },

    // ─────────────────── ABSTAIN (8) — câu quá mơ hồ, phải bỏ đoán ───────────────────
    { input: 'mua đồ 100k', expectedSlug: '__abstain__', note: 'quá mơ hồ' },
    { input: 'tiền nhỏ', expectedSlug: '__abstain__' },
    { input: '50k', expectedSlug: '__abstain__' },
    { input: 'chi phí lặt vặt', expectedSlug: '__abstain__' },
    { input: 'tiêu vặt', expectedSlug: '__abstain__' },
    { input: 'khoản này không nhớ', expectedSlug: '__abstain__' },
    { input: 'abc xyz', expectedSlug: '__abstain__' },
    { input: 'không rõ', expectedSlug: '__abstain__' }
  ];

  // Chạy test, trả về result tổng hợp
  function runTests(categoriesByType) {
    // categoriesByType = { expense: [...], income: [...] }
    const M = window.QLT_CategoryMatcher;
    if (!M) throw new Error('CategoryMatcher not loaded');

    const stats = {
      total: TEST_CASES.length,
      pass: 0,
      fail: 0,
      abstainCorrect: 0,
      abstainExpectedButGuessed: 0,
      results: []
    };

    for (const tc of TEST_CASES) {
      // Quyết định type — tìm slug expected để biết income/expense
      let type = 'expense';
      const def = window.QLT_CategoriesDefault.ALL.find(c => c.slug === tc.expectedSlug);
      if (def) type = def.type;
      // Override income detection cho __abstain__
      if (tc.expectedSlug === '__abstain__') {
        // Default expense, vì 80% test
        type = 'expense';
      }
      const cats = categoriesByType[type] || [];
      const r = M.match(tc.input, cats, { type });

      const matchedSlug = r.categoryId
        ? cats.find(c => c.id === r.categoryId)?.slug
        : null;

      let pass = false;
      if (tc.expectedSlug === '__abstain__') {
        pass = r.confidence < M.THRESHOLD.SUGGEST;
        if (pass) stats.abstainCorrect++;
        else stats.abstainExpectedButGuessed++;
      } else {
        pass = matchedSlug === tc.expectedSlug;
      }

      if (pass) stats.pass++;
      else stats.fail++;

      stats.results.push({
        input: tc.input,
        expected: tc.expectedSlug,
        got: matchedSlug || '(abstain)',
        confidence: r.confidence.toFixed(2),
        tier: r.tier,
        kw: r.matchedKeyword,
        pass,
        note: tc.note
      });
    }

    stats.accuracy = (stats.pass / stats.total * 100).toFixed(1);
    return stats;
  }

  window.QLT_CategoryTestDataset = {
    TEST_CASES,
    runTests
  };
})();
