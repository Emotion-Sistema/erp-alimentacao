import { metadadosDoApp } from "../manifesto-do-app";
import "./producao.css";

export const metadata = metadadosDoApp("producao");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
