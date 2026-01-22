# Quick Guide: Generate Access Token for Plaid Sandbox

## The Challenge

Plaid requires a **frontend step** (Plaid Link) to get a `public_token`, which is then exchanged for an `access_token`. You cannot skip this step, but we can make it very easy!

---

## Easiest Method: Use the Built-in HTML Page

### Step 1: Create Link Token (cURL)

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

### Step 2: Use HTML Page to Complete Link Flow

1. **Open browser:** `http://localhost:3000`
2. **The page automatically:**
   - Creates a link token
   - Opens Plaid Link
   - Handles the flow
3. **Enter Plaid test credentials:**
   - **Username:** `user_good`
   - **Password:** `pass_good`
   - Select a test bank (e.g., "First Platypus Bank")
4. **Click "Continue"** - The connection is created automatically!
5. **The `access_token` is now saved in your database**

### Step 3: Get Access Token from Database

```sql
SELECT item_id, access_token, user_id, status 
FROM items 
ORDER BY created_at DESC 
LIMIT 1;
```

**Done!** You now have the `access_token`.

---

## Alternative: Complete Flow with cURL (Manual)

If you want to do everything with cURL (but still need the frontend step):

### Step 1: Create Link Token

```powershell
curl -X POST http://localhost:3000/create_link_token `
  -H "Content-Type: application/json" `
  -d '{
    "user_id": "user_123",
    "region": "US"
  }'
```

**Save the `link_token` from the response.**

### Step 2: Get Public Token (Frontend Required)

**You MUST use Plaid Link (frontend) to get `public_token`:**

**Option A: Use HTML Page (Easiest)**
- Go to `http://localhost:3000`
- The page will use the link_token and return a public_token

**Option B: Create Your Own Frontend**
- Use Plaid Link JavaScript library
- Initialize with the `link_token`
- On success, you'll get a `public_token`

### Step 3: Exchange Public Token for Access Token

Once you have the `public_token` from Step 2:

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

**The `access_token` is now in your database!**

### Step 4: Get Access Token

```sql
SELECT access_token FROM items WHERE item_id = 'item-xxx';
```

---

## One-Line Script to Get Latest Access Token

If you already have a connection, use this SQL:

```sql
SELECT access_token FROM items ORDER BY created_at DESC LIMIT 1;
```

---

## Complete cURL Flow (With HTML Page for Link Step)

```powershell
# Step 1: Create link token
curl -X POST http://localhost:3000/create_link_token `
  -H "Content-Type: application/json" `
  -d '{"user_id": "user_123", "region": "US"}'

# Step 2: Use HTML page at http://localhost:3000
# - Enter credentials: user_good / pass_good
# - Complete flow
# - Connection is created automatically

# Step 3: Get access_token from database
# Run in your database client:
# SELECT access_token FROM items ORDER BY created_at DESC LIMIT 1;
```

---

## Quick Test: Verify Access Token Works

Once you have the `access_token`:

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

**If successful**, you'll get transaction data (not an error about token type).

---

## Why You Can't Skip the Frontend Step

Plaid requires:
1. **User authentication** - User must log in to their bank (even in sandbox)
2. **Bank selection** - User must select which bank to connect
3. **Consent** - User must consent to sharing data

This is done through **Plaid Link** (frontend component), which cannot be bypassed with cURL alone.

**However**, in sandbox mode:
- You use test credentials (`user_good` / `pass_good`)
- No real bank account needed
- Process takes ~30 seconds

---

## Fastest Method Summary

1. **Open:** `http://localhost:3000` in browser
2. **Enter:** `user_good` / `pass_good` in Plaid Link
3. **Complete:** The flow (takes 30 seconds)
4. **Get token:** `SELECT access_token FROM items ORDER BY created_at DESC LIMIT 1;`

**Total time: ~1 minute** ⚡

---

## Troubleshooting

### "No items in database"
- Make sure you completed the Plaid Link flow
- Check server logs for errors
- Verify connection was created successfully

### "Link token expired"
- Link tokens expire after 4 hours
- Create a new link token

### "Invalid credentials"
- In sandbox, use: `user_good` / `pass_good`
- Make sure you're using sandbox environment

---

## Next Steps

1. ✅ Generate access_token using HTML page
2. ✅ Get access_token from database
3. ✅ Use access_token in API calls
4. ✅ Test transactions/sync
5. ✅ Trigger real webhooks
