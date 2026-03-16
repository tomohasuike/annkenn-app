const fs = require('fs')
const path = require('path')

const file = path.resolve('src/pages/ScheduleManagement.tsx')
let code = fs.readFileSync(file, 'utf8')

// Reduce paddings in table cells
code = code.replace(/px-3 py-1\.5/g, 'px-1 py-0.5')
code = code.replace(/p-3/g, 'p-1')
code = code.replace(/p-1\.5/g, 'p-0.5')
code = code.replace(/p-2/g, 'p-0.5')

// Reduce paddings in assignment blocks
code = code.replace(/px-2 py-1/g, 'px-1 py-0')
code = code.replace(/gap-2/g, 'gap-0.5')
code = code.replace(/gap-1/g, 'gap-0.5')
code = code.replace(/mb-1/g, 'mb-0.5')
code = code.replace(/h-8/g, 'h-6') // reduce height of empty drop zones

// Decrease widths to compress horizontally
code = code.replace(/width: '280px'/g, "width: '200px'")
code = code.replace(/width: '240px'/g, "width: '180px'")
code = code.replace(/minWidth: '280px'/g, "minWidth: '200px'")
code = code.replace(/maxWidth: '280px'/g, "maxWidth: '200px'")
code = code.replace(/minWidth: '240px'/g, "minWidth: '180px'")

fs.writeFileSync(file, code)
console.log('Compact formatting applied')
