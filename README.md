# Plaid Integration - Complete Implementation

## Overview

This repository contains a complete Plaid integration implementation with:
- `/connections` endpoint with region parameter support
- Webhook handler for Plaid events (TRANSACTIONS.UPDATED, ITEM.LOGIN_REQUIRED, ITEM.NEW_ACCOUNTS_AVAILABLE)
- Transaction ingestion worker (Lambda-style)
- Database schema with soft delete support
- Background job queue for async processing

## Architecture

```
┌─────────────┐
│   Express   │
│   Server    │
└──────┬──────┘
       │
       ├──► POST /connections (with region)
       ├──► POST /webhook (Plaid webhooks)
       └──► POST /create_link_token
       │
       ▼
┌─────────────┐      ┌──────────────┐
│  Database   │      │  Mock Queue  │
│ (PostgreSQL)│      │  (SQS-like)  │
└─────────────┘      └──────┬───────┘
                            │
                            ▼
                    ┌──────────────┐
                    │   Worker     │
                    │  (Lambda)    │
                    └──────────────┘
```

## Features

### 1. Connections Endpoint with Region Support

**Endpoint:** `POST /connections`

**Request:**
```json
{
  "public_token": "public-sandbox-xxx",
  "region": "US",
  "user_id": "user_123",
  "institution_id": "ins_123",
  "institution_name": "Chase"
}
```

**Features:**
- Accepts `region` parameter (US, UK, CA, etc.)
- Validates region against supported regions
- Exchanges public token for access token
- Stores connection with region information
- Returns connection details

### 2. Webhook Handler

**Endpoint:** `POST /webhook`

**Key Features:**
- **Quick Acknowledgment** - Responds within 2 seconds
- **Background Processing** - Delegates work to queue
- **Webhook Signature Verification** - (Ready for production)

**Webhook Scenarios:**

#### TRANSACTIONS.UPDATED
```typescript
// Triggers transaction sync in background
await backgroundQueue.sendMessage({
  type: 'SYNC_TRANSACTIONS',
  payload: { item_id: itemId }
});
```

#### ITEM.LOGIN_REQUIRED
```typescript
// Marks connection as requiring re-authentication
await db.updateItemStatus(itemId, 'login_required');
// Updates connection state - token needs refresh
```

#### ITEM.NEW_ACCOUNTS_AVAILABLE
```typescript
// Fetches new accounts and notifies user
await backgroundQueue.sendMessage({
  type: 'ADD_NEW_ACCOUNTS',
  payload: {
    item_id: itemId,
    account_ids: newAccountIds
  }
});
```

### 3. Transaction Ingestion Worker

**Lambda Handler:** `transactionWorker`

**Features:**
- SQS event handler
- Cursor-based pagination
- Handles added/modified/removed transactions
- Soft delete support (doesn't break sync)
- Efficient incremental syncs

**Process:**
1. Get access token from database
2. Get sync cursor (for incremental sync)
3. Call Plaid `transactionsSync` API
4. Process added/modified transactions (upsert)
5. Process removed transactions (soft delete)
6. Update cursor for next sync

### 4. Database Schema

**Tables:**
- `items` - Plaid connections (items)
- `transactions` - Financial transactions
- `sync_cursors` - Sync state and cursors

**Key Features:**
- Soft delete support (`deleted_at` column)
- Proper indexing for performance
- Foreign key constraints
- Efficient queries with indexes

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **PostgreSQL** (v12 or higher)
- **npm** or **yarn**
- **Plaid Account** (for sandbox/testing)

## Setup Instructions

### Step 1: Clone and Install Dependencies

```bash
# Navigate to project directory
cd MT-9355

# Install all dependencies
npm install
```

### Step 2: Database Setup

#### 2.1 Create PostgreSQL Database

```bash
# Using psql command line
createdb test_task

# Or using SQL
psql -U postgres
CREATE DATABASE test_task;
\q
```

#### 2.2 Initialize Database Tables

The database tables are automatically created when you start the server, but you can also initialize them manually:

```bash
npm run init-db
```

This will create the following tables:
- `items` - Stores Plaid connections
- `transactions` - Stores financial transactions
- `sync_cursors` - Stores sync state for incremental updates

### Step 3: Environment Configuration

#### 3.1 Create `.env` File

Create a `.env` file in the root directory:

```bash
# Copy from example (if available)
cp .env.example .env
```

#### 3.2 Configure Environment Variables

Edit the `.env` file with your configuration:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=postgres
DB_PORT=5432
DB_NAME=test_task

# Plaid Environment (sandbox, development, or production)
PLAID_ENV=sandbox

# US Region Plaid Credentials
PLAID_CLIENT_ID_US=your_us_client_id_here
PLAID_SECRET_US=your_us_secret_here

# CA Region Plaid Credentials (optional)
PLAID_CLIENT_ID_CA=your_ca_client_id_here
PLAID_SECRET_CA=your_ca_secret_here

# EU Region Plaid Credentials (optional)
PLAID_CLIENT_ID_EU=your_eu_client_id_here
PLAID_SECRET_EU=your_eu_secret_here

# Node Environment
NODE_ENV=development
```

#### 3.3 Get Plaid Credentials

1. Sign up for a Plaid account at [https://dashboard.plaid.com](https://dashboard.plaid.com)
2. Navigate to **Team Settings** → **Keys**
3. Copy your **Client ID** and **Secret** for each region (US, CA, EU)
4. For sandbox testing, use the sandbox credentials provided in your Plaid dashboard

**Note:** If credentials are not provided for a region, the application will use a mock client for that region.

### Step 4: Run the Application

#### Development Mode (with auto-reload)

```bash
npm run dev
```

#### Production Mode

```bash
npm start
```

The server will start on `http://localhost:3000`

You should see:
```
[DB] Tables initialized
Server running on http://localhost:3000
Test endpoints:
  POST http://localhost:3000/connections
  POST http://localhost:3000/webhook
```

## How to Use

### 1. Create a Link Token

First, create a Plaid Link token to initialize the Plaid Link flow:

```bash
curl -X POST http://localhost:3000/create_link_token \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "region": "US",
    "webhook_url": "https://yourdomain.com/webhook"
  }'
```

**Response:**
```json
{
  "link_token": "link-sandbox-xxx",
  "expiration": "2024-01-01T12:00:00Z",
  "request_id": "xxx"
}
```

**Parameters:**
- `user_id` (required): Unique identifier for the user
- `region` (optional): Region code - `US`, `CA`, or `EU` (default: `US`)
- `webhook_url` (optional): URL where Plaid will send webhooks

### 2. Connect a Bank Account

Use the `link_token` in your frontend with Plaid Link. After the user completes the flow, you'll receive a `public_token`.

### 3. Exchange Public Token for Access Token

Create a connection by exchanging the public token:

```bash
curl -X POST http://localhost:3000/connections \
  -H "Content-Type: application/json" \
  -d '{
    "public_token": "public-sandbox-xxx",
    "region": "US",
    "user_id": "user_123",
    "institution_id": "ins_123"
  }'
```

**Response:**
```json
{
  "item_id": "item-xxx",
  "status": "connected",
  "region": "US"
}
```

**Parameters:**
- `public_token` (required): Token from Plaid Link flow
- `user_id` (required): User identifier
- `region` (optional): Region code - `US`, `CA`, or `EU` (default: `US`)
- `institution_id` (optional): Institution ID if known

### 4. Handle Webhooks

Plaid will send webhooks to your webhook endpoint. The server automatically acknowledges webhooks quickly and processes them in the background.

#### Test Webhook Locally

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_type": "TRANSACTIONS",
    "webhook_code": "SYNC_UPDATES_AVAILABLE",
    "item_id": "item-xxx"
  }'
```

**Supported Webhook Types:**

1. **TRANSACTIONS.UPDATED** - Triggers transaction sync
   ```json
   {
     "webhook_type": "TRANSACTIONS",
     "webhook_code": "SYNC_UPDATES_AVAILABLE",
     "item_id": "item-xxx"
   }
   ```

2. **ITEM.LOGIN_REQUIRED** - Marks connection for re-authentication
   ```json
   {
     "webhook_type": "ITEM",
     "webhook_code": "LOGIN_REQUIRED",
     "item_id": "item-xxx"
   }
   ```

3. **ITEM.NEW_ACCOUNTS_AVAILABLE** - Processes newly available accounts
   ```json
   {
     "webhook_type": "ITEM",
     "webhook_code": "NEW_ACCOUNTS_AVAILABLE",
     "item_id": "item-xxx",
     "new_accounts": ["acc-xxx"]
   }
   ```

**Response:**
```json
{
  "received": true,
  "processed": true,
  "webhook_type": "TRANSACTIONS",
  "webhook_code": "SYNC_UPDATES_AVAILABLE",
  "item_id": "item-xxx",
  "action": "trigger_transaction_sync"
}
```

### 5. Testing Webhooks with Public URL

For testing webhooks from Plaid's sandbox, you need to expose your local server:

#### Option 1: Using ngrok

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 3000

# Use the provided URL in Plaid dashboard
# Example: https://abc123.ngrok.io/webhook
```

#### Option 2: Using localtunnel

```bash
# Install localtunnel
npm install -g localtunnel

# Expose local server
lt --port 3000

# Use the provided URL in Plaid dashboard
```

#### Configure Webhook in Plaid Dashboard

1. Go to [Plaid Dashboard](https://dashboard.plaid.com)
2. Navigate to **Team Settings** → **Webhooks**
3. Add your webhook URL: `https://your-tunnel-url.ngrok.io/webhook`
4. Save the configuration

## Testing

### Run Automated Tests

```bash
npm test
```

This runs the simulation test that:
1. Creates a connection
2. Simulates a webhook
3. Verifies database state

### Manual Testing

#### Test Connection Creation

```bash
# Start server
npm start

# In another terminal, test connection
curl -X POST http://localhost:3000/connections \
  -H "Content-Type: application/json" \
  -d '{
    "public_token": "public-sandbox-xxx",
    "region": "US",
    "user_id": "test_user"
  }'
```

#### Test Link Token Creation

```bash
curl -X POST http://localhost:3000/create_link_token \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "region": "US"
  }'
```

#### Test Webhook Handler

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_type": "TRANSACTIONS",
    "webhook_code": "SYNC_UPDATES_AVAILABLE",
    "item_id": "item-123"
  }'
```

## Troubleshooting

### Database Connection Issues

**Error:** `relation "items" does not exist`

**Solution:**
```bash
# Initialize database tables
npm run init-db
```

**Error:** `password authentication failed`

**Solution:**
- Check your `.env` file for correct database credentials
- Verify PostgreSQL is running: `pg_isready`
- Check PostgreSQL authentication settings in `pg_hba.conf`

### Plaid API Issues

**Error:** `INVALID_ACCESS_TOKEN`

**Solution:**
- Ensure you're using the correct `access_token` (not `link_token` or `public_token`)
- Verify your Plaid credentials in `.env` are correct
- Check that `PLAID_ENV` matches your credentials (sandbox vs production)

**Error:** `Plaid credentials not found for {region}`

**Solution:**
- Add credentials for the region in `.env`:
  ```
  PLAID_CLIENT_ID_US=your_client_id
  PLAID_SECRET_US=your_secret
  ```
- Or the application will use a mock client for testing

### Webhook Issues

**Webhook not received:**

1. Verify your webhook URL is publicly accessible (use ngrok/localtunnel)
2. Check Plaid dashboard webhook configuration
3. Check server logs for incoming requests
4. Ensure webhook URL is `https://` (not `http://`)

**Webhook returns 500 error:**

1. Check server logs for detailed error messages
2. Verify the `item_id` exists in the database
3. Check database connection is working

### Port Already in Use

**Error:** `Port 3000 is already in use`

**Solution:**
```bash
# Find process using port 3000
# Windows:
netstat -ano | findstr :3000

# Kill the process or change PORT in .env
```

## API Endpoints Reference

### POST /create_link_token

Creates a Plaid Link token for initializing the Plaid Link flow.

**Request:**
```bash
curl -X POST http://localhost:3000/create_link_token \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "region": "US",
    "webhook_url": "https://yourdomain.com/webhook"
  }'
```

**Response:**
```json
{
  "link_token": "link-sandbox-xxx",
  "expiration": "2024-01-01T12:00:00Z",
  "request_id": "xxx"
}
```

**Parameters:**
- `user_id` (string, required): Unique user identifier
- `region` (string, optional): Region code - `US`, `CA`, or `EU` (default: `US`)
- `webhook_url` (string, optional): URL for Plaid webhooks

### POST /connections

Exchanges a public token for an access token and creates a connection.

**Request:**
```bash
curl -X POST http://localhost:3000/connections \
  -H "Content-Type: application/json" \
  -d '{
    "public_token": "public-sandbox-xxx",
    "region": "US",
    "user_id": "user_123",
    "institution_id": "ins_123"
  }'
```

**Response:**
```json
{
  "item_id": "item-xxx",
  "status": "connected",
  "region": "US"
}
```

**Parameters:**
- `public_token` (string, required): Public token from Plaid Link
- `user_id` (string, required): User identifier
- `region` (string, optional): Region code - `US`, `CA`, or `EU` (default: `US`)
- `institution_id` (string, optional): Institution ID if known

**Error Responses:**
- `400` - Missing required fields or invalid region
- `500` - Internal server error (check logs for details)

### POST /webhook

Receives and processes webhooks from Plaid.

**Request:**
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_type": "TRANSACTIONS",
    "webhook_code": "SYNC_UPDATES_AVAILABLE",
    "item_id": "item_123"
  }'
```

**Response:**
```json
{
  "received": true,
  "processed": true,
  "webhook_type": "TRANSACTIONS",
  "webhook_code": "SYNC_UPDATES_AVAILABLE",
  "item_id": "item_123",
  "action": "trigger_transaction_sync"
}
```

**Webhook Types:**

1. **TRANSACTIONS.UPDATED** - New transaction data available
   ```json
   {
     "webhook_type": "TRANSACTIONS",
     "webhook_code": "SYNC_UPDATES_AVAILABLE",
     "item_id": "item_xxx"
   }
   ```

2. **TRANSACTIONS.REMOVED** - Transactions were removed
   ```json
   {
     "webhook_type": "TRANSACTIONS",
     "webhook_code": "TRANSACTIONS_REMOVED",
     "item_id": "item_xxx",
     "removed_transactions": ["tx_xxx"]
   }
   ```

3. **ITEM.LOGIN_REQUIRED** - User needs to re-authenticate
   ```json
   {
     "webhook_type": "ITEM",
     "webhook_code": "LOGIN_REQUIRED",
     "item_id": "item_xxx"
   }
   ```

4. **ITEM.NEW_ACCOUNTS_AVAILABLE** - New accounts available
   ```json
   {
     "webhook_type": "ITEM",
     "webhook_code": "NEW_ACCOUNTS_AVAILABLE",
     "item_id": "item_xxx",
     "new_accounts": ["acc_xxx"]
   }
   ```

## Webhook Flow

### 1. TRANSACTIONS.UPDATED

```
Plaid → Webhook → Quick Acknowledge (200 OK)
                ↓
         Background Queue
                ↓
         Worker (Lambda)
                ↓
         Sync Transactions
                ↓
         Update Database
```

### 2. ITEM.LOGIN_REQUIRED

```
Plaid → Webhook → Quick Acknowledge (200 OK)
                ↓
         Update Item Status
                ↓
         Notify User (in production)
```

### 3. ITEM.NEW_ACCOUNTS_AVAILABLE

```
Plaid → Webhook → Quick Acknowledge (200 OK)
                ↓
         Background Queue
                ↓
         Worker (Lambda)
                ↓
         Fetch New Accounts
                ↓
         Notify User
```

## Soft Delete Implementation

Transactions use soft delete to support deletion without breaking sync:

```typescript
// Soft delete (marks as deleted, doesn't remove from DB)
await db.softDeleteTransactions(transactionIds);

// If transaction is re-added, deleted_at is cleared
await db.upsertTransactionsWithSoftDelete(transactions);
```

**Benefits:**
- Sync continues to work
- No data loss
- Can recover deleted transactions
- Efficient queries with `deleted_at` index

## Background Job Processing

The system uses a mock queue (simulating AWS SQS) to process jobs asynchronously:

```typescript
// Enqueue job
await backgroundQueue.sendMessage({
  type: 'SYNC_TRANSACTIONS',
  payload: { item_id: itemId }
});

// Worker processes job
export const transactionWorker: SQSHandler = async (event) => {
  // Process SQS records
};
```

**In Production:**
- Replace `mockQueue` with AWS SQS
- Deploy worker as Lambda function
- Configure SQS as Lambda trigger

## Token/Connection State Refresh

### When ITEM.LOGIN_REQUIRED is received:

1. **Update Status:**
   ```typescript
   await db.updateItemStatus(itemId, 'login_required');
   ```

2. **Notify User:**
   - Send push notification
   - Show in-app notification
   - Update UI to show "Reconnect" button

3. **Refresh Token:**
   - User re-authenticates via Plaid Link
   - Exchange new public token for access token
   - Update access token in database
   - Set status back to 'active'

## Scaling Considerations

### Current Implementation:
- Database indexing
- Cursor-based pagination
- Background job processing
- Soft delete pattern

### For Production:
- Use AWS SQS instead of mock queue
- Deploy worker as Lambda function
- Add connection pooling
- Implement caching (Redis)
- Add monitoring (CloudWatch)
- Set up dead letter queues

## Frontend Integration

### Using Plaid Link

The project includes a test HTML page at `public/index.html` that demonstrates Plaid Link integration.

1. Start the server: `npm start`
2. Open `http://localhost:3000` in your browser
3. Enter your user ID and select a region
4. Click "Start Link" to initialize Plaid Link
5. Complete the bank connection flow

### Integration Example

```javascript
// 1. Create Link Token
const response = await fetch('/create_link_token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: 'user_123',
    region: 'US',
    webhook_url: 'https://yourdomain.com/webhook'
  })
});
const { link_token } = await response.json();

// 2. Initialize Plaid Link
const handler = Plaid.create({
  token: link_token,
  onSuccess: async (public_token, metadata) => {
    // 3. Exchange public token for access token
    await fetch('/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        public_token: public_token,
        region: 'US',
        user_id: 'user_123',
        institution_id: metadata.institution.institution_id
      })
    });
  }
});

handler.open();
```

## File Structure

```
MT-9355/
├── src/
│   ├── index.ts           # Express server setup and routing
│   ├── connections.ts     # /connections endpoint handler
│   ├── webhook.ts          # /webhook endpoint handler
│   ├── linkToken.ts        # /create_link_token endpoint handler
│   ├── worker.ts           # Transaction ingestion worker (Lambda-style)
│   ├── db.ts               # Database operations and schema
│   ├── plaidClient.ts      # Plaid client factory (region-specific)
│   ├── mockQueue.ts        # Mock SQS queue for local development
│   └── types.ts            # TypeScript type definitions
├── scripts/
│   ├── init-db.ts          # Database initialization script
│   └── trigger-plaid-webhook.ps1  # PowerShell script for testing webhooks
├── test/
│   └── simulation.ts       # Automated test simulation
├── public/
│   └── index.html          # Frontend test page with Plaid Link
├── .env                    # Environment variables (not in git)
├── .env.example            # Example environment file
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── nodemon.json            # Nodemon configuration for dev mode
└── README.md               # This file
```

## Development Scripts

```bash
# Install dependencies
npm install

# Start server in development mode (with auto-reload)
npm run dev

# Start server in production mode
npm start

# Build TypeScript to JavaScript
npm run build

# Initialize database tables
npm run init-db

# Run automated tests
npm test
```

## Production Deployment

### AWS Lambda Setup

#### 1. Build the Application

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

#### 2. Package for Lambda

```bash
# Create deployment package
cd dist
zip -r ../lambda.zip .
cd ..
```

#### 3. Deploy Lambda Functions

**API Gateway + Lambda:**
- Deploy `index.ts` handlers as Lambda functions
- Configure API Gateway to trigger Lambda functions
- Set handler paths: `index.createConnection`, `index.handleWebhook`, etc.

**Worker Lambda:**
- Deploy `worker.ts` as a separate Lambda function
- Set handler: `worker.transactionWorker`
- Configure SQS as trigger source

#### 4. Replace Mock Queue with AWS SQS

Update `src/mockQueue.ts` to use AWS SQS SDK:

```typescript
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqs = new SQSClient({ region: process.env.AWS_REGION });

export const backgroundQueue = {
  sendMessage: async (message: QueueMessage) => {
    await sqs.send(new SendMessageCommand({
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify(message)
    }));
  }
};
```

#### 5. Configure Environment Variables

Set in Lambda function configuration:
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_PORT`, `DB_NAME`
- `PLAID_CLIENT_ID_US`, `PLAID_SECRET_US` (and CA, EU if needed)
- `PLAID_ENV` (sandbox, development, or production)
- `AWS_REGION`
- `SQS_QUEUE_URL`

#### 6. Database Considerations

- Use AWS RDS for PostgreSQL
- Configure VPC settings for Lambda to access RDS
- Set up connection pooling
- Enable SSL connections

#### 7. Webhook Configuration

- Update webhook URL in Plaid Dashboard to your API Gateway endpoint
- Implement webhook signature verification (see Plaid docs)
- Use HTTPS endpoints only

## Security

- Webhook signature verification (ready for production)
- Access tokens stored securely
- SQL injection protection (parameterized queries)
- Input validation

## Additional Resources

### Plaid Documentation

- [Plaid API Documentation](https://plaid.com/docs/)
- [Plaid Link Documentation](https://plaid.com/docs/link/)
- [Plaid Webhooks Guide](https://plaid.com/docs/api/webhooks/)
- [Plaid Sandbox Testing](https://plaid.com/docs/sandbox/)

### Database Schema

The database schema is automatically created by `db.initializeTables()`. The schema includes:

- **items** - Stores Plaid connections with access tokens and region info
- **transactions** - Stores transaction data with soft delete support
- **sync_cursors** - Stores sync cursors for incremental transaction syncing

See `src/db.ts` for the complete schema definition.

### Type Definitions

All TypeScript types are defined in `src/types.ts`:
- `Item` - Plaid connection/item
- `Transaction` - Financial transaction
- `SyncCursor` - Sync state
- `PlaidWebhookBody` - Webhook payload
- `QueueMessage` - Background job message

### Code Documentation

All functions include JSDoc comments explaining:
- Purpose and functionality
- Parameters and return types
- Business logic and edge cases
- Usage examples where relevant

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review server logs for detailed error messages
3. Verify environment configuration
4. Check Plaid Dashboard for API status

## License

ISC
