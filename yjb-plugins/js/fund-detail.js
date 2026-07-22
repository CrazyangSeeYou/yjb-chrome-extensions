/**
 * 基金详情 - 净值估算走势图 / 历史净值走势图
 * 基于 funds-master 的 charts.vue / charts2.vue 改造
 * 点击基金名称/行时弹出详情浮层
 *
 * 数据源策略（按优先级）：
 *   1. 天天基金分钟估值明细
 *   2. 基金联接 ETF、跟踪指数或上市基金自身的分钟行情
 *   3. 已披露持仓的分钟行情加权估算
 *   4. 新浪当前估值的真实采样
 */
(function () {
  "use strict";

  // ====== 配置（全部来自 funds-master 源码） ======
  // 天天基金：上游有数据时返回分钟级估值涨跌幅曲线
  var API_INTRADAY =
    "https://fundcomapi.tiantianfunds.com/mm/newCore/FundVarietieValuationDetail?FCODE={code}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0&_={ts}";
  var API_SINA_ESTIMATE = "https://hq.sinajs.cn/list=fu_{code}&_={ts}";
  var API_POSITIONS =
    "https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition?FCODE={code}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0&_={ts}";
  var API_DETAIL =
    "https://fundmobapi.eastmoney.com/FundMNewApi/FundMNDetailInformation?FCODE={code}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0&_={ts}";
  var API_SAME_TYPE =
    "https://fundmobapi.eastmoney.com/FundMNewApi/FundMNSameType?FCODE={code}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0&_={ts}";
  var API_SEARCH =
    "https://searchapi.eastmoney.com/api/suggest/get?input={input}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&_={ts}";
  var API_TRENDS = [
    "https://push2delay.eastmoney.com/api/qt/stock/trends2/get?secid={secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=1&iscr=0&_={ts}",
    "https://push2his.eastmoney.com/api/qt/stock/trends2/get?secid={secid}&fields1=f1,f2,f3,f4,f5,f6,f7,f8,f9,f10,f11,f12,f13&fields2=f51,f52,f53,f54,f55,f56,f57,f58&ndays=1&iscr=0&_={ts}"
  ];
  // funds-master charts2.vue 实际使用的历史净值走势接口（东方财富移动端）
  var API_NETDIAGRAM =
    "https://fundmobapi.eastmoney.com/FundMApi/FundNetDiagram.ashx?FCODE={code}&RANGE={range}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0&_={ts}";

  // 时间轴数据（交易时段 09:30~11:30, 13:00~15:00）
  function genTimeData() {
    var arr = [];
    for (var h = 9; h <= 15; h++) {
      var sM = h === 9 ? 30 : 0;
      var eM = h === 11 ? 30 : h === 15 ? 0 : 59;
      if (h === 12) continue;
      for (var m = sM; m <= eM; m++) {
        arr.push(String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"));
      }
    }
    return arr;
  }
  var TIME_DATA = genTimeData();

  // ====== 状态 ======
  var overlayEl = null;
  var chartInstance = null;
  var renderRequestId = 0;
  var currentFundCode = "";
  var currentFundName = "";
  var activeTab = "history"; // 'gsz' | 'history'
  var currentRange = "n"; // y=月, 3y=季, n=年, 3n=3年, 5n=5年

  // ====== 工具函数 ======

  function extractFundCode(rowEl) {
    var text = rowEl.textContent || "";
    var m = text.match(/\((\d{6})\)/);
    if (m) return m[1];
    m = text.match(/(\d{6})/);
    if (m) return m[1];
    // 列表行默认不渲染基金代码（仅 hover 时显示），从 Vue 组件数据兜底读取
    return extractFundCodeFromVue(rowEl);
  }

  /**
   * 查找持有 fundList / listData 的 Vue 组件公共实例
   */
  function findFundDataProxy() {
    var appEl = document.getElementById("app");
    if (!appEl) return null;
    var candidates = [];
    var app = appEl.__vue_app__;
    if (app && app._instance) candidates.push(app._instance);
    var all = appEl.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var c = all[i].__vueParentComponent;
      if (c) candidates.push(c);
    }
    for (var j = 0; j < candidates.length; j++) {
      var p = candidates[j] && candidates[j].proxy;
      if (p && (Array.isArray(p.fundList) || Array.isArray(p.listData))) return p;
    }
    return null;
  }

  /**
   * 从 Vue 数据中按行位置/名称匹配基金代码
   */
  function extractFundCodeFromVue(rowEl) {
    var proxy = findFundDataProxy();
    if (!proxy) return null;

    var isMain = rowEl.classList.contains("yjb_fund_item");
    var sel = isMain ? ".yjb_fund_item" : ".yjb_m_row";
    var list = isMain ? proxy.fundList : proxy.listData;
    if (!Array.isArray(list) || !list.length) {
      list = Array.isArray(proxy.fundList) ? proxy.fundList : proxy.listData;
    }
    if (!Array.isArray(list)) return null;

    // v-for 渲染顺序与数组顺序一致，按 DOM 行索引取代码
    var rows = document.querySelectorAll(sel);
    var idx = Array.prototype.indexOf.call(rows, rowEl);
    if (idx >= 0 && list[idx] && list[idx].code) return String(list[idx].code);

    // 兜底：按显示名称匹配
    var nameEl = rowEl.querySelector(".yjb_ellipsis, .yjb_m_title");
    var name = nameEl ? nameEl.textContent.trim() : "";
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].short_name === name && list[i].code) {
        return String(list[i].code);
      }
    }
    return null;
  }

  function extractFundName(rowEl) {
    var el =
      rowEl.querySelector(".yjb_ellipsis") ||
      rowEl.querySelector(".yjb_m_title");
    if (el && el.textContent.trim()) return el.textContent.trim();
    var t = (rowEl.textContent || "").trim();
    var m = t.match(/^(.*?)\(\d{6}\)/);
    return m && m[1].trim() ? m[1].trim() : "";
  }

  function parseSinaEstimate(text, code) {
    var match = String(text || "").match(/hq_str_fu_\d+="([^"]*)"/);
    if (!match || !match[1]) return null;
    var fields = match[1].split(",");
    var gsz = parseFloat(fields[2]);
    var dwjz = parseFloat(fields[3]);
    var rate = parseFloat(fields[6]);
    var date = fields[7] || "";
    var time = fields[1] || "";
    if (!(gsz > 0) || !(dwjz > 0) || !Number.isFinite(rate) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    return {
      fundcode: code,
      dwjz: dwjz.toFixed(4),
      gsz: gsz.toFixed(4),
      gszzl: rate.toFixed(2),
      gztime: date + " " + time.substring(0, 5),
      source: "sina"
    };
  }

  function formatLocalDate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function estimateSample(est) {
    var gsz = parseFloat(est && est.gsz);
    var dwjz = parseFloat(est && est.dwjz);
    var rate = parseFloat(est && est.gszzl);
    var match = est && String(est.gztime || "").match(/(\d{4}-\d{2}-\d{2}).*?(\d{2}:\d{2})/);
    if (!(gsz > 0) || !(dwjz > 0) || !Number.isFinite(rate) || !match) return null;
    return { date: match[1], time: match[2], gsz: gsz, dwjz: dwjz, rate: rate, source: est.source || "sina" };
  }

  // ====== 数据获取（全部对齐 funds-master 接口） ======

  /**
   * 获取分时估值明细数据（可能返回 null）
   * 来自 funds-master/charts.vue
   */

  // ====== 浮层 DOM ======

  function createOverlay() {
    if (overlayEl) return overlayEl;

    overlayEl = document.createElement("div");
    overlayEl.id = "fund-detail-overlay";
    overlayEl.innerHTML =
      '\n<style>\n#fund-detail-overlay {\n  display:none;position:fixed;top:0;left:0;width:100%;height:100%;\n  z-index:9999;background:rgba(0,0,0,.65);justify-content:center;align-items:flex-start;\n  padding-top:20px;box-sizing:border-box;\n}\n#fund-detail-overlay.show{display:flex}\n.fd-content{\n  background:#fff;border-radius:10px;width:440px;max-width:95%;max-height:90%;overflow:auto;\n  box-shadow:0 4px 24px rgba(0,0,0,.25);position:relative;\n}\n.fd-header{\n  padding:12px 16px 8px;text-align:center;font-size:14px;font-weight:600;color:#333;\n  border-bottom:1px solid #eee;\n}\n.fd-header small{color:#999;margin-left:6px;font-weight:normal}\n.fd-info-card{\n  display:flex;justify-content:center;gap:24px;padding:8px 16px 4px;\n  font-size:12px;border-bottom:1px solid #f0f0f0;background:#fafbfc;\n}\n.fd-info-item{text-align:center;line-height:1.5}\n.fd-info-label{color:#999;font-size:11px}\n.fd-info-val{font-size:15px;font-weight:600}\n.fd-info-val.up{color:#f56c6c}.fd-info-val.down{color:#4eb61b}.fd-info-val.flat{color:#666}\n.fd-tabs{\n  display:flex;padding:0 16px;border-bottom:1px solid #e4e7ed;\n  background:#f5f7fa;border-radius:0 0 10px 10px;\n}\n.fd-tab{\n  padding:9px 20px;font-size:13px;cursor:pointer;color:#606266;\n  border-bottom:2px solid transparent;transition:all .2s;user-select:none;\n}\n.fd-tab:hover{color:#409eff}\n.fd-tab.active{color:#409eff;border-bottom-color:#409eff;font-weight:600}\n.fd-range-bar{\n  display:none;padding:8px 14px;gap:6px;border-bottom:1px solid #f0f0f0;\n  background:#fcfcfd;align-items:center;flex-wrap:wrap;\n}\n.fd-range-bar.show{display:flex}\n.fd-range-btn{\n  padding:4px 12px;font-size:12px;cursor:pointer;background:#fff;\n  border:1px solid #dcdfe6;border-radius:3px;color:#606266;outline:none;\n}\n.fd-range-btn:hover{color:#409eff;border-color:#c6e2ff}\n.fd-range-btn.active{background:#409eff;color:#fff;border-color:#409eff}\n.fd-body{padding:10px 14px 14px}\n.fd-chart-wrap{width:100%;height:280px}\n.fd-footer{text-align:center;padding:8px 0 14px}\n.fd-btn{\n  display:inline-block;padding:5px 22px;font-size:13px;cursor:pointer;\n  background:#fff;border:1px solid #dcdfe6;border-radius:4px;color:#606266;outline:none;\n}\n.fd-btn:hover{color:#409eff;border-color:#c6e2ff;background:#ecf5ff}\n.fd-close-btn{\n  position:absolute;top:8px;right:10px;font-size:22px;cursor:pointer;\n  color:#999;background:none;border:none;line-height:1;padding:2px 6px;\n}\n.fd-close-btn:hover{color:#333}\n.fd-loading{text-align:center;padding:80px 0;color:#999;font-size:13px}\n.fd-error{text-align:center;padding:60px 0;color:#f56c6c;font-size:13px}\n</style>\n<div class="fd-content">\n  <button class="fd-close-btn" title="关闭">&times;</button>\n  <div class="fd-header"><span class="fd-title"></span><small class="fd-code"></small></div>\n  <div class="fd-info-card">\n    <div class="fd-info-item"><div class="fd-info-label">估算净值</div><div class="fd-info-val flat fd-gsz">--</div></div>\n    <div class="fd-info-item"><div class="fd-info-label">估算涨跌幅</div><div class="fd-info-val flat fd-gszzl">--</div></div>\n    <div class="fd-info-item"><div class="fd-info-label">更新时间</div><div class="fd-info-val flat fd-gztime" style="font-size:12px;font-weight:normal">--</div></div>\n  </div>\n  <div class="fd-tabs">\n    <div class="fd-tab active" data-tab="history">历史净值</div>\n    <div class="fd-tab" data-tab="gsz">净值估算</div>\n  </div>\n  <div class="fd-range-bar fd-range-history">\n    <button class="fd-range-btn" data-range="y">1月</button>\n    <button class="fd-range-btn" data-range="3y">3月</button>\n    <button class="fd-range-btn active" data-range="n">1年</button>\n    <button class="fd-range-btn" data-range="3n">3年</button>\n    <button class="fd-range-btn" data-range="5n">创建以来</button>\n  </div>\n  <div class="fd-body"><div class="fd-chart-wrap"></div></div>\n  <div class="fd-footer"><button class="fd-btn">返回列表</button></div>\n</div>';

    document.body.appendChild(overlayEl);

    overlayEl.querySelector(".fd-close-btn").addEventListener("click", hideDetail);
    overlayEl.querySelector(".fd-btn").addEventListener("click", hideDetail);

    // 遮罩点击关闭
    overlayEl.addEventListener("click", function (e) {
      if (e.target === overlayEl) hideDetail();
    });

    // Tab 切换
    overlayEl.querySelectorAll(".fd-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        switchTab(tab.dataset.tab);
      });
    });

    // 时间范围选择
    overlayEl.querySelectorAll(".fd-range-history .fd-range-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchRange(btn.dataset.range);
      });
    });

    return overlayEl;
  }

  // ====== 显示/隐藏 ======

  function showDetail(fundCode, fundName) {
    renderRequestId += 1;
    currentFundCode = fundCode;
    currentFundName = fundName;
    currentRange = "n";

    var ol = createOverlay();
    ol.querySelector(".fd-title").textContent = fundName || fundCode;
    ol.querySelector(".fd-code").textContent = "(" + fundCode + ")";

    // 重置状态：默认打开历史净值（1年）
    activeTab = "history";
    currentRange = "n";
    updateTabsUI();
    updateRangeBarUI();
    resetInfoCard();
    ol.classList.add("show");

    var wrap = ol.querySelector(".fd-chart-wrap");
    wrap.innerHTML = '<div class="fd-loading">加载中...</div>';

    // 并行请求：分时明细 + 当前估值快照 + 历史净值
    loadAllData(fundCode, wrap);
  }

  function hideDetail() {
    renderRequestId += 1;
    if (overlayEl) overlayEl.classList.remove("show");
    if (chartInstance) {
      chartInstance.dispose();
      chartInstance = null;
    }
    if (estimatePolling) {
      clearInterval(estimatePolling);
      estimatePolling = null;
    }
  }

  // ====== UI 更新 ======

  function resetInfoCard() {
    var el = createOverlay();
    el.querySelector(".fd-gsz").textContent = "--";
    el.querySelector(".fd-gsz").className = "fd-info-val flat fd-gsz";
    el.querySelector(".fd-gszzl").textContent = "--";
    el.querySelector(".fd-gszzl").className = "fd-info-val flat fd-gszzl";
    el.querySelector(".fd-gztime").textContent = "--";
  }

  function updateInfoCard(data) {
    var ol = createOverlay();
    var gszEl = ol.querySelector(".fd-gsz");
    var gzlEl = ol.querySelector(".fd-gszzl");
    var timeEl = ol.querySelector(".fd-gztime");

    if (data && data.gsz) {
      gszEl.textContent = data.gsz;
      gszEl.className = "fd-info-val " + getColorClass(parseFloat(data.gszzl)) + " fd-gsz";
    }
    if (data && data.gszzl !== undefined && data.gszzl !== null && data.gszzl !== "") {
      gzlEl.textContent = (parseFloat(data.gszzl) > 0 ? "+" : "") + data.gszzl + "%";
      gzlEl.className = "fd-info-val " + getColorClass(parseFloat(data.gszzl)) + " fd-gszzl";
    }
    if (data && data.gztime) {
      timeEl.textContent = data.gztime.substring(11); // 只显示 HH:mm
      timeEl.className = "fd-info-val flat fd-gztime";
    }
  }

  function getColorClass(val) {
    if (val > 0) return "up";
    if (val < 0) return "down";
    return "flat";
  }

  function updateTabsUI() {
    var ol = createOverlay();
    ol.querySelectorAll(".fd-tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.tab === activeTab);
    });
    // 历史净值 Tab 才显示范围选择器
    var rangeBar = ol.querySelector(".fd-range-history");
    if (rangeBar) {
      rangeBar.classList.toggle("show", activeTab === "history");
    }
  }

  function updateRangeBarUI() {
    var ol = createOverlay();
    ol.querySelectorAll(".fd-range-history .fd-range-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.range === currentRange);
    });
  }

  function switchTab(tabName) {
    activeTab = tabName;
    updateTabsUI();
    renderCurrentTab();
  }

  function switchRange(rangeName) {
    if (rangeName === currentRange) return;
    currentRange = rangeName;
    updateRangeBarUI();
    renderCurrentTab();
  }

  function renderCurrentTab() {
    var wrap = createOverlay().querySelector(".fd-chart-wrap");
    var requestId = ++renderRequestId;
    var requestedCode = currentFundCode;

    // 清理旧图表
    if (chartInstance) {
      chartInstance.dispose();
      chartInstance = null;
    }

    wrap.innerHTML = '<div class="fd-loading">加载中...</div>';

    if (activeTab === "history") {
      // 历史净值 Tab：使用 currentRange 获取数据
      fetchHistoryDataByRange(currentFundCode, currentRange)
        .then(function (list) {
          if (requestId !== renderRequestId || activeTab !== "history" || requestedCode !== currentFundCode) return;
          if (list && list.length > 0) {
            wrap.innerHTML = "";
            renderHistoryChart(wrap, list, null);
          } else {
            wrap.innerHTML = '<div class="fd-error">暂无历史净值数据</div>';
          }
        })
        .catch(function () {
          if (requestId !== renderRequestId) return;
          wrap.innerHTML = '<div class="fd-error">数据加载失败</div>';
        });
    } else {
      // 净值估算 Tab：优先真实分钟级分时曲线，失败降级合成走势
      fetchEstimateData(currentFundCode)
        .then(function (est) {
          if (requestId !== renderRequestId || activeTab !== "gsz" || requestedCode !== currentFundCode) return;
          if (est) updateInfoCard(est);
          renderEstimateTab(currentFundCode, wrap, est, requestId);
        })
        .catch(function () {
          if (requestId !== renderRequestId) return;
          wrap.innerHTML = '<div class="fd-error">数据加载失败</div>';
        });
    }
  }

  /**
   * 判断当前是否在 A 股交易时段
   * 上午 9:30-11:30，下午 13:00-15:00，周末/节假日为非交易
   */
  function isInTradingHours() {
    var d = new Date();
    var day = d.getDay();
    if (day === 0 || day === 6) return false; // 周末
    var h = d.getHours();
    var m = d.getMinutes();
    var t = h * 60 + m;
    return (t >= 9 * 60 + 30 && t <= 11 * 60 + 30) || (t >= 13 * 60 && t <= 15 * 60);
  }

  // ====== 数据加载与渲染 ======

  function loadAllData(code, wrapEl) {
    var requestId = ++renderRequestId;
    // 并行请求数据源
    Promise.all([
      fetchEstimateData(code),
      fetchHistoryDataByRange(code, currentRange),
    ]).then(function (results) {
      if (requestId !== renderRequestId || code !== currentFundCode) return;
      var estimate = results[0];
      var historyList = results[1];

      // 更新估值信息卡
      if (estimate) updateInfoCard(estimate);

      // 渲染当前 Tab 的图表
      if (activeTab === "gsz") {
        renderEstimateTab(code, wrapEl, estimate, requestId);
      } else {
        if (historyList && historyList.length > 0) {
          wrapEl.innerHTML = "";
          renderHistoryChart(wrapEl, historyList, null);
        } else {
          wrapEl.innerHTML = '<div class="fd-error">暂无历史净值数据</div>';
        }
      }
    });
  }

  /**
   * 渲染"净值估算"Tab：优先基金分钟估值，其次使用联接 ETF 或持仓行情估算。
   */
  function renderEstimateTab(code, wrapEl, estimate, requestId) {
    fetchIntradayData(code).then(function (intraday) {
      if (activeTab !== "gsz" || code !== currentFundCode || requestId !== renderRequestId) return;
      if (intraday) {
        updateInfoCard(estimateFromCurve(intraday, estimate));
        wrapEl.innerHTML = "";
        renderIntradayChart(wrapEl, intraday);
        return;
      }

      fetchDerivedIntradayData(code, estimate).then(function (derived) {
        if (activeTab !== "gsz" || code !== currentFundCode || requestId !== renderRequestId) return;
        if (derived) {
          updateInfoCard(estimateFromCurve(derived, estimate));
          wrapEl.innerHTML = "";
          renderIntradayChart(wrapEl, derived);
          return;
        }
        if (estimateSample(estimate)) {
          wrapEl.innerHTML = "";
          renderSampleCurveChart(wrapEl, estimate, requestId);
          return;
        }
        wrapEl.innerHTML = '<div class="fd-loading" style="padding:68px 34px;line-height:1.8"><strong style="display:block;color:#606266;font-size:14px;margin-bottom:6px">暂无公开盘中估值</strong><span>该基金目前没有可验证的分钟行情或实时估值快照，请在“历史净值”中查看已披露净值。</span></div>';
      });
    });
  }

  function estimateFromCurve(curve, fallback) {
    var rates = curve && curve.rates || [];
    var lastRate = parseFloat(rates[rates.length - 1]);
    var dwjz = parseFloat(curve && curve.dwjz) || parseFloat(fallback && fallback.dwjz) || 0;
    var time = curve && curve.times && curve.times[curve.times.length - 1];
    if (!Number.isFinite(lastRate)) return fallback || null;
    return {
      gsz: dwjz > 0 ? (dwjz * (1 + lastRate / 100)).toFixed(4) : "--",
      gszzl: lastRate.toFixed(2),
      gztime: (curve.tradeDate || estimateDate(fallback) || "") + (time ? " " + time : "")
    };
  }

  /**
   * 获取分时估值明细数据（可能返回 null）
   */
  /**
   * 用当前估值快照渲染"今日估值"图表
   * 数据源：新浪返回的 dwjz(昨日单位净值) + gsz(当前估算净值) + gszzl(估算涨跌幅) + gztime(估值时间)
   * 当分钟明细和资产推导曲线都不可用时，显示当前快照并轮询积累真实采样点。
   */
  var estimatePolling = null;
  var sampleStorage = {}; // {code: [{date, time, gsz, dwjz, rate, source}]}

  /**
   * 接口无分钟数据时的降级方案：把实时采集到的当日涨跌幅点绘制成
   * 与 renderIntradayChart 一致的百分比走势图（0% 基准、全天时间轴）。
   * 首次渲染当前快照，随后每 8 秒轮询累计真实采样点。
   */
  function renderSampleCurveChart(containerEl, est, requestId) {
    var echartsLib = getEcharts();
    if (!echartsLib) {
      containerEl.innerHTML = '<div class="fd-error">图表库未加载</div>';
      return;
    }

    var sample = estimateSample(est);
    if (!sample) {
      containerEl.innerHTML = '<div class="fd-loading" style="padding:68px 34px;line-height:1.8"><strong style="display:block;color:#606266;font-size:14px;margin-bottom:6px">暂无公开盘中估值</strong><span>当前接口没有返回有效的实时估值。</span></div>';
      return;
    }
    var code = currentFundCode;

    // 获取/创建该基金的采样缓存
    if (!sampleStorage[code]) {
      try {
        var stored = JSON.parse(localStorage.getItem("fd_samples_" + code) || "[]");
        sampleStorage[code] = Array.isArray(stored) ? stored : [];
      } catch (e) { sampleStorage[code] = []; }
    }
    var samples = sampleStorage[code];

    var oldDate = new Date().toDateString();
    samples = samples.map(function (item) {
      if (item.date === oldDate) item.date = formatLocalDate(new Date());
      return item;
    }).filter(function (item) { return item.date === sample.date; });
    var lastSample = samples[samples.length - 1];
    if (!lastSample || lastSample.time !== sample.time || Math.abs(lastSample.gsz - sample.gsz) > 0.0001) samples.push(sample);
    try { localStorage.setItem("fd_samples_" + code, JSON.stringify(samples)); } catch (e) {}
    sampleStorage[code] = samples;

    // 复用 renderIntradayChart 的百分比曲线渲染
    renderIntradayChart(containerEl, sampleCurve(samples, est));

    // 启动轮询：每 8 秒拉一次估值，累计更多采样点
    if (estimatePolling) clearInterval(estimatePolling);
    estimatePolling = setInterval(function () {
      if (!overlayEl || !overlayEl.classList.contains("show")) {
        clearInterval(estimatePolling);
        estimatePolling = null;
        return;
      }
      fetchEstimateData(code).then(function (newEst) {
        if (code !== currentFundCode || activeTab !== "gsz" || requestId !== renderRequestId) return;
        var newSample = estimateSample(newEst);
        if (newSample && newSample.date === sample.date && newSample.gsz > 0) {
          updateInfoCard(newEst);
          var last = samples[samples.length - 1];
          if (!last || last.time !== newSample.time || Math.abs(last.gsz - newSample.gsz) > 0.0001) {
            samples.push(newSample);
            try { localStorage.setItem("fd_samples_" + code, JSON.stringify(samples)); } catch (e) {}
            renderIntradayChart(containerEl, sampleCurve(samples, newEst));
          }
        }
      });
    }, 8000);
  }

  /**
   * 把实时采样点归一化为 renderIntradayChart 需要的曲线形状。
   */
  function sampleCurve(samples, est) {
    var currentDate = samples.length ? samples[samples.length - 1].date : "";
    var points = samples
      .filter(function (s) { return !currentDate || s.date === currentDate; })
      .slice()
      .sort(function (a, b) { return a.time < b.time ? -1 : a.time > b.time ? 1 : 0; });
    var source = (est && est.source) || (samples.length ? samples[samples.length - 1].source : "");
    return {
      source: "sampled",
      sourceLabel: (source === "sina" ? "新浪" : "天天基金") + "实时估值采样走势",
      dwjz: parseFloat(est && est.dwjz) || (points.length ? points[0].dwjz : 0),
      times: points.map(function (p) { return p.time; }),
      rates: points.map(function (p) { return p.rate; }),
      tradeDate: currentDate
    };
  }

  /**
   * 获取分钟级分时估值明细
   * 天天基金返回外层 JSON 信封：{data: "<内层JSON字符串>", success:true}
   * 内层结构：{Datas:["idx,HH:MM,gszzl", ...], Expansion:{DWJZ, GZ, GSZZL, GZTIME}}
   * 归一化为 renderIntradayChart 需要的形状后返回，无数据时返回 null
   */
  function fetchIntradayData(code) {
    var url = API_INTRADAY.replace("{code}", code).replace("{ts}", Date.now());
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (envelope) {
        if (!envelope) return null;
        var inner = envelope.data;
        if (typeof inner === "string") {
          try { inner = JSON.parse(inner); } catch (e) { return null; }
        }
        if (inner && Array.isArray(inner.Datas) && inner.Datas.length > 1) {
          var points = inner.Datas.map(function (item) { return item.split(","); });
          var rates = points.map(function (item) { return parseFloat(item[2]); });
          if (!hasCurveVariation(rates)) return null;
      return {
        source: "official",
            sourceLabel: "天天基金分钟估值",
            dwjz: parseFloat(inner.Expansion && inner.Expansion.DWJZ) || 0,
            times: points.map(function (item) { return item[1]; }),
            rates: rates,
            tradeDate: String(inner.Expansion && inner.Expansion.GZTIME || "").substring(0, 10)
          };
        }
        return null;
      })
      .catch(function () { return null; });
  }

  function fetchPositionData(code) {
    var url = API_POSITIONS.replace("{code}", code).replace("{ts}", Date.now());
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (j) { return j && j.Datas ? { data: j.Datas, date: j.Expansion || "" } : null; })
      .catch(function () { return null; });
  }

  function fetchFundDetailData(code) {
    var url = API_DETAIL.replace("{code}", code).replace("{ts}", Date.now());
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (j) { return j && j.Datas ? j.Datas : null; })
      .catch(function () { return null; });
  }

  function fetchQuoteCandidates(input) {
    if (!input || input === "--") return Promise.resolve([]);
    var url = API_SEARCH.replace("{input}", encodeURIComponent(input)).replace("{ts}", Date.now());
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var table = j && j.QuotationCodeTable;
        return table && Array.isArray(table.Data) ? table.Data : [];
      })
      .catch(function () { return []; });
  }

  function fetchRelatedFunds(code) {
    var url = API_SAME_TYPE.replace("{code}", code).replace("{ts}", Date.now());
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var list = j && j.Expansion && j.Expansion.ReleList;
        return Array.isArray(list) ? list : [];
      })
      .catch(function () { return []; });
  }

  function getSecurityId(code, exchange, isEtf) {
    code = String(code || "");
    exchange = String(exchange === undefined || exchange === null ? "" : exchange);
    if (!code) return null;
    if (exchange === "116" || exchange === "5") return "116." + code;
    if (exchange === "105" || exchange === "106" || exchange === "107") return exchange + "." + code;
    if (exchange === "1") return "1." + code;
    if (exchange === "0" || exchange === "2") return "0." + code;
    if (isEtf) return (code.charAt(0) === "5" ? "1." : "0.") + code;
    return (/^(5|6|68)/.test(code) ? "1." : "0.") + code;
  }

  function fetchSecurityTrend(secid) {
    function fetchFrom(index) {
      if (index >= API_TRENDS.length) return Promise.resolve(null);
      var url = API_TRENDS[index].replace("{secid}", encodeURIComponent(secid)).replace("{ts}", Date.now());
      var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = controller ? setTimeout(function () { controller.abort(); }, 3500) : null;
      return fetch(url, controller ? { signal: controller.signal } : undefined).then(function (r) {
        if (!r.ok) throw new Error("Quote request failed");
        return r.json();
      }).then(function (result) {
        if (timer) clearTimeout(timer);
        var data = result && result.data;
        if (!data || !Array.isArray(data.trends) || data.trends.length < 2 || !(parseFloat(data.preClose) > 0)) {
          return fetchFrom(index + 1);
        }
        return result;
      }).catch(function () {
        if (timer) clearTimeout(timer);
        return fetchFrom(index + 1);
      });
    }
    return fetchFrom(0)
      .then(function (j) {
        var data = j && j.data;
        var preClose = parseFloat(data && data.preClose);
        if (!data || !Array.isArray(data.trends) || data.trends.length < 2 || !(preClose > 0)) return null;

        var parsed = data.trends.map(function (row) {
          var fields = row.split(",");
          var stamp = fields[0] || "";
          var price = parseFloat(fields[2]);
          return {
            date: stamp.substring(0, 10),
            time: stamp.substring(11, 16),
            rate: price > 0 ? (price / preClose - 1) * 100 : null
          };
        }).filter(function (point) { return point.time && Number.isFinite(point.rate); });
        if (parsed.length < 2) return null;

        var tradeDate = parsed[parsed.length - 1].date;
        var localSession = parsed.filter(function (point) {
          return point.date === tradeDate && TIME_DATA.indexOf(point.time) !== -1;
        });
        // A 股取当日交易时段；美股等跨午夜市场保留接口返回的完整单日会话。
        parsed = localSession.length >= 2 ? localSession : parsed;
        if (parsed.length < 2) return null;
        return { secid: secid, name: data.name || "", tradeDate: tradeDate, points: parsed };
      });
  }

  function hasCurveVariation(rates) {
    var values = {};
    (rates || []).forEach(function (rate) {
      if (Number.isFinite(Number(rate))) values[Number(rate).toFixed(4)] = true;
    });
    return Object.keys(values).length > 1;
  }

  function estimateDate(estimate) {
    var match = estimate && String(estimate.gztime || "").match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : "";
  }

  function calibrateRates(rates, estimate, tradeDate) {
    var target = parseFloat(estimate && estimate.gszzl);
    if (!rates.length || !Number.isFinite(target)) return rates;
    var currentDate = estimateDate(estimate);
    if (currentDate && tradeDate && currentDate !== tradeDate) return rates;
    var offset = target - rates[rates.length - 1];
    return rates.map(function (rate) { return rate + offset; });
  }

  function buildEtfCurve(position, estimate) {
    var etfCode = String(position.data.ETFCODE || "");
    if (!etfCode) return Promise.resolve(null);
    return fetchSecurityTrend(getSecurityId(etfCode, "", true)).then(function (trend) {
      if (!trend) return null;
      var rates = trend.points.map(function (point) { return point.rate; });
      if (!hasCurveVariation(rates)) return null;
      return {
        source: "linked-etf",
        sourceLabel: "联接 ETF 行情估算（" + (position.data.ETFSHORTNAME || etfCode) + "）",
        dwjz: parseFloat(estimate && estimate.dwjz) || 0,
        times: trend.points.map(function (point) { return point.time; }),
        rates: calibrateRates(rates, estimate, trend.tradeDate),
        tradeDate: trend.tradeDate,
        tradeDate: trend.tradeDate
      };
    });
  }

  function buildSecurityCurve(secid, estimate, source, label) {
    return fetchSecurityTrend(secid).then(function (trend) {
      if (!trend) return null;
      var rates = trend.points.map(function (point) { return point.rate; });
      if (!hasCurveVariation(rates)) return null;
      return {
        source: source,
        sourceLabel: label || trend.name || "交易行情估算",
        dwjz: parseFloat(estimate && estimate.dwjz) || 0,
        times: trend.points.map(function (point) { return point.time; }),
        rates: calibrateRates(rates, estimate, trend.tradeDate),
        axisTimes: trend.points.map(function (point) { return point.time; }),
        tradeDate: trend.tradeDate
      };
    });
  }

  function findIndexQuote(detail) {
    var indexCode = String(detail && detail.INDEXCODE || "");
    var indexName = String(detail && detail.INDEXNAME || "").replace(/指数$/, "");
    if (!indexCode || indexCode === "--") return Promise.resolve(null);
    return Promise.all([fetchQuoteCandidates(indexName), fetchQuoteCandidates(indexCode)]).then(function (groups) {
      var candidates = groups[0].concat(groups[1]);
      var preferred = candidates.filter(function (item) {
        var quoteId = String(item.QuoteID || "");
        var classify = String(item.Classify || "").toLowerCase();
        return quoteId && quoteId.indexOf("150.") !== 0 && classify !== "astock" && String(item.Code || "") === indexCode;
      })[0];
      if (!preferred) {
        preferred = candidates.filter(function (item) {
          var quoteId = String(item.QuoteID || "");
          return quoteId && quoteId.indexOf("150.") !== 0 && String(item.Classify || "").toLowerCase() !== "astock";
        })[0];
      }
      return preferred ? String(preferred.QuoteID || "") : null;
    });
  }

  function buildIndexCurve(detail, estimate) {
    return findIndexQuote(detail).then(function (secid) {
      if (!secid) return null;
      return buildSecurityCurve(secid, estimate, "tracked-index", "跟踪指数行情估算（" + detail.INDEXNAME + "）");
    });
  }

  function buildListedFundCurve(code, detail, estimate) {
    if (!detail || String(detail.FTYPE || "").toLowerCase() !== "reits") return Promise.resolve(null);
    return buildSecurityCurve(getSecurityId(code, "", false), estimate, "listed-fund", "场内基金行情（" + (detail.SHORTNAME || code) + "）");
  }

  function buildRelatedListedCurve(code, detail, estimate) {
    var name = String(detail && detail.SHORTNAME || "");
    if (name.indexOf("LOF") === -1 || name.indexOf("ETF") !== -1) return Promise.resolve(null);
    return fetchRelatedFunds(code).then(function (funds) {
      var listed = funds.filter(function (fund) {
        return fund && fund.FCODE && String(fund.FEATURE || "").split(",").indexOf("020") !== -1;
      })[0];
      if (!listed) return null;
      return buildSecurityCurve(getSecurityId(listed.FCODE, "", true), estimate, "related-lof", "同份额 LOF 行情估算（" + listed.SHORTNAME + "）");
    });
  }

  function buildHoldingsCurve(position, estimate) {
    var stocks = Array.isArray(position.data.fundStocks) ? position.data.fundStocks : [];
    var requests = stocks.map(function (stock) {
      var weight = parseFloat(stock.JZBL);
      var exchange = stock.NEWTEXCH !== undefined ? stock.NEWTEXCH : stock.TEXCH;
      if (!(weight > 0)) return Promise.resolve(null);
      return fetchSecurityTrend(getSecurityId(stock.GPDM, exchange, false)).then(function (trend) {
        return trend ? { weight: weight, trend: trend } : null;
      });
    });

    return Promise.all(requests).then(function (results) {
      var quoted = results.filter(Boolean);
      if (quoted.length < 2) return null;
      var targetDate = estimateDate(estimate);
      if (!targetDate) {
        targetDate = quoted.reduce(function (latest, item) {
          return item.trend.tradeDate > latest ? item.trend.tradeDate : latest;
        }, "");
      }
      quoted = quoted.filter(function (item) { return item.trend.tradeDate === targetDate; });
      var coverageWeight = quoted.reduce(function (sum, item) { return sum + item.weight; }, 0);
      if (quoted.length < 2 || coverageWeight < 5) return null;

      var pointMaps = quoted.map(function (item) {
        var map = {};
        item.trend.points.forEach(function (point) { map[point.time] = point.rate; });
        return { weight: item.weight, map: map, points: item.trend.points };
      });
      var quotedTimes = {};
      pointMaps.forEach(function (item) {
        Object.keys(item.map).forEach(function (time) { quotedTimes[time] = true; });
      });
      var axisTimes = TIME_DATA.filter(function (time) { return quotedTimes[time]; });
      if (axisTimes.length < 2) {
        axisTimes = [];
        var seenTimes = {};
        pointMaps[0].points.forEach(function (point) {
          if (!seenTimes[point.time]) {
            axisTimes.push(point.time);
            seenTimes[point.time] = true;
          }
        });
      }
      var latestRates = pointMaps.map(function () { return null; });
      var times = [];
      var rates = [];
      axisTimes.forEach(function (time) {
        if (!quotedTimes[time]) return;
        var weightedRate = 0;
        var activeWeight = 0;
        pointMaps.forEach(function (item, index) {
          if (item.map[time] !== undefined) latestRates[index] = item.map[time];
          if (latestRates[index] !== null) {
            weightedRate += item.weight * latestRates[index];
            activeWeight += item.weight;
          }
        });
        if (activeWeight > 0) {
          times.push(time);
          // JZBL is the percentage of the whole fund NAV. Assets outside the
          // disclosed holdings are treated as flat instead of scaling the
          // disclosed positions to 100%, which would exaggerate the estimate.
          rates.push(weightedRate / 100);
        }
      });
      if (rates.length < 2) return null;
      var calibrated = calibrateRates(rates, estimate, targetDate);
      if (!hasCurveVariation(calibrated)) return null;
      return {
        source: "holdings",
        sourceLabel: "持仓行情估算（" + (position.date || "披露期未知") + "，覆盖 " + coverageWeight.toFixed(1) + "%）",
        dwjz: parseFloat(estimate && estimate.dwjz) || 0,
        times: times,
        rates: calibrated,
        axisTimes: axisTimes,
        tradeDate: targetDate,
        coverageWeight: coverageWeight,
        tradeDate: targetDate,
        disclosureDate: position.date
      };
    });
  }

  function fetchDerivedIntradayData(code, estimate) {
    return Promise.all([fetchPositionData(code), fetchFundDetailData(code)]).then(function (results) {
      var position = results[0];
      var detail = results[1];
      var builders = [];
      if (position && position.data.ETFCODE) builders.push(function () { return buildEtfCurve(position, estimate); });
      if (detail && detail.INDEXCODE && detail.INDEXCODE !== "--") builders.push(function () { return buildIndexCurve(detail, estimate); });
      builders.push(function () { return buildListedFundCurve(code, detail, estimate); });
      builders.push(function () { return buildRelatedListedCurve(code, detail, estimate); });
      if (position) builders.push(function () { return buildHoldingsCurve(position, estimate); });

      function tryNext(index) {
        if (index >= builders.length) return Promise.resolve(null);
        return builders[index]().then(function (curve) { return curve || tryNext(index + 1); });
      }
      return tryNext(0);
    }).catch(function () { return null; });
  }

  /**
   * 获取当前估值快照
   */
  function fetchEstimateData(code) {
    return fetchSinaEstimateData(code);
  }

  function fetchSinaEstimateData(code) {
    var url = API_SINA_ESTIMATE.replace("{code}", code).replace("{ts}", Date.now());
    return fetch(url, { referrer: "https://finance.sina.com.cn/", referrerPolicy: "no-referrer-when-downgrade" })
      .then(function (r) { return r.text(); })
      .then(function (text) { return parseSinaEstimate(text, code); })
      .catch(function () { return null; });
  }

  /**
   * 获取历史净值列表
   * 使用 funds-master/charts2.vue 的 FundNetDiagram.ashx 接口（东方财富移动端，JSON）
   * 返回值：[{FSRQ, DWJZ, LJJZ, JZZZL}, ...] 或 []
   */
  function fetchHistoryData(code) {
    return fetchHistoryDataByRange(code, "n"); // 默认一年
  }

  /**
   * 按时间范围获取历史净值
   * range: y=月, 3y=季, 6y=半年, n=一年, 3n=三年, 5n=五年
   */
  function fetchHistoryDataByRange(code, range) {
    var url = API_NETDIAGRAM
      .replace("{code}", code)
      .replace("{range}", range)
      .replace("{ts}", Date.now());
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (j) {
        return j && j.Datas ? j.Datas : [];
      })
      .catch(function () { return []; });
  }

  /**
   * 渲染已归一化的分钟估值走势。
   */
  function getChartPalette() {
    var isDark = document.documentElement.dataset.theme === "dark";
    return isDark ? {
      axis: "#aeb5c1",
      grid: "#343942",
      tooltipBackground: "rgba(36,40,47,.97)",
      tooltipBorder: "#4a515d",
      tooltipText: "#eceef2"
    } : {
      axis: "#666",
      grid: "#e0e0e0",
      tooltipBackground: "rgba(255,255,255,.96)",
      tooltipBorder: "#ccc",
      tooltipText: "#333"
    };
  }

  function renderIntradayChart(containerEl, curve) {
    var echartsLib = getEcharts();
    if (!echartsLib) {
      containerEl.innerHTML = '<div class="fd-error">图表库未加载</div>';
      return;
    }

    var palette = getChartPalette();
    var DWJZ = parseFloat(curve.dwjz) || 0;
    var axisData = Array.isArray(curve.axisTimes) && curve.axisTimes.length > 1 ? curve.axisTimes.slice() : TIME_DATA;
    var pointMap = {};
    curve.times.forEach(function (time, index) {
      var rate = parseFloat(curve.rates[index]);
      if (time && Number.isFinite(rate)) pointMap[time] = +rate.toFixed(4);
    });
    var seriesData = axisData.map(function (time) {
      return pointMap[time] === undefined ? null : pointMap[time];
    });

    var maxAbs = 0;
    for (var i = 0; i < seriesData.length; i++) {
      if (seriesData[i] !== null) {
        var v = Math.abs(seriesData[i]);
        if (v > maxAbs) maxAbs = v;
      }
    }
    var aa = Math.max(maxAbs * 1.15, 0.01);
    aa = Math.ceil(aa * 100) / 100;

    // 真实分时曲线不需要合成采样轮询，清理可能残留的定时器
    if (estimatePolling) { clearInterval(estimatePolling); estimatePolling = null; }
    if (chartInstance) { try { chartInstance.dispose(); } catch (e) {} chartInstance = null; }
    chartInstance = echartsLib.init(containerEl);

    function tooltipFmt(p) {
      var point = p.filter(function (item) {
        return item.value !== null && item.value !== undefined && Number.isFinite(Number(item.value));
      })[0];
      if (!point) return p[0] ? p[0].name : "";
      return (
        "时间：" + point.name +
        "<br/>估算涨跌幅：" + Number(point.value).toFixed(2) + "%" +
        (DWJZ > 0 ? "<br/>估算净值：" + (DWJZ * (1 + 0.01 * point.value)).toFixed(4) + "元" : "")
      );
    }
    function fmtVal(idx) {
      if (idx === 0 || idx === axisData.length - 1) return true;
      var targetCount = 6;
      var step = Math.max(1, Math.round((axisData.length - 1) / (targetCount - 1)));
      return idx % step === 0;
    }
    function axisColor(val) { return val>0?"#f56c6c":val<0?"#4eb61b":palette.axis; }

    chartInstance.setOption({
      title: { text: curve.sourceLabel || "分钟估值",
        left: "center", top: 4,
        textStyle: { color: palette.axis, fontSize: 11, fontWeight: "normal" } },
      tooltip: { trigger:"axis", formatter:tooltipFmt,
        backgroundColor:palette.tooltipBackground, borderColor:palette.tooltipBorder, borderWidth:1, textStyle:{color:palette.tooltipText,fontSize:12} },
      grid: { top:35, bottom:34, left:55, right:55 },
      xAxis: { type:"category", data:axisData, position:"bottom", boundaryGap:false,
        axisLabel:{ interval:fmtVal, fontSize:10, color:palette.axis, hideOverlap:true, showMinLabel:true, showMaxLabel:true },
        axisLine:{ onZero:false, lineStyle:{color:palette.tooltipBorder} }, axisTick:{ show:false } },
      yAxis: [
        { type:"value",
          axisLabel:{ color:axisColor, fontSize:11, formatter:function(v){return v.toFixed(2)+"%";}},
          splitLine:{ show:true, lineStyle:{type:"dashed",color:palette.grid}},
          min:-aa, max:aa, interval:aa/4 },
        { type:"value",
          axisLabel:{ show: DWJZ > 0, color:axisColor, fontSize:11, formatter:function(v){return(DWJZ*(1+0.01*v)).toFixed(4);} },
          splitLine:{ show:true, lineStyle:{type:"dashed",color:palette.grid}},
          min:-aa, max:aa, interval:aa/4 }
      ],
      series:[
        { name:"估算涨跌幅", type:"line", data:seriesData, showSymbol:false,
          lineStyle:{width:1.2,color:"#409eff"}, itemStyle:{color:"#409eff"},
          markLine:{ silent:true, symbol:"none", animation:false, label:{show:false},
            lineStyle:{type:"solid",color:palette.axis}, data:[{yAxis:0}] } },
        { name:"估算净值", type:"line", symbol:"none", data:seriesData, yAxisIndex:1, lineStyle:{width:0} }
      ]
    });
  }

  /**
   * 渲染历史净值走势图（来自 funds-master/charts2.vue）
   */
  function renderHistoryChart(containerEl, historyList, estimate) {
    var echartsLib = getEcharts();
    var palette = getChartPalette();
    if (!echartsLib) {
      containerEl.innerHTML = '<div class="fd-error">图表库未加载</div>';
      return;
    }

    // 按日期升序排列
    historyList.sort(function (a, b) { return a.FSRQ > b.FSRQ ? 1 : -1; });

    var dates = historyList.map(function (item) { return item.FSRQ; });
    var navValues = historyList.map(function (item) { return parseFloat(item.DWJZ) || 0; });

    chartInstance = echartsLib.init(containerEl);

    function showHistoryLabel(index) {
      if (index === 0 || index === dates.length - 1) return true;
      var step = Math.max(1, Math.round((dates.length - 1) / 4));
      return index % step === 0;
    }

    function formatHistoryDate(value) {
      if (!value) return "";
      if (currentRange === "3n" || currentRange === "5n") return value.substring(0, 7);
      return value.substring(5);
    }

    // 以发行值 1 为基准换算涨跌幅：净值 1.1 → +10%，0.9 → -10%
    function navToPct(v) { return (v - 1) * 100; }

    function tooltipFmt(p) {
      var idx = p[0].dataIndex;
      var pct = navToPct(navValues[idx]);
      var info = "<b>" + p[0].name + "</b>";
      info += "<br/>单位净值：" + navValues[idx].toFixed(4) + " 元";
      info += "<br/>较发行值：" + (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
      return info;
    }

    chartInstance.setOption({
      tooltip: { trigger: "axis", formatter: tooltipFmt,
        backgroundColor: palette.tooltipBackground, borderColor: palette.tooltipBorder, borderWidth: 1,
        textStyle: { color: palette.tooltipText, fontSize: 12 } },
      grid: { top: 20, bottom: 38, left: 60, right: 24 },
      xAxis: {
        type: "category", data: dates, boundaryGap: false,
        axisLabel: { fontSize: 10, color: palette.axis, interval: showHistoryLabel,
          formatter: formatHistoryDate, hideOverlap: true, showMinLabel: true, showMaxLabel: true },
        axisLine: { lineStyle: { color: palette.tooltipBorder } },
        axisTick: { show: false }
      },
      yAxis: {
        type: "value", scale: true,
        axisLabel: { color: palette.axis, fontSize: 10, formatter: function (v) { var pct = navToPct(v); return (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%"; } },
        splitLine: { show: true, lineStyle: { type: "dashed", color: palette.grid } }
      },
      series: [
        { name: "单位净值", type: "line", data: navValues, showSymbol: false,
          lineStyle: { width: 1.5, color: "#409eff" }, itemStyle: { color: "#409eff" },
          smooth: true,
          areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(64,158,255,.25)" },
              { offset: 1, color: "rgba(64,158,255,.02)" }
            ] } } }
      ]
    });
  }

  // ====== ECharts 获取 ======

  function getEcharts() {
    var appEl = document.getElementById("app");
    if (!appEl) return null;

    // Vue 3：根 DOM 上有 __vue_app__ 标记
    var vueApp = appEl.__vue_app__;
    if (vueApp && vueApp.config && vueApp.config.globalProperties) {
      var gp = vueApp.config.globalProperties.$echarts;
      if (gp) return gp;
    }

    // 备用：Vue 3 子组件上下文（通过 #app 内的任意 DOM 元素的 __vueParentComponent）
    var inner = appEl.querySelector("*");
    if (inner && inner.__vueParentComponent) {
      var ctx = inner.__vueParentComponent;
      while (ctx) {
        if (ctx.appContext && ctx.appContext.config) {
          var ec2 = ctx.appContext.config.globalProperties && ctx.appContext.config.globalProperties.$echarts;
          if (ec2) return ec2;
        }
        ctx = ctx.parent;
      }
    }

    // 兜底：通过已渲染的 #chart* 元素 → Vue 3 setupState 查找
    var chartDom = document.querySelector("[id^='chart']");
    if (chartDom && chartDom.__vueParentComponent) {
      var c = chartDom.__vueParentComponent;
      while (c) {
        // Vue 3 setup 状态
        if (c.setupState && c.setupState.$echarts) return c.setupState.$echarts;
        if (c.ctx && c.ctx.$echarts) return c.ctx.$echarts;
        // 走 appContext
        if (c.appContext && c.appContext.config) {
          var ec3 = c.appContext.config.globalProperties && c.appContext.config.globalProperties.$echarts;
          if (ec3) return ec3;
        }
        c = c.parent;
      }
    }

    // 终极兜底：window.echarts
    if (window.echarts) return window.echarts;
    return null;
  }

  // ====== 事件绑定 ======

  function isInteractiveElement(el) {
    var tag = el.tagName.toLowerCase();
    if (tag==="input"||tag==="button"||tag==="select"||tag==="textarea") return true;
    return !!el.closest("input,button,select,textarea,[contenteditable]");
  }

  function findRow(el) {
    if (!el||!el.closest) return null;
    // 覆盖所有基金列表行：主列表 .yjb_fund_item 与单选列表 .yjb_m_row
    return el.closest(".yjb_fund_item, .yjb_m_row");
  }

  function handleClick(e) {
    if (isInteractiveElement(e.target)) return;
    var ov = document.getElementById("fund-detail-overlay");
    if (ov && ov.contains(e.target)) return;
    var row = findRow(e.target);
    if (!row) return;
    var code = extractFundCode(row);
    if (!code || code.length !== 6) return;
    var name = extractFundName(row);
    showDetail(code, name);
  }

  // ====== 启动 ======

  function init() {
    setTimeout(function () {
      var app = document.getElementById("app");
      if (app) app.addEventListener("click", handleClick, true);
      else document.body.addEventListener("click", handleClick, true);
    }, 500);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") init();
  else document.addEventListener("DOMContentLoaded", init);
})();
