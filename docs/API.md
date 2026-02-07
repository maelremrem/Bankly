# API Documentation

Last updated: February 7, 2026

This document describes the backend API for Bankly. Endpoints use JSON request/response by default. All responses follow the pattern:

- Success: { success: true, data: {...}, message?: "..." }
- Error: { success: false, error: "Error message", code?: "ERROR_CODE" }

Authentication
--------------
- Most endpoints require authentication via a Bearer JWT in `Authorization: Bearer <token>` or by cookie `token` set by login flows.
- Admin-only endpoints also require the authenticated user to have role `admin` and are guarded by `requireAdmin` middleware.

Cookies and Token Flow
----------------------
- Access token cookie: `token` (HTTP-only cookie; 8h expiry).
- Refresh token cookie: `refresh` (HTTP-only cookie; 30 day expiry).
- The `/auth/refresh` endpoint rotates refresh tokens: it verifies the provided refresh token, issues a new access token and a new refresh token, stores the new refresh token in DB (`refresh_tokens`) and deletes the old record.
- Logout (`/auth/logout`) revokes the refresh token and clears `token` and `refresh` cookies.

Authentication Endpoints
------------------------
1. POST /auth/login
- Body: { username, password }
- Returns: { success: true, data: { token, role } }
- Behavior: issues access token and refresh token cookies, and stores hashed refresh token in `refresh_tokens` table.

2. POST /auth/refresh
- Body (optional): { refreshToken } or relies on `refresh` cookie
- Returns: { success: true, data: { token } }
- Behavior: rotates refresh token (inserts new token row, deletes old row), sets new cookies.

3. POST /auth/logout
- Body (optional): { refreshToken }
- Returns: { success: true }
- Behavior: deletes refresh token (if present) and clears cookies.

4. POST /auth/pin-login
- Body: { username, pin }
- Notes: PIN format 4-8 digits. If a user has no PIN yet, the first successful `pin-login` sets the PIN (first-time setup) and records an audit in `pin_audit`.
- Returns: { success: true, data: { token, role, pinCreated } }

5. POST /auth/change-pin
- Auth: Bearer token required
- Body: { oldPin?, newPin }
- Notes: if user had no PIN, only `newPin` is required. All changes insert a `pin_audit` record.
- Returns: { success: true }

6. POST /auth/rfid-login
- Body: { card_uid, pin }
- Notes: Look up user by `rfid_card_id`, verify PIN hash via bcrypt, return token and set cookies on success.
- Returns: { success: true, data: { token, role } }

7. GET /auth/rfid-redirect
- Query: ?token=<jwt>
- Behavior: sets `token` cookie and redirects to admin or user dashboard depending on token role. Useful for kiosk/RFID flows where backend returns JWT to a local script that triggers a browser redirect.

8. GET /auth/me
- Auth: Bearer token required
- Returns: { success: true, data: { id, username, role, balance, language } }

Admin / Refresh Token Management
--------------------------------
1. GET /api/admin/refresh-tokens
- Auth: admin
- Query params: userId (optional)
- Returns: list of refresh token records with metadata (id, user_id, created_at, expires_at, username)

2. POST /api/admin/refresh-tokens/:id/revoke
- Auth: admin
- Path param: id (token id)
- Returns: { success: true, data: { deleted } }

3. POST /api/admin/refresh-tokens/revoke
- Auth: admin
- Body: { userId }
- Behavior: delete all refresh tokens for a user

User Management (Admin)
-----------------------
- GET /api/users (admin)
- POST /api/users (admin)
- PUT /api/users/:id (admin)
- DELETE /api/users/:id (admin)
- HTML fragments: GET /api/admin/users/html for HTMX usage

Transactions
------------
- GET /api/transactions (admin; filters supported)
- POST /api/transactions (admin) - manual balance adjustments
- POST /api/transactions/:id/reverse (admin) - reverse a transaction
- Reversal audit endpoints: GET /api/transactions/reversals, GET /api/transactions/reversals/:id
- HTML fragments: GET /api/transactions/html

Tasks
-----
- GET /api/tasks (admin)
- GET /api/tasks/available (user)
- POST /api/tasks (admin)
- PUT /api/tasks/:id (admin)
- DELETE /api/tasks/:id (admin)
- POST /api/tasks/:id/complete (user)
- POST /api/tasks/completions/:id/approve (admin)
- HTML fragments: GET /api/tasks/html, GET /api/tasks/completions/pending/html

Allowances
----------
- POST /api/allowances (admin)
- GET /api/allowances
- PUT /api/allowances/:id
- DELETE /api/allowances/:id
- HTML fragment: GET /api/allowances/html

Advance Requests
----------------
- POST /api/advances (user)
- GET /api/advances (admin or user with filters)
- POST /api/advances/:id/approve (admin)
- POST /api/advances/:id/reject (admin)
- HTML fragment: GET /api/advances/html

Deposits
--------
- POST /api/deposits (user)
- GET /api/deposits (admin)
- POST /api/deposits/:id/accept, /api/deposits/:id/reject (admin)

HTMX HTML Fragments
-------------------
Many admin UI components use HTMX and request pre-rendered HTML fragments. Examples:
- GET /api/admin/overview/html
- GET /api/admin/users/html
- GET /api/tasks/html
- GET /api/transactions/html
- GET /api/allowances/html
- GET /api/advances/html

Error handling and validation
-----------------------------
- Endpoints validate input server-side via `express-validator`. Bad requests return 4xx with a JSON error.
- Server errors return 500 with a generic message and are logged.

Database Notes
--------------
- `refresh_tokens` table stores hashed refresh tokens (sha256) and expiry. Rotation: new token stored, old token deleted.
- `pin_audit` table records PIN creation/changes with actor (performed_by) and details.

Examples
--------
Login (password):
POST /auth/login
Body: {"username":"admin","password":"secret"}
Response: { success: true, data: { token: "<jwt>", role: "admin" } }

Refresh tokens:
POST /auth/refresh (cookie `refresh` sent automatically by browser) -> returns new access token and sets new `refresh` cookie.

PIN login (first-time setup):
POST /auth/pin-login
Body: {"username":"pinuser","pin":"1234"}
Response: { success: true, data: { token: "<jwt>", pinCreated: true } }

RFID login (script-driven):
POST /auth/rfid-login
Body: {"card_uid":"123456789","pin":"1234"}
Response: { success: true, data: { token: "<jwt>" } }

Notes / Security
----------------
- Refresh tokens are stored hashed in DB. The raw token is only sent once to the client (as a cookie).
- Ensure HTTPS in production; cookies use `sameSite: 'lax'` and `httpOnly` flags.
- All balance updates are wrapped in DB transactions to ensure atomicity.

If you want, I can:
- Add an OpenAPI (Swagger) spec for these endpoints, or
- Generate a small Postman collection for quick testing.

---
Document maintained by: Bankly dev team (auto-updated Feb 7, 2026)
