/* ============================================================
   K线渲染层：Canvas 绘制 + 交互
   ============================================================ */
(function (root) {
  'use strict';

  var COLORS = {
    bg: '#0d1117',
    grid: '#1e2836',
    gridText: '#6e7d8f',
    up: '#f0524d',      // 中国习惯：涨红
    down: '#26a269',    // 跌绿
    stroke: '#e8b94a',  // 笔：金色
    segment: '#7db8ff', // 线段：蓝色
    center: 'rgba(125,184,255,0.10)',
    centerLine: 'rgba(125,184,255,0.75)',
    topMark: '#f0524d',
    bottomMark: '#26a269',
    fractalTxt: '#a9b6c4'
  };

  function render(canvas, data, opts) {
    opts = opts || {};
    var show = opts.show || { fractal: true, stroke: true, segment: true, center: true };
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;

    var raw = data.rows || [];          // 原始K线
    var mk = data.merged || [];         // 合并后K线
    var strokes = data.strokes || [];
    var segments = data.segments || [];
    var centers = data.centers || [];

    if (raw.length === 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    // 布局
    var padL = 56, padR = 16, padT = 20, padB = 46;
    var W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    var n = raw.length;
    var plotW = W - padL - padR;
    var plotH = H - padT - padB;

    // 价格范围（含笔/线段触及的极值）
    var hi = -Infinity, lo = Infinity;
    raw.forEach(function (k) { hi = Math.max(hi, k.high); lo = Math.min(lo, k.low); });
    var range = (hi - lo) || 1;
    hi += range * 0.06;
    lo -= range * 0.06;
    range = hi - lo;

    var cw = plotW / n;
    var bodyW = Math.max(1, Math.min(cw * 0.68, 14));

    function X(i) { return padL + (i + 0.5) * cw; }
    function Y(p) { return padT + (hi - p) / range * plotH; }

    // ---- 网格与价格轴 ----
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.font = '11px -apple-system, "PingFang SC", sans-serif';
    ctx.fillStyle = COLORS.gridText;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    var gridN = 5;
    for (var g = 0; g <= gridN; g++) {
      var p = lo + (hi - lo) * (g / gridN);
      var y = Y(p);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillText(p.toFixed(2), padL - 8, y);
    }

    // ---- 中枢矩形（最先画，作为背景）----
    if (show.center && centers.length) {
      centers.forEach(function (c) {
        var x1 = X(c.startK), x2 = X(c.endK);
        var y1 = Y(c.ZG), y2 = Y(c.ZD);
        ctx.fillStyle = COLORS.center;
        ctx.fillRect(x1, Math.min(y1, y2), x2 - x1, Math.abs(y2 - y1));
        ctx.strokeStyle = COLORS.centerLine;
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.strokeRect(x1, Math.min(y1, y2), x2 - x1, Math.abs(y2 - y1));
        ctx.setLineDash([]);
        // 标注 ZG / ZD
        ctx.fillStyle = COLORS.centerLine;
        ctx.textAlign = 'left';
        ctx.font = '10px monospace';
        ctx.fillText('ZG ' + c.ZG.toFixed(2), x1 + 4, y1 - 8);
        ctx.fillText('ZD ' + c.ZD.toFixed(2), x1 + 4, y2 + 10);
        ctx.textAlign = 'right';
      });
    }

    // ---- K线（原始，细） ----
    for (var i = 0; i < n; i++) {
      var k = raw[i];
      var up = k.close >= k.open;
      ctx.strokeStyle = up ? COLORS.up : COLORS.down;
      ctx.fillStyle = up ? COLORS.up : COLORS.down;
      ctx.lineWidth = 1;
      var x = X(i);
      // 影线
      ctx.beginPath();
      ctx.moveTo(x, Y(k.high));
      ctx.lineTo(x, Y(k.low));
      ctx.stroke();
      // 实体
      var yo = Y(k.open), yc = Y(k.close);
      var top = Math.min(yo, yc), hh = Math.max(1, Math.abs(yc - yo));
      ctx.fillRect(x - bodyW / 2, top, bodyW, hh);
    }

    // ---- 分型标记 ----
    if (show.fractal) {
      (data.fractals || []).forEach(function (f) {
        var x = X(f.k);
        var y = f.type === 'top' ? Y(f.high) - 9 : Y(f.low) + 9;
        ctx.fillStyle = f.type === 'top' ? COLORS.topMark : COLORS.bottomMark;
        ctx.beginPath();
        if (f.type === 'top') {
          ctx.moveTo(x, y - 4); ctx.lineTo(x - 4, y + 3); ctx.lineTo(x + 4, y + 3);
        } else {
          ctx.moveTo(x, y + 4); ctx.lineTo(x - 4, y - 3); ctx.lineTo(x + 4, y - 3);
        }
        ctx.closePath();
        ctx.fill();
      });
    }

    // ---- 笔（金色折线） ----
    if (show.stroke && strokes.length) {
      ctx.strokeStyle = COLORS.stroke;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      strokes.forEach(function (s, idx) {
        var x1 = X(s.from.k), y1 = Y(s.from.type === 'top' ? s.from.high : s.from.low);
        var x2 = X(s.to.k), y2 = Y(s.to.type === 'top' ? s.to.high : s.to.low);
        if (idx === 0) ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      });
      ctx.stroke();
      // 端点
      ctx.fillStyle = COLORS.stroke;
      strokes.forEach(function (s) {
        [s.from, s.to].forEach(function (p) {
          var x = X(p.k), y = Y(p.type === 'top' ? p.high : p.low);
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        });
      });
    }

    // ---- 线段（蓝色粗线，带端点方框） ----
    if (show.segment && segments.length) {
      ctx.strokeStyle = COLORS.segment;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      segments.forEach(function (s, idx) {
        var x1 = X(s.from.k), y1 = Y(s.from.type === 'top' ? s.from.high : s.from.low);
        var x2 = X(s.to.k), y2 = Y(s.to.type === 'top' ? s.to.high : s.to.low);
        if (idx === 0) ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      });
      ctx.stroke();
      // 端点方框
      segments.forEach(function (s) {
        [s.from, s.to].forEach(function (p) {
          var x = X(p.k), y = Y(p.type === 'top' ? p.high : p.low);
          ctx.fillStyle = COLORS.bg;
          ctx.strokeStyle = COLORS.segment;
          ctx.lineWidth = 1.6;
          ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
          ctx.strokeRect(x - 3.5, y - 3.5, 7, 7);
        });
      });
    }

    // ---- 日期轴 ----
    ctx.fillStyle = COLORS.gridText;
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var tickN = Math.min(6, n);
    var step = Math.max(1, Math.floor(n / tickN));
    for (var t = 0; t < n; t += step) {
      ctx.fillText(raw[t].date, X(t), H - padB + 10);
    }
  }

  root.ChanRender = { render: render, COLORS: COLORS };
})(typeof window !== 'undefined' ? window : globalThis);
