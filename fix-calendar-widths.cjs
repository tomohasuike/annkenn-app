const fs = require('fs')
const path = require('path')

const file = path.resolve('src/pages/ScheduleManagement.tsx')
let code = fs.readFileSync(file, 'utf8')

// Looking for th and td inside dates.map
code = code.replace(/<th key=\{i\} className={`p-0.5 border-r border-b-2 border-\[#dee2e6\] text-center align-top bg-\[#eef2f6\]`} >/g, 
  '<th key={i} className={`p-0.5 border-r border-b-2 border-[#dee2e6] text-center align-top bg-[#eef2f6] w-[120px] min-w-[120px] max-w-[120px]`} >')

code = code.replace(/<td key=\{dateStr\} className="p-0.5 border-r border-b-2 border-\[#c8e6c9\] align-top bg-\[#e8f5e9\]\/50" >/g,
  '<td key={dateStr} className="p-0.5 border-r border-b-2 border-[#c8e6c9] align-top bg-[#e8f5e9]/50 w-[120px] min-w-[120px] max-w-[120px]" >')

code = code.replace(/<td key=\{dateStr\} className="p-0.5 border-r border-b-2 border-slate-200 align-top bg-white relative" >/g,
  '<td key={dateStr} className="p-0.5 border-r border-b-2 border-slate-200 align-top bg-white relative w-[120px] min-w-[120px] max-w-[120px]" >')

code = code.replace(/<td key=\{i\} className="p-0.5 border-r border-b-2 border-\[#e1bee7\] align-top bg-\[#f3e5f5\]\/50" >/g,
  '<td key={i} className="p-0.5 border-r border-b-2 border-[#e1bee7] align-top bg-[#f3e5f5]/50 w-[120px] min-w-[120px] max-w-[120px]" >')

code = code.replace(/<td key=\{dateStr\} className="p-0.5 border-r border-b border-slate-200 align-top group-hover\/row:bg-slate-50 relative transition-colors" >/g,
  '<td key={dateStr} className="p-0.5 border-r border-b border-slate-200 align-top group-hover/row:bg-slate-50 relative transition-colors w-[120px] min-w-[120px] max-w-[120px]" >')

fs.writeFileSync(file, code)
console.log('Calendar calendar fixed')
