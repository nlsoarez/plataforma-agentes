import { spawn } from 'node:child_process';

const service = process.env.RAILWAY_SERVICE_NAME;

const commands = {
  api: ['pnpm', ['--filter', '@plataforma/api', 'start']],
  web: ['pnpm', ['--filter', '@plataforma/web', 'start']],
  worker: ['pnpm', ['--filter', '@plataforma/worker', 'start']],
};

const command = commands[service ?? ''];

if (!command) {
  console.error(`Unknown Railway service: ${service ?? '<empty>'}`);
  console.error(`Expected one of: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}

async function run(cmd, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${cmd} encerrado por sinal ${signal}`));
        return;
      }
      if (code) {
        reject(new Error(`${cmd} saiu com codigo ${code}`));
        return;
      }
      resolve();
    });
  });
}

async function main() {
  if (service === 'api' && process.env.RUN_MIGRATIONS_ON_START !== 'false') {
    console.log('[startup] aplicando migrations antes da API');
    await run('pnpm', ['--filter', '@plataforma/db', 'migrate']);
  }

  const child = spawn(command[0], command[1], { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

main().catch((err) => {
  console.error('[startup] falhou', err?.message || err);
  process.exit(1);
});
