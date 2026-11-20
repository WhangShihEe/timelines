# Timelines: live room pulse

Jackbox-style audience tracker for the CAISH timelines social. One page, two views.

- Big screen: open `index.html?host`
- Phones: scan the QR code on the big screen (or open the page and type the room code)

## Running the night

| Key | What it does |
| --- | --- |
| → / Space | Next round |
| ← | Previous round |
| 1 / 2 | Flag "Sceptic" / "Pro" speaker on the live line |
| M | Drop a generic marker |
| Q | Big QR overlay for latecomers |
| X | Turn audience messages on or off |
| F | Fullscreen |
| B | Add 8 fake audience members (rehearsal) |

Rounds: lobby, opening forecast, three debates, final forecast, summary.
"New room" in the control bar starts a fresh room code and clears the screen.

## Editing

Wording, rounds and the Firebase config live in `src/config.js`.
After changing anything in `src/`, rebuild the single page:

    npm install
    npm run build

`index.html` is the built file that gets served. Do not edit it by hand.

## Backend

Firebase Realtime Database, project `caish-social`. Rules allow read and write
under `rooms/` only. After the event, set both to `false` in the console.
Free plan limit: 100 simultaneous connections.
