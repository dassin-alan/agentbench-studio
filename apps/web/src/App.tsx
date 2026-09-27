import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { EvidencePage } from "./pages/EvidencePage";
import { NewRunPage } from "./pages/NewRunPage";
import { ResultPage } from "./pages/ResultPage";
import { RunPage } from "./pages/RunPage";

export default function App() {
  return <BrowserRouter><Routes><Route element={<Layout />}><Route index element={<DashboardPage />} /><Route path="runs/new" element={<NewRunPage />} /><Route path="runs/:id" element={<RunPage />} /><Route path="runs/:id/results" element={<ResultPage />} /><Route path="runs/:id/evidence" element={<EvidencePage />} /></Route></Routes></BrowserRouter>;
}
