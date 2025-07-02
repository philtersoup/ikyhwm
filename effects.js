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
            float distortionAmount = 0.1;
            float noiseScale = 4.0;
            float offsetX = snoise(uv * noiseScale + u_time * 0.1);
            float offsetY = snoise(uv * noiseScale + u_time * 0.11 + 10.0);
            vec2 displacement = vec2(offsetX, offsetY) * distortionAmount;
            vec2 textureCoords = vec2(uv.x, 1.0 - uv.y) + displacement;
            gl_FragColor = texture2D(u_texture, textureCoords);
        }
    `,
};

// =================================================================
// BASE (2D Canvas) EFFECTS
// =================================================================

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
    update(mouse, time) {
        const ctx = this.ctx; if (!ctx) return;
        ctx.fillStyle = 'black'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
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
    createRingCanvas(text, i) {
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
        const size = this.ringRadius*2; canvas.width=size; canvas.height=size;
        ctx.font = `bold ${60+(i*4)}px Arial, sans-serif`;
        Object.assign(ctx, {fillStyle:'white',textAlign:'center',textBaseline:'middle',shadowBlur:3,shadowColor:'rgba(0,0,0,0.5)'});
        ctx.translate(this.ringRadius, this.ringRadius); ctx.rotate(i*0.1);
        const words = (text||"SPIRAL").toUpperCase().split(' ').filter(Boolean);
        if(!words.length) return canvas;
        const textWidth=ctx.measureText(words.join(' ')).width, reps=Math.max(1,Math.min(Math.floor(2*Math.PI*(this.ringRadius*0.85)/(textWidth*1.5)),6));
        for(let j=0; j<reps; j++){
            ctx.save(); ctx.rotate(j/reps * Math.PI*2);
            words.forEach(word => { ctx.fillText(word, 0, -this.ringRadius*0.85); ctx.rotate(ctx.measureText(word+" ").width / (this.ringRadius*0.85)); });
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
        const textToRender = (lyric && lyric.trim() !== "") ? lyric : "          ";
        const uppercaseText = (textToRender.toUpperCase() + " ").repeat(15);
        const numRows = 30; const rowHeight = window.innerHeight / numRows;
        for (let i = 0; i < numRows + 1; i++) {
            this.rows.push({ text: uppercaseText, y: i * rowHeight, direction: (i % 2 === 0) ? 1 : -1 });
        }
    },
    update(mouse, time) {
        const ctx = this.ctx; if(!ctx) return;
        ctx.fillStyle = 'black'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        const timeOffset = time * 0.03;
        this.rows.forEach(row => {
            const distY = row.y - mouse.y;
            const projScale = Math.min(1, Math.abs(distY) / (window.innerHeight/2));
            const fontSize = Math.max(this.baseFontSize * 0.05, this.baseFontSize * projScale);
            if (fontSize < 1) return;
            Object.assign(ctx, {font:`bold ${fontSize}px sans-serif`,fillStyle:'white',textAlign:'center',globalAlpha:projScale});
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
    ctx: null, shapeVertices: [],
    setup(canvas) {
        this.ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height, padX = 0.2, padY = 0.1;
        this.shapeVertices = [
            {x:w*padX,y:h*padY},{x:w*(1-padX),y:h*padY}, {x:w*(1-padX),y:h*padY},{x:w*padX,y:h*(1-padY)},
            {x:w*padX,y:h*(1-padY)},{x:w*(1-padX),y:h*(1-padY)}, {x:w*(1-padX),y:h*(1-padY)},{x:w*padX,y:h*padY},
        ];
    },
    update(mouse, time, lyric) {
        const ctx = this.ctx; if (!ctx || !lyric || lyric.trim() === "") return;
        ctx.fillStyle = 'black'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        const uppercaseText = lyric.toUpperCase() + " ";
        ctx.fillStyle = 'white'; ctx.font = 'bold 30px sans-serif';
        const textWidth = ctx.measureText(uppercaseText).width;
        if (textWidth === 0) return;
        for (let i = 0; i < this.shapeVertices.length; i += 2) {
            const start=this.shapeVertices[i], end=this.shapeVertices[i+1];
            const dx=end.x-start.x, dy=end.y-start.y;
            const angle=Math.atan2(dy,dx), len=Math.sqrt(dx*dx+dy*dy);
            ctx.save();
            ctx.translate(start.x, start.y); ctx.rotate(angle);
            const timeOffset = (time * 0.05) % textWidth;
            for (let x = -timeOffset; x < len; x += textWidth) {
                ctx.fillText(uppercaseText, x, 0);
            }
            ctx.restore();
        }
    },
    onLyricChange() {},
    cleanup() { this.ctx = null; }
}

export const bigBoldText = {
    ctx: null,

    setup(canvas) {
        this.ctx = canvas.getContext('2d');
    },

    onLyricChange() {},

    update(mouse, time, lyric) {
        if (!this.ctx) return;
        const ctx = this.ctx;
        const canvas = ctx.canvas;

        // Clear with a solid background for a clean look
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const textToRender = (lyric && lyric.trim() !== "") ? lyric.toUpperCase() : "CLEAN";
        
        // --- 1. Set Font and Measure for Proper Spacing ---
        const fontSize = 100;
        ctx.font = `bold ${fontSize}px sans-serif`;

        // Measure the text to calculate dynamic, non-overlapping spacing
        const textMetrics = ctx.measureText(textToRender);
        const spacingX = textMetrics.width * 1.25; // Add 25% horizontal padding
        const spacingY = fontSize * 1.5;           // Add 50% vertical padding

        if (spacingX === 0) return; // Avoid infinite loops if text is empty

        // --- 2. Apply Global Skew (Smear) Effect ---
        ctx.save();
        const skewX = (mouse.x - canvas.width / 2) * 0.001;
        const skewY = (mouse.y - canvas.height / 2) * 0.001;
        
        // Apply transform around the center for a cohesive feel
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.transform(1, skewY, skewX, 1, 0, 0);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);

        // --- 3. Draw The Perfect Tile Grid ---
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Loop using the calculated spacing to ensure no overlap
        for (let y = spacingY / 2; y < canvas.height; y += spacingY) {
            for (let x = spacingX / 2; x < canvas.width; x += spacingX) {
                ctx.fillText(textToRender, x, y);
            }
        }

        ctx.restore(); // Reset transformations
    },
    
    cleanup() {
        this.ctx = null;
    }
};