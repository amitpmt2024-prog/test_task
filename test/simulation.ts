import { createConnection } from '../src/connections';
import { handleWebhook } from '../src/webhook';
import { db } from '../src/db';

async function runSimulation() {
  console.log('=== Starting Simulation ===');

  // 1. Simulate Connection
  console.log('\n--- Step 1: User Connects Link ---');
  // Mock APIGatewayProxyEvent (partial)
  const connectionEvent: any = {
    body: JSON.stringify({
      public_token: 'public-sandbox-123',
      region: 'US',
      user_id: 'user_001'
    })
  };
  
  const connRes = await createConnection(connectionEvent, {} as any, () => {}) as any;
  const connBody = JSON.parse(connRes.body as string);
  console.log('Connection Result:', connRes.statusCode, connBody);

  if (connRes.statusCode !== 200) {
      console.error("Failed to connect");
      return;
  }

  const itemId = connBody.item_id;

  // 2. Simulate Webhook (Transactions Updated)
  console.log('\n--- Step 2: Plaid Sends Webhook ---');
  const webhookEvent: any = {
    body: JSON.stringify({
      webhook_type: 'TRANSACTIONS',
      webhook_code: 'SYNC_UPDATES_AVAILABLE',
      item_id: itemId
    })
  };

  const hookRes = await handleWebhook(webhookEvent, {} as any, () => {}) as any;
  console.log('Webhook Result:', hookRes.statusCode, hookRes.body);

  // 3. Wait for background worker
  console.log('\n--- Step 3: Waiting for Background Worker ---');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 4. Verify DB State
  console.log('\n--- Step 4: Verification ---');
  const state = await db.dumpState();
  console.log('Database State:', state);

  if (state.itemsCount === 1 && state.transactionsCount >= 2 && state.cursors === 1) {
      console.log('SUCCESS: Item created, webhook handled, transactions synced.');
      
  } else {
      console.error('FAILURE: State mismatch.');
  }
}

runSimulation();
