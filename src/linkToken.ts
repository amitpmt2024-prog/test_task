import { APIGatewayProxyHandler } from 'aws-lambda';
import { plaidClient } from './plaidClient';
import { CountryCode, Products } from 'plaid';

const VALID_REGIONS = ['US', 'CA', 'EU'];
const REGION_TO_COUNTRY: Record<string, CountryCode> = {
  'US': CountryCode.Us,
  'CA': CountryCode.Ca,
  'EU': CountryCode.Gb,
};
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const createLinkToken: APIGatewayProxyHandler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { webhook_url, user_id = 'test-user-id', region = 'US' } = body;

    const normalizedRegion = region.toUpperCase();
    if (!VALID_REGIONS.includes(normalizedRegion)) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: `Invalid region. Valid: ${VALID_REGIONS.join(', ')}` })
      };
    }

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user_id },
      client_name: 'Plaid Test App',
      products: [Products.Transactions],
      country_codes: [REGION_TO_COUNTRY[normalizedRegion]],
      language: 'en',
      webhook: webhook_url || undefined,
    });

    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(response.data) };
  } catch (error: any) {
    console.error('[API] Link token error:', error);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Failed to create link token', message: error.message || 'Unknown error' })
    };
  }
};
