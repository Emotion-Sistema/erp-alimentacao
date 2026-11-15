import { metadadosDoApp } from "../manifesto-do-app";
import "./embalagens/embalagens.css";

export const metadata = metadadosDoApp("cadastros");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
