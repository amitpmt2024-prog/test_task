import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPlaidClient } from './plaidClient';
import { db } from './db';

interface ConnectionRequest {
  public_token: string;
  region?: string;
  user_id: string;
  institution_id?: string;
}

export const createConnection: APIGatewayProxyHandler = async (event) => {
  try {
    if (!event.body) {
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: 'Missing request body' }) 
      };
    }

    const body = JSON.parse(event.body) as ConnectionRequest;
    const { public_token, region = 'US', user_id, institution_id } = body;

    if (!public_token || !user_id) {
      return { 
        statusCode: 400, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required fields' }) 
      };
    }

    const regionUpper = region.toUpperCase();
    if (!['US', 'CA', 'EU'].includes(regionUpper)) {
      return { 
        statusCode: 400, 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid region. Valid: US, CA, EU' }) 
      };
    }

    const client = getPlaidClient(regionUpper as 'US' | 'CA' | 'EU');
    const exchangeResponse = await client.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeResponse.data;

    let instId = institution_id;
    if (!instId) {
      try {
        const itemResponse = await client.itemGet({ access_token });
        instId = itemResponse.data.item.institution_id || undefined;
      } catch (err) {
        console.warn('[API] Could not fetch institution:', err);
      }
    }

    await db.saveItem({
      item_id,
      user_id,
      access_token,
      institution_id: instId,
      region: regionUpper,
      status: 'active',
      created_at: new Date()
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id, status: 'connected', region: regionUpper })
    };
  } catch (err: any) {
    console.error('Connection error:', err);
    const errorMsg = err?.message || 'Unknown error';
    const response: any = {
      error: 'Internal Server Error',
      message: errorMsg
    };
    if (process.env.NODE_ENV === 'development') {
      response.details = err?.response?.data || err;
    }
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response)
    };
  }
};
