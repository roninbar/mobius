/* eslint-disable one-var */
/* eslint-disable no-bitwise */

import { mat4 } from 'gl-matrix';
import React, { MutableRefObject, useEffect, useRef, useState } from 'react';
import './App.scss';

interface ProgramInfo {
  program: WebGLProgram;
  attribs: {
    color: number;
    position: number;
  };
  uniforms: {
    modelViewMatrix: WebGLUniformLocation;
    projectionMatrix: WebGLUniformLocation;
  };
}

type TextureMappingProgramInfo = ProgramInfo & {
  attribs: {
    textureCoords: number;
  };
  uniforms: {
    sampler: WebGLSampler;
  };
};

const glsl = (pieces: TemplateStringsArray, ...args: string[]) => pieces.slice(1).reduce((a, b, i) => a + args[i] + b, pieces[0]);

const BLUE = [0, 0, 1];
const GREEN = [0, 1, 0];
const YELLOW = [1, 1, 0];
const RED = [1, 0, 0];

const COLORS = [BLUE, GREEN, YELLOW, RED];

export default function App() {

  const [torsion, setTorsion] = useState(0);

  const textureMappingProgramInfo: MutableRefObject<TextureMappingProgramInfo | null> = useRef(null);
  const nonTextureMappingProgramInfo: MutableRefObject<ProgramInfo | null> = useRef(null);

  const canvas = useRef<HTMLCanvasElement>(null);

  // Initialize WebGL stuff and start the animation.
  useEffect(() => {

    const gl = canvas.current?.getContext('webgl');

    if (!gl) {
      throw new Error('Failed to get a WebGL context.');
    }

    textureMappingProgramInfo.current = makeTextureMappingProgram(gl);
    nonTextureMappingProgramInfo.current = makeNonTextureMappingProgram(gl);

    gl.useProgram(textureMappingProgramInfo.current.program);
    gl.uniformMatrix4fv(textureMappingProgramInfo.current.uniforms.modelViewMatrix, false, makeModelViewMatrix(4));
    gl.uniformMatrix4fv(textureMappingProgramInfo.current.uniforms.projectionMatrix, false, makeProjectionMatrix(gl.canvas.width, gl.canvas.height, Math.PI / 5, 0.1, 100));

    for (const which of [gl.TEXTURE0, gl.TEXTURE1, gl.TEXTURE2, gl.TEXTURE3]) {
      loadTexture(gl, which, `${process.env.PUBLIC_URL}/texture/hours${which - gl.TEXTURE0}.bmp`);
    }

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1);
    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

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

    if (!textureMappingProgramInfo.current) {
      throw new Error('No shader program!');
    }

    const { program, attribs, uniforms } = textureMappingProgramInfo.current;

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const vertexCounts: number[] = [];
    const positionBuffers: WebGLBuffer[] = [];
    const colorBuffers: WebGLBuffer[] = [];
    const textureCoordBuffers: WebGLBuffer[] = [];

    for (let i = 0; i < 4; i++) (
      {
        vertexCount: vertexCounts[i],
        positions: positionBuffers[i],
        colors: colorBuffers[i],
        textureCoords: textureCoordBuffers[i],
      } = makeStripBuffers(gl, torsion, i)
    );

    try {
      for (let i = 0; i < 4; i++) {
        gl.useProgram(program);
        gl.uniform1i(uniforms.sampler, i);
        bindAttributeToBuffer(gl, attribs.position, positionBuffers[i], 3, gl.FLOAT);
        bindAttributeToBuffer(gl, attribs.color, colorBuffers[i], 3, gl.FLOAT);
        bindAttributeToBuffer(gl, attribs.textureCoords, textureCoordBuffers[i], 2, gl.FLOAT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertexCounts[i]);
      }
    } finally {
      [...positionBuffers, ...colorBuffers, ...textureCoordBuffers].forEach((buffer) => gl.deleteBuffer(buffer));
    }

  }, [torsion]);

  return (
    <div className="App">
      <header className="App-header">
        <canvas width="640px" height="640px" ref={canvas} />
        <p>M&ouml;bius Clock</p>
      </header>
    </div>
  );
}

function error<T>(message: string): T {
  throw new Error(message);
}

//
// Initialize a texture and load an image.
// When the image finished loading copy it into the texture.
//
function loadTexture(gl: WebGLRenderingContext, which: number, url: string) {
  const texture = gl.createTexture();

  gl.activeTexture(which);
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Because images have to be downloaded over the internet
  // they might take a moment until they are ready.
  // Until then put a single pixel in the texture so we can
  // use it immediately. When the image has finished downloading
  // we'll update the texture with the contents of the image.
  gl.texImage2D(
    gl.TEXTURE_2D,
    0, // level
    gl.RGBA,
    1, // width
    1, // height
    0, // border
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255]), // opaque white
  );

  const image = new Image();
  image.onload = () => {
    gl.activeTexture(which);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    // WebGL1 has different requirements for power of 2 images
    // vs non power of 2 images so check if the image is a
    // power of 2 in both dimensions.
    if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
      // Yes, it's a power of 2. Generate mips.
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      // No, it's not a power of 2. Turn off mips and set
      // wrapping to clamp to edge.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
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

function makeStripBuffers(gl: WebGLRenderingContext, torsion: number, piece: number) {
  const { positions, colors, textureCoords } = makeStrip(torsion, piece);
  return {
    vertexCount: positions.length / 3,
    positions: makeBufferFromArray(gl, positions),
    colors: makeBufferFromArray(gl, colors),
    textureCoords: makeBufferFromArray(gl, textureCoords),
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

function makeStrip(torsion: number, piece: number) {
  const textureCoords: number[] = [];
  const positions: number[] = [];
  const colors: number[] = [];
  const nTwists = 3;
  const R = 1.0;
  const h = 0.1;
  for (let s = 0.0; s < 1.001; s += 0.033333) {
    const t = (piece + s) * Math.PI;
    const tt = nTwists * 0.5 * t - torsion;
    // Position
    const r1 = R - h * Math.cos(tt);
    const r2 = R + h * Math.cos(tt);
    positions.push(r1 * Math.sin(t), r1 * Math.cos(t), -h * Math.sin(tt));
    positions.push(r2 * Math.sin(t), r2 * Math.cos(t), +h * Math.sin(tt));
    // Color
    const color = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      color[k] = (1 - s) * COLORS[piece][k] + s * COLORS[(piece + 1) % COLORS.length][k];
    }
    colors.push(...color, ...color);
    // Texture Coordinates
    textureCoords.push(s, 0, s, 1);
  }
  return { positions, colors, textureCoords };
}

function makeNonTextureMappingProgram(gl: WebGLRenderingContext) {
  const U_MODEL_VIEW_MATRIX = 'uModelViewMatrix';
  const U_PROJECTION_MATRIX = 'uProjectionMatrix';
  const A_POSITION = 'aPosition';
  const A_COLOR = 'aColor';
  const V_COLOR = 'vColor';

  const vsSource = glsl`
    // Attributes
    attribute vec4 ${A_POSITION};
    attribute vec4 ${A_COLOR};
    // Uniforms
    uniform mat4 ${U_MODEL_VIEW_MATRIX};
    uniform mat4 ${U_PROJECTION_MATRIX};
    // Varyings
    varying lowp vec4 ${V_COLOR};
    // Program
    void main(void) {
      gl_Position = ${U_PROJECTION_MATRIX} * ${U_MODEL_VIEW_MATRIX} * ${A_POSITION};
      ${V_COLOR} = ${A_COLOR};
    }
  `;

  const fsSource = glsl`
    // Varyings
    varying lowp vec4 ${V_COLOR};
    // Program
    void main(void) {
      gl_FragColor = ${V_COLOR};
    }
  `;

  const program = buildProgram(gl, vsSource, fsSource);

  return {
    program,
    attribs: {
      position: gl.getAttribLocation(program, A_POSITION),
      color: gl.getAttribLocation(program, A_COLOR),
    },
    uniforms: {
      modelViewMatrix: getUniformLocation(gl, program, U_MODEL_VIEW_MATRIX),
      projectionMatrix: getUniformLocation(gl, program, U_PROJECTION_MATRIX),
    },
  };
}

function makeTextureMappingProgram(gl: WebGLRenderingContext) {
  const U_MODEL_VIEW_MATRIX = 'uModelViewMatrix';
  const U_PROJECTION_MATRIX = 'uProjectionMatrix';
  const U_SAMPLER = 'uSampler';
  const A_POSITION = 'aPosition';
  const A_COLOR = 'aColor';
  const A_TEXTURE_COORDS = 'aTextureCoords';
  const V_COLOR = 'vColor';
  const V_TEXTURE_COORDS = 'vTextureCoords';

  const vsSource = glsl`
    // Attributes
    attribute vec4 ${A_POSITION};
    attribute vec4 ${A_COLOR};
    attribute vec2 ${A_TEXTURE_COORDS};
    // Uniforms
    uniform mat4 ${U_MODEL_VIEW_MATRIX};
    uniform mat4 ${U_PROJECTION_MATRIX};
    // Varyings
    varying lowp vec4 ${V_COLOR};
    varying highp vec2 ${V_TEXTURE_COORDS};
    // Program
    void main(void) {
      gl_Position = ${U_PROJECTION_MATRIX} * ${U_MODEL_VIEW_MATRIX} * ${A_POSITION};
      ${V_COLOR} = ${A_COLOR};
      ${V_TEXTURE_COORDS} = ${A_TEXTURE_COORDS};
    }
  `;

  const fsSource = glsl`
    // Varyings
    varying lowp vec4 ${V_COLOR};
    varying highp vec2 ${V_TEXTURE_COORDS};
    // Uniforms
    uniform sampler2D ${U_SAMPLER};
    // Program
    void main(void) {
      gl_FragColor = ${V_COLOR} * texture2D(${U_SAMPLER}, ${V_TEXTURE_COORDS});
    }
  `;

  const program = buildProgram(gl, vsSource, fsSource);

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

function getUniformLocation(gl: WebGLRenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  return gl.getUniformLocation(program, name) || error(`No uniform named "${name}" was found.`);
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

