-- Connects Plaid Items (bank logins) to users
CREATE TABLE items (
    item_id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    access_token VARCHAR(255) NOT NULL,
    institution_id VARCHAR(255),
    region VARCHAR(10), -- 'US', 'UK', etc.
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'login_required'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stores bank transactions
CREATE TABLE transactions (
    transaction_id VARCHAR(255) PRIMARY KEY,
    item_id VARCHAR(255) REFERENCES items(item_id),
    account_id VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    date DATE NOT NULL,
    name VARCHAR(255),
    merchant_name VARCHAR(255),
    pending BOOLEAN DEFAULT FALSE,
    category JSONB, -- Storing array of categories
    payment_channel VARCHAR(50),
    deleted_at TIMESTAMP NULL, -- Soft delete support - allows deletion without breaking sync
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient queries
CREATE INDEX idx_transactions_item_id ON transactions(item_id);
CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_deleted_at ON transactions(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_transactions_item_date ON transactions(item_id, date);

-- Stores sync cursors for efficient updates
CREATE TABLE sync_cursors (
    item_id VARCHAR(255) PRIMARY KEY REFERENCES items(item_id),
    next_cursor VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
