import logging
import json  # Ajout de l'importation manquante
from serveur import app, db, User, fernet  # Remplacez "serveur" par le nom de votre module

# Configurer les logs
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')

with app.app_context():
    users = User.query.all()
    for user in users:
        try:
            decrypted = fernet.decrypt(user.face_template.encode()).decode()
            data = json.loads(decrypted)
            if isinstance(data, dict) and "embedding" in data:
                # Ne conserver que le vecteur "embedding"
                user.face_template = fernet.encrypt(json.dumps(data["embedding"]).encode()).decode()
                logging.info(f"Migration réussie pour {user.ethereum_address}")
            elif isinstance(data, list):
                logging.info(f"Aucune migration nécessaire pour {user.ethereum_address}")
            else:
                logging.warning(f"Données invalides pour {user.ethereum_address}: {data}")
        except Exception as e:
            logging.error(f"Erreur lors de la migration de {user.ethereum_address}: {str(e)}")
    db.session.commit()