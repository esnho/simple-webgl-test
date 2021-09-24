

const vs = `
attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec2 a_texcoord;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform mat4 u_world;

uniform sampler2D tex;			// texture one
uniform sampler2D tex2;			// texture two
uniform vec2 tres;			// size of texture (screen)
uniform vec4 fparams;			// 4 floats coming in 
uniform float ftime;			// 0.0 to 1.0
uniform int itime;			// increases when ftime hits 1.0

varying vec3 v_normal;

// https://github.com/dmnsgn/glsl-rotate/blob/master/rotation-3d-y.glsl
mat4 rotation3dY(float angle) {
	float s = sin(angle);
	float c = cos(angle);

	return mat4(
		  c,  0.0,   -s,  0.0,
		0.0,  1.0,  0.0,  0.0,
		  s,  0.0,    c,  0.0,
    0.0,  0.0,  0.0,  1.0
	);
}

void main(void) 
{	//Original simple
  vec2 textureCoord = a_texcoord;

  float time = float(itime) + ftime;
  
   // vec4  c   = texture2D(tex2,textureCoord);

   // time = time / 1000.0;

	// tcoord=textureCoord;

  // my demo code
  vec4 vertex = a_position;

  vec4 v = vertex;

  vec4 rotated = v * rotation3dY(sin(time + v.y) * 0.2);

  mat4 MVP = u_projection * u_view * u_world;

  vec4 Vert = MVP * rotated;

  // ncoord = normal;
  v_normal = mat3(u_world) * a_normal; // normal;
  gl_Position = Vert;
}
`;

const basic = `
attribute vec4 vertex;
attribute vec4 normal;
attribute vec2 textureCoord;
varying vec4 ncoord;
varying vec4 vcoord;

varying vec2 tcoord;			// 
uniform sampler2D tex;			// texture one
uniform sampler2D tex2;			// texture two
uniform vec2 tres;			// size of texture (screen)
uniform vec4 fparams;			// 4 floats coming in 
uniform float ftime;			// 0.0 to 1.0
uniform int itime;			// increases when ftime hits 1.0

uniform mat4 MVP;
//f1::

#define PI 3.1415926535897932384626
float time = float(itime) + ftime;

void main(void) 
{	//Original simple
   vec4  c   = texture2D(tex2,textureCoord);

   time = time / 1000.0;

	tcoord=textureCoord;

   vec4 v = vertex;

   vec4 Vert = MVP * v;

   ncoord = normal;
   gl_Position = Vert;
}
`;  

const fs = `
precision mediump float;

varying vec3 v_normal;

uniform vec4 u_diffuse;
uniform vec3 u_lightDirection;

void main () {
  vec3 normal = normalize(v_normal);
  float fakeLight = dot(u_lightDirection, normal) * .5 + .5;
  gl_FragColor = vec4(u_diffuse.rgb * fakeLight, u_diffuse.a);
}
`;

// This is not a full .obj parser.
// see http://paulbourke.net/dataformats/obj/

function parseOBJ(text) {
  // because indices are base 1 let's just fill in the 0th data
  const objPositions = [[0, 0, 0]];
  const objTexcoords = [[0, 0]];
  const objNormals = [[0, 0, 0]];

  // same order as `f` indices
  const objVertexData = [
    objPositions,
    objTexcoords,
    objNormals,
  ];

  // same order as `f` indices
  let webglVertexData = [
    [],   // positions
    [],   // texcoords
    [],   // normals
  ];

  function newGeometry() {
    // If there is an existing geometry and it's
    // not empty then start a new one.
    if (geometry && geometry.data.position.length) {
      geometry = undefined;
    }
    setGeometry();
  }

  function addVertex(vert) {
    const ptn = vert.split('/');
    ptn.forEach((objIndexStr, i) => {
      if (!objIndexStr) {
        return;
      }
      const objIndex = parseInt(objIndexStr);
      const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
      webglVertexData[i].push(...objVertexData[i][index]);
    });
  }

  const keywords = {
    v(parts) {
      objPositions.push(parts.map(parseFloat));
    },
    vn(parts) {
      objNormals.push(parts.map(parseFloat));
    },
    vt(parts) {
      // should check for missing v and extra w?
      objTexcoords.push(parts.map(parseFloat));
    },
    f(parts) {
      const numTriangles = parts.length - 2;
      for (let tri = 0; tri < numTriangles; ++tri) {
        addVertex(parts[0]);
        addVertex(parts[tri + 1]);
        addVertex(parts[tri + 2]);
      }
    },
  };

  const keywordRE = /(\w*)(?: )*(.*)/;
  const lines = text.split('\n');
  for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
    const line = lines[lineNo].trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const m = keywordRE.exec(line);
    if (!m) {
      continue;
    }
    const [, keyword, unparsedArgs] = m;
    const parts = line.split(/\s+/).slice(1);
    const handler = keywords[keyword];
    if (!handler) {
      console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
      continue;
    }
    handler(parts, unparsedArgs);
  }

  return {
    position: webglVertexData[0],
    texcoord: webglVertexData[1],
    normal: webglVertexData[2],
  };
}

async function main() {
  // Get A WebGL context
  /** @type {HTMLCanvasElement} */
  const canvas = document.querySelector("#canvas");
  console.log(canvas)
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    return;
  }


  // compiles and links the shaders, looks up attribute and uniform locations
  const meshProgramInfo = webglUtils.createProgramInfo(gl, [vs, fs]);

  const response = await fetch('https://webglfundamentals.org/webgl/resources/models/chair/chair.obj');  
  const text = await response.text();
  const data = parseOBJ(text);

  // Because data is just named arrays like this
  //
  // {
  //   position: [...],
  //   texcoord: [...],
  //   normal: [...],
  // }
  //
  // and because those names match the attributes in our vertex
  // shader we can pass it directly into `createBufferInfoFromArrays`
  // from the article "less code more fun".

  // create a buffer for each array by calling
  // gl.createBuffer, gl.bindBuffer, gl.bufferData
  const bufferInfo = webglUtils.createBufferInfoFromArrays(gl, data);

  const cameraTarget = [0, 5, 0];
  const cameraPosition = [0, 5, 12];
  const zNear = 0.1;
  const zFar = 50;

  function degToRad(deg) {
    return deg * Math.PI / 180;
  }

  function render(time) {
    time *= 0.001;  // convert to seconds

    webglUtils.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);

    const fieldOfViewRadians = degToRad(60);
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

    const up = [0, 1, 0];
    // Compute the camera's matrix using look at.
    const camera = m4.lookAt(cameraPosition, cameraTarget, up);

    // Make a view matrix from the camera matrix.
    const view = m4.inverse(camera);

    const sharedUniforms = {
      u_lightDirection: m4.normalize([-1, 3, 5]),
      u_view: view,
      u_projection: projection,
      ftime: time - Math.floor(time),
      itime: Math.floor(time),
    };

    gl.useProgram(meshProgramInfo.program);

    // calls gl.uniform
    webglUtils.setUniforms(meshProgramInfo, sharedUniforms);

    // calls gl.bindBuffer, gl.enableVertexAttribArray, gl.vertexAttribPointer
    webglUtils.setBuffersAndAttributes(gl, meshProgramInfo, bufferInfo);

    // calls gl.uniform
    webglUtils.setUniforms(meshProgramInfo, {
      u_world: m4.yRotation(time * 0.2), // m4.identity(),
      u_diffuse: [1, 0.7, 0.5, 1],
    });

    // calls gl.drawArrays or gl.drawElements
    webglUtils.drawBufferInfo(gl, bufferInfo);

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
}

main();