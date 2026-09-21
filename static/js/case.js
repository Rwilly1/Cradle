/* ---------------------------------------------------------------------------
   Case studies: a popup expands in place into a full page, and back.

   - Hover (or focus) an openable popup: the cradle dims, the arrow nudges.
   - Click the popup / arrow: the popup's box grows to fill the screen (clip-path from the
     box's own rectangle), becoming the case-study header.
   - The address becomes  /#<slug>  so the page can be linked directly (e.g. from a résumé).
     Browser Back, the top-left arrow, or Esc collapse it back into the popup.
   - Loading /#<slug> cold skips the colour picker and opens the case study directly; closing
     it lands on the popup, then the cradle.
   - Inside a page: the subtitle row under the hero is built from the panels' labels
     (data-nav); clicking one scrolls to that section, and the selected one reads brighter.
     The arrow in the last section's bottom-right corner scrolls back up to that row.

   Depends on cradle.js only through the popup DOM (#popup-N .popup-box) — the popup restore
   after a refresh is driven by sessionStorage, seeded by the inline script in <head>.
   --------------------------------------------------------------------------- */
(function () {
    'use strict';

    var cases = {};
    document.querySelectorAll('.case').forEach(function (el) {
        cases[el.dataset.slug] = { el: el, popup: parseInt(el.dataset.popup, 10) };
    });
    var slugs = Object.keys(cases);
    if (!slugs.length) return;

    var root = document.documentElement;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var openSlug = null;
    var pushed = false; // did *we* push the history entry (vs. arriving on a direct link)?
    var busy = false;

    function popupBox(slug) {
        return document.querySelector('#popup-' + cases[slug].popup + ' .popup-box');
    }

        // The popup is a 665px-wide design (440px on phones, matching --mobile-scale) and the
    // hero is that same layout scaled up to the window (see --u in case.css), so the page can
    // start out shrunk exactly onto the popup and simply grow: no cross-fade, no reflow, one
    // rigid piece scaling at a steady rate — same mechanism at every width. The hero is built
    // to the popup's exact height (280 desktop) and padding, so its contents line up with the
    // popup's with no offset.
    var POPUP_W = 665;
    var POPUP_W_MOBILE = 440;
    var MOBILE_BREAK = 767;
    var HERO_DELTA = 0; // extra popup-px the page must be shifted so contents line up (none)

    // A "state" is where the page sits: transform (x, y, scale) plus clip insets (page px) and
    // the corner radius as it appears ON SCREEN (rs). The clip's own radius is rs / scale, so
    // the corners ease from the popup's radius to square at the same pace as the growth,
    // instead of being pulled around by the changing scale.
    var FULL_STATE = { x: 0, y: 0, scale: 1, top: 0, right: 0, bottom: 0, left: 0, rs: 0 };

    function clipOf(s) {
        return 'inset(' + s.top + 'px ' + s.right + 'px ' + s.bottom + 'px ' + s.left + 'px round ' +
               (s.rs / s.scale) + 'px)';
    }

    function applyState(el, s) {
        gsap.set(el, { x: s.x, y: s.y, scale: s.scale, clipPath: clipOf(s) });
    }

    // Tween the page between two states with one eased progress value. onFrame (optional)
    // gets the interpolated state on every tick, for anything riding along with the card's
    // own live scale beyond its transform+clip (see holdFixed in openCase/closeCase).
    function stateTween(el, a, b, vars, onFrame) {
        var p = { t: 0 };
        var keys = ['x', 'y', 'scale', 'top', 'right', 'bottom', 'left', 'rs'];
        var cur = {};
        vars.t = 1;
        vars.onUpdate = function () {
            keys.forEach(function (k) { cur[k] = a[k] + (b[k] - a[k]) * p.t; });
            applyState(el, cur);
            if (onFrame) onFrame(cur);
        };
        return { target: p, vars: vars };
    }

    function isMobile() { return window.matchMedia('(max-width: 767px)').matches; }

    // Mobile only: how far .case-back has to slide to sit where the popup's own forward
    // arrow rests (right after the title — see .project-title-row in case.css). .case-back
    // is first in the row's DOM order (see .case-title-row), so its native, untranslated
    // spot is BEFORE the title, not at x:0 relative to it — translating it by just the
    // title's width would only reach the title's native starting edge, landing the arrow
    // on top of the text instead of past it. The button has to clear its own reserved
    // width plus both gaps (button-to-title, then title-to-arrow) to land flush after the
    // title with no overlap. Measured pre-transform (same as shrunkOnto's own rect reads),
    // and no longer scale-dependent now that .case-hero-text scales uniformly with the rest
    // of the page — a plain local-space offset holds for the whole tween.
    function arrowSlideDistance(el) {
        var row = el.querySelector('.case-title-row');
        var btn = row && row.querySelector('.case-back');
        var title = row && row.querySelector('h1');
        if (!row || !btn || !title) return 0;
        var gap = parseFloat(getComputedStyle(row).columnGap) || 12;
        return btn.getBoundingClientRect().width + title.getBoundingClientRect().width + gap * 2;
    }

    // Slides .case-back between its resting spot (before the title) and the popup's own
    // forward-arrow spot (after it), crossfading its two stacked icons (see .case-back-icon
    // in case.css) from one direction to the other as it crosses — one arrow reads as
    // continuously crossing over rather than two icons swapping in place. `dir` is 'open'
    // (start at the popup's spot showing forward, end at rest showing back) or 'close'
    // (the reverse). Returns the timeline so callers can fold it into their own cleanup.
    function arrowCrossTween(el, dir, duration) {
        var btn = el.querySelector('.case-back');
        var left = el.querySelector('.case-back-icon--left');
        var right = el.querySelector('.case-back-icon--right');
        if (!btn || !left || !right) return null;
        var dist = arrowSlideDistance(el);
        var fromX = dir === 'open' ? dist : 0;
        var toX = dir === 'open' ? 0 : dist;
        var fromLeftOpacity = dir === 'open' ? 0 : 1;
        var toLeftOpacity = dir === 'open' ? 1 : 0;
        var fromRightOpacity = dir === 'open' ? 1 : 0;
        var toRightOpacity = dir === 'open' ? 0 : 1;

        gsap.killTweensOf([btn, left, right]);
        gsap.set(btn, { x: fromX });
        gsap.set(left, { opacity: fromLeftOpacity });
        gsap.set(right, { opacity: fromRightOpacity });

        var tl = gsap.timeline();
        tl.to(btn, { x: toX, duration: duration, ease: 'power3.inOut' }, 0);
        tl.to(left, { opacity: toLeftOpacity, duration: duration * 0.7, ease: 'none' }, duration * 0.15);
        tl.to(right, { opacity: toRightOpacity, duration: duration * 0.7, ease: 'none' }, duration * 0.15);
        return tl;
    }

    function clearArrowCross(el) {
        var btn = el.querySelector('.case-back');
        var left = el.querySelector('.case-back-icon--left');
        var right = el.querySelector('.case-back-icon--right');
        if (btn) gsap.set(btn, { clearProps: 'transform' });
        if (left) gsap.set(left, { clearProps: 'opacity' });
        if (right) gsap.set(right, { clearProps: 'opacity' });
    }

    // Mobile only: an element (the title row, or the subtitle) that holdFixed below will
    // hold at true size for the whole grow/shrink. A no-op wrapper (kept as a function, not
    // a bare querySelector, so call sites read the same as the arrow/other helpers).
    function fixedOrigin(el, elm) {
        return elm || null;
    }

    // Holds an element (the title row — arrow + h1 together — or the subtitle) at its true,
    // final size for the entire grow/shrink, while everything else (paragraph, iPad,
    // background) keeps scaling with the card. transformOrigin '0 0' anchors the scale at
    // the element's own top-left corner, which — like every other point in .case — still
    // drifts toward .case's own top-left as the card's own scale shrinks (transform is
    // paint-only; layout, and so every element's true position, never changes). That drift
    // is exactly what keeps this element's TOP edge lined up with its neighbors above and
    // below (who are drifting the same way, uncorrected) — only its SIZE stays fixed,
    // growing downward/rightward from that shared, still-correctly-spaced drifting point,
    // instead of shrinking with everything else.
    //
    // The title row's own child (.case-back) still gets its own independent slide from
    // arrowCrossTween above — that composes correctly on top of this because, from the
    // button's perspective, the row is already rendering as if at true scale.
    function holdFixed(elm, scale) {
        if (elm) gsap.set(elm, { transformOrigin: '0 0', scale: 1 / scale });
    }

    function clearFixed(elm) {
        if (elm) gsap.set(elm, { clearProps: 'transform,transformOrigin' });
    }

    // Where the page must sit to look exactly like the popup box, or null.
    function shrunkOnto(box) {
        var r = box.getBoundingClientRect();
        var W = window.innerWidth, H = window.innerHeight;
        var visible = r.width > 0 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < W;
        if (!visible) return null;

        var refW = W <= MOBILE_BREAK ? POPUP_W_MOBILE : POPUP_W;
        var rs = 24 * (r.width / refW); // popup corner radius on screen

        var k = r.width / W;    // shrink factor: page width -> popup width
        var u = W / refW;       // one popup-pixel, in page pixels
        var s = r.width / refW; // one popup-pixel, on screen
        var y0 = HERO_DELTA * u; // top of the part of the page that lines up with the box
        return {
            x: r.left, y: r.top - HERO_DELTA * s, scale: k,
            top: y0, right: 0, bottom: H - y0 - r.height / k, left: 0, rs: rs
        };
    }

    // The cradle's own nav (About / Prinsys / ...): the growing page pushes it down and off
    // the screen, and it comes back up as the page shrinks onto the popup again.
    var oldNav = document.querySelector('.popup-nav');
    var pushedNav = 0;
    function navPushDistance() {
        if (!oldNav) return 0;
        var r = oldNav.getBoundingClientRect();
        if (!r.width || !r.height) return 0;
        return Math.max(0, window.innerHeight - r.top + 24);
    }

    // The video (if this case has one) lives in the popup's own markup, marked with
    // data-video-slot. Moving that one element into the hero and back — rather than keeping a
    // second copy in sync — means playback never has to re-seek, so there's never a hitch, and
    // the popup's own click-to-pause/play wiring (cradle.js) keeps working with no changes:
    // it queries by class, not by which parent currently holds the node.
    function moveVideoToHero(slug, el) {
        var box = popupBox(slug);
        var overlay = box && box.querySelector('[data-video-slot]');
        var media = el.querySelector('.case-hero-media');
        if (!overlay || !media) return;
        media.appendChild(overlay);
    }

    function moveVideoToPopup(slug, el) {
        var box = popupBox(slug);
        var overlay = el.querySelector('[data-video-slot]');
        var slot = box && box.querySelector('.project-image');
        if (!overlay || !slot) return;
        slot.appendChild(overlay);
    }

    // While the hero is open, pause its video when scrolled out of view and resume it when
    // scrolled back — same behavior as the popup already has for open/closed.
    function enableVideoAutoplay(el) {
        var overlay = el.querySelector('[data-video-slot]');
        var video = overlay && overlay.querySelector('video');
        if (!video || !('IntersectionObserver' in window)) return;
        if (el._videoIO) el._videoIO.disconnect();
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) video.play().catch(function () {});
                else video.pause();
            });
        }, { root: el, threshold: 0 });
        io.observe(overlay);
        el._videoIO = io;
    }

    function disableVideoAutoplay(el) {
        if (el._videoIO) { el._videoIO.disconnect(); el._videoIO = null; }
    }

    // Crossfades the hero's low-res "shadow" iPad image to the higher-res "sharp" one
    // (see .case-hero-sharp in case.css) — a no-op if this case study doesn't have one.
    function revealSharpHero(el) {
        var media = el.querySelector('.case-hero-media');
        if (media) media.classList.add('is-sharp');
    }

    function openCase(slug, opts) {
        if (!cases[slug] || openSlug || busy) return;
        opts = opts || {};
        var el = cases[slug].el;
        var box = popupBox(slug);
        var from = opts.animate !== false && !reduceMotion && box ? shrunkOnto(box) : null;

        openSlug = slug;
        document.body.classList.remove('case-hint');
        root.classList.add('case-open');
        el.scrollTop = 0;
        el.classList.add('is-open');
        if (el._markActive) el._markActive();
        moveVideoToHero(slug, el);
        enableVideoAutoplay(el);
        if (box && from) box.classList.add('is-covered');

        if (opts.push) {
            history.pushState({ case: slug }, '', '#' + slug);
            pushed = true;
        } else {
            pushed = false;
        }

        var push = navPushDistance();
        pushedNav = push;

        if (!from) {
            if (push) gsap.set(oldNav, { y: '+=' + push });
            enableScrollMotion(el);
            revealSharpHero(el);
            el.focus({ preventScroll: true });
            return;
        }

        busy = true;
        el.classList.add('is-animating');
        gsap.killTweensOf(el);
        gsap.set(el, { transformOrigin: '0 0' });
        var ghosts = el.querySelectorAll('.case-ghost');
        var backBtn = el.querySelector('.case-back');
        var isMobileLayout = window.matchMedia('(max-width: 767px)').matches;
        // Mobile: the arrow slides in from the popup's own forward-arrow spot (right of the
        // title) to its resting spot here (before the title), crossfading from forward to
        // back as it crosses — see arrowCrossTween. Runs as its own timeline, independent of
        // the card's own grow tween below, so it reads as a deliberate motion in its own
        // right. The title row and subtitle hold their true size/position throughout (see
        // holdFixed) while the paragraph, iPad and background keep scaling with the card —
        // origins measured now, before applyState below touches .case's own transform.
        var titleRowOrigin = isMobileLayout ? fixedOrigin(el, el.querySelector('.case-title-row')) : null;
        var subtitleOrigin = isMobileLayout ? fixedOrigin(el, el.querySelector('.case-hero-text h2')) : null;
        if (isMobileLayout) arrowCrossTween(el, 'open', 0.7);
        applyState(el, from);
        if (isMobileLayout) { holdFixed(titleRowOrigin, from.scale); holdFixed(subtitleOrigin, from.scale); }
        // Same duration and easing as the page's growth, so the labels stay just ahead of its
        // bottom edge (pushed along by it) rather than being swallowed.
        if (push) gsap.to(oldNav, { y: '+=' + push, duration: 0.9, ease: 'power3.inOut' });
        // The popup's X and arrow fade out while the page's own back arrow fades in — only
        // meaningful on desktop, where both sit in the same overlaid corner. On mobile the
        // back arrow is inline next to the title (see .case-title-row in case.css), not an
        // overlay, so it stays fully visible from the first frame instead of fading in.
        gsap.set(ghosts, { opacity: 1 });
        gsap.to(ghosts, { opacity: 0, duration: 0.35, ease: 'none' });
        if (backBtn && !isMobileLayout) {
            gsap.set(backBtn, { opacity: 0 });
            gsap.to(backBtn, { opacity: 1, duration: 0.4, delay: 0.5, ease: 'none', clearProps: 'opacity' });
        }
        var grow = stateTween(el, from, FULL_STATE, {
            duration: 0.9,
            ease: 'power3.inOut',
            onComplete: function () {
                gsap.set(el, { clearProps: 'transform,transformOrigin,clipPath' });
                gsap.set(ghosts, { clearProps: 'opacity' });
                // subtitle row and sections show once the banner has landed
                var late = el.querySelectorAll('.case-nav, .case-body');
                gsap.set(late, { opacity: 0 });
                el.classList.remove('is-animating');
                gsap.to(late, { opacity: 1, duration: 0.3, ease: 'none', clearProps: 'opacity' });
                if (isMobileLayout) { clearArrowCross(el); clearFixed(titleRowOrigin); clearFixed(subtitleOrigin); }
                enableScrollMotion(el);
                revealSharpHero(el);
                busy = false;
                el.focus({ preventScroll: true });
            }
        }, isMobileLayout ? function (cur) { holdFixed(titleRowOrigin, cur.scale); holdFixed(subtitleOrigin, cur.scale); } : null);
        gsap.to(grow.target, grow.vars);
    }

    function closeCase(fromPop) {
        if (!openSlug) return;

        // UI close of an entry we pushed: let the browser pop it, popstate finishes the job.
        if (!fromPop && pushed) {
            history.back();
            return;
        }
        if (!fromPop) {
            history.replaceState(null, '', location.pathname + location.search);
        }

        var slug = openSlug;
        var el = cases[slug].el;
        var box = popupBox(slug);
        openSlug = null;
        pushed = false;
        disableVideoAutoplay(el);

        var ghosts = el.querySelectorAll('.case-ghost');
        var backBtn = el.querySelector('.case-back');
        var titleRowOrigin = null, subtitleOrigin = null;

        function finish() {
            moveVideoToPopup(slug, el);
            var media = el.querySelector('.case-hero-media');
            if (media) media.classList.remove('is-sharp');
            gsap.set(ghosts, { clearProps: 'opacity' });
            if (backBtn) gsap.set(backBtn, { clearProps: 'opacity' });
            clearArrowCross(el);
            clearFixed(titleRowOrigin);
            clearFixed(subtitleOrigin);
            if (oldNav && pushedNav) gsap.set(oldNav, { clearProps: 'transform' });
            pushedNav = 0;
            if (box) box.classList.remove('is-covered');
            el.classList.remove('is-open', 'no-snap', 'is-animating', 'anim-ready');
            el.querySelectorAll('.case-panel.is-in').forEach(function (p) { p.classList.remove('is-in'); });
            gsap.set(el, { clearProps: 'transform,transformOrigin,clipPath' });
            root.classList.remove('case-open');
            el.scrollTop = 0;
            busy = false;
        }

        var to = !reduceMotion && box ? shrunkOnto(box) : null;
        if (!to) {
            finish();
            return;
        }

        // Reverse of opening: shrink back onto the popup, no fade.
        busy = true;
        el.classList.add('no-snap', 'is-animating'); // snapping would fight the scroll-to-top below
        gsap.killTweensOf(el);
        gsap.set(el, { transformOrigin: '0 0' });
        var tl = gsap.timeline({ onComplete: finish });
        if (el.scrollTop > 0) {
            tl.to(el, { scrollTop: 0, duration: 0.35, ease: 'power2.out' });
        }
        if (oldNav && pushedNav) {
            gsap.to(oldNav, { y: '-=' + pushedNav, duration: 0.8, delay: el.scrollTop > 0 ? 0.35 : 0, ease: 'power3.inOut' });
        }
        // Reverse of the opening: the back arrow fades out, the popup's X and arrow fade back in
        // (desktop only — see the matching note in openCase).
        var isMobileLayout = window.matchMedia('(max-width: 767px)').matches;
        var wait = el.scrollTop > 0 ? 0.35 : 0;
        gsap.set(ghosts, { opacity: 0 });
        if (backBtn && !isMobileLayout) gsap.to(backBtn, { opacity: 0, duration: 0.3, delay: wait, ease: 'none' });
        gsap.to(ghosts, { opacity: 1, duration: 0.35, delay: wait + 0.45, ease: 'none' });
        // Reverse of the open-side cross in openCase — see the comment there.
        if (isMobileLayout) {
            titleRowOrigin = fixedOrigin(el, el.querySelector('.case-title-row'));
            subtitleOrigin = fixedOrigin(el, el.querySelector('.case-hero-text h2'));
            var arrowTl = arrowCrossTween(el, 'close', 0.7);
            if (arrowTl && wait) arrowTl.delay(wait);
        }
        var shrink = stateTween(el, FULL_STATE, to, { duration: 0.8, ease: 'power3.inOut' },
            isMobileLayout ? function (cur) { holdFixed(titleRowOrigin, cur.scale); holdFixed(subtitleOrigin, cur.scale); } : null);
        tl.to(shrink.target, shrink.vars);
    }

    // --- Section nav + bottom arrow (per case study) --------------------------------

    // Panel's top edge in the scroller's own coordinates (offsetTop is relative to whichever
    // ancestor happens to be positioned, so it isn't reliable here).
    function topOf(el, node) {
        return node.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    }

    function scrollToY(el, top) {
        el.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    // Scroll motion (motion only, no fades): each section's image block slides in from the
    // screen edge it hangs off, and its text lifts into place. Panels get .is-in the first time
    // half of them is on screen. Styles live under .anim-ready in case.css. Desktop only —
    // on mobile every panel just renders fully in place immediately, no scroll-triggered
    // animation at all.
    function enableScrollMotion(el) {
        if (reduceMotion || !('IntersectionObserver' in window) || isMobile()) return;
        if (el._io) el._io.disconnect();
        el.classList.add('anim-ready');
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
            });
        }, { root: el, threshold: 0.3 });
        el.querySelectorAll('.case-panel').forEach(function (p) { io.observe(p); });
        el._io = io;
    }

    function setupPage(el) {
        var panels = Array.prototype.slice.call(el.querySelectorAll('.case-panel[data-nav]'));
        var nav = el.querySelector('.case-nav');

        if (panels.length && nav) {
            var buttons = panels.map(function (panel) {
                var b = document.createElement('button');
                b.type = 'button';
                b.textContent = panel.dataset.nav;
                b.addEventListener('click', function () { scrollToY(el, topOf(el, panel)); });
                nav.appendChild(b);
                return b;
            });

            // Which section is on screen? (the one crossing the middle; none while on the hero)
            function markActive() {
                var mid = el.scrollTop + el.clientHeight / 2;
                var current = -1;
                panels.forEach(function (p, i) {
                    var t = topOf(el, p);
                    if (mid >= t && mid < t + p.offsetHeight) current = i;
                });
                nav.classList.toggle('has-active', current >= 0);
                buttons.forEach(function (b, i) {
                    b.classList.toggle('is-active', i === current);
                    if (i === current) b.setAttribute('aria-current', 'true');
                    else b.removeAttribute('aria-current');
                });
            }
            el.addEventListener('scroll', markActive, { passive: true });
            window.addEventListener('resize', markActive);
            el._markActive = markActive; // re-run when the page opens (layout isn't final before)
            markActive();
        }

        var top = el.querySelector('.case-top');
        if (top) top.addEventListener('click', function () { scrollToY(el, 0); });

        var back = el.querySelector('.case-back');
        if (back) back.addEventListener('click', function () { closeCase(false); });
    }

    slugs.forEach(function (s) { setupPage(cases[s].el); });

    // Panel videos (e.g. the Islanding "Underwater" render): click to play/pause, same
    // pause-overlay treatment as the popup's own hero video (see cradle.js).
    //
    // No `autoplay` attribute here (see _case.html) — on mobile Safari that attribute can
    // sit "pending" for a moment after load, during which the browser shows its own native
    // tap-to-play affordance stacked on top of this custom overlay (two play symbols until
    // playback actually starts). Instead, play is triggered explicitly via JS the moment the
    // video scrolls into view, same as the hero video's enableVideoAutoplay — a JS-initiated
    // .play() never gets that native fallback UI.
    document.querySelectorAll('.case-video-wrap').forEach(function (wrap) {
        var video = wrap.querySelector('video');
        var overlay = wrap.querySelector('.case-video-pause');
        if (!video) return;

        function updateOverlay() {
            if (overlay) overlay.classList.toggle('paused', video.paused);
        }

        wrap.addEventListener('click', function () {
            if (video.paused) video.play(); else video.pause();
        });

        video.addEventListener('play', updateOverlay);
        video.addEventListener('pause', updateOverlay);
        // Belt-and-suspenders for the native loop attribute: some browsers (older iOS
        // Safari in particular) can drop out of looping once playback has been toggled
        // via JS rather than left fully alone, so force a restart on 'ended' too.
        video.addEventListener('ended', function () {
            video.currentTime = 0;
            video.play().catch(function () {});
        });
        updateOverlay();

        if ('IntersectionObserver' in window) {
            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (en) {
                    if (en.isIntersecting) video.play().catch(function () {});
                    else video.pause();
                });
            }, { threshold: 0.25 });
            io.observe(wrap);
        } else {
            video.play().catch(function () {});
        }
    });

    // "Read More" hint next to any case-study popup's arrow: fades/slides in on hover
    // (CSS, see .popup-read-more in case.css) with its letters running the same rainbow
    // color-wave chase as the landing page's picker heading (see the SplitText block in
    // cradle.js), replayed on every hover-in. Desktop only, and only for popups that
    // actually have an arrow (.popup[data-case] .popup-open) — future case studies get
    // this for free since it's wired here rather than hardcoded per popup.
    var hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 768px)').matches;
    if (hoverCapable && window.gsap && window.SplitText) {
        gsap.registerPlugin(SplitText);
        var rainbow = ['#7a0000', '#cc4e00', '#cca300', '#457a00', '#004e7a', '#401268'];
        document.querySelectorAll('.popup[data-case] .popup-open').forEach(function (arrow) {
            var box = arrow.closest('.popup-box');
            if (!box) return;
            var label = document.createElement('span');
            label.className = 'popup-read-more';
            label.setAttribute('aria-hidden', 'true');
            label.textContent = 'Explore';
            arrow.insertAdjacentElement('beforebegin', label);
            var split = SplitText.create(label, { type: 'chars' });
            var wave = null;
            var tapTl = null;
            var boxHovering = false;

            function playWave() {
                if (wave) wave.kill();
                gsap.set(split.chars, { color: '#f2f0ef' });
                wave = gsap.from(split.chars, {
                    color: function (i) { return rainbow[i % rainbow.length]; },
                    stagger: { each: 0.045, from: 'start' },
                    duration: 0.5, ease: 'sine.out'
                });
            }

            // Periodic "tap" nudge on top of the arrow/label's own steady hover offset
            // (translateX(3px), set by CSS), to keep pulling the eye back to it while the
            // pointer lingers. x:3 here matches that CSS offset so GSAP can take over the
            // transform with no visible jump; clearProps hands it back to CSS.
            function startTap() {
                if (tapTl) tapTl.kill();
                gsap.set([arrow, label], { x: 3, opacity: 1 });
                tapTl = gsap.timeline({ repeat: -1, repeatDelay: 1.4, delay: 1.4 });
                tapTl.to([arrow, label], { x: 9, duration: 0.22, ease: 'power2.out' })
                     .to([arrow, label], { x: 3, duration: 0.28, ease: 'power2.in' });
            }

            function stopTap() {
                if (tapTl) { tapTl.kill(); tapTl = null; }
            }

            box.addEventListener('mouseenter', function () {
                boxHovering = true;
                playWave();
                startTap();
            });
            box.addEventListener('mouseleave', function () {
                boxHovering = false;
                if (wave) wave.kill();
                gsap.set(split.chars, { color: '#f2f0ef' });
                stopTap();
                gsap.set([arrow, label], { clearProps: 'x,opacity' });
            });

            // Hovering the X specifically should hide the arrow/label entirely (back to
            // their un-hovered look) rather than reading as "close AND open" at once, then
            // restore them (and resume the tap loop) once the pointer leaves the X while
            // still over the rest of the box.
            var closeBtn = box.querySelector('.popup-close');
            if (closeBtn) {
                closeBtn.addEventListener('mouseenter', function () {
                    stopTap();
                    gsap.to(arrow, { opacity: 0.6, x: 0, duration: 0.2, ease: 'sine.out' });
                    gsap.to(label, { opacity: 0, x: 8, duration: 0.2, ease: 'sine.out' });
                });
                closeBtn.addEventListener('mouseleave', function () {
                    if (!boxHovering) return;
                    gsap.to(arrow, { opacity: 1, x: 3, duration: 0.2, ease: 'sine.out' });
                    gsap.to(label, {
                        opacity: 1, x: 3, duration: 0.2, ease: 'sine.out',
                        onComplete: function () { if (boxHovering) startTap(); }
                    });
                });
            }
        });
    }

    // --- Popup wiring -------------------------------------------------------------

    slugs.forEach(function (slug) {
        var popup = document.getElementById('popup-' + cases[slug].popup);
        var box = popupBox(slug);
        if (!popup || !box) return;

        // Elements inside the box that keep their own behaviour.
        var OWN = '.popup-close, .islanding-video-overlay';
        var downX = 0, downY = 0;

        box.addEventListener('pointerdown', function (e) { downX = e.clientX; downY = e.clientY; });

        box.addEventListener('click', function (e) {
            if (e.target.closest(OWN)) return;
            if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // was a drag
            var sel = window.getSelection && window.getSelection().toString();
            if (sel) return; // was selecting text
            e.preventDefault();
            openCase(slug, { animate: true, push: true });
        });

        // Dim the cradle while the pointer is over the openable part of the popup.
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
            box.addEventListener('mouseover', function (e) {
                document.body.classList.toggle('case-hint', !e.target.closest(OWN));
            });
            box.addEventListener('mouseleave', function () {
                document.body.classList.remove('case-hint');
            });
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && openSlug) closeCase(false);
    });

    window.addEventListener('popstate', function () {
        var slug = location.hash.slice(1);
        if (cases[slug] && !openSlug) {
            // Forward-navigating back into a case study: expand from the popup if it's open.
            var box = popupBox(slug);
            openCase(slug, { animate: !!(box && box.offsetParent !== null), push: false });
            pushed = true; // this entry is already in history
        } else if (!cases[slug] && openSlug) {
            closeCase(true);
        }
    });

    // Direct link: /#islanding-nyc
    var initial = location.hash.slice(1);
    if (cases[initial]) {
        openCase(initial, { animate: false, push: false });
    }
})();
