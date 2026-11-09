const fs = require('node:fs/promises');
const path = require('node:path');
const tf = require('@tensorflow/tfjs');

const revision = 'df16e7b4ffd0413b07ccf9c4146230d48f711310';
const base = `https://huggingface.co/gaurangdave/mnist_cnn/resolve/${revision}/tfjs_graph_model/`;

async function download(name) {
  const response = await fetch(new URL(name, base));
  if (!response.ok) throw new Error(`Failed to download ${name}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const modelJson = await download('model.json');
  const manifest = JSON.parse(modelJson);
  const shards = manifest.weightsManifest.flatMap(group => group.paths);
  if (shards.some(name => !/^[\w.-]+\.bin$/.test(name))) throw new Error('Unexpected model shard path');
  const buffers = await Promise.all(shards.map(download));
  const weights = Buffer.concat(buffers);
  const model = await tf.loadGraphModel(tf.io.fromMemory({
    modelTopology: manifest.modelTopology,
    weightSpecs: manifest.weightsManifest.flatMap(group => group.weights),
    weightData: weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength),
    format: manifest.format,
    signature: manifest.signature,
  }));
  const input = tf.zeros([1, 28, 28, 1]);
  const result = model.predict(input);
  const outputs = Array.isArray(result) ? result : [result];
  const values = await outputs[0].data();
  if (outputs.length !== 1 || values.length !== 10 || !Array.from(values).every(Number.isFinite)) {
    throw new Error('Model inference did not produce 10 finite values');
  }
  input.dispose(); outputs.forEach(output => output.dispose()); model.dispose();
  console.log('Model loaded and inference returned 10 finite values.');

  await fs.mkdir('public/model', { recursive: true });
  await fs.writeFile('public/model/model.json', modelJson);
  await Promise.all(shards.map((name, i) => fs.writeFile(path.join('public/model', name), buffers[i])));
  await fs.copyFile('styles.css', 'public/styles.css');
  await fs.copyFile('node_modules/@tensorflow/tfjs/dist/tf.min.js', 'public/tf.min.js');
  const html = await fs.readFile('index.html', 'utf8');
  const app = await fs.readFile('app.js', 'utf8');
  const cdn = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
  const originalModel = 'https://huggingface.co/gaurangdave/mnist_cnn/resolve/main/tfjs_graph_model/model.json';
  if (!html.includes(cdn) || !app.includes(originalModel)) throw new Error('Expected asset URLs not found');
  await fs.writeFile('public/index.html', html.replace(cdn, './tf.min.js'));
  await fs.writeFile('public/app.js', app.replace(originalModel, './model/model.json'));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
