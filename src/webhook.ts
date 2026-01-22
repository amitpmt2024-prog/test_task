/**
 * Webhook Handler
 * 
 * Receives and processes webhooks from Plaid. Implements quick acknowledgment
 * (< 2 seconds) and delegates heavy processing to background workers.
 * 
 * Handles:
 * - TRANSACTIONS webhooks (updates, removals)
 * - ITEM webhooks (login required, new accounts, errors)
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { db } from './db';
import { backgroundQueue } from './mockQueue';
import { PlaidWebhookBody } from './types';

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
    const { webhook_type, webhook_code, item_id } = payload;

    const item = await db.getItem(item_id);
    if (!item) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          received: true, 
          processed: false, 
          error: `Item ${item_id} not found`,
          webhook_type,
          webhook_code
        })
      };
    }

    let action = 'unknown';
    if (webhook_type === 'TRANSACTIONS') {
      if (['SYNC_UPDATES_AVAILABLE', 'DEFAULT_UPDATE', 'INITIAL_UPDATE'].includes(webhook_code)) {
        action = 'trigger_transaction_sync';
      } else if (webhook_code === 'TRANSACTIONS_REMOVED') {
        action = `soft_delete_${payload.removed_transactions?.length || 0}_transactions`;
      }
    } else if (webhook_type === 'ITEM') {
      if (webhook_code === 'LOGIN_REQUIRED') {
        action = 'update_item_status_to_login_required';
      } else if (webhook_code === 'NEW_ACCOUNTS_AVAILABLE') {
        action = `process_${payload.new_accounts?.length || 0}_new_accounts`;
      } else if (webhook_code === 'ERROR') {
        action = 'handle_item_error';
      }
    }

    console.log(`[Webhook] ${webhook_type}.${webhook_code} for item ${item_id} -> ${action}`);

    processWebhookAsync(event).catch(err => console.error('[Webhook] Processing error:', err));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        received: true, 
        processed: true, 
        webhook_type, 
        webhook_code, 
        item_id, 
        action 
      })
    };
  } catch (error: any) {
    console.error('[Webhook] Error:', error);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        received: true, 
        processed: false, 
        error: error.message || 'Unknown error' 
      })
    };
  }
};

/**
 * Processes webhook payload asynchronously in the background.
 * 
 * This function handles the actual webhook processing after the webhook
 * has been acknowledged. It routes to appropriate handlers based on
 * webhook type and code.
 * 
 * @param event - API Gateway event containing the webhook payload
 */
async function processWebhookAsync(event: any): Promise<void> {
  if (!event.body) return;

  const payload = JSON.parse(event.body) as PlaidWebhookBody;
  const { webhook_type, webhook_code, item_id } = payload;

  const item = await db.getItem(item_id);
  if (!item) {
    console.error(`[Webhook] Item ${item_id} not found`);
    return;
  }

  switch (webhook_type) {
    case 'TRANSACTIONS':
      await handleTransactionsWebhook(webhook_code, item_id, payload);
      break;
    case 'ITEM':
      await handleItemWebhook(webhook_code, item_id, payload, item);
      break;
    default:
      console.log(`[Webhook] Unhandled type: ${webhook_type}`);
  }
}

/**
 * Handles TRANSACTIONS webhook events.
 * 
 * Processes:
 * - SYNC_UPDATES_AVAILABLE/DEFAULT_UPDATE/INITIAL_UPDATE: Queues transaction sync job
 * - TRANSACTIONS_REMOVED: Soft-deletes removed transactions from database
 * 
 * @param webhookCode - The specific webhook code (e.g., 'SYNC_UPDATES_AVAILABLE')
 * @param itemId - The Plaid item ID associated with the webhook
 * @param payload - Full webhook payload containing transaction data
 */
async function handleTransactionsWebhook(webhookCode: string, itemId: string, payload: PlaidWebhookBody): Promise<void> {
  if (['SYNC_UPDATES_AVAILABLE', 'DEFAULT_UPDATE', 'INITIAL_UPDATE'].includes(webhookCode)) {
    await backgroundQueue.sendMessage({ type: 'SYNC_TRANSACTIONS', payload: { item_id: itemId } });
    return;
  }

  if (webhookCode === 'TRANSACTIONS_REMOVED') {
    const removedIds = payload.removed_transactions || [];
    if (removedIds.length > 0) {
      await db.softDeleteTransactions(removedIds);
      console.log(`[Webhook] Soft-deleted ${removedIds.length} transactions`);
    }
    return;
  }

  console.log(`[Webhook] Unhandled TRANSACTIONS code: ${webhookCode}`);
}

/**
 * Handles ITEM webhook events.
 * 
 * Processes:
 * - LOGIN_REQUIRED: Marks item as requiring re-authentication
 * - NEW_ACCOUNTS_AVAILABLE: Queues job to fetch and process new accounts
 * - ERROR: Marks item as login_required when errors occur
 * - PENDING_EXPIRATION: Logs warning about expiring access token
 * 
 * @param webhookCode - The specific webhook code (e.g., 'LOGIN_REQUIRED')
 * @param itemId - The Plaid item ID
 * @param payload - Full webhook payload
 * @param item - The item record from database
 */
async function handleItemWebhook(webhookCode: string, itemId: string, payload: PlaidWebhookBody, item: any): Promise<void> {
  if (webhookCode === 'LOGIN_REQUIRED') {
    await db.updateItemStatus(itemId, 'login_required');
    console.log(`[Webhook] Item ${itemId} marked as login_required`);
  } else if (webhookCode === 'NEW_ACCOUNTS_AVAILABLE') {
    const newAccountIds = payload.new_accounts || [];
    if (newAccountIds.length > 0) {
      await backgroundQueue.sendMessage({
        type: 'ADD_NEW_ACCOUNTS',
        payload: { item_id: itemId, account_ids: newAccountIds }
      });
    }
  } else if (webhookCode === 'ERROR') {
    await db.updateItemStatus(itemId, 'login_required');
    console.error(`[Webhook] Item ${itemId} error:`, payload.error);
  } else if (webhookCode === 'PENDING_EXPIRATION') {
    console.log(`[Webhook] Item ${itemId} token expiring soon`);
  } else {
    console.log(`[Webhook] Unhandled ITEM code: ${webhookCode}`);
  }
}
