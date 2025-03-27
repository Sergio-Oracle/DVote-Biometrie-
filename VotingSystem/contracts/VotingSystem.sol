// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title VotingSystem
 * @dev Un système de vote décentralisé pour gérer une élection en plusieurs phases.
 */
contract VotingSystem is ReentrancyGuard {
    // Structure pour représenter un candidat
    struct Candidate {
        uint256 id;
        string firstName;
        string lastName;
        address addressCandidate;
        string certificationCode;
        string politicalParty; // nouveau champ : partie politique
        uint256 age;           // nouveau champ : age
        uint256 voteCount;
    }

    // Structure pour représenter un électeur
    struct Voter {
        uint256 id;
        string firstName;
        string lastName;
        address addressVoter;
        string idCardNumber; // nouveau champ : numéro de carte d'identité
        uint256 age;         // nouveau champ : age
        bool hasVoted;
    }

    // Mappings pour stocker les candidats et les électeurs
    mapping(uint256 => Candidate) public candidates;
    mapping(address => Voter) public voters;

    // Tableau pour stocker les adresses des électeurs
    address[] public voterAddresses;

    // Variables d'état
    uint256 public totalVotes;
    uint256 public candidateCount;
    uint256 public voterCount;
    uint256 public winnerCandidateId; // ID du gagnant

    // Enumération pour les phases de l'élection
    enum ElectionPhase { NotStarted, VoterRegistration, CandidateRegistration, Voting, Results }
    ElectionPhase public currentPhase;

    // Événements
    event CandidateAdded(
        uint256 id,
        string firstName,
        string lastName,
        address addressCandidate,
        string certificationCode,
        string politicalParty,
        uint256 age
    );
    event VoterAdded(
        uint256 id,
        string firstName,
        string lastName,
        address addressVoter,
        string idCardNumber,
        uint256 age
    );
    event VoteCast(uint256 candidateId);
    event ElectionPhaseChanged(ElectionPhase phase);
    event WinnerDeclared(uint256 winnerId, string firstName, string lastName, uint256 voteCount);

    // Adresse de l'administrateur
    address public admin;

    // Modificateur pour restreindre l'accès à l'administrateur
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action.");
        _;
    }

    // Modificateur pour s'assurer que l'action se fait durant une phase spécifique
    modifier onlyDuringPhase(ElectionPhase phase) {
        require(currentPhase == phase, "This action is not allowed in the current phase.");
        _;
    }

    // Modificateur pour s'assurer que l'appelant est un électeur enregistré
    modifier onlyRegisteredVoter() {
        require(voters[msg.sender].id != 0, "You are not a registered voter.");
        _;
    }

    constructor() {
        admin = msg.sender;
        candidateCount = 1;
        voterCount = 1;
        currentPhase = ElectionPhase.NotStarted;
    }

    /**
     * @dev Démarre l'élection en passant à la phase d'enregistrement des électeurs.
     */
    function startElection() public onlyAdmin onlyDuringPhase(ElectionPhase.NotStarted) {
        currentPhase = ElectionPhase.VoterRegistration;
        emit ElectionPhaseChanged(currentPhase);
    }

    /**
     * @dev Passe à la phase suivante de l'élection.
     */
    function nextPhase() public onlyAdmin {
        require(currentPhase != ElectionPhase.Results, "Election has already ended.");

        if (currentPhase == ElectionPhase.VoterRegistration) {
            currentPhase = ElectionPhase.CandidateRegistration;
        } else if (currentPhase == ElectionPhase.CandidateRegistration) {
            currentPhase = ElectionPhase.Voting;
        } else if (currentPhase == ElectionPhase.Voting) {
            currentPhase = ElectionPhase.Results;
            declareWinner(); // Déclaration du gagnant lors de la transition vers Results
        }

        emit ElectionPhaseChanged(currentPhase);
    }

    /**
     * @dev Ajoute un électeur pendant la phase d'enregistrement des électeurs.
     */
    function addVoter(
        address _voterAddress, 
        string memory _firstName, 
        string memory _lastName,
        string memory _idCardNumber,
        uint256 _age
    ) 
        public 
        onlyAdmin 
        onlyDuringPhase(ElectionPhase.VoterRegistration)
    {
        require(voters[_voterAddress].id == 0, "Voter already registered.");

        voters[_voterAddress] = Voter(voterCount, _firstName, _lastName, _voterAddress, _idCardNumber, _age, false);
        voterAddresses.push(_voterAddress);
        emit VoterAdded(voterCount, _firstName, _lastName, _voterAddress, _idCardNumber, _age);
        voterCount++;
    }
    
    /**
     * @dev Ajoute plusieurs électeurs simultanément via des tableaux (bulk registration).
     */
    function addVotersBulk(
        address[] memory _voterAddresses,
        string[] memory _firstNames,
        string[] memory _lastNames,
        string[] memory _idCardNumbers,
        uint256[] memory _ages
    ) public onlyAdmin onlyDuringPhase(ElectionPhase.VoterRegistration) {
        require(
            _voterAddresses.length == _firstNames.length &&
            _firstNames.length == _lastNames.length &&
            _lastNames.length == _idCardNumbers.length &&
            _idCardNumbers.length == _ages.length,
            "Les tableaux doivent avoir la meme taille."
        );
        for (uint256 i = 0; i < _voterAddresses.length; i++) {
            require(voters[_voterAddresses[i]].id == 0, "Voter already registered.");
            voters[_voterAddresses[i]] = Voter(voterCount, _firstNames[i], _lastNames[i], _voterAddresses[i], _idCardNumbers[i], _ages[i], false);
            voterAddresses.push(_voterAddresses[i]);
            emit VoterAdded(voterCount, _firstNames[i], _lastNames[i], _voterAddresses[i], _idCardNumbers[i], _ages[i]);
            voterCount++;
        }
    }

    /**
     * @dev Ajoute un candidat pendant la phase d'enregistrement des candidats.
     */
    function addCandidate(
        string memory _firstName, 
        string memory _lastName, 
        address _addressCandidate, 
        string memory _certificationCode,
        string memory _politicalParty,
        uint256 _age
    ) 
        public 
        onlyAdmin 
        onlyDuringPhase(ElectionPhase.CandidateRegistration)
    {
        candidates[candidateCount] = Candidate(
            candidateCount, 
            _firstName, 
            _lastName, 
            _addressCandidate, 
            _certificationCode, 
            _politicalParty, 
            _age, 
            0
        );
        emit CandidateAdded(candidateCount, _firstName, _lastName, _addressCandidate, _certificationCode, _politicalParty, _age);
        candidateCount++;
    }
    
    /**
     * @dev Ajoute plusieurs candidats simultanément via des tableaux (bulk registration).
     */
    function addCandidatesBulk(
        string[] memory _firstNames,
        string[] memory _lastNames,
        address[] memory _addressCandidates,
        string[] memory _certificationCodes,
        string[] memory _politicalParties,
        uint256[] memory _ages
    ) public onlyAdmin onlyDuringPhase(ElectionPhase.CandidateRegistration) {
        require(
            _firstNames.length == _lastNames.length &&
            _lastNames.length == _addressCandidates.length &&
            _addressCandidates.length == _certificationCodes.length &&
            _certificationCodes.length == _politicalParties.length &&
            _politicalParties.length == _ages.length,
            "Les tableaux doivent avoir la meme taille."
        );
        for (uint256 i = 0; i < _firstNames.length; i++) {
            candidates[candidateCount] = Candidate(
                candidateCount,
                _firstNames[i],
                _lastNames[i],
                _addressCandidates[i],
                _certificationCodes[i],
                _politicalParties[i],
                _ages[i],
                0
            );
            emit CandidateAdded(candidateCount, _firstNames[i], _lastNames[i], _addressCandidates[i], _certificationCodes[i], _politicalParties[i], _ages[i]);
            candidateCount++;
        }
    }

    /**
     * @dev Permet à un électeur enregistré de voter pour un candidat pendant la phase de vote.
     */
    function vote(uint256 _candidateId) 
        public 
        onlyRegisteredVoter 
        onlyDuringPhase(ElectionPhase.Voting) 
        nonReentrant
    {
        require(!voters[msg.sender].hasVoted, "You have already voted.");
        require(_candidateId > 0 && _candidateId < candidateCount, "Candidate does not exist.");

        voters[msg.sender].hasVoted = true;
        candidates[_candidateId].voteCount += 1;
        totalVotes += 1;
        emit VoteCast(_candidateId);
    }

    /**
     * @dev Récupère les informations d'un candidat.
     */
    function getCandidate(uint256 _id) public view returns (Candidate memory) {
        require(_id > 0 && _id < candidateCount, "Candidate does not exist.");
        return candidates[_id];
    }

    /**
     * @dev Récupère les informations d'un électeur.
     */
    function getVoter(address _voterAddress) public view returns (Voter memory) {
        require(voters[_voterAddress].id != 0, "Voter not found.");
        return voters[_voterAddress];
    }

    /**
     * @dev Récupère les résultats de l'élection une fois celle-ci terminée.
     */
    function getResults() public view onlyDuringPhase(ElectionPhase.Results) returns (Candidate[] memory) {
        // On ignore l'indice 0 car les IDs commencent à 1
        Candidate[] memory results = new Candidate[](candidateCount - 1);
        for (uint256 i = 1; i < candidateCount; i++) {
            results[i - 1] = candidates[i];
        }
        return results;
    }

    /**
     * @dev Récupère la liste des adresses des électeurs enregistrés.
     */
    function getVoterAddresses() public view returns (address[] memory) {
        return voterAddresses;
    }
    
    /**
     * @dev Réinitialise l'élection en supprimant les candidats, électeurs et en réinitialisant les compteurs.
     *      Cette fonction ne peut être appelée que par l'administrateur et lorsque l'élection est terminée (phase Results).
     */
    function resetElection() public onlyAdmin onlyDuringPhase(ElectionPhase.Results) {
        // Réinitialisation des électeurs
        for (uint256 i = 0; i < voterAddresses.length; i++) {
            delete voters[voterAddresses[i]];
        }
        delete voterAddresses; // Réinitialise le tableau des électeurs
        
        // Réinitialisation des candidats
        for (uint256 i = 1; i < candidateCount; i++) {
            delete candidates[i];
        }
        
        // Réinitialisation des compteurs et du total des votes
        totalVotes = 0;
        candidateCount = 1;
        voterCount = 1;
        currentPhase = ElectionPhase.NotStarted;
        emit ElectionPhaseChanged(currentPhase);
    }
    
    /**
     * @dev Déclare le gagnant de l'élection lors de la phase des résultats.
     */
    function declareWinner() internal onlyDuringPhase(ElectionPhase.Results) {
        uint256 highestVotes = 0;
        uint256 winningCandidateId = 0;
        for (uint256 i = 1; i < candidateCount; i++) {
            if (candidates[i].voteCount > highestVotes) {
                highestVotes = candidates[i].voteCount;
                winningCandidateId = i;
            }
        }
        winnerCandidateId = winningCandidateId;
        emit WinnerDeclared(winningCandidateId, candidates[winningCandidateId].firstName, candidates[winningCandidateId].lastName, highestVotes);
    }
}
