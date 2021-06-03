/* eslint-disable one-var */
/* eslint-disable no-bitwise */

import { mat4 } from 'gl-matrix';
import React, { MutableRefObject, useEffect, useRef, useState } from 'react';
import './App.scss';

type ProgramInfo = {
  program: WebGLProgram;
  attribs: {
    color: number;
    position: number;
    textureCoords: number;
  };
  uniforms: {
    sampler: WebGLSampler;
    modelViewMatrix: WebGLUniformLocation;
    projectionMatrix: WebGLUniformLocation;
  };
};

const glsl = ([s]: TemplateStringsArray): string => s;

const BLUE = [0, 0, 1];
const GREEN = [0, 1, 0];
const YELLOW = [1, 1, 0];
const RED = [1, 0, 0];

const COLORS = [BLUE, GREEN, YELLOW, RED];

export default function App() {

  const [torsion, setTorsion] = useState(0);

  const programInfo: MutableRefObject<ProgramInfo | null> = useRef(null);

  const canvas = useRef<HTMLCanvasElement>(null);

  // Initialize WebGL stuff and start the animation.
  useEffect(() => {

    const gl = canvas.current?.getContext('webgl');

    if (!gl) {
      throw new Error('Failed to get a WebGL context.');
    }

    programInfo.current = buildProgram(gl);

    gl.useProgram(programInfo.current.program);
    gl.uniformMatrix4fv(programInfo.current.uniforms.modelViewMatrix, false, makeModelViewMatrix(4));
    gl.uniformMatrix4fv(programInfo.current.uniforms.projectionMatrix, false, makeProjectionMatrix(gl.canvas.width, gl.canvas.height, Math.PI / 5, 0.1, 100));

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, loadTexture(gl, '/mobius/texture/hours0.bmp'));
    gl.uniform1i(programInfo.current.uniforms.sampler, 0);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1);
    gl.clearColor(0, 0, 0, 1);

    gl.enable(gl.CULL_FACE);

    let afid = requestAnimationFrame(function f(time) {
      setTorsion(time / 4000 * Math.PI);
      afid = requestAnimationFrame(f);
    });

    return () => {
      cancelAnimationFrame(afid);
    };

  }, []);

  // Render one frame.
  useEffect(() => {

    const gl = canvas.current?.getContext('webgl');
    
    if (!gl) {
      throw new Error('Failed to get a WebGL context.');
    }
    
    const { positions: positions0, colors: colors0, textureCoords: textureCoords0, count: count0 } = makeStripBuffers(gl, torsion, 0);
    const { positions: positions2, colors: colors2, textureCoords: textureCoords2, count: count2 } = makeStripBuffers(gl, torsion, 2);
    
    if (!programInfo.current) {
      throw new Error('No shader program!');
    }

    const { attribs } = programInfo.current;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.cullFace(gl.BACK);
    render(gl, attribs.position, attribs.color, attribs.textureCoords, positions0, colors0, textureCoords0, count0 / 3);
    gl.cullFace(gl.FRONT);
    render(gl, attribs.position, attribs.color, attribs.textureCoords, positions2, colors2, textureCoords2, count2 / 3);

  }, [torsion]);

  return (
    <div className="App">
      <header className="App-header">
        <canvas width="480px" height="480px" ref={canvas} />
        <p>
          M&ouml;bius Clock
        </p>
      </header>
    </div>
  );
}

function error<T>(message: string): T {
  throw new Error(message);
}

function render(
  gl: WebGLRenderingContext,
  positionAttrib: number,
  colorAttrib: number,
  texCoordAttrib: number,
  positionBuffer: WebGLBuffer,
  colorBuffer: WebGLBuffer,
  texCoordBuffer: WebGLBuffer,
  count: number,
) {
  bindAttributeToBuffer(gl, positionAttrib, positionBuffer, 3, gl.FLOAT);
  bindAttributeToBuffer(gl, colorAttrib, colorBuffer, 3, gl.FLOAT);
  bindAttributeToBuffer(gl, texCoordAttrib, texCoordBuffer, 2, gl.FLOAT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, count);
}

//
// Initialize a texture and load an image.
// When the image finished loading copy it into the texture.
//
function loadTexture(gl: WebGLRenderingContext, url: string) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Because images have to be download over the internet
  // they might take a moment until they are ready.
  // Until then put a single pixel in the texture so we can
  // use it immediately. When the image has finished downloading
  // we'll update the texture with the contents of the image.
  const level = 0;
  const internalFormat = gl.RGBA;
  const width = 1;
  const height = 1;
  const border = 0;
  const srcFormat = gl.RGBA;
  const srcType = gl.UNSIGNED_BYTE;
  const pixel = new Uint8Array([0, 0, 255, 255]);  // opaque blue
  gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
    width, height, border, srcFormat, srcType,
    pixel);

  const image = new Image();
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
      srcFormat, srcType, image);

    // WebGL1 has different requirements for power of 2 images
    // vs non power of 2 images so check if the image is a
    // power of 2 in both dimensions.
    if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
      // Yes, it's a power of 2. Generate mips.
      gl.generateMipmap(gl.TEXTURE_2D);
    } else {
      // No, it's not a power of 2. Turn of mips and set
      // wrapping to clamp to edge
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
  };
  image.src = url;

  return texture;
}

function isPowerOf2(value: number) {
  return (value & (value - 1)) === 0;
}

function bindAttributeToBuffer(gl: WebGLRenderingContext, attrib: number, buffer: WebGLBuffer, size: number, type: number) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(attrib, size, type, false, 0, 0);
  gl.enableVertexAttribArray(attrib);
}

function makeStripBuffers(gl: WebGLRenderingContext, torsion: number, base: number) {
  const { positions, colors, textureCoords } = makeStrip(torsion, base);
  return {
    positions: makeBufferFromArray(gl, positions),
    colors: makeBufferFromArray(gl, colors),
    textureCoords: makeBufferFromArray(gl, textureCoords),
    count: positions.length,
  };
}

function makeBufferFromArray(gl: WebGLRenderingContext, positions: number[]) {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error('Failed to create buffer.');
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  return buffer;
}

function makeStrip(torsion: number, base: number) {
  const textureCoords: number[] = [];
  const positions: number[] = [];
  const colors: number[] = [];
  const nTwists = 3;
  const R = 1.0; const h = 0.1;
  for (let i = 0; i < 2; i++) {
    for (let s = 0.0; s < 1.001; s += 0.033333) {
      // Position
      const t = (i + s) * Math.PI;
      const tt = nTwists * 0.5 * t - torsion;
      const r1 = R - h * Math.cos(tt);
      const r2 = R + h * Math.cos(tt);
      positions.push(r2 * Math.sin(t), r2 * Math.cos(t), +h * Math.sin(tt));
      positions.push(r1 * Math.sin(t), r1 * Math.cos(t), -h * Math.sin(tt));
      // Color
      const color = new Array(3).fill(0);
      for (let k = 0; k < 3; k++) {
        color[k] = (1 - s) * COLORS[base + i][k] + s * COLORS[(base + i + 1) % COLORS.length][k];
      }
      colors.push(...color, ...color);
      // Texture Coordinates
      textureCoords.push(s, 0, s, 1);
    }
  }
  return { positions, colors, textureCoords };
}

function buildProgram(gl: WebGLRenderingContext): ProgramInfo {
  const U_MODEL_VIEW_MATRIX = 'uModelViewMatrix';
  const U_PROJECTION_MATRIX = 'uProjectionMatrix';
  const U_SAMPLER = 'uSampler';
  const A_POSITION = 'aPosition';
  const A_COLOR = 'aColor';
  const A_TEXTURE_COORDS = 'aTextureCoords';

  const vsSource = glsl`
    // Attributes
    attribute vec4 aPosition;
    attribute vec4 aColor;
    attribute vec2 aTextureCoords;
    // Uniforms
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    // Varyings
    varying lowp vec4 vColor;
    varying highp vec2 vTextureCoords;
    // Program
    void main(void) {
      gl_Position = uProjectionMatrix * uModelViewMatrix * aPosition;
      vColor = aColor;
      vTextureCoords = aTextureCoords;
    }
  `;

  const fsSource = glsl`
    // Varyings
    varying lowp vec4 vColor;
    varying highp vec2 vTextureCoords;
    // Uniforms
    uniform sampler2D uSampler;
    // Program
    void main(void) {
      gl_FragColor = vColor * texture2D(uSampler, vTextureCoords);
    }
  `;

  const program = gl.createProgram();

  if (!program) {
    throw new Error('Failed to create program.');
  }

  gl.attachShader(program, makeShader(gl, gl.VERTEX_SHADER, vsSource));
  gl.attachShader(program, makeShader(gl, gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = `Unable to initialize the shader program: ${gl.getProgramInfoLog(program)}`;
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return {
    program,
    attribs: {
      position: gl.getAttribLocation(program, A_POSITION),
      color: gl.getAttribLocation(program, A_COLOR),
      textureCoords: gl.getAttribLocation(program, A_TEXTURE_COORDS),
    },
    uniforms: {
      sampler: getUniformLocation(gl, program, U_SAMPLER),
      modelViewMatrix: getUniformLocation(gl, program, U_MODEL_VIEW_MATRIX),
      projectionMatrix: getUniformLocation(gl, program, U_PROJECTION_MATRIX),
    },
  };
}

function getUniformLocation(gl: WebGLRenderingContext, program: WebGLProgram, U_MODEL_VIEW_MATRIX: string): WebGLUniformLocation {
  return gl.getUniformLocation(program, U_MODEL_VIEW_MATRIX) || error(`No uniform named "${U_MODEL_VIEW_MATRIX}" was found.`);
}

function makeShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to create shader.');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = `An error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`;
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function makeModelViewMatrix(distance: number) {
  const matrix = mat4.create();
  mat4.translate(matrix, matrix, [0, 0, -distance]);
  return matrix;
}

function makeProjectionMatrix(width: number, height: number, fovy: number, near: number, far: number) {
  const matrix = mat4.create();
  mat4.perspective(matrix, fovy, width / height, near, far);
  return matrix;
}

