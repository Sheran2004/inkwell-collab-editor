# Inkwell | Collaborative document editor

Inkwell is a responsive rich-text document editor with account-based authentication, private document libraries, autosaving, live editing across multiple tabs signed in to the same account, and dark/light mode. It uses React + Vite, Express, Socket.IO, and PostgreSQL.

## Features
- Email/password sign-up and sign-in. Passwords are salted and hashed with Node.js `scrypt`; session tokens are signed and stored in HttpOnly cookies.
- Private document library: only the signed-in owner can list, open, rename, edit, or delete their documents. Owners can create a revocable share link so another signed-in user can collaborate on a specific document.
- Rich text editor with headings, bold/italic/underline, lists, alignment, colors, links, quotes, and code blocks.
- Live changes between connected sessions that have access to the same account's document, live viewer count, and automatic saves.
- Responsive UI, dark/light mode, clear errors, and session logout.
- PostgreSQL schema is created automatically at startup.

> **Collaboration note:** this version protects documents by account ownership. Share links are bearer links: anyone who receives one can edit that document after signing in. Keep links private and revoke them by deleting the share token through the API if needed.

## Run locally (Windows PowerShell or terminal)

Requirements: Node.js 18+ and a PostgreSQL database. A managed database such as Neon works well.

1. Create `server/.env` by copying `server/.env.example`, then set `DATABASE_URL` to your PostgreSQL connection string and `AUTH_SECRET` to a unique random value. Do not commit `.env`. Generate a secret with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
2. Install dependencies and start the API in terminal 1:
   ```bash
   cd server
   npm install
   npm start
   ```
3. In terminal 2, start the Vite client:
   ```bash
   cd client
   npm install
   npm run dev
   ```
4. Open the local URL printed by Vite, usually `http://localhost:5173`. Create an account, create a document, then open the same document in another tab signed in to the same account to test live updates.

The development client proxies `/api` and `/socket.io` to `http://localhost:4000`.

## Deploy to Render (single-origin setup)

1. Push this project to a GitHub repository. Do not upload `server/.env` or secrets.
2. Create a PostgreSQL database with Neon (or another provider) and copy its connection string.
3. In Render, create a Web Service from the repository. The included `render.yaml` defines the build/start commands. If configuring manually, use:
   - Build: `npm install --prefix server && npm install --prefix client && npm run build --prefix client`
   - Start: `npm start --prefix server`
4. Add environment variables in Render: `DATABASE_URL` (your real database URL), `AUTH_SECRET` (random secret of at least 32 characters), and `NODE_ENV=production`. Render can generate `AUTH_SECRET` if you use the Blueprint.
5. Deploy. The Express server serves the built frontend and API on the same domain, so session cookies and Socket.IO work without cross-domain cookie settings. Test sign-up, sign-in, create/edit/refresh/delete, share-link collaboration from a second account, sign-out, and the health endpoint (`/api/health`).

## Security and operations
- Never put database credentials or `AUTH_SECRET` in frontend variables or commit them to GitHub.
- Configure database backups and usage alerts with your database provider.
- For production use, add email verification, password reset, rate limiting, and explicit per-document collaborator invitations before opening public sign-up at scale.
- Existing documents from an older database with no `user_id` are intentionally not exposed to new accounts. Back up and assign them to the correct owner manually if needed.
