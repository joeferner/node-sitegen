'use strict';

var async = require('async');
var path = require('path');
var fs = require('fs');
var glob = require('glob');
var mkdirp = require('mkdirp');
var fsExtra = require('fs-extra');
var ejs = require('ejs');

var templateFileSeperator = '---';

module.exports = function(options, callback) {
  options = options || {};
  options.indir = options.indir || process.cwd();
  options.outdir = options.outdir || path.join(options.indir, '_build');
  options.layoutsDir = path.resolve(options.layoutsDir || path.join(options.indir, '_layouts'));
  options.postsDir = path.resolve(options.postsDir || path.join(options.indir, 'posts'));
  options.defaultLayout = options.defaultLayout || 'layout.ejs';
  callback = callback || function() {};

  async.auto({
    'outdir': mkdirp.bind(null, options.outdir),
    'posts': readPosts.bind(null, options),
    'files': ['posts', 'outdir', processFiles.bind(null, options)]
  }, callback);
};

function readPosts(options, callback) {
  return glob('*/index.ejs', { cwd: options.postsDir }, function(err, files) {
    if (err) {
      return callback(err);
    }
    return async.forEach(files, processPostFile.bind(null, options), callback);
  });
}

function processPostFile(options, fileName, callback) {
  var fullFileName = path.resolve(options.postsDir, fileName);
  return readTemplateFile(options, fullFileName, function(err, template) {
    if (err) {
      return callback(err);
    }
    options.posts = options.posts || [];
    options.posts.push(template);
    return callback();
  });
}

function processFiles(options, callback) {
  return glob('**/*', { cwd: options.indir }, function(err, files) {
    if (err) {
      return callback(err);
    }
    return async.forEach(files, processFile.bind(null, options), callback);
  });
}

function processFile(options, fileName, callback) {
  var fullFileName = path.resolve(options.indir, fileName);
  if (fullFileName.indexOf(options.layoutsDir) == 0) {
    return callback();
  }
  return fs.stat(fullFileName, function(err, stats) {
    if (err) {
      return callback(err);
    }
    if (stats.isDirectory()) {
      return callback();
    }
    var ext = path.extname(fullFileName);
    if (ext == '.ejs') {
      return processTemplateFile(options, fileName, callback);
    } else {
      return copyFileToOutput(options, fileName, callback);
    }
  });
}

function copyFileToOutput(options, fileName, callback) {
  var sourceFullFileName = path.resolve(options.indir, fileName);
  var destFullFileName = path.resolve(options.outdir, fileName);
  console.log('copying: ' + path.relative(options.indir, sourceFullFileName) + ' -> ' + path.relative(options.outdir, destFullFileName));
  mkdirp(path.dirname(destFullFileName), function(err) {
    if (err) {
      return callback(err);
    }
    return fsExtra.copy(sourceFullFileName, destFullFileName, callback);
  });
}

function processTemplateFile(options, fileName, callback) {
  var sourceFullFileName = path.resolve(options.indir, fileName);
  var destFullFileName = path.resolve(options.outdir, fileName.substr(0, fileName.length - '.ejs'.length) + '.html');
  console.log('processing: ' + path.relative(options.indir, sourceFullFileName) + ' -> ' + path.relative(options.outdir, destFullFileName));
  return readTemplateFile(options, sourceFullFileName, function(err, template) {
    if (err) {
      return callback(err);
    }
    template.body = ejs.render(template.body, options);

    var layoutsFileName = getLayoutsFileName(options, template.layout);
    return readLayoutFile(options, layoutsFileName, function(err, layout) {
      if (err) {
        return callback(err);
      }
      var renderedData = ejs.render(layout, template);
      return mkdirp(path.dirname(destFullFileName), function(err) {
        if (err) {
          return callback(err);
        }
        return fs.writeFile(destFullFileName, renderedData, callback);
      });
    });
  });
}

function readLayoutFile(options, fileName, callback) {
  options.cachedLayouts = options.cachedLayouts || {};
  if (options.cachedLayouts[fileName]) {
    return callback(null, options.cachedLayouts[fileName]);
  }

  return fs.readFile(fileName, function(err, data) {
    if (err) {
      return callback(err);
    }
    data = data.toString();
    options.cachedLayouts[fileName] = data;
    return callback(null, data);
  });
}

function getLayoutsFileName(options, layout) {
  layout = layout || options.defaultLayout;
  return path.resolve(options.layoutsDir, layout);
}

function readTemplateFile(options, fileName, callback) {
  return fs.readFile(fileName, function(err, data) {
    if (err) {
      return callback(err);
    }
    data = data.toString();
    try {
      data = parseTemplateFileContents(data);
    } catch (ex) {
      return callback(new Error("Could not parse template file: " + fileName + "\n" + ex.stack));
    }
    data.href = path.join(path.dirname(path.relative(options.indir, fileName)), "index.html");
    return callback(null, data);
  });
}

function parseTemplateFileContents(data) {
  var sepIndex = data.indexOf(templateFileSeperator);
  var config = data.substr(0, sepIndex);
  config = config.replace(/([a-zA-Z]*:)(?=\s*:)/g, '"$1"'); // make all keys have quotes.
  config = JSON.parse(config);
  var body = data.substr(sepIndex + templateFileSeperator.length);
  if (body[0] == '\n') {
    body = body.substr(1);
  }
  config.body = body;
  return config;
}
