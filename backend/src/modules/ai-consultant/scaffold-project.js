const { scaffoldAiConsultantProject } = require('./projectScaffolder');

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--force') {
      options.force = true;
    } else if (arg.startsWith('--')) {
      const key = arg.replace(/^--/, '');
      options[key] = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

try {
  const result = scaffoldAiConsultantProject(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ success: true, result }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ success: false, error: error.message }, null, 2)}\n`);
  process.exitCode = 1;
}
