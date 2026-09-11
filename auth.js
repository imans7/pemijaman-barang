// Helper hashing password pakai modul bawaan Node.js (crypto) — tidak perlu
// dependency tambahan seperti bcrypt yang butuh proses compile native.

const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string' || stored.indexOf(':') === -1) return false;
  const [salt, hash] = stored.split(':');
  let hashToCompare;
  try {
    hashToCompare = crypto.scryptSync(password, salt, 64).toString('hex');
  } catch (e) {
    return false;
  }
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(hashToCompare, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { hashPassword, verifyPassword };
