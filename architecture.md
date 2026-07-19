# Architecture & Spécifications Techniques - mePOS Inventory Intel

Ce document définit la conception et les spécifications techniques de **mePOS Inventory Intel** (moteur de gestion de stock et de recettes de mePOS).

---

## 1. Concept de mePOS Inventory Intel

**mePOS Inventory Intel** est un cerveau de calcul invisible (API-First) conçu pour se greffer sur n'importe quel logiciel de caisse (les solutions mePOS ou des caisses tierces) afin de convertir instantanément chaque vente de produit fini en déduction de matières premières, tout en cloisonnant strictement les accès selon la hiérarchie de l'établissement.

```mermaid
graph TD
    subgraph LegacyPOSSite [Point de Vente Traditionnel (Desktop)]
        LegacyDB[(SGBD Local: SQL Server / MySQL / SQLite)]
        SyncAgent[Agent Léger de Synchro / Node.js Daemon]
        LegacyPOS[Logiciel de Caisse Legacy] --> LegacyDB
        SyncAgent -.->|Lecture active des ventes| LegacyDB
    end

    subgraph ModernPOSSite [Point de Vente Moderne (Cloud)]
        ModernPOS[Caisse Modern POS / Web App / Mobile App]
    end

    subgraph CentralCloud [Backend Central / Cloud API-First]
        CloudAPI[API REST - Node.js / Express]
        DB[(PostgreSQL)]
        CloudAPI --> DB
    end

    subgraph ClientUI [Interface Client]
        WebUI[React/Vite App - Mode Kiosque / Tablette]
    end

    SyncAgent -->|Sync Asynchrone / JSON + X-API-KEY| CloudAPI
    ModernPOS -->|API REST Directe / JSON + X-API-KEY| CloudAPI
    WebUI -->|REST API & WebSockets| CloudAPI
```

---

## 2. Écosystème des Stocks : Dépôt vs Départements

Le système abandonne l'idée d'un "bloc unique de stock" pour s'adapter à la réalité opérationnelle des établissements de restauration en Tunisie. Il gère deux niveaux logiques de stockage :

1. **Le Dépôt Central (Le Magasin)** : 
   * C'est le lieu de stockage principal, souvent fermé à clé.
   * C'est ici que l'administrateur enregistre les achats auprès des fournisseurs (ex: réception de 50 kg de café, 20 pots de Nutella).
2. **Les Départements (Les Zones d'Exécution)** : 
   * L'administrateur peut créer et nommer des zones indépendantes (ex: Zone Pizzeria, Comptoir Café, Bar Principal).
   * Chaque département est lié aux produits qu'il prépare.

### Mécanisme d'Héritage Dynamique
Lors de la création ou du paramétrage d'un département, l'administrateur définit son mode de gestion des stocks :
* **Le Stock Isolé (Physique)** : 
  * Le département possède sa propre réserve physique.
  * Pour travailler, le cuisinier doit faire une demande de recharge numérique. Le gérant valide, ce qui transfère informatiquement (et physiquement) la marchandise du Dépôt Central vers le Département Isolé.
  * Les ventes de ce département ne piochent que dans cette réserve locale.
* **Le Stock Hérité (Virtuel)** : 
  * Le département n'a pas de réserve propre.
  * Chaque vente déduit directement la matière première du Dépôt Central en temps réel (idéal pour le lait ou les bouteilles d'eau au comptoir).

---

## 3. Matrice des Rôles (Sécurité & Masquage Financier)

Le module introduit une étanchéité totale des données pour éviter la divulgation des marges bénéficiaires de l'établissement ou le vol d'informations :

1. **Administrateur / Propriétaire (Contrôle Total)** :
   * Vision totale et sans restriction.
   * Accès aux quantités en stock, aux seuils d'alerte, ainsi qu'à toutes les données monétaires (prix d'achat des ingrédients, valeur du stock central, coût financier des pertes).
2. **Gérant / Manager (Contrôle Opérationnel)** :
   * Gère le quotidien opérationnel.
   * Voit exclusivement les volumes et quantités physiques (grammes, litres, unités).
   * Valide les transferts de stocks et réalise les inventaires.
   * **Toutes les valeurs monétaires lui sont masquées** (remplacées par des étoiles `*** TND` ou des champs vides dans le tableau de bord et les listes). Il sait qu'il manque 3 pots de Nutella, mais ignore à quel prix le patron les achète.
3. **Cuisinier / Comptoiriste (Exécution Locale)** :
   * Accès ultra-limité à l'interface.
   * Ne voit que le stock actuel de **son département uniquement** (ex: la pizzeria ne voit pas le stock du bar).
   * Ne voit aucun prix d'achat.
   * Son seul droit est d'initier une demande de recharge numérique au gérant depuis le dépôt central.

---

## 4. Moteur de Recettes et Déduction Temps Réel

Le système fonctionne grâce à des fiches techniques (les recettes) qui lient un produit vendu par la caisse à ses composants bruts.

* **Le Paramétrage (Admin)** : 
  L'Admin définit chaque ingrédient avec son unité brute (le gramme ou le millilitre) et sa capacité de conditionnement (ex: 1 pot de Nutella = 1000g). Ensuite, il configure la fiche technique :
  $$\text{1 Gaufre Nutella} = 150\text{g de Farine} + 70\text{g de Nutella}$$
* **L'Automatisation (Temps Réel)** : 
  Dès que la caisse valide la vente de 2 gaufres, le payload JSON est envoyé au module. Le système calcule et déduit simultanément $300\text{g}$ de farine et $140\text{g}$ de Nutella du stock du département concerné.

---

## 5. Analyse de la "Double Perte"

Lors d'un écart d'inventaire ou d'un incident déclaré (ex: perte de viande par péremption, vol, ou écart de portionnement), le tableau de bord Administrateur affiche deux indicateurs financiers clés :

1. **La Perte Sèche (Hard Cost)** : 
   La valeur financière brute de la marchandise disparue au prix d'achat fournisseur.
   $$\text{Perte Sèche} = \text{Quantité Perdue} \times \text{Prix d'Achat Unitaire}$$
   *Exemple : 200g de viande perdue au coût fournisseur de 30 DT/kg = 6 DT de perte sèche.*

2. **Le Manque à Gagner (Soft Opportunity)** : 
   Le chiffre d'affaires virtuel que l'établissement a raté en ne vendant pas les produits finis correspondants.
   $$\text{Manque à Gagner} = \left( \frac{\text{Quantité Perdue}}{\text{Quantité Fiche Technique}} \right) \times \text{Prix de Vente du Produit Fini}$$
   *Exemple : Ces 200g de viande auraient permis de préparer 2 sandwichs vendus à 12 DT l'unité, soit un manque à gagner de 24 DT.*

---

## 6. Schéma de Base de Données (PostgreSQL)

```sql
-- DDL Schema in English (PostgreSQL)

-- Types Énumérés
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'cook');
CREATE TYPE stock_movement_type AS ENUM ('purchase', 'transfer_in', 'transfer_out', 'sale_deduction', 'loss', 'reconciliation');

-- 1. Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Departments table
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    stock_type VARCHAR(20) NOT NULL CHECK (stock_type IN ('isolated', 'inherited')),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Ingredients table (Enriched for purchase conversions)
CREATE TABLE ingredients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    unit VARCHAR(10) NOT NULL, -- e.g., 'g', 'ml', 'pcs'
    purchase_price_per_unit DECIMAL(10, 4) NOT NULL, -- calculated base cost
    alert_threshold DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    purchase_unit VARCHAR(50) DEFAULT 'paquet', -- e.g., 'carton', 'sac'
    purchase_unit_price DECIMAL(10, 2) DEFAULT 0.00, -- e.g., 120.00 TND
    conversion_factor DECIMAL(12, 4) DEFAULT 1.0000, -- e.g., 5000 (g)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Inventory Stocks table
CREATE TABLE inventory_stocks (
    id SERIAL PRIMARY KEY,
    department_id INT REFERENCES departments(id) ON DELETE CASCADE,
    ingredient_id INT REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(department_id, ingredient_id)
);

-- 5. Recipes table (Finished Goods)
CREATE TABLE recipes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) UNIQUE NOT NULL,
    sale_price DECIMAL(10, 2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Recipe Ingredients table (Fiches Techniques)
CREATE TABLE recipe_ingredients (
    id SERIAL PRIMARY KEY,
    recipe_id INT REFERENCES recipes(id) ON DELETE CASCADE,
    ingredient_id INT REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity_needed DECIMAL(12, 4) NOT NULL, -- in base units (e.g. 150.0 for 150g)
    UNIQUE(recipe_id, ingredient_id)
);

-- 7. Sales Tickets table
CREATE TABLE sales_tickets (
    id SERIAL PRIMARY KEY,
    external_ticket_id VARCHAR(100) NOT NULL,
    department_id INT REFERENCES departments(id),
    ticket_date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    sync_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(department_id, external_ticket_id)
);

-- 8. Sales Ticket Items table
CREATE TABLE sales_ticket_items (
    id SERIAL PRIMARY KEY,
    sales_ticket_id INT REFERENCES sales_tickets(id) ON DELETE CASCADE,
    recipe_id INT REFERENCES recipes(id),
    quantity DECIMAL(10, 2) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL
);

-- 9. Stock Movements table
CREATE TABLE stock_movements (
    id SERIAL PRIMARY KEY,
    department_id INT REFERENCES departments(id),
    ingredient_id INT REFERENCES ingredients(id),
    quantity DECIMAL(12, 4) NOT NULL,
    type stock_movement_type NOT NULL,
    reference_id VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Ingredient Losses table
CREATE TABLE ingredient_losses (
    id SERIAL PRIMARY KEY,
    department_id INT REFERENCES departments(id),
    ingredient_id INT REFERENCES ingredients(id),
    quantity DECIMAL(12, 4) NOT NULL,
    loss_reason VARCHAR(100),
    cost_loss DECIMAL(10, 2) NOT NULL,
    opportunity_loss DECIMAL(10, 2) NOT NULL,
    reported_by INT REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 11. Transfer Requests table (Two-Step Recharge)
CREATE TABLE transfer_requests (
    id SERIAL PRIMARY KEY,
    source_department_id INT REFERENCES departments(id) ON DELETE CASCADE,
    destination_department_id INT REFERENCES departments(id) ON DELETE CASCADE,
    ingredient_id INT REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity DECIMAL(12, 4) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    requested_by INT REFERENCES users(id) ON DELETE SET NULL,
    validated_by INT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_sales_tickets_ext ON sales_tickets(department_id, external_ticket_id);
CREATE INDEX idx_inventory_stocks_lookup ON inventory_stocks(department_id, ingredient_id);
```

---

## 7. Contrats d'Interface API de Ventes

### 7.1 Synchronisation des Ventes (POS sync)
* **URL** : `/api/v1/sales/sync`
* **Méthode** : `POST`
* **Format** : `application/json`
* **En-têtes** : `X-API-KEY: mepos_sec_key_prod_abc123...`

#### Payload JSON de Requête
```json
{
  "department_id": 2,
  "tickets": [
    {
      "external_ticket_id": "TK-847291-2026",
      "ticket_date": "2026-06-06T20:15:30Z",
      "total_amount": 42.50,
      "items": [
        {
          "recipe_id": 1,
          "quantity": 2.0,
          "unit_price": 15.00
        }
      ]
    }
  ]
}
```

#### Réponse `200 OK` (Succès)
```json
{
  "status": "success",
  "synced_tickets_count": 1,
  "deducted_stocks": [
    {
      "ingredient_id": 1,
      "name": "Viande Hachée",
      "deducted_quantity": 0.3000,
      "remaining_quantity": 9.7000,
      "department_id": 2
    }
  ],
  "warnings": []
}
```

### 7.2 Statistiques des Ventes par Période
* **URL** : `/api/v1/sales/stats`
* **Méthode** : `GET`
* **En-têtes** : `X-API-KEY: mepos_sec_key_prod_abc123...`
* **Paramètres de Requête (Query Params)** :
  * `startDate` (YYYY-MM-DD, optionnel, par défaut aujourd'hui)
  * `endDate` (YYYY-MM-DD, optionnel, par défaut aujourd'hui)
  * `startHour` (HH:MM, optionnel, par défaut '00:00')
  * `endHour` (HH:MM, optionnel, par défaut '23:59')
* **Réponse `200 OK` (Succès)** :
```json
{
  "status": "success",
  "data": {
    "total_revenue": 50.00,
    "total_items_sold": 10,
    "items": [
      {
        "recipe_id": 1,
        "recipe_name": "Cheeseburger Simple",
        "quantity": 2.0,
        "unit_price": 15.00,
        "total_revenue": 30.00
      },
      {
        "recipe_id": 3,
        "recipe_name": "Soda Cola Frais",
        "quantity": 8.0,
        "unit_price": 2.50,
        "total_revenue": 20.00
      }
    ]
  }
}
```

---

## 8. Contrats d'Interface API de Validation des Transferts

Ces endpoints permettent la validation en deux temps requise pour les recharges de stocks des départements isolés.

### 8.1 Lister les demandes de recharge
* **URL** : `/api/v1/transfers/requests`
* **Méthode** : `GET`
* **En-têtes** : `X-API-KEY: mepos_sec_key_prod_abc123...`
* **Réponse `200 OK`** : Renvoie la liste complète des demandes (filtrée par département côté frontend pour les cuisiniers).

### 8.2 Créer une demande de recharge
* **URL** : `/api/v1/transfers/requests`
* **Méthode** : `POST`
* **Format** : `application/json`
* **En-têtes** : `X-API-KEY: mepos_sec_key_prod_abc123...`
* **Payload JSON** :
  ```json
  {
    "source_department_id": 1,
    "destination_department_id": 2,
    "ingredient_id": 3,
    "quantity": 5.0,
    "requested_by": 3
  }
  ```

### 8.3 Valider / Approuver une demande de recharge
* **URL** : `/api/v1/transfers/requests/:id/validate`
* **Méthode** : `POST`
* **Format** : `application/json`
* **En-têtes** : `X-API-KEY: mepos_sec_key_prod_abc123...`
* **Payload JSON** :
  ```json
  {
    "validated_by": 2
  }
  ```
* **Effet** : Si le stock source est suffisant, valide la demande, change son statut en `approved` et effectue le transfert physique dans la table `inventory_stocks`.

### 8.4 Refuser une demande de recharge
* **URL** : `/api/v1/transfers/requests/:id/reject`
* **Méthode** : `POST`
* **Format** : `application/json`
* **En-têtes** : `X-API-KEY: mepos_sec_key_prod_abc123...`
* **Payload JSON** :
  ```json
  {
    "validated_by": 2
  }
  ```
* **Effet** : Change le statut de la demande en `rejected`. Aucun mouvement de stock n'est effectué.

---

## 9. Moteur de Notifications de Pertes en Temps Réel

Le système de tableau de bord intègre un mécanisme d'alerte en temps réel pour l'**Administrateur** et le **Gérant**.

* **Mécanisme** : Le client frontend interroge périodiquement (toutes les 8 secondes) la route `/api/v1/losses`.
* **Règles RBAC de l'Alerte** :
  * **Administrateur** : Reçoit une alerte visuelle (slide-in toast) détaillant la quantité perdue, l'ingrédient, le département, le motif, ainsi que les calculs financiers (**Perte Sèche** & **Manque à Gagner**).
  * **Gérant** : Reçoit la même alerte visuelle mais sans les données financières confidentielles, afin de préserver le masquage de marge.
  * **Cuisinier** : Ne reçoit pas d'alertes (ne dispose pas de l'accès au registre des pertes globales).
* **Comportement UI** : L'alerte glisse depuis le coin supérieur droit, affiche un badge d'avertissement rouge et disparaît automatiquement après 15 secondes (ou manuellement en cliquant sur le bouton de fermeture).

### 9.2 Détection Automatique des Écarts de Préparation (Caisse Tactile)

Pour contrôler efficacement les équipes de cuisine et de bar sans leur imposer de saisies complexes, le système propose une détection automatique des pertes à partir des volumes de produits vendus et servis.

* **Payload de Synchro Étendu** : Lors de la synchronisation des ventes via `POST /api/v1/sales/sync`, la caisse tactile transmet uniquement les données de produits vendus par les serveurs. Elle peut optionnellement inclure la quantité de produits réellement servis/préparés en cuisine (`quantity_served`) pour chaque produit vendu (`quantity`) :
  ```json
  {
    "recipe_id": 1,
    "quantity": 1.0,
    "unit_price": 15.00,
    "quantity_served": 2.0
  }
  ```
* **Calcul des Pertes d'Ingrédients dans notre Système** :
  * Notre système centralise les fiches techniques (recettes) et le paramétrage des ingrédients (ex: 1 Cheeseburger Simple = 150g de viande, 1 pain, 30g de fromage, etc.).
  * Si la quantité préparée en cuisine dépasse la quantité vendue (`quantity_served > quantity`), notre système calcule automatiquement la différence (la quantité en surproduction).
  * Il traduit cette surproduction en perte de matières premières en multipliant l'écart par le grammage de la fiche technique.
* **Enregistrement de l'Écart** :
  * Les pertes d'ingrédients calculées sont insérées automatiquement dans la table `ingredient_losses` avec le motif `"Écart de préparation (Caisse Tactile)"` sans intervention humaine (`reported_by` nul).
  * Le stock est ajusté et les bandeaux d'alertes en temps réel s'affichent instantanément pour l'Administrateur et le Gérant.
