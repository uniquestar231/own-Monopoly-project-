MONOPOLY ONLINE — SETUP

This converts the supplied Monopoly board into a shared-room web app.
The Node.js server runs the original JavaScript rules in a private jsdom instance for each room. Browsers send actions and receive shared snapshots over WebSockets. A host browser does NOT need to stay open to run the engine, although disconnected players still block their own turns.

LOCAL TEST (Node.js 22+)
1. Extract all files into one folder.
2. Open a terminal in that folder.
3. Run: npm install
4. Run: npm start
5. Open http://localhost:3000
6. Enter your name. Copy the room link from the lobby.
7. For a second local player, open the room link in a different browser or private browser session. Two regular tabs share a browser token and therefore represent the SAME player.
8. The host starts when 2–6 players have joined.

GET A PUBLIC LINK WITH RENDER
1. Create a GitHub repository and upload the EXTRACTED files (not the ZIP).
2. In Render, choose New > Web Service and connect that repository.
3. Language/runtime: Node.
4. Build command: npm install
5. Start command: npm start
6. Use ONE server instance. Do not enable multiple instances/workers: rooms are in process memory.
7. Deploy. Open the public HTTPS URL provided by Render.
8. Enter your name, send friends the full room link shown in the lobby, and start once they join.
The included render.yaml supplies equivalent basic service configuration.
Render deployment instructions: https://render.com/docs/deploy-node-express-app
WebSockets: https://render.com/docs/websocket

GAMEPLAY
All players see the same board and shared dialogs. Only the current actor can use controls. Auctions switch the actor to the next bidder. Trade acceptance switches the actor to the receiving player. Property inspection is currently limited to the active player so shared dialogs do not conflict.
Existing movement, rent, buildings, mortgages, cards, jail, and bankruptcy rules are retained, including the simplified house rules from the original. Click your own properties to manage them. Selling and mortgaging can resolve a negative balance.

RECONNECTING
Refresh in the same browser to rejoin your player automatically. Do not clear browser storage. The player session token is stored locally, not placed in the room link. Anyone with the room link can join an available lobby seat. No passwords, accounts, spectator seats, or moderation controls.

LIMITATIONS / HONEST TEST STATUS
JavaScript syntax checks passed for server and browser scripts. Dependencies could not be downloaded here, so end-to-end multiplayer behavior has NOT been run or browser-tested. Treat this as a playable implementation candidate to test before a game night, not a production-audited service.
Rooms are memory-only. Restarting, redeploying, or losing the server process erases active games. No durable saves or database. Rejoining works only while the process and room still exist. Disconnected players cannot be skipped; there are no bots or lobby kick controls. An abandoned seat can block the game. Inactive disconnected rooms expire after 24 hours.
The original simplified card decks, unlimited buildings, and mortgage/bankruptcy house rules remain. There is no security audit, account system, or abuse protection suitable for a public competitive site. Use for private games with friends. A public deployment incurs whatever hosting costs your provider specifies.
