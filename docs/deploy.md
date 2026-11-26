# Deploying Team Dice Race

The code is at github.com/peequeue/team-dice-race and the site will be at https://peequeue.github.io/team-dice-race/. A one-click workflow does the server setup, so there are only a few things to do by hand.

## 1. Create the Supabase project (done)

Region Sydney. Under **Data access**: Data API off, automatic API access off, automatic RLS on.

## 2. Give GitHub two secrets

1. In Supabase: click your avatar (top right) > **Account preferences > Access Tokens > Generate new token**. Name it `github`, copy it.
2. On GitHub: repo **Settings > Secrets and variables > Actions > Secrets > New repository secret**, twice:
   - `SUPABASE_ACCESS_TOKEN` = that token
   - `ADMIN_BOOTSTRAP_TOKEN` = a 40-character random password from your password manager (your setup token; keep it)
3. **Settings > Pages**: set **Source** to **GitHub Actions**.
4. Tell Claude your **project ref** (the random string in your Supabase dashboard address). It isn't secret. Claude commits it to `supabase/project-ref`, which runs **Set up Supabase** and republishes the site.

**Set up Supabase** creates the tables, the hourly 4pm job (with its own random secret, stored in both places), the function settings and the three functions. The site build fills in `web/config.js` with the project's public key. Both can be run again safely from the **Actions** tab.

## 3. Become the host

1. Open https://peequeue.github.io/team-dice-race/admin.html
2. Paste your setup token and click **Create host link**. **Bookmark the link it shows.** It only appears once. Anyone with this link is the host.

## 4. Set up the season

On the host page:
1. **Would You Rather:** your 1:1 questions, one per line: `question | option A | option B | a or b` (the last part is the boss's answer). About 15 covers the season.
2. **New season:** name, first game day, **90** squares, the eight nicknames and each player's avatar. **Create season**.
3. **Copy all eight player links straight away** and DM each person theirs. Links are only shown once. If one goes missing, use **New link** in the players table.
4. Press **Start season**.

Before 4pm each weekday, players open their link and lock in. At 4pm the server rolls for everyone. The first person to open the page after 4pm triggers the reveal straight away; otherwise the hourly job does it within the hour.

## Day to day

- **After Christmas Eve, or on public holidays:** press **Pause** (or **End season**). Unpause when you're back. Paused days are skipped and nobody loses their streak.
- **Lost or leaked link:** **New link** for that player. The old one stops working.
- **Something looks stuck after 4pm:** press **Resolve due days now**.
- **End of season:** awards appear on the host page automatically. Press **Publish to players** when you're ready.

## Trying it without deploying

Open `web/index.html#demo` from the published site (or the demo link Claude shared). It runs the real rules in your browser against seven bots, with a Skip to 4pm button.
