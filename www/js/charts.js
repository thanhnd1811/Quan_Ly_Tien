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

      if (!data.length) {
        ctx.fillStyle = '#a89e95';
        ctx.font = '13px DM Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Chưa có dữ liệu', W / 2, H / 2);
        return;
      }

      const padTop = 20, padBottom = 36, padLeft = 12, padRight = 12;
      const innerW = W - padLeft - padRight;
      const innerH = H - padTop - padBottom;
      const max = Math.max(1, ...data.map(d => Math.max(d.income || 0, d.expense || 0)));
      const barGroupW = innerW / data.length;
      const barW = Math.min(14, (barGroupW - 6) / 2);

      // Trục
      ctx.strokeStyle = '#e4ddd6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, padTop + innerH);
      ctx.lineTo(padLeft + innerW, padTop + innerH);
      ctx.stroke();

      data.forEach((d, i) => {
        const x = padLeft + i * barGroupW + barGroupW / 2;
        const incH = (d.income || 0) / max * innerH;
        const expH = (d.expense || 0) / max * innerH;

        ctx.fillStyle = '#52b788';
        ctx.fillRect(x - barW - 2, padTop + innerH - incH, barW, incH);
        ctx.fillStyle = '#e76f51';
        ctx.fillRect(x + 2, padTop + innerH - expH, barW, expH);

        ctx.fillStyle = '#6b6258';
        ctx.font = '10px DM Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.label, x, H - padBottom + 14);
      });

      // Legend
      ctx.font = '11px DM Sans, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#52b788';
      ctx.fillRect(padLeft, 4, 10, 10);
      ctx.fillStyle = '#1a1612';
      ctx.fillText('Thu', padLeft + 14, 13);
      ctx.fillStyle = '#e76f51';
      ctx.fillRect(padLeft + 50, 4, 10, 10);
      ctx.fillStyle = '#1a1612';
      ctx.fillText('Chi', padLeft + 64, 13);
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

      const total = slices.reduce((s, x) => s + x.value, 0);
      if (total === 0) {
        ctx.fillStyle = '#a89e95';
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
      slices.forEach(s => {
        const ang = (s.value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.fillStyle = s.color || '#52b788';
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, a, a + ang);
        ctx.closePath();
        ctx.fill();
        a += ang;
      });
      // Lỗ giữa
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.arc(cx, cy, inner, 0, Math.PI * 2);
      ctx.fill();

      if (opts.centerLabel) {
        ctx.fillStyle = '#1a1612';
        ctx.font = '700 16px DM Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(opts.centerLabel, cx, cy - 6);
        if (opts.centerSub) {
          ctx.fillStyle = '#6b6258';
          ctx.font = '11px DM Sans, sans-serif';
          ctx.fillText(opts.centerSub, cx, cy + 12);
        }
      }
    }
  };

  window.QLT_Charts = Charts;
})();
