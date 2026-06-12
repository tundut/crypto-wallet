const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    console.log('🔗 Connected to local SQLite database');
  }
});

// Initialize tables
db.serialize(() => {
  // Wallets table
  db.run(`
    CREATE TABLE IF NOT EXISTS wallets (
      address TEXT PRIMARY KEY,
      totp_secret TEXT,
      encryptedPrivateKey TEXT,
      encryptedMnemonic TEXT,
      iv TEXT,
      failed_attempts INTEGER DEFAULT 0,
      locked_until INTEGER DEFAULT 0
    )
  `);
});

// Wrapper for async queries
const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const getQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

module.exports = {
  db,
  runQuery,
  getQuery
};
