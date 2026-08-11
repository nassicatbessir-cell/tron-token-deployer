# TRON Launchpad

A production-focused TRC20 token deployer built with Next.js, TronLink, Solidity, and IPFS.

## What it does

- connects to TronLink and detects the active TRON network
- compiles the contract artifact directly from `contracts/TRC20Token.sol`
- deploys a TRC20 token from the browser through TronLink confirmation
- uploads token logos to IPFS through Pinata
- optionally submits token metadata to the configured Meta API

## Project structure

- `app/page.tsx` — launchpad UI and deployment flow
- `app/api/token-artifact/route.ts` — compiles Solidity source into ABI + bytecode
- `app/api/upload-logo/route.ts` — validates and uploads token logos to IPFS
- `app/api/submit-token-meta/route.ts` — forwards token metadata to an external registry
- `contracts/TRC20Token.sol` — token contract source
- `app/utils/` — network and upload helpers

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values you need.

```bash
cp .env.example .env.local
```

Required for logo uploads:

- `PINATA_JWT`

Optional for metadata submission:

- `META_API_URL`
- `META_API_KEY`

Optional app configuration:

- `TRON_RPC_URL`
- `NEXT_PUBLIC_APP_ENV`
- `NEXT_PUBLIC_SUPPORTED_NETWORKS`
- `NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB`

## Local development

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Deployment flow

1. connect TronLink
2. enter token name, symbol, and initial supply
3. optionally upload a logo
4. deploy the token from the active TRON wallet
5. review the contract address and explorer link

## Notes

- the deploy flow uses the contract source in `contracts/TRC20Token.sol`, not a manually pasted bytecode blob
- logo uploads are validated for image type and file size before reaching Pinata
- if the metadata API is not configured, token deployment still succeeds and the UI reports that metadata submission was skipped
