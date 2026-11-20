# Mini Pucks

Arcade ice hockey for phones and computers: the hockey twin of Mini Strikers and Mini Dunkers, a
separate game with its own link, its own accounts and its own app. Pick one of the top 20 countries
when you sign up, play the bots (quick match, the cup, training, PRO MATCH, Club Career, the shootout
and Top Shelf, skill challenges) or play real people online. Every online win is 3 league points for
your country.

## Running it

Needs Node 24. No install step.

```bash
node server.js 8470
```

Then open <http://localhost:8470>. `server.js` serves the game **and** runs accounts, saving, the
league table and online games. `MS_DATA_FILE` points accounts at a throwaway file for tests.

## How it plays

- **Move** (joystick / WASD), **SPRINT**, **PASS** (hold for a harder pass; a full charge is a saucer
  pass over sticks), **SHOOT** (hold to wind up, let go to shoot; a full wind-up is a slapshot; steer
  as you let go and it bends round the goalie), **SKILL** (dekes: spin-o-rama, toe drag, through the
  legs, a flip; no direction hops a check), **CHECK** (without the puck: go in and take it; a miss
  leaves you behind the play). A full **ULT** is a trick shot in flames: a one-timer, a spin-o-rama, a
  lacrosse goal, one between the legs or a flying slapshot.
- The rink: rounded boards, nets that stand clear of the end boards (you can skate behind them, and a
  goal only counts from in front), blue lines, faceoff circles. Every restart is a faceoff. Games are
  two minutes.
- **PRO MATCH** (2v2 to 4v4): a bigger rink with the real rules (`js/rules.js`): **icing** (shot from
  your own half right across their goal line: faceoff in your end), **tripping** (a check from behind
  that misses the puck, now and then: 15 seconds in the penalty box) and the **power play** (a goal
  lets the player out early), faceoffs on the dots.
- **The shootout and Top Shelf** (`js/penalty.js`, `server/pens.js`): five shots each, then sudden
  death. In the shootout you pick a corner, then save theirs. In Top Shelf you shoot from the point:
  soft and high goes over the blockers, hard goes round them.

## Playing online

- **PLAY ONLINE** queues you for 1v1 to 4v4 (and PRO MATCH). It waits about 12 seconds for real
  players, then fills the empty spots with bots. **CREATE ROOM** makes a code for friends.
- The server runs every online game (the real engine, 120 steps a second) and streams it over a
  WebSocket. Your own player is predicted on your device so the controls answer at once.
- Walking out counts as a loss. If your connection drops you have 20 seconds to come back before a
  bot takes your place.

## Putting it online

It is its own Render web service (`mini-pucks.onrender.com`), built from its own GitHub repo
(`mini-pucks`): Build `npm install`, Start `node server.js`, health check `/api/health`
(`render.yaml` has the same settings).

One thing is typed in by hand in Render's dashboard: **`DATABASE_URL`**, a Postgres connection string
(Neon's free plan works). It is never in the repo. Without it accounts go in `data.json`, which a
free instance wipes whenever it restarts. The table is `pucks_users` (never `strikers_users` or
`dunkers_users`), so it can share a database with the other two games without touching them.

After a deploy, `/api/health` reports `build` (bump `BUILD` in `server.js`) and `storage`.

Gifts from the game's owner are `GIFTS` in `server.js` (the same as Mini Strikers): queued as the server
starts and every five minutes, delivered when that player's game next syncs. `madeBefore` keeps a
gift to the account that had the name by then; `everything` owns every item and every season pass as
it starts, for good. There are none yet.

## The Android app

`app/` builds the signed `.aab` for Google Play: see `PUBLISHING.md`. The app id is
`com.irizarrygames.minipucks`.

## Tools

The node suite (run them all before a deploy):

- `node tools/rulesscan.js`: PRO MATCH: icing, tripping and the penalty box, the power play,
  faceoffs, and whole bot games.
- `node tools/pensscan.js` and `node tools/fkscan.js`: the shootout and Top Shelf: the game and the
  server agree on every number; how often shots go in at three skill levels.
- `node tools/proscan.js`: PRO MATCH online: queues, rooms, faceoffs, against the real server code.
- `node tools/netscan.js [matches]`: fuzzed online games on the server engine, invariant checks.
- `node tools/fuzzscan.js`: every message type with junk in every field: the server never throws.
- `node tools/i18nscan.js`: every line the game shows has a translation in all 11 languages.
- The rest (`authscan`, `socialscan`, `rankedscan`, `cupscan`, `missionscan`, `passscan`,
  `emotescan`, `giftscan`, ...) cover accounts, friends, ranked, cups, missions, the season pass,
  emotes and gifts.
- `tools/uiscan.js`: the browser check of every screen at nine screen sizes.
- `node tools/make-icons.js`: draws the app icons (a flaming puck).
