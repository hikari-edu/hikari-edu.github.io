#!/usr/bin/env node
/*
 * Records public Hikari demonstrations against an isolated stack.
 * It creates only synthetic accounts, teams, challenges, and events.
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const demo = process.argv[2];
const supportedDemos = new Set(["competidor", "siem", "operacao", "pesquisa"]);
if (!supportedDemos.has(demo)) {
  throw new Error("Usage: record_landing_demos.cjs <competidor|siem|operacao|pesquisa>");
}

const baseUrl = process.env.CTFD_URL || "http://localhost:8012";
const adminName = process.env.ADMIN_NAME || "admin";
const adminPassword = process.env.ADMIN_PASSWORD;
const outputDir = path.resolve(__dirname, "..", "output", "recordings");
const scenarioPath = process.env.HIKARI_DEMO_SCENARIO || path.join(outputDir, "scenario.json");
const stamp = Math.floor(Date.now() / 1000);
const pauseScale = Number(process.env.DEMO_PAUSE_SCALE || "1");
const videoWidth = Number(process.env.HIKARI_DEMO_WIDTH || "1920");
const videoHeight = Number(process.env.HIKARI_DEMO_HEIGHT || "1080");

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds * pauseScale));
}

async function registerAndCreateSoloTeam(page) {
  const player = `demonstracao${stamp}`;
  const password = `Demo-${stamp}`;
  const team = `Equipe individual ${stamp}`;

  await page.goto(`${baseUrl}/register`, { waitUntil: "domcontentloaded" });
  await pause(3_000);
  await page.getByPlaceholder("Nome de usuário").fill(player);
  await page.getByPlaceholder("E-mail").fill(`${player}@example.test`);
  await page.getByPlaceholder("Senha").fill(password);
  await page.getByRole("button", { name: /Criar conta/i }).click();
  await page.waitForURL(/\/team(?:\?.*)?$/, { timeout: 15_000 });
  await pause(3_000);

  await page.getByRole("link", { name: /Criar equipe/i }).click();
  await page.waitForURL(/\/teams\/new$/, { timeout: 15_000 });
  await page.locator('input[name="name"]').fill(team);
  await page.locator('button[type="submit"], input[type="submit"]').last().click();
  await page.waitForURL(/\/challenges(?:\?.*)?$/, { timeout: 15_000 });
  await pause(3_000);
  return { player, password, team };
}

async function recordCompetitor(page, scenario) {
  await registerAndCreateSoloTeam(page);
  await pause(4_000);
  await page.goto(`${baseUrl}/challenges`, { waitUntil: "domcontentloaded" });
  await pause(7_000);
  const challengeButton = page.locator(`.jchallenge-button[value="${scenario.challengeId}"]`);
  await challengeButton.waitFor({ timeout: 20_000 });
  await challengeButton.click();
  await page.locator("#challenge-input").waitFor({ timeout: 15_000 });
  await pause(7_000);

  const siemLink = page
    .getByLabel("Ações de investigação")
    .getByRole("link", { name: /Abrir SIEM/i });
  await siemLink.evaluate((link) => link.removeAttribute("target"));
  await siemLink.click();
  await page.waitForURL(/\/hikari\/siem/, { timeout: 15_000 });
  await pause(10_000);

  await page.goto(`${baseUrl}/challenges`, { waitUntil: "domcontentloaded" });
  await page.locator(`.jchallenge-button[value="${scenario.challengeId}"]`).click();
  await pause(2_000);
  await page.locator("#challenge-input").fill("hikari{tentativa_incorreta}");
  await page.locator("#challenge-submit").click();
  await page.locator(".alert-danger, .alert-warning").waitFor({ timeout: 15_000 });
  await pause(5_000);
  await page.locator("#challenge-input").fill(scenario.flag);
  await page.locator("#challenge-submit").click();
  await page.locator(".alert-success").waitFor({ timeout: 15_000 });
  await pause(6_000);
  await page.goto(`${baseUrl}/hikari/live`, { waitUntil: "domcontentloaded" });
  await pause(8_000);
}

async function recordSiem(page, player) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder(/Nome de usuário ou e-mail/i).fill(player.player);
  await page.getByPlaceholder("Senha").fill(player.password);
  await page.getByRole("button", { name: /Acessar HIKARI|Entrar/i }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 15_000 });
  await page.goto(`${baseUrl}/hikari/siem`, { waitUntil: "domcontentloaded" });
  await pause(12_000);
  const huntingShortcut = page.getByRole("link", { name: /Padrão flag no payload/i });
  await huntingShortcut.evaluate((link) => link.removeAttribute("target"));
  await huntingShortcut.click();
  await page.waitForLoadState("domcontentloaded");
  await pause(14_000);
  await page.goBack({ waitUntil: "domcontentloaded" });
  await pause(6_000);
  const dashboardLink = page.getByRole("link", { name: /Dashboard Kibana/i });
  await dashboardLink.evaluate((link) => link.removeAttribute("target"));
  await dashboardLink.click();
  await page.waitForLoadState("domcontentloaded");
  await pause(42_000);
}

async function loginAsAdmin(page) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder(/Nome de usuário ou e-mail/i).fill(adminName);
  await page.getByPlaceholder("Senha").fill(adminPassword);
  await page.getByRole("button", { name: /Acessar HIKARI|Entrar/i }).click();
  await page.waitForURL((url) => url.pathname !== "/login", { timeout: 15_000 });
}

async function recordOperation(page) {
  await loginAsAdmin(page);
  await page.goto(`${baseUrl}/admin/hikari/competitions`, { waitUntil: "domcontentloaded" });
  const runningControl = page.getByRole("button", { name: "Pausar" });
  if ((await runningControl.count()) === 0) {
    await page.locator('input[name="key"]').fill(`landing-${stamp}`);
    await page.locator('input[name="name"]').fill("Demonstração da operação");
    await page.locator('select[name="duration_minutes"]').selectOption("240");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.getByRole("button", { name: "Criar execução" }).click(),
    ]);
    await pause(6_000);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.getByRole("button", { name: "Iniciar agora" }).click(),
    ]);
  }
  await pause(10_000);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.getByRole("button", { name: "Ajustar prazo" }).click(),
  ]);
  await page.getByRole("button", { name: "Pausar" }).waitFor({ timeout: 15_000 });
  await pause(7_000);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.getByRole("button", { name: "Pausar" }).click(),
  ]);
  await page.getByRole("button", { name: "Retomar" }).waitFor({ timeout: 15_000 });
  await pause(7_000);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.getByRole("button", { name: "Retomar" }).click(),
  ]);
  await page.getByRole("button", { name: "Pausar" }).waitFor({ timeout: 15_000 });
  await pause(10_000);
}

async function recordResearch(page) {
  await loginAsAdmin(page);
  await page.goto(`${baseUrl}/hikari/live`, { waitUntil: "domcontentloaded" });
  await pause(10_000);
  await page.goto(`${baseUrl}/admin/hikari/research`, { waitUntil: "domcontentloaded" });
  await pause(18_000);
  await page.waitForTimeout(1_200);
  await page.locator('select[name="event_type"]').selectOption({ index: 1 });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Aplicar filtros/i }).click();
  await page.locator(".research-grid, .research-card").first().waitFor({ timeout: 15_000 });
  await pause(18_000);
  await page.waitForTimeout(2_000);
}

async function main() {
  if (!adminPassword) {
    throw new Error("Set ADMIN_PASSWORD before recording a demonstration.");
  }
  fs.mkdirSync(outputDir, { recursive: true });
  if (!fs.existsSync(scenarioPath)) {
    throw new Error(`Demo scenario not found: ${scenarioPath}`);
  }
  const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
  const browser = await chromium.launch({ headless: true });
  let preparedPlayer;
  if (demo === "siem") {
    const setupContext = await browser.newContext();
    const setupPage = await setupContext.newPage();
    preparedPlayer = await registerAndCreateSoloTeam(setupPage);
    await setupContext.close();
  }
  const context = await browser.newContext({
    viewport: { width: videoWidth, height: videoHeight },
    deviceScaleFactor: 1,
    recordVideo: { dir: outputDir, size: { width: videoWidth, height: videoHeight } },
  });
  const page = await context.newPage();
  if (demo === "competidor") await recordCompetitor(page, scenario);
  if (demo === "siem") await recordSiem(page, preparedPlayer);
  if (demo === "operacao") await recordOperation(page);
  if (demo === "pesquisa") await recordResearch(page, scenario);
  const videoPath = await page.video().path();
  await context.close();
  await browser.close();
  process.stdout.write(`${videoPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
