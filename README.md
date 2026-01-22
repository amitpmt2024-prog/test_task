# Plaid Integration - Complete Implementation

## Overview

This repository contains a complete Plaid integration implementation with:
- ✅ `/connections` endpoint with region parameter support
- ✅ Webhook handler for Plaid events (TRANSACTIONS.UPDATED, ITEM.LOGIN_REQUIRED, ITEM.NEW_ACCOUNTS_AVAILABLE)
- ✅ Transaction ingestion worker (Lambda-style)
- ✅ Database schema with soft delete support
- ✅ Background job queue for async processing

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
- ✅ **Quick Acknowledgment** - Responds within 2 seconds
- ✅ **Background Processing** - Delegates work to queue
- ✅ **Webhook Signature Verification** - (Ready for production)

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
- ✅ SQS event handler
- ✅ Cursor-based pagination
- ✅ Handles added/modified/removed transactions
- ✅ Soft delete support (doesn't break sync)
- ✅ Efficient incremental syncs

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
- ✅ Soft delete support (`deleted_at` column)
- ✅ Proper indexing for performance
- ✅ Foreign key constraints
- ✅ Efficient queries with indexes

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup

```bash
# Create database
createdb test_task

# Run schema
psql -U postgres -d test_task -f schema.sql
```

### 3. Environment Variables

Create `.env` file:

```env
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=postgres
DB_PORT=5432
DB_NAME=test_task

# Plaid credentials (for production)
PLAID_CLIENT_ID=your-client-id
PLAID_SECRET=your-secret
PLAID_ENV=sandbox
```

### 4. Run Server

```bash
npm start
```

Server runs on `http://localhost:3000`

## API Endpoints

### Create Connection

```bash
curl -X POST http://localhost:3000/connections \
  -H "Content-Type: application/json" \
  -d '{
    "public_token": "public-sandbox-xxx",
    "region": "US",
    "user_id": "user_123"
  }'
```

### Webhook (Plaid)

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_type": "TRANSACTIONS",
    "webhook_code": "SYNC_UPDATES_AVAILABLE",
    "item_id": "item_123"
  }'
```

### Create Link Token

```bash
curl -X POST http://localhost:3000/create_link_token \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "webhook_url": "https://yourdomain.com/webhook"
  }'
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
- ✅ Sync continues to work
- ✅ No data loss
- ✅ Can recover deleted transactions
- ✅ Efficient queries with `deleted_at` index

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
- ✅ Database indexing
- ✅ Cursor-based pagination
- ✅ Background job processing
- ✅ Soft delete pattern

### For Production:
- Use AWS SQS instead of mock queue
- Deploy worker as Lambda function
- Add connection pooling
- Implement caching (Redis)
- Add monitoring (CloudWatch)
- Set up dead letter queues

## Testing

### Test Connection Creation

```bash
npm test
```

Or manually:

```bash
# Start server
npm start

# In another terminal
curl -X POST http://localhost:3000/connections \
  -H "Content-Type: application/json" \
  -d '{
    "public_token": "public-sandbox-xxx",
    "region": "US",
    "user_id": "test_user"
  }'
```

### Test Webhook

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_type": "TRANSACTIONS",
    "webhook_code": "SYNC_UPDATES_AVAILABLE",
    "item_id": "item_123"
  }'
```

## File Structure

```
src/
├── index.ts           # Express server setup
├── connections.ts     # Connections endpoint
├── webhook.ts         # Webhook handler
├── worker.ts          # Transaction ingestion worker
├── db.ts              # Database operations
├── plaidClient.ts     # Plaid client (mocked)
├── mockQueue.ts       # Mock SQS queue
├── linkToken.ts       # Link token creation
└── types.ts           # TypeScript types

schema.sql             # Database schema
```

## Production Deployment

### AWS Lambda Setup

1. **Package Lambda:**
   ```bash
   npm run build
   zip -r lambda.zip dist/
   ```

2. **Deploy to Lambda:**
   - Create Lambda function
   - Upload `lambda.zip`
   - Set handler: `worker.transactionWorker`

3. **Configure SQS Trigger:**
   - Create SQS queue
   - Add SQS as Lambda trigger
   - Update `mockQueue.ts` to use real SQS

4. **Set Environment Variables:**
   - Database connection
   - Plaid credentials
   - AWS region

## Security

- ✅ Webhook signature verification (ready for production)
- ✅ Access tokens stored securely
- ✅ SQL injection protection (parameterized queries)
- ✅ Input validation

## Documentation

- **Schema:** `schema.sql`
- **Types:** `src/types.ts`
- **Implementation:** See source files for detailed comments

## License

ISC
