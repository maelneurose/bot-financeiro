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
// 2. FUNÇÕES AUXILIARES E LÓGICA DE NEGÓCIO
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

// 🔒 O GUARDIÃO: Verifica se o usuário atingiu o limite grátis
async function verificarLimite(profile, msg) {
    // 1. Se for PRO, libera tudo
    if (profile.is_pro) return true;

    // 2. Conta quantos registros ele tem (Gastos + Dívidas)
    const { count: qtdGastos } = await supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', profile.id);
    const { count: qtdDividas } = await supabase.from('debts').select('*', { count: 'exact', head: true }).eq('user_id', profile.id);
    
    const totalUsado = (qtdGastos || 0) + (qtdDividas || 0);
    const LIMITE_GRATIS = 5; // Limite de testes

    // 3. Bloqueia se passou do limite
    if (totalUsado >= LIMITE_GRATIS) {
        msg.reply(
`🔒 *LIMITE GRÁTIS ATINGIDO!*
━━━━━━━━━━━━━━━━
Você já usou seus ${LIMITE_GRATIS} registros gratuitos. O bot travou.

🚀 *Para liberar acesso ILIMITADO:*
Assine o plano Premium no nosso site e tenha:
✅ Dívidas e Cobranças
✅ Gráficos Detalhados
✅ Registros Infinitos

👉 *Desbloquear Agora:* ${LINK_DO_SITE}`
        );
        return false; // Retorna falso para parar a execução
    }
    return true; // Retorna verdadeiro para continuar
}

// =======================================================
// 3. PROCESSAMENTO DE TRANSAÇÕES (GASTOS E GANHOS)
// =======================================================
async function processarTransacao(msg, texto, senderNumber) {
    const { data: profile } = await supabase.from('profiles').select('id, salary, work_hours, is_pro').eq('phone', senderNumber).single();

    if (!profile) { msg.reply('❌ Cadastre-se no site primeiro!'); return; }

    // 🔒 Verifica Limite antes de salvar
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
}

// =======================================================
// 4. PROCESSAMENTO DE DÍVIDAS (DEVO / ME DEVEM)
// =======================================================
async function processarDivida(msg, texto, senderNumber) {
    const { data: profile } = await supabase.from('profiles').select('id, is_pro').eq('phone', senderNumber).single();
    if (!profile) return;

    // 🔒 Verifica Limite antes de salvar
    if (!(await verificarLimite(profile, msg))) return;

    // Caso 1: Eu devo (ex: "Devo 50 pro João")
    if (texto.startsWith('devo')) {
        const valorMatch = texto.match(/(\d+[.,]?\d*)/);
        if (!valorMatch) return msg.reply('❌ Exemplo: "Devo 50 pro João"');
        
        const valor = parseFloat(valorMatch[0].replace(',', '.'));
        const pessoa = texto.replace('devo', '').replace(valorMatch[0], '').replace(/(para|pro|pra|ao|a)/g, '').trim();

        await supabase.from('debts').insert({
            user_id: profile.id, amount: valor, description: pessoa || 'Alguém', type: 'owe', status: 'pending'
        });
        msg.reply(`📉 *Dívida Anotada!*\nVocê deve R$ ${valor} para ${pessoa}.`);
    }

    // Caso 2: Me devem (ex: "João me deve 50")
    if (texto.includes('me deve')) {
        const valorMatch = texto.match(/(\d+[.,]?\d*)/);
        if (!valorMatch) return msg.reply('❌ Exemplo: "João me deve 50"');

        const valor = parseFloat(valorMatch[0].replace(',', '.'));
        const pessoa = texto.split('me deve')[0].trim();

        await supabase.from('debts').insert({
            user_id: profile.id, amount: valor, description: pessoa, type: 'receive', status: 'pending'
        });
        msg.reply(`📈 *Cobrança Anotada!*\n${pessoa} te deve R$ ${valor}.`);
    }
}

// =======================================================
// 5. O ROBÔ
// =======================================================
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    // Link Mágico para resolver o problema de QR Code bugado
    console.log(`\n🔗 Link Mágico do QR Code: \nhttps://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}\n`);
});

client.on('ready', () => { console.log('✅ Bot Mael Online!'); });

client.on('message', async (msg) => {
    if (msg.fromMe || msg.from.includes('@g.us')) return;
    const texto = msg.body.toLowerCase().trim();
    const senderNumber = msg.from.replace('@c.us', ''); 

    // --- MENU DE AJUDA ---
    if (texto === 'ajuda' || texto === 'menu' || texto === 'oi') {
        msg.reply(
`🤖 *Mael Financeiro*
💎 *Status:* ${texto.includes('!pro') ? 'PREMIUM' : 'GRÁTIS (5 registros)'}

📝 *Comandos:*
• "Gastei 15 lanche"
• "Recebi 100 pix"
• "Devo 50 pro João"
• "Maria me deve 30"
• "Ver dividas"
• "Saldo"

_Assine o Premium para liberar tudo!_`
        );
        return;
    }

    // --- LISTAR DÍVIDAS ---
    if (texto === 'ver dividas' || texto === 'cobranças') {
        const { data: profile } = await supabase.from('profiles').select('id').eq('phone', senderNumber).single();
        const { data: debts } = await supabase.from('debts').select('*').eq('user_id', profile.id).eq('status', 'pending');
        
        if (!debts || !debts.length) return msg.reply('✅ Nenhuma dívida pendente.');
        
        let msgDivida = `☠️ *Caderninho de Dívidas*\n`;
        let totalReceber = 0, totalPagar = 0;

        debts.forEach(d => {
            if(d.type === 'owe') {
                msgDivida += `🔴 Devo R$ ${d.amount} (${d.description})\n`;
                totalPagar += d.amount;
            } else {
                msgDivida += `🟢 R$ ${d.amount} a receber de ${d.description}\n`;
                totalReceber += d.amount;
            }
        });
        
        msgDivida += `\n📉 Pagar: R$ ${totalPagar}\n📈 Receber: R$ ${totalReceber}`;
        msg.reply(msgDivida);
        return;
    }

    // --- CONFIGURAR SALÁRIO ---
    if (texto.startsWith('!config')) {
        const args = texto.split(' ');
        const { data: profile } = await supabase.from('profiles').select('id').eq('phone', senderNumber).single();
        if (profile) {
            await supabase.from('profiles').update({ salary: parseFloat(args[1]), work_hours: parseFloat(args[2]) }).eq('id', profile.id);
            msg.reply(`✅ Salário configurado!`);
        }
        return;
    }

    // --- DESFAZER ---
    if (texto === 'desfazer') {
        const { data: profile } = await supabase.from('profiles').select('id').eq('phone', senderNumber).single();
        // Tenta apagar última transação
        const { data: lastTrans } = await supabase.from('transactions').select('id, description').eq('user_id', profile.id).order('date', { ascending: false }).limit(1).single();
        if (lastTrans) { 
            await supabase.from('transactions').delete().eq('id', lastTrans.id); 
            return msg.reply(`🗑️ Apagado: ${lastTrans.description}`); 
        }
        // Se não tiver transação, tenta apagar última dívida
        const { data: lastDebt } = await supabase.from('debts').select('id, description').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(1).single();
        if (lastDebt) {
            await supabase.from('debts').delete().eq('id', lastDebt.id);
            return msg.reply(`🗑️ Dívida apagada: ${lastDebt.description}`);
        }
        return msg.reply('🤷‍♂️ Nada para apagar.');
    }

    // --- COMANDOS QUE GASTAM O LIMITE ---
    if (texto.startsWith('devo') || texto.includes('me deve')) {
        await processarDivida(msg, texto, senderNumber);
    } else if (texto.match(/^(gastei|comprei|paguei|recebi|ganhei|caiu|salario)/) || texto.match(/^\d+/)) {
        await processarTransacao(msg, texto, senderNumber);
    }
});

client.initialize();