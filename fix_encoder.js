const fs = require('fs');
const content = fs.readFileSync('supabase/functions/safety-cron/index.ts', 'utf8');

// Replace all non-ASCII characters with unicode escapes \uXXXX
const asciiContent = content.replace(/[\u0080-\uFFFF]/g, function(ch) {
  return "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).substr(-4);
});

fs.writeFileSync('supabase/functions/safety-cron/index.ts', asciiContent);
console.log("Done");
