module.exports = {
  networks: {
    development: {
      host: "127.0.0.1",
      port: 7545,  // Assurez-vous que c'est bien celui de Ganache
      network_id: "*",
      gas: 8000000, // Augmentez cette valeur
      gasPrice: 20000000000 
    },
  },
  compilers: {
    solc: {
      version: "0.8.0",
    }
  }
};











































