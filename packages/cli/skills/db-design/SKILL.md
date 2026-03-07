---
name: db-design
description: Database schema design, indexing strategy, and migration patterns. Prevents N+1, missing indexes, unsafe migrations, and schema drift. Use when designing tables, adding columns, or writing complex queries.
user-invocable: true
---

# DB Design

Bad schema is the most expensive technical debt. You can refactor code in hours; migrating 10M rows takes days.

## Schema design principles

### Naming
- Tables: `snake_case`, plural (`users`, `order_items`, `refresh_tokens`)
- Columns: `snake_case` (`created_at`, `user_id`, `is_active`)
- Foreign keys: `{table_singular}_id` (`user_id`, `order_id`)
- Booleans: prefix `is_` or `has_` (`is_active`, `has_verified_email`)
- Timestamps: always `created_at` + `updated_at` on every table

### Standard columns every table needs
```sql
id         BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY  -- or UUID
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### Soft delete pattern (prefer over hard delete)
```sql
deleted_at TIMESTAMPTZ  -- NULL = active, non-NULL = deleted
-- Query: WHERE deleted_at IS NULL
```

## Indexing strategy

**Index everything you filter, sort, or join on.**

```sql
-- Always index foreign keys
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Composite index for common query patterns (leftmost prefix rule)
CREATE INDEX idx_orders_user_status ON orders(user_id, status);
-- This covers: WHERE user_id = ?
-- And:         WHERE user_id = ? AND status = ?
-- But NOT:     WHERE status = ?  alone

-- Partial index for filtered queries
CREATE INDEX idx_orders_pending ON orders(created_at)
  WHERE status = 'pending';

-- Text search
CREATE INDEX idx_products_name_search ON products USING gin(to_tsvector('english', name));
```

**Check for missing indexes:**
```sql
EXPLAIN ANALYZE SELECT ... -- look for "Seq Scan" on large tables
-- Seq Scan on 1000 rows = fine. On 1M rows = add an index.
```

**Over-indexing costs:** Every index slows down INSERT/UPDATE/DELETE. Don't index columns you never filter on.

## N+1 pattern (the most common DB bug)

```ts
// BAD — N+1: 1 query for orders + N queries for each user
const orders = await db.orders.findMany()
for (const order of orders) {
  order.user = await db.users.findById(order.userId)  // N queries!
}

// GOOD — 1 query with join or eager load
const orders = await db.orders.findMany({
  include: { user: true }  // Prisma
})

// Or raw SQL with JOIN
SELECT o.*, u.name, u.email
FROM orders o
JOIN users u ON u.id = o.user_id
WHERE o.status = 'pending'
```

## Safe migration patterns

```sql
-- SAFE: adding nullable column (instant, no lock)
ALTER TABLE users ADD COLUMN avatar_url TEXT;

-- SAFE: adding column with default (Postgres 11+, instant)
ALTER TABLE users ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT false;

-- DANGEROUS: adding NOT NULL without default (locks table, blocks writes)
-- Do it in 3 steps:
-- 1. Add nullable
ALTER TABLE users ADD COLUMN phone TEXT;
-- 2. Backfill
UPDATE users SET phone = '' WHERE phone IS NULL;
-- 3. Add constraint
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;

-- DANGEROUS: dropping column (data loss, code must be deployed first)
-- 1. Deploy code that no longer uses the column
-- 2. Then drop in next migration
ALTER TABLE users DROP COLUMN legacy_field;

-- DANGEROUS: renaming column/table (breaks existing queries)
-- Use a 2-phase rename: add new column, migrate data, remove old
```

## Transaction patterns

```ts
// Always use transactions for multi-step operations
await db.transaction(async (tx) => {
  const order = await tx.orders.create({ data: { userId, total } })
  await tx.inventory.decrement({ productId, quantity })
  await tx.payments.create({ data: { orderId: order.id, amount: total } })
  // If any step fails, all are rolled back
})
```

## Query hygiene

- Never `SELECT *` in production — select only what you need
- Parameterized queries always (no string interpolation)
- `LIMIT` on all queries that could return unbounded results
- Avoid `OFFSET` for large pagination → use cursor-based (`WHERE id > lastId`)

## Checklist

- [ ] Every table has `id`, `created_at`, `updated_at`
- [ ] All foreign keys have indexes
- [ ] Columns filtered/sorted in queries have indexes
- [ ] `EXPLAIN ANALYZE` run on queries touching >10k rows
- [ ] Migrations are reversible (or have a rollback plan)
- [ ] No `ALTER TABLE` without reviewing lock implications
- [ ] Multi-step operations wrapped in transactions
- [ ] No `SELECT *`, no string-interpolated queries
