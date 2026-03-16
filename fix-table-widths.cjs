const fs = require('fs')
const path = require('path')

const file = path.resolve('src/pages/ScheduleManagement.tsx')
let code = fs.readFileSync(file, 'utf8')

// Make sure that everywhere we loop over dates to create a td or th, we use cellWidth for style
code = code.replace(/<td\s+key=\{i\}\s+className="([^"]+)"(?!\s+style)/g, '<td key={i} className="$1" style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px`, maxWidth: `${cellWidth}px` }}>')

// The project rows loop over `dates.map((d) => ...` and uses `<td key={format(d, 'yyyy-MM-dd')} ...`
code = code.replace(/<td\s+key=\{format\(d, 'yyyy-MM-dd'\)\}\s+className="([^"]+)"(?!\s+style)/g, '<td key={format(d, \'yyyy-MM-dd\')} className="$1" style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px`, maxWidth: `${cellWidth}px` }}>')

// Also ensure the header th uses maxWidth too
code = code.replace(/style=\{\{ width: \`\$\{cellWidth\}px\`, minWidth: \`\$\{cellWidth\}px\`\}\}/g, 'style={{ width: `${cellWidth}px`, minWidth: `${cellWidth}px`, maxWidth: `${cellWidth}px`}}')

// Let's remove any remaining hardcoded text-[11px] or similar
code = code.replace(/text-\[11px\]/g, 'text-[0.8em]')
code = code.replace(/text-\[10px\]/g, 'text-[0.75em]')

fs.writeFileSync(file, code)
console.log('Table widths and fonts updated')
