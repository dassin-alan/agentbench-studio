import { Activity, FlaskConical, Github, Plus, ShieldAlert } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";

export function Layout() {
  return <div className="app-shell">
    <aside className="sidebar">
      <Link to="/" className="brand">
        <span className="brand-glyph"><FlaskConical size={20} /></span>
        <span><strong>AgentBench</strong><small>STUDIO / LOCAL</small></span>
      </Link>
      <nav className="side-nav">
        <NavLink to="/" end><Activity size={17} />评测工作台</NavLink>
        <NavLink to="/runs/new"><Plus size={17} />新建评测</NavLink>
      </nav>
      <div className="sidebar-note">
        <ShieldAlert size={16} />
        <p>仅运行你信任的本地项目。启动命令具有当前用户权限。</p>
      </div>
      <span className="repo-hint"><Github size={14} /> Local-first / v1.2</span>
    </aside>
    <main className="main-stage"><Outlet /></main>
  </div>;
}
