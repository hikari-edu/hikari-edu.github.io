// Captura as telas da plataforma exibidas na seção "A plataforma" da página.
//
// Roda sobre a instalação fictícia Aurora (ambiente.sh) com a prova em andamento.
//
// Uso:  node capturas.js <playwright-core> <sessoes.txt>

const fs = require('fs');
const path = require('path');

const [modulo, arquivoDeSessoes] = process.argv.slice(2);
const { chromium } = require(modulo);
const { abrirNavegador } = require('./navegador');

const HOST = 'demonstracao.hikari.test';
const ALVO = process.env.HIKARI_DEMO_ALVO || '127.0.0.1:8012';
const BASE = `http://${HOST}`;
const DESTINO = path.join(__dirname, '..', 'img', 'produto');
const SESSOES = Object.fromEntries(fs.readFileSync(arquivoDeSessoes, 'utf8').trim().split('\n')
  .map((linha) => linha.split(/=(.*)/s).slice(0, 2)));
// 1280×800 com densidade 2: a tela sai em 2560×1600, nítida em monitores densos.
const LARGURA = 1280;
const ALTURA = 800;
const DENSIDADE = 2;
const ESPERA_DO_PAINEL_MS = 18000;
const QUALIDADE = 86;
// Os eventos da Aurora cabem em três dias; o painel mostra esse período.
const PERIODO_DO_CASO = "time:(from:'2026-03-08T00:00:00.000Z',to:'2026-03-12T00:00:00.000Z')";

async function abrirPrimeiroDesafio(pagina) {
  await pagina.locator('.jchallenge-button[value="1"]').click();
  await pagina.locator('#challenge-input').waitFor();
}

async function irAoControle(pagina) {
  await pagina.getByRole('heading', { name: 'Controle' }).evaluate((titulo) => titulo.scrollIntoView({ block: 'start' }));
  await pagina.mouse.wheel(0, -130);
}

const TELAS = {
  desafios: { papel: 'competidor', endereco: '/challenges', preparar: abrirPrimeiroDesafio },
  siem: { papel: 'competidor', endereco: `/hikari/kibana/app/dashboards#/view/hikari-siem?_g=(${PERIODO_DO_CASO})`, espera: ESPERA_DO_PAINEL_MS },
  placar: { papel: 'competidor', endereco: '/hikari/live' },
  operacao: { papel: 'admin', endereco: '/admin/hikari/competitions', preparar: irAoControle },
};

async function capturar(navegador, nome, tela) {
  const contexto = await navegador.newContext({
    viewport: { width: LARGURA, height: ALTURA },
    deviceScaleFactor: DENSIDADE,
    colorScheme: 'dark',
  });
  await contexto.addCookies([{ name: 'session', value: SESSOES[tela.papel], domain: HOST, path: '/' }]);
  const pagina = await contexto.newPage();
  await pagina.goto(`${BASE}${tela.endereco}`, { waitUntil: tela.espera ? 'domcontentloaded' : 'networkidle' });
  if (tela.preparar) await tela.preparar(pagina);
  await pagina.waitForTimeout(tela.espera || 1500);
  const imagem = path.join(DESTINO, `${nome}.jpg`);
  await pagina.screenshot({ path: imagem, type: 'jpeg', quality: QUALIDADE });
  await contexto.close();
  console.log(`  ${nome}: ${tela.endereco} → ${path.relative(process.cwd(), imagem)}`);
}

async function main() {
  fs.mkdirSync(DESTINO, { recursive: true });
  const navegador = await abrirNavegador(chromium, [`--host-resolver-rules=MAP ${HOST} ${ALVO}`]);
  for (const [nome, tela] of Object.entries(TELAS)) {
    await capturar(navegador, nome, tela);
  }
  await navegador.close();
}

main();
