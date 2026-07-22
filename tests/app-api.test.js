"use strict";

var assert = require("node:assert/strict");

var stored = { token: "browser-plugin-token" };
var listeners = [];
var fetchCalls = [];
var fetchHandler = null;
var valuationCalls = [];
var valuationHandler = async function () {
  return {};
};

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

global.__fetchAllValuations = async function (codes) {
  valuationCalls.push(codes);
  return valuationHandler(codes);
};

global.__fetchAllFundSnapshots = global.__fetchAllValuations;

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
      return apiResponse({
        code: 200,
        data: [
          { fund_id: "1", code: "000001", nv_info: { gsz: "9.9999", gszzl: "" } },
          { fund_id: "2", code: "006327", nv_info: {} },
        ],
      });
    }
    if (call.url.endsWith("position/v1/option/group?group_id=1")) {
      return apiResponse({
        code: 200,
        data: [
          { fund_id: "1", code: "000001", nv_info: { gsz: "9.9999", gszzl: "" } },
        ],
      });
    }
    throw new Error("Unexpected URL: " + call.url);
  };
  valuationHandler = async function () {
    return {
      "000001": {
        gsz: "1.2345",
        gszzl: "1.26",
        dwjz: "1.2191",
        jzrq: "2026-07-21",
        gztime: "2026-07-22 14:30",
      },
      "006327": {
        dwjz: "0.9011",
        jzrq: "2026-07-20",
        rzzl: "3.1500",
        source: "latest-nav",
      },
    };
  };
  var optionalFunds = await sendMessage({ type: "optionalFunds" });
  assert.equal(optionalFunds.ok, true);
  assert.equal(optionalFunds.data.source, "cache");
  assert.ok(optionalFunds.data.cachedAt);
  assert.deepEqual(optionalFunds.data.groups, [{ id: 1, title: "关注" }]);
  assert.deepEqual(valuationCalls, [["000001", "006327"]]);
  assert.deepEqual(optionalFunds.data.funds, [
    {
      fund_id: "1",
      code: "000001",
      nv_info: {
        gsz: "1.2345",
        gszzl: "1.26",
        dwjz: "1.2191",
        jzrq: "2026-07-21",
        gztime: "2026-07-22 14:30",
        qjgzrq: "2026-07-22 14:30",
        zxjzrq: "2026-07-21",
      },
    },
    {
      fund_id: "2",
      code: "006327",
      nv_info: {
        dwjz: "0.9011",
        jzrq: "2026-07-20",
        rzzl: "3.1500",
        zxjzrq: "2026-07-20",
      },
    },
  ]);
  assert.equal(stored.appToken, undefined, "App token must be discarded after caching");
  assert.equal(stored.appOptionalFundsCache.version, 1);
  assert.deepEqual(
    stored.appOptionalFundsCache.fundGroups.map(function (group) {
      return group.id;
    }),
    ["all", "1"],
  );
  fetchCalls.slice(3).forEach(function (call) {
    assert.equal(call.options.headers.Authorization, "android:app-session-token");
    var path = call.url.replace("https://app-api.yangjibao.com/", "").split("?")[0];
    var timestamp = call.options.headers["Request-Time"];
    assert.equal(
      call.options.headers["Request-Sign"],
      global.__yjbAppApi.buildSignature(path, "app-session-token", timestamp),
    );
  });

  var appFetchCount = fetchCalls.length;
  valuationHandler = async function () {
    return {
      "000001": {
        gsz: "1.2500",
        gszzl: "2.10",
        dwjz: "1.2191",
        jzrq: "2026-07-21",
        gztime: "2026-07-22 14:40",
      },
    };
  };
  var cachedGroup = await sendMessage({ type: "optionalFunds", groupId: 1 });
  assert.equal(cachedGroup.ok, true);
  assert.equal(cachedGroup.data.groups, null);
  assert.equal(cachedGroup.data.funds.length, 1);
  assert.equal(cachedGroup.data.funds[0].nv_info.gsz, "1.2500");
  assert.equal(cachedGroup.data.funds[0].nv_info.gszzl, "2.10");
  assert.equal(fetchCalls.length, appFetchCount, "cached groups must not call the App API");

  var currentSyncedAt = stored.appOptionalFundsCache.syncedAt;
  stored.appOptionalFundsCache.syncedAt = "2000-01-01T00:00:00.000Z";
  valuationHandler = async function () {
    return {};
  };
  var staleCache = await sendMessage({ type: "optionalFunds", groupId: 1 });
  assert.equal(staleCache.ok, true);
  assert.equal(
    staleCache.data.funds[0].nv_info.gsz,
    undefined,
    "a previous-day estimate must not be displayed as today's estimate",
  );
  assert.equal(staleCache.data.funds[0].nv_info.gszzl, undefined);
  stored.appOptionalFundsCache.syncedAt = currentSyncedAt;

  stored.appToken = "expired-token";
  fetchHandler = function () {
    return apiResponse({ code: "1000", message: "token已失效，请重新登录" });
  };
  var expired = await sendMessage({
    type: "optionalFunds",
    groupId: 1,
    forceRefresh: true,
  });
  assert.equal(expired.ok, false);
  assert.equal(expired.error.authInvalid, true);
  assert.equal(stored.appToken, undefined);
  assert.ok(stored.appOptionalFundsCache, "an expired token must not delete the cache");

  var afterExpiryFetchCount = fetchCalls.length;
  var cachedAfterExpiry = await sendMessage({ type: "optionalFunds", groupId: 1 });
  assert.equal(cachedAfterExpiry.ok, true);
  assert.equal(fetchCalls.length, afterExpiryFetchCount);

  console.log("app-api tests passed");
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
