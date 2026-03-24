const projects = [
  { id: '1', no: '250712-k01' },
  { id: '2', no: '260314' },
  { id: '3', no: '250712' },
  { id: '4', no: null },
  { id: '5', no: '250712-k02' }
];

const baseGroups = {};
const baseOrder = [];

projects.forEach(p => {
  const no = p.no || '';
  const base = no ? no.split('-')[0] : p.id;
  if (!baseGroups[base]) {
    baseGroups[base] = [];
    baseOrder.push(base);
  }
  baseGroups[base].push(p);
});

const sorted = [];
baseOrder.forEach(base => {
  baseGroups[base].sort((a, b) => (a.no || '').localeCompare(b.no || ''));
  sorted.push(...baseGroups[base]);
});

console.log(sorted.map(s => s.no || s.id));
