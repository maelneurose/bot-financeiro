const { makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const pino = require('pino');

// SEU NÚMERO
const MEU_NUMERO = '5521992544208';

async function conectar() {
    const { state, saveCreds } = await useMultiFileAuthState('pasta_sessao_pronta');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["Windows", "Chrome", "10.0.0"],
    });

    if (!sock.authState.creds.me && !sock.authState.creds.registered) {
        console.log('⏳ Gerando código de pareamento...');
        await delay(3000);
        const code = await sock.requestPairingCode(MEU_NUMERO);
        console.log('\n==========================================');
        console.log('CÓDIGO PARA O SEU CELULAR: ' + code);
        console.log('==========================================\n');
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log('✅ SUCESSO! CONECTADO!');
            console.log('📁 Uma pasta "pasta_sessao_pronta" foi criada.');
            console.log('🛑 Pode parar o script (Ctrl + C) e subir essa pasta para o GitHub.');
            process.exit(0);
        }
    });
}

conectar();