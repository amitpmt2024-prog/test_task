# Roadmap: Testing Webhooks with Access Token

## Overview

Yes! You can trigger webhooks using your `access_token`. When you call Plaid APIs (like `transactions/sync`), Plaid automatically sends webhooks to your configured webhook URL.

---

## Complete Roadmap

### Step 1: Verify You Have Access Token ✅

**Get your access_token from database:**
```sql
SELECT item_id, access_token, user_id, status 
FROM items 
ORDER BY created_at DESC 
LIMIT 1;
```

**Or use the helper script:**
```powershell
# The script will prompt you for access_token
.\scripts\trigger-plaid-webhook.ps1 -ItemId "item-xxx"
```

---

### Step 2: Set Up Public URL (Tunnel)

Your server runs locally, so you need a public URL that Plaid can reach.

#### Option A: Use localtunnel (Easiest)

```powershell
# Install (if not already installed)
npm install -g localtunnel

# Start tunnel
lt --port 3000 --subdomain your-name

# You'll get: https://your-name.loca.lt
```

#### Option B: Use ngrok (After Updating)

```powershell
ngrok http 3000
# You'll get: https://abc123.ngrok.io
```

#### Option C: Use Cloudflare Tunnel

```powershell
cloudflared tunnel --url http://localhost:3000
```

---

### Step 3: Configure Webhook URL in Plaid Dashboard

1. **Go to Plaid Dashboard:**
   - Visit: https://dashboard.plaid.com/
   - Navigate to **Team Settings** → **Webhooks**

2. **Add Webhook URL:**
   - Click **"Add Webhook URL"** or **"Create Webhook"**
   - Enter your tunnel URL with `/webhook` path:
     - Example: `https://your-name.loca.lt/webhook`
     - Example: `https://abc123.ngrok.io/webhook`
   - **Important:** Must be HTTPS (not HTTP)
   - Click **"Save"**

3. **Verify:**
   - Webhook URL should show as "Active" or "Verified"

---

### Step 4: Start Your Server

```powershell
npm run dev
```

**You should see:**
```
[DB] ✅ All database tables initialized successfully
Server running on http://localhost:3000
```

---

### Step 5: Trigger Webhook Using Access Token

#### Method 1: Call transactions/sync API (Triggers TRANSACTIONS.UPDATED)

**Using cURL:**
```powershell
curl -X POST https://sandbox.plaid.com/transactions/sync `
  -H "Content-Type: application/json" `
  -H "PLAID-CLIENT-ID: 6970a2d39f83a8002183b2ca" `
  -H "PLAID-SECRET: 64284084aac897560a1cbfdc9fa5bb" `
  -d '{
    "access_token": "access-sandbox-xxx-from-database",
    "cursor": ""
  }'
```

**What happens:**
1. Plaid processes the sync request
2. Plaid automatically sends `TRANSACTIONS.SYNC_UPDATES_AVAILABLE` webhook
3. Webhook is sent to your configured webhook URL
4. Your server receives and processes it

#### Method 2: Use the Helper Script

```powershell
.\scripts\trigger-plaid-webhook.ps1 -ItemId "item-xxx" -AccessToken "access-sandbox-xxx"
```

The script will:
1. Call `transactions/sync` API
2. Plaid sends webhook automatically
3. Show you the response

---

### Step 6: Monitor Webhook Reception

#### Check Server Logs

When Plaid sends the webhook, you'll see in your server terminal:

```
[Webhook] Processing TRANSACTIONS.SYNC_UPDATES_AVAILABLE for item item-xxx
[Queue] Message enqueued: SYNC_TRANSACTIONS for item item-xxx
[Worker] Picking up job for item-xxx
[Worker] Starting sync for item-xxx
[Worker] Sync complete for item-xxx
```

#### Check Tunnel Terminal

**For localtunnel:**
- Check the terminal where you ran `lt --port 3000`
- You'll see incoming requests

**For ngrok:**
- Visit: http://localhost:4040
- See all incoming webhook requests
- Click on a request to see full details

#### Check Database

**Verify transactions were synced:**
```sql
SELECT COUNT(*) FROM transactions WHERE item_id = 'item-xxx';
```

**Verify sync cursor:**
```sql
SELECT next_cursor FROM sync_cursors WHERE item_id = 'item-xxx';
```

---

## Complete Testing Flow

### End-to-End Test with Access Token

```powershell
# 1. Get access_token from database
# Run in your database client:
# SELECT access_token FROM items ORDER BY created_at DESC LIMIT 1;

# 2. Start tunnel (in separate terminal)
lt --port 3000 --subdomain your-name

# 3. Configure webhook in Plaid Dashboard
# URL: https://your-name.loca.lt/webhook

# 4. Start server (in another terminal)
npm run dev

# 5. Trigger webhook using access_token
curl -X POST https://sandbox.plaid.com/transactions/sync `
  -H "Content-Type: application/json" `
  -H "PLAID-CLIENT-ID: 6970a2d39f83a8002183b2ca" `
  -H "PLAID-SECRET: 64284084aac897560a1cbfdc9fa5bb" `
  -d '{
    "access_token": "YOUR_ACCESS_TOKEN_HERE",
    "cursor": ""
  }'

# 6. Watch server logs for webhook processing
# 7. Check database for synced transactions
```

---

## Different Webhook Types You Can Trigger

### 1. TRANSACTIONS.UPDATED Webhook

**Trigger:** Call `transactions/sync` API

```powershell
curl -X POST https://sandbox.plaid.com/transactions/sync `
  -H "Content-Type: application/json" `
  -H "PLAID-CLIENT-ID: 6970a2d39f83a8002183b2ca" `
  -H "PLAID-SECRET: 64284084aac897560a1cbfdc9fa5bb" `
  -d '{
    "access_token": "access-sandbox-xxx",
    "cursor": ""
  }'
```

**Webhook sent:** `TRANSACTIONS.SYNC_UPDATES_AVAILABLE`

**What happens:**
- Your webhook handler receives it
- Background job is enqueued
- Worker syncs transactions to database

---

### 2. ITEM.LOGIN_REQUIRED Webhook

**Trigger:** Use Plaid Dashboard or API to set item error state

**Via Plaid Dashboard:**
1. Go to **Items** or **Sandbox** section
2. Find your item
3. Set error: `ITEM_LOGIN_REQUIRED`

**Webhook sent:** `ITEM.LOGIN_REQUIRED`

**What happens:**
- Item status updated to `'login_required'` in database
- User needs to re-authenticate

---

### 3. ITEM.NEW_ACCOUNTS_AVAILABLE Webhook

**Trigger:** Use Plaid Dashboard to add accounts to item

**Via Plaid Dashboard:**
1. Go to **Sandbox** → **Items**
2. Find your item
3. Add new account

**Webhook sent:** `ITEM.NEW_ACCOUNTS_AVAILABLE`

**What happens:**
- Background job enqueued
- New accounts logged
- User can add accounts via Plaid Link

---

## Quick Reference: Testing Commands

### Get Access Token
```sql
SELECT access_token FROM items ORDER BY created_at DESC LIMIT 1;
```

### Trigger TRANSACTIONS Webhook
```powershell
curl -X POST https://sandbox.plaid.com/transactions/sync `
  -H "Content-Type: application/json" `
  -H "PLAID-CLIENT-ID: 6970a2d39f83a8002183b2ca" `
  -H "PLAID-SECRET: 64284084aac897560a1cbfdc9fa5bb" `
  -d '{"access_token": "YOUR_TOKEN", "cursor": ""}'
```

### Check Webhook Received
- Server logs: `[Webhook] Processing`
- Tunnel terminal: Incoming requests
- Database: Transactions synced

---

## Troubleshooting

### Webhook Not Received

**Check 1: Webhook URL configured**
- Go to Plaid Dashboard → Team Settings → Webhooks
- Verify URL is listed and active

**Check 2: Tunnel is running**
- Check tunnel terminal
- Verify it's forwarding to `localhost:3000`

**Check 3: Server is running**
```powershell
curl http://localhost:3000/webhook
# Should return 400 (missing body) - means server is up
```

**Check 4: Access token is valid**
- Verify token starts with `access-sandbox-`
- Check item exists in database

### Webhook Received But Not Processed

**Check server logs:**
- Look for `[Webhook] Processing` messages
- Look for errors

**Check database:**
- Verify item exists: `SELECT * FROM items WHERE item_id = 'xxx'`
- If item doesn't exist, webhook will be ignored

---

## Step-by-Step Checklist

- [ ] ✅ Get access_token from database
- [ ] ✅ Set up tunnel (localtunnel/ngrok)
- [ ] ✅ Configure webhook URL in Plaid Dashboard
- [ ] ✅ Start server (`npm run dev`)
- [ ] ✅ Call transactions/sync API with access_token
- [ ] ✅ Watch server logs for webhook processing
- [ ] ✅ Check tunnel terminal for incoming requests
- [ ] ✅ Verify database updates (transactions synced)

---

## Example: Complete Test Session

```powershell
# Terminal 1: Start tunnel
lt --port 3000 --subdomain my-plaid-test

# Terminal 2: Start server
npm run dev

# Terminal 3: Trigger webhook
# First, get access_token from database, then:
curl -X POST https://sandbox.plaid.com/transactions/sync `
  -H "Content-Type: application/json" `
  -H "PLAID-CLIENT-ID: 6970a2d39f83a8002183b2ca" `
  -H "PLAID-SECRET: 64284084aac897560a1cbfdc9fa5bb" `
  -d '{
    "access_token": "access-sandbox-xxx",
    "cursor": ""
  }'

# Watch Terminal 2 (server) for webhook processing logs
```

---

## Key Points

1. ✅ **Access token can trigger webhooks** - Call Plaid APIs with access_token
2. ✅ **Plaid sends webhooks automatically** - When you call transactions/sync, webhook is sent
3. ✅ **Webhook goes to configured URL** - Must be set in Plaid Dashboard
4. ✅ **Your server processes webhook** - Handler receives and processes it
5. ✅ **Background jobs run** - Worker syncs transactions to database

---

## Next Steps

1. ✅ Set up tunnel
2. ✅ Configure webhook URL in Plaid Dashboard
3. ✅ Get access_token from database
4. ✅ Call transactions/sync API
5. ✅ Verify webhook is received and processed
6. ✅ Check database for synced transactions

---

## Additional Resources

- **📖 [TESTING_REAL_PLAID_WEBHOOKS.md](./TESTING_REAL_PLAID_WEBHOOKS.md)** - Detailed webhook testing guide
- **📖 [GET_ACCESS_TOKEN_GUIDE.md](./GET_ACCESS_TOKEN_GUIDE.md)** - How to get access tokens
- **📖 [WEBHOOK_TESTING_GUIDE.md](./WEBHOOK_TESTING_GUIDE.md)** - Complete webhook testing reference
