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
    // gets the interpolated state and raw progress on every tick, for anything riding along
    // with the grow/shrink beyond the page's own transform+clip (see the mobile text
    // counter-scale and arrow slide in openCase/closeCase).
    function stateTween(el, a, b, vars, onFrame) {
        var p = { t: 0 };
        var keys = ['x', 'y', 'scale', 'top', 'right', 'bottom', 'left', 'rs'];
        var cur = {};
        vars.t = 1;
        vars.onUpdate = function () {
            keys.forEach(function (k) { cur[k] = a[k] + (b[k] - a[k]) * p.t; });
            applyState(el, cur);
            if (onFrame) onFrame(cur, p.t);
        };
        return { target: p, vars: vars };
    }

    function isMobile() { return window.matchMedia('(max-width: 767px)').matches; }

    // On mobile the title (h1/h2/p together) stays at its true size the whole time instead of
    // scaling with the page — this counter-scales it against the page's own current scale, so
    // it reads as fixed-size text sliding into place while only the colour/artwork around it
    // visibly grows. Desktop still scales as one rigid piece (this is never called there).
    //
    // The counter-scale alone would let the now-full-size text spill past the growing card's
    // edge (it's the only thing NOT shrunk to match the card, so nothing else stops it there) —
    // clip-path reveals it in step with the card instead. clip-path's own inset is in the
    // element's local (unscaled) units, and gets stretched by this same counter-scale, so to
    // land on an on-screen reveal width of scale*trueW the local inset has to target
    // scale²*trueW: (trueW - inset)/scale = scale*trueW  =>  inset = trueW*(1 - scale²).
    function counterScaleText(el, scale, trueW, trueH) {
        var text = el.querySelector('.case-hero-text');
        if (!text) return;
        var cutX = trueW * (1 - scale * scale);
        var cutY = trueH * (1 - scale * scale);
        gsap.set(text, { transformOrigin: '0 0', scale: 1 / scale, clipPath: 'inset(0 ' + cutX + 'px ' + cutY + 'px 0)' });
    }

    function clearTextScale(el) {
        var text = el.querySelector('.case-hero-text');
        if (text) gsap.set(text, { clearProps: 'transform,transformOrigin,clipPath' });
    }

    // .case-hero-text's real (unscaled) footprint, measured before any transform touches the
    // page — needed by counterScaleText's reveal math above.
    function textFootprint(el) {
        var text = el.querySelector('.case-hero-text');
        if (!text) return { w: 0, h: 0 };
        var r = text.getBoundingClientRect();
        return { w: r.width, h: r.height };
    }

    // The back arrow slides in to its true resting spot (flush with the row's start) from
    // further along the row, flipping its icon at the midpoint — one arrow crossing over
    // rather than two unrelated buttons appearing/disappearing. It starts at the edge of
    // what counterScaleText has already revealed at scale=revealScale (that reveal only ever
    // grows from there), rather than the row's true far end, so its slide path never has to
    // cross back out into not-yet-revealed territory and get clipped mid-icon. Distance is
    // measured fresh each time: the row's true (unscaled) width never changes during the
    // tween, only how much of it is revealed/scaled, so one measurement up front holds for
    // the whole animation.
    function arrowSlideDistance(el, revealScale) {
        var row = el.querySelector('.case-title-row');
        var btn = el.querySelector('.case-back');
        if (!row || !btn) return 0;
        var start = row.getBoundingClientRect().width * revealScale * revealScale;
        return Math.max(0, start - btn.getBoundingClientRect().width);
    }

    function setArrowIcon(el, direction) {
        var img = el.querySelector('.case-back img');
        if (!img) return;
        var file = direction === 'left' ? 'arrow_circle_left.png' : 'arrow_circle_right.png';
        if (img.src.indexOf(file) === -1) img.src = img.src.replace(/arrow_circle_[a-z]+\.png$/, file);
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
        // Mobile: title/subtitle/paragraph hold their true size throughout (counterScaleText),
        // and the back arrow slides in from the title row's far end — where the popup's own
        // forward-arrow sits — to its resting spot at the row's start, flipping its icon
        // halfway. iconFlipped guards the swap to exactly once per animation. Measured before
        // applyState below touches .case's own transform, while the row's true (unscaled)
        // size is still what getBoundingClientRect reports.
        var slideDist = isMobileLayout ? arrowSlideDistance(el, from.scale) : 0;
        var footprint = isMobileLayout ? textFootprint(el) : null;
        var iconFlipped = false;
        if (isMobileLayout) {
            setArrowIcon(el, 'right');
            gsap.set(backBtn, { x: slideDist });
        }
        applyState(el, from);
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
                if (isMobileLayout) {
                    clearTextScale(el);
                    gsap.set(backBtn, { clearProps: 'transform' });
                }
                // subtitle row and sections show once the banner has landed
                var late = el.querySelectorAll('.case-nav, .case-body');
                gsap.set(late, { opacity: 0 });
                el.classList.remove('is-animating');
                gsap.to(late, { opacity: 1, duration: 0.3, ease: 'none', clearProps: 'opacity' });
                enableScrollMotion(el);
                busy = false;
                el.focus({ preventScroll: true });
            }
        }, isMobileLayout ? function (cur, t) {
            counterScaleText(el, cur.scale, footprint.w, footprint.h);
            gsap.set(backBtn, { x: slideDist * (1 - t) });
            if (!iconFlipped && t >= 0.5) { setArrowIcon(el, 'left'); iconFlipped = true; }
        } : null);
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

        function finish() {
            moveVideoToPopup(slug, el);
            gsap.set(ghosts, { clearProps: 'opacity' });
            if (backBtn) gsap.set(backBtn, { clearProps: 'opacity,transform' });
            clearTextScale(el);
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
        // Reverse of the open-side slide/flip in openCase — see the comment there.
        var slideDist = isMobileLayout ? arrowSlideDistance(el, to.scale) : 0;
        var footprint = isMobileLayout ? textFootprint(el) : null;
        var iconFlipped = false;
        if (isMobileLayout) setArrowIcon(el, 'left');
        var shrink = stateTween(el, FULL_STATE, to, { duration: 0.8, ease: 'power3.inOut' }, isMobileLayout ? function (cur, t) {
            counterScaleText(el, cur.scale, footprint.w, footprint.h);
            gsap.set(backBtn, { x: slideDist * t });
            if (!iconFlipped && t >= 0.5) { setArrowIcon(el, 'right'); iconFlipped = true; }
        } : null);
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
    // half of them is on screen. Styles live under .anim-ready in case.css.
    function enableScrollMotion(el) {
        if (reduceMotion || !('IntersectionObserver' in window)) return;
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
