// gl-utils.js — small WebGL1 helpers: column-major mat4 math, one lit/fogged
// shader program, and a builder that packs coloured, normalled triangles into
// GPU buffers. No library code; everything here is written for Island Hopper.

export function mat4Perspective(fovyRad, aspect, near, far) {
  const f = 1 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function mat4LookAt(eye, center, up) {
  const zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let len = Math.hypot(zx, zy, zz) || 1;
  const z = [zx / len, zy / len, zz / len];
  let xx = up[1] * z[2] - up[2] * z[1];
  let xy = up[2] * z[0] - up[0] * z[2];
  let xz = up[0] * z[1] - up[1] * z[0];
  len = Math.hypot(xx, xy, xz) || 1;
  const x = [xx / len, xy / len, xz / len];
  const y = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0],
  ];
  const out = new Float32Array(16);
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0];
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1];
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2];
  out[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  out[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  out[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  out[15] = 1;
  return out;
}

// Model matrix whose columns are the object's right, up and back axes plus
// its position — the layout the aircraft and ring code builds bases in.
export function mat4FromBasis(right, up, back, pos) {
  const out = new Float32Array(16);
  out[0] = right[0]; out[1] = right[1]; out[2] = right[2];
  out[4] = up[0]; out[5] = up[1]; out[6] = up[2];
  out[8] = back[0]; out[9] = back[1]; out[10] = back[2];
  out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2];
  out[15] = 1;
  return out;
}

export function mat4Translation(x, y, z) {
  const out = new Float32Array(16);
  out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}

export function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export function mat4RotateZ(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  const out = new Float32Array(16);
  out[0] = c; out[1] = s; out[5] = c; out[4] = -s; out[10] = 1; out[15] = 1;
  return out;
}

const VERT_SRC = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform float uUnlit;
varying vec3 vColor;
varying float vFogDepth;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vec4 view = uView * world;
  vec3 n = normalize(mat3(uModel) * aNormal);
  float shade = uUnlit > 0.5 ? 1.0 : 0.38 + 0.62 * max(dot(n, normalize(vec3(0.45, 0.8, 0.35))), 0.0);
  vColor = aColor * shade;
  vFogDepth = -view.z;
  gl_Position = uProj * view;
}`;

const FRAG_SRC = `
precision mediump float;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec3 vColor;
varying float vFogDepth;
void main() {
  float f = clamp((vFogDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(vColor, uFogColor, f * f), 1.0);
}`;

export function createProgram(gl) {
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(sh));
    }
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('link: ' + gl.getProgramInfoLog(prog));
  }
  return {
    prog,
    aPos: gl.getAttribLocation(prog, 'aPos'),
    aNormal: gl.getAttribLocation(prog, 'aNormal'),
    aColor: gl.getAttribLocation(prog, 'aColor'),
    uProj: gl.getUniformLocation(prog, 'uProj'),
    uView: gl.getUniformLocation(prog, 'uView'),
    uModel: gl.getUniformLocation(prog, 'uModel'),
    uUnlit: gl.getUniformLocation(prog, 'uUnlit'),
    uFogColor: gl.getUniformLocation(prog, 'uFogColor'),
    uFogNear: gl.getUniformLocation(prog, 'uFogNear'),
    uFogFar: gl.getUniformLocation(prog, 'uFogFar'),
  };
}

// Accumulates triangles as position/normal/colour triples, then uploads them
// as one static mesh. `quad` takes four corners (counter-clockwise seen from
// the lit side) and works out the flat normal itself.
export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
  }

  tri(a, b, c, color) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const p of [a, b, c]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx, ny, nz);
      this.colors.push(color[0], color[1], color[2]);
    }
  }

  quad(a, b, c, d, color) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  // Axis-aligned box centred at (x, y, z) with the given half extents.
  box(x, y, z, hx, hy, hz, color) {
    const x0 = x - hx, x1 = x + hx, y0 = y - hy, y1 = y + hy, z0 = z - hz, z1 = z + hz;
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], color); // top
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], color); // bottom
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], color); // north
    this.quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], color); // south
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], color); // east
    this.quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], color); // west
  }

  upload(gl) {
    const make = (data) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      return buf;
    };
    return {
      posBuf: make(this.positions),
      norBuf: make(this.normals),
      colBuf: make(this.colors),
      count: this.positions.length / 3,
    };
  }
}

export function drawMesh(gl, program, mesh, model, unlit) {
  gl.uniformMatrix4fv(program.uModel, false, model);
  gl.uniform1f(program.uUnlit, unlit ? 1 : 0);
  const bind = (buf, loc) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(loc);
  };
  bind(mesh.posBuf, program.aPos);
  bind(mesh.norBuf, program.aNormal);
  bind(mesh.colBuf, program.aColor);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
}
