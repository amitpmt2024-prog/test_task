import { SQSHandler } from 'aws-lambda';
import { plaidClient } from './plaidClient';
import { db } from './db';
import { TransactionsSyncPayload } from './types';

// Worker logic to handle transaction sync
// Triggered by SQS
export const transactionWorker: SQSHandler = async (event) => {
  for (const record of event.Records) {
      const jobPayload: TransactionsSyncPayload = JSON.parse(record.body);
      const { item_id } = jobPayload;
      
      console.log(`[Worker] Starting sync for ${item_id}`);

      // 1. Get Access Token
      const item = await db.getItem(item_id);
      if (!item) {
          console.error(`[Worker] Item ${item_id} not found`);
          continue;
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
        
        // 4. Process added/modified/removed
        const newTransactions = data.added.map((tx: any) => ({
            transaction_id: tx.transaction_id,
            item_id: item_id,
            account_id: tx.account_id,
            amount: tx.amount,
            currency: tx.iso_currency_code,
            date: tx.date,
            name: tx.name,
            merchant_name: tx.merchant_name
        }));

        await db.upsertTransactions(newTransactions);
        
        // 4b. Process removed
        if (data.removed && data.removed.length > 0) {
            for (const removedTx of (data.removed as any[])) {
                await db.deleteTransaction(removedTx.transaction_id);
            }
        }

        // 5. Update Cursor
        cursor = data.next_cursor;
        await db.saveCursor(item_id, cursor);
        
        hasMore = data.has_more;
      }
      
      console.log(`[Worker] Sync complete for ${item_id}`);
  }
};
