import React, { useRef, useState, useEffect } from "react";
import axios from "axios";
import { FaCamera, FaUserPlus, FaKey, FaArrowLeft } from "react-icons/fa";
import { bufferToBase64, base64ToBuffer } from "../utils";
import API_BASE_URL from "../config";
import { Container, Alert, Button, Form, Card, Spinner } from "react-bootstrap";

const BiometricRegister = ({ ethereumAddress, onRegistered, onBack }) => {
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("danger");
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("voter");
  const [consent, setConsent] = useState(false);
  const [registerMode, setRegisterMode] = useState("standard");

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const isMounted = useRef(true); // Suivre si le composant est monté

  // Nettoyage de la caméra et mise à jour de isMounted au démontage
  useEffect(() => {
    setIsWebAuthnSupported(!!window.PublicKeyCredential);
    return () => {
      isMounted.current = false; // Indique que le composant est démonté
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
        }
      } catch (err) {
        console.error("Erreur lors de l'accès à la caméra", err);
        if (isMounted.current) {
          setMessage("Erreur lors de l'accès à la caméra");
          setMessageType("danger");
        }
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return null;
    const context = canvasRef.current.getContext("2d");
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0, videoRef.current.videoWidth, videoRef.current.videoHeight);
    return canvasRef.current.toDataURL("image/jpeg");
  };

  const handleStandardRegister = async () => {
    if (!ethereumAddress || !role || !consent || !firstName || !lastName) {
      if (isMounted.current) {
        setMessage("Veuillez remplir tous les champs requis.");
        setMessageType("danger");
      }
      return;
    }
    if (!consent) {
      if (isMounted.current) {
        setMessage("Vous devez accepter le traitement des données biométriques.");
        setMessageType("danger");
      }
      return;
    }
    if (isMounted.current) {
      setLoading(true);
      setMessage("");
    }

    const faceImage = captureImage();
    if (!faceImage) {
      if (isMounted.current) {
        setMessage("Erreur lors de la capture d'image.");
        setMessageType("danger");
        setLoading(false);
      }
      return;
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/register`, {
        ethereum_address: ethereumAddress,
        role,
        first_name: firstName,
        last_name: lastName,
        consent,
        face_image: faceImage,
      });

      if (response.data.success) {
        if (isMounted.current) {
          setMessage("Inscription réussie !");
          setMessageType("success");
          stopCamera();
        }
        onRegistered && onRegistered(); // Appel après mise à jour d'état
      } else {
        if (isMounted.current) {
          setMessage(response.data.message || "Erreur lors de l'inscription");
          setMessageType("danger");
        }
      }
    } catch (error) {
      if (isMounted.current) {
        const errorMessage = error.response?.data?.message || "Erreur serveur lors de l'inscription";
        setMessage(errorMessage);
        setMessageType("danger");
        console.error("Erreur inscription:", error);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  const handleWebAuthnRegister = async () => {
    if (!ethereumAddress) {
      if (isMounted.current) {
        setMessage("Adresse Ethereum manquante.");
        setMessageType("danger");
      }
      return;
    }
    if (isMounted.current) {
      setLoading(true);
      setMessage("");
    }

    try {
      const beginResponse = await axios.post(`${API_BASE_URL}/webauthn/register-begin`, {
        ethereum_address: ethereumAddress,
      });

      if (!beginResponse.data) {
        if (isMounted.current) {
          setMessage("Erreur lors de l'initialisation de l'enregistrement WebAuthn");
          setMessageType("danger");
        }
        return;
      }

      const publicKey = {
        ...beginResponse.data,
        challenge: base64ToBuffer(beginResponse.data.challenge),
        user: {
          ...beginResponse.data.user,
          id: base64ToBuffer(beginResponse.data.user.id),
        },
      };

      const credential = await navigator.credentials.create({ publicKey });
      const attestationResponse = {
        id: credential.id,
        rawId: bufferToBase64(credential.rawId),
        response: {
          clientDataJSON: bufferToBase64(credential.response.clientDataJSON),
          attestationObject: bufferToBase64(credential.response.attestationObject),
        },
        type: credential.type,
      };

      const completeResponse = await axios.post(`${API_BASE_URL}/webauthn/register-complete`, {
        ethereum_address: ethereumAddress,
        attestation_response: attestationResponse,
      });

      if (completeResponse.data.success) {
        if (isMounted.current) {
          setMessage("Inscription WebAuthn réussie !");
          setMessageType("success");
        }
        onRegistered && onRegistered();
      } else {
        if (isMounted.current) {
          setMessage(completeResponse.data.message || "Inscription WebAuthn échouée");
          setMessageType("danger");
        }
      }
    } catch (error) {
      if (isMounted.current) {
        const errorMessage = error.response?.data?.message || "Erreur serveur lors de l'inscription WebAuthn";
        setMessage(errorMessage);
        setMessageType("danger");
        console.error("Erreur WebAuthn registration:", error);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
      }
    }
  };

  return (
    <Container
      fluid
      className="d-flex justify-content-center align-items-center position-relative"
      style={{
        minHeight: "100vh",
        backgroundImage: 'url("/Dvote.jpg")',
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Bouton Retour à la page d'accueil en haut à droite */}
      <Button
        variant="outline-light"
        onClick={onBack}
        className="position-absolute top-0 end-0 m-3"
      >
        <FaArrowLeft /> Retour à l'accueil
      </Button>

      <Card style={{ maxWidth: "500px", width: "100%", backgroundColor: "rgba(255,255,255,0.85)", padding: "20px" }}>
        <Card.Body>
          <h2 className="text-center mb-4">Inscription Biométrique</h2>
          {message && (
            <Alert variant={messageType} className="text-center">
              {message}
            </Alert>
          )}
          <Form>
            <Form.Group className="mb-3">
              <Form.Control type="text" placeholder="Adresse Ethereum" value={ethereumAddress} readOnly />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Control
                type="text"
                placeholder="Prénom"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={loading}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Control
                type="text"
                placeholder="Nom"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={loading}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Select value={role} onChange={(e) => setRole(e.target.value)} disabled={loading}>
                <option value="voter">Électeur</option>
                <option value="admin">Administrateur</option>
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Check
                type="checkbox"
                label="J'accepte le traitement de mes données biométriques conformément au RGPD."
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={loading}
              />
            </Form.Group>
            <div className="mb-3">
              <Form.Check
                inline
                type="radio"
                name="registerMode"
                value="standard"
                label="Inscription standard (capture image)"
                checked={registerMode === "standard"}
                onChange={() => setRegisterMode("standard")}
                disabled={loading}
              />
              {isWebAuthnSupported && (
                <Form.Check
                  inline
                  type="radio"
                  name="registerMode"
                  value="webauthn"
                  label="Inscription via WebAuthn (capteur natif)"
                  checked={registerMode === "webauthn"}
                  onChange={() => setRegisterMode("webauthn")}
                  disabled={loading}
                />
              )}
              {!isWebAuthnSupported && (
                <Alert variant="danger">WebAuthn n'est pas supporté par ce navigateur.</Alert>
              )}
            </div>
            {registerMode === "standard" && (
              <div>
                <Button
                  variant="primary"
                  onClick={startCamera}
                  className="mb-3 d-flex align-items-center gap-2"
                  disabled={loading}
                >
                  <FaCamera /> Démarrer la caméra
                </Button>
                <div className="d-flex justify-content-center">
                  <video
                    ref={videoRef}
                    width="320"
                    height="240"
                    autoPlay
                    className="w-100"
                    style={{ maxWidth: "320px", border: "1px solid #ccc" }}
                  />
                  <canvas ref={canvasRef} width="320" height="240" style={{ display: "none" }} />
                </div>
                <Button
                  variant="success"
                  onClick={handleStandardRegister}
                  className="mt-3 w-100 d-flex align-items-center justify-content-center gap-2"
                  disabled={loading}
                >
                  {loading ? <Spinner animation="border" size="sm" /> : <FaUserPlus />}
                  S'inscrire
                </Button>
              </div>
            )}
            {registerMode === "webauthn" && (
              <Button
                variant="success"
                onClick={handleWebAuthnRegister}
                className="mt-3 w-100 d-flex align-items-center justify-content-center gap-2"
                disabled={loading}
              >
                {loading ? <Spinner animation="border" size="sm" /> : <FaKey />}
                S'inscrire via WebAuthn
              </Button>
            )}
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default BiometricRegister;