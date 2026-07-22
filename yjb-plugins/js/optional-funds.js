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
    authPhone: "",
    authSending: false,
    authSubmitting: false,
    codeCountdown: 0,
    countdownTimer: null,
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
    var rate = getFirstNumber(info, ["gszzl", "zsgzzl", "vgszzl"]);
    if (rate !== null) return rate;
    return getFirstNumber(fund, [
      "gszzl",
      "zsgzzl",
      "vgszzl",
      "increase_rate",
      "day_increase_rate",
      "estimate_rate",
    ]);
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
    if (authInvalid || code === "APP_LOGIN_REQUIRED") {
      page.querySelector(".yjb_optional_count").textContent = "需要验证";
      page.querySelector(".yjb_optional_updated").textContent = "";
      var authMessage =
        code === "APP_WECHAT_BIND_REQUIRED"
          ? error.message
          : code === "APP_LOGIN_REQUIRED"
            ? "验证 App 账号后加载自选基金"
            : "App 登录已失效，请重新验证";
      renderAuth(authMessage);
      return;
    }
    var message =
      error && error.message ? error.message : "自选基金加载失败";
    page.querySelector(".yjb_optional_count").textContent = "加载失败";
    page.querySelector(".yjb_optional_updated").textContent = "";
    renderState("error", message, "重新加载");
  }

  function renderAuth(message) {
    var body = page.querySelector(".yjb_optional_body");
    var container = document.createElement("div");
    container.className = "yjb_optional_state is-auth";

    var form = document.createElement("form");
    form.className = "yjb_optional_auth";
    form.setAttribute("aria-label", "App 短信登录");

    var title = createCell("yjb_optional_auth_title", "验证 App 账号");
    var status = createCell("yjb_optional_auth_status", message);
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    var phoneRow = document.createElement("div");
    phoneRow.className = "yjb_optional_auth_phone";
    var phoneInput = createAuthInput("tel", "手机号", 11, "tel");
    phoneInput.classList.add("yjb_optional_auth_phone_input");
    phoneInput.value = state.authPhone;
    phoneInput.addEventListener("input", function () {
      phoneInput.value = phoneInput.value.replace(/\D/g, "").slice(0, 11);
      state.authPhone = phoneInput.value;
    });

    var sendButton = document.createElement("button");
    sendButton.type = "button";
    sendButton.className = "yjb_optional_auth_code_button";
    sendButton.addEventListener("click", function () {
      handleSendCode(form, phoneInput, status);
    });
    phoneRow.appendChild(phoneInput);
    phoneRow.appendChild(sendButton);

    var codeInput = createAuthInput("text", "4 位验证码", 4, "one-time-code");
    codeInput.classList.add("yjb_optional_auth_verify_input");
    codeInput.addEventListener("input", function () {
      codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 4);
    });

    var submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.className = "yjb_optional_auth_submit";
    submitButton.textContent = "登录并加载";

    form.appendChild(title);
    form.appendChild(phoneRow);
    form.appendChild(codeInput);
    form.appendChild(submitButton);
    form.appendChild(status);
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      handleAppLogin(form, phoneInput, codeInput, status);
    });
    container.appendChild(form);
    body.replaceChildren(container);
    updateAuthControls(form);
  }

  function createAuthInput(type, placeholder, maxLength, autocomplete) {
    var input = document.createElement("input");
    input.type = type;
    input.className = "yjb_optional_auth_input";
    input.placeholder = placeholder;
    input.setAttribute("aria-label", placeholder);
    input.inputMode = "numeric";
    input.maxLength = maxLength;
    input.autocomplete = autocomplete;
    return input;
  }

  function setAuthStatus(status, message, isError) {
    status.textContent = message;
    status.classList.toggle("is-error", Boolean(isError));
  }

  function updateAuthControls(form) {
    if (!form || !form.isConnected) return;
    var sendButton = form.querySelector(".yjb_optional_auth_code_button");
    var submitButton = form.querySelector(".yjb_optional_auth_submit");
    var waiting = state.codeCountdown > 0;
    sendButton.disabled = state.authSending || state.authSubmitting || waiting;
    sendButton.textContent = state.authSending
      ? "发送中"
      : waiting
        ? state.codeCountdown + " 秒"
        : "获取验证码";
    submitButton.disabled = state.authSending || state.authSubmitting;
    submitButton.textContent = state.authSubmitting ? "登录中" : "登录并加载";
  }

  function startCodeCountdown(form) {
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    state.codeCountdown = 60;
    updateAuthControls(form);
    state.countdownTimer = setInterval(function () {
      state.codeCountdown -= 1;
      if (state.codeCountdown <= 0) {
        state.codeCountdown = 0;
        clearInterval(state.countdownTimer);
        state.countdownTimer = null;
      }
      updateAuthControls(form);
    }, 1000);
  }

  function handleSendCode(form, phoneInput, status) {
    var phone = phoneInput.value.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setAuthStatus(status, "请输入正确的手机号", true);
      phoneInput.focus();
      return;
    }

    state.authSending = true;
    updateAuthControls(form);
    setAuthStatus(status, "正在发送验证码", false);
    sendMessage({ type: "appSendCode", phone: phone })
      .then(function (response) {
        if (!response || !response.ok) {
          setAuthStatus(
            status,
            response && response.error && response.error.message
              ? response.error.message
              : "验证码发送失败",
            true,
          );
          return;
        }
        setAuthStatus(status, "验证码已发送", false);
        startCodeCountdown(form);
      })
      .catch(function (error) {
        setAuthStatus(status, error.message || "验证码发送失败", true);
      })
      .finally(function () {
        state.authSending = false;
        updateAuthControls(form);
      });
  }

  function handleAppLogin(form, phoneInput, codeInput, status) {
    var phone = phoneInput.value.trim();
    var verifyCode = codeInput.value.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setAuthStatus(status, "请输入正确的手机号", true);
      phoneInput.focus();
      return;
    }
    if (!/^\d{4}$/.test(verifyCode)) {
      setAuthStatus(status, "请输入 4 位验证码", true);
      codeInput.focus();
      return;
    }

    state.authSubmitting = true;
    updateAuthControls(form);
    setAuthStatus(status, "正在验证 App 账号", false);
    sendMessage({ type: "appLogin", phone: phone, verifyCode: verifyCode })
      .then(function (response) {
        if (!response || !response.ok) {
          setAuthStatus(
            status,
            response && response.error && response.error.message
              ? response.error.message
              : "登录失败",
            true,
          );
          return;
        }
        state.authPhone = "";
        state.groups = [];
        state.funds = [];
        state.selectedGroup = "all";
        state.sort = "default";
        codeInput.value = "";
        loadFunds("all", true);
      })
      .catch(function (error) {
        setAuthStatus(status, error.message || "登录失败", true);
      })
      .finally(function () {
        state.authSubmitting = false;
        updateAuthControls(form);
      });
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
        loadFunds(state.selectedGroup, state.groups.length === 0);
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
