(this.webpackJsonpmobius=this.webpackJsonpmobius||[]).push([[0],{17:function(r,e,t){r.exports=t(24)},22:function(r,e,t){},23:function(r,e,t){},24:function(r,e,t){"use strict";t.r(e);var o,a,n=t(0),i=t.n(n),c=t(8),u=t.n(c),l=t(4),s=t(5),f=t(6),h=t(2),v=(t(22),function(r){return Object(f.a)(r,1)[0]}),d=[[0,0,1],[0,1,0],[1,1,0],[1,0,0]];function p(){var r=Object(n.useState)(0),e=Object(f.a)(r,2),t=e[0],c=e[1];Object(n.useEffect)((function(){var r=setInterval((function(){var r=Date.now();c(r/100%100*Math.PI/50)}),100);return function(){return clearInterval(r)}}),[]);var u=Object(n.useRef)(null);return Object(n.useEffect)((function(){var r,e=null===(r=u.current)||void 0===r?void 0:r.getContext("webgl");if(!e)throw new Error("Failed to get a WebGL context.");var n=b(e,t,0),i=n.positions,c=n.colors,s=n.count,f=b(e,t,2),d=f.positions,p=f.colors,g=f.count,E=function(r){var e=v(o||(o=Object(l.a)(["\n    attribute vec4 aVertexPosition;\n    attribute vec4 aVertexColor;\n    uniform mat4 uModelViewMatrix;\n    uniform mat4 uProjectionMatrix;\n    varying lowp vec4 vColor;\n    void main(void) {\n      gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;\n      vColor = aVertexColor;\n    }\n  "]))),t=v(a||(a=Object(l.a)(["\n    varying lowp vec4 vColor;\n    void main(void) {\n      gl_FragColor = vColor;\n    }\n  "]))),n=r.createProgram();if(!n)throw new Error("Failed to create program.");if(r.attachShader(n,A(r,r.VERTEX_SHADER,e)),r.attachShader(n,A(r,r.FRAGMENT_SHADER,t)),r.linkProgram(n),!r.getProgramParameter(n,r.LINK_STATUS)){var i="Unable to initialize the shader program: ".concat(r.getProgramInfoLog(n));throw r.deleteProgram(n),new Error(i)}return{program:n,attribs:{position:r.getAttribLocation(n,"aVertexPosition"),color:r.getAttribLocation(n,"aVertexColor")},uniforms:{modelViewMatrix:r.getUniformLocation(n,"uModelViewMatrix"),projectionMatrix:r.getUniformLocation(n,"uProjectionMatrix")}}}(e),w=E.program,x=E.attribs,M=E.uniforms;e.useProgram(w),e.uniformMatrix4fv(M.modelViewMatrix,!1,function(r){var e=h.a.create();return h.a.translate(e,e,[0,0,-r]),e}(4)),e.uniformMatrix4fv(M.projectionMatrix,!1,function(r,e,t,o,a){var n=h.a.create();return h.a.perspective(n,t,r/e,o,a),n}(e.canvas.width,e.canvas.height,Math.PI/5,.1,100)),e.enable(e.DEPTH_TEST),e.depthFunc(e.LEQUAL),e.clearDepth(1),e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT|e.DEPTH_BUFFER_BIT),e.enable(e.CULL_FACE),e.cullFace(e.BACK),m(e,w,x.position,x.color,s/3,i,c),e.cullFace(e.FRONT),m(e,w,x.position,x.color,g/3,d,p)}),[t]),i.a.createElement("div",{className:"App"},i.a.createElement("header",{className:"App-header"},i.a.createElement("canvas",{width:"480px",height:"480px",ref:u}),i.a.createElement("p",null,"M\xf6bius Clock")))}function m(r,e,t,o,a,n,i){g(r,n,t),g(r,i,o),r.drawArrays(r.TRIANGLE_STRIP,0,a)}function g(r,e,t){r.bindBuffer(r.ARRAY_BUFFER,e),r.vertexAttribPointer(t,3,r.FLOAT,!1,0,0),r.enableVertexAttribArray(t)}function b(r,e,t){var o=function(r,e){for(var t=[],o=[],a=.1,n=0;n<2;n++)for(var i=0;i<1.001;i+=1/30){var c=(n+i)*Math.PI,u=1.5*c-r,l=Math.cos(c),f=Math.sin(c),h=Math.cos(u),v=Math.sin(u),p=1-a*h,m=1+a*h,g=-a*v,b=.1*v;t.push(m*f,m*l,b),t.push(p*f,p*l,g);for(var E=new Array(3).fill(0),A=0;A<3;A++)E[A]=(1-i)*d[e+n][A]+i*d[(e+n+1)%d.length][A];o.push.apply(o,Object(s.a)(E).concat(Object(s.a)(E)))}return{positions:t,colors:o}}(e,t),a=o.positions,n=o.colors;return{positions:E(r,a),colors:E(r,n),count:a.length}}function E(r,e){var t=r.createBuffer();if(!t)throw new Error("Failed to create position buffer.");return r.bindBuffer(r.ARRAY_BUFFER,t),r.bufferData(r.ARRAY_BUFFER,new Float32Array(e),r.STATIC_DRAW),t}function A(r,e,t){var o=r.createShader(e);if(!o)throw new Error("Failed to create shader.");if(r.shaderSource(o,t),r.compileShader(o),!r.getShaderParameter(o,r.COMPILE_STATUS)){var a="An error occurred compiling the shaders: ".concat(r.getShaderInfoLog(o));throw r.deleteShader(o),new Error(a)}return o}t(23);u.a.render(i.a.createElement(p,null),document.getElementById("root"))}},[[17,1,2]]]);
//# sourceMappingURL=main.b96545c5.chunk.js.map