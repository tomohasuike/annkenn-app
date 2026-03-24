import fs from 'fs';
const file = 'src/pages/ScheduleManagement.tsx';
let txt = fs.readFileSync(file, 'utf8');

const target = `                        // Filter projects for non-admins: only show those with data
                        if (!isAdmin) {
                          const hasData = dates.some(d => {
                            const dStr = format(d, 'yyyy-MM-dd')
                            const asg = getAssignmentsForCell(p.id, dStr)
                            const daily = dailyData.find(dd => dd.project_id === p.id && dd.target_date === dStr)
                            return asg.length > 0 || !!daily?.planned_count || !!daily?.comment
                          })
                          if (!hasData) return null;
                        }`;
const replace = `                        // 一般ユーザーでも空のプロジェクトを表示して予定人員や車両を入力可能にする`;

txt = txt.replace(target, replace);
txt = txt.replace(target.replace(/\\n/g, '\\r\\n'), replace.replace(/\\n/g, '\\r\\n')); // Fallback CRLF
fs.writeFileSync(file, txt);
console.log('Mobile hiding filter removed');
