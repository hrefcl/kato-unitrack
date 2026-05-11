import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import "./styles.css";
import { App } from "./App";
import { CatalogPage } from "./pages/CatalogPage";
import { InventoryPage } from "./pages/InventoryPage";
import { EditorPage } from "./pages/EditorPage";
import { GeneratorPage } from "./pages/GeneratorPage";
import { LayoutsPage } from "./pages/LayoutsPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<App />}>
          <Route index element={<Navigate to="/editor" replace />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/generator" element={<GeneratorPage />} />
          <Route path="/layouts" element={<LayoutsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
