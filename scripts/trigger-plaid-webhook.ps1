# PowerShell Script to Trigger Real Plaid Sandbox Webhooks
# Usage: .\scripts\trigger-plaid-webhook.ps1 -ItemId "item-xxx" -WebhookType "TRANSACTIONS"

param(
    [Parameter(Mandatory=$true)]
    [string]$ItemId,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("TRANSACTIONS", "ITEM")]
    [string]$WebhookType = "TRANSACTIONS",
    
    [Parameter(Mandatory=$false)]
    [string]$AccessToken = ""
)

# Load environment variables
$env:Path = "$env:Path;$PSScriptRoot\.."

# Get Plaid credentials from environment
$PLAID_CLIENT_ID = $env:PLAID_CLIENT_ID
$PLAID_SECRET = $env:PLAID_SECRET

if (-not $PLAID_CLIENT_ID -or -not $PLAID_SECRET) {
    Write-Host "❌ Error: PLAID_CLIENT_ID and PLAID_SECRET must be set in environment variables" -ForegroundColor Red
    Write-Host "   Create a .env file or set them in PowerShell:" -ForegroundColor Yellow
    Write-Host "   `$env:PLAID_CLIENT_ID = 'your-client-id'" -ForegroundColor Yellow
    Write-Host "   `$env:PLAID_SECRET = 'your-sandbox-secret'" -ForegroundColor Yellow
    exit 1
}

# If access_token not provided, try to get from database
if (-not $AccessToken) {
    Write-Host "⚠️  Access token not provided. You need to provide it manually." -ForegroundColor Yellow
    Write-Host "   Get it from database: SELECT access_token FROM items WHERE item_id = '$ItemId';" -ForegroundColor Yellow
    $AccessToken = Read-Host "Enter access_token for item $ItemId"
}

if (-not $AccessToken) {
    Write-Host "❌ Error: Access token is required" -ForegroundColor Red
    exit 1
}

Write-Host "`n🚀 Triggering Plaid Sandbox Webhook..." -ForegroundColor Cyan
Write-Host "   Item ID: $ItemId" -ForegroundColor Gray
Write-Host "   Webhook Type: $WebhookType" -ForegroundColor Gray
Write-Host ""

switch ($WebhookType) {
    "TRANSACTIONS" {
        Write-Host "📊 Triggering TRANSACTIONS.SYNC_UPDATES_AVAILABLE webhook..." -ForegroundColor Green
        Write-Host "   Calling transactions/sync API..." -ForegroundColor Gray
        
        $body = @{
            access_token = $AccessToken
            cursor = ""
        } | ConvertTo-Json
        
        try {
            $response = Invoke-RestMethod -Uri "https://sandbox.plaid.com/transactions/sync" `
                -Method Post `
                -Headers @{
                    "Content-Type" = "application/json"
                    "PLAID-CLIENT-ID" = $PLAID_CLIENT_ID
                    "PLAID-SECRET" = $PLAID_SECRET
                } `
                -Body $body
            
            Write-Host "✅ Success! transactions/sync API called" -ForegroundColor Green
            Write-Host "   Plaid will automatically send TRANSACTIONS.SYNC_UPDATES_AVAILABLE webhook" -ForegroundColor Gray
            Write-Host "   Check your server logs and tunnel for incoming webhook" -ForegroundColor Gray
            Write-Host ""
            Write-Host "Response:" -ForegroundColor Cyan
            $response | ConvertTo-Json -Depth 5
        }
        catch {
            Write-Host "❌ Error calling Plaid API:" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
            if ($_.ErrorDetails.Message) {
                Write-Host $_.ErrorDetails.Message -ForegroundColor Red
            }
            exit 1
        }
    }
    
    "ITEM" {
        Write-Host "⚠️  For ITEM webhooks, use Plaid Dashboard:" -ForegroundColor Yellow
        Write-Host "   1. Go to https://dashboard.plaid.com/" -ForegroundColor Gray
        Write-Host "   2. Navigate to Items or Sandbox section" -ForegroundColor Gray
        Write-Host "   3. Find item: $ItemId" -ForegroundColor Gray
        Write-Host "   4. Use 'Set Item Error' or 'Add Account' to trigger webhooks" -ForegroundColor Gray
        Write-Host ""
        Write-Host "   Or manually trigger via API (if available in your plan)" -ForegroundColor Gray
    }
}

Write-Host "`n📝 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Check your server logs for webhook processing" -ForegroundColor Gray
Write-Host "   2. Check tunnel terminal for incoming requests" -ForegroundColor Gray
Write-Host "   3. Verify database updates (transactions, item status, etc.)" -ForegroundColor Gray
Write-Host ""
