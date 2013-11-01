var
	extend = require("extend"),
	async = require("async"),
	zlib = require("zlib")
;

module.exports = exports = HttpCache;

function HttpCache(options) {
	if (!(this instanceof HttpCache)) {
		return new HttpCache(options);
	}
	init.call(this, options);

	var $this = this;
	return function(req, res, next) {
		onRequest.call($this, req, res, next);
	};
}

function init(options) {
	options = options || {};
	if (!("provider" in options)) {
		options.provider = new (require("./providers/in-proc-provider"))();
	}
	options.headersToExclude = extend({
		'date': true,
		'set-cookie': true,
		'transfer-encoding': true,
		'if-none-match': true,
		'if-modified-since': true
	}, options.headersToExclude || { });
	options.rules = options.rules || [];
	if (typeof options.rules === "function") {
		options.rules = [options.rules];
	}
	this.options = options;
}

function onRequest(req, res, next) {
	var $this = this;
	canCache.call(this, req, res, function(err, canCache) {
		if (err || canCache !== true) {
			return next.call($this);			
		}

		getCacheFromProvider.call($this, req, res, function(err, cache) {
			attachToRequest.call($this, req, res, next);
		});
	});
}

function getCacheFromProvider(req, res, cb) {
	this.options.provider.get(req.headers["host"] + req.url, function(err, cache) {
		if (err || !cache) {
			cb(err); // continue
			return;
		}

		// copy headers so original cache is not tainted
		var newHeaders = extend(true, {}, cache.headers);

		// check last-modified
		if ((req.headers["if-modified-since"] || "X") === (cache.headers["last-modified"] || "Y")) {
			delete newHeaders["content-length"];
			delete newHeaders["content-encoding"];
			res.writeHead(304, newHeaders);
			res.end();
			return;
		}
		
		// check etag
		// NOTE: Not exposed directly by HttpCache since we already support if-modified-since, but
		//       this allows for etag support if the application uses it. Redundant?
		// OBSOLETE: No point supporting etag if we *always* expose last-modified
		/*if ((req.headers["if-none-match"] || "X") === (cache.headers["etag"] || "Y")) {
			delete newHeaders["content-length"];
			delete newHeaders["content-encoding"];
			res.writeHead(304, newHeaders);
			res.end();
			return;
		}*/
		
		// respond with cache instead
		
		if (/gzip/.test(req.headers["accept-encoding"] || "") === false &&
			/gzip/.test(cache.headers["content-encoding"] || "") === true
			) { // if request does not accept gzip, but our cache is holding gzipped content, then auto-unzip
			delete newHeaders["content-encoding"];
			zlib.gunzip(cache.body, function(err, result) {
				newHeaders["content-length"] = result.length;
				res.writeHead(cache.statusCode, cache.reason, newHeaders);
				res.end(result, cache.encoding);
			});
		} else { // send whatever is cached (typical path)
			newHeaders["content-length"] = (cache.body || "").length;
			res.writeHead(cache.statusCode, cache.reason, newHeaders);
			res.end(cache.body, cache.encoding);
		}
	});
}

function attachToRequest(req, res, next) {
	var baseRes = {
		end: res.end,
		write: res.write,
		writeHead: res.writeHead,
		setHeader: res.setHeader,
		body: undefined,
		reason: undefined,
		headers: {},
		chunks: [],
		chunkLength: 0,
		encoding: undefined,
		statusCode: 200
	};

	var $this = this;
	res.end = function(data, encoding) {
		if (typeof data !== "undefined") {
			baseRes.data = data;
		} else if (baseRes.chunks.length > 0) {
			baseRes.data = new Buffer(baseRes.chunkLength);
			var offset = 0;
			for (var ci = 0; ci < baseRes.chunks.length; ci++) {
				var chunk = baseRes.chunks[ci];
				if (typeof chunk === "string") {
					chunk = new Buffer(chunk, baseRes.encoding);
				}
				chunk.copy(baseRes.data, offset);
				offset += chunk.length;
			}
		}
		if (typeof encoding !== "undefined") {
			baseRes.encoding = encoding;
		}

		res.end = baseRes.end; // restore base
		
		var ccontrol = baseRes.headers['cache-control'];
		if (!ccontrol || /public/.test(ccontrol) === true) { // it's OK to cache
			var cache = {
				headers: getHeadersToCache.call($this, baseRes.headers),
				body: baseRes.data,
				encoding: baseRes.encoding,
				statusCode: res.statusCode
			};

			var lastModified = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
			cache.headers["last-modified"] = lastModified;

			if (res.headersSent === false) {
				res.setHeader("last-modified", lastModified);
			}
			
			if (cache.body && cache.body.length > 1024 &&
				/gzip/.test(baseRes.headers["content-encoding"]) !== true
				) { // if not already gzipped, and big enough, lets zip it
				var $endThis = this; // preserve context
				zlib.gzip(cache.body, function(err, result) {
					cache.headers["content-encoding"] = "gzip";
					var unzipBody = cache.body;
					cache.body = result;

					// save response, but do NOT wait for successful storage before responding.
					// race conditions are expected under heavy load, and should be accounted
					// for by the provider.
					$this.options.provider.set(req.headers["host"] + req.url, cache);

					if (res.headersSent === false && /gzip/.test(req.headers["accept-encoding"] || "") === true
						) { // gzip permitted by request, and headers not already sent
						res.setHeader("content-encoding", "gzip");
						res.setHeader("content-length", cache.body.length);
						res.end.call($endThis, cache.body, encoding);
					} else { // if gzip not permitted by request, or headers already sent, do not modify
						if (res.headersSent === false) {
							res.setHeader("content-length", unzipBody.length);
						}
						res.end.call($endThis, unzipBody, encoding);
					}
				});				
			} else {
				// save response, but do NOT wait for successful storage before responding.
				// race conditions are expected under heavy load, and should be accounted
				// for by the provider.
				$this.options.provider.set(req.headers["host"] + req.url, cache);

				if (res.headersSent === false) {
					res.setHeader("content-length", (cache.body || "").length);
				}
				
				res.end.call(this, data, encoding);
			}
		} else {
			// save response, but do NOT wait for successful storage before responding.
			// race conditions are expected under heavy load, and should be accounted
			// for by the provider.
			$this.options.provider.set(req.headers["host"] + req.url, cache);

			res.end.call(this, data, encoding);
		}
	};

	res.write = function(chunk, encoding) {
		baseRes.chunks.push(chunk);
		baseRes.chunkLength += chunk.length;
		if (typeof encoding !== "undefined") {
			baseRes.encoding = encoding;
		}
		baseRes.write.call(this, chunk, encoding);
	};
	
	res.writeHead = function(statusCode, reason, headers) {
		if (typeof reason !== 'string' && typeof reason !== "undefined") {
			headers = reason;
			reason = undefined;
		}
		headers = headers || {};
		for (var k in headers) {
			var k_lower = k.toLowerCase();
			baseRes.headers[k_lower] = headers[k];
		}
		if (reason) { // store reason header
			baseRes.reason = reason;
		}
		baseRes.statusCode = statusCode;

		res.writeHead = baseRes.writeHead; // restore base
		res.writeHead.call(this, statusCode, reason, headers);
	};

	res.setHeader = function(name, val) {
		// TODO!!! add support for an array of values
		var nameLower = name.toLowerCase();
		baseRes.headers[nameLower] = val;
		baseRes.setHeader.call(this, nameLower, val);
	};
	
	next();
}

function getHeadersToCache(headers) {
	var cachedHeaders = { };
	
	for (var k in headers) { // store all non-excluded headers
		if (k in this.options.headersToExclude) {
			continue;
		}

		cachedHeaders[k] = headers[k];
	}
	
	return cachedHeaders;
}

function canCache(req, res, cb) {
	var ccontrol = req.headers["cache-control"];
	if (req.method !== 'GET' ||
		req.headers['x-no-cache'] === "1" ||
		(ccontrol && /public/.test(ccontrol) === false)
		) {
		cb(null, false);
	} else if (this.options.rules.length === 0) {
		cb(null, true);
	} else {
		var ruleTasks = [];
		var i;
		for (i = 0; i < this.options.rules.length; i++) {
			var rule = this.options.rules[i];
			ruleTasks.push(getRuleTask(req, res, rule));
		}

		async.parallel(ruleTasks, function(err, results) {
			cb(err, !err);
		});
	}
}

function getRuleTask(req, res, rule) {
	return function(taskCb) {
		var ruleRet = rule(req, res, function(err, result) {
			if (err) {
				taskCb(err);
			} else if (result === true) {
				taskCb(null);
			} else {
				taskCb("no-cache");
			}
		});
		if (ruleRet === true) {
			taskCb(null);
		} else if (ruleRet === false) {
			taskCb("no-cache");
		}
	};
}