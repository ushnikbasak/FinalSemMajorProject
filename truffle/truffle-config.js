// Remove the comments from the following three lines before deploying to the testnet
// require('dotenv').config();
// const { MNEMONIC, ALCHEMY_API_URL } = process.env;

// const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {

  contracts_build_directory: "../client/src/contracts",

  networks: {
    development: {
     host: "127.0.0.1",     // Localhost (default: none)
     port: 8545,            // Standard Ethereum port (default: none)
     network_id: "*",       // Any network (default: none)
    },

    // Useful for deploying to a public network. Remove comments to use code when deploying to the testnet
    // sepolia: {
    //   provider: () => new HDWalletProvider(MNEMONIC, ALCHEMY_API_URL), // You can also use Infura Project ID
    //   network_id: 11155111,   // Sepolia's network ID
    //   confirmations: 2,       // Wait for 2 confirmations before proceeding
    //   timeoutBlocks: 200,     // Set timeout in blocks
    //   skipDryRun: true        // Skip dry run before deployment
    // },
  },

  // Set default mocha options here, use special reporters, etc.
  mocha: {
    // timeout: 100000
  },

  // Configure your compilers
  compilers: {
    solc: {
      version: "0.8.20", //Contract solidity version
    }
  },
};
  