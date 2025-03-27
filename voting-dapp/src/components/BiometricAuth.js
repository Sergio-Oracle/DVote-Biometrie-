import React, { useRef, useState, useEffect, useCallback } from "react";
import axios from "axios";
import { FaUserCheck, FaRegIdBadge, FaArrowLeft } from "react-icons/fa";
import { Container, Alert, Button, Form, Card, Spinner } from "react-bootstrap";
import API_BASE_URL from "../config";

const BiometricAuth = ({ ethereumAddress, onSuccess, onBack }) => {
  const [mode, setMode] = useState("webauthn");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("danger");
  const [isWebAuthnSupported, setIsWebAuthnSupported] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [failureCount, setFailureCount] = useState(0);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null); // Référence pour stocker l'intervalle

  // Vérifie si WebAuthn est supporté et nettoie au démontage
  useEffect(() => {
    setIsWebAuthnSupported(!!window.PublicKeyCredential);
    return () => {
      stopCamera();
      if (intervalRef.current) clearInterval(intervalRef.current); // Nettoie l'intervalle
    };
  }, []);

  // Fonction pour capturer et authentifier (avec useCallback pour éviter les re-déclarations)
  const captureAndAuthenticate = useCallback(async () => {
    if (isAuthenticated || !ethereumAddress || failureCount >= 5) return;

    const imageData = captureImage();
    if (!imageData) {
      setMessage("Erreur lors de la capture d'image.");
      setMessageType("danger");
      setFailureCount((prev) => prev + 1);
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const payload = { ethereum_address: ethereumAddress, face_image: imageData };
      const response = await axios.post(`${API_BASE_URL}/verify-face`, payload);
      if (response.data.success) {
        setIsAuthenticated(true);
        setMessage("Authentification réussie !");
        setMessageType("success");
        setFailureCount(0);
        stopCamera();
        if (intervalRef.current) clearInterval(intervalRef.current); // Arrête l'intervalle après succès
        onSuccess(response.data.role); // Appelé après avoir tout nettoyé
      } else {
        setMessage(response.data.message || "Visage non reconnu");
        setMessageType("danger");
        setFailureCount((prev) => prev + 1);
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || "Erreur serveur lors de l'authentification";
      setMessage(errorMessage);
      setMessageType("danger");
      setFailureCount((prev) => prev + 1);
      console.error("Erreur authentification:", error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, ethereumAddress, failureCount, onSuccess]);

  // Gestion de la caméra et de l'intervalle pour la reconnaissance faciale
  useEffect(() => {
    if (mode === "face" && !isAuthenticated) {
      startCamera();
      intervalRef.current = setInterval(() => {
        if (failureCount < 5) {
          captureAndAuthenticate();
        } else {
          setMessage("Trop de tentatives échouées. Réessayez plus tard.");
          setMessageType("danger");
          clearInterval(intervalRef.current);
          stopCamera();
        }
      }, 3000);
    }
    // Nettoyage au changement de mode ou démontage
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [mode, isAuthenticated, captureAndAuthenticate, failureCount]);

  // Démarre la caméra
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
        setMessage("Erreur lors de l'accès à la caméra");
        setMessageType("danger");
      }
    }
  };

  // Arrête la caméra
  const stopCamera = () => {
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    }
  };

  // Capture une image depuis la vidéo
  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current || videoRef.current.readyState !== 4) return null;
    const context = canvasRef.current.getContext("2d");
    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0, videoRef.current.videoWidth, videoRef.current.videoHeight);
    return canvasRef.current.toDataURL("image/jpeg");
  };

  // Gestion de WebAuthn (enregistrement et authentification) reste inchangée ici
  const handleWebAuthnRegister = async () => {
    setLoading(true);
    setMessage("");
    try {
      const beginResponse = await axios.post(`${API_BASE_URL}/webauthn/register-begin`, {
        ethereum_address: ethereumAddress,
      });
      const publicKey = preformatMakeCredReq(beginResponse.data);
      const credential = await navigator.credentials.create({ publicKey });
      const attestationResponse = publicKeyCredentialToJSON(credential);
      const completeResponse = await axios.post(`${API_BASE_URL}/webauthn/register-complete`, {
        ethereum_address: ethereumAddress,
        attestation_response: attestationResponse,
      });
      if (completeResponse.data.success) {
        setMessage("Enregistrement WebAuthn réussi !");
        setMessageType("success");
      } else {
        setMessage(completeResponse.data.message);
        setMessageType("danger");
      }
    } catch (error) {
      setMessage(error.response?.data?.message || "Erreur serveur lors de l'enregistrement WebAuthn");
      setMessageType("danger");
      console.error("Erreur WebAuthn (register):", error);
    } finally {
      setLoading(false);
    }
  };

  const handleWebAuthnAuthenticate = async () => {
    setLoading(true);
    setMessage("");
    try {
      const beginResponse = await axios.post(`${API_BASE_URL}/webauthn/authenticate-begin`, {
        ethereum_address: ethereumAddress,
      });
      const publicKey = preformatGetRequest(beginResponse.data);
      const credential = await navigator.credentials.get({ publicKey });
      const assertionResponse = publicKeyCredentialToJSON(credential);
      const completeResponse = await axios.post(`${API_BASE_URL}/webauthn/authenticate-complete`, {
        ethereum_address: ethereumAddress,
        assertion_response: assertionResponse,
      });
      if (completeResponse.data.success) {
        setIsAuthenticated(true);
        setMessage("Authentification WebAuthn réussie !");
        setMessageType("success");
        onSuccess(completeResponse.data.role);
      } else {
        setMessage(completeResponse.data.message);
        setMessageType("danger");
      }
    } catch (error) {
      setMessage(error.response?.data?.message || "Erreur serveur lors de l'authentification WebAuthn");
      setMessageType("danger");
      console.error("Erreur WebAuthn (authenticate):", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container
      fluid
      className="d-flex flex-column justify-content-center align-items-center"
      style={{
        minHeight: "100vh",
        backgroundImage: 'url("/Dvote.jpg")',
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div
        style={{
          display: loading ? "block" : "none",
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "rgba(0,0,0,0.5)",
          zIndex: 9999,
        }}
      >
        <Spinner
          animation="border"
          variant="light"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        />
      </div>

      <Card style={{ maxWidth: "500px", width: "100%", backgroundColor: "rgba(255,255,255,0.85)", padding: "20px" }}>
        <Card.Body>
          <div className="d-flex justify-content-end mb-3">
            <Button variant="outline-secondary" onClick={onBack}>
              <FaArrowLeft /> Retour à l'accueil
            </Button>
          </div>

          <h4 className="text-center mb-4">Authentification Biométrique</h4>
          {message && (
            <Alert variant={messageType} className="text-center">
              {message}
            </Alert>
          )}
          <Form>
            <div className="d-flex justify-content-center mb-4">
              <Form.Check
                inline
                type="radio"
                name="mode"
                value="webauthn"
                label="WebAuthn"
                checked={mode === "webauthn"}
                onChange={() => setMode("webauthn")}
                disabled={loading}
              />
              {isWebAuthnSupported && (
                <Form.Check
                  inline
                  type="radio"
                  name="mode"
                  value="face"
                  label="Reconnaissance faciale"
                  checked={mode === "face"}
                  onChange={() => setMode("face")}
                  disabled={loading}
                />
              )}
            </div>
            {mode === "webauthn" && (
              <div className="text-center">
                <Button
                  variant="primary"
                  onClick={handleWebAuthnRegister}
                  className="mt-3"
                  disabled={loading}
                >
                  {loading ? <Spinner animation="border" size="sm" /> : <FaRegIdBadge />}
                </Button>
                <Button
                  variant="success"
                  onClick={handleWebAuthnAuthenticate}
                  className="mt-3 ms-3"
                  disabled={loading}
                >
                  {loading ? <Spinner animation="border" size="sm" /> : <FaUserCheck />}
                </Button>
              </div>
            )}
            {mode === "face" && (
              <div className="text-center">
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
                <p>Authentification automatique en cours...</p>
              </div>
            )}
          </Form>
        </Card.Body>
      </Card>
    </Container>
  );
};

// Fonctions utilitaires pour WebAuthn (non modifiées)
function bufferDecode(value) {
  return Uint8Array.from(window.atob(value), (c) => c.charCodeAt(0));
}

function publicKeyCredentialToJSON(pubKeyCred) {
  if (pubKeyCred instanceof Array) return pubKeyCred.map(publicKeyCredentialToJSON);
  if (pubKeyCred instanceof ArrayBuffer)
    return btoa(String.fromCharCode.apply(null, new Uint8Array(pubKeyCred)));
  if (pubKeyCred && typeof pubKeyCred === "object") {
    const obj = {};
    for (let key in pubKeyCred) obj[key] = publicKeyCredentialToJSON(pubKeyCred[key]);
    return obj;
  }
  return pubKeyCred;
}

function preformatGetRequest(getOptions) {
  getOptions.challenge = bufferDecode(getOptions.challenge);
  if (getOptions.allowCredentials) {
    getOptions.allowCredentials = getOptions.allowCredentials.map((cred) => {
      cred.id = bufferDecode(cred.id);
      return cred;
    });
  }
  return getOptions;
}

function preformatMakeCredReq(makeCredReq) {
  makeCredReq.challenge = bufferDecode(makeCredReq.challenge);
  makeCredReq.user.id = bufferDecode(makeCredReq.user.id);
  return makeCredReq;
}

export default BiometricAuth;