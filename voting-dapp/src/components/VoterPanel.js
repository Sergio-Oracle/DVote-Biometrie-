import React, { useState, useEffect, useCallback } from "react";
import { Button, Card, Table } from "react-bootstrap";

const VoterPanel = ({ contract, account }) => {
  const [candidats, setCandidats] = useState([]);
  const [aVoté, setAVoté] = useState(false);
  const [phaseÉlection, setPhaseÉlection] = useState(null);

  // Libellés des phases de l'élection
  const phases = [
    "NonCommencée",
    "InscriptionVotants",
    "InscriptionCandidats",
    "Vote",
    "Résultats",
  ];

  // Fonction de récupération des données depuis le contrat
  const fetchData = useCallback(async () => {
    try {
      // Récupération de la phase actuelle
      const phase = await contract.methods.currentPhase().call();
      const phaseInt = parseInt(phase, 10);
      setPhaseÉlection(phaseInt);

      // Récupération de la liste des candidats
      const candidateCount = await contract.methods.candidateCount().call();
      let listeCandidats = [];
      for (let i = 1; i < candidateCount; i++) {
        const candidat = await contract.methods.getCandidate(i).call();
        listeCandidats.push(candidat);
      }
      setCandidats(listeCandidats);

      // Récupération des informations de l'électeur connecté
      const électeur = await contract.methods.getVoter(account).call();
      setAVoté(électeur.hasVoted);
    } catch (error) {
      console.error("Erreur lors de la récupération des données :", error);
    }
  }, [contract, account]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fonction pour enregistrer le vote d'un candidat
  const voter = async (idCandidat) => {
    try {
      await contract.methods.vote(idCandidat).send({ from: account });
      alert("Vote enregistré !");
      fetchData();
    } catch (error) {
      alert("Erreur lors de l'enregistrement du vote.");
      console.error(error);
    }
  };

  return (
    <Card className="mt-3 p-3">
      <h3 className="text-center">Interface Électeur</h3>
      <p className="text-center">
        <strong>Phase actuelle :</strong>{" "}
        {phaseÉlection !== null ? phases[phaseÉlection] : "Chargement..."}
      </p>
      {phaseÉlection !== 3 && (
        <p className="text-center">
          {phaseÉlection === 4
            ? "L'élection est terminée, voici les résultats."
            : "L'élection n'est pas en phase de vote. Vous ne pouvez pas voter maintenant."}
        </p>
      )}
      {aVoté && <p className="text-center">Vous avez déjà voté.</p>}

      <h4 className="text-center">Liste des candidats</h4>
      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th>ID</th>
            <th>Nom</th>
            <th>Prénom</th>
            <th>Parti Politique</th>
            <th>Âge</th>
            {/* Affiche le nombre de votes seulement en phase "Résultats" */}
            <th>{phaseÉlection === 4 ? "Votes" : "Votes (Cachés)"}</th>
            {phaseÉlection === 3 && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {candidats.map((candidat) => (
            <tr key={candidat.id}>
              <td>{candidat.id}</td>
              <td>{candidat.lastName}</td>
              <td>{candidat.firstName}</td>
              <td>{candidat.politicalParty}</td>
              <td>{candidat.age}</td>
              <td>{phaseÉlection === 4 ? candidat.voteCount : "?"}</td>
              {phaseÉlection === 3 && (
                <td>
                  <Button
                    variant="primary"
                    disabled={aVoté}
                    onClick={() => voter(candidat.id)}
                  >
                    Voter
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
};

export default VoterPanel;
