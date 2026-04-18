import { supabase } from '../lib/supabase';

// 再帰的にノードを作成しつつ、DBに保存する処理
export async function processAiBatchImport(
  projectId: string,
  jsonNodes: any[],
  parentId: string | null = null,
  currentLevel = 0
): Promise<any[]> {
  const resultNodes = [];

  for (const jsNode of jsonNodes) {
    const newNodeId = crypto.randomUUID();
    
    // 1. ノード自体の初期化
    const node: any = {
      id: newNodeId,
      type: jsNode.type || (currentLevel === 0 ? 'root_cubicle' : 'power'),
      name: jsNode.name || '名称未設定',
      isExpanded: true,
      demandFactor: jsNode.demandFactor || 100,
      totalKw: 0, // Loadsから算出
      kw: 0,
      df: jsNode.demandFactor || 100,
      mainBreakerA: jsNode.mainBreakerA || 100,
      parentFeederBreakerA: jsNode.parentFeederBreakerA || 100,
      wireIw: jsNode.wireIw || 100,
      lengthM: jsNode.lengthM || 10,
      children: [],
    };

    let panelId: string | null = null;

    // 2. もし電力盤（power/lighting）ならDB `calc_panels` に登録
    if (node.type === 'power' || node.type === 'lighting') {
      const { data: panelData, error: panelError } = await supabase
        .from('calc_panels')
        .insert({
          project_id: projectId,
          name: node.name,
          panel_type: node.type.toUpperCase(),
          voltage_system: node.type === 'power' ? '3Φ3W 200V' : '1Φ3W 100/200V',
          tree_node_id: newNodeId // 最重要: ここでツリー連携
        })
        .select()
        .single();
      
      if (panelError) throw new Error(`盤の作成に失敗しました(${node.name}): ` + panelError.message);
      panelId = panelData.id;
    }

    // 3. 負荷回路(loads)があれば、それをDBへInsert
    if (panelId && jsNode.loads && Array.isArray(jsNode.loads) && jsNode.loads.length > 0) {
      let currentKw = 0;
      
      const insertLoads = jsNode.loads.map((load: any, i: number) => {
        const kw = Number(load.capacity_kw || load.kw || 0);
        currentKw += kw;
        return {
          panel_id: panelId,
          circuit_no: i + 1,
          name: load.name,
          capacity_kw: kw,
          phase: node.type === 'lighting' ? (['U', 'V', 'W'][i % 2]) : 'R', // 適当な相
          starting_method: 'DIRECT'
        };
      });

      const { error: loadError } = await supabase
        .from('calc_loads')
        .insert(insertLoads);
        
      if (loadError) throw new Error(`負荷の作成に失敗しました(${node.name}): ` + loadError.message);
      
      node.totalKw = currentKw;
      node.kw = currentKw;
    }

    // 4. 子ノードがあれば再帰
    if (jsNode.children && Array.isArray(jsNode.children) && jsNode.children.length > 0) {
      node.children = await processAiBatchImport(projectId, jsNode.children, newNodeId, currentLevel + 1);
    }

    resultNodes.push(node);
  }

  return resultNodes;
}
