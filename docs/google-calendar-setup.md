# Connecting TimeBlock to Google Calendar

A one-time setup, about 10 minutes. You create a small private "app" in Google
Cloud that only you can use, give TimeBlock its ID and secret, and click
Connect. Nothing is published and nothing costs money.

**What TimeBlock will be allowed to do:** read your calendars (to plan around
meetings) and write events — but it only ever writes into its own calendar,
**TimeBlock — Focus**, which it creates on the first commit. Every event it
creates is tagged, and only tagged events are ever changed or deleted.

> Menu names below match the Google Cloud Console as of September 2026
> ("Google Auth platform"). If Google renames something, the order of steps
> stays the same.

---

## Before you start

- The Google account whose calendar you want to plan (e.g. `you@gmail.com`).
- TimeBlock installed: `npm install` has been run in the project folder.
- The app's address. By default it is `http://localhost:4321`, so the
  redirect URI you will paste in step 4 is exactly:

  ```
  http://localhost:4321/api/google/callback
  ```

---

## Step 1 — Create a Google Cloud project

1. Open <https://console.cloud.google.com/> and sign in with the Google account
   you want to plan with.
2. Click the project picker at the top of the page → **New project**.
3. Name it `TimeBlock` (any name works), leave the organisation as is, click
   **Create**.
4. Make sure the new project is selected in the project picker before continuing.

## Step 2 — Enable the Google Calendar API

1. Open **Menu ☰ → APIs & Services → Library**.
2. Search for **Google Calendar API**, open it, click **Enable**.

## Step 3 — Set up the consent screen (Google Auth platform)

1. Open **Menu ☰ → Google Auth platform → Branding**. If you see
   **Get started**, click it.
2. **App information:** App name `TimeBlock`; *User support email* — your own
   address. **Next**.
3. **Audience:** choose **External**. **Next**.
   (Internal is only offered for Google Workspace organisations.)
4. **Contact information:** your address. **Next**.
5. **Finish:** tick *I agree to the Google API Services: User Data Policy*,
   **Continue**, then **Create**.
6. **Add yourself as a test user:** **Audience → Test users → Add users**, enter
   the Google account you will connect, **Save**. While the app is in *Testing*,
   only listed test users can connect.
7. **Scopes:** **Data Access → Add or Remove Scopes**, add
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/userinfo.email`

   then **Update** and **Save**. (TimeBlock asks for these at connect time
   anyway; listing them here makes the consent screen match.)

## Step 4 — Create the OAuth client

1. Open **Menu ☰ → Google Auth platform → Clients → Create client**.
2. **Application type:** **Web application**. Name: `TimeBlock local`.
3. Leave **Authorized JavaScript origins** empty — TimeBlock does not need it.
   Scroll **past** it to the second section, **Authorized redirect URIs**, click
   its **Add URI** and paste exactly:
   `http://localhost:4321/api/google/callback`
   — no trailing slash, `http` not `https`.
4. Click **Create**.
5. **Copy the Client ID and Client secret now** (or click **Download JSON**).
   Newer projects show the secret only once; if you lose it, open the client
   and use **Add secret** to create a new one.

## Step 5 — Give TimeBlock the client

1. In the project folder, copy `.env.local.example` to `.env.local`.
2. Fill in the two values:

   ```ini
   GOOGLE_CLIENT_ID=1234567890-abc123.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   TIMEBLOCK_BASE_URL=http://localhost:4321
   ```

3. **Restart TimeBlock** — `.env.local` is only read when the server starts, so a
   server that was already running keeps acting as if there were no client
   (Settings keeps showing the setup steps instead of **Connect Google**):

   ```powershell
   .\scripts\start-timeblock.ps1 -Restart
   ```

   (If you run `npm run dev` instead, stop it with Ctrl+C and start it again.)

`.env.local` is git-ignored. Never commit it.

## Step 6 — Connect

1. Open <http://localhost:4321/settings>. The Google card now shows
   **Connect Google**.
2. Click it and choose your account.
3. Google shows **"Google hasn't verified this app"** — expected for a private
   app in Testing. Click **Continue** (you are the developer and the only user).
4. **Tick the calendar checkbox.** Google lists what TimeBlock asks for as
   separate checkboxes, and calendar access is **not** pre-ticked. Tick
   *"See, edit, share, and permanently delete all the calendars you can access
   using Google Calendar"* (or **Select all**), then **Continue**. Signing in
   without it still "works" on Google's side, so TimeBlock checks: if the box
   was left unticked, it keeps nothing and asks you to connect again.
5. You land back on Settings with **Google account connected** and your
   address shown.

The refresh token is stored in `%LOCALAPPDATA%\timeblock\credentials.json` —
outside the project, so it can never end up in git or a copied folder.

## Step 7 — Check it works

1. Open **Calendar → Today**. Your real meetings for the day appear in their Google colours,
   and learning/work blocks are planned around them with the 15-minute breaks.
2. Click **Generate the day**, then **Commit … to Google**.
3. In Google Calendar a new calendar **TimeBlock — Focus** appears in the left
   sidebar, holding today's blocks. Combined blocks are titled
   "First task +2"; open one to see every task, its minutes and the goal it
   serves.
4. Click **Re-plan the day** and commit again: the old blocks are replaced, your
   meetings are untouched.

---

## Troubleshooting

| What you see | Why | Fix |
|---|---|---|
| While creating the client: *Invalid Origin: URIs must not contain a path or end with "/"* | The callback URL was pasted into **Authorized JavaScript origins** (both sections have a field called "URIs 1"). | Delete it there and leave that section empty; add it under **Authorized redirect URIs** instead (step 4.3). |
| *Could not read the calendar: Request had insufficient authentication scopes* (or Settings: "Signed in, but without calendar access") | The Google Calendar checkbox was left unticked on the consent screen, so the grant only covers your email address. | **Settings → Reconnect**, and tick the calendar box (step 6.4). |
| Settings: *Google refused the sign-in code — it was already used or had expired* (`invalid_grant`) | The one-time code from Google's redirect was exchanged twice (the callback page was reloaded) or too late. | Click **Connect Google** again and go through the consent screen without reloading. If it keeps happening, check `%LOCALAPPDATA%\timeblock\logs\server.err.log`. |
| Settings: *Connecting failed while exchanging Google's sign-in code (…)* | Anything else that went wrong while turning the code into a token. | The reason in brackets names it; the full message is in `%LOCALAPPDATA%\timeblock\logs\server.err.log`. |
| Settings: *Could not verify Google's security certificate (UNABLE_TO_VERIFY_LEAF_SIGNATURE)* | An antivirus with HTTPS scanning (e.g. Avast Web/Mail Shield) or a company proxy re-signs HTTPS with its own root certificate. Browsers trust it via the Windows certificate store; older TimeBlock versions did not. | Update and run `start-timeblock.ps1 -Restart` — TimeBlock trusts the Windows store since v0.2.1 (the server log shows `[tls] trusting N certificate(s)`). If it persists, exclude `node.exe` from the antivirus's HTTPS scanning. Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`. |
| `Error 400: redirect_uri_mismatch` | The URI in the client does not match exactly. | Step 4.3 — `http://localhost:4321/api/google/callback`, no trailing slash. If you run on another port, change both the client and `TIMEBLOCK_BASE_URL`. |
| `Error 403: access_denied` / "has not completed the Google verification process" | Your account is not a test user. | Step 3.6 — add it under **Audience → Test users**. |
| "Google hasn't verified this app" | Normal for a private app in Testing. | Click **Continue**. |
| Settings says *Add GOOGLE_CLIENT_ID…* | `.env.local` missing, misspelt, or the app was not restarted. | Step 5, then restart. |
| *Google did not return a refresh token* | Google remembered an earlier grant and skipped consent. | Remove TimeBlock at <https://myaccount.google.com/permissions>, then **Reconnect**. |
| Works for a week, then *Could not read the calendar: invalid_grant* | While the app is in **Testing**, Google expires refresh tokens after 7 days. | **Reconnect** in Settings. To stop the weekly expiry: **Audience → Publish app**. For a private single-user app with no public listing Google does not require verification to keep working; you will still see the "unverified" warning when connecting. |
| *Google Calendar API has not been used in project…* | The API is not enabled in this project. | Step 2 — make sure the right project is selected. |

## Disconnecting

- **Settings → Disconnect** deletes the local token. TimeBlock stops reading and
  writing immediately.
- To revoke the grant on Google's side as well, remove TimeBlock at
  <https://myaccount.google.com/permissions>.
- The **TimeBlock — Focus** calendar stays in Google until you delete it
  yourself (Google Calendar → the calendar's ⋮ menu → *Settings and sharing* →
  *Remove calendar*).
