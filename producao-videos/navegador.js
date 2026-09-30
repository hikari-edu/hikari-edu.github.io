// Abre o Chromium sem interface instalado pelo Playwright, comum a todos os scripts de produção.

const fs = require('fs');
const path = require('path');

const CACHE = path.join(process.env.HOME, 'Library', 'Caches', 'ms-playwright');

function executavel() {
  const pasta = fs.readdirSync(CACHE).find((nome) => nome.startsWith('chromium_headless_shell'));
  return path.join(CACHE, pasta, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
}

function abrirNavegador(chromium, args) {
  return chromium.launch({ executablePath: executavel(), args });
}

module.exports = { abrirNavegador };
