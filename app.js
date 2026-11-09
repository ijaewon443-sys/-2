const MODEL_URL = 'https://huggingface.co/gaurangdave/mnist_cnn/resolve/main/tfjs_graph_model/model.json';
const canvas = document.querySelector('#drawCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const clearButton = document.querySelector('#clearButton');
const predictButton = document.querySelector('#predictButton');
const errorMessage = document.querySelector('#errorMessage');
const statusDot = document.querySelector('#statusDot');
const modelStatus = document.querySelector('#modelStatus');
const predictionValue = document.querySelector('#predictionValue');
const confidenceText = document.querySelector('#confidenceText');
let model = null;
let drawing = false;
let hasInk = false;

function showError(message) { errorMessage.textContent = message; errorMessage.hidden = false; statusDot.className = 'status-dot error'; }
function clearError() { errorMessage.hidden = true; }
function resetCanvas() { ctx.fillStyle = '#0d0e0c'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 20; ctx.strokeStyle = '#fff'; hasInk = false; canvas.parentElement.querySelector('.canvas-hint').style.opacity = '1'; }
function point(event) { const rect = canvas.getBoundingClientRect(); return { x:(event.clientX-rect.left)*canvas.width/rect.width, y:(event.clientY-rect.top)*canvas.height/rect.height }; }
canvas.addEventListener('pointerdown', event => { drawing = true; canvas.setPointerCapture(event.pointerId); const p=point(event); ctx.beginPath(); ctx.moveTo(p.x,p.y); ctx.lineTo(p.x+.1,p.y+.1); ctx.stroke(); hasInk=true; canvas.parentElement.querySelector('.canvas-hint').style.opacity='0'; });
canvas.addEventListener('pointermove', event => { if(!drawing) return; const p=point(event); ctx.lineTo(p.x,p.y); ctx.stroke(); });
['pointerup','pointercancel','pointerleave'].forEach(type => canvas.addEventListener(type, () => { drawing=false; }));
clearButton.addEventListener('click', () => { resetCanvas(); predictionValue.textContent='—'; confidenceText.textContent='숫자를 그린 뒤 인식 버튼을 눌러보세요.'; document.querySelectorAll('.bar i').forEach(bar => bar.style.width='0'); });
function normalizedTensor() {
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
  for (let y=0;y<canvas.height;y++) for (let x=0;x<canvas.width;x++) if (pixels[(y*canvas.width+x)*4]>20) {
    minX=Math.min(minX,x); minY=Math.min(minY,y); maxX=Math.max(maxX,x); maxY=Math.max(maxY,y);
  }
  if (maxX<0) throw new Error('먼저 캔버스에 숫자를 그려주세요.');
  const w=maxX-minX+1,h=maxY-minY+1,scale=20/Math.max(w,h);
  const small=document.createElement('canvas'); small.width=small.height=28;
  const c=small.getContext('2d'); c.fillStyle='#000';c.fillRect(0,0,28,28);
  c.drawImage(canvas,minX,minY,w,h,(28-w*scale)/2,(28-h*scale)/2,w*scale,h*scale);
  return tf.browser.fromPixels(small,1).toFloat().reshape([1,28,28,1]);
}
predictButton.addEventListener('click', async () => { clearError(); if(!model) return showError('학습 모델을 아직 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'); let input; try { predictButton.disabled=true; predictButton.textContent='분석 중…'; input=normalizedTensor(); const output=model.predict(input); const probabilities=Array.isArray(output)?output[0]:output; const values=await probabilities.data(); const max=Math.max(...values); const digit=values.indexOf(max); predictionValue.textContent=digit; confidenceText.textContent=`${(max*100).toFixed(1)}% 확률로 ${digit}이라고 예측했어요.`; values.forEach((value,index)=>{const row=document.querySelector(`[data-digit="${index}"]`);row.classList.toggle('top',index===digit);row.querySelector('i').style.width=`${(value*100).toFixed(1)}%`;row.querySelector('b').textContent=`${(value*100).toFixed(1)}%`;}); if(Array.isArray(output)) output.forEach(t=>t.dispose()); else output.dispose(); } catch(error) { showError(`인식에 실패했습니다: ${error.message}`); } finally { if(input) input.dispose(); predictButton.disabled=false; predictButton.innerHTML='숫자 인식 <span>→</span>'; } });
function createProbabilityRows(){document.querySelector('#probabilities').innerHTML=Array.from({length:10},(_,i)=>`<div class="prob-row" data-digit="${i}"><span>${i}</span><div class="bar"><i></i></div><b>0.0%</b></div>`).join('');}
async function loadModel(){ try { if(!window.tf) throw new Error('TensorFlow.js가 로드되지 않았습니다.'); await tf.ready(); model=await tf.loadGraphModel(MODEL_URL); modelStatus.textContent='모델 준비 완료'; statusDot.className='status-dot ready'; predictButton.disabled=false; } catch(error) { modelStatus.textContent='모델 로드 실패'; showError('학습 모델을 불러오지 못했습니다. 인터넷 연결과 모델 주소를 확인해주세요.'); console.error(error); } }
createProbabilityRows(); resetCanvas(); loadModel();
