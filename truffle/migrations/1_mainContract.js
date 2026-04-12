const MainContract = artifacts.require("./MainContract.sol");

module.exports = async function (deployer, network, accounts) {

  console.log("Deploying mainContract from:", accounts[0]);

  await deployer.deploy(MainContract);

  console.log("mainContract deployed successfully.");
};
