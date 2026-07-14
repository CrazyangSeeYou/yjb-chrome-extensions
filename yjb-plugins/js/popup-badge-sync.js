/* Ensure zero-balance account views update the badge as well. */
(function () {
  var lastSentValue = "";

  chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (areaName !== "local" || !changes.total || !changes.total.newValue)
      return;

    try {
      var total =
        typeof changes.total.newValue === "string"
          ? JSON.parse(changes.total.newValue)
          : changes.total.newValue;
      if (!total || total.earn == null || total.earn_rate == null) return;

      var valueKey = String(total.earn) + "|" + String(total.earn_rate);
      if (valueKey === lastSentValue) return;
      lastSentValue = valueKey;

      chrome.runtime.sendMessage(
        {
          type: "updateEarnData",
          param: {
            earn: total.earn,
            earn_rate: total.earn_rate,
          },
          id: "",
        },
        function () {
          void chrome.runtime.lastError;
        },
      );
    } catch (error) {
      // Ignore incomplete values while the popup is initializing.
    }
  });
})();
