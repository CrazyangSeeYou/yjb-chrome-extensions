"use strict";

var assert = require("node:assert/strict");

var stored = { token: "browser-plugin-token" };
var listeners = [];
var fetchCalls = [];
var fetchHandler = null;

global.self = global;
global.chrome = {
  runtime: {
    lastError: null,
    onMessage: {
      addListener: function (listener) {
        listeners.push(listener);
      },
    },
  },
  storage: {
    local: {
      get: function (key, callback) {
        var result = {};
        if (Object.prototype.hasOwnProperty.call(stored, key)) result[key] = stored[key];
        callback(result);
      },
      set: function (values, callback) {
        Object.assign(stored, values);
        callback();
      },
      remove: function (key, callback) {
        delete stored[key];
        callback();
      },
    },
  },
};

global.fetch = async function (url, options) {
  var call = { url: url, options: options };
  fetchCalls.push(call);
  return fetchHandler(call);
};

require("../yjb-plugins/js/app-api.js");

assert.equal(listeners.length, 1);
var listener = listeners[0];

function apiResponse(payload) {
  return {
    ok: true,
    status: 200,
    text: async function () {
      return JSON.stringify(payload);
    },
  };
}

function sendMessage(message) {
  return new Promise(function (resolve) {
    assert.equal(listener(message, {}, resolve), true);
  });
}

(async function () {
  var missingToken = await sendMessage({ type: "optionalFunds" });
  assert.equal(missingToken.ok, false);
  assert.equal(missingToken.error.code, "APP_LOGIN_REQUIRED");
  assert.equal(fetchCalls.length, 0, "browser token must not be sent to the App API");

  var invalidPhone = await sendMessage({ type: "appSendCode", phone: "123" });
  assert.equal(invalidPhone.ok, false);
  assert.equal(invalidPhone.error.code, "INVALID_PHONE");
  assert.equal(fetchCalls.length, 0);

  fetchHandler = function () {
    return apiResponse({ code: 200, data: null });
  };
  var sent = await sendMessage({ type: "appSendCode", phone: "13800138000" });
  assert.equal(sent.ok, true);
  assert.equal(fetchCalls[0].url, "https://app-api.yangjibao.com/send_code");
  assert.equal(fetchCalls[0].options.method, "POST");
  assert.equal(fetchCalls[0].options.headers.Authorization, "android:");
  assert.deepEqual(JSON.parse(fetchCalls[0].options.body), { phone: "13800138000" });

  fetchHandler = function () {
    return apiResponse({
      code: 200,
      data: { phone: "13800138000", ukey: "bind-key", token: "unusable-token" },
    });
  };
  var needsBinding = await sendMessage({
    type: "appLogin",
    phone: "13800138000",
    verifyCode: "1234",
  });
  assert.equal(needsBinding.ok, false);
  assert.equal(needsBinding.error.code, "APP_WECHAT_BIND_REQUIRED");
  assert.equal(stored.appToken, undefined);

  fetchHandler = function () {
    return apiResponse({ code: 200, data: { token: "app-session-token" } });
  };
  var loggedIn = await sendMessage({
    type: "appLogin",
    phone: "13800138000",
    verifyCode: "1234",
  });
  assert.equal(loggedIn.ok, true);
  assert.equal(stored.appToken, "app-session-token");
  var loginCall = fetchCalls[2];
  assert.deepEqual(JSON.parse(loginCall.options.body), {
    mode: "phone",
    phone: "13800138000",
    verify_code: "1234",
    is_band_wechat: 2,
  });

  fetchHandler = function (call) {
    if (call.url.endsWith("users/v1/fund-group")) {
      return apiResponse({ code: 200, data: [{ id: 1, title: "关注" }] });
    }
    if (call.url.endsWith("position/v1/option/all")) {
      return apiResponse({ code: 200, data: [{ fund_id: "000001" }] });
    }
    throw new Error("Unexpected URL: " + call.url);
  };
  var optionalFunds = await sendMessage({ type: "optionalFunds" });
  assert.equal(optionalFunds.ok, true);
  assert.deepEqual(optionalFunds.data.groups, [{ id: 1, title: "关注" }]);
  assert.deepEqual(optionalFunds.data.funds, [{ fund_id: "000001" }]);
  fetchCalls.slice(3).forEach(function (call) {
    assert.equal(call.options.headers.Authorization, "android:app-session-token");
    var path = call.url.replace("https://app-api.yangjibao.com/", "");
    var timestamp = call.options.headers["Request-Time"];
    assert.equal(
      call.options.headers["Request-Sign"],
      global.__yjbAppApi.buildSignature(path, "app-session-token", timestamp),
    );
  });

  fetchHandler = function () {
    return apiResponse({ code: "1000", message: "token已失效，请重新登录" });
  };
  var expired = await sendMessage({ type: "optionalFunds", groupId: 1 });
  assert.equal(expired.ok, false);
  assert.equal(expired.error.authInvalid, true);
  assert.equal(stored.appToken, undefined);

  console.log("app-api tests passed");
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
