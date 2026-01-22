/**
 * Plaid Client Factory
 * 
 * Creates and manages Plaid API clients for different regions (US, CA, EU).
 * Each region can have its own credentials configured via environment variables.
 * 
 * Features:
 * - Region-specific credential management
 * - Client caching for performance
 * - Mock client fallback for development
 */

import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import * as dotenv from 'dotenv';

dotenv.config();

const PLAID_ENV = process.env.PLAID_ENV || 'sandbox';

type Region = 'US' | 'CA' | 'EU';

interface PlaidCredentials {
  clientId: string;
  secret: string;
}

/**
 * Retrieves Plaid credentials for a specific region from environment variables.
 * 
 * Looks for environment variables in the format:
 * - PLAID_CLIENT_ID_{REGION}
 * - PLAID_SECRET_{REGION}
 * 
 * @param region - Region code (US, CA, or EU)
 * @returns Credentials object if found, null otherwise
 */
const getCredentials = (region: Region): PlaidCredentials | null => {
  const clientId = process.env[`PLAID_CLIENT_ID_${region}`];
  const secret = process.env[`PLAID_SECRET_${region}`];
  
  if (clientId && secret) {
    return { clientId, secret };
  }
  return null;
};

/**
 * Creates a mock Plaid client for development/testing when credentials are not available.
 * 
 * Returns a client with the same interface as the real Plaid client but
 * returns mock data instead of making actual API calls.
 * 
 * @returns Mock Plaid client object
 */
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

/**
 * Creates a Plaid API client for a specific region.
 * 
 * Uses region-specific credentials from environment variables. If credentials
 * are not found for the region, returns a mock client instead.
 * 
 * @param region - Region code (US, CA, or EU)
 * @returns PlaidApi instance or mock client
 */
const createPlaidClient = (region: Region): PlaidApi | ReturnType<typeof createMockClient> => {
  const creds = getCredentials(region);
  
  if (!creds) {
    console.warn(`Plaid credentials not found for ${region}. Using mock client.`);
    return createMockClient();
  }
  
  const config = new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV as keyof typeof PlaidEnvironments],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': creds.clientId,
        'PLAID-SECRET': creds.secret,
      },
    },
  });
  
  return new PlaidApi(config);
};

const clientCache = new Map<Region, PlaidApi | ReturnType<typeof createMockClient>>();

/**
 * Gets or creates a cached Plaid client for a specific region.
 * 
 * Clients are cached per region to avoid recreating them on every request.
 * This improves performance and reduces overhead.
 * 
 * @param region - Region code (US, CA, or EU)
 * @returns Cached PlaidApi instance or mock client for the region
 */
export const getPlaidClient = (region: Region): PlaidApi | ReturnType<typeof createMockClient> => {
  if (!clientCache.has(region)) {
    clientCache.set(region, createPlaidClient(region));
  }
  return clientCache.get(region)!;
};
