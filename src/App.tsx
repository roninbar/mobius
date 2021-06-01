/* eslint-disable one-var */
/* eslint-disable no-bitwise */

import { mat4 } from 'gl-matrix';
import React, { useEffect, useRef } from 'react';
import './App.scss';

const glsl = ([s]: TemplateStringsArray): string => s;

const BLUE = [0, 0, 1];
const GREEN = [0, 1, 0];
const YELLOW = [1, 1, 0];
const RED = [1, 0, 0];

const COLOR = [BLUE, GREEN, YELLOW, RED];

export default function App() {

  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const gl = canvas.current?.getContext('webgl');

    if (!gl) {
      throw new Error('Failed to get a WebGL context.');
    }

    const { positions: positions0, colors: colors0, count: count0 } = makeStripBuffers(gl, 0, 0);
    const { positions: positions2, colors: colors2, count: count2 } = makeStripBuffers(gl, 0, 2);

    const { program, attribs, uniforms } = buildProgram(gl);

    gl.useProgram(program);
    gl.uniformMatrix4fv(uniforms.modelViewMatrix, false, makeModelViewMatrix(4));
    gl.uniformMatrix4fv(uniforms.projectionMatrix, false, makeProjectionMatrix(gl.canvas.width, gl.canvas.height, Math.PI / 5, 0.1, 100));

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    render(gl, program, attribs.position, attribs.color, count0 / 3, positions0, colors0);
    gl.cullFace(gl.FRONT);
    render(gl, program, attribs.position, attribs.color, count2 / 3, positions2, colors2);
  }, []);

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

function render(gl: WebGLRenderingContext, program: WebGLProgram, vertexPositionAttrib: number, vertexColorAttrib: number, count: number, positions: WebGLBuffer, colors: WebGLBuffer) {
  bindBufferToAttribute(gl, positions, vertexPositionAttrib);
  bindBufferToAttribute(gl, colors, vertexColorAttrib);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, count);
}

function bindBufferToAttribute(gl: WebGLRenderingContext, positions: WebGLBuffer, vertexPositionAttrib: number) {
  gl.bindBuffer(gl.ARRAY_BUFFER, positions);
  gl.vertexAttribPointer(vertexPositionAttrib, 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(vertexPositionAttrib);
}

function makeStripBuffers(gl: WebGLRenderingContext, torsion: number, base: number) {
  const { positions, colors } = makeStrip(torsion, base);
  return {
    positions: makeBufferFromArray(gl, positions),
    colors: makeBufferFromArray(gl, colors),
    count: positions.length,
  };
}

function makeBufferFromArray(gl: WebGLRenderingContext, positions: number[]) {
  const positionBuffer = gl.createBuffer();
  if (!positionBuffer) {
    throw new Error('Failed to create position buffer.');
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  return positionBuffer;
}

function makeStrip(torsion: number, base: number) {
  const positions: number[] = [];
  const colors: number[] = [];
  const nTwists = 3;
  const R = 1.0; const h = 0.1;
  for (let i = 0; i < 2; i++) {
    const epsilon = 0.001;
    const step = 1 / 30.0;
    for (let s = 0.0; s < 1.0 + epsilon; s += step) {
      const t = (i + s) * Math.PI;
      const tt = nTwists * 0.5 * t - torsion;
      const ct = Math.cos(t), st = Math.sin(t);
      const ctt = Math.cos(tt), stt = Math.sin(tt);
      const r1 = R - h * ctt;
      const r2 = R + h * ctt;
      const z1 = -h * stt;
      const z2 = +h * stt;
      positions.push(r2 * st, r2 * ct, z2);
      positions.push(r1 * st, r1 * ct, z1);
      const color = new Array(3).fill(0);
      for (let k = 0; k < 3; k++) {
        color[k] = (1 - s) * COLOR[base + i][k] + s * COLOR[(base + i + 1) % COLOR.length][k];
      }
      colors.push(...color, ...color);
    }
  }
  return { positions, colors };
}

function buildProgram(gl: WebGLRenderingContext) {
  const vsSource = glsl`
    attribute vec4 aVertexPosition;
    attribute vec4 aVertexColor;
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    varying lowp vec4 vColor;
    void main(void) {
      gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
      vColor = aVertexColor;
    }
  `;
  const fsSource = glsl`
    varying lowp vec4 vColor;
    void main(void) {
      gl_FragColor = vColor;
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
      position: gl.getAttribLocation(program, 'aVertexPosition'),
      color: gl.getAttribLocation(program, 'aVertexColor'),
    },
    uniforms: {
      modelViewMatrix: gl.getUniformLocation(program, 'uModelViewMatrix'),
      projectionMatrix: gl.getUniformLocation(program, 'uProjectionMatrix'),
    },
  };
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

