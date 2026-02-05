# Copilot Instructions for Monly

## Project Overview

Monly is a pocket money bank simulator for Raspberry Pi that educates children about financial management. It's a Node.js/Express backend with HTML/CSS/JS frontend (PicoCSS), SQLite database, and Docker deployment.

**Key Roles:**
- **Administrator (parent)**: Manages users, tasks, allowances, approvals, and transaction history
- **User (child)**: Views balance, completes tasks, requests advances, views personal history

## Architecture & Data Flow

### Core Components
```
Frontend (PicoCSS) → Backend API (Express) → SQLite Database
                    ↓
        RFID Reader (GPIO on Raspberry Pi)
```

**Backend Structure** (`backend/src/`):
- `controllers/` - Route handlers for API endpoints
- `models/` - Database models (User, Task, Transaction, Allowance, AdvanceRequest)
- `services/` - Business logic (transactionService, schedulerService for cron jobs)
- `middleware/` - Auth middleware (JWT verification, role checks)
- `routes/` - API route definitions
- `i18n/` - Backend translations (English, French)
- `config/` - Database connection and environment config

**Frontend Structure** (`frontend/`):
- `public/` - Static assets (CSS, JS, index.html)
- `admin/` - Admin dashboard pages
- `user/` - User dashboard pages
- `i18n/` - Frontend translation files (en.json, fr.json)

**Database Tables** (SQLite with WAL mode):
- `users` - username, password_hash, role, rfid_card_id, pin_hash, balance, language
- `transactions` - All balance changes (type: allowance, task, advance, manual)
- `tasks` - Task definitions with reward amounts and approval requirements
- `task_assignments` - Which users can access which tasks (with frequency limits)
- `task_completions` - Submitted tasks awaiting approval or completed
- `allowances` - Automatic payment configuration per user
- `advance_requests` - Early allowance requests with approval status

## Critical Workflows

### Development Setup
```bash
# Backend
cd backend
npm install
npm run dev  # Development mode with nodemon

# Database initialization runs automatically on first start
# Schema is in backend/database/schema.sql
```

### Docker Deployment (Production on Raspberry Pi)
```bash
docker-compose up -d
# Volumes: SQLite DB persists in ./data/, backups in ./backups/
```

### Testing
```bash
cd backend
npm test  # Jest unit tests for services and models
npm run test:integration  # API endpoint tests
```

### Allowance Scheduler
- Runs via `node-cron` in `schedulerService.js`
- Checks daily for due allowances and creates transactions automatically
- Must handle timezone correctly for the family's location

## Code Conventions

### Authentication & Authorization
- **JWT tokens** in `Authorization: Bearer <token>` header
- Middleware: `auth.js` provides `requireAuth` and `requireAdmin`
- Passwords hashed with **bcrypt** (10 salt rounds)
- RFID+PIN authentication available in v3.0+

### API Response Format
```javascript
// Success
{ success: true, data: {...}, message: "Operation successful" }

// Error
{ success: false, error: "Error message", code: "ERROR_CODE" }
```

### Transaction Atomicity
**CRITICAL**: All balance changes MUST:
1. Wrap in database transaction (`db.transaction()`)
2. Create entry in `transactions` table
3. Update user balance atomically
4. Rollback on any error

Example pattern:
```javascript
const transaction = db.transaction(() => {
  createTransaction(userId, type, amount, description);
  updateUserBalance(userId, amount);
});
transaction(); // Execute atomically
```

### Internationalization (i18n)
- Backend: `i18next` with locale files in `backend/src/i18n/locales/{en,fr}/`
- Frontend: Custom `i18n.js` loading JSON files from `frontend/public/i18n/`
- All UI strings must use translation keys: `t('balance.current')`
- Date/currency formatting: Use `Intl.NumberFormat` and `Intl.DateTimeFormat`

### Error Handling Pattern
```javascript
try {
  // Operation
} catch (error) {
  logger.error('Context-specific message', { error, userId, ... });
  return res.status(500).json({ 
    success: false, 
    error: t('errors.operation_failed')
  });
}
```

## Project-Specific Patterns

### Task Completion Workflow
1. User submits task completion via `POST /api/tasks/:id/complete`
2. Creates entry in `task_completions` with status='pending' (if requires_approval) or 'approved' (auto-approve)
3. If pending, admin approves via `POST /api/tasks/completions/:id/approve`
4. On approval: creates transaction, updates balance atomically
5. Check frequency limits before allowing task completion

### Advance Request Logic
- User requests advance against next allowance
- Admin approves/rejects via API
- On approval:
  - Create transaction immediately (credit account)
  - Update `next_allowance_amount` to deduct advance
  - Or create negative transaction on next scheduled allowance
- Prevent multiple active advances per user

### RFID Integration (v3.0)
- Python script (`scripts/rfid/reader.py`) reads MFRC522 cards
- Script calls `POST /auth/rfid-login` with card UID and PIN
- Backend verifies `users.rfid_card_id` and `pin_hash`
- Returns JWT token for session management

## Raspberry Pi Considerations

### Performance
- Target: Raspberry Pi 3B+ (1.4GHz quad-core, 1GB RAM)
- Optimize queries with indexes on foreign keys and frequently filtered columns
- Use `better-sqlite3` for synchronous, faster SQLite access
- Cache user sessions in-memory (Map or Redis if needed later)

### Hardware
- GPIO pins for RFID reader: Configurable in `scripts/rfid/config.json`
- LCD display (optional): 16x2 or 20x4 via I2C
- Power management: Handle graceful shutdown on power loss

## Security Requirements

- **Input validation**: Use `express-validator` on all endpoints
- **SQL injection**: ALWAYS use parameterized queries (never string concatenation)
- **XSS**: Sanitize user input, use Content-Security-Policy headers
- **CSRF**: Implement token-based CSRF protection for forms
- **Rate limiting**: On auth endpoints (`express-rate-limit`)
- **HTTPS**: Enforce in production via reverse proxy (nginx)

## Key Files Reference

- `docs/PRD.md` - Complete product requirements and features
- `docs/AI_DEVELOPMENT_GUIDE.md` - Detailed AI-assisted development workflow
- `docs/FEATURES_TRACKING.md` - Feature status and version planning
- `backend/src/config/database.js` - SQLite connection and transaction handling
- `backend/src/services/transactionService.js` - Core balance/transaction logic
- `backend/src/services/schedulerService.js` - Allowance automation

## Common Pitfalls

1. **Forgetting transaction atomicity** - Always wrap balance updates in DB transactions
2. **Not checking user role** - Use `requireAdmin` middleware for admin-only endpoints
3. **Hardcoded strings** - Use i18n keys, never hardcode user-facing text
4. **Timezone issues** - Store UTC in DB, convert to user timezone for display
5. **RFID card conflicts** - Ensure unique `rfid_card_id` per user
6. **Task frequency limits** - Validate before allowing completion (e.g., once per day)

## Development Priorities (MVP → v3.0)

**v1.0 (MVP)**: Auth, user management, manual balance adjustments, basic tasks, transaction history  
**v2.0**: Automatic allowances (cron), task approval workflow, advance requests, i18n  
**v3.0**: RFID authentication, GPIO integration, systemd service for RFID reader

When implementing features, always reference `docs/FEATURES_TRACKING.md` for current status and dependencies.
Always code in accordance with the conventions outlined above to ensure consistency and maintainability across the project. Make sure that the code and documentation remain synchronized as the project evolves and in english language. Don't hesitate to ask for clarifications on any aspect of the project. Don't forget to use the i18n system for all user-facing text.
