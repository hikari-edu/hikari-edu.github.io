// Renderiza os cartões de abertura e de fechamento de cada vídeo em 1920×1080.
//
// Uso:  node cartoes.js <playwright-core>

const fs = require('fs');
const path = require('path');
const { chromium } = require(process.argv[2]);
const { abrirNavegador } = require('./navegador');

const PASTA = path.join(__dirname, 'saida', 'cartoes');
const MODELO = `file://${path.join(__dirname, 'cartao.html')}`;
const ROTEIRO = JSON.parse(fs.readFileSync(path.join(__dirname, 'roteiro.json'), 'utf8'));
const FECHAMENTO = {
  rotulo: 'Hikari · threat hunting gamificado',
  titulo: 'Desafios reais, ameaças ocultas.',
  linha: 'Conheça a plataforma em <strong>hikari-edu.github.io</strong>',
};

async function renderizar(pagina, textos, destino) {
  await pagina.goto(`${MODELO}?${new URLSearchParams(textos)}`, { waitUntil: 'load' });
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.screenshot({ path: destino });
}

async function main() {
  fs.mkdirSync(PASTA, { recursive: true });
  const navegador = await abrirNavegador(chromium, ['--allow-file-access-from-files']);
  const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 } });
  for (const [posicao, video] of ROTEIRO.videos.entries()) {
    await renderizar(pagina, {
      rotulo: `Demonstração ${posicao + 1} de ${ROTEIRO.videos.length}`,
      titulo: video.titulo,
      linha: 'Plataforma real · prova fictícia <strong>Aurora Telecom</strong>',
    }, path.join(PASTA, `${video.chave}-abertura.png`));
  }
  await renderizar(pagina, FECHAMENTO, path.join(PASTA, 'fechamento.png'));
  await navegador.close();
  console.log(`  ${ROTEIRO.videos.length + 1} cartões em ${PASTA}`);
}

main();
