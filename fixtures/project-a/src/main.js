import "./style.css";

const tools = [
  { name: "Cursor", category: "coding", label: "编程", description: "面向工程项目的 AI 代码编辑器。" },
  { name: "GitHub Copilot", category: "coding", label: "编程", description: "在编辑器中提供代码补全与对话。" },
  { name: "Claude Code", category: "coding", label: "编程", description: "理解代码库并执行开发任务。" },
  { name: "Midjourney", category: "creative", label: "创意", description: "通过文本提示生成视觉图像。" },
  { name: "Perplexity", category: "research", label: "研究", description: "带来源引用的智能搜索工具。" },
  { name: "Notion AI", category: "productivity", label: "效率", description: "集成在知识工作空间中的 AI 助手。" }
];

let query = "";
let category = "all";

document.querySelector("#app").innerHTML = `
  <header><div class="mark">AB / A</div><button class="minor" disabled title="此非核心功能将在下一版实现">收藏夹 · 即将开放</button></header>
  <main>
    <section class="intro"><p class="eyebrow">CURATED AI INDEX · 2026</p><h1>AI 工具目录</h1><p>用清晰分类找到适合当前任务的智能工具。</p></section>
    <section class="controls" aria-label="目录筛选">
      <label><span>搜索目录</span><input data-testid="search" type="search" placeholder="搜索 Cursor、Claude..." /></label>
      <div class="categories"><button data-category="all" class="active">全部</button><button data-category="coding" data-testid="category-coding">编程</button><button data-category="creative">创意</button><button data-category="research">研究</button></div>
    </section>
    <section class="grid" data-testid="tool-grid" aria-live="polite"></section>
  </main>
  <dialog data-testid="detail-dialog"><button class="close" aria-label="关闭">×</button><p class="eyebrow">TOOL DETAIL</p><h2></h2><p class="description"></p></dialog>`;

const grid = document.querySelector("[data-testid=tool-grid]");
const dialog = document.querySelector("dialog");

function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function render() {
  const visible = tools.filter((tool) => (category === "all" || tool.category === category) && tool.name.toLowerCase().includes(query.toLowerCase()));
  grid.innerHTML = visible.map((tool, index) => `<article data-testid="tool-card"><span class="index">${String(index + 1).padStart(2, "0")}</span><span class="tag">${tool.label}</span><h2>${tool.name}</h2><p>${tool.description}</p><button data-testid="details-${slug(tool.name)}">查看详情 <span>↗</span></button></article>`).join("");
  grid.querySelectorAll("article button").forEach((button) => button.addEventListener("click", () => {
    const tool = tools.find((item) => button.dataset.testid === `details-${slug(item.name)}`);
    if (!tool) return;
    dialog.querySelector("h2").textContent = tool.name;
    dialog.querySelector(".description").textContent = tool.description;
    dialog.showModal();
  }));
}

document.querySelector("[data-testid=search]").addEventListener("input", (event) => { query = event.target.value; render(); });
document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => {
  category = button.dataset.category;
  document.querySelectorAll("[data-category]").forEach((item) => item.classList.toggle("active", item === button));
  render();
}));
document.querySelector(".close").addEventListener("click", () => dialog.close());
render();
