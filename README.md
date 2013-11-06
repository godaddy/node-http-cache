# http-cache

[![Build Status](https://travis-ci.org/godaddy/node-http-cache.png)](https://travis-ci.org/godaddy/node-http-cache) [![NPM version](https://badge.fury.io/js/http-cache.png)](http://badge.fury.io/js/http-cache)


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
	
	
## HttpCache Options

Options may be provided when constructing your HttpCache object...

	var HttpCache = require("http-cache");
	var httpcache = new HttpCache({ /* my options go here */ });
	
Options include:

* ttl (default: 600) - Time (in seconds) before cache object will be purged.
* provider (default: require("lib/providers/InProcProvider")) - Alternate providers may
  be specified, including your own Custom Provider.
* headersToExclude (default: see code) - You may optionally manage which HTTP headers
  are included/excluded via this object.
* rules (default: []) - An optional set of custom caching rules. See Custom Rules.
* purgeAll (default: false) - If true, will clear all cache objects from the provider.
* confirmCacheBeforeEnd (default: false) - If set to true, will confirm successful
  cache writes before ending response. Typically only used for unit tests to avoid
  race conditions. Should not be used in a production setting.

	
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

	
## Custom Provider
	
Providers are intended to be very simple and extensible, so feel free to contribute
your own providers if what is provided does not suite your needs.

* provider.isTTLManaged - If set to true, http-cache will not be responsible for
  purging expired entries. Reserved for distributed providers that have internal
  support for TTL that will be more reliable.
* provider.get(key, cb) - Returns object via callback. If no object found, null or undefined
  should be returned, NOT an error.
* provider.set(key, cache, cb) - Stores a JavaScript object in whatever means necessary.
* provider.remove(key, cb) - Removes cache entry if it exists.
* provider.clear(cb) - Purges all cache entries.


See lib/providers/in-proc-provider.js to see how to create your own provider.



## Available Providers

If you build your own custom provider, feel free to issue a pull request so we can reference
your provider as well.

* InProcProvider - https://github.com/godaddy/node-http-cache/blob/master/lib/providers/in-proc-provider.js
* CassandraProvider - https://npmjs.org/package/http-cache-cassandra
* FileSystemProvider - TODO
	

## Tests & Code Coverage

	npm test

View code coverage in any browser:

	coverage/lcov-report/index.html



## License

[MIT](https://github.com/godaddy/node-http-cache/blob/master/LICENSE.txt)



## TODO

* Add FileSystem Provider
* Add sliding TTL support? (Possible performance impact)
* Add per-request TTL customization? (Possible performance impact)
* Add support for array based header values (part of node spec), i.e.
	* res.writeHead(200, { "set-cookie": [cookie1, cookie2] });
