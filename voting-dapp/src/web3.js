import Web3 from 'web3';

let web3;

if (window.ethereum) {
  web3 = new Web3(window.ethereum);

  // Demander l'accès aux comptes
  window.ethereum.request({ method: "eth_requestAccounts" })
    .then(() => {
      console.log("Accès aux comptes autorisé");
    })
    .catch((error) => {
      console.error("L'utilisateur a refusé l'accès aux comptes:", error);
      alert("Vous devez autoriser l'accès à MetaMask pour interagir avec l'application.");
    });
} else {
  console.error("MetaMask non détecté. Veuillez l'installer !");
  alert("MetaMask est nécessaire pour utiliser cette application.");
}

export default web3;




























