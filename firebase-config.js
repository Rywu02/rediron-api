// firebase-config.js
const admin = require('firebase-admin');
const path = require('path');

try {
    // 🔥 IMPORTAR O ARQUIVO DE CREDENCIAIS BAIXADO 🔥
    const serviceAccount = require('./firebase-adminsdk.json');
    
    // Inicializar Firebase Admin SDK
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    
    console.log('🔥 Firebase Admin SDK inicializado com sucesso!');
    console.log('📱 Projeto: notificacao-app-red');
    console.log('🔢 Número do projeto:', serviceAccount.project_number);
    
} catch (error) {
    console.error('❌ Erro ao inicializar Firebase:', error.message);
}

const messaging = admin.messaging();

module.exports = { admin, messaging };
