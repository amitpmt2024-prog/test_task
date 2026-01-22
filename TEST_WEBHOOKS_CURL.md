# Test Plaid Webhooks with cURL

Complete guide with cURL commands to test all Plaid webhook scenarios.

---

## Quick Start: Test Your Webhook Endpoint

### Basic Webhook Test (Manual - Simulates Plaid)

```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{
    "webhook_type": "TRANSACTIONS",
    "webhook_code": "SYNC_UPDATES_AVAILABLE",
    "item_id": "item-xxx"
  }'
```

**Expected Response:**
```json
{
  "received": true
}
```

---

## Test Different Webhook Types

### 1. TRANSACTIONS.UPDATED Webhook

```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{
    "webhook_type": "TRANSACTIONS",
    "webhook_code": "SYNC_UPDATES_AVAILABLE",
    "item_id": "item-xxx"
  }'
```

**What to check:**
- Server logs: `[Webhook] Processing TRANSACTIONS.SYNC_UPDATES_AVAILABLE`
- Server logs: `[Queue] Message enqueued: SYNC_TRANSACTIONS`
- Server logs: `[Worker] Starting sync`

---

### 2. TRANSACTIONS_REMOVED Webhook

```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{
    "webhook_type": "TRANSACTIONS",
    "webhook_code": "TRANSACTIONS_REMOVED",
    "item_id": "item-xxx",
    "removed_transactions": ["tx-123", "tx-456"]
  }'
```

**What to check:**
- Server logs: `[Webhook] TRANSACTIONS_REMOVED`
- Database: Transactions soft-deleted (`deleted_at` set)

---

### 3. ITEM.LOGIN_REQUIRED Webhook

```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{
    "webhook_type": "ITEM",
    "webhook_code": "LOGIN_REQUIRED",
    "item_id": "item-xxx"
  }'
```

**What to check:**
- Server logs: `[Webhook] ITEM.LOGIN_REQUIRED`
- Database: Item status updated to `'login_required'`

**Verify in database:**
```sql
SELECT status FROM items WHERE item_id = 'item-xxx';
-- Should be: 'login_required'
```

---

### 4. ITEM.NEW_ACCOUNTS_AVAILABLE Webhook

```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{
    "webhook_type": "ITEM",
    "webhook_code": "NEW_ACCOUNTS_AVAILABLE",
    "item_id": "item-xxx",
    "new_accounts": ["acc-123", "acc-456"]
  }'
```

**What to check:**
- Server logs: `[Webhook] ITEM.NEW_ACCOUNTS_AVAILABLE`
- Server logs: `[Queue] Message enqueued: ADD_NEW_ACCOUNTS`
- Server logs: `[Worker] Adding new accounts`

---

### 5. ITEM.ERROR Webhook

```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{
    "webhook_type": "ITEM",
    "webhook_code": "ERROR",
    "item_id": "item-xxx",
    "error": {
      "error_code": "ITEM_LOGIN_REQUIRED",
      "error_message": "User needs to re-authenticate"
    }
  }'
```

**What to check:**
- Server logs: `[Webhook] ITEM.ERROR`
- Database: Item status updated to `'login_required'`

---

## Trigger Real Webhooks from Plaid (Using Access Token)

### Method 1: Trigger TRANSACTIONS.UPDATED (Real Plaid Webhook)

**Prerequisites:**
1. Get `access_token` from database
2. Set up tunnel (localtunnel/ngrok)
3. Configure webhook URL in Plaid Dashboard
4. Start your server

**cURL Command:**
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
1. Plaid processes the sync
2. Plaid automatically sends `TRANSACTIONS.SYNC_UPDATES_AVAILABLE` webhook
3. Your server receives the webhook
4. Background job syncs transactions

---

## Complete Testing Workflow

### Step 1: Get Item ID and Access Token

```sql
SELECT item_id, access_token FROM items ORDER BY created_at DESC LIMIT 1;
```

### Step 2: Test Webhook Endpoint (Manual)

```powershell
# Replace 'item-xxx' with your actual item_id
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{
    "webhook_type": "TRANSACTIONS",
    "webhook_code": "SYNC_UPDATES_AVAILABLE",
    "item_id": "item-xxx"
  }'
```

### Step 3: Trigger Real Webhook (From Plaid)

```powershell
# Replace 'access-sandbox-xxx' with your actual access_token
curl -X POST https://sandbox.plaid.com/transactions/sync `
  -H "Content-Type: application/json" `
  -H "PLAID-CLIENT-ID: 6970a2d39f83a8002183b2ca" `
  -H "PLAID-SECRET: 64284084aac897560a1cbfdc9fa5bb" `
  -d '{
    "access_token": "access-sandbox-xxx",
    "cursor": ""
  }'
```

---

## All Webhook Test Commands (Copy-Paste Ready)

### TRANSACTIONS.UPDATED
```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{"webhook_type":"TRANSACTIONS","webhook_code":"SYNC_UPDATES_AVAILABLE","item_id":"item-xxx"}'
```

### TRANSACTIONS_REMOVED
```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{"webhook_type":"TRANSACTIONS","webhook_code":"TRANSACTIONS_REMOVED","item_id":"item-xxx","removed_transactions":["tx-123"]}'
```

### ITEM.LOGIN_REQUIRED
```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{"webhook_type":"ITEM","webhook_code":"LOGIN_REQUIRED","item_id":"item-xxx"}'
```

### ITEM.NEW_ACCOUNTS_AVAILABLE
```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{"webhook_type":"ITEM","webhook_code":"NEW_ACCOUNTS_AVAILABLE","item_id":"item-xxx","new_accounts":["acc-123"]}'
```

### ITEM.ERROR
```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{"webhook_type":"ITEM","webhook_code":"ERROR","item_id":"item-xxx","error":{"error_code":"ITEM_LOGIN_REQUIRED"}}'
```

---

## Trigger Real Plaid Webhook (Using Access Token)

### Get Access Token First
```sql
SELECT access_token FROM items ORDER BY created_at DESC LIMIT 1;
```

### Trigger Real Webhook
```powershell
curl -X POST https://sandbox.plaid.com/transactions/sync `
  -H "Content-Type: application/json" `
  -H "PLAID-CLIENT-ID: 6970a2d39f83a8002183b2ca" `
  -H "PLAID-SECRET: 64284084aac897560a1cbfdc9fa5bb" `
  -d '{"access_token":"YOUR_ACCESS_TOKEN_HERE","cursor":""}'
```

**Note:** This triggers a **real webhook from Plaid** (not a manual test). Make sure:
- Webhook URL is configured in Plaid Dashboard
- Tunnel is running (if testing locally)
- Server is running

---

## Verify Webhook Was Processed

### Check Server Logs

Look for these messages in your server terminal:

```
[Webhook] Processing TRANSACTIONS.SYNC_UPDATES_AVAILABLE for item item-xxx
[Queue] Message enqueued: SYNC_TRANSACTIONS for item item-xxx
[Worker] Picking up job for item-xxx
[Worker] Starting sync for item-xxx
[Worker] Sync complete for item-xxx
```

### Check Database

```sql
-- Check if transactions were synced
SELECT COUNT(*) FROM transactions WHERE item_id = 'item-xxx';

-- Check item status
SELECT status FROM items WHERE item_id = 'item-xxx';

-- Check sync cursor
SELECT next_cursor FROM sync_cursors WHERE item_id = 'item-xxx';
```

---

## Quick Test Script

Save this as `test-webhook.ps1`:

```powershell
# Test Webhook Script
param(
    [Parameter(Mandatory=$true)]
    [string]$ItemId
)

Write-Host "Testing webhook for item: $ItemId" -ForegroundColor Cyan

$response = curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d "{\"webhook_type\":\"TRANSACTIONS\",\"webhook_code\":\"SYNC_UPDATES_AVAILABLE\",\"item_id\":\"$ItemId\"}"

Write-Host "Response: $response" -ForegroundColor Green
Write-Host "`nCheck server logs for processing details" -ForegroundColor Yellow
```

**Usage:**
```powershell
.\test-webhook.ps1 -ItemId "item-xxx"
```

---

## Troubleshooting

### Webhook Returns 500 Error

**Check server logs** for the actual error:
- Database connection issue?
- Item not found in database?
- Missing required fields?

### Webhook Returns 200 But Nothing Happens

**Check:**
1. Server logs for `[Webhook] Processing` message
2. Item exists in database: `SELECT * FROM items WHERE item_id = 'item-xxx'`
3. Background queue is working: Look for `[Queue] Message enqueued`

### Webhook Not Received from Plaid

**For real Plaid webhooks:**
1. Verify webhook URL in Plaid Dashboard
2. Check tunnel is running
3. Verify server is running
4. Check access_token is valid

---

## Next Steps

1. ✅ Test webhook endpoint manually (cURL above)
2. ✅ Verify webhook processing in server logs
3. ✅ Check database updates
4. ✅ Set up tunnel for real Plaid webhooks
5. ✅ Configure webhook URL in Plaid Dashboard
6. ✅ Trigger real webhook using access_token

---

## Quick Reference

| Webhook Type | cURL Command |
|-------------|--------------|
| **TRANSACTIONS.UPDATED** | `curl -X POST http://localhost:3000/webhook -H "Content-Type: application/json" -d '{"webhook_type":"TRANSACTIONS","webhook_code":"SYNC_UPDATES_AVAILABLE","item_id":"item-xxx"}'` |
| **ITEM.LOGIN_REQUIRED** | `curl -X POST http://localhost:3000/webhook -H "Content-Type: application/json" -d '{"webhook_type":"ITEM","webhook_code":"LOGIN_REQUIRED","item_id":"item-xxx"}'` |
| **ITEM.NEW_ACCOUNTS** | `curl -X POST http://localhost:3000/webhook -H "Content-Type: application/json" -d '{"webhook_type":"ITEM","webhook_code":"NEW_ACCOUNTS_AVAILABLE","item_id":"item-xxx","new_accounts":["acc-123"]}'` |
| **Trigger Real Webhook** | `curl -X POST https://sandbox.plaid.com/transactions/sync -H "PLAID-CLIENT-ID: xxx" -H "PLAID-SECRET: xxx" -d '{"access_token":"xxx","cursor":""}'` |
