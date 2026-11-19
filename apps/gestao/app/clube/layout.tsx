import { metadadosDoApp } from "../manifesto-do-app";
// Janela, listas, cartões e abas iguais aos de Cadastros (mesma base visual, decisão 0012).
import "../cadastros/ingredientes.css";
import "../cadastros/horarios/horarios.css";
import "../cadastros/adicionais/adicionais.css";
import "../cadastros/embalagens/embalagens.css";
import "./clube.css";

export const metadata = metadadosDoApp("gestao");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
