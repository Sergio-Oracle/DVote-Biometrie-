import React, { useState, useEffect } from "react";
import web3 from "./web3";
import votingSystemContract from "./contracts/VotingSystem.json";
import { Container, Navbar, Nav, Button } from "react-bootstrap";
import AdminPanel from "./components/AdminPanel";
import VoterPanel from "./components/VoterPanel";
import BiometricAuth from "./components/BiometricAuth";
import BiometricRegister from "./components/BiometricRegister";

const contractABI = votingSystemContract.abi;
const CONTRACT_ADDRESS = "0xC9dA4f35214a86c662714aAe1e0308057C1C7ac3";

function App() {
  const [account, setAccount] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState(null); // "admin" ou "voter" retourné par l'API
  const [contract, setContract] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authStep, setAuthStep] = useState("home"); // "home", "register", "authenticate" ou "app"

  useEffect(() => {
    const init = async () => {
      try {
        if (!web3) {
          console.error("Web3 non initialisé");
          setLoading(false);
          return;
        }
        const accounts = await web3.eth.getAccounts();
        setAccount(accounts[0]);
        const contractInstance = new web3.eth.Contract(contractABI, CONTRACT_ADDRESS);
        setContract(contractInstance);
        const adminAddress = await contractInstance.methods.admin().call();
        setIsAdmin(accounts[0].toLowerCase() === adminAddress.toLowerCase());
        setLoading(false);
      } catch (error) {
        console.error("Erreur lors de l'initialisation : ", error);
        setLoading(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) return;
      setAccount(accounts[0]);
      if (contract) {
        contract.methods
          .admin()
          .call()
          .then((adminAddress) => {
            setIsAdmin(accounts[0].toLowerCase() === adminAddress.toLowerCase());
          });
      }
    };
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", handleAccountsChanged);
      return () => window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
    }
  }, [contract]);

  const handleRegistrationSuccess = () => {
    setAuthStep("authenticate"); // Transition vers l'authentification après inscription
  };

  const handleAuthenticationSuccess = (role) => {
    setUserRole(role);
    setAuthStep("app"); // Transition vers l'application après authentification
  };

  const handleGoToRegister = () => {
    setAuthStep("register");
  };

  const handleGoToAuthenticate = () => {
    setAuthStep("authenticate");
  };

  const handleBackToHome = () => {
    setAuthStep("home");
  };

  if (loading) {
    return <Container style={{ maxWidth: "2000px", margin: "0 auto" }}>Chargement...</Container>;
  }

  return (
    <Container style={{ maxWidth: "2000px", margin: "0 auto" }}>
      <Navbar bg="dark" variant="dark" expand="lg">
        <Navbar.Brand>Voting DApp</Navbar.Brand>
        <Nav className="ms-auto">
          <Navbar.Text className="me-3">Connecté: {account}</Navbar.Text>
          {authStep === "home" && (
            <>
              <Button variant="primary" onClick={handleGoToRegister} className="me-2">
                Créer un compte
              </Button>
              <Button variant="success" onClick={handleGoToAuthenticate}>
                Se connecter
              </Button>
            </>
          )}
        </Nav>
      </Navbar>

      {authStep === "home" && (
        <div className="d-flex flex-column align-items-center mt-5">
          <h2>Bienvenue sur Voting DApp</h2>
          <p className="text-center mt-3" style={{ maxWidth: "600px" }}>
            Voting DApp est une application décentralisée sécurisée permettant de voter en ligne
            avec authentification biométrique. Créez un compte ou connectez-vous pour participer
            aux élections en toute sécurité.
          </p>
        </div>
      )}

      {authStep === "register" && (
        <BiometricRegister
          ethereumAddress={account}
          onRegistered={handleRegistrationSuccess}
          onBack={handleBackToHome}
        />
      )}

      {authStep === "authenticate" && (
        <BiometricAuth
          ethereumAddress={account}
          onSuccess={handleAuthenticationSuccess}
          onBack={handleBackToHome}
        />
      )}

      {authStep === "app" && contract && (
        <>
          {userRole === "admin" && isAdmin ? (
            <AdminPanel contract={contract} account={account} />
          ) : (
            <VoterPanel contract={contract} account={account} />
          )}
        </>
      )}
    </Container>
  );
}

export default App;