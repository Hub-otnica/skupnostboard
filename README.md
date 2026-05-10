# Skorbord

Simple scoreboard web app built with Node.js, Express, vanilla HTML/CSS/JavaScript, and a lightweight JSON file for storage.

## Features

- Public scoreboard sorted by points
- Clickable player names with a page showing accepted request history
- User login with public username and password
- Badge-sharing network visualization on the scoreboard (canvas graph by selected badge)
- Admin login with token-based session (username + password)
- User point requests with optional reason
- Quest system with admin-created tasks and user submissions for approval
- Admin dashboard for approving or rejecting requests
- Admin tools for creating users and manually adjusting points by user name
- Meeting attendance tracking with admin-recorded meeting reports
- Basic validation for names, codes, and point values

## Project structure

```text
skorbord/
├── package.json
├── public/
│   ├── admin.html
│   ├── app.js
│   ├── index.html
│   ├── player.html
│   ├── styles.css
│   ├── user.html
│   └── pages/
│       ├── admin.js
│       ├── index.js
│       ├── player.js
│       └── user.js
├── server/
│   ├── app.js
│   ├── data/
│   │   ├── db.json
│   │   └── store.js
│   ├── routes/
│   │   └── api.js
│   └── services/
│       ├── adminAuthService.js
│       ├── scoreboardService.js
│       └── userAuthService.js
└── README.md
```

## How to run locally

1. Open a terminal in the project folder:



2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the server:

   ```bash
   npm start
   (npm.cmd start)
   ```

4. Open the app in your browser:

- `http://localhost:3000/` for the public scoreboard
- `http://localhost:3000/user` for the user page (mentor login required for actions)
- `http://localhost:3000/forum` for the forum
- `http://localhost:3000/admin` for the admin dashboard
- `http://localhost:3000/player?code=ALEX01` for a player's accepted-request log

## Admin login configuration

By default, admin password is set through first-time setup in the `/admin` UI and stored as a hash in `server/data/db.json`.

Optional environment override:

- `ADMIN_USERNAME` (default: `admin`)
- `ADMIN_PASSWORD` (if set, first-time setup UI is skipped and env password is used)

Example:

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=change-me npm start
```

## API endpoints

- `GET /api/users` - get all users sorted by points
- `GET /api/users/:code` - get a single user by code
- `GET /api/users/:code/approved-requests` - get a user plus their approved request history
- `GET /api/quests` - get all active quests
- `GET /api/badges/:id/network` - get graph data (nodes + edges) for one badge-sharing network
- `POST /api/auth/login` - mentor login with `{ "username": "Alex", "password": "..." }`
- `POST /api/auth/change-password` - change password for the logged-in mentor with `{ "currentPassword": "...", "newPassword": "..." }`
- `POST /api/auth/logout` - mentor logout and session cookie revocation
- `GET /api/me` - get the currently logged-in mentor profile
- `GET /api/me/quests` - get quests for the currently logged-in mentor
- `GET /api/me/badge-share-options` - get badge-sharing options for the currently logged-in mentor
- `GET /api/me/incoming-badge-requests` - get incoming badge-share requests for the currently logged-in mentor
- `POST /api/users` - create a user with a unique public `name` and initial password
- `POST /api/quests` - create a quest with `{ "title": "Tedenski izziv", "rewardPoints": 5, "steps": ["Korak 1"] }`
- `POST /api/requests` - submit a point request for the logged-in mentor with `points` and optional `reason`
- `POST /api/quest-requests` - submit a completed quest for the logged-in mentor with `{ "questId": 1, "completedSteps": ["Korak 1"] }`
- `GET /api/requests/pending` - get pending requests
- `POST /api/meetings` - record a meeting with `{ "presentCodes": ["ALEX01"], "note": "Weekly sync" }`
- `POST /api/requests/:id/approve` - approve a request
- `POST /api/requests/:id/reject` - reject a request
- `POST /api/users/by-name/points` - manually adjust points by exact user name with `{ "name": "Alex", "points": -5, "reason": "Correction" }`
- `POST /api/admin/login` - admin login with `{ "username": "admin", "password": "..." }`
- `POST /api/admin/setup` - first-time admin password setup with `{ "username": "admin", "password": "..." }`
- `GET /api/admin/session` - verify current admin token
- `POST /api/admin/logout` - revoke current admin token

Admin-only endpoints require `Authorization: Bearer <token>`.

## Notes

- Data is stored in `server/data/db.json`.
- Codes are normalized to uppercase.
- Names must be unique and are checked case-insensitively when creating users.
- Mentor write-actions now require a session created by `/api/auth/login`; a visible username alone is not accepted as proof of identity.
- New mentor accounts and admin password resets require the mentor to choose a new password at the next login before using protected actions.
- Manual admin point assignment matches user names case-insensitively, but names must still be unique for that action.
- Manual admin point assignment can include an optional reason and is saved into the approved request log.
- Meeting attendance starts at `0` for new and existing users and increases when the admin records a meeting.
- Questi imajo od 1 do 10 korakov, uporabnik pa lahko isti quest odda le enkrat, če je že v čakanju ali odobren.
- Points must be positive whole numbers.

## Run with Docker Compose

Start the app:

```bash
docker compose up
```

For automatic updates while you edit files, run the watch mode in a separate terminal:

```bash
docker compose watch
```

Then open `http://localhost:3000`.

Notes:

- App data stays in `server/data/db.json` on the host.
- Uploaded badge images stay in `public/uploads/badges` on the host.
- The container listens on `0.0.0.0:3000` and is published to host port `3000`.

To stop it:

```bash
docker compose down
```
