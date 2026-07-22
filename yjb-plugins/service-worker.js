var window = self;

(function() {
    function XMLHttpRequest() {
        this.readyState = 0;
        this.status = 0;
        this.statusText = '';
        this.responseText = '';
        this.response = '';
        this.responseURL = '';
        this.responseType = '';
        this.timeout = 0;
        this.withCredentials = false;
        this.upload = { addEventListener: function() {} };
        this._headers = {};
        this._method = '';
        this._url = '';
        this._async = true;
    }

    XMLHttpRequest.prototype.open = function(method, url, async) {
        this._method = method;
        this._url = url;
        this._async = async !== false;
        this.readyState = 1;
    };

    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        this._headers[name] = value;
    };

    XMLHttpRequest.prototype.getAllResponseHeaders = function() {
        return this._responseHeaders || '';
    };

    XMLHttpRequest.prototype.getResponseHeader = function(name) {
        if (!this._headersMap) return null;
        return this._headersMap[name.toLowerCase()] || null;
    };

    XMLHttpRequest.prototype.addEventListener = function() {};

    XMLHttpRequest.prototype.abort = function() {
        if (this._abortCtrl) this._abortCtrl.abort();
        if (this.onabort) this.onabort();
    };

    XMLHttpRequest.prototype.send = function(data) {
        var xhr = this;
        var abortCtrl = new AbortController();
        xhr._abortCtrl = abortCtrl;
        var timeoutId = null;

        if (xhr.timeout > 0) {
            timeoutId = setTimeout(function() {
                abortCtrl.abort();
                if (xhr.ontimeout) xhr.ontimeout();
            }, xhr.timeout);
        }

        var fetchOptions = {
            method: xhr._method,
            headers: {},
            signal: abortCtrl.signal
        };

        for (var key in xhr._headers) {
            if (key.toLowerCase() !== 'content-type' || xhr._headers[key]) {
                fetchOptions.headers[key] = xhr._headers[key];
            }
        }

        if (data && xhr._method.toUpperCase() !== 'GET' && xhr._method.toUpperCase() !== 'HEAD') {
            fetchOptions.body = data;
        }

        fetch(xhr._url, fetchOptions).then(function(res) {
            if (timeoutId) clearTimeout(timeoutId);
            xhr.status = res.status;
            xhr.statusText = res.statusText;
            xhr.responseURL = res.url;
            xhr._headersMap = {};
            var headerLines = [];
            res.headers.forEach(function(value, name) {
                headerLines.push(name + ': ' + value);
                xhr._headersMap[name.toLowerCase()] = value;
            });
            xhr._responseHeaders = headerLines.join('\r\n');
            return res.text();
        }).then(function(text) {
            xhr.responseText = text;
            if (xhr.responseType === 'json') {
                try { xhr.response = JSON.parse(text); } catch(e) { xhr.response = text; }
            } else {
                xhr.response = text;
            }
            xhr.readyState = 4;
            if (xhr.onloadend) xhr.onloadend();
            if (xhr.onreadystatechange) xhr.onreadystatechange();
        }).catch(function(err) {
            if (timeoutId) clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                return;
            }
            xhr.readyState = 4;
            xhr.status = 0;
            if (xhr.onerror) xhr.onerror(err);
            if (xhr.onreadystatechange) xhr.onreadystatechange();
        });
    };

    self.XMLHttpRequest = XMLHttpRequest;
})();

importScripts(
    'js/chunk-vendors.js',
    'js/background.js',
    'js/valuation-service.js',
    'js/app-api.js'
);
