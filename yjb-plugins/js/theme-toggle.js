(function () {
  "use strict";

  var STORAGE_KEY = "yjb-theme";
  var observer = null;

  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function persistTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (error) {}
  }

  function updateButton(button, theme) {
    var isDark = theme === "dark";
    var label = isDark
      ? "\u5207\u6362\u5230\u6d45\u8272\u80cc\u666f"
      : "\u5207\u6362\u5230\u6697\u9ed1\u80cc\u666f";

    button.textContent = isDark ? "\u2600" : "\u263e";
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-pressed", String(isDark));
    button.title = label;
  }

  function applyTheme(theme, persist) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    document.querySelectorAll(".yjb_theme_toggle").forEach(function (button) {
      updateButton(button, theme);
    });

    if (persist) persistTheme(theme);
    window.dispatchEvent(new CustomEvent("yjb-theme-change", { detail: { theme: theme } }));
  }

  function createButton() {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "yjb_theme_toggle";
    updateButton(button, currentTheme());
    button.addEventListener("click", function (event) {
      event.stopPropagation();
      applyTheme(currentTheme() === "dark" ? "light" : "dark", true);
    });
    return button;
  }

  function mountButton() {
    var setting = document.querySelector(".yjb_hr .yjb_setting");
    if (!setting || !setting.parentElement) return;

    var existing = setting.parentElement.querySelector(".yjb_theme_toggle");
    if (!existing) {
      setting.parentElement.insertBefore(createButton(), setting);
    } else if (existing.nextElementSibling !== setting) {
      setting.parentElement.insertBefore(existing, setting);
    }
  }

  function init() {
    mountButton();
    observer = new MutationObserver(mountButton);
    observer.observe(document.getElementById("app") || document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
