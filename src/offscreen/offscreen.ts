import { SandboxClient } from '../shared/sandboxProtocol';

const sandbox = new SandboxClient();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target !== 'offscreen' || sender.id !== chrome.runtime.id) return;
  sandbox.request({ op: 'check', pac: String(msg.pac) }).then(sendResponse);
  return true;
});
