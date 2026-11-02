// ============================================================
// gestures.js — Touch gestures for Outlook web on Ubuntu Touch
// Injected into the Outlook web page via executeJavaScript()
// ============================================================

(function () {
    'use strict';

    // Prevent double-injection
    if (window.__utoutlookGesturesLoaded) return;
    window.__utoutlookGesturesLoaded = true;

    // --- v3.3.40: password fields and the Maliit virtual keyboard (structural fix) ---
    // Chromium/Blink sets the HAS_BEEN_PASSWORD flag on the window the first time a
    // password field takes the focus (even briefly) — after that the OSK stops
    // delivering text ANYWHERE. Chromium also refuses IME commits (the exact path
    // the Maliit on-screen keyboard uses) in input[type=password]. So NO input may
    // ever be type=password when focused. Fix: convert every password field IN
    // PLACE to type=text (same node → React keeps listeners/value tracker, focus and
    // value are preserved) and mask it with CSS (-webkit-text-security:disc → dots).
    // The prototype patches below run BEFORE any attribute or focus() call can set
    // 'password', so the window flag is never set and IME commits always go through.
    const PW_MASK_ATTR = 'data-pwmask';
    const ensureMaskStyle = () => {
        if (document.getElementById('__pwMaskStyle')) return;
        const st = document.createElement('style');
        st.id = '__pwMaskStyle';
        st.textContent = 'input[' + PW_MASK_ATTR + ']{-webkit-text-security:disc !important;}';
        (document.head || document.documentElement).appendChild(st);
    };
    const demaskPw = (el) => {
        if (!(el instanceof HTMLInputElement)) return false;
        if (el.type === 'password' || (el.getAttribute('type') || '').toLowerCase() === 'password') {
            try { el.setAttribute(PW_MASK_ATTR, '1'); } catch (_) {}
            try { el.type = 'text'; } catch (_) {}
            return true;
        }
        return false;
    };
    const scanPwFields = () => {
        ensureMaskStyle();
        document.querySelectorAll('input[type=password]').forEach(demaskPw);
    };
    // 1) setAttribute / setAttributeNS (React sets type via attribute on mount)
    const __origSetAttribute = Element.prototype.setAttribute;
    const __origSetAttributeNS = Element.prototype.setAttributeNS;
    Element.prototype.setAttribute = function (name, value) {
        if (this instanceof HTMLInputElement && String(name).toLowerCase() === 'type' &&
            String(value).toLowerCase() === 'password') {
            try { __origSetAttribute.call(this, PW_MASK_ATTR, '1'); } catch (_) {}
            return __origSetAttribute.call(this, name, 'text');
        }
        return __origSetAttribute.call(this, name, value);
    };
    Element.prototype.setAttributeNS = function (ns, name, value) {
        if (this instanceof HTMLInputElement && String(name).toLowerCase() === 'type' &&
            String(value).toLowerCase() === 'password') {
            try { __origSetAttribute.call(this, PW_MASK_ATTR, '1'); } catch (_) {}
            return __origSetAttributeNS.call(this, ns, name, 'text');
        }
        return __origSetAttributeNS.call(this, ns, name, value);
    };
    // 2) the `type` property setter (covers el.type = 'password')
    const __typeDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'type');
    if (__typeDesc && __typeDesc.set && __typeDesc.configurable) {
        Object.defineProperty(HTMLInputElement.prototype, 'type', {
            configurable: true,
            get: __typeDesc.get,
            set: function (v) {
                if (String(v).toLowerCase() === 'password') {
                    try { __origSetAttribute.call(this, PW_MASK_ATTR, '1'); } catch (_) {}
                    return __typeDesc.set.call(this, 'text');
                }
                return __typeDesc.set.call(this, v);
            }
        });
    }
    // 3) focus(): convert BEFORE the real focus so HAS_BEEN_PASSWORD is never set
    const __origFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function () {
        if (this instanceof HTMLInputElement) demaskPw(this);
        return __origFocus.apply(this, arguments);
    };
    // 4) capture-phase safety nets (tap or programmatic focus on a not-yet-converted field)
    ['pointerdown', 'mousedown', 'touchstart', 'focusin'].forEach((evt) => {
        document.addEventListener(evt, (e) => {
            const t = e.target;
            if (t && t.tagName === 'INPUT' && t.type === 'password') demaskPw(t);
        }, true);
    });
    // 5) MutationObserver: parser-created fields (innerHTML) and React re-renders
    scanPwFields();
    new MutationObserver(() => scanPwFields())
        .observe(document.documentElement, {
            childList: true, subtree: true,
            attributes: true, attributeFilter: ['type']
        });

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

    // Réappliquer périodiquement (sécurité anti-régression SPA).
    // v3.3.24: ne scanner QUE les conteneurs de liste, pas tout document.body —
    // sur le gros DOM d'Outlook, ~35 querySelectorAll sur tout le body toutes les
    // 3s coûtaient cher en CPU sur téléphone.
    setInterval(() => {
        document.querySelectorAll(LIST_SELECTORS).forEach(container => {
            observeListContainer(container);
            hideLoadingIndicators(container);
        });
        updateEmptyState(); // v3.3.25
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
    // Outlook web is a SPA: the message list scrolls inside an inner div,
    // NOT on window — window.scrollY is always 0. Testing window.scrollY
    // therefore made EVERY downward slide get preventDefault()'d (blue bar
    // shown, list frozen). Fix: track the real scrollable ancestor of the
    // touch target and only block when that container is at scrollTop <= 0.
    let pullStartY = 0;
    let isPulling = false;
    let pullContainer = null;
    let pullIndicator = null;

    function findScrollContainer(el) {
        let node = el;
        while (node && node !== document.documentElement && node !== document.body) {
            const style = window.getComputedStyle(node);
            if (/(auto|scroll|overlay)/.test(style.overflowY) &&
                node.scrollHeight > node.clientHeight + 1) {
                return node;
            }
            node = node.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    }

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
        if (e.touches.length !== 1) return;
        pullContainer = findScrollContainer(e.target);
        const atTop = pullContainer.scrollTop <= 0 && window.scrollY === 0;
        if (atTop) {
            pullStartY = e.touches[0].clientY;
            isPulling = true;
        }
    }, {passive: true});

    document.addEventListener('touchmove', function (e) {
        if (!isPulling || e.touches.length !== 1) return;
        // If the scroll container is no longer at the very top, the user is
        // scrolling the list — never block that gesture.
        if (pullContainer.scrollTop > 0 || window.scrollY > 0) {
            isPulling = false;
            if (pullIndicator) pullIndicator.style.transform = 'scaleX(0)';
            return;
        }
        const diff = e.touches[0].clientY - pullStartY;
        if (diff > 0) {
            const progress = Math.min(diff / 120, 1);
            createPullIndicator().style.transform = `scaleX(${progress})`;
            // Only prevent default when truly pulling down from the top —
            // blocks both the browser pull-to-refresh AND Outlook web's
            // own envelope refresh indicator.
            e.preventDefault();
        }
    }, {passive: false});

    document.addEventListener('touchend', function () {
        if (!isPulling) return;
        isPulling = false;
        if (pullIndicator) {
            const currentScale = parseFloat(pullIndicator.style.transform.replace('scaleX(', '').replace(')', '')) || 0;
            if (currentScale > 0.7) {
                // NE PAS faire window.location.reload() — cela déclenche
                // le splash screen d'Outlook web (enveloppe bleue plein
                // écran qui tourne). La barre bleue est purement visuelle.
                console.log('[gestures] Pull-to-refresh detected (visual only, no reload)');
                pullIndicator.style.transform = 'scaleX(1)';
                setTimeout(() => {
                    if (pullIndicator) pullIndicator.style.transform = 'scaleX(0)';
                }, 500);
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

    // ============================================================
    // v3.3.25: Empty state — show a friendly message when the message
    // list has no items (instead of a blank area).
    // ============================================================
    const EMPTY_ID = 'utoutlook-empty-state';
    function updateEmptyState() {
        const list = document.querySelector('[aria-label="Liste des messages"], [aria-label="Message list"], [data-app-section="MessageList"] [aria-label*="messages" i]');
        if (!list) return;
        const hasItems = list.querySelectorAll('div').length > 3; // header rows etc.
        let el = document.getElementById(EMPTY_ID);
        if (!hasItems && !el) {
            el = document.createElement('div');
            el.id = EMPTY_ID;
            el.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
                'height:40vh;color:#888;text-align:center;font-family:Ubuntu,sans-serif;pointer-events:none;';
            el.innerHTML = '<div style="font-size:48px;opacity:0.5">&#x1F4ED;</div>' +
                '<div style="font-size:1.2em;margin-top:12px;font-weight:600"></div>' +
                '<div style="font-size:0.95em;margin-top:6px;opacity:0.8"></div>';
            el.children[1].textContent = (window.__utoutlookI18n && window.__utoutlookI18n.emptyTitle) || 'No messages';
            el.children[2].textContent = (window.__utoutlookI18n && window.__utoutlookI18n.emptyBody) || 'This folder is empty.';
            list.appendChild(el);
        } else if (hasItems && el) {
            el.remove();
        }
    }

    // ============================================================
    // v3.3.25: Swipe actions on message list items —
    // swipe LEFT = delete, swipe RIGHT = mark as read/unread.
    // Best effort: clicks the matching toolbar button if present.
    // ============================================================
    let swipeStartX = 0, swipeStartY = 0, swipeItem = null;
    const LIST_ITEM_SEL = '[aria-label="Liste des messages"] > div, [aria-label="Message list"] > div';

    document.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        const item = e.target.closest && e.target.closest(LIST_ITEM_SEL);
        if (item) {
            swipeItem = item;
            swipeStartX = e.touches[0].clientX;
            swipeStartY = e.touches[0].clientY;
        }
    }, {passive: true});

    document.addEventListener('touchend', function (e) {
        if (!swipeItem || e.changedTouches.length !== 1) { swipeItem = null; return; }
        const dx = e.changedTouches[0].clientX - swipeStartX;
        const dy = e.changedTouches[0].clientY - swipeStartY;
        const item = swipeItem;
        swipeItem = null;
        if (Math.abs(dx) < 100 || Math.abs(dy) > 60) return; // not a horizontal swipe
        const action = dx < 0 ? 'delete' : 'toggle-read';
        console.log('[gestures] Swipe ' + action + ' on message item');
        // Select the item first so the action toolbar appears
        item.click();
        setTimeout(() => {
            const patterns = action === 'delete'
                ? /supprimer|delete|corbeille|trash/i
                : /marquer comme lu|marquer comme non lu|mark as read|mark as unread/i;
            const btns = document.querySelectorAll('[role="toolbar"] button, [role="toolbar"] [role="button"], [data-app-section="CommandBar"] button');
            for (const b of btns) {
                const label = (b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '');
                if (patterns.test(label)) { b.click(); console.log('[gestures] Action triggered: ' + label.trim().substring(0, 40)); return; }
            }
            console.log('[gestures] No toolbar button found for swipe action ' + action + ' (DOM may have changed)');
        }, 400);
    }, {passive: true});

    console.log('[gestures] Touch gestures initialized');
})();
