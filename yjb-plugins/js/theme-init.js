(function () {
  "use strict";

  var theme = "light";
  try {
    if (localStorage.getItem("yjb-theme") === "dark") theme = "dark";
  } catch (error) {}

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
