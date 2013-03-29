'use strict';

var async = require('async');
var path = require('path');
var fs = require('fs');
var glob = require('glob');
var mkdirp = require('mkdirp');
var fsExtra = require('fs-extra');
var ejs = require('ejs');
var less = require('less');
var sf = require('sf');

var templateFileSeperator = '---';

module.exports = function(options, callback) {
  options = options || {};
  options.indir = options.indir || process.cwd();
  options.outdir = options.outdir || path.join(options.indir, '_build');
  options.layoutsDir = path.resolve(options.layoutsDir || path.join(options.indir, '_layouts'));
  options.postsDir = path.resolve(options.postsDir || path.join(options.indir, 'posts'));
  options.configFile = path.resolve(options.configFile || path.join(options.indir, '_config.json'));
  options.rssTemplateFile = path.resolve(options.rssTemplateFile || path.join(__dirname, 'rss.ejs'));
  options.defaultLayout = options.defaultLayout || 'layout.ejs';
  options.rssDateFormat = rssDateFormat;
  callback = callback || function() {};

  async.auto({
    'outdir': mkdirp.bind(null, options.outdir),
    'config': readConfig.bind(null, options),
    'posts': ['config', readPosts.bind(null, options)],
    'files': ['config', 'posts', 'outdir', processFiles.bind(null, options)],
    'rss': ['config', 'posts', 'outdir', createRssFeedFile.bind(null, options)]
  }, callback);
};

function rssDateFormat(date) {
  if (!date) {
    return '';
  }
  if (typeof(date) == 'string') {
    date = new Date(date);
  }
  return sf('{0:ddd, dd MMM yyyy HH:mm:ss +0000}', date);
}

function readConfig(options, callback) {
  return fs.exists(options.configFile, function(exists) {
    if (!exists) {
      normalizeOptions(options);
      return callback();
    }
    return fs.readFile(options.configFile, function(err, data) {
      if (err) {
        return callback(err);
      }
      try {
        data = JSON.parse(data.toString());
      } catch (ex) {
        return callback(new Error('Could not parse config file: ' + options.configFile + '\n' + ex.stack));
      }
      merge(data, options);
      normalizeOptions(options);
      return callback();
    });
  });
}

function normalizeOptions(options) {
  if (options.siteHref) {
    if (options.siteHref.lastIndexOf('/') == options.siteHref.length - 1) {
      options.siteHref = options.siteHref.substr(0, options.siteHref.length - 1);
    }
  }
}

function createRssFeedFile(options, callback) {
  var rssFileName = path.resolve(options.outdir, 'rss.xml');
  console.log('creating rss feed: ' + path.relative(options.outdir, rssFileName));
  return fs.readFile(options.rssTemplateFile, function(err, data) {
    if (err) {
      return callback(err);
    }
    data = data.toString();
    var content = ejs.render(data, options);
    return fs.writeFile(rssFileName, content, callback);
  });
}

function readPosts(options, callback) {
  return glob('*/index.ejs', { cwd: options.postsDir }, function(err, files) {
    if (err) {
      return callback(err);
    }
    return async.forEach(files, processPostFile.bind(null, options), function(err) {
      if (err) {
        return callback(err);
      }
      options.posts = options.posts.sort(function(a, b) {
        return a.mtime == b.mtime ? 0 : (a.mtime > b.mtime ? 1 : -1);
      });
      return callback();
    });
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
    var fname = path.basename(fullFileName);
    if (fname[0] == '_') {
      return callback();
    } else if (ext == '.less') {
      return processLessFile(options, fileName, callback);
    } else if (ext == '.ejs') {
      return processTemplateFile(options, fileName, callback);
    } else {
      return copyFileToOutput(options, fileName, callback);
    }
  });
}

function processLessFile(options, fileName, callback) {
  var sourceFullFileName = path.resolve(options.indir, fileName);
  var destFullFileName = path.resolve(options.outdir, fileName.substr(0, fileName.length - '.less'.length) + '.css');
  var sourceDir = path.dirname(sourceFullFileName);

  console.log('processing (less): ' + path.relative(options.indir, sourceFullFileName));
  var lessParser = new less.Parser({
    paths: [sourceDir]
  });
  return fs.readFile(sourceFullFileName, function(err, data) {
    if (err) {
      return callback(err);
    }
    data = data.toString();
    return lessParser.parse(data, function(err, tree) {
      if (err) {
        return callback(err);
      }
      return fs.writeFile(destFullFileName, tree.toCSS(), callback);
    });
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
      var renderOpts = {};
      merge(options, renderOpts);
      merge(template, renderOpts);
      var renderedData = ejs.render(layout, renderOpts);
      return mkdirp(path.dirname(destFullFileName), function(err) {
        if (err) {
          return callback(err);
        }
        return fs.writeFile(destFullFileName, renderedData, callback);
      });
    });
  });
}

function merge(src, dest) {
  Object.keys(src).forEach(function(key) {
    dest[key] = src[key];
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
  return fs.stat(fileName, function(err, stats) {
    if (err) {
      return callback(err);
    }
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
      data.href = '/' + path.join(path.dirname(path.relative(options.indir, fileName)), "index.html");
      data.stats = stats;
      data.mtime = new Date(data.mtime || data.stats.mtime);
      return callback(null, data);
    });
  });
}

function parseTemplateFileContents(data) {
  var sepIndex = data.indexOf(templateFileSeperator);
  var templateData = {};
  if (sepIndex >= 0) {
    templateData = data.substr(0, sepIndex);
    templateData = JSON.parse(templateData);
  }
  var body = data.substr(sepIndex + templateFileSeperator.length);
  if (body[0] == '\n') {
    body = body.substr(1);
  }
  templateData.body = body;
  if (!templateData.summary) {
    templateData.summary = templateData.body;
  }
  return templateData;
}
