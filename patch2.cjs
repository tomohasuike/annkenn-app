const fs = require('fs');
const target = './src/pages/tools/PowerCalc.tsx';
let content = fs.readFileSync(target, 'utf8');

// Fix 1: addLoad initial equipment_type
content = content.replace(
`    setLoads([...loads, { 
      id: generateId(), name: \`新規負荷\${loads.length + 1}\`, kw: 2.2, capacity_kw: 2.2,
      starting_method: 'direct', wireLength: 15, voltageDropLimit: 2,`,
`    setLoads([...loads, { 
      id: generateId(), name: \`新規負荷\${loads.length + 1}\`, kw: 2.2, capacity_kw: 2.2,
      equipment_type: 'motor',
      starting_method: 'direct', wireLength: 15, voltageDropLimit: 2,`
);

// Fix 2: tepcoEvaluation equipment_type
content = content.replace(
`    const engineLoads = calculatedLoads.map(l => ({
        name: l.name,
        capacity_kw: l.kw,
        equipment_type: 'motor',
        is_existing: false, // 契約計算に既存/新設は関係なく全体の受電容量計算`,
`    const engineLoads = calculatedLoads.map(l => ({
        name: l.name,
        capacity_kw: l.kw,
        equipment_type: l.equipment_type || 'motor',
        is_existing: false, // 契約計算に既存/新設は関係なく全体の受電容量計算`
);

// Fix 3: handlePanelSave equipment_type
let res = content.replace(
`              is_existing: false,
              capacity_kw: Number(l.capacity_kw) || 0,
              phase: '3PH',
              starting_method: l.starting_method === 'Y_DELTA' ? 'star_delta' : l.starting_method === 'INVERTER' ? 'inverter' : 'direct',`,
`              is_existing: false,
              equipment_type: l.equipment_type || 'motor',
              capacity_kw: Number(l.capacity_kw) || 0,
              phase: '3PH',
              starting_method: l.starting_method === 'Y_DELTA' ? 'star_delta' : l.starting_method === 'INVERTER' ? 'inverter' : 'direct',`
);

fs.writeFileSync(target, res);
console.log('Patch 2 complete.');
