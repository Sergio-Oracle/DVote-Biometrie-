import os
import re
import base64
import cv2
import numpy as np
import json
import logging
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from deepface import DeepFace
from cryptography.fernet import Fernet
from dotenv import load_dotenv
from fido2.server import Fido2Server
from fido2.webauthn import PublicKeyCredentialRpEntity
import cbor2 as cbor

# --- Configuration & Logging ---
load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

app = Flask(__name__)

# Configuration CORS explicite pour autoriser le frontend
CORS(app, resources={
    r"/*": {
        "origins": ["https://localhost:3000", "https://192.168.56.1:3000", "http://localhost:3000"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True
    }
})

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv("DATABASE_URL")
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.secret_key = os.getenv("FLASK_SECRET_KEY", "mysecret")
app.permanent_session_lifetime = timedelta(minutes=10)

db = SQLAlchemy(app)
migrate = Migrate(app, db)

# Initialisation de Fernet pour chiffrer/déchiffrer les templates biométriques
FERNET_KEY = os.getenv("FERNET_KEY").encode()
fernet = Fernet(FERNET_KEY)

# --- Modèle de données ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ethereum_address = db.Column(db.String(42), unique=True, nullable=False)
    role = db.Column(db.String(10), nullable=False)  # "admin" ou "voter"
    first_name = db.Column(db.String(50))
    last_name = db.Column(db.String(50))
    consent = db.Column(db.Boolean, default=False)
    face_template = db.Column(db.Text)  # Template chiffré (embedding JSON)
    webauthn_credentials = db.Column(db.Text)  # Stockage des credentials WebAuthn (JSON)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "ethereum_address": self.ethereum_address,
            "role": self.role,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "consent": self.consent,
            "created_at": self.created_at.isoformat()
        }

# --- Fonctions utilitaires ---
def is_valid_ethereum_address(address):
    return bool(re.match(r"^0x[a-fA-F0-9]{40}$", address))

def is_valid_image_data(image_data):
    valid_prefixes = ("data:image/jpeg;base64,", "data:image/png;base64,")
    if any(image_data.startswith(prefix) for prefix in valid_prefixes):
        try:
            b64_part = image_data.split(",")[1]
            decoded = base64.b64decode(b64_part)
            if len(decoded) < 1024 or len(decoded) > 5 * 1024 * 1024:
                return False
            return True
        except Exception as e:
            logging.error("Erreur lors du décodage de l'image : %s", e)
            return False
    return False

def set_session_state(key, state):
    session[key] = {
        "state": state,
        "timestamp": datetime.utcnow().timestamp()
    }

def get_session_state(key, max_age_seconds=600):
    data = session.get(key)
    if not data or datetime.utcnow().timestamp() - data["timestamp"] > max_age_seconds:
        session.pop(key, None)
        return None
    return data["state"]

# --- Gestion explicite des requêtes OPTIONS ---
@app.route('/register', methods=['OPTIONS'])
@app.route('/verify-face', methods=['OPTIONS'])
@app.route('/webauthn/register-begin', methods=['OPTIONS'])
@app.route('/webauthn/register-complete', methods=['OPTIONS'])
@app.route('/webauthn/authenticate-begin', methods=['OPTIONS'])
@app.route('/webauthn/authenticate-complete', methods=['OPTIONS'])
def options_handler():
    origin = request.headers.get("Origin")
    allowed_origins = ["https://localhost:3000", "https://192.168.56.1:3000", "http://localhost:3000"]
    if origin not in allowed_origins:
        return jsonify({"success": False, "message": "Origine non autorisée"}), 403

    response = jsonify({"success": True})
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Max-Age"] = "86400"
    return response, 200

# --- Enregistrement par reconnaissance faciale ---
@app.route('/register', methods=['POST'])
def register():
    try:
        data = request.json
        required_fields = ["ethereum_address", "role", "consent", "face_image"]
        if not all(field in data for field in required_fields):
            return jsonify({"success": False, "message": "Données manquantes"}), 400

        ethereum_address = data["ethereum_address"]
        if not is_valid_ethereum_address(ethereum_address):
            return jsonify({"success": False, "message": "Adresse Ethereum invalide"}), 400

        if not is_valid_image_data(data["face_image"]):
            return jsonify({"success": False, "message": "Format ou taille d'image incorrect"}), 400

        user = User.query.filter_by(ethereum_address=ethereum_address).first()
        if user:
            return jsonify({"success": False, "message": "Utilisateur déjà enregistré"}), 400

        face_image_b64 = data["face_image"]
        img_data = base64.b64decode(face_image_b64.split(",")[1])
        np_arr = np.frombuffer(img_data, np.uint8)
        face_image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if face_image is None:
            raise ValueError("Impossible de décoder l'image faciale")

        face_embedding = DeepFace.represent(face_image, model_name='Facenet', enforce_detection=True)
        face_embedding_str = json.dumps(face_embedding)
        encrypted_face = fernet.encrypt(face_embedding_str.encode()).decode()

        user = User(
            ethereum_address=ethereum_address,
            role=data["role"],
            first_name=data.get("first_name", ""),
            last_name=data.get("last_name", ""),
            consent=data["consent"],
            face_template=encrypted_face,
            webauthn_credentials=""
        )
        db.session.add(user)
        db.session.commit()

        response = jsonify({"success": True, "message": "Utilisateur enregistré", "user": user.to_dict()})
        response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "https://localhost:3000")
        return response, 201

    except ValueError as e:
        db.session.rollback()
        logging.error("Erreur de valeur : %s", str(e))
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        db.session.rollback()
        logging.error("Erreur lors de l'enregistrement : %s", str(e))
        return jsonify({"success": False, "message": f"Erreur serveur : {str(e)}"}), 500

# --- Vérification par reconnaissance faciale ---
@app.route('/verify-face', methods=['POST'])
def verify_face():
    try:
        data = request.json
        ethereum_address = data.get("ethereum_address")
        face_image_b64 = data.get("face_image")
        if not ethereum_address or not face_image_b64:
            return jsonify({"success": False, "message": "Données manquantes"}), 400

        if not is_valid_ethereum_address(ethereum_address):
            return jsonify({"success": False, "message": "Adresse Ethereum invalide"}), 400

        if not is_valid_image_data(face_image_b64):
            return jsonify({"success": False, "message": "Format ou taille d'image incorrect"}), 400

        user = User.query.filter_by(ethereum_address=ethereum_address).first()
        if not user or not user.face_template:
            return jsonify({"success": False, "message": "Utilisateur non trouvé ou non enregistré"}), 404

        decrypted_face = fernet.decrypt(user.face_template.encode()).decode()
        stored_embedding = json.loads(decrypted_face)

        img_data = base64.b64decode(face_image_b64.split(",")[1])
        np_arr = np.frombuffer(img_data, np.uint8)
        face_image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if face_image is None:
            raise ValueError("Impossible de décoder l'image faciale")

        new_embedding = DeepFace.represent(face_image, model_name='Facenet', enforce_detection=True)
        result = DeepFace.verify(img1_representation=stored_embedding, img2_representation=new_embedding)
        response = jsonify({"success": result.get("verified"), "message": "Authentification faciale réussie" if result.get("verified") else "Visage non reconnu"})
        response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "https://localhost:3000")
        return response, 200 if result.get("verified") else 401

    except ValueError as e:
        logging.error("Erreur de valeur : %s", str(e))
        return jsonify({"success": False, "message": str(e)}), 400
    except Exception as e:
        logging.error("Erreur lors de la vérification faciale : %s", str(e))
        return jsonify({"success": False, "message": f"Erreur serveur : {str(e)}"}), 500

# --- WebAuthn pour le capteur d'empreintes natif ---
rp = PublicKeyCredentialRpEntity("example.com", "My WebAuthn App")
fido_server = Fido2Server(rp)

@app.route('/webauthn/register-begin', methods=['POST'])
def webauthn_register_begin():
    try:
        data = request.json
        ethereum_address = data.get("ethereum_address")
        if not ethereum_address or not is_valid_ethereum_address(ethereum_address):
            return jsonify({"success": False, "message": "Adresse Ethereum invalide ou manquante"}), 400

        user = User.query.filter_by(ethereum_address=ethereum_address).first()
        if not user:
            return jsonify({"success": False, "message": "Utilisateur non trouvé"}), 404

        user_info = {
            "id": user.id.to_bytes(16, 'big'),
            "name": user.ethereum_address,
            "displayName": f"{user.first_name} {user.last_name}"
        }
        existing_credentials = []
        if user.webauthn_credentials:
            existing_credentials = json.loads(user.webauthn_credentials)
            existing_credentials = [{
                "id": bytes.fromhex(cred["credential_id"]),
                "publicKey": base64.b64decode(cred["public_key"]),
                "signCount": cred["sign_count"]
            } for cred in existing_credentials]

        registration_data, state = fido_server.register_begin(user_info, existing_credentials, user_verification="required")
        set_session_state("registration_state", state)
        response = jsonify(registration_data)
        response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "https://localhost:3000")
        return response, 200

    except Exception as e:
        logging.error("Erreur lors du début de l'enregistrement WebAuthn : %s", str(e))
        return jsonify({"success": False, "message": f"Erreur serveur : {str(e)}"}), 500

@app.route('/webauthn/register-complete', methods=['POST'])
def webauthn_register_complete():
    try:
        data = request.get_json()
        state = get_session_state("registration_state")
        if not state:
            return jsonify({"success": False, "message": "State introuvable ou expiré"}), 400

        attestation_response = data.get("attestation_response")
        credential = fido_server.register_complete(state, attestation_response)

        ethereum_address = data.get("ethereum_address")
        user = User.query.filter_by(ethereum_address=ethereum_address).first()
        if not user:
            return jsonify({"success": False, "message": "Utilisateur non trouvé"}), 404

        creds = []
        if user.webauthn_credentials:
            creds = json.loads(user.webauthn_credentials)
        creds.append({
            "credential_id": credential.credential_id.hex(),
            "public_key": base64.b64encode(credential.public_key).decode(),
            "sign_count": credential.sign_count
        })
        user.webauthn_credentials = json.dumps(creds)
        db.session.commit()
        response = jsonify({"success": True, "message": "Attestation vérifiée"})
        response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "https://localhost:3000")
        return response, 200

    except Exception as e:
        db.session.rollback()
        logging.error("Erreur lors de la complétion de l'enregistrement WebAuthn : %s", str(e))
        return jsonify({"success": False, "message": f"Erreur serveur : {str(e)}"}), 500

@app.route('/webauthn/authenticate-begin', methods=['POST'])
def webauthn_authenticate_begin():
    try:
        data = request.json
        ethereum_address = data.get("ethereum_address")
        if not ethereum_address or not is_valid_ethereum_address(ethereum_address):
            return jsonify({"success": False, "message": "Adresse Ethereum invalide ou manquante"}), 400

        user = User.query.filter_by(ethereum_address=ethereum_address).first()
        if not user or not user.webauthn_credentials:
            return jsonify({"success": False, "message": "Utilisateur non trouvé ou aucune credential enregistrée"}), 404

        stored_creds = json.loads(user.webauthn_credentials)
        allowed_credentials = [{
            "id": bytes.fromhex(cred["credential_id"]),
            "type": "public-key"
        } for cred in stored_creds]

        auth_data, state = fido_server.authenticate_begin(allowed_credentials, user_verification="required")
        set_session_state("authentication_state", state)
        response = jsonify(auth_data)
        response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "https://localhost:3000")
        return response, 200

    except Exception as e:
        logging.error("Erreur lors du début de l'authentification WebAuthn : %s", str(e))
        return jsonify({"success": False, "message": f"Erreur serveur : {str(e)}"}), 500

@app.route('/webauthn/authenticate-complete', methods=['POST'])
def webauthn_authenticate_complete():
    try:
        data = request.json
        state = get_session_state("authentication_state")
        if not state:
            return jsonify({"success": False, "message": "State introuvable ou expiré"}), 400

        ethereum_address = data.get("ethereum_address")
        user = User.query.filter_by(ethereum_address=ethereum_address).first()
        if not user or not user.webauthn_credentials:
            return jsonify({"success": False, "message": "Utilisateur non trouvé ou aucune credential enregistrée"}), 404

        stored_creds = json.loads(user.webauthn_credentials)
        allowed_credentials = [{
            "id": bytes.fromhex(cred["credential_id"]),
            "publicKey": base64.b64decode(cred["public_key"]),
            "signCount": cred["sign_count"]
        } for cred in stored_creds]

        assertion_response = data.get("assertion_response")
        credential = fido_server.authenticate_complete(state, allowed_credentials, assertion_response)

        for cred in stored_creds:
            if cred["credential_id"] == credential.credential_id.hex():
                cred["sign_count"] = credential.sign_count
                break
        user.webauthn_credentials = json.dumps(stored_creds)
        db.session.commit()
        response = jsonify({"success": True, "message": "Assertion vérifiée"})
        response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "https://localhost:3000")
        return response, 200

    except Exception as e:
        db.session.rollback()
        logging.error("Erreur lors de la complétion de l'authentification WebAuthn : %s", str(e))
        return jsonify({"success": False, "message": f"Erreur serveur : {str(e)}"}), 500

@app.route('/verify-fingerprint', methods=['POST'])
def verify_fingerprint():
    response = jsonify({
        "success": False,
        "message": "L'authentification par empreinte digitale est gérée via WebAuthn. Utilisez les endpoints WebAuthn."
    })
    response.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "https://localhost:3000")
    return response, 400

# --- Exécution du serveur avec HTTPS/SSL ---
if __name__ == '__main__':
    ssl_cert = "cert.pem"
    ssl_key = "key.pem"
    if os.path.exists(ssl_cert) and os.path.exists(ssl_key):
        app.run(host="0.0.0.0", port=5000, ssl_context=(ssl_cert, ssl_key), debug=True)
    else:
        logging.error("Certificats SSL (cert.pem ou key.pem) introuvables. Générez-les avec OpenSSL.")
        raise FileNotFoundError("Certificats SSL manquants. Exécutez 'openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes'")