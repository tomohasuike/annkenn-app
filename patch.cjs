const fs = require('fs');

const target = './src/pages/tools/PowerCalc.tsx';
let content = fs.readFileSync(target, 'utf8');

// Chunk 1: engineLoad.equipment_type
content = content.replace(
`      const engineLoad: CalcLoad = {
        name: load.name,
        capacity_kw: load.kw,
        equipment_type: 'motor',
        starting_method: load.starting_method,`,
`      const engineLoad: CalcLoad = {
        name: load.name,
        capacity_kw: load.kw,
        equipment_type: load.equipment_type || 'motor',
        starting_method: load.starting_method,`
);

// Chunk 2: table <td> for equipment_type and heater handler
content = content.replace(
`                          <option value="alt_D">交互 (Group D)</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select 
                          value={load.starting_method}
                          onChange={(e) => updateLoad(load.id as string, 'starting_method', e.target.value as any)}
                          className="bg-slate-50 dark:bg-slate-800 border-0 text-[11px] font-bold text-slate-700 dark:text-slate-300 rounded-lg px-2 py-1 cursor-pointer w-full h-7"
                        >
                          <option value="direct">直入(IK)</option>
                          <option value="star_delta">Y-Δ(YD)</option>
                          <option value="inverter">ｲﾝﾊﾞｰﾀ(IC)</option>
                        </select>
                      </td>`,
`                          <option value="alt_D">交互 (Group D)</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <select 
                          value={load.equipment_type || 'motor'}
                          onChange={(e) => updateLoad(load.id as string, 'equipment_type', e.target.value)}
                          className={\`bg-slate-100 dark:bg-slate-800 border-0 text-[11px] font-bold rounded-lg px-2 py-1 w-full cursor-pointer h-7 \${
                            load.equipment_type === 'heater' ? 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-900/40' : 'text-slate-700 dark:text-slate-300'
                          }\`}
                        >
                          <option value="motor">モーター</option>
                          <option value="heater">ヒーター</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        {load.equipment_type === 'heater' ? (
                          <div className="text-center text-slate-400 dark:text-slate-500 font-bold text-[11px] h-7 flex items-center justify-center">-</div>
                        ) : (
                          <select 
                            value={load.starting_method}
                            onChange={(e) => updateLoad(load.id as string, 'starting_method', e.target.value as any)}
                            className="bg-slate-50 dark:bg-slate-800 border-0 text-[11px] font-bold text-slate-700 dark:text-slate-300 rounded-lg px-2 py-1 cursor-pointer w-full h-7"
                          >
                            <option value="direct">直入(IK)</option>
                            <option value="star_delta">Y-Δ(YD)</option>
                            <option value="inverter">ｲﾝﾊﾞｰﾀ(IC)</option>
                          </select>
                        )}
                      </td>`
);

// Chunk 3: button label
content = content.replace(
`                モーター負荷を追加
              </button>`,
`                機器を追加
              </button>`);

fs.writeFileSync(target, content);
console.log('Patch complete.');
