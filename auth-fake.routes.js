// auth-fake.routes.js
// Opcional: rotas fake para Express, caso queira testar via backend.
// Como usar no seu server.js:
// const authFake = require('./auth-fake.routes');
// app.use('/api/auth', authFake);

const express = require('express');
const router = express.Router();

const user = {
  id: 'local-admin',
  nome: 'Seller Smart Cosméticos',
  seller: 'Smart Cosméticos',
  role: 'ADMIN'
};

router.post('/request-code', (req, res) => res.json({ ok: true, codigo: '123456' }));
router.post('/send-code', (req, res) => res.json({ ok: true, codigo: '123456' }));
router.post('/login/request', (req, res) => res.json({ ok: true, codigo: '123456' }));
router.post('/otp/send', (req, res) => res.json({ ok: true, codigo: '123456' }));
router.post('/sms', (req, res) => res.json({ ok: true, codigo: '123456' }));

router.post('/verify-code', (req, res) => res.json({ ok: true, token: 'smart-local-token-2026', user }));
router.post('/verify', (req, res) => res.json({ ok: true, token: 'smart-local-token-2026', user }));
router.post('/login/verify', (req, res) => res.json({ ok: true, token: 'smart-local-token-2026', user }));
router.post('/otp/verify', (req, res) => res.json({ ok: true, token: 'smart-local-token-2026', user }));
router.post('/login', (req, res) => res.json({ ok: true, token: 'smart-local-token-2026', user }));

router.get('/me', (req, res) => res.json({ ok: true, user }));
router.post('/logout', (req, res) => res.json({ ok: true }));

module.exports = router;
