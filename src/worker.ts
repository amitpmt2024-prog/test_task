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
  let cursor: string | undefined = await db.getCursor(item_id);

  // 3. Call Plaid Sync
  let hasMore = true;
  while (hasMore) {
    const response = await plaidClient.transactionsSync({
      access_token: item.access_token,
      cursor: cursor || undefined
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
  
  console.log(`[Worker] Processing new accounts for item ${item_id}`);

  // 1. Get item to retrieve access token
  const item = await db.getItem(item_id);
  if (!item) {
    console.error(`[Worker] Item ${item_id} not found`);
    return;
  }

  try {
    // 2. Fetch ALL accounts from Plaid (to identify new ones)
    console.log(`[Worker] Fetching accounts from Plaid for item ${item_id}`);
    const accountsResponse = await plaidClient.accountsGet({
      access_token: item.access_token
    });

    const allAccounts = accountsResponse.data.accounts;
    console.log(`[Worker] Found ${allAccounts.length} total accounts from Plaid`);

    // 3. Filter to only new accounts (if account_ids provided in webhook)
    let newAccounts = allAccounts;
    if (account_ids && account_ids.length > 0) {
      newAccounts = allAccounts.filter(acc => account_ids.includes(acc.account_id));
      console.log(`[Worker] Filtered to ${newAccounts.length} new accounts from webhook`);
    }

    // 4. Process and log new accounts
    for (const account of newAccounts) {
      const accountInfo = {
        account_id: account.account_id,
        name: account.name,
        type: account.type,
        subtype: account.subtype || null,
        mask: account.mask || null,
        balance: account.balances?.current || 0,
        currency: account.balances?.iso_currency_code || account.balances?.unofficial_currency_code || 'USD'
      };
      
      console.log(`[Worker] ✅ New account available: ${accountInfo.account_id} - ${accountInfo.name} (${accountInfo.type}/${accountInfo.subtype})`);
      console.log(`[Worker]    Balance: ${accountInfo.currency} ${accountInfo.balance}`);
      
      // In production, you would save to accounts table:
      // await db.saveAccount({ item_id, ...accountInfo });
    }

    // 5. Notify user about new accounts
    console.log(`[Worker] 📧 User ${item.user_id} has ${newAccounts.length} new account(s) available`);
    console.log(`[Worker] 💡 In production: Send push notification/email to user`);
    console.log(`[Worker] 💡 User can add accounts via Plaid Link in "update" mode with access_token`);
    
    // Example: To add new accounts, user would:
    // 1. Call /create_link_token with access_token (update mode)
    // 2. Open Plaid Link in update mode
    // 3. Select new accounts to add
    // 4. Complete the flow

  } catch (error: any) {
    console.error(`[Worker] Error fetching accounts from Plaid:`, error);
    console.error(`[Worker] Error details:`, error?.response?.data || error?.message);
    throw error;
  }
}
