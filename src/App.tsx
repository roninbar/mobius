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
    modelMatrix: WebGLUniformLocation;
    viewMatrix: WebGLUniformLocation;
    projectionMatrix: WebGLUniformLocation;
  };
}

type NonTextureMappingProgramInfo = ProgramInfo & {
  attribs: {
    normal: number;
  };
  uniforms: {
    normalMatrix: WebGLUniformLocation;
  };
};

type TextureMappingProgramInfo = ProgramInfo & {
  attribs: {
    textureCoords: number;
  };
  uniforms: {
    sampler: WebGLSampler;
  };
};

type Primitive = {
  mode: number;
  first: number;
  count: number;
};

const glsl = String.raw;

// const BLACK = [0, 0, 0];
const BLUE = [0, 0, 1];
const GREEN = [0, 1, 0];
const YELLOW = [1, 1, 0];
const RED = [1, 0, 0];
const GOLD = [1.0, 0.8, 0.5];
const SILVER = [0.75, 0.75, 0.75];
const TITANIUM = [0.125, 0.125, 0.125];

const STRIP_COLORS = [BLUE, GREEN, YELLOW, RED];

const R = 1.0, H = 0.1;
const STEP = Math.PI / 36;
const EPSILON = 0.001;

export default function App() {

  const [theta, setTheta] = useState(0); // The angle of the hour hand, in radians.
  const [anchor, setAnchor] = useState<{ x: number, y: number; } | null>();
  const [modelMatrix, setModelMatrix] = useState(mat4.create());

  const programWithTextureMapping: MutableRefObject<TextureMappingProgramInfo | null> = useRef(null);
  const programWithoutTextureMapping: MutableRefObject<NonTextureMappingProgramInfo | null> = useRef(null);

  const canvas = useRef<HTMLCanvasElement>(null);

  // #region Initialize WebGL stuff and start the animation.
  useEffect(() => {

    const gl = canvas.current?.getContext('webgl');

    if (!gl) {
      throw new Error('Failed to get a WebGL context.');
    }

    programWithTextureMapping.current = makeProgramWithTextureMapping(gl);
    programWithoutTextureMapping.current = makeProgramWithoutTextureMapping(gl);

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
      setTheta(time / 12000 * Math.PI);
      // const now = new Date();
      // setTheta(((now.getSeconds() / 60 + now.getMinutes()) / 60 + now.getHours()) / 6 * Math.PI);
      afid = requestAnimationFrame(f);
    });

    return () => {
      cancelAnimationFrame(afid);
    };

  }, []);
  // #endregion

  // #region Render one frame.
  useEffect(() => {

    const gl = canvas.current?.getContext('webgl');

    if (!gl) {
      throw new Error('Failed to get a WebGL context.');
    }

    if (!programWithTextureMapping.current || !programWithoutTextureMapping.current) {
      throw new Error('Missing shader program!');
    }

    const { program: texProgram, attribs: texAttribs, uniforms: texUniforms } = programWithTextureMapping.current;
    const { program: nonTexProgram, attribs: nonTexAttribs, uniforms: nonTexUniforms } = programWithoutTextureMapping.current;

    const projectionMatrix = mat4.perspective(mat4.create(), Math.PI / 5, gl.canvas.width / gl.canvas.height, 0.1, 100);
    const viewMatrix = mat4.fromTranslation(mat4.create(), [0, 0, -4]);

    gl.uniformMatrix4fv(nonTexUniforms.projectionMatrix, false, projectionMatrix);
    gl.uniformMatrix4fv(nonTexUniforms.viewMatrix, false, viewMatrix);

    const drawWithoutTexture = function (
      makeBuffers: (gl: WebGLRenderingContext) => { topology: Primitive[]; positionBuffer: WebGLBuffer; normalBuffer: WebGLBuffer; colorBuffer: WebGLBuffer; }) {
      const { topology, positionBuffer, normalBuffer, colorBuffer } = makeBuffers(gl);
      try {
        gl.useProgram(nonTexProgram);
        drawArrays(gl, topology, nonTexAttribs.position, positionBuffer, nonTexAttribs.normal, normalBuffer, nonTexAttribs.color, colorBuffer);
      } finally {
        gl.deleteBuffer(colorBuffer);
        gl.deleteBuffer(normalBuffer);
        gl.deleteBuffer(positionBuffer);
      }
    };

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.cullFace(gl.FRONT);

    // #region Inside of Rim
    gl.uniformMatrix4fv(nonTexUniforms.modelMatrix, false, mat4.scale(mat4.create(), modelMatrix, [1.2, 1.2, 1]));
    gl.uniformMatrix4fv(nonTexUniforms.normalMatrix, false, mat4.scale(mat4.create(), modelMatrix, [1 / 1.2, 1 / 1.2, 1]));
    drawWithoutTexture(makeRimBuffers);
    // #endregion

    gl.cullFace(gl.BACK);

    // #region Clock Face
    {
      const m = mat4.translate(mat4.create(), modelMatrix, [0, 0, -H]);
      gl.uniformMatrix4fv(nonTexUniforms.modelMatrix, false, mat4.scale(mat4.create(), m, [1.199, 1.199, 1]));
      gl.uniformMatrix4fv(nonTexUniforms.normalMatrix, false, mat4.scale(mat4.create(), m, [1 / 1.2, 1 / 1.2, 1]));
      drawWithoutTexture(makeDiscBuffers);
    }
    // #endregion

    // #region Hours Strip
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
      } = makeStripBuffers(gl, theta, i)
    );

    try {
      gl.useProgram(texProgram);
      gl.uniformMatrix4fv(texUniforms.modelMatrix, false, modelMatrix);
      gl.uniformMatrix4fv(texUniforms.viewMatrix, false, viewMatrix);
      gl.uniformMatrix4fv(texUniforms.projectionMatrix, false, projectionMatrix);
      for (let i = 0; i < 4; i++) {
        gl.uniform1i(texUniforms.sampler, i);
        bindAttribute(gl, texAttribs.position, positionBuffers[i], 3, gl.FLOAT);
        bindAttribute(gl, texAttribs.color, colorBuffers[i], 3, gl.FLOAT);
        bindAttribute(gl, texAttribs.textureCoords, textureCoordBuffers[i], 2, gl.FLOAT);
        try {
          gl.cullFace(gl.BACK);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertexCounts[i]);
        } finally {
          unbindAttribute(gl, texAttribs.textureCoords);
          unbindAttribute(gl, texAttribs.color);
          unbindAttribute(gl, texAttribs.position);
        }
      }
    } finally {
      [...positionBuffers, ...colorBuffers, ...textureCoordBuffers].forEach((buffer) => gl.deleteBuffer(buffer));
    }
    // #endregion

    // #region Hands
    const drawHand = function (height: number, width: number, length: number, angle: number) {
      const { vertexCount, positions, normals, colors } = makeHandBuffers(gl, height, width, length);
      try {
        gl.useProgram(nonTexProgram);
        const m = mat4.rotateZ(mat4.create(), modelMatrix, -angle);
        gl.uniformMatrix4fv(nonTexUniforms.modelMatrix, false, m);
        gl.uniformMatrix4fv(nonTexUniforms.normalMatrix, false, m);
        bindAttribute(gl, nonTexAttribs.position, positions, 3, gl.FLOAT);
        bindAttribute(gl, nonTexAttribs.normal, normals, 3, gl.FLOAT);
        bindAttribute(gl, nonTexAttribs.color, colors, 3, gl.FLOAT);
        try {
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertexCount);
        } finally {
          unbindAttribute(gl, nonTexAttribs.color);
          unbindAttribute(gl, nonTexAttribs.normal);
          unbindAttribute(gl, nonTexAttribs.position);
        }
      } finally {
        gl.deleteBuffer(colors);
        gl.deleteBuffer(normals);
        gl.deleteBuffer(positions);
      }
    };

    drawHand(0.01, 0.02, 0.6, theta); // Hours
    drawHand(0.02, 0.02, 0.8, 12 * theta); // Minutes
    // #endregion

    // #region Hubcap
    const { vertexCount, positions, normals, colors } = makeHubcapBuffers(gl, 0.03);
    try {
      gl.useProgram(nonTexProgram);
      gl.uniformMatrix4fv(nonTexUniforms.modelMatrix, false, modelMatrix);
      gl.uniformMatrix4fv(nonTexUniforms.normalMatrix, false, modelMatrix);
      bindAttribute(gl, nonTexAttribs.position, positions, 3, gl.FLOAT);
      bindAttribute(gl, nonTexAttribs.normal, normals, 3, gl.FLOAT);
      bindAttribute(gl, nonTexAttribs.color, colors, 3, gl.FLOAT);
      try {
        gl.drawArrays(gl.TRIANGLE_FAN, 0, vertexCount);
      } finally {
        unbindAttribute(gl, nonTexAttribs.position);
        unbindAttribute(gl, nonTexAttribs.color);
      }
    } finally {
      gl.deleteBuffer(colors);
      gl.deleteBuffer(positions);
    }
    // #endregion

  }, [theta, modelMatrix]);
  // #endregion

  // #region Event Handlers 
  const onPointerDown = ({ currentTarget, pointerId, clientX: x, clientY: y }: React.PointerEvent<HTMLCanvasElement>): void => {
    currentTarget.setPointerCapture(pointerId);
    setAnchor({ x, y });
  };

  const onPointerUp = ({ currentTarget, pointerId }: React.PointerEvent<HTMLCanvasElement>): void => {
    setAnchor(null);
    currentTarget.releasePointerCapture(pointerId);
  };

  const onPointerMove = ({ clientX: x, clientY: y }: React.PointerEvent<HTMLCanvasElement>): void => {
    if (anchor) {
      const dx = x - anchor.x;
      const dy = y - anchor.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 0) {
        const rot = mat4.fromRotation(mat4.create(), 0.01 * distance, [dy, dx, 0]);
        setModelMatrix(mat4.mul(mat4.create(), rot, modelMatrix));
        setAnchor({ x, y });
      }
    }
  };
  // #endregion

  return (
    <div className="App">
      <header className="App-header">
        <canvas
          width="768px"
          height="768px"
          ref={canvas}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
        <p>M&ouml;bius Clock</p>
      </header>
    </div>
  );
}

function loadTexture(gl: WebGLRenderingContext, which: number, url: string) {
  const texture = gl.createTexture();

  // Because images have to be downloaded over the internet
  // they might take a moment until they are ready.
  // Until then put a single pixel in the texture so we can
  // use it immediately. When the image has finished downloading
  // we'll update the texture with the contents of the image.
  gl.activeTexture(which);
  gl.bindTexture(gl.TEXTURE_2D, texture);
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

function makeRimBuffers(gl: WebGLRenderingContext) {
  const topology: Primitive[] = [];
  const positions = [];
  const normals = [];
  const colors = [];
  for (let t = 0; t < 2 * Math.PI + EPSILON; t += STEP) {
    positions.push(R * Math.cos(t), R * Math.sin(t), +H);
    normals.push(Math.cos(t), Math.sin(t), 0);
    colors.push(...GOLD);
    positions.push(R * Math.cos(t), R * Math.sin(t), -H);
    normals.push(Math.cos(t), Math.sin(t), 0);
    colors.push(...GOLD);
  }
  topology.push({ mode: gl.TRIANGLE_STRIP, first: 0, count: positions.length / 3 });
  return {
    topology,
    positionBuffer: makeFloatBufferFromArray(gl, positions),
    normalBuffer: makeFloatBufferFromArray(gl, normals),
    colorBuffer: makeFloatBufferFromArray(gl, colors),
  };
}

function makeDiscBuffers(gl: WebGLRenderingContext) {
  const topology: Primitive[] = [];
  const positions = [0, 0, 0];
  const colors = [...TITANIUM];
  const normals = [0, 0, 1];
  const textureCoords = [0, 0];

  let first = 0, v = 1;
  for (let t = 0; t < 2 * Math.PI + 0.001; t += Math.PI / 36, v++) {
    const x = R * Math.cos(t);
    const y = R * Math.sin(t);
    positions.push(x, y, 0);
    normals.push(0, 0, 1);
    colors.push(...TITANIUM);
    textureCoords.push(x / R, y / R);
  }
  topology.push({ mode: gl.TRIANGLE_FAN, first, count: v - first });
  first = v;

  return {
    topology,
    positionBuffer: makeFloatBufferFromArray(gl, positions),
    normalBuffer: makeFloatBufferFromArray(gl, normals),
    colorBuffer: makeFloatBufferFromArray(gl, colors),
    textureCoordBuffer: makeFloatBufferFromArray(gl, textureCoords),
  };
}

function makeHubcapBuffers(gl: WebGLRenderingContext, height: number) {
  const r = 0.05;
  const h = 0.01;
  const norm = Math.sqrt(r * r + h * h);
  const nr = r / norm;
  const nh = h / norm;
  const positions = [0, 0, height + h];
  const normals = [0, 0, 1];
  const colors = [...SILVER];
  for (let t = 0; t < 2 * Math.PI; t += Math.PI / 30) {
    positions.push(r * Math.cos(t), r * Math.sin(t), height);
    normals.push(nh * Math.cos(t), nh * Math.sin(t), nr);
    colors.push(...SILVER);
  }
  const vertexCount = positions.length / 3;
  return {
    vertexCount,
    positions: makeFloatBufferFromArray(gl, positions),
    normals: makeFloatBufferFromArray(gl, normals),
    colors: makeFloatBufferFromArray(gl, colors),
  };
}

function makeHandBuffers(gl: WebGLRenderingContext, height: number, width: number, length: number) {
  return {
    vertexCount: 4,
    positions: makeFloatBufferFromArray(gl, [
      -width, -0.2 * length, height,
      +width, -0.2 * length, height,
      -width, length, height,
      +width, length, height,
    ]),
    normals: makeFloatBufferFromArray(gl, [
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ]),
    colors: makeFloatBufferFromArray(gl, [
      ...SILVER,
      ...SILVER,
      ...SILVER,
      ...SILVER,
    ]),
  };
}

function makeStripBuffers(gl: WebGLRenderingContext, torsion: number, piece: number) {
  const { positions, colors, textureCoords } = makeStrip(torsion, piece);
  return {
    vertexCount: positions.length / 3,
    positions: makeFloatBufferFromArray(gl, positions),
    colors: makeFloatBufferFromArray(gl, colors),
    textureCoords: makeFloatBufferFromArray(gl, textureCoords),
  };
}

function makeStrip(theta: number, piece: number) {
  const textureCoords: number[] = [];
  const positions: number[] = [];
  const colors: number[] = [];
  const nTwists = 3;
  for (let s = 0.0; s < 1.001; s += 0.033333) {
    const t = (piece + s) * Math.PI;
    const tt = nTwists * 0.5 * (t - theta);
    // Position
    const r1 = R + H * Math.cos(tt);
    const r2 = R - H * Math.cos(tt);
    positions.push(r1 * Math.sin(t), r1 * Math.cos(t), -H * Math.sin(tt));
    positions.push(r2 * Math.sin(t), r2 * Math.cos(t), +H * Math.sin(tt));
    // Color
    const color = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      color[k] = (1 - s) * STRIP_COLORS[piece][k] + s * STRIP_COLORS[(piece + 1) % STRIP_COLORS.length][k];
    }
    colors.push(...color, ...color);
    // Texture Coordinates
    textureCoords.push(s, 0, s, 1);
  }
  return { positions, colors, textureCoords };
}

function makeFloatBufferFromArray(gl: WebGLRenderingContext, array: number[]) {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error('Failed to create buffer.');
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(array), gl.STATIC_DRAW);
  return buffer;
}

function drawArrays(
  gl: WebGLRenderingContext,
  topology: Primitive[],
  positionAttrib: number,
  positionBuffer: WebGLBuffer,
  normalAttrib: number,
  normalBuffer: WebGLBuffer,
  colorAttrib: number,
  colorBuffer: WebGLBuffer,
) {
  bindAttribute(gl, positionAttrib, positionBuffer, 3, gl.FLOAT);
  bindAttribute(gl, normalAttrib, normalBuffer, 3, gl.FLOAT);
  bindAttribute(gl, colorAttrib, colorBuffer, 3, gl.FLOAT);
  try {
    for (const { mode, first, count } of topology) {
      gl.drawArrays(mode, first, count);
    }
  } finally {
    unbindAttribute(gl, colorAttrib);
    unbindAttribute(gl, normalAttrib);
    unbindAttribute(gl, positionAttrib);
  }
}

function bindAttribute(gl: WebGLRenderingContext, attrib: number, buffer: WebGLBuffer, size: number, type: number) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(attrib, size, type, false, 0, 0);
  gl.enableVertexAttribArray(attrib);
}

function unbindAttribute(gl: WebGLRenderingContext, attrib: number) {
  gl.disableVertexAttribArray(attrib);
}

function makeProgramWithoutTextureMapping(gl: WebGLRenderingContext) {
  const U_MODEL_MATRIX = 'uModelMatrix';
  const U_NORMAL_MATRIX = 'uNormalMatrix';
  const U_VIEW_MATRIX = 'uViewMatrix';
  const U_PROJECTION_MATRIX = 'uProjectionMatrix';
  const A_POSITION = 'aPosition';
  const A_NORMAL = 'aNormal';
  const A_COLOR = 'aColor';
  const V_COLOR = 'vColor';
  const V_NORMAL = 'vNormal';

  const vsSource = glsl`
    // Uniforms
    uniform mat4 ${U_MODEL_MATRIX};
    uniform mat4 ${U_NORMAL_MATRIX};
    uniform mat4 ${U_VIEW_MATRIX};
    uniform mat4 ${U_PROJECTION_MATRIX};
    // Attributes
    attribute vec4 ${A_POSITION};
    attribute vec3 ${A_NORMAL};
    attribute vec4 ${A_COLOR};
    // Varyings
    varying highp vec4 ${V_NORMAL};
    varying lowp vec4 ${V_COLOR};
    // Program
    void main(void) {
      ${V_NORMAL} = normalize(${U_VIEW_MATRIX} * ${U_NORMAL_MATRIX} * vec4(${A_NORMAL}, 0));
      ${V_COLOR} = ${A_COLOR};
      gl_Position = ${U_PROJECTION_MATRIX} * ${U_VIEW_MATRIX} * ${U_MODEL_MATRIX} * ${A_POSITION};
    }
  `;

  const fsSource = glsl`
    // Varyings
    varying highp vec4 ${V_NORMAL};
    varying lowp vec4 ${V_COLOR};
    // Program
    void main(void) {
      // Apply lighting
      lowp vec3 Ca = vec3(0.3, 0.3, 0.3); // Ambient light color
      lowp vec3 Cd = vec3(1, 1, 1); // Diffuse light color (white)
      highp vec3 u = normalize(vec3(0.85, 0.8, 0.75)); // Diffuse light direction
      lowp float Id = max(0.0, (gl_FrontFacing ? +1.0 : -1.0) * dot(u, ${V_NORMAL}.xyz)); // Diffuse intensity
      lowp vec4 C = vec4(Ca + Id * Cd, 1.0); // Total incident light color
      gl_FragColor = ${V_COLOR} * C;
    }
  `;

  const program = buildProgram(gl, vsSource, fsSource);

  return {
    program,
    attribs: {
      position: gl.getAttribLocation(program, A_POSITION),
      normal: gl.getAttribLocation(program, A_NORMAL),
      color: gl.getAttribLocation(program, A_COLOR),
    },
    uniforms: {
      normalMatrix: getUniformLocation(gl, program, U_NORMAL_MATRIX),
      modelMatrix: getUniformLocation(gl, program, U_MODEL_MATRIX),
      viewMatrix: getUniformLocation(gl, program, U_VIEW_MATRIX),
      projectionMatrix: getUniformLocation(gl, program, U_PROJECTION_MATRIX),
    },
  };
}

function makeProgramWithTextureMapping(gl: WebGLRenderingContext) {
  const U_MODEL_MATRIX = 'uModelMatrix';
  const U_VIEW_MATRIX = 'uViewMatrix';
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
    uniform mat4 ${U_MODEL_MATRIX};
    uniform mat4 ${U_VIEW_MATRIX};
    uniform mat4 ${U_PROJECTION_MATRIX};
    // Varyings
    varying lowp vec4 ${V_COLOR};
    varying highp vec2 ${V_TEXTURE_COORDS};
    // Program
    void main(void) {
      gl_Position = ${U_PROJECTION_MATRIX} * ${U_VIEW_MATRIX} * ${U_MODEL_MATRIX} * ${A_POSITION};
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
      modelMatrix: getUniformLocation(gl, program, U_MODEL_MATRIX),
      viewMatrix: getUniformLocation(gl, program, U_VIEW_MATRIX),
      projectionMatrix: getUniformLocation(gl, program, U_PROJECTION_MATRIX),
    },
  };
}

function buildProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
  const program = gl.createProgram();

  if (!program) {
    throw new Error('Failed to create program.');
  }

  gl.attachShader(program, buildShader(gl, gl.VERTEX_SHADER, vsSource));
  gl.attachShader(program, buildShader(gl, gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = `Unable to initialize the shader program: ${gl.getProgramInfoLog(program)}`;
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

function buildShader(gl: WebGLRenderingContext, type: number, source: string) {
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

function getUniformLocation(gl: WebGLRenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  return gl.getUniformLocation(program, name) || error(`No uniform named "${name}" was found.`);
}

function error<T>(message: string): T {
  throw new Error(message);
}

