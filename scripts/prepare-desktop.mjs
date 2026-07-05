#!/usr/bin/env node
// Stages everything the desktop bundle needs:
//   1. client build      -> src-tauri/resources/client
//   2. server build      -> src-tauri/resources/server (self-contained,
//      native modules installed for the CURRENT platform)
//   3. Node.js runtime   -> src-tauri/binaries/node-<target-triple>
// Run by `tauri build` (beforeBuildCommand). Idempotent.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const NODE_VERSION = '22.14.0';
const root = path.resolve(import.meta.dirname, '..');
const resources = path.join(root, 'src-tauri', 'resources');
const binaries = path.join(root, 'src-tauri', 'binaries');

const sh = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: 'inherit' });

// ── 1+2. Build client and server ─────────────────────────────────────────────
sh('npm run build');

fs.rmSync(resources, { recursive: true, force: true });
fs.mkdirSync(resources, { recursive: true });

fs.cpSync(path.join(root, 'client', 'dist'), path.join(resources, 'client'), { recursive: true });

const serverStage = path.join(resources, 'server');
fs.mkdirSync(serverStage, { recursive: true });
fs.cpSync(path.join(root, 'server', 'dist'), path.join(serverStage, 'dist'), { recursive: true });
fs.copyFileSync(path.join(root, 'server', 'package.json'), path.join(serverStage, 'package.json'));

// Standalone install: no workspace hoisting, native modules (argon2,
// better-sqlite3) built for the platform we are bundling on.
sh('npm install --omit=dev --no-audit --no-fund --loglevel=error', serverStage);

// ── 3. Node.js sidecar runtime ───────────────────────────────────────────────
const triples = {
  'darwin-arm64': 'aarch64-apple-darwin',
  'darwin-x64': 'x86_64-apple-darwin',
  'linux-x64': 'x86_64-unknown-linux-gnu',
  'linux-arm64': 'aarch64-unknown-linux-gnu',
  'win32-x64': 'x86_64-pc-windows-msvc',
};
const key = `${process.platform}-${process.arch}`;
const triple = triples[key];
if (!triple) throw new Error(`Unsupported platform: ${key}`);

const isWin = process.platform === 'win32';
const sidecar = path.join(binaries, `node-${triple}${isWin ? '.exe' : ''}`);

if (!fs.existsSync(sidecar)) {
  fs.mkdirSync(binaries, { recursive: true });
  const dist = `node-v${NODE_VERSION}-${isWin ? 'win' : process.platform}-${process.arch}`;
  const ext = isWin ? 'zip' : 'tar.gz';
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${dist}.${ext}`;
  const archive = path.join(binaries, `${dist}.${ext}`);

  console.log(`Downloading Node.js runtime: ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Node download failed: HTTP ${res.status}`);
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));

  // tar handles both .tar.gz and .zip on every GitHub runner and Win10+.
  sh(`tar -xf "${archive}"`, binaries);
  const bin = isWin
    ? path.join(binaries, dist, 'node.exe')
    : path.join(binaries, dist, 'bin', 'node');
  fs.copyFileSync(bin, sidecar);
  if (!isWin) fs.chmodSync(sidecar, 0o755);

  fs.rmSync(archive, { force: true });
  fs.rmSync(path.join(binaries, dist), { recursive: true, force: true });
}

console.log('Desktop staging complete.');
