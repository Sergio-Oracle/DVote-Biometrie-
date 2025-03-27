const VotingSystem = artifacts.require("VotingSystem");

module.exports = async function(deployer, network, accounts) {
  await deployer.deploy(VotingSystem, { gas: 6721975 });
};






































