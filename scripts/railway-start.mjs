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

const child = spawn(command[0], command[1], { stdio: 'inherit', shell: process.platform === 'win32' });

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
