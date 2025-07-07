import { imageCollage, cleanTiledText, spiralVortex, simpleTunnel, shapeForm, passThrough, postLiquidDisplace, pixelate, rgbSplit } from './effects.js';

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
    rgbSplit,
};

// --- RANDOMIZER SETUP ---
const foregroundEffectNames = ['cleanTiledText', 'spiralVortex', 'simpleTunnel', 'shapeForm'];
const postEffectNames = ['passThrough', 'postLiquidDisplace','rgbSplit'];
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
    if (now - lastSwitchTime > switchInterval || !activeForeground) {
        
        // Switch Foreground (Text) Effect
        const currentFgEffectName = activeForeground ? activeForeground.name : '';
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
        
        lastSwitchTime = now;
    }

    // Update lyrics
    const activeLyric = lyrics.find(l => elapsedSeconds >= (l.startTime / 1000) && elapsedSeconds <= (l.endTime / 1000));
    const newText = activeLyric ? activeLyric.text : " ";
    if (newText !== currentLyric) {
        currentLyric = newText;
        activeForeground?.module.onLyricChange?.(currentLyric);
    }

    // --- RENDER PIPELINE ---
    // 1. Update both effects on their own canvases
    backgroundEffect.update(mouse, now);
    activeForeground?.module.update(mouse, now, currentLyric);
    
    // --- CORRECT COMPOSITING: IMAGES OVER TEXT ---
    // 2. Clear the composite canvas and draw the text layer first.
    compositeCtx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
    compositeCtx.drawImage(foregroundCanvas, 0, 0); 
    
    // 3. Use the 'screen' blend mode to draw the image layer on top.
    compositeCtx.globalCompositeOperation = 'screen';
    compositeCtx.drawImage(backgroundCanvas, 0, 0);
    
    // 4. Reset blend mode for future operations
    compositeCtx.globalCompositeOperation = 'source-over';

    // 5. Run the post-processing effect on the final combined image
    activePost?.module.update(compositeCanvas, mouse, now);
    
    requestAnimationFrame(animate);
}

async function init() {
    mainCanvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
    try {
        // --- FONT LOADING ---
        // Create a new font face object
        const customFont = new FontFace('Blackout', 'url("assets/Blackout Midnight.ttf")');
        // Wait for the font to be loaded and ready
        await customFont.load();
        // Add it to the document's available fonts
        document.fonts.add(customFont);
        console.log('Custom font "Blackout Midnight" loaded!');

        const response = await fetch('assets/lyrics.srt');
        lyrics = parseSRT(await response.text());
        startTime = performance.now();
        lastSwitchTime = startTime;
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