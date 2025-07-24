const BASE_URL = 'https://pub-9da94effa96f44bb8d6f4ff32e9907a6.r2.dev'; 
// const BASE_URL = 'assets'; 
let maxDPR = 1.0;

import { holdStrobeEffect, blackBackground, imageCollage, perspectiveTunnelCollage, fallingPolaroidsCollage, 
        cleanTiledText, spiralVortex, simpleTunnel, hourglassTiling, layeredWarpText, 
        passThrough, postLiquidDisplace, pixelate, rgbSplit, filmGrain, scanLines, barrelDistortion } from './effects.js';

const mediaManager = {
    images: [],
    imageUrls: [
        'DSCF4317.webp', 'DSCF4379.webp', 'DSCF7135.webp', 
        'DSCF8082.webp', 'DSCF8191.webp', 'DSCF4325.webp', 
        'DSCF7136.webp', 'DSCF8084.webp', 
        'DSCF8196.webp', 'DSCF4327.webp', 'DSCF6873.webp', 
        'DSCF7137.webp', 'DSCF8123.webp', 'DSCF8206.webp', 
        'DSCF6875.webp', 'DSCF7138.webp', 
        'DSCF8138.webp', 'DSCF8209.webp', 'DSCF4355.webp', 
        'DSCF7100.webp', 'DSCF7142.webp', 'DSCF8153.webp', 
        'DSCF8211.webp', 'DSCF4366.webp', 'DSCF7112.webp', 
        'DSCF7143.webp', 'DSCF8154.webp', 'DSCF8276.webp', 
        'DSCF4372.webp', 'DSCF7119.webp', 'DSCF7147.webp', 
        'DSCF8176.webp', 'DSCF8278.webp', 'DSCF4374.webp', 
        'DSCF7132.webp', 'DSCF7151.webp', 'DSCF8179.webp', 
        'DSCF4375.webp', 'DSCF7133.webp', 'DSCF7154.webp', 
        '1.webp', '2.webp', '3.webp', '4.webp', 
        '5.webp','6.webp', '7.webp', '8.webp', '9.webp', '10.webp', 
        '11.webp', '12.webp', '13.webp'
    ].map(filename => `${BASE_URL}/images/${filename}`),
    async load(updateProgress) {
        const imagePromises = this.imageUrls.map(url => 
            new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = "Anonymous";
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

const fontOptions = [
    { name: 'Blackout2am',   url: `url("${BASE_URL}/Blackout%202%20AM.ttf")` },
    { name: 'Blackout',    url: `url("${BASE_URL}/Blackout%20Midnight.ttf")` },
    { name: 'BlackoutSun',  url: `url("${BASE_URL}/Blackout%20Sunrise.ttf")` }
];

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
    filmGrain, 
    scanLines, 
    barrelDistortion

};

const globalSettings = {
    backgroundColor: '#000000ff', // Default to black
    // backgroundColor: '#000000ff', // Default to black
    textColor: '#f4f4f4ff',       // Default to white
    fontFamily: 'Blackout',     // Default font
    strokeColor: '#000000ff',     // Default stroke color
    maxDPR: maxDPR
};

let lastSceneIndex = -1;

// --- EFFECT SETUP ---
const foregroundEffectNames = ['cleanTiledText', 'spiralVortex', 'simpleTunnel', 'hourglassTiling', 'layeredWarpText'];
const backgroundEffectNames = ['imageCollage', 'perspectiveTunnelCollage', 'fallingPolaroidsCollage', 'blackBackground', 'holdStrobeEffect'];
const postEffectNames = ['passThrough', 'postLiquidDisplace', 'rgbSplit',    'filmGrain', 'scanLines'];
let lastSwitchTime = 0;
let effectSequence = [];
let currentEffectCue = null;

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
let currentAudioSource = null; 

let isDragging = false;
let isPointerActive = false; 
let touchStartX = 0;
let touchStartY = 0;

// --- Hold Gesture Variables ---
let holdTimer = null;
let isHolding = false;
const HOLD_DURATION = 350; // ms

// --- Lyric fade-in variables ---
const FADE_IN_DURATION = 5; // ms
let lastLyricChangeTime = -Infinity;

// --- Beat tracking variables ---
let onsetData = { onsets: [] };
let nextOnsetIndex = 0;
let onsetPulse = 0; // Will spike to the 'strength' of an onset, then decay
let pulseTarget = 0; // This value jumps instantly on a beat

let activeBackground = null; 

// --- UI Elements ---
const loadingOverlay = document.getElementById('loading-overlay');
const progressBar = document.getElementById('progress-bar');
const progressPercent = document.getElementById('progress-percent');
const audioPromptOverlay = document.getElementById('audio-prompt-overlay');
const startButton = document.getElementById('start-button');

// --- 
function resizeCanvases() {
    const isIPhone = /iPhone/.test(navigator.userAgent);
    maxDPR = isIPhone ? 1.5 : 1.0; 
    const dpr = Math.min(window.devicePixelRatio || 1, maxDPR);
    // const dpr = window.devicePixelRatio || 1;

    // Get the logical viewport size
    const logicalWidth = window.innerWidth;
    const logicalHeight = window.innerHeight;

    // An array of all canvases to be resized
    const allCanvases = [mainCanvas, backgroundCanvas, foregroundCanvas, compositeCanvas];

    allCanvases.forEach(canvas => {
        // 1. Set the canvas's internal resolution to the full physical pixel size
        canvas.width = logicalWidth * dpr;
        canvas.height = logicalHeight * dpr;
    });

    // 2. Use CSS to set the canvas's display size back to the logical size
    // This is the crucial step that makes the high-res canvas fit the screen
    mainCanvas.style.width = `${logicalWidth}px`;
    mainCanvas.style.height = `${logicalHeight}px`;
}

function animate() {
    const now = performance.now();
    let elapsedSeconds = (now - startTime) / 1000;

    // Reset the start time if the audio has finished playing
    if (audioBuffer && elapsedSeconds >= audioBuffer.duration + 10) {
        startTime = now;      // Reset the main timer to the current moment
        elapsedSeconds = 0;   // Reset elapsed time for the current frame
        nextOnsetIndex = 0;   // Reset the beat tracker
        playAudio(); // Add this line to restart the audio
    }

    // Update the physical mouse position based on the real cursor
    const easingFactor = 0.08;
    mouse.x += (physicalMouse.x - mouse.x) * easingFactor;
    mouse.y += (physicalMouse.y - mouse.y) * easingFactor;

    // Onset Detection Logic
    onsetPulse += (pulseTarget - onsetPulse) * 0.2;
    pulseTarget *= 0.9;
    if (nextOnsetIndex < onsetData.onsets.length) {
        const nextOnset = onsetData.onsets[nextOnsetIndex];
        if (elapsedSeconds >= nextOnset.time) {
            pulseTarget = nextOnset.strength; 
            nextOnsetIndex++;
            if (nextOnset.strength > 0.4 && Math.random() < 0.55) {
                switchPostEffect();
            }
        }
    }
    
    // Lyric Update Logic
    const activeLyric = lyrics.find(l => elapsedSeconds >= (l.startTime / 1000) && elapsedSeconds <= (l.endTime / 1000));
    const newText = activeLyric ? activeLyric.text : " ";
    if (newText !== currentLyric) {
        currentLyric = newText;
        activeForeground?.module.onLyricChange?.(currentLyric);
        // Record the time of the change to start the fade
        lastLyricChangeTime = now;
    }

    // --- Effect Sequence Logic ---
    const activeCue = effectSequence.find(cue => elapsedSeconds >= (cue.startTime / 1000) && elapsedSeconds <= (cue.endTime / 1000));
    if (activeCue && activeCue !== currentEffectCue) {
        currentEffectCue = activeCue;
        const parts = activeCue.text.split(',').map(name => name.trim());
        
        // --- NEW: Font handling from SRT ---
        const fontName = parts[2]; // The font name is the third argument
        
        // Only change the font if a third argument exists and is a valid, loaded font
        if (fontName && fontOptions.some(font => font.name === fontName)) {
            if (fontName !== globalSettings.fontFamily) {
                console.log(`Setting font from SRT: ${fontName}`);
                globalSettings.fontFamily = fontName;
                // Force the foreground effect to re-initialize with the new font metrics
                activeForeground?.module.onLyricChange?.(currentLyric);
            }
        }

        
        const fgName = parts[0];
        const bgName = parts[1];
        switchEffects(bgName, fgName);
    }

    // RENDER PIPELINE
    const dpr = Math.min(window.devicePixelRatio || 1, maxDPR); // Using our capped DPR
    
    const interactionCoords = {
        x: mouse.x * dpr,
        y: mouse.y * dpr,
        isActive: isPointerActive
    };

    const bgCtx = backgroundCanvas.getContext('2d');
    const fgCtx = foregroundCanvas.getContext('2d');

    // Save the state of the background canvas, run the effect, then restore it
    bgCtx.save();
    activeBackground?.module.update(interactionCoords, now, onsetPulse);
    bgCtx.restore();

    // Save the state of the foreground canvas, run the effect, then restore it
    fgCtx.save();
    activeForeground?.module.update(interactionCoords, now, currentLyric, onsetPulse);
    fgCtx.restore();
    
    // --- Compositing Logic (remains the same) ---
    compositeCtx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
    
    const timeSinceChange = now - lastLyricChangeTime;
    const fadeInOpacity = Math.min(1.0, timeSinceChange / FADE_IN_DURATION);

    compositeCtx.globalAlpha = fadeInOpacity;
    compositeCtx.drawImage(foregroundCanvas, 0, 0); 
    
    compositeCtx.globalAlpha = 1.0; // Ensure full opacity
    compositeCtx.drawImage(backgroundCanvas, 0, 0);

    compositeCtx.globalAlpha = fadeInOpacity; // Apply fade for lyrics
    compositeCtx.drawImage(foregroundCanvas, 0, 0); 
    compositeCtx.globalAlpha = 1.0; // Reset alpha

    activePost?.module.update(compositeCanvas, interactionCoords, now, onsetPulse);
    
    requestAnimationFrame(animate);
} 

// Simplified playAudio function
function playAudio() {
    // If there's already a song playing, stop it
    if (currentAudioSource) {
        currentAudioSource.stop();
    }
    
    // Create a new audio source and play it
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start(0);

    // Keep track of the new source
    currentAudioSource = source;
}

function handlePointerDown(e) {
    e.preventDefault();
    isPointerActive = true; 
    const pointer = e.touches ? e.touches[0] : e;

    isDragging = false;
    touchStartX = pointer.clientX;
    touchStartY = pointer.clientY;

    holdTimer = setTimeout(() => {
        isHolding = true;
        console.log("--- Hold Activated: Strobe Effect ---");

        // We no longer need to save the last effect, just switch to the new one.
        activeBackground?.module.cleanup();
        const bgModule = allEffects['holdStrobeEffect'];
        activeBackground = { name: 'holdStrobeEffect', module: bgModule };
        activeBackground.module.setup(backgroundCanvas, null, mediaManager.images);

    }, HOLD_DURATION);
}

function handlePointerUp(e) {
    clearTimeout(holdTimer); 
    isPointerActive = false;

    if (isHolding) {
        isHolding = false;
        console.log("--- Hold Released, reverting to timeline effect ---");

        // If there's an active cue on the timeline, switch back to its background effect.
        if (currentEffectCue) {
            const effectNames = currentEffectCue.text.split(',').map(name => name.trim());
            const backgroundEffectName = effectNames[1];
            const foregroundEffectName = effectNames[0];
            // const foregroundEffectName = effectNames[0];
            // Call switchEffects to handle the transition back cleanly.
            switchEffects(backgroundEffectName, foregroundEffectName);
        }
    }

    isDragging = false;
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
        if (Math.sqrt(dx * dx + dy * dy) > 20) { 
            isDragging = true;
            clearTimeout(holdTimer);
        }
    }
}

async function init() {
    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);

    // --- Event Listeners for both Mobile and Desktop ---
    mainCanvas.addEventListener('mousedown', handlePointerDown);
    mainCanvas.addEventListener('mouseup', handlePointerUp);
    mainCanvas.addEventListener('mouseleave', handlePointerUp);
    mainCanvas.addEventListener('mousemove', handlePointerMove);
    mainCanvas.addEventListener('touchstart', handlePointerDown, { passive: false });
    mainCanvas.addEventListener('touchend', handlePointerUp);
    mainCanvas.addEventListener('touchcancel', handlePointerUp);
    mainCanvas.addEventListener('touchmove', handlePointerMove, { passive: false });

    // --- Loading Logic ---
    const promisesToLoad = [];
    let totalAssets = 0;
    let loadedAssets = 0;

    // Use a single, reliable progress updater
    const updateProgress = () => {
        loadedAssets++;
        const percent = Math.min(100, Math.floor((loadedAssets / totalAssets) * 100));
        progressBar.style.width = `${percent}%`;
        progressPercent.innerText = `${percent}%`;
    };

    // --- Setup all loading promises ---
    // const fontPromise = new FontFace('Blackout', `url("${BASE_URL}/Blackout%20Sunrise.ttf")`).load().then(font => {
    // const fontPromise = new FontFace('Blackout', `url("${BASE_URL}/Blackout%20Midnight.ttf")`).load().then(font => {
    const fontPromises = fontOptions.map(fontInfo => {
        // Create a new FontFace for each font in the array
        const font = new FontFace(fontInfo.name, fontInfo.url);
        
        // Load it and, once loaded, add it to the document
        return font.load().then(loadedFont => {
            document.fonts.add(loadedFont);
            updateProgress(); // Update your loading progress for each font
        });
    });
    
    promisesToLoad.push(fontPromises);

    const lyricsPromise = fetch(`${BASE_URL}/LYRICS.srt`).then(res => res.text()).then(text => {
        lyrics = parseSRT(text);
        updateProgress();
    });
    promisesToLoad.push(lyricsPromise);

    const effectSequencePromise = fetch(`${BASE_URL}/EFFECTS.srt`).then(res => res.text()).then(text => {
        effectSequence = parseSRT(text);
        updateProgress();
    });
    promisesToLoad.push(effectSequencePromise);

    const onsetsPromise = fetch(`${BASE_URL}/audio/IKYHWM_data.json`).then(res => res.json()).then(data => {
        onsetData = data;
        updateProgress();
    });
    promisesToLoad.push(onsetsPromise);

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioPromise = fetch(`${BASE_URL}/audio/IKYHWM.mp3`).then(res => res.arrayBuffer()).then(buffer => audioContext.decodeAudioData(buffer)).then(decoded => {
        audioBuffer = decoded;
        updateProgress();
    });
    promisesToLoad.push(audioPromise);

    // mediaManager.load is an async function, so it returns a promise we can track
    const mediaPromise = mediaManager.load(updateProgress);
    promisesToLoad.push(mediaPromise);

    // Calculate total assets for the progress bar
    // We have 5 promises + the number of images that mediaManager loads
    totalAssets = 5 + mediaManager.imageUrls.length;

    // --- Wait for EVERYTHING to load ---
    await Promise.all(promisesToLoad);

    console.log("All assets loaded!");
    
    // --- Now it's safe to set up the scene ---
    const initialBgEffectName = backgroundEffectNames[3];
    const bgModule = allEffects[initialBgEffectName];
    activeBackground = { name: initialBgEffectName, module: bgModule };
    activeBackground.module.setup(backgroundCanvas, null, mediaManager.images, globalSettings);
    
    const initialFgEffectName = foregroundEffectNames[2];
    const fgModule = allEffects[initialFgEffectName];
    activeForeground = { name: initialFgEffectName, module: fgModule };
    activeForeground.module.setup(foregroundCanvas, lyrics.length > 0 ? lyrics[0].text : " ", globalSettings);

    const initialPostEffectName = postEffectNames[0];
    const postModule = allEffects[initialPostEffectName];
    activePost = { name: initialPostEffectName, module: postModule };
    activePost.module.setup(mainCanvas);
    console.log(`Initial effects pre-loaded: ${activeBackground.name}, ${activeForeground.name}, ${activePost.name}`);

    // --- Show the start button ---
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

function switchEffects(bgName, fgName) {
    // Don't switch effects if the user is in the middle of a hold gesture
    if (isHolding) return;
    console.log("--- Switching effects ---");

    // --- Switch Background Effect ---
    // Use the provided name, or pick a random one if none is given
    const nextBgEffectName = bgName || backgroundEffectNames[Math.floor(Math.random() * backgroundEffectNames.length)];
    if (activeBackground?.name !== nextBgEffectName) {
        activeBackground?.module.cleanup();
        const bgModule = allEffects[nextBgEffectName];
        activeBackground = { name: nextBgEffectName, module: bgModule };
        activeBackground.module.setup(backgroundCanvas, null, mediaManager.images, globalSettings);
        console.log(`Switched background to: ${activeBackground.name}`);
    }

    // --- Switch Foreground (Text) Effect ---
    // Use the provided name, or pick a random one
    const nextFgEffectName = fgName || foregroundEffectNames[Math.floor(Math.random() * foregroundEffectNames.length)];
    if (activeForeground?.name !== nextFgEffectName) {
        activeForeground?.module.cleanup();
        const fgModule = allEffects[nextFgEffectName];
        activeForeground = { name: nextFgEffectName, module: fgModule };
        activeForeground.module.setup(foregroundCanvas, currentLyric, globalSettings);
        console.log(`Switched foreground to: ${activeForeground.name}`);
    }
}

function switchPostEffect() {
    const currentPostEffectName = activePost?.name || '';
    let nextPostEffectName;

    // Ensure the new effect is different from the current one
    do {
        nextPostEffectName = postEffectNames[Math.floor(Math.random() * postEffectNames.length)];
    } while (postEffectNames.length > 1 && nextPostEffectName === currentPostEffectName);

    // Switch to the new effect
    activePost?.module.cleanup();
    const postModule = allEffects[nextPostEffectName];
    activePost = { name: nextPostEffectName, module: postModule };
    activePost.module.setup(mainCanvas);
    console.log(`Switched post-effect to: ${activePost.name}`);
}

init().catch(err => console.error("Initialization failed:", err));