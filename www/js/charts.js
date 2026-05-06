// Vẽ biểu đồ tự code (không phụ thuộc lib) - đủ dùng cho thống kê
// Các biểu đồ: bar, donut

(function () {
  const Charts = {
    bar(canvas, data, opts = {}) {
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      const cs = getComputedStyle(document.documentElement);
      const textColor = (cs.getPropertyValue('--text') || '#1a1612').trim();
      const text2Color = (cs.getPropertyValue('--text2') || '#6b6258').trim();
      const text3Color = (cs.getPropertyValue('--text3') || '#a89e95').trim();
      const borderColor = (cs.getPropertyValue('--border') || '#e4ddd6').trim();

      if (!data.length) {
        ctx.fillStyle = text3Color;
        ctx.font = '13px DM Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Chưa có dữ liệu', W / 2, H / 2);
        return;
      }

      // Tính profit/loss cho mỗi period (mutually exclusive)
      const enriched = data.map(d => {
        const inc = d.income || 0;
        const exp = d.expense || 0;
        return {
          ...d,
          profit: Math.max(0, inc - exp),
          loss: Math.max(0, exp - inc)
        };
      });

      const padTop = 36, padBottom = 36, padLeft = 12, padRight = 12;
      const innerW = W - padLeft - padRight;
      const innerH = H - padTop - padBottom;
      const max = Math.max(1, ...enriched.map(d => Math.max(d.income || 0, d.expense || 0, d.profit || 0, d.loss || 0)));
      const barGroupW = innerW / enriched.length;
      // 4 bar / group, gap 1px giữa các bar, 4px giữa group
      const barW = Math.min(10, (barGroupW - 4) / 4 - 1);

      // Trục đáy
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, padTop + innerH);
      ctx.lineTo(padLeft + innerW, padTop + innerH);
      ctx.stroke();

      const COLORS = {
        income:  '#52b788',  // xanh sáng
        expense: '#e76f51',  // đỏ cam
        profit:  '#1b4d3e',  // xanh đậm
        loss:    '#a02431'   // đỏ đậm
      };

      enriched.forEach((d, i) => {
        const groupX = padLeft + i * barGroupW + barGroupW / 2;
        // 4 bar offset từ trung tâm: -1.5, -0.5, +0.5, +1.5 (tính từ trung tâm group)
        const offsets = [-1.5, -0.5, 0.5, 1.5].map(o => o * (barW + 1));

        const series = [
          { val: d.income, color: COLORS.income },
          { val: d.expense, color: COLORS.expense },
          { val: d.profit, color: COLORS.profit },
          { val: d.loss, color: COLORS.loss }
        ];

        series.forEach((s, k) => {
          if (s.val <= 0) return;
          const h = s.val / max * innerH;
          const x = groupX + offsets[k] - barW / 2;
          ctx.fillStyle = s.color;
          ctx.fillRect(x, padTop + innerH - h, barW, h);
        });

        ctx.fillStyle = text2Color;
        ctx.font = '10px DM Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.label, groupX, H - padBottom + 14);
      });

      // Legend 2 hàng (4 series chia 2 hàng cho gọn)
      const legend = [
        { color: COLORS.income,  label: 'Thu nhập',  x: padLeft },
        { color: COLORS.expense, label: 'Chi phí',   x: padLeft + 80 },
        { color: COLORS.profit,  label: 'Lợi nhuận', x: padLeft + 160 },
        { color: COLORS.loss,    label: 'Lỗ',        x: padLeft + 240 }
      ];
      ctx.font = '10px DM Sans, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = textColor;
      legend.forEach((l, i) => {
        // Wrap to row 2 nếu hết width
        const isRow2 = (l.x + 60) > innerW;
        const x = isRow2 ? padLeft + (i - 2) * 80 : l.x;
        const y = isRow2 ? 22 : 4;
        ctx.fillStyle = l.color;
        ctx.fillRect(x, y, 9, 9);
        ctx.fillStyle = textColor;
        ctx.fillText(l.label, x + 12, y + 8);
      });
    },

    donut(canvas, slices, opts = {}) {
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, W, H);

      // Theme colors từ CSS variables (cho dark mode)
      const cs = getComputedStyle(document.documentElement);
      const bgFill = (cs.getPropertyValue('--surface') || '#ffffff').trim();
      const textColor = (cs.getPropertyValue('--text') || '#1a1612').trim();
      const text2Color = (cs.getPropertyValue('--text2') || '#6b6258').trim();
      const text3Color = (cs.getPropertyValue('--text3') || '#a89e95').trim();

      const total = slices.reduce((s, x) => s + x.value, 0);
      if (total === 0) {
        ctx.fillStyle = text3Color;
        ctx.font = '13px DM Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Chưa có dữ liệu', W / 2, H / 2);
        return;
      }

      const cx = W / 2;
      const cy = H / 2;
      const r = Math.min(W, H) / 2 - 8;
      const inner = r * 0.62;
      let a = -Math.PI / 2;
      const sliceRanges = []; // {id, start, end, color}
      slices.forEach(s => {
        const ang = (s.value / total) * Math.PI * 2;
        const start = a;
        const end = a + ang;
        ctx.beginPath();
        ctx.fillStyle = s.color || '#52b788';
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, end);
        ctx.closePath();
        ctx.fill();
        sliceRanges.push({ id: s.id, label: s.label, start, end });
        a = end;
      });
      // Lỗ giữa (theo theme)
      ctx.beginPath();
      ctx.fillStyle = bgFill;
      ctx.arc(cx, cy, inner, 0, Math.PI * 2);
      ctx.fill();

      if (opts.centerLabel) {
        ctx.fillStyle = textColor;
        ctx.font = '700 16px DM Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(opts.centerLabel, cx, cy - 6);
        if (opts.centerSub) {
          ctx.fillStyle = text2Color;
          ctx.font = '11px DM Sans, sans-serif';
          ctx.fillText(opts.centerSub, cx, cy + 12);
        }
      }

      // Click → tìm slice tương ứng + gọi opts.onSliceClick
      if (typeof opts.onSliceClick === 'function') {
        canvas.style.cursor = 'pointer';
        canvas.onclick = (e) => {
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left - cx;
          const y = e.clientY - rect.top - cy;
          const dist = Math.sqrt(x * x + y * y);
          if (dist < inner || dist > r) return; // click ở lỗ giữa hoặc ngoài
          // Atan2 giảm dần CCW; donut bắt đầu từ -π/2 (trên) chiều CW
          let ang = Math.atan2(y, x);
          // Normalize sang khoảng [-π/2, 3π/2)
          if (ang < -Math.PI / 2) ang += Math.PI * 2;
          for (const sr of sliceRanges) {
            if (ang >= sr.start && ang < sr.end) {
              opts.onSliceClick(sr);
              return;
            }
          }
        };
      } else {
        canvas.style.cursor = '';
        canvas.onclick = null;
      }
    }
  };

  window.QLT_Charts = Charts;
})();
