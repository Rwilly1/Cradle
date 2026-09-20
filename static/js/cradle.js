const { Engine, Render, Runner, Bodies, Composite, Constraint, Mouse, MouseConstraint, Events } = Matter;

const canvas = document.getElementById('newtons-cradle');
const container = document.getElementById('canvas-container');

let width = container.clientWidth;
let height = container.clientHeight;

const engine = Engine.create();
const world = engine.world;

world.gravity.y = 1;

const render = Render.create({
    canvas: canvas,
    engine: engine,
    options: {
        width: width,
        height: height,
        wireframes: false,
        background: 'transparent',
        pixelRatio: window.devicePixelRatio || 2
    }
});

const ballColors = [
    '#7a0000',
    '#cc4e00',
    '#cca300',
    '#457a00',
    '#004e7a',
    '#401268'
];

const ballOutlineColors = [
    '#3d0000',
    '#7a2f00',
    '#7a6200',
    '#233d00',
    '#00273d',
    '#200934'
];

const ballLabels = [
    'About\nMe',
    'Professional\nExperience',
    'Art & Design\nPortfolio',
    'Academic\nProjects',
    'Technical\nSkills',
    'Contact\nInfo'
];

const FRAME_W = 1024.5, FRAME_H = 576; // static/Cradle/without.svg viewBox — keep in sync if that asset is ever redrawn

// Mirrors CSS: background-size: contain; background-position: center bottom
function getFrameRect(vw, vh) {
    const scale = Math.min(vw / FRAME_W, vh / FRAME_H);
    const w = FRAME_W * scale;
    const h = FRAME_H * scale;
    return { x: (vw - w) / 2, y: vh - h, w, h };
}

let ballRadius;

const balls = [];
const constraints = [];
const letterBodies = [];

let hoveredBall = null;
let hoveredText = null;
let mousePosition = { x: width / 2, y: height / 2 };
let ballHighlights = [];
let textOpacities = [];
let draggedBall = null;
let ballVelocities = [];
let activeBall = null;
let activeBallDirection = null;
let textEnabled = true;
let greyBlendAmounts = [0, 0, 0, 0, 0, 0];
let greyBlendTargets = [0, 0, 0, 0, 0, 0];
let currentPopup = null;
let popupOpen = false;
let currentPopupDirection = null;

// Picker hand-off camera state. s/tx/ty are the live zoom transform (identity = no zoom
// in progress), applied as a single CSS transform on #canvas-container (see
// applyZoomTransform below). The canvas itself always draws balls/strings/title in
// plain, untransformed scene coordinates — the frame background image and the nav are
// already inside that same container, so one transform pans/scales all of them, the
// canvas included, together as one unit instead of each implementing its own zoom logic.
const cameraZoom = { s: 1, tx: 0, ty: 0 };
let pinnedGroup = []; // balls held in the "pulled out" pose until the picker releases them
let pickerAbort = null; // set by the picker module below; called if a resize interrupts its sequence
// True from the moment a pinned ball is cut to the canvas until the zoom-out finishes.
// While true, pinned balls' highlights ignore the mouse and hold their static rest
// offset (see afterRender) instead of tracking the cursor through the zoom.
let highlightsFrozen = false;

function applyZoomTransform() {
    container.style.transform = 'translate(' + cameraZoom.tx + 'px,' + cameraZoom.ty + 'px) scale(' + cameraZoom.s + ')';
}

function clearZoomTransform() {
    container.style.transform = '';
}

const nameText = "Remington Williams";
const ctx = document.createElement('canvas').getContext('2d');

// The popups, nav labels, and toggle switch were originally sized/positioned in fixed
// px and raw viewport units, tuned by eye against a ~1600x900 (16:9) window. Re-express
// that tuning as a scale factor off the frame's own height so they track the frame the
// same way the cradle now does, instead of drifting independently at other aspect ratios.
const UI_SCALE_REFERENCE_HEIGHT = 900;

// The nav labels and toggle switch read smaller than the original fixed-size version at
// typical (non-maximized, sub-900px-tall) windows once tied to --ui-scale. Give them their
// own, more generous scale so they land closer to the original size there while staying
// responsive, without changing the popup's own scale.
const NAV_UI_SCALE_BOOST = 1.15;

function buildScene(w, h, animateIn) {
    const frame = getFrameRect(w, h);

    width = w;
    height = h;
    ballRadius = frame.h * 0.068;
    const spacing = ballRadius * 2.02;
    // Left-edge-of-first-ball to right-edge-of-last-ball — the popup's width is pinned to
    // this (see --ui-scale below) so it reads as wide as the cradle itself, at any window size.
    const ballRowSpan = spacing * (ballColors.length - 1) + ballRadius * 2;

    // The frame graphic's own top masking band (#canvas-container::before) was tuned to
    // 16:9 as a flat viewport percentage; keep it aligned to the actual contain-fit frame.
    container.style.setProperty('--mask-height', (frame.y + frame.h * 0.27) + 'px');

    const root = document.documentElement.style;
    root.setProperty('--frame-x', frame.x + 'px');
    root.setProperty('--frame-y', frame.y + 'px');
    root.setProperty('--frame-w', frame.w + 'px');
    root.setProperty('--frame-h', frame.h + 'px');
    // Popups were originally 665px wide, a fixed design baseline; scale that whole design
    // (box + every nested font/padding via transform: scale) by how much wider the actual
    // ball row is than that baseline, so the popup always reads exactly ball-row-wide.
    root.setProperty('--ui-scale', ballRowSpan / 665);
    root.setProperty('--nav-scale', (frame.h / UI_SCALE_REFERENCE_HEIGHT) * NAV_UI_SCALE_BOOST);

    const stringLength = frame.h * 0.62;
    const frameTop = frame.y + frame.h * 0.165;
    const stringStartOffset = frame.h * 0.12;
    const centerX = frame.x + frame.w / 2;

    const startX = centerX - (spacing * (ballColors.length - 1)) / 2;

    for (let i = 0; i < ballColors.length; i++) {
        const x = startX + i * spacing;
        const y = frameTop + stringLength;

        const ball = Bodies.circle(x, y, ballRadius, {
            density: 0.04,
            frictionAir: 0.005,
            restitution: 1,
            friction: 0,
            render: {
                visible: false
            }
        });

        ball.ballIndex = i;
        ball.stringAttachX = x;
        ball.stringAttachY = frameTop + stringStartOffset;

        ballHighlights.push({
            x: -ballRadius * 0.3,
            y: -ballRadius * 0.3,
            x2: -ballRadius * 0.25,
            y2: -ballRadius * 0.25,
            x3: -ballRadius * 0.18,
            y3: -ballRadius * 0.18,
            staticX: -ballRadius * 0.3,
            staticY: -ballRadius * 0.3
        });

        textOpacities.push(0);
        ballVelocities.push({ x: 0, y: 0 });

        const constraint = Constraint.create({
            pointA: { x: x, y: frameTop },
            bodyB: ball,
            length: stringLength,
            stiffness: 1,
            render: {
                visible: false
            }
        });

        balls.push(ball);
        constraints.push(constraint);

        Composite.add(world, [ball, constraint]);
    }

    const fontSize = frame.h * 0.09;
    const letterSpacing = fontSize * 0.02;
    const nameY = frame.y + frame.h * 0.225;

    ctx.font = `bold ${fontSize}px "Museo Moderno", sans-serif`;

    let currentX = centerX - (ctx.measureText(nameText).width / 2);

    for (let i = 0; i < nameText.length; i++) {
        const char = nameText[i];

        if (char === ' ') {
            currentX += fontSize * 0.4;
            continue;
        }

        const charWidth = ctx.measureText(char).width;
        const charHeight = fontSize;

        const letter = Bodies.rectangle(currentX + charWidth / 2, nameY, charWidth, charHeight, {
            isStatic: !animateIn,
            friction: 0.3,
            restitution: 0.6,
            isSensor: !!animateIn,
            render: {
                visible: false
            }
        });

        letter.char = char;
        letter.fontSize = fontSize;
        letter.hasFallen = false;
        letter.originalX = currentX + charWidth / 2;
        letter.originalY = nameY;

        if (animateIn) {
            // Start letters at top of screen for initial animation
            Matter.Body.setPosition(letter, { x: letter.originalX, y: -100 });
        }

        letterBodies.push(letter);
        currentX += charWidth + letterSpacing * 0.1;
    }

    Composite.add(world, letterBodies);

    if (animateIn) {
        // Animate all letters falling in on page load
        letterBodies.forEach((letter) => {
            gsap.to(letter.position, {
                y: letter.originalY,
                duration: 1,
                delay: 0.3,
                ease: 'bounce.out',
                onUpdate: function() {
                    Matter.Body.setPosition(letter, { x: letter.originalX, y: letter.position.y });
                },
                onComplete: function() {
                    // Make letter static and remove sensor property after animation
                    letter.isSensor = false;
                    Matter.Body.setStatic(letter, true);
                    Matter.Body.setPosition(letter, { x: letter.originalX, y: letter.originalY });
                    Matter.Body.setVelocity(letter, { x: 0, y: 0 });
                    Matter.Body.setAngularVelocity(letter, 0);
                    Matter.Body.setAngle(letter, 0);
                }
            });
        });
    }
}

function clearScene() {
    gsap.killTweensOf(letterBodies.map(l => l.position));
    mouseConstraint.constraint.bodyB = null;
    mouseConstraint.constraint.pointB = null;
    mouseConstraint.body = null;
    isDragging = false;
    draggedBall = null;
    activeBall = null;
    activeBallDirection = null;
    hoveredBall = null;
    hoveredText = null;
    // A resize mid-picker-sequence would otherwise leave the beforeUpdate pin holding
    // references to bodies this function is about to remove, and the camera stuck zoomed.
    gsap.killTweensOf(cameraZoom);
    pinnedGroup = [];
    highlightsFrozen = false;
    cameraZoom.s = 1;
    cameraZoom.tx = 0;
    cameraZoom.ty = 0;
    clearZoomTransform();
    Composite.remove(world, [...balls, ...constraints, ...letterBodies]);
    balls.length = 0;
    constraints.length = 0;
    letterBodies.length = 0;
    ballHighlights.length = 0;
    textOpacities.length = 0;
    ballVelocities.length = 0;
}

// On the ≤1024px mobile/tablet layout, #canvas-container is display:none (see style.css),
// so it measures 0x0 here at load. Building the scene at 0x0 created degenerate
// zero-radius ball bodies that crashed Matter's collision system on every tick, and wrote
// --ui-scale: 0 to the document root — a variable the mobile popup cards used to inherit
// too, collapsing them to nothing. Skip the whole cradle scene while it's not visible;
// the resize handler below starts it the first time the viewport actually shows it.
let cradleActive = width > 0 && height > 0;
if (cradleActive) {
    buildScene(width, height, true);
}

const mouse = Mouse.create(render.canvas);
const mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse,
    constraint: {
        stiffness: 0.2,
        render: {
            visible: false
        }
    }
});

Composite.add(world, mouseConstraint);

render.mouse = mouse;

let isDragging = false;

Events.on(mouseConstraint, 'startdrag', function(event) {
    isDragging = true;
    if (balls.includes(event.body)) {
        // Select ball on grab if no popup is open
        if (!popupOpen) {
            draggedBall = event.body;
            activeBall = event.body;
            console.log('SELECTED: Ball', balls.indexOf(event.body));
        }
    }
});

Events.on(mouseConstraint, 'enddrag', function(event) {
    isDragging = false;
    if (balls.includes(event.body) && draggedBall === event.body && activeBall === event.body) {
        const ballIndex = balls.indexOf(event.body);
        // Use ball position to determine pull direction (same as nav clicks)
        // Balls 0-2 (red, orange, yellow) pull left
        // Balls 3-5 (green, blue, purple) pull right
        activeBallDirection = ballIndex <= 2 ? 'left' : 'right';
        console.log('RELEASED: Ball', ballIndex, 'pull direction:', activeBallDirection);
    }
    draggedBall = null;
});

window.addEventListener('mouseup', function() {
    if (isDragging) {
        isDragging = false;
        if (draggedBall && balls.includes(draggedBall) && activeBall === draggedBall) {
            const ballIndex = balls.indexOf(draggedBall);
            // Use ball position to determine pull direction (same as nav clicks)
            // Balls 0-2 (red, orange, yellow) pull left
            // Balls 3-5 (green, blue, purple) pull right
            activeBallDirection = ballIndex <= 2 ? 'left' : 'right';
            console.log('RELEASED (mouseup): Ball', ballIndex, 'pull direction:', activeBallDirection);
        }
        draggedBall = null;
    }
});

// Listens on window, not the canvas, so mousePosition keeps updating (and the picker
// hand-off's zoomed-in highlight keeps tracking the cursor via the canvas's own
// getBoundingClientRect(), which already reflects the live CSS zoom transform on
// #canvas-container) even while canvas.style.pointerEvents is 'none' during a picker
// sequence — pointer-events:none excludes the canvas from hit-testing, so a listener
// attached to the canvas itself would simply stop firing for as long as that lasts.
window.addEventListener('mousemove', function(event) {
    const rect = render.canvas.getBoundingClientRect();
    const scaleX = render.options.width / rect.width;
    const scaleY = render.options.height / rect.height;

    mousePosition.x = (event.clientX - rect.left) * scaleX;
    mousePosition.y = (event.clientY - rect.top) * scaleY;

    // Hover/grab-cursor state is only meaningful when the canvas can actually receive
    // clicks; skip it while a picker sequence has interaction disabled so a misleading
    // "grab" cursor doesn't show over balls the visitor can't actually grab right now.
    if (canvas.style.pointerEvents === 'none') return;

    if (!isDragging && mouseConstraint.body === null) {
        draggedBall = null;
    }

    // Reset hover states
    hoveredBall = null;
    hoveredText = null;

    // Check for hover and cursor
    let canGrab = false;
    balls.forEach(ball => {
        const pos = ball.position;
        const dx = mousePosition.x - pos.x;
        const dy = mousePosition.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        const velocity = ball.velocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        const isMoving = speed > 0.5;
        
        if (dist <= ballRadius && !isMoving) {
            hoveredBall = ball;
            
            // Check if hovering over text area (smaller radius)
            const textRadius = ballRadius * 0.5;
            if (dist <= textRadius) {
                hoveredText = ball;
            }
            
            // Only show grab cursor if no ball is currently active
            if (!activeBall) {
                canGrab = true;
            }
        }
    });
    
    canvas.style.cursor = canGrab ? (isDragging ? 'grabbing' : 'grab') : 'default';
}, false);

let currentPopupIndex = 0;

function updateNavLabels() {
    const navLabels = document.querySelectorAll('.nav-label');
    navLabels.forEach((label, index) => {
        if (index === currentPopupIndex) {
            label.classList.add('active');
        } else {
            label.classList.remove('active');
        }
    });
}

function openPopup(ballIndex, direction) {
    if (popupOpen) return;
    
    popupOpen = true;
    currentPopupIndex = ballIndex;
    const popup = document.getElementById(`popup-${ballIndex}`);
    currentPopup = popup;
    currentPopupDirection = direction; // Store direction for closing
    
    // Apply background color from data attribute to popup-box
    const bgColor = popup.getAttribute('data-bg-color');
    const popupBox = popup.querySelector('.popup-box');
    if (bgColor && popupBox) {
        popupBox.style.backgroundColor = bgColor;
    }
    
    popup.classList.add('active');
    updateNavLabels();
    
    // Popup enters from the same direction as the pull
    // Pull left (direction='left') → enters from left (-100%)
    // Pull right (direction='right') → enters from right (100%)
    const xStart = direction === 'left' ? '-100%' : '100%';
    
    gsap.fromTo(popup, 
        { 
            x: xStart,
            opacity: 0 
        },
        { 
            x: '0%',
            opacity: 1,
            duration: 2.5,
            ease: 'elastic.out(1, 0.6)',
            onComplete: () => {
                enablePopupSwipe();
            }
        }
    );
}

function navigateToPopup(newIndex, swipeDirection) {
    if (!currentPopup) return;
    
    const oldPopup = currentPopup;
    const newPopup = document.getElementById(`popup-${newIndex}`);
    
    // Apply background color from data attribute to popup-box
    const bgColor = newPopup.getAttribute('data-bg-color');
    const popupBox = newPopup.querySelector('.popup-box');
    if (bgColor && popupBox) {
        popupBox.style.backgroundColor = bgColor;
    }
    
    // Ball collision physics:
    // New popup enters from its pull direction
    // Old popup gets knocked out in the opposite direction (away from collision)
    const newPullDirection = newIndex <= 2 ? 'left' : 'right';
    
    // New popup slides in from its pull direction
    const xIn = newPullDirection === 'left' ? '-100%' : '100%';
    
    // Old popup exits in opposite direction (gets knocked away)
    const xOut = newPullDirection === 'left' ? '100%' : '-100%';
    
    newPopup.classList.add('active');
    currentPopup = newPopup;
    currentPopupIndex = newIndex;
    updateNavLabels();
    
    // Animate both popups to collide in the middle
    gsap.fromTo(newPopup,
        { x: xIn, opacity: 1 },
        { 
            x: '0%', 
            opacity: 1, 
            duration: 2.5, 
            ease: 'elastic.out(1, 0.6)',
            onComplete: () => {
                isNavigating = false;
                enablePopupSwipe();
            }
        }
    );
    
    // Old popup moves to meet new popup (collision effect)
    gsap.to(oldPopup, {
        x: xOut,
        opacity: 1,
        duration: 0.4,
        ease: 'power1.in',
        onComplete: () => {
            oldPopup.classList.remove('active');
            gsap.set(oldPopup, { x: '0%' });
        }
    });
}

let popupDraggable = null;
let isNavigating = false;

function enablePopupSwipe() {
    if (popupDraggable) {
        popupDraggable.kill();
    }
    
    const popupContent = currentPopup.querySelector('.popup-content');
    let scrollAccumulator = 0;
    const scrollThreshold = 100;
    
    // Intercept wheel/scroll events for horizontal navigation
    const wheelHandler = (e) => {
        // Only intercept horizontal scroll (trackpad left/right swipe)
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
            e.preventDefault();
            
            // Don't navigate if already animating
            if (isNavigating) return;
            
            // Accumulate horizontal scroll
            scrollAccumulator += e.deltaX;
            
            if (Math.abs(scrollAccumulator) > scrollThreshold) {
                isNavigating = true;
                
                if (scrollAccumulator > 0) {
                    // Scrolled right → navigate to next popup
                    const nextIndex = (currentPopupIndex + 1) % 6;
                    navigateToPopup(nextIndex, 'left');
                } else {
                    // Scrolled left → navigate to previous popup
                    const prevIndex = (currentPopupIndex - 1 + 6) % 6;
                    navigateToPopup(prevIndex, 'right');
                }
                scrollAccumulator = 0;
            }
        }
    };
    
    popupContent.addEventListener('wheel', wheelHandler, { passive: false });
    
    // Arrow key navigation
    const keyHandler = (e) => {
        if (isNavigating) return;
        
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            isNavigating = true;
            const prevIndex = (currentPopupIndex - 1 + 6) % 6;
            navigateToPopup(prevIndex, 'right');
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            isNavigating = true;
            const nextIndex = (currentPopupIndex + 1) % 6;
            navigateToPopup(nextIndex, 'left');
        }
    };
    
    document.addEventListener('keydown', keyHandler);
    
    // Also support touch swipe with adjacent popup visible
    let adjacentPopup = null;
    
    popupDraggable = Draggable.create(currentPopup, {
        type: 'x',
        trigger: popupContent,
        bounds: { minX: -window.innerWidth, maxX: window.innerWidth },
        onDrag: function() {
            const dragDistance = this.x;
            
            // Show adjacent popup based on drag direction
            if (dragDistance > 0) {
                // Dragging right → show previous popup on left
                const prevIndex = (currentPopupIndex - 1 + 6) % 6;
                if (!adjacentPopup || adjacentPopup.id !== `popup-${prevIndex}`) {
                    if (adjacentPopup) adjacentPopup.classList.remove('active');
                    adjacentPopup = document.getElementById(`popup-${prevIndex}`);
                    adjacentPopup.classList.add('active');
                    gsap.set(adjacentPopup, { x: '-100%', opacity: 1 });
                }
                gsap.set(adjacentPopup, { x: dragDistance - window.innerWidth });
            } else if (dragDistance < 0) {
                // Dragging left → show next popup on right
                const nextIndex = (currentPopupIndex + 1) % 6;
                if (!adjacentPopup || adjacentPopup.id !== `popup-${nextIndex}`) {
                    if (adjacentPopup) adjacentPopup.classList.remove('active');
                    adjacentPopup = document.getElementById(`popup-${nextIndex}`);
                    adjacentPopup.classList.add('active');
                    gsap.set(adjacentPopup, { x: '100%', opacity: 1 });
                }
                gsap.set(adjacentPopup, { x: dragDistance + window.innerWidth });
            }
        },
        onDragEnd: function() {
            const dragDistance = this.x;
            const threshold = 100;
            
            if (Math.abs(dragDistance) > threshold) {
                if (dragDistance < 0) {
                    // Swiped left → complete transition to next popup
                    const nextIndex = (currentPopupIndex + 1) % 6;
                    const oldPopup = currentPopup;
                    currentPopup = adjacentPopup;
                    currentPopupIndex = nextIndex;
                    
                    gsap.to(oldPopup, { x: -window.innerWidth, duration: 0.3, ease: 'power2.out', onComplete: () => {
                        oldPopup.classList.remove('active');
                        gsap.set(oldPopup, { x: '0%' });
                    }});
                    gsap.to(currentPopup, { x: 0, duration: 0.3, ease: 'power2.out', onComplete: () => {
                        isNavigating = false;
                        enablePopupSwipe();
                    }});
                } else {
                    // Swiped right → complete transition to previous popup
                    const prevIndex = (currentPopupIndex - 1 + 6) % 6;
                    const oldPopup = currentPopup;
                    currentPopup = adjacentPopup;
                    currentPopupIndex = prevIndex;
                    
                    gsap.to(oldPopup, { x: window.innerWidth, duration: 0.3, ease: 'power2.out', onComplete: () => {
                        oldPopup.classList.remove('active');
                        gsap.set(oldPopup, { x: '0%' });
                    }});
                    gsap.to(currentPopup, { x: 0, duration: 0.3, ease: 'power2.out', onComplete: () => {
                        isNavigating = false;
                        enablePopupSwipe();
                    }});
                }
                adjacentPopup = null;
            } else {
                // Snap back
                gsap.to(currentPopup, { x: 0, duration: 0.3, ease: 'power2.out' });
                if (adjacentPopup) {
                    adjacentPopup.classList.remove('active');
                    gsap.set(adjacentPopup, { x: '0%' });
                    adjacentPopup = null;
                }
            }
        }
    })[0];
}

function closePopup() {
    if (!currentPopup) return;
    
    // Exit in the direction the ball was pulled (Newton's Cradle physics)
    // Pull left (direction='left') → exits left (-100%)
    // Pull right (direction='right') → exits right (100%)
    const xEnd = currentPopupDirection === 'left' ? '-100%' : '100%';
    
    gsap.to(currentPopup, {
        x: xEnd,
        opacity: 0,
        duration: 0.5,
        ease: 'power2.in',
        onComplete: () => {
            currentPopup.classList.remove('active');
            gsap.set(currentPopup, { x: '0%' });
            currentPopup = null;
            currentPopupDirection = null;
            popupOpen = false;
            
            // Clear nav label active states
            document.querySelectorAll('.nav-label').forEach(label => {
                label.classList.remove('active');
            });
        }
    });
}

// Add event listeners to all close buttons
document.querySelectorAll('.popup-close').forEach((btn, index) => {
    btn.addEventListener('click', closePopup);
});

// Add event listeners to navigation labels
document.querySelectorAll('.nav-label').forEach((label) => {
    label.addEventListener('click', function() {
        const popupIndex = parseInt(this.getAttribute('data-popup'));
        
        if (popupOpen && currentPopupIndex === popupIndex) {
            // Clicking same nav - pull the ball again
            const ball = balls[popupIndex];
            const velocity = ball.velocity;
            const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
            
            if (speed < 0.5) {
                // Ball is not in motion, apply velocity to pull it and all balls on that side
                const pullDirection = popupIndex <= 2 ? 'left' : 'right';
                const pullForce = pullDirection === 'left' ? -15 : 15;
                
                // Pull all balls from this one to the edge in the pull direction
                if (pullDirection === 'left') {
                    // Pull balls from popupIndex down to 0 (red)
                    for (let i = 0; i <= popupIndex; i++) {
                        Matter.Body.setVelocity(balls[i], { x: pullForce, y: 0 });
                    }
                } else {
                    // Pull balls from popupIndex up to 5 (purple)
                    for (let i = popupIndex; i < balls.length; i++) {
                        Matter.Body.setVelocity(balls[i], { x: pullForce, y: 0 });
                    }
                }
                activeBall = ball;
                activeBallDirection = pullDirection;
            }
        } else if (popupOpen && currentPopupIndex !== popupIndex) {
            // Navigate to different popup - pull the ball first
            const ball = balls[popupIndex];
            const velocity = ball.velocity;
            const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
            
            if (speed < 0.5) {
                // Ball is not in motion, apply velocity to pull it and all balls on that side
                const pullDirection = popupIndex <= 2 ? 'left' : 'right';
                const pullForce = pullDirection === 'left' ? -15 : 15;
                
                // Pull all balls from this one to the edge in the pull direction
                if (pullDirection === 'left') {
                    // Pull balls from popupIndex down to 0 (red)
                    for (let i = 0; i <= popupIndex; i++) {
                        Matter.Body.setVelocity(balls[i], { x: pullForce, y: 0 });
                    }
                } else {
                    // Pull balls from popupIndex up to 5 (purple)
                    for (let i = popupIndex; i < balls.length; i++) {
                        Matter.Body.setVelocity(balls[i], { x: pullForce, y: 0 });
                    }
                }
                activeBall = ball;
                activeBallDirection = pullDirection;
                
                // Switch popup immediately
                const direction = popupIndex > currentPopupIndex ? 'left' : 'right';
                navigateToPopup(popupIndex, direction);
            } else {
                // Ball is in motion, just switch popup
                const direction = popupIndex > currentPopupIndex ? 'left' : 'right';
                navigateToPopup(popupIndex, direction);
            }
        } else if (!popupOpen) {
            // Check if balls are in motion
            const ball = balls[popupIndex];
            const velocity = ball.velocity;
            const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
            
            if (speed < 0.5) {
                // Ball is not in motion, apply velocity to pull it and all balls on that side
                // Balls 0-2 (red, orange, yellow) pull left
                // Balls 3-5 (green, blue, purple) pull right
                const pullDirection = popupIndex <= 2 ? 'left' : 'right';
                const pullForce = pullDirection === 'left' ? -15 : 15;
                
                // Pull all balls from this one to the edge in the pull direction
                if (pullDirection === 'left') {
                    // Pull balls from popupIndex down to 0 (red)
                    for (let i = 0; i <= popupIndex; i++) {
                        Matter.Body.setVelocity(balls[i], { x: pullForce, y: 0 });
                    }
                } else {
                    // Pull balls from popupIndex up to 5 (purple)
                    for (let i = popupIndex; i < balls.length; i++) {
                        Matter.Body.setVelocity(balls[i], { x: pullForce, y: 0 });
                    }
                }
                activeBall = ball;
                activeBallDirection = pullDirection;
                openPopup(popupIndex, pullDirection);
            }
        }
    });
});

Events.on(engine, 'collisionStart', function(event) {
    const pairs = event.pairs;
    
    pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        
        letterBodies.forEach(letter => {
            if ((bodyA === letter || bodyB === letter) && !letter.hasFallen) {
                const ball = bodyA === letter ? bodyB : bodyA;
                if (balls.includes(ball)) {
                    Matter.Body.setStatic(letter, false);
                    letter.hasFallen = true;
                }
            }
        });
        
        if (balls.includes(bodyA) && balls.includes(bodyB) && activeBall) {
            const indexA = balls.indexOf(bodyA);
            const indexB = balls.indexOf(bodyB);
            const activeIndex = balls.indexOf(activeBall);
            
            // Check if activeBall hit the correct ball
            if (activeBall === bodyA) {
                let shouldClear = false;
                let shouldOpenPopup = false;
                
                // Ball 0: always clears on any collision
                if (indexA === 0) {
                    shouldClear = true;
                    shouldOpenPopup = true;
                }
                // Ball 5: always clears on any collision
                else if (indexA === 5) {
                    shouldClear = true;
                    shouldOpenPopup = true;
                }
                // Balls 1-4: clear when hitting the ball on the opposite side of pull direction
                else if (indexA >= 1 && indexA <= 4) {
                    // Pulled left → hits ball on right (opposite side)
                    if (activeBallDirection === 'left' && indexB === indexA + 1) {
                        shouldClear = true;
                        shouldOpenPopup = true;
                    }
                    // Pulled right → hits ball on left (opposite side)
                    else if (activeBallDirection === 'right' && indexB === indexA - 1) {
                        shouldClear = true;
                        shouldOpenPopup = true;
                    }
                }
                
                if (shouldClear) {
                    if (shouldOpenPopup) {
                        openPopup(indexA, activeBallDirection);
                    }
                    activeBall = null;
                    activeBallDirection = null;
                }
            } else if (activeBall === bodyB) {
                let shouldClear = false;
                let shouldOpenPopup = false;
                
                // Ball 0: always clears on any collision
                if (indexB === 0) {
                    shouldClear = true;
                    shouldOpenPopup = true;
                }
                // Ball 5: always clears on any collision
                else if (indexB === 5) {
                    shouldClear = true;
                    shouldOpenPopup = true;
                }
                // Balls 1-4: clear when hitting the ball on the opposite side of pull direction
                else if (indexB >= 1 && indexB <= 4) {
                    // Pulled left → hits ball on right (opposite side)
                    if (activeBallDirection === 'left' && indexA === indexB + 1) {
                        shouldClear = true;
                        shouldOpenPopup = true;
                    }
                    // Pulled right → hits ball on left (opposite side)
                    else if (activeBallDirection === 'right' && indexA === indexB - 1) {
                        shouldClear = true;
                        shouldOpenPopup = true;
                    }
                }
                
                if (shouldClear) {
                    if (shouldOpenPopup) {
                        openPopup(indexB, activeBallDirection);
                    }
                    activeBall = null;
                    activeBallDirection = null;
                }
            }
        }
    });
});

// Holds picker-selected balls dead still in their pulled-out pose (position pinned every
// physics step) until the picker's release() lets go of them, same as a real drag would
// hold a ball via the mouse constraint.
Events.on(engine, 'beforeUpdate', function() {
    if (!pinnedGroup.length) return;
    pinnedGroup.forEach(function(ball) {
        Matter.Body.setPosition(ball, ball._pinTarget);
        Matter.Body.setVelocity(ball, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(ball, 0);
    });
});

function blendColors(color1, color2, amount) {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);
    
    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);
    
    const r = Math.round(r1 + (r2 - r1) * amount);
    const g = Math.round(g1 + (g2 - g1) * amount);
    const b = Math.round(b1 + (b2 - b1) * amount);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

Events.on(render, 'afterRender', function() {
    const context = render.context;
    
    balls.forEach((ball, index) => {
        greyBlendAmounts[index] = greyBlendTargets[index];
        const velocity = ball.velocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        const isMoving = speed > 0.5;
        
        let targetOpacity = 0;
        
        if (textEnabled) {
            // Disable all text rendering
            targetOpacity = 0;
        }
        
        textOpacities[index] += (targetOpacity - textOpacities[index]) * 0.15;

        // The picker hand-off zoom is a CSS transform on #canvas-container (see
        // applyZoomTransform), not a canvas-internal one, so the canvas always draws in
        // plain scene coordinates and the mousemove listener's own getBoundingClientRect()
        // conversion already accounts for any zoom in progress — no un-projection needed.
        //
        // A pinned ball ignores the mouse entirely until the zoom-out finishes (see
        // highlightsFrozen) — forcing dist to 0 here routes it through the same
        // static-offset fallback used at rest below, so it holds its resting glint
        // instead of tracking the cursor mid-zoom, then eases toward the cursor (via the
        // normal per-frame lerp below, not a snap) once tracking resumes.
        const frozen = highlightsFrozen && pinnedGroup.includes(ball);
        const pos = ball.position;
        const dx = frozen ? 0 : mousePosition.x - pos.x;
        const dy = frozen ? 0 : mousePosition.y - pos.y;
        const dist = frozen ? 0 : Math.sqrt(dx * dx + dy * dy);

        const maxDistance = Math.max(width, height);
        const strength = Math.max(0, 1 - (dist / maxDistance));
        const pull = strength * 1.0;

        const targetX = dist > 0 ? (dx / dist) * ballRadius * pull * 0.5 : ballHighlights[index].staticX;
        const targetY = dist > 0 ? (dy / dist) * ballRadius * pull * 0.5 : ballHighlights[index].staticY;

        const target3X = dist > 0 ? (dx / dist) * ballRadius * pull * 0.2 : -ballRadius * 0.18;
        const target3Y = dist > 0 ? (dy / dist) * ballRadius * pull * 0.2 : -ballRadius * 0.18;

        ballHighlights[index].x3 += (target3X - ballHighlights[index].x3) * 0.08;
        ballHighlights[index].y3 += (target3Y - ballHighlights[index].y3) * 0.08;

        const target2X = dist > 0 ? (dx / dist) * ballRadius * pull * 0.35 : -ballRadius * 0.25;
        const target2Y = dist > 0 ? (dy / dist) * ballRadius * pull * 0.35 : -ballRadius * 0.25;

        const largeRadius = ballRadius * 0.7128;
        const mediumRadius = ballRadius * 0.4752;
        const maxDistance2 = largeRadius - mediumRadius;

        const offset2X = target2X - ballHighlights[index].x3;
        const offset2Y = target2Y - ballHighlights[index].y3;
        const offset2Dist = Math.sqrt(offset2X * offset2X + offset2Y * offset2Y);

        if (offset2Dist > maxDistance2) {
            const clamped2X = ballHighlights[index].x3 + (offset2X / offset2Dist) * maxDistance2;
            const clamped2Y = ballHighlights[index].y3 + (offset2Y / offset2Dist) * maxDistance2;

            ballHighlights[index].x2 += (clamped2X - ballHighlights[index].x2) * 0.12;
            ballHighlights[index].y2 += (clamped2Y - ballHighlights[index].y2) * 0.12;
        } else {
            ballHighlights[index].x2 += (target2X - ballHighlights[index].x2) * 0.12;
            ballHighlights[index].y2 += (target2Y - ballHighlights[index].y2) * 0.12;
        }

        const smallRadius = ballRadius * 0.264;
        const maxDistance1 = mediumRadius - smallRadius;

        const offsetX = targetX - ballHighlights[index].x2;
        const offsetY = targetY - ballHighlights[index].y2;
        const offsetDist = Math.sqrt(offsetX * offsetX + offsetY * offsetY);

        if (offsetDist > maxDistance1) {
            const clampedX = ballHighlights[index].x2 + (offsetX / offsetDist) * maxDistance1;
            const clampedY = ballHighlights[index].y2 + (offsetY / offsetDist) * maxDistance1;

            ballHighlights[index].x += (clampedX - ballHighlights[index].x) * 0.15;
            ballHighlights[index].y += (clampedY - ballHighlights[index].y) * 0.15;
        } else {
            ballHighlights[index].x += (targetX - ballHighlights[index].x) * 0.15;
            ballHighlights[index].y += (targetY - ballHighlights[index].y) * 0.15;
        }
    });
    
    balls.forEach((ball, index) => {
        const pos = ball.position;
        const radius = ball.circleRadius;

        const dx = pos.x - ball.stringAttachX;
        const dy = pos.y - ball.stringAttachY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        const endX = ball.stringAttachX + (dx / dist) * (dist - radius);
        const endY = ball.stringAttachY + (dy / dist) * (dist - radius);

        context.beginPath();
        context.moveTo(ball.stringAttachX, ball.stringAttachY);
        context.lineTo(endX, endY);
        context.strokeStyle = '#3b3430';
        context.lineWidth = 3;
        context.stroke();
    });

    balls.forEach((ball, index) => {
        const pos = ball.position;
        const radius = ball.circleRadius;
        const highlight = ballHighlights[index];

        context.save();
        context.translate(pos.x, pos.y);
        context.rotate(ball.angle);

        context.beginPath();
        context.arc(0, 0, radius, 0, 2 * Math.PI);
        context.fillStyle = ballOutlineColors[index];
        context.fill();

        context.beginPath();
        context.arc(0, 0, radius * 0.93, 0, 2 * Math.PI);
        context.fillStyle = ballColors[index];
        context.fill();

        context.save();
        context.beginPath();
        context.arc(0, 0, radius * 0.93, 0, 2 * Math.PI);
        context.clip();

        context.beginPath();
        context.arc(highlight.x3, highlight.y3, radius * 0.7128, 0, 2 * Math.PI);
        context.fillStyle = 'rgba(242, 240, 239, 0.24)';
        context.fill();

        context.beginPath();
        context.arc(highlight.x2, highlight.y2, radius * 0.4752, 0, 2 * Math.PI);
        context.fillStyle = 'rgba(242, 240, 239, 0.24)';
        context.fill();

        context.beginPath();
        context.arc(highlight.x, highlight.y, radius * 0.264, 0, 2 * Math.PI);
        context.fillStyle = 'rgba(242, 240, 239, 0.24)';
        context.fill();

        context.restore();

        context.restore();
        
        context.save();
        context.translate(pos.x, pos.y);
        context.globalAlpha = textOpacities[index];
        
        const label = ballLabels[index];
        const lines = label.split('\n');
        
        const fontSize = Math.min(radius * 0.22, 16);
        context.font = `bold ${fontSize}px "Museo Moderno", sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#f2f0ef';
        context.strokeStyle = '#3b3430';
        context.lineWidth = Math.max(fontSize * 0.2, 2);
        
        const lineHeight = fontSize * 1.3;
        const startY = -(lines.length - 1) * lineHeight / 2;
        
        lines.forEach((line, i) => {
            const y = startY + i * lineHeight;
            context.strokeText(line, 0, y);
            context.fillText(line, 0, y);
        });
        
        context.restore();
    });

    letterBodies.forEach(letter => {
        if (letter.position.y > height + 100) {
            return;
        }
        
        context.save();
        context.translate(letter.position.x, letter.position.y);
        context.rotate(letter.angle);
        
        context.font = `500 ${letter.fontSize}px "Museo Moderno", sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#3b3430';
        context.fillText(letter.char, 0, 0);
        
        context.restore();
    });
});

const runner = Runner.create();
if (cradleActive) {
    Render.run(render);
    Runner.run(runner, engine);
}

let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const newWidth = container.clientWidth;
        const newHeight = container.clientHeight;
        if (newWidth <= 0 || newHeight <= 0) return;

        const pixelRatio = window.devicePixelRatio || 2;

        render.canvas.width = newWidth * pixelRatio;
        render.canvas.height = newHeight * pixelRatio;
        render.canvas.style.width = newWidth + 'px';
        render.canvas.style.height = newHeight + 'px';
        render.options.width = newWidth;
        render.options.height = newHeight;

        Render.lookAt(render, {
            min: { x: 0, y: 0 },
            max: { x: newWidth, y: newHeight }
        });

        if (pickerAbort) pickerAbort();
        clearScene();
        buildScene(newWidth, newHeight, false);

        // First time the cradle becomes visible (e.g. resizing up past the 1024px
        // mobile breakpoint, or rotating a tablet), start the render/physics loops.
        if (!cradleActive) {
            cradleActive = true;
            Render.run(render);
            Runner.run(runner, engine);
        }
    }, 150);
});

gsap.from('#canvas-container', {
    duration: 1.2,
    scale: 0.95,
    opacity: 0,
    ease: 'power3.out'
});

const invertOverlay = document.querySelector('.invert-overlay');
const textToggle = document.getElementById('text-toggle');

// Create per-popup inner overlays that mirror the main dark-mode sweep
// while leaving images/video above them untouched.
document.querySelectorAll('.popup-box').forEach(box => {
    const popupOverlay = document.createElement('div');
    popupOverlay.className = 'popup-invert-overlay';
    box.appendChild(popupOverlay);
});
const popupInverts = document.querySelectorAll('.popup-invert-overlay');

textToggle.addEventListener('change', function() {
    textEnabled = this.checked;
    document.body.classList.toggle('dark-mode', !textEnabled);
    
    if (!textEnabled) {
        activeBall = null;
        // Sweep from left to right
        gsap.to(invertOverlay, {
            opacity: 1,
            clipPath: 'inset(0 0% 0 0)',
            duration: 1.2,
            ease: 'power2.inOut'
        });
        gsap.to(popupInverts, {
            clipPath: 'inset(0 0% 0 0)',
            duration: 1.2,
            ease: 'power2.inOut'
        });
    } else {
        // Sweep from right to left
        gsap.to(invertOverlay, {
            opacity: 1,
            clipPath: 'inset(0 100% 0 0)',
            duration: 1.2,
            ease: 'power2.inOut'
        });
        gsap.to(popupInverts, {
            clipPath: 'inset(0 100% 0 0)',
            duration: 1.2,
            ease: 'power2.inOut'
        });
        // When turning text back ON, reset any fallen letters
        letterBodies.forEach((letter) => {
            if (letter.hasFallen) {
                // Use stored original position
                const originalX = letter.originalX;
                const originalY = letter.originalY;
                
                // Position letter at top of screen
                Matter.Body.setPosition(letter, { x: originalX, y: -100 });
                Matter.Body.setVelocity(letter, { x: 0, y: 0 });
                Matter.Body.setAngularVelocity(letter, 0);
                Matter.Body.setAngle(letter, 0);
                
                // Animate it dropping back to original position
                gsap.to(letter.position, {
                    y: originalY,
                    duration: 0.8,
                    ease: 'bounce.out',
                    onUpdate: function() {
                        Matter.Body.setPosition(letter, { x: originalX, y: letter.position.y });
                    },
                    onComplete: function() {
                        // Make it static again and reset hasFallen after animation completes
                        Matter.Body.setStatic(letter, true);
                        Matter.Body.setPosition(letter, { x: originalX, y: originalY });
                        Matter.Body.setAngle(letter, 0);
                        letter.hasFallen = false;
                    }
                });
            }
        });
    }
});

// Islanding MP4 player
(function() {
    const popup = document.getElementById('popup-4');
    const video = document.querySelector('.islanding-video');
    const overlay = document.querySelector('.islanding-pause-overlay');
    if (!popup || !video) return;

    function updateOverlay() {
        if (overlay) overlay.classList.toggle('paused', video.paused);
    }

    function toggleVideo() {
        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    }

    video.addEventListener('play', updateOverlay);
    video.addEventListener('pause', updateOverlay);
    video.addEventListener('click', toggleVideo);

    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                if (popup.classList.contains('active')) {
                    video.play();
                } else {
                    video.pause();
                }
            }
        });
    });
    observer.observe(popup, { attributes: true, attributeFilter: ['class'] });

    updateOverlay();
})();

// ==========================================================================
// Color picker landing screen — hands off into the cradle above it.
// Desktop/tablet only. Mobile, ?skip=1, and "already seen this session" are
// all handled pre-paint by the inline script at the top of templates/index.html
// (adds html.picker-skip, which hides #picker-overlay via CSS) — this module
// just checks that same class and no-ops if it's set.
// ==========================================================================
(function () {
    if (document.documentElement.classList.contains('picker-skip')) return;

    const overlay = document.getElementById('picker-overlay');
    const swatchesWrap = document.getElementById('picker-swatches');
    const stage = document.getElementById('picker-stage');
    const navEl = document.querySelector('.popup-nav');
    const frameLayer = document.getElementById('frame-layer');
    if (!overlay || !swatchesWrap || !stage) return;

    // Shared pull angle: the DOM morph below and the real physics pin in cutToCradle()
    // both use this, so the picker's final frame and the live canvas's first frame match.
    const PULL_UX = 0.757, PULL_UY = -0.653;
    const popupTitles = ['About', 'Prinsys', 'Encrypted Chat', 'Algorithmic Crafting', 'Islanding NYC', 'Contact'];
    const swatchText = ['#f2f0ef', '#f2f0ef', '#f2f0ef', '#f2f0ef', '#f2f0ef', '#f2f0ef'];
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // End-state geometry for the ball's three highlight circles, in % of .picker-fill's
    // own box (NOT the ball's full box) — these elements are appended to fill, and fill
    // is inset 3.5% per side (93% of the ball's diameter) to match the real canvas's
    // radius*0.93 clip. A ring meant to have true radius R centered at true offset
    // (o,o), in units of the ball's own radius, needs size = 2R/1.86*100 and
    // left/top = (o - R + 0.93)/1.86*100 when expressed against fill's smaller box —
    // using the ball's full diameter for that math (as if fill == ball) undersizes
    // every ring by ~7%, which is what made them visibly grow at the hand-off cut.
    const RING_BIG = { left: '2.00%', top: '2.00%', size: '76.65%' };
    const RING_MED = { left: '11.01%', top: '11.01%', size: '51.10%' };
    const RING_SMALL = { left: '19.68%', top: '19.68%', size: '28.39%' };
    const HIGHLIGHT_END_COLOR = 'rgba(242, 240, 239, 0.24)';
    // Matches the card's own .picker-stack-layer-1/2/3 colors, front to back.
    const BAND_COLORS = ['rgba(242, 240, 239, 0.24)', 'rgba(242, 240, 239, 0.17)', 'rgba(242, 240, 239, 0.10)'];

    function div(cls) { const d = document.createElement('div'); d.className = cls; return d; }
    function markDone() { try { sessionStorage.setItem('pickerDone', '1'); } catch (e) {} }

    let sequenceActive = false;
    const pickerButtons = [];

    // If a resize fires mid-sequence, clearScene() is about to remove the very bodies
    // pinnedGroup and cameraZoom point at (see cradle.js's resize handler above). Drop
    // everything back to the plain at-rest cradle rather than leave a stuck zoom or
    // dead pointer-events.
    pickerAbort = function () {
        // Only a resize that lands mid-sequence (pinned/zooming) needs cleanup. A resize
        // while the picker is just sitting there unclicked, or after it's already handed
        // off normally, must NOT touch it — this used to fire on every ordinary resize
        // (including the layout settle right after page load) and force-hide the picker
        // before the visitor ever got to click a swatch.
        if (!sequenceActive) return;
        sequenceActive = false;
        pinnedGroup = [];
        highlightsFrozen = false;
        cameraZoom.s = 1; cameraZoom.tx = 0; cameraZoom.ty = 0;
        clearZoomTransform();
        overlay.hidden = true;
        overlay.classList.remove('picker-leaving');
        stage.hidden = true;
        stage.innerHTML = '';
        canvas.style.pointerEvents = '';
        if (navEl) navEl.style.pointerEvents = '';
        // Drop back to the always-fully-visible default rather than leaving the frame
        // stuck mid-reveal if a resize interrupts the sequence.
        if (frameLayer) { frameLayer.getAnimations().forEach(function (a) { a.cancel(); }); frameLayer.style.clipPath = ''; }
        markDone();
    };

    ballColors.forEach(function (hex, i) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'picker-swatch';
        b.setAttribute('aria-label', hex + ' — ' + popupTitles[i]);
        b.style.setProperty('--c', hex);
        b.style.setProperty('--t', swatchText[i]);
        // Same stacked/rounded shelf treatment as the About/Contact popup footers
        // (see .stack-layer / .picker-stack-layer), not flat tint bars. The layers sit
        // inside the fill so they lighten it and get clipped by its own rounded corners.
        b.innerHTML =
            '<span class="picker-swatch-fill">' +
                '<span class="picker-swatch-stack">' +
                    '<span class="picker-stack-layer picker-stack-layer-3"></span>' +
                    '<span class="picker-stack-layer picker-stack-layer-2"></span>' +
                    '<span class="picker-stack-layer picker-stack-layer-1"></span>' +
                '</span>' +
                '<span class="picker-top"><span class="picker-hex">' + hex + '</span></span>' +
            '</span>';
        b.addEventListener('click', function () { choose(i, b); });
        swatchesWrap.appendChild(b);
        pickerButtons.push(b);
    });

    // Same rule as the nav-label re-pull handler above: balls 0-2 pull left and drag
    // everything from themselves down to red along; balls 3-5 pull right and drag
    // everything from themselves up to purple along. Red and purple are always alone.
    function pickerGroup(i) {
        if (i <= 2) {
            const indices = [];
            for (let k = 0; k <= i; k++) indices.push(k);
            return { dir: 'left', indices: indices };
        }
        const indices = [];
        for (let k = i; k <= 5; k++) indices.push(k);
        return { dir: 'right', indices: indices };
    }

    function choose(i, btn) {
        if (sequenceActive) return;
        sequenceActive = true;

        const group = pickerGroup(i);
        const dir = group.dir, indices = group.indices;

        overlay.classList.add('picker-leaving');
        indices.forEach(function (idx) { pickerButtons[idx].classList.add('picked'); });

        if (reduce || !btn.animate) {
            finishReduced(i, dir);
            return;
        }

        const W = innerWidth, H = innerHeight;
        const D = Math.min(H * 0.34, W * 0.6);
        // Camera sits toward the side the ball is pulled from — red/orange/yellow pull
        // left, so the shot is biased left (0.36); green/blue/purple pull right, biased
        // right (0.64) — not a dead-center zoom either direction.
        const cx = dir === 'left' ? W * 0.36 : W * 0.64, cy = H * 0.52;
        const side = dir === 'left' ? 1 : -1;
        const ux = PULL_UX * side, uy = PULL_UY;
        const len = Math.hypot(W, H) * 1.2;
        // The real string is drawn from ball.stringAttachY (a cosmetic anchor a bit below
        // the true physics anchor, constraints[i].pointA) down to the ball's true pinned
        // position (pointA - u*L) — not a pure straight line along the pull direction u.
        // Compute the mockup's angle/pivot from that same true geometry instead of the
        // idealized u direction, so the string doesn't visibly kink to a different angle
        // the instant cutToCradle hands off to the real canvas string.
        const anchor = constraints[i].pointA;
        const L = constraints[i].length;
        const offsetY = balls[i].stringAttachY - anchor.y;
        const trueDx = -ux * L, trueDy = -uy * L - offsetY;
        const dirMag = Math.hypot(trueDx, trueDy);
        const dirX = trueDx / dirMag, dirY = trueDy / dirMag;
        const theta = Math.atan2(-dirX, dirY) * 180 / Math.PI;
        // Same scale cutToCradle will pin the real balls at, and the real cradle's own
        // ball-to-ball spacing (see buildScene's `spacing`) — used below so every group
        // member lands exactly where its real, physics-pinned counterpart will be. Off
        // by even a little, the picker's string (a straight line at the right angle but
        // an approximate anchor) and the real cradle's string (drawn from the ball's
        // actual anchor point) show up as two visibly separate lines during the hand-off.
        const s0 = D / (2 * ballRadius);
        const spacing = ballRadius * 2.02;
        // The real canvas string is a constant 3px in scene units, then scaled by the
        // CSS zoom (see afterRender's context.lineWidth = 3) — match that exactly here
        // instead of sizing off the picker's own zoomed diameter, so the width doesn't
        // visibly change at the hand-off cut.
        const strW = Math.max(3, 3 * s0);

        stage.innerHTML = '';
        stage.hidden = false;

        // Farthest-from-primary first, so the clicked ball paints last (on top, in focus).
        const order = indices.slice().sort(function (a, b) { return Math.abs(b - i) - Math.abs(a - i); });
        let primaryMorph = null;

        order.forEach(function (idx) {
            const c = ballColors[idx], edge = ballOutlineColors[idx];
            const srcBtn = pickerButtons[idx];
            const r = srcBtn.getBoundingClientRect();
            const targetX = cx + (idx - i) * s0 * spacing, targetY = cy;
            const delay = Math.abs(idx - i) * 60;
            const T = 530;

            const ball = div('picker-ball'), fill = div('picker-fill'), string = div('picker-string');
            fill.style.background = c;
            ball.appendChild(fill);
            // Appended to fill (not ball) so they're clipped to the fill's own inset
            // boundary — the same relationship the real canvas ball uses (highlight
            // circles clipped to radius*0.93, just inside the outline) — instead of only
            // being clipped to the ball's full outer edge, which let them bleed into
            // where the dark outline ring renders.
            //
            // The three card highlight bands morph into the three ball highlight circles
            // (not a fade): measure each band's real on-screen rect, express it as a %
            // of this swatch's own box, and animate left/top/width/height/border-radius
            // straight to the matching ring's geometry, on the same duration/delay/
            // easing as the ball's own shape morph below. DOM order of the bands is
            // layer-3, layer-2, layer-1 (see the swatch markup above) — back to front —
            // so index 2 is the bottom/most-opaque band and index 0 the top/tallest one.
            const bandLayers = srcBtn.querySelectorAll('.picker-stack-layer');
            const bandToRing = [
                { layer: bandLayers[2], color: BAND_COLORS[0], end: RING_SMALL }, // bottom band -> smallest ring
                { layer: bandLayers[1], color: BAND_COLORS[1], end: RING_MED },   // middle band -> middle ring
                { layer: bandLayers[0], color: BAND_COLORS[2], end: RING_BIG }    // top/tallest band -> largest ring
            ];
            bandToRing.forEach(function (pair) {
                if (!pair.layer) return;
                const lr = pair.layer.getBoundingClientRect();
                const hl = div('picker-highlight-morph');
                const start = {
                    left: ((lr.left - r.left) / r.width * 100) + '%',
                    top: ((lr.top - r.top) / r.height * 100) + '%',
                    width: (lr.width / r.width * 100) + '%',
                    height: (lr.height / r.height * 100) + '%',
                    borderRadius: '40% 40% 0 0',
                    background: pair.color
                };
                Object.assign(hl.style, start);
                fill.appendChild(hl);
                hl.animate([
                    start,
                    { left: pair.end.left, top: pair.end.top, width: pair.end.size, height: pair.end.size, borderRadius: '50%', background: HIGHLIGHT_END_COLOR }
                ], { duration: T, delay: delay, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' });
            });
            ball.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;border-radius:24px;';

            const ax = targetX - dirX * len, ay = targetY - dirY * len;
            string.style.cssText = 'left:' + (ax - strW / 2) + 'px;top:' + ay + 'px;width:' + strW + 'px;height:' + len + 'px;transform:rotate(' + theta + 'deg);';

            stage.appendChild(string);
            stage.appendChild(ball);

            const end = { left: (targetX - D / 2) + 'px', top: (targetY - D / 2) + 'px', width: D + 'px', height: D + 'px', borderRadius: (D / 2) + 'px' };
            const opt = { duration: T, delay: delay, easing: 'cubic-bezier(.6,0,.2,1)', fill: 'forwards' };

            const morph = ball.animate([
                { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: '24px' }, end
            ], opt);
            ball.animate([{ background: 'rgba(0,0,0,0)' }, { background: edge }], opt);
            fill.animate([{ inset: '0%' }, { inset: '3.5%' }], opt);
            string.animate(
                [{ transform: 'rotate(' + theta + 'deg) scaleY(0)' }, { transform: 'rotate(' + theta + 'deg) scaleY(1)' }],
                { duration: 300, delay: delay + T - 100, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' }
            );

            if (idx === i) primaryMorph = morph;
        });

        primaryMorph.onfinish = function () {
            setTimeout(function () { cutToCradle(i, dir, indices, cx, cy, D); }, 280);
        };
    }

    function finishReduced(i, dir) {
        overlay.hidden = true;
        stage.hidden = true;
        markDone();
        openPopup(i, dir);
    }

    // Pins the real cradle balls into the same pulled-out pose the picker just drew, then
    // zooms/pans the canvas (see cameraZoom in afterRender above) to match the picker's
    // final frame exactly, cuts the overlay away, and eases the camera back out.
    function cutToCradle(primaryIndex, dir, indices, cx, cy, D) {
        const side = dir === 'left' ? 1 : -1;
        const ux = PULL_UX * side, uy = PULL_UY;

        // Pin target is anchored at the constraint's own pointA (frameTop), not at
        // ball.stringAttachX/Y — stringAttachY is a cosmetic offset used only for where
        // the string is *drawn* (see buildScene), not where the real Matter Constraint
        // (still attached, stiffness 1) is anchored. Pinning to the wrong anchor left the
        // ball a tick away from satisfying its own constraint; the solver then yanked it
        // to the correct spot on the very next physics step, after cameraZoom had already
        // been computed against the wrong position — a one-frame snap that stuck for the
        // rest of the zoom. Anchoring the pin at the same point the constraint actually
        // uses means there's nothing left for the solver to correct.
        pinnedGroup = indices.map(function (idx) {
            const ball = balls[idx];
            const anchor = constraints[idx].pointA;
            const L = constraints[idx].length;
            ball._pinTarget = { x: anchor.x - ux * L, y: anchor.y - uy * L };
            Matter.Body.setPosition(ball, ball._pinTarget);
            Matter.Body.setVelocity(ball, { x: 0, y: 0 });
            Matter.Body.setAngularVelocity(ball, 0);
            return ball;
        });
        highlightsFrozen = true;
        // Snap straight to the resting highlight offsets instead of leaving them to ease
        // there from wherever mouse-tracking last left them — freezing the *target* alone
        // still let the existing per-frame lerp visibly drift toward rest for a couple
        // hundred ms (through the frame draw-in and into the zoom-out), and a large
        // leftover offset could push the highlight past the ball's own clip boundary.
        indices.forEach(function (idx) {
            const h = ballHighlights[idx];
            h.x = h.staticX; h.y = h.staticY;
            h.x2 = -ballRadius * 0.25; h.y2 = -ballRadius * 0.25;
            h.x3 = -ballRadius * 0.18; h.y3 = -ballRadius * 0.18;
        });

        // Draw the frame in top-to-bottom instead of it sitting fully-rendered behind
        // the opaque overlay and appearing all at once the instant that overlay is
        // hidden. Only one leg is on screen while zoomed in, but the clip sweeps the
        // whole image, so whichever leg is visible draws down along with it. The
        // zoom-out (below) is delayed by this same duration so the frame is always
        // fully drawn before the camera starts pulling back.
        const FRAME_REVEAL_MS = 300;

        const primary = balls[primaryIndex];
        const s0 = D / (2 * ballRadius);
        cameraZoom.s = s0;
        cameraZoom.tx = cx - s0 * primary.position.x;
        cameraZoom.ty = cy - s0 * primary.position.y;
        applyZoomTransform();

        canvas.style.pointerEvents = 'none';
        if (navEl) navEl.style.pointerEvents = 'none';

        // Hard cut, not a fade: the pin/cameraZoom above are already in effect, so
        // #canvas-container is already rendering this exact ball at this exact
        // position/scale by the time this line runs. A fade here would hold the DOM
        // mockup and the real canvas ball on screen together for a stretch — and since
        // one draws an exact physics-anchored string and the other an approximated one,
        // any such overlap window shows up as two faint, slightly offset balls/strings.
        // Cutting instantly means there's only ever one ball on screen.
        overlay.hidden = true;
        stage.hidden = true;

        // Same duration/easing rate the strings draw in at (see choose() above).
        if (frameLayer) {
            frameLayer.style.clipPath = 'inset(0 0 100% 0)';
            frameLayer.animate(
                [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }],
                { duration: FRAME_REVEAL_MS, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }
            );
        }

        gsap.to(cameraZoom, {
            s: 1, tx: 0, ty: 0,
            duration: 1.2,
            delay: FRAME_REVEAL_MS / 1000,
            ease: 'power3.inOut',
            onUpdate: applyZoomTransform,
            // Mouse-tracking highlights resume the instant the zoom-out visually
            // finishes (not at release) — they'd already be fully converged on the
            // cursor position by the time the ball is let go a beat later.
            onComplete: function () {
                highlightsFrozen = false;
                // Land fully zoomed out, hold the pulled pose a beat, then let go —
                // matches the pause a visitor sees before they actually release a
                // dragged ball.
                setTimeout(function () { release(primaryIndex, dir); }, 250);
            }
        });
    }

    // Same release path a manual drag already uses: clear the pin, set activeBall /
    // activeBallDirection, and let gravity + the string constraint take it from there.
    // The existing collisionStart handler (above) opens the popup when it lands.
    function release(primaryIndex, dir) {
        pinnedGroup = [];
        clearZoomTransform();
        activeBall = balls[primaryIndex];
        activeBallDirection = dir;
        canvas.style.pointerEvents = '';
        if (navEl) navEl.style.pointerEvents = '';
        sequenceActive = false;
        markDone();
    }
})();
