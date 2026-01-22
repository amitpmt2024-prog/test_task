import { APIGatewayProxyHandler } from 'aws-lambda';
import { plaidClient } from './plaidClient';
import { db } from './db';

interface ConnectionRequest {
  public_token: string;
  region: string; // UK, US, etc. - as requested
  user_id: string; 
}

// Lambda Handler
export const createConnection: APIGatewayProxyHandler = async (event) => {
  try {
    if (!event.body) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Missing request body' }) };
    }

    const { public_token, region, user_id }: ConnectionRequest = JSON.parse(event.body);

    if (!public_token || !user_id) {
       return { statusCode: 400, body: JSON.stringify({ error: 'Missing public_token or user_id' }) };
    }

    console.log(`[API] Creating connection for user ${user_id} in region ${region}`);

    // 1. Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: public_token,
    });
    
    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // 2. Save Item to DB
    await db.saveItem({
      item_id: itemId,
      user_id: user_id,
      access_token: accessToken,
      region: region, // Save region
      status: 'active',
      created_at: new Date()
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ item_id: itemId, status: 'connected' })
    };

  } catch (error) {
    console.error('Connection error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error' }) };
  }
};
