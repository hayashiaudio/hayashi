import { useRef, useEffect } from 'react';

const VERT = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec3 u_color;

// Random function
float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

// Noise function
float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// Dithering patterns
float dither4x4(vec2 pos, float brightness) {
  int x = int(mod(pos.x, 4.0));
  int y = int(mod(pos.y, 4.0));
  int index = x + y * 4;
  float limit = 0.0;
  if (index == 0) limit = 0.0625;
  if (index == 1) limit = 0.5625;
  if (index == 2) limit = 0.1875;
  if (index == 3) limit = 0.6875;
  if (index == 4) limit = 0.8125;
  if (index == 5) limit = 0.3125;
  if (index == 6) limit = 0.9375;
  if (index == 7) limit = 0.4375;
  if (index == 8) limit = 0.25;
  if (index == 9) limit = 0.75;
  if (index == 10) limit = 0.125;
  if (index == 11) limit = 0.625;
  if (index == 12) limit = 1.0;
  if (index == 13) limit = 0.5;
  if (index == 14) limit = 0.875;
  if (index == 15) limit = 0.375;
  return brightness < limit ? 0.0 : 1.0;
}

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution.xy;
  st.x *= u_resolution.x / u_resolution.y;

  float t = u_time * 0.3;

  // Create flowing noise patterns
  float n1 = noise(st * 3.0 + t * 0.5);
  float n2 = noise(st * 5.0 - t * 0.3 + vec2(100.0));
  float n3 = noise(st * 8.0 + t * 0.2 + vec2(50.0, 200.0));

  // Combine noise layers
  float pattern = n1 * 0.5 + n2 * 0.3 + n3 * 0.2;

  // Add scanline effect
  float scanline = sin(st.y * u_resolution.y * 0.7 + t * 2.0) * 0.5 + 0.5;
  scanline = pow(scanline, 3.0) * 0.15;

  // Add horizontal drift
  float drift = sin(st.y * 10.0 + t) * 0.02;
  st.x += drift;

  // Vertical wave distortion
  float wave = sin(st.x * 4.0 + t * 1.5) * 0.03;
  st.y += wave;

  // Final intensity
  float intensity = pattern + scanline;

  // Apply dithering
  float dithered = dither4x4(gl_FragCoord.xy, intensity);

  // Mix between dark and accent color based on dithered value
  vec3 dark = vec3(0.04, 0.04, 0.04);
  vec3 color = mix(dark, u_color, dithered * 0.85);

  // Add subtle vignette
  vec2 center = st - vec2(0.5 * u_resolution.x / u_resolution.y, 0.5);
  float vignette = 1.0 - dot(center, center) * 0.8;
  vignette = clamp(vignette, 0.3, 1.0);
  color *= vignette;

  gl_FragColor = vec4(color, 1.0);
}
`;

interface HeroDitheringProps {
  className?: string;
}

export function HeroDithering({ className }: HeroDitheringProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl) return;

    // Compile shaders
    function compileShader(src: string, type: number) {
      const shader = gl!.createShader(type)!;
      gl!.shaderSource(shader, src);
      gl!.compileShader(shader);
      return shader;
    }

    const vs = compileShader(VERT, gl.VERTEX_SHADER);
    const fs = compileShader(FRAG, gl.FRAGMENT_SHADER);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Full-screen quad
    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const colorLoc = gl.getUniformLocation(program, 'u_color');

    // Accent color #ff8c61 as vec3
    gl.uniform3f(colorLoc, 0xFF / 255, 0x8C / 255, 0x61 / 255);

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
      gl!.uniform2f(resLoc, canvas!.width, canvas!.height);
    }

    resize();
    window.addEventListener('resize', resize);

    const startTime = performance.now();

    function render() {
      const elapsed = (performance.now() - startTime) / 1000;
      gl!.uniform1f(timeLoc, elapsed);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
      }}
    />
  );
}
