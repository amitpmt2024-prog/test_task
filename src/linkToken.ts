import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPlaidClient } from './plaidClient';
import { CountryCode, Products } from 'plaid';

export const createLinkToken: APIGatewayProxyHandler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const { webhook_url, user_id = 'test-user-id', region = 'US' } = body;

    const regionUpper = region.toUpperCase();
    if (!['US', 'CA', 'EU'].includes(regionUpper)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid region. Valid: US, CA, EU' })
      };
    }

    const countryMap: Record<string, CountryCode> = {
      'US': CountryCode.Us,
      'CA': CountryCode.Ca,
      'EU': CountryCode.Gb,
    };

    const client = getPlaidClient(regionUpper as 'US' | 'CA' | 'EU');
    const response = await client.linkTokenCreate({
      user: { client_user_id: user_id },
      client_name: 'Plaid Test App',
      products: [Products.Transactions],
      country_codes: [countryMap[regionUpper]],
      language: 'en',
      webhook: webhook_url || undefined,
    });

    return { 
      statusCode: 200, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response.data) 
    };
  } catch (error: any) {
    console.error('Error creating link token:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Failed to create link token', 
        message: error.message || 'Unknown error' 
      })
    };
  }
};
