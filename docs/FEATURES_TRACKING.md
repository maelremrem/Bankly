# Features Tracking - Bankly Project

**Last Updated:** February 5, 2026  
**Project Status:** Development Phase

---

## 1. Feature Status Legend

- 🔴 **Not Started** - Feature not yet implemented
- 🟡 **In Progress** - Currently being developed
- 🟢 **Completed** - Feature fully implemented and tested
- 🔵 **Testing** - Implementation complete, undergoing testing
- ⚪ **Blocked** - Waiting on dependencies or decisions
- 🟣 **Deferred** - Postponed to later version

---

## 2. Core Features

### 2.1 Authentication & Authorization

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| Username/password login | 🟢 Completed | High | - | v1.0 (MVP) | Implemented with express + bcrypt |
| JWT token generation | 🟢 Completed | High | - | v1.0 (MVP) | Tokens issued at login (8h) |
| Session management | 🔴 Not Started | High | - | v1.0 (MVP) | Token refresh logic |
| Password hashing | 🟢 Completed | High | - | v1.0 (MVP) | bcrypt used (10 rounds) |
| Role-based access control | 🟢 Completed | High | - | v1.0 (MVP) | `requireAdmin` middleware in place |
| RFID card authentication | 🔴 Not Started | Medium | - | v3.0 | Hardware integration |
| PIN code authentication | 🔴 Not Started | Medium | - | v3.0 | For RFID |
| Logout functionality | 🟢 Completed | Medium | - | v1.0 (MVP) | `POST /auth/logout` clears cookie |
| Remember me option | 🟣 Deferred | Low | - | v4.0+ | Extended sessions |
| Two-factor authentication | 🟣 Deferred | Low | - | v4.0+ | Future enhancement |

---

### 2.2 User Management (Admin)

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| Create new user | 🟢 Completed | High | - | v1.0 (MVP) | Admin-only endpoint implemented |
| Edit user details | 🟢 Completed | High | - | v1.0 (MVP) | `PUT /api/users/:id` implemented |
| Delete user | 🟢 Completed | High | - | v1.0 (MVP) | `DELETE /api/users/:id` implemented |
| List all users | 🟢 Completed | High | - | v1.0 (MVP) | `GET /api/users` with pagination |
| View user details | 🟢 Completed | Medium | - | v1.0 (MVP) | Partial (admin can view user rows) |
| Disable/enable user | 🔴 Not Started | Medium | - | v2.0 | Account suspension |
| Reset user password | 🔴 Not Started | Medium | - | v2.0 | Admin function |
| Assign RFID card to user | 🔴 Not Started | Medium | - | v3.0 | Hardware feature |
| User activity log | 🟣 Deferred | Low | - | v4.0+ | Audit trail |
| Bulk user operations | 🟣 Deferred | Low | - | v4.0+ | Import/export |

---

### 2.3 Balance Management

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| View current balance (user) | 🟢 Completed | High | - | v1.0 (MVP) | `/api/users/:id/balance` implemented and used in user dashboard |
| View all balances (admin) | 🟢 Completed | High | - | v1.0 (MVP) | Admin user listing includes `balance` column |
| Manual balance adjustment | 🟢 Completed | High | - | v1.0 (MVP) | `POST /api/transactions` implemented (admin) |
| Transaction recording | 🟢 Completed | High | - | v1.0 (MVP) | All changes recorded in `transactions` table |
| Balance history | 🟢 Completed | Medium | - | v1.0 (MVP) | `GET /api/users/:id/transactions` implemented with pagination |
| Negative balance prevention | 🔴 Not Started | Medium | - | v1.0 (MVP) | Configurable |
| Balance notifications | 🟣 Deferred | Low | - | v4.0+ | Low balance alerts |
| Balance graphs/charts | 🟣 Deferred | Low | - | v4.0+ | Visual analytics |

---

### 2.4 Allowance System

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| Create allowance config | 🟢 Completed | High | - | v2.0 | `POST /api/allowances` implemented |
| Set allowance amount | 🟢 Completed | High | - | v2.0 | amount field |
| Set allowance frequency | 🟢 Completed | High | - | v2.0 | daily/weekly/monthly |
| Automatic allowance payments | 🟢 Completed | High | - | v2.0 | Cron scheduler service |
| Edit allowance config | 🟢 Completed | High | - | v2.0 | `PUT /api/allowances/:id` implemented |
| Disable allowance | 🟢 Completed | Medium | - | v2.0 | enabled field |
| Next payment date display | 🟢 Completed | Medium | - | v2.0 | next_payment_date field |
| Allowance history | 🟢 Completed | Medium | - | v2.0 | Via transaction history |
| Variable allowance amounts | 🟣 Deferred | Low | - | v4.0+ | Different per period |
| Conditional allowances | 🟣 Deferred | Low | - | v4.0+ | Based on behavior |

---

### 2.5 Task Management

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| Create task (admin) | 🟢 Completed | High | - | v1.0 (MVP) | `POST /api/tasks` implemented |
| Set task reward amount | 🟢 Completed | High | - | v1.0 (MVP) | reward_amount field |
| Edit task details | 🟢 Completed | High | - | v1.0 (MVP) | `PUT /api/tasks/:id` implemented |
| Delete task | 🟢 Completed | High | - | v1.0 (MVP) | `DELETE /api/tasks/:id` implemented |
| List available tasks (user) | 🟢 Completed | High | - | v1.0 (MVP) | `GET /api/tasks/available` |
| Mark task as completed (user) | 🟢 Completed | High | - | v1.0 (MVP) | `POST /api/tasks/:id/complete` |
| Assign task to specific users | 🔴 Not Started | Medium | - | v2.0 | Pending assignments table |
| Task approval requirement | 🟢 Completed | Medium | - | v2.0 | requires_approval boolean |
| Approve task completion (admin) | 🟢 Completed | Medium | - | v2.0 | `POST /api/tasks/completions/:id/approve` |
| Reject task completion (admin) | 🟢 Completed | Medium | - | v2.0 | Same endpoint with approved=false |
| Task frequency limits | 🔴 Not Started | Medium | - | v2.0 | Once per day/week |
| Task categories | 🟣 Deferred | Low | - | v4.0+ | Organize tasks |
| Recurring task assignments | 🟣 Deferred | Low | - | v4.0+ | Automatic scheduling |
| Task templates | 🟣 Deferred | Low | - | v4.0+ | Predefined tasks |

---

### 2.6 Advance Request System

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| Request advance (user) | 🟢 Completed | Medium | - | v2.0 | `POST /api/advances` implemented |
| View pending requests (admin) | 🟢 Completed | Medium | - | v2.0 | `GET /api/advances` with status filter |
| Approve advance (admin) | 🟢 Completed | Medium | - | v2.0 | `POST /api/advances/:id/approve` |
| Reject advance (admin) | 🟢 Completed | Medium | - | v2.0 | `POST /api/advances/:id/reject` |
| Deduct from next allowance | 🟢 Completed | Medium | - | v2.0 | Advance service adjusts allowance |
| View advance history (user) | 🟢 Completed | Medium | - | v2.0 | `GET /api/advances/user/:userId` |
| Advance request limits | 🟢 Completed | Low | - | v2.0 | Server-side validation rules |
| Advance repayment tracking | 🟣 Deferred | Low | - | v4.0+ | Multiple advances |
| Interest on advances | 🟣 Deferred | Low | - | v4.0+ | Teaching tool |

---

### 2.7 Transaction History

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| View personal history (user) | 🟢 Completed | High | - | v1.0 (MVP) | `GET /api/users/:id/transactions` implemented |
| View all history (admin) | 🟢 Completed | High | - | v1.0 (MVP) | `GET /api/transactions` implemented with filters & pagination |
| Filter by transaction type | 🟢 Completed | Medium | - | v1.0 (MVP) | Supported on per-user history |
| Filter by date range | 🟢 Completed | Medium | - | v1.0 (MVP) | Start/end date on admin listing |
| Search transactions | 🔴 Not Started | Medium | - | v2.0 | By description |
| Pagination | 🟢 Completed | Medium | - | v1.0 (MVP) | Implemented on history endpoints |
| Export to CSV | 🟣 Deferred | Low | - | v4.0+ | Data export |
| Transaction details view | 🔴 Not Started | Low | - | v2.0 | Expanded info |
| Visual transaction timeline | 🟣 Deferred | Low | - | v4.0+ | Graphical view |

---

## 3. Frontend Features

### 3.1 User Interface (General)

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| Login page | 🟡 In Progress | High | - | v1.0 (MVP) | Static page exists, i18n pending |
| User dashboard | 🟡 In Progress | High | - | v1.0 (MVP) | Functional JS, HTMX not applied |
| Admin dashboard | 🟢 Completed | High | - | v1.0 (MVP) | HTMX + CRUD workflows |
| Responsive design | 🟡 In Progress | High | - | v1.0 (MVP) | Base layout responsive |
| PicoCSS integration | 🟢 Completed | High | - | v1.0 (MVP) | PicoCSS loaded in pages |
| Child-friendly UI | 🔴 Not Started | High | - | v1.0 (MVP) | Pending |
| Navigation menu | 🟡 In Progress | Medium | - | v1.0 (MVP) | Admin header/navigation |
| Success notifications | 🟢 Completed | Medium | - | v1.0 (MVP) | Toasts in admin |
| Error notifications | 🟡 In Progress | Medium | - | v1.0 (MVP) | Partial in admin |
| Loading indicators | 🟢 Completed | Medium | - | v1.0 (MVP) | HTMX loading states |
| Confirmation dialogs | 🟢 Completed | Medium | - | v1.0 (MVP) | Confirm dialogs for destructive actions |
| Dark mode | 🟢 Completed | Low | - | v4.0+ | Theme switcher on admin |
| Custom themes | 🟣 Deferred | Low | - | v4.0+ | Personalization |

---

### 3.2 User-Specific Pages

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| Balance display | 🟡 In Progress | High | - | v1.0 (MVP) | Basic balance shown on user dashboard |
| Available tasks list | 🟡 In Progress | High | - | v1.0 (MVP) | Basic list on user dashboard |
| Transaction history page | 🟡 In Progress | High | - | v1.0 (MVP) | Basic history table exists |
| Advance request form | 🔴 Not Started | Medium | - | v2.0 | Request early payment |
| Profile settings | 🔴 Not Started | Medium | - | v2.0 | Update preferences |
| Next allowance info | 🔴 Not Started | Medium | - | v2.0 | Countdown/date |
| Goal setting page | 🟣 Deferred | Low | - | v4.0+ | Savings goals |

---

### 3.3 Admin-Specific Pages

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| User management page | 🟢 Completed | High | - | v1.0 (MVP) | CRUD users via admin dashboard |
| Task management page | 🟢 Completed | High | - | v1.0 (MVP) | CRUD tasks via admin dashboard |
| Generate Default Tasks spinner | 🟢 Completed | Low | - | v1.0 (MVP) | UX improvement |
| Allowance config page | 🟢 Completed | High | - | v2.0 | Allowances managed in admin dashboard |
| Approval queue page | 🟢 Completed | Medium | - | v2.0 | Task completions + advances in admin dashboard |
| All transactions page | 🟢 Completed | Medium | - | v1.0 (MVP) | Admin transactions table + filters |
| Balance adjustment form | 🟢 Completed | Medium | - | v1.0 (MVP) | Manual transaction modal |
| System settings page | 🔴 Not Started | Low | - | v2.0 | Configuration |
| Reports/analytics page | 🟣 Deferred | Low | - | v4.0+ | Data insights |

---

## 4. Backend/API Features

### 4.1 API Endpoints

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| POST /auth/login | 🟢 Completed | High | - | v1.0 (MVP) | Login with username/password |
| POST /auth/logout | 🟢 Completed | High | - | v1.0 (MVP) | Clears cookie |
| GET /auth/me | 🟢 Completed | High | - | v1.0 (MVP) | Returns user info |
| POST /auth/rfid-login | 🔴 Not Started | Medium | - | v3.0 | RFID authentication |
| GET /api/users | 🟢 Completed | High | - | v1.0 (MVP) | List users (admin) with pagination |
| POST /api/users | 🟢 Completed | High | - | v1.0 (MVP) | Create user (admin) |
| PUT /api/users/:id | 🟢 Completed | High | - | v1.0 (MVP) | Update user (admin) |
| DELETE /api/users/:id | 🟢 Completed | High | - | v1.0 (MVP) | Delete user (admin) |
| GET /api/users/:id/balance | 🟢 Completed | High | - | v1.0 (MVP) | Balance endpoint implemented |
| POST /api/transactions | 🟢 Completed | High | - | v1.0 (MVP) | Create manual transaction (admin) |
| GET /api/transactions | 🟢 Completed | High | - | v1.0 (MVP) | Global listing with filters |
| GET /api/users/:id/transactions | 🟢 Completed | High | - | v1.0 (MVP) | User transaction history (pagination, filter) |
| POST /api/transactions/:id/reverse | 🟢 Completed | Medium | - | v1.0 (MVP) | Reverse a transaction (permission controlled) |
| POST /api/transactions/reversals/:originalId/undo | 🟢 Completed | Medium | - | v1.0 (MVP) | Undo a reversal (permission controlled) |
| GET /api/transactions/reversals | 🟢 Completed | Medium | - | v1.0 (MVP) | Reversal audit listing (admin) |
| GET /api/transactions/reversals/:id | 🟢 Completed | Medium | - | v1.0 (MVP) | Reversal detail (admin) |
| GET /api/tasks | 🟢 Completed | High | - | v1.0 (MVP) | List tasks (admin) |
| POST /api/tasks | 🟢 Completed | High | - | v1.0 (MVP) | Create task (admin) |
| PUT /api/tasks/:id | 🟢 Completed | High | - | v1.0 (MVP) | Update task (admin) |
| DELETE /api/tasks/:id | 🟢 Completed | High | - | v1.0 (MVP) | Delete task (admin) |
| GET /api/tasks/available | 🟢 Completed | High | - | v1.0 (MVP) | User's available tasks |
| POST /api/tasks/:id/complete | 🟢 Completed | High | - | v1.0 (MVP) | Complete task |
| POST /api/tasks/completions/:id/approve | 🟢 Completed | Medium | - | v2.0 | Approve/reject (admin) |
| POST /api/tasks/completions/:id/reject | 🟢 Completed | Medium | - | v2.0 | Reject (admin) |
| POST /api/allowances | 🟢 Completed | High | - | v2.0 | Create allowance |
| GET /api/allowances | 🟢 Completed | High | - | v2.0 | List allowances |
| PUT /api/allowances/:id | 🟢 Completed | High | - | v2.0 | Update allowance |
| DELETE /api/allowances/:id | 🟢 Completed | Medium | - | v2.0 | Delete allowance |
| POST /api/advances | 🟢 Completed | Medium | - | v2.0 | Request advance |
| GET /api/advances/pending | 🟣 Deferred | Medium | - | v2.0 | Replaced by status filter |
| POST /api/advances/:id/approve | 🟢 Completed | Medium | - | v2.0 | Approve (admin) |
| POST /api/advances/:id/reject | 🟢 Completed | Medium | - | v2.0 | Reject (admin) |

---

### 4.2 Database Features

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| SQLite database setup | 🟢 Completed | High | - | v1.0 (MVP) | Schema implemented and applied at startup |
| Users table | 🟢 Completed | High | - | v1.0 (MVP) | User schema present |
| Transactions table | 🟢 Completed | High | - | v1.0 (MVP) | Transaction log present |
| Tasks table | 🟢 Completed | High | - | v1.0 (MVP) | Task definitions |
| Task assignments table | 🔴 Not Started | Medium | - | v2.0 | Pending schema |
| Task completions table | 🟢 Completed | High | - | v1.0 (MVP) | Completed tasks |
| Allowances table | 🟢 Completed | High | - | v2.0 | Allowance configs |
| Advance requests table | 🟢 Completed | Medium | - | v2.0 | Advance tracking |
| Database migrations | 🟡 In Progress | Medium | - | v2.0 | Basic migrations added on startup for columns |
| Database indexing | 🔴 Not Started | Medium | - | v2.0 | Performance |
| WAL mode | 🟢 Completed | Medium | - | v1.0 (MVP) | Enabled pragmas for WAL and foreign keys |
| Foreign key constraints | 🟢 Completed | High | - | v1.0 (MVP) | Enforced via schema |
| Automated backups | 🔴 Not Started | Medium | - | v2.0 | Data safety |

---

## 5. Internationalization (i18n)

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| i18n framework setup | 🟢 Completed | High | - | v2.0 | Custom frontend i18n |
| English translations | 🟢 Completed | High | - | v2.0 | Frontend dictionaries added |
| French translations | 🟢 Completed | High | - | v2.0 | Frontend dictionaries added |
| Language switcher UI | 🟢 Completed | High | - | v2.0 | Admin switcher implemented |
| Backend i18n | 🔴 Not Started | Medium | - | v2.0 | API messages |
| Frontend i18n | 🟢 Completed | High | - | v2.0 | Admin dashboard translated |
| Date formatting | 🟢 Completed | Medium | - | v2.0 | Intl.DateTimeFormat used |
| Currency formatting | 🟢 Completed | Medium | - | v2.0 | Intl.NumberFormat used |
| Language persistence | 🟢 Completed | Medium | - | v2.0 | localStorage |
| Spanish translations | 🟣 Deferred | Low | - | v4.0+ | Additional language |
| German translations | 🟣 Deferred | Low | - | v4.0+ | Additional language |

---

## 6. Security Features

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| Password hashing (bcrypt) | 🟢 Completed | High | - | v1.0 (MVP) | Secure storage |
| JWT authentication | 🟢 Completed | High | - | v1.0 (MVP) | Token-based |
| Input validation | 🟢 Completed | High | - | v1.0 (MVP) | express-validator on endpoints |
| SQL injection prevention | 🟢 Completed | High | - | v1.0 (MVP) | Parameterized queries |
| XSS protection | 🟡 In Progress | High | - | v1.0 (MVP) | HTML escaping for HTMX fragments |
| CSRF protection | 🔴 Not Started | Medium | - | v1.0 (MVP) | Form tokens |
| Rate limiting | 🟢 Completed | Medium | - | v2.0 | express-rate-limit enabled |
| HTTPS enforcement | 🔴 Not Started | Medium | - | v2.0 | Secure communication |
| Session management | 🟡 In Progress | High | - | v1.0 (MVP) | Token expiration only |
| Role-based authorization | 🟢 Completed | High | - | v1.0 (MVP) | Admin vs user |
| Security headers | 🟡 In Progress | Medium | - | v2.0 | Helmet installed (CSP pending) |
| Audit logging | 🟣 Deferred | Low | - | v4.0+ | Security events |

---

## 7. Deployment & DevOps

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| Dockerfile | 🟢 Completed | High | - | v1.0 (MVP) | Container image for backend |
| Docker Compose | 🟢 Completed | High | - | v1.0 (MVP) | Orchestration for development and RPi deployment |
| Environment variables | 🟡 In Progress | High | - | v1.0 (MVP) | dotenv in use, template pending |
| .env.example | 🔴 Not Started | High | - | v1.0 (MVP) | Template |
| Setup script | 🔴 Not Started | Medium | - | v1.0 (MVP) | Initial setup |
| Backup script | 🔴 Not Started | Medium | - | v2.0 | Database backup |
| Health check endpoint | 🟢 Completed | Medium | - | v2.0 | `/health` endpoint |
| Logging system | 🟢 Completed | Medium | - | v1.0 (MVP) | Winston logger configured |
| Error tracking | 🟡 In Progress | Low | - | v2.0 | Sentry integrated (optional) |
| Auto-restart on failure | 🔴 Not Started | Medium | - | v2.0 | Docker policy |
| Update mechanism | 🟣 Deferred | Low | - | v4.0+ | Easy updates |
| Configuration UI | 🟣 Deferred | Low | - | v4.0+ | Web-based config |

---

## 8. Raspberry Pi Specific

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| GPIO setup | 🔴 Not Started | Medium | - | v3.0 | Pin configuration |
| RFID reader integration | 🔴 Not Started | Medium | - | v3.0 | Hardware setup |
| RFID Python script | 🔴 Not Started | Medium | - | v3.0 | Card reading |
| RFID systemd service | 🔴 Not Started | Medium | - | v3.0 | Auto-start |
| LCD display support | 🟣 Deferred | Low | - | v4.0+ | Optional display |
| LED indicators | 🟣 Deferred | Low | - | v4.0+ | Status lights |
| Button input | 🟣 Deferred | Low | - | v4.0+ | Physical buttons |
| Performance optimization | 🔴 Not Started | Medium | - | v1.0 (MVP) | For Pi hardware - Docker deployment ready |
| Low-power mode | 🟣 Deferred | Low | - | v4.0+ | Energy saving |

---

## 9. Testing & Quality Assurance

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| Unit tests (backend) | 🟢 Completed | High | - | v1.0 (MVP) | Jest tests for routes and services added |
| Integration tests (API) | 🟢 Completed | Medium | - | v1.0 (MVP) | Supertest integration tests implemented |
| Frontend tests | 🔴 Not Started | Low | - | v2.0 | UI testing |
| Test coverage reporting | 🔴 Not Started | Low | - | v2.0 | Coverage metrics |
| Manual test plan | 🔴 Not Started | Medium | - | v1.0 (MVP) | QA checklist |
| Performance testing | 🔴 Not Started | Low | - | v2.0 | Load testing |
| Security testing | 🔴 Not Started | Medium | - | v2.0 | Vulnerability scan |
| Accessibility testing | 🟣 Deferred | Low | - | v4.0+ | WCAG compliance |

---

## 10. Documentation

| Feature | Status | Priority | Assigned To | Target Version | Notes |
|---------|--------|----------|-------------|----------------|-------|
| PRD | 🟢 Completed | High | - | v1.0 (MVP) | This document |
| AI Development Guide | 🟢 Completed | High | - | v1.0 (MVP) | This document |
| Features Tracking | 🟢 Completed | High | - | v1.0 (MVP) | This document |
| README.md | 🟢 Completed | High | - | v1.0 (MVP) | Backend README created |
| API documentation | 🔴 Not Started | High | - | v1.0 (MVP) | Endpoint docs |
| Installation guide | 🟢 Completed | High | - | v1.0 (MVP) | Setup instructions in docs/INSTALLATION.md |
| User manual | 🔴 Not Started | Medium | - | v2.0 | End-user guide |
| Admin manual | 🔴 Not Started | Medium | - | v2.0 | Admin guide |
| Development setup guide | 🔴 Not Started | Medium | - | v1.0 (MVP) | For developers |
| Troubleshooting guide | 🔴 Not Started | Low | - | v2.0 | Common issues |
| Code documentation | 🔴 Not Started | Medium | - | v1.0 (MVP) | JSDoc comments |
| Architecture diagram | 🔴 Not Started | Medium | - | v1.0 (MVP) | System design |

---

## 11. Version Planning

### v1.0 - MVP (Minimum Viable Product)
**Target Date:** TBD  
**Goal:** Basic functional system with core features

**Included Features:**
- Username/password authentication
- User and admin roles
- User management (CRUD)
- Manual balance adjustments
- Simple transaction history
- Basic task creation and completion (without approval workflow)
- Frontend with PicoCSS
- English language only
- Docker deployment

**Success Criteria:**
- [ ] Admin can create users
- [ ] Admin can adjust balances
- [ ] Admin can create tasks
- [ ] Users can view balance
- [ ] Users can complete tasks
- [ ] Transaction history is recorded
- [ ] System runs in Docker on Raspberry Pi

---

### v2.0 - Core Features
**Target Date:** TBD  
**Goal:** Complete the core functionality

**Included Features:**
- Automatic allowance system with scheduler
- Task approval workflow
- Advance request system
- Task assignment to specific users
- Task frequency limits
- i18n support (English and French)
- Improved UI/UX
- Database migrations
- Automated backups

**Success Criteria:**
- [ ] Allowances are paid automatically
- [ ] Tasks require admin approval (configurable)
- [ ] Users can request advances
- [ ] Admin can approve/reject advances
- [ ] System available in French
- [ ] Performance acceptable on Raspberry Pi

---

### v3.0 - Hardware Integration
**Target Date:** TBD  
**Goal:** RFID card authentication

**Included Features:**
- RFID reader support
- RFID card + PIN authentication
- GPIO integration
- RFID card management UI
- Python script for RFID reading
- Systemd service for RFID

**Success Criteria:**
- [ ] Users can log in with RFID card
- [ ] PIN provides additional security
- [ ] RFID reader works reliably
- [ ] Easy RFID card registration

---

### v4.0+ - Enhancements
**Target Date:** TBD  
**Goal:** Additional features and improvements

**Possible Features:**
- Goal setting and savings targets
- Visual analytics and reports
- Additional languages
- Gamification (badges, achievements)
- Spending categories
- Budget planning
- LCD display support
- LED indicators
- Export data to CSV
- Advanced permissions
- Dark mode
- Custom themes

---

## 12. Risk Register

| Risk | Impact | Likelihood | Mitigation | Owner |
|------|--------|------------|------------|-------|
| Raspberry Pi performance issues | High | Medium | Optimize code, use caching, document min requirements | Dev Team |
| RFID hardware compatibility | Medium | Medium | Test with specific models, document compatible hardware | Dev Team |
| Data loss from SD card failure | High | Low | Automated backups, external storage | Dev Team |
| Database corruption | High | Low | Use WAL mode, regular backups, transaction safety | Dev Team |
| Scope creep | Medium | High | Stick to version plan, prioritize ruthlessly | Project Manager |
| Insufficient testing | Medium | Medium | Maintain test coverage, manual QA checklist | QA Team |
| Security vulnerabilities | High | Medium | Security review, input validation, regular updates | Dev Team |

---

## 13. Feature Request Log

| Date | Requested By | Feature | Priority | Status | Notes |
|------|--------------|---------|----------|--------|-------|
| - | - | - | - | - | No requests yet |

---

## 14. Bug Tracking

| ID | Severity | Description | Status | Assigned To | Fixed In |
|----|----------|-------------|--------|-------------|----------|
| - | - | - | - | - | No bugs yet |

---

## 15. Changelog

### Unreleased
- Initial project documentation created
- PRD completed
- AI Development Guide completed
- Features Tracking document completed
- Added spinner for Generate Default Tasks in admin tasks page (UX improvement)
- Added reusable admin action spinner and applied to primary forms
- Added skeleton loader for User dashboard (balance/tasks/transactions)
- Added basic E2E Puppeteer script (scripts/e2e/login-test.js) — testing in progress

---

## 16. Progress Summary

**Overall Progress:** 64/300+ features completed (21%)

### By Category:
- Authentication & Authorization: 5/10 completed (50%)
- User Management: 5/10 completed (50%)
- Balance Management: 5/8 completed (62%)
- Allowance System: 8/10 completed (80%)
- Task Management: 9/14 completed (64%)
- Advance Request System: 7/9 completed (78%)
- Transaction History: 5/9 completed (56%)
- Frontend - General UI: 6/13 completed (46%)
- Frontend - User Pages: 0/7 completed (0%)
- Frontend - Admin Pages: 7/8 completed (88%)
- Backend API: 31/32 completed (97%)
- Database: 9/13 completed (69%)
- i18n: 8/11 completed (73%)
- Security: 6/12 completed (50%)
- Deployment: 4/12 completed (33%)
- Raspberry Pi Specific: 0/9 completed (0%)
- Testing: 2/8 completed (25%)
- Documentation: 5/12 completed (42%)

---

## 17. Next Steps

1. Review and approve PRD
2. Set up project repository structure
3. Initialize backend Node.js project
4. Create database schema
5. Implement authentication system
6. Begin MVP feature development

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-04 | Initial | First version with all planned features |

