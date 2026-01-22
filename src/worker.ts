/**
 * Transaction Worker
 * 
 * Background worker that processes queued jobs for:
 * - Transaction synchronization from Plaid
 * - Processing newly available accounts
 * 
 * Uses region-specific Plaid clients based on the item's stored region.
 */

import { SQSHandler } from 'aws-lambda';
import { getPlaidClient } from './plaidClient';
import { db } from './db';
import { TransactionsSyncPayload, QueueMessage } from './types';

/**
 * Lambda worker handler that processes messages from the background queue.
 * 
 * This worker handles two types of messages:
 * - SYNC_TRANSACTIONS: Syncs transactions from Plaid for a specific item
 * - ADD_NEW_ACCOUNTS: Fetches and processes newly available accounts
 * 
 * @param event - SQS event containing one or more messages to process
 */
export const transactionWorker: SQSHandler = async (event) => {
  for (const record of event.Records) {
    const message: QueueMessage = JSON.parse(record.body);
    if (message.type === 'SYNC_TRANSACTIONS') {
      await handleTransactionSync(message.payload as TransactionsSyncPayload);
    } else if (message.type === 'ADD_NEW_ACCOUNTS') {
      await handleAddNewAccounts(message.payload);
    } else {
      console.error(`[Worker] Unknown message type: ${message.type}`);
    }
  }
};

/**
 * Syncs transactions from Plaid for a specific item using cursor-based pagination.
 * 
 * This function:
 * - Retrieves the item and its region from the database
 * - Uses the region-specific Plaid client
 * - Fetches transactions in batches using the sync cursor
 * - Upserts new/modified transactions and soft-deletes removed ones
 * - Updates the sync cursor for the next sync
 * 
 * The sync continues until Plaid indicates no more data is available (has_more = false).
 * 
 * @param payload - Contains item_id to sync transactions for
 */
async function handleTransactionSync(payload: TransactionsSyncPayload): Promise<void> {
  const { item_id } = payload;
  const item = await db.getItem(item_id);
  if (!item) {
    console.error(`[Worker] Item ${item_id} not found`);
    return;
  }

  const region = (item.region || 'US') as 'US' | 'CA' | 'EU';
  const client = getPlaidClient(region);

  let cursor = await db.getCursor(item_id);
  let hasMore = true;

  while (hasMore) {
    const response = await client.transactionsSync({
      access_token: item.access_token,
      cursor: cursor || undefined
    });

    const { added, modified, removed, next_cursor, has_more } = response.data;
    
    const allTransactions = [...added, ...modified].map((tx: any) => ({
      transaction_id: tx.transaction_id,
      item_id,
      account_id: tx.account_id,
      amount: tx.amount,
      currency: tx.iso_currency_code || tx.unofficial_currency_code || 'USD',
      date: tx.date,
      name: tx.name,
      merchant_name: tx.merchant_name,
      pending: tx.pending || false,
      category: tx.category || null,
      payment_channel: tx.payment_channel || null
    }));

    await db.upsertTransactionsWithSoftDelete(allTransactions);
    
    if (removed?.length > 0) {
      await db.softDeleteTransactions(removed.map((tx: any) => tx.transaction_id));
    }

    cursor = next_cursor;
    await db.saveCursor(item_id, cursor);
    hasMore = has_more;
  }
  
  console.log(`[Worker] Sync complete for ${item_id}`);
}

/**
 * Processes newly available accounts for an item.
 * 
 * When a user's bank adds new accounts (e.g., they opened a new account),
 * Plaid sends a NEW_ACCOUNTS_AVAILABLE webhook. This function:
 * - Fetches all accounts from Plaid using the region-specific client
 * - Filters to only new accounts if account_ids are provided
 * - Logs account details for notification purposes
 * 
 * In production, this would typically save accounts to a database and
 * send notifications to the user.
 * 
 * @param payload - Contains item_id and optional list of new account_ids
 */
async function handleAddNewAccounts(payload: { item_id: string; account_ids?: string[] }): Promise<void> {
  const { item_id, account_ids } = payload;
  const item = await db.getItem(item_id);
  if (!item) {
    console.error(`[Worker] Item ${item_id} not found`);
    return;
  }

  try {
    const region = (item.region || 'US') as 'US' | 'CA' | 'EU';
    const client = getPlaidClient(region);
    const resp = await client.accountsGet({ access_token: item.access_token });
    let accounts = resp.data.accounts;
    
    if (account_ids && account_ids.length > 0) {
      accounts = accounts.filter(acc => account_ids.includes(acc.account_id));
    }

    for (const acc of accounts) {
      const bal = acc.balances?.current || 0;
      const curr = acc.balances?.iso_currency_code || acc.balances?.unofficial_currency_code || 'USD';
      console.log(`[Worker] New account: ${acc.account_id} - ${acc.name} (${acc.type}/${acc.subtype}) - ${curr} ${bal}`);
    }

    console.log(`[Worker] User ${item.user_id} has ${accounts.length} new account(s) available`);
  } catch (err: any) {
    console.error(`[Worker] Error fetching accounts:`, err?.response?.data || err?.message);
    throw err;
  }
}
