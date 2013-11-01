# http-cache

[![Build Status](https://travis-ci.org/godaddy/node-http-cache.png)](https://travis-ci.org/godaddy/node-http-cache) [![NPM version](https://badge.fury.io/js/http-cache.png)](http://badge.fury.io/js/http-cache) [![Dependency Status](https://gemnasium.com/godaddy/node-http-cache.png)](https://gemnasium.com/godaddy/node-http-cache)


## Install

	npm install http-cache

https://npmjs.org/package/http-cache


## What is it?

A simple HTTP caching interface with extensible provider support.

 
## Getting Started with Connect/Express

Using Connect or Express?

	var
		connect = require("connect"),
		http = require("http"),
		HttpCache = require("http-cache")
	;

	var app = connect()
		.use(new HttpCache({ }))
		.use(function(req, res) {
			res.end("Cache this response! Time=" + new Date().getTime());
		});

	http.createServer(app).listen(8392);

	
## Getting Started with HTTP

Real coders use no middleware? We've got you covered...

	var
		http = require("http"),
		HttpCache = require("http-cache")
	;

	var httpcache = new HttpCache({ });
	http.createServer(function(req, res) {
		httpcache(req, res, function() {
			res.end("Cache this response! Time=" + new Date().getTime());
		});
	}).listen(8392);
	
	
## Custom Rules

Both synchronous and asynchronous rules may be provided:

	httpcache({
		rules: function(req, res) {
			// do not cache users folder
			return (/\/users\//i.test(req.url) === false);
		}
	});

Async rules leverage cb instead of returning...

	httpcache({
		rules: function(req, res, cb) {
			setTimeout(function() {
				// do not cache users folder
				cb(null, /\/users\//i.test(req.url) === false);
			}, 100);
		}
	});
	
Multiple rules may be provided as well... (will be processed in parallel)

	httpcache({
		rules: [ rule1, rule2, rule3 ]
	});


## Tests & Code Coverage

	npm test

Now you can view coverage using any browser here:

	coverage/lcov-report/index.html



## License

[MIT](https://github.com/godaddy/node-http-cache/blob/master/LICENSE.txt)



## TODO

* Purge Support
* Add FileSystem Provider
* Add Cassandra Provider
* Add sliding TTL support? (Possible performance impact)
* Add per-request TTL customization? (Possible performance impact)
