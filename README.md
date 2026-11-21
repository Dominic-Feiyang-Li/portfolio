# Portfolio

[简体中文](README.zh-CN.md)

A self-hosted investment ledger for stocks, ETFs, crypto and cash. Track holdings, record trades and swaps, and review valuations across accounts. Built with Next.js, React, TypeScript and SQLite. Supabase Postgres is available for cloud deployments.

## Run locally

Install Node.js 24 and npm. From the project directory:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:3000>. The app listens on the loopback address and starts with an empty ledger. Local mode stores data in `data/portfolio.sqlite` and does not need an account by default. To run a local production build, use `npm run build` followed by `npm start`.

## First steps

1. Click **+** to add an asset and create its account. Enter the symbol, units, currency and average cost. Leave average cost blank if it is unknown.
2. Select automatic quotes for supported symbols or enter the price manually. **⋯ → Refresh prices** requests an update. Check the quote timestamp on a holding before using its valuation.
3. Open **⋯ → Trade history → Record trade** to log a buy, sell or crypto swap. Enter the execution time, units, price and fee. For a buy or sell, choose whether to update the account's cash balance in the same currency.
4. Open a holding to see quantity, cost, quote time, daily and unrealized P&L, and recent executions. **Trade history** shows the ledger's recorded trades and can switch to all activity.

Trades are bookkeeping entries. The app fetches market quotes from external data providers and does not connect to brokerage or exchange accounts or place orders. Quotes can be delayed. Missing inputs display as unavailable. The chart tracks balance, which can change after a deposit or withdrawal. Daily price P&L starts at midnight Beijing time and excludes fees and FX movements. Unrealized trade P&L compares the recorded price with average cost.

## Deploy your own copy

Cloud hosting is optional. Sign up for your own [Vercel](https://vercel.com/signup) and [Supabase](https://supabase.com/dashboard/sign-up) accounts and import a copy of this code from your own GitHub account. Create the app and database under your own accounts and use your own credentials.

1. Create a fresh Supabase project. In its SQL Editor, apply these files, one at a time, in this order:
   - `supabase/migrations/20260930_portfolio.sql`
   - `supabase/migrations/20261031_multi_user.sql`
   - `supabase/migrations/20261031_fixed_valuations.sql`
2. Import your repository into Vercel as a Next.js project and select Node.js 24. Decide on the production HTTPS URL before deploying.
3. Add the following production environment variables. Keep credentials out of Git and do not give them a `NEXT_PUBLIC_` prefix.

   | Variable | Value |
   | --- | --- |
   | `PORTFOLIO_STORAGE` | `supabase` |
   | `SUPABASE_URL` | Your Supabase project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Your project's server-side service-role key |
   | `PORTFOLIO_ORIGIN` | Exact production origin, such as `https://your-app.vercel.app`, without a path |
   | `PORTFOLIO_SESSION_SECRET` | Unique random secret, at least 32 characters |
   | `CRON_SECRET` | Separate random secret of at least 32 characters for scheduled valuations |

   Generate each secret independently with `openssl rand -hex 32`.

4. Create the first account. Copy `.env.example` to a private `.env.local`, set the cloud storage variables for your new database, and place the following array in a private JSON file outside the repository. Replace both example values.

   ```json
   [{"username":"my_account","password":"replace-with-a-unique-strong-password"}]
   ```

   ```sh
   PORTFOLIO_USERS_FILE=/absolute/path/to/users.private.json \
     node --env-file=.env.local --import tsx scripts/create-users.ts
   ```

   The script skips existing accounts. Remove the provisioning file once the password is stored in your password manager. Cloud deployments require sign-in, and each account has its own ledger. To use sign-in with local SQLite, set `PORTFOLIO_AUTH_ENABLED=1` and a session secret in `.env.local`, then run the same account script without the cloud variables.

5. Deploy, sign in and confirm the ledger starts empty. In a separate signed-out window, check that `/api/portfolio` returns HTTP 401. The scheduled job in `vercel.json` requests a daily valuation for midnight Beijing time.

To move an existing local ledger, export a full JSON backup before switching modes, then import it while signed into the intended account. Import replaces that account's ledger. SQLite and Supabase do not sync automatically.

## Optional AI and data handling

Set the server-side `DEEPSEEK_API_KEY` to enable **⋯ → AI Assistant**. `DEEPSEEK_MODEL` defaults to `deepseek-flash`. Messages and selected ledger context are sent to DeepSeek when you use the assistant. If you enable bookkeeping for the request, the assistant can write to your ledger. Leave the key unset to keep this integration disabled.

Keep your database, backups, screenshots, user provisioning files and environment files private. **⋯ → Backup & export** can export a full JSON backup or holdings CSV. Exports may contain sensitive financial information. Store them outside source control and use separate databases and secrets for each deployment.

## Development

```sh
npm run typecheck
npm test
npm run build
```

Use `PORTFOLIO_DATA_DIR` to point local testing to a separate directory.
