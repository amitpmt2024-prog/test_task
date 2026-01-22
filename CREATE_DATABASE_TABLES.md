# Create Database Tables - Quick Fix

## The Error

```
error: relation "items" does not exist
```

This means the database tables haven't been created yet.

## Solution: Run the Schema SQL

### Option 1: Using psql (Command Line)

```powershell
# Connect to your database and run the schema
psql -h localhost -U postgres -d test_task -f schema.sql
```

**Or step by step:**

```powershell
# 1. Connect to database
psql -h localhost -U postgres -d test_task

# 2. Run the schema file
\i schema.sql

# 3. Verify tables were created
\dt

# 4. Exit
\q
```

### Option 2: Using pgAdmin or Database GUI

1. Open your database client (pgAdmin, DBeaver, etc.)
2. Connect to your database: `test_task`
3. Open `schema.sql` file
4. Execute the SQL script
5. Verify tables were created

### Option 3: Copy and Paste SQL

If you can't run the file directly, copy the contents of `schema.sql` and paste into your database client's SQL editor, then execute.

---

## Verify Tables Were Created

After running the schema, verify with:

```sql
-- List all tables
\dt

-- Or using SQL
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';
```

You should see:
- `items`
- `transactions`
- `sync_cursors`

---

## Quick Test

After creating tables, test the connection again:

```powershell
curl -X POST http://localhost:3000/connections `
  -H "Content-Type: application/json" `
  -d '{
    "public_token": "public-sandbox-FRESH-TOKEN",
    "region": "US",
    "user_id": "user_123"
  }'
```

---

## If You Don't Have the Database Created

If the database `test_task` doesn't exist, create it first:

```sql
-- Connect to PostgreSQL
psql -h localhost -U postgres

-- Create database
CREATE DATABASE test_task;

-- Connect to the new database
\c test_task

-- Run schema
\i schema.sql
```

---

## Complete Setup Script

Here's a complete PowerShell script to set everything up:

```powershell
# 1. Create database (if it doesn't exist)
psql -h localhost -U postgres -c "CREATE DATABASE test_task;" 2>$null

# 2. Run schema
psql -h localhost -U postgres -d test_task -f schema.sql

# 3. Verify
psql -h localhost -U postgres -d test_task -c "\dt"
```

---

## Next Steps

1. ✅ Run `schema.sql` to create tables
2. ✅ Verify tables exist
3. ✅ Try your connection request again
4. ✅ Should work now!
