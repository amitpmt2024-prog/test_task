import { APIGatewayProxyHandler } from 'aws-lambda';
import { plaidClient } from './plaidClient';
import { CountryCode, Products } from 'plaid';

export const createLinkToken: APIGatewayProxyHandler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const webhookUrl = body.webhook_url; 
    const userId = body.user_id || 'test-user-id';
    const region = body.region || 'US'; // Support region parameter

    // Map region to country code
    const regionToCountryCode: Record<string, CountryCode> = {
      'US': CountryCode.Us,
      'UK': CountryCode.Gb,
      'CA': CountryCode.Ca,
      'IE': CountryCode.Ie,
      'ES': CountryCode.Es,
      'FR': CountryCode.Fr,
      'NL': CountryCode.Nl,
      'DE': CountryCode.De,
      'IT': CountryCode.It,
      'PL': CountryCode.Pl,
      'DK': CountryCode.Dk,
      'NO': CountryCode.No,
      'SE': CountryCode.Se,
      'EE': CountryCode.Ee,
      'LT': CountryCode.Lt,
      'LV': CountryCode.Lv,
      'PT': CountryCode.Pt,
      // Note: BE and AT may not be available in all Plaid SDK versions
      // Using closest alternatives or defaulting to US if not available
    };

    const countryCode = regionToCountryCode[region.toUpperCase()] || CountryCode.Us;

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
