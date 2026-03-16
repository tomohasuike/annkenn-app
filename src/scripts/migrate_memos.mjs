import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateMemosAndTodos() {
  const content = fs.readFileSync('/Users/hasuiketomoo/Downloads/工程管理アプリ - AppData.csv', 'utf-8');
  const matches = content.match(/"({.*?})"/g);
  if (!matches || matches.length < 3) return console.error("Could not parse JSON blocks");
  
  const customResStr = matches[2].slice(1, -1).replace(/""/g, '"');
  const metaObj = JSON.parse(customResStr);

  const memoContent = metaObj.memos || '';
  const todos = metaObj.todos || [];

  console.log("Extracted Memo:", memoContent);
  console.log("Extracted Todos:", todos);

  // Update Global Memo
  if (memoContent) {
    const { data: existingMemo } = await supabase.from('global_memos').select('*').limit(1).maybeSingle();
    
    if (existingMemo) {
      const { error } = await supabase.from('global_memos').update({ content: memoContent }).eq('id', existingMemo.id);
      if (error) console.error("Error updating memo:", error);
      else console.log("Memo updated!");
    } else {
      const { error } = await supabase.from('global_memos').insert({ content: memoContent });
      if (error) console.error("Error inserting memo:", error);
      else console.log("Memo inserted!");
    }
  }

  // Insert Todos
  if (todos.length > 0) {
    // Assuming legacy todos just have text and maybe completed status
    const formattedTodos = todos.map(t => ({
      text: typeof t === 'string' ? t : t.text || t.title,
      completed: typeof t === 'string' ? false : t.completed || false
    }));
    const { error } = await supabase.from('todos').insert(formattedTodos);
    if (error) console.error("Error inserting todos:", error);
    else console.log(`Inserted ${formattedTodos.length} todos!`);
  } else {
    console.log("No legacy todos found.");
  }

}

migrateMemosAndTodos();
