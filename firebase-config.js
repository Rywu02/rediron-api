// firebase-config.js
const admin = require('firebase-admin');
const fs = require('fs');

// 🔥 VERIFICAR SE O ARQUIVO EXISTE
const credPath = './firebase-adminsdk.json';

if (!fs.existsSync(credPath)) {
    console.error('❌ Arquivo firebase-adminsdk.json não encontrado!');
    console.error('📌 Baixe o arquivo no Firebase Console e coloque nesta pasta.');
    process.exit(1);
}

try {
    // Importar o arquivo de credenciais
    const serviceAccount = require('./firebase-adminsdk.json');

    // Inicializar Firebase Admin SDK
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });

    console.log('🔥 Firebase Admin SDK inicializado com sucesso!');
    console.log(`📱 Projeto: ${serviceAccount.project_id}`);

} catch (error) {
    console.error('❌ Erro ao inicializar Firebase:', error.message);
    process.exit(1);
}

const messaging = admin.messaging();

module.exports = { admin, messaging };
