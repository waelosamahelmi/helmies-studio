# Credit System Debugging

## When to use
When debugging credit issues, wallet problems, or generation payment failures.

## Architecture
- **Authoritative source**: `lib/wallet.js` — `CreditWallet` (available + reserved) + `CreditLedger` + `CreditReservation`
- **Denormalized mirror**: `User.credits` in DB — kept in sync by `session.js` → `syncUserCredits()`
- **Flow**: `generation-handler.js` → `wallet.reserveCredits()` → execute generation → `wallet.settleReservation()` on success OR `wallet.releaseReservation()` on failure
- **Legacy paths**: `debitCredits()` / `creditUser()` in `session.js` still exist for synchronous operations

## Debug Commands
```sql
-- Check user credit state
SELECT id, email, credits FROM "User" WHERE email = '<user email>';

-- Check recent ledger entries
SELECT * FROM "CreditLedger" WHERE "userId" = '<user id>' ORDER BY "createdAt" DESC LIMIT 20;

-- Check active reservations
SELECT * FROM "CreditReservation" WHERE "userId" = '<user id>' AND status = 'ACTIVE';
```

## Common Issues
1. **Credits mismatch**: User.credits ≠ wallet available — run `syncUserCredits(userId)` or restart (session.js syncs on login)
2. **Stuck reservations**: Expired reservations not released — check reservation expiry logic in wallet.js
3. **Double debit**: Old code paths calling debitCredits directly — search codebase for direct debitCredits calls outside generation-handler.js
