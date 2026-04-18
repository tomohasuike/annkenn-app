import { execSync } from 'child_process';
import fs from 'fs';

try {
  const result = execSync("sips --version").toString();
  console.log(result);
} catch(e) {}
