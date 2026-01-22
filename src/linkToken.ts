import { APIGatewayProxyHandler } from 'aws-lambda';
import { plaidClient } from './plaidClient';
import { CountryCode, Products } from 'plaid';

export const createLinkToken: APIGatewayProxyHandler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const webhookUrl = body.webhook_url; 
    const userId = body.user_id || 'test-user-id';
    const region = body.region || 'US'; // Support region parameter

    // Validate region FIRST - Only allow US, CA, and EU
    const validRegions = ['US', 'CA', 'EU'];
    const normalizedRegion = region.toUpperCase();
    if (!validRegions.includes(normalizedRegion)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: `Invalid region: ${region}. Valid regions: US, CA, EU`
        }),
      };
    }

    // Map region to country code - Only US, CA, and EU allowed
    // EU maps to GB (United Kingdom) as the default EU country for Plaid
    const regionToCountryCode: Record<string, CountryCode> = {
      'US': CountryCode.Us,
      'CA': CountryCode.Ca,
      'EU': CountryCode.Gb, // EU maps to UK/GB for Plaid
    };

    const countryCode = regionToCountryCode[normalizedRegion];

    const request = {
      user: {
        client_user_id: userId,
      },
      client_name: 'Plaid Test App',
      products: [Products.Transactions],
      country_codes: [countryCode],
      language: 'en',
      webhook: webhookUrl || undefined, // Set webhook URL if provided
    };

    const createTokenResponse = await plaidClient.linkTokenCreate(request);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(createTokenResponse.data),
    };
  } catch (error: any) {
    console.error('Error creating link token:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Failed to create link token',
        message: error.message || 'Unknown error'
      }),
    };
  }
};
