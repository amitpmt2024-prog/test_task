# Quick Reference - cURL Commands

## 1. Create Link Token (with Region)

```bash
curl --location 'http://localhost:3000/create_link_token' \
--header 'Content-Type: application/json' \
--data '{
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

## 2. Create Connection (with Region)

```bash
curl --location 'http://localhost:3000/connections' \
--header 'Content-Type: application/json' \
--data '{
    "public_token": "public-sandbox-xxx",
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

## 3. Test Webhooks

### Manual Webhook Test (Simulates Plaid)

**TRANSACTIONS.UPDATED:**
```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{"webhook_type":"TRANSACTIONS","webhook_code":"SYNC_UPDATES_AVAILABLE","item_id":"item-xxx"}'
```

**ITEM.LOGIN_REQUIRED:**
```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{"webhook_type":"ITEM","webhook_code":"LOGIN_REQUIRED","item_id":"item-xxx"}'
```

**ITEM.NEW_ACCOUNTS_AVAILABLE:**
```powershell
curl -X POST http://localhost:3000/webhook `
  -H "Content-Type: application/json" `
  -d '{"webhook_type":"ITEM","webhook_code":"NEW_ACCOUNTS_AVAILABLE","item_id":"item-xxx","new_accounts":["acc-123"]}'
```

**Response (all webhooks):**
```json
{
  "received": true
}
```

### Trigger Real Webhook from Plaid (Using Access Token)

```powershell
# First get access_token: SELECT access_token FROM items ORDER BY created_at DESC LIMIT 1;
curl -X POST https://sandbox.plaid.com/transactions/sync `
  -H "Content-Type: application/json" `
  -H "PLAID-CLIENT-ID: 6970a2d39f83a8002183b2ca" `
  -H "PLAID-SECRET: 64284084aac897560a1cbfdc9fa5bb" `
  -d '{"access_token":"access-sandbox-xxx","cursor":""}'
```

**Note:** 
- For detailed webhook testing guide, see `WEBHOOK_TESTING_GUIDE.md`
- For complete webhook roadmap, see `WEBHOOK_ROADMAP_WITH_ACCESS_TOKEN.md`
- For all cURL commands, see `TEST_WEBHOOKS_CURL.md`

## Supported Regions

Both endpoints support these regions only:
- **US** (United States)
- **CA** (Canada)
- **EU** (European Union - maps to GB/UK for Plaid)

Any other region will return a 400 error.

## Complete Flow

1. **Get Link Token:**
   ```bash
   curl --location 'http://localhost:3000/create_link_token' \
   --header 'Content-Type: application/json' \
   --data '{"user_id": "user_123", "region": "US"}'
   ```

2. **Use Link Token in Plaid Link** (frontend) to get `public_token`

3. **Create Connection:**
   ```bash
   curl --location 'http://localhost:3000/connections' \
   --header 'Content-Type: application/json' \
   --data '{
       "public_token": "public-sandbox-xxx",
       "region": "US",
       "user_id": "user_123"
   }'
   ```
