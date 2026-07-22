"use strict";

var assert = require("node:assert/strict");

global.self = global;
require("../yjb-plugins/js/valuation-service.js");

var service = global.__valuationService;

var sina = service.parseSinaBatch([
    'var hq_str_fu_000001="Fund A,10:30:00,1.4620,1.4450,4.0180,0,1.1765,2026-07-22,1.4558,0.7474";',
    'var hq_str_fu_000009="";',
    'var hq_str_fu_000311="Fund B,10:31:00,2.8197,2.8100,3.1500,0,0.3452,2026-07-22,2.7999,-0.3594";'
].join("\n"));

assert.deepEqual(Object.keys(sina).sort(), ["000001", "000311"]);
assert.equal(sina["000001"].gsz, "1.4620");
assert.equal(sina["000001"].gszzl, "1.1765");
assert.equal(sina["000001"].gztime, "2026-07-22 10:30");

var quotes = service.parseQuoteResponse({
    data: {
        diff: [
            { f3: -322, f12: "300308", f13: 0, f14: "Stock A", f124: 1784687802 },
            { f3: 44, f12: "000300", f13: 1, f14: "Index B", f124: 1784687802 }
        ]
    }
});

assert.equal(quotes["0.300308"].rate, -3.22);
assert.equal(quotes["1.000300"].rate, 0.44);

var estimate = service.estimateFromRate(
    1.25,
    { dwjz: "2.0000", jzrq: "2026-07-21" },
    "holdings",
    "2026-07-22 10:30",
    42.5
);

assert.equal(estimate.gsz, "2.0250");
assert.equal(estimate.gszzl, "1.2500");
assert.equal(estimate.jzrq, "2026-07-21");
assert.equal(service.getSecurityId("688001", 1, false), "1.688001");
assert.equal(service.getSecurityId("300001", 0, false), "0.300001");
assert.equal(service.getSecurityId("513050", "", true), "1.513050");

console.log("valuation-service tests passed");
