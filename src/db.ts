import { Pool } from 'pg';
import { Item, Transaction, SyncCursor } from './types';

import * as dotenv from 'dotenv';
dotenv.config();

// PostgreSQL Configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'test_task'
});

class DB {
  
  async initializeTables(): Promise<void> {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS items (
          item_id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          access_token VARCHAR(255) NOT NULL,
          institution_id VARCHAR(255),
          region VARCHAR(10),
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS transactions (
          transaction_id VARCHAR(255) PRIMARY KEY,
          item_id VARCHAR(255) REFERENCES items(item_id),
          account_id VARCHAR(255) NOT NULL,
          amount DECIMAL(10, 2) NOT NULL,
          currency VARCHAR(3) NOT NULL,
          date DATE NOT NULL,
          name VARCHAR(255),
          merchant_name VARCHAR(255),
          pending BOOLEAN DEFAULT FALSE,
          category JSONB,
          payment_channel VARCHAR(50),
          deleted_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sync_cursors (
          item_id VARCHAR(255) PRIMARY KEY REFERENCES items(item_id),
          next_cursor VARCHAR(255),
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_transactions_item_id ON transactions(item_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
        CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
        CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON transactions(deleted_at) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS idx_transactions_item_date ON transactions(item_id, date);
      `);
      console.log('[DB] Tables initialized');
    } catch (err) {
      console.error('[DB] Error initializing tables:', err);
      throw err;
    }
  }
  
  async saveItem(item: Item): Promise<void> {
    const query = `
      INSERT INTO items (item_id, user_id, access_token, institution_id, region, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (item_id) DO UPDATE 
      SET access_token = EXCLUDED.access_token, region = EXCLUDED.region, status = EXCLUDED.status, updated_at = NOW();
    `;
    const values = [
      item.item_id, 
      item.user_id, 
      item.access_token, 
      item.institution_id ?? null, 
      item.region ?? null, 
      item.status, 
      item.created_at
    ];
    
    await pool.query(query, values);
  }

  async getItem(itemId: string): Promise<Item | undefined> {
    const query = 'SELECT * FROM items WHERE item_id = $1';
    const res = await pool.query(query, [itemId]);
    return res.rows[0] as Item | undefined;
  }

  async updateItemStatus(itemId: string, status: 'active' | 'login_required'): Promise<void> {
    const query = 'UPDATE items SET status = $1, updated_at = NOW() WHERE item_id = $2';
    await pool.query(query, [status, itemId]);
  }

  async upsertTransactions(txs: Transaction[]): Promise<void> {
    if (txs.length === 0) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const query = `
        INSERT INTO transactions (transaction_id, item_id, account_id, amount, currency, date, name, merchant_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (transaction_id) DO UPDATE 
        SET amount = EXCLUDED.amount, currency = EXCLUDED.currency, date = EXCLUDED.date, name = EXCLUDED.name, merchant_name = EXCLUDED.merchant_name;
      `;

      await Promise.all(txs.map(tx => 
        client.query(query, [tx.transaction_id, tx.item_id, tx.account_id, tx.amount, tx.currency, tx.date, tx.name, tx.merchant_name || null])
      ));
      
      await client.query('COMMIT');
      console.log(`[DB] Upserted ${txs.length} transactions`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[DB] Error upserting transactions:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  // Upsert transactions with soft delete support
  // If a transaction was previously soft-deleted and is re-added, clear deleted_at
  async upsertTransactionsWithSoftDelete(txs: Transaction[]): Promise<void> {
    if (txs.length === 0) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const query = `
        INSERT INTO transactions (
          transaction_id, item_id, account_id, amount, currency, date, 
          name, merchant_name, pending, category, payment_channel, deleted_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL)
        ON CONFLICT (transaction_id) DO UPDATE 
        SET 
          amount = EXCLUDED.amount, 
          currency = EXCLUDED.currency, 
          date = EXCLUDED.date, 
          name = EXCLUDED.name, 
          merchant_name = EXCLUDED.merchant_name,
          pending = EXCLUDED.pending,
          category = EXCLUDED.category,
          payment_channel = EXCLUDED.payment_channel,
          deleted_at = NULL,
          updated_at = NOW();
      `;

      await Promise.all(txs.map(tx => 
        client.query(query, [
          tx.transaction_id, tx.item_id, tx.account_id, tx.amount, tx.currency, tx.date,
          tx.name, tx.merchant_name || null, tx.pending || false,
          tx.category ? JSON.stringify(tx.category) : null, tx.payment_channel || null
        ])
      ));
      
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async softDeleteTransactions(transactionIds: string[]): Promise<void> {
    if (transactionIds.length === 0) return;
    await pool.query(
      'UPDATE transactions SET deleted_at = NOW(), updated_at = NOW() WHERE transaction_id = ANY($1::text[]) AND deleted_at IS NULL',
      [transactionIds]
    );
  }

  async getTransactions(itemId: string, includeDeleted: boolean = false): Promise<Transaction[]> {
    const query = includeDeleted 
      ? 'SELECT * FROM transactions WHERE item_id = $1 ORDER BY date DESC'
      : 'SELECT * FROM transactions WHERE item_id = $1 AND deleted_at IS NULL ORDER BY date DESC';
    const res = await pool.query(query, [itemId]);
    return res.rows as Transaction[];
  }

  async getCursor(itemId: string): Promise<string | undefined> {
    const res = await pool.query('SELECT next_cursor FROM sync_cursors WHERE item_id = $1', [itemId]);
    return res.rows[0]?.next_cursor;
  }

  async saveCursor(itemId: string, cursor: string): Promise<void> {
    await pool.query(
      'INSERT INTO sync_cursors (item_id, next_cursor) VALUES ($1, $2) ON CONFLICT (item_id) DO UPDATE SET next_cursor = EXCLUDED.next_cursor, updated_at = NOW()',
      [itemId, cursor]
    );
  }
  
  async dumpState() {
    try {
      const [itemsRes, txRes, cursorRes] = await Promise.all([
        pool.query('SELECT COUNT(*) FROM items'),
        pool.query('SELECT COUNT(*) FROM transactions'),
        pool.query('SELECT COUNT(*) FROM sync_cursors')
      ]);
      return {
        itemsCount: parseInt(itemsRes.rows[0].count),
        transactionsCount: parseInt(txRes.rows[0].count),
        cursors: parseInt(cursorRes.rows[0].count)
      };
    } catch (err) {
      console.error('[DB] Error dumping state:', err);
      return { itemsCount: 0, transactionsCount: 0, cursors: 0 };
    }
  }
}

export const db = new DB();
