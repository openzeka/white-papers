/* cookie-banner.js — Consent Mode v2 entegrasyonu
 * localStorage'da kararı saklar, gtag('consent', 'update', ...) çağırır.
 * Banner HTML'i ile birlikte yüklenir (head_custom.html + cookie-banner.html).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'cookieConsent';
  var banner = document.getElementById('cookie-consent-banner');
  if (!banner) return;

  // Sayfa yüklendiğinde zaten karar verilmişse bannerı gizle.
  var stored = null;
  try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}

  function applyConsent(state) {
    if (typeof gtag !== 'function') return;
    if (state === 'accepted') {
      gtag('consent', 'update', {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
        analytics_storage: 'granted'
      });
    } else {
      gtag('consent', 'update', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: 'denied'
      });
    }
  }

  function hideBanner() {
    banner.hidden = true;
    banner.removeAttribute('data-consent-state');
  }

  function showBanner() {
    banner.hidden = false;
    banner.setAttribute('data-consent-state', 'pending');
  }

  function setConsent(state) {
    try { localStorage.setItem(STORAGE_KEY, state); } catch (e) {}
    applyConsent(state);
    hideBanner();
    // Etkinlik kaydı (sadece kabul/red eylemi için)
    if (typeof gtag === 'function') {
      gtag('event', 'cookie_consent', {
        'consent_state': state
      });
    }
  }

  // Eğer karar yoksa bannerı göster.
  if (stored !== 'accepted' && stored !== 'rejected') {
    showBanner();
  } else {
    // Eski kararı uygula (Consent Mode tekrar set edilsin).
    applyConsent(stored);
  }

  // Buton event'leri
  banner.addEventListener('click', function (e) {
    var action = e.target.getAttribute('data-consent-action');
    if (action === 'accepted' || action === 'rejected') {
      setConsent(action);
    }
  });
})();
