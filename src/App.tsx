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

type TextureMappingProgramInfo = ProgramInfo & {
  attribs: {
    textureCoords: number;
  };
  uniforms: {
    sampler: WebGLSampler;
  };
};

const glsl = ([head, ...tail]: TemplateStringsArray, ...args: string[]) => tail.reduce((a, b, i) => a + args[i] + b, head);

const BLUE = [0, 0, 1];
const GREEN = [0, 1, 0];
const YELLOW = [1, 1, 0];
const RED = [1, 0, 0];

const COLORS = [BLUE, GREEN, YELLOW, RED];

export default function App() {

  const [theta, setTheta] = useState(0);
  const [anchor, setAnchor] = useState<{ x: number, y: number; } | null>();
  const [modelMatrix, setModelMatrix] = useState(mat4.create());

  const programWithTextureMapping: MutableRefObject<TextureMappingProgramInfo | null> = useRef(null);
  const programWithoutTextureMapping: MutableRefObject<ProgramInfo | null> = useRef(null);

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

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

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
      gl.uniformMatrix4fv(programWithTextureMapping.current.uniforms.modelMatrix, false, modelMatrix);
      gl.uniformMatrix4fv(programWithTextureMapping.current.uniforms.viewMatrix, false, viewMatrix);
      gl.uniformMatrix4fv(programWithTextureMapping.current.uniforms.projectionMatrix, false, projectionMatrix);
      for (let i = 0; i < 4; i++) {
        gl.uniform1i(texUniforms.sampler, i);
        bindAttributeToBuffer(gl, texAttribs.position, positionBuffers[i], 3, gl.FLOAT);
        bindAttributeToBuffer(gl, texAttribs.color, colorBuffers[i], 3, gl.FLOAT);
        bindAttributeToBuffer(gl, texAttribs.textureCoords, textureCoordBuffers[i], 2, gl.FLOAT);
        try {
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
    const drawHand = function (width: number, length: number, angle: number) {
      const { vertexCount, positions: positionBuffer, colors: colorBuffer } = makeHandBuffers(gl, width, length);
      try {
        gl.useProgram(nonTexProgram);
        gl.uniformMatrix4fv(nonTexUniforms.modelMatrix, false, mat4.rotateZ(mat4.create(), modelMatrix, -angle));
        gl.uniformMatrix4fv(nonTexUniforms.viewMatrix, false, viewMatrix);
        gl.uniformMatrix4fv(nonTexUniforms.projectionMatrix, false, projectionMatrix);
        bindAttributeToBuffer(gl, nonTexAttribs.position, positionBuffer, 3, gl.FLOAT);
        bindAttributeToBuffer(gl, nonTexAttribs.color, colorBuffer, 3, gl.FLOAT);
        try {
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, vertexCount);
        } finally {
          unbindAttribute(gl, nonTexAttribs.color);
          unbindAttribute(gl, nonTexAttribs.position);
        }
      } finally {
        gl.deleteBuffer(colorBuffer);
        gl.deleteBuffer(positionBuffer);
      }
    };

    drawHand(0.02, 0.6, theta); // Hours
    drawHand(0.02, 0.8, 12 * theta); // Minutes
    // #endregion

    // #region Hubcap
    const { vertexCount, positions, colors } = makeHubcapBuffers(gl);
    try {
      gl.useProgram(nonTexProgram);
      gl.uniformMatrix4fv(nonTexUniforms.modelMatrix, false, modelMatrix);
      gl.uniformMatrix4fv(nonTexUniforms.viewMatrix, false, viewMatrix);
      gl.uniformMatrix4fv(nonTexUniforms.projectionMatrix, false, projectionMatrix);
      bindAttributeToBuffer(gl, nonTexAttribs.position, positions, 3, gl.FLOAT);
      bindAttributeToBuffer(gl, nonTexAttribs.color, colors, 3, gl.FLOAT);
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
  const onPointerDown = ({ target, pointerId, clientX: x, clientY: y }: React.PointerEvent<HTMLCanvasElement>): void => {
    if (target instanceof Element) {
      target.setPointerCapture(pointerId);
    }
    setAnchor({ x, y });
  };

  const onPointerUp = ({ target, pointerId }: React.PointerEvent<HTMLCanvasElement>): void => {
    setAnchor(null);
    if (target instanceof Element) {
      target.releasePointerCapture(pointerId);
    }
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

function unbindAttribute(gl: WebGLRenderingContext, attrib: number) {
  gl.disableVertexAttribArray(attrib);
}

function makeHubcapBuffers(gl: WebGLRenderingContext) {
  const r = 0.05;
  const h = 0.01;
  const positions = [0, 0, h];
  for (let t = 0; t < 2 * Math.PI; t += Math.PI / 30) {
    positions.push(r * Math.cos(t), r * Math.sin(t), 0);
  }
  const vertexCount = positions.length / 3;
  return {
    vertexCount,
    positions: makeFloatBufferFromArray(gl, positions),
    colors: makeFloatBufferFromArray(gl, new Array(3 * vertexCount).fill(0.75)),
  };
}

function makeHandBuffers(gl: WebGLRenderingContext, width: number, length: number) {
  return {
    vertexCount: 4,
    positions: makeFloatBufferFromArray(gl, [
      -width, 0, 0,
      +width, 0, 0,
      -width, length, 0,
      +width, length, 0,
    ]),
    colors: makeFloatBufferFromArray(gl, [
      0.75, 0.75, 0.75,
      0.75, 0.75, 0.75,
      0.75, 0.75, 0.75,
      0.75, 0.75, 0.75,
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

function makeFloatBufferFromArray(gl: WebGLRenderingContext, positions: number[]) {
  const buffer = gl.createBuffer();
  if (!buffer) {
    throw new Error('Failed to create buffer.');
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  return buffer;
}

function makeStrip(theta: number, piece: number) {
  const textureCoords: number[] = [];
  const positions: number[] = [];
  const colors: number[] = [];
  const nTwists = 3;
  const R = 1.0;
  const h = 0.1;
  for (let s = 0.0; s < 1.001; s += 0.033333) {
    const t = (piece + s) * Math.PI;
    const tt = nTwists * 0.5 * (t - theta);
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

function makeProgramWithoutTextureMapping(gl: WebGLRenderingContext) {
  const U_MODEL_MATRIX = 'uModelMatrix';
  const U_VIEW_MATRIX = 'uViewMatrix';
  const U_PROJECTION_MATRIX = 'uProjectionMatrix';
  const A_POSITION = 'aPosition';
  const A_COLOR = 'aColor';
  const V_COLOR = 'vColor';

  const vsSource = glsl`
    // Attributes
    attribute vec4 ${A_POSITION};
    attribute vec4 ${A_COLOR};
    // Uniforms
    uniform mat4 ${U_MODEL_MATRIX};
    uniform mat4 ${U_VIEW_MATRIX};
    uniform mat4 ${U_PROJECTION_MATRIX};
    // Varyings
    varying lowp vec4 ${V_COLOR};
    // Program
    void main(void) {
      gl_Position = ${U_PROJECTION_MATRIX} * ${U_VIEW_MATRIX} * ${U_MODEL_MATRIX} * ${A_POSITION};
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

function getUniformLocation(gl: WebGLRenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  return gl.getUniformLocation(program, name) || error(`No uniform named "${name}" was found.`);
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

