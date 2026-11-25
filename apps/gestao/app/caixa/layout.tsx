import { metadadosDoApp } from "../manifesto-do-app";
import "../mesas/mesas.css";

export const metadata = metadadosDoApp("caixa");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
