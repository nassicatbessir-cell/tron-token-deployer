import { NextResponse } from "next/server";
import { isValidTronAddress, TronNetwork } from "@/app/utils/tron-network";

interface TokenMetadata {
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  logoIpfsHash: string;
  logoCid: string;
  logoUrl: string;
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

async function submitToMetaBridge(
  metadata: TokenMetadata,
  apiKey: string
): Promise<MetaResponse> {
  const metaApiUrl = process.env.META_API_URL || "https://api.meta.global/v1";
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), META_REQUEST_TIMEOUT_MS);

  try {
    const payload = {
      token: {
        address: metadata.contractAddress,
        name: metadata.name,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        totalSupply: metadata.totalSupply,
        chainId: metadata.chain === TronNetwork.MAINNET ? "0x39" : "0x00a0",
        logoUrl: metadata.logoUrl,
        logoCid: metadata.logoCid,
        deployer: metadata.deployerAddress,
        deploymentHash: metadata.deploymentTxHash,
      },
      timestamp: new Date().toISOString(),
      source: "tron-token-deployer",
    };

    const response = await fetch(`${metaApiUrl}/tokens/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "User-Agent": "tron-token-deployer/1.0",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Meta API error:", data);
      return {
        success: false,
        message: data?.message || "Failed to submit token to Meta",
      };
    }

    return {
      success: true,
      tokenId: data?.tokenId,
      submissionId: data?.submissionId,
      status: data?.status || "pending",
      message: "Token metadata submitted successfully to Meta",
    };
  } catch (error: any) {
    console.error("Meta submission error:", error);
    return {
      success: false,
      message:
        error?.name === "AbortError"
          ? "Meta API request timed out"
          : error?.message || "Error submitting to Meta API",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function isValidUrl(value: string) {
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
    const body = await request.json();

    const {
      contractAddress,
      name,
      symbol,
      decimals,
      totalSupply,
      logoIpfsHash,
      logoCid,
      logoUrl,
      chain,
      deployerAddress,
      deploymentTxHash,
    } = body;

    if (!contractAddress || !name || !symbol || !deployerAddress || !chain) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Missing required fields: contractAddress, name, symbol, deployerAddress, chain",
        },
        { status: 400 }
      );
    }

    if (![TronNetwork.MAINNET, TronNetwork.NILE_TESTNET].includes(chain)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid chain. Must be TRON_MAINNET or TRON_NILE",
        },
        { status: 400 }
      );
    }

    if (!isValidTronAddress(contractAddress) || !isValidTronAddress(deployerAddress)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid TRON address provided",
        },
        { status: 400 }
      );
    }

    if (typeof name !== "string" || name.trim().length === 0 || name.trim().length > 64) {
      return NextResponse.json(
        {
          success: false,
          message: "Token name must be between 1 and 64 characters",
        },
        { status: 400 }
      );
    }

    if (typeof symbol !== "string" || !isValidTokenSymbol(symbol.trim().toUpperCase())) {
      return NextResponse.json(
        {
          success: false,
          message: "Token symbol must be 2-10 uppercase letters or numbers",
        },
        { status: 400 }
      );
    }

    const normalizedDecimals = Number(decimals ?? 18);

    if (!Number.isInteger(normalizedDecimals) || normalizedDecimals < 0 || normalizedDecimals > 18) {
      return NextResponse.json(
        {
          success: false,
          message: "Decimals must be an integer between 0 and 18",
        },
        { status: 400 }
      );
    }

    const normalizedSupply = String(totalSupply ?? "0").trim();

    if (!/^\d+$/.test(normalizedSupply) || BigInt(normalizedSupply) <= 0n) {
      return NextResponse.json(
        {
          success: false,
          message: "Total supply must be a positive whole number",
        },
        { status: 400 }
      );
    }

    if (!isValidUrl(String(logoUrl || ""))) {
      return NextResponse.json(
        {
          success: false,
          message: "Logo URL must use https or ipfs",
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.META_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          message: "Meta API key not configured on server",
        },
        { status: 500 }
      );
    }

    const metadata: TokenMetadata = {
      contractAddress,
      name: name.trim(),
      symbol: symbol.trim().toUpperCase(),
      decimals: normalizedDecimals,
      totalSupply: normalizedSupply,
      logoIpfsHash: String(logoIpfsHash || ""),
      logoCid: String(logoCid || logoIpfsHash || ""),
      logoUrl: String(logoUrl || ""),
      chain,
      deployerAddress,
      deploymentTxHash,
    };

    const result = await submitToMetaBridge(metadata, apiKey);

    return NextResponse.json(result, {
      status: result.success ? 200 : 400,
    });
  } catch (error: any) {
    console.error("Token metadata submission error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error?.message || "Error processing token submission",
      },
      { status: 500 }
    );
  }
}
