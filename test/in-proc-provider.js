var
	assert = require("assert"),
	request = require("request"),
	HttpCache = require("../index"),
	InProcProvider = require("../lib/providers/in-proc-provider"),
	CacheServer = require("./cache-server")
;

describe("in-proc-provider", function() {

	var server;

	before(function(done) {
		var provider = InProcProvider({ }); // specifically do not call new to test alternate code path
		server = new CacheServer(6852, new HttpCache({ provider: provider }), done);
		server.app.use(function(req, res) {
			res.end("Caching page '" + req.url + "' at " + new Date().getTime());
		});
	});
	
	after(function() {
		server.close();		
	});

	var lastResponse;
	
	it("empty cache", function(done) {
		request.get("http://localhost:6852/", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			lastResponse = body;
			done();
		});
	});
	
	it("full cache", function(done) {
		request.get("http://localhost:6852/", function(err, res, body) {
			assert.ifError(err);
			assert.equal(res.statusCode, 200);
			assert.equal(body, lastResponse);
			done();
		});
	});
});
