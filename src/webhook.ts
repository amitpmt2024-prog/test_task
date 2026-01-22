import { APIGatewayProxyHandler } from 'aws-lambda';
import { db } from './db';
import { backgroundQueue } from './mockQueue';
import { PlaidWebhookBody } from './types';

// Lambda Handler for Plaid webhooks
export const handleWebhook: APIGatewayProxyHandler = async (event) => {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing request body' })
      };
    }

    const payload = JSON.parse(event.body) as PlaidWebhookBody;
    const webhookType = payload.webhook_type;
    const webhookCode = payload.webhook_code;
    const itemId = payload.item_id;

    // Quick validation - check if item exists (synchronous, fast)
    const item = await db.getItem(itemId);
    if (!item) {
      console.error(`[Webhook] Item ${itemId} not found in database`);
      return {
        statusCode: 200, // Still return 200 to Plaid (don't cause retries)
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          received: true,
          processed: false,
          error: `Item ${itemId} not found`,
          webhook_type: webhookType,
          webhook_code: webhookCode
        })
      };
    }

    // Determine what action will be taken
    let action = 'unknown';
    if (webhookType === 'TRANSACTIONS') {
      if (webhookCode === 'SYNC_UPDATES_AVAILABLE' || webhookCode === 'DEFAULT_UPDATE' || webhookCode === 'INITIAL_UPDATE') {
        action = 'trigger_transaction_sync';
      } else if (webhookCode === 'TRANSACTIONS_REMOVED') {
        const removedCount = payload.removed_transactions?.length || 0;
        action = `soft_delete_${removedCount}_transactions`;
      }
    } else if (webhookType === 'ITEM') {
      if (webhookCode === 'LOGIN_REQUIRED') {
        action = 'update_item_status_to_login_required';
      } else if (webhookCode === 'NEW_ACCOUNTS_AVAILABLE') {
        const newAccountsCount = payload.new_accounts?.length || 0;
        action = `process_${newAccountsCount}_new_accounts`;
      } else if (webhookCode === 'ERROR') {
        action = 'handle_item_error';
      }
    }

    console.log(`[Webhook] Received ${webhookType}.${webhookCode} for item ${itemId} - Action: ${action}`);

    // Return response with processing details (still fast, < 500ms)
    const response = {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        received: true,
        processed: true,
        webhook_type: webhookType,
        webhook_code: webhookCode,
        item_id: itemId,
        action: action,
        message: `Webhook received and queued for processing: ${action}`
      })
    };

    // Process webhook asynchronously (don't await - heavy work happens in background)
    processWebhookAsync(event).catch(error => {
      console.error('[Webhook] Async processing error:', error);
      // Log to monitoring service (CloudWatch, DataDog, etc.)
    });

    return response;
  } catch (error: any) {
    console.error('[Webhook] Error handling webhook:', error);
    // Still return 200 to Plaid to prevent retries
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        received: true,
        processed: false,
        error: error.message || 'Unknown error',
        message: 'Webhook received but processing failed'
      })
    };
  }
};

// Async webhook processing (runs in background)
async function processWebhookAsync(event: any): Promise<void> {
  try {
    if (!event.body) {
      console.error('[Webhook] Missing body');
      return;
    }

    const payload = JSON.parse(event.body) as PlaidWebhookBody;
    const webhookType = payload.webhook_type;
    const webhookCode = payload.webhook_code;
    const itemId = payload.item_id;

    console.log(`[Webhook] Processing ${webhookType}.${webhookCode} for item ${itemId}`);

    // 1. Verify webhook signature (Production implementation)
    // const verificationHeader = event.headers['plaid-verification'];
    // if (!verificationHeader) {
    //   throw new Error('Missing Plaid verification header');
    // }
    // const verificationKey = await plaidClient.webhookVerificationKeyGet({
    //   key_id: payload.webhook_verification_key_id
    // });
    // verifyWebhookSignature(verificationHeader, payload, verificationKey);

    // 2. Verify item exists
    const item = await db.getItem(itemId);
    if (!item) {
      console.error(`[Webhook] Item ${itemId} not found in database`);
      return;
    }

    // 3. Handle different webhook types
    switch (webhookType) {
      case 'TRANSACTIONS':
        await handleTransactionsWebhook(webhookCode, itemId, payload);
        break;

      case 'ITEM':
        await handleItemWebhook(webhookCode, itemId, payload, item);
        break;

      default:
        console.log(`[Webhook] Unhandled webhook type: ${webhookType}`);
    }

  } catch (error) {
    console.error('[Webhook] Processing error:', error);
    throw error; // Re-throw for monitoring
  }
}

// Handle TRANSACTIONS webhooks
async function handleTransactionsWebhook(
  webhookCode: string,
  itemId: string,
  payload: PlaidWebhookBody
): Promise<void> {
  switch (webhookCode) {
    case 'SYNC_UPDATES_AVAILABLE':
    case 'DEFAULT_UPDATE':
    case 'INITIAL_UPDATE':
      // Trigger transaction sync in background
      console.log(`[Webhook] TRANSACTIONS.UPDATED - Triggering sync for ${itemId}`);
      await backgroundQueue.sendMessage({
        type: 'SYNC_TRANSACTIONS',
        payload: { item_id: itemId }
      });
      break;

    case 'TRANSACTIONS_REMOVED':
      // Handle removed transactions
      const removedTransactionIds = payload.removed_transactions || [];
      console.log(`[Webhook] TRANSACTIONS_REMOVED for ${itemId} - Removing ${removedTransactionIds.length} transactions`);
      if (removedTransactionIds.length > 0) {
        // Soft delete removed transactions
        await db.softDeleteTransactions(removedTransactionIds);
        console.log(`[Webhook] ✅ Successfully soft-deleted ${removedTransactionIds.length} transactions`);
      } else {
        console.log(`[Webhook] ⚠️  No transactions to remove (removed_transactions array is empty)`);
      }
      break;

    default:
      console.log(`[Webhook] Unhandled TRANSACTIONS webhook code: ${webhookCode}`);
  }
}

// Handle ITEM webhooks
async function handleItemWebhook(
  webhookCode: string,
  itemId: string,
  payload: PlaidWebhookBody,
  item: any
): Promise<void> {
  switch (webhookCode) {
    case 'LOGIN_REQUIRED':
      // Mark connection as requiring re-authentication
      console.log(`[Webhook] ITEM.LOGIN_REQUIRED - Marking item ${itemId} as login_required`);
      await db.updateItemStatus(itemId, 'login_required');
      
      // Update connection state - token needs refresh
      // In production, you would:
      // 1. Send notification to user (push, email, in-app)
      // 2. Update UI to show "Reconnect" button
      // 3. Log event for analytics
      console.log(`[Webhook] User ${item.user_id} needs to re-authenticate item ${itemId}`);
      break;

    case 'NEW_ACCOUNTS_AVAILABLE':
      // New accounts are available - user can add them
      console.log(`[Webhook] ITEM.NEW_ACCOUNTS_AVAILABLE - New accounts available for ${itemId}`);
      
      // Get new account IDs from payload
      const newAccountIds = payload.new_accounts || [];
      
      if (newAccountIds.length > 0) {
        // Delegate to background worker to fetch and store new accounts
        await backgroundQueue.sendMessage({
          type: 'ADD_NEW_ACCOUNTS',
          payload: {
            item_id: itemId,
            account_ids: newAccountIds
          }
        });
      }
      
      // Notify user about new accounts
      // In production, you would:
      // 1. Send push notification: "New accounts available! Add them now?"
      // 2. Show in-app notification
      // 3. Provide UI to add accounts via Plaid Link in "update" mode
      console.log(`[Webhook] User ${item.user_id} has ${newAccountIds.length} new accounts available`);
      break;

    case 'ERROR':
      // Item error occurred
      console.error(`[Webhook] ITEM.ERROR for ${itemId}:`, payload.error);
      await db.updateItemStatus(itemId, 'login_required'); // Mark as needing attention
      break;

    case 'PENDING_EXPIRATION':
      // Access token will expire soon
      console.log(`[Webhook] ITEM.PENDING_EXPIRATION - Access token expiring soon for ${itemId}`);
      // In production, you would proactively refresh the token or notify user
      break;

    default:
      console.log(`[Webhook] Unhandled ITEM webhook code: ${webhookCode}`);
  }
}
