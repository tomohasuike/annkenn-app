const fs = require('fs')
const path = require('path')

const file = path.resolve('src/pages/ScheduleManagement.tsx')
let code = fs.readFileSync(file, 'utf8')

// First, revert cellWidth applied to date columns back to a fixed width or just let it flex.
// Wait, actually `cellWidth` was dynamically replacing the date column widths in the previous step,
// so instead of replacing it with a fixed width, let's just make it a fixed 120px for the daily calendar columns
// or a standard 2rem width perhaps. The user said it's too stretched out before. Let's make the daily columns a bit thinner: '100px'
code = code.replace(/style=\{\{ width: \`\$\{cellWidth\}px\`, minWidth: \`\$\{cellWidth\}px\`, maxWidth: \`\$\{cellWidth\}px\` \}\}/g, '')
code = code.replace(/style=\{\{ width: \`\$\{cellWidth\}px\`, minWidth: \`\$\{cellWidth\}px\`, maxWidth: \`\$\{cellWidth\}px\`\}\}/g, '')

// Next, let's find the headers and rows for the left column which are currently hardcoded to 200px
// and replace them with `cellWidth` dynamically
code = code.replace(/width: '200px'/g, 'width: `${cellWidth}px`')
code = code.replace(/minWidth: '200px'/g, 'minWidth: `${cellWidth}px`')
code = code.replace(/maxWidth: '200px'/g, 'maxWidth: `${cellWidth}px`')

fs.writeFileSync(file, code)
console.log('Project column width fixed')
