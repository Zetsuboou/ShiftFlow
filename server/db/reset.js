const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../config/database');
const fs = require('fs');

async function resetDatabase() {
  try {
    console.log('Dropping existing tables...');
    
    // Drop all tables in reverse order (handle foreign keys)
    await pool.query('DROP TABLE IF EXISTS availability CASCADE');
    await pool.query('DROP TABLE IF EXISTS time_off_requests CASCADE');
    await pool.query('DROP TABLE IF EXISTS shifts CASCADE');
    await pool.query('DROP TABLE IF EXISTS employees CASCADE');
    
    console.log('All old tables dropped');
    
    console.log('Creating new tables...');
    
    // Read and execute schema
    const schemaSQL = fs.readFileSync(
      path.join(__dirname, 'schema.sql'), 
      'utf-8'
    );
    
    await pool.query(schemaSQL);
    
    console.log('Database reset complete!');
    console.log('All tables recreated fresh.');
    process.exit(0);
    
  } catch (error) {
    console.error('Error resetting database:', error);
    process.exit(1);
  }
}

resetDatabase();