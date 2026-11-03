// Original ringed particle planet, retained for reuse.
// Parameters match the live particle canvas: N particles, rand(a,b).
function buildSphere(R){
  const out = new Float32Array(N*3), ga = Math.PI*(3-Math.sqrt(5)), nSurf = Math.floor(N*0.8);
  for (let i=0;i<nSurf;i++){
    const y = 1-(i/(nSurf-1))*2, r = Math.sqrt(1-y*y), th = ga*i;
    const rr = R*(Math.random()<0.86 ? rand(0.985,1.015) : rand(0.5,0.97));
    out[i*3] = Math.cos(th)*r*rr; out[i*3+1] = y*rr; out[i*3+2] = Math.sin(th)*r*rr;
  }
  for (let i=nSurf;i<N;i++){ const a = Math.random()*Math.PI*2, rr = R*rand(1.45,1.8); out[i*3]=Math.cos(a)*rr; out[i*3+1]=rand(-1.5,1.5); out[i*3+2]=Math.sin(a)*rr; }
  return out;
}
