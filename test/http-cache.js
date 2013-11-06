var
	assert = require("assert"),
	request = require("request"),
	zlib = require("zlib"),
	HttpCache = require("./setup").HttpCache,
	CacheServer = require("./cache-server")
;

describe("http-cache", function() {

	var server, cache, ops;

	before(function(done) {
		opts = {
			rules: function(req, res, cb) {
				if (/\/asyncRule\//.test(req.url) === true) {
					setTimeout(function() {
						if (/no-cache/.test(req.url) === true) {
							cb(null, false); // do not cache
						} else if (/cache/.test(req.url) === true) {
							cb(null, true); // cache
						} else {
							cb("error"); // something went wrong, do not cache
						}
					}, 100);
				} else {
					// do not cache users folder
					return (/\/users\//i.test(req.url) === false);
				}
			}, ttl: 2, purgeAll: true, provider: require("./setup").provider
			, confirmCacheBeforeEnd: true
		};

		cache = HttpCache(opts); // do NOT call new, this is one of our tests
		server = new CacheServer(6852, cache, done);
		server.app.use(function(req, res) {
			switch (req.url) {
				case "/writeHead":
					res.writeHead(200, { "X-TEST": new Date().getTime().toString() });
					res.end("Caching page '" + req.url + "' at " + new Date().getTime());
				break;
				case "/setHeader":
					res.setHeader("X-TEST", new Date().getTime().toString());
					res.end("Caching page '" + req.url + "' at " + new Date().getTime());
				break;
				case "/write":
					res.setHeader("X-TEST", new Date().getTime().toString());
					res.write("123");
					res.write("456");
					res.end();
				break;
				case "/writeEncoding":
					res.setHeader("X-TEST", new Date().getTime().toString());
					res.write("123", "ascii");
					res.end();
				break;
				case "/endEncoding":
					res.setHeader("X-TEST", new Date().getTime().toString());
					res.end("Caching page '" + req.url + "' at " + new Date().getTime(), "ascii");
				break;
				case "/cacheControl/private":
					res.setHeader("X-TEST", new Date().getTime().toString());
					res.setHeader("Cache-Control", "private");
					res.end("Caching page '" + req.url + "' at " + new Date().getTime());
				break;
				case "/cacheControl/no-cache":
					res.setHeader("X-TEST", new Date().getTime().toString());
					res.end("Caching page '" + req.url + "' at " + new Date().getTime());
				break;
				case "/acceptEncoding":
				case "/acceptEncoding/gzipFirst":
					res.setHeader("X-TEST", new Date().getTime().toString());
					res.end("TEST" + (new Array(1024).join("X-X"))); // big enough to gzip
				break;
				case "/exclude-header":
					res.setHeader("Set-Cookie", new Date().getTime().toString());
					res.end("Caching page '" + req.url + "' at " + new Date().getTime());
				break;
				case "/reasonPhrase":
					res.writeHead(200, "TEST");
					res.end();
				break;
				case "/endNoData":
					res.end();
				break;
				case "/contentLength":
					res.end("TEST");
				break;
				default:
					res.setHeader("X-TEST", new Date().getTime().toString());
					res.end("Caching page '" + req.url + "' at " + new Date().getTime());
				break;
			}
		});
	});
	
	after(function() {
		server.close();
	});

	it("provider.clear", function(done) {
		cache.provider.set("TEST", "TEST", 10, function(err) {
			assert.ifError(err);
			cache.provider.get("TEST", function(err, val) {
				assert.ifError(err);
				assert.equal(val, "TEST");
				cache.provider.clear(function(err) {
					assert.ifError(err);					
					cache.provider.get("TEST", function(err, val) {
						assert.ifError(err);
						assert.ok(!val);
						done();
					});
				});
			});
		});
	});
	
	it("provider.get", function(done) {
		cache.provider.get("TEST", function(err, val) {
			assert.ifError(err);
			assert.ok(!val);
			done();
		});
	});
	
	it("provider.set", function(done) {
		cache.provider.set("TEST", "TEST", 10, function(err) {
			assert.ifError(err);
			cache.provider.get("TEST", function(err, val) {
				assert.ifError(err);
				assert.equal(val, "TEST");
				done();
			});
		});
	});
	
	it("provider.remove", function(done) {
		cache.provider.remove("TEST", function(err, val) {
			assert.ifError(err);
			cache.provider.get("TEST", function(err, val) {
				assert.ifError(err);
				assert.ok(!val);
				done();
			});
		});
	});

	it("rule-based exclusion", function(done) {
		var lastResponse;
		request.get("http://localhost:6852/users/1", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			lastResponse = body;
			request.get("http://localhost:6852/users/1", function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.notEqual(body, lastResponse);

				done();
			});
		});
	});

	it("asyncRule/cache", function(done) {
		var xTest;
		request.get("http://localhost:6852/asyncRule/cache", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["x-test"]);
			xTest = res.headers["x-test"];
			request.get("http://localhost:6852/asyncRule/cache", function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.ok(res.headers["x-test"]);
				assert.equal(res.headers["x-test"], xTest);
				done();
			});
		});
	});

	it("asyncRule/no-cache", function(done) {
		var xTest;
		request.get("http://localhost:6852/asyncRule/no-cache", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["x-test"]);
			xTest = res.headers["x-test"];
			request.get("http://localhost:6852/asyncRule/no-cache", function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.ok(res.headers["x-test"]);
				assert.notEqual(res.headers["x-test"], xTest);
				done();
			});
		});
	});

	it("asyncRule/error", function(done) {
		var xTest;
		request.get("http://localhost:6852/asyncRule/error", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["x-test"]);
			xTest = res.headers["x-test"];
			request.get("http://localhost:6852/asyncRule/error", function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.ok(res.headers["x-test"]);
				assert.notEqual(res.headers["x-test"], xTest);
				done();
			});
		});
	});
	
	it("Accept-Encoding:undefined", function(done) {
		var xTest;
		request.get({ url: "http://localhost:6852/acceptEncoding", headers: { "Accept-Encoding": "" } }, function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["x-test"]);
			assert.notEqual(res.headers["content-encoding"], "gzip");
			assert.equal(body.substr(0, 4), "TEST");
			xTest = res.headers["x-test"];
			request.get({ url: "http://localhost:6852/acceptEncoding", headers: { "Accept-Encoding": "" } }, function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.ok(res.headers["x-test"]);
				assert.equal(res.headers["x-test"], xTest);
				done();
			});
		});
	});

	it("Accept-Encoding:none", function(done) {
		var xTest;
		request.get({ url: "http://localhost:6852/acceptEncoding", headers: { "Accept-Encoding": "none" } }, function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["x-test"]);
			assert.notEqual(res.headers["content-encoding"], "gzip");
			assert.equal(body.substr(0, 4), "TEST");
			xTest = res.headers["x-test"];
			request.get({ url: "http://localhost:6852/acceptEncoding", headers: { "Accept-Encoding": "none" } }, function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.ok(res.headers["x-test"]);
				assert.equal(res.headers["x-test"], xTest);
				done();
			});
		});
	});
	
	it("Accept-Encoding:gzip", function(done) {
		var xTest, lastBody;
		request.get({ url: "http://localhost:6852/acceptEncoding", headers: { "Accept-Encoding": "gzip" }, encoding:null }, function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["x-test"]);
			assert.equal(res.headers["content-encoding"], "gzip");
			zlib.gunzip(body, function(err, result) {
				assert.equal(result.toString("utf8").substr(0, 4), "TEST");
				xTest = res.headers["x-test"];
				request.get({ url: "http://localhost:6852/acceptEncoding", headers: { "Accept-Encoding": "gzip" }, encoding:null }, function(err, res, body2) {
					assert.ifError(err);
					assert.equal(res.statusCode, 200);
					assert.ok(res.headers["x-test"]);
					assert.equal(res.headers["x-test"], xTest);
					assert.equal(body.length, body2.length);
					done();
				});
			});
		});
	});

	it("Accept-Encoding:gzip", function(done) {
		var xTest;
		request.get({ url: "http://localhost:6852/acceptEncoding/gzipFirst", headers: { "Accept-Encoding": "gzip" }, encoding:null }, function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["x-test"]);
			assert.equal(res.headers["content-encoding"], "gzip");
			//assert.equal(body.substr(0, 4), "TEST");
			xTest = res.headers["x-test"];
			request.get({ url: "http://localhost:6852/acceptEncoding/gzipFirst", headers: { "Accept-Encoding": "gzip" }, encoding:null }, function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.ok(res.headers["x-test"]);
				assert.equal(res.headers["x-test"], xTest);
				done();
			});
		});
	});
	
	it("setHeader support", function(done) {
		var xTest;
		request.get("http://localhost:6852/setHeader", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["x-test"]);
			xTest = res.headers["x-test"];
			request.get("http://localhost:6852/setHeader", function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.ok(res.headers["x-test"]);
				assert.equal(res.headers["x-test"], xTest);
				done();
			});
		});
	});

	it("endEncoding support", function(done) {
		var xTest;
		request.get("http://localhost:6852/endEncoding", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["x-test"]);
			xTest = res.headers["x-test"];
			request.get("http://localhost:6852/endEncoding", function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.ok(res.headers["x-test"]);
				assert.equal(res.headers["x-test"], xTest);
				done();
			});
		});
	});

	it("writeHead support", function(done) {
		var xTest;
		request.get("http://localhost:6852/writeHead", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["x-test"]);
			xTest = res.headers["x-test"];
			request.get("http://localhost:6852/writeHead", function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.ok(res.headers["x-test"]);
				assert.equal(res.headers["x-test"], xTest);
				done();
			});
		});
	});

	it("writeEncoding support", function(done) {
		var xTest;
		request.get("http://localhost:6852/writeEncoding", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["x-test"]);
			xTest = res.headers["x-test"];
			request.get("http://localhost:6852/writeEncoding", function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.ok(res.headers["x-test"]);
				assert.equal(res.headers["x-test"], xTest);
				done();
			});
		});
	});
	
	it("chunk support", function(done) {
		var xTest;
		request.get("http://localhost:6852/write", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["x-test"]);
			assert.equal(body, "123456");
			xTest = res.headers["x-test"];
			request.get("http://localhost:6852/write", function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.ok(res.headers["x-test"]);
				assert.equal(res.headers["x-test"], xTest);
				done();
			});
		});
	});
	
	it("Cache-Control:private", function(done) {
		var xTest;
		request.get("http://localhost:6852/cacheControl/private", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["x-test"]);
			xTest = res.headers["x-test"];
			request.get("http://localhost:6852/cacheControl/private", function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.ok(res.headers["x-test"]);
				assert.notEqual(res.headers["x-test"], xTest);
				done();
			});
		});
	});
	
	it("Cache-Control:no-cache", function(done) {
		var xTest;
		request.get({ url: "http://localhost:6852/cacheControl/no-cache", headers: { "cache-control": "no-cache" } }, function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["x-test"]);			
			xTest = res.headers["x-test"];
			request.get({ url: "http://localhost:6852/cacheControl/no-cache", headers: { "cache-control": "no-cache" } }, function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.ok(res.headers["x-test"]);
				assert.notEqual(res.headers["x-test"], xTest);
				done();
			});
		});
	});
	
	it("if-modified-since", function(done) {
		var lastModified;
		request.get("http://localhost:6852/if-modified-since", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["last-modified"]);
			lastModified = res.headers["last-modified"];
			request.get({ url: "http://localhost:6852/if-modified-since", headers: { "if-modified-since": lastModified } }, function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 304);
				done();
			});
		});
	});
	
	it("exclude-header", function(done) {
		request.get("http://localhost:6852/exclude-header", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["set-cookie"]);
			request.get("http://localhost:6852/exclude-header", function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.ok(!res.headers["set-cookie"]);
				done();
			});
		});
	});
	
	it("reasonPhrase", function(done) {
		request.get("http://localhost:6852/reasonPhrase", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			// todo: node does not currently expose mechanism to extract reason, will add more verification later
			done();
		});
	});
	
	it("contentLength", function(done) {
		request.get("http://localhost:6852/contentLength", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.equal(body, "TEST");
			assert.equal(res.headers["content-length"], 4);
			done();
		});
	});
	
	it("endNoData", function(done) {
		request.get("http://localhost:6852/endNoData", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.equal(body, "");
			request.get("http://localhost:6852/endNoData", function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.equal(body, "");
				done();
			});
		});
	});
	
	it("ttl support", function(done) {
		var xTest;
		request.get("http://localhost:6852/ttl", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.ok(res.headers["x-test"]);
			xTest = res.headers["x-test"];
			request.get("http://localhost:6852/ttl", function(err, res, body) {
				assert.ifError(err);
				assert.equal(res.statusCode, 200);
				assert.ok(res.headers["x-test"]);
				assert.equal(res.headers["x-test"], xTest);
				setTimeout(function() {
					// /ttl should be purged by now based on a ttl of 1s
					request.get("http://localhost:6852/ttl", function(err, res, body) {
						assert.ifError(err);
						assert.equal(res.statusCode, 200);
						assert.ok(res.headers["x-test"]);
						assert.notEqual(res.headers["x-test"], xTest);
						done();
					});
				}, 2200);
			});
		});
	});
});
