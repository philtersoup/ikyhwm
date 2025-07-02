import { spiralVortex, simpleTunnel, shapeForm, bigBoldText, passThrough, postLiquidDisplace } from './effects.js';

// All available effects are registered here
const allEffects = {
    // Base (2D) effects
    spiralVortex,
    simpleTunnel,
    shapeForm,
    bigBoldText, // Add it here

    // Post-processing (WebGL) effects
    passThrough,
    postLiquidDisplace,
};

// This timeline showcases different combinations of base and post effects
const timeline = [
    { startTime: 0,  endTime: 999, baseEffect: 'shapeForm', postEffect: 'passThrough' }
];
const getCurrentScene = time => timeline.find(scene => time >= scene.startTime && time < scene.endTime);

const mainCanvas = document.getElementById('collage-canvas');
mainCanvas.width = window.innerWidth;
mainCanvas.height = window.innerHeight;

const offscreenCanvas = document.createElement('canvas');
offscreenCanvas.width = window.innerWidth;
offscreenCanvas.height = window.innerHeight;

let lyrics = [], startTime = 0, currentLyric = "";
let activeBase = null, activePost = null;
const mouse = { x: mainCanvas.width / 2, y: mainCanvas.height / 2 };

function animate() {
    const elapsedSeconds = (performance.now() - startTime) / 1000;
    const scene = getCurrentScene(elapsedSeconds);

    if (scene && (!activeBase || scene.baseEffect !== activeBase.name)) {
        activeBase?.module.cleanup();
        const module = allEffects[scene.baseEffect];
        if (module) {
            activeBase = { name: scene.baseEffect, module: module };
            activeBase.module.setup(offscreenCanvas, currentLyric);
            console.log(`Switched base effect to: ${activeBase.name}`);
        } else {
            activeBase = null;
        }
    }

    if (scene && (!activePost || scene.postEffect !== activePost.name)) {
        activePost?.module.cleanup();
        const module = allEffects[scene.postEffect];
        if (module) {
            activePost = { name: scene.postEffect, module: module };
            activePost.module.setup(mainCanvas);
            console.log(`Switched post effect to: ${activePost.name}`);
        } else {
            activePost = null;
        }
    }

    const activeLyric = lyrics.find(l => elapsedSeconds >= (l.startTime / 1000) && elapsedSeconds <= (l.endTime / 1000));
    const newText = activeLyric ? activeLyric.text : " ";
    if (newText !== currentLyric) {
        currentLyric = newText;
        activeBase?.module.onLyricChange?.(currentLyric);
    }

    activeBase?.module.update(mouse, performance.now(), currentLyric);
    activePost?.module.update(offscreenCanvas, mouse, performance.now());
    
    requestAnimationFrame(animate);
}

async function init() {
    mainCanvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
    try {
        const response = await fetch('assets/lyrics.srt');
        lyrics = parseSRT(await response.text());
        startTime = performance.now();
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