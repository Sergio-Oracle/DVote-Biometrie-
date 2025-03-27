print("Le script a bien démarré.")

from cryptography.fernet import Fernet

print(Fernet.generate_key().decode())  # Affiche une clé de chiffrement
