// --- Effect Module 1: Simple Converging Tunnel (OVERLAP FIXED) ---
export const simpleTunnel = {
    rows: [],
    baseFontSize: 80,
    setup(text, options = {}) {
        this.rows = [];
        // Use a placeholder text on initial setup to prevent errors
        const textToRender = (text && text.trim() !== "") ? text : "          ";
        const uppercaseText = (textToRender + " ").repeat(15);
        const numRows = 30;
        const rowHeight = window.innerHeight / numRows;

        for (let i = 0; i < numRows + 1; i++) {
            this.rows.push({
                text: uppercaseText,
                y: i * rowHeight,
                direction: (i % 2 === 0) ? 1 : -1
            });
        }
    },
    update(ctx, mouse, time, lyric) {
        // Update the text in each row if the lyric has changed
        if (lyric && this.rows[0] && !this.rows[0].text.includes(lyric)) {
             const uppercaseText = (lyric + " ").repeat(15);
             this.rows.forEach(row => row.text = uppercaseText);
        }

        const timeOffset = time * 0.03;

        this.rows.forEach(row => {
            const distanceToMouseY = row.y - mouse.y;
            const maxDistY = window.innerHeight / 2;
            const projectionScale = Math.min(1, Math.abs(distanceToMouseY) / maxDistY);
            
            // --- THE FIX: Adjust the projection to prevent overlap ---
            // We push the rows apart more aggressively as they get closer to the center
            const projectedY = mouse.y + distanceToMouseY * (projectionScale + 0.4);

            const minScale = 0.05;
            const fontSize = Math.max(this.baseFontSize * minScale, this.baseFontSize * projectionScale);

            if (fontSize < 1) return;

            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.globalAlpha = projectionScale;

            const warpFactor = (mouse.x - window.innerWidth / 2) * (1 - projectionScale);
            const scrollOffset = (timeOffset * row.direction) % 200;
            const finalX = window.innerWidth / 2 + scrollOffset + warpFactor;

            ctx.fillText(row.text, finalX, projectedY);
        });
        ctx.globalAlpha = 1.0;
    },
    cleanup() {
        this.rows = [];
    }
};

export const spiralVortex = {
  rings: [],
  fov: 400,
  ringRadius: 700,
  
  setup(text, options = {}) {
    this.rings = [];
    const textToRender = text;
    const numRings = 10;
    
    for (let i = 0; i < numRings; i++) {
      // Pre-generate canvas once and store rotation separately
      const ringCanvas = this.createRingCanvas(textToRender, i);
      this.rings.push({
        canvas: ringCanvas,
        z: (i / numRings) * 1000,
        originalZ: (i / numRings) * 1000,
        ringIndex: i,
        rotation: 0 // Track rotation separately
      });
    }
  },
  
  update(ctx, mouse, time) {
    // Calculate wave parameters
    const waveSpeed = time * 0.002;
    const moveSpeed = 0.1;
    
    // Mouse-based rotation parameters - much simpler calculation
    const mouseXNormalized = (mouse.x - window.innerWidth / 2) / (window.innerWidth / 2);
    const baseRotationSpeed = mouseXNormalized * 0.01;
    
    this.rings.forEach((ring) => {
      // Calculate smooth wave offset for this ring
      const wavePhase = waveSpeed + ring.ringIndex * 0.5;
      const waveOffset = Math.sin(wavePhase) * 100;
      
      // Calculate the base movement (continuous, no modulo yet)
      const baseMovement = time * moveSpeed;
      
      // Combine original position, movement, and wave
      const totalZ = ring.originalZ + baseMovement + waveOffset;
      
      // Apply smooth wrapping - this prevents the jitter
      ring.z = ((totalZ % 1000) + 1000) % 1000;
      
      // Update rotation - alternate rings spin in opposite directions
      const rotationDirection = ring.ringIndex % 2 === 0 ? 1 : -1;
      ring.rotation += baseRotationSpeed * rotationDirection;
    });
    
    // Sort rings to draw the furthest ones first
    this.rings.sort((a, b) => b.z - a.z);
    
    this.rings.forEach((ring) => {
      const scale = this.fov / (this.fov + ring.z);
      const size = this.ringRadius * 2 * scale;
      
      // Skip tiny rings for performance
      if (scale < 0.05) return;
      
      // 3D Tilt Logic
      const tiltX = (mouse.x - window.innerWidth / 2) * 0.5;
      const tiltY = (mouse.y - window.innerHeight / 2) * 0.5;
      
      const x = (window.innerWidth / 2 - size / 2) + tiltX * scale;
      const y = (window.innerHeight / 2 - size / 2) + tiltY * scale;
      
      const alpha = Math.min(scale * 1.2, 0.9);
      ctx.globalAlpha = alpha;
      
      // Apply rotation using canvas transform (much faster than regenerating)
      ctx.save();
      ctx.translate(x + size / 2, y + size / 2);
      ctx.rotate(ring.rotation);
      ctx.scale(scale, scale); // Apply scale in transform for better performance
      ctx.drawImage(ring.canvas, -this.ringRadius, -this.ringRadius);
      ctx.restore();
    });
    
    ctx.globalAlpha = 1.0;
  },
  
  createRingCanvas(text, ringIndex) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const size = this.ringRadius * 2;
    canvas.width = size;
    canvas.height = size;
    
    const baseFontSize = 60;
    const fontSize = baseFontSize + (ringIndex * 4);
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 3;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    
    ctx.translate(this.ringRadius, this.ringRadius);
    
    // Only apply base ring rotation once during creation
    const ringRotation = ringIndex * 0.1;
    ctx.rotate(ringRotation);
    
    const words = (text || " ").toUpperCase().split(' ').filter(word => word.length > 0);
    const totalWords = words.length;
    const testText = words.join(' ');
    const textMetrics = ctx.measureText(testText);
    const textWidth = textMetrics.width;
    
    const circumference = 2 * Math.PI * (this.ringRadius * 0.85);
    const minSpacing = textWidth * 1.5;
    const maxRepetitions = Math.floor(circumference / minSpacing);
    const actualRepetitions = Math.max(1, Math.min(maxRepetitions, 6));
    
    for (let i = 0; i < actualRepetitions; i++) {
      const angle = (i / actualRepetitions) * Math.PI * 2;
      ctx.save();
      ctx.rotate(angle);
      
      const textRadius = this.ringRadius * 0.85;
      let currentAngle = 0;
      const wordSpacing = textWidth / totalWords;
      
      words.forEach((word) => {
        ctx.save();
        ctx.rotate(currentAngle / textRadius);
        ctx.fillText(word, 0, -textRadius);
        ctx.restore();
        currentAngle += wordSpacing;
      });
      
      ctx.restore();
    }
    
    return canvas;
  },
  
  cleanup() {
    this.rings = [];
  }
};
// --- Effect Module 3: Inward Word Spiral (NEW) ---
// --- Effect Module 2: Liquid Displacement (Upgraded with Perlin Noise) ---
export const liquidDisplace = {
    textCanvas: null,
    textCtx: null,
    perlin: null,
    
    setup(text, options = {}) {
        this.textCanvas = document.createElement('canvas');
        this.textCanvas.width = window.innerWidth;
        this.textCanvas.height = window.innerHeight;
        this.textCtx = this.textCanvas.getContext('2d');
        
        this.perlin = new PerlinNoise();
        this.renderTextToCanvas(text);
    },
    
    renderTextToCanvas(text) {
        const ctx = this.textCtx;
        const textToRender = (text && text.trim() !== "") ? text : "LIQUIFY";
        const uppercaseText = (textToRender.toUpperCase() + " ").repeat(20);
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        const fontSize = 120;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        for (let i = -1; i < 20; i++) {
            ctx.fillText(uppercaseText, -200, i * (fontSize * 0.85));
        }
    },

    update(ctx, mouse, time, lyric) {
        if (!this.textCanvas) return;
        
        if (this.currentLyric !== lyric) {
            this.renderTextToCanvas(lyric);
            this.currentLyric = lyric;
        }

        const w = window.innerWidth;
        const h = window.innerHeight;
        
        // Get the pixel data from our pre-rendered text canvas
        const sourceData = this.textCtx.getImageData(0, 0, w, h).data;
        
        // Create a new image data object to hold our distorted result
        const destImageData = ctx.createImageData(w, h);
        const destData = destImageData.data;

        const distortionAmount = 80;
        const timeX = time * 0.0001;
        const timeY = time * 0.00015;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                // Use two Perlin noise lookups to get an X and Y displacement
                const offsetX = this.perlin.noise(x / 400, y / 400, timeX) - 0.5;
                const offsetY = this.perlin.noise(x / 400, y / 400, timeY + 10) - 0.5;

                // Calculate the source pixel to sample from
                const sourceX = Math.floor(x + offsetX * distortionAmount);
                const sourceY = Math.floor(y + offsetY * distortionAmount);

                const destIndex = (y * w + x) * 4;

                // Check if the source pixel is within bounds
                if (sourceX >= 0 && sourceX < w && sourceY >= 0 && sourceY < h) {
                    const sourceIndex = (sourceY * w + sourceX) * 4;
                    // Copy the pixel from the source to the destination
                    destData[destIndex]     = sourceData[sourceIndex];
                    destData[destIndex + 1] = sourceData[sourceIndex + 1];
                    destData[destIndex + 2] = sourceData[sourceIndex + 2];
                    destData[destIndex + 3] = 255; // Full alpha
                }
            }
        }
        
        // Draw the newly created distorted image to the main canvas
        ctx.putImageData(destImageData, 0, 0);
    },

    cleanup() {
        this.textCanvas = null;
        this.textCtx = null;
    }
};

// --- Perlin Noise Class (Self-Contained) ---
class PerlinNoise {
    constructor() {
        // Standard implementation of Perlin Noise algorithm
        this.p = new Uint8Array(512);
        for (let i = 0; i < 256; i++) this.p[i] = i;
        this.shuffle(this.p, 256);
        for (let i = 0; i < 256; i++) this.p[i + 256] = this.p[i];
    }
    shuffle(arr, n) {
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }
    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(a, b, t) { return a + t * (b - a); }
    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    noise(x, y, z) {
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
        x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
        const u = this.fade(x), v = this.fade(y), w = this.fade(z);
        const A = this.p[X] + Y, AA = this.p[A] + Z, AB = this.p[A + 1] + Z;
        const B = this.p[X + 1] + Y, BA = this.p[B] + Z, BB = this.p[B + 1] + Z;
        return (this.lerp(this.lerp(this.lerp(this.grad(this.p[AA], x, y, z), this.grad(this.p[BA], x - 1, y, z), u), this.lerp(this.grad(this.p[AB], x, y - 1, z), this.grad(this.p[BB], x - 1, y - 1, z), u), v), this.lerp(this.lerp(this.grad(this.p[AA + 1], x, y, z - 1), this.grad(this.p[BA + 1], x - 1, y, z - 1), u), this.lerp(this.grad(this.p[AB + 1], x, y - 1, z - 1), this.grad(this.p[BB + 1], x - 1, y - 1, z - 1), u), v), w) + 1) / 2;
    }
}

// --- Effect Module 3: Shape Forming (Refined for Readability) ---
export const shapeForm = {
    shapeVertices: [],
    setup(text, options = {}) {
        const w = window.innerWidth, h = window.innerHeight;
        const padX = 0.2, padY = 0.1;
        this.shapeVertices = [
            { x: w * padX, y: h * padY }, { x: w * (1 - padX), y: h * padY },
            { x: w * (1 - padX), y: h * padY }, { x: w * padX, y: h * (1 - padY) },
            { x: w * padX, y: h * (1 - padY) }, { x: w * (1 - padX), y: h * (1 - padY) },
            { x: w * (1 - padX), y: h * (1 - padY) }, { x: w * padX, y: h * padY },
        ];
    },
    update(ctx, mouse, time, lyric) {
        if (!lyric || lyric.trim() === "") return;
        const uppercaseText = lyric.toUpperCase() + " ";
        ctx.fillStyle = 'white';
        ctx.font = 'bold 30px sans-serif';
        const textWidth = ctx.measureText(uppercaseText).width;

        for (let i = 0; i < this.shapeVertices.length; i += 2) {
            const start = this.shapeVertices[i];
            const end = this.shapeVertices[i + 1];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const angle = Math.atan2(dy, dx);
            const lineLength = Math.sqrt(dx*dx + dy*dy);
            
            ctx.save();
            ctx.translate(start.x, start.y);
            ctx.rotate(angle);
            
            const timeOffset = (time * 0.05) % textWidth;
            for (let x = -timeOffset; x < lineLength; x += textWidth) {
                ctx.fillText(uppercaseText, x, 0);
            }
            
            ctx.restore();
        }
    },
    cleanup() {}
};
// --- Other effects remain available for future use ---
export const perspectiveTunnel = { setup(){}, update(ctx){}, cleanup(){} };
export const imageCollage = { setup(){}, update(ctx){}, cleanup(){} };