const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');

// =======================================================
// 1. CONFIGURAÇÃO
// =======================================================
const SUPABASE_URL = 'https://gukvjlhgvgoaqbgiuveq.supabase.co'; 

// 🚨 NA RAILWAY: A chave fica nas "Variables".
// No seu PC, se quiser testar, cole a chave dentro das aspas abaixo:
const SUPABASE_KEY = process.env.SUPABASE_KEY || ''; 

// 🔗 LINK DO SITE PARA QUEM FOR BLOQUEADO
const LINK_DO_SITE = 'https://ultima-chance-app.vercel.app';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// ⚙️ CONFIGURAÇÃO DO BOT (RAILWAY / DOCKER)
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '/app/.wwebjs_auth' }),
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
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
    if (texto.includes('uber') || texto.includes('99') || texto.includes('gasolina')) return '🚖';
    return '💸'; 
}

function calcularTempoDeVida(valor, salario, horasMensais) {
    if (!salario || !horasMensais) return null;
    const valorPorHora = salario / horasMensais;
    const horasGastas = valor / valorPorHora;
    return horasGastas < 1 ? `${Math.round(horasGastas * 60)} minutos` : `${horasGastas.toFixed(1)} horas`;
}

// 🔒 O GUARDIÃO: Verifica se pode usar ou se estourou o limite
async function verificarLimite(profile, msg) {
    // Se for PRO, está liberado
    if (profile.is_pro) return true;

    // Conta quantos registros ele já fez
    const { count: qtdGastos } = await supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', profile.id);
    const { count: qtdDividas } = await supabase.from('debts').select('*', { count: 'exact', head: true }).eq('user_id', profile.id);
    
    const totalUsado = (qtdGastos || 0) + (qtdDividas || 0);
    const LIMITE_GRATIS = 5;

    // Bloqueia se passou do limite
    if (totalUsado >= LIMITE_GRATIS) {
        msg.reply(`🔒 *LIMITE ATINGIDO!*\nVocê usou seus ${LIMITE_GRATIS} registros grátis.\n\n🚀 *Assine Premium:* ${LINK_DO_SITE}`);
        return false; 
    }
    return true; 
}

// =======================================================
// 3. PROCESSAMENTO DE TRANSAÇÕES
// =======================================================
async function processarTransacao(msg, texto, senderNumber) {
    try {
        const { data: profile } = await supabase.from('profiles').select('id, salary, work_hours, is_pro').eq('phone', senderNumber).single();

        if (!profile) { msg.reply('❌ Você não tem cadastro! Cadastre-se no site primeiro.'); return; }
        if (!(await verificarLimite(profile, msg))) return;

        let tipo = 'expense';
        if (texto.match(/^(recebi|ganhei|caiu|salario|deposito|pix recebido)/)) tipo = 'income';

        const itens = texto.split(/\s+e\s+|,\s+/); 
        let respostaFinal = `📝 *Relatório Financeiro*\n━━━━━━━━━━━━━━━━\n`;
        let encontrouAlgo = false;
        let totalOperacao = 0;

        for (let itemTexto of itens) {
            itemTexto = itemTexto.replace(/(gastei|comprei|paguei|recebi|ganhei|no|na|em|de)\s+/g, ' ').trim();
            let valor = 0;
            const match = itemTexto.match(/(\d+[.,]?\d*)/);

            if (match) {
                valor = parseFloat(match[0].replace(',', '.'));
                itemTexto = itemTexto.replace(match[0], '');
            } else continue; 

            let descricao = itemTexto.trim();
            if (!descricao || descricao.length < 2) descricao = tipo === 'income' ? 'Entrada' : 'Geral';
            descricao = descricao.charAt(0).toUpperCase() + descricao.slice(1);
            const emoji = escolherEmoji(descricao.toLowerCase(), tipo);

            await supabase.from('transactions').insert({
                user_id: profile.id, amount: valor, type: tipo, description: `${emoji} ${descricao}`, date: new Date().toISOString()
            });
            
            totalOperacao += valor;
            encontrouAlgo = true;
            respostaFinal += `${emoji} *${descricao}:* R$ ${valor.toFixed(2).replace('.', ',')}\n`;
        }

        if (!encontrouAlgo) { msg.reply('🤖 Não entendi. Tente: "Gastei 10 pizza"'); return; }

        let extraInfo = '';
        if (tipo === 'expense' && profile.salary) {
            const tempoVida = calcularTempoDeVida(totalOperacao, profile.salary, profile.work_hours);
            extraInfo = `\n⏳ *Custo de Vida:* ${tempoVida} de trabalho.`;
        }
        respostaFinal += `━━━━━━━━━━━━━━━━${extraInfo}`;
        msg.reply(respostaFinal);

    } catch (e) {
        console.error("Erro ao processar:", e);
    }
}

async function processarDivida(msg, texto, senderNumber) {
    const { data: profile } = await supabase.from('profiles').select('id, is_pro').eq('phone', senderNumber).single();
    if (!profile) return;
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
// 4. O ROBÔ (MODO DEPURADOR / TESTE SOZINHO)
// =======================================================
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log(`\n🔗 Link Mágico: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}\n`);
});

client.on('ready', () => { console.log('✅ Bot Mael Online!'); });

// 🔥 MUDANÇA: 'message_create' ouve TUDO, inclusive o que VOCÊ manda
client.on('message_create', async (msg) => {
    
    // 🛑 EVITA LOOP INFINITO (Não responde às próprias respostas)
    if (msg.fromMe && (msg.body.startsWith('📝') || msg.body.startsWith('🔒') || msg.body.startsWith('📉') || msg.body.startsWith('📈'))) {
        return;
    }
    
    // Ignora grupos
    if (msg.from.includes('@g.us')) return;

    // LOG PARA VOCÊ VER NA RAILWAY SE CHEGOU
    console.log(`📩 RECEBI: ${msg.body} | DE: ${msg.from}`);

    const texto = msg.body.toLowerCase().trim();
    // Pega o número certo (seja você ou outra pessoa)
    const senderNumber = msg.from.replace('@c.us', ''); 

    // --- COMANDOS ---
    if (texto === 'ajuda' || texto === 'menu' || texto === 'oi') {
        msg.reply(`🤖 *Mael Financeiro*\n\nComandos:\n• Gastei 10\n• Devo 50 pro João\n• Ver dividas`);
        return;
    }

    if (texto === 'ver dividas' || texto === 'cobranças') {
        const { data: profile } = await supabase.from('profiles').select('id').eq('phone', senderNumber).single();
        if(!profile) return msg.reply("❌ Perfil não encontrado.");

        const { data: debts } = await supabase.from('debts').select('*').eq('user_id', profile.id).eq('status', 'pending');
        if (!debts || !debts.length) return msg.reply('✅ Nenhuma dívida.');
        
        let msgDivida = `☠️ *Dívidas*\n`;
        debts.forEach(d => msgDivida += d.type === 'owe' ? `🔴 Devo ${d.amount} (${d.description})\n` : `🟢 ${d.description} deve ${d.amount}\n`);
        msg.reply(msgDivida);
        return;
    }

    if (texto.startsWith('!config')) {
        const args = texto.split(' ');
        const salario = parseFloat(args[1]);
        const horas = parseFloat(args[2]);
        if (!salario) return msg.reply("⚠️ Use: !config SALARIO HORAS");

        const { data: profile } = await supabase.from('profiles').select('id').eq('phone', senderNumber).single();
        if (profile) {
            await supabase.from('profiles').update({ salary: salario, work_hours: horas }).eq('id', profile.id);
            msg.reply(`✅ Configurado!`);
        }
        return;
    }

    if (texto === 'desfazer') {
        const { data: profile } = await supabase.from('profiles').select('id').eq('phone', senderNumber).single();
        const { data: lastTrans } = await supabase.from('transactions').select('id, description').eq('user_id', profile.id).order('date', { ascending: false }).limit(1).single();
        if (lastTrans) { 
            await supabase.from('transactions').delete().eq('id', lastTrans.id); 
            return msg.reply(`🗑️ Apagado: ${lastTrans.description}`); 
        }
        return msg.reply('🤷‍♂️ Nada para apagar.');
    }

    if (texto.startsWith('devo') || texto.includes('me deve')) {
        await processarDivida(msg, texto, senderNumber);
    } else if (texto.match(/^(gastei|comprei|paguei|recebi|ganhei|caiu|salario)/) || texto.match(/^\d+/)) {
        await processarTransacao(msg, texto, senderNumber);
    }
});

client.initialize();