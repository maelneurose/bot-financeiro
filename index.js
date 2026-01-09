const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");

const qrcode = require("qrcode-terminal");
const { createClient } = require("@supabase/supabase-js");
const schedule = require("node-schedule");
const pino = require("pino");

// === CONFIGURAÇÃO ===
const SUPABASE_URL = "https://gukvjlhgvgoaqbgiuveq.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";
const LINK_DO_SITE = "https://ultima-chance-app.vercel.app";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// === LÓGICA DO BOT (igual a sua) ===
function escolherEmoji(texto, tipo) { if (tipo === "income") return "🤑"; if (texto.includes("cerveja") || texto.includes("chopp")) return "🍺"; return "💸"; }
function calcularTempoDeVida(valor, salario, horasMensais) { if (!salario || !horasMensais) return null; const valorPorHora = salario / horasMensais; const horasGastas = valor / valorPorHora; return horasGastas < 1 ? `${Math.round(horasGastas * 60)} min` : `${horasGastas.toFixed(1)} hrs`; }

async function verificarLimite(sock, jid, profile) {
  if (profile.is_pro) return true;
  const { count: qtdGastos } = await supabase.from("transactions").select("*", { count: "exact", head: true }).eq("user_id", profile.id);
  const { count: qtdDividas } = await supabase.from("debts").select("*", { count: "exact", head: true }).eq("user_id", profile.id);
  if ((qtdGastos || 0) + (qtdDividas || 0) >= 5) {
    await sock.sendMessage(jid, { text: `🔒 *LIMITE ATINGIDO!*\n🚀 Assine: ${LINK_DO_SITE}` });
    return false;
  }
  return true;
}

async function agendarLembrete(sock, jid, texto, profile) {
  const matchDia = texto.match(/dia\s+(\d+)/);
  if (!matchDia) return sock.sendMessage(jid, { text: '⚠️ Ex: "Lembre de pagar a luz dia 25"' });

  const dia = parseInt(matchDia[1]);
  const mensagem = texto
    .replace("lembre", "")
    .replace("me lembre", "")
    .replace(/dia\s+\d+/, "")
    .trim();

  let data = new Date();
  data.setDate(dia);
  data.setHours(9, 0, 0, 0);
  if (data < new Date()) data.setMonth(data.getMonth() + 1);

  await supabase.from("reminders").insert({
    user_id: profile.id,
    message: mensagem,
    remind_at: data.toISOString(),
    status: "pending",
  });

  schedule.scheduleJob(data, function () {
    const destino = profile.phone.includes("@") ? profile.phone : `${profile.phone}@s.whatsapp.net`;
    sock.sendMessage(destino, { text: `⏰ *LEMBRETE!* \n📌 ${mensagem}` });
  });

  await sock.sendMessage(jid, { text: `✅ *Agendado!* Dia ${dia} às 09:00.` });
}

async function verResumo(sock, jid, profile) {
  const dias = new Date();
  dias.setDate(new Date().getDate() - 7);

  const { data: trans } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", profile.id)
    .eq("type", "expense")
    .gte("date", dias.toISOString());

  if (!trans || !trans.length) return sock.sendMessage(jid, { text: "🤷‍♂️ Nada nos últimos 7 dias." });

  let total = 0,
    txt = `📊 *Resumo (7 Dias)*\n`;
  trans.forEach((t) => {
    total += t.amount;
    txt += `💸 ${t.description.substring(0, 15)}.. R$ ${t.amount}\n`;
  });

  await sock.sendMessage(jid, { text: txt + `🚨 *Total:* R$ ${total.toFixed(2)}` });
}

async function processarTransacao(sock, jid, texto, profile) {
  if (!(await verificarLimite(sock, jid, profile))) return;

  let tipo = texto.match(/^(recebi|ganhei|caiu|salario)/) ? "income" : "expense";
  const itens = texto.split(/\s+e\s+|,\s+/);

  let txt = `📝 *Relatório*\n`,
    total = 0,
    achou = false;

  for (let item of itens) {
    const match = item.match(/(\d+[.,]?\d*)/);
    if (match) {
      let valor = parseFloat(match[0].replace(",", "."));
      let desc =
        item
          .replace(match[0], "")
          .replace(/(gastei|comprei|paguei|recebi|no|na|em|de)\s+/g, "")
          .trim() || (tipo === "income" ? "Entrada" : "Geral");

      desc = desc.charAt(0).toUpperCase() + desc.slice(1);

      await supabase.from("transactions").insert({
        user_id: profile.id,
        amount: valor,
        type: tipo,
        description: desc,
        date: new Date().toISOString(),
      });

      total += valor;
      achou = true;
      txt += `${escolherEmoji(desc.toLowerCase(), tipo)} *${desc}:* R$ ${valor.toFixed(2)}\n`;
    }
  }

  if (!achou) return sock.sendMessage(jid, { text: '🤖 Ex: "Gastei 10 pizza"' });
  if (tipo === "expense" && profile.salary) txt += `⏳ Custo Vida: ${calcularTempoDeVida(total, profile.salary, profile.work_hours)}`;

  await sock.sendMessage(jid, { text: txt });
}

async function processarDivida(sock, jid, texto, profile) {
  if (!(await verificarLimite(sock, jid, profile))) return;

  if (texto.startsWith("devo")) {
    const valorMatch = texto.match(/(\d+[.,]?\d*)/);
    if (!valorMatch) return;
    const valor = parseFloat(valorMatch[0].replace(",", "."));
    const quem = texto.replace(/devo|\d+|para|pro|pra/g, "").trim();

    await supabase.from("debts").insert({
      user_id: profile.id,
      amount: valor,
      description: quem,
      type: "owe",
      status: "pending",
    });

    await sock.sendMessage(jid, { text: `📉 Devo ${valor} para ${quem}.` });
  } else if (texto.includes("me deve")) {
    const valorMatch = texto.match(/(\d+[.,]?\d*)/);
    if (!valorMatch) return;
    const valor = parseFloat(valorMatch[0].replace(",", "."));
    const quem = texto.split("me deve")[0].trim();

    await supabase.from("debts").insert({
      user_id: profile.id,
      amount: valor,
      description: quem,
      type: "receive",
      status: "pending",
    });

    await sock.sendMessage(jid, { text: `📈 ${quem} te deve ${valor}.` });
  }
}

// === CONEXÃO BAILEYS (corrigida p/ QR confiável e estável) ===
let reconnectAttempts = 0;

async function connectToWhatsApp() {
  const logger = pino({ level: "info" });

  // NÃO troque a pasta toda hora — isso invalida sessão e te obriga a parear sempre
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth");

  console.log("🔄 Buscando versão mais recente do WhatsApp Web...");
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`✅ Usando versão: ${version.join(".")} (isLatest=${isLatest})`);

  const sock = makeWASocket({
    version,
    logger,
    // isso ajuda a "parecer" um navegador real
    browser: ["Chrome (Linux)", "Chrome", "120.0.0"],

    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
    },

    // QR
    printQRInTerminal: true, // <- importante: não dependa do link!
    markOnlineOnConnect: false,
    syncFullHistory: false,

    // estabilidade
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      reconnectAttempts = 0;

      console.log("\n=============================================================");
      console.log("✅ QR CODE GERADO — ESCANEIE PELO CELULAR (Aparelhos conectados)");
      // sem small=true para não distorcer
      qrcode.generate(qr, { small: false });

      // link mais legível e com ECC alto (e maior)
      const qrLink =
        "https://api.qrserver.com/v1/create-qr-code/" +
        `?size=600x600&ecc=H&data=${encodeURIComponent(qr)}`;

      console.log("\n📌 Se precisar abrir no navegador, use IMEDIATAMENTE este link:");
      console.log(qrLink);
      console.log("=============================================================\n");
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.output?.payload?.message || lastDisconnect?.error?.message;

      console.log(`🚨 Conexão fechada. statusCode=${statusCode} reason=${reason}`);

      const loggedOut = statusCode === DisconnectReason.loggedOut;

      if (loggedOut) {
        console.log("❌ Logged out. Apague a pasta 'baileys_auth' e pareie novamente.");
        return;
      }

      // backoff pra não entrar em loop agressivo
      reconnectAttempts += 1;
      const waitMs = Math.min(30_000, 2_000 * reconnectAttempts);
      console.log(`⏳ Reconnect em ${waitMs / 1000}s (tentativa ${reconnectAttempts})...`);
      setTimeout(connectToWhatsApp, waitMs);
    }

    if (connection === "open") {
      reconnectAttempts = 0;
      console.log("✅ CONECTADO COM SUCESSO! 🚀");
    }
  });

  // === MENSAGENS (igual o seu) ===
  sock.ev.on("messages.upsert", async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg.message || msg.key.remoteJid === "status@broadcast") return;

      const texto = (msg.message.conversation || msg.message.extendedTextMessage?.text || "")
        .toLowerCase()
        .trim();
      if (!texto) return;

      if (msg.key.fromMe && (texto.startsWith("📝") || texto.startsWith("🤖"))) return;

      const jid = msg.key.remoteJid;
      const phone = jid.split("@")[0].split(":")[0];

      const { data: profile } = await supabase.from("profiles").select("*").eq("phone", phone).single();

      if (!profile && !["ajuda", "oi"].includes(texto)) {
        if (!msg.key.fromMe) await sock.sendMessage(jid, { text: "❌ Cadastre-se no site!" });
        return;
      }

      if (["ajuda", "menu", "oi"].includes(texto))
        await sock.sendMessage(jid, { text: `🤖 *Bot Online*\n• Gastei 10\n• Devo 50` });

      if (texto.includes("lembre")) return await agendarLembrete(sock, jid, texto, profile);
      if (texto.includes("resumo") || texto.includes("gastei")) return await verResumo(sock, jid, profile);
      if (texto.startsWith("devo") || texto.includes("me deve")) return await processarDivida(sock, jid, texto, profile);

      if (texto === "ver dividas") {
        const { data: d } = await supabase
          .from("debts")
          .select("*")
          .eq("user_id", profile.id)
          .eq("status", "pending");

        const resp =
          d && d.length
            ? d
                .map((x) => `${x.type === "owe" ? "🔴 Devo" : "🟢 Me deve"} ${x.amount} (${x.description})`)
                .join("\n")
            : "✅ Nada pendente.";
        return await sock.sendMessage(jid, { text: resp });
      }

      if (texto.startsWith("!config")) {
        const [_, sal, hrs] = texto.split(" ");
        await supabase
          .from("profiles")
          .update({ salary: parseFloat(sal), work_hours: parseFloat(hrs) })
          .eq("id", profile.id);
        return await sock.sendMessage(jid, { text: "✅ Configurado!" });
      }

      if (texto === "desfazer") {
        const { data: ult } = await supabase
          .from("transactions")
          .select("id")
          .eq("user_id", profile.id)
          .order("date", { ascending: false })
          .limit(1)
          .single();
        if (ult) {
          await supabase.from("transactions").delete().eq("id", ult.id);
          return await sock.sendMessage(jid, { text: "🗑️ Desfeito!" });
        }
      }

      if (
        texto.match(/^(gastei|comprei|paguei|recebi|ganhei|caiu|salario)/) ||
        texto.match(/^\d+/)
      ) {
        await processarTransacao(sock, jid, texto, profile);
      }
    } catch (err) {
      console.log("Erro ao processar mensagem:", err);
    }
  });
}

connectToWhatsApp();
