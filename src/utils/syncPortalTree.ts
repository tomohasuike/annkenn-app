import { supabase } from '../lib/supabase';

const generateId = () => crypto.randomUUID();

interface TreeNode {
  id: string;
  name: string;
  type: string;
  totalKw: number;
  demandFactor: number;
  mainBreakerA: number;
  parentFeederBreakerA?: number;
  wireIw: number;
  lengthM: number;
  isExpanded: boolean;
  children: TreeNode[];
  [key: string]: any;
}

/**
 * ポータルのSITE_TREEを取得し、新しい盤ノードを追加してtree_node_idを返す。
 * ポータルが未作成の場合はnullを返す（エラーにしない）。
 */
export async function addBoardToPortalTree(params: {
  projectId: string;
  boardName: string;
  panelType: 'POWER' | 'LIGHTING';
}): Promise<string | null> {
  const { projectId, boardName, panelType } = params;

  try {
    const { data: treeRecord } = await supabase
      .from('site_tools_data')
      .select('id, data_payload')
      .eq('project_id', projectId)
      .eq('tool_type', 'SITE_TREE')
      .maybeSingle();

    if (!treeRecord || !treeRecord.data_payload?.root) {
      return null;
    }

    const newNodeId = generateId();
    const root: TreeNode = treeRecord.data_payload.root;

    const newNode: TreeNode = {
      id: newNodeId,
      name: boardName,
      type: panelType === 'POWER' ? 'power' : 'lighting',
      totalKw: 0,
      demandFactor: 100,
      mainBreakerA: 100,
      wireIw: 76,
      lengthM: 5,
      isExpanded: true,
      children: [],
    };

    const updatedRoot = insertNodeIntoTree(root, newNode);

    const { error } = await supabase
      .from('site_tools_data')
      .update({ data_payload: { ...treeRecord.data_payload, root: updatedRoot } })
      .eq('id', treeRecord.id);

    if (error) {
      console.error('ポータルツリー更新エラー:', error);
      return null;
    }

    return newNodeId;
  } catch (e) {
    console.error('syncPortalTree エラー:', e);
    return null;
  }
}

/**
 * root_main_lvノードがあればその子に追加、なければroot_cubicle直下に追加
 */
function insertNodeIntoTree(root: TreeNode, newNode: TreeNode): TreeNode {
  const mainLv = root.children.find(c => c.type === 'root_main_lv');
  if (mainLv) {
    return {
      ...root,
      isExpanded: true,
      children: root.children.map(c =>
        c.type === 'root_main_lv'
          ? { ...c, isExpanded: true, children: [...c.children, newNode] }
          : c
      ),
    };
  }
  return {
    ...root,
    isExpanded: true,
    children: [...root.children, newNode],
  };
}

/**
 * ポータルのSITE_TREEのノードID一覧を取得（後付け紐付けUI用）
 */
export async function fetchPortalTreeNodes(projectId: string): Promise<{ id: string; name: string; type: string }[]> {
  const { data: treeRecord } = await supabase
    .from('site_tools_data')
    .select('data_payload')
    .eq('project_id', projectId)
    .eq('tool_type', 'SITE_TREE')
    .maybeSingle();

  if (!treeRecord?.data_payload?.root) return [];

  const nodes: { id: string; name: string; type: string }[] = [];
  const collect = (node: TreeNode) => {
    if (node.type === 'power' || node.type === 'lighting') {
      nodes.push({ id: node.id, name: node.name, type: node.type });
    }
    node.children.forEach(collect);
  };
  collect(treeRecord.data_payload.root);
  return nodes;
}

/**
 * 親になれるノード（root_cubicle, root_main_lv, power, lighting）の一覧を取得
 */
export async function fetchParentNodes(projectId: string): Promise<{ id: string; name: string; type: string; depth: number }[]> {
  const { data: treeRecord } = await supabase
    .from('site_tools_data')
    .select('data_payload')
    .eq('project_id', projectId)
    .eq('tool_type', 'SITE_TREE')
    .maybeSingle();

  if (!treeRecord?.data_payload?.root) return [];

  const nodes: { id: string; name: string; type: string; depth: number }[] = [];
  const collect = (node: TreeNode, depth: number) => {
    nodes.push({ id: node.id, name: node.name, type: node.type, depth });
    node.children.forEach(c => collect(c, depth + 1));
  };
  collect(treeRecord.data_payload.root, 0);
  return nodes;
}

/**
 * ツリー内の指定ノードを別の親の下に移動する。
 * targetNodeId: 移動させるノードのID
 * newParentId: 新しい親ノードのID
 */
export async function moveNodeToNewParent(params: {
  projectId: string;
  targetNodeId: string;
  newParentId: string;
}): Promise<boolean> {
  const { projectId, targetNodeId, newParentId } = params;

  try {
    const { data: treeRecord } = await supabase
      .from('site_tools_data')
      .select('id, data_payload')
      .eq('project_id', projectId)
      .eq('tool_type', 'SITE_TREE')
      .maybeSingle();

    if (!treeRecord?.data_payload?.root) return false;

    const root: TreeNode = treeRecord.data_payload.root;

    // 対象ノードを取り出す
    let extracted: TreeNode | null = null;
    const removeNode = (node: TreeNode): TreeNode => {
      const filtered = node.children.filter(c => {
        if (c.id === targetNodeId) { extracted = c; return false; }
        return true;
      }).map(c => removeNode(c));
      return { ...node, children: filtered };
    };

    const rootWithout = removeNode(root);
    if (!extracted) return false;

    // 新しい親の下に挿入
    const insertNode = (node: TreeNode): TreeNode => {
      if (node.id === newParentId) {
        return { ...node, isExpanded: true, children: [...node.children, extracted!] };
      }
      return { ...node, children: node.children.map(c => insertNode(c)) };
    };

    const updatedRoot = insertNode(rootWithout);

    const { error } = await supabase
      .from('site_tools_data')
      .update({ data_payload: { ...treeRecord.data_payload, root: updatedRoot } })
      .eq('id', treeRecord.id);

    return !error;
  } catch (e) {
    console.error('moveNodeToNewParent エラー:', e);
    return false;
  }
}
