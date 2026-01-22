# Testing Real Plaid Sandbox Webhooks

This guide shows you how to receive **real webhooks from Plaid Sandbox**, not just static cURL responses.

---

## Prerequisites

1. ✅ Plaid Sandbox account with credentials
2. ✅ Server running on `http://localhost:3000`
3. ✅ Database configured and running
4. ✅ `.env` file with Plaid credentials

---

## Step 1: Set Up Public URL (Tunnel)

Since your server runs locally, you need a public URL that Plaid can reach. Choose one:

### Option A: Use localtunnel (Easiest - No Update Needed)

```powershell
# Install localtunnel
npm install -g localtunnel

# Start tunnel
lt --port 3000
```

You'll get a URL like: `https://random-subdomain.loca.lt`

**Note:** For a fixed subdomain (recommended):
```powershell
lt --port 3000 --subdomain your-unique-name
```

### Option B: Use ngrok (After Updating)

```powershell
# Update ngrok first (see NGROK_UPDATE_INSTRUCTIONS.md)
ngrok http 3000
```

### Option C: Use Cloudflare Tunnel

```powershell
# Install cloudflared
choco install cloudflared

# Start tunnel
cloudflared tunnel --url http://localhost:3000
```

---

## Step 2: Configure Webhook URL in Plaid Dashboard

1. **Go to Plaid Dashboard:**
   - Visit: https://dashboard.plaid.com/
   - Sign in to your account

2. **Navigate to Webhooks:**
   - Go to **Team Settings** → **Webhooks**
   - Or: https://dashboard.plaid.com/team/webhooks

3. **Add Webhook URL:**
   - Click **"Add Webhook URL"** or **"Create Webhook"**
   - Enter your tunnel URL with `/webhook` path:
     - Example: `https://your-subdomain.loca.lt/webhook`
     - Example: `https://abc123.ngrok.io/webhook`
   - **Important:** Must be HTTPS (not HTTP)
   - Click **"Save"** or **"Create"**

4. **Verify Webhook URL:**
   - Plaid will show the webhook URL in the list
   - Status should be "Active" or "Verified"

---

## Step 3: Create a Connection (Item)

To receive webhooks, you need an active Plaid Item (connection).

### Method A: Using the HTML Page (Easiest)

1. **Start your server:**
   ```powershell
   npm start
   ```

2. **Open browser:**
   - Go to: `http://localhost:3000`
   - Enter your webhook URL in the "Ngrok / Webhook URL" field
   - Example: `https://your-subdomain.loca.lt/webhook`
   - Click **"Start Link"**

3. **Complete Plaid Link:**
   - Use test credentials:
     - **Username:** `user_good`
     - **Password:** `pass_good`
   - Select a test bank (e.g., "First Platypus Bank")
   - Complete the flow

4. **Connection created!**
   - Note the `item_id` from the response
   - This item is now in your database

### Method B: Using cURL

1. **Create Link Token with Webhook URL:**
   ```powershell
   curl -X POST http://localhost:3000/create_link_token `
     -H "Content-Type: application/json" `
     -d '{
       "user_id": "user_123",
       "region": "US",
       "webhook_url": "https://your-subdomain.loca.lt/webhook"
     }'
   ```

2. **Use Plaid Link** to get `public_token` (use HTML page or your frontend)

3. **Create Connection:**
   ```powershell
   curl -X POST http://localhost:3000/connections `
     -H "Content-Type: application/json" `
     -d '{
       "public_token": "public-sandbox-xxx",
       "region": "US",
       "user_id": "user_123"
     }'
   ```

4. **Save the `item_id`** from the response

---

## Step 4: Get Your Item ID

You need the `item_id` to trigger webhooks. Get it from:

**Option A: From Connection Response**
- When you create a connection, the response includes `item_id`

**Option B: From Database**
```sql
SELECT item_id, user_id, status FROM items ORDER BY created_at DESC LIMIT 1;
```

**Option C: From Server Logs**
- Check server logs when creating connection
- Look for: `[API] Connection created successfully: item_id=xxx`

---

## Step 5: Trigger Real Webhooks from Plaid

Now you can trigger **real webhooks from Plaid Sandbox**:

### Method 1: Using Plaid's Sandbox Item Management

Plaid Sandbox automatically sends webhooks when you perform certain actions. However, you can also trigger them manually:

#### Trigger TRANSACTIONS.UPDATED Webhook

**Option A: Call transactions/sync API (Triggers Webhook)**

```powershell
# Get your access_token from database first
# SELECT access_token FROM items WHERE item_id = 'your-item-id';

curl -X POST https://sandbox.plaid.com/transactions/sync `
  -H "Content-Type: application/json" `
  -H "PLAID-CLIENT-ID: your-client-id" `
  -H "PLAID-SECRET: your-sandbox-secret" `
  -d '{
    "access_token": "access-sandbox-xxx",
    "cursor": ""
  }'
```

**This will:**
1. Sync transactions
2. **Automatically trigger** `TRANSACTIONS.SYNC_UPDATES_AVAILABLE` webhook
3. Plaid will send webhook to your configured URL

**Option B: Use Plaid Dashboard**

1. Go to Plaid Dashboard → **Items** (or **Connections**)
2. Find your item
3. Click on it
4. Look for **"Trigger Webhook"** or **"Test Webhook"** option
5. Select webhook type and trigger

#### Trigger ITEM.LOGIN_REQUIRED Webhook

**Using Plaid's Sandbox Tools:**

1. **Go to Plaid Dashboard:**
   - Navigate to **Items** or **Sandbox** section
   - Find your item

2. **Set Item to Error State:**
   - Look for **"Set Item Error"** or **"Simulate Error"**
   - Select error type: `ITEM_LOGIN_REQUIRED`
   - This will trigger the webhook

**Or use API (if available):**
```powershell
curl -X POST https://sandbox.plaid.com/sandbox/item/reset_login `
  -H "Content-Type: application/json" `
  -H "PLAID-CLIENT-ID: your-client-id" `
  -H "PLAID-SECRET: your-sandbox-secret" `
  -d '{
    "access_token": "access-sandbox-xxx"
  }'
```

#### Trigger ITEM.NEW_ACCOUNTS_AVAILABLE Webhook

**Using Plaid Dashboard:**

1. Go to **Sandbox** → **Items**
2. Find your item
3. Look for **"Add Account"** or **"Simulate New Accounts"**
4. Add a new account to the item
5. This triggers `ITEM.NEW_ACCOUNTS_AVAILABLE` webhook

---

## Step 6: Verify Real Webhooks Are Received

### Check Server Logs

When Plaid sends a real webhook, you'll see:

```
[Webhook] Processing TRANSACTIONS.SYNC_UPDATES_AVAILABLE for item item-xxx
[Queue] Message enqueued: SYNC_TRANSACTIONS for item item-xxx
[Worker] Picking up job for item-xxx
[Worker] Starting sync for item-xxx
[Worker] Sync complete for item-xxx
```

### Check Tunnel Dashboard

**For localtunnel:**
- Check the terminal where you ran `lt --port 3000`
- You'll see incoming requests

**For ngrok:**
- Visit: http://localhost:4040
- See all incoming webhook requests
- Click on a request to see full details

### Check Database

**Verify transactions were synced:**
```sql
SELECT COUNT(*) FROM transactions WHERE item_id = 'your-item-id';
```

**Verify item status updated:**
```sql
SELECT status FROM items WHERE item_id = 'your-item-id';
```

**Verify sync cursor:**
```sql
SELECT next_cursor FROM sync_cursors WHERE item_id = 'your-item-id';
```

---

## Step 7: Complete Testing Workflow

### Full End-to-End Test

1. **Start server:**
   ```powershell
   npm start
   ```

2. **Start tunnel:**
   ```powershell
   lt --port 3000 --subdomain your-name
   ```
   Copy the URL: `https://your-name.loca.lt`

3. **Configure webhook in Plaid Dashboard:**
   - URL: `https://your-name.loca.lt/webhook`

4. **Create connection:**
   - Use HTML page at `http://localhost:3000`
   - Enter webhook URL
   - Complete Plaid Link flow
   - Note the `item_id`

5. **Trigger real webhook:**
   ```powershell
   # Get access_token from database
   # Then call transactions/sync
   curl -X POST https://sandbox.plaid.com/transactions/sync `
     -H "Content-Type: application/json" `
     -H "PLAID-CLIENT-ID: your-client-id" `
     -H "PLAID-SECRET: your-sandbox-secret" `
     -d '{
       "access_token": "your-access-token",
       "cursor": ""
     }'
   ```

6. **Watch for webhook:**
   - Check server logs
   - Check tunnel terminal
   - Verify database updates

---

## Testing Different Webhook Scenarios

### Scenario 1: TRANSACTIONS.UPDATED

**Trigger:**
```powershell
# Call transactions/sync API
curl -X POST https://sandbox.plaid.com/transactions/sync `
  -H "Content-Type: application/json" `
  -H "PLAID-CLIENT-ID: your-client-id" `
  -H "PLAID-SECRET: your-sandbox-secret" `
  -d '{
    "access_token": "access-sandbox-xxx",
    "cursor": ""
  }'
```

**Expected:**
- Webhook received: `TRANSACTIONS.SYNC_UPDATES_AVAILABLE`
- Background job enqueued
- Transactions synced to database

### Scenario 2: ITEM.LOGIN_REQUIRED

**Trigger via Dashboard:**
1. Plaid Dashboard → Items
2. Find your item
3. Set error state: `ITEM_LOGIN_REQUIRED`

**Expected:**
- Webhook received: `ITEM.LOGIN_REQUIRED`
- Item status updated to `'login_required'` in database

### Scenario 3: ITEM.NEW_ACCOUNTS_AVAILABLE

**Trigger via Dashboard:**
1. Plaid Dashboard → Sandbox → Items
2. Find your item
3. Add new account

**Expected:**
- Webhook received: `ITEM.NEW_ACCOUNTS_AVAILABLE`
- Background job enqueued
- New accounts logged

---

## Troubleshooting Real Webhooks

### Webhook Not Received from Plaid

**Check 1: Webhook URL is correct**
- Must be HTTPS (not HTTP)
- Must include `/webhook` path
- Must be accessible from internet (use tunnel)

**Check 2: Webhook URL is configured in Plaid Dashboard**
- Go to Team Settings → Webhooks
- Verify URL is listed and active

**Check 3: Tunnel is running**
- Check tunnel terminal
- Verify it's forwarding to `localhost:3000`

**Check 4: Server is running**
```powershell
curl http://localhost:3000/webhook
# Should return 400 (missing body) - this means server is up
```

**Check 5: Check Plaid Dashboard for webhook logs**
- Some Plaid plans show webhook delivery logs
- Check for failed deliveries

### Webhook Received But Not Processed

**Check server logs:**
- Look for `[Webhook] Processing` messages
- Look for errors

**Check database:**
- Verify item exists: `SELECT * FROM items WHERE item_id = 'xxx'`
- If item doesn't exist, webhook will be ignored

**Check background queue:**
- Look for `[Queue] Message enqueued` in logs
- Look for `[Worker] Picking up job` in logs

### Webhook Signature Verification (Production)

In production, you should verify webhook signatures. The code is ready but commented out:

**In `src/webhook.ts`:**
```typescript
// Uncomment this section for production:
const verificationHeader = event.headers['plaid-verification'];
if (!verificationHeader) {
  throw new Error('Missing Plaid verification header');
}
const verificationKey = await plaidClient.webhookVerificationKeyGet({
  key_id: payload.webhook_verification_key_id
});
// verifyWebhookSignature(verificationHeader, payload, verificationKey);
```

---

## Key Differences: Real Webhooks vs Manual cURL

| Manual cURL | Real Plaid Webhook |
|------------|-------------------|
| Static response | Dynamic from Plaid |
| No signature | Has Plaid signature |
| Immediate | May have delay |
| No verification | Can verify signature |
| Testing only | Production-like |

---

## Next Steps

1. ✅ Set up tunnel (localtunnel/ngrok)
2. ✅ Configure webhook URL in Plaid Dashboard
3. ✅ Create connection (item)
4. ✅ Trigger real webhooks from Plaid
5. ✅ Verify webhooks are received and processed
6. ✅ Test all webhook scenarios
7. ⚠️ Enable signature verification for production

---

## Quick Reference

### Start Tunnel
```powershell
lt --port 3000 --subdomain your-name
```

### Configure Webhook URL
- Plaid Dashboard → Team Settings → Webhooks
- Add: `https://your-tunnel-url/webhook`

### Trigger TRANSACTIONS Webhook
```powershell
curl -X POST https://sandbox.plaid.com/transactions/sync `
  -H "PLAID-CLIENT-ID: xxx" `
  -H "PLAID-SECRET: xxx" `
  -d '{"access_token": "xxx", "cursor": ""}'
```

### Check Webhook Received
- Server logs: `[Webhook] Processing`
- Tunnel terminal: Incoming requests
- Database: Transactions/status updated
