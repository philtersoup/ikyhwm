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
    pixelate, // Add this
    rgbSplit,
};

const foregroundEffectNames = ['cleanTiledText', 'spiralVortex', 'simpleTunnel', 'shapeForm'];
const postEffectNames = ['passThrough', 'postLiquidDisplace', 'rgbSplit'];
const switchInterval = 3692;
let lastSwitchTime = 0;

const mainCanvas = document.getElementById('collage-canvas');
const backgroundCanvas = document.createElement('canvas');
const foregroundCanvas = document.createElement('canvas');
const compositeCanvas = document.createElement('canvas');
const compositeCtx = compositeCanvas.getContext('2d');

let lyrics = [], startTime = 0, currentLyric = "";
let activeForeground = null, activePost = null;
const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let audioContext, audioBuffer;

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

    if (now - lastSwitchTime > switchInterval) {
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

        const nextPostEffectName = postEffectNames[Math.floor(Math.random() * postEffectNames.length)];
        activePost?.module.cleanup();
        const postModule = allEffects[nextPostEffectName];
        activePost = { name: nextPostEffectName, module: postModule };
        activePost.module.setup(mainCanvas);
        console.log(`Switched post-effect to: ${activePost.name}`);
        
        lastSwitchTime = now;
    }

    const activeLyric = lyrics.find(l => elapsedSeconds >= (l.startTime / 1000) && elapsedSeconds <= (l.endTime / 1000));
    const newText = activeLyric ? activeLyric.text : " ";
    if (newText !== currentLyric) {
        currentLyric = newText;
        activeForeground?.module.onLyricChange?.(currentLyric);
    }

    backgroundEffect.update(mouse, now);
    activeForeground?.module.update(mouse, now, currentLyric);
    
    compositeCtx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
    compositeCtx.drawImage(foregroundCanvas, 0, 0); 
    compositeCtx.globalCompositeOperation = 'screen';
    compositeCtx.drawImage(backgroundCanvas, 0, 0);
    compositeCtx.globalCompositeOperation = 'source-over';

    activePost?.module.update(compositeCanvas, mouse, now);
    
    requestAnimationFrame(animate);
}

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
    mainCanvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });

    const assetsToLoad = [
        ...allEffects.imageCollage.imageUrls,
        'assets/Blackout Midnight.ttf',
        'assets/audio/IKYHWM.mp3'
    ];
    const totalAssets = assetsToLoad.length;
    let loadedAssets = 0;

    const updateProgress = () => {
        loadedAssets++;
        const percent = Math.floor((loadedAssets / totalAssets) * 100);
        progressBar.style.width = `${percent}%`;
        progressPercent.innerText = `${percent}%`;
    };

    // --- Loading Logic ---
    const fontPromise = new FontFace('Blackout', 'url("assets/Blackout Midnight.ttf")').load().then(font => {
        document.fonts.add(font);
        updateProgress();
    });

    const lyricsPromise = fetch('assets/lyrics.srt').then(res => res.text()).then(text => {
        lyrics = parseSRT(text);
        updateProgress();
    });

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioPromise = fetch('assets/audio/IKYHWM.mp3').then(res => res.arrayBuffer()).then(buffer => audioContext.decodeAudioData(buffer)).then(decoded => {
        audioBuffer = decoded;
        updateProgress();
    });

    // Pass progress updater to collage setup, which also loads all images
    await backgroundEffect.setup(backgroundCanvas, updateProgress); 

    // Wait for the remaining assets (font, lyrics, audio)
    await Promise.all([fontPromise, lyricsPromise, audioPromise]);

    console.log("All assets loaded!");
    
    // --- NEW: Pre-setup the first effects BEFORE showing the start button ---
    const initialFgEffectName = foregroundEffectNames[0];
    const initialPostEffectName = postEffectNames[0];

    // Set up the first foreground effect
    const fgModule = allEffects[initialFgEffectName];
    activeForeground = { name: initialFgEffectName, module: fgModule };
    activeForeground.module.setup(foregroundCanvas, lyrics.length > 0 ? lyrics[0].text : " ");

    // Set up the first post-processing effect
    const postModule = allEffects[initialPostEffectName];
    activePost = { name: initialPostEffectName, module: postModule };
    activePost.module.setup(mainCanvas);
    console.log(`Initial effects pre-loaded: ${activeForeground.name}, ${activePost.name}`);
    // --- End of new logic ---


    // Hide loading overlay and show the start button
    loadingOverlay.style.opacity = 0;
    setTimeout(() => {
        loadingOverlay.classList.add('hidden');
        audioPromptOverlay.classList.remove('hidden');
    }, 500);

    // The start button now only has to start the animation, not set it up
    startButton.addEventListener('click', () => {
        audioContext.resume();
        audioPromptOverlay.style.opacity = 0;
        setTimeout(() => {
            audioPromptOverlay.classList.add('hidden');
            
            playAudio();
            startTime = performance.now();
            lastSwitchTime = startTime; // Start the timer for the *next* switch
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