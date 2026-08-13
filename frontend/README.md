# LicenseLogic Frontend

Next.js dApp wired to the LicenseLogic Intelligent Contract on the GenLayer Studionet.

## Local dev

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | Deployed LicenseLogic contract address | `0x8372967d074C066EC2006782171d39E18eB5a46f` |
| `NEXT_PUBLIC_NETWORK_LABEL` | Label shown in header | `Studionet` |
| `NEXT_PUBLIC_EXPLORER_BASE` | Explorer link prefix | `https://studio.genlayer.com/contracts` |

The client falls back to the hardcoded studionet address if no env is set — the app still renders and reads contract state without any `.env` file.

## Deploy to Vercel

1. `vercel login`
2. From `frontend/`, run `vercel --prod` (or import the repo through the Vercel dashboard, root directory `frontend`).
3. Set the three env vars above under Project → Settings → Environment Variables (Production + Preview).
4. Redeploy so the new envs get baked into the build.

If the previous URL 404s, the project was removed — create a new one.
