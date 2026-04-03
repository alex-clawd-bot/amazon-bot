import { loadConfig } from './config.js';
import { AmazonAutomationClient } from './automation.js';

const config = loadConfig();
config.amazonHeadless = false;

const automation = new AmazonAutomationClient(config);

console.log('Opening Amazon sign-in in a real browser...');
console.log('Finish login manually, including 2FA if Amazon asks for it.');
console.log(`Session data will be stored in: ${config.amazonUserDataDir}`);

try {
  const result = await automation.bootstrapLogin();
  console.log('Amazon login session is ready.');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await automation.close().catch(() => {});
}
