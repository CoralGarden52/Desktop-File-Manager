import React from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import HeaderBar from "./components/HeaderBar";
import ChatPage from "./pages/ChatPage";
import HistoryPage from "./pages/HistoryPage";

export default function App() {
  return (
    <HashRouter>
      <div className="shell">
        <HeaderBar />
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
