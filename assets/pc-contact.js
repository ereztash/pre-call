/* One buyer route for every place that sends a prospect out of the product. */
(function (root) {
  'use strict';

  const ROUTE = 'https://wa.me/972524545963';

  function href(message) {
    const to = ROUTE.trim();
    if (!to || message == null) return to;
    const sep = to.includes('?') ? '&' : '?';
    if (/^mailto:/i.test(to)) return to + sep + 'body=' + encodeURIComponent(message);
    if (/^https?:/i.test(to)) return to + sep + 'text=' + encodeURIComponent(message);
    return to;
  }

  function wire(scope) {
    if (typeof document === 'undefined') return;
    const base = scope || document;
    base.querySelectorAll('[data-contact-route]').forEach(function (a) {
      const message = a.getAttribute('data-contact-message') || '';
      a.href = href(message);
    });
  }

  root.PC = root.PC || {};
  root.PC.contact = { ROUTE, href, wire };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { wire(); });
    else wire();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = root.PC.contact;
})(typeof window !== 'undefined' ? window : globalThis);
