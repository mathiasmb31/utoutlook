// ============================================================
// gestures.js — Touch gestures for Outlook web on Ubuntu Touch
// Injected into the Outlook web page via executeJavaScript()
// ============================================================

(function () {
    'use strict';

    // Prevent double-injection
    if (window.__utoutlookGesturesLoaded) return;
    window.__utoutlookGesturesLoaded = true;

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
            // Prevent default pull-to-refresh of the browser
            if (progress > 0.3) e.preventDefault();
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
