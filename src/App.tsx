/* eslint-disable one-var */
/* eslint-disable no-bitwise */

import { mat3, mat4 } from 'gl-matrix';
import React, { MutableRefObject, useEffect, useRef, useState } from 'react';
import './App.scss';

interface ProgramInfo {
  program: WebGLProgram;
  attribs: {
    position: number;
    normal: number;
  };
  uniforms: {
    matrices: {
      projection: WebGLUniformLocation;
      view: WebGLUniformLocation;
      model: WebGLUniformLocation;
      normal: WebGLUniformLocation;
    },
    light: {
      direction: WebGLUniformLocation;
      ambientColor: WebGLUniformLocation;
      diffuseColor: WebGLUniformLocation;
      specularColor: WebGLUniformLocation;
      specularity: WebGLUniformLocation;
    },
    color: WebGLUniformLocation;
  };
}

type NonTextureMappingProgramInfo = ProgramInfo & {
  attribs: {
  };
  uniforms: {
  };
};

type TextureMappingProgramInfo = ProgramInfo & {
  attribs: {
    textureCoords: number;
  };
  uniforms: {
    matrices: {
      texture: WebGLUniformLocation;
    };
    sampler: WebGLSampler;
  };
};

type Primitive = {
  mode: number;
  first: number;
  count: number;
};

interface Actor {
  topology: Primitive[];
  positionBuffer: WebGLBuffer;
  normalBuffer: WebGLBuffer;
  colorBuffer: WebGLBuffer;
  textureCoordBuffer?: WebGLBuffer;
}

const glsl = String.raw;

const LIGHTDIR = [0.85, 0.8, 0.75];

const BLACK = [0, 0, 0];
// const BLUE = [0, 0, 1];
// const GREEN = [0, 1, 0];
// const YELLOW = [1, 1, 0];
// const RED = [1, 0, 0];
const GOLD = [1.0, 0.8, 0.5];
const SILVER = [0.75, 0.75, 0.75];
// const TITANIUM = [0.125, 0.125, 0.125];
const WHITE = [1, 1, 1];
const WHITE25 = [0.25, 0.25, 0.25];
const WHITE50 = [0.5, 0.5, 0.5];

const STRIP_COLORS = [WHITE50, WHITE50, WHITE50, WHITE50];

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

    const { program: texProgram, uniforms: texUniforms } = programWithTextureMapping.current;
    const { program: nonTexProgram, uniforms: nonTexUniforms } = programWithoutTextureMapping.current;

    gl.useProgram(texProgram);
    gl.uniform3fv(texUniforms.light.direction, LIGHTDIR);
    gl.uniform3fv(texUniforms.light.ambientColor, WHITE25);
    gl.uniform3fv(texUniforms.light.diffuseColor, WHITE);
    gl.uniform3fv(texUniforms.light.specularColor, WHITE);
    gl.uniform1f(texUniforms.light.specularity, 10);

    gl.useProgram(nonTexProgram);
    gl.uniform3fv(nonTexUniforms.light.direction, LIGHTDIR);
    gl.uniform3fv(nonTexUniforms.light.ambientColor, WHITE25);
    gl.uniform3fv(nonTexUniforms.light.diffuseColor, WHITE);
    gl.uniform3fv(nonTexUniforms.light.specularColor, WHITE);
    gl.uniform1f(nonTexUniforms.light.specularity, 10);

    for (const which of [gl.TEXTURE0, gl.TEXTURE1, gl.TEXTURE2, gl.TEXTURE3]) {
      loadTexture(gl, which, `${process.env.PUBLIC_URL}/texture/hours${which - gl.TEXTURE0}.bmp`);
    }

    loadTexture(gl, gl.TEXTURE10, `${process.env.PUBLIC_URL}/texture/mobius.png`);

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
    const textureMatrix = mat3.create();

    gl.useProgram(texProgram);
    gl.uniformMatrix4fv(texUniforms.matrices.projection, false, projectionMatrix);
    gl.uniformMatrix4fv(texUniforms.matrices.view, false, viewMatrix);

    gl.useProgram(nonTexProgram);
    gl.uniformMatrix4fv(nonTexUniforms.matrices.projection, false, projectionMatrix);
    gl.uniformMatrix4fv(nonTexUniforms.matrices.view, false, viewMatrix);

    const drawWithoutTexture = function ({ topology, positionBuffer, normalBuffer, colorBuffer }: Actor) {
      try {
        drawArrays(gl, topology, nonTexAttribs.position, positionBuffer, nonTexAttribs.normal, normalBuffer);
      } finally {
        if (colorBuffer) gl.deleteBuffer(colorBuffer);
        if (normalBuffer) gl.deleteBuffer(normalBuffer);
        if (positionBuffer) gl.deleteBuffer(positionBuffer);
      }
    };

    const drawWithTexture = function ({ topology, positionBuffer, normalBuffer, colorBuffer, textureCoordBuffer }: Actor) {
      try {
        drawArrays(gl, topology, texAttribs.position, positionBuffer, texAttribs.normal, normalBuffer, texAttribs.textureCoords, textureCoordBuffer);
      } finally {
        if (textureCoordBuffer) gl.deleteBuffer(textureCoordBuffer);
        if (colorBuffer) gl.deleteBuffer(colorBuffer);
        if (normalBuffer) gl.deleteBuffer(normalBuffer);
        if (positionBuffer) gl.deleteBuffer(positionBuffer);
      }
    };

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.cullFace(gl.FRONT);

    // #region Inside of Rim
    gl.useProgram(nonTexProgram);
    gl.uniformMatrix4fv(nonTexUniforms.matrices.model, false, mat4.scale(mat4.create(), modelMatrix, [1.2, 1.2, 1]));
    gl.uniformMatrix4fv(nonTexUniforms.matrices.normal, false, mat4.scale(mat4.create(), modelMatrix, [1 / 1.2, 1 / 1.2, 1]));
    drawWithoutTexture(makeRim(gl));
    // #endregion

    gl.cullFace(gl.BACK);

    // #region Clock Face
    {
      const m = mat4.translate(mat4.create(), modelMatrix, [0, 0, -H]);
      const t = mat3.scale(mat3.create(), mat3.translate(mat3.create(), textureMatrix, [0.5, 0.5]), [0.75, -0.75]);
      gl.useProgram(texProgram);
      gl.uniform4fv(texUniforms.color, [...WHITE, 1]);
      gl.uniform3fv(texUniforms.light.direction, LIGHTDIR);
      gl.uniform3fv(texUniforms.light.ambientColor, WHITE25);
      gl.uniform3fv(texUniforms.light.diffuseColor, WHITE);
      gl.uniform3fv(texUniforms.light.specularColor, BLACK);
      gl.uniform1f(texUniforms.light.specularity, 10);
      gl.uniformMatrix4fv(texUniforms.matrices.model, false, mat4.scale(mat4.create(), m, [1.199, 1.199, 1]));
      gl.uniformMatrix4fv(texUniforms.matrices.normal, false, mat4.scale(mat4.create(), m, [1 / 1.2, 1 / 1.2, 1]));
      gl.uniformMatrix3fv(texUniforms.matrices.texture, false, t);
      gl.uniform1i(texUniforms.sampler, 10);
      drawWithTexture(makeDisc(gl));
    }
    // #endregion

    // #region Hours Strip
    gl.useProgram(texProgram);
    gl.uniform3fv(texUniforms.light.direction, LIGHTDIR);
    gl.uniform3fv(texUniforms.light.ambientColor, WHITE25);
    gl.uniform3fv(texUniforms.light.diffuseColor, WHITE);
    gl.uniform3fv(texUniforms.light.specularColor, WHITE);
    gl.uniform1f(texUniforms.light.specularity, 8);
    gl.uniformMatrix4fv(texUniforms.matrices.model, false, modelMatrix);
    gl.uniformMatrix3fv(texUniforms.matrices.texture, false, textureMatrix);
    for (let i = 0; i < 4; i++) {
      gl.uniform1i(texUniforms.sampler, i);
      drawWithTexture(makeStrip(gl, theta, i));
    }
    // #endregion

    // #region Hands
    gl.useProgram(nonTexProgram);
    gl.uniform3fv(nonTexUniforms.light.direction, LIGHTDIR);
    gl.uniform3fv(nonTexUniforms.light.ambientColor, WHITE25);
    gl.uniform3fv(nonTexUniforms.light.diffuseColor, WHITE);
    gl.uniform3fv(nonTexUniforms.light.specularColor, WHITE);
    gl.uniform1f(nonTexUniforms.light.specularity, 20);
    const drawHand = function (height: number, width: number, length: number, angle: number) {
      const m = mat4.rotateZ(mat4.create(), modelMatrix, -angle);
      gl.uniformMatrix4fv(nonTexUniforms.matrices.model, false, m);
      gl.uniformMatrix4fv(nonTexUniforms.matrices.normal, false, m);
      drawWithoutTexture(makeHand(gl, height, width, length));
    };
    drawHand(0.01, 0.02, 0.6, theta); // Hours
    drawHand(0.02, 0.02, 0.8, 12 * theta); // Minutes
    // #endregion

    // #region Hubcap
    gl.useProgram(nonTexProgram);
    gl.uniformMatrix4fv(nonTexUniforms.matrices.model, false, modelMatrix);
    gl.uniformMatrix4fv(nonTexUniforms.matrices.normal, false, modelMatrix);
    drawWithoutTexture(makeHubcap(gl, 0.03));
    // #endregion

    // #region Back of Case
    const m = mat4.rotateX(mat4.create(), mat4.translate(mat4.create(), modelMatrix, [0, 0, -H]), Math.PI);
    gl.uniformMatrix4fv(nonTexUniforms.matrices.model, false, mat4.scale(mat4.create(), m, [1.2, 1.2, 0.24]));
    gl.uniformMatrix4fv(nonTexUniforms.matrices.normal, false, mat4.scale(mat4.create(), m, [1 / 1.2, 1 / 1.2, 1 / 0.24]));
    gl.uniform4fv(nonTexUniforms.color, [...GOLD, 1]);
    drawWithoutTexture(makeFrisbee(gl));
    gl.uniformMatrix4fv(nonTexUniforms.matrices.model, false, mat4.scale(mat4.create(), modelMatrix, [1.2, 1.2, 1]));
    gl.uniformMatrix4fv(nonTexUniforms.matrices.normal, false, mat4.scale(mat4.create(), modelMatrix, [1 / 1.2, 1 / 1.2, 1]));
    gl.uniform4fv(nonTexUniforms.color, [...GOLD, 1]);
    drawWithoutTexture(makeRim(gl));
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // WebGL1 has different requirements for power of 2 images
    // vs non power of 2 images so check if the image is a
    // power of 2 in both dimensions.
    if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
      // Yes, it's a power of 2. Generate mips.
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      // No, it's not a power of 2. Turn off mips and set
      // wrapping to clamp to edge.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
  };
  image.src = url;

  return texture;
}

function isPowerOf2(value: number) {
  return (value & (value - 1)) === 0;
}

function makeFrisbee(gl: WebGLRenderingContext): Actor {
  const topology: Primitive[] = [];
  const positions = [0, 0, R];
  const normals = [0, 0, 1];
  const colors = [...GOLD];

  let first = 0, v = 1;

  const r = R * Math.sin(STEP);
  const z = R * Math.cos(STEP);

  for (let f = -Math.PI; f < Math.PI + EPSILON; f += STEP, v++) {
    const x = r * Math.cos(f), y = r * Math.sin(f);

    positions.push(x, y, z);
    normals.push(x, y, z);
    colors.push(...GOLD);
  }

  topology.push({ mode: gl.TRIANGLE_FAN, first, count: v - first });
  first = v;

  for (let t = STEP; t < 0.5 * Math.PI - EPSILON; t += STEP) {
    const r0 = R * Math.sin(t), r1 = R * Math.sin(t + STEP);
    const z0 = R * Math.cos(t), z1 = R * Math.cos(t + STEP);

    for (let f = -Math.PI; f < Math.PI + EPSILON; f += STEP, v += 2) {
      const x0 = r0 * Math.cos(f), x1 = r1 * Math.cos(f);
      const y0 = r0 * Math.sin(f), y1 = r1 * Math.sin(f);

      positions.push(x0, y0, z0);
      normals.push(x0, y0, z0);
      colors.push(...GOLD);

      positions.push(x1, y1, z1);
      normals.push(x1, y1, z1);
      colors.push(...GOLD);
    }

    topology.push({ mode: gl.TRIANGLE_STRIP, first, count: v - first });
    first = v;
  }

  return {
    topology,
    positionBuffer: makeFloatBufferFromArray(gl, positions),
    normalBuffer: makeFloatBufferFromArray(gl, normals),
    colorBuffer: makeFloatBufferFromArray(gl, colors),
  };
}

function makeRim(gl: WebGLRenderingContext): Actor {
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

function makeDisc(gl: WebGLRenderingContext): Actor {
  const topology: Primitive[] = [];
  const positions = [0, 0, 0];
  const colors = [...SILVER];
  const normals = [0, 0, 1];
  const textureCoords = [0, 0];

  let first = 0, v = 1;
  for (let t = 0; t < 2 * Math.PI + EPSILON; t += STEP, v++) {
    const x = R * Math.cos(t);
    const y = R * Math.sin(t);
    positions.push(x, y, 0);
    normals.push(0, 0, 1);
    colors.push(...SILVER);
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

function makeHubcap(gl: WebGLRenderingContext, height: number): Actor {
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
  const count = positions.length / 3;
  return {
    topology: [{ mode: gl.TRIANGLE_FAN, first: 0, count }],
    positionBuffer: makeFloatBufferFromArray(gl, positions),
    normalBuffer: makeFloatBufferFromArray(gl, normals),
    colorBuffer: makeFloatBufferFromArray(gl, colors),
  };
}

function makeHand(gl: WebGLRenderingContext, height: number, width: number, length: number): Actor {
  return {
    topology: [{ mode: gl.TRIANGLE_STRIP, first: 0, count: 4 }],
    positionBuffer: makeFloatBufferFromArray(gl, [
      -width, -0.2 * length, height,
      +width, -0.2 * length, height,
      -width, length, height,
      +width, length, height,
    ]),
    normalBuffer: makeFloatBufferFromArray(gl, [
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ]),
    colorBuffer: makeFloatBufferFromArray(gl, [
      ...SILVER,
      ...SILVER,
      ...SILVER,
      ...SILVER,
    ]),
  };
}

function makeStrip(gl: WebGLRenderingContext, torsion: number, piece: number): Actor {
  const { positions, normals, colors, textureCoords } = makeStripArrays(torsion, piece);
  return {
    topology: [{ mode: gl.TRIANGLE_STRIP, first: 0, count: positions.length / 3 }],
    positionBuffer: makeFloatBufferFromArray(gl, positions),
    normalBuffer: makeFloatBufferFromArray(gl, normals),
    colorBuffer: makeFloatBufferFromArray(gl, colors),
    textureCoordBuffer: makeFloatBufferFromArray(gl, textureCoords),
  };
}

function makeStripArrays(theta: number, piece: number) {
  const textureCoords: number[] = [];
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const nTwists = 3;
  for (let s = 0.0; s < 1.001; s += 0.033333) {
    const t = (piece + s) * Math.PI;
    const tt = nTwists * 0.5 * (t - theta);
    const ct = Math.cos(t), st = Math.sin(t);
    const ctt = Math.cos(tt), stt = Math.sin(tt);
    // Position
    const r1 = R + H * Math.cos(tt);
    const r2 = R - H * Math.cos(tt);
    positions.push(r1 * Math.sin(t), r1 * Math.cos(t), -H * Math.sin(tt));
    positions.push(r2 * Math.sin(t), r2 * Math.cos(t), +H * Math.sin(tt));
    // Normal
    normals.push(-st * stt, -ct * stt, ct * ct * ctt + ctt * st * st);
    normals.push(-st * stt, -ct * stt, ct * ct * ctt + ctt * st * st);
    // Color
    const color = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      color[k] = (1 - s) * STRIP_COLORS[piece][k] + s * STRIP_COLORS[(piece + 1) % STRIP_COLORS.length][k];
    }
    colors.push(...color, ...color);
    // Texture Coordinates
    textureCoords.push(s, 0, s, 1);
  }
  return { positions, normals, colors, textureCoords };
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
  normalAttrib?: number,
  normalBuffer?: WebGLBuffer,
  texCoordAttrib?: number,
  texCoordBuffer?: WebGLBuffer,
) {
  bindAttribute(gl, positionAttrib, positionBuffer, 3, gl.FLOAT);
  if (normalBuffer && typeof normalAttrib === 'number') {
    bindAttribute(gl, normalAttrib, normalBuffer, 3, gl.FLOAT);
  }
  if (texCoordBuffer && typeof texCoordAttrib === 'number') {
    bindAttribute(gl, texCoordAttrib, texCoordBuffer, 2, gl.FLOAT);
  }
  try {
    for (const { mode, first, count } of topology) {
      gl.drawArrays(mode, first, count);
    }
  } finally {
    if (texCoordBuffer && typeof texCoordAttrib === 'number') {
      unbindAttribute(gl, texCoordAttrib);
    }
    if (normalBuffer && typeof normalAttrib === 'number') {
      unbindAttribute(gl, normalAttrib);
    }
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

function makeProgramWithoutTextureMapping(gl: WebGLRenderingContext): NonTextureMappingProgramInfo {
  // Uniform Names
  const U_PROJECTION_MATRIX = 'uProjectionMatrix';
  const U_VIEW_MATRIX = 'uViewMatrix';
  const U_MODEL_MATRIX = 'uModelMatrix';
  const U_NORMAL_MATRIX = 'uNormalMatrix';
  const U_LIGHT_DIRECTION = 'uLightDirection';
  const U_AMBIENT_COLOR = 'uCa';
  const U_DIFFUSE_COLOR = 'uCd';
  const U_SPECULAR_COLOR = 'uCs';
  const U_SPECULARITY = 'uSpecularity';
  const U_COLOR = 'uColor';
  // Attribute Names
  const A_POSITION = 'aPosition';
  const A_NORMAL = 'aNormal';
  // Varying Names
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
    // Varyings
    varying highp vec3 ${V_NORMAL};
    // Program
    void main(void) {
      ${V_NORMAL} = normalize(${U_VIEW_MATRIX} * ${U_NORMAL_MATRIX} * vec4(${A_NORMAL}, 0)).xyz;
      gl_Position = ${U_PROJECTION_MATRIX} * ${U_VIEW_MATRIX} * ${U_MODEL_MATRIX} * ${A_POSITION};
    }
  `;

  const fsSource = glsl`
    // Uniforms
    uniform highp vec3 ${U_LIGHT_DIRECTION};
    uniform lowp vec3 ${U_AMBIENT_COLOR};
    uniform lowp vec3 ${U_DIFFUSE_COLOR};
    uniform lowp vec3 ${U_SPECULAR_COLOR};
    uniform lowp float ${U_SPECULARITY};
    uniform lowp vec4 ${U_COLOR};
    // Varyings
    varying highp vec3 ${V_NORMAL};
    // Program
    void main(void) {
      // Apply lighting
      highp vec3 u = normalize(${U_LIGHT_DIRECTION});
      highp vec3 v = 2.0 * dot(u, ${V_NORMAL}) * ${V_NORMAL} - u; // Reflection direction
      lowp float Id = max(0.0, (gl_FrontFacing ? +1.0 : -1.0) * dot(u, ${V_NORMAL})); // Diffuse intensity
      lowp float Is = v[2] < 0.0 ? 0.0 : pow(v[2], ${U_SPECULARITY}); // Specular intensity
      lowp vec4 C = vec4(${U_AMBIENT_COLOR} + Id * ${U_DIFFUSE_COLOR} + Is * ${U_SPECULAR_COLOR}, 1.0); // Total incident light color
      gl_FragColor = C * ${U_COLOR};
    }
  `;

  const program = buildProgram(gl, vsSource, fsSource);

  return {
    program,
    attribs: {
      position: gl.getAttribLocation(program, A_POSITION),
      normal: gl.getAttribLocation(program, A_NORMAL),
    },
    uniforms: {
      matrices: {
        projection: getUniformLocation(gl, program, U_PROJECTION_MATRIX),
        view: getUniformLocation(gl, program, U_VIEW_MATRIX),
        model: getUniformLocation(gl, program, U_MODEL_MATRIX),
        normal: getUniformLocation(gl, program, U_NORMAL_MATRIX),
      },
      light: {
        direction: getUniformLocation(gl, program, U_LIGHT_DIRECTION),
        ambientColor: getUniformLocation(gl, program, U_AMBIENT_COLOR),
        diffuseColor: getUniformLocation(gl, program, U_DIFFUSE_COLOR),
        specularColor: getUniformLocation(gl, program, U_SPECULAR_COLOR),
        specularity: getUniformLocation(gl, program, U_SPECULARITY),
      },
      color: getUniformLocation(gl, program, U_COLOR),
    },
  };
}

function makeProgramWithTextureMapping(gl: WebGLRenderingContext): TextureMappingProgramInfo {
  // Uniform Names
  const U_PROJECTION_MATRIX = 'uProjectionMatrix';
  const U_VIEW_MATRIX = 'uViewMatrix';
  const U_MODEL_MATRIX = 'uModelMatrix';
  const U_NORMAL_MATRIX = 'uNormalMatrix';
  const U_TEXTURE_MATRIX = 'uTextureMatrix';
  const U_SAMPLER = 'uSampler';
  const U_LIGHT_DIRECTION = 'uLightDirection';
  const U_AMBIENT_COLOR = 'uCa';
  const U_DIFFUSE_COLOR = 'uCd';
  const U_SPECULAR_COLOR = 'uCs';
  const U_SPECULARITY = 'uSpecularity';
  const U_COLOR = 'uColor';
  // Attribute Names
  const A_POSITION = 'aPosition';
  const A_NORMAL = 'aNormal';
  const A_TEXTURE_COORDS = 'aTextureCoords';
  // Varying Names
  const V_NORMAL = 'vNormal';
  const V_TEXTURE_COORDS = 'vTextureCoords';

  const vsSource = glsl`
    // Attributes
    attribute vec4 ${A_POSITION};
    attribute vec3 ${A_NORMAL};
    attribute vec2 ${A_TEXTURE_COORDS};
    // Uniforms
    uniform mat4 ${U_PROJECTION_MATRIX};
    uniform mat4 ${U_VIEW_MATRIX};
    uniform mat4 ${U_MODEL_MATRIX};
    uniform mat4 ${U_NORMAL_MATRIX};
    uniform mat3 ${U_TEXTURE_MATRIX};
    // Varyings
    varying highp vec3 ${V_NORMAL};
    varying highp vec3 ${V_TEXTURE_COORDS};
    // Program
    void main(void) {
      gl_Position = ${U_PROJECTION_MATRIX} * ${U_VIEW_MATRIX} * ${U_MODEL_MATRIX} * ${A_POSITION};
      ${V_NORMAL} = normalize(${U_VIEW_MATRIX} * ${U_NORMAL_MATRIX} * vec4(${A_NORMAL}, 0)).xyz;
      ${V_TEXTURE_COORDS} = ${U_TEXTURE_MATRIX} * vec3(${A_TEXTURE_COORDS}, 1);
    }
  `;

  const fsSource = glsl`
    // Varyings
    varying highp vec3 ${V_NORMAL};
    varying highp vec3 ${V_TEXTURE_COORDS};
    // Uniforms
    uniform highp vec4 ${U_COLOR};
    uniform highp vec3 ${U_LIGHT_DIRECTION};
    uniform lowp vec3 ${U_AMBIENT_COLOR};
    uniform lowp vec3 ${U_DIFFUSE_COLOR};
    uniform lowp vec3 ${U_SPECULAR_COLOR};
    uniform lowp float ${U_SPECULARITY};
    uniform sampler2D ${U_SAMPLER};
    // Program
    void main(void) {
      // Apply lighting
      highp vec3 u = normalize(${U_LIGHT_DIRECTION}); // Light direction
      highp vec3 v = 2.0 * dot(u, ${V_NORMAL}) * ${V_NORMAL} - u; // Reflection direction
      lowp float Id = max(0.0, (gl_FrontFacing ? +1.0 : -1.0) * dot(u, ${V_NORMAL})); // Diffuse intensity
      lowp float Is = v[2] < 0.0 ? 0.0 : pow(v[2], ${U_SPECULARITY}); // Specular intensity
      lowp vec4 C = vec4(${U_AMBIENT_COLOR} + Id * ${U_DIFFUSE_COLOR} + Is * ${U_SPECULAR_COLOR}, 1.0); // Total incident light color
      gl_FragColor = C * ${U_COLOR} * texture2D(${U_SAMPLER}, ${V_TEXTURE_COORDS}.xy);
    }
  `;

  const program = buildProgram(gl, vsSource, fsSource);

  return {
    program,
    attribs: {
      position: gl.getAttribLocation(program, A_POSITION),
      normal: gl.getAttribLocation(program, A_NORMAL),
      textureCoords: gl.getAttribLocation(program, A_TEXTURE_COORDS),
    },
    uniforms: {
      matrices: {
        projection: getUniformLocation(gl, program, U_PROJECTION_MATRIX),
        view: getUniformLocation(gl, program, U_VIEW_MATRIX),
        model: getUniformLocation(gl, program, U_MODEL_MATRIX),
        normal: getUniformLocation(gl, program, U_NORMAL_MATRIX),
        texture: getUniformLocation(gl, program, U_TEXTURE_MATRIX),
      },
      light: {
        direction: getUniformLocation(gl, program, U_LIGHT_DIRECTION),
        ambientColor: getUniformLocation(gl, program, U_AMBIENT_COLOR),
        diffuseColor: getUniformLocation(gl, program, U_DIFFUSE_COLOR),
        specularColor: getUniformLocation(gl, program, U_SPECULAR_COLOR),
        specularity: getUniformLocation(gl, program, U_SPECULARITY),
      },
      sampler: getUniformLocation(gl, program, U_SAMPLER),
      color: getUniformLocation(gl, program, U_COLOR),
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

