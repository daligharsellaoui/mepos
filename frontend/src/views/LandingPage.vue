<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import sideLogoSrc from '../assets/sidelogo.png'
import sectionSrc from '../assets/section.png'
import '../styles/landing.css'

const router = useRouter()
const auth = useAuthStore()
const isLoggedIn = computed(() => auth.isLoggedIn)

const scrolled = ref(false)
const mobileOpen = ref(false)
const mouseX = ref(0)
const mouseY = ref(0)
const heroEl = ref(null)

function onScroll() {
  scrolled.value = window.scrollY > 20
}

function onMouseMove(e) {
  if (!heroEl.value) return
  const rect = heroEl.value.getBoundingClientRect()
  mouseX.value = ((e.clientX - rect.left) / rect.width - 0.5) * 2
  mouseY.value = ((e.clientY - rect.top) / rect.height - 0.5) * 2
}

onMounted(() => {
  window.addEventListener('scroll', onScroll)
  window.addEventListener('mousemove', onMouseMove)
  observeSections()
  document.body.style.overflow = 'auto'
  document.body.style.height = 'auto'
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('mousemove', onMouseMove)
  document.body.style.overflow = ''
  document.body.style.height = ''
})

function scrollTo(id) {
  mobileOpen.value = false
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

function goLogin() {
  if (isLoggedIn.value) {
    router.push('/app')
  } else {
    router.push('/login')
  }
}

function observeSections() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible')
        }
      })
    },
    { threshold: 0.1 }
  )
  document.querySelectorAll('.landing-animate').forEach(el => observer.observe(el))
}

const carouselIndex = ref(0)
const carouselSlides = ['Tableau de bord', 'Inventaire', 'Recettes', 'Transferts', 'Synchronisation', 'Rapports', 'Agents']

function prevSlide() {
  carouselIndex.value = carouselIndex.value === 0 ? carouselSlides.length - 1 : carouselIndex.value - 1
}
function nextSlide() {
  carouselIndex.value = carouselIndex.value === carouselSlides.length - 1 ? 0 : carouselIndex.value + 1
}

const openFaq = ref(null)
function toggleFaq(index) {
  openFaq.value = openFaq.value === index ? null : index
}

const faqs = [
  {
    q: 'Puis-je utiliser mon système de caisse actuel ?',
    a: 'Oui. mePOS Inventory Intel fonctionne avec votre caisse existante. Notre agent de synchronisation se connecte à votre système sans nécessiter de modifications.'
  },
  {
    q: 'Dois-je remplacer ma caisse ?',
    a: 'Non. Nous nous connectons à votre caisse via un connecteur base de données ou une API REST. Aucun remplacement nécessaire.'
  },
  {
    q: 'Comment les stocks sont-ils synchronisés ?',
    a: 'Notre agent de synchronisation s\'exécute sur votre réseau local, lit les données de vente de votre caisse et les envoie vers le cloud. Les stocks sont mis à jour en temps réel sur tous les sites.'
  },
  {
    q: 'Puis-je gérer plusieurs restaurants ?',
    a: 'Oui. mePOS Inventory Intel est une plateforme multi-tenant. Chaque restaurant est totalement isolé et vous pouvez gérer tous les sites depuis un seul tableau de bord.'
  },
  {
    q: 'Comment les données sont-elles sécurisées ?',
    a: 'Toutes les données sont chiffrées en transit et au repos. Chaque tenant est isolé avec des contrôles d\'accès stricts basés sur les rôles.'
  },
  {
    q: 'Puis-je utiliser SQL Server ?',
    a: 'Oui. Nous supportons SQL Server, PostgreSQL, MySQL et SQLite. Notre connecteur fonctionne avec n\'importe quelle base SQL utilisée par votre caisse.'
  },
  {
    q: 'Puis-je me connecter via une API ?',
    a: 'Oui. Si votre caisse expose une API REST, vous pouvez vous connecter via notre connecteur API avec une clé. Aucun accès direct à la base de données requis.'
  },
  {
    q: 'Puis-je utiliser plusieurs entrepôts ?',
    a: 'Oui. Vous pouvez gérer plusieurs entrepôts et transférer des stocks entre eux. Chaque site conserve son inventaire tout en étant visible depuis le tableau de bord central.'
  }
]

const features = [
  { title: 'Gestion des stocks', desc: 'Suivez les niveaux de stock en temps réel sur tous les sites. Définissez des seuils de réapprovisionnement.', icon: '📦', bg: 'rgba(99, 102, 241, 0.1)' },
  { title: 'Gestion des recettes', desc: 'Créez et gérez des recettes avec des quantités précises. Calculez les coûts et suivez l\'utilisation automatiquement.', icon: '📋', bg: 'rgba(16, 185, 129, 0.1)' },
  { title: 'Mouvements de stock', desc: 'Suivez chaque mouvement de stock de la réception à la consommation. Piste d\'audit complète.', icon: '🔄', bg: 'rgba(245, 158, 11, 0.1)' },
  { title: 'Transferts entre entrepôts', desc: 'Transférez des stocks entre sites en quelques clics. Suivez les expéditions.', icon: '🚚', bg: 'rgba(59, 130, 246, 0.1)' },
  { title: 'Pertes & Gâche', desc: 'Enregistrez et analysez les pertes pour identifier les tendances. Réduisez le gaspillage.', icon: '📉', bg: 'rgba(239, 68, 68, 0.1)' },
  { title: 'Gestion des fournisseurs', desc: 'Gérez les informations fournisseurs, prix et délais. Optimisez vos approvisionnements.', icon: '🤝', bg: 'rgba(99, 102, 241, 0.1)' },
  { title: 'Bons de commande', desc: 'Générez et suivez les bons de commande. Automatisez le réapprovisionnement.', icon: '📄', bg: 'rgba(16, 185, 129, 0.1)' },
  { title: 'Synchronisation temps réel', desc: 'Les ventes de votre caisse sont transmises automatiquement. Aucune saisie manuelle.', icon: '⚡', bg: 'rgba(245, 158, 11, 0.1)' },
  { title: 'Multi-Tenant SaaS', desc: 'Chaque restaurant est totalement isolé. Gérez plusieurs sites depuis un seul tableau de bord.', icon: '🏢', bg: 'rgba(59, 130, 246, 0.1)' },
  { title: 'Permissions par rôles', desc: 'Contrôle d\'accès granulaire pour administrateurs, gestionnaires et personnel de cuisine.', icon: '🔐', bg: 'rgba(239, 68, 68, 0.1)' },
  { title: 'Surveillance des agents', desc: 'Surveillez les agents de synchronisation sur tous les sites. Recevez des alertes en cas de panne.', icon: '📡', bg: 'rgba(99, 102, 241, 0.1)' },
  { title: 'Rapports & Analyses', desc: 'Rapports complets sur les stocks, l\'utilisation, les pertes et les coûts.', icon: '📊', bg: 'rgba(16, 185, 129, 0.1)' },
  { title: 'Notifications', desc: 'Alertes en temps réel pour les stocks bas, les activités inhabituelles et les problèmes de synchronisation.', icon: '🔔', bg: 'rgba(245, 158, 11, 0.1)' }
]

const benefits = [
  { title: 'Fonctionne avec votre caisse actuelle', desc: 'Pas besoin de remplacer votre système. Nous nous connectons à n\'importe quelle caisse.', icon: '🔄' },
  { title: 'Inventaire en temps réel', desc: 'Sachez exactement ce que vous avez à chaque endroit, à tout moment.', icon: '⚡' },
  { title: 'Réduisez le gaspillage', desc: 'Identifiez et éliminez les sources de pertes. Économisez et opérez durablement.', icon: '♻️' },
  { title: 'Suivez chaque ingrédient', desc: 'Suivez chaque ingrédient de la livraison à l\'assiette. Visibilité totale.', icon: '🔍' },
  { title: 'Support multi-restaurant', desc: 'Gérez tous vos sites depuis un tableau de bord. Opérations cohérentes.', icon: '🏪' },
  { title: 'Synchronisation automatique', desc: 'Les ventes sont synchronisées automatiquement. Aucune saisie manuelle.', icon: '🤖' },
  { title: 'Sécurisé & Cloud', desc: 'Sécurité de niveau entreprise avec données chiffrées. Accès depuis n\'importe où.', icon: '☁️' },
  { title: 'Aucun remplacement nécessaire', desc: 'Votre équipe garde la caisse qu\'elle connaît. Nous gérons la synchronisation.', icon: '✅' }
]

const testimonials = [
  {
    text: 'mePOS Inventory Intel a transformé notre gestion des stocks sur nos trois sites. Nous avons réduit le gaspillage de 30% dès le premier mois.',
    name: 'Karim Ben Ali',
    role: 'Propriétaire, Le Petit Chef Group',
    initial: 'K'
  },
  {
    text: 'La synchronisation en temps réel est une révolution. Plus de comptages manuels ni de ruptures surprises pendant le service.',
    name: 'Sofia Mansour',
    role: 'Responsable d\'exploitation, Urban Bites',
    initial: 'S'
  },
  {
    text: 'En tant que chef, je peux enfin me concentrer sur la cuisine plutôt que de compter les ingrédients. Le système m\'alerte avant une rupture.',
    name: 'Youssef Haddad',
    role: 'Chef de cuisine, La Maison',
    initial: 'Y'
  }
]
</script>

<template>
  <div class="landing-page">
    <!-- NAVBAR -->
    <nav class="landing-nav" :class="{ scrolled }">
      <div class="landing-nav-inner">
        <a class="landing-nav-logo" href="/">
          <img :src="sideLogoSrc" alt="mePOS">
        </a>
        <div class="landing-nav-links">
          <button class="landing-nav-link" @click="scrollTo('features')">Fonctionnalités</button>
          <button class="landing-nav-link" @click="scrollTo('how-it-works')">Comment ça marche</button>
          <button class="landing-nav-link" @click="scrollTo('faq')">FAQ</button>
          <button class="landing-nav-login" @click="goLogin">{{ isLoggedIn ? 'Mon compte' : 'Connexion' }}</button>
        </div>
        <button class="landing-hamburger" @click="mobileOpen = !mobileOpen" aria-label="Menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>
    </nav>

    <!-- Mobile Menu -->
    <div class="landing-mobile-menu" :class="{ open: mobileOpen }">
      <button class="landing-mobile-link" @click="scrollTo('features')">Fonctionnalités</button>
      <button class="landing-mobile-link" @click="scrollTo('how-it-works')">Comment ça marche</button>
      <button class="landing-mobile-link" @click="scrollTo('faq')">FAQ</button>
      <button class="landing-mobile-link" @click="goLogin">{{ isLoggedIn ? 'Mon compte' : 'Connexion' }}</button>
    </div>

    <!-- 1. HERO -->
    <section ref="heroEl" class="landing-hero">
      <div class="landing-hero-bg">
        <div class="landing-hero-bg-grid"></div>
        <div class="landing-hero-bg-noise"></div>
        <div class="landing-hero-particle" style="width:6px;height:6px;top:15%;left:10%;animation-delay:-1s;animation-duration:7s"></div>
        <div class="landing-hero-particle" style="width:4px;height:4px;top:70%;left:5%;animation-delay:-3s;animation-duration:9s"></div>
        <div class="landing-hero-particle" style="width:5px;height:5px;top:25%;left:85%;animation-delay:-5s;animation-duration:6s"></div>
        <div class="landing-hero-particle" style="width:3px;height:3px;top:60%;left:90%;animation-delay:-2s;animation-duration:8s"></div>
        <div class="landing-hero-particle" style="width:7px;height:7px;top:40%;left:45%;animation-delay:-4s;animation-duration:10s"></div>
      </div>
      <div class="landing-hero-content">
        <div class="landing-hero-stagger">
          <h1 class="landing-hero-title">
            Gestion de stock.<br>Simplifiée.<br><span class="highlight">Surboostée.</span>
          </h1>
        </div>
        <div class="landing-hero-stagger">
          <p class="landing-hero-desc">
            La solution tout-en-un de gestion de stock et d'inventaire conçue pour les commerces modernes.
          </p>
        </div>
        <div class="landing-hero-features landing-hero-stagger">
          <div class="landing-hero-feature">
            <div class="landing-hero-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            </div>
            <span class="landing-hero-feature-label">Gestion de stock</span>
          </div>
          <div class="landing-hero-feature">
            <div class="landing-hero-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8l-8 8"/><path d="M8 8h8v8"/></svg>
            </div>
            <span class="landing-hero-feature-label">Gestion de pertes</span>
          </div>
          <div class="landing-hero-feature">
            <div class="landing-hero-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 4-6"/></svg>
            </div>
            <span class="landing-hero-feature-label">Rapports & Analyses</span>
          </div>
          <div class="landing-hero-feature">
            <div class="landing-hero-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
            <span class="landing-hero-feature-label">Alertes & Notifications</span>
          </div>
        </div>
        <div class="landing-hero-actions landing-hero-stagger">
          <button class="landing-hero-btn-primary">
            Essayer gratuitement
          </button>
          <button class="landing-hero-btn-secondary">
            Voir la démo
          </button>
        </div>
        <div class="landing-hero-trust landing-hero-stagger">
          <div class="landing-hero-stars">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--amber)" stroke="var(--amber)" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--amber)" stroke="var(--amber)" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--amber)" stroke="var(--amber)" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--amber)" stroke="var(--amber)" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--amber)" stroke="var(--amber)" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <span class="landing-hero-trust-text">Adopté par plus de 150 commerces</span>
        </div>
      </div>
      <div class="landing-hero-visual">
        <div class="landing-hero-glow"></div>
        <div class="landing-hero-cube"></div>
        <div class="landing-hero-cube"></div>
        <div class="landing-hero-cube"></div>
        <div class="landing-hero-image landing-hero-image-stagger" :style="{ transform: `perspective(1200px) rotateY(${mouseX * 2}deg) rotateX(${-mouseY * 2}deg) translateY(${mouseY * 4}px)` }">
          <div class="landing-hero-image-glow"></div>
          <div class="landing-hero-image-rim"></div>
          <div class="landing-hero-image-sweep"></div>
          <img :src="sectionSrc" alt="mePOS Inventory Intel" loading="lazy">
        </div>
      </div>
    </section>

    <!-- 2. FEATURES -->
    <section id="features" class="landing-section">
      <div class="landing-section-header landing-animate">
        <span class="landing-section-label">Fonctionnalités</span>
        <h2 class="landing-section-title">Tout ce dont vous avez besoin pour gérer vos stocks</h2>
        <p class="landing-section-desc">Du suivi en temps réel à la gestion multi-sites, mePOS Inventory Intel vous donne un contrôle total sur vos stocks.</p>
      </div>
      <div class="landing-features-grid">
        <div v-for="feature in features" :key="feature.title" class="landing-feature-card landing-animate">
          <div class="landing-feature-icon" :style="{ background: feature.bg }">
            <span v-html="feature.icon"></span>
          </div>
          <h3 class="landing-feature-title">{{ feature.title }}</h3>
          <p class="landing-feature-desc">{{ feature.desc }}</p>
        </div>
      </div>
    </section>

    <!-- 3. HOW IT WORKS -->
    <section id="how-it-works" class="landing-section">
      <div class="landing-section-header landing-animate">
        <span class="landing-section-label">Comment ça marche</span>
        <h2 class="landing-section-title">De la caisse au cloud en temps réel</h2>
        <p class="landing-section-desc">Les données de vente circulent automatiquement de votre caisse vers votre tableau de bord.</p>
      </div>
      <div class="landing-flow">
        <div class="landing-flow-step landing-animate">
          <div class="landing-flow-step-num">1</div>
          <div class="landing-flow-step-content">
            <div class="landing-flow-step-title">Caisse du restaurant</div>
            <div class="landing-flow-step-desc">Votre caisse enregistre chaque vente</div>
          </div>
        </div>
        <div class="landing-flow-arrow">↓</div>
        <div class="landing-flow-step landing-animate">
          <div class="landing-flow-step-num">2</div>
          <div class="landing-flow-step-content">
            <div class="landing-flow-step-title">Agent de synchronisation</div>
            <div class="landing-flow-step-desc">S'exécute sur votre réseau local et lit les ventes en toute sécurité</div>
          </div>
        </div>
        <div class="landing-flow-arrow">↓</div>
        <div class="landing-flow-step landing-animate">
          <div class="landing-flow-step-num">3</div>
          <div class="landing-flow-step-content">
            <div class="landing-flow-step-title">Cloud Inventory Intel</div>
            <div class="landing-flow-step-desc">Traite et stocke les données avec isolation complète des tenants</div>
          </div>
        </div>
        <div class="landing-flow-arrow">↓</div>
        <div class="landing-flow-step landing-animate">
          <div class="landing-flow-step-num">4</div>
          <div class="landing-flow-step-content">
            <div class="landing-flow-step-title">Mise à jour automatique des stocks</div>
            <div class="landing-flow-step-desc">Niveaux de stock, alertes et analyses en temps réel sur tous les sites</div>
          </div>
        </div>
      </div>
      <div class="landing-connectors">
        <div class="landing-connector-card landing-animate">
          <h3 class="landing-connector-title">Connecteur Base de Données</h3>
          <p class="landing-connector-desc">Connexion directe à la base de données de votre caisse pour une synchronisation en temps réel.</p>
          <div class="landing-connector-tags">
            <span class="landing-connector-tag">SQL Server</span>
            <span class="landing-connector-tag">PostgreSQL</span>
            <span class="landing-connector-tag">MySQL</span>
            <span class="landing-connector-tag">SQLite</span>
          </div>
        </div>
        <div class="landing-connector-card landing-animate">
          <h3 class="landing-connector-title">Connecteur API REST</h3>
          <p class="landing-connector-desc">Connexion via API lorsque l'accès direct à la base n'est pas disponible.</p>
          <div class="landing-connector-tags">
            <span class="landing-connector-tag">REST API</span>
            <span class="landing-connector-tag">Clé API</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 4. WHY CHOOSE MEPOS -->
    <section id="why-mepos" class="landing-section">
      <div class="landing-section-header landing-animate">
        <span class="landing-section-label">Pourquoi mePOS</span>
        <h2 class="landing-section-title">Conçu pour les restaurants, par des restaurateurs</h2>
        <p class="landing-section-desc">Nous comprenons les défis de la restauration. Notre plateforme résout de vrais problèmes.</p>
      </div>
      <div class="landing-benefits-grid">
        <div v-for="benefit in benefits" :key="benefit.title" class="landing-benefit-card landing-animate">
          <span class="landing-benefit-icon" v-html="benefit.icon"></span>
          <h3 class="landing-benefit-title">{{ benefit.title }}</h3>
          <p class="landing-benefit-desc">{{ benefit.desc }}</p>
        </div>
      </div>
    </section>

    <!-- 5. PRODUCT SCREENSHOTS -->
    <section id="screenshots" class="landing-section">
      <div class="landing-section-header landing-animate">
        <span class="landing-section-label">Produit</span>
        <h2 class="landing-section-title">Voir en action</h2>
        <p class="landing-section-desc">Une interface moderne et épurée conçue pour les équipes de restauration.</p>
      </div>
      <div class="landing-carousel landing-animate">
        <div class="landing-carousel-track" :style="{ transform: `translateX(-${carouselIndex * 100}%)` }">
          <div v-for="slide in carouselSlides" :key="slide" class="landing-carousel-slide">
            <div style="background: var(--bg-card); border-radius: var(--radius-md); padding: 3rem 2rem; text-align: center; border: 1px solid var(--border-color);">
              <div style="font-size: 3rem; font-weight: 800; color: var(--indigo-light); letter-spacing: -0.03em; margin-bottom: 0.5rem;">{{ slide }}</div>
              <div style="color: var(--text-muted); font-size: 0.9rem;">mePOS Inventory Intel</div>
            </div>
          </div>
        </div>
      </div>
      <div class="landing-carousel-controls">
        <button class="landing-carousel-btn" @click="prevSlide" aria-label="Précédent">←</button>
        <button v-for="(_, i) in carouselSlides" :key="i" class="landing-carousel-dot" :class="{ active: i === carouselIndex }" @click="carouselIndex = i" :aria-label="`Slide ${i + 1}`"></button>
        <button class="landing-carousel-btn" @click="nextSlide" aria-label="Suivant">→</button>
      </div>
    </section>

    <!-- 6. MULTI-TENANCY -->
    <section id="multi-tenancy" class="landing-section">
      <div class="landing-section-header landing-animate">
        <span class="landing-section-label">Multi-Tenant</span>
        <h2 class="landing-section-title">Isolation totale des données</h2>
        <p class="landing-section-desc">Chaque restaurant opère indépendamment sur une plateforme partagée avec une confidentialité totale.</p>
      </div>
      <div class="landing-tenancy-diagram landing-animate">
        <div class="landing-tenancy-row">
          <div class="landing-tenancy-card">
            <div class="landing-tenancy-card-title">Restaurant A</div>
            <div class="landing-tenancy-card-desc">Centre-ville</div>
          </div>
          <div class="landing-tenancy-card">
            <div class="landing-tenancy-card-title">Restaurant B</div>
            <div class="landing-tenancy-card-desc">Quartier Nord</div>
          </div>
          <div class="landing-tenancy-card">
            <div class="landing-tenancy-card-title">Restaurant C</div>
            <div class="landing-tenancy-card-desc">Aéroport</div>
          </div>
        </div>
        <div class="landing-tenancy-arrow">↓</div>
        <div class="landing-tenancy-platform">Plateforme partagée</div>
        <div class="landing-tenancy-arrow">↓</div>
        <div class="landing-tenancy-isolation">Isolation totale des données</div>
      </div>
    </section>

    <!-- 7. SYNCHRONIZATION -->
    <section id="sync" class="landing-section">
      <div class="landing-section-header landing-animate">
        <span class="landing-section-label">Synchronisation</span>
        <h2 class="landing-section-title">Connectez n'importe quelle caisse</h2>
        <p class="landing-section-desc">Nous supportons plusieurs méthodes de connexion pour fonctionner avec votre infrastructure existante.</p>
      </div>
      <div class="landing-connectors">
        <div class="landing-connector-card landing-animate">
          <h3 class="landing-connector-title">Connecteur Base de Données</h3>
          <p class="landing-connector-desc">Connexion directe à la base de données pour une synchronisation en temps réel.</p>
          <div class="landing-connector-tags">
            <span class="landing-connector-tag">SQL Server</span>
            <span class="landing-connector-tag">PostgreSQL</span>
            <span class="landing-connector-tag">MySQL</span>
            <span class="landing-connector-tag">SQLite</span>
          </div>
        </div>
        <div class="landing-connector-card landing-animate">
          <h3 class="landing-connector-title">API REST</h3>
          <p class="landing-connector-desc">Connexion via API lorsque l'accès direct à la base n'est pas disponible.</p>
          <div class="landing-connector-tags">
            <span class="landing-connector-tag">REST API</span>
            <span class="landing-connector-tag">Clé API</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 8. USER ROLES -->
    <section id="roles" class="landing-section">
      <div class="landing-section-header landing-animate">
        <span class="landing-section-label">Rôles utilisateurs</span>
        <h2 class="landing-section-title">Accès basé sur les rôles pour votre équipe</h2>
        <p class="landing-section-desc">Chaque membre voit exactement ce dont il a besoin, rien de plus.</p>
      </div>
      <div class="landing-roles-grid">
        <div class="landing-role-card landing-animate">
          <div class="landing-role-icon" style="background: rgba(239, 68, 68, 0.1); color: var(--coral);">A</div>
          <h3 class="landing-role-title">Administrateur</h3>
          <p class="landing-role-desc">Accès complet à toutes les fonctionnalités, données financières et configuration.</p>
          <ul class="landing-role-responsibilities">
            <li>Gérer les utilisateurs et permissions</li>
            <li>Consulter les rapports financiers</li>
            <li>Configurer le système</li>
            <li>Gérer les tenants</li>
          </ul>
        </div>
        <div class="landing-role-card landing-animate">
          <div class="landing-role-icon" style="background: rgba(245, 158, 11, 0.1); color: var(--amber);">M</div>
          <h3 class="landing-role-title">Gérant</h3>
          <p class="landing-role-desc">Gérer les stocks, les transferts et les opérations quotidiennes. Données financières masquées.</p>
          <ul class="landing-role-responsibilities">
            <li>Gérer les niveaux de stock</li>
            <li>Approuver les transferts</li>
            <li>Suivre les pertes</li>
            <li>Consulter les rapports opérationnels</li>
          </ul>
        </div>
        <div class="landing-role-card landing-animate">
          <div class="landing-role-icon" style="background: rgba(59, 130, 246, 0.1); color: var(--blue);">C</div>
          <h3 class="landing-role-title">Personnel de cuisine</h3>
          <p class="landing-role-desc">Vue ciblée sur les stocks de cuisine et les tâches de préparation.</p>
          <ul class="landing-role-responsibilities">
            <li>Consulter les stocks d'ingrédients</li>
            <li>Demander du réapprovisionnement</li>
            <li>Suivre l'utilisation des recettes</li>
            <li>Signaler les pertes</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- 9. TESTIMONIALS -->
    <section id="testimonials" class="landing-section">
      <div class="landing-section-header landing-animate">
        <span class="landing-section-label">Témoignages</span>
        <h2 class="landing-section-title">Approuvé par les professionnels de la restauration</h2>
        <p class="landing-section-desc">Découvrez ce que disent les équipes qui utilisent mePOS Inventory Intel au quotidien.</p>
      </div>
      <div class="landing-testimonials-grid">
        <div v-for="t in testimonials" :key="t.name" class="landing-testimonial-card landing-animate">
          <p class="landing-testimonial-text">"{{ t.text }}"</p>
          <div class="landing-testimonial-author">
            <div class="landing-testimonial-avatar">{{ t.initial }}</div>
            <div>
              <div class="landing-testimonial-name">{{ t.name }}</div>
              <div class="landing-testimonial-role">{{ t.role }}</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 10. FAQ -->
    <section id="faq" class="landing-section">
      <div class="landing-section-header landing-animate">
        <span class="landing-section-label">FAQ</span>
        <h2 class="landing-section-title">Questions fréquentes</h2>
        <p class="landing-section-desc">Tout ce que vous devez savoir sur mePOS Inventory Intel.</p>
      </div>
      <div class="landing-faq-list">
        <div v-for="(faq, i) in faqs" :key="i" class="landing-faq-item landing-animate">
          <button class="landing-faq-question" @click="toggleFaq(i)" :aria-expanded="openFaq === i">
            {{ faq.q }}
            <span class="landing-faq-icon" :class="{ open: openFaq === i }">+</span>
          </button>
          <div v-if="openFaq === i" class="landing-faq-answer">
            {{ faq.a }}
          </div>
        </div>
      </div>
    </section>

    <!-- 11. CTA -->
    <section id="cta" class="landing-cta">
      <div class="landing-animate">
        <h2 class="landing-cta-title">Prêt à transformer votre gestion de stocks ?</h2>
        <p class="landing-cta-desc">Rejoignez les centaines de restaurants qui font confiance à mePOS Inventory Intel.</p>
        <div class="landing-cta-actions">
          <button class="landing-hero-btn-primary" @click="goLogin">
            {{ isLoggedIn ? 'Mon compte' : 'Connexion' }}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
      </div>
    </section>

    <!-- 12. FOOTER -->
    <footer class="landing-footer">
      <div class="landing-footer-grid">
        <div class="landing-footer-brand">
          <a class="landing-nav-logo" href="/">
            <img :src="sideLogoSrc" alt="mePOS" style="height: 32px;">
          </a>
          <p>Intelligence d'inventaire en temps réel pour les restaurants. Synchronisez, suivez et optimisez vos stocks sur tous vos sites.</p>
        </div>
        <div>
          <div class="landing-footer-col-title">Produit</div>
          <ul class="landing-footer-links">
            <li><button class="landing-footer-link" @click="scrollTo('features')">Fonctionnalités</button></li>
            <li><button class="landing-footer-link" @click="scrollTo('how-it-works')">Comment ça marche</button></li>
            <li><button class="landing-footer-link" @click="scrollTo('screenshots')">Captures d'écran</button></li>
            <li><button class="landing-footer-link" @click="scrollTo('faq')">FAQ</button></li>
          </ul>
        </div>
        <div>
          <div class="landing-footer-col-title">Ressources</div>
          <ul class="landing-footer-links">
            <li><button class="landing-footer-link">Documentation</button></li>
            <li><button class="landing-footer-link">Référence API</button></li>
            <li><button class="landing-footer-link">Statut</button></li>
            <li><button class="landing-footer-link">Mises à jour</button></li>
          </ul>
        </div>
        <div>
          <div class="landing-footer-col-title">Légal</div>
          <ul class="landing-footer-links">
            <li><button class="landing-footer-link">Politique de confidentialité</button></li>
            <li><button class="landing-footer-link">Conditions d'utilisation</button></li>
          </ul>
        </div>
      </div>
      <div class="landing-footer-bottom">
        <span>&copy; {{ new Date().getFullYear() }} mePOS Inventory Intel. Tous droits réservés.</span>
        <div class="landing-footer-social">
          <a href="#" aria-label="Twitter">Twitter</a>
          <a href="#" aria-label="LinkedIn">LinkedIn</a>
          <a href="#" aria-label="GitHub">GitHub</a>
        </div>
      </div>
    </footer>
  </div>
</template>
