var CACHE = {};

module.exports = exports = InProcProvider;

function InProcProvider()
{
	if (!(this instanceof InProcProvider)) {
		return new InProcProvider();
	}
}

var p = InProcProvider.prototype;

p.get = function(key, cb) {
//console.log("InProcProvider.get: " + key);
var ret = CACHE[key];
//console.dir(ret);
	cb && cb(null, ret);
};

p.set = function(key, cache, cb) {
//console.log("InProcProvider.set: " + key);
//console.dir(cache);
	CACHE[key] = cache;
	cb && cb(null);
};

p.remove = function(key, cb) {
//console.log("InProcProvider.remove: " + key);
	delete CACHE[key];
	cb && cb(null);
};

p.clear = function(cb) {
//console.log("InProcProvider.clear");
	CACHE = {};
	cb && cb(null);
};
