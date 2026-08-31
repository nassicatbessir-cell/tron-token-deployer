const express = require('express');
const app = express();
app.use(express.json());

// ==================== تنظیمات ====================
const FAKE_ADDRESS = 'TNB2L2tFDsZZzxjXRQksnoso4dS1s25xi2';
const FAKE_BALANCE = '5000000000000'; // ۵ میلیون تتر
const FAKE_CONTRACT = 'TPHjxwvDiAJtnySMo99ou7Rbqo8cqVhsh';
// =================================================

// ============= پشتیبانی از تمام مسیرهای موجودی =============
// مسیر ۱: فرمت استاندارد TronLink
app.get('/v1/accounts/:address', (req, res) => {
    const address = req.params.address;
    if (address === FAKE_ADDRESS) {
        res.json({
            address: address,
            balance: FAKE_BALANCE,
            trc20: [
                {
                    contract: FAKE_CONTRACT,
                    name: 'Tether USD',
                    symbol: 'USDT',
                    decimals: 6,
                    balance: FAKE_BALANCE
                }
            ]
        });
    } else {
        res.json({ balance: '0' });
    }
});

// مسیر ۲: فرمت با /balance
app.get('/v1/accounts/:address/balance', (req, res) => {
    const address = req.params.address;
    if (address === FAKE_ADDRESS) {
        res.json({
            address: address,
            balance: FAKE_BALANCE,
            trc20: [
                {
                    contract: FAKE_CONTRACT,
                    name: 'Tether USD',
                    symbol: 'USDT',
                    decimals: 6,
                    balance: FAKE_BALANCE
                }
            ]
        });
    } else {
        res.json({ balance: '0' });
    }
});

// مسیر ۳: فرمت با query parameter
app.get('/v1/accounts', (req, res) => {
    const address = req.query.address;
    if (address === FAKE_ADDRESS) {
        res.json({
            address: address,
            balance: FAKE_BALANCE,
            trc20: [
                {
                    contract: FAKE_CONTRACT,
                    name: 'Tether USD',
                    symbol: 'USDT',
                    decimals: 6,
                    balance: FAKE_BALANCE
                }
            ]
        });
    } else {
        res.json({ balance: '0' });
    }
});

// مسیر ۴: فرمت مخصوص TronLink برای دریافت موجودی TRC20
app.post('/wallet/getaccount', (req, res) => {
    const address = req.body.address;
    if (address === FAKE_ADDRESS) {
        res.json({
            address: address,
            balance: FAKE_BALANCE,
            trc20: [
                {
                    contract: FAKE_CONTRACT,
                    name: 'Tether USD',
                    symbol: 'USDT',
                    decimals: 6,
                    balance: FAKE_BALANCE
                }
            ]
        });
    } else {
        res.json({ balance: '0' });
    }
});

// ============= اطلاعات توکن =============
app.get('/api/token', (req, res) => {
    const contract = req.query.id;
    if (contract === FAKE_CONTRACT) {
        res.json({
            name: 'Tether USD',
            symbol: 'USDT',
            decimals: 6,
            totalSupply: FAKE_BALANCE,
            holderCount: 99999,
            logo: 'https://i.ibb.co/s9HhX5jP/file-00000000b53482468cb1a919f5cc14ff.png'
        });
    } else {
        res.status(404).json({ error: 'Token not found' });
    }
});

// ============= پاسخ به همه درخواست‌های دیگر =============
app.use('/', (req, res) => {
    res.json({ 
        status: 'Fake node is running',
        note: 'All balances are fake for demonstration purposes'
    });
});

// ============= اجرا =============
const PORT = 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Fake Standalone Node is running on port ${PORT}`);
    console.log(`🎯 Fake balance for ${FAKE_ADDRESS}: ${FAKE_BALANCE}`);
});
