// resetar-senha-admin.js
// Execute na raiz do projeto: node resetar-senha-admin.js
// Corrige "Usuário sem senha cadastrada" no login local.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERS_PATH = path.join(process.cwd(), 'data', 'users.json');

function hashSenha(senha, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(senha), salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

if (!fs.existsSync(USERS_PATH)) {
  fs.mkdirSync(path.dirname(USERS_PATH), { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify([], null, 2), 'utf8');
}

const users = JSON.parse(fs.readFileSync(USERS_PATH, 'utf8') || '[]');

let user = users.find(u => String(u.celular || '').replace(/\D/g, '') === '11999999999');

if (!user) {
  user = {
    id: crypto.randomUUID(),
    nome: 'Admin',
    email: 'admin@smart.local',
    celular: '11999999999',
    seller: 'Smart Cosméticos',
    role: 'ADMIN',
    ativo: true,
    criadoEm: new Date().toISOString()
  };
  users.push(user);
}

user.nome = user.nome || 'Admin';
user.email = user.email || 'admin@smart.local';
user.celular = '11999999999';
user.seller = user.seller || 'Smart Cosméticos';
user.role = 'ADMIN';
user.ativo = true;
user.senhaHash = hashSenha('123456');
user.senhaAtualizadaEm = new Date().toISOString();

fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2), 'utf8');

console.log('✅ Senha corrigida com sucesso.');
console.log('Celular: 11999999999');
console.log('Senha: 123456');
