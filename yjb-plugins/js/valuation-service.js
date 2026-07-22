/**
 * Public fund valuation service for the MV3 background worker.
 *
 * Ordinary funds use Sina's batch estimate endpoint. When an estimate is
 * missing or stale, linked ETF, tracked index, or disclosed stock holdings
 * are used to derive an approximate intraday return.
 */
(function (global) {
    "use strict";

    var SINA_BATCH_URL = "https://hq.sinajs.cn/list={symbols}&_={timestamp}";
    var NAV_BATCH_URL =
        "https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo" +
        "?pageIndex=1&pageSize=200&plat=Android&appType=ttjj&product=EFund" +
        "&Version=1&deviceid=1&Fcodes={codes}";
    var POSITION_URL =
        "https://fundmobapi.eastmoney.com/FundMNewApi/FundMNInverstPosition" +
        "?FCODE={code}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0&_={timestamp}";
    var DETAIL_URL =
        "https://fundmobapi.eastmoney.com/FundMNewApi/FundMNDetailInformation" +
        "?FCODE={code}&deviceid=Wap&plat=Wap&product=EFund&version=2.0.0&_={timestamp}";
    var SEARCH_URL =
        "https://searchapi.eastmoney.com/api/suggest/get" +
        "?input={input}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&_={timestamp}";
    var QUOTE_URLS = [
        "https://push2delay.eastmoney.com/api/qt/ulist.np/get" +
            "?secids={secids}&fields=f2,f3,f12,f13,f14,f124&_={timestamp}",
        "https://push2his.eastmoney.com/api/qt/ulist.np/get" +
            "?secids={secids}&fields=f2,f3,f12,f13,f14,f124&_={timestamp}"
    ];

    var REQUEST_TIMEOUT = 6000;
    var RESULT_CACHE_TIME = 12000;
    var STATIC_CACHE_TIME = 6 * 60 * 60 * 1000;
    var QUOTE_CACHE_TIME = 10000;
    var resultCache = {};
    var requestCache = {};

    function normalizeCodes(codes) {
        var seen = {};
        return (codes || []).map(function (code) {
            return String(code || "").trim().padStart(6, "0");
        }).filter(function (code) {
            if (!/^\d{6}$/.test(code) || seen[code]) return false;
            seen[code] = true;
            return true;
        });
    }

    function chunks(items, size) {
        var result = [];
        for (var i = 0; i < items.length; i += size) {
            result.push(items.slice(i, i + size));
        }
        return result;
    }

    function request(url, responseType) {
        var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        var timer = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT) : null;
        return fetch(url, controller ? { signal: controller.signal } : undefined).then(function (response) {
            if (!response.ok) throw new Error("Request failed: " + response.status);
            return responseType === "text" ? response.text() : response.json();
        }).then(function (value) {
            if (timer) clearTimeout(timer);
            return value;
        }).catch(function (error) {
            if (timer) clearTimeout(timer);
            throw error;
        });
    }

    function cachedRequest(key, ttl, loader) {
        var now = Date.now();
        var cached = requestCache[key];
        if (cached && cached.expires > now) return cached.promise;
        var promise = loader().catch(function (error) {
            delete requestCache[key];
            throw error;
        });
        requestCache[key] = { expires: now + ttl, promise: promise };
        return promise;
    }

    function parseSinaBatch(text) {
        var result = {};
        var pattern = /var\s+hq_str_fu_(\d{6})="([^"]*)";?/g;
        var match;
        while ((match = pattern.exec(String(text || "")))) {
            if (!match[2]) continue;
            var fields = match[2].split(",");
            var gsz = parseFloat(fields[2]);
            var dwjz = parseFloat(fields[3]);
            var rate = parseFloat(fields[6]);
            var date = fields[7] || "";
            var time = fields[1] || "";
            if (!(gsz > 0) || !(dwjz > 0) || !Number.isFinite(rate)) continue;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(time)) continue;
            result[match[1]] = {
                gsz: gsz.toFixed(4),
                gszzl: rate.toFixed(4),
                dwjz: dwjz.toFixed(4),
                gztime: date + " " + time.substring(0, 5),
                source: "sina"
            };
        }
        return result;
    }

    function fetchSinaEstimates(codes) {
        var groups = chunks(codes, 50);
        return Promise.all(groups.map(function (group) {
            var symbols = group.map(function (code) { return "fu_" + code; }).join(",");
            var url = SINA_BATCH_URL
                .replace("{symbols}", symbols)
                .replace("{timestamp}", Date.now());
            return request(url, "text").then(parseSinaBatch).catch(function () { return {}; });
        })).then(function (maps) {
            var result = {};
            maps.forEach(function (map) {
                Object.keys(map).forEach(function (code) { result[code] = map[code]; });
            });
            return result;
        });
    }

    function fetchLatestNavs(codes) {
        var groups = chunks(codes, 100);
        return Promise.all(groups.map(function (group) {
            var url = NAV_BATCH_URL.replace("{codes}", group.join(","));
            return request(url, "json").catch(function () { return null; });
        })).then(function (responses) {
            var navs = {};
            var marketDate = "";
            responses.forEach(function (response) {
                var expansion = response && response.Expansion;
                var currentDate = expansion && expansion.GZTIME;
                if (currentDate && currentDate > marketDate) marketDate = currentDate;
                var rows = response && response.Datas;
                if (!Array.isArray(rows)) return;
                rows.forEach(function (row) {
                    var nav = parseFloat(row && row.NAV);
                    if (!row || !row.FCODE || !(nav > 0)) return;
                    navs[row.FCODE] = {
                        dwjz: nav.toFixed(4),
                        jzrq: row.PDATE || ""
                    };
                });
            });
            return { navs: navs, marketDate: marketDate };
        });
    }

    function fetchPosition(code) {
        var url = POSITION_URL.replace("{code}", code).replace("{timestamp}", Date.now());
        return cachedRequest("position:" + code, STATIC_CACHE_TIME, function () {
            return request(url, "json").then(function (json) {
                return json && json.Datas ? { data: json.Datas, date: json.Expansion || "" } : null;
            });
        }).catch(function () { return null; });
    }

    function fetchDetail(code) {
        var url = DETAIL_URL.replace("{code}", code).replace("{timestamp}", Date.now());
        return cachedRequest("detail:" + code, STATIC_CACHE_TIME, function () {
            return request(url, "json").then(function (json) { return json && json.Datas || null; });
        }).catch(function () { return null; });
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

    function formatShanghaiTime(epochSeconds) {
        var seconds = Number(epochSeconds);
        if (!(seconds > 0)) seconds = Math.floor(Date.now() / 1000);
        return new Date((seconds + 8 * 60 * 60) * 1000)
            .toISOString().replace("T", " ").substring(0, 16);
    }

    function parseQuoteResponse(json) {
        var result = {};
        var rows = json && json.data && json.data.diff;
        if (!Array.isArray(rows)) return result;
        rows.forEach(function (row) {
            var rawRate = Number(row && row.f3);
            if (!row || !row.f12 || !Number.isFinite(rawRate)) return;
            var secid = String(row.f13) + "." + String(row.f12);
            result[secid] = {
                rate: rawRate / 100,
                name: row.f14 || "",
                gztime: formatShanghaiTime(row.f124)
            };
        });
        return result;
    }

    function fetchQuotes(secids) {
        var unique = [];
        var seen = {};
        (secids || []).forEach(function (secid) {
            if (secid && !seen[secid]) {
                seen[secid] = true;
                unique.push(secid);
            }
        });
        if (!unique.length) return Promise.resolve({});
        var key = "quotes:" + unique.slice().sort().join(",");
        return cachedRequest(key, QUOTE_CACHE_TIME, function () {
            var groups = chunks(unique, 60);
            return Promise.all(groups.map(function (group) {
                function tryEndpoint(index) {
                    if (index >= QUOTE_URLS.length) return Promise.resolve({});
                    var url = QUOTE_URLS[index]
                        .replace("{secids}", group.join(","))
                        .replace("{timestamp}", Date.now());
                    return request(url, "json").then(function (json) {
                        var parsed = parseQuoteResponse(json);
                        return Object.keys(parsed).length ? parsed : tryEndpoint(index + 1);
                    }).catch(function () { return tryEndpoint(index + 1); });
                }
                return tryEndpoint(0);
            })).then(function (maps) {
                var result = {};
                maps.forEach(function (map) {
                    Object.keys(map).forEach(function (secid) { result[secid] = map[secid]; });
                });
                return result;
            });
        });
    }

    function fetchIndexSecurityId(detail) {
        var indexCode = String(detail && detail.INDEXCODE || "");
        var indexName = String(detail && detail.INDEXNAME || "").replace(/指数$/, "");
        if (!indexCode || indexCode === "--") return Promise.resolve(null);
        function directId() {
            if (/^399/.test(indexCode)) return "0." + indexCode;
            if (/^000/.test(indexCode)) return "1." + indexCode;
            return null;
        }
        return cachedRequest("index:" + indexCode, STATIC_CACHE_TIME, function () {
            var inputs = indexName ? [indexName, indexCode] : [indexCode];
            return Promise.all(inputs.map(function (input) {
                var url = SEARCH_URL
                    .replace("{input}", encodeURIComponent(input))
                    .replace("{timestamp}", Date.now());
                return request(url, "json").then(function (json) {
                    var rows = json && json.QuotationCodeTable && json.QuotationCodeTable.Data;
                    return Array.isArray(rows) ? rows : [];
                }).catch(function () { return []; });
            })).then(function (groups) {
                var candidates = groups.reduce(function (all, group) { return all.concat(group); }, []);
                candidates = candidates.filter(function (row) {
                    var quoteId = String(row && row.QuoteID || "");
                    return String(row && row.Code || "") === indexCode && quoteId &&
                        quoteId.indexOf("150.") !== 0 &&
                        String(row && row.Classify || "").toLowerCase() !== "astock";
                });
                candidates.sort(function (left, right) {
                    function score(row) {
                        var value = 0;
                        var quoteId = String(row && row.QuoteID || "");
                        var classify = String(row && row.Classify || "").toLowerCase();
                        var name = String(row && row.Name || "").replace(/指数$/, "");
                        if (classify === "index") value += 100;
                        if (indexName && name === indexName) value += 80;
                        if (/^(0|1|2)\./.test(quoteId)) value += 40;
                        return value;
                    }
                    return score(right) - score(left);
                });
                return candidates.length ? String(candidates[0].QuoteID) : directId();
            });
        }).then(function (secid) { return secid || directId(); }).catch(directId);
    }

    function benchmarkExposure(detail) {
        var text = String(detail && (detail.PERFCMP || detail.BENCH) || "");
        var values = [];
        text.replace(/(\d+(?:\.\d+)?)\s*%/g, function (_, value) {
            var number = Number(value);
            if (number >= 50 && number <= 100) values.push(number);
            return _;
        });
        return values.length ? Math.max.apply(Math, values) : 95;
    }

    function estimateFromRate(rate, nav, source, gztime, coverage, detail) {
        var navValue = parseFloat(nav && nav.dwjz);
        if (!(navValue > 0) || !Number.isFinite(rate) || !gztime) return null;
        return {
            gsz: (navValue * (1 + rate / 100)).toFixed(4),
            gszzl: rate.toFixed(4),
            dwjz: navValue.toFixed(4),
            jzrq: nav.jzrq || "",
            gztime: gztime,
            source: source,
            coverage: coverage,
            detail: detail || ""
        };
    }

    function estimateFromLinkedEtf(position, nav) {
        var etfCode = String(position && position.data && position.data.ETFCODE || "");
        if (!etfCode) return Promise.resolve(null);
        var secid = getSecurityId(etfCode, "", true);
        return fetchQuotes([secid]).then(function (quotes) {
            var quote = quotes[secid];
            if (!quote) return null;
            var exposure = 95;
            return estimateFromRate(
                quote.rate * exposure / 100,
                nav,
                "linked-etf",
                quote.gztime,
                exposure,
                position.data.ETFSHORTNAME || etfCode
            );
        });
    }

    function estimateFromIndex(detail, nav) {
        return fetchIndexSecurityId(detail).then(function (secid) {
            if (!secid) return null;
            return fetchQuotes([secid]).then(function (quotes) {
                var quote = quotes[secid];
                if (!quote) return null;
                var exposure = benchmarkExposure(detail);
                return estimateFromRate(
                    quote.rate * exposure / 100,
                    nav,
                    "tracked-index",
                    quote.gztime,
                    exposure,
                    detail.INDEXNAME || detail.INDEXCODE
                );
            });
        });
    }

    function estimateFromHoldings(position, nav) {
        var stocks = position && position.data && position.data.fundStocks;
        if (!Array.isArray(stocks) || !stocks.length) return Promise.resolve(null);
        var holdings = stocks.map(function (stock) {
            var weight = parseFloat(stock && stock.JZBL);
            var exchange = stock && (stock.NEWTEXCH !== undefined ? stock.NEWTEXCH : stock.TEXCH);
            var secid = getSecurityId(stock && stock.GPDM, exchange, false);
            return weight > 0 && secid ? { secid: secid, weight: weight, name: stock.GPJC || "" } : null;
        }).filter(Boolean);
        return fetchQuotes(holdings.map(function (item) { return item.secid; })).then(function (quotes) {
            var weightedRate = 0;
            var coverage = 0;
            var latestTime = "";
            holdings.forEach(function (holding) {
                var quote = quotes[holding.secid];
                if (!quote) return;
                weightedRate += holding.weight * quote.rate / 100;
                coverage += holding.weight;
                if (quote.gztime > latestTime) latestTime = quote.gztime;
            });
            if (coverage < 5 || !latestTime) return null;
            return estimateFromRate(
                weightedRate,
                nav,
                "holdings",
                latestTime,
                Number(coverage.toFixed(2)),
                "披露日 " + (position.date || "未知")
            );
        });
    }

    function deriveEstimate(code, nav) {
        if (!nav) return Promise.resolve(null);
        return Promise.all([fetchPosition(code), fetchDetail(code)]).then(function (values) {
            var position = values[0];
            var detail = values[1];
            var builders = [];
            if (position && position.data && position.data.ETFCODE) {
                builders.push(function () { return estimateFromLinkedEtf(position, nav); });
            }
            if (detail && detail.INDEXCODE && detail.INDEXCODE !== "--") {
                builders.push(function () { return estimateFromIndex(detail, nav); });
            }
            if (position) builders.push(function () { return estimateFromHoldings(position, nav); });

            function next(index) {
                if (index >= builders.length) return Promise.resolve(null);
                return builders[index]().then(function (value) { return value || next(index + 1); });
            }
            return next(0);
        }).catch(function () { return null; });
    }

    function mapLimit(items, limit, iterator) {
        var index = 0;
        var result = new Array(items.length);
        function worker() {
            var current = index++;
            if (current >= items.length) return Promise.resolve();
            return Promise.resolve(iterator(items[current], current)).then(function (value) {
                result[current] = value;
                return worker();
            });
        }
        var workers = [];
        for (var i = 0; i < Math.min(limit, items.length); i++) workers.push(worker());
        return Promise.all(workers).then(function () { return result; });
    }

    function extractDate(value) {
        var match = String(value || "").match(/^\d{4}-\d{2}-\d{2}/);
        return match ? match[0] : "";
    }

    function normalizeSessionTimes(estimates) {
        var latestByDate = {};
        Object.keys(estimates).forEach(function (code) {
            var estimate = estimates[code];
            var date = extractDate(estimate && estimate.gztime);
            if (!date) return;
            if (!latestByDate[date] || estimate.gztime > latestByDate[date]) {
                latestByDate[date] = estimate.gztime;
            }
        });
        Object.keys(estimates).forEach(function (code) {
            var estimate = estimates[code];
            var date = extractDate(estimate && estimate.gztime);
            if (date && latestByDate[date]) estimate.gztime = latestByDate[date];
        });
        return estimates;
    }

    function fetchAllValuations(codes) {
        var normalized = normalizeCodes(codes);
        if (!normalized.length) return Promise.resolve({});
        var cacheKey = normalized.slice().sort().join(",");
        var cached = resultCache[cacheKey];
        if (cached && cached.expires > Date.now()) return cached.promise;

        var promise = Promise.all([fetchSinaEstimates(normalized), fetchLatestNavs(normalized)]).then(function (values) {
            var estimates = values[0];
            var navResult = values[1];
            var navs = navResult.navs;
            var marketDate = navResult.marketDate;

            Object.keys(estimates).forEach(function (code) {
                var nav = navs[code];
                if (nav) {
                    estimates[code].dwjz = nav.dwjz;
                    estimates[code].jzrq = nav.jzrq;
                }
            });

            var fallbackCodes = normalized.filter(function (code) {
                var estimate = estimates[code];
                return !estimate || (marketDate && extractDate(estimate.gztime) < marketDate);
            });
            return mapLimit(fallbackCodes, 3, function (code) {
                return deriveEstimate(code, navs[code]).then(function (derived) {
                    if (derived) estimates[code] = derived;
                });
            }).then(function () {
                var valid = {};
                Object.keys(estimates).forEach(function (code) {
                    var item = estimates[code];
                    if (parseFloat(item.gsz) > 0 && Number.isFinite(parseFloat(item.gszzl)) && item.gztime) {
                        valid[code] = item;
                    }
                });
                return normalizeSessionTimes(valid);
            });
        }).catch(function () { return {}; });

        resultCache[cacheKey] = { expires: Date.now() + RESULT_CACHE_TIME, promise: promise };
        return promise;
    }

    global.__fetchAllValuations = fetchAllValuations;
    global.__fetchPublicValuation = function (code) {
        var normalized = normalizeCodes([code]);
        if (!normalized.length) return Promise.resolve(null);
        return fetchAllValuations(normalized).then(function (values) {
            return values[normalized[0]] || null;
        });
    };
    global.__valuationService = {
        fetchAll: fetchAllValuations,
        parseSinaBatch: parseSinaBatch,
        parseQuoteResponse: parseQuoteResponse,
        estimateFromRate: estimateFromRate,
        getSecurityId: getSecurityId
    };
})(self);
