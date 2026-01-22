import { APIGatewayProxyHandler } from 'aws-lambda';
import { plaidClient } from './plaidClient';
import { db } from './db';

interface ConnectionRequest {
  public_token: string;
  region?: string;
  user_id: string;
  institution_id?: string;
}

const VALID_REGIONS = ['US', 'CA', 'EU'];
const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const createConnection: APIGatewayProxyHandler = async (event) => {
  try {
    if (!event.body) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Missing request body' }) };
    }

    const { public_token, region = 'US', user_id, institution_id }: ConnectionRequest = JSON.parse(event.body);

    if (!public_token || !user_id) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    const normalizedRegion = region.toUpperCase();
    if (!VALID_REGIONS.includes(normalizedRegion)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: `Invalid region. Valid: ${VALID_REGIONS.join(', ')}` }) };
    }

    const exchangeResponse = await plaidClient.itemPublicTokenExchange({ public_token });
    const { access_token, item_id } = exchangeResponse.data;

    let finalInstitutionId = institution_id;
    if (!finalInstitutionId) {
      try {
        const itemResponse = await plaidClient.itemGet({ access_token });
        finalInstitutionId = itemResponse.data.item.institution_id || undefined;
      } catch (error) {
        console.warn('[API] Could not fetch institution:', error);
      }
    }

    await db.saveItem({
      item_id,
      user_id,
      access_token,
      institution_id: finalInstitutionId,
      region: normalizedRegion,
      status: 'active',
      created_at: new Date()
    });

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ item_id, status: 'connected', region: normalizedRegion })
    };
  } catch (error: any) {
    console.error('[API] Connection error:', error);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error?.message || 'Unknown error',
        ...(process.env.NODE_ENV === 'development' && { details: error?.response?.data || error })
      })
    };
  }
};
