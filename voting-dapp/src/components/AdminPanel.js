import React, { useState, useEffect, useCallback } from "react";
import { Button, Card, Form, Table, Row, Col } from "react-bootstrap";

const AdminPanel = ({ contract, account }) => {
  /*** États pour l'inscription individuelle des électeurs ***/
  const [voterAddress, setVoterAddress] = useState("");
  const [voterFirstName, setVoterFirstName] = useState("");
  const [voterLastName, setVoterLastName] = useState("");
  const [voterIdCardNumber, setVoterIdCardNumber] = useState("");
  const [voterAge, setVoterAge] = useState("");

  /*** États pour l'inscription individuelle des candidats ***/
  const [candidateFirstName, setCandidateFirstName] = useState("");
  const [candidateLastName, setCandidateLastName] = useState("");
  const [candidateAddress, setCandidateAddress] = useState("");
  const [certificationCode, setCertificationCode] = useState("");
  const [candidatePoliticalParty, setCandidatePoliticalParty] = useState("");
  const [candidateAge, setCandidateAge] = useState("");

  /*** États pour la gestion des fichiers CSV ***/
  // Pour l'inscription en masse des électeurs
  const [voterCsvFile, setVoterCsvFile] = useState(null);
  // Pour l'inscription en masse des candidats
  const [candidateCsvFile, setCandidateCsvFile] = useState(null);

  /*** États de récupération des données du contrat ***/
  const [voters, setVoters] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [electionPhase, setElectionPhase] = useState(null);
  const [totalVotes, setTotalVotes] = useState(0);
  const [winnerCandidateId, setWinnerCandidateId] = useState(0);

  // Libellés des phases
  const phases = [
    "NotStarted",
    "VoterRegistration",
    "CandidateRegistration",
    "Voting",
    "Results",
  ];

  // Fonction de récupération des données depuis le contrat
  const fetchData = useCallback(async () => {
    try {
      // Récupération de la phase actuelle
      const phase = await contract.methods.currentPhase().call();
      const phaseInt = parseInt(phase, 10);
      setElectionPhase(phaseInt);

      // Récupération du total des votes
      const votes = await contract.methods.totalVotes().call();
      setTotalVotes(votes);

      // Récupération des électeurs
      const voterAddresses = await contract.methods.getVoterAddresses().call();
      const voterData = await Promise.all(
        voterAddresses.map(async (addr) =>
          contract.methods.getVoter(addr).call()
        )
      );
      setVoters(voterData);

      // Récupération des candidats
      const candidateCount = await contract.methods.candidateCount().call();
      let candidateData = [];
      for (let i = 1; i < candidateCount; i++) {
        const candidate = await contract.methods.getCandidate(i).call();
        candidateData.push(candidate);
      }
      setCandidates(candidateData);

      // Si l'élection est en phase "Results", on récupère le gagnant
      if (phaseInt === 4) {
        const winner = await contract.methods.winnerCandidateId().call();
        setWinnerCandidateId(parseInt(winner, 10));
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des données :", error);
    }
  }, [contract]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /*** Fonctions de gestion des phases de l'élection ***/
  const startElection = async () => {
    try {
      await contract.methods.startElection().send({ from: account });
      alert("Élection démarrée !");
      fetchData();
    } catch (error) {
      alert("Erreur lors du démarrage de l'élection.");
      console.error(error);
    }
  };

  const nextPhase = async () => {
    try {
      await contract.methods.nextPhase().send({ from: account });
      alert("Phase suivante activée !");
      fetchData();
    } catch (error) {
      alert("Erreur lors du changement de phase.");
      console.error(error);
    }
  };

  const resetElection = async () => {
    try {
      await contract.methods.resetElection().send({ from: account });
      alert("Élection réinitialisée !");
      fetchData();
    } catch (error) {
      alert("Erreur lors de la réinitialisation de l'élection.");
      console.error(error);
    }
  };

  /*** Inscription individuelle ***/
  const addVoter = async (e) => {
    e.preventDefault();
    try {
      // Conversion de voterAge en nombre
      const age = parseInt(voterAge, 10);
      await contract.methods
        .addVoter(voterAddress, voterFirstName, voterLastName, voterIdCardNumber, age)
        .send({ from: account });
      alert("Électeur ajouté avec succès !");
      // Réinitialisation des champs
      setVoterAddress("");
      setVoterFirstName("");
      setVoterLastName("");
      setVoterIdCardNumber("");
      setVoterAge("");
      fetchData();
    } catch (error) {
      alert("Erreur lors de l'ajout de l'électeur.");
      console.error(error);
    }
  };

  const addCandidate = async (e) => {
    e.preventDefault();
    try {
      // Conversion de candidateAge en nombre
      const age = parseInt(candidateAge, 10);
      await contract.methods
        .addCandidate(
          candidateFirstName,
          candidateLastName,
          candidateAddress,
          certificationCode,
          candidatePoliticalParty,
          age
        )
        .send({ from: account });
      alert("Candidat ajouté avec succès !");
      // Réinitialisation des champs
      setCandidateFirstName("");
      setCandidateLastName("");
      setCandidateAddress("");
      setCertificationCode("");
      setCandidatePoliticalParty("");
      setCandidateAge("");
      fetchData();
    } catch (error) {
      alert("Erreur lors de l'ajout du candidat.");
      console.error(error);
    }
  };

  /*** Inscription en masse via CSV ***/
  // Pour les électeurs
  const handleVoterCSVChange = (e) => {
    setVoterCsvFile(e.target.files[0]);
  };

  const handleVoterCSVSubmit = async (e) => {
    e.preventDefault();
    if (!voterCsvFile) {
      alert("Veuillez sélectionner un fichier CSV pour les électeurs.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      // Supposons que la première ligne contient les entêtes :
      // address,firstName,lastName,idCardNumber,age
      const lines = text.split("\n").filter((line) => line.trim() !== "");
      const addresses = [];
      const firstNames = [];
      const lastNames = [];
      const idCardNumbers = [];
      const ages = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",");
        if (values.length < 5) continue;
        addresses.push(values[0].trim());
        firstNames.push(values[1].trim());
        lastNames.push(values[2].trim());
        idCardNumbers.push(values[3].trim());
        ages.push(parseInt(values[4].trim(), 10));
      }
      try {
        await contract.methods
          .addVotersBulk(addresses, firstNames, lastNames, idCardNumbers, ages)
          .send({ from: account });
        alert("Électeurs ajoutés en masse avec succès !");
        fetchData();
      } catch (error) {
        alert("Erreur lors de l'ajout en masse des électeurs.");
        console.error(error);
      }
    };
    reader.readAsText(voterCsvFile);
  };

  // Pour les candidats
  const handleCandidateCSVChange = (e) => {
    setCandidateCsvFile(e.target.files[0]);
  };

  const handleCandidateCSVSubmit = async (e) => {
    e.preventDefault();
    if (!candidateCsvFile) {
      alert("Veuillez sélectionner un fichier CSV pour les candidats.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      // Supposons que la première ligne contient les entêtes :
      // firstName,lastName,addressCandidate,certificationCode,politicalParty,age
      const lines = text.split("\n").filter((line) => line.trim() !== "");
      const firstNames = [];
      const lastNames = [];
      const addressCandidates = [];
      const certificationCodes = [];
      const politicalParties = [];
      const ages = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",");
        if (values.length < 6) continue;
        firstNames.push(values[0].trim());
        lastNames.push(values[1].trim());
        addressCandidates.push(values[2].trim());
        certificationCodes.push(values[3].trim());
        politicalParties.push(values[4].trim());
        ages.push(parseInt(values[5].trim(), 10));
      }
      try {
        await contract.methods
          .addCandidatesBulk(
            firstNames,
            lastNames,
            addressCandidates,
            certificationCodes,
            politicalParties,
            ages
          )
          .send({ from: account });
        alert("Candidats ajoutés en masse avec succès !");
        fetchData();
      } catch (error) {
        alert("Erreur lors de l'ajout en masse des candidats.");
        console.error(error);
      }
    };
    reader.readAsText(candidateCsvFile);
  };

  /*** Détermination et affichage du gagnant en phase "Results" ***/
  const winnerCandidate = candidates.find(
    (c) => parseInt(c.id, 10) === winnerCandidateId
  );

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "10px" }}>
      <Card
        className="mt-3 p-3"
        style={{ borderRadius: "20px", boxShadow: "0 0 20px rgba(0,0,0,0.1)" }}
      >
        <h3>Interface Administrateur</h3>
        <p>
          <strong>Phase actuelle :</strong>{" "}
          {electionPhase !== null ? phases[electionPhase] : "Chargement..."}
        </p>
        <p>
          <strong>Total des votes :</strong> {totalVotes}
        </p>
        {/* Affichage du gagnant en phase Results */}
        {electionPhase === 4 && winnerCandidate && (
          <div
            style={{
              marginBottom: "15px",
              padding: "10px",
              backgroundColor: "#d4edda",
              borderRadius: "10px",
            }}
          >
            <h5>Gagnant de l'élection</h5>
            <p>
              <strong>ID:</strong> {winnerCandidate.id} <br />
              <strong>Nom:</strong> {winnerCandidate.firstName}{" "}
              {winnerCandidate.lastName} <br />
              <strong>Votes:</strong> {winnerCandidate.voteCount}
            </p>
          </div>
        )}

        <div className="mb-3">
          <Button
            variant="primary"
            className="m-2"
            onClick={startElection}
            disabled={electionPhase !== 0}
          >
            Démarrer l'élection
          </Button>
          <Button
            variant="success"
            className="m-2"
            onClick={nextPhase}
            disabled={electionPhase === 4}
          >
            Passer à la phase suivante
          </Button>
          {electionPhase === 4 && (
            <Button
              variant="danger"
              className="m-2"
              onClick={resetElection}
            >
              Réinitialiser l'élection
            </Button>
          )}
        </div>

        {/* Section : Inscription individuelle des électeurs */}
        <Row className="mt-4">
          <Col xs={12} md={6}>
            <h4>Ajouter un électeur</h4>
            <Form onSubmit={addVoter}>
              <Form.Group>
                <Form.Control
                  type="text"
                  placeholder="Adresse Ethereum"
                  value={voterAddress}
                  onChange={(e) => setVoterAddress(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group>
                <Form.Control
                  type="text"
                  placeholder="Prénom"
                  value={voterFirstName}
                  onChange={(e) => setVoterFirstName(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group>
                <Form.Control
                  type="text"
                  placeholder="Nom"
                  value={voterLastName}
                  onChange={(e) => setVoterLastName(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group>
                <Form.Control
                  type="text"
                  placeholder="Numéro de carte d'identité"
                  value={voterIdCardNumber}
                  onChange={(e) => setVoterIdCardNumber(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group>
                <Form.Control
                  type="number"
                  placeholder="Âge"
                  value={voterAge}
                  onChange={(e) => setVoterAge(e.target.value)}
                  required
                />
              </Form.Group>
              <Button
                variant="info"
                type="submit"
                className="mt-2"
                disabled={electionPhase !== 1}
              >
                Ajouter Électeur
              </Button>
            </Form>
          </Col>
          <Col xs={12} md={6}>
            <h4>Liste des Électeurs</h4>
            <Table striped bordered hover responsive>
              <thead>
                <tr>
                  <th>Adresse</th>
                  <th>Prénom</th>
                  <th>Nom</th>
                  <th>ID Card</th>
                  <th>Âge</th>
                </tr>
              </thead>
              <tbody>
                {voters.map((voter, index) => (
                  <tr key={index}>
                    <td>{voter.addressVoter}</td>
                    <td>{voter.firstName}</td>
                    <td>{voter.lastName}</td>
                    <td>{voter.idCardNumber}</td>
                    <td>{voter.age}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Col>
        </Row>

        {/* Section : Inscription en masse des électeurs via CSV */}
        <Row className="mt-4">
          <Col xs={12}>
            <h4>
              Inscription en masse (CSV) - Électeurs<br />
              <small>Format attendu : Adresse,Prénom,Nom,ID Card,Âge</small>
            </h4>
            <Form onSubmit={handleVoterCSVSubmit}>
              <Form.Group controlId="voterCsvFile">
                <Form.Label>Choisissez un fichier CSV</Form.Label>
                <Form.Control
                  type="file"
                  accept=".csv"
                  onChange={handleVoterCSVChange}
                />
              </Form.Group>
              <Button variant="secondary" type="submit" className="mt-2">
                Enregistrer les électeurs en masse
              </Button>
            </Form>
          </Col>
        </Row>

        {/* Section : Inscription individuelle des candidats */}
        <Row className="mt-4">
          <Col xs={12} md={6}>
            <h4>Ajouter un candidat</h4>
            <Form onSubmit={addCandidate}>
              <Form.Group>
                <Form.Control
                  type="text"
                  placeholder="Prénom"
                  value={candidateFirstName}
                  onChange={(e) => setCandidateFirstName(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group>
                <Form.Control
                  type="text"
                  placeholder="Nom"
                  value={candidateLastName}
                  onChange={(e) => setCandidateLastName(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group>
                <Form.Control
                  type="text"
                  placeholder="Adresse Ethereum du candidat"
                  value={candidateAddress}
                  onChange={(e) => setCandidateAddress(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group>
                <Form.Control
                  type="text"
                  placeholder="Code de certification"
                  value={certificationCode}
                  onChange={(e) => setCertificationCode(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group>
                <Form.Control
                  type="text"
                  placeholder="Parti politique"
                  value={candidatePoliticalParty}
                  onChange={(e) => setCandidatePoliticalParty(e.target.value)}
                  required
                />
              </Form.Group>
              <Form.Group>
                <Form.Control
                  type="number"
                  placeholder="Âge"
                  value={candidateAge}
                  onChange={(e) => setCandidateAge(e.target.value)}
                  required
                />
              </Form.Group>
              <Button
                variant="warning"
                type="submit"
                className="mt-2"
                disabled={electionPhase !== 2}
              >
                Ajouter Candidat
              </Button>
            </Form>
          </Col>
          <Col xs={12} md={6}>
            <h4>
              Liste des Candidats {electionPhase === 4 ? "(Résultats)" : ""}
            </h4>
            <Table striped bordered hover responsive>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Adresse</th>
                  <th>Prénom</th>
                  <th>Nom</th>
                  <th>Certification</th>
                  <th>Parti Politique</th>
                  <th>Âge</th>
                  <th>Votes</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate, index) => (
                  <tr key={index}>
                    <td>{candidate.id}</td>
                    <td>{candidate.addressCandidate}</td>
                    <td>{candidate.firstName}</td>
                    <td>{candidate.lastName}</td>
                    <td>{candidate.certificationCode}</td>
                    <td>{candidate.politicalParty}</td>
                    <td>{candidate.age}</td>
                    <td>{candidate.voteCount}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Col>
        </Row>

        {/* Section : Inscription en masse des candidats via CSV */}
        <Row className="mt-4">
          <Col xs={12}>
            <h4>
              Inscription en masse (CSV) - Candidats<br />
              <small>
                Format attendu : Prénom,Nom,Adresse,Certification,Parti Politique,Âge
              </small>
            </h4>
            <Form onSubmit={handleCandidateCSVSubmit}>
              <Form.Group controlId="candidateCsvFile">
                <Form.Label>Choisissez un fichier CSV</Form.Label>
                <Form.Control
                  type="file"
                  accept=".csv"
                  onChange={handleCandidateCSVChange}
                />
              </Form.Group>
              <Button variant="secondary" type="submit" className="mt-2">
                Enregistrer les candidats en masse
              </Button>
            </Form>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default AdminPanel;
