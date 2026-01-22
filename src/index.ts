/**
 * Express Server Entry Point
 * 
 * Sets up Express server for local development, wrapping Lambda handlers
 * to work with Express.js. Automatically initializes database tables on startup.
 * 
 * Endpoints:
 * - POST /create_link_token - Create Plaid Link token
 * - POST /connections - Exchange public token for access token
 * - POST /webhook - Receive Plaid webhooks
 */

import express from 'express'
import bodyParser from 'body-parser';
import { createConnection } from './connections';
import { handleWebhook } from './webhook';
import { createLinkToken } from './linkToken';
import { db } from './db';
import { APIGatewayProxyEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = 3000;

// Initialize database tables on server startup
(async () => {
  try {
    await db.initializeTables();
  } catch (error) {
    console.error('Failed to initialize database tables:', error);
    console.error('Please ensure your database is running and credentials are correct.');
  }
})();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

/**
 * Wraps a Lambda handler function to work with Express.js for local development.
 * 
 * Converts Express request/response to API Gateway event format, executes
 * the Lambda handler, and converts the response back to Express format.
 * 
 * @param handler - Lambda handler function (APIGatewayProxyHandler)
 * @returns Express route handler function
 */
const wrapLambda = (handler: any) => async (req: express.Request, res: express.Response) => {
  const event: Partial<APIGatewayProxyEvent> = {
    body: JSON.stringify(req.body),
    headers: req.headers as any,
    httpMethod: req.method,
    path: req.path,
    queryStringParameters: req.query as any,
  };

  try {
    const result = await handler(event, {} as Context, () => {}) as APIGatewayProxyResult;
    res.status(result.statusCode).set(result.headers || {}).send(result.body ? JSON.parse(result.body) : {});
  } catch (error) {
    console.error('[Server] Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

app.post('/connections', wrapLambda(createConnection));
app.post('/webhook', wrapLambda(handleWebhook));
app.post('/create_link_token', wrapLambda(createLinkToken));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Test endpoints:`);
    console.log(`  POST http://localhost:${PORT}/connections`);
    console.log(`  POST http://localhost:${PORT}/webhook`);
});
