const { Engine, Render, Runner, Bodies, Composite, Constraint, Mouse, MouseConstraint, Events } = Matter;

const canvas = document.getElementById('newtons-cradle');
const container = document.getElementById('canvas-container');

const width = container.clientWidth;
const height = container.clientHeight;

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

const ballRadius = height * 0.068;
const stringLength = height * 0.62;
const spacing = ballRadius * 2.02;
const frameTop = height * 0.165;
const stringStartOffset = height * 0.12;
const centerX = width / 2;

const balls = [];
const constraints = [];
const letterBodies = [];

let hoveredBall = null;
let mousePosition = { x: width / 2, y: height / 2 };
let ballHighlights = [];
let textOpacities = [];
let draggedBall = null;
let ballVelocities = [];
let recentlyDraggedBall = null;
let textEnabled = true;
let greyBlendAmounts = [0, 0, 0, 0, 0, 0];
let greyBlendTargets = [0, 0, 0, 0, 0, 0];

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

const nameText = "Remington Williams";
const fontSize = height * 0.09;
const letterSpacing = fontSize * 0.02;
const nameY = height * 0.225;

const ctx = document.createElement('canvas').getContext('2d');
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
        isStatic: false,
        friction: 0.3,
        restitution: 0.6,
        isSensor: true,
        render: {
            visible: false
        }
    });
    
    letter.char = char;
    letter.fontSize = fontSize;
    letter.hasFallen = false;
    letter.originalX = currentX + charWidth / 2;
    letter.originalY = nameY;
    
    // Start letters at top of screen for initial animation
    Matter.Body.setPosition(letter, { x: letter.originalX, y: -100 });
    
    letterBodies.push(letter);
    currentX += charWidth + letterSpacing * 0.1;
}

Composite.add(world, letterBodies);

// Animate all letters falling in on page load
letterBodies.forEach((letter) => {
    gsap.to(letter.position, {
        y: letter.originalY,
        duration: 0.8,
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
        // Only allow dragging if no ball is currently in "recently dragged" state
        if (!recentlyDraggedBall) {
            draggedBall = event.body;
        }
    }
});

Events.on(mouseConstraint, 'enddrag', function(event) {
    isDragging = false;
    if (balls.includes(event.body)) {
        const velocity = event.body.velocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        if (speed > 0.5) {
            recentlyDraggedBall = event.body;
        }
    }
    draggedBall = null;
});

let hoveredText = null;

window.addEventListener('mouseup', function() {
    if (isDragging) {
        isDragging = false;
        if (draggedBall && balls.includes(draggedBall)) {
            const velocity = draggedBall.velocity;
            const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
            if (speed > 0.5) {
                recentlyDraggedBall = draggedBall;
            }
        }
        draggedBall = null;
    }
});

render.canvas.addEventListener('mousemove', function(event) {
    const rect = render.canvas.getBoundingClientRect();
    const scaleX = render.canvas.width / rect.width;
    const scaleY = render.canvas.height / rect.height;
    
    mousePosition.x = (event.clientX - rect.left) * scaleX / (window.devicePixelRatio || 2);
    mousePosition.y = (event.clientY - rect.top) * scaleY / (window.devicePixelRatio || 2);
    
    if (!isDragging && mouseConstraint.body === null) {
        draggedBall = null;
    }
    
    // Check for cursor change only
    let canGrab = false;
    balls.forEach(ball => {
        const pos = ball.position;
        const dx = mousePosition.x - pos.x;
        const dy = mousePosition.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Only show grab cursor if no ball is currently in recently dragged state
        if (dist <= ballRadius && !recentlyDraggedBall) {
            canGrab = true;
        }
    });
    
    canvas.style.cursor = canGrab ? (isDragging ? 'grabbing' : 'grab') : 'default';
}, false);

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
        
        if (balls.includes(bodyA) && balls.includes(bodyB)) {
            const indexA = balls.indexOf(bodyA);
            const indexB = balls.indexOf(bodyB);
            
            // Check if recentlyDraggedBall hit its adjacent neighbor (one position closer to center)
            if (recentlyDraggedBall === bodyA) {
                // Ball A is the dragged ball
                // Left side (0,1,2): should hit ball to the right (index+1)
                // Right side (3,4,5): should hit ball to the left (index-1)
                const shouldClear = (indexA < 3 && indexB === indexA + 1) || 
                                   (indexA >= 3 && indexB === indexA - 1);
                if (shouldClear) {
                    recentlyDraggedBall = null;
                }
            } else if (recentlyDraggedBall === bodyB) {
                // Ball B is the dragged ball
                const shouldClear = (indexB < 3 && indexA === indexB + 1) || 
                                   (indexB >= 3 && indexA === indexB - 1);
                if (shouldClear) {
                    recentlyDraggedBall = null;
                }
            }
        }
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
            // Only show text for dragged or recently dragged ball
            if (draggedBall === ball || recentlyDraggedBall === ball) {
                targetOpacity = 1.0;
            }
        }
        
        textOpacities[index] += (targetOpacity - textOpacities[index]) * 0.15;
        const pos = ball.position;
        const dx = mousePosition.x - pos.x;
        const dy = mousePosition.y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
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
        
        const blendedOutline = blendColors(ballOutlineColors[index], '#3b3432', greyBlendAmounts[index]);
        const blendedColor = blendColors(ballColors[index], '#928179', greyBlendAmounts[index]);
        
        context.beginPath();
        context.arc(0, 0, radius, 0, 2 * Math.PI);
        context.fillStyle = blendedOutline;
        context.fill();
        
        context.beginPath();
        context.arc(0, 0, radius * 0.93, 0, 2 * Math.PI);
        context.fillStyle = blendedColor;
        context.fill();
        
        context.save();
        context.beginPath();
        context.arc(0, 0, radius * 0.93, 0, 2 * Math.PI);
        context.clip();
        
        context.beginPath();
        context.arc(highlight.x3, highlight.y3, radius * 0.7128, 0, 2 * Math.PI);
        context.fillStyle = 'rgba(242, 240, 239, 0.20)';
        context.fill();
        
        context.beginPath();
        context.arc(highlight.x2, highlight.y2, radius * 0.4752, 0, 2 * Math.PI);
        context.fillStyle = 'rgba(242, 240, 239, 0.20)';
        context.fill();
        
        context.beginPath();
        context.arc(highlight.x, highlight.y, radius * 0.264, 0, 2 * Math.PI);
        context.fillStyle = 'rgba(242, 240, 239, 0.20)';
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

Render.run(render);
const runner = Runner.create();
Runner.run(runner, engine);

window.addEventListener('resize', () => {
    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight;
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
});

gsap.from('#canvas-container', {
    duration: 1.2,
    scale: 0.95,
    opacity: 0,
    ease: 'power3.out'
});

const textToggle = document.getElementById('text-toggle');
textToggle.addEventListener('change', function() {
    textEnabled = this.checked;
    
    if (!textEnabled) {
        recentlyDraggedBall = null;
        // Animate to grey from left to right
        greyBlendTargets.forEach((_, index) => {
            gsap.to(greyBlendTargets, {
                [index]: 1,
                duration: 0.8,
                delay: index * 0.15,
                ease: 'power2.inOut'
            });
        });
    } else {
        // Animate to color from right to left
        greyBlendTargets.forEach((_, index) => {
            gsap.to(greyBlendTargets, {
                [index]: 0,
                duration: 0.8,
                delay: (greyBlendTargets.length - 1 - index) * 0.15,
                ease: 'power2.inOut'
            });
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
