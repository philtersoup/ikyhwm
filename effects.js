// --- GLSL Shader Helpers ---
function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader); return null;
    }
    return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error: ' + gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

const defaultVertexShader = `
    attribute vec4 a_position;
    void main() { gl_Position = a_position; }
`;

// =================================================================
// POST-PROCESSING (WebGL) EFFECTS
// =================================================================

const postEffectPrototype = {
    setup(canvas) {
        this.gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
        const gl = this.gl;
        const vertexShader = createShader(gl, gl.VERTEX_SHADER, defaultVertexShader);
        const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, this.fragmentShaderSource);
        this.program = createProgram(gl, vertexShader, fragmentShader);
        this.locations = {
            position: gl.getAttribLocation(this.program, 'a_position'),
            resolution: gl.getUniformLocation(this.program, 'u_resolution'),
            time: gl.getUniformLocation(this.program, 'u_time'),
            texture: gl.getUniformLocation(this.program, 'u_texture'),
            onsetPulse: gl.getUniformLocation(this.program, 'u_onsetPulse'),
        };
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    },
    update(sourceCanvas, mouse, time, onsetPulse = 0) {
        const gl = this.gl;
        if (!gl) return;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.useProgram(this.program);
        gl.enableVertexAttribArray(this.locations.position);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.getParameter(gl.ARRAY_BUFFER_BINDING));
        gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(this.locations.resolution, gl.canvas.width, gl.canvas.height);
        gl.uniform1f(this.locations.time, time / 1000);
        gl.uniform1i(this.locations.texture, 0);
        gl.uniform1f(this.locations.onsetPulse, onsetPulse);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.deleteTexture(texture);
    },
    cleanup() {
        if (this.gl) {
            if (this.program) this.gl.deleteProgram(this.program);
            this.program = null; this.gl = null;
        }
    }
};

export const passThrough = {
    ...postEffectPrototype,
    fragmentShaderSource: `
        precision mediump float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution.xy;
            gl_FragColor = texture2D(u_texture, vec2(uv.x, 1.0 - uv.y));
        }
    `,
};

export const postLiquidDisplace = {
    ...postEffectPrototype,
    fragmentShaderSource: `
        precision mediump float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_time;
        uniform float u_onsetPulse;

        // Condensed 3D Simplex Noise
        vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;} // FIX: Added this missing vec3 overload
        vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
        vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
        vec4 taylorInvSqrt(vec4 r){return 1.792842914-r*.8537347209;}
        float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}

        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution.xy;
            
            float aspectRatio = u_resolution.x / u_resolution.y;
            vec2 scaled_uv = uv;
            scaled_uv.x *= aspectRatio;

            float distortionAmount = 0.025 + u_onsetPulse * 0.05;
            float noiseScale = 4.0;
            float time = u_time * 0.1;
            
            vec3 noisePos = vec3(scaled_uv * noiseScale, time);
            float offsetX = snoise(noisePos);
            float offsetY = snoise(noisePos + vec3(10.5, -5.2, 1.1));
            
            vec2 displacement = vec2(offsetX, offsetY) * distortionAmount;
            
            vec2 textureCoords = vec2(uv.x, 1.0 - uv.y) + displacement; 
            
            gl_FragColor = texture2D(u_texture, textureCoords);
        }
    `,
};

export const pixelate = {
    ...postEffectPrototype,
    fragmentShaderSource: `
        precision mediump float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_onsetPulse;
        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution.xy;
            float pixelSize = 20.0 - u_onsetPulse * 18.0;
            vec2 pixeledUV = floor(uv * u_resolution / pixelSize) * pixelSize / u_resolution;
            gl_FragColor = texture2D(u_texture, vec2(pixeledUV.x, 1.0 - pixeledUV.y));
        }
    `,
};

export const rgbSplit = {
    ...postEffectPrototype,
    fragmentShaderSource: `
        precision mediump float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform float u_onsetPulse;
        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution.xy;
            float offset = 0.0005 + u_onsetPulse * 0.01;
            float r = texture2D(u_texture, vec2(uv.x + offset, 1.0 - uv.y)).r;
            float g = texture2D(u_texture, vec2(uv.x, 1.0 - uv.y)).g;
            float b = texture2D(u_texture, vec2(uv.x - offset, 1.0 - uv.y)).b;
            gl_FragColor = vec4(r, g, b, 1.0);
        }
    `,
};

// =================================================================
// BACKGROUND EFFECT
// =================================================================
export const imageCollage = {
    ctx: null,
    images: [],
    sliceCache: [],
    cacheSize: 25,
    lastDrawTime: 0,

    setup(canvas, initialText, sharedImages) {
        this.ctx = canvas.getContext('2d');
        this.sliceCache = [];
        this.images = sharedImages; // Receives pre-loaded images
    },
    onLyricChange() {},
    update(mouse, time, onsetPulse = 0) {
        if (!this.ctx || this.images.length === 0) return;
        const ctx = this.ctx;
        const canvas = ctx.canvas;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const drawInterval = (1 - onsetPulse) * 300;
        if (time - this.lastDrawTime < drawInterval) {
            return;
        }
        this.lastDrawTime = time;
        let slice;
        const shouldRepeat = this.sliceCache.length > 0 && Math.random() < 0.2;
        if (shouldRepeat) {
            slice = this.sliceCache[Math.floor(Math.random() * this.sliceCache.length)];
        } else {
            const img = this.images[Math.floor(Math.random() * this.images.length)];
            const sliceWidth = img.width * (Math.random() * 0.6 + 0.1);
            const sliceHeight = img.height * (Math.random() * 0.6 + 0.1);
            const sx = Math.random() * (img.width - sliceWidth);
            const sy = Math.random() * (img.height - sliceHeight);
            slice = { img, sx, sy, sliceWidth, sliceHeight };
            this.sliceCache.push(slice);
            if (this.sliceCache.length > this.cacheSize) {
                this.sliceCache.shift();
            }
        }
        const dx = Math.random() * canvas.width;
        const dy = Math.random() * canvas.height;
        const zoomLevel = Math.random() * 2 + 0.5;
        const dWidth = slice.sliceWidth * (zoomLevel + onsetPulse * 1.5);
        const dHeight = slice.sliceHeight * (zoomLevel + onsetPulse * 1.5);
        ctx.globalAlpha = Math.random() * 0.4 + 0.3;
        ctx.drawImage(slice.img, slice.sx, slice.sy, slice.sliceWidth, slice.sliceHeight, dx - dWidth / 2, dy - dHeight / 2, dWidth, dHeight);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2;
        ctx.strokeRect(dx - dWidth / 2, dy - dHeight / 2, dWidth, dHeight);
        ctx.globalAlpha = 1.0;
    },
    cleanup() { this.ctx = null; this.images = []; this.sliceCache = []; }
};


export const perspectiveTunnelCollage = {
    ctx: null,
    images: [],
    slices: [],
    numSlices: 200, // The number of images in the tunnel
    maxDepth: 1000, // How deep the tunnel is

    setup(canvas, initialText, sharedImages) {
        this.ctx = canvas.getContext('2d');
        this.images = sharedImages;
        this.slices = [];
        
        // Pre-populate the tunnel with slice objects
        for (let i = 0; i < this.numSlices; i++) {
            const img = this.images[Math.floor(Math.random() * this.images.length)];
            
            // Create a square crop for each slice
            const shorterSide = Math.min(img.width, img.height);
            const sliceDim = shorterSide * (Math.random() * 0.3 + 0.1);
            
            this.slices.push({
                img: img,
                sx: Math.random() * (img.width - sliceDim),
                sy: Math.random() * (img.height - sliceDim),
                sWidth: sliceDim,
                sHeight: sliceDim,
                // Give it a random position in 3D space
                x: (Math.random() - 0.5) * canvas.width * 2,
                y: (Math.random() - 0.5) * canvas.height * 2,
                z: Math.random() * this.maxDepth,
            });
        }
    },

    onLyricChange() {},
    // In effects.js, replace the update method for perspectiveTunnelCollage
    update(mouse, time, onsetPulse = 0) {
        if (!this.ctx || this.images.length === 0) return;

        const ctx = this.ctx;
        const canvas = ctx.canvas;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        this.slices.sort((a, b) => b.z - a.z);

        const speed = 2 + onsetPulse * 10;
        const fov = 300;
        const baseSliceSize = 250;
        
        const vanishingPointX = canvas.width / 2;
        const vanishingPointY = canvas.height / 2;

        // Calculate mouse influence for both axes
        const mouseInfluenceX = (mouse.x - vanishingPointX);
        const mouseInfluenceY = (mouse.y - vanishingPointY); // NEW: Y-axis influence

        this.slices.forEach(slice => {
            slice.z -= speed;

            if (slice.z < 1) {
                slice.z = this.maxDepth;
                slice.x = (Math.random() - 0.5) * canvas.width * 2;
                slice.y = (Math.random() - 0.5) * canvas.height * 2;
            }

            const scale = fov / (fov + slice.z);
            
            // Calculate warp offset for both axes
            const warpOffsetX = mouseInfluenceX * (1 - scale) * 0.75;
            const warpOffsetY = mouseInfluenceY * (1 - scale) * 0.75; // NEW: Y-axis warp
            
            const screenX = vanishingPointX + slice.x * scale + warpOffsetX;
            const screenY = vanishingPointY + slice.y * scale + warpOffsetY; // Apply Y-axis warp
            const size = baseSliceSize * scale;

            ctx.save();
            ctx.globalAlpha = scale * 0.9;
            ctx.drawImage(slice.img, slice.sx, slice.sy, slice.sWidth, slice.sHeight, 
                        screenX - size / 2, screenY - size / 2, size, size);
            ctx.restore();
        });
    },
    
    cleanup() {
        this.ctx = null;
        this.images = [];
        this.slices = [];
    }
};

export const fallingPolaroidsCollage = {
    ctx: null,
    images: [],
    polaroids: [],
    setup(canvas, initialText, sharedImages) {
        this.ctx = canvas.getContext('2d');
        this.polaroids = [];
        this.images = sharedImages;
        this.loaded = true;
    },
    onLyricChange() {},
    // In effects.js, replace the update method for fallingPolaroidsCollage
    update(mouse, time, onsetPulse = 0) {
        if (!this.ctx || !this.loaded || this.images.length === 0) return;

        const ctx = this.ctx;
        const canvas = ctx.canvas;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (onsetPulse > 0.1) {
            const img = this.images[Math.floor(Math.random() * this.images.length)];

            // --- NEW: Square Cropping Logic ---
            // 1. Find the shorter side of the source image to define the max crop size.
            const shorterSide = Math.min(img.width, img.height);

            // 2. Define the slice dimension as a percentage of the shorter side.
            const sliceDim = shorterSide * 0.4; // Crop a square that's 40% of the shorter side.
            const sWidth = sliceDim;
            const sHeight = sliceDim;

            // 3. Find a random valid top-left (sx, sy) coordinate for the square crop.
            const sx = Math.random() * (img.width - sWidth);
            const sy = Math.random() * (img.height - sHeight);

            const angle = Math.random() * Math.PI * 2;
            const speed = 4 + Math.random() * 4;

            this.polaroids.push({
                img, sx, sy, sWidth, sHeight,
                x: canvas.width / 2,
                y: canvas.height / 4,
                rotation: (Math.random() - 0.5) * 0.5,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                vr: (Math.random() - 0.5) * 0.02
            });
        }
        
        if (this.polaroids.length > 100) {
            this.polaroids.splice(0, this.polaroids.length - 100);
        }

        for (let i = this.polaroids.length - 1; i >= 0; i--) {
            const p = this.polaroids[i];
            
            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const forceRadius = 250;

            if (distance < forceRadius) {
                const force = 1 - (distance / forceRadius);
                const forceMultiplier = 1.0; 
                const forceX = (dx / distance) * force * forceMultiplier;
                const forceY = (dy / distance) * force * forceMultiplier;
                p.vx += forceX;
                p.vy += forceY;
            }
            
            p.vy += 0.1;
            p.vx *= 0.98;
            p.vy *= 0.98;
            
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.vr;
            
            if (p.y > canvas.height + 200) {
                this.polaroids.splice(i, 1);
                continue;
            }

            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.globalAlpha = 1.0;
            
        const shorterSide = Math.min(canvas.width, canvas.height);
        const polaroidFrameSize = shorterSide * 0.25; // Now 25% of the shortest screen side

        const aspectRatio = p.sWidth / p.sHeight;
        let dWidth, dHeight;
        if (aspectRatio > 1) {
            dWidth = polaroidFrameSize;
            dHeight = polaroidFrameSize / aspectRatio;
        } else {
            dHeight = polaroidFrameSize;
            dWidth = polaroidFrameSize * aspectRatio;
        }
        ctx.drawImage(p.img, p.sx, p.sy, p.sWidth, p.sHeight, -dWidth / 2, -dHeight / 2, dWidth, dHeight);
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 2;
        ctx.strokeRect(-polaroidFrameSize / 2, -polaroidFrameSize / 2, polaroidFrameSize, polaroidFrameSize);
        ctx.restore();
        }
    },
    
    cleanup() { this.ctx = null; this.images = []; this.polaroids = []; this.loaded = false; }
};

export const blackBackground = {
    ctx: null,
    setup(canvas) {
        this.ctx = canvas.getContext('2d');
    },
    onLyricChange() {},
    update() {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const canvas = ctx.canvas;
        // The only job of this effect is to clear the screen with black.
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    },
    cleanup() {
        this.ctx = null;
    }
};

export const holdStrobeEffect = {
    ctx: null,
    mode: 'strobe', // The current visual mode
    modes: ['strobe', 'wipe', 'ramp'], // Available modes

    setup(canvas) {
        this.ctx = canvas.getContext('2d');
        // Choose a random mode each time the effect is activated
        this.mode = this.modes[Math.floor(Math.random() * this.modes.length)];
        console.log(`Hold Strobe Mode: ${this.mode}`);
    },

    onLyricChange() {},

    update(mouse, time, onsetPulse = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const canvas = ctx.canvas;

    // The rendering logic is now specific to the mode
    switch (this.mode) {
        case 'strobe':
        case 'ramp':
            // For modes that use fading trails, draw the transparent background first
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            ctx.fillStyle = 'white';
            if (this.mode === 'strobe' && onsetPulse > 0.5) {
                ctx.globalAlpha = onsetPulse;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            } else if (this.mode === 'ramp') {
                ctx.globalAlpha = onsetPulse;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            break;
        
        case 'wipe':
            // For the wipe, start with a clean, solid black background
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Then draw a solid white wipe rectangle on top
            const wipeWidth = canvas.width * ((time * 0.003) % 1);
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, wipeWidth, canvas.height);
            break;
    }

    // Reset global alpha at the end to be safe
    ctx.globalAlpha = 1.0;
    },
    
    cleanup() {
        this.ctx = null;
    }
};

// =================================================================
// FOREGROUND (TEXT) EFFECTS
// =================================================================

export const cleanTiledText = {
    ctx: null,
    setup(canvas) { this.ctx = canvas.getContext('2d'); },
    onLyricChange() {},
    update(mouse, time, lyric, onsetPulse = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const canvas = ctx.canvas;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const textToRender = (lyric && lyric.trim() !== "") ? lyric.toUpperCase() : " ";
    
    const baseSize = Math.min(canvas.width, canvas.height);
    const baseFontSize = baseSize / 10;
    const fontSize = baseFontSize + (onsetPulse * (baseFontSize * 0.4));
    ctx.font = `${fontSize}px 'Blackout'`;
    
    const textMetrics = ctx.measureText(textToRender);
    const spacingX = textMetrics.width * 1.25;
    const spacingY = baseFontSize * 1.5;
    if (spacingX === 0) return;

    ctx.save();
    const skewX = (mouse.x - canvas.width / 2) * 0.001;
    const skewY = (mouse.y - canvas.height / 2) * 0.001;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.transform(1, skewY, skewX, 1, 0, 0);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Corrected tiling loop without the conflicting time offset
    for (let y = spacingY / 2; y < canvas.height + spacingY; y += spacingY) {
        for (let x = spacingX / 2; x < canvas.width + spacingX; x += spacingX) {
            ctx.fillText(textToRender, x, y);
        }
    }
    ctx.restore();
    },
    cleanup() { this.ctx = null; }
};

export const spiralVortex = {
    ctx: null, rings: [], fov: 400, ringRadius: 700, currentLyric: "",
    setup(canvas, text) { this.ctx = canvas.getContext('2d'); this.onLyricChange(text); },
    onLyricChange(lyric) {
        this.rings = [];
        this.currentLyric = lyric;
        for (let i = 0; i < 10; i++) {
            this.rings.push({
                canvas: this.createRingCanvas(lyric, i), z: (i / 10) * 1000,
                originalZ: (i / 10) * 1000, ringIndex: i, rotation: 0
            });
        }
    },
    update(mouse, time, lyric, onsetPulse = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    if(this.currentLyric !== lyric){
         this.onLyricChange(lyric);
    }

    const mouseXNorm = (mouse.x - window.innerWidth/2) / (window.innerWidth/2);
    const moveSpeed = 0.1 + onsetPulse * 0.005;

    // --- CHANGE: Drastically reduced the rotation speed multipliers ---
    const rotationSpeed = (mouseXNorm * 0.002);

    this.rings.forEach(r => {
        const waveOffset = Math.sin(time*0.002 + r.ringIndex*0.5) * 100;
        r.z = (((r.originalZ + time*moveSpeed + waveOffset) % 1000) + 1000) % 1000;
        r.rotation += rotationSpeed * (r.ringIndex % 2 === 0 ? 1 : -1);
    });
    
    this.rings.sort((a,b) => b.z - a.z).forEach(r => {
        const scale = this.fov / (this.fov + r.z); if (scale < 0.05) return;
        const size = this.ringRadius*2*scale;
        const x = (window.innerWidth/2 - size/2) + (mouse.x - window.innerWidth/2)*0.5*scale;
        const y = (window.innerHeight/2 - size/2) + (mouse.y - window.innerHeight/2)*0.5*scale;
        ctx.globalAlpha = Math.min(scale*1.2, 0.9);
        ctx.save();
        ctx.translate(x+size/2, y+size/2); ctx.rotate(r.rotation); ctx.scale(scale, scale);
        ctx.drawImage(r.canvas, -this.ringRadius, -this.ringRadius);
        ctx.restore();
    });
    ctx.globalAlpha = 1.0;
},
    createRingCanvas(text, ringIndex) {
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
        const size = this.ringRadius * 2; canvas.width = size; canvas.height = size;
        const fontSize = 60 + (ringIndex * 4);
        ctx.font = `${fontSize}px 'Blackout'`;
        Object.assign(ctx, {fillStyle:'white',textAlign:'center',textBaseline:'middle',shadowBlur:3,shadowColor:'rgba(0,0,0,0.5)'});
        ctx.translate(this.ringRadius, this.ringRadius); ctx.rotate(ringIndex * 0.1);
        const words = (text || "SPIRAL").toUpperCase().split(' ').filter(Boolean);
        if(!words.length) return canvas;
        const textWidth = ctx.measureText(words.join(' ')).width;
        const reps = Math.max(1, Math.min(Math.floor(2*Math.PI*(this.ringRadius*0.85)/(textWidth*1.5)), 6));
        for(let j = 0; j < reps; j++){
            ctx.save();
            ctx.rotate(j/reps * Math.PI * 2);
            let currentAngle = 0;
            words.forEach(word => {
                const wordWidth = ctx.measureText(word).width;
                ctx.save();
                ctx.rotate(currentAngle / (this.ringRadius*0.85));
                ctx.fillText(word, 0, -this.ringRadius*0.85);
                ctx.restore();
                currentAngle += wordWidth + ctx.measureText(" ").width;
            });
            ctx.restore();
        }
        return canvas;
    },
    cleanup() { this.rings = []; this.ctx = null; }
};

export const simpleTunnel = {
    ctx: null, rows: [], baseFontSize: 80, currentLyric: "",
    setup(canvas, text) { this.ctx = canvas.getContext('2d'); this.onLyricChange(text); },
    onLyricChange(lyric) {
        this.rows = [];
        this.currentLyric = lyric;
        const textToRender = (lyric && lyric.trim() !== "") ? lyric : " ";
        const uppercaseText = (textToRender.toUpperCase() + " ").repeat(15);
        const numRows = 30; const rowHeight = window.innerHeight / numRows;
        for (let i = 0; i < numRows + 1; i++) {
            this.rows.push({ text: uppercaseText, y: i * rowHeight, direction: (i % 2 === 0) ? 1 : -1 });
        }
    },
    update(mouse, time, lyric, onsetPulse = 0) {
        const ctx = this.ctx; if(!ctx) return;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        if (this.currentLyric !== lyric) {
            this.onLyricChange(lyric);
        }

        const timeOffset = time * 0.03;
        this.rows.forEach(row => {
            const distY = row.y - mouse.y;
            const projScale = Math.min(1, Math.abs(distY) / (window.innerHeight/2));
            const fontSize = Math.max(this.baseFontSize * 0.05, this.baseFontSize * projScale) + (onsetPulse * 30 * projScale);
            if (fontSize < 1) return;
            Object.assign(ctx, {font:`${fontSize}px 'Blackout'`,fillStyle:'white',textAlign:'center',globalAlpha:projScale});
            const warp = (mouse.x - window.innerWidth / 2) * (1 - projScale);
            const scroll = (timeOffset * row.direction) % 200;
            const finalX = window.innerWidth / 2 + scroll + warp;
            const finalY = mouse.y + distY * (projScale + 0.4);
            ctx.fillText(row.text, finalX, finalY);
        });
        ctx.globalAlpha = 1.0;
    },
    cleanup() { this.rows = []; this.ctx = null; }
};

export const hourglassTiling = {
    ctx: null,
    setup(canvas) { this.ctx = canvas.getContext('2d'); },
    onLyricChange() {},
    update(mouse, time, lyric, onsetPulse = 0) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const canvas = ctx.canvas;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const textToRender = (lyric && lyric.trim() !== "") ? lyric.toUpperCase() : " ";
        const fontSize = 30;
        const rowHeight = fontSize * 1.2;
        ctx.font = `${fontSize}px 'Blackout'`;
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';

        const textMetrics = ctx.measureText(textToRender + " ");
        const textWidth = textMetrics.width;

        if (textWidth === 0) return;

        for (let y = 0; y < canvas.height; y += rowHeight) {
            const distY = Math.abs(y - mouse.y);
            const widthFactor = Math.pow(distY / (canvas.height / 2), 0.8) + (onsetPulse * 0.3);
            const rowWidth = canvas.width * widthFactor;
            const startX = (canvas.width - rowWidth) / 2;
            const endX = startX + rowWidth;
            const timeOffset = (time * 0.05) % textWidth;

            for (let x = startX - timeOffset; x < endX; x += textWidth) {
                ctx.fillText(textToRender, x, y);
            }
        }
    },
    cleanup() { this.ctx = null; }
};

export const layeredWarpText = {
    ctx: null,
    setup(canvas) {
        this.ctx = canvas.getContext('2d');
    },
    onLyricChange() {},
    // In effects.js, replace the update method for layeredWarpText
    update(mouse, time, lyric, onsetPulse = 0) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const canvas = ctx.canvas;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const textToRender = (lyric && lyric.trim() !== "") ? lyric.toUpperCase() : " ";
        
        const baseSize = Math.min(canvas.width, canvas.height);
        const fontSize = baseSize / 7;
        ctx.font = `${fontSize}px 'Blackout'`;
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.textAlign = 'left'; 
        ctx.textBaseline = 'middle';

        const totalLayers = 40;
        const visibleLayers = 5 + Math.floor(2 * onsetPulse * (totalLayers - 5));
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const totalTextWidth = ctx.measureText(textToRender).width;

        for (let i = visibleLayers; i >= 0; i--) {
            ctx.save();
            
            const progress = i / totalLayers; // A value from 0 to 1 representing layer depth
            ctx.globalAlpha = (1 - progress) * 0.75;

            // --- NEW: Offset & Warp Calculation ---
            // 1. Create a strong, accelerating downward motion for the Y-axis.
            let yOffset = Math.pow(progress, 2) * 300;
            
            // 2. Create a more subtle sideways motion for the X-axis.
            let xOffset = progress * -80;
            
            // 3. Keep the mouse interaction.
            const mouseWarp = (mouse.x - centerX) * progress * 0.3;
            xOffset += mouseWarp;

            ctx.translate(centerX + xOffset, centerY + yOffset);

            let currentX = -totalTextWidth / 2;
            for (let j = 0; j < textToRender.length; j++) {
                const letter = textToRender[j];
                const letterWobble = Math.sin(time * 0.003 + j * 0.8) * 10;
                
                ctx.fillStyle = 'black';
                ctx.fillText(letter, currentX, letterWobble);
                ctx.strokeText(letter, currentX, letterWobble);
                currentX += ctx.measureText(letter).width;
            }

            ctx.restore();
        }
    },
    cleanup() { this.ctx = null; }
};