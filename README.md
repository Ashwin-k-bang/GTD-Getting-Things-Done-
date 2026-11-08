# GTD Dashboard

A personal task and reference manager based on *Getting Things Done*. Plain HTML, CSS and JavaScript: no build step, works offline, installable on your phone, optional sync between devices through a JSON file in your GitHub repo.

## Files
| File | Purpose |
|---|---|
| `index.html` | Dashboard: category bar, Overdue strip, deadline tabs, custom tab builder, settings |
| `category.html` | Category page (`?c=<id>`): Tasks and Remember |
| `core.js` | Storage (IndexedDB), GitHub sync, date helpers, tab-rule logic, shared UI |
| `style.css` | Mobile-first styles, light/dark following the device |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Offline use and install-to-home-screen |

## Deploy on GitHub Pages
1. Create a repo (e.g. `gtd-dashboard`) and upload all files in this folder to its root.
2. Settings → Pages → deploy from the `main` branch, root.
3. Open `https://<you>.github.io/gtd-dashboard/` on your phone and use "Add to Home Screen".

(You can also try it locally: `python3 -m http.server` in this folder, then open `http://localhost:8000`.)

## Sync between devices (optional)
1. GitHub → Settings → Developer settings → Fine-grained tokens → create a token limited to your repo with **Contents: Read and write**.
2. In the app, tap ⚙ and enter `owner/repo`, branch (default `main`), file path (default `data/gtd.json`) and the token, then **Save & sync**. Do the same on each device.
3. The app syncs on open, when you return to it, and a few seconds after each change. Every record carries an updated timestamp and deletions are stored as markers, so the newest edit wins.

Notes: the token is kept only in that browser's local storage. Use a private repo, since the data file contains your tasks. Without sync, data stays on the device.

## Behaviour
- "Today" is the device's local date; views refresh at midnight.
- "This week" runs from today to the end of the week (Sunday or Saturday, set in ⚙).
- Tasks with no deadline appear only on their category page, or in a "No deadline" tab if you add one.
- Time can be typed as `45`, `45m`, `1h`, `1h 30m`.

## Later additions (not in this version)
Inbox, Weekly Review, recurring tasks, Next action highlight, contexts, search, reminders.
