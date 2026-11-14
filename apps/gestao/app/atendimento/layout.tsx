import { metadadosDoApp } from "../manifesto-do-app";

export const metadata = metadadosDoApp("atendimento");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
