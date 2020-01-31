const fs = require("fs");
const util = require("util");
const pwFile = "/.rc";

// -- specific for users of docker secrets allow password to be derived from a docker secret specified in options
// -- format is username|password where for purposes of this module username would always be admin as the 
// -- command line option expects password for that user
module.exports = function (options, rethinkOptions){
	try {
		if(options.secret) {
			const secretPath = util.format("/run/secrets/%s", options.secret);
			if(fs.existsSync(secretPath)) {
				const secret = fs.readFileSync(util.format("/run/secrets/%s", secret), "utf8").trim();
				const pw = secret.split("|")[1];
				fs.writeFileSync(pwFile, pw);
				rethinkOptions.push("--password-file", pwFile);
			}
		}
		return rethinkOptions;
	}
	catch(err){
		console.error("Attempt to derive password from docker secret failed.", err.message, err.stack);
		process.exit();
	}
};