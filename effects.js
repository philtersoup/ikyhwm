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
        };
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    },
    update(sourceCanvas, mouse, time) {
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
        vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
        vec2 mod289(vec2 x){return x-floor(x*(1./289.))*289.;}
        vec3 permute(vec3 x){return mod289(((x*34.)+1.)*x);}
        float snoise(vec2 v){const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289(i);vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);m=m*m;m=m*m;vec3 x=2.*fract(p*C.www)-1.;vec3 h=abs(x)-.5;vec3 ox=floor(x+.5);vec3 a0=x-ox;m*=1.79284291400159-.85373472095314*(a0*a0+h*h);vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.*dot(m,g);}
        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution.xy;
            float distortionAmount = 0.025;
            float noiseScale = 4.0;
            float offsetX = snoise(uv * noiseScale + u_time * 0.1);
            float offsetY = snoise(uv * noiseScale + u_time * 0.11 + 10.0);
            vec2 displacement = vec2(offsetX, offsetY) * distortionAmount;
            vec2 textureCoords = vec2(uv.x, 1.0 - uv.y) + displacement;
            gl_FragColor = texture2D(u_texture, textureCoords);
        }
    `,
};

export const pixelate = {
    ...postEffectPrototype, // Reuses the same setup and update logic
    fragmentShaderSource: `
        precision mediump float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        
        // You can change this value to make the pixels bigger or smaller
        float pixelSize = 5.0;

        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution.xy;
            
            // Quantize the texture coordinates to create the pixelated effect
            vec2 pixeledUV = floor(uv * u_resolution / pixelSize) * pixelSize / u_resolution;
            
            gl_FragColor = texture2D(u_texture, vec2(pixeledUV.x, 1.0 - pixeledUV.y));
        }
    `,
};

export const rgbSplit = {
    ...postEffectPrototype, // Reuses the same setup and update logic
    fragmentShaderSource: `
        precision mediump float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;

        // You can change this value to increase or decrease the split amount
        float offset = 0.001;

        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution.xy;
            
            // Sample the texture three times at different offsets
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
    loaded: false,
    sliceCache: [],
    cacheSize: 20,
    lastDrawTime: 0,
    imageUrls: [
        'assets/images/DSCF6874.JPG', 'assets/images/DSCF7020.JPG',
        'assets/images/DSCF7027.JPG', 'assets/images/DSCF7032.JPG',
        'assets/images/DSCF7142.JPG', 'assets/images/DSCF7151.JPG',
        'assets/images/DSCF8081_1.jpg', 'assets/images/DSCF8125.JPG',
        'assets/images/DSCF8129.JPG', 'assets/images/DSCF8196.JPG',
        'assets/images/DSCF8207.JPG', 'assets/images/DSCF8256.JPG',
        'assets/images/DSCF8272.JPG',
    ],

    async setup(canvas) {
        this.ctx = canvas.getContext('2d');
        this.sliceCache = [];
        try {
            this.images = await Promise.all(this.imageUrls.map(url => this.loadImage(url)));
            this.loaded = true;
            console.log('All images loaded and resized in memory!');
        } catch (error) {
            console.error("Failed to load images for collage:", error);
        }
    },

    loadImage(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const maxDim = 1200;
                const scale = Math.min(maxDim / img.width, maxDim / img.height);
                const newWidth = img.width * scale;
                const newHeight = img.height * scale;

                const offscreenCanvas = document.createElement('canvas');
                offscreenCanvas.width = newWidth;
                offscreenCanvas.height = newHeight;
                const offscreenCtx = offscreenCanvas.getContext('2d');
                
                offscreenCtx.drawImage(img, 0, 0, newWidth, newHeight);
                resolve(offscreenCanvas);
            };
            img.onerror = () => reject(`Failed to load image at: ${url}`);
            img.src = url;
        });
    },

    onLyricChange() {},

    update(mouse, time) {
        if (!this.ctx || !this.loaded || this.images.length === 0) return;

        const ctx = this.ctx;
        const canvas = ctx.canvas;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const drawInterval = 230;
        if (time - this.lastDrawTime < drawInterval) {
            return;
        }
        this.lastDrawTime = time;

        let slice;
        const shouldRepeat = this.sliceCache.length > 0 && Math.random() < 0.4;

        if (shouldRepeat) {
            slice = this.sliceCache[Math.floor(Math.random() * this.sliceCache.length)];
        } else {
            const img = this.images[Math.floor(Math.random() * this.images.length)];
            
            // --- CROP MORE INTO THE IMAGE ---
            // The slice will now be between 10% and 30% of the image's dimensions,
            // creating a tighter, more zoomed-in crop.
            const sliceWidth = img.width * (Math.random() * 0.2 + 0.1);
            const sliceHeight = img.height * (Math.random() * 0.2 + 0.1);

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
        
        // Make the drawn size larger to emphasize the crop
        const dWidth = slice.sliceWidth * 1.5;
        const dHeight = slice.sliceHeight * 1.5;

        ctx.globalAlpha = Math.random() * 0.4 + 0.3;
        ctx.drawImage(slice.img, slice.sx, slice.sy, slice.sliceWidth, slice.sliceHeight, dx - dWidth / 2, dy - dHeight / 2, dWidth, dHeight);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 2;
        ctx.strokeRect(dx - dWidth / 2, dy - dHeight / 2, dWidth, dHeight);
        ctx.globalAlpha = 1.0;
    },
    
    cleanup() {
        this.ctx = null;
        this.images = [];
        this.sliceCache = [];
        this.loaded = false;
    }
};

// =================================================================
// FOREGROUND (TEXT) EFFECTS
// =================================================================

export const cleanTiledText = {
    ctx: null,
    setup(canvas) { this.ctx = canvas.getContext('2d'); },
    onLyricChange() {},
    update(mouse, time, lyric) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const canvas = ctx.canvas;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const textToRender = (lyric && lyric.trim() !== "") ? lyric.toUpperCase() : " ";
        const fontSize = 100;
        ctx.font = `${fontSize}px 'Blackout'`;
        const textMetrics = ctx.measureText(textToRender);
        const spacingX = textMetrics.width * 1.25;
        const spacingY = fontSize * 1.5;
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
        for (let y = spacingY / 2; y < canvas.height; y += spacingY) {
            for (let x = spacingX / 2; x < canvas.width; x += spacingX) {
                ctx.fillText(textToRender, x, y);
            }
        }
        ctx.restore();
    },
    cleanup() { this.ctx = null; }
};

export const spiralVortex = {
    ctx: null, rings: [], fov: 400, ringRadius: 700,
    setup(canvas, text) { this.ctx = canvas.getContext('2d'); this.onLyricChange(text); },
    onLyricChange(lyric) {
        this.rings = [];
        for (let i = 0; i < 10; i++) {
            this.rings.push({
                canvas: this.createRingCanvas(lyric, i), z: (i / 10) * 1000,
                originalZ: (i / 10) * 1000, ringIndex: i, rotation: 0
            });
        }
    },
    update(mouse, time, lyric) {
        const ctx = this.ctx; if (!ctx) return;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        if(this.currentLyric !== lyric){
             this.onLyricChange(lyric);
             this.currentLyric = lyric;
        }

        const mouseXNorm = (mouse.x - window.innerWidth/2) / (window.innerWidth/2);
        this.rings.forEach(r => {
            const waveOffset = Math.sin(time*0.002 + r.ringIndex*0.5) * 100;
            r.z = (((r.originalZ + time*0.1 + waveOffset) % 1000) + 1000) % 1000;
            r.rotation += mouseXNorm * 0.01 * (r.ringIndex % 2 === 0 ? 1 : -1);
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
    ctx: null, rows: [], baseFontSize: 80,
    setup(canvas, text) { this.ctx = canvas.getContext('2d'); this.onLyricChange(text); },
    onLyricChange(lyric) {
        this.rows = [];
        const textToRender = (lyric && lyric.trim() !== "") ? lyric : "";
        const uppercaseText = (textToRender.toUpperCase() + " ").repeat(15);
        const numRows = 30; const rowHeight = window.innerHeight / numRows;
        for (let i = 0; i < numRows + 1; i++) {
            this.rows.push({ text: uppercaseText, y: i * rowHeight, direction: (i % 2 === 0) ? 1 : -1 });
        }
    },
    update(mouse, time, lyric) {
        const ctx = this.ctx; if(!ctx) return;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        if (this.currentLyric !== lyric) {
            this.onLyricChange(lyric);
            this.currentLyric = lyric;
        }

        const timeOffset = time * 0.03;
        this.rows.forEach(row => {
            const distY = row.y - mouse.y;
            const projScale = Math.min(1, Math.abs(distY) / (window.innerHeight/2));
            const fontSize = Math.max(this.baseFontSize * 0.05, this.baseFontSize * projScale);
            if (fontSize < 1) return;
            Object.assign(ctx, {font:`bold ${fontSize}px 'Blackout'`,fillStyle:'white',textAlign:'center',globalAlpha:projScale});
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

export const shapeForm = {
    ctx: null,

    setup(canvas) {
        this.ctx = canvas.getContext('2d');
    },

    onLyricChange() {},

    update(mouse, time, lyric) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const canvas = ctx.canvas;

        // Clear with a transparent background
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

        // Create horizontal rows of text
        for (let y = 0; y < canvas.height; y += rowHeight) {
            
            // --- Hourglass Logic ---
            // Calculate distance from this row to the mouse's Y position
            const distY = Math.abs(y - mouse.y);
            // This factor is 1.0 at the top/bottom and 0.0 at the mouse's height
            const widthFactor = Math.pow(distY / (canvas.height / 2), 0.8);
            
            // Calculate the width and start position for this specific row
            const rowWidth = canvas.width * widthFactor;
            const startX = (canvas.width - rowWidth) / 2;
            const endX = startX + rowWidth;

            // Animate the horizontal scrolling
            const timeOffset = (time * 0.05) % textWidth;

            // Draw the tiled text for the calculated row width
            for (let x = startX - timeOffset; x < endX; x += textWidth) {
                ctx.fillText(textToRender, x, y);
            }
        }
    },
    
    cleanup() {
        this.ctx = null;
    }
};