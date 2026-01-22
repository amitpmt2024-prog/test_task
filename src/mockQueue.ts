/**
 * Mock Background Queue
 * 
 * Simulates AWS SQS behavior for local development. Processes messages
 * asynchronously by invoking the transaction worker after a short delay.
 * 
 * In production, this would be replaced with actual AWS SQS integration.
 */

import { SQSEvent, SQSRecord } from 'aws-lambda';
import { QueueMessage } from './types';
import { transactionWorker } from './worker';

/**
 * Creates a mock SQS event structure for local development.
 * 
 * In production, this would be replaced by actual AWS SQS events.
 * This allows the worker to be tested locally without AWS infrastructure.
 * 
 * @param body - Message payload to wrap in SQS event format
 * @returns Mock SQS event structure
 */
const createMockSQSEvent = (body: any): SQSEvent => {
  return {
    Records: [
      {
        messageId: 'mock-id',
        receiptHandle: 'mock-handle',
        body: JSON.stringify(body),
        attributes: {} as any,
        messageAttributes: {},
        md5OfBody: 'mock-md5',
        eventSource: 'aws:sqs',
        eventSourceARN: 'mock-arn',
        awsRegion: 'us-east-1',
      } as SQSRecord
    ]
  };
};

/**
 * Mock background queue for local development.
 * 
 * Simulates AWS SQS behavior by:
 * - Logging the enqueued message
 * - Processing the message asynchronously after a short delay
 * - Invoking the transaction worker with the message
 * 
 * In production, this would be replaced with actual SQS queue operations.
 */
export const backgroundQueue = {
  /**
   * Sends a message to the background queue for asynchronous processing.
   * 
   * @param message - Queue message containing type and payload
   */
  sendMessage: async (message: QueueMessage) => {
    console.log(`[Queue] Message enqueued: ${message.type} for item ${message.payload.item_id}`);
    
    setTimeout(async () => {
      console.log(`[Worker] Picking up job for ${message.payload.item_id}`);
      try {
        const event = createMockSQSEvent(message.payload);
        await transactionWorker(event, {} as any, () => {});
      } catch (e) {
        console.error(e);
      }
    }, 100);
  }
};
