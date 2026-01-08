const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');

// =======================================================
// 1. CONFIGURAÇÃO
// =======================================================
const SUPABASE_URL = 'https://gukvjlhgvgoaqbgiuveq.supabase.co'; 

// 🚨 NA RAILWAY: Configure isso nas "Variables" com o nome SUPABASE_KEY
const SUPABASE_KEY = process.env.SUPABASE_KEY || ''; 

// 🔗 LINK PARA ONDE O USUÁRIO VAI QUANDO FOR BLOQUEADO:
const LINK_DO_SITE = 'https://ultima-chance-app.vercel.app';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// ⚙️ CONFIGURAÇÃO ESPECIAL PARA RAILWAY / DOCKER
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
    if (texto.includes('cigarro') || texto.includes('vape') || texto.includes('pod')) return '🚬';
    if (texto.includes('ifood') || texto.includes('pizza') || texto.includes('burguer') || texto.includes('mc') || texto.includes('lanche')) return '🍔';
    if (texto.includes('mercado') || texto.includes('compra') || texto.includes('arroz') || texto.includes('carne')) return '🛒';
    if (texto.includes('uber') || texto.includes('99') || texto.includes('gasolina')) return '🚖';
    if (texto.includes('aluguel') || texto.includes('luz') || texto.includes('internet')) return '🏠';
    return '💸'; 
}

function calcularTempoDeVida(valor, salario, horasMensais) {
    if (!salario || !horasMensais) return null;
    const valorPorHora = salario / horasMensais;
    const horasGastas = valor / valorPorHora;
    return horasGastas < 1 ? `${Math.round(horasGastas * 60)} minutos` : `${horasGastas.toFixed(1)} horas`;
}

// 🔒 O GUARDIÃO (Verifica Limite)
async function verificarLimite(profile, msg) {
    if (profile.is_pro) return true;

    const { count: qtdGastos } = await supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', profile.id);
    const { count: qtdDividas } = await supabase.from('debts').select('*', { count: 'exact', head: true }).eq('user_id', profile.id);
    
    const totalUsado = (qtdGastos || 0) + (qtdDividas || 0);
    const LIMITE_GRATIS = 5;

    if (totalUsado >= LIMITE_GRATIS) {
        msg.reply(`🔒 *LIMITE GRÁTIS ATINGIDO!*\nVocê já usou seus ${LIMITE_GRATIS} registros.\n\n🚀 Assine Premium: ${LINK_DO_SITE}`);
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

        if (!profile) { msg.reply('❌ Cadastre-se no site primeiro!'); return; }
        if (!(await verificarLimite(profile, msg))) return;

        let tipo = 'expense';
        if (texto.match(/^(recebi|ganhei|caiu|salario|deposito|pix recebido)/)) tipo = 'income';

        const itens = texto.split(/\s+e\s+|,\s+/); 
        let respostaFinal = `📝 *Relatório Financeiro*\n━━━━━━━━━━━━━━━━\n`;
        let totalOperacao = 0;
        let encontrouAlgo = false;

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

        if (!encontrouAlgo) { msg.reply('🤖 Não entendi. Tente: "Gastei 10 pão"'); return; }

        let extraInfo = '';
        if (tipo === 'expense' && profile.salary) {
            const tempoVida = calcularTempoDeVida(totalOperacao, profile.salary, profile.work_hours);
            extraInfo = `\n⏳ *Custo de Vida:* Você trabalhou *${tempoVida}* pra pagar isso.`;
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
        if (!valorMatch) return msg.reply('❌ Exemplo: "Devo 50 pro João"');
        const valor = parseFloat(valorMatch[0].replace(',', '.'));
        const pessoa = texto.replace('devo', '').replace(valorMatch[0], '').replace(/(para|pro|pra|ao|a)/g, '').trim();

        await supabase.from('debts').insert({ user_id: profile.id, amount: valor, description: pessoa || 'Alguém', type: 'owe', status: 'pending' });
        msg.reply(`📉 *Dívida Anotada!* Você deve R$ ${valor} para ${pessoa}.`);
    }

    if (texto.includes('me deve')) {
        const valorMatch = texto.match(/(\d+[.,]?\d*)/);
        if (!valorMatch) return msg.reply('❌ Exemplo: "João me deve 50"');
        const valor = parseFloat(valorMatch[0].replace(',', '.'));
        const pessoa = texto.split('me deve')[0].trim();

        await supabase.from('debts').insert({ user_id: profile.id, amount: valor, description: pessoa, type: 'receive', status: 'pending' });
        msg.reply(`📈 *Cobrança Anotada!*\n${pessoa} te deve R$ ${valor}.`);
    }
}

// =======================================================
// 4. O ROBÔ (AGORA LÊ MENSAGENS DO PRÓPRIO NÚMERO)
// =======================================================
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log(`\n🔗 Link Mágico do QR Code: \nhttps://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}\n`);
});

client.on('ready', () => { console.log('✅ Bot Mael Online!'); });

// 🔥 USAMOS 'message_create' PARA OUVIR ATÉ VOCÊ MESMO
client.on('message_create', async (msg) => {
    
    // 🛑 IMPORTANTE: Evita que o bot responda às próprias respostas (Loop Infinito)
    // Se a mensagem for minha E começar com emojis que o bot usa, eu ignoro.
    if (msg.fromMe && (msg.body.startsWith('📝') || msg.body.startsWith('🤖') || msg.body.startsWith('💰') || msg.body.startsWith('🔒') || msg.body.startsWith('📉') || msg.body.startsWith('📈') || msg.body.startsWith('🗑️'))) {
        return;
    }

    // Ignora mensagens de Grupos
    if (msg.from.includes('@g.us')) return;

    // Log para você ver na Railway se a mensagem chegou
    console.log(`📩 RECEBI: ${msg.body} | DE: ${msg.from}`);

    const texto = msg.body.toLowerCase().trim();
    // Pega o número correto (se for self-chat, o from é você mesmo)
    const senderNumber = msg.from.replace('@c.us', ''); 

    // --- MENU ---
    if (texto === 'ajuda' || texto === 'menu' || texto === 'oi') {
        msg.reply(`🤖 *Mael Financeiro* (Teste)\nComandos:\n• "Gastei 10"\n• "Devo 50"\n• "Ver dividas"`);
        return;
    }

    // --- LISTAR DÍVIDAS ---
    if (texto === 'ver dividas' || texto === 'cobranças') {
        const { data: profile } = await supabase.from('profiles').select('id').eq('phone', senderNumber).single();
        if(!profile) return msg.reply("❌ Perfil não encontrado.");

        const { data: debts } = await supabase.from('debts').select('*').eq('user_id', profile.id).eq('status', 'pending');
        if (!debts || !debts.length) return msg.reply('✅ Nenhuma dívida pendente.');
        
        let msgDivida = `☠️ *Dívidas*\n`;
        debts.forEach(d => msgDivida += d.type === 'owe' ? `🔴 Devo ${d.amount} (${d.description})\n` : `🟢 ${d.description} deve ${d.amount}\n`);
        msg.reply(msgDivida);
        return;
    }

    // --- CONFIGURAR SALÁRIO ---
    if (texto.startsWith('!config')) {
        const args = texto.split(' ');
        const { data: profile } = await supabase.from('profiles').select('id').eq('phone', senderNumber).single();
        if (profile) {
            await supabase.from('profiles').update({ salary: parseFloat(args[1]), work_hours: parseFloat(args[2]) }).eq('id', profile.id);
            msg.reply(`✅ Configurado!`);
        }
        return;
    }

    // --- DESFAZER ---
    if (texto === 'desfazer') {
        const { data: profile } = await supabase.from('profiles').select('id').eq('phone', senderNumber).single();
        const { data: lastTrans } = await supabase.from('transactions').select('id, description').eq('user_id', profile.id).order('date', { ascending: false }).limit(1).single();
        if (lastTrans) { 
            await supabase.from('transactions').delete().eq('id', lastTrans.id); 
            return msg.reply(`🗑️ Apagado: ${lastTrans.description}`); 
        }
        return msg.reply('🤷‍♂️ Nada para apagar.');
    }

    // --- COMANDOS FINANCEIROS ---
    if (texto.startsWith('devo') || texto.includes('me deve')) {
        await processarDivida(msg, texto, senderNumber);
    } else if (texto.match(/^(gastei|comprei|paguei|recebi|ganhei|caiu|salario)/) || texto.match(/^\d+/)) {
        await processarTransacao(msg, texto, senderNumber);
    }
});

client.initialize();