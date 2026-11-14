import { paginaDoItem } from "../pagina-do-item";

export const dynamic = "force-dynamic";

export default function Pagina() {
  return paginaDoItem(
    "producao",
    "/producao",
    "a visão geral de tudo o que está na fila, em preparo e pronto, para quem só acompanha.",
    <p>
      A equipe da cozinha trabalha no tablet da estação, que abre na tela /estacao do próprio aparelho. Quem só
      acompanha verá a visão geral aqui na etapa E14.
    </p>,
  );
}
