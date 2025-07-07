import { imageCollage, cleanTiledText, spiralVortex, simpleTunnel, hourglassTiling, passThrough, postLiquidDisplace, pixelate, rgbSplit } from './effects.js';

const allEffects = {
    // Background Effects
    imageCollage,

    // Foreground (Text) Effects
    cleanTiledText,
    spiralVortex,
    simpleTunnel,
    hourglassTiling, // Correctly named hourglass effect

    // Post-processing (WebGL) Effects
    passThrough,
    postLiquidDisplace,
    pixelate,
    rgbSplit,
};

// --- RANDOMIZER SETUP ---
const foregroundEffectNames = ['cleanTiledText', 'spiralVortex', 'simpleTunnel', 'hourglassTiling'];
const postEffectNames = ['passThrough', 'postLiquidDisplace', 'rgbSplit'];
const switchInterval = 4000;
let lastSwitchTime = 0;


// --- SETUP CANVASES ---
const mainCanvas = document.getElementById('collage-canvas');
const backgroundCanvas = document.createElement('canvas');
const foregroundCanvas = document.createElement('canvas');
const compositeCanvas = document.createElement('canvas');
const compositeCtx = compositeCanvas.getContext('2d');

let lyrics = [], startTime = 0, currentLyric = "";
let activeForeground = null, activePost = null;
const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let audioContext, audioBuffer;

// --- Beat tracking variables ---
let onsetData = { onsets: [] };
let nextOnsetIndex = 0;
let onsetPulse = 0; // Will spike to the 'strength' of an onset, then decay
let pulseTarget = 0; // This value jumps instantly on a beat

const backgroundEffect = allEffects.imageCollage;

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

    onsetPulse += (pulseTarget - onsetPulse) * 0.2;
    pulseTarget *= 0.9;

    if (nextOnsetIndex < onsetData.onsets.length) {
        const nextOnset = onsetData.onsets[nextOnsetIndex];
        if (elapsedSeconds >= nextOnset.time) {
            pulseTarget = nextOnset.strength; 
            nextOnsetIndex++;

            if (Math.random() < 0.15) {
                // Switch Foreground (Text) Effect
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
                
                // Switch Post-Processing Effect
                const nextPostEffectName = postEffectNames[Math.floor(Math.random() * postEffectNames.length)];
                activePost?.module.cleanup();
                const postModule = allEffects[nextPostEffectName];
                activePost = { name: nextPostEffectName, module: postModule };
                activePost.module.setup(mainCanvas);
                console.log(`Switched post-effect to: ${activePost.name}`);
            }
        }
    }

    // Update lyrics
    const activeLyric = lyrics.find(l => elapsedSeconds >= (l.startTime / 1000) && elapsedSeconds <= (l.endTime / 1000));
    const newText = activeLyric ? activeLyric.text : " ";
    if (newText !== currentLyric) {
        currentLyric = newText;
        activeForeground?.module.onLyricChange?.(currentLyric);
    }

    // --- RENDER PIPELINE (passing the single onsetPulse) ---
    backgroundEffect.update(mouse, now, onsetPulse);
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

async function init() {
    resizeCanvases();
    window.addEventListener('resize', resizeCanvases);
    function handlePointerMove(e) {
        // Prevent default mobile behaviors like scrolling
        e.preventDefault();
        
        // Check if it's a touch event or a mouse event
        const pointer = e.touches ? e.touches[0] : e;
        
        mouse.x = pointer.clientX;
        mouse.y = pointer.clientY;
    }

    // Add listeners for all pointer types
    mainCanvas.addEventListener('mousemove', handlePointerMove);
    mainCanvas.addEventListener('touchmove', handlePointerMove, { passive: false });
    mainCanvas.addEventListener('touchstart', handlePointerMove, { passive: false });

    const assetsToLoad = [
        ...allEffects.imageCollage.imageUrls,
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

    const lyricsPromise = fetch('assets/lyrics.srt').then(res => res.text()).then(text => {
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

    await allEffects.imageCollage.setup(backgroundCanvas, updateProgress);
    await Promise.all([fontPromise, lyricsPromise, audioPromise, onsetsPromise]);

    console.log("All assets loaded!");
    
    const initialFgEffectName = foregroundEffectNames[0];
    const initialPostEffectName = postEffectNames[0];

    const fgModule = allEffects[initialFgEffectName];
    activeForeground = { name: initialFgEffectName, module: fgModule };
    activeForeground.module.setup(foregroundCanvas, lyrics.length > 0 ? lyrics[0].text : " ");

    const postModule = allEffects[initialPostEffectName];
    activePost = { name: initialPostEffectName, module: postModule };
    activePost.module.setup(mainCanvas);
    console.log(`Initial effects pre-loaded: ${activeForeground.name}, ${activePost.name}`);

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
            lastSwitchTime = startTime;
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

init().catch(err => console.error("Initialization failed:", err));