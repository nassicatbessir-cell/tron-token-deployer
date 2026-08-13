import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import solc from "solc";

export const runtime = "nodejs";

type ContractConstructorInput = {
  type?: string;
};

type ContractConstructorAbi = {
  type?: string;
  inputs?: ContractConstructorInput[];
};

type CompiledArtifact = {
  sourceHash: string;
  abi: ContractConstructorAbi[];
  bytecode: string;
  constructorAbi: ContractConstructorAbi;
};

let cachedArtifact: CompiledArtifact | null = null;

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      ...init?.headers,
    },
  });
}

function assertExpectedConstructor(abi: ContractConstructorAbi[]) {
  const constructorItem = Array.isArray(abi)
    ? abi.find((item) => item?.type === "constructor")
    : null;

  if (!constructorItem) {
    throw new Error("Compiled contract constructor is missing from the ABI.");
  }

  const inputTypes = Array.isArray(constructorItem.inputs)
    ? constructorItem.inputs.map((input: ContractConstructorInput) => input?.type)
    : [];

  const expectedInputTypes = ["string", "string", "uint256"];

  if (
    inputTypes.length !== expectedInputTypes.length ||
    inputTypes.some((inputType: string | undefined, index: number) => inputType !== expectedInputTypes[index])
  ) {
    throw new Error(
      `Unexpected constructor signature: expected ${expectedInputTypes.join(", ")} but received ${inputTypes.join(", ") || "none"}.`
    );
  }

  return constructorItem;
}

function assertValidBytecode(bytecode: string) {
  if (!bytecode || !/^[0-9a-fA-F]+$/.test(bytecode) || bytecode.length < 20) {
    throw new Error("Compiled contract bytecode is invalid.");
  }
}

async function compileContract() {
  const contractPath = path.join(
    process.cwd(),
    "contracts",
    "TRC20Token.sol"
  );
  const source = await readFile(contractPath, "utf8");
  const sourceHash = createHash("sha256").update(source).digest("hex");

  if (cachedArtifact?.sourceHash === sourceHash) {
    return cachedArtifact;
  }

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

  const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
    errors?: Array<{
      severity: string;
      formattedMessage: string;
    }>;
    contracts?: {
      [sourceName: string]: {
        [contractName: string]: {
          abi?: ContractConstructorAbi[];
          evm?: {
            bytecode?: {
              object?: string;
            };
          };
        };
      };
    };
  };
  const errors = output.errors || [];
  const fatalErrors = errors.filter((error) => error.severity === "error");

  if (fatalErrors.length > 0) {
    console.error("Contract compilation failed", fatalErrors.map((error) => error.formattedMessage));
    throw new Error("Contract compilation failed.");
  }

  const artifact = output.contracts?.["TRC20Token.sol"]?.TRC20Token;

  if (!artifact?.abi || !artifact?.evm?.bytecode?.object) {
    throw new Error("Compiled contract artifact is incomplete.");
  }

  const constructorAbi = assertExpectedConstructor(artifact.abi);
  assertValidBytecode(artifact.evm.bytecode.object);

  cachedArtifact = {
    sourceHash,
    abi: artifact.abi,
    bytecode: artifact.evm.bytecode.object,
    constructorAbi,
  };

  return cachedArtifact;
}

export async function GET() {
  try {
    const artifact = await compileContract();

    return noStoreJson({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      constructorAbi: artifact.constructorAbi,
      sourceHash: artifact.sourceHash,
    });
  } catch (error: any) {
    console.error("Contract artifact generation error:", error);

    return noStoreJson(
      {
        error: "Could not generate contract artifact from source.",
      },
      {
        status: 500,
      }
    );
  }
}
