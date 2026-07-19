# Guide d'Utilisation et de Démarrage - mePOS Inventory Intel

Ce document contient toutes les étapes nécessaires pour installer, configurer, lancer et tester l'ensemble du projet **mePOS Inventory Intel**.

---

## 📋 Table des Matières
1. [Prérequis](#1-prérequis)
2. [Structure du Projet](#2-structure-du-projet)
3. [Étape 1 : Lancement de la Base de Données (PostgreSQL)](#étape-1--lancement-de-la-base-de-données-postgresql)
4. [Étape 2 : Configuration et Lancement du Backend](#étape-2--configuration-et-lancement-du-backend)
5. [Étape 3 : Configuration et Lancement du Frontend](#étape-3--configuration-et-lancement-du-frontend)
6. [Étape 4 : Lancement de l'Agent de Synchronisation (Legacy POS)](#étape-4--lancement-de-lagent-de-synchronisation-legacy-pos)
7. [👥 Comptes de Test et Rôles](#-comptes-de-test-et-rôles)
8. [🧪 Scénarios de Test et Validation des Fonctionnalités](#-scénarios-de-test-et-validation-des-fonctionnalités)

---

## 1. Prérequis

Avant de commencer, assurez-vous d'avoir installé les outils suivants sur votre machine :
* [Node.js](https://nodejs.org/) (version 18 ou supérieure recommandée)
* [npm](https://www.npmjs.com/) (installé automatiquement avec Node.js)
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) *(optionnel, recommandé pour faire tourner PostgreSQL)*
* [Python 3](https://www.python.org/) *(uniquement si vous souhaitez utiliser l'agent de synchronisation en version Python)*

---

## 2. Structure du Projet

```
restaurant/
├── docker-compose.yml         # Conteneur PostgreSQL local
├── architecture.md            # Spécifications techniques et schéma DDL
├── INSTRUCTIONS.md            # Ce fichier (Guide de démarrage)
│
├── backend/                   # API Express + TypeScript
│   ├── src/
│   │   ├── index.ts           # Point d'entrée principal
│   │   ├── database.ts        # Gestion PostgreSQL & Mode Démo (In-Memory)
│   │   └── schema.ts          # Migration DDL et chargement des données de test (Seeds)
│   ├── .env                   # Configuration du backend (Ports, clé API, URL DB)
│   └── package.json
│
├── frontend/                  # Interface utilisateur React + Vite + TS
│   ├── src/
│   │   ├── App.tsx            # Navigation et gestion d'état globale
│   │   ├── index.css          # Thème CSS HSL premium (Tactile & sombre)
│   │   └── views/             # Différents onglets de l'application
│   └── package.json
│
└── agent/                     # Agents de simulation de caisse tactile
    ├── local_sales_db.json    # Base de ventes simulée (JSON pour Node.js)
    ├── sync_agent.js          # Agent de synchronisation écrit en Node.js
    ├── setup_local_db.py      # Script d'init DB SQLite (pour Python)
    └── sync_agent.py          # Agent de synchronisation écrit en Python
```

---

## Étape 1 : Lancement de la Base de Données (PostgreSQL)

Le projet supporte deux modes de fonctionnement :
1. **Mode PostgreSQL (Recommandé - Persistant)** : Utilise une base de données PostgreSQL (lancée idéalement via Docker).
2. **Mode Démo (Fallback automatique)** : Si PostgreSQL n'est pas actif, le backend démarre automatiquement en **Mode Démo** (base de données en mémoire vive). Les modifications ne seront pas sauvegardées au redémarrage, mais toutes les fonctionnalités restent 100% opérationnelles.

### Option A : Lancer PostgreSQL via Docker (Recommandé)
Ouvrez un terminal dans le dossier racine du projet (`restaurant/`) et lancez :
```bash
docker-compose up -d
```
Cela va démarrer un conteneur PostgreSQL sur le port `5432` avec les identifiants configurés par défaut.

---

## Étape 2 : Configuration et Lancement du Backend

Le backend est une API REST développée en Node.js, Express et TypeScript.

### 1. Configurer l'environnement (`backend/.env`)
Le fichier `backend/.env` contient les variables d'environnement nécessaires :
```env
PORT=5000
DATABASE_URL=postgres://mepos_user:mepos_password@localhost:5432/mepos_stock
API_KEY=mepos_sec_key_prod_abc123
```

### 2. Installer les dépendances
Ouvrez votre terminal, accédez au dossier `backend/` et installez les modules :
```bash
cd backend
npm install
```

### 3. Lancer le serveur backend
* **En mode développement** (rechargement automatique) :
  ```bash
  npm run dev
  ```
* **En mode production** (compilation puis exécution) :
  ```bash
  npm run build
  # Puis
  npm run start
  ```

> [!NOTE]
> Au premier démarrage réussi avec PostgreSQL, le backend exécutera automatiquement le fichier [schema.ts](file:///c:/Users/smair/Desktop/restaurant/backend/src/schema.ts) pour créer les tables et insérer les données initiales (seeds).

---

## Étape 3 : Configuration et Lancement du Frontend

L'interface est une Single Page Application moderne, optimisée pour un usage sur tablette en restaurant.

### 1. Installer les dépendances
Ouvrez un nouveau terminal, accédez au dossier `frontend/` et installez les modules :
```bash
cd frontend
npm install
```

### 2. Lancer le serveur de développement (Vite)
Lancez la commande suivante :
```bash
npm run dev
```
L'application sera accessible dans votre navigateur à l'adresse : **`http://localhost:5173`**.

---

## Étape 4 : Lancement de l'Agent de Synchronisation (Legacy POS)

L'agent simule le comportement d'une caisse tactile locale qui envoie périodiquement ses ventes au serveur central pour déduire les ingrédients en temps réel.
Vous avez le choix entre deux versions (Node.js ou Python) :

### Option A : Version Node.js (Recommandée)
1. Ouvrez un terminal et rendez-vous dans le dossier `agent/`.
2. Lancez l'agent :
   ```bash
   cd agent
   node sync_agent.js
   ```
   *L'agent lira le fichier local `local_sales_db.json` toutes les 10 secondes et enverra les nouveaux tickets au backend.*

### Option B : Version Python
1. Installez SQLite (inclus par défaut dans la plupart des installations Python).
2. Initialisez la base SQLite locale :
   ```bash
   cd agent
   python setup_local_db.py
   ```
3. Lancez l'agent de synchronisation :
   ```bash
   python sync_agent.py
   ```

---

## 👥 Comptes de Test et Rôles

Le système restreint les accès et masque les données financières selon le rôle de la personne connectée :

| Profil | Nom d'utilisateur | Mot de passe | Droits et spécificités |
| :--- | :--- | :--- | :--- |
| **Administrateur** | `admin` | `admin123` | **Accès total**. Voit toutes les données financières (prix d'achat, valeur du stock, coût des pertes sèches, manques à gagner). Accède à l'onglet **Paramétrage** pour gérer les ingrédients et les fiches techniques. |
| **Gérant** | `gerant` | `gerant123` | **Opérations globales**. Gère l'ensemble des stocks et valide les recharges. **Toutes les valeurs monétaires lui sont masquées** (remplacées par `*** TND` ou des étoiles) pour préserver le secret des marges. |
| **Cuisinier** | `cuisinier` | `cuisinier123` | **Exécution locale**. Ne voit que le stock de la **Cuisine Centrale**. Ne voit aucune donnée financière. Son tableau de bord est épuré et affiche les jauges de stock critiques, la composition des recettes et ses pertes déclarées. Il peut faire des demandes de recharge de stock. |

---

## 🧪 Scénarios de Test et Validation des Fonctionnalités

### Scénario 1 : Création d'ingrédient et fiche technique (Admin)
1. Connectez-vous avec le compte `admin`.
2. Allez dans l'onglet **Paramétrage**.
3. Dans la section **Matières Premières**, ajoutez un ingrédient :
   * Nom : *Bouteille de Fanta*
   * Unité Cuisine : *pcs*
   * Unité Achat : *caisse*
   * Capacité Paquet : *24.00* (24 canettes par caisse)
   * Prix Paquet : *36.00* TND (le coût unitaire de $1,50$ TND est calculé automatiquement).
   * Seuil d'alerte : *5.00*
4. Allez dans la section **Fiches Techniques**, sélectionnez la recette *Soda Cola Frais* ou créez une recette *Fanta Frais*. Associez-y *1 pcs* de *Bouteille de Fanta*. Enregistrez.

### Scénario 2 : Demande de recharge en deux étapes (Cuisinier ➔ Gérant)
1. Connectez-vous en tant que `cuisinier`.
2. Allez dans l'onglet **Recharges & Transferts**.
3. Saisissez une demande : Dépôt source : `Dépôt Central`, Destination : `Cuisine Centrale`, Ingrédient : `Fromage Cheddar`, Quantité : `5.00 kg`. Cliquez sur **Demander une recharge**. La demande apparaît au statut **En attente** (`pending`).
4. Déconnectez-vous et connectez-vous en tant que `gerant`.
5. Allez dans **Recharges & Transferts**, faites défiler jusqu'au tableau des demandes.
6. Cliquez sur **Valider** (bouton vert). Le statut passe à **Validé** (`approved`), et les stocks sont transférés du Dépôt Central à la Cuisine Centrale instantanément.

### Scénario 3 : Déclaration de perte et "Double Perte" (Admin & Gérant)
1. Allez dans l'onglet **Pertes & Gâche**.
2. Déclarez une perte pour le dépôt `Cuisine Centrale`, ingrédient `Viande Hachée`, quantité `5.00 kg`, motif `Spoliation`.
3. Cliquez sur **Déclarer la perte**.
4. **Si vous êtes connecté en Admin** : le journal affiche la perte avec la **Perte Sèche** ($160.00$ TND, coût d'achat) et le **Manque à Gagner** ($495.00$ TND, car cela représente 33 burgers simples non vendus à 15 TND).
5. **Si vous êtes connecté en Gérant** : vous verrez les 5 kg perdus dans le journal, mais les colonnes financières afficheront `*** TND`.

### Scénario 4 : Détection automatique des écarts (Caisse Tactile)
1. Assurez-vous que le backend et le frontend tournent.
2. Démarrez l'agent de synchronisation (`sync_agent.js`).
3. L'agent détecte et pousse les tickets contenant une surproduction (par exemple, un plat préparé 2 fois mais vendu 1 seule fois, comme dans les tickets simulant `quantity_served > quantity`).
4. Notre système calcule automatiquement l'écart de matières premières sur la base de la fiche technique et génère de lui-même une perte avec le motif `Écart de préparation (Caisse Tactile)`.
5. Connectez-vous en **Admin** ou **Gérant** : une **notification d'alerte rouge en temps réel** glisse depuis le haut à droite de l'écran pour vous avertir immédiatement de l'incident.
