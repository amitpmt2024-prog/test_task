import express from 'express'
import bodyParser from 'body-parser';
import { createConnection } from './connections';
import { handleWebhook } from './webhook';
import { createLinkToken } from './linkToken';
import { db } from './db';
import { APIGatewayProxyEvent, Context, APIGatewayProxyResult } from 'aws-lambda';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = 3000;

// Initialize database tables on startup
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

// Helper to wrap Lambda handler
const wrapLambda = (handler: any) => async (req: express.Request, res: express.Response) => {
    // Mock API Gateway Event
    const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify(req.body),
        headers: req.headers as any,
        httpMethod: req.method,
        path: req.path,
        queryStringParameters: req.query as any,
    };

    const context: Partial<Context> = {};

    try {
        const result = await handler(event, context, () => {}) as APIGatewayProxyResult;
        
        res.status(result.statusCode).set(result.headers).send(result.body ? JSON.parse(result.body) : {});
    } catch (error) {
        console.error('Lambda Wrapper Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Routes
app.post('/connections', wrapLambda(createConnection));
app.post('/webhook', wrapLambda(handleWebhook));
app.post('/create_link_token', wrapLambda(createLinkToken));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Test endpoints:`);
    console.log(`  POST http://localhost:${PORT}/connections`);
    console.log(`  POST http://localhost:${PORT}/webhook`);
});
