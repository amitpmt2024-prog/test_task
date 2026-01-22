// Database initialization script
// Run this to create all required tables: npm run init-db

import { db } from '../src/db';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function initializeDatabase() {
  try {
    await db.initializeTables();
    process.exit(0);
  } catch (error: any) {
    process.exit(1);
  }
}

initializeDatabase();
