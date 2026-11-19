import { metadadosDoApp } from "../manifesto-do-app";
import "./embalagens/embalagens.css";
import "./ingredientes.css";
import "./horarios/horarios.css";
import "./produtos/produtos.css";
import "./adicionais/adicionais.css";
import "./importar/importar.css";

export const metadata = metadadosDoApp("cadastros");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
