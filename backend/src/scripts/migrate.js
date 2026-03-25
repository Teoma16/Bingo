const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');

async function migrate() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, '../../../database/schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✅ Database migration completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();