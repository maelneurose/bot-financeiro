const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createClient } = require('@supabase/supabase-js');

// =======================================================
// 1. CONFIGURAÇÃO
// =======================================================
const SUPABASE_URL = 'https://gukvjlhgvgoaqbgiuveq.supabase.co'; 

// 🚨 NA RAILWAY: Configure isso nas "Variables" com o nome SUPABASE_KEY
// SE FOR TESTAR NO PC: Cole sua chave service_role dentro das aspas do 'ou'
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1a3ZqbGhndmdvYXFiZ2l1dmVxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDIwMzk4OSwiZXhwIjoyMDc5Nzc5OTg5fQ.fhzsvj6bWLFADMUvGjHXYV8tvqsisyERQ_TSY7MllhA'; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// ⚙️ CONFIGURAÇÃO ESPECIAL PARA RAILWAY / DOCKER
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '/app/.wwebjs_auth' }), // Salva sessão no volume do Docker
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/chromium', // 👈 O Chrome instalado pelo Dockerfile
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

// =======================================================
// 2. INTELIGÊNCIA DE EMOJIS & CALCULADORA
// =======================================================

function escolherEmoji(texto, tipo) {
    if (tipo === 'income') return '🤑'; 
    if (texto.includes('cerveja') || texto.includes('chopp') || texto.includes('drink') || texto.includes('bar') || texto.includes('vodka') || texto.includes('vinho')) return '🍺';
    if (texto.includes('maconha') || texto.includes('erva') || texto.includes('chá') || texto.includes('pren') || texto.includes('flor')) return '🌿';
    if (texto.includes('cigarro') || texto.includes('vape') || texto.includes('pod') || texto.includes('paiero')) return '🚬';
    if (texto.includes('ifood') || texto.includes('pizza') || texto.includes('burguer') || texto.includes('mc') || texto.includes('lanche')) return '🍔';
    if (texto.includes('mercado') || texto.includes('compra') || texto.includes('arroz') || texto.includes('carne')) return '🛒';
    if (texto.includes('açaí') || texto.includes('sorvete') || texto.includes('doce')) return '🍧';
    if (texto.includes('uber') || texto.includes('99') || texto.includes('taxi')) return '🚖';
    if (texto.includes('gasolina') || texto.includes('alcool') || texto.includes('posto')) return '⛽';
    if (texto.includes('carro') || texto.includes('moto') || texto.includes('mecânico') || texto.includes('oficina')) return '🔧';
    if (texto.includes('aluguel') || texto.includes('condominio')) return '🏠';
    if (texto.includes('luz') || texto.includes('energia')) return '💡';
    if (texto.includes('agua') || texto.includes('sabesp')) return '💧';
    if (texto.includes('internet') || texto.includes('wifi') || texto.includes('vivo') || texto.includes('claro') || texto.includes('tim')) return '🌐';
    if (texto.includes('tenis') || texto.includes('sapato') || texto.includes('chinelo')) return '👟';
    if (texto.includes('roupa') || texto.includes('camisa') || texto.includes('calça') || texto.includes('vestido')) return '👕';
    if (texto.includes('perfume') || texto.includes('creme') || texto.includes('beleza') || texto.includes('cabelo')) return '💅';
    if (texto.includes('lapis') || texto.includes('caneta') || texto.includes('caderno') || texto.includes('papel') || texto.includes('livro')) return '✏️';
    if (texto.includes('cinema') || texto.includes('netflix') || texto.includes('prime')) return '🍿';
    if (texto.includes('jogo') || texto.includes('steam') || texto.includes('playstation') || texto.includes('xbox')) return '🎮';
    if (texto.includes('farmacia') || texto.includes('remédio') || texto.includes('medico') || texto.includes('exame')) return '💊';
    return '💸'; 
}

function calcularTempoDeVida(valor, salario, horasMensais) {
    if (!salario || !horasMensais) return null;
    const valorPorHora = salario / horasMensais;
    const horasGastas = valor / valorPorHora;
    
    if (horasGastas < 1) {
        const minutos = Math.round(horasGastas * 60);
        return `${minutos} minutos`;
    } else {
        return `${horasGastas.toFixed(1)} horas`;
    }
}

function gerarComentario(valor, tipo) {
    if (tipo === 'income') return '🚀 *Boa!* Foguete não tem ré (mas dinheiro acaba, cuidado).';
    if (valor > 800) return '🚨 *Caramba!* Que facada. O orçamento tá sangrando aqui.';
    if (valor > 200) return '⚠️ *Anotado.* Segura a onda que o mês é longo.';
    return '✅ *Registrado.* Gasto suave.';
}

// =======================================================
// 3. PROCESSADOR INTELIGENTE
// =======================================================
async function processarTransacao(msg, texto, senderNumber) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, salary, work_hours')
        .eq('phone', senderNumber)
        .single();

    if (!profile) {
        msg.reply('❌ Não achei seu cadastro. Cadastre-se no site primeiro!');
        return;
    }

    let tipo = 'expense';
    if (texto.match(/^(recebi|ganhei|caiu|salario|deposito|pix recebido)/)) {
        tipo = 'income';
    }

    const itens = texto.split(/\s+e\s+|,\s+/); 
    
    let respostaFinal = `📝 *Relatório Financeiro*\n━━━━━━━━━━━━━━━━\n`;
    let totalOperacao = 0;
    let encontrouAlgo = false;

    for (let itemTexto of itens) {
        itemTexto = itemTexto.replace(/(gastei|comprei|paguei|recebi|ganhei|no|na|em|de)\s+/g, ' ').trim();

        let valor = 0;
        const matchMultiplicacao = itemTexto.match(/(\d+)\s*(?:de|x)\s*(\d+[.,]?\d*)/);
        const matchSimples = itemTexto.match(/(\d+[.,]?\d*)/);

        if (matchMultiplicacao) {
            const qtd = parseFloat(matchMultiplicacao[1]);
            const precoUni = parseFloat(matchMultiplicacao[2].replace(',', '.'));
            valor = qtd * precoUni;
            itemTexto = itemTexto.replace(matchMultiplicacao[0], '');
        } else if (matchSimples) {
            valor = parseFloat(matchSimples[0].replace(',', '.'));
            itemTexto = itemTexto.replace(matchSimples[0], '');
        } else {
            continue; 
        }

        let descricao = itemTexto.trim();
        if (!descricao || descricao.length < 2) descricao = tipo === 'income' ? 'Entrada' : 'Geral';
        descricao = descricao.charAt(0).toUpperCase() + descricao.slice(1);

        const emoji = escolherEmoji(descricao.toLowerCase(), tipo);

        await supabase.from('transactions').insert({
            user_id: profile.id,
            amount: valor,
            type: tipo,
            description: `${emoji} ${descricao}`,
            date: new Date().toISOString()
        });

        totalOperacao += valor;
        encontrouAlgo = true;
        
        respostaFinal += `${emoji} *${descricao}:* R$ ${valor.toFixed(2).replace('.', ',')}\n`;
    }

    if (!encontrouAlgo) {
        msg.reply('🤖 Não entendi os valores. Digite "Ajuda" para ver como usar.');
        return;
    }

    let extraInfo = '';
    if (tipo === 'expense' && profile.salary && profile.work_hours) {
        const tempoVida = calcularTempoDeVida(totalOperacao, profile.salary, profile.work_hours);
        extraInfo = `\n⏳ *Custo de Vida:* Você trabalhou *${tempoVida}* pra pagar isso.`;
    } else if (tipo === 'expense' && (!profile.salary || !profile.work_hours)) {
        extraInfo = `\n💡 _Dica: Digite !config para ativar a Calculadora de Vida!_`;
    }

    respostaFinal += `━━━━━━━━━━━━━━━━${extraInfo}\n💡 _${gerarComentario(totalOperacao, tipo)}_`;
    msg.reply(respostaFinal);
}

// =======================================================
// 4. O ROBÔ
// =======================================================
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('\n📱 ESCANEIE COM O WHATSAPP SECUNDÁRIO!\n');
    console.log('⚠️ Se estiver na Railway, veja o QR Code nos LOGS ("View Logs")\n');
});

client.on('ready', () => {
    console.log('✅ Bot Mael Online!');
});

client.on('message', async (msg) => {
    if (msg.fromMe || msg.from.includes('@g.us')) return;

    const texto = msg.body.toLowerCase().trim();
    const senderNumber = msg.from.replace('@c.us', ''); 

    // --- COMANDO: AJUDA / MENU ---
    if (texto === 'ajuda' || texto === 'menu' || texto === 'comandos' || texto === 'oi') {
        const msgAjuda = 
`🤖 *Bot Financeiro Mael - Manual*

📝 *Como registrar Gastos:*
Fale naturalmente:
• "Gastei 50 no almoço"
• "200 de gasolina"
• "Comprei 10 cervejas de 5 reais" (Ele calcula!)
• "50 maconha e 30 lanche" (Registra 2 de uma vez)

💰 *Como registrar Entradas:*
• "Recebi 1500 de salário"
• "Ganhei 50 pix"

📊 *Ver Saldo e Resumo:*
• "Quanto sobra?"
• "Saldo"

⏳ *Calculadora de Vida:*
1. Configure: \`!config SALARIO HORAS\`
   (Ex: \`!config 3000 220\`)
2. Registre um gasto e veja quanto tempo de vida ele custou.

🗑️ *Errou algo?*
• Digite "Desfazer" para apagar o último registro.

_Tente registrar algo agora!_ 🚀`;
        
        msg.reply(msgAjuda);
        return;
    }

    // --- COMANDO: CONFIGURAR SALÁRIO ---
    if (texto.startsWith('!config')) {
        const args = texto.split(' ');
        const salario = parseFloat(args[1]);
        const horas = parseFloat(args[2]);

        if (!salario || !horas) {
            msg.reply('⚠️ *Formato errado!*\nUse assim: `!config SALARIO HORAS`\nEx: `!config 3000 220`\n(Isso significa 3k de salário e 220 horas mensais)');
            return;
        }

        const { data: profile } = await supabase.from('profiles').select('id').eq('phone', senderNumber).single();
        if (profile) {
            await supabase.from('profiles').update({ salary: salario, work_hours: horas }).eq('id', profile.id);
            const valorHora = salario / horas;
            msg.reply(`✅ *Sucesso!* \nSua hora vale *R$ ${valorHora.toFixed(2)}*.\nAgora vou calcular o custo de vida de cada gasto.`);
        } else {
            msg.reply('❌ Perfil não encontrado.');
        }
        return;
    }

    // --- COMANDO: DESFAZER ---
    if (texto === 'desfazer' || texto === 'apagar ultimo') {
        const { data: profile } = await supabase.from('profiles').select('id').eq('phone', senderNumber).single();
        if (!profile) return;

        const { data: lastTrans } = await supabase.from('transactions').select('id, amount, description').eq('user_id', profile.id).order('date', { ascending: false }).limit(1).single();

        if (!lastTrans) { msg.reply('🤷‍♂️ Nada para apagar.'); return; }

        await supabase.from('transactions').delete().eq('id', lastTrans.id);
        msg.reply(`🗑️ *Apagado:* ${lastTrans.description} (R$ ${lastTrans.amount})`);
        return;
    }

    // --- SALDO ---
    if (texto.includes('resta') || texto.includes('saldo') || texto.includes('sobra')) {
        const { data: profile } = await supabase.from('profiles').select('id').eq('phone', senderNumber).single();
        if (!profile) return;

        const now = new Date();
        const primeiroDia = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const ultimoDia = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

        const { data: transactions } = await supabase.from('transactions').select('*').eq('user_id', profile.id).gte('date', primeiroDia).lte('date', ultimoDia);

        let entradas = 0, saidas = 0;
        transactions.forEach(t => t.type === 'income' ? entradas += t.amount : saidas += t.amount);
        const saldo = entradas - saidas;
        
        msg.reply(`💰 *Saldo Atual:* R$ ${saldo.toFixed(2).replace('.', ',')}\n(Entrou: ${entradas} | Saiu: ${saidas})`);
        return;
    }

    // --- TRANSAÇÕES ---
    if (texto.match(/^(gastei|comprei|paguei|recebi|ganhei|caiu|salario)/) || texto.match(/^\d+/)) {
        await processarTransacao(msg, texto, senderNumber);
    }
});

client.initialize();