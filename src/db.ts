/**
 * Database Layer
 * 
 * Manages all database operations for Plaid integration:
 * - Items (connections) management
 * - Transaction storage with soft delete support
 * - Sync cursor management for incremental syncing
 * 
 * Uses PostgreSQL connection pooling for efficient database access.
 */

import { Pool } from 'pg';
import { Item, Transaction, SyncCursor } from './types';

import * as dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'test_task'
});

/**
 * Database class for managing Plaid items, transactions, and sync cursors.
 * 
 * This class handles all database operations including:
 * - Table initialization and schema management
 * - Item (connection) CRUD operations
 * - Transaction upserts with soft delete support
 * - Sync cursor management for incremental transaction syncing
 */
class DB {
  
  /**
   * Initializes all required database tables if they don't exist.
   * 
   * Creates:
   * - items: Stores Plaid connections (items) with access tokens and region info
   * - transactions: Stores transaction data with soft delete support
   * - sync_cursors: Stores sync cursors for incremental transaction fetching
   * 
   * Also creates indexes for optimal query performance.
   */
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
  
  /**
   * Saves or updates a Plaid item (connection) in the database.
   * 
   * Uses UPSERT (ON CONFLICT) to update existing items or insert new ones.
   * Updates access_token, region, and status if the item already exists.
   * 
   * @param item - Item object containing connection details
   */
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

  /**
   * Retrieves an item from the database by item_id.
   * 
   * @param itemId - The Plaid item ID
   * @returns Item object if found, undefined otherwise
   */
  async getItem(itemId: string): Promise<Item | undefined> {
    const query = 'SELECT * FROM items WHERE item_id = $1';
    const res = await pool.query(query, [itemId]);
    return res.rows[0] as Item | undefined;
  }

  /**
   * Updates the status of an item (e.g., when login is required).
   * 
   * Used when Plaid sends LOGIN_REQUIRED or ERROR webhooks to mark
   * that the user needs to re-authenticate their connection.
   * 
   * @param itemId - The Plaid item ID to update
   * @param status - New status ('active' or 'login_required')
   */
  async updateItemStatus(itemId: string, status: 'active' | 'login_required'): Promise<void> {
    const query = 'UPDATE items SET status = $1, updated_at = NOW() WHERE item_id = $2';
    await pool.query(query, [status, itemId]);
  }

  /**
   * Upserts transactions into the database (inserts new or updates existing).
   * 
   * Uses a transaction (BEGIN/COMMIT) to ensure atomicity. If a transaction
   * with the same transaction_id already exists, it updates the fields.
   * 
   * @param txs - Array of transaction objects to upsert
   */
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

  /**
   * Upserts transactions with soft delete support.
   * 
   * This method is used during transaction sync. If a transaction was
   * previously soft-deleted (deleted_at set) and is re-added by Plaid,
   * this clears the deleted_at field, effectively "un-deleting" it.
   * 
   * This ensures sync continues to work correctly even when transactions
   * are temporarily removed and then re-added.
   * 
   * @param txs - Array of transaction objects to upsert
   */
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

  /**
   * Soft deletes transactions by setting deleted_at timestamp.
   * 
   * Soft delete preserves transaction data in the database while marking
   * them as deleted. This allows:
   * - Sync to continue working (transactions can be re-added)
   * - Audit trail of deleted transactions
   * - Ability to restore transactions if needed
   * 
   * Only updates transactions that aren't already soft-deleted.
   * 
   * @param transactionIds - Array of transaction IDs to soft delete
   */
  async softDeleteTransactions(transactionIds: string[]): Promise<void> {
    if (transactionIds.length === 0) return;
    await pool.query(
      'UPDATE transactions SET deleted_at = NOW(), updated_at = NOW() WHERE transaction_id = ANY($1::text[]) AND deleted_at IS NULL',
      [transactionIds]
    );
  }

  /**
   * Retrieves transactions for a specific item.
   * 
   * By default, excludes soft-deleted transactions. Set includeDeleted=true
   * to include all transactions including deleted ones.
   * 
   * @param itemId - The Plaid item ID
   * @param includeDeleted - Whether to include soft-deleted transactions (default: false)
   * @returns Array of transaction objects, ordered by date descending
   */
  async getTransactions(itemId: string, includeDeleted: boolean = false): Promise<Transaction[]> {
    const query = includeDeleted 
      ? 'SELECT * FROM transactions WHERE item_id = $1 ORDER BY date DESC'
      : 'SELECT * FROM transactions WHERE item_id = $1 AND deleted_at IS NULL ORDER BY date DESC';
    const res = await pool.query(query, [itemId]);
    return res.rows as Transaction[];
  }

  /**
   * Retrieves the sync cursor for an item.
   * 
   * The cursor is used for incremental transaction syncing. It tracks
   * the last position in the transaction stream, allowing efficient
   * delta updates instead of full re-syncs.
   * 
   * @param itemId - The Plaid item ID
   * @returns The cursor string if found, undefined otherwise
   */
  async getCursor(itemId: string): Promise<string | undefined> {
    const res = await pool.query('SELECT next_cursor FROM sync_cursors WHERE item_id = $1', [itemId]);
    return res.rows[0]?.next_cursor;
  }

  /**
   * Saves or updates the sync cursor for an item.
   * 
   * The cursor is saved after each successful transaction sync batch
   * to enable incremental syncing on subsequent syncs.
   * 
   * @param itemId - The Plaid item ID
   * @param cursor - The cursor string from Plaid's sync response
   */
  async saveCursor(itemId: string, cursor: string): Promise<void> {
    await pool.query(
      'INSERT INTO sync_cursors (item_id, next_cursor) VALUES ($1, $2) ON CONFLICT (item_id) DO UPDATE SET next_cursor = EXCLUDED.next_cursor, updated_at = NOW()',
      [itemId, cursor]
    );
  }
  
  /**
   * Returns a summary of database state (counts of items, transactions, cursors).
   * 
   * Useful for debugging and monitoring. Returns zero counts on error
   * to prevent breaking the caller.
   * 
   * @returns Object with counts of items, transactions, and cursors
   */
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
