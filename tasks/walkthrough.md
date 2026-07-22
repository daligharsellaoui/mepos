# Walkthrough - mePOS STOCK Implementation

L'implémentation complète des modules backend (Node.js/Express/TS), frontend (React/Vite/TS) et agent de synchronisation (Node.js) est terminée et validée avec succès. Le système intègre désormais le flux de recharge en deux étapes pour les départements isolés.

---

## Architecture des Répertoires Créée

```
restaurant/
├── docker-compose.yml         # Conteneur PostgreSQL local (si Docker installé)
├── architecture.md            # Spécifications de l'architecture (schéma DDL, routes)
├── backend/                   # Projet API Express + TypeScript
│   ├── src/
│   │   ├── index.ts           # Démarrage et routes principales
│   │   ├── database.ts        # Connexion PostgreSQL, in-memory demoDb et seeds
│   │   ├── schema.ts          # Migrations DDL (dont table transfer_requests)
│   │   └── routes/
│   │       ├── auth.ts        # Authentification des utilisateurs par rôle
│   │       ├── inventory.ts   # Stocks, départements, fiches techniques
│   │       ├── sales.ts       # Déductions ACID transactionnelles
│   │       ├── losses.ts      # Enregistrement pertes (Double Perte)
│   │       └── transfers.ts   # Gestion de transfert & demandes de recharge (en attente/validées/rejetées)
│   ├── package.json
│   └── tsconfig.json
├── agent/                     # Agent de synchronisation locale (Node.js)
│   ├── local_sales_db.json    # Base de ventes simulée de la vieille caisse
│   ├── sync_metadata.json     # Stockage local de l'offset (dernier ticket synchronisé)
│   └── sync_agent.js          # Démon de lecture et d'envoi API
└── frontend/                  # Application React + Vite + TypeScript (Tablette Kiosque)
    ├── src/
    │   ├── main.tsx           # Montage du DOM
    │   ├── App.tsx            # Navigation, Switcher de pages, Chargement des données
    │   ├── index.css          # Design System HSL (Mode sombre et tactile)
    │   ├── context/
    │   │   └── AuthContext.tsx# Contexte de session & rôles
    │   └── views/
    │       ├── Dashboard.tsx  # Métriques, alertes et pertes (Admin vs Autres)
    │       ├── Inventory.tsx  # Tableau des stocks (Prix masqués hors Admin, isolation Cuisinier)
    │       ├── LossTracker.tsx# Formulaire tactile de déclaration & journal
    │       └── StockTransfer.tsx# Gestionnaire de réassort tactile (Recharges & validations)
    └── package.json
```

---

## Résultat de la Vérification Technique

### 1. API Backend (Express + TS)
* L'API a été compilée avec succès sans aucune erreur TypeScript.
* Elle est lancée et s'exécute en tâche de fond sur le port `5000`.
* **Robustesse de démarrage** : L'API détecte automatiquement si PostgreSQL est disponible. Si Postgres n'est pas lancé (ce qui est le cas sur votre environnement de test sans Docker), elle bascule automatiquement en **MODE DÉMO (In-Memory)** en se pré-remplissant avec les utilisateurs, départements, stocks et fiches techniques requis. Elle reste 100% opérationnelle pour l'ensemble des modules.

### 2. Agent de Synchronisation (Legacy POS)
* L'agent a été implémenté en JavaScript (`sync_agent.js`) pour s'exécuter nativement sous Node.js.
* L'agent a lu la base locale `local_sales_db.json` (3 tickets historiques de la caisse Desktop), les a poussés avec succès vers le backend central via l'API REST `POST /api/v1/sales/sync` avec authentification par clé d'API.
* L'agent a reçu les alertes de stocks en retour, a mis à jour son offset dans `sync_metadata.json` (ID de ticket = 3), et s'exécute maintenant toutes les 10 secondes en tâche de fond.

### 3. Application Frontend (React + TS + Vite)
* L'application a été construite et compilée avec succès (build de production Vite validé).
* Elle s'exécute en tâche de fond sur le port `5173`.
* Le style implémente notre système de design premium (mode sombre, HSL, ergonomie tactile pour tablette kiosque, animations de transition).

---

## Comment Utiliser et Tester l'Application

1. Ouvrez votre navigateur et accédez à l'adresse de l'application : **`http://localhost:5173`**.
2. Connectez-vous avec l'un des trois profils prédéfinis :
   * **Administrateur** : 
     * Identifiants : `admin` / `admin123`
     * Droits : Accès à toutes les données, vision complète des prix d'achat, coûts des pertes (Perte Sèche) et manque à gagner financier (Opportunity Loss).
   * **Gérant** :
     * Identifiants : `gerant` / `gerant123`
     * Droits : Vision globale sur l'ensemble des stocks, mais **les prix d'achat et les données financières sont masqués** (remplacés par des visualisations quantitatives).
   * **Cuisinier** :
     * Identifiants : `cuisinier` / `cuisinier123`
     * Droits : Accès uniquement au stock de la **Cuisine Centrale**. Les autres dépôts et les données financières sont masqués. Peut effectuer des demandes de recharges numériques.

### Scénario de Test des Fonctionnalités :
1. **Paramétrage des colisages et conversions (Admin uniquement)** :
   * Connectez-vous en `admin` et rendez-vous sur l'onglet **Paramétrage**.
   * Dans la sous-section **Matières Premières**, créez un nouvel ingrédient :
     * Nom : *Bouteille de Fanta*
     * Unité Cuisine : *pcs*
     * Unité Achat : *caisse*
     * Capacité d'un Paquet : *24.00* (24 canettes par caisse)
     * Prix du Paquet : *36.00* TND (soit un coût cuisine calculé automatiquement de $1,50$ TND l'unité).
     * Seuil d'alerte : *5.00*
   * Enregistrez. Le Fanta apparaît dans le catalogue de droite.
2. **Création de Produit & Fiche Technique (Admin uniquement)** :
   * Dans l'onglet **Paramétrage**, sous-section **Fiches Techniques**, créez la recette *Fanta Frais* vendue à *3.50* TND.
   * Sélectionnez *Fanta Frais* dans le panneau de droite "Fiche Technique (Grammages)".
   * Choisissez l'ingrédient *Bouteille de Fanta*, saisissez un grammage requis de *1* pcs, puis cliquez sur **+ Insérer dans la fiche** puis **Sauvegarder la fiche technique**.
3. **Suivi des écarts de portions en Cuisine (Cuisinier & Gérant)** :
   * Si le portionnement n'a pas été respecté lors du service (ex : le cuisinier a mis $180$ g de Viande Hachée au lieu des $150$ g prévus pour le Cheeseburger Simple), rendez-vous dans le menu **Pertes & Gâche** et déclarez une perte.
   * Choisissez le dépôt *Cuisine Centrale*, l'ingrédient *Viande Hachée*, saisissez la gâche de portionnement de `0.030` kg, et sélectionnez le motif **Écart de préparation / Jet de cuisine**.
   * Validez. Le journal affichera l'écart, et en profil Admin, le coût direct ($0,96$ TND) ainsi que le manque à gagner associé s'afficheront en temps réel.
4. **Double Alerte de Perte** : Connectez-vous en `admin`, rendez-vous dans le menu **Pertes & Gâche**, et cliquez sur **Déclarer une perte**. Choisissez l'ingrédient *Viande Hachée* et saisissez `5.00` kg.
   * L'API calculera et affichera :
     * **Perte Sèche** : $5 \text{ kg} \times 32 \text{ TND} = 160 \text{ TND}$.
     * **Manque à Gagner** : $5 \text{ kg} / 0.150 \text{ kg} = 33$ portion(s) perdue(s) $\times 15 \text{ TND} = 495 \text{ TND}$ (calculé d'après la recette *Cheeseburger Simple* qui utilise cet ingrédient).
5. **Flux de Validation des Transferts en Deux Étapes** :
   * Connectez-vous en `cuisinier` et rendez-vous dans le menu **Recharges & Transferts** (`StockTransfer`).
   * Faites une demande de recharge de `5.00` kg de Fromage Cheddar. Le bouton de soumission s'intitule **"Demander une recharge"**. La demande est créée au statut **En attente** (le stock central n'est pas encore débité).
   * Connectez-vous maintenant en `gerant` (ou `admin`) et rendez-vous dans le même onglet.
   * Dans le tableau du bas ("Suivi des Demandes de Recharge Numériques"), la demande en attente s'affiche avec les boutons **Valider** (vert) et **Refuser** (rouge).
   * Cliquez sur **Valider**. La demande passe au statut **Validé**, et les stocks physiques sont transférés informatiquement du Dépôt Central à la Cuisine Centrale instantanément.
6. **Logique Multi-Stocks** : Si vous vous connectez en `cuisinier`, l'inventaire affiché se restreindra automatiquement à la *Cuisine Centrale* sans possibilité de filtrer sur d'autres zones.
