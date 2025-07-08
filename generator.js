import { holdStrobeEffect, blackBackground, imageCollage, perspectiveTunnelCollage, fallingPolaroidsCollage, cleanTiledText, spiralVortex, simpleTunnel, hourglassTiling, layeredWarpText, passThrough, postLiquidDisplace, pixelate, rgbSplit } from './effects.js';


const mediaManager = {
    images: [],
    imageUrls: [
        'assets/images/DSCF4317.JPG', 'assets/images/DSCF4379.JPG', 'assets/images/DSCF7135.jpg', 
        'assets/images/DSCF8082.jpg', 'assets/images/DSCF8191.jpg', 'assets/images/DSCF4325.JPG', 
        'assets/images/DSCF6856.jpg', 'assets/images/DSCF7136.jpg', 'assets/images/DSCF8084.jpg', 
        'assets/images/DSCF8196.jpg', 'assets/images/DSCF4327.JPG', 'assets/images/DSCF6873.jpg', 
        'assets/images/DSCF7137.jpg', 'assets/images/DSCF8123.jpg', 'assets/images/DSCF8206.jpg', 
        'assets/images/DSCF4342.JPG', 'assets/images/DSCF6875.jpg', 'assets/images/DSCF7138.jpg', 
        'assets/images/DSCF8138.jpg', 'assets/images/DSCF8209.jpg', 'assets/images/DSCF4355.JPG', 
        'assets/images/DSCF7100.jpg', 'assets/images/DSCF7142.jpg', 'assets/images/DSCF8153.jpg', 
        'assets/images/DSCF8211.jpg', 'assets/images/DSCF4366.JPG', 'assets/images/DSCF7112.jpg', 
        'assets/images/DSCF7143.jpg', 'assets/images/DSCF8154.jpg', 'assets/images/DSCF8276.jpg', 
        'assets/images/DSCF4372.JPG', 'assets/images/DSCF7119.jpg', 'assets/images/DSCF7147.jpg', 
        'assets/images/DSCF8176.jpg', 'assets/images/DSCF8278.jpg', 'assets/images/DSCF4374.JPG', 
        'assets/images/DSCF7132.jpg', 'assets/images/DSCF7151.jpg', 'assets/images/DSCF8179.jpg', 
        'assets/images/DSCF4375.JPG', 'assets/images/DSCF7133.jpg', 'assets/images/DSCF7154.jpg', 
        'assets/images/DSCF8181.jpg'
    ],
    async load(updateProgress) {
        const imagePromises = this.imageUrls.map(url => 
            new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    updateProgress();
                    resolve(img);
                };
                img.onerror = () => reject(`Failed to load image at: ${url}`);
                img.src = url;
            })
        );
        const loadedImages = await Promise.all(imagePromises);
        
        // Resize images once on load
        this.images = loadedImages.map(img => {
            const maxDim = 1200;
            const scale = Math.min(maxDim / img.width, maxDim / img.height);
            const newWidth = img.width * scale;
            const newHeight = img.height * scale;
            const offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = newWidth;
            offscreenCanvas.height = newHeight;
            const offscreenCtx = offscreenCanvas.getContext('2d');
            offscreenCtx.drawImage(img, 0, 0, newWidth, newHeight);
            return offscreenCanvas;
        });
        console.log('Shared media assets loaded and resized once!');
    }
};

const allEffects = {
    // Background Effects
    imageCollage,
    perspectiveTunnelCollage, 
    fallingPolaroidsCollage,
    blackBackground,
    holdStrobeEffect,

    // Foreground (Text) Effects
    cleanTiledText,
    spiralVortex,
    simpleTunnel,
    hourglassTiling, 
    layeredWarpText,

    // Post-processing (WebGL) Effects
    passThrough,
    postLiquidDisplace,
    pixelate,
    rgbSplit,
};

// --- RANDOMIZER SETUP ---
const foregroundEffectNames = ['cleanTiledText', 'spiralVortex', 'simpleTunnel', 'hourglassTiling', 'layeredWarpText'];
// const foregroundEffectNames = ['layeredWarpText'];
const backgroundEffectNames = ['imageCollage', 'perspectiveTunnelCollage', 'fallingPolaroidsCollage', 'blackBackground', 'holdStrobeEffect'];

const postEffectNames = ['passThrough', 'postLiquidDisplace', 'rgbSplit'];
let lastSwitchTime = 0;


// --- SETUP CANVASES ---
const mainCanvas = document.getElementById('collage-canvas');
const backgroundCanvas = document.createElement('canvas');
const foregroundCanvas = document.createElement('canvas');
const compositeCanvas = document.createElement('canvas');
const compositeCtx = compositeCanvas.getContext('2d');

let lyrics = [], startTime = 0, currentLyric = "";
let activeForeground = null, activePost = null;
let physicalMouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 }; // Tracks the real cursor
let mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 }; // Tracks the smoothed position
let audioContext, audioBuffer;

let isDragging = false;
let touchStartX = 0;
let touchStartY = 0;

// --- Hold Gesture Variables ---
let holdTimer = null;
let isHolding = false;
const HOLD_DURATION = 500; // ms


// --- Beat tracking variables ---
let onsetData = { onsets: [] };
let nextOnsetIndex = 0;
let onsetPulse = 0; // Will spike to the 'strength' of an onset, then decay
let pulseTarget = 0; // This value jumps instantly on a beat

let activeBackground = null; // Changed from const to let

// --- UI Elements ---
const loadingOverlay = document.getElementById('loading-overlay');
const progressBar = document.getElementById('progress-bar');
const progressPercent = document.getElementById('progress-percent');
const audioPromptOverlay = document.getElementById('audio-prompt-overlay');
const startButton = document.getElementById('start-button');

function resizeCanvases() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    mainCanvas.width = backgroundCanvas.width = foregroundCanvas.width = compositeCanvas.width = w;
    mainCanvas.height = backgroundCanvas.height = foregroundCanvas.height = compositeCanvas.height = h;
}

function animate() {
    const now = performance.now();
    const elapsedSeconds = (now - startTime) / 1000;

    // --- NEW: Add Mouse Smoothing / Easing ---
    // The smoothed mouse position gently "chases" the actual cursor position.
    // A smaller easing factor (e.g., 0.05) creates more lag.
    const easingFactor = 0.08;
    mouse.x += (physicalMouse.x - mouse.x) * easingFactor;
    mouse.y += (physicalMouse.y - mouse.y) * easingFactor;

    // --- (The rest of the animate function remains exactly the same) ---

    // Onset Detection Logic
    onsetPulse += (pulseTarget - onsetPulse) * 0.2;
    pulseTarget *= 0.9;
    if (nextOnsetIndex < onsetData.onsets.length) {
        const nextOnset = onsetData.onsets[nextOnsetIndex];
        if (elapsedSeconds >= nextOnset.time) {
            pulseTarget = nextOnset.strength; 
            nextOnsetIndex++;
            if (Math.random() < 0.15) {
                switchEffects();
            }
        }
    }
    
    // Lyric Update Logic
    const activeLyric = lyrics.find(l => elapsedSeconds >= (l.startTime / 1000) && elapsedSeconds <= (l.endTime / 1000));
    const newText = activeLyric ? activeLyric.text : " ";
    if (newText !== currentLyric) {
        currentLyric = newText;
        activeForeground?.module.onLyricChange?.(currentLyric);
    }

    // RENDER PIPELINE
    // All effects will now automatically use the new smoothed `mouse` values
    activeBackground?.module.update(mouse, now, onsetPulse);
    activeForeground?.module.update(mouse, now, currentLyric, onsetPulse);
    
    compositeCtx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
    compositeCtx.drawImage(foregroundCanvas, 0, 0); 
    compositeCtx.globalCompositeOperation = 'screen';
    compositeCtx.drawImage(backgroundCanvas, 0, 0);
    compositeCtx.globalCompositeOperation = 'source-over';

    activePost?.module.update(compositeCanvas, mouse, now, onsetPulse);
    
    requestAnimationFrame(animate);
} 

// Simplified playAudio function
function playAudio() {
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.loop = true;
    source.start(0);
}

function handlePointerDown(e) {
    e.preventDefault();
    const pointer = e.touches ? e.touches[0] : e;
    
    // Setup for tap vs drag detection
    isDragging = false;
    touchStartX = pointer.clientX;
    touchStartY = pointer.clientY;
    
    // Start timer for the hold gesture
    holdTimer = setTimeout(() => {
        isHolding = true;
        console.log("--- Hold Activated: Strobe Effect ---");
        
        // Override the current background with the hold effect
        activeBackground?.module.cleanup();
        const bgModule = allEffects['holdStrobeEffect'];
        activeBackground = { name: 'holdStrobeEffect', module: bgModule };
        activeBackground.module.setup(backgroundCanvas, null, mediaManager.images);

    }, HOLD_DURATION);
}

function handlePointerUp(e) {
    clearTimeout(holdTimer); // Always clear the timer on release

    if (isHolding) {
        // If the hold was active, release it and switch to a new random effect
        isHolding = false;
        console.log("--- Hold Released ---");
        switchEffects();
    } else if (!isDragging) {
        // If it wasn't a hold and wasn't a drag, it was a tap/click
        switchEffects();
    }
    
    isDragging = false; // Reset for the next interaction
}

function handlePointerMove(e) {
    e.preventDefault();
    const pointer = e.touches ? e.touches[0] : e;
    
    // This now updates the REAL mouse position
    physicalMouse.x = pointer.clientX;
    physicalMouse.y = pointer.clientY;
    
    // The drag detection logic from the hold gesture remains the same
    if (e.touches) {
        const dx = pointer.clientX - touchStartX;
        const dy = pointer.clientY - touchStartY;
        if (Math.sqrt(dx * dx + dy * dy) > 10) { 
            isDragging = true;
            clearTimeout(holdTimer);
        }
    }
}

async function init() {
    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);

    // --- NEW: Combined Event Handlers for Tap, Drag, and Hold ---
    const DRAG_THRESHOLD = 10;
    // --- Event Listeners for both Mobile and Desktop ---
    mainCanvas.addEventListener('mousedown', handlePointerDown);
    mainCanvas.addEventListener('mouseup', handlePointerUp);
    mainCanvas.addEventListener('mouseleave', handlePointerUp);
    mainCanvas.addEventListener('mousemove', handlePointerMove);

    mainCanvas.addEventListener('touchstart', handlePointerDown, { passive: false });
    mainCanvas.addEventListener('touchend', handlePointerUp);
    mainCanvas.addEventListener('touchcancel', handlePointerUp);
    mainCanvas.addEventListener('touchmove', handlePointerMove, { passive: false });

    // --- (The rest of the loading logic remains exactly the same) ---
    const assetsToLoad = [
        ...mediaManager.imageUrls,
        'assets/Blackout Midnight.ttf',
        'assets/audio/IKYHWM.mp3',
        'assets/audio/IKYHWM_data.json',
    ];
    const totalAssets = assetsToLoad.length;
    let loadedAssets = 0;

    const updateProgress = () => {
        loadedAssets++;
        const percent = Math.floor((loadedAssets / totalAssets) * 100);
        progressBar.style.width = `${percent}%`;
        progressPercent.innerText = `${percent}%`;
    };

    const fontPromise = new FontFace('Blackout', 'url("assets/Blackout Midnight.ttf")').load().then(font => {
        document.fonts.add(font);
        updateProgress();
    });

    const lyricsPromise = fetch('assets/TEST.srt').then(res => res.text()).then(text => {
        lyrics = parseSRT(text);
        updateProgress();
    });
    
    const onsetsPromise = fetch('assets/audio/IKYHWM_data.json').then(res => res.json()).then(data => {
        onsetData = data;
        updateProgress();
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioPromise = fetch('assets/audio/IKYHWM.mp3').then(res => res.arrayBuffer()).then(buffer => audioContext.decodeAudioData(buffer)).then(decoded => {
        audioBuffer = decoded;
        updateProgress();
    });
    
    await mediaManager.load(updateProgress);

    console.log("All assets loaded!");
    
    const initialBgEffectName = backgroundEffectNames[0];
    const bgModule = allEffects[initialBgEffectName];
    activeBackground = { name: initialBgEffectName, module: bgModule };
    activeBackground.module.setup(backgroundCanvas, null, mediaManager.images);
    
    const initialFgEffectName = foregroundEffectNames[0];
    const fgModule = allEffects[initialFgEffectName];
    activeForeground = { name: initialFgEffectName, module: fgModule };
    activeForeground.module.setup(foregroundCanvas, lyrics.length > 0 ? lyrics[0].text : " ");

    const initialPostEffectName = postEffectNames[0];
    const postModule = allEffects[initialPostEffectName];
    activePost = { name: initialPostEffectName, module: postModule };
    activePost.module.setup(mainCanvas);
    console.log(`Initial effects pre-loaded: ${activeBackground.name}, ${activeForeground.name}, ${activePost.name}`);

    loadingOverlay.style.opacity = 0;
    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
        audioPromptOverlay.classList.remove('hidden');
    }, 500);

    startButton.addEventListener('click', () => {
        audioContext.resume();
        audioPromptOverlay.style.opacity = 0;
        setTimeout(() => {
            audioPromptOverlay.classList.add('hidden');
            
            playAudio();
            startTime = performance.now();
            switchEffects();
            animate(); 

        }, 500);
    }, { once: true });
}

function parseSRT(srtContent) {
    const timeToMs = t => t.split(/[:,]/).reduce((acc, val, i) => acc + [3600000, 60000, 1000, 1][i] * +val, 0);
    const blocks = srtContent.trim().replace(/\r/g, '').split('\n\n');
    return blocks.map(block => {
        const lines = block.split('\n');
        const timeLine = lines.find(line => line.includes('-->'));
        if (!timeLine) return null;
        const [start, end] = timeLine.split(' --> ');
        const text = lines.slice(lines.indexOf(timeLine) + 1).join(' ').trim();
        return { startTime: timeToMs(start), endTime: timeToMs(end), text };
    }).filter(Boolean);
}

function switchEffects() {
    // Don't switch effects if the user is in the middle of a hold gesture
    if (isHolding) return;

    console.log("--- Switching effects ---");
    
    // Switch Background Effect
    const currentBgEffectName = activeBackground?.name || '';
    let nextBgEffectName;
    do {
        nextBgEffectName = backgroundEffectNames[Math.floor(Math.random() * backgroundEffectNames.length)];
    } while (backgroundEffectNames.length > 1 && nextBgEffectName === currentBgEffectName);

    activeBackground?.module.cleanup();
    const bgModule = allEffects[nextBgEffectName];
    activeBackground = { name: nextBgEffectName, module: bgModule };
    activeBackground.module.setup(backgroundCanvas, null, mediaManager.images);
    console.log(`Switched background to: ${activeBackground.name}`);

    // --- Switch Foreground (Text) Effect ---
    const currentFgEffectName = activeForeground?.name || '';
    let nextFgEffectName;
    do {
        nextFgEffectName = foregroundEffectNames[Math.floor(Math.random() * foregroundEffectNames.length)];
    } while (foregroundEffectNames.length > 1 && nextFgEffectName === currentFgEffectName);

    activeForeground?.module.cleanup();
    const fgModule = allEffects[nextFgEffectName];
    activeForeground = { name: nextFgEffectName, module: fgModule };
    activeForeground.module.setup(foregroundCanvas, currentLyric);
    console.log(`Switched foreground to: ${activeForeground.name}`);
    
    // --- Switch Post-Processing Effect ---
    const nextPostEffectName = postEffectNames[Math.floor(Math.random() * postEffectNames.length)];
    activePost?.module.cleanup();
    const postModule = allEffects[nextPostEffectName];
    activePost = { name: nextPostEffectName, module: postModule };
    activePost.module.setup(mainCanvas);
    console.log(`Switched post-effect to: ${activePost.name}`);
}

init().catch(err => console.error("Initialization failed:", err));