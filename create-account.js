
const fs = require('fs');
const path = require('path');
const { hashPassword } = require('./auth');

const [, , username, password] = process.argv;

if (!username || !password) {
  console.log('Cara pakai: node create-account.js <username> <password>');
  process.exit(1);
}
if (password.length < 6) {
  console.log('Password minimal 6 karakter.');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

let users = [];
if (fs.existsSync(USERS_FILE)) {
  try {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    users = [];
  }
}

const existing = users.find(u => u.username.toLowerCase() === username.toLowerCase());
if (existing) {
  existing.passwordHash = hashPassword(password);
  console.log('Password untuk akun "' + username + '" berhasil diperbarui.');
} else {
  users.push({
    username,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  });
  console.log('Akun "' + username + '" berhasil dibuat.');
}

fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
console.log('Total akun terdaftar sekarang: ' + users.length);
