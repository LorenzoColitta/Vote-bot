```markdown
# Vote-bot (TypeScript Discord voting bot)

This repo contains a Discord voting bot that supports multiple voting systems, timed elections, anonymous votes (HMAC), interactive buttons and final result summaries including majority/minority/abstain breakdown.

Quick start
1. Copy .env.example to .env and set DISCORD_TOKEN, CLIENT_ID and VOTE_SECRET.
2. npm install
3. npm run build
4. npm start (or npm run dev for development)

Slash commands
- /create-election: create a candidate election (posts an embed with buttons)
- /create-proposition: create a proposition (Yes/No/Abstain default)
- /vote: cast your vote via slash if you prefer
- /results: show live or final results
- /end-vote: admin force-end (also provided as a button on the message for admins)

Privacy model
- Votes are saved to SQLite using a voterHash (HMAC of electionId:userId with VOTE_SECRET)
- The raw user id is never stored. The HMAC prevents casual database correlation.
- Keep VOTE_SECRET private. If someone has DB + VOTE_SECRET they can correlate hashes back to voters.

Notes & limitations
- STV is implemented as single-winner STV (IRV-like). Full multi-seat STV requires a more complete algorithm.
- Weighted votes compute voter weight at vote time from roleWeights on the Election object.
```