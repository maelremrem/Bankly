# Product Requirements Document (PRD)
## Bankly - Pocket Money Bank Simulator

**Version:** 1.0  
**Date:** February 7, 2026  
**Status:** Draft (updated)

---

## 1. Executive Summary

Bankly is a web-based pocket money management system designed to run on Raspberry Pi. Its primary goal is to educate children about money management through a simulated banking experience. The application provides a safe environment for children to learn about saving, earning through tasks, and managing their finances with parental oversight.

---

## 2. Product Vision

To create an engaging, educational platform that teaches children financial responsibility through hands-on experience with pocket money management in a controlled, family-friendly environment.

---

## 3. Target Users

### Primary Users
- **Children (Ages 6-16)**: End users who manage their virtual pocket money
- **Parents/Guardians**: Administrators who oversee and configure the system

### Use Context
- Home environment on Raspberry Pi
- Family setting with 1-5 children
- Accessible via local network web interface

---

## 4. Core Features

### 4.1 User Roles

#### Administrator Role
The administrator has complete system control with the following capabilities:

**User Management**
- Add new users (children)
- Remove existing users
- Edit user information
- View all user accounts

**Balance Management**
- Manually adjust user balances (add/subtract funds)
- View current balance of all users
- Set initial balance for new users

**Allowance Management**
- Configure automatic allowance payments per user
- Set allowance amount
- Define payment frequency (daily, weekly, monthly)
- Enable/disable automatic allowances

**Task Management**
- Create task definitions with rewards
- Edit existing tasks
- Delete tasks
- Set task availability (which users can access which tasks)
- Configure task frequency limits per user
- Set validation requirements (auto-approve or require admin approval)
- Approve or reject completed tasks

**Advance Requests**
- Review advance requests from users
- Approve or deny advance requests
- View advance history

**History & Reporting**
- View complete transaction history for all accounts
- Filter and search transactions
- Export history data

#### User Role
Standard users (children) have limited access with the following features:

**Balance Viewing**
- View current balance
- See next allowance date and amount

**Task Selection**
- Browse available tasks
- Select tasks to complete
- View task rewards
- Submit completed tasks for approval (if required)

**Advance Requests**
- Request advance on next allowance payment
- View status of pending requests
- View advance history

**Personal History**
- View personal transaction history
- Filter by transaction type (allowance, task, advance, manual adjustment)

---

### 4.2 Authentication System

**Primary Authentication Method**
- Username and password login
- Secure password storage (hashed)
- Session management and refresh tokens (refresh endpoint, cookie-based refresh + token rotation)

**Alternative Authentication Method**
- RFID card + PIN code on Raspberry Pi
- Backend RFID API and local Python reader script implemented; hardware GPIO integration and systemd auto-start remain pending
- Each user assigned unique RFID card
- 4-6 digit PIN for security; endpoints include `pin-login` and `change-pin` with audit logging (`pin_audit` table)

---

### 4.3 Internationalization (i18n)

**Supported Languages**
- English (default)
- French

**Implementation Requirements**
- All UI text must be translatable
- Language selection in user settings
- Persistent language preference per user
- Date and currency formatting per locale

---

## 5. Technical Requirements

### 5.1 Technology Stack

**Frontend**
- HTML5
- CSS3 with PicoCSS framework
- Vanilla JavaScript or lightweight framework
- HTMX for dynamic content updates
- Responsive design for various screen sizes

**Backend**
- Node.js runtime
- Express.js or similar framework
- RESTful API architecture
- Refresh token rotation with cookie-based refresh endpoint (implemented)

**Database**
- SQLite
- Single file database for portability
- Transaction support for data integrity

**Deployment**
- Docker containerization
- Docker Compose for orchestration
- Environment-based configuration

**Hardware**
- Raspberry Pi (Model 3B+ or newer recommended)
- Optional: RFID-RC522 reader for card authentication

---

### 5.2 System Architecture

```
┌─────────────────────────────────────────┐
│         Web Browser (Client)            │
│     (HTML/CSS/JS/HTMX - PicoCSS)        │
└────────────────┬────────────────────────┘
                 │ HTTP/HTTPS
┌────────────────┴────────────────────────┐
│         Node.js Backend Server          │
│         (Express.js API)                │
├─────────────────────────────────────────┤
│         Business Logic Layer            │
│  - Authentication                       │
│  - User Management                      │
│  - Transaction Processing               │
│  - Task Management                      │
│  - Allowance Scheduler                  │
└────────────────┬────────────────────────┘
                 │
┌────────────────┴────────────────────────┐
│         SQLite Database                 │
│  - Users                                │
│  - Transactions                         │
│  - Tasks                                │
│  - Allowances                           │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│    RFID Reader (Optional Hardware)      │
│    Connected to Raspberry Pi GPIO       │
└─────────────────────────────────────────┘
```

---

### 5.3 Database Schema (High-Level)

**Users Table**
- id, username, password_hash, role, rfid_card_id, pin_hash, balance, language, created_at, updated_at

**Transactions Table**
- id, user_id, type, amount, description, status, created_by, created_at

**Tasks Table**
- id, name, description, reward_amount, requires_approval, created_at, updated_at

**Refresh Tokens Table**
- id, user_id, token_hash, expires_at, created_at (used for rotating refresh tokens and refresh endpoint)

**PIN Audit Table**
- id, user_id, action, performed_by, details, created_at (audit for PIN creation/change)

**TaskAssignments Table**
- id, task_id, user_id, frequency_limit, period_type, enabled

**TaskCompletions Table**
- id, task_id, user_id, status, submitted_at, approved_at, approved_by

**Allowances Table**
- id, user_id, amount, frequency, next_payment_date, enabled, created_at, updated_at

**AdvanceRequests Table**
- id, user_id, amount, status, requested_at, resolved_at, resolved_by

---

## 6. User Stories

### Administrator Stories

**US-A01**: As an administrator, I want to add new users so that my children can have their own accounts.

**US-A02**: As an administrator, I want to set up automatic allowances so that my children receive regular pocket money without manual intervention.

**US-A03**: As an administrator, I want to create tasks with rewards so that my children can earn extra money by helping around the house.

**US-A04**: As an administrator, I want to approve or reject task completions so that I can verify my children have actually completed their chores.

**US-A05**: As an administrator, I want to manually adjust balances so that I can correct mistakes or handle special situations.

**US-A06**: As an administrator, I want to review advance requests so that I can teach my children about responsible borrowing.

**US-A07**: As an administrator, I want to view all transaction history so that I can track money flow and teach accountability.

### User Stories

**US-U01**: As a user, I want to view my current balance so that I know how much money I have.

**US-U02**: As a user, I want to see available tasks so that I can choose how to earn extra money.

**US-U03**: As a user, I want to submit completed tasks so that I can receive my reward.

**US-U04**: As a user, I want to request an advance on my allowance so that I can get money early when needed.

**US-U05**: As a user, I want to view my transaction history so that I can understand where my money comes from and goes.

**US-U06**: As a user, I want to log in with my RFID card and PIN so that accessing the system is quick and easy (backend API and Python reader script implemented; hardware testing and deployment pending).

---

## 7. Non-Functional Requirements

### 7.1 Performance
- Page load time: < 2 seconds on Raspberry Pi 3B+
- Transaction processing: < 500ms
- Support for up to 10 concurrent users

### 7.2 Security
- Passwords hashed with bcrypt or similar
- HTTPS support for secure communication
- Session timeout after 30 minutes of inactivity
- Protection against SQL injection
- CSRF protection for forms
- Input validation on client and server side

### 7.3 Usability
- Intuitive interface suitable for children aged 6+
- Large, clear buttons and text
- Visual feedback for all actions
- Confirmation dialogs for important actions
- Error messages in clear, simple language

### 7.4 Reliability
- Automated database backups
- Transaction atomicity (all-or-nothing)
- Graceful error handling
- System uptime: 99% (allowing for Raspberry Pi restarts)

### 7.5 Maintainability
- Clean, documented code
- Modular architecture
- Comprehensive logging
- Easy configuration via environment variables

---

## 8. Success Metrics

**User Engagement**
- Average login frequency per user per week
- Number of tasks completed per week
- Average session duration

**Educational Impact**
- User balance trends over time
- Advance request frequency
- Task completion rate

**System Health**
- System uptime percentage
- Error rate
- Average response time

---

## 9. Milestones & Roadmap

### Phase 1: MVP (Minimum Viable Product)
- Basic user authentication (username/password)
- User and admin roles
- Manual balance adjustments
- Simple transaction history
- Basic task creation and completion
- English language only

### Phase 2: Core Features
- Automatic allowance system
- Task approval workflow
- Advance request system
- French language support (i18n)
- Improved UI/UX
- Session management & refresh tokens (implemented)

### Phase 3: Hardware Integration
- RFID card authentication (backend API and Python reader script implemented; hardware GPIO integration and systemd auto-start pending)
- PIN code support (endpoints and audit implemented)
- GPIO integration on Raspberry Pi (pending hardware testing)

### Phase 4: Enhancements
- Reporting and analytics
- Goal setting features
- Savings targets
- Additional languages

---

## 10. Constraints & Assumptions

### Constraints
- Must run on Raspberry Pi hardware
- Limited processing power compared to server hardware
- Local network only (not internet-facing by default)
- SQLite database limitations (single-writer)

### Assumptions
- Users have basic web browsing skills
- Raspberry Pi has stable power supply
- Local network is reliable
- One administrator per household
- Maximum 10 child users per system

---

## 11. Risks & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Data loss due to SD card failure | High | Medium | Regular automated backups to external storage |
| RFID reader compatibility issues | Medium | Medium | Document compatible hardware; provide fallback authentication |
| Performance issues on older Pi models | Medium | Low | Optimize code; document minimum requirements |
| Database corruption | High | Low | Use SQLite with WAL mode; regular backups |
| Unauthorized access | High | Low | Strong authentication; session management; local network only |

---

## 12. Out of Scope (for v1.0)

- Real money integration
- Online/cloud synchronization
- Mobile native apps
- Gamification features (badges, achievements)
- Peer-to-peer transfers between users
- Interest calculation on savings
- Spending categories and budgeting
- External bank account integration

---

## 13. Appendices

### Appendix A: Glossary
- **Allowance**: Regular, automatic payment to user account
- **Advance**: Early payment against future allowance
- **Task**: Chore or activity that earns money when completed
- **Balance**: Current amount of money in user account
- **Transaction**: Any change to account balance

### Appendix B: References
- PicoCSS Documentation: https://picocss.com
- Node.js Best Practices
- SQLite Documentation
- Raspberry Pi GPIO Documentation

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-04 | Initial | First draft of PRD |

