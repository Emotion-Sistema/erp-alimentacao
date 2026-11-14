import { metadadosDoApp } from "../manifesto-do-app";

export const metadata = metadadosDoApp("entregas");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
