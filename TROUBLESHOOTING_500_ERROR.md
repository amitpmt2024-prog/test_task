# Troubleshooting 500 Error on /connections Endpoint

## Quick Fix: Check Server Logs

The 500 error is being logged to your server console. **Check your server terminal** for the actual error message.

Look for:
```
Connection error: [actual error here]
```

---

## Common Causes and Solutions

### 1. Database Connection Issue

**Error in logs:** `[DB] Error saving item: ...`

**Solution:**
- Check database is running
- Verify database credentials in `.env`:
  ```env
  DB_HOST=localhost
  DB_USER=postgres
  DB_PASSWORD=postgres
  DB_PORT=5432
  DB_NAME=test_task
  ```
- Test database connection:
  ```sql
  -- Try connecting to your database
  psql -h localhost -U postgres -d test_task
  ```

### 2. Plaid API Error

**Error in logs:** `Connection error: ...` (from Plaid API)

**Possible causes:**
- Invalid `public_token` (already used or expired)
- Missing Plaid credentials
- Wrong Plaid environment

**Solution:**
- Verify `.env` has Plaid credentials:
  ```env
  PLAID_CLIENT_ID=your-client-id
  PLAID_SECRET=your-sandbox-secret
  PLAID_ENV=sandbox
  ```
- Make sure `public_token` is fresh (not already used)
- Public tokens expire quickly - use immediately after getting from Plaid Link

### 3. Missing Environment Variables

**Error in logs:** `Plaid credentials not found`

**Solution:**
- Check `.env` file exists in project root
- Verify all required variables are set
- Restart server after updating `.env`

### 4. Database Table Not Created

**Error in logs:** `relation "items" does not exist`

**Solution:**
- Run the schema SQL:
  ```sql
  -- Run schema.sql to create tables
  psql -h localhost -U postgres -d test_task -f schema.sql
  ```

### 5. Invalid Public Token

**Error in logs:** Plaid API error about invalid token

**Solution:**
- Public tokens can only be used once
- Public tokens expire quickly (within minutes)
- Get a fresh `public_token` from Plaid Link
- Use it immediately

---

## Step-by-Step Debugging

### Step 1: Check Server Logs

Run your server and watch the console:
```powershell
npm start
```

Then make your cURL request and **watch the server terminal** for error messages.

### Step 2: Test Database Connection

```sql
-- Connect to database
psql -h localhost -U postgres -d test_task

-- Check if items table exists
SELECT * FROM items LIMIT 1;

-- If error, create tables
\i schema.sql
```

### Step 3: Test Plaid Connection

```powershell
# Test if Plaid credentials work
curl -X POST http://localhost:3000/create_link_token `
  -H "Content-Type: application/json" `
  -d '{"user_id": "user_123", "region": "US"}'
```

If this fails, check your Plaid credentials.

### Step 4: Verify Public Token is Fresh

**Important:** Public tokens expire quickly and can only be used once!

1. Get a **fresh** `public_token` from Plaid Link
2. Use it **immediately** in the `/connections` request
3. Don't reuse old public tokens

---

## Improved Error Response

I've updated the code to return more detailed error messages. After restarting your server, you'll see:

```json
{
  "error": "Internal Server Error",
  "message": "Actual error message here",
  "details": { ... }  // In development mode
}
```

This will help identify the exact issue.

---

## Quick Test: Verify Everything Works

### 1. Test Database
```sql
SELECT 1;
```

### 2. Test Plaid Credentials
```powershell
curl -X POST http://localhost:3000/create_link_token `
  -H "Content-Type: application/json" `
  -d '{"user_id": "test", "region": "US"}'
```

### 3. Test Connection with Fresh Token
1. Get fresh `public_token` from Plaid Link (HTML page)
2. Use it immediately in `/connections` request

---

## Most Likely Issue: Public Token Already Used

**If you're reusing a `public_token`**, you'll get a 500 error because:
- Public tokens can only be exchanged once
- After exchange, they become invalid

**Solution:**
1. Get a **new** `public_token` from Plaid Link
2. Use it **immediately** in your `/connections` request
3. Don't save and reuse public tokens

---

## Next Steps

1. ✅ Check server logs for actual error
2. ✅ Verify database is running and accessible
3. ✅ Verify Plaid credentials in `.env`
4. ✅ Get fresh `public_token` from Plaid Link
5. ✅ Use fresh token immediately in request

---

## Still Getting 500 Error?

Share the **exact error message from server logs** and I can help debug further!
