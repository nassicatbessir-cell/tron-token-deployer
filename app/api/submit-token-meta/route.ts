import { NextResponse } from "next/server";
import { isValidTronAddress, TronNetwork } from "@/app/utils/tron-network";

interface TokenMetadata {
  contractAddress: string;
  name: string;
  symbol: string;
  description: string;
  decimals: number;
  totalSupply: string;
  totalSupplyBaseUnits?: string;
  logoIpfsHash: string;
  logoCid: string;
  logoUrl: string;
  website: string;
  telegram: string;
  twitter: string;
  chain: "TRON_MAINNET" | "TRON_NILE";
  deployerAddress: string;
  deploymentTxHash?: string;
}

interface MetaResponse {
  success: boolean;
  tokenId?: string;
  message: string;
  submissionId?: string;
  status?: "pending" | "approved" | "rejected";
}

const META_REQUEST_TIMEOUT_MS = 15_000;
const CID_PATTERN = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[1-9A-Za-z]{20,})$/;

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init?.headers,
    },
  });
}

function hasAllowedOrigin(request: Request) {
  const originHeader = request.headers.get("origin");

  if (!originHeader) {
    return true;
  }

  try {
    const requestOrigin = new URL(request.url).origin;
    return new URL(originHeader).origin === requestOrigin;
  } catch {
    return false;
  }
}

async function submitToMetaBridge(
  metadata: TokenMetadata,
  apiKey: string
): Promise<MetaResponse> {
  const metaApiUrl = process.env.META_API_URL || "https://api.meta.global/v1";
  const parsedMetaApiUrl = new URL(metaApiUrl);

  if (parsedMetaApiUrl.protocol !== "https:") {
    throw new Error("META_API_URL must use https.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), META_REQUEST_TIMEOUT_MS);

  try {
    const payload = {
      token: {
        address: metadata.contractAddress,
        name: metadata.name,
        symbol: metadata.symbol,
        description: metadata.description,
        decimals: metadata.decimals,
        totalSupply: metadata.totalSupply,
        totalSupplyBaseUnits: metadata.totalSupplyBaseUnits,
        chain: metadata.chain,
        logoUrl: metadata.logoUrl,
        logoCid: metadata.logoCid,
        deployer: metadata.deployerAddress,
        deploymentHash: metadata.deploymentTxHash,
        website: metadata.website,
        telegram: metadata.telegram,
        twitter: metadata.twitter,
      },
      timestamp: new Date().toISOString(),
      source: "tron-token-deployer",
    };

    const response = await fetch(`${parsedMetaApiUrl.toString().replace(/\/$/, "")}/tokens/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        success: false,
        message: data?.message || "Failed to submit token metadata",
      };
    }

    return {
      success: true,
      tokenId: data?.tokenId,
      submissionId: data?.submissionId,
      status: data?.status || "pending",
      message: data?.message || "Token metadata submitted successfully.",
    };
  } catch (error: any) {
    return {
      success: false,
      message:
        error?.name === "AbortError"
          ? "Meta API request timed out."
          : error?.message || "Error submitting to Meta API.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function isValidHttpsUrl(value: string) {
  if (!value) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidIpfsOrHttpsUrl(value: string) {
  if (!value) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "ipfs:";
  } catch {
    return false;
  }
}

function isValidTokenSymbol(value: string) {
  return /^[A-Z0-9]{2,10}$/.test(value);
}

export async function POST(request: Request) {
  try {
    if (!hasAllowedOrigin(request)) {
      return noStoreJson(
        {
          success: false,
          message: "Cross-origin metadata submissions are not allowed.",
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const {
      contractAddress,
      name,
      symbol,
      description,
      decimals,
      totalSupply,
      totalSupplyBaseUnits,
      logoIpfsHash,
      logoCid,
      logoUrl,
      website,
      telegram,
      twitter,
      chain,
      deployerAddress,
      deploymentTxHash,
    } = body ?? {};

    if (!contractAddress || !name || !symbol || !deployerAddress || !chain) {
      return noStoreJson(
        {
          success: false,
          message:
            "Missing required fields: contractAddress, name, symbol, deployerAddress, chain",
        },
        { status: 400 }
      );
    }

    if (![TronNetwork.MAINNET, TronNetwork.NILE_TESTNET].includes(chain)) {
      return noStoreJson(
        {
          success: false,
          message: "Invalid chain. Must be TRON_MAINNET or TRON_NILE.",
        },
        { status: 400 }
      );
    }

    if (!isValidTronAddress(contractAddress) || !isValidTronAddress(deployerAddress)) {
      return noStoreJson(
        {
          success: false,
          message: "Invalid TRON address provided.",
        },
        { status: 400 }
      );
    }

    if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 64) {
      return noStoreJson(
        {
          success: false,
          message: "Token name must be between 1 and 64 characters.",
        },
        { status: 400 }
      );
    }

    if (typeof symbol !== "string" || !isValidTokenSymbol(symbol.trim().toUpperCase())) {
      return noStoreJson(
        {
          success: false,
          message: "Token symbol must be 2-10 uppercase letters or numbers.",
        },
        { status: 400 }
      );
    }

    if (typeof description !== "undefined" && String(description).trim().length > 280) {
      return noStoreJson(
        {
          success: false,
          message: "Description must be 280 characters or fewer.",
        },
        { status: 400 }
      );
    }

    const normalizedDecimals = Number(decimals ?? 18);

    if (!Number.isInteger(normalizedDecimals) || normalizedDecimals < 0 || normalizedDecimals > 18) {
      return noStoreJson(
        {
          success: false,
          message: "Decimals must be an integer between 0 and 18.",
        },
        { status: 400 }
      );
    }

    const normalizedSupply = String(totalSupply ?? "0").trim();

    if (!/^\d+$/.test(normalizedSupply) || BigInt(normalizedSupply) <= 0n) {
      return noStoreJson(
        {
          success: false,
          message: "Total supply must be a positive whole number.",
        },
        { status: 400 }
      );
    }

    const normalizedBaseUnits = String(totalSupplyBaseUnits ?? "").trim();

    if (normalizedBaseUnits && !/^\d+$/.test(normalizedBaseUnits)) {
      return noStoreJson(
        {
          success: false,
          message: "totalSupplyBaseUnits must be a whole number when provided.",
        },
        { status: 400 }
      );
    }

    const normalizedLogoCid = String(logoCid || logoIpfsHash || "").trim();

    if (normalizedLogoCid && !CID_PATTERN.test(normalizedLogoCid)) {
      return noStoreJson(
        {
          success: false,
          message: "Logo CID is invalid.",
        },
        { status: 400 }
      );
    }

    if (!isValidIpfsOrHttpsUrl(String(logoUrl || ""))) {
      return noStoreJson(
        {
          success: false,
          message: "Logo URL must use https or ipfs.",
        },
        { status: 400 }
      );
    }

    for (const [label, value] of [
      ["Website", String(website || "")],
      ["Telegram", String(telegram || "")],
      ["Twitter/X", String(twitter || "")],
    ]) {
      if (!isValidHttpsUrl(value)) {
        return noStoreJson(
          {
            success: false,
            message: `${label} must use https.`,
          },
          { status: 400 }
        );
      }
    }

    const apiKey = process.env.META_API_KEY;

    if (!apiKey) {
      return noStoreJson(
        {
          success: false,
          message: "Meta API key is not configured on the server.",
        },
        { status: 503 }
      );
    }

    const metadata: TokenMetadata = {
      contractAddress,
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      description: String(description || "").trim(),
      decimals: normalizedDecimals,
      totalSupply: normalizedSupply,
      totalSupplyBaseUnits: normalizedBaseUnits,
      logoIpfsHash: String(logoIpfsHash || "").trim(),
      logoCid: normalizedLogoCid,
      logoUrl: String(logoUrl || "").trim(),
      website: String(website || "").trim(),
      telegram: String(telegram || "").trim(),
      twitter: String(twitter || "").trim(),
      chain,
      deployerAddress,
      deploymentTxHash,
    };

    const result = await submitToMetaBridge(metadata, apiKey);

    return noStoreJson(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error: any) {
    return noStoreJson(
      {
        success: false,
        message: error?.message || "Error processing token submission.",
      },
      { status: 500 }
    );
  }
}
