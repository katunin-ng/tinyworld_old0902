"use strict";

/*
 * starts tests and test results server
 * Syntax: node testrunner.js testPattern
 * testPattern: may include * for many chars and ? for one char
 *
 * Example: node testrunner.js *Test true
 *
 * Test results server listens on port assigned by che
 * /TestRunner: returns test results in json format
 * /coverage: returns coverage results in html
 *
 * Requires express lib
 * Requires compression lib
 *
 * process.env.CLIENT_ORIGIN
 * 	request client origin from window.location.origin needed for cross site access
 *
 * process.env.PORT
 * 	app port set by che
 *
 *
	var http = require('http');
	var https = require('https');
	var privateKey  = fs.readFileSync('server.key', 'utf8');
	var certificate = fs.readFileSync('server.crt', 'utf8');

	var credentials = {
		key: privateKey,
		cert: certificate
	};

	var app = express();
	var httpServer = http.createServer(app);
	var httpsServer = https.createServer(credentials, app);
	httpServer.listen(80);
	httpsServer.listen(443);
 */

var fs = require('fs');

var xsjstest = require("sap-xsjs-test");

var express = require("express");
var compression = require("compression");


function cleanCoverage(coverage, rootFolder) {
	var result = {};

	Object.keys(coverage).forEach(function(key) {
		var val = coverage[key];
		key = key.replace(rootFolder, "").replace(/[\/\\]+/gm, "/");
		result[key] = val;
	});

	return result;
}

function cleanReport(report, rootFolder) {

	if (report.suites) {
		report.suites.forEach(function(suite) {
			if (suite.specs) {
				suite.specs.forEach(function(spec) {
					if (spec.resource && spec.resource.uri) {
						spec.resource.uri = spec.resource.uri.replace(rootFolder, "").replace(/[\/\\]+/gm, "/");
					}
				});
			}

			if (suite.suites) {
				cleanReport(suite, rootFolder);
			}
		});
	}
}

var reportFile = __dirname + "/report.json";
var coverageFile = __dirname + "/coverage/coverage.json";

// get file name from command line
var testFilePattern = process.argv[2] || "*Test";
testFilePattern = testFilePattern.replace("*", ".*").replace("?", ".?");

// get coverage flag from command line
var addCoverage = process.argv[3] || true;

// ends with
if (testFilePattern.slice(-1) !== "$") {
	testFilePattern = testFilePattern + "$";
}

// get origin from env variable
var origin = process.env.CLIENT_ORIGIN;

// get port from che environment
var port = process.env.PORT || 7000;

var status = "initial";

console.log("Test file pattern: " + testFilePattern);
console.log("Origin: " + origin);
console.log("Port: " + port);
console.log("Coverage: " + addCoverage);
console.log("Report file: " + reportFile);
console.log("Coverage file: " + coverageFile);
console.log("Project root dir: " + __dirname);

// get HANA connection settings
var options = {
	hana: {
		host: "",
		password: "",
		port: 0,
		schema: "",
		user: ""
	},
	test : {
		format: "json",
		pattern: testFilePattern
	},
	coverage : addCoverage
};

// create web server, add compression (gzip)
var app = express();
app.use(compression());

app.get("/", function(req, res) {
	res.send("Test Server Running");
});

// ... route "status" requests to status content
app.get("/status", function(req, res) {

	if (origin) {
		res.set({
			//window.location.origin
			"Access-Control-Allow-Methods": "GET",
			"Access-Control-Allow-Origin": origin
		});
	}

	var response = {
		status: status
	};

	if (status === "finished") {
		fs.readFile(reportFile, "utf8", function(errR, dataR) {
			if (!errR) {
				var report = JSON.parse(dataR);

				cleanReport(report, __dirname);

				response.report = report;

				if (addCoverage) {
					fs.readFile(coverageFile, "utf8", function(errC, dataC) {
						if (!errC) {
							var coverage = JSON.parse(dataC);

							coverage = cleanCoverage(coverage, __dirname);

							response.coverage = coverage;
							response.status = "finished";
						}

						res.send(response);
					});

					return;
				}

				response.status = "finished";
			}

			res.send(response);
		});

	} else {
		res.send(response);
	}

});

// start server
app.listen(port);
console.log("Test Results Server running at " + port);

var testapp = xsjstest(options);

status = "running";
testapp.runTests(function(output) {
	status = "pending";
	fs.writeFile(reportFile, output, function(err) {
		if (!err) {
			status = "finished";
		}
	});
});
