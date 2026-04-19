import React from "react";
import { NavLink } from "react-router-dom";

export default function HeaderBar() {
  return (
    <header className="header-bar">
      <div className="header-title">桌面文件助手</div>
      <nav className="header-nav">
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}>
          会话
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `nav-item ${isActive ? "is-active" : ""}`}>
          历史查询
        </NavLink>
      </nav>
    </header>
  );
}
