const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const pool = require('../config/database');
const fs = require('fs');

async function resetDatabase() {
    try {
        console.log('Dropping existing tables...');

        //Drops all tables in reverse order (to handle foreign keys);
        await pool.query('DROP TABLE IF EXISTS availability CASCADE');
        await pool.query('DROP TABLE IF EXISTS time_off_requests CASCADE')
        await pool.query('DROP TABLE IF EXISTS shifts CASCADE');
        await pool.query('DROP TABLE IF EXISTS employees CASCADE');

        console.log('All tables been dropped');
        console.log('Creating new tables...')


        //Execute the schema 
        const schemaSQL = fs.readFileSync(
            path.join(__dirname, 'schema.sql'),
            'utf-8'
        );

        await pool.query(schemaSQL);

        console.log('Database reset successfully!');
        console.log('All tables recreated')
        process.exit(0)

    } catch (error) {
        console.error("Error resetting Database table", error)
        process.exit(1)
    }
}

resetDatabase()