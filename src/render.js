'use strict';
/* The world is one full-screen fragment shader over the terrain fields. The overlay canvas
   (draw.js) adds boats, piers, towns and labels on top. */

const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D uT, uN, uFog, uCur, uM;
uniform vec2 uRes, uCam, uBoat;
uniform float uRot, uScale, uCss, uTime, uTide, uStream, uVis, uW, uHc, uChartAll, uAtmo;
out vec4 outC;

const vec3 SUN = vec3(-0.55, -0.62, 0.56);

vec4 N4(vec2 p){ vec2 i = floor(p), f = p - i; f = f*f*(3.0 - 2.0*f); return texture(uN, (i + f + 0.5)/256.0)*2.0 - 1.0; }
vec4 R4(vec2 c){ return texelFetch(uN, ivec2(mod(c, 256.0)), 0); }

vec2 ROT(vec2 p){ return vec2(0.8*p.x - 0.6*p.y, 0.6*p.x + 0.8*p.y); }
float coastDisp(vec2 p, float e, float sd, float px){
  vec2 w = p + 22.0*vec2(N4(p/85.0).y, N4(p/85.0 + vec2(31.3, 17.7)).y);
  vec2 r = ROT(w), pr = ROT(p);
  float f3 = 1.0 - smoothstep(1.5, 4.0, px), f4 = 1.0 - smoothstep(0.7, 2.0, px);
  float n = 0.55*N4(w/70.0).x + 0.27*N4(r/34.0 + vec2(5.1, 0.0)).x + 0.14*N4(w/16.0 + vec2(0.0, 9.3)).x
          + 0.07*f3*N4(r/7.5 + vec2(3.7, 0.0)).x + 0.035*f4*N4(w/3.5 + vec2(0.0, 1.9)).x;
  float d = n*(2.5 + 13.0*e);
  float cr = 1.0 - abs(N4(r/26.0 + vec2(7.7, 0.0)).z);
  d += e*pow(cr, 6.0)*14.0*(1.0 - smoothstep(25.0, 70.0, -sd));
  d -= e*smoothstep(0.35, 0.6, e)*smoothstep(0.55, 0.8, N4(pr/13.0 + vec2(50.5, 0.0)).w)*70.0*(1.0 - smoothstep(10.0, 90.0, sd))*smoothstep(-5.0, 10.0, sd);
  return d;
}
float profileH(float d, float F, float e){
  float P;
  if (d < 0.0){ float u = -d; P = mix(0.055*u, 5.5*(1.0 - exp(-u/3.5)) + 0.12*u, e); }
  else P = -mix(0.022*d + 0.03, 9.0*(1.0 - exp(-d/5.0)) + 0.07*d, e);
  return mix(P, F, smoothstep(18.0, 140.0, abs(d)));
}
vec3 waterColour(float D, float b, float rem){
  vec3 c0 = mix(vec3(0.47, 0.76, 0.74), vec3(0.60, 0.87, 0.82), b);
  vec3 c1 = mix(vec3(0.25, 0.58, 0.66), vec3(0.30, 0.70, 0.74), b);
  vec3 col = mix(c0, c1, smoothstep(0.0, 3.0, D));
  col = mix(col, vec3(0.15, 0.44, 0.60), smoothstep(3.0, 12.0, D));
  col = mix(col, vec3(0.09, 0.29, 0.46), smoothstep(12.0, 40.0, D));
  col = mix(col, vec3(0.05, 0.16, 0.30), smoothstep(40.0, 170.0, D));
  return mix(col, vec3(0.20, 0.29, 0.35), rem*0.3);
}
vec4 treeLayer(vec2 p, vec2 lean, float dens, float cell, float jit, vec3 tint, float hmul, inout float shadow){
  vec2 cb = floor(p/cell);
  float bestZ = -1.0; vec4 res = vec4(0.0);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    vec2 cc = cb + vec2(float(i), float(j));
    vec4 r = R4(cc + vec2(hmul*37.0, 0.0));
    if (r.x > dens) continue;
    vec2 ctr = (cc + 0.5 + (r.yz - 0.5)*jit)*cell;
    float rad = cell*(0.30 + 0.22*r.w);
    float ht = (rad*2.2 + 2.5)*hmul;
    vec2 top = ctr + lean*ht;
    float ds = length(p - (ctr + vec2(0.62, 0.55)*ht*0.7))/rad;
    shadow = max(shadow, 1.0 - smoothstep(0.7, 1.05, ds));
    vec2 dv = (p - top)/rad; float dc = length(dv);
    if (dc < 1.0){
      float z = ht + sqrt(1.0 - dc*dc)*rad;
      if (z > bestZ){
        bestZ = z;
        vec3 n = vec3(dv, sqrt(max(0.0, 1.0 - dc*dc)));
        float lit = clamp(dot(n, normalize(SUN)), 0.0, 1.0);
        float leaf = N4(p/1.2 + cc*3.1).x;
        vec3 tc = tint*(0.85 + 0.3*r.w)*(0.52 + 0.72*lit + 0.14*leaf);
        tc = mix(tc, tc*0.62, smoothstep(0.72, 1.0, dc));
        res = vec4(tc, 1.0 - smoothstep(0.88, 1.0, dc));
      }
    }
  }
  return res;
}
float fogN(vec2 q){ q += 0.35*N4(q*0.6 + vec2(9.1, 2.7)).zw; vec2 r = vec2(0.8*q.x - 0.6*q.y, 0.6*q.x + 0.8*q.y); vec2 r2 = vec2(0.8*r.x - 0.6*r.y, 0.6*r.x + 0.8*r.y); return N4(q).x*0.55 + N4(r*2.03 + vec2(4.1, 1.3)).y*0.28 + N4(r2*4.1 + vec2(1.7, 8.3)).z*0.17; }
float bubble(vec2 p){ return smoothstep(uVis*0.42, uVis*1.25, distance(p, uBoat)); }
// One bank of fog at a height above the sea. Higher banks sit closer to the camera, so they
// slide past faster than the sea beneath and drop away as you zoom in under them.
vec3 fogLayer(vec3 col, vec2 off, float alt, float scale, vec2 drift, float lo, float hi, float op, vec3 fc, inout float shade){
  float f = 1.0 - alt/uHc;
  float fade = smoothstep(0.3, 0.6, f);
  if (fade <= 0.0) return col;
  vec2 p = uCam + off*f;
  float thick = smoothstep(lo, hi, texture(uT, p/uW).a);
  if (thick <= 0.001) return col;
  vec2 q = p/scale + drift*uTime;
  float n = fogN(q)*0.5 + 0.5;
  float cov = smoothstep(0.62 - 1.05*thick, 0.98 - 0.85*thick, n)*thick*bubble(p)*fade*op*uAtmo;
  vec3 c = fc*(0.9 + 0.16*n);
  shade = max(shade, cov);
  return mix(col, c, cov);
}

void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 so = (fc - 0.5*uRes)/uScale;
  float cs = cos(uRot), sn = sin(uRot);
  vec2 off = vec2(cs*so.x + sn*so.y, -sn*so.x + cs*so.y);
  vec2 wp0 = uCam + off;
  float px = 1.0/uCss, t = uTime;
  // a touch of parallax: high ground leans away from the middle of the screen
  vec2 wp = wp0;
  for (int i = 0; i < 2; i++){ float hh = clamp(texture(uT, wp/uW).g, 0.0, 220.0); wp = wp0 - off*(hh/uHc); }
  vec4 T = texture(uT, wp/uW);
  float sd = T.r, F = T.g, e = T.b, rem = T.a, b = 1.0 - e;
  float d = sd;
  if (abs(sd) < 260.0) d += coastDisp(wp, e, sd, px);
  float hd = profileH(d, F, e);
  float h = hd - uTide;
  // rock gets a craggy micro-relief for shading (it doesn't move the waterline)
  float fineP = 1.0 - smoothstep(0.25, 0.9, px);
  float rockMask = max(e*(1.0 - smoothstep(3.0, 14.0, hd)), smoothstep(-2.0, 12.0, sd))*step(-0.3, h);
  float crag = 0.0;
  if (fineP*rockMask > 0.0){ vec2 rp = ROT(wp); crag = (1.0 - abs(N4(rp/4.5 + vec2(3.3, 1.1)).x))*1.1 + (1.0 - abs(N4(wp/2.1).y))*0.5; }
  float hs = hd + crag*rockMask*fineP*1.4;
  // gradient: screen derivatives for the fine fractal relief, the texture for the broad shape
  vec2 gsd = vec2(dFdx(hs), -dFdy(hs))*uScale;
  vec2 gw = vec2(cs*gsd.x + sn*gsd.y, -sn*gsd.x + cs*gsd.y)*0.7;
  float dt = max(8.0, px*1.5);
  vec2 gT = vec2(texture(uT, (wp + vec2(dt, 0.0))/uW).g - texture(uT, (wp - vec2(dt, 0.0))/uW).g,
                 texture(uT, (wp + vec2(0.0, dt))/uW).g - texture(uT, (wp - vec2(0.0, dt))/uW).g)/(2.0*dt);
  float fineK = 1.0 - smoothstep(0.35, 1.6, px);
  vec2 g = mix(gT, gw, fineK*max(smoothstep(260.0, 60.0, abs(sd)), 0.5));
  float glen = length(g); if (glen > 2.0) g *= 2.0/glen;
  float slope = length(g);
  vec3 L = normalize(SUN);
  float zin = smoothstep(0.35, 1.3, uCss);
  vec3 col;
  vec4 M = texture(uM, wp/uW);
  if (h > 0.0){
    // ---- land ----
    vec3 ground = mix(vec3(0.58, 0.66, 0.40), vec3(0.70, 0.73, 0.47), smoothstep(-0.3, 0.4, N4(wp/260.0).y));
    ground = mix(ground, vec3(0.60, 0.57, 0.43), smoothstep(150.0, 250.0, hd));
    ground = mix(ground, vec3(0.73, 0.70, 0.63), smoothstep(270.0, 340.0, hd)*0.8);
    ground *= 0.94 + 0.12*N4(wp/23.0 + vec2(2.0, 0.0)).z*zin;
    float sand = b*(1.0 - smoothstep(0.35, 0.62, e))*(1.0 - smoothstep(1.3, 2.6, hd))*(1.0 - smoothstep(0.18, 0.45, slope));
    sand = clamp(sand*1.6, 0.0, 1.0);
    ground = mix(ground, vec3(0.91, 0.85, 0.67), sand);
    ground = mix(ground, vec3(0.76, 0.70, 0.56), sand*(1.0 - smoothstep(0.0, 0.45, h)));
    float rock = max(max(smoothstep(0.5, 1.05, slope), e*(1.0 - smoothstep(3.0, 13.0, hd))*(1.0 - sand)), smoothstep(-2.0, 12.0, sd));
    rock = clamp(rock + 0.35*N4(wp/9.0).x*rock, 0.0, 1.0);
    vec3 rc = mix(vec3(0.64, 0.61, 0.56), vec3(0.50, 0.47, 0.44), N4(wp/5.0 + 3.0).z*0.5 + 0.5);
    rc = mix(vec3(0.30, 0.29, 0.28), rc, smoothstep(0.0, 1.8, h));
    ground = mix(ground, rc, rock);
    // settlements: gardens and yards, and the roads' verges
    ground = mix(ground, vec3(0.74, 0.70, 0.60), M.r*0.35);
    // trees
    float fm = N4(wp/520.0).x*0.6 + N4(wp/210.0 + vec2(11.0, 3.0)).y*0.4;
    float clear = (1.0 - rock)*(1.0 - sand)*(1.0 - M.r*0.9)*(1.0 - M.g);
    float forest = smoothstep(-0.02, 0.22, fm)*smoothstep(7.0, 24.0, hd)*(1.0 - smoothstep(250.0, 310.0, hd))*clear;
    float grove = smoothstep(0.26, 0.4, N4(wp/330.0 + vec2(57.0, 0.0)).z)*smoothstep(5.0, 11.0, hd)*(1.0 - smoothstep(90.0, 130.0, hd))*(1.0 - forest)*clear;
    float scatter = 0.07*smoothstep(3.0, 8.0, hd)*clear*(1.0 - forest)*(1.0 - grove);
    vec3 n = normalize(vec3(-g, 1.0));
    float diff = dot(n, L);
    ground *= clamp(0.96 + 0.85*(diff - L.z), 0.42, 1.3);
    float shadow = 0.0;
    if (px < 1.6 && forest + grove + scatter > 0.01){
      vec2 lean = off/uHc*2.2;
      vec4 tr = treeLayer(wp, lean, max(forest*0.92, scatter), 6.5, 0.8, mix(vec3(0.24, 0.39, 0.21), vec3(0.20, 0.33, 0.24), step(120.0, hd)), 1.0, shadow);
      vec4 tg = treeLayer(wp, lean, grove*0.8, 5.0, 0.18, vec3(0.55, 0.61, 0.47), 0.72, shadow);
      if (tg.a > tr.a) tr = tg;
      ground *= 1.0 - 0.42*shadow*(1.0 - tr.a);
      vec3 withTrees = mix(ground, tr.rgb, tr.a);
      float far = smoothstep(0.9, 1.6, px);
      vec3 mass = mix(vec3(0.20, 0.33, 0.19), vec3(0.47, 0.53, 0.40), grove/(forest + grove + 0.001))*clamp(0.96 + 0.85*(diff - L.z), 0.42, 1.3);
      ground = mix(withTrees, mix(ground, mass, clamp(forest*1.1 + grove*0.8 + scatter, 0.0, 1.0)*0.9), far);
    } else if (forest + grove > 0.01){
      vec3 mass = mix(vec3(0.20, 0.33, 0.19), vec3(0.47, 0.53, 0.40), grove/(forest + grove + 0.001))*clamp(0.96 + 0.85*(diff - L.z), 0.42, 1.3);
      ground = mix(ground, mass*(0.9 + 0.2*N4(wp/40.0).x), clamp(forest*1.1 + grove*0.8, 0.0, 1.0)*0.9);
    }
    // contours, lightly
    float fwh = max(fwidth(hd), 1e-4);
    float lc = abs(fract(hd/25.0 + 0.5) - 0.5)*25.0/fwh;
    ground = mix(ground, ground*0.8, (1.0 - smoothstep(0.5, 1.3, lc))*0.3*step(10.0, hd));
    col = ground;
  } else {
    // ---- water ----
    float D = -h;
    col = waterColour(D, b, rem);
    float clr = exp(-D/mix(2.6, 6.0, b));
    vec3 bed = mix(vec3(0.82, 0.79, 0.62), vec3(0.36, 0.42, 0.36), clamp(e*1.2, 0.0, 1.0));
    bed *= 0.88 + 0.24*(N4(wp/8.0).x*0.5 + 0.5);
    bed *= 1.0 + 0.06*sin(dot(wp, vec2(0.8, 0.6))*1.2 + N4(wp/22.0).x*6.0)*b*zin;
    col = mix(col, bed, clr*0.5);
    // seabed relief shows through as soft light and shade in shallow water
    col *= 1.0 + 0.35*(dot(normalize(vec3(-g*1.3, 1.0)), L) - L.z)*(1.0 - smoothstep(4.0, 30.0, D));
    // caustics
    float cz = N4(wp/9.0 + vec2(t*0.3, t*0.19)).x + N4(wp/5.7 - vec2(t*0.24, -t*0.27)).y;
    col += pow(1.0 - min(1.0, abs(cz)), 8.0)*smoothstep(0.15, 0.9, D)*(1.0 - smoothstep(1.5, 7.0, D))*zin*0.18;
    // the surface: glints, and a long swell out in deep water
    vec2 q1 = wp/6.5 + vec2(t*0.33, t*0.21), q2 = wp/4.3 - vec2(t*0.26, -t*0.31);
    float gl = pow(max(0.0, N4(q1).x*0.55 + N4(q2).y*0.45), 7.0);
    col += gl*0.28*zin*(1.0 - 0.5*rem);
    vec2 swd = normalize(vec2(0.42, -0.9));
    float sw = sin(dot(wp, swd)/26.0 + t*1.1 + N4(wp/280.0).x*3.0);
    col *= 1.0 + 0.05*sw*smoothstep(8.0, 50.0, D)*(0.5 + rem);
    col *= 1.0 + 0.05*N4(wp/60.0 + vec2(t*0.02, 0.0)).x;
    // sheltered water: lapping lines; exposed: surf and foam on the rocks
    float lap = abs(fract(D*1.25 - t*0.11 + N4(wp/40.0).x*0.3) - 0.5);
    col = mix(col, vec3(0.97, 0.99, 1.0), (1.0 - smoothstep(0.02, 0.07, lap))*(1.0 - smoothstep(0.3, 1.6, D))*b*zin*0.45);
    col = mix(col, vec3(0.95, 0.97, 0.97), (1.0 - smoothstep(0.0, 0.45, D))*0.35);
    float fn = N4(wp/3.2 + vec2(t*0.6, -t*0.4)).x*0.6 + N4(wp/1.6 - vec2(t*0.9, t*0.7)).y*0.4;
    float band = 1.0 - smoothstep(0.0, 6.0 + 6.0*(N4(wp/30.0 + vec2(t*0.05, 0.0)).z*0.5 + 0.5), max(d, 0.0));
    float surge = 0.5 + 0.5*sin(t*1.25 - d*0.33 + N4(wp/60.0).x*4.0);
    float foam = smoothstep(0.08, 0.55, fn*0.5 + 0.5 + surge*0.35 - 0.25)*band*smoothstep(0.25, 0.8, e);
    col = mix(col, vec3(0.96, 0.98, 0.97), foam*0.85*mix(0.5, 1.0, zin));
    // chart: depth contours, faint, and ground that dries at low water
    float fw = max(fwidth(D), 1e-4);
    float cl = 0.0;
    for (int k = 0; k < 7; k++){ float c = k == 0 ? 2.0 : k == 1 ? 5.0 : k == 2 ? 10.0 : k == 3 ? 20.0 : k == 4 ? 50.0 : k == 5 ? 100.0 : 200.0; cl = max(cl, 1.0 - smoothstep(0.5, 1.4, abs(D - c)/fw)); }
    col = mix(col, col*0.72, cl*0.35);
    col = mix(col, vec3(0.62, 0.78, 0.68), smoothstep(-0.05, 0.4, hd)*0.3);
    // tidal stream: streaks that travel with the water
    vec2 cu = texture(uCur, wp/uW).rg*uStream;
    float sp = length(cu);
    if (sp > 0.5 && zin > 0.0){
      vec2 dir = cu/sp; float a = dot(wp, dir), bb = dot(wp, vec2(-dir.y, dir.x));
      float ph = t*0.35, p1 = fract(ph), p2 = fract(ph + 0.5);
      float n1 = N4(vec2((a - p1*sp*14.0)/18.0, bb/3.5)).x, n2 = N4(vec2((a - p2*sp*14.0)/18.0 + 7.3, bb/3.5 + 3.1)).x;
      col = mix(col, vec3(0.95, 0.98, 1.0), smoothstep(0.55, 0.9, mix(n1, n2, abs(1.0 - 2.0*p1)))*smoothstep(0.5, 2.5, sp)*zin*0.3);
    }
  }
  // the waterline, inked
  float fwl = max(fwidth(h), 1e-4);
  col = mix(col, vec3(0.20, 0.19, 0.17), (1.0 - smoothstep(0.6, 1.7, abs(h)/fwl))*0.5);

  // ---- not yet charted: a blank sheet under the sea mist, with a smoky edge ----
  float fg = max(texture(uFog, wp0/uW).r, uChartAll);
  vec2 q = wp0/340.0;
  float w1 = N4(q*0.8 + vec2(t*0.013, -t*0.011)).x;
  float sm = N4(q*1.7 + w1*1.3 + vec2(-t*0.02, t*0.008)).y*0.65 + N4(q*3.6 - w1).z*0.35;
  float known = smoothstep(0.40, 0.64, fg + sm*0.2);
  vec3 mist = mix(vec3(0.84, 0.86, 0.86), vec3(0.93, 0.93, 0.91), 0.5 + 0.5*sm);
  float grid = max(1.0 - smoothstep(0.0, 1.2*px, abs(fract(wp0.x/1000.0 + 0.5) - 0.5)*1000.0), 1.0 - smoothstep(0.0, 1.2*px, abs(fract(wp0.y/1000.0 + 0.5) - 0.5)*1000.0));
  mist = mix(mist, vec3(0.55, 0.62, 0.66), grid*0.18);
  mist = mix(mist, col, 0.15*(1.0 - rem));
  col = mix(mist, col, known);
  col = mix(col, col*0.9, (1.0 - abs(known - 0.5)*2.0)*0.25);

  // ---- banks of fog, thicker the further out you are ----
  float shade = 0.0;
  col = fogLayer(col, off, 45.0, 520.0, vec2(0.012, 0.004), -0.25, 0.5, 0.55, vec3(0.90, 0.92, 0.92), shade);
  col = fogLayer(col, off, 150.0, 900.0, vec2(0.007, 0.003), 0.1, 0.7, 0.72, vec3(0.86, 0.89, 0.90), shade);
  col = fogLayer(col, off, 380.0, 1500.0, vec2(0.004, 0.002), 0.35, 0.95, 0.88, vec3(0.82, 0.85, 0.87), shade);
  // the Veil, where the sheet runs out
  float rc = length(wp0 - vec2(uW*0.5)) + 380.0*N4(wp0/1100.0 + vec2(t*0.004, 0.0)).x;
  float veil = max(smoothstep(6800.0, 7900.0, rc), 1.0 - smoothstep(0.0, 300.0, min(min(wp0.x, wp0.y), min(uW - wp0.x, uW - wp0.y))));
  col = mix(col, vec3(0.78, 0.81, 0.83) + 0.04*N4(wp0/700.0 + vec2(0.0, t*0.01)).x, veil);

  col += (R4(fc + vec2(7.0, 13.0)).x - 0.5)*0.022;
  vec2 vq = (fc - 0.5*uRes)/uRes.y;
  col *= 1.0 - 0.14*smoothstep(0.45, 1.15, length(vq));
  outC = vec4(col, 1.0);
}`;

const GL = { gl: null, U: {}, tex: {}, scale: 1 };
function initGL(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  GL.gl = gl;
  return !!gl;
}
function setupGL(mask) {
  const gl = GL.gl, U = GL.U;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.bindAttribLocation(prog, 0, 'p'); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  for (const n of ['uT', 'uN', 'uFog', 'uCur', 'uM', 'uRes', 'uCam', 'uBoat', 'uRot', 'uScale', 'uCss', 'uTime', 'uTide', 'uStream', 'uVis', 'uW', 'uHc', 'uChartAll', 'uAtmo']) U[n] = gl.getUniformLocation(prog, n);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  const mk = (unit, ifmt, fmt, type, w, h, data, wrap) => {
    const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, data);
    const wr = wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, wr], [gl.TEXTURE_WRAP_T, wr]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  };
  GL.tex.T = mk(0, gl.RGBA16F, gl.RGBA, gl.FLOAT, R, R, TT);
  GL.tex.N = mk(1, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, NZ, NZ, NOISE, true);
  GL.tex.Fog = mk(2, gl.R8, gl.RED, gl.UNSIGNED_BYTE, FR, FR, fog);
  const cur = new Float32Array(CG * CG * 2); for (let i = 0; i < CG * CG; i++) { cur[i * 2] = CU[i]; cur[i * 2 + 1] = CV[i]; }
  GL.tex.Cur = mk(3, gl.RG16F, gl.RG, gl.FLOAT, CG, CG, cur);
  GL.tex.M = mk(4, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, mask.n, mask.n, mask.data);
  gl.uniform1i(U.uT, 0); gl.uniform1i(U.uN, 1); gl.uniform1i(U.uFog, 2); gl.uniform1i(U.uCur, 3); gl.uniform1i(U.uM, 4);
  gl.uniform1f(U.uW, W);
}
function uploadFog() {
  const gl = GL.gl; gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, GL.tex.Fog);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, FR, FR, gl.RED, gl.UNSIGNED_BYTE, fog);
}
function drawWorld(glc, cssW) {
  const gl = GL.gl, U = GL.U, s = S();
  gl.uniform2f(U.uRes, glc.width, glc.height);
  gl.uniform2f(U.uCam, cam.x + cam.sx, cam.y + cam.sy);
  gl.uniform1f(U.uRot, cam.rot);
  gl.uniform1f(U.uScale, s * glc.width / cssW); gl.uniform1f(U.uCss, s);
  gl.uniform1f(U.uTime, time); gl.uniform1f(U.uTide, tide.level); gl.uniform1f(U.uStream, tide.stream);
  gl.uniform2f(U.uBoat, boat.x, boat.y); gl.uniform1f(U.uVis, visRadius());
  gl.uniform1f(U.uHc, 6000 / s); gl.uniform1f(U.uChartAll, chartAll ? 1 : 0); gl.uniform1f(U.uAtmo, cam.atmo);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/* Settlement and road mask (16 m texels): keeps trees off streets and yards. */
function buildMask() {
  const n = 1024, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
  g.setTransform(n / W, 0, 0, n / W, 0, 0); g.globalCompositeOperation = 'lighter';
  for (const t of towns) {
    const gr = g.createRadialGradient(t.x, t.y, 0, t.x, t.y, t.r * 1.15);
    gr.addColorStop(0, 'rgba(255,0,0,1)'); gr.addColorStop(0.7, 'rgba(255,0,0,.8)'); gr.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(t.x, t.y, t.r * 1.15, 0, TAU); g.fill();
  }
  g.strokeStyle = 'rgb(0,255,0)'; g.lineWidth = 16; g.lineJoin = g.lineCap = 'round';
  for (const r of roads) { g.beginPath(); r.pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); }
  const data = new Uint8Array(g.getImageData(0, 0, n, n).data.buffer.slice(0)); c.width = 1;
  return { n, data };
}
