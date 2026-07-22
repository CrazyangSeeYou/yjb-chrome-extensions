(function () {
  "use strict";

  var BASE_URL = "https://app-api.yangjibao.com/";
  var SECRET =
    "bjAePTJ32qByWfikZaZF8b9yBsoJZyvPLBflrY9XHLJLegfBG1RvO1hllGRfBT2V";
  var APP_VERSION = "3.0.6";

  function add32(a, b) {
    return (a + b) | 0;
  }

  function rotateLeft(value, count) {
    return (value << count) | (value >>> (32 - count));
  }

  function cmn(q, a, b, x, s, t) {
    return add32(rotateLeft(add32(add32(a, q), add32(x, t)), s), b);
  }

  function ff(a, b, c, d, x, s, t) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }

  function gg(a, b, c, d, x, s, t) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }

  function hh(a, b, c, d, x, s, t) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a, b, c, d, x, s, t) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  function wordToHex(value) {
    var result = "";
    for (var i = 0; i < 4; i += 1) {
      result += ("0" + ((value >>> (i * 8)) & 255).toString(16)).slice(-2);
    }
    return result;
  }

  function md5(input) {
    var bytes = new TextEncoder().encode(String(input));
    var bitLength = bytes.length * 8;
    var paddedLength = (((bytes.length + 8) >>> 6) + 1) * 64;
    var buffer = new Uint8Array(paddedLength);
    var words = new Int32Array(buffer.buffer);

    buffer.set(bytes);
    buffer[bytes.length] = 128;
    words[words.length - 2] = bitLength | 0;
    words[words.length - 1] = Math.floor(bitLength / 4294967296);

    var a0 = 1732584193;
    var b0 = -271733879;
    var c0 = -1732584194;
    var d0 = 271733878;

    for (var offset = 0; offset < words.length; offset += 16) {
      var a = a0;
      var b = b0;
      var c = c0;
      var d = d0;

      a = ff(a, b, c, d, words[offset], 7, -680876936);
      d = ff(d, a, b, c, words[offset + 1], 12, -389564586);
      c = ff(c, d, a, b, words[offset + 2], 17, 606105819);
      b = ff(b, c, d, a, words[offset + 3], 22, -1044525330);
      a = ff(a, b, c, d, words[offset + 4], 7, -176418897);
      d = ff(d, a, b, c, words[offset + 5], 12, 1200080426);
      c = ff(c, d, a, b, words[offset + 6], 17, -1473231341);
      b = ff(b, c, d, a, words[offset + 7], 22, -45705983);
      a = ff(a, b, c, d, words[offset + 8], 7, 1770035416);
      d = ff(d, a, b, c, words[offset + 9], 12, -1958414417);
      c = ff(c, d, a, b, words[offset + 10], 17, -42063);
      b = ff(b, c, d, a, words[offset + 11], 22, -1990404162);
      a = ff(a, b, c, d, words[offset + 12], 7, 1804603682);
      d = ff(d, a, b, c, words[offset + 13], 12, -40341101);
      c = ff(c, d, a, b, words[offset + 14], 17, -1502002290);
      b = ff(b, c, d, a, words[offset + 15], 22, 1236535329);

      a = gg(a, b, c, d, words[offset + 1], 5, -165796510);
      d = gg(d, a, b, c, words[offset + 6], 9, -1069501632);
      c = gg(c, d, a, b, words[offset + 11], 14, 643717713);
      b = gg(b, c, d, a, words[offset], 20, -373897302);
      a = gg(a, b, c, d, words[offset + 5], 5, -701558691);
      d = gg(d, a, b, c, words[offset + 10], 9, 38016083);
      c = gg(c, d, a, b, words[offset + 15], 14, -660478335);
      b = gg(b, c, d, a, words[offset + 4], 20, -405537848);
      a = gg(a, b, c, d, words[offset + 9], 5, 568446438);
      d = gg(d, a, b, c, words[offset + 14], 9, -1019803690);
      c = gg(c, d, a, b, words[offset + 3], 14, -187363961);
      b = gg(b, c, d, a, words[offset + 8], 20, 1163531501);
      a = gg(a, b, c, d, words[offset + 13], 5, -1444681467);
      d = gg(d, a, b, c, words[offset + 2], 9, -51403784);
      c = gg(c, d, a, b, words[offset + 7], 14, 1735328473);
      b = gg(b, c, d, a, words[offset + 12], 20, -1926607734);

      a = hh(a, b, c, d, words[offset + 5], 4, -378558);
      d = hh(d, a, b, c, words[offset + 8], 11, -2022574463);
      c = hh(c, d, a, b, words[offset + 11], 16, 1839030562);
      b = hh(b, c, d, a, words[offset + 14], 23, -35309556);
      a = hh(a, b, c, d, words[offset + 1], 4, -1530992060);
      d = hh(d, a, b, c, words[offset + 4], 11, 1272893353);
      c = hh(c, d, a, b, words[offset + 7], 16, -155497632);
      b = hh(b, c, d, a, words[offset + 10], 23, -1094730640);
      a = hh(a, b, c, d, words[offset + 13], 4, 681279174);
      d = hh(d, a, b, c, words[offset], 11, -358537222);
      c = hh(c, d, a, b, words[offset + 3], 16, -722521979);
      b = hh(b, c, d, a, words[offset + 6], 23, 76029189);
      a = hh(a, b, c, d, words[offset + 9], 4, -640364487);
      d = hh(d, a, b, c, words[offset + 12], 11, -421815835);
      c = hh(c, d, a, b, words[offset + 15], 16, 530742520);
      b = hh(b, c, d, a, words[offset + 2], 23, -995338651);

      a = ii(a, b, c, d, words[offset], 6, -198630844);
      d = ii(d, a, b, c, words[offset + 7], 10, 1126891415);
      c = ii(c, d, a, b, words[offset + 14], 15, -1416354905);
      b = ii(b, c, d, a, words[offset + 5], 21, -57434055);
      a = ii(a, b, c, d, words[offset + 12], 6, 1700485571);
      d = ii(d, a, b, c, words[offset + 3], 10, -1894986606);
      c = ii(c, d, a, b, words[offset + 10], 15, -1051523);
      b = ii(b, c, d, a, words[offset + 1], 21, -2054922799);
      a = ii(a, b, c, d, words[offset + 8], 6, 1873313359);
      d = ii(d, a, b, c, words[offset + 15], 10, -30611744);
      c = ii(c, d, a, b, words[offset + 6], 15, -1560198380);
      b = ii(b, c, d, a, words[offset + 13], 21, 1309151649);
      a = ii(a, b, c, d, words[offset + 4], 6, -145523070);
      d = ii(d, a, b, c, words[offset + 11], 10, -1120210379);
      c = ii(c, d, a, b, words[offset + 2], 15, 718787259);
      b = ii(b, c, d, a, words[offset + 9], 21, -343485551);

      a0 = add32(a0, a);
      b0 = add32(b0, b);
      c0 = add32(c0, c);
      d0 = add32(d0, d);
    }

    return wordToHex(a0) + wordToHex(b0) + wordToHex(c0) + wordToHex(d0);
  }

  function getStoredToken() {
    return new Promise(function (resolve, reject) {
      chrome.storage.local.get("appToken", function (result) {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        var token = result && result.appToken ? String(result.appToken).trim() : "";
        resolve(token.replace(/^android:/i, ""));
      });
    });
  }

  function setStoredToken(token) {
    return new Promise(function (resolve, reject) {
      chrome.storage.local.set({ appToken: String(token || "").trim() }, function () {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function removeStoredToken() {
    return new Promise(function (resolve) {
      chrome.storage.local.remove("appToken", function () {
        resolve();
      });
    });
  }

  function createApiError(message, code, authInvalid) {
    var error = new Error(message || "自选基金请求失败");
    error.code = code || "APP_API_ERROR";
    error.authInvalid = Boolean(authInvalid);
    return error;
  }

  function getErrorMessage(payload, fallback) {
    if (!payload || typeof payload !== "object") return fallback;
    return payload.message || payload.msg || payload.error || fallback;
  }

  function isAuthFailure(payload, message) {
    var code = payload && (payload.code || payload.status);
    return (
      code === 401 ||
      code === 403 ||
      /身份|登录|token|授权|凭证/i.test(String(message || ""))
    );
  }

  async function request(path, token, options) {
    options = options || {};
    var method = options.method || "GET";
    var query = options.query || "";
    var timestamp = Math.floor(Date.now() / 1000);
    var signature = md5(BASE_URL + path + token + SECRET + timestamp);
    var url = BASE_URL + path + query;
    var fetchOptions = {
      method: method,
      headers: {
        "Request-Time": String(timestamp),
        "Request-Sign": signature,
        Authorization: "android:" + token,
        "Content-Type": "application/json",
        platform: "hwyysc",
        version: APP_VERSION,
      },
    };
    if (options.body !== undefined) {
      fetchOptions.body = JSON.stringify(options.body);
    }
    var response = await fetch(url, {
      method: fetchOptions.method,
      headers: fetchOptions.headers,
      body: fetchOptions.body,
    });
    var text = await response.text();
    var payload;

    try {
      payload = text ? JSON.parse(text) : {};
    } catch (error) {
      throw createApiError("自选接口返回了无效数据", "INVALID_RESPONSE", false);
    }

    if (!response.ok) {
      var httpMessage = getErrorMessage(payload, "自选接口请求失败");
      throw createApiError(
        httpMessage,
        "HTTP_" + response.status,
        response.status === 401 || response.status === 403,
      );
    }

    var code = payload && payload.code;
    var success = code == null || code === 0 || code === 200 || code === "200";
    if (!success) {
      var apiMessage = getErrorMessage(payload, "自选接口请求失败");
      throw createApiError(apiMessage, String(code), isAuthFailure(payload, apiMessage));
    }

    return payload && Object.prototype.hasOwnProperty.call(payload, "data")
      ? payload.data
      : payload;
  }

  function toList(value) {
    if (Array.isArray(value)) return value;
    if (value && Array.isArray(value.list)) return value.list;
    return [];
  }

  async function loadWithToken(groupId, token) {
    var hasGroup =
      groupId !== undefined && groupId !== null && String(groupId) !== "all";
    if (hasGroup) {
      var groupPath = "position/v1/option/group";
      var groupData = await request(
        groupPath,
        token,
        { query: "?group_id=" + encodeURIComponent(String(groupId)) },
      );
      return { groups: null, funds: toList(groupData) };
    }

    var result = await Promise.all([
      request("users/v1/fund-group", token),
      request("position/v1/option/all", token),
    ]);
    return { groups: toList(result[0]), funds: toList(result[1]) };
  }

  async function loadOptionalFunds(groupId) {
    var token = await getStoredToken();
    if (!token) {
      throw createApiError("请验证 App 账号", "APP_LOGIN_REQUIRED", true);
    }

    try {
      return await loadWithToken(groupId, token);
    } catch (error) {
      if (error && error.authInvalid) await removeStoredToken();
      throw error;
    }
  }

  async function sendLoginCode(phone) {
    var normalizedPhone = String(phone || "").trim();
    if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
      throw createApiError("请输入正确的手机号", "INVALID_PHONE", false);
    }
    await request("send_code", "", {
      method: "POST",
      body: { phone: normalizedPhone },
    });
  }

  async function loginWithPhone(phone, verifyCode) {
    var normalizedPhone = String(phone || "").trim();
    var normalizedCode = String(verifyCode || "").trim();
    if (!/^1[3-9]\d{9}$/.test(normalizedPhone)) {
      throw createApiError("请输入正确的手机号", "INVALID_PHONE", false);
    }
    if (!/^\d{4}$/.test(normalizedCode)) {
      throw createApiError("请输入 4 位验证码", "INVALID_VERIFY_CODE", false);
    }

    var data = await request("login", "", {
      method: "POST",
      body: {
        mode: "phone",
        phone: normalizedPhone,
        verify_code: normalizedCode,
        is_band_wechat: 2,
      },
    });
    if (data && data.phone && data.ukey) {
      throw createApiError(
        "该手机号需要先在养基宝 App 完成微信绑定",
        "APP_WECHAT_BIND_REQUIRED",
        true,
      );
    }
    var token = data && data.token ? String(data.token).trim() : "";
    if (!token) {
      throw createApiError("登录接口未返回有效凭证", "INVALID_LOGIN_RESPONSE", true);
    }
    await setStoredToken(token);
  }

  function serializeError(error) {
    return {
      code: error && error.code ? error.code : "APP_API_ERROR",
      message: error && error.message ? error.message : "自选基金请求失败",
      authInvalid: Boolean(error && error.authInvalid),
    };
  }

  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message) return undefined;

    if (message.type === "optionalFunds") {
      loadOptionalFunds(message.groupId)
        .then(function (data) {
          sendResponse({ type: message.type, ok: true, data: data });
        })
        .catch(function (error) {
          sendResponse({ type: message.type, ok: false, error: serializeError(error) });
        });
      return true;
    }

    if (message.type === "appSendCode") {
      sendLoginCode(message.phone)
        .then(function () {
          sendResponse({ type: message.type, ok: true });
        })
        .catch(function (error) {
          sendResponse({ type: message.type, ok: false, error: serializeError(error) });
        });
      return true;
    }

    if (message.type === "appLogin") {
      loginWithPhone(message.phone, message.verifyCode)
        .then(function () {
          sendResponse({ type: message.type, ok: true });
        })
        .catch(function (error) {
          sendResponse({ type: message.type, ok: false, error: serializeError(error) });
        });
      return true;
    }

    return undefined;
  });

  self.__yjbAppApi = {
    md5: md5,
    buildSignature: function (path, token, timestamp) {
      return md5(BASE_URL + path + token + SECRET + timestamp);
    },
  };
})();
