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
const { execFileSync } = require('child_process');
const path = require('path');

const [modulo, arquivoDeSessoes, ...pedidos] = process.argv.slice(2);
const { chromium } = require(modulo);
const { abrirNavegador } = require('./navegador');

// O navegador resolve este nome para a instalação local. Assim o endereço que
// aparece na tela e no certificado é o de uma demonstração, sem porta.
const HOST = 'demonstracao.hikari.test';
const ALVO = process.env.HIKARI_DEMO_ALVO || '127.0.0.1:8012';
const BASE = `http://${HOST}`;
const PASTA = path.join(__dirname, 'saida');
const DURACOES = JSON.parse(fs.readFileSync(path.join(PASTA, 'narracao', 'duracoes.json'), 'utf8'));
const SESSOES = Object.fromEntries(fs.readFileSync(arquivoDeSessoes, 'utf8').trim().split('\n')
  .map((linha) => linha.split(/=(.*)/s).slice(0, 2)));
// A página é desenhada em 1280×720 com densidade 1,5: a interface aparece a
// 150% e a captura sai nítida em 1920×1080, legível no tamanho da página.
const LARGURA = 1280;
const ALTURA = 720;
const DENSIDADE = 1.5;
const VIDEO = { width: 1920, height: 1080 };
const FOLGA_MS = 900;
// O caso 1 do Aurora acontece entre 9 e 11 de março de 2026; o período justo
// deixa o histograma legível em vez de uma barra perdida em seis anos.
const PERIODO_DO_CASO = "time:(from:'2026-03-08T00:00:00.000Z',to:'2026-03-12T00:00:00.000Z')";
const DESAFIO_DO_CASO_1 = 1;
const DESAFIO_SEGUINTE = 2;
const DESAFIO_DO_CASO_2 = 7;
const DESAFIO_DO_CASO_3 = 14;

function discover(kql, colunas) {
  const consulta = encodeURIComponent(kql).replace(/'/g, "!'");
  return `${BASE}/hikari/kibana/app/discover#/?_g=(${PERIODO_DO_CASO})` +
    `&_a=(columns:!(${colunas.join(',')}),query:(language:kuery,query:'${consulta}'))`;
}

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

// Rolagem distribuída pela fala: a tela se move enquanto a narração dura, em vez
// de rolar num instante e ficar parada.
async function rolarDurante(pagina, pixels, segundos) {
  const passos = Math.max(20, Math.round(segundos * 20));
  const pausa = (segundos * 1000) / passos;
  for (let passo = 0; passo < passos; passo += 1) {
    await pagina.mouse.wheel(0, pixels / passos);
    await pagina.waitForTimeout(pausa);
  }
}

async function esperarDiscover(pagina) {
  await pagina.locator('[data-test-subj="discoverQueryHits"]').waitFor({ timeout: 120000 });
  await pagina.waitForTimeout(1500);
}

// Percorre os atalhos e termina no de DNS, que a cena seguinte abre no Discover.
const ATALHOS_DA_CENA = [/Severidade alta ou crítica/, /Eventos negados/, /Eventos do WAF/, /Consultas de DNS/];

async function percorrerAtalhos(pagina, segundos) {
  const pausa = (segundos * 1000 * 0.8) / ATALHOS_DA_CENA.length;
  for (const nome of ATALHOS_DA_CENA) {
    await apontar(pagina, pagina.getByRole('link', { name: nome }).first());
    await pagina.waitForTimeout(pausa);
  }
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
      agir: (p, d) => rolarDurante(p, 700, d * 0.85) },
    desafio: { papel: 'competidor', preparar: (p) => abrirDesafio(p, DESAFIO_DO_CASO_1),
      agir: async (p) => {
        for (const paragrafo of await p.locator('#challenge-window .challenge-desc p, #challenge-window p').all()) {
          if (await paragrafo.isVisible()) { await apontar(p, paragrafo); await p.waitForTimeout(700); }
        }
        await apontar(p, p.getByRole('link', { name: /Abrir SIEM/i }).first());
      } },
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
  caso1: {
    desafio: { papel: 'competidor', preparar: (p) => abrirDesafio(p, DESAFIO_DO_CASO_1),
      agir: (p) => apontar(p, p.getByRole('link', { name: /Abrir SIEM/i }).first()) },
    isca: { papel: 'competidor',
      preparar: async (p) => { await p.goto(discover('event.dataset:"vpn" and event.outcome:"failure"', ['source.ip', 'user.name', 'event.outcome']), { waitUntil: 'domcontentloaded' }); await esperarDiscover(p); },
      agir: (p) => abrirValoresDoCampo(p, 'source.ip') },
    refinamento: { papel: 'competidor',
      preparar: async (p) => { await p.goto(discover('event.dataset:"vpn" and source.ip:"203.0.113.77"', ['source.ip', 'user.name', 'event.outcome']), { waitUntil: 'domcontentloaded' }); await esperarDiscover(p); },
      agir: (p) => abrirValoresDoCampo(p, 'user.name') },
    pivo: { papel: 'competidor',
      preparar: async (p) => { await p.goto(discover('event.dataset:"auth" and source.ip:"10.8.200.23"', ['source.ip', 'host.name', 'user.name', 'winlog.logon.type']), { waitUntil: 'domcontentloaded' }); await esperarDiscover(p); },
      agir: (p) => abrirValoresDoCampo(p, 'host.name') },
    persistencia: { papel: 'competidor',
      preparar: async (p) => { await p.goto(discover('event.dataset:"auth" and host.name:"SRV-FIN-02" and event.code:("4720" or "4732")', ['host.name', 'event.code', 'target.user.name']), { waitUntil: 'domcontentloaded' }); await esperarDiscover(p); },
      agir: (p) => abrirValoresDoCampo(p, 'target.user.name') },
  },
  caso2: {
    desafio: { papel: 'competidor', preparar: (p) => abrirDesafio(p, DESAFIO_DO_CASO_2),
      agir: (p) => apontar(p, p.getByRole('link', { name: /Abrir SIEM/i }).first()) },
    raridade: { papel: 'competidor',
      preparar: async (p) => { await p.goto(discover('event.dataset:"dns" and dns.question.name:"telemetria-aurora-cdn.net"', ['host.name', 'dns.question.name']), { waitUntil: 'domcontentloaded' }); await esperarDiscover(p); },
      agir: (p) => abrirValoresDoCampo(p, 'host.name') },
    processo: { papel: 'competidor',
      preparar: async (p) => { await p.goto(discover('event.dataset:"edr" and host.name:"WKS-ENG-117" and process.name:"OneDriveUpdater.exe"', ['host.name', 'process.executable', 'process.parent.name']), { waitUntil: 'domcontentloaded' }); await esperarDiscover(p); },
      agir: (p) => abrirValoresDoCampo(p, 'process.executable') },
    volume: { papel: 'competidor',
      preparar: async (p) => { await p.goto(discover('event.dataset:"firewall" and destination.ip:"198.51.100.61"', ['source.ip', 'destination.ip', 'source.bytes']), { waitUntil: 'domcontentloaded' }); await esperarDiscover(p); },
      agir: (p) => abrirValoresDoCampo(p, 'source.bytes') },
  },
  caso3: {
    desafio: { papel: 'competidor', preparar: (p) => abrirDesafio(p, DESAFIO_DO_CASO_3),
      agir: (p) => apontar(p, p.getByRole('link', { name: /Abrir SIEM/i }).first()) },
    enumeracao: { papel: 'competidor',
      preparar: async (p) => { await p.goto(discover('event.dataset:"auth" and event.code:"4799" and user.name:"adm.backup"', ['user.name', 'group.name', 'source.ip']), { waitUntil: 'domcontentloaded' }); await esperarDiscover(p); },
      agir: (p) => abrirValoresDoCampo(p, 'group.name') },
    movimento: { papel: 'competidor',
      preparar: async (p) => { await p.goto(discover('event.dataset:"auth" and user.name:"adm.backup" and winlog.logon.type:"3"', ['user.name', 'source.ip', 'host.name']), { waitUntil: 'domcontentloaded' }); await esperarDiscover(p); },
      agir: (p) => abrirValoresDoCampo(p, 'host.name') },
    impacto: { papel: 'competidor',
      preparar: async (p) => { await p.goto(discover('event.dataset:"fileserver" and event.action:"Arquivo renomeado" and file.extension:"aurora-lock"', ['host.name', 'process.name', 'file.extension']), { waitUntil: 'domcontentloaded' }); await esperarDiscover(p); },
      agir: (p) => abrirValoresDoCampo(p, 'host.name') },
  },
  siem: {
    painel: { papel: 'competidor', preparar: (p) => p.goto(`${BASE}/hikari/siem`, { waitUntil: 'networkidle' }),
      agir: (p, d) => rolarDurante(p, 1100, d * 0.85) },
    atalhos: { papel: 'competidor', preparar: async (p) => { await p.goto(`${BASE}/hikari/siem`, { waitUntil: 'networkidle' }); await p.locator('#siem-atalhos').scrollIntoViewIfNeeded(); },
      agir: (p, d) => percorrerAtalhos(p, d) },
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
      preparar: async (p) => { await p.goto(`${BASE}/hikari/kibana/app/dashboards#/view/hikari-siem?_g=(${PERIODO_DO_CASO})`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(18000); },
      agir: (p, d) => rolarDurante(p, 900, d * 0.85) },
  },
  placar: {
    podio: { papel: 'competidor', preparar: (p) => p.goto(`${BASE}/hikari/live`, { waitUntil: 'networkidle' }),
      agir: (p) => p.waitForTimeout(500) },
    evolucao: { papel: 'competidor', preparar: (p) => p.goto(`${BASE}/hikari/live`, { waitUntil: 'networkidle' }),
      agir: (p, d) => rolarDurante(p, 900, d * 0.85) },
    destaques: { papel: 'competidor', preparar: async (p) => { await p.goto(`${BASE}/hikari/live`, { waitUntil: 'networkidle' }); await rolar(p, 1500, 5); },
      agir: (p, d) => rolarDurante(p, 1400, d * 0.85) },
  },
  operacao: {
    biblioteca: { papel: 'admin', preparar: (p) => p.goto(`${BASE}/admin/hikari/challenge-library`, { waitUntil: 'networkidle' }),
      agir: (p, d) => rolarDurante(p, 600, d * 0.85) },
    execucao: { papel: 'admin', preparar: (p) => p.goto(`${BASE}/admin/hikari/competitions`, { waitUntil: 'networkidle' }),
      agir: (p, d) => rolarDurante(p, 500, d * 0.85) },
    controle: { papel: 'admin', preparar: async (p) => { await p.goto(`${BASE}/admin/hikari/competitions`, { waitUntil: 'networkidle' }); await p.getByRole('button', { name: /^Pausar$/ }).first().scrollIntoViewIfNeeded(); },
      agir: async (p) => {
        await apontar(p, p.getByRole('button', { name: /^Aplicar$/ }).first());
        await p.waitForTimeout(900);
        await apontar(p, p.getByRole('button', { name: /^Pausar$/ }).first());
        await p.waitForTimeout(900);
        await apontar(p, p.getByRole('button', { name: /^Encerrar$/ }).first());
      } },
    estatisticas: { papel: 'admin', preparar: (p) => p.goto(`${BASE}/admin/statistics`, { waitUntil: 'networkidle' }),
      agir: (p, d) => rolarDurante(p, 600, d * 0.85) },
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

// Captura os quadros pelo screencast do Chromium, na densidade real da página.
// A gravação de vídeo do Playwright usa pixels CSS e só registra quadros quando a
// tela muda: a cena saía em 1280×720 num quadro cinza e terminava antes da fala
// quando a tela ficava parada. Aqui cada quadro guarda o seu instante, e o último
// é mantido até o fim exato da cena.
class Captura {
  constructor(sessao, pasta) {
    this.sessao = sessao;
    this.pasta = pasta;
    this.quadros = [];
    this.inicio = 0;
    this.gravando = false;
    this.receber = this.receber.bind(this);
  }

  // Quadros que chegam depois do fim da gravação são descartados: a pasta já foi apagada.
  async receber({ data, sessionId }) {
    if (!this.gravando) return;
    const arquivo = path.join(this.pasta, `${String(this.quadros.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(arquivo, Buffer.from(data, 'base64'));
    this.quadros.push({ arquivo, instante: Date.now() });
    await this.sessao.send('Page.screencastFrameAck', { sessionId });
  }

  async comecar() {
    fs.rmSync(this.pasta, { recursive: true, force: true });
    fs.mkdirSync(this.pasta, { recursive: true });
    this.sessao.on('Page.screencastFrame', this.receber);
    this.gravando = true;
    this.inicio = Date.now();
    await this.sessao.send('Page.startScreencast', {
      format: 'jpeg', quality: 92, maxWidth: VIDEO.width, maxHeight: VIDEO.height, everyNthFrame: 1,
    });
  }

  async terminar(destino) {
    const fim = Date.now();
    this.gravando = false;
    this.sessao.off('Page.screencastFrame', this.receber);
    await this.sessao.send('Page.stopScreencast');
    const linhas = [];
    this.quadros.forEach((quadro, indice) => {
      const seguinte = indice + 1 < this.quadros.length ? this.quadros[indice + 1].instante : fim;
      linhas.push(`file '${quadro.arquivo}'`, `duration ${Math.max(0.001, (seguinte - quadro.instante) / 1000).toFixed(3)}`);
    });
    linhas.push(`file '${this.quadros[this.quadros.length - 1].arquivo}'`);
    const lista = path.join(this.pasta, 'lista.txt');
    fs.writeFileSync(lista, linhas.join('\n') + '\n');
    const inicioDoPrimeiro = (this.quadros[0].instante - this.inicio) / 1000;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lista,
      '-vf', `tpad=start_duration=${inicioDoPrimeiro.toFixed(3)}:start_mode=clone,fps=30,scale=${VIDEO.width}:${VIDEO.height}:flags=lanczos,format=yuv420p`,
      '-c:v', 'libvpx-vp9', '-crf', '18', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3', destino]);
    fs.rmSync(this.pasta, { recursive: true, force: true });
  }
}

async function gravarCena(navegador, video, cena, definicao) {
  const destino = path.join(PASTA, 'cenas', video);
  fs.mkdirSync(destino, { recursive: true });
  const contexto = await navegador.newContext({
    viewport: { width: LARGURA, height: ALTURA },
    deviceScaleFactor: DENSIDADE,
    colorScheme: 'dark',
  });
  await contexto.addCookies([{ name: 'session', value: SESSOES[definicao.papel], domain: HOST, path: '/' }]);
  const pagina = await contexto.newPage();
  // Desbloquear dica pede confirmação nativa; a demonstração confirma, como faria quem joga.
  pagina.on('dialog', (dialogo) => dialogo.accept());
  const captura = new Captura(await contexto.newCDPSession(pagina), path.join(destino, `${cena}-quadros`));
  await captura.comecar();
  await definicao.preparar(pagina);
  await pagina.mouse.move(LARGURA * 0.62, ALTURA * 0.45);
  const pronto = Date.now() - captura.inicio;
  const duracao = DURACOES[video][cena];
  await definicao.agir(pagina, duracao);
  const restante = duracao * 1000 + FOLGA_MS - (Date.now() - captura.inicio - pronto);
  if (restante > 0) await pagina.waitForTimeout(restante);
  const final = path.join(destino, `${cena}.webm`);
  await captura.terminar(final);
  await contexto.close();
  return { cena, arquivo: path.relative(PASTA, final), pronto_ms: pronto, fala_s: duracao };
}

async function main() {
  const navegador = await abrirNavegador(chromium, [`--host-resolver-rules=MAP ${HOST} ${ALVO}`]);
  const videos = pedidos.length ? pedidos : Object.keys(CENAS);
  const registro = fs.existsSync(path.join(PASTA, 'cenas.json')) ? JSON.parse(fs.readFileSync(path.join(PASTA, 'cenas.json'), 'utf8')) : {};
  for (const video of videos) {
    registro[video] = [];
    for (const [cena, definicao] of Object.entries(CENAS[video])) {
      const resultado = await gravarCena(navegador, video, cena, definicao);
      registro[video].push(resultado);
      fs.writeFileSync(path.join(PASTA, 'cenas.json'), JSON.stringify(registro, null, 2));
      console.log(`  ${video}/${cena}: pronto em ${(resultado.pronto_ms / 1000).toFixed(1)} s`);
    }
  }
  await navegador.close();
}

main();
