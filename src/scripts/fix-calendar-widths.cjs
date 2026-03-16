const fs = require('fs')
const path = require('path')

const file = path.resolve('src/pages/ScheduleManagement.tsx')
let code = fs.readFileSync(file, 'utf8')

// We want to add w-[110px] min-w-[110px] max-w-[110px] to the specific table cells that correspond to dates.
// There are five places:
// 1. the table header <th> 
// 2. vacation pool <td>
// 3. unspecified project <td>
// 4. partner group <td>
// 5. standard project <td>

const widthClass = 'w-[110px] min-w-[110px] max-w-[110px]'

// 1. <th> inside thead
code = code.replace(/<th key=\{i\} className=\{`p-0\.5 border-r border-b-2 border-\[#dee2e6\] text-center align-top bg-\[#eef2f6\]`\}(\s*)>/g, 
  `<th key={i} className={\`p-0.5 border-r border-b-2 border-[#dee2e6] text-center align-top bg-[#eef2f6] ${widthClass}\`} >`)

// 2. <td> inside vacation pool
code = code.replace(/<td key=\{dateStr\} className="p-0\.5 border-r border-b-2 border-\[#c8e6c9\] align-top bg-\[#e8f5e9\]\/50"(\s*)>/g,
  `<td key={dateStr} className="p-0.5 border-r border-b-2 border-[#c8e6c9] align-top bg-[#e8f5e9]/50 ${widthClass}" >`)

// 3. <td> inside generic / unspecified pool
code = code.replace(/<td key=\{dateStr\} className="p-0\.5 border-r border-b-2 border-slate-200 align-top bg-white relative"(\s*)>/g,
  `<td key={dateStr} className="p-0.5 border-r border-b-2 border-slate-200 align-top bg-white relative ${widthClass}" >`)

// 4. <td> inside partner group pool
code = code.replace(/<td key=\{i\} className="p-0\.5 border-r border-b-2 border-\[#e1bee7\] align-top bg-\[#f3e5f5\]\/50"(\s*)>/g,
  `<td key={i} className="p-0.5 border-r border-b-2 border-[#e1bee7] align-top bg-[#f3e5f5]/50 ${widthClass}" >`)

// 5. <td> inside standard projects
code = code.replace(/<td key=\{dateStr\} className="p-0\.5 border-r border-b border-slate-200 align-top group-hover\/row:bg-slate-50 relative transition-colors"(\s*)>/g,
  `<td key={dateStr} className="p-0.5 border-r border-b border-slate-200 align-top group-hover/row:bg-slate-50 relative transition-colors ${widthClass}" >`)

fs.writeFileSync(file, code)
console.log('Calendar width fixed')
