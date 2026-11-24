import { metadadosDoApp } from "../manifesto-do-app";
// As telas do estoque usam as mesmas peças das de cadastros (seções, abas, janela, importar).
import "../cadastros/horarios/horarios.css";
import "../cadastros/ingredientes.css";
import "../cadastros/importar/importar.css";
import "./estoque.css";

export const metadata = metadadosDoApp("estoque");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
