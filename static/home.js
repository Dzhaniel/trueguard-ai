/* ============================================================
   TrueGuard AI — home.js
   Simple entrance animations for home page
   ============================================================ */

// Stagger-animate elements on load
document.addEventListener('DOMContentLoaded', () => {
  const els = document.querySelectorAll(
    '.hero-badge, .hero-title, .hero-sub, .cta-btn, .hero-trust, .feature-card, .ex-card'
  );

  els.forEach((el, i) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    setTimeout(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, 80 + i * 60);
  });
});