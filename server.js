// SERVER PRODUÇÃO SEGURA - SMART COSMÉTICOS
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ===== AUTH SIMPLES =====
function authObrigatorio(req, res, next) {
  const token = req.headers.authorization || req.cookies?.auth_token;

  if (!token) {
    if (req.path.endsWith('.html') || req.path === '/') {
      return res.redirect('/login.html');
    }
    return res.status(401).json({ ok:false, erro:'Não autenticado' });
  }

  next();
}

// ===== PUBLICO =====
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/styles', express.static(path.join(__dirname, 'styles')));
app.use('/scripts', express.static(path.join(__dirname, 'scripts')));

// páginas públicas
app.get('/login.html', (req,res)=>res.sendFile(path.join(__dirname,'login.html')));
app.get('/cadastro.html', (req,res)=>res.sendFile(path.join(__dirname,'cadastro.html')));

// ===== PROTEGIDO =====
app.use(authObrigatorio);

// páginas internas
app.use(express.static(__dirname));

// dados protegidos
app.use('/data', express.static(path.join(__dirname, 'data')));
app.use('/data_external', express.static(path.join(__dirname, 'data_external')));

// rota padrão
app.get('/', (req,res)=>res.redirect('/processamento.html'));

app.listen(PORT, ()=>{
  console.log('SERVER SEGURO RODANDO NA PORTA ' + PORT);
});
