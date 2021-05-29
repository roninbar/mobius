/* eslint-disable no-bitwise */

import { mat4 } from 'gl-matrix';
import React, { useEffect, useRef } from 'react';
import './App.scss';

export default function App() {

  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const gl = canvas.current?.getContext('webgl');

    if (!gl) {
      return;
    }

    const vsSource = glsl`
      attribute vec4 aVertexPosition;
      uniform mat4 uModelViewMatrix;
      uniform mat4 uProjectionMatrix;
      void main() {
        gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
      }
    `;

    const fsSource = glsl`
      void main() {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
      }
    `;

    const program = initShaderProgram(gl, vsSource, fsSource);

    const aVertexPosition = gl.getAttribLocation(program, 'aVertexPosition');
    const uModelViewMatrix = gl.getUniformLocation(program, 'uModelViewMatrix');
    const uProjectionMatrix = gl.getUniformLocation(program, 'uProjectionMatrix');

    gl.useProgram(program);

    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1.0);                 // Clear everything
    gl.enable(gl.DEPTH_TEST);           // Enable depth testing
    gl.depthFunc(gl.LEQUAL);            // Near things obscure far things

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const fieldOfView = Math.PI / 4;
    const aspect = gl.canvas.width / gl.canvas.height;
    const zNear = 0.1;
    const zFar = 100.0;

    const projectionMatrix = mat4.create();

    mat4.perspective(projectionMatrix,
      fieldOfView,
      aspect,
      zNear,
      zFar);

    const modelViewMatrix = mat4.create();

    mat4.translate(modelViewMatrix, // destination matrix
      modelViewMatrix,              // matrix to translate
      [-0.0, 0.0, -6.0]);            // amount to translate

    const { buffer, count } = makeStrip(gl);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

    gl.vertexAttribPointer(aVertexPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aVertexPosition);

    gl.uniformMatrix4fv(uModelViewMatrix, false, modelViewMatrix);
    gl.uniformMatrix4fv(uProjectionMatrix, false, projectionMatrix);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, count);
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
  )
}

const glsl = ([s]: TemplateStringsArray): string => s;

function makeStrip(gl: WebGLRenderingContext): { buffer: WebGLBuffer, count: number } {
  const epsilon = 0.001;
  const nTwists = 3;
  const step = Math.PI / 30.0;
  const R = 1.0; const h = 0.1;
  const torsion = 0;
  const positions: number[] = [];
  for (let i = 0; i < 2; i++) {
    for (let s = 0.0; s < 1.0 + epsilon; s += step / Math.PI) {
      const t = (i + s) * Math.PI;
      const tt = nTwists * 0.5 * t - torsion;
      const ct = Math.cos(t); const st = Math.sin(t);
      const ctt = Math.cos(tt); const stt = Math.sin(tt);
      const r1 = R - h * ctt;
      const r2 = R + h * ctt;
      const z1 = -h * stt;
      const z2 = +h * stt;
      positions.push(r2 * st, r2 * ct, z2);
      positions.push(r1 * st, r1 * ct, z1);
    }
  }
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error('Failed to create buffer.');
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  return { buffer, count: positions.length / 3 };
}

function initShaderProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
  
  const vertexShader = makeShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = makeShader(gl, gl.FRAGMENT_SHADER, fsSource);

  const program = gl.createProgram();

  if (!program) {
    throw new Error('Failed to create program.');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Unable to initialize the shader program: ${gl.getProgramInfoLog(program)}`);
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
    gl.deleteShader(shader);
    throw new Error(`An error occurred compiling the shaders: ${gl.getShaderInfoLog(shader)}`);
  }

  return shader;
}

