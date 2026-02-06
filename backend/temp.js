const sqlite3 = require('sqlite3').verbose(); const db = new sqlite3.Database('./data/bankly-test.db'); db.all('SELECT name FROM sqlite_master WHERE type=\
table\', (err, rows) => { console.log(rows); db.close(); });
