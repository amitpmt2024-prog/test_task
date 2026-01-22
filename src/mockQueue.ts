import { SQSEvent, SQSRecord } from 'aws-lambda';
import { QueueMessage } from './types';
import { transactionWorker } from './worker';

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

export const backgroundQueue = {
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
