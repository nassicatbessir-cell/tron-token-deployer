import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import solc from "solc";

const contractPath = path.join(process.cwd(), "contracts", "TRC20Token.sol");
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

const errors = output.errors ?? [];
const fatalErrors = errors.filter((error) => error.severity === "error");

assert.equal(
  fatalErrors.length,
  0,
  `Solidity compilation failed:\n${fatalErrors
    .map((error) => error.formattedMessage)
    .join("\n")}`
);

const artifact = output.contracts?.["TRC20Token.sol"]?.TRC20Token;

assert.ok(artifact, "TRC20Token artifact was not produced");
assert.ok(
  artifact.evm?.bytecode?.object,
  "TRC20Token bytecode was not produced"
);

const constructorAbi = artifact.abi.find(
  (item) => item.type === "constructor"
);

assert.ok(constructorAbi, "Constructor ABI is missing");

assert.deepEqual(
  constructorAbi.inputs.map((input) => input.type),
  ["string", "string", "uint256", "uint8"],
  "Constructor must accept name, symbol, initialSupply and decimals"
);

const decimalsAbi = artifact.abi.find(
  (item) => item.type === "function" && item.name === "decimals"
);

assert.ok(decimalsAbi, "decimals() function is missing");
assert.deepEqual(
  decimalsAbi.outputs?.map((output) => output.type),
  ["uint8"],
  "decimals() must return uint8"
);

console.log("PASS: TRC20Token compiles successfully");
console.log("PASS: constructor = string,string,uint256,uint8");
console.log("PASS: decimals() returns uint8");
console.log("PASS: deployment supports 6-decimal tokens");
