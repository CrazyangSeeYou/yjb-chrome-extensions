(function () {
  "use strict";

  var state = {
    active: false,
    mounted: false,
    groups: [],
    funds: [],
    selectedGroup: "all",
    sort: "default",
    requestId: 0,
    updatedAt: "",
  };
  var page = null;
  var observer = null;

  function normalizedText(element) {
    return element ? String(element.textContent || "").replace(/\s+/g, "") : "";
  }

  function findNavigationTab(label) {
    var navigation = document.querySelector(".yjb_head .yjb_option");
    if (!navigation) return null;
    var children = navigation.children;
    for (var i = 0; i < children.length; i += 1) {
      if (normalizedText(children[i]) === label) return children[i];
    }
    return null;
  }

  function createPage() {
    var section = document.createElement("section");
    section.className = "yjb_optional_page";
    section.hidden = true;
    section.setAttribute("aria-label", "自选基金");
    section.innerHTML =
      '<div class="yjb_optional_groups" role="tablist" aria-label="自选分组"></div>' +
      '<div class="yjb_optional_meta">' +
      '<span class="yjb_optional_count">0只基金</span>' +
      '<span class="yjb_optional_updated"></span>' +
      "</div>" +
      '<div class="yjb_optional_table">' +
      '<div class="yjb_optional_table_head" role="row">' +
      '<div role="columnheader">基金</div>' +
      '<div role="columnheader" class="yjb_optional_numeric">估算净值</div>' +
      '<button type="button" class="yjb_optional_sort" title="按当日涨幅排序" aria-label="按当日涨幅排序">' +
      '<span>当日涨幅</span><span class="yjb_optional_sort_icon" aria-hidden="true"></span>' +
      "</button>" +
      '<div role="columnheader">关联板块</div>' +
      "</div>" +
      '<div class="yjb_optional_body" role="rowgroup"></div>' +
      "</div>";

    section
      .querySelector(".yjb_optional_groups")
      .addEventListener("click", handleGroupClick);
    section
      .querySelector(".yjb_optional_sort")
      .addEventListener("click", handleSortClick);
    return section;
  }

  function mount() {
    var main = document.querySelector(".yjb_hold .yjb_main");
    if (!main) return false;

    if (!page || !page.isConnected) {
      page = createPage();
      main.appendChild(page);
    }
    state.mounted = true;
    markNavigation();
    if (state.active) applyActiveDom();
    return true;
  }

  function markNavigation() {
    var holdTab = findNavigationTab("持有");
    var optionalTab = findNavigationTab("自选");
    if (holdTab) holdTab.dataset.yjbView = "hold";
    if (optionalTab) optionalTab.dataset.yjbView = "optional";
  }

  function setTabColor(tab, isActive) {
    if (!tab) return;
    tab.classList.toggle("yjb_c1", isActive);
    tab.classList.toggle("yjb_c9", !isActive);
    if (isActive) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }

  function applyActiveDom() {
    var main = document.querySelector(".yjb_hold .yjb_main");
    if (!main || !page) return;
    var children = main.children;
    for (var i = 0; i < children.length; i += 1) {
      var child = children[i];
      if (child !== page && !child.classList.contains("yjb_head")) {
        child.classList.add("yjb_optional_original_hidden");
      }
    }
    page.hidden = false;
    setTabColor(findNavigationTab("持有"), false);
    setTabColor(findNavigationTab("自选"), true);
  }

  function restoreHoldPage() {
    state.active = false;
    state.requestId += 1;
    document
      .querySelectorAll(".yjb_optional_original_hidden")
      .forEach(function (element) {
        element.classList.remove("yjb_optional_original_hidden");
      });
    if (page) page.hidden = true;
    setTabColor(findNavigationTab("持有"), true);
    setTabColor(findNavigationTab("自选"), false);
  }

  function showOptionalPage() {
    state.active = true;
    if (!mount()) return;
    applyActiveDom();
    loadFunds(state.selectedGroup, state.groups.length === 0);
  }

  function sendMessage(message) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(message, function (response) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function loadFunds(groupId, includeGroups) {
    var currentRequest = ++state.requestId;
    renderLoading();
    sendMessage({
      type: "optionalFunds",
      groupId: includeGroups || groupId === "all" ? undefined : groupId,
    })
      .then(function (response) {
        if (!state.active || currentRequest !== state.requestId) return;
        if (!response || !response.ok) {
          renderError(response && response.error);
          return;
        }
        var data = response.data || {};
        if (Array.isArray(data.groups)) {
          state.groups = normalizeGroups(data.groups);
          if (!hasGroup(state.selectedGroup)) state.selectedGroup = "all";
        }
        state.funds = Array.isArray(data.funds) ? data.funds : [];
        state.updatedAt = formatClock(new Date());
        renderGroups();
        renderFunds();
      })
      .catch(function (error) {
        if (!state.active || currentRequest !== state.requestId) return;
        renderError({ message: error.message || "自选基金请求失败" });
      });
  }

  function normalizeGroups(groups) {
    var normalized = groups
      .filter(function (group) {
        return group && group.id != null;
      })
      .map(function (group) {
        return {
          id: group.is_all ? "all" : String(group.id),
          title: String(group.title || group.name || "未命名分组"),
          isAll: Boolean(group.is_all),
        };
      });
    var all = normalized.find(function (group) {
      return group.isAll || group.id === "all";
    });
    normalized = normalized.filter(function (group) {
      return group !== all;
    });
    normalized.unshift(all || { id: "all", title: "全部", isAll: true });
    return normalized;
  }

  function hasGroup(groupId) {
    return state.groups.some(function (group) {
      return String(group.id) === String(groupId);
    });
  }

  function renderGroups() {
    if (!page) return;
    var container = page.querySelector(".yjb_optional_groups");
    var fragment = document.createDocumentFragment();
    var groups = state.groups.length
      ? state.groups
      : [{ id: "all", title: "全部", isAll: true }];

    groups.forEach(function (group) {
      var button = document.createElement("button");
      var active = String(group.id) === String(state.selectedGroup);
      button.type = "button";
      button.className = "yjb_optional_group" + (active ? " is-active" : "");
      button.dataset.groupId = String(group.id);
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", String(active));
      button.textContent = group.title;
      fragment.appendChild(button);
    });
    container.replaceChildren(fragment);

    var selected = container.querySelector(".is-active");
    if (selected) {
      selected.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }

  function handleGroupClick(event) {
    var button = event.target.closest(".yjb_optional_group");
    if (!button || button.classList.contains("is-active")) return;
    state.selectedGroup = button.dataset.groupId;
    state.sort = "default";
    renderGroups();
    updateSortState();
    loadFunds(state.selectedGroup, false);
  }

  function handleSortClick() {
    state.sort =
      state.sort === "default" ? "desc" : state.sort === "desc" ? "asc" : "default";
    updateSortState();
    renderFunds();
  }

  function updateSortState() {
    if (!page) return;
    var button = page.querySelector(".yjb_optional_sort");
    button.dataset.sort = state.sort;
    var description =
      state.sort === "desc"
        ? "当日涨幅从高到低"
        : state.sort === "asc"
          ? "当日涨幅从低到高"
          : "按接口顺序显示";
    button.title = description;
    button.setAttribute("aria-label", description);
  }

  function getFirstValue(object, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      var value = object && object[keys[i]];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return value;
      }
    }
    return "";
  }

  function getFirstNumber(object, keys) {
    for (var i = 0; i < keys.length; i += 1) {
      var value = object && object[keys[i]];
      if (value === undefined || value === null || String(value).trim() === "") continue;
      var number = Number(value);
      if (Number.isFinite(number)) return number;
    }
    return null;
  }

  function getRate(fund) {
    var info = (fund && fund.nv_info) || {};
    return getFirstNumber(info, ["gszzl", "zsgzzl", "vgszzl"]);
  }

  function sortedFunds() {
    var funds = state.funds.slice();
    if (state.sort === "default") return funds;
    var direction = state.sort === "desc" ? -1 : 1;
    return funds.sort(function (left, right) {
      var a = getRate(left);
      var b = getRate(right);
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return (a - b) * direction;
    });
  }

  function formatNumber(value, digits) {
    if (value === undefined || value === null || String(value).trim() === "") return "--";
    var number = Number(value);
    return Number.isFinite(number) ? number.toFixed(digits) : "--";
  }

  function formatFundCode(value) {
    var code = String(value === undefined || value === null ? "" : value).trim();
    return /^\d{1,6}$/.test(code) ? code.padStart(6, "0") : code;
  }

  function formatRate(rate) {
    if (rate === null) return "--";
    return (rate > 0 ? "+" : "") + rate.toFixed(2) + "%";
  }

  function formatTime(value) {
    if (!value) return "净值时间 --";
    var text = String(value).replace("T", " ");
    var match = text.match(/(\d{2}-\d{2})?\s*(\d{2}:\d{2})/);
    if (match) return "净值时间 " + (match[1] ? match[1] + " " : "") + match[2];
    return "净值时间 " + text;
  }

  function formatSector(value) {
    if (Array.isArray(value)) {
      return value
        .map(function (item) {
          if (item && typeof item === "object") {
            return item.name || item.title || item.sector_name || "";
          }
          return item || "";
        })
        .filter(Boolean)
        .join(" / ");
    }
    if (value && typeof value === "object") {
      return String(value.name || value.title || value.sector_name || "--");
    }
    return value ? String(value) : "--";
  }

  function createCell(className, text, title) {
    var element = document.createElement("div");
    element.className = className;
    element.textContent = text;
    if (title) element.title = title;
    return element;
  }

  function createFundRow(fund) {
    var info = (fund && fund.nv_info) || {};
    var code = formatFundCode(fund.fund_id || fund.code || fund.fund_code);
    var name = String(fund.short_name || fund.fund_name || fund.name || code || "--");
    var valuation = getFirstNumber(info, ["gsz", "zsgz", "dwjz"]);
    var time = getFirstValue(info, ["gztime", "zxjzrq", "jzrq"]);
    var rate = getRate(fund);
    var sector = formatSector(fund.fund_sector_name || fund.sector_name);
    var row = document.createElement("div");
    row.className = "yjb_fund_item yjb_optional_row";
    row.setAttribute("role", "row");
    row.tabIndex = 0;
    row.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      row.click();
    });

    var identity = document.createElement("div");
    identity.className = "yjb_optional_identity";
    var nameElement = createCell("yjb_ellipsis yjb_optional_name", name, name);
    var codeElement = createCell("yjb_optional_code", code);
    identity.appendChild(nameElement);
    identity.appendChild(codeElement);

    var value = document.createElement("div");
    value.className = "yjb_optional_value";
    value.appendChild(createCell("yjb_optional_nav", formatNumber(valuation, 4)));
    value.appendChild(createCell("yjb_optional_time", formatTime(time), String(time || "")));

    var rateElement = createCell(
      "yjb_optional_rate " +
        (rate > 0 ? "is-positive" : rate < 0 ? "is-negative" : "is-flat"),
      formatRate(rate),
    );
    var sectorElement = createCell("yjb_optional_sector", sector, sector === "--" ? "" : sector);

    row.appendChild(identity);
    row.appendChild(value);
    row.appendChild(rateElement);
    row.appendChild(sectorElement);
    return row;
  }

  function renderFunds() {
    if (!page) return;
    var body = page.querySelector(".yjb_optional_body");
    var funds = sortedFunds();
    page.querySelector(".yjb_optional_count").textContent = funds.length + "只基金";
    page.querySelector(".yjb_optional_updated").textContent = state.updatedAt
      ? "更新于 " + state.updatedAt
      : "";

    if (!funds.length) {
      renderState("empty", "当前分组暂无自选基金", "");
      return;
    }

    var fragment = document.createDocumentFragment();
    funds.forEach(function (fund) {
      fragment.appendChild(createFundRow(fund));
    });
    body.replaceChildren(fragment);
  }

  function renderLoading() {
    if (!page) return;
    renderGroups();
    page.querySelector(".yjb_optional_count").textContent = "正在加载";
    page.querySelector(".yjb_optional_updated").textContent = "";
    renderState("loading", "正在同步自选基金", "");
  }

  function renderError(error) {
    var authInvalid = Boolean(error && error.authInvalid);
    var code = error && error.code;
    var message =
      code === "NOT_LOGGED_IN"
        ? "请先在持有页扫码登录"
        : authInvalid
          ? "登录凭证无法访问 App 自选，请重新登录"
          : error && error.message
            ? error.message
            : "自选基金加载失败";
    page.querySelector(".yjb_optional_count").textContent = "加载失败";
    page.querySelector(".yjb_optional_updated").textContent = "";
    renderState("error", message, authInvalid || code === "NOT_LOGGED_IN" ? "返回持有" : "重新加载");
  }

  function renderState(kind, message, actionText) {
    var body = page.querySelector(".yjb_optional_body");
    var container = document.createElement("div");
    container.className = "yjb_optional_state is-" + kind;
    if (kind === "loading") {
      var spinner = document.createElement("span");
      spinner.className = "yjb_optional_spinner";
      spinner.setAttribute("aria-hidden", "true");
      container.appendChild(spinner);
    }
    container.appendChild(createCell("yjb_optional_state_text", message));
    if (actionText) {
      var action = document.createElement("button");
      action.type = "button";
      action.className = "yjb_optional_state_action";
      action.textContent = actionText;
      action.addEventListener("click", function () {
        if (actionText === "返回持有") restoreHoldPage();
        else loadFunds(state.selectedGroup, state.groups.length === 0);
      });
      container.appendChild(action);
    }
    body.replaceChildren(container);
  }

  function formatClock(date) {
    return (
      String(date.getHours()).padStart(2, "0") +
      ":" +
      String(date.getMinutes()).padStart(2, "0") +
      ":" +
      String(date.getSeconds()).padStart(2, "0")
    );
  }

  function handleDocumentClick(event) {
    var tab = event.target.closest && event.target.closest("[data-yjb-view]");
    if (tab && tab.dataset.yjbView === "optional") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showOptionalPage();
      return;
    }
    if (tab && tab.dataset.yjbView === "hold" && state.active) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      restoreHoldPage();
      return;
    }
    var refresh = event.target.closest && event.target.closest(".yjb_refresh");
    if (refresh && state.active) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      loadFunds(state.selectedGroup, state.groups.length === 0);
    }
  }

  function init() {
    mount();
    document.addEventListener("click", handleDocumentClick, true);
    observer = new MutationObserver(function () {
      mount();
    });
    observer.observe(document.getElementById("app") || document.body, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
