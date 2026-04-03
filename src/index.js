import { loadConfig } from './config.js';
import { FileStore } from './store.js';
import { createAmazonProvider } from './providers/amazon.js';
import { createBitrefillClient } from './bitrefill.js';
import { createServer } from './server.js';

const config = loadConfig();
const store = new FileStore(config.dataFile);
await store.init();

const amazonProvider = createAmazonProvider(config);
const bitrefillClient = createBitrefillClient(config);
const server = createServer({ config, store, amazonProvider, bitrefillClient });

server.listen(config.port, () => {
  console.log(`amazon backend listening on http://localhost:${config.port}`);
});
