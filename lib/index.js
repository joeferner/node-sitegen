'use strict';

var async = require('async');
var path = require('path');
var fs = require('fs');
var glob = require('glob');

var templateFileSeperator = '---';

module.exports = function(options, callback) {
  options = options || {};
  options.dir = options.dir || process.cwd();
  options.layoutsDir = options.layoutsDir || path.join(options.dir, '_layouts');
  options.postDir = options.postDir || path.join(options.dir, '_posts');
  callback = callback || function() {};

  return async.auto({
    'layouts': readLayouts.bind(null, options),
    'posts': ['layouts', processPosts.bind(null, options)]
  }, callback);
};

function readLayouts(options, callback) {
  return glob(path.join(options.layoutsDir, '**/*.ejs'), function(err, files) {
    if (err) {
      return callback(err);
    }
    return async.forEach(files, function(file, callback) {
      return fs.readFile(file, function(err, data) {
        if (err) {
          return callback(err);
        }
        data = data.toString();
        options.layouts = options.layouts || {};
        options.layouts[path.basename(file, '.ejs')] = data;
        return callback();
      });
    }, callback);
  });
}

function processPosts(options, callback) {
  return glob(path.join(options.postDir, '**/*.ejs'), function(err, files) {
    if (err) {
      return callback(err);
    }
    return async.forEach(files, function(file, callback) {
      return fs.readFile(file, function(err, data) {
        if (err) {
          return callback(err);
        }
        data = data.toString();
        try {
          data = parseTemplateFile(data);
        } catch (ex) {
          return callback(new Error("Could not parse template file: " + file + "\n" + ex.stack));
        }
        console.log(data);
        return callback();
      });
    }, callback);
  });
}

function parseTemplateFile(data) {
  var sepIndex = data.indexOf(templateFileSeperator);
  var config = data.substr(0, sepIndex);
  config = config.replace(/([a-zA-Z]*:)(?=\s*:)/g, '"$1"'); // make all keys have quotes.
  config = JSON.parse(config);
  var body = data.substr(sepIndex + templateFileSeperator.length);
  return {
    config: config,
    body: body
  }
}
