import { SQSHandler } from 'aws-lambda';
import { plaidClient } from './plaidClient';
import { db } from './db';
import { TransactionsSyncPayload, QueueMessage } from './types';

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

async function handleTransactionSync(payload: TransactionsSyncPayload): Promise<void> {
  const { item_id } = payload;
  const item = await db.getItem(item_id);
  if (!item) {
    console.error(`[Worker] Item ${item_id} not found`);
    return;
  }

  let cursor = await db.getCursor(item_id);
  let hasMore = true;

  while (hasMore) {
    const response = await plaidClient.transactionsSync({
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

async function handleAddNewAccounts(payload: { item_id: string; account_ids?: string[] }): Promise<void> {
  const { item_id, account_ids } = payload;
  const item = await db.getItem(item_id);
  if (!item) {
    console.error(`[Worker] Item ${item_id} not found`);
    return;
  }

  try {
    const resp = await plaidClient.accountsGet({ access_token: item.access_token });
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
