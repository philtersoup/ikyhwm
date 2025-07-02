import { simpleTunnel, perspectiveTunnel, spiralVortex, shapeForm, webglLiquidDisplace, imageCollage } from './effects.js';

const allEffects = { simpleTunnel, perspectiveTunnel, spiralVortex, webglLiquidDisplace, shapeForm, imageCollage };
const timeline = [ { startTime: 0,  endTime: 999, effect: 'webglLiquidDisplace' } ]; // Changed to use the new WebGL effect
const getCurrentScene = time => timeline.find(scene => time >= scene.startTime && time < scene.endTime);

const canvas = document.getElementById('collage-canvas');
// We no longer get a context here; the effect module will handle it.
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let lyrics = [], startTime = 0, currentLyric = "", activeScene = null;
const mouse = { x: canvas.width / 2, y: canvas.height / 2 };

function animate() {
    const elapsedSeconds = (performance.now() - startTime) / 1000;
    const scene = getCurrentScene(elapsedSeconds);
    
    if (scene && (!activeScene || scene.effect !== activeScene.name)) {
        activeScene?.module.cleanup();
        const module = allEffects[scene.effect];
        if (module) {
            activeScene = { name: scene.effect, module: module };
            // Pass the canvas element to setup. The module will get its own context.
            activeScene.module.setup(canvas, currentLyric, scene.options);
            console.log(`Switched to effect: ${activeScene.name}`);
        }
    }

    const activeLyric = lyrics.find(l => elapsedSeconds >= (l.startTime / 1000) && elapsedSeconds <= (l.endTime / 1000));
    const newText = activeLyric ? activeLyric.text : " ";
    if (newText !== currentLyric) {
        currentLyric = newText;
        // The setup/update lyric logic is now handled within the effect module
    }

    // The update call no longer needs ctx, as the effect manages its own context.
    if (activeScene) {
        activeScene.module.update(mouse, performance.now(), currentLyric);
    }
    
    requestAnimationFrame(animate);
}

async function init() {
    canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
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