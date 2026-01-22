export interface Item {
  item_id: string;
  user_id: string;
  access_token: string;
  institution_id?: string;
  region?: string;
  status: 'active' | 'login_required';
  created_at: Date;
}

export interface Transaction {
  transaction_id: string;
  item_id: string;
  account_id: string;
  amount: number;
  currency: string;
  date: string;
  name: string;
  merchant_name?: string;
  pending?: boolean;
  category?: string[];
  payment_channel?: string;
  deleted_at?: Date | null;
  details?: any;
}

export interface SyncCursor {
  item_id: string;
  next_cursor: string;
}

// Strictly Typed Events
export interface TransactionsSyncPayload {
  item_id: string;
}

export interface PlaidWebhookBody {
  webhook_type: string;
  webhook_code: string;
  item_id: string;
  [key: string]: any;
}

// Mock SQS/EventBridge Event
export interface QueueMessage {
  type: 'SYNC_TRANSACTIONS' | 'ADD_NEW_ACCOUNTS';
  payload: {
    item_id: string;
    account_ids?: string[]; // For NEW_ACCOUNTS_AVAILABLE
  };
}

export interface Account {
  account_id: string;
  item_id: string;
  name: string;
  type: string;
  subtype?: string;
  mask?: string;
  balance?: number;
  currency?: string;
}
