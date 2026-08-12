# TRON Launchpad

A production-focused TRC20 token deployer built with Next.js, TronLink, Solidity, and IPFS.

## What it does

- connects to TronLink and detects the active TRON network without guessing a fallback chain
- compiles the contract artifact directly from `contracts/TRC20Token.sol`
- validates token inputs before deployment and blocks duplicate in-flight deploy attempts
- uploads token logos to IPFS through Pinata with server-side JWT usage only
- optionally submits token metadata to the configured Meta API after deployment

## Project structure

- `app/page.tsx` — launchpad UI and deployment flow
- `app/api/token-artifact/route.ts` — compiles Solidity source into ABI + bytecode
- `app/api/upload-logo/route.ts` — validates and uploads token logos to IPFS
- `app/api/submit-token-meta/route.ts` — forwards token metadata to an external registry
- `contracts/TRC20Token.sol` — token contract source
- `app/utils/` — network and upload helpers
- `lib/upload-multipart.js` — raw multipart parser used to avoid Unicode filename ByteString failures
- `tests/upload-regression.test.mjs` — upload regression tests for Unicode filenames and magic bytes

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
- `MAX_UPLOAD_SIZE_MB`
- `UPLOAD_TIMEOUT_MS`

## Local development

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Deployment flow

1. connect TronLink
2. detect the active TRON network
3. validate wallet, token data, and recommended TRX balance
4. optionally upload a logo to IPFS
5. create the metadata payload
6. fetch the contract artifact from source
7. request TronLink confirmation
8. review the contract address, transaction ID, metadata result, and explorer links

## Upload regression checks

```bash
npm run test:upload
```

This regression suite exercises the Unicode multipart parsing path without calling `request.formData()`.

## Notes

- the deploy flow uses the contract source in `contracts/TRC20Token.sol`, not a manually pasted bytecode blob
- the client now always rewrites logo upload filenames to ASCII-safe values such as `logo.png` before sending `FormData`
- the server now parses multipart bodies from raw bytes so Unicode filenames do not fail before sanitization
- logo uploads reject unsupported MIME types, oversized files, invalid magic bytes, and cross-origin requests
- metadata submission is explicit; deployment success and metadata submission success are reported separately
- `npm run build`, live Browser testing, and live TronLink deployment still need to be verified in a runtime with TronLink and valid server environment variables
