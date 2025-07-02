import { imageCollage, cleanTiledText, spiralVortex, simpleTunnel, shapeForm, passThrough, postLiquidDisplace } from './effects.js';

const allEffects = {
    // Background Effects
    imageCollage,

    // Foreground (Text) Effects
    cleanTiledText,
    spiralVortex,
    simpleTunnel,
    shapeForm,

    // Post-processing (WebGL) Effects
    passThrough,
    postLiquidDisplace,
};

// --- RANDOMIZER SETUP ---
// A list of all text effects to cycle through
const foregroundEffectNames = ['cleanTiledText', 'spiralVortex', 'simpleTunnel', 'shapeForm'];
// A fixed post-processing effect to use for all scenes
const postEffectName = 'passThrough';
// The time in milliseconds between each effect switch
const switchInterval = 4000; // 4 seconds
let lastSwitchTime = 0;


// --- SETUP CANVASES ---
const mainCanvas = document.getElementById('collage-canvas');
mainCanvas.width = window.innerWidth;
mainCanvas.height = window.innerHeight;

const backgroundCanvas = document.createElement('canvas');
backgroundCanvas.width = window.innerWidth;
backgroundCanvas.height = window.innerHeight;

const foregroundCanvas = document.createElement('canvas');
foregroundCanvas.width = window.innerWidth;
foregroundCanvas.height = window.innerHeight;

const compositeCanvas = document.createElement('canvas');
compositeCanvas.width = window.innerWidth;
compositeCanvas.height = window.innerHeight;
const compositeCtx = compositeCanvas.getContext('2d');

let lyrics = [], startTime = 0, currentLyric = "";
let activeForeground = null, activePost = null;
const mouse = { x: mainCanvas.width / 2, y: mainCanvas.height / 2 };

const backgroundEffect = allEffects.imageCollage;
backgroundEffect.setup(backgroundCanvas);

function animate() {
    const now = performance.now();
    const elapsedSeconds = (now - startTime) / 1000;

    // --- RANDOM EFFECT SWITCHING LOGIC ---
    if (now - lastSwitchTime > switchInterval) {
        // Time to switch to a new effect
        const currentEffectName = activeForeground ? activeForeground.name : '';
        let nextEffectName;
        do {
            nextEffectName = foregroundEffectNames[Math.floor(Math.random() * foregroundEffectNames.length)];
        } while (foregroundEffectNames.length > 1 && nextEffectName === currentEffectName); // Ensure it's a new effect

        // Clean up the old effect and set up the new one
        activeForeground?.module.cleanup();
        const module = allEffects[nextEffectName];
        activeForeground = { name: nextEffectName, module: module };
        activeForeground.module.setup(foregroundCanvas, currentLyric);
        console.log(`Switched foreground effect to: ${activeForeground.name}`);
        
        lastSwitchTime = now;
    }
    
    // Set up the post-processing effect on the first frame
    if (!activePost) {
        const module = allEffects[postEffectName];
        activePost = { name: postEffectName, module: module };
        activePost.module.setup(mainCanvas);
    }

    // Update lyrics
    const activeLyric = lyrics.find(l => elapsedSeconds >= (l.startTime / 1000) && elapsedSeconds <= (l.endTime / 1000));
    const newText = activeLyric ? activeLyric.text : " ";
    if (newText !== currentLyric) {
        currentLyric = newText;
        activeForeground?.module.onLyricChange?.(currentLyric);
    }

    // --- RENDER PIPELINE ---
    backgroundEffect.update(mouse, now);
    activeForeground?.module.update(mouse, now, currentLyric);
    compositeCtx.globalCompositeOperation = 'source-over';
    compositeCtx.drawImage(backgroundCanvas, 0, 0);
    compositeCtx.drawImage(foregroundCanvas, 0, 0);
    activePost?.module.update(compositeCanvas, mouse, now);
    
    requestAnimationFrame(animate);
}

async function init() {
    mainCanvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
    try {
        const response = await fetch('assets/lyrics.srt');
        lyrics = parseSRT(await response.text());
        startTime = performance.now();
        lastSwitchTime = startTime; // Initialize the switch timer
        animate();
    } catch (error) {
        console.error("Initialization failed:", error);
    }
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

init();