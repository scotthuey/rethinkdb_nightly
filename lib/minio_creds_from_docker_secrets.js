const fs = require("fs");
const util = require("util");

// -- specific for users of docker secrets allow password to be derived from a docker secret specified in options
// -- format is username|password where for purposes of this module username would always be admin as the
// -- command line option expects password for that user
module.exports = function () {
  try {
    const keySecretPath = util.format("/run/secrets/%s", "MINIO_ACCESS_KEY");
    const secretSecretPath = util.format("/run/secrets/%s", "MINIO_SECRET_KEY");
    if (fs.existsSync(keySecretPath) && fs.existsSync(secretSecretPath)) {
      const accessKey = fs.readFileSync(keySecretPath, "utf8").trim();
      const secretKey = fs.readFileSync(secretSecretPath, "utf8").trim();
      return { accessKey, secretKey };
    }
    return undefined;
  } catch (err) {
    console.error(
      "Attempt to derive minio credentials from docker secrets failed.",
      err.message,
      err.stack
    );
    process.exit();
  }
};
