#!/usr/bin/env node
'use strict';

var optimist = require('optimist');
var sitegen = require('../lib/');

var argv = optimist
  .usage('Usage: sitegen.js [options]')
  .options('indir', {
    default: '.',
    describe: 'The input directory.'
  })
  .options('outdir', {
    default: '_build/',
    describe: 'The output directory.'
  })
  .alias('help', 'h')
  .alias('h', '?')
  .argv;

if (argv.help) {
  optimist.showHelp();
  process.exit(1);
}

process.on('uncaughtException', function(err) {
  console.error('uncaughtException', err.stack || err);
});

sitegen(argv, function(err) {
  if (err) {
    console.error(err.stack);
  }
});
