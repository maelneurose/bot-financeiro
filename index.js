const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');
const schedule = require('node-schedule'); 

// =======================================================
// 1. CONFIGURAÇÃO
// =======================================================
const SUPABASE_URL = 'https://gukvjlhgvgoaqbgiuveq.supabase.co'; 
const SUPABASE_KEY = process.env.SUPABASE_KEY || ''; 
const LINK_DO_SITE = 'https://ultima-chance-app.vercel.app';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// ⚙️ CONFIGURAÇÃO FINAL (BIBLIOTECA MODERNA)
const client = new Client({
    authStrategy: new LocalAuth({ 
        dataPath: '/app/.wwebjs_auth',
        clientId: 'sessao-completa-final' // Nome novo para garantir limpeza
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
    }
});

// =======================================================
// 2. FUNÇÕES AUXILIARES
// =======================================================

function escolherEmoji(texto, tipo) {
    if (tipo === 'income') return '🤑'; 
    if (texto.includes('cerveja') || texto.includes('chopp') || texto.includes('bar')) return '🍺';
    if (texto.includes('maconha') || texto.includes('erva') || texto.includes('chá')) return '🌿';
    if (texto.includes('cigarro') || texto.includes('vape')) return '🚬';
    if (texto.includes('ifood') || texto.includes('pizza') || texto.includes('lanche') || texto.includes('burguer')) return '🍔';
    if (texto.includes('uber') || texto.includes('gasolina')) return '🚖';
    return '💸'; 
}

function calcularTempoDeVida(valor, salario, horasMensais) {
    if (!salario || !horasMensais) return null;
    const valorPorHora = salario / horasMensais;
    const horasGastas = valor / valorPorHora;
    return horasGastas < 1 ? `${Math.round(horasGastas * 60)} min` : `${horasGastas.toFixed(1)} hrs`;
}

// 🔒 O GUARDIÃO (VERIFICA LIMITES)
async function verificarLimite(profile, msg) {
    if (profile.is_pro) return true;

    const { count: qtdGastos } = await supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', profile.id);
    const { count: qtdDividas } = await supabase.from('debts').select('*', { count: 'exact', head: true }).eq('user_id', profile.id);
    
    const totalUsado = (qtdGastos || 0) + (qtdDividas || 0);
    const LIMITE_GRATIS = 5;

    if (totalUsado >= LIMITE_GRATIS) {
        msg.reply(`🔒 *LIMITE ATINGIDO!*\nVocê usou seus ${LIMITE_GRATIS} registros.\n🚀 Assine: ${LINK_DO_SITE}`);
        return false; 
    }
    return true; 
}

// =======================================================
// 3. FUNÇÕES PRINCIPAIS
// =======================================================

async function agendarLembrete(msg, texto, profile) {
    const matchDia = texto.match(/dia\s+(\d+)/);
    if (!matchDia) return msg.reply('⚠️ Ex: "Lembre de pagar a luz dia 25"');

    const dia = parseInt(matchDia[1]);
    const mensagemLembrete = texto.replace('lembre', '').replace('me lembre', '').replace(/dia\s+\d+/, '').trim();

    const hoje = new Date();
    let dataLembrete = new Date();
    dataLembrete.setDate(dia);
    dataLembrete.setHours(9, 0, 0, 0); 

    if (dataLembrete < hoje) dataLembrete.setMonth(dataLembrete.getMonth() + 1);

    await supabase.from('reminders').insert({
        user_id: profile.id,
        message: mensagemLembrete,
        remind_at: dataLembrete.toISOString(),
        status: 'pending'
    });

    schedule.scheduleJob(dataLembrete, function(){
        const destino = profile.phone.includes('@') ? profile.phone : `${profile.phone}@c.us`;
        client.sendMessage(destino, `⏰ *LEMBRETE!* \n📌 ${mensagemLembrete}`);
    });

    msg.reply(`✅ *Agendado!* Vou te lembrar dia ${dia}/${dataLembrete.getMonth() + 1} às 09:00.`);
}

async function verResumo(msg, profile) {
    const hoje = new Date();
    const diasAtras = new Date();
    diasAtras.setDate(hoje.getDate() - 7); 

    const { data: transacoes } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', profile.id)
        .eq('type', 'expense')
        .gte('date', diasAtras.toISOString());

    if (!transacoes || transacoes.length === 0) return msg.reply('🤷‍♂️ Nenhum gasto nos últimos 7 dias.');

    let total = 0;
    let textoResumo = `📊 *Resumo (7 Dias)*\n━━━━━━━━━━━━━━━━\n`;
    transacoes.forEach(t => { 
        total += t.amount; 
        textoResumo += `💸 ${t.description.substring(0,18)}.. R$ ${t.amount}\n`; 
    });
    textoResumo += `━━━━━━━━━━━━━━━━\n🚨 *Total:* R$ ${total.toFixed(2)}`;
    msg.reply(textoResumo);
}

async function processarTransacao(msg, texto, profile) {
    if (!(await verificarLimite(profile, msg))) return;

    let tipo = 'expense';
    if (texto.match(/^(recebi|ganhei|caiu|salario|deposito|pix recebido)/)) tipo = 'income';

    const itens = texto.split(/\s+e\s+|,\s+/); 
    let respostaFinal = `📝 *Relatório*\n━━━━━━━━━━━━━━━━\n`;
    let total = 0;
    let encontrou = false;

    for (let itemTexto of itens) {
        itemTexto = itemTexto.replace(/(gastei|comprei|paguei|recebi|ganhei|no|na|em|de)\s+/g, ' ').trim();
        const match = itemTexto.match(/(\d+[.,]?\d*)/);

        if (match) {
            let valor = parseFloat(match[0].replace(',', '.'));
            let desc = itemTexto.replace(match[0], '').trim(); 
            if(desc.length < 2) desc = tipo === 'income' ? 'Entrada' : 'Geral';
            desc = desc.charAt(0).toUpperCase() + desc.slice(1);
            const emoji = escolherEmoji(desc.toLowerCase(), tipo);

            await supabase.from('transactions').insert({ user_id: profile.id, amount: valor, type: tipo, description: `${emoji} ${desc}`, date: new Date().toISOString() });
            total += valor; encontrou = true;
            respostaFinal += `${emoji} *${desc}:* R$ ${valor.toFixed(2)}\n`;
        }
    }
    if (!encontrou) return msg.reply('🤖 Não entendi. Tente: "Gastei 10 pizza"');
    if (tipo === 'expense' && profile.salary) respostaFinal += `━━━━━━━━━━━━━━━━\n⏳ Custo Vida: ${calcularTempoDeVida(total, profile.salary, profile.work_hours)}`;
    msg.reply(respostaFinal);
}

async function processarDivida(msg, texto, profile) {
    if (!(await verificarLimite(profile, msg))) return;

    if (texto.startsWith('devo')) {
        const valorMatch = texto.match(/(\d+[.,]?\d*)/);
        if (!valorMatch) return msg.reply('❌ Ex: "Devo 50 pro João"');
        const valor = parseFloat(valorMatch[0].replace(',', '.'));
        const pessoa = texto.replace('devo', '').replace(valorMatch[0], '').replace(/(para|pro|pra|ao|a)/g, '').trim();
        await supabase.from('debts').insert({ user_id: profile.id, amount: valor, description: pessoa || 'Alguém', type: 'owe', status: 'pending' });
        msg.reply(`📉 *Dívida Anotada!* Você deve R$ ${valor} para ${pessoa}.`);
    }
    if (texto.includes('me deve')) {
        const valorMatch = texto.match(/(\d+[.,]?\d*)/);
        if (!valorMatch) return msg.reply('❌ Ex: "João me deve 50"');
        const valor = parseFloat(valorMatch[0].replace(',', '.'));
        const pessoa = texto.split('me deve')[0].trim();
        await supabase.from('debts').insert({ user_id: profile.id, amount: valor, description: pessoa, type: 'receive', status: 'pending' });
        msg.reply(`📈 *Cobrança Anotada!* ${pessoa} te deve R$ ${valor}.`);
    }
}

// =======================================================
// 4. O ROBÔ
// =======================================================
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log(`\n👇 QR CODE: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}\n`);
});

client.on('ready', async () => { 
    console.log('✅ Bot Mael Online!'); 
    const { data: pendentes } = await supabase.from('reminders').select('*').eq('status', 'pending');
    if (pendentes) {
        pendentes.forEach(p => {
            const dataLembrete = new Date(p.remind_at);
            if (dataLembrete > new Date()) {
                schedule.scheduleJob(dataLembrete, async function(){
                    const {data: user} = await supabase.from('profiles').select('phone').eq('id', p.user_id).single();
                    if(user) {
                        const destino = user.phone.includes('@') ? user.phone : `${user.phone}@c.us`;
                        client.sendMessage(destino, `⏰ *LEMBRETE!* \n📌 ${p.message}`);
                    }
                });
            }
        });
        console.log(`⏰ Lembretes recarregados: ${pendentes.length}`);
    }
});

client.on('message_create', async (msg) => {
    if (msg.fromMe && (msg.body.startsWith('📝') || msg.body.startsWith('🔒') || msg.body.startsWith('📊') || msg.body.startsWith('⏰') || msg.body.startsWith('📉') || msg.body.startsWith('📈'))) return;
    if (msg.from.includes('@g.us')) return;

    console.log(`📩 RECEBI: ${msg.body}`);
    const texto = msg.body.toLowerCase().trim();
    const senderNumber = msg.from.replace('@c.us', ''); 

    const { data: profile } = await supabase.from('profiles').select('id, salary, work_hours, is_pro, phone').eq('phone', senderNumber).single();
    if (!profile && texto !== 'ajuda' && texto !== 'oi') return msg.reply('❌ Cadastre-se no site primeiro!');

    // --- COMANDOS ---
    if (texto.includes('lembre')) return await agendarLembrete(msg, texto, profile);
    if (texto.includes('quanto gastei') || texto.includes('resumo')) return await verResumo(msg, profile);
    if (texto.startsWith('devo') || texto.includes('me deve')) return await processarDivida(msg, texto, profile);
    
    if (texto === 'ver dividas') {
        const { data: debts } = await supabase.from('debts').select('*').eq('user_id', profile.id).eq('status', 'pending');
        if (!debts || !debts.length) return msg.reply('✅ Nada pendente.');
        let txt = `☠️ *Dívidas*\n`;
        debts.forEach(d => txt += d.type === 'owe' ? `🔴 Devo ${d.amount} (${d.description})\n` : `🟢 ${d.description} deve ${d.amount}\n`);
        return msg.reply(txt);
    }

    if (texto.startsWith('!config')) {
        const args = texto.split(' ');
        if(args.length < 3) return msg.reply("Use: !config SALARIO HORAS");
        await supabase.from('profiles').update({ salary: parseFloat(args[1]), work_hours: parseFloat(args[2]) }).eq('id', profile.id);
        return msg.reply('✅ Configurado!');
    }

    if (texto === 'desfazer') {
        const { data: lastTrans } = await supabase.from('transactions').select('id, description').eq('user_id', profile.id).order('date', { ascending: false }).limit(1).single();
        if (lastTrans) { await supabase.from('transactions').delete().eq('id', lastTrans.id); return msg.reply(`🗑️ Apagado: ${lastTrans.description}`); }
        return msg.reply('Nada encontrado.');
    }

    if (texto === 'ajuda' || texto === 'menu' || texto === 'oi') return msg.reply(`🤖 *Manual*\n• Lembre de pagar luz dia 20\n• Gastei 10\n• Devo 50\n• Ver dividas\n• !config 2000 160\n• Desfazer`);

    if (texto.match(/^(gastei|comprei|paguei|recebi|ganhei|caiu|salario)/) || texto.match(/^\d+/)) await processarTransacao(msg, texto, profile);
});

client.initialize();