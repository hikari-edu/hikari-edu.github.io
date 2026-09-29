// Grava as cenas das demonstrações na instalação fictícia Aurora (ambiente.sh).
//
// Cada cena roda num contexto próprio e vira um vídeo próprio. A cena fica na
// tela o tempo da sua fala (saida/narracao/duracoes.json) mais uma pausa, e o
// instante em que a tela fica pronta é registrado para a montagem cortar o
// carregamento. A ordem importa: o erro vem antes do acerto, e a dica é do
// desafio que o acerto abre.
//
// Uso:  node gravar.js <playwright-core> <sessoes.txt> [video...]

const fs = require('fs');
const path = require('path');

const [modulo, arquivoDeSessoes, ...pedidos] = process.argv.slice(2);
const { chromium } = require(modulo);

const BASE = process.env.HIKARI_DEMO_URL || 'http://localhost:8012';
const PASTA = path.join(__dirname, 'saida');
const DURACOES = JSON.parse(fs.readFileSync(path.join(PASTA, 'narracao', 'duracoes.json'), 'utf8'));
const SESSOES = Object.fromEntries(fs.readFileSync(arquivoDeSessoes, 'utf8').trim().split('\n')
  .map((linha) => linha.split(/=(.*)/s).slice(0, 2)));
const LARGURA = 1920;
const ALTURA = 1080;
const FOLGA_MS = 900;
// O caso 1 do Aurora acontece entre 9 e 11 de março de 2026; o período justo
// deixa o histograma legível em vez de uma barra perdida em seis anos.
const PERIODO_DO_CASO = "time:(from:'2026-03-08T00:00:00.000Z',to:'2026-03-12T00:00:00.000Z')";
const DESAFIO_DO_CASO_1 = 1;
const DESAFIO_SEGUINTE = 2;

function discover(kql, colunas) {
  const consulta = encodeURIComponent(kql).replace(/'/g, "!'");
  return `${BASE}/hikari/kibana/app/discover#/?_g=(${PERIODO_DO_CASO})` +
    `&_a=(columns:!(${colunas.join(',')}),query:(language:kuery,query:'${consulta}'))`;
}

const CURSOR = `
  (() => {
    if (document.getElementById('cursor-da-demonstracao')) return;
    const ponto = document.createElement('div');
    ponto.id = 'cursor-da-demonstracao';
    ponto.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;' +
      'border-radius:50%;border:2px solid #fff;background:rgba(52,211,160,.55);pointer-events:none;' +
      'box-shadow:0 0 0 4px rgba(52,211,160,.18);transition:transform .12s ease;left:-40px;top:-40px';
    document.documentElement.appendChild(ponto);
    addEventListener('mousemove', (e) => { ponto.style.left = e.clientX + 'px'; ponto.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => { ponto.style.transform = 'scale(.7)'; }, true);
    addEventListener('mouseup', () => { ponto.style.transform = 'scale(1)'; }, true);
  })();`;

async function apontar(pagina, alvo) {
  const caixa = await alvo.boundingBox();
  await pagina.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2, { steps: 28 });
  await pagina.waitForTimeout(250);
}

async function clicar(pagina, alvo) {
  await apontar(pagina, alvo);
  await alvo.click();
}

async function rolar(pagina, pixels, passos = 30) {
  for (let passo = 0; passo < passos; passo += 1) {
    await pagina.mouse.wheel(0, pixels / passos);
    await pagina.waitForTimeout(40);
  }
}

async function esperarDiscover(pagina) {
  await pagina.locator('[data-test-subj="discoverQueryHits"]').waitFor({ timeout: 120000 });
  await pagina.waitForTimeout(1500);
}

async function abrirValoresDoCampo(pagina, campo) {
  const botao = pagina.locator(`[data-test-subj="field-${campo}-showDetails"]`).first();
  await botao.scrollIntoViewIfNeeded();
  await clicar(pagina, botao);
}

async function abrirDesafio(pagina, identificador) {
  await pagina.goto(`${BASE}/challenges`, { waitUntil: 'networkidle' });
  const cartao = pagina.locator(`.jchallenge-button[value="${identificador}"]`);
  await cartao.scrollIntoViewIfNeeded();
  await clicar(pagina, cartao);
  await pagina.locator('#challenge-input').waitFor();
  await pagina.waitForTimeout(600);
}

async function responder(pagina, resposta, aviso) {
  const campo = pagina.locator('#challenge-input');
  await clicar(pagina, campo);
  await campo.type(resposta, { delay: 70 });
  await clicar(pagina, pagina.locator('#challenge-submit'));
  await pagina.locator(aviso).first().waitFor({ timeout: 15000 });
}

// Cada cena prepara a tela (antes de "pronto") e depois age durante a fala.
const CENAS = {
  competidor: {
    abertura: { papel: 'competidor', preparar: (p) => p.goto(`${BASE}/challenges`, { waitUntil: 'networkidle' }),
      agir: (p) => rolar(p, 700, 60) },
    desafio: { papel: 'competidor', preparar: (p) => abrirDesafio(p, DESAFIO_DO_CASO_1),
      agir: async (p) => { await p.waitForTimeout(2500); await apontar(p, p.getByRole('link', { name: /Abrir SIEM/i }).first()); } },
    ingenua: { papel: 'competidor',
      preparar: async (p) => { await p.goto(discover('event.dataset:"vpn" and event.outcome:"failure"', ['source.ip', 'user.name', 'event.action']), { waitUntil: 'domcontentloaded' }); await esperarDiscover(p); },
      agir: (p) => abrirValoresDoCampo(p, 'source.ip') },
    erro: { papel: 'competidor', preparar: (p) => abrirDesafio(p, DESAFIO_DO_CASO_1),
      agir: (p) => responder(p, 'flag{10.20.5.14}', '.alert-danger') },
    refina: { papel: 'competidor',
      preparar: async (p) => { await p.goto(discover('event.dataset:"vpn" and source.ip:"203.0.113.77"', ['source.ip', 'user.name', 'event.outcome']), { waitUntil: 'domcontentloaded' }); await esperarDiscover(p); },
      agir: async (p, duracao) => {
        await abrirValoresDoCampo(p, 'user.name');
        await p.waitForTimeout(duracao * 450);
        await p.keyboard.press('Escape');
        await p.goto(discover('event.dataset:"vpn" and source.ip:"203.0.113.77" and event.outcome:"success"', ['source.ip', 'user.name', 'event.action']), { waitUntil: 'domcontentloaded' });
        await esperarDiscover(p);
      } },
    acerto: { papel: 'competidor', preparar: (p) => abrirDesafio(p, DESAFIO_DO_CASO_1),
      agir: (p) => responder(p, 'flag{203.0.113.77}', '.alert-success') },
    dica: { papel: 'competidor', preparar: (p) => abrirDesafio(p, DESAFIO_SEGUINTE),
      agir: async (p) => {
        const botao = p.getByText(/Desbloquear dica|Ver dica/).first();
        await clicar(p, botao);
        const confirmar = p.getByRole('button', { name: /Desbloquear|Confirmar|Sim/i }).last();
        if (await confirmar.isVisible().catch(() => false)) await clicar(p, confirmar);
      } },
  },
  siem: {
    painel: { papel: 'competidor', preparar: (p) => p.goto(`${BASE}/hikari/siem`, { waitUntil: 'networkidle' }),
      agir: (p) => rolar(p, 1100, 80) },
    atalhos: { papel: 'competidor', preparar: async (p) => { await p.goto(`${BASE}/hikari/siem`, { waitUntil: 'networkidle' }); await p.locator('#siem-atalhos').scrollIntoViewIfNeeded(); },
      agir: async (p) => { await clicar(p, p.getByRole('link', { name: /Consultas de DNS/ })); await esperarDiscover(p); } },
    kql: { papel: 'competidor',
      preparar: async (p) => { await p.goto(discover('event.dataset:"dns" and host.name:"WKS-ENG-117"', ['host.name', 'dns.question.name', 'event.action']), { waitUntil: 'domcontentloaded' }); await esperarDiscover(p); },
      agir: (p) => abrirValoresDoCampo(p, 'dns.question.name') },
    agregacao: { papel: 'competidor',
      preparar: async (p) => { await p.goto(discover('event.dataset:"dns" and dns.question.name:"telemetria-aurora-cdn.net"', ['host.name', 'dns.question.name']), { waitUntil: 'domcontentloaded' }); await esperarDiscover(p); },
      agir: (p) => abrirValoresDoCampo(p, 'host.name') },
    pivo: { papel: 'competidor',
      preparar: async (p) => { await p.goto(discover('event.dataset:"edr" and host.name:"WKS-ENG-117" and process.name:"OneDriveUpdater.exe"', ['host.name', 'process.executable', 'process.parent.name']), { waitUntil: 'domcontentloaded' }); await esperarDiscover(p); },
      agir: (p) => abrirValoresDoCampo(p, 'process.executable') },
    dashboard: { papel: 'competidor',
      preparar: async (p) => { await p.goto(`${BASE}/hikari/kibana/app/dashboards#/view/hikari-siem`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(18000); },
      agir: (p) => rolar(p, 900, 90) },
  },
  placar: {
    podio: { papel: 'competidor', preparar: (p) => p.goto(`${BASE}/hikari/live`, { waitUntil: 'networkidle' }),
      agir: (p) => p.waitForTimeout(500) },
    evolucao: { papel: 'competidor', preparar: (p) => p.goto(`${BASE}/hikari/live`, { waitUntil: 'networkidle' }),
      agir: (p) => rolar(p, 900, 70) },
    destaques: { papel: 'competidor', preparar: async (p) => { await p.goto(`${BASE}/hikari/live`, { waitUntil: 'networkidle' }); await rolar(p, 1500, 5); },
      agir: (p) => rolar(p, 1400, 80) },
  },
  operacao: {
    biblioteca: { papel: 'admin', preparar: (p) => p.goto(`${BASE}/admin/hikari/challenge-library`, { waitUntil: 'networkidle' }),
      agir: (p) => rolar(p, 600, 60) },
    execucao: { papel: 'admin', preparar: (p) => p.goto(`${BASE}/admin/hikari/competitions`, { waitUntil: 'networkidle' }),
      agir: (p) => rolar(p, 500, 50) },
    controle: { papel: 'admin', preparar: async (p) => { await p.goto(`${BASE}/admin/hikari/competitions`, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: /^Pausar$/ }).first().scrollIntoViewIfNeeded(); },
      agir: async (p) => {
        await apontar(p, p.getByRole('button', { name: /^Aplicar$/ }).first());
        await p.waitForTimeout(900);
        await apontar(p, p.getByRole('button', { name: /^Pausar$/ }).first());
        await p.waitForTimeout(900);
        await apontar(p, p.getByRole('button', { name: /^Encerrar$/ }).first());
      } },
    estatisticas: { papel: 'admin', preparar: (p) => p.goto(`${BASE}/admin/statistics`, { waitUntil: 'networkidle' }),
      agir: (p) => rolar(p, 600, 60) },
  },
  depois: {
    solucao: { papel: 'competidor', preparar: (p) => abrirDesafio(p, DESAFIO_DO_CASO_1),
      agir: async (p) => {
        // Numa segunda gravação a solução já foi aberta e aparece sem o botão.
        await p.locator('.jlesson-button, .jlesson-content').first().waitFor();
        if (await p.locator('.jlesson-button').isVisible()) await clicar(p, p.locator('.jlesson-button'));
        await p.locator('.jlesson-content').waitFor();
        await p.waitForTimeout(800);
        await rolar(p, 500, 50);
      } },
    questionario: { papel: 'competidor', preparar: (p) => p.goto(`${BASE}/hikari/feedback`, { waitUntil: 'networkidle' }),
      agir: async (p) => {
        for (const seletor of await p.locator('form.hikari-questionnaire-form select').all()) {
          const opcoes = await seletor.locator('option').count();
          if (opcoes < 2 || !(await seletor.isVisible())) continue;
          await seletor.scrollIntoViewIfNeeded();
          await apontar(p, seletor);
          await seletor.selectOption({ index: Math.min(3, opcoes - 1) });
          await p.waitForTimeout(120);
        }
        const enviar = p.locator('.hikari-questionnaire-submit [type="submit"]').last();
        await enviar.scrollIntoViewIfNeeded();
        await clicar(p, enviar);
        await p.waitForLoadState('networkidle');
      } },
    certificado: { papel: 'competidor', preparar: (p) => p.goto(`${BASE}/hikari/certificado`, { waitUntil: 'networkidle' }),
      agir: async (p) => {
        const nome = p.locator('#nome_completo');
        await clicar(p, nome);
        await nome.fill('');
        await nome.type('Ana Lima', { delay: 90 });
        await clicar(p, p.locator('form.certificado-formulario button[type="submit"]'));
        await p.waitForLoadState('networkidle');
      } },
    pesquisa: { papel: 'admin', preparar: (p) => p.goto(`${BASE}/admin/hikari/research`, { waitUntil: 'networkidle' }),
      agir: async (p) => { await apontar(p, p.getByText('Exportar atividades (JSONL)').first()); await p.waitForTimeout(1200); await rolar(p, 800, 70); } },
  },
};

async function gravarCena(navegador, video, cena, definicao) {
  const destino = path.join(PASTA, 'cenas', video);
  fs.mkdirSync(destino, { recursive: true });
  const contexto = await navegador.newContext({
    viewport: { width: LARGURA, height: ALTURA },
    recordVideo: { dir: destino, size: { width: LARGURA, height: ALTURA } },
    colorScheme: 'dark',
  });
  await contexto.addCookies([{ name: 'session', value: SESSOES[definicao.papel], domain: 'localhost', path: '/' }]);
  await contexto.addInitScript(CURSOR);
  const pagina = await contexto.newPage();
  // Desbloquear dica pede confirmação nativa; a demonstração confirma, como faria quem joga.
  pagina.on('dialog', (dialogo) => dialogo.accept());
  const inicio = Date.now();
  await definicao.preparar(pagina);
  await pagina.evaluate(CURSOR);
  await pagina.mouse.move(LARGURA * 0.62, ALTURA * 0.45);
  const pronto = Date.now() - inicio;
  const duracao = DURACOES[video][cena];
  await definicao.agir(pagina, duracao);
  const restante = duracao * 1000 + FOLGA_MS - (Date.now() - inicio - pronto);
  if (restante > 0) await pagina.waitForTimeout(restante);
  const arquivo = await pagina.video().path();
  await contexto.close();
  const final = path.join(destino, `${cena}.webm`);
  fs.renameSync(arquivo, final);
  return { cena, arquivo: path.relative(PASTA, final), pronto_ms: pronto, fala_s: duracao };
}

async function main() {
  const executavel = fs.readdirSync(`${process.env.HOME}/Library/Caches/ms-playwright`)
    .filter((pasta) => pasta.startsWith('chromium_headless_shell'))[0];
  const navegador = await chromium.launch({
    executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/${executavel}/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  });
  const videos = pedidos.length ? pedidos : Object.keys(CENAS);
  const registro = fs.existsSync(path.join(PASTA, 'cenas.json')) ? JSON.parse(fs.readFileSync(path.join(PASTA, 'cenas.json'), 'utf8')) : {};
  for (const video of videos) {
    registro[video] = [];
    for (const [cena, definicao] of Object.entries(CENAS[video])) {
      const resultado = await gravarCena(navegador, video, cena, definicao);
      registro[video].push(resultado);
      console.log(`  ${video}/${cena}: pronto em ${(resultado.pronto_ms / 1000).toFixed(1)} s`);
    }
  }
  fs.writeFileSync(path.join(PASTA, 'cenas.json'), JSON.stringify(registro, null, 2));
  await navegador.close();
}

main();
