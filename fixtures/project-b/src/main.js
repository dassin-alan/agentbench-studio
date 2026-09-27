import "./style.css";

const tools = [
  ["Cursor","coding","代码编辑"],["GitHub Copilot","coding","智能补全"],["Claude Code","coding","终端 Agent"],
  ["Midjourney","creative","图像生成"],["Perplexity","research","智能检索"],["Notion AI","productivity","知识工作"]
];

document.querySelector("#app").innerHTML = `<div class="orb orb-a"></div><div class="orb orb-b"></div><nav><strong>CATALOG<span>/AI</span></strong><span>EXPLORE · 006</span></nav><main><section class="hero"><p>THE INTELLIGENCE TOOL MAP</p><h1>AI 工具目录</h1><div class="search"><input data-testid="search" placeholder="输入工具名称"><kbd>⌘ K</kbd></div></section><div class="filters"><button data-category="all" class="active">ALL</button><button data-category="coding" data-testid="category-coding">CODING</button><button data-category="creative">CREATIVE</button><button data-category="research">RESEARCH</button></div><section class="cards" data-testid="tool-grid"></section></main>`;
const grid=document.querySelector("[data-testid=tool-grid]");
let category="all";let query="";
const slug=(value)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
function render(){const rows=tools.filter((tool)=>(category==="all"||tool[1]===category)&&tool[0].toLowerCase().includes(query.toLowerCase()));grid.innerHTML=rows.map((tool,index)=>`<article data-testid="tool-card"><div class="number">0${index+1}</div><div class="glyph">${tool[0].slice(0,2).toUpperCase()}</div><p>${tool[2]}</p><h2>${tool[0]}</h2><button data-testid="details-${slug(tool[0])}">OPEN PROFILE <span>↗</span></button></article>`).join("")}
document.querySelector("[data-testid=search]").addEventListener("input",(event)=>{query=event.target.value;render()});
document.querySelectorAll("[data-category]").forEach((button)=>button.addEventListener("click",()=>{category=button.dataset.category;document.querySelectorAll("[data-category]").forEach((item)=>item.classList.toggle("active",item===button));render()}));
render();
console.error("[Project B demo] Tool detail module failed to initialize");
