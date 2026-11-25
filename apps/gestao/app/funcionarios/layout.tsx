import "../cadastros/ingredientes.css";
import { metadadosDoApp } from "../manifesto-do-app";

export const metadata = metadadosDoApp("gestao");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
