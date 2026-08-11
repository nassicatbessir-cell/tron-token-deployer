import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import solc from "solc";

let cachedArtifact:
  | {
      abi: unknown;
      bytecode: string;
    }
  | null = null;

async function compileContract() {
  if (cachedArtifact) {
    return cachedArtifact;
  }

  const contractPath = path.join(
    process.cwd(),
    "contracts",
    "TRC20Token.sol"
  );
  const source = await readFile(contractPath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      "TRC20Token.sol": {
        content: source,
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []) as Array<{
    severity: string;
    formattedMessage: string;
  }>;
  const fatalErrors = errors.filter((error) => error.severity === "error");

  if (fatalErrors.length > 0) {
    throw new Error(fatalErrors.map((error) => error.formattedMessage).join("\n"));
  }

  const artifact = output.contracts?.["TRC20Token.sol"]?.TRC20Token;

  if (!artifact?.abi || !artifact?.evm?.bytecode?.object) {
    throw new Error("Compiled contract artifact is incomplete.");
  }

  cachedArtifact = {
    abi: artifact.abi,
    bytecode: artifact.evm.bytecode.object,
  };

  return cachedArtifact;
}

export async function GET() {
  try {
    const artifact = await compileContract();

    return NextResponse.json(artifact, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("Contract artifact generation error:", error);

    return NextResponse.json(
      {
        error:
          error?.message ||
          "Could not generate contract artifact from source.",
      },
      { status: 500 }
    );
  }
}
