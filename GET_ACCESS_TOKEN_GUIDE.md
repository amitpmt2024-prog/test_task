# How to Get Access Token for Plaid API Calls

## The Problem

You're trying to use a `link_token` as an `access_token`, which causes this error:
```
"error_message": "provided token is the wrong type. expected \"access\", got \"link\""
```

## The Solution

You need to follow the Plaid flow to convert tokens:

1. **link_token** → Use in Plaid Link (frontend)
2. **public_token** → Get from Plaid Link after user connects
3. **access_token** → Exchange public_token for access_token (backend)

---

## Step-by-Step: Get Access Token

### Option 1: If You Already Created a Connection

If you've already created a connection using the `/connections` endpoint, the `access_token` is stored in your database.

**Get it from database:**
```sql
SELECT item_id, access_token, user_id, status 
FROM items 
ORDER BY created_at DESC 
LIMIT 1;
```

**Use the `access_token` from the database** in your API call.

### Option 2: Create a New Connection (If You Don't Have One)

#### Step 1: Create Link Token

```powershell
curl -X POST http://localhost:3000/create_link_token `
  -H "Content-Type: application/json" `
  -d '{
    "user_id": "user_123",
    "region": "US"
  }'
```

**Response:**
```json
{
  "link_token": "link-sandbox-xxx...",
  "expiration": "2024-01-01T12:00:00Z"
}
```

#### Step 2: Use Link Token in Plaid Link

1. **Open browser:** `http://localhost:3000`
2. **Enter the link_token** (or use the HTML page which does this automatically)
3. **Complete Plaid Link flow:**
   - Username: `user_good`
   - Password: `pass_good`
   - Select a test bank
4. **Plaid Link returns a `public_token`**

#### Step 3: Exchange Public Token for Access Token

**This is done automatically by the `/connections` endpoint:**

```powershell
curl -X POST http://localhost:3000/connections `
  -H "Content-Type: application/json" `
  -d '{
    "public_token": "public-sandbox-xxx-from-plaid-link",
    "region": "US",
    "user_id": "user_123"
  }'
```

**Response:**
```json
{
  "item_id": "item-xxx",
  "status": "connected",
  "region": "US",
  "message": "Connection created successfully"
}
```

**The `access_token` is now stored in your database** and can be retrieved.

---

## Step 4: Use Access Token for transactions/sync

Once you have the `access_token` from the database:

```powershell
curl -X POST https://sandbox.plaid.com/transactions/sync `
  -H "Content-Type: application/json" `
  -H "PLAID-CLIENT-ID: 6970a2d39f83a8002183b2ca" `
  -H "PLAID-SECRET: 64284084aac897560a1cbfdc9fa5bb" `
  -d '{
    "access_token": "access-sandbox-xxx",  # ← Use access_token from database
    "cursor": ""
  }'
```

**Note:** The `access_token` starts with `access-sandbox-`, not `link-sandbox-`

---

## Quick Fix: Get Access Token from Database

If you've already created a connection, just get it from the database:

```sql
-- Get the latest connection
SELECT item_id, access_token 
FROM items 
ORDER BY created_at DESC 
LIMIT 1;
```

Then use that `access_token` in your API call.

---

## Using the Helper Script

You can also use the helper script which will prompt you for the access_token:

```powershell
.\scripts\trigger-plaid-webhook.ps1 -ItemId "item-xxx"
```

It will:
1. Ask you for the access_token
2. Call the transactions/sync API
3. Trigger the real webhook from Plaid

---

## Token Types Reference

| Token Type | Format | Used For | Example |
|-----------|--------|----------|---------|
| **link_token** | `link-sandbox-xxx` | Frontend (Plaid Link) | `link-sandbox-3dc02ac4-...` |
| **public_token** | `public-sandbox-xxx` | Exchange for access_token | `public-sandbox-abc123` |
| **access_token** | `access-sandbox-xxx` | API calls | `access-sandbox-xyz789` |

---

## Common Mistakes

❌ **Wrong:** Using `link_token` in API calls
```json
{
  "access_token": "link-sandbox-xxx"  // ❌ This is a link_token!
}
```

✅ **Correct:** Using `access_token` from database
```json
{
  "access_token": "access-sandbox-xxx"  // ✅ This is an access_token!
}
```

---

## Complete Flow Example

```powershell
# 1. Create link token
$linkTokenResponse = curl -X POST http://localhost:3000/create_link_token `
  -H "Content-Type: application/json" `
  -d '{"user_id": "user_123", "region": "US"}'

# 2. Use link_token in Plaid Link (frontend) → get public_token
# (Use HTML page at http://localhost:3000)

# 3. Exchange public_token for access_token
$connectionResponse = curl -X POST http://localhost:3000/connections `
  -H "Content-Type: application/json" `
  -d '{
    "public_token": "public-sandbox-xxx",
    "region": "US",
    "user_id": "user_123"
  }'

# 4. Get access_token from database
# SELECT access_token FROM items WHERE item_id = 'item-xxx';

# 5. Use access_token for API calls
curl -X POST https://sandbox.plaid.com/transactions/sync `
  -H "Content-Type: application/json" `
  -H "PLAID-CLIENT-ID: 6970a2d39f83a8002183b2ca" `
  -H "PLAID-SECRET: 64284084aac897560a1cbfdc9fa5bb" `
  -d '{
    "access_token": "access-sandbox-xxx-from-database",
    "cursor": ""
  }'
```

---

## Next Steps

1. ✅ Check if you have a connection in database
2. ✅ Get `access_token` from database
3. ✅ Use `access_token` (not `link_token`) in API calls
4. ✅ Test transactions/sync API
5. ✅ Verify webhook is received
