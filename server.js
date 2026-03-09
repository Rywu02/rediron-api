// server.js
const express = require('express');
const sql = require('mssql');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuração do banco de dados
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: true,
        trustServerCertificate: true,
        connectTimeout: 30000,
        requestTimeout: 30000
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// Log para debug
console.log('📋 Configuração carregada:');
console.log(`   Servidor: ${dbConfig.server}`);
console.log(`   Banco: ${dbConfig.database}`);
console.log(`   Usuário: ${dbConfig.user}`);

// Middleware para log de requisições
app.use((req, res, next) => {
    console.log(`\n📡 ${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// ==================== ENDPOINTS ====================

// Teste de conexão
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date(),
        message: 'API funcionando!'
    });
});

// Teste de conexão com banco
app.get('/api/test-db', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query('SELECT GETDATE() as data');
        await pool.close();

        res.json({
            success: true,
            message: 'Conectado ao banco!',
            data: result.recordset[0]
        });
    } catch (err) {
        console.error('❌ Erro ao conectar ao banco:', err);
        res.status(500).json({
            success: false,
            error: err.message,
            details: err.toString()
        });
    }
});

// Buscar cliente por código
app.get('/api/clientes/:codSistema', async (req, res) => {
    try {
        const codSistema = req.params.codSistema;
        console.log(`🔍 Buscando cliente: ${codSistema}`);

        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('codSistema', sql.Int, codSistema)
            .query(`
                SELECT COD_SISTEMA, NOME_CLIENTE, CPF_CNPJ, TIPO_PRECO_1, CELULAR
                FROM TCLIENTES
                WHERE COD_SISTEMA = @codSistema
            `);

        await pool.close();

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado' });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error('❌ Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// Buscar produtos
app.get('/api/produtos', async (req, res) => {
    try {
        const { categoria, busca } = req.query;
        console.log(`🔍 Buscando produtos - Categoria: ${categoria}, Busca: ${busca}`);

        const pool = await sql.connect(dbConfig);

        let query = `
            SELECT J.SKU,
                   dbo.FX_DESCRICAO_SKU(J.SKU) AS NOME,
                   T.QTDE AS ESTOQUE
            FROM TLI_PRODUTOS_FILHO_V2 J
            INNER JOIN TLI_ESTOQUE T ON J.SKU = T.SKU
        `;

        const request = pool.request();

        if (categoria && categoria !== '0') {
            query += ` AND J.COD_CATEGORIA = @categoria`;
            request.input('categoria', sql.Int, categoria);
        }

        if (busca) {
            query += ` AND dbo.FX_DESCRICAO_SKU(J.SKU) LIKE @busca`;
            request.input('busca', sql.VarChar, `%${busca}%`);
        }

        const result = await request.query(query);
        await pool.close();

        res.json(result.recordset);
    } catch (err) {
        console.error('❌ Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// Buscar pedido aberto
app.get('/api/pedido-aberto/:codCliente', async (req, res) => {
    try {
        const codCliente = req.params.codCliente;

        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('codCliente', sql.Int, codCliente)
            .query(`
                SELECT TOP 1 ID_PEDIDO FROM TPEDIDOS
                WHERE COD_CLI = @codCliente
                AND ISNULL(STATUS, 0) = 0
            `);

        await pool.close();

        res.json({ pedidoId: result.recordset[0]?.ID_PEDIDO || 0 });
    } catch (err) {
        console.error('❌ Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// Criar novo pedido
app.post('/api/pedidos', async (req, res) => {
    try {
        const { clienteId } = req.body;

        if (!clienteId) {
            return res.status(400).json({ error: 'clienteId é obrigatório' });
        }

        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input('clienteId', sql.Int, clienteId)
            .query(`
                INSERT INTO TPEDIDOS (COD_CLI, DATA_PEDIDO, STATUS)
                OUTPUT INSERTED.ID_PEDIDO
                VALUES (@clienteId, GETDATE(), 0)
            `);

        await pool.close();

        res.json({ pedidoId: result.recordset[0].ID_PEDIDO });
    } catch (err) {
        console.error('❌ Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// Adicionar item ao pedido
app.post('/api/itens-pedido', async (req, res) => {
    try {
        const { pedidoId, sku, quantidade, preco, observacao } = req.body;

        if (!pedidoId || !sku || !quantidade) {
            return res.status(400).json({ error: 'Dados incompletos' });
        }

        const pool = await sql.connect(dbConfig);

        // Verificar se item já existe
        const checkResult = await pool.request()
            .input('pedidoId', sql.Int, pedidoId)
            .input('sku', sql.VarChar, sku)
            .query(`
                SELECT COUNT(*) as total FROM TPEDIDO_ITENS
                WHERE ID_PEDIDO = @pedidoId AND COD_SKU = @sku
            `);

        if (checkResult.recordset[0].total > 0) {
            // Update
            await pool.request()
                .input('pedidoId', sql.Int, pedidoId)
                .input('sku', sql.VarChar, sku)
                .input('quantidade', sql.Int, quantidade)
                .query(`
                    UPDATE TPEDIDO_ITENS
                    SET QTDE = @quantidade
                    WHERE ID_PEDIDO = @pedidoId AND COD_SKU = @sku
                `);
        } else {
            // Insert
            await pool.request()
                .input('pedidoId', sql.Int, pedidoId)
                .input('sku', sql.VarChar, sku)
                .input('quantidade', sql.Int, quantidade)
                .input('preco', sql.Float, preco || 0)
                .input('observacao', sql.VarChar, observacao || '')
                .query(`
                    INSERT INTO TPEDIDO_ITENS
                    (ID_PEDIDO, COD_SKU, QTDE, PRECO, OBS_ITEM)
                    VALUES (@pedidoId, @sku, @quantidade, @preco, @observacao)
                `);
        }

        await pool.close();

        res.json({ success: true });
    } catch (err) {
        console.error('❌ Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// Finalizar pedido
app.put('/api/pedidos/:pedidoId/finalizar', async (req, res) => {
    try {
        const { pedidoId } = req.params;
        const { valorFinal, valorDesconto, status, quantidadeTotalItens } = req.body;

        const pool = await sql.connect(dbConfig);

        await pool.request()
            .input('pedidoId', sql.Int, pedidoId)
            .input('status', sql.Int, status || 4)
            .input('qtdeTotal', sql.Int, quantidadeTotalItens || 0)
            .input('valorFinal', sql.Float, valorFinal || 0)
            .input('valorDesconto', sql.Float, valorDesconto || 0)
            .query(`
                UPDATE TPEDIDOS
                SET STATUS = @status,
                    QTDE_TOTAL = @qtdeTotal,
                    VALOR_FINAL = @valorFinal,
                    VALOR_TOTAL_DESCONTO = @valorDesconto,
                    DATA_SOLICITACAO = GETDATE()
                WHERE ID_PEDIDO = @pedidoId
            `);

        await pool.close();

        res.json({ success: true });
    } catch (err) {
        console.error('❌ Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// Buscar histórico de pedidos
app.get('/api/historico/:codCliente', async (req, res) => {
    try {
        const codCliente = req.params.codCliente;
        const { dataInicio, dataFim } = req.query;

        if (!dataInicio || !dataFim) {
            return res.status(400).json({ error: 'dataInicio e dataFim são obrigatórios' });
        }

        const pool = await sql.connect(dbConfig);

        const result = await pool.request()
            .input('codCliente', sql.Int, codCliente)
            .input('dataInicio', sql.Date, dataInicio)
            .input('dataFim', sql.Date, dataFim)
            .query(`
                SELECT ID_PEDIDO, DATA_PEDIDO, STATUS, QTDE_TOTAL
                FROM TPEDIDOS
                WHERE COD_CLI = @codCliente
                  AND STATUS IN (3, 4)
                  AND CONVERT(DATE, DATA_PEDIDO) BETWEEN @dataInicio AND @dataFim
                ORDER BY DATA_PEDIDO DESC
            `);

        await pool.close();

        res.json(result.recordset);
    } catch (err) {
        console.error('❌ Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// Buscar itens de um pedido
app.get('/api/pedidos/:pedidoId/itens', async (req, res) => {
    try {
        const pedidoId = req.params.pedidoId;

        const pool = await sql.connect(dbConfig);

        const result = await pool.request()
            .input('pedidoId', sql.Int, pedidoId)
            .query(`
                SELECT COD_SKU, QTDE
                FROM TPEDIDO_ITENS
                WHERE ID_PEDIDO = @pedidoId
            `);

        await pool.close();

        res.json(result.recordset);
    } catch (err) {
        console.error('❌ Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// Buscar categorias
app.get('/api/categorias', async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);

        const result = await pool.request()
            .query('SELECT COD_CATEG, CATEGORIA FROM TCATEGORIAS ORDER BY CATEGORIA');

        await pool.close();

        res.json(result.recordset);
    } catch (err) {
        console.error('❌ Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`\n🚀 ======================================`);
    console.log(`🚀 API rodando na porta ${PORT}`);
    console.log(`🚀 ======================================`);
    console.log(`📍 Teste: http://localhost:${PORT}/api/health`);
    console.log(`📍 Teste BD: http://localhost:${PORT}/api/test-db`);
    console.log(`🚀 ======================================`);
});