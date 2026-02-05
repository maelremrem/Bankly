# AI Development Guide for Monly Project

**Version:** 1.0  
**Date:** February 4, 2026  
**Purpose:** Guide for using AI assistants to develop the Monly pocket money management system

---

## 1. Introduction

This guide provides structured instructions for developing the Monly project using AI coding assistants (such as GitHub Copilot, Claude, ChatGPT, or similar tools). Following these guidelines ensures consistency, quality, and efficient development.

---

## 2. General Principles

### 2.1 Context First
Always provide the AI with sufficient context before requesting code generation:
- Current file structure
- Related files and their purposes
- Database schema
- API endpoints already defined
- Existing conventions in the codebase

### 2.2 Incremental Development
Break down features into small, manageable chunks:
- One feature at a time
- One file or component at a time
- Test after each increment

### 2.3 Consistency is Key
Maintain consistent patterns throughout the codebase:
- Follow established naming conventions
- Use the same code structure patterns
- Apply consistent error handling
- Maintain uniform API response formats

---

## 3. Project Structure Overview

```
Monly/
├── backend/
│   ├── src/
│   │   ├── config/          # Configuration files
│   │   ├── controllers/     # Route controllers
│   │   ├── middleware/      # Express middleware
│   │   ├── models/          # Database models
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── utils/           # Utility functions
│   │   ├── i18n/            # Internationalization files
│   │   └── app.js           # Main application file
│   ├── database/
│   │   └── schema.sql       # Database schema
│   ├── tests/               # Backend tests
│   ├── Dockerfile
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── public/
│   │   ├── css/             # Stylesheets (PicoCSS)
│   │   ├── js/              # JavaScript files
│   │   └── index.html       # Main HTML file
│   ├── admin/               # Admin interface pages
│   ├── user/                # User interface pages
│   └── i18n/                # Frontend translation files
├── scripts/
│   ├── setup.sh             # Initial setup script
│   ├── backup.sh            # Database backup script
│   └── rfid/                # RFID reader scripts
├── docs/
│   ├── PRD.md
│   ├── AI_DEVELOPMENT_GUIDE.md
│   ├── FEATURES_TRACKING.md
│   └── API.md               # API documentation
├── docker-compose.yml
└── README.md
```

---

## 4. Step-by-Step Development Workflow

### Phase 1: Project Setup

#### Step 1.1: Initialize Backend
**Prompt for AI:**
```
Create a Node.js backend setup for the Monly project with the following requirements:
- Express.js framework
- SQLite database using better-sqlite3 or sqlite3 package
- Environment variable support with dotenv
- CORS middleware
- JSON body parser
- Error handling middleware
- Basic logging with morgan
- Create package.json with these dependencies

Generate the basic app.js file with:
- Express app initialization
- Middleware configuration
- Basic error handler
- Server startup on port from environment variable (default 3000)
```

#### Step 1.2: Database Schema
**Prompt for AI:**
```
Based on the Monly PRD, create a complete SQLite schema with the following tables:
- users (with fields for authentication, role, balance, language, RFID)
- transactions (with type, amount, status, references to users)
- tasks (task definitions with rewards and approval requirements)
- task_assignments (link tasks to users with frequency limits)
- task_completions (tracking completed tasks and approval status)
- allowances (automatic payment configuration per user)
- advance_requests (tracking allowance advance requests)

Include:
- Proper primary keys and foreign keys
- Indexes for performance
- Default values
- Created_at/updated_at timestamps
- Comments explaining each table and field
```

#### Step 1.3: Database Connection Module
**Prompt for AI:**
```
Create a database connection module for SQLite in backend/src/config/database.js that:
- Initializes the SQLite database connection
- Runs the schema if database is new
- Exports methods for query execution
- Handles errors gracefully
- Uses WAL mode for better concurrency
- Includes transaction support
```

---

### Phase 2: Authentication System

#### Step 2.1: User Model
**Prompt for AI:**
```
Create a User model in backend/src/models/User.js that provides methods for:
- createUser(username, password, role) - with password hashing using bcrypt
- findByUsername(username)
- findById(id)
- updatePassword(userId, newPassword)
- updateRFID(userId, rfidCardId, pin)
- verifyPassword(username, password)
- verifyRFID(rfidCardId, pin)
- getAllUsers()
- deleteUser(userId)

Use bcrypt for password hashing with appropriate salt rounds.
Return user objects without password hashes.
```

#### Step 2.2: Authentication Middleware
**Prompt for AI:**
```
Create authentication middleware in backend/src/middleware/auth.js that:
- Verifies JWT tokens from Authorization header
- Extracts user information from token
- Attaches user object to req.user
- Handles missing or invalid tokens
- Provides separate middleware for admin-only routes (requireAdmin)
- Uses jsonwebtoken package

Also create a token generation utility in backend/src/utils/tokenUtils.js
```

#### Step 2.3: Auth Routes
**Prompt for AI:**
```
Create authentication routes in backend/src/routes/auth.js:
- POST /auth/login - username/password login
- POST /auth/rfid-login - RFID card + PIN login
- POST /auth/logout - invalidate session
- GET /auth/me - get current user info

Include proper validation, error handling, and return JWT tokens.
Use the User model and token utilities created earlier.
```

---

### Phase 3: Core Features Development

#### Step 3.1: User Management (Admin)
**Prompt for AI:**
```
Create user management features in backend/src/controllers/userController.js and routes:
- GET /api/users - list all users (admin only)
- POST /api/users - create new user (admin only)
- PUT /api/users/:id - update user (admin only)
- DELETE /api/users/:id - delete user (admin only)
- GET /api/users/:id/balance - get user balance

Include validation, authorization checks, and proper error responses.
Create the corresponding routes in backend/src/routes/users.js
```

#### Step 3.2: Transaction Service
**Prompt for AI:**
```
Create a transaction service in backend/src/services/transactionService.js that:
- createTransaction(userId, type, amount, description, createdBy)
- getTransactionHistory(userId, filters)
- getAllTransactions(filters) - admin only
- updateBalance(userId, amount) - atomic operation

Ensure all balance changes are recorded as transactions.
Use database transactions for atomicity.
Handle negative balance prevention (configurable).
```

#### Step 3.3: Task Management
**Prompt for AI:**
```
Create task management system:

1. Task model (backend/src/models/Task.js):
   - createTask(name, description, rewardAmount, requiresApproval)
   - getAllTasks()
   - updateTask(id, updates)
   - deleteTask(id)
   - assignTaskToUser(taskId, userId, frequencyLimit, periodType)
   - getAvailableTasksForUser(userId)

2. Task completion controller (backend/src/controllers/taskController.js):
   - POST /api/tasks - create task (admin)
   - GET /api/tasks - list all tasks
   - PUT /api/tasks/:id - update task (admin)
   - DELETE /api/tasks/:id - delete task (admin)
   - POST /api/tasks/:id/assign - assign to user (admin)
   - GET /api/tasks/available - get user's available tasks
   - POST /api/tasks/:id/complete - mark task as completed
   - POST /api/tasks/completions/:id/approve - approve completion (admin)
   - POST /api/tasks/completions/:id/reject - reject completion (admin)
```

#### Step 3.4: Allowance System
**Prompt for AI:**
```
Create allowance management system:

1. Allowance model (backend/src/models/Allowance.js):
   - createAllowance(userId, amount, frequency)
   - updateAllowance(id, updates)
   - deleteAllowance(id)
   - getAllowancesByUser(userId)
   - processScheduledAllowances() - for cron job

2. Allowance controller and routes:
   - POST /api/allowances - create allowance config (admin)
   - GET /api/allowances - list all allowances (admin)
   - GET /api/allowances/user/:userId - get user's allowance
   - PUT /api/allowances/:id - update allowance (admin)
   - DELETE /api/allowances/:id - delete allowance (admin)

3. Scheduler service (backend/src/services/schedulerService.js):
   - Set up node-cron to check and process allowances
   - Run daily check for due allowances
   - Create transactions for processed allowances
```

#### Step 3.5: Advance Request System
**Prompt for AI:**
```
Create advance request system in backend/src/models/AdvanceRequest.js and routes:
- createAdvanceRequest(userId, amount)
- getAdvanceRequestsByUser(userId)
- getAllPendingRequests() - admin only
- approveRequest(requestId, adminId)
- rejectRequest(requestId, adminId)

Routes:
- POST /api/advances - create advance request (user)
- GET /api/advances/my - get user's requests
- GET /api/advances/pending - get all pending (admin)
- POST /api/advances/:id/approve - approve request (admin)
- POST /api/advances/:id/reject - reject request (admin)

When approved, create transaction and deduct from next allowance.
```

---

### Phase 4: Frontend Development

#### Step 4.1: Base HTML Structure
**Prompt for AI:**
```
Create base HTML structure for Monly using PicoCSS:

1. frontend/public/index.html - Landing/login page with:
   - PicoCSS included via CDN
   - Login form for username/password
   - Alternative RFID login interface
   - Language selector
   - Responsive design

2. frontend/public/css/custom.css - Custom styles for:
   - Branding colors
   - Child-friendly larger buttons and text
   - Custom components
   - Print styles

Use semantic HTML5 and ensure accessibility.
```

#### Step 4.2: Frontend JavaScript Architecture
**Prompt for AI:**
```
Create frontend JavaScript structure:

1. frontend/public/js/api.js - API client that:
   - Handles all HTTP requests to backend
   - Manages JWT token storage and inclusion
   - Provides methods for each API endpoint
   - Handles errors and displays notifications

2. frontend/public/js/auth.js - Authentication logic:
   - Login form handling
   - Token management
   - User session checking
   - Logout functionality
   - Redirect logic based on role

3. frontend/public/js/i18n.js - Internationalization:
   - Load translation files
   - Switch languages
   - Translate page content dynamically
   - Store language preference

4. frontend/public/js/utils.js - Utility functions:
   - Date formatting
   - Currency formatting
   - Form validation
   - DOM manipulation helpers
```

#### Step 4.3: User Dashboard
**Prompt for AI:**
```
Create user dashboard page (frontend/user/dashboard.html) with:
- Current balance display (large, prominent)
- Next allowance date and amount
- Available tasks list with "Complete" buttons
- Recent transactions (last 5)
- Button to request advance
- Button to view full history
- Language selector
- Logout button

Create corresponding JavaScript (frontend/public/js/user-dashboard.js) to:
- Fetch and display user data
- Handle task completion
- Handle advance requests
- Refresh data periodically
```

#### Step 4.4: Admin Dashboard
**Prompt for AI:**
```
Create admin dashboard (frontend/admin/dashboard.html) with sections for:
- User management (list, add, edit, delete)
- Task management (create, edit, assign)
- Allowance configuration
- Pending approvals (tasks and advances)
- Transaction history viewer with filters
- Quick balance adjustments

Create admin JavaScript modules:
- frontend/public/js/admin/user-management.js
- frontend/public/js/admin/task-management.js
- frontend/public/js/admin/allowance-management.js
- frontend/public/js/admin/approvals.js
- frontend/public/js/admin/transactions.js

Each module should handle its respective CRUD operations and UI updates.
```

---

### Phase 5: Internationalization (i18n)

#### Step 5.1: Backend i18n
**Prompt for AI:**
```
Set up i18n for backend using i18next:

1. Install and configure i18next in backend
2. Create translation files:
   - backend/src/i18n/locales/en/translation.json
   - backend/src/i18n/locales/fr/translation.json

3. Include translations for:
   - Error messages
   - Email templates (if any)
   - System notifications
   - API response messages

4. Create middleware to detect user language preference
5. Provide translated error messages in API responses
```

#### Step 5.2: Frontend i18n
**Prompt for AI:**
```
Create frontend internationalization system:

1. Translation files:
   - frontend/public/i18n/en.json
   - frontend/public/i18n/fr.json

2. Include translations for:
   - All UI labels and buttons
   - Form field labels and placeholders
   - Error messages
   - Success messages
   - Navigation items
   - Help text

3. Implement dynamic language switching without page reload
4. Store language preference in localStorage
5. Add data-i18n attributes to HTML elements for automatic translation
```

---

### Phase 6: Docker and Deployment

#### Step 6.1: Dockerfile
**Prompt for AI:**
```
Create production-ready Dockerfile for the Monly Node.js backend:
- Use Node.js LTS Alpine image
- Set up proper working directory
- Copy package files and install dependencies
- Copy application code
- Set up non-root user
- Expose appropriate port
- Health check endpoint
- Use multi-stage build if beneficial
- Optimize for layer caching
```

#### Step 6.2: Docker Compose
**Prompt for AI:**
```
Create docker-compose.yml for Monly that:
- Defines backend service
- Sets up volume for SQLite database persistence
- Sets up volume for backups
- Configures environment variables
- Maps ports appropriately
- Includes healthcheck
- Optionally includes nginx for serving frontend static files
- Includes restart policies

Also create .env.example with all required environment variables and comments.
```

---

### Phase 7: RFID Integration (Raspberry Pi Specific)

#### Step 7.1: RFID Reader Script
**Prompt for AI:**
```
Create Python script for RFID reader on Raspberry Pi (scripts/rfid/reader.py):
- Use MFRC522 library for RC522 RFID reader
- Read RFID card UID
- Send UID to backend API for authentication
- Display results on console or optional LCD
- Handle errors gracefully
- Run as background service

Include:
- Installation instructions
- GPIO pin configuration
- Systemd service file for auto-start
```

#### Step 7.2: RFID Registration Interface
**Prompt for AI:**
```
Create admin interface for RFID card registration:
- Page in admin dashboard for managing RFID cards
- Ability to assign RFID card UID to user
- Set or change PIN for RFID authentication
- Test RFID card reading
- Deactivate/remove RFID cards

Backend endpoints:
- POST /api/users/:id/rfid - assign RFID card to user
- DELETE /api/users/:id/rfid - remove RFID card
- PUT /api/users/:id/rfid/pin - update PIN
```

---

## 5. Prompting Best Practices

### 5.1 Effective Prompt Structure

**Good Prompt Template:**
```
Context: [Describe what already exists]
Task: [What you want to create/modify]
Requirements: [Specific requirements]
Constraints: [Limitations or preferences]
Output format: [How you want the code structured]
```

**Example:**
```
Context: I have a Node.js backend with Express and SQLite. The user model and authentication are already implemented.

Task: Create a transaction history endpoint.

Requirements:
- GET /api/transactions endpoint
- Support filtering by user_id, type, and date range
- Pagination with limit and offset
- Admin can see all transactions, users only their own
- Return transactions sorted by date descending

Constraints:
- Use existing auth middleware
- Follow the same error handling pattern as other endpoints
- Use existing transactionService methods if available

Output format:
- Controller function
- Route definition
- Include JSDoc comments
```

### 5.2 Iterative Refinement

After receiving generated code:
1. **Review** - Check if it meets requirements
2. **Test** - Try it in your environment
3. **Refine** - Ask for specific improvements:
   - "Add input validation for the amount field"
   - "Handle the case when user not found"
   - "Add JSDoc comments"
   - "Make this function more efficient"

### 5.3 Asking for Explanations

When you don't understand generated code:
- "Explain what this function does line by line"
- "Why did you use [specific approach]?"
- "What are the alternatives to this implementation?"

---

## 6. Code Quality Guidelines

### 6.1 Request Code with These Qualities

Always ask AI to generate code that includes:

**Documentation:**
- JSDoc comments for all functions
- Inline comments for complex logic
- README files for modules

**Error Handling:**
- Try-catch blocks for async operations
- Proper error messages
- Appropriate HTTP status codes
- Logging of errors

**Validation:**
- Input validation on all API endpoints
- Type checking
- Sanitization of user input
- SQL injection prevention

**Testing:**
- Unit tests for services and models
- Integration tests for API endpoints
- Use Jest or Mocha for testing

### 6.2 Code Review Checklist

When reviewing AI-generated code, check for:
- [ ] Proper error handling
- [ ] Input validation
- [ ] Security vulnerabilities
- [ ] Performance considerations
- [ ] Code documentation
- [ ] Consistent code style
- [ ] No hardcoded values (use config)
- [ ] Proper logging
- [ ] No console.log in production code

---

## 7. Common Pitfalls to Avoid

### 7.1 AI-Specific Issues

**Issue**: AI generates code with incorrect imports
**Solution**: Always verify import statements match your project structure

**Issue**: AI uses libraries not in package.json
**Solution**: Check generated dependencies and install them

**Issue**: AI assumes different database than specified
**Solution**: Always specify "using SQLite" in prompts

**Issue**: Inconsistent naming conventions
**Solution**: Provide examples of existing code naming

### 7.2 Development Issues

**Issue**: Forgetting to handle edge cases
**Solution**: Explicitly ask "What edge cases should I handle?"

**Issue**: No transaction safety in database operations
**Solution**: Request "wrap this in a database transaction"

**Issue**: No authentication checks
**Solution**: Always mention "ensure proper authentication and authorization"

---

## 8. Testing Strategy

### 8.1 Request Tests from AI

**Example Prompt:**
```
Create Jest unit tests for the transactionService.js file:
- Test createTransaction with valid data
- Test createTransaction with invalid data
- Test createTransaction with negative balance
- Test getTransactionHistory with filters
- Test pagination
- Mock database calls
- Use appropriate assertions
```

### 8.2 Manual Testing Checklist

After implementing features:
- [ ] Test happy path
- [ ] Test error cases
- [ ] Test authentication/authorization
- [ ] Test with different user roles
- [ ] Test with different locales
- [ ] Test on Raspberry Pi hardware
- [ ] Test RFID functionality (if applicable)

---

## 9. Debugging with AI

### 9.1 Providing Error Context

When asking AI to help debug:
```
I'm getting this error: [paste error message]

In this code: [paste relevant code]

Context:
- Using Node.js v16
- SQLite database
- This happens when [describe scenario]

What could be causing this?
```

### 9.2 Progressive Debugging

1. Ask AI to explain the error
2. Ask for possible causes
3. Ask for diagnostic steps
4. Ask for solution
5. Ask for prevention strategies

---

## 10. Performance Optimization

### 10.1 Optimization Prompts

**Database Query Optimization:**
```
Review this database query for performance issues:
[paste query]

The table has [X] rows.
Suggest optimizations including:
- Index recommendations
- Query restructuring
- N+1 query prevention
```

**Code Performance:**
```
This function is slow when processing many users:
[paste function]

Suggest optimizations for:
- Time complexity
- Memory usage
- Database calls
```

---

## 11. Documentation Generation

### 11.1 API Documentation

**Prompt:**
```
Generate API documentation in Markdown for these endpoints:
[paste route definitions]

Include:
- HTTP method and path
- Description
- Authentication requirements
- Request parameters
- Request body schema
- Response format
- Example request/response
- Possible error codes
```

### 11.2 Code Documentation

**Prompt:**
```
Add comprehensive JSDoc comments to this code:
[paste code]

Include:
- Function description
- @param tags with types
- @returns tag
- @throws tag for errors
- Usage examples
```

---

## 12. Version Control Integration

### 12.1 Commit Message Generation

**Prompt:**
```
Generate a conventional commit message for these changes:
[describe changes]

Follow format: type(scope): description
Types: feat, fix, docs, style, refactor, test, chore
```

### 12.2 Code Review Comments

**Prompt:**
```
Review this pull request code and provide constructive feedback:
[paste code]

Focus on:
- Code quality
- Security issues
- Performance
- Best practices
- Potential bugs
```

---

## 13. Maintenance and Updates

### 13.1 Dependency Updates

**Prompt:**
```
I need to update [package-name] from version X to Y in my project.

Current usage: [show current code]

What breaking changes should I be aware of?
What code needs to be updated?
Provide migration steps.
```

### 13.2 Refactoring

**Prompt:**
```
Refactor this code to be more maintainable:
[paste code]

Goals:
- Reduce complexity
- Improve readability
- Follow SOLID principles
- Add proper error handling
- Maintain same functionality
```

---

## 14. Security Considerations

### 14.1 Security Review Prompt

**Always ask AI to review for security:**
```
Review this code for security vulnerabilities:
[paste code]

Check for:
- SQL injection
- XSS vulnerabilities
- Authentication bypasses
- Authorization issues
- Sensitive data exposure
- Input validation
- CSRF protection
```

### 14.2 Secure Coding Practices

Request AI to implement:
- Password hashing with bcrypt
- JWT token with expiration
- Rate limiting on auth endpoints
- Input sanitization
- Parameterized SQL queries
- Secure HTTP headers
- HTTPS enforcement

---

## 15. Raspberry Pi Specific Considerations

### 15.1 Performance Optimization for Pi

**Prompt:**
```
Optimize this Node.js code for Raspberry Pi 3B+:
[paste code]

Consider:
- Limited CPU (1.4GHz quad-core)
- Limited RAM (1GB)
- SD card I/O limitations
- Power efficiency

Suggest:
- Memory optimizations
- Caching strategies
- Efficient algorithms
- Background process management
```

### 15.2 Hardware Integration

**Prompt:**
```
Create Node.js code to interface with GPIO on Raspberry Pi:
- Read input from pin X
- Write output to pin Y
- Use onoff or pigpio library
- Handle cleanup on exit
- Include error handling
```

---

## 16. Troubleshooting Guide

### Common Issues and AI Prompts to Resolve

**Issue: Module not found**
```
I'm getting "Cannot find module 'X'" error.
My package.json has: [paste dependencies]
My import statement: [paste import]
How do I fix this?
```

**Issue: Database locked**
```
Getting "database is locked" error with SQLite.
Current configuration: [paste config]
Multiple read/write operations happening.
How to fix with proper connection pooling or WAL mode?
```

**Issue: CORS errors**
```
Frontend can't access backend API due to CORS.
Backend running on: localhost:3000
Frontend running on: localhost:8080
Show me how to configure CORS properly.
```

---

## 17. Resources and References

### Recommended Learning Resources

**Node.js & Express:**
- Express.js official documentation
- Node.js best practices guide

**SQLite:**
- SQLite official documentation
- better-sqlite3 npm package documentation

**Frontend:**
- PicoCSS documentation: https://picocss.com
- MDN Web Docs for HTML/CSS/JavaScript

**Raspberry Pi:**
- Official Raspberry Pi documentation
- GPIO library documentation

**Docker:**
- Docker official documentation
- Docker Compose reference

---

## 18. Conclusion

This guide provides a comprehensive approach to developing the Monly project with AI assistance. Remember:

1. **Start small** - Build incrementally
2. **Test frequently** - Verify each component
3. **Document everything** - Future you will thank you
4. **Review AI code** - Don't blindly trust generated code
5. **Iterate** - Refine and improve continuously

The key to successful AI-assisted development is clear communication, proper context, and iterative refinement. Use this guide as a reference throughout the development process.

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-04 | Initial | First version of AI Development Guide |

