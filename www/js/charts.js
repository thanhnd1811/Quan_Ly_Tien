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

      // Group bounding boxes — để tap detect
      const groupBoxes = [];
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

        // Lưu bbox để tap detect
        groupBoxes.push({
          xMin: padLeft + i * barGroupW,
          xMax: padLeft + (i + 1) * barGroupW,
          data: d
        });
      });

      // Hover + tap tooltip cho bar chart
      const fmtN = (v) => {
        if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (Math.abs(v) >= 1000) return Math.round(v / 1000) + 'k';
        return Math.round(v) + '';
      };
      const buildBarTooltip = (d) => {
        const inc = d.income || 0;
        const exp = d.expense || 0;
        const profit = Math.max(0, inc - exp);
        const loss = Math.max(0, exp - inc);
        return `<div style="font-weight:700;margin-bottom:4px">${d.label || ''}</div>` +
          (inc > 0 ? `<div style="color:#52b788">▲ Thu: ${fmtN(inc)} đ</div>` : '') +
          (exp > 0 ? `<div style="color:#ff8a7a">▼ Chi: ${fmtN(exp)} đ</div>` : '') +
          (profit > 0 ? `<div style="color:#9be8b8">+ Lợi: ${fmtN(profit)} đ</div>` : '') +
          (loss > 0 ? `<div style="color:#ffa3ae">- Lỗ: ${fmtN(loss)} đ</div>` : '');
      };
      const findBar = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) * (W / rect.width);
        const y = (clientY - rect.top) * (H / rect.height);
        if (y < padTop || y > padTop + innerH) return null;
        return groupBoxes.find(b => x >= b.xMin && x <= b.xMax) || null;
      };
      const showBarTip = (clientX, clientY) => {
        const found = findBar(clientX, clientY);
        if (!found) {
          if (Charts._hideTooltip) Charts._hideTooltip();
          return;
        }
        const tipEl = document.getElementById('qltChartTooltip');
        // Show tooltip by re-using line chart tooltip helper through document
        const rect = canvas.getBoundingClientRect();
        const xClient = rect.left + (found.xMin + found.xMax) / 2 * (rect.width / W);
        const yClient = rect.top + padTop * (rect.height / H);
        // Use Charts internal showTooltip via shared element
        let tip = document.getElementById('qltChartTooltip');
        if (!tip) {
          tip = document.createElement('div');
          tip.id = 'qltChartTooltip';
          tip.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;background:rgba(15,30,22,0.95);color:#fff;padding:8px 12px;border-radius:8px;font-size:12px;line-height:1.5;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:240px;opacity:0;transition:opacity .12s ease;transform:translate(-50%, -100%) translateY(-8px)';
          document.body.appendChild(tip);
        }
        tip.innerHTML = buildBarTooltip(found.data);
        tip.style.left = xClient + 'px';
        tip.style.top = yClient + 'px';
        tip.style.opacity = '1';
      };

      canvas.style.cursor = 'pointer';
      canvas.onmousemove = (e) => showBarTip(e.clientX, e.clientY);
      canvas.onmouseleave = () => { if (Charts._hideTooltip) Charts._hideTooltip(); };
      canvas.ontouchstart = (e) => {
        const t = e.touches[0];
        if (t) showBarTip(t.clientX, t.clientY);
      };
      canvas.ontouchmove = (e) => {
        const t = e.touches[0];
        if (t) { showBarTip(t.clientX, t.clientY); e.preventDefault(); }
      };
      canvas.ontouchend = canvas.ontouchcancel = () => {
        setTimeout(() => { if (Charts._hideTooltip) Charts._hideTooltip(); }, 1500);
      };

      if (typeof opts.onBarClick === 'function') {
        canvas.onclick = (e) => {
          const found = findBar(e.clientX, e.clientY);
          if (found) opts.onBarClick(found.data);
        };
      } else {
        canvas.onclick = null;
      }

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

      // Tooltip + click handler cho donut
      const findSlice = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        const x = (clientX - rect.left) * (W / rect.width) - cx;
        const y = (clientY - rect.top) * (H / rect.height) - cy;
        const dist = Math.sqrt(x * x + y * y);
        if (dist < inner || dist > r) return null;
        let ang = Math.atan2(y, x);
        if (ang < -Math.PI / 2) ang += Math.PI * 2;
        for (const sr of sliceRanges) {
          if (ang >= sr.start && ang < sr.end) return sr;
        }
        return null;
      };
      const totalAll = total;
      const fmtN = (v) => {
        if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (Math.abs(v) >= 1000) return Math.round(v / 1000) + 'k';
        return Math.round(v) + '';
      };
      const showSliceTip = (clientX, clientY) => {
        const sr = findSlice(clientX, clientY);
        if (!sr) {
          if (Charts._hideTooltip) Charts._hideTooltip();
          return;
        }
        const slice = slices.find(s => s.id === sr.id) || slices.find(s =>
          s.color === sr.color && s.value === sr.value
        ) || sr;
        const pct = totalAll > 0 ? Math.round((slice.value / totalAll) * 100) : 0;
        let tip = document.getElementById('qltChartTooltip');
        if (!tip) {
          tip = document.createElement('div');
          tip.id = 'qltChartTooltip';
          tip.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;background:rgba(15,30,22,0.95);color:#fff;padding:8px 12px;border-radius:8px;font-size:12px;line-height:1.5;box-shadow:0 4px 12px rgba(0,0,0,.3);max-width:240px;opacity:0;transition:opacity .12s ease;transform:translate(-50%, -100%) translateY(-8px)';
          document.body.appendChild(tip);
        }
        tip.innerHTML =
          `<div style="font-weight:700;margin-bottom:2px">${slice.label || slice.name || ''}</div>` +
          `<div>${fmtN(slice.value)} đ · <strong>${pct}%</strong></div>`;
        tip.style.left = clientX + 'px';
        tip.style.top = clientY + 'px';
        tip.style.opacity = '1';
      };

      canvas.style.cursor = 'pointer';
      canvas.onmousemove = (e) => showSliceTip(e.clientX, e.clientY);
      canvas.onmouseleave = () => { if (Charts._hideTooltip) Charts._hideTooltip(); };
      canvas.ontouchstart = (e) => {
        const t = e.touches[0];
        if (t) showSliceTip(t.clientX, t.clientY);
      };
      canvas.ontouchmove = (e) => {
        const t = e.touches[0];
        if (t) { showSliceTip(t.clientX, t.clientY); e.preventDefault(); }
      };
      canvas.ontouchend = canvas.ontouchcancel = () => {
        setTimeout(() => { if (Charts._hideTooltip) Charts._hideTooltip(); }, 1500);
      };

      if (typeof opts.onSliceClick === 'function') {
        canvas.onclick = (e) => {
          const sr = findSlice(e.clientX, e.clientY);
          if (sr) opts.onSliceClick(sr);
        };
      } else {
        canvas.onclick = null;
      }
    }
  };

  // Tooltip element shared cho mọi chart — singleton DOM.
  function ensureTooltip() {
    let tip = document.getElementById('qltChartTooltip');
    if (tip) return tip;
    tip = document.createElement('div');
    tip.id = 'qltChartTooltip';
    tip.style.cssText = `
      position:fixed;z-index:9999;pointer-events:none;
      background:rgba(15,30,22,0.95);color:#fff;
      padding:8px 12px;border-radius:8px;font-size:12px;
      line-height:1.5;box-shadow:0 4px 12px rgba(0,0,0,.3);
      backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
      max-width:240px;opacity:0;transition:opacity .12s ease;
      transform:translate(-50%, -100%) translateY(-8px);
    `;
    document.body.appendChild(tip);
    return tip;
  }
  function showTooltip(html, x, y) {
    const tip = ensureTooltip();
    tip.innerHTML = html;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
    tip.style.opacity = '1';
  }
  function hideTooltip() {
    const tip = document.getElementById('qltChartTooltip');
    if (tip) tip.style.opacity = '0';
  }
  Charts._hideTooltip = hideTooltip;

  // Line chart (single line with optional area fill) — dùng cho Net Worth, trends.
  // data: [{ label, value, sublabel? }]
  // opts: { color, fillColor, formatValue (fn), onPointClick (fn), tooltipFormat (fn) }
  Charts.line = function (canvas, data, opts = {}) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const cs = getComputedStyle(document.documentElement);
    const text3Color = (cs.getPropertyValue('--text3') || '#a89e95').trim();
    const borderColor = (cs.getPropertyValue('--border') || '#e4ddd6').trim();
    const lineColor = opts.color || '#2d6a4f';
    const fillColor = opts.fillColor || lineColor + '22';
    const fmtVal = opts.formatValue || (v => v.toLocaleString('vi-VN'));
    const tooltipFormat = opts.tooltipFormat || ((d) =>
      `<div style="font-weight:600;margin-bottom:2px">${d.label}${d.sublabel ? ' · ' + d.sublabel : ''}</div>` +
      `<div>${fmtVal(d.value)}</div>`
    );

    if (!data.length) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = text3Color;
      ctx.font = '13px DM Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Chưa có dữ liệu', W / 2, H / 2);
      return;
    }

    const padTop = 28, padBottom = 32, padLeft = 50, padRight = 16;
    const innerW = W - padLeft - padRight;
    const innerH = H - padTop - padBottom;

    const values = data.map(d => d.value);
    const maxV = Math.max(...values, 0);
    const minV = Math.min(...values, 0);
    const range = Math.max(1, maxV - minV);
    const padRange = range * 0.1;
    const yMax = maxV + padRange;
    const yMin = minV - padRange;
    const yRange = Math.max(1, yMax - yMin);

    const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
    const yScale = (v) => padTop + (1 - (v - yMin) / yRange) * innerH;

    // Render hàm reusable để redraw khi hover (highlight point)
    const draw = (hoverIdx = -1) => {
      ctx.clearRect(0, 0, W, H);

      // Y grid + labels
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 0.5;
      ctx.fillStyle = text3Color;
      ctx.font = '10px DM Sans, sans-serif';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 4; i++) {
        const v = yMin + (yRange * i / 4);
        const y = yScale(v);
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(padLeft + innerW, y);
        ctx.stroke();
        const absV = Math.abs(v);
        let label;
        if (absV >= 1000000) label = (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        else if (absV >= 1000) label = Math.round(v / 1000) + 'k';
        else label = Math.round(v) + '';
        ctx.fillText(label, padLeft - 4, y + 3);
      }

      // Zero line
      if (yMin < 0 && yMax > 0) {
        ctx.strokeStyle = text3Color;
        ctx.lineWidth = 1;
        const yZero = yScale(0);
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.moveTo(padLeft, yZero);
        ctx.lineTo(padLeft + innerW, yZero);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // X labels
      ctx.textAlign = 'center';
      ctx.fillStyle = text3Color;
      const labelStride = data.length > 8 ? Math.ceil(data.length / 8) : 1;
      data.forEach((d, i) => {
        if (i % labelStride !== 0 && i !== data.length - 1) return;
        const x = padLeft + i * stepX;
        ctx.fillText(d.label, x, padTop + innerH + 16);
      });

      // Area fill
      ctx.beginPath();
      ctx.fillStyle = fillColor;
      ctx.moveTo(padLeft, padTop + innerH);
      data.forEach((d, i) => {
        const x = padLeft + i * stepX;
        const y = yScale(d.value);
        ctx.lineTo(x, y);
      });
      ctx.lineTo(padLeft + (data.length - 1) * stepX, padTop + innerH);
      ctx.closePath();
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      data.forEach((d, i) => {
        const x = padLeft + i * stepX;
        const y = yScale(d.value);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Hover guide line vertical
      if (hoverIdx >= 0 && hoverIdx < data.length) {
        const xH = padLeft + hoverIdx * stepX;
        ctx.strokeStyle = lineColor + '66';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(xH, padTop);
        ctx.lineTo(xH, padTop + innerH);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Points
      data.forEach((d, i) => {
        const x = padLeft + i * stepX;
        const y = yScale(d.value);
        const isHover = i === hoverIdx;
        const r = isHover ? 6 : 4;
        ctx.beginPath();
        ctx.fillStyle = '#ffffff';
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = isHover ? 3 : 2;
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      });
    };

    // Initial draw
    draw();

    // Hover detection: mousemove + touchmove → tìm idx gần nhất → redraw + tooltip
    canvas.style.cursor = (typeof opts.onPointClick === 'function') ? 'pointer' : 'crosshair';

    const findIdx = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      // Map px (CSS px) → canvas internal px
      const scaleX = W / rect.width;
      const cx = px * scaleX;
      if (cx < padLeft - 10 || cx > padLeft + innerW + 10) return -1;
      const idx = Math.round((cx - padLeft) / Math.max(1, stepX));
      if (idx < 0 || idx >= data.length) return -1;
      return idx;
    };

    const handleMove = (clientX, clientY) => {
      const idx = findIdx(clientX, clientY);
      if (idx < 0) {
        draw();
        hideTooltip();
        return;
      }
      draw(idx);
      // Position tooltip near the point
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const xCanvas = padLeft + idx * stepX;
      const xClient = rect.left + xCanvas / scaleX;
      const scaleY = H / rect.height;
      const yCanvas = yScale(data[idx].value);
      const yClient = rect.top + yCanvas / scaleY;
      showTooltip(tooltipFormat(data[idx], idx), xClient, yClient);
    };

    canvas.onmousemove = (e) => handleMove(e.clientX, e.clientY);
    canvas.onmouseleave = () => { draw(); hideTooltip(); };
    canvas.ontouchstart = (e) => {
      const t = e.touches[0];
      if (t) handleMove(t.clientX, t.clientY);
    };
    canvas.ontouchmove = (e) => {
      const t = e.touches[0];
      if (t) {
        handleMove(t.clientX, t.clientY);
        e.preventDefault();
      }
    };
    canvas.ontouchend = canvas.ontouchcancel = () => {
      // Delay hide tooltip để user thấy info trên cuối touch
      setTimeout(() => { draw(); hideTooltip(); }, 1500);
    };

    // Click handler — gọi onPointClick nếu có
    if (typeof opts.onPointClick === 'function') {
      canvas.onclick = (e) => {
        const idx = findIdx(e.clientX, e.clientY);
        if (idx >= 0) opts.onPointClick(data[idx], idx);
      };
    } else {
      canvas.onclick = null;
    }
  };

  window.QLT_Charts = Charts;
})();
