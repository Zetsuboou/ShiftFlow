require('dotenv').config();
const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
    try {
        console.log('Reading schema file...')

        //Reads the schema file
        const schemaSQL = fs.readFileSync(
            path.join(__dirname, 'schema.sql'),
            'utf-8'
        );

        console.log('Creating tables...')

        //Execute the schema
        await pool.query(schemaSQL);

        console.log('Database tables have been created successfully');
        console.log('Tables created: employees, shifts, time_of_requests, availabilities');
        process.exit(0);

    } catch (error) {
        console.error("Error setting up Database table", error);
        process.exit(1)
    }
}

setupDatabase()