const fs = require('fs')
const file = 'src/pages/ScheduleManagement.tsx'
let code = fs.readFileSync(file, 'utf8')

// Replace text size classes to be relative to em (making the font size slider work)
// These were done by sed, just ensuring they are done.
// code = code.replace(/text-xs/g, 'text-[0.85em]').replace(/text-sm/g, 'text-[0.95em]').replace(/text-\[10px\]/g, 'text-[0.75em]')

// Reduce paddings in table cells
code = code.replace(/px-3 py-1\.5/g, 'px-1 py-0.5')
code = code.replace(/p-3/g, 'p-1')
code = code.replace(/p-1\.5/g, 'p-0.5')
code = code.replace(/p-2/g, 'p-0.5')

// Reduce paddings in assignment blocks
// e.g. px-2 py-1 -> px-1 py-0
code = code.replace(/px-2 py-1/g, 'px-1 py-0')
code = code.replace(/gap-2/g, 'gap-0.5')
code = code.replace(/gap-1/g, 'gap-0.5')
code = code.replace(/mb-1/g, 'mb-0.5')

// Decrease widths to compress horizontally
code = code.replace(/width: '280px'/g, "width: '200px'")
code = code.replace(/minWidth: '280px'/g, "minWidth: '200px'")
code = code.replace(/maxWidth: '280px'/g, "maxWidth: '200px'")

fs.writeFileSync(file, code)
console.log('Compact formatting applied')
