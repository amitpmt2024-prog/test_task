# Webhook cURL Commands - Complete Guide

Complete cURL commands for testing all three required webhook scenarios.

---

## Prerequisites

**Get your `item_id` from database:**
```sql
SELECT item_id FROM items ORDER BY created_at DESC LIMIT 1;
```

Replace `item-xxx` in all commands below with your actual `item_id`.

---

## 1. TRANSACTIONS.UPDATED Webhook

**Purpose:** Triggers transaction sync when Plaid detects new/updated transactions.

### cURL Command (PowerShell):

```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{
    "webhook_type": "TRANSACTIONS",
    "webhook_code": "SYNC_UPDATES_AVAILABLE",
    "item_id": "item-xxx"
  }'
```

### cURL Command (Bash/Linux):

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_type": "TRANSACTIONS",
    "webhook_code": "SYNC_UPDATES_AVAILABLE",
    "item_id": "item-xxx"
  }'
```

### Expected Response:

```json
{
  "received": true,
  "processed": true,
  "webhook_type": "TRANSACTIONS",
  "webhook_code": "SYNC_UPDATES_AVAILABLE",
  "item_id": "item-xxx",
  "action": "trigger_transaction_sync",
  "message": "Webhook received and queued for processing: trigger_transaction_sync"
}
```

### What Happens:

1. ✅ Webhook received and acknowledged immediately
2. ✅ Message queued to background worker: `SYNC_TRANSACTIONS`
3. ✅ Worker fetches transactions from Plaid using `transactions/sync` API
4. ✅ Transactions upserted to database (new transactions added, existing ones updated)
5. ✅ Sync cursor saved for next sync

### Server Logs to Check:

```
[Webhook] Received TRANSACTIONS.SYNC_UPDATES_AVAILABLE for item item-xxx - Action: trigger_transaction_sync
[Webhook] Processing TRANSACTIONS.SYNC_UPDATES_AVAILABLE for item item-xxx
[Webhook] TRANSACTIONS.UPDATED - Triggering sync for item-xxx
[Queue] Message enqueued: SYNC_TRANSACTIONS for item item-xxx
[Worker] Picking up job for item-xxx
[Worker] Starting sync for item-xxx
[Worker] Sync complete for item-xxx
```

### Verify in Database:

```sql
-- Check if transactions were synced
SELECT COUNT(*) FROM transactions WHERE item_id = 'item-xxx';

-- View recent transactions
SELECT transaction_id, name, amount, date 
FROM transactions 
WHERE item_id = 'item-xxx' 
ORDER BY date DESC 
LIMIT 10;

-- Check sync cursor
SELECT next_cursor FROM sync_cursors WHERE item_id = 'item-xxx';
```

---

## 2. ITEM.LOGIN_REQUIRED Webhook

**Purpose:** Marks connection as needing re-authentication when user's bank credentials expire or need refresh.

### cURL Command (PowerShell):

```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{
    "webhook_type": "ITEM",
    "webhook_code": "LOGIN_REQUIRED",
    "item_id": "item-xxx"
  }'
```

### cURL Command (Bash/Linux):

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_type": "ITEM",
    "webhook_code": "LOGIN_REQUIRED",
    "item_id": "item-xxx"
  }'
```

### Expected Response:

```json
{
  "received": true,
  "processed": true,
  "webhook_type": "ITEM",
  "webhook_code": "LOGIN_REQUIRED",
  "item_id": "item-xxx",
  "action": "update_item_status_to_login_required",
  "message": "Webhook received and queued for processing: update_item_status_to_login_required"
}
```

### What Happens:

1. ✅ Webhook received and acknowledged immediately
2. ✅ Item status updated in database: `status = 'login_required'`
3. ✅ Connection marked as needing re-authentication
4. ✅ In production: User would receive notification to reconnect

### Server Logs to Check:

```
[Webhook] Received ITEM.LOGIN_REQUIRED for item item-xxx - Action: update_item_status_to_login_required
[Webhook] Processing ITEM.LOGIN_REQUIRED for item item-xxx
[Webhook] ITEM.LOGIN_REQUIRED - Marking item item-xxx as login_required
[Webhook] User user_123 needs to re-authenticate item item-xxx
```

### Verify in Database:

```sql
-- Check item status (should be 'login_required')
SELECT item_id, user_id, status, created_at 
FROM items 
WHERE item_id = 'item-xxx';

-- Expected result:
-- status: 'login_required'
```

### How User Re-authenticates:

1. User sees "Reconnect" button in UI (status = `login_required`)
2. User clicks "Reconnect"
3. Frontend calls `/create_link_token` with same `user_id` and `region`
4. User completes Plaid Link flow
5. Frontend sends `public_token` to `/connections` endpoint
6. Backend exchanges `public_token` for new `access_token`
7. Item status updated back to `'active'`

---

## 3. ITEM.NEW_ACCOUNTS_AVAILABLE Webhook

**Purpose:** Notifies when new accounts are available at the user's bank (e.g., user opened a new account).

### cURL Command (PowerShell):

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

### cURL Command (Bash/Linux):

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_type": "ITEM",
    "webhook_code": "NEW_ACCOUNTS_AVAILABLE",
    "item_id": "item-xxx",
    "new_accounts": ["acc-123", "acc-456"]
  }'
```

### Expected Response:

```json
{
  "received": true,
  "processed": true,
  "webhook_type": "ITEM",
  "webhook_code": "NEW_ACCOUNTS_AVAILABLE",
  "item_id": "item-xxx",
  "action": "process_2_new_accounts",
  "message": "Webhook received and queued for processing: process_2_new_accounts"
}
```

### What Happens:

1. ✅ Webhook received and acknowledged immediately
2. ✅ Message queued to background worker: `ADD_NEW_ACCOUNTS`
3. ✅ Worker fetches ALL accounts from Plaid using `accounts/get` API
4. ✅ New accounts identified and logged
5. ✅ In production: User would receive notification to add new accounts

### Server Logs to Check:

```
[Webhook] Received ITEM.NEW_ACCOUNTS_AVAILABLE for item item-xxx - Action: process_2_new_accounts
[Webhook] Processing ITEM.NEW_ACCOUNTS_AVAILABLE for item item-xxx
[Webhook] ITEM.NEW_ACCOUNTS_AVAILABLE - New accounts available for item-xxx
[Queue] Message enqueued: ADD_NEW_ACCOUNTS for item item-xxx
[Worker] Picking up job for item-xxx
[Worker] Processing new accounts for item item-xxx
[Worker] Fetching accounts from Plaid for item item-xxx
[Worker] Found X total accounts from Plaid
[Worker] Filtered to 2 new accounts from webhook
[Worker] ✅ New account available: acc-123 - Account Name (depository/checking)
[Worker]    Balance: USD 1000.00
[Worker] ✅ New account available: acc-456 - Account Name (depository/savings)
[Worker]    Balance: USD 5000.00
[Worker] 📧 User user_123 has 2 new account(s) available
```

### How User Adds New Accounts:

**Option 1: Using Plaid Link in Update Mode (Recommended)**

1. User receives notification: "New accounts available! Add them now?"
2. Frontend calls `/create_link_token` with:
   ```json
   {
     "user_id": "user_123",
     "region": "US",
     "access_token": "access-sandbox-xxx"  // Existing access_token
   }
   ```
3. Backend creates link token with `access_token` (update mode)
4. User opens Plaid Link and selects new accounts to add
5. User completes flow
6. New accounts are now part of the connection

**Option 2: Automatic (If Supported)**

- Some institutions allow automatic account addition
- Backend can call Plaid API to add accounts programmatically
- User is notified after accounts are added

---

## All Commands in One Place (Copy-Paste Ready)

### PowerShell (Windows):

```powershell
# 1. TRANSACTIONS.UPDATED
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{"webhook_type":"TRANSACTIONS","webhook_code":"SYNC_UPDATES_AVAILABLE","item_id":"item-xxx"}'

# 2. ITEM.LOGIN_REQUIRED
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{"webhook_type":"ITEM","webhook_code":"LOGIN_REQUIRED","item_id":"item-xxx"}'

# 3. ITEM.NEW_ACCOUNTS_AVAILABLE
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{"webhook_type":"ITEM","webhook_code":"NEW_ACCOUNTS_AVAILABLE","item_id":"item-xxx","new_accounts":["acc-123","acc-456"]}'
```

### Bash/Linux/Mac:

```bash
# 1. TRANSACTIONS.UPDATED
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"webhook_type":"TRANSACTIONS","webhook_code":"SYNC_UPDATES_AVAILABLE","item_id":"item-xxx"}'

# 2. ITEM.LOGIN_REQUIRED
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"webhook_type":"ITEM","webhook_code":"LOGIN_REQUIRED","item_id":"item-xxx"}'

# 3. ITEM.NEW_ACCOUNTS_AVAILABLE
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"webhook_type":"ITEM","webhook_code":"NEW_ACCOUNTS_AVAILABLE","item_id":"item-xxx","new_accounts":["acc-123","acc-456"]}'
```

---

## Testing Workflow

### Step 1: Get Your Item ID

```sql
SELECT item_id, user_id, status FROM items ORDER BY created_at DESC LIMIT 1;
```

### Step 2: Test Each Webhook

Run each cURL command above, replacing `item-xxx` with your actual `item_id`.

### Step 3: Check Server Logs

Watch your server terminal for processing logs.

### Step 4: Verify in Database

```sql
-- Check transactions (for TRANSACTIONS.UPDATED)
SELECT COUNT(*) FROM transactions WHERE item_id = 'item-xxx';

-- Check item status (for ITEM.LOGIN_REQUIRED)
SELECT status FROM items WHERE item_id = 'item-xxx';

-- Check sync cursor (for TRANSACTIONS.UPDATED)
SELECT next_cursor FROM sync_cursors WHERE item_id = 'item-xxx';
```

---

## Troubleshooting

### Webhook Returns 400 Error

**Check:**
- Request body is valid JSON
- `item_id` exists in database
- Server is running on port 3000

### Webhook Returns 200 But `processed: false`

**Check:**
- Item exists: `SELECT * FROM items WHERE item_id = 'item-xxx'`
- Server logs for error messages
- Database connection is working

### No Processing Happening

**Check:**
- Server logs for `[Webhook] Processing` messages
- Background queue is working: Look for `[Queue] Message enqueued`
- Worker is processing: Look for `[Worker]` messages

---

## Real Plaid Webhooks

To trigger **real webhooks from Plaid** (not manual tests):

### For TRANSACTIONS.UPDATED:

```powershell
# Get access_token first
# SELECT access_token FROM items WHERE item_id = 'item-xxx';

curl -X POST https://sandbox.plaid.com/transactions/sync `
  -H "Content-Type: application/json" `
  -H "PLAID-CLIENT-ID: 6970a2d39f83a8002183b2ca" `
  -H "PLAID-SECRET: 64284084aac897560a1cbfdc9fa5bb" `
  -d '{"access_token":"YOUR_ACCESS_TOKEN","cursor":""}'
```

This will trigger a **real** `TRANSACTIONS.SYNC_UPDATES_AVAILABLE` webhook from Plaid (if webhook URL is configured).

---

## Summary

| Webhook | Purpose | Action Taken |
|---------|---------|--------------|
| **TRANSACTIONS.UPDATED** | New/updated transactions | Triggers transaction sync via background worker |
| **ITEM.LOGIN_REQUIRED** | Credentials expired | Updates item status to `'login_required'` |
| **ITEM.NEW_ACCOUNTS_AVAILABLE** | New accounts at bank | Fetches accounts from Plaid, notifies user to add them |

All webhooks:
- ✅ Acknowledge immediately (< 500ms)
- ✅ Process asynchronously in background
- ✅ Return detailed response with processing status
- ✅ Log all actions for debugging
