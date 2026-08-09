import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export async function GET() {
  try {
    const root = process.cwd();

    const abiPath = path.join(
      root,
      "build",
      "contracts_TRC20Token_sol_TRC20Token.abi"
    );

    const binPath = path.join(
      root,
      "build",
      "contracts_TRC20Token_sol_TRC20Token.bin"
    );

    const [abiRaw, bytecodeRaw] = await Promise.all([
      fs.readFile(abiPath, "utf8"),
      fs.readFile(binPath, "utf8"),
    ]);

    const abi = JSON.parse(abiRaw);
    const bytecode = bytecodeRaw.trim();

    if (!bytecode) {
      throw new Error("Bytecode is empty.");
    }

    return NextResponse.json({
      abi,
      bytecode,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || "Unable to load token artifact.",
      },
      { status: 500 }
    );
  }
}
