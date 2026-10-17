/* ============================================================
   缠论结构标注核心算法（纯函数，无依赖）
   ------------------------------------------------------------
   流程：K线 → 包含处理 → 分型 → 笔 → 线段 → 中枢
   默认「新笔」标准，可切换「老笔」。
   ============================================================ */
(function (root) {
  'use strict';

  /* ---------- 1. K线包含关系处理 ---------- */
  // 返回处理后的K线数组，每根带 dir（相对前一根的方向：1 向上 / -1 向下 / 0 首根）
  function mergeKlines(klines) {
    if (!klines || klines.length === 0) return [];
    var out = [];
    for (var i = 0; i < klines.length; i++) {
      var k = klines[i];
      var cur = { high: k.high, low: k.low, idx: i, from: [i], dir: 0 };
      if (out.length === 0) {
        out.push(cur);
        continue;
      }
      var prev = out[out.length - 1];
      var contains = (cur.high >= prev.high && cur.low <= prev.low) ||
                     (cur.high <= prev.high && cur.low >= prev.low);
      if (contains) {
        // 需要合并：方向由前一根已处理K线相对更前一根的关系确定
        var dir;
        if (out.length >= 2) {
          var pp = out[out.length - 2];
          dir = (prev.high > pp.high) ? 1 : ((prev.high < pp.high) ? -1 : (prev.dir || 1));
        } else {
          dir = (cur.high > prev.high) ? 1 : -1;
        }
        if (dir === 1) {
          prev.high = Math.max(prev.high, cur.high);
          prev.low = Math.max(prev.low, cur.low);
        } else {
          prev.high = Math.min(prev.high, cur.high);
          prev.low = Math.min(prev.low, cur.low);
        }
        prev.from.push(i);
        prev.dir = dir;
      } else {
        cur.dir = (cur.high > prev.high) ? 1 : -1;
        out.push(cur);
      }
    }
    // 补齐首根方向
    if (out.length >= 2 && out[0].dir === 0) out[0].dir = (out[1].high > out[0].high) ? 1 : -1;
    return out;
  }

  /* ---------- 2. 分型识别 ---------- */
  // 在合并后的K线上找顶/底分型。返回 [{type:'top'|'bottom', i:合并后索引, k:原K线索引, high, low}]
  function findFractals(mk) {
    var res = [];
    for (var i = 1; i < mk.length - 1; i++) {
      var a = mk[i - 1], b = mk[i], c = mk[i + 1];
      if (b.high > a.high && b.high > c.high && b.low > a.low && b.low > c.low) {
        res.push({ type: 'top', i: i, k: b.idx, high: b.high, low: b.low });
      } else if (b.low < a.low && b.low < c.low && b.high < a.high && b.high < c.high) {
        res.push({ type: 'bottom', i: i, k: b.idx, high: b.high, low: b.low });
      }
    }
    return res;
  }

  /* ---------- 3. 画笔 ----------
     standard: 'new'（默认，放宽）| 'old'（严格，分型间至少5根独立K线）
     new 笔：顶底分型之间（不含分型自身及其相邻K线）至少 1 根独立K线（即分型共享K线允许）
     old 笔：顶底分型之间至少 5 根独立K线（不含分型的极值K线）
  */
  function buildStrokes(mk, fractals, standard) {
    standard = standard || 'new';
    // 分型之间需要的最小间隔（以合并后K线根数计）
    // 新笔：顶底分型之间至少 1 根独立K线 → 合并后索引差 >= 2（较宽）
    // 老笔：顶底分型之间至少 3 根独立K线 → 合并后索引差 >= 4（较严）
    // 说明：老笔的经典定义是5根独立K线，但在合并处理后的数据上过于严苛，
    //       会导致大量走势无法成笔。此处采用3根作为工程化折中，并在页面注明。
    var minIdxGap = (standard === 'old') ? 4 : 2;

    // 第一步：同类型分型去重，只保留更极端的
    var seq = [];
    for (var i = 0; i < fractals.length; i++) {
      var f = fractals[i];
      if (seq.length === 0) { seq.push(f); continue; }
      var last = seq[seq.length - 1];
      if (f.type === last.type) {
        // 同类型：保留更极端者（顶取更高，底取更低）
        if (f.type === 'top' ? f.high >= last.high : f.low <= last.low) {
          seq[seq.length - 1] = f;
        }
      } else {
        seq.push(f);
      }
    }

    // 第二步：检查相邻异类型分型的间隔，不足则合并掉（保留更极端的）
    var changed = true;
    while (changed) {
      changed = false;
      for (var k = 0; k < seq.length - 1; k++) {
        var a = seq[k], b = seq[k + 1];
        if (b.i - a.i < minIdxGap) {
          // 间隔不足：两者只能留一个。保留更极端的那个，并把前后接续
          var drop;
          if (a.type === 'top') {
            // a是顶、b是底；间隔太近说明这一对不成立
            // 比较：若 a.high < 前后关系无法简单判断，按「保留更极端」处理
            drop = (a.high - a.low >= b.high - b.low) ? 1 : 0;
          } else {
            drop = (a.high - a.low >= b.high - b.low) ? 1 : 0;
          }
          if (drop === 0) {
            // 删 a，但删除首元素时需保证 seq 仍以有效分型起始
            seq.splice(k, 1);
          } else {
            seq.splice(k + 1, 1);
          }
          changed = true;
          break;
        }
      }
    }

    // 第三步：再次确保顶底交替（合并后可能出现连续同类型）
    var pts = [];
    for (var m = 0; m < seq.length; m++) {
      var cur = seq[m];
      if (pts.length === 0) { pts.push(cur); continue; }
      var pv = pts[pts.length - 1];
      if (cur.type === pv.type) {
        if (cur.type === 'top' ? cur.high >= pv.high : cur.low <= pv.low) {
          pts[pts.length - 1] = cur;
        }
      } else {
        pts.push(cur);
      }
    }

    var strokes = [];
    for (var j = 0; j < pts.length - 1; j++) {
      strokes.push({
        from: pts[j],
        to: pts[j + 1],
        dir: pts[j + 1].type === 'top' ? 1 : -1
      });
    }
    return { strokes: strokes, points: pts };
  }

  /* ---------- 4. 画线段 ----------
     线段至少三笔构成，方向由首笔决定。
     实现采用「反向笔高点序列的顶分型」判定：
       线段由首笔决定方向；取线段内所有反向笔的高点构成序列，
       当该序列出现顶分型（中间笔高点最高）时，说明原方向动能衰竭，线段在该处终结。
     注：这是对特征序列法的工程化近似——不做特征序列的包含合并，
         直接用反向笔的高低点判断，避免合并引入的边界歧义。
  */
  function buildSegments(strokes) {
    var segs = [];
    if (!strokes || strokes.length < 3) return segs;

    var start = 0;
    var guard = 0;
    while (start <= strokes.length - 3 && guard++ < 500) {
      var dir = strokes[start].dir;
      var end = strokes.length - 1;

      // 收集线段内反向笔的高点序列
      var rev = [];
      for (var j = start; j < strokes.length; j++) {
        if (strokes[j].dir !== dir) {
          var s = strokes[j];
          rev.push({
            idx: j,
            high: Math.max(s.from.high, s.to.high),
            low: Math.min(s.from.low, s.to.low)
          });
        }
      }

      // 在反向笔高点上找顶分型（中间高点最高）
      var termStroke = -1;
      for (var b = 1; b < rev.length - 1; b++) {
        if (rev[b].high > rev[b - 1].high && rev[b].high > rev[b + 1].high) {
          // 中线段的终点 = 该反向笔的前一笔的终点
          termStroke = rev[b].idx - 1;
          break;
        }
      }

      if (termStroke >= start && (termStroke - start + 1) >= 3) {
        end = termStroke;
      }

      if ((end - start + 1) >= 3) {
        segs.push({
          fromStroke: start, toStroke: end,
          from: strokes[start].from, to: strokes[end].to,
          dir: dir
        });
        start = end + 1;
      } else {
        break;
      }
    }
    return segs;
  }

  /* ---------- 5. 画中枢 ----------
     取连续三个次级别走势（此处以线段作为次级别构件）的重叠区间。
     ZG = min(三段高点)，ZD = max(三段低点)；ZG > ZD 才成立。
  */
  function buildCenters(segments) {
    var centers = [];
    if (!segments || segments.length < 3) return centers;
    var i = 0;
    while (i + 2 < segments.length) {
      var a = segments[i], b = segments[i + 1], c = segments[i + 2];
      // 三段各自的高点与低点
      var highs = [Math.max(a.from.high, a.to.high),
                   Math.max(b.from.high, b.to.high),
                   Math.max(c.from.high, c.to.high)];
      var lows  = [Math.min(a.from.low, a.to.low),
                   Math.min(b.from.low, b.to.low),
                   Math.min(c.from.low, c.to.low)];
      var ZG = Math.min.apply(null, highs);
      var ZD = Math.max.apply(null, lows);
      if (ZG > ZD) {
        centers.push({
          fromSeg: i, toSeg: i + 2,
          ZG: ZG, ZD: ZD,
          startK: a.from.k, endK: c.to.k
        });
        i += 1; // 滑动一格，允许重叠中枢被识别
      } else {
        i += 1;
      }
    }
    return centers;
  }

  /* ---------- 6. 主流程 ---------- */
  function analyze(rawKlines, opts) {
    opts = opts || {};
    var standard = opts.standard || 'new';
    var mk = mergeKlines(rawKlines);
    var fr = findFractals(mk);
    var st = buildStrokes(mk, fr, standard);
    var sg = buildSegments(st.strokes);
    var ct = buildCenters(sg);
    return {
      standard: standard,
      merged: mk,
      fractals: fr,
      strokes: st.strokes,
      points: st.points,
      segments: sg,
      centers: ct
    };
  }

  /* ---------- 7. 文本解析 ---------- */
  // 支持：制表符/空白/逗号分隔；含或不含日期；列序自动识别
  function parseKlines(text) {
    var lines = String(text || '').split(/\r?\n/);
    var rows = [];
    var errors = [];
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i].trim();
      if (!raw) continue;
      if (/^[#\/]/.test(raw)) continue; // 注释行
      var parts = raw.split(/[\s,;\t]+/).filter(function (x) { return x !== ''; });
      if (parts.length < 4) { errors.push({ line: i + 1, text: raw, why: '字段少于4个' }); continue; }
      // 判断首列是否为日期
      var hasDate = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(parts[0]) || /^\d{8}$/.test(parts[0]);
      var nums = parts.slice(hasDate ? 1 : 0).map(function (x) { return parseFloat(x); });
      if (nums.length < 4 || nums.slice(0, 4).some(function (n) { return isNaN(n); })) {
        errors.push({ line: i + 1, text: raw, why: '数值无法解析' });
        continue;
      }
      // 列序：若给定 4 列，按 开/高/低/收；若5列（含成交量）取前4
      var o = nums[0], h = nums[1], l = nums[2], c = nums[3];
      // 智能纠正：若第二列不是最高，第四列不是收盘，尝试重排
      if (h < Math.max(o, c)) { h = Math.max(o, c, nums[1]); }
      if (l > Math.min(o, c)) { l = Math.min(o, c, nums[2]); }
      rows.push({ date: hasDate ? parts[0] : String(i + 1), open: o, high: h, low: l, close: c });
    }
    return { rows: rows, errors: errors };
  }

  /* ---------- 8. 示例数据（模拟约150根K线，构成完整的多段结构与中枢） ---------- */
  function sampleData() {
    var closes = [];
    function zig(from, to, steps) {
      for (var i = 0; i < steps; i++) {
        closes.push(from + (to - from) * (i / (steps - 1)));
      }
    }
    // 构造目标：形成「向上线段 → 向下线段 → 向上线段 → 向下线段」
    // 每个线段内部包含 3~5 次摆动（即 3~5 个笔），反向笔高点依次抬高/降低后转折
    // 线段一（向上）：底部启动，逐步抬高
    zig(100, 106, 4); zig(106, 103, 3); zig(103, 112, 5); zig(112, 108, 3); zig(108, 118, 5); zig(118, 114, 3); zig(114, 126, 6);
    // 线段二（向下）：逐步降低
    zig(126, 118, 5); zig(118, 122, 3); zig(122, 110, 6); zig(110, 115, 3); zig(115, 102, 6); zig(102, 108, 3); zig(108, 96, 6);
    // 线段三（向上）：再次抬高
    zig(96, 106, 5); zig(106, 101, 3); zig(101, 114, 6); zig(114, 108, 3); zig(108, 124, 6); zig(124, 118, 3); zig(118, 130, 5);
    // 线段四（向下）
    zig(130, 120, 5); zig(120, 124, 3); zig(124, 110, 6); zig(110, 116, 3); zig(116, 103, 6);
    // 尾声
    zig(103, 110, 4);

    var out = [];
    var d = new Date(2026, 0, 1);
    for (var i = 0; i < closes.length; i++) {
      var c = closes[i];
      var prev = i > 0 ? closes[i - 1] : c;
      var o = prev;
      var amp = Math.abs(c - o) * 0.2;
      var h = Math.max(o, c) + amp + 0.3;
      var l = Math.min(o, c) - amp - 0.3;
      d.setDate(d.getDate() + 1);
      var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      out.push(ds + ' ' + o.toFixed(2) + ' ' + h.toFixed(2) + ' ' + l.toFixed(2) + ' ' + c.toFixed(2));
    }
    return out.join('\n');
  }

  var api = {
    mergeKlines: mergeKlines,
    findFractals: findFractals,
    buildStrokes: buildStrokes,
    buildSegments: buildSegments,
    buildCenters: buildCenters,
    analyze: analyze,
    parseKlines: parseKlines,
    sampleData: sampleData
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChanCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
