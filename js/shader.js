/*
 * Home background: a dark "liquid metal" swirl in WebGL. Mostly black with
 * thin silver highlights. Rendered at reduced resolution and ~30 fps, paused
 * when hidden; a still frame under prefers-reduced-motion; a static CSS
 * gradient if WebGL is unavailable.
 */
(function (root) {
  var CA = root.CA = root.CA || {};

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var FRAG = [
    'precision mediump float;',
    'uniform vec2 r;uniform float t;',
    'float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    ' return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);',
    ' for(int i=0;i<4;i++){v+=a*n(p);p=m*p;a*=.5;}return v;}',
    'float field(vec2 p){',
    ' vec2 q=vec2(fbm(p+vec2(0.,t*.04)),fbm(p+vec2(5.2,1.3)-t*.03));',
    ' vec2 w=vec2(fbm(p+2.*q+vec2(1.7,9.2)+t*.05),fbm(p+2.*q+vec2(8.3,2.8)-t*.04));',
    ' return fbm(p+2.2*w);}',
    'void main(){',
    ' vec2 uv=(gl_FragCoord.xy-.5*r)/min(r.x,r.y);',
    ' vec2 p=uv*.9+vec2(.3,.1);',
    ' float f=field(p);',
    // swirl contours: thin bright lines where the warped field crosses bands
    ' float c=f*9.;',
    ' float d=abs(fract(c)-.5)*2.;',
    ' float line=pow(1.-d,18.);',
    ' float e=.02;',
    ' vec3 nrm=normalize(vec3(field(p+vec2(e,0.))-f,field(p+vec2(0.,e))-f,e*.6));',
    ' float spec=pow(max(dot(nrm,normalize(vec3(-.35,.5,1.))),0.),14.);',
    ' float sheen=smoothstep(.45,.75,f);',
    ' vec3 col=vec3(.01,.01,.012)+vec3(.05,.052,.058)*sheen;',
    ' col+=vec3(.82,.84,.88)*(line*(.2+.7*sheen)+spec*.2);',
    ' float vig=smoothstep(1.3,.2,length(uv));',
    ' col*=.3+.7*vig;',
    ' gl_FragColor=vec4(col,1.);}'
  ].join('\n');

  function init(canvas, fallbackEl) {
    var gl = null;
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'low-power' }) ||
           canvas.getContext('experimental-webgl');
    } catch (e) { gl = null; }

    function fail() {
      document.documentElement.classList.add('no-webgl');
      return { start: function () {}, stop: function () {} };
    }
    if (!gl) return fail();

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    }
    var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return fail();
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return fail();
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var uR = gl.getUniformLocation(prog, 'r'), uT = gl.getUniformLocation(prog, 't');

    var reduce = root.matchMedia('(prefers-reduced-motion: reduce)');
    var SCALE = 0.4;          // fraction of CSS pixels rendered
    var running = false, wanted = false, raf = 0, last = 0, t0 = performance.now(), elapsed = 0;

    function resize() {
      var w = Math.max(1, Math.round(canvas.clientWidth * SCALE));
      var h = Math.max(1, Math.round(canvas.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }
    function draw(time) {
      resize();
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return;  // ~30 fps is plenty for slow motion
      elapsed += Math.min(now - last, 100) / 1000;
      last = now;
      draw(elapsed + 20);
    }
    function update() {
      var go = wanted && document.visibilityState === 'visible';
      if (reduce.matches) {
        cancelAnimationFrame(raf); running = false;
        if (wanted) draw(24);  // still frame
        return;
      }
      if (go && !running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
      else if (!go && running) { running = false; cancelAnimationFrame(raf); }
    }

    document.addEventListener('visibilitychange', update);
    root.addEventListener('resize', function () { if (wanted) { resize(); if (!running) draw(elapsed + 20); } });
    if (reduce.addEventListener) reduce.addEventListener('change', update);
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); fail(); });

    draw(20);
    canvas.classList.add('ready');
    return {
      start: function () { wanted = true; update(); },
      stop: function () { wanted = false; update(); }
    };
  }

  CA.shader = { init: init };
})(window);
