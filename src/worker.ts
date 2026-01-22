import { SQSHandler } from 'aws-lambda';
import { plaidClient } from './plaidClient';
import { db } from './db';
import { TransactionsSyncPayload, QueueMessage, Account } from './types';

// Worker logic to handle transaction sync
// Triggered by SQS
export const transactionWorker: SQSHandler = async (event) => {
  for (const record of event.Records) {
      const message: QueueMessage = JSON.parse(record.body);
      
      // Route to appropriate handler based on message type
      if (message.type === 'SYNC_TRANSACTIONS') {
        await handleTransactionSync(message.payload as TransactionsSyncPayload);
      } else if (message.type === 'ADD_NEW_ACCOUNTS') {
        await handleAddNewAccounts(message.payload);
      } else {
        console.error(`[Worker] Unknown message type: ${message.type}`);
      }
  }
};

// Handle transaction sync
async function handleTransactionSync(payload: TransactionsSyncPayload): Promise<void> {
  const { item_id } = payload;
      
  console.log(`[Worker] Starting sync for ${item_id}`);

  // 1. Get Access Token
  const item = await db.getItem(item_id);
  if (!item) {
    console.error(`[Worker] Item ${item_id} not found`);
    return; // Return early if item not found
  }

  // 2. Get Cursor
  let cursor = await db.getCursor(item_id);

  // 3. Call Plaid Sync
  let hasMore = true;
  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: item.access_token,
      cursor: cursor
    });

    const data = response.data;
    
    // 4. Process added/modified transactions
    // Combine added and modified (both need to be upserted)
    const allTransactions = [...data.added, ...data.modified].map((tx: any) => ({
      transaction_id: tx.transaction_id,
      item_id: item_id,
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

    // Use upsert with soft delete support (clears deleted_at if transaction is re-added)
    await db.upsertTransactionsWithSoftDelete(allTransactions);
    
    // 4b. Process removed transactions (soft delete)
    if (data.removed && data.removed.length > 0) {
      const removedIds = data.removed.map((tx: any) => tx.transaction_id);
      await db.softDeleteTransactions(removedIds);
      console.log(`[Worker] Soft deleted ${removedIds.length} transactions`);
    }

    // 5. Update Cursor
    cursor = data.next_cursor;
    await db.saveCursor(item_id, cursor);
    
    hasMore = data.has_more;
  }
  
  console.log(`[Worker] Sync complete for ${item_id}`);
}

// Handle adding new accounts (for NEW_ACCOUNTS_AVAILABLE webhook)
async function handleAddNewAccounts(payload: { item_id: string; account_ids?: string[] }): Promise<void> {
  const { item_id, account_ids } = payload;
  
  console.log(`[Worker] Adding new accounts for item ${item_id}`);
  
  // 1. Get item to retrieve access token
  const item = await db.getItem(item_id);
  if (!item) {
    console.error(`[Worker] Item ${item_id} not found`);
    return;
  }

  // 2. Fetch accounts from Plaid
  // In real implementation, you would call:
  // const accountsResponse = await plaidClient.accountsGet({
  //   access_token: item.access_token
  // });
  
  // For now, mock the response
  const mockAccounts = account_ids?.map(accId => ({
    account_id: accId,
    name: `Account ${accId}`,
    type: 'depository',
    subtype: 'checking',
    mask: '0000',
    balances: {
      current: 1000.00,
      iso_currency_code: 'USD'
    }
  })) || [];

  // 3. Store new accounts in database
  // In production, you would have an accounts table
  // For this implementation, we'll just log them
  console.log(`[Worker] Found ${mockAccounts.length} new accounts for item ${item_id}`);
  
  for (const account of mockAccounts) {
    console.log(`[Worker] New account available: ${account.account_id} - ${account.name}`);
    // In production: await db.saveAccount({ item_id, ...account });
  }

  // 4. Notify user (in production, send push notification, email, etc.)
  console.log(`[Worker] User ${item.user_id} has ${mockAccounts.length} new accounts available`);
  console.log(`[Worker] In production: Send notification to user to add accounts via Plaid Link`);
}
