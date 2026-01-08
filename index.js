const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');
const schedule = require('node-schedule'); 

const SUPABASE_URL = 'https://gukvjlhgvgoaqbgiuveq.supabase.co'; 
const SUPABASE_KEY = process.env.SUPABASE_KEY || ''; 
const LINK_DO_SITE = 'https://ultima-chance-app.vercel.app';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// ⚙️ CONFIGURAÇÃO FINAL (COM CORREÇÃO DE VERSÃO)
const client = new Client({
    authStrategy: new LocalAuth({ 
        dataPath: '/app/.wwebjs_auth',
        clientId: 'sessao-final' 
    }),
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    },
    // 👇 ISSO AQUI CONSERTA O QR CODE NA VERSÃO OFICIAL 👇
    webVersionCache: {
        type: "remote",
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
    }
});

function escolherEmoji(texto, tipo) {
    if (tipo === 'income') return '🤑'; 
    if (texto.includes('cerveja') || texto.includes('chopp') || texto.includes('bar')) return '🍺';
    return '💸'; 
}

function calcularTempoDeVida(valor, salario, horasMensais) {
    if (!salario || !horasMensais) return null;
    const valorPorHora = salario / horasMensais;
    const horasGastas = valor / valorPorHora;
    return horasGastas < 1 ? `${Math.round(horasGastas * 60)} min` : `${horasGastas.toFixed(1)} hrs`;
}

async function verificarLimite(profile, msg) {
    if (profile.is_pro) return true;
    const { count: qtdGastos } = await supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', profile.id);
    const { count: qtdDividas } = await supabase.from('debts').select('*', { count: 'exact', head: true }).eq('user_id', profile.id);
    if ((qtdGastos || 0) + (qtdDividas || 0) >= 5) {
        msg.reply(`🔒 *LIMITE ATINGIDO!*\n🚀 Assine: ${LINK_DO_SITE}`);
        return false; 
    }
    return true; 
}

async function agendarLembrete(msg, texto, profile) {
    const matchDia = texto.match(/dia\s+(\d+)/);
    if (!matchDia) return msg.reply('⚠️ Ex: "Lembre de pagar a luz dia 25"');
    const dia = parseInt(matchDia[1]);
    const mensagem = texto.replace('lembre', '').replace('me lembre', '').replace(/dia\s+\d+/, '').trim();
    let data = new Date(); data.setDate(dia); data.setHours(9, 0, 0, 0); 
    if (data < new Date()) data.setMonth(data.getMonth() + 1);

    await supabase.from('reminders').insert({ user_id: profile.id, message: mensagem, remind_at: data.toISOString(), status: 'pending' });
    schedule.scheduleJob(data, function(){
        const destino = profile.phone.includes('@') ? profile.phone : `${profile.phone}@c.us`;
        client.sendMessage(destino, `⏰ *LEMBRETE!* \n📌 ${mensagem}`);
    });
    msg.reply(`✅ *Agendado!* Dia ${dia} às 09:00.`);
}

async function verResumo(msg, profile) {
    const dias = new Date(); dias.setDate(new Date().getDate() - 7); 
    const { data: trans } = await supabase.from('transactions').select('*').eq('user_id', profile.id).eq('type', 'expense').gte('date', dias.toISOString());
    if (!trans || !trans.length) return msg.reply('🤷‍♂️ Nada nos últimos 7 dias.');
    let total = 0, txt = `📊 *Resumo (7 Dias)*\n`;
    trans.forEach(t => { total += t.amount; txt += `💸 ${t.description.substring(0,15)}.. R$ ${t.amount}\n`; });
    msg.reply(txt + `🚨 *Total:* R$ ${total.toFixed(2)}`);
}

async function processarTransacao(msg, texto, profile) {
    if (!(await verificarLimite(profile, msg))) return;
    let tipo = texto.match(/^(recebi|ganhei|caiu|salario)/) ? 'income' : 'expense';
    const itens = texto.split(/\s+e\s+|,\s+/); 
    let txt = `📝 *Relatório*\n`, total = 0, achou = false;

    for (let item of itens) {
        const match = item.match(/(\d+[.,]?\d*)/);
        if (match) {
            let valor = parseFloat(match[0].replace(',', '.'));
            let desc = item.replace(match[0], '').replace(/(gastei|comprei|paguei|recebi|no|na|em|de)\s+/g, '').trim() || (tipo === 'income' ? 'Entrada' : 'Geral');
            desc = desc.charAt(0).toUpperCase() + desc.slice(1);
            await supabase.from('transactions').insert({ user_id: profile.id, amount: valor, type: tipo, description: desc, date: new Date().toISOString() });
            total += valor; achou = true; txt += `${escolherEmoji(desc.toLowerCase(), tipo)} *${desc}:* R$ ${valor.toFixed(2)}\n`;
        }
    }
    if (!achou) return msg.reply('🤖 Ex: "Gastei 10 pizza"');
    if (tipo === 'expense' && profile.salary) txt += `⏳ Custo Vida: ${calcularTempoDeVida(total, profile.salary, profile.work_hours)}`;
    msg.reply(txt);
}

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log(`\n👇 QR CODE: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}\n`);
});

client.on('ready', () => console.log('✅ Bot Online!'));

client.on('message_create', async (msg) => {
    if (msg.fromMe || msg.from.includes('@g.us')) return;
    const texto = msg.body.toLowerCase().trim();
    const { data: profile } = await supabase.from('profiles').select('*').eq('phone', msg.from.replace('@c.us', '')).single();
    if (!profile && !['ajuda', 'oi'].includes(texto)) return msg.reply('❌ Cadastre-se no site!');

    if (texto.includes('lembre')) return await agendarLembrete(msg, texto, profile);
    if (texto.includes('resumo') || texto.includes('quanto gastei')) return await verResumo(msg, profile);
    if (texto === 'ajuda' || texto === 'oi') return msg.reply(`🤖 *Manual*\n• Lembre de pagar luz dia 20\n• Gastei 10 pizza\n• Resumo`);
    if (texto.match(/^(gastei|comprei|paguei|recebi|ganhei|caiu|salario)/) || texto.match(/^\d+/)) await processarTransacao(msg, texto, profile);
});

client.initialize();