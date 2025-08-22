import * as path from 'path';
import * as fs from 'fs';

const Mocha = require('mocha');

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true
  });

  const testsRoot = path.resolve(__dirname, '..');

  return new Promise((c, e) => {
    try {
      // Simple file discovery - just add our test file directly
      const testFile = path.resolve(testsRoot, 'suite', 'extension.test.js');
      if (fs.existsSync(testFile)) {
        mocha.addFile(testFile);
      }

      // Run the mocha test
      mocha.run((failures: number) => {
        if (failures > 0) {
          e(new Error(`${failures} tests failed.`));
        } else {
          c();
        }
      });
    } catch (err) {
      console.error(err);
      e(err);
    }
  });
}