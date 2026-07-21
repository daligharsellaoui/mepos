<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import logoSrc from '../assets/logo.png'
import heroSrc from '../assets/hero.png'
import '../styles/landing.css'

const router = useRouter()

const scrolled = ref(false)
const mobileOpen = ref(false)

function onScroll() {
  scrolled.value = window.scrollY > 20
}

onMounted(() => {
  window.addEventListener('scroll', onScroll)
  observeSections()
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})

function scrollTo(id) {
  mobileOpen.value = false
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

function goLogin() {
  router.push('/login')
}

function goApp() {
  router.push('/app')
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
const carouselSlides = ['Dashboard', 'Inventory', 'Recipes', 'Transfers', 'Synchronization', 'Reports', 'Agent Monitoring']

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
    q: 'Can I use my current POS system?',
    a: 'Yes. mePOS Inventory Intel works alongside your existing POS. Our synchronization agent connects to your current system without requiring any changes to your setup.'
  },
  {
    q: 'Do I need to replace my POS?',
    a: 'No. We connect to your existing POS through a database connector or REST API. There is no need to replace or modify your current system.'
  },
  {
    q: 'How is inventory synchronized?',
    a: 'Our synchronization agent runs on your local network, reads sales data from your POS, and sends it to the cloud. Inventory is updated in real time across all locations.'
  },
  {
    q: 'Can I manage multiple restaurants?',
    a: 'Yes. mePOS Inventory Intel is built as a multi-tenant platform. Each restaurant is fully isolated, and you can manage all locations from a single dashboard.'
  },
  {
    q: 'How secure is the system?',
    a: 'All data is encrypted in transit and at rest. Each tenant is isolated with strict role-based access controls. We follow industry-standard security practices.'
  },
  {
    q: 'Can I use SQL Server?',
    a: 'Yes. We support SQL Server, PostgreSQL, MySQL, and SQLite. Our database connector works with any SQL database your POS uses.'
  },
  {
    q: 'Can I connect using an API?',
    a: 'Yes. If your POS exposes a REST API, you can connect using our API connector with an API key. No database access required.'
  },
  {
    q: 'Can I use multiple warehouses?',
    a: 'Yes. You can manage multiple warehouses and transfer stock between them. Each location can have its own inventory while remaining visible from the central dashboard.'
  }
]

const features = [
  { title: 'Inventory Management', desc: 'Track stock levels in real time across all locations. Set reorder points and receive alerts before you run out.', icon: '📦', bg: 'rgba(99, 102, 241, 0.1)' },
  { title: 'Recipe Management', desc: 'Create and manage recipes with precise ingredient quantities. Calculate costs and track usage automatically.', icon: '📋', bg: 'rgba(16, 185, 129, 0.1)' },
  { title: 'Stock Movements', desc: 'Monitor every stock movement from receipt to consumption. Full audit trail for compliance and analysis.', icon: '🔄', bg: 'rgba(245, 158, 11, 0.1)' },
  { title: 'Warehouse Transfers', desc: 'Transfer stock between locations with a few clicks. Track shipments and maintain optimal inventory at each site.', icon: '🚚', bg: 'rgba(59, 130, 246, 0.1)' },
  { title: 'Loss & Waste Tracking', desc: 'Record and analyze waste to identify patterns. Reduce spoilage and improve profitability.', icon: '📉', bg: 'rgba(239, 68, 68, 0.1)' },
  { title: 'Supplier Management', desc: 'Manage supplier information, pricing, and lead times. Streamline your procurement process.', icon: '🤝', bg: 'rgba(99, 102, 241, 0.1)' },
  { title: 'Purchase Orders', desc: 'Generate and track purchase orders. Automate reordering based on stock levels and usage patterns.', icon: '📄', bg: 'rgba(16, 185, 129, 0.1)' },
  { title: 'Real-Time Synchronization', desc: 'Sales data flows from your POS to inventory automatically. No manual entry required.', icon: '⚡', bg: 'rgba(245, 158, 11, 0.1)' },
  { title: 'Multi-Tenant SaaS', desc: 'Each restaurant is fully isolated. Manage multiple locations from a single dashboard.', icon: '🏢', bg: 'rgba(59, 130, 246, 0.1)' },
  { title: 'Role-Based Permissions', desc: 'Granular access control for administrators, managers, and kitchen staff.', icon: '🔐', bg: 'rgba(239, 68, 68, 0.1)' },
  { title: 'Agent Monitoring', desc: 'Monitor synchronization agents across all locations. Get alerts when agents go offline.', icon: '📡', bg: 'rgba(99, 102, 241, 0.1)' },
  { title: 'Reports & Analytics', desc: 'Comprehensive reports on inventory, usage, waste, and costs. Make data-driven decisions.', icon: '📊', bg: 'rgba(16, 185, 129, 0.1)' },
  { title: 'Notifications', desc: 'Real-time alerts for low stock, unusual activity, and synchronization issues.', icon: '🔔', bg: 'rgba(245, 158, 11, 0.1)' }
]

const benefits = [
  { title: 'Works with Existing POS', desc: 'No need to replace your current system. We connect to whatever POS you use.', icon: '🔄' },
  { title: 'Real-Time Inventory', desc: 'Know exactly what you have at every location, at any moment. No more guesswork.', icon: '⚡' },
  { title: 'Reduce Waste', desc: 'Identify and eliminate waste patterns. Save money and operate more sustainably.', icon: '♻️' },
  { title: 'Monitor Every Ingredient', desc: 'Track every ingredient from delivery to plate. Full visibility into your supply chain.', icon: '🔍' },
  { title: 'Multi-Restaurant Support', desc: 'Manage all your locations from one dashboard. Consistent operations across branches.', icon: '🏪' },
  { title: 'Automatic Synchronization', desc: 'Sales data flows automatically. No manual data entry or reconciliation needed.', icon: '🤖' },
  { title: 'Secure & Cloud Based', desc: 'Enterprise-grade security with encrypted data. Access your inventory from anywhere.', icon: '☁️' },
  { title: 'No Need To Replace', desc: 'Your team keeps using the POS they know. We handle the synchronization silently.', icon: '✅' }
]

const testimonials = [
  {
    text: 'mePOS Inventory Intel transformed how we manage stock across our three locations. We reduced waste by 30% in the first month.',
    name: 'Karim Ben Ali',
    role: 'Owner, Le Petit Chef Group',
    initial: 'K'
  },
  {
    text: 'The real-time synchronization is a game changer. No more manual inventory counts or surprise shortages during service.',
    name: 'Sofia Mansour',
    role: 'Operations Manager, Urban Bites',
    initial: 'S'
  },
  {
    text: 'As a chef, I can finally focus on cooking instead of counting ingredients. The system alerts me before we run out of anything.',
    name: 'Youssef Haddad',
    role: 'Head Chef, La Maison',
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
          <img :src="logoSrc" alt="mePOS">
          <span>mePOS</span>
        </a>
        <div class="landing-nav-links">
          <button class="landing-nav-link" @click="scrollTo('features')">Features</button>
          <button class="landing-nav-link" @click="scrollTo('how-it-works')">How It Works</button>
          <button class="landing-nav-link" @click="scrollTo('faq')">FAQ</button>
          <button class="landing-nav-link" @click="scrollTo('contact')">Contact</button>
          <button class="landing-nav-login" @click="goLogin">Login</button>
          <button class="landing-nav-cta" @click="scrollTo('cta')">Request Demo</button>
        </div>
        <button class="landing-hamburger" @click="mobileOpen = !mobileOpen" aria-label="Toggle menu">
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
      <button class="landing-mobile-link" @click="scrollTo('features')">Features</button>
      <button class="landing-mobile-link" @click="scrollTo('how-it-works')">How It Works</button>
      <button class="landing-mobile-link" @click="scrollTo('faq')">FAQ</button>
      <button class="landing-mobile-link" @click="scrollTo('contact')">Contact</button>
      <button class="landing-mobile-link" @click="goLogin">Login</button>
      <button class="landing-mobile-cta" @click="scrollTo('cta')">Request Demo</button>
    </div>

    <!-- 1. HERO -->
    <section class="landing-hero">
      <div class="landing-hero-content">
        <div class="landing-hero-badge">
          <span>Real-Time Inventory Intelligence</span>
        </div>
        <h1 class="landing-hero-title">
          Never run out of<br><span>what matters most</span>
        </h1>
        <p class="landing-hero-desc">
          mePOS Inventory Intel synchronizes inventory across all your restaurant locations in real time. Reduce waste, optimize stock, and manage multi-branch operations from one dashboard.
        </p>
        <div class="landing-hero-actions">
          <button class="landing-hero-btn-primary" @click="scrollTo('cta')">
            Start Free Trial
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
          <button class="landing-hero-btn-secondary" @click="scrollTo('how-it-works')">
            Watch Demo
          </button>
          <button class="landing-hero-btn-secondary" @click="goLogin">
            Login
          </button>
        </div>
      </div>
      <div class="landing-hero-visual">
        <div class="landing-hero-mockup">
          <img :src="heroSrc" alt="mePOS Inventory Intel Dashboard">
        </div>
      </div>
    </section>

    <!-- 2. FEATURES -->
    <section id="features" class="landing-section">
      <div class="landing-section-header landing-animate">
        <span class="landing-section-label">Features</span>
        <h2 class="landing-section-title">Everything you need to manage inventory</h2>
        <p class="landing-section-desc">From real-time tracking to multi-location management, mePOS Inventory Intel gives you complete control over your stock.</p>
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
        <span class="landing-section-label">How It Works</span>
        <h2 class="landing-section-title">From POS to cloud in real time</h2>
        <p class="landing-section-desc">Your sales data flows automatically from your POS to your inventory dashboard.</p>
      </div>
      <div class="landing-flow">
        <div class="landing-flow-step landing-animate">
          <div class="landing-flow-step-num">1</div>
          <div class="landing-flow-step-content">
            <div class="landing-flow-step-title">Restaurant POS</div>
            <div class="landing-flow-step-desc">Your existing POS system records every sale</div>
          </div>
        </div>
        <div class="landing-flow-arrow">?</div>
        <div class="landing-flow-step landing-animate">
          <div class="landing-flow-step-num">2</div>
          <div class="landing-flow-step-content">
            <div class="landing-flow-step-title">Synchronization Agent</div>
            <div class="landing-flow-step-desc">Runs on your local network, reads sales data securely</div>
          </div>
        </div>
        <div class="landing-flow-arrow">?</div>
        <div class="landing-flow-step landing-animate">
          <div class="landing-flow-step-num">3</div>
          <div class="landing-flow-step-content">
            <div class="landing-flow-step-title">Inventory Intel Cloud</div>
            <div class="landing-flow-step-desc">Processes and stores data with complete tenant isolation</div>
          </div>
        </div>
        <div class="landing-flow-arrow">?</div>
        <div class="landing-flow-step landing-animate">
          <div class="landing-flow-step-num">4</div>
          <div class="landing-flow-step-content">
            <div class="landing-flow-step-title">Automatic Inventory Updates</div>
            <div class="landing-flow-step-desc">Real-time stock levels, alerts, and analytics across all locations</div>
          </div>
        </div>
      </div>
      <div class="landing-connectors">
        <div class="landing-connector-card landing-animate">
          <h3 class="landing-connector-title">Database Connector</h3>
          <p class="landing-connector-desc">Connect directly to your POS database for real-time synchronization.</p>
          <div class="landing-connector-tags">
            <span class="landing-connector-tag">SQL Server</span>
            <span class="landing-connector-tag">PostgreSQL</span>
            <span class="landing-connector-tag">MySQL</span>
            <span class="landing-connector-tag">SQLite</span>
          </div>
        </div>
        <div class="landing-connector-card landing-animate">
          <h3 class="landing-connector-title">REST API Connector</h3>
          <p class="landing-connector-desc">Connect via API when direct database access is not available.</p>
          <div class="landing-connector-tags">
            <span class="landing-connector-tag">REST API</span>
            <span class="landing-connector-tag">API Key</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 4. WHY CHOOSE MEPOS -->
    <section id="why-mepos" class="landing-section">
      <div class="landing-section-header landing-animate">
        <span class="landing-section-label">Why mePOS</span>
        <h2 class="landing-section-title">Built for restaurants, by restaurant people</h2>
        <p class="landing-section-desc">We understand the challenges of running a food business. Our platform is designed to solve real problems.</p>
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
        <span class="landing-section-label">Product</span>
        <h2 class="landing-section-title">See it in action</h2>
        <p class="landing-section-desc">A clean, modern interface designed for busy restaurant teams.</p>
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
        <button class="landing-carousel-btn" @click="prevSlide" aria-label="Previous">?</button>
        <button v-for="(_, i) in carouselSlides" :key="i" class="landing-carousel-dot" :class="{ active: i === carouselIndex }" @click="carouselIndex = i" :aria-label="`Slide ${i + 1}`"></button>
        <button class="landing-carousel-btn" @click="nextSlide" aria-label="Next">?</button>
      </div>
    </section>

    <!-- 6. MULTI-TENANCY -->
    <section id="multi-tenancy" class="landing-section">
      <div class="landing-section-header landing-animate">
        <span class="landing-section-label">Multi-Tenancy</span>
        <h2 class="landing-section-title">Complete data isolation</h2>
        <p class="landing-section-desc">Each restaurant operates independently on a shared platform with full data privacy.</p>
      </div>
      <div class="landing-tenancy-diagram landing-animate">
        <div class="landing-tenancy-row">
          <div class="landing-tenancy-card">
            <div class="landing-tenancy-card-title">Restaurant A</div>
            <div class="landing-tenancy-card-desc">Downtown Location</div>
          </div>
          <div class="landing-tenancy-card">
            <div class="landing-tenancy-card-title">Restaurant B</div>
            <div class="landing-tenancy-card-desc">Uptown Location</div>
          </div>
          <div class="landing-tenancy-card">
            <div class="landing-tenancy-card-title">Restaurant C</div>
            <div class="landing-tenancy-card-desc">Airport Location</div>
          </div>
        </div>
        <div class="landing-tenancy-arrow">?</div>
        <div class="landing-tenancy-platform">Shared Platform</div>
        <div class="landing-tenancy-arrow">?</div>
        <div class="landing-tenancy-isolation">Complete Data Isolation</div>
      </div>
    </section>

    <!-- 7. SYNCHRONIZATION -->
    <section id="sync" class="landing-section">
      <div class="landing-section-header landing-animate">
        <span class="landing-section-label">Synchronization</span>
        <h2 class="landing-section-title">Connect any POS system</h2>
        <p class="landing-section-desc">We support multiple connection methods to work with your existing infrastructure.</p>
      </div>
      <div class="landing-connectors">
        <div class="landing-connector-card landing-animate">
          <h3 class="landing-connector-title">Database Connector</h3>
          <p class="landing-connector-desc">Direct database connection for real-time synchronization. Works with any SQL database.</p>
          <div class="landing-connector-tags">
            <span class="landing-connector-tag">SQL Server</span>
            <span class="landing-connector-tag">PostgreSQL</span>
            <span class="landing-connector-tag">MySQL</span>
            <span class="landing-connector-tag">SQLite</span>
          </div>
        </div>
        <div class="landing-connector-card landing-animate">
          <h3 class="landing-connector-title">REST API</h3>
          <p class="landing-connector-desc">Connect via API when direct database access is not available.</p>
          <div class="landing-connector-tags">
            <span class="landing-connector-tag">REST API</span>
            <span class="landing-connector-tag">API Key</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 8. USER ROLES -->
    <section id="roles" class="landing-section">
      <div class="landing-section-header landing-animate">
        <span class="landing-section-label">User Roles</span>
        <h2 class="landing-section-title">Role-based access for your team</h2>
        <p class="landing-section-desc">Every team member sees exactly what they need, nothing more.</p>
      </div>
      <div class="landing-roles-grid">
        <div class="landing-role-card landing-animate">
          <div class="landing-role-icon" style="background: rgba(239, 68, 68, 0.1); color: var(--coral);">A</div>
          <h3 class="landing-role-title">Administrator</h3>
          <p class="landing-role-desc">Full access to all features, financial data, and system configuration.</p>
          <ul class="landing-role-responsibilities">
            <li>Manage users and permissions</li>
            <li>View financial reports</li>
            <li>Configure system settings</li>
            <li>Manage tenants</li>
          </ul>
        </div>
        <div class="landing-role-card landing-animate">
          <div class="landing-role-icon" style="background: rgba(245, 158, 11, 0.1); color: var(--amber);">M</div>
          <h3 class="landing-role-title">Manager</h3>
          <p class="landing-role-desc">Manage inventory, transfers, and daily operations. Financial data is masked.</p>
          <ul class="landing-role-responsibilities">
            <li>Manage stock levels</li>
            <li>Approve transfers</li>
            <li>Track losses</li>
            <li>View operational reports</li>
          </ul>
        </div>
        <div class="landing-role-card landing-animate">
          <div class="landing-role-icon" style="background: rgba(59, 130, 246, 0.1); color: var(--blue);">K</div>
          <h3 class="landing-role-title">Kitchen Staff</h3>
          <p class="landing-role-desc">Focused view of kitchen inventory and preparation tasks.</p>
          <ul class="landing-role-responsibilities">
            <li>View ingredient stock</li>
            <li>Request replenishment</li>
            <li>Track recipe usage</li>
            <li>Report losses</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- 9. TESTIMONIALS -->
    <section id="testimonials" class="landing-section">
      <div class="landing-section-header landing-animate">
        <span class="landing-section-label">Testimonials</span>
        <h2 class="landing-section-title">Trusted by restaurant professionals</h2>
        <p class="landing-section-desc">Hear from the teams that use mePOS Inventory Intel every day.</p>
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
        <h2 class="landing-section-title">Frequently asked questions</h2>
        <p class="landing-section-desc">Everything you need to know about mePOS Inventory Intel.</p>
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
        <h2 class="landing-cta-title">Ready to transform your inventory?</h2>
        <p class="landing-cta-desc">Join hundreds of restaurants that trust mePOS Inventory Intel to manage their stock efficiently.</p>
        <div class="landing-cta-actions">
          <button class="landing-hero-btn-primary" @click="goApp">
            Start Free Trial
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
          <button class="landing-hero-btn-secondary">Contact Sales</button>
        </div>
      </div>
    </section>

    <!-- 12. FOOTER -->
    <footer id="contact" class="landing-footer">
      <div class="landing-footer-grid">
        <div class="landing-footer-brand">
          <a class="landing-nav-logo" href="/">
            <img :src="logoSrc" alt="mePOS" style="height: 32px;">
            <span>mePOS</span>
          </a>
          <p>Real-time inventory intelligence for restaurants. Synchronize, track, and optimize your stock across all locations.</p>
        </div>
        <div>
          <div class="landing-footer-col-title">Product</div>
          <ul class="landing-footer-links">
            <li><button class="landing-footer-link" @click="scrollTo('features')">Features</button></li>
            <li><button class="landing-footer-link" @click="scrollTo('how-it-works')">How It Works</button></li>
            <li><button class="landing-footer-link" @click="scrollTo('screenshots')">Screenshots</button></li>
            <li><button class="landing-footer-link" @click="scrollTo('faq')">FAQ</button></li>
          </ul>
        </div>
        <div>
          <div class="landing-footer-col-title">Resources</div>
          <ul class="landing-footer-links">
            <li><button class="landing-footer-link">Documentation</button></li>
            <li><button class="landing-footer-link">API Reference</button></li>
            <li><button class="landing-footer-link">Status</button></li>
            <li><button class="landing-footer-link">Changelog</button></li>
          </ul>
        </div>
        <div>
          <div class="landing-footer-col-title">Company</div>
          <ul class="landing-footer-links">
            <li><button class="landing-footer-link">Contact</button></li>
            <li><button class="landing-footer-link">Privacy Policy</button></li>
            <li><button class="landing-footer-link">Terms of Service</button></li>
          </ul>
        </div>
      </div>
      <div class="landing-footer-bottom">
        <span>&copy; {{ new Date().getFullYear() }} mePOS Inventory Intel. All rights reserved.</span>
        <div class="landing-footer-social">
          <a href="#" aria-label="Twitter">Twitter</a>
          <a href="#" aria-label="LinkedIn">LinkedIn</a>
          <a href="#" aria-label="GitHub">GitHub</a>
        </div>
      </div>
    </footer>
  </div>
</template>
