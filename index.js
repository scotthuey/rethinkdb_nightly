var moment = require("moment");
var util = require("util");
var fs = require("fs");
var path = require("path");
const setPasswordFromDockerSecret = require("./lib/pw_from_docker_secret"); 

var exec = require('child_process').exec
  , spawn = require('child_process').spawn
  , path = require('path');

/**
 * log
 *
 * Logs a message to the console with a tag.
 *
 * @param message  the message to log
 * @param tag      (optional) the tag to log with.
 */
function log(message, tag) {
  var util = require('util')
    , color = require('cli-color')
    , tags, currentTag;

  tag = tag || 'info';

  tags = {
    error: color.red.bold,
    warn: color.yellow,
    info: color.cyanBright
  };

  currentTag = tags[tag] || function(str) { return str; };
  util.log((currentTag("[" + tag + "] ") + message).replace(/(\n|\r|\r\n)$/, ''));
}

/**
 * getArchiveName
 *
 * Returns the archive name in database_YYYY_MM_DD.tar.gz format.
 *
 * @param databaseName   The name of the database
 */
function getArchiveName(databaseName) {
  return util.format("%s_%s_dump.tar.gz",databaseName, moment().format("YYYY-MM-DD"))
}

/* removeRF
 *
 * Remove a file or directory. (Recursive, forced)
 *
 * @param target       path to the file or directory
 * @param callback     callback(error)
 */
function removeRF(target, callback) {
  var fs = require('fs');

  callback = callback || function() { };

  fs.exists(target, function(exists) {
    if (!exists) {
      return callback(null);
    }
    log("Removing " + target, 'warn');
    exec( 'rm -rf ' + target, callback);
  });
}
function checkTempDir(tmp, callback){
  fs.exists(tmp, function(exists){
    if(!exists){
      fs.mkdir(tmp, callback)
    }else{
      callback(null,true);
    }
  });
}
/**
 * dbDump
 *
 * Calls dump on a specified cluster.
 *
 * @param options    RethinkDB connection options [host, port, username, password, db]
 * @param directory  Directory to dump the database to
 * @param callback   callback(err)
 */
function dbDump(options, directory, archiveName, callback) {
  var dump
    , rethinkOptions;

  callback = callback || function() { };

  rethinkOptions = [
    'dump',
    '-c', options.host + ':' + options.port,
    '-f', path.join(directory,archiveName)
  ];
  
  rethinkOptions = setPasswordFromDockerSecret(options, rethinkOptions);

  //set the filename to now

  if(options.auth_key) {
    rethinkOptions.push('-a');
    rethinkOptions.push(options.auth_key);
  }

  log('Starting dump of ' + options.db, 'info');
  dump = spawn('rethinkdb', rethinkOptions);

  dump.stdout.on('data', function (data) {
    log(data);
  });

  dump.stderr.on('data', function (data) {
    log(data, 'error');
  });
  dump.on("error", function(err){
    log(err, 'error');
  })
  dump.on('exit', function (code) {
    if(code === 0) {
      log('dump executed successfully', 'info');
      callback(null);
    } else {
      callback(new Error("Rethinkdb dump exited with code " + code));
    }
  });
}
/**
 * sendToS3
 *
 * Sends a file or directory to S3.
 *
 * @param options   s3 options [key, secret, bucket]
 * @param directory directory containing file or directory to upload
 * @param target    file or directory to upload
 * @param callback  callback(err)
 */
function sendToS3(options, directory, target, callback) {
  console.log(directory);
  var minio = require('minio')
    , sourceFile = path.join(directory, target)
    , s3client
    , destination = options.destination || '/';

  callback = callback || function() { };

  s3client = new minio.Client({
    useSSL: options.secure || false,
    endPoint: options.endpoint,
    port: options.port || 443,
    style: options.style, // -- not used for minio client
    accessKey: options.key,
    secretKey: options.secret
  });

  log('Attemping to upload ' + target + ' to the ' + options.bucket + ' s3 bucket');
  
  s3Client.fPutObject(options.bucket, target, sourceFile, function(e) {
    if (e) {
      return callback(e);
    }
    log('Successfully uploaded to s3');
    return callback();
  })

}

/**
 * sync
 *
 * Performs a dump on a your cluster, gzips the data,
 * and uploads it to s3.
 *
 * @param rethinkdbConfig   rethinkdb config [host, port, username, password, db]
 * @param s3Config        s3 config [key, secret, bucket]
 * @param callback        callback(err)
 */
function sync(rethinkdbConfig, s3Config, callback) {
  var tmpDir = path.join(process.cwd(), 'temp')
    , backupDir = path.join(tmpDir, rethinkdbConfig.db)
    , archiveName = getArchiveName(rethinkdbConfig.db)
    , async = require('async');

  callback = callback || function() { };

  async.series([
    async.apply(checkTempDir, tmpDir),
    async.apply(removeRF, backupDir),
    async.apply(removeRF, path.join(tmpDir, archiveName)),
    async.apply(dbDump, rethinkdbConfig, tmpDir,archiveName),
    //async.apply(compressDirectory, tmpDir, rethinkdbConfig.db, archiveName),
    async.apply(sendToS3, s3Config, tmpDir, archiveName)
  ], function(err) {
    if(err) {
      log(err, 'error');
    } else {
      log('Successfully backed up ' + rethinkdbConfig.db);
    }
    return callback(err);
  });
}

module.exports = { sync: sync, log: log };
