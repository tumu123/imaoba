/* ============================================================
   工具页交互逻辑
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = { rows: [], result: null, standard: 'new', show: { fractal: true, stroke: true, segment: true, center: true } };

  /* ---------- 解析与渲染 ---------- */
  function analyze() {
    var text = $('input').value;
    var parsed = ChanCore.parseKlines(text);
    if (!parsed.rows.length) {
      showError('未能解析出任何K线数据，请检查格式。');
      $('stats').innerHTML = '';
      return;
    }
    state.rows = parsed.rows;
    state.result = ChanCore.analyze(parsed.rows, { standard: state.standard });
    hideError();
    if (parsed.errors.length) {
      showWarn(parsed.errors);
    } else {
      hideWarn();
    }
    renderChart();
    renderStats();
  }

  function renderChart() {
    var c = $('chart');
    c.style.width = '100%';
    c.style.height = '420px';
    ChanRender.render(c, {
      rows: state.rows,
      merged: state.result.merged,
      fractals: state.result.fractals,
      strokes: state.result.strokes,
      segments: state.result.segments,
      centers: state.result.centers
    }, { show: state.show });
  }

  function renderStats() {
    var r = state.result;
    var items = [
      ['K线', state.rows.length],
      ['合并后', r.merged.length],
      ['分型', r.fractals.length],
      ['笔', r.strokes.length],
      ['线段', r.segments.length],
      ['中枢', r.centers.length]
    ];
    $('stats').innerHTML = items.map(function (it) {
      return '<div class="stat-item"><b>' + it[1] + '</b><span>' + it[0] + '</span></div>';
    }).join('');

    // 中枢明细
    if (r.centers.length) {
      var rowsHtml = r.centers.map(function (c, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + c.ZG.toFixed(2) + '</td><td>' + c.ZD.toFixed(2) +
               '</td><td>' + (c.ZG - c.ZD).toFixed(2) + '</td></tr>';
      }).join('');
      $('centerBox').style.display = '';
      $('centerTable').innerHTML = '<thead><tr><th>#</th><th>ZG（上沿）</th><th>ZD（下沿）</th><th>区间高度</th></tr></thead><tbody>' + rowsHtml + '</tbody>';
    } else {
      $('centerBox').style.display = 'none';
    }
  }

  /* ---------- 提示 ---------- */
  function showError(msg) {
    var el = $('errors');
    el.className = 'alert alert-err';
    el.style.display = '';
    el.innerHTML = msg;
  }
  function showWarn(errs) {
    var el = $('errors');
    el.className = 'alert alert-warn';
    el.style.display = '';
    el.innerHTML = '<b>' + errs.length + ' 行无法解析（已跳过）：</b><br>' +
      errs.slice(0, 5).map(function (e) {
        return '第 ' + e.line + ' 行「' + escapeHtml(e.text.slice(0, 40)) + '」— ' + e.why;
      }).join('<br>') +
      (errs.length > 5 ? '<br>…还有 ' + (errs.length - 5) + ' 行' : '');
  }
  function hideError() { $('errors').style.display = 'none'; }
  function hideWarn() { $('errors').style.display = 'none'; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- 事件绑定 ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    // 解析按钮
    $('btnRun').addEventListener('click', analyze);

    // 示例数据
    $('btnSample').addEventListener('click', function () {
      $('input').value = ChanCore.sampleData();
      analyze();
    });

    // 清空
    $('btnClear').addEventListener('click', function () {
      $('input').value = '';
      state.rows = []; state.result = null;
      $('stats').innerHTML = '';
      $('centerBox').style.display = 'none';
      $('errors').style.display = 'none';
      var c = $('chart');
      var ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      var dpr = window.devicePixelRatio || 1;
      c.width = c.clientWidth * dpr; c.height = 420 * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, c.clientWidth, 420);
      ctx.fillStyle = '#6e7d8f';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('点击「载入示例数据」或粘贴K线数据后开始', c.clientWidth / 2, 210);
    });

    // 新笔 / 老笔 切换
    var stdBtns = document.querySelectorAll('[data-std]');
    Array.prototype.forEach.call(stdBtns, function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(stdBtns, function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        state.standard = b.dataset.std;
        if (state.rows.length) analyze();
      });
    });

    // 显示开关
    var chk = document.querySelectorAll('[data-show]');
    Array.prototype.forEach.call(chk, function (c) {
      c.addEventListener('change', function () {
        state.show[c.dataset.show] = c.checked;
        if (state.rows.length) renderChart();
      });
    });

    // 导出 PNG
    $('btnPng').addEventListener('click', function () {
      if (!state.rows.length) { alert('请先载入数据'); return; }
      var c = $('chart');
      var a = document.createElement('a');
      a.download = 'chanlun-structure-' + Date.now() + '.png';
      a.href = c.toDataURL('image/png');
      a.click();
    });

    // 导出 JSON
    $('btnJson').addEventListener('click', function () {
      if (!state.result) { alert('请先载入数据'); return; }
      var r = state.result;
      var out = {
        standard: r.standard,
        counts: { klines: state.rows.length, merged: r.merged.length,
                  fractals: r.fractals.length, strokes: r.strokes.length,
                  segments: r.segments.length, centers: r.centers.length },
        strokes: r.strokes.map(function (s) {
          return { from: { k: s.from.k, price: s.from.type === 'top' ? s.from.high : s.from.low, type: s.from.type },
                   to: { k: s.to.k, price: s.to.type === 'top' ? s.to.high : s.to.low, type: s.to.type },
                   dir: s.dir };
        }),
        segments: r.segments.map(function (s) {
          return { fromStroke: s.fromStroke, toStroke: s.toStroke, dir: s.dir };
        }),
        centers: r.centers.map(function (c) {
          return { ZG: +c.ZG.toFixed(3), ZD: +c.ZD.toFixed(3), fromSeg: c.fromSeg, toSeg: c.toSeg };
        })
      };
      var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.download = 'chanlun-structure.json';
      a.href = URL.createObjectURL(blob);
      a.click();
    });

    // 窗口缩放重绘
    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (state.rows.length) renderChart(); }, 150);
    });

    // Ctrl+Enter 快速解析
    $('input').addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); analyze(); }
    });

    // 初始空图
    $('btnClear').click();
  });
})();
