// Helper to compile shaders
function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

// Helper to link shader program
function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

// --- Effect Module: WebGL Liquid Displacement (HIGH PERFORMANCE) ---
export const webglLiquidDisplace = {
    gl: null,
    program: null,
    locations: {},
    textCanvas: null,
    textCtx: null,
    currentLyric: "",

    // Shaders
    vertexShaderSource: `
        attribute vec4 a_position;
        void main() {
            gl_Position = a_position;
        }
    `,
    fragmentShaderSource: `
        precision mediump float;
        uniform vec2 u_resolution;
        uniform vec2 u_mouse;
        uniform float u_time;
        uniform sampler2D u_texture;

        // GLSL 2D Simplex Noise by Ashima Arts
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
        float snoise(vec2 v) {
            const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
            vec2 i  = floor(v + dot(v, C.yy) );
            vec2 x0 = v -   i + dot(i, C.xx);
            vec2 i1;
            i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;
            i = mod289(i);
            vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
            vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
            m = m*m;
            m = m*m;
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 ox = floor(x + 0.5);
            vec3 a0 = x - ox;
            m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
            vec3 g;
            g.x  = a0.x  * x0.x  + h.x  * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution.xy;
            
            float distortionAmount = 0.1;
            float noiseScale = 4.0;

            float offsetX = snoise(uv * noiseScale + u_time * 0.1);
            float offsetY = snoise(uv * noiseScale + u_time * 0.11 + 10.0);

            vec2 displacement = vec2(offsetX, offsetY) * distortionAmount;

            // --- THE FIX IS HERE ---
            // We flip the y-coordinate of the texture lookup (1.0 - uv.y)
            // to correct the vertical flip from the canvas texture.
            vec2 textureCoords = vec2(uv.x, 1.0 - uv.y) + displacement;
            vec4 color = texture2D(u_texture, textureCoords);
            
            gl_FragColor = color;
        }
    `,

    setup(canvas, text, options = {}) {
        this.gl = canvas.getContext('webgl', { preserveDrawingBuffer: true });
        const gl = this.gl;

        this.textCanvas = document.createElement('canvas');
        this.textCanvas.width = canvas.width;
        this.textCanvas.height = canvas.height;
        this.textCtx = this.textCanvas.getContext('2d');

        const vertexShader = createShader(gl, gl.VERTEX_SHADER, this.vertexShaderSource);
        const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, this.fragmentShaderSource);
        this.program = createProgram(gl, vertexShader, fragmentShader);

        this.locations = {
            position: gl.getAttribLocation(this.program, 'a_position'),
            resolution: gl.getUniformLocation(this.program, 'u_resolution'),
            mouse: gl.getUniformLocation(this.program, 'u_mouse'),
            time: gl.getUniformLocation(this.program, 'u_time'),
            texture: gl.getUniformLocation(this.program, 'u_texture'),
        };

        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        this.renderTextToCanvas(text);
        this.currentLyric = text;
    },

    renderTextToCanvas(text) {
        const ctx = this.textCtx;
        const w = ctx.canvas.width;
        const h = ctx.canvas.height;
        const textToRender = (text && text.trim() !== "") ? text : "WEBGL";
        const uppercaseText = (textToRender.toUpperCase() + " ").repeat(20);

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, w, h);
        const fontSize = 120;
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = 'white';
        ctx.textAlign = 'left';
        const lineHeight = fontSize * 0.85;
        const numLines = Math.ceil(h / lineHeight) + 1;
        for (let i = 0; i < numLines; i++) {
            ctx.fillText(uppercaseText, -200, i * lineHeight);
        }
    },

    update(mouse, time, lyric) {
        if (!this.gl) return;
        const gl = this.gl;

        if (this.currentLyric !== lyric) {
            this.renderTextToCanvas(lyric);
            this.currentLyric = lyric;
        }

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.textCanvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        gl.useProgram(this.program);
        gl.enableVertexAttribArray(this.locations.position);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.getParameter(gl.ARRAY_BUFFER_BINDING));
        gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0);

        gl.uniform2f(this.locations.resolution, gl.canvas.width, gl.canvas.height);
        gl.uniform2f(this.locations.mouse, mouse.x, mouse.y);
        gl.uniform1f(this.locations.time, time / 1000);
        gl.uniform1i(this.locations.texture, 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.deleteTexture(texture);
    },

    cleanup() {
        if (this.gl) {
            if (this.program) {
                this.gl.deleteProgram(this.program);
            }
            this.program = null;
            this.gl = null;
        }
    }
};


// --- Other effects updated to get their own context ---
export const simpleTunnel = {
    // ... (no changes to the logic inside, but setup/update signature changes)
    ctx: null,
    rows: [],
    baseFontSize: 80,
    setup(canvas, text, options = {}) {
        this.ctx = canvas.getContext('2d');
        // The rest of the original setup logic
        this.rows = [];
        const textToRender = (text && text.trim() !== "") ? text : "          ";
        const uppercaseText = (textToRender + " ").repeat(15);
        const numRows = 30;
        const rowHeight = window.innerHeight / numRows;
        for (let i = 0; i < numRows + 1; i++) {
            this.rows.push({ text: uppercaseText, y: i * rowHeight, direction: (i % 2 === 0) ? 1 : -1 });
        }
    },
    update(mouse, time, lyric) {
        // Original update logic, using this.ctx
        const ctx = this.ctx;
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        if (lyric && this.rows[0] && !this.rows[0].text.includes(lyric)) {
             const uppercaseText = (lyric + " ").repeat(15);
             this.rows.forEach(row => row.text = uppercaseText);
        }
        const timeOffset = time * 0.03;
        this.rows.forEach(row => {
            const distanceToMouseY = row.y - mouse.y;
            const maxDistY = window.innerHeight / 2;
            const projectionScale = Math.min(1, Math.abs(distanceToMouseY) / maxDistY);
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
    cleanup() { this.rows = []; this.ctx = null; }
};

// --- Effect Module: Spiral Vortex (2D Canvas) ---
export const spiralVortex = {
    ctx: null,
    rings: [],
    fov: 400,
    ringRadius: 700,
    currentLyric: "",

    setup(canvas, text, options = {}) {
        this.ctx = canvas.getContext('2d');
        this.rings = [];
        this.currentLyric = text;
        const numRings = 10;
        for (let i = 0; i < numRings; i++) {
          const ringCanvas = this.createRingCanvas(text, i);
          this.rings.push({
            canvas: ringCanvas,
            z: (i / numRings) * 1000,
            originalZ: (i / numRings) * 1000,
            ringIndex: i,
            rotation: 0
          });
        }
    },

    update(mouse, time, lyric) {
        if (!this.ctx) return;
        const ctx = this.ctx;

        if (this.currentLyric !== lyric) {
            this.currentLyric = lyric;
            this.rings.forEach(ring => {
                const newRingCanvas = this.createRingCanvas(lyric, ring.ringIndex);
                ring.canvas = newRingCanvas;
            });
        }

        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        const waveSpeed = time * 0.002;
        const moveSpeed = 0.1;
        const mouseXNormalized = (mouse.x - window.innerWidth / 2) / (window.innerWidth / 2);
        const baseRotationSpeed = mouseXNormalized * 0.01;

        this.rings.forEach((ring) => {
            const wavePhase = waveSpeed + ring.ringIndex * 0.5;
            const waveOffset = Math.sin(wavePhase) * 100;
            const baseMovement = time * moveSpeed;
            const totalZ = ring.originalZ + baseMovement + waveOffset;
            ring.z = ((totalZ % 1000) + 1000) % 1000;
            const rotationDirection = ring.ringIndex % 2 === 0 ? 1 : -1;
            ring.rotation += baseRotationSpeed * rotationDirection;
        });

        this.rings.sort((a, b) => b.z - a.z);

        this.rings.forEach((ring) => {
            const scale = this.fov / (this.fov + ring.z);
            const size = this.ringRadius * 2 * scale;
            if (scale < 0.05) return;
            const tiltX = (mouse.x - window.innerWidth / 2) * 0.5;
            const tiltY = (mouse.y - window.innerHeight / 2) * 0.5;
            const x = (window.innerWidth / 2 - size / 2) + tiltX * scale;
            const y = (window.innerHeight / 2 - size / 2) + tiltY * scale;
            const alpha = Math.min(scale * 1.2, 0.9);
            ctx.globalAlpha = alpha;
            ctx.save();
            ctx.translate(x + size / 2, y + size / 2);
            ctx.rotate(ring.rotation);
            ctx.scale(scale, scale);
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
        const ringRotation = ringIndex * 0.1;
        ctx.rotate(ringRotation);
        const words = (text || "SPIRAL").toUpperCase().split(' ').filter(word => word.length > 0);
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
        this.ctx = null;
    }
};


// ... (liquidDisplace, spiralVortex, etc. would need similar modifications to get their own context)
export const shapeForm = { /* Needs updating */ setup(){}, update(){}, cleanup(){} };
export const perspectiveTunnel = { /* Needs updating */ setup(){}, update(){}, cleanup(){} };
export const imageCollage = { /* Needs updating */ setup(){}, update(){}, cleanup(){} };