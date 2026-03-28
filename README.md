# Skorbord

Simple scoreboard web app built with Node.js, Express, vanilla HTML/CSS/JavaScript, and a lightweight JSON file for storage.

## Features

- Public scoreboard sorted by points
- Clickable player names with a page showing accepted request history
- Code-based user lookup with no login flow
- User point requests with optional reason
- Quest system with admin-created tasks and user submissions for approval
- Admin dashboard for approving or rejecting requests
- Admin tools for creating users and manually adding points by user name
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
│       └── scoreboardService.js
└── README.md
```

## How to run locally

1. Open a terminal in the project folder:

   ```bash
   cd /home/dinozaver/skorbord
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the server:

   ```bash
   npm start
   ```

4. Open the app in your browser:

- `http://localhost:3000/` for the public scoreboard
- `http://localhost:3000/user` for the user page
- `http://localhost:3000/admin` for the admin dashboard
- `http://localhost:3000/player?code=ALEX01` for a player's accepted-request log

## API endpoints

- `GET /api/users` - get all users sorted by points
- `GET /api/users/:code` - get a single user by code
- `GET /api/users/:code/approved-requests` - get a user plus their approved request history
- `GET /api/quests` - get all active quests
- `POST /api/users` - create a user with a unique `name` and unique `code`
- `POST /api/quests` - create a quest with `{ "title": "Tedenski izziv", "rewardPoints": 5, "steps": ["Korak 1"] }`
- `POST /api/requests` - submit a point request with `code`, `points`, and optional `reason`
- `POST /api/quest-requests` - submit a completed quest with `{ "code": "ALEX01", "questId": 1, "completedSteps": ["Korak 1"] }`
- `GET /api/requests/pending` - get pending requests
- `POST /api/meetings` - record a meeting with `{ "presentCodes": ["ALEX01"], "note": "Weekly sync" }`
- `POST /api/requests/:id/approve` - approve a request
- `POST /api/requests/:id/reject` - reject a request
- `POST /api/users/:code/points` - manually add points by code with `{ "points": 5 }`
- `POST /api/users/by-name/points` - manually add points by exact user name with `{ "name": "Alex", "points": 5, "reason": "Won bonus round" }`

## Notes

- Data is stored in `server/data/db.json`.
- Codes are normalized to uppercase.
- Names must be unique and are checked case-insensitively when creating users.
- Manual admin point assignment matches user names case-insensitively, but names must still be unique for that action.
- Manual admin point assignment can include an optional reason and is saved into the approved request log.
- Meeting attendance starts at `0` for new and existing users and increases when the admin records a meeting.
- Questi imajo od 1 do 10 korakov, uporabnik pa lahko isti quest odda le enkrat, če je že v čakanju ali odobren.
- Points must be positive whole numbers.
