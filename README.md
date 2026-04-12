# React Truffle Box

This box comes with everything you need to start using Truffle to write, compile, test, and deploy smart contracts, and interact with them from a React app.

## Installation

First ensure you are in an empty directory.

Run the `unbox` command using 1 of 2 ways.

```sh
# Install Truffle globally and run `truffle unbox`
$ npm install -g truffle
$ truffle unbox react
```

```sh
# Alternatively, run `truffle unbox` via npx
$ npx truffle unbox react
```

Start the react dev server.

```sh
$ cd client
$ npm start
```

From there, follow the instructions on the hosted React app. It will walk you through using Truffle and Ganache to deploy the `SimpleStorage` contract, making calls to it, and sending transactions to change the contract's state.

## Folder Structure
.
├── client
│   ├── node_modules/
│   ├── public/
│   │   ├── favicon.ico
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── AssociateDean.jsx
│   │   │   ├── Dean.jsx
│   │   │   ├── HomePage.jsx
│   │   │   ├── Navbar.jsx
│   │   │   ├── Professor.jsx
│   │   │   ├── Student.jsx
│   │   │   └── Verifier.jsx
│   │   ├── contexts/
│   │   │   └── Web3Context.jsx
│   │   ├── contracts/
│   │   │   ├── contractAddress.js
│   │   │   └── MainContract.json
│   │   ├── App.jsx
│   │   ├── index.jsx
│   │   └── styles.css
│   ├── package.json
│   ├── package-lock.json
│   ├── webpack.config.js
│   └── README.md
├── truffle
│   ├── contracts/
│   │   └── MainContract.sol
│   ├── migrations/
│   │   └── 1_mainContract.js
│   ├── node_modules/
│   ├── test/
│   │   └── universityMarksheet.test.js
│   ├── .env
│   ├── package.json
│   ├── package-lock.json
│   ├── truffle-config.js
│   ├── .gitattributes
│   ├── .gitignore
│   ├── LICENSE
│   └── README.md

## Ignored Files and Folders (.gitignore)
The following files and folders are ignored from Git for security, consistency, and portability:

- Node dependencies
client/node_modules/
truffle/node_modules/

- Environment variables
truffle/.env

- Build logs and temp files
*.log
*.tmp

- Auto-generated or deployment-specific files
client/src/contracts/MainContract.json
client/src/contracts/contractAddress.js

## Hidden Files (You Must Create Locally)
These files are required for deployment or frontend interaction but are hidden from version control.

- .env (in truffle/)
Stores sensitive deployment secrets:

MNEMONIC="your twelve word metamask phrase"
ALCHEMY_API_URL="https://eth-sepolia.g.alchemy.com/v2/your-api-key"

MNEMONIC: Your MetaMask or wallet seed phrase (used for deployment via Truffle).

ALCHEMY_API_URL: RPC URL from Alchemy for Sepolia or other Ethereum testnets.

- contractAddress.js (in client/src/contracts/)
Stores the deployed contract address for frontend to connect:

export const CONTRACT_ADDRESS = "0xYourDeployedContractAddress";

⚠️ Do not commit this file. Update it locally after deployment.

## FAQ

- __How do I use this with Ganache (or any other network)?__

  The Truffle project is set to deploy to Ganache by default. If you'd like to change this, it's as easy as modifying the Truffle config file! Check out [our documentation on adding network configurations](https://trufflesuite.com/docs/truffle/reference/configuration/#networks). From there, you can run `truffle migrate` pointed to another network, restart the React dev server, and see the change take place.

- __Where can I find more resources?__

  This Box is a sweet combo of [Truffle](https://trufflesuite.com) and [Webpack](https://webpack.js.org). Either one would be a great place to start!
