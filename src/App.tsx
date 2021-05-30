/* eslint-disable one-var */
/* eslint-disable no-bitwise */

import { mat4 } from 'gl-matrix';
import React, { useEffect, useRef } from 'react';
import './App.scss';

const glsl = ([s]: TemplateStringsArray): string => s;

export default function App() {

  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const gl = canvas.current?.getContext('webgl');

    if (!gl) {
      throw new Error('Failed to get a WebGL context.');
    }

    const positions = makeStrip();

    const buffer = gl.createBuffer();
    if (!buffer) {
      throw new Error('Failed to create buffer.');
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const program = buildProgram(
      gl,
      glsl`
        attribute vec4 aVertexPosition;
        uniform mat4 uModelViewMatrix;
        uniform mat4 uProjectionMatrix;
        void main() {
          gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
        }
      `,
      glsl`
        void main() {
          gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
        }
      `,
    );

    gl.useProgram(program);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uModelViewMatrix'), false, makeModelViewMatrix());
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uProjectionMatrix'), false, makeProjectionMatrix(gl.canvas.width, gl.canvas.height));
    gl.vertexAttribPointer(gl.getAttribLocation(program, 'aVertexPosition'), 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(program, 'aVertexPosition'));

    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, positions.length / 3);
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <canvas width="320px" height="320px" ref={canvas} />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a className="App-link" href="https://github.com/EliEladElrom/react-tutorials" target="_blank" rel="noopener noreferrer">
          Eli Elad Elrom - React Tutorials
        </a>
      </header>
    </div>
  );
}

function makeStrip(): number[] {
  const positions: number[] = [];
  const epsilon = 0.001;
  const nTwists = 3;
  const step = Math.PI / 30.0;
  const R = 1.0; const h = 0.1;
  const torsion = 0;
  for (let i = 0; i < 2; i++) {
    for (let s = 0.0; s < 1.0 + epsilon; s += step / Math.PI) {
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
    }
  }
  return positions;
}

function buildProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
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
  return program;
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

function makeModelViewMatrix() {
  const matrix = mat4.create();
  mat4.translate(matrix, matrix, [0, 0, -4]);
  return matrix;
}

function makeProjectionMatrix(width: number, height: number) {
  const matrix = mat4.create();
  mat4.perspective(matrix, Math.PI / 4, width / height, 0.1, 100);
  return matrix;
}

