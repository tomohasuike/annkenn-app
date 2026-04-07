const inner = "(SELECT id FROM manufacturers WHERE name = '未来工業' LIMIT 1), 'S-10J', 'VE両サドル', 'VE管用両サドル (サイズ10用)', NULL, 'https://dummyimage.com/200x200/cccccc/000.png&text=S-10J', 'https://drive.google.com/file/d/1_I6GkKufTjty5moo9Ba7kWrUsCgFy7i5/view?usp=drive_link', NULL, NULL, NULL";
const regex = /\(SELECT id FROM manufacturers WHERE name = '(.*?)' LIMIT 1\), '(.*?)', '(.*?)', (.*?), (.*?), '(.*?)', '(.*?)', (.*?), (.*?), (.*)/;
console.log(inner.match(regex));
