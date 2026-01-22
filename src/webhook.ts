import { APIGatewayProxyHandler } from 'aws-lambda';
import { db } from './db';
import { backgroundQueue } from './mockQueue';
import { PlaidWebhookBody } from './types';

// Lambda Handler for Plaid webhooks
export const handleWebhook: APIGatewayProxyHandler = async (event) => {
  try {
    if (!event.body) {
         return { statusCode: 400, body: JSON.stringify({ error: 'Missing body' }) };
    }

    const payload = JSON.parse(event.body) as PlaidWebhookBody;
    const webhookType = payload.webhook_type;
    const webhookCode = payload.webhook_code;
    const itemId = payload.item_id;

    console.log(`[Webhook] Received ${webhookType} / ${webhookCode} for item ${itemId}`);

    // 1. Verify webhook signature (Pseudo-code)
    // const jwt = event.headers['Plaid-Verification'];
    // await plaidClient.webhookVerificationKey.get(...);
    // verify(jwt, ...);

    switch (webhookType) {
      case 'TRANSACTIONS':
        if (webhookCode === 'SYNC_UPDATES_AVAILABLE' || webhookCode === 'DEFAULT_UPDATE' || webhookCode === 'TRANSACTIONS_REMOVED') {
           // Delegate to background worker
           console.log(`[Webhook] Triggering sync for ${itemId}`);
           await backgroundQueue.sendMessage({
             type: 'SYNC_TRANSACTIONS',
             payload: { item_id: itemId }
           });
        }
        break;

      case 'ITEM':
        if (webhookCode === 'LOGIN_REQUIRED') {
            console.log(`[Webhook] Marking item ${itemId} as login_required`);
            await db.updateItemStatus(itemId, 'login_required');
            // Notify user logic here...
        } else if (webhookCode === 'NEW_ACCOUNTS_AVAILABLE') {
            console.log(`[Webhook] New accounts available for ${itemId}. Notifying user.`);
            // Logic: Send push notification to user to launch Link in "update" mode
        }
        break;
    }

    // Acknowledge quickly
    return { statusCode: 200, body: JSON.stringify({ received: true }) };

  } catch (error) {
    console.error('Webhook Error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Webhook processing failed' }) };
  }
};
