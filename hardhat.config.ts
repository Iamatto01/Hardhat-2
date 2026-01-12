import "dotenv/config";

import path from "path";
import { fileURLToPath } from "url";

import hardhatEthers from "@nomicfoundation/hardhat-ethers";
import hardhatEthersChai from "@nomicfoundation/hardhat-ethers-chai-matchers";
import hardhatMocha from "@nomicfoundation/hardhat-mocha";
import { configVariable, defineConfig } from "hardhat/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function envOrConfigVar(name: string) {
  return process.env[name] ?? process.env[`HARDHAT_VAR_${name}`] ?? configVariable(name);
}

export default defineConfig({
  plugins: [hardhatEthers, hardhatEthersChai, hardhatMocha],
  test: {
    mocha: {
      timeout: 40000,
    },
  },
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainType: "l1",
      timeout: 40000,
      allowUnlimitedContractSize: true,
      mining: {
        auto: true,
        interval: 1000,
      },
    },
    localhost: {
      type: "http",
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      type: "http",
      url: envOrConfigVar("SEPOLIA_RPC_URL"),
      accounts: [envOrConfigVar("SEPOLIA_PRIVATE_KEY")],
    },
  },
});
