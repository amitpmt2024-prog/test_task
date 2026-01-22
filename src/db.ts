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
  
  async saveItem(item: Item): Promise<void> {
    const query = `
      INSERT INTO items (item_id, user_id, access_token, institution_id, region, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (item_id) DO UPDATE 
      SET access_token = EXCLUDED.access_token, region = EXCLUDED.region, status = EXCLUDED.status, updated_at = NOW();
    `;
    const values = [item.item_id, item.user_id, item.access_token, item.institution_id || null, item.region || null, item.status, item.created_at];
    
    try {
      await pool.query(query, values);
      console.log(`[DB] Saved Item: ${item.item_id}`);
    } catch (err) {
      console.error('[DB] Error saving item:', err);
      throw err;
    }
  }

  async getItem(itemId: string): Promise<Item | undefined> {
    const query = 'SELECT * FROM items WHERE item_id = $1';
    try {
      const res = await pool.query(query, [itemId]);
      if (res.rows.length > 0) {
        return res.rows[0] as Item;
      }
      return undefined;
    } catch (err) {
      console.error('[DB] Error getting item:', err);
      throw err;
    }
  }

  async updateItemStatus(itemId: string, status: 'active' | 'login_required'): Promise<void> {
    const query = 'UPDATE items SET status = $1, updated_at = NOW() WHERE item_id = $2';
    try {
      await pool.query(query, [status, itemId]);
      console.log(`[DB] Updated Item Status: ${itemId} -> ${status}`);
    } catch (err) {
      console.error('[DB] Error updating item status:', err);
      throw err;
    }
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

      for (const tx of txs) {
        await client.query(query, [
          tx.transaction_id,
          tx.item_id,
          tx.account_id,
          tx.amount,
          tx.currency,
          tx.date,
          tx.name,
          tx.merchant_name || null
        ]);
      }
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
          deleted_at = NULL, -- Clear deleted_at if transaction is re-added
          updated_at = NOW();
      `;

      for (const tx of txs) {
        await client.query(query, [
          tx.transaction_id,
          tx.item_id,
          tx.account_id,
          tx.amount,
          tx.currency,
          tx.date,
          tx.name,
          tx.merchant_name || null,
          tx.pending || false,
          tx.category ? JSON.stringify(tx.category) : null,
          tx.payment_channel || null
        ]);
      }
      await client.query('COMMIT');
      console.log(`[DB] Upserted ${txs.length} transactions (with soft delete support)`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[DB] Error upserting transactions:', err);
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteTransaction(transactionId: string): Promise<void> {
    const query = 'DELETE FROM transactions WHERE transaction_id = $1';
    try {
      await pool.query(query, [transactionId]);
      console.log(`[DB] Deleted Transaction: ${transactionId}`);
    } catch (err) {
      console.error('[DB] Error deleting transaction:', err);
      throw err;
    }
  }

  // Soft delete transactions (marks as deleted without removing from DB)
  // This allows sync to continue working while hiding deleted transactions
  async softDeleteTransactions(transactionIds: string[]): Promise<void> {
    if (transactionIds.length === 0) return;

    const query = `
      UPDATE transactions 
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE transaction_id = ANY($1::text[]) AND deleted_at IS NULL
    `;
    try {
      const result = await pool.query(query, [transactionIds]);
      console.log(`[DB] Soft deleted ${result.rowCount} transactions`);
    } catch (err) {
      console.error('[DB] Error soft deleting transactions:', err);
      throw err;
    }
  }

  // Get transactions (excluding soft-deleted by default)
  async getTransactions(itemId: string, includeDeleted: boolean = false): Promise<Transaction[]> {
    let query = 'SELECT * FROM transactions WHERE item_id = $1';
    const params: any[] = [itemId];
    
    if (!includeDeleted) {
      query += ' AND deleted_at IS NULL';
    }
    
    query += ' ORDER BY date DESC';
    
    try {
      const res = await pool.query(query, params);
      return res.rows as Transaction[];
    } catch (err) {
      console.error('[DB] Error getting transactions:', err);
      throw err;
    }
  }

  async getCursor(itemId: string): Promise<string | undefined> {
    const query = 'SELECT next_cursor FROM sync_cursors WHERE item_id = $1';
    try {
      const res = await pool.query(query, [itemId]);
      return res.rows[0]?.next_cursor;
    } catch (err) {
      console.error('[DB] Error getting cursor:', err);
      throw err;
    }
  }

  async saveCursor(itemId: string, cursor: string): Promise<void> {
    const query = `
      INSERT INTO sync_cursors (item_id, next_cursor)
      VALUES ($1, $2)
      ON CONFLICT (item_id) DO UPDATE 
      SET next_cursor = EXCLUDED.next_cursor, updated_at = NOW();
    `;
    try {
      await pool.query(query, [itemId, cursor]);
      console.log(`[DB] Saved Cursor for ${itemId}: ${cursor}`);
    } catch (err) {
      console.error('[DB] Error saving cursor:', err);
      throw err;
    }
  }
  
  // Method to inspect state for verification (Modified for Real DB)
  async dumpState() {
      try {
          const itemsRes = await pool.query('SELECT COUNT(*) FROM items');
          const txRes = await pool.query('SELECT COUNT(*) FROM transactions');
          const cursorRes = await pool.query('SELECT COUNT(*) FROM sync_cursors');
          
          return {
              itemsCount: parseInt(itemsRes.rows[0].count),
              transactionsCount: parseInt(txRes.rows[0].count),
              cursors: parseInt(cursorRes.rows[0].count) // Simplified for real DB
          };
      } catch (err) {
          console.error('[DB] Error dumping state:', err);
          return { itemsCount: 0, transactionsCount: 0, cursors: 0 };
      }
  }
}

export const db = new DB();
