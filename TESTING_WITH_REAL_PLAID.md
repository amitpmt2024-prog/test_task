# Testing with Real Plaid Account

## Step 1: Get Your Plaid Credentials

1. Go to [Plaid Dashboard](https://dashboard.plaid.com/)
2. Sign in to your account
3. Navigate to **Team Settings** → **Keys**
4. Copy your:
   - **Client ID** (starts with something like `5f...`)
   - **Sandbox Secret** (for testing) or **Development/Production Secret**

## Step 2: Configure Environment Variables

Create or update your `.env` file in the project root:

```env
# Plaid Credentials
PLAID_CLIENT_ID=your-client-id-here
PLAID_SECRET=your-sandbox-secret-here
PLAID_ENV=sandbox

# Database (if not already set)
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=postgres
DB_PORT=5432
DB_NAME=test_task
```

**Important:** 
- For testing, use `PLAID_ENV=sandbox`
- Never commit your `.env` file to git!

## Step 3: Install Dependencies (if not already done)

```bash
npm install
```

## Step 4: Start the Server

```bash
npm start
```

You should see:
```
✅ Using real Plaid client (sandbox environment)
Server running on http://localhost:3000
```

## Step 5: Test with Plaid Link (Web Interface)

### Option A: Use the Built-in HTML Page

1. Open your browser and go to: `http://localhost:3000`
2. You'll see the Plaid Link test page
3. Enter your User ID (or use default `user_123`)
4. (Optional) Enter webhook URL if you have ngrok set up
5. Click **"Start Link"**
6. Plaid Link will open
7. Use Plaid's test credentials:
   - **Username:** `user_good`
   - **Password:** `pass_good`
8. Select a test bank (e.g., "First Platypus Bank")
9. Complete the flow
10. The connection will be created automatically!

### Option B: Manual Testing with cURL

#### Step 1: Create Link Token

```bash
curl -X POST http://localhost:3000/create_link_token \
  -H "Content-Type: application/json" \
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

#### Step 2: Use Plaid Link to Get Public Token

You need to use Plaid Link (the frontend component) to get a `public_token`. You can:

1. **Use the HTML page** at `http://localhost:3000` (easiest)
2. **Create your own frontend** using Plaid Link
3. **Use Plaid's Quickstart** guide

#### Step 3: Exchange Public Token for Connection

Once you have the `public_token` from Plaid Link:

```bash
curl -X POST http://localhost:3000/connections \
  -H "Content-Type: application/json" \
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

## Step 6: Test Webhooks

### Option A: Test Real Webhooks from Plaid (Recommended)

For **real webhooks from Plaid Sandbox**, see the detailed guide:
- **📖 [TESTING_REAL_PLAID_WEBHOOKS.md](./TESTING_REAL_PLAID_WEBHOOKS.md)** - Complete guide for real webhook testing

**Quick Start:**
1. Set up tunnel (localtunnel/ngrok)
2. Configure webhook URL in Plaid Dashboard
3. Create connection (item)
4. Trigger real webhooks from Plaid API or Dashboard

### Option B: Manual Testing with cURL (Static Response)

For **quick manual testing** (static response, no real Plaid webhook):
- See **📖 [WEBHOOK_TESTING_GUIDE.md](./WEBHOOK_TESTING_GUIDE.md)** - Method 2

**Note:** Manual cURL gives static responses. For real Plaid webhooks, use Option A.

## Testing Different Regions

### US Region (Default)
```bash
curl -X POST http://localhost:3000/create_link_token \
  -H "Content-Type: application/json" \
  -d '{"user_id": "user_123", "region": "US"}'
```

### UK Region
```bash
curl -X POST http://localhost:3000/create_link_token \
  -H "Content-Type: application/json" \
  -d '{"user_id": "user_123", "region": "UK"}'
```

### Canada Region
```bash
curl -X POST http://localhost:3000/create_link_token \
  -H "Content-Type: application/json" \
  -d '{"user_id": "user_123", "region": "CA"}'
```

## Plaid Sandbox Test Credentials

For testing in sandbox mode, use these credentials:

### Standard Test Credentials
- **Username:** `user_good`
- **Password:** `pass_good`

### Test Banks
- **First Platypus Bank** - Standard bank
- **First Gingham Credit Union** - Credit union
- **Tartan Bank** - Another test bank

### Test Scenarios
- **user_good / pass_good** - Successful connection
- **user_bad / pass_bad** - Connection error
- **user_locked / pass_locked** - Account locked

## Troubleshooting

### Error: "Plaid credentials not found"
- Check your `.env` file exists
- Verify `PLAID_CLIENT_ID` and `PLAID_SECRET` are set
- Restart the server after updating `.env`

### Error: "Invalid client_id or secret"
- Double-check your credentials in Plaid Dashboard
- Make sure you're using the correct environment (sandbox/development/production)
- Verify `PLAID_ENV` matches your secret type

### Error: "Link token expired"
- Link tokens expire after 4 hours
- Create a new link token

### Webhook not working
- Make sure ngrok is running
- Verify webhook URL in Plaid Dashboard matches ngrok URL
- Check server logs for errors

## Next Steps

1. ✅ Test connection creation
2. ✅ Test transaction sync (via webhook)
3. ✅ Test different regions
4. ✅ Test webhook scenarios (LOGIN_REQUIRED, NEW_ACCOUNTS_AVAILABLE)

## Production Deployment

When ready for production:

1. Update `PLAID_ENV=production` in `.env`
2. Use production credentials from Plaid Dashboard
3. Update webhook URL to production domain
4. Test thoroughly before going live
