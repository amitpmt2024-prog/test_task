// Real Plaid client configuration
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import * as dotenv from 'dotenv';

dotenv.config();

// Get Plaid credentials from environment variables
const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || 'sandbox'; 

// Create mock client interface
const createMockClient = () => ({
  itemPublicTokenExchange: async (request: { public_token: string }) => {
    console.log(`[Plaid Mock] Exchanging public token: ${request.public_token}`);
    return {
      data: {
        access_token: `access-sandbox-${Math.random().toString(36).substring(7)}`,
        item_id: `item-${Math.random().toString(36).substring(7)}`,
        request_id: 'mock-request-id'
      }
    };
  },
  transactionsSync: async (request: { access_token: string, cursor?: string, count?: number }) => {
    console.log(`[Plaid Mock] Syncing transactions`);
    const newCursor = `cursor-${Date.now()}`;
    return {
      data: {
        added: [],
        modified: [],
        removed: [],
        next_cursor: newCursor,
        has_more: false
      }
    };
  },
  linkTokenCreate: async (request: any) => {
    console.log(`[Plaid Mock] Creating Link Token`);
    return {
      data: {
        link_token: `link-sandbox-${Math.random().toString(36).substring(7)}`,
        expiration: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        request_id: 'mock-request-id'
      }
    };
  },
  itemGet: async (request: { access_token: string }) => {
    return {
      data: {
        item: {
          item_id: 'mock-item-id',
          institution_id: null
        }
      }
    };
  },
  accountsGet: async (request: { access_token: string }) => {
    return {
      data: {
        accounts: []
      }
    };
  }
});

// Validate credentials and create appropriate client
let plaidClient: PlaidApi | ReturnType<typeof createMockClient>;

if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
  console.warn('⚠️  Plaid credentials not found in environment variables.');
  console.warn('⚠️  Using mock client. Set PLAID_CLIENT_ID and PLAID_SECRET to use real Plaid API.');
  plaidClient = createMockClient();
} else {
  // Use real Plaid client
  console.log(`✅ Using real Plaid client (${PLAID_ENV} environment)`);
  
  const configuration = new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV as keyof typeof PlaidEnvironments],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': PLAID_CLIENT_ID,
        'PLAID-SECRET': PLAID_SECRET,
      },
    },
  });

  plaidClient = new PlaidApi(configuration);
}

export { plaidClient };
