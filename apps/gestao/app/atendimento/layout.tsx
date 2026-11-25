import { metadadosDoApp } from "../manifesto-do-app";
import "../mesas/mesas.css";
import "../cadastros/ingredientes.css";
import "./novo-pedido/novo-pedido.css";

export const metadata = metadadosDoApp("atendimento");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
