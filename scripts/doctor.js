#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const os = require('node:os');

function run(command, args) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    shell: false
  });
}

function runWithoutCapture(command, args) {
  return spawnSync(command, args, {
    stdio: 'ignore',
    shell: false
  });
}

function checkCommand(name, argsForVersion = ['--version']) {
  const result = run(name, argsForVersion);
  const ok = result.status === 0;
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();

  if (!ok && name === 'code') {
    const fallback = runWithoutCapture(name, argsForVersion);
    if (fallback.status === 0) {
      return {
        name,
        ok: true,
        version: 'available (version not capturable in current shell)'
      };
    }
  }

  return {
    name,
    ok,
    version: ok ? output.split(/\r?\n/)[0] : undefined,
    error: ok ? undefined : output || result.error?.message || 'not found'
  };
}

function printStatus(prefix, message) {
  console.log(`${prefix} ${message}`);
}

function main() {
  printStatus('🔎', 'VSKathara doctor - checking local environment');
  console.log(`• OS: ${os.platform()} (${os.release()})`);
  console.log(`• Node.js: ${process.version}`);

  const checks = [
    checkCommand('npm'),
    checkCommand('git'),
    checkCommand('code', ['--version']),
    checkCommand('kathara', ['--version'])
  ];

  const required = new Set(['npm', 'git']);
  let hasRequiredFailure = false;

  for (const check of checks) {
    if (check.ok) {
      printStatus('✅', `${check.name}: ${check.version}`);
    } else {
      const isRequired = required.has(check.name);
      if (isRequired) {
        hasRequiredFailure = true;
      }
      printStatus(isRequired ? '❌' : '⚠️', `${check.name}: ${check.error}`);
    }
  }

  console.log('');
  if (hasRequiredFailure) {
    printStatus('❌', 'Doctor failed: missing required tools for development.');
    process.exit(1);
  }

  printStatus('✅', 'Doctor passed for extension development.');
  if (!checks.find((item) => item.name === 'kathara')?.ok) {
    printStatus('ℹ️', 'Kathara is optional for editing/building the extension, but required to run Kathara lab commands.');
  }
}

main();