import { APIGatewayProxyHandler } from 'aws-lambda';
import { plaidClient } from './plaidClient';
import { CountryCode, Products } from 'plaid';

export const createLinkToken: APIGatewayProxyHandler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const webhookUrl = body.webhook_url; 
    const userId = body.user_id || 'test-user-id';

    const request = {
      user: {
        client_user_id: userId,
      },
      client_name: 'Plaid Test App',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us], // Default to US
      language: 'en',
      webhook: webhookUrl || undefined, // Set webhook URL if provided
    };

    const createTokenResponse = await plaidClient.linkTokenCreate(request);
    
    return {
      statusCode: 200,
      body: JSON.stringify(createTokenResponse.data),
    };
  } catch (error) {
    console.error('Error creating link token:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create link token' }),
    };
  }
};
