import { metadadosDoApp } from "../manifesto-do-app";

export const metadata = metadadosDoApp("financeiro");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
