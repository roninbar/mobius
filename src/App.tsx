/* eslint-disable one-var */
/* eslint-disable no-bitwise */

import { mat3, mat4, vec3 } from 'gl-matrix';
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
    };
    color: WebGLUniformLocation;
    light: {
      direction: WebGLUniformLocation;
      specularColor: WebGLUniformLocation;
      specularity: WebGLUniformLocation;
    };
  };
}

type SimpleProgramInfo = ProgramInfo & {
  attribs: {
  };
  uniforms: {
    light: {
      ambientColor: WebGLUniformLocation;
      diffuseColor: WebGLUniformLocation;
    };
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
    light: {
      ambientColor: WebGLUniformLocation;
      diffuseColor: WebGLUniformLocation;
    };
    sampler: WebGLSampler;
  };
};

type CubeMappingProgramInfo = ProgramInfo & {
  uniforms: {
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

const LIGHTDIR = [0.85, 1.0, 0.75];

const BLACK = [0, 0, 0];
const BLUE = [0, 0, 1];
const GREEN = [0, 0.75, 0];
const RED = [1, 0, 0];
const GOLD = [1.0, 0.8, 0.5];
const SILVER = [0.75, 0.75, 0.75];
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

  const simpleProgramInfo: MutableRefObject<SimpleProgramInfo | null> = useRef(null);
  const textureMappingProgramInfo: MutableRefObject<TextureMappingProgramInfo | null> = useRef(null);
  const cubeMappingProgramInfo: MutableRefObject<CubeMappingProgramInfo | null> = useRef(null);

  const canvas = useRef<HTMLCanvasElement>(null);

  // #region Initialize WebGL stuff and start the animation.
  useEffect(function () {

    const gl = canvas.current?.getContext('webgl');

    if (!gl) {
      throw new Error('Failed to get a WebGL context.');
    }

    const loadAllTexturesAsync = async function () {
      const promises: Promise<void>[] = [];

      // Hours
      for (const unit of [gl.TEXTURE20, gl.TEXTURE21, gl.TEXTURE22, gl.TEXTURE23]) {
        gl.activeTexture(unit);
        const texPiece = gl.createTexture();
        if (!texPiece) {
          throw new Error('Failed to create texture.');
        }
        gl.bindTexture(gl.TEXTURE_2D, texPiece);
        promises.push(loadTextureAsync(gl, `${process.env.PUBLIC_URL}/texture/hours${unit - gl.TEXTURE20}.bmp`));
      }

      // Portrait of Mobius
      gl.activeTexture(gl.TEXTURE10);
      const texPortrait = gl.createTexture();
      if (!texPortrait) {
        throw new Error('Failed to create texture.');
      }
      gl.bindTexture(gl.TEXTURE_2D, texPortrait);
      promises.push(loadTextureAsync(gl, `${process.env.PUBLIC_URL}/texture/mobius.png`));

      // Environment
      gl.activeTexture(gl.TEXTURE0);
      const texEnv = gl.createTexture();
      if (!texEnv) {
        throw new Error('Failed to create texture.');
      }
      for (const axis of ['X', 'Y', 'Z']) {
        for (const sign of ['NEGATIVE', 'POSITIVE']) {
          gl.bindTexture(gl.TEXTURE_CUBE_MAP, texEnv);
          promises.push(
            loadTextureAsync(gl, `${process.env.PUBLIC_URL}/texture/env/${sign.slice(0, 3).toLowerCase()}-${axis.toLowerCase()}.jpg`, `TEXTURE_CUBE_MAP_${sign as 'POSITIVE' | 'NEGATIVE'}_${axis as 'X' | 'Y' | 'Z'}`),
          );
        }
      }

      return Promise.all(promises);
    };

    const { program: simpleProgram, uniforms: simpleUniforms } = simpleProgramInfo.current = makeSimpleProgram(gl);
    const { program: texProgram, uniforms: texUniforms } = textureMappingProgramInfo.current = makeTextureMappingProgram(gl);
    const { program: cubeProgram, uniforms: cubeUniforms } = cubeMappingProgramInfo.current = makeCubeMappingProgram(gl);

    gl.useProgram(simpleProgram);
    gl.uniform3fv(simpleUniforms.light.direction, LIGHTDIR);
    gl.uniform3fv(simpleUniforms.light.ambientColor, WHITE25);
    gl.uniform3fv(simpleUniforms.light.diffuseColor, WHITE);
    gl.uniform3fv(simpleUniforms.light.specularColor, WHITE);
    gl.uniform1f(simpleUniforms.light.specularity, 10);

    gl.useProgram(texProgram);
    gl.uniform3fv(texUniforms.light.direction, LIGHTDIR);
    gl.uniform3fv(texUniforms.light.ambientColor, WHITE25);
    gl.uniform3fv(texUniforms.light.diffuseColor, WHITE);
    gl.uniform3fv(texUniforms.light.specularColor, WHITE);
    gl.uniform1f(texUniforms.light.specularity, 10);

    gl.useProgram(cubeProgram);
    gl.uniform3fv(cubeUniforms.light.direction, LIGHTDIR);
    gl.uniform3fv(cubeUniforms.light.specularColor, WHITE);
    gl.uniform1f(cubeUniforms.light.specularity, 10);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1);
    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    loadAllTexturesAsync().then(function () {
      gl.activeTexture(gl.TEXTURE0);
      gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

      for (const unit of [gl.TEXTURE10, gl.TEXTURE20, gl.TEXTURE21, gl.TEXTURE22, gl.TEXTURE23]) {
        gl.activeTexture(unit);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      }
    });

    let afid = requestAnimationFrame(function f(time) {
      // setTheta(time / 12000 * Math.PI);
      const now = new Date();
      setTheta(((now.getSeconds() / 60 + now.getMinutes()) / 60 + now.getHours()) / 6 * Math.PI);
      afid = requestAnimationFrame(f);
    });

    return () => {
      cancelAnimationFrame(afid);
    };

  }, []);
  // #endregion

  // #region Render one frame.
  useEffect(function () {

    const gl = canvas.current?.getContext('webgl');

    if (!gl) {
      throw new Error('Failed to get a WebGL context.');
    }

    if (!simpleProgramInfo.current || !textureMappingProgramInfo.current || !cubeMappingProgramInfo.current) {
      throw new Error('Missing shader program!');
    }

    const { program: simpleProgram, attribs: simpleAttribs, uniforms: simpleUniforms } = simpleProgramInfo.current;
    const { program: texProgram, attribs: texAttribs, uniforms: texUniforms } = textureMappingProgramInfo.current;
    const { program: cubeProgram, attribs: cubeAttribs, uniforms: cubeUniforms } = cubeMappingProgramInfo.current;

    const projectionMatrix = mat4.perspective(mat4.create(), Math.PI / 5, gl.canvas.width / gl.canvas.height, 0.1, 100);
    const viewMatrix = mat4.fromTranslation(mat4.create(), [0, 0, -4]);
    const textureMatrix = mat3.create();

    gl.useProgram(simpleProgram);
    gl.uniformMatrix4fv(simpleUniforms.matrices.projection, false, projectionMatrix);
    gl.uniformMatrix4fv(simpleUniforms.matrices.view, false, viewMatrix);

    gl.useProgram(texProgram);
    gl.uniformMatrix4fv(texUniforms.matrices.projection, false, projectionMatrix);
    gl.uniformMatrix4fv(texUniforms.matrices.view, false, viewMatrix);

    gl.useProgram(cubeProgram);
    gl.uniformMatrix4fv(cubeUniforms.matrices.projection, false, projectionMatrix);
    gl.uniformMatrix4fv(cubeUniforms.matrices.view, false, viewMatrix);

    const drawWithoutTexture = function ({ topology, positionBuffer, normalBuffer, colorBuffer }: Actor) {
      try {
        drawArrays(gl, topology, simpleAttribs.position, positionBuffer, simpleAttribs.normal, normalBuffer);
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

    const drawWithCubeMapping = function ({ topology, positionBuffer, normalBuffer }: Actor) {
      try {
        drawArrays(gl, topology, cubeAttribs.position, positionBuffer, cubeAttribs.normal, normalBuffer);
      } finally {
        if (normalBuffer) gl.deleteBuffer(normalBuffer);
        if (positionBuffer) gl.deleteBuffer(positionBuffer);
      }
    };

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.cullFace(gl.FRONT);

    // #region Inside of Rim
    gl.useProgram(simpleProgram);
    gl.uniformMatrix4fv(simpleUniforms.matrices.model, false, mat4.scale(mat4.create(), modelMatrix, [1.2, 1.2, 1]));
    gl.uniformMatrix4fv(simpleUniforms.matrices.normal, false, mat4.scale(mat4.create(), modelMatrix, [1 / 1.2, 1 / 1.2, 1]));
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
    gl.uniform1f(texUniforms.light.specularity, 12);
    gl.uniform4fv(texUniforms.color, [...GOLD, 1]);
    gl.uniformMatrix4fv(texUniforms.matrices.model, false, modelMatrix);
    gl.uniformMatrix3fv(texUniforms.matrices.texture, false, textureMatrix);
    for (let i = 0; i < 4; i++) {
      gl.uniform1i(texUniforms.sampler, 20 + i);
      drawWithTexture(makeStrip(gl, theta, i));
    }
    // #endregion

    // #region Hands
    gl.useProgram(simpleProgram);
    gl.uniform3fv(simpleUniforms.light.direction, LIGHTDIR);
    gl.uniform3fv(simpleUniforms.light.ambientColor, WHITE25);
    gl.uniform3fv(simpleUniforms.light.diffuseColor, WHITE);
    gl.uniform3fv(simpleUniforms.light.specularColor, BLACK);
    const drawHand = function (height: number, width: number, length: number, angle: number) {
      const m = mat4.rotateZ(mat4.create(), modelMatrix, -angle);
      gl.uniformMatrix4fv(simpleUniforms.matrices.model, false, m);
      gl.uniformMatrix4fv(simpleUniforms.matrices.normal, false, m);
      drawWithoutTexture(makeHand(gl, height, width, length));
    };
    gl.uniform1f(simpleUniforms.light.specularity, 1);
    gl.uniform4fv(simpleUniforms.color, [...BLUE, 1]);
    drawHand(0.03, 0.02, 0.6, theta); // Hours
    gl.uniform4fv(simpleUniforms.color, [...GREEN, 1]);
    drawHand(0.06, 0.02, 0.8, theta * 12); // Minutes
    gl.uniform4fv(simpleUniforms.color, [...RED, 1]);
    drawHand(0.09, 0.01, 0.85, theta * 12 * 60); // Seconds
    // #endregion

    // #region Hubcap
    gl.useProgram(simpleProgram);
    gl.uniformMatrix4fv(simpleUniforms.matrices.model, false, modelMatrix);
    gl.uniformMatrix4fv(simpleUniforms.matrices.normal, false, modelMatrix);
    gl.uniform3fv(simpleUniforms.light.specularColor, WHITE);
    gl.uniform1f(simpleUniforms.light.specularity, 10);
    gl.uniform4fv(simpleUniforms.color, [...RED, 1]);
    drawWithoutTexture(makeHubcap(gl, 0.12));
    // #endregion

    gl.useProgram(simpleProgram);
    gl.uniform4fv(simpleUniforms.color, [...GOLD, 1]);
    gl.uniform1f(simpleUniforms.light.specularity, 32);

    // #region Back of Case
    {
      const m = mat4.rotateX(mat4.create(), mat4.translate(mat4.create(), modelMatrix, [0, 0, -H]), Math.PI);
      gl.useProgram(simpleProgram);
      gl.uniformMatrix4fv(simpleUniforms.matrices.model, false, mat4.scale(mat4.create(), m, [1.2, 1.2, 0.24]));
      gl.uniformMatrix4fv(simpleUniforms.matrices.normal, false, mat4.scale(mat4.create(), m, [1 / 1.2, 1 / 1.2, 1 / 0.24]));
      drawWithoutTexture(makeFrisbee(gl));
    }
    // #endregion

    // #region Outside of Rim
    {
      const scale = vec3.fromValues(1.2, 1.2, 1);
      gl.useProgram(simpleProgram);
      gl.uniformMatrix4fv(simpleUniforms.matrices.model, false, mat4.scale(mat4.create(), modelMatrix, scale));
      gl.uniformMatrix4fv(simpleUniforms.matrices.normal, false, mat4.scale(mat4.create(), modelMatrix, vec3.inverse(vec3.create(), scale)));
      drawWithoutTexture(makeRim(gl));
    }
    // #endregion

    // #region Front of Case (glass)
    {
      const m = mat4.translate(mat4.create(), modelMatrix, [0, 0, +H]);
      const scale = vec3.fromValues(1.2, 1.2, 0.24);
      gl.useProgram(cubeProgram);
      gl.uniformMatrix4fv(cubeUniforms.matrices.model, false, mat4.scale(mat4.create(), m, scale));
      gl.uniformMatrix4fv(cubeUniforms.matrices.normal, false, mat4.scale(mat4.create(), m, vec3.inverse(vec3.create(), scale)));
      gl.uniform4fv(cubeUniforms.color, [...WHITE, 0.25]);
      gl.uniform1f(cubeUniforms.light.specularity, 128);
      gl.uniform1i(cubeUniforms.sampler, 0);
      drawWithCubeMapping(makeFrisbee(gl));
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

function loadTextureAsync(
  gl: WebGLRenderingContext,
  url: string,
  target: 'TEXTURE_2D' | `TEXTURE_CUBE_MAP_${'POSITIVE' | 'NEGATIVE'}_${'X' | 'Y' | 'Z'}` = 'TEXTURE_2D'
): Promise<void> {
  return new Promise(function (resolve) {
    const unit = gl.getParameter(gl.ACTIVE_TEXTURE);
    const image = new Image();
    image.src = url;
    image.addEventListener('load', function () {
      gl.activeTexture(unit);
      gl.texImage2D(gl[target], 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      return resolve();
    });
  });
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

function makeSimpleProgram(gl: WebGLRenderingContext): SimpleProgramInfo {
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
    uniform lowp vec4 ${U_COLOR};
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
      highp vec3 n = normalize(${V_NORMAL});
      highp vec3 u = normalize(${U_LIGHT_DIRECTION});
      highp vec3 v = -reflect(u, n); // Reflection direction
      lowp float Id = max(0.0, (gl_FrontFacing ? +1.0 : -1.0) * dot(u, n)); // Diffuse intensity
      lowp float Is = v[2] < 0.0 ? 0.0 : pow(v[2], ${U_SPECULARITY}); // Specular intensity
      gl_FragColor = ${U_COLOR} * vec4(${U_AMBIENT_COLOR} + Id * ${U_DIFFUSE_COLOR}, 1.0) + Is * vec4(${U_SPECULAR_COLOR}, 1.0);
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

function makeTextureMappingProgram(gl: WebGLRenderingContext): TextureMappingProgramInfo {
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
      gl_FragColor = ${U_COLOR} * texture2D(${U_SAMPLER}, ${V_TEXTURE_COORDS}.xy) * vec4(${U_AMBIENT_COLOR} + Id * ${U_DIFFUSE_COLOR}, 1.0) + Is * vec4(${U_SPECULAR_COLOR}, 1.0);
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

function makeCubeMappingProgram(gl: WebGLRenderingContext) {
  // Uniform Names
  const U_PROJECTION_MATRIX = 'uProjectionMatrix';
  const U_VIEW_MATRIX = 'uViewMatrix';
  const U_MODEL_MATRIX = 'uModelMatrix';
  const U_NORMAL_MATRIX = 'uNormalMatrix';
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
  // Varying Names
  const V_NORMAL = 'vNormal';

  const vsSource = glsl`
    // Uniforms
    uniform mat4 ${U_PROJECTION_MATRIX};
    uniform mat4 ${U_VIEW_MATRIX};
    uniform mat4 ${U_MODEL_MATRIX};
    uniform mat4 ${U_NORMAL_MATRIX};
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
    uniform highp vec4 ${U_COLOR};
    uniform highp vec3 ${U_LIGHT_DIRECTION};
    uniform lowp vec3 ${U_AMBIENT_COLOR};
    uniform lowp vec3 ${U_DIFFUSE_COLOR};
    uniform lowp vec3 ${U_SPECULAR_COLOR};
    uniform lowp float ${U_SPECULARITY};
    uniform samplerCube ${U_SAMPLER};
    // Varyings
    varying highp vec3 ${V_NORMAL};
    // Program
    void main(void) {
      highp vec3 n = normalize(${V_NORMAL});
      highp vec3 u = normalize(${U_LIGHT_DIRECTION});
      highp vec3 v = -reflect(u, n);
      highp vec3 w = -reflect(vec3(0, 0, 1), n);
      lowp float Ir = 1.0 - pow(max(0.0, (gl_FrontFacing ? +1.0 : -1.0) * n.z), 10.0); // Reflection intensity
      lowp float Is = v.z < 0.0 ? 0.0 : pow(v.z, ${U_SPECULARITY}); // Specular intensity
      gl_FragColor = Ir * ${U_COLOR} * textureCube(${U_SAMPLER}, w) + Is * vec4(${U_SPECULAR_COLOR}, 1.0);

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
      color: getUniformLocation(gl, program, U_COLOR),
      light: {
        direction: getUniformLocation(gl, program, U_LIGHT_DIRECTION),
        specularColor: getUniformLocation(gl, program, U_SPECULAR_COLOR),
        specularity: getUniformLocation(gl, program, U_SPECULARITY),
      },
      sampler: getUniformLocation(gl, program, U_SAMPLER),
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

