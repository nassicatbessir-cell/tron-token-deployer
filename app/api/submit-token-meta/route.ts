import { NextResponse } from "next/server";

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

async function submitToMetaBridge(
  metadata: TokenMetadata,
  apiKey: string
): Promise<MetaResponse> {
  const metaApiUrl = process.env.META_API_URL || "https://api.meta.global/v1";

  try {
    const payload = {
      token: {
        address: metadata.contractAddress,
        name: metadata.name,
        symbol: metadata.symbol,
        decimals: metadata.decimals,
        totalSupply: metadata.totalSupply,
        chainId: metadata.chain === "TRON_MAINNET" ? "0x39" : "0x00a0",
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
    });

    const data = await response.json();

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
      message: error?.message || "Error submitting to Meta API",
    };
  }
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

    // Validation
    if (
      !contractAddress ||
      !name ||
      !symbol ||
      !deployerAddress ||
      !chain
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Missing required fields: contractAddress, name, symbol, deployerAddress, chain",
        },
        { status: 400 }
      );
    }

    if (!["TRON_MAINNET", "TRON_NILE"].includes(chain)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid chain. Must be TRON_MAINNET or TRON_NILE",
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
      name,
      symbol,
      decimals: decimals || 18,
      totalSupply: totalSupply || "0",
      logoIpfsHash: logoIpfsHash || "",
      logoCid: logoCid || logoIpfsHash || "",
      logoUrl: logoUrl || "",
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
