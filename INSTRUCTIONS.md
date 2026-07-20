# Guide d'Utilisation et de Démarrage - mePOS STOCK

> **Version:** 2.4.0  
> **Stack:** Vue 3 + JavaScript · Express + TypeScript · PostgreSQL · Docker

---

## 📋 Table des Matières
1. [Prérequis](#1-prérequis)
2. [Structure du Projet](#2-structure-du-projet)
3. [Démarrage Rapide (Docker)](#3-démarrage-rapide-docker)
4. [Démarrage Manuel](#4-démarrage-manuel)
5. [Agent de Synchronisation](#5-agent-de-synchronisation)
6. [Comptes de Test et Rôles](#6-comptes-de-test-et-rôles)
7. [Scénarios de Test](#7-scénarios-de-test)
8. [Développement](#8-développement)
9. [Commandes Utiles](#9-commandes-utiles)

---

## 1. Prérequis

- [Node.js](https://nodejs.org/) ≥ 18
- [npm](https://www.npmjs.com/) (installé avec Node.js)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) *(recommandé)*
- [Python 3](https://www.python.org/) *(optionnel, agent de sync)*

---

## 2. Structure du Projet

```
restaurant/
├── docker-compose.yml         # Stack complète: PostgreSQL + Backend + Frontend
├── architecture.md            # Spécifications techniques
├── INSTRUCTIONS.md            # Ce fichier
│
├── backend/                   # API Express + TypeScript
│   ├── src/
│   │   ├── index.ts           # Point d'entrée principal
│   │   ├── database.ts        # PostgreSQL & Mode Démo (In-Memory)
│   │   ├── schema.ts          # Migration DDL et seeds
│   │   ├── simulator.ts       # Simulateur de ventes en arrière-plan
│   │   ├── services/          # Logique métier
│   │   └── routes/            # Controllers (thin)
│   ├── Dockerfile             # Build multi-stage
│   └── package.json
│
├── frontend/                  # SPA Vue 3 + JavaScript + Vite
│   ├── src/
│   │   ├── main.js            # createApp, Pinia, Router
│   │   ├── App.vue            # Racine: ErrorBoundary + router-view
│   │   ├── api/index.js       # Client Axios centralisé
│   │   ├── router/index.js    # Vue Router avec guards
│   │   ├── stores/            # Pinia (auth + app)
│   │   ├── composables/       # Logique réutilisable
│   │   ├── layouts/           # AppShell (sidebar + mobile)
│   │   ├── components/        # Composants UI réutilisables
│   │   ├── views/             # Pages (lazy-loaded)
│   │   └── styles/index.css   # Design system HSL
│   ├── Dockerfile             # Build multi-stage (node → nginx)
│   └── package.json
│
└── agent/                     # Agents de synchronisation POS
    ├── sync_agent.js          # Version Node.js
    ├── sync_agent.py          # Version Python
    └── local_sales_db.json    # Données de ventes simulées
```

---

## 3. Démarrage Rapide (Docker)

```bash
# Construire et démarrer tout
docker compose build --no-cache
docker compose up -d

# Vérifier les logs
docker compose logs -f
```

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:5173 | Interface Vue 3 |
| **Backend API** | http://localhost:5000 | API Express |
| **Health Check** | http://localhost:5000/health | Statut du serveur |
| **PostgreSQL** | localhost:5432 | Base de données |

---

## 4. Démarrage Manuel

### Backend

```bash
cd backend
npm install

# Développement (rechargement automatique)
npm run dev

# Production
npm run build
npm run start
```

### Frontend

```bash
cd frontend
npm install

# Développement
npm run dev

# Production
npm run build
npm run preview
```

### Variables d'environnement

Créez un fichier `backend/.env` :

```env
PORT=5000
DATABASE_URL=postgres://mepos_user:mepos_password@localhost:5432/mepos_stock
API_KEY=mepos_sec_key_prod_abc123
JWT_SECRET=change_me_in_production
FRONTEND_URL=http://localhost:5173
```

---

## 5. Agent de Synchronisation

L'agent simule une caisse tactile locale qui envoie périodiquement ses ventes au serveur.

### Version Node.js (Recommandée)

```bash
cd agent
node sync_agent.js
```

### Version Python

```bash
cd agent
python setup_local_db.py   # Initialiser la base SQLite
python sync_agent.py       # Lancer l'agent
```

---

## 6. Comptes de Test et Rôles

| Profil | Utilisateur | Mot de passe | Droits |
|--------|-------------|--------------|--------|
| **Administrateur** | `admin` | `admin123` | Accès total, données financières visibles |
| **Gérant** | `gerant` | `gerant123` | Gestion stocks, finances masquées (`*** TND`) |
| **Cuisinier** | `cuisinier` | `cuisinier123` | Cuisine Centrale uniquement, aucune donnée financière |

---

## 7. Scénarios de Test

### Scénario 1 : Création d'ingrédient et fiche technique (Admin)

1. Connectez-vous avec `admin`
2. Allez dans **Paramétrage**
3. Ajoutez un ingrédient : *Bouteille de Fanta*, unité cuisine : *pcs*, unité achat : *caisse*, capacité : *24*, prix : *36.00 TND*
4. Créez une recette *Fanta Frais* avec *1 pcs* de *Bouteille de Fanta*

### Scénario 2 : Demande de recharge (Cuisinier → Gérant)

1. Connectez-vous en `cuisinier`
2. Allez dans **Recharges & Transferts**
3. Demandez *5.00 kg* de *Fromage Cheddar* → statut **En attente**
4. Connectez-vous en `gerant`
5. Validez la demande → transfert effectué

### Scénario 3 : Déclaration de perte (Admin)

1. Allez dans **Pertes & Gâche**
2. Déclarez *5.00 kg* de *Viande Hachée*, motif *Périmé*
3. **Perte Sèche** : 160.00 TND · **Manque à Gagner** : 495.00 TND

### Scénario 4 : Détection automatique des écarts

1. Démarrez l'agent de synchronisation
2. Les tickets avec surproduction (quantity_served > quantity) génèrent automatiquement des pertes
3. Notification d'alerte en temps réel pour Admin/Gérant

---

## 8. Développement

### Conventions du Projet

- **Frontend :** Vue 3 `<script setup>` + Composition API, JavaScript (pas de TypeScript)
- **Backend :** Express + TypeScript, services métier séparés des routes
- **State :** Pinia stores (auth + app)
- **API :** `import { api } from '../api'` (named export, pas le default)
- **Routing :** Vue Router avec guards d'authentification
- **Lint :** ESLint avec eslint-plugin-vue (flat config)

### Ajouter une nouvelle vue

1. Créer `frontend/src/views/MaVue.vue` avec `<script setup>`
2. Ajouter la route dans `frontend/src/router/index.js`
3. Ajouter le lien de navigation dans `Sidebar.vue` et `MobileNav.vue`

### Ajouter un nouvel endpoint API

1. Créer le service dans `backend/src/services/`
2. Créer la route dans `backend/src/routes/`
3. Monter la route dans `backend/src/index.ts`
4. Ajouter la méthode dans `frontend/src/api/index.js`

---

## 9. Commandes Utiles

```bash
# Docker
docker compose build --no-cache    # Reconstruire les images
docker compose up -d               # Démarrer en arrière-plan
docker compose down                # Arrêter
docker compose logs -f             # Voir les logs
docker compose ps                  # Statut des conteneurs

# Backend
cd backend && npm run dev          # Développement
cd backend && npm run build        # Compiler TypeScript
cd backend && npm test             # Lancer les tests (vitest)

# Frontend
cd frontend && npm run dev         # Serveur de développement
cd frontend && npm run build       # Build de production
cd frontend && npm run lint        # Vérifier le code (ESLint)

# Agent
cd agent && node sync_agent.js     # Lancer l'agent Node.js
```
