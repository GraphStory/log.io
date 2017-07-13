// TODO: This file was created by bulk-decaffeinate.
// Sanity-check the conversion and remove this comment.
/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const {spawn, exec} = require('child_process');
const fs = require('fs');

const ENV = '/usr/bin/env';
const BROWSERIFY = `${ ENV } browserify`;
const COFFEE = `${ ENV } coffee`;
const MOCHA = `${ ENV } mocha`;
const LESS = `${ ENV } lessc`;
const NODE = `${ ENV } node`;

const TEMPLATE_SRC = `${ __dirname }/templates`;
const TEMPLATE_OUTPUT = `${ __dirname }/src/templates.coffee`;

task('build', "Builds Log.io package", function() {
  invoke('templates');
  invoke('compile');
  invoke('less');
  invoke('browserify');
  // Ensure browserify has completed
  return setTimeout((() => invoke('func_test')), 2000);
});

task('compile', "Compiles CoffeeScript src/*.coffee to lib/*.js", function() {
  console.log("Compiling src/*.coffee to lib/*.js");
  return exec(`${COFFEE} --compile --output ${__dirname}/lib/ ${__dirname}/src/`, function(err, stdout, stderr) {
    if (err) { throw err; }
    if (stdout + stderr) { return console.log(stdout + stderr); }
  });
});

task('browserify', "Compiles client.coffee to browser-friendly JS", function() {
  console.log("Browserifying src/client.coffee to lib/log.io.js");
  return exec(`${BROWSERIFY} src/client.coffee --exports process,require -o ${ __dirname }/lib/log.io.js`, function(err, stdout, stderr) {
    if (err) { return console.log(stdout + stderr); }
  });
});

task('less', "Compiles less templates to CSS", function() {
  console.log("Compiling src/less/* to lib/log.io.css");
  return exec(`${LESS} ${__dirname}/src/less/log.io.less -compress -o ${__dirname}/lib/log.io.css`, function(err, stdout, stderr) {
    if (err) { throw err; }
    if (stdout + stderr) { return console.log(stdout + stderr); }
  });
});

task('templates', "Compiles templates/*.html to src/templates.coffee", function() {
  console.log("Generating src/templates.coffee from templates/*.html");
  return buildTemplate();
});

task('ensure:configuration', "Ensures that config files exist in ~/.log.io/", function() {
  console.log("Creating ~/.log.io/ for configuration files.");
  console.log("If this fails, run npm using a specific user: npm install -g log.io --user 'ubuntu'");
  const homedir = process.env[process.platform === 'win32' ? 'USERPROFILE' : 'HOME'];
  const ldir = homedir + '/.log.io/';
  if (!fs.existsSync(ldir)) { fs.mkdirSync(ldir); }
  return (() => {
    const result = [];
    for (let c of ['harvester', 'log_server', 'web_server']) {
      const path = ldir + `${c}.conf`;
      if (!fs.existsSync(path)) { result.push(copyFile(`./conf/${c}.conf`, path)); } else {
        result.push(undefined);
      }
    }
    return result;
  })();
});

task('func_test', "Compiles & runs functional tests in test/", function() {
  console.log("Compiling test/*.coffee to test/lib/*.js...");
  return exec(`${COFFEE} --compile --output ${__dirname}/test/lib/ ${__dirname}/test/`, function(err, stdout, stderr) {
    if (err) { throw err; }
    if (stdout + stderr) { console.log(stdout + stderr); }
    console.log("Running tests...");
    return exec(`${MOCHA} --reporter spec test/lib/functional.js`, function(err, stdout, stderr) {
      if (err) { throw err; }
      if (stdout + stderr) { return console.log(stdout + stderr); }
    });
  });
});

var copyFile = (from, to) => fs.createReadStream(from).pipe(fs.createWriteStream(to));

const exportify = function(f) {
  let content;
  const templateName = f.replace('.html', '');
  const templateExportName = templateName.replace('-', '.');
  const templateFilePath = `${ TEMPLATE_SRC }/${ f }`;
  const body = fs.readFileSync(templateFilePath, 'utf-8');
  return content = `exports.${ templateExportName } = \"\"\"${ body }\"\"\"`;
};

var buildTemplate = function() {
  const files = fs.readdirSync(TEMPLATE_SRC);
  const templateBlocks = (Array.from(files).map((f) => exportify(f)));
  let content = '# TEMPLATES.COFFEE IS AUTO-GENERATED. CHANGES WILL BE LOST!\n';
  content += templateBlocks.join('\n\n');
  return fs.writeFileSync(TEMPLATE_OUTPUT, content, 'utf-8');
};
