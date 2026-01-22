import { APIGatewayProxyHandler } from 'aws-lambda';
import { plaidClient } from './plaidClient';
import { db } from './db';

interface ConnectionRequest {
  public_token: string;
  region?: string; // UK, US, CA, etc. - optional, defaults to 'US'
  user_id: string;
  institution_id?: string;
  institution_name?: string;
}

// Lambda Handler
export const createConnection: APIGatewayProxyHandler = async (event) => {
  try {
    if (!event.body) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing request body' }) };
    }

    const { public_token, region = 'US', user_id, institution_id, institution_name }: ConnectionRequest = JSON.parse(event.body);

    if (!public_token || !user_id) {
       return { 
         statusCode: 400, 
         body: JSON.stringify({ error: 'Missing required fields: public_token and user_id are required' }) 
       };
    }

    // Validate region if provided
    const validRegions = ['US', 'UK', 'CA', 'IE', 'ES', 'FR', 'NL', 'DE', 'IT', 'PL', 'DK', 'NO', 'SE', 'EE', 'LT', 'LV', 'PT', 'BE', 'AT'];
    const normalizedRegion = region.toUpperCase();
    if (region && !validRegions.includes(normalizedRegion)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Invalid region: ${region}. Valid regions: ${validRegions.join(', ')}` })
      };
    }

    console.log(`[API] Creating connection for user ${user_id} in region ${normalizedRegion}`);

    // 1. Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: public_token,
    });
    
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // 2. Get item info to retrieve institution details if not provided
    let finalInstitutionId = institution_id;
    let finalInstitutionName = institution_name;
    if (!finalInstitutionId) {
      try {
        const itemResponse = await plaidClient.itemGet({
          access_token: accessToken
        });
        finalInstitutionId = itemResponse.data.item.institution_id || undefined;
      } catch (error) {
        console.warn('[API] Could not fetch item details:', error);
      }
    }

    // 4. Save Item to DB with region
    await db.saveItem({
      item_id: itemId,
      user_id: user_id,
      access_token: accessToken,
      institution_id: finalInstitutionId || undefined,
      region: normalizedRegion,
      status: 'active',
      created_at: new Date()
    });

    console.log(`[API] Connection created successfully: item_id=${itemId}, region=${normalizedRegion}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        item_id: itemId, 
        status: 'connected',
        region: normalizedRegion,
        message: 'Connection created successfully'
      })
    };

  } catch (error) {
    console.error('Connection error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};
