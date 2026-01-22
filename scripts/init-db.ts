// Database initialization script
// Run this to create all required tables: npm run init-db

import { db } from '../src/db';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function initializeDatabase() {
  try {
    console.log('🚀 Initializing database tables...\n');
    await db.initializeTables();
    console.log('\n✅ Database initialization completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Database initialization failed:');
    console.error(error.message);
    console.error('\nPlease check:');
    console.error('1. Database is running');
    console.error('2. Database credentials in .env are correct');
    console.error('3. Database "test_task" exists (or create it first)');
    process.exit(1);
  }
}

initializeDatabase();
