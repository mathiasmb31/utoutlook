// ============================================================
// gestures.js — Touch gestures for Outlook web on Ubuntu Touch
// Injected into the Outlook web page via executeJavaScript()
// ============================================================

(function () {
    'use strict';

    // Prevent double-injection
    if (window.__utoutlookGesturesLoaded) return;
    window.__utoutlookGesturesLoaded = true;

    // --- Disable native overscroll/pull-to-refresh on the page ---
    // Outlook web shows an envelope icon when the user pulls down from the
    // top of the message list. Block it at the CSS level (inline style as a
    // fallback — main.css also sets this with !important via insertCSS).
    document.documentElement.style.overscrollBehaviorY = 'none';
    document.body.style.overscrollBehaviorY = 'none';

    // Ensure scroll containers don't bounce
    const scrollStyle = document.createElement('style');
    scrollStyle.textContent =
        'html, body { overscroll-behavior-y: none !important; }' +
        '[class*="messageList"], [class*="listView"], [role="list"], [role="grid"]' +
        ' { overscroll-behavior-y: contain !important; }';
    document.head.appendChild(scrollStyle);

    // ============================================================
    // MutationObserver — Cache dynamiquement les indicateurs de
    // chargement (enveloppe bleue) qui apparaissent après le
    // chargement initial (SPA Outlook). Le CSS statique ne suffit
    // pas car Outlook recrée les nœuds DOM à chaque navigation.
    // ============================================================
    const HIDE_STYLE = 'display:none!important;visibility:hidden!important;opacity:0!important;height:0!important;min-height:0!important;max-height:0!important;overflow:hidden!important;pointer-events:none!important;';

    // Sélecteurs pour détecter les indicateurs de chargement
    const LOADING_SELECTORS = [
        '[role="progressbar"]',
        '[aria-busy="true"]',
        '[aria-label*="loading" i]',
        '[aria-label*="chargement" i]',
        '[aria-label*="refresh" i]',
        '[aria-label*="actualis" i]',
        '[aria-label*="sync" i]',
        '[data-automation-id*="spinner" i]',
        '[data-automation-id*="loading" i]',
        '[data-automation-id*="progress" i]',
        '[data-automation-id*="refresh" i]',
        '[data-automation-id*="pull" i]',
        '[class*="pullToRefresh"]',
        '[class*="refreshIndicator"]',
        '[class*="refreshControl"]',
        '[class*="overscrollIndicator"]',
        '[class*="listLoading"]',
        '[class*="loadingMore"]',
        '[class*="loadMoreIndicator"]',
        '[class*="messageListSpinner"]',
        '[class*="loadingOverlay"]',
        '[class*="loadingBackdrop"]',
        '[class*="refreshOverlay"]',
        '[class*="skeleton"]',
        '[class*="Skeleton"]',
        '[class*="shimmer"]',
        '[class*="Shimmer"]',
        '[class*="ProgressRing"]',
        '[class*="progressRing"]',
        '[class*="Spinner"]',
        '[class*="spinner"]',
        '[class*="spin"]',
        '[class*="Spin"]',
        '[class*="fui-Spinner"]',
        '[class*="fui-ProgressIndicator"]',
        '[class*="fui-ProgressRing"]',
        '[class*="ms-Spinner"]',
        '[class*="ms-ProgressIndicator"]',
        '[class*="ProgressIndicator"]'
    ];

    // Containers de liste à surveiller
    const LIST_SELECTORS = '[role="list"], [role="grid"], [class*="messageList"], [class*="listView"], [class*="virtualizedList"]';

    function isInListContext(el) {
        // Vérifier si l'élément est dans un conteneur de liste
        return el.closest(LIST_SELECTORS) !== null;
    }

    function hideLoadingIndicators(root) {
        if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
        for (const selector of LOADING_SELECTORS) {
            try {
                const elements = root.querySelectorAll(selector);
                elements.forEach(el => {
                    // Ne cacher que si dans un contexte de liste ou si c'est un overlay global
                    if (isInListContext(el) || selector.includes('Overlay') || selector.includes('Backdrop') || selector.includes('pullToRefresh') || selector.includes('refreshIndicator') || selector.includes('overscroll')) {
                        el.style.cssText += HIDE_STYLE;
                        el.setAttribute('data-utoutlook-hidden', 'true');
                    }
                });
                // Vérifier si le root lui-même correspond
                if (root.matches && root.matches(selector)) {
                    if (isInListContext(root) || selector.includes('Overlay') || selector.includes('Backdrop') || selector.includes('pullToRefresh')) {
                        root.style.cssText += HIDE_STYLE;
                        root.setAttribute('data-utoutlook-hidden', 'true');
                    }
                }
            } catch (e) { /* sélecteur invalide, ignorer */ }
        }
    }

    // Observer les mutations dans les conteneurs de liste
    const listObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            // Nouveaux nœuds ajoutés
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    hideLoadingIndicators(node);
                }
            }
            // Attributs modifiés (aria-busy, class, etc.)
            if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
                hideLoadingIndicators(mutation.target.parentElement || mutation.target);
            }
        }
    });

    function observeListContainer(container) {
        if (!container || container.hasAttribute('data-utoutlook-observed')) return;
        container.setAttribute('data-utoutlook-observed', 'true');
        listObserver.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-busy', 'aria-label', 'style', 'data-automation-id'] });
        hideLoadingIndicators(container);
    }

    // Observer le body pour détecter les nouveaux conteneurs de liste
    const bodyObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Nouveau conteneur de liste
                    if (node.matches && node.matches(LIST_SELECTORS)) {
                        observeListContainer(node);
                    }
                    // Chercher des conteneurs de liste dans le nouveau nœud
                    if (node.querySelectorAll) {
                        node.querySelectorAll(LIST_SELECTORS).forEach(observeListContainer);
                    }
                    // Cacher les indicateurs dans le nouveau nœud
                    hideLoadingIndicators(node);
                }
            }
        }
    });

    // Démarrer l'observation quand le DOM est prêt
    function startObserving() {
        bodyObserver.observe(document.body, { childList: true, subtree: true });
        // Observer les conteneurs existants
        document.querySelectorAll(LIST_SELECTORS).forEach(observeListContainer);
        // Cacher les indicateurs existants
        hideLoadingIndicators(document.body);
        console.log('[gestures] Loading indicator observer started');
    }

    if (document.body) {
        startObserving();
    } else {
        document.addEventListener('DOMContentLoaded', startObserving);
    }

    // Réappliquer périodiquement (sécurité anti-régression SPA)
    setInterval(() => {
        document.querySelectorAll(LIST_SELECTORS).forEach(observeListContainer);
        hideLoadingIndicators(document.body);
    }, 3000);

    // --- Swipe from left edge to go back (browser history) ---
    let touchStartX = 0;
    let touchStartY = 0;
    let trackingSwipe = false;

    document.addEventListener('touchstart', function (e) {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            // Only track swipes starting from the left 50px edge
            trackingSwipe = touchStartX < 50;
        }
    }, {passive: true});

    document.addEventListener('touchend', function (e) {
        if (!trackingSwipe || e.changedTouches.length !== 1) return;
        trackingSwipe = false;
        const diffX = e.changedTouches[0].clientX - touchStartX;
        const diffY = e.changedTouches[0].clientY - touchStartY;
        // Swipe right > 100px and mostly horizontal
        if (diffX > 100 && Math.abs(diffY) < 80) {
            console.log('[gestures] Swipe right detected → history.back()');
            window.history.back();
        }
    }, {passive: true});

    // --- Pull-to-refresh (pull down from top) ---
    let pullStartY = 0;
    let isPulling = false;
    let pullIndicator = null;

    function createPullIndicator() {
        if (pullIndicator) return pullIndicator;
        pullIndicator = document.createElement('div');
        pullIndicator.style.cssText =
            'position:fixed;top:0;left:0;right:0;height:4px;' +
            'background:#0078d4;z-index:99999;transform:scaleX(0);' +
            'transform-origin:left;transition:transform:0.1s;pointer-events:none;';
        document.body.appendChild(pullIndicator);
        return pullIndicator;
    }

    document.addEventListener('touchstart', function (e) {
        if (e.touches.length === 1 && window.scrollY === 0) {
            pullStartY = e.touches[0].clientY;
            isPulling = true;
        }
    }, {passive: true});

    document.addEventListener('touchmove', function (e) {
        if (!isPulling || e.touches.length !== 1) return;
        if (window.scrollY > 0) {
            isPulling = false;
            if (pullIndicator) pullIndicator.style.transform = 'scaleX(0)';
            return;
        }
        const diff = e.touches[0].clientY - pullStartY;
        if (diff > 0) {
            const progress = Math.min(diff / 120, 1);
            createPullIndicator().style.transform = `scaleX(${progress})`;
            // Always prevent default when pulling down from the top —
            // blocks both the browser pull-to-refresh AND Outlook web's
            // own envelope refresh indicator (which appears as soon as
            // the user drags down, before any threshold).
            e.preventDefault();
        }
    }, {passive: false});

    document.addEventListener('touchend', function () {
        if (!isPulling) return;
        isPulling = false;
        if (pullIndicator) {
            const currentScale = parseFloat(pullIndicator.style.transform.replace('scaleX(', '').replace(')', '')) || 0;
            if (currentScale > 0.7) {
                console.log('[gestures] Pull-to-refresh triggered');
                pullIndicator.style.transform = 'scaleX(1)';
                setTimeout(() => { window.location.reload(); }, 300);
            } else {
                pullIndicator.style.transform = 'scaleX(0)';
            }
        }
    }, {passive: true});

    // --- Double-tap to zoom on text ---
    let lastTapTime = 0;
    document.addEventListener('touchend', function (e) {
        const now = Date.now();
        if (now - lastTapTime < 300 && e.changedTouches.length === 1) {
            // Double tap — could toggle zoom on the tapped element
            const el = document.elementFromPoint(
                e.changedTouches[0].clientX,
                e.changedTouches[0].clientY
            );
            if (el && (el.tagName === 'P' || el.tagName === 'DIV' || el.tagName === 'SPAN')) {
                console.log('[gestures] Double-tap detected on text element');
            }
        }
        lastTapTime = now;
    }, {passive: true});

    console.log('[gestures] Touch gestures initialized');
})();
