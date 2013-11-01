var
	http = require("http"),
	connect = require("connect")
;

module.exports = exports = CacheServer;

function CacheServer(port, cache, cb) {
	this.port = port;
	this.app = connect()
		.use(cache)
	;

	this.server = http.createServer(this.app).listen(port, cb);
};

CacheServer.prototype.close = function() {
	this.server.close();
};
