/* ---------------------------------------------------------------------------
   Prinsys case-study extras: three carousels + the full-bleed Admin Panel ERD.
   Everything here is scoped to the Prinsys case page and is a no-op elsewhere
   (see the guard below) — case.js/cradle.js stay generic. Depends on GSAP +
   SplitText (already loaded for the site) and, for the ERD only, d3 v5 +
   dagre-d3 (loaded in index.html just for this page).
   --------------------------------------------------------------------------- */
(function () {
    'use strict';

    var caseEl = document.querySelector('.case[data-slug="prinsys"]');
    if (!caseEl) return;

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function isMobile() { return window.matchMedia('(max-width: 767px)').matches; }

    // --- Shared: pause/resume a carousel's autoplay while its section is
    // on/off screen, and expose reset() so manual interaction restarts the
    // idle timer instead of firing right after a click/swipe. -----------------
    function setupAutoplay(root, advance, ms) {
        if (reduceMotion || !ms) return { reset: function () {} };
        var timer = null;
        var visible = false;
        function tick() {
            timer = setTimeout(function () { advance(); tick(); }, ms);
        }
        function start() {
            if (timer) return;
            tick();
        }
        function stop() {
            if (timer) { clearTimeout(timer); timer = null; }
        }
        if ('IntersectionObserver' in window) {
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (en) {
                    visible = en.isIntersecting;
                    if (visible) start(); else stop();
                });
            }, { threshold: 0.4 });
            io.observe(root);
        } else {
            start();
        }
        return {
            reset: function () { stop(); if (visible) start(); }
        };
    }

    // --- Carousel #1 / #3: plain crossfade (Finland photos, RF Circuit) ------
    // No arrows, no drag — purely autoplay-driven (see data-autoplay on the
    // markup). Only .is-active's opacity is touched; CSS (case.css) owns the
    // actual fade transition and the static frame/ring around the box, which
    // never moves or fades along with the photo underneath it.
    function setupFadeCarousel(root) {
        var stack = root.querySelector('.carousel-stack');
        var slides = Array.prototype.slice.call(stack.querySelectorAll('.carousel-slide'));
        if (!slides.length) return;
        var idx = 0;

        function setRatioFrom(img) {
            if (img.naturalWidth && img.naturalHeight) {
                stack.style.setProperty('--carousel-ratio', img.naturalWidth + ' / ' + img.naturalHeight);
            }
        }
        var firstImg = slides[0].querySelector('img');
        if (firstImg.complete) setRatioFrom(firstImg);
        else firstImg.addEventListener('load', function () { setRatioFrom(firstImg); }, { once: true });

        function show(next) {
            slides.forEach(function (s, i) { s.classList.toggle('is-active', i === next); });
            idx = next;
        }
        show(0);

        function advance() { show((idx + 1) % slides.length); }

        setupAutoplay(root, advance, parseInt(root.dataset.autoplay, 10) || 0);
    }

    // --- Carousel #2: fade-grid (Wireframe Flow) ------------------------------
    function setupFadeGridCarousel(root) {
        var titleEl = root.querySelector('[data-carousel-title]');
        var slides = Array.prototype.slice.call(root.querySelectorAll('.carousel-grid-slide'));
        var prevBtn = root.querySelector('.carousel-prev');
        var nextBtn = root.querySelector('.carousel-next');
        if (!slides.length) return;
        var idx = 0;
        // Same rainbow chase used site-wide for the picker heading (cradle.js)
        // and the case-popup "Explore" hint (case.js).
        var rainbow = ['#7a0000', '#cc4e00', '#cca300', '#457a00', '#004e7a', '#401268'];

        function setTitle(text, animate) {
            titleEl.textContent = '';
            var span = document.createElement('span');
            span.textContent = text;
            titleEl.appendChild(span);
            if (!animate || reduceMotion || !window.gsap || !window.SplitText) return;
            gsap.registerPlugin(SplitText);
            var split = SplitText.create(span, { type: 'chars' });
            gsap.set(split.chars, { color: '#f2f0ef' });
            gsap.from(split.chars, {
                y: 12, opacity: 0,
                stagger: { each: 0.03, from: 'start' },
                duration: 0.4, ease: 'sine.out'
            });
            gsap.from(split.chars, {
                color: function (i) { return rainbow[i % rainbow.length]; },
                stagger: { each: 0.045, from: 'start' },
                duration: 0.55, ease: 'sine.out'
            });
        }

        // Mobile: the 4-up-by-2 grid has no room to read on a phone, so instead
        // show one wireframe at a time — no arrows, autoplay only — flattened
        // across all three flows so a phone visitor still sees everything the
        // grid shows on desktop. Decided once at setup (same as case.js's own
        // mobile checks elsewhere): a mid-session resize across the breakpoint
        // isn't handled, only a fresh load.
        if (isMobile()) {
            setupMobileFilmstrip(root, slides, setTitle);
            return;
        }

        function show(next, animate) {
            slides.forEach(function (s, i) { s.classList.toggle('is-active', i === next); });
            idx = next;
            setTitle(slides[next].dataset.title, animate);
        }
        show(0, false);

        function advance(dir) {
            var n = slides.length;
            show((idx + dir + n) % n, true);
        }

        if (nextBtn) nextBtn.addEventListener('click', function () { advance(1); autoplay.reset(); });
        if (prevBtn) prevBtn.addEventListener('click', function () { advance(-1); autoplay.reset(); });

        var autoplay = setupAutoplay(root, function () { advance(1); }, parseInt(root.dataset.autoplay, 10) || 0);
    }

    // Builds the mobile filmstrip out of clones of the desktop grid's own <img>
    // elements (leaves the (hidden, see case.css) desktop grid untouched, and
    // reuses whatever the browser already fetched for it — same src, so no
    // extra network cost). Each image keeps its own natural aspect ratio via
    // --carousel-ratio (same trick setupFadeCarousel uses, just re-applied on
    // every slide instead of only the first) with object-fit:contain as a
    // belt-and-suspenders backstop, so a tall screen is scaled to the card's
    // width and never cropped.
    function setupMobileFilmstrip(root, slides, setTitle) {
        var items = [];
        slides.forEach(function (slide) {
            var title = slide.dataset.title;
            Array.prototype.slice.call(slide.querySelectorAll('img')).forEach(function (img) {
                var clone = img.cloneNode(true);
                clone.className = 'carousel-mobile-img';
                clone.removeAttribute('loading');
                items.push({ img: clone, title: title });
            });
        });
        if (!items.length) return;

        var stack = document.createElement('div');
        stack.className = 'carousel-mobile-stack';
        items.forEach(function (item) { stack.appendChild(item.img); });
        root.querySelector('.carousel-grids').insertAdjacentElement('afterend', stack);

        var idx = 0;
        function setRatio(img) {
            function apply() {
                if (img.naturalWidth && img.naturalHeight) {
                    stack.style.setProperty('--carousel-ratio', img.naturalWidth + ' / ' + img.naturalHeight);
                }
            }
            if (img.complete) apply(); else img.addEventListener('load', apply, { once: true });
        }

        // Only replay the title's reveal animation when the flow it names
        // actually changes — most autoplay ticks just move to the next
        // screen within the same flow, and re-triggering the animation on
        // every one of those reads as an unrelated flicker, not a change.
        var lastTitle = null;
        function show(next, animate) {
            items.forEach(function (item, i) { item.img.classList.toggle('is-active', i === next); });
            idx = next;
            setRatio(items[idx].img);
            var title = items[idx].title;
            setTitle(title, animate && title !== lastTitle);
            lastTitle = title;
        }
        show(0, false);

        setupAutoplay(root, function () { show((idx + 1) % items.length, true); }, 4000);
    }

    document.querySelectorAll('.prinsys-carousel[data-effect="fade"]').forEach(setupFadeCarousel);
    document.querySelectorAll('.prinsys-carousel[data-effect="fade-grid"]').forEach(setupFadeGridCarousel);
})();
