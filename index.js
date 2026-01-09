const { Client, LocalAuth, NoAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');
const schedule = require('node-schedule'); 

// === CONFIGURAÇÃO ===
const SUPABASE_URL = 'https://gukvjlhgvgoaqbgiuveq.supabase.co'; 
const SUPABASE_KEY = process.env.SUPABASE_KEY || ''; 
const LINK_DO_SITE = 'https://ultima-chance-app.vercel.app';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// === CLIENTE WHATSAPP ===
const client = new Client({
    // NoAuth: Obrigatório para limpar a tentativa falha anterior
    authStrategy: new NoAuth(),

    // Paciência infinita (0) para não dar timeout
    authTimeoutMs: 0,
    qrMaxRetries: 10,
    
    puppeteer: {
        headless: 'new',
        executablePath: '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', 
            '--disable-gpu',
            // 👇 NOVOS COMANDOS ANTI-QUEDA 👇
            '--disable-web-security', 
            '--disable-features=IsolateOrigins,site-per-process',
            // Disfarce Windows (O ÚNICO QUE FUNCIONOU)
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        ]
    },
    // 👇 A VERSÃO QUE O SEU CELULAR ACEITOU ANTES 👇
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    }
});

// === FUNÇÕES (MANTIDAS) ===
function escolherEmoji(texto, tipo) { if (tipo === 'income') return '🤑'; if (texto.includes('cerveja') || texto.includes('chopp')) return '🍺'; return '💸'; }
function calcularTempoDeVida(valor, salario, horasMensais) { if (!salario || !horasMensais) return null; const valorPorHora = salario / horasMensais; const horasGastas = valor / valorPorHora; return horasGastas < 1 ? `${Math.round(horasGastas * 60)} min` : `${horasGastas.toFixed(1)} hrs`; }
async function verificarLimite(profile, msg) {
    if (profile.is_pro) return true;
    const { count: qtdGastos } = await supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', profile.id);
    const { count: qtdDividas } = await supabase.from('debts').select('*', { count: 'exact', head: true }).eq('user_id', profile.id);
    if ((qtdGastos || 0) + (qtdDividas || 0) >= 5) { msg.reply(`🔒 *LIMITE ATINGIDO!*\n🚀 Assine: ${LINK_DO_SITE}`); return false; } return true; 
}
async function agendarLembrete(msg, texto, profile) {
    const matchDia = texto.match(/dia\s+(\d+)/); if (!matchDia) return msg.reply('⚠️ Ex: "Lembre de pagar a luz dia 25"'); const dia = parseInt(matchDia[1]); const mensagem = texto.replace('lembre', '').replace('me lembre', '').replace(/dia\s+\d+/, '').trim(); let data = new Date(); data.setDate(dia); data.setHours(9, 0, 0, 0); if (data < new Date()) data.setMonth(data.getMonth() + 1); await supabase.from('reminders').insert({ user_id: profile.id, message: mensagem, remind_at: data.toISOString(), status: 'pending' }); schedule.scheduleJob(data, function(){ const destino = profile.phone.includes('@') ? profile.phone : `${profile.phone}@c.us`; client.sendMessage(destino, `⏰ *LEMBRETE!* \n📌 ${mensagem}`); }); msg.reply(`✅ *Agendado!* Dia ${dia} às 09:00.`);
}
async function verResumo(msg, profile) { const dias = new Date(); dias.setDate(new Date().getDate() - 7); const { data: trans } = await supabase.from('transactions').select('*').eq('user_id', profile.id).eq('type', 'expense').gte('date', dias.toISOString()); if (!trans || !trans.length) return msg.reply('🤷‍♂️ Nada nos últimos 7 dias.'); let total = 0, txt = `📊 *Resumo (7 Dias)*\n`; trans.forEach(t => { total += t.amount; txt += `💸 ${t.description.substring(0,15)}.. R$ ${t.amount}\n`; }); msg.reply(txt + `🚨 *Total:* R$ ${total.toFixed(2)}`); }
async function processarTransacao(msg, texto, profile) { if (!(await verificarLimite(profile, msg))) return; let tipo = texto.match(/^(recebi|ganhei|caiu|salario)/) ? 'income' : 'expense'; const itens = texto.split(/\s+e\s+|,\s+/); let txt = `📝 *Relatório*\n`, total = 0, achou = false; for (let item of itens) { const match = item.match(/(\d+[.,]?\d*)/); if (match) { let valor = parseFloat(match[0].replace(',', '.')); let desc = item.replace(match[0], '').replace(/(gastei|comprei|paguei|recebi|no|na|em|de)\s+/g, '').trim() || (tipo === 'income' ? 'Entrada' : 'Geral'); desc = desc.charAt(0).toUpperCase() + desc.slice(1); await supabase.from('transactions').insert({ user_id: profile.id, amount: valor, type: tipo, description: desc, date: new Date().toISOString() }); total += valor; achou = true; txt += `${escolherEmoji(desc.toLowerCase(), tipo)} *${desc}:* R$ ${valor.toFixed(2)}\n`; } } if (!achou) return msg.reply('🤖 Ex: "Gastei 10 pizza"'); if (tipo === 'expense' && profile.salary) txt += `⏳ Custo Vida: ${calcularTempoDeVida(total, profile.salary, profile.work_hours)}`; msg.reply(txt); }
async function processarDivida(msg, texto, profile) { if (!(await verificarLimite(profile, msg))) return; if (texto.startsWith('devo')) { const valorMatch = texto.match(/(\d+[.,]?\d*)/); if(!valorMatch) return; const valor = parseFloat(valorMatch[0].replace(',', '.')); const quem = texto.replace(/devo|\d+|para|pro|pra/g, '').trim(); await supabase.from('debts').insert({ user_id: profile.id, amount: valor, description: quem, type: 'owe', status: 'pending' }); msg.reply(`📉 Devo ${valor} para ${quem}.`); } else if (texto.includes('me deve')) { const valorMatch = texto.match(/(\d+[.,]?\d*)/); if(!valorMatch) return; const valor = parseFloat(valorMatch[0].replace(',', '.')); const quem = texto.split('me deve')[0].trim(); await supabase.from('debts').insert({ user_id: profile.id, amount: valor, description: quem, type: 'receive', status: 'pending' }); msg.reply(`📈 ${quem} te deve ${valor}.`); } }

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    // Link manual (Plano B)
    console.log(`\nLINK QR: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}\n`);
});

client.on('ready', () => console.log('✅ Bot Online!'));

client.on('message_create', async (msg) => {
    if (msg.from.includes('@g.us')) return;
    if (msg.fromMe && (msg.body.startsWith('📝') || msg.body.startsWith('🤖'))) return; 
    const texto = msg.body.toLowerCase().trim();
    const { data: profile } = await supabase.from('profiles').select('*').eq('phone', msg.from.replace('@c.us', '')).single();
    if (!profile && !['ajuda', 'oi'].includes(texto)) return msg.reply('❌ Cadastre-se no site!');
    
    if (texto.includes('lembre')) return await agendarLembrete(msg, texto, profile);
    if (texto.includes('resumo') || texto.includes('gastei')) return await verResumo(msg, profile);
    if (texto.startsWith('devo') || texto.includes('me deve')) return await processarDivida(msg, texto, profile);
    if (texto === 'ver dividas') { const { data: d } = await supabase.from('debts').select('*').eq('user_id', profile.id).eq('status', 'pending'); return msg.reply(d && d.length ? d.map(x => `${x.type === 'owe' ? '🔴 Devo' : '🟢 Me deve'} ${x.amount} (${x.description})`).join('\n') : '✅ Nada pendente.'); }
    if (texto.startsWith('!config')) { const [_, sal, hrs] = texto.split(' '); await supabase.from('profiles').update({ salary: parseFloat(sal), work_hours: parseFloat(hrs) }).eq('id', profile.id); return msg.reply('✅ Configurado!'); }
    if (texto === 'desfazer') { const { data: ult } = await supabase.from('transactions').select('id').eq('user_id', profile.id).order('date', { ascending: false }).limit(1).single(); if (ult) { await supabase.from('transactions').delete().eq('id', ult.id); return msg.reply('🗑️ Desfeito!'); } }
    if (texto.match(/^(gastei|comprei|paguei|recebi|ganhei|caiu|salario)/) || texto.match(/^\d+/)) await processarTransacao(msg, texto, profile);
    if (['ajuda', 'menu', 'oi'].includes(texto)) msg.reply(`🤖 *Menu*\n• Gastei 10\n• Devo 50\n• Resumo\n• Lembre dia 20`);
});

client.initialize();