const proj = {
    project_number: 'KD260320',
    project_name: '東京製鉄クレーンガーターに伴う...',
    category: '川北',
    client_name: ''
};

const getDisplayClientName = (proj) => {
  if (!proj) return "";
  if (proj.client_name) return proj.client_name;
  if (proj.category === '川北') return '川北';
  if (proj.category === 'bpe') return 'BPE';
  return "";
}

console.log("Result:", getDisplayClientName(proj));
