// This is where we would configure the real Plaid client.
// For the purpose of this exercise and to avoid needing real API keys, 
// we will stub the client methods.

export const plaidClient = {
  itemPublicTokenExchange: async (request: { public_token: string }) => {
    // Mock response
    console.log(`[Plaid] Exchanging public token: ${request.public_token}`);
    return {
      data: {
        access_token: `access-sandbox-${Math.random().toString(36).substring(7)}`,
        item_id: `item-${Math.random().toString(36).substring(7)}`,
        request_id: 'mock-request-id'
      }
    };
  },
  transactionsSync: async (request: { access_token: string, cursor?: string, count?: number }) => {
     console.log(`[Plaid] Syncing transactions for token: ${request.access_token}, cursor: ${request.cursor}`);
     // Mock transactions
     const newCursor = `cursor-${Date.now()}`;
     const added = [
         {
             transaction_id: `tx-${Math.random().toString(36).substring(7)}`,
             account_id: 'acc-123',
             amount: 12.50,
             iso_currency_code: 'USD',
             date: '2023-10-27',
             name: 'Uber Ride',
             merchant_name: 'Uber',
             pending: false,
         },
         {
            transaction_id: `tx-${Math.random().toString(36).substring(8)}`,
            account_id: 'acc-123',
            amount: 4.99,
            iso_currency_code: 'USD',
            date: '2023-10-28',
            name: 'Coffee Shop',
            merchant_name: 'Starbucks',
            pending: false,
        }
     ];
     
     return {
         data: {
             added: added,
             modified: [],
             removed: [{ transaction_id: 'tx-old-123' }],
             next_cursor: newCursor,
             has_more: false
         }
     }
  },
  linkTokenCreate: async (request: any) => {
    console.log(`[Plaid] Creating Link Token for user: ${request.user.client_user_id} with webhook: ${request.webhook}`);
    return {
        data: {
            link_token: `link-sandbox-${Math.random().toString(36).substring(7)}`,
            expiration: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
            request_id: 'mock-request-id'
        }
    };
  }
};
