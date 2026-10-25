# Fighting X

A small browser arena game with five fighters, bot battles, and online friend duels.

**Play:** https://ayman-ala.github.io/fighting-x/

## Play

- **Keyboard:** WASD or arrow keys move. Hold Space to auto-aim and fire. Escape or P pauses a bot match.
- **Touch:** drag the left joystick to move. Hold the red button to auto-aim, or drag it to aim manually. Two simultaneous touches are supported.
- Stay out of the blue goo. The safe arena shrinks over time.
- Choose Easy, Normal, or Hard before a bot match.
- To play a friend, create a room and share its six-character code or invite link. Keep the host’s game open.

## Progress

Wins award 20 coins and up to 10 trophies. Trophies cap at 500; **crates continue every five lifetime wins**. Crates guarantee an unowned fighter until the roster is complete, then award 100 coins. Each upgrade adds 25% health and damage in bot matches. Upgrade prices range from 20 to 1,100 coins. Friend duels normalize both players to level 0.

Progress is saved in `localStorage` in the current browser. Settings includes JSON backup export and import, rename, mute, and a confirmed reset. Saves from the original game use the same `fx_save` key and migrate when present on the same origin. Moving from an HTML file, another host, or another browser requires a backup; this edition does not depend on Claude or provide account-based cloud saving.

## Multiplayer

The vendored **PeerJS 1.5.5** client uses the public PeerServer Cloud to discover peers. Gameplay then travels directly over an encrypted WebRTC data channel. There is no game-server subscription or database configuration required.

- The host simulates movement, bullets, collisions, health, and results at a fixed 60 Hz.
- Inputs and snapshots are sent at 20 Hz, separately from drawing.
- Only one guest is admitted; additional guests receive a room-full message.
- A random session token reserves the guest slot during a temporary disconnect. Reconnection preserves the current round and times out after 30 seconds. Reloading or closing the host ends the room; a page reload is not a resumable disconnect.
- Both players must accept a rematch. Friendly matches normalize upgrades.
- Received inputs are normalized and snapshots are validated before use.

The host must keep the game running. Public signaling has no uptime guarantee, and restrictive firewalls, VPNs, or NAT configurations may block direct WebRTC connections. Trying a home connection or mobile data can help. Bot battles do not need signaling. This is a casual friend game: the host and local progress are trusted, so it is not suitable for ranked competitive rewards without an authoritative server.

For a private PeerServer or TURN relay, define `window.FIGHTING_X_NETWORK` before `game.js` loads with the PeerJS connection options. TURN credentials embedded in a static site must be short-lived credentials from your own credential endpoint; never put long-lived secrets in this repository. PeerJS options: https://peerjs.com/docs/

## Run locally

No build or package installation is required. From this directory:

```sh
python3 -m http.server 8080
```

Open http://localhost:8080. Use an HTTP server rather than double-clicking `index.html`, because the game uses JavaScript modules.

## Verify

With Node.js 22 or later:

```sh
node --test tests/*.test.js
```

Tests cover save migration, rewards beyond the trophy cap, guaranteed unlocks, upgrade costs, movement normalization, fair-duel stats, countdown/wall movement, swept collisions, goo damage, all bot difficulties, snapshot validation, room admission, reconnection, and reconnect timeout.

For browser checks, test a bot match, pause/resume, focus loss, phone-size menu scrolling, backup restore, a real two-player room, third-player rejection, and both players accepting a rematch. Networking tests use in-memory peers; actual WebRTC is checked separately in browsers.

## Publish with GitHub Pages

Use **Settings → Pages → Deploy from a branch → main → / (root)**. The entry point is `index.html`; `.nojekyll` keeps the files static. Future commits to `main` publish automatically. All asset paths are relative, including the pinned PeerJS bundle, so project-site URLs work without a build step.

## Files

- `core.js`: pure game simulation, save migration, and progression.
- `game.js`: screens, input, audio, pause, and match coordination.
- `renderer.js`: canvas rendering and the original five fighter illustrations.
- `network.js`: two-player connection, validation, and reconnection.
- `styles.css`: responsive menus, HUD, and motion preferences.
- `vendor/`: PeerJS bundle and its MIT license. See `THIRD_PARTY_NOTICES.md`.

The original game and character designs were supplied by the repository owner. No additional license is granted for those assets by the PeerJS dependency license.
